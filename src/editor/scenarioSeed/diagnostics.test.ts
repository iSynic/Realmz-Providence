import { describe, expect, it } from "vitest";
import { mapTileIndex } from "../map/geometry";
import type { MapEntity } from "../types";
import type { ScenarioSeed } from "../scenarioSeed";
import { createScenarioSeedCompilerContext } from "./compilerContext";
import {
  addScenarioSeedMapPlacementDiagnostics,
  addScenarioSeedTopologyDiagnostics
} from "./diagnostics";

describe("scenario seed compiler diagnostics", () => {
  it("warns when a teleport lands on another teleport action point", () => {
    const context = createScenarioSeedCompilerContext();
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      scenario: { name: "Topology" },
      actionPoints: [
        {
          key: "source",
          levelIndex: 0,
          x: 1,
          y: 1,
          steps: [{ kind: "teleport", landLevel: 0, x: 5, y: 6 }]
        },
        {
          key: "destination",
          levelIndex: 0,
          x: 5,
          y: 6,
          steps: [{ kind: "teleport", landLevel: 0, x: 1, y: 1 }]
        }
      ]
    };

    addScenarioSeedTopologyDiagnostics(seed, context);

    expect(context.diagnostics).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "teleport-destination-action-point",
      family: "action point",
      key: "source"
    }));
    expect(context.warnings[0]).toContain("immediate return or teleport chain");
  });

  it("warns when scenario starts and action points occupy water", () => {
    const context = createScenarioSeedCompilerContext();
    const map: MapEntity = {
      id: "land:0",
      levelType: "land",
      source: "Data LD",
      index: 0,
      name: "Island",
      width: 90,
      height: 90,
      tiles: new Array(90 * 90).fill(156),
      render: { tilesetId: "landlook-0", landlook: 0, mode: "outdoor-landlook" }
    };
    map.tiles[mapTileIndex(map, 4, 5)] = 60;
    map.tiles[mapTileIndex(map, 8, 9)] = 60;
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      scenario: { name: "Placement", start: { landLevel: 0, x: 4, y: 5 } },
      actionPoints: [{ key: "boat", levelIndex: 0, x: 8, y: 9, steps: [] }]
    };

    addScenarioSeedMapPlacementDiagnostics(seed, [map], context);

    expect(context.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(["site-on-water", "site-on-water"]);
    expect(context.diagnostics.map((diagnostic) => diagnostic.key)).toEqual(["Scenario start", "boat"]);
  });
});
