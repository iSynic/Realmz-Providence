import type { LevelType } from "../types";
import type {
  ScenarioSeedActionPoint,
  ScenarioSeedBoatStatus,
  ScenarioSeedBranchTargetKind,
  ScenarioSeedCharacterSelector,
  ScenarioSeedExtraActionPoint,
  ScenarioSeedPartyCondition,
  ScenarioSeedRandomRectangleShape,
  ScenarioSeedRef,
  ScenarioSeedStep,
  ScenarioSeedTileParameter,
  ScenarioSeedTimeMode
} from "./contracts";
import {
  ALTER_PICKED_ATTRIBUTE_CODES,
  DIRECTION_CODES,
  PARTY_CONDITION_CODES,
  TILE_PARAMETER_CODES
} from "./actionPointContracts";
import { optionalLevelType } from "./mapParser";
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

export function parseActionPoint(input: unknown, path: string, ctx: ParseContext): ScenarioSeedActionPoint | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "recordIndex", "levelType", "levelIndex", "map", "at", "x", "y", "percent", "steps"], ctx);
  const steps = parseArray(value.steps, `${path}.steps`, ctx, parseStep) ?? [];
  if (steps.length > 8) ctx.errors.push(`${path}.steps can contain at most 8 Realmz action slots.`);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const recordIndex = optionalInteger(value.recordIndex, `${path}.recordIndex`, ctx);
  const levelType = optionalLevelType(value.levelType, `${path}.levelType`, ctx);
  const levelIndex = optionalInteger(value.levelIndex, `${path}.levelIndex`, ctx);
  const map = optionalRef(value.map, `${path}.map`, ctx);
  const at = optionalRef(value.at, `${path}.at`, ctx);
  const x = optionalInteger(value.x, `${path}.x`, ctx);
  const y = optionalInteger(value.y, `${path}.y`, ctx);
  const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
  checkIntegerRange(recordIndex, `${path}.recordIndex`, 0, null, ctx);
  checkIntegerRange(levelIndex, `${path}.levelIndex`, 0, null, ctx);
  checkIntegerRange(x, `${path}.x`, 0, 89, ctx);
  checkIntegerRange(y, `${path}.y`, 0, 89, ctx);
  checkIntegerRange(percent, `${path}.percent`, 0, 100, ctx);
  if (at === undefined && (x === undefined || y === undefined)) ctx.errors.push(`${path} must provide x/y or at.`);
  return {
    ...(key !== undefined ? { key } : {}),
    ...(optionalString(value.id, `${path}.id`, ctx) !== undefined ? { id: optionalString(value.id, `${path}.id`, ctx) } : {}),
    ...(recordIndex !== undefined ? { recordIndex } : {}),
    ...(levelType !== undefined ? { levelType } : {}),
    ...(levelIndex !== undefined ? { levelIndex } : {}),
    ...(map !== undefined ? { map } : {}),
    ...(at !== undefined ? { at } : {}),
    ...(x !== undefined ? { x } : {}),
    ...(y !== undefined ? { y } : {}),
    ...(percent !== undefined ? { percent } : {}),
    steps
  };
}

export function parseExtraActionPoint(input: unknown, path: string, ctx: ParseContext): ScenarioSeedExtraActionPoint | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  allowKeys(value, path, ["key", "id", "steps"], ctx);
  const key = optionalString(value.key, `${path}.key`, ctx);
  const id = optionalInteger(value.id, `${path}.id`, ctx);
  const steps = parseArray(value.steps, `${path}.steps`, ctx, parseStep) ?? [];
  checkIntegerRange(id, `${path}.id`, 0, null, ctx);
  if (steps.length > 8) ctx.errors.push(`${path}.steps can contain at most 8 Realmz action slots.`);
  return { ...(key !== undefined ? { key } : {}), ...(id !== undefined ? { id } : {}), steps };
}

export function parseStep(input: unknown, path: string, ctx: ParseContext): ScenarioSeedStep | null {
  const value = requireObject(input, path, ctx);
  if (!value) return null;
  const kind = requireString(value.kind, `${path}.kind`, ctx);
  if (kind === "message") {
    allowKeys(value, path, ["kind", "message", "messageId"], ctx);
    return { kind, message: requireRef(value.message ?? value.messageId, `${path}.message`, ctx) };
  }
  if (kind === "battle") {
    allowKeys(value, path, ["kind", "battle", "battleId", "battleHigh", "sound", "message", "reviveParty"], ctx);
    return {
      kind,
      battle: requireRef(value.battle ?? value.battleId, `${path}.battle`, ctx),
      ...optionalRefField(value, "battleHigh", path, ctx),
      ...optionalRefField(value, "sound", path, ctx),
      ...optionalRefField(value, "message", path, ctx),
      ...(optionalBoolean(value.reviveParty, `${path}.reviveParty`, ctx) !== undefined ? { reviveParty: optionalBoolean(value.reviveParty, `${path}.reviveParty`, ctx) } : {})
    };
  }
  if (kind === "simpleEncounter") {
    allowKeys(value, path, ["kind", "encounter"], ctx);
    return { kind, encounter: requireRef(value.encounter, `${path}.encounter`, ctx) };
  }
  if (kind === "complexEncounter") {
    allowKeys(value, path, ["kind", "encounter"], ctx);
    return { kind, encounter: requireRef(value.encounter, `${path}.encounter`, ctx) };
  }
  if (kind === "shop") {
    allowKeys(value, path, ["kind", "shop", "shopId"], ctx);
    return { kind, shop: requireRef(value.shop ?? value.shopId, `${path}.shop`, ctx) };
  }
  if (kind === "treasure") {
    allowKeys(value, path, ["kind", "treasure", "treasureId"], ctx);
    return { kind, treasure: requireRef(value.treasure ?? value.treasureId, `${path}.treasure`, ctx) };
  }
  if (kind === "sound") {
    allowKeys(value, path, ["kind", "sound"], ctx);
    return { kind, sound: requireRef(value.sound, `${path}.sound`, ctx) };
  }
  if (kind === "picture") {
    allowKeys(value, path, ["kind", "picture"], ctx);
    return { kind, picture: requireRef(value.picture, `${path}.picture`, ctx) };
  }
  if (kind === "scrollingText") {
    allowKeys(value, path, ["kind", "text"], ctx);
    return { kind, text: requireRef(value.text, `${path}.text`, ctx) };
  }
  if (kind === "victoryPoints") {
    allowKeys(value, path, ["kind", "amount"], ctx);
    return { kind, amount: requireInteger(value.amount, `${path}.amount`, ctx) ?? 0 };
  }
  if (kind === "temple") {
    allowKeys(value, path, ["kind", "inflation"], ctx);
    return { kind, inflation: requireInteger(value.inflation, `${path}.inflation`, ctx) ?? 100 };
  }
  if (kind === "banking") {
    allowKeys(value, path, ["kind", "shop"], ctx);
    return { kind, ...optionalRefField(value, "shop", path, ctx) };
  }
  if (kind === "displayMap") {
    allowKeys(value, path, ["kind", "map"], ctx);
    return { kind, map: requireInteger(value.map, `${path}.map`, ctx) ?? 0 };
  }
  if (kind === "pickCharacters") {
    allowKeys(value, path, ["kind", "count", "inverse"], ctx);
    return { kind, count: requireInteger(value.count, `${path}.count`, ctx) ?? 1, ...(optionalBoolean(value.inverse, `${path}.inverse`, ctx) !== undefined ? { inverse: optionalBoolean(value.inverse, `${path}.inverse`, ctx) } : {}) };
  }
  if (kind === "returnGosub") {
    allowKeys(value, path, ["kind"], ctx);
    return { kind };
  }
  if (kind === "popStack") {
    allowKeys(value, path, ["kind"], ctx);
    return { kind };
  }
  if (kind === "addSpecialCharacter") {
    allowKeys(value, path, ["kind", "monster"], ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx) };
  }
  if (kind === "dropSpecialCharacter") {
    allowKeys(value, path, ["kind", "monster"], ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx) };
  }
  if (kind === "teleport") {
    allowKeys(value, path, ["kind", "landLevel", "map", "at", "x", "y", "sound", "message", "teleportOnly"], ctx);
    const landLevel = optionalInteger(value.landLevel, `${path}.landLevel`, ctx);
    const map = optionalRef(value.map, `${path}.map`, ctx);
    const at = optionalRef(value.at, `${path}.at`, ctx);
    const x = optionalInteger(value.x, `${path}.x`, ctx);
    const y = optionalInteger(value.y, `${path}.y`, ctx);
    const sound = optionalRef(value.sound, `${path}.sound`, ctx);
    const message = optionalRef(value.message, `${path}.message`, ctx);
    checkIntegerRange(landLevel, `${path}.landLevel`, -1, null, ctx);
    checkIntegerRange(x, `${path}.x`, -1, 89, ctx);
    checkIntegerRange(y, `${path}.y`, -1, 89, ctx);
    if ((x === undefined) !== (y === undefined)) ctx.errors.push(`${path}.x and ${path}.y must be provided together.`);
    if (landLevel !== undefined && map !== undefined) ctx.errors.push(`${path}.landLevel and ${path}.map cannot both be provided.`);
    if (at !== undefined && (landLevel !== undefined || x !== undefined || y !== undefined)) ctx.errors.push(`${path}.at replaces landLevel, x, and y; do not provide both destination forms.`);
    if (map !== undefined && at === undefined && (x === undefined || y === undefined)) ctx.errors.push(`${path}.map requires x and y unless at names a region.`);
    return {
      kind,
      ...(landLevel !== undefined ? { landLevel } : {}),
      ...(map !== undefined ? { map } : {}),
      ...(at !== undefined ? { at } : {}),
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {}),
      ...(sound !== undefined ? { sound } : {}),
      ...(message !== undefined ? { message } : {}),
      ...(optionalBoolean(value.teleportOnly, `${path}.teleportOnly`, ctx) !== undefined ? { teleportOnly: optionalBoolean(value.teleportOnly, `${path}.teleportOnly`, ctx) } : {})
    };
  }
  if (kind === "randomMessage") {
    allowKeys(value, path, ["kind", "low", "high"], ctx);
    return { kind, low: requireRef(value.low, `${path}.low`, ctx), high: requireRef(value.high, `${path}.high`, ctx) };
  }
  if (kind === "selectiveBattle") {
    allowKeys(value, path, ["kind", "battleLow", "battleHigh", "sound", "message", "treasure", "improved", "cowardMacro"], ctx);
    return {
      kind,
      battleLow: requireRef(value.battleLow, `${path}.battleLow`, ctx),
      ...optionalRefField(value, "battleHigh", path, ctx),
      ...optionalRefField(value, "sound", path, ctx),
      ...optionalRefField(value, "message", path, ctx),
      ...optionalRefField(value, "treasure", path, ctx),
      ...optionalRefField(value, "cowardMacro", path, ctx),
      ...(optionalBoolean(value.improved, `${path}.improved`, ctx) !== undefined ? { improved: optionalBoolean(value.improved, `${path}.improved`, ctx) } : {})
    };
  }
  if (kind === "battleOutcome") {
    allowKeys(value, path, ["kind", "battleLow", "battleHigh", "cowardMacro", "sound", "message"], ctx);
    return {
      kind,
      battleLow: requireRef(value.battleLow, `${path}.battleLow`, ctx),
      ...optionalRefField(value, "battleHigh", path, ctx),
      ...optionalRefField(value, "cowardMacro", path, ctx),
      ...optionalRefField(value, "sound", path, ctx),
      ...optionalRefField(value, "message", path, ctx)
    };
  }
  if (kind === "improvedBattleOutcome") {
    allowKeys(value, path, ["kind", "battleLow", "battleHigh", "sound", "message", "cowardMacro"], ctx);
    return {
      kind,
      battleLow: requireRef(value.battleLow, `${path}.battleLow`, ctx),
      ...optionalRefField(value, "battleHigh", path, ctx),
      ...optionalRefField(value, "sound", path, ctx),
      ...optionalRefField(value, "message", path, ctx),
      ...optionalRefField(value, "cowardMacro", path, ctx)
    };
  }
  if (kind === "causeRout") {
    allowKeys(value, path, ["kind", "monsters"], ctx);
    const monsters = parseRefArray(value.monsters, `${path}.monsters`, ctx) ?? [];
    if (monsters.length < 1) ctx.errors.push(`${path}.monsters must contain at least one monster reference.`);
    if (monsters.length > 5) ctx.errors.push(`${path}.monsters can contain at most five monster references.`);
    return { kind, monsters };
  }
  if (kind === "battleMacroCriteria") {
    allowKeys(value, path, ["kind", "mode", "roundOrPercent", "repeatMode", "macroLow", "macroHigh"], ctx);
    const mode = requireInteger(value.mode, `${path}.mode`, ctx);
    const roundOrPercent = requireInteger(value.roundOrPercent, `${path}.roundOrPercent`, ctx);
    const repeatMode = requireInteger(value.repeatMode, `${path}.repeatMode`, ctx);
    const macroHigh = optionalRef(value.macroHigh, `${path}.macroHigh`, ctx);
    checkIntegerRange(mode, `${path}.mode`, 0, 2, ctx);
    checkIntegerRange(roundOrPercent, `${path}.roundOrPercent`, 0, 32767, ctx);
    checkIntegerRange(repeatMode, `${path}.repeatMode`, 0, 2, ctx);
    if (repeatMode === 2 && macroHigh === undefined) ctx.errors.push(`${path}.macroHigh is required when repeatMode is 2 (random macro).`);
    return { kind, mode: (mode === 1 ? 1 : mode === 2 ? 2 : 0), roundOrPercent: roundOrPercent ?? 0, repeatMode: (repeatMode === 1 ? 1 : repeatMode === 2 ? 2 : 0), macroLow: requireRef(value.macroLow, `${path}.macroLow`, ctx), ...(macroHigh !== undefined ? { macroHigh } : {}) };
  }
  if (kind === "spawnMonsters") {
    allowKeys(value, path, ["kind", "monster", "countOrRandomLimit", "sound", "traitorOverride"], ctx);
    const countOrRandomLimit = requireInteger(value.countOrRandomLimit, `${path}.countOrRandomLimit`, ctx);
    const traitorOverride = optionalInteger(value.traitorOverride, `${path}.traitorOverride`, ctx);
    checkIntegerRange(countOrRandomLimit, `${path}.countOrRandomLimit`, -32768, 32767, ctx);
    checkIntegerRange(traitorOverride, `${path}.traitorOverride`, 0, 127, ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx), countOrRandomLimit: countOrRandomLimit ?? 0, ...optionalRefField(value, "sound", path, ctx), ...(traitorOverride !== undefined ? { traitorOverride } : {}) };
  }
  if (kind === "destroyRelatedMonsters") {
    allowKeys(value, path, ["kind", "monster", "maxCount", "includeTraitorSide"], ctx);
    const maxCount = optionalInteger(value.maxCount, `${path}.maxCount`, ctx);
    const includeTraitorSide = optionalBoolean(value.includeTraitorSide, `${path}.includeTraitorSide`, ctx);
    checkIntegerRange(maxCount, `${path}.maxCount`, 0, 32767, ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx), ...(maxCount !== undefined ? { maxCount } : {}), ...(includeTraitorSide !== undefined ? { includeTraitorSide } : {}) };
  }
  if (kind === "continueIfMonsterPresent") {
    allowKeys(value, path, ["kind", "monster"], ctx);
    return { kind, monster: requireRef(value.monster, `${path}.monster`, ctx) };
  }
  if (kind === "alterTimedEncounter") {
    allowKeys(value, path, ["kind", "timedEncounter", "percent", "increment", "resetFromCurrentDay", "daysUntilNext"], ctx);
    const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
    const increment = optionalInteger(value.increment, `${path}.increment`, ctx);
    const resetFromCurrentDay = optionalBoolean(value.resetFromCurrentDay, `${path}.resetFromCurrentDay`, ctx);
    const daysUntilNext = optionalInteger(value.daysUntilNext, `${path}.daysUntilNext`, ctx);
    checkIntegerRange(percent, `${path}.percent`, 0, 100, ctx);
    checkIntegerRange(increment, `${path}.increment`, 0, 32767, ctx);
    checkIntegerRange(daysUntilNext, `${path}.daysUntilNext`, 0, 32767, ctx);
    if (resetFromCurrentDay && daysUntilNext === undefined) ctx.errors.push(`${path}.daysUntilNext is required when resetFromCurrentDay is true.`);
    if (!resetFromCurrentDay && daysUntilNext !== undefined) ctx.errors.push(`${path}.daysUntilNext is only valid when resetFromCurrentDay is true.`);
    return { kind, timedEncounter: requireRef(value.timedEncounter, `${path}.timedEncounter`, ctx), ...(percent !== undefined ? { percent } : {}), ...(increment !== undefined ? { increment } : {}), ...(resetFromCurrentDay !== undefined ? { resetFromCurrentDay } : {}), ...(daysUntilNext !== undefined ? { daysUntilNext } : {}) };
  }
  if (kind === "branchOnQuest") {
    allowKeys(value, path, ["kind", "quest", "test", "branchMode", "target", "code"], ctx);
    return { kind, quest: requireRef(value.quest, `${path}.quest`, ctx), ...optionalNumberField(value, "test", path, ctx), ...optionalNumberField(value, "branchMode", path, ctx), ...optionalRefField(value, "target", path, ctx), ...optionalNumberField(value, "code", path, ctx) };
  }
  if (kind === "setQuestFlag") {
    allowKeys(value, path, ["kind", "quest", "questId"], ctx);
    return { kind, quest: requireRef(value.quest ?? value.questId, `${path}.quest`, ctx) };
  }
  if (kind === "questValue") {
    allowKeys(value, path, ["kind", "quest", "amount", "branchType", "threshold", "target"], ctx);
    return { kind, quest: requireRef(value.quest, `${path}.quest`, ctx), amount: requireInteger(value.amount, `${path}.amount`, ctx) ?? 0, ...optionalNumberField(value, "branchType", path, ctx), ...optionalNumberField(value, "threshold", path, ctx), ...optionalRefField(value, "target", path, ctx) };
  }
  if (kind === "branchOnQuestValue") {
    allowKeys(value, path, ["kind", "quest", "testValue", "branchType", "lessThanTarget", "equalOrGreaterTarget"], ctx);
    return { kind, quest: requireRef(value.quest, `${path}.quest`, ctx), ...optionalNumberField(value, "testValue", path, ctx), ...optionalNumberField(value, "branchType", path, ctx), ...optionalRefField(value, "lessThanTarget", path, ctx), ...optionalRefField(value, "equalOrGreaterTarget", path, ctx) };
  }
  if (kind === "branchOnRandom") {
    allowKeys(value, path, ["kind", "mode", "low", "high", "sound", "message"], ctx);
    return { kind, ...optionalNumberField(value, "mode", path, ctx), low: requireInteger(value.low, `${path}.low`, ctx) ?? 0, high: requireInteger(value.high, `${path}.high`, ctx) ?? 0, ...optionalRefField(value, "sound", path, ctx), ...optionalRefField(value, "message", path, ctx) };
  }
  if (kind === "branchOnPercent") {
    allowKeys(value, path, ["kind", "percent", "successBehavior", "branchMode", "target", "code"], ctx);
    return { kind, percent: requireInteger(value.percent, `${path}.percent`, ctx) ?? 0, ...optionalNumberField(value, "successBehavior", path, ctx), ...optionalNumberField(value, "branchMode", path, ctx), ...optionalRefField(value, "target", path, ctx), ...optionalNumberField(value, "code", path, ctx) };
  }
  if (kind === "changeTile") {
    allowKeys(value, path, ["kind", "level", "x", "y", "tile", "dungeon"], ctx);
    return { kind, ...optionalNumberField(value, "level", path, ctx), x: requireInteger(value.x, `${path}.x`, ctx) ?? 0, y: requireInteger(value.y, `${path}.y`, ctx) ?? 0, tile: requireInteger(value.tile, `${path}.tile`, ctx) ?? 0, ...(optionalBoolean(value.dungeon, `${path}.dungeon`, ctx) !== undefined ? { dungeon: optionalBoolean(value.dungeon, `${path}.dungeon`, ctx) } : {}) };
  }
  if (kind === "healHurtParty") {
    allowKeys(value, path, ["kind", "multiplier", "low", "high", "sound", "message", "picked"], ctx);
    return { kind, multiplier: requireInteger(value.multiplier, `${path}.multiplier`, ctx) ?? 0, low: requireInteger(value.low, `${path}.low`, ctx) ?? 0, high: requireInteger(value.high, `${path}.high`, ctx) ?? 0, ...optionalRefField(value, "sound", path, ctx), ...optionalRefField(value, "message", path, ctx), ...(optionalBoolean(value.picked, `${path}.picked`, ctx) !== undefined ? { picked: optionalBoolean(value.picked, `${path}.picked`, ctx) } : {}) };
  }
  if (kind === "takeGold") {
    allowKeys(value, path, ["kind", "amount", "failureMarker"], ctx);
    return { kind, amount: requireInteger(value.amount, `${path}.amount`, ctx) ?? 0, ...optionalNumberField(value, "failureMarker", path, ctx) };
  }
  if (kind === "giveCondition") {
    allowKeys(value, path, ["kind", "who", "condition", "duration", "sound"], ctx);
    return { kind, ...optionalNumberField(value, "who", path, ctx), condition: requireInteger(value.condition, `${path}.condition`, ctx) ?? 0, duration: requireInteger(value.duration, `${path}.duration`, ctx) ?? 0, ...optionalRefField(value, "sound", path, ctx) };
  }
  if (kind === "awardRandomItems") {
    allowKeys(value, path, ["kind", "count", "lowItem", "highItem"], ctx);
    return { kind, count: requireInteger(value.count, `${path}.count`, ctx) ?? 0, lowItem: requireRef(value.lowItem, `${path}.lowItem`, ctx), highItem: requireRef(value.highItem, `${path}.highItem`, ctx) };
  }
  if (kind === "branchOnItem") {
    allowKeys(value, path, ["kind", "item", "targetKind", "possessedTarget", "missingBehavior", "missingTarget"], ctx);
    const targetKind = optionalBranchTargetKind(value.targetKind, `${path}.targetKind`, ctx);
    const missingBehavior = optionalItemMissingBehavior(value.missingBehavior, `${path}.missingBehavior`, ctx);
    const missingTarget = optionalRef(value.missingTarget, `${path}.missingTarget`, ctx);
    if ((missingBehavior === "branch" || missingBehavior === "message") && missingTarget === undefined) {
      ctx.errors.push(`${path}.missingTarget is required when missingBehavior is ${missingBehavior}.`);
    }
    if ((missingBehavior === undefined || missingBehavior === "continue") && missingTarget !== undefined) {
      ctx.errors.push(`${path}.missingTarget is only valid when missingBehavior is branch or message.`);
    }
    return {
      kind,
      item: requireRef(value.item, `${path}.item`, ctx),
      ...(targetKind !== undefined ? { targetKind } : {}),
      possessedTarget: requireRef(value.possessedTarget, `${path}.possessedTarget`, ctx),
      ...(missingBehavior !== undefined ? { missingBehavior } : {}),
      ...(missingTarget !== undefined ? { missingTarget } : {})
    };
  }
  if (kind === "branchOnItemCharges") {
    allowKeys(value, path, ["kind", "item", "minimumCharges", "targetKind", "enoughTarget", "insufficientTarget"], ctx);
    const minimumCharges = requireInteger(value.minimumCharges, `${path}.minimumCharges`, ctx);
    const targetKind = optionalBranchTargetKind(value.targetKind, `${path}.targetKind`, ctx);
    const enoughTarget = optionalRef(value.enoughTarget, `${path}.enoughTarget`, ctx);
    const insufficientTarget = optionalRef(value.insufficientTarget, `${path}.insufficientTarget`, ctx);
    checkIntegerRange(minimumCharges, `${path}.minimumCharges`, 0, 32767, ctx);
    if (enoughTarget === undefined && insufficientTarget === undefined) ctx.errors.push(`${path} must provide enoughTarget, insufficientTarget, or both.`);
    return {
      kind,
      item: requireRef(value.item, `${path}.item`, ctx),
      minimumCharges: minimumCharges ?? 0,
      ...(targetKind !== undefined ? { targetKind } : {}),
      ...(enoughTarget !== undefined ? { enoughTarget } : {}),
      ...(insufficientTarget !== undefined ? { insufficientTarget } : {})
    };
  }
  if (kind === "dropItems") {
    allowKeys(value, path, ["kind", "item", "count"], ctx);
    const count = optionalInteger(value.count, `${path}.count`, ctx);
    checkIntegerRange(count, `${path}.count`, 1, 32767, ctx);
    return { kind, item: requireRef(value.item, `${path}.item`, ctx), ...(count !== undefined ? { count } : {}) };
  }
  if (kind === "changeItemCharges") {
    allowKeys(value, path, ["kind", "item", "amount", "count"], ctx);
    const amount = requireInteger(value.amount, `${path}.amount`, ctx);
    const count = optionalInteger(value.count, `${path}.count`, ctx);
    checkIntegerRange(amount, `${path}.amount`, -32768, 32767, ctx);
    checkIntegerRange(count, `${path}.count`, 1, 32767, ctx);
    return { kind, item: requireRef(value.item, `${path}.item`, ctx), amount: amount ?? 0, ...(count !== undefined ? { count } : {}) };
  }
  if (kind === "replaceItems") {
    allowKeys(value, path, ["kind", "item", "replacementItem", "count"], ctx);
    const count = optionalInteger(value.count, `${path}.count`, ctx);
    checkIntegerRange(count, `${path}.count`, 1, 32767, ctx);
    return { kind, item: requireRef(value.item, `${path}.item`, ctx), replacementItem: requireRef(value.replacementItem, `${path}.replacementItem`, ctx), ...(count !== undefined ? { count } : {}) };
  }
  if (kind === "branchOnPartyCondition") {
    allowKeys(value, path, ["kind", "condition", "when", "targetKind", "target"], ctx);
    const condition = requirePartyCondition(value.condition, `${path}.condition`, ctx);
    const when = optionalPresenceTest(value.when, `${path}.when`, ctx);
    const targetKind = optionalBranchTargetKind(value.targetKind, `${path}.targetKind`, ctx);
    return { kind, condition, ...(when !== undefined ? { when } : {}), ...(targetKind !== undefined ? { targetKind } : {}), target: requireRef(value.target, `${path}.target`, ctx) };
  }
  if (kind === "branchOnCharacterCondition") {
    allowKeys(value, path, ["kind", "condition", "selector", "successTarget", "failureTarget"], ctx);
    const condition = requireInteger(value.condition, `${path}.condition`, ctx);
    const selector = optionalCharacterSelector(value.selector, `${path}.selector`, ctx);
    checkIntegerRange(condition, `${path}.condition`, 0, 39, ctx);
    return {
      kind,
      condition: condition ?? 0,
      ...(selector !== undefined ? { selector } : {}),
      successTarget: requireRef(value.successTarget, `${path}.successTarget`, ctx),
      failureTarget: requireRef(value.failureTarget, `${path}.failureTarget`, ctx)
    };
  }
  if (kind === "branchOnTileParameter") {
    allowKeys(value, path, ["kind", "test", "tile", "targetKind", "falseTarget", "trueTarget"], ctx);
    const test = requireTileParameter(value.test, `${path}.test`, ctx);
    const tile = optionalInteger(value.tile, `${path}.tile`, ctx);
    const targetKind = optionalBranchTargetKind(value.targetKind, `${path}.targetKind`, ctx);
    const falseTarget = optionalRef(value.falseTarget, `${path}.falseTarget`, ctx);
    const trueTarget = optionalRef(value.trueTarget, `${path}.trueTarget`, ctx);
    checkIntegerRange(tile, `${path}.tile`, 0, 200, ctx);
    if (test === "tileId" && tile === undefined) ctx.errors.push(`${path}.tile is required when test is tileId.`);
    if (test !== "tileId" && tile !== undefined) ctx.errors.push(`${path}.tile is only valid when test is tileId.`);
    if (falseTarget === undefined && trueTarget === undefined) ctx.errors.push(`${path} must provide falseTarget, trueTarget, or both.`);
    if (falseTarget === 0) ctx.errors.push(`${path}.falseTarget cannot be 0 because Realmz uses zero as the no-branch sentinel.`);
    if (trueTarget === 0) ctx.errors.push(`${path}.trueTarget cannot be 0 because Realmz uses zero as the no-branch sentinel.`);
    return {
      kind,
      test,
      ...(tile !== undefined ? { tile } : {}),
      ...(targetKind !== undefined ? { targetKind } : {}),
      ...(falseTarget !== undefined ? { falseTarget } : {}),
      ...(trueTarget !== undefined ? { trueTarget } : {})
    };
  }
  if (kind === "copyActionPointSteps") {
    allowKeys(value, path, ["kind", "source"], ctx);
    const source = requireRef(value.source, `${path}.source`, ctx);
    if (typeof source === "number") checkIntegerRange(source, `${path}.source`, 0, 99, ctx);
    return { kind, source };
  }
  if (kind === "enableActionPoint") {
    allowKeys(value, path, ["kind", "target", "level", "percent"], ctx);
    const target = requireRef(value.target, `${path}.target`, ctx);
    const level = optionalInteger(value.level, `${path}.level`, ctx);
    const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, null, ctx);
    checkIntegerRange(percent, `${path}.percent`, 1, 100, ctx);
    validateActionPointTargetFields(target, level, undefined, path, ctx);
    if (target === 0) ctx.errors.push(`${path}.target cannot be Action Point 0 because opcode 13 treats zero as no single target.`);
    return { kind, target, ...(level !== undefined ? { level } : {}), ...(percent !== undefined ? { percent } : {}) };
  }
  if (kind === "disableActionPoint") {
    allowKeys(value, path, ["kind", "target", "level"], ctx);
    const target = requireRef(value.target, `${path}.target`, ctx);
    const level = optionalInteger(value.level, `${path}.level`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, null, ctx);
    validateActionPointTargetFields(target, level, undefined, path, ctx);
    if (target === 0) ctx.errors.push(`${path}.target cannot be Action Point 0 because opcode 13 treats zero as no single target.`);
    return { kind, target, ...(level !== undefined ? { level } : {}) };
  }
  if (kind === "patchActionPoint") {
    allowKeys(value, path, ["kind", "target", "source", "level", "levelType"], ctx);
    const target = requireRef(value.target, `${path}.target`, ctx);
    const source = requireRef(value.source, `${path}.source`, ctx);
    const level = optionalInteger(value.level, `${path}.level`, ctx);
    const levelType = optionalLevelType(value.levelType, `${path}.levelType`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, null, ctx);
    validateActionPointTargetFields(target, level, levelType, path, ctx, true);
    return { kind, target, source, ...(level !== undefined ? { level } : {}), ...(levelType !== undefined ? { levelType } : {}) };
  }
  if (kind === "setDarkLevel") {
    allowKeys(value, path, ["kind", "dark", "stopIfUnchanged"], ctx);
    return { kind, dark: requireBoolean(value.dark, `${path}.dark`, ctx), ...(optionalBoolean(value.stopIfUnchanged, `${path}.stopIfUnchanged`, ctx) !== undefined ? { stopIfUnchanged: optionalBoolean(value.stopIfUnchanged, `${path}.stopIfUnchanged`, ctx) } : {}) };
  }
  if (kind === "alterGameTime") {
    allowKeys(value, path, ["kind", "mode", "days", "hours", "minutes"], ctx);
    const mode = requireTimeMode(value.mode, `${path}.mode`, ctx);
    const days = optionalInteger(value.days, `${path}.days`, ctx);
    const hours = optionalInteger(value.hours, `${path}.hours`, ctx);
    const minutes = optionalInteger(value.minutes, `${path}.minutes`, ctx);
    if (mode === "set") {
      checkIntegerRange(days, `${path}.days`, -1, 32767, ctx);
      checkIntegerRange(hours, `${path}.hours`, -1, 23, ctx);
      checkIntegerRange(minutes, `${path}.minutes`, -1, 59, ctx);
    } else {
      checkIntegerRange(days, `${path}.days`, -32768, 32767, ctx);
      checkIntegerRange(hours, `${path}.hours`, -32768, 32767, ctx);
      checkIntegerRange(minutes, `${path}.minutes`, -32768, 32767, ctx);
    }
    return { kind, mode, ...(days !== undefined ? { days } : {}), ...(hours !== undefined ? { hours } : {}), ...(minutes !== undefined ? { minutes } : {}) };
  }
  if (kind === "branchOnGameTime") {
    allowKeys(value, path, ["kind", "dayAtMost", "hourAtMost", "successMacro", "failureMacro"], ctx);
    const dayAtMost = optionalInteger(value.dayAtMost, `${path}.dayAtMost`, ctx);
    const hourAtMost = optionalInteger(value.hourAtMost, `${path}.hourAtMost`, ctx);
    checkIntegerRange(dayAtMost, `${path}.dayAtMost`, -1, 32767, ctx);
    checkIntegerRange(hourAtMost, `${path}.hourAtMost`, -1, 23, ctx);
    return { kind, ...(dayAtMost !== undefined ? { dayAtMost } : {}), ...(hourAtMost !== undefined ? { hourAtMost } : {}), successMacro: requireRef(value.successMacro, `${path}.successMacro`, ctx), failureMacro: requireRef(value.failureMacro, `${path}.failureMacro`, ctx) };
  }
  if (kind === "boatCampStatus") {
    allowKeys(value, path, ["kind", "continueBoat", "continueCamping", "setBoat"], ctx);
    const continueBoat = optionalBoatStatus(value.continueBoat, `${path}.continueBoat`, ctx);
    const continueCamping = optionalCampingStatus(value.continueCamping, `${path}.continueCamping`, ctx);
    const setBoat = optionalBoatStatus(value.setBoat, `${path}.setBoat`, ctx);
    if (continueBoat === undefined && continueCamping === undefined && setBoat === undefined) ctx.errors.push(`${path} must provide a boat/camping check or setBoat.`);
    return { kind, ...(continueBoat !== undefined ? { continueBoat } : {}), ...(continueCamping !== undefined ? { continueCamping } : {}), ...(setBoat !== undefined ? { setBoat } : {}) };
  }
  if (kind === "alterFatigue") {
    allowKeys(value, path, ["kind", "mode", "percent"], ctx);
    const mode = requireFatigueMode(value.mode, `${path}.mode`, ctx);
    const percent = optionalInteger(value.percent, `${path}.percent`, ctx);
    checkIntegerRange(percent, `${path}.percent`, 0, 100, ctx);
    if (mode === "percent" && percent === undefined) ctx.errors.push(`${path}.percent is required when mode is percent.`);
    if (mode !== "percent" && percent !== undefined) ctx.errors.push(`${path}.percent is only valid when mode is percent.`);
    return { kind, mode, ...(percent !== undefined ? { percent } : {}) };
  }
  if (kind === "changeSpellPoints") {
    allowKeys(value, path, ["kind", "rolls", "low", "high", "take", "sound", "message"], ctx);
    const rolls = requireInteger(value.rolls, `${path}.rolls`, ctx);
    const low = requireInteger(value.low, `${path}.low`, ctx);
    const high = requireInteger(value.high, `${path}.high`, ctx);
    checkIntegerRange(rolls, `${path}.rolls`, 1, 32767, ctx);
    checkIntegerRange(low, `${path}.low`, 0, 32767, ctx);
    checkIntegerRange(high, `${path}.high`, 0, 32767, ctx);
    if (low !== null && high !== null && low > high) ctx.errors.push(`${path}.low must not exceed ${path}.high.`);
    return { kind, rolls: rolls ?? 1, low: low ?? 0, high: high ?? 0, ...(optionalBoolean(value.take, `${path}.take`, ctx) !== undefined ? { take: optionalBoolean(value.take, `${path}.take`, ctx) } : {}), ...optionalRefField(value, "sound", path, ctx), ...optionalRefField(value, "message", path, ctx) };
  }
  if (kind === "branchOnSpellPoints") {
    allowKeys(value, path, ["kind", "scope", "minimum", "onFailure", "successMacro"], ctx);
    const scope = requireSpellPointScope(value.scope, `${path}.scope`, ctx);
    const minimum = requireInteger(value.minimum, `${path}.minimum`, ctx);
    const onFailure = optionalSpellFailure(value.onFailure, `${path}.onFailure`, ctx);
    checkIntegerRange(minimum, `${path}.minimum`, 0, 32767, ctx);
    return { kind, scope, minimum: minimum ?? 0, ...(onFailure !== undefined ? { onFailure } : {}), successMacro: requireRef(value.successMacro, `${path}.successMacro`, ctx) };
  }
  if (kind === "castSpell") {
    allowKeys(value, path, ["kind", "scope", "spell", "power", "saveModifier", "noSave"], ctx);
    const scope = value.scope === "party" ? "party" : value.scope === "picked" ? "picked" : null;
    if (scope === null) ctx.errors.push(`${path}.scope must be picked or party.`);
    const spell = requireInteger(value.spell, `${path}.spell`, ctx);
    const power = requireInteger(value.power, `${path}.power`, ctx);
    const saveModifier = optionalInteger(value.saveModifier, `${path}.saveModifier`, ctx);
    checkIntegerRange(spell, `${path}.spell`, 0, 32767, ctx);
    checkIntegerRange(power, `${path}.power`, 0, 32767, ctx);
    checkIntegerRange(saveModifier, `${path}.saveModifier`, -32768, 32767, ctx);
    return { kind, scope: scope ?? "party", spell: spell ?? 0, power: power ?? 0, ...(saveModifier !== undefined ? { saveModifier } : {}), ...(optionalBoolean(value.noSave, `${path}.noSave`, ctx) !== undefined ? { noSave: optionalBoolean(value.noSave, `${path}.noSave`, ctx) } : {}) };
  }
  if (kind === "takeVictoryPoints") {
    allowKeys(value, path, ["kind", "amount", "scope"], ctx);
    const amount = requireInteger(value.amount, `${path}.amount`, ctx);
    const scope = value.scope === undefined || value.scope === "each" || value.scope === "picked" || value.scope === "spread" ? value.scope : null;
    if (scope === null) ctx.errors.push(`${path}.scope must be each, picked, or spread.`);
    checkIntegerRange(amount, `${path}.amount`, 0, 32767, ctx);
    return { kind, amount: amount ?? 0, ...(scope !== undefined && scope !== null ? { scope } : {}) };
  }
  if (kind === "alterPicked") {
    allowKeys(value, path, ["kind", "attribute", "amount"], ctx);
    const attribute = requireString(value.attribute, `${path}.attribute`, ctx);
    if (attribute !== null && !Object.prototype.hasOwnProperty.call(ALTER_PICKED_ATTRIBUTE_CODES, attribute)) ctx.errors.push(`${path}.attribute is not a supported picked-character attribute.`);
    const amount = requireInteger(value.amount, `${path}.amount`, ctx);
    checkIntegerRange(amount, `${path}.amount`, -32768, 32767, ctx);
    return { kind, attribute: (attribute && Object.prototype.hasOwnProperty.call(ALTER_PICKED_ATTRIBUTE_CODES, attribute) ? attribute : "stamina") as keyof typeof ALTER_PICKED_ATTRIBUTE_CODES, amount: amount ?? 0 };
  }
  if (["clericTurning", "compass", "randomBattles", "allies"].includes(kind ?? "")) {
    allowKeys(value, path, ["kind", "enabled"], ctx);
    return { kind, enabled: requireBoolean(value.enabled, `${path}.enabled`, ctx) } as ScenarioSeedStep;
  }
  if (["dropAllEquipment", "endBattle", "backUpParty", "levelUpPicked"].includes(kind ?? "")) {
    allowKeys(value, path, ["kind"], ctx);
    return { kind } as ScenarioSeedStep;
  }
  if (kind === "faceDirection") {
    allowKeys(value, path, ["kind", "direction"], ctx);
    const direction = requireString(value.direction, `${path}.direction`, ctx);
    if (direction !== null && !Object.prototype.hasOwnProperty.call(DIRECTION_CODES, direction)) ctx.errors.push(`${path}.direction must be north, east, south, west, or random.`);
    return { kind, direction: (direction && Object.prototype.hasOwnProperty.call(DIRECTION_CODES, direction) ? direction : "north") as keyof typeof DIRECTION_CODES };
  }
  if (kind === "dungeonView") {
    allowKeys(value, path, ["kind", "mode"], ctx);
    const mode = value.mode === "force3d" || value.mode === "allow2d" ? value.mode : null;
    if (mode === null) ctx.errors.push(`${path}.mode must be force3d or allow2d.`);
    return { kind, mode: mode ?? "allow2d" };
  }
  if (kind === "alterRandomEncounterRectangle") {
    allowKeys(value, path, ["kind", "level", "rectangle", "encounterRate", "battleLow", "battleHigh", "dungeon"], ctx);
    const level = requireInteger(value.level, `${path}.level`, ctx);
    const rectangle = requireInteger(value.rectangle, `${path}.rectangle`, ctx);
    const encounterRate = requireInteger(value.encounterRate, `${path}.encounterRate`, ctx);
    const battleLow = optionalRef(value.battleLow, `${path}.battleLow`, ctx);
    const battleHigh = optionalRef(value.battleHigh, `${path}.battleHigh`, ctx);
    const dungeon = optionalBoolean(value.dungeon, `${path}.dungeon`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, 32767, ctx);
    checkIntegerRange(rectangle, `${path}.rectangle`, 0, 19, ctx);
    checkIntegerRange(encounterRate, `${path}.encounterRate`, -1, 10000, ctx);
    if ((battleLow === undefined) !== (battleHigh === undefined)) ctx.errors.push(`${path}.battleLow and ${path}.battleHigh must be provided together.`);
    return { kind, level: level ?? 0, rectangle: rectangle ?? 0, encounterRate: encounterRate ?? 0, ...(battleLow !== undefined ? { battleLow } : {}), ...(battleHigh !== undefined ? { battleHigh } : {}), ...(dungeon !== undefined ? { dungeon } : {}) };
  }
  if (kind === "alterRandomRectangle") {
    allowKeys(value, path, ["kind", "level", "rectangle", "encounterPercentDelta", "dungeon", "shape"], ctx);
    const level = requireInteger(value.level, `${path}.level`, ctx);
    const rectangle = requireInteger(value.rectangle, `${path}.rectangle`, ctx);
    const encounterPercentDelta = optionalInteger(value.encounterPercentDelta, `${path}.encounterPercentDelta`, ctx);
    const dungeon = optionalBoolean(value.dungeon, `${path}.dungeon`, ctx);
    const shape = parseRandomRectangleShape(value.shape, `${path}.shape`, ctx);
    checkIntegerRange(level, `${path}.level`, 0, 32767, ctx);
    checkIntegerRange(rectangle, `${path}.rectangle`, 0, 19, ctx);
    checkIntegerRange(encounterPercentDelta, `${path}.encounterPercentDelta`, -10000, 10000, ctx);
    return { kind, level: level ?? 0, rectangle: rectangle ?? 0, ...(encounterPercentDelta !== undefined ? { encounterPercentDelta } : {}), ...(dungeon !== undefined ? { dungeon } : {}), shape };
  }
  if (kind === "enterExitDungeon") {
    allowKeys(value, path, ["kind", "mode", "level", "x", "y", "heading"], ctx);
    return { kind, mode: requireInteger(value.mode, `${path}.mode`, ctx) ?? 0, level: requireInteger(value.level, `${path}.level`, ctx) ?? 0, x: requireInteger(value.x, `${path}.x`, ctx) ?? 0, y: requireInteger(value.y, `${path}.y`, ctx) ?? 0, heading: requireInteger(value.heading, `${path}.heading`, ctx) ?? 0 };
  }
  if (kind === "edcd") {
    allowKeys(value, path, ["kind", "opcode", "values"], ctx);
    const values = parseIntegerArray(value.values, `${path}.values`, ctx) ?? [];
    if (values.length > 5) ctx.errors.push(`${path}.values can contain at most five EDCD values.`);
    return { kind, opcode: requireInteger(value.opcode, `${path}.opcode`, ctx) ?? 0, values };
  }
  if (kind === "raw") {
    allowKeys(value, path, ["kind", "rawCode", "id"], ctx);
    return { kind, rawCode: requireInteger(value.rawCode, `${path}.rawCode`, ctx) ?? 0, id: requireInteger(value.id, `${path}.id`, ctx) ?? 0 };
  }
  ctx.errors.push(`${path}.kind is not a supported scenario seed step.`);
  return null;
}

function optionalNumberField<T extends string>(value: ObjectValue, key: T, path: string, ctx: ParseContext): Partial<Record<T, number>> {
  const parsed = optionalInteger(value[key], `${path}.${key}`, ctx);
  return parsed === undefined ? {} : { [key]: parsed } as Partial<Record<T, number>>;
}

function optionalRefField<T extends string>(value: ObjectValue, key: T, path: string, ctx: ParseContext): Partial<Record<T, ScenarioSeedRef>> {
  const parsed = optionalRef(value[key], `${path}.${key}`, ctx);
  return parsed === undefined ? {} : { [key]: parsed } as Partial<Record<T, ScenarioSeedRef>>;
}

function validateActionPointTargetFields(
  target: ScenarioSeedRef,
  level: number | undefined,
  levelType: LevelType | undefined,
  path: string,
  ctx: ParseContext,
  requireLevelType = false
) {
  if (typeof target === "number") {
    checkIntegerRange(target, `${path}.target`, 0, 99, ctx);
    if (level === undefined) ctx.errors.push(`${path}.level is required when target is a numeric Action Point ID.`);
    if (requireLevelType && levelType === undefined) ctx.errors.push(`${path}.levelType is required when target is a numeric Action Point ID.`);
    return;
  }
  if (level !== undefined || levelType !== undefined) ctx.errors.push(`${path}.level and levelType must be omitted when target is a keyed Action Point.`);
}

function optionalBranchTargetKind(input: unknown, path: string, ctx: ParseContext): ScenarioSeedBranchTargetKind | undefined {
  if (input === undefined) return undefined;
  if (input === "actionPoint" || input === "simpleEncounter" || input === "complexEncounter") return input;
  ctx.errors.push(`${path} must be actionPoint, simpleEncounter, or complexEncounter.`);
  return undefined;
}

function optionalItemMissingBehavior(input: unknown, path: string, ctx: ParseContext): "branch" | "continue" | "message" | undefined {
  if (input === undefined) return undefined;
  if (input === "branch" || input === "continue" || input === "message") return input;
  ctx.errors.push(`${path} must be branch, continue, or message.`);
  return undefined;
}

function requireBoolean(input: unknown, path: string, ctx: ParseContext): boolean {
  if (typeof input === "boolean") return input;
  ctx.errors.push(`${path} must be a boolean.`);
  return false;
}

function requireTimeMode(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTimeMode {
  if (input === "set" || input === "offset") return input;
  ctx.errors.push(`${path} must be set or offset.`);
  return "set";
}

function optionalBoatStatus(input: unknown, path: string, ctx: ParseContext): ScenarioSeedBoatStatus | undefined {
  if (input === undefined) return undefined;
  if (input === "inBoat" || input === "notInBoat") return input;
  ctx.errors.push(`${path} must be inBoat or notInBoat.`);
  return undefined;
}

function optionalCampingStatus(input: unknown, path: string, ctx: ParseContext): "camping" | "notCamping" | undefined {
  if (input === undefined) return undefined;
  if (input === "camping" || input === "notCamping") return input;
  ctx.errors.push(`${path} must be camping or notCamping.`);
  return undefined;
}

function requireFatigueMode(input: unknown, path: string, ctx: ParseContext): "maximum" | "minimum" | "percent" {
  if (input === "maximum" || input === "minimum" || input === "percent") return input;
  ctx.errors.push(`${path} must be maximum, minimum, or percent.`);
  return "maximum";
}

function requireSpellPointScope(input: unknown, path: string, ctx: ParseContext): "picked" | "alive" {
  if (input === "picked" || input === "alive") return input;
  ctx.errors.push(`${path} must be picked or alive.`);
  return "picked";
}

function optionalSpellFailure(input: unknown, path: string, ctx: ParseContext): "continue" | "exitSave" | undefined {
  if (input === undefined) return undefined;
  if (input === "continue" || input === "exitSave") return input;
  ctx.errors.push(`${path} must be continue or exitSave.`);
  return undefined;
}

function parseRandomRectangleShape(input: unknown, path: string, ctx: ParseContext): ScenarioSeedRandomRectangleShape {
  const value = requireObject(input, path, ctx);
  if (!value) return { mode: "unchanged" };
  const mode = requireString(value.mode, `${path}.mode`, ctx);
  if (mode === "unchanged") {
    allowKeys(value, path, ["mode"], ctx);
    return { mode };
  }
  if (mode === "absolute") {
    allowKeys(value, path, ["mode", "left", "right", "top", "bottom"], ctx);
    const left = requireInteger(value.left, `${path}.left`, ctx);
    const right = requireInteger(value.right, `${path}.right`, ctx);
    const top = requireInteger(value.top, `${path}.top`, ctx);
    const bottom = requireInteger(value.bottom, `${path}.bottom`, ctx);
    checkIntegerRange(left, `${path}.left`, 0, 89, ctx);
    checkIntegerRange(right, `${path}.right`, 0, 89, ctx);
    checkIntegerRange(top, `${path}.top`, 0, 89, ctx);
    checkIntegerRange(bottom, `${path}.bottom`, 0, 89, ctx);
    if (left !== null && right !== null && left > right) ctx.errors.push(`${path}.left must not exceed ${path}.right.`);
    if (top !== null && bottom !== null && top > bottom) ctx.errors.push(`${path}.top must not exceed ${path}.bottom.`);
    return { mode, left: left ?? 0, right: right ?? 0, top: top ?? 0, bottom: bottom ?? 0 };
  }
  if (mode === "offset") {
    allowKeys(value, path, ["mode", "x", "y"], ctx);
    const x = requireInteger(value.x, `${path}.x`, ctx);
    const y = requireInteger(value.y, `${path}.y`, ctx);
    checkIntegerRange(x, `${path}.x`, -89, 89, ctx);
    checkIntegerRange(y, `${path}.y`, -89, 89, ctx);
    return { mode, x: x ?? 0, y: y ?? 0 };
  }
  if (mode === "warp") {
    allowKeys(value, path, ["mode", "left", "right", "top", "bottom"], ctx);
    const left = requireInteger(value.left, `${path}.left`, ctx);
    const right = requireInteger(value.right, `${path}.right`, ctx);
    const top = requireInteger(value.top, `${path}.top`, ctx);
    const bottom = requireInteger(value.bottom, `${path}.bottom`, ctx);
    checkIntegerRange(left, `${path}.left`, -89, 89, ctx);
    checkIntegerRange(right, `${path}.right`, -89, 89, ctx);
    checkIntegerRange(top, `${path}.top`, -89, 89, ctx);
    checkIntegerRange(bottom, `${path}.bottom`, -89, 89, ctx);
    return { mode, left: left ?? 0, right: right ?? 0, top: top ?? 0, bottom: bottom ?? 0 };
  }
  ctx.errors.push(`${path}.mode must be unchanged, absolute, offset, or warp.`);
  return { mode: "unchanged" };
}

function requirePartyCondition(input: unknown, path: string, ctx: ParseContext): ScenarioSeedPartyCondition {
  if (Number.isInteger(input)) {
    const condition = input as number;
    checkIntegerRange(condition, path, 0, 8, ctx);
    return condition;
  }
  if (typeof input === "string" && Object.prototype.hasOwnProperty.call(PARTY_CONDITION_CODES, input)) return input as Exclude<ScenarioSeedPartyCondition, number>;
  ctx.errors.push(`${path} must be a party condition name or integer from 0 through 8.`);
  return 0;
}

function optionalPresenceTest(input: unknown, path: string, ctx: ParseContext): "present" | "absent" | undefined {
  if (input === undefined) return undefined;
  if (input === "present" || input === "absent") return input;
  ctx.errors.push(`${path} must be present or absent.`);
  return undefined;
}

function optionalCharacterSelector(input: unknown, path: string, ctx: ParseContext): ScenarioSeedCharacterSelector | undefined {
  if (input === undefined) return undefined;
  if (input === "party" || input === "picked") return input;
  if (Number.isInteger(input)) {
    const selector = input as number;
    checkIntegerRange(selector, path, 1, 6, ctx);
    return selector;
  }
  ctx.errors.push(`${path} must be party, picked, or a character position from 1 through 6.`);
  return undefined;
}

function requireTileParameter(input: unknown, path: string, ctx: ParseContext): ScenarioSeedTileParameter {
  if (typeof input === "string" && Object.prototype.hasOwnProperty.call(TILE_PARAMETER_CODES, input)) return input as ScenarioSeedTileParameter;
  ctx.errors.push(`${path} must be shoreline, boatRequired, path, blocksLos, flyFloatRequired, forest, or tileId.`);
  return "path";
}
