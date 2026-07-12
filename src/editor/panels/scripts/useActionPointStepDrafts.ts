import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useDraftChangeGuards } from "../../app/draftChangeGuard";
import { edcdUsageForAction, edcdUsageToEditorUsage, normalizeEdcdValues } from "../../edcdRows";
import { actionOptionFor } from "../../realmzActions";
import { validateActionDraft } from "../../scriptValidation";
import type { Action, LibraryCatalog, Project, ProjectCommand, SelectedEntity, TriggerRecord } from "../../types";
import { selectEntityFromId } from "../../utils";
import { edcdDraftValuesEqual, type EdcdStepDraft } from "./actionPointDraft";
import { actionSlotIndexFromSelection, actionSlotSelectionId } from "./actionPointSelection";
import { actionPointSlotDraft, actionPointStepApplyCommand, actionPointStepDraftDirty, actionPointStepDraftKey, removeActionPointEdcdDrafts, removeActionPointStepDraft, swapActionPointStepDrafts, type ActionPointStepDrafts } from "./actionPointStepCommands";
import { actionDefinitionsForCategory, scriptActionDefinitionFor, type ScriptActionCategoryFilter } from "./scriptActionCatalog";
import { scriptLabel, triggerMatchesSelection } from "./scriptInventory";

export function useActionPointStepDrafts({
  project, catalog, selectedTrigger, selectedSlot, setSelectedSlot, selectedEntityId,
  categoryFilter, opcodeQuery, onSelectEntity, onApplyCommand
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  selectedTrigger: TriggerRecord | null;
  selectedSlot: number;
  setSelectedSlot: Dispatch<SetStateAction<number>>;
  selectedEntityId?: string | null;
  categoryFilter: ScriptActionCategoryFilter;
  opcodeQuery: string;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const { registerDraftGuard, confirmBeforeDraftDiscard } = useDraftChangeGuards();
  const [drafts, setDrafts] = useState<ActionPointStepDrafts>({});
  const [edcdStepDrafts, setEdcdStepDrafts] = useState<Record<string, EdcdStepDraft>>({});

  const performSelectStepSlot = useCallback((slot: number) => {
    setSelectedSlot(slot);
    if (selectedTrigger) onSelectEntity(selectEntityFromId(actionSlotSelectionId(selectedTrigger, slot)));
  }, [onSelectEntity, selectedTrigger, setSelectedSlot]);

  useEffect(() => {
    const slot = actionSlotIndexFromSelection(selectedEntityId);
    if (slot == null || slot < 0 || slot > 7 || slot === selectedSlot) return;
    if (!selectedTrigger || !triggerMatchesSelection(selectedTrigger, selectedEntityId ?? "")) return;
    setSelectedSlot(slot);
  }, [selectedEntityId, selectedSlot, selectedTrigger, setSelectedSlot]);

  useEffect(() => {
    if (!selectedTrigger || (selectedSlot >= 0 && selectedSlot <= 7)) return;
    setSelectedSlot(selectedTrigger.actions[0]?.slot ?? 0);
  }, [selectedSlot, selectedTrigger, setSelectedSlot]);

  const slotDraft = useCallback(
    (slot: number, action?: Action) => actionPointSlotDraft(drafts, selectedTrigger?.id, slot, action),
    [drafts, selectedTrigger?.id]
  );
  const selectedAction = selectedTrigger?.actions.find((candidate) => candidate.slot === selectedSlot);
  const selectedKey = actionPointStepDraftKey(selectedTrigger?.id, selectedSlot);
  const selectedDraft = slotDraft(selectedSlot, selectedAction);
  const selectedDraftDirty = actionPointStepDraftDirty(selectedDraft, selectedAction);
  const selectedOption = actionOptionFor(selectedDraft.rawCode);
  const selectedDefinition = scriptActionDefinitionFor(selectedDraft.rawCode);
  const selectedEdcdDraftKey = selectedTrigger && selectedOption.edcdShape
    ? `${selectedKey}:${selectedDraft.rawCode}:${selectedDraft.id}:${selectedOption.edcdShape}` : "";
  const selectedEdcdDraftPrefix = selectedTrigger ? `${selectedKey}:` : "";
  const selectedEdcdStepDraft = selectedEdcdDraftKey ? edcdStepDrafts[selectedEdcdDraftKey] : undefined;
  const selectedStepDirty = selectedDraftDirty || Boolean(selectedEdcdStepDraft?.dirty || selectedEdcdStepDraft?.secondaryDirty);
  const filteredDefinitions = actionDefinitionsForCategory(categoryFilter, opcodeQuery);
  const selectedEdcdUsageModel = useMemo(
    () => project && selectedOption.edcdShape ? edcdUsageForAction(project, catalog, selectedDraft.rawCode, Math.max(0, selectedDraft.id)) : null,
    [catalog, project, selectedDraft.id, selectedDraft.rawCode, selectedOption.edcdShape]
  );
  const selectedEdcdUsage = selectedEdcdUsageModel ? edcdUsageToEditorUsage(selectedEdcdUsageModel, selectedOption.edcdShape) : undefined;
  const selectedSlotDiagnostics = useMemo(
    () => project && selectedTrigger ? validateActionDraft(project, selectedTrigger, selectedSlot, selectedDraft.rawCode, selectedDraft.id, catalog) : [],
    [catalog, project, selectedDraft.id, selectedDraft.rawCode, selectedSlot, selectedTrigger]
  );
  const selectedEdcdRowId = selectedOption.edcdShape ? Math.max(0, selectedDraft.id) : null;

  const setSelectedDraft = useCallback((values: { rawCode: number; id: number }) => {
    setDrafts((current) => ({ ...current, [selectedKey]: values }));
  }, [selectedKey]);
  const updateSelectedEdcdDraft = useCallback((values: number[], dirty: boolean) => {
    if (!selectedEdcdDraftKey) return;
    const normalized = normalizeEdcdValues(values);
    setEdcdStepDrafts((current) => {
      const previous = current[selectedEdcdDraftKey];
      if (previous?.dirty === dirty && edcdDraftValuesEqual(previous.values, normalized)) return current;
      return { ...current, [selectedEdcdDraftKey]: { ...previous, values: normalized, dirty } };
    });
  }, [selectedEdcdDraftKey]);
  const updateSelectedSecondaryEdcdDraft = useCallback((values: number[], dirty: boolean) => {
    if (!selectedEdcdDraftKey || selectedEdcdUsageModel?.secondaryRowId == null) return;
    const normalized = normalizeEdcdValues(values);
    const fallbackPrimary = normalizeEdcdValues(selectedEdcdUsageModel.values ?? selectedDefinition.defaultDraft.parameters);
    setEdcdStepDrafts((current) => {
      const previous = current[selectedEdcdDraftKey];
      if (previous?.secondaryDirty === dirty && previous.secondaryValues && edcdDraftValuesEqual(previous.secondaryValues, normalized)) return current;
      return { ...current, [selectedEdcdDraftKey]: {
        values: previous?.values ?? fallbackPrimary,
        dirty: previous?.dirty ?? false,
        secondaryValues: normalized,
        secondaryDirty: dirty
      } };
    });
  }, [selectedDefinition.defaultDraft.parameters, selectedEdcdDraftKey, selectedEdcdUsageModel?.secondaryRowId, selectedEdcdUsageModel?.values]);
  const discardSelectedDraft = useCallback(() => {
    setDrafts((current) => removeActionPointStepDraft(current, selectedKey));
    setEdcdStepDrafts((current) => removeActionPointEdcdDrafts(current, selectedEdcdDraftPrefix));
  }, [selectedEdcdDraftPrefix, selectedKey]);
  const applySelectedSlot = useCallback(() => {
    if (!selectedTrigger || !onApplyCommand) return false;
    const edcdValues = selectedOption.edcdShape
      ? selectedEdcdStepDraft?.values ?? normalizeEdcdValues(selectedEdcdUsageModel?.values ?? selectedDefinition.defaultDraft.parameters) : undefined;
    const secondaryEdcdValues = selectedOption.edcdShape && selectedEdcdUsageModel?.secondaryRowId != null
      ? selectedEdcdStepDraft?.secondaryValues ?? normalizeEdcdValues(selectedEdcdUsageModel.secondaryValues ?? undefined) : undefined;
    onApplyCommand(actionPointStepApplyCommand({
      triggerId: selectedTrigger.id,
      slot: selectedSlot,
      draft: { rawCode: selectedDraft.rawCode, id: selectedDraft.id },
      edcdShape: selectedOption.edcdShape,
      edcdValues,
      secondaryEdcdValues
    }));
    discardSelectedDraft();
    return true;
  }, [discardSelectedDraft, onApplyCommand, selectedDefinition.defaultDraft.parameters, selectedDraft.id, selectedDraft.rawCode, selectedEdcdStepDraft?.secondaryValues, selectedEdcdStepDraft?.values, selectedEdcdUsageModel?.secondaryRowId, selectedEdcdUsageModel?.secondaryValues, selectedEdcdUsageModel?.values, selectedOption.edcdShape, selectedSlot, selectedTrigger]);
  const requestDraftNavigation = useCallback((label: string, action: () => void) => confirmBeforeDraftDiscard(label, action), [confirmBeforeDraftDiscard]);
  const selectStepSlot = useCallback((slot: number) => {
    if (slot === selectedSlot) return;
    requestDraftNavigation(`select step ${slot + 1}`, () => performSelectStepSlot(slot));
  }, [performSelectStepSlot, requestDraftNavigation, selectedSlot]);
  const moveSelectedStep = useCallback((toSlot: number) => {
    if (!selectedTrigger || toSlot < 0 || toSlot > 7 || toSlot === selectedSlot) return;
    setDrafts((current) => swapActionPointStepDrafts(current, selectedTrigger.id, selectedSlot, toSlot));
    performSelectStepSlot(toSlot);
    onApplyCommand?.({ kind: "swapActionSlots", label: "Move step", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot });
  }, [onApplyCommand, performSelectStepSlot, selectedSlot, selectedTrigger]);

  useEffect(() => {
    if (!project || !selectedTrigger || !selectedStepDirty) return;
    return registerDraftGuard({
      id: `script-step:${selectedTrigger.id}:${selectedSlot}`,
      surface: "scripts",
      title: `${scriptLabel(project, selectedTrigger)} - Step ${selectedSlot + 1}`,
      summary: scriptDraftGuardSummary(project, selectedTrigger, selectedSlot, selectedAction, selectedDraft, selectedDefinition),
      apply: applySelectedSlot,
      discard: discardSelectedDraft
    });
  }, [applySelectedSlot, discardSelectedDraft, project, registerDraftGuard, selectedAction, selectedDefinition, selectedDraft, selectedSlot, selectedStepDirty, selectedTrigger]);

  return { slotDraft, selectedAction, selectedDraft, selectedDraftDirty, selectedOption, selectedEdcdStepDraft, selectedStepDirty,
    selectedDefinition, filteredDefinitions, selectedEdcdUsageModel, selectedEdcdUsage, selectedSlotDiagnostics, selectedEdcdRowId,
    setSelectedDraft, updateSelectedEdcdDraft, updateSelectedSecondaryEdcdDraft, discardSelectedDraft, applySelectedSlot,
    requestDraftNavigation, performSelectStepSlot, selectStepSlot, moveSelectedStep };
}

function scriptDraftGuardSummary(project: Project, trigger: TriggerRecord, slot: number, applied: Action | undefined, draft: { rawCode: number; id: number }, definition: ReturnType<typeof scriptActionDefinitionFor>) {
  const appliedLabel = applied ? `${scriptActionDefinitionFor(applied.rawCode).shortLabel} (CODE ${applied.rawCode}, ID ${applied.id})` : "Empty";
  return [`Script: ${scriptLabel(project, trigger)}`, `Step: ${slot + 1}`, `Applied: ${appliedLabel}`, `Draft: ${definition.shortLabel} (CODE ${draft.rawCode}, ID ${draft.id})`];
}
