import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye } from "lucide-react";
import { signedTargetBehaviorLabel, targetOptionForOpcodeValue, targetPickerConfig } from "../../components/RealmzTargetPicker";
import { categoryColor } from "../../components/TileSprite";
import { divinityHelpForOpcode } from "../../divinityOpcodeHelp";
import type { EdcdRowUsage } from "../../edcdRows";
import { opcodeIdMeaning, parameterLabelsForOpcode } from "../../opcodeCrosswalk";
import {
  actionOptionFor,
  normalizeStepOpcode
} from "../../realmzActions";
import type { ScriptDiagnostic } from "../../scriptValidation";
import type { LibraryCatalog, MapCoordinateTarget, MapEntity, Project, ProjectCommand, SelectedEntity } from "../../types";
import { EmptyState } from "../../ui";
import { ActionPointActionChooser } from "./ActionPointActionChooser";
import { ActionPointDirectTargetField } from "./ActionPointDirectTargetField";
import { ActionPointInlineTargetEditor } from "./ActionPointInlineTargetEditor";
import { ActionPointSettingsEditor } from "./ActionPointSettingsEditor";
import { ActionPointStepReference } from "./ActionPointStepReference";
import { ActionPointTargetPreview } from "./ActionPointTargetPreview";
import { ContextualDirectActionModal } from "./ContextualDirectActionModal";
import { ScriptDiagnostics } from "./ScriptDiagnostics";
import { defaultDraftForProject } from "./actionPointDraft";
import {
  combatMacroActionNote,
  combatMacroContextTitle,
  humanActionValueLabel,
  type CombatMacroContext
} from "./actionPointPresentation";
import {
  actionDefinitionPathLabel,
  canonicalActionChooserOpcode,
  scriptActionDefinitionFor,
  type ScriptActionCategoryFilter,
  type ScriptActionDefinition
} from "./scriptActionCatalog";

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

export function SelectedActionPointStepEditor({
  project,
  catalog,
  selectedSlot,
  selectedDraft,
  selectedDraftDirty,
  selectedSlotApplied,
  selectedOption,
  selectedDefinition,
  selectedEdcdUsage,
  selectedRowUsage,
  selectedTriggerId,
  selectedEdcdRowId,
  selectedSlotDiagnostics,
  combatMacroContext,
  categoryFilter,
  opcodeQuery,
  filteredDefinitions,
  desktopRuntime,
  projectDir,
  workspaceDir,
  targetRecordPanel,
  targetRecordAvailable,
  targetRecordOpen,
  onShowTargetRecord,
  onSetCategoryFilter,
  onSetOpcodeQuery,
  onSetSelectedDraft,
  onSelectEntity,
  onPreviewEntity,
  onOpenTool,
  onOpenMapCoordinate,
  previewMap,
  onEdcdDraftChange,
  onSecondaryEdcdDraftChange,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedSlot: number;
  selectedDraft: { rawCode: number; id: number; mediaRequiredForProgression: boolean };
  selectedDraftDirty: boolean;
  selectedSlotApplied: boolean;
  selectedOption: ReturnType<typeof actionOptionFor>;
  selectedDefinition: ScriptActionDefinition;
  selectedEdcdUsage?: SelectedEdcdUsage;
  selectedRowUsage?: EdcdRowUsage | null;
  selectedTriggerId: string;
  selectedEdcdRowId: number | null;
  selectedSlotDiagnostics: ScriptDiagnostic[];
  combatMacroContext?: CombatMacroContext | null;
  categoryFilter: ScriptActionCategoryFilter;
  opcodeQuery: string;
  filteredDefinitions: ScriptActionDefinition[];
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  targetRecordPanel?: ReactNode;
  targetRecordAvailable?: boolean;
  targetRecordOpen?: boolean;
  onShowTargetRecord?: () => void;
  onSetCategoryFilter: (category: ScriptActionCategoryFilter) => void;
  onSetOpcodeQuery: (query: string) => void;
  onSetSelectedDraft: (values: {
    rawCode: number;
    id: number;
    mediaRequiredForProgression?: boolean;
  }) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onPreviewEntity: (entity: SelectedEntity) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  previewMap?: Pick<MapEntity, "levelType" | "index"> | null;
  onEdcdDraftChange?: (values: number[], dirty: boolean) => void;
  onSecondaryEdcdDraftChange?: (values: number[], dirty: boolean) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [actionChooserOpen, setActionChooserOpen] = useState(false);
  const [directSettingsOpen, setDirectSettingsOpen] = useState(false);
  const selectedDivinityHelp = divinityHelpForOpcode(selectedDraft.rawCode);
  const selectedIdLabel = selectedDefinition.target?.label ?? humanActionValueLabel(opcodeIdMeaning(selectedDraft.rawCode));
  const selectedDefaultEdcdValues = selectedDefinition.defaultDraft.parameters;
  const selectedParameterLabels = selectedDefinition.parameters.length > 0
    ? selectedDefinition.parameters.map((parameter) => ({
      index: parameter.index,
      label: parameter.label,
      help: parameter.help,
      internalName: parameter.internalName,
      preserved: parameter.preserved,
      targetFamily: parameter.targetFamily
    }))
    : parameterLabelsForOpcode(selectedDraft.rawCode);
  const visibleParameters = selectedDefinition.parameters.filter((parameter) => !parameter.preserved);
  const selectedTargetPreview = useMemo(() => {
    if (!selectedDefinition.target || selectedDefinition.target.targetFamily === "parameter-row") return null;
    return targetOptionForOpcodeValue(project, selectedDraft.rawCode, selectedDraft.id, catalog);
  }, [catalog, project, selectedDefinition.target, selectedDraft.id, selectedDraft.rawCode]);
  useEffect(() => {
    setPreviewExpanded(false);
  }, [selectedSlot, selectedDraft.rawCode, selectedDraft.id]);
  useEffect(() => {
    setActionChooserOpen(false);
    setDirectSettingsOpen(false);
  }, [selectedSlot]);
  useEffect(() => {
    setDirectSettingsOpen(false);
  }, [selectedDraft.rawCode]);
  const selectedCombatMacroActionNote = combatMacroActionNote(selectedDefinition.opcode, combatMacroContext ?? null);
  const settingLabels = visibleParameters.map((parameter) => `${parameter.index + 1}. ${parameter.label}`);
  const previewBehavior = signedTargetBehaviorLabel(selectedDraft.rawCode, selectedDraft.id);
  const isEdcdBackedStep = Boolean(selectedOption.edcdShape);
  const isSameMapActionPointStep = normalizeStepOpcode(selectedDraft.rawCode) === 8;
  const selectedTriggerRecord = useMemo(
    () => project.triggers.find((trigger) => trigger.id === selectedTriggerId) ?? null,
    [project.triggers, selectedTriggerId]
  );
  const sameMapActionPointTarget = useMemo(() => {
    if (!isSameMapActionPointStep || !selectedTriggerRecord?.levelType || selectedTriggerRecord.levelIndex == null) return null;
    return project.triggers.find((candidate) =>
      candidate.source !== "Data ED3" &&
      candidate.levelType === selectedTriggerRecord.levelType &&
      candidate.levelIndex === selectedTriggerRecord.levelIndex &&
      candidate.recordIndex === selectedDraft.id
    ) ?? null;
  }, [isSameMapActionPointStep, project.triggers, selectedDraft.id, selectedTriggerRecord]);
  const sameMapActionPointJumpTitle = sameMapActionPointTarget
    ? `Open Action Point ${sameMapActionPointTarget.recordIndex} on this map.`
    : selectedTriggerRecord?.levelType && selectedTriggerRecord.levelIndex != null
      ? `No Action Point ${selectedDraft.id} exists on this map.`
      : "This script is not attached to a map, so there is no same-map Action Point to open.";
  const hasInlineTargetPicker = !isEdcdBackedStep && Boolean(targetPickerConfig(selectedDraft.rawCode));
  const isStepOnlyAction = selectedDefinition.formKind === "step-only";
  const previewCanExpand = Boolean(
    !hasInlineTargetPicker && selectedTargetPreview && [
      selectedTargetPreview.detail,
      selectedTargetPreview.summary,
      selectedTargetPreview.compatibility,
      selectedTargetPreview.sourceState,
      previewBehavior
    ].filter(Boolean).join(" ").length > 96
  );
  const definitionForActionChooserUse = (definition: ScriptActionDefinition) => {
    const canonicalOpcode = canonicalActionChooserOpcode(definition.opcode);
    if (canonicalOpcode !== 23) return definition;
    if (selectedDraft.rawCode === -23 || selectedTriggerRecord?.levelType === "dungeon") return scriptActionDefinitionFor(-23);
    return definition;
  };
  const selectActionDefinition = (definition: ScriptActionDefinition) => {
    onSetSelectedDraft({
      ...defaultDraftForProject(project, definitionForActionChooserUse(definition)),
      mediaRequiredForProgression: false
    });
    setActionChooserOpen(false);
  };

  return (
    <div className="realmz-step-detail selected-step-detail">
      {selectedDraftDirty && (
        <div className="script-draft-warning" role="status">
          <strong>Step changes ready</strong>
          <span>Apply this step to update the script.</span>
        </div>
      )}
      <ScriptDiagnostics issues={selectedSlotDiagnostics} />
      <div className={`realmz-current-opcode${previewExpanded ? " expanded" : ""}`} style={{ borderColor: categoryColor(selectedOption.category) }}>
        <header className="realmz-current-opcode-header">
          <div>
            <strong>{actionDefinitionPathLabel(selectedDefinition)}</strong>
            <span>{selectedDefinition.categoryLabel}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => {
              setActionChooserOpen((current) => {
                const nextOpen = !current;
                if (nextOpen) onSetCategoryFilter(selectedDraft.rawCode === 0 ? "All" : selectedDefinition.category);
                return nextOpen;
              });
            }}
          >
            {selectedDraft.rawCode === 0 ? "Choose Action" : "Change Action"}
          </button>
        </header>
        {actionChooserOpen && (
          <ActionPointActionChooser
            selectedRawCode={selectedDraft.rawCode}
            categoryFilter={categoryFilter}
            opcodeQuery={opcodeQuery}
            filteredDefinitions={filteredDefinitions}
            combatMacroContext={combatMacroContext}
            onSetCategoryFilter={onSetCategoryFilter}
            onSetOpcodeQuery={onSetOpcodeQuery}
            onSelectDefinition={selectActionDefinition}
            onClose={() => setActionChooserOpen(false)}
          />
        )}
        <p>{selectedDefinition.summary}</p>
        {selectedCombatMacroActionNote && combatMacroContext && (
          <div className="combat-macro-action-note">
            <span>{combatMacroContextTitle(combatMacroContext)}</span>
            <small>{selectedCombatMacroActionNote}</small>
          </div>
        )}
        {!hasInlineTargetPicker && selectedTargetPreview && (
          <ActionPointTargetPreview
            option={selectedTargetPreview}
            definition={selectedDefinition}
            behavior={previewBehavior}
            canExpand={previewCanExpand}
            expanded={previewExpanded}
            onToggleExpanded={() => setPreviewExpanded((current) => !current)}
          />
        )}
        <ActionPointInlineTargetEditor
          project={project}
          catalog={catalog}
          rawCode={selectedDraft.rawCode}
          id={selectedDraft.id}
          enabled={hasInlineTargetPicker}
          desktopRuntime={desktopRuntime}
          projectDir={projectDir}
          workspaceDir={workspaceDir}
          targetRecordPanel={targetRecordPanel}
          onSetSelectedDraft={onSetSelectedDraft}
          onPreviewEntity={onPreviewEntity}
          onApplyCommand={onApplyCommand}
        />
        {!isEdcdBackedStep && !hasInlineTargetPicker && !isStepOnlyAction && (
          <ActionPointDirectTargetField
            project={project}
            catalog={catalog}
            selectedSlot={selectedSlot}
            rawCode={selectedDraft.rawCode}
            id={selectedDraft.id}
            definition={selectedDefinition}
            idLabel={selectedIdLabel}
            sameMapActionPointStep={isSameMapActionPointStep}
            sameMapTarget={sameMapActionPointTarget}
            sameMapJumpTitle={sameMapActionPointJumpTitle}
            onEdit={() => setDirectSettingsOpen(true)}
            onPreviewEntity={onPreviewEntity}
          />
        )}
        <ActionPointSettingsEditor
          project={project}
          catalog={catalog}
          selectedSlot={selectedSlot}
          selectedDraft={selectedDraft}
          selectedSlotApplied={selectedSlotApplied}
          selectedDefinition={selectedDefinition}
          selectedEdcdUsage={selectedEdcdUsage}
          selectedRowUsage={selectedRowUsage}
          selectedTriggerId={selectedTriggerId}
          edcdShape={selectedOption.edcdShape}
          defaultValues={selectedDefaultEdcdValues}
          parameterLabels={selectedParameterLabels}
          onSetSelectedDraft={onSetSelectedDraft}
          onSelectEntity={onSelectEntity}
          onOpenText={(editor) => onOpenTool?.("text", editor)}
          onOpenMapCoordinate={onOpenMapCoordinate}
          previewMap={previewMap}
          onDraftValuesChange={onEdcdDraftChange}
          onSecondaryDraftValuesChange={onSecondaryEdcdDraftChange}
          onApplyCommand={onApplyCommand}
        />
        {!hasInlineTargetPicker && targetRecordPanel && (
          <div className="realmz-current-step-authoring-subpane target-record-subpane">{targetRecordPanel}</div>
        )}
        {!hasInlineTargetPicker && targetRecordAvailable && !targetRecordOpen && !targetRecordPanel && (
          <div className="realmz-current-step-authoring-subpane target-record-restore-subpane">
            <button type="button" className="btn btn-secondary btn-xs" onClick={onShowTargetRecord}>
              <Eye size={12} /> Show Target Details
            </button>
          </div>
        )}
      </div>
      {directSettingsOpen && (
        <ContextualDirectActionModal
          project={project}
          catalog={catalog}
          title={`${selectedDefinition.label} — Action Point step ${selectedSlot + 1}`}
          description="Choose the action behavior here, then use Apply Step to store this draft in the script."
          rawCode={selectedDraft.rawCode}
          initialValue={selectedDraft.id}
          previewContext={{ desktopRuntime, projectDir, workspaceDir }}
          onInspect={onPreviewEntity}
          onCancel={() => setDirectSettingsOpen(false)}
          onApply={(id) => {
            onSetSelectedDraft({ ...selectedDraft, id });
            setDirectSettingsOpen(false);
          }}
        />
      )}
      <ActionPointStepReference
        definition={selectedDefinition}
        combatMacroContext={combatMacroContext}
        rawCode={selectedDraft.rawCode}
        id={selectedDraft.id}
        settingLabels={settingLabels}
        edcdRowId={selectedEdcdRowId}
        rowUsage={selectedRowUsage}
        divinityHelp={selectedDivinityHelp}
      />
      {!selectedSlotApplied && <EmptyState compact title="Step not applied yet" body="Apply this step to update the script." />}
    </div>
  );
}
