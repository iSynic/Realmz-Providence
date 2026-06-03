import { useRef } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Download, FilePlus2, FolderOpen, LibraryBig, RefreshCcw, Save, Search, Upload } from "lucide-react";
import { ActiveWorkbench } from "../types";
import { IconButton } from "../components/IconButton";

export function WorkbenchTopbar({
  activeWorkbench,
  title,
  subtitle,
  runtimeLabel,
  runtimeLive,
  dirty,
  editing,
  importAllowed,
  canUseFiles,
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
  canUseFiles: boolean;
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
  onImportScenario: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExport: () => void;
}) {
  const manualClickRef = useRef({ count: 0, lastClickMs: 0 });

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
          <button
            className="mark-glyph app-mark-button"
            type="button"
            onClick={handleManualIconClick}
            title="Triple-click to open the Divinity Manual"
            aria-label="Realmz Providence. Triple-click to open the Divinity Manual."
          >
            <img src="/divinity-icon.png" alt="" draggable={false} />
          </button>
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
        </div>
        <div>
          <div className="topbar-history-nav" aria-label="Workbench navigation history">
            <button type="button" aria-label="Go back to previous tool" title="Back to previous tool" disabled={!canNavigateBack} onClick={onNavigateBack}>
              <ChevronLeft size={15} />
            </button>
            <button type="button" aria-label="Go forward to next tool" title="Forward to next tool" disabled={!canNavigateForward} onClick={onNavigateForward}>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="editor-topbar-actions">
        <span className={`runtime-pill${runtimeLive ? " live" : ""}`}>{runtimeLabel}</span>
        {dirty && <span className="dirty-pill">Dirty</span>}
        {editing && <span className="dirty-pill">Editing</span>}
        <button className="topbar-action-button" type="button" onClick={onGlobalSearch} title="Search scenario, libraries, assets, and docs (Ctrl+K)">
          <Search size={15} />
          <span>Search</span>
        </button>
        <button className="topbar-action-button" type="button" onClick={onLibrary} title="Open managed library workbench">
          <LibraryBig size={15} />
          <span>Library</span>
        </button>
        <button className="topbar-action-button" type="button" onClick={onDocuments} title="Open Providence documents">
          <BookOpen size={15} />
          <span>Documents</span>
        </button>
        <button className={`topbar-action-button${tutorialEnabled ? " active" : ""}`} type="button" onClick={onToggleTutorial} title="Toggle hover help bubbles">
          <span>{tutorialEnabled ? "Help On" : "Help Off"}</span>
        </button>
        {activeWorkbench === "library" && (
          <button className="topbar-action-button" type="button" onClick={onProject} title="Return to project workbench">
            <span className="grid-button-glyph" aria-hidden="true">RP</span>
            <span>Project</span>
          </button>
        )}
        <button className="topbar-action-button" type="button" onClick={onNewProject} title="Create a new Providence project">
          <FilePlus2 size={15} />
          <span>New</span>
        </button>
        <button
          className="topbar-action-button"
          type="button"
          onClick={onOpenProject}
          disabled={!canUseFiles}
          title={canUseFiles ? "Open Providence project package" : browserPreviewStatus}
        >
          <FolderOpen size={15} />
          <span>Open</span>
        </button>
        {importAllowed && (
          <button
            className="topbar-action-button"
            type="button"
            onClick={onImportScenario}
            disabled={!canUseFiles}
            title={canUseFiles ? "Import a Realmz scenario into this empty project" : browserPreviewStatus}
          >
            <Upload size={15} />
            <span>Import</span>
          </button>
        )}
        <div className="editor-undo-redo" aria-label="Undo and redo">
          <IconButton title={undoLabel ? `Undo ${undoLabel} (Ctrl+Z)` : "Undo (Ctrl+Z)"} onClick={onUndo} disabled={!canUndo}>
            <RefreshCcw size={15} />
          </IconButton>
          <IconButton title={redoLabel ? `Redo ${redoLabel} (Ctrl+Y)` : "Redo (Ctrl+Y)"} onClick={onRedo} disabled={!canRedo}>
            <RefreshCcw size={15} className="redo-icon" />
          </IconButton>
        </div>
        <IconButton title={canSave ? "Save project" : browserPreviewStatus} onClick={onSave} disabled={!canSave}>
          <Save size={15} />
        </IconButton>
        <IconButton title={canExport ? "Export scenario" : browserPreviewStatus} onClick={onExport} disabled={!canExport}>
          <Download size={15} />
        </IconButton>
      </div>
    </header>
  );
}
