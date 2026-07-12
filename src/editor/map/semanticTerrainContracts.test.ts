import { describe, expect, it } from "vitest";
import { resolveNamedLandStamp } from "./namedLandStamps";
import { resolveNamedLandTile } from "./namedLandTiles";
import { semanticRoadTile, supportsSemanticRoads } from "./semanticRoads";

describe("semantic road contracts", () => {
  it("maps cardinal connection masks to stable Realmz path tiles", () => {
    expect(semanticRoadTile(2)).toBe(143);
    expect(semanticRoadTile(10)).toBe(132);
    expect(semanticRoadTile(8)).toBe(145);
    expect(semanticRoadTile(0)).toBeNull();
  });

  it("only enables semantic paths on aligned overworld landlooks", () => {
    expect(supportsSemanticRoads(0)).toBe(true);
    expect(supportsSemanticRoads(10)).toBe(true);
    expect(supportsSemanticRoads(4)).toBe(false);
  });
});

describe("named terrain contracts", () => {
  it("resolves shared shoreline and landlook-specific castle tiles", () => {
    expect(resolveNamedLandTile(0, "land-to-cave-cave-south")).toBe(111);
    expect(resolveNamedLandTile(4, "alchemy-table")).toBe(146);
    expect(resolveNamedLandTile(4, "open-ground", 2)).toBe(155);
    expect(resolveNamedLandTile(4, "open-ground", 3)).toBeNull();
  });

  it("resolves reusable stamps with stable dimensions and variants", () => {
    const stamp = resolveNamedLandStamp(4, "long-table", 3);
    expect(stamp?.id).toBe("castle-long-table-food-158-161-162");
    expect(stamp?.width).toBe(3);
    expect(stamp?.height).toBe(1);
    expect(resolveNamedLandStamp(0, "long-table", 1)).toBeNull();
  });
});
