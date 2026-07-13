import type { ScenarioSeedTimedEncounter, ScenarioSeedTimedLocation } from "./contracts";
import {
  allowKeys,
  checkIntegerRange,
  optionalInteger,
  optionalRef,
  optionalString,
  requireInteger,
  requireObject,
  requireRef,
  requireString,
  type ParseContext
} from "./parsePrimitives";

export function parseTimedEncounter(
  input: unknown,
  path: string,
  context: ParseContext
): ScenarioSeedTimedEncounter | null {
  const value = requireObject(input, path, context);
  if (!value) return null;
  allowKeys(
    value,
    path,
    ["key", "id", "day", "increment", "percent", "macro", "requiredItem", "requiredQuest", "location"],
    context
  );
  const key = optionalString(value.key, `${path}.key`, context);
  const id = optionalInteger(value.id, `${path}.id`, context);
  const day = requireInteger(value.day, `${path}.day`, context);
  const increment = optionalInteger(value.increment, `${path}.increment`, context);
  const percent = optionalInteger(value.percent, `${path}.percent`, context);
  const requiredItem = optionalRef(value.requiredItem, `${path}.requiredItem`, context);
  const requiredQuest = optionalRef(value.requiredQuest, `${path}.requiredQuest`, context);
  const location = value.location === undefined
    ? undefined
    : parseTimedLocation(value.location, `${path}.location`, context);
  checkIntegerRange(id, `${path}.id`, 0, 32767, context);
  checkIntegerRange(day, `${path}.day`, 1, 32767, context);
  checkIntegerRange(increment, `${path}.increment`, 0, 32767, context);
  checkIntegerRange(percent, `${path}.percent`, 0, 100, context);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    day: day ?? 1,
    ...(increment !== undefined ? { increment } : {}),
    ...(percent !== undefined ? { percent } : {}),
    macro: requireRef(value.macro, `${path}.macro`, context),
    ...(requiredItem !== undefined ? { requiredItem } : {}),
    ...(requiredQuest !== undefined ? { requiredQuest } : {}),
    ...(location !== undefined ? { location } : {})
  };
}

export function parseTimedLocation(
  input: unknown,
  path: string,
  context: ParseContext
): ScenarioSeedTimedLocation {
  const value = requireObject(input, path, context);
  if (!value) return { kind: "any" };
  const kind = requireString(value.kind, `${path}.kind`, context);
  if (kind === "any") {
    allowKeys(value, path, ["kind"], context);
    return { kind };
  }
  if (kind === "land" || kind === "dungeon") {
    allowKeys(value, path, ["kind", "level", "randomRectangle", "x", "y"], context);
    const level = requireInteger(value.level, `${path}.level`, context);
    const randomRectangle = optionalInteger(value.randomRectangle, `${path}.randomRectangle`, context);
    const x = optionalInteger(value.x, `${path}.x`, context);
    const y = optionalInteger(value.y, `${path}.y`, context);
    checkIntegerRange(level, `${path}.level`, 0, 32767, context);
    checkIntegerRange(randomRectangle, `${path}.randomRectangle`, 0, 19, context);
    checkIntegerRange(x, `${path}.x`, 0, 89, context);
    checkIntegerRange(y, `${path}.y`, 0, 89, context);
    if ((x === undefined) !== (y === undefined)) {
      context.errors.push(`${path}.x and ${path}.y must be provided together.`);
    }
    return {
      kind,
      level: level ?? 0,
      ...(randomRectangle !== undefined ? { randomRectangle } : {}),
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {})
    };
  }
  allowKeys(value, path, ["kind", "level", "randomRectangle", "x", "y"], context);
  context.errors.push(`${path}.kind must be any, land, or dungeon.`);
  return { kind: "any" };
}
