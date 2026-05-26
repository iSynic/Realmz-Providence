import { Project, ProjectCommand } from "../types";

type ScenarioPanelProps = {
  project: Project;
  onApplyCommand: (command: ProjectCommand) => void;
  onSelectMap: (id: string) => void;
};

export function ScenarioPanel({ project, onApplyCommand, onSelectMap }: ScenarioPanelProps) {
  const shell = project.scenario.shell ?? defaultShell(project);
  const contact = project.scenario.contactInfo ?? defaultContact(project);
  const restrictions = project.scenario.restrictions;
  const startupMap = project.maps.find((map) => map.levelType === "land" && map.index === shell.landLevel) ?? null;
  const issues = scenarioIssues(project, shell);
  return (
    <section className="scenario-workbench">
      <header className="scenario-hero">
        <div>
          <h1>Scenario</h1>
          <p>Author startup, contact, party restrictions, and Realmz load-readiness from source-backed scenario files.</p>
        </div>
        <span>{project.scenario.name}</span>
      </header>

      <div className="scenario-grid">
        <article className="scenario-card scenario-card-primary">
          <header>
            <div>
              <span>Startup Shell</span>
              <small>Marker/main scenario file</small>
            </div>
            <b>{shell.sourceFile || project.scenario.name}</b>
          </header>
          <div className="scenario-form-grid">
            <TextField
              label="Scenario Name"
              value={project.scenario.name}
              onCommit={(name) => onApplyCommand({ kind: "updateScenarioStartup", label: "Rename scenario", fields: { name } })}
            />
            <TextField
              label="Marker File"
              value={shell.sourceFile}
              onCommit={(sourceFile) => onApplyCommand({ kind: "updateScenarioShell", label: "Update scenario marker file", changes: { sourceFile } })}
            />
            <NumberField
              label="Recommended Level"
              value={shell.recLevel}
              onCommit={(recLevel) => onApplyCommand({ kind: "updateScenarioShell", label: "Update recommended level", changes: { recLevel } })}
            />
            <NumberField
              label="Maximum Party Level"
              value={shell.maxLevel}
              onCommit={(maxLevel) => onApplyCommand({ kind: "updateScenarioShell", label: "Update max party level", changes: { maxLevel } })}
            />
            <label className="scenario-field">
              <span>Startup Land</span>
              <select
                value={shell.landLevel}
                onChange={(event) => onApplyCommand({
                  kind: "updateScenarioShell",
                  label: "Update startup land",
                  changes: { landLevel: Number(event.currentTarget.value) }
                })}
              >
                {project.maps.filter((map) => map.levelType === "land").map((map) => (
                  <option key={map.id} value={map.index}>{map.name} ({map.index})</option>
                ))}
              </select>
            </label>
            <NumberField
              label="Startup X"
              value={shell.lookX}
              onCommit={(lookX) => onApplyCommand({ kind: "updateScenarioShell", label: "Update startup X", changes: { lookX } })}
            />
            <NumberField
              label="Startup Y"
              value={shell.lookY}
              onCommit={(lookY) => onApplyCommand({ kind: "updateScenarioShell", label: "Update startup Y", changes: { lookY } })}
            />
            <TextField
              label="Creator / User Check"
              value={shell.creatorUser}
              onCommit={(creatorUser) => onApplyCommand({ kind: "updateScenarioShell", label: "Update creator check", changes: { creatorUser } })}
            />
          </div>
          <div className="scenario-action-row">
            <button
              type="button"
              disabled={!startupMap}
              onClick={() => startupMap && onSelectMap(startupMap.id)}
            >
              Make Startup Map Current
            </button>
            <span>{startupMap ? `${startupMap.name} at ${shell.lookX},${shell.lookY}` : "Startup land does not resolve to a map."}</span>
          </div>
          <EvidenceBox
            title="Source Evidence"
            rows={[
              ["Offsets 0-16", "reclevel, maxlevel, landlevel, lookx, looky are source-backed big-endian int32 fields."],
              ["Offsets 20-59", "Legacy registration/security code segments are preserved raw."],
              ["Offset 60", "Creator/user check is a Str255. Empty means no check."],
              ["Trailing bytes", `${shell.trailingBytes?.length ?? 0} preserved byte(s).`]
            ]}
          />
        </article>

        <article className="scenario-card">
          <header>
            <div>
              <span>Contact Info</span>
              <small>Data CI, eighteen Str255 fields</small>
            </div>
            <b>{contact.authored ? "edited" : "source"}</b>
          </header>
          <div className="scenario-form-grid">
            <TextField label="Title" value={contact.scenarioName} onCommit={(scenarioName) => updateContact(onApplyCommand, { scenarioName })} />
            <TextField label="Version" value={contact.version} onCommit={(version) => updateContact(onApplyCommand, { version })} />
            <TextField label="Date" value={contact.date} onCommit={(date) => updateContact(onApplyCommand, { date })} />
            <TextField label="Author" value={contact.author} onCommit={(author) => updateContact(onApplyCommand, { author })} />
            <TextField label="Email" value={contact.email} onCommit={(email) => updateContact(onApplyCommand, { email })} />
            <TextField label="Web" value={contact.web} onCommit={(web) => updateContact(onApplyCommand, { web })} />
          </div>
          <label className="scenario-field scenario-field-wide">
            <span>Description</span>
            <textarea
              defaultValue={contact.description}
              onBlur={(event) => updateContact(onApplyCommand, { description: event.currentTarget.value })}
            />
          </label>
        </article>

        <article className="scenario-card">
          <header>
            <div>
              <span>Party Restrictions</span>
              <small>Optional Data RI admission rules</small>
            </div>
            <b>{restrictions ? "configured" : "not present"}</b>
          </header>
          {restrictions ? (
            <>
              <div className="scenario-form-grid">
                <NumberField
                  label="Max Characters"
                  value={restrictions.maxPartyCharacters}
                  onCommit={(maxPartyCharacters) => updateRestrictions(onApplyCommand, { maxPartyCharacters })}
                />
                <NumberField
                  label="Max Character Level"
                  value={restrictions.maxPartyLevel}
                  onCommit={(maxPartyLevel) => updateRestrictions(onApplyCommand, { maxPartyLevel })}
                />
                <TextField
                  label="Banned Race IDs"
                  value={restrictions.bannedRaces.join(", ")}
                  onCommit={(value) => updateRestrictions(onApplyCommand, { bannedRaces: parseIdList(value) })}
                />
                <TextField
                  label="Banned Caste IDs"
                  value={restrictions.bannedCastes.join(", ")}
                  onCommit={(value) => updateRestrictions(onApplyCommand, { bannedCastes: parseIdList(value) })}
                />
              </div>
              <label className="scenario-field scenario-field-wide">
                <span>Restriction Message</span>
                <textarea
                  defaultValue={restrictions.description}
                  onBlur={(event) => updateRestrictions(onApplyCommand, { description: event.currentTarget.value })}
                />
              </label>
            </>
          ) : (
            <div className="scenario-empty-state">
              <p>No Data RI restriction record is present. Realmz will not apply extra race, caste, party-count, or candidate-level gates from this file.</p>
              <button
                type="button"
                onClick={() => updateRestrictions(onApplyCommand, defaultRestrictions())}
              >
                Add Restrictions Record
              </button>
            </div>
          )}
        </article>

        <article className="scenario-card">
          <header>
            <div>
              <span>Load Readiness</span>
              <small>Realmz standard scenario shell</small>
            </div>
            <b>{issues.length ? `${issues.length} issue(s)` : "ready"}</b>
          </header>
          <div className="scenario-checklist">
            {readinessRows(project, issues).map((row) => (
              <div key={row.label} className={row.ok ? "ok" : "warn"}>
                <span>{row.label}</span>
                <small>{row.detail}</small>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  return (
    <label className="scenario-field">
      <span>{label}</span>
      <input
        key={value}
        defaultValue={value}
        onBlur={(event) => {
          const next = event.currentTarget.value;
          if (next !== value) onCommit(next);
        }}
      />
    </label>
  );
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  return (
    <label className="scenario-field">
      <span>{label}</span>
      <input
        key={value}
        type="number"
        defaultValue={value}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
      />
    </label>
  );
}

function EvidenceBox({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <details className="scenario-evidence">
      <summary>{title}</summary>
      {rows.map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <code>{value}</code>
        </div>
      ))}
    </details>
  );
}

function updateContact(onApplyCommand: (command: ProjectCommand) => void, changes: Partial<NonNullable<Project["scenario"]["contactInfo"]>>) {
  onApplyCommand({ kind: "updateScenarioContactInfo", label: "Update scenario contact info", changes });
}

function updateRestrictions(onApplyCommand: (command: ProjectCommand) => void, changes: Partial<NonNullable<Project["scenario"]["restrictions"]>>) {
  onApplyCommand({ kind: "updateScenarioRestrictions", label: "Update scenario restrictions", changes });
}

function defaultShell(project: Project): NonNullable<Project["scenario"]["shell"]> {
  return {
    sourceFile: project.scenario.name,
    recLevel: 1,
    maxLevel: 999,
    landLevel: project.maps.find((map) => map.levelType === "land")?.index ?? 0,
    lookX: 0,
    lookY: 0,
    creatorUser: "",
    codeseg1: new Array(20).fill(0),
    codeseg2: new Array(20).fill(0),
    trailingBytes: []
  };
}

function defaultContact(project: Project): NonNullable<Project["scenario"]["contactInfo"]> {
  return {
    scenarioName: project.scenario.name,
    version: "",
    date: "",
    author: "",
    email: "",
    web: "",
    fee: "",
    payInfo: ["", "", "", "", ""],
    titles: ["", "", "", "", ""],
    description: ""
  };
}

function defaultRestrictions(): NonNullable<Project["scenario"]["restrictions"]> {
  return {
    description: "",
    maxPartyCharacters: 0,
    maxPartyLevel: 0,
    bannedRaces: [],
    bannedCastes: [],
    authored: true
  };
}

function parseIdList(value: string) {
  return value
    .split(/[,\s]+/)
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id >= 1 && id <= 30);
}

function scenarioIssues(project: Project, shell: NonNullable<Project["scenario"]["shell"]>) {
  const issues: string[] = [];
  if (!shell.sourceFile.trim()) issues.push("Marker file name is empty.");
  if (!project.maps.some((map) => map.levelType === "land" && map.index === shell.landLevel)) issues.push("Startup land does not resolve to an imported land map.");
  if (shell.lookX < 0 || shell.lookX >= 90 || shell.lookY < 0 || shell.lookY >= 90) issues.push("Startup coordinates must be within 0..89.");
  if (!project.source.files.some((file) => file.name === "Scenario")) issues.push("Scenario resource fork is missing.");
  return issues;
}

function readinessRows(project: Project, issues: string[]) {
  const hasFile = (name: string) => project.source.files.some((file) => file.name === name);
  return [
    { label: "Marker/main file", ok: Boolean(project.scenario.shell), detail: project.scenario.shell?.sourceFile ?? "Will be created from edited startup shell." },
    { label: "Scenario resource fork", ok: hasFile("Scenario"), detail: hasFile("Scenario") ? "Resource fork present." : "Missing Scenario resource fork." },
    { label: "Startup fields", ok: issues.length === 0, detail: issues[0] ?? "Startup map and coordinates are valid." },
    { label: "First-start authored files", ok: ["Data DD", "Data LD", "Data RD"].every(hasFile), detail: "Outdoor trigger, land, and random-level files checked." },
    { label: "Contact info", ok: Boolean(project.scenario.contactInfo), detail: project.scenario.contactInfo ? "Data CI editable." : "No Data CI contact record." }
  ];
}
