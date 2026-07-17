export type MapShapeCell = { x: number; y: number };
export type MapCellBounds = { width: number; height: number };
export type MapShapeFill = "outline" | "filled";
export type MapGeometryShape = "line" | "rectangle" | "ellipse";
export type MapSelectionDrawMode = "area" | MapGeometryShape;
export type SmartBrushDrawMode = "freehand" | MapGeometryShape;

const ORTHOGONAL_OFFSETS = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 }
] as const;

export function mapLineCells(
  start: MapShapeCell,
  end: MapShapeCell,
  bounds: MapCellBounds
) {
  if (!validBounds(bounds)) return [];
  const cells: MapShapeCell[] = [{ ...start }];
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

  return normalizeMapShapeCells(cells, bounds);
}

export function mapRectangleCells(
  start: MapShapeCell,
  end: MapShapeCell,
  fill: MapShapeFill,
  bounds: MapCellBounds
) {
  if (!validBounds(bounds)) return [];
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  const cells: MapShapeCell[] = [];

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (fill === "filled" || x === left || x === right || y === top || y === bottom) {
        cells.push({ x, y });
      }
    }
  }
  return normalizeMapShapeCells(cells, bounds);
}

export function mapEllipseCells(
  start: MapShapeCell,
  end: MapShapeCell,
  fill: MapShapeFill,
  bounds: MapCellBounds
) {
  if (!validBounds(bounds)) return [];
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  if (left === right || top === bottom) return mapLineCells({ x: left, y: top }, { x: right, y: bottom }, bounds);

  const cells: MapShapeCell[] = [];
  const clippedLeft = Math.max(0, left);
  const clippedRight = Math.min(bounds.width - 1, right);
  const clippedTop = Math.max(0, top);
  const clippedBottom = Math.min(bounds.height - 1, bottom);
  for (let y = clippedTop; y <= clippedBottom; y += 1) {
    for (let x = clippedLeft; x <= clippedRight; x += 1) {
      if (!ellipseContains(x, y, left, right, top, bottom)) continue;
      if (fill === "filled" || ORTHOGONAL_OFFSETS.some((offset) => (
        !ellipseContains(x + offset.x, y + offset.y, left, right, top, bottom)
      ))) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

export function mapGeometryCells(
  shape: MapGeometryShape,
  start: MapShapeCell,
  end: MapShapeCell,
  fill: MapShapeFill,
  bounds: MapCellBounds
) {
  if (shape === "line") return mapLineCells(start, end, bounds);
  if (shape === "rectangle") return mapRectangleCells(start, end, fill, bounds);
  return mapEllipseCells(start, end, fill, bounds);
}

export function growMapCells(cells: ReadonlyArray<MapShapeCell>, bounds: MapCellBounds) {
  const normalized = normalizeMapShapeCells(cells, bounds);
  return normalizeMapShapeCells(normalized.flatMap((cell) => [
    cell,
    ...ORTHOGONAL_OFFSETS.map((offset) => ({ x: cell.x + offset.x, y: cell.y + offset.y }))
  ]), bounds);
}

export function shrinkMapCells(cells: ReadonlyArray<MapShapeCell>, bounds: MapCellBounds) {
  const normalized = normalizeMapShapeCells(cells, bounds);
  const selected = new Set(normalized.map(cellKey));
  return normalized.filter((cell) => ORTHOGONAL_OFFSETS.every((offset) => (
    selected.has(`${cell.x + offset.x}:${cell.y + offset.y}`)
  )));
}

export function normalizeMapShapeCells(
  cells: ReadonlyArray<MapShapeCell>,
  bounds: MapCellBounds
) {
  if (!validBounds(bounds)) return [];
  const unique = new Map<string, MapShapeCell>();
  for (const cell of cells) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) continue;
    if (cell.x < 0 || cell.y < 0 || cell.x >= bounds.width || cell.y >= bounds.height) continue;
    unique.set(cellKey(cell), { x: cell.x, y: cell.y });
  }
  return [...unique.values()].sort((left, right) => left.y - right.y || left.x - right.x);
}

function ellipseContains(
  x: number,
  y: number,
  left: number,
  right: number,
  top: number,
  bottom: number
) {
  const radiusX = (right - left + 1) / 2;
  const radiusY = (bottom - top + 1) / 2;
  const centerX = left + radiusX;
  const centerY = top + radiusY;
  const normalizedX = (x + 0.5 - centerX) / radiusX;
  const normalizedY = (y + 0.5 - centerY) / radiusY;
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1 + Number.EPSILON;
}

function validBounds(bounds: MapCellBounds) {
  return Number.isInteger(bounds.width) && Number.isInteger(bounds.height) && bounds.width > 0 && bounds.height > 0;
}

function cellKey(cell: MapShapeCell) {
  return `${cell.x}:${cell.y}`;
}
