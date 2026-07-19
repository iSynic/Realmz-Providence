import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const { buildSync } = requireFromRoot("esbuild");
const fixturesDir = path.join(root, "fixtures", "scenario-seeds");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "providence-seed-fixtures-"));
const failures = [];

try {
  const modulePath = path.join(tmpDir, "scenarioSeed.cjs");
  buildSync({
    entryPoints: [path.join(root, "src", "editor", "scenarioSeed.ts")],
    outfile: modulePath,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "silent"
  });
  const requireFromFixture = createRequire(path.join(tmpDir, "fixture.cjs"));
  const { createProjectFromScenarioSeed, parseScenarioSeed } = requireFromFixture(modulePath);

  checkMinimal(createProjectFromScenarioSeed, parseScenarioSeed);
  checkBaseTemplate(createProjectFromScenarioSeed);
  checkMapOperations(createProjectFromScenarioSeed);
  checkOrganicMapOperations(createProjectFromScenarioSeed);
  checkDirectAp(createProjectFromScenarioSeed);
  checkEdcdAp(createProjectFromScenarioSeed);
  checkSimpleEncounter(createProjectFromScenarioSeed);
  checkSimpleEncounterOptions(createProjectFromScenarioSeed);
  checkComplexEncounters(createProjectFromScenarioSeed);
  checkThiefEncounters(createProjectFromScenarioSeed);
  checkItems(createProjectFromScenarioSeed);
  checkMonsters(createProjectFromScenarioSeed);
  checkConditionBranches(createProjectFromScenarioSeed);
  checkActionPointMutations(createProjectFromScenarioSeed);
  checkRuntimeState(createProjectFromScenarioSeed);
  checkPartyRuntime(createProjectFromScenarioSeed);
  checkSpells(createProjectFromScenarioSeed);
  checkRuleOverrides(createProjectFromScenarioSeed);
  checkRandomRectangles(createProjectFromScenarioSeed);
  checkBattleOutcomes(createProjectFromScenarioSeed);
  checkCombatMacros(createProjectFromScenarioSeed);
  checkAssets(createProjectFromScenarioSeed);
  checkTimedEncounters(createProjectFromScenarioSeed);
  checkInvalid(createProjectFromScenarioSeed, parseScenarioSeed);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Scenario seed fixture check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Scenario seed fixture check passed.");

function checkMinimal(createProjectFromScenarioSeed, parseScenarioSeed) {
  const seed = readSeed("minimal-keyed.seed.json");
  const parsed = parseScenarioSeed(seed);
  expect(parsed.ok, "minimal keyed seed should parse");
  const result = createProjectFromScenarioSeed(seed, { now: "2026-07-10T00:00:00.000Z", appVersion: "fixture" });
  expect(result.ok, "minimal keyed seed should create a project");
  if (!result.ok) return;
  expect(!result.warnings.some((warning) => warning.startsWith("Allocated ")), "allocation report entries should not be duplicated as warnings");
  expect(result.project.messages.length === 1, "minimal seed should create one message");
  expect(result.project.scenario.shell?.landLevel === 0 && result.project.scenario.shell.lookX === 10 && result.project.scenario.shell.lookY === 12, "minimal seed should author Startup Info from scenario.start");
  expect(allocationId(result, "messages", "hello") === 0, "hello message should allocate to ID 0");
  expect(allocationId(result, "quests", "started") === 1, "started quest should allocate to runtime-valid ID 1");
  expect(allocationId(result, "actionPoints", "start-ap") === 0, "start-ap should allocate to record 0");
  expect(result.project.triggers[0]?.coordinate?.x === 10 && result.project.triggers[0]?.coordinate?.y === 12, "start-ap should use named region coordinates");
  expect(actionCodes(result.project.triggers[0]).join(",") === "1,47", "minimal AP should emit message and set quest opcodes");

  const invalidStart = parseScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Invalid Start", start: { landLevel: 2, x: 90, y: 0 } },
    maps: [{ levelType: "land", index: 0 }]
  });
  expect(!invalidStart.ok && invalidStart.errors.some((error) => error.includes("$.scenario.start.x must be less than or equal to 89")), "scenario.start should reject coordinates outside the Realmz map");
  expect(!invalidStart.ok && invalidStart.errors.some((error) => error.includes("does not resolve to a declared land map")), "scenario.start should resolve to a declared land map");
}

function checkBaseTemplate(createProjectFromScenarioSeed) {
  const templateResult = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Starter Baseline" },
    messages: [{ id: 77, text: "Template message" }],
    quests: [{ id: 44, label: "Template quest" }],
    actionPoints: [{ recordIndex: 8, x: 1, y: 1, steps: [{ kind: "message", message: 77 }] }],
    extraActionPoints: [{ id: 9, steps: [{ kind: "takeGold", amount: 2 }] }]
  });
  expect(templateResult.ok, "base template fixture should create its caller-provided starter project");
  if (!templateResult.ok) return;
  const template = templateResult.project;
  template.maps[0].tiles[0] = 222;
  template.maps[0].tiles[1 * 90 + 1] = 3156;
  template.scenario.shell.recLevel = 7;
  template.source.origin = "imported";
  template.source.rawSourcesDir = "template-raw";
  template.assets = [{ ...mockCustomAsset("asset:template:picture", "picture", "PICT", 30000), libraryScope: "scenario" }];

  const result = createProjectFromScenarioSeed(readSeed("base-template.seed.json"), { baseTemplates: { starter: template } });
  expect(result.ok, "seed should create a project from a caller-provided base template");
  if (!result.ok) return;
  expect(result.allocations.baseTemplate === "starter", "allocation report should identify the selected base template");
  expect(result.project.scenario.name === "Generated From Starter" && result.project.scenario.shell?.sourceFile === "Generated From Starter", "template scenario identity should be rewritten for the generated project");
  expect(result.project.scenario.shell?.recLevel === 7, "omitted scenario shell fields should inherit from the base template");
  expect(result.project.maps[0]?.tiles?.[0] === 222, "omitted map family should inherit from the base template");
  expect(result.project.maps[0]?.tiles?.[1 * 90 + 1] === 3156, "replacing an inherited Action Point should preserve an independent hidden land Secret Area at its old coordinate");
  const replacementMarker = tileAt(result.project.maps[0]?.tiles ?? [], 4, 5);
  expect(replacementMarker === 1156, `replacement Action Points should synchronize their normal trigger markers into inherited maps (got ${replacementMarker})`);
  expect(result.project.messages.some((message) => message.id === 77 && message.text === "Template message"), "omitted message family should inherit from the base template");
  expect(result.project.questLabels.length === 0, "an explicitly declared empty family should replace inherited template records");
  expect(result.project.assets[0]?.id === "asset:template:picture", "omitted asset family should inherit scenario assets from the base template");
  expect(result.project.source.origin === "imported", "an imported template should retain its compatibility boundary");
  expect(result.project.source.rawSourcesDir === "template-raw", "template raw-source metadata should remain available as baseline evidence");
  expect(result.project.triggers.filter((trigger) => trigger.source !== "Data ED3").length === 1, "declared map Action Points should replace template map Action Points");
  expect(result.project.triggers.some((trigger) => trigger.source === "Data ED3" && trigger.recordIndex === 9), "omitted Extra Action Points should inherit from the template");
  expect(result.project.extracodes.map((row) => `${row.id}:${row.values[0]}`).join(",") === "0:2,1:1", "new EDCD settings should append after inherited template rows");
  expect(template.scenario.name === "Starter Baseline" && template.scenario.shell?.sourceFile === "Starter Baseline" && template.maps[0]?.tiles?.[0] === 222, "template selection should not mutate the caller-provided project");
}

function checkMapOperations(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("map-operations.seed.json"));
  expect(result.ok, "map operations seed should create a project");
  if (!result.ok) return;
  expect(result.project.validation.ok, "map operation seed runtime metadata should pass project validation");
  const tiles = result.project.maps[0]?.tiles ?? [];
  expect(tileAt(tiles, 0, 0) === 8, "line operation should write tile 8 at 0,0");
  expect(tileAt(tiles, 4, 0) === 8, "line operation should write tile 8 at 4,0");
  expect(tileAt(tiles, 2, 2) === 7, "rect operation should write tile 7 at 2,2");
  expect(tileAt(tiles, 4, 3) === 7, "rect operation should write tile 7 at 4,3");
  expect(tileAt(tiles, 5, 6) === 9, "path operation should write tile 9 at 5,6");
  expect(tileAt(tiles, 7, 7) === 9, "path operation should write tile 9 at 7,7");
  expect(tileAt(tiles, 10, 4) === 10 && tileAt(tiles, 11, 4) === 10, "border thickness should paint both left edge columns");
  expect(tileAt(tiles, 12, 4) === 156, "border operation should preserve its interior");
  expect(tileAt(tiles, 20, 2) === 11, "room operation should paint wall tiles");
  expect(tileAt(tiles, 22, 4) === 12, "room operation should paint floor tiles");
  expect(tileAt(tiles, 23, 2) === 13, "room north door should replace its wall tile");
  expect(tileAt(tiles, 26, 6) === 14, "room east door should replace its wall tile");
  expect(tileAt(tiles, 4, 11) === 15 && tileAt(tiles, 4, 13) === 15, "wide road should paint its full width");
  expect(tileAt(tiles, 10, 14) === 16 && tileAt(tiles, 11, 14) === 16, "even-width river should paint deterministically toward positive coordinates");
  expect(tileAt(tiles, 73, 40) === 134, "semantic roads should compile a four-way junction from crossing paths");
  expect(tileAt(tiles, 72, 40) === 132 && tileAt(tiles, 73, 39) === 133, "semantic roads should compile horizontal and vertical straight tiles");
  expect(tileAt(tiles, 70, 40) === 143 && tileAt(tiles, 76, 40) === 145 && tileAt(tiles, 73, 37) === 144 && tileAt(tiles, 73, 43) === 146, "semantic roads should orient all four endpoint tiles toward their neighbors");
  expect(tileAt(tiles, 60, 44) === 141 && tileAt(tiles, 50, 55) === 139 && tileAt(tiles, 40, 55) === 140 && tileAt(tiles, 34, 55) === 142, "semantic roads should compile all four visually verified directional bends");
  expect(tileAt(tiles, 73, 50) === 136 && tileAt(tiles, 73, 60) === 135 && tileAt(tiles, 60, 65) === 137 && tileAt(tiles, 50, 65) === 138, "semantic roads should compile all four directional T-junctions");
  expect(tileAt(tiles, 20, 12) === 21 && tileAt(tiles, 22, 13) === 26, "stamp should preserve its two-dimensional tile pattern");
  expect(tileAt(tiles, 80, 11) === 111, "named tile placement should resolve a Plains cave transition without exposing its tile ID");
  expect(tileAt(tiles, 81, 12) === 54, "named tile placement should resolve its 1-based audited variant");
  expect(tileAt(tiles, 82, 20) === -75 && tileAt(tiles, 83, 20) === -74 && tileAt(tiles, 82, 21) === -73 && tileAt(tiles, 83, 21) === -72, "named stamps should place the complete audited special-tile footprint");
  expect(tiles[80 * 90 + 11] === 111, "land map operations should store asymmetric coordinates in Realmz column-major order");
  expect(tileAt(tiles, 43, 23) === 60, "semantic water terrain should use the learned plains center tile");
  expect(tileAt(tiles, 40, 20) === 25, "semantic water terrain should compile a southeast-connected quarter-water corner to tile 25");
  expect(tileAt(tiles, 55, 23) >= 61 && tileAt(tiles, 55, 23) <= 85, "semantic mountain terrain should use a land-edge mountain tile away from water");
  expect(tileAt(tiles, 67, 22) === 121, "semantic forest terrain should use the learned plains center tile");
  expect(tileAt(tiles, 65, 20) >= 121 && tileAt(tiles, 65, 20) <= 129, "semantic forest terrain should compile its corner to a structural forest tile");
  expect(tileAt(tiles, 75, 32) === 38, "semantic one-cell water paths should compile north/south segments to narrow stream tile 38");
  expect(tileAt(tiles, 75, 30) === 42 && tileAt(tiles, 75, 34) === 40, "semantic one-cell water paths should compile directional land-transition caps");
  expect(tileAt(tiles, 30, 12) === 3181, "combat-clearing terrain should retain its authored hidden Secret Area state and Action Point marker");
  expect(tileAt(tiles, 31, 12) === 2169, "default hidden walkable terrain should support an already revealed Secret Area state without an Action Point");
  expect(tileAt(tiles, 32, 12) === 1156, "generated land Action Points should write the normal trigger marker into their map cell");
  const dungeonTiles = result.project.maps.find((map) => map.levelType === "dungeon")?.tiles ?? [];
  const dungeonMap = result.project.maps.find((map) => map.levelType === "dungeon");
  expect(dungeonMap?.source === "Data DL" && dungeonMap.provenance.sourceFile === "Data DL", "Dungeon seed maps should use the Data DL runtime source");
  expect(tileAt(dungeonTiles, 4, 4, "dungeon") === 0x1501, "generated dungeon Action Points should preserve directional secret-passage flags and add the trigger marker");
  expect(tileAt(dungeonTiles, 7, 4, "dungeon") === 77 && dungeonTiles[4 * 90 + 7] === 77, "dungeon map operations should retain row-major storage");
  const castleTiles = result.project.maps.find((map) => map.levelType === "land" && map.index === 1)?.tiles ?? [];
  expect(tileAt(castleTiles, 1, 1) === 59 && tileAt(castleTiles, 2, 1) === 96, "Castle operations should keep combat-clearing tile 59 distinct from default hidden-walkable tile 96");
  expect(tileAt(castleTiles, 10, 20) === 146 && tileAt(castleTiles, 11, 21) === 155, "Castle named tiles should resolve audited fixtures and variants");
  expect(tileAt(castleTiles, 20, 30) === 158 && tileAt(castleTiles, 21, 30) === 161 && tileAt(castleTiles, 22, 30) === 162, "named stamp variants should place the audited food-table composition");
  expect(tileAt(castleTiles, 30, 30) === 187 && tileAt(castleTiles, 31, 30) === 188 && tileAt(castleTiles, 30, 31) === 190 && tileAt(castleTiles, 31, 31) === 191, "named stamps should place the audited north-wall open door composition");
  const castleRandomLevel = result.project.randomLevels.find((level) => level.levelType === "land" && level.levelIndex === 1);
  expect(castleRandomLevel?.landlook === 4 && castleRandomLevel.isDark && castleRandomLevel.useLos, "Castle seed settings should populate decoded random-level metadata");
  expect(castleRandomLevel?.rawValues == null, "Castle seed settings should remain semantic until the native Data RD compiler runs");
  const dungeonRandomLevel = result.project.randomLevels.find((level) => level.levelType === "dungeon" && level.levelIndex === 0);
  expect(dungeonRandomLevel?.source === "Data RDD" && dungeonRandomLevel.provenance.sourceFile === "Data RDD", "Dungeon seed metadata should use the Data RDD runtime source");
  const semanticLandlooks = [
    { index: 2, name: "Desert", hidden: [169, 184], combat: [180, 185] },
    { index: 3, name: "Swamp", hidden: [169], combat: [180] },
    { index: 4, name: "Snow", hidden: [169], combat: [180] }
  ];
  for (const landlook of semanticLandlooks) {
    const semanticTiles = result.project.maps.find((map) => map.levelType === "land" && map.index === landlook.index)?.tiles ?? [];
    expect(tileAt(semanticTiles, 12, 12) === 60, `${landlook.name} semantic water should use the reviewed center tile`);
    expect(tileAt(semanticTiles, 22, 12) === 61, `${landlook.name} semantic barriers should use the reviewed mountain/bank/ridge center tile`);
    expect(tileAt(semanticTiles, 32, 12) === 121, `${landlook.name} semantic forest should use the reviewed grove center tile`);
    landlook.hidden.forEach((tile, offset) => expect(tileAt(semanticTiles, 40 + offset, 10) === tile, `${landlook.name} hidden-walkable operation should preserve tile ${tile}`));
    landlook.combat.forEach((tile, offset) => expect(tileAt(semanticTiles, 40 + landlook.hidden.length + offset, 10) === tile, `${landlook.name} combat-clearing operation should preserve tile ${tile}`));
    const expectedNamedTile = landlook.name === "Desert" ? 130 : landlook.name === "Swamp" ? 188 : 160;
    expect(tileAt(semanticTiles, 50, 10) === expectedNamedTile, `${landlook.name} named tile should resolve the selected landlook-specific variant`);
    if (landlook.name === "Snow") {
      expect(tileAt(semanticTiles, 55, 10) === 153 && tileAt(semanticTiles, 55, 11) === 154, "Snow named stamps should resolve a landlook-compatible tall-tree variant");
    }
    expect(tileAt(semanticTiles, 60, 10) === 143 && tileAt(semanticTiles, 61, 10) === 132 && tileAt(semanticTiles, 62, 10) === 145, `${landlook.name} semantic roads should use the aligned audited road grammar`);
  }
  for (const landlook of [{ index: 5, name: "Alternate Plains" }, { index: 6, name: "Subterranean" }]) {
    const semanticTiles = result.project.maps.find((map) => map.levelType === "land" && map.index === landlook.index)?.tiles ?? [];
    expect(tileAt(semanticTiles, 10, 10) === 143 && tileAt(semanticTiles, 11, 10) === 132 && tileAt(semanticTiles, 12, 10) === 145, `${landlook.name} semantic roads should use the aligned audited road grammar`);
  }
}

function checkOrganicMapOperations(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("organic-map.seed.json"));
  expect(result.ok, "organic map seed should create a project");
  if (!result.ok) return;
  const island = result.project.maps.find((map) => map.id === "land:0");
  const tiles = island?.tiles ?? [];
  expect(tileAt(tiles, 0, 0) === 60 && tileAt(tiles, 89, 89) === 60, "landmass should surround the generated island with full water");
  const coastXs = [];
  for (let y = 22; y <= 68; y++) {
    for (let x = 0; x < 45; x++) {
      if (tileAt(tiles, x, y) !== 60) {
        coastXs.push(x);
        break;
      }
    }
  }
  expect(new Set(coastXs).size >= 6, "rough landmass should produce a varied coastline instead of one rectangular edge");
  expect(tileAt(tiles, 28, 62) === 121, "blob forest should retain a reviewed center tile");
  expect(tileAt(tiles, 20, 56) === 156, "blob forest should not fill its complete bounding rectangle");
  const normalized = tiles.map((tile) => Math.abs(tile) % 1000);
  expect(normalized.filter((tile) => tile >= 130 && tile <= 146).length >= 30, "semanticRoute should connect named regions with audited road tiles");
  expect(normalized.some((tile) => tile >= 135 && tile <= 142), "natural semanticRoute should include at least one bend or junction");
  expect(Math.abs(tileAt(tiles, 61, 28)) === 1033, "stamp-owned regions should place Action Points on the selected special-tile anchor");
  expect(tileAt(tiles, 70, 60) === 111, "named tile-owned regions should preserve the semantic portal tile");
  expect(result.allocations.regions.some((region) => region.key === "cave-door" && region.x === 70 && region.y === 60), "named tile-owned regions should be included in allocation reports");
  const decorated = normalized.filter((tile) => (tile >= 118 && tile <= 120) || (tile >= 148 && tile <= 154) || (tile >= 159 && tile <= 167));
  expect(decorated.length >= 10, "naturalScatter should add a sparse mix of reviewed natural details");
  expect(normalized.includes(148), "naturalScatter should retain an occasional landmark in a sufficiently large decorated area");
  expect(normalized.includes(151) && normalized.includes(152) || normalized.includes(153) && normalized.includes(154), "naturalScatter should retain a coherent tall-tree stamp in a sufficiently large compatible area");
  const repeated = createProjectFromScenarioSeed(readSeed("organic-map.seed.json"));
  expect(repeated.ok && JSON.stringify(repeated.project.maps[0]?.tiles) === JSON.stringify(tiles), "naturalScatter and organic terrain should be deterministic for the same seed");

  const smoothed = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Smoothed Blob" },
    maps: [{
      levelType: "land",
      index: 0,
      landlook: 0,
      fillTile: 156,
      operations: [{ kind: "terrainGroup", terrain: "mountains", geometry: { kind: "blob", x: 30, y: 18, radiusX: 14, radiusY: 5, roughness: 35 } }]
    }]
  });
  expect(smoothed.ok, "smoothed mountain blob should compile");
  if (smoothed.ok) {
    const smoothedTiles = smoothed.project.maps[0]?.tiles ?? [];
    expect(tileAt(smoothedTiles, 16, 17) === 156, "blob smoothing should remove unsupported three-neighbor mountain caps");
    expect(tileAt(smoothedTiles, 17, 17) >= 77 && tileAt(smoothedTiles, 17, 17) <= 79, "blob smoothing should expose the remaining mountain edge toward the west");
  }

  const tower = result.project.maps.find((map) => map.id === "land:1")?.tiles ?? [];
  expect(tileAt(tower, 0, 0) === 40, "Castle seed maps should preserve solid tile 40 outside semantic rooms");
  expect(tileAt(tower, 11, 11) === 111, "castleRoom should resolve its interior floor semantically");
  expect(tileAt(tower, 15, 10) === 65 && tileAt(tower, 30, 15) === 39 && tileAt(tower, 15, 27) === 38 && tileAt(tower, 10, 15) === 64, "castleRoom should resolve all solid-void wall transitions");
  expect(tileAt(tower, 10, 10) === 36 && tileAt(tower, 30, 10) === 37 && tileAt(tower, 10, 27) === 34 && tileAt(tower, 30, 27) === 35, "castleRoom should resolve all solid-void corner transitions");
  expect(tileAt(tower, 20, 27) === 1077, "castleRoom door-owned regions should orient the door and place its Action Point on that cell");
  expect(result.project.extracodes.some((row) => row.values[0] === 1 && row.values[1] === 20 && row.values[2] === 25), "named teleport destinations should resolve the target map and region coordinates");
  expect(!result.diagnostics.some((diagnostic) => diagnostic.code === "teleport-destination-action-point"), "separate arrival and exit regions should avoid teleport-chain warnings");

  const collision = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Teleport Collision" },
    maps: [{
      key: "field",
      levelType: "land",
      index: 0,
      regions: [{ key: "entry", x: 10, y: 10 }, { key: "exit", x: 11, y: 10 }]
    }],
    actionPoints: [
      { key: "enter-ap", map: "field", at: "entry", steps: [{ kind: "teleport", at: "exit" }] },
      { key: "exit-ap", map: "field", at: "exit", steps: [{ kind: "teleport", at: "entry" }] }
    ]
  });
  expect(collision.ok && collision.diagnostics.some((diagnostic) => diagnostic.code === "teleport-destination-action-point"), "teleports that land on teleport Action Points should return a structured topology warning");

  const blockedRoute = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Blocked Route", start: { landLevel: 0, x: 5, y: 5 } },
    maps: [{
      key: "water",
      levelType: "land",
      index: 0,
      landlook: 0,
      fillTile: 60,
      regions: [{ key: "west", x: 5, y: 5 }, { key: "east", x: 10, y: 5 }],
      operations: [{ kind: "semanticRoute", connections: [["west", "east"]] }]
    }]
  });
  expect(blockedRoute.ok && blockedRoute.diagnostics.some((diagnostic) => diagnostic.code === "semantic-route-unreachable"), "semantic routes blocked by terrain should warn instead of drawing through it");
  expect(blockedRoute.ok && blockedRoute.diagnostics.some((diagnostic) => diagnostic.code === "site-on-water"), "scenario starts placed on water should return a structured site warning");

  const misplacedTerrainFeature = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Misplaced Terrain Feature" },
    maps: [{
      key: "field",
      levelType: "land",
      index: 0,
      landlook: 0,
      fillTile: 156,
      operations: [
        { kind: "namedTile", x: 10, y: 10, name: "boat" },
        { kind: "hiddenWalkable", x: 11, y: 10 }
      ]
    }]
  });
  expect(misplacedTerrainFeature.ok && misplacedTerrainFeature.diagnostics.some((diagnostic) => diagnostic.code === "boat-off-water"), "boats placed away from reviewed water should return a structured warning");
  expect(misplacedTerrainFeature.ok && misplacedTerrainFeature.diagnostics.some((diagnostic) => diagnostic.code === "hidden-walkable-isolated"), "isolated hidden-walkable terrain should return a structured warning");

  const graveOnRoad = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Grave On Road" },
    maps: [{
      levelType: "land",
      index: 0,
      landlook: 0,
      fillTile: 156,
      operations: [
        { kind: "semanticRoad", paths: [[{ x: 10, y: 10 }, { x: 12, y: 10 }]] },
        { kind: "namedTile", x: 11, y: 10, name: "grave" }
      ]
    }]
  });
  expect(graveOnRoad.ok && graveOnRoad.diagnostics.some((diagnostic) => diagnostic.code === "feature-over-road"), "graves that overwrite semantic roads should return a structured placement warning");
}

function checkDirectAp(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("direct-ap.seed.json"));
  expect(result.ok, "direct AP seed should create a project");
  if (!result.ok) return;
  const trigger = result.project.triggers[0];
  expect(actionCodes(trigger).join(",") === "1,9,27,6,10,11,-14,111", "direct AP opcodes should match expected direct actions");
  expect(allocationId(result, "treasures", "cache") === 0, "treasure cache should allocate to ID 0");
  expect(allocationId(result, "shops", "shop") === 0, "shop should allocate to ID 0");
}

function checkEdcdAp(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("edcd-ap.seed.json"));
  expect(result.ok, "EDCD AP seed should create a project");
  if (!result.ok) return;
  const trigger = result.project.triggers.find((entry) => entry.id === "edcd") ?? result.project.triggers[1];
  expect(actionCodes(trigger).join(",") === "2,20,19,48,46,76,85,12", "EDCD AP opcodes should match expected actions");
  expect(result.project.extracodes.length === 8, "EDCD AP should create eight EDCD rows");
  expect(result.project.extracodes[0]?.values.join(",") === "0,0,0,0,0", "battle EDCD row should reference battle/message IDs");
  expect(result.project.extracodes[1]?.values.join(",") === "0,3,4,0,1", "teleport EDCD row should reference target and message");
  expect(result.project.extracodes[3]?.values.join(",") === "0,0,0,0,0", "selective battle EDCD row should reference battle and treasure IDs");
  expect(result.project.extracodes[4]?.values[3] === 0, "branch target should resolve to action point record 0");
}

function checkSimpleEncounter(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("simple-encounter.seed.json"));
  expect(result.ok, "simple encounter seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "messages", "door-prompt") === 0, "door-prompt should allocate to message ID 0");
  expect(allocationId(result, "simpleEncounters", "door-choice") === 0, "door-choice should allocate to simple encounter ID 0");
  const encounter = result.project.simpleEncounters[0];
  expect(encounter?.prompt === 0, "simple encounter prompt should resolve keyed message");
  expect(encounter?.texts?.[0] === "Try the latch" && encounter?.texts?.[1] === "Step away", "simple encounter option text should be preserved");
  expect(encounter?.choiceResults?.join(",") === "1,0,0,0", "simple encounter choice results should be padded to four entries");
  expect(encounter?.canBackOut === true, "simple encounter canBackOut should be preserved");
  expect(encounter?.maxTimes === 3 && encounter?.casteSuccess === -1, "simple encounter limits should be preserved");
  expect(encounter?.actions?.[0]?.slot === 0 && encounter?.actions?.[0]?.rawCode === 1 && encounter?.actions?.[0]?.id === 1, "simple encounter first action should be preserved");
  expect(encounter?.actions?.[1]?.slot === 3 && encounter?.actions?.[1]?.rawCode === -2 && encounter?.actions?.[1]?.id === 260, "simple encounter explicit action slot should be preserved");
  const trigger = result.project.triggers[0];
  expect(trigger?.actions?.[0]?.rawCode === 4 && trigger?.actions?.[0]?.id === 0, "AP should reference keyed simple encounter by allocated ID");
}

function checkSimpleEncounterOptions(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("simple-encounter-options.seed.json"));
  expect(result.ok, "semantic simple encounter seed should create a project");
  if (!result.ok) return;
  const encounter = result.project.simpleEncounters[0];
  expect(encounter?.texts?.join("|") === "Pay ten gold|Fight the guards|Leave|", "semantic simple options should populate the four display buffers");
  expect(encounter?.choiceResults?.join(",") === "1,2,3,0", "semantic simple options should map in order to result rows 1 through 3");
  expect(encounter?.actions?.map((action) => `${action.slot}:${action.rawCode}:${action.id}`).join(",") === "0:33:0,1:1:1,8:2:1,16:1:2", "semantic simple option steps should compile into fixed eight-slot result rows");
  expect(result.project.extracodes.map((row) => `${row.id}:${row.values.join(",")}`).join("|") === "0:10,0,0,0,0|1:2,2,0,0,0|2:0,8,9,0,2|3:1,0,0,0,0", "Simple, Complex, and AP semantic steps should share one collision-free EDCD allocation sequence");
  expect(result.project.triggers[0]?.actions?.map((action) => `${action.rawCode}:${action.id}`).join(",") === "4:0,5:0,33:3", "AP should resolve both keyed encounters and retain the shared EDCD row ID");
  expect(result.project.validation.errors.length === 0, "semantic simple encounter seed should pass project validation without errors");
}

function checkComplexEncounters(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("complex-encounters.seed.json"));
  expect(result.ok, "complex encounter seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "complexEncounters", "shrine-puzzle") === 2, "shrine-puzzle should preserve explicit complex encounter ID 2");
  expect(allocationId(result, "complexEncounters", "raw-complex-fallback") === 0, "raw complex fallback should allocate the first open ID");
  const encounter = result.project.complexEncounters.find((entry) => entry.id === 2);
  expect(encounter?.prompt === 0, "complex encounter prompt should resolve its message key");
  expect(encounter?.texts?.[0] === "Turn the wheel" && encounter?.texts?.[1] === "Pull the lever" && encounter?.texts?.[8] === "awaken", "complex encounter physical and word text should occupy their authored slots");
  expect(encounter?.groups?.join(",") === "0,1,0,0,0,0,0,0", "complex encounter required physical choices should use one-based author indexes");
  expect(encounter?.actionResult === 1 && encounter?.wordResult === 2, "complex encounter physical and word routes should preserve result numbers");
  expect(encounter?.spellIds?.[0] === 17 && encounter?.spellIds?.[1] === 1100 && encounter?.spellResults?.[0] === 3, "complex encounter spell response should preserve its result and pad blank spell slots");
  expect(encounter?.itemIds?.[0] === 901 && encounter?.itemResults?.[0] === 1, "complex encounter item response should resolve a scenario item key");
  expect(allocationId(result, "thiefEncounters", "shrine-rogue") === 3, "shrine-rogue should preserve explicit Rogue encounter ID 3");
  expect(encounter?.thief === true && encounter?.thiefSuccess === 3 && encounter?.thiefFail === 0, "complex encounter Rogue routing should point to Data TD2 and clear the unconsumed legacy byte");
  expect(encounter?.canBackOut === true && encounter?.maxTimes === 3 && encounter?.casteSuccess === -1, "complex encounter limits should be preserved");
  expect(encounter?.actions?.map((action) => `${action.slot}:${action.rawCode}`).join(",") === "0:1,1:20,8:33,9:21,24:2", "semantic result scripts should compile into the four eight-slot result rows");
  expect(result.project.extracodes[0]?.values.join(",") === "0,8,9,0,2", "complex result teleport should compile its keyed message into EDCD");
  expect(result.project.extracodes[1]?.values.join(",") === "25,0,0,0,0", "complex result gold action should compile into EDCD");
  expect(result.project.extracodes[2]?.values.join(",") === "901,2,1,0,0", "complex result item branch should resolve a keyed complex encounter target");
  expect(result.project.extracodes[3]?.values.join(",") === "4,4,0,0,0", "complex result battle should compile into EDCD without colliding with later script rows");
  const rawEncounter = result.project.complexEncounters.find((entry) => entry.id === 0);
  expect(rawEncounter?.actions?.map((action) => `${action.slot}:${action.rawCode}:${action.id}`).join(",") === "0:1:1,24:24:0", "complex encounter raw action fallback should preserve explicit slots and CODE/ID values");
  expect(result.project.triggers[0]?.actions?.[0]?.rawCode === 5 && result.project.triggers[0]?.actions?.[0]?.id === 2, "AP should resolve a keyed complex encounter to opcode 5");
  expect(result.project.validation.errors.length === 0, "complex encounter seed should pass project validation without errors");
}

function checkThiefEncounters(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("thief-encounters.seed.json"));
  expect(result.ok, "Rogue encounter seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "thiefEncounters", "vault-lock") === 1, "Rogue encounter allocation should start at runtime-safe ID 1");
  const encounter = result.project.thiefEncounters[0];
  expect(encounter?.id === 1, "Rogue encounter should use its allocated Data TD2 record ID");
  expect(encounter?.typeFlags?.slice(0, 8).every(Boolean), "all eight source-backed Rogue actions should be enabled");
  expect(encounter?.typeFlags?.[8] === false && encounter?.typeFlags?.[9] === true, "Rogue encounter should encode party trap scope and armed state");
  expect(encounter?.modifiers?.join(",") === "1,2,3,4,5,6,7,8", "Rogue action kinds should map to the eight Realmz slots in source order");
  expect(encounter?.successCodes?.join(",") === "1,1,2,1,2,3,1,2", "Rogue success results should compile into Data TD2 result slots");
  expect(encounter?.failureCodes?.every((value) => value === 4), "Rogue failure results should compile into all eight slots");
  expect(encounter?.successText?.[0] === 1 && encounter?.failureText?.[0] === 2, "Rogue outcome messages should resolve keyed strings");
  expect(encounter?.successSounds?.[1] === 137, "Rogue outcome sounds should resolve stock asset keys");
  expect(encounter?.prompts?.join(",") === "0,137,5", "Rogue prompt, trap sound, and spell power should occupy the source-backed prompt fields");
  expect(encounter?.promptSounds?.join(",") === "0,7,6", "Rogue Open Lock and Disarm spell chances should occupy their source-backed support fields");
  expect(encounter?.spell === 17 && encounter?.lowDamage === 3 && encounter?.highDamage === 9 && encounter?.tumblers === 5, "Rogue trap and lock settings should be preserved");
  expect((encounter?.rawBytes?.length ?? 0) === 0 && encounter?.authored === true, "Rogue encounter should compile from canonical fields without Data TD2 compatibility bytes");
  expect(result.project.validation.errors.length === 0, "Rogue encounter seed should pass project validation without errors");
}

function checkItems(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("items.seed.json"));
  expect(result.ok, "item seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "items", "bronze-clapper") === 901, "bronze-clapper should allocate to scenario item ID 901");
  expect(allocationId(result, "items", "silver-clapper") === 902, "silver-clapper should allocate to scenario item ID 902");
  const item = result.project.scenarioItems[0];
  expect(item?.id === 101 && item?.itemId === 901, "scenario item should use Data NI row 101 for item ID 901");
  expect(item?.iconId === 300 && item?.type === 1 && item?.cost === 50 && item?.weight === 2, "scenario item numeric fields should be preserved");
  const text = result.project.itemTexts[0];
  expect(text?.itemId === 901 && text?.identifiedName === "Bronze Clapper", "item text should be generated for scenario item");
  expect(result.project.scenarioItems[1]?.type === 21, "semantic item type names should compile to Realmz item type codes");
  expect(result.project.treasures[0]?.itemIds?.[0] === 901, "treasure should resolve item key to scenario item ID");
  expect(result.project.shops[0]?.itemIds?.[0] === 901 && result.project.shops[0]?.quantities?.[0] === 2, "shop should resolve item key and quantity");
  const award = result.project.extracodes.find((row) => row.values[0] === 1 && row.values[1] === 901 && row.values[2] === 901);
  expect(Boolean(award), "awardRandomItems AP should resolve item keys into EDCD values");
  const itemLogic = result.project.triggers[1];
  expect(actionCodes(itemLogic).join(",") === "21,67,22,22,22", "item logic AP should emit possession, charge branch, and item mutation opcodes");
  const itemRows = itemLogic.actions.map((action) => result.project.extracodes.find((row) => row.id === action.id)?.values.join(","));
  expect(itemRows[0] === "901,0,2,0,0", "branchOnItem should resolve the item, action point, and missing message keys");
  expect(itemRows[1] === "901,0,2,0,-1", "branchOnItemCharges should encode omitted failure target as continue current script");
  expect(itemRows[2] === "901,2,1,0,0", "dropItems should compile to item mutation mode 1");
  expect(itemRows[3] === "901,1,2,-3,0", "changeItemCharges should compile to item mutation mode 2 with a signed delta");
  expect(itemRows[4] === "901,1,3,0,902", "replaceItems should resolve both item keys and compile to mutation mode 3");
}

function checkMonsters(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("monsters.seed.json"), { libraryCatalog: mockMonsterLibraryCatalog() });
  expect(result.ok, "monster seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "monsters", "bell-wight") === 7, "bell-wight should preserve explicit monster ID 7");
  const monster = result.project.monsters[0];
  expect(monster?.id === 7 && monster?.displayName === "Bell Wight", "monster row should preserve ID and display name");
  expect(monster?.rawBytes === undefined, "fresh Scenario JSON monsters should not carry compatibility bytes");
  expect(monster?.hitDice === 4 && monster?.staminaMax === 18 && monster?.armor === 3, "monster combat stats should be preserved");
  expect(monster?.items?.[0] === 902 && monster?.weapon === 902, "monster item references should resolve item keys");
  expect(monster?.attacks?.[0]?.join(",") === "1,8,0,0", "monster attack row should be preserved");
  expect(result.project.monsterDescriptions[0]?.id === 7 && result.project.monsterDescriptions[0]?.text.includes("temple guardian"), "monster description should be generated");
  expect(result.project.monsterDescriptions[0]?.rawBytes === undefined, "fresh Scenario JSON monster descriptions should not carry compatibility bytes");
  const libraryMonster = result.project.monsters.find((entry) => entry.id === 8);
  expect(libraryMonster?.displayName === "Library Guardian" && libraryMonster?.hitDice === 6, "Monster Library templates should provide reusable defaults while seed names override the library label");
  expect(libraryMonster?.armor === 9 && libraryMonster?.iconId === 130 && libraryMonster?.attacks?.[0]?.join(",") === "2,6,0,0", "seed fields should override selected Monster Library defaults without losing inherited art or attacks");
  expect(result.project.monsterDescriptions.find((entry) => entry.id === 8)?.text === "A reusable stone guardian.", "Monster Library descriptions should carry into generated scenario records");
  const monsterVariant = result.project.monsterSets?.find((set) => set.setId === 1)?.monsters.find((entry) => entry.id === 8);
  const megaVariant = result.project.monsterSets?.find((set) => set.setId === -1)?.monsters.find((entry) => entry.id === 8);
  expect(monsterVariant?.hitDice === 12 && monsterVariant?.armor === 19, "generated Monster variants should use Providence's existing Combat scaling rules");
  expect(megaVariant?.hitDice === 21 && megaVariant?.armor === 39, "generated Mega variants should use Providence's existing Combat scaling rules");
  const grid = result.project.battles[0]?.grid ?? [];
  expect(grid[6 * 13 + 6] === 7, "battle placement should resolve monster key");
  expect(grid[6 * 13 + 7] === -7, "friendly battle placement should write negative monster ID");
  const actions = result.project.triggers[0]?.actions ?? [];
  expect(actions[2]?.rawCode === 89 && actions[2]?.id === 7, "addSpecialCharacter should resolve monster key");
  expect(actions[3]?.rawCode === 88 && actions[3]?.id === 7, "dropSpecialCharacter should resolve monster key");
}

function checkConditionBranches(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("condition-branches.seed.json"));
  expect(result.ok, "condition branch seed should create a project");
  if (!result.ok) return;
  const trigger = result.project.triggers[3];
  expect(actionCodes(trigger).join(",") === "40,81,78,78", "condition branch AP should emit party, character, and tile parameter opcodes");
  const rows = trigger.actions.map((action) => result.project.extracodes.find((row) => row.id === action.id)?.values.join(","));
  expect(rows[0] === "1,1,1,6,0", "party condition branch should encode present free-fall/levitate and resolve its AP target");
  expect(rows[1] === "9,-1,0,1,2", "character condition branch should encode picked characters and both AP targets");
  expect(rows[2] === "3,0,0,2,1", "tile path branch should encode attribute test and false/true AP targets");
  expect(rows[3] === "7,130,2,0,4", "specific tile branch should encode tile ID and complex encounter target");
}

function checkActionPointMutations(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("action-point-mutations.seed.json"));
  expect(result.ok, "action point mutation seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "extraActionPoints", "replacement-macro") === 0, "replacement macro should allocate to Extra Action Point ID 0");
  const trigger = result.project.triggers.find((entry) => entry.id.includes("ap:3"));
  expect(actionCodes(trigger).join(",") === "8,13,13,7", "action point mutation AP should emit copy, state, and patch opcodes");
  expect(trigger.actions[0]?.id === 1, "copyActionPointSteps should resolve the same-map source AP ID");
  const rows = trigger.actions.slice(1).map((action) => result.project.extracodes.find((row) => row.id === action.id)?.values.join(","));
  expect(rows[0] === "0,1,55,0,0", "enableActionPoint should set the target AP percent");
  expect(rows[1] === "0,2,-1,0,0", "disableActionPoint should write a negative disabled percent");
  expect(rows[2] === "0,2,0,1,0", "patchActionPoint should resolve the target and Extra Action Point source macro");
}

function checkRuntimeState(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("runtime-state.seed.json"));
  expect(result.ok, "runtime state seed should create a project");
  if (!result.ok) return;
  const trigger = result.project.triggers.find((entry) => entry.id.includes("ap:0"));
  expect(actionCodes(trigger).join(",") === "106,63,103,68,74,75,64", "runtime state AP should emit dark, time, boat/camp, fatigue, spell point, and time branch opcodes");
  const rows = trigger.actions.map((action) => result.project.extracodes.find((row) => row.id === action.id)?.values.join(","));
  expect(rows[0] === "2,1,0,0,0", "setDarkLevel should encode dark state and unchanged short-circuit");
  expect(rows[1] === "2,1,-2,15,0", "alterGameTime offset should preserve signed day/hour/minute deltas");
  expect(rows[2] === "1,2,1,0,0", "boatCampStatus should encode both checks and boat state");
  expect(rows[3] === "3,0,60,0,0", "alterFatigue percent should encode mode and percentage");
  expect(rows[4] === "-2,1,6,0,0", "changeSpellPoints should encode taking two random 1d6 rolls and the message slot");
  expect(rows[5] === "2,5,1,0,0", "branchOnSpellPoints should encode alive scope and exit-on-failure behavior");
  expect(rows[6] === "10,12,0,0,1", "branchOnGameTime should resolve success and failure Extra Action Point keys");
}

function checkPartyRuntime(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("party-runtime.seed.json"));
  expect(result.ok, "party runtime seed should create a project");
  if (!result.ok) return;
  const direct = result.project.triggers.find((trigger) => trigger.recordIndex === allocationId(result, "extraActionPoints", "direct-controls"));
  const effects = result.project.triggers.find((trigger) => trigger.recordIndex === allocationId(result, "extraActionPoints", "party-effects"));
  expect(actionCodes(direct).join(",") === "82,91,93,95,96,100,101,102", "direct party/runtime controls should emit their documented opcodes");
  expect(direct?.actions?.[3]?.id === -1, "random dungeon facing should emit direction ID -1");
  expect(actionCodes(effects).join(",") === "104,105,18,17,90,108,94,97", "party effects and toggles should emit their documented opcodes");
  const rows = effects?.actions?.slice(2, 6).map((action) => result.project.extracodes.find((row) => row.id === action.id)?.values.join(","));
  expect(rows?.[0] === "17,4,-10,1,0" && rows?.[1] === "18,3,0,0,0", "party and picked spell aliases should compile their spell settings");
  expect(rows?.[2] === "25,2,0,0,0", "victory-point removal should encode spread scope");
  expect(rows?.[3] === "7,5,0,0,0", "picked-character alteration should encode the semantic stamina attribute");
}

function checkSpells(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("spells.seed.json"));
  expect(result.ok, "spell override seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "spells", "bell-ward") === 12, "explicit spell override IDs should be preserved");
  expect(allocationId(result, "spells", "quiet-chime") === 0, "keyed spell overrides should allocate the first open custom slot");
  const ward = result.project.spellOverrides.find((spell) => spell.id === 12);
  expect(ward?.displayName === "Bell Ward" && ward?.cost === 4 && ward?.damage2 === 4, "spell override fields should compile through Providence's Rules defaults");
  expect(ward?.inCombat === true && ward?.inCamp === false && ward?.rawBytes === undefined, "fresh spell overrides should carry usage flags without compatibility bytes");
}

function checkRuleOverrides(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("rules-overrides.seed.json"));
  expect(result.ok, "race and caste override seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "races", "stoneborn") === 29 && allocationId(result, "castes", "bell-warden") === 10, "race and caste allocation reports should preserve explicit IDs");
  const race = result.project.raceOverrides.find((record) => record.id === 29);
  expect(race?.displayName === "Stoneborn" && race?.baseMove === 9 && race?.maxAge === 180 && race?.minMax.length === 12, "race overrides should merge seed fields with fixed Rules defaults");
  const caste = result.project.casteOverrides.find((record) => record.id === 10);
  expect(caste?.displayName === "Bell Warden" && caste?.startMoney === 75 && caste?.startItems[0] === 901, "caste overrides should resolve keyed starting items");
  expect(caste?.spellcasters.length === 4 && caste?.conditions.length === 40 && caste?.rawBytes === undefined, "fresh caste overrides should retain canonical dimensions without compatibility bytes");
  expect(race?.rawBytes === undefined, "fresh race overrides should not carry compatibility bytes");
  expect(result.project.ruleNames.raceNames[29] === "Stoneborn" && result.project.ruleNames.casteNames[10] === "Bell Warden", "generated rule names should follow race and caste override labels");
}

function checkRandomRectangles(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("random-rectangles.seed.json"));
  expect(result.ok, "random rectangle seed should create a project");
  if (!result.ok) return;
  const trigger = result.project.triggers.find((entry) => entry.id.includes("ap:0"));
  expect(actionCodes(trigger).join(",") === "23,92", "random rectangle AP should emit rate and shape opcodes");
  const rows = trigger.actions.map((action) => result.project.extracodes.find((row) => row.id === action.id)?.values.join(","));
  expect(rows[0] === "0,2,5000,3,4", "random encounter rectangle should resolve rate and battle range IDs");
  expect(rows[1] === "0,2,0,-500,1", "random rectangle should encode its encounter delta and offset mode");
  expect(result.project.extracodes[2]?.values.join(",") === "1,-2,0,0,0", "random rectangle should allocate a consecutive geometry row");
}

function checkBattleOutcomes(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("battle-outcomes.seed.json"));
  expect(result.ok, "battle outcomes seed should create a project");
  if (!result.ok) return;
  const trigger = result.project.triggers.find((entry) => entry.id.includes("ap:0"));
  expect(actionCodes(trigger).join(",") === "56,107", "battle outcome AP should emit standard and improved outcome opcodes");
  const rows = trigger.actions.map((action) => result.project.extracodes.find((row) => row.id === action.id)?.values.join(","));
  expect(rows[0] === "3,4,9,200,10", "battleOutcome should resolve battles, Extra AP, sound, and message in source order");
  expect(rows[1] === "3,4,201,11,9", "improvedBattleOutcome should resolve its coward macro in the fifth field");
  const macro = result.project.triggers.find((entry) => entry.id.includes("macro:9"));
  expect(actionCodes(macro).join(",") === "123", "causeRout should emit opcode 123 inside the Extra Action Point macro");
  expect(result.project.extracodes.find((row) => row.id === macro.actions[0]?.id)?.values.join(",") === "7,8,0,0,0", "causeRout should resolve keyed monster IDs into five EDCD fields");
}

function checkCombatMacros(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("combat-macros.seed.json"));
  expect(result.ok, "combat macro seed should create a project");
  if (!result.ok) return;
  const macro = result.project.triggers.find((entry) => entry.id.includes("macro:9"));
  expect(actionCodes(macro).join(",") === "126,124,125,127", "combat macro seed should emit criteria, spawn, destroy, and presence opcodes");
  const rows = macro.actions.slice(0, 3).map((action) => result.project.extracodes.find((row) => row.id === action.id)?.values.join(","));
  expect(rows[0] === "0,1,2,10,11", "battleMacroCriteria should resolve its random macro range");
  expect(rows[1] === "0,7,-3,200,1", "spawnMonsters should encode random count, sound, and traitor override");
  expect(rows[2] === "8,2,0,0,1", "destroyRelatedMonsters should encode the monster limit and allied-side override");
  expect(macro.actions[3]?.id === 7, "continueIfMonsterPresent should resolve its direct monster ID");
}

function checkAssets(createProjectFromScenarioSeed) {
  const customAsset = mockCustomAsset("asset:workspace:bell", "picture", "PICT", 42);
  const customIcon = mockCustomAsset("asset:workspace:wight-icon", "icon", "cicn", 42);
  const result = createProjectFromScenarioSeed(readSeed("assets.seed.json"), { customAssets: [customAsset, customIcon] });
  expect(result.ok, "asset reference seed should create a project when its Custom Library asset is provided");
  if (!result.ok) return;
  expect(result.project.assets.length === 2, "stock asset references should not create scenario assets while both custom assets should be bundled");
  expect(result.project.assets[0]?.resourceId === 30000 && result.project.assets[0]?.libraryScope === "scenario", "Custom Library picture should copy into Scenario Assets with its requested scenario ID");
  expect(result.project.assets[1]?.resourceId === 30126 && result.project.assets[1]?.kind === "icon", "Custom Library monster icon should copy into Scenario Assets with its requested icon ID");
  expect(result.allocations.assets.map((asset) => `${asset.key}:${asset.resourceId}:${asset.bundled}`).join(",") === "stock-chime:137:false,bell-picture:30000:true,stock-item-icon:300:false,wight-icon:30126:true", "asset allocations should distinguish stock references from bundled assets");
  expect(result.project.scenarioItems[0]?.iconId === 300, "item icon asset keys should resolve stock cicn IDs without bundling them");
  expect(result.project.monsters[0]?.iconId === 30126, "monster icon asset keys should resolve copied Custom Library cicn IDs");
  const trigger = result.project.triggers.find((entry) => entry.id.includes("ap:0"));
  expect(actionCodes(trigger).join(",") === "9,27", "asset reference AP should emit sound and picture opcodes");
  expect(trigger.actions.map((action) => action.id).join(",") === "137,30000", "asset keys should resolve to stock and scenario resource IDs");
}

function checkTimedEncounters(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("timed-encounters.seed.json"));
  expect(result.ok, "timed encounter seed should create a project");
  if (!result.ok) return;
  const timed = result.project.timedEncounters[0];
  expect(timed?.id === 3 && timed.day === 10 && timed.increment === 7 && timed.percent === 50, "timed encounter should preserve its schedule");
  expect(timed?.door === 5 && timed.requiredItem === 901 && timed.requiredQuest === 2, "timed encounter should resolve its macro, item, and quest keys");
  expect(timed?.locationKind === "land" && timed.requiredLevel === 0 && timed.requiredRandomRect === 2 && timed.requiredX === 10 && timed.requiredY === 11, "timed encounter should encode its location gates");
  expect(timed?.locationKind === "land" && !timed.reservedWords, "timed encounter should use semantic location data without fresh compatibility fields");
  expect(allocationId(result, "timedEncounters", "bell-clock") === 3, "bell-clock should preserve explicit timed encounter ID 3");
  const trigger = result.project.triggers.find((entry) => entry.id.includes("ap:0"));
  expect(actionCodes(trigger).join(",") === "54", "timed encounter mutation AP should emit opcode 54");
  expect(result.project.extracodes.find((row) => row.id === trigger.actions[0]?.id)?.values.join(",") === "3,75,3,1,2", "alterTimedEncounter should resolve its record and schedule mutation fields");
}

function checkInvalid(createProjectFromScenarioSeed, parseScenarioSeed) {
  const unknown = parseScenarioSeed(readSeed("invalid-unknown-key.seed.json"));
  expect(!unknown.ok, "unknown-key seed should fail parsing");
  if (!unknown.ok) expect(unknown.errors.some((error) => error.includes("unexpected")), "unknown-key error should mention unexpected field");

  const unresolved = createProjectFromScenarioSeed(readSeed("invalid-unresolved-reference.seed.json"));
  expect(!unresolved.ok, "unresolved reference seed should fail project creation");
  if (!unresolved.ok) {
    expect(unresolved.diagnostics.some((diagnostic) => diagnostic.code === "unresolved-reference" && diagnostic.key === "missing-message"), "unresolved seed should return structured unresolved-reference diagnostic");
  }

  const coordinate = parseScenarioSeed(readSeed("invalid-coordinate.seed.json"));
  expect(!coordinate.ok, "invalid coordinate seed should fail parsing");
  if (!coordinate.ok) expect(coordinate.errors.some((error) => error.includes("$.actionPoints[0].x")), "invalid coordinate should mention action point x");

  const mapExtent = parseScenarioSeed(readSeed("invalid-map-extent.seed.json"));
  expect(!mapExtent.ok, "out-of-bounds map operation should fail parsing");
  if (!mapExtent.ok) expect(mapExtent.errors.some((error) => error.includes("extends past map column")), "invalid map extent should explain the exceeded map edge");

  const mapTile = parseScenarioSeed(readSeed("invalid-map-tile.seed.json"));
  expect(!mapTile.ok, "out-of-range map tile should fail parsing");
  if (!mapTile.ok) expect(mapTile.errors.some((error) => error.includes("32767")), "invalid map tile should explain the signed 16-bit maximum");

  const itemSteps = parseScenarioSeed(readSeed("invalid-item-steps.seed.json"));
  expect(!itemSteps.ok, "invalid item semantic steps should fail parsing");
  if (!itemSteps.ok) {
    expect(itemSteps.errors.some((error) => error.includes("missingTarget is required")), "item branch should require a missing message or branch target");
    expect(itemSteps.errors.some((error) => error.includes("must provide enoughTarget")), "item charge branch should require at least one outcome target");
    expect(itemSteps.errors.some((error) => error.includes("$.actionPoints[0].steps[2].count")), "item mutation should reject a zero count");
    expect(itemSteps.errors.some((error) => error.includes("$.actionPoints[0].steps[3].amount")), "item charge mutation should reject values outside signed 16-bit range");
  }

  const conditionSteps = parseScenarioSeed(readSeed("invalid-condition-steps.seed.json"));
  expect(!conditionSteps.ok, "invalid condition semantic steps should fail parsing");
  if (!conditionSteps.ok) {
    expect(conditionSteps.errors.some((error) => error.includes("steps[0].condition")), "party condition branch should reject condition 9");
    expect(conditionSteps.errors.some((error) => error.includes("steps[1].selector")), "character condition branch should reject numeric selector 0");
    expect(conditionSteps.errors.some((error) => error.includes("tile is only valid")), "tile attribute branch should reject an irrelevant tile ID");
    expect(conditionSteps.errors.some((error) => error.includes("tile is required")), "specific tile branch should require a tile ID");
    expect(conditionSteps.errors.some((error) => error.includes("no-branch sentinel")), "tile branch should reject explicit target ID 0");
  }

  const zeroKeyTarget = createProjectFromScenarioSeed(readSeed("invalid-zero-key-target.seed.json"));
  expect(!zeroKeyTarget.ok, "tile branch key resolving to target ID 0 should fail project creation");
  if (!zeroKeyTarget.ok) {
    expect(zeroKeyTarget.diagnostics.some((diagnostic) => diagnostic.code === "zero-sentinel-target"), "zero-key tile branch should return a structured zero-sentinel-target diagnostic");
  }

  const actionPointContext = createProjectFromScenarioSeed(readSeed("invalid-action-point-mutations.seed.json"));
  expect(!actionPointContext.ok, "action point state mutation inside an Extra Action Point should fail project creation");
  if (!actionPointContext.ok) expect(actionPointContext.diagnostics.some((diagnostic) => diagnostic.code === "invalid-action-point-context"), "invalid action point mutation context should return a structured diagnostic");

  const runtimeState = parseScenarioSeed(readSeed("invalid-runtime-state.seed.json"));
  expect(!runtimeState.ok, "invalid runtime state steps should fail parsing");
  if (!runtimeState.ok) {
    expect(runtimeState.errors.some((error) => error.includes("hours")), "set game time should reject hour 24");
    expect(runtimeState.errors.some((error) => error.includes("percent is required")), "percent fatigue should require a percentage");
    expect(runtimeState.errors.some((error) => error.includes("low must not exceed")), "spell point rolls should reject an inverted range");
    expect(runtimeState.errors.some((error) => error.includes("must provide a boat/camping check")), "boat/camp status should require an operation");
  }

  const randomRectangles = parseScenarioSeed(readSeed("invalid-random-rectangles.seed.json"));
  expect(!randomRectangles.ok, "invalid random rectangle seed should fail parsing");
  if (!randomRectangles.ok) {
    expect(randomRectangles.errors.some((error) => error.includes("rectangle")), "random rectangle should reject an out-of-range rectangle index");
    expect(randomRectangles.errors.some((error) => error.includes("battleLow and") && error.includes("battleHigh")), "random encounter rectangle should require both battle range references");
    expect(randomRectangles.errors.some((error) => error.includes("left must not exceed") && error.includes("right")), "absolute random rectangle should reject inverted horizontal bounds");
  }

  const mapSemantics = parseScenarioSeed(readSeed("invalid-map-semantics.seed.json"));
  expect(!mapSemantics.ok, "map semantics used on the wrong map type should fail parsing");
  if (!mapSemantics.ok) {
    expect(mapSemantics.errors.some((error) => error.includes("dungeonPassage is only valid on dungeon maps")), "land maps should reject dungeon passage operations");
    expect(mapSemantics.errors.some((error) => error.includes("landSecret is only valid on land maps")), "dungeon maps should reject land Secret Area operations");
    expect(mapSemantics.errors.some((error) => error.includes("stock hidden-walkable tiles")), "hiddenWalkable should reject non-semantic tile IDs");
    expect(mapSemantics.errors.some((error) => error.includes("stock combat-clearing tiles")), "combatClearing should reject hidden-walkable and unrelated tile IDs");
    expect(mapSemantics.errors.some((error) => error.includes("cannot contain duplicates")), "dungeon passage directions should reject duplicates");
    expect(mapSemantics.errors.some((error) => error.includes("terrainGroup is only valid on land maps")), "semantic terrain should reject dungeon maps");
    expect(mapSemantics.errors.some((error) => error.includes("terrain must be water, mountains, or forest")), "semantic terrain should reject unknown terrain groups");
    expect(mapSemantics.errors.some((error) => error.includes("geometry.kind must be rect, path, or blob")), "semantic terrain should reject unsupported geometry");
    expect(mapSemantics.errors.some((error) => error.includes("does not have a checked-in semantic terrain profile")), "semantic terrain should reject custom landlooks without curated profiles");
    expect(mapSemantics.errors.some((error) => error.includes("hiddenWalkable is not valid for landlook 6")), "stock hidden-walkable terrain should reject landlooks without a known concealed-walkable set");
    expect(mapSemantics.errors.some((error) => error.includes("combatClearing is not valid for landlook 6")), "combat-clearing terrain should reject landlooks without a known source-backed set");
    expect(mapSemantics.errors.some((error) => error.includes("namedTile is only valid on land maps")), "named tiles should reject dungeon maps");
    expect(mapSemantics.errors.some((error) => error.includes("variant must be between 1 and 3")), "named tiles should reject unavailable variants");
    expect(mapSemantics.errors.some((error) => error.includes("supported stable named land tile")), "named tiles should reject unknown names");
    expect(mapSemantics.errors.some((error) => error.includes("named tile \"open-ground\" is not available for landlook 6")), "named tiles should reject names unavailable for a landlook");
    expect(mapSemantics.errors.some((error) => error.includes("namedStamp is only valid on land maps")), "named stamps should reject dungeon maps");
    expect(mapSemantics.errors.some((error) => error.includes("named stamp \"bed\" is not available for landlook 0")), "named stamps should reject landlook-incompatible compositions");
    expect(mapSemantics.errors.some((error) => error.includes("footprint 2 x 2 extends past the 90 x 90 map")), "named stamps should reject footprints that cross the map boundary");
    expect(mapSemantics.errors.some((error) => error.includes("supported stable named land stamp")), "named stamps should reject unknown names");
    expect(mapSemantics.errors.some((error) => error.includes("variant must be between 1 and 1 for named stamp \"yellow-house\"")), "named stamps should reject unavailable variants");
    expect(mapSemantics.errors.some((error) => error.includes("region and") && error.includes("anchor must be provided together")), "named stamp regions should require an explicit footprint anchor");
    expect(mapSemantics.errors.some((error) => error.includes("semanticRoad is only valid on land maps")), "semantic roads should reject dungeon maps");
    expect(mapSemantics.errors.some((error) => error.includes("paths must contain at least one road path")), "semantic roads should require at least one path");
    expect(mapSemantics.errors.some((error) => error.includes("must differ from the previous point")), "semantic roads should reject collapsed path segments");
    expect(mapSemantics.errors.some((error) => error.includes("must be horizontal or vertical")), "semantic roads should reject diagonal path segments");
    expect(mapSemantics.errors.some((error) => error.includes("semanticRoad is not valid for landlook 4")), "semantic roads should reject Castle's unrelated tile grammar");
    expect(mapSemantics.errors.some((error) => error.includes("semanticRoad is not valid for landlook 6")), "semantic roads should reject unaudited custom landlooks");
  }

  const causeRoutContext = createProjectFromScenarioSeed(readSeed("invalid-battle-outcomes.seed.json"));
  expect(!causeRoutContext.ok, "causeRout in a map Action Point should fail project creation");
  if (!causeRoutContext.ok) expect(causeRoutContext.diagnostics.some((diagnostic) => diagnostic.code === "invalid-action-point-context"), "causeRout context failure should return a structured diagnostic");

  const causeRoutRange = parseScenarioSeed(readSeed("invalid-cause-rout.seed.json"));
  expect(!causeRoutRange.ok, "causeRout with more than five monsters should fail parsing");
  if (!causeRoutRange.ok) expect(causeRoutRange.errors.some((error) => error.includes("at most five")), "causeRout should enforce its five-monster limit");

  const combatMacros = parseScenarioSeed(readSeed("invalid-combat-macros.seed.json"));
  expect(!combatMacros.ok, "invalid combat macro settings should fail parsing");
  if (!combatMacros.ok) {
    expect(combatMacros.errors.some((error) => error.includes("macroHigh is required")), "random battle macro criteria should require a high macro reference");
    expect(combatMacros.errors.some((error) => error.includes("maxCount")), "destroy related monsters should reject a negative maximum count");
  }

  const combatMacroContext = createProjectFromScenarioSeed(readSeed("invalid-combat-macro-context.seed.json"));
  expect(!combatMacroContext.ok, "combat macro steps in a map Action Point should fail project creation");
  if (!combatMacroContext.ok) expect(combatMacroContext.diagnostics.some((diagnostic) => diagnostic.code === "invalid-action-point-context"), "combat macro context failure should return a structured diagnostic");

  const missingAsset = createProjectFromScenarioSeed(readSeed("invalid-assets.seed.json"));
  expect(!missingAsset.ok, "missing Custom Library asset should fail project creation");
  if (!missingAsset.ok) expect(missingAsset.diagnostics.some((diagnostic) => diagnostic.code === "unresolved-asset-reference"), "missing Custom Library asset should return a structured diagnostic");

  const invalidAssetId = createProjectFromScenarioSeed(readSeed("invalid-assets.seed.json"), { customAssets: [mockCustomAsset("asset:workspace:missing", "picture", "PICT", 42)] });
  expect(!invalidAssetId.ok, "out-of-range scenario picture ID should fail project creation");
  if (!invalidAssetId.ok) expect(invalidAssetId.diagnostics.some((diagnostic) => diagnostic.code === "invalid-scenario-asset-id"), "invalid scenario asset ID should return a structured diagnostic");

  const assetKind = createProjectFromScenarioSeed(readSeed("invalid-asset-kind.seed.json"), { customAssets: [mockCustomAsset("asset:workspace:bell", "picture", "PICT", 42)] });
  expect(!assetKind.ok, "picture asset used as a sound should fail project creation");
  if (!assetKind.ok) expect(assetKind.diagnostics.some((diagnostic) => diagnostic.code === "asset-kind-mismatch"), "asset kind mismatch should return a structured diagnostic");

  const missingTemplate = createProjectFromScenarioSeed(readSeed("invalid-base-template.seed.json"));
  expect(!missingTemplate.ok, "an unavailable base template should fail project creation");
  if (!missingTemplate.ok) expect(missingTemplate.diagnostics.some((diagnostic) => diagnostic.code === "unresolved-base-template"), "missing base template should return a structured diagnostic");

  const missingMonsterLibraryEntry = createProjectFromScenarioSeed(readSeed("invalid-monster-library.seed.json"));
  expect(!missingMonsterLibraryEntry.ok, "an unavailable Monster Library entry should fail project creation");
  if (!missingMonsterLibraryEntry.ok) expect(missingMonsterLibraryEntry.diagnostics.some((diagnostic) => diagnostic.code === "unresolved-monster-library-entry"), "missing Monster Library entries should return a structured diagnostic");

  const timedEncounters = parseScenarioSeed(readSeed("invalid-timed-encounters.seed.json"));
  expect(!timedEncounters.ok, "invalid timed encounter seed should fail parsing");
  if (!timedEncounters.ok) {
    expect(timedEncounters.errors.some((error) => error.includes(".day")), "timed encounter should reject day zero");
    expect(timedEncounters.errors.some((error) => error.includes(".percent")), "timed encounter should reject chance above 100 percent");
    expect(timedEncounters.errors.some((error) => error.includes("x and") && error.includes("y")), "timed encounter should require paired coordinates");
    expect(timedEncounters.errors.some((error) => error.includes("daysUntilNext is required")), "timed encounter mutation should require a reset offset");
  }

  const complexEncounters = parseScenarioSeed(readSeed("invalid-complex-encounters.seed.json"));
  expect(!complexEncounters.ok, "invalid complex encounter seed should fail parsing");
  if (!complexEncounters.ok) {
    expect(complexEncounters.errors.some((error) => error.includes("physicalResult")), "complex encounter should reject result numbers outside 1 through 4");
    expect(complexEncounters.errors.some((error) => error.includes("points beyond")), "complex encounter should reject required physical choices that do not exist");
    expect(complexEncounters.errors.some((error) => error.includes("39 characters")), "complex encounter should enforce Data ED2 text capacity");
    expect(complexEncounters.errors.some((error) => error.includes("duplicate result")), "complex encounter should reject duplicate result scripts");
    expect(complexEncounters.errors.some((error) => error.includes("cannot combine raw actions")), "complex encounter should reject mixed raw and semantic result scripts");
  }

  const simpleOptions = parseScenarioSeed(readSeed("invalid-simple-encounter-options.seed.json"));
  expect(!simpleOptions.ok, "invalid semantic simple encounter seed should fail parsing");
  if (!simpleOptions.ok) {
    expect(simpleOptions.errors.some((error) => error.includes("79 characters")), "simple option labels should enforce the Data ED display buffer capacity");
    expect(simpleOptions.errors.some((error) => error.includes("at least one step")), "simple options should require a nonempty script");
    expect(simpleOptions.errors.some((error) => error.includes("cannot combine semantic options")), "simple encounters should reject mixed semantic and raw forms");
    expect(simpleOptions.errors.some((error) => error.includes("choiceResults[1]")), "the -4 auto-run sentinel should be rejected outside Option 1");
    expect(simpleOptions.errors.some((error) => error.includes("choiceResults[2]")), "simple encounter results should reject rows above 4");
    expect(simpleOptions.errors.some((error) => error.includes("duplicate slot")), "raw simple encounter actions should reject duplicate slots");
  }

  const thiefEncounters = parseScenarioSeed(readSeed("invalid-thief-encounters.seed.json"));
  expect(!thiefEncounters.ok, "invalid Rogue encounter seed should fail parsing");
  if (!thiefEncounters.ok) {
    expect(thiefEncounters.errors.some((error) => error.includes(".id")), "Rogue encounter should reject record ID zero");
    expect(thiefEncounters.errors.some((error) => error.includes("modifier")), "Rogue encounter should reject modifiers outside signed-byte range");
    expect(thiefEncounters.errors.some((error) => error.includes("must provide a result")), "Rogue outcomes should require visible behavior");
    expect(thiefEncounters.errors.some((error) => error.includes("duplicate action")), "Rogue encounter should reject duplicate semantic action slots");
    expect(thiefEncounters.errors.some((error) => error.includes("low must not exceed")), "Rogue trap damage should reject an inverted range");
    expect(thiefEncounters.errors.some((error) => error.includes("disarmChancePerLevel")), "Rogue trap spell chance should reject values above 100");
    expect(thiefEncounters.errors.some((error) => error.includes("tumblers")), "Rogue lock should reject more than six tumblers");
  }
}

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function mockCustomAsset(id, kind, resourceType, resourceId) {
  return {
    id,
    label: "Fixture Asset",
    kind,
    resourceType,
    resourceId,
    fileName: "fixture.bin",
    originalPath: "data:application/octet-stream;base64,AA==",
    previewPath: "data:application/octet-stream;base64,AA==",
    resourcePath: "data:application/octet-stream;base64,AA==",
    mimeType: "application/octet-stream",
    bytes: 1,
    sha256: "fixture",
    width: null,
    height: null,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    libraryScope: "custom-library",
    provenance: "fixture",
    linkedEntity: null,
    conversion: null
  };
}

function mockMonsterLibraryCatalog() {
  return {
    schemaVersion: 4,
    importedAt: "2026-07-10T00:00:00.000Z",
    managedPath: "browser://workspace/library",
    sources: [],
    records: [],
    assets: [],
    diagnostics: [],
    summary: { sourceCount: 0, recordCount: 0, entityCount: 1, assetCount: 0, diagnosticCount: 0 },
    entities: [{
      id: "library-entity:fixture:guardian",
      type: "monster-scrapbook-entry",
      label: "Stone Guardian",
      source: "library-source:fixture",
      recordRef: null,
      editState: "editable",
      confidence: "confirmed",
      summary: {
        description: "A reusable stone guardian.",
        monsterRecord: {
          id: 44,
          displayName: "Stone Guardian",
          hitDice: 6,
          agility: 8,
          movementMax: 6,
          armor: 7,
          size: 2,
          attackCount: 1,
          attacks: [[2, 6, 0, 0]],
          iconId: 130,
          stamina: 24,
          staminaMax: 24,
          exp: 350
        }
      }
    }]
  };
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function allocationId(result, family, key) {
  return result.allocations?.[family]?.find((entry) => entry.key === key)?.id;
}

function actionCodes(trigger) {
  return (trigger?.actions ?? []).map((action) => action.rawCode);
}

function tileAt(tiles, x, y, levelType = "land") {
  return tiles[levelType === "dungeon" ? y * 90 + x : x * 90 + y];
}
