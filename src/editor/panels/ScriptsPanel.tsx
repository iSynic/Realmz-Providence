import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, CopyPlus, Plus, Save, Trash2, Volume2, X } from "lucide-react";
import { Action, Ed3ReachabilityRow, EncounterActionRow, LevelType, LibraryCatalog, Project, ProjectCommand, QuestThread, RealmzTargetRecordKind, ScriptDetailSurface, ScriptInventoryFilter, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { linksFor, selectEntityFromId, semanticLabel, triggerEntityId } from "../utils";
import { actionSlotEntitiesForTriggerRecord, ed3ReachabilityFor, extraActionEvidenceSummary, extraActionPointClassification } from "../semanticGraph";
import { EdcdRowEditor } from "../components/EdcdRowEditor";
import { buildEdcdRowUsages, edcdUsageMatchesFilter, edcdUsageStatusTone, edcdUsageToEditorUsage, nextUnusedEdcdRowId, normalizeEdcdValues, type EdcdRowFilter, type EdcdRowUsage, type EdcdRowCaller } from "../edcdRows";
import { TargetPicker, resolveSignedMessageTarget, signedTargetBehaviorLabel, signedTargetValueForSelection, targetOptionForOpcodeValue, targetOptionsForOpcode, targetPickerConfig, type ScriptTargetOption } from "../components/RealmzTargetPicker";
import { TutorialTip } from "../components/TutorialTip";
import { playPreviewUrl, useIconPreviewUrl, useResolvedPreviewUrl } from "../previewUrls";
import { categoryColor } from "../components/TileSprite";
import { CollapsibleSection, EmptyState, FieldRow, FloatingWorkbenchPanel, PanelSection, ScrollArea } from "../ui";
import { ACTION_OPTIONS, actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "../realmzActions";
import { edcdFieldNamesForShape } from "../realmzEdcd";
import { opcodeIdMeaning, parameterLabelsForOpcode } from "../opcodeCrosswalk";
import { divinityHelpForOpcode } from "../divinityOpcodeHelp";
import { ScriptDiagnostic, validateActionDraft, validateScriptTrigger } from "../scriptValidation";
import { actionPointCapacity, isReusableDoorPlaceholder, nextActionPointRecordIndex } from "../actionPointCapacity";
import { realmzScriptStepDescriptorFor } from "../realmzScriptDescriptors";
import { validateRealmzTargetRecord } from "../targetValidation";
import { buildQuestPresentation, questCategoryLabel, QUEST_CATEGORIES, type QuestFlagModel, type QuestUsage } from "../questUsage";
import { ITEM_REFERENCE_CATEGORIES, itemReferenceDetail, itemReferenceOptions, type ItemReferenceCategory, type ItemReferenceOption } from "../itemReferences";
import { monsterReferenceDetail, monsterReferenceOptions } from "../monsterReferences";
import { CONDITION_LABELS, RESISTANCE_TYPES } from "../rulesCatalog";
import {
  ED3_EVIDENCE_FILTERS,
  SCRIPT_INVENTORY_FILTERS,
  ScriptListItem,
  actionBelongsTo,
  actionSummary,
  ed3Classification,
  filterScriptsByInventory,
  hasScriptWarning,
  issueCountsBySlot,
  scriptLabel,
  scriptMatchesQuery,
  scriptPanelTitle,
  scriptTabKind,
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
  scriptStepFlowRoutes,
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

function includeSelectedTrigger(records: TriggerRecord[], selected: TriggerRecord | null, limit: number) {
  const cappedLimit = Math.max(0, limit);
  const visible = records.slice(0, cappedLimit);
  if (!selected || visible.some((record) => record.id === selected.id)) return visible;
  if (!records.some((record) => record.id === selected.id)) return visible;
  return [selected, ...visible];
}

function defaultDraftForProject(project: Project, definition: ScriptActionDefinition) {
  const draft = definition.defaultDraft;
  if (!draft.parameters || draft.id !== 0) return { rawCode: draft.rawCode, id: draft.id };
  return { rawCode: draft.rawCode, id: nextUnusedEdcdRowId(project) };
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

const SCRIPT_EDITOR_TABS = [
  { id: "action-points", label: "Action Points", title: "Create and edit map Action Points." },
  { id: "macros", label: "Extra Action Points", title: "Extra Action Points and branch targets." },
  { id: "global-macros", label: "Global Events", title: "Scenario-wide event hooks and startup logic." },
  { id: "quests", label: "Story Flags", title: "Raw Divinity quest flags, counters, branches, and optional author notes." },
  { id: "settings-rows", label: "Settings Rows", title: "Advanced browser for EDCD action settings rows." },
  { id: "ed3-evidence", label: "Unlinked Extra APs", title: "Extra Action Points not yet linked from known scenario behavior." }
];

const SCRIPT_WORKBENCH_HELP =
  "Scripts is the Divinity Action Point hub: map triggers, reusable Extra Action Points, global hooks, quest usage, CODE/ID steps, EDCD settings, targets, diagnostics, and source evidence.";
const CREATE_AP_HELP =
  "Creates a map or dungeon Action Point at the chosen cell. Realmz stores these as fixed records, so Providence reuses empty slots instead of shifting later record IDs.";
const INVENTORY_FILTER_HELP =
  "Use Current Map while authoring one area, Active for non-empty records, Reusable for cleared fixed slots, Warnings before release, and All when tracing links across the scenario.";
const SCRIPT_RECORD_HELP =
  "This selected record is the source-backed script container. Map Action Points have chance/location/goto fields; Extra Action Points store only the eight steps until another script calls them.";
const CLEAR_SCRIPT_HELP =
  "Clear keeps Realmz's fixed record shape intact. Clearing a map Action Point makes the slot reusable; deleting an Extra Action Point uses the safe row command for that reusable script.";
const STEP_LIST_HELP =
  "Realmz scripts have eight ordered CODE/ID slots. Select a slot to edit it, then apply the draft; moving, duplicating, or clearing a step affects only that selected slot.";
const TARGET_DRAWER_HELP =
  "Edit Target Record opens an inline editor for direct script targets such as messages, battles, treasure, shops, encounters, and monsters. EDCD-backed actions keep their real target fields in Action Settings instead.";
const FLOW_PREVIEW_HELP =
  "Flow Preview summarizes obvious branches, GOSUBs, Extra Action Point calls, choices, and logic paths. It is a navigation aid, not a full runtime interpreter.";
const TECHNICAL_DETAILS_HELP =
  "Technical Details shows the raw Realmz storage: source file, record index, door ID, selected slot, applied and draft CODE/ID, EDCD row, dispatcher status, and semantic links.";
const STEP_REFERENCE_HELP =
  "Step Reference keeps the opcode notes, Divinity wording, and raw CODE/ID storage available without making them the main authoring surface.";
const TARGET_PICKER_HELP =
  "The target picker resolves the selected opcode's expected record type and can create safe source-backed shells when Providence has a writer for that target family.";
const ACTION_CHOOSER_HELP =
  "Choose Action changes only the selected step draft. Apply Step is still required before the script record is updated.";
const SETTINGS_HELP =
  "Settings rows hold the editable options for many Realmz actions. Imported scripts keep their original row numbers; new actions get an unused row automatically, so authors should normally edit the fields instead of memorizing row IDs.";
const SIMPLE_ENCOUNTER_SOURCE_HELP =
  "Simple Encounters are Data ED source records. The prompt points to a Message, the four option labels live inside this record, and each option result jumps to one of four script columns.";
const COMPLEX_ENCOUNTER_SOURCE_HELP =
  "Complex Encounters are Data ED2 source records. Spell, item, thief, typed-word, and action-picker tests all reduce to result numbers that run one of four script columns.";
const ROGUE_ENCOUNTER_SOURCE_HELP =
  "Rogue Encounters are Data TD2 source records for locks, traps, search, and thief-skill actions. Runtime can mark traps detected, disabled, or sprung without changing this source record.";
const TIMED_ENCOUNTER_SOURCE_HELP =
  "Time Encounters are Data TD3 source records. Realmz checks schedule, chance, location, item, and quest gates, then runs the Extra Action Point target when everything matches.";
const ENCOUNTER_SETUP_HELP =
  "Encounter setup owns the shared source fields: prompt message, back-out behavior, max attempts, and caste-success value. The prompt is a central Message; option labels below are inline buffers.";
const COMPLEX_THIEF_BRANCH_HELP =
  "The complex thief branch links into a Rogue Encounter. That rogue scene decides which lock, trap, and thief actions are available, then returns result numbers into this Complex Encounter's result script columns.";
const SIMPLE_OPTIONS_HELP =
  "Each simple option has an inline label and a Result number. Result 1-4 chooses the matching action column below; zero means no result path.";
const COMPLEX_BAR_ACTIONS_HELP =
  "Complex encounters show up to eight action labels on the encounter bar. The group flags and Action Picker result decide which result column runs when a player chooses a matching action.";
const COMPLEX_WORD_HELP =
  "The word answer is a typed-player-text branch. When the typed phrase matches this buffer, the Word Result chooses which result script column runs.";
const COMPLEX_SPELL_TESTS_HELP =
  "Spell and scroll tests match packed Realmz spell IDs or low spell-class IDs. A matching row returns its Result number into the shared result script columns.";
const COMPLEX_ITEM_TESTS_HELP =
  "Item tests match Realmz item IDs from Economy or the reference item library. A matching row returns its Result number into the shared result script columns.";
const ENCOUNTER_RESULT_ACTION_HELP =
  "Encounter result columns are compact script rows. Result 1, 2, 3, or 4 chooses one column, then Realmz executes its ordered CODE/ID rows.";
const ROGUE_ACTION_TESTS_HELP =
  "Rogue action rows control which thief actions are available, the skill modifier, success/failure result codes, and the text/sound feedback for each outcome. Open Lock Magic and Disarm Trap also expose their spell-special chance fields here.";
const ROGUE_PROMPT_HELP =
  "The rogue prompt is shown when this thief scene begins. It can also play a sound before the player chooses or attempts a rogue action.";
const ROGUE_TRAP_HELP =
  "Trap and lock setup controls whether the record is trapped, who damage affects, tumbler count, damage range, optional trap spell, and power level. Open Lock and Disarm Trap spell paths are configured beside their rows above.";
const TIMED_SCHEDULE_HELP =
  "The midnight schedule controls when this record is considered. Day and Increment define timing, Percent gates execution, and Extra AP To Activate is the macro Realmz runs.";
const TIMED_LOCATION_HELP =
  "Location gates restrict the timed encounter to any map, land, or dungeon, then optionally to level, random rectangle, X, and Y. Raw Position Code is preserved for source accuracy.";
const TIMED_EXTRA_HELP =
  "Data TD3 has nine signed-number slots after the confirmed schedule, macro, item, quest, and location fields. Realmz runtime evidence currently names only the first slot as the location kind. Providence preserves the remaining values but keeps them locked until a real authoring meaning is proven.";

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
  return [
    refKey(catalog ?? null),
    refKey(project.triggers),
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
    refKey(project.mapRecords)
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
  if (classification === "Callable Extra Action Point") return "Extra Action Point";
  if (classification === "Global Macro") return "Global Event";
  if (classification === "Likely Padding" || classification === "Imported Empty Slot") return "Likely Padding";
  if (classification === "Runtime Residue" || classification === "Imported Runtime Mutation") return "Runtime Residue";
  return "Unlinked Extra Action";
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
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const activeTabKind = scriptTabKind(activeEditor);
  const edcdUsages = useMemo(() => project ? buildEdcdRowUsages(project, catalog) : [], [project, catalog]);
  const scripts = useMemo(
    () => project?.triggers.filter((trigger) => triggerVisibleForEditor(project, trigger, activeEditor)) ?? [],
    [project, activeEditor]
  );
  const projectMaps = project?.maps ?? [];
  const [draft, setDraft] = useState<Record<string, { rawCode: number; id: number }>>({});
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<ScriptActionCategory>("Dialogue");
  const [opcodeQuery, setOpcodeQuery] = useState("");
  const [scriptQuery, setScriptQuery] = useState("");
  const [inventoryFilter, setInventoryFilter] = usePersistentValue<ScriptInventoryFilter>("scripts.inventory.filter", "current-map");
  const [detailSurface, setDetailSurface] = usePersistentValue<ScriptDetailSurface>("scripts.detailSurface", "docked");
  const [targetDrawerOpen, setTargetDrawerOpen] = usePersistentBoolean("scripts.targetDrawer.v2.open", false);
  const [newActionPoint, setNewActionPoint] = useState({ mapId: projectMaps[0]?.id ?? "", x: 1, y: 1 });
  const [warningScanReady, setWarningScanReady] = useState(false);
  const selectedScriptButtonRef = useRef<HTMLButtonElement | null>(null);
  const benchmarkStartedRef = useRef(false);
  const selectedMap = projectMaps.find((map) => map.id === newActionPoint.mapId) ?? projectMaps[0] ?? null;
  const canScopeToMap = Boolean(selectedMap && activeTabKind === "action-points");
  const visibleInventoryFilters = useMemo(() => {
    if (activeTabKind === "action-points") return SCRIPT_INVENTORY_FILTERS.filter((filter) => filter.id !== "macros");
    if (activeTabKind === "advanced-imports") return [
      ...SCRIPT_INVENTORY_FILTERS.filter((filter) => filter.id === "all"),
      ...ED3_EVIDENCE_FILTERS,
      ...SCRIPT_INVENTORY_FILTERS.filter((filter) => filter.id === "warnings")
    ];
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
  const diagnosticDependencyKey = useMemo(() => project ? scriptDiagnosticDependencyKey(project, catalog) : "", [project, catalog]);
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
      const diagnostics = cachedValidateScriptTrigger(project, trigger, catalog, diagnosticDependencyKey);
      if (hasScriptWarning(diagnostics)) map.set(trigger.id, diagnostics);
    }
    return map;
  }, [project, scripts, catalog, diagnosticDependencyKey, inventoryFilter, warningScanReady]);
  const inventoryCounts = useMemo(() => {
    const counts = new Map<ScriptInventoryFilter, number | null>([
      ["current-map", 0],
      ["all", 0],
      ["active", 0],
      ["reusable", 0],
      ["warnings", inventoryFilter === "warnings" && warningScanReady ? 0 : null],
      ["macros", 0],
      ["ed3-padding", 0],
      ["ed3-runtime", 0],
      ["ed3-orphan", 0],
      ["ed3-needs-trace", 0]
    ]);
    for (const trigger of scripts) {
      counts.set("all", (counts.get("all") ?? 0) + 1);
      if (selectedMap && canScopeToMap && trigger.source !== "Data ED3" && trigger.levelType === selectedMap.levelType && trigger.levelIndex === selectedMap.index) {
        counts.set("current-map", (counts.get("current-map") ?? 0) + 1);
      }
      if (trigger.source !== "Data ED3" && !isReusableDoorPlaceholder(trigger)) {
        counts.set("active", (counts.get("active") ?? 0) + 1);
      }
      if (isReusableDoorPlaceholder(trigger)) {
        counts.set("reusable", (counts.get("reusable") ?? 0) + 1);
      }
      if (trigger.source === "Data ED3") {
        counts.set("macros", (counts.get("macros") ?? 0) + 1);
        const classification = ed3Classification(project, trigger);
        const filter = ED3_EVIDENCE_FILTERS.find((candidate) => candidate.classification === classification);
        if (filter) counts.set(filter.id, (counts.get(filter.id) ?? 0) + 1);
      }
      if (inventoryFilter === "warnings" && warningScanReady && hasScriptWarning(fullWarningDiagnosticsById.get(trigger.id) ?? [])) {
        counts.set("warnings", (counts.get("warnings") ?? 0) + 1);
      }
    }
    return counts;
  }, [project, scripts, selectedMap, canScopeToMap, fullWarningDiagnosticsById, inventoryFilter, warningScanReady]);
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
    () => project?.triggers.find((trigger) => triggerMatchesSelection(trigger, selectedEntity?.id ?? "")) ?? null,
    [project, selectedEntity?.id]
  );
  const selectedTrigger =
    selectedTriggerFromSelection ??
    filteredScripts[0] ??
    scripts[0] ??
    null;
  useEffect(() => {
    if (!selectedTrigger) return;
    if (selectedTrigger.actions.some((action) => action.slot === selectedSlot)) return;
    setSelectedSlot(selectedTrigger.actions[0]?.slot ?? 0);
  }, [selectedTrigger?.id, selectedSlot, selectedTrigger]);
  const visibleScripts = useMemo(
    () => includeSelectedTrigger(filteredScripts, selectedTrigger, visibleScriptLimit),
    [filteredScripts, selectedTrigger, visibleScriptLimit]
  );
  const hiddenScriptCount = Math.max(0, filteredScripts.length - Math.min(filteredScripts.length, visibleScriptLimit));
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
  const selectedSlotEntity: SemanticEntity | undefined = undefined;
  const edcdUsageByRow = new Map(edcdUsages.map((usage) => [usage.rowId, usage]));
  const selectedEdcdUsageModel = selectedOption.edcdShape ? edcdUsageByRow.get(Math.max(0, selectedDraft.id)) ?? null : null;
  const selectedEdcdUsage: SelectedEdcdUsage | undefined = selectedEdcdUsageModel
    ? edcdUsageToEditorUsage(selectedEdcdUsageModel, selectedOption.edcdShape)
    : undefined;
  const triggerDiagnostics = selectedTrigger ? visibleDiagnosticsById.get(selectedTrigger.id) ?? [] : [];
  const selectedSlotDiagnostics = useMemo(
    () => selectedTrigger
      ? validateActionDraft(project, selectedTrigger, selectedSlot, selectedDraft.rawCode, selectedDraft.id, catalog)
      : [],
    [project, selectedTrigger, selectedSlot, selectedDraft.rawCode, selectedDraft.id, catalog]
  );
  const selectedEdcdRowId = selectedOption.edcdShape ? Math.max(0, selectedDraft.id) : null;
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
            onSelectEntity(selectEntityFromId(triggerSelectionId(trigger)));
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
  const selectedExtraActionClassification = selectedTrigger && isMacro ? authorFacingExtraActionKind(extraActionPointClassification(project, selectedTrigger)) : "Action Point";
  const selectedExtraActionEvidence = selectedTrigger && isMacro ? extraActionEvidenceSummary(project, selectedTrigger) : null;
  const selectedEd3Reachability = selectedTrigger && isMacro ? ed3ReachabilityFor(project, selectedTrigger.recordIndex) ?? null : null;
  const deleteMacroLabel = selectedExtraActionClassification === "Global Event" ? "Delete Global Event" : "Delete Extra Action Point";
  const moveMapKey = selectedTrigger && !isMacro && selectedTrigger.levelType && selectedTrigger.levelIndex != null
    ? `${selectedTrigger.levelType}:${selectedTrigger.levelIndex}`
    : "";
  const issueCounts = issueCountsBySlot(triggerDiagnostics);
  const setSelectedDraft = (values: { rawCode: number; id: number }) => setDraft((current) => ({ ...current, [selectedKey]: values }));
  const moveSelectedStep = (toSlot: number) => {
    if (!selectedTrigger || toSlot < 0 || toSlot > 7 || toSlot === selectedSlot) return;
    const fromKey = `${selectedTrigger.id}:${selectedSlot}`;
    const toKey = `${selectedTrigger.id}:${toSlot}`;
    setDraft((current) => {
      const next = { ...current };
      const fromDraft = next[fromKey];
      const toDraft = next[toKey];
      if (fromDraft) next[toKey] = fromDraft;
      else delete next[toKey];
      if (toDraft) next[fromKey] = toDraft;
      else delete next[fromKey];
      return next;
    });
    setSelectedSlot(toSlot);
    onApplyCommand?.({ kind: "swapActionSlots", label: "Move step", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot });
  };
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
  const targetRecordType = realmzScriptStepDescriptorFor(selectedDraft.rawCode).targetType;
  const selectedDraftTargetId = resolveSignedMessageTarget(selectedDraft.rawCode, selectedDraft.id);
  const directTargetDrawerAvailable = Boolean(targetRecordType);
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
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move step up" disabled={selectedSlot === 0} onClick={() => moveSelectedStep(selectedSlot - 1)}>
        <ArrowUp size={12} />
      </button>
      <button type="button" className="btn btn-secondary btn-xs icon-only" title="Move step down" disabled={selectedSlot === 7} onClick={() => moveSelectedStep(selectedSlot + 1)}>
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
        title={directTargetDrawerAvailable ? targetDrawerOpen ? "Hide target record editor" : "Edit the selected target record" : "This action does not have an inline target record editor."}
        disabled={!directTargetDrawerAvailable}
        onClick={() => directTargetDrawerAvailable && setTargetDrawerOpen(!targetDrawerOpen)}
      >
        Edit Target
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
      selectedRowUsage={selectedEdcdUsageModel}
      edcdUsages={edcdUsages}
      selectedTriggerId={selectedTrigger.id}
      selectedEdcdRowId={selectedEdcdRowId}
      selectedSlotEntity={selectedSlotEntity}
      selectedSlotDiagnostics={selectedSlotDiagnostics}
      categoryFilter={categoryFilter}
      opcodeQuery={opcodeQuery}
      filteredDefinitions={filteredDefinitions}
      desktopRuntime={desktopRuntime}
      projectDir={projectDir}
      workspaceDir={workspaceDir}
      onSetCategoryFilter={setCategoryFilter}
      onSetOpcodeQuery={setOpcodeQuery}
      onSetSelectedDraft={setSelectedDraft}
      onSelectEntity={onSelectEntity}
      onOpenTool={onOpenTool}
      onApplyCommand={onApplyCommand}
    />
  ) : null;
  const targetEditorPanel = selectedTrigger && targetDrawerOpen && directTargetDrawerAvailable ? (
    <PanelSection title="Edit Target Record" eyebrow="selected step" density="compact" className={`script-target-drawer${wideTargetRecord ? " wide-target" : ""}`} actions={<button type="button" className="btn btn-secondary btn-xs icon-only" title="Hide target record editor" onClick={() => setTargetDrawerOpen(false)}><X size={12} /></button>}>
      <p className="field-help">
        <TutorialTip title="Edit Target Record" body={TARGET_DRAWER_HELP} side="below">
          <span>Edit the record selected by this step.</span>
        </TutorialTip>
      </p>
      <TargetRecordEditor
        key={`${targetRecordType}:${selectedDraft.rawCode}:${selectedDraftTargetId}`}
        project={project}
        catalog={catalog}
        opcode={selectedDraft.rawCode}
        targetId={selectedDraftTargetId}
        desktopRuntime={desktopRuntime}
        projectDir={projectDir}
        workspaceDir={workspaceDir}
        onSelectEntity={onSelectEntity}
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
      <header className="settings-rows-header">
        <div>
          <TutorialTip title="Scripts Workbench" body={SCRIPT_WORKBENCH_HELP} side="below">
            <strong>{scriptPanelTitle(activeEditor)}</strong>
          </TutorialTip>
          <small>Build scenario behavior from clear steps, targets, choices, and Extra Action Points.</small>
        </div>
        <div className="script-toolbar">
          {(activeTabKind === "action-points" || activeTabKind === "reusable-actions") && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "createMacro", label: "Create Extra Action Point" })}>
              <Plus size={12} /> Extra Action Point
            </button>
          )}
          {selectedTrigger && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}>
              <Copy size={12} /> Duplicate
            </button>
          )}
        </div>
      </header>
      {selectedMap && activeTabKind === "action-points" && (
        <div className="script-create-strip">
          <label>
            <TutorialTip title="New Action Point" body={CREATE_AP_HELP} side="below">
              <span>New Action Point</span>
            </TutorialTip>
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
            <small className="script-capacity-note">
              <TutorialTip title="Inventory Filters" body={INVENTORY_FILTER_HELP} side="below">
                <span>Choose the inventory slice before editing or release-checking scripts.</span>
              </TutorialTip>
            </small>
            <div className="script-list-scope script-filter-chips" role="group" aria-label="Script inventory filter">
              {visibleInventoryFilters.map((filter) => (
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
          {activeTabKind === "advanced-imports" && (
            <div className="script-tab-note">
              <strong>{scripts.length.toLocaleString()} unlinked Extra Action Point(s)</strong>
              <small>These Extra Action Points are preserved with the scenario, but Providence has not identified a normal call path for them yet. Use the ED3 filters to separate likely padding, runtime residue, orphan authored-looking rows, and rows that need runtime tracing.</small>
            </div>
          )}
          </div>
          <ScrollArea className="realmz-script-list" aria-label="Action Points and Extra Action Points">
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
                {inventoryFilter === "warnings" && !warningScanReady ? "Scanning warnings..." : "No scripts match this view."}
              </div>
            )}
            {hiddenScriptCount > 0 && (
              <button
                className="script-list-more-button"
                type="button"
                onClick={() => setVisibleScriptLimit((value) => Math.min(filteredScripts.length, value + 180))}
              >
                Show {Math.min(180, hiddenScriptCount).toLocaleString()} more
              </button>
            )}
          </ScrollArea>
        </div>
        <div className="realmz-script-form">
          {selectedTrigger ? (
            <>
              <div className="script-record-header">
                <label className="script-name-field">
                  <TutorialTip title="Selected Script Record" body={SCRIPT_RECORD_HELP} side="below">
                    <span>Name</span>
                  </TutorialTip>
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
                  <TutorialTip title={isMacro ? "Delete Extra Action Point" : "Clear Action Point"} body={CLEAR_SCRIPT_HELP} side="below">
                    <button className="btn btn-danger btn-xs" type="button" title={isMacro ? "Delete this Extra Action Point" : "Clear this Action Point record so it can be reused"} onClick={() => onApplyCommand?.({ kind: "deleteTrigger", label: isMacro ? deleteMacroLabel : "Clear Action Point", triggerId: selectedTrigger.id })}>
                      <Trash2 size={12} /> {isMacro ? deleteMacroLabel : "Clear Action Point"}
                    </button>
                  </TutorialTip>
                </div>
              </div>
              <ScriptDiagnostics issues={triggerDiagnostics.filter((issue) => issue.slot == null)} />
              {isMacro ? (
                <>
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
                </>
              ) : (
                <div className="script-header-grid">
                  <NumberField
                    label="% Chance"
                    value={selectedTrigger.percent}
                    onCommit={(percent) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action chance", triggerId: selectedTrigger.id, fields: { percent } })}
                  />
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
                  <NumberField
                    label="Cell X"
                    value={selectedTrigger.coordinate?.x ?? selectedTrigger.targetX ?? 0}
                    onCommit={(x) => moveSelectedActionPoint({ x })}
                  />
                  <NumberField
                    label="Cell Y"
                    value={selectedTrigger.coordinate?.y ?? selectedTrigger.targetY ?? 0}
                    onCommit={(y) => moveSelectedActionPoint({ y })}
                  />
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
              )}
              <div className="realmz-visual-script-scroll" aria-label="Script step authoring area">
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
                    <p className="field-help">
                      <TutorialTip title="Eight Step Slots" body={STEP_LIST_HELP} side="below">
                        <span>Each card is one ordered Realmz CODE/ID slot.</span>
                      </TutorialTip>
                    </p>
                    <ScrollArea className="realmz-step-list" aria-label="Script steps">
                      {Array.from({ length: 8 }, (_, slot) => {
                        const action = selectedTrigger.actions.find((candidate) => candidate.slot === slot);
                        const current = slotDraft(slot, action);
                        const option = actionOptionFor(current.rawCode);
                        const definition = scriptActionDefinitionFor(current.rawCode);
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
                              <small>{scriptActionSummary(project, catalog, current, actionSummary(action))}</small>
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
                    <ScriptFlowPreview project={project} catalog={catalog} trigger={selectedTrigger} onSelectEntity={onSelectEntity} />
                  </PanelSection>
                  {!floatingDetail && (
                    <PanelSection title="Current Step" eyebrow={`slot ${selectedSlot + 1} | ${selectedDefinition.category}`} actions={stepDetailActions}>
                      {stepDetailBody}
                    </PanelSection>
                  )}
                  {!floatingDetail && targetEditorPanel}
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
  const selectedThread = model.threads.find((thread) => thread.id === selectedThreadId) ?? null;
  const selectedQuest = selectedQuestId == null ? null : model.questById.get(selectedQuestId) ?? null;
  const threadQuests = selectedThread ? selectedThread.questIds.map((id) => model.questById.get(id)).filter(Boolean) as QuestFlagModel[] : [];
  const activeUses = selectedThread
    ? threadQuests.flatMap((quest) => quest.uses.map((usage) => ({ ...usage, questLabel: quest.label }))).sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    : selectedQuest?.uses.map((usage) => ({ ...usage, questLabel: selectedQuest.label })) ?? [];

  useEffect(() => {
    if (selectedThreadId && !model.threads.some((thread) => thread.id === selectedThreadId)) setSelectedThreadId(null);
    if (selectedQuestId != null && !model.questById.has(selectedQuestId)) setSelectedQuestId(null);
    if (!selectedThreadId && selectedQuestId == null) {
      if (model.quests[0]) setSelectedQuestId(model.quests[0].id);
      else if (model.threads[0]) setSelectedThreadId(model.threads[0].id);
    }
  }, [model.threads, model.quests, model.questById, selectedQuestId, selectedThreadId]);

  const createThread = () => {
    onApplyCommand?.({ kind: "createQuestThread", label: "Create author note", name: `Author Note ${model.threads.length + 1}` });
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
          <small>Realmz stores raw quest flags, counters, and branches. Providence shows where flags are set, tested, cleared, incremented, and used.</small>
        </div>
        <div className="script-toolbar">
          <button type="button" className="btn btn-secondary btn-xs" onClick={createThread}>
            <Plus size={12} /> Author Note
          </button>
        </div>
      </header>
      <div className="quest-workbench-layout">
        <aside className="quest-thread-column">
          <PanelSection title="Raw Divinity Quest Flags" eyebrow={`${model.quests.length} known`} density="compact" className="quest-raw-panel">
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
          <PanelSection title="Optional Author Notes" eyebrow={`${model.threads.length} saved`} density="compact">
            {model.threads.length === 0 ? (
              <div className="script-tab-note">
                <strong>No author notes yet</strong>
                <small>Create a note if you want to group raw flags or document story meaning for this project.</small>
              </div>
            ) : (
              <div className="quest-card-list">
                {model.threads.map((thread) => (
                  <div key={thread.id} className={`quest-thread-card${thread.id === selectedThread?.id ? " selected" : ""}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedThreadId(thread.id);
                        setSelectedQuestId(null);
                      }}
                    >
                      <strong>{thread.name}</strong>
                      <small>{thread.source === "bundled" ? "Read-only imported note" : `${thread.questIds.length} flag${thread.questIds.length === 1 ? "" : "s"}`}</small>
                    </button>
                    {thread.source !== "bundled" && (
                      <button type="button" className="btn btn-danger btn-xs icon-only" title="Delete note" onClick={() => onApplyCommand?.({ kind: "deleteQuestThread", label: "Delete author note", threadId: thread.id })}>
                        <Trash2 size={12} />
                      </button>
                    )}
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
      <PanelSection title="Author Note" eyebrow={`${thread.questIds.length} flags`} density="compact">
        {thread.source === "bundled" ? (
          <div className="known-thread-summary">
            <strong>{thread.name}</strong>
            <small>{thread.description}</small>
            <span>This imported note is read-only. Create a project author note if you want editable interpretation.</span>
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
  onApplyCommand
}: {
  quest: QuestFlagModel;
  threads: QuestThread[];
  uses: Array<QuestUsage & { questLabel: string }>;
  onOpenUsage: (entity: SelectedEntity) => void;
  onAddToThread: (thread: QuestThread) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
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
      <PanelSection title="Add To Author Note" eyebrow={`${threads.length} saved`} density="compact">
        <div className="quest-add-grid">
          {threads.filter((thread) => !thread.questIds.includes(quest.id)).map((thread) => (
            <button key={thread.id} type="button" className="btn btn-secondary btn-xs" onClick={() => onAddToThread(thread)}>
              <Plus size={11} /> {thread.name}
            </button>
          ))}
          {threads.length === 0 && <small className="empty-copy compact">Create an author note first.</small>}
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

function Ed3EvidenceDetails({ row }: { row: Ed3ReachabilityRow | null }) {
  if (!row) {
    return (
      <div className="ed3-evidence-details">
        <strong>ED3 Evidence</strong>
        <small>No semantic reachability row is available for this imported Extra Action Point.</small>
      </div>
    );
  }
  const rawSignature = row.rawSignature.length > 0 ? row.rawSignature.join(", ") : "empty";
  const evidence = row.evidence.length > 0 ? row.evidence.join(", ") : "none";
  return (
    <div className="ed3-evidence-details">
      <header>
        <strong>ED3 Evidence</strong>
        <span>{row.reachable ? "source-backed" : "not source-reachable"}</span>
      </header>
      <div className="ed3-evidence-grid">
        <FieldRow label="Classification" value={row.classification} />
        <FieldRow label="Root Type" value={row.rootType ?? "none"} />
        <FieldRow label="Incoming Refs" value={row.incomingRefs} />
        <FieldRow label="Occupied Steps" value={row.actionCount} />
        <FieldRow label="Raw Signature" value={rawSignature} />
        <FieldRow label="Evidence" value={evidence} />
      </div>
      <small>{row.promotionRule}</small>
    </div>
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
    onApplyCommand?.({ kind: "updateEdcdRow", label: `Duplicate settings ${selectedUsage.rowId}`, rowId: nextId, values: selectedUsage.values });
    setSelectedRowId(nextId);
  };
  const createRow = () => {
    const nextId = selectedUsage && !selectedUsage.exists ? selectedUsage.rowId : nextUnusedEdcdRowId(project);
    const values = normalizeEdcdValues(selectedUsage?.exists ? selectedUsage.values : selectedTemplate.defaultDraft.parameters);
    onApplyCommand?.({ kind: "updateEdcdRow", label: `Create settings ${nextId}`, rowId: nextId, values });
    setSelectedRowId(nextId);
  };

  return (
    <section className="settings-rows-workbench">
      <header>
        <div>
          <TutorialTip title="Settings Rows" body={SETTINGS_HELP} side="below">
            <strong>Settings Rows</strong>
          </TutorialTip>
          <small>Inspect, reuse, repair, and document the sidecar settings used by EDCD-backed actions.</small>
        </div>
        <div className="script-toolbar">
          <button type="button" className="btn btn-secondary btn-xs" onClick={createRow}>
            <Plus size={12} /> Create Row From Template
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
              placeholder="Filter settings rows..."
            />
            <div className="script-list-scope script-filter-chips" role="group" aria-label="Settings row filter">
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
          <ScrollArea className="settings-row-list" aria-label="Settings rows">
            {filteredUsages.map((usage) => (
              <button
                key={usage.rowId}
                type="button"
                className={`settings-row-card${usage.rowId === selectedUsage?.rowId ? " selected" : ""} ${edcdUsageStatusTone(usage.status)}`}
                onClick={() => setSelectedRowId(usage.rowId)}
              >
                <span>
                  <strong>Settings Row {usage.rowId}</strong>
                  <small>{usage.summary}</small>
                </span>
                <b>{usage.statusLabel}</b>
                <small>{usage.callers.length} caller{usage.callers.length === 1 ? "" : "s"}{usage.primaryShape ? ` | ${usage.primaryShape}` : ""}</small>
              </button>
            ))}
            {filteredUsages.length === 0 && <EmptyState compact title="No settings rows" body="No rows match this filter." />}
          </ScrollArea>
        </aside>
        <main className="settings-row-detail">
          {selectedUsage ? (
            <PanelSection
              title={`Settings Row ${selectedUsage.rowId}`}
              eyebrow={selectedUsage.statusLabel}
              density="compact"
              actions={
                <>
                  <button type="button" className="btn btn-secondary btn-xs" onClick={duplicateRow} disabled={!selectedUsage.exists}>
                    <Copy size={12} /> Duplicate Row
                  </button>
                  <button type="button" className="btn btn-danger btn-xs" disabled={!canDelete} title={canDelete ? "Delete this unused settings row." : "Only unused rows can be deleted here."} onClick={() => onApplyCommand?.({ kind: "deleteEdcdRow", label: `Delete settings ${selectedUsage.rowId}`, rowId: selectedUsage.rowId })}>
                    <Trash2 size={12} /> Delete Unused Row
                  </button>
                </>
              }
            >
              <div className="settings-row-overview">
                <div className={`settings-row-status ${edcdUsageStatusTone(selectedUsage.status)}`}>
                  <strong>{selectedUsage.statusLabel}</strong>
                  <span>{selectedUsage.exists ? "Stored in project settings rows." : "Referenced by a script but not created yet."}</span>
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
                selectedSlotLabel="settings row"
                onSelectEntity={onSelectEntity}
                onOpenText={(editor) => onOpenTool?.("text", editor)}
                onApplyCommand={onApplyCommand}
              />
            </PanelSection>
          ) : (
            <EmptyState title="No settings rows yet" body="Create a settings row from a template or add an EDCD-backed action to a script." />
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
  const edcdUsage = selectedSlotEntity?.summary.edcdUsage as { summary?: string; rowId?: number; shape?: string } | undefined;
  const count = [
    trigger.source,
    selectedSlotEntity?.id,
    selectedEdcdRowId != null ? `edcd:${selectedEdcdRowId}` : null
  ].filter(Boolean).length;
  return (
    <CollapsibleSection title="Technical Details" eyebrow="advanced" count={String(count)} density="compact" storageKey="scripts.sourceEvidence.open" defaultOpen={false}>
      <p className="field-help">
        <TutorialTip title="Technical Details" body={TECHNICAL_DETAILS_HELP} side="below">
          <span>Raw storage, CODE/ID, EDCD row, dispatcher status, and semantic links.</span>
        </TutorialTip>
      </p>
      <SourceEvidenceDetails
        project={project}
        trigger={trigger}
        triggerEntityIdValue={triggerEntityIdValue}
        selectedSlot={selectedSlot}
        selectedAction={selectedAction}
        selectedDraft={selectedDraft}
        selectedOption={selectedOption}
        selectedSlotEntity={selectedSlotEntity}
        selectedEdcdRowId={selectedEdcdRowId}
        edcdUsage={edcdUsage}
        onSelectEntity={onSelectEntity}
      />
    </CollapsibleSection>
  );
}

function SourceEvidenceDetails({
  project,
  trigger,
  triggerEntityIdValue,
  selectedSlot,
  selectedAction,
  selectedDraft,
  selectedOption,
  selectedSlotEntity,
  selectedEdcdRowId,
  edcdUsage,
  onSelectEntity
}: {
  project: Project;
  trigger: TriggerRecord;
  triggerEntityIdValue: string;
  selectedSlot: number;
  selectedAction?: Action;
  selectedDraft: { rawCode: number; id: number };
  selectedOption: ReturnType<typeof actionOptionFor>;
  selectedSlotEntity?: SemanticEntity;
  selectedEdcdRowId: number | null;
  edcdUsage?: { summary?: string; rowId?: number; shape?: string };
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const semanticSlotEntity = useMemo(
    () => actionSlotEntitiesForTriggerRecord(project, trigger).find((entity) => Number(entity.summary.slot) === selectedSlot),
    [project, trigger, selectedSlot]
  );
  const resolvedSlotEntity = selectedSlotEntity ?? semanticSlotEntity;
  const resolvedEdcdUsage = (edcdUsage ?? resolvedSlotEntity?.summary.edcdUsage) as { summary?: string; rowId?: number; shape?: string } | undefined;
  const triggerLinks = linksFor(project, triggerEntityIdValue);
  const slotLinks = linksFor(project, resolvedSlotEntity?.id ?? null);
  return (
    <div className="script-source-evidence">
      <div className="realmz-raw-preview">
        <FieldRow label="Script Source" value={trigger.source} />
        <FieldRow label="Script Entity" value={triggerEntityIdValue} />
        <FieldRow label="Record Index" value={trigger.recordIndex} />
        <FieldRow label="Door ID" value={trigger.doorid} />
        <FieldRow label="Map" value={trigger.levelType != null ? `${trigger.levelType} ${trigger.levelIndex ?? 0}` : "Extra Action Point"} />
        <FieldRow label="Coordinate" value={trigger.coordinate ? `${trigger.coordinate.x}, ${trigger.coordinate.y}` : "none"} />
        <FieldRow label="Selected Slot" value={selectedSlot} />
        <FieldRow label="Slot Entity" value={resolvedSlotEntity?.id ?? "draft-only"} />
        <FieldRow label="Applied CODE/ID" value={selectedAction ? `${selectedAction.rawCode} / ${selectedAction.id}` : "empty"} />
        <FieldRow label="Draft CODE/ID" value={`${selectedDraft.rawCode} / ${selectedDraft.id}`} />
        <FieldRow label="Opcode" value={selectedOption.label} />
        <FieldRow label="Dispatcher" value={isDispatcherNoopOpcode(selectedDraft.rawCode) ? "dispatcher no-op; Realmz ignores this CODE" : "has documented dispatcher behavior"} />
        <FieldRow label="Settings Row" value={selectedEdcdRowId != null ? `row ${selectedEdcdRowId}${resolvedEdcdUsage?.shape ? ` (${resolvedEdcdUsage.shape})` : ""}` : "none"} />
        <FieldRow label="Edit State" value={resolvedSlotEntity?.editState ?? "authored/draft"} />
      </div>
      {resolvedEdcdUsage?.summary && <p className="field-help">{resolvedEdcdUsage.summary}</p>}
      <EvidenceLinkGroup title="Script Links" project={project} links={[...triggerLinks.outgoing, ...triggerLinks.incoming]} onSelectEntity={onSelectEntity} />
      <EvidenceLinkGroup title="Slot Links" project={project} links={[...slotLinks.outgoing, ...slotLinks.incoming]} onSelectEntity={onSelectEntity} />
    </div>
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
  trigger,
  onSelectEntity
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  trigger: TriggerRecord;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const flowSteps = trigger.actions
    .filter((action) => action.rawCode !== 0)
    .sort((a, b) => a.slot - b.slot)
    .map((action) => ({
      action,
      definition: scriptActionDefinitionFor(action.rawCode),
      routes: scriptStepFlowRoutes(project, catalog, { rawCode: action.rawCode, id: action.id }),
      summary: scriptActionSummary(project, catalog, { rawCode: action.rawCode, id: action.id })
    }))
    .filter((step) => step.routes.length > 0 || step.definition.category === "Extra Action Points" || step.definition.category === "Choices" || step.definition.category === "Logic");
  if (flowSteps.length === 0) return null;
  return (
    <div className="script-flow-preview" aria-label="Branch and Extra Action Point preview">
      <TutorialTip title="Flow Preview" body={FLOW_PREVIEW_HELP} side="below">
        <strong>Flow Preview</strong>
      </TutorialTip>
      {flowSteps.slice(0, 5).map(({ action, definition, routes, summary }) => (
        <div key={`${action.slot}-${action.rawCode}-${action.id}`}>
          <span>{action.slot + 1}</span>
          <p>
            <b>{definition.shortLabel}</b>
            <small>{routes[0]?.target ? `${routes[0].label}: ${routes[0].target.label}` : routes[0]?.detail || summary}</small>
          </p>
          {routes[0]?.target && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onSelectEntity(selectEntityForFlowTarget(routes[0].target!))}>
              Open Target
            </button>
          )}
        </div>
      ))}
      {flowSteps.length > 5 && <small>{flowSteps.length - 5} more routed step(s)</small>}
    </div>
  );
}

function selectEntityForFlowTarget(target: { targetKind: string; value: number }): SelectedEntity {
  if (target.targetKind === "macro") return selectEntityFromId(`macro:${target.value}`);
  if (target.targetKind === "simpleEncounter") return selectEntityFromId(`encounter:simple:${target.value}`);
  if (target.targetKind === "complexEncounter") return selectEntityFromId(`encounter:complex:${target.value}`);
  if (target.targetKind === "thiefEncounter") return selectEntityFromId(`thief:${target.value}`);
  if (target.targetKind === "timedEncounter") return selectEntityFromId(`time:${target.value}`);
  if (target.targetKind === "message" || target.targetKind === "scrollingText") return selectEntityFromId(`message:${target.value}`);
  if (target.targetKind === "treasure") return selectEntityFromId(`treasure:${target.value}`);
  if (target.targetKind === "shop") return selectEntityFromId(`shop:${target.value}`);
  if (target.targetKind === "monster") return selectEntityFromId(`monster:${target.value}`);
  if (target.targetKind === "battle") return selectEntityFromId(`battle:${target.value}`);
  if (target.targetKind === "mapRecord") return selectEntityFromId(`map-record:${target.value}`);
  if (target.targetKind === "item") return selectEntityFromId(`item:${target.value}`);
  return selectEntityFromId(`${target.targetKind}:${target.value}`);
}

function humanActionValueLabel(label: string) {
  const clean = label.replace(/\bID\b/g, "Value").replace(/\bNumber\b/g, "Value").replace(/\s+/g, " ").trim();
  return clean && clean !== "Value" ? clean : "Value";
}

function actionAuthoringStateLabel(definition: ScriptActionDefinition) {
  if (definition.opcode === 121) return "Macro-only imported action";
  if (definition.opcode === 84) return "Manual/source discrepancy";
  if (definition.shortLabel === "Inert Imported Action") return "Inert imported action";
  if (definition.validationPosture === "no-effect") return "Preserve-only / no normal effect";
  if (definition.authoringLevel === "first-class") return "Friendly editor";
  if (definition.authoringLevel === "guided") return "Guided settings editor";
  if (definition.authoringLevel === "advanced") return "Unmodeled action";
  return "Empty step";
}

function actionAuthoringStateDetail(definition: ScriptActionDefinition) {
  if (definition.opcode === 121) {
    return "Realmz source performs this only during combat. Ordinary AP imports are preserved here and are not routine Action Point authoring backlog; use monster or battle macro surfaces for intentional authoring.";
  }
  if (definition.opcode === 84) {
    return "Divinity/manual material says this is not used, while Realmz Revisited contains a registration-check case. Providence preserves it until classic behavior is verified.";
  }
  if (definition.shortLabel === "Inert Imported Action") {
    return "This is a documented Not Used opcode. Providence keeps the imported CODE/ID value, but it is not normal authoring behavior.";
  }
  if (definition.validationPosture === "no-effect") {
    return "Realmz does not expose normal runtime behavior for this dispatcher row. Providence preserves the stored CODE/ID values, but routine authoring is disabled.";
  }
  if (definition.authoringLevel === "first-class") {
    return "Providence knows the target type and can edit this as normal scenario behavior.";
  }
  if (definition.authoringLevel === "guided") {
    return "Providence edits the attached settings row with named fields, while keeping the original row number and file storage intact.";
  }
  if (definition.authoringLevel === "advanced") {
    return "Providence recognizes and preserves the stored values, but this action does not yet have a complete friendly authoring form.";
  }
  return "Realmz skips empty slots.";
}

function actionStorageLabel(definition: ScriptActionDefinition) {
  if (definition.storage === "direct-code-id") return "Direct CODE / ID";
  if (definition.storage === "data-edcd-parameter-row") return "Settings row";
  if (definition.storage === "data-ed3-direct") return "Extra Action Point row";
  if (definition.storage === "same-map-action-point-copy") return "Same-map Action Point copy";
  return definition.storage;
}

function useTargetPreviewUrl(option: ScriptTargetOption | null, opcode: number, project: Project, desktopRuntime: boolean, projectDir: string, workspaceDir: string) {
  const code = normalizeStepOpcode(opcode);
  const resourceType = code === 9 ? "snd " : code === 27 ? targetPreviewResourceType(option) : null;
  return useResolvedPreviewUrl(
    resourceType ? option?.previewPath ?? option?.managedAsset?.previewPath ?? option?.libraryAsset?.previewPath ?? null : null,
    resourceType ? option?.managedAsset ?? null : null,
    resourceType ? option?.libraryAsset ?? null : null,
    { desktopRuntime, projectDir, workspaceDir, project, resourceType, resourceId: resourceType ? option?.value ?? null : null }
  );
}

function targetPreviewResourceType(option: ScriptTargetOption | null) {
  const managedType = option?.managedAsset?.resourceType?.trim();
  if (managedType) return managedType;
  const libraryType = option?.libraryAsset?.resourceType?.trim();
  if (libraryType) return libraryType;
  const entityId = option?.entity?.id ?? "";
  const match = entityId.match(/^resource:([^:]+):/);
  return match?.[1]?.trim() || "PICT";
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
  selectedRowUsage,
  edcdUsages,
  selectedTriggerId,
  selectedEdcdRowId,
  selectedSlotEntity,
  selectedSlotDiagnostics,
  categoryFilter,
  opcodeQuery,
  filteredDefinitions,
  desktopRuntime,
  projectDir,
  workspaceDir,
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
  selectedRowUsage?: EdcdRowUsage | null;
  edcdUsages: EdcdRowUsage[];
  selectedTriggerId: string;
  selectedEdcdRowId: number | null;
  selectedSlotEntity?: SemanticEntity;
  selectedSlotDiagnostics: ScriptDiagnostic[];
  categoryFilter: ScriptActionCategory;
  opcodeQuery: string;
  filteredDefinitions: ScriptActionDefinition[];
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  onSetCategoryFilter: (category: ScriptActionCategory) => void;
  onSetOpcodeQuery: (query: string) => void;
  onSetSelectedDraft: (values: { rawCode: number; id: number }) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [actionChooserOpen, setActionChooserOpen] = useState(false);
  const selectedDivinityHelp = divinityHelpForOpcode(selectedDraft.rawCode);
  const selectedIdLabel = selectedDefinition.target?.label ?? humanActionValueLabel(opcodeIdMeaning(selectedDraft.rawCode));
  const selectedDefaultEdcdValues = selectedDefinition.defaultDraft.parameters;
  const draftForNewDefinition = (definition: ScriptActionDefinition) => defaultDraftForProject(project, definition);
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
  const selectedTargetPreviewUrl = useTargetPreviewUrl(
    selectedTargetPreview,
    selectedDraft.rawCode,
    project,
    desktopRuntime,
    projectDir,
    workspaceDir
  );
  useEffect(() => {
    setPreviewExpanded(false);
  }, [selectedSlot, selectedDraft.rawCode, selectedDraft.id]);
  useEffect(() => {
    setActionChooserOpen(false);
  }, [selectedSlot]);
  const selectedFlowRoutes = useMemo(() => scriptStepFlowRoutes(project, catalog, selectedDraft), [catalog, project, selectedDraft]);
  const settingLabels = visibleParameters.map((parameter) => `${parameter.index + 1}. ${parameter.label}`);
  const previewBehavior = signedTargetBehaviorLabel(selectedDraft.rawCode, selectedDraft.id);
  const previewCanExpand = Boolean(
    selectedTargetPreview && [
      selectedTargetPreview.detail,
      selectedTargetPreview.summary,
      selectedTargetPreview.compatibility,
      selectedTargetPreview.sourceState,
      previewBehavior
    ].filter(Boolean).join(" ").length > 96
  ) || selectedFlowRoutes.length > 1;
  const isEdcdBackedStep = Boolean(selectedOption.edcdShape);
  const hasInlineTargetPicker = !isEdcdBackedStep && Boolean(targetPickerConfig(selectedDraft.rawCode));
  const edcdRowOptions = edcdUsages.filter((usage) => usage.exists || usage.callers.length > 0);
  const useActionDefinition = (definition: ScriptActionDefinition) => {
    onSetSelectedDraft(draftForNewDefinition(definition));
    setActionChooserOpen(false);
  };
  const duplicateSettingsForStep = () => {
    if (!isEdcdBackedStep) return;
    const nextId = nextUnusedEdcdRowId(project);
    const values = normalizeEdcdValues(selectedRowUsage?.values ?? selectedDefaultEdcdValues);
    onApplyCommand?.({ kind: "updateEdcdRow", label: `Duplicate settings ${selectedDraft.id}`, rowId: nextId, values });
    onSetSelectedDraft({ ...selectedDraft, id: nextId });
    if (selectedSlotApplied) {
      onApplyCommand?.({
        kind: "updateActionSlot",
        label: `Use settings ${nextId}`,
        triggerId: selectedTriggerId,
        slot: selectedSlot,
        rawCode: selectedDraft.rawCode,
        id: nextId
      });
    }
  };
  const settingsEditor = (isEdcdBackedStep || selectedEdcdUsage) ? (
    <CollapsibleSection title="Action Settings" eyebrow={isEdcdBackedStep ? "guided fields" : "optional"} density="compact" storageKey="scripts.edcdEditor.open" defaultOpen={Boolean(isEdcdBackedStep || selectedEdcdUsage)}>
      <EdcdRowEditor
        project={project}
        catalog={catalog}
        edcdUsage={selectedEdcdUsage}
        fallbackRowId={selectedDraft.id}
        fallbackShape={selectedOption.edcdShape}
        fallbackFieldNames={edcdFieldNamesForShape(selectedOption.edcdShape)}
        fallbackInitialValues={selectedDefaultEdcdValues}
        fallbackOpcode={selectedDraft.rawCode}
        parameterLabels={selectedParameterLabels}
        selectedSlotLabel={`step ${selectedSlot + 1}`}
        onSelectEntity={onSelectEntity}
        onOpenText={(editor) => onOpenTool?.("text", editor)}
        onApplyCommand={onApplyCommand}
      />
    </CollapsibleSection>
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
      <div className={`realmz-current-opcode${previewExpanded ? " expanded" : ""}`} style={{ borderColor: categoryColor(selectedOption.category) }}>
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
            {previewBehavior && <small>{previewBehavior}</small>}
            {normalizeStepOpcode(selectedDraft.rawCode) === 27 && selectedTargetPreviewUrl && (
              <button
                type="button"
                className="realmz-picture-preview-button"
                title="Picture preview"
                onClick={() => selectedTargetPreview?.entity && onSelectEntity(selectedTargetPreview.entity)}
              >
                <img src={selectedTargetPreviewUrl} alt={selectedTargetPreview.label} />
              </button>
            )}
            {normalizeStepOpcode(selectedDraft.rawCode) === 27 && !selectedTargetPreviewUrl && (
              <small className="realmz-preview-unavailable">Picture preview loading or unavailable for this PICT variant.</small>
            )}
            {normalizeStepOpcode(selectedDraft.rawCode) === 9 && (
              <button
                type="button"
                className="btn btn-secondary btn-xs realmz-sound-preview-button"
                disabled={!selectedTargetPreviewUrl}
                title={selectedTargetPreviewUrl ? "Play this sound preview." : "No playable preview is available for this sound."}
                onClick={() => selectedTargetPreviewUrl && playPreviewUrl(selectedTargetPreviewUrl)}
              >
                <Volume2 size={12} /> Play
              </button>
            )}
          </div>
        )}
        {selectedFlowRoutes.length > 0 && (
          <div className="script-step-route-preview">
            <span>Flow</span>
            {selectedFlowRoutes.map((route, index) => (
              <p key={`${route.kind}-${index}`}>
                <b>{route.label}</b>
                <small>{route.target ? `${route.target.label}: ${route.target.detail}` : route.detail}</small>
              </p>
            ))}
          </div>
        )}
        {previewCanExpand && (
          <button type="button" className="btn btn-secondary btn-xs realmz-preview-toggle" onClick={() => setPreviewExpanded((current) => !current)}>
            {previewExpanded ? "Collapse Preview" : "Show Full Preview"}
          </button>
        )}
      </div>
      <div className="realmz-step-form-grid">
        <div className={`script-required-field realmz-step-action-field current-action-field${hasInlineTargetPicker ? " wide" : ""}`}>
          <span>Action</span>
          <div className="current-action-choice">
            <div>
              <strong>{selectedDefinition.label}</strong>
              <small>{selectedDefinition.description}</small>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setActionChooserOpen((current) => !current)}
            >
              {selectedDraft.rawCode === 0 ? "Choose Action" : "Change Action"}
            </button>
          </div>
        </div>
        {isEdcdBackedStep ? (
          <div className="script-required-field realmz-step-id-field settings-row-field">
            <span>{selectedDefinition.target?.label ?? selectedIdLabel}</span>
            <div className={`settings-row-current ${selectedRowUsage ? edcdUsageStatusTone(selectedRowUsage.status) : "warning"}`}>
              <strong>Settings row {selectedDraft.id}</strong>
              <small>{selectedRowUsage?.summary ?? "Will create this settings row when values are applied."}</small>
            </div>
            <details className="settings-row-selector">
              <summary>Advanced Row</summary>
              <div className="settings-row-selector-body">
                <select
                  value={selectedDraft.id}
                  onChange={(event) => onSetSelectedDraft({ ...selectedDraft, id: Number(event.currentTarget.value) })}
                >
                  {!edcdRowOptions.some((usage) => usage.rowId === selectedDraft.id) && <option value={selectedDraft.id}>Settings row {selectedDraft.id}</option>}
                  {edcdRowOptions.map((usage) => (
                    <option key={usage.rowId} value={usage.rowId}>
                      Row {usage.rowId} - {usage.statusLabel} - {usage.primaryActionLabel ?? usage.primaryShape ?? "raw settings"}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={selectedDraft.id}
                  onChange={(event) => onSetSelectedDraft({ ...selectedDraft, id: Number(event.currentTarget.value) })}
                  aria-label={`Slot ${selectedSlot} settings row`}
                />
              </div>
              <small>Existing imports keep their row number. New actions start on an unused row automatically.</small>
            </details>
          </div>
        ) : hasInlineTargetPicker ? null : (
          <label className="script-required-field realmz-step-id-field">
            <span>{selectedDefinition.target?.label ?? selectedIdLabel}</span>
            <input
              type="number"
              value={selectedDraft.id}
              onChange={(event) => onSetSelectedDraft({ ...selectedDraft, id: Number(event.currentTarget.value) })}
              aria-label={`Slot ${selectedSlot} ${selectedIdLabel}`}
            />
            <small>{selectedDefinition.target?.help || selectedDefinition.description}</small>
          </label>
        )}
      </div>
      {actionChooserOpen && (
        <div className="script-action-chooser" role="dialog" aria-label="Choose action for selected step">
          <header>
            <div>
              <TutorialTip title="Choose Action" body={ACTION_CHOOSER_HELP} side="below">
                <strong>{selectedDraft.rawCode === 0 ? "Choose Action" : "Change Action"}</strong>
              </TutorialTip>
              <small>This changes the selected step draft. Use Apply Step when you are ready.</small>
            </div>
            <button type="button" className="btn btn-secondary btn-xs icon-only" title="Close action chooser" onClick={() => setActionChooserOpen(false)}>
              <X size={12} />
            </button>
          </header>
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
            <div className="realmz-step-picker-grid action-chooser-grid">
              {filteredDefinitions.map((definition) => (
                <button
                  key={definition.opcode}
                  type="button"
                  className={selectedDraft.rawCode === definition.opcode ? "selected" : ""}
                  onClick={() => useActionDefinition(definition)}
                >
                  <strong>{definition.shortLabel}</strong>
                  <span>{definition.summary}</span>
                  <small>{selectedDraft.rawCode === definition.opcode ? "Current action" : "Use For This Step"}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {isEdcdBackedStep && selectedRowUsage?.warnings.map((warning) => (
        <p key={warning} className="field-warning">{warning}</p>
      ))}
      {isEdcdBackedStep && selectedRowUsage?.status === "shared" && (
        <button type="button" className="btn btn-secondary btn-xs duplicate-settings-button" onClick={duplicateSettingsForStep}>
          <Copy size={12} /> Duplicate Settings For This Step
        </button>
      )}
      {isEdcdBackedStep ? settingsEditor : null}
      {hasInlineTargetPicker && (
        <>
          <p className="field-help">
            <TutorialTip title="Target Picker" body={TARGET_PICKER_HELP} side="below">
              <span>{selectedDefinition.target?.help || selectedDefinition.description}</span>
            </TutorialTip>
          </p>
          <TargetPicker
            project={project}
            catalog={catalog}
            opcode={selectedDraft.rawCode}
            value={selectedDraft.id}
            previewContext={{ desktopRuntime, projectDir, workspaceDir }}
            onChange={(id) => onSetSelectedDraft({ ...selectedDraft, id })}
            onInspect={onSelectEntity}
            onCreate={(recordType, id) => {
              const targetId = id ?? nextAuthorableTargetId(project, recordType);
              onApplyCommand?.({ kind: "createTargetRecord", label: `Create ${recordType}`, recordType, id: targetId });
              onSetSelectedDraft({ ...selectedDraft, id: signedTargetValueForSelection(selectedDraft.rawCode, selectedDraft.id, targetId) });
            }}
          />
        </>
      )}
      {!isEdcdBackedStep ? settingsEditor : null}
      <CollapsibleSection title="Step Reference" eyebrow="technical details" density="compact" storageKey="scripts.stepReference.open" defaultOpen={false}>
        <p className="field-help">
          <TutorialTip title="Step Reference" body={STEP_REFERENCE_HELP} side="below">
            <span>Raw storage and original reference wording for this selected step.</span>
          </TutorialTip>
        </p>
        <div className="realmz-raw-preview">
          <FieldRow label="Opcode" value={selectedDefinition.label} />
          <FieldRow label="Authoring State" value={`${actionAuthoringStateLabel(selectedDefinition)} - ${actionAuthoringStateDetail(selectedDefinition)}`} />
          <FieldRow label="Storage" value={actionStorageLabel(selectedDefinition)} />
          <FieldRow label="Export Behavior" value="Unchanged values are preserved on export. Edits update the same classic Realmz fields Providence already imports." />
          <FieldRow label="CODE / ID" value={`${selectedDraft.rawCode} / ${selectedDraft.id}`} />
          <FieldRow label="Target Meaning" value={selectedDefinition.target?.help || selectedDefinition.description || "No direct target required."} />
          {settingLabels.length > 0 && (
            <FieldRow label="Settings Fields" value={settingLabels.join("; ")} />
          )}
          {selectedEdcdRowId != null && <FieldRow label="Settings Row" value={selectedEdcdRowId} />}
          {selectedDivinityHelp?.use && <FieldRow label="Divinity Use" value={selectedDivinityHelp.use} />}
          {selectedDivinityHelp?.options && selectedDivinityHelp.options.toLowerCase() !== "none" && (
            <FieldRow label="Divinity Options" value={selectedDivinityHelp.options} />
          )}
          {selectedDivinityHelp?.extraCodes && selectedDivinityHelp.extraCodes.toLowerCase() !== "none" && (
            <FieldRow label="Divinity E-Codes" value={selectedDivinityHelp.extraCodes} />
          )}
        </div>
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
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  opcode: number;
  targetId: number;
  recordType?: RealmzTargetRecordKind;
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  onSelectEntity?: (entity: SelectedEntity) => void;
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
              key={`message:${targetId}`}
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
              desktopRuntime={desktopRuntime}
              projectDir={projectDir}
              workspaceDir={workspaceDir}
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
        help={SIMPLE_ENCOUNTER_SOURCE_HELP}
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
            onSelectEntity={onSelectEntity}
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
        help={COMPLEX_ENCOUNTER_SOURCE_HELP}
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
            actionResult={record.actionResult}
            wordResult={record.wordResult}
            groups={record.groups}
            spellIds={record.spellIds}
            spellResults={record.spellResults}
            itemIds={record.itemIds}
            itemResults={record.itemResults}
            choiceResults={record.choiceResults}
            wordResults={record.wordResults}
            thief={record.thief}
            thiefSuccess={record.thiefSuccess}
            thiefFail={record.thiefFail}
            actions={record.actions}
            catalog={catalog}
            onSelectEntity={onSelectEntity}
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
        help={TIMED_ENCOUNTER_SOURCE_HELP}
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
        help={ROGUE_ENCOUNTER_SOURCE_HELP}
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
  help,
  children
}: {
  title: string;
  badge: string;
  exists: boolean;
  onCreate: () => void;
  onClear?: () => void;
  issues?: ScriptDiagnostic[];
  help?: string;
  children: ReactNode;
}) {
  return (
    <div className="script-inline-target-editor">
      <header>
        {help ? (
          <TutorialTip title={title} body={help} side="below">
            <strong>{title}</strong>
          </TutorialTip>
        ) : (
          <strong>{title}</strong>
        )}
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
  actionResult = 0,
  wordResult = 0,
  groups = [],
  spellIds = [],
  spellResults = [],
  itemIds = [],
  itemResults = [],
  choiceResults,
  wordResults,
  thief,
  thiefSuccess,
  thiefFail,
  actions,
  catalog,
  onSelectEntity,
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
  actionResult?: number;
  wordResult?: number;
  groups?: number[];
  spellIds?: number[];
  spellResults?: number[];
  itemIds?: number[];
  itemResults?: number[];
  choiceResults: number[];
  wordResults?: number[];
  thief?: boolean;
  thiefSuccess?: number;
  thiefFail?: number;
  actions: EncounterActionRow[];
  onSelectEntity?: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Record<string, unknown>) => {
    if (recordKind === "simple") {
      onApplyCommand?.({ kind: "updateSimpleEncounterRecord", label: "Update simple encounter", id, changes });
    } else {
      onApplyCommand?.({ kind: "updateComplexEncounterRecord", label: "Update complex encounter", id, changes });
    }
  };
  const [selectedResultIndex, setSelectedResultIndex] = useState<number | null>(null);
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
    wordResults,
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
    wordResult,
    wordResults
  ]);
  const addVisibleResult = (resultIndex: number) => {
    const messageId = nextAuthorableTargetId(project, "message");
    onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter result message", recordType: "message", id: messageId });
    const firstSlot = resultIndex * ENCOUNTER_RESULT_ROWS;
    const nextActions = updateEncounterActionRow(
      updateEncounterActionRow(actions, firstSlot, { rawCode: 1, id: messageId }),
      firstSlot + 1,
      { rawCode: 24, id: 0 }
    );
    update({ actions: nextActions });
    setSelectedResultIndex(resultIndex);
  };
  return (
    <div className="script-target-grid encounter-record-grid">
      <section className="encounter-setup-panel">
        <p className="field-help" style={{ gridColumn: "1 / -1" }}>
          <TutorialTip title="Encounter Setup" body={ENCOUNTER_SETUP_HELP} side="below">
            <span>Prompt, availability, and shared source fields.</span>
          </TutorialTip>
        </p>
        <div className="encounter-prompt-field">
          <ReferenceIdField
            project={project}
            catalog={catalog}
            label="Prompt Message"
            emptyLabel="No prompt message"
            opcode={1}
            value={prompt}
            createRecordType="message"
            showSelectedResult={false}
            onCommit={(next) => update({ prompt: next })}
            onCreateTarget={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter prompt", recordType: "message", id: targetId })}
          />
        </div>
        <div className="encounter-rules-grid">
          <label className="script-target-checkbox">
            <span>Can Back Out</span>
            <input type="checkbox" defaultChecked={canBackOut} onChange={(event) => update({ canBackOut: event.currentTarget.checked })} />
          </label>
          <NumberField label="Max Times" value={maxTimes} onCommit={(value) => update({ maxTimes: value })} compact />
          <NumberField label="Caste Success" value={casteSuccess} onCommit={(value) => update({ casteSuccess: value })} compact />
        </div>
      </section>
      {recordKind === "complex" && (
        <section className="encounter-complex-rules">
          <p className="field-help" style={{ gridColumn: "1 / -1" }}>
            <TutorialTip title="Complex Thief Branch" body={COMPLEX_THIEF_BRANCH_HELP} side="below">
              <span>Rogue Encounter runs a lock/trap scene, then returns a result number.</span>
            </TutorialTip>
          </p>
          <label className="script-target-checkbox">
            <span>Thief</span>
            <input type="checkbox" defaultChecked={Boolean(thief)} onChange={(event) => update({ thief: event.currentTarget.checked })} />
          </label>
          <NumberField label="Rogue Encounter" value={thiefSuccess ?? 0} onCommit={(value) => update({ thiefSuccess: value })} compact />
          <NumberField label="Preserved Rogue Fail Field" value={thiefFail ?? 0} onCommit={(value) => update({ thiefFail: value })} compact />
          {Boolean(thief) && (
            <ComplexRogueSummary
              project={project}
              rogueId={thiefSuccess ?? 0}
              preservedFailField={thiefFail ?? 0}
              resultActions={actions}
              onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue encounter", recordType: "thiefEncounter", id: thiefSuccess ?? 0 })}
              onOpen={() => onSelectEntity?.({ type: "encounter", id: `thief:${thiefSuccess ?? 0}` })}
              onRunOnStart={() => onApplyCommand?.({ kind: "createStartupTestMacro", label: "Run encounter on scenario start", complexEncounterId: id })}
            />
          )}
        </section>
      )}
      <EncounterResultFlowOverview
        sources={resultFlowSources}
        selectedResultIndex={selectedResultIndex}
        onSelectResult={setSelectedResultIndex}
      />
      <EncounterResultEditor
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
        wordResults={wordResults}
        onTextCommit={(slot, text) => update({ texts: updateArraySlot(texts, slot, text, recordKind === "simple" ? 4 : 9) })}
        onChoiceCommit={(slot, value) => update({ choiceResults: updateArraySlot(choiceResults, slot, value, 4) })}
        onWordCommit={(slot, value) => update({ wordResults: updateArraySlot(wordResults ?? [], slot, value, 4) })}
        onComplexCommit={(changes) => update(changes)}
      />
      {recordKind === "simple" ? (
        <EncounterResultActionMatrix
          project={project}
          catalog={catalog}
          actions={actions}
          title="Result Action Columns"
          description="Simple encounters store eight CODE/ID rows for each of the four result numbers, matching the Divinity editor columns."
          decisionSources={resultFlowSources}
          selectedResultIndex={selectedResultIndex}
          onSelectResult={setSelectedResultIndex}
          onAddVisibleResult={addVisibleResult}
          onUpdate={(slot, changes) => update({ actions: updateEncounterActionRow(actions, slot, changes) })}
          onCreateTarget={(recordType, targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter action target", recordType, id: targetId })}
        />
      ) : (
        <EncounterResultActionMatrix
          project={project}
          catalog={catalog}
          actions={actions}
          title="Result Script Columns"
          description="Complex encounters also resolve into four scriptable result columns. Each column holds eight CODE/ID rows."
          decisionSources={resultFlowSources}
          selectedResultIndex={selectedResultIndex}
          onSelectResult={setSelectedResultIndex}
          onAddVisibleResult={addVisibleResult}
          onUpdate={(slot, changes) => update({ actions: updateEncounterActionRow(actions, slot, changes) })}
          onCreateTarget={(recordType, targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter action target", recordType, id: targetId })}
        />
      )}
    </div>
  );
}

function ComplexRogueSummary({
  project,
  rogueId,
  preservedFailField,
  resultActions,
  onCreate,
  onOpen,
  onRunOnStart
}: {
  project: Project;
  rogueId: number;
  preservedFailField: number;
  resultActions: EncounterActionRow[];
  onCreate: () => void;
  onOpen: () => void;
  onRunOnStart: () => void;
}) {
  const record = project.thiefEncounters?.find((candidate) => candidate.id === rogueId);
  const enabled = record
    ? ROGUE_ACTION_LABELS.map((label, slot) => (record.typeFlags?.[slot] ? label : null)).filter((label): label is string => Boolean(label))
    : [];
  return (
    <div className="complex-rogue-summary">
      <header>
        <strong>Rogue Encounter Summary</strong>
        <span>{rogueId > 0 ? `Rogue Encounter ${rogueId}` : "No rogue encounter selected"}</span>
      </header>
      {record ? (
        <>
          <dl>
            <div>
              <dt>Available actions</dt>
              <dd>{enabled.length ? enabled.join(", ") : "No rogue actions enabled"}</dd>
            </div>
            <div>
              <dt>Open Lock spell</dt>
              <dd>{rogueSpellPathSummary(record, ROGUE_OPEN_LOCK_SPELL_PATH)} {rogueResultColumnVisibilitySummary(record, ROGUE_OPEN_LOCK_SPELL_PATH.slot, resultActions)}</dd>
            </div>
            <div>
              <dt>Disarm Trap spell</dt>
              <dd>{rogueSpellPathSummary(record, ROGUE_DISARM_TRAP_SPELL_PATH)} {rogueResultColumnVisibilitySummary(record, ROGUE_DISARM_TRAP_SPELL_PATH.slot, resultActions)}</dd>
            </div>
            {preservedFailField !== 0 && (
              <div>
                <dt>Preserved fail field</dt>
                <dd>{preservedFailField}</dd>
              </div>
            )}
          </dl>
          <div className="complex-rogue-actions">
            <button type="button" className="btn btn-secondary btn-xs" onClick={onOpen}>
              Open Rogue Encounter
            </button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onRunOnStart}>
              Run Encounter On Scenario Start
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="field-help">Choose or create a Rogue Encounter record for this thief branch before relying on Open Lock or Disarm Trap behavior.</p>
          <div className="complex-rogue-actions">
            <button type="button" className="btn btn-secondary btn-xs" disabled={rogueId <= 0} onClick={onCreate}>
              Create Rogue Encounter
            </button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onRunOnStart}>
              Run Encounter On Scenario Start
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function rogueOutcomeSummary(record: Project["thiefEncounters"][number], slot: number) {
  const success = record.successCodes?.[slot] ?? 0;
  const failure = record.failureCodes?.[slot] ?? 0;
  return `success ${resultCodeLabel(success)}, failure ${resultCodeLabel(failure)}`;
}

function resultCodeLabel(value: number) {
  return value > 0 ? `Result ${value}` : "no result";
}

const ENCOUNTER_RESULT_COUNT = 4;
const ENCOUNTER_RESULT_ROWS = 8;

type EncounterResultStatus = "visible" | "empty" | "missing" | "out-of-range";

type EncounterDecisionSource = {
  key: string;
  label: string;
  detail: string;
  result: number;
  resultIndex: number | null;
  status: EncounterResultStatus;
};

function resultIndexForCode(result: number) {
  return result >= 1 && result <= ENCOUNTER_RESULT_COUNT ? result - 1 : null;
}

function resultStatusLabel(status: EncounterResultStatus) {
  if (status === "visible") return "Visible";
  if (status === "empty") return "Empty";
  if (status === "out-of-range") return "Out of range";
  return "Missing";
}

function encounterResultStatus(actions: EncounterActionRow[], result: number): EncounterResultStatus {
  const resultIndex = resultIndexForCode(result);
  if (resultIndex === null) return result > ENCOUNTER_RESULT_COUNT ? "out-of-range" : "missing";
  const column = encounterResultColumnRows(actions, resultIndex);
  if (column.some((row) => encounterActionIsPlayerObservable(row))) return "visible";
  return "empty";
}

function encounterResultColumnRows(actions: EncounterActionRow[], resultIndex: number) {
  return Array.from({ length: ENCOUNTER_RESULT_ROWS }, (_, rowIndex) => encounterActionAt(actions, resultIndex * ENCOUNTER_RESULT_ROWS + rowIndex));
}

function encounterActionIsPopulated(row: EncounterActionRow) {
  return row.rawCode !== 0 || row.id !== 0;
}

function encounterActionIsPlayerObservable(row: EncounterActionRow) {
  if (!encounterActionIsPopulated(row)) return false;
  if (row.rawCode === 24 && row.id === 0) return false;
  if (isDispatcherNoopOpcode(row.rawCode)) return false;
  return true;
}

function encounterActionLabel(row: EncounterActionRow) {
  const option = actionOptionFor(row.rawCode);
  if (option) return option.shortLabel ?? option.label;
  if (encounterActionIsPopulated(row)) return `Raw CODE ${row.rawCode}`;
  return "Empty";
}

function encounterResultColumnSummary(actions: EncounterActionRow[], resultIndex: number, sources: EncounterDecisionSource[]) {
  const rows = encounterResultColumnRows(actions, resultIndex);
  const visible = rows.find(encounterActionIsPlayerObservable);
  const populated = rows.find(encounterActionIsPopulated);
  const incoming = sources.filter((source) => source.resultIndex === resultIndex).length;
  return {
    status: visible ? "visible" as EncounterResultStatus : "empty" as EncounterResultStatus,
    firstAction: visible ? encounterActionLabel(visible) : populated ? `Only ${encounterActionLabel(populated)}` : "No visible actions",
    incoming
  };
}

function encounterDecisionSource(
  key: string,
  label: string,
  detail: string,
  result: number,
  actions: EncounterActionRow[]
): EncounterDecisionSource {
  const resultIndex = resultIndexForCode(result);
  return {
    key,
    label,
    detail,
    result,
    resultIndex,
    status: encounterResultStatus(actions, result)
  };
}

function buildEncounterDecisionSources({
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
  wordResults,
  thief,
  rogueId,
  rogueRecord,
  actions
}: {
  recordKind: "simple" | "complex";
  texts: string[];
  actionResult: number;
  wordResult: number;
  groups: number[];
  spellIds: number[];
  spellResults: number[];
  itemIds: number[];
  itemResults: number[];
  choiceResults: number[];
  wordResults?: number[];
  thief: boolean;
  rogueId: number;
  rogueRecord?: Project["thiefEncounters"][number];
  actions: EncounterActionRow[];
}) {
  const sources: EncounterDecisionSource[] = [];
  if (recordKind === "simple") {
    for (let slot = 0; slot < 4; slot += 1) {
      const text = (texts[slot] ?? "").trim();
      sources.push(encounterDecisionSource(
        `choice-${slot}`,
        `Choice ${slot}`,
        text ? `Player picks "${shortSnippet(text, 54)}"` : "Player picks this option.",
        choiceResults[slot] ?? 0,
        actions
      ));
    }
    return sources;
  }

  const actionLabels = texts.slice(0, 8).map((text, slot) => text.trim() ? `Action ${slot}: ${shortSnippet(text, 28)}` : null).filter((label): label is string => Boolean(label));
  const groupCount = groups.filter((value) => value !== 0).length;
  if ((actionResult ?? 0) !== 0 || actionLabels.length > 0 || groupCount > 0) {
    sources.push(encounterDecisionSource(
      "action-picker",
      "Action picker",
      `${actionLabels.length || 8} action label${actionLabels.length === 1 ? "" : "s"}${groupCount ? `; ${groupCount} group flag${groupCount === 1 ? "" : "s"}` : ""}.`,
      actionResult,
      actions
    ));
  }
  if ((wordResult ?? 0) !== 0 || (texts[8] ?? "").trim()) {
    sources.push(encounterDecisionSource(
      "word-phrase",
      "Typed word",
      (texts[8] ?? "").trim() ? `Player types "${shortSnippet(texts[8] ?? "", 54)}".` : "Player enters the configured word or phrase.",
      wordResult,
      actions
    ));
  }
  spellIds.forEach((spellId, slot) => {
    const result = spellResults[slot] ?? 0;
    if (spellId !== 0 || result !== 0) {
      sources.push(encounterDecisionSource(`spell-${slot}`, `Spell ${spellId || slot + 1}`, `Spell/scroll test row ${slot + 1}.`, result, actions));
    }
  });
  itemIds.forEach((itemId, slot) => {
    const result = itemResults[slot] ?? 0;
    if (itemId !== 0 || result !== 0) {
      sources.push(encounterDecisionSource(`item-${slot}`, `Item ${itemId || slot + 1}`, `Required item test row ${slot + 1}.`, result, actions));
    }
  });
  (wordResults ?? []).forEach((result, slot) => {
    if (result !== 0 && slot > 0) {
      sources.push(encounterDecisionSource(`word-result-${slot}`, `Word result ${slot + 1}`, "Preserved alternate word-result field.", result, actions));
    }
  });
  if (thief && rogueRecord) {
    ROGUE_ACTION_LABELS.forEach((label, slot) => {
      if (!rogueRecord.typeFlags?.[slot] && !rogueActionHasOutcomeData(rogueRecord, slot)) return;
      sources.push(encounterDecisionSource(
        `rogue-${slot}-success`,
        `${label} success`,
        `Rogue Encounter ${rogueId} returns this result when the action succeeds.`,
        rogueRecord.successCodes?.[slot] ?? 0,
        actions
      ));
      sources.push(encounterDecisionSource(
        `rogue-${slot}-failure`,
        `${label} failure`,
        `Rogue Encounter ${rogueId} returns this result when the action fails.`,
        rogueRecord.failureCodes?.[slot] ?? 0,
        actions
      ));
    });
  }
  return sources;
}

function shortSnippet(text: string, maxLength: number) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1))}...`;
}

function EncounterResultFlowOverview({
  sources,
  selectedResultIndex,
  onSelectResult
}: {
  sources: EncounterDecisionSource[];
  selectedResultIndex: number | null;
  onSelectResult: (resultIndex: number | null) => void;
}) {
  if (sources.length === 0) {
    return (
      <section className="encounter-result-flow-overview empty">
        <header>
          <strong>Result Flow</strong>
          <span>No decision sources configured</span>
        </header>
        <p className="field-help">Add player options, typed words, spell/item tests, or Rogue paths to route this encounter into result columns.</p>
      </section>
    );
  }
  return (
    <section className="encounter-result-flow-overview">
      <header>
        <strong>Result Flow</strong>
        <span>{sources.length} decision source{sources.length === 1 ? "" : "s"}</span>
      </header>
      <div className="encounter-result-flow-list">
        {sources.map((source) => (
          <button
            key={source.key}
            type="button"
            className={`encounter-result-flow-row ${source.status}${source.resultIndex !== null && source.resultIndex === selectedResultIndex ? " selected" : ""}`}
            disabled={source.resultIndex === null}
            onClick={() => onSelectResult(source.resultIndex)}
          >
            <span>
              <b>{source.label}</b>
              <small>{source.detail}</small>
            </span>
            <em>{source.result > 0 ? `Result ${source.result}` : "No result"}</em>
            <i>{resultStatusLabel(source.status)}</i>
          </button>
        ))}
      </div>
    </section>
  );
}

const ROGUE_PRIMARY_ACTIONS = 5;
const ROGUE_DISARM_TRAP_SLOT = 2;
const ROGUE_OPEN_LOCK_SLOT = 6;

type RogueSpellPathConfig = {
  slot: number;
  chanceSlot: number;
  title: string;
  rowLabel: string;
  disabledWarning: string;
};

const ROGUE_OPEN_LOCK_SPELL_PATH: RogueSpellPathConfig = {
  slot: ROGUE_OPEN_LOCK_SLOT,
  chanceSlot: 1,
  title: "Open Lock spell path",
  rowLabel: "Open Lock Magic",
  disabledWarning: "Open Lock spell path is disabled until Chance / level is nonzero."
};

const ROGUE_DISARM_TRAP_SPELL_PATH: RogueSpellPathConfig = {
  slot: ROGUE_DISARM_TRAP_SLOT,
  chanceSlot: 2,
  title: "Disarm Trap spell path",
  rowLabel: "Disarm Trap",
  disabledWarning: "Disarm Trap spell path is disabled until Chance / level is nonzero."
};

const ROGUE_SPELL_PATHS: RogueSpellPathConfig[] = [
  ROGUE_OPEN_LOCK_SPELL_PATH,
  ROGUE_DISARM_TRAP_SPELL_PATH
];

function rogueSpellPathForSlot(slot: number) {
  return ROGUE_SPELL_PATHS.find((path) => path.slot === slot) ?? null;
}

function rogueSpellPathChance(record: Project["thiefEncounters"][number], config: RogueSpellPathConfig) {
  return record.promptSounds?.[config.chanceSlot] ?? 0;
}

function rogueSpellPathEnabled(record: Project["thiefEncounters"][number], config: RogueSpellPathConfig) {
  return rogueSpellPathChance(record, config) > 0;
}

function rogueActionHasOutcomeData(record: Project["thiefEncounters"][number], slot: number) {
  return Boolean(
    (record.successCodes?.[slot] ?? 0) ||
    (record.failureCodes?.[slot] ?? 0) ||
    (record.successText?.[slot] ?? 0) ||
    (record.failureText?.[slot] ?? 0) ||
    (record.successSounds?.[slot] ?? 0) ||
    (record.failureSounds?.[slot] ?? 0)
  );
}

function rogueOutcomeHasVisiblePath(record: Project["thiefEncounters"][number], slot: number, outcome: "success" | "failure") {
  const codes = outcome === "success" ? record.successCodes : record.failureCodes;
  const messages = outcome === "success" ? record.successText : record.failureText;
  const sounds = outcome === "success" ? record.successSounds : record.failureSounds;
  return Boolean((codes?.[slot] ?? 0) || (messages?.[slot] ?? 0) || (sounds?.[slot] ?? 0));
}

function rogueSpellPathWarnings(record: Project["thiefEncounters"][number], config: RogueSpellPathConfig) {
  const warnings: string[] = [];
  if (!rogueSpellPathEnabled(record, config)) {
    if (rogueActionHasOutcomeData(record, config.slot)) warnings.push(config.disabledWarning);
    return warnings;
  }
  if (!rogueOutcomeHasVisiblePath(record, config.slot, "success")) {
    warnings.push(`${config.title} success currently has no visible result. Add a message, sound, or result code so players can tell what happened.`);
  }
  if (!rogueOutcomeHasVisiblePath(record, config.slot, "failure")) {
    warnings.push(`${config.title} failure currently has no visible result. Add a message, sound, or result code so players can tell what happened.`);
  }
  return warnings;
}

function rogueSpellPathSummary(record: Project["thiefEncounters"][number], config: RogueSpellPathConfig) {
  const chance = rogueSpellPathChance(record, config);
  if (chance <= 0) return `Disabled; set Chance / level above 0 to use ${config.rowLabel}. ${rogueOutcomeSummary(record, config.slot)}.`;
  return `Enabled (${chance}); success -> ${resultCodeLabel(record.successCodes?.[config.slot] ?? 0)}, failure -> ${resultCodeLabel(record.failureCodes?.[config.slot] ?? 0)}.`;
}

function rogueResultColumnVisibilitySummary(record: Project["thiefEncounters"][number], slot: number, actions: EncounterActionRow[]) {
  const success = record.successCodes?.[slot] ?? 0;
  const failure = record.failureCodes?.[slot] ?? 0;
  return `Success ${resultStatusLabel(encounterResultStatus(actions, success)).toLowerCase()}; failure ${resultStatusLabel(encounterResultStatus(actions, failure)).toLowerCase()}.`;
}

function RogueSpellStatusStrip({ record }: { record: Project["thiefEncounters"][number] }) {
  return (
    <div className="rogue-spell-status-strip">
      {ROGUE_SPELL_PATHS.map((config) => {
        const enabled = rogueSpellPathEnabled(record, config);
        return (
          <div key={config.slot} className={`rogue-spell-status-card ${enabled ? "enabled" : "disabled"}`}>
            <b>{config.title}</b>
            <em>{enabled ? "Enabled" : "Disabled"}</em>
            <small>Chance / level {rogueSpellPathChance(record, config)}; edit beside the {config.rowLabel} row.</small>
          </div>
        );
      })}
    </div>
  );
}

function EncounterResultActionMatrix({
  project,
  catalog,
  actions,
  title,
  description,
  decisionSources,
  selectedResultIndex,
  onSelectResult,
  onAddVisibleResult,
  onUpdate,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  actions: EncounterActionRow[];
  title: string;
  description: string;
  decisionSources: EncounterDecisionSource[];
  selectedResultIndex: number | null;
  onSelectResult: (resultIndex: number) => void;
  onAddVisibleResult: (resultIndex: number) => void;
  onUpdate: (slot: number, changes: Partial<EncounterActionRow>) => void;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
}) {
  return (
    <section className="simple-encounter-action-matrix">
      <header>
        <div>
          <TutorialTip title={title} body={ENCOUNTER_RESULT_ACTION_HELP} side="below">
            <strong>{title}</strong>
          </TutorialTip>
          <small>{description}</small>
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
              {summary.status === "empty" && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => onAddVisibleResult(resultIndex)}>
                  Add visible result
                </button>
              )}
            </header>
            <p className="encounter-column-summary">{summary.firstAction}</p>
            {Array.from({ length: ENCOUNTER_RESULT_ROWS }, (_, rowIndex) => {
              const slot = resultIndex * ENCOUNTER_RESULT_ROWS + rowIndex;
              return (
                <SimpleEncounterActionCell
                  key={slot}
                  project={project}
                  catalog={catalog}
                  slot={slot}
                  row={encounterActionAt(actions, slot)}
                  onUpdate={(changes) => onUpdate(slot, changes)}
                  onCreateTarget={onCreateTarget}
                />
              );
            })}
          </div>
          );
        })}
      </div>
    </section>
  );
}

function SimpleEncounterActionCell({
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
  const populated = row.rawCode !== 0 || row.id !== 0;
  return (
    <div className={`simple-encounter-action-cell${populated ? " populated" : ""}`}>
      <select
        aria-label={`Result action ${slot} opcode`}
        value={row.rawCode}
        title={rowOption ? `${rowOption.category}: ${rowOption.description}` : "Empty action row"}
        onChange={(event) => onUpdate({ rawCode: Number(event.currentTarget.value) })}
      >
        {ACTION_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>{option.code} {option.label}</option>
        ))}
      </select>
      <ReferenceIdField
        project={project}
        catalog={catalog}
        label="ID"
        emptyLabel="No target"
        opcode={row.rawCode}
        value={row.id}
        createRecordType={targetType}
        compact
        showSelectedResult={false}
        onCommit={(next) => onUpdate({ id: next })}
        onCreateTarget={(targetId) => {
          if (targetType) onCreateTarget(targetType, targetId);
        }}
      />
      {populated && (
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => onUpdate({ rawCode: 0, id: 0 })}>
          Clear
        </button>
      )}
    </div>
  );
}

const ROGUE_ACTION_LABELS = [
  "Acrobatic Act",
  "Detect Trap",
  "Disarm Trap",
  "Force Lock",
  "Pick Lock",
  "Pick Pocket",
  "Open Lock Magic",
  "Rogue Support"
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
  const enabledCount = (record.typeFlags ?? []).slice(0, 8).filter(Boolean).length;
  const trapped = Boolean(record.typeFlags?.[9]);
  const rogueOnly = Boolean(record.typeFlags?.[8]);
  return (
    <div className="thief-encounter-editor">
      <section className="rogue-action-matrix">
        <header>
          <div>
            <TutorialTip title="Rogue Action Tests" body={ROGUE_ACTION_TESTS_HELP} side="below">
              <strong>Rogue Action Tests</strong>
            </TutorialTip>
            <small>{enabledCount}/8 enabled; success/fail columns return result codes, messages, and sounds.</small>
          </div>
        </header>
        <div className="rogue-action-table" role="table" aria-label="Rogue action tests">
          <div className="rogue-action-table-header" role="row">
            <span>Action Required</span>
            <span>% Mod</span>
            <span>Result Success</span>
            <span>Result Fail</span>
            <span>Text Success</span>
            <span>Text Fail</span>
            <span>Sound Success</span>
            <span>Sound Fail</span>
          </div>
          {Array.from({ length: 8 }, (_, slot) => (
            <RogueActionRow
              key={slot}
              slot={slot}
              record={record}
              project={project}
              catalog={catalog}
              primary={slot < ROGUE_PRIMARY_ACTIONS}
              onUpdate={update}
              onCreateMessage={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue message", recordType: "message", id: targetId })}
            />
          ))}
        </div>
      </section>
      <section className="rogue-encounter-detail-grid">
        <div className="rogue-prompt-panel">
          <header>
            <TutorialTip title="Rogue Prompt" body={ROGUE_PROMPT_HELP} side="below">
              <strong>Encounter Prompt</strong>
            </TutorialTip>
            <small>Shown when this rogue encounter starts.</small>
          </header>
          <ReferenceIdField
            project={project}
            catalog={catalog}
            label="Prompt String"
            emptyLabel="No prompt string"
            opcode={1}
            value={record.prompts?.[0] ?? 0}
            createRecordType="message"
            compact
            onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 0, value, 3) })}
            onCreateTarget={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue prompt", recordType: "message", id: targetId })}
          />
          <ReferenceIdField
            project={project}
            catalog={catalog}
            label="Prompt Sound"
            emptyLabel="No prompt sound"
            opcode={9}
            value={record.promptSounds?.[0] ?? 0}
            compact
            onCommit={(value) => update({ promptSounds: updateArraySlot(record.promptSounds ?? [], 0, value, 3) })}
          />
        </div>
        <div className="rogue-trap-panel">
          <header>
            <TutorialTip title="Trap / Lock Setup" body={ROGUE_TRAP_HELP} side="below">
              <strong>Trap / Lock Setup</strong>
            </TutorialTip>
            <small>{trapped ? "Trap armed" : "No armed trap"}; affects {rogueOnly ? "the acting rogue only" : "the whole party"}.</small>
          </header>
          <div className="rogue-toggle-strip">
            <label className="script-target-checkbox">
              <span>Is Trapped</span>
              <input
                type="checkbox"
                checked={trapped}
                onChange={(event) => update({ typeFlags: updateArraySlot(record.typeFlags ?? [], 9, event.currentTarget.checked, 10) })}
              />
            </label>
            <label className="script-target-checkbox">
              <span>Trap Affects Rogue Only</span>
              <input
                type="checkbox"
                checked={rogueOnly}
                onChange={(event) => update({ typeFlags: updateArraySlot(record.typeFlags ?? [], 8, event.currentTarget.checked, 10) })}
              />
            </label>
          </div>
          <div className="rogue-trap-fields">
            <NumberField label="Lock Tumblers" value={record.tumblers} onCommit={(tumblers) => update({ tumblers })} compact />
            <NumberField label="Trap Damage Low" value={record.lowDamage} onCommit={(lowDamage) => update({ lowDamage })} compact />
            <NumberField label="Trap Damage High" value={record.highDamage} onCommit={(highDamage) => update({ highDamage })} compact />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="Trap Sound"
              emptyLabel="No trap sound"
              opcode={9}
              value={record.prompts?.[1] ?? 0}
              compact
              onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 1, value, 3) })}
            />
            <NumberField label="Trap Spell" value={record.spell} onCommit={(spell) => update({ spell })} compact />
            <NumberField label="Power Level" value={record.prompts?.[2] ?? 0} onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 2, value, 3) })} compact />
          </div>
          <RogueSpellStatusStrip record={record} />
          <p className="field-help">Open Lock and Disarm Trap spell-special paths are configured beside their action rows above. Trap / Lock Setup keeps the physical trap, tumbler, damage, prompt, and trap-spell fields.</p>
        </div>
      </section>
    </div>
  );
}

function RogueActionRow({
  slot,
  record,
  project,
  catalog,
  primary,
  onUpdate,
  onCreateMessage
}: {
  slot: number;
  record: Project["thiefEncounters"][number];
  project: Project;
  catalog?: LibraryCatalog | null;
  primary: boolean;
  onUpdate: (changes: Extract<ProjectCommand, { kind: "updateThiefEncounterRecord" }>["changes"]) => void;
  onCreateMessage: (targetId: number) => void;
}) {
  const spellPath = rogueSpellPathForSlot(slot);
  const actionWarnings = rogueActionOutcomeWarnings(record, slot);
  return (
    <>
      <div className={primary ? "rogue-action-row" : "rogue-action-row secondary"} role="row">
        <label className="rogue-action-enabled">
          <input
            type="checkbox"
            checked={Boolean(record.typeFlags?.[slot])}
            onChange={(event) => onUpdate({ typeFlags: updateArraySlot(record.typeFlags ?? [], slot, event.currentTarget.checked, 10) })}
          />
          <span>{ROGUE_ACTION_LABELS[slot] ?? `Rogue Action ${slot}`}</span>
        </label>
        <NumberField label="% Mod" value={record.modifiers?.[slot] ?? 0} onCommit={(value) => onUpdate({ modifiers: updateArraySlot(record.modifiers ?? [], slot, value, 8) })} compact />
        <NumberField label="Success Result" value={record.successCodes?.[slot] ?? 0} onCommit={(value) => onUpdate({ successCodes: updateArraySlot(record.successCodes ?? [], slot, value, 8) })} compact />
        <NumberField label="Fail Result" value={record.failureCodes?.[slot] ?? 0} onCommit={(value) => onUpdate({ failureCodes: updateArraySlot(record.failureCodes ?? [], slot, value, 8) })} compact />
        <ReferenceIdField
          project={project}
          catalog={catalog}
          label="Success Text"
          emptyLabel="No success string"
          opcode={1}
          value={record.successText?.[slot] ?? 0}
          createRecordType="message"
          compact
          onCommit={(value) => onUpdate({ successText: updateArraySlot(record.successText ?? [], slot, value, 8) })}
          onCreateTarget={onCreateMessage}
        />
        <ReferenceIdField
          project={project}
          catalog={catalog}
          label="Fail Text"
          emptyLabel="No failure string"
          opcode={1}
          value={record.failureText?.[slot] ?? 0}
          createRecordType="message"
          compact
          onCommit={(value) => onUpdate({ failureText: updateArraySlot(record.failureText ?? [], slot, value, 8) })}
          onCreateTarget={onCreateMessage}
        />
        <ReferenceIdField
          project={project}
          catalog={catalog}
          label="Success Sound"
          emptyLabel="No success sound"
          opcode={9}
          value={record.successSounds?.[slot] ?? 0}
          compact
          onCommit={(value) => onUpdate({ successSounds: updateArraySlot(record.successSounds ?? [], slot, value, 8) })}
        />
        <ReferenceIdField
          project={project}
          catalog={catalog}
          label="Fail Sound"
          emptyLabel="No failure sound"
          opcode={9}
          value={record.failureSounds?.[slot] ?? 0}
          compact
          onCommit={(value) => onUpdate({ failureSounds: updateArraySlot(record.failureSounds ?? [], slot, value, 8) })}
        />
      </div>
      {actionWarnings.map((warning) => <p key={warning} className="field-warning rogue-action-warning">{warning}</p>)}
      {spellPath && (
        <RogueSpellPathPanel
          record={record}
          config={spellPath}
          onUpdate={(value) => onUpdate({ promptSounds: updateArraySlot(record.promptSounds ?? [], spellPath.chanceSlot, value, 3) })}
        />
      )}
    </>
  );
}

function rogueActionOutcomeWarnings(record: Project["thiefEncounters"][number], slot: number) {
  if (!record.typeFlags?.[slot]) return [];
  const label = ROGUE_ACTION_LABELS[slot] ?? `Rogue Action ${slot}`;
  const warnings: string[] = [];
  if (!rogueOutcomeHasVisiblePath(record, slot, "success")) {
    warnings.push(`${label} can succeed, but success currently has no visible result. Add a result code, message, or sound.`);
  }
  if (!rogueOutcomeHasVisiblePath(record, slot, "failure")) {
    warnings.push(`${label} can fail, but failure currently has no visible result. Add a result code, message, or sound.`);
  }
  return warnings;
}

function RogueSpellPathPanel({
  record,
  config,
  onUpdate
}: {
  record: Project["thiefEncounters"][number];
  config: RogueSpellPathConfig;
  onUpdate: (value: number) => void;
}) {
  const enabled = rogueSpellPathEnabled(record, config);
  const warnings = rogueSpellPathWarnings(record, config);
  return (
    <div className={`rogue-spell-path-panel ${enabled ? "enabled" : "disabled"}`}>
      <header>
        <div>
          <strong>{config.title}</strong>
          <small>{config.rowLabel} supplies this spell-special path's success/failure result, text, and sound.</small>
        </div>
        <em>{enabled ? "Enabled" : "Disabled"}</em>
      </header>
      <NumberField label="Chance / level" value={rogueSpellPathChance(record, config)} onCommit={onUpdate} compact />
      <p>{rogueSpellPathSummary(record, config)}</p>
      {warnings.map((warning) => <p key={warning} className="field-warning">{warning}</p>)}
    </div>
  );
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
  const locationValue = locationKindValue(record.locationKind);
  const eligibilitySummary = timedEncounterEligibilitySummary(record);
  const reservedTimedValues = Array.from({ length: 9 }, (_, index) => record.stuff?.[index + 1] ?? 0);
  const reservedNonZeroCount = reservedTimedValues.filter((value) => value !== 0).length;
  return (
    <div className="timed-encounter-editor">
      <section className="timed-encounter-form">
        <header>
          <div>
            <TutorialTip title="Midnight Schedule" body={TIMED_SCHEDULE_HELP} side="below">
              <strong>Midnight Schedule</strong>
            </TutorialTip>
            <small>Checked at midnight; Day and Increment set to -1 keeps the record inactive until an Action Point activates it.</small>
          </div>
          <span>{record.percent}% chance</span>
        </header>
        <p className="timed-eligibility-summary">{eligibilitySummary}</p>
        <div className="timed-encounter-columns">
          <div className="timed-encounter-column">
            <TimedNumberRow label="Day" value={record.day} onCommit={(day) => update({ day })} />
            <TimedNumberRow label="Increment" value={record.increment} onCommit={(increment) => update({ increment })} />
            <TimedNumberRow label="% Chance" value={record.percent} onCommit={(percent) => update({ percent })} />
            <TimedNumberRow label="Extra AP To Activate" value={record.door} onCommit={(door) => update({ door })} />
            <TimedNumberRow label="Required Item ID" value={record.requiredItem} onCommit={(requiredItem) => update({ requiredItem })} />
            <TimedNumberRow label="Required Quest ID" value={record.requiredQuest} onCommit={(requiredQuest) => update({ requiredQuest })} />
          </div>
          <div className="timed-encounter-column">
            <label className="timed-form-row timed-location-row">
              <TutorialTip title="Timed Location Gate" body={TIMED_LOCATION_HELP} side="below">
                <span>Position Required</span>
              </TutorialTip>
              <select value={record.locationKind} onChange={(event) => setLocationKind(event.currentTarget.value as Project["timedEncounters"][number]["locationKind"])}>
                <option value="any">-1 No position</option>
                <option value="land">1 Land</option>
                <option value="dungeon">2 Dungeon</option>
              </select>
            </label>
            <TimedNumberRow label="Raw Position Code" value={locationValue} readOnly />
            <TimedNumberRow label="Required Level" value={record.requiredLevel} onCommit={(requiredLevel) => update({ requiredLevel })} />
            <TimedNumberRow label="Required Rect" value={record.requiredRandomRect} onCommit={(requiredRandomRect) => update({ requiredRandomRect })} />
            <TimedNumberRow label="Required X" value={record.requiredX} onCommit={(requiredX) => update({ requiredX })} />
            <TimedNumberRow label="Required Y" value={record.requiredY} onCommit={(requiredY) => update({ requiredY })} />
          </div>
        </div>
      </section>
      <CollapsibleSection title="Compatibility Data" eyebrow="advanced" count={reservedNonZeroCount ? `${reservedNonZeroCount} preserved value${reservedNonZeroCount === 1 ? "" : "s"}` : "all zero"} density="compact" className="script-encounter-text-section timed-extra-section">
        <p className="script-encounter-text-note">
          <TutorialTip title="Reserved Time Encounter Fields" body={TIMED_EXTRA_HELP} side="below">
            <span>Preserved Data TD3 compatibility values. Providence keeps these on save/export, but they do not have confirmed authoring meaning.</span>
          </TutorialTip>
        </p>
        <div className="timed-compatibility-grid" aria-label="Read-only timed encounter compatibility values">
          {reservedTimedValues.map((value, index) => {
            const slot = index + 1;
            return (
              <div key={slot} className={`timed-compatibility-chip${value !== 0 ? " is-preserved" : ""}`}>
                <span>stuff[{slot}]</span>
                <strong>{value}</strong>
              </div>
            );
          })}
        </div>
      </CollapsibleSection>
    </div>
  );
}

function TimedNumberRow({
  label,
  value,
  readOnly = false,
  onCommit
}: {
  label: string;
  value: number;
  readOnly?: boolean;
  onCommit?: (value: number) => void;
}) {
  return (
    <label className="timed-form-row">
      <span>{label}</span>
      <input type="number" value={value} readOnly={readOnly} onChange={(event) => onCommit?.(Number(event.currentTarget.value))} />
    </label>
  );
}

function locationKindValue(locationKind: Project["timedEncounters"][number]["locationKind"]) {
  if (locationKind === "land") return 1;
  if (locationKind === "dungeon") return 2;
  return -1;
}

function timedEncounterEligibilitySummary(record: Project["timedEncounters"][number]) {
  const timing = record.day === -1 && record.increment === -1
    ? "Inactive until an Action Point activates it"
    : `checked at midnight starting day ${record.day}, increment ${record.increment}`;
  const location =
    record.locationKind === "land" ? `on land level ${record.requiredLevel}` :
    record.locationKind === "dungeon" ? `in dungeon level ${record.requiredLevel}` :
    "at any location";
  const gates: string[] = [];
  if (record.requiredItem > 0) gates.push(`requires item ${record.requiredItem}`);
  if (record.requiredQuest > 0) gates.push(`requires quest flag ${record.requiredQuest}`);
  if (record.requiredRandomRect > 0) gates.push(`inside random rectangle ${record.requiredRandomRect}`);
  if (record.requiredX > 0 || record.requiredY > 0) gates.push(`near ${record.requiredX},${record.requiredY}`);
  const runs = record.door > 0 ? `runs Extra Action Point ${record.door}` : "has no Extra Action Point target";
  return `${timing}; ${record.percent}% chance; ${location}${gates.length ? `; ${gates.join("; ")}` : ""}; ${runs}.`;
}

function EncounterResultEditor({
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
  wordResults,
  onTextCommit,
  onChoiceCommit,
  onWordCommit,
  onComplexCommit
}: {
  recordKind: "simple" | "complex";
  texts: string[];
  actionResult: number;
  wordResult: number;
  groups: number[];
  spellIds: number[];
  spellResults: number[];
  itemIds: number[];
  itemResults: number[];
  choiceResults: number[];
  wordResults?: number[];
  onTextCommit: (slot: number, text: string) => void;
  onChoiceCommit: (slot: number, value: number) => void;
  onWordCommit: (slot: number, value: number) => void;
  onComplexCommit: (changes: Partial<Pick<Project["complexEncounters"][number], "actionResult" | "wordResult" | "groups" | "spellIds" | "spellResults" | "itemIds" | "itemResults" | "choiceResults" | "wordResults">>) => void;
}) {
  const count = recordKind === "simple" ? 4 : 9;
  const maxLength = recordKind === "simple" ? 79 : 39;
  if (recordKind === "complex") {
    return (
      <section className="encounter-result-editor complex-encounter-authoring">
        <header>
          <div>
            <TutorialTip title="Encounter Bar Actions" body={COMPLEX_BAR_ACTIONS_HELP} side="below">
              <strong>Encounter Bar Actions</strong>
            </TutorialTip>
            <small>Eight action labels, four action result fields, and one word/phrase trigger.</small>
          </div>
        </header>
        <div className="complex-encounter-action-options">
          {Array.from({ length: 8 }, (_, slot) => {
            const text = texts[slot] ?? "";
            return (
              <div key={slot} className="complex-encounter-action-option">
                <b>{`Action ${slot}`}</b>
                <label className="script-encounter-text-field">
                  <span>{encounterTextBufferLabel(recordKind, slot)}</span>
                  <textarea
                    defaultValue={text}
                    maxLength={maxLength}
                    onBlur={(event) => onTextCommit(slot, event.currentTarget.value)}
                  />
                  <small>{text.length}/{maxLength}</small>
                </label>
              </div>
            );
          })}
        </div>
        <div className="complex-encounter-tool-grid">
          <section className="complex-encounter-tool-panel">
            <header>
              <TutorialTip title="Action Picker Branch" body={COMPLEX_BAR_ACTIONS_HELP} side="below">
                <strong>Action Picker</strong>
              </TutorialTip>
              <small>Action result and required group flags.</small>
            </header>
            <div className="complex-encounter-result-strip compact">
              <NumberField label="Result" value={actionResult} onCommit={(value) => onComplexCommit({ actionResult: value, choiceResults: [value, 0, 0, 0] })} compact />
              {Array.from({ length: 8 }, (_, slot) => (
                <NumberField
                  key={slot}
                  label={`G${slot}`}
                  value={groups[slot] ?? 0}
                  onCommit={(value) => onComplexCommit({ groups: updateArraySlot(groups, slot, value, 8) })}
                  compact
                />
              ))}
            </div>
          </section>
          <section className="complex-encounter-tool-panel">
            <header>
              <TutorialTip title="Word / Phrase Branch" body={COMPLEX_WORD_HELP} side="below">
                <strong>Word / Phrase</strong>
              </TutorialTip>
              <small>Spoken keyword and result column.</small>
            </header>
            <label className="script-encounter-text-field encounter-word-answer">
              <span>{encounterTextBufferLabel(recordKind, 8)}</span>
              <textarea
                defaultValue={texts[8] ?? ""}
                maxLength={maxLength}
                onBlur={(event) => onTextCommit(8, event.currentTarget.value)}
              />
              <small>{(texts[8] ?? "").length}/{maxLength}</small>
            </label>
            <div className="complex-encounter-result-strip compact single">
              <NumberField label="Result" value={wordResult} onCommit={(value) => onComplexCommit({ wordResult: value, wordResults: [value, 0, 0, 0] })} compact />
            </div>
          </section>
          <ComplexEncounterTestGrid
            title="Spell / Scroll Tests"
            help={COMPLEX_SPELL_TESTS_HELP}
            idLabel="Spell ID"
            resultLabel="Result"
            count={10}
            ids={spellIds}
            results={spellResults}
            onIdsCommit={(next) => onComplexCommit({ spellIds: next })}
            onResultsCommit={(next) => onComplexCommit({ spellResults: next })}
          />
          <ComplexEncounterTestGrid
            title="Item Tests"
            help={COMPLEX_ITEM_TESTS_HELP}
            idLabel="Item ID"
            resultLabel="Result"
            count={5}
            ids={itemIds}
            results={itemResults}
            onIdsCommit={(next) => onComplexCommit({ itemIds: next })}
            onResultsCommit={(next) => onComplexCommit({ itemResults: next })}
          />
        </div>
      </section>
    );
  }
  return (
    <section className="encounter-result-editor">
      <header>
        <div>
          <TutorialTip title="Simple Player Options" body={SIMPLE_OPTIONS_HELP} side="below">
            <strong>Player Options</strong>
          </TutorialTip>
          <small>{count} classic Pascal text buffers, {maxLength} display bytes each</small>
        </div>
      </header>
      <div className="encounter-result-table">
        {Array.from({ length: 4 }, (_, slot) => {
          const text = texts[slot] ?? "";
          return (
            <div key={slot} className="encounter-result-row">
              <b>{`Option ${slot}`}</b>
              <label className="script-encounter-text-field">
                <span>{encounterTextBufferLabel(recordKind, slot)}</span>
                <textarea
                  defaultValue={text}
                  maxLength={maxLength}
                  onBlur={(event) => onTextCommit(slot, event.currentTarget.value)}
                />
                <small>{text.length}/{maxLength}</small>
              </label>
              <NumberField label="Result #" value={choiceResults[slot] ?? 0} onCommit={(value) => onChoiceCommit(slot, value)} compact />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ComplexEncounterTestGrid({
  title,
  help,
  idLabel,
  resultLabel,
  count,
  ids,
  results,
  onIdsCommit,
  onResultsCommit
}: {
  title: string;
  help?: string;
  idLabel: string;
  resultLabel: string;
  count: number;
  ids: number[];
  results: number[];
  onIdsCommit: (values: number[]) => void;
  onResultsCommit: (values: number[]) => void;
}) {
  return (
    <section className="complex-encounter-test-grid">
      <header>
        {help ? (
          <TutorialTip title={title} body={help} side="below">
            <strong>{title}</strong>
          </TutorialTip>
        ) : (
          <strong>{title}</strong>
        )}
        <small>{count} decoded source-backed test row{count === 1 ? "" : "s"}</small>
      </header>
      <div>
        {Array.from({ length: count }, (_, slot) => (
          <div key={slot} className="complex-encounter-test-row">
            <b>{slot + 1}</b>
            <NumberField label={idLabel} value={ids[slot] ?? 0} onCommit={(value) => onIdsCommit(updateArraySlot(ids, slot, value, count))} compact />
            <NumberField label={resultLabel} value={results[slot] ?? 0} onCommit={(value) => onResultsCommit(updateArraySlot(results, slot, value, count))} compact />
          </div>
        ))}
      </div>
    </section>
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
  compact = false,
  showSelectedResult = true,
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
  compact?: boolean;
  showSelectedResult?: boolean;
  onCommit: (value: number) => void;
  onCreateTarget?: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  useEffect(() => {
    setQuery("");
    setOptionsLoaded(false);
  }, [opcode, project]);
  const resolvedValue = resolveSignedMessageTarget(opcode, value);
  const selected = useMemo(() => targetOptionForOpcodeValue(project, opcode, value, catalog), [catalog, opcode, project, value]);
  const options = useMemo(() => {
    if (!optionsLoaded && !query.trim()) return selected ? [selected] : [];
    return targetOptionsForOpcode(project, opcode, catalog);
  }, [catalog, opcode, optionsLoaded, project, query, selected]);
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
  const hasRawValue = resolvedValue !== 0 && !selected;
  const canCreate = Boolean(createRecordType && onCreateTarget && (!selected || hasRawValue || value === 0));
  const createId = resolvedValue > 0 && !selected ? resolvedValue : createRecordType ? nextAuthorableTargetId(project, createRecordType) : resolvedValue;
  const selectTarget = (next: number) => {
    onCommit(signedTargetValueForSelection(opcode, value, next));
    setQuery("");
  };
  return (
    <label className={compact ? "script-reference-id-field compact" : "script-reference-id-field"}>
      <span>{label}</span>
      {!compact && (
        <>
          <input
            value={query}
            onFocus={() => setOptionsLoaded(true)}
            onChange={(event) => {
              setOptionsLoaded(true);
              setQuery(event.currentTarget.value);
            }}
            placeholder={`Search ${label.toLowerCase()}...`}
            aria-label={`Search ${label}`}
          />
          <div className="script-reference-results" aria-live="polite">
            {query.trim() && resultOptions.length === 0 && <small>No matching {label.toLowerCase()} targets.</small>}
            {(query.trim() ? resultOptions : showSelectedResult && selected ? [selected] : []).map((option) => (
              <button
                key={option.key}
                type="button"
                className={option.value === resolvedValue ? "selected" : ""}
                onClick={() => selectTarget(option.value)}
              >
                <strong>{option.label}</strong>
                <span>{[option.detail, option.summary, option.compatibility, option.sourceState].filter(Boolean).join(" | ")}</span>
              </button>
            ))}
            {query.trim() && filteredOptions.length > resultOptions.length && <small>{filteredOptions.length - resultOptions.length} more match(es); keep typing to narrow.</small>}
          </div>
        </>
      )}
      <select
        value={hasRawValue ? `raw:${resolvedValue}` : selected ? String(selected.value) : ""}
        onFocus={() => setOptionsLoaded(true)}
        onMouseDown={() => setOptionsLoaded(true)}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          if (!raw || raw.startsWith("raw:")) return;
          selectTarget(Number(raw));
        }}
      >
        <option value="">{emptyLabel}</option>
        {hasRawValue && <option value={`raw:${resolvedValue}`}>Current value {resolvedValue}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input type="number" value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))} aria-label={`${label} value`} />
      <small>{selected ? [selected.detail, selected.summary, signedTargetBehaviorLabel(opcode, value), selected.compatibility, selected.sourceState].filter(Boolean).join(" | ") : hasRawValue ? "Current value has no matching target yet." : filteredOptions.length === 0 && query.trim() ? "No targets match this search." : emptyLabel}</small>
      {canCreate && (
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => {
          onCreateTarget?.(createId);
          onCommit(signedTargetValueForSelection(opcode, value, createId));
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
  desktopRuntime,
  projectDir,
  workspaceDir,
  onCommitItem,
  onCommitQuantity,
  onReplaceStock,
  onClearSlot
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  itemIds: number[];
  quantities: number[];
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
  onCommitItem: (index: number, value: number) => void;
  onCommitQuantity: (index: number, value: number) => void;
  onReplaceStock: (itemIds: number[], quantities: number[]) => void;
  onClearSlot: (index: number) => void;
}) {
  const [catalogCategory, setCatalogCategory] = useState<ItemReferenceCategory | "all">("weapon");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [changeAmount, setChangeAmount] = useState(1);
  const itemOptions = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);
  const itemOptionsByValue = useMemo(() => new Map(itemOptions.map((option) => [option.value, option])), [itemOptions]);
  const catalogItems = useMemo(() => filterItemTargetOptionsByCategory(itemOptions, catalogQuery, catalogCategory).slice(0, 72), [itemOptions, catalogQuery, catalogCategory]);
  const filledSlots = useMemo(() => {
    const slots: Array<{ slot: number; itemId: number; quantity: number; option: ItemReferenceOption | null }> = [];
    for (let index = 0; index < 1000; index += 1) {
      const itemId = itemIds[index] ?? 0;
      const quantity = quantities[index] ?? 0;
      if (itemId !== 0 || quantity !== 0) slots.push({ slot: index, itemId, quantity, option: itemOptionsByValue.get(itemId) ?? null });
    }
    return slots;
  }, [itemIds, itemOptionsByValue, quantities]);
  const adjustItem = (itemId: number) => {
    const next = adjustShopStock(itemIds, quantities, itemId, changeAmount);
    onReplaceStock(next.itemIds, next.quantities);
  };
  const filledCount = filledSlots.length;
  return (
    <CollapsibleSection title="Shop Inventory" eyebrow="shop stock" count={`${filledCount} filled`} density="compact" className="script-shop-stock-section" defaultOpen>
      <div className="script-shop-workbench">
        <section className="script-shop-catalog-editor" aria-label="Add shop stock">
          <header>
            <div>
              <strong>Add Stock</strong>
              <small>Pick a category like Divinity, then click an item to add or subtract the current quantity.</small>
            </div>
            <label>
              <span>Qty Change</span>
              <input type="number" value={changeAmount} onChange={(event) => setChangeAmount(clampShopQuantityDelta(Number(event.currentTarget.value) || 0))} />
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
          <input className="script-item-catalog-search" value={catalogQuery} onChange={(event) => setCatalogQuery(event.currentTarget.value)} placeholder="Search item name, ID, source, or use..." />
          <div className="script-shop-catalog-list">
            {catalogItems.map((option) => {
              const quantity = shopQuantityForItem(itemIds, quantities, option.value);
              return (
                <button key={option.key} type="button" onClick={() => adjustItem(option.value)}>
                  <ShopItemIcon option={option} project={project} catalog={catalog} desktopRuntime={desktopRuntime} projectDir={projectDir} workspaceDir={workspaceDir} />
                  <span>
                    <strong>{itemOptionDisplayName(option)}</strong>
                    <small>{[option.detail, option.sourceState].filter(Boolean).join(" | ")}</small>
                  </span>
                  <b>{quantity}</b>
                </button>
              );
            })}
            {catalogItems.length === 0 && <small>No items match this category/search.</small>}
          </div>
        </section>
        <section className="script-shop-inventory-panel" aria-label="Stocked shop items">
          <header>
            <div>
              <strong>Stocked Items</strong>
              <small>{filledCount ? "The rows Realmz copies into a new game shop inventory." : "No stock yet. Add items from the catalog."}</small>
            </div>
            <span>{filledCount} / 1000 slots</span>
          </header>
          <div className="script-shop-inventory-list">
            {filledSlots.map((row) => (
              <div key={row.slot} className="script-shop-stock-row">
                <ShopItemIcon option={row.option} project={project} catalog={catalog} itemId={row.itemId} desktopRuntime={desktopRuntime} projectDir={projectDir} workspaceDir={workspaceDir} />
                <div className="script-shop-stock-item">
                  <strong>{row.option ? itemOptionDisplayName(row.option) : `Raw item ${row.itemId}`}</strong>
                  <small>{row.option ? [row.option.detail, row.option.sourceState].filter(Boolean).join(" | ") : itemReferenceDetail(project, row.itemId, catalog)}</small>
                </div>
                <label className="script-shop-stock-id">
                  <span>Item ID</span>
                  <input type="number" value={row.itemId} onChange={(event) => onCommitItem(row.slot, Number(event.currentTarget.value) || 0)} />
                </label>
                <label className="script-shop-stock-qty">
                  <span>Qty</span>
                  <input type="number" min={0} max={255} value={row.quantity} onChange={(event) => onCommitQuantity(row.slot, clampShopQuantity(Number(event.currentTarget.value) || 0))} />
                </label>
                <span className="script-shop-stock-slot">Slot {row.slot}</span>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => onClearSlot(row.slot)}>Clear</button>
              </div>
            ))}
            {filledSlots.length === 0 && <p className="script-shop-stock-empty">No stocked items yet. Search the catalog and add a quantity to start this shop.</p>}
          </div>
        </section>
      </div>
    </CollapsibleSection>
  );
}

function ShopItemIcon({
  option,
  project,
  catalog,
  itemId,
  desktopRuntime,
  projectDir,
  workspaceDir
}: {
  option: ItemReferenceOption | null;
  project: Project;
  catalog?: LibraryCatalog | null;
  itemId?: number;
  desktopRuntime: boolean;
  projectDir: string;
  workspaceDir: string;
}) {
  const iconId = option?.iconId ?? null;
  const iconUrl = useIconPreviewUrl(iconId, project, catalog, { desktopRuntime, projectDir, workspaceDir });
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [iconUrl]);
  const usableUrl = iconUrl && iconUrl !== failedUrl ? iconUrl : null;
  const fallback = option ? itemCategoryBadge(option.category) : itemId ? String(Math.abs(itemId) % 100) : "?";
  return (
    <span className="script-shop-item-icon" title={iconId ? `cicn ${iconId}` : itemId ? `Item ${itemId}` : "No item icon"}>
      {usableUrl ? <img src={usableUrl} alt="" onError={() => setFailedUrl(usableUrl)} /> : <i>{fallback}</i>}
    </span>
  );
}

function itemOptionDisplayName(option: ItemReferenceOption) {
  return option.label.replace(/\s+\(-?\d+\)$/, "");
}

function itemCategoryBadge(category: ItemReferenceCategory) {
  if (category === "weapon") return "W";
  if (category === "armor") return "AR";
  if (category === "accessory") return "AC";
  if (category === "magic") return "M";
  if (category === "supply") return "SP";
  return "IT";
}

function clampShopQuantity(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(value)));
}

function clampShopQuantityDelta(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-255, Math.min(255, Math.trunc(value)));
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
