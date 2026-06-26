import { MapEntity } from "../types";

const DUNGEON_SECRET_DIRECTION_MASK = 0x0f00;
const LAND_SECRET_MARKER_MIN = 2000;
const LAND_SECRET_MARKER_MAX = 2999;

export function isSecretWalkableTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value);
  return hasLandPathMarker(value);
}

export function hasSecretMarkerTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value) || hasDungeonShownSecretMarker(value);
  const normalized = clearLandMarkerBits(value);
  return normalized >= LAND_SECRET_MARKER_MIN && normalized <= LAND_SECRET_MARKER_MAX;
}

export function hasSecretPathTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value);
  return hasLandPathMarker(value);
}

function isDungeonTopDownMap(map: MapEntity) {
  return map.levelType === "dungeon" || map.render.mode === "dungeon-top-down";
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

function hasLandPathMarker(value: number) {
  return value > 0 && landFieldHasBit(value, 2);
}

function clearLandMarkerBits(value: number) {
  if (value <= 0) return value;
  let cleared = value;
  cleared = clearLandFieldBit(cleared, 1);
  cleared = clearLandFieldBit(cleared, 2);
  return cleared;
}

function landFieldHasBit(value: number, bit: number) {
  return Boolean((value & 0xffff) & (1 << (15 - bit)));
}

function clearLandFieldBit(value: number, bit: number) {
  const cleared = (value & 0xffff) & ~(1 << (15 - bit));
  return cleared >= 0x8000 ? cleared - 0x10000 : cleared;
}
