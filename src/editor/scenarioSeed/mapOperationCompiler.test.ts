import { describe, expect, it } from "vitest";
import { createScenarioSeedCompilerContext } from "./compilerContext";
import type { ScenarioSeedMapOperationContext } from "./mapCompiler";
import { applyScenarioSeedMapOperation } from "./mapOperationCompiler";
import { mapStorageTileIndex } from "./mapPaintingPrimitives";

function mapContext(landlook: number, levelType: "land" | "dungeon" = "land"): ScenarioSeedMapOperationContext {
  return {
    landlook,
    levelType,
    mapSeed: `${levelType}:0`,
    regions: new Map(),
    buildContext: createScenarioSeedCompilerContext()
  };
}

describe("scenario seed map operation compiler", () => {
  it("paints Castle walls, corners, floor, and correctly oriented doors", () => {
    const tiles = new Array(90 * 90).fill(40);
    const context = mapContext(4, "dungeon");

    applyScenarioSeedMapOperation(tiles, {
      kind: "castleRoom",
      x: 10,
      y: 12,
      width: 6,
      height: 5,
      doors: [{ side: "south", offset: 3 }]
    }, context);

    expect(tiles[mapStorageTileIndex("dungeon", 10, 12)]).toBe(36);
    expect(tiles[mapStorageTileIndex("dungeon", 15, 12)]).toBe(37);
    expect(tiles[mapStorageTileIndex("dungeon", 10, 16)]).toBe(34);
    expect(tiles[mapStorageTileIndex("dungeon", 15, 16)]).toBe(35);
    expect(tiles[mapStorageTileIndex("dungeon", 12, 14)]).toBe(111);
    expect(tiles[mapStorageTileIndex("dungeon", 13, 16)]).toBe(77);
  });

  it("preserves named-feature placement warnings", () => {
    const tiles = new Array(90 * 90).fill(156);
    const context = mapContext(0);

    applyScenarioSeedMapOperation(tiles, { kind: "namedTile", x: 8, y: 9, name: "boat" }, context);

    expect(context.buildContext.diagnostics).toEqual([expect.objectContaining({
      severity: "warning",
      code: "boat-off-water",
      family: "map",
      key: "land:0"
    })]);
  });
});
