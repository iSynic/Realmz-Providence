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
import { GENERATED_SMART_TERRAIN_PROFILES } from "./generatedSmartTerrainProfiles";
import { atlasBaseTile, normalizeAtlasTile, tileIconCandidates } from "./renderValues";
import { clearTileForMap } from "./tileClear";

const TILE_SIZE = 32;

const WATER_FAMILY = [
  ...range(1, 60),
  ...range(105, 112)
];
const MOUNTAIN_LAND_FAMILY = range(61, 85);
const MOUNTAIN_WATER_FAMILY = range(86, 93);
const FOREST_FAMILY = range(121, 129);

export const SMART_BRUSH_PRESETS: Array<{ id: SmartBrushPreset; label: string; body: string }> = [
  { id: "mountains", label: "Mountains", body: "Blend mountain terrain into the current landlook." },
  { id: "water", label: "Water", body: "Blend lakes, rivers, and shoreline terrain." },
  { id: "forest", label: "Trees / Forest", body: "Blend contiguous forest and tree cover." }
];

export const SMART_BRUSH_PROFILES: SmartBrushProfile[] = GENERATED_SMART_TERRAIN_PROFILES;

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
  const confidence = presetProfile.confidence && presetProfile.confidence !== "fallback"
    ? "corpus-ranked"
    : atlas
      ? "pixel-ranked"
      : "curated-fallback";

  for (const cell of cells) {
    const from = tileValueAt(map, cell.x, cell.y);
    if (!isSmartTerrainReplaceable(from, preset, profile, clearTile)) {
      skipped.push(cell);
      continue;
    }
    const context = shapeContext(cell, maskSet);
    const role = resolveSmartTerrainRoleFromContext(context);
    const match = resolveSmartTerrainMatch(map, cell, context, maskSet, preset, profile, tileset, atlas);
    const index = mapTileIndex(map, cell.x, cell.y);
    planCells.push({ ...cell, index, from, to: match.tile, role, score: match.score, neighborMask: match.neighborMask, source: match.source, samples: match.samples });
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
  maskSet: Set<string>,
  preset: SmartBrushPreset,
  profile: SmartBrushProfile,
  tileset: TilesetAsset | null,
  atlas: AtlasEntry | null
) {
  const presetProfile = profile.presets[preset];
  const role = resolveSmartTerrainRoleFromContext(context);
  const neighborMask = smartNeighborMask(context);
  const interiorDistance = distanceToMaskBoundary(cell, maskSet);
  if (interiorDistance >= 2) {
    const tile = centerTileForCell(presetProfile, map.id, preset, cell);
    return { tile, score: 1, neighborMask, source: "center", samples: presetProfile.sampleCount ?? null };
  }

  const candidateEvidence = smartCandidatesForCell(map, cell, context, neighborMask, role, preset, presetProfile);
  const candidates = atlas
    ? broadShapeCandidatesForContext(map, cell, context, preset, presetProfile)
    : candidateEvidence.tiles;
  const fallbackTile = tileForSmartRole(presetProfile, role);
  if (!atlas) {
    const picked = candidates.length > 0
      ? seededPick(candidates, map.id, preset, cell, `${role}:${neighborMask}`)
      : fallbackTile;
    return { tile: picked, score: null, neighborMask, source: candidateEvidence.source, samples: candidateEvidence.samples };
  }

  const desired = desiredSignatureForContext(context);
  const scored = candidates
    .map((tile) => {
      const signature = tileSignatureFor(tile, preset, tileset, atlas);
      return signature ? { tile, score: scoreSignature(signature, desired, role) + corpusCandidateBias(tile, candidateEvidence) } : null;
    })
    .filter((entry): entry is { tile: number; score: number } => Boolean(entry))
    .sort((a, b) => b.score - a.score || a.tile - b.tile);

  if (scored.length === 0) return { tile: fallbackTile, score: null, neighborMask, source: "fallback", samples: candidateEvidence.samples };
  const best = scored[0].score;
  const close = scored.filter((entry) => entry.score >= best - 0.04).slice(0, 4);
  const picked = seededPick(close, map.id, preset, cell, role);
  return { ...picked, neighborMask, source: candidateEvidence.source, samples: candidateEvidence.samples };
}

function smartCandidatesForCell(
  map: MapEntity,
  cell: SmartBrushMaskCell,
  context: ShapeContext,
  neighborMask: number,
  role: SmartBrushRole,
  preset: SmartBrushPreset,
  presetProfile: SmartBrushProfile["presets"][SmartBrushPreset]
) {
  const curatedMaskCandidates = filterCandidatesForContext(presetProfile.curatedMasks?.[String(neighborMask)] ?? [], map, cell, context, preset, presetProfile);
  if (curatedMaskCandidates.length > 0) return { tiles: curatedMaskCandidates, source: "curated-mask", samples: null };
  const curatedRoleTable = preset === "mountains" && touchesOutsideWater(map, cell, context)
    ? presetProfile.curatedWaterRoles
    : presetProfile.curatedRoles;
  const curatedCandidates = filterCandidatesForContext(curatedRoleTable?.[role] ?? [], map, cell, context, preset, presetProfile);
  if (curatedCandidates.length > 0) return { tiles: curatedCandidates, source: "curated-role", samples: null };
  const exactEvidence = presetProfile.maskCandidates?.[String(neighborMask)] ?? null;
  const exactCandidates = filterCandidatesForContext(exactEvidence?.tiles ?? [], map, cell, context, preset, presetProfile);
  const roleCandidates = filterCandidatesForContext(presetProfile.roleCandidates?.[role] ?? [], map, cell, context, preset, presetProfile);
  const combined = uniqueNumbers([...roleCandidates, ...exactCandidates]);
  if (combined.length > 0) return { tiles: combined, source: exactCandidates.length > 0 ? "corpus-mask-prior" : "corpus-role", samples: exactEvidence?.samples ?? null };
  const fallbackCandidates = filterCandidatesForContext(presetProfile.candidates, map, cell, context, preset, presetProfile);
  if (fallbackCandidates.length > 0) return { tiles: fallbackCandidates, source: "corpus-family", samples: null };
  return { tiles: [tileForSmartRole(presetProfile, role)], source: "fallback", samples: null };
}

function broadShapeCandidatesForContext(
  map: MapEntity,
  cell: SmartBrushMaskCell,
  context: ShapeContext,
  preset: SmartBrushPreset,
  presetProfile: SmartBrushProfile["presets"][SmartBrushPreset]
) {
  return filterCandidatesForContext(presetProfile.family, map, cell, context, preset, presetProfile);
}

function corpusCandidateBias(tile: number, evidence: { tiles: number[] }) {
  const index = evidence.tiles.indexOf(tile);
  if (index < 0) return 0;
  return Math.max(0.01, 0.055 - index * 0.008);
}

function filterCandidatesForContext(
  candidates: number[],
  map: MapEntity,
  cell: SmartBrushMaskCell,
  context: ShapeContext,
  preset: SmartBrushPreset,
  presetProfile: SmartBrushProfile["presets"][SmartBrushPreset]
) {
  let out = candidates.filter((tile) => !presetProfile.center.includes(tile));
  if (preset === "mountains") {
    const preferred = touchesOutsideWater(map, cell, context) ? MOUNTAIN_WATER_FAMILY : MOUNTAIN_LAND_FAMILY;
    const narrowed = out.filter((tile) => preferred.includes(tile));
    if (narrowed.length > 0) out = narrowed;
  }
  if (preset === "water" && isNarrowContext(context)) {
    out = out.filter((tile) => tile !== 22);
  }
  if (preset === "forest") {
    out = out.filter((tile) => FOREST_FAMILY.includes(tile));
  }
  return out.length > 0 ? out : candidates;
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
    return ([r, g, b]: number[]) =>
      (g >= 28 && g <= 105 && r <= 80 && b <= 68 && g >= r * 0.85 && g - b >= 8 && (g < 72 || r < 55)) ||
      (r >= 45 && r <= 125 && g >= 25 && g <= 95 && b <= 62 && r > b * 1.2 && g > b * 1.05 && Math.abs(r - g) < 55);
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

function smartNeighborMask(context: ShapeContext) {
  return (context.n ? 1 : 0)
    | (context.e ? 2 : 0)
    | (context.s ? 4 : 0)
    | (context.w ? 8 : 0)
    | (context.ne ? 16 : 0)
    | (context.se ? 32 : 0)
    | (context.sw ? 64 : 0)
    | (context.nw ? 128 : 0);
}

function distanceToMaskBoundary(cell: SmartBrushMaskCell, maskSet: Set<string>) {
  for (let distance = 0; distance <= 4; distance += 1) {
    for (let y = cell.y - distance; y <= cell.y + distance; y += 1) {
      for (let x = cell.x - distance; x <= cell.x + distance; x += 1) {
        if (Math.max(Math.abs(x - cell.x), Math.abs(y - cell.y)) !== distance) continue;
        if (!hasMaskCell(maskSet, x, y)) return distance;
      }
    }
  }
  return 5;
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

function isNarrowContext(context: ShapeContext) {
  const cardinals = [context.n, context.s, context.e, context.w].filter(Boolean).length;
  return cardinals <= 2;
}

function isSmartTerrainReplaceable(tile: number, preset: SmartBrushPreset, profile: SmartBrushProfile, clearTile: number) {
  if (tile === clearTile) return true;
  if (tileIconCandidates(tile).length > 0) return false;
  return tile >= 0;
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
  return profile.center[0] ?? seededPick(profile.center, mapId, preset, cell, "center");
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

function uniqueNumbers(values: number[]) {
  return [...new Set(values)];
}
