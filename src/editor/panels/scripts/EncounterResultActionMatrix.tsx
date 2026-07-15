import { useState, type ReactNode } from "react";
import { Volume2 } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type {
  EncounterActionRow,
  LibraryCatalog,
  Project,
  RealmzTargetRecordKind
} from "../../types";
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
import { ResultCodeHelperPanel } from "./EncounterResultCodeHelper";
import { EncounterResultSoundPreview } from "./EncounterResultSoundPreview";
import {
  EncounterResultTargetPreview,
  type EncounterResultTargetPreviewValue
} from "./EncounterResultTargetPreview";

const ENCOUNTER_RESULT_ACTION_HELP =
  "Encounter result columns are the outcome scripts. Branch fields choose Result 1, 2, 3, or 4; Realmz then runs that column's ordered CODE/ID steps.";

type StoredPreviewType = Exclude<RealmzTargetRecordKind, "message" | "questLabel">;

export function EncounterResultActionMatrix({
  project,
  catalog,
  actions,
  title,
  description,
  decisionSources,
  selectedResultIndex,
  onSelectResult,
  onUpdate,
  onCreateTarget,
  renderRecordPreview,
  previewContext = {}
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  actions: EncounterActionRow[];
  title: string;
  description: string;
  decisionSources: EncounterDecisionSource[];
  selectedResultIndex: number | null;
  onSelectResult: (resultIndex: number) => void;
  onUpdate: (slot: number, changes: Partial<EncounterActionRow>) => void;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
  renderRecordPreview: (targetType: StoredPreviewType, targetId: number) => ReactNode;
  previewContext?: PreviewRuntimeContext;
}) {
  const [codeHelperOpen, setCodeHelperOpen] = useState(false);
  const [soundPreviewOpen, setSoundPreviewOpen] = useState(false);
  const [targetPreview, setTargetPreview] = useState<EncounterResultTargetPreviewValue | null>(null);
  const [codeHelperSelectedCode, setCodeHelperSelectedCode] = useState(1);
  const [focusedResultCode, setFocusedResultCode] = useState<number | null>(null);
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
                    slot={slot}
                    row={encounterActionAt(actions, slot)}
                    onUpdate={(changes) => onUpdate(slot, changes)}
                    onFocusCode={(code) => setFocusedResultCode(resultActionBaseCode(code))}
                    onPreviewTarget={(opcode, value) => setTargetPreview({ slot, opcode, value })}
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
    </section>
  );
}
