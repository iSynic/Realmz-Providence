import { useEffect, useMemo, useState } from "react";
import { Eye, X } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import type { EncounterActionRow, LibraryCatalog, Project } from "../../types";
import {
  encounterResultStatus,
  resultStatusLabel
} from "./encounterFlow";
import {
  ComplexEncounterResponsePickerPanel,
  ComplexEncounterResponseValue,
  encounterResponseSelection,
  MAGIC_RESPONSE_BLANK_SPELL_ID
} from "./EncounterResponsePicker";
import { deduplicatedItemResponseOptions, spellReferenceOptions } from "./encounterResponseOptions";
import { updateArraySlot } from "./arraySlots";

const SIMPLE_RESULT_AUTO_FAIL_SENTINEL = -4;
const SIMPLE_OPTIONS_HELP =
  "Each simple option has an inline label and a Result number. Result 1-4 chooses the matching action column below; zero means no result path. Option 1 can use -4 to skip the prompt and immediately run Result #4.";
const COMPLEX_BAR_ACTIONS_HELP =
  "Complex encounters show up to eight action labels on the encounter bar. The group flags and Action Picker result decide which result column runs when a player chooses a matching action.";
const COMPLEX_WORD_HELP =
  "The word answer is a typed-player-text branch. When the typed phrase matches this buffer, the Word Result chooses which result script column runs.";
const COMPLEX_SPELL_TESTS_HELP =
  "Magic responses match packed Realmz spell IDs or low spell-class IDs. When the party uses a matching spell or scroll, Realmz runs the selected result script column.";
const COMPLEX_ITEM_TESTS_HELP =
  "Item responses match Realmz item IDs from Economy or the reference item library. When the party uses a matching item, Realmz runs the selected result script column.";

export function EncounterResponseEditor({
  project,
  catalog,
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
  actions,
  onTextCommit,
  onChoiceCommit,
  onComplexCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
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
  actions: EncounterActionRow[];
  onTextCommit: (slot: number, text: string) => void;
  onChoiceCommit: (slot: number, value: number) => void;
  onComplexCommit: (changes: Partial<Pick<Project["complexEncounters"][number], "actionResult" | "wordResult" | "groups" | "spellIds" | "spellResults" | "itemIds" | "itemResults" | "choiceResults" | "wordResults">>) => void;
}) {
  const count = recordKind === "simple" ? 4 : 9;
  const maxLength = recordKind === "simple" ? 79 : 39;
  if (recordKind === "complex") {
    return (
      <section className="encounter-result-editor complex-encounter-authoring">
        <header className="visually-hidden">
          <div>
            <strong>Encounter Responses</strong>
          </div>
        </header>
        <div className="complex-encounter-tool-grid">
          <section className="complex-encounter-tool-panel complex-encounter-action-choice-panel">
            <header>
              <TutorialTip title="Action Picker Branch" body={COMPLEX_BAR_ACTIONS_HELP} side="below">
                <strong>Action Choices</strong>
              </TutorialTip>
            </header>
            <div className="complex-encounter-action-list">
              {Array.from({ length: 8 }, (_, slot) => {
                const text = texts[slot] ?? "";
                return (
                  <div key={slot} className="complex-encounter-action-option">
                    <label className="complex-encounter-action-required" title={`Require action ${slot}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(groups[slot] ?? 0)}
                        onChange={(event) => onComplexCommit({ groups: updateArraySlot(groups, slot, event.currentTarget.checked ? 1 : 0, 8) })}
                      />
                    </label>
                    <span className="complex-encounter-action-index">{slot}</span>
                    <label className="script-encounter-text-field complex-encounter-inline-text">
                      <input
                        key={`complex-action-${slot}-${text}`}
                        type="text"
                        defaultValue={text}
                        maxLength={maxLength}
                        onBlur={(event) => onTextCommit(slot, event.currentTarget.value)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="complex-encounter-result-line">
              <EncounterResultNumberField
                label="Action Result"
                value={actionResult}
                actions={actions}
                onCommit={(value) => onComplexCommit({ actionResult: value, choiceResults: [value, 0, 0, 0] })}
              />
            </div>
          </section>
          <ComplexEncounterResponseGrid
            project={project}
            catalog={catalog}
            title="Magic Responses"
            className="complex-encounter-magic-panel"
            help={COMPLEX_SPELL_TESTS_HELP}
            count={10}
            kind="magic"
            resultLabel="Magic Result"
            ids={spellIds}
            results={spellResults}
            actions={actions}
            onIdsCommit={(next) => onComplexCommit({ spellIds: next })}
            onResultsCommit={(next) => onComplexCommit({ spellResults: next })}
          />
          <ComplexEncounterResponseGrid
            project={project}
            catalog={catalog}
            title="Item Responses"
            className="complex-encounter-item-panel"
            help={COMPLEX_ITEM_TESTS_HELP}
            count={5}
            kind="item"
            resultLabel="Item Result"
            ids={itemIds}
            results={itemResults}
            actions={actions}
            onIdsCommit={(next) => onComplexCommit({ itemIds: next })}
            onResultsCommit={(next) => onComplexCommit({ itemResults: next })}
          />
          <section className="complex-encounter-tool-panel complex-encounter-word-panel">
            <header>
              <TutorialTip title="Word / Phrase Branch" body={COMPLEX_WORD_HELP} side="below">
                <strong>Typed Reply</strong>
              </TutorialTip>
            </header>
            <label className="script-encounter-text-field encounter-word-answer complex-encounter-inline-text">
              <input
                key={`complex-word-${texts[8] ?? ""}`}
                type="text"
                defaultValue={texts[8] ?? ""}
                maxLength={maxLength}
                onInput={(event) => {
                  const lowered = event.currentTarget.value.toLowerCase();
                  if (event.currentTarget.value !== lowered) event.currentTarget.value = lowered;
                }}
                onBlur={(event) => {
                  const lowered = event.currentTarget.value.toLowerCase();
                  event.currentTarget.value = lowered;
                  onTextCommit(8, lowered);
                }}
              />
              <small>Typed replies are stored lowercase; uppercase letters are converted automatically.</small>
            </label>
            <div className="complex-encounter-result-line">
              <EncounterResultNumberField
                label="Typed Reply Result"
                value={wordResult}
                actions={actions}
                onCommit={(value) => onComplexCommit({ wordResult: value, wordResults: [value, 0, 0, 0] })}
              />
            </div>
          </section>
        </div>
      </section>
    );
  }
  const autoRunResultFour = (choiceResults[0] ?? 0) === SIMPLE_RESULT_AUTO_FAIL_SENTINEL;
  return (
    <section className="encounter-result-editor simple-encounter-options-panel">
      <header>
        <div>
          <TutorialTip title="Simple Player Options" body={SIMPLE_OPTIONS_HELP} side="below">
            <strong>Player Options</strong>
          </TutorialTip>
          <small>{count} classic Pascal text buffers, {maxLength} display bytes each</small>
        </div>
      </header>
      {autoRunResultFour && (
        <p className="simple-encounter-sentinel-note">This encounter skips the choice prompt and immediately runs Result #4.</p>
      )}
      <div className="encounter-result-table simple-encounter-options-table">
        {Array.from({ length: 4 }, (_, slot) => {
          const text = texts[slot] ?? "";
          return (
            <div key={slot} className="encounter-result-row simple-encounter-option-row">
              <b>{`Option ${slot + 1}`}</b>
              <label className="script-encounter-text-field">
                <span>{encounterTextBufferLabel(slot)}</span>
                <textarea
                  key={`simple-choice-${slot}-${text}`}
                  defaultValue={text}
                  maxLength={maxLength}
                  onBlur={(event) => onTextCommit(slot, event.currentTarget.value)}
                />
                <small>{text.length}/{maxLength}</small>
              </label>
              <SimpleEncounterResultPicker
                slot={slot}
                value={choiceResults[slot] ?? 0}
                actions={actions}
                onCommit={(value) => onChoiceCommit(slot, value)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SimpleEncounterResultPicker({
  slot,
  value,
  actions,
  onCommit
}: {
  slot: number;
  value: number;
  actions: EncounterActionRow[];
  onCommit: (value: number) => void;
}) {
  const validValues = slot === 0 ? [0, 1, 2, 3, 4, SIMPLE_RESULT_AUTO_FAIL_SENTINEL] : [0, 1, 2, 3, 4];
  const supported = validValues.includes(value);
  const status = value === 0
    ? "missing"
    : value === SIMPLE_RESULT_AUTO_FAIL_SENTINEL && slot === 0
      ? encounterResultStatus(actions, 4)
      : supported
        ? encounterResultStatus(actions, value)
        : "out-of-range";
  const statusLabel = value === 0
    ? "No result"
    : value === SIMPLE_RESULT_AUTO_FAIL_SENTINEL && slot === 0
      ? "Auto-run Result #4"
      : supported
        ? resultStatusLabel(status)
        : `Unsupported imported value ${value}`;
  return (
    <label className={`simple-encounter-result-picker is-${status}`} title={statusLabel}>
      <span>Result #</span>
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>0 No result / unavailable</option>
        <option value={1}>1 Result #1</option>
        <option value={2}>2 Result #2</option>
        <option value={3}>3 Result #3</option>
        <option value={4}>4 Result #4</option>
        {slot === 0 && <option value={SIMPLE_RESULT_AUTO_FAIL_SENTINEL}>-4 Auto-run Result #4</option>}
        {!supported && <option value={value}>{`Unsupported imported value ${value}`}</option>}
      </select>
      <small>{statusLabel}</small>
    </label>
  );
}

function ComplexEncounterResponseGrid({
  project,
  catalog,
  title,
  className,
  help,
  count,
  kind,
  resultLabel,
  ids,
  results,
  actions,
  onIdsCommit,
  onResultsCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  title: string;
  className?: string;
  help?: string;
  count: number;
  kind: "magic" | "item";
  resultLabel: string;
  ids: number[];
  results: number[];
  actions: EncounterActionRow[];
  onIdsCommit: (values: number[]) => void;
  onResultsCommit: (values: number[]) => void;
}) {
  const [activeDraftSlots, setActiveDraftSlots] = useState<Set<number>>(() => new Set());
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const responseSpellOptions = useMemo(
    () => kind === "magic" ? spellReferenceOptions(project, catalog) : [],
    [catalog, kind, project]
  );
  const responseItemOptions = useMemo(
    () => kind === "item" ? deduplicatedItemResponseOptions(project, catalog) : [],
    [catalog, kind, project]
  );
  const blankId = kind === "magic" ? MAGIC_RESPONSE_BLANK_SPELL_ID : 0;
  const isBlankStoredValue = (slot: number) => {
    const id = ids[slot] ?? 0;
    const result = results[slot] ?? 0;
    if (kind === "magic") return (id === 0 || id === MAGIC_RESPONSE_BLANK_SPELL_ID) && result === 0;
    return id === 0 && result === 0;
  };
  const hasStoredValue = (slot: number) => !isBlankStoredValue(slot);
  const hasVisibleValue = (slot: number) => hasStoredValue(slot) || activeDraftSlots.has(slot);
  const isPreservedNoResult = (slot: number) => hasStoredValue(slot) && (results[slot] ?? 0) === 0;
  const slots = Array.from({ length: count }, (_, slot) => slot);
  const setDraftSlotActive = (slot: number, active: boolean) => {
    setActiveDraftSlots((current) => {
      const next = new Set(current);
      if (active) next.add(slot);
      else next.delete(slot);
      return next;
    });
  };
  return (
    <section className={`complex-encounter-response-grid${className ? ` ${className}` : ""}`}>
      <header>
        {help ? (
          <TutorialTip title={title} body={help} side="below">
            <strong>{title}</strong>
          </TutorialTip>
        ) : (
          <strong>{title}</strong>
        )}
      </header>
      <div>
        {slots.map((slot) => {
          const selection = encounterResponseSelection(
            kind,
            ids[slot] ?? 0,
            responseSpellOptions,
            responseItemOptions
          );
          return (
            <div
              key={slot}
              className={`complex-encounter-response-row${!hasVisibleValue(slot) ? " is-unused" : ""}${isPreservedNoResult(slot) ? " is-preserved-no-result" : ""}`}
            >
              <b>{slot + 1}</b>
              <EncounterResultNumberField
                label={resultLabel}
                value={results[slot] ?? 0}
                actions={actions}
                onDraftActiveChange={(active) => setDraftSlotActive(slot, active)}
                onCommit={(value) => onResultsCommit(updateArraySlot(results, slot, value, count))}
              />
              <ComplexEncounterResponseValue
                kind={kind}
                responseNumber={slot + 1}
                selection={selection}
              />
              <div className="encounter-action-row-actions complex-encounter-response-actions">
                <button
                  type="button"
                  className="encounter-action-preview"
                  title={`Browse ${kind === "magic" ? "spells and scrolls" : "items"}`}
                  aria-label={`Browse ${kind === "magic" ? "magic" : "item"} response ${slot + 1}`}
                  onClick={() => setPickerSlot(slot)}
                >
                  <Eye size={12} />
                </button>
                {hasStoredValue(slot) && (
                  <button
                    type="button"
                    className="encounter-action-clear"
                    title="Clear"
                    aria-label={`Clear ${kind === "magic" ? "magic" : "item"} response ${slot + 1}`}
                    onClick={() => {
                      onIdsCommit(updateArraySlot(ids, slot, blankId, count));
                      onResultsCommit(updateArraySlot(results, slot, 0, count));
                    }}
                  >
                    <X size={12} />
                  </button>
                )}
                {!hasStoredValue(slot) && <span className="encounter-action-clear-placeholder" aria-hidden="true" />}
              </div>
            </div>
          );
        })}
      </div>
      {pickerSlot != null && (
        <ComplexEncounterResponsePickerPanel
          key={`${kind}-${pickerSlot}`}
          project={project}
          catalog={catalog}
          kind={kind}
          responseNumber={pickerSlot + 1}
          value={ids[pickerSlot] ?? 0}
          onChange={(value) => onIdsCommit(updateArraySlot(ids, pickerSlot, value, count))}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </section>
  );
}

function EncounterResultNumberField({
  label,
  value,
  actions,
  onCommit,
  onDraftActiveChange
}: {
  label: string;
  value: number;
  actions: EncounterActionRow[];
  onCommit: (value: number) => void;
  onDraftActiveChange?: (active: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
    onDraftActiveChange?.(value !== 0);
  }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next) && next !== value) onCommit(next);
  };
  const status = value === 0 ? "missing" : encounterResultStatus(actions, value);
  const statusLabel = value === 0 ? "No result" : resultStatusLabel(status);
  return (
    <label className={`encounter-result-number-field is-${status}`} title={statusLabel}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          setDraft(nextDraft);
          onDraftActiveChange?.(Number(nextDraft) !== 0);
        }}
        onBlur={commit}
      />
    </label>
  );
}

function encounterTextBufferLabel(slot: number) {
  return ["Choice 1 Label", "Choice 2 Label", "Choice 3 Label", "Choice 4 Label"][slot] ?? `Text Buffer ${slot}`;
}
