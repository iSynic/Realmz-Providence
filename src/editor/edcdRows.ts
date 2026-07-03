import { Action, ExtraCodeRow, LibraryCatalog, Project, TriggerRecord } from "./types";
import { actionOptionFor, normalizeStepOpcode } from "./realmzActions";
import { edcdFieldNamesForShape } from "./realmzEdcd";
import { scriptActionDefinitionFor, scriptActionSummary } from "./panels/scripts/scriptActionCatalog";

export type EdcdRowStatus = "in-use" | "shared" | "unused" | "missing" | "conflict";

export type EdcdRowCaller = {
  contextKind: "trigger" | "simpleEncounter" | "complexEncounter";
  triggerId: string;
  triggerSource: string;
  triggerRecordIndex: number;
  triggerLevelType: string | null;
  triggerLevelIndex: number | null;
  triggerCoordinate: { x: number; y: number } | null;
  slot: number;
  rawCode: number;
  opcode: number;
  actionLabel: string;
  actionShortLabel: string;
  shape: string;
};

export type EdcdRowUsage = {
  rowId: number;
  row: ExtraCodeRow | null;
  exists: boolean;
  values: [number, number, number, number, number];
  callers: EdcdRowCaller[];
  possibleShapes: string[];
  primaryShape: string | null;
  primaryOpcode: number | null;
  primaryActionLabel: string | null;
  status: EdcdRowStatus;
  statusLabel: string;
  summary: string;
  warnings: string[];
};

export type EdcdRowFilter = "all" | EdcdRowStatus;

export function nextUnusedEdcdRowId(project: Project) {
  const extracodes = project.extracodes ?? [];
  const used = new Set(extracodes.map((row) => row.id));
  for (let id = 0; id < 32767; id += 1) {
    if (!used.has(id)) return id;
  }
  return extracodes.length;
}

export function normalizeEdcdValues(values?: readonly number[]): [number, number, number, number, number] {
  return [0, 0, 0, 0, 0].map((_, index) => Number(values?.[index] ?? 0)) as [number, number, number, number, number];
}

export function edcdRowIdForAction(action: Pick<Action, "id">) {
  return Math.max(0, Number(action.id ?? 0));
}

export function buildEdcdRowUsages(project: Project, catalog?: LibraryCatalog | null): EdcdRowUsage[] {
  const rows = new Map((project.extracodes ?? []).map((row) => [row.id, row]));
  const callersByRow = new Map<number, EdcdRowCaller[]>();

  for (const trigger of project.triggers ?? []) {
    for (const action of trigger.actions) {
      addCaller(callersByRow, action, {
        contextKind: "trigger",
        triggerId: trigger.id,
        triggerSource: trigger.source,
        triggerRecordIndex: trigger.recordIndex,
        triggerLevelType: trigger.levelType,
        triggerLevelIndex: trigger.levelIndex,
        triggerCoordinate: trigger.coordinate
      });
    }
  }

  for (const encounter of project.simpleEncounters ?? []) {
    for (const action of encounter.actions) {
      addCaller(callersByRow, action, {
        contextKind: "simpleEncounter",
        triggerId: `encounter:simple:${encounter.id}`,
        triggerSource: "Data ED",
        triggerRecordIndex: encounter.id,
        triggerLevelType: null,
        triggerLevelIndex: null,
        triggerCoordinate: null
      });
    }
  }

  for (const encounter of project.complexEncounters ?? []) {
    for (const action of encounter.actions) {
      addCaller(callersByRow, action, {
        contextKind: "complexEncounter",
        triggerId: `encounter:complex:${encounter.id}`,
        triggerSource: "Data ED2",
        triggerRecordIndex: encounter.id,
        triggerLevelType: null,
        triggerLevelIndex: null,
        triggerCoordinate: null
      });
    }
  }

  const ids = new Set<number>([...rows.keys(), ...callersByRow.keys()]);
  return [...ids].sort((a, b) => a - b).map((rowId) => buildEdcdRowUsage(project, catalog, rowId, rows.get(rowId) ?? null, callersByRow.get(rowId) ?? []));
}

function addCaller(
  callersByRow: Map<number, EdcdRowCaller[]>,
  action: Pick<Action, "slot" | "rawCode" | "id">,
  context: Omit<EdcdRowCaller, "slot" | "rawCode" | "opcode" | "actionLabel" | "actionShortLabel" | "shape">
) {
  const option = actionOptionFor(action.rawCode);
  if (!option.edcdShape) return;
  const rowId = edcdRowIdForAction(action);
  const definition = scriptActionDefinitionFor(action.rawCode);
  const caller: EdcdRowCaller = {
    ...context,
    slot: action.slot,
    rawCode: action.rawCode,
    opcode: normalizeStepOpcode(action.rawCode),
    actionLabel: definition.label,
    actionShortLabel: definition.shortLabel,
    shape: option.edcdShape
  };
  const existing = callersByRow.get(rowId) ?? [];
  existing.push(caller);
  callersByRow.set(rowId, existing);
}

export function edcdUsageForRow(project: Project, catalog: LibraryCatalog | null | undefined, rowId: number) {
  return buildEdcdRowUsages(project, catalog).find((usage) => usage.rowId === rowId) ?? null;
}

export function edcdUsageForAction(project: Project, catalog: LibraryCatalog | null | undefined, rawCode: number, rowId: number): EdcdRowUsage | null {
  const option = actionOptionFor(rawCode);
  if (!option.edcdShape) return null;
  const row = (project.extracodes ?? []).find((candidate) => candidate.id === rowId) ?? null;
  const definition = scriptActionDefinitionFor(rawCode);
  const values = normalizeEdcdValues(row?.values ?? definition.defaultDraft.parameters);
  const status: EdcdRowStatus = row ? "in-use" : "missing";
  return {
    rowId,
    row,
    exists: Boolean(row),
    values,
    callers: [],
    possibleShapes: [option.edcdShape],
    primaryShape: option.edcdShape,
    primaryOpcode: rawCode,
    primaryActionLabel: definition.label,
    status,
    statusLabel: labelForStatus(status),
    summary: scriptActionSummary(project, catalog, { rawCode, id: rowId, parameters: values }, ""),
    warnings: row ? [] : [`An action step uses Settings #${rowId}, but those settings are missing.`]
  };
}

export function edcdUsageMatchesFilter(usage: EdcdRowUsage, filter: EdcdRowFilter) {
  return filter === "all" || usage.status === filter;
}

export function edcdUsageStatusTone(status: EdcdRowStatus) {
  if (status === "missing" || status === "conflict") return "danger";
  if (status === "shared" || status === "unused") return "warning";
  return "ok";
}

function buildEdcdRowUsage(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  rowId: number,
  row: ExtraCodeRow | null,
  callers: EdcdRowCaller[]
): EdcdRowUsage {
  const possibleShapes = unique(callers.map((caller) => caller.shape).filter(Boolean)).sort();
  const primaryCaller = callers[0] ?? null;
  const primaryShape = possibleShapes.length === 1 ? possibleShapes[0] : primaryCaller?.shape ?? null;
  const primaryOpcode = primaryCaller?.rawCode ?? null;
  const primaryActionLabel = primaryCaller?.actionLabel ?? null;
  const fallbackValues = primaryOpcode == null ? undefined : scriptActionDefinitionFor(primaryOpcode).defaultDraft.parameters;
  const values = normalizeEdcdValues(row?.values ?? fallbackValues);
  const status = statusFor(row, callers, possibleShapes);
  const warnings = warningsFor(status, rowId, callers, possibleShapes);
  return {
    rowId,
    row,
    exists: Boolean(row),
    values,
    callers,
    possibleShapes,
    primaryShape,
    primaryOpcode,
    primaryActionLabel,
    status,
    statusLabel: labelForStatus(status),
    summary: summaryForUsage(project, catalog, rowId, primaryOpcode, values, row, callers, status),
    warnings
  };
}

function statusFor(row: ExtraCodeRow | null, callers: EdcdRowCaller[], possibleShapes: string[]): EdcdRowStatus {
  if (!row && callers.length > 0) return "missing";
  if (possibleShapes.length > 1) return "conflict";
  if (callers.length > 1) return "shared";
  if (callers.length === 0) return "unused";
  return "in-use";
}

function labelForStatus(status: EdcdRowStatus) {
  if (status === "in-use") return "In Use";
  if (status === "shared") return "Shared";
  if (status === "unused") return "Unused";
  if (status === "missing") return "Missing";
  return "Shape Conflict";
}

function summaryForUsage(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  rowId: number,
  primaryOpcode: number | null,
  values: [number, number, number, number, number],
  row: ExtraCodeRow | null,
  callers: EdcdRowCaller[],
  status: EdcdRowStatus
) {
  if (primaryOpcode != null) {
    return scriptActionSummary(project, catalog, { rawCode: primaryOpcode, id: rowId, parameters: values }, "");
  }
  if (status === "unused" && row) return `Unused Settings #${rowId}: ${values.join(", ")}`;
  if (status === "missing") return `Referenced by an action step, but Settings #${rowId} do not exist yet.`;
  if (callers.length > 0) return `${callers[0].actionShortLabel}: Settings #${rowId}`;
  return `Settings #${rowId}`;
}

function warningsFor(status: EdcdRowStatus, rowId: number, callers: EdcdRowCaller[], possibleShapes: string[]) {
  if (status === "missing") return [`An action step uses Settings #${rowId}, but those settings are missing.`];
  if (status === "conflict") return [`Settings #${rowId} are used by different action types: ${possibleShapes.join(", ")}.`];
  if (status === "shared") return [`Settings #${rowId} are shared by ${callers.length} steps. Editing them changes every caller.`];
  if (status === "unused") return [`Settings #${rowId} are not used by any current script step.`];
  return [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

export function edcdUsageToEditorUsage(usage: EdcdRowUsage, fallbackShape?: string | null) {
  const shape = usage.primaryShape ?? fallbackShape ?? undefined;
  const values = normalizeEdcdValues(usage.values);
  return {
    rowId: usage.rowId,
    shape,
    opcode: usage.primaryOpcode ?? undefined,
    fields: shape
      ? (edcdFieldNamesForShape(shape) ?? ["param0", "param1", "param2", "param3", "param4"]).map((name, index) => ({ name, value: values[index] ?? 0 }))
      : undefined,
    diagnostics: usage.warnings,
    summary: usage.summary
  };
}
