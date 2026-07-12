import { useEffect, useMemo, useState } from "react";
import { itemReferenceOptions } from "../../itemReferences";
import type {
  ComplexEncounterRecord,
  LibraryCatalog,
  Project,
  SimpleEncounterRecord
} from "../../types";
import { EmptyState, FloatingWorkbenchPanel } from "../../ui";
import {
  ENCOUNTER_RESULT_COUNT,
  buildEncounterDecisionSources,
  encounterActionIsPopulated,
  encounterActionLabel,
  encounterResultColumnRows,
  encounterResultColumnSummary,
  encounterResultStatus,
  resultStatusLabel,
  shortSnippet,
  type EncounterDecisionSource,
  type EncounterResultStatus
} from "./encounterFlow";
import { spellReferenceOptions } from "./encounterResponseOptions";

export type EncounterCopySource = SimpleEncounterRecord | ComplexEncounterRecord;

export type EncounterCopyPreviewRow = {
  key: string;
  title: string;
  detail?: string;
  result?: number;
  status?: EncounterResultStatus;
};

export type EncounterCopyPreviewSection = {
  title: string;
  rows: EncounterCopyPreviewRow[];
};

export function EncounterCopyPanel({
  project,
  catalog,
  recordKind,
  currentId,
  onClose,
  onApply
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordKind: "simple" | "complex";
  currentId: number;
  onClose: () => void;
  onApply: (changes: Record<string, unknown>) => void;
}) {
  const sources = useMemo(() => encounterCopySources(project, recordKind, currentId), [currentId, project, recordKind]);
  const sourceIds = sources.map((source) => source.id).join(",");
  const [selectedId, setSelectedId] = useState(sources[0]?.id ?? -1);
  useEffect(() => {
    if (!sources.some((source) => source.id === selectedId)) {
      setSelectedId(sources[0]?.id ?? -1);
    }
  }, [selectedId, sourceIds, sources]);
  const selectedSource = sources.find((source) => source.id === selectedId) ?? null;
  const flowSources = selectedSource ? encounterCopyFlowSources(project, recordKind, selectedSource) : [];
  const labels = selectedSource ? encounterCopyPreviewLabels(recordKind, selectedSource) : [];
  const previewSections = selectedSource
    ? [
      ...encounterCopyResponseSections(project, catalog, recordKind, selectedSource),
      ...encounterCopyResultSections(selectedSource, flowSources)
    ]
    : [];
  const applyCopy = () => {
    if (!selectedSource) return;
    onApply(encounterCopyChanges(selectedSource));
  };
  return (
    <FloatingWorkbenchPanel
      title={`Copy ${recordKind === "simple" ? "Simple" : "Complex"} Encounter`}
      eyebrow="Encounters"
      storageKey={`encounters.${recordKind}.copyFrom.position`}
      defaultWidth={760}
      defaultHeight={540}
      minWidth={520}
      minHeight={360}
      className="encounter-copy-floating-panel"
      actions={(
        <>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-xs" disabled={!selectedSource} onClick={applyCopy}>
            Apply Copy
          </button>
        </>
      )}
    >
      <div className="encounter-copy-panel-body">
        <div className="encounter-copy-source-list" role="listbox" aria-label={`${recordKind} encounters to copy from`}>
          {sources.length === 0 ? (
            <EmptyState title="No other encounters" body={`Create another ${recordKind} encounter before copying from one.`} />
          ) : sources.map((source) => (
            <button
              key={source.id}
              type="button"
              className={source.id === selectedId ? "selected" : ""}
              onClick={() => setSelectedId(source.id)}
            >
              <b>{recordKind === "simple" ? "Simple" : "Complex"} Encounter {source.id}</b>
              <small>{encounterCopySourceSubtitle(project, recordKind, source)}</small>
            </button>
          ))}
        </div>
        <section className="encounter-copy-preview">
          {selectedSource ? (
            <>
              <header>
                <div>
                  <strong>{recordKind === "simple" ? "Simple" : "Complex"} Encounter {selectedSource.id}</strong>
                  <small>{messageSnippet(project, selectedSource.prompt) || `Prompt ${selectedSource.prompt}`}</small>
                </div>
                <span>{flowSources.length} path{flowSources.length === 1 ? "" : "s"}</span>
              </header>
              {labels.length > 0 && (
                <div className="encounter-copy-label-preview">
                  {labels.map((label) => <span key={label}>{label}</span>)}
                </div>
              )}
              <EncounterCopyRoutePreview sections={previewSections} />
            </>
          ) : (
            <EmptyState title="No source selected" body="Select an encounter to preview before copying." />
          )}
        </section>
      </div>
    </FloatingWorkbenchPanel>
  );
}

export function encounterCopyResponseSections(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  recordKind: "simple" | "complex",
  source: EncounterCopySource
): EncounterCopyPreviewSection[] {
  if (recordKind === "simple" || !isComplexEncounterCopySource(source)) {
    const rows = Array.from({ length: 4 }, (_, slot) => {
      const text = (source.texts?.[slot] ?? "").trim();
      const result = source.choiceResults?.[slot] ?? 0;
      return {
        key: `simple-choice-${slot}`,
        title: `Option ${slot}`,
        detail: text ? shortSnippet(text, 80) : "No label",
        result,
        status: result ? encounterResultStatus(source.actions, result) : "missing" as EncounterResultStatus
      };
    });
    return [{ title: "Player Options", rows }];
  }

  const sections: EncounterCopyPreviewSection[] = [];
  const actionRows = source.texts.slice(0, 8).map((text, slot) => ({
    key: `action-${slot}`,
    title: `Action ${slot}`,
    detail: [
      text.trim() ? shortSnippet(text, 80) : "No label",
      source.groups?.[slot] ? "requires selection" : ""
    ].filter(Boolean).join(" | "),
    result: source.actionResult,
    status: source.actionResult ? encounterResultStatus(source.actions, source.actionResult) : "missing" as EncounterResultStatus
  })).filter((row) => row.detail !== "No label" || (row.result ?? 0) !== 0);
  if (actionRows.length > 0) sections.push({ title: "Action Choices", rows: actionRows });

  const typedReply = (source.texts?.[8] ?? "").trim();
  if (typedReply || source.wordResult) {
    sections.push({
      title: "Typed Reply",
      rows: [{
        key: "typed-reply",
        title: "Typed reply",
        detail: typedReply ? shortSnippet(typedReply, 80) : "No phrase",
        result: source.wordResult,
        status: source.wordResult ? encounterResultStatus(source.actions, source.wordResult) : "missing"
      }]
    });
  }

  const magicRows = source.spellIds.map((spellId, slot) => {
    const result = source.spellResults?.[slot] ?? 0;
    return {
      key: `magic-${slot}`,
      title: `Magic ${slot + 1}`,
      detail: spellCopyLabel(project, catalog, spellId),
      result,
      status: result ? encounterResultStatus(source.actions, result) : "missing" as EncounterResultStatus
    };
  }).filter((row) => row.detail !== "No spell or scroll" || (row.result ?? 0) !== 0);
  if (magicRows.length > 0) sections.push({ title: "Magic Responses", rows: magicRows });

  const itemRows = source.itemIds.map((itemId, slot) => {
    const result = source.itemResults?.[slot] ?? 0;
    return {
      key: `item-${slot}`,
      title: `Item ${slot + 1}`,
      detail: itemCopyLabel(project, catalog, itemId),
      result,
      status: result ? encounterResultStatus(source.actions, result) : "missing" as EncounterResultStatus
    };
  }).filter((row) => row.detail !== "Empty / none" || (row.result ?? 0) !== 0);
  if (itemRows.length > 0) sections.push({ title: "Item Responses", rows: itemRows });

  if (source.thief) {
    sections.push({
      title: "Rogue Encounter",
      rows: [{
        key: "rogue",
        title: `Rogue Encounter ${source.thiefSuccess}`,
        detail: "Rogue encounter returns its own success/failure result numbers."
      }]
    });
  }

  return sections.length > 0 ? sections : [{
    title: "Encounter Responses",
    rows: [{
      key: "none",
      title: "No responses configured",
      detail: "This encounter has no configured player response routes."
    }]
  }];
}

export function encounterCopyResultSections(
  source: EncounterCopySource,
  flowSources: EncounterDecisionSource[]
): EncounterCopyPreviewSection[] {
  return [{
    title: "Result Scripts",
    rows: Array.from({ length: ENCOUNTER_RESULT_COUNT }, (_, resultIndex) => {
      const summary = encounterResultColumnSummary(source.actions, resultIndex, flowSources);
      const populatedRows = encounterResultColumnRows(source.actions, resultIndex).filter(encounterActionIsPopulated);
      const detail = populatedRows.length > 0
        ? populatedRows.slice(0, 3).map((row) => `${encounterActionLabel(row)} ${row.id}`.trim()).join("; ")
        : "No actions";
      return {
        key: `result-${resultIndex}`,
        title: `Result ${resultIndex + 1}`,
        detail,
        result: resultIndex + 1,
        status: summary.status
      };
    })
  }];
}

export function EncounterCopyRoutePreview({ sections }: { sections: EncounterCopyPreviewSection[] }) {
  return (
    <div className="encounter-copy-route-preview">
      {sections.map((section) => (
        <section key={section.title}>
          <h4>{section.title}</h4>
          <div>
            {section.rows.map((row) => (
              <article key={row.key} className={`encounter-copy-route-row ${row.status ?? "neutral"}`}>
                <span>
                  <b>{row.title}</b>
                  {row.detail && <small>{row.detail}</small>}
                </span>
                {row.result !== undefined && (
                  <em>
                    <strong>{encounterCopyResultText(row.result)}</strong>
                    <small>{encounterCopyStatusLabel(row.result, row.status)}</small>
                  </em>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function isComplexEncounterCopySource(record: EncounterCopySource): record is ComplexEncounterRecord {
  return "spellIds" in record;
}

function cloneEncounterActionRows(actions: SimpleEncounterRecord["actions"]) {
  return actions.map((action) => ({ slot: action.slot, rawCode: action.rawCode, id: action.id }));
}

export function encounterCopyChanges(source: EncounterCopySource): Record<string, unknown> {
  return isComplexEncounterCopySource(source)
    ? complexEncounterCopyChanges(source)
    : simpleEncounterCopyChanges(source);
}

function simpleEncounterCopyChanges(source: SimpleEncounterRecord): Record<string, unknown> {
  return {
    actions: cloneEncounterActionRows(source.actions ?? []),
    choiceResults: [...(source.choiceResults ?? [])],
    canBackOut: source.canBackOut,
    maxTimes: source.maxTimes,
    casteSuccess: source.casteSuccess,
    prompt: source.prompt,
    texts: [...(source.texts ?? [])]
  };
}

function complexEncounterCopyChanges(source: ComplexEncounterRecord): Record<string, unknown> {
  return {
    actions: cloneEncounterActionRows(source.actions ?? []),
    actionResult: source.actionResult,
    wordResult: source.wordResult,
    groups: [...(source.groups ?? [])],
    spellIds: [...(source.spellIds ?? [])],
    spellResults: [...(source.spellResults ?? [])],
    itemIds: [...(source.itemIds ?? [])],
    itemResults: [...(source.itemResults ?? [])],
    choiceResults: [...(source.choiceResults ?? [])],
    wordResults: [...(source.wordResults ?? [])],
    canBackOut: source.canBackOut,
    thief: source.thief,
    maxTimes: source.maxTimes,
    casteSuccess: source.casteSuccess,
    thiefSuccess: source.thiefSuccess,
    thiefFail: source.thiefFail,
    prompt: source.prompt,
    texts: [...(source.texts ?? [])]
  };
}

function encounterCopySources(project: Project, recordKind: "simple" | "complex", currentId: number): EncounterCopySource[] {
  const records: EncounterCopySource[] = recordKind === "simple" ? project.simpleEncounters ?? [] : project.complexEncounters ?? [];
  return records.filter((record) => record.id !== currentId);
}

function encounterCopyFlowSources(
  project: Project,
  recordKind: "simple" | "complex",
  source: EncounterCopySource
) {
  if (recordKind === "simple" || !isComplexEncounterCopySource(source)) {
    return buildEncounterDecisionSources({
      recordKind: "simple",
      texts: source.texts,
      actionResult: 0,
      wordResult: 0,
      groups: [],
      spellIds: [],
      spellResults: [],
      itemIds: [],
      itemResults: [],
      choiceResults: source.choiceResults,
      thief: false,
      rogueId: 0,
      actions: source.actions
    });
  }
  const rogueRecord = source.thief ? project.thiefEncounters?.find((candidate) => candidate.id === source.thiefSuccess) : undefined;
  return buildEncounterDecisionSources({
    recordKind: "complex",
    texts: source.texts,
    actionResult: source.actionResult,
    wordResult: source.wordResult,
    groups: source.groups,
    spellIds: source.spellIds,
    spellResults: source.spellResults,
    itemIds: source.itemIds,
    itemResults: source.itemResults,
    choiceResults: source.choiceResults,
    wordResults: source.wordResults,
    thief: source.thief,
    rogueId: source.thiefSuccess,
    rogueRecord,
    actions: source.actions
  });
}

function encounterCopySourceSubtitle(
  project: Project,
  recordKind: "simple" | "complex",
  source: EncounterCopySource
) {
  const actionCount = (source.actions ?? []).filter((action) => action.rawCode !== 0 || action.id !== 0).length;
  const promptText = messageSnippet(project, source.prompt);
  if (recordKind === "simple") return `${actionCount} action row(s), ${promptText || `prompt ${source.prompt}`}`;
  const complex = isComplexEncounterCopySource(source) ? source : null;
  const responseCount = complex
    ? (complex.texts ?? []).filter((text) => text.trim()).length + (complex.spellResults ?? []).filter(Boolean).length + (complex.itemResults ?? []).filter(Boolean).length
    : 0;
  return `${actionCount} action row(s), ${responseCount} response path(s), ${promptText || `prompt ${source.prompt}`}`;
}

function encounterCopyPreviewLabels(recordKind: "simple" | "complex", source: EncounterCopySource) {
  const labels = (source.texts ?? [])
    .map((text, index) => text.trim() ? `${recordKind === "simple" ? "Option" : "Action"} ${index}: ${shortSnippet(text, 46)}` : "")
    .filter(Boolean)
    .slice(0, recordKind === "simple" ? 4 : 8);
  if (isComplexEncounterCopySource(source)) {
    const word = source.texts?.[8]?.trim();
    if (word) labels.push(`Typed reply: ${shortSnippet(word, 46)}`);
  }
  return labels;
}

function encounterCopyResultText(result: number | undefined) {
  return result && result > 0 ? `Result ${result}` : "No result";
}

function encounterCopyStatusLabel(result: number | undefined, status: EncounterResultStatus | undefined) {
  if (!result) return "No result";
  return resultStatusLabel(status ?? "missing");
}

function spellCopyLabel(project: Project, catalog: LibraryCatalog | null | undefined, value: number) {
  if (value === 0) return "No spell or scroll";
  return spellReferenceOptions(project, catalog).find((option) => option.value === value)?.label ?? `Unknown spell/scroll ${value}`;
}

function itemCopyLabel(project: Project, catalog: LibraryCatalog | null | undefined, value: number) {
  if (value === 0) return "Empty / none";
  return itemReferenceOptions(project, catalog).find((option) => option.value === value)?.label ?? `Current item ID ${value}`;
}

function messageSnippet(project: Project, id: number) {
  const text = project.messages?.find((message) => message.id === id)?.text?.trim();
  if (!text) return "";
  return text.length > 72 ? `${text.slice(0, 71)}...` : text;
}
