import { useMemo, useState } from "react";
import { itemReferenceOptions } from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";
import type { ReferencePickerOption } from "../../ui";
import { FieldLabel } from "./CombatFields";
import {
  MonsterRecordReferenceField,
  monsterReferencePickerOptions
} from "./MonsterRecordReferenceField";
import { monsterRequiredWeaponOptions } from "./monsterReferenceOptions";
import {
  MONSTER_DEATH_ACTION_HELP,
  MONSTER_REQUIRED_WEAPON_HELP,
  MONSTER_SUMMON_ELIGIBLE_HELP,
  MONSTER_SUMMON_ELIGIBLE_OPTIONS,
  RANDOM_WEAPON_OPTIONS,
  monsterRequiredWeaponDisplayCode,
  monsterRequiredWeaponStoredCode,
  type CombatSelectOption
} from "./monsterReferenceModel";
export { monsterRawReferenceOption, monsterReferencePickerOptions } from "./MonsterRecordReferenceField";
export { ItemSlotGrid, SpellSlotGrid } from "./MonsterSpellLootFields";

export function MacroReferenceField({ project, value, onCommit }: { project: Project; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<ReferencePickerOption<number>[]>(
    () => monsterReferencePickerOptions((project.triggers ?? [])
      .filter((trigger) => trigger.source === "Data ED3" && trigger.recordIndex > 0)
      .sort((a, b) => a.recordIndex - b.recordIndex)
      .map((trigger) => {
        const actionCount = trigger.actions.filter((action) => action.rawCode !== 0).length;
        return {
          key: `macro:${trigger.recordIndex}`,
          value: trigger.recordIndex,
          label: `Extra Action Point ${trigger.recordIndex}`,
          detail: `${actionCount} action ${actionCount === 1 ? "step" : "steps"}`
        };
      }), "monster death macro extra action point"),
    [project.triggers]
  );
  return (
    <MonsterRecordReferenceField
      label="Monster Macro"
      help={MONSTER_DEATH_ACTION_HELP}
      value={value}
      options={options}
      emptyLabel="No monster macro"
      emptyDetail="No Extra Action Point runs when this monster dies."
      unresolvedNoun="Extra Action Point"
      placeholder="Search Extra Action Point # or action count..."
      resultNoun="macro"
      panelTitle="Monster Macro Picker"
      storageKey="combat.monster.macro.picker.position"
      onCommit={onCommit}
    />
  );
}

export function WeaponIdField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<ReferencePickerOption<number>[]>(() => [
    ...monsterReferencePickerOptions(RANDOM_WEAPON_OPTIONS, "random weapon category"),
    ...itemReferenceOptions(project, catalog).map((item) => ({
      key: item.key,
      value: item.value,
      label: item.label,
      detail: [item.detail, item.sourceState].filter(Boolean).join(" | "),
      searchText: [item.value, item.label, item.category, item.detail, item.summary, item.sourceState].join(" ")
    }))
  ], [catalog, project]);
  return (
    <MonsterRecordReferenceField
      label="Weapon Used"
      value={value}
      options={options}
      emptyLabel="No weapon"
      emptyDetail="This monster does not use a weapon record."
      unresolvedNoun="Weapon"
      placeholder="Search weapon #, name, category, or random group..."
      resultNoun="weapon"
      panelTitle="Monster Weapon Picker"
      storageKey="combat.monster.weapon.picker.position"
      onCommit={onCommit}
    />
  );
}

export function RequiredWeaponField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo(
    () => monsterReferencePickerOptions(monsterRequiredWeaponOptions(project, catalog), "required weapon restriction"),
    [catalog, project]
  );
  return (
    <MonsterRecordReferenceField
      label="Required Weapon"
      value={monsterRequiredWeaponDisplayCode(value)}
      options={options}
      emptyLabel="All weapons"
      emptyDetail="Any weapon may damage this monster."
      unresolvedNoun="Required weapon code"
      help={MONSTER_REQUIRED_WEAPON_HELP}
      placeholder="Search weapon #, name, or restriction..."
      resultNoun="restriction"
      panelTitle="Required Weapon Picker"
      storageKey="combat.monster.required-weapon.picker.position"
      allowRawValue={false}
      onCommit={(displayCode) => onCommit(monsterRequiredWeaponStoredCode(displayCode))}
    />
  );
}

export function SummonEligibleField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  return (
    <NumberSelectField
      label="Summon Eligible"
      value={Math.trunc(Number.isFinite(value) ? value : 0)}
      options={MONSTER_SUMMON_ELIGIBLE_OPTIONS}
      emptyLabel="0 = No"
      help={MONSTER_SUMMON_ELIGIBLE_HELP}
      onCommit={onCommit}
    />
  );
}

export function MonsterAttackCodePicker({
  label,
  value,
  options,
  onCommit
}: {
  label: string;
  value: number;
  options: CombatSelectOption[];
  onCommit: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const menuOptions = selected ? options : [{ key: `${label}:current:${value}`, value, label: `Current value ${value}` }, ...options];
  const title = selected ? `${selected.value} ${selected.label}` : `Current value ${value}`;
  return (
    <div
      className="combat-field monster-attack-code-picker"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <FieldLabel label={label} />
      <button
        type="button"
        className="monster-attack-code-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {value}
      </button>
      {open ? (
        <div className="monster-attack-code-menu" role="listbox" aria-label={label}>
          {menuOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "selected" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCommit(option.value);
                setOpen(false);
              }}
            >
              <span>{option.value}</span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NumberSelectField({
  label,
  value,
  options,
  emptyLabel,
  help,
  onCommit
}: {
  label: string;
  value: number;
  options: CombatSelectOption[];
  emptyLabel: string;
  help?: string;
  onCommit: (value: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedOption = value !== 0 ? options.find((option) => option.value === value) ?? null : null;
  const hasCurrentValue = value !== 0 && !selectedOption;
  const renderedOptions = expanded ? options : selectedOption ? [selectedOption] : [];
  return (
    <label className="combat-field combat-select-field">
      <FieldLabel label={label} help={help} />
      <select
        value={String(value)}
        onFocus={() => setExpanded(true)}
        onMouseDown={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onChange={(event) => {
          onCommit(Number(event.currentTarget.value));
          setExpanded(false);
        }}
      >
        <option value="0">{emptyLabel}</option>
        {hasCurrentValue && <option value={String(value)}>Current value {value}</option>}
        {renderedOptions.map((option, index) => (
          <option key={`${option.key}:${option.value}:${index}`} value={String(option.value)} title={option.detail}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
