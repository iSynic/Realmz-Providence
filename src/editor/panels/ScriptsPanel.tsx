import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, CopyPlus, Eye, Plus, Save, Trash2, Volume2, X } from "lucide-react";
import { Action, ComplexEncounterRecord, Ed3ReachabilityRow, EncounterActionRow, LevelType, LibraryCatalog, MapCoordinateTarget, Project, ProjectCommand, QuestThread, RealmzTargetRecordKind, ScriptDetailSurface, ScriptInventoryFilter, SelectedEntity, SemanticEntity, SimpleEncounterRecord, TriggerRecord } from "../types";
import { linksFor, selectEntityFromId, semanticLabel, triggerEntityId } from "../utils";
import { actionSlotEntitiesForTriggerRecord, ed3ReachabilityFor, extraActionEvidenceSummary, extraActionPointClassification } from "../semanticGraph";
import { EdcdRowEditor } from "../components/EdcdRowEditor";
import { buildEdcdRowUsages, edcdUsageForAction, edcdUsageMatchesFilter, edcdUsageStatusTone, edcdUsageToEditorUsage, nextUnusedEdcdRowId, normalizeEdcdValues, type EdcdRowFilter, type EdcdRowUsage, type EdcdRowCaller } from "../edcdRows";
import { TargetPicker, resolveSignedMessageTarget, signedTargetBehaviorLabel, signedTargetValueForSelection, soundReferenceOptionForQuery, targetOptionForOpcodeValue, targetOptionsForOpcode, targetPickerConfig, type ScriptTargetOption } from "../components/RealmzTargetPicker";
import { TutorialTip } from "../components/TutorialTip";
import { playPreviewUrl, useIconPreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";
import { categoryColor } from "../components/TileSprite";
import { CollapsibleSection, EmptyState, FieldRow, FloatingWorkbenchPanel, PanelSection, ScrollArea } from "../ui";
import { useDraftChangeGuards } from "../app/draftChangeGuard";
import { ACTION_OPTIONS, actionOptionFor, isDispatcherNoopOpcode, normalizeStepOpcode } from "../realmzActions";
import { edcdFieldNamesForShape } from "../realmzEdcd";
import { opcodeIdMeaning, parameterLabelsForOpcode } from "../opcodeCrosswalk";
import { allDivinityOpcodeHelpEntries, divinityHelpEntriesForOpcode, divinityHelpForOpcode, DIVINITY_OPCODE_HELP_SOURCE, type DivinityOpcodeHelpEntry } from "../divinityOpcodeHelp";
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
  SCRIPT_ACTION_CATEGORY_FILTERS,
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

type EdcdStepDraft = {
  values: [number, number, number, number, number];
  dirty: boolean;
  secondaryValues?: [number, number, number, number, number];
  secondaryDirty?: boolean;
};

function edcdDraftValuesEqual(left?: readonly number[], right?: readonly number[]) {
  return [0, 1, 2, 3, 4].every((index) => Number(left?.[index] ?? 0) === Number(right?.[index] ?? 0));
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

type CombatMacroContextKind = "battle" | "monster" | "mixed";

type CombatMacroReference = {
  kind: "battle" | "monster";
  key: string;
  label: string;
  detail: string;
  entity?: SelectedEntity;
  runnable?: boolean;
};

type CombatMacroContext = {
  kind: CombatMacroContextKind;
  references: CombatMacroReference[];
  rootType: string | null;
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
const ACTION_CHOOSER_HELP =
  "Choose Action changes only the selected step draft. Apply Step is still required before the script record is updated.";
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
const ENCOUNTER_SETUP_HELP =
  "Encounter setup owns the shared source fields: prompt string, back-out behavior, max attempts, and caste-success value. The prompt is a central String; option labels below are inline buffers.";
const COMPLEX_THIEF_BRANCH_HELP =
  "The complex thief branch links into a Rogue Encounter. That rogue scene decides which lock, trap, and thief actions are available, then returns result numbers into this Complex Encounter's result script columns.";
const SIMPLE_OPTIONS_HELP =
  "Each simple option has an inline label and a Result number. Result 1-4 chooses the matching action column below; zero means no result path. Option 1 can use -4 to skip the prompt and immediately run Result #4.";
const SIMPLE_RESULT_AUTO_FAIL_SENTINEL = -4;
const COMPLEX_BAR_ACTIONS_HELP =
  "Complex encounters show up to eight action labels on the encounter bar. The group flags and Action Picker result decide which result column runs when a player chooses a matching action.";
const COMPLEX_WORD_HELP =
  "The word answer is a typed-player-text branch. When the typed phrase matches this buffer, the Word Result chooses which result script column runs.";
const COMPLEX_SPELL_TESTS_HELP =
  "Magic responses match packed Realmz spell IDs or low spell-class IDs. When the party uses a matching spell or scroll, Realmz runs the selected result script column.";
const COMPLEX_ITEM_TESTS_HELP =
  "Item responses match Realmz item IDs from Economy or the reference item library. When the party uses a matching item, Realmz runs the selected result script column.";
const ENCOUNTER_RESULT_ACTION_HELP =
  "Encounter result columns are the outcome scripts. Branch fields choose Result 1, 2, 3, or 4; Realmz then runs that column's ordered CODE/ID steps.";
const ROGUE_ACTION_TESTS_HELP =
  "Rogue action rows control which Divinity thief actions are available, the skill modifier, success/failure result codes, and the text/sound feedback for each outcome.";
const ROGUE_TRAP_HELP =
  "Trap and lock setup controls the trap prompt string, trap state, affected target, damage range, trap sound, optional trap spell, power level, tumbler count, and open/disarm chance fields.";
const TIMED_SCHEDULE_HELP =
  "The midnight schedule controls when this record is considered. Day and Increment define timing, Percent gates execution, and Extra AP To Activate is the macro Realmz runs.";
const TIMED_LOCATION_HELP =
  "Location gates restrict the timed encounter to any map, land, or dungeon, then optionally to level, random rectangle, X, and Y.";
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

function combatMacroContextTitle(context: CombatMacroContext) {
  if (context.kind === "battle") return "Battle Macro";
  if (context.kind === "monster") return "Monster Macro";
  return "Combat Macro";
}

function combatMacroContextBody(context: CombatMacroContext) {
  if (context.kind === "battle") {
    return "Realmz checks an assigned battle macro after each combat round. Code 126 is the battle criteria gate and is often the first step; if its criteria pass, the remaining steps execute in battle context.";
  }
  if (context.kind === "monster") {
    return "Realmz runs an assigned monster macro when that monster dies. Monster macro actions can target the dead monster position, the killer, or related active combat monsters depending on the opcode.";
  }
  return "This Extra Action Point is referenced from both battle and monster combat paths. Keep battle-round criteria and monster-death effects explicit when mixing those flows.";
}

function combatMacroContextLabel(context: CombatMacroContext) {
  const battleCount = context.references.filter((reference) => reference.kind === "battle").length;
  const monsterCount = context.references.filter((reference) => reference.kind === "monster").length;
  if (battleCount && monsterCount) return `${battleCount} battle / ${monsterCount} monster reference(s)`;
  if (battleCount) return `${battleCount} battle reference(s)`;
  if (monsterCount) return `${monsterCount} monster reference(s)`;
  return context.rootType ? `Reachability: ${context.rootType}` : "Combat reachability";
}

function combatMacroActionOpcodes(context: CombatMacroContext | null) {
  if (!context) return [];
  if (context.kind === "battle") return [126, 127, 121, 123, 124, 125, 120];
  if (context.kind === "monster") return [119, 122, 127, 121, 123, 124, 125, 120, 17];
  return [126, 119, 122, 127, 121, 123, 124, 125, 120, 17];
}

function combatMacroActionNote(opcode: number, context: CombatMacroContext | null) {
  if (!context) return null;
  const code = normalizeStepOpcode(opcode);
  if (code === 126) return "Battle macro criteria: Realmz checks this after each combat round before continuing the rest of the macro.";
  if (code === 119) return "Monster macro revive: an NPC killed in combat returns after combat with 1 stamina.";
  if (code === 122) return "Monster macro fumble: affects the creature that killed this monster.";
  if (code === 17 && context.kind !== "battle") return "In a monster death macro, Realmz uses the destroyed monster's position for the spell target.";
  if (code === 121) return "Combat macro action: de-animates lower unintelligent undead in monster or battle macro context.";
  if (code === 123) return "Combat macro action: routes matching active monsters away from the fight.";
  if (code === 124) return "Combat macro action: spawns replacement monsters from the macro's combat context.";
  if (code === 125) return "Combat macro action: destroys related active monsters.";
  if (code === 127) return "Combat macro condition: continue only while the selected monster is still present.";
  if (code === 120) return "Combat mutation: changes an active monster or NPC icon/traitor value during combat.";
  return null;
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

function actionSlotSelectionId(trigger: TriggerRecord, slot: number) {
  return `action-slot:${triggerSelectionId(trigger)}:${slot}`;
}

function actionSlotIndexFromSelection(entityId: string | null | undefined) {
  if (!entityId?.startsWith("action-slot:")) return null;
  const slot = Number(entityId.slice(entityId.lastIndexOf(":") + 1));
  return Number.isInteger(slot) ? slot : null;
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
      map.set(selectedTrigger.id, cachedValidateScriptTrigger(project, selectedTrigger, catalog, diagnosticDependencyKey));
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
                    <h4>Activation Chance</h4>
                    <NumberField
                      label="%"
                      value={selectedTrigger.percent}
                      onCommit={(percent) => onApplyCommand?.({ kind: "updateTriggerHeader", label: "Update action chance", triggerId: selectedTrigger.id, fields: { percent } })}
                    />
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

function humanActionValueLabel(label: string) {
  const clean = label.replace(/\bID\b/g, "Value").replace(/\bNumber\b/g, "Value").replace(/\s+/g, " ").trim();
  return clean && clean !== "Value" ? clean : "Value";
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

function actionAuthoringStateLabel(definition: ScriptActionDefinition, combatMacroContext?: CombatMacroContext | null) {
  if (definition.opcode === 121 && combatMacroContext) return "Combat macro action";
  if (definition.opcode === 121) return "Macro-only imported action";
  if ([84, 98, 99].includes(definition.opcode)) return "Legacy registration action";
  if (definition.shortLabel === "Inert Imported Action") return "Inert imported action";
  if (definition.validationPosture === "no-effect") return "Preserve-only / no normal effect";
  if (definition.authoringLevel === "first-class") return "Friendly editor";
  if (definition.authoringLevel === "guided") return "Guided settings editor";
  if (definition.authoringLevel === "advanced") return "Unmodeled action";
  return "Empty step";
}

function actionAuthoringStateDetail(definition: ScriptActionDefinition, combatMacroContext?: CombatMacroContext | null) {
  if (definition.opcode === 121) {
    if (combatMacroContext) return "This action is meaningful in the selected battle or monster macro. Providence edits the same CODE/ID and Action Settings while keeping Extra Action Point storage unchanged.";
    return "Realmz source performs this only during combat. Ordinary AP imports are preserved here and are not routine Action Point authoring backlog; use monster or battle macro surfaces for intentional authoring.";
  }
  if ([84, 98, 99].includes(definition.opcode)) {
    return "Divinity documents these registration actions without an authored ID or E-Code value. Placing the step runs the legacy registration behavior; modern open-source Realmz keeps related dispatchers but comments out enforcement.";
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
    return "Providence edits the attached Action Settings with named fields, while keeping the original storage row and file format intact.";
  }
  if (definition.authoringLevel === "advanced") {
    return "Providence recognizes and preserves the stored values, but this action does not yet have a complete friendly authoring form.";
  }
  return "Realmz skips empty slots.";
}

function actionStorageLabel(definition: ScriptActionDefinition) {
  if (definition.storage === "direct-code-id") return "Direct CODE / ID";
  if (definition.storage === "data-edcd-parameter-row") return "Action Settings";
  if (definition.storage === "data-ed3-direct") return "Extra Action Point";
  if (definition.storage === "same-map-action-point-copy") return "Same-map Action Point copy";
  return definition.storage;
}

function actionSettingsTitleForShape(edcdShape?: string | null, fallback = "Action Settings") {
  const normalized = edcdShape?.toLowerCase();
  const titles: Record<string, string> = {
    "action-data-patching": "Action Code Replacement",
    battle: "Battle Setup",
    choice: "Choice Dialog",
    "random-message": "Message Range",
    teleport: "Movement",
    "party-condition-branch": "Condition Branch",
    "force-branch": "Branch Target",
    "percent-branch": "Percent Branch",
    "condition-branch": "Condition Branch",
    "random-region-shape-mutation": "Random Area Shape",
    fumble: "Fumble Result"
  };
  return normalized ? titles[normalized] ?? fallback : fallback;
}

function actionSettingsTitleForStep(definition: ScriptActionDefinition, edcdShape?: string) {
  return actionSettingsTitleForShape(edcdShape, definition.target?.label ?? "Action Settings");
}

function actionSettingsFieldLabel(title: string) {
  return title.endsWith("Settings") ? title : `${title} Settings`;
}

function authorSettingsWarning(usage: EdcdRowUsage, title: string, warning: string) {
  const label = actionSettingsFieldLabel(title).toLowerCase();
  if (usage.status === "missing") return `This step references ${label} that do not exist yet. Applying the fields below will create them.`;
  if (usage.status === "shared") return `These ${label} are shared by ${usage.callers.length} steps. Editing them changes every caller.`;
  if (usage.status === "conflict") return `These settings are used by different action types: ${usage.possibleShapes.join(", ")}. Duplicate before editing if that is not intentional.`;
  if (usage.status === "unused") return `These ${label} are stored but not called by another script yet.`;
  return warning.replace(/\bSettings\s*#?\d+\b/gi, "these settings");
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
  const combatMacroActionDefinitions = useMemo(
    () => combatMacroActionOpcodes(combatMacroContext ?? null).map((opcode) => scriptActionDefinitionFor(opcode)),
    [combatMacroContext]
  );
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
  const actionChooserDefinitionMatchesDraft = (definition: ScriptActionDefinition) => {
    return canonicalActionChooserOpcode(definition.opcode) === canonicalActionChooserOpcode(selectedDraft.rawCode);
  };
  const useActionDefinition = (definition: ScriptActionDefinition) => {
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
          <div className="script-action-chooser action-chooser-dropdown" role="dialog" aria-label="Choose action for selected step">
            <header>
              <div>
                <TutorialTip title="Choose Action" body={ACTION_CHOOSER_HELP} side="below">
                  <strong>{selectedDraft.rawCode === 0 ? "Choose Action" : "Change Action"}</strong>
                </TutorialTip>
              </div>
              <button type="button" className="btn btn-secondary btn-xs icon-only" title="Close action chooser" onClick={() => setActionChooserOpen(false)}>
                <X size={12} />
              </button>
            </header>
            <div className="realmz-opcode-catalog">
              <div className="realmz-step-category-bar">
                {SCRIPT_ACTION_CATEGORY_FILTERS.map((category) => (
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
              {combatMacroContext && combatMacroActionDefinitions.length > 0 && (
                <div className="combat-macro-action-strip">
                  <header>
                    <strong>Combat Macro Actions</strong>
                    <small>{combatMacroContextTitle(combatMacroContext)}</small>
                  </header>
                  <div>
                    {combatMacroActionDefinitions.map((definition) => (
                      <button
                        key={definition.opcode}
                        type="button"
                        className={actionChooserDefinitionMatchesDraft(definition) ? "selected" : ""}
                        title={combatMacroActionNote(definition.opcode, combatMacroContext) ?? definition.description}
                        onClick={() => useActionDefinition(definition)}
                      >
                        <strong>{definition.shortLabel}</strong>
                        <span>{definition.opcode}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="realmz-step-picker-grid action-chooser-grid">
                {filteredDefinitions.map((definition) => (
                  <button
                    key={definition.opcode}
                    type="button"
                    title={`${actionDefinitionPathLabel(definition)}. ${definition.summary}`}
                    className={actionChooserDefinitionMatchesDraft(definition) ? "selected" : ""}
                    onClick={() => useActionDefinition(definition)}
                  >
                    <strong>{categoryFilter === "All" ? actionDefinitionPathLabel(definition) : definition.label}</strong>
                    <span>{definition.summary}</span>
                    <small>{actionChooserDefinitionMatchesDraft(definition) ? "Current action" : definition.categoryLabel}</small>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <p>{selectedDefinition.summary}</p>
        {selectedCombatMacroActionNote && combatMacroContext && (
          <div className="combat-macro-action-note">
            <span>{combatMacroContextTitle(combatMacroContext)}</span>
            <small>{selectedCombatMacroActionNote}</small>
          </div>
        )}
        {!hasInlineTargetPicker && selectedTargetPreview && (
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
                onClick={() => selectedTargetPreview?.entity && onPreviewEntity(selectedTargetPreview.entity)}
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
        {previewCanExpand && (
          <button type="button" className="btn btn-secondary btn-xs realmz-preview-toggle" onClick={() => setPreviewExpanded((current) => !current)}>
            {previewExpanded ? "Collapse Preview" : "Show Full Preview"}
          </button>
        )}
        {inlineTargetPicker}
        {!isEdcdBackedStep && !hasInlineTargetPicker && !isStepOnlyAction && (
          <div className="realmz-step-form-grid realmz-current-step-authoring-subpane">
            <div className={`script-required-field realmz-step-id-field${isSameMapActionPointStep ? " script-source-ap-id-field" : ""}`}>
              <span>{selectedDefinition.target?.label ?? selectedIdLabel}</span>
              <div className="script-source-ap-field-row">
                <input
                  type={isSameMapActionPointStep ? "text" : "number"}
                  inputMode={isSameMapActionPointStep ? "numeric" : undefined}
                  pattern={isSameMapActionPointStep ? "-?[0-9]*" : undefined}
                  value={selectedDraft.id}
                  onChange={(event) => {
                    const nextValue = Number.parseInt(event.currentTarget.value, 10);
                    onSetSelectedDraft({ ...selectedDraft, id: Number.isFinite(nextValue) ? nextValue : 0 });
                  }}
                  aria-label={`Slot ${selectedSlot} ${selectedIdLabel}`}
                />
                {isSameMapActionPointStep && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs icon-only script-source-ap-jump"
                    title={sameMapActionPointJumpTitle}
                    disabled={!sameMapActionPointTarget}
                    onClick={() => {
                      if (!sameMapActionPointTarget) return;
                      onPreviewEntity(selectEntityFromId(triggerEntityId(
                        sameMapActionPointTarget.levelType,
                        sameMapActionPointTarget.levelIndex,
                        sameMapActionPointTarget.recordIndex,
                        sameMapActionPointTarget.source
                      )));
                    }}
                  >
                    <Eye size={12} />
                  </button>
                )}
              </div>
              <small>{selectedDefinition.target?.help || selectedDefinition.description}</small>
            </div>
          </div>
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
      <CollapsibleSection title="Step Reference" eyebrow="technical details" density="compact" storageKey="scripts.stepReference.open" defaultOpen={false}>
        <div className="realmz-raw-preview">
          <FieldRow label="Opcode" value={selectedDefinition.label} />
          <FieldRow label="Authoring State" value={`${actionAuthoringStateLabel(selectedDefinition, combatMacroContext)} - ${actionAuthoringStateDetail(selectedDefinition, combatMacroContext)}`} />
          <FieldRow label="Storage" value={actionStorageLabel(selectedDefinition)} />
          <FieldRow label="Export Behavior" value="Unchanged values are preserved on export. Edits update the same classic Realmz fields Providence already imports." />
          <FieldRow label="Original CODE / ID" value={`${selectedDraft.rawCode} / ${selectedDraft.id}`} />
          <FieldRow label="Target Meaning" value={selectedDefinition.target?.help || selectedDefinition.description || "No direct target required."} />
          {settingLabels.length > 0 && (
            <FieldRow label="Settings Fields" value={settingLabels.join("; ")} />
          )}
          {selectedEdcdRowId != null && <FieldRow label="Action Settings Row" value={selectedEdcdRowId} />}
          {selectedRowUsage?.summary && <FieldRow label="Action Settings Summary" value={selectedRowUsage.summary} />}
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

function InlineMessageTargetEditor({
  project,
  targetId,
  onApplyCommand
}: {
  project: Project;
  targetId: number;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  if (!Number.isInteger(targetId) || targetId <= 0) return null;
  const record = project.messages?.find((candidate) => candidate.id === targetId);
  return (
    <div className="inline-message-target-editor">
      {record ? (
        <label className="script-target-wide-field">
          <span>Text</span>
          <textarea
            key={`inline-message:${targetId}`}
            defaultValue={record.text}
            maxLength={255}
            onBlur={(event) => onApplyCommand?.({ kind: "updateMessageRecord", label: "Update string", id: targetId, changes: { text: event.currentTarget.value } })}
          />
          <small>{record.text.length}/255 bytes before Classic encoding</small>
        </label>
      ) : (
        <div className="inline-message-target-missing">
          <small>This step points at string {targetId}, but that string does not exist yet.</small>
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => onApplyCommand?.({ kind: "createTargetRecord", label: "Create string", recordType: "message", id: targetId })}
          >
            Create String
          </button>
        </div>
      )}
    </div>
  );
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
  const open = () => onSelectEntity?.(selectEntityFromId(entityId));
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
  const open = () => onSelectEntity?.({ type: "encounter", id: entityId });
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

function EncounterTargetCardHeader({ title, subtitle, onOpen, buttonLabel = "Open in Encounters" }: { title: string; subtitle: string; onOpen: () => void; buttonLabel?: string }) {
  return (
    <header className="encounter-target-card-header">
      <div>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <button type="button" className="btn btn-primary btn-xs" onClick={onOpen}>
        {buttonLabel}
      </button>
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

function encounterEntityId(recordType: "simpleEncounter" | "complexEncounter" | "thiefEncounter" | "timedEncounter", id: number) {
  if (recordType === "simpleEncounter") return `encounter:simple:${id}`;
  if (recordType === "complexEncounter") return `encounter:complex:${id}`;
  if (recordType === "thiefEncounter") return `thief:${id}`;
  return `time:${id}`;
}

type EncounterRecordPickerType = "simpleEncounter" | "complexEncounter" | "thiefEncounter" | "timedEncounter";

function encounterRecordsForType(project: Project, recordType: EncounterRecordPickerType): Array<{ id: number }> {
  const records =
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    project.timedEncounters;
  return [...(records ?? [])].sort((a, b) => a.id - b.id);
}

function encounterRecordLabel(recordType: EncounterRecordPickerType, id: number) {
  if (recordType === "simpleEncounter") return `Simple Encounter ${id}`;
  if (recordType === "complexEncounter") return `Complex Encounter ${id}`;
  if (recordType === "thiefEncounter") return `Rogue Encounter ${id}`;
  return `Time Encounter ${id}`;
}

function EncounterRecordPicker({
  project,
  recordType,
  id,
  onSelectEntity,
  className = ""
}: {
  project: Project;
  recordType: EncounterRecordPickerType;
  id: number;
  onSelectEntity?: (entity: SelectedEntity) => void;
  className?: string;
}) {
  const records = encounterRecordsForType(project, recordType);
  return (
    <div className={`encounter-record-picker-row${className ? ` ${className}` : ""}`}>
      <label className="encounter-record-picker">
        <span>Encounter Record</span>
        <select
          aria-label={`${encounterRecordLabel(recordType, id)} picker`}
          value={id}
          disabled={!onSelectEntity || records.length <= 1}
          onChange={(event) => {
            const nextId = Number(event.currentTarget.value);
            if (!Number.isInteger(nextId) || nextId === id) return;
            onSelectEntity?.(selectEntityFromId(encounterEntityId(recordType, nextId)));
          }}
        >
          {records.map((record) => (
            <option key={record.id} value={record.id}>{encounterRecordLabel(recordType, record.id)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function messageSnippet(project: Project, id: number) {
  if (id <= 0) return "";
  const text = project.messages?.find((record) => record.id === id)?.text ?? "";
  return text ? `Prompt ${id}: ${shortSnippet(text, 84)}` : `Prompt string ${id}`;
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
  actions,
  catalog,
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
  desktopRuntime?: boolean;
  projectDir?: string;
  workspaceDir?: string;
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
  actions: EncounterActionRow[];
  onSelectEntity?: (entity: SelectedEntity) => void;
  onSelectEditor?: (editor: string) => void;
  onSelectEncounterRecordType?: (recordType: RealmzTargetRecordKind) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const encounterRecordType: "simpleEncounter" | "complexEncounter" = recordKind === "simple" ? "simpleEncounter" : "complexEncounter";
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
  const resultFlowWarningCount = resultFlowSources.filter((source) => source.status !== "visible" && source.result !== 0).length;
  const resultFlowPreviewSections = useMemo(() => {
    const previewSource = (recordKind === "simple"
      ? {
        id,
        prompt,
        texts,
        choiceResults,
        actions,
        canBackOut,
        maxTimes,
        casteSuccess
      }
      : {
        id,
        prompt,
        texts,
        actions,
        actionResult,
        wordResult,
        groups,
        spellIds,
        spellResults,
        itemIds,
        itemResults,
        choiceResults,
        wordResults,
        canBackOut,
        maxTimes,
        casteSuccess,
        thief: Boolean(thief),
        thiefSuccess: thiefSuccess ?? 0,
        thiefFail: 0
      }) as EncounterCopySource;
    return [
      ...encounterCopyResponseSections(project, catalog, recordKind, previewSource),
      ...encounterCopyResultSections(previewSource, resultFlowSources)
    ];
  }, [actionResult, actions, canBackOut, casteSuccess, catalog, choiceResults, groups, id, itemIds, itemResults, maxTimes, project, prompt, recordKind, resultFlowSources, spellIds, spellResults, texts, thief, thiefSuccess, wordResult, wordResults]);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);
  const [copyPanelOpen, setCopyPanelOpen] = useState(false);
  const promptId = Math.abs(prompt);
  const promptRecord = promptId > 0 ? project.messages?.find((record) => record.id === promptId) ?? null : null;
  const [rogueTargetDraft, setRogueTargetDraft] = useState(thiefSuccess ?? 0);
  useEffect(() => {
    setRogueTargetDraft(thiefSuccess ?? 0);
  }, [thiefSuccess]);
  const rogueRecords = recordKind === "complex" ? encounterRecordsForType(project, "thiefEncounter") : [];
  const rogueTargetRecord = rogueRecords.find((candidate) => candidate.id === rogueTargetDraft);
  const roguePickerRecords = rogueTargetRecord || rogueTargetDraft == null
    ? rogueRecords
    : [{ id: rogueTargetDraft }, ...rogueRecords];
  const canOpenRogueEncounter = Boolean(thief) && Boolean(rogueTargetRecord);
  return (
    <>
      <div className="script-target-grid encounter-record-grid">
        <section className="encounter-setup-panel">
          <EncounterRecordPicker project={project} recordType={encounterRecordType} id={id} onSelectEntity={onSelectEntity} />
          <div className="encounter-setup-bar">
            <label className="encounter-setup-inline-field encounter-prompt-inline-field">
              <TutorialTip title="Prompt String" body={ENCOUNTER_SETUP_HELP} side="below">
                <span>Prompt String</span>
              </TutorialTip>
              <InlineNumberField ariaLabel="Prompt String ID" value={prompt} onCommit={(value) => update({ prompt: value })} />
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              disabled={promptId <= 0}
              onClick={() => setPromptEditorOpen(true)}
            >
              Edit String
            </button>
            <span className="encounter-setup-divider" aria-hidden="true" />
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => setCopyPanelOpen(true)}
            >
              Copy From
            </button>
            <span className="encounter-setup-divider" aria-hidden="true" />
            <label className="encounter-setup-inline-field encounter-checkbox-inline-field">
              <span>Can Back Out</span>
              <input type="checkbox" checked={canBackOut} onChange={(event) => update({ canBackOut: event.currentTarget.checked })} />
            </label>
            {recordKind === "complex" && (
              <>
                <span className="encounter-setup-divider" aria-hidden="true" />
                <div className="encounter-rogue-toggle-control">
                  <TutorialTip title="Rogue Encounter" body={COMPLEX_THIEF_BRANCH_HELP} side="below">
                    <span className="encounter-rogue-toggle-label">Has Rogue Encounter</span>
                  </TutorialTip>
                  <input
                    className="encounter-rogue-toggle-checkbox"
                    type="checkbox"
                    aria-label="Has Rogue Encounter"
                    checked={Boolean(thief)}
                    onChange={(event) => update({ thief: event.currentTarget.checked })}
                  />
                </div>
                {thief && (
                  <>
                    <span className="encounter-setup-divider" aria-hidden="true" />
                    <label className="encounter-setup-inline-field encounter-rogue-inline-field">
                      <span>Rogue Encounter</span>
                      <select
                        aria-label="Rogue Encounter ID"
                        className="encounter-setup-select"
                        value={rogueTargetDraft}
                        onChange={(event) => {
                          const nextId = Number(event.currentTarget.value);
                          if (!Number.isInteger(nextId)) return;
                          setRogueTargetDraft(nextId);
                          update({ thiefSuccess: nextId });
                        }}
                      >
                        {roguePickerRecords.map((record) => (
                          <option key={record.id} value={record.id}>
                            {record.id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      disabled={!canOpenRogueEncounter}
                      onClick={() => {
                        if (!canOpenRogueEncounter) return;
                        onSelectEncounterRecordType?.("thiefEncounter");
                        onSelectEditor?.("rogue");
                        onSelectEntity?.(selectEntityFromId(`thief:${rogueTargetDraft}`));
                      }}
                    >
                      Go to Rogue Encounter
                    </button>
                  </>
                )}
              </>
            )}
            <span className="encounter-setup-divider" aria-hidden="true" />
            <label className="encounter-setup-inline-field encounter-max-times-inline-field">
              <span>Max Times</span>
              <InlineNumberField ariaLabel="Max Times" value={maxTimes} onCommit={(value) => update({ maxTimes: value })} />
            </label>
          </div>
        </section>
      {recordKind === "simple" ? (
        <>
          <EncounterResultEditor
            project={project}
            catalog={catalog}
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
            actions={actions}
            onTextCommit={(slot, text) => update({ texts: updateArraySlot(texts, slot, text, recordKind === "simple" ? 4 : 9) })}
            onChoiceCommit={(slot, value) => update({ choiceResults: updateArraySlot(choiceResults, slot, value, 4) })}
            onWordCommit={(slot, value) => update({ wordResults: updateArraySlot(wordResults ?? [], slot, value, 4) })}
            onComplexCommit={(changes) => update(changes)}
          />
          <EncounterResultActionMatrix
            project={project}
            catalog={catalog}
            actions={actions}
            title="Result Action Columns"
            description="Simple encounters store eight CODE/ID steps for each of the four result numbers, matching the Divinity editor columns."
            decisionSources={resultFlowSources}
            selectedResultIndex={selectedResultIndex}
            onSelectResult={setSelectedResultIndex}
            onUpdate={(slot, changes) => update({ actions: updateEncounterActionRow(actions, slot, changes) })}
            onCreateTarget={(recordType, targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter action target", recordType, id: targetId })}
            previewContext={{ desktopRuntime, projectDir, workspaceDir }}
          />
          <CollapsibleSection
            title="Result Flow Summary"
            eyebrow="qa"
            count={resultFlowWarningCount > 0 ? `${resultFlowWarningCount} warning${resultFlowWarningCount === 1 ? "" : "s"}` : `${resultFlowSources.length} path${resultFlowSources.length === 1 ? "" : "s"}`}
            density="compact"
            className="encounter-flow-summary-section"
            defaultOpen={false}
          >
            <EncounterCopyRoutePreview sections={resultFlowPreviewSections} />
          </CollapsibleSection>
        </>
      ) : (
        <>
          <section className="encounter-responses-panel">
            <header>
              <div>
                <strong>Encounter Responses</strong>
                <small>Define what the party can say, choose, use, cast, or attempt, then route each response to a result script.</small>
              </div>
            </header>
            <EncounterResultEditor
              project={project}
              catalog={catalog}
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
              actions={actions}
              onTextCommit={(slot, text) => update({ texts: updateArraySlot(texts, slot, text, 9) })}
              onChoiceCommit={(slot, value) => update({ choiceResults: updateArraySlot(choiceResults, slot, value, 4) })}
              onWordCommit={(slot, value) => update({ wordResults: updateArraySlot(wordResults ?? [], slot, value, 4) })}
              onComplexCommit={(changes) => update(changes)}
            />
          </section>
          <EncounterResultActionMatrix
            project={project}
            catalog={catalog}
            actions={actions}
            title="Result Scripts"
            description="Each result column holds the actions players see after a matching response succeeds."
            decisionSources={resultFlowSources}
            selectedResultIndex={selectedResultIndex}
            onSelectResult={setSelectedResultIndex}
            onUpdate={(slot, changes) => update({ actions: updateEncounterActionRow(actions, slot, changes) })}
            onCreateTarget={(recordType, targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create encounter action target", recordType, id: targetId })}
            previewContext={{ desktopRuntime, projectDir, workspaceDir }}
          />
        </>
      )}
      </div>
      {promptEditorOpen && promptId > 0 && (
        <PromptStringFloatingEditor
          id={promptId}
          record={promptRecord}
          onClose={() => setPromptEditorOpen(false)}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {copyPanelOpen && (
      <EncounterCopyFloatingPanel
        project={project}
        catalog={catalog}
        recordKind={recordKind}
        currentId={id}
        onClose={() => setCopyPanelOpen(false)}
          onApply={(changes) => {
            update(changes);
            setCopyPanelOpen(false);
          }}
        />
      )}
    </>
  );
}

type EncounterCopySource = SimpleEncounterRecord | ComplexEncounterRecord;

function isComplexEncounterCopySource(record: EncounterCopySource): record is ComplexEncounterRecord {
  return "spellIds" in record;
}

function cloneEncounterActionRows(actions: EncounterActionRow[]) {
  return actions.map((action) => ({ slot: action.slot, rawCode: action.rawCode, id: action.id }));
}

function simpleEncounterCopyChanges(source: SimpleEncounterRecord): Record<string, unknown> {
  return {
    actions: cloneEncounterActionRows(source.actions ?? []),
    choiceResults: [...(source.choiceResults ?? [])],
    canBackOut: source.canBackOut,
    maxTimes: source.maxTimes,
    casteSuccess: source.casteSuccess,
    prompt: source.prompt,
    texts: [...(source.texts ?? [])]
  };
}

function complexEncounterCopyChanges(source: ComplexEncounterRecord): Record<string, unknown> {
  return {
    actions: cloneEncounterActionRows(source.actions ?? []),
    actionResult: source.actionResult,
    wordResult: source.wordResult,
    groups: [...(source.groups ?? [])],
    spellIds: [...(source.spellIds ?? [])],
    spellResults: [...(source.spellResults ?? [])],
    itemIds: [...(source.itemIds ?? [])],
    itemResults: [...(source.itemResults ?? [])],
    choiceResults: [...(source.choiceResults ?? [])],
    wordResults: [...(source.wordResults ?? [])],
    canBackOut: source.canBackOut,
    thief: source.thief,
    maxTimes: source.maxTimes,
    casteSuccess: source.casteSuccess,
    thiefSuccess: source.thiefSuccess,
    thiefFail: source.thiefFail,
    prompt: source.prompt,
    texts: [...(source.texts ?? [])]
  };
}

function encounterCopySources(project: Project, recordKind: "simple" | "complex", currentId: number): EncounterCopySource[] {
  const records: EncounterCopySource[] = recordKind === "simple" ? project.simpleEncounters ?? [] : project.complexEncounters ?? [];
  return records.filter((record) => record.id !== currentId);
}

function encounterCopyFlowSources(project: Project, recordKind: "simple" | "complex", source: EncounterCopySource) {
  if (recordKind === "simple" || !isComplexEncounterCopySource(source)) {
    return buildEncounterDecisionSources({
      recordKind: "simple",
      texts: source.texts,
      actionResult: 0,
      wordResult: 0,
      groups: [],
      spellIds: [],
      spellResults: [],
      itemIds: [],
      itemResults: [],
      choiceResults: source.choiceResults,
      thief: false,
      rogueId: 0,
      actions: source.actions
    });
  }
  const rogueRecord = source.thief ? project.thiefEncounters?.find((candidate) => candidate.id === source.thiefSuccess) : undefined;
  return buildEncounterDecisionSources({
    recordKind: "complex",
    texts: source.texts,
    actionResult: source.actionResult,
    wordResult: source.wordResult,
    groups: source.groups,
    spellIds: source.spellIds,
    spellResults: source.spellResults,
    itemIds: source.itemIds,
    itemResults: source.itemResults,
    choiceResults: source.choiceResults,
    wordResults: source.wordResults,
    thief: source.thief,
    rogueId: source.thiefSuccess,
    rogueRecord,
    actions: source.actions
  });
}

function encounterCopySourceSubtitle(project: Project, recordKind: "simple" | "complex", source: EncounterCopySource) {
  const actionCount = (source.actions ?? []).filter((action) => action.rawCode !== 0 || action.id !== 0).length;
  const promptText = messageSnippet(project, source.prompt);
  if (recordKind === "simple") return `${actionCount} action row(s), ${promptText || `prompt ${source.prompt}`}`;
  const complex = isComplexEncounterCopySource(source) ? source : null;
  const responseCount = complex
    ? (complex.texts ?? []).filter((text) => text.trim()).length + (complex.spellResults ?? []).filter(Boolean).length + (complex.itemResults ?? []).filter(Boolean).length
    : 0;
  return `${actionCount} action row(s), ${responseCount} response path(s), ${promptText || `prompt ${source.prompt}`}`;
}

function encounterCopyPreviewLabels(recordKind: "simple" | "complex", source: EncounterCopySource) {
  const labels = (source.texts ?? [])
    .map((text, index) => text.trim() ? `${recordKind === "simple" ? "Option" : "Action"} ${index}: ${shortSnippet(text, 46)}` : "")
    .filter(Boolean)
    .slice(0, recordKind === "simple" ? 4 : 8);
  if (isComplexEncounterCopySource(source)) {
    const word = source.texts?.[8]?.trim();
    if (word) labels.push(`Typed reply: ${shortSnippet(word, 46)}`);
  }
  return labels;
}

type EncounterCopyPreviewRow = {
  key: string;
  title: string;
  detail?: string;
  result?: number;
  status?: EncounterResultStatus;
};

type EncounterCopyPreviewSection = {
  title: string;
  rows: EncounterCopyPreviewRow[];
};

function encounterCopyResultText(result: number | undefined) {
  return result && result > 0 ? `Result ${result}` : "No result";
}

function encounterCopyStatusLabel(result: number | undefined, status: EncounterResultStatus | undefined) {
  if (!result) return "No result";
  return resultStatusLabel(status ?? "missing");
}

function spellCopyLabel(project: Project, catalog: LibraryCatalog | null | undefined, value: number) {
  if (value === 0) return "No spell or scroll";
  return spellReferenceOptions(project, catalog).find((option) => option.value === value)?.label ?? `Unknown spell/scroll ${value}`;
}

function itemCopyLabel(project: Project, catalog: LibraryCatalog | null | undefined, value: number) {
  if (value === 0) return "Empty / none";
  return itemReferenceOptions(project, catalog).find((option) => option.value === value)?.label ?? `Current item ID ${value}`;
}

function encounterCopyResponseSections(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  recordKind: "simple" | "complex",
  source: EncounterCopySource
): EncounterCopyPreviewSection[] {
  if (recordKind === "simple" || !isComplexEncounterCopySource(source)) {
    const rows = Array.from({ length: 4 }, (_, slot) => {
      const text = (source.texts?.[slot] ?? "").trim();
      const result = source.choiceResults?.[slot] ?? 0;
      return {
        key: `simple-choice-${slot}`,
        title: `Option ${slot}`,
        detail: text ? shortSnippet(text, 80) : "No label",
        result,
        status: result ? encounterResultStatus(source.actions, result) : "missing" as EncounterResultStatus
      };
    });
    return [{ title: "Player Options", rows }];
  }

  const sections: EncounterCopyPreviewSection[] = [];
  const actionRows = source.texts.slice(0, 8).map((text, slot) => ({
    key: `action-${slot}`,
    title: `Action ${slot}`,
    detail: [
      text.trim() ? shortSnippet(text, 80) : "No label",
      source.groups?.[slot] ? "requires selection" : ""
    ].filter(Boolean).join(" | "),
    result: source.actionResult,
    status: source.actionResult ? encounterResultStatus(source.actions, source.actionResult) : "missing" as EncounterResultStatus
  })).filter((row) => row.detail !== "No label" || (row.result ?? 0) !== 0);
  if (actionRows.length > 0) sections.push({ title: "Action Choices", rows: actionRows });

  const typedReply = (source.texts?.[8] ?? "").trim();
  if (typedReply || source.wordResult) {
    sections.push({
      title: "Typed Reply",
      rows: [{
        key: "typed-reply",
        title: "Typed reply",
        detail: typedReply ? shortSnippet(typedReply, 80) : "No phrase",
        result: source.wordResult,
        status: source.wordResult ? encounterResultStatus(source.actions, source.wordResult) : "missing"
      }]
    });
  }

  const magicRows = source.spellIds.map((spellId, slot) => {
    const result = source.spellResults?.[slot] ?? 0;
    return {
      key: `magic-${slot}`,
      title: `Magic ${slot + 1}`,
      detail: spellCopyLabel(project, catalog, spellId),
      result,
      status: result ? encounterResultStatus(source.actions, result) : "missing" as EncounterResultStatus
    };
  }).filter((row) => row.detail !== "No spell or scroll" || (row.result ?? 0) !== 0);
  if (magicRows.length > 0) sections.push({ title: "Magic Responses", rows: magicRows });

  const itemRows = source.itemIds.map((itemId, slot) => {
    const result = source.itemResults?.[slot] ?? 0;
    return {
      key: `item-${slot}`,
      title: `Item ${slot + 1}`,
      detail: itemCopyLabel(project, catalog, itemId),
      result,
      status: result ? encounterResultStatus(source.actions, result) : "missing" as EncounterResultStatus
    };
  }).filter((row) => row.detail !== "Empty / none" || (row.result ?? 0) !== 0);
  if (itemRows.length > 0) sections.push({ title: "Item Responses", rows: itemRows });

  if (source.thief) {
    sections.push({
      title: "Rogue Encounter",
      rows: [{
        key: "rogue",
        title: `Rogue Encounter ${source.thiefSuccess}`,
        detail: "Rogue encounter returns its own success/failure result numbers.",
      }]
    });
  }

  return sections.length > 0 ? sections : [{ title: "Encounter Responses", rows: [{ key: "none", title: "No responses configured", detail: "This encounter has no configured player response routes." }] }];
}

function encounterCopyResultSections(source: EncounterCopySource, flowSources: EncounterDecisionSource[]): EncounterCopyPreviewSection[] {
  return [{
    title: "Result Scripts",
    rows: Array.from({ length: ENCOUNTER_RESULT_COUNT }, (_, resultIndex) => {
      const summary = encounterResultColumnSummary(source.actions, resultIndex, flowSources);
      const populatedRows = encounterResultColumnRows(source.actions, resultIndex).filter(encounterActionIsPopulated);
      const detail = populatedRows.length > 0
        ? populatedRows.slice(0, 3).map((row) => `${encounterActionLabel(row)} ${row.id}`.trim()).join("; ")
        : "No actions";
      return {
        key: `result-${resultIndex}`,
        title: `Result ${resultIndex + 1}`,
        detail,
        result: resultIndex + 1,
        status: summary.status
      };
    })
  }];
}

function EncounterCopyRoutePreview({
  sections
}: {
  sections: EncounterCopyPreviewSection[];
}) {
  return (
    <div className="encounter-copy-route-preview">
      {sections.map((section) => (
        <section key={section.title}>
          <h4>{section.title}</h4>
          <div>
            {section.rows.map((row) => (
              <article key={row.key} className={`encounter-copy-route-row ${row.status ?? "neutral"}`}>
                <span>
                  <b>{row.title}</b>
                  {row.detail && <small>{row.detail}</small>}
                </span>
                {row.result !== undefined && (
                  <em>
                    <strong>{encounterCopyResultText(row.result)}</strong>
                    <small>{encounterCopyStatusLabel(row.result, row.status)}</small>
                  </em>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EncounterCopyFloatingPanel({
  project,
  catalog,
  recordKind,
  currentId,
  onClose,
  onApply
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordKind: "simple" | "complex";
  currentId: number;
  onClose: () => void;
  onApply: (changes: Record<string, unknown>) => void;
}) {
  const sources = useMemo(() => encounterCopySources(project, recordKind, currentId), [currentId, project, recordKind]);
  const sourceIds = sources.map((source) => source.id).join(",");
  const [selectedId, setSelectedId] = useState(sources[0]?.id ?? -1);
  useEffect(() => {
    if (!sources.some((source) => source.id === selectedId)) {
      setSelectedId(sources[0]?.id ?? -1);
    }
  }, [selectedId, sourceIds, sources]);
  const selectedSource = sources.find((source) => source.id === selectedId) ?? null;
  const flowSources = selectedSource ? encounterCopyFlowSources(project, recordKind, selectedSource) : [];
  const labels = selectedSource ? encounterCopyPreviewLabels(recordKind, selectedSource) : [];
  const previewSections = selectedSource
    ? [
      ...encounterCopyResponseSections(project, catalog, recordKind, selectedSource),
      ...encounterCopyResultSections(selectedSource, flowSources)
    ]
    : [];
  const applyCopy = () => {
    if (!selectedSource) return;
    onApply(isComplexEncounterCopySource(selectedSource) ? complexEncounterCopyChanges(selectedSource) : simpleEncounterCopyChanges(selectedSource));
  };
  return (
    <FloatingWorkbenchPanel
      title={`Copy ${recordKind === "simple" ? "Simple" : "Complex"} Encounter`}
      eyebrow="Encounters"
      storageKey={`encounters.${recordKind}.copyFrom.position`}
      defaultWidth={760}
      defaultHeight={540}
      minWidth={520}
      minHeight={360}
      className="encounter-copy-floating-panel"
      actions={(
        <>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-xs" disabled={!selectedSource} onClick={applyCopy}>
            Apply Copy
          </button>
        </>
      )}
    >
      <div className="encounter-copy-panel-body">
        <div className="encounter-copy-source-list" role="listbox" aria-label={`${recordKind} encounters to copy from`}>
          {sources.length === 0 ? (
            <EmptyState title="No other encounters" body={`Create another ${recordKind} encounter before copying from one.`} />
          ) : sources.map((source) => (
            <button
              key={source.id}
              type="button"
              className={source.id === selectedId ? "selected" : ""}
              onClick={() => setSelectedId(source.id)}
            >
              <b>{recordKind === "simple" ? "Simple" : "Complex"} Encounter {source.id}</b>
              <small>{encounterCopySourceSubtitle(project, recordKind, source)}</small>
            </button>
          ))}
        </div>
        <section className="encounter-copy-preview">
          {selectedSource ? (
            <>
              <header>
                <div>
                  <strong>{recordKind === "simple" ? "Simple" : "Complex"} Encounter {selectedSource.id}</strong>
                  <small>{messageSnippet(project, selectedSource.prompt) || `Prompt ${selectedSource.prompt}`}</small>
                </div>
                <span>{flowSources.length} path{flowSources.length === 1 ? "" : "s"}</span>
              </header>
              {labels.length > 0 && (
                <div className="encounter-copy-label-preview">
                  {labels.map((label) => <span key={label}>{label}</span>)}
                </div>
              )}
              <EncounterCopyRoutePreview sections={previewSections} />
            </>
          ) : (
            <EmptyState title="No source selected" body="Select an encounter to preview before copying." />
          )}
        </section>
      </div>
    </FloatingWorkbenchPanel>
  );
}

function PromptStringFloatingEditor({
  id,
  record,
  onClose,
  onSelectEntity,
  onApplyCommand
}: {
  id: number;
  record: Project["messages"][number] | null;
  onClose: () => void;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [draft, setDraft] = useState(record?.text ?? "");
  const exists = Boolean(record);
  useEffect(() => {
    setDraft(record?.text ?? "");
  }, [id, record?.text]);
  const goToStringEditor = () => {
    onSelectEntity?.(selectEntityFromId(`message:${id}`));
    onClose();
  };
  return (
    <FloatingWorkbenchPanel
      title={`Prompt String ${id}`}
      eyebrow="Encounter"
      storageKey="encounters.promptStringEditor.position"
      defaultWidth={560}
      defaultHeight={360}
      minWidth={420}
      minHeight={280}
      className="encounter-prompt-string-floating-editor"
      actions={(
        <>
          <button type="button" className="btn btn-secondary btn-xs" onClick={goToStringEditor}>
            Go to String Editor
          </button>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
            Close
          </button>
        </>
      )}
    >
      <div className="encounter-prompt-string-editor-body">
        {!exists && (
          <div className="field-warning encounter-prompt-string-missing">
            <span>String {id} does not exist yet.</span>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={() => onApplyCommand?.({ kind: "createTargetRecord", label: `Create String ${id}`, recordType: "message", id })}
            >
              Create String {id}
            </button>
          </div>
        )}
        <textarea
          value={draft}
          disabled={!exists}
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder={exists ? "Prompt string text..." : "Create this string before editing."}
        />
        <footer className="encounter-prompt-string-editor-footer">
          <small>{draft.length}/255 bytes before Classic encoding</small>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!exists || draft === (record?.text ?? "")}
            onClick={() => onApplyCommand?.({ kind: "updateMessageRecord", label: `Update String ${id}`, id, changes: { text: draft } })}
          >
            Save String
          </button>
        </footer>
      </div>
    </FloatingWorkbenchPanel>
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

function resultStatusCounts(actions: EncounterActionRow[]) {
  return Array.from({ length: ENCOUNTER_RESULT_COUNT }, (_, resultIndex) => encounterResultColumnSummary(actions, resultIndex, []))
    .reduce((counts, summary) => {
      counts[summary.status] += 1;
      return counts;
    }, { visible: 0, empty: 0, missing: 0, "out-of-range": 0 } as Record<EncounterResultStatus, number>);
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
    if (result !== 0) {
      sources.push(encounterDecisionSource(`spell-${slot}`, `Magic ${spellId || slot + 1}`, `Party uses the configured spell or scroll response in slot ${slot + 1}.`, result, actions));
    }
  });
  itemIds.forEach((itemId, slot) => {
    const result = itemResults[slot] ?? 0;
    if (result !== 0) {
      sources.push(encounterDecisionSource(`item-${slot}`, `Item ${itemId || slot + 1}`, `Party uses the configured item response in slot ${slot + 1}.`, result, actions));
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
        <p className="field-help">Add player options, typed words, magic responses, item responses, or a Rogue Encounter to route this encounter into result columns.</p>
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

const ROGUE_PRIMARY_ACTIONS = 8;
const ROGUE_DISARM_TRAP_SLOT = 2;
const ROGUE_OPEN_LOCK_SLOT = 6;

type RogueSpellPathConfig = {
  slot: number;
  chanceSlot: number;
  rowLabel: string;
};

const ROGUE_OPEN_LOCK_SPELL_PATH: RogueSpellPathConfig = {
  slot: ROGUE_OPEN_LOCK_SLOT,
  chanceSlot: 1,
  rowLabel: "Open Lock"
};

const ROGUE_DISARM_TRAP_SPELL_PATH: RogueSpellPathConfig = {
  slot: ROGUE_DISARM_TRAP_SLOT,
  chanceSlot: 2,
  rowLabel: "Disarm Trap"
};

function rogueSpellPathChance(record: Project["thiefEncounters"][number], config: RogueSpellPathConfig) {
  return record.promptSounds?.[config.chanceSlot] ?? 0;
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

function EncounterResultActionMatrix({
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
  previewContext?: PreviewRuntimeContext;
}) {
  const [codeHelperOpen, setCodeHelperOpen] = useState(false);
  const [soundPreviewOpen, setSoundPreviewOpen] = useState(false);
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
                <SimpleEncounterActionCell
                  key={slot}
                  project={project}
                  catalog={catalog}
                  slot={slot}
                  row={encounterActionAt(actions, slot)}
                  onUpdate={(changes) => onUpdate(slot, changes)}
                  onFocusCode={(code) => setFocusedResultCode(resultActionBaseCode(code))}
                  onCreateTarget={onCreateTarget}
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
        <ResultSoundPreviewPanel
          project={project}
          catalog={catalog}
          previewContext={previewContext}
          onClose={() => setSoundPreviewOpen(false)}
        />
      )}
    </section>
  );
}

function ResultSoundPreviewPanel({
  project,
  catalog,
  previewContext,
  onClose
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  onClose: () => void;
}) {
  const options = useMemo(() => targetOptionsForOpcode(project, 9, catalog), [catalog, project]);
  const [query, setQuery] = useState("");
  const [selectedSoundId, setSelectedSoundId] = useState(0);
  const typedSoundOption = useMemo(() => soundReferenceOptionForQuery(9, query), [query]);
  const filteredOptions = useMemo(() => {
    const matches = filterScriptTargetOptions(options, query);
    if (typedSoundOption && !matches.some((option) => Math.abs(option.value) === Math.abs(typedSoundOption.value))) {
      return [typedSoundOption, ...matches];
    }
    return matches;
  }, [options, query, typedSoundOption]);
  const selectedOption = useMemo(
    () => targetOptionForOpcodeValue(project, 9, selectedSoundId, catalog),
    [catalog, project, selectedSoundId]
  );
  const visibleOptions = selectedOption && !filteredOptions.some((option) => option.key === selectedOption.key)
    ? [selectedOption, ...filteredOptions.slice(0, 159)]
    : filteredOptions.slice(0, 160);
  const selectedPreviewUrl = useEncounterSoundPreviewUrl(selectedOption, selectedSoundId, project, previewContext);

  useEffect(() => {
    if (selectedSoundId !== 0 || visibleOptions.length === 0) return;
    const previewable = visibleOptions.find((option) => option.previewPath || option.managedAsset?.previewPath || option.libraryAsset?.previewPath);
    setSelectedSoundId(previewable?.value ?? visibleOptions[0].value);
  }, [selectedSoundId, visibleOptions]);

  const selectedDetail = selectedOption
    ? [selectedOption.detail, selectedOption.summary, selectedOption.compatibility, selectedOption.sourceState].filter(Boolean).join(" | ")
    : selectedSoundId
      ? "Reference only; no preview source loaded"
      : "Choose a sound to preview.";

  return (
    <FloatingWorkbenchPanel
      title="Preview Sound"
      eyebrow="Encounter Results"
      storageKey="encounters.soundPreview.position"
      defaultWidth={560}
      defaultHeight={430}
      minWidth={420}
      minHeight={320}
      className="encounter-sound-preview-panel"
      actions={(
        <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
          Close
        </button>
      )}
    >
      <div className="encounter-sound-preview-body">
        <label className="encounter-sound-preview-picker">
          <span>Sound</span>
          <input
            type="search"
            value={query}
            placeholder="Search sounds or type snd 624..."
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <select
            value={selectedSoundId ? String(Math.abs(selectedSoundId)) : ""}
            onChange={(event) => setSelectedSoundId(Number(event.currentTarget.value))}
          >
            <option value="">Choose sound...</option>
            {visibleOptions.map((option) => (
              <option key={option.key} value={Math.abs(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <section className="encounter-sound-preview-card">
          <header>
            <Volume2 size={16} />
            <div>
              <strong>{selectedOption?.label ?? (selectedSoundId ? `Sound ${Math.abs(selectedSoundId)}` : "No Sound Selected")}</strong>
              <small>{selectedDetail}</small>
            </div>
          </header>
          <div className="encounter-sound-preview-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!selectedPreviewUrl}
              title={selectedPreviewUrl ? "Play this sound preview." : "No playable preview is available for this sound."}
              onClick={() => selectedPreviewUrl && playPreviewUrl(selectedPreviewUrl)}
            >
              <Volume2 size={13} /> Play
            </button>
            {!selectedPreviewUrl && (
              <span>No playable preview is available. Reference-only sounds can still be used with the Play Sound code.</span>
            )}
          </div>
        </section>
        {filteredOptions.length > visibleOptions.length && (
          <small className="target-picker-empty">{filteredOptions.length - visibleOptions.length} more sound(s); search to narrow.</small>
        )}
      </div>
    </FloatingWorkbenchPanel>
  );
}

function useEncounterSoundPreviewUrl(
  option: ScriptTargetOption | null,
  soundId: number,
  project: Project,
  previewContext: PreviewRuntimeContext
) {
  const resourceId = soundId ? Math.abs(soundId) : option?.value ?? null;
  return useResolvedPreviewUrl(
    option?.previewPath ?? option?.managedAsset?.previewPath ?? option?.libraryAsset?.previewPath ?? null,
    option?.managedAsset ?? null,
    option?.libraryAsset ?? null,
    { ...previewContext, project, resourceType: "snd ", resourceId }
  );
}

function SimpleEncounterActionCell({
  project,
  catalog,
  slot,
  row,
  onUpdate,
  onFocusCode,
  onCreateTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  slot: number;
  row: EncounterActionRow;
  onUpdate: (changes: Partial<EncounterActionRow>) => void;
  onFocusCode: (code: number) => void;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
}) {
  const baseCode = resultActionBaseCode(row.rawCode);
  const isNegativeAction = row.rawCode < 0;
  const rowOption = actionOptionFor(baseCode);
  const targetType = realmzScriptStepDescriptorFor(baseCode).targetType;
  const selected = targetOptionForOpcodeValue(project, baseCode, row.id, catalog);
  const resolvedValue = resolveSignedMessageTarget(baseCode, row.id);
  const canCreate = Boolean(targetType && resolvedValue > 0 && !selected);
  const populated = row.rawCode !== 0 || row.id !== 0;
  const options = resultActionOptionsFor(baseCode);
  const resolvedTitle = selected
    ? [selected.label, signedTargetBehaviorLabel(baseCode, row.id)].filter(Boolean).join(" | ")
    : resolvedValue !== 0
      ? `Raw value ${row.id}`
      : "No target";
  return (
    <div className={`simple-encounter-action-cell${populated ? " populated" : ""}`}>
      <button
        type="button"
        className={`encounter-action-sign-toggle${isNegativeAction ? " active" : ""}`}
        title={baseCode === 0 ? "Empty rows cannot be negative" : "Run the negative version of this code"}
        aria-label={`Toggle negative result action ${slot}`}
        disabled={baseCode === 0}
        onClick={() => onUpdate({ rawCode: signedResultActionCode(baseCode, !isNegativeAction) })}
      >
        {isNegativeAction ? "-" : ""}
      </button>
      <select
        aria-label={`Result action ${slot} opcode`}
        value={baseCode}
        title={rowOption ? `${rowOption.category}: ${rowOption.description}` : "Empty action row"}
        onFocus={() => onFocusCode(baseCode)}
        onChange={(event) => {
          const nextCode = Number(event.currentTarget.value);
          onUpdate({ rawCode: signedResultActionCode(nextCode, isNegativeAction) });
        }}
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>{option.code} {option.shortLabel}</option>
        ))}
      </select>
      <label className="encounter-action-id-field">
        <input
          type="number"
          value={row.id}
          title={resolvedTitle}
          aria-label={`Result action ${slot} ID`}
          onFocus={() => onFocusCode(baseCode)}
          onChange={(event) => onUpdate({ id: Number(event.currentTarget.value) })}
        />
      </label>
      {canCreate && (
        <button type="button" className="btn btn-secondary btn-xs" onClick={() => targetType && onCreateTarget(targetType, resolvedValue)}>
          Create {resolvedValue}
        </button>
      )}
      {populated && (
        <button
          type="button"
          className="encounter-action-clear"
          title="Clear"
          aria-label={`Clear result action ${slot}`}
          onClick={() => onUpdate({ rawCode: 0, id: 0 })}
        >
          <X size={12} />
        </button>
      )}
      {!populated && <span className="encounter-action-clear-placeholder" aria-hidden="true" />}
    </div>
  );
}

const RESULT_ACTION_OPTIONS = ACTION_OPTIONS.filter((option) => option.code >= 0);

function resultActionBaseCode(code: number) {
  return Math.abs(Number.isFinite(code) ? code : 0);
}

function signedResultActionCode(code: number, negative: boolean) {
  const baseCode = resultActionBaseCode(code);
  if (baseCode === 0) return 0;
  return negative ? -baseCode : baseCode;
}

function resultActionOptionsFor(baseCode: number) {
  if (RESULT_ACTION_OPTIONS.some((option) => option.code === baseCode)) return RESULT_ACTION_OPTIONS;
  const fallback = actionOptionFor(baseCode);
  return [fallback, ...RESULT_ACTION_OPTIONS];
}

type ResultCodeHelperListItem = {
  code: number;
  title: string;
  alias?: string;
  category: string;
  description: string;
  entries: DivinityOpcodeHelpEntry[];
  searchText: string;
};

function ResultCodeHelperPanel({
  selectedCode,
  onSelectCode,
  onClose
}: {
  selectedCode: number;
  onSelectCode: (code: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => buildResultCodeHelperItems(), []);
  const filteredItems = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return items;
    return items.filter((item) => terms.every((term) => item.searchText.includes(term)));
  }, [items, query]);
  const selectedItem = items.find((item) => item.code === selectedCode) ?? filteredItems[0] ?? items[0];
  const selectedEntries = selectedItem?.entries ?? [];
  return (
    <FloatingWorkbenchPanel
      title="Code Helper"
      eyebrow="Divinity Manual"
      storageKey="encounters.resultCodeHelper.position"
      defaultWidth={900}
      defaultHeight={640}
      minWidth={560}
      minHeight={420}
      className="encounter-code-helper-panel"
      actions={(
        <button type="button" className="btn btn-secondary btn-xs" onClick={onClose}>
          Close
        </button>
      )}
    >
      <div className="encounter-code-helper-body">
        <aside className="encounter-code-helper-list" aria-label="Divinity action codes">
          <input
            type="search"
            value={query}
            placeholder="Search codes..."
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <div className="encounter-code-helper-source">
            <strong>{DIVINITY_OPCODE_HELP_SOURCE.opcodeEntryCount}</strong>
            <span>manual code entries</span>
          </div>
          <div className="encounter-code-helper-results">
            {filteredItems.map((item) => (
              <button
                key={item.code}
                type="button"
                className={item.code === selectedItem?.code ? "selected" : ""}
                onClick={() => onSelectCode(item.code)}
              >
                <strong>{item.code} {item.title}</strong>
                <small>{item.entries.length > 0 ? item.category : "No extracted manual text"}</small>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <EmptyState title="No Matching Codes" body="Try searching by opcode number, title, target field, option, or E-Code text." />
            )}
          </div>
        </aside>
        <section className="encounter-code-helper-detail">
          {selectedItem ? (
            <>
              <header>
                <div>
                  <strong>{selectedItem.code} {selectedItem.title}</strong>
                  {selectedItem.alias && <small>Providence alias: {selectedItem.alias}</small>}
                </div>
                <span>{selectedItem.category}</span>
              </header>
              {selectedEntries.length === 0 ? (
                <div className="field-warning">
                  This action exists in Providence's action catalog, but no extracted Divinity manual text is available for this code.
                </div>
              ) : (
                <div className="encounter-code-helper-entry-stack">
                  {selectedEntries.map((entry) => (
                    <article key={entry.resourceId} className="encounter-code-helper-entry">
                      <header>
                        <strong>{entry.title}</strong>
                        <small>Manual text resource {entry.resourceId}; code{entry.codes.length === 1 ? "" : "s"} {entry.codes.join(", ")}</small>
                      </header>
                      {entry.summary && <p className="encounter-code-helper-summary">{entry.summary}</p>}
                      <dl className="encounter-code-helper-fields">
                        {codeHelperSectionsForEntry(entry).map((section) => (
                          <CodeHelperField key={section.label} label={section.label} value={section.value} />
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <EmptyState title="No Code Selected" body="Choose a code from the list to read the Divinity manual text." />
          )}
        </section>
      </div>
    </FloatingWorkbenchPanel>
  );
}

type CodeHelperSection = {
  label: string;
  value: string;
};

function CodeHelperField({ label, value }: { label: string; value: string }) {
  return (
    <div className="encounter-code-helper-field">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function codeHelperSectionsForEntry(entry: DivinityOpcodeHelpEntry): CodeHelperSection[] {
  const parsed = parseCodeHelperManualText(entry.fullText, entry.codes);
  const sections: CodeHelperSection[] = [];
  const addSection = (label: string, value: string | undefined, fallback?: string) => {
    const normalized = normalizeCodeHelperSection(label, value || fallback || "");
    if (!normalized || normalized.toLowerCase() === "none listed") return;
    sections.push({ label, value: normalized });
  };

  addSection("ID Field", parsed.get("ID"), entry.idField || "Not specified");
  addSection("Use", parsed.get("Use"), entry.use || "Not specified");
  addSection("Options", parsed.get("Options"), entry.options || "None");
  addSection("E-Codes", parsed.get("E-Codes"), entry.extraCodes || "None");
  addSection("Example", parsed.get("Example"));
  addSection("Script Tip", parsed.get("Script Tip"));
  addSection("Note", parsed.get("Note"));

  if (sections.length === 0) {
    sections.push({ label: "Manual Text", value: normalizeCodeHelperSection("Manual Text", entry.fullText) || "No extracted manual text." });
  }
  return sections;
}

function parseCodeHelperManualText(fullText: string | undefined, codes: number[] = []): Map<string, string> {
  const sections = new Map<string, string>();
  if (!fullText) return sections;
  const normalized = sliceCodeHelperManualText(fullText, codes).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const pattern = /(^|\n)\s*(ID|Use|Options|E-Codes|Example|Script Tip|Note)\s*:?\s*/g;
  const matches = Array.from(normalized.matchAll(pattern));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const label = match[2];
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
    const value = normalized.slice(start, end);
    const cleaned = normalizeCodeHelperRawText(value);
    if (cleaned) sections.set(label, cleaned);
  }
  return sections;
}

function sliceCodeHelperManualText(fullText: string, codes: number[]) {
  const normalized = fullText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\u00a0/g, " ");
  const wantedCodes = new Set(codes);
  if (wantedCodes.size === 0) return normalized;
  const headings = Array.from(normalized.matchAll(/^Code\s+(-?\d+)\b[^\n]*/gim));
  if (headings.length === 0) return normalized;
  const startHeadingIndex = headings.findIndex((match) => wantedCodes.has(Number(match[1])));
  if (startHeadingIndex < 0) return normalized;
  const start = headings[startHeadingIndex].index ?? 0;
  const nextHeading = headings
    .slice(startHeadingIndex + 1)
    .find((match) => !wantedCodes.has(Number(match[1])));
  const end = nextHeading?.index ?? normalized.length;
  return normalized.slice(start, end);
}

function normalizeCodeHelperSection(label: string, value: string | undefined): string {
  if (label === "E-Codes") return formatCodeHelperEcodes(value);
  return formatCodeHelperProse(value);
}

function normalizeCodeHelperRawText(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatCodeHelperProse(value: string | undefined): string {
  return normalizeCodeHelperRawText(value)
    .replace(/([^\n])\s+(?=(?:Example|Script Tip|Note):)/g, "$1\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatCodeHelperEcodes(value: string | undefined): string {
  const raw = normalizeCodeHelperRawText(value);
  if (!raw) return "";
  const prepared = raw
    .replace(/(^|\n)\s*E-?Code\s*\n\s*(\d+)\)/gi, "$1\nE-Code $2)")
    .replace(/(^|\n|\.\s+)E-?Code\s+(\d+)\)/gi, (_match, prefix: string, code: string) => {
      const spacer = prefix.trim() ? `${prefix.trimEnd()}\n\n` : prefix;
      return `${spacer}E-Code ${code})`;
    })
    .replace(/(^|\n)(E-Code \d+\))\s+/g, "$1$2\n")
    .replace(/\n{3,}/g, "\n\n");
  const lines = prepared.split("\n").map((line) => line.trim()).filter(Boolean);
  const formatted: string[] = [];
  let inNumberedEntry = false;
  let previousWasHeading = false;

  for (const line of lines) {
    if (/^E-Code \d+\)/i.test(line)) {
      if (formatted.length > 0 && formatted[formatted.length - 1] !== "") formatted.push("");
      formatted.push(line.replace(/^E-Code/i, "E-Code"));
      inNumberedEntry = false;
      previousWasHeading = true;
      continue;
    }

    if (/^\d+\)/.test(line)) {
      formatted.push(line);
      inNumberedEntry = true;
      previousWasHeading = false;
      continue;
    }

    if (inNumberedEntry && !previousWasHeading) {
      formatted.push(`   ${line}`);
    } else {
      formatted.push(line);
    }
    previousWasHeading = false;
  }

  return formatted.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildResultCodeHelperItems(): ResultCodeHelperListItem[] {
  const manualCodes = new Set(allDivinityOpcodeHelpEntries().flatMap((entry) => entry.codes).filter((code) => code >= 0));
  const actionCodes = new Set(RESULT_ACTION_OPTIONS.map((option) => option.code));
  const codes = Array.from(new Set([...manualCodes, ...actionCodes])).sort((left, right) => left - right);
  return codes.map((code) => {
    const action = actionOptionFor(code);
    const entries = divinityHelpEntriesForOpcode(code);
    const title = entries[0]?.title ?? action.displayTitle;
    const searchText = [
      code,
      title,
      action.aliasTitle,
      action.category,
      action.description,
      ...entries.flatMap((entry) => [entry.title, entry.idField, entry.use, entry.options, entry.extraCodes, entry.summary, entry.fullText])
    ].filter(Boolean).join(" ").toLowerCase();
    return {
      code,
      title,
      alias: action.aliasTitle,
      category: action.category,
      description: action.description,
      entries,
      searchText
    };
  });
}

const ROGUE_ACTION_LABELS = [
  "Acrobatic Act",
  "Detect Trap",
  "Disarm Trap",
  "Hear Noise",
  "Force Lock",
  "Move Silently",
  "Pick Lock",
  "Pick Pocket"
];

function ThiefEncounterShell({
  project,
  catalog,
  previewContext,
  id,
  record,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  id: number;
  record: Project["thiefEncounters"][number];
  onSelectEntity?: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateThiefEncounterRecord" }>["changes"]) => {
    onApplyCommand?.({ kind: "updateThiefEncounterRecord", label: "Update rogue encounter", id, changes });
  };
  const enabledCount = (record.typeFlags ?? []).slice(0, ROGUE_PRIMARY_ACTIONS).filter(Boolean).length;
  const trapped = Boolean(record.typeFlags?.[9]);
  const rogueOnly = Boolean(record.typeFlags?.[8]);
  return (
    <div className="thief-encounter-editor">
      <EncounterRecordPicker project={project} recordType="thiefEncounter" id={id} onSelectEntity={onSelectEntity} className="encounter-record-picker-standalone" />
      <section className="rogue-action-matrix">
        <header>
          <div>
            <TutorialTip title="Rogue Action Tests" body={ROGUE_ACTION_TESTS_HELP} side="below">
              <strong>Rogue Action Tests</strong>
            </TutorialTip>
          </div>
          <small>{enabledCount}/{ROGUE_PRIMARY_ACTIONS} enabled; success/fail columns return result codes, strings, and sounds.</small>
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
          {Array.from({ length: ROGUE_PRIMARY_ACTIONS }, (_, slot) => (
            <RogueActionRow
              key={slot}
              slot={slot}
              record={record}
              project={project}
              catalog={catalog}
              onUpdate={update}
              onCreateMessage={(targetId) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create rogue string", recordType: "message", id: targetId })}
            />
          ))}
        </div>
      </section>
      <section className="rogue-encounter-detail-grid">
        <div className="rogue-trap-panel">
          <header>
            <TutorialTip title="Trap / Lock Setup" body={ROGUE_TRAP_HELP} side="below">
              <strong>Trap / Lock Setup</strong>
            </TutorialTip>
            <small>{trapped ? "Trap armed" : "No armed trap"}; affects {rogueOnly ? "the acting rogue only" : "the whole party"}.</small>
          </header>
          <div className="rogue-trap-fields">
            <div className="rogue-trap-lock-column">
              <strong>Traps</strong>
              <RoguePromptStringSelect
                project={project}
                catalog={catalog}
                label="Trap Prompt String"
                emptyLabel="No trap prompt string"
                className="rogue-trap-prompt-string-field"
                value={record.prompts?.[0] ?? 0}
                onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 0, value, 3) })}
              />
              <RoguePromptStringPreview
                project={project}
                label="Trap Prompt Text"
                prompt={record.prompts?.[0] ?? 0}
                onApplyCommand={onApplyCommand}
              />
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
              <label className="rogue-trap-range-row">
                <span>Trap Damage</span>
                <div>
                  <InlineNumberField ariaLabel="Trap Damage Low" value={record.lowDamage} onCommit={(lowDamage) => update({ lowDamage })} />
                  <em>to</em>
                  <InlineNumberField ariaLabel="Trap Damage High" value={record.highDamage} onCommit={(highDamage) => update({ highDamage })} />
                </div>
              </label>
              <RogueSoundSelectField
                project={project}
                catalog={catalog}
                previewContext={previewContext}
                label="Trap Sound"
                emptyLabel="No trap sound"
                value={record.prompts?.[1] ?? 0}
                className="rogue-trap-sound-field"
                previewAriaLabel="Preview Trap Sound"
                onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 1, value, 3) })}
              />
              <RogueTrapSpellField
                project={project}
                catalog={catalog}
                value={record.spell}
                onCommit={(spell) => update({ spell })}
              />
              <NumberField label="Power Level" value={record.prompts?.[2] ?? 0} onCommit={(value) => update({ prompts: updateArraySlot(record.prompts ?? [], 2, value, 3) })} compact />
              <NumberField label="% Chance / Level to Disarm Trap" value={rogueSpellPathChance(record, ROGUE_DISARM_TRAP_SPELL_PATH)} onCommit={(value) => update({ promptSounds: updateArraySlot(record.promptSounds ?? [], ROGUE_DISARM_TRAP_SPELL_PATH.chanceSlot, value, 3) })} compact />
            </div>
            <div className="rogue-trap-lock-column">
              <strong>Locks</strong>
              <NumberField label="Number of Lock Tumblers" value={record.tumblers} onCommit={(tumblers) => update({ tumblers })} compact />
              <NumberField label="% Chance / Level to Open" value={rogueSpellPathChance(record, ROGUE_OPEN_LOCK_SPELL_PATH)} onCommit={(value) => update({ promptSounds: updateArraySlot(record.promptSounds ?? [], ROGUE_OPEN_LOCK_SPELL_PATH.chanceSlot, value, 3) })} compact />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RogueSoundSelectField({
  project,
  catalog,
  previewContext,
  label,
  emptyLabel,
  value,
  className,
  previewAriaLabel,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  previewContext: PreviewRuntimeContext;
  label: string;
  emptyLabel: string;
  value: number;
  className: string;
  previewAriaLabel: string;
  onCommit: (value: number) => void;
}) {
  const soundOptions = useMemo(() => targetOptionsForOpcode(project, 9, catalog), [catalog, project]);
  const selected = useMemo(() => targetOptionForOpcodeValue(project, 9, value, catalog), [catalog, project, value]);
  const selectedValue = Math.abs(value);
  const selectedInOptions = selectedValue === 0 || soundOptions.some((option) => option.value === selectedValue);
  const soundHelp = selected
    ? [selected.label, selected.detail, selected.summary].filter(Boolean).join(" | ")
    : value
      ? `Sound ${selectedValue} has no matching loaded sound target.`
      : `${emptyLabel} selected.`;
  const selectedPreviewUrl = useEncounterSoundPreviewUrl(selected, value, project, previewContext);
  return (
    <div className={className} title={soundHelp}>
      <TutorialTip title={label} body={soundHelp} side="below">
        <span>{label}</span>
      </TutorialTip>
      <button
        type="button"
        className="rogue-trap-sound-preview-button"
        disabled={!selectedPreviewUrl}
        title={selectedPreviewUrl ? `Preview ${selected?.label ?? `sound ${selectedValue}`}` : "No playable preview is available for this sound."}
        aria-label={previewAriaLabel}
        onClick={() => selectedPreviewUrl && playPreviewUrl(selectedPreviewUrl)}
      >
        <Volume2 size={12} />
      </button>
      <select
        aria-label={label}
        title={soundHelp}
        value={value}
        onChange={(event) => onCommit(Number(event.currentTarget.value))}
      >
        <option value={0}>{emptyLabel}</option>
        {value !== 0 && !selectedInOptions && <option value={value}>Current sound {selectedValue}</option>}
        {soundOptions.map((option) => {
          const optionValue = signedTargetValueForSelection(9, value, option.value);
          return <option key={option.key} value={optionValue}>{option.label}</option>;
        })}
      </select>
    </div>
  );
}

function RoguePromptStringSelect({
  project,
  catalog,
  label = "Prompt String",
  emptyLabel = "No prompt string",
  className = "rogue-prompt-string-field",
  value,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label?: string;
  emptyLabel?: string;
  className?: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const selected = useMemo(() => targetOptionForOpcodeValue(project, 1, value, catalog), [catalog, project, value]);
  const options = useMemo(() => targetOptionsForOpcode(project, 1, catalog), [catalog, project]);
  const resolvedValue = resolveSignedMessageTarget(1, value);
  const hasRawValue = resolvedValue !== 0 && !selected;
  const visibleOptions = selected && !options.some((option) => option.value === selected.value) ? [selected, ...options] : options;
  const help = selected
    ? [selected.label, selected.detail, selected.summary, signedTargetBehaviorLabel(1, value)].filter(Boolean).join(" | ")
    : hasRawValue
      ? `String ${resolvedValue} is not created yet.`
      : `${emptyLabel} selected.`;

  return (
    <label className={className} title={help}>
      <TutorialTip title={label} body={help} side="below">
        <span>{label}</span>
      </TutorialTip>
      <span aria-hidden="true" />
      <select
        aria-label={label}
        title={help}
        value={hasRawValue ? `raw:${resolvedValue}` : selected ? String(selected.value) : ""}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (!next) {
            onCommit(0);
            return;
          }
          if (next.startsWith("raw:")) return;
          onCommit(signedTargetValueForSelection(1, value, Number(next)));
        }}
      >
        <option value="">{emptyLabel}</option>
        {hasRawValue && <option value={`raw:${resolvedValue}`}>Current string {resolvedValue}</option>}
        {visibleOptions.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function RoguePromptStringPreview({
  project,
  label = "Prompt Text",
  prompt,
  onApplyCommand
}: {
  project: Project;
  label?: string;
  prompt: number;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const messageId = resolveSignedMessageTarget(1, prompt);
  const message = messageId > 0 ? project.messages?.find((record) => record.id === messageId) : null;
  const [draft, setDraft] = useState(message?.text ?? "");
  useEffect(() => {
    setDraft(message?.text ?? "");
  }, [message?.id, message?.text]);
  const disabled = !message;
  return (
    <label className="rogue-prompt-string-preview">
      <span>{label}</span>
      <textarea
        value={draft}
        rows={4}
        disabled={disabled}
        placeholder={messageId > 0 ? `String ${messageId} is not created yet.` : "Choose a prompt string to preview and edit it here."}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          if (!message || draft === message.text) return;
          onApplyCommand?.({ kind: "updateMessageRecord", label: `Update Rogue Prompt String ${message.id}`, id: message.id, changes: { text: draft } });
        }}
      />
    </label>
  );
}

function RogueTrapSpellField({
  project,
  catalog,
  value,
  onCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  value: number;
  onCommit: (value: number) => void;
}) {
  const options = useMemo(() => spellReferenceOptions(project, catalog), [catalog, project]);
  const selected = options.find((option) => option.value === value);
  const spellHelp = selected
    ? [selected.label, selected.detail].filter(Boolean).join(" | ")
    : value
      ? `Spell ${value} has no matching loaded spell target.`
      : "No trap spell selected.";
  return (
    <label className="rogue-trap-spell-field" title={spellHelp}>
      <TutorialTip title="Trap Spell" body={spellHelp} side="below">
        <span>Trap Spell</span>
      </TutorialTip>
      <select
        aria-label="Trap Spell"
        title={spellHelp}
        value={value}
        onChange={(event) => onCommit(Number(event.currentTarget.value))}
      >
        <option value={0}>No trap spell</option>
        {value !== 0 && !selected && <option value={value}>Current spell {value}</option>}
        {options.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
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
  const actionWarnings = rogueActionOutcomeWarnings(record, slot);
  return (
    <>
      <div className="rogue-action-row" role="row">
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
    </>
  );
}

function rogueActionOutcomeWarnings(record: Project["thiefEncounters"][number], slot: number) {
  if (!record.typeFlags?.[slot]) return [];
  const label = ROGUE_ACTION_LABELS[slot] ?? `Rogue Action ${slot}`;
  const warnings: string[] = [];
  if (!rogueOutcomeHasVisiblePath(record, slot, "success")) {
    warnings.push(`${label} can succeed, but success currently has no visible result. Add a result code, string, or sound.`);
  }
  if (!rogueOutcomeHasVisiblePath(record, slot, "failure")) {
    warnings.push(`${label} can fail, but failure currently has no visible result. Add a result code, string, or sound.`);
  }
  return warnings;
}

function TimedEncounterShell({
  project,
  catalog,
  id,
  record,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  id: number;
  record: Project["timedEncounters"][number];
  onSelectEntity?: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const update = (changes: Extract<ProjectCommand, { kind: "updateTimedEncounterRecord" }>["changes"]) => {
    onApplyCommand?.({ kind: "updateTimedEncounterRecord", label: "Update time encounter", id, changes });
  };
  const setLocationKind = (locationKind: Project["timedEncounters"][number]["locationKind"]) => {
    update({ locationKind, stuff: updateArraySlot(record.stuff ?? [], 0, locationKindValue(locationKind), 10) });
  };
  const eligibilitySummary = timedEncounterEligibilitySummary(record);
  const reservedTimedValues = Array.from({ length: 9 }, (_, index) => record.stuff?.[index + 1] ?? 0);
  const reservedNonZeroCount = reservedTimedValues.filter((value) => value !== 0).length;
  return (
    <div className="timed-encounter-editor">
      <EncounterRecordPicker project={project} recordType="timedEncounter" id={id} onSelectEntity={onSelectEntity} className="encounter-record-picker-standalone" />
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
            <ItemIdField project={project} catalog={catalog} label="Required Item" value={record.requiredItem} onCommit={(requiredItem) => update({ requiredItem })} compact />
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
            <TimedNumberRow label="Required Level" value={record.requiredLevel} onCommit={(requiredLevel) => update({ requiredLevel })} />
            <TimedNumberRow label="Required Rect" value={record.requiredRandomRect} onCommit={(requiredRandomRect) => update({ requiredRandomRect })} />
            <TimedNumberRow label="Required X" value={record.requiredX} onCommit={(requiredX) => update({ requiredX })} />
            <TimedNumberRow label="Required Y" value={record.requiredY} onCommit={(requiredY) => update({ requiredY })} />
          </div>
        </div>
      </section>
      <CollapsibleSection title="Compatibility Data" eyebrow="advanced" count={reservedNonZeroCount ? `${reservedNonZeroCount} preserved value${reservedNonZeroCount === 1 ? "" : "s"}` : "all zero"} density="compact" className="script-encounter-text-section timed-extra-section" defaultOpen={false}>
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
  project,
  catalog,
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
  actions,
  onTextCommit,
  onChoiceCommit,
  onWordCommit,
  onComplexCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
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
  actions: EncounterActionRow[];
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
        <header className="visually-hidden">
          <div>
            <strong>Encounter Responses</strong>
          </div>
        </header>
        <div className="complex-encounter-tool-grid">
          <section className="complex-encounter-tool-panel complex-encounter-action-choice-panel">
            <header>
              <TutorialTip title="Action Picker Branch" body={COMPLEX_BAR_ACTIONS_HELP} side="below">
                <strong>Action Choices</strong>
              </TutorialTip>
            </header>
            <div className="complex-encounter-action-list">
              {Array.from({ length: 8 }, (_, slot) => {
                const text = texts[slot] ?? "";
                return (
                  <div key={slot} className="complex-encounter-action-option">
                    <label className="complex-encounter-action-required" title={`Require action ${slot}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(groups[slot] ?? 0)}
                        onChange={(event) => onComplexCommit({ groups: updateArraySlot(groups, slot, event.currentTarget.checked ? 1 : 0, 8) })}
                      />
                    </label>
                    <span className="complex-encounter-action-index">{slot}</span>
                    <label className="script-encounter-text-field complex-encounter-inline-text">
                      <input
                        key={`complex-action-${slot}-${text}`}
                        type="text"
                        defaultValue={text}
                        maxLength={maxLength}
                        onBlur={(event) => onTextCommit(slot, event.currentTarget.value)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="complex-encounter-result-line">
              <EncounterResultNumberField
                label="Action Result"
                value={actionResult}
                actions={actions}
                onCommit={(value) => onComplexCommit({ actionResult: value, choiceResults: [value, 0, 0, 0] })}
              />
            </div>
          </section>
          <ComplexEncounterResponseGrid
            project={project}
            catalog={catalog}
            title="Magic Responses"
            className="complex-encounter-magic-panel"
            help={COMPLEX_SPELL_TESTS_HELP}
            count={10}
            kind="magic"
            resultLabel="Magic Result"
            ids={spellIds}
            results={spellResults}
            actions={actions}
            onIdsCommit={(next) => onComplexCommit({ spellIds: next })}
            onResultsCommit={(next) => onComplexCommit({ spellResults: next })}
          />
          <ComplexEncounterResponseGrid
            project={project}
            catalog={catalog}
            title="Item Responses"
            className="complex-encounter-item-panel"
            help={COMPLEX_ITEM_TESTS_HELP}
            count={5}
            kind="item"
            resultLabel="Item Result"
            ids={itemIds}
            results={itemResults}
            actions={actions}
            onIdsCommit={(next) => onComplexCommit({ itemIds: next })}
            onResultsCommit={(next) => onComplexCommit({ itemResults: next })}
          />
          <section className="complex-encounter-tool-panel complex-encounter-word-panel">
            <header>
              <TutorialTip title="Word / Phrase Branch" body={COMPLEX_WORD_HELP} side="below">
                <strong>Typed Reply</strong>
              </TutorialTip>
            </header>
            <label className="script-encounter-text-field encounter-word-answer complex-encounter-inline-text">
              <input
                key={`complex-word-${texts[8] ?? ""}`}
                type="text"
                defaultValue={texts[8] ?? ""}
                maxLength={maxLength}
                onInput={(event) => {
                  const lowered = event.currentTarget.value.toLowerCase();
                  if (event.currentTarget.value !== lowered) event.currentTarget.value = lowered;
                }}
                onBlur={(event) => {
                  const lowered = event.currentTarget.value.toLowerCase();
                  event.currentTarget.value = lowered;
                  onTextCommit(8, lowered);
                }}
              />
              <small>Typed replies are stored lowercase; uppercase letters are converted automatically.</small>
            </label>
            <div className="complex-encounter-result-line">
              <EncounterResultNumberField
                label="Typed Reply Result"
                value={wordResult}
                actions={actions}
                onCommit={(value) => onComplexCommit({ wordResult: value, wordResults: [value, 0, 0, 0] })}
              />
            </div>
          </section>
        </div>
      </section>
    );
  }
  const autoRunResultFour = (choiceResults[0] ?? 0) === SIMPLE_RESULT_AUTO_FAIL_SENTINEL;
  return (
    <section className="encounter-result-editor simple-encounter-options-panel">
      <header>
        <div>
          <TutorialTip title="Simple Player Options" body={SIMPLE_OPTIONS_HELP} side="below">
            <strong>Player Options</strong>
          </TutorialTip>
          <small>{count} classic Pascal text buffers, {maxLength} display bytes each</small>
        </div>
      </header>
      {autoRunResultFour && (
        <p className="simple-encounter-sentinel-note">This encounter skips the choice prompt and immediately runs Result #4.</p>
      )}
      <div className="encounter-result-table simple-encounter-options-table">
        {Array.from({ length: 4 }, (_, slot) => {
          const text = texts[slot] ?? "";
          return (
            <div key={slot} className="encounter-result-row simple-encounter-option-row">
              <b>{`Option ${slot + 1}`}</b>
              <label className="script-encounter-text-field">
                <span>{encounterTextBufferLabel(recordKind, slot)}</span>
                <textarea
                  key={`simple-choice-${slot}-${text}`}
                  defaultValue={text}
                  maxLength={maxLength}
                  onBlur={(event) => onTextCommit(slot, event.currentTarget.value)}
                />
                <small>{text.length}/{maxLength}</small>
              </label>
              <SimpleEncounterResultPicker
                slot={slot}
                value={choiceResults[slot] ?? 0}
                actions={actions}
                onCommit={(value) => onChoiceCommit(slot, value)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SimpleEncounterResultPicker({ slot, value, actions, onCommit }: { slot: number; value: number; actions: EncounterActionRow[]; onCommit: (value: number) => void }) {
  const validValues = slot === 0 ? [0, 1, 2, 3, 4, SIMPLE_RESULT_AUTO_FAIL_SENTINEL] : [0, 1, 2, 3, 4];
  const supported = validValues.includes(value);
  const status = value === 0
    ? "missing"
    : value === SIMPLE_RESULT_AUTO_FAIL_SENTINEL && slot === 0
      ? encounterResultStatus(actions, 4)
      : supported
        ? encounterResultStatus(actions, value)
        : "out-of-range";
  const statusLabel = value === 0
    ? "No result"
    : value === SIMPLE_RESULT_AUTO_FAIL_SENTINEL && slot === 0
      ? "Auto-run Result #4"
      : supported
        ? resultStatusLabel(status)
        : `Unsupported imported value ${value}`;
  return (
    <label className={`simple-encounter-result-picker is-${status}`} title={statusLabel}>
      <span>Result #</span>
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>0 No result / unavailable</option>
        <option value={1}>1 Result #1</option>
        <option value={2}>2 Result #2</option>
        <option value={3}>3 Result #3</option>
        <option value={4}>4 Result #4</option>
        {slot === 0 && <option value={SIMPLE_RESULT_AUTO_FAIL_SENTINEL}>-4 Auto-run Result #4</option>}
        {!supported && <option value={value}>{`Unsupported imported value ${value}`}</option>}
      </select>
      <small>{statusLabel}</small>
    </label>
  );
}

const MAGIC_RESPONSE_BLANK_SPELL_ID = 1100;

function ComplexEncounterResponseGrid({
  project,
  catalog,
  title,
  className,
  help,
  count,
  kind,
  resultLabel,
  ids,
  results,
  actions,
  onIdsCommit,
  onResultsCommit
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  title: string;
  className?: string;
  help?: string;
  count: number;
  kind: "magic" | "item";
  resultLabel: string;
  ids: number[];
  results: number[];
  actions: EncounterActionRow[];
  onIdsCommit: (values: number[]) => void;
  onResultsCommit: (values: number[]) => void;
}) {
  const [activeDraftSlots, setActiveDraftSlots] = useState<Set<number>>(() => new Set());
  const blankId = kind === "magic" ? MAGIC_RESPONSE_BLANK_SPELL_ID : 0;
  const isBlankStoredValue = (slot: number) => {
    const id = ids[slot] ?? 0;
    const result = results[slot] ?? 0;
    if (kind === "magic") return (id === 0 || id === MAGIC_RESPONSE_BLANK_SPELL_ID) && result === 0;
    return id === 0 && result === 0;
  };
  const hasStoredValue = (slot: number) => !isBlankStoredValue(slot);
  const hasVisibleValue = (slot: number) => hasStoredValue(slot) || activeDraftSlots.has(slot);
  const isPreservedNoResult = (slot: number) => hasStoredValue(slot) && (results[slot] ?? 0) === 0;
  const slots = Array.from({ length: count }, (_, slot) => slot);
  const setDraftSlotActive = (slot: number, active: boolean) => {
    setActiveDraftSlots((current) => {
      const next = new Set(current);
      if (active) next.add(slot);
      else next.delete(slot);
      return next;
    });
  };
  return (
    <section className={`complex-encounter-response-grid${className ? ` ${className}` : ""}`}>
      <header>
        {help ? (
          <TutorialTip title={title} body={help} side="below">
            <strong>{title}</strong>
          </TutorialTip>
        ) : (
          <strong>{title}</strong>
        )}
      </header>
      <div>
        {slots.map((slot) => (
          <div
            key={slot}
            className={`complex-encounter-response-row${!hasVisibleValue(slot) ? " is-unused" : ""}${isPreservedNoResult(slot) ? " is-preserved-no-result" : ""}`}
          >
            <b>{slot + 1}</b>
            <EncounterResultNumberField
              label={resultLabel}
              value={results[slot] ?? 0}
              actions={actions}
              onDraftActiveChange={(active) => setDraftSlotActive(slot, active)}
              onCommit={(value) => onResultsCommit(updateArraySlot(results, slot, value, count))}
            />
            {kind === "magic" ? (
              <SpellResponseField
                project={project}
                catalog={catalog}
                label="Spell / Scroll"
                value={ids[slot] ?? 0}
                onCommit={(value) => onIdsCommit(updateArraySlot(ids, slot, value, count))}
              />
            ) : (
              <ItemIdField
                project={project}
                catalog={catalog}
                label="Item"
                value={ids[slot] ?? 0}
                onCommit={(value) => onIdsCommit(updateArraySlot(ids, slot, value, count))}
                compact
              />
            )}
            {hasStoredValue(slot) && (
              <button
                type="button"
                className="encounter-action-clear"
                title="Clear"
                aria-label={`Clear ${kind === "magic" ? "magic" : "item"} response ${slot + 1}`}
                onClick={() => {
                  onIdsCommit(updateArraySlot(ids, slot, blankId, count));
                  onResultsCommit(updateArraySlot(results, slot, 0, count));
                }}
              >
                <X size={12} />
              </button>
            )}
            {!hasStoredValue(slot) && <span className="encounter-action-clear-placeholder" aria-hidden="true" />}
          </div>
        ))}
      </div>
    </section>
  );
}

function EncounterResultNumberField({
  label,
  value,
  actions,
  onCommit,
  onDraftActiveChange
}: {
  label: string;
  value: number;
  actions: EncounterActionRow[];
  onCommit: (value: number) => void;
  onDraftActiveChange?: (active: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
    onDraftActiveChange?.(value !== 0);
  }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next) && next !== value) onCommit(next);
  };
  const status = value === 0 ? "missing" : encounterResultStatus(actions, value);
  const statusLabel = value === 0 ? "No result" : resultStatusLabel(status);
  return (
    <label className={`encounter-result-number-field is-${status}`} title={statusLabel}>
      <span>{label}</span>
      <input
        type="number"
        value={draft}
        onChange={(event) => {
          const nextDraft = event.currentTarget.value;
          setDraft(nextDraft);
          onDraftActiveChange?.(Number(nextDraft) !== 0);
        }}
        onBlur={commit}
      />
    </label>
  );
}

function SpellResponseField({ project, catalog, label, value, onCommit }: { project: Project; catalog?: LibraryCatalog | null; label: string; value: number; onCommit: (value: number) => void }) {
  const options = useMemo(() => spellReferenceOptions(project, catalog), [project, catalog]);
  const selected = options.find((option) => option.value === value);
  const visible = useMemo(() => {
    const next = options.slice(0, 260);
    if (selected && !next.some((option) => option.value === selected.value)) return [selected, ...next.slice(0, 219)];
    return next;
  }, [options, selected]);
  return (
    <label className="script-spell-response-field compact">
      <span>{label}</span>
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>No spell or scroll</option>
        {value !== 0 && !options.some((option) => option.value === value) && <option value={value}>Unknown spell/scroll {value}</option>}
        {visible.map((option) => (
          <option key={option.key} value={option.value}>{option.label}</option>
        ))}
      </select>
      <small>{selected ? selected.detail : value ? `Unknown spell/scroll ${value}` : "No spell or scroll selected."}</small>
    </label>
  );
}

type SpellResponseOption = {
  key: string;
  value: number;
  label: string;
  detail: string;
};

function spellReferenceOptions(project: Project, catalog?: LibraryCatalog | null): SpellResponseOption[] {
  const options = new Map<number, SpellResponseOption>();
  const add = (option: SpellResponseOption) => {
    if (option.value === 0) return;
    if (!options.has(option.value)) options.set(option.value, option);
  };
  [
    ["spell-class:1", 1, "Heat/Fire spell class (1)", "Matches spells whose runtime spell class is Heat."],
    ["spell-class:2", 2, "Cold spell class (2)", "Matches spells whose runtime spell class is Cold."],
    ["spell-class:3", 3, "Electrical spell class (3)", "Matches spells whose runtime spell class is Electrical."],
    ["spell-class:4", 4, "Chemical spell class (4)", "Matches spells whose runtime spell class is Chemical."],
    ["spell-class:5", 5, "Mental spell class (5)", "Matches spells whose runtime spell class is Mental."],
    ["spell-class:6", 6, "Magical spell class (6)", "Matches spells whose runtime spell class is Magical."]
  ].forEach(([key, value, label, detail]) => add({ key: String(key), value: Number(value), label: String(label), detail: String(detail) }));
  for (const spell of project.spellOverrides ?? []) {
    const name = spell.displayName?.trim() || `Custom Spell ${spell.id}`;
    add({
      key: `project-spell:${spell.id}`,
      value: spell.id,
      label: `${name} (${spell.id})`,
      detail: "Scenario custom spell override"
    });
  }
  for (const entry of catalog?.records ?? []) {
    if (entry.type !== "spell") continue;
    const id = typeof entry.summary.packedSpellId === "number" ? entry.summary.packedSpellId : null;
    if (id == null) continue;
    const displayName = typeof entry.summary.displayName === "string" ? entry.summary.displayName.trim() : "";
    add({
      key: entry.id,
      value: id,
      label: `${displayName || entry.label || "Spell"} (${id})`,
      detail: [
        typeof entry.summary.spellLevel === "number" ? `level ${entry.summary.spellLevel}` : "",
        typeof entry.summary.spellcasterClass === "number" ? `class ${entry.summary.spellcasterClass + 1}` : "",
        entry.source
      ].filter(Boolean).join(" | ")
    });
  }
  return [...options.values()].sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
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
    return ["Choice 1 Label", "Choice 2 Label", "Choice 3 Label", "Choice 4 Label"][slot] ?? `Text Buffer ${slot}`;
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
  const normalizedQuery = query.trim();
  const queryNumber = /^-?\d+$/.test(normalizedQuery) ? Number(normalizedQuery) : null;
  const matchedOptions = useMemo(() => {
    if (!normalizedQuery) return [];
    return filterItemTargetOptions(options, normalizedQuery).slice(0, 12);
  }, [normalizedQuery, options]);
  const rawQueryOption: ItemReferenceOption | null =
    queryNumber != null && !options.some((option) => option.value === queryNumber)
      ? {
        key: `raw-item:${queryNumber}`,
        value: queryNumber,
        label: queryNumber === 0 ? "Empty / none (0)" : `Item ${queryNumber} (${queryNumber})`,
        category: "unknown",
        detail: itemReferenceDetail(project, queryNumber, catalog),
        summary: itemReferenceDetail(project, queryNumber, catalog),
        sourceState: queryNumber === 0 ? "" : "Raw item ID",
        iconId: null
      }
      : null;
  const resultOptions = rawQueryOption ? [rawQueryOption, ...matchedOptions] : matchedOptions;
  const selectedLabel = selected ? itemOptionDisplayName(selected) : value === 0 ? "No item selected" : `Item ${value}`;
  const selectedDetail = selected ? [selected.detail, selected.sourceState].filter(Boolean).join(" | ") : itemReferenceDetail(project, value, catalog);
  const chooseItem = (option: ItemReferenceOption) => {
    onCommit(option.value);
    setQuery("");
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      return;
    }
    if (event.key !== "Enter") return;
    const firstOption = resultOptions[0];
    if (!firstOption) return;
    event.preventDefault();
    chooseItem(firstOption);
  };
  return (
    <div className={`script-item-id-field${compact ? " compact" : ""}`}>
      <span>{label}</span>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={handleSearchKeyDown}
        placeholder="Search item # or name..."
        aria-label={`Search ${label} items`}
      />
      {normalizedQuery ? (
        <div className="script-item-results" aria-live="polite">
          {resultOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              className={option.value === value ? "selected" : ""}
              title={[option.label, option.detail, option.sourceState].filter(Boolean).join(" | ")}
              onClick={() => chooseItem(option)}
            >
              <b>{itemCategoryBadge(option.category)}</b>
              <strong>{option.label}</strong>
              <small>{[option.detail, option.sourceState].filter(Boolean).join(" | ") || "No details available."}</small>
            </button>
          ))}
          {resultOptions.length === 0 && <small>No items match this search.</small>}
          {matchedOptions.length === 12 && <small>Keep typing to narrow more item matches.</small>}
        </div>
      ) : (
        <div className={`script-item-selected-row${value === 0 ? " missing" : ""}`}>
          <div>
            <strong>{selectedLabel}</strong>
            <small>{selectedDetail}</small>
          </div>
          {value !== 0 && (
            <button
              type="button"
              className="btn btn-danger btn-xs icon-only"
              title={`Clear ${label}`}
              aria-label={`Clear ${label}`}
              onClick={() => onCommit(0)}
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
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

function NumberField({
  label,
  value,
  onCommit,
  compact = false,
  disabled = false
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
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
        disabled={disabled}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => {
          const next = Number(draft);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
      />
    </label>
  );
}

function InlineNumberField({ ariaLabel, value, onCommit, title }: { ariaLabel: string; value: number; onCommit: (value: number) => void; title?: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);
  const commit = () => {
    const next = Number(draft);
    if (Number.isFinite(next) && next !== value) onCommit(next);
  };
  return (
    <input
      className="inline-number-field"
      type="number"
      aria-label={ariaLabel}
      title={title}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
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
