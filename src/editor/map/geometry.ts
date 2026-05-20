import { MapEntity, RandomLevel, SemanticEntity } from "../types";

export const MAP_CELLS = 90;

export type MapCell = { x: number; y: number; tile: number };

export function mapTileIndex(map: MapEntity, x: number, y: number) {
  const width = map.width || MAP_CELLS;
  const height = map.height || MAP_CELLS;
  return map.levelType === "dungeon" ? y * width + x : x * height + y;
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
  return {
    x: clampCell(Math.round((rect.left + rect.right) / 2)),
    y: clampCell(Math.round((rect.top + rect.bottom) / 2))
  };
}

export function rectArea(rect: RandomLevel["rects"][number]) {
  return Math.max(1, rect.right - rect.left + 1) * Math.max(1, rect.bottom - rect.top + 1);
}

export function numberSummary(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : null;
}
