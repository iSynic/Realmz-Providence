import { LibraryCatalog, Project, RealmzTargetRecordKind } from "./types";
import { actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "./realmzActions";
import { isDirectMacroOpcode, resolveSignedMessageTarget, targetOptionForOpcodeValue, targetPickerConfig } from "./components/RealmzTargetPicker";
import { isCallableMacro } from "./semanticGraph";
import { missingEdcdTargetReferences } from "./edcdTargets";
import { edcdFieldNamesForShape } from "./realmzEdcd";
import { parameterLabelsForOpcode } from "./opcodeCrosswalk";
import { scriptParameterLabelForOpcode } from "./scriptActionLabels";
import { BATTLE_RUNTIME_MONSTER_LIMIT, countBattleRuntimeMonsterSlots } from "./battleReferences";

const ROGUE_DISARM_TRAP_SLOT = 2;
const ROGUE_OPEN_LOCK_SLOT = 6;
const SIMPLE_ENCOUNTER_AUTO_RESULT_FOUR = -4;
const SIMPLE_ENCOUNTER_NORMAL_RESULTS = [0, 1, 2, 3, 4] as const;

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
    if (bytes > 255) issues.push(recordIssue("error", recordType, recordId, "message-too-long", "String text is too long.", `String ${recordId} is ${bytes} byte(s); Realmz supports 255.`));
    if (hasNonAscii(record.text)) issues.push(recordIssue("warning", recordType, recordId, "message-non-ascii", "String contains non-ASCII characters.", "Classic text records are byte-oriented; non-ASCII characters may export as fallback spaces or unsupported glyphs."));
    return issues;
  }
  if (recordType === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === recordId);
    if (!record) return [];
    const issues = validateRecordId(recordType, recordId);
    const monstersById = new Map((project.monsters ?? []).map((monster) => [monster.id, monster]));
    if (record.grid.length !== 13 * 13) issues.push(recordIssue("error", recordType, recordId, "battle-grid-shape", "Battle grid is malformed.", `Battle ${recordId} has ${record.grid.length} cells; Realmz requires 169.`));
    const placedMonsters = countBattleRuntimeMonsterSlots(record.grid);
    if (placedMonsters === 0) issues.push(recordIssue("warning", recordType, recordId, "battle-empty", "Battle has no monsters placed.", "Place at least one monster unless this is an intentionally empty battle shell."));
    if (placedMonsters > BATTLE_RUNTIME_MONSTER_LIMIT) issues.push(recordIssue("error", recordType, recordId, "battle-monster-cap", "Battle places more than 100 monsters.", `Realmz stores runtime monsters in a fixed ${BATTLE_RUNTIME_MONSTER_LIMIT}-entry array; this battle places ${placedMonsters}.`));
    if (record.authored && (record.dist < 1 || record.dist > 30)) {
      issues.push(recordIssue("warning", recordType, recordId, "battle-distance-range", "Battle distance is outside Divinity's usual 1-30 range.", `Distance is ${record.dist}; use 1-30 for normal random placement distance.`));
    }
    issues.push(...validateI16Field(recordType, recordId, "Distance", record.dist));
    issues.push(...validateReference(project, recordType, recordId, "Before string", 1, record.messageBefore, undefined, catalog));
    issues.push(...validateReference(project, recordType, recordId, "After string", 1, record.messageAfter, undefined, catalog));
    issues.push(...validateReference(project, recordType, recordId, "Battle macro", 39, record.battleMacro, undefined, catalog));
    for (const [slot, monster] of record.grid.entries()) {
      const monsterId = Math.abs(monster);
      const monsterRecord = monstersById.get(monsterId);
      if (!isI16(monster)) issues.push(recordIssue("error", recordType, recordId, `battle-monster-${slot}`, "Battle monster ID is outside Realmz integer range.", `Grid slot ${slot} has ${monster}.`));
      else if (monster !== 0 && !monsterRecord) {
        issues.push(recordIssue("warning", recordType, recordId, `battle-monster-missing-${slot}`, "Battle grid points at a missing monster.", `Grid slot ${slot} uses monster ${monsterId}, but no matching monster record is editable in this project.`));
      } else if (monster !== 0 && monsterRecord?.hitDice === 0) {
        issues.push(recordIssue("warning", recordType, recordId, `battle-monster-blank-${slot}`, "Battle grid points at a blank monster slot.", `Grid slot ${slot} uses monster ${monsterId}, but that Data MD record has Stamina Level 0 and Realmz skips it during battle setup.`));
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
    if (record.itemIds.length > 20) issues.push(recordIssue("error", recordType, recordId, "treasure-item-count", "Treasure has too many item slots.", `Treasure ${recordId} has ${record.itemIds.length}; Realmz supports 20.`));
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
    if (record.itemIds.length > 1000 || record.quantities.length > 1000) issues.push(recordIssue("error", recordType, recordId, "shop-slot-count", "Shop has too many stocked slots.", `Shop ${recordId} exceeds Realmz capacity of 1000 item and quantity slots.`));
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
      if (bytes > maxTextBytes) issues.push(slotIssue("error", recordType, recordId, slot, "encounter-text-too-long", "Encounter text is too long.", `Text ${slot} is ${bytes} byte(s); Realmz supports ${maxTextBytes} display byte(s) plus one length byte.`));
      if (hasNonAscii(text)) issues.push(slotIssue("warning", recordType, recordId, slot, "encounter-text-non-ascii", "Encounter text contains non-ASCII characters.", "Classic encounter text is byte-oriented; non-ASCII characters may not round-trip as intended."));
    }
    if (recordType === "simpleEncounter") {
      if ((record.choiceResults ?? []).length > 4) issues.push(recordIssue("error", recordType, recordId, "choice-result-count", "Simple encounter has too many choice result rows.", "Simple encounters store four choice result bytes."));
      for (const [slot, value] of (record.choiceResults ?? []).entries()) {
        const allowed = slot === 0
          ? [SIMPLE_ENCOUNTER_AUTO_RESULT_FOUR, ...SIMPLE_ENCOUNTER_NORMAL_RESULTS]
          : [...SIMPLE_ENCOUNTER_NORMAL_RESULTS];
        if (!allowed.includes(value)) {
          issues.push(slotIssue(
            "error",
            recordType,
            recordId,
            slot,
            "simple-choice-result-unsupported",
            "Simple encounter option result is unsupported.",
            slot === 0
              ? `Option 1 has ${value}. Modern Realmz only supports -4 as the auto-run Result #4 sentinel, or 0..4 as normal result values.`
              : `Option ${slot + 1} has ${value}. Modern Realmz uses this value as a direct result-row index, so only 0..4 is source-backed.`
          ));
        }
      }
    } else {
      const complex = record as Project["complexEncounters"][number];
      const actionResult = complex.actionResult ?? signedByteLike((complex.choiceResults ?? [])[0] ?? 0);
      const wordResult = complex.wordResult ?? signedByteLike((complex.wordResults ?? [])[0] ?? 0);
      for (const [label, value] of [["action result", actionResult], ["word result", wordResult]] as const) {
        if (!isSignedByte(value)) issues.push(recordIssue("error", recordType, recordId, `complex-${label.replace(/\W+/g, "-")}`, `Complex encounter ${label} is outside signed-byte range.`, `${label} has ${value}; Realmz stores this as one byte.`));
      }
      for (const [label, values, max] of [
        ["group flags", complex.groups ?? [], 8],
        ["spell IDs", complex.spellIds ?? [], 10],
        ["spell results", complex.spellResults ?? [], 10],
        ["item IDs", complex.itemIds ?? [], 5],
        ["item results", complex.itemResults ?? [], 5]
      ] as const) {
        if (values.length > max) issues.push(recordIssue("error", recordType, recordId, `complex-${label.replace(/\W+/g, "-")}`, `Complex encounter has too many ${label}.`, `Realmz stores ${max} ${label}.`));
        for (const [slot, value] of values.entries()) {
          const isResult = label.includes("results") || label === "group flags";
          if (isResult ? !isSignedByte(value) : !isI16(value)) {
            issues.push(recordIssue("error", recordType, recordId, `complex-${label.replace(/\W+/g, "-")}-${slot}`, `Complex encounter ${label} value is outside range.`, `${label} slot ${slot} has ${value}.`));
          }
        }
      }
      if (complex.thief && complex.thiefSuccess > 0) {
        const rogue = project.thiefEncounters?.find((candidate) => candidate.id === complex.thiefSuccess);
        if (!rogue) {
          issues.push(recordIssue("warning", recordType, recordId, "complex-rogue-missing", "Rogue Encounter target is missing.", `This thief branch opens Rogue Encounter ${complex.thiefSuccess}, but that record does not exist yet.`));
        } else {
          issues.push(...validateComplexRogueResultColumns(recordType, recordId, complex, rogue));
        }
      }
    }
    issues.push(...validateReference(project, recordType, recordId, "Prompt string", 1, record.prompt, undefined, catalog));
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
      issues.push(recordIssue("error", recordType, recordId, "timed-extra-field-count", "Timed encounter has too many extra fields.", "Timed encounters store exactly ten extra signed-short fields."));
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
    if (record.typeFlags.length > 10) issues.push(recordIssue("error", recordType, recordId, "rogue-flag-count", "Rogue encounter has too many state flags.", "Rogue encounters store ten state flags."));
    for (const [label, values, max] of [
      ["modifiers", record.modifiers, 8],
      ["success result codes", record.successCodes, 8],
      ["failure result codes", record.failureCodes, 8],
      ["success strings", record.successText, 8],
      ["failure strings", record.failureText, 8],
      ["success sounds", record.successSounds, 8],
      ["failure sounds", record.failureSounds, 8],
      ["prompt/support fields", record.prompts, 3],
      ["prompt sounds", record.promptSounds, 3]
    ] as const) {
      if (values.length > max) issues.push(recordIssue("error", recordType, recordId, `rogue-${label.replace(/\W+/g, "-")}`, `Rogue encounter has too many ${label}.`, `Rogue encounters store ${max} ${label}.`));
      for (const [slot, value] of values.entries()) {
        if (!isI16(value)) issues.push(recordIssue("error", recordType, recordId, `rogue-${label}-${slot}`, "Rogue encounter value is outside Realmz integer range.", `${label} slot ${slot} has ${value}.`));
      }
    }
    for (const [slot, message] of record.successText.entries()) issues.push(...validateReference(project, recordType, recordId, `Success string ${slot}`, 1, message, undefined, catalog));
    for (const [slot, message] of record.failureText.entries()) issues.push(...validateReference(project, recordType, recordId, `Failure string ${slot}`, 1, message, undefined, catalog));
    if (record.prompts[0]) issues.push(...validateReference(project, recordType, recordId, "Prompt string", 1, record.prompts[0], undefined, catalog));
    for (const field of ["spell", "lowDamage", "highDamage", "tumblers"] as const) issues.push(...validateI16Field(recordType, recordId, field, record[field]));
    if (record.lowDamage !== 0 && record.highDamage !== 0 && record.lowDamage > record.highDamage) {
      issues.push(recordIssue("warning", recordType, recordId, "rogue-damage-range", "Trap damage low is greater than high.", "Swap the low/high trap damage values unless this is intentional imported data."));
    }
    issues.push(...validateRogueVisibleOutcomes(recordType, recordId, record));
    return issues;
  }
  return [];
}

function validateComplexRogueResultColumns(
  recordType: RealmzTargetRecordKind,
  recordId: number,
  complex: Project["complexEncounters"][number],
  rogue: Project["thiefEncounters"][number]
) {
  const issues: TargetRecordDiagnostic[] = [];
  const checks = [
    { slot: ROGUE_OPEN_LOCK_SLOT, label: "Open Lock", enabled: (rogue.promptSounds?.[1] ?? 0) > 0 },
    { slot: ROGUE_DISARM_TRAP_SLOT, label: "Disarm Trap", enabled: (rogue.promptSounds?.[2] ?? 0) > 0 }
  ];
  for (const check of checks) {
    if (!check.enabled) continue;
    for (const outcome of [
      { kind: "success", result: rogue.successCodes?.[check.slot] ?? 0 },
      { kind: "failure", result: rogue.failureCodes?.[check.slot] ?? 0 }
    ] as const) {
      if (outcome.result <= 0) continue;
      if (outcome.result > 4) continue;
      if (!complexResultHasVisibleAction(complex, outcome.result)) {
        issues.push(recordIssue(
          "warning",
          recordType,
          recordId,
          `complex-rogue-${check.label}-${outcome.kind}-empty-result`,
          `${check.label} ${outcome.kind} runs an empty result column.`,
          `${check.label} ${outcome.kind} returns Result ${outcome.result}, but that Complex Encounter result column has no string, branch, reward, or exit action.`
        ));
      }
    }
  }
  return issues;
}

function validateRogueVisibleOutcomes(recordType: RealmzTargetRecordKind, recordId: number, record: Project["thiefEncounters"][number]) {
  const issues: TargetRecordDiagnostic[] = [];
  const checks = [
    { slot: ROGUE_OPEN_LOCK_SLOT, label: "Open Lock", enabled: (record.promptSounds?.[1] ?? 0) > 0 },
    { slot: ROGUE_DISARM_TRAP_SLOT, label: "Disarm Trap", enabled: (record.promptSounds?.[2] ?? 0) > 0 }
  ];
  for (const slot of Array.from({ length: 8 }, (_, index) => index)) {
    const label = ROGUE_ACTION_LABELS[slot] ?? `Rogue action ${slot}`;
    if (record.typeFlags?.[slot] && !rogueOutcomeHasVisiblePath(record, slot, "success")) {
      issues.push(slotIssue("warning", recordType, recordId, slot, "rogue-success-no-visible-result", `${label} success has no visible result.`, `${label} can be attempted, but success currently runs no visible result. Add a string, sound, or result code so players can tell what happened.`));
    }
    if (record.typeFlags?.[slot] && !rogueOutcomeHasVisiblePath(record, slot, "failure")) {
      issues.push(slotIssue("warning", recordType, recordId, slot, "rogue-failure-no-visible-result", `${label} failure has no visible result.`, `${label} can be attempted, but failure currently runs no visible result. Add a string, sound, or result code so players can tell what happened.`));
    }
  }
  for (const check of checks) {
    if (!check.enabled) continue;
    if ((record.successCodes?.[check.slot] ?? 0) === 0) {
      issues.push(slotIssue("warning", recordType, recordId, check.slot, "rogue-spell-success-result-zero", `${check.label} spell success returns no result.`, `${check.label} can be attempted, but success currently returns no Complex Encounter result. Add a success result row so players can tell what happened.`));
    }
    if ((record.failureCodes?.[check.slot] ?? 0) === 0) {
      issues.push(slotIssue("warning", recordType, recordId, check.slot, "rogue-spell-failure-result-zero", `${check.label} spell failure returns no result.`, `${check.label} can be attempted, but failure currently returns no Complex Encounter result. Add a failure result row so players can tell what happened.`));
    }
  }
  return issues;
}

function complexResultHasVisibleAction(complex: Project["complexEncounters"][number], resultCode: number) {
  const resultIndex = resultCode - 1;
  if (resultIndex < 0 || resultIndex > 3) return true;
  const start = resultIndex * 8;
  return complex.actions.some((action) => action.slot >= start && action.slot < start + 8 && (action.rawCode !== 0 || action.id !== 0));
}

function rogueOutcomeHasVisiblePath(record: Project["thiefEncounters"][number], slot: number, outcome: "success" | "failure") {
  const codes = outcome === "success" ? record.successCodes : record.failureCodes;
  const messages = outcome === "success" ? record.successText : record.failureText;
  const sounds = outcome === "success" ? record.successSounds : record.failureSounds;
  return Boolean((codes?.[slot] ?? 0) || (messages?.[slot] ?? 0) || (sounds?.[slot] ?? 0));
}

const ROGUE_ACTION_LABELS = [
  "Acrobatic Act",
  "Detect Trap",
  "Disarm Trap",
  "Force Lock",
  "Pick Lock",
  "Pick Pocket",
  "Open Lock Magic",
  "Rogue Support"
];

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
      issues.push(slotIssue(
        "warning",
        recordType,
        recordId,
        action.slot,
        "unknown-action",
        "Unknown opcode.",
        `CODE ${action.rawCode} is preserved unchanged, but Providence does not have a safe authoring definition for it yet. Replace it with a known action or inspect Technical Details before relying on it.`
      ));
    } else if (isDispatcherNoopOpcode(action.rawCode)) {
      issues.push(slotIssue(
        "info",
        recordType,
        recordId,
        action.slot,
        "dispatcher-noop",
        "Inert imported action.",
        `CODE ${action.rawCode} is kept for compatibility, but Realmz has no normal dispatcher behavior for it.`
      ));
    }
    if (option.edcdShape) {
      const rowId = Math.max(0, action.id);
      const row = project.extracodes.find((candidate) => candidate.id === rowId);
      if (!row) {
        issues.push(slotIssue("warning", recordType, recordId, action.slot, "missing-settings", "Missing settings.", `${actionOptionFor(action.rawCode).shortLabel} needs settings ${rowId}; create them before relying on this behavior.`));
      } else if (row.values.length !== 5 || row.values.some((value) => !Number.isFinite(value))) {
        issues.push(slotIssue("error", recordType, recordId, action.slot, "malformed-settings", "Settings are malformed.", `Settings ${rowId} must contain five finite numeric values.`));
      } else {
        const fieldNames = edcdFieldNamesForShape(option.edcdShape);
        if (fieldNames) {
          const preservedIndexes = parameterLabelsForOpcode(action.rawCode).filter((label) => label.preserved).map((label) => label.index);
          for (const issue of missingEdcdTargetReferences(project, option.edcdShape, fieldNames, row.values, action.rawCode, preservedIndexes, catalog)) {
            const fieldLabel = parameterLabelForIssue(action.rawCode, issue.index, issue.field);
            issues.push(slotIssue(
              "warning",
              recordType,
              recordId,
              action.slot,
              `missing-edcd-${issue.field}`,
              `Missing ${issue.targetLabel} target.`,
              `Settings ${rowId} field ${issue.index + 1} (${fieldLabel}) points at ${issue.targetLabel} ${issue.value}, but that target does not exist.`
            ));
          }
        }
      }
    }
    issues.push(...validateReference(project, recordType, recordId, `Action row ${action.slot}`, code, action.id, action.slot, catalog));
    if (isDirectMacroOpcode(code) && action.id !== 0) {
      const macro = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === action.id);
      if (!macro) issues.push(slotIssue("error", recordType, recordId, action.slot, "dangling-macro", "Extra Action Point target is missing.", `No callable Extra Action Point ${action.id} exists.`));
      else if (!isCallableMacro(project, macro)) issues.push(slotIssue("warning", recordType, recordId, action.slot, "unlinked-extra-action-target", "Extra Action Point is not linked from known scenario flow yet.", `Extra Action Point ${action.id} exists, but Providence has not identified a normal call path for it yet.`));
    }
  }
  return issues;
}

function validateReference(project: Project, recordType: RealmzTargetRecordKind, recordId: number, label: string, opcode: number, id: number, slot?: number, catalog?: LibraryCatalog | null) {
  if (id === 0) return [];
  const config = targetPickerConfig(opcode);
  if (!config) return [];
  const resolvedId = resolveSignedMessageTarget(opcode, id);
  const exists = Boolean(targetOptionForOpcodeValue(project, opcode, resolvedId, catalog));
  if (exists) return [];
  const detail = `${resolvedId} is kept as-is, but Providence cannot find the referenced ${config.label.toLowerCase()}.`;
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

function isSignedByte(value: number) {
  return Number.isInteger(value) && value >= -128 && value <= 127;
}

function signedByteLike(value: number) {
  return value > 127 ? value - 256 : value;
}

function asciiByteLength(value: string) {
  return [...value].reduce((total, char) => total + (char.charCodeAt(0) <= 0x7f ? 1 : 2), 0);
}

function hasNonAscii(value: string) {
  return /[^\x00-\x7f]/.test(value);
}

function parameterLabelForIssue(opcode: number, index: number, fallback: string) {
  return scriptParameterLabelForOpcode(opcode, index, fallback);
}

function recordIssue(severity: TargetRecordDiagnostic["severity"], recordType: RealmzTargetRecordKind, recordId: number, code: string, message: string, detail: string): TargetRecordDiagnostic {
  return { id: `${recordType}:${recordId}:${code}`, severity, message, detail };
}

function slotIssue(severity: TargetRecordDiagnostic["severity"], recordType: RealmzTargetRecordKind, recordId: number, slot: number, code: string, message: string, detail: string): TargetRecordDiagnostic {
  return { id: `${recordType}:${recordId}:${slot}:${code}`, severity, slot, message, detail };
}
