import { Copy } from "lucide-react";
import { EdcdRowEditor } from "../../components/EdcdRowEditor";
import { nextUnusedEdcdRowId, normalizeEdcdValues, type EdcdRowUsage } from "../../edcdRows";
import type { OpcodeParameterLabel } from "../../opcodeCrosswalk";
import { edcdFieldNamesForShape } from "../../realmzEdcd";
import type { LibraryCatalog, MapCoordinateTarget, Project, ProjectCommand, SelectedEntity } from "../../types";
import type { ScriptActionDefinition } from "./scriptActionCatalog";
import { actionSettingsFieldLabel, actionSettingsTitleForStep, authorSettingsWarning } from "./actionPointPresentation";

type SelectedEdcdUsage = {
  rowId?: number;
  shape?: string;
  fields?: { name?: string; value?: number }[];
  secondaryRowId?: number;
  secondaryShape?: string;
  secondaryFields?: { name?: string; value?: number }[];
  diagnostics?: string[];
  summary?: string;
};

export function duplicateActionPointSettings({
  project,
  rowUsage,
  defaultValues,
  settingsLabel,
  selectedDraft,
  selectedSlotApplied,
  selectedTriggerId,
  selectedSlot
}: {
  project: Project;
  rowUsage?: EdcdRowUsage | null;
  defaultValues?: readonly [number, number, number, number, number];
  settingsLabel: string;
  selectedDraft: { rawCode: number; id: number };
  selectedSlotApplied: boolean;
  selectedTriggerId: string;
  selectedSlot: number;
}) {
  const nextId = nextUnusedEdcdRowId(project);
  const values = normalizeEdcdValues(rowUsage?.values ?? defaultValues);
  const commands: ProjectCommand[] = [
    { kind: "updateEdcdRow", label: `Duplicate ${settingsLabel}`, rowId: nextId, values }
  ];
  if (selectedSlotApplied) {
    commands.push({
      kind: "updateActionSlot",
      label: `Use ${settingsLabel}`,
      triggerId: selectedTriggerId,
      slot: selectedSlot,
      rawCode: selectedDraft.rawCode,
      id: nextId
    });
  }
  return { nextDraft: { ...selectedDraft, id: nextId }, commands };
}

export function ActionPointSettingsEditor({
  project,
  catalog,
  selectedSlot,
  selectedDraft,
  selectedSlotApplied,
  selectedDefinition,
  selectedEdcdUsage,
  selectedRowUsage,
  selectedTriggerId,
  edcdShape,
  defaultValues,
  parameterLabels,
  onSetSelectedDraft,
  onSelectEntity,
  onOpenText,
  onOpenMapCoordinate,
  onDraftValuesChange,
  onSecondaryDraftValuesChange,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedSlot: number;
  selectedDraft: { rawCode: number; id: number };
  selectedSlotApplied: boolean;
  selectedDefinition: ScriptActionDefinition;
  selectedEdcdUsage?: SelectedEdcdUsage;
  selectedRowUsage?: EdcdRowUsage | null;
  selectedTriggerId: string;
  edcdShape?: string;
  defaultValues?: readonly [number, number, number, number, number];
  parameterLabels: OpcodeParameterLabel[];
  onSetSelectedDraft: (draft: { rawCode: number; id: number }) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenText?: (editor: string) => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  onDraftValuesChange?: (values: number[], dirty: boolean) => void;
  onSecondaryDraftValuesChange?: (values: number[], dirty: boolean) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const isEdcdBackedStep = Boolean(edcdShape);
  if (!isEdcdBackedStep && !selectedEdcdUsage) return null;

  const settingsTitle = actionSettingsTitleForStep(selectedDefinition, edcdShape);
  const settingsLabel = actionSettingsFieldLabel(settingsTitle);
  const presentation = isEdcdBackedStep ? "selected-step" : "inventory";
  const sourceLevelType = project.triggers.find((trigger) => trigger.id === selectedTriggerId)?.levelType ?? null;
  const duplicateSettingsForStep = () => {
    if (!isEdcdBackedStep) return;
    const duplicate = duplicateActionPointSettings({
      project,
      rowUsage: selectedRowUsage,
      defaultValues,
      settingsLabel,
      selectedDraft,
      selectedSlotApplied,
      selectedTriggerId,
      selectedSlot
    });
    onApplyCommand?.(duplicate.commands[0]);
    onSetSelectedDraft(duplicate.nextDraft);
    duplicate.commands.slice(1).forEach((command) => onApplyCommand?.(command));
  };
  const editor = (
    <EdcdRowEditor
      project={project}
      catalog={catalog}
      edcdUsage={selectedEdcdUsage}
      fallbackRowId={selectedDraft.id}
      fallbackShape={edcdShape}
      fallbackFieldNames={edcdFieldNamesForShape(edcdShape)}
      fallbackInitialValues={defaultValues}
      fallbackOpcode={selectedDraft.rawCode}
      parameterLabels={parameterLabels}
      selectedSlotLabel={`step ${selectedSlot + 1}`}
      onSelectEntity={onSelectEntity}
      onOpenText={onOpenText}
      onOpenMapCoordinate={onOpenMapCoordinate}
      onDraftValuesChange={onDraftValuesChange}
      onSecondaryDraftValuesChange={onSecondaryDraftValuesChange}
      onStepOpcodeChange={(rawCode) => {
        if (rawCode !== 23 && rawCode !== -23) return;
        if (selectedDraft.rawCode === rawCode) return;
        onSetSelectedDraft({ ...selectedDraft, rawCode });
      }}
      onApplyCommand={onApplyCommand}
      showActionButtons={presentation !== "selected-step"}
      presentation={presentation}
      sourceLevelType={sourceLevelType}
    />
  );

  return (
    <>
      {isEdcdBackedStep && selectedRowUsage?.warnings.map((warning) => (
        <p key={warning} className="field-warning">{authorSettingsWarning(selectedRowUsage, settingsTitle, warning)}</p>
      ))}
      {isEdcdBackedStep && selectedRowUsage?.status === "shared" && (
        <button type="button" className="btn btn-secondary btn-xs duplicate-settings-button" onClick={duplicateSettingsForStep}>
          <Copy size={12} /> Duplicate {settingsTitle} For This Step
        </button>
      )}
      {presentation === "inventory" ? <div className="realmz-current-step-authoring-subpane">{editor}</div> : editor}
    </>
  );
}
