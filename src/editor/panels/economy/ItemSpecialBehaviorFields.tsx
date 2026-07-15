import { CONDITION_LABELS } from "../../rulesCatalog";
import { ReferenceField, type ReferencePickerOption } from "../../ui";
import { ItemNumberInput } from "./ItemNumberInput";
import "./ItemSpecialBehaviorFields.css";

export type ItemSpecialEffectGroup = "none" | "power" | "addCondition" | "removeCondition" | "hitBonus" | "raw";
export type ItemSpecialAttributeGroup = "none" | "ability" | "monsterType" | "partyCondition" | "raw";

export function ItemSpecialEffectCodeField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const group = itemSpecialEffectGroupForValue(value);
  return (
    <div className="item-cascade-field item-special-effect-field" title="Primary Realmz special behavior code. Unknown raw values are preserved until changed.">
      <label>
        <span>Special 1</span>
        <select
          value={group}
          onChange={(event) => {
            const nextGroup = event.currentTarget.value as ItemSpecialEffectGroup;
            onChange(defaultItemSpecialEffectValue(nextGroup, value));
          }}
        >
          <option value="none">No special effect</option>
          <option value="power">Power level</option>
          <option value="addCondition">Add condition</option>
          <option value="removeCondition">Remove condition</option>
          <option value="hitBonus">Hit bonus</option>
          <option value="raw">Raw code</option>
        </select>
      </label>
      {group === "raw" ? (
        <ItemNumberInput label="Raw Code" value={value} onCommit={onChange} />
      ) : group !== "none" && (
        <ItemSpecialBehaviorReferenceField
          fieldLabel="Special 1"
          detailLabel={itemSpecialEffectDetailLabel(group)}
          value={value}
          options={itemSpecialEffectReferenceOptions(group)}
          storageKey={`economy.item.special-1.${group}.picker.position`}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export function ItemSpecialAttributeField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const group = itemSpecialAttributeGroupForValue(value);
  return (
    <div className="item-cascade-field" title={`${label} companion field for ability, monster-type, and party-condition behavior.`}>
      <label>
        <span>{label}</span>
        <select
          value={group}
          onChange={(event) => {
            const nextGroup = event.currentTarget.value as ItemSpecialAttributeGroup;
            onChange(defaultItemSpecialAttributeValue(nextGroup, value));
          }}
        >
          <option value="none">No behavior</option>
          <option value="ability">Special ability</option>
          <option value="monsterType">Monster-type bonus</option>
          <option value="partyCondition">Party condition</option>
          <option value="raw">Raw value</option>
        </select>
      </label>
      {group === "raw" ? (
        <ItemNumberInput label="Raw Value" value={value} onCommit={onChange} />
      ) : group !== "none" && (
        <ItemSpecialBehaviorReferenceField
          fieldLabel={label}
          detailLabel={itemSpecialAttributeDetailLabel(group)}
          value={value}
          options={itemSpecialAttributeReferenceOptions(group)}
          storageKey={`economy.item.${label.toLowerCase().replace(/\s+/g, "-")}.${group}.picker.position`}
          onChange={onChange}
        />
      )}
    </div>
  );
}

export function itemSpecialEffectGroupForValue(value: number): ItemSpecialEffectGroup {
  if (value === 0) return "none";
  if ((value >= -7 && value <= -1) || value === 8) return "power";
  if (value >= 20 && value <= 59) return "addCondition";
  if (value >= 60 && value <= 99) return "removeCondition";
  if (value >= 120 && value <= 122) return "hitBonus";
  return "raw";
}

export function defaultItemSpecialEffectValue(group: ItemSpecialEffectGroup, currentValue: number) {
  if (group === "none") return 0;
  if (group === "power") return currentValue >= -7 && currentValue <= -1 ? currentValue : -1;
  if (group === "addCondition") return currentValue >= 20 && currentValue <= 59 ? currentValue : 20;
  if (group === "removeCondition") return currentValue >= 60 && currentValue <= 99 ? currentValue : 60;
  if (group === "hitBonus") return currentValue >= 120 && currentValue <= 122 ? currentValue : 120;
  return currentValue;
}

export function itemSpecialEffectReferenceOptions(group: ItemSpecialEffectGroup): ReferencePickerOption<number>[] {
  if (group === "power") {
    return [
      ...Array.from({ length: 7 }, (_, index) => itemSpecialOption(
        `item-special-effect:power:${-(index + 1)}`,
        -(index + 1),
        `Power level ${index + 1}`,
        "Realmz item power level"
      )),
      itemSpecialOption("item-special-effect:power:random", 8, "Random power level", "Realmz selects the power level")
    ];
  }
  if (group === "addCondition" || group === "removeCondition") {
    const baseValue = group === "addCondition" ? 20 : 60;
    const verb = group === "addCondition" ? "Add" : "Remove";
    return CONDITION_LABELS.slice(0, 40).map((label, index) => itemSpecialOption(
      `item-special-effect:${group}:${baseValue + index}`,
      baseValue + index,
      `${baseValue + index}: ${label}`,
      `${verb} ${label} condition`
    ));
  }
  if (group === "hitBonus") {
    return [
      itemSpecialOption("item-special-effect:hit:120", 120, "120: Auto hit", "Automatic hit behavior"),
      itemSpecialOption("item-special-effect:hit:121", 121, "121: Penetration bonus", "Penetration bonus behavior"),
      itemSpecialOption("item-special-effect:hit:122", 122, "122: Double to-hit bonus", "Double to-hit bonus behavior")
    ];
  }
  return [];
}

export function itemSpecialAttributeGroupForValue(value: number): ItemSpecialAttributeGroup {
  if (value === 0) return "none";
  if (value > 0 && value < 16) return "ability";
  if (value < 0) return "monsterType";
  if (value >= 30 && value <= 40) return "partyCondition";
  return "raw";
}

export function defaultItemSpecialAttributeValue(group: ItemSpecialAttributeGroup, currentValue: number) {
  if (group === "none") return 0;
  if (group === "ability") return currentValue > 0 && currentValue < 16 ? currentValue : 1;
  if (group === "monsterType") return currentValue < 0 ? currentValue : -1;
  if (group === "partyCondition") return currentValue >= 30 && currentValue <= 40 ? currentValue : 30;
  return currentValue;
}

export function itemSpecialAttributeReferenceOptions(group: ItemSpecialAttributeGroup): ReferencePickerOption<number>[] {
  if (group === "ability") {
    return Array.from({ length: 15 }, (_, index) => itemSpecialOption(
      `item-special-attribute:ability:${index + 1}`,
      index + 1,
      `${index + 1}: Ability ${index + 1}`,
      "Realmz special ability"
    ));
  }
  if (group === "monsterType") {
    return Array.from({ length: 20 }, (_, index) => itemSpecialOption(
      `item-special-attribute:monster:${-(index + 1)}`,
      -(index + 1),
      `${-(index + 1)}: Monster type ${index + 1}`,
      "Monster-type bonus target"
    ));
  }
  if (group === "partyCondition") {
    return Array.from({ length: 11 }, (_, index) => itemSpecialOption(
      `item-special-attribute:party-condition:${index + 30}`,
      index + 30,
      `${index + 30}: Party condition ${index + 30}`,
      "Party-condition behavior"
    ));
  }
  return [];
}

function ItemSpecialBehaviorReferenceField({
  fieldLabel,
  detailLabel,
  value,
  options,
  storageKey,
  onChange
}: {
  fieldLabel: string;
  detailLabel: string;
  value: number;
  options: ReferencePickerOption<number>[];
  storageKey: string;
  onChange: (value: number) => void;
}) {
  const selected = options.find((option) => option.value === value) ?? null;
  const noun = detailLabel.toLowerCase();
  return (
    <div className="item-special-reference-detail">
      <span>{detailLabel}</span>
      <ReferenceField
        ariaLabel={`Search ${fieldLabel} ${noun}`}
        placeholder={`Search ${noun} # or name...`}
        options={options}
        value={value}
        selectedValue={selected?.value ?? null}
        current={selected ? {
          label: selected.label,
          detail: selected.detail,
          state: "resolved"
        } : {
          label: `Current value ${value}`,
          detail: `Imported value ${value} is not decoded for this ${fieldLabel} behavior mode.`,
          state: "unresolved"
        }}
        resultNoun={noun}
        resultNounPlural={`${noun}s`}
        emptyTitle={`No matching ${noun}s`}
        emptyBody={`Try a ${noun} number or decoded behavior name.`}
        compact
        compactPanelTitle={`${fieldLabel} ${detailLabel} Picker`}
        compactStorageKey={storageKey}
        onChange={onChange}
      />
    </div>
  );
}

function itemSpecialOption(key: string, value: number, label: string, detail: string): ReferencePickerOption<number> {
  return {
    key,
    value,
    label,
    detail,
    searchText: `${value} ${label} ${detail}`
  };
}

function itemSpecialEffectDetailLabel(group: ItemSpecialEffectGroup) {
  if (group === "power") return "Power";
  if (group === "addCondition" || group === "removeCondition") return "Condition";
  if (group === "hitBonus") return "Bonus";
  return "Value";
}

function itemSpecialAttributeDetailLabel(group: ItemSpecialAttributeGroup) {
  if (group === "ability") return "Ability";
  if (group === "monsterType") return "Monster Type";
  if (group === "partyCondition") return "Condition";
  return "Value";
}
