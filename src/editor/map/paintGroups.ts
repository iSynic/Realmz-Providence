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

const allGroup = (label = "All"): LandlookTileGroup => ({
  id: "all",
  label,
  ranges: [[1, Number.MAX_SAFE_INTEGER]],
  hint: "Show every tile in the current landlook."
});

const PLAINS_GROUPS: LandlookTileGroup[] = [
  allGroup(),
  { id: "terrain", label: "Land & Water", ranges: [[1, 60], [105, 117], [147, 158]], hint: "Shorelines, streams, open ground, water, caves, bridges, boats, and general terrain." },
  { id: "barriers", label: "Mountains & Ridges", ranges: [[61, 104]], hint: "Mountain edges, fills, mountain-to-water transitions, and cave approaches." },
  { id: "routes", label: "Roads & Routes", ranges: [[113, 117], [130, 147]], flags: ["path", "boat-required"], hint: "Gates, roads, crossings, bridges, and watercraft." },
  { id: "vegetation", label: "Trees & Vegetation", ranges: [[118, 129], [149, 154]], flags: ["forest"], hint: "Forest transitions, individual trees, and vegetation details." },
  { id: "structures", label: "Structures & Settlements", ranges: [[168, 200]], categories: ["buildings", "graves"], hint: "Walls, landmarks, graveyards, houses, settlements, and icon-backed structures." },
  { id: "props", label: "Props & Special", ranges: [[33, 35], [52, 59], [148, 148], [155, 169], [180, 189]], hint: "Decorative terrain, rocks, objects, hidden terrain, and combat-clearing pieces." }
];

const SUBTERRANEAN_GROUPS: LandlookTileGroup[] = [
  allGroup(),
  { id: "terrain", label: "Cavern Floor & Water", ranges: [[1, 60], [105, 117], [147, 158]], hint: "Cavern shorelines, streams, floor, water, crossings, and open terrain." },
  { id: "barriers", label: "Cave Walls & Ridges", ranges: [[61, 104]], hint: "Cave wall edges, fills, wall-to-water transitions, and cave entrances." },
  { id: "routes", label: "Paths & Bridges", ranges: [[113, 117], [130, 147]], flags: ["path", "boat-required"], hint: "Underground gates, paths, crossings, bridges, and watercraft." },
  { id: "vegetation", label: "Cave Growth", ranges: [[118, 129], [149, 154]], flags: ["forest"], hint: "Contiguous cave growth and decorative underground vegetation." },
  { id: "structures", label: "Underground Structures", ranges: [[168, 200]], categories: ["buildings", "graves"], hint: "Built passages, landmarks, tombs, settlements, and icon-backed structures." },
  { id: "props", label: "Rubble & Special", ranges: [[33, 35], [52, 59], [148, 148], [155, 169], [180, 189]], hint: "Cavern objects, rubble, hidden terrain, and combat-clearing pieces." }
];

const CASTLE_GROUPS: LandlookTileGroup[] = [
  allGroup(),
  { id: "terrain", label: "Floors & Terrain", ranges: [[68, 73], [78, 117], [155, 155], [181, 184]], hint: "Stone, cobblestone, rugs, liquids, platforms, and other floor terrain." },
  { id: "barriers", label: "Walls & Passages", ranges: [[1, 67], [74, 77], [96, 96], [187, 198]], flags: ["blocks-los"], hint: "Gray masonry, thick walls, doors, portcullises, tunnels, and hidden-walkable wall pieces." },
  { id: "routes", label: "Doors, Stairs & Routes", ranges: [[50, 50], [58, 58], [69, 69], [74, 77], [91, 96], [134, 135], [187, 198]], hint: "Entrances, stairs, hatches, passages, doors, ladders, and route transitions." },
  { id: "structures", label: "Structures & Tombs", ranges: [[41, 58], [74, 77], [91, 96], [118, 119], [134, 135], [141, 144], [149, 154], [167, 200]], hint: "Architectural features, machines, columns, tombs, doors, monuments, and icon-backed structures." },
  { id: "props", label: "Furnishings & Props", ranges: [[97, 140], [144, 180], [199, 200]], hint: "Floor details, furniture, storage, equipment, statues, beds, tables, and paired decorative objects." },
  { id: "special", label: "Hazards & Special", ranges: [[54, 57], [68, 73], [91, 96], [112, 120], [168, 168], [181, 184]], hint: "Pits, lava, acid, magic, traps, hidden terrain, combat-clearing walls, and unusual effects." }
];

const DESERT_GROUPS: LandlookTileGroup[] = [
  allGroup(),
  { id: "terrain", label: "Sand & Water", ranges: [[1, 60], [105, 117], [155, 167], [191, 200]], hint: "Shorelines, streams, oasis water, sand, open ground, and general desert terrain." },
  { id: "barriers", label: "Ridges & Briars", ranges: [[61, 114], [168, 169], [180, 185]], hint: "Rock ridges, ridge-to-water transitions, caves, briar walls, and concealed or combat-clearing barriers." },
  { id: "routes", label: "Roads & Trails", ranges: [[113, 117], [130, 147], [169, 169], [184, 185]], flags: ["path", "boat-required"], hint: "Gates, desert roads, trails, crossings, bridges, and watercraft." },
  { id: "vegetation", label: "Palms & Vegetation", ranges: [[118, 129], [148, 160], [186, 190]], flags: ["forest"], hint: "Palm groves, individual vegetation, cactus, and desert plant details." },
  { id: "structures", label: "Oases & Settlements", ranges: [[168, 179], [186, 200]], categories: ["buildings", "graves"], hint: "Oases, landmarks, huts, settlements, graves, and icon-backed structures." },
  { id: "props", label: "Props & Special", ranges: [[33, 35], [52, 59], [147, 167], [180, 200]], hint: "Rocks, desert details, objects, hidden terrain, combat-clearing pieces, and unusual features." }
];

const SWAMP_GROUPS: LandlookTileGroup[] = [
  allGroup(),
  { id: "terrain", label: "Bog & Water", ranges: [[1, 60], [105, 117], [155, 167]], hint: "Swamp shorelines, channels, open bog, water, crossings, and general ground." },
  { id: "barriers", label: "Banks & Caves", ranges: [[61, 114], [168, 169], [180, 185]], hint: "Bog banks, bank-to-water transitions, cave approaches, concealed terrain, and combat-clearing barriers." },
  { id: "routes", label: "Paths & Bridges", ranges: [[113, 117], [130, 147], [169, 169]], flags: ["path", "boat-required"], hint: "Swamp paths, gates, crossings, bridges, and watercraft." },
  { id: "vegetation", label: "Trees & Swamp Growth", ranges: [[118, 129], [148, 167]], flags: ["forest"], hint: "Tree groves, individual trees, pools, rocks, and swamp-specific vegetation." },
  { id: "structures", label: "Huts & Settlements", ranges: [[168, 179], [187, 200]], categories: ["buildings", "graves"], hint: "Huts, tents, tree dwellings, graves, settlements, and icon-backed structures." },
  { id: "props", label: "Props & Special", ranges: [[33, 37], [52, 59], [148, 169], [180, 189]], hint: "Coffins, decorative bog terrain, objects, hidden terrain, and combat-clearing pieces." }
];

const SNOW_GROUPS: LandlookTileGroup[] = [
  allGroup(),
  { id: "terrain", label: "Snow, Ice & Water", ranges: [[1, 60], [105, 117], [155, 160]], hint: "Snowy shorelines, streams, ice, open snow, crossings, and decorative ground." },
  { id: "barriers", label: "Snowy Ridges & Caves", ranges: [[61, 114], [168, 169], [180, 185]], hint: "Snowy ridges, ridge-to-water transitions, caves, concealed terrain, and combat-clearing walls." },
  { id: "routes", label: "Roads & Snow Trails", ranges: [[113, 117], [130, 147], [169, 169]], flags: ["path", "boat-required"], hint: "Snow roads, trails, gates, crossings, bridges, and watercraft." },
  { id: "vegetation", label: "Snow Forest & Growth", ranges: [[118, 129], [148, 167]], flags: ["forest"], hint: "Snow forest transitions, individual trees, icy rocks, and winter vegetation." },
  { id: "structures", label: "Winter Settlements", ranges: [[168, 179], [186, 200]], categories: ["buildings", "graves"], hint: "Winter landmarks, settlements, graves, buildings, and icon-backed structures." },
  { id: "props", label: "Props & Special", ranges: [[33, 35], [52, 59], [148, 169], [180, 189]], hint: "Decorative snow, rocks, objects, hidden terrain, and combat-clearing pieces." }
];

const STOCK_LANDLOOK_GROUPS: Record<number, LandlookTileGroup[]> = {
  0: PLAINS_GROUPS,
  2: PLAINS_GROUPS,
  3: SUBTERRANEAN_GROUPS,
  4: CASTLE_GROUPS,
  5: DESERT_GROUPS,
  9: SWAMP_GROUPS,
  10: SNOW_GROUPS
};

export const LANDLOOK_TILE_GROUPS = PLAINS_GROUPS;

export function landlookTileGroups(tileset?: TilesetAsset | null) {
  const landlook = tileset?.landlook ?? 0;
  return STOCK_LANDLOOK_GROUPS[landlook] ?? customLandlookGroups(tileset);
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

function customLandlookGroups(tileset?: TilesetAsset | null): LandlookTileGroup[] {
  const name = tileset?.name ?? "Custom landlook";
  return [
    allGroup(),
    { id: "terrain", label: "Terrain & Water", ranges: [[1, 60], [105, 117], [155, 158]], hint: `${name}: conventional terrain ranges; verify custom art visually.` },
    { id: "barriers", label: "Walls & Barriers", ranges: [[61, 104]], hint: `${name}: conventional barrier ranges; verify custom art visually.` },
    { id: "routes", label: "Routes & Crossings", ranges: [[113, 117], [130, 147]], flags: ["path", "boat-required"], hint: `${name}: conventional route ranges plus source-backed path and boat behavior.` },
    { id: "vegetation", label: "Vegetation", ranges: [[118, 129], [149, 154]], flags: ["forest"], hint: `${name}: conventional vegetation ranges plus source-backed forest behavior.` },
    { id: "structures", label: "Structures", ranges: [[168, 200]], categories: ["buildings", "graves"], hint: `${name}: conventional structure ranges plus icon-backed structures.` },
    { id: "props", label: "Props & Special", ranges: [[148, 167], [180, 189]], hint: `${name}: conventional prop and special ranges; verify custom art visually.` }
  ];
}
