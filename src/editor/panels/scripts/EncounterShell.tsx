import { useEffect, useMemo, useState, type ReactNode } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import { ContextualBehaviorCard } from "../../components/ContextualBehaviorCard";
import type {
  EncounterActionRow,
  LibraryCatalog,
  Project,
  ProjectCommand,
  RealmzTargetRecordKind,
  SelectedEntity
} from "../../types";
import { CollapsibleSection, FormField } from "../../ui";
import { selectEntityFromId } from "../../utils";
import {
  buildEncounterDecisionSources,
  updateEncounterActionRow
} from "./encounterFlow";
import {
  EncounterCopyPanel,
  EncounterCopyRoutePreview,
  encounterCopyResponseSections,
  encounterCopyResultSections,
  type EncounterCopySource
} from "./EncounterCopyPanel";
import { EncounterPromptStringEditor } from "./EncounterPromptStringEditor";
import { EncounterRecordPicker } from "./EncounterRecordPicker";
import { EncounterRogueReferenceField } from "./EncounterRogueReferenceField";
import { EncounterResponseEditor } from "./EncounterResponseEditor";
import { EncounterResultActionMatrix } from "./EncounterResultActionMatrix";
import { InlineNumberField } from "./InlineNumberField";
import { updateArraySlot } from "./arraySlots";

const ENCOUNTER_SETUP_HELP =
  "Encounter setup owns the shared source fields: prompt string, back-out behavior, max attempts, and caste-success value. The prompt is a central String; option labels below are inline buffers.";
const COMPLEX_THIEF_BRANCH_HELP =
  "The complex thief branch links into a Rogue Encounter. That rogue scene decides which lock, trap, and thief actions are available, then returns result numbers into this Complex Encounter's result script columns.";

export function EncounterShell({
  project,
  recordKind,
  id,
  texts,
  prompt,
  canBackOut,
  maxTimes,
  casteSuccess,
  actionResult = 0,
  wordResult = 0,
  groups = [],
  spellIds = [],
  spellResults = [],
  itemIds = [],
  itemResults = [],
  choiceResults,
  thief,
  thiefSuccess,
  actions,
  catalog,
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  onSelectEntity,
  onSelectEditor,
  onSelectEncounterRecordType,
  onApplyCommand,
  renderRecordPreview
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  recordKind: "simple" | "complex";
  id: number;
  texts: string[];
  prompt: number;
  canBackOut: boolean;
  maxTimes: number;
  casteSuccess: number;
  actionResult?: number;
  wordResult?: number;
  groups?: number[];
  spellIds?: number[];
  spellResults?: number[];
  itemIds?: number[];
  itemResults?: number[];
  choiceResults: number[];
  thief?: boolean;
  thiefSuccess?: number;
  actions: EncounterActionRow[];
  onSelectEntity?: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onSelectEncounterRecordType?: (recordType: RealmzTargetRecordKind) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  renderRecordPreview: (targetType: Exclude<RealmzTargetRecordKind, "message" | "questLabel">, targetId: number) => ReactNode;
}) {
  const encounterRecordType: "simpleEncounter" | "complexEncounter" = recordKind === "simple" ? "simpleEncounter" : "complexEncounter";
  const update = (changes: Record<string, unknown>) => {
    if (recordKind === "simple") {
      onApplyCommand?.({ kind: "updateSimpleEncounterRecord", label: "Update simple encounter", id, changes });
    } else {
      onApplyCommand?.({ kind: "updateComplexEncounterRecord", label: "Update complex encounter", id, changes });
    }
  };
  const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const rogueRecord = recordKind === "complex" && thiefSuccess !== undefined
    ? project.thiefEncounters?.find((candidate) => candidate.id === thiefSuccess)
    : undefined;
  const resultFlowSources = useMemo(() => buildEncounterDecisionSources({
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
    thief: Boolean(thief),
    rogueId: thiefSuccess ?? 0,
    rogueRecord,
    actions
  }), [
    actionResult,
    actions,
    choiceResults,
    groups,
    itemIds,
    itemResults,
    recordKind,
    rogueRecord,
    spellIds,
    spellResults,
    texts,
    thief,
    thiefSuccess,
    wordResult
  ]);
  const resultFlowWarningCount = resultFlowSources.filter((source) => source.status !== "visible" && source.result !== 0).length;
  const resultFlowPreviewSections = useMemo(() => {
    const previewSource = (recordKind === "simple"
      ? {
        id,
        prompt,
        texts,
        choiceResults,
        actions,
        canBackOut,
        maxTimes,
        casteSuccess
      }
      : {
        id,
        prompt,
        texts,
        actions,
        actionResult,
        wordResult,
        groups,
        spellIds,
        spellResults,
        itemIds,
        itemResults,
        canBackOut,
        maxTimes,
        casteSuccess,
        thief: Boolean(thief),
        thiefSuccess: thiefSuccess ?? 0,
        thiefFail: 0
      }) as EncounterCopySource;
    return [
      ...encounterCopyResponseSections(project, catalog, recordKind, previewSource),
      ...encounterCopyResultSections(previewSource, resultFlowSources)
    ];
  }, [actionResult, actions, canBackOut, casteSuccess, catalog, choiceResults, groups, id, itemIds, itemResults, maxTimes, project, prompt, recordKind, resultFlowSources, spellIds, spellResults, texts, thief, thiefSuccess, wordResult]);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [copyPanelOpen, setCopyPanelOpen] = useState(false);
  useEffect(() => {
    setSelectedResultIndex(null);
    setSelectedOptionIndex(0);
    setPromptEditorOpen(false);
    setCopyPanelOpen(false);
  }, [id, recordKind]);
  const promptId = Math.abs(prompt);
  const promptRecord = promptId > 0 ? project.messages?.find((record) => record.id === promptId) ?? null : null;
  const [rogueTargetDraft, setRogueTargetDraft] = useState(thiefSuccess ?? 0);
  useEffect(() => {
    setRogueTargetDraft(thiefSuccess ?? 0);
  }, [thiefSuccess]);
  return (
    <>
      <div className="script-target-grid encounter-record-grid">
        <section className="encounter-setup-panel">
          <EncounterRecordPicker project={project} recordType={encounterRecordType} id={id} onSelectEntity={onSelectEntity} />
          <div className="encounter-setup-bar">
            <label className="encounter-setup-inline-field encounter-prompt-inline-field">
              <TutorialTip title="Prompt String" body={ENCOUNTER_SETUP_HELP} side="below">
                <span>Prompt String</span>
              </TutorialTip>
              <InlineNumberField ariaLabel="Prompt String ID" value={prompt} onCommit={(value) => update({ prompt: value })} />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              disabled={promptId <= 0}
              onClick={() => setPromptEditorOpen(true)}
            >
              Edit String
            </button>
            <span className="encounter-setup-divider" aria-hidden="true" />
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setCopyPanelOpen(true)}
            >
              Copy From
            </button>
            <span className="encounter-setup-divider" aria-hidden="true" />
            <label className="encounter-setup-inline-field encounter-checkbox-inline-field">
              <span>Can Back Out</span>
              <input type="checkbox" checked={canBackOut} onChange={(event) => update({ canBackOut: event.currentTarget.checked })} />
            </label>
            {recordKind === "complex" && (
              <>
                <span className="encounter-setup-divider" aria-hidden="true" />
                <div className="encounter-rogue-toggle-control">
                  <TutorialTip title="Rogue Encounter" body={COMPLEX_THIEF_BRANCH_HELP} side="below">
                    <span className="encounter-rogue-toggle-label">Has Rogue Encounter</span>
                  </TutorialTip>
                  <input
                    className="encounter-rogue-toggle-checkbox"
                    type="checkbox"
                    aria-label="Has Rogue Encounter"
                    checked={Boolean(thief)}
                    onChange={(event) => update({ thief: event.currentTarget.checked })}
                  />
                </div>
              </>
            )}
            <span className="encounter-setup-divider" aria-hidden="true" />
            <label className="encounter-setup-inline-field encounter-max-times-inline-field">
              <span>Max Times</span>
              <InlineNumberField ariaLabel="Max Times" value={maxTimes} onCommit={(value) => update({ maxTimes: value })} />
            </label>
          </div>
          {recordKind === "complex" && thief && (
            <EncounterRogueReferenceField
              project={project}
              value={rogueTargetDraft}
              disabled={!onApplyCommand}
              onChange={(nextId) => {
                setRogueTargetDraft(nextId);
                update({ thiefSuccess: nextId });
              }}
              onOpen={(nextId) => {
                onSelectEncounterRecordType?.("thiefEncounter");
                onSelectEditor?.("rogue");
                onSelectEntity?.(selectEntityFromId(`thief:${nextId}`));
              }}
            />
          )}
        </section>
        <ContextualBehaviorCard
          project={project}
          role="encounter"
          hook="enter"
          targetKind={encounterRecordType}
          recordId={String(id)}
          recordLabel={`${recordKind === "simple" ? "Simple" : "Complex"} Encounter ${id}`}
          onApplyCommand={onApplyCommand}
        />
        <div className="contextual-behavior-hook-card">
          <FormField
            label="Encounter option behavior"
            hint="Choose the player-facing option whose behavior you want to attach."
          >
            <select
              value={selectedOptionIndex}
              onChange={(event) => setSelectedOptionIndex(Number(event.currentTarget.value))}
            >
              {Array.from({ length: recordKind === "simple" ? 4 : 8 }, (_, slot) => (
                <option key={slot} value={slot}>
                  {`Option ${slot + 1}${texts[slot] ? ` · ${texts[slot]}` : ""}`}
                </option>
              ))}
            </select>
          </FormField>
          <ContextualBehaviorCard
            project={project}
            role="encounter"
            hook="option"
            targetKind={encounterRecordType}
            recordId={String(id)}
            recordLabel={`${recordKind === "simple" ? "Simple" : "Complex"} Encounter ${id}, option ${selectedOptionIndex + 1}`}
            slot={selectedOptionIndex}
            onApplyCommand={onApplyCommand}
          />
        </div>
        {selectedResultIndex != null ? (
          <ContextualBehaviorCard
            project={project}
            role="encounter"
            hook="result"
            targetKind={encounterRecordType}
            recordId={String(id)}
            recordLabel={`${recordKind === "simple" ? "Simple" : "Complex"} Encounter ${id}, result ${selectedResultIndex + 1}`}
            slot={selectedResultIndex}
            onApplyCommand={onApplyCommand}
          />
        ) : null}
        <ContextualBehaviorCard
          project={project}
          role="encounter"
          hook="complete"
          targetKind={encounterRecordType}
          recordId={String(id)}
          recordLabel={`${recordKind === "simple" ? "Simple" : "Complex"} Encounter ${id} completion`}
          onApplyCommand={onApplyCommand}
        />
      {recordKind === "simple" ? (
        <>
          <EncounterResponseEditor
            project={project}
            catalog={catalog}
            recordKind={recordKind}
            texts={texts}
            actionResult={actionResult}
            wordResult={wordResult}
            groups={groups}
            spellIds={spellIds}
            spellResults={spellResults}
            itemIds={itemIds}
            itemResults={itemResults}
            choiceResults={choiceResults}
            actions={actions}
            onTextCommit={(slot, text) => update({ texts: updateArraySlot(texts, slot, text, recordKind === "simple" ? 4 : 9) })}
            onChoiceCommit={(slot, value) => update({ choiceResults: updateArraySlot(choiceResults, slot, value, 4) })}
            onComplexCommit={(changes) => update(changes)}
          />
          <EncounterResultActionMatrix
            project={project}
            catalog={catalog}
            recordKind={recordKind}
            recordId={id}
            actions={actions}
            title="Result Action Columns"
            description="Simple encounters store eight CODE/ID steps for each of the four result numbers, matching the Divinity editor columns."
            decisionSources={resultFlowSources}
            selectedResultIndex={selectedResultIndex}
            onSelectResult={setSelectedResultIndex}
            onUpdate={(slot, changes) => update({ actions: updateEncounterActionRow(actions, slot, changes) })}
            onCreateTarget={(recordType, targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter action target", recordType, id: targetId })}
            onApplyCommand={onApplyCommand}
            onSelectEntity={onSelectEntity}
            onOpenText={(editor) => onSelectEditor?.(editor)}
            renderRecordPreview={renderRecordPreview}
            previewContext={{ desktopRuntime, projectDir, workspaceDir }}
          />
          <CollapsibleSection
            title="Result Flow Summary"
            eyebrow="qa"
            count={resultFlowWarningCount > 0 ? `${resultFlowWarningCount} warning${resultFlowWarningCount === 1 ? "" : "s"}` : `${resultFlowSources.length} path${resultFlowSources.length === 1 ? "" : "s"}`}
            density="compact"
            className="encounter-flow-summary-section"
            defaultOpen={false}
          >
            <EncounterCopyRoutePreview sections={resultFlowPreviewSections} />
          </CollapsibleSection>
        </>
      ) : (
        <>
          <section className="encounter-responses-panel">
            <header>
              <div>
                <strong>Encounter Responses</strong>
                <small>Define what the party can say, choose, use, cast, or attempt, then route each response to a result script.</small>
              </div>
            </header>
            <EncounterResponseEditor
              project={project}
              catalog={catalog}
              recordKind={recordKind}
              texts={texts}
              actionResult={actionResult}
              wordResult={wordResult}
              groups={groups}
              spellIds={spellIds}
              spellResults={spellResults}
              itemIds={itemIds}
              itemResults={itemResults}
              choiceResults={choiceResults}
              actions={actions}
              onTextCommit={(slot, text) => update({ texts: updateArraySlot(texts, slot, text, 9) })}
              onChoiceCommit={(slot, value) => update({ choiceResults: updateArraySlot(choiceResults, slot, value, 4) })}
              onComplexCommit={(changes) => update(changes)}
            />
          </section>
          <EncounterResultActionMatrix
            project={project}
            catalog={catalog}
            recordKind={recordKind}
            recordId={id}
            actions={actions}
            title="Result Scripts"
            description="Each result column holds the actions players see after a matching response succeeds."
            decisionSources={resultFlowSources}
            selectedResultIndex={selectedResultIndex}
            onSelectResult={setSelectedResultIndex}
            onUpdate={(slot, changes) => update({ actions: updateEncounterActionRow(actions, slot, changes) })}
            onCreateTarget={(recordType, targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter action target", recordType, id: targetId })}
            onApplyCommand={onApplyCommand}
            onSelectEntity={onSelectEntity}
            onOpenText={(editor) => onSelectEditor?.(editor)}
            renderRecordPreview={renderRecordPreview}
            previewContext={{ desktopRuntime, projectDir, workspaceDir }}
          />
        </>
      )}
      </div>
      {promptEditorOpen && promptId > 0 && (
        <EncounterPromptStringEditor
          id={promptId}
          record={promptRecord}
          onClose={() => setPromptEditorOpen(false)}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {copyPanelOpen && (
      <EncounterCopyPanel
        project={project}
        catalog={catalog}
        recordKind={recordKind}
        currentId={id}
        onClose={() => setCopyPanelOpen(false)}
          onApply={(changes) => {
            update(changes);
            setCopyPanelOpen(false);
          }}
        />
      )}
    </>
  );
}
