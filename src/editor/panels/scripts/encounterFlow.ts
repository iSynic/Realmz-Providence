import { ACTION_OPTIONS, actionOptionFor, isDispatcherNoopOpcode } from "../../realmzActions";
import type { EncounterActionRow, Project } from "../../types";

export const ENCOUNTER_RESULT_COUNT = 4;
export const ENCOUNTER_RESULT_ROWS = 8;
export const RESULT_ACTION_OPTIONS = ACTION_OPTIONS.filter((option) => option.code >= 0);

export const ROGUE_ACTION_LABELS = [
  "Acrobatic Act",
  "Detect Trap",
  "Disarm Trap",
  "Hear Noise",
  "Force Lock",
  "Move Silently",
  "Pick Lock",
  "Pick Pocket"
];

export type EncounterResultStatus = "visible" | "empty" | "missing" | "out-of-range";

export type EncounterDecisionSource = {
  key: string;
  label: string;
  detail: string;
  result: number;
  resultIndex: number | null;
  status: EncounterResultStatus;
};

export function resultStatusLabel(status: EncounterResultStatus) {
  if (status === "visible") return "Visible";
  if (status === "empty") return "Empty";
  if (status === "out-of-range") return "Out of range";
  return "Missing";
}

export function resultActionBaseCode(code: number) {
  return Math.abs(Number.isFinite(code) ? code : 0);
}

export function signedResultActionCode(code: number, negative: boolean) {
  const baseCode = resultActionBaseCode(code);
  if (baseCode === 0) return 0;
  return negative ? -baseCode : baseCode;
}

export function resultActionOptionsFor(baseCode: number) {
  if (RESULT_ACTION_OPTIONS.some((option) => option.code === baseCode)) return RESULT_ACTION_OPTIONS;
  const fallback = actionOptionFor(baseCode);
  return [fallback, ...RESULT_ACTION_OPTIONS];
}

export function encounterResultStatus(actions: EncounterActionRow[], result: number): EncounterResultStatus {
  const resultIndex = resultIndexForCode(result);
  if (resultIndex === null) return result > ENCOUNTER_RESULT_COUNT ? "out-of-range" : "missing";
  const column = encounterResultColumnRows(actions, resultIndex);
  if (column.some((row) => encounterActionIsPlayerObservable(row))) return "visible";
  return "empty";
}

export function encounterResultColumnRows(actions: EncounterActionRow[], resultIndex: number) {
  return Array.from({ length: ENCOUNTER_RESULT_ROWS }, (_, rowIndex) => encounterActionAt(actions, resultIndex * ENCOUNTER_RESULT_ROWS + rowIndex));
}

export function encounterActionIsPopulated(row: EncounterActionRow) {
  return row.rawCode !== 0 || row.id !== 0;
}

export function encounterActionIsPlayerObservable(row: EncounterActionRow) {
  if (!encounterActionIsPopulated(row)) return false;
  if (row.rawCode === 24 && row.id === 0) return false;
  if (isDispatcherNoopOpcode(row.rawCode)) return false;
  return true;
}

export function encounterActionLabel(row: EncounterActionRow) {
  const option = actionOptionFor(row.rawCode);
  if (option) return option.shortLabel ?? option.label;
  if (encounterActionIsPopulated(row)) return `Raw CODE ${row.rawCode}`;
  return "Empty";
}

export function encounterResultColumnSummary(actions: EncounterActionRow[], resultIndex: number, sources: EncounterDecisionSource[]) {
  const rows = encounterResultColumnRows(actions, resultIndex);
  const visible = rows.find(encounterActionIsPlayerObservable);
  const populated = rows.find(encounterActionIsPopulated);
  const incoming = sources.filter((source) => source.resultIndex === resultIndex).length;
  return {
    status: visible ? "visible" as EncounterResultStatus : "empty" as EncounterResultStatus,
    firstAction: visible ? encounterActionLabel(visible) : populated ? `Only ${encounterActionLabel(populated)}` : "No visible actions",
    incoming
  };
}

export function resultStatusCounts(actions: EncounterActionRow[]) {
  return Array.from({ length: ENCOUNTER_RESULT_COUNT }, (_, resultIndex) => encounterResultColumnSummary(actions, resultIndex, []))
    .reduce((counts, summary) => {
      counts[summary.status] += 1;
      return counts;
    }, { visible: 0, empty: 0, missing: 0, "out-of-range": 0 } as Record<EncounterResultStatus, number>);
}

export function buildEncounterDecisionSources({
  recordKind,
  texts,
  actionResult,
  wordResult,
  groups,
  spellIds,
  spellResults,
  itemIds,
  itemResults,
  choiceResults,
  thief,
  rogueId,
  rogueRecord,
  actions
}: {
  recordKind: "simple" | "complex";
  texts: string[];
  actionResult: number;
  wordResult: number;
  groups: number[];
  spellIds: number[];
  spellResults: number[];
  itemIds: number[];
  itemResults: number[];
  choiceResults: number[];
  thief: boolean;
  rogueId: number;
  rogueRecord?: Project["thiefEncounters"][number];
  actions: EncounterActionRow[];
}) {
  const sources: EncounterDecisionSource[] = [];
  if (recordKind === "simple") {
    for (let slot = 0; slot < 4; slot += 1) {
      const text = (texts[slot] ?? "").trim();
      sources.push(encounterDecisionSource(
        `choice-${slot}`,
        `Choice ${slot}`,
        text ? `Player picks "${shortSnippet(text, 54)}"` : "Player picks this option.",
        choiceResults[slot] ?? 0,
        actions
      ));
    }
    return sources;
  }

  const actionLabels = texts.slice(0, 8).map((text, slot) => text.trim() ? `Action ${slot}: ${shortSnippet(text, 28)}` : null).filter((label): label is string => Boolean(label));
  const groupCount = groups.filter((value) => value !== 0).length;
  if ((actionResult ?? 0) !== 0 || actionLabels.length > 0 || groupCount > 0) {
    sources.push(encounterDecisionSource(
      "action-picker",
      "Action picker",
      `${actionLabels.length || 8} action label${actionLabels.length === 1 ? "" : "s"}${groupCount ? `; ${groupCount} group flag${groupCount === 1 ? "" : "s"}` : ""}.`,
      actionResult,
      actions
    ));
  }
  if ((wordResult ?? 0) !== 0 || (texts[8] ?? "").trim()) {
    sources.push(encounterDecisionSource(
      "word-phrase",
      "Typed word",
      (texts[8] ?? "").trim() ? `Player types "${shortSnippet(texts[8] ?? "", 54)}".` : "Player enters the configured word or phrase.",
      wordResult,
      actions
    ));
  }
  spellIds.forEach((spellId, slot) => {
    const result = spellResults[slot] ?? 0;
    if (result !== 0) {
      sources.push(encounterDecisionSource(`spell-${slot}`, `Magic ${spellId || slot + 1}`, `Party uses the configured spell or scroll response in slot ${slot + 1}.`, result, actions));
    }
  });
  itemIds.forEach((itemId, slot) => {
    const result = itemResults[slot] ?? 0;
    if (result !== 0) {
      sources.push(encounterDecisionSource(`item-${slot}`, `Item ${itemId || slot + 1}`, `Party uses the configured item response in slot ${slot + 1}.`, result, actions));
    }
  });
  if (thief && rogueRecord) {
    ROGUE_ACTION_LABELS.forEach((label, slot) => {
      if (!rogueRecord.typeFlags?.[slot] && !rogueActionHasOutcomeData(rogueRecord, slot)) return;
      sources.push(encounterDecisionSource(
        `rogue-${slot}-success`,
        `${label} success`,
        `Rogue Encounter ${rogueId} returns this result when the action succeeds.`,
        rogueRecord.successCodes?.[slot] ?? 0,
        actions
      ));
      sources.push(encounterDecisionSource(
        `rogue-${slot}-failure`,
        `${label} failure`,
        `Rogue Encounter ${rogueId} returns this result when the action fails.`,
        rogueRecord.failureCodes?.[slot] ?? 0,
        actions
      ));
    });
  }
  return sources;
}

export function shortSnippet(text: string, maxLength: number) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1))}...`;
}

export function rogueActionHasOutcomeData(record: Project["thiefEncounters"][number], slot: number) {
  return Boolean(
    (record.successCodes?.[slot] ?? 0) ||
    (record.failureCodes?.[slot] ?? 0) ||
    (record.successText?.[slot] ?? 0) ||
    (record.failureText?.[slot] ?? 0) ||
    (record.successSounds?.[slot] ?? 0) ||
    (record.failureSounds?.[slot] ?? 0)
  );
}

export function encounterActionAt(actions: EncounterActionRow[], slot: number): EncounterActionRow {
  return actions.find((row) => row.slot === slot) ?? { slot, rawCode: 0, id: 0 };
}

export function updateEncounterActionRow(actions: EncounterActionRow[], slot: number, changes: Partial<EncounterActionRow>) {
  const next = new Map(actions.map((row) => [row.slot, { ...row }]));
  const updated = { ...(next.get(slot) ?? { slot, rawCode: 0, id: 0 }), ...changes, slot };
  if (updated.rawCode === 0 && updated.id === 0) next.delete(slot);
  else next.set(slot, updated);
  return [...next.values()].sort((a, b) => a.slot - b.slot);
}

function resultIndexForCode(result: number) {
  return result >= 1 && result <= ENCOUNTER_RESULT_COUNT ? result - 1 : null;
}

function encounterDecisionSource(
  key: string,
  label: string,
  detail: string,
  result: number,
  actions: EncounterActionRow[]
): EncounterDecisionSource {
  const resultIndex = resultIndexForCode(result);
  return { key, label, detail, result, resultIndex, status: encounterResultStatus(actions, result) };
}
