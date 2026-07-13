import type {
  ScenarioSeed,
  ScenarioSeedItem,
  ScenarioSeedMap,
  ScenarioSeedScenario
} from "../scenarioSeed";
import { SCENARIO_ITEM_ID_BASE } from "./allocation";
import type { ParseContext } from "./parsePrimitives";

export function validateScenarioSeed(seed: ScenarioSeed, context: ParseContext) {
  validateUniqueIds(seed.messages, "messages", context);
  validateUniqueIds(seed.quests, "quests", context);
  validateUniqueIds(seed.battles, "battles", context);
  validateUniqueIds(seed.monsters, "monsters", context);
  validateUniqueIds(seed.treasures, "treasures", context);
  validateUniqueIds(seed.shops, "shops", context);
  validateUniqueIds(seed.items, "items", context);
  validateItems(seed.items, context);
  validateUniqueIds(seed.assets, "assets", context);
  validateUniqueIds(seed.simpleEncounters, "simpleEncounters", context);
  validateUniqueIds(seed.complexEncounters, "complexEncounters", context);
  validateUniqueIds(seed.thiefEncounters, "thiefEncounters", context);
  validateUniqueIds(seed.timedEncounters, "timedEncounters", context);
  validateUniqueIds(seed.spells, "spells", context);
  validateUniqueIds(seed.races, "races", context);
  validateUniqueIds(seed.castes, "castes", context);
  if ((seed.races?.length ?? 0) > 70) context.errors.push("$.races can contain at most 70 override records.");
  if ((seed.castes?.length ?? 0) > 30) context.errors.push("$.castes can contain at most 30 override records.");
  validateUniqueIds(seed.extraActionPoints, "extraActionPoints", context);
  validateMaps(seed.maps, context);
  validateScenarioStart(seed.scenario, seed.maps, context);
}

export function validateMaxArrayLength(
  values: unknown[] | undefined,
  path: string,
  length: number,
  context: ParseContext
) {
  if (values && values.length > length) context.errors.push(`${path} can contain at most ${length} entries.`);
}

function validateMaps(maps: ScenarioSeedMap[] | undefined, context: ParseContext) {
  const seen = new Set<string>();
  const keys = new Set<string>();
  for (const [index, map] of (maps ?? []).entries()) {
    const levelType = map.levelType ?? "land";
    const levelIndex = map.index ?? index;
    const key = `${levelType}:${levelIndex}`;
    if (seen.has(key)) context.errors.push(`$.maps contains duplicate map ${key}.`);
    seen.add(key);
    if (map.key) {
      if (keys.has(map.key)) context.errors.push(`$.maps contains duplicate key ${map.key}.`);
      keys.add(map.key);
    }
  }
}

function validateScenarioStart(
  scenario: ScenarioSeedScenario,
  maps: ScenarioSeedMap[] | undefined,
  context: ParseContext
) {
  if (!scenario.start || maps === undefined) return;
  const resolves = maps.some((map, index) => (
    (map.levelType ?? "land") === "land"
    && (map.index ?? index) === scenario.start?.landLevel
  ));
  if (!resolves) {
    context.errors.push(
      `$.scenario.start.landLevel ${scenario.start.landLevel} does not resolve to a declared land map.`
    );
  }
}

function validateUniqueIds(
  values: Array<{ id?: number; key?: string }> | undefined,
  label: string,
  context: ParseContext
) {
  const seen = new Set<number>();
  const keys = new Set<string>();
  for (const value of values ?? []) {
    if (value.id !== undefined) {
      if (seen.has(value.id)) context.errors.push(`$.${label} contains duplicate id ${value.id}.`);
      seen.add(value.id);
    }
    if (value.key) {
      if (keys.has(value.key)) context.errors.push(`$.${label} contains duplicate key ${value.key}.`);
      keys.add(value.key);
    }
  }
}

function validateItems(items: ScenarioSeedItem[] | undefined, context: ParseContext) {
  const itemIds = new Set<number>();
  const rows = new Set<number>();
  for (const item of items ?? []) {
    const row = item.id ?? (item.itemId === undefined ? undefined : item.itemId - SCENARIO_ITEM_ID_BASE);
    const itemId = item.itemId ?? (item.id === undefined ? undefined : SCENARIO_ITEM_ID_BASE + item.id);
    if (row !== undefined) {
      if (rows.has(row)) context.errors.push(`$.items contains duplicate scenario item row ${row}.`);
      rows.add(row);
    }
    if (itemId !== undefined) {
      if (itemIds.has(itemId)) context.errors.push(`$.items contains duplicate itemId ${itemId}.`);
      itemIds.add(itemId);
    }
  }
}
