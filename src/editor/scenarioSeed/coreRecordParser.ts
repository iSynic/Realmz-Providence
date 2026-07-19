import type {
  ScenarioSeedBattle,
  ScenarioSeedBattlePlacement,
  ScenarioSeedItem,
  ScenarioSeedItemNumberField,
  ScenarioSeedItemTypeName,
  ScenarioSeedMessage,
  ScenarioSeedMonster,
  ScenarioSeedMonsterNumberField,
  ScenarioSeedOptionLabel,
  ScenarioSeedQuest,
  ScenarioSeedRef,
  ScenarioSeedShop,
  ScenarioSeedTreasure
} from "./contracts";
import {
  SCENARIO_ITEM_ID_BASE,
  SCENARIO_ITEM_RECORD_COUNT
} from "./allocation";
import {
  allowKeys,
  checkIntegerRange,
  optionalBoolean,
  optionalInteger,
  optionalRef,
  optionalString,
  parseArray,
  parseIntegerArray,
  parseRefArray,
  requireInteger,
  requireObject,
  requireRef,
  requireString,
  type ObjectValue,
  type ParseContext
} from "./parsePrimitives";
import { SCENARIO_ITEM_TYPE_CODES } from "./recordContracts";
import { validateMaxArrayLength } from "./validation";

const SCENARIO_ITEM_NUMBER_FIELDS: ScenarioSeedItemNumberField[] = [
  "type",
  "st",
  "blunt",
  "hands",
  "lu",
  "movement",
  "ac",
  "magicResistance",
  "damage",
  "spellPoints",
  "sound",
  "weight",
  "cost",
  "charge",
  "cursedItemId",
  "magical",
  "itemCat0",
  "itemCat1",
  "raceRestrictions",
  "casteRestrictions",
  "specificRace",
  "specificCaste",
  "raceClassOnly",
  "casteClassOnly",
  "vSmall",
  "vLarge",
  "heat",
  "cold",
  "electric",
  "vsUndead",
  "vsDemonDevil",
  "vsEvil",
  "special1",
  "special2",
  "special3",
  "special4",
  "special5",
  "weightPerCharge",
  "dropOnEmpty"
];

const SCENARIO_MONSTER_NUMBER_FIELDS: ScenarioSeedMonsterNumberField[] = [
  "hitDice",
  "staminaBonus",
  "agility",
  "nameId",
  "movementMax",
  "armor",
  "magicResistance",
  "distance",
  "traitor",
  "size",
  "attackCount",
  "magicAttackCount",
  "damageBonus",
  "castPercent",
  "runPercent",
  "surrenderPercent",
  "missilePercent",
  "canSummon",
  "spellPoints",
  "exp",
  "stamina",
  "staminaMax",
  "target",
  "guarding",
  "beenAttacked",
  "movement",
  "magicToHit",
  "lr",
  "up",
  "attackNum",
  "bonusAttack",
  "maxSpellPoints"
];
export function parseMessage(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMessage | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "text"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const text = requireString(value.text, `${path}.text`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return { ...(key !== undefined ? { key } : {}), ...(id !== undefined ? { id } : {}), text: text ?? "" };
}

export function parseOptionLabel(input: unknown, path: string, ctx: ParseContext): ScenarioSeedOptionLabel | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["id", "text"], ctx);
  const id = requireInteger(value.id, `${path}.id`, ctx);
  const text = requireString(value.text, `${path}.text`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return { id: id ?? 0, text: text ?? "" };
}

export function parseQuest(input: unknown, path: string, ctx: ParseContext): ScenarioSeedQuest | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "label", "note"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const label = requireString(value.label, `${path}.label`, ctx);
  const note = optionalString(value.note, `${path}.note`, ctx);
  checkIntegerRange(id, `${path}.id`, 1, 126, ctx);
  return { ...(key !== undefined ? { key } : {}), ...(id !== undefined ? { id } : {}), label: label ?? "", ...(note !== undefined ? { note } : {}) };
}

export function parseBattle(input: unknown, path: string, ctx: ParseContext): ScenarioSeedBattle | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "grid", "placements", "dist", "messageBefore", "messageAfter", "battleMacro"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const grid = parseIntegerArray(value.grid, `${path}.grid`, ctx);
  const placements = parseArray(value.placements, `${path}.placements`, ctx, parseBattlePlacement);
  if (grid && grid.length !== 13 * 13) ctx.errors.push(`${path}.grid must contain exactly 169 entries.`);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(grid ? { grid } : {}),
    ...(placements ? { placements } : {}),
    ...optionalNumberField(value, "dist", path, ctx),
    ...optionalNumberField(value, "messageBefore", path, ctx),
    ...optionalNumberField(value, "messageAfter", path, ctx),
    ...optionalNumberField(value, "battleMacro", path, ctx)
  };
}

function parseBattlePlacement(input: unknown, path: string, ctx: ParseContext): ScenarioSeedBattlePlacement | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["x", "y", "monster", "friendly"], ctx);
  const x = requireInteger(value.x, `${path}.x`, ctx);
  const y = requireInteger(value.y, `${path}.y`, ctx);
  checkIntegerRange(x, `${path}.x`, 0, 12, ctx);
  checkIntegerRange(y, `${path}.y`, 0, 12, ctx);
  return {
    x: x ?? 0,
    y: y ?? 0,
    monster: requireRef(value.monster, `${path}.monster`, ctx),
    ...(optionalBoolean(value.friendly, `${path}.friendly`, ctx) !== undefined ? { friendly: optionalBoolean(value.friendly, `${path}.friendly`, ctx) } : {})
  };
}

export function parseMonster(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMonster | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "libraryEntry", "variants", "name", "displayName", "description", "iconId", "icon", "attacks", "typeFlags", "saves", "spellImmunities", "money", "spells", "items", "weapon", "underneath", "conditions", "notOnMenu", "deathMacro", ...SCENARIO_MONSTER_NUMBER_FIELDS], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  const attacks = parseArray(value.attacks, `${path}.attacks`, ctx, parseMonsterAttack);
  if (attacks && attacks.length > 5) ctx.errors.push(`${path}.attacks can contain at most 5 attack rows.`);
  const typeFlags = parseIntegerArray(value.typeFlags, `${path}.typeFlags`, ctx);
  const saves = parseIntegerArray(value.saves, `${path}.saves`, ctx);
  const spellImmunities = parseIntegerArray(value.spellImmunities, `${path}.spellImmunities`, ctx);
  const money = parseIntegerArray(value.money, `${path}.money`, ctx);
  const spells = parseIntegerArray(value.spells, `${path}.spells`, ctx);
  const items = parseRefArray(value.items, `${path}.items`, ctx);
  const underneath = parseIntegerArray(value.underneath, `${path}.underneath`, ctx);
  const conditions = parseIntegerArray(value.conditions, `${path}.conditions`, ctx);
  validateMaxArrayLength(typeFlags, `${path}.typeFlags`, 8, ctx);
  validateMaxArrayLength(saves, `${path}.saves`, 6, ctx);
  validateMaxArrayLength(spellImmunities, `${path}.spellImmunities`, 6, ctx);
  validateMaxArrayLength(money, `${path}.money`, 3, ctx);
  validateMaxArrayLength(spells, `${path}.spells`, 10, ctx);
  validateMaxArrayLength(items, `${path}.items`, 6, ctx);
  validateMaxArrayLength(underneath, `${path}.underneath`, 4, ctx);
  validateMaxArrayLength(conditions, `${path}.conditions`, 40, ctx);
  const record: ScenarioSeedMonster = {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(optionalString(value.libraryEntry, `${path}.libraryEntry`, ctx) !== undefined ? { libraryEntry: optionalString(value.libraryEntry, `${path}.libraryEntry`, ctx) } : {}),
    ...(optionalMonsterVariantMode(value.variants, `${path}.variants`, ctx) !== undefined ? { variants: optionalMonsterVariantMode(value.variants, `${path}.variants`, ctx) } : {}),
    ...(optionalString(value.name, `${path}.name`, ctx) !== undefined ? { name: optionalString(value.name, `${path}.name`, ctx) } : {}),
    ...(optionalString(value.displayName, `${path}.displayName`, ctx) !== undefined ? { displayName: optionalString(value.displayName, `${path}.displayName`, ctx) } : {}),
    ...(optionalString(value.description, `${path}.description`, ctx) !== undefined ? { description: optionalString(value.description, `${path}.description`, ctx) } : {}),
    ...optionalNumberField(value, "iconId", path, ctx),
    ...optionalRefField(value, "icon", path, ctx),
    ...(attacks ? { attacks } : {}),
    ...(typeFlags ? { typeFlags } : {}),
    ...(saves ? { saves } : {}),
    ...(spellImmunities ? { spellImmunities } : {}),
    ...(money ? { money } : {}),
    ...(spells ? { spells } : {}),
    ...(items ? { items } : {}),
    ...optionalRefField(value, "weapon", path, ctx),
    ...(underneath ? { underneath } : {}),
    ...(conditions ? { conditions } : {}),
    ...(optionalBoolean(value.notOnMenu, `${path}.notOnMenu`, ctx) !== undefined ? { notOnMenu: optionalBoolean(value.notOnMenu, `${path}.notOnMenu`, ctx) } : {}),
    ...optionalRefField(value, "deathMacro", path, ctx)
  };
  for (const field of SCENARIO_MONSTER_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, ctx);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}

function parseMonsterAttack(input: unknown, path: string, ctx: ParseContext): number[] | null {
  const values = parseIntegerArray(input, path, ctx);
  if (!values) return null;
  if (values.length !== 4) ctx.errors.push(`${path} must contain exactly 4 byte-sized attack values.`);
  return padArray(values, 4, 0);
}

export function parseTreasure(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTreasure | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "itemIds", "exp", "gold", "gems", "jewelry"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const itemIds = parseRefArray(value.itemIds, `${path}.itemIds`, ctx);
  if (itemIds && itemIds.length > 20) ctx.errors.push(`${path}.itemIds can contain at most 20 item IDs.`);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(itemIds ? { itemIds } : {}),
    ...optionalNumberField(value, "exp", path, ctx),
    ...optionalNumberField(value, "gold", path, ctx),
    ...optionalNumberField(value, "gems", path, ctx),
    ...optionalNumberField(value, "jewelry", path, ctx)
  };
}

export function parseShop(input: unknown, path: string, ctx: ParseContext): ScenarioSeedShop | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "stock", "inflation"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const stock = parseArray(value.stock, `${path}.stock`, ctx, parseShopStock);
  if (stock && stock.length > 1000) ctx.errors.push(`${path}.stock can contain at most 1000 entries.`);
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(stock ? { stock } : {}),
    ...optionalNumberField(value, "inflation", path, ctx)
  };
}

function parseShopStock(input: unknown, path: string, ctx: ParseContext): { itemId: ScenarioSeedRef; quantity?: number } | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["itemId", "quantity"], ctx);
  const itemId = requireRef(value.itemId, `${path}.itemId`, ctx);
  const quantity = optionalInteger(value.quantity, `${path}.quantity`, ctx);
  checkIntegerRange(quantity, `${path}.quantity`, 0, 255, ctx);
  return { itemId, ...(quantity !== undefined ? { quantity } : {}) };
}

export function parseItem(input: unknown, path: string, ctx: ParseContext): ScenarioSeedItem | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "itemId", "unidentifiedName", "identifiedName", "description", "iconId", "icon", "typeName", ...SCENARIO_ITEM_NUMBER_FIELDS], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const itemId = optionalInteger(value.itemId, `${path}.itemId`, ctx);
  const iconId = optionalInteger(value.iconId, `${path}.iconId`, ctx);
  const icon = optionalRef(value.icon, `${path}.icon`, ctx);
  const typeName = optionalScenarioItemTypeName(value.typeName, `${path}.typeName`, ctx);
  checkIntegerRange(id, `${path}.id`, 0, SCENARIO_ITEM_RECORD_COUNT - 1, ctx);
  checkIntegerRange(itemId, `${path}.itemId`, SCENARIO_ITEM_ID_BASE, SCENARIO_ITEM_ID_BASE + SCENARIO_ITEM_RECORD_COUNT - 1, ctx);
  if (id !== undefined && itemId !== undefined && itemId !== SCENARIO_ITEM_ID_BASE + id) {
    ctx.errors.push(`${path}.itemId must equal ${SCENARIO_ITEM_ID_BASE} + id when both are supplied.`);
  }
  if (typeName !== undefined && value.type !== undefined) ctx.errors.push(`${path}.type and ${path}.typeName cannot both be supplied.`);
  const record: ScenarioSeedItem = {
    ...(key !== undefined ? { key } : {}),
    ...(id !== undefined ? { id } : {}),
    ...(itemId !== undefined ? { itemId } : {}),
    ...(optionalString(value.unidentifiedName, `${path}.unidentifiedName`, ctx) !== undefined ? { unidentifiedName: optionalString(value.unidentifiedName, `${path}.unidentifiedName`, ctx) } : {}),
    ...(optionalString(value.identifiedName, `${path}.identifiedName`, ctx) !== undefined ? { identifiedName: optionalString(value.identifiedName, `${path}.identifiedName`, ctx) } : {}),
    ...(optionalString(value.description, `${path}.description`, ctx) !== undefined ? { description: optionalString(value.description, `${path}.description`, ctx) } : {}),
    ...(iconId !== undefined ? { iconId } : {}),
    ...(icon !== undefined ? { icon } : {}),
    ...(typeName !== undefined ? { typeName } : {})
  };
  for (const field of SCENARIO_ITEM_NUMBER_FIELDS) {
    const parsed = optionalInteger(value[field], `${path}.${field}`, ctx);
    if (parsed !== undefined) record[field] = parsed;
  }
  return record;
}
function optionalScenarioItemTypeName(input: unknown, path: string, ctx: ParseContext): ScenarioSeedItemTypeName | undefined {
  if (input === undefined) return undefined;
  if (typeof input === "string" && Object.prototype.hasOwnProperty.call(SCENARIO_ITEM_TYPE_CODES, input)) {
    return input as ScenarioSeedItemTypeName;
  }
  ctx.errors.push(`${path} must be a supported semantic item type name.`);
  return undefined;
}

function optionalMonsterVariantMode(input: unknown, path: string, ctx: ParseContext): ScenarioSeedMonster["variants"] | undefined {
  if (input === undefined) return undefined;
  if (input === "normalOnly" || input === "copyAll" || input === "generated") return input;
  ctx.errors.push(`${path} must be normalOnly, copyAll, or generated.`);
  return undefined;
}

function optionalNumberField<T extends string>(
  value: ObjectValue,
  key: T,
  path: string,
  context: ParseContext
): Partial<Record<T, number>> {
  const parsed = optionalInteger(value[key], `${path}.${key}`, context);
  return parsed === undefined ? {} : { [key]: parsed } as Partial<Record<T, number>>;
}

function optionalRefField<T extends string>(
  value: ObjectValue,
  key: T,
  path: string,
  context: ParseContext
): Partial<Record<T, ScenarioSeedRef>> {
  const parsed = optionalRef(value[key], `${path}.${key}`, context);
  return parsed === undefined ? {} : { [key]: parsed } as Partial<Record<T, ScenarioSeedRef>>;
}

function padArray(values: number[], length: number, fill: number) {
  return [...values.slice(0, length), ...new Array(Math.max(0, length - values.length)).fill(fill)];
}
