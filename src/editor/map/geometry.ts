import { MapEntity, RandomLevel, SemanticEntity } from "../types";

export const MAP_CELLS = 90;

export type MapCell = { x: number; y: number; tile: number };

export function mapTileIndex(map: MapEntity, x: number, y: number) {
  const width = map.width || MAP_CELLS;
  const height = map.height || MAP_CELLS;
  return map.levelType === "dungeon" ? y * width + x : x * height + y;
}

export function mapCellFromTileIndex(map: MapEntity, index: number) {
  const width = map.width || MAP_CELLS;
  const height = map.height || MAP_CELLS;
  return map.levelType === "dungeon"
    ? { x: index % width, y: Math.floor(index / width) }
    : { x: Math.floor(index / height), y: index % height };
}

export function tileValueAt(map: MapEntity, x: number, y: number) {
  return map.tiles[mapTileIndex(map, x, y)] ?? 0;
}

export function cellFromCanvasPoint(clientX: number, clientY: number, rect: DOMRect) {
  const x = clampCell(Math.floor(((clientX - rect.left) / rect.width) * MAP_CELLS));
  const y = clampCell(Math.floor(((clientY - rect.top) / rect.height) * MAP_CELLS));
  return { x, y };
}

export function cellScrollTarget(cell: { x: number; y: number }, canvasCssSize: number) {
  return {
    x: ((cell.x + 0.5) / MAP_CELLS) * canvasCssSize,
    y: ((cell.y + 0.5) / MAP_CELLS) * canvasCssSize
  };
}

export function clampCell(value: number) {
  return Math.max(0, Math.min(MAP_CELLS - 1, value));
}

export function clampScroll(value: number, max: number) {
  return Math.max(0, Math.min(Math.max(0, max), value));
}

export function randomRectEntityId(map: MapEntity, rectIndex: number) {
  return `random:${map.levelType}:${map.index}:${rectIndex}`;
}

export function rectCenter(rect: RandomLevel["rects"][number]) {
  const bounds = randomRectCellBounds(rect);
  return {
    x: clampCell(Math.round((bounds.left + bounds.right) / 2)),
    y: clampCell(Math.round((bounds.top + bounds.bottom) / 2))
  };
}

export function rectArea(rect: RandomLevel["rects"][number]) {
  const bounds = randomRectCellBounds(rect);
  return bounds.width * bounds.height;
}

export function randomRectCellBounds(rect: RandomLevel["rects"][number]) {
  const left = clampCell(rect.left);
  const top = clampCell(rect.top);
  const rightEdge = clampCellEdge(rect.right);
  const bottomEdge = clampCellEdge(rect.bottom);
  return {
    left,
    top,
    right: clampCell(Math.max(left, rightEdge - 1)),
    bottom: clampCell(Math.max(top, bottomEdge - 1)),
    width: Math.max(0, rightEdge - left),
    height: Math.max(0, bottomEdge - top)
  };
}

export function randomRectContainsCell(rect: RandomLevel["rects"][number], x: number, y: number) {
  const bounds = randomRectCellBounds(rect);
  if (bounds.width <= 0 || bounds.height <= 0) return false;
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

export function numberSummary(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : null;
}

function clampCellEdge(value: number) {
  return Math.max(0, Math.min(MAP_CELLS, value));
}
