import { MapEntity, TilesetAsset } from "../types";

const LANDLOOK_CLEAR_TILES: Record<number, number> = {
  0: 156,
  3: 155,
  4: 111,
  5: 191,
  6: 156,
  7: 156,
  8: 156,
  9: 155,
  10: 155
};

export function clearTileForMap(map: MapEntity | null, selectedTileset: TilesetAsset | null) {
  if (map?.levelType === "dungeon" || map?.render.mode === "dungeon-top-down") return 0;
  if (typeof selectedTileset?.baseTile === "number" && selectedTileset.baseTile > 0) return selectedTileset.baseTile;
  const landlook = map?.render.landlook;
  if (typeof landlook === "number" && LANDLOOK_CLEAR_TILES[landlook] != null) return LANDLOOK_CLEAR_TILES[landlook];
  return 1;
}

export function clearTileLabel(map: MapEntity | null, selectedTileset: TilesetAsset | null) {
  const tile = clearTileForMap(map, selectedTileset);
  if (map?.levelType === "dungeon" || map?.render.mode === "dungeon-top-down") return `blank dungeon tile ${tile}`;
  return `clear tile ${tile}`;
}
