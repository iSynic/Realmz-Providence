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
  projectRoot,
  browserPreviewStatus
}: {
  desktopRuntime: boolean;
  browserFileSystem: boolean;
  projectRoot: string;
  browserPreviewStatus: string;
  onNewProject: () => void;
  onOpenProject: () => void;
  onImportScenario: () => void;
  onLibraryHub: () => void;
  onDocuments: () => void;
}) {
  return (
    <section className="project-start">
      <img className="project-start-splash" src="/providence-splash.png" alt="" draggable={false} />
      <div className="project-start-panel">
        <img className="project-start-mark" src="/divinity-icon.png" alt="" draggable={false} />
        <h1>Realmz Providence</h1>
        <p>Create a scenario project, open an existing project, or work in the bundled Realmz/Divinity library before a scenario exists.</p>
        <small>{desktopRuntime ? `Projects are created under ${projectRoot}. Bundled libraries are seeded automatically.` : "Browser preview loads bundled library fixtures into memory."}</small>
        {!desktopRuntime && <small>{browserPreviewStatus}</small>}
      </div>
    </section>
  );
}
