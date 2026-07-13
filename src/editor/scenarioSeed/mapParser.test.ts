import { describe, expect, it } from "vitest";
import type { ParseContext } from "./parsePrimitives";
import { parseMap } from "./mapParser";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed map parser", () => {
  it("normalizes a complete authored map around parsed regions and operations", () => {
    const ctx = context();

    expect(parseMap({
      key: "island",
      levelType: "land",
      index: 0,
      name: "Haunted Island",
      landlook: 0,
      isDark: true,
      useLos: false,
      fillTile: 60,
      regions: [{ key: "harbor", x: 4, y: 5, width: 6, height: 7 }],
      operations: [{ kind: "rect", x: 2, y: 3, width: 4, height: 5, tile: 1 }]
    }, "$.maps[0]", ctx)).toEqual({
      key: "island",
      levelType: "land",
      index: 0,
      name: "Haunted Island",
      landlook: 0,
      isDark: true,
      useLos: false,
      fillTile: 60,
      regions: [{ key: "harbor", x: 4, y: 5, width: 6, height: 7 }],
      operations: [{ kind: "rect", x: 2, y: 3, width: 4, height: 5, tile: 1 }]
    });
    expect(ctx.errors).toEqual([]);
  });

  it("preserves ordered map bounds and operation-level diagnostics", () => {
    const ctx = context();

    parseMap({
      levelType: "dungeon",
      index: -1,
      landlook: 4,
      fillTile: 40000,
      operations: [{ kind: "castleRoom", x: 2, y: 2, width: 8, height: 8 }]
    }, "$.maps[0]", ctx);

    expect(ctx.errors).toEqual([
      "$.maps[0].index must be greater than or equal to 0.",
      "$.maps[0].fillTile must be less than or equal to 32767.",
      "$.maps[0].operations[0].kind castleRoom is only valid on land maps."
    ]);
  });

  it("validates semantic route region references after collecting map regions", () => {
    const ctx = context();

    parseMap({
      levelType: "land",
      landlook: 0,
      regions: [{ key: "harbor", x: 1, y: 1 }],
      operations: [{ kind: "semanticRoute", connections: [["harbor", "lighthouse"]] }]
    }, "$.maps[0]", ctx);

    expect(ctx.errors).toEqual([
      "$.maps[0].operations[0].connections[0] references unknown map region \"lighthouse\"."
    ]);
  });
});
