import { MapEntity, TileAttributeProfile } from "../types";
import { actionPointMarkerState, landCellSecretState } from "./actionPointMarkers";

const DUNGEON_SECRET_DIRECTION_MASK = 0x0f00;
const STOCK_HIDDEN_WALKABLE_TILES = new Map<number, ReadonlySet<number>>([
  [0, new Set([169])],
  [3, new Set([169])],
  [4, new Set([96])],
  [5, new Set([169, 184])],
  [9, new Set([169])],
  [10, new Set([169])]
]);
const STOCK_COMBAT_CLEARING_TILES = new Map<number, ReadonlySet<number>>([
  [0, new Set([180, 181, 182, 183, 184, 185])],
  [4, new Set([59, 60, 61, 62, 63, 64, 65])],
  [5, new Set([180, 181, 182, 183, 185])],
  [9, new Set([180, 181, 182, 183, 184, 185])],
  [10, new Set([180, 181, 182, 183, 184, 185])]
]);
const hiddenWalkableMetadataCache = new WeakMap<readonly TileAttributeProfile[], Map<number, Map<number, boolean>>>();

export function isSecretWalkableTile(value: number, map: MapEntity, attributes: readonly TileAttributeProfile[] = []) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value);
  return landCellSecretState(value) !== "normal" && isConcealedWalkableTerrain(value, map, attributes);
}

export function isConcealedWalkableTerrain(value: number, map: MapEntity, attributes: readonly TileAttributeProfile[] = []) {
  if (isDungeonTopDownMap(map) || value <= 0) return false;
  const landlook = map.render.landlook;
  const metadata = landlook != null ? hiddenWalkableMetadata(attributes).get(landlook)?.get(normalizedTileBase(value)) : undefined;
  return metadata ?? isStockHiddenWalkableTile(value, landlook);
}

export function isStockHiddenWalkableTile(value: number, landlook: number | null | undefined) {
  return value > 0 && landlook != null && Boolean(STOCK_HIDDEN_WALKABLE_TILES.get(landlook)?.has(normalizedTileBase(value)));
}

export function defaultStockHiddenWalkableTile(landlook: number | null | undefined) {
  const tiles = landlook != null ? STOCK_HIDDEN_WALKABLE_TILES.get(landlook) : null;
  return tiles ? [...tiles][0] ?? null : null;
}

export function isStockCombatClearingTile(value: number, landlook: number | null | undefined) {
  return landlook != null && Boolean(STOCK_COMBAT_CLEARING_TILES.get(landlook)?.has(normalizedTileBase(value)));
}

export function isCombatClearingTerrain(value: number, map: MapEntity) {
  return !isDungeonTopDownMap(map) && isStockCombatClearingTile(value, map.render.landlook);
}

export function defaultStockCombatClearingTile(landlook: number | null | undefined) {
  const tiles = landlook != null ? STOCK_COMBAT_CLEARING_TILES.get(landlook) : null;
  return tiles ? [...tiles][0] ?? null : null;
}

export function showsHiddenWalkableOverlay(value: number, map: MapEntity, attributes: readonly TileAttributeProfile[] = []) {
  return isDungeonTopDownMap(map) ? isSecretWalkableTile(value, map, attributes) : isConcealedWalkableTerrain(value, map, attributes);
}

export function showsCombatClearingOverlay(value: number, map: MapEntity) {
  return isCombatClearingTerrain(value, map);
}

export function hasSecretMarkerTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value) || hasDungeonShownSecretMarker(value);
  return actionPointMarkerState(value, "land") === "secret";
}

export function hasSecretPathTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value);
  return actionPointMarkerState(value, "land") !== "none";
}

function isDungeonTopDownMap(map: MapEntity) {
  return map.levelType === "dungeon" || map.render.mode === "dungeon-top-down";
}

function normalizedTileBase(value: number) {
  let out = value > 0 ? value & ~0x6000 : Math.abs(value);
  while (out > 999) out -= 1000;
  return out;
}

function hiddenWalkableMetadata(attributes: readonly TileAttributeProfile[]) {
  const cached = hiddenWalkableMetadataCache.get(attributes);
  if (cached) return cached;
  const landlooks = new Map<number, Map<number, boolean>>();
  // Realmz marks a traversable path when mapstats.ispath is set and solid is zero.
  for (const profile of attributes) {
    if (profile.landlook == null || profile.sourceKind === "data-solids" || profile.source === "Data Solids") continue;
    let tiles = landlooks.get(profile.landlook);
    if (!tiles) {
      tiles = new Map();
      landlooks.set(profile.landlook, tiles);
    }
    const path = profile.pathFlag ?? profile.flags.includes("path");
    const walkable = profile.solidType != null ? profile.solidType === 0 : profile.flags.includes("walkable");
    tiles.set(profile.tile, path && walkable);
  }
  hiddenWalkableMetadataCache.set(attributes, landlooks);
  return landlooks;
}

function hasDungeonSecretDirection(value: number) {
  return Boolean((value & 0xffff) & DUNGEON_SECRET_DIRECTION_MASK);
}

function hasDungeonShownSecretMarker(value: number) {
  return dungeonFieldHasBit(value, 9);
}

function dungeonFieldHasBit(value: number, bit: number) {
  return Boolean((value & 0xffff) & (1 << (15 - bit)));
}
