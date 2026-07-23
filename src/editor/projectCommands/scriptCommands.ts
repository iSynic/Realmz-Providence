import { Action, ExtraCodeRow, Project, ProjectCommand, Provenance, TriggerRecord } from "../types";
import {
  actionOptionFor,
  normalizeStepOpcode,
  supportsRemakeProgressionMediaRequirement
} from "../realmzActions";
import { isReusableDoorPlaceholder } from "../actionPointCapacity";
import { normalizedEditorMetadata } from "./tilePaletteCommands";
import { defaultGlobalMacroHooks } from "./scenarioRulesCommands";
import {
  clearActionPointMarker,
  ensureActionPointMarker,
  updateActionPointMapCell
} from "../map/actionPointMarkers";
import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";

const DOOR_RECORD_BYTES = REALMZ_NATIVE_LAYOUT.actionPointRecordBytes;
const DOORS_PER_LEVEL = REALMZ_NATIVE_LAYOUT.actionPointsPerLevel;
const EXTRACODE_BYTES = REALMZ_NATIVE_LAYOUT.extraCodeRecordBytes;

export function createMacro(project: Project, displayName?: string) {
  const recordIndex =
    Math.max(-1, ...project.triggers.filter((trigger) => trigger.source === "Data ED3").map((trigger) => trigger.recordIndex)) + 1;
  const macro: TriggerRecord = {
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
    actions: [],
    provenance: authoredProvenance("Data ED3", recordIndex, recordIndex * DOOR_RECORD_BYTES, DOOR_RECORD_BYTES)
  };
  return {
    ...project,
    triggers: [...project.triggers, macro],
    editorMetadata: addDisplayName(project.editorMetadata, macro.id, displayName)
  };
}

export function createStartupTestMacro(project: Project, complexEncounterId?: number) {
  const recordIndex = nextStartupMacroRecordIndex(project);
  const existing = project.triggers.find((trigger) => trigger.source === "Data ED3" && trigger.recordIndex === recordIndex);
  const triggerId = `Data ED3:macro:${recordIndex}`;
  const actions = startupTestActions(complexEncounterId);
  const macro: TriggerRecord = existing
    ? {
        ...existing,
        id: triggerId,
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
        actions,
        provenance: existing.provenance ?? authoredProvenance("Data ED3", recordIndex, recordIndex * DOOR_RECORD_BYTES, DOOR_RECORD_BYTES)
      }
    : {
        id: triggerId,
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
        actions,
        provenance: authoredProvenance("Data ED3", recordIndex, recordIndex * DOOR_RECORD_BYTES, DOOR_RECORD_BYTES)
      };
  const hooks = project.scenario.globalMacroHooks ?? defaultGlobalMacroHooks();
  const defaultHooks = defaultGlobalMacroHooks();
  const slots = defaultHooks.slots.map((defaultSlot) => {
    const current = hooks.slots.find((candidate) => candidate.slot === defaultSlot.slot) ?? defaultSlot;
    return current.slot === 0 ? { ...current, door: recordIndex } : current;
  });
  const defaultSlotIds = new Set(defaultHooks.slots.map((slot) => slot.slot));
  const extraSlots = hooks.slots.filter((slot) => !defaultSlotIds.has(slot.slot));
  return {
    ...project,
    triggers: existing
      ? project.triggers.map((trigger) => (trigger.source === "Data ED3" && trigger.recordIndex === recordIndex ? macro : trigger))
      : [...project.triggers, macro],
    scenario: {
      ...project.scenario,
      globalMacroHooks: {
        ...hooks,
        slots: [...slots, ...extraSlots],
        rawBytes: undefined,
        authored: true
      }
    },
    editorMetadata: addDisplayName(project.editorMetadata, triggerId, `Startup Test Macro ${recordIndex}`)
  };
}

export function deleteTrigger(project: Project, triggerId: string) {
  const original = project.triggers.find((trigger) => trigger.id === triggerId);
  let changed = false;
  const removedDisplayNames: string[] = [];
  const nextTriggers = project.triggers.flatMap((trigger) => {
    if (trigger.id !== triggerId) return [trigger];
    changed = true;
    removedDisplayNames.push(trigger.id);
    if (trigger.source === "Data ED3") return [];
    return [emptyActionPointPlaceholder(trigger)];
  });
  if (!changed) return project;
  let maps = project.maps;
  if (original?.levelType && original.levelIndex != null && original.coordinate && !hasOtherTriggerAt(project, original, original.coordinate.x, original.coordinate.y)) {
    const levelType = original.levelType;
    maps = updateActionPointMapCell(
      maps,
      levelType,
      original.levelIndex,
      original.coordinate.x,
      original.coordinate.y,
      (value) => clearActionPointMarker(value, levelType)
    );
  }
  return {
    ...project,
    maps,
    triggers: nextTriggers,
    editorMetadata: removeDisplayNames(project.editorMetadata, removedDisplayNames)
  };
}

export function duplicateTrigger(project: Project, triggerId: string, displayName?: string) {
  const original = project.triggers.find((trigger) => trigger.id === triggerId);
  if (!original) return project;

  if (original.source === "Data ED3") {
    const recordIndex =
      Math.max(-1, ...project.triggers.filter((trigger) => trigger.source === "Data ED3").map((trigger) => trigger.recordIndex)) + 1;
    const macro = cloneTrigger(original, {
      id: `Data ED3:macro:${recordIndex}`,
      source: "Data ED3",
      levelType: null,
      levelIndex: null,
      recordIndex,
      coordinate: null,
      provenance: authoredProvenance("Data ED3", recordIndex, recordIndex * DOOR_RECORD_BYTES, DOOR_RECORD_BYTES)
    });
    return {
      ...project,
      triggers: [...project.triggers, macro],
      editorMetadata: addDisplayName(project.editorMetadata, macro.id, displayName ?? `Copy of ${displayNameFor(project, original.id, `Macro ${original.recordIndex}`)}`)
    };
  }

  if (!original.levelType || original.levelIndex == null) return project;
  const siblings = project.triggers.filter((trigger) => trigger.levelType === original.levelType && trigger.levelIndex === original.levelIndex);
  const allocation = findReusableDoorSlot(siblings, DOORS_PER_LEVEL);
  if (!allocation) return project;
  const source = original.levelType === "land" ? "Data DD" : "Data DDD";
  const coordinate = original.coordinate ?? { x: original.targetX ?? 0, y: original.targetY ?? 0 };
  const duplicate = cloneTrigger(original, {
    id: triggerIdFor(source, original.levelIndex, allocation.recordIndex),
    source,
    levelType: original.levelType,
    levelIndex: original.levelIndex,
    recordIndex: allocation.recordIndex,
    coordinate,
    doorid: packDoorId(original.levelIndex, coordinate.x, coordinate.y),
    landid: original.levelIndex,
    targetX: coordinate.x,
    targetY: coordinate.y,
    provenance: authoredProvenance(source, allocation.recordIndex, (original.levelIndex * DOORS_PER_LEVEL + allocation.recordIndex) * DOOR_RECORD_BYTES, DOOR_RECORD_BYTES)
  });
  return {
    ...project,
    triggers: upsertAllocatedTrigger(project.triggers, duplicate, allocation.placeholderId),
    editorMetadata: addDisplayName(project.editorMetadata, duplicate.id, displayName ?? `Copy of ${displayNameFor(project, original.id, `Action Point ${original.recordIndex}`)}`)
  };
}

export function createActionPoint(
  project: Project,
  command: Extract<ProjectCommand, { kind: "createActionPoint" }>
) {
  const siblings = project.triggers.filter((trigger) => trigger.levelType === command.levelType && trigger.levelIndex === command.levelIndex);
  const allocation = findReusableDoorSlot(siblings, DOORS_PER_LEVEL);
  if (!allocation) return project;
  const source = command.levelType === "land" ? "Data DD" : "Data DDD";
  const trigger: TriggerRecord = {
    id: triggerIdFor(source, command.levelIndex, allocation.recordIndex),
    source,
    levelType: command.levelType,
    levelIndex: command.levelIndex,
    recordIndex: allocation.recordIndex,
    active: true,
    doorid: command.levelIndex * 10000 + command.y * 100 + command.x,
    landid: command.levelIndex,
    targetX: command.x,
    targetY: command.y,
    percent: 100,
    coordinate: { x: command.x, y: command.y },
    actions: [],
    provenance: authoredProvenance(
      source,
      allocation.recordIndex,
      (command.levelIndex * DOORS_PER_LEVEL + allocation.recordIndex) * DOOR_RECORD_BYTES,
      DOOR_RECORD_BYTES
    )
  };
  const maps = updateActionPointMapCell(project.maps, command.levelType, command.levelIndex, command.x, command.y, (value) =>
    ensureActionPointMarker(value, command.levelType)
  );
  return {
    ...project,
    maps,
    triggers: upsertAllocatedTrigger(project.triggers, trigger, allocation.placeholderId),
    editorMetadata: addDisplayName(project.editorMetadata, trigger.id, command.displayName)
  };
}

export function updateTriggerHeader(project: Project, triggerId: string, fields: Partial<TriggerRecord>) {
  let changed = false;
  const triggers = project.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    changed = true;
    return { ...trigger, ...fields };
  });
  return changed ? { ...project, triggers } : project;
}

export function moveActionPoint(project: Project, command: Extract<ProjectCommand, { kind: "moveActionPoint" }>) {
  const original = project.triggers.find((trigger) => trigger.id === command.triggerId);
  if (!original || original.source === "Data ED3") return project;
  const nextSource = command.levelType === "land" ? "Data DD" : "Data DDD";
  const sameBucket = original.levelType === command.levelType && original.levelIndex === command.levelIndex;
  let recordIndex = original.recordIndex;
  let placeholderId: string | undefined;
  if (!sameBucket) {
    const siblings = project.triggers.filter((trigger) => trigger.levelType === command.levelType && trigger.levelIndex === command.levelIndex);
    const allocation = findReusableDoorSlot(siblings, DOORS_PER_LEVEL, original.recordIndex, original.id);
    if (!allocation) return project;
    recordIndex = allocation.recordIndex;
    placeholderId = allocation.placeholderId;
  }
  const nextId = triggerIdFor(nextSource, command.levelIndex, recordIndex);
  const nextTrigger = cloneTrigger(original, {
    id: nextId,
    source: nextSource,
    levelType: command.levelType,
    levelIndex: command.levelIndex,
    recordIndex,
    active: true,
    doorid: packDoorId(command.levelIndex, command.x, command.y),
    landid: command.levelIndex,
    targetX: command.x,
    targetY: command.y,
    coordinate: { x: command.x, y: command.y },
    provenance: authoredProvenance(nextSource, recordIndex, (command.levelIndex * DOORS_PER_LEVEL + recordIndex) * DOOR_RECORD_BYTES, DOOR_RECORD_BYTES)
  });
  let maps = project.maps;
  if (original.levelType && original.levelIndex != null && original.coordinate && !hasOtherTriggerAt(project, original, original.coordinate.x, original.coordinate.y)) {
    const levelType = original.levelType;
    maps = updateActionPointMapCell(
      maps,
      levelType,
      original.levelIndex,
      original.coordinate.x,
      original.coordinate.y,
      (value) => clearActionPointMarker(value, levelType)
    );
  }
  maps = updateActionPointMapCell(maps, command.levelType, command.levelIndex, command.x, command.y, (value) =>
    ensureActionPointMarker(value, command.levelType)
  );
  return {
    ...project,
    maps,
    triggers: upsertAllocatedTrigger(
      project.triggers.filter((trigger) => trigger.id !== original.id),
      nextTrigger,
      placeholderId
    ),
    editorMetadata: remapDisplayName(project.editorMetadata, original.id, nextId)
  };
}

export function updateActionSlot(
  project: Project,
  triggerId: string,
  slot: number,
  rawCode: number,
  id: number,
  mediaRequiredForProgression = false
) {
  let changed = false;
  const triggers = project.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    const actions = trigger.actions.filter((action) => action.slot !== slot);
    if (rawCode !== 0 || id !== 0) {
      actions.push(describeAction(
        slot,
        rawCode,
        id,
        supportsRemakeProgressionMediaRequirement(rawCode) && mediaRequiredForProgression
      ));
    }
    actions.sort((a, b) => a.slot - b.slot);
    changed = true;
    return { ...trigger, actions };
  });
  return changed ? { ...project, triggers } : project;
}

export function swapActionSlots(project: Project, triggerId: string, fromSlot: number, toSlot: number) {
  if (!slotInRange(fromSlot) || !slotInRange(toSlot) || fromSlot === toSlot) return project;
  let changed = false;
  const triggers = project.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    const actions = trigger.actions
      .map((action) => {
        if (action.slot === fromSlot) return { ...action, slot: toSlot };
        if (action.slot === toSlot) return { ...action, slot: fromSlot };
        return action;
      })
      .sort((a, b) => a.slot - b.slot);
    changed = true;
    return { ...trigger, actions };
  });
  return changed ? { ...project, triggers } : project;
}

export function duplicateActionSlot(project: Project, triggerId: string, fromSlot: number, toSlot: number) {
  if (!slotInRange(fromSlot) || !slotInRange(toSlot) || fromSlot === toSlot) return project;
  let changed = false;
  const triggers = project.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    const action = trigger.actions.find((candidate) => candidate.slot === fromSlot);
    if (!action) return trigger;
    const actions = trigger.actions.filter((candidate) => candidate.slot !== toSlot);
    actions.push(describeAction(toSlot, action.rawCode, action.id, action.mediaRequiredForProgression));
    actions.sort((a, b) => a.slot - b.slot);
    changed = true;
    return { ...trigger, actions };
  });
  return changed ? { ...project, triggers } : project;
}

export function updateEdcdRow(project: Project, rowId: number, values: number[]) {
  const normalized = [0, 0, 0, 0, 0].map((_, index) => Number(values[index] ?? 0));
  let found = false;
  const extracodes = project.extracodes.map((row) => {
    if (row.id !== rowId) return row;
    found = true;
    return { ...row, values: normalized };
  });
  if (!found) {
    const row: ExtraCodeRow = {
      id: rowId,
      values: normalized,
      provenance: authoredProvenance("Data EDCD", rowId, rowId * EXTRACODE_BYTES, EXTRACODE_BYTES)
    };
    extracodes.push(row);
    extracodes.sort((a, b) => a.id - b.id);
  }
  return { ...project, extracodes };
}

export function deleteEdcdRow(project: Project, rowId: number) {
  const nextRows = project.extracodes.filter((row) => row.id !== rowId);
  return nextRows.length === project.extracodes.length ? project : { ...project, extracodes: nextRows };
}

function emptyActionPointPlaceholder(trigger: TriggerRecord): TriggerRecord {
  return {
    ...trigger,
    active: false,
    doorid: 0,
    landid: trigger.levelIndex ?? 0,
    targetX: 0,
    targetY: 0,
    percent: 0,
    coordinate: null,
    actions: []
  };
}

function describeAction(
  slot: number,
  rawCode: number,
  id: number,
  mediaRequiredForProgression = false
): Action {
  const code = normalizeStepOpcode(rawCode);
  const option = actionOptionFor(rawCode);
  return {
    slot,
    rawCode,
    code,
    id,
    label: option.shortLabel,
    category: projectActionCategory(code, option.category),
    gosub: rawCode < 0 && rawCode !== -14 && rawCode !== -23,
    ...(mediaRequiredForProgression ? { mediaRequiredForProgression: true } : {})
  };
}

function projectActionCategory(code: number, legacyCategory: string) {
  if (code === -23 || [7, 12, 13, 20, 23, 29, 37, 45, 57, 61, 70, 92, 97].includes(code)) return "map";
  if ([2, 11, 48, 107, 120, 121, 122, 123, 124, 125, 126].includes(code)) return "combat";
  if ([4, 5, 35, 41, 54, 104].includes(code)) return "encounter";
  if ([6, 10, 21, 22, 32, 33, 36, 49, 51, 65, 67, 73].includes(code)) return "item_shop";
  if ([3, 8, 24, 31, 38, 39, 40, 42, 46, 55, 56, 58, 59, 64, 72, 75, 77, 78, 81, 85, 86, 87, 111, 112].includes(code)) return "branch";
  if ([1, 9, 19, 26, 27, 62, 71].includes(code)) return "ui_text";
  if ([63, 66].includes(code)) return "time";
  if ([84, 98, 99].includes(code)) return "registration";
  if (code === 0) return "unknown";
  if ([14, 15, 16, 17, 18, 30, 43, 47, 50, 52, 53, 60, 68, 69, 74, 76, 90, 103, 108].includes(code)) return "state";

  const normalized = legacyCategory.toLowerCase();
  if (["branch", "combat", "encounter", "map"].includes(normalized)) return normalized;
  if (normalized === "economy") return "item_shop";
  if (normalized === "text" || normalized === "media") return "ui_text";
  if (normalized === "scenario") return "time";
  if (["characters", "quest", "rules"].includes(normalized)) return "state";
  return "unknown";
}

function authoredProvenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number): Provenance {
  return {
    sourceFile,
    recordIndex,
    byteOffset,
    byteLength,
    confidence: "inferred"
  };
}

function cloneTrigger(trigger: TriggerRecord, changes: Partial<TriggerRecord>): TriggerRecord {
  return {
    ...trigger,
    actions: trigger.actions.map((action) => ({ ...action })),
    ...changes
  };
}

function findReusableDoorSlot(
  records: TriggerRecord[],
  limit: number,
  preferredIndex?: number,
  excludeId?: string
): { recordIndex: number; placeholderId?: string } | null {
  const candidates = records.filter((record) => record.id !== excludeId);
  if (preferredIndex != null) {
    const preferred = candidates.find((record) => record.recordIndex === preferredIndex);
    if (!preferred) return { recordIndex: preferredIndex };
    if (isReusableDoorPlaceholder(preferred)) return { recordIndex: preferredIndex, placeholderId: preferred.id };
  }
  for (let index = 0; index < limit; index += 1) {
    const existing = candidates.find((record) => record.recordIndex === index);
    if (!existing) return { recordIndex: index };
    if (isReusableDoorPlaceholder(existing)) return { recordIndex: index, placeholderId: existing.id };
  }
  return null;
}

function upsertAllocatedTrigger(triggers: TriggerRecord[], trigger: TriggerRecord, placeholderId?: string) {
  let replaced = false;
  const next = triggers.map((candidate) => {
    if (candidate.id !== placeholderId && candidate.id !== trigger.id) return candidate;
    replaced = true;
    return trigger;
  });
  return replaced ? next : [...next, trigger];
}

function slotInRange(slot: number) {
  return Number.isInteger(slot) && slot >= 0 && slot < 8;
}

function nextStartupMacroRecordIndex(project: Project) {
  const macros = project.triggers.filter((trigger) => trigger.source === "Data ED3");
  const reusable = macros
    .filter((trigger) => trigger.recordIndex > 0 && !trigger.active && trigger.actions.length === 0)
    .sort((a, b) => a.recordIndex - b.recordIndex)[0];
  if (reusable) return reusable.recordIndex;
  return Math.max(0, ...macros.map((trigger) => trigger.recordIndex)) + 1;
}

function startupTestActions(complexEncounterId?: number): Action[] {
  if (complexEncounterId == null || !Number.isInteger(complexEncounterId) || complexEncounterId < 0) return [];
  return [describeAction(0, 5, complexEncounterId), describeAction(7, 24, 0)];
}

function packDoorId(levelIndex: number, x: number, y: number) {
  return levelIndex * 10000 + y * 100 + x;
}

function triggerIdFor(source: string, levelIndex: number, recordIndex: number) {
  return `${source}:${levelIndex}:${recordIndex}`;
}

function hasOtherTriggerAt(project: Project, original: TriggerRecord, x: number, y: number) {
  return project.triggers.some((trigger) =>
    trigger.id !== original.id &&
    trigger.active &&
    trigger.levelType === original.levelType &&
    trigger.levelIndex === original.levelIndex &&
    trigger.coordinate?.x === x &&
    trigger.coordinate.y === y
  );
}

function addDisplayName(metadata: Project["editorMetadata"], entityId: string, displayName?: string) {
  const label = displayName?.trim();
  if (!label) return metadata;
  const normalized = normalizedMetadata(metadata);
  return {
    ...normalized,
    displayNames: {
      ...normalized.displayNames,
      [entityId]: { label, source: "user" as const, updatedAt: new Date().toISOString() }
    }
  };
}

function removeDisplayNames(metadata: Project["editorMetadata"], entityIds: string[]) {
  const normalized = normalizedMetadata(metadata);
  const displayNames = { ...normalized.displayNames };
  let changed = false;
  for (const id of entityIds) {
    if (id in displayNames) {
      delete displayNames[id];
      changed = true;
    }
  }
  return changed ? { ...normalized, displayNames } : metadata;
}

function remapDisplayName(metadata: Project["editorMetadata"], fromId: string, toId: string) {
  if (fromId === toId) return metadata;
  const normalized = normalizedMetadata(metadata);
  const existing = normalized.displayNames[fromId];
  if (!existing) return metadata;
  const displayNames = { ...normalized.displayNames };
  delete displayNames[fromId];
  displayNames[toId] = { ...existing, updatedAt: new Date().toISOString() };
  return { ...normalized, displayNames };
}

function displayNameFor(project: Project, entityId: string, fallback: string) {
  return project.editorMetadata?.displayNames?.[entityId]?.label ?? fallback;
}

function normalizedMetadata(metadata: Project["editorMetadata"]) {
  return normalizedEditorMetadata({ editorMetadata: metadata } as Project);
}
