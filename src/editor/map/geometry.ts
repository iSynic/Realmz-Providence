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

export function mapRecordTerrainFootprint(entity: SemanticEntity, map: MapEntity) {
  const pictId = numberSummary(entity, "pictId") ?? 0;
  const show = numberSummary(entity, "show") ?? 0;
  const level = numberSummary(entity, "level");
  const startX = numberSummary(entity, "startX");
  const startY = numberSummary(entity, "startY");
  const isDungeon = boolSummary(entity, "isDungeon");
  if (pictId !== 0 || show < 0 || level !== map.index || isDungeon !== (map.levelType === "dungeon") || startX == null || startY == null) {
    return null;
  }
  const tileSize = normalizedPlayerMapTileSize(numberSummary(entity, "iconSize") ?? 0);
  const columns = Math.ceil(320 / tileSize);
  const rows = Math.ceil(320 / tileSize);
  const left = Math.max(0, Math.min(MAP_CELLS, startX));
  const top = Math.max(0, Math.min(MAP_CELLS, startY));
  const rightEdge = Math.max(0, Math.min(MAP_CELLS, startX + columns));
  const bottomEdge = Math.max(0, Math.min(MAP_CELLS, startY + rows));
  if (rightEdge <= left || bottomEdge <= top) return null;
  return {
    anchorX: startX,
    anchorY: startY,
    left,
    top,
    right: rightEdge - 1,
    bottom: bottomEdge - 1,
    rightEdge,
    bottomEdge,
    width: rightEdge - left,
    height: bottomEdge - top,
    tileSize
  };
}

export function mapRecordContainsCell(entity: SemanticEntity, map: MapEntity, x: number, y: number) {
  const footprint = mapRecordTerrainFootprint(entity, map);
  return Boolean(footprint && x >= footprint.left && x <= footprint.right && y >= footprint.top && y <= footprint.bottom);
}

export function numberSummary(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : null;
}

export function boolSummary(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "boolean" ? value : null;
}

function normalizedPlayerMapTileSize(value: number) {
  if (value === 8 || value === 16 || value === 32) return value;
  if (value > 0 && value < 64) return Math.max(4, Math.min(32, Math.trunc(value)));
  return 8;
}

function clampCellEdge(value: number) {
  return Math.max(0, Math.min(MAP_CELLS, value));
}
