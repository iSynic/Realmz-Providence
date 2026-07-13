import { describe, expect, it } from "vitest";
import { deterministicHash, terrainGeometryCells } from "./terrainGeometry";

describe("scenario seed terrain geometry", () => {
  it("enumerates rectangles and connected paths in stable map order", () => {
    expect(terrainGeometryCells({ kind: "rect", x: 2, y: 3, width: 2, height: 2 })).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 4 },
      { x: 3, y: 4 }
    ]);
    expect(terrainGeometryCells({
      kind: "path",
      points: [{ x: 1, y: 1 }, { x: 3, y: 1 }],
      width: 1
    })).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]);
  });

  it("produces deterministic bounded blob masks", () => {
    const geometry = { kind: "blob" as const, x: 20, y: 20, radiusX: 6, radiusY: 4, roughness: 55 };
    const first = terrainGeometryCells(geometry, "land:0", "forest");
    const second = terrainGeometryCells(geometry, "land:0", "forest");

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(40);
    expect(first.every(({ x, y }) => x >= 14 && x <= 26 && y >= 16 && y <= 24)).toBe(true);
    expect(deterministicHash("land:0:forest")).toBe(deterministicHash("land:0:forest"));
  });
});
