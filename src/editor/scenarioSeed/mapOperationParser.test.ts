import { describe, expect, it } from "vitest";
import type { ParseContext } from "./parsePrimitives";
import {
  parseMapOperation,
  parseRegion,
  validateMapOperationLevelTypes
} from "./mapOperationParser";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed map operation parser", () => {
  it("normalizes regions and representative semantic operations", () => {
    const ctx = context();

    expect(parseRegion({ key: "harbor", x: 4, y: 5, width: 8, height: 9 }, "$.maps[0].regions[0]", ctx)).toEqual({
      key: "harbor",
      x: 4,
      y: 5,
      width: 8,
      height: 9
    });
    expect(parseMapOperation({
      kind: "semanticRoad",
      paths: [[{ x: 1, y: 2 }, { x: 1, y: 6 }, { x: 5, y: 6 }]]
    }, "$.maps[0].operations[0]", ctx)).toEqual({
      kind: "semanticRoad",
      paths: [[{ x: 1, y: 2 }, { x: 1, y: 6 }, { x: 5, y: 6 }]]
    });
    expect(ctx.errors).toEqual([]);
  });

  it("preserves ordered room bounds, door, and tile diagnostics", () => {
    const ctx = context();

    expect(parseMapOperation({
      kind: "room",
      x: 88,
      y: 88,
      width: 4,
      height: 4,
      wallTile: 40000,
      floorTile: 1,
      doors: [{ side: "north", offset: 4, tile: 1 }]
    }, "$.maps[0].operations[0]", ctx)).toEqual({
      kind: "room",
      x: 88,
      y: 88,
      width: 4,
      height: 4,
      wallTile: 40000,
      floorTile: 1,
      doors: [{ side: "north", offset: 4, tile: 1 }]
    });
    expect(ctx.errors).toEqual([
      "$.maps[0].operations[0] extends past map column 89.",
      "$.maps[0].operations[0] extends past map row 89.",
      "$.maps[0].operations[0].doors[0].offset must be less than the room's width.",
      "$.maps[0].operations[0].wallTile must be less than or equal to 32767."
    ]);
  });

  it("reports semantic topology and stable-name failures without losing parsed structure", () => {
    const ctx = context();

    expect(parseMapOperation({
      kind: "semanticRoad",
      paths: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]]
    }, "$.maps[0].operations[0]", ctx)).toEqual({
      kind: "semanticRoad",
      paths: [[{ x: 1, y: 1 }, { x: 2, y: 2 }]]
    });
    expect(parseMapOperation({
      kind: "namedTile",
      x: 3,
      y: 4,
      name: "unknown-landmark"
    }, "$.maps[0].operations[1]", ctx)).toEqual({
      kind: "namedTile",
      x: 3,
      y: 4,
      name: "open-ground"
    });
    expect(ctx.errors).toEqual([
      "$.maps[0].operations[0].paths[0][0] to $.maps[0].operations[0].paths[0][1] must be horizontal or vertical.",
      "$.maps[0].operations[1].name must be a supported stable named land tile from the scenario schema."
    ]);
  });

  it("keeps land-only and dungeon-only operation constraints explicit", () => {
    const ctx = context();
    const landOnly = parseMapOperation({
      kind: "hiddenWalkable",
      x: 1,
      y: 1,
      tile: 169
    }, "$.maps[0].operations[0]", ctx);
    const dungeonOnly = parseMapOperation({
      kind: "dungeonPassage",
      x: 2,
      y: 2,
      directions: ["north", "east"]
    }, "$.maps[0].operations[1]", ctx);

    if (landOnly && dungeonOnly) {
      validateMapOperationLevelTypes([landOnly, dungeonOnly], "dungeon", "$.maps[0]", ctx);
      validateMapOperationLevelTypes([landOnly, dungeonOnly], "land", "$.maps[1]", ctx);
    }

    expect(ctx.errors).toEqual([
      "$.maps[0].operations[0].kind hiddenWalkable is only valid on land maps.",
      "$.maps[1].operations[1].kind dungeonPassage is only valid on dungeon maps."
    ]);
  });
});
