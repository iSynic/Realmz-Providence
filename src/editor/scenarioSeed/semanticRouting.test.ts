import { describe, expect, it } from "vitest";
import { createScenarioSeedCompilerContext } from "./compilerContext";
import type { ScenarioSeedMapOperationContext } from "./mapCompiler";
import { mapStorageTileIndex } from "./mapPaintingPrimitives";
import { applySemanticRoad, applySemanticRoute } from "./semanticRouting";

describe("scenario seed semantic routing", () => {
  it("compiles a horizontal path to endpoint and straight road tiles", () => {
    const tiles = new Array(90 * 90).fill(156);

    applySemanticRoad(tiles, {
      kind: "semanticRoad",
      paths: [[{ x: 10, y: 10 }, { x: 12, y: 10 }]]
    }, "land");

    expect([10, 11, 12].map((x) => tiles[mapStorageTileIndex("land", x, 10)])).toEqual([143, 132, 145]);
  });

  it("reports routes separated by an impassable water barrier", () => {
    const tiles = new Array(90 * 90).fill(60);
    tiles[mapStorageTileIndex("land", 20, 45)] = 156;
    tiles[mapStorageTileIndex("land", 70, 45)] = 156;
    const buildContext = createScenarioSeedCompilerContext();
    const mapContext: ScenarioSeedMapOperationContext = {
      landlook: 0,
      levelType: "land",
      mapSeed: "land:0",
      regions: new Map([["west", { x: 20, y: 45 }], ["east", { x: 70, y: 45 }]]),
      buildContext
    };

    applySemanticRoute(tiles, {
      kind: "semanticRoute",
      connections: [["west", "east"]],
      style: "direct"
    }, mapContext);

    expect(buildContext.diagnostics).toEqual([expect.objectContaining({
      severity: "warning",
      code: "semantic-route-unreachable",
      family: "map",
      key: "land:0"
    })]);
  });
});
