import { BookOpen, Download, FilePlus2, FolderOpen, LibraryBig, RefreshCcw, Save, Upload } from "lucide-react";
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
  onLibrary,
  onProject,
  onDocuments,
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
  onLibrary: () => void;
  onProject: () => void;
  onDocuments: () => void;
  onToggleTutorial: () => void;
  onNewProject: () => void;
  onOpenProject: () => void;
  onImportScenario: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onExport: () => void;
}) {
  return (
    <header className="editor-topbar workbench-topbar">
      <div className="app-mark">
        <span className="mark-glyph">RP</span>
        <div>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
      </div>

      <div className="editor-topbar-actions">
        <span className={`runtime-pill${runtimeLive ? " live" : ""}`}>{runtimeLabel}</span>
        {dirty && <span className="dirty-pill">Dirty</span>}
        {editing && <span className="dirty-pill">Editing</span>}
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
