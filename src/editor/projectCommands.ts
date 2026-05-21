import { Action, ExtraCodeRow, PaintCellChange, Project, ProjectCommand, Provenance, TriggerRecord } from "./types";
import { actionOptionFor, normalizeStepOpcode } from "./realmzActions";

const DOOR_RECORD_BYTES = 40;
const DOORS_PER_LEVEL = 100;
const EXTRACODE_BYTES = 10;

export function applyProjectCommand(project: Project, command: ProjectCommand) {
  if (command.kind === "paintTiles") return paintTiles(project, command.mapId, command.cells);
  if (command.kind === "createMacro") return createMacro(project);
  if (command.kind === "deleteMacro") return { ...project, triggers: project.triggers.filter((trigger) => trigger.id !== command.triggerId) };
  if (command.kind === "createActionPoint") return createActionPoint(project, command);
  if (command.kind === "updateTriggerHeader") return updateTriggerHeader(project, command.triggerId, command.fields);
  if (command.kind === "updateActionSlot") return updateActionSlot(project, command.triggerId, command.slot, command.rawCode, command.id);
  if (command.kind === "updateEdcdRow") return updateEdcdRow(project, command.rowId, command.values);
  if (command.kind === "renameEditorEntity") return renameEditorEntity(project, command.entityId, command.displayName);
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

function createMacro(project: Project) {
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
  return { ...project, triggers: [...project.triggers, macro] };
}

function createActionPoint(
  project: Project,
  command: Extract<ProjectCommand, { kind: "createActionPoint" }>
) {
  const siblings = project.triggers.filter((trigger) => trigger.levelType === command.levelType && trigger.levelIndex === command.levelIndex);
  const recordIndex = nextRecordIndex(siblings, 100);
  if (recordIndex === null) return project;
  const trigger: TriggerRecord = {
    id: `Data ${command.levelType === "land" ? "DD" : "DDD"}:${command.levelIndex}:${recordIndex}`,
    source: command.levelType === "land" ? "Data DD" : "Data DDD",
    levelType: command.levelType,
    levelIndex: command.levelIndex,
    recordIndex,
    active: true,
    doorid: command.levelIndex * 10000 + command.y * 100 + command.x,
    landid: command.levelIndex,
    targetX: command.x,
    targetY: command.y,
    percent: 100,
    coordinate: { x: command.x, y: command.y },
    actions: [],
    provenance: authoredProvenance(
      command.levelType === "land" ? "Data DD" : "Data DDD",
      recordIndex,
      (command.levelIndex * DOORS_PER_LEVEL + recordIndex) * DOOR_RECORD_BYTES,
      DOOR_RECORD_BYTES
    )
  };
  return { ...project, triggers: [...project.triggers, trigger] };
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
