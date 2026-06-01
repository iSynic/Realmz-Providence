import { invoke } from "@tauri-apps/api/core";
import { Suspense, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DEFAULT_DIVINITY_ROOT, DEFAULT_EXPORT, DEFAULT_REALMZ_DATA_ROOT, DEFAULT_WORKSPACE } from "./editor/constants";
import { ProjectNameDialog, ProjectStart } from "./editor/app/AppStart";
import {
  isPaintableSpecialLandLibraryAsset,
  isProjectEmpty,
  mapIdForEntity,
  nextMapFocusNonce
} from "./editor/app/appUtils";
import { useAssetActions } from "./editor/app/useAssetActions";
import { useAppBootstrapEffects } from "./editor/app/useAppBootstrapEffects";
import { useProjectLifecycleActions } from "./editor/app/useProjectLifecycleActions";
import { canUseBrowserFileSystem } from "./editor/browser/fsAccess";
import {
  PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES,
  referencedMapIconIds,
  tileIconCandidates
} from "./editor/map/renderValues";
import { editorReducer, initialEditorState, BROWSER_PREVIEW_STATUS } from "./editor/store";
import { ActiveWorkbench, EditorTab, MapEntity, MapViewFlag, ProjectCommand, SelectedEntity } from "./editor/types";
import { hasDesktopRuntime, issuesFor } from "./editor/utils";
import {
  semanticMapRecordsForMap,
  semanticRandomLevelForMap,
  semanticTilesetForMap,
  semanticTriggersForMap
} from "./editor/semanticGraph";
import { ProvidenceEditorShell } from "./editor/workbench/ProvidenceEditorShell";
import { WorkbenchRouter } from "./editor/workbench/WorkbenchRouter";
import { DivinityManualWindow } from "./editor/views/DivinityManualWindow";
import {
  LazyDocumentsView as DocumentsView,
  WorkbenchChunkErrorBoundary,
  WorkbenchLoading
} from "./editor/workbench/LazyWorkbenchPanels";

const DEFAULT_SCENARIO_ROOT = "F:\\Realmz\\base\\Realmz\\Scenarios";
const DEFAULT_PROJECT_ROOT = "F:\\Realmz - Providence\\projects";
const DEFAULT_EXPORT_ROOT = "F:\\Realmz - Providence\\exports";

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
};

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
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [divinityManualOpen, setDivinityManualOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("Untitled Scenario");
  const [state, dispatch] = useReducer(editorReducer, desktopRuntime, initialEditorState);
  const importedMapIconCacheRef = useRef<{ key: string; ids: number[] }>({ key: "", ids: [] });
  const historyNavigationRef = useRef(false);
  const activeWorkbenchLocation = useMemo<WorkbenchHistoryLocation>(() => ({
    key: `${state.activeWorkbench}:${state.activeDomain}:${state.activeEditor}`,
    workbench: state.activeWorkbench,
    domain: state.activeDomain,
    editor: state.activeEditor
  }), [state.activeWorkbench, state.activeDomain, state.activeEditor]);
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
    [state.project?.semanticSchema, selectedMapLocationKey]
  );
  const visibleIssues = useMemo(
    () => issuesFor(state.project),
    [state.project?.validation, state.project?.semanticSchema.diagnostics, state.project?.diagnostics]
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
              ...importedMapIconIds,
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
    chooseExistingProject,
    importScenario,
    openLibraryHub,
    openProjectWorkbench,
    createDraftEntry,
    updateDraftEntry,
    saveProject,
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
    const match = entity.id.match(/^map:(land|dungeon):(\d+)$/);
    if (match && state.project) {
      const mapId = `${match[1]}:${match[2]}`;
      if (state.project.maps.some((map) => map.id === mapId)) {
        dispatch({ type: "setSelectedMap", id: mapId });
        dispatch({ type: "setTab", tab: "maps" });
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
        dispatch({ type: "setTab", tab: "maps" });
        return;
      }
    }
    const mapId = mapIdForEntity(state.project, entity.id);
    if (mapId) {
      dispatch({ type: "setSelectedMap", id: mapId });
      dispatch({ type: "selectEntity", entity });
      focusEntityOnMap(mapId, entity);
      if (state.activeTab === "records" || state.activeTab === "encounters") {
        dispatch({ type: "setTab", tab: "maps" });
      }
      return;
    }
    dispatch({ type: "selectEntity", entity });
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
    replaceManagedAsset,
    deleteManagedAsset
  } = useAssetActions({
    state,
    dispatch,
    desktopRuntime,
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
    dispatch({ type: "setActiveDomain", domain: "scripts" });
    dispatch({ type: "setActiveEditor", editor: "action-points" });
    dispatch({ type: "setStatus", status: "Opened selected Action Point in Scripts/AP" });
  }

  function openProjectTool(tab: "assets" | "rules" | "scripts" | "text", editor: string) {
    dispatch({ type: "setActiveDomain", domain: tab });
    dispatch({ type: "setActiveEditor", editor });
    dispatch({ type: "setStatus", status: `Opened ${editor.replace(/-/g, " ")}.` });
  }

  function applyWorkbenchLocation(location: WorkbenchHistoryLocation) {
    dispatch({ type: "setWorkbench", workbench: location.workbench, tab: location.domain });
    dispatch({ type: "setActiveDomain", domain: location.domain });
    dispatch({ type: "setActiveEditor", editor: location.editor });
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
    <ProvidenceEditorShell
      state={state}
      runtimeLabel={desktopRuntime ? "Desktop" : browserFileSystem ? "Browser FS" : "Browser Preview"}
      runtimeLive={desktopRuntime || browserFileSystem}
      canUseFiles={desktopRuntime || browserFileSystem}
      browserPreviewStatus={BROWSER_PREVIEW_STATUS}
      importAllowed={importAllowed}
      railIssueCount={railIssueCount}
      activeStatus={activeStatus}
      undoLabel={undoLabel}
      redoLabel={redoLabel}
      canSave={Boolean(state.project && desktopRuntime)}
      canExport={Boolean(state.project && desktopRuntime)}
      tutorialEnabled={state.tutorialEnabled}
      canNavigateBack={workbenchHistory.index > 0}
      canNavigateForward={workbenchHistory.index >= 0 && workbenchHistory.index < workbenchHistory.entries.length - 1}
      onLibrary={openLibraryHub}
      onProject={openProjectWorkbench}
      onDocuments={() => setDocumentsOpen(true)}
      onDivinityManual={() => setDivinityManualOpen(true)}
      onNavigateBack={() => navigateWorkbenchHistory(-1)}
      onNavigateForward={() => navigateWorkbenchHistory(1)}
      onToggleTutorial={() => dispatch({ type: "setTutorialEnabled", enabled: !state.tutorialEnabled })}
      onNewProject={showNewProjectDialog}
      onOpenProject={chooseExistingProject}
      onImportScenario={importScenario}
      onUndo={() => dispatch({ type: "undo" })}
      onRedo={() => dispatch({ type: "redo" })}
      onSave={saveProject}
      onExport={exportProject}
      onSelectDomain={(domain) => {
        dispatch({ type: "setActiveDomain", domain });
        dispatch({ type: "setActiveEditor", editor: domain === "scripts" ? "action-points" : "domain" });
      }}
      onSelectEditor={(editor) => dispatch({ type: "setActiveEditor", editor })}
    >
      <WorkbenchRouter
        state={state}
        emptyProjectView={
          <ProjectStart
            desktopRuntime={desktopRuntime}
            browserFileSystem={browserFileSystem}
            browserPreviewStatus={BROWSER_PREVIEW_STATUS}
            projectRoot={storagePaths.projectRoot}
            onNewProject={showNewProjectDialog}
            onOpenProject={chooseExistingProject}
            onImportScenario={importScenario}
            onLibraryHub={openLibraryHub}
            onDocuments={() => setDocumentsOpen(true)}
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
        exportReport={state.exportReport}
        benchmark={state.benchmark}
        issues={visibleIssues}
        onSelectMap={selectMap}
        onSelectTile={(tile) => {
          dispatch({ type: "setSelectedTile", tile });
          if (state.activeTab !== "maps") {
            dispatch({ type: "setTab", tab: "maps" });
            dispatch({ type: "setStatus", status: `Selected Special Land Tile ${tile} for painting` });
          }
        }}
        onSelectCell={(cell) => dispatch({ type: "setSelectedCell", cell })}
        onSelectEntity={selectEntity}
        onSelectEditor={(editor) => dispatch({ type: "setActiveEditor", editor })}
        onSetTool={(tool) => dispatch({ type: "setTool", tool })}
        onSetZoom={(zoom) => dispatch({ type: "setZoom", zoom })}
        onSetSmoothTiles={(value) => dispatch({ type: "setSmoothTiles", value })}
        onSetViewFlag={(flag: MapViewFlag, value: boolean) => dispatch({ type: "setMapViewFlag", flag, value })}
        onClearSelection={clearMapSelection}
        onOpenScripts={openScriptsForEntity}
        onOpenTool={openProjectTool}
        onBeginPaintStroke={(label) => dispatch({ type: "beginCommandGroup", label })}
        onApplyCommand={applyProjectCommand}
        onCommitPaintStroke={() => dispatch({ type: "commitCommandGroup" })}
        onCancelPaintStroke={() => dispatch({ type: "cancelCommandGroup" })}
        onCreateDraft={createDraftEntry}
        onUpdateDraft={updateDraftEntry}
        onImportAssets={importMediaAssets}
        onReplaceAsset={replaceManagedAsset}
        onUpdateAsset={updateManagedAsset}
        onDeleteAsset={deleteManagedAsset}
        onValidate={validateProject}
        onExport={exportProject}
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
        />
      )}
      {documentsOpen && (
        <WorkbenchChunkErrorBoundary resetKey={state.docsSection}>
          <Suspense fallback={<WorkbenchLoading label="Loading documents..." />}>
            <DocumentsView
              initialSection={state.docsSection}
              onSectionChange={(section: string) => dispatch({ type: "setDocsSection", section })}
              onClose={() => setDocumentsOpen(false)}
            />
          </Suspense>
        </WorkbenchChunkErrorBoundary>
      )}
      {divinityManualOpen && <DivinityManualWindow onClose={() => setDivinityManualOpen(false)} />}
    </ProvidenceEditorShell>
  );
}
