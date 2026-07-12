import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, CopyPlus, Eye, Plus, Save, Trash2, X } from "lucide-react";
import { Action, Ed3ReachabilityRow, EncounterActionRow, LevelType, LibraryCatalog, MapCoordinateTarget, Project, ProjectCommand, QuestThread, RealmzTargetRecordKind, ScriptDetailSurface, ScriptInventoryFilter, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import { linksFor, selectEntityFromId, semanticLabel, triggerEntityId } from "../utils";
import { actionSlotEntitiesForTriggerRecord, ed3ReachabilityFor, extraActionEvidenceSummary, extraActionPointClassification } from "../semanticGraph";
import { EdcdRowEditor } from "../components/EdcdRowEditor";
import { buildEdcdRowUsages, edcdUsageForAction, edcdUsageMatchesFilter, edcdUsageStatusTone, edcdUsageToEditorUsage, nextUnusedEdcdRowId, normalizeEdcdValues, type EdcdRowFilter, type EdcdRowUsage, type EdcdRowCaller } from "../edcdRows";
import { TargetPicker, filterTargetOptions, resolveSignedMessageTarget, signedTargetBehaviorLabel, signedTargetValueForSelection, targetOptionForOpcodeValue, targetPickerConfig, type ScriptTargetOption } from "../components/RealmzTargetPicker";
import { TutorialTip } from "../components/TutorialTip";
import { useIconPreviewUrl, useResolvedPreviewUrl } from "../previewUrls";
import { categoryColor } from "../components/TileSprite";
import { CollapsibleSection, EmptyState, FieldRow, FloatingWorkbenchPanel, PanelSection, ScrollArea } from "../ui";
import { useDraftChangeGuards } from "../app/draftChangeGuard";
import { ACTION_OPTIONS, actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "../realmzActions";
import { edcdFieldNamesForShape } from "../realmzEdcd";
import { opcodeIdMeaning, parameterLabelsForOpcode } from "../opcodeCrosswalk";
import { divinityHelpForOpcode } from "../divinityOpcodeHelp";
import { ScriptDiagnostic, validateActionDraft } from "../scriptValidation";
import { actionPointCapacity, isReusableDoorPlaceholder, nextActionPointRecordIndex } from "../actionPointCapacity";
import { realmzScriptStepDescriptorFor } from "../realmzScriptDescriptors";
import { actionPointMarkerStateForTrigger, isSecretActionPointState } from "../map/actionPointMarkers";
import { validateRealmzTargetRecord } from "../targetValidation";
import { buildQuestPresentation, questCategoryLabel, QUEST_CATEGORIES, type QuestFlagModel, type QuestUsage } from "../questUsage";
import {
  ITEM_REFERENCE_CATEGORIES,
  filterItemReferenceOptionsByCategory,
  itemCategoryBadge,
  itemOptionDisplayName,
  itemReferenceDetail,
  itemReferenceOptions,
  type ItemReferenceCategory,
  type ItemReferenceOption
} from "../itemReferences";
import { monsterReferenceDetail, monsterReferenceOptions } from "../monsterReferences";
import { CONDITION_LABELS, RESISTANCE_TYPES } from "../rulesCatalog";
import {
  ED3_EVIDENCE_FILTERS,
  EXTRA_ACTION_INVENTORY_FILTERS,
  SCRIPT_INVENTORY_FILTERS,
  ScriptListItem,
  actionBelongsTo,
  actionSummary,
  filterScriptsByInventory,
  hasScriptWarning,
  issueCountsBySlot,
  scriptMatchesInventoryFilter,
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
  actionDefinitionPathLabel,
  actionDefinitionsForCategory,
  canonicalActionChooserOpcode,
  scriptActionDefinitionFor,
  scriptActionSummary,
  scriptStepBranchHint,
  scriptStepFlowRoutes,
  type ScriptActionCategoryFilter,
  type ScriptActionDefinition
} from "./scripts/scriptActionCatalog";
import {
  buildEncounterDecisionSources,
  encounterActionIsPlayerObservable,
  resultStatusCounts,
  shortSnippet,
  type EncounterDecisionSource
} from "./scripts/encounterFlow";
import { EncounterShell } from "./scripts/EncounterShell";
import { ItemIdField } from "./scripts/ItemIdField";
import { encounterEntityId } from "./scripts/EncounterRecordPicker";
import { NumberField } from "./scripts/NumberField";
import { ReferenceIdField, nextAuthorableTargetId } from "./scripts/ReferenceIdField";
import {
  ROGUE_DISARM_TRAP_SPELL_PATH,
  ROGUE_OPEN_LOCK_SPELL_PATH,
  ThiefEncounterShell,
  rogueSpellPathSummary
} from "./scripts/ThiefEncounterShell";
import { TimedEncounterShell, timedEncounterEligibilitySummary } from "./scripts/TimedEncounterShell";
import { ActionPointActionChooser } from "./scripts/ActionPointActionChooser";
import { ActionPointDirectTargetField } from "./scripts/ActionPointDirectTargetField";
import { ActionPointStepReference } from "./scripts/ActionPointStepReference";
import { ActionPointTargetPreview } from "./scripts/ActionPointTargetPreview";
import { InlineMessageTargetEditor } from "./scripts/InlineMessageTargetEditor";
import { ScriptDiagnostics } from "./scripts/ScriptDiagnostics";
import { actionPointDiagnosticDependencyKey, validateActionPointTriggerCached } from "./scripts/actionPointDiagnostics";
import { defaultDraftForProject, edcdDraftValuesEqual, type EdcdStepDraft } from "./scripts/actionPointDraft";
import { actionSlotIndexFromSelection, actionSlotSelectionId, includeSelectedTrigger } from "./scripts/actionPointSelection";
import {
  actionSettingsFieldLabel,
  actionSettingsTitleForStep,
  authorSettingsWarning,
  combatMacroActionNote,
  combatMacroContextBody,
  combatMacroContextLabel,
  combatMacroContextTitle,
  humanActionValueLabel,
  type CombatMacroContext,
  type CombatMacroReference
} from "./scripts/actionPointPresentation";
import { updateArraySlot } from "./scripts/arraySlots";

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
const REQUIRED_WEAPON_MAX_SPECIFIC_CODE = 253;

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
const CREATE_AP_HELP =
  "Creates a map or dungeon Action Point at the chosen cell. Realmz stores these as fixed records, so Providence reuses empty slots instead of shifting later record IDs.";
const SAME_AS_TRIGGER_DESTINATION_HELP =
  "This after-script destination exactly matches the trigger cell, so Providence shows it as a read-only mirror here. To make it separate, select this Action Point on Maps, expand After Script Destination, and edit Level/X/Y there.";
const INVENTORY_FILTER_HELP =
  "Use Current Map while authoring one area, Active for non-empty records, Reusable for cleared fixed slots, Warnings before release, and All when tracing links across the scenario.";
const SCRIPT_RECORD_HELP =
  "This selected record is the source-backed script container. Map Action Points have chance/location/goto fields; Extra Action Points store only the eight steps until another script calls them.";
const CLEAR_SCRIPT_HELP =
  "Clear keeps Realmz's fixed record shape intact. Clearing a map Action Point makes the slot reusable; deleting an Extra Action Point uses the safe row command for that reusable script.";
const STEP_LIST_HELP =
  "Realmz scripts have eight ordered CODE/ID slots. Select a slot to edit it, then apply the draft; moving, duplicating, or clearing a step affects only that selected slot.";
const TARGET_DRAWER_HELP =
  "Target opens context for the record selected by this step. Small records such as strings can be edited here; larger records such as encounters, battles, shops, treasures, and monsters open in their primary workbench.";
const FLOW_PREVIEW_HELP =
  "Flow Preview summarizes obvious branches, GOSUBs, Extra Action Point calls, choices, and logic paths. It is a navigation aid, not a full runtime interpreter.";
const TECHNICAL_DETAILS_HELP =
  "Technical Details shows the raw Realmz storage: source file, record index, door ID, selected slot, applied and draft CODE/ID, Action Settings storage row, dispatcher status, and semantic links.";
const TARGET_PICKER_HELP =
  "The target picker resolves the selected opcode's expected record type and can create safe source-backed shells when Providence has a writer for that target family.";
const SETTINGS_HELP =
  "Action Settings hold the extra fields for actions whose CODE/ID slot is too small. Pick the storage row from its caller when possible; Providence names the fields for the selected action and keeps imported storage stable.";
const SIMPLE_ENCOUNTER_SOURCE_HELP =
  "Simple Encounters are Data ED source records. The prompt points to a String, the four option labels live inside this record, and each option result jumps to one of four script columns.";
const COMPLEX_ENCOUNTER_SOURCE_HELP =
  "Complex Encounters are Data ED2 source records. Player choices, typed replies, magic responses, item responses, and Rogue Encounters all reduce to result numbers that run one of four script columns.";
const ROGUE_ENCOUNTER_SOURCE_HELP =
  "Rogue Encounters are Data TD2 source records for locks, traps, search, and thief-skill actions. Runtime can mark traps detected, disabled, or sprung without changing this source record.";
const TIMED_ENCOUNTER_SOURCE_HELP =
  "Time Encounters are Data TD3 source records. Realmz checks schedule, chance, location, item, and quest gates, then runs the Extra Action Point target when everything matches.";
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
  const { registerDraftGuard, confirmBeforeDraftDiscard } = useDraftChangeGuards();
  const activeTabKind = scriptTabKind(activeEditor);
  const scripts = useMemo(
    () => project?.triggers.filter((trigger) => triggerVisibleForEditor(project, trigger, activeEditor)) ?? [],
    [project, activeEditor]
  );
  const projectMaps = project?.maps ?? [];
  const [draft, setDraft] = useState<Record<string, { rawCode: number; id: number }>>({});
  const [edcdStepDrafts, setEdcdStepDrafts] = useState<Record<string, EdcdStepDraft>>({});
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
  const performSelectStepSlot = useCallback((slot: number) => {
    setSelectedSlot(slot);
    if (selectedTrigger) {
      onSelectEntity(selectEntityFromId(actionSlotSelectionId(selectedTrigger, slot)));
    }
  }, [onSelectEntity, selectedTrigger]);
  useEffect(() => {
    const slot = actionSlotIndexFromSelection(selectedEntity?.id);
    if (slot == null || slot < 0 || slot > 7 || slot === selectedSlot) return;
    if (!selectedTrigger || !triggerMatchesSelection(selectedTrigger, selectedEntity?.id ?? "")) return;
    setSelectedSlot(slot);
  }, [selectedEntity?.id, selectedSlot, selectedTrigger]);
  useEffect(() => {
    if (!selectedTrigger) return;
    if (selectedSlot >= 0 && selectedSlot <= 7) return;
    setSelectedSlot(selectedTrigger.actions[0]?.slot ?? 0);
  }, [selectedTrigger?.id, selectedSlot, selectedTrigger]);
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
  const slotDraft = (slot: number, action?: Action) => draft[`${selectedTrigger?.id}:${slot}`] ?? { rawCode: action?.rawCode ?? 0, id: action?.id ?? 0 };
  const selectedAction = selectedTrigger?.actions.find((candidate) => candidate.slot === selectedSlot);
  const selectedKey = `${selectedTrigger?.id}:${selectedSlot}`;
  const selectedDraft = slotDraft(selectedSlot, selectedAction);
  const selectedDraftDirty = selectedAction
    ? selectedDraft.rawCode !== selectedAction.rawCode || selectedDraft.id !== selectedAction.id
    : selectedDraft.rawCode !== 0 || selectedDraft.id !== 0;
  const selectedOption = actionOptionFor(selectedDraft.rawCode);
  const selectedEdcdDraftKey = selectedTrigger && selectedOption.edcdShape
    ? `${selectedKey}:${selectedDraft.rawCode}:${selectedDraft.id}:${selectedOption.edcdShape}`
    : "";
  const selectedEdcdDraftPrefix = selectedTrigger ? `${selectedKey}:` : "";
  const selectedEdcdStepDraft = selectedEdcdDraftKey ? edcdStepDrafts[selectedEdcdDraftKey] : undefined;
  const selectedStepDirty = selectedDraftDirty || Boolean(selectedEdcdStepDraft?.dirty || selectedEdcdStepDraft?.secondaryDirty);
  const selectedDefinition = scriptActionDefinitionFor(selectedDraft.rawCode);
  const edcdUsages = useMemo(
    () => project && activeTabKind === "settings-rows" ? buildEdcdRowUsages(project, catalog) : [],
    [project, catalog, activeTabKind]
  );
  const filteredDefinitions = actionDefinitionsForCategory(categoryFilter, opcodeQuery);
  const selectedSlotEntity: SemanticEntity | undefined = undefined;
  const selectedEdcdUsageModel = useMemo(
    () => selectedOption.edcdShape ? edcdUsageForAction(project, catalog, selectedDraft.rawCode, Math.max(0, selectedDraft.id)) : null,
    [catalog, project, selectedDraft.id, selectedDraft.rawCode, selectedOption.edcdShape]
  );
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
  const setSelectedDraft = useCallback((values: { rawCode: number; id: number }) => setDraft((current) => ({ ...current, [selectedKey]: values })), [selectedKey]);
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
      return {
        ...current,
        [selectedEdcdDraftKey]: {
          values: previous?.values ?? fallbackPrimary,
          dirty: previous?.dirty ?? false,
          secondaryValues: normalized,
          secondaryDirty: dirty
        }
      };
    });
  }, [selectedDefinition.defaultDraft.parameters, selectedEdcdDraftKey, selectedEdcdUsageModel?.secondaryRowId, selectedEdcdUsageModel?.values]);
  const discardSelectedDraft = useCallback(() => {
    setDraft((current) => {
      if (!(selectedKey in current)) return current;
      const next = { ...current };
      delete next[selectedKey];
      return next;
    });
    setEdcdStepDrafts((current) => {
      if (!selectedEdcdDraftPrefix || !Object.keys(current).some((key) => key.startsWith(selectedEdcdDraftPrefix))) return current;
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (key.startsWith(selectedEdcdDraftPrefix)) delete next[key];
      }
      return next;
    });
  }, [selectedEdcdDraftPrefix, selectedKey]);
  const applySelectedSlot = useCallback(() => {
    if (!selectedTrigger || !onApplyCommand) return false;
    if (selectedOption.edcdShape) {
      const edcdValues = selectedEdcdStepDraft?.values
        ?? normalizeEdcdValues(selectedEdcdUsageModel?.values ?? selectedDefinition.defaultDraft.parameters);
      const secondaryEdcdValues = selectedEdcdUsageModel?.secondaryRowId == null
        ? undefined
        : selectedEdcdStepDraft?.secondaryValues ?? normalizeEdcdValues(selectedEdcdUsageModel.secondaryValues ?? undefined);
      onApplyCommand({
        kind: "applyRealmzScriptStep",
        label: `Update slot ${selectedSlot}`,
        triggerId: selectedTrigger.id,
        slot: selectedSlot,
        opcode: selectedDraft.rawCode,
        id: selectedDraft.id,
        edcdValues,
        secondaryEdcdValues
      });
    } else {
      onApplyCommand({
        kind: "updateActionSlot",
        label: `Update slot ${selectedSlot}`,
        triggerId: selectedTrigger.id,
        slot: selectedSlot,
        rawCode: selectedDraft.rawCode,
        id: selectedDraft.id
      });
    }
    discardSelectedDraft();
    return true;
  }, [discardSelectedDraft, onApplyCommand, selectedDefinition.defaultDraft.parameters, selectedDraft.id, selectedDraft.rawCode, selectedEdcdStepDraft?.secondaryValues, selectedEdcdStepDraft?.values, selectedEdcdUsageModel?.secondaryRowId, selectedEdcdUsageModel?.secondaryValues, selectedEdcdUsageModel?.values, selectedOption.edcdShape, selectedSlot, selectedTrigger]);
  const requestDraftNavigation = useCallback((label: string, action: () => void) => {
    confirmBeforeDraftDiscard(label, action);
  }, [confirmBeforeDraftDiscard]);
  useEffect(() => {
    if (!selectedTrigger || !selectedStepDirty) return;
    return registerDraftGuard({
      id: `script-step:${selectedTrigger.id}:${selectedSlot}`,
      surface: "scripts",
      title: `${scriptLabel(project, selectedTrigger)} - Step ${selectedSlot + 1}`,
      summary: scriptDraftGuardSummary(project, selectedTrigger, selectedSlot, selectedAction, selectedDraft, selectedDefinition),
      apply: applySelectedSlot,
      discard: discardSelectedDraft
    });
  }, [applySelectedSlot, discardSelectedDraft, project, registerDraftGuard, selectedAction, selectedDefinition, selectedDraft, selectedSlot, selectedStepDirty, selectedTrigger]);
  const handleSelectTrigger = useCallback((trigger: TriggerRecord) => {
    if (trigger.id === selectedTrigger?.id) return;
    requestDraftNavigation(`select ${scriptLabel(project, trigger)}`, () => performSelectTrigger(trigger));
  }, [performSelectTrigger, project, requestDraftNavigation, selectedTrigger?.id]);
  const selectStepSlot = useCallback((slot: number) => {
    if (slot === selectedSlot) return;
    requestDraftNavigation(`select step ${slot + 1}`, () => performSelectStepSlot(slot));
  }, [performSelectStepSlot, requestDraftNavigation, selectedSlot]);
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
    performSelectStepSlot(toSlot);
    onApplyCommand?.({ kind: "swapActionSlots", label: "Move step", triggerId: selectedTrigger.id, fromSlot: selectedSlot, toSlot });
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
      <button
        type="button"
        className="btn btn-danger btn-xs icon-only"
        title="Clear step"
        disabled={!selectedAction && !selectedStepDirty}
        onClick={clearSelectedStep}
      >
        <X size={12} />
      </button>
      {directTargetDrawerAvailable && (
        <button
          type="button"
          className={`btn btn-secondary btn-xs${targetDrawerOpen ? " active" : ""}`}
          title={targetDrawerOpen ? "Hide target details" : "Open the selected target details"}
          onClick={() => setTargetDrawerOpen(!targetDrawerOpen)}
        >
          Target
        </button>
      )}
      <button
        type="button"
        className={`btn btn-primary btn-xs script-apply-button${selectedStepDirty ? " is-dirty" : ""}`}
        title={selectedStepDirty ? "Apply this step to the script." : "This step is already applied."}
        disabled={!selectedStepDirty}
        onClick={applySelectedSlot}
      >
        <Save size={12} /> Apply Step
      </button>
    </>
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
    <SelectedStepDetail
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
      edcdUsages={edcdUsages}
      selectedTriggerId={selectedTrigger.id}
      selectedEdcdRowId={selectedEdcdRowId}
      selectedSlotEntity={selectedSlotEntity}
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
      {!selectedMap && activeTabKind === "action-points" && (
        <div className="script-create-strip script-create-empty">
          <div>
            <strong>Create a map before adding Action Points</strong>
            <small>Map Action Points live on fixed land or dungeon records. Start with Land Level 0, then place the first Action Point at a cell.</small>
          </div>
          <button type="button" className="btn btn-primary btn-xs script-create-primary" onClick={() => onApplyCommand?.({ kind: "createMap", label: "Create Land Level 0", levelType: "land" })}>
            <Plus size={12} /> New Land Level 0
          </button>
        </div>
      )}
      {selectedMap && activeTabKind === "action-points" && (
        <div className="script-create-strip">
          <label>
            <TutorialTip title="New Action Point" body={CREATE_AP_HELP} side="below">
              <span>Map</span>
            </TutorialTip>
            <select value={newActionPoint.mapId} onChange={(event) => setNewActionPoint({ ...newActionPoint, mapId: event.currentTarget.value })}>
              {projectMaps.map((map) => (
                <option key={map.id} value={map.id}>{map.name}</option>
              ))}
            </select>
          </label>
          <NumberField label="X" value={newActionPoint.x} onCommit={(x) => setNewActionPoint({ ...newActionPoint, x: clampRealmzCoordinate(x) })} />
          <NumberField label="Y" value={newActionPoint.y} onCommit={(y) => setNewActionPoint({ ...newActionPoint, y: clampRealmzCoordinate(y) })} />
          <button
            type="button"
            className="btn btn-primary btn-xs script-create-primary"
            disabled={!selectedMapCapacity?.canCreate}
            title={actionPointCreateTitle}
            onClick={createSelectedMapActionPoint}
          >
            <Plus size={12} /> Action Point
          </button>
          {selectedTrigger && (
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => onApplyCommand?.({ kind: "duplicateTrigger", label: "Duplicate script", triggerId: selectedTrigger.id })}>
              <Copy size={12} /> Duplicate
            </button>
          )}
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
          {extraActionEvidenceFilterActive && (
            <div className="script-tab-note">
              <strong>{(inventoryCounts.get(inventoryFilter) ?? 0).toLocaleString()} Extra Action Point row(s) in this filter</strong>
              <small>These rows are preserved with the scenario. The unlinked and evidence filters separate imported reusable script rows without source-backed callers from callable Extra Action Points.</small>
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
                onSelectTrigger={handleSelectTrigger}
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
                    <button
                      className="btn btn-danger btn-xs"
                      type="button"
                      title={isMacro ? "Delete this Extra Action Point" : "Clear this Action Point record so it can be reused"}
                      onClick={clearSelectedScript}
                    >
                      <Trash2 size={12} /> {isMacro ? deleteMacroLabel : "Clear Action Point"}
                    </button>
                  </TutorialTip>
                </div>
              </div>
              <ScriptDiagnostics issues={triggerDiagnostics.filter((issue) => issue.slot == null)} />
              {isMacro ? (
                <>
                  {selectedCombatMacroContext && (
                    <CombatMacroContextCard context={selectedCombatMacroContext} onSelectEntity={openTargetEntity} />
                  )}
                </>
              ) : (
                <div className="script-header-grid">
                  <section className="script-header-group script-header-chance" aria-label="Activation Chance">
                    <h4>Activation</h4>
                    <NumberField
                      label="%"
                      value={selectedTrigger.percent}
                      onCommit={(percent) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action chance", triggerId: selectedTrigger.id, fields: { percent } })}
                    />
                    {selectedTrigger.levelType === "land" ? (
                      <small className="script-ap-secret-status">
                        {selectedMarkerState === "secret" ? "Hidden Secret via land cell state" : selectedMarkerState === "revealed-secret" ? "Revealed Secret via land cell state" : "Normal land cell; edit Secret Area in Maps"}
                      </small>
                    ) : (
                      <small className="script-ap-dungeon-secret-status">
                        {selectedIsSecret ? "Secret via Dungeon Allow Move flags" : "Dungeon Draw controls Secret directions"}
                      </small>
                    )}
                    {selectedMarkerState === "revealed-secret" && <small className="script-ap-marker-status">Already revealed</small>}
                  </section>
                  <section className="script-header-group script-header-location" aria-label="Trigger Location">
                    <div className="script-header-title-row">
                      <h4>Trigger Location</h4>
                    </div>
                    <div className="script-header-fields">
                      <label className="script-header-map-field script-header-inline-field">
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
                        label="X"
                        value={selectedTrigger.coordinate?.x ?? selectedTrigger.targetX ?? 0}
                        onCommit={(x) => moveSelectedActionPoint({ x })}
                      />
                      <NumberField
                        label="Y"
                        value={selectedTrigger.coordinate?.y ?? selectedTrigger.targetY ?? 0}
                        onCommit={(y) => moveSelectedActionPoint({ y })}
                      />
                      <MapCoordinateJumpButton
                        target={triggerLocationMapTarget}
                        maps={projectMaps}
                        label="Open trigger location on Maps"
                        onOpenMapCoordinate={previewMapCoordinate}
                      />
                    </div>
                  </section>
                  <section className={`script-header-group script-header-destination${destinationMatchesTrigger ? " is-same" : ""}`} aria-label="After Script Destination">
                    <div className="script-header-title-row">
                      <div className="script-header-summary-label">
                        <h4>After Script Destination</h4>
                        {destinationMatchesTrigger && (
                          <TutorialTip title="Same As Trigger" body={SAME_AS_TRIGGER_DESTINATION_HELP} side="below">
                            <small>Same as trigger</small>
                          </TutorialTip>
                        )}
                      </div>
                    </div>
                    <div className="script-header-fields">
                      <label className="script-header-map-field script-header-inline-field">
                        <span>Map</span>
                        <select
                          value={afterScriptMapKey}
                          disabled={destinationMatchesTrigger}
                          onChange={(event) => {
                            const [, levelIndex] = event.currentTarget.value.split(":");
                            onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target level", triggerId: selectedTrigger.id, fields: { landid: Number(levelIndex) } });
                          }}
                        >
                          {afterScriptMaps.map((map) => (
                            <option key={map.id} value={`${map.levelType}:${map.index}`}>{map.name}</option>
                          ))}
                        </select>
                      </label>
                      <NumberField
                        label="X"
                        value={selectedTrigger.targetX ?? 0}
                        disabled={destinationMatchesTrigger}
                        onCommit={(targetX) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target X", triggerId: selectedTrigger.id, fields: { targetX } })}
                      />
                      <NumberField
                        label="Y"
                        value={selectedTrigger.targetY ?? 0}
                        disabled={destinationMatchesTrigger}
                        onCommit={(targetY) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action target Y", triggerId: selectedTrigger.id, fields: { targetY } })}
                      />
                      <MapCoordinateJumpButton
                        target={afterScriptMapTarget}
                        maps={projectMaps}
                        label="Open after-script destination on Maps"
                        onOpenMapCoordinate={previewMapCoordinate}
                      />
                    </div>
                  </section>
                </div>
              )}
              <div className="realmz-visual-script-scroll" aria-label="Script step authoring area">
                <div className={`realmz-visual-script${floatingDetail ? " has-floating-detail" : ""}`}>
                  <PanelSection
                    title="Steps"
                    eyebrow={`${usedStepCount} of 8 used`}
                    count="8 max"
                    density="compact"
                    scroll
                    className="script-steps-panel"
                    actions={firstEmptyStep != null ? (
                      <button type="button" className="btn btn-primary btn-xs" onClick={() => selectStepSlot(firstEmptyStep)}>
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
                        const issueCount = slotIssues.errors + slotIssues.warnings;
                        const storageTitle = [
                          `CODE ${current.rawCode}`,
                          `ID ${current.id}`,
                          option.edcdShape ? "uses Action Settings" : "",
                          issueCount > 0 ? `${issueCount} validation ${issueCount === 1 ? "issue" : "issues"}` : ""
                        ].filter(Boolean).join(" | ");
                        return (
                          <button
                            key={slot}
                            className={`realmz-step-card${slot === selectedSlot ? " selected" : ""}${changed ? " dirty" : ""}${slotIssues.errors ? " has-error" : slotIssues.warnings ? " has-warning" : ""}`}
                            type="button"
                            onClick={() => selectStepSlot(slot)}
                            style={{ borderColor: categoryColor(option.category) }}
                          >
                            <span className="slot-index">{slot + 1}</span>
                            <span className="script-step-main">
                              <strong>{definition.shortLabel}</strong>
                              <small>{scriptActionSummary(project, catalog, current, actionSummary(action))}</small>
                              {branchHint && <small className="script-step-branch-hint">{branchHint}</small>}
                            </span>
                            <span className="script-step-storage" title={storageTitle} aria-label={storageTitle}>
                              <span>
                                <small>CODE</small>
                                <strong>{current.rawCode}</strong>
                              </span>
                              <span>
                                <small>ID</small>
                                <strong>{current.id}</strong>
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </ScrollArea>
                    {showInlineFlowPreview && (
                        <ScriptFlowPreview project={project} catalog={catalog} trigger={selectedTrigger} onSelectEntity={openTargetEntity} />
                    )}
                  </PanelSection>
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

function Ed3EvidenceDetails({ row }: { row: Ed3ReachabilityRow | null }) {
  if (!row) {
    return (
      <div className="ed3-evidence-details">
        <strong>Extra AP Evidence</strong>
        <small>No semantic reachability row is available for this imported Extra Action Point.</small>
      </div>
    );
  }
  const rawSignature = row.rawSignature.length > 0 ? row.rawSignature.join(", ") : "empty";
  const evidence = row.evidence.length > 0 ? row.evidence.join(", ") : "none";
  return (
    <div className="ed3-evidence-details">
      <header>
        <strong>Extra AP Evidence</strong>
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
          <span>Raw storage, CODE/ID, Action Settings storage row, dispatcher status, and semantic links.</span>
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
        <FieldRow label="Action Settings Row" value={selectedEdcdRowId != null ? `${selectedEdcdRowId}${resolvedEdcdUsage?.shape ? ` (${resolvedEdcdUsage.shape})` : ""}` : "none"} />
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

function CombatMacroContextCard({
  context,
  onSelectEntity
}: {
  context: CombatMacroContext;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const positiveBattleRefs = context.references.filter((reference) => reference.kind === "battle" && reference.runnable === false);
  return (
    <div className={`combat-macro-context-card ${context.kind}`}>
      <header>
        <div>
          <strong>{combatMacroContextTitle(context)}</strong>
          <small>{combatMacroContextLabel(context)}</small>
        </div>
        <span>{context.kind === "mixed" ? "battle + monster" : context.kind}</span>
      </header>
      <p>{combatMacroContextBody(context)}</p>
      {context.references.length > 0 && (
        <div className="combat-macro-reference-list">
          {context.references.slice(0, 12).map((reference) => (
            <button
              key={reference.key}
              type="button"
              className={reference.runnable === false ? "warning" : ""}
              title={reference.detail}
              disabled={!reference.entity}
              onClick={() => reference.entity && onSelectEntity(reference.entity)}
            >
              <strong>{reference.label}</strong>
              <small>{reference.detail}</small>
            </button>
          ))}
        </div>
      )}
      {positiveBattleRefs.length > 0 && (
        <small className="field-warning">Positive battle macro imports are preserved, but Realmz's normal battle macro path uses negative Data BD values.</small>
      )}
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
    }));
  if (flowSteps.length === 0) return null;
  return (
    <div className="script-flow-preview" aria-label="Branch and Extra Action Point preview">
      <TutorialTip title="Flow Preview" body={FLOW_PREVIEW_HELP} side="below">
        <strong>Flow Preview</strong>
      </TutorialTip>
      {flowSteps.map(({ action, definition, routes, summary }) => (
        <div key={`${action.slot}-${action.rawCode}-${action.id}`}>
          <span>{action.slot + 1}</span>
          <p>
            <b>{definition.shortLabel}</b>
            <small>{routes[0]?.target ? `${routes[0].label}: ${routes[0].target.label}` : routes[0]?.detail || summary}</small>
          </p>
          {routes[0]?.target && (
            <button
              type="button"
              className="btn btn-secondary btn-xs icon-only"
              title={`Open ${routes[0].target.label}`}
              aria-label={`Open ${routes[0].target.label}`}
              onClick={() => onSelectEntity(selectEntityForFlowTarget(routes[0].target!))}
            >
              <Eye size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function selectEntityForFlowTarget(target: { targetKind: string; value: number }): SelectedEntity {
  if (target.targetKind === "macro") return selectEntityFromId(`macro:${target.value}`);
  if (target.targetKind === "simpleEncounter") return selectEntityFromId(`encounter:simple:${target.value}`);
  if (target.targetKind === "complexEncounter") return selectEntityFromId(`encounter:complex:${target.value}`);
  if (target.targetKind === "thiefEncounter") return selectEntityFromId(`thief:${target.value}`);
  if (target.targetKind === "timedEncounter") return selectEntityFromId(`time:${target.value}`);
  if (target.targetKind === "message") return selectEntityFromId(`message:${target.value}`);
  if (target.targetKind === "scrollingText") return selectEntityFromId(`resource:TEXT:${target.value}`);
  if (target.targetKind === "treasure") return selectEntityFromId(`treasure:${target.value}`);
  if (target.targetKind === "shop") return selectEntityFromId(`shop:${target.value}`);
  if (target.targetKind === "monster") return selectEntityFromId(`monster:${target.value}`);
  if (target.targetKind === "battle") return selectEntityFromId(`battle:${target.value}`);
  if (target.targetKind === "mapRecord") return selectEntityFromId(`map-record:${target.value}`);
  if (target.targetKind === "item") return selectEntityFromId(`item:${target.value}`);
  return selectEntityFromId(`${target.targetKind}:${target.value}`);
}

function scriptDraftGuardSummary(
  project: Project,
  trigger: TriggerRecord,
  slot: number,
  applied: Action | undefined,
  draft: { rawCode: number; id: number },
  definition: ScriptActionDefinition
) {
  const appliedLabel = applied
    ? `${scriptActionDefinitionFor(applied.rawCode).shortLabel} (CODE ${applied.rawCode}, ID ${applied.id})`
    : "Empty";
  return [
    `Script: ${scriptLabel(project, trigger)}`,
    `Step: ${slot + 1}`,
    `Applied: ${appliedLabel}`,
    `Draft: ${definition.shortLabel} (CODE ${draft.rawCode}, ID ${draft.id})`
  ];
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
  onEdcdDraftChange,
  onSecondaryEdcdDraftChange,
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
  onSetSelectedDraft: (values: { rawCode: number; id: number }) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onPreviewEntity: (entity: SelectedEntity) => void;
  onOpenTool?: (tab: "text", editor: string) => void;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  onEdcdDraftChange?: (values: number[], dirty: boolean) => void;
  onSecondaryEdcdDraftChange?: (values: number[], dirty: boolean) => void;
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
  const selectedTargetPickerConfig = targetPickerConfig(selectedDraft.rawCode);
  const hasInlineTargetPicker = !isEdcdBackedStep && Boolean(selectedTargetPickerConfig);
  const isStepOnlyAction = selectedDefinition.formKind === "step-only";
  const inlineMessageTargetId = selectedTargetPickerConfig?.recordType === "message"
    ? resolveSignedMessageTarget(selectedDraft.rawCode, selectedDraft.id)
    : 0;
  const hasInlineMessageEditor = inlineMessageTargetId > 0;
  const previewCanExpand = Boolean(
    !hasInlineTargetPicker && selectedTargetPreview && [
      selectedTargetPreview.detail,
      selectedTargetPreview.summary,
      selectedTargetPreview.compatibility,
      selectedTargetPreview.sourceState,
      previewBehavior
    ].filter(Boolean).join(" ").length > 96
  );
  const authorSettingsTitle = actionSettingsTitleForStep(selectedDefinition, selectedOption.edcdShape);
  const authorSettingsLabel = actionSettingsFieldLabel(authorSettingsTitle);
  const definitionForActionChooserUse = (definition: ScriptActionDefinition) => {
    const canonicalOpcode = canonicalActionChooserOpcode(definition.opcode);
    if (canonicalOpcode !== 23) return definition;
    if (selectedDraft.rawCode === -23 || selectedTriggerRecord?.levelType === "dungeon") return scriptActionDefinitionFor(-23);
    return definition;
  };
  const selectActionDefinition = (definition: ScriptActionDefinition) => {
    onSetSelectedDraft(draftForNewDefinition(definitionForActionChooserUse(definition)));
    setActionChooserOpen(false);
  };
  const duplicateSettingsForStep = () => {
    if (!isEdcdBackedStep) return;
    const nextId = nextUnusedEdcdRowId(project);
    const values = normalizeEdcdValues(selectedRowUsage?.values ?? selectedDefaultEdcdValues);
    onApplyCommand?.({ kind: "updateEdcdRow", label: `Duplicate ${authorSettingsLabel}`, rowId: nextId, values });
    onSetSelectedDraft({ ...selectedDraft, id: nextId });
    if (selectedSlotApplied) {
      onApplyCommand?.({
        kind: "updateActionSlot",
        label: `Use ${authorSettingsLabel}`,
        triggerId: selectedTriggerId,
        slot: selectedSlot,
        rawCode: selectedDraft.rawCode,
        id: nextId
      });
    }
  };
  const settingsEditorPresentation = isEdcdBackedStep ? "selected-step" : "inventory";
  const settingsEditorContent = (isEdcdBackedStep || selectedEdcdUsage) ? (
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
      onOpenMapCoordinate={onOpenMapCoordinate}
      onDraftValuesChange={onEdcdDraftChange}
      onSecondaryDraftValuesChange={onSecondaryEdcdDraftChange}
      onStepOpcodeChange={(rawCode) => {
        if (rawCode !== 23 && rawCode !== -23) return;
        if (selectedDraft.rawCode === rawCode) return;
        onSetSelectedDraft({ ...selectedDraft, rawCode });
      }}
      onApplyCommand={onApplyCommand}
      showActionButtons={settingsEditorPresentation !== "selected-step"}
      presentation={settingsEditorPresentation}
    />
  ) : null;
  const settingsEditor = settingsEditorContent && settingsEditorPresentation === "inventory" ? (
    <div className="realmz-current-step-authoring-subpane">
      {settingsEditorContent}
    </div>
  ) : settingsEditorContent;
  const inlineTargetPicker = hasInlineTargetPicker ? (
    <div className="realmz-current-step-target">
      <TargetPicker
        project={project}
        catalog={catalog}
        opcode={selectedDraft.rawCode}
        value={selectedDraft.id}
        showDetail={!hasInlineMessageEditor}
        previewContext={{ desktopRuntime, projectDir, workspaceDir }}
        onChange={(id) => onSetSelectedDraft({ ...selectedDraft, id })}
        onInspect={onPreviewEntity}
        onCreate={(recordType, id) => {
          const targetId = id ?? nextAuthorableTargetId(project, recordType);
          onApplyCommand?.({ kind: "createTargetRecord", label: `Create ${recordType}`, recordType, id: targetId });
          onSetSelectedDraft({ ...selectedDraft, id: signedTargetValueForSelection(selectedDraft.rawCode, selectedDraft.id, targetId) });
        }}
      />
      {hasInlineMessageEditor && (
        <InlineMessageTargetEditor
          project={project}
          targetId={inlineMessageTargetId}
          onApplyCommand={onApplyCommand}
        />
      )}
      {!hasInlineMessageEditor && targetRecordPanel}
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
            previewUrl={selectedTargetPreviewUrl}
            definition={selectedDefinition}
            rawCode={selectedDraft.rawCode}
            behavior={previewBehavior}
            canExpand={previewCanExpand}
            expanded={previewExpanded}
            onToggleExpanded={() => setPreviewExpanded((current) => !current)}
            onPreviewEntity={onPreviewEntity}
          />
        )}
        {inlineTargetPicker}
        {!isEdcdBackedStep && !hasInlineTargetPicker && !isStepOnlyAction && (
          <ActionPointDirectTargetField
            selectedSlot={selectedSlot}
            rawCode={selectedDraft.rawCode}
            id={selectedDraft.id}
            definition={selectedDefinition}
            idLabel={selectedIdLabel}
            sameMapActionPointStep={isSameMapActionPointStep}
            sameMapTarget={sameMapActionPointTarget}
            sameMapJumpTitle={sameMapActionPointJumpTitle}
            onChange={onSetSelectedDraft}
            onPreviewEntity={onPreviewEntity}
          />
        )}
        {isEdcdBackedStep && selectedRowUsage?.warnings.map((warning) => (
          <p key={warning} className="field-warning">{authorSettingsWarning(selectedRowUsage, authorSettingsTitle, warning)}</p>
        ))}
        {isEdcdBackedStep && selectedRowUsage?.status === "shared" && (
          <button type="button" className="btn btn-secondary btn-xs duplicate-settings-button" onClick={duplicateSettingsForStep}>
            <Copy size={12} /> Duplicate {authorSettingsTitle} For This Step
          </button>
        )}
        {settingsEditor}
        {!hasInlineTargetPicker && targetRecordPanel && (
          <div className="realmz-current-step-authoring-subpane target-record-subpane">
            {targetRecordPanel}
          </div>
        )}
        {!hasInlineTargetPicker && targetRecordAvailable && !targetRecordOpen && !targetRecordPanel && (
          <div className="realmz-current-step-authoring-subpane target-record-restore-subpane">
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={onShowTargetRecord}
            >
              <Eye size={12} /> Show Target Details
            </button>
          </div>
        )}
      </div>
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
  presentation = "context",
  desktopRuntime = false,
  projectDir = "",
  workspaceDir = "",
  onSelectEntity,
  onSelectEditor,
  onSelectEncounterRecordType,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  opcode: number;
  targetId: number;
  recordType?: RealmzTargetRecordKind;
  presentation?: "context" | "workbench" | "inline";
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onSelectEncounterRecordType?: (recordType: RealmzTargetRecordKind) => void;
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
          body="This action keeps its string, battle, shop, item, or branch fields in the Settings section."
        />
      );
    }
    return <EmptyState compact title="No editable target" body="Choose an action with a target to edit string, battle, treasure, shop, or encounter details here." />;
  }
  if (targetId === 0 && !targetRecordExists(project, targetType, targetId)) {
    return <EmptyState compact title="No target selected" body="Choose an existing target or create a new one from the picker." />;
  }
  const targetIssues = validateRealmzTargetRecord(project, targetType, targetId, catalog);
  const targetChrome = presentation === "inline" ? "embedded" : "full";
  if (presentation === "workbench" && targetType === "simpleEncounter") {
    const record = project.simpleEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Simple Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create simple encounter", recordType: "simpleEncounter", id: targetId })}
      >
        {record && (
          <EncounterShell
            project={project}
            catalog={catalog}
            desktopRuntime={desktopRuntime}
            projectDir={projectDir}
            workspaceDir={workspaceDir}
            recordKind="simple"
            id={targetId}
            texts={record.texts}
            prompt={record.prompt}
            canBackOut={record.canBackOut}
            maxTimes={record.maxTimes}
            casteSuccess={record.casteSuccess}
            choiceResults={record.choiceResults}
            actions={record.actions}
            onSelectEntity={onSelectEntity}
            onSelectEditor={onSelectEditor}
            onSelectEncounterRecordType={onSelectEncounterRecordType}
            onApplyCommand={onApplyCommand}
            targetExists={(recordType, id) => targetRecordExists(project, recordType, id)}
            renderRecordPreview={(targetType, id) => encounterResultRecordPreview(project, catalog, targetType, id)}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (presentation === "workbench" && targetType === "complexEncounter") {
    const record = project.complexEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Complex Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create complex encounter", recordType: "complexEncounter", id: targetId })}
      >
        {record && (
          <EncounterShell
            project={project}
            catalog={catalog}
            desktopRuntime={desktopRuntime}
            projectDir={projectDir}
            workspaceDir={workspaceDir}
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
            actions={record.actions}
            onSelectEntity={onSelectEntity}
            onSelectEditor={onSelectEditor}
            onSelectEncounterRecordType={onSelectEncounterRecordType}
            onApplyCommand={onApplyCommand}
            targetExists={(recordType, id) => targetRecordExists(project, recordType, id)}
            renderRecordPreview={(targetType, id) => encounterResultRecordPreview(project, catalog, targetType, id)}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (presentation === "workbench" && targetType === "thiefEncounter") {
    const record = project.thiefEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Rogue Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue encounter", recordType: "thiefEncounter", id: targetId })}
      >
        {record && (
          <ThiefEncounterShell
            project={project}
            catalog={catalog}
            previewContext={{ desktopRuntime, projectDir, workspaceDir }}
            id={targetId}
            record={record}
            onSelectEntity={onSelectEntity}
            onApplyCommand={onApplyCommand}
          />
        )}
      </InlineTargetShell>
    );
  }
  if (presentation === "workbench" && targetType === "timedEncounter") {
    const record = project.timedEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Time Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create timed encounter", recordType: "timedEncounter", id: targetId })}
      >
        {record && <TimedEncounterShell project={project} catalog={catalog} id={targetId} record={record} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "message") {
    const record = project.messages?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`String ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create string", recordType: "message", id: targetId })}
        onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear string", recordType: "message", id: targetId })}
      >
        {record && (
          <label className="script-target-wide-field">
            <span>Text</span>
            <textarea
              key={`message:${targetId}`}
              defaultValue={record.text}
              maxLength={255}
              onBlur={(event) => onApplyCommand?.({ kind: "updateMessageRecord", label: "Update string", id: targetId, changes: { text: event.currentTarget.value } })}
            />
            <small>{record.text.length}/255 bytes before Classic encoding</small>
          </label>
        )}
      </InlineTargetShell>
    );
  }
  if ((targetType as RealmzTargetRecordKind) === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Battle ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle", recordType: "battle", id: targetId })}
      >
        {record && <TargetSummaryCard project={project} catalog={catalog} recordType="battle" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if ((targetType as RealmzTargetRecordKind) === "monster") {
    const record = project.monsters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Monster ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create monster", recordType: "monster", id: targetId })}
      >
        {record && <TargetSummaryCard project={project} catalog={catalog} recordType="monster" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if ((targetType as RealmzTargetRecordKind) === "treasure") {
    const record = project.treasures?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Treasure ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create treasure", recordType: "treasure", id: targetId })}
      >
        {record && <TargetSummaryCard project={project} catalog={catalog} recordType="treasure" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if ((targetType as RealmzTargetRecordKind) === "shop") {
    const record = project.shops?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Shop ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create shop", recordType: "shop", id: targetId })}
      >
        {record && <TargetSummaryCard project={project} catalog={catalog} recordType="shop" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Battle ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
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
              label="Before String"
              emptyLabel="No before string"
              opcode={1}
              value={record.messageBefore}
              createRecordType="message"
              onCommit={(messageBefore) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle string", id: targetId, changes: { messageBefore } })}
              onCreateTarget={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle string", recordType: "message", id })}
            />
            <ReferenceIdField
              project={project}
              catalog={catalog}
              label="After String"
              emptyLabel="No after string"
              opcode={1}
              value={record.messageAfter}
              createRecordType="message"
              onCommit={(messageAfter) => onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle string", id: targetId, changes: { messageAfter } })}
              onCreateTarget={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle string", recordType: "message", id })}
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
        exists={Boolean(record)}
        chrome={targetChrome}
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
                <RequiredWeaponField project={project} catalog={catalog} value={record.distance} onCommit={(distance) => update({ distance })} compact />
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
        exists={Boolean(record)}
        chrome={targetChrome}
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
        exists={Boolean(record)}
        chrome={targetChrome}
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
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        help={SIMPLE_ENCOUNTER_SOURCE_HELP}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create simple encounter", recordType: "simpleEncounter", id: targetId })}
      >
        {record && <EncounterTargetCard project={project} recordType="simpleEncounter" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "complexEncounter") {
    const record = project.complexEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Complex Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        help={COMPLEX_ENCOUNTER_SOURCE_HELP}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create complex encounter", recordType: "complexEncounter", id: targetId })}
      >
        {record && <EncounterTargetCard project={project} recordType="complexEncounter" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "timedEncounter") {
    const record = project.timedEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Time Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        help={TIMED_ENCOUNTER_SOURCE_HELP}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create time encounter", recordType: "timedEncounter", id: targetId })}
      >
        {record && <EncounterTargetCard project={project} recordType="timedEncounter" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "thiefEncounter") {
    const record = project.thiefEncounters?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Rogue Encounter ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
        issues={targetIssues}
        help={ROGUE_ENCOUNTER_SOURCE_HELP}
        onCreate={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue encounter", recordType: "thiefEncounter", id: targetId })}
      >
        {record && <EncounterTargetCard project={project} recordType="thiefEncounter" id={targetId} record={record} onSelectEntity={onSelectEntity} />}
      </InlineTargetShell>
    );
  }
  if (targetType === "questLabel") {
    const record = project.questLabels?.find((candidate) => candidate.id === targetId);
    return (
      <InlineTargetShell
        title={`Quest ${targetId}`}
        exists={Boolean(record)}
        chrome={targetChrome}
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
  exists,
  onCreate,
  onClear,
  issues,
  help,
  chrome = "full",
  children
}: {
  title: string;
  exists: boolean;
  onCreate: () => void;
  onClear?: () => void;
  issues?: ScriptDiagnostic[];
  help?: string;
  chrome?: "full" | "embedded";
  children: ReactNode;
}) {
  if (chrome === "embedded") {
    return (
      <div className="script-inline-target-editor embedded">
        {exists && issues && issues.length > 0 && <ScriptDiagnostics issues={issues} />}
        {exists ? children : (
          <div className="inline-message-target-missing">
            <small>This step points at {title}, but that target does not exist yet.</small>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onCreate}>Create {title}</button>
          </div>
        )}
      </div>
    );
  }
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
      {exists ? children : <small>This slot points at a target that does not exist yet.</small>}
    </div>
  );
}

function TargetSummaryCard({
  project,
  catalog,
  recordType,
  id,
  record,
  onSelectEntity
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordType: "battle" | "monster" | "treasure" | "shop";
  id: number;
  record:
    | Project["battles"][number]
    | Project["monsters"][number]
    | Project["treasures"][number]
    | Project["shops"][number];
  onSelectEntity?: (entity: SelectedEntity) => void;
}) {
  const entityId = `${recordType}:${id}`;
  const editorLabel = recordType === "battle" || recordType === "monster" ? "Combat" : "Economy";
  const open = onSelectEntity ? () => onSelectEntity(selectEntityFromId(entityId)) : undefined;
  if (recordType === "battle") {
    const battle = record as Project["battles"][number];
    const monsterSlots = battle.grid.filter(Boolean).length;
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Battle ${id}`} subtitle={`${monsterSlots} placed monster slot${monsterSlots === 1 ? "" : "s"}`} onOpen={open} buttonLabel={`Open in ${editorLabel}`} />
        <div className="encounter-target-facts">
          <span>Distance {battle.dist}</span>
          <span>{battle.messageBefore > 0 ? `Before string ${battle.messageBefore}` : "No before string"}</span>
          <span>{battle.messageAfter > 0 ? `After string ${battle.messageAfter}` : "No after string"}</span>
          <span>{battle.battleMacro > 0 ? `Battle action ${battle.battleMacro}` : "No battle action"}</span>
        </div>
      </div>
    );
  }
  if (recordType === "monster") {
    const monster = record as Project["monsters"][number];
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Monster ${id}`} subtitle={monster.displayName || `Monster name ${monster.nameId}`} onOpen={open} buttonLabel={`Open in ${editorLabel}`} />
        <div className="encounter-target-facts">
          <span>Icon {monster.iconId}</span>
          <span>Stamina level {monster.hitDice}</span>
          <span>Armor {monster.armor}</span>
          <span>{monster.deathMacro > 0 ? `Defeat action ${monster.deathMacro}` : "No defeat action"}</span>
        </div>
      </div>
    );
  }
  if (recordType === "treasure") {
    const treasure = record as Project["treasures"][number];
    const itemCount = treasure.itemIds.filter(Boolean).length;
    const firstItem = treasure.itemIds.find(Boolean);
    const firstItemLabel = firstItem ? itemReferenceDetail(project, firstItem, catalog) : "";
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Treasure ${id}`} subtitle={`${itemCount} item slot${itemCount === 1 ? "" : "s"}, ${treasure.gold} gold`} onOpen={open} buttonLabel={`Open in ${editorLabel}`} />
        <div className="encounter-target-facts">
          <span>{treasure.exp} victory points</span>
          <span>{treasure.gems} gems</span>
          <span>{treasure.jewelry} jewelry</span>
          <span>{firstItemLabel || "No item preview"}</span>
        </div>
      </div>
    );
  }
  const shop = record as Project["shops"][number];
  const stockCount = shop.itemIds.filter((itemId, index) => itemId > 0 && (shop.quantities[index] ?? 0) > 0).length;
  const firstStockIndex = shop.itemIds.findIndex((itemId, index) => itemId > 0 && (shop.quantities[index] ?? 0) > 0);
  const firstStockId = firstStockIndex >= 0 ? shop.itemIds[firstStockIndex] : 0;
  const firstStockLabel = firstStockId ? itemReferenceDetail(project, firstStockId, catalog) : "";
  return (
    <div className="encounter-target-card">
      <EncounterTargetCardHeader title={`Shop ${id}`} subtitle={`${stockCount} stocked slot${stockCount === 1 ? "" : "s"}, ${shop.inflation}% inflation`} onOpen={open} buttonLabel={`Open in ${editorLabel}`} />
      <div className="encounter-target-facts">
        <span>{firstStockLabel || "No stock preview"}</span>
        <span>{firstStockIndex >= 0 ? `${shop.quantities[firstStockIndex] ?? 0} in first stocked slot` : "Empty stock"}</span>
      </div>
    </div>
  );
}

function EncounterTargetCard({
  project,
  recordType,
  id,
  record,
  onSelectEntity
}: {
  project: Project;
  recordType: "simpleEncounter" | "complexEncounter" | "thiefEncounter" | "timedEncounter";
  id: number;
  record:
    | Project["simpleEncounters"][number]
    | Project["complexEncounters"][number]
    | Project["thiefEncounters"][number]
    | Project["timedEncounters"][number];
  onSelectEntity?: (entity: SelectedEntity) => void;
}) {
  const entityId = encounterEntityId(recordType, id);
  const open = onSelectEntity ? () => onSelectEntity({ type: "encounter", id: entityId }) : undefined;
  if (recordType === "simpleEncounter") {
    const simple = record as Project["simpleEncounters"][number];
    const sources = buildEncounterDecisionSources({
      recordKind: "simple",
      texts: simple.texts,
      actionResult: 0,
      wordResult: 0,
      groups: [],
      spellIds: [],
      spellResults: [],
      itemIds: [],
      itemResults: [],
      choiceResults: simple.choiceResults,
      actions: simple.actions,
      thief: false,
      rogueId: 0
    });
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Simple Encounter ${id}`} subtitle={messageSnippet(project, simple.prompt) || "No prompt string"} onOpen={open} />
        <EncounterTargetStatus actions={simple.actions} sources={sources} />
      </div>
    );
  }
  if (recordType === "complexEncounter") {
    const complex = record as Project["complexEncounters"][number];
    const rogueRecord = project.thiefEncounters?.find((candidate) => candidate.id === complex.thiefSuccess);
    const sources = buildEncounterDecisionSources({
      recordKind: "complex",
      texts: complex.texts,
      actionResult: complex.actionResult,
      wordResult: complex.wordResult,
      groups: complex.groups,
      spellIds: complex.spellIds,
      spellResults: complex.spellResults,
      itemIds: complex.itemIds,
      itemResults: complex.itemResults,
      choiceResults: complex.choiceResults,
      wordResults: complex.wordResults,
      thief: complex.thief,
      rogueId: complex.thiefSuccess,
      rogueRecord,
      actions: complex.actions
    });
    const configuredMagic = complex.spellIds.filter((id, slot) => id !== 0 && (complex.spellResults[slot] ?? 0) !== 0).length;
    const configuredItems = complex.itemIds.filter((id, slot) => id !== 0 && (complex.itemResults[slot] ?? 0) !== 0).length;
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Complex Encounter ${id}`} subtitle={messageSnippet(project, complex.prompt) || "No prompt string"} onOpen={open} />
        <EncounterTargetStatus actions={complex.actions} sources={sources} />
        <div className="encounter-target-facts">
          <span>{configuredMagic} magic response{configuredMagic === 1 ? "" : "s"}</span>
          <span>{configuredItems} item response{configuredItems === 1 ? "" : "s"}</span>
          <span>{complex.thief ? `Has Rogue Encounter ${complex.thiefSuccess || "unset"}` : "No Rogue Encounter"}</span>
        </div>
      </div>
    );
  }
  if (recordType === "thiefEncounter") {
    const rogue = record as Project["thiefEncounters"][number];
    const enabledCount = (rogue.typeFlags ?? []).slice(0, 8).filter(Boolean).length;
    return (
      <div className="encounter-target-card">
        <EncounterTargetCardHeader title={`Rogue Encounter ${id}`} subtitle={`${enabledCount}/8 rogue actions enabled`} onOpen={open} />
        <div className="encounter-target-facts">
          <span>{rogueSpellPathSummary(rogue, ROGUE_OPEN_LOCK_SPELL_PATH)}</span>
          <span>{rogueSpellPathSummary(rogue, ROGUE_DISARM_TRAP_SPELL_PATH)}</span>
          <span>{Boolean(rogue.typeFlags?.[9]) ? "Trap armed" : "No armed trap"}</span>
        </div>
      </div>
    );
  }
  const timed = record as Project["timedEncounters"][number];
  return (
    <div className="encounter-target-card">
      <EncounterTargetCardHeader title={`Time Encounter ${id}`} subtitle={timedEncounterEligibilitySummary(timed)} onOpen={open} />
      <div className="encounter-target-facts">
        <span>{timed.percent}% chance</span>
        <span>{timed.door > 0 ? `Runs Extra AP ${timed.door}` : "No Extra AP target"}</span>
        <span>{timed.locationKind === "any" ? "Any location" : `${timed.locationKind} level ${timed.requiredLevel}`}</span>
      </div>
    </div>
  );
}

function EncounterTargetCardHeader({ title, subtitle, onOpen, buttonLabel = "Open in Encounters" }: { title: string; subtitle: string; onOpen?: () => void; buttonLabel?: string }) {
  return (
    <header className="encounter-target-card-header">
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      {onOpen && (
        <button type="button" className="btn btn-primary btn-xs" onClick={onOpen}>
          {buttonLabel}
        </button>
      )}
    </header>
  );
}

function EncounterTargetStatus({ actions, sources }: { actions: EncounterActionRow[]; sources: EncounterDecisionSource[] }) {
  const resultCounts = resultStatusCounts(actions);
  const warningCount = sources.filter((source) => source.status !== "visible" && source.result !== 0).length;
  return (
    <>
      <div className="encounter-target-status">
        <span>{resultCounts.visible} visible</span>
        <span>{resultCounts.empty} empty</span>
        <span>{sources.length} response path{sources.length === 1 ? "" : "s"}</span>
      </div>
      {warningCount > 0 && (
        <p className="field-warning">{warningCount} response path{warningCount === 1 ? "" : "s"} route to an empty, missing, or out-of-range result.</p>
      )}
    </>
  );
}

function encounterResultRecordPreview(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  targetType: Exclude<RealmzTargetRecordKind, "message" | "questLabel">,
  targetId: number
) {
  if (targetType === "battle") {
    const record = project.battles?.find((candidate) => candidate.id === targetId);
    return record ? <TargetSummaryCard project={project} catalog={catalog} recordType="battle" id={targetId} record={record} /> : null;
  }
  if (targetType === "monster") {
    const record = project.monsters?.find((candidate) => candidate.id === targetId);
    return record ? <TargetSummaryCard project={project} catalog={catalog} recordType="monster" id={targetId} record={record} /> : null;
  }
  if (targetType === "treasure") {
    const record = project.treasures?.find((candidate) => candidate.id === targetId);
    return record ? <TargetSummaryCard project={project} catalog={catalog} recordType="treasure" id={targetId} record={record} /> : null;
  }
  if (targetType === "shop") {
    const record = project.shops?.find((candidate) => candidate.id === targetId);
    return record ? <TargetSummaryCard project={project} catalog={catalog} recordType="shop" id={targetId} record={record} /> : null;
  }
  if (targetType === "simpleEncounter") {
    const record = project.simpleEncounters?.find((candidate) => candidate.id === targetId);
    return record ? <EncounterTargetCard project={project} recordType="simpleEncounter" id={targetId} record={record} /> : null;
  }
  if (targetType === "complexEncounter") {
    const record = project.complexEncounters?.find((candidate) => candidate.id === targetId);
    return record ? <EncounterTargetCard project={project} recordType="complexEncounter" id={targetId} record={record} /> : null;
  }
  if (targetType === "thiefEncounter") {
    const record = project.thiefEncounters?.find((candidate) => candidate.id === targetId);
    return record ? <EncounterTargetCard project={project} recordType="thiefEncounter" id={targetId} record={record} /> : null;
  }
  const record = project.timedEncounters?.find((candidate) => candidate.id === targetId);
  return record ? <EncounterTargetCard project={project} recordType="timedEncounter" id={targetId} record={record} /> : null;
}

function messageSnippet(project: Project, id: number) {
  if (id <= 0) return "";
  const text = project.messages?.find((record) => record.id === id)?.text ?? "";
  return text ? `Prompt ${id}: ${shortSnippet(text, 84)}` : `Prompt string ${id}`;
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
            <option key={option.code} value={option.code}>{option.code} {option.shortLabel}</option>
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
  const filteredOptions = useMemo(() => filterItemReferenceOptionsByCategory(options, query, category).slice(0, 36), [options, query, category]);
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
  const catalogItems = useMemo(() => filterItemReferenceOptionsByCategory(itemOptions, catalogQuery, catalogCategory).slice(0, 72), [itemOptions, catalogQuery, catalogCategory]);
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

function clampShopQuantity(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(value)));
}

function clampShopQuantityDelta(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-255, Math.min(255, Math.trunc(value)));
}

function RequiredWeaponField({ project, catalog, value, onCommit, compact = false }: { project: Project; catalog?: LibraryCatalog | null; value: number; onCommit: (value: number) => void; compact?: boolean }) {
  const displayValue = monsterRequiredWeaponDisplayCode(value);
  const weaponOptions = useMemo(() => {
    const byCode = new Map(
      itemReferenceOptions(project, catalog)
        .filter((item) => item.category === "weapon" && item.value > 0 && item.value <= REQUIRED_WEAPON_MAX_SPECIFIC_CODE)
        .map((item) => [item.value, item])
    );
    return Array.from({ length: REQUIRED_WEAPON_MAX_SPECIFIC_CODE }, (_, index) => {
      const code = index + 1;
      const item = byCode.get(code);
      return {
        value: code,
        label: item?.label ?? `Weapon ${code}`
      };
    });
  }, [catalog, project]);
  return (
    <label className={compact ? "script-number-field compact" : "script-number-field"}>
      <span>Required Weapon</span>
      <select value={displayValue} onChange={(event) => onCommit(monsterRequiredWeaponStoredCode(Number(event.currentTarget.value)))}>
        <option value={0}>All weapons</option>
        <option value={-1}>Blunt only</option>
        <option value={-2}>Sharp only</option>
        {weaponOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function monsterRequiredWeaponDisplayCode(storedValue: number) {
  const byte = normalizedByte(storedValue);
  if (byte === 0xff) return -1;
  if (byte === 0xfe) return -2;
  return byte;
}

function monsterRequiredWeaponStoredCode(displayCode: number) {
  const code = Math.trunc(Number.isFinite(displayCode) ? displayCode : 0);
  if (code === -1 || code === -2) return code;
  const byte = Math.max(0, Math.min(REQUIRED_WEAPON_MAX_SPECIFIC_CODE, code));
  return byte > 127 ? byte - 256 : byte;
}

function normalizedByte(value: number) {
  return ((Math.trunc(Number.isFinite(value) ? value : 0) % 256) + 256) % 256;
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

function MapCoordinateJumpButton({
  target,
  maps,
  label,
  onOpenMapCoordinate
}: {
  target: MapCoordinateTarget | null;
  maps: Project["maps"];
  label: string;
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
}) {
  const map = target
    ? maps.find((candidate) => candidate.levelType === target.levelType && candidate.index === target.levelIndex) ?? null
    : null;
  const title = target
    ? map
      ? `${label}: ${map.name} ${target.x}, ${target.y}`
      : `No ${target.levelType} level ${target.levelIndex} exists for ${target.x}, ${target.y}.`
    : "No map coordinate is selected.";
  return (
    <button
      type="button"
      className="btn btn-secondary btn-xs icon-only script-coordinate-jump"
      title={title}
      disabled={!target || !map || !onOpenMapCoordinate}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!target || !map) return;
        onOpenMapCoordinate?.(target);
      }}
    >
      <Eye size={12} />
    </button>
  );
}

function clampRealmzCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(89, Math.trunc(value)));
}
