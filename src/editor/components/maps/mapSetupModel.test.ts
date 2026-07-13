import { describe, expect, it } from "vitest";
import type { MapEntity, TilesetAsset } from "../../types";
import { buildClearLevelCommand, buildDungeonMappingCommand } from "./mapSetupModel";

function map(levelType: MapEntity["levelType"], tiles: number[]) {
  return {
    id: `${levelType}:2`,
    levelType,
    index: 2,
    width: 2,
    height: 2,
    tiles,
    render: levelType === "land"
      ? { mode: "landlook", landlook: 0, tilesetId: "plains" }
      : { mode: "dungeon-top-down", tilesetId: "dungeon" }
  } as MapEntity;
}

describe("map setup commands", () => {
  it("clears every cell using the selected landlook base tile", () => {
    const command = buildClearLevelCommand(map("land", [4, 5, 6, 7]), { baseTile: 156 } as TilesetAsset);

    expect(command).toEqual({
      kind: "paintTiles",
      label: "Clear level",
      mapId: "land:2",
      cells: [
        { index: 0, x: 0, y: 0, from: 4, to: 156 },
        { index: 1, x: 1, y: 0, from: 5, to: 156 },
        { index: 2, x: 0, y: 1, from: 6, to: 156 },
        { index: 3, x: 1, y: 1, from: 7, to: 156 }
      ]
    });
  });

  it("builds whole-dungeon mapping changes and rejects land maps", () => {
    const dungeon = map("dungeon", [9, 10]);

    expect(buildDungeonMappingCommand(dungeon, true)).toEqual({
      kind: "updateDungeonCellFlags",
      label: "Unmap entire dungeon",
      mapId: "dungeon:2",
      flags: { unmapped: true },
      cells: [
        { index: 0, x: 0, y: 0, from: 9 },
        { index: 1, x: 1, y: 0, from: 10 }
      ]
    });
    expect(buildDungeonMappingCommand(map("land", [1]), false)).toBeNull();
  });
});
