import { describe, expect, it } from "vitest";
import { createScenarioSeedCompilerContext } from "./compilerContext";
import type { ScenarioSeedMapOperationContext } from "./mapCompiler";
import { mapStorageTileIndex } from "./mapPaintingPrimitives";
import { applyTerrainGroup } from "./terrainPainter";

describe("scenario seed Smart Terrain painter", () => {
  it("applies deterministic terrain plans without changing distant cells", () => {
    const context: ScenarioSeedMapOperationContext = {
      landlook: 0,
      levelType: "land",
      mapSeed: "land:0",
      regions: new Map(),
      buildContext: createScenarioSeedCompilerContext()
    };
    const operation = {
      kind: "terrainGroup" as const,
      terrain: "water" as const,
      geometry: { kind: "rect" as const, x: 10, y: 10, width: 5, height: 4 }
    };
    const first = new Array(90 * 90).fill(156);
    const second = new Array(90 * 90).fill(156);

    applyTerrainGroup(first, operation, context);
    applyTerrainGroup(second, operation, context);

    expect(first).toEqual(second);
    expect(first[mapStorageTileIndex("land", 12, 12)]).not.toBe(156);
    expect(first[mapStorageTileIndex("land", 40, 40)]).toBe(156);
  });
});
