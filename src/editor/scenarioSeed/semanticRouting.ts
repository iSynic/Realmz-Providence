import { GENERATED_SMART_TERRAIN_PROFILES } from "../map/generatedSmartTerrainProfiles";
import { semanticRoadTile } from "../map/semanticRoads";
import { normalizeSmartTerrainTile } from "../map/smartTerrainTopology";
import type { ScenarioSeedMapOperation, ScenarioSeedPoint } from "../scenarioSeed";
import { addScenarioSeedDiagnostic } from "./compilerContext";
import type { ScenarioSeedMapOperationContext } from "./mapCompiler";
import { mapStorageTileIndex, setTile } from "./mapPaintingPrimitives";
import { deterministicHash, linePoints } from "./terrainGeometry";

const MAP_SIZE = 90;

export function applySemanticRoad(
  tiles: number[],
  operation: Extract<ScenarioSeedMapOperation, { kind: "semanticRoad" }>,
  levelType: ScenarioSeedMapOperationContext["levelType"]
) {
  const cells = new Map<string, ScenarioSeedPoint>();
  for (const path of operation.paths) {
    for (let index = 1; index < path.length; index++) {
      for (const point of linePoints(path[index - 1], path[index])) cells.set(`${point.x}:${point.y}`, point);
    }
  }
  applySemanticRoadCells(tiles, [...cells.values()], levelType);
}

export function applySemanticRoute(
  tiles: number[],
  operation: Extract<ScenarioSeedMapOperation, { kind: "semanticRoute" }>,
  mapContext: ScenarioSeedMapOperationContext
) {
  const cells = new Map<string, ScenarioSeedPoint>();
  for (const [connectionIndex, connection] of operation.connections.entries()) {
    for (let index = 1; index < connection.length; index++) {
      const start = mapContext.regions.get(connection[index - 1]);
      const end = mapContext.regions.get(connection[index]);
      if (!start || !end) continue;
      const route = terrainAwareRoute(
        tiles,
        start,
        end,
        operation.style ?? "natural",
        mapContext,
        `${connectionIndex}:${index}`
      );
      if (route.length === 0) {
        addScenarioSeedDiagnostic(
          mapContext.buildContext,
          "warning",
          "semantic-route-unreachable",
          `Map ${mapContext.mapSeed} cannot route from region "${connection[index - 1]}" to "${connection[index]}" without crossing blocked terrain.`,
          "map",
          mapContext.mapSeed
        );
        continue;
      }
      for (const cell of route) cells.set(`${cell.x}:${cell.y}`, cell);
    }
  }
  applySemanticRoadCells(tiles, [...cells.values()], mapContext.levelType);
}

function applySemanticRoadCells(
  tiles: number[],
  cells: ScenarioSeedPoint[],
  levelType: ScenarioSeedMapOperationContext["levelType"]
) {
  const uniqueCells = new Map(cells.map((cell) => [`${cell.x}:${cell.y}`, cell]));
  const cellKeys = new Set(uniqueCells.keys());
  for (const cell of [...uniqueCells.values()].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let mask = 0;
    if (cellKeys.has(`${cell.x}:${cell.y - 1}`)) mask |= 1;
    if (cellKeys.has(`${cell.x + 1}:${cell.y}`)) mask |= 2;
    if (cellKeys.has(`${cell.x}:${cell.y + 1}`)) mask |= 4;
    if (cellKeys.has(`${cell.x - 1}:${cell.y}`)) mask |= 8;
    const tile = semanticRoadTile(mask);
    if (tile !== null) setTile(tiles, cell.x, cell.y, tile, levelType);
  }
}

function terrainAwareRoute(
  tiles: number[],
  start: ScenarioSeedPoint,
  end: ScenarioSeedPoint,
  style: "direct" | "natural",
  mapContext: ScenarioSeedMapOperationContext,
  salt: string
) {
  const checkpoints = [start];
  const distance = Math.abs(end.x - start.x) + Math.abs(end.y - start.y);
  if (style === "natural" && distance >= 12) {
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    const fractions = distance >= 28 ? [1 / 3, 2 / 3] : [1 / 2];
    const offsetLimit = Math.min(4, Math.max(1, Math.floor(distance / 12)));
    for (const [checkpointIndex, fraction] of fractions.entries()) {
      const hash = deterministicHash(`${mapContext.mapSeed}:route:${salt}:${checkpointIndex}`);
      const magnitude = 1 + hash % offsetLimit;
      const offset = (Math.floor(hash / offsetLimit) % 2 === 0 ? 1 : -1) * magnitude;
      const candidate = {
        x: clampMapCoordinate(Math.round(start.x + (end.x - start.x) * fraction) + (horizontal ? 0 : offset)),
        y: clampMapCoordinate(Math.round(start.y + (end.y - start.y) * fraction) + (horizontal ? offset : 0))
      };
      checkpoints.push(nearestRouteCell(tiles, candidate, mapContext));
    }
  }
  checkpoints.push(end);
  const route: ScenarioSeedPoint[] = [];
  for (let index = 1; index < checkpoints.length; index++) {
    const segment = findTerrainRoute(tiles, checkpoints[index - 1], checkpoints[index], mapContext, `${salt}:${index}`);
    route.push(...(index === 1 ? segment : segment.slice(1)));
  }
  return route;
}

function findTerrainRoute(
  tiles: number[],
  start: ScenarioSeedPoint,
  end: ScenarioSeedPoint,
  mapContext: ScenarioSeedMapOperationContext,
  salt: string
) {
  type RouteDirection = "north" | "east" | "south" | "west" | "start";
  const startKey = `${start.x}:${start.y}:start`;
  const open = new Map<string, { point: ScenarioSeedPoint; direction: RouteDirection; score: number }>([
    [startKey, { point: start, direction: "start", score: 0 }]
  ]);
  const cameFrom = new Map<string, string>();
  const cost = new Map<string, number>([[startKey, 0]]);
  while (open.size > 0) {
    const [currentKey, currentEntry] = [...open.entries()].sort((a, b) => (
      a[1].score - b[1].score
      || deterministicHash(`${mapContext.mapSeed}:${salt}:${a[0]}`) - deterministicHash(`${mapContext.mapSeed}:${salt}:${b[0]}`)
    ))[0];
    open.delete(currentKey);
    if (currentEntry.point.x === end.x && currentEntry.point.y === end.y) {
      return reconstructRoute(cameFrom, currentKey);
    }
    for (const neighbor of cardinalNeighbors(currentEntry.point)) {
      if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= MAP_SIZE || neighbor.y >= MAP_SIZE) continue;
      const direction = routeDirection(currentEntry.point, neighbor);
      const neighborKey = `${neighbor.x}:${neighbor.y}:${direction}`;
      const endpoint = (neighbor.x === end.x && neighbor.y === end.y)
        || (neighbor.x === start.x && neighbor.y === start.y);
      const stepCost = routeCellCost(tiles, neighbor, mapContext, endpoint);
      if (!Number.isFinite(stepCost)) continue;
      const turnCost = currentEntry.direction !== "start" && currentEntry.direction !== direction ? 2.25 : 0;
      const nextCost = (cost.get(currentKey) ?? Number.POSITIVE_INFINITY) + stepCost + turnCost;
      if (nextCost >= (cost.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborKey, currentKey);
      cost.set(neighborKey, nextCost);
      const heuristic = Math.abs(end.x - neighbor.x) + Math.abs(end.y - neighbor.y);
      open.set(neighborKey, { point: neighbor, direction, score: nextCost + heuristic });
    }
  }
  return [];
}

function routeDirection(from: ScenarioSeedPoint, to: ScenarioSeedPoint): "north" | "east" | "south" | "west" {
  if (to.y < from.y) return "north";
  if (to.x > from.x) return "east";
  if (to.y > from.y) return "south";
  return "west";
}

function routeCellCost(
  tiles: number[],
  point: ScenarioSeedPoint,
  mapContext: ScenarioSeedMapOperationContext,
  endpoint: boolean
) {
  if (endpoint) return 1;
  const profile = GENERATED_SMART_TERRAIN_PROFILES.find((entry) => entry.landlook === mapContext.landlook);
  const tile = normalizeSmartTerrainTile(tiles[mapStorageTileIndex(mapContext.levelType, point.x, point.y)]);
  if (tile === null) return 7;
  if (profile?.presets.water.family.includes(tile) || profile?.presets.mountains.family.includes(tile)) {
    return Number.POSITIVE_INFINITY;
  }
  if (profile?.presets.forest.family.includes(tile)) return 3;
  if (tile >= 130 && tile <= 146) return 0.35;
  return 1;
}

function nearestRouteCell(
  tiles: number[],
  candidate: ScenarioSeedPoint,
  mapContext: ScenarioSeedMapOperationContext
) {
  for (let radius = 0; radius <= 8; radius++) {
    const candidates: ScenarioSeedPoint[] = [];
    for (let y = candidate.y - radius; y <= candidate.y + radius; y++) {
      for (let x = candidate.x - radius; x <= candidate.x + radius; x++) {
        if (
          Math.max(Math.abs(x - candidate.x), Math.abs(y - candidate.y)) !== radius
          || x < 0
          || y < 0
          || x >= MAP_SIZE
          || y >= MAP_SIZE
        ) continue;
        candidates.push({ x, y });
      }
    }
    const passable = candidates.find((point) => Number.isFinite(routeCellCost(tiles, point, mapContext, false)));
    if (passable) return passable;
  }
  return candidate;
}

function reconstructRoute(cameFrom: Map<string, string>, endKey: string) {
  const route: ScenarioSeedPoint[] = [];
  let key: string | undefined = endKey;
  while (key) {
    const [x, y] = key.split(":").slice(0, 2).map(Number);
    route.push({ x, y });
    key = cameFrom.get(key);
  }
  return route.reverse();
}

function cardinalNeighbors(point: ScenarioSeedPoint) {
  return [
    { x: point.x, y: point.y - 1 },
    { x: point.x + 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x - 1, y: point.y }
  ];
}

function clampMapCoordinate(value: number) {
  return Math.max(1, Math.min(MAP_SIZE - 2, value));
}
