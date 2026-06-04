import {
  AtlasEntry,
  MapEntity,
  PaintCellChange,
  SmartBrushMaskCell,
  SmartBrushPlan,
  SmartBrushPreset,
  SmartBrushProfile,
  SmartBrushProfileConfidence,
  SmartBrushRole,
  TilesetAsset
} from "../types";
import { mapTileIndex, tileValueAt } from "./geometry";
import { atlasBaseTile, normalizeAtlasTile, tileIconCandidates } from "./renderValues";
import { clearTileForMap } from "./tileClear";

const STANDARD_LANDLOOKS = [0, 2, 3, 4, 5, 9, 10];
const TILE_SIZE = 32;

const WATER_FAMILY = [
  ...range(1, 60),
  ...range(105, 112)
];
const WATER_EDGE_FAMILY = [
  ...range(1, 32),
  ...range(38, 51)
];
const WATER_BOUNDARY_FAMILY = WATER_EDGE_FAMILY.filter((tile) => tile !== 22);
const MOUNTAIN_LAND_FAMILY = range(61, 85);
const MOUNTAIN_WATER_FAMILY = range(86, 93);
const MOUNTAIN_FAMILY = [...MOUNTAIN_LAND_FAMILY, ...MOUNTAIN_WATER_FAMILY];
const FOREST_FAMILY = range(121, 129);

const BASE_PRESETS: SmartBrushProfile["presets"] = {
  water: {
    family: WATER_FAMILY,
    center: [60, 35, 34, 33],
    candidates: WATER_BOUNDARY_FAMILY,
    roleCandidates: {
      north: WATER_BOUNDARY_FAMILY,
      south: WATER_BOUNDARY_FAMILY,
      east: WATER_BOUNDARY_FAMILY,
      west: WATER_BOUNDARY_FAMILY,
      northEast: WATER_BOUNDARY_FAMILY,
      northWest: WATER_BOUNDARY_FAMILY,
      southEast: WATER_BOUNDARY_FAMILY,
      southWest: WATER_BOUNDARY_FAMILY,
      lineHorizontal: [43, 38, 39, 40, 41],
      lineVertical: [42, 44, 45, 46],
      capNorth: WATER_BOUNDARY_FAMILY,
      capSouth: WATER_BOUNDARY_FAMILY,
      capEast: WATER_BOUNDARY_FAMILY,
      capWest: WATER_BOUNDARY_FAMILY,
      notchNorthEast: WATER_BOUNDARY_FAMILY,
      notchNorthWest: WATER_BOUNDARY_FAMILY,
      notchSouthEast: WATER_BOUNDARY_FAMILY,
      notchSouthWest: WATER_BOUNDARY_FAMILY
    },
    fallbackRoles: {
      center: 60,
      single: 60,
      north: 3,
      south: 31,
      east: 2,
      west: 42,
      northEast: 4,
      northWest: 1,
      southEast: 24,
      southWest: 21,
      lineHorizontal: 43,
      lineVertical: 42,
      capNorth: 4,
      capSouth: 3,
      capEast: 1,
      capWest: 2,
      notchNorthEast: 28,
      notchNorthWest: 27,
      notchSouthEast: 49,
      notchSouthWest: 48
    }
  },
  mountains: {
    family: MOUNTAIN_FAMILY,
    center: [61],
    candidates: MOUNTAIN_FAMILY,
    fallbackRoles: {
      center: 61,
      single: 61,
      north: 83,
      south: 63,
      east: 62,
      west: 80,
      northEast: 84,
      northWest: 81,
      southEast: 64,
      southWest: 72,
      lineHorizontal: 83,
      lineVertical: 62,
      notchNorthEast: 70,
      notchNorthWest: 69,
      notchSouthEast: 73,
      notchSouthWest: 72
    }
  },
  forest: {
    family: FOREST_FAMILY,
    center: [128, 129],
    candidates: FOREST_FAMILY,
    roleCandidates: {
      north: [121, 124, 125, 126],
      south: [122, 123, 127],
      east: [123, 125, 128],
      west: [122, 124, 129],
      northEast: [121, 125, 126],
      northWest: [121, 124, 126],
      southEast: [123, 127, 128],
      southWest: [122, 127, 129],
      lineHorizontal: [128, 129],
      lineVertical: [126, 127],
      capNorth: [126, 124, 125],
      capSouth: [127, 122, 123],
      capEast: [128, 123, 125],
      capWest: [129, 122, 124],
      notchNorthEast: [125, 128],
      notchNorthWest: [124, 129],
      notchSouthEast: [123, 128],
      notchSouthWest: [122, 129]
    },
    fallbackRoles: {
      center: 128,
      single: 121,
      north: 121,
      south: 127,
      east: 122,
      west: 124,
      northEast: 125,
      northWest: 124,
      southEast: 128,
      southWest: 126,
      lineHorizontal: 128,
      lineVertical: 126,
      capNorth: 126,
      capSouth: 127,
      capEast: 128,
      capWest: 129,
      notchNorthEast: 125,
      notchNorthWest: 124,
      notchSouthEast: 123,
      notchSouthWest: 122
    }
  }
};

export const SMART_BRUSH_PRESETS: Array<{ id: SmartBrushPreset; label: string; body: string }> = [
  { id: "mountains", label: "Mountains", body: "Blend mountain terrain into the current landlook." },
  { id: "water", label: "Water", body: "Blend lakes, rivers, and shoreline terrain." },
  { id: "forest", label: "Trees / Forest", body: "Blend contiguous forest and tree cover." }
];

export const SMART_BRUSH_PROFILES: SmartBrushProfile[] = STANDARD_LANDLOOKS.map((landlook) => ({
  landlook,
  presets: BASE_PRESETS
}));

type RegionSignature = Record<SignatureKey, number>;
type SignatureKey = "fill" | "center" | "north" | "south" | "east" | "west" | "northWest" | "northEast" | "southWest" | "southEast";
type TileSignature = RegionSignature & { tile: number };

type ShapeContext = {
  n: boolean;
  s: boolean;
  e: boolean;
  w: boolean;
  ne: boolean;
  nw: boolean;
  se: boolean;
  sw: boolean;
};

const ZERO_SIGNATURE: RegionSignature = {
  fill: 0,
  center: 0,
  north: 0,
  south: 0,
  east: 0,
  west: 0,
  northWest: 0,
  northEast: 0,
  southWest: 0,
  southEast: 0
};

const signatureCache = new WeakMap<HTMLImageElement, Map<string, TileSignature | null>>();

export function smartBrushProfileForTileset(tileset: TilesetAsset | null) {
  const landlook = tileset?.landlook;
  if (landlook == null) return null;
  return SMART_BRUSH_PROFILES.find((profile) => profile.landlook === landlook) ?? null;
}

export function buildSmartTerrainChanges(
  map: MapEntity | null,
  mask: SmartBrushMaskCell[],
  preset: SmartBrushPreset,
  tileset: TilesetAsset | null,
  atlas: AtlasEntry | null = null
): SmartBrushPlan {
  if (!map) return emptyPlan("Select a map.");
  if (map.levelType !== "land") return emptyPlan("Smart terrain is available for land maps only.");
  const profile = smartBrushProfileForTileset(tileset);
  if (!profile) return emptyPlan("The current landlook does not have a smart terrain profile yet.");
  const presetProfile = profile.presets[preset];
  if (!presetProfile) return emptyPlan("The selected smart terrain preset is not available for this landlook.");
  const cells = uniqueMaskCells(mask, map);
  if (cells.length === 0) return emptyPlan("Draw a smart terrain mask on the map.");

  const clearTile = clearTileForMap(map, tileset);
  const maskSet = new Set(cells.map(maskKey));
  const planCells: SmartBrushPlan["cells"] = [];
  const skipped: SmartBrushMaskCell[] = [];
  const confidence = atlas ? "pixel-ranked" : "curated-fallback";

  for (const cell of cells) {
    const from = tileValueAt(map, cell.x, cell.y);
    if (!isSmartTerrainReplaceable(from, preset, profile, clearTile)) {
      skipped.push(cell);
      continue;
    }
    const context = shapeContext(cell, maskSet);
    const role = resolveSmartTerrainRoleFromContext(context);
    const match = resolveSmartTerrainMatch(map, cell, context, preset, profile, tileset, atlas);
    const index = mapTileIndex(map, cell.x, cell.y);
    planCells.push({ ...cell, index, from, to: match.tile, role, score: match.score });
  }

  return {
    cells: planCells,
    skipped,
    changedCount: planCells.filter((cell) => cell.from !== cell.to).length,
    skippedCount: skipped.length,
    profileConfidence: confidence,
    reason: null
  };
}

export function buildSmartTerrainPaintChanges(plan: SmartBrushPlan): PaintCellChange[] {
  return plan.cells
    .filter((cell) => cell.from !== cell.to)
    .map(({ x, y, index, from, to }) => ({ x, y, index, from, to }));
}

export function classifySmartTerrainFamily(tile: number, profile: SmartBrushProfile): SmartBrushPreset | null {
  for (const preset of SMART_BRUSH_PRESETS) {
    if (profile.presets[preset.id].family.includes(tile)) return preset.id;
  }
  return null;
}

export function resolveSmartTerrainTile(
  role: SmartBrushRole,
  profile: SmartBrushProfile,
  preset: SmartBrushPreset
) {
  return tileForSmartRole(profile.presets[preset], role);
}

export function resolveSmartTerrainRole(cell: SmartBrushMaskCell, maskSet: Set<string>): SmartBrushRole {
  return resolveSmartTerrainRoleFromContext(shapeContext(cell, maskSet));
}

function resolveSmartTerrainMatch(
  map: MapEntity,
  cell: SmartBrushMaskCell,
  context: ShapeContext,
  preset: SmartBrushPreset,
  profile: SmartBrushProfile,
  tileset: TilesetAsset | null,
  atlas: AtlasEntry | null
) {
  const presetProfile = profile.presets[preset];
  const role = resolveSmartTerrainRoleFromContext(context);
  const interior = context.n && context.s && context.e && context.w;
  if (interior) {
    const tile = centerTileForCell(presetProfile, map.id, preset, cell);
    return { tile, score: 1 };
  }

  const candidates = smartCandidatesForCell(map, cell, context, role, preset, presetProfile);
  const fallbackTile = tileForSmartRole(presetProfile, role);
  if (!atlas) {
    return { tile: fallbackTile, score: null };
  }

  const desired = desiredSignatureForContext(context);
  const scored = candidates
    .map((tile) => {
      const signature = tileSignatureFor(tile, preset, tileset, atlas);
      return signature ? { tile, score: scoreSignature(signature, desired, role) } : null;
    })
    .filter((entry): entry is { tile: number; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.tile - b.tile);

  if (scored.length === 0) return { tile: fallbackTile, score: null };
  const best = scored[0].score;
  const close = scored.filter((entry) => entry.score >= best - 0.055).slice(0, 4);
  const picked = seededPick(close, map.id, preset, cell, role);
  return picked;
}

function smartCandidatesForCell(
  map: MapEntity,
  cell: SmartBrushMaskCell,
  context: ShapeContext,
  role: SmartBrushRole,
  preset: SmartBrushPreset,
  presetProfile: SmartBrushProfile["presets"][SmartBrushPreset]
) {
  const roleCandidates = presetProfile.roleCandidates?.[role] ?? null;
  const baseCandidates = roleCandidates && roleCandidates.length > 0
    ? roleCandidates
    : preset === "mountains"
    ? touchesOutsideWater(map, cell, context) ? MOUNTAIN_WATER_FAMILY : MOUNTAIN_LAND_FAMILY
    : presetProfile.candidates;
  const boundaryCandidates = baseCandidates.filter((tile) => !presetProfile.center.includes(tile));
  return boundaryCandidates.length > 0 ? boundaryCandidates : baseCandidates;
}

function touchesOutsideWater(map: MapEntity, cell: SmartBrushMaskCell, context: ShapeContext) {
  const checks = [
    !context.n ? [cell.x, cell.y - 1] : null,
    !context.s ? [cell.x, cell.y + 1] : null,
    !context.e ? [cell.x + 1, cell.y] : null,
    !context.w ? [cell.x - 1, cell.y] : null,
    !context.ne ? [cell.x + 1, cell.y - 1] : null,
    !context.nw ? [cell.x - 1, cell.y - 1] : null,
    !context.se ? [cell.x + 1, cell.y + 1] : null,
    !context.sw ? [cell.x - 1, cell.y + 1] : null
  ].filter((value): value is number[] => Boolean(value));
  return checks.some(([x, y]) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
    return WATER_FAMILY.includes(tileValueAt(map, x, y));
  });
}

function tileSignatureFor(tile: number, preset: SmartBrushPreset, tileset: TilesetAsset | null, atlas: AtlasEntry) {
  let atlasMap = signatureCache.get(atlas.image);
  if (!atlasMap) {
    atlasMap = new Map();
    signatureCache.set(atlas.image, atlasMap);
  }
  const key = `${atlas.asset.id}:${tile}:${preset}`;
  if (atlasMap.has(key)) return atlasMap.get(key) ?? null;
  const signature = computeTileSignature(tile, preset, tileset, atlas);
  atlasMap.set(key, signature);
  return signature;
}

function computeTileSignature(tile: number, preset: SmartBrushPreset, tileset: TilesetAsset | null, atlas: AtlasEntry): TileSignature | null {
  const asset = atlas.asset;
  const normalized = normalizeAtlasTile(tile, atlasBaseTile(tileset?.baseTile ?? asset.baseTile, tileset?.custom ?? asset.custom));
  const index = normalized - 1;
  const column = index % asset.columns;
  const row = Math.floor(index / asset.columns);
  if (column < 0 || row < 0 || column >= asset.columns || row >= asset.rows) return null;

  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(
    atlas.image,
    column * asset.tileWidth,
    row * asset.tileHeight,
    asset.tileWidth,
    asset.tileHeight,
    0,
    0,
    TILE_SIZE,
    TILE_SIZE
  );
  const data = context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
  const predicate = terrainPixelPredicate(preset);

  const regions: Record<Exclude<SignatureKey, "fill">, [number, number, number, number]> = {
    center: [8, 8, 16, 16],
    north: [6, 0, 20, 6],
    south: [6, 26, 20, 6],
    east: [26, 6, 6, 20],
    west: [0, 6, 6, 20],
    northWest: [0, 0, 10, 10],
    northEast: [22, 0, 10, 10],
    southWest: [0, 22, 10, 10],
    southEast: [22, 22, 10, 10]
  };
  const out: TileSignature = { ...ZERO_SIGNATURE, tile };
  let total = 0;
  for (let y = 0; y < TILE_SIZE; y += 1) {
    for (let x = 0; x < TILE_SIZE; x += 1) {
      if (predicate(pixelAt(data, x, y))) total += 1;
    }
  }
  out.fill = total / (TILE_SIZE * TILE_SIZE);
  for (const [name, region] of Object.entries(regions) as Array<[Exclude<SignatureKey, "fill">, [number, number, number, number]]>) {
    out[name] = regionFraction(data, region, predicate);
  }
  return out.fill < 0.03 ? null : out;
}

function terrainPixelPredicate(preset: SmartBrushPreset) {
  if (preset === "water") {
    return ([r, g, b]: number[]) => b > 72 && b > r * 1.2 && b > g * 1.02;
  }
  if (preset === "forest") {
    return ([r, g, b]: number[]) => g > 38 && r < 84 && b < 72 && g > r * 1.06;
  }
  return ([r, g, b]: number[]) =>
    (r > 44 && g < 96 && b < 78 && r >= g * 0.72) ||
    (r > 110 && g > 95 && b > 80 && Math.abs(r - g) < 45 && Math.abs(g - b) < 55);
}

function pixelAt(data: Uint8ClampedArray, x: number, y: number) {
  const offset = (y * TILE_SIZE + x) * 4;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

function regionFraction(
  data: Uint8ClampedArray,
  [left, top, width, height]: [number, number, number, number],
  predicate: (pixel: number[]) => boolean
) {
  let total = 0;
  let hits = 0;
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      total += 1;
      if (predicate(pixelAt(data, x, y))) hits += 1;
    }
  }
  return total > 0 ? hits / total : 0;
}

function desiredSignatureForContext(context: ShapeContext): RegionSignature {
  const cardinals = [context.n, context.s, context.e, context.w].filter(Boolean).length;
  const diagonal = [context.ne, context.nw, context.se, context.sw].filter(Boolean).length;
  const boundary = cardinals < 4;
  const boundaryFill = cardinals <= 1
    ? 0.18 + diagonal * 0.015
    : cardinals === 2
      ? 0.31 + diagonal * 0.02
      : 0.44 + diagonal * 0.015;
  return {
    fill: boundary ? boundaryFill : 0.96,
    center: boundary ? cardinals >= 2 ? 0.45 : 0.28 : 0.92,
    north: context.n ? 0.9 : 0.04,
    south: context.s ? 0.9 : 0.04,
    east: context.e ? 0.9 : 0.04,
    west: context.w ? 0.9 : 0.04,
    northWest: context.n && context.w && context.nw ? 0.9 : context.n || context.w ? 0.42 : 0.04,
    northEast: context.n && context.e && context.ne ? 0.9 : context.n || context.e ? 0.42 : 0.04,
    southWest: context.s && context.w && context.sw ? 0.9 : context.s || context.w ? 0.42 : 0.04,
    southEast: context.s && context.e && context.se ? 0.9 : context.s || context.e ? 0.42 : 0.04
  };
}

function scoreSignature(signature: TileSignature, desired: RegionSignature, role: SmartBrushRole) {
  const weights: Record<SignatureKey, number> = {
    fill: 0.8,
    center: 1.4,
    north: 1.2,
    south: 1.2,
    east: 1.2,
    west: 1.2,
    northWest: 0.9,
    northEast: 0.9,
    southWest: 0.9,
    southEast: 0.9
  };
  let error = 0;
  let weightTotal = 0;
  for (const key of Object.keys(weights) as SignatureKey[]) {
    const weight = weights[key];
    const delta = signature[key] - desired[key];
    error += delta * delta * weight;
    weightTotal += weight;
  }
  const base = 1 - Math.sqrt(error / weightTotal);
  return Math.max(0, Math.min(1, base + roleBias(signature, role)));
}

function roleBias(signature: TileSignature, role: SmartBrushRole) {
  if (role === "center") return signature.center > 0.55 ? 0.06 : -0.08;
  if (role === "single") return signature.fill > 0.72 ? -0.08 : 0;
  if (role === "lineHorizontal") return Math.min(signature.east, signature.west) > Math.max(signature.north, signature.south) ? 0.04 : 0;
  if (role === "lineVertical") return Math.min(signature.north, signature.south) > Math.max(signature.east, signature.west) ? 0.04 : 0;
  if (role === "capNorth") return capBias(signature.north, signature.south, signature.east, signature.west);
  if (role === "capSouth") return capBias(signature.south, signature.north, signature.east, signature.west);
  if (role === "capEast") return capBias(signature.east, signature.west, signature.north, signature.south);
  if (role === "capWest") return capBias(signature.west, signature.east, signature.north, signature.south);
  return 0;
}

function capBias(primary: number, opposite: number, sideA: number, sideB: number) {
  if (primary > 0.48 && opposite < 0.42 && sideA < 0.5 && sideB < 0.5) return 0.07;
  if (primary < 0.28) return -0.07;
  return 0;
}

function shapeContext(cell: SmartBrushMaskCell, maskSet: Set<string>): ShapeContext {
  return {
    n: hasMaskCell(maskSet, cell.x, cell.y - 1),
    s: hasMaskCell(maskSet, cell.x, cell.y + 1),
    e: hasMaskCell(maskSet, cell.x + 1, cell.y),
    w: hasMaskCell(maskSet, cell.x - 1, cell.y),
    ne: hasMaskCell(maskSet, cell.x + 1, cell.y - 1),
    nw: hasMaskCell(maskSet, cell.x - 1, cell.y - 1),
    se: hasMaskCell(maskSet, cell.x + 1, cell.y + 1),
    sw: hasMaskCell(maskSet, cell.x - 1, cell.y + 1)
  };
}

function resolveSmartTerrainRoleFromContext(context: ShapeContext): SmartBrushRole {
  const outside = [
    !context.n ? "north" : null,
    !context.s ? "south" : null,
    !context.e ? "east" : null,
    !context.w ? "west" : null
  ].filter(Boolean) as Array<"north" | "south" | "east" | "west">;

  if (outside.length === 0) {
    return "center";
  }
  if (outside.length === 1) return outside[0];
  if (outside.length === 2) {
    if (!context.n && !context.s) return "lineHorizontal";
    if (!context.e && !context.w) return "lineVertical";
    if (!context.n && !context.e) return "northEast";
    if (!context.n && !context.w) return "northWest";
    if (!context.s && !context.e) return "southEast";
    if (!context.s && !context.w) return "southWest";
  }
  if (outside.length === 3) {
    if (context.n) return "capNorth";
    if (context.s) return "capSouth";
    if (context.e) return "capEast";
    if (context.w) return "capWest";
  }
  return "single";
}

function isSmartTerrainReplaceable(tile: number, preset: SmartBrushPreset, profile: SmartBrushProfile, clearTile: number) {
  if (tile === clearTile) return true;
  if (tileIconCandidates(tile).length > 0) return false;
  return classifySmartTerrainFamily(normalizeAtlasTile(tile), profile) === preset;
}

function tileForSmartRole(profile: SmartBrushProfile["presets"][SmartBrushPreset], role: SmartBrushRole) {
  return profile.fallbackRoles[role] ?? profile.center[0] ?? profile.candidates[0] ?? profile.family[0] ?? 1;
}

function centerTileForCell(
  profile: SmartBrushProfile["presets"][SmartBrushPreset],
  mapId: string,
  preset: SmartBrushPreset,
  cell: SmartBrushMaskCell
) {
  if (preset === "forest") {
    const pattern = [
      [128, 129],
      [129, 128]
    ];
    return pattern[Math.abs(cell.y) % 2][Math.abs(cell.x) % 2];
  }
  return seededPick(profile.center, mapId, preset, cell, "center");
}

function seededPick<T>(values: T[], mapId: string, preset: SmartBrushPreset, cell: SmartBrushMaskCell, salt: string): T {
  const unique = Array.from(new Set(values));
  const index = Math.abs(hashString(`${mapId}:${preset}:${cell.x}:${cell.y}:${salt}`)) % Math.max(1, unique.length);
  return unique[index];
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function uniqueMaskCells(mask: SmartBrushMaskCell[], map: MapEntity) {
  const seen = new Set<string>();
  const cells: SmartBrushMaskCell[] = [];
  for (const cell of mask) {
    if (cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height) continue;
    const key = maskKey(cell);
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push(cell);
  }
  return cells.sort((a, b) => a.y - b.y || a.x - b.x);
}

function hasMaskCell(maskSet: Set<string>, x: number, y: number) {
  return maskSet.has(`${x}:${y}`);
}

function maskKey(cell: SmartBrushMaskCell) {
  return `${cell.x}:${cell.y}`;
}

function emptyPlan(reason: string): SmartBrushPlan {
  return {
    cells: [],
    skipped: [],
    changedCount: 0,
    skippedCount: 0,
    profileConfidence: "unsupported",
    reason
  };
}

function range(start: number, end: number) {
  const out: number[] = [];
  for (let value = start; value <= end; value += 1) out.push(value);
  return out;
}
