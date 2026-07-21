import type { LevelType, MapCoordinateTarget, Project } from "./types";

export type TeleportFieldIndexes = {
  level: number;
  x: number;
  y: number;
  mode: number | null;
  heading: number | null;
};

export type TeleportLevelOption = {
  value: number;
  label: string;
  levelTypes: LevelType[];
};

export function teleportFieldIndexes(shape: string): TeleportFieldIndexes | null {
  const normalized = normalizeTeleportShape(shape);
  if (normalized === "teleport") return { level: 0, x: 1, y: 2, mode: null, heading: null };
  if (normalized === "dungeon-move") return { level: 1, x: 2, y: 3, mode: 0, heading: 4 };
  return null;
}

export function teleportDestinationLevelType(
  shape: string,
  values: readonly number[],
  sourceLevelType: LevelType | null = null
): LevelType | null {
  const indexes = teleportFieldIndexes(shape);
  if (!indexes) return null;
  if (indexes.mode == null) return sourceLevelType;
  return Number(values[indexes.mode] ?? 0) === 0 ? "dungeon" : "land";
}

export function teleportMapCoordinateTarget(
  shape: string,
  values: readonly number[],
  sourceLevelType: LevelType | null = null
): MapCoordinateTarget | null {
  const indexes = teleportFieldIndexes(shape);
  const levelType = teleportDestinationLevelType(shape, values, sourceLevelType);
  if (!indexes || !levelType) return null;
  const levelIndex = Number(values[indexes.level] ?? -1);
  const x = Number(values[indexes.x] ?? -1);
  const y = Number(values[indexes.y] ?? -1);
  if (![levelIndex, x, y].every(Number.isInteger)) return null;
  if (levelIndex < 0 || x < 0 || y < 0) return null;
  return { levelType, levelIndex, x, y };
}

export function teleportPreviewMapCoordinateTarget(
  project: Project,
  shape: string,
  values: readonly number[],
  sourceLevelType: LevelType | null = null,
  previewMap: Pick<Project["maps"][number], "levelType" | "index"> | null = null
): MapCoordinateTarget | null {
  const runtimeTarget = teleportMapCoordinateTarget(shape, values, sourceLevelType);
  if (runtimeTarget) return runtimeTarget;

  const indexes = teleportFieldIndexes(shape);
  if (!indexes || indexes.mode != null) return null;
  let levelIndex = Number(values[indexes.level] ?? -1);
  const x = Number(values[indexes.x] ?? -1);
  const y = Number(values[indexes.y] ?? -1);
  if (![levelIndex, x, y].every(Number.isInteger) || x < 0 || y < 0) return null;

  if (levelIndex === -1) {
    if (!previewMap) return null;
    levelIndex = previewMap.index;
  } else if (levelIndex < 0) {
    return null;
  }

  if (sourceLevelType) return { levelType: sourceLevelType, levelIndex, x, y };

  const availableLevelTypes = [...new Set(
    project.maps
      .filter((map) => map.index === levelIndex)
      .map((map) => map.levelType)
  )];
  const previewLevelType = availableLevelTypes.length === 1
    ? availableLevelTypes[0]
    : previewMap?.levelType ?? null;
  if (!previewLevelType) return null;
  return { levelType: previewLevelType, levelIndex, x, y };
}

export function teleportLevelOptions(
  project: Project,
  levelType: LevelType | null
): TeleportLevelOption[] {
  if (levelType) {
    return project.maps
      .filter((map) => map.levelType === levelType)
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((map) => ({ value: map.index, label: map.name, levelTypes: [levelType] }));
  }

  const typesByIndex = new Map<number, Set<LevelType>>();
  for (const map of project.maps) {
    const levelTypes = typesByIndex.get(map.index) ?? new Set<LevelType>();
    levelTypes.add(map.levelType);
    typesByIndex.set(map.index, levelTypes);
  }
  return [...typesByIndex.entries()]
    .sort(([left], [right]) => left - right)
    .map(([value, levelTypes]) => {
      const types = [...levelTypes].sort(levelTypeOrder);
      const availability = types.length === 2 ? "land and dungeon" : types[0] ?? "no map";
      return { value, label: `Level index ${value} (${availability})`, levelTypes: types };
    });
}

export function teleportLevelLabel(
  project: Project | null,
  value: number,
  levelType: LevelType | null
) {
  if (value < 0) {
    return levelType
      ? `current ${levelType === "dungeon" ? "dungeon" : "land"} level`
      : "current runtime-family level";
  }
  if (levelType) {
    const map = project?.maps.find((candidate) => candidate.levelType === levelType && candidate.index === value);
    return map?.name ?? `${levelType === "dungeon" ? "Dungeon" : "Land"} level ${value}`;
  }
  const types = [...new Set(
    project?.maps.filter((candidate) => candidate.index === value).map((candidate) => candidate.levelType) ?? []
  )].sort(levelTypeOrder);
  if (types.length === 2) return `runtime-family level ${value} (land and dungeon exist)`;
  if (types.length === 1) return `runtime-family level ${value} (${types[0]} exists)`;
  return `runtime-family level ${value} (missing in both families)`;
}

export function teleportHeadingLabel(value: number) {
  const headings: Record<number, string> = { 1: "north", 2: "east", 3: "south", 4: "west" };
  const direction = headings[Math.abs(value)] ?? `heading ${Math.abs(value)}`;
  return value < 0 ? `${direction}, 3D view only` : direction;
}

function normalizeTeleportShape(shape: string) {
  return shape.trim().toLowerCase().replace(/_/g, "-");
}

function levelTypeOrder(left: LevelType, right: LevelType) {
  return left === right ? 0 : left === "land" ? -1 : 1;
}
