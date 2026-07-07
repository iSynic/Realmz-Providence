import { BookOpen, FilePlus2, FolderOpen, LibraryBig, RefreshCcw } from "lucide-react";
import { TutorialTip } from "../components/TutorialTip";

const NEW_PROJECT_DIALOG_HELP =
  "A Providence project is its own folder package. New projects start with an editable land level 0; import a Realmz scenario before authoring project content.";
const PROJECT_NAME_HELP =
  "The project name becomes the Providence package name and default export name. It does not have to match an imported Realmz scenario folder, though matching names are easier to track.";
const PROJECT_START_HELP =
  "Start with New when authoring a blank scenario, Import when bringing in a raw Realmz scenario, Open when returning to a Providence project package, or Library when you only need bundled Realmz/Divinity reference material.";
const PROJECT_RUNTIME_HELP =
  "Desktop projects can save, export, and use native folder dialogs. Browser preview opens Providence ZIP packages, saves locally, and uses folder support only where the browser exposes it.";

export function ProjectNameDialog({
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
          <TutorialTip title="New Providence Project" body={NEW_PROJECT_DIALOG_HELP} side="below">
            <span>New Providence Project</span>
          </TutorialTip>
        </div>
        <div className="project-name-dialog-body">
          <label>
            <TutorialTip title="Project Name" body={PROJECT_NAME_HELP} side="below">
              <span>Project Name</span>
            </TutorialTip>
            <input autoFocus value={value} onChange={(event) => onChange(event.currentTarget.value)} />
          </label>
          <p>Providence will create this project under the default project directory with an editable land level 0.</p>
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

export function CloseProjectDialog({
  projectName,
  saving,
  onSaveAndClose,
  onCloseWithoutSaving,
  onCancel
}: {
  projectName: string;
  saving: boolean;
  onSaveAndClose: () => void;
  onCloseWithoutSaving: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="close-project-dialog" role="dialog" aria-modal="true" aria-labelledby="close-project-title">
        <div className="panel-header">
          <span id="close-project-title">Close Project</span>
        </div>
        <div className="close-project-dialog-body">
          <strong>{projectName}</strong>
          <p>This project has unsaved changes. Save the current project state before returning to the Providence start screen, or close without saving and discard the current in-memory edits.</p>
        </div>
        <div className="close-project-dialog-actions">
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-danger" type="button" onClick={onCloseWithoutSaving} disabled={saving}>
            Close Without Saving
          </button>
          <button className="btn btn-primary" type="button" onClick={onSaveAndClose} disabled={saving}>
            {saving ? "Saving..." : "Save and Close"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function ProjectStart({
  desktopRuntime,
  projectRoot,
  browserPreviewStatus,
  onNewProject,
  onOpenProject,
  onResumeProject,
  onLibraryHub,
  onDocuments
}: {
  desktopRuntime: boolean;
  browserFileSystem: boolean;
  projectRoot: string;
  browserPreviewStatus: string;
  onNewProject: () => void;
  onOpenProject: () => void;
  onResumeProject?: () => void;
  onImportScenario: () => void;
  onLibraryHub: () => void;
  onDocuments: () => void;
}) {
  return (
    <section className="project-start">
      <img className="project-start-splash" src="/providence-splash.png" alt="" draggable={false} />
      <div className="project-start-panel">
        <img className="project-start-mark" src="/divinity-icon.png" alt="" draggable={false} />
        <h1>
          <TutorialTip title="Project Start" body={PROJECT_START_HELP} side="below">
            <span>Realmz Providence</span>
          </TutorialTip>
        </h1>
        <p>Create a scenario project, open an existing project, or work in the bundled Realmz/Divinity library before a scenario exists.</p>
        <TutorialTip title={desktopRuntime ? "Desktop Runtime" : "Browser Preview"} body={PROJECT_RUNTIME_HELP} side="below">
          <small>{desktopRuntime ? `Projects are created under ${projectRoot}. Bundled libraries are seeded automatically.` : "Browser preview opens downloaded Providence ZIP packages and loads bundled library fixtures into memory."}</small>
        </TutorialTip>
        {!desktopRuntime && <small>{browserPreviewStatus}</small>}
        <div className="project-start-actions">
          <button className="btn btn-primary" type="button" onClick={onNewProject}>
            <FilePlus2 size={15} /> New Project
          </button>
          <button className="btn btn-secondary" type="button" onClick={onOpenProject}>
            <FolderOpen size={15} /> Open Project
          </button>
          {onResumeProject && (
            <button className="btn btn-secondary" type="button" onClick={onResumeProject}>
              <RefreshCcw size={15} /> Resume Local
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={onLibraryHub}>
            <LibraryBig size={15} /> Library
          </button>
          <button className="btn btn-secondary" type="button" onClick={onDocuments}>
            <BookOpen size={15} /> Documents
          </button>
        </div>
      </div>
    </section>
  );
}
