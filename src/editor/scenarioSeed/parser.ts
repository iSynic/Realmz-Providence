import {
  allowKeys,
  parseArray,
  requireInteger,
  requireObject,
  requireString,
  type ParseContext
} from "./parsePrimitives";
import { parseAsset } from "./assetParser";
import { parseActionPoint, parseExtraActionPoint } from "./actionPointParser";
import { parseComplexEncounter, parseSimpleEncounter, parseThiefEncounter } from "./encounterParser";
import { parseBattle, parseItem, parseMessage, parseMonster, parseQuest, parseShop, parseTreasure } from "./coreRecordParser";
import { parseMap } from "./mapParser";
import { parseCaste, parseRace, parseSpell } from "./rulesParser";
import { parseScenario } from "./scenarioParser";
import { parseTimedEncounter } from "./timedEncounterParser";
import { validateScenarioSeed } from "./validation";
import {
  SCENARIO_SEED_SCHEMA_VERSION,
  type ScenarioSeed,
  type ScenarioSeedParseResult
} from "./contracts";

export function parseScenarioSeed(input: unknown): ScenarioSeedParseResult {
  const ctx: ParseContext = { errors: [], warnings: [] };
  const root = requireObject(input, "$", ctx);
  if (!root) return { ok: false, errors: ctx.errors, warnings: ctx.warnings };
  allowKeys(root, "$", ["schemaVersion", "baseTemplate", "scenario", "maps", "messages", "quests", "battles", "monsters", "treasures", "shops", "items", "assets", "simpleEncounters", "complexEncounters", "thiefEncounters", "timedEncounters", "spells", "races", "castes", "actionPoints", "extraActionPoints"], ctx);

  const schemaVersion = requireInteger(root.schemaVersion, "$.schemaVersion", ctx);
  if (schemaVersion !== null && schemaVersion !== SCENARIO_SEED_SCHEMA_VERSION) {
    ctx.errors.push(`$.schemaVersion must be ${SCENARIO_SEED_SCHEMA_VERSION}.`);
  }
  const scenario = parseScenario(root.scenario, "$.scenario", ctx);
  const baseTemplate = root.baseTemplate === undefined ? undefined : requireString(root.baseTemplate, "$.baseTemplate", ctx);
  const seed: ScenarioSeed = {
    schemaVersion: SCENARIO_SEED_SCHEMA_VERSION,
    ...(baseTemplate ? { baseTemplate } : {}),
    scenario: scenario ?? { name: "Untitled Scenario" }
  };

  const maps = parseArray(root.maps, "$.maps", ctx, parseMap);
  if (maps) seed.maps = maps;
  const messages = parseArray(root.messages, "$.messages", ctx, parseMessage);
  if (messages) seed.messages = messages;
  const quests = parseArray(root.quests, "$.quests", ctx, parseQuest);
  if (quests) seed.quests = quests;
  const battles = parseArray(root.battles, "$.battles", ctx, parseBattle);
  if (battles) seed.battles = battles;
  const monsters = parseArray(root.monsters, "$.monsters", ctx, parseMonster);
  if (monsters) seed.monsters = monsters;
  const treasures = parseArray(root.treasures, "$.treasures", ctx, parseTreasure);
  if (treasures) seed.treasures = treasures;
  const shops = parseArray(root.shops, "$.shops", ctx, parseShop);
  if (shops) seed.shops = shops;
  const items = parseArray(root.items, "$.items", ctx, parseItem);
  if (items) seed.items = items;
  const assets = parseArray(root.assets, "$.assets", ctx, parseAsset);
  if (assets) seed.assets = assets;
  const simpleEncounters = parseArray(root.simpleEncounters, "$.simpleEncounters", ctx, parseSimpleEncounter);
  if (simpleEncounters) seed.simpleEncounters = simpleEncounters;
  const complexEncounters = parseArray(root.complexEncounters, "$.complexEncounters", ctx, parseComplexEncounter);
  if (complexEncounters) seed.complexEncounters = complexEncounters;
  const thiefEncounters = parseArray(root.thiefEncounters, "$.thiefEncounters", ctx, parseThiefEncounter);
  if (thiefEncounters) seed.thiefEncounters = thiefEncounters;
  const timedEncounters = parseArray(root.timedEncounters, "$.timedEncounters", ctx, parseTimedEncounter);
  if (timedEncounters) seed.timedEncounters = timedEncounters;
  const spells = parseArray(root.spells, "$.spells", ctx, parseSpell);
  if (spells) seed.spells = spells;
  const races = parseArray(root.races, "$.races", ctx, parseRace);
  if (races) seed.races = races;
  const castes = parseArray(root.castes, "$.castes", ctx, parseCaste);
  if (castes) seed.castes = castes;
  const actionPoints = parseArray(root.actionPoints, "$.actionPoints", ctx, parseActionPoint);
  if (actionPoints) seed.actionPoints = actionPoints;
  const extraActionPoints = parseArray(root.extraActionPoints, "$.extraActionPoints", ctx, parseExtraActionPoint);
  if (extraActionPoints) seed.extraActionPoints = extraActionPoints;

  validateScenarioSeed(seed, ctx);

  if (ctx.errors.length > 0) return { ok: false, errors: ctx.errors, warnings: ctx.warnings };
  return { ok: true, seed, warnings: ctx.warnings };
}
