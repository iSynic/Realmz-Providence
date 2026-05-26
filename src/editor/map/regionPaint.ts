import { MapEntity, MapRegionSelection, PaintCellChange } from "../types";
import { mapTileIndex, tileValueAt } from "./geometry";

export function normalizeRegionBounds(start: { x: number; y: number }, end: { x: number; y: number }): MapRegionSelection {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y)
  };
}

export function clampRegionToMap(region: MapRegionSelection, map: Pick<MapEntity, "width" | "height">): MapRegionSelection {
  return {
    left: clamp(region.left, 0, map.width - 1),
    top: clamp(region.top, 0, map.height - 1),
    right: clamp(region.right, 0, map.width - 1),
    bottom: clamp(region.bottom, 0, map.height - 1)
  };
}

export function rectCells(map: MapEntity, region: MapRegionSelection) {
  const bounds = clampRegionToMap(region, map);
  const cells: Array<{ x: number; y: number; index: number; tile: number }> = [];
  for (let y = bounds.top; y <= bounds.bottom; y += 1) {
    for (let x = bounds.left; x <= bounds.right; x += 1) {
      cells.push({ x, y, index: mapTileIndex(map, x, y), tile: tileValueAt(map, x, y) });
    }
  }
  return cells;
}

export function allMapCells(map: MapEntity) {
  return rectCells(map, { left: 0, top: 0, right: map.width - 1, bottom: map.height - 1 });
}

export function buildPaintChanges(
  map: MapEntity,
  cells: Array<{ x: number; y: number; index: number; tile: number }>,
  toTile: number
): PaintCellChange[] {
  return cells
    .filter((cell) => cell.tile !== toTile)
    .map((cell) => ({ x: cell.x, y: cell.y, index: cell.index, from: cell.tile, to: toTile }));
}

export function buildReplaceChanges(
  map: MapEntity,
  cells: Array<{ x: number; y: number; index: number; tile: number }>,
  fromTile: number,
  toTile: number
): PaintCellChange[] {
  if (fromTile === toTile) return [];
  return buildPaintChanges(map, cells.filter((cell) => cell.tile === fromTile), toTile);
}

export function regionCellCount(region: MapRegionSelection) {
  return Math.max(0, region.right - region.left + 1) * Math.max(0, region.bottom - region.top + 1);
}

export function regionDimensions(region: MapRegionSelection) {
  return {
    width: Math.max(0, region.right - region.left + 1),
    height: Math.max(0, region.bottom - region.top + 1)
  };
}

export function dominantTiles(cells: Array<{ tile: number }>, limit = 5) {
  const counts = new Map<number, number>();
  for (const cell of cells) counts.set(cell.tile, (counts.get(cell.tile) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit)
    .map(([tile, count]) => ({ tile, count }));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
