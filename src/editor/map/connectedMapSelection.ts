import type { MapEntity, TileAttributeFlag, TileAttributeProfile, TilesetAsset } from "../types";
import { MAP_CELLS, type MapCell, tileValueAt } from "./geometry";
import { classifyTileValue, type TileValueMetadata } from "./tileMetadata";
import { growMapCells, shrinkMapCells, type MapCellBounds } from "./mapCellShapes";

export type ConnectedTileMatchMode = "exact" | "semantic-family" | "behavior";

export type ConnectedCellSelection = {
  anchor: { x: number; y: number };
  cells: Array<{ x: number; y: number }>;
  matchMode: ConnectedTileMatchMode;
};

export type ConnectedSelectionOperation = "replace" | "add" | "subtract";
export type ConnectedSelectionShapeOperation = "grow" | "shrink";

export type ConnectedTileMatchOptions = {
  mode: ConnectedTileMatchMode;
  tileset: TilesetAsset | null;
  attributes?: TileAttributeProfile[];
};

export type ConnectedMapCellMatcher = (candidate: MapCell, anchor: MapCell) => boolean;

const BEHAVIOR_FLAGS = new Set<TileAttributeFlag>([
  "walkable",
  "solid",
  "path",
  "shore",
  "boat-required",
  "fly-float-required",
  "blocks-los",
  "forest",
  "combat-build"
]);

export function collectConnectedMapCells(
  map: MapEntity,
  start: { x: number; y: number },
  matches: ConnectedMapCellMatcher
): MapCell[] {
  const width = map.width || MAP_CELLS;
  const height = map.height || MAP_CELLS;
  if (!isMapCoordinate(start.x, start.y, width, height)) return [];

  const anchor = { ...start, tile: tileValueAt(map, start.x, start.y) };
  const queue: Array<{ x: number; y: number }> = [start];
  const visited = new Uint8Array(width * height);
  const cells: MapCell[] = [];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const visitIndex = current.y * width + current.x;
    if (visited[visitIndex]) continue;
    visited[visitIndex] = 1;

    const candidate = { ...current, tile: tileValueAt(map, current.x, current.y) };
    if (!matches(candidate, anchor)) continue;

    cells.push(candidate);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        if (offsetX === 0 && offsetY === 0) continue;
        enqueueNeighbor(queue, current.x + offsetX, current.y + offsetY, width, height);
      }
    }
  }

  return cells.sort((left, right) => left.y - right.y || left.x - right.x);
}

export function connectedMapCellsByTile(
  map: MapEntity,
  start: { x: number; y: number },
  options: ConnectedTileMatchOptions
): MapCell[] {
  if (options.mode === "exact") {
    return collectConnectedMapCells(map, start, (candidate, anchor) => candidate.tile === anchor.tile);
  }

  const metadata = new Map<number, TileValueMetadata>();
  const profileFor = (tile: number) => {
    const cached = metadata.get(tile);
    if (cached) return cached;
    const profile = classifyTileValue(tile, options.tileset, options.attributes ?? []);
    metadata.set(tile, profile);
    return profile;
  };

  return collectConnectedMapCells(map, start, (candidate, anchor) => {
    const anchorProfile = profileFor(anchor.tile);
    const candidateProfile = profileFor(candidate.tile);
    if (options.mode === "semantic-family") {
      const anchorFamily = semanticFamily(anchorProfile);
      return anchorFamily === null
        ? candidate.tile === anchor.tile
        : semanticFamily(candidateProfile) === anchorFamily;
    }

    const anchorBehavior = behaviorSignature(anchorProfile);
    return anchorBehavior === null
      ? candidate.tile === anchor.tile
      : behaviorSignature(candidateProfile) === anchorBehavior;
  });
}

export function updateConnectedCellSelection(
  current: ConnectedCellSelection | null,
  component: Array<{ x: number; y: number }>,
  anchor: { x: number; y: number },
  matchMode: ConnectedTileMatchMode,
  operation: ConnectedSelectionOperation
): ConnectedCellSelection | null {
  const cells = operation === "replace"
    ? new Map<string, { x: number; y: number }>()
    : new Map((current?.cells ?? []).map((cell) => [cellKey(cell), cell]));

  for (const cell of component) {
    const key = cellKey(cell);
    if (operation === "subtract") cells.delete(key);
    else cells.set(key, { x: cell.x, y: cell.y });
  }

  const ordered = [...cells.values()].sort((left, right) => left.y - right.y || left.x - right.x);
  if (ordered.length === 0) return null;
  return { anchor, cells: ordered, matchMode };
}

export function reshapeConnectedCellSelection(
  current: ConnectedCellSelection | null,
  operation: ConnectedSelectionShapeOperation,
  bounds: MapCellBounds
): ConnectedCellSelection | null {
  if (!current) return null;
  const cells = operation === "grow"
    ? growMapCells(current.cells, bounds)
    : shrinkMapCells(current.cells, bounds);
  if (cells.length === 0) return null;
  const anchor = cells.some((cell) => cell.x === current.anchor.x && cell.y === current.anchor.y)
    ? current.anchor
    : cells[0];
  return { ...current, anchor, cells };
}

function semanticFamily(metadata: TileValueMetadata) {
  if (metadata.kind !== "standard-atlas") return null;
  const category = metadata.visual?.category ?? null;
  return category === "uncertain" ? null : category;
}

function behaviorSignature(metadata: TileValueMetadata) {
  const flags = metadata.attributeFlags
    .filter((flag) => BEHAVIOR_FLAGS.has(flag))
    .sort();
  return flags.length ? flags.join("|") : null;
}

function enqueueNeighbor(
  queue: Array<{ x: number; y: number }>,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (isMapCoordinate(x, y, width, height)) queue.push({ x, y });
}

function isMapCoordinate(x: number, y: number, width: number, height: number) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
}

function cellKey(cell: { x: number; y: number }) {
  return `${cell.x}:${cell.y}`;
}
