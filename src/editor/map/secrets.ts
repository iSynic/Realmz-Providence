import { MapEntity } from "../types";

const DUNGEON_SECRET_DIRECTION_MASK = 0x0f00;

export function isSecretWalkableTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value);
  const base = normalizedTileBase(value);
  return base === 169 || (hasSecretMarkerTile(value, map) && (base === 169 || base === 181));
}

export function hasSecretMarkerTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value) || hasDungeonShownSecretMarker(value);
  return value >= 3000;
}

export function hasSecretPathTile(value: number, map: MapEntity) {
  if (isDungeonTopDownMap(map)) return hasDungeonSecretDirection(value);
  return value >= 1000;
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
