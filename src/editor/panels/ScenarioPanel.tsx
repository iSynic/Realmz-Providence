import { useEffect, useMemo, useState } from "react";
import { TutorialTip } from "../components/TutorialTip";
import { Project, ProjectCommand, SelectedEntity } from "../types";
import { PanelHeader } from "../ui";
import { ruleCasteOptions, ruleRaceOptions } from "../ruleNames";
import {
  SECURITY_SEGMENT_LENGTH,
  cleanRegistrationName,
  cleanSecuritySegment,
  decodeSecuritySegments,
  encodeSecuritySegments,
  normalizedSecurityBytes,
  registrationVariantsFor
} from "../registrationCodes";

const SCENARIO_HELP = "Scenario owns the startup shell Realmz checks before play begins: marker/main fields, contact metadata, party restrictions, global hooks, registration segments, and load-readiness.";
const STARTUP_HELP = "The marker/main scenario file stores recommended level, maximum party level, startup land/X/Y, creator-user check, and two registration/security code segments.";
const CONTACT_HELP = "Data CI stores release-facing scenario title, version, author/contact text, payment/title strings, and the public description.";
const HUB_HELP = "Divinity's Scenario area links to pictures, rules overrides, security, global hooks, and release metadata. Providence routes those deeper editors to their focused tools.";
const RESTRICTIONS_HELP = "Data RI optionally bans races/castes and gates party size or character level before a party can enter the scenario.";
const READINESS_HELP = "Load Readiness checks whether Realmz can select and start the exported scenario. The broader Linter still owns full release validation.";
const GLOBAL_EVENTS_HELP = "Global event hooks live in the Global source file. Start, Death, Quit, Shop, and Temple have source-backed runtime consumers; reserved slots are preserved.";
const SECURITY_HELP = "Legacy security stores two 20-character code segments in the marker/main file. Changing them changes the registration code players need.";
const REGISTRATION_GENERATOR_HELP = "The generator shows evidence-labeled algorithms. Divinity Coder/custom-scenario codes and bundled Fantasoft scenario codes are different formula families.";
const STARTUP_LEVEL_HELP = "Recommended level is the party level target shown during party selection.";
const MAX_LEVEL_HELP = "Maximum party level is an optional startup gate. Imported values such as 999 often mean no practical cap.";
const STARTUP_LAND_HELP = "The outdoor land level Realmz loads first when the scenario starts.";
const STARTUP_COORD_HELP = "Startup map/view coordinate. Keep it inside the 0..89 Realmz map bounds.";
const CREATOR_USER_HELP = "Legacy Str255 creator/user check field. Empty means no creator/user check.";

type ScenarioPanelProps = {
  project: Project;
  onApplyCommand: (command: ProjectCommand) => void;
  onSelectMap: (id: string) => void;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenTool: (tab: "assets" | "rules" | "scripts", editor: string) => void;
};

export function ScenarioPanel({ project, onApplyCommand, onSelectMap, onSelectEntity, onOpenTool }: ScenarioPanelProps) {
  const shell = project.scenario.shell ?? defaultShell(project);
  const contact = project.scenario.contactInfo ?? defaultContact(project);
  const restrictions = project.scenario.restrictions;
  const securityBackup = project.scenario.securityBackup ?? null;
  const startupMap = project.maps.find((map) => map.levelType === "land" && map.index === shell.landLevel) ?? null;
  const issues = scenarioIssues(project, shell);
  const hookRows = globalHooks(project);
  const startHook = hookRows.find((hook) => hook.slot === 0);
  const nextStartupMacroId = nextStartupTestMacroRecordIndex(project);
  return (
    <section className="scenario-workbench">
      <PanelHeader
        className="scenario-hero"
        headingLevel={1}
        title={<HelpTitle title="Scenario" help={SCENARIO_HELP} />}
        description="Author startup, contact, party restrictions, and Realmz load-readiness."
        meta={project.scenario.name}
      />

      <div className="scenario-grid">
        <article id="scenario-startup" className="scenario-card scenario-card-primary">
          <header>
            <div>
              <HelpTitle title="Startup Shell" help={STARTUP_HELP} />
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
              help={STARTUP_LEVEL_HELP}
              value={shell.recLevel}
              onCommit={(recLevel) => onApplyCommand({ kind: "updateScenarioShell", label: "Update recommended level", changes: { recLevel } })}
            />
            <NumberField
              label="Maximum Party Level"
              help={MAX_LEVEL_HELP}
              value={shell.maxLevel}
              onCommit={(maxLevel) => onApplyCommand({ kind: "updateScenarioShell", label: "Update max party level", changes: { maxLevel } })}
            />
            <label className="scenario-field">
              <HelpTitle title="Startup Land" help={STARTUP_LAND_HELP} />
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
              help={STARTUP_COORD_HELP}
              value={shell.lookX}
              onCommit={(lookX) => onApplyCommand({ kind: "updateScenarioShell", label: "Update startup X", changes: { lookX } })}
            />
            <NumberField
              label="Startup Y"
              help={STARTUP_COORD_HELP}
              value={shell.lookY}
              onCommit={(lookY) => onApplyCommand({ kind: "updateScenarioShell", label: "Update startup Y", changes: { lookY } })}
            />
            <TextField
              label="Creator / User Check"
              help={CREATOR_USER_HELP}
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
              <HelpTitle title="Contact Info" help={CONTACT_HELP} />
              <small>Scenario contact and registration metadata</small>
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
              <HelpTitle title="Divinity Scenario Hub" help={HUB_HELP} />
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
              detail="Scenario race overrides replace shared race data for third-party scenarios."
              status={`${(project.raceOverrides ?? []).length}/30 parsed`}
              action="Open Races"
              onClick={() => onOpenTool("rules", "races")}
            />
            <HubCard
              title="Caste Overrides"
              detail="Scenario caste overrides replace shared caste data for third-party scenarios."
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
              title="Global Events"
              detail="Start, death, quit, shop, and temple event hooks."
              status={activeGlobalHookCount(project)}
              action="Open Events"
              onClick={() => onOpenTool("scripts", "global-macros")}
            />
          </div>
        </article>

        <article id="scenario-restrictions" className="scenario-card">
          <header>
            <div>
              <HelpTitle title="Party Restrictions" help={RESTRICTIONS_HELP} />
              <small>Optional party admission rules</small>
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
                  options={ruleRaceOptions(project)}
                  selected={restrictions.bannedRaces}
                  onChange={(bannedRaces) => updateRestrictions(onApplyCommand, { bannedRaces })}
                />
                <RestrictionChecklist
                  title="Castes"
                  options={ruleCasteOptions(project)}
                  selected={restrictions.bannedCastes}
                  onChange={(bannedCastes) => updateRestrictions(onApplyCommand, { bannedCastes })}
                />
              </div>
              <div className="scenario-form-grid">
                <NumberField
                  label="Maximum Number Of Characters"
                  help="Maximum party character count from Data RI. Divinity/Realmz party size is normally 1-6."
                  value={restrictions.maxPartyCharacters}
                  min={1}
                  max={6}
                  hint="Divinity allows 1-6 here. Leave this blank for no party-size restriction."
                  onCommit={(maxPartyCharacters) => updateRestrictions(onApplyCommand, { maxPartyCharacters: clampInt(maxPartyCharacters, 1, 6) })}
                />
                <NumberField
                  label="Maximum Level Of Any Character"
                  help="Extra Data RI level gate. Zero means no additional character-level cap."
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
              <p>No restriction record is present. Realmz will not apply extra race, caste, party-count, or candidate-level gates.</p>
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
              <HelpTitle title="Load Readiness" help={READINESS_HELP} />
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
              <HelpTitle title="Global Events" help={GLOBAL_EVENTS_HELP} />
              <small>Global file, seven Divinity-visible slots</small>
            </div>
            <b>{activeGlobalHookCount(project)}</b>
          </header>
          <p className="scenario-note">Shop and Temple hooks fire only from the shop/temple button flow. Sending the party to a shop by negative shop ID does not trigger these hooks.</p>
          {startHook?.door === 0 && (
            <p className="scenario-note scenario-note-warning">Start is set to 0, which classic Realmz treats as no startup macro. Use a nonzero Extra Action Point row when building a startup smoke test.</p>
          )}
          <div className="scenario-card-actions">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => {
                onApplyCommand({ kind: "createStartupTestMacro", label: "Create startup test macro" });
                onSelectEntity?.({ type: "macro", id: `Data ED3:macro:${nextStartupMacroId}` });
                onOpenTool("scripts", "global-macros");
              }}
            >
              Create Startup Test Macro
            </button>
          </div>
          <div className="scenario-global-hook-grid">
            {hookRows.map((hook) => (
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
  const registrationScenarioName = shell.sourceFile || scenarioName;
  const readableNote = securityBackup
    ? "Decoded with this scenario's security backup. Realmz uses these segments when checking registration codes."
    : hasSegments
      ? "No security backup was imported, so these fields show the stored segment text as best as possible."
      : "No security segments are set.";
  const registrationVariants = registrationVariantsFor({
    scenarioName: registrationScenarioName,
    segment1,
    segment2,
    registrationName,
    serialNumber,
    recLevel: shell.recLevel,
    maxLevel: shell.maxLevel
  });
  const primaryRegistrationVariant = registrationVariants.find((variant) => variant.confidence === "verified") ?? registrationVariants[0] ?? null;

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
          <HelpTitle title="Security / Registration" help={SECURITY_HELP} />
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
          <HelpTitle title="Code Segment 1" help={SECURITY_HELP} />
          <input
            readOnly={!unlocked}
            maxLength={SECURITY_SEGMENT_LENGTH}
            value={segment1}
            onChange={(event) => setSegment1(cleanSecuritySegment(event.currentTarget.value))}
          />
          <small>{segment1.length}/{SECURITY_SEGMENT_LENGTH} characters</small>
        </label>
        <label className="scenario-field scenario-security-field">
          <HelpTitle title="Code Segment 2" help={SECURITY_HELP} />
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
            <HelpTitle title="Registration Code Generator" help={REGISTRATION_GENERATOR_HELP} />
            <small>Verified evidence and source-ported candidate formulas for {registrationScenarioName}.</small>
          </div>
          <b>{primaryRegistrationVariant?.code ?? "ready"}</b>
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
        <div className="scenario-registration-variants">
          {registrationVariants.length === 0 ? (
            <p>Enter a registration name and serial number to calculate evidence-backed and candidate codes.</p>
          ) : registrationVariants.map((variant) => (
            <article key={`${variant.algorithmId}:${variant.code}:${variant.label}`} className={`scenario-registration-variant is-${variant.confidence}`}>
              <header>
                <span>{variant.label}</span>
                <b>{variant.confidence === "verified" ? "Verified" : variant.confidence === "reported-unmatched" ? "Unmatched" : "Candidate"}</b>
              </header>
              <code>{variant.code}</code>
              <small>{variant.detail}</small>
            </article>
          ))}
        </div>
        <p className="scenario-note">
          Verified codes match known official evidence for the same scenario, name, and serial. Candidate codes are source-ported formulas still being tested against Realmz/Divinity behavior.
        </p>
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
          ["Security backup", securityBackup ? `present (${bytePreview(securityBackup.codeseg1)})` : "No security backup imported; Providence will create a zero-mask backup when applying edits."],
          ["Realmz decode", "segment2 = stored segment2 - backup segment1; segment1 = stored segment1 - segment2"]
        ]}
      />
    </article>
  );
}

function HelpTitle({ title, help }: { title: string; help: string }) {
  return (
    <TutorialTip title={title} body={help} side="right">
      <span>{title}</span>
    </TutorialTip>
  );
}

function TextField({ label, value, help, onCommit }: { label: string; value: string; help?: string; onCommit: (value: string) => void }) {
  return (
    <label className="scenario-field" title={help}>
      {help ? <HelpTitle title={label} help={help} /> : <span>{label}</span>}
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
  help,
  onCommit
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  hint?: string;
  help?: string;
  onCommit: (value: number) => void;
}) {
  return (
    <label className="scenario-field" title={help}>
      {help ? <HelpTitle title={label} help={help} /> : <span>{label}</span>}
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

function nextStartupTestMacroRecordIndex(project: Project) {
  const macros = project.triggers.filter((trigger) => trigger.source === "Data ED3");
  const reusable = macros
    .filter((trigger) => trigger.recordIndex > 0 && !trigger.active && trigger.actions.length === 0)
    .sort((a, b) => a.recordIndex - b.recordIndex)[0];
  if (reusable) return reusable.recordIndex;
  return Math.max(0, ...macros.map((trigger) => trigger.recordIndex)) + 1;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function bytePreview(bytes: number[] | undefined | null) {
  return normalizedSecurityBytes(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
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
    { label: "First-start records", ok: ["Data DD", "Data LD", "Data RD"].every(hasFile), detail: "Outdoor trigger, land, and random-level records checked." },
    { label: "Contact info", ok: Boolean(project.scenario.contactInfo), detail: project.scenario.contactInfo ? "Editable." : "No contact record." }
  ];
}
