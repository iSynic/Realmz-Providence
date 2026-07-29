import { useEffect, useMemo, useState } from "react";
import { TutorialTip } from "../components/TutorialTip";
import { Project, ProjectCommand } from "../types";
import {
  FormField,
  FormGrid,
  PanelHeader,
  ReferenceField,
  numericReferenceQuery,
  type ReferencePickerOption
} from "../ui";
import { ruleCasteOptions, ruleRaceOptions } from "../ruleNames";
import { REALMZ_CASTES, REALMZ_RACES } from "../rulesCatalog";
import { isCallableMacro } from "../semanticGraph";
import { isRemakeOnly } from "../remakeRuntimeCatalog";
import {
  SECURITY_SEGMENT_LENGTH,
  cleanRegistrationName,
  cleanSecuritySegment,
  decodeSecuritySegments,
  encodeSecuritySegments,
  normalizedSecurityBytes,
  registrationVariantsFor
} from "../registrationCodes";

const SCENARIO_HELP = "Scenario owns the startup shell Realmz checks before play begins: marker/main fields, contact metadata, party restrictions, Global Macros, and registration segments.";
const STARTUP_HELP = "The marker/main scenario file stores recommended level, maximum party level, startup land/X/Y, creator-user check, and two registration/security code segments.";
const CONTACT_HELP = "Data CI stores release-facing scenario title, version, author/contact text, payment/title strings, and the public description.";
const SHORTCUTS_HELP = "Scenario-wide records live in their focused Providence editors. These shortcuts keep the related tools close without duplicating their authoring interfaces here.";
const RESTRICTIONS_HELP = "Data RI optionally bans races/castes and gates party size or character level before a party can enter the scenario.";
const GLOBAL_MACROS_HELP = "Divinity's Scenario Data screen assigns Extra Action Point scripts to five automatic triggers: Start, Death, Quit, Shop, and Temple. Providence preserves the rest of the Global file without presenting unproven slots as author controls.";
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
  onOpenTool: (tab: "assets" | "rules" | "scripts" | "scripting", editor: string) => void;
};

export function ScenarioPanel({ project, onApplyCommand, onSelectMap, onOpenTool }: ScenarioPanelProps) {
  const shell = project.scenario.shell ?? defaultShell(project);
  const contact = project.scenario.contactInfo ?? defaultContact(project);
  const restrictions = project.scenario.restrictions;
  const securityBackup = project.scenario.securityBackup ?? null;
  const startupMap = project.maps.find((map) => map.levelType === "land" && map.index === shell.landLevel) ?? null;
  const hookRows = globalHooks(project);
  const macroPickerOptions = useMemo(() => globalMacroPickerOptions(project), [project]);
  return (
    <section className="scenario-workbench">
      <PanelHeader
        className="scenario-hero"
        headingLevel={1}
        title={<HelpTitle title="Scenario" help={SCENARIO_HELP} />}
        description="Author startup, contact, party restrictions, Global Macros, and registration."
        meta={project.scenario.name}
      />

      <ScenarioShortcutBar
        project={project}
        shell={shell}
        onOpenTool={onOpenTool}
      />

      <div className="scenario-grid">
        <ScenarioFormatCard
          project={project}
          onApplyCommand={onApplyCommand}
          onOpenScripting={() => onOpenTool("scripting", "scripts")}
        />

        <article id="scenario-startup" className="scenario-card scenario-card-primary">
          <header>
            <div>
              <HelpTitle title="Startup Shell" help={STARTUP_HELP} />
              <small>Marker/main scenario file</small>
            </div>
            <b>{shell.sourceFile || project.scenario.name}</b>
          </header>
          <FormGrid>
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
            <FormField label={<HelpTitle title="Startup Land" help={STARTUP_LAND_HELP} />}>
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
            </FormField>
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
          </FormGrid>
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
          <FormGrid>
            <TextField label="Title" value={contact.scenarioName} onCommit={(scenarioName) => updateContact(onApplyCommand, { scenarioName })} />
            <TextField label="Version" value={contact.version} onCommit={(version) => updateContact(onApplyCommand, { version })} />
            <TextField label="Date" value={contact.date} onCommit={(date) => updateContact(onApplyCommand, { date })} />
            <TextField label="Author" value={contact.author} onCommit={(author) => updateContact(onApplyCommand, { author })} />
            <TextField label="Email" value={contact.email} onCommit={(email) => updateContact(onApplyCommand, { email })} />
            <TextField label="Web" value={contact.web} onCommit={(web) => updateContact(onApplyCommand, { web })} />
          </FormGrid>
          <FormField label="Description" wide>
            <textarea
              defaultValue={contact.description}
              onBlur={(event) => updateContact(onApplyCommand, { description: event.currentTarget.value })}
            />
          </FormField>
        </article>

        <article id="scenario-global-macros" className="scenario-card">
          <header>
            <div>
              <HelpTitle title="Global Macros" help={GLOBAL_MACROS_HELP} />
              <small>Automatic triggers assigned to Extra Action Points</small>
            </div>
            <b>{activeGlobalHookCount(project)}</b>
          </header>
          <div className="scenario-card-actions">
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onOpenTool("scripts", "global-macros")}>
              Open Assigned Scripts
            </button>
          </div>
          <div className="scenario-global-hook-grid">
            {hookRows.map((hook) => (
              <FormField
                key={hook.slot}
                label={`${hook.label} X-AP`}
                hint={hook.authorHelp}
              >
                <ReferenceField
                  ariaLabel={`Choose ${hook.label.toLowerCase()} global macro`}
                  placeholder="Search Extra Action Point # or descriptor..."
                  options={macroPickerOptions}
                  value={hook.door}
                  current={globalMacroCurrent(project, hook.door)}
                  rawOptionForQuery={(query) => globalMacroRawOption(query, macroPickerOptions)}
                  resultNoun="macro"
                  resultNounPlural="macros"
                  emptyBody="Create or name an Extra Action Point, then assign it as this global macro."
                  initialVisibleCount={40}
                  visibleCountStep={40}
                  clearLabel={`Clear ${hook.label} global macro`}
                  compact
                  compactPanelTitle={`${hook.label} Global Macro`}
                  compactStorageKey={`scenario.eventHooks.${hook.slot}`}
                  onChange={(door) => onApplyCommand({
                    kind: "updateGlobalMacroHook",
                    label: `Update ${hook.label} global macro`,
                    slot: hook.slot,
                    door
                  })}
                />
              </FormField>
            ))}
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
                  options={ruleRaceOptions(project).slice(0, REALMZ_RACES.length)}
                  selected={restrictions.bannedRaces}
                  onChange={(bannedRaces) => updateRestrictions(onApplyCommand, { bannedRaces })}
                />
                <RestrictionChecklist
                  title="Castes"
                  options={ruleCasteOptions(project).slice(0, REALMZ_CASTES.length)}
                  selected={restrictions.bannedCastes}
                  onChange={(bannedCastes) => updateRestrictions(onApplyCommand, { bannedCastes })}
                />
              </div>
              <FormGrid>
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
              </FormGrid>
              <FormField label="Restriction Message" wide>
                <textarea
                  defaultValue={restrictions.description}
                  onBlur={(event) => updateRestrictions(onApplyCommand, { description: event.currentTarget.value })}
                />
              </FormField>
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

      </div>
    </section>
  );
}

function ScenarioFormatCard({
  project,
  onApplyCommand,
  onOpenScripting
}: {
  project: Project;
  onApplyCommand: (command: ProjectCommand) => void;
  onOpenScripting: () => void;
}) {
  const remakeOnly = isRemakeOnly(project);
  const enhanced = project.authoringTarget === "remake-enhanced";
  const runtime = project.remakeRuntime;
  const updateRuntime = (changes: Partial<typeof runtime>, label: string) => {
    onApplyCommand({
      kind: "updateRemakeRuntime",
      label,
      runtime: { ...runtime, ...changes }
    });
  };

  return (
    <article id="scenario-format" className="scenario-card scenario-card-wide scenario-format-card">
      <header>
        <div>
          <HelpTitle
            title="Scenario Format"
            help="Choose whether this project stays compatible with the original Realmz scenario format or can use Realmz Remake features. Providence calculates actual export support from the content you author."
          />
          <small>Project-wide authoring target</small>
        </div>
        <b>{enhanced ? "Remake" : "Classic"}</b>
      </header>
      <p className="scenario-format-intro">
        Classic scenarios use the stock Realmz data model. Remake scenarios keep those same records
        and add the Scripting workspace for VM scripts, persistent state, hooks, and built-in extensions.
      </p>
      <FormGrid columns={2}>
        <FormField
          label="Scenario format"
          hint={remakeOnly
            ? "Remove Remake-only scripts and bindings before returning to Classic."
            : "Changing this choice never deletes authored content."}
        >
          <select
            value={project.authoringTarget}
            onChange={(event) => onApplyCommand({
              kind: "updateAuthoringTarget",
              label: "Change scenario format",
              target: event.currentTarget.value as Project["authoringTarget"]
            })}
          >
            <option value="classic-compatible" disabled={remakeOnly}>Classic Realmz scenario</option>
            <option value="remake-enhanced">Realmz Remake scenario</option>
          </select>
        </FormField>
        {enhanced && (
          <FormField
            label="Recommended gameplay profile"
            hint="This is the scenario author's recommendation. Players can choose another profile before beginning."
          >
            <select
              value={runtime.recommendedGameplayProfile}
              onChange={(event) => updateRuntime(
                { recommendedGameplayProfile: event.currentTarget.value },
                "Change recommended gameplay profile"
              )}
            >
              <option value="core.classic">Classic fidelity</option>
              <option value="core.samuel">Samuel native behavior</option>
            </select>
          </FormField>
        )}
        <FormField label="Original Realmz export">
          <output>{remakeOnly ? "Unavailable while Remake-only features are present" : "Available"}</output>
        </FormField>
      </FormGrid>
      {enhanced && (
        <div className="scenario-action-row">
          <button type="button" className="btn btn-primary btn-sm" onClick={onOpenScripting}>
            Open Scripting
          </button>
          <span>Safe scripts use the central scenario VM; broader GDScript tiers remain explicit.</span>
        </div>
      )}
    </article>
  );
}

function ScenarioShortcutBar({
  project,
  shell,
  onOpenTool
}: {
  project: Project;
  shell: NonNullable<Project["scenario"]["shell"]>;
  onOpenTool: ScenarioPanelProps["onOpenTool"];
}) {
  const shortcuts = [
    { label: "Assets", status: project.assets.filter((asset) => asset.kind === "picture").length, onClick: () => onOpenTool("assets", "project-assets") },
    { label: "Spells", status: (project.spellOverrides ?? []).length, onClick: () => onOpenTool("rules", "spells") },
    { label: "Races", status: (project.raceOverrides ?? []).length, onClick: () => onOpenTool("rules", "races") },
    { label: "Castes", status: (project.casteOverrides ?? []).length, onClick: () => onOpenTool("rules", "castes") },
    {
      label: "Security",
      status: shell.codeseg1.some(Boolean) || shell.codeseg2.some(Boolean) ? "set" : "empty",
      onClick: () => document.getElementById("scenario-security")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  ];
  return (
    <section className="scenario-shortcuts" aria-label="Related scenario editors">
      <HelpTitle title="Related Editors" help={SHORTCUTS_HELP} />
      <div>
        {shortcuts.map((shortcut) => (
          <button key={shortcut.label} type="button" onClick={shortcut.onClick}>
            <span>{shortcut.label}</span>
            <b>{shortcut.status}</b>
          </button>
        ))}
      </div>
    </section>
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
        codeseg2: encoded.backupCodeseg2
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
      <FormGrid>
        <FormField
          label={<HelpTitle title="Code Segment 1" help={SECURITY_HELP} />}
          hint={`${segment1.length}/${SECURITY_SEGMENT_LENGTH} characters`}
          className="scenario-security-field"
        >
          <input
            readOnly={!unlocked}
            maxLength={SECURITY_SEGMENT_LENGTH}
            value={segment1}
            onChange={(event) => setSegment1(cleanSecuritySegment(event.currentTarget.value))}
          />
        </FormField>
        <FormField
          label={<HelpTitle title="Code Segment 2" help={SECURITY_HELP} />}
          hint={`${segment2.length}/${SECURITY_SEGMENT_LENGTH} characters`}
          className="scenario-security-field"
        >
          <input
            readOnly={!unlocked}
            maxLength={SECURITY_SEGMENT_LENGTH}
            value={segment2}
            onChange={(event) => setSegment2(cleanSecuritySegment(event.currentTarget.value))}
          />
        </FormField>
      </FormGrid>
      <section className="scenario-registration-generator">
        <header>
          <HelpTitle title="Registration Code Generator" help={REGISTRATION_GENERATOR_HELP} />
          <b>{primaryRegistrationVariant?.code ?? "ready"}</b>
        </header>
        <FormGrid>
          <FormField label="Registration Name">
            <input
              value={registrationName}
              maxLength={26}
              onChange={(event) => setRegistrationName(cleanRegistrationName(event.currentTarget.value))}
              placeholder="Name supplied by player"
            />
          </FormField>
          <FormField label="Realmz Serial Number">
            <input
              value={serialNumber}
              inputMode="numeric"
              onChange={(event) => setSerialNumber(event.currentTarget.value.replace(/[^0-9-]/g, "").slice(0, 12))}
              placeholder="Serial number"
            />
          </FormField>
        </FormGrid>
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
      </section>
      {unlocked && (
        <p className="scenario-security-warning">
          Changing these values changes the registration code players need for the scenario. Keep a copy of the exact text you enter.
        </p>
      )}
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
    <FormField label={help ? <HelpTitle title={label} help={help} /> : label} title={help}>
      <input
        key={value}
        defaultValue={value}
        onBlur={(event) => {
          const next = event.currentTarget.value;
          if (next !== value) onCommit(next);
        }}
      />
    </FormField>
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
    <FormField
      label={help ? <HelpTitle title={label} help={help} /> : label}
      hint={hint}
      title={help}
    >
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
    </FormField>
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
  const visibleSelectedCount = selected.filter((id) => id >= 1 && id <= options.length).length;
  return (
    <section className="scenario-restriction-list">
      <header>
        <span>{title}</span>
        <b>{visibleSelectedCount}</b>
      </header>
      <div>
        {options.map((label, index) => {
          const id = index + 1;
          const checked = selectedSet.has(id);
          return (
            <label key={`${title}:${id}`}>
              <input
                type="checkbox"
                checked={checked}
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
    codeseg2: new Array(20).fill(0)
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
    { slot: 0, label: "Start", door: 0, sourceBacked: true, authorHelp: "Runs when the player starts a new adventure." },
    { slot: 1, label: "Death", door: 0, sourceBacked: true, authorHelp: "Runs when the party is killed." },
    { slot: 2, label: "Quit", door: 0, sourceBacked: true, authorHelp: "Runs when the player quits the adventure, but not when the party dies." },
    { slot: 3, label: "Reserved", door: 0, sourceBacked: false, authorHelp: "Preserved imported value." },
    { slot: 4, label: "Shop", door: 0, sourceBacked: true, authorHelp: "Runs when the player clicks the Shop button, not when a script sends the party directly to a shop." },
    { slot: 5, label: "Temple", door: 0, sourceBacked: true, authorHelp: "Runs when the player clicks the Temple button." },
    { slot: 6, label: "Reserved", door: 0, sourceBacked: false, authorHelp: "Preserved imported value." }
  ];
  const existing = project.scenario.globalMacroHooks?.slots ?? [];
  return defaults
    .map((fallback) => ({ ...fallback, ...(existing.find((hook) => hook.slot === fallback.slot) ?? {}) }))
    .filter((hook) => hook.sourceBacked);
}

function globalMacroPickerOptions(project: Project): ReferencePickerOption<number>[] {
  const referencedRows = new Set(globalHooks(project).map((hook) => hook.door).filter((door) => door !== 0));
  return project.triggers
    .filter((trigger) => trigger.source === "Data ED3" && trigger.recordIndex > 0 && (isCallableMacro(project, trigger) || referencedRows.has(trigger.recordIndex)))
    .sort((a, b) => a.recordIndex - b.recordIndex)
    .map((trigger) => {
      const label = globalMacroLabel(project, trigger.recordIndex);
      const detail = `${trigger.actions.length} step${trigger.actions.length === 1 ? "" : "s"}${trigger.active ? "" : " | imported inactive row"}`;
      return {
        key: `global-macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label,
        detail,
        searchText: `${label} ${detail} ${trigger.id} ${trigger.actions.map((action) => action.label).join(" ")}`,
        title: `Assign Extra Action Point ${trigger.recordIndex} as this global macro.`
      };
    });
}

function globalMacroCurrent(project: Project, recordIndex: number) {
  if (recordIndex === 0) {
    return {
      label: "No macro selected",
      detail: "Realmz performs no reusable script for this event.",
      state: "empty" as const
    };
  }
  const trigger = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === recordIndex);
  if (!trigger) {
    return {
      label: `Extra Action Point ${recordIndex}`,
      detail: "This referenced Data ED3 row is not available in the project.",
      state: "unresolved" as const
    };
  }
  return {
    label: globalMacroLabel(project, recordIndex),
    detail: `${trigger.actions.length} step${trigger.actions.length === 1 ? "" : "s"}`,
    state: "resolved" as const
  };
}

function globalMacroRawOption(query: string, options: ReferencePickerOption<number>[]): ReferencePickerOption<number> | null {
  const recordIndex = numericReferenceQuery(query);
  if (recordIndex == null || recordIndex <= 0 || options.some((option) => option.value === recordIndex)) return null;
  return {
    key: `raw-global-macro:${recordIndex}`,
    value: recordIndex,
    label: `Use Extra Action Point ${recordIndex}`,
    detail: "Reference this raw Data ED3 row even though it is not currently classified as a callable macro.",
    searchText: `${recordIndex} raw Data ED3 Extra Action Point`,
    title: `Use raw Extra Action Point ${recordIndex}`
  };
}

function globalMacroLabel(project: Project, recordIndex: number) {
  const trigger = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === recordIndex);
  const descriptor = trigger ? project.editorMetadata?.displayNames?.[trigger.id]?.label?.trim() : "";
  return descriptor ? `Extra Action Point ${recordIndex} - ${descriptor}` : `Extra Action Point ${recordIndex}`;
}

function activeGlobalHookCount(project: Project) {
  const count = globalHooks(project).filter((hook) => hook.door !== 0).length;
  return count === 1 ? "1 assigned macro" : `${count} assigned macros`;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}
