import {
  AtlasEntry,
  ActiveWorkbench,
  BenchmarkReport,
  EditorTab,
  EditorTool,
  FocusedPanel,
  IconEntry,
  LibraryCatalog,
  MapViewFlag,
  MapViewOptions,
  OverlayPreset,
  ExportReport,
  MapFocusTarget,
  Project,
  ProjectCommand,
  ProvidenceWorkspace,
  SelectedEntity,
  SemanticSchema,
  SidePanelMode,
  ValidationReport
} from "./types";
import { applyProjectCommand, projectCommandChangeCount, projectCommandLabel } from "./projectCommands";

export const BROWSER_PREVIEW_STATUS = "Browser preview: choose a scenario folder in Chrome/Edge, or use the desktop app for save/export";
const UNDO_LIMIT = 50;

export type HistoryEntry = {
  project: Project;
  label: string;
};

export type EditorState = MapViewOptions & {
  workspace: ProvidenceWorkspace | null;
  libraryCatalog: LibraryCatalog | null;
  activeWorkbench: ActiveWorkbench;
  activeDomain: EditorTab;
  activeEditor: string;
  focusedPanel: FocusedPanel;
  leftPanelMode: SidePanelMode;
  rightPanelMode: SidePanelMode;
  overlayDrawerOpen: boolean;
  overlayPreset: OverlayPreset;
  docsSection: string;
  tutorialEnabled: boolean;
  panelState: Record<string, { collapsed?: boolean; size?: number }>;
  project: Project | null;
  selectedMapId: string | null;
  selectedTile: number;
  selectedCell: { x: number; y: number; tile: number } | null;
  selectedEntity: SelectedEntity | null;
  activeTab: EditorTab;
  activeTool: EditorTool;
  status: string;
  dirty: boolean;
  exportReport: ExportReport | null;
  benchmark: BenchmarkReport | null;
  zoom: number;
  smoothTiles: boolean;
  past: HistoryEntry[];
  future: HistoryEntry[];
  groupBaseProject: Project | null;
  groupDirtyBefore: boolean;
  groupLabel: string | null;
  groupChangeCount: number;
  lastCommandLabel: string | null;
  focusTarget: MapFocusTarget | null;
  atlasEntries: Record<string, AtlasEntry>;
  atlasStatus: string;
  iconEntries: Record<number, IconEntry>;
  iconStatus: string;
};

export type EditorAction =
  | { type: "setWorkspace"; workspace: ProvidenceWorkspace | null }
  | { type: "setLibraryCatalog"; catalog: LibraryCatalog | null }
  | { type: "setWorkbench"; workbench: ActiveWorkbench; tab?: EditorTab }
  | { type: "setActiveDomain"; domain: EditorTab }
  | { type: "setActiveEditor"; editor: string }
  | { type: "setFocusedPanel"; panel: FocusedPanel }
  | { type: "setLeftPanelMode"; mode: SidePanelMode }
  | { type: "setRightPanelMode"; mode: SidePanelMode }
  | { type: "setOverlayDrawerOpen"; open: boolean }
  | { type: "setOverlayPreset"; preset: OverlayPreset }
  | { type: "setDocsSection"; section: string }
  | { type: "setTutorialEnabled"; enabled: boolean }
  | { type: "togglePanelCollapsed"; panelId: string }
  | { type: "setProject"; project: Project | null; selectedMapId?: string | null }
  | { type: "setReferenceTileAttributes"; tileAttributes: Project["tileAttributes"]; assetCatalog: Project["assetCatalog"]; validation?: ValidationReport }
  | { type: "setSemanticSchema"; schema: SemanticSchema; validation?: ValidationReport }
  | { type: "replaceProject"; project: Project }
  | { type: "markSaved"; project: Project }
  | { type: "setValidation"; validation: ValidationReport }
  | { type: "applyCommand"; command: ProjectCommand }
  | { type: "beginCommandGroup"; label: string }
  | { type: "commitCommandGroup" }
  | { type: "cancelCommandGroup" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "setSelectedMap"; id: string | null }
  | { type: "setSelectedTile"; tile: number }
  | { type: "setSelectedCell"; cell: { x: number; y: number; tile: number } | null }
  | { type: "selectEntity"; entity: SelectedEntity | null }
  | { type: "setTab"; tab: EditorTab }
  | { type: "setTool"; tool: EditorTool }
  | { type: "setStatus"; status: string }
  | { type: "setExportReport"; report: ExportReport | null }
  | { type: "setBenchmark"; report: BenchmarkReport | null }
  | { type: "setMapFocusTarget"; target: MapFocusTarget | null }
  | { type: "setZoom"; zoom: number }
  | { type: "setSmoothTiles"; value: boolean }
  | { type: "setMapViewFlag"; flag: MapViewFlag; value: boolean }
  | { type: "setShowTriggers"; value: boolean }
  | { type: "setShowRandomRects"; value: boolean }
  | { type: "setShowMapRecords"; value: boolean }
  | { type: "setAtlases"; entries: Record<string, AtlasEntry>; status: string }
  | { type: "setIcons"; entries: Record<number, IconEntry>; status: string };

export function initialEditorState(desktopRuntime: boolean): EditorState {
  return {
    workspace: null,
    libraryCatalog: null,
    activeWorkbench: "project",
    activeDomain: "maps",
    activeEditor: "hub",
    focusedPanel: "main",
    leftPanelMode: "auto",
    rightPanelMode: "auto",
    overlayDrawerOpen: false,
    overlayPreset: "authoring",
    docsSection: "getting-started",
    tutorialEnabled: true,
    panelState: {},
    project: null,
    selectedMapId: null,
    selectedTile: 1,
    selectedCell: null,
    selectedEntity: null,
    activeTab: "maps",
    activeTool: "select",
    status: desktopRuntime ? "Ready" : BROWSER_PREVIEW_STATUS,
    dirty: false,
    exportReport: null,
    benchmark: null,
    zoom: 1,
    smoothTiles: true,
    showRealTiles: true,
    showDecodedColors: false,
    showRealmzCoordinates: true,
    showTriggers: true,
    showRandomRects: true,
    showMapRecords: true,
    showEncounterOverlays: true,
    showQuestOverlays: true,
    showMapOverlays: true,
    showBattleOverlays: true,
    showTextOverlays: true,
    showUnknownOverlays: true,
    showSecretOverlays: true,
    past: [],
    future: [],
    groupBaseProject: null,
    groupDirtyBefore: false,
    groupLabel: null,
    groupChangeCount: 0,
    lastCommandLabel: null,
    focusTarget: null,
    atlasEntries: {},
    atlasStatus: "No atlases loaded",
    iconEntries: {},
    iconStatus: "No icon overlays loaded"
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "setWorkspace":
      return {
        ...state,
        workspace: action.workspace,
        libraryCatalog: action.workspace?.activeLibraryCatalog ?? state.libraryCatalog
      };
    case "setLibraryCatalog":
      return {
        ...state,
        libraryCatalog: action.catalog,
        workspace: state.workspace ? { ...state.workspace, activeLibraryCatalog: action.catalog } : state.workspace
      };
    case "setWorkbench":
      return {
        ...state,
        activeWorkbench: action.workbench,
        activeTab: action.tab ?? state.activeTab,
        activeDomain: action.tab ?? state.activeDomain
      };
    case "setActiveDomain":
      return {
        ...state,
        activeDomain: action.domain,
        activeTab: action.domain,
        activeEditor: "domain"
      };
    case "setActiveEditor":
      return { ...state, activeEditor: action.editor };
    case "setFocusedPanel":
      return { ...state, focusedPanel: action.panel };
    case "setLeftPanelMode":
      return { ...state, leftPanelMode: action.mode };
    case "setRightPanelMode":
      return { ...state, rightPanelMode: action.mode };
    case "setOverlayDrawerOpen":
      return { ...state, overlayDrawerOpen: action.open };
    case "setOverlayPreset":
      return { ...state, overlayPreset: action.preset };
    case "setDocsSection":
      return { ...state, docsSection: action.section };
    case "setTutorialEnabled":
      return { ...state, tutorialEnabled: action.enabled };
    case "togglePanelCollapsed": {
      const existing = state.panelState[action.panelId] ?? {};
      return {
        ...state,
        panelState: {
          ...state.panelState,
          [action.panelId]: { ...existing, collapsed: !existing.collapsed }
        }
      };
    }
    case "setProject":
      return {
        ...state,
        activeWorkbench: action.project ? "project" : state.activeWorkbench,
        project: action.project,
        selectedMapId: action.selectedMapId ?? action.project?.maps[0]?.id ?? null,
        selectedCell: null,
        selectedEntity: action.project?.maps[0]
          ? { type: "map", id: `map:${action.project.maps[0].levelType}:${action.project.maps[0].index}` }
          : null,
        dirty: false,
        exportReport: null,
        benchmark: null,
        past: [],
        future: [],
        groupBaseProject: null,
        groupDirtyBefore: false,
        groupLabel: null,
        groupChangeCount: 0,
        lastCommandLabel: null,
        focusTarget: null,
        atlasEntries: {},
        atlasStatus: action.project ? "Tile atlases will load when needed" : "No atlases loaded",
        iconEntries: {},
        iconStatus: action.project ? "Icon overlays will load when needed" : "No icon overlays loaded"
      };
    case "setSemanticSchema":
      return state.project
        ? {
            ...state,
            project: {
              ...state.project,
              semanticSchema: action.schema,
              validation: action.validation ?? state.project.validation
            }
          }
        : state;
    case "setReferenceTileAttributes":
      return state.project
        ? {
            ...state,
            project: {
              ...state.project,
              tileAttributes: action.tileAttributes,
              assetCatalog: action.assetCatalog,
              validation: action.validation ?? state.project.validation
            }
          }
        : state;
    case "replaceProject":
      return {
        ...state,
        project: action.project,
        dirty: true,
        past: state.project ? pushHistory(state.past, state.project, "Project change") : state.past,
        future: [],
        lastCommandLabel: "Project change"
      };
    case "markSaved":
      return { ...state, project: action.project, dirty: false };
    case "setValidation":
      return state.project
        ? { ...state, project: { ...state.project, validation: action.validation }, activeTab: "linter" }
        : state;
    case "beginCommandGroup":
      if (!state.project || state.groupBaseProject) return state;
      return {
        ...state,
        groupBaseProject: state.project,
        groupDirtyBefore: state.dirty,
        groupLabel: action.label,
        groupChangeCount: 0,
        lastCommandLabel: null
      };
    case "applyCommand": {
      if (!state.project) return state;
      const nextProject = applyProjectCommand(state.project, action.command);
      if (nextProject === state.project) return state;
      const label = projectCommandLabel(action.command);
      if (state.groupBaseProject) {
        return {
          ...state,
          project: nextProject,
          dirty: true,
          future: [],
          groupChangeCount: state.groupChangeCount + projectCommandChangeCount(action.command),
          lastCommandLabel: label
        };
      }
      return {
        ...state,
        project: nextProject,
        dirty: true,
        past: pushHistory(state.past, state.project, label),
        future: [],
        lastCommandLabel: label
      };
    }
    case "commitCommandGroup": {
      if (!state.groupBaseProject) return state;
      const changed = Boolean(state.project && state.project !== state.groupBaseProject);
      const label = groupedLabel(state.groupLabel, state.groupChangeCount);
      return {
        ...state,
        dirty: changed ? true : state.groupDirtyBefore,
        past: changed ? pushHistory(state.past, state.groupBaseProject, label) : state.past,
        future: changed ? [] : state.future,
        groupBaseProject: null,
        groupDirtyBefore: false,
        groupLabel: null,
        groupChangeCount: 0,
        lastCommandLabel: changed ? label : null
      };
    }
    case "cancelCommandGroup":
      if (!state.groupBaseProject) return state;
      return {
        ...state,
        project: state.groupBaseProject,
        dirty: state.groupDirtyBefore,
        groupBaseProject: null,
        groupDirtyBefore: false,
        groupLabel: null,
        groupChangeCount: 0,
        lastCommandLabel: "Cancelled edit"
      };
    case "undo": {
      if (state.groupBaseProject) {
        return {
          ...state,
          project: state.groupBaseProject,
          dirty: state.groupDirtyBefore,
          groupBaseProject: null,
          groupDirtyBefore: false,
          groupLabel: null,
          groupChangeCount: 0,
          lastCommandLabel: "Cancelled edit"
        };
      }
      if (!state.project || state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        ...state,
        project: previous.project,
        dirty: true,
        past: state.past.slice(0, -1),
        future: [{ project: state.project, label: previous.label }, ...state.future],
        lastCommandLabel: `Undid ${previous.label}`
      };
    }
    case "redo": {
      if (state.groupBaseProject) return state;
      if (!state.project || state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        project: next.project,
        dirty: true,
        past: pushHistory(state.past, state.project, next.label),
        future: state.future.slice(1),
        lastCommandLabel: `Redid ${next.label}`
      };
    }
    case "setSelectedMap": {
      const pendingGroupChanged = Boolean(state.groupBaseProject && state.project && state.project !== state.groupBaseProject);
      const pendingGroupLabel = groupedLabel(state.groupLabel, state.groupChangeCount);
      return {
        ...state,
        selectedMapId: action.id,
        selectedCell: null,
        selectedEntity: mapSelectionFor(state.project, action.id),
        focusTarget: null,
        dirty: pendingGroupChanged ? true : state.dirty,
        past: pendingGroupChanged && state.groupBaseProject ? pushHistory(state.past, state.groupBaseProject, pendingGroupLabel) : state.past,
        future: pendingGroupChanged ? [] : state.future,
        groupBaseProject: null,
        groupDirtyBefore: false,
        groupLabel: null,
        groupChangeCount: 0,
        lastCommandLabel: pendingGroupChanged ? pendingGroupLabel : state.lastCommandLabel
      };
    }
    case "setSelectedTile":
      return { ...state, selectedTile: action.tile };
    case "setSelectedCell":
      return {
        ...state,
        selectedCell: action.cell,
        selectedEntity: action.cell ? null : state.selectedEntity,
        focusTarget: action.cell ? null : state.focusTarget
      };
    case "selectEntity":
      return { ...state, selectedEntity: action.entity };
    case "setTab":
      return { ...state, activeTab: action.tab, activeDomain: action.tab };
    case "setTool":
      return { ...state, activeTool: action.tool };
    case "setStatus":
      return { ...state, status: action.status };
    case "setExportReport":
      return { ...state, exportReport: action.report, activeTab: action.report ? "export" : state.activeTab };
    case "setBenchmark":
      return { ...state, benchmark: action.report, activeTab: action.report ? "export" : state.activeTab };
    case "setMapFocusTarget":
      return { ...state, focusTarget: action.target };
    case "setZoom":
      return { ...state, zoom: Math.max(0.25, Math.min(6, action.zoom)) };
    case "setSmoothTiles":
      return { ...state, smoothTiles: action.value };
    case "setMapViewFlag":
      return { ...state, [action.flag]: action.value };
    case "setShowTriggers":
      return { ...state, showTriggers: action.value };
    case "setShowRandomRects":
      return { ...state, showRandomRects: action.value };
    case "setShowMapRecords":
      return { ...state, showMapRecords: action.value };
    case "setAtlases":
      return { ...state, atlasEntries: action.entries, atlasStatus: action.status };
    case "setIcons":
      return { ...state, iconEntries: action.entries, iconStatus: action.status };
    default:
      return state;
  }
}

function pushHistory(history: HistoryEntry[], project: Project, label: string) {
  return [...history, { project, label }].slice(-UNDO_LIMIT);
}

function groupedLabel(label: string | null, count: number) {
  if (!label) return "Project edit";
  if (count <= 1) return label;
  return `${label} (${count} cells)`;
}

function mapSelectionFor(project: Project | null, id: string | null): SelectedEntity | null {
  if (!project || !id) return null;
  const map = project.maps.find((candidate) => candidate.id === id);
  if (!map) return null;
  return { type: "map", id: `map:${map.levelType}:${map.index}` };
}
