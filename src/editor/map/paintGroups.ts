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
  { id: "terrain", label: "Terrain", ranges: [[1, 60], [94, 131], [155, 158]], hint: "General land, water, open, and non-mountain terrain tiles." },
  { id: "mountain", label: "Mountains", ranges: [[61, 93]], hint: "Divinity mountain tiles: 61-85 blend mountain into land; 86-93 blend mountain into water." },
  { id: "mountain-land", label: "Mountain / Land", ranges: [[61, 85]], hint: "Mountain-to-land edge and fill tiles 61-85." },
  { id: "mountain-water", label: "Mountain / Water", ranges: [[86, 93]], hint: "Mountain-to-water edge tiles 86-93." },
  { id: "roads", label: "Roads", ranges: [[132, 146]], hint: "Road/path-looking atlas tiles 132-146. These are visual art unless Realmz mapstats also marks them as runtime paths." },
  { id: "trees", label: "Trees / Forest", ranges: [[118, 129], [150, 154]], hint: "Forest and tree-detail tiles." },
  { id: "boats", label: "Boats", ranges: [[147, 147]], hint: "Watercraft tile 147." },
  { id: "open", label: "Open", ranges: [[155, 158]], hint: "Divinity open range tiles 155-158." },
  { id: "rocks", label: "Rocks / Rubble", ranges: [[159, 167]], hint: "Divinity rubble range and adjacent terrain-object tiles." },
  { id: "structures", label: "Structures", ranges: [[113, 114], [170, 186], [190, 200]], hint: "Gates, large building pieces, landmarks, and settlement building tiles." },
  { id: "graves", label: "Graves", ranges: [[187, 189]], hint: "Grave and graveyard tiles." },
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
