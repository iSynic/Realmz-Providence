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

const STANDARD_LANDLOOK_GROUP_OVERRIDES: Record<number, Partial<Record<string, Partial<LandlookTileGroup>>>> = {
  3: {
    terrain: { label: "Cavern Terrain", hint: "Underground water, floor, and cavern terrain slots for the Subterranean atlas." },
    mountain: { label: "Cave Walls", hint: "Wall/rock terrain slots aligned with the Plains mountain families; verify individual cave shapes visually." },
    "mountain-land": { label: "Wall / Floor", hint: "Cave wall-to-floor edge and fill slots." },
    "mountain-water": { label: "Wall / Water", hint: "Cave wall-to-water edge slots." },
    roads: { label: "Paths / Bridges", hint: "Cavern path, bridge, and route art plus source-backed runtime path tiles." },
    trees: { label: "Cave Growth", hint: "Underground growth transition/detail slots where present in this atlas." },
    forest: { label: "Growth Fill", hint: "Contiguous underground growth transition slots." },
    "tree-detail": { label: "Growth Detail", hint: "Decorative underground growth/detail slots." },
    rocks: { label: "Cave Rubble", hint: "Cave rocks, rubble, and terrain-object slots." },
    structures: { label: "Underground Structures", hint: "Doors, gates, built pieces, and underground landmark slots." },
    houses: { label: "Built Pieces", hint: "Structure slots in the settlement/building range." }
  },
  4: {
    terrain: { label: "Castle Terrain", hint: "Moat, floor, courtyard, and non-wall terrain slots for the Castle atlas." },
    mountain: { label: "Masonry Walls", hint: "Castle wall/masonry terrain slots aligned with the mountain families; these are not literal mountains." },
    "mountain-land": { label: "Wall / Floor", hint: "Masonry wall-to-floor edge and fill slots." },
    "mountain-water": { label: "Wall / Moat", hint: "Masonry wall-to-water/moat edge slots." },
    roads: { label: "Roads / Walls", hint: "Castle road, wall, bridge, and route-looking art plus source-backed runtime path tiles." },
    trees: { label: "Courtyard Greenery", hint: "Courtyard vegetation transition/detail slots where present in this atlas." },
    forest: { label: "Greenery Fill", hint: "Contiguous courtyard vegetation transition slots." },
    "tree-detail": { label: "Greenery Detail", hint: "Decorative courtyard vegetation/detail slots." },
    rocks: { label: "Stone Rubble", hint: "Stone rubble and courtyard prop slots." },
    graves: { label: "Tombs / Memorials", hint: "Tomb, memorial, and graveyard slots." },
    structures: { label: "Castle Structures", hint: "Gates, towers, masonry building pieces, and castle landmarks." },
    houses: { label: "Buildings", hint: "Castle building range slots." }
  },
  5: {
    terrain: { label: "Desert Terrain", hint: "Oasis, sand, and desert terrain slots." },
    mountain: { label: "Ridges / Dunes", hint: "Desert ridge, rock, and dune slots aligned with the mountain families." },
    "mountain-land": { label: "Ridge / Sand", hint: "Rock/dune-to-sand edge and fill slots." },
    "mountain-water": { label: "Ridge / Oasis", hint: "Rock/dune-to-water edge slots." },
    roads: { label: "Roads / Trails", hint: "Desert road, trail, bridge, and path-looking art plus runtime path tiles." },
    trees: { label: "Scrub / Palms", hint: "Desert scrub, palm, and vegetation transition/detail slots." },
    forest: { label: "Scrub Fill", hint: "Contiguous desert vegetation transition slots." },
    "tree-detail": { label: "Scrub Detail", hint: "Decorative desert scrub/palm detail slots." },
    rocks: { label: "Desert Rocks", hint: "Desert rocks, rubble, and terrain-object slots." },
    structures: { label: "Desert Structures", hint: "Desert gates, landmarks, buildings, and settlement pieces." },
    houses: { label: "Desert Buildings", hint: "Desert building range slots." }
  },
  9: {
    terrain: { label: "Swamp Terrain", hint: "Swamp water, bog, open ground, and non-bank terrain slots." },
    mountain: { label: "Bog Banks", hint: "Raised bog bank terrain slots aligned with the mountain families." },
    "mountain-land": { label: "Bank / Ground", hint: "Bog bank-to-ground edge and fill slots." },
    "mountain-water": { label: "Bank / Water", hint: "Bog bank-to-water edge slots." },
    roads: { label: "Paths / Bridges", hint: "Swamp path, bridge, and route-looking art plus runtime path tiles." },
    trees: { label: "Swamp Trees", hint: "Swamp tree transition and decorative detail slots." },
    forest: { label: "Swamp Tree Fill", hint: "Contiguous swamp tree transition slots." },
    "tree-detail": { label: "Swamp Tree Detail", hint: "Decorative swamp tree/detail slots." },
    rocks: { label: "Muck / Rubble", hint: "Swamp rocks, muck, and terrain-object slots." },
    structures: { label: "Swamp Structures", hint: "Swamp gates, landmarks, buildings, and settlement pieces." },
    houses: { label: "Swamp Buildings", hint: "Swamp building range slots." }
  },
  10: {
    terrain: { label: "Snow Terrain", hint: "Ice, snow, water, and non-ridge terrain slots." },
    mountain: { label: "Snowy Ridges", hint: "Snow ridge and icy mountain slots aligned with the mountain families." },
    "mountain-land": { label: "Ridge / Snow", hint: "Snowy ridge-to-snow edge and fill slots." },
    "mountain-water": { label: "Ridge / Water", hint: "Snowy ridge-to-water edge slots." },
    roads: { label: "Roads / Snow Trails", hint: "Snow road, trail, bridge, and path-looking art plus runtime path tiles." },
    trees: { label: "Snow Forest", hint: "Snow forest transition and decorative detail slots." },
    forest: { label: "Snow Forest Fill", hint: "Contiguous snow forest transition slots." },
    "tree-detail": { label: "Snow Tree Detail", hint: "Decorative snow tree/detail slots." },
    rocks: { label: "Snow Rocks", hint: "Snow rocks, rubble, and terrain-object slots." },
    structures: { label: "Snow Structures", hint: "Snow gates, landmarks, buildings, and settlement pieces." },
    houses: { label: "Snow Buildings", hint: "Snow building range slots." }
  }
};

export function landlookTileGroups(tileset?: TilesetAsset | null) {
  const landlook = tileset?.landlook ?? 0;
  const overrides = STANDARD_LANDLOOK_GROUP_OVERRIDES[landlook] ?? (tileset?.custom ? customLandlookGroupOverrides(tileset) : null);
  if (!overrides) return LANDLOOK_TILE_GROUPS;
  return LANDLOOK_TILE_GROUPS.map((group) => ({ ...group, ...overrides[group.id] }));
}

export function landlookGroupById(groupId: string | null | undefined, tileset?: TilesetAsset | null) {
  const groups = landlookTileGroups(tileset);
  return groups.find((group) => group.id === groupId) ?? groups[0];
}

export function landlookGroupTiles(
  tileset: TilesetAsset | null,
  groupId: string | null | undefined,
  attributes: TileAttributeProfile[] = [],
  icons?: Record<number, IconEntry>
) {
  const standardTiles = standardTileValues(tileset);
  const group = landlookGroupById(groupId, tileset);
  if (group.id === "all") return standardTiles;
  return standardTiles.filter((tile) => landlookGroupIncludesTile(tile, group, tileset, attributes, icons));
}

export function landlookGroupRangeLabel(groupId: string | null | undefined, tileset?: TilesetAsset | null) {
  const group = landlookGroupById(groupId, tileset);
  if (group.id === "all") return "all landlook tiles";
  const ranges = group.ranges.map(([from, to]) => `${from}-${to}`).join(", ");
  const categories = group.categories?.map((category) => landlookVisualCategoryLabel(category, tileset?.landlook ?? null)).join(", ");
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

function customLandlookGroupOverrides(tileset: TilesetAsset): Partial<Record<string, Partial<LandlookTileGroup>>> {
  return {
    terrain: { label: "Custom Terrain", hint: `Custom atlas ${tileset.name}: terrain slots are range-based until this custom landlook is labeled.` },
    mountain: { label: "Custom Terrain 61-93", hint: "Custom atlas slots 61-93. Verify visually; these may not be mountains." },
    "mountain-land": { label: "Custom 61-85", hint: "Custom atlas slots 61-85. Verify visually before treating them as terrain edges." },
    "mountain-water": { label: "Custom 86-93", hint: "Custom atlas slots 86-93. Verify visually before treating them as water edges." },
    roads: { label: "Custom Roads / Path", hint: "Custom atlas road/path-looking slots plus source-backed runtime path tiles." },
    trees: { label: "Custom Vegetation", hint: "Custom atlas vegetation/detail slots by conventional range; verify visually." },
    forest: { label: "Custom Vegetation Fill", hint: "Custom atlas slots 118-129 by conventional range; verify visually." },
    "tree-detail": { label: "Custom Detail", hint: "Custom atlas slots 150-154 by conventional range; verify visually." },
    rocks: { label: "Custom Rocks / Props", hint: "Custom atlas slots 159-167 by conventional range; verify visually." },
    structures: { label: "Custom Structures", hint: "Custom atlas structure ranges plus scenario special/icon structure tiles." },
    houses: { label: "Custom Buildings", hint: "Custom atlas slots 190-200 by conventional range; verify visually." }
  };
}
