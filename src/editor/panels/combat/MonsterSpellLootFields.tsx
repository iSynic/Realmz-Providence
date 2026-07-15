import { useMemo } from "react";
import { itemReferenceOptions } from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";
import { MonsterRecordReferenceField, monsterReferencePickerOptions } from "./MonsterRecordReferenceField";
import { combatSpellOptions } from "./monsterReferenceOptions";
import { updateArraySlot } from "./monsterReferenceModel";

export function SpellSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(
    () => monsterReferencePickerOptions(combatSpellOptions(project, catalog), "monster spell spellcaster class level"),
    [catalog, project]
  );
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 10 }, (_, index) => (
        <MonsterRecordReferenceField
          key={index}
          label={`Spell ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No spell"
          emptyDetail={`Spell slot ${index + 1} is empty.`}
          unresolvedNoun="Spell"
          placeholder="Search spell #, name, class, or level..."
          resultNoun="spell"
          panelTitle={`Monster Spell ${index + 1} Picker`}
          storageKey="combat.monster.spell.picker.position"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 10))}
        />
      ))}
    </div>
  );
}

export function ItemSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(
    () => itemReferenceOptions(project, catalog).map((item) => ({
      key: item.key,
      value: item.value,
      label: item.label,
      detail: [item.detail, item.sourceState].filter(Boolean).join(" | "),
      searchText: [item.value, item.label, item.category, item.detail, item.summary, item.sourceState].join(" ")
    })),
    [catalog, project]
  );
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 6 }, (_, index) => (
        <MonsterRecordReferenceField
          key={index}
          label={`Item ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No item"
          emptyDetail={`Loot item slot ${index + 1} is empty.`}
          unresolvedNoun="Item"
          placeholder="Search item #, name, category, or source..."
          resultNoun="item"
          panelTitle={`Monster Loot Item ${index + 1} Picker`}
          storageKey="combat.monster.item.picker.position"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 6))}
        />
      ))}
    </div>
  );
}
