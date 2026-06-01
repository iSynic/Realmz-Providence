import { useEffect, useMemo, useState } from "react";
import { Project, ProjectCommand } from "../types";
import { REALMZ_CASTES, REALMZ_RACES } from "../rulesCatalog";

type ScenarioPanelProps = {
  project: Project;
  onApplyCommand: (command: ProjectCommand) => void;
  onSelectMap: (id: string) => void;
  onOpenTool: (tab: "assets" | "rules" | "scripts", editor: string) => void;
};

export function ScenarioPanel({ project, onApplyCommand, onSelectMap, onOpenTool }: ScenarioPanelProps) {
  const shell = project.scenario.shell ?? defaultShell(project);
  const contact = project.scenario.contactInfo ?? defaultContact(project);
  const restrictions = project.scenario.restrictions;
  const securityBackup = project.scenario.securityBackup ?? null;
  const startupMap = project.maps.find((map) => map.levelType === "land" && map.index === shell.landLevel) ?? null;
  const issues = scenarioIssues(project, shell);
  return (
    <section className="scenario-workbench">
      <header className="scenario-hero">
        <div>
          <h1>Scenario</h1>
          <p>Author startup, contact, party restrictions, and Realmz load-readiness.</p>
        </div>
        <span>{project.scenario.name}</span>
      </header>

      <div className="scenario-grid">
        <article id="scenario-startup" className="scenario-card scenario-card-primary">
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
            title="Technical Details"
            rows={[
              ["Startup fields", "Recommended level, maximum level, starting land, and starting position are editable Realmz fields."],
              ["Security fields", "Two encoded 20-byte registration segments are stored in the startup shell."],
              ["Offset 60", "Creator/user check is a Str255. Empty means no check."],
              ["Additional data", `${shell.trailingBytes?.length ?? 0} imported byte(s) kept intact.`]
            ]}
          />
        </article>

        <SecurityRegistrationCard
          scenarioName={project.scenario.name}
          shell={shell}
          securityBackup={securityBackup}
          onApplyCommand={onApplyCommand}
        />

        <article id="scenario-contact" className="scenario-card">
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

        <article id="scenario-authoring-hub" className="scenario-card">
          <header>
            <div>
              <span>Divinity Scenario Hub</span>
              <small>Scenario links into focused Providence tools</small>
            </div>
            <b>roadmap</b>
          </header>
          <div className="scenario-hub-grid">
            <HubCard
              title="Picture Editor"
              detail="Scenario pictures 30000-30128; splash/default title picture 30128."
              status={`${project.assets.filter((asset) => asset.kind === "picture").length} managed picture(s)`}
              action="Open Assets"
              onClick={() => onOpenTool("assets", "project-assets")}
            />
            <HubCard
              title="Spell Overrides"
              detail="Scenario custom spell records. Names and descriptions are editable notes until resource packaging is finished."
              status={`${(project.spellOverrides ?? []).length}/105 parsed`}
              action="Open Spells"
              onClick={() => onOpenTool("rules", "spells")}
            />
            <HubCard
              title="Race Overrides"
              detail="Scenario Data Race replaces shared race data for third-party scenarios."
              status={`${(project.raceOverrides ?? []).length}/30 parsed`}
              action="Open Races"
              onClick={() => onOpenTool("rules", "races")}
            />
            <HubCard
              title="Caste Overrides"
              detail="Scenario Data Caste replaces shared caste data for third-party scenarios."
              status={`${(project.casteOverrides ?? []).length}/30 parsed`}
              action="Open Castes"
              onClick={() => onOpenTool("rules", "castes")}
            />
            <HubCard
              title="Security / Registration"
              detail="Review or unlock the two Divinity registration code segments."
              status={shell.codeseg1.some(Boolean) || shell.codeseg2.some(Boolean) ? "already set" : "empty"}
              action="Review Security"
              onClick={() => document.getElementById("scenario-security")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            />
            <HubCard
              title="Global Macro Hooks"
              detail="Start, death, quit, shop, and temple macro hook slots."
              status={activeGlobalHookCount(project)}
              action="Open Macros"
              onClick={() => onOpenTool("scripts", "global-macros")}
            />
          </div>
        </article>

        <article id="scenario-restrictions" className="scenario-card">
          <header>
            <div>
              <span>Party Restrictions</span>
              <small>Optional Data RI admission rules</small>
            </div>
            <b>{restrictions ? "configured" : "not present"}</b>
          </header>
          {restrictions ? (
            <>
              <div className="scenario-restriction-toolbar">
                <p>Choose the races and castes that cannot play this scenario.</p>
                <button
                  type="button"
                  onClick={() => updateRestrictions(onApplyCommand, {
                    description: "",
                    maxPartyCharacters: 1,
                    maxPartyLevel: 0,
                    bannedRaces: [],
                    bannedCastes: []
                  })}
                >
                  Clear Restrictions
                </button>
              </div>
              <div className="scenario-restriction-grid">
                <RestrictionChecklist
                  title="Races"
                  options={REALMZ_RACES}
                  selected={restrictions.bannedRaces}
                  onChange={(bannedRaces) => updateRestrictions(onApplyCommand, { bannedRaces })}
                />
                <RestrictionChecklist
                  title="Castes"
                  options={REALMZ_CASTES}
                  selected={restrictions.bannedCastes}
                  onChange={(bannedCastes) => updateRestrictions(onApplyCommand, { bannedCastes })}
                />
              </div>
              <div className="scenario-form-grid">
                <NumberField
                  label="Maximum Number Of Characters"
                  value={restrictions.maxPartyCharacters}
                  min={1}
                  max={6}
                  hint="Divinity allows 1-6 here. Use no Data RI record for no party-size restriction."
                  onCommit={(maxPartyCharacters) => updateRestrictions(onApplyCommand, { maxPartyCharacters: clampInt(maxPartyCharacters, 1, 6) })}
                />
                <NumberField
                  label="Maximum Level Of Any Character"
                  value={restrictions.maxPartyLevel}
                  min={0}
                  hint="0 means no maximum character level."
                  onCommit={(maxPartyLevel) => updateRestrictions(onApplyCommand, { maxPartyLevel })}
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

        <article id="scenario-readiness" className="scenario-card">
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

        <article id="scenario-global-macros" className="scenario-card">
          <header>
            <div>
              <span>Global Macro Hooks</span>
              <small>Global file, seven Divinity-visible slots</small>
            </div>
            <b>{activeGlobalHookCount(project)}</b>
          </header>
          <p className="scenario-note">Shop and Temple hooks fire only from the shop/temple button flow. Sending the party to a shop by negative shop ID does not trigger these hooks.</p>
          <div className="scenario-global-hook-grid">
            {globalHooks(project).map((hook) => (
              <label key={hook.slot} className={hook.sourceBacked ? "scenario-field" : "scenario-field is-preserved"}>
                <span>{hook.label}</span>
                <input
                  type="number"
                  defaultValue={hook.door}
                  onBlur={(event) => {
                    const door = Number(event.currentTarget.value);
                    if (Number.isFinite(door) && door !== hook.door) {
                      onApplyCommand({ kind: "updateGlobalMacroHook", label: `Update ${hook.label} global macro`, slot: hook.slot, door });
                    }
                  }}
                />
                <small>{hook.sourceBacked ? hook.runtimeConsumer : "Reserved slot kept intact."}</small>
              </label>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

function HubCard({ title, detail, status, action, onClick }: { title: string; detail: string; status: string; action?: string; onClick?: () => void }) {
  return (
    <div className="scenario-hub-card">
      <strong>{title}</strong>
      <span>{detail}</span>
      <footer>
        <small>{status}</small>
        {action && onClick && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClick}>
            {action}
          </button>
        )}
      </footer>
    </div>
  );
}

function SecurityRegistrationCard({
  scenarioName,
  shell,
  securityBackup,
  onApplyCommand
}: {
  scenarioName: string;
  shell: NonNullable<Project["scenario"]["shell"]>;
  securityBackup: Project["scenario"]["securityBackup"];
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const decoded = useMemo(() => decodeSecuritySegments(shell, securityBackup ?? null), [shell, securityBackup]);
  const [unlocked, setUnlocked] = useState(false);
  const [segment1, setSegment1] = useState(decoded.segment1);
  const [segment2, setSegment2] = useState(decoded.segment2);
  const [registrationName, setRegistrationName] = useState("");
  const [serialNumber, setSerialNumber] = useState("");

  useEffect(() => {
    if (!unlocked) {
      setSegment1(decoded.segment1);
      setSegment2(decoded.segment2);
    }
  }, [decoded.segment1, decoded.segment2, unlocked]);

  const hasSegments = normalizedSecurityBytes(shell.codeseg1).some(Boolean)
    || normalizedSecurityBytes(shell.codeseg2).some(Boolean)
    || decoded.segment1.length > 0
    || decoded.segment2.length > 0;
  const status = hasSegments ? "set" : "empty";
  const changed = segment1 !== decoded.segment1 || segment2 !== decoded.segment2;
  const readableNote = securityBackup
    ? "Decoded with this scenario's security backup. Realmz uses these segments when checking registration codes."
    : hasSegments
      ? "No Data CS backup was imported, so these fields show the stored segment text as best as possible."
      : "No security segments are set.";
  const registrationCode = registrationCodeFor(scenarioName, segment1, segment2, registrationName, serialNumber);

  const applySegments = () => {
    const encoded = encodeSecuritySegments(segment1, segment2, securityBackup ?? null);
    onApplyCommand({
      kind: "updateScenarioSecurityCodes",
      label: "Update registration security codes",
      shellChanges: {
        codeseg1: encoded.codeseg1,
        codeseg2: encoded.codeseg2
      },
      backupChanges: securityBackup ? undefined : {
        sourceFile: "Data CS",
        codeseg1: encoded.backupCodeseg1,
        codeseg2: encoded.backupCodeseg2,
        trailingBytes: []
      }
    });
    setUnlocked(false);
  };

  return (
    <article id="scenario-security" className="scenario-card scenario-security-card">
      <header>
        <div>
          <span>Security / Registration</span>
          <small>Two Divinity code segments, up to 20 characters each</small>
        </div>
        <b>{status}</b>
      </header>
      <p className="scenario-note">{readableNote}</p>
      <div className="scenario-security-toolbar">
        <button type="button" onClick={() => setUnlocked((value) => !value)}>
          {unlocked ? "Lock Fields" : "Unlock Editing"}
        </button>
        <button type="button" disabled={!unlocked || !changed} onClick={applySegments}>
          Apply Security Codes
        </button>
      </div>
      <div className="scenario-form-grid">
        <label className="scenario-field scenario-security-field">
          <span>Code Segment 1</span>
          <input
            readOnly={!unlocked}
            maxLength={SECURITY_SEGMENT_LENGTH}
            value={segment1}
            onChange={(event) => setSegment1(cleanSecuritySegment(event.currentTarget.value))}
          />
          <small>{segment1.length}/{SECURITY_SEGMENT_LENGTH} characters</small>
        </label>
        <label className="scenario-field scenario-security-field">
          <span>Code Segment 2</span>
          <input
            readOnly={!unlocked}
            maxLength={SECURITY_SEGMENT_LENGTH}
            value={segment2}
            onChange={(event) => setSegment2(cleanSecuritySegment(event.currentTarget.value))}
          />
          <small>{segment2.length}/{SECURITY_SEGMENT_LENGTH} characters</small>
        </label>
      </div>
      <section className="scenario-registration-generator">
        <header>
          <div>
            <span>Registration Code Generator</span>
            <small>Enter the player's name and Realmz serial number.</small>
          </div>
          <b>{registrationCode ?? "ready"}</b>
        </header>
        <div className="scenario-form-grid">
          <label className="scenario-field">
            <span>Registration Name</span>
            <input
              value={registrationName}
              maxLength={26}
              onChange={(event) => setRegistrationName(cleanRegistrationName(event.currentTarget.value))}
              placeholder="Name supplied by player"
            />
          </label>
          <label className="scenario-field">
            <span>Realmz Serial Number</span>
            <input
              value={serialNumber}
              inputMode="numeric"
              onChange={(event) => setSerialNumber(event.currentTarget.value.replace(/[^0-9-]/g, "").slice(0, 12))}
              placeholder="Serial number"
            />
          </label>
        </div>
        <label className="scenario-field scenario-field-wide scenario-registration-code">
          <span>Registration Code</span>
          <input
            readOnly
            value={registrationCode ?? ""}
            placeholder="Enter name and serial number"
          />
          <small>Send this code back with the exact registration name used here.</small>
        </label>
      </section>
      {unlocked && (
        <p className="scenario-security-warning">
          Changing these values changes the registration code players need for the scenario. Keep a copy of the exact text you enter.
        </p>
      )}
      <EvidenceBox
        title="Technical Details"
        rows={[
          ["Startup bytes", `${bytePreview(shell.codeseg1)} / ${bytePreview(shell.codeseg2)}`],
          ["Security backup", securityBackup ? `Data CS present (${bytePreview(securityBackup.codeseg1)})` : "No Data CS backup imported; Providence will create a zero-mask backup when applying edits."],
          ["Realmz decode", "segment2 = stored segment2 - backup segment1; segment1 = stored segment1 - segment2"]
        ]}
      />
    </article>
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

function NumberField({
  label,
  value,
  min,
  max,
  hint,
  onCommit
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  hint?: string;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="scenario-field">
      <span>{label}</span>
      <input
        key={value}
        type="number"
        min={min}
        max={max}
        defaultValue={value}
        onBlur={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function RestrictionChecklist({
  title,
  options,
  selected,
  onChange
}: {
  title: string;
  options: string[];
  selected: number[];
  onChange: (selected: number[]) => void;
}) {
  const selectedSet = new Set(selected);
  return (
    <section className="scenario-restriction-list">
      <header>
        <span>{title}</span>
        <b>{selected.length}</b>
      </header>
      <div>
        {Array.from({ length: 30 }, (_, index) => {
          const id = index + 1;
          const label = options[index] ?? `Unused ${id}`;
          const checked = selectedSet.has(id);
          const disabled = index >= options.length;
          return (
            <label key={`${title}:${id}`} className={disabled ? "is-unused" : ""}>
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => {
                  const next = event.currentTarget.checked
                    ? [...selectedSet, id]
                    : selected.filter((candidate) => candidate !== id);
                  onChange([...new Set(next)].sort((a, b) => a - b));
                }}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </section>
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
    maxPartyCharacters: 1,
    maxPartyLevel: 0,
    bannedRaces: [],
    bannedCastes: [],
    authored: true
  };
}

function globalHooks(project: Project) {
  const defaults = [
    { slot: 0, label: "Start", door: 0, sourceBacked: true, runtimeConsumer: "mainscreeninit/new-game start" },
    { slot: 1, label: "Death", door: 0, sourceBacked: true, runtimeConsumer: "partyloss death/revive path" },
    { slot: 2, label: "Quit", door: 0, sourceBacked: true, runtimeConsumer: "end current game" },
    { slot: 3, label: "Reserved", door: 0, sourceBacked: false, runtimeConsumer: "reserved" },
    { slot: 4, label: "Shop", door: 0, sourceBacked: true, runtimeConsumer: "shop button when a shop is available" },
    { slot: 5, label: "Temple", door: 0, sourceBacked: true, runtimeConsumer: "shop/temple button when a temple is available" },
    { slot: 6, label: "Reserved", door: 0, sourceBacked: false, runtimeConsumer: "reserved" }
  ];
  const existing = project.scenario.globalMacroHooks?.slots ?? [];
  return defaults.map((fallback) => existing.find((hook) => hook.slot === fallback.slot) ?? fallback);
}

function activeGlobalHookCount(project: Project) {
  const count = globalHooks(project).filter((hook) => hook.door !== 0).length;
  return count === 1 ? "1 active hook" : `${count} active hooks`;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

const SECURITY_SEGMENT_LENGTH = 20;

function normalizedSecurityBytes(bytes: number[] | undefined | null) {
  return Array.from({ length: SECURITY_SEGMENT_LENGTH }, (_, index) => ((bytes?.[index] ?? 0) & 0xff));
}

function decodeSecuritySegments(shell: NonNullable<Project["scenario"]["shell"]>, securityBackup: Project["scenario"]["securityBackup"]) {
  const stored1 = normalizedSecurityBytes(shell.codeseg1);
  const stored2 = normalizedSecurityBytes(shell.codeseg2);
  const mask1 = normalizedSecurityBytes(securityBackup?.codeseg1);
  const decoded2 = stored2.map((byte, index) => subtractByte(byte, mask1[index]));
  const decoded1 = stored1.map((byte, index) => subtractByte(byte, decoded2[index]));
  if (!securityBackup) {
    return {
      segment1: bytesToSecurityText(stored1),
      segment2: bytesToSecurityText(stored2)
    };
  }
  return {
    segment1: bytesToSecurityText(decoded1),
    segment2: bytesToSecurityText(decoded2)
  };
}

function encodeSecuritySegments(segment1: string, segment2: string, securityBackup: Project["scenario"]["securityBackup"]) {
  const plain1 = securityTextToBytes(segment1);
  const plain2 = securityTextToBytes(segment2);
  const backupCodeseg1 = normalizedSecurityBytes(securityBackup?.codeseg1);
  const backupCodeseg2 = normalizedSecurityBytes(securityBackup?.codeseg2);
  return {
    codeseg1: plain1.map((byte, index) => addByte(byte, plain2[index])),
    codeseg2: plain2.map((byte, index) => addByte(byte, backupCodeseg1[index])),
    backupCodeseg1,
    backupCodeseg2
  };
}

function securityTextToBytes(value: string) {
  const clean = cleanSecuritySegment(value);
  return Array.from({ length: SECURITY_SEGMENT_LENGTH }, (_, index) => {
    const code = clean.charCodeAt(index);
    return Number.isFinite(code) ? code & 0xff : 0;
  });
}

function bytesToSecurityText(bytes: number[]) {
  const normalized = normalizedSecurityBytes(bytes);
  const end = normalized.findIndex((byte) => byte === 0);
  return normalized
    .slice(0, end === -1 ? SECURITY_SEGMENT_LENGTH : end)
    .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ""))
    .join("");
}

function cleanSecuritySegment(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .slice(0, SECURITY_SEGMENT_LENGTH)
    .join("");
}

function addByte(left: number, right: number) {
  return (left + right) & 0xff;
}

function subtractByte(left: number, right: number) {
  return (left - right + 256) & 0xff;
}

function bytePreview(bytes: number[] | undefined | null) {
  return normalizedSecurityBytes(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function registrationCodeFor(scenarioName: string, segment1: string, segment2: string, registrationName: string, serialNumber: string) {
  const serial = Number(serialNumber);
  if (!Number.isFinite(serial) || !Number.isInteger(serial) || serial === 0 || !registrationName.trim()) return null;
  const name = cleanRegistrationName(registrationName).toLowerCase();
  let nameValue = toInt32(serial);
  for (let index = 1; index < name.length; index += 1) {
    const current = name.charCodeAt(index);
    const previous = name.charCodeAt(index - 1);
    if (current) {
      nameValue = toInt32(nameValue + index * current);
      nameValue = toInt32(nameValue - current * previous);
    }
  }

  const serialValue = cDiv(serial, 333);
  if (serialValue === 0 || nameValue === 0) return null;
  const part1 = toInt32(512 * cMod(450 + serialValue, 96 * nameValue));
  const part2 = toInt32(999 + cMod(999 + nameValue, 456 * serialValue));
  let code = toInt32(part1 + part2);

  for (const char of segment1.toLowerCase()) {
    code = toInt32(code + Math.imul(1689, char.charCodeAt(0)));
  }
  for (const char of segment2.toLowerCase()) {
    code = toInt32(code - Math.imul(423, char.charCodeAt(0)));
  }
  for (const char of scenarioName.toLowerCase()) {
    code = toInt32(code + Math.imul(112233, char.charCodeAt(0)));
  }
  return String(code);
}

function cleanRegistrationName(value: string) {
  return Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .slice(0, 26)
    .join("");
}

function cDiv(left: number, right: number) {
  return Math.trunc(left / right);
}

function cMod(left: number, right: number) {
  return left - cDiv(left, right) * right;
}

function toInt32(value: number) {
  return value | 0;
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
