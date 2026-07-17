import { describe, expect, it } from "vitest";
import type { MapEntity, MapPaintIntent } from "../types";
import { buildPaintBucketCommand, buildPaintBucketPlan } from "./paintBucket";

describe("buildPaintBucketPlan", () => {
  it("builds one bounded connected fill with deterministic cycle variation", () => {
    const map = landMap([
      [1, 1, 2],
      [1, 2, 2],
      [3, 3, 2]
    ]);
    const plan = buildPaintBucketPlan({
      map,
      start: { x: 0, y: 0 },
      matchMode: "exact",
      tileset: null,
      intent: paintIntent({ variation: "cycle-group", variationTiles: [7, 8] })
    });

    expect(plan.component).toEqual([
      { x: 0, y: 0, tile: 1 },
      { x: 1, y: 0, tile: 1 },
      { x: 0, y: 1, tile: 1 }
    ]);
    expect(plan.changes.map(({ x, y, from, to }) => ({ x, y, from, to }))).toEqual([
      { x: 0, y: 0, from: 1, to: 7 },
      { x: 1, y: 0, from: 1, to: 8 },
      { x: 0, y: 1, from: 1, to: 7 }
    ]);
  });

  it("intersects the component with region and cell-selection constraints", () => {
    const map = landMap([
      [1, 1, 1],
      [1, 1, 1]
    ]);
    const plan = buildPaintBucketPlan({
      map,
      start: { x: 1, y: 0 },
      matchMode: "exact",
      tileset: null,
      intent: paintIntent(),
      region: { left: 1, top: 0, right: 2, bottom: 1 },
      selectionCells: [{ x: 1, y: 0 }, { x: 1, y: 1 }]
    });

    expect(plan.component).toEqual([
      { x: 1, y: 0, tile: 1 },
      { x: 1, y: 1, tile: 1 }
    ]);
  });

  it("does nothing when the click is outside the active cell selection", () => {
    const map = landMap([[1, 1]]);
    expect(buildPaintBucketPlan({
      map,
      start: { x: 0, y: 0 },
      matchMode: "exact",
      tileset: null,
      intent: paintIntent(),
      selectionCells: [{ x: 1, y: 0 }]
    })).toEqual({ component: [], changes: [] });
  });
});

describe("buildPaintBucketCommand", () => {
  it("returns one paint command for the whole component", () => {
    const map = landMap([[1, 1, 2]]);
    const command = buildPaintBucketCommand({
      map,
      start: { x: 0, y: 0 },
      matchMode: "exact",
      tileset: null,
      intent: paintIntent()
    });

    expect(command?.kind).toBe("paintTiles");
    expect(command?.label).toBe("Fill connected terrain");
    expect(command?.cells).toHaveLength(2);
  });

  it("suppresses no-op history commands", () => {
    const map = landMap([[9, 9]]);
    expect(buildPaintBucketCommand({
      map,
      start: { x: 0, y: 0 },
      matchMode: "exact",
      tileset: null,
      intent: paintIntent({ selectedTile: 9 })
    })).toBeNull();
  });
});

function paintIntent(overrides: Partial<MapPaintIntent> = {}): MapPaintIntent {
  return {
    selectedTile: 9,
    selectedTileset: null,
    variation: "single",
    activeGroupId: "all",
    variationTiles: null,
    seed: 123,
    ...overrides
  };
}

function landMap(rows: number[][]) {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  return {
    id: "land:0",
    levelType: "land",
    width,
    height,
    tiles: Array.from({ length: width }, (_, x) => rows.map((row) => row[x])).flat()
  } as MapEntity;
}
