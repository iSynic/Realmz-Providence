import type { MapEntity, MapWorkbenchMode } from "../../types";

export type MapContextFocus = "flags" | "atlas" | "layout" | "source";

export function nextMapIndex(maps: MapEntity[], levelType: MapEntity["levelType"]) {
  return maps
    .filter((map) => map.levelType === levelType)
    .reduce((max, map) => Math.max(max, map.index), -1) + 1;
}

export function mapWorkbenchModeLabel(mode: MapWorkbenchMode) {
  switch (mode) {
    case "canvas": return "Canvas";
    case "land-layout": return "Land Layout";
    case "land-tiles": return "Land Tiles";
    case "random-areas": return "Random Encounters";
  }
}
