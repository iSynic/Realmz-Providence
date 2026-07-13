import type { ScenarioSeedScenario, ScenarioSeedStart } from "../scenarioSeed";
import {
  allowKeys,
  checkIntegerRange,
  optionalString,
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
    ["id", "name", "start", "author", "version", "date", "email", "web", "description"],
    context
  );
  const name = requireString(value.name, `${path}.name`, context);
  const start = parseScenarioStart(value.start, `${path}.start`, context);
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
    ...(author !== undefined ? { author } : {}),
    ...(version !== undefined ? { version } : {}),
    ...(date !== undefined ? { date } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(web !== undefined ? { web } : {}),
    ...(description !== undefined ? { description } : {})
  };
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
