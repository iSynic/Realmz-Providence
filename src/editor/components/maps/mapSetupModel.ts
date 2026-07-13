import { clearTileForMap } from "../../map/tileClear";
import type { MapEntity, ProjectCommand, TilesetAsset } from "../../types";

export function buildClearLevelCommand(map: MapEntity, selectedTileset: TilesetAsset | null): ProjectCommand {
  const fillTile = clearTileForMap(map, selectedTileset);
  return {
    kind: "paintTiles",
    label: "Clear level",
    mapId: map.id,
    cells: map.tiles.map((from, index) => ({
      index,
      x: index % map.width,
      y: Math.floor(index / map.width),
      from,
      to: fillTile
    }))
  };
}

export function buildDungeonMappingCommand(map: MapEntity, unmapped: boolean): ProjectCommand | null {
  if (map.levelType !== "dungeon") return null;
  return {
    kind: "updateDungeonCellFlags",
    label: unmapped ? "Unmap entire dungeon" : "Map entire dungeon",
    mapId: map.id,
    flags: { unmapped },
    cells: map.tiles.map((from, index) => ({
      index,
      x: index % map.width,
      y: Math.floor(index / map.width),
      from
    }))
  };
}
