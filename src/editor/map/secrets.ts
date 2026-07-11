import { MapEntity } from "../types";
import { actionPointMarkerState, landCellSecretState } from "./actionPointMarkers";

const DUNGEON_SECRET_DIRECTION_MASK = 0x0f00;
const STOCK_HIDDEN_WALKABLE_TILES = new Map<number, ReadonlySet<number>>([
  [0, new Set([169])],
  [4, new Set([96])],
  [9, new Set([169])]
]);
const STOCK_COMBAT_CLEARING_TILES = new Map<number, ReadonlySet<number>>([
  [0, new Set([180, 181, 182, 183, 184, 185])],
  [4, new Set([59, 60, 61, 62, 63, 64, 65])],
  [9, new Set([180, 181, 182, 183, 184, 185])]
]);

export function isSecretWalkableTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value);
  return landCellSecretState(value) !== "normal" && isStockHiddenWalkableTile(value, map.render.landlook);
}

export function isConcealedWalkableTerrain(value: number, map: MapEntity) {
  return !isDungeonTopDownMap(map) && isStockHiddenWalkableTile(value, map.render.landlook);
}

export function isStockHiddenWalkableTile(value: number, landlook: number | null | undefined) {
  return landlook != null && Boolean(STOCK_HIDDEN_WALKABLE_TILES.get(landlook)?.has(normalizedTileBase(value)));
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

export function showsHiddenWalkableOverlay(value: number, map: MapEntity) {
  return isConcealedWalkableTerrain(value, map) || isSecretWalkableTile(value, map);
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
  let out = Math.abs(value);
  while (out > 999) out -= 1000;
  return out;
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
