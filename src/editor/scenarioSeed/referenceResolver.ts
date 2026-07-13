import type { ManagedAssetKind } from "../types";
import type { ScenarioSeedRef } from "./contracts";
import { resolveRef } from "./allocation";
import {
  addScenarioSeedDiagnostic as addDiagnostic,
  type MapTarget,
  type ScenarioSeedCompilerContext
} from "./compilerContext";

export function resolveItemRef(ref: ScenarioSeedRef, context: ScenarioSeedCompilerContext) {
  return resolveRef(ref, context.items, "item", context);
}

export function resolveMonsterRef(ref: ScenarioSeedRef, context: ScenarioSeedCompilerContext) {
  return resolveRef(ref, context.monsters, "monster", context);
}

export function numericRef(ref: ScenarioSeedRef, label: string, context: ScenarioSeedCompilerContext) {
  if (typeof ref === "number") return ref;
  const parsed = Number(ref);
  if (Number.isInteger(parsed)) return parsed;
  addDiagnostic(context, "error", "non-numeric-reference", `${label} reference "${ref}" must be numeric in this seed version.`, label, ref);
  return 0;
}

export function resolveSeedAssetRef(
  ref: ScenarioSeedRef,
  expectedKind: ManagedAssetKind,
  label: string,
  context: ScenarioSeedCompilerContext
) {
  const key = typeof ref === "string" ? ref : undefined;
  const asset = key === undefined ? undefined : context.assets.get(key);
  if (!asset) return numericRef(ref, label, context);
  if (asset.kind !== expectedKind) {
    addDiagnostic(context, "error", "asset-kind-mismatch", `Asset "${ref}" is ${asset.kind}, but this ${label} field requires ${expectedKind}.`, "asset", key);
  }
  return asset.resourceId;
}

export function resolveMapTarget(ref: ScenarioSeedRef, context: ScenarioSeedCompilerContext): MapTarget | null {
  if (typeof ref === "number") return { levelType: "land", index: ref };
  const target = context.maps.get(ref);
  if (target) return target;
  addDiagnostic(context, "error", "unresolved-reference", `Unknown map reference "${ref}".`, "map", ref);
  return null;
}

export function resolveRegionTarget(ref: ScenarioSeedRef, context: ScenarioSeedCompilerContext): (MapTarget & { x: number; y: number }) | null {
  if (typeof ref !== "string") {
    addDiagnostic(context, "error", "invalid-region-reference", "Region reference must be a key string.", "region");
    return null;
  }
  const target = context.regions.get(ref);
  if (target) return target;
  addDiagnostic(context, "error", "unresolved-reference", `Unknown region reference "${ref}".`, "region", ref);
  return null;
}
