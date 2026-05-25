import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { BookOpen, Database, Download, FilePlus2, FolderOpen, LibraryBig, RefreshCcw, Save, Upload } from "lucide-react";
import { useEffect, useMemo, useReducer, useState } from "react";
import { DEFAULT_DIVINITY_ROOT, DEFAULT_EXPORT, DEFAULT_REALMZ_DATA_ROOT, DEFAULT_WORKSPACE } from "./editor/constants";
import {
  canUseBrowserFileSystem,
  isBrowserPickerAbort,
  pickBrowserProjectSource,
  pickBrowserScenarioSource
} from "./editor/browser/fsAccess";
import { browserReferenceIconUrl, browserTilesetAtlasUrl } from "./editor/browser/atlasPaths";
import { createBrowserWorkspace, importBrowserLibrary, loadBundledLibraryCatalog } from "./editor/browser/library";
import { runProvidenceHarness } from "./editor/harness";
import { createLibraryDraft, LibraryDraftSpec, updateLibraryDraft } from "./editor/libraryDrafts";
import { benchmarkBrowserProject, createBrowserProject, importBrowserScenario, openBrowserProject, validateBrowserProject } from "./editor/browser/project";
import { IconButton } from "./editor/components/IconButton";
import { EditorToolRail } from "./editor/components/EditorToolRail";
import { loadImage } from "./editor/components/TileSprite";
import { referencedMapIconIds } from "./editor/map/renderValues";
import { editorReducer, initialEditorState, BROWSER_PREVIEW_STATUS } from "./editor/store";
import { BenchmarkReport, ExportReport, LibraryCatalog, ManagedAssetKind, MapEntity, MapViewFlag, Project, ProjectCommand, ProvidenceWorkspace, SelectedEntity, SemanticEntity, TilesetAsset, ValidationReport } from "./editor/types";
import { fileToMediaAssetRequest, nextResourceId, requestToBrowserAsset, requestToBrowserReplacement } from "./editor/mediaAssets";
import { commandError, hasDesktopRuntime, issuesFor } from "./editor/utils";
import {
  semanticMapRecordsForMap,
  semanticRandomLevelForMap,
  semanticTilesetForMap,
  semanticTriggersForMap
} from "./editor/semanticGraph";
import { EncountersPanel } from "./editor/panels/EncountersPanel";
import { ExportPanel } from "./editor/panels/ExportPanel";
import { LibraryHubPanel } from "./editor/panels/LibraryHubPanel";
import { LinterPanel } from "./editor/panels/LinterPanel";
import { MapsPanel } from "./editor/panels/MapsPanel";
import { RecordsPanel } from "./editor/panels/RecordsPanel";
import { ResourcesPanel } from "./editor/panels/ResourcesPanel";
import { ScriptsPanel } from "./editor/panels/ScriptsPanel";
import { SuiteDomainPanel } from "./editor/panels/SuiteDomainPanel";
import { DocumentsView } from "./editor/views/DocumentsView";
import { ProvidenceEditorShell } from "./editor/workbench/ProvidenceEditorShell";
import { WorkbenchRouter } from "./editor/workbench/WorkbenchRouter";

const DEFAULT_SCENARIO_ROOT = "F:\\Realmz\\base\\Realmz\\Scenarios";
const DEFAULT_PROJECT_ROOT = "F:\\Realmz - Providence\\projects";
const DEFAULT_EXPORT_ROOT = "F:\\Realmz - Providence\\exports";
let mapFocusNonce = 0;

export function App() {
  const desktopRuntime = hasDesktopRuntime();
  const browserFileSystem = !desktopRuntime && canUseBrowserFileSystem();
  const [workspaceDir] = useState(DEFAULT_WORKSPACE);
  const [projectDir, setProjectDir] = useState("");
  const [exportDir, setExportDir] = useState(DEFAULT_EXPORT);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("Untitled Scenario");
  const [state, dispatch] = useReducer(editorReducer, desktopRuntime, initialEditorState);

  const selectedMap = useMemo(
    () => state.project?.maps.find((map) => map.id === state.selectedMapId) ?? state.project?.maps[0] ?? null,
    [state.project, state.selectedMapId]
  );
  const selectedRandomLevel = useMemo(() => {
    return semanticRandomLevelForMap(state.project, selectedMap);
  }, [state.project, selectedMap]);
  const mapTriggers = useMemo(() => {
    return semanticTriggersForMap(state.project, selectedMap);
  }, [state.project, selectedMap]);
  const selectedTileset = useMemo(() => {
    return semanticTilesetForMap(state.project, selectedMap);
  }, [state.project, selectedMap]);
  const selectedMapRecords = useMemo(() => semanticMapRecordsForMap(state.project, selectedMap), [state.project, selectedMap]);
  const visibleIssues = useMemo(() => issuesFor(state.project), [state.project]);
  const selectedAtlas = selectedTileset ? state.atlasEntries[selectedTileset.id] ?? null : null;
  const undoLabel = state.past.length > 0 ? state.past[state.past.length - 1].label : null;
  const redoLabel = state.future.length > 0 ? state.future[0].label : null;
  const activeStatus = state.groupLabel
    ? `${state.groupLabel}${state.groupChangeCount ? ` (${state.groupChangeCount} cells)` : ""}`
    : state.lastCommandLabel ?? state.status;
  const importAllowed = Boolean(state.project && isProjectEmpty(state.project));
  const libraryIssueCount = state.libraryCatalog?.diagnostics.length ?? 0;
  const railIssueCount = visibleIssues.length + libraryIssueCount;

  useEffect(() => {
    if (!desktopRuntime) return;
    let disposed = false;
    void runProvidenceHarness((status) => {
      if (!disposed) dispatch({ type: "setStatus", status });
    });
    return () => {
      disposed = true;
    };
  }, [desktopRuntime]);

  useEffect(() => {
    if (desktopRuntime) return;
    const benchmarkProjectUrl = new URLSearchParams(window.location.search).get("benchmarkProject");
    if (!benchmarkProjectUrl) return;
    const url = benchmarkProjectUrl;
    let disposed = false;
    async function loadBenchmarkProject() {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const project = (await response.json()) as Project;
        if (!disposed) {
          setProjectDir(`browser-benchmark://${url}`);
          dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
          dispatch({ type: "setTab", tab: "scripts" });
          dispatch({ type: "setStatus", status: `Loaded benchmark project ${project.scenario.name}` });
        }
      } catch (error) {
        if (!disposed) dispatch({ type: "setStatus", status: `Benchmark project load failed: ${commandError(error)}` });
      }
    }
    void loadBenchmarkProject();
    return () => {
      disposed = true;
    };
  }, [desktopRuntime]);

  useEffect(() => {
    let disposed = false;
    async function loadWorkspace() {
      if (!desktopRuntime) {
        try {
          const catalog = await loadBundledLibraryCatalog();
          if (!disposed) {
            dispatch({ type: "setWorkspace", workspace: createBrowserWorkspace(catalog) });
            dispatch({ type: "setLibraryCatalog", catalog });
            dispatch({ type: "setStatus", status: "Bundled Divinity and Realmz libraries ready" });
          }
        } catch (error) {
          if (!disposed) {
            dispatch({ type: "setWorkspace", workspace: createBrowserWorkspace() });
            dispatch({ type: "setStatus", status: `Bundled library load failed: ${commandError(error)}` });
          }
        }
        return;
      }
      try {
        const workspace = await invoke<ProvidenceWorkspace>("open_workspace", { workspaceDir });
        if (!disposed) {
          dispatch({ type: "setWorkspace", workspace });
          dispatch({ type: "setStatus", status: "Workspace ready" });
        }
      } catch (error) {
        if (!disposed) {
          dispatch({ type: "setStatus", status: `Workspace open failed: ${commandError(error)}` });
        }
      }
    }
    loadWorkspace();
    return () => {
      disposed = true;
    };
  }, [desktopRuntime, workspaceDir]);

  useEffect(() => {
    document.documentElement.dataset.tutorial = state.tutorialEnabled ? "on" : "off";
  }, [state.tutorialEnabled]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "Escape" && state.groupLabel) {
        event.preventDefault();
        dispatch({ type: "cancelCommandGroup" });
        return;
      }
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
      } else if (key === "y") {
        event.preventDefault();
        dispatch({ type: "redo" });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.groupLabel]);

  useEffect(() => {
    let disposed = false;
    async function loadAtlases() {
      if (!state.project) {
        dispatch({ type: "setAtlases", entries: {}, status: "No atlases loaded" });
        return;
      }
      const loadable = state.project.assetCatalog.tilesets
        .map((asset) => ({ asset, url: desktopRuntime ? asset.imagePath : browserTilesetAtlasUrl(asset) }))
        .filter((entry): entry is { asset: TilesetAsset; url: string } => Boolean(entry.url));
      if (loadable.length === 0) {
        dispatch({ type: "setAtlases", entries: {}, status: "No tile atlases available" });
        return;
      }
      dispatch({
        type: "setAtlases",
        entries: {},
        status: `Loading ${loadable.length} tile atlas${loadable.length === 1 ? "" : "es"}...`
      });
      const pairs = await Promise.all(
        loadable.map(async ({ asset, url: assetUrl }) => {
          try {
            const url = desktopRuntime
              ? await invoke<string>("load_project_asset", { projectDir, relativePath: assetUrl })
              : assetUrl;
            const image = await loadImage(url);
            return [asset.id, { image, url, asset }] as const;
          } catch (error) {
            console.error(`Failed to load atlas ${asset.id}`, error);
            return null;
          }
        })
      );
      if (disposed) return;
      const entries: typeof state.atlasEntries = {};
      for (const pair of pairs) {
        if (pair) entries[pair[0]] = pair[1];
      }
      dispatch({
        type: "setAtlases",
        entries,
        status: `Loaded ${Object.keys(entries).length}/${loadable.length} tile atlases`
      });
    }
    loadAtlases();
    return () => {
      disposed = true;
    };
  }, [state.project, projectDir, desktopRuntime]);

  useEffect(() => {
    let disposed = false;
    async function loadIcons() {
      if (!state.project) {
        dispatch({ type: "setIcons", entries: {}, status: "No icon overlays loaded" });
        return;
      }
      const ids = [...new Set(state.project.maps.flatMap((map) => referencedMapIconIds(map.tiles)))].sort((a, b) => a - b);
      if (ids.length === 0) {
        dispatch({ type: "setIcons", entries: {}, status: "No icon overlays in maps" });
        return;
      }
      dispatch({
        type: "setIcons",
        entries: {},
        status: `Loading ${ids.length} map icon overlay${ids.length === 1 ? "" : "s"}...`
      });
      const pairs = await Promise.all(
        ids.map(async (id) => {
          try {
            const relativePath = `assets/icons/icon_${id}.png`;
            const url = desktopRuntime
              ? await invoke<string>("load_project_asset", { projectDir, relativePath })
              : browserReferenceIconUrl(id);
            const image = await loadImage(url);
            return [id, { id, image, url }] as const;
          } catch (error) {
            console.warn(`Failed to load map icon overlay ${id}`, error);
            return null;
          }
        })
      );
      if (disposed) return;
      const entries: typeof state.iconEntries = {};
      for (const pair of pairs) {
        if (pair) entries[pair[0]] = pair[1];
      }
      dispatch({
        type: "setIcons",
        entries,
        status: `Loaded ${Object.keys(entries).length}/${ids.length} map icon overlays`
      });
    }
    loadIcons();
    return () => {
      disposed = true;
    };
  }, [state.project, projectDir, desktopRuntime]);

  function showNewProjectDialog() {
    setProjectNameDraft(nextUntitledProjectName());
    setProjectDialogOpen(true);
  }

  async function createNewProject(projectNameInput = projectNameDraft) {
    const projectName = projectNameInput.trim();
    if (!projectName) {
      dispatch({ type: "setStatus", status: "Project name is required." });
      return;
    }
    setProjectDialogOpen(false);
    const targetProjectDir = defaultProjectPath(projectName);
    if (!desktopRuntime) {
      const project = createBrowserProject(projectName);
      setProjectDir(project.scenario.projectPath);
      setExportDir(defaultExportPath(project.scenario.name));
      dispatch({ type: "setProject", project, selectedMapId: null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({ type: "setStatus", status: `Created browser project ${project.scenario.name}` });
      return;
    }
    try {
      dispatch({ type: "setStatus", status: "Creating project..." });
      const project = await invoke<Project>("create_project", { projectName, projectDir: targetProjectDir });
      setProjectDir(targetProjectDir);
      setExportDir(defaultExportPath(project.scenario.name));
      dispatch({ type: "setProject", project, selectedMapId: null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({ type: "setStatus", status: `Created ${project.scenario.name}` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Create failed: ${commandError(error)}` });
    }
  }

  async function chooseExistingProject() {
    if (!desktopRuntime) {
      if (!browserFileSystem) {
        dispatch({ type: "setStatus", status: "Browser project opening needs File System Access support, such as Chrome or Edge." });
        return;
      }
      try {
        const handle = await pickBrowserProjectSource();
        try {
          const project = await openBrowserProject(handle);
          setProjectDir(`browser://${handle.name}`);
          setExportDir(defaultExportPath(project.scenario.name));
          dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
          dispatch({ type: "setTab", tab: "maps" });
          dispatch({ type: "setStatus", status: `Opened browser project ${project.scenario.name}` });
        } catch (error) {
          if (!isMissingProjectJson(error)) throw error;
          const project = createBrowserProject(handle.name);
          setProjectDir(`browser://${handle.name}`);
          setExportDir(defaultExportPath(project.scenario.name));
          dispatch({ type: "setProject", project, selectedMapId: null });
          dispatch({ type: "setTab", tab: "maps" });
          dispatch({ type: "setStatus", status: `Started empty browser project ${project.scenario.name}` });
        }
      } catch (error) {
        if (isBrowserPickerAbort(error)) {
          dispatch({ type: "setStatus", status: "Project selection cancelled" });
          return;
        }
        dispatch({ type: "setStatus", status: `Open failed: ${commandError(error)}` });
      }
      return;
    }
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: DEFAULT_PROJECT_ROOT,
      title: "Open Providence Project Package"
    });
    const selectedPath = normalizeDialogPath(selected);
    if (!selectedPath) return;
    setProjectDir(selectedPath);
    try {
      await openProjectFromDir(selectedPath);
    } catch (error) {
      dispatch({ type: "setStatus", status: `Open failed: ${commandError(error)}` });
    }
  }

  async function importScenario() {
    if (!state.project) {
      dispatch({ type: "setStatus", status: "Create or open a Providence project before importing a scenario." });
      return;
    }
    if (!isProjectEmpty(state.project)) {
      dispatch({ type: "setStatus", status: "Import is only available before the project contains maps, records, or resources." });
      return;
    }
    if (!desktopRuntime) {
      if (!browserFileSystem) {
        dispatch({ type: "setStatus", status: "Browser scenario import needs File System Access support, such as Chrome or Edge." });
        return;
      }
      try {
        dispatch({ type: "setStatus", status: "Reading scenario folder in browser..." });
        const handle = await pickBrowserScenarioSource();
        const importedProject = await importBrowserScenario(handle);
        const project = {
          ...importedProject,
          scenario: {
            ...importedProject.scenario,
            name: state.project.scenario.name,
            projectPath: state.project.scenario.projectPath
          }
        };
        setExportDir(defaultExportPath(project.scenario.name));
        dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
        dispatch({ type: "setTab", tab: "maps" });
        dispatch({ type: "setStatus", status: `Imported ${handle.name} into ${project.scenario.name}` });
      } catch (error) {
        if (isBrowserPickerAbort(error)) {
          dispatch({ type: "setStatus", status: "Scenario import cancelled" });
          return;
        }
        dispatch({ type: "setStatus", status: `Browser import failed: ${commandError(error)}` });
      }
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: DEFAULT_SCENARIO_ROOT,
        title: "Import Realmz Scenario Folder"
      });
      const selectedPath = normalizeDialogPath(selected);
      if (!selectedPath) return;
      dispatch({ type: "setStatus", status: "Importing scenario..." });
      const project = await invoke<Project>("import_scenario_into_project", {
        sourcePath: selectedPath,
        projectDir,
        projectName: state.project.scenario.name
      });
      dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
      dispatch({ type: "setTab", tab: "maps" });
      dispatch({ type: "setStatus", status: `Imported ${pathBaseName(selectedPath)} into ${project.scenario.name}` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Import failed: ${commandError(error)}` });
    }
  }

  async function openLibraryHub() {
    dispatch({ type: "setWorkbench", workbench: "library", tab: "combat" });
    dispatch({ type: "setActiveEditor", editor: "hub" });
    dispatch({ type: "setStatus", status: "Library workbench" });
  }

  function openProjectWorkbench() {
    dispatch({ type: "setWorkbench", workbench: "project", tab: state.project ? state.activeTab : "maps" });
    dispatch({ type: "setActiveEditor", editor: "domain" });
    dispatch({ type: "setStatus", status: state.project ? `Project workbench: ${state.project.scenario.name}` : "Project workbench" });
  }

  async function importDivinityLibraries() {
    await importLibraryCatalog("divinity-import");
  }

  async function importRealmzReferenceData() {
    await importLibraryCatalog("realmz-reference");
  }

  async function importLibraryCatalog(kind: "divinity-import" | "realmz-reference") {
    const label = kind === "divinity-import" ? "Divinity libraries" : "Realmz reference data";
    if (!desktopRuntime) {
      if (!browserFileSystem) {
        dispatch({ type: "setStatus", status: "Browser library refresh needs File System Access support, such as Chrome or Edge." });
        return;
      }
      try {
        dispatch({ type: "setStatus", status: `Refreshing ${label} in browser...` });
        const handle = await pickBrowserProjectSource();
        const catalog = await importBrowserLibrary(handle, kind);
        const workspace = createBrowserWorkspace(catalog);
        dispatch({ type: "setWorkspace", workspace });
        dispatch({ type: "setLibraryCatalog", catalog });
        dispatch({ type: "setWorkbench", workbench: "library", tab: kind === "divinity-import" ? "combat" : "rules" });
        dispatch({ type: "setActiveEditor", editor: "domain" });
        dispatch({ type: "setStatus", status: `Refreshed ${catalog.summary.sourceCount.toLocaleString()} ${label} source files` });
      } catch (error) {
        if (isBrowserPickerAbort(error)) {
          dispatch({ type: "setStatus", status: `${label} refresh cancelled` });
          return;
        }
        dispatch({ type: "setStatus", status: `${label} refresh failed: ${commandError(error)}` });
      }
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: kind === "divinity-import" ? DEFAULT_DIVINITY_ROOT : DEFAULT_REALMZ_DATA_ROOT,
        title: kind === "divinity-import" ? "Refresh From Divinity Library Folder" : "Refresh From Realmz Data Files Folder"
      });
      const selectedPath = normalizeDialogPath(selected);
      if (!selectedPath) return;
      dispatch({ type: "setStatus", status: `Refreshing ${label}...` });
      const command = kind === "divinity-import" ? "import_divinity_libraries" : "import_realmz_reference_data";
      const catalog = await invoke<LibraryCatalog>(command, { sourcePath: selectedPath, workspaceDir });
      const workspace = state.workspace ? { ...state.workspace, activeLibraryCatalog: catalog } : null;
      if (workspace) dispatch({ type: "setWorkspace", workspace });
      dispatch({ type: "setLibraryCatalog", catalog });
      dispatch({ type: "setWorkbench", workbench: "library", tab: kind === "divinity-import" ? "combat" : "rules" });
      dispatch({ type: "setActiveEditor", editor: "domain" });
      dispatch({ type: "setStatus", status: `Refreshed ${catalog.summary.sourceCount.toLocaleString()} ${label} source files` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `${label} refresh failed: ${commandError(error)}` });
    }
  }

  async function commitLibraryCatalog(catalog: LibraryCatalog, status: string) {
    const workspace = state.workspace
      ? { ...state.workspace, activeLibraryCatalog: catalog }
      : createBrowserWorkspace(catalog);
    dispatch({ type: "setWorkspace", workspace });
    dispatch({ type: "setLibraryCatalog", catalog });
    dispatch({ type: "setStatus", status });
    if (!desktopRuntime) return;
    try {
      await invoke("save_workspace", { workspaceDir, workspace });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Library save failed: ${commandError(error)}` });
    }
  }

  async function createDraftEntry(spec: LibraryDraftSpec) {
    const managedPath = state.workspace?.managedLibraryPath ?? "browser://workspace/library";
    const { catalog, entity } = createLibraryDraft(state.libraryCatalog, managedPath, spec);
    dispatch({ type: "selectEntity", entity: { type: "record", id: entity.id } });
    await commitLibraryCatalog(catalog, `Created ${entity.label}`);
  }

  async function updateDraftEntry(entityId: string, changes: { label?: string; notes?: string }) {
    if (!state.libraryCatalog) return;
    const catalog = updateLibraryDraft(state.libraryCatalog, entityId, changes);
    await commitLibraryCatalog(catalog, "Updated draft entry");
  }

  async function openProjectFromDir(dir: string) {
    dispatch({ type: "setStatus", status: "Opening project..." });
    const project = await invoke<Project>("open_project", { projectDir: dir });
    setProjectDir(dir);
    setExportDir(defaultExportPath(project.scenario.name));
    dispatch({ type: "setProject", project, selectedMapId: project.maps[0]?.id ?? null });
    dispatch({ type: "setTab", tab: "maps" });
    dispatch({ type: "setStatus", status: `Opened ${project.scenario.name}` });
  }

  async function saveProject() {
    if (!state.project) return;
    if (!desktopRuntime) {
      dispatch({ type: "setStatus", status: BROWSER_PREVIEW_STATUS });
      return;
    }
    try {
      dispatch({ type: "setStatus", status: "Saving project..." });
      const project = await invoke<Project>("save_project", { projectDir, project: state.project });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setStatus", status: "Project saved" });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Save failed: ${commandError(error)}` });
    }
  }

  async function exportProject() {
    if (!state.project) return;
    if (!desktopRuntime) {
      dispatch({ type: "setStatus", status: BROWSER_PREVIEW_STATUS });
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: parentPath(exportDir || defaultExportPath(state.project.scenario.name)) || DEFAULT_EXPORT_ROOT,
        title: "Choose Realmz Scenario Export Folder"
      });
      const selectedPath = normalizeDialogPath(selected);
      if (!selectedPath) return;
      dispatch({ type: "setStatus", status: "Exporting scenario folder..." });
      const targetExportDir = selectedPath;
      setExportDir(targetExportDir);
      const report = await invoke<ExportReport>("export_project", {
        projectDir,
        project: state.project,
        outputDir: targetExportDir
      });
      dispatch({ type: "setExportReport", report });
      dispatch({ type: "setStatus", status: `Exported ${report.writtenFiles.length} supported files` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Export failed: ${commandError(error)}` });
    }
  }

  async function validateProject() {
    if (!state.project) return;
    if (!desktopRuntime) {
      const validation = validateBrowserProject(state.project);
      dispatch({ type: "setValidation", validation });
      dispatch({ type: "setStatus", status: validation.ok ? "Browser validation passed" : "Browser validation found issues" });
      return;
    }
    try {
      const validation = await invoke<ValidationReport>("validate_project", { project: state.project });
      dispatch({ type: "setValidation", validation });
      dispatch({ type: "setStatus", status: validation.ok ? "Validation passed" : "Validation found issues" });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Validation failed: ${commandError(error)}` });
    }
  }

  async function benchmarkProject() {
    if (!state.project) return;
    if (!desktopRuntime) {
      const report = benchmarkBrowserProject(state.project);
      dispatch({ type: "setBenchmark", report });
      dispatch({ type: "setStatus", status: `Browser benchmark checked ${report.estimatedCanvasTiles.toLocaleString()} canvas tiles` });
      return;
    }
    try {
      const report = await invoke<BenchmarkReport>("benchmark_project", { project: state.project });
      dispatch({ type: "setBenchmark", report });
      dispatch({ type: "setStatus", status: `Benchmark checked ${report.estimatedCanvasTiles.toLocaleString()} canvas tiles` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Benchmark failed: ${commandError(error)}` });
    }
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
      if (state.activeTab === "scripts" || state.activeTab === "records" || state.activeTab === "encounters") {
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

  async function importMediaAssets(files: File[], kind: ManagedAssetKind) {
    if (!state.project || files.length === 0) return;
    let project = state.project;
    try {
      dispatch({ type: "setStatus", status: `Importing ${files.length} ${kind} asset(s)...` });
      for (const file of files) {
        const request = await fileToMediaAssetRequest(file, kind, nextResourceId(project.assets ?? [], kind));
        if (desktopRuntime) {
          project = await invoke<Project>("import_project_media_asset", { projectDir, project, request });
          dispatch({ type: "markSaved", project });
        } else {
          const asset = requestToBrowserAsset(request);
          project = { ...project, assets: [...(project.assets ?? []), asset] };
          dispatch({ type: "applyCommand", command: { kind: "attachProjectAsset", label: `Import ${asset.label}`, asset } });
        }
      }
      if (desktopRuntime) {
        dispatch({ type: "setProject", project, selectedMapId: state.selectedMapId });
      }
      dispatch({ type: "setStatus", status: `Imported ${files.length} ${kind} asset(s)` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Asset import failed: ${commandError(error)}` });
    }
  }

  async function updateManagedAsset(assetId: string, changes: { label?: string; resourceId?: number }) {
    if (!state.project) return;
    if (!desktopRuntime) {
      dispatch({ type: "applyCommand", command: { kind: "updateProjectAsset", label: "Update asset", assetId, changes } });
      return;
    }
    try {
      const project = await invoke<Project>("update_project_asset", {
        projectDir,
        project: state.project,
        assetId,
        label: changes.label ?? null,
        resourceId: changes.resourceId ?? null
      });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setProject", project, selectedMapId: state.selectedMapId });
      dispatch({ type: "setStatus", status: "Asset updated" });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Asset update failed: ${commandError(error)}` });
    }
  }

  async function replaceManagedAsset(assetId: string, file: File) {
    if (!state.project) return;
    const existing = state.project.assets.find((asset) => asset.id === assetId);
    if (!existing) {
      dispatch({ type: "setStatus", status: "Asset replace failed: asset no longer exists." });
      return;
    }
    try {
      dispatch({ type: "setStatus", status: `Replacing ${existing.label}...` });
      const request = await fileToMediaAssetRequest(file, existing.kind, existing.resourceId);
      if (!desktopRuntime) {
        const asset = requestToBrowserReplacement(request, existing);
        dispatch({ type: "applyCommand", command: { kind: "replaceProjectAsset", label: `Replace ${existing.label}`, assetId, asset } });
        dispatch({ type: "setStatus", status: `Replaced ${existing.label}` });
        return;
      }
      const project = await invoke<Project>("replace_project_media_asset", {
        projectDir,
        project: state.project,
        assetId,
        request
      });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setProject", project, selectedMapId: state.selectedMapId });
      dispatch({ type: "setStatus", status: `Replaced ${existing.label}` });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Asset replace failed: ${commandError(error)}` });
    }
  }

  async function deleteManagedAsset(assetId: string) {
    if (!state.project) return;
    if (!desktopRuntime) {
      dispatch({ type: "applyCommand", command: { kind: "deleteProjectAsset", label: "Delete asset", assetId } });
      return;
    }
    try {
      const project = await invoke<Project>("delete_project_asset", { projectDir, project: state.project, assetId });
      dispatch({ type: "markSaved", project });
      dispatch({ type: "setProject", project, selectedMapId: state.selectedMapId });
      dispatch({ type: "setStatus", status: "Asset deleted" });
    } catch (error) {
      dispatch({ type: "setStatus", status: `Asset delete failed: ${commandError(error)}` });
    }
  }

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
      onLibrary={openLibraryHub}
      onProject={openProjectWorkbench}
      onDocuments={() => setDocumentsOpen(true)}
      onToggleTutorial={() => dispatch({ type: "setTutorialEnabled", enabled: !state.tutorialEnabled })}
      onNewProject={showNewProjectDialog}
      onOpenProject={chooseExistingProject}
      onImportScenario={importScenario}
      onImportDivinity={importDivinityLibraries}
      onImportRealmz={importRealmzReferenceData}
      onUndo={() => dispatch({ type: "undo" })}
      onRedo={() => dispatch({ type: "redo" })}
      onSave={saveProject}
      onExport={exportProject}
      onSelectDomain={(domain) => {
        dispatch({ type: "setActiveDomain", domain });
        dispatch({ type: "setActiveEditor", editor: "domain" });
      }}
      onSelectEditor={(editor) => dispatch({ type: "setActiveEditor", editor })}
    >
      <WorkbenchRouter
        state={state}
        emptyProjectView={
          <ProjectStart
            desktopRuntime={desktopRuntime}
            browserFileSystem={browserFileSystem}
            onNewProject={showNewProjectDialog}
            onOpenProject={chooseExistingProject}
            onImportScenario={importScenario}
            onLibraryHub={openLibraryHub}
            onImportDivinity={importDivinityLibraries}
            onImportRealmz={importRealmzReferenceData}
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
        browserFileSystem={browserFileSystem}
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
        onSetTool={(tool) => dispatch({ type: "setTool", tool })}
        onSetZoom={(zoom) => dispatch({ type: "setZoom", zoom })}
        onSetSmoothTiles={(value) => dispatch({ type: "setSmoothTiles", value })}
        onSetViewFlag={(flag: MapViewFlag, value: boolean) => dispatch({ type: "setMapViewFlag", flag, value })}
        onSetShowTriggers={(value) => dispatch({ type: "setShowTriggers", value })}
        onSetShowRandomRects={(value) => dispatch({ type: "setShowRandomRects", value })}
        onSetShowMapRecords={(value) => dispatch({ type: "setShowMapRecords", value })}
        onClearSelection={clearMapSelection}
        onBeginPaintStroke={(label) => dispatch({ type: "beginCommandGroup", label })}
        onApplyCommand={applyProjectCommand}
        onCommitPaintStroke={() => dispatch({ type: "commitCommandGroup" })}
        onCancelPaintStroke={() => dispatch({ type: "cancelCommandGroup" })}
        onImportDivinity={importDivinityLibraries}
        onImportRealmz={importRealmzReferenceData}
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
        <DocumentsView
          initialSection={state.docsSection}
          onSectionChange={(section) => dispatch({ type: "setDocsSection", section })}
          onClose={() => setDocumentsOpen(false)}
        />
      )}
    </ProvidenceEditorShell>
  );
}

function ProjectNameDialog({
  value,
  onChange,
  onCancel,
  onCreate
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="project-name-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <div className="panel-header">
          <span>New Providence Project</span>
        </div>
        <div className="project-name-dialog-body">
          <label>
            <span>Project Name</span>
            <input autoFocus value={value} onChange={(event) => onChange(event.currentTarget.value)} />
          </label>
          <p>Providence will create this project under the default project directory. Import remains available only while the project is empty.</p>
        </div>
        <div className="project-name-dialog-actions">
          <button className="btn btn-ghost" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={!value.trim()}>
            Create Project
          </button>
        </div>
      </form>
    </div>
  );
}

function ProjectStart({
  desktopRuntime,
  browserFileSystem,
  onNewProject,
  onOpenProject,
  onImportScenario,
  onLibraryHub,
  onImportDivinity,
  onImportRealmz,
  onDocuments
}: {
  desktopRuntime: boolean;
  browserFileSystem: boolean;
  onNewProject: () => void;
  onOpenProject: () => void;
  onImportScenario: () => void;
  onLibraryHub: () => void;
  onImportDivinity: () => void;
  onImportRealmz: () => void;
  onDocuments: () => void;
}) {
  const canImport = desktopRuntime || browserFileSystem;
  return (
    <section className="project-start">
      <div className="project-start-panel">
        <div className="project-start-mark">RP</div>
        <h1>Realmz Providence</h1>
        <p>Create a scenario project, open an existing project, or work in the bundled Realmz/Divinity library before a scenario exists.</p>
        <div className="project-start-actions">
          <button className="btn btn-primary" type="button" onClick={onNewProject}>
            <FilePlus2 size={16} />
            New Project
          </button>
          <button
            className="btn"
            type="button"
            onClick={onOpenProject}
            disabled={!desktopRuntime && !browserFileSystem}
            title={desktopRuntime || browserFileSystem ? "Open Providence project package" : BROWSER_PREVIEW_STATUS}
          >
            <FolderOpen size={16} />
            Open Project
          </button>
          <button className="btn" type="button" onClick={onLibraryHub}>
            <LibraryBig size={16} />
            Library Hub
          </button>
          <button className="btn" type="button" onClick={onDocuments}>
            <BookOpen size={16} />
            Documents
          </button>
          <button
            className="btn"
            type="button"
            onClick={onImportScenario}
            disabled={!canImport}
            title="Available after creating or opening an empty Providence project"
          >
            <Upload size={16} />
            Import Scenario
          </button>
          <button className="btn" type="button" onClick={onImportDivinity} disabled={!canImport}>
            <LibraryBig size={16} />
            Refresh Divinity
          </button>
          <button className="btn" type="button" onClick={onImportRealmz} disabled={!canImport}>
            <Database size={16} />
            Refresh Realmz Data
          </button>
        </div>
        <small>{desktopRuntime ? "Projects are created under F:\\Realmz - Providence\\projects. Bundled libraries are seeded automatically." : "Browser preview loads bundled library fixtures into memory."}</small>
      </div>
    </section>
  );
}

function GridButtonGlyph() {
  return <span className="grid-button-glyph" aria-hidden="true">RP</span>;
}

function normalizeDialogPath(value: string | string[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function pathBaseName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || "Untitled Scenario";
}

function parentPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return "";
  const driveMatch = path.match(/^[A-Za-z]:/);
  const parentParts = parts.slice(0, -1);
  if (driveMatch && parentParts[0] === driveMatch[0]) {
    return `${parentParts[0]}\\${parentParts.slice(1).join("\\")}`;
  }
  return parentParts.join("\\");
}

function defaultProjectPath(scenarioName: string) {
  return `${DEFAULT_PROJECT_ROOT}\\${sanitizePackageName(scenarioName)}.providence`;
}

function defaultExportPath(scenarioName: string) {
  return `${DEFAULT_EXPORT_ROOT}\\${sanitizePackageName(scenarioName)}`;
}

function nextUntitledProjectName() {
  return `Untitled Scenario ${new Date().toISOString().slice(0, 10)}`;
}

function isMissingProjectJson(error: unknown) {
  const message = commandError(error).toLowerCase();
  return message.includes("project.json") || message.includes("notfound") || message.includes("not found");
}

function isProjectEmpty(project: Project) {
  return (
    project.maps.length === 0 &&
    project.triggers.length === 0 &&
    project.randomLevels.length === 0 &&
    project.extracodes.length === 0 &&
    project.source.files.length === 0 &&
    project.semanticSchema.records.length === 0 &&
    project.semanticSchema.entities.length === 0 &&
    project.records.alignments.length === 0 &&
    Object.keys(project.records.counts).length === 0
  );
}

function sanitizePackageName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Untitled Scenario";
}

function nextMapFocusNonce() {
  mapFocusNonce += 1;
  return mapFocusNonce;
}

function mapIdForEntity(project: Project | null, id: string) {
  if (!project) return null;
  const triggerMatch = id.match(/^trigger:(land|dungeon):(\d+):\d+$/);
  if (triggerMatch) return `${triggerMatch[1]}:${triggerMatch[2]}`;
  const randomMatch = id.match(/^random:(land|dungeon):(\d+):\d+$/);
  if (randomMatch) return `${randomMatch[1]}:${randomMatch[2]}`;
  const entity = project.semanticSchema.entities.find((candidate) => candidate.id === id);
  if (!entity) return null;
  if (entity.type === "trigger" || entity.type === "random-region") {
    const levelType = stringSummary(entity, "levelType");
    const levelIndex = numberSummary(entity, "levelIndex");
    if (levelType && levelIndex != null) return `${levelType}:${levelIndex}`;
  }
  if (entity.type === "map record") {
    const level = numberSummary(entity, "level");
    const isDungeon = booleanSummary(entity, "isDungeon");
    if (level != null && isDungeon != null) return `${isDungeon ? "dungeon" : "land"}:${level}`;
  }
  const mapLink = project.semanticSchema.links.find(
    (link) =>
      link.from === id &&
      ["located_on", "describes_map", "occupies_region", "names_map_level"].includes(link.kind) &&
      link.to.startsWith("map:")
  );
  return mapLink ? mapLink.to.replace(/^map:/, "") : null;
}

function stringSummary(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "string" ? value : null;
}

function numberSummary(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : null;
}

function booleanSummary(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "boolean" ? value : null;
}
