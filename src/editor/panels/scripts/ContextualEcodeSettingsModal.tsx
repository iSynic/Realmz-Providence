import { useCallback, useId, useMemo, useState, type FormEvent } from "react";
import { Save, X } from "lucide-react";
import { EdcdRowEditor, type EdcdEditorUsage } from "../../components/EdcdRowEditor";
import { normalizeEdcdValues, type EdcdRowUsage } from "../../edcdRows";
import type { OpcodeParameterLabel } from "../../opcodeCrosswalk";
import { edcdFieldNamesForShape } from "../../realmzEdcd";
import { scriptActionSummary } from "./scriptActionCatalog";
import type {
  LevelType,
  LibraryCatalog,
  MapCoordinateTarget,
  MapEntity,
  Project,
  SelectedEntity
} from "../../types";
import { ModalDialog, ModalDialogActions, ModalDialogHeader } from "../../ui";

export type ContextualEcodeWriteMode = "replace" | "duplicate";

export type ContextualEcodeSettingsDraft = {
  values: [number, number, number, number, number];
  secondaryValues?: [number, number, number, number, number];
  writeMode: ContextualEcodeWriteMode;
};

export type ContextualEcodeSettingsModalProps = {
  project: Project;
  catalog?: LibraryCatalog | null;
  title: string;
  description: string;
  rawCode: number;
  rowId: number;
  shape: string;
  initialValues: readonly number[];
  secondaryRowId?: number | null;
  secondaryShape?: string | null;
  secondaryInitialValues?: readonly number[];
  parameterLabels: OpcodeParameterLabel[];
  selectedSlotLabel: string;
  sourceUsage?: EdcdRowUsage | null;
  defaultWriteMode?: ContextualEcodeWriteMode;
  allowSharedEdit?: boolean;
  sourceLevelType?: LevelType | null;
  previewMap?: Pick<MapEntity, "levelType" | "index"> | null;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenText?: (editor: "messages" | "option-labels") => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  onApply: (draft: ContextualEcodeSettingsDraft) => void;
  onCancel: () => void;
};

export function contextualEcodeDraft(
  values: readonly number[],
  secondaryValues: readonly number[] | undefined,
  writeMode: ContextualEcodeWriteMode
): ContextualEcodeSettingsDraft {
  return {
    values: normalizeEdcdValues(values),
    ...(secondaryValues ? { secondaryValues: normalizeEdcdValues(secondaryValues) } : {}),
    writeMode
  };
}

export function ContextualEcodeSettingsModal({
  project,
  catalog,
  title,
  description,
  rawCode,
  rowId,
  shape,
  initialValues,
  secondaryRowId = null,
  secondaryShape = null,
  secondaryInitialValues,
  parameterLabels,
  selectedSlotLabel,
  sourceUsage,
  defaultWriteMode = "replace",
  allowSharedEdit = false,
  sourceLevelType = null,
  previewMap = null,
  onSelectEntity,
  onOpenText,
  onOpenMapCoordinate,
  onApply,
  onCancel
}: ContextualEcodeSettingsModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [values, setValues] = useState(() => normalizeEdcdValues(initialValues));
  const [secondaryValues, setSecondaryValues] = useState<[number, number, number, number, number] | undefined>(
    () => secondaryInitialValues ? normalizeEdcdValues(secondaryInitialValues) : undefined
  );
  const [writeMode, setWriteMode] = useState<ContextualEcodeWriteMode>(defaultWriteMode);
  const [draftIssue, setDraftIssue] = useState<string | null>(null);
  const fieldNames = useMemo(
    () => edcdFieldNamesForShape(shape) ?? ["param0", "param1", "param2", "param3", "param4"],
    [shape]
  );
  const secondaryFieldNames = useMemo(
    () => secondaryShape ? edcdFieldNamesForShape(secondaryShape) ?? ["param0", "param1", "param2", "param3", "param4"] : [],
    [secondaryShape]
  );
  const editorUsage = useMemo<EdcdEditorUsage>(() => ({
    rowId,
    shape,
    opcode: rawCode,
    fields: fieldNames.map((name, index) => ({ name, value: values[index] ?? 0 })),
    summary: sourceUsage?.summary,
    ...(secondaryRowId != null && secondaryShape
      ? {
          secondaryRowId,
          secondaryShape,
          secondaryFields: secondaryFieldNames.map((name, index) => ({
            name,
            value: secondaryValues?.[index] ?? 0
          }))
        }
      : {})
  }), [
    fieldNames,
    rawCode,
    rowId,
    secondaryFieldNames,
    secondaryRowId,
    secondaryShape,
    secondaryValues,
    shape,
    sourceUsage?.summary,
    values
  ]);
  const summary = scriptActionSummary(
    project,
    catalog,
    { rawCode, id: rowId, parameters: values },
    "",
    sourceLevelType
  );
  const captureValues = useCallback((draft: number[]) => {
    setValues(normalizeEdcdValues(draft));
  }, []);
  const captureSecondaryValues = useCallback((draft: number[]) => {
    setSecondaryValues(normalizeEdcdValues(draft));
  }, []);
  const apply = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (draftIssue) return;
    onApply(contextualEcodeDraft(values, secondaryValues, writeMode));
  };
  const sourceRowId = sourceUsage?.rowId;
  const copying = writeMode === "duplicate" && sourceRowId != null && sourceRowId !== rowId;

  return (
    <ModalDialog
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      className="ecode-settings-modal"
      surfaceTag="form"
      onDismiss={onCancel}
      onSubmit={apply}
    >
      <ModalDialogHeader
        titleId={titleId}
        title={title}
        description={<span id={descriptionId}>{description}</span>}
        actions={(
          <button type="button" className="btn btn-ghost btn-xs" aria-label="Close action settings" onClick={onCancel}>
            <X size={14} />
          </button>
        )}
      />
      <div className="ecode-settings-modal-body">
        <div className="ecode-settings-modal-summary" aria-live="polite">
          <span>Current behavior</span>
          <strong>{summary || `Opcode ${Math.abs(rawCode)} settings`}</strong>
        </div>
        {sourceUsage && sourceUsage.warnings.length > 0 && (
          <div className={`ecode-settings-storage-state ${sourceUsage.status}`}>
            <strong>{sourceUsage.statusLabel} settings</strong>
            {sourceUsage.warnings.map((warning) => <p key={warning}>{warning}</p>)}
            {sourceUsage.callers.length > 0 && (
              <details>
                <summary>{sourceUsage.callers.length} known caller{sourceUsage.callers.length === 1 ? "" : "s"}</summary>
                <ul>
                  {sourceUsage.callers.map((caller) => (
                    <li key={`${caller.contextKind}:${caller.triggerRecordIndex}:${caller.slot}`}>
                      {callerLabel(caller.contextKind, caller.triggerRecordIndex, caller.slot)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {(defaultWriteMode === "duplicate" || allowSharedEdit) && sourceRowId != null && (
          <fieldset className="ecode-settings-write-mode">
            <legend>How should these settings be saved?</legend>
            <label>
              <input
                type="radio"
                name="ecode-write-mode"
                value="duplicate"
                checked={writeMode === "duplicate"}
                onChange={() => setWriteMode("duplicate")}
              />
              <span>Duplicate for this result</span>
              <small>Create settings {rowId} and leave every other caller unchanged.</small>
            </label>
            {allowSharedEdit && (
              <label>
                <input
                  type="radio"
                  name="ecode-write-mode"
                  value="replace"
                  checked={writeMode === "replace"}
                  onChange={() => setWriteMode("replace")}
                />
                <span>Edit shared settings</span>
                <small>Update settings {sourceRowId} for every listed caller.</small>
              </label>
            )}
          </fieldset>
        )}
        <EdcdRowEditor
          project={project}
          catalog={catalog}
          edcdUsage={editorUsage}
          fallbackRowId={rowId}
          fallbackShape={shape}
          fallbackFieldNames={fieldNames}
          fallbackInitialValues={initialValues}
          fallbackOpcode={rawCode}
          parameterLabels={parameterLabels}
          selectedSlotLabel={selectedSlotLabel}
          onSelectEntity={onSelectEntity}
          onOpenText={onOpenText}
          onOpenMapCoordinate={onOpenMapCoordinate}
          onDraftValuesChange={captureValues}
          onSecondaryDraftValuesChange={captureSecondaryValues}
          onDraftValidityChange={setDraftIssue}
          showActionButtons={false}
          presentation="selected-step"
          sourceLevelType={sourceLevelType}
          previewMap={previewMap}
        />
      </div>
      <ModalDialogActions>
        <small className={`ecode-settings-apply-detail${draftIssue ? " field-warning" : ""}`}>
          {draftIssue ?? (copying ? `Creates settings ${rowId} for this result.` : `Saves settings ${writeMode === "replace" && sourceRowId != null ? sourceRowId : rowId}.`)}
        </small>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={Boolean(draftIssue)}>
          <Save size={14} /> Apply Settings
        </button>
      </ModalDialogActions>
    </ModalDialog>
  );
}

function callerLabel(contextKind: EdcdRowUsage["callers"][number]["contextKind"], recordIndex: number, slot: number) {
  if (contextKind === "simpleEncounter") return `Simple Encounter ${recordIndex}, result step ${slot + 1}`;
  if (contextKind === "complexEncounter") return `Complex Encounter ${recordIndex}, result step ${slot + 1}`;
  return `Action Point ${recordIndex}, step ${slot + 1}`;
}
