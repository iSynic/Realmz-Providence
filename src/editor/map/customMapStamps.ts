import { CustomMapStamp, MapEntity, MapRegionSelection, TilesetAsset } from "../types";
import { mapTileIndex } from "./geometry";
import { clearTileForMap } from "./tileClear";

export const GLOBAL_MAP_STAMPS_STORAGE_KEY = "providence.mapStamps.global.v1";

export function readGlobalMapStamps(): CustomMapStamp[] {
  try {
    const raw = localStorage.getItem(GLOBAL_MAP_STAMPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeMapStamps(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function writeGlobalMapStamps(stamps: CustomMapStamp[]) {
  localStorage.setItem(GLOBAL_MAP_STAMPS_STORAGE_KEY, JSON.stringify(normalizeMapStamps(stamps)));
}

export function captureMapStampFromRegion(
  map: MapEntity,
  region: MapRegionSelection,
  tileset: TilesetAsset | null,
  name: string,
  id = createMapStampId(name)
): CustomMapStamp | null {
  const left = Math.max(0, Math.min(region.left, region.right));
  const right = Math.min(map.width - 1, Math.max(region.left, region.right));
  const top = Math.max(0, Math.min(region.top, region.bottom));
  const bottom = Math.min(map.height - 1, Math.max(region.top, region.bottom));
  const width = right - left + 1;
  const height = bottom - top + 1;
  const clearTile = clearTileForMap(map, tileset);
  const cells: CustomMapStamp["cells"] = [];
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const tile = map.tiles[mapTileIndex(map, x, y)];
      if (tile === clearTile) continue;
      cells.push({ x: x - left, y: y - top, tile });
    }
  }
  if (cells.length === 0) return null;
  const now = new Date().toISOString();
  return { id, name: normalizeStampName(name, 1), width, height, cells, createdAt: now, updatedAt: now };
}

export function normalizeMapStamps(stamps: CustomMapStamp[]) {
  const used = new Set<string>();
  return stamps.map((stamp, index) => {
    const name = normalizeStampName(stamp.name, index + 1);
    const id = uniqueStampId(used, stamp.id || createMapStampId(name));
    const width = normalizeDimension(stamp.width);
    const height = normalizeDimension(stamp.height);
    return {
      ...stamp,
      id,
      name,
      width,
      height,
      cells: normalizeCells(stamp.cells ?? [], width, height),
      createdAt: stamp.createdAt || new Date(0).toISOString(),
      updatedAt: stamp.updatedAt || stamp.createdAt || new Date(0).toISOString()
    };
  });
}

export function createMapStampId(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `map-stamp:${slug || "stamp"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeStampName(name: string, index: number) {
  const trimmed = name.trim();
  return trimmed || `Stamp ${index}`;
}

function normalizeCells(cells: CustomMapStamp["cells"], width: number, height: number) {
  const out: CustomMapStamp["cells"] = [];
  const seen = new Set<string>();
  for (const cell of cells) {
    const x = normalizeInt(cell.x);
    const y = normalizeInt(cell.y);
    const tile = normalizeInt(cell.tile);
    if (x == null || y == null || tile == null || x < 0 || y < 0 || x >= width || y >= height) continue;
    const key = `${x}:${y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x, y, tile });
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

function uniqueStampId(used: Set<string>, preferred: string) {
  const base = preferred.trim() || "map-stamp:stamp";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function normalizeDimension(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(32, Math.trunc(value)));
}

function normalizeInt(value: number) {
  if (!Number.isFinite(value)) return null;
  return Math.trunc(value);
}
