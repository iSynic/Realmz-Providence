import { LibraryCatalog, Project, TriggerRecord } from "./types";
import { actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "./realmzActions";
import { isDirectMacroOpcode, resolveSignedMessageTarget, targetOptionForOpcodeValue, targetPickerConfig } from "./components/RealmzTargetPicker";
import { isCallableMacro } from "./semanticGraph";
import { missingEdcdTargetReferences } from "./edcdTargets";
import { edcdFieldNamesForShape } from "./realmzEdcd";
import { parameterLabelsForOpcode } from "./opcodeCrosswalk";
import { scriptParameterLabelForOpcode } from "./scriptActionLabels";
import { ed3DiagnosticForTrigger } from "./scriptDiagnostics";

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
  if (trigger.source !== "Data ED3" && !trigger.active) return diagnostics;
  const ed3Summary = trigger.source === "Data ED3" ? ed3DiagnosticForTrigger(project, trigger) : null;
  if (ed3Summary?.linterSeverity) {
    diagnostics.push(issue(
      ed3Summary.linterSeverity,
      trigger.id,
      `ed3-${ed3Summary.classification}`,
      ed3Summary.searchTitle,
      `${ed3Summary.detail} ${ed3Summary.promotionRule}`
    ));
  }
  if (trigger.source !== "Data ED3" && trigger.active) {
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
  if (trigger.source !== "Data ED3" && trigger.active && trigger.percent > 100) {
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
      diagnostics.push(slotIssue("warning", trigger.id, slot, "missing-settings", "Missing settings.", `${option.shortLabel} needs settings ${rowId}; create them before relying on this behavior.`));
    } else if (row.values.length !== 5 || row.values.some((value) => !Number.isFinite(value))) {
      diagnostics.push(slotIssue("error", trigger.id, slot, "malformed-settings", "Settings are malformed.", `Settings ${rowId} must contain five finite numeric values.`));
    } else {
      const fieldNames = edcdFieldNamesForShape(option.edcdShape);
      if (fieldNames) {
        const preservedIndexes = parameterLabelsForOpcode(rawCode).filter((label) => label.preserved).map((label) => label.index);
        for (const issue of missingEdcdTargetReferences(project, option.edcdShape, fieldNames, row.values, rawCode, preservedIndexes, catalog)) {
          const fieldLabel = parameterLabelForIssue(rawCode, issue.index, issue.field);
          diagnostics.push(slotIssue(
            "warning",
            trigger.id,
            slot,
            `missing-edcd-${issue.field}`,
            `Missing ${issue.targetLabel} target.`,
            `Settings ${rowId} field ${issue.index + 1} (${fieldLabel}) points at ${issue.targetLabel} ${issue.value}, but that target does not exist.`
          ));
        }
      }
    }
  }

  const config = targetPickerConfig(code);
  if (config && !option.edcdShape && id !== 0) {
    const resolvedId = resolveSignedMessageTarget(code, id);
    const selected = targetOptionForOpcodeValue(project, code, id, catalog);
    if (!selected) {
      const action = config.recordType ? "Choose or create" : "Choose or import";
      diagnostics.push(slotIssue("warning", trigger.id, slot, "unresolved-target", `${config.label} does not resolve to a known target.`, `${action} ${config.label.toLowerCase()} ${resolvedId}.`));
    }
  }
  diagnostics.push(...validateTargetRecord(project, trigger.id, slot, code, id));

  if (isDirectMacroOpcode(code) && id !== 0) {
    const macro = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === id);
    if (!macro) {
      diagnostics.push(slotIssue("error", trigger.id, slot, "dangling-macro", "Extra Action Point target is missing.", `No callable Extra Action Point ${id} exists.`));
    } else if (!isCallableMacro(project, macro)) {
      const summary = ed3DiagnosticForTrigger(project, macro);
      diagnostics.push(slotIssue("warning", trigger.id, slot, "unlinked-extra-action-target", "Extra Action Point is not linked from known scenario flow yet.", summary
        ? `Extra Action Point ${id} is classified as ${summary.linterLabel}: ${summary.detail} ${summary.promotionRule}`
        : `Extra Action Point ${id} exists, but Providence has not identified a normal call path for it yet.`));
    }
  }

  return diagnostics;
}

function validateTargetRecord(project: Project, triggerId: string, slot: number, code: number, id: number): ScriptDiagnostic[] {
  const resolvedId = resolveSignedMessageTarget(code, id);
  if (resolvedId < 0) return [];
  if (actionOptionFor(code).edcdShape) return [];
  if (code === 1) {
    const message = project.messages?.find((record) => record.id === resolvedId);
    if (message && message.text.length > 255) {
      return [slotIssue("error", triggerId, slot, "message-too-long", "Message text is too long.", `Message ${resolvedId} is ${message.text.length} characters; keep it at 255 classic-text bytes or fewer.`)];
    }
  }
  if (code === 2 || [48, 56, 107].includes(code)) {
    const battle = project.battles?.find((record) => record.id === resolvedId);
    if (battle && battle.grid.length !== 13 * 13) {
      return [slotIssue("error", triggerId, slot, "battle-grid-shape", "Battle grid is malformed.", `Battle ${resolvedId} must have 169 monster cells.`)];
    }
  }
  if (code === 10) {
    const treasure = project.treasures?.find((record) => record.id === resolvedId);
    if (treasure && treasure.itemIds.length > 20) {
      return [slotIssue("error", triggerId, slot, "treasure-item-count", "Treasure has too many item slots.", `Treasure ${resolvedId} has ${treasure.itemIds.length}; keep it to 20 item slots or fewer.`)];
    }
  }
  if ([6, 49, 51].includes(code)) {
    const shop = project.shops?.find((record) => record.id === resolvedId);
    if (shop && (shop.itemIds.length > 1000 || shop.quantities.length > 1000)) {
      return [slotIssue("error", triggerId, slot, "shop-slot-count", "Shop has too many stocked slots.", `Shop ${resolvedId} must stay within 1000 item and quantity slots.`)];
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
  return scriptParameterLabelForOpcode(opcode, index, fallback);
}
