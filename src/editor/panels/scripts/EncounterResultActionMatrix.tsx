import { useState, type ReactNode } from "react";
import { Volume2 } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type {
  EncounterActionRow,
  LibraryCatalog,
  Project,
  ProjectCommand,
  SelectedEntity,
  RealmzTargetRecordKind
} from "../../types";
import { parameterLabelsForOpcode } from "../../opcodeCrosswalk";
import { actionOptionFor } from "../../realmzActions";
import {
  ENCOUNTER_RESULT_COUNT,
  ENCOUNTER_RESULT_ROWS,
  encounterActionAt,
  encounterResultColumnSummary,
  resultActionBaseCode,
  resultStatusLabel,
  type EncounterDecisionSource
} from "./encounterFlow";
import { EncounterResultActionCell } from "./EncounterResultActionCell";
import { ContextualEcodeSettingsModal } from "./ContextualEcodeSettingsModal";
import { ContextualDirectActionModal } from "./ContextualDirectActionModal";
import {
  encounterEcodeSettingsState,
  encounterEcodeTargetRowId,
  type EncounterEcodeSettingsState
} from "./encounterEcodeSettings";
import { ResultCodeHelperPanel } from "./EncounterResultCodeHelper";
import { EncounterResultSoundPreview } from "./EncounterResultSoundPreview";
import {
  defaultDirectActionValue
} from "./directActionSettings";
import {
  EncounterResultTargetPreview,
  type EncounterResultTargetPreviewValue
} from "./EncounterResultTargetPreview";
import { nextAuthorableTargetId } from "./ReferenceIdField";

const ENCOUNTER_RESULT_ACTION_HELP =
  "Encounter result columns are the outcome scripts. Branch fields choose Result 1, 2, 3, or 4; Realmz then runs that column's ordered CODE/ID steps.";

type StoredPreviewType = Exclude<RealmzTargetRecordKind, "message" | "questLabel">;

export function EncounterResultActionMatrix({
  project,
  catalog,
  recordKind,
  recordId,
  actions,
  title,
  description,
  decisionSources,
  selectedResultIndex,
  onSelectResult,
  onUpdate,
  onCreateTarget,
  onApplyCommand,
  onSelectEntity,
  onOpenText,
  renderRecordPreview,
  previewContext = {}
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordKind: "simple" | "complex";
  recordId: number;
  actions: EncounterActionRow[];
  title: string;
  description: string;
  decisionSources: EncounterDecisionSource[];
  selectedResultIndex: number | null;
  onSelectResult: (resultIndex: number) => void;
  onUpdate: (slot: number, changes: Partial<EncounterActionRow>) => void;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenText?: (editor: "messages" | "option-labels") => void;
  renderRecordPreview: (targetType: StoredPreviewType, targetId: number) => ReactNode;
  previewContext?: PreviewRuntimeContext;
}) {
  const [codeHelperOpen, setCodeHelperOpen] = useState(false);
  const [soundPreviewOpen, setSoundPreviewOpen] = useState(false);
  const [targetPreview, setTargetPreview] = useState<EncounterResultTargetPreviewValue | null>(null);
  const [codeHelperSelectedCode, setCodeHelperSelectedCode] = useState(1);
  const [focusedResultCode, setFocusedResultCode] = useState<number | null>(null);
  const [pendingEcode, setPendingEcode] = useState<EncounterEcodeSettingsState | null>(null);
  const [pendingDirect, setPendingDirect] = useState<{
    slot: number;
    rawCode: number;
    initialValue: number;
  } | null>(null);
  const openCodeHelper = () => {
    const normalizedFocusedCode = focusedResultCode == null ? 0 : resultActionBaseCode(focusedResultCode);
    const selectedColumnAction = selectedResultIndex == null
      ? null
      : actions
        .slice(selectedResultIndex * ENCOUNTER_RESULT_ROWS, selectedResultIndex * ENCOUNTER_RESULT_ROWS + ENCOUNTER_RESULT_ROWS)
        .find((row) => resultActionBaseCode(row.rawCode) !== 0);
    const firstPopulatedAction = actions.find((row) => resultActionBaseCode(row.rawCode) !== 0);
    setCodeHelperSelectedCode(resultActionBaseCode(normalizedFocusedCode || selectedColumnAction?.rawCode || firstPopulatedAction?.rawCode || 1));
    setCodeHelperOpen(true);
  };
  const activeTargetPreview = targetPreview ? {
    ...targetPreview,
    opcode: encounterActionAt(actions, targetPreview.slot).rawCode,
    value: encounterActionAt(actions, targetPreview.slot).id
  } : null;
  const openEcodeSettings = (slot: number, rawCode: number) => {
    const next = encounterEcodeSettingsState(project, catalog, actions, slot, rawCode);
    if (next) setPendingEcode(next);
  };
  const openDirectSettings = (slot: number, rawCode: number) => {
    const current = encounterActionAt(actions, slot);
    const initialValue = resultActionBaseCode(current.rawCode) === resultActionBaseCode(rawCode)
      ? current.id
      : defaultDirectActionValue(rawCode);
    setPendingDirect({ slot, rawCode, initialValue });
  };
  return (
    <section className="simple-encounter-action-matrix">
      <header>
        <div>
          <TutorialTip title={title} body={ENCOUNTER_RESULT_ACTION_HELP} side="below">
            <strong>{title}</strong>
          </TutorialTip>
          <small>{description}</small>
        </div>
        <div className="encounter-result-tools">
          <button type="button" className="btn btn-secondary btn-xs encounter-code-helper-button" onClick={() => setSoundPreviewOpen(true)}>
            <Volume2 size={12} /> Preview Sound
          </button>
          <button type="button" className="btn btn-secondary btn-xs encounter-code-helper-button" onClick={openCodeHelper}>
            Code Helper
          </button>
        </div>
      </header>
      <div className="simple-encounter-result-columns">
        {Array.from({ length: ENCOUNTER_RESULT_COUNT }, (_, resultIndex) => {
          const summary = encounterResultColumnSummary(actions, resultIndex, decisionSources);
          return (
            <div key={resultIndex} className={`simple-encounter-result-column ${summary.status}${selectedResultIndex === resultIndex ? " selected" : ""}`}>
              <header>
                <button type="button" className="encounter-result-column-title" onClick={() => onSelectResult(resultIndex)}>
                  <strong>Result #{resultIndex + 1}</strong>
                  <small>{summary.incoming} incoming | {resultStatusLabel(summary.status)}</small>
                </button>
              </header>
              {Array.from({ length: ENCOUNTER_RESULT_ROWS }, (_, rowIndex) => {
                const slot = resultIndex * ENCOUNTER_RESULT_ROWS + rowIndex;
                return (
                  <EncounterResultActionCell
                    key={slot}
                    project={project}
                    catalog={catalog}
                    recordKind={recordKind}
                    slot={slot}
                    row={encounterActionAt(actions, slot)}
                    onUpdate={(changes) => onUpdate(slot, changes)}
                    onFocusCode={(code) => setFocusedResultCode(resultActionBaseCode(code))}
                    onPreviewTarget={(opcode, value) => setTargetPreview({ slot, opcode, value })}
                    onEditSettings={(rawCode) => openEcodeSettings(slot, rawCode)}
                    onEditDirect={(rawCode) => openDirectSettings(slot, rawCode)}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      {codeHelperOpen && (
        <ResultCodeHelperPanel
          selectedCode={codeHelperSelectedCode}
          onSelectCode={setCodeHelperSelectedCode}
          onClose={() => setCodeHelperOpen(false)}
        />
      )}
      {soundPreviewOpen && (
        <EncounterResultSoundPreview
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          onClose={() => setSoundPreviewOpen(false)}
        />
      )}
      {activeTargetPreview && (
        <EncounterResultTargetPreview
          project={project}
          catalog={catalog}
          preview={activeTargetPreview}
          previewContext={previewContext}
          renderRecordPreview={renderRecordPreview}
          onCreateTarget={onCreateTarget}
          onChange={(value) => {
            onUpdate(activeTargetPreview.slot, { id: value });
          }}
          onClose={() => setTargetPreview(null)}
        />
      )}
      {pendingEcode && (
        <ContextualEcodeSettingsModal
          project={project}
          catalog={catalog}
          title={`${pendingEcode.definition.label} — ${recordKind === "simple" ? "Simple" : "Complex"} Encounter ${recordId}`}
          description={`Configure Result #${Math.floor(pendingEcode.slot / ENCOUNTER_RESULT_ROWS) + 1}, step ${(pendingEcode.slot % ENCOUNTER_RESULT_ROWS) + 1}. The raw settings ID is managed automatically.`}
          rawCode={pendingEcode.rawCode}
          rowId={pendingEcode.editorRowId}
          shape={pendingEcode.shape}
          initialValues={pendingEcode.initialValues}
          secondaryRowId={pendingEcode.secondaryRowId}
          secondaryShape={pendingEcode.secondaryShape}
          secondaryInitialValues={pendingEcode.secondaryInitialValues}
          parameterLabels={parameterLabelsForOpcode(pendingEcode.rawCode)}
          selectedSlotLabel={`${recordKind} encounter ${recordId} result step ${pendingEcode.slot + 1}`}
          sourceUsage={pendingEcode.sourceUsage}
          defaultWriteMode={pendingEcode.defaultWriteMode}
          allowSharedEdit={pendingEcode.allowSharedEdit}
          onSelectEntity={onSelectEntity}
          onOpenText={onOpenText}
          onCancel={() => setPendingEcode(null)}
          onApply={(draft) => {
            const rowId = encounterEcodeTargetRowId(pendingEcode, draft.writeMode);
            onApplyCommand?.({
              kind: "applyEncounterResultSettings",
              label: `Apply ${pendingEcode.definition.shortLabel} settings`,
              recordKind,
              encounterId: recordId,
              slot: pendingEcode.slot,
              rawCode: pendingEcode.rawCode,
              rowId,
              edcdValues: draft.values,
              secondaryEdcdValues: draft.secondaryValues
            });
            setPendingEcode(null);
          }}
        />
      )}
      {pendingDirect && (
        <ContextualDirectActionModal
          project={project}
          catalog={catalog}
          title={`${scriptTitle(pendingDirect.rawCode)} — ${recordKind === "simple" ? "Simple" : "Complex"} Encounter ${recordId}`}
          description={`Configure Result #${Math.floor(pendingDirect.slot / ENCOUNTER_RESULT_ROWS) + 1}, step ${(pendingDirect.slot % ENCOUNTER_RESULT_ROWS) + 1}. Providence stores the selected behavior in the action's ID field.`}
          rawCode={pendingDirect.rawCode}
          initialValue={pendingDirect.initialValue}
          previewContext={previewContext}
          onInspect={onSelectEntity}
          onCreate={(recordType, requestedId) => {
            const targetId = requestedId ?? nextAuthorableTargetId(project, recordType);
            onCreateTarget(recordType, targetId);
            return targetId;
          }}
          onCancel={() => setPendingDirect(null)}
          onApply={(value) => {
            onUpdate(pendingDirect.slot, { rawCode: pendingDirect.rawCode, id: value });
            setPendingDirect(null);
          }}
        />
      )}
    </section>
  );
}

function scriptTitle(rawCode: number) {
  const option = actionOptionFor(resultActionBaseCode(rawCode));
  return option?.displayTitle ?? option?.shortLabel ?? `Opcode ${resultActionBaseCode(rawCode)}`;
}
