import {
  Action,
  BattleRecord,
  ComplexEncounterRecord,
  ExtraCodeRow,
  MapRecord,
  MessageRecord,
  PaintCellChange,
  Project,
  ProjectCommand,
  Provenance,
  RandomLevel,
  RandomRect,
  RealmzTargetRecordKind,
  ShopRecord,
  SimpleEncounterRecord,
  TreasureRecord,
  TriggerRecord
} from "./types";
import { actionOptionFor, normalizeStepOpcode } from "./realmzActions";
import { isReusableDoorPlaceholder } from "./actionPointCapacity";

const DOOR_RECORD_BYTES = 40;
const DOORS_PER_LEVEL = 100;
const EXTRACODE_BYTES = 10;
const RANDOM_LEVEL_BYTES = 644;
const RANDOM_LEVEL_WORDS = RANDOM_LEVEL_BYTES / 2;
const RANDOM_RECTS_PER_LEVEL = 20;
const MAP_RECORD_BYTES = 340;

export function applyProjectCommand(project: Project, command: ProjectCommand) {
  if (command.kind === "paintTiles") return paintTiles(project, command.mapId, command.cells);
  if (command.kind === "createMacro") return createMacro(project, command.displayName);
  if (command.kind === "deleteMacro" || command.kind === "deleteTrigger") return deleteTrigger(project, command.triggerId);
  if (command.kind === "duplicateTrigger") return duplicateTrigger(project, command.triggerId, command.displayName);
  if (command.kind === "createActionPoint") return createActionPoint(project, command);
  if (command.kind === "moveActionPoint") return moveActionPoint(project, command);
  if (command.kind === "updateTriggerHeader") return updateTriggerHeader(project, command.triggerId, command.fields);
  if (command.kind === "updateRandomLevelSettings") return updateRandomLevelSettings(project, command);
  if (command.kind === "updateMapRecord") return updateMapRecord(project, command.id, command.changes);
  if (command.kind === "createRandomRect") return createRandomRect(project, command);
  if (command.kind === "updateRandomRect") return updateRandomRect(project, command);
  if (command.kind === "clearRandomRect") return clearRandomRect(project, command);
  if (command.kind === "updateActionSlot") return updateActionSlot(project, command.triggerId, command.slot, command.rawCode, command.id);
  if (command.kind === "swapActionSlots") return swapActionSlots(project, command.triggerId, command.fromSlot, command.toSlot);
  if (command.kind === "duplicateActionSlot") return duplicateActionSlot(project, command.triggerId, command.fromSlot, command.toSlot);
  if (command.kind === "deleteActionSlot") return updateActionSlot(project, command.triggerId, command.slot, 0, 0);
  if (command.kind === "updateEdcdRow") return updateEdcdRow(project, command.rowId, command.values);
  if (command.kind === "deleteEdcdRow") return deleteEdcdRow(project, command.rowId);
  if (command.kind === "createTargetRecord") return createTargetRecord(project, command.recordType, command.id);
  if (command.kind === "deleteTargetRecord") return deleteTargetRecord(project, command.recordType, command.id);
  if (command.kind === "updateMessageRecord") return updateRecord(project, "messages", command.id, command.changes);
  if (command.kind === "updateBattleRecord") return updateRecord(project, "battles", command.id, command.changes);
  if (command.kind === "updateTreasureRecord") return updateRecord(project, "treasures", command.id, command.changes);
  if (command.kind === "updateShopRecord") return updateRecord(project, "shops", command.id, command.changes);
  if (command.kind === "updateSimpleEncounterRecord") return updateRecord(project, "simpleEncounters", command.id, command.changes);
  if (command.kind === "updateComplexEncounterRecord") return updateRecord(project, "complexEncounters", command.id, command.changes);
  if (command.kind === "upsertQuestLabel") return upsertQuestLabel(project, command.quest);
  if (command.kind === "deleteQuestLabel") return { ...project, questLabels: (project.questLabels ?? []).filter((quest) => quest.id !== command.id) };
  if (command.kind === "applyRealmzScriptStep") {
    const withSlot = updateActionSlot(project, command.triggerId, command.slot, command.opcode, command.id);
    return command.edcdValues ? updateEdcdRow(withSlot, command.id, command.edcdValues) : withSlot;
  }
  if (command.kind === "renameEditorEntity") return renameEditorEntity(project, command.entityId, command.displayName);
  if (command.kind === "updateScenarioShell") return updateScenarioShell(project, command.changes);
  if (command.kind === "updateScenarioContactInfo") return updateScenarioContactInfo(project, command.changes);
  if (command.kind === "updateScenarioRestrictions") return updateScenarioRestrictions(project, command.changes);
  if (command.kind === "updateScenarioStartup") return updateScenarioStartup(project, command.fields);
  if (command.kind === "attachProjectAsset") return { ...project, assets: [...(project.assets ?? []), command.asset] };
  if (command.kind === "replaceProjectAsset") return {
    ...project,
    assets: (project.assets ?? []).map((asset) => asset.id === command.assetId ? command.asset : asset)
  };
  if (command.kind === "updateProjectAsset") return {
    ...project,
    assets: (project.assets ?? []).map((asset) => asset.id === command.assetId ? { ...asset, ...command.changes } : asset)
  };
  if (command.kind === "deleteProjectAsset") return {
    ...project,
    assets: (project.assets ?? []).filter((asset) => asset.id !== command.assetId)
  };
  return project;
}

export function projectCommandLabel(command: ProjectCommand) {
  if (command.kind === "paintTiles") return command.cells.length === 1 ? "Paint tile" : `Paint ${command.cells.length} tiles`;
  return command.label;
}

export function projectCommandChangeCount(command: ProjectCommand) {
  if (command.kind === "paintTiles") return command.cells.length;
  return 1;
}

function paintTiles(project: Project, mapId: string, cells: PaintCellChange[]) {
  if (cells.length === 0) return project;
  let projectChanged = false;
  const maps = project.maps.map((map) => {
    if (map.id !== mapId) return map;
    const tiles = [...map.tiles];
    let mapChanged = false;
    for (const cell of cells) {
      if (cell.index < 0 || cell.index >= tiles.length) continue;
      if (tiles[cell.index] === cell.to) continue;
      tiles[cell.index] = cell.to;
      mapChanged = true;
    }
    if (!mapChanged) return map;
    projectChanged = true;
    return { ...map, tiles };
  });
  return projectChanged ? { ...project, maps } : project;
}

function createMacro(project: Project, displayName?: string) {
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

function deleteTrigger(project: Project, triggerId: string) {
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
  return {
    ...project,
    triggers: nextTriggers,
    editorMetadata: removeDisplayNames(project.editorMetadata, removedDisplayNames)
  };
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

function duplicateTrigger(project: Project, triggerId: string, displayName?: string) {
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

function createActionPoint(
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
  return {
    ...project,
    triggers: upsertAllocatedTrigger(project.triggers, trigger, allocation.placeholderId),
    editorMetadata: addDisplayName(project.editorMetadata, trigger.id, command.displayName)
  };
}

function nextRecordIndex(records: TriggerRecord[], limit: number) {
  const used = new Set(records.map((record) => record.recordIndex));
  for (let index = 0; index < limit; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}

function updateTriggerHeader(project: Project, triggerId: string, fields: Partial<TriggerRecord>) {
  let changed = false;
  const triggers = project.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    changed = true;
    return { ...trigger, ...fields };
  });
  return changed ? { ...project, triggers } : project;
}

function updateRandomLevelSettings(
  project: Project,
  command: Extract<ProjectCommand, { kind: "updateRandomLevelSettings" }>
) {
  const nextLevel = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const level = {
    ...nextLevel,
    ...command.fields
  };
  return replaceRandomLevel(project, syncMapRenderForRandomLevel(level));
}

function updateMapRecord(project: Project, id: number, changes: Extract<ProjectCommand, { kind: "updateMapRecord" }>["changes"]) {
  let changed = false;
  const mapRecords = (project.mapRecords ?? []).map((record) => {
    if (record.id !== id) return record;
    changed = true;
    const next: MapRecord = {
      ...record,
      ...changes,
      rect: changes.rect ? { ...record.rect, ...changes.rect } : record.rect,
      authored: true
    };
    return { ...next, rawBytes: mapRecordRawBytes(next) };
  });
  return changed ? { ...project, mapRecords } : project;
}

function createRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "createRandomRect" }>) {
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const rectIndex = command.rect.rectIndex ?? nextRandomRectIndex(level);
  if (rectIndex == null || !randomRectIndexInRange(rectIndex)) return project;
  const rect = normalizeRandomRect({ ...command.rect, rectIndex });
  const nextLevel = writeRandomRectToRaw({
    ...level,
    rects: upsertRandomRect(level.rects, rect)
  }, rect);
  return replaceRandomLevel(project, nextLevel);
}

function updateRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "updateRandomRect" }>) {
  if (!randomRectIndexInRange(command.rectIndex)) return project;
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const existing = level.rects.find((rect) => rect.rectIndex === command.rectIndex) ?? defaultRandomRect(command.rectIndex);
  const rect = normalizeRandomRect({ ...existing, ...command.fields, rectIndex: command.rectIndex });
  const nextLevel = writeRandomRectToRaw({
    ...level,
    rects: upsertRandomRect(level.rects, rect)
  }, rect);
  return replaceRandomLevel(project, nextLevel);
}

function clearRandomRect(project: Project, command: Extract<ProjectCommand, { kind: "clearRandomRect" }>) {
  if (!randomRectIndexInRange(command.rectIndex)) return project;
  const level = ensureRandomLevel(project, command.levelType, command.levelIndex);
  const cleared = defaultRandomRect(command.rectIndex);
  const nextLevel = writeRandomRectToRaw({
    ...level,
    rects: level.rects.filter((rect) => rect.rectIndex !== command.rectIndex)
  }, cleared);
  return replaceRandomLevel(project, nextLevel);
}

function moveActionPoint(project: Project, command: Extract<ProjectCommand, { kind: "moveActionPoint" }>) {
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
  return {
    ...project,
    triggers: upsertAllocatedTrigger(
      project.triggers.filter((trigger) => trigger.id !== original.id),
      nextTrigger,
      placeholderId
    ),
    editorMetadata: remapDisplayName(project.editorMetadata, original.id, nextId)
  };
}

function updateActionSlot(project: Project, triggerId: string, slot: number, rawCode: number, id: number) {
  let changed = false;
  const triggers = project.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    const actions = trigger.actions.filter((action) => action.slot !== slot);
    if (rawCode !== 0 || id !== 0) actions.push(describeAction(slot, rawCode, id));
    actions.sort((a, b) => a.slot - b.slot);
    changed = true;
    return { ...trigger, actions };
  });
  return changed ? { ...project, triggers } : project;
}

function swapActionSlots(project: Project, triggerId: string, fromSlot: number, toSlot: number) {
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

function duplicateActionSlot(project: Project, triggerId: string, fromSlot: number, toSlot: number) {
  if (!slotInRange(fromSlot) || !slotInRange(toSlot) || fromSlot === toSlot) return project;
  let changed = false;
  const triggers = project.triggers.map((trigger) => {
    if (trigger.id !== triggerId) return trigger;
    const action = trigger.actions.find((candidate) => candidate.slot === fromSlot);
    if (!action) return trigger;
    const actions = trigger.actions.filter((candidate) => candidate.slot !== toSlot);
    actions.push(describeAction(toSlot, action.rawCode, action.id));
    actions.sort((a, b) => a.slot - b.slot);
    changed = true;
    return { ...trigger, actions };
  });
  return changed ? { ...project, triggers } : project;
}

function updateEdcdRow(project: Project, rowId: number, values: number[]) {
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

function deleteEdcdRow(project: Project, rowId: number) {
  const nextRows = project.extracodes.filter((row) => row.id !== rowId);
  return nextRows.length === project.extracodes.length ? project : { ...project, extracodes: nextRows };
}

function createTargetRecord(project: Project, recordType: RealmzTargetRecordKind, requestedId?: number): Project {
  const id = requestedId ?? nextTargetId(project, recordType);
  if (id < 0 || !Number.isInteger(id)) return project;
  switch (recordType) {
    case "message":
      return upsertRecord(project, "messages", emptyMessage(id));
    case "battle":
      return upsertRecord(project, "battles", emptyBattle(id));
    case "treasure":
      return upsertRecord(project, "treasures", emptyTreasure(id));
    case "shop":
      return upsertRecord(project, "shops", emptyShop(id));
    case "simpleEncounter":
      return upsertRecord(project, "simpleEncounters", emptySimpleEncounter(id));
    case "complexEncounter":
      return upsertRecord(project, "complexEncounters", emptyComplexEncounter(id));
    case "questLabel":
      return upsertQuestLabel(project, { id, label: `Quest ${id}` });
  }
}

function deleteTargetRecord(project: Project, recordType: RealmzTargetRecordKind, id: number): Project {
  switch (recordType) {
    case "message":
      return upsertRecord(project, "messages", emptyMessage(id));
    case "battle":
      return upsertRecord(project, "battles", emptyBattle(id));
    case "treasure":
      return upsertRecord(project, "treasures", emptyTreasure(id));
    case "shop":
      return upsertRecord(project, "shops", emptyShop(id));
    case "simpleEncounter":
      return upsertRecord(project, "simpleEncounters", emptySimpleEncounter(id));
    case "complexEncounter":
      return upsertRecord(project, "complexEncounters", emptyComplexEncounter(id));
    case "questLabel":
      return { ...project, questLabels: (project.questLabels ?? []).filter((quest) => quest.id !== id) };
  }
}

type TargetCollectionName = "messages" | "battles" | "treasures" | "shops" | "simpleEncounters" | "complexEncounters";
type TargetRecord =
  | MessageRecord
  | BattleRecord
  | TreasureRecord
  | ShopRecord
  | SimpleEncounterRecord
  | ComplexEncounterRecord;

function updateRecord<K extends TargetCollectionName>(project: Project, collection: K, id: number, changes: Partial<Project[K][number]>) {
  const existing = (project[collection] as TargetRecord[]).find((record) => record.id === id);
  const base = existing ?? defaultRecordForCollection(collection, id);
  return upsertRecord(project, collection, { ...base, ...changes, authored: true } as Project[K][number]);
}

function upsertRecord<K extends TargetCollectionName>(project: Project, collection: K, record: Project[K][number]) {
  const current = [...((project[collection] ?? []) as Project[K][number][])];
  const index = current.findIndex((candidate) => candidate.id === record.id);
  if (index >= 0) current[index] = { ...current[index], ...record };
  else current.push(record);
  current.sort((a, b) => a.id - b.id);
  return { ...project, [collection]: current };
}

function defaultRecordForCollection(collection: TargetCollectionName, id: number): TargetRecord {
  if (collection === "messages") return emptyMessage(id);
  if (collection === "battles") return emptyBattle(id);
  if (collection === "treasures") return emptyTreasure(id);
  if (collection === "shops") return emptyShop(id);
  if (collection === "simpleEncounters") return emptySimpleEncounter(id);
  return emptyComplexEncounter(id);
}

function nextTargetId(project: Project, recordType: RealmzTargetRecordKind) {
  const ids = targetIds(project, recordType);
  for (let id = 0; id < 10000; id += 1) {
    if (!ids.has(id)) return id;
  }
  return ids.size;
}

function targetIds(project: Project, recordType: RealmzTargetRecordKind) {
  const values =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    project.questLabels;
  return new Set((values ?? []).map((record) => record.id));
}

function upsertQuestLabel(project: Project, quest: { id: number; label: string; note?: string }) {
  const quests = [...(project.questLabels ?? [])];
  const index = quests.findIndex((candidate) => candidate.id === quest.id);
  if (index >= 0) quests[index] = { ...quests[index], ...quest };
  else quests.push(quest);
  quests.sort((a, b) => a.id - b.id);
  return { ...project, questLabels: quests };
}

function emptyMessage(id: number): MessageRecord {
  return { id, text: "", rawBytes: new Array(256).fill(0), authored: true, provenance: authoredProvenance("Data SD2", id, id * 256, 256) };
}

function emptyBattle(id: number): BattleRecord {
  return { id, grid: new Array(13 * 13).fill(0), dist: 0, messageBefore: 0, messageAfter: 0, battleMacro: 0, rawBytes: new Array(346).fill(0), authored: true, provenance: authoredProvenance("Data BD", id, id * 346, 346) };
}

function emptyTreasure(id: number): TreasureRecord {
  return { id, itemIds: new Array(20).fill(0), exp: 0, gold: 0, gems: 0, jewelry: 0, rawBytes: new Array(48).fill(0), authored: true, provenance: authoredProvenance("Data TD", id, id * 48, 48) };
}

function emptyShop(id: number): ShopRecord {
  return { id, itemIds: new Array(1000).fill(0), quantities: new Array(1000).fill(0), inflation: 0, rawBytes: new Array(3002).fill(0), authored: true, provenance: authoredProvenance("Data SD", id, id * 3002, 3002) };
}

function emptySimpleEncounter(id: number): SimpleEncounterRecord {
  return { id, actions: [], choiceResults: [0, 0, 0, 0], canBackOut: false, maxTimes: 0, casteSuccess: 0, prompt: 0, texts: ["", "", "", ""], rawBytes: new Array(426).fill(0), authored: true, provenance: authoredProvenance("Data ED", id, id * 426, 426) };
}

function emptyComplexEncounter(id: number): ComplexEncounterRecord {
  return { id, actions: [], choiceResults: [0, 0, 0, 0], wordResults: [0, 0, 0, 0], canBackOut: false, thief: false, maxTimes: 0, casteSuccess: 0, thiefSuccess: 0, thiefFail: 0, prompt: 0, texts: ["", "", "", "", "", "", "", "", ""], rawBytes: new Array(520).fill(0), authored: true, provenance: authoredProvenance("Data ED2", id, id * 520, 520) };
}

function renameEditorEntity(project: Project, entityId: string, displayName: string) {
  const label = displayName.trim();
  if (!label) return project;
  return {
    ...project,
    editorMetadata: {
      displayNames: {
        ...(project.editorMetadata?.displayNames ?? {}),
        [entityId]: { label, source: "user" as const, updatedAt: new Date().toISOString() }
      }
    }
  };
}

function updateScenarioStartup(project: Project, fields: Extract<ProjectCommand, { kind: "updateScenarioStartup" }>["fields"]) {
  const name = fields.name?.trim();
  return {
    ...project,
    scenario: {
      ...project.scenario,
      ...fields,
      ...(name ? { name } : {})
    }
  };
}

function updateScenarioShell(project: Project, changes: Extract<ProjectCommand, { kind: "updateScenarioShell" }>["changes"]) {
  const shell = {
    ...defaultScenarioShell(project),
    ...(project.scenario.shell ?? {}),
    ...changes,
    authored: true
  };
  return { ...project, scenario: { ...project.scenario, shell } };
}

function updateScenarioContactInfo(project: Project, changes: Extract<ProjectCommand, { kind: "updateScenarioContactInfo" }>["changes"]) {
  const contactInfo = {
    ...defaultScenarioContactInfo(project),
    ...(project.scenario.contactInfo ?? {}),
    ...changes,
    payInfo: changes.payInfo ?? project.scenario.contactInfo?.payInfo ?? defaultScenarioContactInfo(project).payInfo,
    titles: changes.titles ?? project.scenario.contactInfo?.titles ?? defaultScenarioContactInfo(project).titles,
    authored: true
  };
  return { ...project, scenario: { ...project.scenario, contactInfo } };
}

function updateScenarioRestrictions(project: Project, changes: Extract<ProjectCommand, { kind: "updateScenarioRestrictions" }>["changes"]) {
  const restrictions = {
    ...defaultScenarioRestrictions(),
    ...(project.scenario.restrictions ?? {}),
    ...changes,
    bannedRaces: changes.bannedRaces ?? project.scenario.restrictions?.bannedRaces ?? [],
    bannedCastes: changes.bannedCastes ?? project.scenario.restrictions?.bannedCastes ?? [],
    authored: true
  };
  return { ...project, scenario: { ...project.scenario, restrictions } };
}

function defaultScenarioShell(project: Project) {
  return {
    sourceFile: project.scenario.name || "Scenario",
    recLevel: 1,
    maxLevel: 999,
    landLevel: project.maps.find((map) => map.levelType === "land")?.index ?? 0,
    lookX: 0,
    lookY: 0,
    creatorUser: "",
    codeseg1: new Array(20).fill(0),
    codeseg2: new Array(20).fill(0),
    trailingBytes: []
  };
}

function defaultScenarioContactInfo(project: Project) {
  return {
    scenarioName: project.scenario.name,
    version: "",
    date: "",
    author: "",
    email: "",
    web: "",
    fee: "",
    payInfo: ["", "", "", "", ""],
    titles: ["", "", "", "", ""],
    description: ""
  };
}

function defaultScenarioRestrictions() {
  return {
    description: "",
    maxPartyCharacters: 0,
    maxPartyLevel: 0,
    bannedRaces: [],
    bannedCastes: []
  };
}

function ensureRandomLevel(project: Project, levelType: RandomLevel["levelType"], levelIndex: number): RandomLevel {
  const existing = project.randomLevels.find((level) => level.levelType === levelType && level.levelIndex === levelIndex);
  if (existing) return existing;
  return {
    id: `${levelType}:${levelIndex}:randlevel`,
    source: levelType === "land" ? "Data RD" : "Data RDD",
    levelType,
    levelIndex,
    landlook: levelType === "land" ? 2 : -1,
    isDark: false,
    useLos: false,
    rects: [],
    rawValues: new Array(RANDOM_LEVEL_WORDS).fill(0),
    provenance: authoredProvenance(levelType === "land" ? "Data RD" : "Data RDD", levelIndex, levelIndex * RANDOM_LEVEL_BYTES, RANDOM_LEVEL_BYTES)
  };
}

function replaceRandomLevel(project: Project, level: RandomLevel) {
  const randomLevels = [...project.randomLevels];
  const index = randomLevels.findIndex((candidate) => candidate.levelType === level.levelType && candidate.levelIndex === level.levelIndex);
  if (index >= 0) randomLevels[index] = level;
  else randomLevels.push(level);
  randomLevels.sort((a, b) => a.levelType.localeCompare(b.levelType) || a.levelIndex - b.levelIndex);
  return {
    ...project,
    randomLevels,
    maps: project.maps.map((map) => {
      if (map.levelType !== level.levelType || map.index !== level.levelIndex) return map;
      return {
        ...map,
        render: {
          ...map.render,
          landlook: level.landlook,
          tilesetId: level.levelType === "dungeon" ? "dungeon-top-down-302" : `landlook-${level.landlook}`,
          mode: level.levelType === "dungeon" ? "dungeon-top-down" : "outdoor-landlook"
        }
      };
    })
  };
}

function syncMapRenderForRandomLevel(level: RandomLevel) {
  const bytes = randomLevelRawBytes(level);
  bytes[520] = level.landlook & 0xff;
  bytes[521] = level.isDark ? 1 : 0;
  bytes[522] = level.useLos ? 1 : 0;
  return { ...level, rawValues: rawBytesToWords(bytes) };
}

function upsertRandomRect(rects: RandomRect[], rect: RandomRect) {
  const next = rects.filter((candidate) => candidate.rectIndex !== rect.rectIndex);
  next.push(rect);
  next.sort((a, b) => a.rectIndex - b.rectIndex);
  return next;
}

function nextRandomRectIndex(level: RandomLevel) {
  const used = new Set(level.rects.map((rect) => rect.rectIndex));
  for (let index = 0; index < RANDOM_RECTS_PER_LEVEL; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}

function defaultRandomRect(rectIndex: number): RandomRect {
  return {
    rectIndex,
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    percent: 0,
    battleRange: [0, 0],
    randomDoors: [0, 0, 0],
    randomDoorPercent: [0, 0, 0],
    only: false,
    option: 0,
    sound: 0,
    text: 0
  };
}

function normalizeRandomRect(rect: RandomRect): RandomRect {
  const left = clampInt(Math.min(rect.left, rect.right), 0, 89);
  const right = clampInt(Math.max(rect.left, rect.right), 0, 89);
  const top = clampInt(Math.min(rect.top, rect.bottom), 0, 89);
  const bottom = clampInt(Math.max(rect.top, rect.bottom), 0, 89);
  return {
    rectIndex: rect.rectIndex,
    left,
    top,
    right,
    bottom,
    percent: clampInt(rect.percent, -32768, 10000),
    battleRange: normalizePair(rect.battleRange),
    randomDoors: normalizeFixedTriple(rect.randomDoors),
    randomDoorPercent: normalizeFixedTriple(rect.randomDoorPercent).map((value) => clampInt(value, -100, 100)),
    only: Boolean(rect.only),
    option: clampInt(rect.option, -128, 127),
    sound: clampInt(rect.sound, -32768, 32767),
    text: clampInt(rect.text, -32768, 32767)
  };
}

function writeRandomRectToRaw(level: RandomLevel, rect: RandomRect) {
  const bytes = randomLevelRawBytes(level);
  const r = rect.rectIndex;
  writeI16(bytes, r * 8, rect.top);
  writeI16(bytes, r * 8 + 2, rect.left);
  writeI16(bytes, r * 8 + 4, rect.bottom);
  writeI16(bytes, r * 8 + 6, rect.right);
  writeI16(bytes, 160 + r * 2, rect.percent);
  writeI16(bytes, 200 + r * 4, rect.battleRange[0] ?? 0);
  writeI16(bytes, 202 + r * 4, rect.battleRange[1] ?? 0);
  for (let slot = 0; slot < 3; slot += 1) {
    writeI16(bytes, 280 + r * 6 + slot * 2, rect.randomDoors[slot] ?? 0);
    writeI16(bytes, 400 + r * 6 + slot * 2, rect.randomDoorPercent[slot] ?? 0);
  }
  bytes[523 + r] = rect.only ? 1 : 0;
  bytes[543 + r] = rect.option & 0xff;
  writeI16(bytes, 563 + r * 2, rect.sound);
  writeI16(bytes, 603 + r * 2, rect.text);
  bytes[520] = level.landlook & 0xff;
  bytes[521] = level.isDark ? 1 : 0;
  bytes[522] = level.useLos ? 1 : 0;
  return { ...level, rawValues: rawBytesToWords(bytes) };
}

function randomLevelRawBytes(level: RandomLevel) {
  const bytes = new Uint8Array(RANDOM_LEVEL_BYTES);
  const rawValues = level.rawValues?.length === RANDOM_LEVEL_WORDS ? level.rawValues : new Array(RANDOM_LEVEL_WORDS).fill(0);
  rawValues.forEach((value, index) => writeI16(bytes, index * 2, value));
  return bytes;
}

function mapRecordRawBytes(record: MapRecord) {
  const bytes = new Uint8Array(MAP_RECORD_BYTES);
  if (record.rawBytes?.length === MAP_RECORD_BYTES) {
    bytes.set(record.rawBytes.map((value) => value & 0xff));
  }
  writeI16(bytes, 60, record.startX);
  writeI16(bytes, 62, record.startY);
  writeI16(bytes, 64, record.level);
  writeI16(bytes, 66, record.pictId);
  writeI16(bytes, 68, record.iconSize);
  writeI16(bytes, 70, record.show);
  writeI16(bytes, 72, record.isDungeon ? 1 : 0);
  writeI16(bytes, 76, record.rect.top);
  writeI16(bytes, 78, record.rect.left);
  writeI16(bytes, 80, record.rect.bottom);
  writeI16(bytes, 82, record.rect.right);
  writePascalText(bytes, 84, MAP_RECORD_BYTES - 84, record.note);
  return Array.from(bytes);
}

function rawBytesToWords(bytes: Uint8Array) {
  const values: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 2) {
    const unsigned = (bytes[offset] << 8) | bytes[offset + 1];
    values.push(unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned);
  }
  return values;
}

function writeI16(bytes: Uint8Array, offset: number, value: number) {
  const normalized = clampInt(value, -32768, 32767) & 0xffff;
  bytes[offset] = (normalized >> 8) & 0xff;
  bytes[offset + 1] = normalized & 0xff;
}

function writePascalText(bytes: Uint8Array, offset: number, length: number, text: string) {
  const end = Math.min(bytes.length, offset + length);
  for (let index = offset; index < end; index += 1) bytes[index] = 0;
  const encoded = Array.from(text ?? "").map((char) => {
    const code = char.charCodeAt(0);
    return code >= 0 && code <= 0x7f ? code : 63;
  });
  const count = Math.min(encoded.length, Math.max(0, length - 1), 255);
  bytes[offset] = count;
  for (let index = 0; index < count; index += 1) bytes[offset + 1 + index] = encoded[index];
}

function normalizePair(values: number[]) {
  return [clampInt(values?.[0] ?? 0, -32768, 32767), clampInt(values?.[1] ?? 0, -32768, 32767)];
}

function normalizeFixedTriple(values: number[]) {
  return [0, 1, 2].map((index) => clampInt(values?.[index] ?? 0, -32768, 32767));
}

function randomRectIndexInRange(rectIndex: number) {
  return Number.isInteger(rectIndex) && rectIndex >= 0 && rectIndex < RANDOM_RECTS_PER_LEVEL;
}

function clampInt(value: number, min: number, max: number) {
  const numeric = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(min, Math.min(max, numeric));
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
    category: projectActionCategory(code, option.category),
    gosub: rawCode < 0 && rawCode !== -14 && rawCode !== -23
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

function packDoorId(levelIndex: number, x: number, y: number) {
  return levelIndex * 10000 + y * 100 + x;
}

function triggerIdFor(source: string, levelIndex: number, recordIndex: number) {
  return `${source}:${levelIndex}:${recordIndex}`;
}

function addDisplayName(metadata: Project["editorMetadata"], entityId: string, displayName?: string) {
  const label = displayName?.trim();
  if (!label) return metadata;
  return {
    displayNames: {
      ...(metadata?.displayNames ?? {}),
      [entityId]: { label, source: "user" as const, updatedAt: new Date().toISOString() }
    }
  };
}

function removeDisplayNames(metadata: Project["editorMetadata"], entityIds: string[]) {
  const displayNames = { ...(metadata?.displayNames ?? {}) };
  let changed = false;
  for (const id of entityIds) {
    if (id in displayNames) {
      delete displayNames[id];
      changed = true;
    }
  }
  return changed ? { displayNames } : metadata;
}

function remapDisplayName(metadata: Project["editorMetadata"], fromId: string, toId: string) {
  if (fromId === toId) return metadata;
  const existing = metadata?.displayNames?.[fromId];
  if (!existing) return metadata;
  const displayNames = { ...(metadata?.displayNames ?? {}) };
  delete displayNames[fromId];
  displayNames[toId] = { ...existing, updatedAt: new Date().toISOString() };
  return { displayNames };
}

function displayNameFor(project: Project, entityId: string, fallback: string) {
  return project.editorMetadata?.displayNames?.[entityId]?.label ?? fallback;
}
