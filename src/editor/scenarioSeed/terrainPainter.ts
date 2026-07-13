import { landlookName, landlookPictId } from "../browser/realmzParser";
import { buildSmartTerrainChanges } from "../map/smartTerrainBrush";
import type { MapEntity, SmartBrushPreset, TilesetAsset } from "../types";
import type { ScenarioSeedMapOperation, ScenarioSeedPoint } from "./contracts";
import type { ScenarioSeedMapOperationContext } from "./mapCompiler";
import { setTile } from "./mapPaintingPrimitives";
import { terrainGeometryCells } from "./terrainGeometry";

const MAP_SIZE = 90;

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
  const map: MapEntity = {
    id: mapContext.mapSeed,
    levelType: mapContext.levelType,
    source: mapContext.levelType === "land" ? "Data LD" : "Data D",
    index: Number(mapContext.mapSeed.split(":")[1] ?? 0),
    name: mapContext.mapSeed,
    width: MAP_SIZE,
    height: MAP_SIZE,
    tiles,
    render: {
      tilesetId: `landlook-${mapContext.landlook}`,
      landlook: mapContext.landlook,
      mode: "outdoor-landlook"
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
