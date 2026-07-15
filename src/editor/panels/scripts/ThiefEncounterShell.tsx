import { useEffect, useMemo, useState } from "react";
import { Volume2 } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import {
  resolveSignedMessageTarget,
  signedTargetValueForSelection,
  targetOptionForOpcodeValue,
  targetOptionsForOpcode,
  type ScriptTargetOption
} from "../../components/RealmzTargetPicker";
import { playPreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type {
  EncounterActionRow,
  LibraryCatalog,
  Project,
  ProjectCommand,
  SelectedEntity
} from "../../types";
import { ReferenceField, numericReferenceQuery, type ReferencePickerOption } from "../../ui";
import {
  ROGUE_ACTION_LABELS,
  encounterResultStatus,
  resultStatusLabel,
  type EncounterDecisionSource
} from "./encounterFlow";
import { useEncounterSoundPreviewUrl } from "./EncounterResultSoundPreview";
import { EncounterRecordPicker } from "./EncounterRecordPicker";
import { InlineNumberField } from "./InlineNumberField";
import { NumberField } from "./NumberField";
import { ReferenceIdField, rawReferenceTargetOption } from "./ReferenceIdField";
import { spellReferenceOptions } from "./encounterResponseOptions";
import { updateArraySlot } from "./arraySlots";

const ROGUE_ACTION_TESTS_HELP =
  "Rogue action rows control which Divinity thief actions are available, the skill modifier, success/failure result codes, and the text/sound feedback for each outcome.";
const ROGUE_TRAP_HELP =
  "Trap and lock setup controls the trap prompt string, trap state, affected target, damage range, trap sound, optional trap spell, power level, tumbler count, and open/disarm chance fields.";

function rogueOutcomeSummary(record: Project["thiefEncounters"][number], slot: number) {
  const success = record.successCodes?.[slot] ?? 0;
  const failure = record.failureCodes?.[slot] ?? 0;
  return `success ${resultCodeLabel(success)}, failure ${resultCodeLabel(failure)}`;
}

function resultCodeLabel(value: number) {
  return value > 0 ? `Result ${value}` : "no result";
}

function EncounterResultFlowOverview({
  sources,
  selectedResultIndex,
  onSelectResult
}: {
  sources: EncounterDecisionSource[];
  selectedResultIndex: number | null;
  onSelectResult: (resultIndex: number | null) => void;
}) {
  if (sources.length === 0) {
    return (
      <section className="encounter-result-flow-overview empty">
        <header>
          <strong>Result Flow</strong>
          <span>No decision sources configured</span>
        </header>
        <p className="field-help">Add player options, typed words, magic responses, item responses, or a Rogue Encounter to route this encounter into result columns.</p>
      </section>
    );
  }
  return (
    <section className="encounter-result-flow-overview">
      <header>
        <strong>Result Flow</strong>
        <span>{sources.length} decision source{sources.length === 1 ? "" : "s"}</span>
      </header>
      <div className="encounter-result-flow-list">
        {sources.map((source) => (
          <button
            key={source.key}
            type="button"
            className={`encounter-result-flow-row ${source.status}${source.resultIndex !== null && source.resultIndex === selectedResultIndex ? " selected" : ""}`}
            disabled={source.resultIndex === null}
            onClick={() => onSelectResult(source.resultIndex)}
          >
            <span>
              <b>{source.label}</b>
              <small>{source.detail}</small>
            </span>
            <em>{source.result > 0 ? `Result ${source.result}` : "No result"}</em>
            <i>{resultStatusLabel(source.status)}</i>
          </button>
        ))}
      </div>
    </section>
  );
}

const ROGUE_PRIMARY_ACTIONS = 8;
const ROGUE_DISARM_TRAP_SLOT = 2;
const ROGUE_OPEN_LOCK_SLOT = 6;

type RogueSpellPathConfig = {
  slot: number;
  chanceSlot: number;
  rowLabel: string;
};

export const ROGUE_OPEN_LOCK_SPELL_PATH: RogueSpellPathConfig = {
  slot: ROGUE_OPEN_LOCK_SLOT,
  chanceSlot: 1,
  rowLabel: "Open Lock"
};

export const ROGUE_DISARM_TRAP_SPELL_PATH: RogueSpellPathConfig = {
  slot: ROGUE_DISARM_TRAP_SLOT,
  chanceSlot: 2,
  rowLabel: "Disarm Trap"
};

function rogueSpellPathChance(record: Project["thiefEncounters"][number], config: RogueSpellPathConfig) {
  return record.promptSounds?.[config.chanceSlot] ?? 0;
}

function rogueOutcomeHasVisiblePath(record: Project["thiefEncounters"][number], slot: number, outcome: "success" | "failure") {
  const codes = outcome === "success" ? record.successCodes : record.failureCodes;
  const messages = outcome === "success" ? record.successText : record.failureText;
  const sounds = outcome === "success" ? record.successSounds : record.failureSounds;
  return Boolean((codes?.[slot] ?? 0) || (messages?.[slot] ?? 0) || (sounds?.[slot] ?? 0));
}

export function rogueSpellPathSummary(record: Project["thiefEncounters"][number], config: RogueSpellPathConfig) {
  const chance = rogueSpellPathChance(record, config);
  if (chance <= 0) return `Disabled; set Chance / level above 0 to use ${config.rowLabel}. ${rogueOutcomeSummary(record, config.slot)}.`;
  return `Enabled (${chance}); success -> ${resultCodeLabel(record.successCodes?.[config.slot] ?? 0)}, failure -> ${resultCodeLabel(record.failureCodes?.[config.slot] ?? 0)}.`;
}

function rogueResultColumnVisibilitySummary(record: Project["thiefEncounters"][number], slot: number, actions: EncounterActionRow[]) {
  const success = record.successCodes?.[slot] ?? 0;
  const failure = record.failureCodes?.[slot] ?? 0;
  return `Success ${resultStatusLabel(encounterResultStatus(actions, success)).toLowerCase()}; failure ${resultStatusLabel(encounterResultStatus(actions, failure)).toLowerCase()}.`;
}

export function ThiefEncounterShell({
  project,
  catalog,
  previewContext,
  id,
  record,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  id: number;
  record: Project["thiefEncounters"][number];
  onSelectEntity?: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateThiefEncounterRecord" }>["changes"]) => {
    onApplyCommand?.({ kind: "updateThiefEncounterRecord", label: "Update rogue encounter", id, changes });
  };
  const enabledCount = (record.typeFlags ?? []).slice(0, ROGUE_PRIMARY_ACTIONS).filter(Boolean).length;
  const trapped = Boolean(record.typeFlags?.[9]);
  const rogueOnly = Boolean(record.typeFlags?.[8]);
  return (
    <div className="thief-encounter-editor">
      <EncounterRecordPicker project={project} recordType="thiefEncounter" id={id} onSelectEntity={onSelectEntity} className="encounter-record-picker-standalone" />
      <section className="rogue-action-matrix">
        <header>
          <div>
            <TutorialTip title="Rogue Action Tests" body={ROGUE_ACTION_TESTS_HELP} side="below">
              <strong>Rogue Action Tests</strong>
            </TutorialTip>
          </div>
          <small>{enabledCount}/{ROGUE_PRIMARY_ACTIONS} enabled; success/fail columns return result codes, strings, and sounds.</small>
        </header>
        <div className="rogue-action-table" role="table" aria-label="Rogue action tests">
          <div className="rogue-action-table-header" role="row">
            <span>Action Required</span>
            <span>% Mod</span>
            <span>Result Success</span>
            <span>Result Fail</span>
            <span>Text Success</span>
            <span>Text Fail</span>
            <span>Sound Success</span>
            <span>Sound Fail</span>
          </div>
          {Array.from({ length: ROGUE_PRIMARY_ACTIONS }, (_, slot) => (
            <RogueActionRow
              key={slot}
              slot={slot}
              record={record}
              project={project}
              catalog={catalog}
              onUpdate={update}
              onCreateMessage={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue string", recordType: "message", id: targetId })}
            />
          ))}
        </div>
      </section>
      <section className="rogue-encounter-detail-grid">
        <div className="rogue-trap-panel">
          <header>
            <TutorialTip title="Trap / Lock Setup" body={ROGUE_TRAP_HELP} side="below">
              <strong>Trap / Lock Setup</strong>
            </TutorialTip>
            <small>{trapped ? "Trap armed" : "No armed trap"}; affects {rogueOnly ? "the acting rogue only" : "the whole party"}.</small>
          </header>
          <div className="rogue-trap-fields">
            <div className="rogue-trap-lock-column">
              <strong>Traps</strong>
              <ReferenceIdField
                project={project}
                catalog={catalog}
                label="Trap Prompt String"
                emptyLabel="No trap prompt string"
                opcode={1}
                value={record.prompts?.[0] ?? 0}
                createRecordType="message"
                compact
                onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 0, value, 3) })}
                onCreateTarget={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue trap string", recordType: "message", id: targetId })}
              />
              <RoguePromptStringPreview
                project={project}
                label="Trap Prompt Text"
                prompt={record.prompts?.[0] ?? 0}
                onApplyCommand={onApplyCommand}
              />
              <label className="script-target-checkbox">
                <span>Is Trapped</span>
                <input
                  type="checkbox"
                  checked={trapped}
                  onChange={(event) => update({ typeFlags: updateArraySlot(record.typeFlags ?? [], 9, event.currentTarget.checked, 10) })}
                />
              </label>
              <label className="script-target-checkbox">
                <span>Trap Affects Rogue Only</span>
                <input
                  type="checkbox"
                  checked={rogueOnly}
                  onChange={(event) => update({ typeFlags: updateArraySlot(record.typeFlags ?? [], 8, event.currentTarget.checked, 10) })}
                />
              </label>
              <label className="rogue-trap-range-row">
                <span>Trap Damage</span>
                <div>
                  <InlineNumberField ariaLabel="Trap Damage Low" value={record.lowDamage} onCommit={(lowDamage) => update({ lowDamage })} />
                  <em>to</em>
                  <InlineNumberField ariaLabel="Trap Damage High" value={record.highDamage} onCommit={(highDamage) => update({ highDamage })} />
                </div>
              </label>
              <RogueSoundSelectField
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                label="Trap Sound"
                emptyLabel="No trap sound"
                value={record.prompts?.[1] ?? 0}
                className="rogue-trap-sound-field"
                previewAriaLabel="Preview Trap Sound"
                onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 1, value, 3) })}
              />
              <RogueTrapSpellField
                project={project}
                catalog={catalog}
                value={record.spell}
                onCommit={(spell) => update({ spell })}
              />
              <NumberField label="Power Level" value={record.prompts?.[2] ?? 0} onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 2, value, 3) })} compact />
              <NumberField label="% Chance / Level to Disarm Trap" value={rogueSpellPathChance(record, ROGUE_DISARM_TRAP_SPELL_PATH)} onCommit={(value) => update({ promptSounds: updateArraySlot(record.promptSounds ?? [], ROGUE_DISARM_TRAP_SPELL_PATH.chanceSlot, value, 3) })} compact />
            </div>
            <div className="rogue-trap-lock-column">
              <strong>Locks</strong>
              <NumberField label="Number of Lock Tumblers" value={record.tumblers} onCommit={(tumblers) => update({ tumblers })} compact />
              <NumberField label="% Chance / Level to Open" value={rogueSpellPathChance(record, ROGUE_OPEN_LOCK_SPELL_PATH)} onCommit={(value) => update({ promptSounds: updateArraySlot(record.promptSounds ?? [], ROGUE_OPEN_LOCK_SPELL_PATH.chanceSlot, value, 3) })} compact />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RogueSoundSelectField({
  project,
  catalog,
  previewContext,
  label,
  emptyLabel,
  value,
  className,
  previewAriaLabel,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  label: string;
  emptyLabel: string;
  value: number;
  className: string;
  previewAriaLabel: string;
  onCommit: (value: number) => void;
}) {
  const soundOptions = useMemo(() => targetOptionsForOpcode(project, 9, catalog), [catalog, project]);
  const selected = useMemo(() => targetOptionForOpcodeValue(project, 9, value, catalog), [catalog, project, value]);
  const pickerOptions = useMemo(() => soundOptions.map(scriptTargetReferenceOption), [soundOptions]);
  const selectedValue = Math.abs(value);
  const soundHelp = selected
    ? [selected.label, selected.detail, selected.summary].filter(Boolean).join(" | ")
    : value
      ? `Sound ${selectedValue} has no matching loaded sound target.`
      : `${emptyLabel} selected.`;
  const selectedPreviewUrl = useEncounterSoundPreviewUrl(selected, value, project, previewContext);
  return (
    <div className={className} title={soundHelp}>
      <TutorialTip title={label} body={soundHelp} side="below">
        <span>{label}</span>
      </TutorialTip>
      <button
        type="button"
        className="rogue-trap-sound-preview-button"
        disabled={!selectedPreviewUrl}
        title={selectedPreviewUrl ? `Preview ${selected?.label ?? `sound ${selectedValue}`}` : "No playable preview is available for this sound."}
        aria-label={previewAriaLabel}
        onClick={() => selectedPreviewUrl && playPreviewUrl(selectedPreviewUrl)}
      >
        <Volume2 size={12} />
      </button>
      <ReferenceField
        ariaLabel={`Search ${label}`}
        placeholder="Search sound name or ID..."
        options={pickerOptions}
        value={value}
        selectedValue={selectedValue}
        current={{
          label: selected?.label ?? (value ? `Current sound ${selectedValue}` : emptyLabel),
          detail: soundHelp,
          state: selected ? "resolved" : value ? "unresolved" : "empty"
        }}
        rawOptionForQuery={(query) => rawReferenceTargetOption(query, 9, label, soundOptions)}
        resultNoun="sound"
        emptyTitle="No matching sounds"
        emptyBody="Try a sound name, numeric ID, or resource detail."
        clearLabel={`Clear ${label.toLowerCase()}`}
        className="rogue-trap-reference-picker"
        compact
        compactPanelTitle={label}
        onChange={(next) => onCommit(signedTargetValueForSelection(9, value, next))}
      />
    </div>
  );
}

function RoguePromptStringPreview({
  project,
  label = "Prompt Text",
  prompt,
  onApplyCommand
}: {
  project: Project;
  label?: string;
  prompt: number;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const messageId = resolveSignedMessageTarget(1, prompt);
  const message = messageId > 0 ? project.messages?.find((record) => record.id === messageId) : null;
  const [draft, setDraft] = useState(message?.text ?? "");
  useEffect(() => {
    setDraft(message?.text ?? "");
  }, [message?.id, message?.text]);
  const disabled = !message;
  return (
    <label className="rogue-prompt-string-preview">
      <span>{label}</span>
      <textarea
        value={draft}
        rows={4}
        disabled={disabled}
        placeholder={messageId > 0 ? `String ${messageId} is not created yet.` : "Choose a prompt string to preview and edit it here."}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          if (!message || draft === message.text) return;
          onApplyCommand?.({ kind: "updateMessageRecord", label: `Update Rogue Prompt String ${message.id}`, id: message.id, changes: { text: draft } });
        }}
      />
    </label>
  );
}

function RogueTrapSpellField({
  project,
  catalog,
  value,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  value: number;
  onCommit: (value: number) => void;
}) {
  const options = useMemo(() => spellReferenceOptions(project, catalog), [catalog, project]);
  const pickerOptions = useMemo(() => options.map((option): ReferencePickerOption<number> => ({
    key: option.key,
    value: option.value,
    label: option.label,
    detail: option.detail,
    searchText: `${option.value} ${option.label} ${option.detail}`
  })), [options]);
  const selected = options.find((option) => option.value === value);
  const spellHelp = selected
    ? [selected.label, selected.detail].filter(Boolean).join(" | ")
    : value
      ? `Spell ${value} has no matching loaded spell target.`
      : "No trap spell selected.";
  return (
    <div className="rogue-trap-spell-field" title={spellHelp}>
      <TutorialTip title="Trap Spell" body={spellHelp} side="below">
        <span>Trap Spell</span>
      </TutorialTip>
      <ReferenceField
        ariaLabel="Search Trap Spell"
        placeholder="Search spell name, class, or ID..."
        options={pickerOptions}
        value={value}
        current={{
          label: selected?.label ?? (value ? `Current spell ${value}` : "No trap spell"),
          detail: spellHelp,
          state: selected ? "resolved" : value ? "unresolved" : "empty"
        }}
        rawOptionForQuery={(query) => rawSpellReferenceOption(query, options)}
        resultNoun="spell"
        emptyTitle="No matching spells"
        emptyBody="Try a spell name, class, numeric ID, or source detail."
        clearLabel="Clear trap spell"
        className="rogue-trap-reference-picker"
        compact
        compactPanelTitle="Trap Spell"
        onChange={onCommit}
      />
    </div>
  );
}

function scriptTargetReferenceOption(option: ScriptTargetOption): ReferencePickerOption<number> {
  return {
    key: option.key,
    value: option.value,
    label: option.label,
    detail: [option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | "),
    searchText: [option.value, option.label, option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" ")
  };
}

function rawSpellReferenceOption(query: string, options: ReturnType<typeof spellReferenceOptions>): ReferencePickerOption<number> | null {
  const value = numericReferenceQuery(query);
  if (value == null || value === 0 || options.some((option) => option.value === value)) return null;
  return {
    key: `raw-spell:${value}`,
    value,
    label: `Use raw spell value ${value}`,
    detail: "No matching loaded spell target.",
    searchText: `${value} spell raw target`
  };
}

function RogueActionRow({
  slot,
  record,
  project,
  catalog,
  onUpdate,
  onCreateMessage
}: {
  slot: number;
  record: Project["thiefEncounters"][number];
  project: Project;
  catalog?: LibraryCatalog | null;
  onUpdate: (changes: Extract<ProjectCommand, { kind: "updateThiefEncounterRecord" }>["changes"]) => void;
  onCreateMessage: (targetId: number) => void;
}) {
  const actionWarnings = rogueActionOutcomeWarnings(record, slot);
  return (
    <>
      <div className="rogue-action-row" role="row">
        <label className="rogue-action-enabled">
          <input
            type="checkbox"
            checked={Boolean(record.typeFlags?.[slot])}
            onChange={(event) => onUpdate({ typeFlags: updateArraySlot(record.typeFlags ?? [], slot, event.currentTarget.checked, 10) })}
          />
          <span>{ROGUE_ACTION_LABELS[slot] ?? `Rogue Action ${slot}`}</span>
        </label>
        <NumberField label="% Mod" value={record.modifiers?.[slot] ?? 0} onCommit={(value) => onUpdate({ modifiers: updateArraySlot(record.modifiers ?? [], slot, value, 8) })} compact />
        <NumberField label="Success Result" value={record.successCodes?.[slot] ?? 0} onCommit={(value) => onUpdate({ successCodes: updateArraySlot(record.successCodes ?? [], slot, value, 8) })} compact />
        <NumberField label="Fail Result" value={record.failureCodes?.[slot] ?? 0} onCommit={(value) => onUpdate({ failureCodes: updateArraySlot(record.failureCodes ?? [], slot, value, 8) })} compact />
        <ReferenceIdField
          project={project}
          catalog={catalog}
          label="Success Text"
          emptyLabel="No success string"
          opcode={1}
          value={record.successText?.[slot] ?? 0}
          createRecordType="message"
          compact
          onCommit={(value) => onUpdate({ successText: updateArraySlot(record.successText ?? [], slot, value, 8) })}
          onCreateTarget={onCreateMessage}
        />
        <ReferenceIdField
          project={project}
          catalog={catalog}
          label="Fail Text"
          emptyLabel="No failure string"
          opcode={1}
          value={record.failureText?.[slot] ?? 0}
          createRecordType="message"
          compact
          onCommit={(value) => onUpdate({ failureText: updateArraySlot(record.failureText ?? [], slot, value, 8) })}
          onCreateTarget={onCreateMessage}
        />
        <ReferenceIdField
          project={project}
          catalog={catalog}
          label="Success Sound"
          emptyLabel="No success sound"
          opcode={9}
          value={record.successSounds?.[slot] ?? 0}
          compact
          onCommit={(value) => onUpdate({ successSounds: updateArraySlot(record.successSounds ?? [], slot, value, 8) })}
        />
        <ReferenceIdField
          project={project}
          catalog={catalog}
          label="Fail Sound"
          emptyLabel="No failure sound"
          opcode={9}
          value={record.failureSounds?.[slot] ?? 0}
          compact
          onCommit={(value) => onUpdate({ failureSounds: updateArraySlot(record.failureSounds ?? [], slot, value, 8) })}
        />
      </div>
      {actionWarnings.map((warning) => <p key={warning} className="field-warning rogue-action-warning">{warning}</p>)}
    </>
  );
}

function rogueActionOutcomeWarnings(record: Project["thiefEncounters"][number], slot: number) {
  if (!record.typeFlags?.[slot]) return [];
  const label = ROGUE_ACTION_LABELS[slot] ?? `Rogue Action ${slot}`;
  const warnings: string[] = [];
  if (!rogueOutcomeHasVisiblePath(record, slot, "success")) {
    warnings.push(`${label} can succeed, but success currently has no visible result. Add a result code, string, or sound.`);
  }
  if (!rogueOutcomeHasVisiblePath(record, slot, "failure")) {
    warnings.push(`${label} can fail, but failure currently has no visible result. Add a result code, string, or sound.`);
  }
  return warnings;
}
