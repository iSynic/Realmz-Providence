import type { MapEntity, MapWorkbenchMode, ProjectCommand, RandomLevel } from "../../types";

export type MapContextFocus = "flags" | "atlas" | "layout" | "source";

export function nextMapIndex(maps: MapEntity[], levelType: MapEntity["levelType"]) {
  return maps
    .filter((map) => map.levelType === levelType)
    .reduce((max, map) => Math.max(max, map.index), -1) + 1;
}

export function buildCreateMapAction(maps: MapEntity[], levelType: MapEntity["levelType"]): { mapId: string; command: ProjectCommand } {
  const index = nextMapIndex(maps, levelType);
  return {
    mapId: `${levelType}:${index}`,
    command: { kind: "createMap", label: `Create ${levelType} map`, levelType }
  };
}

export function buildDuplicateMapAction(maps: MapEntity[], source: MapEntity): { mapId: string; command: ProjectCommand } {
  const index = nextMapIndex(maps, source.levelType);
  return {
    mapId: `${source.levelType}:${index}`,
    command: { kind: "duplicateMap", label: `Duplicate ${source.name}`, mapId: source.id }
  };
}

export function buildUpdateMapLevelSettingsCommand(
  map: MapEntity,
  fields: Partial<Pick<RandomLevel, "landlook" | "isDark" | "useLos">>
): ProjectCommand {
  return {
    kind: "updateRandomLevelSettings",
    label: "Update map level flags",
    levelType: map.levelType,
    levelIndex: map.index,
    fields
  };
}

export function mapWorkbenchModeLabel(mode: MapWorkbenchMode) {
  switch (mode) {
    case "canvas": return "Canvas";
    case "land-layout": return "Land Layout";
    case "land-tiles": return "Land Tiles";
    case "random-areas": return "Random Encounters";
  }
}
