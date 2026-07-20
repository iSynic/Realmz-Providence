import { browserReferenceAtlasUrl, hasBrowserReferenceAtlas } from "../browser/atlasPaths";
import { landlookBaseTile, landlookName, landlookPictId } from "../browser/realmzParser";
import { resolveNamedLandStamp } from "../map/namedLandStamps";
import type { LevelType, MapEntity, Provenance, RandomLevel, TilesetAsset } from "../types";
import type {
  ScenarioSeedCastleRoomDoor,
  ScenarioSeedMap,
  ScenarioSeedMapOperation,
  ScenarioSeedPoint
} from "./contracts";
import type { ScenarioSeedCompilerContext } from "./compilerContext";
import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";

const MAP_SIZE = REALMZ_NATIVE_LAYOUT.mapSize;
const FIELD_BYTES = REALMZ_NATIVE_LAYOUT.mapFieldBytes;
const RANDOM_LEVEL_BYTES = REALMZ_NATIVE_LAYOUT.randomLevelRecordBytes;

export type ScenarioSeedMapOperationContext = {
  landlook: number;
  levelType: LevelType;
  mapSeed: string;
  regions: Map<string, ScenarioSeedPoint>;
  buildContext: ScenarioSeedCompilerContext;
};

export type ScenarioSeedMapCompilerOptions = {
  applyOperation: (
    tiles: number[],
    operation: ScenarioSeedMapOperation,
    context: ScenarioSeedMapOperationContext
  ) => void;
};

export type ScenarioSeedMapCompilation = {
  maps: MapEntity[];
  randomLevels: RandomLevel[];
  tilesets: TilesetAsset[];
};

export function compileScenarioSeedMaps(
  seeds: ScenarioSeedMap[],
  context: ScenarioSeedCompilerContext,
  options: ScenarioSeedMapCompilerOptions
): ScenarioSeedMapCompilation {
  const maps = seeds.map((seed, index) => buildMap(seed, index, context, options));
  return {
    maps,
    randomLevels: seeds.map(buildRandomLevel),
    tilesets: buildTilesets(maps)
  };
}

export function scenarioSeedOperationRegions(
  operations: ScenarioSeedMapOperation[],
  landlook: number
): Array<{ key: string; x: number; y: number }> {
  const regions: Array<{ key: string; x: number; y: number }> = [];
  for (const operation of operations) {
    if (operation.kind === "namedTile" && operation.region) {
      regions.push({ key: operation.region, x: operation.x, y: operation.y });
      continue;
    }
    if (operation.kind === "namedStamp" && operation.region && operation.anchor) {
      const stamp = resolveNamedLandStamp(landlook, operation.name, operation.variant ?? 1);
      if (!stamp) continue;
      const east = operation.anchor === "northEast" || operation.anchor === "southEast";
      const south = operation.anchor === "southWest" || operation.anchor === "southEast";
      regions.push({
        key: operation.region,
        x: operation.x + (east ? stamp.width - 1 : 0),
        y: operation.y + (south ? stamp.height - 1 : 0)
      });
      continue;
    }
    if (operation.kind === "castleRoom") {
      for (const door of operation.doors ?? []) {
        if (!door.region) continue;
        regions.push({ key: door.region, ...castleRoomDoorPoint(operation, door) });
      }
    }
  }
  return regions;
}

export function castleRoomDoorPoint(
  operation: Extract<ScenarioSeedMapOperation, { kind: "castleRoom" }>,
  door: ScenarioSeedCastleRoomDoor
) {
  return {
    x: door.side === "west" ? operation.x : door.side === "east" ? operation.x + operation.width - 1 : operation.x + door.offset,
    y: door.side === "north" ? operation.y : door.side === "south" ? operation.y + operation.height - 1 : operation.y + door.offset
  };
}

function buildMap(
  seed: ScenarioSeedMap,
  fallbackIndex: number,
  buildContext: ScenarioSeedCompilerContext,
  options: ScenarioSeedMapCompilerOptions
): MapEntity {
  const levelType = seed.levelType ?? "land";
  const index = seed.index ?? fallbackIndex;
  const source = levelType === "land" ? "Data LD" : "Data DL";
  const landlook = seed.landlook ?? 0;
  const fillTile = seed.fillTile ?? (landlook === 4 ? 40 : landlookBaseTile(landlook) ?? 1);
  const tiles = seed.tiles ? [...seed.tiles] : new Array(MAP_SIZE * MAP_SIZE).fill(fillTile);
  const regions = new Map([
    ...(seed.regions ?? []).map((region) => [region.key, { x: region.x, y: region.y }] as const),
    ...scenarioSeedOperationRegions(seed.operations ?? [], landlook).map((region) => [region.key, { x: region.x, y: region.y }] as const)
  ]);
  const operationContext: ScenarioSeedMapOperationContext = {
    landlook,
    levelType,
    mapSeed: `${levelType}:${index}`,
    regions,
    buildContext
  };
  for (const operation of seed.operations ?? []) options.applyOperation(tiles, operation, operationContext);
  return {
    id: `${levelType}:${index}`,
    levelType,
    source,
    index,
    name: seed.name ?? canonicalMapLevelName(levelType, index),
    width: MAP_SIZE,
    height: MAP_SIZE,
    tiles,
    render: {
      tilesetId: `landlook-${landlook}`,
      landlook,
      mode: levelType === "land" ? "outdoor-landlook" : "dungeon-top-down"
    },
    provenance: authoredProvenance(source, index, index * FIELD_BYTES, FIELD_BYTES)
  };
}

function buildRandomLevel(seed: ScenarioSeedMap, fallbackIndex: number): RandomLevel {
  const levelType = seed.levelType ?? "land";
  const index = seed.index ?? fallbackIndex;
  const landlook = seed.landlook ?? 0;
  const isDark = seed.isDark ?? false;
  const useLos = seed.useLos ?? false;
  const source = levelType === "land" ? "Data RD" : "Data RDD";
  return {
    id: `${levelType}:${index}:randlevel`,
    source,
    levelType,
    levelIndex: index,
    landlook,
    isDark,
    useLos,
    rects: [],
    provenance: authoredProvenance(source, index, index * RANDOM_LEVEL_BYTES, RANDOM_LEVEL_BYTES)
  };
}

function buildTilesets(maps: MapEntity[]): TilesetAsset[] {
  const landlooks = [...new Set(maps.map((map) => map.render.landlook ?? 0))].sort((a, b) => a - b);
  return landlooks.map((landlook) => {
    const pictId = landlookPictId(landlook);
    const imagePath = browserReferenceAtlasUrl(pictId);
    return {
      id: `landlook-${landlook}`,
      landlook,
      name: landlookName(landlook),
      source: imagePath ? "Scenario seed: bundled Realmz reference PICT" : "Scenario seed: missing reference atlas",
      available: hasBrowserReferenceAtlas(pictId),
      imagePath: null,
      pictId,
      tileWidth: 32,
      tileHeight: 32,
      columns: 20,
      rows: 10,
      baseTile: landlookBaseTile(landlook),
      custom: landlook >= 6 && landlook <= 8
    };
  });
}

function authoredProvenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number): Provenance {
  return { sourceFile, recordIndex, byteOffset, byteLength, confidence: "inferred" };
}

function canonicalMapLevelName(levelType: LevelType, index: number) {
  return `${levelType === "land" ? "Land" : "Dungeon"} ${index}`;
}
