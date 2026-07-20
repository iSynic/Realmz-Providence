import { landlookName, landlookPictId } from "../browser/realmzParser";
import { buildSmartTerrainChanges } from "../map/smartTerrainBrush";
import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";
import type { MapEntity, SmartBrushPreset, TilesetAsset } from "../types";
import type { ScenarioSeedMapOperation, ScenarioSeedPoint } from "./contracts";
import type { ScenarioSeedMapOperationContext } from "./mapCompiler";
import { setTile } from "./mapPaintingPrimitives";
import { terrainGeometryCells } from "./terrainGeometry";

const MAP_SIZE = REALMZ_NATIVE_LAYOUT.mapSize;

export function applyTerrainGroup(
  tiles: number[],
  operation: Extract<ScenarioSeedMapOperation, { kind: "terrainGroup" }>,
  mapContext: ScenarioSeedMapOperationContext
) {
  const cells = terrainGeometryCells(operation.geometry, mapContext.mapSeed, operation.terrain);
  applyTerrainCells(tiles, cells, operation.terrain, mapContext);
}

export function applyTerrainCells(
  tiles: number[],
  cells: ScenarioSeedPoint[],
  terrain: SmartBrushPreset,
  mapContext: ScenarioSeedMapOperationContext
) {
  const source = mapContext.levelType === "land" ? "Data LD" : "Data DL";
  const recordIndex = Number(mapContext.mapSeed.split(":")[1] ?? 0);
  const map: MapEntity = {
    id: mapContext.mapSeed,
    levelType: mapContext.levelType,
    source,
    index: recordIndex,
    name: mapContext.mapSeed,
    width: MAP_SIZE,
    height: MAP_SIZE,
    tiles,
    render: {
      tilesetId: `landlook-${mapContext.landlook}`,
      landlook: mapContext.landlook,
      mode: mapContext.levelType === "land" ? "outdoor-landlook" : "dungeon-top-down"
    },
    provenance: {
      sourceFile: source,
      recordIndex,
      byteOffset: 0,
      byteLength: tiles.length * 2,
      confidence: "inferred"
    }
  };
  const tileset: TilesetAsset = {
    id: `landlook-${mapContext.landlook}`,
    landlook: mapContext.landlook,
    name: landlookName(mapContext.landlook),
    source: "scenario-seed",
    available: true,
    imagePath: null,
    pictId: landlookPictId(mapContext.landlook),
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    custom: false,
    baseTile: 1
  };
  const plan = buildSmartTerrainChanges(map, cells, terrain, tileset, null);
  for (const cell of plan.cells) setTile(tiles, cell.x, cell.y, cell.to, mapContext.levelType);
}
