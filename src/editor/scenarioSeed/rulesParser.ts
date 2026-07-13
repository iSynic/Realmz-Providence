import type {
  ScenarioSeedCaste,
  ScenarioSeedRace,
  ScenarioSeedSpell,
  ScenarioSeedSpellNumberField
} from "./contracts";
import {
  allowKeys,
  checkIntegerRange,
  optionalBoolean,
  optionalFixedIntegerArray,
  optionalFixedIntegerMatrix,
  optionalInteger,
  optionalString,
  optionalStringProperty,
  parseRefArray,
  requireObject,
  type ParseContext
} from "./parsePrimitives";

const SCENARIO_SPELL_NUMBER_FIELDS: ScenarioSeedSpellNumberField[] = [
  "range1", "range2", "queueIcon", "toHitBonus", "saveBonus", "fixedTargetNum", "canRotate", "saveAdjust",
  "cannot", "resistAdjust", "cost", "damage1", "damage2", "powerDamage1", "powerDamage2", "duration1", "duration2",
  "powerDuration1", "powerDuration2", "spellLook1", "spellLook2", "sound1", "sound2", "targetType", "size", "special",
  "damageType", "spellClass"
];

const SCENARIO_RACE_NUMBER_FIELDS = [
  "maxAge", "doesNotDie", "baseMove", "magRes", "twoHand", "missile", "canRegenerate", "defaultIconSet", "descriptors"
] as const;

const SCENARIO_CASTE_NUMBER_FIELDS = [
  "canUseMissile", "getsMissileBonus", "casteClass", "minimumAgeGroup", "moveBonus", "magRes", "twoHand",
  "maxStaminaBonus", "bonusAttacks", "maxAttacks", "startMoney", "defaultIcon", "maxSpellsAttacks", "spellsSoFar"
] as const;

export function parseSpell(input: unknown, path: string, context: ParseContext): ScenarioSeedSpell | null {
  const value = requireObject(input, path, context);
  if (!value) return null;
  allowKeys(
    value,
    path,
    ["key", "id", "displayName", "description", "inCombat", "inCamp", ...SCENARIO_SPELL_NUMBER_FIELDS],
    context
  );
  const key = optionalString(value.key, `${path}.key`, context);
  const id = optionalInteger(value.id, `${path}.id`, context);
  checkIntegerRange(id, `${path}.id`, 0, 104, context);
  const displayName = optionalString(value.displayName, `${path}.displayName`, context);
  const description = optionalString(value.description, `${path}.description`, context);
  const inCombat = optionalBoolean(value.inCombat, `${path}.inCombat`, context);
  const inCamp = optionalBoolean(value.inCamp, `${path}.inCamp`, context);
  const record: ScenarioSeedSpell = {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(displayName !== undefined ? { displayName } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(inCombat !== undefined ? { inCombat } : {}),
    ...(inCamp !== undefined ? { inCamp } : {})
  };
  for (const field of SCENARIO_SPELL_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, context);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}

export function parseRace(input: unknown, path: string, context: ParseContext): ScenarioSeedRace | null {
  const value = requireObject(input, path, context);
  if (!value) return null;
  const arrayFields = {
    plusMinusToHit: 8,
    specialAbility: 14,
    drvBonus: 8,
    attBonus: 6,
    minMax: 12,
    conditions: 40,
    numOfAttacks: 2,
    canCaste: 30,
    itemTypes: 2
  } as const;
  allowKeys(
    value,
    path,
    ["key", "id", "displayName", ...Object.keys(arrayFields), "ageRange", "ageChange", ...SCENARIO_RACE_NUMBER_FIELDS],
    context
  );
  const id = optionalInteger(value.id, `${path}.id`, context);
  checkIntegerRange(id, `${path}.id`, 0, 69, context);
  const record: ScenarioSeedRace = {
    ...optionalStringProperty(value, "key", path, context),
    ...(id !== undefined ? { id } : {}),
    ...optionalStringProperty(value, "displayName", path, context)
  };
  for (const [field, length] of Object.entries(arrayFields) as Array<[keyof typeof arrayFields, number]>) {
    const parsed = optionalFixedIntegerArray(value[field], `${path}.${field}`, length, context);
    if (parsed) record[field] = parsed;
  }
  const ageRange = optionalFixedIntegerMatrix(value.ageRange, `${path}.ageRange`, 5, 2, context);
  const ageChange = optionalFixedIntegerMatrix(value.ageChange, `${path}.ageChange`, 5, 15, context);
  if (ageRange) record.ageRange = ageRange;
  if (ageChange) record.ageChange = ageChange;
  for (const field of SCENARIO_RACE_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, context);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}

export function parseCaste(input: unknown, path: string, context: ParseContext): ScenarioSeedCaste | null {
  const value = requireObject(input, path, context);
  if (!value) return null;
  const arrayFields = {
    drvBonus: 8,
    attBonus: 6,
    minMax: 12,
    conditions: 40,
    stamina: 2,
    strength: 2,
    dodge: 2,
    toHit: 2,
    missile: 2,
    hand2Hand: 2,
    victory: 30,
    attacks: 10,
    itemTypes: 2
  } as const;
  allowKeys(
    value,
    path,
    ["key", "id", "displayName", "specialAbility", "spellcasters", "startItems", ...Object.keys(arrayFields), ...SCENARIO_CASTE_NUMBER_FIELDS],
    context
  );
  const id = optionalInteger(value.id, `${path}.id`, context);
  checkIntegerRange(id, `${path}.id`, 0, 29, context);
  const record: ScenarioSeedCaste = {
    ...optionalStringProperty(value, "key", path, context),
    ...(id !== undefined ? { id } : {}),
    ...optionalStringProperty(value, "displayName", path, context)
  };
  for (const [field, length] of Object.entries(arrayFields) as Array<[keyof typeof arrayFields, number]>) {
    const parsed = optionalFixedIntegerArray(value[field], `${path}.${field}`, length, context);
    if (parsed) record[field] = parsed;
  }
  const specialAbility = optionalFixedIntegerMatrix(value.specialAbility, `${path}.specialAbility`, 2, 14, context);
  const spellcasters = optionalFixedIntegerMatrix(value.spellcasters, `${path}.spellcasters`, 4, 3, context);
  const startItems = parseRefArray(value.startItems, `${path}.startItems`, context);
  if (startItems && startItems.length !== 20) context.errors.push(`${path}.startItems must contain exactly 20 entries.`);
  if (specialAbility) record.specialAbility = specialAbility;
  if (spellcasters) record.spellcasters = spellcasters;
  if (startItems) record.startItems = startItems;
  for (const field of SCENARIO_CASTE_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, context);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}
