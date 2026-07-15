import { ReferenceField, type ReferencePickerOption } from "../../ui";
import { FieldLabel } from "./CombatFields";
import type { CombatSelectOption } from "./monsterReferenceModel";

export function monsterAttackCodePickerOptions(
  options: CombatSelectOption[],
  noun: string
): ReferencePickerOption<number>[] {
  return options.map((option) => ({
    key: option.key,
    value: option.value,
    label: `${option.value}: ${option.label}`,
    detail: option.detail || `Monster attack ${noun} code`,
    searchText: `${option.value} ${option.label} ${option.detail || ""} monster attack ${noun}`
  }));
}

export function MonsterAttackCodePicker({
  label,
  contextLabel = label,
  value,
  options,
  onCommit
}: {
  label: string;
  contextLabel?: string;
  value: number;
  options: CombatSelectOption[];
  onCommit: (value: number) => void;
}) {
  const noun = label === "Special" ? "special attack" : label.toLowerCase();
  const pickerOptions = monsterAttackCodePickerOptions(options, noun);
  const selected = pickerOptions.find((option) => option.value === value) ?? null;
  const storageNoun = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="combat-field monster-attack-code-picker">
      <FieldLabel label={label} />
      <ReferenceField
        ariaLabel={`Search ${contextLabel.toLowerCase()}`}
        placeholder={`Search ${noun} code or name...`}
        options={pickerOptions}
        value={value}
        selectedValue={selected?.value ?? null}
        current={selected ? {
          label: selected.label,
          detail: selected.detail,
          state: "resolved"
        } : {
          label: `Current value ${value}`,
          detail: `This imported ${noun} code is not in Providence's decoded list.`,
          state: "unresolved"
        }}
        resultNoun={noun}
        resultNounPlural={noun === "special attack" ? "special attacks" : `${noun}s`}
        emptyTitle={`No matching ${noun}s`}
        emptyBody={`Try a numeric code or search the known ${noun} names.`}
        initialVisibleCount={40}
        visibleCountStep={40}
        compact
        compactPanelTitle={`${contextLabel} Picker`}
        compactStorageKey={`combat.monster.attack-${storageNoun}.picker.position`}
        onChange={onCommit}
      />
    </div>
  );
}
