import { describe, expect, it } from "vitest";
import { createScenarioSeedCompilerContext } from "./compilerContext";
import {
  compileScenarioSeedMaps,
  scenarioSeedOperationRegions,
  type ScenarioSeedMapOperationContext
} from "./mapCompiler";

describe("scenario seed map compiler", () => {
  it("builds map shells, random-level metadata, and tilesets around an injected operation painter", () => {
    const contexts: ScenarioSeedMapOperationContext[] = [];
    const result = compileScenarioSeedMaps([{
      key: "depths",
      levelType: "dungeon",
      index: 2,
      landlook: 4,
      isDark: true,
      useLos: true,
      operations: [
        { kind: "namedTile", x: 7, y: 8, name: "grave", region: "marker" },
        { kind: "castleRoom", x: 10, y: 12, width: 8, height: 6, doors: [{ side: "south", offset: 3, region: "exit" }] }
      ]
    }], createScenarioSeedCompilerContext(), {
      applyOperation: (_tiles, _operation, context) => contexts.push(context)
    });

    expect(result.maps[0]).toMatchObject({
      id: "dungeon:2",
      source: "Data DL",
      index: 2,
      name: "Dungeon 2",
      width: 90,
      height: 90,
      render: { tilesetId: "landlook-4", landlook: 4, mode: "dungeon-landlook" }
    });
    expect(result.maps[0].tiles.every((tile) => tile === 40)).toBe(true);
    expect(contexts).toHaveLength(2);
    expect(contexts[0].regions).toEqual(new Map([
      ["marker", { x: 7, y: 8 }],
      ["exit", { x: 13, y: 17 }]
    ]));
    expect(result.randomLevels[0]).toMatchObject({
      id: "dungeon:2:randlevel",
      source: "Data RDD",
      levelIndex: 2,
      landlook: 4,
      isDark: true,
      useLos: true
    });
    expect(result.randomLevels[0].rawValues?.[260]).toBe(1025);
    expect(result.randomLevels[0].rawValues?.[261]).toBe(0x0100);
    expect(result.tilesets[0]).toMatchObject({ id: "landlook-4", landlook: 4, pictId: 304, baseTile: 111 });
  });

  it("resolves anchored named-stamp regions", () => {
    expect(scenarioSeedOperationRegions([{
      kind: "namedStamp",
      x: 10,
      y: 20,
      name: "tall-tree",
      region: "tree-base",
      anchor: "southEast"
    }], 0)).toEqual([{ key: "tree-base", x: 10, y: 21 }]);
  });
});
