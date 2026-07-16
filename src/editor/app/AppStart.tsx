import { useState } from "react";
import { AlertTriangle, BookOpen, Braces, CheckCircle2, Clipboard, FilePlus2, FolderOpen, LibraryBig, RefreshCcw } from "lucide-react";
import { TutorialTip } from "../components/TutorialTip";
import { ScenarioSeedPreflightOutcome, ScenarioSeedTemplateSelection } from "../scenarioSeedReport";
import { ModalDialog, ModalDialogActions, ModalDialogHeader, PanelHeader, SegmentedControl, type SegmentedControlOption } from "../ui";

const NEW_PROJECT_DIALOG_HELP =
  "A Providence project is its own folder package. New projects start with an editable land level 0; import a Realmz scenario before authoring project content.";
const PROJECT_NAME_HELP =
  "The project name becomes the Providence package name and default export name. It does not have to match an imported Realmz scenario folder, though matching names are easier to track.";
const PROJECT_START_HELP =
  "Start with New when authoring a blank scenario or preparing to import a raw Realmz scenario. Open returns to a Providence project package, while Library opens reusable and bundled reference material without a project.";
const PROJECT_RUNTIME_HELP =
  "Desktop projects can save, export, and use native folder dialogs. Browser preview opens Providence ZIP packages, saves locally, and uses folder support only where the browser exposes it.";

type ProjectCreationMode = "blank" | "scenario-json";

const PROJECT_CREATION_MODES: ReadonlyArray<SegmentedControlOption<ProjectCreationMode>> = [
  { value: "blank", label: <><FilePlus2 size={14} /> Blank Project</> },
  { value: "scenario-json", label: <><Braces size={14} /> Scenario JSON</> }
];

export function ProjectNameDialog({
  value,
  onChange,
  onCancel,
  onCreate,
  templateProjectName,
  onValidateSeed,
  onCreateFromSeed
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onCreate: () => void | Promise<void>;
  templateProjectName: string | null;
  onValidateSeed: (seedJson: string, template: ScenarioSeedTemplateSelection) => Promise<ScenarioSeedPreflightOutcome>;
  onCreateFromSeed: (seedJson: string, template: ScenarioSeedTemplateSelection) => Promise<ScenarioSeedPreflightOutcome>;
}) {
  const [mode, setMode] = useState<ProjectCreationMode>("blank");
  const [seedJson, setSeedJson] = useState(() => starterScenarioSeed(value));
  const [preflight, setPreflight] = useState<ScenarioSeedPreflightOutcome | null>(null);
  const [workingAction, setWorkingAction] = useState<"validate" | "create" | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [templateSelection, setTemplateSelection] = useState<ScenarioSeedTemplateSelection>("seed");

  async function submitProject() {
    if (mode === "blank") {
      await onCreate();
      return;
    }
    setWorkingAction("create");
    try {
      const outcome = await onCreateFromSeed(seedJson, templateSelection);
      if (!outcome.ok) setPreflight(outcome);
    } finally {
      setWorkingAction(null);
    }
  }

  async function validateSeed() {
    setWorkingAction("validate");
    setCopyStatus("idle");
    try {
      setPreflight(await onValidateSeed(seedJson, templateSelection));
    } finally {
      setWorkingAction(null);
    }
  }

  async function copyReport() {
    if (!preflight || !navigator.clipboard) {
      setCopyStatus("failed");
      return;
    }
    try {
      await navigator.clipboard.writeText(preflight.reportJson);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <ModalDialog
      surfaceTag="form"
      backdropClassName="modal-backdrop"
      className={`project-name-dialog${mode === "scenario-json" ? " scenario-json" : ""}`}
      ariaLabelledBy="new-project-dialog-title"
      closeOnBackdrop={false}
      dismissDisabled={workingAction !== null}
      onDismiss={onCancel}
      onSubmit={(event) => {
        event.preventDefault();
        void submitProject();
      }}
    >
        <ModalDialogHeader
          titleId="new-project-dialog-title"
          title={(
            <TutorialTip title="New Providence Project" body={NEW_PROJECT_DIALOG_HELP} side="below">
              <span>New Providence Project</span>
            </TutorialTip>
          )}
        />
        <div className="project-name-dialog-body">
          <SegmentedControl
            ariaLabel="Project creation mode"
            className="project-create-modes"
            value={mode}
            options={PROJECT_CREATION_MODES}
            onChange={setMode}
          />
          {mode === "blank" ? (
            <>
              <label>
                <TutorialTip title="Project Name" body={PROJECT_NAME_HELP} side="below">
                  <span>Project Name</span>
                </TutorialTip>
                <input data-modal-initial-focus autoFocus value={value} onChange={(event) => onChange(event.currentTarget.value)} />
              </label>
              <p>Providence will create this project under the default project directory with an editable land level 0.</p>
            </>
          ) : (
            <>
              <label className="scenario-seed-template-field">
                <span>Template Source</span>
                <select
                  value={templateSelection}
                  onChange={(event) => {
                    setTemplateSelection(event.currentTarget.value as ScenarioSeedTemplateSelection);
                    setPreflight(null);
                    setCopyStatus("idle");
                  }}
                >
                  <option value="seed">Use Scenario JSON</option>
                  {templateProjectName && <option value="current-project">Current Project: {templateProjectName}</option>}
                </select>
              </label>
              <label className="scenario-seed-field">
                <span>Scenario Seed JSON</span>
                <textarea
                  data-modal-initial-focus
                  autoFocus
                  value={seedJson}
                  spellCheck={false}
                  onChange={(event) => {
                    setSeedJson(event.currentTarget.value);
                    setPreflight(null);
                    setCopyStatus("idle");
                  }}
                />
              </label>
              {preflight && (preflight.errors.length > 0 || preflight.warnings.length > 0) && (
                <div className="scenario-seed-diagnostics" role="alert" aria-label="Scenario JSON diagnostics">
                  {preflight.errors.map((message, index) => <span className="error" key={`error-${index}`}><AlertTriangle size={13} /> {message}</span>)}
                  {preflight.warnings.map((message, index) => <span className="warning" key={`warning-${index}`}><AlertTriangle size={13} /> {message}</span>)}
                </div>
              )}
              {preflight && (
                <div className={`scenario-seed-preflight ${preflight.ok ? "ok" : "error"}`} aria-label="Scenario JSON validation report">
                  <div className="scenario-seed-preflight-heading">
                    {preflight.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    <strong>{preflight.ok ? "Ready to create" : "Needs repair"}</strong>
                    {preflight.allocationSummary && (
                      <span>{preflight.allocationSummary.total.toLocaleString()} allocation(s) | base {preflight.allocationSummary.baseTemplate}</span>
                    )}
                    <button className="btn btn-ghost" type="button" onClick={() => void copyReport()}>
                      <Clipboard size={13} /> {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy Failed" : "Copy Report"}
                    </button>
                  </div>
                  {preflight.allocationSummary && preflight.allocationSummary.families.length > 0 && (
                    <div className="scenario-seed-allocation-summary">
                      {preflight.allocationSummary.families.map((family) => (
                        <span key={family.key}>{family.label} <b>{family.count.toLocaleString()}</b></span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <ModalDialogActions>
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={workingAction !== null}>
            Cancel
          </button>
          {mode === "scenario-json" && (
            <button className="btn btn-secondary" type="button" onClick={() => void validateSeed()} disabled={workingAction !== null || !seedJson.trim()}>
              {workingAction === "validate" ? "Validating..." : "Validate JSON"}
            </button>
          )}
          <button className="btn btn-primary" type="submit" disabled={workingAction !== null || (mode === "blank" ? !value.trim() : !seedJson.trim() || preflight?.ok === false)}>
            {workingAction === "create" ? "Creating..." : mode === "blank" ? "Create Project" : "Create From JSON"}
          </button>
        </ModalDialogActions>
    </ModalDialog>
  );
}

function starterScenarioSeed(projectName: string) {
  return JSON.stringify({
    schemaVersion: 1,
    scenario: {
      name: projectName.trim() || "Untitled Scenario"
    }
  }, null, 2);
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
    <ModalDialog
      backdropClassName="modal-backdrop"
      className="close-project-dialog"
      ariaLabelledBy="close-project-title"
      closeOnBackdrop={false}
      dismissDisabled={saving}
      onDismiss={onCancel}
    >
        <ModalDialogHeader titleId="close-project-title" title="Close Project" />
        <div className="close-project-dialog-body">
          <strong>{projectName}</strong>
          <p>This project has unsaved changes. Save the current project state before returning to the Providence start screen, or close without saving and discard the current in-memory edits.</p>
        </div>
        <ModalDialogActions>
          <button className="btn btn-ghost" type="button" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-danger" type="button" onClick={onCloseWithoutSaving} disabled={saving}>
            Close Without Saving
          </button>
          <button className="btn btn-primary" type="button" onClick={onSaveAndClose} disabled={saving}>
            {saving ? "Saving..." : "Save and Close"}
          </button>
        </ModalDialogActions>
    </ModalDialog>
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
  projectRoot: string;
  browserPreviewStatus: string;
  onNewProject: () => void;
  onOpenProject: () => void;
  onResumeProject?: () => void;
  onLibraryHub: () => void;
  onDocuments: () => void;
}) {
  return (
    <section className="project-start" aria-labelledby="project-start-title">
      <img className="project-start-splash" src="/providence-splash.png" alt="" draggable={false} />
      <div className="project-start-panel">
        <PanelHeader
          className="project-start-header"
          headingLevel={1}
          leading={<img className="project-start-mark" src="/divinity-icon.png" alt="" draggable={false} />}
          title={(
            <TutorialTip title="Project Start" body={PROJECT_START_HELP} side="below">
              <span id="project-start-title">Realmz Providence</span>
            </TutorialTip>
          )}
          description="Create a scenario project, open an existing project, or work in the bundled Realmz/Divinity library before a scenario exists."
        />
        <div className="project-start-runtime">
          <TutorialTip title={desktopRuntime ? "Desktop Runtime" : "Browser Preview"} body={PROJECT_RUNTIME_HELP} side="below">
            <small>{desktopRuntime ? `Projects are created under ${projectRoot}. Bundled libraries are seeded automatically.` : "Browser preview opens downloaded Providence ZIP packages and loads bundled library fixtures into memory."}</small>
          </TutorialTip>
          {!desktopRuntime && <small role="status" aria-live="polite">{browserPreviewStatus}</small>}
        </div>
        <div className="project-start-actions">
          <div className="project-start-action-group" role="group" aria-label="Project actions">
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
          </div>
          <div className="project-start-action-group secondary" role="group" aria-label="Reference actions">
            <button className="btn btn-ghost" type="button" onClick={onLibraryHub}>
              <LibraryBig size={15} /> Library
            </button>
            <button className="btn btn-ghost" type="button" onClick={onDocuments}>
              <BookOpen size={15} /> Documents
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
