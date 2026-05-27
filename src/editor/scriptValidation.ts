import { LibraryCatalog, Project, TriggerRecord } from "./types";
import { actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "./realmzActions";
import { isDirectMacroOpcode, targetOptionsForOpcode, targetPickerConfig } from "./components/RealmzTargetPicker";
import { isCallableMacro } from "./semanticGraph";
import { missingEdcdTargetReferences } from "./edcdTargets";
import { edcdFieldNamesForShape } from "./realmzEdcd";

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
      diagnostics.push(issue("error", trigger.id, "missing-coordinate", "Action Point has no valid map coordinate.", "Realmz action points need a packed door coordinate inside a land or dungeon level."));
    } else if (!inRealmzMapBounds(coordinate.x) || !inRealmzMapBounds(coordinate.y)) {
      diagnostics.push(issue("error", trigger.id, "invalid-coordinate", "Action Point coordinate is outside the 90 x 90 Realmz map.", `${coordinate.x}, ${coordinate.y} cannot be exported as a valid Realmz cell.`));
    }
    if (trigger.doorid <= 0) {
      diagnostics.push(issue("warning", trigger.id, "ambiguous-door-id", "Action Point has a non-positive packed door id.", "Providence preserves the coordinate, but Realmz door files normally need a positive packed door id to reload the point unambiguously."));
    }
  }
  if (trigger.percent < 0 || trigger.percent > 100) {
    diagnostics.push(issue("warning", trigger.id, "chance-range", "Chance is outside the usual 0..100 range.", `Current chance is ${trigger.percent}; confirm this is intentional before export.`));
  }

  const occupiedSlots = new Set<number>();
  for (const action of trigger.actions) {
    if (occupiedSlots.has(action.slot)) {
      diagnostics.push(slotIssue("error", trigger.id, action.slot, "duplicate-slot", "Multiple actions use the same slot.", "Only one CODE/ID pair can be written to a Realmz slot."));
    }
    occupiedSlots.add(action.slot);
    if (action.slot < 0 || action.slot > 7) {
      diagnostics.push(slotIssue("error", trigger.id, action.slot, "slot-range", "Action slot is outside 0..7.", "Realmz door records contain exactly eight CODE/ID slots."));
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
      diagnostics.push(slotIssue("warning", trigger.id, slot, "unknown-opcode", "Providence does not fully support this opcode yet.", `CODE ${rawCode} will stay visible as raw Realmz data until this action is editable.`));
  } else if (isDispatcherNoopOpcode(rawCode)) {
    diagnostics.push(slotIssue("info", trigger.id, slot, "dispatcher-noop", "Realmz ignores this CODE value.", `CODE ${rawCode} has no newland.c dispatcher case, so it is preserved as no-op data.`));
  }

  if (option.edcdShape) {
    const rowId = Math.max(0, id);
    const row = project.extracodes.find((candidate) => candidate.id === rowId);
    if (!row) {
      diagnostics.push(slotIssue("warning", trigger.id, slot, "missing-edcd-row", "This action expects an EDCD parameter row, but none is present.", `${option.shortLabel} uses ${option.edcdShape}; create Data EDCD row ${rowId} before relying on this behavior.`));
    } else if (row.values.length !== 5 || row.values.some((value) => !Number.isFinite(value))) {
      diagnostics.push(slotIssue("error", trigger.id, slot, "malformed-edcd-row", "The attached EDCD row is malformed.", `Data EDCD row ${rowId} must contain five finite numeric values.`));
    } else {
      const fieldNames = edcdFieldNamesForShape(option.edcdShape);
      if (fieldNames) {
        for (const issue of missingEdcdTargetReferences(project, option.edcdShape, fieldNames, row.values)) {
          diagnostics.push(slotIssue(
            "warning",
            trigger.id,
            slot,
            `missing-edcd-${issue.field}`,
            `EDCD ${issue.field} target is missing.`,
            `Data EDCD row ${rowId} field ${issue.index} points at ${issue.targetLabel} ${issue.value}, but Providence cannot prove that target exists.`
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
      diagnostics.push(slotIssue("warning", trigger.id, slot, "unresolved-target", `${config.label} does not resolve to a known target.`, `ID ${id} is kept as-is, but Providence cannot find the referenced ${config.label.toLowerCase()}.`));
    }
  }
  diagnostics.push(...validateTargetRecord(project, trigger.id, slot, code, id));

  if (isDirectMacroOpcode(code) && id !== 0) {
    const macro = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === id);
    if (!macro) {
      diagnostics.push(slotIssue("error", trigger.id, slot, "dangling-macro", "Macro/GOSUB target is missing.", `No Data ED3 macro with record index ${id} exists.`));
    } else if (!isCallableMacro(project, macro)) {
      diagnostics.push(slotIssue("warning", trigger.id, slot, "ed3-evidence-target", "Macro target is an imported ED3 row, not a callable macro.", `Data ED3 record ${id} is read-only until it is duplicated into an authored macro.`));
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
      return [slotIssue("error", triggerId, slot, "message-too-long", "Message text is too long for Data SD2.", `Message ${id} is ${message.text.length} characters; Realmz Data SD2 supports 255 bytes.`)];
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
      return [slotIssue("error", triggerId, slot, "treasure-item-count", "Treasure has too many item slots.", `Treasure ${id} has ${treasure.itemIds.length}; Realmz Data TD supports 20.`)];
    }
  }
  if ([6, 49, 51].includes(code)) {
    const shop = project.shops?.find((record) => record.id === id);
    if (shop && (shop.itemIds.length > 1000 || shop.quantities.length > 1000)) {
      return [slotIssue("error", triggerId, slot, "shop-slot-count", "Shop has too many stocked slots.", `Shop ${id} exceeds Realmz Data SD capacity.`)];
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
