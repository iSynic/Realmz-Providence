import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { BattleRecord, MonsterRecord } from "../../types";
import { buildCombatLookups } from "./combatLookups";

function monster(id: number, hitDice: number): MonsterRecord {
  return { id, hitDice, iconId: 0 } as MonsterRecord;
}

describe("combat lookups", () => {
  it("keeps monster 0 author-facing while excluding unreferenced post-terminator records", () => {
    const project = createBrowserProject("Monster limits");
    project.monsters = [
      monster(0, 4),
      monster(1, 255),
      monster(2, 8)
    ];

    const initial = buildCombatLookups(project, null);

    expect(initial.monsterById.has(0)).toBe(true);
    expect(initial.monsterById.has(2)).toBe(true);
    expect(initial.tabCounts.monsters).toBe(1);

    project.battles = [{ id: 7, grid: [2] } as BattleRecord];
    const referencedTail = buildCombatLookups(project, null);
    expect(referencedTail.tabCounts.monsters).toBe(2);
  });

  it("indexes normal, monster, and mega records without merging their IDs", () => {
    const project = createBrowserProject("Monster sets");
    project.monsters = [monster(0, 2)];
    project.monsterSets = [
      { sourceFile: "Data MD1", setId: 1, monsters: [monster(0, 8)] },
      { sourceFile: "Data MD-1", setId: -1, monsters: [monster(0, 16)] }
    ];

    const model = buildCombatLookups(project, null);

    expect(model.monsterBySetAndId.get(0)?.get(0)?.hitDice).toBe(2);
    expect(model.monsterBySetAndId.get(1)?.get(0)?.hitDice).toBe(8);
    expect(model.monsterBySetAndId.get(-1)?.get(0)?.hitDice).toBe(16);
  });
});
