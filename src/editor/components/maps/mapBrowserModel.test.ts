import { describe, expect, it } from "vitest";
import type { MapEntity } from "../../types";
import {
  buildCreateMapAction,
  buildDuplicateMapAction,
  buildUpdateMapLevelSettingsCommand,
  mapWorkbenchModeLabel,
  nextMapIndex
} from "./mapBrowserModel";
import { segmentedControlKeyboardTarget } from "../../ui";

function map(levelType: MapEntity["levelType"], index: number) {
  return { levelType, index } as MapEntity;
}

describe("map browser model", () => {
  it("allocates the next index within the requested map family", () => {
    const maps = [map("land", 0), map("dungeon", 4), map("land", 3)];

    expect(nextMapIndex(maps, "land")).toBe(4);
    expect(nextMapIndex(maps, "dungeon")).toBe(5);
    expect(nextMapIndex([], "land")).toBe(0);
  });

  it("provides stable author-facing workbench labels", () => {
    expect(mapWorkbenchModeLabel("canvas")).toBe("Canvas");
    expect(mapWorkbenchModeLabel("land-layout")).toBe("Land Layout");
    expect(mapWorkbenchModeLabel("land-tiles")).toBe("Land Tiles");
    expect(mapWorkbenchModeLabel("random-areas")).toBe("Random Encounters");
  });

  it("supports roving keyboard navigation for map workbench modes", () => {
    const options = [
      { value: "canvas", label: "Canvas" },
      { value: "land-layout", label: "Land Layout" },
      { value: "land-tiles", label: "Land Tiles" },
      { value: "random-areas", label: "Random Encounters" }
    ] as const;

    expect(segmentedControlKeyboardTarget(options, "canvas", "ArrowRight")).toBe("land-layout");
    expect(segmentedControlKeyboardTarget(options, "canvas", "End")).toBe("random-areas");
  });

  it("builds map creation and duplication intents with predicted selections", () => {
    const maps = [map("land", 0), map("land", 2), map("dungeon", 1)];
    expect(buildCreateMapAction(maps, "land")).toEqual({
      mapId: "land:3",
      command: { kind: "createMap", label: "Create land map", levelType: "land" }
    });
    expect(buildDuplicateMapAction(maps, { ...map("dungeon", 1), id: "dungeon:1", name: "Dungeon level 1" })).toEqual({
      mapId: "dungeon:2",
      command: { kind: "duplicateMap", label: "Duplicate Dungeon level 1", mapId: "dungeon:1" }
    });
  });

  it("keeps level settings updates inside the project command boundary", () => {
    expect(buildUpdateMapLevelSettingsCommand({ ...map("land", 4), id: "land:4" }, { landlook: 9, useLos: true })).toEqual({
      kind: "updateRandomLevelSettings",
      label: "Update map level flags",
      levelType: "land",
      levelIndex: 4,
      fields: { landlook: 9, useLos: true }
    });
  });
});
