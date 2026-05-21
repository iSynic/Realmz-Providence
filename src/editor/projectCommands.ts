import { Action, ExtraCodeRow, PaintCellChange, Project, ProjectCommand, TriggerRecord } from "./types";

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
    actions: []
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
    actions: []
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
    const row: ExtraCodeRow = { id: rowId, values: normalized };
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
  const code = normalizeOpcode(rawCode);
  const [label, category] = opcodeInfo(code);
  return {
    slot,
    rawCode,
    code,
    id,
    label,
    category,
    gosub: rawCode < 0 && rawCode !== -14 && rawCode !== -23
  };
}

function normalizeOpcode(code: number) {
  if (code < 0 && code !== -14 && code !== -23) return -code;
  return code;
}

function opcodeInfo(code: number): [string, string] {
  const labels: Record<number, [string, string]> = {
    1: ["Text", "ui_text"],
    2: ["Battle", "combat"],
    3: ["Choice", "branch"],
    4: ["Simple encounter", "encounter"],
    5: ["Complex encounter", "encounter"],
    6: ["Load shop", "item_shop"],
    9: ["Play sound", "ui_text"],
    10: ["Give treasure", "item_shop"],
    12: ["New land icon", "map"],
    13: ["Enable or disable door", "map"],
    20: ["Teleport", "map"],
    23: ["Alter land random rectangle", "map"],
    24: ["Keep codes", "branch"],
    27: ["Show picture", "ui_text"],
    29: ["Give or display map", "map"],
    39: ["Extend door codes", "branch"],
    46: ["Branch quest flag", "branch"],
    47: ["Set quest flag", "state"],
    54: ["Alter time encounter", "time"],
    57: ["Change land look", "map"],
    73: ["Restricted shop", "item_shop"],
    76: ["Quest value write", "state"],
    77: ["Branch quest value", "branch"],
    84: ["Check registration", "registration"],
    98: ["Registration check", "registration"],
    99: ["Registration check", "registration"],
    104: ["Set encounter status", "encounter"],
    111: ["Return from GOSUB", "branch"],
    112: ["Pop stack", "branch"],
    126: ["Battle macro", "combat"]
  };
  if (code === -14) return ["Pick inverse characters", "state"];
  if (code === -23) return ["Alter dungeon random rectangle", "map"];
  return labels[code] ?? [`Opcode ${code}`, "unknown"];
}
