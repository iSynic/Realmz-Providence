import { describe, expect, it } from "vitest";
import type { MapEntity } from "../../types";
import { mapWorkbenchModeLabel, nextMapIndex } from "./mapBrowserModel";

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
});
