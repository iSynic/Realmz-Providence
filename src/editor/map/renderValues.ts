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

export const PAINTABLE_REFERENCE_SPECIAL_ICON_VALUES = [
  ...range(-223, -212),
  ...range(-209, -200),
  ...range(-195, -164),
  ...range(-99, -90),
  -83,
  ...range(-79, -50),
  ...range(-47, -25),
  ...range(-19, -15),
  -11,
  ...range(-5, -1)
];

export const PAINTABLE_REFERENCE_ACTOR_ICON_VALUES = [
  ...negativeAliases(range(379, 461)),
  ...negativeAliases(range(464, 496)),
  ...negativeAliases(range(500, 590)),
  ...negativeAliases(range(600, 619)),
  ...negativeAliases(range(692, 824))
];

export function tileIconCandidates(value: number) {
  if (value >= 0) return [];
  const normalized = normalizeIconId(value);
  return normalized !== null && normalized < 0 ? [normalized] : [];
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

function range(start: number, end: number) {
  const out: number[] = [];
  for (let value = start; value <= end; value += 1) out.push(value);
  return out;
}

function negativeAliases(values: number[]) {
  return values.map((value) => -value);
}
