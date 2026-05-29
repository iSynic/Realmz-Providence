import { LibraryCatalog, Project, RealmzTargetRecordKind } from "./types";
import { actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "./realmzActions";
import { isDirectMacroOpcode, targetOptionsForOpcode, targetPickerConfig } from "./components/RealmzTargetPicker";
import { isCallableMacro } from "./semanticGraph";
import { missingEdcdTargetReferences } from "./edcdTargets";
import { edcdFieldNamesForShape } from "./realmzEdcd";
import { parameterLabelsForOpcode } from "./opcodeCrosswalk";

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
    const placedMonsters = record.grid.filter((monster) => monster !== 0).length;
    if (placedMonsters === 0) issues.push(recordIssue("warning", recordType, recordId, "battle-empty", "Battle has no monsters placed.", "Place at least one monster unless this is an intentionally empty battle shell."));
    if (placedMonsters > 100) issues.push(recordIssue("warning", recordType, recordId, "battle-monster-cap", "Battle places more than 100 monsters.", `Divinity's Battle Editor documents a 100-monster practical limit; this battle places ${placedMonsters}.`));
    if (record.authored && (record.dist < 1 || record.dist > 30)) {
      issues.push(recordIssue("warning", recordType, recordId, "battle-distance-range", "Battle distance is outside Divinity's usual 1-30 range.", `Distance is ${record.dist}; use 1-30 for normal random placement distance.`));
    }
    issues.push(...validateI16Field(recordType, recordId, "Distance", record.dist));
    issues.push(...validateReference(project, recordType, recordId, "Before message", 1, record.messageBefore, undefined, catalog));
    issues.push(...validateReference(project, recordType, recordId, "After message", 1, record.messageAfter, undefined, catalog));
    issues.push(...validateReference(project, recordType, recordId, "Battle macro", 8, record.battleMacro, undefined, catalog));
    for (const [slot, monster] of record.grid.entries()) {
      if (!isI16(monster)) issues.push(recordIssue("error", recordType, recordId, `battle-monster-${slot}`, "Battle monster ID is outside Realmz integer range.", `Grid slot ${slot} has ${monster}.`));
      else if (monster !== 0 && !(project.monsters ?? []).some((candidate) => candidate.id === Math.abs(monster))) {
        issues.push(recordIssue("warning", recordType, recordId, `battle-monster-missing-${slot}`, "Battle grid points at a missing monster.", `Grid slot ${slot} uses monster ${Math.abs(monster)}, but no matching monster record is editable in this project.`));
      }
    }
    return issues;
  }
  if (recordType === "monster") {
    const record = project.monsters?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    for (const field of ["weapon", "iconId", "spellPoints", "exp", "stamina", "staminaMax", "deathMacro", "maxSpellPoints"] as const) {
      issues.push(...validateI16Field(recordType, recordId, field, record[field]));
    }
    if (record.hitDice === 255) {
      issues.push(recordIssue("warning", recordType, recordId, "monster-hit-dice-terminator", "Stamina Level 255 stops the Bestiary list.", "Use this only when you intentionally want Realmz to stop scanning monsters for the Bestiary at this record."));
    }
    if (record.hitDice !== 0 && !(record.displayName ?? "").trim()) {
      issues.push(recordIssue("warning", recordType, recordId, "monster-empty-name", "Active monster has no name.", "Give this monster a display name unless it is a hidden placeholder."));
    }
    if (record.hitDice !== 0 && (record.attackCount < 1 || record.attackCount > 5)) {
      issues.push(recordIssue("warning", recordType, recordId, "monster-attack-range", "No. of Attacks is outside Divinity's 1..5 range.", `Current attack count is ${record.attackCount}.`));
    }
    if (record.size < 0 || record.size > 3) {
      issues.push(recordIssue("warning", recordType, recordId, "monster-size-range", "Monster size is outside Divinity's 0..3 range.", "Use 0 one-hex, 1 tall, 2 wide, or 3 large unless preserving imported data."));
    }
    if ((record.magicAttackCount > 0 || record.castPercent > 0 || record.spells.some(Boolean)) && !record.typeFlags?.[0]) {
      issues.push(recordIssue("warning", recordType, recordId, "monster-magic-trait", "Spellcasting monster is not marked Magic Using.", "Realmz checks the Magic Using trait before the creature can cast spells."));
    }
    for (const [slot, value] of [
      ["Hit dice", record.hitDice],
      ["Stamina bonus", record.staminaBonus],
      ["Agility", record.agility],
      ["Movement", record.movementMax],
      ["Armor", record.armor],
      ["Magic resistance", record.magicResistance],
      ["Attack count", record.attackCount],
      ["Magic attack count", record.magicAttackCount],
      ["Cast percent", record.castPercent],
      ["Run percent", record.runPercent],
      ["Surrender percent", record.surrenderPercent],
      ["Missile percent", record.missilePercent]
    ] as const) {
      if (!Number.isInteger(value) || value < -128 || value > 255) {
        issues.push(recordIssue("warning", recordType, recordId, `${slot}:byte-range`, `${slot} is outside the usual byte range.`, `${value} will be preserved or written as a Realmz byte-style field; keep values small unless this is intentional.`));
      }
    }
    for (const [label, value] of [
      ["Cast spell %", record.castPercent],
      ["Run away %", record.runPercent],
      ["Surrender %", record.surrenderPercent],
      ["Use missile %", record.missilePercent]
    ] as const) {
      if (value < 0 || value > 100) {
        issues.push(recordIssue("warning", recordType, recordId, `${label}:percent-range`, `${label} is outside 0..100.`, `Current value is ${value}; Divinity treats these as percentages.`));
      }
    }
    if ((record.displayName ?? "").length > 39) {
      issues.push(recordIssue("warning", recordType, recordId, "monster-name-length", "Monster name may be too long.", "Realmz stores monster names in a fixed 40-byte field."));
    }
    if (record.typeFlags.length > 8) issues.push(recordIssue("error", recordType, recordId, "monster-trait-count", "Monster has too many trait flags.", "Realmz stores eight physical trait bytes."));
    if (record.attacks.length > 5) issues.push(recordIssue("error", recordType, recordId, "monster-attack-count", "Monster has too many attack rows.", "Realmz stores five attack rows."));
    if (record.items.length > 6) issues.push(recordIssue("error", recordType, recordId, "monster-item-count", "Monster has too many item slots.", "Realmz stores six item references."));
    if (record.spells.length > 10) issues.push(recordIssue("error", recordType, recordId, "monster-spell-count", "Monster has too many spell slots.", "Realmz stores ten spell references."));
    for (const [slot, item] of record.items.entries()) {
      issues.push(...validateI16Field(recordType, recordId, `Item ${slot + 1}`, item));
    }
    for (const [slot, spell] of record.spells.entries()) {
      issues.push(...validateI16Field(recordType, recordId, `Spell ${slot + 1}`, spell));
    }
    for (const [slot, money] of record.money.entries()) {
      issues.push(...validateI16Field(recordType, recordId, `Treasure ${slot + 1}`, money));
    }
    for (const [slot, row] of record.attacks.entries()) {
      if (row.length > 4) issues.push(recordIssue("error", recordType, recordId, `monster-attack-row-${slot}`, "Monster attack row has too many fields.", "Realmz stores four values per attack row."));
    }
    if (record.deathMacro !== 0) issues.push(...validateReference(project, recordType, recordId, "Monster macro", 8, record.deathMacro, undefined, catalog));
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
  if (recordType === "timedEncounter") {
    const record = project.timedEncounters?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    for (const field of ["day", "increment", "percent", "door", "requiredLevel", "requiredRandomRect", "requiredX", "requiredY", "requiredItem", "requiredQuest"] as const) {
      issues.push(...validateI16Field(recordType, recordId, field, record[field]));
    }
    if (record.percent < 0 || record.percent > 100) {
      issues.push(recordIssue("warning", recordType, recordId, "timed-percent-range", "Timed encounter chance is outside 0..100%.", "Realmz normally treats this as a percentage chance; preserve imported values only when you know they are intentional."));
    }
    if (!["any", "land", "dungeon"].includes(record.locationKind)) {
      issues.push(recordIssue("error", recordType, recordId, "timed-location-kind", "Timed encounter location requirement is invalid.", "Choose Any, Land, or Dungeon."));
    }
    if (record.stuff.length > 10) {
      issues.push(recordIssue("error", recordType, recordId, "timed-extra-field-count", "Timed encounter has too many extra fields.", "Data TD3 stores exactly ten extra signed-short fields."));
    }
    issues.push(...validateReference(project, recordType, recordId, "Extra Action Point", 8, record.door, undefined, catalog));
    if (record.requiredQuest >= 0 && record.requiredQuest > 9999) {
      issues.push(recordIssue("warning", recordType, recordId, "timed-quest-range", "Required quest ID is unusually high.", "Use -1 when no quest is required."));
    }
    return issues;
  }
  if (recordType === "thiefEncounter") {
    const record = project.thiefEncounters?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    if (record.typeFlags.length > 10) issues.push(recordIssue("error", recordType, recordId, "rogue-flag-count", "Rogue encounter has too many state flags.", "Data TD2 stores ten state flags."));
    for (const [label, values, max] of [
      ["modifiers", record.modifiers, 8],
      ["success result codes", record.successCodes, 8],
      ["failure result codes", record.failureCodes, 8],
      ["success messages", record.successText, 8],
      ["failure messages", record.failureText, 8],
      ["success sounds", record.successSounds, 8],
      ["failure sounds", record.failureSounds, 8],
      ["prompt/support fields", record.prompts, 3],
      ["prompt sounds", record.promptSounds, 3]
    ] as const) {
      if (values.length > max) issues.push(recordIssue("error", recordType, recordId, `rogue-${label.replace(/\W+/g, "-")}`, `Rogue encounter has too many ${label}.`, `Data TD2 stores ${max} ${label}.`));
      for (const [slot, value] of values.entries()) {
        if (!isI16(value)) issues.push(recordIssue("error", recordType, recordId, `rogue-${label}-${slot}`, "Rogue encounter value is outside Realmz integer range.", `${label} slot ${slot} has ${value}.`));
      }
    }
    for (const [slot, message] of record.successText.entries()) issues.push(...validateReference(project, recordType, recordId, `Success message ${slot}`, 1, message, undefined, catalog));
    for (const [slot, message] of record.failureText.entries()) issues.push(...validateReference(project, recordType, recordId, `Failure message ${slot}`, 1, message, undefined, catalog));
    if (record.prompts[0]) issues.push(...validateReference(project, recordType, recordId, "Prompt message", 1, record.prompts[0], undefined, catalog));
    for (const field of ["spell", "lowDamage", "highDamage", "tumblers"] as const) issues.push(...validateI16Field(recordType, recordId, field, record[field]));
    if (record.lowDamage !== 0 && record.highDamage !== 0 && record.lowDamage > record.highDamage) {
      issues.push(recordIssue("warning", recordType, recordId, "rogue-damage-range", "Trap damage low is greater than high.", "Swap the low/high trap damage values unless this is intentional imported data."));
    }
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
      const rowId = Math.max(0, action.id);
      const row = project.extracodes.find((candidate) => candidate.id === rowId);
      if (!row) {
        issues.push(slotIssue("warning", recordType, recordId, action.slot, "missing-edcd-row", "Missing parameter row.", `CODE ${action.rawCode} stores extra settings in parameter row ${rowId}; create that row before relying on this behavior.`));
      } else if (row.values.length !== 5 || row.values.some((value) => !Number.isFinite(value))) {
        issues.push(slotIssue("error", recordType, recordId, action.slot, "malformed-edcd-row", "Parameter row is malformed.", `Parameter row ${rowId} must contain five finite numeric values.`));
      } else {
        const fieldNames = edcdFieldNamesForShape(option.edcdShape);
        if (fieldNames) {
          for (const issue of missingEdcdTargetReferences(project, option.edcdShape, fieldNames, row.values, action.rawCode)) {
            const fieldLabel = parameterLabelForIssue(action.rawCode, issue.index, issue.field);
            issues.push(slotIssue(
              "warning",
              recordType,
              recordId,
              action.slot,
              `missing-edcd-${issue.field}`,
              `Missing ${fieldLabel.toLowerCase()} target.`,
              `Parameter row ${rowId} field ${issue.index + 1} (${fieldLabel}) points at ${issue.targetLabel} ${issue.value}, but Providence cannot prove that target exists.`
            ));
          }
        }
      }
    }
    issues.push(...validateReference(project, recordType, recordId, `Action row ${action.slot}`, code, action.id, action.slot, catalog));
    if (isDirectMacroOpcode(code) && action.id !== 0) {
      const macro = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === action.id);
      if (!macro) issues.push(slotIssue("error", recordType, recordId, action.slot, "dangling-macro", "Extra Action Point target is missing.", `No callable Extra Action Point ${action.id} exists.`));
      else if (!isCallableMacro(project, macro)) issues.push(slotIssue("warning", recordType, recordId, action.slot, "ed3-evidence-target", "Target is an imported Extra Action Point row.", `Extra Action Point ${action.id} is preserved from the imported scenario but is not currently callable from normal macro paths.`));
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

function parameterLabelForIssue(opcode: number, index: number, fallback: string) {
  return parameterLabelsForOpcode(opcode).find((parameter) => parameter.index === index)?.label ?? fallback;
}

function recordIssue(severity: TargetRecordDiagnostic["severity"], recordType: RealmzTargetRecordKind, recordId: number, code: string, message: string, detail: string): TargetRecordDiagnostic {
  return { id: `${recordType}:${recordId}:${code}`, severity, message, detail };
}

function slotIssue(severity: TargetRecordDiagnostic["severity"], recordType: RealmzTargetRecordKind, recordId: number, slot: number, code: string, message: string, detail: string): TargetRecordDiagnostic {
  return { id: `${recordType}:${recordId}:${slot}:${code}`, severity, slot, message, detail };
}
