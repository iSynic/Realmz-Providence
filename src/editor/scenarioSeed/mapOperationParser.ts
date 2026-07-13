import { isScenarioSeedNamedStampName } from "../map/namedLandStamps";
import { isScenarioSeedNamedTileName } from "../map/namedLandTiles";
import type { LevelType } from "../types";
import type {
  ScenarioSeedCastleRoomDoor,
  ScenarioSeedCombatClearingTile,
  ScenarioSeedDungeonDirection,
  ScenarioSeedHiddenWalkableTile,
  ScenarioSeedMapOperation,
  ScenarioSeedRegion,
  ScenarioSeedRoomDoor,
  ScenarioSeedTerrainGeometry
} from "./contracts";
import {
  allowKeys,
  checkIntegerRange,
  optionalInteger,
  optionalString,
  parseArray,
  parseIntegerArray,
  requireInteger,
  requireObject,
  requireString,
  type ParseContext
} from "./parsePrimitives";

export const MAP_SIZE = 90;
export const MAP_TILE_MIN = -32768;
export const MAP_TILE_MAX = 32767;

export function parseRegion(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRegion | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "x", "y", "width", "height"], ctx);
  const key = requireString(value.key, `${path}.key`, ctx);
  const x = requireInteger(value.x, `${path}.x`, ctx);
  const y = requireInteger(value.y, `${path}.y`, ctx);
  const width = optionalInteger(value.width, `${path}.width`, ctx);
  const height = optionalInteger(value.height, `${path}.height`, ctx);
  checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
  checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
  checkIntegerRange(width, `${path}.width`, 1, 90, ctx);
  checkIntegerRange(height, `${path}.height`, 1, 90, ctx);
  return { key: key ?? "", x: x ?? 0, y: y ?? 0, ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}) };
}

export function parseMapOperation(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMapOperation | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const kind = requireString(value.kind, `${path}.kind`, ctx);
  if (kind === "fill") {
    allowKeys(value, path, ["kind", "tile"], ctx);
    return { kind, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0 };
  }
  if (kind === "rect") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height", "tile"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 1, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 1, 90, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    return { kind, x: x ?? 0, y: y ?? 0, width: width ?? 1, height: height ?? 1, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0 };
  }
  if (kind === "line") {
    allowKeys(value, path, ["kind", "x1", "y1", "x2", "y2", "tile"], ctx);
    const x1 = requireInteger(value.x1, `${path}.x1`, ctx);
    const y1 = requireInteger(value.y1, `${path}.y1`, ctx);
    const x2 = requireInteger(value.x2, `${path}.x2`, ctx);
    const y2 = requireInteger(value.y2, `${path}.y2`, ctx);
    checkIntegerRange(x1, `${path}.x1`, 0, 89, ctx);
    checkIntegerRange(y1, `${path}.y1`, 0, 89, ctx);
    checkIntegerRange(x2, `${path}.x2`, 0, 89, ctx);
    checkIntegerRange(y2, `${path}.y2`, 0, 89, ctx);
    return {
      kind,
      x1: x1 ?? 0,
      y1: y1 ?? 0,
      x2: x2 ?? 0,
      y2: y2 ?? 0,
      tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0
    };
  }
  if (kind === "path") {
    allowKeys(value, path, ["kind", "points", "tile"], ctx);
    const points = parseArray(value.points, `${path}.points`, ctx, parsePoint) ?? [];
    if (points.length < 2) ctx.errors.push(`${path}.points must contain at least two points.`);
    return { kind, points, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0 };
  }
  if (kind === "border") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height", "tile", "thickness"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    const thickness = optionalInteger(value.thickness, `${path}.thickness`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 1, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 1, 90, ctx);
    checkIntegerRange(thickness, `${path}.thickness`, 1, 45, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    if (thickness !== undefined && width !== null && height !== null && thickness > Math.ceil(Math.min(width, height) / 2)) {
      ctx.errors.push(`${path}.thickness is too large for the border's smaller dimension.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, width: width ?? 1, height: height ?? 1, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0, ...(thickness !== undefined ? { thickness } : {}) };
  }
  if (kind === "room") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height", "wallTile", "floorTile", "doors"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    const doors = parseArray(value.doors, `${path}.doors`, ctx, parseRoomDoor) ?? [];
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 3, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 3, 90, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    for (let index = 0; index < doors.length; index++) {
      const door = doors[index];
      const limit = door.side === "north" || door.side === "south" ? width : height;
      if (limit !== null && door.offset >= limit) ctx.errors.push(`${path}.doors[${index}].offset must be less than the room's ${door.side === "north" || door.side === "south" ? "width" : "height"}.`);
    }
    return {
      kind,
      x: x ?? 0,
      y: y ?? 0,
      width: width ?? 3,
      height: height ?? 3,
      wallTile: requireMapTile(value.wallTile, `${path}.wallTile`, ctx) ?? 0,
      floorTile: requireMapTile(value.floorTile, `${path}.floorTile`, ctx) ?? 0,
      ...(value.doors !== undefined ? { doors } : {})
    };
  }
  if (kind === "road" || kind === "river") {
    allowKeys(value, path, ["kind", "points", "tile", "width"], ctx);
    const points = parseArray(value.points, `${path}.points`, ctx, parsePoint) ?? [];
    const width = optionalInteger(value.width, `${path}.width`, ctx);
    if (points.length < 2) ctx.errors.push(`${path}.points must contain at least two points.`);
    checkIntegerRange(width, `${path}.width`, 1, 15, ctx);
    const routeWidth = width ?? 1;
    const before = Math.floor((routeWidth - 1) / 2);
    const after = routeWidth - before - 1;
    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      const point = points[pointIndex];
      if (point.x - before < 0 || point.x + after >= MAP_SIZE || point.y - before < 0 || point.y + after >= MAP_SIZE) {
        ctx.errors.push(`${path}.points[${pointIndex}] does not leave enough map space for width ${routeWidth}.`);
      }
    }
    return { kind, points, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0, ...(width !== undefined ? { width } : {}) };
  }
  if (kind === "semanticRoad") {
    allowKeys(value, path, ["kind", "paths"], ctx);
    const paths = parseArray(value.paths, `${path}.paths`, ctx, parseSemanticRoadPath) ?? [];
    if (paths.length === 0) ctx.errors.push(`${path}.paths must contain at least one road path.`);
    return { kind, paths };
  }
  if (kind === "semanticRoute") {
    allowKeys(value, path, ["kind", "connections", "style"], ctx);
    const connections = parseArray(value.connections, `${path}.connections`, ctx, parseSemanticRouteConnection) ?? [];
    const style = optionalString(value.style, `${path}.style`, ctx);
    if (connections.length === 0) ctx.errors.push(`${path}.connections must contain at least one region-key chain.`);
    if (style !== undefined && style !== "direct" && style !== "natural") ctx.errors.push(`${path}.style must be direct or natural.`);
    return { kind, connections, ...(style === "direct" || style === "natural" ? { style } : {}) };
  }
  if (kind === "stamp") {
    allowKeys(value, path, ["kind", "x", "y", "tiles"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const tiles = parseArray(value.tiles, `${path}.tiles`, ctx, parseMapTileRow) ?? [];
    const stampWidth = tiles[0]?.length ?? 0;
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (tiles.length === 0) ctx.errors.push(`${path}.tiles must contain at least one row.`);
    if (tiles.length > MAP_SIZE) ctx.errors.push(`${path}.tiles can contain at most ${MAP_SIZE} rows.`);
    if (stampWidth === 0) ctx.errors.push(`${path}.tiles rows must contain at least one tile.`);
    if (stampWidth > MAP_SIZE) ctx.errors.push(`${path}.tiles rows can contain at most ${MAP_SIZE} tiles.`);
    for (let row = 1; row < tiles.length; row++) {
      if (tiles[row].length !== stampWidth) ctx.errors.push(`${path}.tiles[${row}] must have the same width as the first row.`);
    }
    checkMapRectBounds(x, y, stampWidth, tiles.length, path, ctx);
    return { kind, x: x ?? 0, y: y ?? 0, tiles };
  }
  if (kind === "namedTile") {
    allowKeys(value, path, ["kind", "x", "y", "name", "variant", "region"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const name = requireString(value.name, `${path}.name`, ctx);
    const variant = optionalInteger(value.variant, `${path}.variant`, ctx);
    const region = optionalString(value.region, `${path}.region`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(variant, `${path}.variant`, 1, null, ctx);
    if (name !== null && !isScenarioSeedNamedTileName(name)) {
      ctx.errors.push(`${path}.name must be a supported stable named land tile from the scenario schema.`);
    }
    return {
      kind,
      x: x ?? 0,
      y: y ?? 0,
      name: name !== null && isScenarioSeedNamedTileName(name) ? name : "open-ground",
      ...(variant !== undefined ? { variant } : {}),
      ...(region !== undefined ? { region } : {})
    };
  }
  if (kind === "namedStamp") {
    allowKeys(value, path, ["kind", "x", "y", "name", "variant", "region", "anchor"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const name = requireString(value.name, `${path}.name`, ctx);
    const variant = optionalInteger(value.variant, `${path}.variant`, ctx);
    const region = optionalString(value.region, `${path}.region`, ctx);
    const anchor = optionalString(value.anchor, `${path}.anchor`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(variant, `${path}.variant`, 1, null, ctx);
    if (name !== null && !isScenarioSeedNamedStampName(name)) {
      ctx.errors.push(`${path}.name must be a supported stable named land stamp from the scenario schema.`);
    }
    if ((region === undefined) !== (anchor === undefined)) ctx.errors.push(`${path}.region and ${path}.anchor must be provided together.`);
    if (anchor !== undefined && anchor !== "northWest" && anchor !== "northEast" && anchor !== "southWest" && anchor !== "southEast") {
      ctx.errors.push(`${path}.anchor must be northWest, northEast, southWest, or southEast.`);
    }
    return {
      kind,
      x: x ?? 0,
      y: y ?? 0,
      name: name !== null && isScenarioSeedNamedStampName(name) ? name : "bed",
      ...(variant !== undefined ? { variant } : {}),
      ...(region !== undefined ? { region } : {}),
      ...(anchor === "northWest" || anchor === "northEast" || anchor === "southWest" || anchor === "southEast" ? { anchor } : {})
    };
  }
  if (kind === "terrainGroup") {
    allowKeys(value, path, ["kind", "terrain", "geometry"], ctx);
    const terrain = requireString(value.terrain, `${path}.terrain`, ctx);
    if (terrain !== null && terrain !== "water" && terrain !== "mountains" && terrain !== "forest") {
      ctx.errors.push(`${path}.terrain must be water, mountains, or forest.`);
    }
    const geometry = parseTerrainGeometry(value.geometry, `${path}.geometry`, ctx);
    return { kind, terrain: terrain === "mountains" || terrain === "forest" ? terrain : "water", geometry: geometry ?? { kind: "rect", x: 0, y: 0, width: 1, height: 1 } };
  }
  if (kind === "naturalScatter") {
    allowKeys(value, path, ["kind", "geometry", "density", "spacing"], ctx);
    const geometry = parseTerrainGeometry(value.geometry, `${path}.geometry`, ctx);
    const density = optionalInteger(value.density, `${path}.density`, ctx);
    const spacing = optionalInteger(value.spacing, `${path}.spacing`, ctx);
    checkIntegerRange(density, `${path}.density`, 1, 20, ctx);
    checkIntegerRange(spacing, `${path}.spacing`, 1, 8, ctx);
    return {
      kind,
      geometry: geometry ?? { kind: "rect", x: 0, y: 0, width: 1, height: 1 },
      ...(density !== undefined ? { density } : {}),
      ...(spacing !== undefined ? { spacing } : {})
    };
  }
  if (kind === "landmass") {
    allowKeys(value, path, ["kind", "x", "y", "radiusX", "radiusY", "roughness"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const radiusX = requireInteger(value.radiusX, `${path}.radiusX`, ctx);
    const radiusY = requireInteger(value.radiusY, `${path}.radiusY`, ctx);
    const roughness = optionalInteger(value.roughness, `${path}.roughness`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(radiusX, `${path}.radiusX`, 3, 44, ctx);
    checkIntegerRange(radiusY, `${path}.radiusY`, 3, 44, ctx);
    checkIntegerRange(roughness, `${path}.roughness`, 0, 100, ctx);
    if (x !== null && radiusX !== null && (x - radiusX < 1 || x + radiusX > 88)) ctx.errors.push(`${path} must leave at least one water cell on the west and east map edges.`);
    if (y !== null && radiusY !== null && (y - radiusY < 1 || y + radiusY > 88)) ctx.errors.push(`${path} must leave at least one water cell on the north and south map edges.`);
    return { kind, x: x ?? 45, y: y ?? 45, radiusX: radiusX ?? 30, radiusY: radiusY ?? 30, ...(roughness !== undefined ? { roughness } : {}) };
  }
  if (kind === "castleRoom") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height", "floorVariant", "doors"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    const floorVariant = optionalInteger(value.floorVariant, `${path}.floorVariant`, ctx);
    const doors = parseArray(value.doors, `${path}.doors`, ctx, parseCastleRoomDoor) ?? [];
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 3, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 3, 90, ctx);
    checkIntegerRange(floorVariant, `${path}.floorVariant`, 1, 2, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    for (let index = 0; index < doors.length; index++) {
      const door = doors[index];
      const limit = door.side === "north" || door.side === "south" ? width : height;
      if (limit !== null && door.offset >= limit) ctx.errors.push(`${path}.doors[${index}].offset must be less than the room's ${door.side === "north" || door.side === "south" ? "width" : "height"}.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, width: width ?? 3, height: height ?? 3, ...(floorVariant !== undefined ? { floorVariant } : {}), ...(value.doors !== undefined ? { doors } : {}) };
  }
  if (kind === "landSecret") {
    allowKeys(value, path, ["kind", "x", "y", "state"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const state = requireString(value.state, `${path}.state`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (state !== null && state !== "normal" && state !== "hidden" && state !== "revealed") {
      ctx.errors.push(`${path}.state must be normal, hidden, or revealed.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, state: state === "hidden" || state === "revealed" ? state : "normal" };
  }
  if (kind === "hiddenWalkable") {
    allowKeys(value, path, ["kind", "x", "y", "tile"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const tile = optionalInteger(value.tile, `${path}.tile`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (tile !== undefined && !isHiddenWalkableTile(tile)) {
      ctx.errors.push(`${path}.tile must be one of the known stock hidden-walkable tiles (IDs 96, 169, or 184); landlook validation is applied separately.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, ...(tile !== undefined && isHiddenWalkableTile(tile) ? { tile } : {}) };
  }
  if (kind === "combatClearing") {
    allowKeys(value, path, ["kind", "x", "y", "tile"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const tile = optionalInteger(value.tile, `${path}.tile`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (tile !== undefined && !isCombatClearingTile(tile)) {
      ctx.errors.push(`${path}.tile must be one of the known stock combat-clearing tiles (IDs 59-65 or 180-185); landlook validation is applied separately.`);
    }
    return { kind, x: x ?? 0, y: y ?? 0, ...(tile !== undefined && isCombatClearingTile(tile) ? { tile } : {}) };
  }
  if (kind === "dungeonPassage") {
    allowKeys(value, path, ["kind", "x", "y", "directions"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const directions = parseArray(value.directions, `${path}.directions`, ctx, parseDungeonDirection) ?? [];
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    if (directions.length === 0) ctx.errors.push(`${path}.directions must contain at least one direction.`);
    if (new Set(directions).size !== directions.length) ctx.errors.push(`${path}.directions cannot contain duplicates.`);
    return { kind, x: x ?? 0, y: y ?? 0, directions };
  }
  ctx.errors.push(`${path}.kind must be one of fill, rect, line, path, border, room, road, river, semanticRoad, semanticRoute, stamp, namedStamp, namedTile, terrainGroup, naturalScatter, landmass, castleRoom, landSecret, hiddenWalkable, combatClearing, dungeonPassage.`);
  return null;
}

function parseSemanticRoadPath(input: unknown, path: string, ctx: ParseContext) {
  const points = parseArray(input, path, ctx, parsePoint) ?? [];
  if (points.length < 2) ctx.errors.push(`${path} must contain at least two points.`);
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous.x === point.x && previous.y === point.y) {
      ctx.errors.push(`${path}[${index}] must differ from the previous point.`);
    } else if (previous.x !== point.x && previous.y !== point.y) {
      ctx.errors.push(`${path}[${index - 1}] to ${path}[${index}] must be horizontal or vertical.`);
    }
  }
  return points;
}

function parseSemanticRouteConnection(input: unknown, path: string, ctx: ParseContext) {
  const regions = parseArray(input, path, ctx, (value, valuePath, valueCtx) => requireString(value, valuePath, valueCtx)) ?? [];
  if (regions.length < 2) ctx.errors.push(`${path} must contain at least two region keys.`);
  if (new Set(regions).size !== regions.length) ctx.errors.push(`${path} cannot repeat a region key.`);
  return regions;
}

export function validateMapOperationLevelTypes(operations: ScenarioSeedMapOperation[], levelType: LevelType, path: string, ctx: ParseContext) {
  for (let index = 0; index < operations.length; index++) {
    const kind = operations[index].kind;
    if ((kind === "landSecret" || kind === "hiddenWalkable" || kind === "combatClearing" || kind === "namedStamp" || kind === "namedTile" || kind === "terrainGroup" || kind === "naturalScatter" || kind === "landmass" || kind === "castleRoom" || kind === "semanticRoad" || kind === "semanticRoute") && levelType !== "land") {
      ctx.errors.push(`${path}.operations[${index}].kind ${kind} is only valid on land maps.`);
    }
    if (kind === "dungeonPassage" && levelType !== "dungeon") {
      ctx.errors.push(`${path}.operations[${index}].kind dungeonPassage is only valid on dungeon maps.`);
    }
  }
}

function parseTerrainGeometry(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTerrainGeometry | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const kind = requireString(value.kind, `${path}.kind`, ctx);
  if (kind === "rect") {
    allowKeys(value, path, ["kind", "x", "y", "width", "height"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const width = requireInteger(value.width, `${path}.width`, ctx);
    const height = requireInteger(value.height, `${path}.height`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(width, `${path}.width`, 1, 90, ctx);
    checkIntegerRange(height, `${path}.height`, 1, 90, ctx);
    checkMapRectBounds(x, y, width, height, path, ctx);
    return { kind, x: x ?? 0, y: y ?? 0, width: width ?? 1, height: height ?? 1 };
  }
  if (kind === "path") {
    allowKeys(value, path, ["kind", "points", "width"], ctx);
    const points = parseArray(value.points, `${path}.points`, ctx, parsePoint) ?? [];
    const width = optionalInteger(value.width, `${path}.width`, ctx);
    if (points.length < 2) ctx.errors.push(`${path}.points must contain at least two points.`);
    checkIntegerRange(width, `${path}.width`, 1, 15, ctx);
    const routeWidth = width ?? 1;
    const before = Math.floor((routeWidth - 1) / 2);
    const after = routeWidth - before - 1;
    points.forEach((point, pointIndex) => {
      if (point.x - before < 0 || point.x + after >= MAP_SIZE || point.y - before < 0 || point.y + after >= MAP_SIZE) {
        ctx.errors.push(`${path}.points[${pointIndex}] does not leave enough map space for width ${routeWidth}.`);
      }
    });
    return { kind, points, ...(width !== undefined ? { width } : {}) };
  }
  if (kind === "blob") {
    allowKeys(value, path, ["kind", "x", "y", "radiusX", "radiusY", "roughness"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    const radiusX = requireInteger(value.radiusX, `${path}.radiusX`, ctx);
    const radiusY = requireInteger(value.radiusY, `${path}.radiusY`, ctx);
    const roughness = optionalInteger(value.roughness, `${path}.roughness`, ctx);
    checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
    checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
    checkIntegerRange(radiusX, `${path}.radiusX`, 1, 44, ctx);
    checkIntegerRange(radiusY, `${path}.radiusY`, 1, 44, ctx);
    checkIntegerRange(roughness, `${path}.roughness`, 0, 100, ctx);
    if (x !== null && radiusX !== null && (x - radiusX < 0 || x + radiusX >= MAP_SIZE)) ctx.errors.push(`${path}.radiusX extends past the map edge.`);
    if (y !== null && radiusY !== null && (y - radiusY < 0 || y + radiusY >= MAP_SIZE)) ctx.errors.push(`${path}.radiusY extends past the map edge.`);
    return { kind, x: x ?? 45, y: y ?? 45, radiusX: radiusX ?? 5, radiusY: radiusY ?? 5, ...(roughness !== undefined ? { roughness } : {}) };
  }
  ctx.errors.push(`${path}.kind must be rect, path, or blob.`);
  return null;
}

function parseDungeonDirection(input: unknown, path: string, ctx: ParseContext): ScenarioSeedDungeonDirection | null {
  const value = requireString(input, path, ctx);
  if (value === "north" || value === "east" || value === "south" || value === "west") return value;
  if (value !== null) ctx.errors.push(`${path} must be north, east, south, or west.`);
  return null;
}

function isHiddenWalkableTile(value: number): value is ScenarioSeedHiddenWalkableTile {
  return value === 96 || value === 169 || value === 184;
}

function isCombatClearingTile(value: number): value is ScenarioSeedCombatClearingTile {
  return (value >= 59 && value <= 65) || (value >= 180 && value <= 185);
}

function parseRoomDoor(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRoomDoor | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["side", "offset", "tile"], ctx);
  const side = requireString(value.side, `${path}.side`, ctx);
  const offset = requireInteger(value.offset, `${path}.offset`, ctx);
  if (side !== null && side !== "north" && side !== "south" && side !== "west" && side !== "east") {
    ctx.errors.push(`${path}.side must be one of north, south, west, east.`);
  }
  checkIntegerRange(offset, `${path}.offset`, 0, 89, ctx);
  return { side: side === "south" || side === "west" || side === "east" ? side : "north", offset: offset ?? 0, tile: requireMapTile(value.tile, `${path}.tile`, ctx) ?? 0 };
}

function parseCastleRoomDoor(input: unknown, path: string, ctx: ParseContext): ScenarioSeedCastleRoomDoor | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["side", "offset", "region"], ctx);
  const side = requireString(value.side, `${path}.side`, ctx);
  const offset = requireInteger(value.offset, `${path}.offset`, ctx);
  const region = optionalString(value.region, `${path}.region`, ctx);
  if (side !== null && side !== "north" && side !== "south" && side !== "west" && side !== "east") {
    ctx.errors.push(`${path}.side must be one of north, south, west, east.`);
  }
  checkIntegerRange(offset, `${path}.offset`, 0, 89, ctx);
  return { side: side === "south" || side === "west" || side === "east" ? side : "north", offset: offset ?? 0, ...(region !== undefined ? { region } : {}) };
}

function parseMapTileRow(input: unknown, path: string, ctx: ParseContext): number[] | null {
  const row = parseIntegerArray(input, path, ctx);
  row?.forEach((tile, tileIndex) => checkIntegerRange(tile, `${path}[${tileIndex}]`, MAP_TILE_MIN, MAP_TILE_MAX, ctx));
  return row ?? null;
}

function checkMapRectBounds(x: number | null, y: number | null, width: number | null, height: number | null, path: string, ctx: ParseContext) {
  if (x !== null && width !== null && x + width > MAP_SIZE) ctx.errors.push(`${path} extends past map column ${MAP_SIZE - 1}.`);
  if (y !== null && height !== null && y + height > MAP_SIZE) ctx.errors.push(`${path} extends past map row ${MAP_SIZE - 1}.`);
}

function parsePoint(input: unknown, path: string, ctx: ParseContext): { x: number; y: number } | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["x", "y"], ctx);
  const x = requireInteger(value.x, `${path}.x`, ctx);
  const y = requireInteger(value.y, `${path}.y`, ctx);
  checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
  checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
  return { x: x ?? 0, y: y ?? 0 };
}

export function requireMapTile(input: unknown, path: string, context: ParseContext): number | null {
  const tile = requireInteger(input, path, context);
  checkIntegerRange(tile, path, MAP_TILE_MIN, MAP_TILE_MAX, context);
  return tile;
}
