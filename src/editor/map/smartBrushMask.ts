import type { SmartBrushMaskCell } from "../types";

export function filledClosedSmartBrushPathCells(
  path: SmartBrushMaskCell[],
  bounds: { width: number; height: number }
) {
  const closedPath = closedOrthogonalPath(path);
  return filledEnclosedSmartBrushMaskCells(closedPath, bounds);
}

export function filledEnclosedSmartBrushMaskCells(
  mask: SmartBrushMaskCell[],
  bounds: { width: number; height: number }
) {
  if (mask.length < 4 || bounds.width <= 0 || bounds.height <= 0) return [];
  const boundary = new Set(mask.filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < bounds.width && cell.y < bounds.height).map(maskKey));
  if (boundary.size < 4) return [];
  const exterior = new Set<string>();
  const queue: SmartBrushMaskCell[] = [];
  const addExterior = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return;
    const key = `${x}:${y}`;
    if (boundary.has(key) || exterior.has(key)) return;
    exterior.add(key);
    queue.push({ x, y });
  };
  for (let x = 0; x < bounds.width; x += 1) {
    addExterior(x, 0);
    addExterior(x, bounds.height - 1);
  }
  for (let y = 1; y < bounds.height - 1; y += 1) {
    addExterior(0, y);
    addExterior(bounds.width - 1, y);
  }
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    addExterior(cell.x, cell.y - 1);
    addExterior(cell.x + 1, cell.y);
    addExterior(cell.x, cell.y + 1);
    addExterior(cell.x - 1, cell.y);
  }

  const cells: SmartBrushMaskCell[] = [];
  for (let y = 0; y < bounds.height; y += 1) {
    for (let x = 0; x < bounds.width; x += 1) {
      const key = `${x}:${y}`;
      if (!boundary.has(key) && !exterior.has(key)) cells.push({ x, y });
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

function closedOrthogonalPath(path: SmartBrushMaskCell[]) {
  if (path.length < 3) return [];
  const dense: SmartBrushMaskCell[] = [];
  let finalSegmentStart = 0;
  for (let index = 0; index < path.length; index += 1) {
    if (index === path.length - 1) finalSegmentStart = Math.max(0, dense.length - 1);
    const segment = index === 0 ? [{ ...path[index] }] : orthogonalSmartBrushPathCells(path[index - 1], path[index]);
    for (const cell of segment) {
      const previous = dense[dense.length - 1];
      if (!previous || previous.x !== cell.x || previous.y !== cell.y) dense.push(cell);
    }
  }
  if (dense.length < 4) return [];

  let best: { area: number; path: SmartBrushMaskCell[] } | null = null;
  for (let contactIndex = finalSegmentStart; contactIndex < dense.length; contactIndex += 1) {
    const contact = dense[contactIndex];
    for (let priorIndex = 0; priorIndex < finalSegmentStart; priorIndex += 1) {
      const prior = dense[priorIndex];
      if (Math.max(Math.abs(contact.x - prior.x), Math.abs(contact.y - prior.y)) > 1) continue;
      const candidate = [
        ...dense.slice(priorIndex, contactIndex + 1),
        ...orthogonalSmartBrushPathCells(contact, prior).slice(1)
      ];
      const width = Math.max(...candidate.map((cell) => cell.x)) - Math.min(...candidate.map((cell) => cell.x));
      const height = Math.max(...candidate.map((cell) => cell.y)) - Math.min(...candidate.map((cell) => cell.y));
      if (width < 2 || height < 2) continue;
      const area = width * height;
      if (!best || area > best.area || (area === best.area && candidate.length > best.path.length)) {
        best = { area, path: candidate };
      }
    }
  }
  return best?.path ?? [];
}

function maskKey(cell: SmartBrushMaskCell) {
  return `${cell.x}:${cell.y}`;
}
