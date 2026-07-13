import type { ManagedAssetKind } from "../types";
import type { ScenarioSeedAsset } from "../scenarioSeed";
import {
  allowKeys,
  optionalInteger,
  requireInteger,
  requireObject,
  requireString,
  type ParseContext
} from "./parsePrimitives";

export function parseAsset(input: unknown, path: string, context: ParseContext): ScenarioSeedAsset | null {
  const value = requireObject(input, path, context);
  if (!value) return null;
  const source = requireString(value.source, `${path}.source`, context);
  if (source === "stock") {
    allowKeys(value, path, ["key", "source", "resourceType", "resourceId", "kind"], context);
    const kind = optionalManagedAssetKind(value.kind, `${path}.kind`, context);
    return {
      key: requireString(value.key, `${path}.key`, context) ?? "asset",
      source,
      resourceType: requireString(value.resourceType, `${path}.resourceType`, context) ?? "????",
      resourceId: requireInteger(value.resourceId, `${path}.resourceId`, context) ?? 0,
      ...(kind !== undefined ? { kind } : {})
    };
  }
  if (source === "custom-library") {
    allowKeys(value, path, ["key", "source", "assetId", "resourceId"], context);
    const resourceId = optionalInteger(value.resourceId, `${path}.resourceId`, context);
    return {
      key: requireString(value.key, `${path}.key`, context) ?? "asset",
      source,
      assetId: requireString(value.assetId, `${path}.assetId`, context) ?? "missing",
      ...(resourceId !== undefined ? { resourceId } : {})
    };
  }
  allowKeys(value, path, ["key", "source", "resourceType", "resourceId", "kind", "assetId"], context);
  context.errors.push(`${path}.source must be stock or custom-library.`);
  return null;
}

export function optionalManagedAssetKind(
  input: unknown,
  path: string,
  context: ParseContext
): ManagedAssetKind | undefined {
  if (input === undefined) return undefined;
  if (
    input === "picture"
    || input === "icon"
    || input === "special-land-tile"
    || input === "sound"
    || input === "text"
    || input === "other"
  ) {
    return input;
  }
  context.errors.push(`${path} must be picture, icon, special-land-tile, sound, text, or other.`);
  return undefined;
}
