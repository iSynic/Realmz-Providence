import { LibraryCatalog, Project, RealmzTargetRecordKind } from "./types";
import { actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "./realmzActions";
import { isDirectMacroOpcode, targetOptionsForOpcode, targetPickerConfig } from "./components/RealmzTargetPicker";
import { isCallableMacro } from "./semanticGraph";
import { missingEdcdTargetReferences } from "./edcdTargets";
import { edcdFieldNamesForShape } from "./realmzEdcd";

export type TargetRecordDiagnostic = {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  detail: string;
  slot?: number;
};

export function validateRealmzTargetRecord(project: Project, recordType: RealmzTargetRecordKind, recordId: number, catalog?: LibraryCatalog | null): TargetRecordDiagnostic[] {
  if (recordType === "message") {
    const record = project.messages?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    const bytes = asciiByteLength(record.text);
    if (bytes > 255) issues.push(recordIssue("error", recordType, recordId, "message-too-long", "Message text is too long for Data SD2.", `Message ${recordId} is ${bytes} byte(s); Realmz supports 255.`));
    if (hasNonAscii(record.text)) issues.push(recordIssue("warning", recordType, recordId, "message-non-ascii", "Message contains non-ASCII characters.", "Classic text records are byte-oriented; non-ASCII characters may export as fallback spaces or unsupported glyphs."));
    return issues;
  }
  if (recordType === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    if (record.grid.length !== 13 * 13) issues.push(recordIssue("error", recordType, recordId, "battle-grid-shape", "Battle grid is malformed.", `Battle ${recordId} has ${record.grid.length} cells; Realmz requires 169.`));
    issues.push(...validateI16Field(recordType, recordId, "Distance", record.dist));
    issues.push(...validateReference(project, recordType, recordId, "Before message", 1, record.messageBefore, undefined, catalog));
    issues.push(...validateReference(project, recordType, recordId, "After message", 1, record.messageAfter, undefined, catalog));
    issues.push(...validateReference(project, recordType, recordId, "Battle macro", 8, record.battleMacro, undefined, catalog));
    for (const [slot, monster] of record.grid.entries()) {
      if (!isI16(monster)) issues.push(recordIssue("error", recordType, recordId, `battle-monster-${slot}`, "Battle monster ID is outside Realmz integer range.", `Grid slot ${slot} has ${monster}.`));
    }
    return issues;
  }
  if (recordType === "treasure") {
    const record = project.treasures?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    if (record.itemIds.length > 20) issues.push(recordIssue("error", recordType, recordId, "treasure-item-count", "Treasure has too many item slots.", `Treasure ${recordId} has ${record.itemIds.length}; Realmz Data TD supports 20.`));
    for (const field of ["exp", "gold", "gems", "jewelry"] as const) issues.push(...validateI16Field(recordType, recordId, field, record[field]));
    for (const [slot, item] of record.itemIds.entries()) {
      if (!isI16(item)) issues.push(recordIssue("error", recordType, recordId, `treasure-item-${slot}`, "Treasure item ID is outside Realmz integer range.", `Item slot ${slot} has ${item}.`));
    }
    return issues;
  }
  if (recordType === "shop") {
    const record = project.shops?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    if (record.itemIds.length > 1000 || record.quantities.length > 1000) issues.push(recordIssue("error", recordType, recordId, "shop-slot-count", "Shop has too many stocked slots.", `Shop ${recordId} exceeds Realmz Data SD capacity of 1000 item and quantity slots.`));
    issues.push(...validateI16Field(recordType, recordId, "Inflation", record.inflation));
    for (const [slot, item] of record.itemIds.entries()) {
      if (!isI16(item)) issues.push(recordIssue("error", recordType, recordId, `shop-item-${slot}`, "Shop item ID is outside Realmz integer range.", `Item slot ${slot} has ${item}.`));
    }
    for (const [slot, qty] of record.quantities.entries()) {
      if (!Number.isInteger(qty) || qty < 0 || qty > 255) issues.push(recordIssue("error", recordType, recordId, `shop-qty-${slot}`, "Shop quantity is outside byte range.", `Quantity slot ${slot} has ${qty}; Realmz stores quantities as 0..255 bytes.`));
    }
    return issues;
  }
  if (recordType === "simpleEncounter" || recordType === "complexEncounter") {
    const record = recordType === "simpleEncounter"
      ? project.simpleEncounters?.find((candidate) => candidate.id === recordId)
      : project.complexEncounters?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    const maxTextBytes = recordType === "simpleEncounter" ? 79 : 39;
    for (const [slot, text] of record.texts.entries()) {
      const bytes = asciiByteLength(text);
      if (bytes > maxTextBytes) issues.push(slotIssue("error", recordType, recordId, slot, "encounter-text-too-long", "Encounter text is too long.", `Text ${slot} is ${bytes} byte(s); ${recordType === "simpleEncounter" ? "Data ED" : "Data ED2"} supports ${maxTextBytes} display byte(s) plus one length byte.`));
      if (hasNonAscii(text)) issues.push(slotIssue("warning", recordType, recordId, slot, "encounter-text-non-ascii", "Encounter text contains non-ASCII characters.", "Classic encounter text is byte-oriented; non-ASCII characters may not round-trip as intended."));
    }
    if (record.choiceResults.length > 4) issues.push(recordIssue("error", recordType, recordId, "choice-result-count", "Encounter has too many choice result rows.", "Realmz stores four choice result bytes."));
    const wordResults = recordType === "complexEncounter" ? (record as { wordResults?: unknown }).wordResults : undefined;
    if (Array.isArray(wordResults) && wordResults.length > 4) issues.push(recordIssue("error", recordType, recordId, "word-result-count", "Complex encounter has too many word result rows.", "Realmz stores four word result bytes."));
    issues.push(...validateReference(project, recordType, recordId, "Prompt message", 1, record.prompt, undefined, catalog));
    issues.push(...validateEncounterActions(project, recordType, recordId, record.actions, catalog));
    return issues;
  }
  return [];
}

function validateEncounterActions(project: Project, recordType: RealmzTargetRecordKind, recordId: number, actions: Array<{ slot: number; rawCode: number; id: number }>, catalog?: LibraryCatalog | null) {
  const issues: TargetRecordDiagnostic[] = [];
  const occupied = new Set<number>();
  for (const action of actions) {
    if (occupied.has(action.slot)) issues.push(slotIssue("error", recordType, recordId, action.slot, "duplicate-encounter-action", "Multiple encounter actions use the same row.", "Only one CODE/ID pair can be written to each encounter action row."));
    occupied.add(action.slot);
    if (action.slot < 0 || action.slot > 31) issues.push(slotIssue("error", recordType, recordId, action.slot, "encounter-action-slot", "Encounter action row is outside 0..31.", "Realmz encounter records provide 32 action CODE/ID rows."));
    if (action.rawCode < -128 || action.rawCode > 127) issues.push(slotIssue("error", recordType, recordId, action.slot, "encounter-code-range", "Encounter action CODE is outside signed-byte range.", `CODE ${action.rawCode} cannot be written to a Realmz encounter action row.`));
    if (!isI16(action.id)) issues.push(slotIssue("error", recordType, recordId, action.slot, "encounter-id-range", "Encounter action ID is outside Realmz integer range.", `ID ${action.id} cannot be written as a signed 16-bit value.`));
    const code = normalizeStepOpcode(action.rawCode);
    const option = actionOptionFor(action.rawCode);
    if (option.category === "Unknown") {
      issues.push(slotIssue("warning", recordType, recordId, action.slot, "unknown-opcode", "Providence does not fully support this opcode yet.", `CODE ${action.rawCode} will stay visible as raw Realmz data until this action is editable.`));
    } else if (isDispatcherNoopOpcode(action.rawCode)) {
      issues.push(slotIssue("info", recordType, recordId, action.slot, "dispatcher-noop", "Realmz ignores this CODE value.", `CODE ${action.rawCode} has no newland.c dispatcher case, so it is preserved as no-op data.`));
    }
    if (option.edcdShape) {
      const row = project.extracodes.find((candidate) => candidate.id === action.id);
      if (!row) {
        issues.push(slotIssue("warning", recordType, recordId, action.slot, "missing-edcd-row", "Encounter action expects an EDCD parameter row, but none is present.", `CODE ${action.rawCode} uses ${option.edcdShape}; create Data EDCD row ${action.id} before relying on this behavior.`));
      } else if (row.values.length !== 5 || row.values.some((value) => !Number.isFinite(value))) {
        issues.push(slotIssue("error", recordType, recordId, action.slot, "malformed-edcd-row", "Encounter action EDCD row is malformed.", `Data EDCD row ${action.id} must contain five finite numeric values.`));
      } else {
        const fieldNames = edcdFieldNamesForShape(option.edcdShape);
        if (fieldNames) {
          for (const issue of missingEdcdTargetReferences(project, option.edcdShape, fieldNames, row.values)) {
            issues.push(slotIssue(
              "warning",
              recordType,
              recordId,
              action.slot,
              `missing-edcd-${issue.field}`,
              `EDCD ${issue.field} target is missing.`,
              `Data EDCD row ${action.id} field ${issue.index} points at ${issue.targetLabel} ${issue.value}, but Providence cannot prove that target exists.`
            ));
          }
        }
      }
    }
    issues.push(...validateReference(project, recordType, recordId, `Action row ${action.slot}`, code, action.id, action.slot, catalog));
    if (isDirectMacroOpcode(code) && action.id !== 0) {
      const macro = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === action.id);
      if (!macro) issues.push(slotIssue("error", recordType, recordId, action.slot, "dangling-macro", "Macro/GOSUB target is missing.", `No callable Data ED3 macro ${action.id} exists.`));
      else if (!isCallableMacro(project, macro)) issues.push(slotIssue("warning", recordType, recordId, action.slot, "ed3-evidence-target", "Macro target is an imported ED3 row, not a callable macro.", `Data ED3 record ${action.id} is read-only until duplicated into an authored macro.`));
    }
  }
  return issues;
}

function validateReference(project: Project, recordType: RealmzTargetRecordKind, recordId: number, label: string, opcode: number, id: number, slot?: number, catalog?: LibraryCatalog | null) {
  if (id === 0) return [];
  const config = targetPickerConfig(opcode);
  if (!config) return [];
  const exists = targetOptionsForOpcode(project, opcode, catalog).some((target) => target.value === id);
  if (exists) return [];
  const detail = `ID ${id} is kept as-is, but Providence cannot find the referenced ${config.label.toLowerCase()}.`;
  return [slot == null
    ? recordIssue("warning", recordType, recordId, `${label}:unresolved-target`, `${label} does not resolve to a known target.`, detail)
    : slotIssue("warning", recordType, recordId, slot, "unresolved-target", `${label} does not resolve to a known target.`, detail)];
}

function validateI16Field(recordType: RealmzTargetRecordKind, recordId: number, label: string, value: number) {
  return isI16(value) ? [] : [recordIssue("error", recordType, recordId, `${label}:i16`, `${label} is outside Realmz integer range.`, `${value} cannot be written as a signed 16-bit value.`)];
}

function validateRecordId(recordType: RealmzTargetRecordKind, recordId: number) {
  if (Number.isInteger(recordId) && recordId >= 0 && recordId <= 9999) return [];
  return [recordIssue("warning", recordType, recordId, "record-id-range", "Record ID is unusually large or invalid.", "Realmz stores target record references as signed 16-bit IDs, and very large sparse IDs create huge fixed-record files.")];
}

function isI16(value: number) {
  return Number.isInteger(value) && value >= -32768 && value <= 32767;
}

function asciiByteLength(value: string) {
  return [...value].reduce((total, char) => total + (char.charCodeAt(0) <= 0x7f ? 1 : 2), 0);
}

function hasNonAscii(value: string) {
  return /[^\x00-\x7f]/.test(value);
}

function recordIssue(severity: TargetRecordDiagnostic["severity"], recordType: RealmzTargetRecordKind, recordId: number, code: string, message: string, detail: string): TargetRecordDiagnostic {
  return { id: `${recordType}:${recordId}:${code}`, severity, message, detail };
}

function slotIssue(severity: TargetRecordDiagnostic["severity"], recordType: RealmzTargetRecordKind, recordId: number, slot: number, code: string, message: string, detail: string): TargetRecordDiagnostic {
  return { id: `${recordType}:${recordId}:${slot}:${code}`, severity, slot, message, detail };
}
