import { invoke } from "@tauri-apps/api/core";
import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DEFAULT_DIVINITY_ROOT, DEFAULT_EXPORT, DEFAULT_REALMZ_DATA_ROOT, DEFAULT_WORKSPACE } from "./editor/constants";
import { CloseProjectDialog, ProjectNameDialog, ProjectStart } from "./editor/app/AppStart";
import {
  isPaintableSpecialLandLibraryAsset,
  isProjectEmpty,
  mapIdForEntity,
  nextMapFocusNonce,
  playerMapMarkerIconIds
} from "./editor/app/appUtils";
import { useAssetActions } from "./editor/app/useAssetActions";
import { useAppBootstrapEffects } from "./editor/app/useAppBootstrapEffects";
import { useProjectLifecycleActions } from "./editor/app/useProjectLifecycleActions";
import { DraftChangeGuardProvider, useDraftChangeGuardController } from "./editor/app/draftChangeGuard";
import { canUseBrowserFileSystem } from "./editor/browser/fsAccess";
import {
  PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES,
  referencedMapIconIds,
  tileIconCandidates
} from "./editor/map/renderValues";
import { clampCell, tileValueAt } from "./editor/map/geometry";
import { editorReducer, initialEditorState, BROWSER_PREVIEW_STATUS } from "./editor/store";
import { ActiveWorkbench, AssetSearchHint, EditorTab, MapCoordinateTarget, MapEntity, MapRecord, MapViewFlag, ProjectCommand, SelectedEntity } from "./editor/types";
import { hasDesktopRuntime, issuesFor, selectEntityFromId } from "./editor/utils";
import {
  extraActionPointClassification,
  semanticMapRecordsForMap,
  semanticRandomLevelForMap,
  semanticTilesetForMap,
  semanticTriggersForMap
} from "./editor/semanticGraph";
import { ProvidenceEditorShell } from "./editor/workbench/ProvidenceEditorShell";
import { WorkbenchRouter } from "./editor/workbench/WorkbenchRouter";
import { GlobalSearchDialog } from "./editor/workbench/GlobalSearchDialog";
import { DivinityManualWindow } from "./editor/views/DivinityManualWindow";
import { GlobalSearchResult } from "./editor/globalSearch";
import {
  LazyDocumentsView as DocumentsView,
  WorkbenchChunkErrorBoundary,
  WorkbenchLoading
} from "./editor/workbench/LazyWorkbenchPanels";

const DEFAULT_SCENARIO_ROOT = "";
const DEFAULT_PROJECT_ROOT = "projects";
const DEFAULT_EXPORT_ROOT = "exports";

type DefaultStoragePaths = {
  appDataDir: string;
  projectRoot: string;
  workspaceDir: string;
  exportRoot: string;
};

type WorkbenchHistoryLocation = {
  key: string;
  workbench: ActiveWorkbench;
  domain: EditorTab;
  editor: string;
  selectedEntity: SelectedEntity | null;
  selectedMapId: string | null;
  selectedCell: { x: number; y: number; tile: number } | null;
};

function workbenchHistorySelectionKey(
  domain: EditorTab,
  selectedEntity: SelectedEntity | null,
  selectedMapId: string | null,
  selectedCell: { x: number; y: number; tile: number } | null
) {
  if (selectedEntity) return selectedEntity.id;
  if (domain === "maps" && selectedMapId) {
    if (selectedCell) return `${selectedMapId}:${selectedCell.x}:${selectedCell.y}`;
    return selectedMapId;
  }
  return "";
}

function importedMapIconCacheKey(project: { source: { sourcePath: string }; maps: MapEntity[] }) {
  return [
    project.source.sourcePath,
    project.maps.length,
    project.maps.map((map) => `${map.id}:${map.width}x${map.height}`).join("|")
  ].join("::");
}

export function App() {
  const desktopRuntime = hasDesktopRuntime();
  const browserFileSystem = !desktopRuntime && canUseBrowserFileSystem();
  const [storagePaths, setStoragePaths] = useState<DefaultStoragePaths>({
    appDataDir: "",
    projectRoot: DEFAULT_PROJECT_ROOT,
    workspaceDir: DEFAULT_WORKSPACE,
    exportRoot: DEFAULT_EXPORT_ROOT
  });
  const [workspaceDir, setWorkspaceDir] = useState(DEFAULT_WORKSPACE);
  const [projectDir, setProjectDir] = useState("");
  const [exportDir, setExportDir] = useState(DEFAULT_EXPORT);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [closeProjectDialogOpen, setCloseProjectDialogOpen] = useState(false);
  const [closeProjectSaving, setCloseProjectSaving] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [divinityManualOpen, setDivinityManualOpen] = useState(false);
  const [divinityManualHref, setDivinityManualHref] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [assetSearchHint, setAssetSearchHint] = useState<AssetSearchHint | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("Untitled Scenario");
  const [state, dispatch] = useReducer(editorReducer, desktopRuntime, initialEditorState);
  const draftGuard = useDraftChangeGuardController();
  const importedMapIconCacheRef = useRef<{ key: string; ids: number[] }>({ key: "", ids: [] });
  const historyNavigationRef = useRef(false);
  const selectedEntityId = state.selectedEntity?.id ?? "";
  const selectedCellKey = state.selectedCell ? `${state.selectedCell.x}:${state.selectedCell.y}:${state.selectedCell.tile}` : "";
  const activeWorkbenchLocation = useMemo<WorkbenchHistoryLocation>(() => {
    const selectionKey = workbenchHistorySelectionKey(
      state.activeDomain,
      state.selectedEntity,
      state.selectedMapId,
      state.selectedCell
    );
    return {
      key: `${state.activeWorkbench}:${state.activeDomain}:${state.activeEditor}:${selectionKey}`,
      workbench: state.activeWorkbench,
      domain: state.activeDomain,
      editor: state.activeEditor,
      selectedEntity: state.selectedEntity ? { ...state.selectedEntity } : null,
      selectedMapId: state.selectedMapId,
      selectedCell: state.selectedCell ? { ...state.selectedCell } : null
    };
  }, [
    state.activeWorkbench,
    state.activeDomain,
    state.activeEditor,
    state.selectedMapId,
    selectedEntityId,
    selectedCellKey
  ]);
  const [workbenchHistory, setWorkbenchHistory] = useState<{ entries: WorkbenchHistoryLocation[]; index: number }>({
    entries: [],
    index: -1
  });

  useEffect(() => {
    if (!desktopRuntime) return;
    let disposed = false;
    invoke<DefaultStoragePaths>("default_storage_paths")
      .then((paths) => {
        if (disposed) return;
        setStoragePaths(paths);
        setWorkspaceDir(paths.workspaceDir);
        setExportDir((current) => current === DEFAULT_EXPORT ? `${paths.exportRoot}\\Tutorial` : current);
      })
      .catch((error) => {
        console.warn("Unable to resolve desktop storage paths.", error);
      });
    return () => {
      disposed = true;
    };
  }, [desktopRuntime]);

  useEffect(() => {
    function handleGlobalSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setGlobalSearchOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleGlobalSearchShortcut);
    return () => window.removeEventListener("keydown", handleGlobalSearchShortcut);
  }, []);

  useEffect(() => {
    if (!state.project && state.activeWorkbench !== "library") return;
    if (historyNavigationRef.current) {
      historyNavigationRef.current = false;
      return;
    }
    setWorkbenchHistory((current) => {
      if (current.entries[current.index]?.key === activeWorkbenchLocation.key) return current;
      const base = current.index >= 0 ? current.entries.slice(0, current.index + 1) : [];
      const entries = [...base, activeWorkbenchLocation].slice(-40);
      return { entries, index: entries.length - 1 };
    });
  }, [activeWorkbenchLocation, state.activeWorkbench, state.project]);

  const selectedMap = useMemo(
    () => state.project?.maps.find((map) => map.id === state.selectedMapId) ?? state.project?.maps[0] ?? null,
    [state.project?.maps, state.selectedMapId]
  );
  const selectedMapLocationKey = selectedMap ? `${selectedMap.levelType}:${selectedMap.index}` : "";
  const selectedMapRenderKey = selectedMap
    ? `${selectedMap.render.tilesetId}:${selectedMap.render.landlook}:${selectedMap.render.mode}`
    : "";
  const selectedRandomLevel = useMemo(() => {
    return semanticRandomLevelForMap(state.project, selectedMap);
  }, [state.project?.randomLevels, state.project?.semanticSchema, selectedMapLocationKey]);
  const mapTriggers = useMemo(() => {
    return semanticTriggersForMap(state.project, selectedMap);
  }, [state.project?.triggers, state.project?.semanticSchema, selectedMapLocationKey]);
  const selectedTileset = useMemo(() => {
    return semanticTilesetForMap(state.project, selectedMap);
  }, [state.project?.assetCatalog.tilesets, state.project?.semanticSchema, selectedMapLocationKey, selectedMapRenderKey]);
  const selectedMapRecords = useMemo(
    () => semanticMapRecordsForMap(state.project, selectedMap),
    [state.project?.mapRecords, state.project?.semanticSchema, selectedMapLocationKey]
  );
  const visibleIssues = useMemo(
    () => issuesFor(state.project),
    [state.project?.validation, state.project?.semanticSchema?.diagnostics, state.project?.diagnostics]
  );
  const selectedAtlas = selectedTileset ? state.atlasEntries[selectedTileset.id] ?? null : null;
  const atlasLoadKey = useMemo(
    () =>
      state.project
        ? state.project.assetCatalog.tilesets
            .map((asset) => `${asset.id}:${asset.imagePath ?? ""}:${asset.available ? "1" : "0"}:${asset.columns}x${asset.rows}:${asset.baseTile ?? ""}`)
            .join("|")
        : "",
    [state.project?.assetCatalog.tilesets]
  );
  const importedMapIconIds = useMemo(() => {
    const project = state.project;
    if (!project) return [];
    const key = importedMapIconCacheKey(project);
    if (importedMapIconCacheRef.current.key !== key) {
      importedMapIconCacheRef.current = {
        key,
        ids: [...new Set(project.maps.flatMap((map) => referencedMapIconIds(map.tiles)))].sort((a, b) => a - b)
      };
    }
    return importedMapIconCacheRef.current.ids;
  }, [
    state.project?.source.sourcePath,
    state.project?.maps.length,
    state.project?.maps.map((map) => `${map.id}:${map.width}x${map.height}`).join("|")
  ]);
  const iconLoadKey = useMemo(
    () =>
      state.project
        ? [
            ...new Set([
              "map-icon-loader-v4",
              ...importedMapIconIds,
              ...state.project.mapRecords.flatMap(playerMapMarkerIconIds),
              ...tileIconCandidates(state.selectedTile),
              ...(state.project.assetCatalog.icons ?? [])
                .filter((asset) => asset.resourceType === "cicn")
                .flatMap((asset) => [
                  ...tileIconCandidates(asset.resourceId < 0 ? asset.resourceId : -asset.resourceId),
                  ...(asset.previewPath ? [asset.previewPath] : [])
                ]),
              ...(state.project.assets ?? [])
                .filter((asset) => asset.kind === "special-land-tile" && asset.resourceType === "cicn")
                .flatMap((asset) => tileIconCandidates(asset.resourceId)),
              ...(state.libraryCatalog?.assets ?? [])
                .filter(isPaintableSpecialLandLibraryAsset)
                .flatMap((asset) => asset.resourceId == null ? [] : tileIconCandidates(asset.resourceId < 0 ? asset.resourceId : -asset.resourceId)),
              ...(!desktopRuntime
                ? PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES.flatMap(tileIconCandidates)
                : [])
            ])
          ].map(String).sort().join(",")
        : "",
    [
      desktopRuntime,
      importedMapIconIds,
      state.libraryCatalog?.assets,
      state.project?.assetCatalog.icons,
      state.project?.assets,
      state.project?.mapRecords,
      state.selectedTile
    ]
  );
  const undoLabel = state.past.length > 0 ? state.past[state.past.length - 1].label : null;
  const redoLabel = state.future.length > 0 ? state.future[0].label : null;
  const activeStatus = state.groupLabel
    ? `${state.groupLabel}${state.groupChangeCount ? ` (${state.groupChangeCount} cells)` : ""}`
    : state.lastCommandLabel ?? state.status;
  const importAllowed = Boolean(state.project && isProjectEmpty(state.project));
  const libraryIssueCount = state.libraryCatalog?.diagnostics.length ?? 0;
  const railIssueCount = visibleIssues.length + libraryIssueCount;

  useAppBootstrapEffects({
    state,
    dispatch,
    desktopRuntime,
    workspaceDir,
    projectDir,
    setProjectDir,
    atlasLoadKey,
    iconLoadKey
  });

  const {
    showNewProjectDialog,
    createNewProject,
    validateScenarioSeedJson,
    createProjectFromSeedJson,
    chooseExistingProject,
    resumeBrowserProject,
    closeProject,
    importScenario,
    openLibraryHub,
    openProjectWorkbench,
    createDraftEntry,
    updateDraftEntry,
    updateLibraryCatalog,
    saveProject,
    downloadProjectJsonBackup,
    exportProject,
    validateProject,
    benchmarkProject
  } = useProjectLifecycleActions({
    state,
    dispatch,
    desktopRuntime,
    browserFileSystem,
    workspaceDir,
    projectDir,
    setProjectDir,
    exportDir,
    setExportDir,
    projectNameDraft,
    setProjectNameDraft,
    setProjectDialogOpen,
    selectedMapId: state.selectedMapId,
    roots: {
      scenario: DEFAULT_SCENARIO_ROOT,
      project: storagePaths.projectRoot,
      export: storagePaths.exportRoot,
      divinity: DEFAULT_DIVINITY_ROOT,
      realmzData: DEFAULT_REALMZ_DATA_ROOT
    }
  });

  function requestCloseProject({ assumeDirty = false }: { assumeDirty?: boolean } = {}) {
    if (!state.project) return;
    if (state.dirty || assumeDirty) {
      setCloseProjectDialogOpen(true);
      return;
    }
    closeProject();
  }

  async function saveAndCloseProject() {
    if (closeProjectSaving) return;
    setCloseProjectSaving(true);
    const saved = await saveProject();
    setCloseProjectSaving(false);
    if (!saved) return;
    setCloseProjectDialogOpen(false);
    closeProject({ discardUnsaved: true });
  }

  function closeProjectWithoutSaving() {
    setCloseProjectDialogOpen(false);
    closeProject({ discardUnsaved: true });
  }

  function cancelCloseProject() {
    setCloseProjectDialogOpen(false);
    dispatch({ type: "setStatus", status: "Close project cancelled" });
  }

  function confirmBeforeDraftDiscard(destination: string, action: Parameters<typeof draftGuard.value.confirmBeforeDraftDiscard>[1]) {
    draftGuard.value.confirmBeforeDraftDiscard(destination, action);
  }

  function updateSelectedMap(nextMap: MapEntity) {
    if (!state.project) return;
    dispatch({
      type: "replaceProject",
      project: {
        ...state.project,
        maps: state.project.maps.map((map) => (map.id === nextMap.id ? nextMap : map))
      }
    });
  }

  function selectEntity(entity: SelectedEntity) {
    if (entity.id.startsWith("map-record:")) {
      const mapId = mapIdForEntity(state.project, entity.id);
      if (mapId) dispatch({ type: "setSelectedMap", id: mapId });
      dispatch({ type: "selectEntity", entity });
      openProjectDomain("player-maps");
      dispatch({ type: "setActiveEditor", editor: "map-records" });
      dispatch({ type: "setStatus", status: "Opened Player Map record." });
      return;
    }
    const match = entity.id.match(/^map:(land|dungeon):(\d+)$/);
    if (match && state.project) {
      const mapId = `${match[1]}:${match[2]}`;
      if (state.project.maps.some((map) => map.id === mapId)) {
        dispatch({ type: "setSelectedMap", id: mapId });
        dispatch({ type: "selectEntity", entity });
        openProjectDomain("maps");
        return;
      }
    }
    const randomMatch = entity.id.match(/^random:(land|dungeon):(\d+):(\d+)$/);
    if (randomMatch && state.project) {
      const mapId = `${randomMatch[1]}:${randomMatch[2]}`;
      if (state.project.maps.some((map) => map.id === mapId)) {
        dispatch({ type: "setSelectedMap", id: mapId });
        dispatch({ type: "selectEntity", entity });
        focusEntityOnMap(mapId, entity);
        openProjectDomain("maps");
        return;
      }
    }
    const mapId = mapIdForEntity(state.project, entity.id);
    if (mapId) {
      dispatch({ type: "setSelectedMap", id: mapId });
      dispatch({ type: "selectEntity", entity });
      focusEntityOnMap(mapId, entity);
      if (state.activeTab === "records" || state.activeTab === "encounters") {
        openProjectDomain("maps");
      }
      return;
    }
    const route = editorRouteForEntity(entity.id);
    if (route) {
      openProjectDomain(route.tab);
      dispatch({ type: "setActiveEditor", editor: route.editor });
      dispatch({ type: "setStatus", status: `Opened ${route.label}.` });
    }
    dispatch({ type: "selectEntity", entity });
  }

  function editorRouteForEntity(id: string): { tab: EditorTab; editor: string; label: string } | null {
    if (/^message:-?\d+$/.test(id)) return { tab: "text", editor: "messages", label: "string reference" };
    if (/^option-label:-?\d+$/.test(id)) return { tab: "text", editor: "option-labels", label: "option label reference" };
    if (id.startsWith("trigger:") || id.startsWith("action-slot:trigger:")) {
      return { tab: "scripts", editor: "action-points", label: "Action Point reference" };
    }
    if (id.startsWith("macro:") || id.startsWith("Data ED3:macro:") || id.startsWith("action-slot:macro:") || id.startsWith("action-slot:Data ED3:macro:")) {
      return { tab: "scripts", editor: scriptEditorForMacroEntity(id), label: "extra action reference" };
    }
    if (/^encounter:simple:-?\d+$/.test(id)) return { tab: "encounters", editor: "simple", label: "Simple Encounter reference" };
    if (/^encounter:complex:-?\d+$/.test(id)) return { tab: "encounters", editor: "complex", label: "Complex Encounter reference" };
    if (/^thief:-?\d+$/.test(id)) return { tab: "encounters", editor: "rogue", label: "Rogue Encounter reference" };
    if (/^time:-?\d+$/.test(id)) return { tab: "encounters", editor: "timed", label: "Timed Encounter reference" };
    if (/^battle:-?\d+$/.test(id)) return { tab: "combat", editor: "battles", label: "Battle reference" };
    if (/^monster:-?\d+$/.test(id)) return { tab: "combat", editor: "monsters", label: "Monster reference" };
    if (/^treasure:-?\d+$/.test(id)) return { tab: "economy", editor: "treasure", label: "Treasure reference" };
    if (/^shop:-?\d+$/.test(id)) return { tab: "economy", editor: "shops", label: "Shop reference" };
    if (/^item:-?\d+$/.test(id)) return { tab: "economy", editor: "items", label: "Item reference" };
    if (/^spell:-?\d+$/.test(id)) return { tab: "rules", editor: "spells", label: "Spell reference" };
    if (/^race:-?\d+$/.test(id)) return { tab: "rules", editor: "races", label: "Race reference" };
    if (/^caste:-?\d+$/.test(id)) return { tab: "rules", editor: "castes", label: "Caste reference" };
    if (id.startsWith("resource:") || id.startsWith("picture:")) return { tab: "assets", editor: "pictures", label: "picture resource" };
    if (id.startsWith("sound:")) return { tab: "assets", editor: "sounds", label: "sound resource" };
    if (id.startsWith("asset:")) return { tab: "assets", editor: "project-assets", label: "scenario asset" };
    return null;
  }

  function scriptEditorForMacroEntity(id: string) {
    const macroId = macroRecordIndexFromEntityId(id);
    const trigger = state.project?.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === macroId);
    if (!trigger) return "macros";
    const classification = extraActionPointClassification(state.project, trigger);
    if (classification === "Global Macro") return "global-macros";
    return "macros";
  }

  function macroRecordIndexFromEntityId(id: string) {
    const match = id.match(/(?:^|:)macro:(-?\d+)/);
    return match ? Number(match[1]) : null;
  }

  function focusEntityOnMap(mapId: string, entity: SelectedEntity) {
    dispatch({ type: "setMapFocusTarget", target: { kind: "entity", mapId, entity, nonce: nextMapFocusNonce() } });
  }

  function applyProjectCommand(command: ProjectCommand) {
    dispatch({ type: "applyCommand", command });
  }

  const {
    importMediaAssets,
    updateManagedAsset,
    updateCustomLibraryAsset,
    replaceManagedAsset,
    deleteManagedAsset,
    deleteCustomLibraryAsset,
    addProjectAssetToCustomLibrary,
    copyCustomLibraryAssetToScenario,
    copyReferenceAssetToScenario
  } = useAssetActions({
    state,
    dispatch,
    desktopRuntime,
    workspaceDir,
    projectDir,
    selectedMapId: state.selectedMapId
  });

  function selectMap(id: string) {
    dispatch({ type: "setSelectedMap", id });
  }

  function clearMapSelection() {
    dispatch({ type: "setSelectedCell", cell: null });
    dispatch({ type: "setMapFocusTarget", target: null });
    if (selectedMap) {
      dispatch({ type: "selectEntity", entity: { type: "map", id: `map:${selectedMap.levelType}:${selectedMap.index}` } });
    } else {
      dispatch({ type: "selectEntity", entity: null });
    }
  }

  function openScriptsForEntity(entity: SelectedEntity) {
    dispatch({ type: "selectEntity", entity });
    openProjectDomain("scripts");
    dispatch({ type: "setActiveEditor", editor: "action-points" });
    dispatch({ type: "setStatus", status: "Opened selected Action Point in Scripts/AP" });
  }

  function openProjectTool(tab: "assets" | "rules" | "scripts" | "text", editor: string) {
    openProjectDomain(tab);
    dispatch({ type: "setActiveEditor", editor });
    dispatch({ type: "setStatus", status: `Opened ${editor.replace(/-/g, " ")}.` });
  }

  function openMapCoordinate(target: MapCoordinateTarget) {
    const map = state.project?.maps.find((candidate) => (
      candidate.levelType === target.levelType && candidate.index === target.levelIndex
    ));
    if (!map) {
      dispatch({
        type: "setStatus",
        status: `No ${target.levelType} level ${target.levelIndex} exists for ${target.x}, ${target.y}.`
      });
      return;
    }
    const x = clampCell(target.x);
    const y = clampCell(target.y);
    openProjectDomain("maps");
    dispatch({ type: "setActiveEditor", editor: "domain" });
    dispatch({ type: "setSelectedMap", id: map.id });
    dispatch({ type: "setTool", tool: "select" });
    dispatch({ type: "setSelectedCell", cell: { x, y, tile: tileValueAt(map, x, y) } });
    dispatch({ type: "setMapFocusTarget", target: { kind: "cell", mapId: map.id, x, y, nonce: nextMapFocusNonce() } });
    dispatch({ type: "setStatus", status: `Opened ${map.name} at ${x}, ${y}.` });
  }

  function openPlayerMapTarget(record: MapRecord) {
    const mapId = `${record.isDungeon ? "dungeon" : "land"}:${record.level}`;
    const map = state.project?.maps.find((candidate) => candidate.id === mapId);
    if (!map) {
      dispatch({ type: "setStatus", status: `No ${record.isDungeon ? "dungeon" : "land"} level ${record.level} exists for Player Map ${record.id}.` });
      return;
    }
    const entity = selectEntityFromId(`map-record:${record.id}`);
    openProjectDomain("maps");
    dispatch({ type: "setActiveEditor", editor: "domain" });
    dispatch({ type: "setSelectedMap", id: map.id });
    dispatch({ type: "setTool", tool: "select" });
    dispatch({ type: "setMapViewFlag", flag: "showMapRecords", value: true });
    dispatch({ type: "selectEntity", entity });
    dispatch({ type: "setMapFocusTarget", target: { kind: "entity", mapId: map.id, entity, nonce: nextMapFocusNonce() } });
    dispatch({ type: "setStatus", status: `Opened ${map.name} for Player Map ${record.id}.` });
  }

  function openProjectDomain(domain: EditorTab) {
    if (state.project) {
      dispatch({ type: "setWorkbench", workbench: "project", tab: domain });
    } else {
      dispatch({ type: "setActiveDomain", domain });
    }
  }

  function openGlobalSearchResult(result: GlobalSearchResult) {
    if (result.route?.kind === "documents") {
      dispatch({ type: "setDocsSection", section: result.route.sectionId });
      setDocumentsOpen(true);
      dispatch({ type: "setStatus", status: `Opened ${result.title}.` });
      return;
    }
    if (result.route?.kind === "divinity-manual") {
      setDivinityManualOpen(true);
      dispatch({ type: "setStatus", status: `Opened ${result.title}.` });
      return;
    }
    if (result.route?.kind === "workbench") {
      dispatch({ type: "setWorkbench", workbench: result.route.workbench, tab: result.route.domain });
      dispatch({ type: "setActiveDomain", domain: result.route.domain });
      dispatch({ type: "setActiveEditor", editor: result.route.editor });
      if (result.route.domain === "assets" && result.route.searchHint) {
        setAssetSearchHint({
          query: result.route.searchHint,
          nonce: Date.now(),
          section: result.route.assetSection,
          kindFilter: result.route.assetKindFilter,
          selectedEntityId: result.selectedEntity?.id ?? null
        });
      } else if (result.route.domain !== "assets") {
        setAssetSearchHint(null);
      }
      if (result.selectedEntity) dispatch({ type: "selectEntity", entity: result.selectedEntity });
      dispatch({ type: "setStatus", status: `Opened ${result.title}.` });
      return;
    }
    if (result.selectedEntity) {
      selectEntity(result.selectedEntity);
      return;
    }
    dispatch({ type: "setStatus", status: `Selected ${result.title}.` });
  }

  function applyWorkbenchLocation(location: WorkbenchHistoryLocation) {
    const locationMapId = location.selectedMapId ?? (
      location.selectedEntity ? mapIdForEntity(state.project, location.selectedEntity.id) : null
    );
    dispatch({ type: "setWorkbench", workbench: location.workbench, tab: location.domain });
    dispatch({ type: "setActiveDomain", domain: location.domain });
    dispatch({ type: "setActiveEditor", editor: location.editor });
    if (locationMapId) {
      dispatch({ type: "setSelectedMap", id: locationMapId });
    }
    if (location.domain === "maps" && location.selectedCell && !location.selectedEntity && locationMapId) {
      dispatch({ type: "setSelectedCell", cell: location.selectedCell });
      dispatch({
        type: "setMapFocusTarget",
        target: { kind: "cell", mapId: locationMapId, x: location.selectedCell.x, y: location.selectedCell.y, nonce: nextMapFocusNonce() }
      });
    } else {
      dispatch({ type: "setSelectedCell", cell: null });
    }
    dispatch({ type: "selectEntity", entity: location.selectedEntity });
    if (location.domain === "maps" && location.selectedEntity && locationMapId) {
      dispatch({ type: "setMapFocusTarget", target: { kind: "entity", mapId: locationMapId, entity: location.selectedEntity, nonce: nextMapFocusNonce() } });
    }
    dispatch({ type: "setStatus", status: `Returned to ${location.domain.replace(/-/g, " ")}.` });
  }

  function navigateWorkbenchHistory(delta: -1 | 1) {
    const nextIndex = workbenchHistory.index + delta;
    const next = workbenchHistory.entries[nextIndex];
    if (!next) return;
    historyNavigationRef.current = true;
    setWorkbenchHistory((current) => ({ ...current, index: nextIndex }));
    applyWorkbenchLocation(next);
  }

  return (
    <DraftChangeGuardProvider value={draftGuard.value}>
    <ProvidenceEditorShell
      state={state}
      runtimeLabel={desktopRuntime ? "Desktop" : browserFileSystem ? "Browser FS" : "Browser Local"}
      runtimeLive={true}
      canOpenProject={true}
      canCloseProject={Boolean(state.project)}
      canImportScenario={desktopRuntime || browserFileSystem}
      browserPreviewStatus={BROWSER_PREVIEW_STATUS}
      importAllowed={importAllowed}
      railIssueCount={railIssueCount}
      activeStatus={activeStatus}
      undoLabel={undoLabel}
      redoLabel={redoLabel}
      canSave={Boolean(state.project)}
      canExport={Boolean(state.project)}
      tutorialEnabled={state.tutorialEnabled}
      canNavigateBack={workbenchHistory.index > 0}
      canNavigateForward={workbenchHistory.index >= 0 && workbenchHistory.index < workbenchHistory.entries.length - 1}
      onLibrary={() => confirmBeforeDraftDiscard("open the Library workbench", () => openLibraryHub())}
      onProject={() => confirmBeforeDraftDiscard("open the Project workbench", () => openProjectWorkbench())}
      onDocuments={() => confirmBeforeDraftDiscard("open Documents", () => setDocumentsOpen(true))}
      onDivinityManual={() => {
        confirmBeforeDraftDiscard("open the Divinity manual", () => {
          setDivinityManualHref("");
          setDivinityManualOpen(true);
        });
      }}
      onGlobalSearch={() => confirmBeforeDraftDiscard("open global search", () => setGlobalSearchOpen(true))}
      onNavigateBack={() => confirmBeforeDraftDiscard("go back", () => navigateWorkbenchHistory(-1))}
      onNavigateForward={() => confirmBeforeDraftDiscard("go forward", () => navigateWorkbenchHistory(1))}
      onToggleTutorial={() => dispatch({ type: "setTutorialEnabled", enabled: !state.tutorialEnabled })}
      onNewProject={() => confirmBeforeDraftDiscard("start a new project", () => showNewProjectDialog())}
      onOpenProject={() => confirmBeforeDraftDiscard("open another project", () => chooseExistingProject())}
      onCloseProject={() => confirmBeforeDraftDiscard("close the project", ({ appliedDrafts }) => requestCloseProject({ assumeDirty: appliedDrafts }))}
      onImportScenario={() => confirmBeforeDraftDiscard("import a scenario", () => importScenario())}
      onUndo={() => dispatch({ type: "undo" })}
      onRedo={() => dispatch({ type: "redo" })}
      onSave={saveProject}
      onExport={exportProject}
      onSelectDomain={(domain) => {
        confirmBeforeDraftDiscard(`open ${domain}`, () => {
          openProjectDomain(domain);
          dispatch({ type: "setActiveEditor", editor: domain === "scripts" ? "action-points" : "domain" });
        });
      }}
      onSelectEditor={(editor) => confirmBeforeDraftDiscard(`open ${editor.replace(/-/g, " ")}`, () => dispatch({ type: "setActiveEditor", editor }))}
    >
      <WorkbenchRouter
        state={state}
        emptyProjectView={
          <ProjectStart
            desktopRuntime={desktopRuntime}
            browserFileSystem={browserFileSystem}
            browserPreviewStatus={BROWSER_PREVIEW_STATUS}
            projectRoot={storagePaths.projectRoot}
            onNewProject={() => confirmBeforeDraftDiscard("start a new project", () => showNewProjectDialog())}
            onOpenProject={() => confirmBeforeDraftDiscard("open another project", () => chooseExistingProject())}
            onResumeProject={desktopRuntime ? undefined : () => confirmBeforeDraftDiscard("resume the browser-local project", () => resumeBrowserProject())}
            onImportScenario={() => confirmBeforeDraftDiscard("import a scenario", () => importScenario())}
            onLibraryHub={() => confirmBeforeDraftDiscard("open the Library workbench", () => openLibraryHub())}
            onDocuments={() => confirmBeforeDraftDiscard("open Documents", () => setDocumentsOpen(true))}
          />
        }
        selectedMap={selectedMap}
        selectedRandomLevel={selectedRandomLevel}
        mapTriggers={mapTriggers}
        selectedTileset={selectedTileset}
        mapRecords={selectedMapRecords}
        atlas={selectedAtlas}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        assetSearchHint={assetSearchHint}
        exportReport={state.exportReport}
        benchmark={state.benchmark}
        issues={visibleIssues}
        onSelectMap={selectMap}
        onSelectTile={(tile) => {
          confirmBeforeDraftDiscard(`select Special Land Tile ${tile}`, () => {
            dispatch({ type: "setSelectedTile", tile });
            if (state.activeTab !== "maps") {
              openProjectDomain("maps");
              dispatch({ type: "setStatus", status: `Selected Special Land Tile ${tile} for painting` });
            }
          });
        }}
        onSelectCell={(cell) => dispatch({ type: "setSelectedCell", cell })}
        onSelectEntity={selectEntity}
        onSelectEditor={(editor) => dispatch({ type: "setActiveEditor", editor })}
        onSetTool={(tool) => dispatch({ type: "setTool", tool })}
        onSetZoom={(zoom) => dispatch({ type: "setZoom", zoom })}
        onSetSmoothTiles={(value) => dispatch({ type: "setSmoothTiles", value })}
        onSetViewFlag={(flag: MapViewFlag, value: boolean) => dispatch({ type: "setMapViewFlag", flag, value })}
        onSetVisibleRandomRectIds={(ids) => dispatch({ type: "setVisibleRandomRectIds", ids })}
        onSetVisibleMapRecordIds={(ids) => dispatch({ type: "setVisibleMapRecordIds", ids })}
        onClearSelection={clearMapSelection}
        onOpenScripts={openScriptsForEntity}
        onOpenTool={(tab, editor) => confirmBeforeDraftDiscard(`open ${editor.replace(/-/g, " ")}`, () => openProjectTool(tab, editor))}
        onOpenMapCoordinate={(target) => confirmBeforeDraftDiscard(`open map location ${target.x}, ${target.y}`, () => openMapCoordinate(target))}
        onOpenPlayerMapTarget={(record) => confirmBeforeDraftDiscard(`open Player Map ${record.id} target`, () => openPlayerMapTarget(record))}
        onBeginPaintStroke={(label) => dispatch({ type: "beginCommandGroup", label })}
        onApplyCommand={applyProjectCommand}
        onCommitPaintStroke={() => dispatch({ type: "commitCommandGroup" })}
        onCancelPaintStroke={() => dispatch({ type: "cancelCommandGroup" })}
        onCreateDraft={createDraftEntry}
        onUpdateDraft={updateDraftEntry}
        onUpdateLibraryCatalog={updateLibraryCatalog}
        onImportAssets={importMediaAssets}
        onReplaceAsset={replaceManagedAsset}
        onUpdateAsset={updateManagedAsset}
        onDeleteAsset={deleteManagedAsset}
        onUpdateCustomAsset={updateCustomLibraryAsset}
        onDeleteCustomAsset={deleteCustomLibraryAsset}
        onAddAssetToCustomLibrary={addProjectAssetToCustomLibrary}
        onCopyCustomAssetToScenario={copyCustomLibraryAssetToScenario}
        onCopyReferenceAssetToScenario={copyReferenceAssetToScenario}
        onValidate={validateProject}
        onExport={exportProject}
        onExportProjectJson={downloadProjectJsonBackup}
        onBenchmark={benchmarkProject}
      />
      {projectDialogOpen && (
        <ProjectNameDialog
          value={projectNameDraft}
          onChange={setProjectNameDraft}
          onCancel={() => {
            setProjectDialogOpen(false);
            dispatch({ type: "setStatus", status: "New project cancelled" });
          }}
          onCreate={() => createNewProject()}
          templateProjectName={state.project?.scenario.name ?? null}
          onValidateSeed={validateScenarioSeedJson}
          onCreateFromSeed={createProjectFromSeedJson}
        />
      )}
      {closeProjectDialogOpen && state.project && (
        <CloseProjectDialog
          projectName={state.project.scenario.name}
          saving={closeProjectSaving}
          onSaveAndClose={saveAndCloseProject}
          onCloseWithoutSaving={closeProjectWithoutSaving}
          onCancel={cancelCloseProject}
        />
      )}
      {documentsOpen && (
        <WorkbenchChunkErrorBoundary resetKey={state.docsSection}>
          <Suspense fallback={<WorkbenchLoading label="Loading documents..." />}>
            <DocumentsView
              initialSection={state.docsSection}
              onSectionChange={(section: string) => dispatch({ type: "setDocsSection", section })}
              onOpenDivinityReference={(href: string) => {
                setDivinityManualHref(href);
                setDivinityManualOpen(true);
              }}
              onClose={() => setDocumentsOpen(false)}
            />
          </Suspense>
        </WorkbenchChunkErrorBoundary>
      )}
      {divinityManualOpen && <DivinityManualWindow href={divinityManualHref} onClose={() => setDivinityManualOpen(false)} />}
      {globalSearchOpen && (
        <GlobalSearchDialog
          project={state.project}
          catalog={state.libraryCatalog}
          customAssets={state.workspace?.customAssets ?? []}
          onClose={() => setGlobalSearchOpen(false)}
          onOpenResult={(result) => confirmBeforeDraftDiscard(`open ${result.title}`, () => openGlobalSearchResult(result))}
        />
      )}
      {draftGuard.dialog}
    </ProvidenceEditorShell>
    </DraftChangeGuardProvider>
  );
}
