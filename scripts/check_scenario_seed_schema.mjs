import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas", "scenario-seed.schema.json");
const docsPath = path.join(root, "docs", "scenario-seed-schema.md");
const sourcePath = path.join(root, "src", "editor", "scenarioSeed.ts");
const parserPath = path.join(root, "src", "editor", "scenarioSeed", "parser.ts");
const scriptCompilerPath = path.join(root, "src", "editor", "scenarioSeed", "scriptCompiler.ts");
const mapOperationParserPath = path.join(root, "src", "editor", "scenarioSeed", "mapOperationParser.ts");
const namedTilesPath = path.join(root, "src", "editor", "map", "namedLandTiles.ts");
const namedStampsPath = path.join(root, "src", "editor", "map", "namedLandStamps.ts");
const builtInStampsPath = path.join(root, "src", "editor", "map", "builtInMapStamps.ts");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
const docs = fs.readFileSync(docsPath, "utf8");
const source = fs.readFileSync(sourcePath, "utf8");
const parserSource = fs.readFileSync(parserPath, "utf8");
const scriptCompilerSource = fs.readFileSync(scriptCompilerPath, "utf8");
const mapOperationParserSource = fs.readFileSync(mapOperationParserPath, "utf8");
const namedTilesSource = fs.readFileSync(namedTilesPath, "utf8");
const namedStampsSource = fs.readFileSync(namedStampsPath, "utf8");
const builtInStampsSource = fs.readFileSync(builtInStampsPath, "utf8");
const failures = [];

expect(schema.properties?.schemaVersion?.const === 1, "schemaVersion must be const 1");
expect(schema.additionalProperties === false, "root schema must reject additional properties");
expect(schema.properties?.optionLabels?.items?.$ref === "#/$defs/optionLabel", "optionLabels must use the semantic option-label schema");
expect(schema.$defs?.optionLabel?.required?.includes("id"), "option labels must require an explicit native row ID");
expect(schema.$defs?.optionLabel?.properties?.text?.maxLength === 24, "option-label text must respect the Data OD Str24 capacity");
expect(docs.includes("schemas/scenario-seed.schema.json"), "docs must link the scenario seed schema");
expect(source.includes("export { parseScenarioSeed }"), "scenarioSeed.ts must re-export parseScenarioSeed");
expect(source.includes("export function createProjectFromScenarioSeed"), "scenarioSeed.ts must export createProjectFromScenarioSeed");
expect(parserSource.includes("export function parseScenarioSeed"), "parser.ts must implement parseScenarioSeed");

const requiredRootProperties = ["baseTemplate", "scenario", "maps", "messages", "optionLabels", "quests", "battles", "monsters", "treasures", "shops", "items", "assets", "simpleEncounters", "complexEncounters", "thiefEncounters", "timedEncounters", "spells", "races", "castes", "actionPoints", "extraActionPoints"];
for (const key of requiredRootProperties) {
  expect(Object.hasOwn(schema.properties ?? {}, key), `root schema is missing ${key}`);
}

const objectSchemas = [];
collectObjectSchemas(schema, "#", objectSchemas);
for (const { pointer, value } of objectSchemas) {
  expect(value.additionalProperties === false, `${pointer} must set additionalProperties:false`);
}

const stepDefs = schema.$defs.step.oneOf.map((entry) => entry.$ref.split("/").at(-1));
const schemaStepKinds = [];
for (const defName of stepDefs) {
  const def = schema.$defs?.[defName];
  const kind = def?.properties?.kind?.const;
  expect(typeof kind === "string", `${defName} must declare a kind const`);
  if (typeof kind === "string") schemaStepKinds.push(kind);
}
for (const kind of schemaStepKinds) {
  expect(
    scriptCompilerSource.includes(`kind: "${kind}"`) || scriptCompilerSource.includes(`kind === "${kind}"`),
    `scriptCompiler.ts must handle ${kind} steps`
  );
  expect(docs.includes(`\`${kind}\``) || docs.includes(kind), `docs must mention ${kind} steps`);
}

const mapOperationDefs = schema.$defs.mapOperation.oneOf.map((entry) => entry.$ref.split("/").at(-1));
for (const defName of mapOperationDefs) {
  const kindSchema = schema.$defs?.[defName]?.properties?.kind;
  const kinds = kindSchema?.const ? [kindSchema.const] : kindSchema?.enum ?? [];
  expect(kinds.length > 0, `${defName} must declare a kind const or enum`);
  for (const kind of kinds) {
    expect(
      mapOperationParserSource.includes(`kind: "${kind}"`) || mapOperationParserSource.includes(`kind === "${kind}"`),
      `mapOperationParser.ts must handle ${kind} map operations`
    );
    expect(docs.includes(`\`${kind}\``), `docs must mention ${kind} map operations`);
  }
}

const namedTileMatch = namedTilesSource.match(/SCENARIO_SEED_NAMED_TILE_NAMES\s*=\s*(\[[\s\S]*?\])\s*as const/);
expect(Boolean(namedTileMatch), "named land tile source must expose its stable vocabulary");
if (namedTileMatch) {
  const sourceNames = JSON.parse(namedTileMatch[1]);
  const schemaNames = schema.$defs.namedTileName?.enum ?? [];
  expect(JSON.stringify(schemaNames) === JSON.stringify(sourceNames), "namedTileName schema enum must exactly match the runtime registry");
}

const namedStampMatch = namedStampsSource.match(/SCENARIO_SEED_NAMED_STAMP_NAMES\s*=\s*(\[[\s\S]*?\])\s*as const/);
expect(Boolean(namedStampMatch), "named land stamp source must expose its stable vocabulary");
if (namedStampMatch) {
  const sourceNames = JSON.parse(namedStampMatch[1]);
  const schemaNames = schema.$defs.namedStampName?.enum ?? [];
  expect(JSON.stringify(schemaNames) === JSON.stringify(sourceNames), "namedStampName schema enum must exactly match the runtime registry");
  const mappingMatch = namedStampsSource.match(/NAMED_STAMP_IDS[^=]*=\s*(\{[\s\S]*?\});/);
  expect(Boolean(mappingMatch), "named land stamp source must map every stable name to built-in stamp IDs");
  if (mappingMatch) {
    const mapping = JSON.parse(mappingMatch[1]);
    expect(JSON.stringify(Object.keys(mapping)) === JSON.stringify(sourceNames), "named stamp mapping keys must exactly match the stable vocabulary");
    const builtInIds = new Set([...builtInStampsSource.matchAll(/\bid:\s*"([^"]+)"/g)].map((match) => match[1]));
    for (const [name, ids] of Object.entries(mapping)) {
      expect(Array.isArray(ids) && ids.length > 0, `named stamp ${name} must provide at least one variant`);
      for (const id of ids) expect(builtInIds.has(id), `named stamp ${name} references missing built-in stamp ${id}`);
    }
  }
}

const sampleSeed = {
  schemaVersion: 1,
  baseTemplate: "blank",
  scenario: { name: "Schema Check", start: { landLevel: 0, x: 1, y: 1 } },
  maps: [{
    key: "road",
    levelType: "land",
    index: 0,
    landlook: 0,
    fillTile: 1,
    regions: [{ key: "start", x: 1, y: 1 }],
    operations: [
      { kind: "fill", tile: 1 },
      { kind: "rect", x: 2, y: 2, width: 3, height: 3, tile: 4 },
      { kind: "line", x1: 0, y1: 0, x2: 4, y2: 4, tile: 5 },
      { kind: "path", points: [{ x: 5, y: 5 }, { x: 6, y: 5 }], tile: 6 },
      { kind: "border", x: 10, y: 10, width: 6, height: 6, tile: 7, thickness: 2 },
      { kind: "room", x: 20, y: 20, width: 8, height: 6, wallTile: 8, floorTile: 9, doors: [{ side: "north", offset: 3, tile: 10 }] },
      { kind: "road", points: [{ x: 30, y: 30 }, { x: 35, y: 30 }], tile: 11, width: 3 },
      { kind: "river", points: [{ x: 40, y: 40 }, { x: 40, y: 45 }], tile: 12, width: 2 },
      { kind: "semanticRoad", paths: [[{ x: 30, y: 35 }, { x: 35, y: 35 }], [{ x: 33, y: 32 }, { x: 33, y: 38 }]] },
      { kind: "stamp", x: 50, y: 50, tiles: [[13, 14], [15, 16]] },
      { kind: "namedStamp", x: 54, y: 54, name: "yellow-house" },
      { kind: "namedTile", x: 58, y: 58, name: "grave", variant: 2 },
      { kind: "terrainGroup", terrain: "forest", geometry: { kind: "rect", x: 70, y: 70, width: 4, height: 4 } },
      { kind: "combatClearing", x: 60, y: 60, tile: 181 },
      { kind: "landSecret", x: 60, y: 60, state: "hidden" }
    ]
  }, {
    key: "dungeon",
    levelType: "dungeon",
    index: 0,
    operations: [{ kind: "dungeonPassage", x: 4, y: 4, directions: ["north", "south"] }]
  }],
  messages: [{ key: "hello", text: "Hello" }, { key: "bye", text: "Bye" }],
  optionLabels: [{ id: 0, text: "Proceed" }, { id: 1, text: "Withdraw" }],
  quests: [{ key: "started", label: "Started" }],
  monsters: [{ key: "bell-wight", name: "Bell Wight", description: "A bell-bound guardian.", hitDice: 3, stamina: 12, staminaMax: 12, iconId: 126, exp: 200, attacks: [[1, 6, 0, 0]], items: ["bell-clapper"] }],
  battles: [{ key: "first-battle", placements: [{ x: 6, y: 6, monster: "bell-wight" }] }],
  items: [{ key: "bell-clapper", itemId: 901, identifiedName: "Bell Clapper", iconId: 300, typeName: "scenarioItem", cost: 50, weight: 2 }],
  assets: [
    { key: "stock-chime", source: "stock", resourceType: "snd ", resourceId: 137 },
    { key: "bell-picture", source: "custom-library", assetId: "asset:workspace:bell", resourceId: 30000 }
  ],
  treasures: [{ key: "first-treasure", itemIds: ["bell-clapper"], gold: 10 }],
  shops: [{ key: "first-shop", stock: [{ itemId: "bell-clapper", quantity: 1 }] }],
  extraActionPoints: [{ key: "replacement-macro", steps: [
    { kind: "raw", rawCode: 1, id: 0 },
    { kind: "causeRout", monsters: ["bell-wight"] },
    { kind: "battleMacroCriteria", mode: 0, roundOrPercent: 1, repeatMode: 2, macroLow: "replacement-macro", macroHigh: "replacement-macro" },
    { kind: "spawnMonsters", monster: "bell-wight", countOrRandomLimit: -2, sound: 200 },
    { kind: "destroyRelatedMonsters", monster: "bell-wight", maxCount: 1, includeTraitorSide: true },
    { kind: "continueIfMonsterPresent", monster: "bell-wight" }
  ] }],
  simpleEncounters: [{
    key: "first-encounter",
    prompt: "hello",
    options: [
      { label: "Continue", steps: [{ kind: "message", message: "hello" }] },
      { label: "Leave", steps: [{ kind: "message", message: "bye" }] }
    ],
    canBackOut: true,
    maxTimes: 1,
    casteSuccess: 0
  }],
  thiefEncounters: [{
    key: "first-rogue",
    prompt: "hello",
    actions: [{
      kind: "detectTrap",
      modifier: 5,
      success: { result: 1, message: "hello", sound: "stock-chime" },
      failure: { result: 4, message: "bye" }
    }],
    trap: { armed: true, rogueOnly: true, damage: { low: 2, high: 6 }, sound: "stock-chime", spell: 17, spellPower: 3, disarmChancePerLevel: 8 },
    lock: { tumblers: 4, openChancePerLevel: 10 }
  }],
  complexEncounters: [{
    key: "first-complex",
    prompt: "hello",
    physicalActions: ["Turn the wheel", "Pull the lever"],
    requiredPhysicalActions: [2],
    physicalResult: 1,
    word: { text: "open", result: 2 },
    spells: [{ spell: 12, result: 3 }],
    items: [{ item: "bell-clapper", result: 1 }],
    thief: { encounter: "first-rogue" },
    canBackOut: true,
    results: [
      { result: 1, steps: [{ kind: "message", message: "hello" }] },
      { result: 4, steps: [{ kind: "battle", battle: "first-battle" }] }
    ]
  }],
  timedEncounters: [{
    key: "bell-clock",
    day: 10,
    increment: 7,
    percent: 50,
    macro: "replacement-macro",
    requiredItem: "bell-clapper",
    requiredQuest: "started",
    location: { kind: "land", level: 0, randomRectangle: 2, x: 10, y: 11 }
  }],
  spells: [{ key: "bell-ward", displayName: "Bell Ward", cost: 4, damage1: 2, damage2: 6, duration1: 3, spellClass: 4, inCombat: true }],
  actionPoints: [{
    key: "start-ap",
    map: "road",
    at: "start",
    levelType: "land",
    levelIndex: 0,
    steps: [
      { kind: "message", message: "hello" },
      { kind: "battle", battle: "first-battle", message: "hello" },
      { kind: "shop", shop: "first-shop" },
      { kind: "treasure", treasure: "first-treasure" },
      { kind: "teleport", landLevel: 0, x: 2, y: 2, message: "bye" },
      { kind: "setQuestFlag", quest: "started" },
      { kind: "pickCharacters", count: 1, inverse: true },
      { kind: "raw", rawCode: 100, id: 0 }
    ]
  }, {
    key: "extra-ap",
    x: 2,
    y: 2,
    steps: [
      { kind: "simpleEncounter", encounter: "first-encounter" },
      { kind: "complexEncounter", encounter: "first-complex" },
      { kind: "sound", sound: "stock-chime" },
      { kind: "picture", picture: "bell-picture" },
      { kind: "scrollingText", text: 1000 },
      { kind: "victoryPoints", amount: 25 },
      { kind: "temple", inflation: 100 },
      { kind: "banking", shop: "first-shop" }
    ]
  }, {
    x: 3,
    y: 3,
    steps: [
      { kind: "displayMap", map: 0 },
      { kind: "returnGosub" },
      { kind: "popStack" },
      { kind: "addSpecialCharacter", monster: "bell-wight" },
      { kind: "dropSpecialCharacter", monster: "bell-wight" },
      { kind: "randomMessage", low: "hello", high: "bye" },
      { kind: "selectiveBattle", battleLow: "first-battle", treasure: "first-treasure" },
      { kind: "branchOnQuest", quest: "started", target: "start-ap" }
    ]
  }, {
    x: 4,
    y: 4,
    steps: [
      { kind: "questValue", quest: "started", amount: 1, target: "start-ap" },
      { kind: "branchOnQuestValue", quest: "started", lessThanTarget: "start-ap", equalOrGreaterTarget: "extra-ap" },
      { kind: "branchOnRandom", low: 1, high: 100, message: "hello" },
      { kind: "branchOnPercent", percent: 50, target: "start-ap" },
      { kind: "changeTile", x: 1, y: 1, tile: 2 },
      { kind: "healHurtParty", multiplier: 1, low: 1, high: 4, message: "hello" },
      { kind: "takeGold", amount: 10 },
      { kind: "giveCondition", condition: 1, duration: 10 }
    ]
  }, {
    x: 5,
    y: 5,
    steps: [
      { kind: "awardRandomItems", count: 1, lowItem: "bell-clapper", highItem: "bell-clapper" },
      { kind: "enterExitDungeon", mode: 0, level: 0, x: 1, y: 1, heading: 1 },
      { kind: "edcd", opcode: 85, values: [0, 1, 10, 0, 0] }
    ]
  }, {
    x: 6,
    y: 6,
    steps: [
      { kind: "branchOnItem", item: "bell-clapper", possessedTarget: "start-ap", missingBehavior: "message", missingTarget: "hello" },
      { kind: "branchOnItemCharges", item: "bell-clapper", minimumCharges: 2, enoughTarget: "start-ap" },
      { kind: "dropItems", item: "bell-clapper", count: 1 },
      { kind: "changeItemCharges", item: "bell-clapper", amount: -1 },
      { kind: "replaceItems", item: "bell-clapper", replacementItem: "bell-clapper" }
    ]
  }, {
    x: 7,
    y: 7,
    steps: [
      { kind: "branchOnPartyCondition", condition: "freeFallLevitate", target: "start-ap" },
      { kind: "branchOnCharacterCondition", condition: 9, selector: "picked", successTarget: "start-ap", failureTarget: "extra-ap" },
      { kind: "branchOnTileParameter", test: "path", trueTarget: "extra-ap" }
    ]
  }, {
    x: 8,
    y: 8,
    steps: [
      { kind: "copyActionPointSteps", source: "start-ap" },
      { kind: "enableActionPoint", target: "start-ap", percent: 55 },
      { kind: "disableActionPoint", target: "extra-ap" },
      { kind: "patchActionPoint", target: "extra-ap", source: "replacement-macro" }
    ]
  }, {
    x: 9,
    y: 9,
    steps: [
      { kind: "setDarkLevel", dark: true, stopIfUnchanged: true },
      { kind: "alterGameTime", mode: "offset", days: 1, hours: -2, minutes: 15 },
      { kind: "boatCampStatus", continueBoat: "inBoat", continueCamping: "notCamping", setBoat: "inBoat" },
      { kind: "alterFatigue", mode: "percent", percent: 60 },
      { kind: "changeSpellPoints", rolls: 2, low: 1, high: 6, take: true, message: "hello" },
      { kind: "branchOnSpellPoints", scope: "alive", minimum: 5, onFailure: "exitSave", successMacro: "replacement-macro" },
      { kind: "branchOnGameTime", dayAtMost: 10, hourAtMost: 12, successMacro: "replacement-macro", failureMacro: "replacement-macro" }
    ]
  }, {
    x: 10,
    y: 10,
    steps: [
      { kind: "alterRandomEncounterRectangle", level: 0, rectangle: 2, encounterRate: 5000, battleLow: "first-battle", battleHigh: "first-battle" },
      { kind: "alterRandomRectangle", level: 0, rectangle: 2, encounterPercentDelta: -500, shape: { mode: "offset", x: 1, y: -2 } }
    ]
  }, {
    x: 11,
    y: 11,
    steps: [
      { kind: "battleOutcome", battleLow: "first-battle", battleHigh: "first-battle", cowardMacro: "replacement-macro" },
      { kind: "improvedBattleOutcome", battleLow: "first-battle", cowardMacro: "replacement-macro" },
      { kind: "alterTimedEncounter", timedEncounter: "bell-clock", percent: 75, increment: 3, resetFromCurrentDay: true, daysUntilNext: 2 }
    ]
  }]
};
validateSampleAgainstSchemaShape(sampleSeed, schema, "$");

if (failures.length > 0) {
  console.error("Scenario seed schema check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Scenario seed schema check passed (${schemaStepKinds.length} step kinds).`);

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function collectObjectSchemas(value, pointer, out) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  if (value.type === "object") out.push({ pointer, value });
  for (const [key, child] of Object.entries(value)) {
    collectObjectSchemas(child, `${pointer}/${key}`, out);
  }
}

function validateSampleAgainstSchemaShape(value, schemaNode, pathLabel) {
  const resolved = resolveRef(schemaNode);
  if (resolved.oneOf) {
    const kindMatches = resolved.oneOf.map(resolveRef).filter((candidate) => objectMatchesConst(value, candidate));
    if (kindMatches.length > 0) {
      expect(kindMatches.length === 1, `${pathLabel} should match exactly one oneOf branch`);
      validateSampleAgainstSchemaShape(value, kindMatches[0], pathLabel);
      return;
    }
    const typeMatches = resolved.oneOf.map(resolveRef).filter((candidate) => shallowTypeMatches(value, candidate));
    expect(typeMatches.length >= 1, `${pathLabel} should match at least one oneOf branch`);
    if (typeMatches[0]) validateSampleAgainstSchemaShape(value, typeMatches[0], pathLabel);
    return;
  }
  if (resolved.const !== undefined) {
    expect(value === resolved.const, `${pathLabel} should equal ${resolved.const}`);
    return;
  }
  if (resolved.enum) {
    expect(resolved.enum.includes(value), `${pathLabel} should be one of ${resolved.enum.join(", ")}`);
    return;
  }
  if (resolved.type === "object") {
    expect(value && typeof value === "object" && !Array.isArray(value), `${pathLabel} should be an object`);
    const keys = Object.keys(value ?? {});
    for (const required of resolved.required ?? []) {
      expect(Object.hasOwn(value, required), `${pathLabel} should include required field ${required}`);
    }
    for (const key of keys) {
      expect(Object.hasOwn(resolved.properties ?? {}, key), `${pathLabel}.${key} should be declared in schema`);
      if (resolved.properties?.[key]) validateSampleAgainstSchemaShape(value[key], resolved.properties[key], `${pathLabel}.${key}`);
    }
    return;
  }
  if (resolved.type === "array") {
    expect(Array.isArray(value), `${pathLabel} should be an array`);
    for (const [index, item] of value.entries()) validateSampleAgainstSchemaShape(item, resolved.items, `${pathLabel}[${index}]`);
    return;
  }
  if (resolved.type) {
    expect(typeMatches(value, resolved.type), `${pathLabel} should be type ${resolved.type}`);
    if (resolved.type === "integer" && Number.isInteger(value)) {
      if (resolved.minimum !== undefined) expect(value >= resolved.minimum, `${pathLabel} should be at least ${resolved.minimum}`);
      if (resolved.maximum !== undefined) expect(value <= resolved.maximum, `${pathLabel} should be at most ${resolved.maximum}`);
    }
  }
}

function objectMatchesConst(value, schemaNode) {
  const resolved = resolveRef(schemaNode);
  for (const discriminator of ["kind", "mode", "source"]) {
    const discriminatorSchema = resolved.properties?.[discriminator];
    if (discriminatorSchema?.const !== undefined) return value?.[discriminator] === discriminatorSchema.const;
    if (discriminatorSchema?.enum) return discriminatorSchema.enum.includes(value?.[discriminator]);
  }
  return false;
}

function shallowTypeMatches(value, schemaNode) {
  const resolved = resolveRef(schemaNode);
  if (resolved.const !== undefined) return value === resolved.const;
  if (resolved.enum) return resolved.enum.includes(value);
  if (resolved.type) return typeMatches(value, resolved.type);
  return true;
}

function resolveRef(schemaNode) {
  if (!schemaNode?.$ref) return schemaNode;
  const parts = schemaNode.$ref.replace(/^#\//, "").split("/");
  let current = schema;
  for (const part of parts) current = current[part];
  return current;
}

function typeMatches(value, type) {
  if (type === "integer") return Number.isInteger(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  return true;
}
