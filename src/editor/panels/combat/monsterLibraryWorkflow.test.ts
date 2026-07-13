import { describe, expect, it } from "vitest";
import type { LibraryCatalog } from "../../types";
import {
  monsterRecordFromLibraryEntry,
  nextAvailableMonsterRecordId,
  visibleMonsterLibraryEntries
} from "./monsterLibraryWorkflow";

type LibraryEntity = LibraryCatalog["entities"][number];

function entry(index: number, summary: Record<string, unknown> = {}): LibraryEntity {
  return {
    id: `monster-scrapbook-entry:${index}`,
    type: "monster-scrapbook-entry",
    label: `Monster ${index}`,
    source: "Realmz reference",
    recordRef: null,
    editState: "inspect-only",
    confidence: "verified",
    summary: { index, displayName: `Monster ${index}`, ...summary }
  };
}

describe("monster library workflow", () => {
  it("allocates the first positive gap in scenario monster IDs", () => {
    expect(nextAvailableMonsterRecordId([{ id: 0 }, { id: 1 }, { id: 3 }])).toBe(2);
  });

  it("hides empty built-in placeholders while retaining populated records", () => {
    const blank = entry(1);
    const populated = entry(2, { hitDice: 4 });
    const catalog = { entities: [blank, populated] } as LibraryCatalog;

    expect(visibleMonsterLibraryEntries(catalog)).toEqual([populated]);
  });

  it("decodes signed bytes and big-endian shorts from raw scrapbook records", () => {
    const rawBytes = new Array(210).fill(0);
    rawBytes[0] = 5;
    rawBytes[5] = 0xfe;
    rawBytes[96] = 0x12;
    rawBytes[97] = 0x34;
    rawBytes[98] = 0xff;
    rawBytes[99] = 0xfe;
    rawBytes[118] = 1;
    const source = entry(7, { displayName: "Bog Wraith", rawBytes });

    const monster = monsterRecordFromLibraryEntry(source, 12);

    expect(monster.id).toBe(12);
    expect(monster.displayName).toBe("Bog Wraith");
    expect(monster.hitDice).toBe(5);
    expect(monster.armor).toBe(-2);
    expect(monster.weapon).toBe(0x1234);
    expect(monster.iconId).toBe(-2);
    expect(monster.notOnMenu).toBe(true);
  });
});
