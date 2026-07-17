import { describe, expect, it } from "vitest";
import {
  growMapCells,
  mapEllipseCells,
  mapLineCells,
  mapRectangleCells,
  shrinkMapCells
} from "./mapCellShapes";

const BOUNDS = { width: 8, height: 8 };

describe("map cell shapes", () => {
  it("creates stable orthogonally contiguous lines including degenerate points", () => {
    expect(mapLineCells({ x: 2, y: 3 }, { x: 2, y: 3 }, BOUNDS)).toEqual([{ x: 2, y: 3 }]);

    const cells = mapLineCells({ x: 0, y: 0 }, { x: 4, y: 2 }, BOUNDS);
    expect(cells[0]).toEqual({ x: 0, y: 0 });
    expect(cells[cells.length - 1]).toEqual({ x: 4, y: 2 });
    for (let index = 1; index < cells.length; index += 1) {
      const distance = Math.abs(cells[index].x - cells[index - 1].x) + Math.abs(cells[index].y - cells[index - 1].y);
      expect(distance).toBe(1);
    }
  });

  it("creates filled and outline rectangles and clips them to map bounds", () => {
    expect(mapRectangleCells({ x: 1, y: 1 }, { x: 3, y: 3 }, "filled", BOUNDS)).toHaveLength(9);
    expect(mapRectangleCells({ x: 1, y: 1 }, { x: 3, y: 3 }, "outline", BOUNDS)).toHaveLength(8);
    expect(mapRectangleCells({ x: -2, y: -1 }, { x: 1, y: 1 }, "filled", BOUNDS)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ]);
  });

  it("creates symmetric filled and outline ellipses", () => {
    const filled = mapEllipseCells({ x: 1, y: 1 }, { x: 5, y: 5 }, "filled", BOUNDS);
    const outline = mapEllipseCells({ x: 1, y: 1 }, { x: 5, y: 5 }, "outline", BOUNDS);

    expect(filled).toContainEqual({ x: 3, y: 3 });
    expect(outline).not.toContainEqual({ x: 3, y: 3 });
    expect(new Set(filled.map((cell) => `${cell.x}:${cell.y}`))).toEqual(new Set(
      filled.map((cell) => `${6 - cell.x}:${cell.y}`)
    ));
    expect(outline.every((cell) => filled.some((candidate) => candidate.x === cell.x && candidate.y === cell.y))).toBe(true);
  });

  it("treats narrow ellipses as deterministic lines", () => {
    expect(mapEllipseCells({ x: 2, y: 1 }, { x: 2, y: 5 }, "filled", BOUNDS)).toEqual([
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 2, y: 3 },
      { x: 2, y: 4 },
      { x: 2, y: 5 }
    ]);
  });

  it("grows and shrinks one orthogonal ring while respecting map edges", () => {
    const grown = growMapCells([{ x: 3, y: 3 }], BOUNDS);
    expect(grown).toHaveLength(5);
    expect(shrinkMapCells(grown, BOUNDS)).toEqual([{ x: 3, y: 3 }]);
    expect(growMapCells([{ x: 0, y: 0 }], BOUNDS)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 }
    ]);
    expect(shrinkMapCells([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 }
    ], BOUNDS)).toEqual([]);
  });
});
