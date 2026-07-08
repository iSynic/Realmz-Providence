import type { DungeonCellFlag, DungeonCellFlagState } from "../types";

export const DUNGEON_CELL_FLAG_MASKS: Record<DungeonCellFlag, number> = {
  wall: 0x0001,
  horizontalDoor: 0x0002,
  verticalDoor: 0x0004,
  stairs: 0x0008,
  column: 0x0010,
  unmapped: 0x0080,
  allowMoveNorth: 0x0100,
  allowMoveEast: 0x0200,
  allowMoveSouth: 0x0400,
  allowMoveWest: 0x0800,
  archway: 0x2000,
  noWallInBattle: 0x4000
};

export const DUNGEON_CELL_FLAG_DEFINITIONS: Array<{ id: DungeonCellFlag; label: string; group: string }> = [
  { id: "wall", label: "Wall", group: "Shape" },
  { id: "horizontalDoor", label: "Horizontal Door", group: "Shape" },
  { id: "verticalDoor", label: "Vertical Door", group: "Shape" },
  { id: "stairs", label: "Stairs", group: "Shape" },
  { id: "column", label: "Column", group: "Shape" },
  { id: "unmapped", label: "Unmapped", group: "Visibility" },
  { id: "allowMoveNorth", label: "Allow Move Up", group: "Movement" },
  { id: "allowMoveEast", label: "Allow Move Right", group: "Movement" },
  { id: "allowMoveSouth", label: "Allow Move Down", group: "Movement" },
  { id: "allowMoveWest", label: "Allow Move Left", group: "Movement" },
  { id: "archway", label: "Archway", group: "Shape" },
  { id: "noWallInBattle", label: "No Wall In Battle", group: "Combat" }
];

export const DUNGEON_CELL_MANAGED_FLAG_DEFINITIONS = [
  { id: "noteMarker", label: "Note marker", mask: 0x0020 },
  { id: "revealedSecret", label: "Revealed secret", mask: 0x0040 },
  { id: "actionPointMarker", label: "Action Point marker", mask: 0x1000 },
  { id: "preservedHighSign", label: "High/sign bit", mask: 0x8000 }
] as const;

export const DUNGEON_CLEAR_TO_WALL_FLAGS: Partial<Record<DungeonCellFlag, boolean>> = {
  wall: true,
  horizontalDoor: false,
  verticalDoor: false,
  stairs: false,
  column: false,
  unmapped: false,
  allowMoveNorth: false,
  allowMoveEast: false,
  allowMoveSouth: false,
  allowMoveWest: false,
  archway: false,
  noWallInBattle: false
};

export const DUNGEON_DEFAULT_DRAW_FLAGS: Record<DungeonCellFlag, boolean> = {
  wall: false,
  horizontalDoor: false,
  verticalDoor: false,
  stairs: false,
  column: false,
  unmapped: false,
  allowMoveNorth: false,
  allowMoveEast: false,
  allowMoveSouth: false,
  allowMoveWest: false,
  archway: false,
  noWallInBattle: false
};

export function dungeonDrawFlagsFromValue(value: number): Record<DungeonCellFlag, boolean> {
  return Object.fromEntries(
    DUNGEON_CELL_FLAG_DEFINITIONS.map((definition) => [definition.id, hasDungeonCellFlag(value, definition.id)])
  ) as Record<DungeonCellFlag, boolean>;
}

export function dungeonCellMask(value: number) {
  return value & 0xffff;
}

export function signedDungeonCellValue(mask: number) {
  const raw = mask & 0xffff;
  return raw >= 0x8000 ? raw - 0x10000 : raw;
}

export function hasDungeonCellFlag(value: number, flag: DungeonCellFlag) {
  return (dungeonCellMask(value) & DUNGEON_CELL_FLAG_MASKS[flag]) !== 0;
}

export function setDungeonCellFlag(value: number, flag: DungeonCellFlag, enabled: boolean) {
  const mask = DUNGEON_CELL_FLAG_MASKS[flag];
  const next = enabled ? dungeonCellMask(value) | mask : dungeonCellMask(value) & ~mask;
  return signedDungeonCellValue(next);
}

export function setDungeonCellFlags(value: number, flags: Partial<Record<DungeonCellFlag, boolean>>) {
  let next = value;
  for (const [flag, enabled] of Object.entries(flags) as Array<[DungeonCellFlag, boolean | undefined]>) {
    if (typeof enabled !== "boolean") continue;
    next = setDungeonCellFlag(next, flag, enabled);
  }
  return next;
}

export function dungeonFlagState(values: number[], flag: DungeonCellFlag): DungeonCellFlagState {
  if (values.length === 0) return "off";
  const first = hasDungeonCellFlag(values[0], flag);
  for (const value of values.slice(1)) {
    if (hasDungeonCellFlag(value, flag) !== first) return "mixed";
  }
  return first ? "on" : "off";
}

export function activeManagedDungeonFlags(values: number[]) {
  return DUNGEON_CELL_MANAGED_FLAG_DEFINITIONS.filter((definition) =>
    values.some((value) => (dungeonCellMask(value) & definition.mask) !== 0)
  );
}
