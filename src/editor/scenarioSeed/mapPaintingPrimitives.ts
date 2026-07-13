import type { LevelType } from "../types";
import type { ScenarioSeedPoint } from "./contracts";

const MAP_SIZE = 90;

export function drawPath(
  tiles: number[],
  points: ScenarioSeedPoint[],
  tile: number,
  width: number,
  levelType: LevelType
) {
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const next = points[index];
    drawLine(tiles, previous.x, previous.y, next.x, next.y, tile, width, levelType);
  }
}

export function drawLine(
  tiles: number[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tile: number,
  width: number,
  levelType: LevelType
) {
  let x = x1;
  let y = y1;
  const dx = Math.abs(x2 - x1);
  const sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1);
  const sy = y1 < y2 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    paintSquare(tiles, x, y, tile, width, levelType);
    if (x === x2 && y === y2) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
  }
}

export function setTile(tiles: number[], x: number, y: number, tile: number, levelType: LevelType) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return;
  tiles[mapStorageTileIndex(levelType, x, y)] = tile;
}

export function mapStorageTileIndex(levelType: LevelType, x: number, y: number) {
  return levelType === "dungeon" ? y * MAP_SIZE + x : x * MAP_SIZE + y;
}

function paintSquare(
  tiles: number[],
  centerX: number,
  centerY: number,
  tile: number,
  width: number,
  levelType: LevelType
) {
  const before = Math.floor((width - 1) / 2);
  const after = width - before - 1;
  for (let y = centerY - before; y <= centerY + after; y++) {
    for (let x = centerX - before; x <= centerX + after; x++) setTile(tiles, x, y, tile, levelType);
  }
}
