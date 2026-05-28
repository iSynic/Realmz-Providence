import { TilesetAsset } from "../types";
import { standardTileValues } from "./tileMetadata";

export type LandlookTileGroup = {
  id: string;
  label: string;
  ranges: Array<[number, number]>;
  hint: string;
};

export const LANDLOOK_TILE_GROUPS: LandlookTileGroup[] = [
  { id: "all", label: "All", ranges: [[1, Number.MAX_SAFE_INTEGER]], hint: "Show every tile in the current landlook." },
  { id: "terrain", label: "Terrain", ranges: [[1, 61], [86, 131]], hint: "General land and water terrain tiles." },
  { id: "mountain", label: "Mountains", ranges: [[62, 85]], hint: "Divinity mountain range tiles 62-85." },
  { id: "roads", label: "Roads", ranges: [[132, 146]], hint: "Road/path-looking atlas tiles 132-146. These are visual art unless Realmz mapstats also marks them as runtime paths." },
  { id: "trees", label: "Trees / Landmarks", ranges: [[147, 154], [159, 165]], hint: "Adjacent decorative tree, landmark, grave, and terrain-object tiles near the end of the landlook." },
  { id: "open", label: "Open", ranges: [[155, 158]], hint: "Divinity open range tiles 155-158." },
  { id: "rocks", label: "Rocks / Graves", ranges: [[161, 189]], hint: "Decorative rock, grave, rubble, and map-object tiles before the house range." },
  { id: "houses", label: "Houses", ranges: [[190, 200]], hint: "Divinity house range tiles 190-200." }
];

export function landlookGroupById(groupId: string | null | undefined) {
  return LANDLOOK_TILE_GROUPS.find((group) => group.id === groupId) ?? LANDLOOK_TILE_GROUPS[0];
}

export function landlookGroupTiles(tileset: TilesetAsset | null, groupId: string | null | undefined) {
  const standardTiles = standardTileValues(tileset);
  const group = landlookGroupById(groupId);
  if (group.id === "all") return standardTiles;
  return standardTiles.filter((tile) => group.ranges.some(([from, to]) => tile >= from && tile <= to));
}

export function landlookGroupRangeLabel(groupId: string | null | undefined) {
  const group = landlookGroupById(groupId);
  if (group.id === "all") return "all landlook tiles";
  return group.ranges.map(([from, to]) => `${from}-${to}`).join(", ");
}
