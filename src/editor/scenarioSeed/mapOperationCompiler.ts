import { landCellSecretState, setLandCellSecretState } from "../map/actionPointMarkers";
import { setDungeonCellFlags } from "../map/dungeonCellFlags";
import { GENERATED_SMART_TERRAIN_PROFILES } from "../map/generatedSmartTerrainProfiles";
import { resolveNamedLandStamp } from "../map/namedLandStamps";
import { resolveNamedLandTile } from "../map/namedLandTiles";
import { supportsSemanticRoads } from "../map/semanticRoads";
import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";
import {
  defaultStockCombatClearingTile,
  defaultStockHiddenWalkableTile
} from "../map/secrets";
import { normalizeSmartTerrainTile } from "../map/smartTerrainTopology";
import type { ScenarioSeedMapOperation, ScenarioSeedPoint } from "./contracts";
import { addScenarioSeedDiagnostic } from "./compilerContext";
import { castleRoomDoorPoint, type ScenarioSeedMapOperationContext } from "./mapCompiler";
import { drawLine, drawPath, mapStorageTileIndex, setTile } from "./mapPaintingPrimitives";
import { applyNaturalScatter } from "./naturalScatter";
import { applySemanticRoad, applySemanticRoute } from "./semanticRouting";
import { applyTerrainCells, applyTerrainGroup } from "./terrainPainter";
import { terrainGeometryCells } from "./terrainGeometry";

const MAP_SIZE = REALMZ_NATIVE_LAYOUT.mapSize;

export function applyScenarioSeedMapOperation(
  tiles: number[],
  operation: ScenarioSeedMapOperation,
  mapContext: ScenarioSeedMapOperationContext
) {
  if (operation.kind === "fill") {
    tiles.fill(operation.tile);
    return;
  }
  if (operation.kind === "rect") {
    for (let y = operation.y; y < operation.y + operation.height; y++) {
      for (let x = operation.x; x < operation.x + operation.width; x++) {
        setTile(tiles, x, y, operation.tile, mapContext.levelType);
      }
    }
    return;
  }
  if (operation.kind === "line") {
    drawLine(tiles, operation.x1, operation.y1, operation.x2, operation.y2, operation.tile, 1, mapContext.levelType);
    return;
  }
  if (operation.kind === "path") {
    drawPath(tiles, operation.points, operation.tile, 1, mapContext.levelType);
    return;
  }
  if (operation.kind === "border") {
    const thickness = operation.thickness ?? 1;
    for (let inset = 0; inset < thickness; inset++) {
      const left = operation.x + inset;
      const top = operation.y + inset;
      const right = operation.x + operation.width - inset - 1;
      const bottom = operation.y + operation.height - inset - 1;
      drawLine(tiles, left, top, right, top, operation.tile, 1, mapContext.levelType);
      drawLine(tiles, left, bottom, right, bottom, operation.tile, 1, mapContext.levelType);
      drawLine(tiles, left, top, left, bottom, operation.tile, 1, mapContext.levelType);
      drawLine(tiles, right, top, right, bottom, operation.tile, 1, mapContext.levelType);
    }
    return;
  }
  if (operation.kind === "room") {
    for (let y = operation.y; y < operation.y + operation.height; y++) {
      for (let x = operation.x; x < operation.x + operation.width; x++) {
        setTile(tiles, x, y, operation.floorTile, mapContext.levelType);
      }
    }
    applyScenarioSeedMapOperation(tiles, {
      kind: "border",
      x: operation.x,
      y: operation.y,
      width: operation.width,
      height: operation.height,
      tile: operation.wallTile
    }, mapContext);
    for (const door of operation.doors ?? []) {
      const x = door.side === "west"
        ? operation.x
        : door.side === "east"
          ? operation.x + operation.width - 1
          : operation.x + door.offset;
      const y = door.side === "north"
        ? operation.y
        : door.side === "south"
          ? operation.y + operation.height - 1
          : operation.y + door.offset;
      setTile(tiles, x, y, door.tile, mapContext.levelType);
    }
    return;
  }
  if (operation.kind === "road" || operation.kind === "river") {
    drawPath(tiles, operation.points, operation.tile, operation.width ?? 1, mapContext.levelType);
    return;
  }
  if (operation.kind === "semanticRoad") {
    applySemanticRoad(tiles, operation, mapContext.levelType);
    return;
  }
  if (operation.kind === "semanticRoute") {
    applySemanticRoute(tiles, operation, mapContext);
    return;
  }
  if (operation.kind === "stamp") {
    for (let row = 0; row < operation.tiles.length; row++) {
      for (let column = 0; column < operation.tiles[row].length; column++) {
        setTile(tiles, operation.x + column, operation.y + row, operation.tiles[row][column], mapContext.levelType);
      }
    }
    return;
  }
  if (operation.kind === "namedTile") {
    const tile = resolveNamedLandTile(mapContext.landlook, operation.name, operation.variant ?? 1);
    const existing = normalizeSmartTerrainTile(
      tiles[mapStorageTileIndex(mapContext.levelType, operation.x, operation.y)]
    );
    if (operation.name === "boat") {
      const profile = GENERATED_SMART_TERRAIN_PROFILES.find((entry) => entry.landlook === mapContext.landlook);
      if (existing === null || !profile?.presets.water.family.includes(existing)) {
        addScenarioSeedDiagnostic(
          mapContext.buildContext,
          "warning",
          "boat-off-water",
          `Map ${mapContext.mapSeed} places a boat at (${operation.x}, ${operation.y}) outside reviewed water terrain.`,
          "map",
          mapContext.mapSeed
        );
      }
    }
    if (operation.name === "grave" && existing !== null && existing >= 130 && existing <= 146) {
      addScenarioSeedDiagnostic(
        mapContext.buildContext,
        "warning",
        "feature-over-road",
        `Map ${mapContext.mapSeed} places a grave at (${operation.x}, ${operation.y}) over an authored road; place it beside the route instead.`,
        "map",
        mapContext.mapSeed
      );
    }
    if (tile !== null) setTile(tiles, operation.x, operation.y, tile, mapContext.levelType);
    return;
  }
  if (operation.kind === "namedStamp") {
    const stamp = resolveNamedLandStamp(mapContext.landlook, operation.name, operation.variant ?? 1);
    if (stamp) {
      for (const cell of stamp.cells) {
        setTile(tiles, operation.x + cell.dx, operation.y + cell.dy, cell.tile, mapContext.levelType);
      }
    }
    return;
  }
  if (operation.kind === "terrainGroup") {
    applyTerrainGroup(tiles, operation, mapContext);
    return;
  }
  if (operation.kind === "naturalScatter") {
    applyNaturalScatter(tiles, operation, mapContext);
    return;
  }
  if (operation.kind === "landmass") {
    applyLandmass(tiles, operation, mapContext);
    return;
  }
  if (operation.kind === "castleRoom") {
    applyCastleRoom(tiles, operation, mapContext);
    return;
  }
  if (operation.kind === "landSecret") {
    const index = mapStorageTileIndex(mapContext.levelType, operation.x, operation.y);
    tiles[index] = setLandCellSecretState(tiles[index], operation.state, false);
    return;
  }
  if (operation.kind === "hiddenWalkable") {
    const index = mapStorageTileIndex(mapContext.levelType, operation.x, operation.y);
    const profile = GENERATED_SMART_TERRAIN_PROFILES.find((entry) => entry.landlook === mapContext.landlook);
    const existing = normalizeSmartTerrainTile(tiles[index]);
    const structural = existing !== null && (
      profile?.presets.mountains.family.includes(existing)
      || profile?.presets.forest.family.includes(existing)
    );
    if (profile && supportsSemanticRoads(mapContext.landlook) && !structural) {
      addScenarioSeedDiagnostic(
        mapContext.buildContext,
        "warning",
        "hidden-walkable-isolated",
        `Map ${mapContext.mapSeed} places hidden-walkable terrain at (${operation.x}, ${operation.y}) outside a reviewed mountain or forest structure.`,
        "map",
        mapContext.mapSeed
      );
    }
    tiles[index] = setLandCellSecretState(
      operation.tile ?? defaultStockHiddenWalkableTile(mapContext.landlook) ?? 169,
      landCellSecretState(tiles[index]),
      false
    );
    return;
  }
  if (operation.kind === "combatClearing") {
    const index = mapStorageTileIndex(mapContext.levelType, operation.x, operation.y);
    tiles[index] = setLandCellSecretState(
      operation.tile ?? defaultStockCombatClearingTile(mapContext.landlook) ?? 180,
      landCellSecretState(tiles[index]),
      false
    );
    return;
  }
  if (operation.kind === "dungeonPassage") {
    const directions = new Set(operation.directions);
    const index = mapStorageTileIndex(mapContext.levelType, operation.x, operation.y);
    tiles[index] = setDungeonCellFlags(tiles[index], {
      allowMoveNorth: directions.has("north"),
      allowMoveEast: directions.has("east"),
      allowMoveSouth: directions.has("south"),
      allowMoveWest: directions.has("west")
    });
  }
}

function applyLandmass(
  tiles: number[],
  operation: Extract<ScenarioSeedMapOperation, { kind: "landmass" }>,
  mapContext: ScenarioSeedMapOperationContext
) {
  const landCells = terrainGeometryCells({
    kind: "blob",
    x: operation.x,
    y: operation.y,
    radiusX: operation.radiusX,
    radiusY: operation.radiusY,
    roughness: operation.roughness
  }, mapContext.mapSeed, "landmass");
  const landMask = new Set(landCells.map((cell) => `${cell.x}:${cell.y}`));
  const waterCells: ScenarioSeedPoint[] = [];
  for (let y = 0; y < MAP_SIZE; y++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      if (!landMask.has(`${x}:${y}`)) waterCells.push({ x, y });
    }
  }
  applyTerrainCells(tiles, waterCells, "water", mapContext);
  const waterCenter = GENERATED_SMART_TERRAIN_PROFILES
    .find((entry) => entry.landlook === mapContext.landlook)?.presets.water.center[0] ?? 60;
  for (let inset = 0; inset < 2; inset++) {
    for (let coordinate = 0; coordinate < MAP_SIZE; coordinate++) {
      setTile(tiles, coordinate, inset, waterCenter, mapContext.levelType);
      setTile(tiles, coordinate, MAP_SIZE - 1 - inset, waterCenter, mapContext.levelType);
      setTile(tiles, inset, coordinate, waterCenter, mapContext.levelType);
      setTile(tiles, MAP_SIZE - 1 - inset, coordinate, waterCenter, mapContext.levelType);
    }
  }
}

function applyCastleRoom(
  tiles: number[],
  operation: Extract<ScenarioSeedMapOperation, { kind: "castleRoom" }>,
  mapContext: ScenarioSeedMapOperationContext
) {
  const floor = resolveNamedLandTile(mapContext.landlook, "open-ground", operation.floorVariant ?? 1) ?? 111;
  const doorNorthSouth = resolveNamedLandTile(mapContext.landlook, "wooden-door-north-south") ?? 76;
  const doorEastWest = resolveNamedLandTile(mapContext.landlook, "wooden-door-east-west") ?? 77;
  const walls = { north: 65, east: 39, south: 38, west: 64 } as const;
  const corners = { northWest: 36, northEast: 37, southWest: 34, southEast: 35 } as const;
  for (let y = operation.y + 1; y < operation.y + operation.height - 1; y++) {
    for (let x = operation.x + 1; x < operation.x + operation.width - 1; x++) {
      setTile(tiles, x, y, floor, mapContext.levelType);
    }
  }
  drawLine(tiles, operation.x, operation.y, operation.x + operation.width - 1, operation.y, walls.north, 1, mapContext.levelType);
  drawLine(tiles, operation.x, operation.y + operation.height - 1, operation.x + operation.width - 1, operation.y + operation.height - 1, walls.south, 1, mapContext.levelType);
  drawLine(tiles, operation.x, operation.y, operation.x, operation.y + operation.height - 1, walls.west, 1, mapContext.levelType);
  drawLine(tiles, operation.x + operation.width - 1, operation.y, operation.x + operation.width - 1, operation.y + operation.height - 1, walls.east, 1, mapContext.levelType);
  setTile(tiles, operation.x, operation.y, corners.northWest, mapContext.levelType);
  setTile(tiles, operation.x + operation.width - 1, operation.y, corners.northEast, mapContext.levelType);
  setTile(tiles, operation.x, operation.y + operation.height - 1, corners.southWest, mapContext.levelType);
  setTile(tiles, operation.x + operation.width - 1, operation.y + operation.height - 1, corners.southEast, mapContext.levelType);
  for (const door of operation.doors ?? []) {
    const { x, y } = castleRoomDoorPoint(operation, door);
    setTile(
      tiles,
      x,
      y,
      door.side === "north" || door.side === "south" ? doorEastWest : doorNorthSouth,
      mapContext.levelType
    );
  }
}
