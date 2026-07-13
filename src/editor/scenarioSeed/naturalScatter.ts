import { namedLandStampVariants, resolveNamedLandStamp } from "../map/namedLandStamps";
import { namedLandTileVariants } from "../map/namedLandTiles";
import { normalizeSmartTerrainTile } from "../map/smartTerrainTopology";
import type { ScenarioSeedMapOperation, ScenarioSeedPoint } from "../scenarioSeed";
import type { ScenarioSeedMapOperationContext } from "./mapCompiler";
import { mapStorageTileIndex, setTile } from "./mapPaintingPrimitives";
import { deterministicHash, terrainGeometryCells } from "./terrainGeometry";

const MAP_SIZE = 90;

type NaturalScatterPalette = {
  ground: number[];
  plants: number[];
  landmarks: number[];
  tallTrees: boolean;
};

const NATURAL_SCATTER_PALETTES: Record<number, NaturalScatterPalette> = {
  0: { ground: [155, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167], plants: [118, 119, 120, 149], landmarks: [148], tallTrees: true },
  2: { ground: [155, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167], plants: [118, 119, 120, 149], landmarks: [148], tallTrees: true },
  3: { ground: [155, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167], plants: [118, 119, 120, 149], landmarks: [148], tallTrees: true },
  5: { ground: [159, 160, 161, 162, 163, 164, 165, 166, 167], plants: [118, 119, 120, 154, 155, 156, 157, 158, 186, 187, 188, 189, 190], landmarks: [], tallTrees: false },
  9: { ground: [156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167], plants: [118, 119, 120, 149, 150, 152, 154], landmarks: [], tallTrees: false },
  10: { ground: [156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167], plants: [118, 119, 120, 149, 150, 152, 154], landmarks: [], tallTrees: true }
};

export function applyNaturalScatter(
  tiles: number[],
  operation: Extract<ScenarioSeedMapOperation, { kind: "naturalScatter" }>,
  mapContext: ScenarioSeedMapOperationContext
) {
  const palette = NATURAL_SCATTER_PALETTES[mapContext.landlook];
  if (!palette) return;
  const openTiles = new Set(namedLandTileVariants(mapContext.landlook, "open-ground"));
  const density = operation.density ?? 2;
  const spacing = operation.spacing ?? 3;
  const geometryCells = terrainGeometryCells(operation.geometry, mapContext.mapSeed, "natural-scatter");
  const candidates = geometryCells
    .filter((cell) => deterministicHash(`${mapContext.mapSeed}:natural-scatter:present:${cell.x}:${cell.y}`) % 100 < density)
    .sort((a, b) => (
      deterministicHash(`${mapContext.mapSeed}:natural-scatter:order:${a.x}:${a.y}`)
      - deterministicHash(`${mapContext.mapSeed}:natural-scatter:order:${b.x}:${b.y}`)
    ));
  const placed: ScenarioSeedPoint[] = [];
  let placedLandmark = false;
  let placedTallTree = false;
  for (const cell of candidates) {
    if (!isScatterOpenCell(tiles, cell.x, cell.y, mapContext, openTiles)) continue;
    if (placed.some((other) => Math.max(Math.abs(other.x - cell.x), Math.abs(other.y - cell.y)) < spacing)) continue;
    if (isNearScatterProtectedCell(tiles, cell, mapContext)) continue;
    const hash = deterministicHash(`${mapContext.mapSeed}:natural-scatter:feature:${cell.x}:${cell.y}`);
    const selector = hash % 100;
    if (selector >= 96 && palette.tallTrees) {
      const variants = namedLandStampVariants(mapContext.landlook, "tall-tree");
      const stamp = resolveNamedLandStamp(
        mapContext.landlook,
        "tall-tree",
        variants.length > 0 ? hash % variants.length + 1 : 1
      );
      if (stamp && stamp.cells.every((stampCell) => {
        const stampPoint = { x: cell.x + stampCell.dx, y: cell.y + stampCell.dy };
        return isScatterOpenCell(tiles, stampPoint.x, stampPoint.y, mapContext, openTiles)
          && !isNearScatterProtectedCell(tiles, stampPoint, mapContext);
      })) {
        for (const stampCell of stamp.cells) {
          setTile(tiles, cell.x + stampCell.dx, cell.y + stampCell.dy, stampCell.tile, mapContext.levelType);
        }
        placed.push(cell);
        placedTallTree = true;
      }
      continue;
    }
    const choices = selector < 60
      ? palette.ground
      : selector < 94
        ? palette.plants
        : palette.landmarks.length > 0
          ? palette.landmarks
          : palette.ground;
    if (choices.length === 0) continue;
    setTile(tiles, cell.x, cell.y, choices[hash % choices.length], mapContext.levelType);
    placed.push(cell);
    if (choices === palette.landmarks) placedLandmark = true;
  }
  const reserves = geometryCells.sort((a, b) => (
    deterministicHash(`${mapContext.mapSeed}:natural-scatter:reserve:${a.x}:${a.y}`)
    - deterministicHash(`${mapContext.mapSeed}:natural-scatter:reserve:${b.x}:${b.y}`)
  ));
  if (!placedLandmark && palette.landmarks.length > 0 && placed.length >= 8) {
    const cell = reserves.find((candidate) => (
      isScatterReserveCell(tiles, candidate, mapContext, openTiles, placed, spacing)
    ));
    if (cell) {
      const hash = deterministicHash(`${mapContext.mapSeed}:natural-scatter:landmark:${cell.x}:${cell.y}`);
      setTile(tiles, cell.x, cell.y, palette.landmarks[hash % palette.landmarks.length], mapContext.levelType);
      placed.push(cell);
    }
  }
  if (!placedTallTree && palette.tallTrees && placed.length >= 12) {
    for (const cell of reserves) {
      if (!isScatterReserveCell(tiles, cell, mapContext, openTiles, placed, spacing)) continue;
      const variants = namedLandStampVariants(mapContext.landlook, "tall-tree");
      const hash = deterministicHash(`${mapContext.mapSeed}:natural-scatter:tall-tree:${cell.x}:${cell.y}`);
      const stamp = resolveNamedLandStamp(
        mapContext.landlook,
        "tall-tree",
        variants.length > 0 ? hash % variants.length + 1 : 1
      );
      if (!stamp || !stamp.cells.every((stampCell) => {
        const stampPoint = { x: cell.x + stampCell.dx, y: cell.y + stampCell.dy };
        return isScatterOpenCell(tiles, stampPoint.x, stampPoint.y, mapContext, openTiles)
          && !isNearScatterProtectedCell(tiles, stampPoint, mapContext);
      })) continue;
      for (const stampCell of stamp.cells) {
        setTile(tiles, cell.x + stampCell.dx, cell.y + stampCell.dy, stampCell.tile, mapContext.levelType);
      }
      break;
    }
  }
}

function isScatterReserveCell(
  tiles: number[],
  cell: ScenarioSeedPoint,
  mapContext: ScenarioSeedMapOperationContext,
  openTiles: Set<number>,
  placed: ScenarioSeedPoint[],
  spacing: number
) {
  return isScatterOpenCell(tiles, cell.x, cell.y, mapContext, openTiles)
    && !isNearScatterProtectedCell(tiles, cell, mapContext)
    && !placed.some((other) => Math.max(Math.abs(other.x - cell.x), Math.abs(other.y - cell.y)) < spacing);
}

function isScatterOpenCell(
  tiles: number[],
  x: number,
  y: number,
  mapContext: ScenarioSeedMapOperationContext,
  openTiles: Set<number>
) {
  if (x < 1 || y < 1 || x >= MAP_SIZE - 1 || y >= MAP_SIZE - 1) return false;
  const tile = normalizeSmartTerrainTile(tiles[mapStorageTileIndex(mapContext.levelType, x, y)]);
  return tile !== null && openTiles.has(tile);
}

function isNearScatterProtectedCell(
  tiles: number[],
  cell: ScenarioSeedPoint,
  mapContext: ScenarioSeedMapOperationContext
) {
  if ([...mapContext.regions.values()].some((region) => (
    Math.max(Math.abs(region.x - cell.x), Math.abs(region.y - cell.y)) <= 3
  ))) return true;
  for (let y = cell.y - 1; y <= cell.y + 1; y++) {
    for (let x = cell.x - 1; x <= cell.x + 1; x++) {
      const raw = tiles[mapStorageTileIndex(mapContext.levelType, x, y)];
      const tile = normalizeSmartTerrainTile(raw);
      if (raw < 0 || (tile !== null && tile >= 130 && tile <= 146)) return true;
    }
  }
  return false;
}
