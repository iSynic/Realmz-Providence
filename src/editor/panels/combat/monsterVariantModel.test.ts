import { describe, expect, it } from "vitest";
import type { MonsterRecord } from "../../types";
import { monsterGeneratePreviewRows, monsterSetToolbarStatus } from "./monsterVariantModel";

function monster(overrides: Partial<MonsterRecord> = {}) {
  return {
    id: 7,
    hitDice: 10,
    staminaBonus: 5,
    armor: 20,
    magicResistance: 15,
    agility: 8,
    movementMax: 6,
    damageBonus: 3,
    spellPoints: 30,
    maxSpellPoints: 40,
    exp: 100,
    saves: [1, 2, 3, 4, 5, 6],
    ...overrides
  } as MonsterRecord;
}

describe("monster variant model", () => {
  it("summarizes the authored Monster and Mega scaling rules", () => {
    const rows = new Map(monsterGeneratePreviewRows(monster()).map((row) => [row.label, row]));

    expect(rows.get("Hit Dice")).toMatchObject({ normal: "10", monster: "16", mega: "25" });
    expect(rows.get("Spell Points")).toMatchObject({ normal: "30", monster: "39", mega: "60" });
    expect(rows.get("Experience")).toMatchObject({ normal: "100", monster: "125", mega: "156" });
    expect(rows.get("Saves 1-6")).toMatchObject({
      normal: "1, 2, 3, 4, 5, 6",
      monster: "11, 12, 13, 14, 15, 16",
      mega: "26, 27, 28, 29, 30, 31"
    });
  });

  it("clamps generated previews to the persisted field ranges", () => {
    const rows = new Map(monsterGeneratePreviewRows(monster({
      hitDice: 250,
      staminaBonus: 125,
      armor: 120,
      magicResistance: 120,
      agility: 126,
      movementMax: 126,
      damageBonus: 126,
      spellPoints: 900,
      maxSpellPoints: 100,
      exp: 30_000,
      saves: [120, 121, 122, 123, 124, 125]
    })).map((row) => [row.label, row]));

    expect(rows.get("Hit Dice")).toMatchObject({ monster: "255", mega: "255" });
    expect(rows.get("Bonus Stamina")).toMatchObject({ monster: "131", mega: "140" });
    expect(rows.get("Agility")).toMatchObject({ monster: "127", mega: "129" });
    expect(rows.get("Movement")).toMatchObject({ monster: "128", mega: "130" });
    expect(rows.get("Armor")).toMatchObject({ monster: "127", mega: "127" });
    expect(rows.get("Spell Points")).toMatchObject({ monster: "999", mega: "999" });
    expect(rows.get("Max Spell Points")).toMatchObject({ monster: "999", mega: "999" });
    expect(rows.get("Experience")).toMatchObject({ monster: "32767", mega: "32767" });
    expect(rows.get("Saves 1-6")).toMatchObject({
      monster: "127, 127, 127, 127, 127, 127",
      mega: "127, 127, 127, 127, 127, 127"
    });
  });

  it("distinguishes missing and blank set records in the toolbar", () => {
    expect(monsterSetToolbarStatus(1, null)).toBe("Data MD1 missing");
    expect(monsterSetToolbarStatus(-1, monster({
      hitDice: 0,
      agility: 0,
      movementMax: 0,
      attackCount: 0,
      displayName: ""
    }))).toBe("Data MD-1 blank");
    expect(monsterSetToolbarStatus(0, monster())).toBe("");
  });
});
