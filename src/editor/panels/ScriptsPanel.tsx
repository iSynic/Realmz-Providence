import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Copy, Eye, Plus, Trash2, X } from "lucide-react";
import { Ed3ReachabilityRow, LevelType, LibraryCatalog, MapCoordinateTarget, Project, ProjectCommand, QuestThread, RealmzTargetRecordKind, ScriptDetailSurface, ScriptInventoryFilter, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { selectEntityFromId, semanticLabel, triggerEntityId } from "../utils";
import { ed3ReachabilityFor, extraActionEvidenceSummary, extraActionPointClassification } from "../semanticGraph";
import { EdcdRowEditor } from "../components/EdcdRowEditor";
import { buildEdcdRowUsages, edcdUsageMatchesFilter, edcdUsageStatusTone, edcdUsageToEditorUsage, nextUnusedEdcdRowId, normalizeEdcdValues, type EdcdRowFilter, type EdcdRowUsage, type EdcdRowCaller } from "../edcdRows";
import { resolveSignedMessageTarget, targetPickerConfig } from "../components/RealmzTargetPicker";
import { TutorialTip } from "../components/TutorialTip";
import { CollapsibleSection, EmptyState, FloatingWorkbenchPanel, PanelSection, ScrollArea } from "../ui";
import { useDraftChangeGuards } from "../app/draftChangeGuard";
import { edcdFieldNamesForShape } from "../realmzEdcd";
import { ScriptDiagnostic } from "../scriptValidation";
import { actionPointCapacity, nextActionPointRecordIndex } from "../actionPointCapacity";
import { realmzScriptStepDescriptorFor } from "../realmzScriptDescriptors";
import { actionPointMarkerStateForTrigger, isSecretActionPointState } from "../map/actionPointMarkers";
import { buildQuestPresentation, questCategoryLabel, QUEST_CATEGORIES, type QuestFlagModel, type QuestUsage } from "../questUsage";
import {
  ED3_EVIDENCE_FILTERS,
  EXTRA_ACTION_INVENTORY_FILTERS,
  SCRIPT_INVENTORY_FILTERS,
  filterScriptsByInventory,
  hasScriptWarning,
  issueCountsBySlot,
  scriptMatchesInventoryFilter,
  scriptLabel,
  scriptMatchesQuery,
  scriptPanelTitle,
  scriptTabKind,
  triggerMatchesSelection,
  triggerSelectionId,
  triggerVisibleForEditor,
  usePersistentBoolean,
  usePersistentValue
} from "./scripts/scriptInventory";
import {
  SCRIPT_ACTION_DEFINITIONS,
  scriptActionDefinitionFor,
  type ScriptActionCategoryFilter,
} from "./scripts/scriptActionCatalog";
import { TargetRecordEditor } from "./scripts/TargetRecordEditor";
import { SelectedActionPointStepEditor } from "./scripts/SelectedActionPointStepEditor";
import { ActionPointRecordHeader } from "./scripts/ActionPointRecordHeader";
import { ActionPointCreateBar } from "./scripts/ActionPointCreateBar";
import { CombatMacroContextCard, Ed3EvidenceDetails, ScriptFlowPreview, SourceEvidence } from "./scripts/ActionPointEvidence";
import { ActionPointInventory } from "./scripts/ActionPointInventory";
import { ActionPointStepList } from "./scripts/ActionPointStepList";
import { ActionPointStepToolbar } from "./scripts/ActionPointStepToolbar";
import { actionPointDiagnosticDependencyKey, validateActionPointTriggerCached } from "./scripts/actionPointDiagnostics";
import { actionSlotSelectionId, includeSelectedTrigger } from "./scripts/actionPointSelection";
import { type CombatMacroContext, type CombatMacroReference } from "./scripts/actionPointPresentation";
import { useActionPointStepDrafts } from "./scripts/useActionPointStepDrafts";

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

type ScriptPreviewTarget =
  | {
      kind: "entity";
      title: string;
      detail: string;
      entity: SelectedEntity;
    }
  | {
      kind: "map-coordinate";
      title: string;
      detail: string;
      target: MapCoordinateTarget;
    };

const SCRIPT_EDITOR_TABS = [
  { id: "action-points", label: "Action Points", title: "Create and edit map Action Points." },
  { id: "macros", label: "Extra Action Points", title: "Extra Action Points and branch targets." },
  { id: "global-macros", label: "Global Events", title: "Scenario-wide event hooks and startup logic." },
  { id: "quests", label: "Story Flags", title: "Beta story-flag labels, decoded usage, and optional author notes." },
  { id: "settings-rows", label: "Action Settings", title: "Advanced browser for shared or imported action settings." }
];

const SCRIPT_WORKBENCH_HELP =
  "Scripts is the Divinity Action Point hub: map triggers, reusable Extra Action Points, global hooks, quest usage, CODE/ID steps, Action Settings, targets, diagnostics, and source evidence.";
const TARGET_DRAWER_HELP =
  "Target opens context for the record selected by this step. Small records such as strings can be edited here; larger records such as encounters, battles, shops, treasures, and monsters open in their primary workbench.";
const TARGET_PICKER_HELP =
  "The target picker resolves the selected opcode's expected record type and can create safe source-backed shells when Providence has a writer for that target family.";
const SETTINGS_HELP =
  "Action Settings hold the extra fields for actions whose CODE/ID slot is too small. Pick the storage row from its caller when possible; Providence names the fields for the selected action and keeps imported storage stable.";
function authorFacingExtraActionKind(classification: string, combatMacroContext?: CombatMacroContext | null) {
  if (combatMacroContext?.kind === "battle") return "Battle Macro";
  if (combatMacroContext?.kind === "monster") return "Monster Macro";
  if (combatMacroContext?.kind === "mixed") return "Combat Macro";
  if (classification === "Callable Extra Action Point") return "Extra Action Point";
  if (classification === "Global Macro") return "Global Event";
  if (classification === "Random Encounter Action") return "Random Encounter Action";
  if (classification === "Timed Encounter Action") return "Timed Encounter Action";
  if (classification === "Battle / Monster / Item Action") return "Source-Linked Extra Action";
  if (classification === "Likely Padding" || classification === "Imported Empty Slot") return "Likely Padding";
  if (classification === "Runtime Residue" || classification === "Imported Runtime Mutation") return "Runtime Residue";
  return "Unlinked Extra Action";
}

function combatMacroContextFor(project: Project, trigger: TriggerRecord, reachability: Ed3ReachabilityRow | null): CombatMacroContext | null {
  if (trigger.source !== "Data ED3") return null;
  const macroId = trigger.recordIndex;
  const references: CombatMacroReference[] = [];
  for (const battle of project.battles ?? []) {
    if (!battle.battleMacro || Math.abs(battle.battleMacro) !== macroId) continue;
    const placed = battle.grid.filter((cell) => cell !== 0).length;
    references.push({
      kind: "battle",
      key: `battle:${battle.id}`,
      label: `Battle ${battle.id}`,
      detail: `${battle.battleMacro < 0 ? "Runnable negative battle macro" : "Imported positive value, preserved but not the normal runnable path"}; ${placed} placed monster slot(s).`,
      entity: selectEntityFromId(`battle:${battle.id}`),
      runnable: battle.battleMacro < 0
    });
  }
  const addMonsterRefs = (records: Project["monsters"], setLabel: string, setFile: string) => {
    for (const monster of records ?? []) {
      if (!monster.deathMacro || Math.abs(monster.deathMacro) !== macroId) continue;
      references.push({
        kind: "monster",
        key: `monster:${setFile}:${monster.id}`,
        label: `${setLabel} Monster ${monster.id}`,
        detail: `${monster.displayName || `Monster ${monster.id}`} defeat macro from ${setFile}.`,
        entity: selectEntityFromId(`monster:${monster.id}`),
        runnable: true
      });
    }
  };
  addMonsterRefs(project.monsters ?? [], "Normal", "Data MD");
  for (const set of project.monsterSets ?? []) {
    const setLabel = set.setId === 1 ? "Monster" : set.setId === -1 ? "Mega" : "Normal";
    addMonsterRefs(set.monsters, setLabel, set.sourceFile || (set.setId === 1 ? "Data MD1" : set.setId === -1 ? "Data MD-1" : "Data MD"));
  }
  const uniqueReferences = Array.from(new Map(references.map((reference) => [reference.key, reference])).values());
  const hasBattle = uniqueReferences.some((reference) => reference.kind === "battle");
  const hasMonster = uniqueReferences.some((reference) => reference.kind === "monster");
  const rootType = reachability?.rootType ?? null;
  if (!hasBattle && !hasMonster && !rootType?.includes("battle") && !rootType?.includes("monster")) return null;
  return {
    kind: hasBattle && hasMonster ? "mixed" : hasBattle || rootType?.includes("battle") ? "battle" : "monster",
    references: uniqueReferences,
    rootType
  };
}

export function ScriptsPanel({
  project,
  catalog,
  selectedEntity,
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  onSelectEntity,
  onSelectEditor,
  onOpenTool,
  onOpenMapCoordinate,
  onApplyCommand,
  activeEditor = "action-points"
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  activeEditor?: string;
}) {
  const [, startScriptTransition] = useTransition();
  const { confirmBeforeDraftDiscard } = useDraftChangeGuards();
  const effectiveEditor = activeEditor === "domain"
    ? "action-points"
    : activeEditor === "ed3-evidence"
      ? "macros"
      : activeEditor;
  const handleSelectEntity = useCallback((entity: SelectedEntity) => {
    startScriptTransition(() => onSelectEntity(entity));
  }, [onSelectEntity]);
  const handleApplyCommand = useCallback((command: ProjectCommand) => {
    startScriptTransition(() => onApplyCommand?.(command));
  }, [onApplyCommand]);
  const handleSelectEditor = useCallback((editor: string) => {
    if (editor === effectiveEditor) return;
    confirmBeforeDraftDiscard(`switch to ${scriptPanelTitle(editor)}`, () => onSelectEditor?.(editor));
  }, [confirmBeforeDraftDiscard, effectiveEditor, onSelectEditor]);
  return (
    <div className="editor-full-panel scripts-workbench">
      <ScriptEditorTabs activeEditor={effectiveEditor} onSelectEditor={handleSelectEditor} />
      <ScriptAuthoringPanel
        project={project}
        catalog={catalog}
        activeEditor={effectiveEditor}
        selectedEntity={selectedEntity}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onSelectEntity={handleSelectEntity}
        onSelectEditor={onSelectEditor}
        onOpenTool={onOpenTool}
        onOpenMapCoordinate={onOpenMapCoordinate}
        onApplyCommand={handleApplyCommand}
      />
    </div>
  );
}

function ScriptEditorTabs({
  activeEditor,
  onSelectEditor
}: {
  activeEditor: string;
  onSelectEditor?: (editor: string) => void;
}) {
  return (
    <div className="script-editor-tabs" role="tablist" aria-label="Action Point Hub sections">
      {SCRIPT_EDITOR_TABS.map((tab) => {
        const selected = activeEditor === tab.id;
        return (
          <button
            key={tab.id}
            className={selected ? "active" : ""}
            type="button"
            role="tab"
            aria-selected={selected}
            title={tab.title}
            onClick={() => onSelectEditor?.(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function ScriptAuthoringPanel({
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
}: {
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
}) {
  const activeTabKind = scriptTabKind(activeEditor);
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
  const [warningScanReady, setWarningScanReady] = useState(false);
  const [selectedDiagnosticsReady, setSelectedDiagnosticsReady] = useState(false);
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
  const diagnosticDependencyKey = useMemo(() => project ? actionPointDiagnosticDependencyKey(project, catalog) : "", [project, catalog]);
  useEffect(() => {
    setWarningScanReady(false);
    if (inventoryFilter !== "warnings") return;
    const handle = window.setTimeout(() => setWarningScanReady(true), 160);
    return () => window.clearTimeout(handle);
  }, [activeEditor, diagnosticDependencyKey, inventoryFilter, scripts.length]);
  const fullWarningDiagnosticsById = useMemo(() => {
    const map = new Map<string, ScriptDiagnostic[]>();
    if (!project || inventoryFilter !== "warnings" || !warningScanReady) return map;
    for (const trigger of scripts) {
      const diagnostics = validateActionPointTriggerCached(project, trigger, catalog, diagnosticDependencyKey);
      if (hasScriptWarning(diagnostics)) map.set(trigger.id, diagnostics);
    }
    return map;
  }, [project, scripts, catalog, diagnosticDependencyKey, inventoryFilter, warningScanReady]);
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
  useEffect(() => {
    setSelectedDiagnosticsReady(false);
    if (!selectedTrigger || !project) return;
    const handle = window.setTimeout(() => setSelectedDiagnosticsReady(true), 120);
    return () => window.clearTimeout(handle);
  }, [project, selectedTrigger?.id, diagnosticDependencyKey]);
  const visibleDiagnosticsById = useMemo(() => {
    const map = new Map(fullWarningDiagnosticsById);
    if (!project) return map;
    if (selectedDiagnosticsReady && selectedTrigger && !map.has(selectedTrigger.id)) {
      map.set(selectedTrigger.id, validateActionPointTriggerCached(project, selectedTrigger, catalog, diagnosticDependencyKey));
    }
    return map;
  }, [project, selectedTrigger, selectedDiagnosticsReady, catalog, diagnosticDependencyKey, fullWarningDiagnosticsById]);
  if (!project) return null;
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
  const edcdUsages = useMemo(
    () => activeTabKind === "settings-rows" ? buildEdcdRowUsages(project, catalog) : [],
    [project, catalog, activeTabKind]
  );
  const selectedSlotEntity: SemanticEntity | undefined = undefined;
  const triggerDiagnostics = selectedTrigger ? visibleDiagnosticsById.get(selectedTrigger.id) ?? [] : [];
  if (activeTabKind === "settings-rows") {
    return (
      <SettingsRowsPanel
        project={project}
        catalog={catalog}
        selectedEntity={selectedEntity}
        usages={edcdUsages}
        onSelectEntity={onSelectEntity}
        onOpenTool={onOpenTool}
        onOpenCaller={(caller) => {
          if (caller.contextKind === "trigger") {
            const trigger = project.triggers.find((candidate) => candidate.id === caller.triggerId);
            if (!trigger) return;
            setSelectedSlot(caller.slot);
            onSelectEntity(selectEntityFromId(actionSlotSelectionId(trigger, caller.slot)));
            onSelectEditor?.(scriptEditorForTriggerSource(trigger.source));
            return;
          }
          if (caller.contextKind === "simpleEncounter") {
            onSelectEntity(selectEntityFromId(`encounter:simple:${caller.triggerRecordIndex}`));
            onSelectEditor?.("simple");
            return;
          }
          onSelectEntity(selectEntityFromId(`encounter:complex:${caller.triggerRecordIndex}`));
          onSelectEditor?.("complex");
        }}
        onApplyCommand={onApplyCommand}
      />
    );
  }
  if (activeTabKind === "quests") {
    return (
      <QuestWorkbench
        project={project}
        scripts={project.triggers}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
      />
    );
  }
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
  const deleteMacroLabel = selectedExtraActionClassification === "Global Event" ? "Delete Global Event" : "Delete Extra Action Point";
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
          <small>Build scenario behavior from clear steps, targets, choices, and Extra Action Points.</small>
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
                currentName={scriptLabel(project, selectedTrigger)}
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
                onRename={(displayName) => onApplyCommand?.({ kind: "renameEditorEntity", label: "Rename script", entityId: selectedTrigger.id, displayName })}
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
            <p className="empty-copy compact">Create or select an Action Point to build its script steps.</p>
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
        <ScriptPreviewDialog
          preview={previewTarget}
          onClose={() => setPreviewTarget(null)}
          onOpen={openPreviewTarget}
        />
      )}
    </section>
  );
}

function ScriptDestructiveActionDialog({
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="script-draft-navigation-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="script-draft-navigation-dialog script-destructive-action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-destructive-action-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong id="script-destructive-action-title">{title}</strong>
            <small>This action changes the script immediately.</small>
          </div>
          <button type="button" className="btn btn-secondary btn-xs icon-only" aria-label="Cancel destructive action" onClick={onCancel}>
            <X size={12} />
          </button>
        </header>
        <p>{body}</p>
        <div className="script-draft-navigation-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-danger btn-xs" onClick={onConfirm}>
            <Trash2 size={12} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ScriptPreviewDialog({
  preview,
  onClose,
  onOpen
}: {
  preview: ScriptPreviewTarget;
  onClose: () => void;
  onOpen: () => void;
}) {
  const openLabel = preview.kind === "entity" ? "Open Target" : "Open in Maps";
  return (
    <div className="script-draft-navigation-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="script-draft-navigation-dialog script-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-preview-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <strong id="script-preview-dialog-title">{preview.title}</strong>
            <small>{preview.kind === "entity" ? "Target preview" : "Map coordinate preview"}</small>
          </div>
          <button type="button" className="btn btn-secondary btn-xs icon-only" aria-label="Close preview" onClick={onClose}>
            <X size={12} />
          </button>
        </header>
        <p>{preview.detail}</p>
        <div className="script-preview-dialog-note">
          Preview does not leave this step editor. Use {openLabel} to navigate to the target.
        </div>
        <div className="script-draft-navigation-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary btn-xs" onClick={onOpen}>
            <Eye size={12} /> {openLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function textEditorNavigationLabel(editor: string) {
  if (editor === "messages") return "Strings";
  if (editor === "option-labels") return "Option Labels";
  if (editor === "scrolling-text") return "Scrolling Text";
  return "Text";
}

function QuestWorkbench({
  project,
  scripts,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  scripts: TriggerRecord[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const model = useMemo(() => buildQuestPresentation(project, scripts), [project, scripts]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedQuestId, setSelectedQuestId] = useState<number | null>(null);
  const userThreads = useMemo(() => model.threads.filter((thread) => thread.source !== "bundled"), [model.threads]);
  const selectedThread = userThreads.find((thread) => thread.id === selectedThreadId) ?? null;
  const selectedQuest = selectedQuestId == null ? null : model.questById.get(selectedQuestId) ?? null;
  const threadQuests = selectedThread ? selectedThread.questIds.map((id) => model.questById.get(id)).filter(Boolean) as QuestFlagModel[] : [];
  const activeUses = selectedThread
    ? threadQuests.flatMap((quest) => quest.uses.map((usage) => ({ ...usage, questLabel: quest.label }))).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    : selectedQuest?.uses.map((usage) => ({ ...usage, questLabel: selectedQuest.label })) ?? [];

  useEffect(() => {
    if (selectedThreadId && !userThreads.some((thread) => thread.id === selectedThreadId)) setSelectedThreadId(null);
    if (selectedQuestId != null && !model.questById.has(selectedQuestId)) setSelectedQuestId(null);
    if (!selectedThreadId && selectedQuestId == null) {
      if (model.quests[0]) setSelectedQuestId(model.quests[0].id);
      else if (userThreads[0]) setSelectedThreadId(userThreads[0].id);
    }
  }, [model.quests, model.questById, selectedQuestId, selectedThreadId, userThreads]);

  const createThread = () => {
    onApplyCommand?.({ kind: "createQuestThread", label: "Create author note", name: `Author Note ${userThreads.length + 1}` });
  };
  const updateThread = (thread: QuestThread, changes: Partial<Pick<QuestThread, "name" | "description" | "questIds" | "contextRefs">>) => {
    onApplyCommand?.({ kind: "updateQuestThread", label: "Update author note", threadId: thread.id, changes });
  };
  const addQuestToThread = (thread: QuestThread, questId: number) => {
    updateThread(thread, { questIds: [...thread.questIds, questId] });
  };
  const removeQuestFromThread = (thread: QuestThread, questId: number) => {
    updateThread(thread, { questIds: thread.questIds.filter((id) => id !== questId) });
  };
  return (
    <section className="quest-workbench">
      <header className="settings-rows-header">
        <div>
          <strong>Story Flags</strong>
          <small>Beta view for naming story flags and reviewing where scripts set, test, clear, increment, and branch on them.</small>
        </div>
        <div className="script-toolbar">
          <button type="button" className="btn btn-secondary btn-xs" onClick={createThread}>
            <Plus size={12} /> Author Note
          </button>
        </div>
      </header>
      <div className="quest-workbench-layout">
        <aside className="quest-thread-column">
          <PanelSection title="Decoded Story Flags" eyebrow={`${model.quests.length} known`} density="compact" className="quest-raw-panel">
            <div className="quest-raw-list">
              {model.quests.map((quest) => (
                <button
                  key={quest.id}
                  type="button"
                  className={`quest-raw-row${quest.id === selectedQuest?.id ? " selected" : ""}`}
                  onClick={() => {
                    setSelectedThreadId(null);
                    setSelectedQuestId(quest.id);
                  }}
                >
                  <span>
                    <b>{quest.label}</b>
                    <small>Quest {quest.id} | {quest.uses.length} use{quest.uses.length === 1 ? "" : "s"}</small>
                  </span>
                  {quest.warnings.length > 0 && <AlertTriangle size={13} />}
                </button>
              ))}
              {model.quests.length === 0 && <small className="empty-copy compact">No flag labels or decoded quest-flag uses found.</small>}
            </div>
          </PanelSection>
          <PanelSection title="Context Notes" eyebrow={`${userThreads.length} author`} density="compact">
            {userThreads.length === 0 ? (
              <div className="script-tab-note">
                <strong>No author notes yet</strong>
                <small>Create a note if you want to group raw flags or document story meaning for this project.</small>
              </div>
            ) : (
              <div className="quest-card-list">
                {userThreads.map((thread) => (
                  <div key={thread.id} className={`quest-thread-card${thread.id === selectedThread?.id ? " selected" : ""}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedThreadId(thread.id);
                        setSelectedQuestId(null);
                      }}
                    >
                      <strong>{thread.name}</strong>
                      <small>{thread.questIds.length} flag{thread.questIds.length === 1 ? "" : "s"}</small>
                    </button>
                    <button type="button" className="btn btn-danger btn-xs icon-only" title="Delete note" onClick={() => onApplyCommand?.({ kind: "deleteQuestThread", label: "Delete author note", threadId: thread.id })}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </PanelSection>
        </aside>
        <main className="quest-detail-panel">
          {selectedThread ? (
            <QuestThreadDetail
              thread={selectedThread}
              quests={threadQuests}
              allQuests={model.quests}
              uses={activeUses}
              onOpenUsage={onSelectEntity}
              onUpdateThread={(changes) => updateThread(selectedThread, changes)}
              onAddQuest={(questId) => addQuestToThread(selectedThread, questId)}
              onRemoveQuest={(questId) => removeQuestFromThread(selectedThread, questId)}
              onApplyCommand={onApplyCommand}
            />
          ) : selectedQuest ? (
            <QuestFlagDetail
              quest={selectedQuest}
              threads={model.threads}
              uses={activeUses}
              onOpenUsage={onSelectEntity}
              onAddToThread={(thread) => addQuestToThread(thread, selectedQuest.id)}
              onApplyCommand={onApplyCommand}
              userThreads={userThreads}
            />
          ) : (
            <EmptyState title="No story flag selected" body="Select a raw Divinity quest flag or create an optional author note." />
          )}
        </main>
      </div>
    </section>
  );
}

function QuestThreadDetail({
  thread,
  quests,
  allQuests,
  uses,
  onOpenUsage,
  onUpdateThread,
  onAddQuest,
  onRemoveQuest,
  onApplyCommand
}: {
  thread: QuestThread;
  quests: QuestFlagModel[];
  allQuests: QuestFlagModel[];
  uses: Array<QuestUsage & { questLabel: string }>;
  onOpenUsage: (entity: SelectedEntity) => void;
  onUpdateThread: (changes: Partial<Pick<QuestThread, "name" | "description" | "questIds" | "contextRefs">>) => void;
  onAddQuest: (questId: number) => void;
  onRemoveQuest: (questId: number) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const threadIds = new Set(thread.questIds);
  return (
    <div className="quest-detail-grid">
      <PanelSection title={thread.source === "bundled" ? "Curated Note" : "Author Note"} eyebrow={`${thread.questIds.length} flags`} density="compact">
        {thread.source === "bundled" ? (
          <div className="known-thread-summary">
            <strong>{thread.name}</strong>
            <small>{thread.description}</small>
            <span>This bundled beta note is read-only. Create a project author note if you want editable interpretation.</span>
          </div>
        ) : (
          <>
            <label className="field-stack">
              <span>Name</span>
              <input key={`${thread.id}:name`} defaultValue={thread.name} onBlur={(event) => onUpdateThread({ name: event.currentTarget.value })} />
            </label>
            <label className="field-stack">
              <span>Notes</span>
              <textarea key={`${thread.id}:description`} defaultValue={thread.description} rows={3} onBlur={(event) => onUpdateThread({ description: event.currentTarget.value })} />
            </label>
          </>
        )}
        <div className="quest-chip-grid">
          {quests.map((quest) => (
            <span key={quest.id} className="quest-chip">
              {quest.label}
              {thread.source !== "bundled" && <button type="button" title="Remove from thread" onClick={() => onRemoveQuest(quest.id)}><X size={11} /></button>}
            </span>
          ))}
          {quests.length === 0 && <small className="empty-copy compact">{thread.source === "bundled" ? "This note has no matching raw flags in the current decoded view." : "Add raw flags to build this author note."}</small>}
        </div>
      </PanelSection>
      <QuestContextRefsPanel
        title="Attached Context"
        refs={thread.contextRefs ?? []}
        emptyCopy="No imported context is attached to this note."
      />
      {thread.source !== "bundled" && (
        <PanelSection title="Add Flag" eyebrow="raw flags" density="compact">
          <div className="quest-add-grid">
            {allQuests.filter((quest) => !threadIds.has(quest.id)).slice(0, 18).map((quest) => (
              <button key={quest.id} type="button" className="btn btn-secondary btn-xs" onClick={() => onAddQuest(quest.id)}>
                <Plus size={11} /> {quest.label}
              </button>
            ))}
            {allQuests.every((quest) => threadIds.has(quest.id)) && <small className="empty-copy compact">Every known quest flag is already in this thread.</small>}
          </div>
        </PanelSection>
      )}
      <QuestUsageTimeline uses={uses} onOpenUsage={onOpenUsage} />
      <ThreadWarnings quests={quests} onApplyCommand={onApplyCommand} />
    </div>
  );
}

function QuestFlagDetail({
  quest,
  threads,
  uses,
  onOpenUsage,
  onAddToThread,
  onApplyCommand,
  userThreads
}: {
  quest: QuestFlagModel;
  threads: QuestThread[];
  uses: Array<QuestUsage & { questLabel: string }>;
  onOpenUsage: (entity: SelectedEntity) => void;
  onAddToThread: (thread: QuestThread) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  userThreads: QuestThread[];
}) {
  return (
    <div className="quest-detail-grid">
      <PanelSection title={quest.label} eyebrow={`Quest ${quest.id}`} density="compact">
        <div className="quest-usage-counts">
          {QUEST_CATEGORIES.map((category) => quest.counts[category] > 0 && (
            <span key={category}>{questCategoryLabel(category)} <b>{quest.counts[category]}</b></span>
          ))}
        </div>
        <label className="field-stack">
          <span>Flag Label</span>
          <input
            key={`${quest.id}:label`}
            defaultValue={quest.authored ? quest.label : ""}
            placeholder={`Quest ${quest.id}`}
            onBlur={(event) => {
              const label = event.currentTarget.value.trim();
              if (label) onApplyCommand?.({ kind: "upsertQuestLabel", label: "Update quest label", quest: { id: quest.id, label, note: quest.note } });
            }}
          />
        </label>
        <label className="field-stack">
          <span>Flag Notes</span>
          <textarea
            key={`${quest.id}:note`}
            defaultValue={quest.note}
            rows={3}
            onBlur={(event) => {
              if (quest.authored || event.currentTarget.value.trim()) {
                onApplyCommand?.({ kind: "upsertQuestLabel", label: "Update quest note", quest: { id: quest.id, label: quest.label, note: event.currentTarget.value } });
              }
            }}
          />
        </label>
        {!quest.authored && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Create quest label", quest: { id: quest.id, label: `Quest ${quest.id}` } })}>
            <Plus size={12} /> Create Label
          </button>
        )}
      </PanelSection>
      <PanelSection title="Add To Author Note" eyebrow={`${userThreads.length} saved`} density="compact">
        <div className="quest-add-grid">
          {userThreads.filter((thread) => !thread.questIds.includes(quest.id)).map((thread) => (
            <button key={thread.id} type="button" className="btn btn-secondary btn-xs" onClick={() => onAddToThread(thread)}>
              <Plus size={11} /> {thread.name}
            </button>
          ))}
          {userThreads.length === 0 && <small className="empty-copy compact">Create an author note first.</small>}
        </div>
      </PanelSection>
      <QuestContextRefsPanel
        title="Nearby Context"
        refs={quest.contextRefs}
        emptyCopy="No attached context is linked to this flag."
      />
      <QuestUsageTimeline uses={uses} onOpenUsage={onOpenUsage} />
      <QuestWarnings warnings={quest.warnings} />
    </div>
  );
}

function QuestContextRefsPanel({ title, refs, emptyCopy }: { title: string; refs: NonNullable<QuestThread["contextRefs"]>; emptyCopy: string }) {
  return (
    <PanelSection title={title} eyebrow={`${refs.length} clue${refs.length === 1 ? "" : "s"}`} density="compact">
      {refs.length === 0 ? (
        <small className="empty-copy compact">{emptyCopy}</small>
      ) : (
        <div className="quest-context-ref-list">
          {refs.map((ref, index) => (
            <div key={`${ref.sourceId}:${ref.sectionId ?? index}`} className="quest-context-ref">
              <strong>{ref.label}</strong>
              {ref.snippet && <small>{ref.snippet}</small>}
              {ref.terms && ref.terms.length > 0 && (
                <div className="quest-context-term-row">
                  {ref.terms.slice(0, 8).map((term) => <span key={term}>{term}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function QuestUsageTimeline({ uses, onOpenUsage }: { uses: Array<QuestUsage & { questLabel: string }>; onOpenUsage: (entity: SelectedEntity) => void }) {
  return (
    <PanelSection title="Flag Flow" eyebrow={`${uses.length} decoded uses`} density="compact" className="quest-flow-panel">
      {uses.length === 0 ? (
        <small className="empty-copy compact">No decoded script uses yet.</small>
      ) : (
        <div className="quest-flow-list">
          {uses.map((usage) => (
            <div key={usage.key} className={`quest-flow-row ${usage.category}`}>
              <span>
                <b>{questCategoryLabel(usage.category)}</b>
                <small>{usage.questLabel} | {usage.sourceLabel}</small>
                <em>{usage.detail}</em>
              </span>
              {usage.entityId && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => onOpenUsage(selectEntityFromId(usage.entityId!))}>
                  Open
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function QuestWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <PanelSection title="Warnings" eyebrow={`${warnings.length}`} density="compact">
      <div className="quest-warning-list">
        {warnings.map((warning) => (
          <div key={warning} className="quest-warning-row">
            <AlertTriangle size={13} />
            <span>{warning}</span>
          </div>
        ))}
      </div>
    </PanelSection>
  );
}

function ThreadWarnings({ quests, onApplyCommand }: { quests: QuestFlagModel[]; onApplyCommand?: (command: ProjectCommand) => void }) {
  const warnings = quests.flatMap((quest) => quest.warnings.map((warning) => ({ quest, warning })));
  if (warnings.length === 0) return null;
  return (
    <PanelSection title="Thread Warnings" eyebrow={`${warnings.length}`} density="compact">
      <div className="quest-warning-list">
        {warnings.map(({ quest, warning }) => (
          <div key={`${quest.id}:${warning}`} className="quest-warning-row">
            <AlertTriangle size={13} />
            <span><b>{quest.label}</b>: {warning}</span>
            {!quest.authored && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Create quest label", quest: { id: quest.id, label: `Quest ${quest.id}` } })}
              >
                Label
              </button>
            )}
          </div>
        ))}
      </div>
    </PanelSection>
  );
}

const EDCD_ROW_FILTERS: Array<{ id: EdcdRowFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "in-use", label: "In Use" },
  { id: "shared", label: "Shared" },
  { id: "unused", label: "Unused" },
  { id: "missing", label: "Missing" },
  { id: "conflict", label: "Conflicts" }
];

function SettingsRowsPanel({
  project,
  catalog,
  selectedEntity,
  usages,
  onSelectEntity,
  onOpenTool,
  onOpenCaller,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  usages: EdcdRowUsage[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenCaller: (caller: EdcdRowCaller) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [filter, setFilter] = usePersistentValue<EdcdRowFilter>("scripts.edcdRows.filter", "all");
  const [query, setQuery] = useState("");
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [templateOpcode, setTemplateOpcode] = useState<number>(() => SCRIPT_ACTION_DEFINITIONS.find((definition) => definition.edcdShape)?.opcode ?? 2);
  const edcdTemplates = SCRIPT_ACTION_DEFINITIONS.filter((definition) => definition.edcdShape && definition.authoringLevel !== "ignored");
  const selectedEntityRowId = edcdRowIdFromSelectedEntity(selectedEntity);

  useEffect(() => {
    if (selectedEntityRowId == null) return;
    setSelectedRowId(selectedEntityRowId);
    setQuery(String(selectedEntityRowId));
  }, [selectedEntityRowId]);
  const selectedTemplate = scriptActionDefinitionFor(templateOpcode);
  const usageCounts = useMemo(() => {
    const counts = new Map<EdcdRowFilter, number>(EDCD_ROW_FILTERS.map((entry) => [entry.id, 0]));
    for (const usage of usages) {
      counts.set("all", (counts.get("all") ?? 0) + 1);
      counts.set(usage.status, (counts.get(usage.status) ?? 0) + 1);
    }
    return counts;
  }, [usages]);
  const filteredUsages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return usages.filter((usage) => {
      if (!edcdUsageMatchesFilter(usage, filter)) return false;
      if (!normalized) return true;
      return [
        usage.rowId,
        usage.statusLabel,
        usage.summary,
        usage.primaryActionLabel,
        usage.primaryShape,
        usage.possibleShapes.join(" "),
        usage.values.join(" "),
        usage.callers.map((caller) => `${caller.actionLabel} ${callerLabel(project, caller)} ${caller.slot}`).join(" ")
      ].join(" ").toLowerCase().includes(normalized);
    });
  }, [filter, query, usages]);
  const selectedUsage = filteredUsages.find((usage) => usage.rowId === selectedRowId)
    ?? usages.find((usage) => usage.rowId === selectedRowId)
    ?? filteredUsages[0]
    ?? usages[0]
    ?? null;
  const selectedShape = selectedUsage?.primaryShape ?? selectedTemplate.edcdShape ?? undefined;
  const selectedOpcode = selectedUsage?.primaryOpcode ?? selectedTemplate.opcode;
  const editorUsage = selectedUsage ? edcdUsageToEditorUsage(selectedUsage, selectedShape) : null;
  const canDelete = selectedUsage?.exists && selectedUsage.status === "unused";
  const duplicateRow = () => {
    if (!selectedUsage) return;
    const nextId = nextUnusedEdcdRowId(project);
    onApplyCommand?.({ kind: "updateEdcdRow", label: `Duplicate Settings #${selectedUsage.rowId}`, rowId: nextId, values: selectedUsage.values });
    setSelectedRowId(nextId);
  };
  const createRow = () => {
    const nextId = selectedUsage && !selectedUsage.exists ? selectedUsage.rowId : nextUnusedEdcdRowId(project);
    const values = normalizeEdcdValues(selectedUsage?.exists ? selectedUsage.values : selectedTemplate.defaultDraft.parameters);
    onApplyCommand?.({ kind: "updateEdcdRow", label: `Create Settings #${nextId}`, rowId: nextId, values });
    setSelectedRowId(nextId);
  };

  return (
    <section className="settings-rows-workbench">
      <header>
        <div>
          <TutorialTip title="Action Settings" body={SETTINGS_HELP} side="below">
            <strong>Action Settings</strong>
          </TutorialTip>
          <small>Inspect and repair the extra fields used by settings-backed actions.</small>
        </div>
        <div className="script-toolbar">
          <button type="button" className="btn btn-secondary btn-xs" onClick={createRow}>
            <Plus size={12} /> Create From Template
          </button>
        </div>
      </header>
      <div className="settings-rows-layout">
        <aside className="settings-row-list-column">
          <div className="settings-row-filter-panel">
            <input
              className="script-list-filter"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Filter action settings..."
            />
            <div className="script-list-scope script-filter-chips" role="group" aria-label="Action settings filter">
              {EDCD_ROW_FILTERS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={filter === entry.id ? "active" : ""}
                  onClick={() => setFilter(entry.id)}
                >
                  <span>{entry.label}</span>
                  <b>{usageCounts.get(entry.id) ?? 0}</b>
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="settings-row-list" aria-label="Action settings">
            {filteredUsages.map((usage) => (
              <button
                key={usage.rowId}
                type="button"
                className={`settings-row-card${usage.rowId === selectedUsage?.rowId ? " selected" : ""} ${edcdUsageStatusTone(usage.status)}`}
                onClick={() => setSelectedRowId(usage.rowId)}
              >
                <span>
                  <strong>Settings #{usage.rowId}</strong>
                  <small>{usage.summary}</small>
                </span>
                <b>{usage.statusLabel}</b>
                <small>{usage.callers.length} caller{usage.callers.length === 1 ? "" : "s"}{usage.primaryShape ? ` | ${usage.primaryShape}` : ""}</small>
              </button>
            ))}
            {filteredUsages.length === 0 && <EmptyState compact title="No action settings" body="No settings match this filter." />}
          </ScrollArea>
        </aside>
        <main className="settings-row-detail">
          {selectedUsage ? (
            <PanelSection
              title={`Settings #${selectedUsage.rowId}`}
              eyebrow={selectedUsage.statusLabel}
              density="compact"
              actions={
                <>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={duplicateRow} disabled={!selectedUsage.exists}>
                    <Copy size={12} /> Duplicate Settings
                  </button>
                  <button type="button" className="btn btn-danger btn-xs" disabled={!canDelete} title={canDelete ? "Delete these unused settings." : "Only unused settings can be deleted here."} onClick={() => onApplyCommand?.({ kind: "deleteEdcdRow", label: `Delete Settings #${selectedUsage.rowId}`, rowId: selectedUsage.rowId })}>
                    <Trash2 size={12} /> Delete Unused Settings
                  </button>
                </>
              }
            >
              <div className="settings-row-overview">
                <div className={`settings-row-status ${edcdUsageStatusTone(selectedUsage.status)}`}>
                  <strong>{selectedUsage.statusLabel}</strong>
                  <span>{selectedUsage.exists ? "Stored in project action settings." : "Referenced by a script but not created yet."}</span>
                </div>
                {selectedUsage.warnings.map((warning) => <p key={warning} className="field-warning">{warning}</p>)}
                {selectedUsage.callers.length > 0 && (
                  <div className="settings-row-callers">
                    <strong>Used By</strong>
                    {selectedUsage.callers.map((caller) => (
                      <button key={`${caller.triggerId}-${caller.slot}`} type="button" className="settings-row-caller" onClick={() => onOpenCaller(caller)}>
                        <span>{caller.actionShortLabel}</span>
                        <small>{callerLabel(project, caller)} | step {caller.slot + 1}</small>
                      </button>
                    ))}
                  </div>
                )}
                {!selectedUsage.primaryShape && (
                  <label className="script-required-field">
                    <span>Template</span>
                    <select value={templateOpcode} onChange={(event) => setTemplateOpcode(Number(event.currentTarget.value))}>
                      {edcdTemplates.map((definition) => (
                        <option key={definition.opcode} value={definition.opcode}>{definition.label}</option>
                      ))}
                    </select>
                    <small>Choose a template to interpret or create this row with guided fields.</small>
                  </label>
                )}
              </div>
              <EdcdRowEditor
                project={project}
                catalog={catalog}
                edcdUsage={editorUsage}
                fallbackRowId={selectedUsage.rowId}
                fallbackShape={selectedShape}
                fallbackFieldNames={selectedShape ? edcdFieldNamesForShape(selectedShape) : undefined}
                fallbackInitialValues={selectedUsage.exists ? selectedUsage.values : selectedTemplate.defaultDraft.parameters}
                fallbackOpcode={selectedOpcode}
                parameterLabels={selectedOpcode != null ? scriptActionDefinitionFor(selectedOpcode).parameters : undefined}
                selectedSlotLabel="settings"
                onSelectEntity={onSelectEntity}
                onOpenText={(editor) => onOpenTool?.("text", editor)}
                onApplyCommand={onApplyCommand}
              />
            </PanelSection>
          ) : (
            <EmptyState title="No action settings yet" body="Create settings from a template or add a settings-backed action to a script." />
          )}
        </main>
      </div>
    </section>
  );
}

function callerLabel(project: Project, caller: EdcdRowCaller) {
  if (caller.contextKind === "simpleEncounter") return `Simple Encounter ${caller.triggerRecordIndex}`;
  if (caller.contextKind === "complexEncounter") return `Complex Encounter ${caller.triggerRecordIndex}`;
  const trigger = project.triggers.find((candidate) => candidate.id === caller.triggerId);
  if (!trigger) return `Record ${caller.triggerRecordIndex}`;
  return scriptLabel(project, trigger);
}

function scriptEditorForTriggerSource(source: string) {
  if (source === "Data ED3") return "macros";
  if (source === "Global") return "global-macros";
  return "action-points";
}

function edcdRowIdFromSelectedEntity(entity: SelectedEntity | null) {
  const match = /^record:Data EDCD:(-?\d+)$/.exec(entity?.id ?? "");
  if (!match) return null;
  const rowId = Number(match[1]);
  return Number.isFinite(rowId) ? Math.max(0, Math.trunc(rowId)) : null;
}

function isScriptsBenchmarkMode() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("benchmarkScripts");
}

function clampRealmzCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(89, Math.trunc(value)));
}
