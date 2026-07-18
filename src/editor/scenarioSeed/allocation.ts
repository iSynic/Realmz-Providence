import type {
  ScenarioSeed,
  ScenarioSeedAllocationEntry,
  ScenarioSeedMapOperation,
  ScenarioSeedRef
} from "./contracts";
import { addScenarioSeedDiagnostic, type ScenarioSeedCompilerContext } from "./compilerContext";

export const SCENARIO_ITEM_ID_BASE = 800;
export const SCENARIO_ITEM_RECORD_COUNT = 200;

export type ScenarioSeedOperationRegion = { key: string; x: number; y: number };

export type ScenarioSeedAllocationOptions = {
  operationRegions: (operations: ScenarioSeedMapOperation[], landlook: number) => ScenarioSeedOperationRegion[];
};

export function allocateScenarioSeed(
  seed: ScenarioSeed,
  context: ScenarioSeedCompilerContext,
  options: ScenarioSeedAllocationOptions
) {
  allocateRecordIds(seed.messages ?? [], "message", context.messages, context.allocations.messages, context);
  allocateRecordIds(seed.quests ?? [], "quest", context.quests, context.allocations.quests, context, 1);
  allocateRecordIds(seed.battles ?? [], "battle", context.battles, context.allocations.battles, context);
  allocateRecordIds(seed.monsters ?? [], "monster", context.monsters, context.allocations.monsters, context);
  allocateRecordIds(seed.treasures ?? [], "treasure", context.treasures, context.allocations.treasures, context);
  allocateRecordIds(seed.shops ?? [], "shop", context.shops, context.allocations.shops, context);
  allocateItemIds(seed.items ?? [], context);
  allocateRecordIds(seed.simpleEncounters ?? [], "simple encounter", context.simpleEncounters, context.allocations.simpleEncounters, context);
  allocateRecordIds(seed.complexEncounters ?? [], "complex encounter", context.complexEncounters, context.allocations.complexEncounters, context);
  allocateRecordIds(seed.thiefEncounters ?? [], "Rogue encounter", context.thiefEncounters, context.allocations.thiefEncounters, context, 1);
  allocateRecordIds(seed.timedEncounters ?? [], "timed encounter", context.timedEncounters, context.allocations.timedEncounters, context);
  allocateRecordIds(seed.spells ?? [], "spell override", context.spells, context.allocations.spells, context);
  allocateRecordIds(seed.races ?? [], "race override", context.races, context.allocations.races, context);
  allocateRecordIds(seed.castes ?? [], "caste override", context.castes, context.allocations.castes, context);
  allocateRecordIds(seed.extraActionPoints ?? [], "extra action point", context.extraActionPoints, context.allocations.extraActionPoints, context);
  allocateMapAndRegionKeys(seed, context, options);
  allocateActionPointKeys(seed, context);
}

export function allocateRecordIds<T extends { id?: number; key?: string }>(
  records: T[],
  label: string,
  keys: Map<string, number>,
  allocationEntries: ScenarioSeedAllocationEntry[],
  context: ScenarioSeedCompilerContext,
  minimumId = 0
) {
  const used = new Set(records.map((record) => record.id).filter((id): id is number => id !== undefined));
  for (const record of records) {
    const explicit = record.id !== undefined;
    if (record.id === undefined) {
      record.id = nextOpenId(used, minimumId);
      used.add(record.id);
    }
    if (record.key) {
      addKey(keys, record.key, record.id, label, context);
      allocationEntries.push({ key: record.key, id: record.id, explicit });
    }
  }
}

export function nextOpenId(used: Set<number>, minimumId = 0) {
  let id = minimumId;
  while (used.has(id)) id++;
  return id;
}

export function addKey<T>(
  map: Map<string, T>,
  key: string,
  value: T,
  label: string,
  context: ScenarioSeedCompilerContext
) {
  if (map.has(key)) {
    addScenarioSeedDiagnostic(context, "error", "duplicate-key", `Duplicate ${label} key "${key}".`, label, key);
    return;
  }
  map.set(key, value);
}

export function resolveRef(
  ref: ScenarioSeedRef,
  keys: Map<string, number>,
  label: string,
  context: ScenarioSeedCompilerContext
) {
  if (typeof ref === "number") return ref;
  const resolved = keys.get(ref);
  if (resolved !== undefined) return resolved;
  addScenarioSeedDiagnostic(context, "error", "unresolved-reference", `Unknown ${label} reference "${ref}".`, label, ref);
  return 0;
}

function allocateMapAndRegionKeys(
  seed: ScenarioSeed,
  context: ScenarioSeedCompilerContext,
  options: ScenarioSeedAllocationOptions
) {
  for (const [index, map] of (seed.maps ?? []).entries()) {
    const levelType = map.levelType ?? "land";
    const levelIndex = map.index ?? index;
    if (map.key) {
      addKey(context.maps, map.key, { levelType, index: levelIndex }, "map", context);
      context.allocations.maps.push({ key: map.key, levelType, index: levelIndex, explicit: map.index !== undefined });
    }
    context.maps.set(`${levelType}:${levelIndex}`, { levelType, index: levelIndex });
    const regions = [
      ...(map.regions ?? []),
      ...options.operationRegions(map.operations ?? [], map.landlook ?? 0)
    ];
    for (const region of regions) {
      addKey(context.regions, region.key, { levelType, index: levelIndex, x: region.x, y: region.y }, "region", context);
      context.allocations.regions.push({
        key: region.key,
        ...(map.key ? { mapKey: map.key } : {}),
        levelType,
        index: levelIndex,
        x: region.x,
        y: region.y
      });
    }
  }
}

function allocateActionPointKeys(seed: ScenarioSeed, context: ScenarioSeedCompilerContext) {
  for (const [index, actionPoint] of (seed.actionPoints ?? []).entries()) {
    const recordIndex = actionPoint.recordIndex ?? index;
    if (!actionPoint.key) continue;
    addKey(context.actionPoints, actionPoint.key, recordIndex, "action point", context);
    addKey(context.actionPointTargets, actionPoint.key, actionPointTargetForSeed(actionPoint, recordIndex, context), "action point target", context);
    context.allocations.actionPoints.push({ key: actionPoint.key, id: recordIndex, explicit: actionPoint.recordIndex !== undefined });
  }
}

function actionPointTargetForSeed(
  actionPoint: NonNullable<ScenarioSeed["actionPoints"]>[number],
  recordIndex: number,
  context: ScenarioSeedCompilerContext
) {
  const mapTarget = actionPoint.map === undefined
    ? undefined
    : typeof actionPoint.map === "number"
      ? { levelType: "land" as const, index: actionPoint.map }
      : context.maps.get(actionPoint.map);
  const regionTarget = typeof actionPoint.at === "string" ? context.regions.get(actionPoint.at) : undefined;
  return {
    levelType: actionPoint.levelType ?? regionTarget?.levelType ?? mapTarget?.levelType ?? "land",
    levelIndex: actionPoint.levelIndex ?? regionTarget?.index ?? mapTarget?.index ?? 0,
    recordIndex
  };
}

function allocateItemIds(records: NonNullable<ScenarioSeed["items"]>, context: ScenarioSeedCompilerContext) {
  const usedRows = new Set<number>();
  const usedItemIds = new Set<number>();
  for (const item of records) {
    if (item.id !== undefined) usedRows.add(item.id);
    if (item.itemId !== undefined) usedItemIds.add(item.itemId);
  }
  for (const item of records) {
    const explicit = item.id !== undefined || item.itemId !== undefined;
    if (item.id === undefined && item.itemId !== undefined) item.id = item.itemId - SCENARIO_ITEM_ID_BASE;
    if (item.id === undefined) {
      item.id = nextOpenId(usedRows);
      usedRows.add(item.id);
    }
    if (item.itemId === undefined) item.itemId = SCENARIO_ITEM_ID_BASE + item.id;
    if (
      item.id < 0
      || item.id >= SCENARIO_ITEM_RECORD_COUNT
      || item.itemId < SCENARIO_ITEM_ID_BASE
      || item.itemId >= SCENARIO_ITEM_ID_BASE + SCENARIO_ITEM_RECORD_COUNT
    ) {
      addScenarioSeedDiagnostic(
        context,
        "error",
        "invalid-item-id",
        `Item "${item.key ?? item.itemId}" must use scenario item IDs ${SCENARIO_ITEM_ID_BASE}-${SCENARIO_ITEM_ID_BASE + SCENARIO_ITEM_RECORD_COUNT - 1}.`,
        "item",
        item.key
      );
      continue;
    }
    if (item.itemId !== SCENARIO_ITEM_ID_BASE + item.id) {
      addScenarioSeedDiagnostic(
        context,
        "error",
        "invalid-item-id",
        `Item "${item.key ?? item.itemId}" itemId must equal ${SCENARIO_ITEM_ID_BASE} + id.`,
        "item",
        item.key
      );
      continue;
    }
    if (usedItemIds.has(item.itemId) && !explicit) {
      addScenarioSeedDiagnostic(context, "error", "duplicate-item-id", `Duplicate item ID ${item.itemId}.`, "item", item.key);
      continue;
    }
    usedItemIds.add(item.itemId);
    if (item.key) {
      addKey(context.items, item.key, item.itemId, "item", context);
      context.allocations.items.push({ key: item.key, id: item.itemId, explicit });
    }
  }
}
