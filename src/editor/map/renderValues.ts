export function normalizeAtlasTile(value: number, baseTile = 1) {
  let tile = value;
  const fallbackTile = Number.isInteger(baseTile) && baseTile > 0 ? baseTile : 1;
  if (tile < 0) {
    while (tile < -999) tile += 1000;
    tile = fallbackTile;
  }
  if (tile > 999) {
    tile = clearRealmzShortBit(tile, 1);
    tile = clearRealmzShortBit(tile, 2);
    for (let attempt = 0; attempt < 3 && tile > 999; attempt += 1) {
      tile -= 1000;
    }
  }
  if (tile > 200) tile = fallbackTile;
  return Math.max(1, normalizeTile(tile));
}

export function normalizeTile(value: number) {
  let out = value;
  while (out > 999) out -= 1000;
  while (out < -999) out += 1000;
  return out;
}

export function normalizeIconId(value: number) {
  if (value >= 0) return null;
  let iconId = value;
  while (iconId < -999) iconId += 1000;
  return iconId;
}

export function tileIconCandidates(value: number) {
  if (value >= 0) return [];
  const candidates = [value];
  const normalized = normalizeIconId(value);
  if (normalized !== null && normalized < 0) candidates.push(normalized);
  return [...new Set(candidates)];
}

export function referencedMapIconIds(tiles: number[]) {
  const ids = new Set<number>();
  for (const value of tiles) {
    for (const id of tileIconCandidates(value)) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

function clearRealmzShortBit(value: number, bit: number) {
  const unsigned = value & 0xffff;
  const cleared = unsigned & ~(1 << (15 - bit));
  return cleared >= 0x8000 ? cleared - 0x10000 : cleared;
}
