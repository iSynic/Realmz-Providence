import { IconEntry, TileAttributeFlag, TileAttributeProfile, TilesetAsset } from "../types";
import { LandlookTileVisualCategory, landlookVisualCategoryLabel } from "./landlookTileSemantics";
import { classifyTileValue, standardTileValues, tileAttributeGroup } from "./tileMetadata";

export type LandlookTileGroup = {
  id: string;
  label: string;
  ranges: Array<[number, number]>;
  categories?: LandlookTileVisualCategory[];
  flags?: TileAttributeFlag[];
  hint: string;
};

export const LANDLOOK_TILE_GROUPS: LandlookTileGroup[] = [
  { id: "all", label: "All", ranges: [[1, Number.MAX_SAFE_INTEGER]], hint: "Show every tile in the current landlook." },
  { id: "terrain", label: "Terrain", ranges: [[1, 60], [105, 112], [155, 158]], categories: ["water-shore", "open", "terrain-prop"], hint: "General land, water, open, and non-mountain terrain tiles." },
  { id: "mountain", label: "Mountains", ranges: [[61, 93]], categories: ["mountain-land", "mountain-water"], hint: "Divinity mountain tiles: 61-85 blend mountain into land; 86-93 blend mountain into water." },
  { id: "mountain-land", label: "Mountain / Land", ranges: [[61, 85]], categories: ["mountain-land"], hint: "Mountain-to-land edge and fill tiles 61-85." },
  { id: "mountain-water", label: "Mountain / Water", ranges: [[86, 93]], categories: ["mountain-water"], hint: "Mountain-to-water edge tiles 86-93." },
  { id: "roads", label: "Roads", ranges: [[130, 146]], categories: ["road"], flags: ["path"], hint: "Road/path-looking atlas tiles plus any source-backed runtime path tiles." },
  { id: "trees", label: "Trees / Forest", ranges: [[118, 129], [150, 154]], categories: ["forest", "tree-detail"], flags: ["forest"], hint: "Forest transition tiles and decorative tree-detail tiles." },
  { id: "forest", label: "Forest Fill", ranges: [[118, 129]], categories: ["forest"], flags: ["forest"], hint: "Contiguous forest transition tiles, separate from decorative tree detail." },
  { id: "tree-detail", label: "Tree Detail", ranges: [[150, 154]], categories: ["tree-detail"], hint: "Decorative tree/detail pieces that should not be used as smart-forest fill." },
  { id: "boats", label: "Boats", ranges: [[147, 147]], categories: ["watercraft"], flags: ["boat-required"], hint: "Watercraft and source-backed boat-required movement tiles." },
  { id: "open", label: "Open", ranges: [[155, 158]], categories: ["open"], hint: "Divinity open range tiles 155-158." },
  { id: "rocks", label: "Rocks / Rubble", ranges: [[159, 167]], categories: ["rocks"], hint: "Divinity rubble range and adjacent terrain-object tiles." },
  { id: "structures", label: "Structures", ranges: [[113, 114], [170, 186], [190, 200]], categories: ["buildings"], hint: "Gates, large building pieces, landmarks, and settlement building tiles." },
  { id: "graves", label: "Graves", ranges: [[187, 189]], categories: ["graves"], hint: "Grave and graveyard tiles." },
  { id: "houses", label: "Houses", ranges: [[190, 200]], categories: ["buildings"], hint: "Divinity house range tiles 190-200." }
];

export function landlookGroupById(groupId: string | null | undefined) {
  return LANDLOOK_TILE_GROUPS.find((group) => group.id === groupId) ?? LANDLOOK_TILE_GROUPS[0];
}

export function landlookGroupTiles(
  tileset: TilesetAsset | null,
  groupId: string | null | undefined,
  attributes: TileAttributeProfile[] = [],
  icons?: Record<number, IconEntry>
) {
  const standardTiles = standardTileValues(tileset);
  const group = landlookGroupById(groupId);
  if (group.id === "all") return standardTiles;
  return standardTiles.filter((tile) => landlookGroupIncludesTile(tile, group, tileset, attributes, icons));
}

export function landlookGroupRangeLabel(groupId: string | null | undefined) {
  const group = landlookGroupById(groupId);
  if (group.id === "all") return "all landlook tiles";
  const ranges = group.ranges.map(([from, to]) => `${from}-${to}`).join(", ");
  const categories = group.categories?.map(landlookVisualCategoryLabel).join(", ");
  const flags = group.flags?.map((flag) => flag.replace(/-/g, " ")).join(", ");
  return [ranges, categories, flags].filter(Boolean).join(" | ");
}

export function landlookGroupIncludesTile(
  tile: number,
  group: LandlookTileGroup,
  tileset: TilesetAsset | null,
  attributes: TileAttributeProfile[] = [],
  icons?: Record<number, IconEntry>
) {
  if (group.ranges.some(([from, to]) => tile >= from && tile <= to)) return true;
  const metadata = classifyTileValue(tile, tileset, attributes, icons);
  if (metadata.visual && group.categories?.includes(metadata.visual.category)) return true;
  const flags = tileAttributeGroup(metadata.attributes, tile, tileset);
  return Boolean(group.flags?.some((flag) => flags.includes(flag)));
}
