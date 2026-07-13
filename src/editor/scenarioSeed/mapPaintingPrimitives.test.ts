import { describe, expect, it } from "vitest";
import { drawLine, drawPath, mapStorageTileIndex, setTile } from "./mapPaintingPrimitives";

describe("scenario seed map painting primitives", () => {
  it("preserves Realmz land and dungeon storage orientation", () => {
    const land = new Array(90 * 90).fill(0);
    const dungeon = new Array(90 * 90).fill(0);

    setTile(land, 2, 3, 11, "land");
    setTile(dungeon, 2, 3, 22, "dungeon");

    expect(mapStorageTileIndex("land", 2, 3)).toBe(183);
    expect(mapStorageTileIndex("dungeon", 2, 3)).toBe(272);
    expect(land[183]).toBe(11);
    expect(dungeon[272]).toBe(22);
  });

  it("draws connected paths and clips wide strokes at map bounds", () => {
    const tiles = new Array(90 * 90).fill(0);
    const wideTiles = new Array(90 * 90).fill(0);

    drawPath(tiles, [{ x: 1, y: 1 }, { x: 3, y: 1 }], 7, 1, "land");
    drawLine(wideTiles, 0, 0, 0, 1, 9, 3, "land");

    expect([1, 2, 3].map((x) => tiles[mapStorageTileIndex("land", x, 1)])).toEqual([7, 7, 7]);
    expect(wideTiles[mapStorageTileIndex("land", 0, 0)]).toBe(9);
    expect(wideTiles[mapStorageTileIndex("land", 1, 1)]).toBe(9);
  });
});
