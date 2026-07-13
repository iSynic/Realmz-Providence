import type { BattleGridCellChange, MonsterRecord } from "../../types";

export const BATTLE_GRID_SIZE = 13;
export const BATTLE_GRID_CELL_COUNT = BATTLE_GRID_SIZE * BATTLE_GRID_SIZE;

export type BattleGridCellView = {
  index: number;
  displayIndex: number;
  displayCol: number;
  displayRow: number;
  value: number;
  monsterId: number;
  alternateSide: boolean;
};

export type BattleGridPlacementView = BattleGridCellView & {
  monster: MonsterRecord | null;
  col: number;
  row: number;
  footprint: { width: number; height: number };
};

export type BattleGridPaintPreview = {
  anchorIndex: number;
  col: number;
  row: number;
  footprint: { width: number; height: number };
};

export function battleGridStorageIndexFromDisplayIndex(displayIndex: number) {
  const displayCol = displayIndex % BATTLE_GRID_SIZE;
  const displayRow = Math.floor(displayIndex / BATTLE_GRID_SIZE);
  return battleGridStorageIndexFromDisplayCoords(displayCol, displayRow);
}

export function battleGridStorageIndexFromDisplayCoords(displayCol: number, displayRow: number) {
  return displayCol * BATTLE_GRID_SIZE + displayRow;
}

export function battleGridDisplayCoordsFromStorageIndex(storageIndex: number) {
  return {
    col: Math.floor(storageIndex / BATTLE_GRID_SIZE),
    row: storageIndex % BATTLE_GRID_SIZE
  };
}

export function battleGridCells(grid: number[]): BattleGridCellView[] {
  return Array.from({ length: BATTLE_GRID_CELL_COUNT }, (_, displayIndex) => {
    const index = battleGridStorageIndexFromDisplayIndex(displayIndex);
    const { col: displayCol, row: displayRow } = battleGridDisplayCoordsFromStorageIndex(index);
    const value = grid[index] ?? 0;
    return {
      index,
      displayIndex,
      displayCol,
      displayRow,
      value,
      monsterId: Math.abs(value),
      alternateSide: value < 0
    };
  });
}

export function topVisiblePlacementAtDisplayCell(
  placements: BattleGridPlacementView[],
  displayCol: number,
  displayRow: number
) {
  for (let index = placements.length - 1; index >= 0; index -= 1) {
    if (placementIntersectsDisplayCell(placements[index], displayCol, displayRow)) return placements[index];
  }
  return null;
}

export function placementIntersectsDisplayCell(
  placement: BattleGridPlacementView,
  displayCol: number,
  displayRow: number
) {
  const bounds = battlePlacementBounds(placement);
  return displayCol < bounds.left + bounds.width
    && displayCol + 1 > bounds.left
    && displayRow < bounds.top + bounds.height
    && displayRow + 1 > bounds.top;
}

export function normalizeBattleGridForEditor(grid: number[] | undefined) {
  return Array.from({ length: BATTLE_GRID_CELL_COUNT }, (_, index) => {
    const value = grid?.[index] ?? 0;
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  });
}

export function battleGridChanges(fromGrid: number[], toGrid: number[]): BattleGridCellChange[] {
  const changes: BattleGridCellChange[] = [];
  for (let index = 0; index < BATTLE_GRID_CELL_COUNT; index += 1) {
    const from = Number(fromGrid[index] ?? 0);
    const to = Number(toGrid[index] ?? 0);
    if (from !== to) changes.push({ index, from, to });
  }
  return changes;
}

export function battlePlacementCoveredDisplayCells(preview: BattleGridPaintPreview) {
  const bounds = battlePlacementBounds(preview);
  const left = Math.floor(bounds.left);
  const top = Math.floor(bounds.top);
  const right = Math.min(BATTLE_GRID_SIZE, Math.ceil(bounds.left + bounds.width));
  const bottom = Math.min(BATTLE_GRID_SIZE, Math.ceil(bounds.top + bounds.height));
  const cells: Array<{ col: number; row: number; index: number }> = [];
  for (let row = top; row < bottom; row += 1) {
    for (let col = left; col < right; col += 1) {
      cells.push({ col, row, index: battleGridStorageIndexFromDisplayCoords(col, row) });
    }
  }
  return cells;
}

export function battlePlacementRect(placement: BattleGridPlacementView, cellSize: number) {
  const bounds = battlePlacementBounds(placement);
  return {
    x: bounds.left * cellSize,
    y: bounds.top * cellSize,
    width: bounds.width * cellSize,
    height: bounds.height * cellSize
  };
}

function battlePlacementBounds(placement: Pick<BattleGridPlacementView, "col" | "row" | "footprint">) {
  const width = Math.max(0.5, Math.min(placement.footprint.width, BATTLE_GRID_SIZE));
  const height = Math.max(0.5, Math.min(placement.footprint.height, BATTLE_GRID_SIZE));
  return {
    left: clamp(placement.col + 1 - width, 0, BATTLE_GRID_SIZE - width),
    top: clamp(placement.row + 1 - height, 0, BATTLE_GRID_SIZE - height),
    width,
    height
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
