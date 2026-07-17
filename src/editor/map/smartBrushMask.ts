import type { SmartBrushMaskCell } from "../types";

export function filledClosedSmartBrushPathCells(
  path: SmartBrushMaskCell[],
  bounds: { width: number; height: number }
) {
  if (path.length < 4) return [];
  const first = path[0];
  const last = path[path.length - 1];
  if (first.x !== last.x || first.y !== last.y) return [];

  const area = path.reduce(
    (acc, point) => ({
      left: Math.min(acc.left, point.x),
      right: Math.max(acc.right, point.x),
      top: Math.min(acc.top, point.y),
      bottom: Math.max(acc.bottom, point.y)
    }),
    { left: first.x, right: first.x, top: first.y, bottom: first.y }
  );
  if (area.right - area.left < 2 || area.bottom - area.top < 2) return [];

  const polygon = path.map((point) => ({ x: point.x + 0.5, y: point.y + 0.5 }));
  const cells: SmartBrushMaskCell[] = [];
  const left = Math.max(0, area.left);
  const right = Math.min(bounds.width - 1, area.right);
  const top = Math.max(0, area.top);
  const bottom = Math.min(bounds.height - 1, area.bottom);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, polygon)) cells.push({ x, y });
    }
  }
  return cells;
}

export function sameSmartBrushMask(a: SmartBrushMaskCell[], b: SmartBrushMaskCell[]) {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(maskKey));
  return b.every((cell) => keys.has(maskKey(cell)));
}

export function orthogonalSmartBrushPathCells(start: SmartBrushMaskCell, end: SmartBrushMaskCell) {
  const cells: SmartBrushMaskCell[] = [{ ...start }];
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const sx = start.x < end.x ? 1 : -1;
  const sy = start.y < end.y ? 1 : -1;
  let x = start.x;
  let y = start.y;
  let movedX = 0;
  let movedY = 0;
  while (movedX < dx || movedY < dy) {
    const nextXProgress = movedX < dx ? (movedX + 0.5) / dx : Number.POSITIVE_INFINITY;
    const nextYProgress = movedY < dy ? (movedY + 0.5) / dy : Number.POSITIVE_INFINITY;
    if (nextXProgress < nextYProgress) {
      x += sx;
      movedX += 1;
    } else {
      y += sy;
      movedY += 1;
    }
    cells.push({ x, y });
  }
  return cells;
}

function pointInPolygon(x: number, y: number, polygon: SmartBrushMaskCell[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = (a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function maskKey(cell: SmartBrushMaskCell) {
  return `${cell.x}:${cell.y}`;
}
