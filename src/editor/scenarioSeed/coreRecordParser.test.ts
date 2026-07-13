import { describe, expect, it } from "vitest";
import type { ParseContext } from "./parsePrimitives";
import {
  parseBattle,
  parseItem,
  parseMessage,
  parseMonster,
  parseQuest,
  parseShop,
  parseTreasure
} from "./coreRecordParser";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed core record parsers", () => {
  it("normalizes messages, quests, and battle placements", () => {
    const ctx = context();

    expect(parseMessage({ key: "arrival", text: "The bell tolls." }, "$.messages[0]", ctx)).toEqual({
      key: "arrival",
      text: "The bell tolls."
    });
    expect(parseQuest({ key: "lens", label: "Find the lens", note: "In the flooded tower" }, "$.quests[0]", ctx)).toEqual({
      key: "lens",
      label: "Find the lens",
      note: "In the flooded tower"
    });
    expect(parseBattle({
      key: "wight-ambush",
      placements: [{ x: 3, y: 4, monster: "bell-wight", friendly: false }],
      dist: 2
    }, "$.battles[0]", ctx)).toEqual({
      key: "wight-ambush",
      placements: [{ x: 3, y: 4, monster: "bell-wight", friendly: false }],
      dist: 2
    });
    expect(ctx.errors).toEqual([]);
  });

  it("retains normalized monster data while reporting fixed-array diagnostics", () => {
    const ctx = context();

    expect(parseMonster({
      key: "bell-wight",
      variants: "generated",
      attacks: [[1, 6, 0]],
      typeFlags: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      items: ["bell-clapper"],
      hitDice: 3
    }, "$.monsters[0]", ctx)).toMatchObject({
      key: "bell-wight",
      variants: "generated",
      attacks: [[1, 6, 0, 0]],
      typeFlags: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      items: ["bell-clapper"],
      hitDice: 3
    });
    expect(ctx.errors).toEqual([
      "$.monsters[0].attacks[0] must contain exactly 4 byte-sized attack values.",
      "$.monsters[0].typeFlags can contain at most 8 entries."
    ]);
  });

  it("normalizes treasure and shop item references with bounded stock quantities", () => {
    const ctx = context();

    expect(parseTreasure({ key: "vault", itemIds: ["bell-clapper"], gold: 50 }, "$.treasures[0]", ctx)).toEqual({
      key: "vault",
      itemIds: ["bell-clapper"],
      gold: 50
    });
    expect(parseShop({
      key: "salvager",
      stock: [{ itemId: "bell-clapper", quantity: 256 }],
      inflation: 120
    }, "$.shops[0]", ctx)).toEqual({
      key: "salvager",
      stock: [{ itemId: "bell-clapper", quantity: 256 }],
      inflation: 120
    });
    expect(ctx.errors).toEqual([
      "$.shops[0].stock[0].quantity must be less than or equal to 255."
    ]);
  });

  it("keeps scenario item row, Realmz ID, and semantic type relationships explicit", () => {
    const ctx = context();

    expect(parseItem({
      key: "bell-clapper",
      id: 1,
      itemId: 803,
      identifiedName: "Bell Clapper",
      typeName: "scenarioItem",
      cost: 50
    }, "$.items[0]", ctx)).toEqual({
      key: "bell-clapper",
      id: 1,
      itemId: 803,
      identifiedName: "Bell Clapper",
      typeName: "scenarioItem",
      cost: 50
    });
    expect(ctx.errors).toEqual([
      "$.items[0].itemId must equal 800 + id when both are supplied."
    ]);
  });
});
