import { describe, expect, it } from "vitest";
import type { MapEntity } from "../types";
import { captureMapStampFromCells } from "./customMapStamps";

describe("captureMapStampFromCells", () => {
  it("captures an irregular selection with transparent unselected cells", () => {
    const map = landMap([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9]
    ]);
    const stamp = captureMapStampFromCells(
      map,
      [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 2, y: 2 }],
      "Cross",
      "map-stamp:cross"
    );

    expect(stamp).toMatchObject({ id: "map-stamp:cross", name: "Cross", width: 3, height: 3 });
    expect(stamp?.cells).toEqual([
      { x: 0, y: 0, tile: 1 },
      { x: 2, y: 0, tile: 3 },
      { x: 1, y: 1, tile: 5 },
      { x: 0, y: 2, tile: 7 },
      { x: 2, y: 2, tile: 9 }
    ]);
  });

  it("keeps deliberately selected base tiles", () => {
    const map = landMap([[156, 4]]);
    expect(captureMapStampFromCells(map, [{ x: 0, y: 0 }], "Base", "base")?.cells).toEqual([
      { x: 0, y: 0, tile: 156 }
    ]);
  });
});

function landMap(rows: number[][]) {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  return {
    id: "land:0",
    levelType: "land",
    width,
    height,
    render: { mode: "land-atlas", landlook: 0 },
    tiles: Array.from({ length: width }, (_, x) => rows.map((row) => row[x])).flat()
  } as MapEntity;
}
