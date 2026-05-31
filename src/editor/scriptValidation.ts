import { LibraryCatalog, Project, TriggerRecord } from "./types";
import { actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "./realmzActions";
import { isDirectMacroOpcode, targetOptionsForOpcode, targetPickerConfig } from "./components/RealmzTargetPicker";
import { isCallableMacro } from "./semanticGraph";
import { missingEdcdTargetReferences } from "./edcdTargets";
import { edcdFieldNamesForShape } from "./realmzEdcd";
import { parameterLabelsForOpcode } from "./opcodeCrosswalk";

export type ScriptDiagnosticSeverity = "error" | "warning" | "info";

export type ScriptDiagnostic = {
  id: string;
  severity: ScriptDiagnosticSeverity;
  message: string;
  detail: string;
  slot?: number;
};

export function validateScriptTrigger(project: Project, trigger: TriggerRecord, catalog?: LibraryCatalog | null): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = [];
  if (trigger.source !== "Data ED3") {
    const coordinate = trigger.coordinate;
    if (!coordinate) {
      diagnostics.push(issue("error", trigger.id, "missing-coordinate", "Action Point needs a map cell.", "Choose the land or dungeon cell that should trigger this Action Point."));
    } else if (!inRealmzMapBounds(coordinate.x) || !inRealmzMapBounds(coordinate.y)) {
      diagnostics.push(issue("error", trigger.id, "invalid-coordinate", "Action Point cell is outside the 90 x 90 map.", `${coordinate.x}, ${coordinate.y} cannot be exported as a valid map cell.`));
    }
    if (trigger.doorid <= 0) {
      diagnostics.push(issue("warning", trigger.id, "ambiguous-door-id", "Action Point location needs a positive trigger value.", "Move or recreate this Action Point if it does not reload on the intended map cell."));
    }
  }
  if (trigger.percent < 0 || trigger.percent > 100) {
    diagnostics.push(issue("warning", trigger.id, "chance-range", "Chance is outside the usual 0..100 range.", `Current chance is ${trigger.percent}; confirm this is intentional before export.`));
  }

  const occupiedSlots = new Set<number>();
  for (const action of trigger.actions) {
    if (occupiedSlots.has(action.slot)) {
      diagnostics.push(slotIssue("error", trigger.id, action.slot, "duplicate-slot", "Multiple steps use the same position.", "Move or clear one of the duplicate steps."));
    }
    occupiedSlots.add(action.slot);
    if (action.slot < 0 || action.slot > 7) {
      diagnostics.push(slotIssue("error", trigger.id, action.slot, "slot-range", "Step position is outside the 8-step script.", "Move this step into positions 1 through 8."));
    }
    diagnostics.push(...validateAction(project, trigger, action.slot, action.rawCode, action.id, catalog));
  }
  return diagnostics;
}

export function validateActionDraft(project: Project, trigger: TriggerRecord, slot: number, rawCode: number, id: number, catalog?: LibraryCatalog | null): ScriptDiagnostic[] {
  return validateAction(project, trigger, slot, rawCode, id, catalog);
}

function validateAction(project: Project, trigger: TriggerRecord, slot: number, rawCode: number, id: number, catalog?: LibraryCatalog | null): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = [];
  const code = normalizeStepOpcode(rawCode);
  const option = actionOptionFor(rawCode);
  if (option.category === "Unknown") {
      diagnostics.push(slotIssue("warning", trigger.id, slot, "unknown-opcode", "This advanced action is not editable yet.", "It will stay with the scenario, but use Advanced Details before changing it."));
  } else if (isDispatcherNoopOpcode(rawCode)) {
    diagnostics.push(slotIssue("info", trigger.id, slot, "dispatcher-noop", "This step has no in-game effect.", "It can be cleared unless you intentionally keep it for compatibility."));
  }

  if (option.edcdShape) {
    const rowId = Math.max(0, id);
    const row = project.extracodes.find((candidate) => candidate.id === rowId);
    if (!row) {
      diagnostics.push(slotIssue("warning", trigger.id, slot, "missing-edcd-row", "Missing settings row.", `${option.shortLabel} needs settings row ${rowId}; create it before relying on this behavior.`));
    } else if (row.values.length !== 5 || row.values.some((value) => !Number.isFinite(value))) {
      diagnostics.push(slotIssue("error", trigger.id, slot, "malformed-edcd-row", "Settings row is malformed.", `Settings row ${rowId} must contain five finite numeric values.`));
    } else {
      const fieldNames = edcdFieldNamesForShape(option.edcdShape);
      if (fieldNames) {
        const preservedIndexes = parameterLabelsForOpcode(rawCode).filter((label) => label.preserved).map((label) => label.index);
        for (const issue of missingEdcdTargetReferences(project, option.edcdShape, fieldNames, row.values, rawCode, preservedIndexes)) {
          const fieldLabel = parameterLabelForIssue(rawCode, issue.index, issue.field);
          diagnostics.push(slotIssue(
            "warning",
            trigger.id,
            slot,
            `missing-edcd-${issue.field}`,
            `Missing ${fieldLabel.toLowerCase()} target.`,
            `Settings row ${rowId} field ${issue.index + 1} (${fieldLabel}) points at ${issue.targetLabel} ${issue.value}, but that target does not exist.`
          ));
        }
      }
    }
  }

  const config = targetPickerConfig(code);
  if (config && !option.edcdShape && id !== 0) {
    const targets = targetOptionsForOpcode(project, code, catalog);
    const selected = targets.find((target) => target.value === id);
    if (!selected) {
      diagnostics.push(slotIssue("warning", trigger.id, slot, "unresolved-target", `${config.label} does not resolve to a known target.`, `Choose or create ${config.label.toLowerCase()} ${id}.`));
    }
  }
  diagnostics.push(...validateTargetRecord(project, trigger.id, slot, code, id));

  if (isDirectMacroOpcode(code) && id !== 0) {
    const macro = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === id);
    if (!macro) {
      diagnostics.push(slotIssue("error", trigger.id, slot, "dangling-macro", "Extra Action Point target is missing.", `No callable Extra Action Point ${id} exists.`));
    } else if (!isCallableMacro(project, macro)) {
      diagnostics.push(slotIssue("warning", trigger.id, slot, "ed3-evidence-target", "Target is an advanced imported action.", `Extra Action Point ${id} is available in Advanced Imports.`));
    }
  }

  return diagnostics;
}

function validateTargetRecord(project: Project, triggerId: string, slot: number, code: number, id: number): ScriptDiagnostic[] {
  if (id < 0) return [];
  if (actionOptionFor(code).edcdShape) return [];
  if ([1, 19, 62, 71].includes(code)) {
    const message = project.messages?.find((record) => record.id === id);
    if (message && message.text.length > 255) {
      return [slotIssue("error", triggerId, slot, "message-too-long", "Message text is too long.", `Message ${id} is ${message.text.length} characters; keep it at 255 classic-text bytes or fewer.`)];
    }
  }
  if (code === 2 || [48, 56, 107].includes(code)) {
    const battle = project.battles?.find((record) => record.id === id);
    if (battle && battle.grid.length !== 13 * 13) {
      return [slotIssue("error", triggerId, slot, "battle-grid-shape", "Battle grid is malformed.", `Battle ${id} must have 169 monster cells.`)];
    }
  }
  if (code === 10) {
    const treasure = project.treasures?.find((record) => record.id === id);
    if (treasure && treasure.itemIds.length > 20) {
      return [slotIssue("error", triggerId, slot, "treasure-item-count", "Treasure has too many item slots.", `Treasure ${id} has ${treasure.itemIds.length}; keep it to 20 item slots or fewer.`)];
    }
  }
  if ([6, 49, 51].includes(code)) {
    const shop = project.shops?.find((record) => record.id === id);
    if (shop && (shop.itemIds.length > 1000 || shop.quantities.length > 1000)) {
      return [slotIssue("error", triggerId, slot, "shop-slot-count", "Shop has too many stocked slots.", `Shop ${id} must stay within 1000 item and quantity slots.`)];
    }
  }
  return [];
}

function inRealmzMapBounds(value: number) {
  return Number.isInteger(value) && value >= 0 && value < 90;
}

function issue(severity: ScriptDiagnosticSeverity, triggerId: string, code: string, message: string, detail: string): ScriptDiagnostic {
  return { id: `${triggerId}:${code}`, severity, message, detail };
}

function slotIssue(severity: ScriptDiagnosticSeverity, triggerId: string, slot: number, code: string, message: string, detail: string): ScriptDiagnostic {
  return { id: `${triggerId}:${slot}:${code}`, severity, slot, message, detail };
}

function parameterLabelForIssue(opcode: number, index: number, fallback: string) {
  return parameterLabelsForOpcode(opcode).find((label) => label.index === index)?.label ?? humanizeParameterName(fallback);
}

function humanizeParameterName(name: string) {
  return String(name || "parameter")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\bmessage\b/i, "String")
    .replace(/\bmacro\b/i, "Extra Action Point")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
