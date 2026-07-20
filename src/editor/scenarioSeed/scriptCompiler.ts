import { actionOptionFor, normalizeStepOpcode } from "../realmzActions";
import { clearActionPointMarker, ensureActionPointMarker } from "../map/actionPointMarkers";
import { mapStorageTileIndex } from "./mapPaintingPrimitives";
import type {
  Action,
  ComplexEncounterRecord,
  EncounterActionRow,
  ExtraCodeRow,
  LevelType,
  MapEntity,
  SimpleEncounterRecord,
  ThiefEncounterRecord,
  TimedEncounterRecord,
  TriggerRecord
} from "../types";
import type {
  ScenarioSeed,
  ScenarioSeedActionPoint,
  ScenarioSeedBoatStatus,
  ScenarioSeedBranchTargetKind,
  ScenarioSeedCharacterSelector,
  ScenarioSeedComplexEncounter,
  ScenarioSeedComplexResultNumber,
  ScenarioSeedExtraActionPoint,
  ScenarioSeedPartyCondition,
  ScenarioSeedRandomRectangleShape,
  ScenarioSeedRef,
  ScenarioSeedSimpleEncounter,
  ScenarioSeedStep,
  ScenarioSeedThiefEncounter,
  ScenarioSeedTileParameter,
  ScenarioSeedTimedEncounter
} from "./contracts";
import {
  ALTER_PICKED_ATTRIBUTE_CODES,
  DIRECTION_CODES,
  PARTY_CONDITION_CODES,
  TILE_PARAMETER_CODES
} from "./actionPointContracts";
import { resolveRef } from "./allocation";
import {
  addScenarioSeedDiagnostic as addDiagnostic,
  type ActionPointTarget,
  type ScenarioSeedCompilerContext
} from "./compilerContext";
import { ROGUE_ACTION_SLOTS } from "./encounterContracts";
import { authoredProvenance, padArray, padStringArray } from "./recordEncoding";
import {
  resolveItemRef,
  resolveMapTarget,
  resolveMonsterRef,
  resolveRegionTarget,
  resolveSeedAssetRef
} from "./referenceResolver";
import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";

const SIMPLE_ENCOUNTER_BYTES = REALMZ_NATIVE_LAYOUT.simpleEncounterRecordBytes;
const COMPLEX_ENCOUNTER_BYTES = REALMZ_NATIVE_LAYOUT.complexEncounterRecordBytes;
const THIEF_ENCOUNTER_BYTES = REALMZ_NATIVE_LAYOUT.thiefEncounterRecordBytes;
const TIMED_ENCOUNTER_BYTES = REALMZ_NATIVE_LAYOUT.timedEncounterRecordBytes;
const EXTRACODE_BYTES = REALMZ_NATIVE_LAYOUT.extraCodeRecordBytes;
const DOOR_BYTES = REALMZ_NATIVE_LAYOUT.actionPointRecordBytes;
const MAGIC_RESPONSE_BLANK_SPELL_ID = 1100;

type ActionBuildScope =
  | { kind: "map"; levelType: LevelType; levelIndex: number; recordIndex: number }
  | { kind: "extra"; recordIndex: number }
  | { kind: "encounter"; encounterType: "simple" | "complex"; recordIndex: number; result: ScenarioSeedComplexResultNumber };

type BuildContext = ScenarioSeedCompilerContext;

export type ScenarioSeedScriptCompilation = {
  simpleEncounters: SimpleEncounterRecord[];
  thiefEncounters: ThiefEncounterRecord[];
  complexEncounters: ComplexEncounterRecord[];
  timedEncounters: TimedEncounterRecord[];
  triggers: TriggerRecord[];
  extracodes: ExtraCodeRow[];
};

export function compileScenarioSeedScripts(
  seed: ScenarioSeed,
  context: ScenarioSeedCompilerContext,
  initialExtracodes: ExtraCodeRow[] = []
): ScenarioSeedScriptCompilation {
  const simpleBuild = buildSimpleEncounters(seed.simpleEncounters ?? [], context, initialExtracodes);
  const thiefEncounters = (seed.thiefEncounters ?? []).map((encounter) => buildThiefEncounter(encounter, context));
  const complexBuild = buildComplexEncounters(seed.complexEncounters ?? [], context, simpleBuild.extracodes);
  const timedEncounters = (seed.timedEncounters ?? []).map((encounter) => buildTimedEncounter(encounter, context));
  const triggerBuild = buildTriggers(seed.actionPoints ?? [], seed.extraActionPoints ?? [], context, complexBuild.extracodes);
  return {
    simpleEncounters: simpleBuild.records,
    thiefEncounters,
    complexEncounters: complexBuild.records,
    timedEncounters,
    triggers: triggerBuild.triggers,
    extracodes: triggerBuild.extracodes
  };
}

function branchTargetKindCode(kind: ScenarioSeedBranchTargetKind) {
  return kind === "simpleEncounter" ? 1 : kind === "complexEncounter" ? 2 : 0;
}

function resolveBranchTarget(ref: ScenarioSeedRef, kind: ScenarioSeedBranchTargetKind, context: BuildContext) {
  if (kind === "simpleEncounter") return resolveRef(ref, context.simpleEncounters, "simple encounter", context);
  if (kind === "complexEncounter") return resolveRef(ref, context.complexEncounters, "complex encounter", context);
  return resolveRef(ref, context.actionPoints, "action point", context);
}

function resolveNonzeroBranchTarget(ref: ScenarioSeedRef, kind: ScenarioSeedBranchTargetKind, field: string, context: BuildContext) {
  const resolved = resolveBranchTarget(ref, kind, context);
  if (resolved === 0) {
    addDiagnostic(context, "error", "zero-sentinel-target", `Tile parameter ${field} resolves to ID 0, which Realmz reserves as no branch.`, "action point");
  }
  return resolved;
}

function resolveSameMapActionPoint(ref: ScenarioSeedRef, scope: ActionBuildScope, context: BuildContext) {
  if (scope.kind !== "map") {
    addDiagnostic(context, "error", "invalid-action-point-context", "copyActionPointSteps can only be authored inside a map Action Point.", "action point");
    return typeof ref === "number" ? ref : 0;
  }
  if (typeof ref === "number") return ref;
  const target = context.actionPointTargets.get(ref);
  if (!target) {
    addDiagnostic(context, "error", "unresolved-reference", `Unknown action point reference "${ref}".`, "action point", ref);
    return 0;
  }
  if (target.levelType !== scope.levelType || target.levelIndex !== scope.levelIndex) {
    addDiagnostic(context, "error", "different-map-action-point", `copyActionPointSteps source "${ref}" is not on the current ${scope.levelType} level ${scope.levelIndex}.`, "action point", ref);
  }
  return target.recordIndex;
}

function resolveActionPointStateTarget(ref: ScenarioSeedRef, level: number | undefined, scope: ActionBuildScope, context: BuildContext): ActionPointTarget {
  const fallbackType = scope.kind === "map" ? scope.levelType : "land";
  const target = typeof ref === "number"
    ? { levelType: fallbackType, levelIndex: level ?? 0, recordIndex: ref }
    : resolveKeyedActionPointTarget(ref, context);
  if (scope.kind !== "map") {
    addDiagnostic(context, "error", "invalid-action-point-context", "enableActionPoint and disableActionPoint require a map Action Point context so Realmz knows whether to load land or dungeon data.", "action point");
  } else if (target.levelType !== scope.levelType) {
    addDiagnostic(context, "error", "different-level-type", `Action Point state target uses ${target.levelType}, but opcode 13 inherits ${scope.levelType} from the executing script.`, "action point", typeof ref === "string" ? ref : undefined);
  }
  if (target.recordIndex === 0) {
    addDiagnostic(context, "error", "zero-sentinel-target", "Opcode 13 cannot mutate Action Point 0 through its single-target field because Realmz treats zero as no target.", "action point", typeof ref === "string" ? ref : undefined);
  }
  return target;
}

function resolvePatchActionPointTarget(ref: ScenarioSeedRef, level: number | undefined, levelType: LevelType | undefined, context: BuildContext): ActionPointTarget {
  if (typeof ref === "number") return { levelType: levelType ?? "land", levelIndex: level ?? 0, recordIndex: ref };
  return resolveKeyedActionPointTarget(ref, context);
}

function resolveKeyedActionPointTarget(key: string, context: BuildContext): ActionPointTarget {
  const target = context.actionPointTargets.get(key);
  if (target) return target;
  addDiagnostic(context, "error", "unresolved-reference", `Unknown action point reference "${key}".`, "action point", key);
  return { levelType: "land", levelIndex: 0, recordIndex: 0 };
}

function partyConditionCode(condition: ScenarioSeedPartyCondition) {
  return typeof condition === "number" ? condition : PARTY_CONDITION_CODES[condition];
}

function characterSelectorCode(selector: ScenarioSeedCharacterSelector) {
  return selector === "party" ? 0 : selector === "picked" ? -1 : selector;
}

function tileParameterCode(parameter: ScenarioSeedTileParameter) {
  return TILE_PARAMETER_CODES[parameter];
}

function randomRectangleShapeCode(shape: ScenarioSeedRandomRectangleShape) {
  return shape.mode === "unchanged" ? -1 : shape.mode === "absolute" ? 0 : shape.mode === "offset" ? 1 : 2;
}

function randomRectangleShapeValues(shape: ScenarioSeedRandomRectangleShape) {
  if (shape.mode === "unchanged") return [0, 0, 0, 0, 0];
  if (shape.mode === "absolute") return [shape.left, shape.right, shape.top, shape.bottom, 0];
  if (shape.mode === "offset") return [shape.x, shape.y, 0, 0, 0];
  return [shape.left, shape.right, shape.top, shape.bottom, 0];
}

export function syncActionPointMarkers(maps: MapEntity[], triggers: TriggerRecord[]) {
  const coordinates = new Map<string, Set<number>>();
  for (const trigger of triggers) {
    if (!trigger.active || !trigger.coordinate || trigger.levelType === null || trigger.levelIndex === null) continue;
    const key = `${trigger.levelType}:${trigger.levelIndex}`;
    const set = coordinates.get(key) ?? new Set<number>();
    set.add(mapStorageTileIndex(trigger.levelType, trigger.coordinate.x, trigger.coordinate.y));
    coordinates.set(key, set);
  }
  return maps.map((map) => {
    const marked = coordinates.get(`${map.levelType}:${map.index}`) ?? new Set<number>();
    const tiles = map.tiles.map((value, index) => {
      const cleared = clearActionPointMarker(value, map.levelType);
      return marked.has(index) ? ensureActionPointMarker(cleared, map.levelType) : cleared;
    });
    return { ...map, tiles };
  });
}

function buildSimpleEncounters(seeds: ScenarioSeedSimpleEncounter[], context: BuildContext, initialExtracodes: ExtraCodeRow[] = []): { records: SimpleEncounterRecord[]; extracodes: ExtraCodeRow[] } {
  let nextEdcdId = initialExtracodes.reduce((highest, row) => Math.max(highest, row.id + 1), 0);
  const extracodes: ExtraCodeRow[] = [...initialExtracodes];
  const allocateEdcdId = () => nextEdcdId++;
  const records = seeds.map((seed) => buildSimpleEncounter(seed, context, allocateEdcdId, extracodes));
  return { records, extracodes };
}

function buildSimpleEncounter(
  seed: ScenarioSeedSimpleEncounter,
  context: BuildContext,
  nextEdcdId: () => number,
  extracodes: ExtraCodeRow[]
): SimpleEncounterRecord {
  const id = seed.id ?? 0;
  const semanticActions = (seed.options ?? []).flatMap((option, optionIndex) => {
    const result = (optionIndex + 1) as ScenarioSeedComplexResultNumber;
    const scope: ActionBuildScope = { kind: "encounter", encounterType: "simple", recordIndex: id, result };
    return option.steps.map((step, stepIndex): EncounterActionRow => {
      const action = buildAction(step, optionIndex * 8 + stepIndex, context, nextEdcdId, extracodes, scope);
      return { slot: action.slot, rawCode: action.rawCode, id: action.id };
    });
  });
  const actions = (seed.actions ?? []).length > 0
    ? (seed.actions ?? []).map((action, index): EncounterActionRow => ({
        slot: action.slot ?? index,
        rawCode: action.rawCode,
        id: action.id
      }))
    : semanticActions;
  return {
    id,
    actions,
    choiceResults: seed.options
      ? padArray(seed.options.map((_, index) => index + 1), 4, 0)
      : padArray(seed.choiceResults ?? [], 4, 0),
    canBackOut: seed.canBackOut ?? false,
    maxTimes: seed.maxTimes ?? 0,
    casteSuccess: seed.casteSuccess ?? 0,
    prompt: seed.prompt === undefined ? 0 : resolveRef(seed.prompt, context.messages, "message", context),
    texts: padStringArray(seed.options?.map((option) => option.label) ?? seed.texts ?? [], 4, ""),
    authored: true,
    provenance: authoredProvenance("Data ED", id, id * SIMPLE_ENCOUNTER_BYTES, SIMPLE_ENCOUNTER_BYTES)
  };
}

function buildThiefEncounter(seed: ScenarioSeedThiefEncounter, context: BuildContext): ThiefEncounterRecord {
  const id = seed.id ?? 1;
  const typeFlags = new Array<boolean>(10).fill(false);
  const modifiers = new Array<number>(8).fill(0);
  const successCodes = new Array<number>(8).fill(0);
  const failureCodes = new Array<number>(8).fill(0);
  const successText = new Array<number>(8).fill(0);
  const failureText = new Array<number>(8).fill(0);
  const successSounds = new Array<number>(8).fill(0);
  const failureSounds = new Array<number>(8).fill(0);

  for (const action of seed.actions ?? []) {
    const slot = ROGUE_ACTION_SLOTS[action.kind];
    typeFlags[slot] = true;
    modifiers[slot] = action.modifier ?? 0;
    successCodes[slot] = action.success.result ?? 0;
    failureCodes[slot] = action.failure.result ?? 0;
    successText[slot] = action.success.message === undefined ? 0 : resolveRef(action.success.message, context.messages, "message", context);
    failureText[slot] = action.failure.message === undefined ? 0 : resolveRef(action.failure.message, context.messages, "message", context);
    successSounds[slot] = action.success.sound === undefined ? 0 : resolveSeedAssetRef(action.success.sound, "sound", "sound", context);
    failureSounds[slot] = action.failure.sound === undefined ? 0 : resolveSeedAssetRef(action.failure.sound, "sound", "sound", context);
  }

  typeFlags[8] = seed.trap?.rogueOnly ?? false;
  typeFlags[9] = seed.trap?.armed ?? false;
  return {
    id,
    typeFlags,
    modifiers,
    successCodes,
    failureCodes,
    successText,
    failureText,
    successSounds,
    failureSounds,
    spell: seed.trap?.spell ?? 0,
    lowDamage: seed.trap?.damage?.low ?? 0,
    highDamage: seed.trap?.damage?.high ?? 0,
    tumblers: seed.lock?.tumblers ?? 0,
    prompts: [
      seed.prompt === undefined ? 0 : resolveRef(seed.prompt, context.messages, "message", context),
      seed.trap?.sound === undefined ? 0 : resolveSeedAssetRef(seed.trap.sound, "sound", "sound", context),
      seed.trap?.spellPower ?? 0
    ],
    promptSounds: [0, seed.lock?.openChancePerLevel ?? 0, seed.trap?.disarmChancePerLevel ?? 0],
    authored: true,
    provenance: authoredProvenance("Data TD2", id, id * THIEF_ENCOUNTER_BYTES, THIEF_ENCOUNTER_BYTES)
  };
}

function buildComplexEncounters(seeds: ScenarioSeedComplexEncounter[], context: BuildContext, initialExtracodes: ExtraCodeRow[] = []): { records: ComplexEncounterRecord[]; extracodes: ExtraCodeRow[] } {
  let nextEdcdId = initialExtracodes.reduce((highest, row) => Math.max(highest, row.id + 1), 0);
  const extracodes: ExtraCodeRow[] = [...initialExtracodes];
  const allocateEdcdId = () => nextEdcdId++;
  const records = seeds.map((seed) => buildComplexEncounter(seed, context, allocateEdcdId, extracodes));
  return { records, extracodes };
}

function buildComplexEncounter(
  seed: ScenarioSeedComplexEncounter,
  context: BuildContext,
  nextEdcdId: () => number,
  extracodes: ExtraCodeRow[]
): ComplexEncounterRecord {
  const id = seed.id ?? 0;
  const physicalActions = padStringArray(seed.physicalActions ?? [], 8, "");
  const requiredPhysicalActions = new Set(seed.requiredPhysicalActions ?? []);
  const semanticActions = (seed.results ?? []).flatMap((result) => {
    const scope: ActionBuildScope = { kind: "encounter", encounterType: "complex", recordIndex: id, result: result.result };
    return result.steps.map((step, index): EncounterActionRow => {
      const action = buildAction(step, (result.result - 1) * 8 + index, context, nextEdcdId, extracodes, scope);
      return { slot: action.slot, rawCode: action.rawCode, id: action.id };
    });
  });
  const actions = (seed.actions ?? []).length > 0
    ? (seed.actions ?? []).map((action, index): EncounterActionRow => ({ slot: action.slot ?? index, rawCode: action.rawCode, id: action.id }))
    : semanticActions;
  const spellIds = padArray((seed.spells ?? []).map((response) => response.spell), 10, MAGIC_RESPONSE_BLANK_SPELL_ID);
  const spellResults = padArray((seed.spells ?? []).map((response) => response.result), 10, 0);
  const itemIds = padArray((seed.items ?? []).map((response) => resolveItemRef(response.item, context)), 5, 0);
  const itemResults = padArray((seed.items ?? []).map((response) => response.result), 5, 0);
  return {
    id,
    actions,
    actionResult: seed.physicalResult ?? 0,
    wordResult: seed.word?.result ?? 0,
    groups: Array.from({ length: 8 }, (_, index) => requiredPhysicalActions.has(index + 1) ? 1 : 0),
    spellIds,
    spellResults,
    itemIds,
    itemResults,
    canBackOut: seed.canBackOut ?? false,
    thief: Boolean(seed.thief),
    maxTimes: seed.maxTimes ?? 0,
    casteSuccess: seed.casteSuccess ?? 0,
    thiefSuccess: seed.thief === undefined ? 0 : resolveRef(seed.thief.encounter, context.thiefEncounters, "Rogue encounter", context),
    thiefFail: 0,
    prompt: seed.prompt === undefined ? 0 : resolveRef(seed.prompt, context.messages, "message", context),
    texts: [...physicalActions, seed.word?.text ?? ""],
    authored: true,
    provenance: authoredProvenance("Data ED2", id, id * COMPLEX_ENCOUNTER_BYTES, COMPLEX_ENCOUNTER_BYTES)
  };
}

function buildTimedEncounter(seed: ScenarioSeedTimedEncounter, context: BuildContext): TimedEncounterRecord {
  const id = seed.id ?? 0;
  const location = seed.location ?? { kind: "any" as const };
  return {
    id,
    day: seed.day,
    increment: seed.increment ?? 0,
    percent: seed.percent ?? 100,
    door: resolveRef(seed.macro, context.extraActionPoints, "extra action point", context),
    requiredLevel: location.kind === "any" ? -1 : location.level,
    requiredRandomRect: location.kind === "any" ? -1 : location.randomRectangle ?? -1,
    requiredX: location.kind === "any" ? -1 : location.x ?? -1,
    requiredY: location.kind === "any" ? -1 : location.y ?? -1,
    requiredItem: seed.requiredItem === undefined ? -1 : resolveItemRef(seed.requiredItem, context),
    requiredQuest: seed.requiredQuest === undefined ? -1 : resolveRef(seed.requiredQuest, context.quests, "quest", context),
    locationKind: location.kind,
    authored: true,
    provenance: authoredProvenance("Data TD3", id, id * TIMED_ENCOUNTER_BYTES, TIMED_ENCOUNTER_BYTES)
  };
}

function buildTriggers(actionPoints: ScenarioSeedActionPoint[], extraActionPoints: ScenarioSeedExtraActionPoint[], context: BuildContext, initialExtracodes: ExtraCodeRow[] = []): { triggers: TriggerRecord[]; extracodes: ExtraCodeRow[] } {
  const extracodes: ExtraCodeRow[] = [...initialExtracodes];
  let nextEdcdId = extracodes.reduce((highest, row) => Math.max(highest, row.id + 1), 0);
  const allocateEdcdId = () => nextEdcdId++;
  const triggers = actionPoints.map((actionPoint, index): TriggerRecord => {
    const mapTarget = actionPoint.map !== undefined ? resolveMapTarget(actionPoint.map, context) : null;
    const regionTarget = actionPoint.at !== undefined ? resolveRegionTarget(actionPoint.at, context) : null;
    const levelType = actionPoint.levelType ?? regionTarget?.levelType ?? mapTarget?.levelType ?? "land";
    const levelIndex = actionPoint.levelIndex ?? regionTarget?.index ?? mapTarget?.index ?? 0;
    const recordIndex = actionPoint.recordIndex ?? index;
    const x = actionPoint.x ?? regionTarget?.x ?? mapTarget?.x ?? 0;
    const y = actionPoint.y ?? regionTarget?.y ?? mapTarget?.y ?? 0;
    const scope: ActionBuildScope = { kind: "map", levelType, levelIndex, recordIndex };
    const actions = actionPoint.steps.map((step, slot) => buildAction(step, slot, context, allocateEdcdId, extracodes, scope));
    return {
      id: actionPoint.id ?? `${levelType}:${levelIndex}:ap:${recordIndex}`,
      source: levelType === "land" ? "Data DD" : "Data DDD",
      levelType,
      levelIndex,
      recordIndex,
      active: true,
      doorid: levelIndex * 10000 + y * 100 + x,
      percent: actionPoint.percent ?? 100,
      coordinate: { x, y },
      actions,
      landid: levelIndex,
      targetX: x,
      targetY: y,
      provenance: authoredProvenance(levelType === "land" ? "Data DD" : "Data DDD", recordIndex, (levelIndex * REALMZ_NATIVE_LAYOUT.actionPointsPerLevel + recordIndex) * DOOR_BYTES, DOOR_BYTES)
    };
  });
  const macros = extraActionPoints.map((extraActionPoint): TriggerRecord => {
    const recordIndex = extraActionPoint.id ?? 0;
    const scope: ActionBuildScope = { kind: "extra", recordIndex };
    return {
      id: `Data ED3:macro:${recordIndex}`,
      source: "Data ED3",
      levelType: null,
      levelIndex: null,
      recordIndex,
      active: true,
      doorid: 0,
      landid: 0,
      targetX: 0,
      targetY: 0,
      percent: 100,
      coordinate: null,
      actions: extraActionPoint.steps.map((step, slot) => buildAction(step, slot, context, allocateEdcdId, extracodes, scope)),
      provenance: authoredProvenance("Data ED3", recordIndex, recordIndex * DOOR_BYTES, DOOR_BYTES)
    };
  });
  return { triggers: [...triggers, ...macros], extracodes };
}

function buildAction(step: ScenarioSeedStep, slot: number, context: BuildContext, nextEdcdId: () => number, extracodes: ExtraCodeRow[], scope: ActionBuildScope): Action {
  if (step.kind === "message") return describeAction(slot, 1, resolveRef(step.message, context.messages, "message", context));
  if (step.kind === "simpleEncounter") return describeAction(slot, 4, resolveRef(step.encounter, context.simpleEncounters, "simple encounter", context));
  if (step.kind === "complexEncounter") return describeAction(slot, 5, resolveRef(step.encounter, context.complexEncounters, "complex encounter", context));
  if (step.kind === "shop") return describeAction(slot, 6, resolveRef(step.shop, context.shops, "shop", context));
  if (step.kind === "treasure") return describeAction(slot, 10, resolveRef(step.treasure, context.treasures, "treasure", context));
  if (step.kind === "sound") return describeAction(slot, 9, resolveSeedAssetRef(step.sound, "sound", "sound", context));
  if (step.kind === "picture") return describeAction(slot, 27, resolveSeedAssetRef(step.picture, "picture", "picture", context));
  if (step.kind === "scrollingText") return describeAction(slot, 62, resolveSeedAssetRef(step.text, "text", "scrolling text", context));
  if (step.kind === "victoryPoints") return describeAction(slot, 11, step.amount);
  if (step.kind === "temple") return describeAction(slot, 32, step.inflation);
  if (step.kind === "banking") return describeAction(slot, 49, step.shop === undefined ? 0 : resolveRef(step.shop, context.shops, "shop", context));
  if (step.kind === "displayMap") return describeAction(slot, 29, step.map);
  if (step.kind === "pickCharacters") return describeAction(slot, step.inverse ? -14 : 14, step.count);
  if (step.kind === "returnGosub") return describeAction(slot, 111, 0);
  if (step.kind === "popStack") return describeAction(slot, 112, 0);
  if (step.kind === "addSpecialCharacter") return describeAction(slot, 89, resolveMonsterRef(step.monster, context));
  if (step.kind === "dropSpecialCharacter") return describeAction(slot, 88, resolveMonsterRef(step.monster, context));
  if (step.kind === "setQuestFlag") return describeAction(slot, 47, resolveRef(step.quest, context.quests, "quest", context));
  if (step.kind === "raw") return describeAction(slot, step.rawCode, step.id);
  if (step.kind === "battle") {
    return buildEdcdAction(slot, 2, [
      resolveRef(step.battle, context.battles, "battle", context),
      step.battleHigh === undefined ? resolveRef(step.battle, context.battles, "battle", context) : resolveRef(step.battleHigh, context.battles, "battle", context),
      step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
      step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context),
      step.reviveParty ? 10 : 0
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "teleport") {
    const regionTarget = step.at === undefined ? null : resolveRegionTarget(step.at, context);
    const mapTarget = step.map === undefined ? null : resolveMapTarget(step.map, context);
    if (regionTarget && mapTarget && (regionTarget.levelType !== mapTarget.levelType || regionTarget.index !== mapTarget.index)) {
      addDiagnostic(context, "error", "teleport-region-map-mismatch", `Teleport region "${String(step.at)}" is not on map "${String(step.map)}".`, "teleport");
    }
    return buildEdcdAction(slot, step.teleportOnly ? 45 : 20, [
      regionTarget?.index ?? mapTarget?.index ?? step.landLevel ?? -1,
      regionTarget?.x ?? step.x ?? -1,
      regionTarget?.y ?? step.y ?? -1,
      step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
      step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "randomMessage") return buildEdcdAction(slot, 19, [resolveRef(step.low, context.messages, "message", context), resolveRef(step.high, context.messages, "message", context), 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "selectiveBattle") {
    const opcode = step.improved ? 107 : 48;
    return buildEdcdAction(slot, opcode, [
      resolveRef(step.battleLow, context.battles, "battle", context),
      step.battleHigh === undefined ? resolveRef(step.battleLow, context.battles, "battle", context) : resolveRef(step.battleHigh, context.battles, "battle", context),
      step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
      step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context),
      step.improved ? (step.cowardMacro === undefined ? 0 : resolveRef(step.cowardMacro, context.extraActionPoints, "extra action point", context)) : (step.treasure === undefined ? 0 : resolveRef(step.treasure, context.treasures, "treasure", context))
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "battleOutcome") return buildEdcdAction(slot, 56, [
    resolveRef(step.battleLow, context.battles, "battle", context),
    step.battleHigh === undefined ? resolveRef(step.battleLow, context.battles, "battle", context) : resolveRef(step.battleHigh, context.battles, "battle", context),
    step.cowardMacro === undefined ? -1 : resolveRef(step.cowardMacro, context.extraActionPoints, "extra action point", context),
    step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
    step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)
  ], nextEdcdId, extracodes);
  if (step.kind === "improvedBattleOutcome") return buildEdcdAction(slot, 107, [
    resolveRef(step.battleLow, context.battles, "battle", context),
    step.battleHigh === undefined ? resolveRef(step.battleLow, context.battles, "battle", context) : resolveRef(step.battleHigh, context.battles, "battle", context),
    step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context),
    step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context),
    step.cowardMacro === undefined ? 0 : resolveRef(step.cowardMacro, context.extraActionPoints, "extra action point", context)
  ], nextEdcdId, extracodes);
  if (step.kind === "causeRout") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "causeRout can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return buildEdcdAction(slot, 123, step.monsters.map((monster) => resolveMonsterRef(monster, context)), nextEdcdId, extracodes);
  }
  if (step.kind === "battleMacroCriteria") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "battleMacroCriteria can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return buildEdcdAction(slot, 126, [
      step.mode,
      step.roundOrPercent,
      step.repeatMode,
      resolveRef(step.macroLow, context.extraActionPoints, "extra action point", context),
      step.macroHigh === undefined ? 0 : resolveRef(step.macroHigh, context.extraActionPoints, "extra action point", context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "spawnMonsters") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "spawnMonsters can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return buildEdcdAction(slot, 124, [0, resolveMonsterRef(step.monster, context), step.countOrRandomLimit, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.traitorOverride ?? 0], nextEdcdId, extracodes);
  }
  if (step.kind === "destroyRelatedMonsters") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "destroyRelatedMonsters can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return buildEdcdAction(slot, 125, [resolveMonsterRef(step.monster, context), step.maxCount ?? 0, 0, 0, step.includeTraitorSide ? 1 : 0], nextEdcdId, extracodes);
  }
  if (step.kind === "continueIfMonsterPresent") {
    if (scope.kind !== "extra") addDiagnostic(context, "error", "invalid-action-point-context", "continueIfMonsterPresent can only be authored inside a battle or monster Extra Action Point macro.", "action point");
    return describeAction(slot, 127, resolveMonsterRef(step.monster, context));
  }
  if (step.kind === "alterTimedEncounter") return buildEdcdAction(slot, 54, [
    resolveRef(step.timedEncounter, context.timedEncounters, "timed encounter", context),
    step.percent ?? -1,
    step.increment ?? -1,
    step.resetFromCurrentDay ? 1 : 0,
    step.resetFromCurrentDay ? step.daysUntilNext ?? 0 : -1
  ], nextEdcdId, extracodes);
  if (step.kind === "branchOnQuest") return buildEdcdAction(slot, 46, [resolveRef(step.quest, context.quests, "quest", context), step.test ?? 0, step.branchMode ?? 0, step.target === undefined ? 0 : resolveRef(step.target, context.actionPoints, "action point", context), step.code ?? 0], nextEdcdId, extracodes);
  if (step.kind === "questValue") return buildEdcdAction(slot, 76, [resolveRef(step.quest, context.quests, "quest", context), step.amount, step.branchType ?? 0, step.threshold ?? 0, step.target === undefined ? 0 : resolveRef(step.target, context.actionPoints, "action point", context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnQuestValue") return buildEdcdAction(slot, 77, [resolveRef(step.quest, context.quests, "quest", context), step.testValue ?? 0, step.branchType ?? 0, step.lessThanTarget === undefined ? 0 : resolveRef(step.lessThanTarget, context.actionPoints, "action point", context), step.equalOrGreaterTarget === undefined ? 0 : resolveRef(step.equalOrGreaterTarget, context.actionPoints, "action point", context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnRandom") return buildEdcdAction(slot, 85, [step.mode ?? 0, step.low, step.high, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnPercent") return buildEdcdAction(slot, 42, [step.percent, step.successBehavior ?? 0, step.branchMode ?? 0, step.target === undefined ? 0 : resolveRef(step.target, context.actionPoints, "action point", context), step.code ?? 0], nextEdcdId, extracodes);
  if (step.kind === "changeTile") return buildEdcdAction(slot, 12, [step.level ?? 0, step.x, step.y, step.tile, step.dungeon ? 1 : 0], nextEdcdId, extracodes);
  if (step.kind === "healHurtParty") return buildEdcdAction(slot, step.picked ? 15 : 16, [step.multiplier, step.low, step.high, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)], nextEdcdId, extracodes);
  if (step.kind === "takeGold") return buildEdcdAction(slot, 33, [step.amount, step.failureMarker ?? 0, 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "giveCondition") return buildEdcdAction(slot, 43, [step.who ?? 0, step.condition, step.duration, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), 0], nextEdcdId, extracodes);
  if (step.kind === "awardRandomItems") return buildEdcdAction(slot, 65, [step.count, resolveItemRef(step.lowItem, context), resolveItemRef(step.highItem, context), 0, 0], nextEdcdId, extracodes);
  if (step.kind === "branchOnItem") {
    const targetKind = step.targetKind ?? "actionPoint";
    const missingBehavior = step.missingBehavior ?? "continue";
    return buildEdcdAction(slot, 21, [
      resolveItemRef(step.item, context),
      branchTargetKindCode(targetKind),
      missingBehavior === "branch" ? 0 : missingBehavior === "message" ? 2 : 1,
      resolveBranchTarget(step.possessedTarget, targetKind, context),
      step.missingTarget === undefined ? 0 : missingBehavior === "message" ? resolveRef(step.missingTarget, context.messages, "message", context) : resolveBranchTarget(step.missingTarget, targetKind, context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "branchOnItemCharges") {
    const targetKind = step.targetKind ?? "actionPoint";
    return buildEdcdAction(slot, 67, [
      resolveItemRef(step.item, context),
      branchTargetKindCode(targetKind),
      step.minimumCharges,
      step.enoughTarget === undefined ? -1 : resolveBranchTarget(step.enoughTarget, targetKind, context),
      step.insufficientTarget === undefined ? -1 : resolveBranchTarget(step.insufficientTarget, targetKind, context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "dropItems") return buildEdcdAction(slot, 22, [resolveItemRef(step.item, context), step.count ?? 1, 1, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "changeItemCharges") return buildEdcdAction(slot, 22, [resolveItemRef(step.item, context), step.count ?? 1, 2, step.amount, 0], nextEdcdId, extracodes);
  if (step.kind === "replaceItems") return buildEdcdAction(slot, 22, [resolveItemRef(step.item, context), step.count ?? 1, 3, 0, resolveItemRef(step.replacementItem, context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnPartyCondition") {
    const targetKind = step.targetKind ?? "actionPoint";
    return buildEdcdAction(slot, 40, [
      step.when === "absent" ? 2 : 1,
      branchTargetKindCode(targetKind) + 1,
      resolveBranchTarget(step.target, targetKind, context),
      partyConditionCode(step.condition),
      0
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "branchOnCharacterCondition") return buildEdcdAction(slot, 81, [
    step.condition,
    characterSelectorCode(step.selector ?? "party"),
    0,
    resolveRef(step.successTarget, context.actionPoints, "action point", context),
    resolveRef(step.failureTarget, context.actionPoints, "action point", context)
  ], nextEdcdId, extracodes);
  if (step.kind === "branchOnTileParameter") {
    const targetKind = step.targetKind ?? "actionPoint";
    return buildEdcdAction(slot, 78, [
      tileParameterCode(step.test),
      step.test === "tileId" ? step.tile ?? 0 : 0,
      branchTargetKindCode(targetKind),
      step.falseTarget === undefined ? 0 : resolveNonzeroBranchTarget(step.falseTarget, targetKind, "falseTarget", context),
      step.trueTarget === undefined ? 0 : resolveNonzeroBranchTarget(step.trueTarget, targetKind, "trueTarget", context)
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "copyActionPointSteps") {
    const source = resolveSameMapActionPoint(step.source, scope, context);
    return describeAction(slot, 8, source);
  }
  if (step.kind === "enableActionPoint" || step.kind === "disableActionPoint") {
    const target = resolveActionPointStateTarget(step.target, step.level, scope, context);
    return buildEdcdAction(slot, 13, [target.levelIndex, target.recordIndex, step.kind === "disableActionPoint" ? -1 : step.percent ?? 100, 0, 0], nextEdcdId, extracodes);
  }
  if (step.kind === "patchActionPoint") {
    const target = resolvePatchActionPointTarget(step.target, step.level, step.levelType, context);
    return buildEdcdAction(slot, 7, [
      target.levelIndex,
      target.recordIndex,
      resolveRef(step.source, context.extraActionPoints, "extra action point", context),
      target.levelType === "dungeon" ? 2 : 1,
      0
    ], nextEdcdId, extracodes);
  }
  if (step.kind === "setDarkLevel") return buildEdcdAction(slot, 106, [step.dark ? 2 : 1, step.stopIfUnchanged ? 1 : 0, 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "alterGameTime") return buildEdcdAction(slot, 63, [step.mode === "set" ? 1 : 2, step.mode === "set" ? step.days ?? -1 : step.days ?? 0, step.mode === "set" ? step.hours ?? -1 : step.hours ?? 0, step.mode === "set" ? step.minutes ?? -1 : step.minutes ?? 0, 0], nextEdcdId, extracodes);
  if (step.kind === "branchOnGameTime") return buildEdcdAction(slot, 64, [step.dayAtMost ?? -1, step.hourAtMost ?? -1, 0, resolveRef(step.successMacro, context.extraActionPoints, "extra action point", context), resolveRef(step.failureMacro, context.extraActionPoints, "extra action point", context)], nextEdcdId, extracodes);
  if (step.kind === "boatCampStatus") return buildEdcdAction(slot, 103, [boatStatusCode(step.continueBoat), campingStatusCode(step.continueCamping), step.setBoat === undefined ? 0 : step.setBoat === "inBoat" ? 1 : 2, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "alterFatigue") return buildEdcdAction(slot, 68, [step.mode === "maximum" ? 1 : step.mode === "minimum" ? 2 : 3, 0, step.percent ?? 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "changeSpellPoints") return buildEdcdAction(slot, 74, [step.take ? -step.rolls : step.rolls, step.sound === undefined ? step.low : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.high, step.sound === undefined ? 0 : resolveSeedAssetRef(step.sound, "sound", "sound", context), step.message === undefined ? 0 : resolveRef(step.message, context.messages, "message", context)], nextEdcdId, extracodes);
  if (step.kind === "branchOnSpellPoints") return buildEdcdAction(slot, 75, [step.scope === "picked" ? 1 : 2, step.minimum, step.onFailure === "exitSave" ? 1 : 0, 0, resolveRef(step.successMacro, context.extraActionPoints, "extra action point", context)], nextEdcdId, extracodes);
  if (step.kind === "castSpell") return buildEdcdAction(slot, step.scope === "picked" ? 17 : 18, [step.spell, step.power, step.saveModifier ?? 0, step.noSave ? 1 : 0, 0], nextEdcdId, extracodes);
  if (step.kind === "takeVictoryPoints") return buildEdcdAction(slot, 90, [step.amount, step.scope === "picked" ? 1 : step.scope === "spread" ? 2 : 0, 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "alterPicked") return buildEdcdAction(slot, 108, [ALTER_PICKED_ATTRIBUTE_CODES[step.attribute], step.amount, 0, 0, 0], nextEdcdId, extracodes);
  if (step.kind === "clericTurning") return describeAction(slot, step.enabled ? 83 : 82, 0);
  if (step.kind === "dropAllEquipment") return describeAction(slot, 91, 0);
  if (step.kind === "compass") return describeAction(slot, step.enabled ? 93 : 94, 0);
  if (step.kind === "faceDirection") return describeAction(slot, 95, DIRECTION_CODES[step.direction]);
  if (step.kind === "dungeonView") return describeAction(slot, step.mode === "force3d" ? 96 : 97, 0);
  if (step.kind === "endBattle") return describeAction(slot, 100, 0);
  if (step.kind === "backUpParty") return describeAction(slot, 101, 0);
  if (step.kind === "levelUpPicked") return describeAction(slot, 102, 0);
  if (step.kind === "randomBattles") return describeAction(slot, 104, step.enabled ? 1 : 0);
  if (step.kind === "allies") return describeAction(slot, 105, step.enabled ? 2 : 1);
  if (step.kind === "alterRandomEncounterRectangle") return buildEdcdAction(slot, step.dungeon ? -23 : 23, [step.level, step.rectangle, step.encounterRate, step.battleLow === undefined ? -1 : resolveRef(step.battleLow, context.battles, "battle", context), step.battleHigh === undefined ? -1 : resolveRef(step.battleHigh, context.battles, "battle", context)], nextEdcdId, extracodes);
  if (step.kind === "alterRandomRectangle") {
    const firstId = nextEdcdId();
    pushEdcdRow(firstId, [step.level, step.rectangle, step.dungeon ? 1 : 0, step.encounterPercentDelta ?? 0, randomRectangleShapeCode(step.shape)], extracodes);
    const secondId = nextEdcdId();
    pushEdcdRow(secondId, randomRectangleShapeValues(step.shape), extracodes);
    return describeAction(slot, 92, firstId);
  }
  if (step.kind === "enterExitDungeon") return buildEdcdAction(slot, 37, [step.mode, step.level, step.x, step.y, step.heading], nextEdcdId, extracodes);
  if (step.kind === "edcd") return buildEdcdAction(slot, step.opcode, padArray(step.values, 5, 0), nextEdcdId, extracodes);
  return describeAction(slot, 0, 0);
}

function buildEdcdAction(slot: number, opcode: number, values: number[], nextEdcdId: () => number, extracodes: ExtraCodeRow[]) {
  const id = nextEdcdId();
  pushEdcdRow(id, values, extracodes);
  return describeAction(slot, opcode, id);
}

function pushEdcdRow(id: number, values: number[], extracodes: ExtraCodeRow[]) {
  extracodes.push({ id, values: padArray(values, 5, 0), provenance: authoredProvenance("Data EDCD", id, id * EXTRACODE_BYTES, EXTRACODE_BYTES) });
}

function describeAction(slot: number, rawCode: number, id: number): Action {
  const code = normalizeStepOpcode(rawCode);
  const option = actionOptionFor(rawCode);
  return {
    slot,
    rawCode,
    code,
    id,
    label: option.shortLabel,
    category: option.category,
    gosub: rawCode < 0 && rawCode !== -14 && rawCode !== -23
  };
}

function boatStatusCode(status: ScenarioSeedBoatStatus | undefined) {
  return status === undefined ? 0 : status === "inBoat" ? 1 : 2;
}

function campingStatusCode(status: "camping" | "notCamping" | undefined) {
  return status === undefined ? 0 : status === "camping" ? 1 : 2;
}
