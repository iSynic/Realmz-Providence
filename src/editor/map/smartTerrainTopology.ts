import { SmartBrushPreset, SmartBrushProfile, SmartBrushRole } from "../types";
import { normalizeAtlasTile, tileIconCandidates } from "./renderValues";

export type SmartTerrainShapeContext = {
  n: boolean;
  e: boolean;
  s: boolean;
  w: boolean;
  ne: boolean;
  se: boolean;
  sw: boolean;
  nw: boolean;
};

type SmartTerrainPresetProfile = SmartBrushProfile["presets"][SmartBrushPreset];

const ROLE_CONNECTION_MASKS: Record<SmartBrushRole, number> = {
  center: 255,
  single: 0,
  north: 110,
  south: 155,
  east: 205,
  west: 55,
  northEast: 76,
  northWest: 38,
  southEast: 137,
  southWest: 19,
  lineHorizontal: 10,
  lineVertical: 5,
  capNorth: 1,
  capSouth: 4,
  capEast: 2,
  capWest: 8,
  notchNorthEast: 239,
  notchNorthWest: 127,
  notchSouthEast: 223,
  notchSouthWest: 191
};

const NEIGHBOR_DIRECTIONS: Array<{
  key: keyof SmartTerrainShapeContext;
  dx: number;
  dy: number;
  neighborConnectionBit: number;
}> = [
  { key: "n", dx: 0, dy: -1, neighborConnectionBit: 4 },
  { key: "e", dx: 1, dy: 0, neighborConnectionBit: 8 },
  { key: "s", dx: 0, dy: 1, neighborConnectionBit: 1 },
  { key: "w", dx: -1, dy: 0, neighborConnectionBit: 2 },
  { key: "ne", dx: 1, dy: -1, neighborConnectionBit: 64 },
  { key: "se", dx: 1, dy: 1, neighborConnectionBit: 128 },
  { key: "sw", dx: -1, dy: 1, neighborConnectionBit: 16 },
  { key: "nw", dx: -1, dy: -1, neighborConnectionBit: 32 }
];

export function smartTerrainContextForCell(
  x: number,
  y: number,
  maskSet: Set<string>,
  presetProfile: SmartTerrainPresetProfile,
  readTile?: (x: number, y: number) => number | null
): SmartTerrainShapeContext {
  const context = smartTerrainMaskContext(x, y, maskSet);
  if (!readTile) return context;
  for (const direction of NEIGHBOR_DIRECTIONS) {
    if (context[direction.key]) continue;
    const xx = x + direction.dx;
    const yy = y + direction.dy;
    const adjoiningTile = readTile(xx, yy);
    context[direction.key] = adjoiningTile !== null && smartTerrainTileConnects(adjoiningTile, presetProfile, direction.neighborConnectionBit);
  }
  return context;
}

export function smartTerrainMaskContext(x: number, y: number, maskSet: Set<string>): SmartTerrainShapeContext {
  return {
    n: maskSet.has(`${x}:${y - 1}`),
    e: maskSet.has(`${x + 1}:${y}`),
    s: maskSet.has(`${x}:${y + 1}`),
    w: maskSet.has(`${x - 1}:${y}`),
    ne: maskSet.has(`${x + 1}:${y - 1}`),
    se: maskSet.has(`${x + 1}:${y + 1}`),
    sw: maskSet.has(`${x - 1}:${y + 1}`),
    nw: maskSet.has(`${x - 1}:${y - 1}`)
  };
}

export function smartTerrainNeighborMask(context: SmartTerrainShapeContext) {
  return (context.n ? 1 : 0)
    | (context.e ? 2 : 0)
    | (context.s ? 4 : 0)
    | (context.w ? 8 : 0)
    | (context.ne ? 16 : 0)
    | (context.se ? 32 : 0)
    | (context.sw ? 64 : 0)
    | (context.nw ? 128 : 0);
}

export function smartTerrainRoleFromContext(context: SmartTerrainShapeContext): SmartBrushRole {
  const outside = [
    !context.n ? "north" : null,
    !context.s ? "south" : null,
    !context.e ? "east" : null,
    !context.w ? "west" : null
  ].filter((value): value is "north" | "south" | "east" | "west" => value !== null);

  if (outside.length === 0) {
    if (!context.ne) return "notchNorthEast";
    if (!context.nw) return "notchNorthWest";
    if (!context.se) return "notchSouthEast";
    if (!context.sw) return "notchSouthWest";
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

export function smartTerrainTileConnects(tileValue: number, presetProfile: SmartTerrainPresetProfile, connectionBit: number) {
  return smartTerrainConnectionMasksForTile(tileValue, presetProfile).some((mask) => (mask & connectionBit) !== 0);
}

export function smartTerrainConnectionMasksForTile(tileValue: number, presetProfile: SmartTerrainPresetProfile) {
  const tile = normalizeSmartTerrainTile(tileValue);
  if (tile === null || !presetProfile.family.includes(tile)) return [];

  const masks: number[] = [];
  for (const [mask, tiles] of Object.entries(presetProfile.curatedMasks ?? {})) {
    if (tiles.includes(tile)) masks.push(Number(mask));
  }
  for (const roles of [presetProfile.curatedRoles, presetProfile.curatedWaterRoles]) {
    for (const [role, tiles] of Object.entries(roles ?? {}) as Array<[SmartBrushRole, number[]]>) {
      if (tiles.includes(tile)) masks.push(ROLE_CONNECTION_MASKS[role]);
    }
  }
  if (presetProfile.center.includes(tile)) masks.push(ROLE_CONNECTION_MASKS.center);

  return masks.length > 0 ? [...new Set(masks)] : [ROLE_CONNECTION_MASKS.center];
}

export function normalizeSmartTerrainTile(tileValue: number) {
  if (tileIconCandidates(tileValue).length > 0) return null;
  const tile = normalizeAtlasTile(tileValue, 1);
  return tile >= 1 && tile <= 200 ? tile : null;
}
