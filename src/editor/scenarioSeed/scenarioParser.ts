import type { ScenarioSeedGlobalMacros, ScenarioSeedRestrictions, ScenarioSeedScenario, ScenarioSeedStart } from "./contracts";
import {
  allowKeys,
  checkIntegerRange,
  optionalInteger,
  optionalRef,
  optionalString,
  parseIntegerArray,
  requireInteger,
  requireObject,
  requireString,
  type ParseContext
} from "./parsePrimitives";

export function parseScenario(
  input: unknown,
  path: string,
  context: ParseContext
): ScenarioSeedScenario | null {
  const value = requireObject(input, path, context);
  if (!value) return null;
  allowKeys(
    value,
    path,
    ["id", "name", "start", "globalMacros", "restrictions", "author", "version", "date", "email", "web", "description"],
    context
  );
  const name = requireString(value.name, `${path}.name`, context);
  const start = parseScenarioStart(value.start, `${path}.start`, context);
  const globalMacros = parseScenarioGlobalMacros(value.globalMacros, `${path}.globalMacros`, context);
  const restrictions = parseScenarioRestrictions(value.restrictions, `${path}.restrictions`, context);
  const id = optionalString(value.id, `${path}.id`, context);
  const author = optionalString(value.author, `${path}.author`, context);
  const version = optionalString(value.version, `${path}.version`, context);
  const date = optionalString(value.date, `${path}.date`, context);
  const email = optionalString(value.email, `${path}.email`, context);
  const web = optionalString(value.web, `${path}.web`, context);
  const description = optionalString(value.description, `${path}.description`, context);
  return {
    ...(id !== undefined ? { id } : {}),
    name: name ?? "Untitled Scenario",
    ...(start ? { start } : {}),
    ...(globalMacros ? { globalMacros } : {}),
    ...(restrictions ? { restrictions } : {}),
    ...(author !== undefined ? { author } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(date !== undefined ? { date } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(web !== undefined ? { web } : {}),
    ...(description !== undefined ? { description } : {})
  };
}

export function parseScenarioRestrictions(
  input: unknown,
  path: string,
  context: ParseContext
): ScenarioSeedRestrictions | undefined {
  if (input === undefined) return undefined;
  const value = requireObject(input, path, context);
  if (!value) return undefined;
  allowKeys(value, path, ["description", "maxPartyCharacters", "maxPartyLevel", "bannedRaces", "bannedCastes"], context);
  const description = optionalString(value.description, `${path}.description`, context);
  const maxPartyCharacters = optionalInteger(value.maxPartyCharacters, `${path}.maxPartyCharacters`, context);
  const maxPartyLevel = optionalInteger(value.maxPartyLevel, `${path}.maxPartyLevel`, context);
  const bannedRaces = parseIntegerArray(value.bannedRaces, `${path}.bannedRaces`, context);
  const bannedCastes = parseIntegerArray(value.bannedCastes, `${path}.bannedCastes`, context);
  if (description !== undefined && [...description].length > 255) {
    context.errors.push(`${path}.description must contain at most 255 Classic text characters.`);
  }
  checkIntegerRange(maxPartyCharacters, `${path}.maxPartyCharacters`, 0, 6, context);
  checkIntegerRange(maxPartyLevel, `${path}.maxPartyLevel`, 0, 32767, context);
  validateRestrictionIds(bannedRaces, `${path}.bannedRaces`, context);
  validateRestrictionIds(bannedCastes, `${path}.bannedCastes`, context);
  return {
    ...(description !== undefined ? { description } : {}),
    ...(maxPartyCharacters !== undefined ? { maxPartyCharacters } : {}),
    ...(maxPartyLevel !== undefined ? { maxPartyLevel } : {}),
    ...(bannedRaces ? { bannedRaces } : {}),
    ...(bannedCastes ? { bannedCastes } : {})
  };
}

function validateRestrictionIds(values: number[] | undefined, path: string, context: ParseContext) {
  if (!values) return;
  const seen = new Set<number>();
  values.forEach((value, index) => {
    checkIntegerRange(value, `${path}[${index}]`, 1, 30, context);
    if (seen.has(value)) context.errors.push(`${path} contains duplicate ID ${value}.`);
    seen.add(value);
  });
}

export function parseScenarioGlobalMacros(
  input: unknown,
  path: string,
  context: ParseContext
): ScenarioSeedGlobalMacros | undefined {
  if (input === undefined) return undefined;
  const value = requireObject(input, path, context);
  if (!value) return undefined;
  const fields = ["start", "death", "quit", "shop", "temple"] as const;
  allowKeys(value, path, [...fields], context);
  return Object.fromEntries(fields.flatMap((field) => {
    const ref = optionalRef(value[field], `${path}.${field}`, context);
    return ref === undefined ? [] : [[field, ref]];
  }));
}

export function parseScenarioStart(
  input: unknown,
  path: string,
  context: ParseContext
): ScenarioSeedStart | undefined {
  if (input === undefined) return undefined;
  const value = requireObject(input, path, context);
  if (!value) return undefined;
  allowKeys(value, path, ["landLevel", "x", "y"], context);
  const landLevel = requireInteger(value.landLevel, `${path}.landLevel`, context);
  const x = requireInteger(value.x, `${path}.x`, context);
  const y = requireInteger(value.y, `${path}.y`, context);
  checkIntegerRange(landLevel, `${path}.landLevel`, 0, null, context);
  checkIntegerRange(x, `${path}.x`, 0, 89, context);
  checkIntegerRange(y, `${path}.y`, 0, 89, context);
  if (landLevel === null || x === null || y === null) return undefined;
  return { landLevel, x, y };
}
