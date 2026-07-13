import { describe, expect, it } from "vitest";
import { createScenarioSeedCompilerContext } from "./compilerContext";
import type { ScenarioSeedMapOperationContext } from "./mapCompiler";
import { mapStorageTileIndex } from "./mapPaintingPrimitives";
import { applyNaturalScatter } from "./naturalScatter";

describe("scenario seed natural scatter", () => {
  it("is deterministic and preserves the protected radius around named regions", () => {
    const context: ScenarioSeedMapOperationContext = {
      landlook: 0,
      levelType: "land",
      mapSeed: "land:0",
      regions: new Map([["shrine", { x: 20, y: 20 }]]),
      buildContext: createScenarioSeedCompilerContext()
    };
    const operation = {
      kind: "naturalScatter" as const,
      geometry: { kind: "rect" as const, x: 5, y: 5, width: 35, height: 35 },
      density: 100,
      spacing: 2
    };
    const first = new Array(90 * 90).fill(156);
    const second = new Array(90 * 90).fill(156);

    applyNaturalScatter(first, operation, context);
    applyNaturalScatter(second, operation, context);

    expect(first).toEqual(second);
    expect(first.filter((tile) => tile !== 156).length).toBeGreaterThan(20);
    for (let y = 17; y <= 23; y++) {
      for (let x = 17; x <= 23; x++) {
        expect(first[mapStorageTileIndex("land", x, y)]).toBe(156);
      }
    }
  });
});
