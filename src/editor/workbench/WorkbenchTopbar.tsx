import { useRef } from "react";
import { BookOpen, ChevronLeft, ChevronRight, CircleHelp, Download, FilePlus2, FolderOpen, LayoutDashboard, LibraryBig, RefreshCcw, Save, Search, Upload, X } from "lucide-react";
import { ActiveWorkbench } from "../types";
import { IconButton } from "../components/IconButton";
import { TutorialTip } from "../components/TutorialTip";
import { SegmentedControl, type SegmentedControlOption } from "../ui";

const TOPBAR_SEARCH_HELP =
  "Global Search jumps across scenario records, maps, scripts, strings, assets, bundled libraries, documentation, and diagnostics. Use Ctrl+K, then try shortcuts like monster 12, pict 304, string 349, or macro 143.";
const TOPBAR_DOCUMENTS_HELP =
  "Documents opens the Providence authoring manual: editor controls, record fields, complete workflows, troubleshooting, and release guidance.";
const TOPBAR_HELP_HELP =
  "Help On enables hover and focus help bubbles throughout the current tool. Turn it off when you want a quieter workspace; the Documents handbook remains available either way.";
const TOPBAR_MANUAL_HELP =
  "Triple-click the Realmz Providence mark to open the local Divinity Manual when you need original Realmz terminology or historical editor context.";
const TOPBAR_RUNTIME_HELP =
  "The runtime badge tells you whether you are in the desktop app or browser preview. Desktop can write project folders and export Realmz scenario folders; browser mode saves projects locally in the browser.";
const TOPBAR_DIRTY_HELP =
  "Dirty means the Providence project has unsaved editor changes. Desktop Save writes the project package; browser Save stores the project locally in this browser.";
const TOPBAR_EDITING_HELP =
  "Editing appears while a text field or editable control owns focus. Keyboard shortcuts may defer to that field until editing ends.";
const TOPBAR_WORKBENCH_HELP =
  "Project contains the active scenario and its authoring tools. Library contains reusable Providence material and bundled Realmz and Divinity references; library records and assets are not automatically project-owned content.";
const TOPBAR_NEW_PROJECT_HELP =
  "New creates a Providence package with an editable land level 0. Use Import before authoring project content when starting from a raw Realmz scenario.";
const TOPBAR_OPEN_PROJECT_HELP =
  "Open loads an existing Providence project. Select a .providence.zip package or project.json on desktop; browser mode opens downloaded .providence.zip packages. Use Import for raw Realmz scenario folders.";
const TOPBAR_CLOSE_PROJECT_HELP =
  "Close returns to the Providence start screen. In browser mode it pauses auto-resume without deleting the saved project from browser storage; use Resume Local on the start screen to reopen it.";
const TOPBAR_IMPORT_HELP =
  "Import reads a Realmz scenario folder into an empty Providence project, keeping source snapshots so export can preserve unsupported files safely.";
const TOPBAR_UNDO_HELP =
  "Undo reverses the latest Providence project command, such as edits to maps, records, resources, or editor metadata.";
const TOPBAR_REDO_HELP =
  "Redo reapplies an undone Providence project command when history is available.";
const TOPBAR_SAVE_HELP =
  "Save writes the Providence project package on desktop. In browser mode, Save persists the current project in browser-local storage.";
const TOPBAR_EXPORT_HELP =
  "Export writes a Realmz-readable scenario folder on desktop. In browser mode, Export downloads a Providence project ZIP backup or a compiled scenario ZIP; imported projects preserve unsupported material from their compatibility annex.";
const TOPBAR_HISTORY_HELP =
  "Workbench history moves backward and forward through recently visited Providence tools and selected records without changing the project itself.";

const WORKBENCH_OPTIONS: SegmentedControlOption<ActiveWorkbench>[] = [
  {
    value: "project",
    label: <><LayoutDashboard size={14} /><span>Project</span></>,
    title: "Open the project workbench"
  },
  {
    value: "library",
    label: <><LibraryBig size={14} /><span>Library</span></>,
    title: "Open the reusable Providence library workbench"
  }
];

export function WorkbenchTopbar({
  activeWorkbench,
  title,
  subtitle,
  runtimeLabel,
  runtimeLive,
  dirty,
  editing,
  importAllowed,
  canOpenProject,
  canCloseProject,
  canImportScenario,
  browserPreviewStatus,
  undoLabel,
  redoLabel,
  canUndo,
  canRedo,
  canSave,
  canExport,
  tutorialEnabled,
  canNavigateBack,
  canNavigateForward,
  onLibrary,
  onProject,
  onDocuments,
  onDivinityManual,
  onGlobalSearch,
  onNavigateBack,
  onNavigateForward,
  onToggleTutorial,
  onNewProject,
  onOpenProject,
  onCloseProject,
  onImportScenario,
  onUndo,
  onRedo,
  onSave,
  onExport
}: {
  activeWorkbench: ActiveWorkbench;
  title: string;
  subtitle: string;
  runtimeLabel: string;
  runtimeLive: boolean;
  dirty: boolean;
  editing: boolean;
  importAllowed: boolean;
  canOpenProject: boolean;
  canCloseProject: boolean;
  canImportScenario: boolean;
  browserPreviewStatus: string;
  undoLabel: string | null;
  redoLabel: string | null;
  canUndo: boolean;
  canRedo: boolean;
  canSave: boolean;
  canExport: boolean;
  tutorialEnabled: boolean;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onLibrary: () => void;
  onProject: () => void;
  onDocuments: () => void;
  onDivinityManual: () => void;
  onGlobalSearch: () => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onToggleTutorial: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onCloseProject: () => void;
  onImportScenario: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExport: () => void;
}) {
  const manualClickRef = useRef({ count: 0, lastClickMs: 0 });
  const isDesktopRuntime = runtimeLabel === "Desktop";
  const saveTitle = canSave ? (isDesktopRuntime ? "Save project" : "Save project locally in this browser") : browserPreviewStatus;
  const exportTitle = canExport ? (isDesktopRuntime ? "Export scenario" : "Download browser export ZIP") : browserPreviewStatus;

  function handleManualIconClick() {
    const now = window.performance.now();
    const nextCount = now - manualClickRef.current.lastClickMs < 1500 ? manualClickRef.current.count + 1 : 1;
    manualClickRef.current = { count: nextCount, lastClickMs: now };
    if (nextCount >= 3) {
      manualClickRef.current = { count: 0, lastClickMs: 0 };
      onDivinityManual();
    }
  }

  return (
    <header className="editor-topbar workbench-topbar">
      <div className="topbar-title-cluster">
        <div className="app-mark">
          <TutorialTip title="Divinity Manual" body={TOPBAR_MANUAL_HELP} side="below" focusable={false}>
            <button
              className="mark-glyph app-mark-button"
              type="button"
              onClick={handleManualIconClick}
              title="Triple-click to open the Divinity Manual"
              aria-label="Realmz Providence. Triple-click to open the Divinity Manual."
            >
              <img src="/divinity-icon.png" alt="" draggable={false} />
            </button>
          </TutorialTip>
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
        </div>
        <div>
          <div className="topbar-history-nav" aria-label="Workbench navigation history">
            <TutorialTip title="Workbench History" body={TOPBAR_HISTORY_HELP} side="below" focusable={false}>
              <button type="button" aria-label="Go back to previous tool" title="Back to previous tool" disabled={!canNavigateBack} onClick={onNavigateBack}>
                <ChevronLeft size={15} />
              </button>
            </TutorialTip>
            <TutorialTip title="Workbench History" body={TOPBAR_HISTORY_HELP} side="below" focusable={false}>
              <button type="button" aria-label="Go forward to next tool" title="Forward to next tool" disabled={!canNavigateForward} onClick={onNavigateForward}>
                <ChevronRight size={15} />
              </button>
            </TutorialTip>
          </div>
        </div>
      </div>

      <div className="editor-topbar-actions" role="toolbar" aria-label="Project and application actions">
        <TutorialTip title="Runtime Mode" body={TOPBAR_RUNTIME_HELP} side="below">
          <span className={`runtime-pill${runtimeLive ? " live" : ""}`}>{runtimeLabel}</span>
        </TutorialTip>
        {dirty && (
          <TutorialTip title="Unsaved Project" body={TOPBAR_DIRTY_HELP} side="below">
            <span className="dirty-pill">Dirty</span>
          </TutorialTip>
        )}
        {editing && (
          <TutorialTip title="Editing Focus" body={TOPBAR_EDITING_HELP} side="below">
            <span className="dirty-pill">Editing</span>
          </TutorialTip>
        )}
        <TutorialTip title="Project And Library" body={TOPBAR_WORKBENCH_HELP} side="below" focusable={false}>
          <SegmentedControl
            className="topbar-workbench-switch"
            ariaLabel="Active workbench"
            value={activeWorkbench}
            options={WORKBENCH_OPTIONS}
            onChange={(workbench) => workbench === "project" ? onProject() : onLibrary()}
          />
        </TutorialTip>
        <TutorialTip title="Global Search" body={TOPBAR_SEARCH_HELP} side="below" focusable={false}>
          <button className="topbar-action-button" type="button" onClick={onGlobalSearch} title="Search scenario, libraries, assets, and docs (Ctrl+K)">
            <Search size={15} />
            <span>Search</span>
          </button>
        </TutorialTip>
        <TutorialTip title="Providence Documents" body={TOPBAR_DOCUMENTS_HELP} side="below" focusable={false}>
          <button className="topbar-action-button" type="button" onClick={onDocuments} title="Open Providence documents">
            <BookOpen size={15} />
            <span>Documents</span>
          </button>
        </TutorialTip>
        <TutorialTip title="Hover Help" body={TOPBAR_HELP_HELP} side="below" focusable={false}>
          <button className={`topbar-action-button${tutorialEnabled ? " active" : ""}`} type="button" aria-pressed={tutorialEnabled} onClick={onToggleTutorial} title="Toggle hover help bubbles">
            <CircleHelp size={15} />
            <span>{tutorialEnabled ? "Help On" : "Help Off"}</span>
          </button>
        </TutorialTip>
        <TutorialTip title="New Project" body={TOPBAR_NEW_PROJECT_HELP} side="below" focusable={false}>
          <button className="topbar-action-button" type="button" onClick={onNewProject} title="Create a new Providence project">
            <FilePlus2 size={15} />
            <span>New</span>
          </button>
        </TutorialTip>
        <TutorialTip title="Open Project" body={TOPBAR_OPEN_PROJECT_HELP} side="below" focusable={false}>
          <button
            className="topbar-action-button"
            type="button"
            onClick={onOpenProject}
            disabled={!canOpenProject}
            title={canOpenProject ? (isDesktopRuntime ? "Open Providence project ZIP or project.json" : "Open Providence project ZIP") : browserPreviewStatus}
          >
            <FolderOpen size={15} />
            <span>Open</span>
          </button>
        </TutorialTip>
        {canCloseProject && (
          <TutorialTip title="Close Project" body={TOPBAR_CLOSE_PROJECT_HELP} side="below" focusable={false}>
            <button
              className="topbar-action-button"
              type="button"
              onClick={onCloseProject}
              title="Close current project and return to the Providence start screen"
            >
              <X size={15} />
              <span>Close</span>
            </button>
          </TutorialTip>
        )}
        {importAllowed && (
          <TutorialTip title="Import Scenario" body={TOPBAR_IMPORT_HELP} side="below" focusable={false}>
            <button
              className="topbar-action-button"
              type="button"
              onClick={onImportScenario}
              disabled={!canImportScenario}
              title={canImportScenario ? "Import a Realmz scenario into this empty project" : browserPreviewStatus}
            >
              <Upload size={15} />
              <span>Import</span>
            </button>
          </TutorialTip>
        )}
        <div className="editor-undo-redo" role="group" aria-label="Undo and redo">
          <TutorialTip title="Undo" body={TOPBAR_UNDO_HELP} side="below" focusable={false}>
            <IconButton title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)"} onClick={onUndo} disabled={!canUndo}>
              <RefreshCcw size={15} />
            </IconButton>
          </TutorialTip>
          <TutorialTip title="Redo" body={TOPBAR_REDO_HELP} side="below" focusable={false}>
            <IconButton title={redoLabel ? `Redo ${redoLabel} (Ctrl+Y)` : "Redo (Ctrl+Y)"} onClick={onRedo} disabled={!canRedo}>
              <RefreshCcw size={15} className="redo-icon" />
            </IconButton>
          </TutorialTip>
        </div>
        <TutorialTip title="Save Project" body={TOPBAR_SAVE_HELP} side="below" focusable={false}>
          <IconButton title={saveTitle} onClick={onSave} disabled={!canSave}>
            <Save size={15} />
          </IconButton>
        </TutorialTip>
        <TutorialTip title="Export Scenario" body={TOPBAR_EXPORT_HELP} side="below" focusable={false}>
          <IconButton title={exportTitle} onClick={onExport} disabled={!canExport}>
            <Download size={15} />
          </IconButton>
        </TutorialTip>
      </div>
    </header>
  );
}
