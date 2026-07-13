import type {
  ScenarioSeedComplexEncounter,
  ScenarioSeedComplexResultNumber,
  ScenarioSeedComplexResultScript,
  ScenarioSeedEncounterAction,
  ScenarioSeedRogueAction,
  ScenarioSeedRogueActionKind,
  ScenarioSeedRogueOutcome,
  ScenarioSeedSimpleEncounter,
  ScenarioSeedSimpleEncounterOption,
  ScenarioSeedThiefEncounter
} from "./contracts";
import { parseStep } from "./actionPointParser";
import { ROGUE_ACTION_SLOTS } from "./encounterContracts";
import {
  allowKeys,
  checkIntegerRange,
  optionalBoolean,
  optionalInteger,
  optionalRef,
  optionalString,
  parseArray,
  parseIntegerArray,
  parseStringArray,
  requireInteger,
  requireObject,
  requireRef,
  requireString,
  type ParseContext
} from "./parsePrimitives";

export function parseSimpleEncounter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedSimpleEncounter | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "prompt", "options", "texts", "actions", "choiceResults", "canBackOut", "maxTimes", "casteSuccess"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const prompt = optionalRef(value.prompt, `${path}.prompt`, ctx);
  const options = parseArray(value.options, `${path}.options`, ctx, parseSimpleEncounterOption);
  const texts = parseStringArray(value.texts, `${path}.texts`, ctx);
  const actions = parseArray(value.actions, `${path}.actions`, ctx, parseEncounterAction);
  const choiceResults = parseIntegerArray(value.choiceResults, `${path}.choiceResults`, ctx);
  const maxTimes = optionalInteger(value.maxTimes, `${path}.maxTimes`, ctx);
  const casteSuccess = optionalInteger(value.casteSuccess, `${path}.casteSuccess`, ctx);
  if (texts && texts.length > 4) ctx.errors.push(`${path}.texts can contain at most 4 option strings.`);
  for (const [index, text] of (texts ?? []).entries()) {
    if (text.length > 79) ctx.errors.push(`${path}.texts[${index}] must be 79 characters or fewer.`);
  }
  if (actions && actions.length > 32) ctx.errors.push(`${path}.actions can contain at most 32 encounter action slots.`);
  const actionSlots = new Set<number>();
  for (const [index, action] of (actions ?? []).entries()) {
    const slot = action.slot ?? index;
    if (actionSlots.has(slot)) ctx.errors.push(`${path}.actions contains duplicate slot ${slot}.`);
    actionSlots.add(slot);
  }
  if (choiceResults && choiceResults.length > 4) ctx.errors.push(`${path}.choiceResults can contain at most 4 result entries.`);
  for (const [index, result] of (choiceResults ?? []).entries()) {
    if (result === -4 && index === 0) continue;
    checkIntegerRange(result, `${path}.choiceResults[${index}]`, 0, 4, ctx);
  }
  if (options && options.length === 0) ctx.errors.push(`${path}.options must contain at least one option.`);
  if (options && options.length > 4) ctx.errors.push(`${path}.options can contain at most 4 options.`);
  if (options !== undefined && (texts !== undefined || actions !== undefined || choiceResults !== undefined)) {
    ctx.errors.push(`${path} cannot combine semantic options with raw texts, actions, or choiceResults.`);
  }
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  checkIntegerRange(maxTimes, `${path}.maxTimes`, -128, 127, ctx);
  checkIntegerRange(casteSuccess, `${path}.casteSuccess`, -128, 127, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(options ? { options } : {}),
    ...(texts ? { texts } : {}),
    ...(actions ? { actions } : {}),
    ...(choiceResults ? { choiceResults } : {}),
    ...(optionalBoolean(value.canBackOut, `${path}.canBackOut`, ctx) !== undefined ? { canBackOut: optionalBoolean(value.canBackOut, `${path}.canBackOut`, ctx) } : {}),
    ...(maxTimes !== undefined ? { maxTimes } : {}),
    ...(casteSuccess !== undefined ? { casteSuccess } : {})
  };
}

function parseSimpleEncounterOption(input: unknown, path: string, ctx: ParseContext): ScenarioSeedSimpleEncounterOption | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["label", "steps"], ctx);
  const label = requireString(value.label, `${path}.label`, ctx) ?? "";
  const steps = parseArray(value.steps, `${path}.steps`, ctx, parseStep) ?? [];
  if (label.length > 79) ctx.errors.push(`${path}.label must be 79 characters or fewer.`);
  if (steps.length === 0) ctx.errors.push(`${path}.steps must contain at least one step.`);
  if (steps.length > 8) ctx.errors.push(`${path}.steps can contain at most 8 steps.`);
  return { label, steps };
}

export function parseThiefEncounter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedThiefEncounter | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "prompt", "actions", "trap", "lock"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const prompt = optionalRef(value.prompt, `${path}.prompt`, ctx);
  const actions = parseArray(value.actions, `${path}.actions`, ctx, parseRogueAction);
  const trap = value.trap === undefined ? undefined : parseRogueTrap(value.trap, `${path}.trap`, ctx);
  const lock = value.lock === undefined ? undefined : parseRogueLock(value.lock, `${path}.lock`, ctx);
  checkIntegerRange(id, `${path}.id`, 1, 127, ctx);
  if (actions && actions.length > 8) ctx.errors.push(`${path}.actions can contain at most 8 Rogue actions.`);
  const actionKinds = new Set<ScenarioSeedRogueActionKind>();
  for (const action of actions ?? []) {
    if (actionKinds.has(action.kind)) ctx.errors.push(`${path}.actions contains duplicate action ${action.kind}.`);
    actionKinds.add(action.kind);
  }
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(actions ? { actions } : {}),
    ...(trap ? { trap } : {}),
    ...(lock ? { lock } : {})
  };
}

function parseRogueAction(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRogueAction | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["kind", "modifier", "success", "failure"], ctx);
  const rawKind = requireString(value.kind, `${path}.kind`, ctx);
  const kind = rawKind && Object.prototype.hasOwnProperty.call(ROGUE_ACTION_SLOTS, rawKind)
    ? rawKind as ScenarioSeedRogueActionKind
    : "acrobaticAct";
  if (rawKind && !Object.prototype.hasOwnProperty.call(ROGUE_ACTION_SLOTS, rawKind)) {
    ctx.errors.push(`${path}.kind must be one of ${Object.keys(ROGUE_ACTION_SLOTS).join(", ")}.`);
  }
  const modifier = optionalInteger(value.modifier, `${path}.modifier`, ctx);
  checkIntegerRange(modifier, `${path}.modifier`, -128, 127, ctx);
  return {
    kind,
    ...(modifier !== undefined ? { modifier } : {}),
    success: parseRogueOutcome(value.success, `${path}.success`, ctx),
    failure: parseRogueOutcome(value.failure, `${path}.failure`, ctx)
  };
}

function parseRogueOutcome(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRogueOutcome {
  const value = requireObject(input, path, ctx);
  if (!value) return {};
  allowKeys(value, path, ["result", "message", "sound"], ctx);
  const result = optionalComplexResultNumber(value.result, `${path}.result`, ctx);
  const message = optionalRef(value.message, `${path}.message`, ctx);
  const sound = optionalRef(value.sound, `${path}.sound`, ctx);
  if (result === undefined && message === undefined && sound === undefined) {
    ctx.errors.push(`${path} must provide a result, message, or sound.`);
  }
  return {
    ...(result !== undefined ? { result } : {}),
    ...(message !== undefined ? { message } : {}),
    ...(sound !== undefined ? { sound } : {})
  };
}

function parseRogueTrap(input: unknown, path: string, ctx: ParseContext): NonNullable<ScenarioSeedThiefEncounter["trap"]> | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["armed", "rogueOnly", "damage", "sound", "spell", "spellPower", "disarmChancePerLevel"], ctx);
  const armed = optionalBoolean(value.armed, `${path}.armed`, ctx);
  const rogueOnly = optionalBoolean(value.rogueOnly, `${path}.rogueOnly`, ctx);
  const damage = value.damage === undefined ? undefined : parseRogueDamage(value.damage, `${path}.damage`, ctx);
  const sound = optionalRef(value.sound, `${path}.sound`, ctx);
  const spell = optionalInteger(value.spell, `${path}.spell`, ctx);
  const spellPower = optionalInteger(value.spellPower, `${path}.spellPower`, ctx);
  const disarmChancePerLevel = optionalInteger(value.disarmChancePerLevel, `${path}.disarmChancePerLevel`, ctx);
  checkIntegerRange(spell, `${path}.spell`, 0, 32767, ctx);
  checkIntegerRange(spellPower, `${path}.spellPower`, 0, 32767, ctx);
  checkIntegerRange(disarmChancePerLevel, `${path}.disarmChancePerLevel`, 0, 100, ctx);
  return {
    ...(armed !== undefined ? { armed } : {}),
    ...(rogueOnly !== undefined ? { rogueOnly } : {}),
    ...(damage ? { damage } : {}),
    ...(sound !== undefined ? { sound } : {}),
    ...(spell !== undefined ? { spell } : {}),
    ...(spellPower !== undefined ? { spellPower } : {}),
    ...(disarmChancePerLevel !== undefined ? { disarmChancePerLevel } : {})
  };
}

function parseRogueDamage(input: unknown, path: string, ctx: ParseContext): { low: number; high: number } | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["low", "high"], ctx);
  const low = requireInteger(value.low, `${path}.low`, ctx);
  const high = requireInteger(value.high, `${path}.high`, ctx);
  checkIntegerRange(low, `${path}.low`, 0, 32767, ctx);
  checkIntegerRange(high, `${path}.high`, 0, 32767, ctx);
  if (low !== null && high !== null && low > high) ctx.errors.push(`${path}.low must not exceed ${path}.high.`);
  return { low: low ?? 0, high: high ?? 0 };
}

function parseRogueLock(input: unknown, path: string, ctx: ParseContext): NonNullable<ScenarioSeedThiefEncounter["lock"]> | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["tumblers", "openChancePerLevel"], ctx);
  const tumblers = optionalInteger(value.tumblers, `${path}.tumblers`, ctx);
  const openChancePerLevel = optionalInteger(value.openChancePerLevel, `${path}.openChancePerLevel`, ctx);
  checkIntegerRange(tumblers, `${path}.tumblers`, 0, 6, ctx);
  checkIntegerRange(openChancePerLevel, `${path}.openChancePerLevel`, 0, 100, ctx);
  return {
    ...(tumblers !== undefined ? { tumblers } : {}),
    ...(openChancePerLevel !== undefined ? { openChancePerLevel } : {})
  };
}

export function parseComplexEncounter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedComplexEncounter | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "prompt", "physicalActions", "requiredPhysicalActions", "physicalResult", "word", "spells", "items", "thief", "results", "actions", "canBackOut", "maxTimes", "casteSuccess"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const prompt = optionalRef(value.prompt, `${path}.prompt`, ctx);
  const physicalActions = parseStringArray(value.physicalActions, `${path}.physicalActions`, ctx);
  const requiredPhysicalActions = parseIntegerArray(value.requiredPhysicalActions, `${path}.requiredPhysicalActions`, ctx);
  const physicalResult = optionalComplexResultNumber(value.physicalResult, `${path}.physicalResult`, ctx);
  const word = value.word === undefined ? undefined : parseComplexWord(value.word, `${path}.word`, ctx);
  const spells = parseArray(value.spells, `${path}.spells`, ctx, parseComplexSpellResponse);
  const items = parseArray(value.items, `${path}.items`, ctx, parseComplexItemResponse);
  const thief = value.thief === undefined ? undefined : parseComplexThiefResponse(value.thief, `${path}.thief`, ctx);
  const results = parseArray(value.results, `${path}.results`, ctx, parseComplexResultScript);
  const actions = parseArray(value.actions, `${path}.actions`, ctx, parseEncounterAction);
  const maxTimes = optionalInteger(value.maxTimes, `${path}.maxTimes`, ctx);
  const casteSuccess = optionalInteger(value.casteSuccess, `${path}.casteSuccess`, ctx);
  const canBackOut = optionalBoolean(value.canBackOut, `${path}.canBackOut`, ctx);

  if (physicalActions && physicalActions.length > 8) ctx.errors.push(`${path}.physicalActions can contain at most 8 choices.`);
  for (const [index, text] of (physicalActions ?? []).entries()) {
    if (text.length > 39) ctx.errors.push(`${path}.physicalActions[${index}] must be 39 characters or fewer.`);
  }
  if (requiredPhysicalActions && requiredPhysicalActions.length > 8) ctx.errors.push(`${path}.requiredPhysicalActions can contain at most 8 choice numbers.`);
  const requiredSet = new Set<number>();
  for (const [index, choice] of (requiredPhysicalActions ?? []).entries()) {
    checkIntegerRange(choice, `${path}.requiredPhysicalActions[${index}]`, 1, 8, ctx);
    if (requiredSet.has(choice)) ctx.errors.push(`${path}.requiredPhysicalActions contains duplicate choice ${choice}.`);
    requiredSet.add(choice);
    if (physicalActions && choice > physicalActions.length) ctx.errors.push(`${path}.requiredPhysicalActions[${index}] points beyond the ${physicalActions.length} physical choices.`);
  }
  if ((requiredPhysicalActions?.length ?? 0) > 0 && (physicalActions?.length ?? 0) === 0) ctx.errors.push(`${path}.requiredPhysicalActions requires at least one physicalActions entry.`);
  if (physicalResult !== undefined && (physicalActions?.length ?? 0) === 0) ctx.errors.push(`${path}.physicalResult requires at least one physicalActions entry.`);
  if (spells && spells.length > 10) ctx.errors.push(`${path}.spells can contain at most 10 responses.`);
  if (items && items.length > 5) ctx.errors.push(`${path}.items can contain at most 5 responses.`);
  if (results && results.length > 4) ctx.errors.push(`${path}.results can contain at most 4 result scripts.`);
  const resultNumbers = new Set<number>();
  for (const result of results ?? []) {
    if (resultNumbers.has(result.result)) ctx.errors.push(`${path}.results contains duplicate result ${result.result}.`);
    resultNumbers.add(result.result);
  }
  if (actions && actions.length > 32) ctx.errors.push(`${path}.actions can contain at most 32 encounter action slots.`);
  const actionSlots = new Set<number>();
  for (const [index, action] of (actions ?? []).entries()) {
    const slot = action.slot ?? index;
    if (actionSlots.has(slot)) ctx.errors.push(`${path}.actions contains duplicate slot ${slot}.`);
    actionSlots.add(slot);
  }
  if (actions !== undefined && results !== undefined) ctx.errors.push(`${path} cannot combine raw actions with semantic results.`);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  checkIntegerRange(maxTimes, `${path}.maxTimes`, -128, 127, ctx);
  checkIntegerRange(casteSuccess, `${path}.casteSuccess`, -128, 127, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(prompt !== undefined ? { prompt } : {}),
    ...(physicalActions ? { physicalActions } : {}),
    ...(requiredPhysicalActions ? { requiredPhysicalActions } : {}),
    ...(physicalResult !== undefined ? { physicalResult } : {}),
    ...(word ? { word } : {}),
    ...(spells ? { spells } : {}),
    ...(items ? { items } : {}),
    ...(thief ? { thief } : {}),
    ...(results ? { results } : {}),
    ...(actions ? { actions } : {}),
    ...(canBackOut !== undefined ? { canBackOut } : {}),
    ...(maxTimes !== undefined ? { maxTimes } : {}),
    ...(casteSuccess !== undefined ? { casteSuccess } : {})
  };
}

function parseComplexWord(input: unknown, path: string, ctx: ParseContext) {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["text", "result"], ctx);
  const text = requireString(value.text, `${path}.text`, ctx) ?? "";
  if (text.length > 39) ctx.errors.push(`${path}.text must be 39 characters or fewer.`);
  return { text, result: requireComplexResultNumber(value.result, `${path}.result`, ctx) };
}

function parseComplexSpellResponse(input: unknown, path: string, ctx: ParseContext) {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["spell", "result"], ctx);
  const spell = requireInteger(value.spell, `${path}.spell`, ctx);
  checkIntegerRange(spell, `${path}.spell`, 0, 32767, ctx);
  return { spell: spell ?? 0, result: requireComplexResultNumber(value.result, `${path}.result`, ctx) };
}

function parseComplexItemResponse(input: unknown, path: string, ctx: ParseContext) {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["item", "result"], ctx);
  return { item: requireRef(value.item, `${path}.item`, ctx), result: requireComplexResultNumber(value.result, `${path}.result`, ctx) };
}

function parseComplexThiefResponse(input: unknown, path: string, ctx: ParseContext) {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["encounter"], ctx);
  const encounter = requireRef(value.encounter, `${path}.encounter`, ctx);
  if (typeof encounter === "number") checkIntegerRange(encounter, `${path}.encounter`, 1, 127, ctx);
  return { encounter };
}

function parseComplexResultScript(input: unknown, path: string, ctx: ParseContext): ScenarioSeedComplexResultScript | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["result", "steps"], ctx);
  const steps = parseArray(value.steps, `${path}.steps`, ctx, parseStep) ?? [];
  if (steps.length === 0) ctx.errors.push(`${path}.steps must contain at least one step.`);
  if (steps.length > 8) ctx.errors.push(`${path}.steps can contain at most 8 steps.`);
  return { result: requireComplexResultNumber(value.result, `${path}.result`, ctx), steps };
}

function optionalComplexResultNumber(input: unknown, path: string, ctx: ParseContext): ScenarioSeedComplexResultNumber | undefined {
  if (input === undefined) return undefined;
  return requireComplexResultNumber(input, path, ctx);
}

function requireComplexResultNumber(input: unknown, path: string, ctx: ParseContext): ScenarioSeedComplexResultNumber {
  const value = requireInteger(input, path, ctx);
  checkIntegerRange(value, path, 1, 4, ctx);
  return (value !== null && value >= 1 && value <= 4 ? value : 1) as ScenarioSeedComplexResultNumber;
}

function parseEncounterAction(input: unknown, path: string, ctx: ParseContext): ScenarioSeedEncounterAction | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["slot", "rawCode", "id"], ctx);
  const slot = optionalInteger(value.slot, `${path}.slot`, ctx);
  const rawCode = requireInteger(value.rawCode, `${path}.rawCode`, ctx);
  const id = requireInteger(value.id, `${path}.id`, ctx);
  checkIntegerRange(slot, `${path}.slot`, 0, 31, ctx);
  checkIntegerRange(rawCode, `${path}.rawCode`, -128, 127, ctx);
  checkIntegerRange(id, `${path}.id`, -32768, 32767, ctx);
  return { ...(slot !== undefined ? { slot } : {}), rawCode: rawCode ?? 0, id: id ?? 0 };
}
