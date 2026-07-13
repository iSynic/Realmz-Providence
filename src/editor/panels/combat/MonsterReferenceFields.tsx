import { useMemo, useState } from "react";
import { itemReferenceOptions } from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";
import { FieldLabel } from "./CombatFields";
import { combatSpellOptions } from "./monsterReferenceOptions";
import {
  MONSTER_DEATH_ACTION_HELP,
  MONSTER_REQUIRED_WEAPON_HELP,
  MONSTER_SUMMON_ELIGIBLE_HELP,
  MONSTER_SUMMON_ELIGIBLE_OPTIONS,
  RANDOM_WEAPON_OPTIONS,
  REQUIRED_WEAPON_MAX_SPECIFIC_CODE,
  monsterRequiredWeaponDisplayCode,
  monsterRequiredWeaponStoredCode,
  updateArraySlot,
  type CombatSelectOption
} from "./monsterReferenceModel";

export function MacroReferenceField({ project, value, onCommit }: { project: Project; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<CombatSelectOption[]>(
    () => (project.triggers ?? [])
      .filter((trigger) => trigger.source === "Data ED3")
      .sort((a, b) => a.recordIndex - b.recordIndex)
      .map((trigger) => ({
        key: `macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Extra Action Point ${trigger.recordIndex}`,
        detail: `${trigger.actions.filter((action) => action.rawCode !== 0).length} action step(s)`
      })),
    [project.triggers]
  );
  return <NumberSelectField label="Monster Macro" help={MONSTER_DEATH_ACTION_HELP} value={value} options={options} emptyLabel="No monster macro" onCommit={onCommit} />;
}

export function WeaponIdField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<CombatSelectOption[]>(() => [
    ...RANDOM_WEAPON_OPTIONS,
    ...itemReferenceOptions(project, catalog).map((item) => ({
      key: item.key,
      value: item.value,
      label: item.label,
      detail: item.detail
    }))
  ], [catalog, project]);
  return <NumberSelectField label="Weapon Used" value={value} options={options} emptyLabel="No weapon" onCommit={onCommit} />;
}

export function RequiredWeaponField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo(() => monsterRequiredWeaponOptions(project, catalog), [catalog, project]);
  return (
    <NumberSelectField
      label="Required Weapon"
      value={monsterRequiredWeaponDisplayCode(value)}
      options={options}
      emptyLabel="All weapons"
      help={MONSTER_REQUIRED_WEAPON_HELP}
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

export function SpellSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(() => combatSpellOptions(project, catalog), [catalog, project]);
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 10 }, (_, index) => (
        <NumberSelectField
          key={index}
          label={`Spell ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No spell"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 10))}
        />
      ))}
    </div>
  );
}

export function ItemSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(
    () => itemReferenceOptions(project, catalog).map((item) => ({ key: item.key, value: item.value, label: item.label, detail: item.detail })),
    [catalog, project]
  );
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 6 }, (_, index) => (
        <NumberSelectField
          key={index}
          label={`Item ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No item"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 6))}
        />
      ))}
    </div>
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

function monsterRequiredWeaponOptions(project: Project, catalog: LibraryCatalog | null): CombatSelectOption[] {
  const weaponOptions = new Map(
    itemReferenceOptions(project, catalog)
      .filter((item) => item.category === "weapon" && item.value > 0 && item.value <= REQUIRED_WEAPON_MAX_SPECIFIC_CODE)
      .map((item) => [item.value, item])
  );
  return [
    { key: "required-weapon:blunt", value: -1, label: "Blunt only", detail: "Stored as -1." },
    { key: "required-weapon:sharp", value: -2, label: "Sharp only", detail: "Stored as -2." },
    ...Array.from({ length: REQUIRED_WEAPON_MAX_SPECIFIC_CODE }, (_, index) => {
      const code = index + 1;
      const item = weaponOptions.get(code);
      return {
        key: `required-weapon:${code}`,
        value: code,
        label: item?.label ?? `Weapon ${code}`,
        detail: item ? [item.detail, item.sourceState].filter(Boolean).join(" | ") : `Specific weapon code ${code}.`
      };
    })
  ];
}
