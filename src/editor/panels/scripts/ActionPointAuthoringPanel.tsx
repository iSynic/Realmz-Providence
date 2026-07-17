import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Plus } from "lucide-react";
import type {
  LevelType,
  LibraryCatalog,
  MapCoordinateTarget,
  Project,
  ProjectCommand,
  RealmzTargetRecordKind,
  ScriptDetailSurface,
  ScriptInventoryFilter,
  SelectedEntity,
  SemanticEntity,
  TriggerRecord
} from "../../types";
import { selectEntityFromId, semanticLabel, triggerEntityId } from "../../utils";
import { ed3ReachabilityFor, extraActionEvidenceSummary, extraActionPointClassification } from "../../semanticGraph";
import { resolveSignedMessageTarget, targetPickerConfig } from "../../components/RealmzTargetPicker";
import { TutorialTip } from "../../components/TutorialTip";
import { CollapsibleSection, FloatingWorkbenchPanel, PanelSection } from "../../ui";
import { actionPointCapacity, nextActionPointRecordIndex } from "../../actionPointCapacity";
import { realmzScriptStepDescriptorFor } from "../../realmzScriptDescriptors";
import { actionPointMarkerStateForTrigger, isSecretActionPointState } from "../../map/actionPointMarkers";
import {
  ED3_EVIDENCE_FILTERS,
  EXTRA_ACTION_INVENTORY_FILTERS,
  SCRIPT_INVENTORY_FILTERS,
  filterScriptsByInventory,
  issueCountsBySlot,
  scriptMatchesInventoryFilter,
  scriptDescriptor,
  scriptIdentity,
  scriptInventoryPresentation,
  scriptLabel,
  scriptMatchesQuery,
  scriptPanelDescription,
  scriptPanelTitle,
  scriptTabKind,
  triggerMatchesSelection,
  triggerSelectionId,
  triggerVisibleForEditor,
  usePersistentBoolean,
  usePersistentValue
} from "./scriptInventory";
import type { ScriptActionCategoryFilter } from "./scriptActionCatalog";
import { TargetRecordEditor } from "./TargetRecordEditor";
import { SelectedActionPointStepEditor } from "./SelectedActionPointStepEditor";
import { ActionPointRecordHeader } from "./ActionPointRecordHeader";
import { ActionPointCreateBar } from "./ActionPointCreateBar";
import { CombatMacroContextCard, Ed3EvidenceDetails, ScriptFlowPreview, SourceEvidence } from "./ActionPointEvidence";
import { ActionPointInventory } from "./ActionPointInventory";
import { ActionPointStepList } from "./ActionPointStepList";
import { ActionPointStepToolbar } from "./ActionPointStepToolbar";
import { includeSelectedTrigger } from "./actionPointSelection";
import {
  authorFacingExtraActionKind,
  clampRealmzCoordinate,
  combatMacroContextFor,
  textEditorNavigationLabel,
  type CombatMacroContext
} from "./actionPointPresentation";
import { ScriptDestructiveActionDialog, ScriptPreviewPanel, type ScriptPreviewTarget } from "./ActionPointDialogs";
import { useActionPointStepDrafts } from "./useActionPointStepDrafts";
import { useActionPointWarningDiagnostics, useSelectedActionPointDiagnostics } from "./useActionPointDiagnostics";

const SCRIPT_WORKBENCH_HELP =
  "Scripts is the Divinity Action Point hub: map triggers, reusable Extra Action Points, Global Macro scripts, story-flag usage, CODE/ID steps, Action Settings, targets, diagnostics, and source evidence.";

function shouldSuppressInlineTargetRecordPanel(recordType: RealmzTargetRecordKind | undefined) {
  return recordType === "simpleEncounter" || recordType === "complexEncounter";
}

type SelectedEdcdUsage = {
  rowId?: number;
  shape?: string;
  opcode?: number;
  fields?: { name?: string; value?: number }[];
  secondaryRowId?: number;
  secondaryShape?: string;
  secondaryFields?: { name?: string; value?: number }[];
  diagnostics?: string[];
  summary?: string;
};

type PendingScriptDestructiveAction = {
  title: string;
  body: string;
  confirmLabel: string;
  action: () => void;
};

type ActionPointAuthoringPanelProps = {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  activeEditor: string;
  selectedEntity: SelectedEntity | null;
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
};

export function ActionPointAuthoringPanel(props: ActionPointAuthoringPanelProps) {
  if (!props.project) return null;
  return <ActionPointAuthoringWorkbench {...props} project={props.project} />;
}

function ActionPointAuthoringWorkbench({
  project,
  catalog,
  activeEditor,
  selectedEntity,
  desktopRuntime,
  projectDir,
  workspaceDir,
  onSelectEntity,
  onSelectEditor,
  onOpenTool,
  onOpenMapCoordinate,
  onApplyCommand
}: Omit<ActionPointAuthoringPanelProps, "project"> & { project: Project }) {
  const activeTabKind = scriptTabKind(activeEditor);
  const inventoryPresentation = scriptInventoryPresentation(activeEditor);
  const scripts = useMemo(
    () => project?.triggers.filter((trigger) => triggerVisibleForEditor(project, trigger, activeEditor)) ?? [],
    [project, activeEditor]
  );
  const projectMaps = project?.maps ?? [];
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<ScriptActionCategoryFilter>("All");
  const [opcodeQuery, setOpcodeQuery] = useState("");
  const [scriptQuery, setScriptQuery] = useState("");
  const [inventoryFilter, setInventoryFilter] = usePersistentValue<ScriptInventoryFilter>("scripts.inventory.filter", "current-map");
  const [detailSurface, setDetailSurface] = usePersistentValue<ScriptDetailSurface>("scripts.detailSurface", "docked");
  const [targetDrawerOpen, setTargetDrawerOpen] = usePersistentBoolean("scripts.targetDrawer.v2.open", false);
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<PendingScriptDestructiveAction | null>(null);
  const [previewTarget, setPreviewTarget] = useState<ScriptPreviewTarget | null>(null);
  const [newActionPoint, setNewActionPoint] = useState({ mapId: projectMaps[0]?.id ?? "", x: 1, y: 1 });
  const selectedScriptButtonRef = useRef<HTMLButtonElement | null>(null);
  const benchmarkStartedRef = useRef(false);
  const selectedMap = projectMaps.find((map) => map.id === newActionPoint.mapId) ?? projectMaps[0] ?? null;
  const canScopeToMap = Boolean(selectedMap && activeTabKind === "action-points");
  const visibleInventoryFilters = useMemo(() => {
    if (activeTabKind === "action-points") return SCRIPT_INVENTORY_FILTERS.filter((filter) => filter.id !== "macros");
    if (activeTabKind === "reusable-actions") return EXTRA_ACTION_INVENTORY_FILTERS;
    return SCRIPT_INVENTORY_FILTERS.filter((filter) => filter.id === "all" || filter.id === "warnings");
  }, [activeTabKind]);
  useEffect(() => {
    if (projectMaps.length === 0) return;
    if (!projectMaps.some((map) => map.id === newActionPoint.mapId)) {
      setNewActionPoint((current) => ({ ...current, mapId: projectMaps[0].id }));
    }
  }, [newActionPoint.mapId, projectMaps]);
  useEffect(() => {
    const allowed = new Set(visibleInventoryFilters.map((filter) => filter.id));
    if (allowed.has(inventoryFilter)) return;
    setInventoryFilter(activeTabKind === "action-points" && canScopeToMap ? "current-map" : "all");
  }, [activeTabKind, canScopeToMap, inventoryFilter, setInventoryFilter, visibleInventoryFilters]);
  useEffect(() => {
    selectedScriptButtonRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedEntity?.id, inventoryFilter, scriptQuery, scripts.length]);
  const { diagnosticDependencyKey, warningScanReady, fullWarningDiagnosticsById } = useActionPointWarningDiagnostics({
    project,
    catalog,
    scripts,
    inventoryFilter,
    activeEditor
  });
  const inventoryCounts = useMemo(() => {
    const counts = new Map<ScriptInventoryFilter, number | null>();
    for (const filter of visibleInventoryFilters) {
      counts.set(filter.id, filter.id === "warnings" && !(inventoryFilter === "warnings" && warningScanReady) ? null : 0);
    }
    for (const trigger of scripts) {
      for (const filter of visibleInventoryFilters) {
        if (filter.id === "warnings" && !(inventoryFilter === "warnings" && warningScanReady)) continue;
        if (!scriptMatchesInventoryFilter(project, trigger, filter.id, selectedMap, canScopeToMap, fullWarningDiagnosticsById)) continue;
        counts.set(filter.id, (counts.get(filter.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [project, scripts, selectedMap, canScopeToMap, fullWarningDiagnosticsById, inventoryFilter, warningScanReady, visibleInventoryFilters]);
  const scopedScripts = useMemo(
    () => filterScriptsByInventory(project, scripts, inventoryFilter, selectedMap, canScopeToMap, fullWarningDiagnosticsById),
    [project, scripts, inventoryFilter, selectedMap, canScopeToMap, fullWarningDiagnosticsById]
  );
  const filteredScripts = useMemo(
    () => project ? scopedScripts.filter((trigger) => scriptMatchesQuery(project, trigger, scriptQuery)) : [],
    [project, scopedScripts, scriptQuery]
  );
  const [visibleScriptLimit, setVisibleScriptLimit] = useState(40);
  useEffect(() => {
    setVisibleScriptLimit(40);
    const handle = window.setTimeout(() => setVisibleScriptLimit(180), 120);
    return () => window.clearTimeout(handle);
  }, [activeEditor, filteredScripts.length, inventoryFilter, scriptQuery]);
  useEffect(() => {
    if (!isScriptsBenchmarkMode() || benchmarkStartedRef.current || filteredScripts.length === 0) return;
    benchmarkStartedRef.current = true;
    let disposed = false;
    const afterPaint = () => new Promise<void>((resolve) => setTimeout(() => setTimeout(resolve, 0), 0));
    const summarize = (label: string, values: number[]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const pick = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
      return {
        label,
        count: values.length,
        min: Math.round(sorted[0] ?? 0),
        median: Math.round(pick(0.5)),
        p90: Math.round(pick(0.9)),
        p95: Math.round(pick(0.95)),
        max: Math.round(sorted[sorted.length - 1] ?? 0),
        avg: Math.round(values.reduce((total, value) => total + value, 0) / Math.max(1, values.length))
      };
    };
    const writeResult = (result: unknown) => {
      let node = document.getElementById("providence-scripts-benchmark-result");
      if (!node) {
        node = document.createElement("script");
        node.id = "providence-scripts-benchmark-result";
        node.setAttribute("type", "application/json");
        document.body.appendChild(node);
      }
      node.textContent = JSON.stringify(result);
    };
    const measure = async (label: string, indexes: number[], action: (index: number) => boolean) => {
      const values: number[] = [];
      for (const index of indexes) {
        const start = Date.now();
        if (!action(index)) continue;
        await afterPaint();
        values.push(Date.now() - start);
      }
      return summarize(label, values);
    };
    async function runBenchmark() {
      const scriptIndexes = [1, 2, 3, 4, 5, 10, 20, 40, 60, 80];
      const slotIndexes = [0, 1, 2, 3, 4, 5, 6, 7];
      const scriptSwitch = await measure("script-row-switch", scriptIndexes, (index) => {
        const trigger = filteredScripts[index];
        if (!trigger) return false;
        onSelectEntity(selectEntityFromId(triggerSelectionId(trigger)));
        return true;
      });
      const slotSwitch = await measure("slot-switch", slotIndexes, (slot) => {
        if (slot < 0 || slot > 7) return false;
        setSelectedSlot(slot);
        return true;
      });
      const surfaceToggle = await measure("dock-float-toggle", [0, 1], () => {
        setDetailSurface((current) => current === "floating" ? "docked" : "floating");
        return true;
      });
      if (!disposed) {
        writeResult({
          filteredScripts: filteredScripts.length,
          visibleScripts: Math.min(filteredScripts.length, 240),
          scriptSwitch,
          slotSwitch,
          surfaceToggle
        });
      }
    }
    void runBenchmark();
    return () => {
      disposed = true;
      benchmarkStartedRef.current = false;
    };
  }, [filteredScripts, onSelectEntity, setDetailSurface]);
  const selectedTriggerFromSelection = useMemo(
    () => scripts.find((trigger) => triggerMatchesSelection(trigger, selectedEntity?.id ?? "")) ?? null,
    [scripts, selectedEntity?.id]
  );
  const selectedTriggerFromLocal = useMemo(
    () => scripts.find((trigger) => trigger.id === selectedScriptId) ?? null,
    [scripts, selectedScriptId]
  );
  const selectedTrigger =
    selectedTriggerFromSelection ??
    selectedTriggerFromLocal ??
    filteredScripts[0] ??
    scripts[0] ??
    null;
  useEffect(() => {
    if (!selectedTriggerFromSelection) return;
    setSelectedScriptId(selectedTriggerFromSelection.id);
  }, [selectedTriggerFromSelection?.id, selectedTriggerFromSelection]);
  const performSelectTrigger = useCallback((trigger: TriggerRecord) => {
    setSelectedScriptId(trigger.id);
    onSelectEntity(selectEntityFromId(triggerSelectionId(trigger)));
  }, [onSelectEntity]);
  const stepDrafts = useActionPointStepDrafts({
    project,
    catalog,
    selectedTrigger,
    selectedSlot,
    setSelectedSlot,
    selectedEntityId: selectedEntity?.id,
    categoryFilter,
    opcodeQuery,
    onSelectEntity,
    onApplyCommand
  });
  const visibleScripts = useMemo(
    () => includeSelectedTrigger(filteredScripts, selectedTrigger, visibleScriptLimit),
    [filteredScripts, selectedTrigger, visibleScriptLimit]
  );
  const hiddenScriptCount = Math.max(0, filteredScripts.length - Math.min(filteredScripts.length, visibleScriptLimit));
  const visibleDiagnosticsById = useSelectedActionPointDiagnostics({
    project,
    catalog,
    selectedTrigger,
    diagnosticDependencyKey,
    fullWarningDiagnosticsById
  });
  const selectedMapCapacity = selectedMap ? actionPointCapacity(project.triggers, selectedMap.levelType, selectedMap.index) : null;
  const createSelectedMapActionPoint = () => {
    if (!selectedMap || !selectedMapCapacity?.canCreate) return;
    requestDraftNavigation("create an Action Point", () => {
      const recordIndex = nextActionPointRecordIndex(project.triggers, selectedMap.levelType, selectedMap.index);
      onApplyCommand?.({
        kind: "createActionPoint",
        label: `Create Action Point ${newActionPoint.x},${newActionPoint.y}`,
        levelType: selectedMap.levelType,
        levelIndex: selectedMap.index,
        x: clampRealmzCoordinate(newActionPoint.x),
        y: clampRealmzCoordinate(newActionPoint.y)
      });
      if (recordIndex != null) {
        const source = selectedMap.levelType === "land" ? "Data DD" : "Data DDD";
        onSelectEntity(selectEntityFromId(triggerEntityId(selectedMap.levelType, selectedMap.index, recordIndex, source)));
      }
    });
  };
  const actionPointCreateTitle = !selectedMap
    ? "Create a map before adding map Action Points."
    : selectedMapCapacity?.canCreate
      ? "Create an Action Point on the selected map, reusing the first empty slot when possible."
      : "This map has no reusable Action Point slots. Clear an existing Action Point to reuse its fixed Realmz record.";
  const {
    slotDraft, selectedAction, selectedDraft, selectedDraftDirty, selectedOption, selectedStepDirty, selectedDefinition,
    filteredDefinitions, selectedEdcdUsageModel, selectedEdcdUsage, selectedSlotDiagnostics, selectedEdcdRowId,
    setSelectedDraft, updateSelectedEdcdDraft, updateSelectedSecondaryEdcdDraft, discardSelectedDraft, applySelectedSlot,
    requestDraftNavigation, selectStepSlot, moveSelectedStep
  } = stepDrafts;
  const selectedSlotEntity: SemanticEntity | undefined = undefined;
  const triggerDiagnostics = selectedTrigger ? visibleDiagnosticsById.get(selectedTrigger.id) ?? [] : [];
  const isMacro = selectedTrigger?.source === "Data ED3";
  const selectedExtraActionEvidence = selectedTrigger && isMacro ? extraActionEvidenceSummary(project, selectedTrigger) : null;
  const selectedEd3Reachability = selectedTrigger && isMacro ? ed3ReachabilityFor(project, selectedTrigger.recordIndex) ?? null : null;
  const selectedCombatMacroContext = useMemo(
    () => selectedTrigger && isMacro ? combatMacroContextFor(project, selectedTrigger, selectedEd3Reachability) : null,
    [project, selectedTrigger, isMacro, selectedEd3Reachability]
  );
  const selectedExtraActionClassification = selectedTrigger && isMacro ? authorFacingExtraActionKind(extraActionPointClassification(project, selectedTrigger), selectedCombatMacroContext) : "Action Point";
  const selectedMarkerState = selectedTrigger && !isMacro ? actionPointMarkerStateForTrigger(project, selectedTrigger) : "none";
  const selectedIsSecret = isSecretActionPointState(selectedMarkerState);
  const deleteMacroLabel = selectedExtraActionClassification === "Global Macro" ? "Delete Global Macro" : "Delete Extra Action Point";
  const moveMapKey = selectedTrigger && !isMacro && selectedTrigger.levelType && selectedTrigger.levelIndex != null
    ? `${selectedTrigger.levelType}:${selectedTrigger.levelIndex}`
    : "";
  const selectedTriggerCoordinate = selectedTrigger?.coordinate ?? null;
  const destinationMatchesTrigger = Boolean(
    selectedTrigger &&
    !isMacro &&
    selectedTriggerCoordinate &&
    selectedTrigger.landid === selectedTrigger.levelIndex &&
    selectedTrigger.targetX === selectedTriggerCoordinate.x &&
    selectedTrigger.targetY === selectedTriggerCoordinate.y
  );
  const triggerLocationMapTarget: MapCoordinateTarget | null = selectedTrigger && !isMacro ? {
    levelType: selectedTrigger.levelType ?? "land",
    levelIndex: selectedTrigger.levelIndex ?? 0,
    x: selectedTrigger.coordinate?.x ?? selectedTrigger.targetX ?? 0,
    y: selectedTrigger.coordinate?.y ?? selectedTrigger.targetY ?? 0
  } : null;
  const afterScriptMapTarget: MapCoordinateTarget | null = selectedTrigger && !isMacro ? {
    levelType: selectedTrigger.levelType ?? "land",
    levelIndex: selectedTrigger.landid ?? selectedTrigger.levelIndex ?? 0,
    x: selectedTrigger.targetX ?? 0,
    y: selectedTrigger.targetY ?? 0
  } : null;
  const afterScriptMapKey = afterScriptMapTarget ? `${afterScriptMapTarget.levelType}:${afterScriptMapTarget.levelIndex}` : "";
  const afterScriptMaps = selectedTrigger && !isMacro
    ? projectMaps.filter((map) => map.levelType === (selectedTrigger.levelType ?? "land"))
    : projectMaps;
  const issueCounts = issueCountsBySlot(triggerDiagnostics);
  const handleSelectTrigger = useCallback((trigger: TriggerRecord) => {
    if (trigger.id === selectedTrigger?.id) return;
    requestDraftNavigation(`select ${scriptLabel(project, trigger)}`, () => performSelectTrigger(trigger));
  }, [performSelectTrigger, project, requestDraftNavigation, selectedTrigger?.id]);
  const previewEntity = useCallback((entity: SelectedEntity) => {
    setPreviewTarget({
      kind: "entity",
      title: semanticLabel(project, entity.id),
      detail: `${entity.type} target`,
      entity
    });
  }, [project]);
  const openTargetEntity = useCallback((entity: SelectedEntity) => {
    requestDraftNavigation(`open ${semanticLabel(project, entity.id)}`, () => onSelectEntity(entity));
  }, [onSelectEntity, project, requestDraftNavigation]);
  const openTargetTool = useCallback((tab: "text", editor: string) => {
    requestDraftNavigation(`open ${textEditorNavigationLabel(editor)}`, () => onOpenTool?.(tab, editor));
  }, [onOpenTool, requestDraftNavigation]);
  const previewMapCoordinate = useCallback((target: MapCoordinateTarget) => {
    const map = projectMaps.find((candidate) => candidate.levelType === target.levelType && candidate.index === target.levelIndex);
    setPreviewTarget({
      kind: "map-coordinate",
      title: map?.name ?? `${target.levelType === "dungeon" ? "Dungeon" : "Land"} level ${target.levelIndex}`,
      detail: `${target.x}, ${target.y}`,
      target
    });
  }, [projectMaps]);
  const openTargetMapCoordinate = useCallback((target: MapCoordinateTarget) => {
    const map = projectMaps.find((candidate) => candidate.levelType === target.levelType && candidate.index === target.levelIndex);
    requestDraftNavigation(`open ${map?.name ?? "the map location"} at ${target.x}, ${target.y}`, () => onOpenMapCoordinate?.(target));
  }, [onOpenMapCoordinate, projectMaps, requestDraftNavigation]);
  const clearSelectedStep = () => {
    if (!selectedTrigger) return;
    setPendingDestructiveAction({
      title: `Clear Step ${selectedSlot + 1}`,
      body: "This clears the selected step. Any unapplied draft changes for this step will be discarded.",
      confirmLabel: "Clear Step",
      action: () => {
        discardSelectedDraft();
        if (selectedAction) {
          onApplyCommand?.({ kind: "deleteActionSlot", label: "Clear step", triggerId: selectedTrigger.id, slot: selectedSlot });
        }
      }
    });
  };
  const clearSelectedScript = () => {
    if (!selectedTrigger) return;
    setPendingDestructiveAction({
      title: isMacro ? deleteMacroLabel : "Clear Action Point",
      body: isMacro
        ? "This deletes the selected Extra Action Point. Any unapplied draft changes for the selected step will be discarded."
        : "This clears the selected Action Point record so it can be reused. Any unapplied draft changes for the selected step will be discarded.",
      confirmLabel: isMacro ? deleteMacroLabel : "Clear Action Point",
      action: () => {
        discardSelectedDraft();
        onApplyCommand?.({ kind: "deleteTrigger", label: isMacro ? deleteMacroLabel : "Clear Action Point", triggerId: selectedTrigger.id });
      }
    });
  };
  const moveSelectedActionPoint = (fields: Partial<{ levelType: LevelType; levelIndex: number; x: number; y: number }>) => {
    if (!selectedTrigger || isMacro) return;
    const levelType = fields.levelType ?? selectedTrigger.levelType ?? "land";
    const levelIndex = fields.levelIndex ?? selectedTrigger.levelIndex ?? 0;
    const coordinate = selectedTrigger.coordinate ?? { x: selectedTrigger.targetX ?? 0, y: selectedTrigger.targetY ?? 0 };
    const x = clampRealmzCoordinate(fields.x ?? coordinate.x);
    const y = clampRealmzCoordinate(fields.y ?? coordinate.y);
    onApplyCommand?.({ kind: "moveActionPoint", label: "Move Action Point", triggerId: selectedTrigger.id, levelType, levelIndex, x, y });
  };
  const floatingDetail = detailSurface === "floating";
  const targetRecordType = realmzScriptStepDescriptorFor(selectedDraft.rawCode).targetType;
  const selectedDraftTargetId = resolveSignedMessageTarget(selectedDraft.rawCode, selectedDraft.id);
  const inlineDirectTargetPickerAvailable = Boolean(targetPickerConfig(selectedDraft.rawCode));
  const inlineDirectTargetEditorAvailable = targetRecordType === "message";
  const directTargetDrawerAvailable = Boolean(targetRecordType) && !inlineDirectTargetPickerAvailable && !inlineDirectTargetEditorAvailable && !shouldSuppressInlineTargetRecordPanel(targetRecordType);
  const detailSurfaceButton = (
    <button
      type="button"
      className="btn btn-secondary btn-xs"
      title={floatingDetail ? "Dock this selected slot editor back into the Scripts workbench." : "Pop this selected slot editor out for more target editing room."}
      onClick={() => setDetailSurface(floatingDetail ? "docked" : "floating")}
    >
      {floatingDetail ? "Dock" : "Pop-Out"}
    </button>
  );
  const stepDetailActions = selectedTrigger ? (
    <ActionPointStepToolbar
      surfaceButton={detailSurfaceButton}
      selectedSlot={selectedSlot}
      hasSelectedAction={Boolean(selectedAction)}
      selectedStepDirty={selectedStepDirty}
      targetDrawerAvailable={directTargetDrawerAvailable}
      targetDrawerOpen={targetDrawerOpen}
      onMove={moveSelectedStep}
      onDuplicate={() => onApplyCommand?.({ kind: "duplicateActionSlot", label: "Duplicate step", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot + 1 })}
      onClear={clearSelectedStep}
      onToggleTargetDrawer={() => setTargetDrawerOpen(!targetDrawerOpen)}
      onApply={applySelectedSlot}
    />
  ) : null;
  const targetEditorPanel = selectedTrigger && targetDrawerOpen && directTargetDrawerAvailable ? (
    <TargetRecordEditor
      key={`${targetRecordType}:${selectedDraft.rawCode}:${selectedDraftTargetId}`}
      project={project}
      catalog={catalog}
      opcode={selectedDraft.rawCode}
      targetId={selectedDraftTargetId}
      presentation="inline"
      desktopRuntime={desktopRuntime}
      projectDir={projectDir}
      workspaceDir={workspaceDir}
      onSelectEntity={openTargetEntity}
      onApplyCommand={onApplyCommand}
    />
  ) : null;
  const stepDetailBody = selectedTrigger ? (
    <SelectedActionPointStepEditor
      project={project}
      catalog={catalog}
      selectedSlot={selectedSlot}
      selectedDraft={selectedDraft}
      selectedDraftDirty={selectedStepDirty}
      selectedSlotApplied={Boolean(selectedAction) && !selectedDraftDirty}
      selectedOption={selectedOption}
      selectedDefinition={selectedDefinition}
      selectedEdcdUsage={selectedEdcdUsage}
      selectedRowUsage={selectedEdcdUsageModel}
      selectedTriggerId={selectedTrigger.id}
      selectedEdcdRowId={selectedEdcdRowId}
      selectedSlotDiagnostics={selectedSlotDiagnostics}
      combatMacroContext={selectedCombatMacroContext}
      categoryFilter={categoryFilter}
      opcodeQuery={opcodeQuery}
      filteredDefinitions={filteredDefinitions}
      desktopRuntime={desktopRuntime}
      projectDir={projectDir}
      workspaceDir={workspaceDir}
      targetRecordPanel={targetEditorPanel}
      targetRecordAvailable={directTargetDrawerAvailable}
      targetRecordOpen={targetDrawerOpen}
      onShowTargetRecord={() => setTargetDrawerOpen(true)}
      onSetCategoryFilter={setCategoryFilter}
      onSetOpcodeQuery={setOpcodeQuery}
      onSetSelectedDraft={setSelectedDraft}
      onSelectEntity={openTargetEntity}
      onPreviewEntity={previewEntity}
      onOpenTool={openTargetTool}
      onOpenMapCoordinate={previewMapCoordinate}
      onEdcdDraftChange={updateSelectedEdcdDraft}
      onSecondaryEdcdDraftChange={updateSelectedSecondaryEdcdDraft}
      onApplyCommand={onApplyCommand}
    />
  ) : null;
  const usedStepCount = selectedTrigger?.actions.filter((action) => action.rawCode !== 0).length ?? 0;
  const firstEmptyStep = selectedTrigger ? Array.from({ length: 8 }, (_, slot) => slot).find((slot) => {
    const action = selectedTrigger.actions.find((candidate) => candidate.slot === slot);
    const current = slotDraft(slot, action);
    return current.rawCode === 0 && current.id === 0;
  }) : null;
  const extraActionEvidenceOpen = triggerDiagnostics.some((issue) => issue.severity === "error");
  const extraActionEvidenceFilterActive = activeTabKind === "reusable-actions" && (
    inventoryFilter === "ed3-unlinked" ||
    ED3_EVIDENCE_FILTERS.some((filter) => filter.id === inventoryFilter)
  );
  const showInlineFlowPreview = activeTabKind !== "action-points" && activeTabKind !== "reusable-actions";
  const confirmPendingDestructiveAction = () => {
    const pending = pendingDestructiveAction;
    if (!pending) return;
    setPendingDestructiveAction(null);
    pending.action();
  };
  const openPreviewTarget = () => {
    const preview = previewTarget;
    if (!preview) return;
    setPreviewTarget(null);
    if (preview.kind === "entity") openTargetEntity(preview.entity);
    else openTargetMapCoordinate(preview.target);
  };
  return (
    <section className="realmz-script-editor">
      <header className="settings-rows-header">
        <div>
          <TutorialTip title="Scripts Workbench" body={SCRIPT_WORKBENCH_HELP} side="below">
            <strong>{scriptPanelTitle(activeEditor)}</strong>
          </TutorialTip>
          <small>{scriptPanelDescription(activeEditor)}</small>
        </div>
        <div className="script-toolbar">
          {activeTabKind === "reusable-actions" && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "createMacro", label: "Create Extra Action Point" })}>
              <Plus size={12} /> Extra Action Point
            </button>
          )}
          {selectedTrigger && activeTabKind !== "action-points" && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}>
              <Copy size={12} /> Duplicate
            </button>
          )}
        </div>
      </header>
      <ActionPointCreateBar
        activeTabKind={activeTabKind}
        projectMaps={projectMaps}
        selectedMap={selectedMap}
        selectedMapCapacity={selectedMapCapacity}
        selectedTrigger={selectedTrigger}
        newActionPoint={newActionPoint}
        actionPointCreateTitle={actionPointCreateTitle}
        onSetNewActionPoint={setNewActionPoint}
        onCreateMap={() => onApplyCommand?.({ kind: "createMap", label: "Create Land Level 0", levelType: "land" })}
        onCreateActionPoint={createSelectedMapActionPoint}
        onDuplicateTrigger={() => selectedTrigger && onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}
      />
      <div className="realmz-script-layout">
        <ActionPointInventory
          project={project}
          scripts={scripts}
          filteredScripts={filteredScripts}
          visibleScripts={visibleScripts}
          selectedTrigger={selectedTrigger}
          selectedButtonRef={selectedScriptButtonRef}
          scriptQuery={scriptQuery}
          inventoryFilter={inventoryFilter}
          visibleInventoryFilters={visibleInventoryFilters}
          inventoryCounts={inventoryCounts}
          canScopeToMap={canScopeToMap}
          extraActionEvidenceFilterActive={extraActionEvidenceFilterActive}
          warningScanReady={warningScanReady}
          hiddenScriptCount={hiddenScriptCount}
          diagnosticsById={visibleDiagnosticsById}
          searchPlaceholder={inventoryPresentation.placeholder}
          searchAriaLabel={inventoryPresentation.ariaLabel}
          resultNoun={inventoryPresentation.resultNoun}
          listAriaLabel={inventoryPresentation.listAriaLabel}
          onSetScriptQuery={setScriptQuery}
          onSetInventoryFilter={setInventoryFilter}
          onSelectTrigger={handleSelectTrigger}
          onShowMore={() => setVisibleScriptLimit((value) => Math.min(filteredScripts.length, value + 180))}
        />
        <div className="realmz-script-form">
          {selectedTrigger ? (
            <>
              <ActionPointRecordHeader
                trigger={selectedTrigger}
                identity={scriptIdentity(selectedTrigger)}
                descriptor={scriptDescriptor(project, selectedTrigger)}
                isMacro={isMacro}
                deleteMacroLabel={deleteMacroLabel}
                diagnostics={triggerDiagnostics.filter((issue) => issue.slot == null)}
                macroContextCard={selectedCombatMacroContext ? (
                  <CombatMacroContextCard context={selectedCombatMacroContext} onSelectEntity={openTargetEntity} />
                ) : undefined}
                markerState={selectedMarkerState}
                isSecret={selectedIsSecret}
                projectMaps={projectMaps}
                moveMapKey={moveMapKey}
                afterScriptMaps={afterScriptMaps}
                afterScriptMapKey={afterScriptMapKey}
                destinationMatchesTrigger={destinationMatchesTrigger}
                triggerLocationTarget={triggerLocationMapTarget}
                afterScriptTarget={afterScriptMapTarget}
                onRename={(displayName) => onApplyCommand?.({ kind: "renameEditorEntity", label: "Update script descriptor", entityId: selectedTrigger.id, displayName })}
                onDuplicate={() => onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}
                onClear={clearSelectedScript}
                onUpdateHeader={(label, fields) => onApplyCommand?.({ kind: "updateTriggerHeader", label, triggerId: selectedTrigger.id, fields })}
                onMoveActionPoint={moveSelectedActionPoint}
                onOpenMapCoordinate={previewMapCoordinate}
              />
              <div className="realmz-visual-script-scroll" aria-label="Script step authoring area">
                <div className={`realmz-visual-script${floatingDetail ? " has-floating-detail" : ""}`}>
                  <ActionPointStepList
                    project={project}
                    catalog={catalog}
                    trigger={selectedTrigger}
                    selectedSlot={selectedSlot}
                    usedStepCount={usedStepCount}
                    firstEmptyStep={firstEmptyStep}
                    issueCounts={issueCounts}
                    slotDraft={slotDraft}
                    onSelectSlot={selectStepSlot}
                    flowPreview={showInlineFlowPreview ? (
                      <ScriptFlowPreview project={project} catalog={catalog} trigger={selectedTrigger} onSelectEntity={openTargetEntity} />
                    ) : undefined}
                  />
                  {!floatingDetail && (
                    <PanelSection title="Current Step" eyebrow={`slot ${selectedSlot + 1} | ${selectedDefinition.category}`} scroll className="script-current-step-panel" actions={stepDetailActions}>
                      {stepDetailBody}
                    </PanelSection>
                  )}
                </div>
              </div>
              {floatingDetail && (
                <FloatingWorkbenchPanel
                  title="Current Step"
                  eyebrow={`${scriptLabel(project, selectedTrigger)} | ${selectedDefinition.category}`}
                  storageKey="scripts.floatingEditor.position"
                  className="script-floating-detail"
                  actions={
                    <>
                      {stepDetailActions}
                    </>
                  }
                >
                  {stepDetailBody}
                </FloatingWorkbenchPanel>
              )}
              <SourceEvidence
                project={project}
                trigger={selectedTrigger}
                selectedSlot={selectedSlot}
                selectedAction={selectedAction}
                selectedDraft={selectedDraft}
                selectedOption={selectedOption}
                selectedSlotEntity={selectedSlotEntity}
                selectedEdcdRowId={selectedEdcdRowId}
                onSelectEntity={openTargetEntity}
              />
              {isMacro && (
                <CollapsibleSection
                  title="Extra AP Evidence"
                  eyebrow="audit"
                  density="compact"
                  storageKey="scripts.extraActionEvidence.open"
                  defaultOpen={extraActionEvidenceOpen}
                  className="extra-ap-evidence-section"
                >
                  <div className="script-record-note">
                    <strong>{selectedExtraActionClassification}</strong>
                    {selectedExtraActionEvidence && (
                      <span className={`script-evidence-pill ${selectedExtraActionEvidence.tone}`}>
                        {selectedExtraActionEvidence.label}
                      </span>
                    )}
                    <small>{selectedExtraActionEvidence?.detail ?? "Extra Action Points store only the eight script steps. Map trigger fields like chance, location, and goto target do not apply until another script calls them."}</small>
                  </div>
                  <Ed3EvidenceDetails row={selectedEd3Reachability} />
                </CollapsibleSection>
              )}
            </>
          ) : (
            <p className="empty-copy compact">{inventoryPresentation.emptyCopy}</p>
          )}
        </div>
      </div>
      {pendingDestructiveAction && (
        <ScriptDestructiveActionDialog
          title={pendingDestructiveAction.title}
          body={pendingDestructiveAction.body}
          confirmLabel={pendingDestructiveAction.confirmLabel}
          onConfirm={confirmPendingDestructiveAction}
          onCancel={() => setPendingDestructiveAction(null)}
        />
      )}
      {previewTarget && (
        <ScriptPreviewPanel
          preview={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onOpen={openPreviewTarget}
        />
      )}
    </section>
  );
}

function isScriptsBenchmarkMode() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("benchmarkScripts");
}
