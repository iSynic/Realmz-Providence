import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, CopyPlus, Plus, Save, Trash2, X } from "lucide-react";
import { Action, EncounterActionRow, LevelType, LibraryCatalog, Project, ProjectCommand, RealmzTargetRecordKind, ScriptDetailSurface, ScriptInventoryFilter, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { linksFor, selectEntityFromId, semanticLabel, triggerEntityId } from "../utils";
import { actionSlotEntitiesForTriggerRecord, ed3EvidenceRecords, ed3ReachabilityFor, extraActionPointClassification, isCallableMacro } from "../semanticGraph";
import { EdcdRowEditor } from "../components/EdcdRowEditor";
import { TargetPicker, targetOptionsForOpcode } from "../components/RealmzTargetPicker";
import { categoryColor } from "../components/TileSprite";
import { CollapsibleSection, EmptyState, FieldRow, FloatingWorkbenchPanel, PanelSection, ScrollArea } from "../ui";
import { ACTION_OPTIONS, actionOptionFor, isDispatcherNoopOpcode } from "../realmzActions";
import { edcdFieldNamesForShape } from "../realmzEdcd";
import { crosswalkForOpcode, opcodeIdMeaning, parameterLabelsForOpcode } from "../opcodeCrosswalk";
import { divinityHelpForOpcode } from "../divinityOpcodeHelp";
import { ScriptDiagnostic, validateActionDraft, validateScriptTrigger } from "../scriptValidation";
import { actionPointCapacity, isReusableDoorPlaceholder, nextActionPointRecordIndex } from "../actionPointCapacity";
import { realmzScriptStepDescriptorFor } from "../realmzScriptDescriptors";
import { validateRealmzTargetRecord } from "../targetValidation";
import { ITEM_REFERENCE_CATEGORIES, itemReferenceDetail, itemReferenceOptions, type ItemReferenceCategory } from "../itemReferences";
import { monsterReferenceDetail, monsterReferenceOptions } from "../monsterReferences";
import { CONDITION_LABELS, RESISTANCE_TYPES } from "../rulesCatalog";
import {
  SCRIPT_INVENTORY_FILTERS,
  ScriptListItem,
  actionBelongsTo,
  actionSummary,
  filterScriptsByInventory,
  issueCountsBySlot,
  scriptLabel,
  scriptMatchesQuery,
  scriptPanelTitle,
  scriptSubtitle,
  triggerMatchesSelection,
  triggerSelectionId,
  triggerSemanticSelectionId,
  triggerVisibleForEditor,
  usePersistentBoolean,
  usePersistentValue
} from "./scripts/scriptInventory";
import {
  SCRIPT_ACTION_DEFINITIONS,
  SCRIPT_ACTION_CATEGORIES,
  actionDefinitionsForCategory,
  scriptActionDefinitionFor,
  scriptActionSummary,
  scriptStepBranchHint,
  type ScriptActionCategory,
  type ScriptActionDefinition
} from "./scripts/scriptActionCatalog";

const MONSTER_TRAIT_LABELS = [
  "Magic Using",
  "Undead",
  "Demonic/Devil",
  "Reptilian",
  "Very Evil",
  "Intelligent",
  "Giant Size",
  "Non-Humanoid"
];

const MONSTER_MONEY_LABELS = ["Gold", "Gems", "Jewelry"];

const SCRIPT_EDITOR_TABS = [
  { id: "action-points", label: "Action Points", title: "Create and edit map Action Points." },
  { id: "macros", label: "Reusable Actions", title: "Reusable actions and branch targets." },
  { id: "global-macros", label: "Global Events", title: "Scenario-wide event hooks and startup logic." },
  { id: "quests", label: "Quests", title: "Quest flags and script references." },
  { id: "ed3-evidence", label: "Advanced Imports", title: "Imported advanced action data kept with the scenario." }
];

const scriptDiagnosticCache = new WeakMap<TriggerRecord, { key: string; diagnostics: ScriptDiagnostic[] }>();
const objectIdentity = new WeakMap<object, number>();
let nextObjectIdentity = 1;

function refKey(value: object | null | undefined) {
  if (!value) return "none";
  const existing = objectIdentity.get(value);
  if (existing) return existing;
  const next = nextObjectIdentity++;
  objectIdentity.set(value, next);
  return next;
}

function scriptDiagnosticDependencyKey(project: Project, catalog?: LibraryCatalog | null) {
  const macroKey = project.triggers
    .filter((trigger) => trigger.source === "Data ED3")
    .map((trigger) => `${trigger.recordIndex}:${trigger.actions.length}:${trigger.active ? 1 : 0}`)
    .join(",");
  return [
    refKey(catalog ?? null),
    refKey(project.extracodes),
    refKey(project.messages),
    refKey(project.battles),
    refKey(project.monsters),
    refKey(project.treasures),
    refKey(project.shops),
    refKey(project.simpleEncounters),
    refKey(project.complexEncounters),
    refKey(project.thiefEncounters),
    refKey(project.timedEncounters),
    refKey(project.questLabels),
    refKey(project.assets),
    refKey(project.maps),
    refKey(project.mapRecords),
    refKey(project.semanticSchema),
    macroKey
  ].join("|");
}

function cachedValidateScriptTrigger(project: Project, trigger: TriggerRecord, catalog: LibraryCatalog | null | undefined, dependencyKey: string) {
  const cached = scriptDiagnosticCache.get(trigger);
  if (cached?.key === dependencyKey) return cached.diagnostics;
  const diagnostics = validateScriptTrigger(project, trigger, catalog);
  scriptDiagnosticCache.set(trigger, { key: dependencyKey, diagnostics });
  return diagnostics;
}

function authorFacingExtraActionKind(classification: string) {
  return classification
    .replace(/\bGlobal Macro\b/g, "Global Event")
    .replace(/\bMacro\b/g, "Reusable Action");
}

export function ScriptsPanel({
  project,
  catalog,
  selectedEntity,
  onSelectEntity,
  onSelectEditor,
  onOpenTool,
  onApplyCommand,
  activeEditor = "action-points"
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  activeEditor?: string;
}) {
  const [, startScriptTransition] = useTransition();
  const effectiveEditor = activeEditor === "domain" ? "action-points" : activeEditor;
  const handleSelectEntity = useCallback((entity: SelectedEntity) => {
    startScriptTransition(() => onSelectEntity(entity));
  }, [onSelectEntity]);
  const handleApplyCommand = useCallback((command: ProjectCommand) => {
    startScriptTransition(() => onApplyCommand?.(command));
  }, [onApplyCommand]);
  return (
    <div className="editor-full-panel scripts-workbench">
      <ScriptEditorTabs activeEditor={effectiveEditor} onSelectEditor={onSelectEditor} />
      <ScriptAuthoringPanel project={project} catalog={catalog} activeEditor={effectiveEditor} selectedEntity={selectedEntity} onSelectEntity={handleSelectEntity} onOpenTool={onOpenTool} onApplyCommand={handleApplyCommand} />
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
  onSelectEntity,
  onOpenTool,
  onApplyCommand
}: {
  project: Project | null;
  catalog?: LibraryCatalog | null;
  activeEditor: string;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const scripts = useMemo(
    () => project?.triggers.filter((trigger) => triggerVisibleForEditor(project, trigger, activeEditor)) ?? [],
    [project, activeEditor]
  );
  const ed3Evidence = useMemo(() => activeEditor === "ed3-evidence" ? ed3EvidenceRecords(project) : [], [project, activeEditor]);
  const projectMaps = project?.maps ?? [];
  const [draft, setDraft] = useState<Record<string, { rawCode: number; id: number }>>({});
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<ScriptActionCategory>("Dialogue");
  const [opcodeQuery, setOpcodeQuery] = useState("");
  const [scriptQuery, setScriptQuery] = useState("");
  const [inventoryFilter, setInventoryFilter] = usePersistentValue<ScriptInventoryFilter>("scripts.inventory.filter", "current-map");
  const [detailSurface, setDetailSurface] = usePersistentValue<ScriptDetailSurface>("scripts.detailSurface", "docked");
  const [targetDrawerOpen, setTargetDrawerOpen] = usePersistentBoolean("scripts.targetDrawer.open", true);
  const [newActionPoint, setNewActionPoint] = useState({ mapId: projectMaps[0]?.id ?? "", x: 1, y: 1 });
  const selectedScriptButtonRef = useRef<HTMLButtonElement | null>(null);
  const benchmarkStartedRef = useRef(false);
  useEffect(() => {
    if (projectMaps.length === 0) return;
    if (!projectMaps.some((map) => map.id === newActionPoint.mapId)) {
      setNewActionPoint((current) => ({ ...current, mapId: projectMaps[0].id }));
    }
  }, [newActionPoint.mapId, projectMaps]);
  useEffect(() => {
    if (activeEditor === "macros" || activeEditor === "global-macros") {
      setInventoryFilter("macros");
    }
  }, [activeEditor]);
  useEffect(() => {
    selectedScriptButtonRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedEntity?.id, inventoryFilter, scriptQuery, scripts.length]);
  const selectedMap = projectMaps.find((map) => map.id === newActionPoint.mapId) ?? projectMaps[0] ?? null;
  const canScopeToMap = Boolean(selectedMap && activeEditor !== "macros" && activeEditor !== "global-macros");
  const diagnosticDependencyKey = useMemo(() => project ? scriptDiagnosticDependencyKey(project, catalog) : "", [project, catalog]);
  const fullWarningDiagnosticsById = useMemo(() => {
    const map = new Map<string, ScriptDiagnostic[]>();
    if (!project || inventoryFilter !== "warnings") return map;
    for (const trigger of scripts) {
      const diagnostics = cachedValidateScriptTrigger(project, trigger, catalog, diagnosticDependencyKey);
      if (diagnostics.length > 0) map.set(trigger.id, diagnostics);
    }
    return map;
  }, [project, scripts, catalog, diagnosticDependencyKey, inventoryFilter]);
  const inventoryCounts = useMemo(() => {
    const counts = new Map<ScriptInventoryFilter, number | null>();
    for (const filter of SCRIPT_INVENTORY_FILTERS) {
      if (filter.id === "warnings" && inventoryFilter !== "warnings") {
        counts.set(filter.id, null);
        continue;
      }
      counts.set(filter.id, filterScriptsByInventory(project, scripts, filter.id, selectedMap, canScopeToMap, fullWarningDiagnosticsById).length);
    }
    return counts;
  }, [project, scripts, selectedMap, canScopeToMap, fullWarningDiagnosticsById, inventoryFilter]);
  const scopedScripts = useMemo(
    () => filterScriptsByInventory(project, scripts, inventoryFilter, selectedMap, canScopeToMap, fullWarningDiagnosticsById),
    [project, scripts, inventoryFilter, selectedMap, canScopeToMap, fullWarningDiagnosticsById]
  );
  const filteredScripts = useMemo(
    () => project ? scopedScripts.filter((trigger) => scriptMatchesQuery(project, trigger, scriptQuery)) : [],
    [project, scopedScripts, scriptQuery]
  );
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
  const selectedTrigger =
    scripts.find((trigger) => triggerMatchesSelection(trigger, selectedEntity?.id ?? "")) ??
    filteredScripts[0] ??
    scripts[0] ??
    null;
  const visibleScripts = useMemo(() => filteredScripts.slice(0, 240), [filteredScripts]);
  const visibleDiagnosticsById = useMemo(() => {
    const map = new Map(fullWarningDiagnosticsById);
    if (!project) return map;
    if (selectedTrigger && !map.has(selectedTrigger.id)) {
      map.set(selectedTrigger.id, cachedValidateScriptTrigger(project, selectedTrigger, catalog, diagnosticDependencyKey));
    }
    return map;
  }, [project, selectedTrigger, catalog, diagnosticDependencyKey, fullWarningDiagnosticsById]);
  if (!project) return null;
  const selectedMapCapacity = selectedMap ? actionPointCapacity(project.triggers, selectedMap.levelType, selectedMap.index) : null;
  const slotDraft = (slot: number, action?: Action) => draft[`${selectedTrigger?.id}:${slot}`] ?? { rawCode: action?.rawCode ?? 0, id: action?.id ?? 0 };
  const selectedAction = selectedTrigger?.actions.find((candidate) => candidate.slot === selectedSlot);
  const selectedKey = `${selectedTrigger?.id}:${selectedSlot}`;
  const selectedDraft = slotDraft(selectedSlot, selectedAction);
  const selectedDraftDirty = selectedAction
    ? selectedDraft.rawCode !== selectedAction.rawCode || selectedDraft.id !== selectedAction.id
    : selectedDraft.rawCode !== 0 || selectedDraft.id !== 0;
  const selectedOption = actionOptionFor(selectedDraft.rawCode);
  const selectedDefinition = scriptActionDefinitionFor(selectedDraft.rawCode);
  const filteredDefinitions = actionDefinitionsForCategory(categoryFilter, opcodeQuery);
  const actionSlots = selectedTrigger ? actionSlotEntitiesForTriggerRecord(project, selectedTrigger) : [];
  const selectedSlotEntity = actionSlots.find((entity) => Number(entity.summary.slot) === selectedSlot);
  const selectedEdcdUsage = selectedSlotEntity?.summary.edcdUsage as
    | {
        rowId?: number;
        shape?: string;
        opcode?: number;
        fields?: { name?: string; value?: number }[];
        secondaryRowId?: number;
        secondaryShape?: string;
        secondaryFields?: { name?: string; value?: number }[];
        diagnostics?: string[];
        summary?: string;
      }
    | undefined;
  const triggerDiagnostics = selectedTrigger ? visibleDiagnosticsById.get(selectedTrigger.id) ?? [] : [];
  const selectedSlotDiagnostics = selectedTrigger
    ? validateActionDraft(project, selectedTrigger, selectedSlot, selectedDraft.rawCode, selectedDraft.id, catalog)
    : [];
  const selectedEdcdRowId = selectedEdcdUsage?.rowId ?? (selectedOption.edcdShape ? Math.max(0, selectedDraft.id) : null);
  const isMacro = selectedTrigger?.source === "Data ED3";
  const selectedExtraActionClassification = selectedTrigger && isMacro ? authorFacingExtraActionKind(extraActionPointClassification(project, selectedTrigger)) : "Action Point";
  const deleteMacroLabel = selectedExtraActionClassification === "Global Event" ? "Delete Global Event" : "Delete Reusable Action";
  const moveMapKey = selectedTrigger && !isMacro && selectedTrigger.levelType && selectedTrigger.levelIndex != null
    ? `${selectedTrigger.levelType}:${selectedTrigger.levelIndex}`
    : "";
  const issueCounts = issueCountsBySlot(triggerDiagnostics);
  const setSelectedDraft = (values: { rawCode: number; id: number }) => setDraft({ ...draft, [selectedKey]: values });
  const applySelectedSlot = () => {
    if (!selectedTrigger) return;
    onApplyCommand?.({
      kind: "updateActionSlot",
      label: `Update slot ${selectedSlot}`,
      triggerId: selectedTrigger.id,
      slot: selectedSlot,
      rawCode: selectedDraft.rawCode,
      id: selectedDraft.id
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
  const directTargetDrawerAvailable = !selectedOption.edcdShape;
  const targetRecordType = realmzScriptStepDescriptorFor(selectedDraft.rawCode).targetType;
  const wideTargetRecord = targetRecordType === "battle" || targetRecordType === "treasure" || targetRecordType === "shop" || targetRecordType === "simpleEncounter" || targetRecordType === "complexEncounter" || targetRecordType === "thiefEncounter" || targetRecordType === "timedEncounter";
  const detailSurfaceButton = (
    <button
      type="button"
      className="btn btn-secondary btn-xs"
      title={floatingDetail ? "Dock this selected slot editor back into the Scripts workbench." : "Float this selected slot editor for more target editing room."}
      onClick={() => setDetailSurface(floatingDetail ? "docked" : "floating")}
    >
      {floatingDetail ? "Dock" : "Float"}
    </button>
  );
  const stepDetailActions = selectedTrigger ? (
    <>
      {detailSurfaceButton}
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move step up" disabled={selectedSlot === 0} onClick={() => onApplyCommand?.({ kind: "swapActionSlots", label: "Move step", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot - 1 })}>
        <ArrowUp size={12} />
      </button>
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move step down" disabled={selectedSlot === 7} onClick={() => onApplyCommand?.({ kind: "swapActionSlots", label: "Move step", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot + 1 })}>
        <ArrowDown size={12} />
      </button>
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Duplicate step to next position" disabled={!selectedAction || selectedSlot === 7} onClick={() => onApplyCommand?.({ kind: "duplicateActionSlot", label: "Duplicate step", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot: selectedSlot + 1 })}>
        <CopyPlus size={12} />
      </button>
      <button type="button" className="btn btn-danger btn-xs icon-only" title="Clear step" disabled={!selectedAction} onClick={() => onApplyCommand?.({ kind: "deleteActionSlot", label: "Clear step", triggerId: selectedTrigger.id, slot: selectedSlot })}>
        <X size={12} />
      </button>
      <button
        type="button"
        className={`btn btn-secondary btn-xs${targetDrawerOpen && directTargetDrawerAvailable ? " active" : ""}`}
        title={directTargetDrawerAvailable ? targetDrawerOpen ? "Hide target details" : "Show target details" : "This action stores target fields in Settings."}
        disabled={!directTargetDrawerAvailable}
        onClick={() => directTargetDrawerAvailable && setTargetDrawerOpen(!targetDrawerOpen)}
      >
        Target
      </button>
      <button
        type="button"
        className={`btn btn-primary btn-xs script-apply-button${selectedDraftDirty ? " is-dirty" : ""}`}
        title={selectedDraftDirty ? "Apply this step to the script." : "This step is already applied."}
        disabled={!selectedDraftDirty}
        onClick={applySelectedSlot}
      >
        <Save size={12} /> Apply Step
      </button>
    </>
  ) : null;
  const stepDetailBody = selectedTrigger ? (
    <SelectedStepDetail
      project={project}
      catalog={catalog}
      selectedSlot={selectedSlot}
      selectedDraft={selectedDraft}
      selectedDraftDirty={selectedDraftDirty}
      selectedSlotApplied={Boolean(selectedAction) && !selectedDraftDirty}
      selectedOption={selectedOption}
      selectedDefinition={selectedDefinition}
      selectedEdcdUsage={selectedEdcdUsage}
      selectedEdcdRowId={selectedEdcdRowId}
      selectedSlotEntity={selectedSlotEntity}
      selectedSlotDiagnostics={selectedSlotDiagnostics}
      categoryFilter={categoryFilter}
      opcodeQuery={opcodeQuery}
      filteredDefinitions={filteredDefinitions}
      onSetCategoryFilter={setCategoryFilter}
      onSetOpcodeQuery={setOpcodeQuery}
      onSetSelectedDraft={setSelectedDraft}
      onSelectEntity={onSelectEntity}
      onOpenTool={onOpenTool}
      onApplyCommand={onApplyCommand}
    />
  ) : null;
  const targetEditorPanel = selectedTrigger && targetDrawerOpen && directTargetDrawerAvailable ? (
    <PanelSection title="Target Details" eyebrow="selected step" density="compact" className={`script-target-drawer${wideTargetRecord ? " wide-target" : ""}`} actions={<button type="button" className="btn btn-secondary btn-xs icon-only" title="Hide target details" onClick={() => setTargetDrawerOpen(false)}><X size={12} /></button>}>
      <TargetRecordEditor
        project={project}
        catalog={catalog}
        opcode={selectedDraft.rawCode}
        targetId={selectedDraft.id}
        onApplyCommand={onApplyCommand}
      />
    </PanelSection>
  ) : null;
  const usedStepCount = selectedTrigger?.actions.filter((action) => action.rawCode !== 0).length ?? 0;
  const firstEmptyStep = selectedTrigger ? Array.from({ length: 8 }, (_, slot) => slot).find((slot) => {
    const action = selectedTrigger.actions.find((candidate) => candidate.slot === slot);
    const current = slotDraft(slot, action);
    return current.rawCode === 0 && current.id === 0;
  }) : null;
  return (
    <section className="realmz-script-editor">
      <header>
        <div>
          <strong>{scriptPanelTitle(activeEditor)}</strong>
          <small>Build scenario behavior from clear steps, targets, choices, and reusable actions.</small>
        </div>
        <div className="script-toolbar">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "createMacro", label: "Create Reusable Action" })}>
            <Plus size={12} /> Reusable Action
          </button>
          {selectedTrigger && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}>
              <Copy size={12} /> Duplicate
            </button>
          )}
        </div>
      </header>
      {selectedMap && (
        <div className="script-create-strip">
          <label>
            <span>New Action Point</span>
            <select value={newActionPoint.mapId} onChange={(event) => setNewActionPoint({ ...newActionPoint, mapId: event.currentTarget.value })}>
              {projectMaps.map((map) => (
                <option key={map.id} value={map.id}>{map.name}</option>
              ))}
            </select>
          </label>
          <NumberField label="X" value={newActionPoint.x} onCommit={(x) => setNewActionPoint({ ...newActionPoint, x: clampRealmzCoordinate(x) })} compact />
          <NumberField label="Y" value={newActionPoint.y} onCommit={(y) => setNewActionPoint({ ...newActionPoint, y: clampRealmzCoordinate(y) })} compact />
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!selectedMapCapacity?.canCreate}
            title={selectedMapCapacity?.canCreate ? "Create an Action Point on the selected map, reusing the first empty slot when possible." : "This map has no reusable Action Point slots. Clear an existing Action Point to reuse its fixed Realmz record."}
            onClick={() => {
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
            }}
          >
            <Plus size={12} /> Action Point
          </button>
          <small className={selectedMapCapacity?.canCreate ? "script-capacity-note" : "script-capacity-note blocked"}>
            {selectedMapCapacity?.active ?? 0}/{selectedMapCapacity?.max ?? 100} active Action Point records
            {selectedMapCapacity?.reusable ? `, ${selectedMapCapacity.reusable} empty reusable slot(s)` : selectedMapCapacity?.canCreate ? ", next create will append a fixed record" : ". Clear selected Action Point to reuse this record."}
          </small>
        </div>
      )}
      <div className="realmz-script-layout">
        <div className="script-list-column">
          <div className="script-list-tools">
            <div className="script-list-summary">
              <strong>{filteredScripts.length.toLocaleString()} shown</strong>
              <small>{scripts.length.toLocaleString()} total</small>
            </div>
            <input
              className="script-list-filter"
              value={scriptQuery}
              onChange={(event) => setScriptQuery(event.currentTarget.value)}
              placeholder="Filter action points..."
            />
            <div className="script-list-scope script-filter-chips" role="group" aria-label="Script inventory filter">
              {SCRIPT_INVENTORY_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={inventoryFilter === filter.id ? "active" : ""}
                  disabled={filter.id === "current-map" && !canScopeToMap}
                  onClick={() => setInventoryFilter(filter.id)}
                >
                  <span>{filter.label}</span>
                  <b>{inventoryCounts.get(filter.id) == null ? "—" : inventoryCounts.get(filter.id)}</b>
                </button>
              ))}
            </div>
          </div>
          <ScrollArea className="realmz-script-list" aria-label="Action Points and reusable actions">
            {visibleScripts.map((trigger) => (
              <ScriptListItem
                key={trigger.id}
                project={project}
                trigger={trigger}
                selected={trigger.id === selectedTrigger?.id}
                buttonRef={trigger.id === selectedTrigger?.id ? selectedScriptButtonRef : undefined}
                issues={visibleDiagnosticsById.get(trigger.id) ?? []}
                onSelectEntity={onSelectEntity}
              />
            ))}
            {filteredScripts.length === 0 && (
              <div className="script-list-empty">
                No scripts match this view.
              </div>
            )}
            {filteredScripts.length > 240 && (
              <div className="script-list-empty">
                Showing the first 240 matches. Narrow the filter to jump further.
              </div>
            )}
          </ScrollArea>
          {ed3Evidence.length > 0 && (
            <CollapsibleSection className="ed3-evidence-strip" title="Imported Extra Action Points" eyebrow="advanced" count={ed3Evidence.length.toLocaleString()} density="compact" storageKey="scripts.ed3Evidence.open" defaultOpen={false}>
              <small>{ed3Evidence.length.toLocaleString()} imported advanced action row(s) are available for inspection.</small>
              <ScrollArea className="ed3-evidence-list" aria-label="Imported Extra Action Point rows">
                {ed3Evidence.slice(0, 80).map((trigger) => {
                  const classification = authorFacingExtraActionKind(extraActionPointClassification(project, trigger));
                  return (
                    <button key={trigger.id} type="button" onClick={() => onSelectEntity(selectEntityFromId(`macro:${trigger.recordIndex}`))}>
                      <strong>Extra Action Point {trigger.recordIndex}</strong>
                      <small>{classification} | {trigger.actions.length} slot(s)</small>
                    </button>
                  );
                })}
              </ScrollArea>
            </CollapsibleSection>
          )}
        </div>
        <div className="realmz-script-form">
          {selectedTrigger ? (
            <>
              <div className="script-record-header">
                <label className="script-name-field">
                  <span>Name</span>
                  <input
                    key={selectedTrigger.id}
                    defaultValue={scriptLabel(project, selectedTrigger)}
                    onBlur={(event) => {
                      const displayName = event.currentTarget.value.trim();
                      if (displayName && displayName !== scriptLabel(project, selectedTrigger)) {
                        onApplyCommand?.({ kind: "renameEditorEntity", label: "Rename script", entityId: selectedTrigger.id, displayName });
                      }
                    }}
                  />
                </label>
                <div className="script-record-actions">
                  <button className="btn btn-secondary btn-xs" type="button" onClick={() => onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}>
                    <Copy size={12} /> Duplicate
                  </button>
                  <button className="btn btn-danger btn-xs" type="button" title={isMacro ? "Delete this reusable action" : "Clear this Action Point record so it can be reused"} onClick={() => onApplyCommand?.({ kind: "deleteTrigger", label: isMacro ? deleteMacroLabel : "Clear Action Point", triggerId: selectedTrigger.id })}>
                    <Trash2 size={12} /> {isMacro ? deleteMacroLabel : "Clear Action Point"}
                  </button>
                </div>
              </div>
              <ScriptDiagnostics issues={triggerDiagnostics.filter((issue) => issue.slot == null)} />
              <div className="script-header-grid">
                <NumberField
                  label="% Chance"
                  value={selectedTrigger.percent}
                  onCommit={(percent) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action chance", triggerId: selectedTrigger.id, fields: { percent } })}
                />
                {!isMacro && (
                  <label>
                    <span>Map</span>
                    <select
                      value={moveMapKey}
                      onChange={(event) => {
                        const [levelType, levelIndex] = event.currentTarget.value.split(":");
                        moveSelectedActionPoint({ levelType: levelType as LevelType, levelIndex: Number(levelIndex) });
                      }}
                    >
                      {projectMaps.map((map) => (
                        <option key={map.id} value={`${map.levelType}:${map.index}`}>{map.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                {!isMacro && (
                  <NumberField
                    label="Cell X"
                    value={selectedTrigger.coordinate?.x ?? selectedTrigger.targetX ?? 0}
                    onCommit={(x) => moveSelectedActionPoint({ x })}
                  />
                )}
                {!isMacro && (
                  <NumberField
                    label="Cell Y"
                    value={selectedTrigger.coordinate?.y ?? selectedTrigger.targetY ?? 0}
                    onCommit={(y) => moveSelectedActionPoint({ y })}
                  />
                )}
                <NumberField
                  label="Goto Level"
                  value={selectedTrigger.landid ?? 0}
                  onCommit={(landid) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target level", triggerId: selectedTrigger.id, fields: { landid } })}
                />
                <NumberField
                  label="Goto X"
                  value={selectedTrigger.targetX ?? 0}
                  onCommit={(targetX) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target X", triggerId: selectedTrigger.id, fields: { targetX } })}
                />
                <NumberField
                  label="Goto Y"
                  value={selectedTrigger.targetY ?? 0}
                  onCommit={(targetY) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target Y", triggerId: selectedTrigger.id, fields: { targetY } })}
                />
              </div>
              <div className={`realmz-visual-script${floatingDetail ? " has-floating-detail" : ""}${targetEditorPanel ? "" : " no-target-drawer"}${wideTargetRecord && targetEditorPanel && !floatingDetail ? " has-wide-target" : ""}`}>
                <PanelSection
                  title="Steps"
                  eyebrow={`${usedStepCount} of 8 used`}
                  count="8 max"
                  density="compact"
                  actions={firstEmptyStep != null ? (
                    <button type="button" className="btn btn-primary btn-xs" onClick={() => setSelectedSlot(firstEmptyStep)}>
                      <Plus size={12} /> Add Step
                    </button>
                  ) : undefined}
                >
                  <ScrollArea className="realmz-step-list" aria-label="Script steps">
                    {Array.from({ length: 8 }, (_, slot) => {
                      const action = selectedTrigger.actions.find((candidate) => candidate.slot === slot);
                      const current = slotDraft(slot, action);
                      const option = actionOptionFor(current.rawCode);
                      const definition = scriptActionDefinitionFor(current.rawCode);
                      const slotEntity = actionSlots.find((entity) => Number(entity.summary.slot) === slot);
                      const changed = action ? current.rawCode !== action.rawCode || current.id !== action.id : current.rawCode !== 0 || current.id !== 0;
                      const slotIssues = issueCounts.get(slot) ?? { errors: 0, warnings: 0 };
                      const branchHint = scriptStepBranchHint(current.rawCode, current.id);
                      return (
                        <button
                          key={slot}
                          className={`realmz-step-card${slot === selectedSlot ? " selected" : ""}${changed ? " dirty" : ""}${slotIssues.errors ? " has-error" : slotIssues.warnings ? " has-warning" : ""}`}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          style={{ borderColor: categoryColor(option.category) }}
                        >
                          <span className="slot-index">{slot + 1}</span>
                          <span>
                            <strong>{definition.shortLabel}</strong>
                            <small>{scriptActionSummary(project, catalog, current, actionSummary(action, slotEntity))}</small>
                            {branchHint && <small className="script-step-branch-hint">{branchHint}</small>}
                          </span>
                          <b>
                            {option.edcdShape && <em>Settings</em>}
                            {slotIssues.errors + slotIssues.warnings > 0 && <em className={slotIssues.errors ? "danger" : "warning"}>{slotIssues.errors + slotIssues.warnings}</em>}
                            {definition.category}
                          </b>
                        </button>
                      );
                    })}
                  </ScrollArea>
                  <ScriptFlowPreview project={project} catalog={catalog} trigger={selectedTrigger} />
                </PanelSection>
                {!floatingDetail && (
                  <PanelSection title={`Step ${selectedSlot + 1} Details`} eyebrow={selectedDefinition.category} actions={stepDetailActions}>
                    {stepDetailBody}
                  </PanelSection>
                )}
                {!floatingDetail && targetEditorPanel}
              </div>
              {floatingDetail && (
                <FloatingWorkbenchPanel
                  title={`Step ${selectedSlot + 1} Details`}
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
                  {targetEditorPanel}
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
                onSelectEntity={onSelectEntity}
              />
            </>
          ) : (
            <p className="empty-copy compact">Create or select an Action Point to build its script steps.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function SourceEvidence({
  project,
  trigger,
  selectedSlot,
  selectedAction,
  selectedDraft,
  selectedOption,
  selectedSlotEntity,
  selectedEdcdRowId,
  onSelectEntity
}: {
  project: Project;
  trigger: TriggerRecord;
  selectedSlot: number;
  selectedAction?: Action;
  selectedDraft: { rawCode: number; id: number };
  selectedOption: ReturnType<typeof actionOptionFor>;
  selectedSlotEntity?: SemanticEntity;
  selectedEdcdRowId: number | null;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const triggerEntityIdValue = triggerSemanticSelectionId(trigger);
  const triggerLinks = linksFor(project, triggerEntityIdValue);
  const slotLinks = linksFor(project, selectedSlotEntity?.id ?? null);
  const linkCount = triggerLinks.outgoing.length + triggerLinks.incoming.length + slotLinks.outgoing.length + slotLinks.incoming.length;
  const edcdUsage = selectedSlotEntity?.summary.edcdUsage as { summary?: string; rowId?: number; shape?: string } | undefined;
  const count = [
    trigger.source,
    selectedSlotEntity?.id,
    selectedEdcdRowId != null ? `edcd:${selectedEdcdRowId}` : null,
    linkCount ? `links:${linkCount}` : null
  ].filter(Boolean).length;
  return (
    <CollapsibleSection title="Technical Details" eyebrow="advanced" count={String(count)} density="compact" storageKey="scripts.sourceEvidence.open" defaultOpen={false}>
      <div className="script-source-evidence">
        <div className="realmz-raw-preview">
          <FieldRow label="Script Source" value={trigger.source} />
          <FieldRow label="Script Entity" value={triggerEntityIdValue} />
          <FieldRow label="Record Index" value={trigger.recordIndex} />
          <FieldRow label="Door ID" value={trigger.doorid} />
          <FieldRow label="Map" value={trigger.levelType != null ? `${trigger.levelType} ${trigger.levelIndex ?? 0}` : "Reusable Action"} />
          <FieldRow label="Coordinate" value={trigger.coordinate ? `${trigger.coordinate.x}, ${trigger.coordinate.y}` : "none"} />
          <FieldRow label="Selected Slot" value={selectedSlot} />
          <FieldRow label="Slot Entity" value={selectedSlotEntity?.id ?? "draft-only"} />
          <FieldRow label="Applied CODE/ID" value={selectedAction ? `${selectedAction.rawCode} / ${selectedAction.id}` : "empty"} />
          <FieldRow label="Draft CODE/ID" value={`${selectedDraft.rawCode} / ${selectedDraft.id}`} />
          <FieldRow label="Opcode" value={selectedOption.label} />
          <FieldRow label="Dispatcher" value={isDispatcherNoopOpcode(selectedDraft.rawCode) ? "dispatcher no-op; Realmz ignores this CODE" : "has documented dispatcher behavior"} />
          <FieldRow label="Data EDCD Row" value={selectedEdcdRowId != null ? `row ${selectedEdcdRowId}${edcdUsage?.shape ? ` (${edcdUsage.shape})` : ""}` : "none"} />
          <FieldRow label="Edit State" value={selectedSlotEntity?.editState ?? "authored/draft"} />
        </div>
        {edcdUsage?.summary && <p className="field-help">{edcdUsage.summary}</p>}
        <EvidenceLinkGroup title="Script Links" project={project} links={[...triggerLinks.outgoing, ...triggerLinks.incoming]} onSelectEntity={onSelectEntity} />
        <EvidenceLinkGroup title="Slot Links" project={project} links={[...slotLinks.outgoing, ...slotLinks.incoming]} onSelectEntity={onSelectEntity} />
      </div>
    </CollapsibleSection>
  );
}

function EvidenceLinkGroup({
  title,
  project,
  links,
  onSelectEntity
}: {
  title: string;
  project: Project;
  links: ReturnType<typeof linksFor>["outgoing"];
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  if (links.length === 0) return null;
  return (
    <div className="script-source-link-group">
      <strong>{title}</strong>
      <div className="link-chip-row">
        {links.slice(0, 12).map((link) => (
          <button key={link.id} className="link-chip" type="button" onClick={() => onSelectEntity(selectEntityFromId(link.to))}>
            {link.kind}: {semanticLabel(project, link.to)}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScriptFlowPreview({
  project,
  catalog,
  trigger
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  trigger: TriggerRecord;
}) {
  const flowSteps = trigger.actions
    .filter((action) => action.rawCode !== 0)
    .sort((a, b) => a.slot - b.slot)
    .map((action) => ({
      action,
      definition: scriptActionDefinitionFor(action.rawCode),
      hint: scriptStepBranchHint(action.rawCode, action.id),
      summary: scriptActionSummary(project, catalog, { rawCode: action.rawCode, id: action.id })
    }))
    .filter((step) => step.hint || step.definition.category === "Reusable Actions" || step.definition.category === "Choices" || step.definition.category === "Logic");
  if (flowSteps.length === 0) return null;
  return (
    <div className="script-flow-preview" aria-label="Branch and reusable action preview">
      <strong>Flow Preview</strong>
      {flowSteps.slice(0, 5).map(({ action, definition, hint, summary }) => (
        <div key={`${action.slot}-${action.rawCode}-${action.id}`}>
          <span>{action.slot + 1}</span>
          <p>
            <b>{definition.shortLabel}</b>
            <small>{hint || summary}</small>
          </p>
        </div>
      ))}
      {flowSteps.length > 5 && <small>{flowSteps.length - 5} more routed step(s)</small>}
    </div>
  );
}

function SelectedStepDetail({
  project,
  catalog,
  selectedSlot,
  selectedDraft,
  selectedDraftDirty,
  selectedSlotApplied,
  selectedOption,
  selectedDefinition,
  selectedEdcdUsage,
  selectedEdcdRowId,
  selectedSlotEntity,
  selectedSlotDiagnostics,
  categoryFilter,
  opcodeQuery,
  filteredDefinitions,
  onSetCategoryFilter,
  onSetOpcodeQuery,
  onSetSelectedDraft,
  onSelectEntity,
  onOpenTool,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedSlot: number;
  selectedDraft: { rawCode: number; id: number };
  selectedDraftDirty: boolean;
  selectedSlotApplied: boolean;
  selectedOption: ReturnType<typeof actionOptionFor>;
  selectedDefinition: ScriptActionDefinition;
  selectedEdcdUsage?: {
    rowId?: number;
    shape?: string;
    fields?: { name?: string; value?: number }[];
    secondaryRowId?: number;
    secondaryShape?: string;
    secondaryFields?: { name?: string; value?: number }[];
    diagnostics?: string[];
    summary?: string;
  };
  selectedEdcdRowId: number | null;
  selectedSlotEntity?: SemanticEntity;
  selectedSlotDiagnostics: ScriptDiagnostic[];
  categoryFilter: ScriptActionCategory;
  opcodeQuery: string;
  filteredDefinitions: ScriptActionDefinition[];
  onSetCategoryFilter: (category: ScriptActionCategory) => void;
  onSetOpcodeQuery: (query: string) => void;
  onSetSelectedDraft: (values: { rawCode: number; id: number }) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const selectedCrosswalk = crosswalkForOpcode(selectedDraft.rawCode);
  const selectedDivinityHelp = divinityHelpForOpcode(selectedDraft.rawCode);
  const selectedIdLabel = opcodeIdMeaning(selectedDraft.rawCode);
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
    const lookupId = selectedDefinition.target.targetFamily === "message" ? Math.abs(selectedDraft.id) : selectedDraft.id;
    return targetOptionsForOpcode(project, selectedDraft.rawCode, catalog).find((option) => option.value === lookupId) ?? null;
  }, [catalog, project, selectedDefinition.target, selectedDraft.id, selectedDraft.rawCode]);
  const actionHelp = selectedDivinityHelp ? (
    <div className="realmz-action-help-card">
      <header>
        <strong>Action Help</strong>
        <span>{selectedDefinition.categoryLabel}</span>
      </header>
      <p>{selectedDivinityHelp.use || selectedDefinition.description}</p>
      <div className="realmz-action-help-facts">
        <FieldRow label={selectedDefinition.target?.label ?? "Target"} value={(selectedDefinition.target?.help || selectedCrosswalk?.idHelp || selectedCrosswalk?.idMeaning || selectedDivinityHelp.idField || "No target required")} />
        {visibleParameters.length > 0 && (
          <FieldRow
            label="Settings"
            value={visibleParameters.map((parameter) => `${parameter.index + 1}. ${parameter.label}`).join("; ")}
          />
        )}
      </div>
      {(selectedDivinityHelp.options || selectedDivinityHelp.extraCodes) && (
        <details className="realmz-original-help">
          <summary>Original Divinity Text</summary>
          {selectedDivinityHelp.options && selectedDivinityHelp.options.toLowerCase() !== "none" && (
            <FieldRow label="Options" value={selectedDivinityHelp.options} />
          )}
          {selectedDivinityHelp.extraCodes && selectedDivinityHelp.extraCodes.toLowerCase() !== "none" && (
            <FieldRow label="E-Codes" value={selectedDivinityHelp.extraCodes} />
          )}
        </details>
      )}
    </div>
  ) : null;
  return (
    <div className="realmz-step-detail selected-step-detail">
      {selectedDraftDirty && (
        <div className="script-draft-warning" role="status">
          <strong>Step changes ready</strong>
          <span>Apply this step to update the script.</span>
        </div>
      )}
      <ScriptDiagnostics issues={selectedSlotDiagnostics} />
      <div className="realmz-current-opcode" style={{ borderColor: categoryColor(selectedOption.category) }}>
        <div>
          <strong>{selectedDefinition.label}</strong>
          <span>{selectedDefinition.categoryLabel}</span>
        </div>
        <p>{selectedDefinition.summary}</p>
        {selectedTargetPreview && (
          <div className="realmz-selected-target-preview">
            <span>{selectedDefinition.target?.label ?? "Target"}</span>
            <strong>{selectedTargetPreview.label}</strong>
            <p>{selectedTargetPreview.detail}</p>
            {selectedTargetPreview.summary && <small>{selectedTargetPreview.summary}</small>}
          </div>
        )}
      </div>
      <div className="realmz-step-form-grid">
        <label className="script-required-field realmz-step-action-field">
          <span>Action</span>
          <select
            value={selectedDraft.rawCode}
            onChange={(event) => onSetSelectedDraft({ ...selectedDraft, rawCode: Number(event.currentTarget.value) })}
          >
            {SCRIPT_ACTION_DEFINITIONS.map((definition) => (
              <option key={definition.opcode} value={definition.opcode}>{definition.label}</option>
            ))}
          </select>
        </label>
        <label className="script-required-field realmz-step-id-field">
          <span>{selectedDefinition.target?.label ?? selectedIdLabel}</span>
          <input
            type="number"
            value={selectedDraft.id}
            onChange={(event) => onSetSelectedDraft({ ...selectedDraft, id: Number(event.currentTarget.value) })}
            aria-label={`Slot ${selectedSlot} ${selectedIdLabel}`}
          />
          {selectedOption.edcdShape && (
            <small>
              {selectedDefinition.target?.help || "Stores this step's settings."}
            </small>
          )}
        </label>
      </div>
      {actionHelp}
      <TargetPicker
        project={project}
        catalog={catalog}
        opcode={selectedDraft.rawCode}
        value={selectedDraft.id}
        onChange={(id) => onSetSelectedDraft({ ...selectedDraft, id })}
        onInspect={onSelectEntity}
        onCreate={(recordType, id) => {
          const targetId = id ?? nextAuthorableTargetId(project, recordType);
          onApplyCommand?.({ kind: "createTargetRecord", label: `Create ${recordType}`, recordType, id: targetId });
          onSetSelectedDraft({ ...selectedDraft, id: targetId });
        }}
      />
      <CollapsibleSection title="Add Or Change Step" eyebrow="action palette" count={filteredDefinitions.length} density="compact" storageKey="scripts.actionPalette.open" defaultOpen={selectedDraft.rawCode === 0}>
        <div className="realmz-opcode-catalog">
          <div className="realmz-step-category-bar">
            {SCRIPT_ACTION_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                className={categoryFilter === category ? "active" : ""}
                onClick={() => onSetCategoryFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
          <input
            className="realmz-opcode-search"
            value={opcodeQuery}
            onChange={(event) => onSetOpcodeQuery(event.currentTarget.value)}
            placeholder="Search actions, targets, and settings..."
            aria-label="Search script actions"
          />
          <div className="realmz-step-picker-grid">
            {filteredDefinitions.map((definition) => (
              <button
                key={definition.opcode}
                type="button"
                className={selectedDraft.rawCode === definition.opcode ? "selected" : ""}
                onClick={() => onSetSelectedDraft({ rawCode: definition.defaultDraft.rawCode, id: definition.defaultDraft.id })}
              >
                <strong>{definition.shortLabel}</strong>
                <span>{definition.summary}</span>
                {definition.target && <small>{definition.target.label}</small>}
              </button>
            ))}
          </div>
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="Settings" eyebrow={selectedOption.edcdShape ? "action settings" : "optional"} density="compact" storageKey="scripts.edcdEditor.open" defaultOpen={Boolean(selectedOption.edcdShape || selectedEdcdUsage)}>
        <EdcdRowEditor
          project={project}
          catalog={catalog}
          edcdUsage={selectedEdcdUsage}
          fallbackRowId={selectedDraft.id}
          fallbackShape={selectedOption.edcdShape}
          fallbackFieldNames={edcdFieldNamesForShape(selectedOption.edcdShape)}
          fallbackOpcode={selectedDraft.rawCode}
          parameterLabels={selectedParameterLabels}
          selectedSlotLabel={`step ${selectedSlot + 1}`}
          onSelectEntity={onSelectEntity}
          onOpenText={(editor) => onOpenTool?.("text", editor)}
          onApplyCommand={onApplyCommand}
        />
      </CollapsibleSection>
      {selectedSlotApplied ? null : (
        <EmptyState compact title="Step not applied yet" body="Apply this step to update the script." />
      )}
    </div>
  );
}

export function TargetRecordEditor({
  project,
  catalog,
  opcode,
  targetId,
  recordType,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  opcode: number;
  targetId: number;
  recordType?: RealmzTargetRecordKind;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const descriptor = realmzScriptStepDescriptorFor(opcode);
  const targetType = recordType ?? descriptor.targetType;
  if (!targetType || !Number.isInteger(targetId) || targetId < 0) {
    if (descriptor.edcdShape) {
      return (
        <EmptyState
          compact
          title="Target is stored in Settings"
          body="This action keeps its message, battle, shop, item, or branch fields in the Settings section."
        />
      );
    }
    return <EmptyState compact title="No editable target" body="Choose an action with a target to edit message, battle, treasure, shop, or encounter details here." />;
  }
  if (targetId === 0 && !targetRecordExists(project, targetType, targetId)) {
    return <EmptyState compact title="No target selected" body="Choose an existing target or create a new one from the picker." />;
  }
  const badge = descriptor.compatibility ?? "realmz-writable";
  const targetIssues = validateRealmzTargetRecord(project, targetType, targetId, catalog);
  if (targetType === "message") {
    const record = project.messages?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Message ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create message", recordType: "message", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear message", recordType: "message", id: targetId })}
      >
        {record && (
          <label className="script-target-wide-field">
            <span>Text</span>
            <textarea
              defaultValue={record.text}
              maxLength={255}
              onBlur={(event) => onApplyCommand?.({ kind: "updateMessageRecord", label: "Update message", id: targetId, changes: { text: event.currentTarget.value } })}
            />
            <small>{record.text.length}/255 bytes before Classic encoding</small>
          </label>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Battle ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle", recordType: "battle", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear battle", recordType: "battle", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <NumberField label="Distance" value={record.dist} onCommit={(dist) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle distance", id: targetId, changes: { dist } })} />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="Before Msg"
              emptyLabel="No before message"
              opcode={1}
              value={record.messageBefore}
              createRecordType="message"
              onCommit={(messageBefore) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle message", id: targetId, changes: { messageBefore } })}
              onCreateTarget={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle message", recordType: "message", id })}
            />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="After Msg"
              emptyLabel="No after message"
              opcode={1}
              value={record.messageAfter}
              createRecordType="message"
              onCommit={(messageAfter) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle message", id: targetId, changes: { messageAfter } })}
              onCreateTarget={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle message", recordType: "message", id })}
            />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="Battle Action"
              emptyLabel="No battle action"
              opcode={39}
              value={record.battleMacro}
              onCommit={(battleMacro) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle action", id: targetId, changes: { battleMacro } })}
            />
            <BattleGridEditor
              project={project}
              catalog={catalog}
              grid={record.grid}
              onCommit={(index, value) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle grid", id: targetId, changes: { grid: updateArraySlot(record.grid, index, value, 13 * 13) } })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "monster") {
    const record = project.monsters?.find((candidate) => candidate.id === targetId);
    const update = (changes: Partial<NonNullable<Project["monsters"]>[number]>) => onApplyCommand?.({ kind: "updateMonsterRecord", label: "Update monster", id: targetId, changes });
    return (
      <InlineTargetShell
        title={`Monster ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create monster", recordType: "monster", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear monster", recordType: "monster", id: targetId })}
      >
        {record && (
          <div className="monster-editor-shell">
            <section className="monster-editor-section">
              <header>
                <strong>Identity</strong>
                <small>Name, bestiary visibility, icon, and defeat action.</small>
              </header>
              <div className="monster-editor-grid">
                <label className="script-target-wide-field monster-name-field">
                  <span>Monster Name</span>
                  <input
                    defaultValue={record.displayName}
                    maxLength={40}
                    onBlur={(event) => update({ displayName: event.currentTarget.value })}
                  />
                  <small>{record.displayName.length}/40 characters</small>
                </label>
                <NumberField label="Monster Name ID" value={record.nameId} onCommit={(nameId) => update({ nameId })} compact />
                <NumberField label="Icon" value={record.iconId} onCommit={(iconId) => update({ iconId })} compact />
                <label className="script-target-checkbox">
                  <span>Hide From Bestiary</span>
                  <input type="checkbox" checked={record.notOnMenu} onChange={(event) => update({ notOnMenu: event.currentTarget.checked })} />
                </label>
                <ReferenceIdField
                  project={project}
                  catalog={catalog}
                  label="Defeat Action"
                  emptyLabel="No defeat action"
                  opcode={39}
                  value={record.deathMacro}
                  onCommit={(deathMacro) => update({ deathMacro })}
                />
              </div>
            </section>

            <section className="monster-editor-section">
              <header>
                <strong>Combat Stats</strong>
                <small>Divinity's stamina level, movement, armor, resistance, and victory reward fields.</small>
              </header>
              <div className="monster-editor-grid">
                <NumberField label="Stamina Level" value={record.hitDice} onCommit={(hitDice) => update({ hitDice })} compact />
                <NumberField label="Bonus Stamina" value={record.staminaBonus} onCommit={(staminaBonus) => update({ staminaBonus })} compact />
                <NumberField label="Agility" value={record.agility} onCommit={(agility) => update({ agility })} compact />
                <NumberField label="Move Max" value={record.movementMax} onCommit={(movementMax) => update({ movementMax })} compact />
                <NumberField label="Armor Rating" value={record.armor} onCommit={(armor) => update({ armor })} compact />
                <NumberField label="Magic Resist %" value={record.magicResistance} onCommit={(magicResistance) => update({ magicResistance })} compact />
                <NumberField label="Magic + Req To Hit" value={record.magicToHit} onCommit={(magicToHit) => update({ magicToHit })} compact />
                <NumberField label="Extra Victory Points" value={record.exp} onCommit={(exp) => update({ exp })} compact />
                <NumberField label="Spell Points" value={record.spellPoints} onCommit={(spellPoints) => update({ spellPoints })} compact />
                <NumberField label="Max Spell Points" value={record.maxSpellPoints} onCommit={(maxSpellPoints) => update({ maxSpellPoints })} compact />
              </div>
            </section>

            <section className="monster-editor-section">
              <header>
                <strong>Battle Behavior</strong>
                <small>Team side, size, attacks, spellcasting, missile use, and retreat logic.</small>
              </header>
              <div className="monster-editor-grid">
                <NumberField label="Traitor / Side" value={record.traitor} onCommit={(traitor) => update({ traitor })} compact />
                <NumberField label="Size" value={record.size} onCommit={(size) => update({ size })} compact />
                <NumberField label="Distance" value={record.distance} onCommit={(distance) => update({ distance })} compact />
                <NumberField label="No. Of Attacks" value={record.attackCount} onCommit={(attackCount) => update({ attackCount })} compact />
                <NumberField label="Magical Attacks" value={record.magicAttackCount} onCommit={(magicAttackCount) => update({ magicAttackCount })} compact />
                <NumberField label="Damage Plus" value={record.damageBonus} onCommit={(damageBonus) => update({ damageBonus })} compact />
                <NumberField label="Cast Spell %" value={record.castPercent} onCommit={(castPercent) => update({ castPercent })} compact />
                <NumberField label="Run Away %" value={record.runPercent} onCommit={(runPercent) => update({ runPercent })} compact />
                <NumberField label="Surrender %" value={record.surrenderPercent} onCommit={(surrenderPercent) => update({ surrenderPercent })} compact />
                <NumberField label="Use Missile %" value={record.missilePercent} onCommit={(missilePercent) => update({ missilePercent })} compact />
                <NumberField label="Summon Eligible" value={record.canSummon} onCommit={(canSummon) => update({ canSummon })} compact />
                <ItemIdField project={project} catalog={catalog} label="Weapon Used" value={record.weapon} onCommit={(weapon) => update({ weapon })} compact />
              </div>
            </section>

            <section className="monster-editor-section">
              <header>
                <strong>Physical Traits</strong>
                <small>Used by race/caste bonuses, turning, targeting, and special attack logic.</small>
              </header>
              <div className="monster-trait-grid">
                {MONSTER_TRAIT_LABELS.map((label, slot) => (
                  <label key={label} className="script-target-checkbox">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(record.typeFlags?.[slot])}
                      onChange={(event) => update({ typeFlags: updateArraySlot(record.typeFlags ?? [], slot, event.currentTarget.checked ? 1 : 0, 8) })}
                    />
                  </label>
                ))}
              </div>
            </section>

            <CollapsibleSection title="Attack Rows" eyebrow="combat" count="5 rows" density="compact" className="monster-editor-wide-section" defaultOpen>
              <div className="monster-attack-grid">
                {Array.from({ length: 5 }, (_, row) => {
                  const values = record.attacks?.[row] ?? [0, 0, 0, 0];
                  return (
                    <div key={row} className="encounter-action-row monster-attack-row">
                      <strong>Attack {row + 1}</strong>
                      {["Damage Low", "Damage High", "Form", "Special"].map((label, slot) => (
                        <NumberField
                          key={label}
                          label={label}
                          value={values[slot] ?? 0}
                          onCommit={(value) => {
                            const attacks = [...(record.attacks ?? [])];
                            while (attacks.length < 5) attacks.push([0, 0, 0, 0]);
                            attacks[row] = updateArraySlot(attacks[row] ?? [], slot, value, 4);
                            update({ attacks });
                          }}
                          compact
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Spells" eyebrow="10 slots" count={`${record.spells.filter(Boolean).length} filled`} density="compact" className="monster-editor-wide-section" defaultOpen>
              <div className="monster-compact-field-grid">
                {Array.from({ length: 10 }, (_, slot) => (
                  <NumberField
                    key={slot}
                    label={`Spell ${slot + 1}`}
                    value={record.spells[slot] ?? 0}
                    onCommit={(value) => update({ spells: updateArraySlot(record.spells ?? [], slot, value, 10) })}
                    compact
                  />
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Items And Treasure" eyebrow="loot" count={`${record.items.filter(Boolean).length} item(s)`} density="compact" className="monster-editor-wide-section" defaultOpen>
              <div className="monster-editor-grid">
                {MONSTER_MONEY_LABELS.map((label, slot) => (
                  <NumberField
                    key={label}
                    label={label}
                    value={record.money[slot] ?? 0}
                    onCommit={(value) => update({ money: updateArraySlot(record.money ?? [], slot, value, 3) })}
                    compact
                  />
                ))}
              </div>
              <div className="monster-item-grid">
                {Array.from({ length: 6 }, (_, slot) => (
                  <ItemIdField
                    key={slot}
                    project={project}
                    catalog={catalog}
                    label={`Item ${slot + 1}`}
                    value={record.items[slot] ?? 0}
                    onCommit={(value) => update({ items: updateArraySlot(record.items ?? [], slot, value, 6) })}
                    compact
                  />
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Saves And Immunities" eyebrow="spells" count="6 classes" density="compact" className="monster-editor-wide-section">
              <div className="monster-save-grid">
                {Array.from({ length: 6 }, (_, slot) => {
                  const label = RESISTANCE_TYPES[slot] ?? `Class ${slot}`;
                  return (
                    <div key={label} className="monster-save-row">
                      <NumberField
                        label={`${label} DRVs`}
                        value={record.saves[slot] ?? 0}
                        onCommit={(value) => update({ saves: updateArraySlot(record.saves ?? [], slot, value, 6) })}
                        compact
                      />
                      <label className="script-target-checkbox">
                        <span>Immune</span>
                        <input
                          type="checkbox"
                          checked={Boolean(record.spellImmunities?.[slot])}
                          onChange={(event) => update({ spellImmunities: updateArraySlot(record.spellImmunities ?? [], slot, event.currentTarget.checked ? 1 : 0, 6) })}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Conditions" eyebrow="40 fields" count={`${record.conditions.filter(Boolean).length} set`} density="compact" className="monster-editor-wide-section">
              <div className="monster-condition-grid">
                {CONDITION_LABELS.map((label, slot) => (
                  <NumberField
                    key={label}
                    label={label}
                    value={record.conditions[slot] ?? 0}
                    onCommit={(value) => update({ conditions: updateArraySlot(record.conditions ?? [], slot, value, 40) })}
                    compact
                  />
                ))}
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Advanced Combat Defaults" eyebrow="runtime fields" count="template" density="compact" className="monster-editor-wide-section">
              <div className="monster-editor-grid">
                <NumberField label="Template Stamina" value={record.stamina} onCommit={(stamina) => update({ stamina })} compact />
                <NumberField label="Template Max Stamina" value={record.staminaMax} onCommit={(staminaMax) => update({ staminaMax })} compact />
                <NumberField label="Target" value={record.target} onCommit={(target) => update({ target })} compact />
                <NumberField label="Guarding" value={record.guarding} onCommit={(guarding) => update({ guarding })} compact />
                <NumberField label="Been Attacked" value={record.beenAttacked} onCommit={(beenAttacked) => update({ beenAttacked })} compact />
                <NumberField label="Movement" value={record.movement} onCommit={(movement) => update({ movement })} compact />
                <NumberField label="Left / Right" value={record.lr} onCommit={(lr) => update({ lr })} compact />
                <NumberField label="Up / Down" value={record.up} onCommit={(up) => update({ up })} compact />
                <NumberField label="Attack Number" value={record.attackNum} onCommit={(attackNum) => update({ attackNum })} compact />
                <NumberField label="Bonus Attack" value={record.bonusAttack} onCommit={(bonusAttack) => update({ bonusAttack })} compact />
              </div>
            </CollapsibleSection>
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "treasure") {
    const record = project.treasures?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Treasure ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create treasure", recordType: "treasure", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear treasure", recordType: "treasure", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <TreasureRewardField label="Victory Points" value={record.exp} onCommit={(exp) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure victory points", id: targetId, changes: { exp } })} />
            <TreasureRewardField label="Gold" value={record.gold} onCommit={(gold) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure gold", id: targetId, changes: { gold } })} />
            <TreasureRewardField label="Gems" value={record.gems} onCommit={(gems) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure gems", id: targetId, changes: { gems } })} />
            <TreasureRewardField label="Jewelry" value={record.jewelry} onCommit={(jewelry) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure jewelry", id: targetId, changes: { jewelry } })} />
            <TreasureCatalogAdder
              project={project}
              catalog={catalog}
              itemIds={record.itemIds}
              onAddItem={(itemId) => {
                const slot = firstOpenTreasureSlot(record.itemIds);
                if (slot >= 0) onApplyCommand?.({ kind: "updateTreasureRecord", label: "Add treasure item", id: targetId, changes: { itemIds: updateArraySlot(record.itemIds, slot, itemId, 20) } });
              }}
            />
            <TreasureItemGrid
              project={project}
              catalog={catalog}
              itemIds={record.itemIds}
              onCommit={(index, value) => onApplyCommand?.({ kind: "updateTreasureRecord", label: "Update treasure item", id: targetId, changes: { itemIds: updateArraySlot(record.itemIds, index, value, 20) } })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "shop") {
    const record = project.shops?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Shop ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create shop", recordType: "shop", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear shop", recordType: "shop", id: targetId })}
      >
        {record && (
          <div className="script-target-grid">
            <NumberField label="Inflation" value={record.inflation} onCommit={(inflation) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop inflation", id: targetId, changes: { inflation } })} />
            <div className="script-shop-source-note">
              <strong>Scenario shop stock</strong>
              <span>These values define what Realmz copies into a new game. Parties already inside a saved game keep their current shop inventory.</span>
              <button
                type="button"
                className="btn btn-danger btn-xs"
                onClick={() => onApplyCommand?.({
                  kind: "updateShopRecord",
                  label: "Clear shop stock",
                  id: targetId,
                  changes: { itemIds: new Array(1000).fill(0), quantities: new Array(1000).fill(0) }
                })}
              >
                Clear Shop Stock
              </button>
            </div>
            <ShopStockEditor
              project={project}
              catalog={catalog}
              itemIds={record.itemIds}
              quantities={record.quantities}
              onCommitItem={(index, value) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop item", id: targetId, changes: { itemIds: updateArraySlot(record.itemIds, index, value, 1000) } })}
              onCommitQuantity={(index, value) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop quantity", id: targetId, changes: { quantities: updateArraySlot(record.quantities, index, value, 1000) } })}
              onReplaceStock={(itemIds, quantities) => onApplyCommand?.({ kind: "updateShopRecord", label: "Update shop stock", id: targetId, changes: { itemIds, quantities } })}
              onClearSlot={(index) => onApplyCommand?.({
                kind: "updateShopRecord",
                label: "Clear shop stock slot",
                id: targetId,
                changes: {
                  itemIds: updateArraySlot(record.itemIds, index, 0, 1000),
                  quantities: updateArraySlot(record.quantities, index, 0, 1000)
                }
              })}
            />
          </div>
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "simpleEncounter") {
    const record = project.simpleEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Simple Encounter ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create simple encounter", recordType: "simpleEncounter", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear simple encounter", recordType: "simpleEncounter", id: targetId })}
      >
        {record && (
          <EncounterShell
            project={project}
            recordKind="simple"
            id={targetId}
            texts={record.texts}
            prompt={record.prompt}
            canBackOut={record.canBackOut}
            maxTimes={record.maxTimes}
            casteSuccess={record.casteSuccess}
            choiceResults={record.choiceResults}
            actions={record.actions}
            catalog={catalog}
            onApplyCommand={onApplyCommand}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "complexEncounter") {
    const record = project.complexEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Complex Encounter ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create complex encounter", recordType: "complexEncounter", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear complex encounter", recordType: "complexEncounter", id: targetId })}
      >
        {record && (
          <EncounterShell
            project={project}
            recordKind="complex"
            id={targetId}
            texts={record.texts}
            prompt={record.prompt}
            canBackOut={record.canBackOut}
            maxTimes={record.maxTimes}
            casteSuccess={record.casteSuccess}
            choiceResults={record.choiceResults}
            wordResults={record.wordResults}
            thief={record.thief}
            thiefSuccess={record.thiefSuccess}
            thiefFail={record.thiefFail}
            actions={record.actions}
            catalog={catalog}
            onApplyCommand={onApplyCommand}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "timedEncounter") {
    const record = project.timedEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Time Encounter ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create time encounter", recordType: "timedEncounter", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear time encounter", recordType: "timedEncounter", id: targetId })}
      >
        {record && (
          <TimedEncounterShell
            project={project}
            catalog={catalog}
            id={targetId}
            record={record}
            onApplyCommand={onApplyCommand}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "thiefEncounter") {
    const record = project.thiefEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Rogue Encounter ${targetId}`}
        badge={badge}
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue encounter", recordType: "thiefEncounter", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear rogue encounter", recordType: "thiefEncounter", id: targetId })}
      >
        {record && (
          <ThiefEncounterShell
            project={project}
            catalog={catalog}
            id={targetId}
            record={record}
            onApplyCommand={onApplyCommand}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (targetType === "questLabel") {
    const record = project.questLabels?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Quest ${targetId}`}
        badge="metadata"
        exists={Boolean(record)}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Create quest label", quest: { id: targetId, label: `Quest ${targetId}` } })}
        onClear={() => onApplyCommand?.({ kind: "deleteQuestLabel", label: "Clear quest label", id: targetId })}
      >
        {record && (
          <label className="script-target-wide-field">
            <span>Label</span>
            <input defaultValue={record.label} onBlur={(event) => onApplyCommand?.({ kind: "upsertQuestLabel", label: "Update quest label", quest: { ...record, label: event.currentTarget.value } })} />
          </label>
        )}
      </InlineTargetShell>
    );
  }
  return null;
}

function InlineTargetShell({
  title,
  badge,
  exists,
  onCreate,
  onClear,
  issues,
  children
}: {
  title: string;
  badge: string;
  exists: boolean;
  onCreate: () => void;
  onClear?: () => void;
  issues?: ScriptDiagnostic[];
  children: ReactNode;
}) {
  return (
    <div className="script-inline-target-editor">
      <header>
        <strong>{title}</strong>
        <span>{exists ? badge : "missing-target"}</span>
        <div className="script-inline-target-actions">
          {!exists && <button type="button" className="btn btn-secondary btn-xs" onClick={onCreate}>Create {title}</button>}
          {exists && onClear && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              title="Replace this fixed Realmz record with an empty reusable default record."
              onClick={onClear}
            >
              Clear to Defaults
            </button>
          )}
        </div>
      </header>
      {exists && issues && issues.length > 0 && <ScriptDiagnostics issues={issues} />}
      {exists ? children : <small>This slot points at a target record that does not exist yet.</small>}
    </div>
  );
}

function EncounterShell({
  project,
  recordKind,
  id,
  texts,
  prompt,
  canBackOut,
  maxTimes,
  casteSuccess,
  choiceResults,
  wordResults,
  thief,
  thiefSuccess,
  thiefFail,
  actions,
  catalog,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordKind: "simple" | "complex";
  id: number;
  texts: string[];
  prompt: number;
  canBackOut: boolean;
  maxTimes: number;
  casteSuccess: number;
  choiceResults: number[];
  wordResults?: number[];
  thief?: boolean;
  thiefSuccess?: number;
  thiefFail?: number;
  actions: EncounterActionRow[];
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const visibleRows = [0, 1, 2, 3];
  const update = (changes: Record<string, unknown>) => {
    if (recordKind === "simple") {
      onApplyCommand?.({ kind: "updateSimpleEncounterRecord", label: "Update simple encounter", id, changes });
    } else {
      onApplyCommand?.({ kind: "updateComplexEncounterRecord", label: "Update complex encounter", id, changes });
    }
  };
  return (
    <div className="script-target-grid">
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Prompt Msg"
        emptyLabel="No prompt message"
        opcode={1}
        value={prompt}
        createRecordType="message"
        onCommit={(next) => update({ prompt: next })}
        onCreateTarget={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter prompt", recordType: "message", id: targetId })}
      />
      <label className="script-target-checkbox">
        <span>Can Back Out</span>
        <input type="checkbox" defaultChecked={canBackOut} onChange={(event) => update({ canBackOut: event.currentTarget.checked })} />
      </label>
      <NumberField label="Max Times" value={maxTimes} onCommit={(value) => update({ maxTimes: value })} />
      <NumberField label="Caste Success" value={casteSuccess} onCommit={(value) => update({ casteSuccess: value })} />
      {recordKind === "complex" && (
        <>
          <label className="script-target-checkbox">
            <span>Thief</span>
            <input type="checkbox" defaultChecked={Boolean(thief)} onChange={(event) => update({ thief: event.currentTarget.checked })} />
          </label>
          <NumberField label="Thief Success" value={thiefSuccess ?? 0} onCommit={(value) => update({ thiefSuccess: value })} />
          <NumberField label="Thief Fail" value={thiefFail ?? 0} onCommit={(value) => update({ thiefFail: value })} />
        </>
      )}
      <div className="script-encounter-outcome-grid">
        <strong>Choice Results</strong>
        {visibleRows.map((slot) => (
          <NumberField key={slot} label={`Choice ${slot}`} value={choiceResults[slot] ?? 0} onCommit={(value) => update({ choiceResults: updateArraySlot(choiceResults, slot, value, 4) })} />
        ))}
      </div>
      {recordKind === "complex" && wordResults && (
        <div className="script-encounter-outcome-grid">
          <strong>Word Results</strong>
          {visibleRows.map((slot) => (
            <NumberField key={slot} label={`Word ${slot}`} value={wordResults[slot] ?? 0} onCommit={(value) => update({ wordResults: updateArraySlot(wordResults, slot, value, 4) })} />
          ))}
        </div>
      )}
      <div className="script-encounter-action-grid">
        {visibleRows.map((slot) => (
          <EncounterActionRowEditor
            key={slot}
            project={project}
            catalog={catalog}
            slot={slot}
            row={encounterActionAt(actions, slot)}
            onUpdate={(changes) => update({ actions: updateEncounterActionRow(actions, slot, changes) })}
            onCreateTarget={(recordType, targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter action target", recordType, id: targetId })}
          />
        ))}
      </div>
      <EncounterTextGrid
        recordKind={recordKind}
        texts={texts}
        onCommit={(slot, text) => update({ texts: updateArraySlot(texts, slot, text, recordKind === "simple" ? 4 : 9) })}
      />
    </div>
  );
}

const ROGUE_ACTION_LABELS = [
  "Rogue Check 0",
  "Detect Trap",
  "Disarm Trap",
  "Acrobatic Act",
  "Force Lock",
  "Pick Lock",
  "Open Lock Magic",
  "Disarm Trap Magic"
];

function ThiefEncounterShell({
  project,
  catalog,
  id,
  record,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  id: number;
  record: Project["thiefEncounters"][number];
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateThiefEncounterRecord" }>["changes"]) => {
    onApplyCommand?.({ kind: "updateThiefEncounterRecord", label: "Update rogue encounter", id, changes });
  };
  return (
    <div className="script-target-grid thief-encounter-editor">
      <div className="script-shop-source-note">
        <strong>Rogue action setup</strong>
        <span>Complex encounters can call this record when the player chooses a rogue action. Detecting a trap can reveal Disarm Trap; failed actions can spring the trap.</span>
      </div>
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Prompt String"
        emptyLabel="No prompt string"
        opcode={1}
        value={record.prompts?.[0] ?? 0}
        createRecordType="message"
        onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 0, value, 3) })}
        onCreateTarget={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue prompt", recordType: "message", id: targetId })}
      />
      <NumberField label="Prompt Sound" value={record.promptSounds?.[0] ?? 0} onCommit={(value) => update({ promptSounds: updateArraySlot(record.promptSounds ?? [], 0, value, 3) })} />
      <NumberField label="Tumblers" value={record.tumblers} onCommit={(tumblers) => update({ tumblers })} />
      <NumberField label="Trap Damage Low" value={record.lowDamage} onCommit={(lowDamage) => update({ lowDamage })} />
      <NumberField label="Trap Damage High" value={record.highDamage} onCommit={(highDamage) => update({ highDamage })} />
      <NumberField label="Trap Spell" value={record.spell} onCommit={(spell) => update({ spell })} />
      <NumberField label="Trap Sound" value={record.prompts?.[1] ?? 0} onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 1, value, 3) })} />
      <NumberField label="Spell Power" value={record.prompts?.[2] ?? 0} onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 2, value, 3) })} />
      <NumberField label="% / Level To Knock" value={record.promptSounds?.[1] ?? 0} onCommit={(value) => update({ promptSounds: updateArraySlot(record.promptSounds ?? [], 1, value, 3) })} />
      <NumberField label="% / Level To Disarm" value={record.promptSounds?.[2] ?? 0} onCommit={(value) => update({ promptSounds: updateArraySlot(record.promptSounds ?? [], 2, value, 3) })} />
      <div className="script-encounter-action-grid rogue-action-grid">
        {Array.from({ length: 8 }, (_, slot) => (
          <RogueActionRow
            key={slot}
            slot={slot}
            record={record}
            project={project}
            catalog={catalog}
            onUpdate={update}
            onCreateMessage={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue message", recordType: "message", id: targetId })}
          />
        ))}
      </div>
      <CollapsibleSection title="Rogue State Flags" eyebrow="advanced" count="10 flags" density="compact" className="script-encounter-text-section">
        <p className="script-encounter-text-note">
          These flags control which rogue actions are initially available and which trap states Realmz can change during play. Imported scenarios may rely on exact combinations.
        </p>
        <div className="script-encounter-outcome-grid">
          {Array.from({ length: 10 }, (_, slot) => (
            <label key={slot} className="script-target-checkbox">
              <span>{rogueFlagLabel(slot)}</span>
              <input
                type="checkbox"
                checked={Boolean(record.typeFlags?.[slot])}
                onChange={(event) => update({ typeFlags: updateArraySlot(record.typeFlags ?? [], slot, event.currentTarget.checked, 10) })}
              />
            </label>
          ))}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function RogueActionRow({
  slot,
  record,
  project,
  catalog,
  onUpdate,
  onCreateMessage
}: {
  slot: number;
  record: Project["thiefEncounters"][number];
  project: Project;
  catalog?: LibraryCatalog | null;
  onUpdate: (changes: Extract<ProjectCommand, { kind: "updateThiefEncounterRecord" }>["changes"]) => void;
  onCreateMessage: (targetId: number) => void;
}) {
  return (
    <div className="script-encounter-action-row">
      <header>
        <strong>{ROGUE_ACTION_LABELS[slot] ?? `Rogue Action ${slot}`}</strong>
      </header>
      <NumberField label="% Modifier" value={record.modifiers?.[slot] ?? 0} onCommit={(value) => onUpdate({ modifiers: updateArraySlot(record.modifiers ?? [], slot, value, 8) })} />
      <NumberField label="Success Result" value={record.successCodes?.[slot] ?? 0} onCommit={(value) => onUpdate({ successCodes: updateArraySlot(record.successCodes ?? [], slot, value, 8) })} />
      <NumberField label="Failure Result" value={record.failureCodes?.[slot] ?? 0} onCommit={(value) => onUpdate({ failureCodes: updateArraySlot(record.failureCodes ?? [], slot, value, 8) })} />
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Success String"
        emptyLabel="No success string"
        opcode={1}
        value={record.successText?.[slot] ?? 0}
        createRecordType="message"
        onCommit={(value) => onUpdate({ successText: updateArraySlot(record.successText ?? [], slot, value, 8) })}
        onCreateTarget={onCreateMessage}
      />
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Failure String"
        emptyLabel="No failure string"
        opcode={1}
        value={record.failureText?.[slot] ?? 0}
        createRecordType="message"
        onCommit={(value) => onUpdate({ failureText: updateArraySlot(record.failureText ?? [], slot, value, 8) })}
        onCreateTarget={onCreateMessage}
      />
      <NumberField label="Success Sound" value={record.successSounds?.[slot] ?? 0} onCommit={(value) => onUpdate({ successSounds: updateArraySlot(record.successSounds ?? [], slot, value, 8) })} />
      <NumberField label="Failure Sound" value={record.failureSounds?.[slot] ?? 0} onCommit={(value) => onUpdate({ failureSounds: updateArraySlot(record.failureSounds ?? [], slot, value, 8) })} />
    </div>
  );
}

function rogueFlagLabel(slot: number) {
  if (slot === 8) return "Trap affects whole party";
  if (slot === 9) return "Trap is armed";
  return ROGUE_ACTION_LABELS[slot] ?? `Flag ${slot}`;
}

function TimedEncounterShell({
  project,
  catalog,
  id,
  record,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  id: number;
  record: Project["timedEncounters"][number];
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateTimedEncounterRecord" }>["changes"]) => {
    onApplyCommand?.({ kind: "updateTimedEncounterRecord", label: "Update time encounter", id, changes });
  };
  const setLocationKind = (locationKind: Project["timedEncounters"][number]["locationKind"]) => {
    update({ locationKind, stuff: updateArraySlot(record.stuff ?? [], 0, locationKindValue(locationKind), 10) });
  };
  return (
    <div className="script-target-grid timed-encounter-editor">
      <div className="script-shop-source-note">
        <strong>Midnight schedule</strong>
        <span>Time Encounters are checked at midnight. Day and Increment set to -1 keeps this record inactive until an Action Point activates it.</span>
      </div>
      <NumberField label="Day" value={record.day} onCommit={(day) => update({ day })} />
      <NumberField label="Increment" value={record.increment} onCommit={(increment) => update({ increment })} />
      <NumberField label="% Chance" value={record.percent} onCommit={(percent) => update({ percent })} />
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Extra Action Point To Activate"
        emptyLabel="No Extra Action Point"
        opcode={39}
        value={record.door}
        onCommit={(door) => update({ door })}
      />
      <NumberField label="Required Item ID" value={record.requiredItem} onCommit={(requiredItem) => update({ requiredItem })} />
      <NumberField label="Required Quest ID" value={record.requiredQuest} onCommit={(requiredQuest) => update({ requiredQuest })} />
      <label className="script-target-wide-field">
        <span>Position Requirement</span>
        <select value={record.locationKind} onChange={(event) => setLocationKind(event.currentTarget.value as Project["timedEncounters"][number]["locationKind"])}>
          <option value="any">No position required</option>
          <option value="land">Land level</option>
          <option value="dungeon">Dungeon level</option>
        </select>
        <small>Use -1 in level, rectangle, X, or Y when that location field is not required.</small>
      </label>
      <NumberField label="Required Level" value={record.requiredLevel} onCommit={(requiredLevel) => update({ requiredLevel })} />
      <NumberField label="Required Rect" value={record.requiredRandomRect} onCommit={(requiredRandomRect) => update({ requiredRandomRect })} />
      <NumberField label="Required X" value={record.requiredX} onCommit={(requiredX) => update({ requiredX })} />
      <NumberField label="Required Y" value={record.requiredY} onCommit={(requiredY) => update({ requiredY })} />
      <CollapsibleSection title="Additional Data" eyebrow="advanced" count="9 fields" density="compact" className="script-encounter-text-section">
        <p className="script-encounter-text-note">
          Realmz reserves additional signed-number fields in Time Encounters. Keep imported values unless you are matching a known Divinity setup.
        </p>
        <div className="script-target-grid">
          {Array.from({ length: 9 }, (_, index) => {
            const slot = index + 1;
            return (
              <NumberField
                key={slot}
                label={`Extra ${slot}`}
                value={record.stuff?.[slot] ?? 0}
                onCommit={(value) => update({ stuff: updateArraySlot(record.stuff ?? [], slot, value, 10) })}
              />
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function locationKindValue(locationKind: Project["timedEncounters"][number]["locationKind"]) {
  if (locationKind === "land") return 1;
  if (locationKind === "dungeon") return 2;
  return -1;
}

function EncounterTextGrid({
  recordKind,
  texts,
  onCommit
}: {
  recordKind: "simple" | "complex";
  texts: string[];
  onCommit: (slot: number, text: string) => void;
}) {
  const count = recordKind === "simple" ? 4 : 9;
  const maxLength = recordKind === "simple" ? 79 : 39;
  return (
    <CollapsibleSection title="Choice / Response Text Buffers" eyebrow="Classic Pascal text" count={`${count} buffers, ${maxLength} display bytes each`} density="compact" className="script-encounter-text-section" defaultOpen>
      <p className="script-encounter-text-note">
        Realmz stores these as Pascal text buffers inside the encounter record. Providence shows the display text and writes the hidden length byte on export.
      </p>
      <div className="script-encounter-text-grid">
        {Array.from({ length: count }, (_, slot) => {
          const text = texts[slot] ?? "";
          return (
            <label key={slot} className="script-encounter-text-field">
              <span>
                {encounterTextBufferLabel(recordKind, slot)}
              </span>
              <textarea
                defaultValue={text}
                maxLength={maxLength}
                onBlur={(event) => onCommit(slot, event.currentTarget.value)}
              />
              <small>
                {text.length}/{maxLength}
              </small>
            </label>
          );
        })}
      </div>
    </CollapsibleSection>
  );
}

function EncounterActionRowEditor({
  project,
  catalog,
  slot,
  row,
  onUpdate,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  slot: number;
  row: EncounterActionRow;
  onUpdate: (changes: Partial<EncounterActionRow>) => void;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
}) {
  const rowOption = actionOptionFor(row.rawCode);
  const targetType = realmzScriptStepDescriptorFor(row.rawCode).targetType;
  return (
    <div className="script-encounter-action-row">
      <header>
        <div>
          <strong>Action Row {slot}</strong>
          <small>{rowOption ? `${rowOption.category} | ${rowOption.description}` : "Empty action row"}</small>
        </div>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onUpdate({ rawCode: 0, id: 0 })}>
          Clear Row
        </button>
      </header>
      <label>
        <span>Opcode</span>
        <select value={row.rawCode} onChange={(event) => onUpdate({ rawCode: Number(event.currentTarget.value) })}>
          {ACTION_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>{option.code} {option.label}</option>
          ))}
        </select>
      </label>
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="Action Target"
        emptyLabel="No action target"
        opcode={row.rawCode}
        value={row.id}
        createRecordType={targetType}
        onCommit={(next) => onUpdate({ id: next })}
        onCreateTarget={(targetId) => {
          if (targetType) onCreateTarget(targetType, targetId);
        }}
      />
    </div>
  );
}

function ReferenceIdField({
  project,
  catalog,
  label,
  emptyLabel,
  opcode,
  value,
  createRecordType,
  onCommit,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  emptyLabel: string;
  opcode: number;
  value: number;
  createRecordType?: RealmzTargetRecordKind;
  onCommit: (value: number) => void;
  onCreateTarget?: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => targetOptionsForOpcode(project, opcode, catalog), [project, opcode, catalog]);
  const selected = options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(() => filterScriptTargetOptions(options, query), [options, query]);
  const visibleOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 260);
    if (selected && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 259)];
    return visible;
  }, [filteredOptions, selected]);
  const resultOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 8);
    if (selected && !query.trim() && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 7)];
    return visible;
  }, [filteredOptions, query, selected]);
  const hasRawValue = value !== 0 && !selected;
  const canCreate = Boolean(createRecordType && onCreateTarget && (!selected || hasRawValue || value === 0));
  const createId = value > 0 && !selected ? value : createRecordType ? nextAuthorableTargetId(project, createRecordType) : value;
  const selectTarget = (next: number) => {
    onCommit(next);
    setQuery("");
  };
  return (
    <label className="script-reference-id-field">
      <span>{label}</span>
      <input
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder={`Search ${label.toLowerCase()}...`}
        aria-label={`Search ${label}`}
      />
      <div className="script-reference-results" aria-live="polite">
        {query.trim() && resultOptions.length === 0 && <small>No matching {label.toLowerCase()} targets.</small>}
        {(query.trim() ? resultOptions : selected ? [selected] : []).map((option) => (
          <button
            key={option.key}
            type="button"
            className={option.value === value ? "selected" : ""}
            onClick={() => selectTarget(option.value)}
          >
            <strong>{option.label}</strong>
            <span>{[option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | ")}</span>
          </button>
        ))}
        {query.trim() && filteredOptions.length > resultOptions.length && <small>{filteredOptions.length - resultOptions.length} more match(es); keep typing to narrow.</small>}
      </div>
      <select value={hasRawValue ? `raw:${value}` : selected ? String(selected.value) : ""} onChange={(event) => {
        const raw = event.currentTarget.value;
        if (!raw || raw.startsWith("raw:")) return;
        selectTarget(Number(raw));
      }}>
        <option value="">{emptyLabel}</option>
        {hasRawValue && <option value={`raw:${value}`}>Current value {value}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} value`} />
      <small>{selected ? [selected.detail, selected.summary, selected.compatibility, selected.sourceState].filter(Boolean).join(" | ") : hasRawValue ? "Current value has no matching target yet." : filteredOptions.length === 0 && query.trim() ? "No targets match this search." : emptyLabel}</small>
      {canCreate && (
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
          onCreateTarget?.(createId);
          onCommit(createId);
        }}>
          Create {label} {createId}
        </button>
      )}
    </label>
  );
}

function updateArraySlot<T>(values: T[], index: number, value: T, minLength: number) {
  const next = [...values];
  while (next.length < minLength) next.push((typeof value === "number" ? 0 : "") as T);
  next[index] = value;
  return next;
}

function encounterActionAt(actions: EncounterActionRow[], slot: number): EncounterActionRow {
  return actions.find((row) => row.slot === slot) ?? { slot, rawCode: 0, id: 0 };
}

function updateEncounterActionRow(actions: EncounterActionRow[], slot: number, changes: Partial<EncounterActionRow>) {
  const next = new Map(actions.map((row) => [row.slot, { ...row }]));
  const updated = { ...(next.get(slot) ?? { slot, rawCode: 0, id: 0 }), ...changes, slot };
  if (updated.rawCode === 0 && updated.id === 0) {
    next.delete(slot);
  } else {
    next.set(slot, updated);
  }
  return [...next.values()].sort((a, b) => a.slot - b.slot);
}

function encounterTextBufferLabel(recordKind: "simple" | "complex", slot: number) {
  if (recordKind === "simple") {
    return ["Choice 0 Label", "Choice 1 Label", "Choice 2 Label", "Choice 3 Label"][slot] ?? `Text Buffer ${slot}`;
  }
  const labels = [
    "Action Option 0 Label",
    "Action Option 1 Label",
    "Action Option 2 Label",
    "Action Option 3 Label",
    "Action Option 4 Label",
    "Action Option 5 Label",
    "Action Option 6 Label",
    "Action Option 7 Label",
    "Word Answer"
  ];
  return labels[slot] ?? `Text Buffer ${slot}`;
}

function BattleGridEditor({
  project,
  catalog,
  grid,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  grid: number[];
  onCommit: (index: number, value: number) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, grid.findIndex((value) => value !== 0)));
  const selectedValue = grid[selectedIndex] ?? 0;
  const selectedMonsterId = Math.abs(selectedValue);
  const [placementMonsterId, setPlacementMonsterId] = useState(selectedMonsterId);
  const [forceFriend, setForceFriend] = useState(selectedValue < 0);
  const [eraseMode, setEraseMode] = useState(false);
  const row = Math.floor(selectedIndex / 13);
  const col = selectedIndex % 13;
  const selectedDetail = monsterReferenceDetail(project, selectedValue, catalog);
  const placedCount = grid.filter(Boolean).length;
  const placementDetail = placementMonsterId ? monsterReferenceDetail(project, placementMonsterId, catalog) : "Choose a monster, then click cells to place it.";
  useEffect(() => {
    if (selectedMonsterId) {
      setPlacementMonsterId(selectedMonsterId);
      setForceFriend(selectedValue < 0);
    }
  }, [selectedIndex, selectedMonsterId, selectedValue]);
  const commitMonsterId = (monsterId: number) => {
    const sign = selectedValue < 0 ? -1 : 1;
    onCommit(selectedIndex, monsterId === 0 ? 0 : sign * Math.abs(monsterId));
  };
  const commitSide = (otherSide: boolean) => {
    if (selectedMonsterId === 0) return;
    onCommit(selectedIndex, otherSide ? -selectedMonsterId : selectedMonsterId);
  };
  const handleCellClick = (index: number) => {
    setSelectedIndex(index);
    if (eraseMode) {
      if ((grid[index] ?? 0) !== 0) onCommit(index, 0);
      return;
    }
    if (placementMonsterId) {
      onCommit(index, forceFriend ? -Math.abs(placementMonsterId) : Math.abs(placementMonsterId));
    }
  };
  return (
    <CollapsibleSection title="Monster Grid" eyebrow="13 x 13" count={`${placedCount} placed`} density="compact" className="script-battle-grid-section" defaultOpen>
      <div className="script-battle-placement-panel">
        <header>
          <strong>Placement</strong>
          <small>{placementDetail}</small>
        </header>
        <MonsterIdField
          project={project}
          catalog={catalog}
          label="Monster To Place"
          value={placementMonsterId}
          onCommit={(monsterId) => {
            setPlacementMonsterId(Math.abs(monsterId));
            setEraseMode(false);
          }}
          compact
        />
        <label className="script-target-checkbox">
          <span>Force Friend</span>
          <input type="checkbox" checked={forceFriend} disabled={!placementMonsterId || eraseMode} onChange={(event) => setForceFriend(event.currentTarget.checked)} />
        </label>
        <label className="script-target-checkbox">
          <span>Erase Mode</span>
          <input type="checkbox" checked={eraseMode} onChange={(event) => setEraseMode(event.currentTarget.checked)} />
        </label>
        <small className="script-battle-placement-note">
          Divinity allows up to 100 placed monsters. Force Friend stores a flipped battle-grid side value.
        </small>
      </div>
      <div className="script-battle-grid-editor" role="grid" aria-label="Battle monster grid">
        {Array.from({ length: 13 * 13 }, (_, index) => {
          const value = grid[index] ?? 0;
          const filled = value !== 0;
          return (
            <button
              key={index}
              type="button"
              role="gridcell"
              className={`${index === selectedIndex ? "selected" : ""}${filled ? " filled" : ""}${value < 0 ? " other-side" : ""}`}
              title={filled ? monsterReferenceDetail(project, value, catalog) : `Empty battle cell ${Math.floor(index / 13)},${index % 13}`}
              onClick={() => handleCellClick(index)}
            >
              {filled ? Math.abs(value) : ""}
            </button>
          );
        })}
      </div>
      <div className="script-battle-selected-cell">
        <header>
          <strong>Selected Cell {col}, {row}</strong>
          <small>{selectedDetail}</small>
        </header>
        <MonsterIdField
          project={project}
          catalog={catalog}
          label="Selected Cell Monster"
          value={selectedMonsterId}
          onCommit={(monsterId) => {
            setPlacementMonsterId(Math.abs(monsterId));
            commitMonsterId(monsterId);
          }}
          compact
        />
        <label className="script-target-checkbox">
          <span>Force Friend / flip side</span>
          <input type="checkbox" checked={selectedValue < 0} disabled={selectedMonsterId === 0} onChange={(event) => commitSide(event.currentTarget.checked)} />
        </label>
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onCommit(selectedIndex, 0)}>Clear Cell</button>
      </div>
    </CollapsibleSection>
  );
}

function MonsterIdField({
  project,
  catalog,
  label,
  value,
  onCommit,
  compact = false
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => monsterReferenceOptions(project, catalog), [project, catalog]);
  const selected = options.find((option) => option.value === Math.abs(value));
  const filteredOptions = useMemo(() => filterMonsterTargetOptions(options, query), [options, query]);
  const visibleOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 260);
    if (selected && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 259)];
    return visible;
  }, [filteredOptions, selected]);
  return (
    <label className={`script-monster-id-field${compact ? " compact" : ""}`}>
      <span>{label}</span>
      <input
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search monsters..."
        aria-label={`Search ${label} monsters`}
      />
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty / none</option>
        {value !== 0 && !options.some((option) => option.value === Math.abs(value)) && <option value={Math.abs(value)}>Current monster ID {Math.abs(value)}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} raw monster ID`} />
      <small>{selected ? [selected.detail, selected.sourceState].filter(Boolean).join(" | ") : filteredOptions.length === 0 && query.trim() ? "No monsters match this search." : monsterReferenceDetail(project, value, catalog)}</small>
    </label>
  );
}

function TreasureRewardField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  return (
    <div className="script-treasure-reward-field">
      <NumberField label={label} value={value} onCommit={onCommit} compact />
      <small>{treasureRewardHint(label, value)}</small>
    </div>
  );
}

function TreasureCatalogAdder({
  project,
  catalog,
  itemIds,
  onAddItem
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  itemIds: number[];
  onAddItem: (itemId: number) => void;
}) {
  const [category, setCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [query, setQuery] = useState("");
  const options = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const openSlot = firstOpenTreasureSlot(itemIds);
  const filteredOptions = useMemo(() => filterItemTargetOptionsByCategory(options, query, category).slice(0, 36), [options, query, category]);
  return (
    <CollapsibleSection title="Add Items" eyebrow="Divinity categories" count={openSlot >= 0 ? `next open slot ${openSlot}` : "full"} density="compact" className="script-item-catalog-section" defaultOpen>
      <div className="script-item-category-tabs">
        {ITEM_REFERENCE_CATEGORIES.filter((entry) => entry.id !== "all").map((entry) => (
          <button key={entry.id} type="button" className={category === entry.id ? "active" : ""} onClick={() => setCategory(entry.id)}>
            <strong>{entry.label}</strong>
            {entry.range && <span>{entry.range}</span>}
          </button>
        ))}
      </div>
      <input className="script-item-catalog-search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search items to add..." />
      <div className="script-item-catalog-list compact">
        {filteredOptions.map((option) => (
          <button key={option.key} type="button" disabled={openSlot < 0} onClick={() => onAddItem(option.value)}>
            <strong>{option.label}</strong>
            <span>{[option.detail, option.sourceState].filter(Boolean).join(" | ")}</span>
          </button>
        ))}
        {filteredOptions.length === 0 && <small>No items match this category/search.</small>}
      </div>
    </CollapsibleSection>
  );
}

function TreasureItemGrid({ project, catalog, itemIds, onCommit }: { project: Project; catalog?: LibraryCatalog | null; itemIds: number[]; onCommit: (index: number, value: number) => void }) {
  return (
    <CollapsibleSection title="Treasure Items" eyebrow="20 slots" count={`${itemIds.filter(Boolean).length} filled`} density="compact" className="script-treasure-grid-section" defaultOpen>
      <div className="script-treasure-item-grid">
        {Array.from({ length: 20 }, (_, index) => (
          <ItemIdField key={index} project={project} catalog={catalog} label={`Item ${index}`} value={itemIds[index] ?? 0} onCommit={(value) => onCommit(index, value)} compact />
        ))}
      </div>
    </CollapsibleSection>
  );
}

function ShopStockEditor({
  project,
  catalog,
  itemIds,
  quantities,
  onCommitItem,
  onCommitQuantity,
  onReplaceStock,
  onClearSlot
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  itemIds: number[];
  quantities: number[];
  onCommitItem: (index: number, value: number) => void;
  onCommitQuantity: (index: number, value: number) => void;
  onReplaceStock: (itemIds: number[], quantities: number[]) => void;
  onClearSlot: (index: number) => void;
}) {
  const [page, setPage] = useState(0);
  const [filledOnly, setFilledOnly] = useState(false);
  const [jumpSlot, setJumpSlot] = useState("");
  const [catalogCategory, setCatalogCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [changeAmount, setChangeAmount] = useState(1);
  const itemOptions = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const catalogItems = useMemo(() => filterItemTargetOptionsByCategory(itemOptions, catalogQuery, catalogCategory).slice(0, 72), [itemOptions, catalogQuery, catalogCategory]);
  const filledSlots = useMemo(() => {
    const slots: number[] = [];
    for (let index = 0; index < 1000; index += 1) {
      if ((itemIds[index] ?? 0) !== 0 || (quantities[index] ?? 0) !== 0) slots.push(index);
    }
    return slots;
  }, [itemIds, quantities]);
  const allSlots = useMemo(() => Array.from({ length: 1000 }, (_, index) => index), []);
  const sourceSlots = filledOnly ? filledSlots : allSlots;
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(sourceSlots.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visibleSlots = sourceSlots.slice(safePage * pageSize, safePage * pageSize + pageSize);
  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);
  const jumpToSlot = () => {
    const slot = Number(jumpSlot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 999) return;
    setFilledOnly(false);
    setPage(Math.floor(slot / pageSize));
  };
  const adjustItem = (itemId: number) => {
    const next = adjustShopStock(itemIds, quantities, itemId, changeAmount);
    onReplaceStock(next.itemIds, next.quantities);
  };
  return (
    <CollapsibleSection title="Shop Stock" eyebrow="1000 slots" count={`${filledSlots.length} filled`} density="compact" className="script-shop-stock-section" defaultOpen>
      <div className="script-shop-catalog-editor">
        <header>
          <div>
            <strong>Item Catalog</strong>
            <small>Click an item to change this shop's quantity by the current amount.</small>
          </div>
          <label>
            <span>Change</span>
            <input type="number" value={changeAmount} onChange={(event) => setChangeAmount(Number(event.currentTarget.value) || 0)} />
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => setChangeAmount((value) => (value === 0 ? -1 : -value))}>
              +/-
            </button>
          </label>
        </header>
        <div className="script-item-category-tabs">
          {ITEM_REFERENCE_CATEGORIES.map((entry) => (
            <button key={entry.id} type="button" className={catalogCategory === entry.id ? "active" : ""} onClick={() => setCatalogCategory(entry.id)}>
              <strong>{entry.label}</strong>
              {entry.range && <span>{entry.range}</span>}
            </button>
          ))}
        </div>
        <input className="script-item-catalog-search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.currentTarget.value)} placeholder="Search shop items..." />
        <div className="script-shop-catalog-list">
          {catalogItems.map((option) => {
            const quantity = shopQuantityForItem(itemIds, quantities, option.value);
            return (
              <button key={option.key} type="button" onClick={() => adjustItem(option.value)}>
                <b>{quantity}</b>
                <span>
                  <strong>{option.label}</strong>
                  <small>{[option.detail, option.sourceState].filter(Boolean).join(" | ")}</small>
                </span>
                <i>{option.value}</i>
              </button>
            );
          })}
          {catalogItems.length === 0 && <small>No items match this category/search.</small>}
        </div>
      </div>
      <div className="script-shop-stock-toolbar">
        <button type="button" className="btn btn-secondary btn-xs" disabled={safePage <= 0} onClick={() => setPage(Math.max(0, safePage - 1))}>Prev</button>
        <span>Page {safePage + 1} / {pageCount}</span>
        <button type="button" className="btn btn-secondary btn-xs" disabled={safePage >= pageCount - 1} onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}>Next</button>
        <label>
          <input type="checkbox" checked={filledOnly} onChange={(event) => {
            setFilledOnly(event.currentTarget.checked);
            setPage(0);
          }} />
          Filled
        </label>
        <label>
          <span>Go to</span>
          <input type="number" min={0} max={999} value={jumpSlot} onChange={(event) => setJumpSlot(event.currentTarget.value)} onBlur={jumpToSlot} onKeyDown={(event) => {
            if (event.key === "Enter") jumpToSlot();
          }} />
        </label>
      </div>
      <div className="script-shop-stock-grid">
        {visibleSlots.map((index) => (
          <div key={index} className="script-shop-stock-row">
            <strong>{index}</strong>
            <ItemIdField project={project} catalog={catalog} label="Item" value={itemIds[index] ?? 0} onCommit={(value) => onCommitItem(index, value)} compact />
            <NumberField label="Qty" value={quantities[index] ?? 0} onCommit={(value) => onCommitQuantity(index, value)} compact />
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onClearSlot(index)}>Clear</button>
          </div>
        ))}
        {visibleSlots.length === 0 && <p className="script-shop-stock-empty">No filled shop slots.</p>}
      </div>
    </CollapsibleSection>
  );
}

function ItemIdField({ project, catalog, label, value, onCommit, compact = false }: { project: Project; catalog?: LibraryCatalog | null; label: string; value: number; onCommit: (value: number) => void; compact?: boolean }) {
  const [query, setQuery] = useState("");
  const options = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => filterItemTargetOptions(options, query), [options, query]);
  const visibleOptions = useMemo(() => {
    const visible = filteredOptions.slice(0, 260);
    if (selected && !visible.some((option) => option.value === selected.value)) return [selected, ...visible.slice(0, 259)];
    return visible;
  }, [filteredOptions, selected]);
  return (
    <label className={`script-item-id-field${compact ? " compact" : ""}`}>
      <span>{label}</span>
      <input
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search items..."
        aria-label={`Search ${label} items`}
      />
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty / none</option>
        {value !== 0 && !options.some((option) => option.value === value) && <option value={value}>Current item ID {value}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} raw item ID`} />
      <small>{selected ? [selected.detail, selected.sourceState].filter(Boolean).join(" | ") : filteredOptions.length === 0 && query.trim() ? "No items match this search." : itemReferenceDetail(project, value, catalog)}</small>
    </label>
  );
}

function filterScriptTargetOptions(options: ReturnType<typeof targetOptionsForOpcode>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => [
    option.value,
    option.label,
    option.detail,
    option.summary,
    option.compatibility,
    option.sourceState
  ].join(" ").toLowerCase().includes(normalized));
}

function filterItemTargetOptions(options: ReturnType<typeof itemReferenceOptions>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => [
    option.value,
    option.label,
    option.detail,
    option.summary,
    option.sourceState
  ].join(" ").toLowerCase().includes(normalized));
}

function filterItemTargetOptionsByCategory(options: ReturnType<typeof itemReferenceOptions>, query: string, category: ItemReferenceCategory | "all") {
  return filterItemTargetOptions(options, query)
    .filter((option) => option.value !== 0)
    .filter((option) => category === "all" || option.category === category);
}

function filterMonsterTargetOptions(options: ReturnType<typeof monsterReferenceOptions>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return options;
  return options.filter((option) => [
    option.value,
    option.label,
    option.detail,
    option.summary,
    option.sourceState
  ].join(" ").toLowerCase().includes(normalized));
}

function treasureRewardHint(label: string, value: number) {
  if (value < 0) return `Random ${label.toLowerCase()} from 1 to ${Math.abs(value)}.`;
  if (value > 0) return `Fixed ${label.toLowerCase()} reward.`;
  return "No reward.";
}

function firstOpenTreasureSlot(itemIds: number[]) {
  for (let index = 0; index < 20; index += 1) {
    if ((itemIds[index] ?? 0) === 0) return index;
  }
  return -1;
}

function shopQuantityForItem(itemIds: number[], quantities: number[], itemId: number) {
  let total = 0;
  for (let index = 0; index < 1000; index += 1) {
    if ((itemIds[index] ?? 0) === itemId) total += Math.max(0, quantities[index] ?? 0);
  }
  return total;
}

function adjustShopStock(itemIds: number[], quantities: number[], itemId: number, delta: number) {
  const nextItems = [...itemIds];
  const nextQuantities = [...quantities];
  while (nextItems.length < 1000) nextItems.push(0);
  while (nextQuantities.length < 1000) nextQuantities.push(0);
  const existingIndex = nextItems.findIndex((candidate) => candidate === itemId);
  const slot = existingIndex >= 0 ? existingIndex : nextItems.findIndex((candidate, index) => candidate === 0 && (nextQuantities[index] ?? 0) === 0);
  if (slot < 0) return { itemIds: nextItems, quantities: nextQuantities };
  const current = existingIndex >= 0 ? Math.max(0, nextQuantities[slot] ?? 0) : 0;
  const nextQuantity = Math.max(0, Math.min(255, current + delta));
  if (nextQuantity === 0) {
    nextItems[slot] = 0;
    nextQuantities[slot] = 0;
  } else {
    nextItems[slot] = itemId;
    nextQuantities[slot] = nextQuantity;
  }
  return { itemIds: nextItems, quantities: nextQuantities };
}

function targetRecordExists(project: Project, recordType: RealmzTargetRecordKind, id: number) {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    recordType === "timedEncounter" ? project.timedEncounters :
    project.questLabels;
  return Boolean((records ?? []).some((record) => record.id === id));
}

function isScriptsBenchmarkMode() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("benchmarkScripts");
}

function NumberField({ label, value, onCommit, compact = false }: { label: string; value: number; onCommit: (value: number) => void; compact?: boolean }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  return (
    <label className={compact ? "script-number-field compact" : "script-number-field"}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
      />
    </label>
  );
}

function ScriptDiagnostics({ issues }: { issues: ScriptDiagnostic[] }) {
  if (issues.length === 0) {
    return (
      <div className="script-diagnostics ok">
        <span>Ready</span>
        <strong>No script blockers detected for this selection.</strong>
      </div>
    );
  }
  return (
    <div className="script-diagnostics">
      {issues.slice(0, 5).map((issue) => (
        <div key={issue.id} className={`script-diagnostic ${issue.severity}`}>
          <AlertTriangle size={13} />
          <span>
            <strong>{issue.slot != null ? `Slot ${issue.slot}: ${issue.message}` : issue.message}</strong>
            <small>{issue.detail}</small>
          </span>
        </div>
      ))}
      {issues.length > 5 && <small className="script-diagnostic-more">{issues.length - 5} more issue(s) in this script.</small>}
    </div>
  );
}

function clampRealmzCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(89, Math.trunc(value)));
}

function nextAuthorableTargetId(project: Project, recordType: RealmzTargetRecordKind) {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    recordType === "timedEncounter" ? project.timedEncounters :
    project.questLabels;
  const used = new Set((records ?? []).map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size + 1;
}
