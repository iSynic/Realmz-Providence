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
  checkMapOperations(createProjectFromScenarioSeed);
  checkDirectAp(createProjectFromScenarioSeed);
  checkEdcdAp(createProjectFromScenarioSeed);
  checkSimpleEncounter(createProjectFromScenarioSeed);
  checkItems(createProjectFromScenarioSeed);
  checkMonsters(createProjectFromScenarioSeed);
  checkConditionBranches(createProjectFromScenarioSeed);
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
  expect(result.project.messages.length === 1, "minimal seed should create one message");
  expect(allocationId(result, "messages", "hello") === 0, "hello message should allocate to ID 0");
  expect(allocationId(result, "quests", "started") === 0, "started quest should allocate to ID 0");
  expect(allocationId(result, "actionPoints", "start-ap") === 0, "start-ap should allocate to record 0");
  expect(result.project.triggers[0]?.coordinate?.x === 10 && result.project.triggers[0]?.coordinate?.y === 12, "start-ap should use named region coordinates");
  expect(actionCodes(result.project.triggers[0]).join(",") === "1,47", "minimal AP should emit message and set quest opcodes");
}

function checkMapOperations(createProjectFromScenarioSeed) {
  const result = createProjectFromScenarioSeed(readSeed("map-operations.seed.json"));
  expect(result.ok, "map operations seed should create a project");
  if (!result.ok) return;
  const tiles = result.project.maps[0]?.tiles ?? [];
  expect(tileAt(tiles, 0, 0) === 8, "line operation should write tile 8 at 0,0");
  expect(tileAt(tiles, 4, 0) === 8, "line operation should write tile 8 at 4,0");
  expect(tileAt(tiles, 2, 2) === 7, "rect operation should write tile 7 at 2,2");
  expect(tileAt(tiles, 4, 3) === 7, "rect operation should write tile 7 at 4,3");
  expect(tileAt(tiles, 5, 6) === 9, "path operation should write tile 9 at 5,6");
  expect(tileAt(tiles, 7, 7) === 9, "path operation should write tile 9 at 7,7");
  expect(tileAt(tiles, 10, 4) === 10 && tileAt(tiles, 11, 4) === 10, "border thickness should paint both left edge columns");
  expect(tileAt(tiles, 12, 4) === 1, "border operation should preserve its interior");
  expect(tileAt(tiles, 20, 2) === 11, "room operation should paint wall tiles");
  expect(tileAt(tiles, 22, 4) === 12, "room operation should paint floor tiles");
  expect(tileAt(tiles, 23, 2) === 13, "room north door should replace its wall tile");
  expect(tileAt(tiles, 26, 6) === 14, "room east door should replace its wall tile");
  expect(tileAt(tiles, 4, 11) === 15 && tileAt(tiles, 4, 13) === 15, "wide road should paint its full width");
  expect(tileAt(tiles, 10, 14) === 16 && tileAt(tiles, 11, 14) === 16, "even-width river should paint deterministically toward positive coordinates");
  expect(tileAt(tiles, 20, 12) === 21 && tileAt(tiles, 22, 13) === 26, "stamp should preserve its two-dimensional tile pattern");
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
  const result = createProjectFromScenarioSeed(readSeed("monsters.seed.json"));
  expect(result.ok, "monster seed should create a project");
  if (!result.ok) return;
  expect(allocationId(result, "monsters", "bell-wight") === 7, "bell-wight should preserve explicit monster ID 7");
  const monster = result.project.monsters[0];
  expect(monster?.id === 7 && monster?.displayName === "Bell Wight", "monster row should preserve ID and display name");
  expect(monster?.hitDice === 4 && monster?.staminaMax === 18 && monster?.armor === 3, "monster combat stats should be preserved");
  expect(monster?.items?.[0] === 902 && monster?.weapon === 902, "monster item references should resolve item keys");
  expect(monster?.attacks?.[0]?.join(",") === "1,8,0,0", "monster attack row should be preserved");
  expect(result.project.monsterDescriptions[0]?.id === 7 && result.project.monsterDescriptions[0]?.text.includes("temple guardian"), "monster description should be generated");
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
}

function readSeed(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
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

function tileAt(tiles, x, y) {
  return tiles[y * 90 + x];
}
