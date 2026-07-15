import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { BattleRecord, Project, SelectedEntity } from "../../types";
import {
  numericReferenceQuery,
  ReferenceField,
  ReferencePreview,
  type ReferencePickerOption
} from "../../ui";
import { selectEntityFromId } from "../../utils";
import { FieldLabel } from "./CombatFields";

const BATTLE_MACRO_HELP = "Battle Macro is an Extra Action Point reference that Realmz checks at the end of each combat round. Providence writes selected macros in the runnable form; positive imports are preserved but warned until edited.";

export function battleRecordReferenceOptions(battles: BattleRecord[]): ReferencePickerOption<number>[] {
  return [...battles]
    .sort((left, right) => left.id - right.id)
    .map((battle) => {
      const occupied = battle.grid.filter((monsterId) => monsterId !== 0).length;
      return {
        key: `battle:${battle.id}`,
        value: battle.id,
        label: `Battle ${battle.id}`,
        detail: `${occupied} occupied ${occupied === 1 ? "cell" : "cells"} | distance ${battle.dist}`,
        searchText: `${battle.id} battle record ${occupied} occupied cells distance ${battle.dist}`
      };
    });
}

export function battleStringReferenceOptions(project: Project): ReferencePickerOption<number>[] {
  return [...(project.messages ?? [])]
    .sort((left, right) => left.id - right.id)
    .map((message) => ({
      key: `battle-string:${message.id}`,
      value: message.id,
      label: `String ${message.id}`,
      detail: message.text.trim() || "Empty string",
      searchText: `${message.id} string message ${message.text}`
    }));
}

export function battleMacroReferenceOptions(project: Project): ReferencePickerOption<number>[] {
  return (project.triggers ?? [])
    .filter((trigger) => trigger.source === "Data ED3" && trigger.recordIndex > 0)
    .slice()
    .sort((left, right) => left.recordIndex - right.recordIndex)
    .map((trigger) => {
      const actionCount = trigger.actions.filter((action) => action.rawCode !== 0).length;
      return {
        key: `battle-macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Extra Action Point ${trigger.recordIndex}`,
        detail: `${actionCount} action ${actionCount === 1 ? "step" : "steps"}`,
        searchText: `${trigger.recordIndex} extra action point battle macro ${actionCount} action steps`
      };
    });
}

export function BattleRecordReferenceField({
  battles,
  value,
  help,
  onChange
}: {
  battles: BattleRecord[];
  value: number;
  help?: string;
  onChange: (value: number) => void;
}) {
  const options = useMemo(() => battleRecordReferenceOptions(battles), [battles]);
  const selected = options.find((option) => option.value === value) ?? null;
  const previous = [...options].reverse().find((option) => option.value < value) ?? null;
  const next = options.find((option) => option.value > value) ?? null;
  return (
    <div className="battle-record-reference-field">
      <FieldLabel label="Battle" help={help} />
      <div className="battle-record-reference-control">
        <button
          type="button"
          className="btn btn-secondary btn-xs icon-only"
          disabled={!previous}
          aria-label="Previous Battle"
          title="Previous Battle"
          onClick={() => previous && onChange(previous.value)}
        >
          <ChevronLeft size={13} aria-hidden="true" />
        </button>
        <ReferenceField
          ariaLabel="Search battle records"
          placeholder="Search battle # or details..."
          options={options}
          value={value}
          selectedValue={selected?.value ?? null}
          current={selected ? {
            label: selected.label,
            detail: selected.detail,
            state: "resolved"
          } : {
            label: `Battle ${value}`,
            detail: `Battle ${value} is not present in this project.`,
            state: "unresolved"
          }}
          resultNoun="battle"
          resultNounPlural="battles"
          emptyTitle="No matching battles"
          emptyBody="Try a battle record ID, occupied-cell count, or distance value."
          compact
          compactPanelTitle="Battle Picker"
          compactStorageKey="combat.battle.record.picker.position"
          onChange={onChange}
        />
        <button
          type="button"
          className="btn btn-secondary btn-xs icon-only"
          disabled={!next}
          aria-label="Next Battle"
          title="Next Battle"
          onClick={() => next && onChange(next.value)}
        >
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function BattleStringReferenceField({
  project,
  label,
  value,
  help,
  onCommit,
  onSelectEntity,
  onCreate,
  onUpdateString
}: {
  project: Project;
  label: string;
  value: number;
  help?: string;
  onCommit: (value: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onCreate?: (id: number) => void;
  onUpdateString?: (id: number, text: string) => void;
}) {
  const targetId = Math.abs(value);
  const options = useMemo(() => battleStringReferenceOptions(project), [project]);
  const selected = options.find((option) => option.value === targetId) ?? null;
  const record = (project.messages ?? []).find((candidate) => candidate.id === targetId) ?? null;
  return (
    <div className="battle-reference-field battle-string-field">
      <FieldLabel label={label} help={help} />
      <ReferenceField
        ariaLabel={`Search ${label.toLowerCase()}`}
        placeholder="Search string # or text..."
        options={options}
        value={targetId}
        selectedValue={selected?.value ?? null}
        current={targetId === 0 ? {
          label: "No String",
          detail: `${label} is not used.`,
          state: "empty"
        } : selected ? {
          label: selected.label,
          detail: selected.detail,
          state: "resolved"
        } : {
          label: `String ${targetId}`,
          detail: "This imported string reference has not been created in the project.",
          state: "unresolved"
        }}
        rawOptionForQuery={(query) => battleReferenceRawOption(query, options, "String", "Missing imported string reference")}
        currentActions={targetId ? (
          <>
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onSelectEntity(selectEntityFromId(`message:${targetId}`))}>
              Open String
            </button>
            {!record && onCreate ? (
              <button type="button" className="btn btn-primary btn-xs" onClick={() => onCreate(targetId)}>
                Create String
              </button>
            ) : null}
          </>
        ) : undefined}
        currentSupplement={targetId ? (
          <ReferencePreview
            preview={record ? {
              kind: "custom",
              key: `battle-string-preview:${record.id}`,
              title: `String ${record.id}`,
              detail: "Edit the string here or open the full Strings tool.",
              content: (
                <textarea
                  className="battle-string-preview-editor"
                  key={`battle-string-${record.id}-${record.text}`}
                  defaultValue={record.text}
                  onBlur={(event) => {
                    if (event.currentTarget.value !== record.text) onUpdateString?.(record.id, event.currentTarget.value);
                  }}
                />
              )
            } : {
              kind: "missing",
              key: `battle-string-preview:${targetId}:missing`,
              title: `String ${targetId}`,
              detail: "Missing project record",
              body: `String ${targetId} has not been created yet.`,
              state: "missing"
            }}
          />
        ) : undefined}
        resultNoun="string"
        resultNounPlural="strings"
        emptyTitle="No matching strings"
        emptyBody="Try a string ID or message text. Numeric missing IDs can be preserved explicitly."
        clearLabel={`Clear ${label.toLowerCase()}`}
        compact
        compactPanelTitle={`${label} Picker`}
        compactStorageKey={`combat.battle.${label.toLowerCase().replace(/\s+/g, ".")}.picker.position`}
        onChange={(id) => onCommit(Math.max(0, Math.trunc(Math.abs(id))))}
      />
    </div>
  );
}

export function BattleMacroReferenceField({
  project,
  value,
  onCommit,
  onSelectEntity,
  previewContent
}: {
  project: Project;
  value: number;
  onCommit: (value: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  previewContent?: ReactNode;
}) {
  const macroId = Math.abs(value);
  const options = useMemo(() => battleMacroReferenceOptions(project), [project]);
  const selected = options.find((option) => option.value === macroId) ?? null;
  const trigger = (project.triggers ?? []).find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === macroId) ?? null;
  const commitMacroId = (nextMacroId: number) => onCommit(nextMacroId ? -Math.abs(nextMacroId) : 0);
  return (
    <div className="battle-reference-field battle-macro-field">
      <FieldLabel label="Battle Macro" help={BATTLE_MACRO_HELP} />
      <ReferenceField
        ariaLabel="Search battle macro"
        placeholder="Search Extra Action Point #..."
        options={options}
        value={macroId}
        selectedValue={selected?.value ?? null}
        current={macroId === 0 ? {
          label: "No Battle Macro",
          detail: "No end-of-round Extra Action Point is assigned.",
          state: "empty"
        } : selected ? {
          label: selected.label,
          detail: selected.detail,
          state: "resolved"
        } : {
          label: `Extra Action Point ${macroId}`,
          detail: "This imported Battle Macro is not present in Data ED3.",
          state: "unresolved"
        }}
        rawOptionForQuery={(query) => battleReferenceRawOption(query, options, "Extra Action Point", "Missing imported Battle Macro")}
        currentActions={selected ? (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => onSelectEntity(selectEntityFromId(`macro:${selected.value}`))}>
            Open Battle Macro
          </button>
        ) : undefined}
        currentSupplement={macroId ? (
          <ReferencePreview
            preview={trigger ? {
              kind: "custom",
              key: `battle-macro-preview:${macroId}`,
              title: `Extra Action Point ${macroId}`,
              detail: selected?.detail,
              content: previewContent ?? <p>No flow preview is available.</p>
            } : {
              kind: "missing",
              key: `battle-macro-preview:${macroId}:missing`,
              title: `Extra Action Point ${macroId}`,
              detail: "Missing Data ED3 record",
              body: "Choose an existing Extra Action Point before relying on this Battle Macro.",
              state: "missing"
            }}
          />
        ) : undefined}
        resultNoun="macro"
        resultNounPlural="macros"
        emptyTitle="No matching Battle Macros"
        emptyBody="Try an Extra Action Point record ID. Numeric missing IDs can be preserved explicitly."
        clearLabel="Clear Battle Macro"
        compact
        compactPanelTitle="Battle Macro Picker"
        compactStorageKey="combat.battle.macro.picker.position"
        onChange={commitMacroId}
      />
      {value > 0 && (
        <p className="combat-inline-warning">
          Positive Battle Macro values are preserved, but modern Realmz does not run them at the end of each combat round. Re-selecting a macro will store the runnable value.
        </p>
      )}
    </div>
  );
}

export function battleReferenceRawOption(
  query: string,
  options: ReferencePickerOption<number>[],
  label: string,
  detail: string
): ReferencePickerOption<number> | null {
  const parsed = numericReferenceQuery(query);
  if (parsed == null) return null;
  const value = Math.abs(Math.trunc(parsed));
  if (!value || options.some((option) => option.value === value)) return null;
  return {
    key: `battle-reference:raw:${label}:${value}`,
    value,
    label: `${label} ${value}`,
    detail,
    searchText: `${value} ${label} raw missing imported unresolved`
  };
}
