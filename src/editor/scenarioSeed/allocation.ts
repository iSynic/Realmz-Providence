import type { ScenarioSeedAllocationEntry, ScenarioSeedRef } from "../scenarioSeed";
import { addScenarioSeedDiagnostic, type ScenarioSeedCompilerContext } from "./compilerContext";

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
