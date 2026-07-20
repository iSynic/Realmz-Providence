import type { ScenarioSeedPoint, ScenarioSeedTerrainGeometry } from "./contracts";
import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";

const MAP_SIZE = REALMZ_NATIVE_LAYOUT.mapSize;

export function terrainGeometryCells(
  geometry: ScenarioSeedTerrainGeometry,
  mapSeed = "map",
  salt = "terrain"
) {
  const cells = new Map<string, ScenarioSeedPoint>();
  const addDisc = (centerX: number, centerY: number, width: number) => {
    const radius = Math.max(0, (width - 1) / 2);
    const extent = Math.ceil(radius);
    for (let y = centerY - extent; y <= centerY + extent; y++) {
      for (let x = centerX - extent; x <= centerX + extent; x++) {
        if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) continue;
        if (Math.hypot(x - centerX, y - centerY) <= radius + 0.35) cells.set(`${x}:${y}`, { x, y });
      }
    }
  };
  if (geometry.kind === "rect") {
    for (let y = geometry.y; y < geometry.y + geometry.height; y++) {
      for (let x = geometry.x; x < geometry.x + geometry.width; x++) cells.set(`${x}:${y}`, { x, y });
    }
  } else if (geometry.kind === "path") {
    for (let index = 1; index < geometry.points.length; index++) {
      for (const point of linePoints(geometry.points[index - 1], geometry.points[index])) {
        addDisc(point.x, point.y, geometry.width ?? 1);
      }
    }
  } else {
    const roughness = (geometry.roughness ?? 35) / 100;
    const sectors = 24;
    const radialNoise = Array.from({ length: sectors }, (_, index) => {
      const hash = deterministicHash(`${mapSeed}:${salt}:blob:${index}`);
      return ((hash % 2001) / 1000 - 1) * roughness * 0.22;
    });
    for (let y = geometry.y - geometry.radiusY; y <= geometry.y + geometry.radiusY; y++) {
      for (let x = geometry.x - geometry.radiusX; x <= geometry.x + geometry.radiusX; x++) {
        if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) continue;
        const dx = (x - geometry.x) / geometry.radiusX;
        const dy = (y - geometry.y) / geometry.radiusY;
        const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
        const position = angle / (Math.PI * 2) * sectors;
        const first = Math.floor(position) % sectors;
        const second = (first + 1) % sectors;
        const blend = position - Math.floor(position);
        const smoothBlend = blend * blend * (3 - 2 * blend);
        const boundary = 1 + radialNoise[first] * (1 - smoothBlend) + radialNoise[second] * smoothBlend;
        if (Math.hypot(dx, dy) <= boundary) cells.set(`${x}:${y}`, { x, y });
      }
    }
    smoothBlobMask(cells, geometry);
  }
  return [...cells.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

export function deterministicHash(source: string) {
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

function smoothBlobMask(
  cells: Map<string, ScenarioSeedPoint>,
  geometry: Extract<ScenarioSeedTerrainGeometry, { kind: "blob" }>
) {
  const next = new Map(cells);
  const minX = Math.max(0, geometry.x - geometry.radiusX);
  const maxX = Math.min(MAP_SIZE - 1, geometry.x + geometry.radiusX);
  const minY = Math.max(0, geometry.y - geometry.radiusY);
  const maxY = Math.min(MAP_SIZE - 1, geometry.y + geometry.radiusY);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx !== 0 || dy !== 0) && cells.has(`${x + dx}:${y + dy}`)) neighbors += 1;
        }
      }
      const key = `${x}:${y}`;
      if (cells.has(key) && neighbors <= 3) next.delete(key);
      else if (!cells.has(key) && neighbors >= 5) next.set(key, { x, y });
    }
  }
  cells.clear();
  for (const [key, cell] of next) cells.set(key, cell);
}

export function linePoints(start: ScenarioSeedPoint, end: ScenarioSeedPoint) {
  const points: ScenarioSeedPoint[] = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const sx = start.x < end.x ? 1 : -1;
  const dy = -Math.abs(end.y - start.y);
  const sy = start.y < end.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push({ x, y });
    if (x === end.x && y === end.y) return points;
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
