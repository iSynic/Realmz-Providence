import { describe, expect, it } from "vitest";
import type { MonsterRecord } from "../../types";
import {
  BATTLE_GRID_CELL_COUNT,
  battleGridCells,
  battleGridChanges,
  battleGridDisplayCoordsFromStorageIndex,
  battleGridStorageIndexFromDisplayCoords,
  battleGridStorageIndexFromDisplayIndex,
  battlePlacementCoveredDisplayCells,
  battlePlacementRect,
  normalizeBattleGridForEditor,
  placementIntersectsDisplayCell,
  topVisiblePlacementAtDisplayCell,
  type BattleGridPlacementView
} from "./battleGridModel";

function placement(index: number, col: number, row: number, width = 1, height = 1): BattleGridPlacementView {
  return {
    index,
    displayIndex: row * 13 + col,
    displayCol: col,
    displayRow: row,
    value: index,
    monsterId: Math.abs(index),
    alternateSide: index < 0,
    monster: { id: Math.abs(index) } as MonsterRecord,
    col,
    row,
    footprint: { width, height }
  };
}

describe("battle grid model", () => {
  it("maps Realmz column-major storage to row-major display coordinates", () => {
    expect(battleGridStorageIndexFromDisplayCoords(4, 7)).toBe(59);
    expect(battleGridStorageIndexFromDisplayIndex(7 * 13 + 4)).toBe(59);
    expect(battleGridDisplayCoordsFromStorageIndex(59)).toEqual({ col: 4, row: 7 });

    const grid = normalizeBattleGridForEditor([]);
    grid[59] = -12;
    const cell = battleGridCells(grid).find((candidate) => candidate.index === 59);
    expect(cell).toMatchObject({ displayCol: 4, displayRow: 7, monsterId: 12, alternateSide: true });
  });

  it("normalizes imported grids to 169 finite integer cells", () => {
    const normalized = normalizeBattleGridForEditor([1.8, Number.NaN, Number.POSITIVE_INFINITY, -3.9]);
    expect(normalized).toHaveLength(BATTLE_GRID_CELL_COUNT);
    expect(normalized.slice(0, 5)).toEqual([1, 0, 0, -3, 0]);
  });

  it("reports only changed grid cells", () => {
    const before = normalizeBattleGridForEditor([]);
    const after = [...before];
    after[0] = 4;
    after[59] = -12;

    expect(battleGridChanges(before, after)).toEqual([
      { index: 0, from: 0, to: 4 },
      { index: 59, from: 0, to: -12 }
    ]);
  });

  it("uses the lower-right anchor for large monster footprints", () => {
    const large = placement(8, 4, 5, 2, 3);
    expect(battlePlacementCoveredDisplayCells({ anchorIndex: 8, col: 4, row: 5, footprint: large.footprint }))
      .toEqual([
        { col: 3, row: 3, index: 42 },
        { col: 4, row: 3, index: 55 },
        { col: 3, row: 4, index: 43 },
        { col: 4, row: 4, index: 56 },
        { col: 3, row: 5, index: 44 },
        { col: 4, row: 5, index: 57 }
      ]);
    expect(placementIntersectsDisplayCell(large, 3, 3)).toBe(true);
    expect(placementIntersectsDisplayCell(large, 2, 3)).toBe(false);
    expect(battlePlacementRect(large, 10)).toEqual({ x: 30, y: 30, width: 20, height: 30 });
  });

  it("selects the last rendered placement covering an erase target", () => {
    const back = placement(2, 4, 5, 2, 3);
    const front = placement(7, 3, 3);

    expect(topVisiblePlacementAtDisplayCell([back, front], 3, 3)).toBe(front);
    expect(topVisiblePlacementAtDisplayCell([back, front], 4, 5)).toBe(back);
    expect(topVisiblePlacementAtDisplayCell([back, front], 12, 12)).toBeNull();
  });
});
