import { describe, expect, it } from "vitest";
import type { MapEntity, MapRegionSelection } from "../../types";
import { DUNGEON_CLEAR_TO_WALL_FLAGS } from "../../map/dungeonCellFlags";
import { buildMapClearCommand } from "./useMapSelectionShortcuts";

const landMap = map("land:0", "land", [5, 6, 7, 8]);
const dungeonMap = map("dungeon:0", "dungeon", [10, 11, 12, 13]);

describe("map selection clear commands", () => {
  it("clears a selected land cell with the map clear tile", () => {
    expect(buildMapClearCommand(landMap, null, null, { x: 1, y: 0, tile: 7 })).toEqual({
      kind: "paintTiles",
      label: "Clear selected tile",
      mapId: "land:0",
      cells: [{ x: 1, y: 0, index: 2, from: 7, to: 1 }]
    });
  });

  it("clears a dungeon region back to managed wall flags", () => {
    const region: MapRegionSelection = { left: 0, top: 0, right: 1, bottom: 0 };
    expect(buildMapClearCommand(dungeonMap, null, region, null)).toEqual({
      kind: "updateDungeonCellFlags",
      label: "Clear selected dungeon region",
      mapId: "dungeon:0",
      flags: DUNGEON_CLEAR_TO_WALL_FLAGS,
      cells: [
        { x: 0, y: 0, index: 0, from: 10 },
        { x: 1, y: 0, index: 1, from: 11 }
      ]
    });
  });

  it("does nothing without a map selection", () => {
    expect(buildMapClearCommand(landMap, null, null, null)).toBeNull();
    expect(buildMapClearCommand(null, null, null, { x: 0, y: 0, tile: 5 })).toBeNull();
  });
});

function map(id: string, levelType: "land" | "dungeon", tiles: number[]): MapEntity {
  return {
    id,
    levelType,
    index: 0,
    name: id,
    source: levelType === "land" ? "Data LD" : "Data DL",
    width: 2,
    height: 2,
    tiles,
    render: {
      tilesetId: `${levelType}-0`,
      landlook: levelType === "land" ? 99 : null,
      mode: levelType === "land" ? "outdoor-landlook" : "dungeon-top-down"
    },
    provenance: { sourceFile: "fixture", recordIndex: 0, byteOffset: 0, byteLength: 8, confidence: "fixture-backed" }
  };
}
