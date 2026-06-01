import { BookOpen, FilePlus2, FolderOpen, LibraryBig, Upload } from "lucide-react";

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

export function ProjectStart({
  desktopRuntime,
  browserFileSystem,
  browserPreviewStatus,
  onNewProject,
  onOpenProject,
  onImportScenario,
  onLibraryHub,
  onDocuments
}: {
  desktopRuntime: boolean;
  browserFileSystem: boolean;
  browserPreviewStatus: string;
  onNewProject: () => void;
  onOpenProject: () => void;
  onImportScenario: () => void;
  onLibraryHub: () => void;
  onDocuments: () => void;
}) {
  const canImport = desktopRuntime || browserFileSystem;
  return (
    <section className="project-start">
      <img className="project-start-splash" src="/providence-splash.png" alt="" draggable={false} />
      <div className="project-start-panel">
        <img className="project-start-mark" src="/divinity-icon.png" alt="" draggable={false} />
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
            title={desktopRuntime || browserFileSystem ? "Open Providence project package" : browserPreviewStatus}
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
        </div>
        <small>{desktopRuntime ? "Projects are created under F:\\Realmz - Providence\\projects. Bundled libraries are seeded automatically." : "Browser preview loads bundled library fixtures into memory."}</small>
      </div>
    </section>
  );
}
