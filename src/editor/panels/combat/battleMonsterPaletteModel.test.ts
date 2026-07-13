import { describe, expect, it } from "vitest";
import type { MonsterRecord } from "../../types";
import {
  MAX_DIVINITY_BATTLE_MONSTER_ID,
  battleMonsterPaintEntries,
  monsterBrushPaletteWindow
} from "./battleMonsterPaletteModel";

function monster(id: number): MonsterRecord {
  return {
    id,
    displayName: `Monster ${id}`,
    iconId: id,
    hitDice: 1,
    armor: 0,
    agility: 0
  } as MonsterRecord;
}

describe("battleMonsterPaintEntries", () => {
  it("reserves Monster 0 and excludes IDs beyond Divinity's battle-authorable range", () => {
    const entries = battleMonsterPaintEntries([
      monster(0),
      monster(1),
      monster(MAX_DIVINITY_BATTLE_MONSTER_ID),
      monster(MAX_DIVINITY_BATTLE_MONSTER_ID + 1)
    ]);

    expect(entries.map((entry) => entry.id)).toEqual([1, MAX_DIVINITY_BATTLE_MONSTER_ID]);
    expect(entries.map((entry) => entry.key)).toEqual(["scenario:1", `scenario:${MAX_DIVINITY_BATTLE_MONSTER_ID}`]);
  });
});

describe("monsterBrushPaletteWindow", () => {
  it("renders every entry until the viewport has been measured", () => {
    expect(monsterBrushPaletteWindow(164, 0, 0, 0)).toEqual({
      startIndex: 0,
      endIndex: 164,
      topSpacer: 0,
      bottomSpacer: 0
    });
  });

  it("virtualizes complete rows with overscan after measurement", () => {
    expect(monsterBrushPaletteWindow(164, 392, 320, 800)).toEqual({
      startIndex: 40,
      endIndex: 80,
      topSpacer: 640,
      bottomSpacer: 1360
    });
  });
});
