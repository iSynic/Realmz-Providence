import { useMemo } from "react";
import {
  resolveSignedMessageTarget,
  signedTargetBehaviorLabel,
  signedTargetValueForSelection,
  type ScriptTargetOption,
  targetOptionForOpcodeValue,
  targetOptionsForOpcode
} from "../../components/RealmzTargetPicker";
import type { LibraryCatalog, Project, RealmzTargetRecordKind } from "../../types";
import { ReferenceField, numericReferenceQuery, type ReferencePickerOption } from "../../ui";

export function ReferenceIdField({
  project,
  catalog,
  label,
  emptyLabel,
  opcode,
  value,
  createRecordType,
  compact = false,
  onCommit,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  emptyLabel: string;
  opcode: number;
  value: number;
  createRecordType?: RealmzTargetRecordKind;
  compact?: boolean;
  onCommit: (value: number) => void;
  onCreateTarget?: (id: number) => void;
}) {
  const resolvedValue = resolveSignedMessageTarget(opcode, value);
  const selected = useMemo(() => targetOptionForOpcodeValue(project, opcode, value, catalog), [catalog, opcode, project, value]);
  const options = useMemo(() => targetOptionsForOpcode(project, opcode, catalog), [catalog, opcode, project]);
  const pickerOptions = useMemo(() => options.map(targetReferencePickerOption), [options]);
  const hasRawValue = resolvedValue !== 0 && !selected;
  const canCreate = Boolean(createRecordType && onCreateTarget && (!selected || hasRawValue || value === 0));
  const createId = resolvedValue > 0 && !selected ? resolvedValue : createRecordType ? nextAuthorableTargetId(project, createRecordType) : resolvedValue;
  const selectTarget = (next: number) => {
    onCommit(signedTargetValueForSelection(opcode, value, next));
  };
  const detail = selected
    ? [selected.detail, selected.summary, signedTargetBehaviorLabel(opcode, value), selected.compatibility, selected.sourceState].filter(Boolean).join(" | ")
    : hasRawValue
      ? "Current value has no matching target yet."
      : emptyLabel;
  const createAction = canCreate ? (
    <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
      onCreateTarget?.(createId);
      onCommit(signedTargetValueForSelection(opcode, value, createId));
    }}>
      Create {label} {createId}
    </button>
  ) : undefined;

  if (compact) {
    return (
      <div className="script-reference-id-field compact">
        <span>{label}</span>
        <ReferenceField
          ariaLabel={`Search ${label}`}
          placeholder={`Search ${label.toLowerCase()}...`}
          options={pickerOptions}
          value={value}
          selectedValue={resolvedValue}
          current={{
            label: selected?.label ?? (hasRawValue ? `Current value ${resolvedValue}` : emptyLabel),
            detail,
            state: selected ? "resolved" : hasRawValue ? "unresolved" : "empty"
          }}
          rawOptionForQuery={(query) => rawReferenceTargetOption(query, opcode, label, options)}
          resultNoun="target"
          emptyTitle={`No ${label.toLowerCase()} matches`}
          emptyBody="Try another name, numeric ID, or target detail."
          clearLabel={`Clear ${label.toLowerCase()}`}
          currentActions={createAction}
          className="script-reference-picker-field"
          compact
          compactPanelTitle={label}
          onChange={selectTarget}
        />
        <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} value`} />
      </div>
    );
  }

  return (
    <div className="script-reference-id-field">
      <span>{label}</span>
      <ReferenceField
        ariaLabel={`Search ${label}`}
        placeholder={`Search ${label.toLowerCase()}...`}
        options={pickerOptions}
        value={value}
        selectedValue={resolvedValue}
        current={{
          label: selected?.label ?? (hasRawValue ? `Current value ${resolvedValue}` : emptyLabel),
          detail,
          state: selected ? "resolved" : hasRawValue ? "unresolved" : "empty"
        }}
        rawOptionForQuery={(query) => rawReferenceTargetOption(query, opcode, label, options)}
        resultNoun="target"
        emptyTitle={`No ${label.toLowerCase()} matches`}
        emptyBody="Try another name, numeric ID, or target detail."
        clearLabel={`Clear ${label.toLowerCase()}`}
        currentActions={createAction}
        className="script-reference-picker-field"
        onChange={selectTarget}
      />
    </div>
  );
}

function targetReferencePickerOption(option: ScriptTargetOption): ReferencePickerOption<number> {
  return {
    key: option.key,
    value: option.value,
    label: option.label,
    detail: [option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | "),
    searchText: [option.value, option.label, option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" ")
  };
}

export function rawReferenceTargetOption(
  query: string,
  opcode: number,
  label: string,
  options: ScriptTargetOption[]
): ReferencePickerOption<number> | null {
  const rawValue = numericReferenceQuery(query);
  if (rawValue == null || rawValue === 0) return null;
  const resolvedRawValue = resolveSignedMessageTarget(opcode, rawValue);
  const selected = options.find((option) => option.value === resolvedRawValue) ?? null;
  if (selected && rawValue === resolvedRawValue) return null;
  const behavior = signedTargetBehaviorLabel(opcode, rawValue);
  return {
    key: `raw-target:${opcode}:${rawValue}`,
    value: rawValue,
    label: behavior && selected ? `${selected.label} | ${behavior}` : `Use raw ${label.toLowerCase()} value ${rawValue}`,
    detail: selected ? [selected.detail, behavior].filter(Boolean).join(" | ") : "No decoded target record found.",
    searchText: `${rawValue} ${resolvedRawValue} ${label} ${behavior} raw target`
  };
}
export function nextAuthorableTargetId(project: Project, recordType: RealmzTargetRecordKind) {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    recordType === "timedEncounter" ? project.timedEncounters :
    project.questLabels;
  const used = new Set((records ?? []).map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size + 1;
}
