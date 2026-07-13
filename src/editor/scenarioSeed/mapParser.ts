import { GENERATED_SMART_TERRAIN_PROFILES } from "../map/generatedSmartTerrainProfiles";
import { namedLandStampVariants, resolveNamedLandStamp } from "../map/namedLandStamps";
import { namedLandTileVariants } from "../map/namedLandTiles";
import { supportsSemanticRoads } from "../map/semanticRoads";
import {
  defaultStockCombatClearingTile,
  defaultStockHiddenWalkableTile,
  isStockCombatClearingTile,
  isStockHiddenWalkableTile
} from "../map/secrets";
import type { LevelType } from "../types";
import type { ScenarioSeedMap } from "./contracts";
import { scenarioSeedOperationRegions } from "./mapCompiler";
import {
  MAP_SIZE,
  MAP_TILE_MAX,
  MAP_TILE_MIN,
  parseMapOperation,
  parseRegion,
  validateMapOperationLevelTypes
} from "./mapOperationParser";
import {
  allowKeys,
  checkIntegerRange,
  optionalBoolean,
  optionalInteger,
  optionalString,
  parseArray,
  parseIntegerArray,
  requireObject,
  type ParseContext
} from "./parsePrimitives";

export function parseMap(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMap | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "levelType", "index", "name", "landlook", "isDark", "useLos", "fillTile", "tiles", "operations", "regions"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const levelType = optionalLevelType(value.levelType, `${path}.levelType`, ctx);
  const index = optionalInteger(value.index, `${path}.index`, ctx);
  const name = optionalString(value.name, `${path}.name`, ctx);
  const landlook = optionalInteger(value.landlook, `${path}.landlook`, ctx);
  const fillTile = optionalInteger(value.fillTile, `${path}.fillTile`, ctx);
  const tiles = parseIntegerArray(value.tiles, `${path}.tiles`, ctx);
  const operations = parseArray(value.operations, `${path}.operations`, ctx, parseMapOperation);
  const regions = parseArray(value.regions, `${path}.regions`, ctx, parseRegion);
  if (tiles && tiles.length !== MAP_SIZE * MAP_SIZE) {
    ctx.errors.push(`${path}.tiles must contain exactly ${MAP_SIZE * MAP_SIZE} entries for a Realmz map.`);
  }
  checkIntegerRange(index, `${path}.index`, 0, null, ctx);
  checkIntegerRange(landlook, `${path}.landlook`, 0, null, ctx);
  checkIntegerRange(fillTile, `${path}.fillTile`, MAP_TILE_MIN, MAP_TILE_MAX, ctx);
  tiles?.forEach((tile, tileIndex) => checkIntegerRange(tile, `${path}.tiles[${tileIndex}]`, MAP_TILE_MIN, MAP_TILE_MAX, ctx));
  validateMapOperationLevelTypes(operations ?? [], levelType ?? "land", path, ctx);
  if ((operations ?? []).some((operation) => operation.kind === "terrainGroup" || operation.kind === "landmass")
      && !GENERATED_SMART_TERRAIN_PROFILES.some((profile) => profile.landlook === (landlook ?? 0))) {
    ctx.errors.push(`${path}.landlook ${landlook ?? 0} does not have a checked-in semantic terrain profile.`);
  }
  const regionKeys = new Set((regions ?? []).map((region) => region.key));
  for (const operationRegion of scenarioSeedOperationRegions(operations ?? [], landlook ?? 0)) {
    if (regionKeys.has(operationRegion.key)) ctx.errors.push(`${path} declares map region "${operationRegion.key}" more than once.`);
    regionKeys.add(operationRegion.key);
  }
  for (let operationIndex = 0; operationIndex < (operations ?? []).length; operationIndex++) {
    const operation = operations?.[operationIndex];
    const mapLandlook = landlook ?? 0;
    if (operation?.kind === "hiddenWalkable" && (operation.tile !== undefined ? !isStockHiddenWalkableTile(operation.tile, mapLandlook) : defaultStockHiddenWalkableTile(mapLandlook) === null)) {
      ctx.errors.push(`${path}.operations[${operationIndex}] hiddenWalkable is not valid for landlook ${mapLandlook}; use that landlook's stock concealed-walkable tiles.`);
    }
    if (operation?.kind === "combatClearing" && (operation.tile !== undefined ? !isStockCombatClearingTile(operation.tile, mapLandlook) : defaultStockCombatClearingTile(mapLandlook) === null)) {
      ctx.errors.push(`${path}.operations[${operationIndex}] combatClearing is not valid for landlook ${mapLandlook}; use that landlook's stock solid tiles with non-solid combat builds.`);
    }
    if ((operation?.kind === "semanticRoad" || operation?.kind === "semanticRoute") && !supportsSemanticRoads(mapLandlook)) {
      ctx.errors.push(`${path}.operations[${operationIndex}] ${operation.kind} is not valid for landlook ${mapLandlook}; use an audited outdoor landlook or explicit tile operations.`);
    }
    if (operation?.kind === "naturalScatter" && !supportsSemanticRoads(mapLandlook)) {
      ctx.errors.push(`${path}.operations[${operationIndex}] naturalScatter is not valid for landlook ${mapLandlook}; use an audited outdoor landlook or explicit named tiles.`);
    }
    if (operation?.kind === "semanticRoute") {
      for (const [connectionIndex, connection] of operation.connections.entries()) {
        for (const region of connection) {
          if (!regionKeys.has(region)) ctx.errors.push(`${path}.operations[${operationIndex}].connections[${connectionIndex}] references unknown map region "${region}".`);
        }
      }
    }
    if (operation?.kind === "castleRoom" && mapLandlook !== 4) {
      ctx.errors.push(`${path}.operations[${operationIndex}] castleRoom is only valid for Castle landlook 4.`);
    }
    if (operation?.kind === "namedTile") {
      const variants = namedLandTileVariants(mapLandlook, operation.name);
      if (variants.length === 0) {
        ctx.errors.push(`${path}.operations[${operationIndex}] named tile "${operation.name}" is not available for landlook ${mapLandlook}.`);
      } else if ((operation.variant ?? 1) > variants.length) {
        ctx.errors.push(`${path}.operations[${operationIndex}].variant must be between 1 and ${variants.length} for named tile "${operation.name}" on landlook ${mapLandlook}.`);
      }
    }
    if (operation?.kind === "namedStamp") {
      const variants = namedLandStampVariants(mapLandlook, operation.name);
      if (variants.length === 0) {
        ctx.errors.push(`${path}.operations[${operationIndex}] named stamp "${operation.name}" is not available for landlook ${mapLandlook}.`);
      } else if ((operation.variant ?? 1) > variants.length) {
        ctx.errors.push(`${path}.operations[${operationIndex}].variant must be between 1 and ${variants.length} for named stamp "${operation.name}" on landlook ${mapLandlook}.`);
      } else {
        const stamp = resolveNamedLandStamp(mapLandlook, operation.name, operation.variant ?? 1);
        if (stamp && (operation.x + stamp.width > MAP_SIZE || operation.y + stamp.height > MAP_SIZE)) {
          ctx.errors.push(`${path}.operations[${operationIndex}] named stamp "${operation.name}" footprint ${stamp.width} x ${stamp.height} extends past the 90 x 90 map.`);
        }
      }
    }
  }
  return {
    ...(key !== undefined ? { key } : {}),
    ...(levelType !== undefined ? { levelType } : {}),
    ...(index !== undefined ? { index } : {}),
    ...(name !== undefined ? { name } : {}),
    ...(landlook !== undefined ? { landlook } : {}),
    ...(optionalBoolean(value.isDark, `${path}.isDark`, ctx) !== undefined ? { isDark: optionalBoolean(value.isDark, `${path}.isDark`, ctx) } : {}),
    ...(optionalBoolean(value.useLos, `${path}.useLos`, ctx) !== undefined ? { useLos: optionalBoolean(value.useLos, `${path}.useLos`, ctx) } : {}),
    ...(fillTile !== undefined ? { fillTile } : {}),
    ...(tiles ? { tiles } : {}),
    ...(operations ? { operations } : {}),
    ...(regions ? { regions } : {})
  };
}

export function optionalLevelType(input: unknown, path: string, context: ParseContext): LevelType | undefined {
  if (input === undefined) return undefined;
  if (input === "land" || input === "dungeon") return input;
  context.errors.push(`${path} must be "land" or "dungeon".`);
  return undefined;
}
