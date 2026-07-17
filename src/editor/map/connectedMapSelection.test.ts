import { describe, expect, it } from "vitest";
import type { MapEntity, TileAttributeProfile, TilesetAsset } from "../types";
import { collectConnectedMapCells, connectedMapCellsByTile, updateConnectedCellSelection } from "./connectedMapSelection";

const plainsTileset = {
  id: "landlook-plains",
  landlook: 0,
  name: "Plains",
  source: "test",
  available: true,
  imagePath: "plains.png",
  pictId: 300,
  tileWidth: 32,
  tileHeight: 32,
  columns: 20,
  rows: 10,
  custom: false
} satisfies TilesetAsset;

describe("collectConnectedMapCells", () => {
  it("collects only the bounded eight-way component in deterministic row order", () => {
    const map = landMap([
      [1, 1, 2, 1],
      [1, 2, 2, 1],
      [2, 2, 1, 1]
    ]);

    expect(collectConnectedMapCells(map, { x: 0, y: 0 }, (candidate, anchor) => candidate.tile === anchor.tile))
      .toEqual([
        { x: 0, y: 0, tile: 1 },
        { x: 1, y: 0, tile: 1 },
        { x: 0, y: 1, tile: 1 }
      ]);
  });

  it("connects diagonally adjacent cells for narrow curved terrain", () => {
    const map = dungeonMap([
      [1, 2],
      [2, 1]
    ]);

    expect(connectedMapCellsByTile(map, { x: 0, y: 0 }, { mode: "exact", tileset: null }))
      .toEqual([
        { x: 0, y: 0, tile: 1 },
        { x: 1, y: 1, tile: 1 }
      ]);
  });

  it("preserves holes inside a connected component", () => {
    const map = landMap([
      [1, 1, 1],
      [1, 2, 1],
      [1, 1, 1]
    ]);

    const cells = connectedMapCellsByTile(map, { x: 0, y: 0 }, { mode: "exact", tileset: null });
    expect(cells).toHaveLength(8);
    expect(cells).not.toContainEqual({ x: 1, y: 1, tile: 2 });
  });

  it("handles a full 90 by 90 component deterministically", () => {
    const map = landMap(Array.from({ length: 90 }, () => Array<number>(90).fill(7)));
    const cells = connectedMapCellsByTile(map, { x: 45, y: 45 }, { mode: "exact", tileset: null });

    expect(cells).toHaveLength(8_100);
    expect(cells[0]).toEqual({ x: 0, y: 0, tile: 7 });
    expect(cells[cells.length - 1]).toEqual({ x: 89, y: 89, tile: 7 });
  });

  it("returns no cells for a start outside the map", () => {
    const map = landMap([[1]]);
    expect(connectedMapCellsByTile(map, { x: 1, y: 0 }, { mode: "exact", tileset: null })).toEqual([]);
    expect(connectedMapCellsByTile(map, { x: -1, y: 0 }, { mode: "exact", tileset: null })).toEqual([]);
  });
});

describe("connectedMapCellsByTile", () => {
  it("keeps raw values distinct in exact mode", () => {
    const map = landMap([
      [38, 39],
      [38, 38]
    ]);

    expect(connectedMapCellsByTile(map, { x: 0, y: 0 }, { mode: "exact", tileset: plainsTileset }))
      .toEqual([
        { x: 0, y: 0, tile: 38 },
        { x: 0, y: 1, tile: 38 },
        { x: 1, y: 1, tile: 38 }
      ]);
  });

  it("connects different tiles in the same known semantic family", () => {
    const map = landMap([
      [38, 39, 155],
      [40, 155, 39],
      [155, 39, 39]
    ]);

    expect(connectedMapCellsByTile(map, { x: 0, y: 0 }, {
      mode: "semantic-family",
      tileset: plainsTileset
    })).toEqual([
      { x: 0, y: 0, tile: 38 },
      { x: 1, y: 0, tile: 39 },
      { x: 0, y: 1, tile: 40 },
      { x: 2, y: 1, tile: 39 },
      { x: 1, y: 2, tile: 39 },
      { x: 2, y: 2, tile: 39 }
    ]);
  });

  it("includes mountain transition tiles with the solid center terrain family", () => {
    const map = landMap([
      [156, 66, 67, 156],
      [85, 61, 61, 68],
      [156, 69, 70, 156]
    ]);

    expect(connectedMapCellsByTile(map, { x: 1, y: 1 }, {
      mode: "semantic-family",
      tileset: plainsTileset
    })).toEqual([
      { x: 1, y: 0, tile: 66 },
      { x: 2, y: 0, tile: 67 },
      { x: 0, y: 1, tile: 85 },
      { x: 1, y: 1, tile: 61 },
      { x: 2, y: 1, tile: 61 },
      { x: 3, y: 1, tile: 68 },
      { x: 1, y: 2, tile: 69 },
      { x: 2, y: 2, tile: 70 }
    ]);
  });

  it("connects different tiles only when their known behavior signatures match", () => {
    const map = landMap([
      [10, 11, 12],
      [11, 12, 11]
    ]);
    const attributes = [
      attribute(10, ["walkable"]),
      attribute(11, ["walkable"]),
      attribute(12, ["solid", "blocks-los"])
    ];

    expect(connectedMapCellsByTile(map, { x: 0, y: 0 }, {
      mode: "behavior",
      tileset: plainsTileset,
      attributes
    })).toEqual([
      { x: 0, y: 0, tile: 10 },
      { x: 1, y: 0, tile: 11 },
      { x: 0, y: 1, tile: 11 },
      { x: 2, y: 1, tile: 11 }
    ]);
  });

  it.each(["semantic-family", "behavior"] as const)(
    "falls back to exact matching for %s when metadata is unknown",
    (mode) => {
      const map = landMap([
        [9999, 8888],
        [9999, 9999]
      ]);

      expect(connectedMapCellsByTile(map, { x: 0, y: 0 }, { mode, tileset: null }))
        .toEqual([
          { x: 0, y: 0, tile: 9999 },
          { x: 0, y: 1, tile: 9999 },
          { x: 1, y: 1, tile: 9999 }
        ]);
    }
  );
});

describe("updateConnectedCellSelection", () => {
  const initial = {
    anchor: { x: 0, y: 0 },
    cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    matchMode: "exact" as const
  };

  it("replaces the previous selection", () => {
    expect(updateConnectedCellSelection(initial, [{ x: 4, y: 3 }], { x: 4, y: 3 }, "behavior", "replace"))
      .toEqual({
        anchor: { x: 4, y: 3 },
        cells: [{ x: 4, y: 3 }],
        matchMode: "behavior"
      });
  });

  it("adds a component without duplicating cells", () => {
    expect(updateConnectedCellSelection(initial, [{ x: 1, y: 0 }, { x: 2, y: 0 }], { x: 2, y: 0 }, "exact", "add"))
      .toEqual({
        anchor: { x: 2, y: 0 },
        cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
        matchMode: "exact"
      });
  });

  it("subtracts a component and clears an empty selection", () => {
    expect(updateConnectedCellSelection(initial, [{ x: 1, y: 0 }], { x: 1, y: 0 }, "exact", "subtract"))
      .toEqual({
        anchor: { x: 1, y: 0 },
        cells: [{ x: 0, y: 0 }],
        matchMode: "exact"
      });
    expect(updateConnectedCellSelection(initial, initial.cells, { x: 0, y: 0 }, "exact", "subtract")).toBeNull();
  });
});

function landMap(rows: number[][]) {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  return {
    levelType: "land",
    width,
    height,
    tiles: Array.from({ length: width }, (_, x) => rows.map((row) => row[x])).flat()
  } as MapEntity;
}

function dungeonMap(rows: number[][]) {
  return {
    levelType: "dungeon",
    width: rows[0]?.length ?? 0,
    height: rows.length,
    tiles: rows.flat()
  } as MapEntity;
}

function attribute(tile: number, flags: TileAttributeProfile["flags"]) {
  return {
    tile,
    landlook: 0,
    solidType: null,
    movementSoundId: null,
    movementCost: null,
    flags,
    confidence: "source-backed",
    sourceKind: "mapstats",
    source: "test",
    rawByte: null
  } satisfies TileAttributeProfile;
}
