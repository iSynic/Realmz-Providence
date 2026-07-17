import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const { buildSync } = requireFromRoot("esbuild");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "providence-smart-terrain-brush-"));
const failures = [];

try {
  buildSync({
    entryPoints: {
      alignment: path.join(root, "src", "editor", "map", "smartTerrainAlignment.ts"),
      brush: path.join(root, "src", "editor", "map", "smartTerrainBrush.ts"),
      mask: path.join(root, "src", "editor", "map", "smartBrushMask.ts"),
      topology: path.join(root, "src", "editor", "map", "smartTerrainTopology.ts"),
      seed: path.join(root, "src", "editor", "scenarioSeed.ts")
    },
    outdir: tmpDir,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "silent"
  });
  const requireFromCheck = createRequire(path.join(tmpDir, "check.cjs"));
  const { alignSmartTerrainPlacementEdges } = requireFromCheck("./alignment.js");
  const { buildSmartTerrainChanges, smartBrushProfileForTileset } = requireFromCheck("./brush.js");
  const { filledClosedSmartBrushPathCells, orthogonalSmartBrushPathCells, sameSmartBrushMask } = requireFromCheck("./mask.js");
  const { smartTerrainConnectionMasksForTile, smartTerrainTileConnects } = requireFromCheck("./topology.js");
  const { createProjectFromScenarioSeed } = requireFromCheck("./seed.js");
  const tileset = { landlook: 0, baseTile: 156 };
  const waterProfile = smartBrushProfileForTileset(tileset)?.presets.water;
  expect(Boolean(waterProfile), "Plains water profile should exist");
  if (!waterProfile) process.exit(1);

  expect(smartTerrainConnectionMasksForTile(3, waterProfile).includes(110), "north-land shoreline tile 3 should expose water toward south/east/west");
  expect(smartTerrainTileConnects(3, waterProfile, 4), "shoreline tile 3 should connect water to its south");
  expect(!smartTerrainTileConnects(3, waterProfile, 1), "shoreline tile 3 should not connect water into land on its north");
  expect(smartTerrainConnectionMasksForTile(29, waterProfile).includes(239), "inward northeast shoreline tile 29 should retain its reviewed notch mask");
  expect(smartTerrainConnectionMasksForTile(1060, waterProfile).includes(255), "Realmz state bands should normalize before semantic terrain matching");
  expect(smartTerrainConnectionMasksForTile(-75, waterProfile).length === 0, "special icon tiles should not masquerade as semantic terrain");

  const aligned = alignSmartTerrainPlacementEdges(
    [
      { x: 0, y: 0, tile: 11, candidates: [11, 12] },
      { x: 1, y: 0, tile: 19, candidates: [19, 20] }
    ],
    () => null,
    (tile) => syntheticEdgeSignature(tile)
  );
  expect(aligned.get("0:0") === 12 && aligned.get("1:0") === 19, "shoreline alignment should choose variants whose shared east/west edge profiles meet");
  const shapePreferred = alignSmartTerrainPlacementEdges(
    [
      { x: 0, y: 0, tile: 11, candidates: [11, 12] },
      { x: 1, y: 0, tile: 19, candidates: [19] }
    ],
    () => null,
    () => ({ north: [0], east: [1], south: [0], west: [1] }),
    (tile) => tile,
    (tile) => tile === 12 ? 0 : 0.2
  );
  expect(shapePreferred.get("0:0") === 12, "shoreline alignment should use local shape fit to break equally aligned variant choices");

  const adjoiningCenter = planForExistingTile(buildSmartTerrainChanges, tileset, 9, 10, 60, 10, 10, "water");
  expect(adjoiningCenter.neighborMask === 8 && adjoiningCenter.to === 43, "water painted east of full water should connect west with reviewed cap tile 43");

  const adjoiningState = planForExistingTile(buildSmartTerrainChanges, tileset, 9, 10, 1060, 10, 10, "water");
  expect(adjoiningState.neighborMask === 8 && adjoiningState.to === 43, "water should connect through an adjoining state-banded full-water tile");

  const blockedByLandSide = planForExistingTile(buildSmartTerrainChanges, tileset, 9, 10, 2, 10, 10, "water");
  expect(blockedByLandSide.neighborMask === 0, "water should not connect through the land-facing east side of shoreline tile 2");

  const connectedWaterSide = planForExistingTile(buildSmartTerrainChanges, tileset, 11, 10, 2, 10, 10, "water");
  expect(connectedWaterSide.neighborMask === 2 && connectedWaterSide.to === 41, "water should connect to the reviewed west-facing water side of shoreline tile 2");

  const loadedAtlas = { image: {} };
  const verticalStream = planForMask(buildSmartTerrainChanges, tileset, [
    { x: 10, y: 10 },
    { x: 10, y: 11 },
    { x: 10, y: 12 },
    { x: 10, y: 13 },
    { x: 10, y: 14 }
  ], "water", loadedAtlas);
  expectStreamCell(verticalStream, 10, 10, 4, 42, "vertical stream north endpoint");
  expectStreamCell(verticalStream, 10, 11, 5, 38, "vertical stream interior");
  expectStreamCell(verticalStream, 10, 12, 5, 38, "vertical stream interior");
  expectStreamCell(verticalStream, 10, 13, 5, 38, "vertical stream interior");
  expectStreamCell(verticalStream, 10, 14, 1, 40, "vertical stream south endpoint");
  expect(verticalStream.profileConfidence === "reviewed-rules", "a fully audited vertical stream should report reviewed-rule confidence");

  const horizontalStream = planForMask(buildSmartTerrainChanges, tileset, [
    { x: 10, y: 10 },
    { x: 11, y: 10 },
    { x: 12, y: 10 },
    { x: 13, y: 10 },
    { x: 14, y: 10 }
  ], "water", loadedAtlas);
  expectStreamCell(horizontalStream, 10, 10, 2, 41, "horizontal stream west endpoint");
  expectStreamCell(horizontalStream, 11, 10, 10, 39, "horizontal stream interior");
  expectStreamCell(horizontalStream, 12, 10, 10, 39, "horizontal stream interior");
  expectStreamCell(horizontalStream, 13, 10, 10, 39, "horizontal stream interior");
  expectStreamCell(horizontalStream, 14, 10, 8, 43, "horizontal stream east endpoint");
  expect(horizontalStream.profileConfidence === "reviewed-rules", "a fully audited horizontal stream should report reviewed-rule confidence");

  const curvedStream = planForMask(buildSmartTerrainChanges, tileset, [
    { x: 10, y: 10 }, { x: 10, y: 11 }, { x: 10, y: 12 },
    { x: 11, y: 12 }, { x: 12, y: 12 }, { x: 12, y: 13 },
    { x: 12, y: 14 }, { x: 13, y: 14 }, { x: 14, y: 14 }
  ], "water", loadedAtlas);
  expectStreamCell(curvedStream, 10, 11, 5, 38, "curved stream vertical approach");
  expectStreamCell(curvedStream, 10, 12, 3, 50, "curved stream southeast bend");
  expectStreamCell(curvedStream, 11, 12, 10, 39, "curved stream horizontal segment");
  expectStreamCell(curvedStream, 12, 12, 12, 49, "curved stream southwest bend");
  expectStreamCell(curvedStream, 12, 13, 5, 38, "curved stream second vertical segment");
  expectStreamCell(curvedStream, 12, 14, 3, 50, "curved stream second southeast bend");
  expect(curvedStream.profileConfidence === "reviewed-rules", "a curved one-cell stream should remain entirely on reviewed narrow-water rules");

  const openPath = [{ x: 2, y: 2 }, { x: 2, y: 6 }, { x: 6, y: 6 }, { x: 6, y: 3 }];
  expect(filledClosedSmartBrushPathCells(openPath, { width: 10, height: 10 }).length === 0, "an open Smart Brush stroke should not fill a lasso interior");
  const closedPath = [...openPath, { x: 2, y: 2 }];
  expect(filledClosedSmartBrushPathCells(closedPath, { width: 10, height: 10 }).length > 0, "a Smart Brush stroke closed on its starting cell should fill its interior");
  expect(sameSmartBrushMask([{ x: 1, y: 1 }, { x: 2, y: 2 }], [{ x: 2, y: 2 }, { x: 1, y: 1 }]), "Smart Brush mask history should compare snapshots independent of insertion order");
  const diagonalStroke = orthogonalSmartBrushPathCells({ x: 2, y: 2 }, { x: 5, y: 5 });
  expect(diagonalStroke.length === 7, "diagonal Smart Brush movement should interpolate a connected four-directional path");
  expect(diagonalStroke.every((cell, index) => index === 0 || Math.abs(cell.x - diagonalStroke[index - 1].x) + Math.abs(cell.y - diagonalStroke[index - 1].y) === 1), "interpolated Smart Brush cells should never connect only at a corner");

  const broadNorthEastCorner = planForMask(buildSmartTerrainChanges, tileset, [
    { x: 20, y: 20 }, { x: 19, y: 20 }, { x: 20, y: 21 }, { x: 19, y: 21 }
  ], "water");
  expectStreamCell(broadNorthEastCorner, 20, 20, 76, 26, "broad water northeast shoreline corner");
  const broadNorthEastNotch = planForMask(buildSmartTerrainChanges, tileset, [
    { x: 19, y: 19 }, { x: 20, y: 19 },
    { x: 19, y: 20 }, { x: 20, y: 20 }, { x: 21, y: 20 },
    { x: 19, y: 21 }, { x: 20, y: 21 }, { x: 21, y: 21 }
  ], "water");
  expectStreamCell(broadNorthEastNotch, 20, 20, 239, 29, "broad water northeast shoreline notch");

  const narrowStreamRules = new Map([
    [1, 40], [2, 41], [3, 50], [4, 42], [5, 38], [6, 48], [7, 45],
    [8, 43], [9, 51], [10, 39], [11, 44], [12, 49], [13, 47], [14, 46]
  ]);
  for (const [cardinalMask, tile] of narrowStreamRules) {
    const plan = planForCardinalContext(buildSmartTerrainChanges, tileset, 20, 20, cardinalMask, loadedAtlas);
    expectStreamCell(plan, 20, 20, cardinalMask, tile, `reviewed narrow-stream rule ${cardinalMask}`);
  }

  const adjoiningForest = planForExistingTile(buildSmartTerrainChanges, tileset, 9, 10, 121, 10, 10, "forest");
  expect(adjoiningForest.neighborMask === 8 && adjoiningForest.to >= 121 && adjoiningForest.to <= 129, "forest should resolve against adjoining reviewed forest terrain");
  const diagonalForestGap = planForMask(buildSmartTerrainChanges, tileset, [
    { x: 10, y: 9 }, { x: 11, y: 9 },
    { x: 9, y: 10 }, { x: 10, y: 10 }, { x: 11, y: 10 },
    { x: 9, y: 11 }, { x: 10, y: 11 }, { x: 11, y: 11 }
  ], "forest");
  const diagonalForestCell = diagonalForestGap.cells.find((entry) => entry.x === 10 && entry.y === 10);
  expect(diagonalForestCell?.neighborMask === 127, "forest interior with one missing diagonal should retain its exact topology mask");
  expect(diagonalForestCell?.role === "center" && diagonalForestCell?.to === 121 && diagonalForestCell?.source === "center", "forest interior with one missing diagonal should use solid center art");

  const mountainMask = [
    { x: 10, y: 9 }, { x: 11, y: 9 },
    { x: 10, y: 10 }, { x: 11, y: 10 },
    { x: 10, y: 11 }, { x: 11, y: 11 }
  ];
  const mountainAtWater = planForMaskWithExistingTile(buildSmartTerrainChanges, tileset, 9, 10, 60, mountainMask, 10, 10, "mountains");
  expect(mountainAtWater.role === "west" && mountainAtWater.to === 90, "mountains should use the reviewed west wall-to-water edge beside connected water");
  const mountainAtLandSide = planForMaskWithExistingTile(buildSmartTerrainChanges, tileset, 9, 10, 2, mountainMask, 10, 10, "mountains");
  expect(mountainAtLandSide.role === "west" && mountainAtLandSide.to >= 77 && mountainAtLandSide.to <= 79, "mountains should use wall-to-land variants beside a shoreline's land-facing side");

  const generated = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Adjoining Smart Terrain" },
    maps: [
      {
        levelType: "land",
        index: 0,
        landlook: 0,
        fillTile: 156,
        operations: [
          { kind: "rect", x: 9, y: 10, width: 1, height: 1, tile: 60 },
          { kind: "terrainGroup", terrain: "water", geometry: { kind: "rect", x: 10, y: 10, width: 1, height: 1 } }
        ]
      },
      {
        levelType: "land",
        index: 1,
        landlook: 0,
        fillTile: 156,
        operations: [
          { kind: "rect", x: 9, y: 10, width: 1, height: 1, tile: 2 },
          { kind: "terrainGroup", terrain: "water", geometry: { kind: "rect", x: 10, y: 10, width: 1, height: 1 } }
        ]
      },
      {
        levelType: "land",
        index: 2,
        landlook: 0,
        fillTile: 156,
        operations: [
          { kind: "rect", x: 9, y: 10, width: 1, height: 1, tile: 60 },
          { kind: "terrainGroup", terrain: "mountains", geometry: { kind: "rect", x: 10, y: 9, width: 2, height: 3 } }
        ]
      }
    ]
  }, { now: "2026-07-11T00:00:00.000Z", appVersion: "fixture" });
  expect(generated.ok, "Scenario JSON adjoining-terrain fixture should compile");
  if (generated.ok) {
    expect(tileAt(generated.project.maps[0].tiles, 10, 10) === 43, "Scenario JSON terrain groups should connect to adjoining full water");
    expect(tileAt(generated.project.maps[1].tiles, 10, 10) !== 43, "Scenario JSON terrain groups should not connect through an adjoining shoreline's land-facing side");
    expect(tileAt(generated.project.maps[2].tiles, 10, 10) === 90, "Scenario JSON mountain groups should select the reviewed wall-to-water edge beside connected water");
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Smart terrain brush checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Smart terrain brush checks passed.");

function planForExistingTile(buildSmartTerrainChanges, tileset, existingX, existingY, existingTile, paintX, paintY, preset) {
  const map = fixtureMap();
  map.tiles[existingX * map.height + existingY] = existingTile;
  const plan = buildSmartTerrainChanges(map, [{ x: paintX, y: paintY }], preset, tileset, null);
  expect(plan.cells.length === 1, `${preset}: expected one Smart Brush preview cell`);
  return plan.cells[0] ?? { neighborMask: -1, to: -1 };
}

function planForMask(buildSmartTerrainChanges, tileset, mask, preset, atlas = null) {
  return buildSmartTerrainChanges(fixtureMap(), mask, preset, tileset, atlas);
}

function expectStreamCell(plan, x, y, neighborMask, tile, label) {
  const cell = plan.cells.find((entry) => entry.x === x && entry.y === y);
  expect(Boolean(cell), `${label}: expected a Smart Brush preview cell at ${x},${y}`);
  if (!cell) return;
  expect(cell.neighborMask === neighborMask, `${label}: expected neighbor mask ${neighborMask}, received ${cell.neighborMask}`);
  expect(cell.to === tile, `${label}: expected reviewed stream tile ${tile}, received ${cell.to}`);
  expect(cell.source === "curated-mask", `${label}: expected the reviewed mask rule to remain authoritative with a loaded atlas`);
}

function planForCardinalContext(buildSmartTerrainChanges, tileset, x, y, mask, atlas) {
  const map = fixtureMap();
  if (mask & 1) map.tiles[x * map.height + y - 1] = 60;
  if (mask & 2) map.tiles[(x + 1) * map.height + y] = 60;
  if (mask & 4) map.tiles[x * map.height + y + 1] = 60;
  if (mask & 8) map.tiles[(x - 1) * map.height + y] = 60;
  return buildSmartTerrainChanges(map, [{ x, y }], "water", tileset, atlas);
}

function planForMaskWithExistingTile(buildSmartTerrainChanges, tileset, existingX, existingY, existingTile, mask, targetX, targetY, preset) {
  const map = fixtureMap();
  map.tiles[existingX * map.height + existingY] = existingTile;
  const plan = buildSmartTerrainChanges(map, mask, preset, tileset, null);
  const cell = plan.cells.find((entry) => entry.x === targetX && entry.y === targetY);
  expect(Boolean(cell), `${preset}: expected target Smart Brush preview cell at ${targetX},${targetY}`);
  return cell ?? { role: "single", to: -1 };
}

function fixtureMap() {
  return {
    id: "land:0",
    levelType: "land",
    index: 0,
    name: "Smart Terrain Fixture",
    width: 90,
    height: 90,
    tiles: new Array(8100).fill(156),
    render: { mode: "land-tiles", landlook: 0 }
  };
}

function tileAt(tiles, x, y) {
  return tiles[x * 90 + y];
}

function syntheticEdgeSignature(tile) {
  const flat = [0, 0, 0, 0];
  const profiles = {
    11: { east: [0, 0, 0, 0], west: flat },
    12: { east: [1, 1, 0, 0], west: flat },
    19: { west: [1, 1, 0, 0], east: flat },
    20: { west: [0, 0, 1, 1], east: flat }
  };
  const profile = profiles[tile];
  return profile ? { north: flat, east: profile.east, south: flat, west: profile.west } : null;
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}
