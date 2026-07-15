import type { MonsterRecord, MonsterSetId } from "../../types";
import {
  MonsterRecordReferenceField,
  monsterReferencePickerOptions
} from "./MonsterRecordReferenceField";
import { monsterFacts, monsterSetLabel } from "./battleMonsterPaletteModel";

export { BattleMonsterDetail } from "./BattleMonsterInspector";

export function battleMonsterSelectOptions(monsters: MonsterRecord[], setId: MonsterSetId) {
  return monsterReferencePickerOptions(
    monsters
      .filter((monster) => monster.id !== 0)
      .map((monster) => ({
        key: `battle-anchor:${setId}:${monster.id}`,
        value: monster.id,
        label: `${monster.displayName || `Monster ${monster.id}`} (${monster.id})`,
        detail: `${monsterSetLabel(setId)} | ${monsterFacts(monster)}`
      })),
    `${monsterSetLabel(setId)} battle anchor placement`
  );
}

export function BattleMonsterSelect({
  monsters,
  setId,
  value,
  onCommit
}: {
  monsters: MonsterRecord[];
  setId: MonsterSetId;
  value: number;
  onCommit: (value: number) => void;
}) {
  return (
    <MonsterRecordReferenceField
      label="Anchor Cell Monster"
      value={value}
      options={battleMonsterSelectOptions(monsters, setId)}
      emptyLabel="Empty anchor cell"
      emptyDetail="No monster is placed at this battle-grid anchor cell."
      unresolvedNoun={`${monsterSetLabel(setId)} Monster`}
      placeholder="Search monster #, name, stats, or icon..."
      resultNoun="monster"
      panelTitle="Anchor Cell Monster Picker"
      storageKey="combat.battle.anchor-monster.picker.position"
      help="This writes the absolute monster ID for the selected anchor cell. Data BD uses 0 for empty cells, so Monster 0 cannot be selected here. Use Force Friends to preserve Realmz's negative side-flip encoding."
      allowRawValue={false}
      onCommit={onCommit}
    />
  );
}
