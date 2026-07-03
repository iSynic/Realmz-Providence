import { ChangeEvent, DragEvent, memo, MouseEvent, PointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadBrowserBundledLibraryResourceData } from "../browser/library";
import { inspectResourcePreview } from "../browser/resourcePreview";
import { Brush, Eraser, Eye, MousePointer2, X } from "lucide-react";
import { browserReferenceIconUrl } from "../browser/atlasPaths";
import { TutorialTip } from "../components/TutorialTip";
import { itemReferenceOptions } from "../itemReferences";
import { resolvePreviewUrl, useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";
import { CONDITION_LABELS, RESISTANCE_TYPES } from "../rulesCatalog";
import { spellAnimationFrameIds } from "../resourceIds";
import { findLibraryResourceAsset, isActorOrCreatureIconId } from "../resourceResolver";
import { scriptActionDefinitionFor, scriptActionSummary, scriptStepFlowRoutes } from "./scripts/scriptActionCatalog";
import { LibraryAsset, LibraryCatalog, BattleGridCellChange, BattleRecord, IconEntry, MonsterIconOverride, MonsterRecord, MonsterSetId, Project, ProjectCommand, SelectedEntity } from "../types";
import { BATTLE_RUNTIME_MONSTER_LIMIT, battleReferencesByMonster, countBattleRuntimeMonsterSlots, type BattleMonsterReference } from "../battleReferences";
import { encodeCicnResource, mirrorRgbaHorizontally } from "../cicnEncoder";
import {
  IconLibraryCanvas,
  IconLibraryFacingMode,
  createIconLibraryEntry,
  deleteIconLibraryEntry,
  iconLibraryMonsterPairMetadata,
  iconLibraryEntryKind,
  isProvidenceIconLibraryEntry,
  iconLibraryAssetResourceBase64
} from "../iconLibrary";
import {
  createMonsterLibraryEntry,
  deleteMonsterLibraryEntry,
  duplicateMonsterLibraryEntry,
  isProvidenceMonsterLibraryEntry,
  monsterLibraryEntryDescription,
  monsterLibraryOrigin,
  monsterLibraryEntryTemplate,
  updateMonsterLibraryEntry
} from "../monsterLibrary";
import { ScrollArea } from "../ui";
import { selectEntityFromId } from "../utils";

export type CombatWorkbenchTab = "battles" | "monsters" | "iconSet";

type BattleGridCellView = {
  index: number;
  displayIndex: number;
  displayCol: number;
  displayRow: number;
  value: number;
  monsterId: number;
  alternateSide: boolean;
};

type BattleGridPlacementView = BattleGridCellView & {
  monster: MonsterRecord | null;
  col: number;
  row: number;
  footprint: { width: number; height: number };
};

type BattleGridPaintPreview = {
  anchorIndex: number;
  col: number;
  row: number;
  footprint: { width: number; height: number };
};

type ResolvedBattleMonsterIcon = MonsterIconResolution & {
  resolvedUrl: string | null;
  cacheKey: string;
};

type BattleCanvasImage = HTMLImageElement | ImageBitmap;
type BattleCanvasImageEntry = {
  url: string | null;
  image: BattleCanvasImage | null;
};

type BattleBrushMode = "select" | "paint" | "erase";

type MonsterPlacementBrush = {
  mode: BattleBrushMode;
  source: "scenario" | null;
  key: string | null;
  monsterId: number | null;
  forceFriend: boolean;
};

type BattleBoardGesture =
  | { kind: "paint" | "erase"; pointerId: number; fromGrid: number[]; lastIndex: number | null; changed: boolean }
  | { kind: "move"; pointerId: number; fromGrid: number[]; fromIndex: number; lastIndex: number | null; changed: boolean };

export type MonsterIconSourceStatus = "scenario-override" | "scenario-resource" | "default-art" | "missing-art";

type MonsterIconResolution = {
  url: string | null;
  libraryAsset?: LibraryAsset | null;
  label: string;
  sourceStatus: MonsterIconSourceStatus;
  width: number | null;
  height: number | null;
};

type CombatIconAsset = {
  previewPath?: string | null;
  label?: string | null;
  resourceId?: number | null;
};

type MonsterIconPairOption = {
  key: string;
  baseId: number;
  asset: LibraryAsset | null;
  pairedAsset: LibraryAsset | null;
  resourceBase64?: string | null;
  pairedResourceBase64?: string | null;
  referenced?: boolean;
  sourceKind?: "monster-mash" | "providence-library";
  sourceLabel?: string;
  override?: MonsterIconOverride | null;
  facingMode?: IconLibraryFacingMode;
  canvas?: IconLibraryCanvas | null;
};

export type MonsterIconPickerOption = {
  key: string;
  baseId: number;
  asset: LibraryAsset | null;
  pairedAsset: LibraryAsset | null;
  sourceStatus: Exclude<MonsterIconSourceStatus, "missing-art">;
  sourceLabel: string;
};

type MonsterLibraryCopyEntry = {
  entry: LibraryCatalog["entities"][number];
  id: number;
  template: MonsterRecord;
  description?: string;
  setId?: MonsterSetId;
};

type PendingBattleReferenceRepair =
  | { kind: "clear"; monsterId: number; setId: MonsterSetId }
  | { kind: "switch"; fromId: number; toId: number; setId: MonsterSetId };

type ScenarioMonsterListEntry = {
  id: number;
  normal: MonsterRecord | null;
  monster: MonsterRecord | null;
  mega: MonsterRecord | null;
  active: MonsterRecord | null;
  fallback: MonsterRecord | null;
};

type CombatLookups = {
  monsters: MonsterRecord[];
  monsterById: Map<number, MonsterRecord>;
  monsterSetsById: Map<MonsterSetId, MonsterRecord[]>;
  monsterBySetAndId: Map<MonsterSetId, Map<number, MonsterRecord>>;
  iconAssetsByAbsId: Map<number, CombatIconAsset>;
  realmzActorIconAssetsByAbsId: Map<number, LibraryAsset>;
  monsterMashAssetsByAbsId: Map<number, LibraryAsset>;
  monsterIconOverridesByTarget: Map<number, MonsterIconOverride>;
  tabCounts: Record<CombatWorkbenchTab, number>;
};

const MONSTER_SET_OPTIONS: Array<{ id: MonsterSetId; label: string; file: string }> = [
  { id: 0, label: "Normal", file: "Data MD" },
  { id: 1, label: "Monster", file: "Data MD1" },
  { id: -1, label: "Mega", file: "Data MD-1" }
];
const MONSTER_ICON_CANVAS_PRESETS = [
  { key: "32x32", label: "32 x 32", width: 32, height: 32 },
  { key: "32x64", label: "32 x 64", width: 32, height: 64 },
  { key: "64x32", label: "64 x 32", width: 64, height: 32 },
  { key: "64x64", label: "64 x 64", width: 64, height: 64 }
] as const;
const IMPORTED_MONSTER_ICON_BASE_START = 601;
const MONSTER_VARIANT_SCALE: Record<Exclude<MonsterSetId, 0>, {
  hitDice: number;
  staminaBonus: number;
  agility: number;
  movementMax: number;
  armor: number;
  magicResistance: number;
  damageBonus: number;
  saves: number;
  spellPointsNumerator: number;
  spellPointsDenominator: number;
  expNumerator: number;
  expDenominator: number;
}> = {
  1: { hitDice: 6, staminaBonus: 6, agility: 1, movementMax: 2, armor: 10, magicResistance: 10, damageBonus: 2, saves: 10, spellPointsNumerator: 133, spellPointsDenominator: 100, expNumerator: 5, expDenominator: 4 },
  [-1]: { hitDice: 15, staminaBonus: 15, agility: 3, movementMax: 4, armor: 30, magicResistance: 25, damageBonus: 5, saves: 25, spellPointsNumerator: 2, spellPointsDenominator: 1, expNumerator: 25, expDenominator: 16 }
};

type BattleMonsterPaintEntry = { kind: "scenario"; key: string; id: number; monster: MonsterRecord };

type CombatPanelProps = {
  activeEditor?: string;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  previewContext?: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor: (editor: string) => void;
  onOpenTool?: (tab: "assets", editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
};

const TAB_LABELS: Record<CombatWorkbenchTab, string> = {
  battles: "Battles",
  monsters: "Monsters",
  iconSet: "Icon Set"
};

const TAB_HELP: Record<CombatWorkbenchTab, string> = {
  battles: "Author Data BD battle records: a 13 x 13 signed monster grid, distance, before/after strings, and battle macro target.",
  monsters: "Manage protected built-in templates, editable Providence library monsters, and scenario Data MD monster records.",
  iconSet: "Build scenario-local Monster Mash icon overrides without changing monster records."
};

const BATTLE_GRID_HELP = "Each grid cell stores a signed monster ID. Zero is empty, abs(value) points at a Data MD monster, and a negative value forces the friendly/alternate side after Realmz loads it. Large, tall, and wide monsters use their lower-right grid square as the anchor cell for placement; erase mode clears the top visible monster on the clicked tile.";
const MONSTER_PLACEMENT_HELP = "Choose a scenario monster or library template for the placement brush. Library templates are copied into Scenario Monsters before Providence writes the battle grid, because Data BD stores scenario monster IDs. Erase clears the top visible monster on the clicked tile; Force Friends writes the negative grid value Realmz uses for side flipping.";
const MONSTER_RECORDS_HELP = "Data MD records are 210-byte scenario monster templates. Realmz copies them into runtime combat state, so Providence edits the source template rather than generated bestiary cache data.";
const MONSTER_DEATH_ACTION_HELP = "Defeat Action is the monster death macro/door target. Realmz can run this when the monster dies, so treat it as linked behavior rather than a decorative number.";
const MONSTER_REQUIRED_WEAPON_HELP = "Realmz checks this monster record byte before allowing weapon hits: All is 0, Blunt only is -1, Sharp only is -2, and positive codes match the attacker's weapon number. Divinity fixture evidence shows the adjacent Req Weap value writes Data MD rel 7.";
const BATTLE_MACRO_HELP = "Battle Macro is an Extra Action Point reference that Realmz checks at the end of each combat round. Providence writes selected macros in the runnable form; positive imports are preserved but warned until edited.";
const SCRAPBOOK_HELP = "Monster Library combines protected built-in Realmz scrapbook templates with editable Providence entries. Copy entries into Scenario Monsters before using them in runtime battles.";
const MONSTER_ICON_PAIR_OFFSET = 308;
const MONSTER_ICON_SET_LIMIT = 127;
const MONSTER_MONEY_REWARDS = [
  { label: "Gold", iconId: 2002 },
  { label: "Gems", iconId: 2014 },
  { label: "Jewelry", iconId: 2012 }
];
const MONSTER_MONEY_LABELS = MONSTER_MONEY_REWARDS.map((reward) => reward.label);
const MONSTER_MONEY_HELP = "Monster reward caps. Realmz rolls 0..value for gold, gems, and jewelry when a reward-eligible monster is killed.";
const MONSTER_SUMMON_ELIGIBLE_HELP = "Divinity labels this as Can Be Summoned. Realmz random-summon paths require 1, ordinary monsters are 0, and -1 is the NPC/ally marker.";
const MONSTER_SUMMON_ELIGIBLE_OPTIONS: CombatSelectOption[] = [
  { key: "summon-eligible:yes", value: 1, label: "1 = Yes", detail: "Runtime-proven: random summon selection requires cansum == 1." },
  { key: "summon-eligible:npc", value: -1, label: "-1 = Is a NPC", detail: "Runtime-proven: Realmz uses -1 for special NPC/ally handling." }
];
const MONSTER_SAVE_LABELS = RESISTANCE_TYPES.slice(0, 6).map((label) => `${label} Save`);
const MONSTER_IMMUNITY_LABELS = RESISTANCE_TYPES.slice(0, 6).map((label) => `${label} Immune`);
const MONSTER_ATTACK_FORM_OPTIONS: CombatSelectOption[] = [
  { key: "attack-form:32", value: 32, label: "Pummel" },
  { key: "attack-form:33", value: 33, label: "Claw" },
  { key: "attack-form:34", value: 34, label: "Bite" },
  { key: "attack-form:35", value: 35, label: "Not Used" },
  { key: "attack-form:36", value: 36, label: "Not Used" },
  { key: "attack-form:37", value: 37, label: "Not Used" },
  { key: "attack-form:38", value: 38, label: "Punch / Kick" },
  { key: "attack-form:39", value: 39, label: "Club" },
  { key: "attack-form:40", value: 40, label: "Slime" },
  { key: "attack-form:41", value: 41, label: "Sting" }
];
const MONSTER_ATTACK_SPECIAL_OPTIONS: CombatSelectOption[] = [
  { key: "attack-special:0", value: 0, label: "No Special Attacks" },
  { key: "attack-special:1", value: 1, label: "Cause Fear" },
  { key: "attack-special:2", value: 2, label: "Paralyze" },
  { key: "attack-special:3", value: 3, label: "Curse" },
  { key: "attack-special:4", value: 4, label: "Stupify" },
  { key: "attack-special:5", value: 5, label: "Entangle" },
  { key: "attack-special:6", value: 6, label: "Poison" },
  { key: "attack-special:7", value: 7, label: "Confuse" },
  { key: "attack-special:8", value: 8, label: "Drain Spell Points" },
  { key: "attack-special:9", value: 9, label: "Drain Experience" },
  { key: "attack-special:10", value: 10, label: "Charm" },
  { key: "attack-special:11", value: 11, label: "Fire Damage" },
  { key: "attack-special:12", value: 12, label: "Cold Damage" },
  { key: "attack-special:13", value: 13, label: "Electric Damage" },
  { key: "attack-special:14", value: 14, label: "Chemical Damage" },
  { key: "attack-special:15", value: 15, label: "Mental Damage" },
  { key: "attack-special:16", value: 16, label: "Cause Disease" },
  { key: "attack-special:17", value: 17, label: "Cause Age" },
  { key: "attack-special:18", value: 18, label: "Cause Blindness" },
  { key: "attack-special:19", value: 19, label: "Turn to Stone" }
];
const MONSTER_LIBRARY_DRAG_MIME = "application/x-realmz-monster-library-id";
const SCENARIO_MONSTER_DRAG_MIME = "application/x-realmz-scenario-monster-id";
const MONSTER_RECORD_BYTES = 210;
const BATTLE_GRID_SIZE = 13;
const BATTLE_GRID_CELL_COUNT = BATTLE_GRID_SIZE * BATTLE_GRID_SIZE;
const BATTLE_SUMMON_SPACE_WARNING_LIMIT = 75;
const MAX_DIVINITY_BATTLE_MONSTER_ID = 217;
const MONSTER_GRID_ART_SIZE = 32;
const MONSTER_PALETTE_TILE_SPAN = 2;
const MONSTER_PALETTE_TILE_SIZE = MONSTER_GRID_ART_SIZE * MONSTER_PALETTE_TILE_SPAN;
const MONSTER_BRUSH_TILE_SIZE = 72;
const MONSTER_BRUSH_TILE_GAP = 8;
const MONSTER_BRUSH_TILE_STRIDE = MONSTER_BRUSH_TILE_SIZE + MONSTER_BRUSH_TILE_GAP;
const MONSTER_BRUSH_WINDOW_OVERSCAN_ROWS = 2;
const RANDOM_WEAPON_OPTIONS: CombatSelectOption[] = [
  { key: "random-weapon:-1", value: -1, label: "-1 Random swords" },
  { key: "random-weapon:-2", value: -2, label: "-2 Random clubs" },
  { key: "random-weapon:-3", value: -3, label: "-3 Random clubs / spears" },
  { key: "random-weapon:-4", value: -4, label: "-4 Random axes" },
  { key: "random-weapon:-5", value: -5, label: "-5 Random small swords / small axes" },
  { key: "random-weapon:-6", value: -6, label: "-6 Random clubs / flails / spears" },
  { key: "random-weapon:-7", value: -7, label: "-7 Random spears / pole weapons" },
  { key: "random-weapon:-8", value: -8, label: "-8 Random axes / spears" },
  { key: "random-weapon:-9", value: -9, label: "-9 Random swords / dagger / cutlass / nunchucka" }
];
const REQUIRED_WEAPON_MAX_SPECIFIC_CODE = 253;

type CombatPerfWindow = Window & {
  __providenceCombatPerf?: Array<{ label: string; durationMs: number; at: number }>;
};

function combatBenchmarkEnabled() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("benchmarkCombat");
}

function recordCombatPerf(label: string, durationMs: number) {
  if (!combatBenchmarkEnabled()) return;
  const target = window as CombatPerfWindow;
  const entry = { label, durationMs, at: performance.now() };
  target.__providenceCombatPerf = [...(target.__providenceCombatPerf ?? []), entry].slice(-500);
  if (durationMs >= 4) console.debug(`[combat-perf] ${label}: ${durationMs.toFixed(1)}ms`);
}

function measureCombatWork<T>(label: string, work: () => T): T {
  if (!combatBenchmarkEnabled()) return work();
  const startedAt = performance.now();
  try {
    return work();
  } finally {
    const durationMs = performance.now() - startedAt;
    recordCombatPerf(label, durationMs);
    performance.measure?.(`combat:${label}`, {
      start: startedAt,
      end: startedAt + durationMs
    });
  }
}

function useCombatRenderTiming(label: string) {
  const startedAtRef = useRef(0);
  if (combatBenchmarkEnabled()) startedAtRef.current = performance.now();
  useEffect(() => {
    if (!startedAtRef.current) return;
    recordCombatPerf(`${label} render`, performance.now() - startedAtRef.current);
  });
}

export function CombatPanel({
  activeEditor = "domain",
  project,
  catalog,
  selectedEntity,
  iconEntries,
  previewContext = {},
  onSelectEntity,
  onSelectEditor,
  onApplyCommand,
  onUpdateLibraryCatalog
}: CombatPanelProps) {
  useCombatRenderTiming("CombatPanel");
  const [tab, setTab] = useState<CombatWorkbenchTab>(() => tabFromEditor(activeEditor));
  useEffect(() => setTab(tabFromEditor(activeEditor)), [activeEditor]);
  const selectTab = (next: CombatWorkbenchTab) => {
    setTab(next);
    onSelectEditor(next);
  };
  const lookups = useCombatLookups(project, catalog);

  if (!project) {
    return (
      <section className="combat-workbench">
        <header className="combat-hero">
          <div>
            <h1>Combat</h1>
            <p>Open or create a scenario before editing battles and monsters.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="combat-workbench">
      <header className="combat-hero">
        <div>
          <h1>
            <TutorialTip
              title="Combat Workbench"
              body="Use Combat for scenario battles, scenario monsters, protected built-in Monster Scrapbook templates, and editable Providence monster-library variants."
              side="right"
            >
              <span>Combat</span>
            </TutorialTip>
          </h1>
          <p>Author battles, scenario monsters, and reusable Providence monster-library templates.</p>
        </div>
        <small>{project.scenario.name}</small>
      </header>
      <div className="combat-tabs" role="tablist" aria-label="Combat workbench sections">
        {(Object.keys(TAB_LABELS) as CombatWorkbenchTab[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={tab === candidate}
            className={tab === candidate ? "active" : ""}
            onClick={() => selectTab(candidate)}
            title={TAB_HELP[candidate]}
          >
            <span>{TAB_LABELS[candidate]}</span>
            <b>{lookups.tabCounts[candidate].toLocaleString()}</b>
          </button>
        ))}
      </div>

      {tab === "battles" && (
        <BattleWorkbench
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {tab === "monsters" && (
        <MonsterWorkbench
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelectEntity={onSelectEntity}
          onSelectIconSetTab={() => selectTab("iconSet")}
          onApplyCommand={onApplyCommand}
          onUpdateLibraryCatalog={onUpdateLibraryCatalog}
        />
      )}
      {tab === "iconSet" && (
        <MonsterIconSetWorkbench
          project={project}
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onApplyCommand={onApplyCommand}
          onUpdateLibraryCatalog={onUpdateLibraryCatalog}
        />
      )}
    </section>
  );
}

function BattleWorkbench({
  project,
  catalog,
  selectedEntity,
  iconEntries,
  lookups,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const battles = useMemo(() => [...(project.battles ?? [])].sort((a, b) => a.id - b.id), [project.battles]);
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "battle:");
  const selectedId = selectedFromEntity ?? battles[0]?.id ?? 0;
  const selected = battles.find((battle) => battle.id === selectedId) ?? battles[0] ?? null;
  const nextBattleId = nextAvailableId(battles);
  const selectBattle = (id: number) => onSelectEntity(selectEntityFromId(`battle:${id}`));
  const createBattle = () => {
    onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle", recordType: "battle", id: nextBattleId });
    selectBattle(nextBattleId);
  };
  const update = (id: number, changes: Partial<Pick<BattleRecord, "grid" | "dist" | "messageBefore" | "messageAfter" | "battleMacro">>) =>
    onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle", id, changes });

  return (
    <div className="combat-record-layout battle-layout">
      {selected ? (
        <BattleEditor
          project={project}
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          battle={selected}
          battles={battles}
          onUpdate={(changes) => update(selected.id, changes)}
          onSelectBattle={selectBattle}
          nextBattleId={nextBattleId}
          onNew={createBattle}
          onDuplicate={() => {
            const id = nextBattleId;
            update(id, {
              grid: [...selected.grid],
              dist: selected.dist,
              messageBefore: selected.messageBefore,
              messageAfter: selected.messageAfter,
              battleMacro: selected.battleMacro
            });
            selectBattle(id);
          }}
          onClear={() => update(selected.id, { grid: new Array(169).fill(0), dist: 0, messageBefore: 0, messageAfter: 0, battleMacro: 0 })}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      ) : (
        <article className="combat-editor battle-editor empty">
          <h2>No battle records</h2>
          <button type="button" className="btn btn-primary btn-sm battle-empty-action" onClick={createBattle}>New Battle {nextBattleId}</button>
          <p>Create a battle record to begin placing monsters.</p>
        </article>
      )}
    </div>
  );
}

function BattleEditor({
  project,
  catalog,
  battle,
  battles,
  iconEntries,
  lookups,
  previewContext,
  onUpdate,
  onSelectBattle,
  nextBattleId,
  onNew,
  onDuplicate,
  onClear,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  battle: BattleRecord;
  battles: BattleRecord[];
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onUpdate: (changes: Partial<Pick<BattleRecord, "grid" | "dist" | "messageBefore" | "messageAfter" | "battleMacro">>) => void;
  onSelectBattle: (id: number) => void;
  nextBattleId: number;
  onNew: () => void;
  onDuplicate: () => void;
  onClear: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [scenarioMonsterSet, setScenarioMonsterSet] = useState<MonsterSetId>(0);
  return (
    <article className="combat-editor battle-editor">
      <header className="combat-editor-header">
        <div className="combat-editor-title">
          <PagedNumberControl
            className="combat-record-pager"
            label="Battle"
            value={battle.id}
            options={battles.map((candidate) => candidate.id)}
            allowArbitrary={false}
            help="Use the arrows to page through existing Data BD battle records, or type an existing battle number."
            onCommit={onSelectBattle}
          />
        </div>
        <div className="battle-header-fields">
          <BattleDistanceField value={battle.dist} onCommit={(dist) => onUpdate({ dist })} />
          <BattleStringField
            project={project}
            label="Before String"
            value={battle.messageBefore}
            help="Data BD before-string ID. Realmz displays this Data SD2 string before combat starts when the value is nonzero."
            onCommit={(messageBefore) => onUpdate({ messageBefore })}
            onSelectEntity={onSelectEntity}
            onCreate={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create before battle string", recordType: "message", id })}
            onUpdateString={(id, text) => onApplyCommand?.({ kind: "updateMessageRecord", label: `Update before battle string ${id}`, id, changes: { text } })}
          />
          <BattleStringField
            project={project}
            label="After String"
            value={battle.messageAfter}
            help="Data BD after-string ID. Realmz copies this Data SD2 string for post-battle display when the value is nonzero."
            onCommit={(messageAfter) => onUpdate({ messageAfter })}
            onSelectEntity={onSelectEntity}
            onCreate={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create after battle string", recordType: "message", id })}
            onUpdateString={(id, text) => onApplyCommand?.({ kind: "updateMessageRecord", label: `Update after battle string ${id}`, id, changes: { text } })}
          />
          <BattleMacroField
            project={project}
            catalog={catalog}
            value={battle.battleMacro}
            onCommit={(battleMacro) => onUpdate({ battleMacro })}
            onSelectEntity={onSelectEntity}
          />
        </div>
        <div className="battle-header-actions">
          <span>
            <TutorialTip title="Record Tools" body="Create, duplicate, or clear the current Data BD battle record." side="right">
              <span>RECORD TOOLS</span>
            </TutorialTip>
          </span>
          <div className="combat-editor-actions">
            <button type="button" className="btn btn-primary btn-xs" onClick={onNew}>New Battle {nextBattleId}</button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicate}>Duplicate</button>
            <button type="button" className="btn btn-danger btn-xs" onClick={onClear}>Clear Battle</button>
          </div>
        </div>
      </header>
      <BattleBoard
        project={project}
        catalog={catalog}
        iconEntries={iconEntries}
        lookups={lookups}
        previewContext={previewContext}
        monsterSetPreview={scenarioMonsterSet}
        onMonsterSetPreviewChange={setScenarioMonsterSet}
        battle={battle}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
        onUpdateGrid={(grid) => onUpdate({ grid })}
      />
    </article>
  );
}

function BattleScenarioMonsterSetField({ value, onCommit, compact = false }: { value: MonsterSetId; onCommit: (value: MonsterSetId) => void; compact?: boolean }) {
  return (
    <div className={`combat-field battle-scenario-monster-set${compact ? " compact" : ""}`}>
      <FieldLabel label="Monster Set" help="Chooses which scenario monster table the Battles tool uses for placement and validation. It applies across the Battles tab; Data BD stores monster IDs only, so this does not write a value into the selected battle record." />
      <select value={String(value)} onChange={(event) => onCommit(Number(event.currentTarget.value) as MonsterSetId)} aria-label="Scenario monster set">
        {MONSTER_SET_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>{option.label} ({option.file})</option>
        ))}
      </select>
    </div>
  );
}

function MonsterIconSetWorkbench({
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  onApplyCommand,
  onUpdateLibraryCatalog
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
}) {
  const targets = useMemo(() => monsterIconTargetPairs(project, lookups, iconEntries), [iconEntries, lookups, project]);
  const sources = useMemo(() => monsterIconSourcePairs(catalog, lookups), [catalog, lookups]);
  const [targetQuery, setTargetQuery] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedTargetId, setSelectedTargetId] = useState(() => targets[0]?.baseId ?? 0);
  const [selectedSourceKey, setSelectedSourceKey] = useState(() => sources[0]?.key ?? "");
  const [activeIconSetPane, setActiveIconSetPane] = useState<"target" | "source">("source");
  const [status, setStatus] = useState("");
  const [iconImportOpen, setIconImportOpen] = useState(false);
  const [iconImportCanvasKey, setIconImportCanvasKey] = useState<(typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"]>("32x32");
  const [iconImportAdvanced, setIconImportAdvanced] = useState(false);
  const [iconImportBaseFile, setIconImportBaseFile] = useState<File | null>(null);
  const [iconImportPairedFile, setIconImportPairedFile] = useState<File | null>(null);
  const baseImportInputRef = useRef<HTMLInputElement | null>(null);
  const pairedImportInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (selectedTargetId <= 0 && targets[0]) setSelectedTargetId(targets[0].baseId);
  }, [selectedTargetId, targets]);
  useEffect(() => {
    if (!sources.some((source) => source.key === selectedSourceKey)) setSelectedSourceKey(sources[0]?.key ?? "");
  }, [selectedSourceKey, sources]);
  const filteredTargets = useMemo(
    () => filterRecords(targets, targetQuery, (target) => `${target.baseId} ${target.asset?.label ?? ""} ${target.override?.sourceLabel ?? ""} ${monsterIconSourceStatusLabel(monsterIconTargetSourceStatus(target))}`),
    [targetQuery, targets]
  );
  const filteredSources = useMemo(
    () => filterRecords(sources, sourceQuery, (source) => `${source.baseId} ${source.sourceLabel ?? ""} ${source.asset?.label ?? ""}`),
    [sourceQuery, sources]
  );
  const selectedTarget = targets.find((target) => target.baseId === selectedTargetId) ?? null;
  const selectedSource = sources.find((source) => source.key === selectedSourceKey) ?? sources[0] ?? null;
  const selectedTargetBaseId = selectedTarget?.baseId ?? selectedTargetId;
  const selectedTargetOverrideSource = selectedTarget?.override
    ? sources.find((source) => source.baseId === selectedTarget.override?.sourceBaseIconId && source.sourceKind === selectedTarget.override?.sourceKind)
      ?? sources.find((source) => source.baseId === selectedTarget.override?.sourceBaseIconId)
      ?? null
    : null;
  const selectSourceByBaseId = (sourceBaseIconId: number) => {
    setSelectedSourceKey(sources.find((source) => source.baseId === sourceBaseIconId)?.key ?? sources[0]?.key ?? "");
    setActiveIconSetPane("source");
  };
  const selectTargetByBaseId = (targetBaseIconId: number) => {
    setSelectedTargetId(Math.max(0, Math.trunc(Math.abs(targetBaseIconId))));
    setActiveIconSetPane("target");
  };
  const applyOverride = async (targetBaseIconId = selectedTargetBaseId, sourceKey = selectedSource?.key ?? "") => {
    const source = sources.find((candidate) => candidate.key === sourceKey);
    const sourceBaseIconId = source?.baseId ?? 0;
    if (!source?.asset || !source.pairedAsset || !targetBaseIconId) {
      setStatus("Choose a target icon and a complete source icon pair before applying an override.");
      return;
    }
    try {
      const [sourceBaseResourceBase64, sourcePairedResourceBase64] = await Promise.all([
        loadLibraryResourceBase64(source.asset, previewContext, catalog),
        loadLibraryResourceBase64(source.pairedAsset, previewContext, catalog)
      ]);
      if (!sourceBaseResourceBase64 || !sourcePairedResourceBase64) {
        setStatus(`${source.sourceLabel ?? `Source ${sourceBaseIconId}`} is missing one facing resource.`);
        return;
      }
      onApplyCommand?.({
        kind: "upsertMonsterIconOverride",
        label: `Override monster icon ${targetBaseIconId} from ${source.sourceLabel ?? `Source ${sourceBaseIconId}`}`,
        override: {
          targetBaseIconId,
          sourceBaseIconId,
          sourceKind: source.sourceKind ?? "monster-mash",
          sourceLabel: source.asset.label || source.sourceLabel,
          sourceBaseResourceBase64,
          sourcePairedResourceBase64
        }
      });
      setSelectedTargetId(targetBaseIconId);
      setSelectedSourceKey(source.key);
      setStatus(`Monster icon ${targetBaseIconId} will export from ${source.sourceLabel ?? `Source ${sourceBaseIconId}`}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load source icon resource data.");
    }
  };
  const deleteTargetOverride = (targetBaseIconId = selectedTargetBaseId) => {
    if (!targetBaseIconId || !selectedTarget?.override) return;
    onApplyCommand?.({ kind: "deleteMonsterIconOverride", label: `Delete monster icon override ${targetBaseIconId}`, targetBaseIconId });
    setStatus(`Deleted override for monster icon ${targetBaseIconId}; default art will be used when available.`);
  };
  const allowTargetDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("application/x-realmz-monster-icon-source")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const copyTargetToIconLibrary = async () => {
    if (!selectedTarget || !onUpdateLibraryCatalog) return;
    try {
      const [base64, pairedBase64] = selectedTarget.override
        ? [selectedTarget.override.sourceBaseResourceBase64, selectedTarget.override.sourcePairedResourceBase64]
        : selectedTarget.resourceBase64 && selectedTarget.pairedResourceBase64
          ? [selectedTarget.resourceBase64, selectedTarget.pairedResourceBase64]
        : selectedTarget.asset && selectedTarget.pairedAsset
          ? await Promise.all([
              loadLibraryResourceBase64(selectedTarget.asset, previewContext, catalog),
              loadLibraryResourceBase64(selectedTarget.pairedAsset, previewContext, catalog)
            ])
          : [null, null];
      if (!base64 || !pairedBase64) {
        setStatus(`Scenario icon ${selectedTarget.baseId} is missing one facing resource.`);
        return;
      }
      const label = selectedTarget.override
        ? `Scenario Icon ${selectedTarget.baseId} Override`
        : selectedTarget.sourceLabel || selectedTarget.asset?.label || `Scenario Icon ${selectedTarget.baseId}`;
      const baseMetadataAsset = selectedTarget.override ? selectedTargetOverrideSource?.asset ?? null : selectedTarget.asset;
      const pairedMetadataAsset = selectedTarget.override ? selectedTargetOverrideSource?.pairedAsset ?? null : selectedTarget.pairedAsset;
      const targetMetadata = selectedTargetOverrideSource
        ? { facingMode: selectedTargetOverrideSource.facingMode, canvas: selectedTargetOverrideSource.canvas }
        : { facingMode: "custom" as IconLibraryFacingMode, canvas: null };
      const { catalog: nextCatalog, entity } = createIconLibraryEntry(catalog, catalog?.managedPath ?? "browser://workspace/library", {
        kind: "monster-pair",
        label,
        origin: {
          kind: "external-resource",
          sourceId: `scenario-monster-icon:${selectedTarget.baseId}`,
          sourceLabel: label
        },
        ...targetMetadata,
        resources: [
          {
            role: "base",
            resourceType: "cicn",
            resourceId: selectedTarget.baseId,
            label: baseMetadataAsset?.label || `${label} left`,
            resourceBase64: base64,
            previewPath: previewPathFromCicnBase64(base64, baseMetadataAsset?.previewPath ?? null),
            bytes: baseMetadataAsset?.bytes,
            sha256: baseMetadataAsset?.sha256
          },
          {
            role: "paired",
            resourceType: "cicn",
            resourceId: selectedTarget.baseId + MONSTER_ICON_PAIR_OFFSET,
            label: pairedMetadataAsset?.label || `${label} right`,
            resourceBase64: pairedBase64,
            previewPath: previewPathFromCicnBase64(pairedBase64, pairedMetadataAsset?.previewPath ?? null),
            bytes: pairedMetadataAsset?.bytes,
            sha256: pairedMetadataAsset?.sha256
          }
        ]
      });
      onUpdateLibraryCatalog(nextCatalog, entity ? `Added ${entity.label} to Icon Library` : "Updated Icon Library");
      setStatus(entity ? `Added ${entity.label} to the Providence Icon Library.` : "Updated the Providence Icon Library.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to copy scenario icons into the Providence Icon Library.");
    }
  };
  const deleteSelectedIconVariant = () => {
    if (!catalog || !selectedSource || selectedSource.sourceKind !== "providence-library" || !onUpdateLibraryCatalog) return;
    const nextCatalog = deleteIconLibraryEntry(catalog, selectedSource.key);
    const nextSourceKey = sources.find((source) => source.key !== selectedSource.key)?.key ?? "";
    onUpdateLibraryCatalog(nextCatalog, `Deleted ${selectedSource.sourceLabel ?? "Icon Variant"}`);
    setSelectedSourceKey(nextSourceKey);
    setActiveIconSetPane("source");
    setStatus(`Deleted ${selectedSource.sourceLabel ?? "Icon Variant"} from the Providence Icon Library.`);
  };
  const createImportedIconSet = async () => {
    if (!onUpdateLibraryCatalog) return;
    if (!iconImportBaseFile) {
      setStatus("Choose a source image before importing a monster icon set.");
      return;
    }
    try {
      const canvas = monsterIconCanvasPreset(iconImportCanvasKey);
      const baseImage = await loadImageFileToRgba(iconImportBaseFile, canvas.width, canvas.height);
      const pairedImage = iconImportAdvanced && iconImportPairedFile
        ? await loadImageFileToRgba(iconImportPairedFile, canvas.width, canvas.height)
        : { width: canvas.width, height: canvas.height, rgba: mirrorRgbaHorizontally(baseImage) };
      const baseBytes = encodeCicnResource(baseImage);
      const pairedBytes = encodeCicnResource(pairedImage);
      const baseId = nextImportedMonsterIconBaseId(sources);
      const label = `${stripFileExtension(iconImportBaseFile.name) || "Imported Monster"} Icon Set`;
      const facingMode: IconLibraryFacingMode = iconImportAdvanced && iconImportPairedFile ? "custom" : "mirrored";
      const { catalog: nextCatalog, entity } = createIconLibraryEntry(catalog, catalog?.managedPath ?? "browser://workspace/library", {
        kind: "monster-pair",
        label,
        origin: { kind: "external-resource", sourceLabel: iconImportBaseFile.name },
        facingMode,
        canvas,
        resources: [
          {
            role: "base",
            resourceType: "cicn",
            resourceId: baseId,
            label: `${label} base`,
            resourceBase64: bytesToBase64(baseBytes),
            previewPath: rgbaToDataUrl(baseImage),
            bytes: baseBytes.length,
            width: canvas.width,
            height: canvas.height
          },
          {
            role: "paired",
            resourceType: "cicn",
            resourceId: baseId + MONSTER_ICON_PAIR_OFFSET,
            label: `${label} paired`,
            resourceBase64: bytesToBase64(pairedBytes),
            previewPath: rgbaToDataUrl(pairedImage),
            bytes: pairedBytes.length,
            width: canvas.width,
            height: canvas.height
          }
        ]
      });
      onUpdateLibraryCatalog(nextCatalog, entity ? `Imported ${entity.label}` : "Updated Icon Library");
      if (entity) {
        setSelectedSourceKey(entity.id);
        setActiveIconSetPane("source");
      }
      setIconImportBaseFile(null);
      setIconImportPairedFile(null);
      if (baseImportInputRef.current) baseImportInputRef.current.value = "";
      if (pairedImportInputRef.current) pairedImportInputRef.current.value = "";
      setStatus(entity ? `Imported ${entity.label} as ${facingMode === "mirrored" ? "mirrored" : "custom"} facing art.` : "Updated the Providence Icon Library.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to import monster icon set.");
    }
  };
  const hasSelectedSourcePair = Boolean(selectedSource?.asset && selectedSource.pairedAsset);
  const hasSelectedTargetPair = Boolean(
    selectedTarget?.override ||
    (selectedTarget?.resourceBase64 && selectedTarget.pairedResourceBase64) ||
    (selectedTarget?.asset && selectedTarget.pairedAsset)
  );
  const addSourceToScenarioIcons = () => {
    const targetBaseId = nextScenarioMonsterIconTargetBaseId(selectedSource?.baseId ?? 0, targets);
    setActiveIconSetPane("target");
    void applyOverride(targetBaseId, selectedSource?.key ?? "");
  };
  const replaceSelectedTargetArt = () => {
    if (!selectedTargetBaseId) return;
    setActiveIconSetPane("target");
    void applyOverride(selectedTargetBaseId, selectedSource?.key ?? "");
  };
  return (
    <article className="combat-editor icon-set-workbench">
      <header className="combat-editor-header icon-set-header">
        <div>
          <h2>Build Icon Set</h2>
          <p>Copy paired Monster Mash or Providence Icon Library cicn resources into the scenario as overrides or supplements for standard monster icon IDs.</p>
        </div>
        <span
          className={(project.monsterIconOverrides ?? []).length >= MONSTER_ICON_SET_LIMIT ? "icon-set-limit warning" : "icon-set-limit"}
          title="The Divinity manual describes Realmz as capable of holding around 127 monster icon sets per scenario. Modern Realmz source resolves cicn resources dynamically, so Providence treats this as a compatibility warning rather than a hard runtime cap."
        >
          {(project.monsterIconOverrides ?? []).length} / ~{MONSTER_ICON_SET_LIMIT} overrides
        </span>
      </header>
      <section className="icon-set-controls">
        <NumberField label="Target Icon" value={selectedTargetBaseId} onCommit={selectTargetByBaseId} />
        <NumberField label="Source Icon" value={selectedSource?.baseId ?? 0} onCommit={selectSourceByBaseId} />
        <div className="icon-set-action-group">
          <button
            type="button"
            className="btn btn-primary btn-sm icon-set-context-action"
            disabled={!hasSelectedSourcePair}
            onClick={addSourceToScenarioIcons}
            title="Copy the selected library/source icon pair into the next available scenario override target."
          >
            Copy To Scenario Icons
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm icon-set-context-action"
            disabled={!hasSelectedSourcePair || !selectedTargetBaseId}
            onClick={replaceSelectedTargetArt}
            title="Replace the selected target icon art with the selected library/source icon pair."
          >
            Replace Target Art
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm icon-set-context-action"
            disabled={!hasSelectedTargetPair || !onUpdateLibraryCatalog}
            onClick={() => void copyTargetToIconLibrary()}
          >
            Copy To Icon Library
          </button>
          <button type="button" className="btn btn-danger btn-sm" disabled={!selectedTarget?.override} onClick={() => deleteTargetOverride()}>
            Delete Override
          </button>
          {selectedSource?.sourceKind === "providence-library" ? (
            <button type="button" className="btn btn-danger btn-sm" disabled={!catalog || !onUpdateLibraryCatalog} onClick={deleteSelectedIconVariant}>
              Delete Icon Variant
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm icon-set-import-toggle"
          disabled={!onUpdateLibraryCatalog}
          onClick={() => setIconImportOpen((open) => !open)}
        >
          Import Image Set
        </button>
        {status ? <small>{status}</small> : null}
      </section>
      {iconImportOpen ? (
        <section className="icon-set-import-panel">
          <header>
            <strong>Import Monster Icon Set</strong>
            <small>One image creates a mirrored pair; advanced import can supply separate facing art.</small>
          </header>
          <label>
            <span>Canvas</span>
            <select value={iconImportCanvasKey} onChange={(event) => setIconImportCanvasKey(event.currentTarget.value as (typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"])}>
              {MONSTER_ICON_CANVAS_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>{preset.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Source Image</span>
            <span className="icon-set-file-control">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => baseImportInputRef.current?.click()}>
                Choose Image
              </button>
              <small>{iconImportBaseFile?.name ?? "No file selected."}</small>
              <input
                ref={baseImportInputRef}
                className="icon-set-file-input"
                type="file"
                accept="image/png,image/gif,image/jpeg,image/webp"
                aria-label="Source image"
                onChange={(event: ChangeEvent<HTMLInputElement>) => setIconImportBaseFile(event.currentTarget.files?.[0] ?? null)}
              />
            </span>
          </label>
          <label className="checkbox-row">
            <span>Custom paired image</span>
            <input type="checkbox" checked={iconImportAdvanced} onChange={(event) => setIconImportAdvanced(event.currentTarget.checked)} />
          </label>
          {iconImportAdvanced ? (
            <label>
              <span>Paired Image</span>
              <span className="icon-set-file-control">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => pairedImportInputRef.current?.click()}>
                  Choose Paired Image
                </button>
                <small>{iconImportPairedFile?.name ?? "No file selected."}</small>
                <input
                  ref={pairedImportInputRef}
                  className="icon-set-file-input"
                  type="file"
                  accept="image/png,image/gif,image/jpeg,image/webp"
                  aria-label="Paired image"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setIconImportPairedFile(event.currentTarget.files?.[0] ?? null)}
                />
              </span>
            </label>
          ) : null}
          <button type="button" className="btn btn-primary btn-sm" disabled={!onUpdateLibraryCatalog || !iconImportBaseFile} onClick={() => void createImportedIconSet()}>
            Create Library Icon Set
          </button>
        </section>
      ) : null}
      <div className="icon-set-layout">
        <section className="icon-set-pane">
          <header>
            <strong className="combat-pane-title">Library Monster Icon Sets</strong>
            <small>{sources.length} source pairs</small>
          </header>
          <input value={sourceQuery} onChange={(event) => setSourceQuery(event.currentTarget.value)} placeholder="Search library monster icon sets..." />
          <div className="icon-set-scroll">
            {filteredSources.map((source) => (
              <button
                key={source.key}
                type="button"
                draggable
                className={`icon-set-row${activeIconSetPane === "source" && selectedSourceKey === source.key ? " selected" : ""}`}
                onClick={() => {
                  setSelectedSourceKey(source.key);
                  setActiveIconSetPane("source");
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "copy";
                  event.dataTransfer.setData("application/x-realmz-monster-icon-source", source.key);
                  event.dataTransfer.setData("text/plain", source.sourceLabel ?? `Source ${source.baseId}`);
                }}
              >
                <IconPairPreview baseAsset={source.asset} pairedAsset={source.pairedAsset} previewContext={previewContext} />
                <span>
                  <strong>{source.sourceLabel ?? `Source ${source.baseId}`}</strong>
                  <small>{source.sourceKind === "providence-library" ? "Providence Icon Library" : "Monster Mash"} | pair {source.baseId + MONSTER_ICON_PAIR_OFFSET}</small>
                </span>
              </button>
            ))}
            {filteredSources.length === 0 ? <p className="empty-copy compact">No library monster icon sets match that search.</p> : null}
          </div>
        </section>
        <section className="icon-set-pane">
          <header>
            <strong className="combat-pane-title">Monster Icon Targets</strong>
            <small>{targets.length} target pairs</small>
          </header>
          <input value={targetQuery} onChange={(event) => setTargetQuery(event.currentTarget.value)} placeholder="Search monster icon targets..." />
          <div className="icon-set-scroll">
            {filteredTargets.map((target) => {
              const previewBaseAsset = target.asset;
              const previewPairedAsset = target.pairedAsset;
              const sourceStatus = monsterIconTargetSourceStatus(target);
              const statusLabel = monsterIconSourceStatusLabel(sourceStatus);
              return (
                <button
                  key={target.baseId}
                  type="button"
                  className={`icon-set-row${activeIconSetPane === "target" && selectedTargetId === target.baseId ? " selected" : ""}${target.override ? " overridden" : ""}`}
                  onClick={() => {
                    setSelectedTargetId(target.baseId);
                    setActiveIconSetPane("target");
                  }}
                  onDragOver={allowTargetDrop}
                  onDragEnter={allowTargetDrop}
                  onDrop={(event) => {
                    const sourceKey = event.dataTransfer.getData("application/x-realmz-monster-icon-source");
                    if (!sourceKey) return;
                    event.preventDefault();
                    setActiveIconSetPane("target");
                    void applyOverride(target.baseId, sourceKey);
                  }}
                >
                  <IconPairPreview baseAsset={previewBaseAsset} pairedAsset={previewPairedAsset} previewContext={previewContext} />
                  <span>
                    <strong>Icon {target.baseId}</strong>
                    <small>{target.override?.sourceLabel ?? target.sourceLabel ?? target.asset?.label ?? (target.referenced ? "Referenced scenario icon target" : "Available scenario icon target")}</small>
                    <small className={`icon-target-source-badge ${sourceStatus}`} title={monsterIconTargetStatusTitle(sourceStatus)}>
                      {statusLabel}{target.override ? `: ${target.override.sourceLabel ?? `Source ${target.override.sourceBaseIconId}`}` : ""}
                    </small>
                  </span>
                </button>
              );
            })}
            {filteredTargets.length === 0 ? <p className="empty-copy compact">No monster icon targets match that search.</p> : null}
          </div>
        </section>
      </div>
    </article>
  );
}

function BattleBoard({
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  monsterSetPreview,
  onMonsterSetPreviewChange,
  battle,
  onSelectEntity,
  onApplyCommand,
  onUpdateGrid
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  monsterSetPreview: MonsterSetId;
  onMonsterSetPreviewChange: (value: MonsterSetId) => void;
  battle: BattleRecord;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateGrid: (grid: number[]) => void;
}) {
  useCombatRenderTiming("BattleBoard");
  const activeMonsterById = monsterMapForSet(lookups, monsterSetPreview);
  const activeMonsters = monstersForSet(lookups, monsterSetPreview);
  const projectAssets = project.assets;
  const projectCatalogIcons = project.assetCatalog?.icons;
  const projectMonsterIconOverrides = project.monsterIconOverrides;
  const projectScenarioIconResources = project.scenarioIconResources;
  const battleIconSourceKey = useBattleIconSourceKey(project, iconEntries, lookups, previewContext);
  const [draftGrid, setDraftGrid] = useState(() => normalizeBattleGridForEditor(battle.grid));
  const draftGridRef = useRef(draftGrid);
  const committedGridRef = useRef(normalizeBattleGridForEditor(battle.grid));
  const gestureRef = useRef<BattleBoardGesture | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, battle.grid.findIndex(Boolean)));
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [brush, setBrush] = useState<MonsterPlacementBrush>(() => ({
    mode: "select",
    source: battle.grid.find(Boolean) ? "scenario" : null,
    key: battle.grid.find(Boolean) ? `scenario:${Math.abs(battle.grid.find(Boolean) ?? 0)}` : null,
    monsterId: battle.grid.find(Boolean) ? Math.abs(battle.grid.find(Boolean) ?? 0) : null,
    forceFriend: false
  }));
  useEffect(() => {
    const nextGrid = normalizeBattleGridForEditor(battle.grid);
    committedGridRef.current = nextGrid;
    if (!gestureRef.current) {
      draftGridRef.current = nextGrid;
      setDraftGrid(nextGrid);
      setSelectedIndex((current) => current >= 0 && current < BATTLE_GRID_CELL_COUNT ? current : Math.max(0, nextGrid.findIndex(Boolean)));
    }
  }, [battle.id, battle.grid]);
  const cells = useMemo<BattleGridCellView[]>(
    () => measureCombatWork("BattleBoard cells", () => Array.from({ length: BATTLE_GRID_CELL_COUNT }, (_, displayIndex) => {
      const index = battleGridStorageIndexFromDisplayIndex(displayIndex);
      const { col: displayCol, row: displayRow } = battleGridDisplayCoordsFromStorageIndex(index);
      const value = draftGrid[index] ?? 0;
      return { index, displayIndex, displayCol, displayRow, value, monsterId: Math.abs(value), alternateSide: value < 0 };
    })),
    [draftGrid]
  );
  const selectedCell = cells.find((cell) => cell.index === selectedIndex) ?? cells[0];
  const selectedMonster = selectedCell?.monsterId ? activeMonsterById.get(selectedCell.monsterId) ?? null : null;
  const selectedNormalMonster = selectedCell?.monsterId ? lookups.monsterById.get(selectedCell.monsterId) ?? null : null;
  const selectedMissingScrapbookEntry = selectedCell?.monsterId && !selectedNormalMonster ? scrapbookEntryForMonsterId(catalog, selectedCell.monsterId) : null;
  const brushMonster = brush.monsterId ? activeMonsterById.get(brush.monsterId) ?? null : null;
  const placedCount = countBattleRuntimeMonsterSlots(draftGrid);
  const placementWarning = placedCount > BATTLE_RUNTIME_MONSTER_LIMIT
    ? `Realmz loads only ${BATTLE_RUNTIME_MONSTER_LIMIT} monsters; ${placedCount - BATTLE_RUNTIME_MONSTER_LIMIT} placed slot(s) will be omitted at runtime.`
    : placedCount >= BATTLE_RUNTIME_MONSTER_LIMIT
      ? `This battle is at Realmz's ${BATTLE_RUNTIME_MONSTER_LIMIT}-monster runtime cap. Replace or clear a placed cell before adding another.`
    : placedCount > BATTLE_SUMMON_SPACE_WARNING_LIMIT
      ? "This battle leaves little room for creature spawning or summon spells."
      : "";
  const placements = useMemo<BattleGridPlacementView[]>(
    () => measureCombatWork("BattleBoard placements", () =>
      cells
        .filter((cell) => cell.monsterId)
        .map((cell) => {
          const monster = activeMonsterById.get(cell.monsterId) ?? null;
          return {
            ...cell,
            monster,
            col: cell.displayCol,
            row: cell.displayRow,
            footprint: monster ? monsterBattleFootprintCached(monster, iconEntries, project, lookups, battleIconSourceKey) : { width: 1, height: 1 }
          };
        })),
    [activeMonsterById, battleIconSourceKey, cells, iconEntries, lookups, projectAssets, projectCatalogIcons, projectMonsterIconOverrides, projectScenarioIconResources]
  );
  const placementMonsters = useMemo(
    () => placements.map((placement) => placement.monster).filter((monster): monster is MonsterRecord => Boolean(monster)),
    [placements]
  );
  const placementIconUrls = useResolvedBattleMonsterIcons(placementMonsters, iconEntries, project, lookups, previewContext, battleIconSourceKey);
  const paintPreview = useMemo<BattleGridPaintPreview | null>(() => {
    if (brush.mode !== "paint" || hoverIndex === null || !brushMonster) return null;
    const hover = cells.find((cell) => cell.index === hoverIndex);
    if (!hover) return null;
    return {
      anchorIndex: hover.index,
      col: hover.displayCol,
      row: hover.displayRow,
      footprint: monsterBattleFootprintCached(brushMonster, iconEntries, project, lookups, battleIconSourceKey)
    };
  }, [battleIconSourceKey, brush.mode, brushMonster, cells, hoverIndex, iconEntries, lookups, project]);
  const setDraftGridValue = (index: number, value: number) => {
    if (!Number.isInteger(index) || index < 0 || index >= BATTLE_GRID_CELL_COUNT) return false;
    const current = draftGridRef.current;
    const existing = current[index] ?? 0;
    if (existing === value) return false;
    if (existing === 0 && value !== 0 && countBattleRuntimeMonsterSlots(current) >= BATTLE_RUNTIME_MONSTER_LIMIT) return false;
    const next = [...current];
    next[index] = value;
    draftGridRef.current = next;
    setDraftGrid(next);
    return true;
  };
  const commitDraftGrid = (fromGrid: number[], label: string) => {
    const nextGrid = draftGridRef.current;
    const cells = battleGridChanges(fromGrid, nextGrid);
    if (cells.length === 0) return;
    if (onApplyCommand) {
      onApplyCommand({ kind: "paintBattleGridCells", label, battleId: battle.id, cells });
      return;
    }
    onUpdateGrid(nextGrid);
  };
  const eraseCell = (index: number, commit = true) => {
    setSelectedIndex(index);
    const fromGrid = draftGridRef.current;
    if (!setDraftGridValue(index, 0)) return false;
    if (commit) commitDraftGrid(fromGrid, "Clear battle cell");
    return true;
  };
  const eraseVisibleAtCell = (index: number, commit = true) => {
    const cell = cells.find((candidate) => candidate.index === index);
    const topPlacement = cell ? topVisiblePlacementAtDisplayCell(placements, cell.displayCol, cell.displayRow) : null;
    return eraseCell(topPlacement?.index ?? index, commit);
  };
  const paintCell = (index: number, commit = true) => {
    setSelectedIndex(index);
    if (brush.monsterId === null) return false;
    const monsterId = brush.monsterId;
    if (!activeMonsterById.has(monsterId)) return false;
    const fromGrid = draftGridRef.current;
    const value = brush.forceFriend ? -Math.abs(monsterId) : Math.abs(monsterId);
    if (!setDraftGridValue(index, value)) return false;
    if (commit) commitDraftGrid(fromGrid, "Paint battle cell");
    return true;
  };
  const moveCell = (fromIndex: number, toIndex: number, commit = true) => {
    setDraggingIndex(null);
    setSelectedIndex(toIndex);
    if (fromIndex === toIndex) return false;
    const fromGrid = draftGridRef.current;
    const next = [...fromGrid];
    const moving = next[fromIndex] ?? 0;
    if (!moving) return false;
    const target = next[toIndex] ?? 0;
    next[toIndex] = moving;
    next[fromIndex] = target;
    draftGridRef.current = next;
    setDraftGrid(next);
    if (commit) commitDraftGrid(fromGrid, "Move battle monster");
    return true;
  };
  const updateSelected = (value: number) => {
    const fromGrid = draftGridRef.current;
    if (!setDraftGridValue(selectedIndex, value)) return;
    commitDraftGrid(fromGrid, value === 0 ? "Clear battle cell" : "Update battle cell");
  };
  const boardCellFromPointer = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = clamp(event.clientX - rect.left, 0, rect.width - 0.001);
    const y = clamp(event.clientY - rect.top, 0, rect.height - 0.001);
    const displayCol = clamp(Math.floor((x / rect.width) * BATTLE_GRID_SIZE), 0, BATTLE_GRID_SIZE - 1);
    const displayRow = clamp(Math.floor((y / rect.height) * BATTLE_GRID_SIZE), 0, BATTLE_GRID_SIZE - 1);
    return battleGridStorageIndexFromDisplayCoords(displayCol, displayRow);
  };
  const selectAtBoardCell = (index: number) => {
    const cell = cells.find((candidate) => candidate.index === index);
    const topPlacement = cell ? topVisiblePlacementAtDisplayCell(placements, cell.displayCol, cell.displayRow) : null;
    setSelectedIndex(topPlacement?.index ?? index);
    return topPlacement;
  };
  const continueGestureAt = (gesture: BattleBoardGesture, index: number) => {
    if (gesture.lastIndex === index && gesture.kind !== "move") return;
    gesture.lastIndex = index;
    if (gesture.kind === "paint") {
      gesture.changed = paintCell(index, false) || gesture.changed;
      return;
    }
    if (gesture.kind === "erase") {
      gesture.changed = eraseVisibleAtCell(index, false) || gesture.changed;
    }
  };
  const finishGesture = (index: number | null) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    if (gesture.kind === "move") {
      const targetIndex = index ?? gesture.lastIndex ?? gesture.fromIndex;
      gesture.changed = moveCell(gesture.fromIndex, targetIndex, false) || gesture.changed;
    }
    setDraggingIndex(null);
    if (gesture.changed) {
      commitDraftGrid(gesture.fromGrid, gesture.kind === "erase" ? "Erase battle cells" : gesture.kind === "move" ? "Move battle monster" : "Paint battle cells");
    }
  };
  const handleBoardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const index = boardCellFromPointer(event);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic smoke-test events do not always create a browser pointer capture slot.
    }
    event.preventDefault();
    if (brush.mode === "paint") {
      const gesture: BattleBoardGesture = { kind: "paint", pointerId: event.pointerId, fromGrid: draftGridRef.current, lastIndex: null, changed: false };
      gestureRef.current = gesture;
      continueGestureAt(gesture, index);
      return;
    }
    if (brush.mode === "erase") {
      const gesture: BattleBoardGesture = { kind: "erase", pointerId: event.pointerId, fromGrid: draftGridRef.current, lastIndex: null, changed: false };
      gestureRef.current = gesture;
      continueGestureAt(gesture, index);
      return;
    }
    const placement = selectAtBoardCell(index);
    if (placement) {
      setDraggingIndex(placement.index);
      gestureRef.current = { kind: "move", pointerId: event.pointerId, fromGrid: draftGridRef.current, fromIndex: placement.index, lastIndex: index, changed: false };
    }
  };
  const handleBoardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const index = boardCellFromPointer(event);
    setHoverIndex(index);
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    continueGestureAt(gesture, index);
  };
  const handleBoardPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const index = boardCellFromPointer(event);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may not have been captured when driven by synthetic events.
    }
    event.preventDefault();
    finishGesture(index);
  };
  const handleBoardPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setDraggingIndex(null);
    draftGridRef.current = gesture.fromGrid;
    setDraftGrid(gesture.fromGrid);
  };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable)) return;
      if (!(draftGridRef.current[selectedIndex] ?? 0)) return;
      event.preventDefault();
      eraseCell(selectedIndex);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex]);

  return (
    <section className="battle-board-workbench">
      <aside className="monster-placement-card">
        <div className="placement-mode-controls" role="group" aria-label="Battle grid mode">
          <ToggleButton icon={<MousePointer2 size={15} />} active={brush.mode === "select"} label="Select" help="Click a placed monster for details, drag it to another anchor cell, or press Delete to clear the selected placement." onClick={() => setBrush((current) => ({ ...current, mode: "select" }))} />
          <ToggleButton icon={<Brush size={15} />} active={brush.mode === "paint"} label="Paint" help="Paint the selected monster into clicked anchor cells." onClick={() => setBrush((current) => ({ ...current, mode: "paint" }))} />
          <ToggleButton icon={<Eraser size={15} />} active={brush.mode === "erase"} label="Erase" help="Delete the top visible monster on the tile you click, even when its anchor cell is elsewhere." onClick={() => setBrush((current) => ({ ...current, mode: "erase" }))} />
        </div>
        <MonsterPalette
          project={project}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          selectedKey={brush.key}
          onSelect={(entry) =>
            setBrush((current) => ({
              ...current,
              source: "scenario",
              key: entry.key,
              monsterId: entry.id,
              mode: "paint"
            }))
          }
          monsterSetPreview={monsterSetPreview}
          onMonsterSetPreviewChange={onMonsterSetPreviewChange}
          activeMonsters={activeMonsters}
        />
      </aside>
      <div className="battle-board-card">
        <header>
          <TutorialTip title="Battle Grid" body={BATTLE_GRID_HELP} side="right">
            <strong>Battle Grid</strong>
          </TutorialTip>
          <b className={placedCount > BATTLE_RUNTIME_MONSTER_LIMIT ? "limit-error" : placedCount >= BATTLE_RUNTIME_MONSTER_LIMIT || placedCount > BATTLE_SUMMON_SPACE_WARNING_LIMIT ? "limit-warning" : "limit-safe"}>
            {placedCount}/{BATTLE_RUNTIME_MONSTER_LIMIT} runtime monster slots used
          </b>
        </header>
        <div className="battle-board-body">
          {placementWarning && (
            <p className={placedCount > BATTLE_RUNTIME_MONSTER_LIMIT ? "battle-placement-limit error" : "battle-placement-limit warning"}>
              {placementWarning}
            </p>
          )}
          <div className="battle-board-scroll">
            <div
              ref={boardRef}
              className={`battle-board battle-board-canvas-surface ${brush.mode}`}
              role="grid"
              aria-label="Battle monster grid"
              tabIndex={0}
              title={battleBoardHoverTitle(hoverIndex, cells, placements, activeMonsterById, monsterSetPreview)}
              data-battle-board-canvas="true"
              onPointerDown={handleBoardPointerDown}
              onPointerMove={handleBoardPointerMove}
              onPointerLeave={() => setHoverIndex(null)}
              onPointerUp={handleBoardPointerUp}
              onPointerCancel={handleBoardPointerCancel}
            >
              <BattleBoardCanvas
                cells={cells}
                placements={placements}
                iconUrls={placementIconUrls}
                paintPreview={paintPreview}
                selectedIndex={selectedIndex}
                hoverIndex={hoverIndex}
                draggingIndex={draggingIndex}
              />
            </div>
          </div>
        </div>
      </div>
      <aside className="battle-selection-card">
        {brush.mode === "paint" ? (
          <div className="battle-brush-inspector">
            <strong>Paint Brush</strong>
            {brushMonster ? (
              <>
                <small>{brushMonster.displayName || `Monster ${brushMonster.id}`} | Monster {brushMonster.id}</small>
                <MonsterBattleDetail
                  monster={brushMonster}
                  iconEntries={iconEntries}
                  project={project}
                  lookups={lookups}
                  previewContext={previewContext}
                />
                <div className="placement-controls">
                  <ToggleButton active={brush.forceFriend} label="Force Friends" help="Write a negative monster ID so Realmz flips the loaded monster to the friendly/alternate side." helpSide="left" onClick={() => setBrush((current) => ({ ...current, forceFriend: !current.forceFriend }))} />
                </div>
              </>
            ) : (
              <p className="empty-copy compact">Choose a monster from the palette to paint it into the battle grid.</p>
            )}
          </div>
        ) : (
          <div className="selected-battle-cell">
            <strong>Anchor Cell {selectedCell?.displayCol ?? 0}, {selectedCell?.displayRow ?? 0}</strong>
            <small>{selectedCell?.value ? monsterPlacementTitle(selectedMonster, selectedCell.value, monsterSetPreview) : "Empty anchor cell"}</small>
            <small className="battle-anchor-note">Large, tall, and wide monsters are placed by their lower-right anchor cell. Erase mode clears the top visible monster on the clicked tile.</small>
              <MonsterSelect
                monsters={activeMonsters}
                setId={monsterSetPreview}
                value={selectedCell?.monsterId ?? 0}
                onCommit={(monsterId) => updateSelected(monsterId === 0 ? 0 : (selectedCell?.value ?? 0) < 0 ? -Math.abs(monsterId) : Math.abs(monsterId))}
              />
            {selectedCell?.monsterId && monsterSetPreview !== 0 && !selectedMonster && selectedNormalMonster ? (
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => onApplyCommand?.({ kind: "createMonsterVariantFromNormal", label: `Create ${monsterSetLabel(monsterSetPreview)} monster ${selectedCell.monsterId} from Normal`, id: selectedCell.monsterId, setId: monsterSetPreview })}
              >
                Create {monsterSetLabel(monsterSetPreview)} From Normal
              </button>
            ) : null}
            <div className="placement-controls">
              <ToggleButton active={(selectedCell?.value ?? 0) < 0} label="Force Friends" help="Toggle the sign of this battle-grid value. The absolute value stays the same monster record; Realmz flips the loaded monster's traiter flag." helpSide="left" disabled={!selectedCell?.monsterId} onClick={() => selectedCell && updateSelected(selectedCell.value < 0 ? selectedCell.monsterId : -selectedCell.monsterId)} />
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => updateSelected(0)}>Clear Cell</button>
            </div>
            {selectedMonster ? (
              <MonsterBattleDetail
                monster={selectedMonster}
                iconEntries={iconEntries}
                project={project}
                lookups={lookups}
                previewContext={previewContext}
                forcedFriendly={(selectedCell?.value ?? 0) < 0}
              />
            ) : null}
            {!selectedMonster && selectedCell?.monsterId ? (
              <div className="selected-monster-preview missing-monster-reference">
                <b>{selectedCell.monsterId}</b>
                <span>
                  Monster {selectedCell.monsterId} is not in {monsterSetFile(monsterSetPreview)}.
                  {selectedMissingScrapbookEntry ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => {
                        copyScrapbookMonsterToScenario(selectedMissingScrapbookEntry, selectedCell.monsterId, onApplyCommand);
                        onSelectEntity(selectEntityFromId(`monster:${selectedCell.monsterId}`));
                      }}
                    >
                      Copy Built-In Monster {selectedCell.monsterId}
                    </button>
                  ) : (
                    <small>No matching built-in Monster Scrapbook entry was found.</small>
                  )}
                </span>
              </div>
            ) : null}
          </div>
        )}
      </aside>
    </section>
  );
}

type BattleBoardCanvasProps = {
  cells: BattleGridCellView[];
  placements: BattleGridPlacementView[];
  iconUrls: Record<string, ResolvedBattleMonsterIcon>;
  paintPreview: BattleGridPaintPreview | null;
  selectedIndex: number;
  hoverIndex: number | null;
  draggingIndex: number | null;
};

const battleCanvasImageCache = new Map<string, Promise<BattleCanvasImage | null>>();
const battleCanvasResolvedImageCache = new Map<string, BattleCanvasImage | null>();
const battleMonsterIconUrlCache = new Map<string, Promise<ResolvedBattleMonsterIcon>>();
const battleMonsterFootprintCache = new Map<string, { width: number; height: number }>();
const battleMonsterPaletteMetricCache = new Map<string, { artSize: { width: number; height: number }; footprintLabel: string }>();

function useBattleIconSourceKey(
  project: Project,
  iconEntries: Record<number, IconEntry>,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext
) {
  const projectAssets = project.assets;
  const projectCatalogIcons = project.assetCatalog?.icons;
  const projectMonsterIconOverrides = project.monsterIconOverrides;
  const projectScenarioIconResources = project.scenarioIconResources;
  const realmzActorIconAssets = lookups.realmzActorIconAssetsByAbsId;
  return useMemo(() => battleIconSourceKey(project, iconEntries, realmzActorIconAssets, previewContext), [
    iconEntries,
    previewContext.desktopRuntime,
    previewContext.projectDir,
    previewContext.workspaceDir,
    project.scenario.name,
    project.source.sourcePath,
    projectAssets,
    projectCatalogIcons,
    projectMonsterIconOverrides,
    projectScenarioIconResources,
    realmzActorIconAssets
  ]);
}

function useResolvedBattleMonsterIcons(
  monsters: MonsterRecord[],
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext,
  sourceKey: string
) {
  const monsterKey = useMemo(() => uniqueBattleMonsterIconMonsters(monsters).map(battleMonsterIconLookupKey).join("|"), [monsters]);
  const [icons, setIcons] = useState<Record<string, ResolvedBattleMonsterIcon>>({});
  useEffect(() => {
    let disposed = false;
    const uniqueMonsters = uniqueBattleMonsterIconMonsters(monsters);
    if (uniqueMonsters.length === 0) {
      setIcons({});
      return () => {
        disposed = true;
      };
    }
    const started = performance.now();
    Promise.all(uniqueMonsters.map((monster) => resolveCachedBattleMonsterIcon(monster, iconEntries, project, lookups, previewContext, sourceKey)))
      .then((resolved) => {
        if (disposed) return;
        setIcons(Object.fromEntries(resolved.map((icon) => [icon.cacheKey, icon])));
        recordCombatPerf("battleIconUrlResolve", performance.now() - started);
      })
      .catch(() => {
        if (!disposed) setIcons({});
      });
    return () => {
      disposed = true;
    };
  }, [monsterKey, sourceKey]);
  return icons;
}

function uniqueBattleMonsterIconMonsters(monsters: MonsterRecord[]) {
  const byKey = new Map<string, MonsterRecord>();
  for (const monster of monsters) byKey.set(battleMonsterIconLookupKey(monster), monster);
  return [...byKey.values()];
}

function battleMonsterIconLookupKey(monster: MonsterRecord) {
  return `${monster.id}:${monster.iconId}`;
}

function battleIconSourceKey(
  project: Project,
  iconEntries: Record<number, IconEntry>,
  realmzActorIconAssetsByAbsId: Map<number, LibraryAsset>,
  previewContext: PreviewRuntimeContext
) {
  const iconEntryKey = Object.entries(iconEntries)
    .map(([id, entry]) => `${id}:${entry.url ?? ""}:${entry.image?.naturalWidth || entry.image?.width || 0}x${entry.image?.naturalHeight || entry.image?.height || 0}`)
    .sort()
    .join(",");
  const projectIconKey = [
    ...(project.assets ?? [])
      .filter((asset) => asset.resourceType === "cicn")
      .map((asset) => `${asset.id}:${asset.resourceId ?? ""}:${asset.previewPath ?? ""}`),
    ...(project.assetCatalog?.icons ?? []).map((asset) => `${asset.resourceId}:${asset.previewPath ?? ""}:${asset.name ?? ""}`),
    ...(project.scenarioIconResources ?? []).map((resource) => `${resource.resourceId}:${resource.previewPath ?? ""}:${resource.resourceBase64?.length ?? 0}`),
    ...(project.monsterIconOverrides ?? []).map((override) => `${override.targetBaseIconId}:${override.sourceKind}:${override.sourceBaseIconId}:${override.sourceBaseResourceBase64?.length ?? 0}:${override.sourcePairedResourceBase64?.length ?? 0}`),
    ...[...realmzActorIconAssetsByAbsId.entries()].map(([id, asset]) => `${id}:${asset.source}:${asset.relativePath}:${asset.previewPath ?? ""}`)
  ].sort().join("|");
  return [
    previewContext.desktopRuntime ? "desktop" : "browser",
    previewContext.projectDir ?? "",
    previewContext.workspaceDir ?? "",
    project.scenario.name,
    project.source.sourcePath,
    iconEntryKey,
    projectIconKey
  ].join("\n");
}

function resolveCachedBattleMonsterIcon(
  monster: MonsterRecord,
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext,
  sourceKey: string
) {
  const cacheKey = `${sourceKey}\n${battleMonsterIconLookupKey(monster)}`;
  const cached = battleMonsterIconUrlCache.get(cacheKey);
  if (cached) return cached;
  const request = resolveBattleMonsterIcon(monster, iconEntries, project, lookups, previewContext);
  battleMonsterIconUrlCache.set(cacheKey, request);
  return request;
}

async function resolveBattleMonsterIcon(
  monster: MonsterRecord,
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext
): Promise<ResolvedBattleMonsterIcon> {
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const directUrl = await resolvePreviewUrl(resolution.url, null, resolution.libraryAsset ?? null, previewContext);
  const iconResourceId = monster.iconId ? Math.abs(monster.iconId) : null;
  const fallbackUrl = directUrl || !iconResourceId
    ? null
    : await resolvePreviewUrl(null, null, null, {
      ...previewContext,
      project,
      resourceType: "cicn",
      resourceId: iconResourceId
    });
  return {
    ...resolution,
    resolvedUrl: directUrl ?? fallbackUrl,
    cacheKey: battleMonsterIconLookupKey(monster)
  };
}

function BattleBoardCanvas({
  cells,
  placements,
  iconUrls,
  paintPreview,
  selectedIndex,
  hoverIndex,
  draggingIndex
}: BattleBoardCanvasProps) {
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const monsterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imagesByPlacement, setImagesByPlacement] = useState<Record<string, BattleCanvasImageEntry>>({});

  useEffect(() => {
    let disposed = false;
    const nextImages: Record<string, BattleCanvasImageEntry> = {};
    const missing: Array<{ key: string; url: string | null }> = [];
    for (const placement of placements) {
      const key = battlePlacementCanvasKey(placement);
      if (!placement.monster) {
        nextImages[key] = { url: null, image: null };
        continue;
      }
      const resolved = iconUrls[battleMonsterIconLookupKey(placement.monster)] ?? null;
      const url = resolved?.resolvedUrl ?? null;
      const cached = imagesByPlacement[key];
      if (cached && cached.url === url) {
        nextImages[key] = cached;
      } else {
        nextImages[key] = { url, image: url ? battleCanvasResolvedImageCache.get(url) ?? null : null };
      }
      if (url && !nextImages[key].image) missing.push({ key, url });
    }
    setImagesByPlacement(nextImages);
    if (missing.length === 0) {
      return () => {
        disposed = true;
      };
    }
    Promise.all(missing.map(async ({ key, url }) => {
      const image = url ? await loadBattleCanvasImage(url) : null;
      return [key, { url, image }] as const;
    })).then((entries) => {
      if (disposed) return;
      setImagesByPlacement((current) => {
        let changed = false;
        const next = { ...current };
        for (const [key, entry] of entries) {
          if (next[key]?.url !== entry.url) continue;
          if (next[key].image === entry.image) continue;
          next[key] = entry;
          changed = true;
        }
        return changed ? next : current;
      });
    }).catch(() => {
      if (disposed) return;
      setImagesByPlacement((current) => {
        let changed = false;
        const next = { ...current };
        for (const { key, url } of missing) {
          if (next[key]?.url !== url || next[key].image === null) continue;
          next[key] = { url, image: null };
          changed = true;
        }
        return changed ? next : current;
      });
    });
    return () => {
      disposed = true;
    };
  }, [iconUrls, placements]);

  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const { ctx, size } = syncBattleCanvas(canvas);
    if (!ctx) return;
    drawBattleGridLayer(ctx, size, cells);
  }, [cells]);

  useEffect(() => {
    const canvas = monsterCanvasRef.current;
    if (!canvas) return;
    const { ctx, size } = syncBattleCanvas(canvas);
    if (!ctx) return;
    drawBattleMonsterLayer(ctx, size, placements, imagesByPlacement, draggingIndex);
  }, [draggingIndex, imagesByPlacement, placements]);

  useEffect(() => {
    const canvas = interactionCanvasRef.current;
    if (!canvas) return;
    const { ctx, size } = syncBattleCanvas(canvas);
    if (!ctx) return;
    drawBattleInteractionLayer(ctx, size, cells, placements, paintPreview, selectedIndex, hoverIndex);
  }, [cells, hoverIndex, paintPreview, placements, selectedIndex]);

  return (
    <>
      <canvas ref={gridCanvasRef} className="battle-board-canvas battle-board-grid-canvas" aria-hidden="true" />
      <canvas ref={monsterCanvasRef} className="battle-board-canvas battle-board-monster-canvas" aria-hidden="true" />
      <canvas ref={interactionCanvasRef} className="battle-board-canvas battle-board-interaction-canvas" aria-hidden="true" />
    </>
  );
}

function MonsterPalette({
  project,
  iconEntries,
  lookups,
  previewContext,
  selectedKey,
  onSelect,
  monsterSetPreview,
  onMonsterSetPreviewChange,
  activeMonsters
}: {
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  selectedKey: string | null;
  onSelect: (entry: BattleMonsterPaintEntry) => void;
  monsterSetPreview: MonsterSetId;
  onMonsterSetPreviewChange: (value: MonsterSetId) => void;
  activeMonsters: MonsterRecord[];
}) {
  useCombatRenderTiming("MonsterWorkbench");
  const [query, setQuery] = useState("");
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const [paletteViewport, setPaletteViewport] = useState({ width: 0, height: 0, scrollTop: 0 });
  const placeableMonsters = useMemo(
    () => activeMonsters.filter((monster) => monster.id > 0 && monster.id <= MAX_DIVINITY_BATTLE_MONSTER_ID),
    [activeMonsters]
  );
  const entries = useMemo<BattleMonsterPaintEntry[]>(
    () => placeableMonsters.map((monster) => ({ kind: "scenario" as const, key: `scenario:${monster.id}`, id: monster.id, monster })),
    [placeableMonsters]
  );
  const filtered = useMemo(
    () => filterRecords(entries, query, battleMonsterPaintEntrySearchText),
    [entries, query]
  );
  useEffect(() => {
    const element = paletteRef.current;
    if (!element) return;
    const update = () => setPaletteViewport({
      width: element.clientWidth,
      height: element.clientHeight,
      scrollTop: element.scrollTop
    });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = paletteRef.current;
    if (element) element.scrollTop = 0;
    setPaletteViewport((current) => ({ ...current, scrollTop: 0 }));
  }, [monsterSetPreview, query]);
  const paletteWindow = useMemo(
    () => monsterBrushPaletteWindow(filtered.length, paletteViewport.width, paletteViewport.height, paletteViewport.scrollTop),
    [filtered.length, paletteViewport.height, paletteViewport.scrollTop, paletteViewport.width]
  );
  const visibleEntries = useMemo(
    () => filtered.slice(paletteWindow.startIndex, paletteWindow.endIndex),
    [filtered, paletteWindow.endIndex, paletteWindow.startIndex]
  );
  const battleIconSourceKey = useBattleIconSourceKey(project, iconEntries, lookups, previewContext);
  const visibleIconUrls = useResolvedBattleMonsterIcons(
    visibleEntries.map((entry) => entry.monster),
    iconEntries,
    project,
    lookups,
    previewContext,
    battleIconSourceKey
  );
  const hasScenarioMonsters = activeMonsters.some((monster) => monster.id > 0);
  const hasOnlyUnplaceableMonsterZero = activeMonsters.length > 0 && !hasScenarioMonsters;
  const hasOnlyOutOfRangeMonsters = hasScenarioMonsters && placeableMonsters.length === 0;
  return (
    <div className="monster-palette">
      <header>
        <div>
          <TutorialTip title="Monster Placement Brush" body={MONSTER_PLACEMENT_HELP} side="right">
            <strong>Monster Palette</strong>
          </TutorialTip>
          <small>{entries.length} placeable</small>
        </div>
        <BattleScenarioMonsterSetField value={monsterSetPreview} onCommit={onMonsterSetPreviewChange} compact />
      </header>
      <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search monsters..." />
      <div
        ref={paletteRef}
        className="monster-brush-palette"
        aria-label="Paintable monsters"
        onScroll={(event) => {
          const element = event.currentTarget;
          setPaletteViewport((current) => ({ ...current, scrollTop: element.scrollTop, width: element.clientWidth, height: element.clientHeight }));
        }}
      >
        {entries.length === 0 && !hasOnlyUnplaceableMonsterZero && !hasOnlyOutOfRangeMonsters && (
          <p className="empty-copy compact">No {monsterSetLabel(monsterSetPreview)} scenario monsters are available for battle placement. Copy from Monster Library into Scenario Monsters first.</p>
        )}
        {hasOnlyUnplaceableMonsterZero && (
          <p className="empty-copy compact">Monster 0 exists in {monsterSetFile(monsterSetPreview)}, but Data BD uses 0 for empty battle cells. Create or copy a monster into slot 1 or higher before placing battle monsters.</p>
        )}
        {hasOnlyOutOfRangeMonsters && (
          <p className="empty-copy compact">This scenario only has monster IDs outside Divinity's battle-authorable range. Use Scenario Monsters 1-{MAX_DIVINITY_BATTLE_MONSTER_ID} for battle placement.</p>
        )}
        {paletteWindow.topSpacer > 0 ? <div className="monster-brush-palette-spacer" style={{ height: paletteWindow.topSpacer }} /> : null}
        {visibleEntries.map((entry) => (
          <MonsterBrushTile
            key={entry.key}
            entry={entry}
            selected={selectedKey === entry.key}
            iconEntries={iconEntries}
            project={project}
            lookups={lookups}
            previewContext={previewContext}
            iconSourceKey={battleIconSourceKey}
            resolvedIcon={visibleIconUrls[battleMonsterIconLookupKey(entry.monster)] ?? null}
            onSelect={onSelect}
          />
        ))}
        {paletteWindow.bottomSpacer > 0 ? <div className="monster-brush-palette-spacer" style={{ height: paletteWindow.bottomSpacer }} /> : null}
        {filtered.length === 0 && entries.length > 0 ? <small className="combat-list-overflow-note">No matching placeable monster.</small> : null}
      </div>
    </div>
  );
}

type MonsterBrushTileProps = {
  entry: BattleMonsterPaintEntry;
  selected: boolean;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  iconSourceKey: string;
  resolvedIcon: ResolvedBattleMonsterIcon | null;
  onSelect: (entry: BattleMonsterPaintEntry) => void;
};

const MonsterBrushTile = memo(function MonsterBrushTile({
  entry,
  selected,
  iconEntries,
  project,
  lookups,
  previewContext,
  iconSourceKey,
  resolvedIcon,
  onSelect
}: MonsterBrushTileProps) {
  const monster = entry.monster;
  const name = monster.displayName || `Monster ${monster.id}`;
  const facts = monsterFacts(monster);
  const metrics = monsterPaletteMetricsCached(monster, iconEntries, project, lookups, iconSourceKey);
  const artSize = metrics.artSize;
  return (
    <TutorialTip
      title={`${name} (${entry.id})`}
      body={`${facts}. ${metrics.footprintLabel}. Scenario monster.`}
      side="right"
    >
      <button
        type="button"
        className={`monster-brush${selected ? " selected" : ""}`}
        data-monster-brush-id={entry.id}
        onClick={() => onSelect(entry)}
      >
        <span
          className="monster-brush-icon"
          style={{
            width: artSize.width,
            height: artSize.height,
            maxWidth: "100%",
            maxHeight: "100%"
          }}
        >
          <MonsterIcon
            monster={monster}
            iconEntries={iconEntries}
            project={project}
            lookups={lookups}
            previewContext={previewContext}
            resolvedIcon={resolvedIcon}
          />
        </span>
        <span className="monster-brush-id">{entry.id}</span>
      </button>
    </TutorialTip>
  );
}, areMonsterBrushTilePropsEqual);

function areMonsterBrushTilePropsEqual(previous: MonsterBrushTileProps, next: MonsterBrushTileProps) {
  return previous.entry === next.entry
    && previous.selected === next.selected
    && previous.iconEntries === next.iconEntries
    && previous.lookups === next.lookups
    && previous.iconSourceKey === next.iconSourceKey
    && previous.resolvedIcon === next.resolvedIcon
    && samePreviewContextInputs(previous.previewContext, next.previewContext)
    && sameProjectIconInputs(previous.project, next.project);
}

function MonsterWorkbench({
  project,
  catalog,
  selectedEntity,
  iconEntries,
  lookups,
  previewContext,
  onSelectEntity,
  onSelectIconSetTab,
  onApplyCommand,
  onUpdateLibraryCatalog
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectIconSetTab: () => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [libraryRangeAnchorId, setLibraryRangeAnchorId] = useState<string | null>(null);
  const [populateMenuOpen, setPopulateMenuOpen] = useState(false);
  const [activePreview, setActivePreview] = useState<"scenario" | "library">("scenario");
  const [activeSetId, setActiveSetId] = useState<MonsterSetId>(0);
  const [scenarioDropActive, setScenarioDropActive] = useState(false);
  const [libraryDropActive, setLibraryDropActive] = useState(false);
  const [pendingBattleRepair, setPendingBattleRepair] = useState<PendingBattleReferenceRepair | null>(null);
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "monster:");
  const projectMonsters = project.monsters;
  const projectMonsterSets = project.monsterSets;
  const projectBattles = project.battles;
  const scenarioIds = useMemo(
    () => measureCombatWork("MonsterWorkbench scenarioIds", () => monsterScenarioIds(project)),
    [projectMonsters, projectMonsterSets]
  );
  const scenarioEntries = useMemo<ScenarioMonsterListEntry[]>(
    () => measureCombatWork("MonsterWorkbench scenarioEntries", () => scenarioIds.map((id) => {
      const normal = monsterForSet(lookups, 0, id);
      const monster = monsterForSet(lookups, 1, id);
      const mega = monsterForSet(lookups, -1, id);
      const active = monsterForSet(lookups, activeSetId, id);
      const fallback = active ?? normal ?? monster ?? mega;
      return { id, normal, monster, mega, active, fallback };
    })),
    [activeSetId, lookups, scenarioIds]
  );
  const displayScenarioEntries = scenarioEntries;
  const filtered = useMemo(
    () => measureCombatWork("MonsterWorkbench filteredScenarioEntries", () => filterRecords(displayScenarioEntries, query, (entry) => {
      const record = entry.fallback;
      return `${entry.id} ${record?.displayName ?? ""} icon ${record?.iconId ?? ""} hd ${record?.hitDice ?? ""} normal ${Boolean(entry.normal)} monster ${Boolean(entry.monster)} mega ${Boolean(entry.mega)}`;
    })),
    [displayScenarioEntries, query]
  );
  const libraryEntries = useMemo(() => {
    const entries = visibleMonsterLibraryEntries(catalog)
      .filter((entry) => {
        if (isProvidenceMonsterLibraryEntry(entry)) return true;
        return !(catalog?.entities ?? []).some((candidate) => {
          if (!isProvidenceMonsterLibraryEntry(candidate)) return false;
          const origin = monsterLibraryOrigin(candidate);
          return origin.kind === "built-in-override" && origin.sourceId === entry.id;
        });
      });
    return entries.sort((a, b) => {
      const aCustom = isProvidenceMonsterLibraryEntry(a);
      const bCustom = isProvidenceMonsterLibraryEntry(b);
      if (aCustom !== bCustom) return aCustom ? 1 : -1;
      return scrapbookIndex(a) - scrapbookIndex(b);
    });
  }, [catalog?.entities]);
  const filteredLibrary = useMemo(
    () => filterRecords(libraryEntries, libraryQuery, scrapbookSearchText),
    [libraryEntries, libraryQuery]
  );
  useEffect(() => {
    if (filteredLibrary.length === 0) {
      setSelectedLibraryId(null);
      setSelectedLibraryIds([]);
      return;
    }
    if (selectedLibraryId === null || !filteredLibrary.some((entry) => entry.id === selectedLibraryId)) {
      const nextId = filteredLibrary[0].id;
      setSelectedLibraryId(nextId);
      setSelectedLibraryIds((ids) => ids.length > 1 ? ids.filter((id) => libraryEntries.some((entry) => entry.id === id)) : [nextId]);
    }
  }, [filteredLibrary, libraryEntries, selectedLibraryId]);
  useEffect(() => {
    if (selectedLibraryIds.length < 2) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSelectedLibraryIds(selectedLibraryId ? [selectedLibraryId] : []);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLibraryId, selectedLibraryIds.length]);
  const nextMonsterId = nextAvailableMonsterRecordId(scenarioIds.map((id) => ({ id })));
  const selectedId = selectedFromEntity ?? displayScenarioEntries[0]?.id ?? null;
  const selectedEntry = selectedId !== null ? scenarioEntries.find((entry) => entry.id === selectedId) ?? null : null;
  const selected = selectedId !== null ? monsterForSet(lookups, activeSetId, selectedId) : null;
  const selectedNormal = selectedId !== null ? monsterForSet(lookups, 0, selectedId) : null;
  const selectedLibrary =
    selectedLibraryId !== null ? filteredLibrary.find((entry) => entry.id === selectedLibraryId) ?? null :
    filteredLibrary[0] ?? null;
  const selectedLibraryTemplate = selectedLibrary ? monsterLibraryEntryTemplate(selectedLibrary) : null;
  const selectedLibraryEntries = selectedLibraryIds
    .map((id) => libraryEntries.find((entry) => entry.id === id) ?? null)
    .filter((entry): entry is LibraryCatalog["entities"][number] => Boolean(entry));
  const multiSelectedLibraryEntries = selectedLibraryEntries.length > 1 ? selectedLibraryEntries : [];
  const selectedDescription = selectedId !== null ? project.monsterDescriptions.find((description) => description.id === selectedId)?.text ?? "" : "";
  const battleReferenceLookup = useMemo(
    () => measureCombatWork("MonsterWorkbench battleReferencesByMonster", () => battleReferencesByMonster(project)),
    [projectBattles]
  );
  const battleReferencesForId = (id: number) => battleReferenceLookup.get(Math.abs(id)) ?? [];
  const selectedBattleReferences = useMemo(
    () => selectedId !== null ? battleReferencesForId(selectedId) : [],
    [battleReferenceLookup, selectedId]
  );
  const selectMonster = (id: number) => onSelectEntity(selectEntityFromId(`monster:${id}`));
  const update = (id: number, changes: Partial<MonsterRecord>, setId: MonsterSetId = activeSetId) => onApplyCommand?.({ kind: "updateMonsterRecord", label: `Update ${monsterSetLabel(setId)} monster`, id, changes, setId });
  const applyClearScenarioMonster = (monsterId: number, setId: MonsterSetId) => {
    onApplyCommand?.({
      kind: "clearMonsterRecord",
      label: `Clear ${monsterSetLabel(setId)} monster ${monsterId}`,
      id: monsterId,
      setId
    });
    setActivePreview("scenario");
    selectMonster(monsterId);
  };
  const clearScenarioMonster = (monster: MonsterRecord, setId: MonsterSetId) => {
    if (battleReferencesForId(monster.id).length > 0) {
      setPendingBattleRepair({ kind: "clear", monsterId: monster.id, setId });
      return;
    }
    applyClearScenarioMonster(monster.id, setId);
  };
  const applySwitchMonsterRecords = (fromId: number, toId: number, setId: MonsterSetId) => {
    onApplyCommand?.({ kind: "switchMonsterRecords", label: `Switch ${monsterSetLabel(setId)} monster ${fromId} with ${toId}`, setId, fromId, toId });
    selectMonster(toId);
  };
  const managedLibraryPath = catalog?.managedPath ?? "browser://workspace/library";
  const commitCatalog = (nextCatalog: LibraryCatalog, status: string) => onUpdateLibraryCatalog?.(nextCatalog, status);
  const selectScenarioMonster = (id: number) => {
    setActivePreview("scenario");
    setPopulateMenuOpen(false);
    selectMonster(id);
  };
  const selectLibraryMonster = (entry: LibraryCatalog["entities"][number], event?: MouseEvent<HTMLButtonElement>) => {
    setActivePreview("library");
    setPopulateMenuOpen(false);
    setSelectedLibraryId(entry.id);
    if (event?.shiftKey && libraryRangeAnchorId) {
      const anchorIndex = filteredLibrary.findIndex((candidate) => candidate.id === libraryRangeAnchorId);
      const targetIndex = filteredLibrary.findIndex((candidate) => candidate.id === entry.id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const start = Math.min(anchorIndex, targetIndex);
        const end = Math.max(anchorIndex, targetIndex);
        setSelectedLibraryIds(filteredLibrary.slice(start, end + 1).map((candidate) => candidate.id));
        return;
      }
    }
    if (event?.ctrlKey || event?.metaKey) {
      const exists = selectedLibraryIds.includes(entry.id);
      const nextIds = exists ? selectedLibraryIds.filter((id) => id !== entry.id) : [...selectedLibraryIds, entry.id];
      setSelectedLibraryIds(nextIds.length > 0 ? nextIds : [entry.id]);
      setLibraryRangeAnchorId(entry.id);
      if (exists && selectedLibraryId === entry.id && nextIds.length > 0) setSelectedLibraryId(nextIds[nextIds.length - 1]);
      return;
    }
    setSelectedLibraryIds([entry.id]);
    setLibraryRangeAnchorId(entry.id);
  };
  const clearLibraryMultiSelection = () => {
    setSelectedLibraryIds(selectedLibraryId ? [selectedLibraryId] : []);
    setLibraryRangeAnchorId(selectedLibraryId);
  };
  const applyMonsterCopyEntries = async (
    entries: MonsterLibraryCopyEntry[],
    label: string
  ) => {
    if (entries.length === 0) return;
    onApplyCommand?.({ kind: "createMonstersFromTemplates", label, entries });
    await materializeMonsterLibraryIconOverrides(entries, project, catalog, lookups, iconEntries, previewContext, onApplyCommand);
    const first = entries[0];
    setActiveSetId(first.setId ?? 0);
    setActivePreview("scenario");
    selectMonster(first.id);
  };
  const buildSequentialLibraryCopyEntries = (entries: LibraryCatalog["entities"][number][]) => {
    const used = new Set(monsterScenarioIds(project));
    const copies: MonsterLibraryCopyEntry[] = [];
    for (const entry of entries) {
      const preferred = preferredMonsterCopyId(project, entry);
      const id = preferred > 0 && !used.has(preferred)
        ? preferred
        : nextAvailableMonsterRecordId([...used].map((candidate) => ({ id: candidate })));
      if (!Number.isInteger(id) || id < 0) continue;
      used.add(id);
      copies.push({ entry, id, template: monsterRecordFromLibraryEntry(entry, id), description: scrapbookDescription(entry) });
    }
    return copies;
  };
  const buildStockLibraryCopyEntries = () => {
    const used = new Set(monsterScenarioIds(project));
    return libraryEntries
      .filter((entry) => !isProvidenceMonsterLibraryEntry(entry))
      .map((entry) => ({ entry, id: scrapbookIndex(entry) }))
      .filter(({ id }) => id > 0 && id <= MAX_DIVINITY_BATTLE_MONSTER_ID && !used.has(id))
      .map(({ entry, id }) => {
        used.add(id);
        return { entry, id, template: monsterRecordFromLibraryEntry(entry, id), description: scrapbookDescription(entry) };
      });
  };
  const copyLibraryEntriesToScenario = async (entries: LibraryCatalog["entities"][number][], label: string) => {
    await applyMonsterCopyEntries(buildSequentialLibraryCopyEntries(entries), label);
  };
  const populateStockMonsters = () => {
    setPopulateMenuOpen(false);
    void applyMonsterCopyEntries(buildStockLibraryCopyEntries(), "Copy stock monsters to scenario");
  };
  const populateVisibleLibrary = () => {
    setPopulateMenuOpen(false);
    void copyLibraryEntriesToScenario(filteredLibrary, "Copy visible library monsters to scenario");
  };
  const populateCustomLibrary = () => {
    setPopulateMenuOpen(false);
    void copyLibraryEntriesToScenario(libraryEntries.filter(isProvidenceMonsterLibraryEntry), "Copy custom library monsters to scenario");
  };
  const copyLibraryEntryToScenario = async (entry: LibraryCatalog["entities"][number], mode: "normal" | "all" | "generated" = "normal") => {
    const copyId = monsterCopyTargetId(project, entry);
    const template = monsterRecordFromLibraryEntry(entry, copyId);
    const description = scrapbookDescription(entry);
    if (mode === "all") {
      for (const option of MONSTER_SET_OPTIONS) {
        onApplyCommand?.({
          kind: "createMonsterFromTemplate",
          label: `Copy ${scrapbookName(entry)} to ${option.label} Monster ${copyId}`,
          id: copyId,
          template,
          description: option.id === 0 ? description : undefined,
          setId: option.id
        });
      }
      await materializeMonsterLibraryIconOverrides([{ entry, id: copyId, template, description, setId: 0 }], project, catalog, lookups, iconEntries, previewContext, onApplyCommand);
    } else {
      copyMonsterLibraryEntryToScenario(entry, copyId, onApplyCommand);
      await materializeMonsterLibraryIconOverrides([{ entry, id: copyId, template, description }], project, catalog, lookups, iconEntries, previewContext, onApplyCommand);
      if (mode === "generated") {
        onApplyCommand?.({ kind: "generateMonsterVariants", label: `Generate variants for monster ${copyId}`, id: copyId });
      }
    }
    setActiveSetId(0);
    setActivePreview("scenario");
    selectMonster(copyId);
  };
  const replaceScenarioMonsterFromLibraryEntry = async (entry: LibraryCatalog["entities"][number], id: number) => {
    if (!Number.isInteger(id) || id < 0) return;
    const template = monsterRecordFromLibraryEntry(entry, id);
    const description = scrapbookDescription(entry);
    onApplyCommand?.({
      kind: "createMonsterFromTemplate",
      label: `Replace Scenario Monster ${id} from ${scrapbookName(entry)}`,
      id,
      template,
      description,
      setId: 0
    });
    await materializeMonsterLibraryIconOverrides([{ entry, id, template, description, setId: 0 }], project, catalog, lookups, iconEntries, previewContext, onApplyCommand);
    setActiveSetId(0);
    setActivePreview("scenario");
    selectMonster(id);
  };
  const copyLibraryEntryToLibrary = (entry: LibraryCatalog["entities"][number], variant = false) => {
    if (!onUpdateLibraryCatalog) return;
    const template = monsterRecordFromLibraryEntry(entry, preferredMonsterCopyId(project, entry));
    const label = variant ? `${scrapbookName(entry)} Variant` : scrapbookName(entry);
    const originKind = variant ? "library-variant" : isProvidenceMonsterLibraryEntry(entry) ? "library-variant" : "built-in-override";
    const { catalog: nextCatalog, entity } = createMonsterLibraryEntry(catalog, managedLibraryPath, { ...template, displayName: label }, scrapbookDescription(entry), {
      label,
      origin: {
        kind: originKind,
        sourceId: entry.id,
        sourceLabel: scrapbookName(entry)
      },
      preferredScenarioMonsterId: preferredMonsterCopyId(project, entry)
    });
    commitCatalog(nextCatalog, `Copied ${scrapbookName(entry)} to Monster Library`);
    setActivePreview("library");
    setSelectedLibraryId(entity.id);
  };
  const copyScenarioMonsterToLibrary = (monster: MonsterRecord) => {
    if (!onUpdateLibraryCatalog) return;
    const description = project.monsterDescriptions.find((candidate) => candidate.id === monster.id)?.text ?? "";
    const label = monster.displayName?.trim() || `Monster ${monster.id}`;
    const { catalog: nextCatalog, entity } = createMonsterLibraryEntry(catalog, managedLibraryPath, monster, description, {
      label,
      origin: { kind: "scenario-monster", sourceId: `monster:${monster.id}`, sourceLabel: label },
      preferredScenarioMonsterId: monster.id
    });
    commitCatalog(nextCatalog, `Copied ${label} to Monster Library`);
    setActivePreview("library");
    setSelectedLibraryId(entity.id);
  };
  const updateLibraryMonster = (entry: LibraryCatalog["entities"][number], changes: Partial<MonsterRecord>, description?: string) => {
    if (!catalog || !isProvidenceMonsterLibraryEntry(entry)) return;
    const nextCatalog = updateMonsterLibraryEntry(catalog, entry.id, changes, description);
    commitCatalog(nextCatalog, `Updated ${entry.label}`);
  };
  const duplicateLibraryMonster = (entry: LibraryCatalog["entities"][number]) => {
    if (!catalog) {
      copyLibraryEntryToLibrary(entry, true);
      return;
    }
    const result = isProvidenceMonsterLibraryEntry(entry)
      ? duplicateMonsterLibraryEntry(catalog, entry.id)
      : createMonsterLibraryEntry(catalog, managedLibraryPath, monsterRecordFromLibraryEntry(entry, preferredMonsterCopyId(project, entry)), scrapbookDescription(entry), {
        label: `${scrapbookName(entry)} Variant`,
        origin: { kind: "library-variant", sourceId: entry.id, sourceLabel: scrapbookName(entry) },
        preferredScenarioMonsterId: preferredMonsterCopyId(project, entry)
      });
    if (result.entity) {
      commitCatalog(result.catalog, `Created ${result.entity.label}`);
      setActivePreview("library");
      setSelectedLibraryId(result.entity.id);
    }
  };
  const deleteLibraryMonster = (entry: LibraryCatalog["entities"][number]) => {
    if (!catalog || !isProvidenceMonsterLibraryEntry(entry)) return;
    const nextCatalog = deleteMonsterLibraryEntry(catalog, entry.id);
    commitCatalog(nextCatalog, `Deleted ${entry.label}`);
    setSelectedLibraryId(null);
  };
  const startLibraryDrag = (entry: LibraryCatalog["entities"][number], event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(MONSTER_LIBRARY_DRAG_MIME, entry.id);
    event.dataTransfer.setData("text/plain", `${scrapbookIndex(entry)} ${scrapbookName(entry)}`);
  };
  const startScenarioDrag = (monster: MonsterRecord, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(SCENARIO_MONSTER_DRAG_MIME, String(monster.id));
    event.dataTransfer.setData("text/plain", `${monster.id} ${monster.displayName}`);
  };
  const allowScenarioDrop = (event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes(MONSTER_LIBRARY_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setScenarioDropActive(true);
  };
  const leaveScenarioDrop = (event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setScenarioDropActive(false);
  };
  const dropLibraryMonsterToScenario = (event: DragEvent<HTMLElement>) => {
    const entryId = event.dataTransfer.getData(MONSTER_LIBRARY_DRAG_MIME);
    const entry = libraryEntries.find((candidate) => candidate.id === entryId);
    setScenarioDropActive(false);
    if (!entry) return;
    event.preventDefault();
    void copyLibraryEntryToScenario(entry);
  };
  const allowLibraryDrop = (event: DragEvent<HTMLElement>) => {
    const types = Array.from(event.dataTransfer.types);
    if (!types.includes(MONSTER_LIBRARY_DRAG_MIME) && !types.includes(SCENARIO_MONSTER_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setLibraryDropActive(true);
  };
  const leaveLibraryDrop = (event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setLibraryDropActive(false);
  };
  const dropMonsterToLibrary = (event: DragEvent<HTMLElement>) => {
    setLibraryDropActive(false);
    const scenarioId = Number(event.dataTransfer.getData(SCENARIO_MONSTER_DRAG_MIME));
    if (Number.isInteger(scenarioId)) {
      const monster =
        monsterForSet(lookups, activeSetId, scenarioId)
        ?? monsterForSet(lookups, 0, scenarioId)
        ?? monsterForSet(lookups, 1, scenarioId)
        ?? monsterForSet(lookups, -1, scenarioId);
      if (monster) {
        event.preventDefault();
        copyScenarioMonsterToLibrary(monster);
        return;
      }
    }
    const entryId = event.dataTransfer.getData(MONSTER_LIBRARY_DRAG_MIME);
    const entry = libraryEntries.find((candidate) => candidate.id === entryId);
    if (entry) {
      event.preventDefault();
      duplicateLibraryMonster(entry);
    }
  };
  const activeSetIds = useMemo(() => new Set(monstersForSet(lookups, activeSetId).map((monster) => monster.id)), [activeSetId, lookups]);
  const normalVariantSourceIds = useMemo(
    () => (project.monsters ?? [])
      .filter((monster) => monster.id > 0 && !isBlankMonsterSlot(monster))
      .map((monster) => monster.id)
      .sort((left, right) => left - right),
    [project.monsters]
  );
  const replaceScenarioId = selectedId !== null && scenarioEntries.some((entry) => entry.id === selectedId) ? selectedId : null;
  const selectedSetTools = selectedId !== null ? (
    <MonsterSetToolbar
      activeSetId={activeSetId}
      selectedId={selectedId}
      selectedRecord={selected}
      normalRecord={selectedNormal}
      availableIds={activeSetIds}
      battleReferenceCount={selectedBattleReferences.length}
      generateAllCount={normalVariantSourceIds.length}
      onSetIdChange={setActiveSetId}
      onToggleNotOnMenu={(notOnMenu) => {
        if (selectedId === null || !selectedNormal) return;
        update(selectedId, { notOnMenu }, 0);
      }}
      onCreateFromNormal={() => {
        if (selectedId === null || activeSetId === 0) return;
        onApplyCommand?.({ kind: "createMonsterVariantFromNormal", label: `Create ${monsterSetLabel(activeSetId)} monster ${selectedId} from Normal`, id: selectedId, setId: activeSetId });
      }}
      onCopyToAll={() => {
        if (selectedId === null || !selected) return;
        onApplyCommand?.({ kind: "copyCurrentMonsterToAllSets", label: `Copy ${monsterSetLabel(activeSetId)} monster ${selectedId} to all sets`, id: selectedId, sourceSetId: activeSetId });
      }}
      onGenerate={() => {
        if (selectedId === null || !selectedNormal) return;
        onApplyCommand?.({ kind: "generateMonsterVariants", label: `Generate monster variants for ${selectedId}`, id: selectedId });
      }}
      onGenerateAll={() => {
        if (normalVariantSourceIds.length === 0) return;
        onApplyCommand?.({ kind: "generateMonsterVariantsForAll", label: `Generate variants for ${normalVariantSourceIds.length} scenario monsters`, ids: normalVariantSourceIds });
      }}
      onSwitch={(toId) => {
        if (selectedId === null) return;
        const affected = [
          ...battleReferencesForId(selectedId),
          ...battleReferencesForId(toId)
        ];
        if (affected.length > 0) {
          setPendingBattleRepair({ kind: "switch", fromId: selectedId, toId, setId: activeSetId });
          return;
        }
        applySwitchMonsterRecords(selectedId, toId, activeSetId);
      }}
    />
  ) : null;
  const pendingRepairReferences = useMemo(() => {
    if (!pendingBattleRepair) return [];
    if (pendingBattleRepair.kind === "clear") return battleReferencesForId(pendingBattleRepair.monsterId);
    return [
      ...battleReferencesForId(pendingBattleRepair.fromId),
      ...battleReferencesForId(pendingBattleRepair.toId)
    ];
  }, [battleReferenceLookup, pendingBattleRepair]);
  const repairReplacementIds = useMemo(
    () => scenarioIds.filter((id) => id > 0 && id !== (pendingBattleRepair?.kind === "clear" ? pendingBattleRepair.monsterId : 0)),
    [pendingBattleRepair, scenarioIds]
  );
  const closeBattleRepair = () => setPendingBattleRepair(null);
  const applyClearRepair = (mode: "keep" | "clear" | "replace", replacementId = 0) => {
    if (!pendingBattleRepair || pendingBattleRepair.kind !== "clear") return;
    const { monsterId, setId } = pendingBattleRepair;
    if (mode === "clear") {
      onApplyCommand?.({ kind: "rewriteBattleMonsterReferences", label: `Clear battle placements for monster ${monsterId}`, rewrite: { mode: "clear", monsterId } });
    } else if (mode === "replace" && replacementId > 0) {
      onApplyCommand?.({ kind: "rewriteBattleMonsterReferences", label: `Replace battle monster ${monsterId} with ${replacementId}`, rewrite: { mode: "replace", fromId: monsterId, toId: replacementId } });
    }
    applyClearScenarioMonster(monsterId, setId);
    closeBattleRepair();
  };
  const applySwitchRepair = (swapBattleCells: boolean) => {
    if (!pendingBattleRepair || pendingBattleRepair.kind !== "switch") return;
    const { fromId, toId, setId } = pendingBattleRepair;
    applySwitchMonsterRecords(fromId, toId, setId);
    if (swapBattleCells) {
      onApplyCommand?.({ kind: "rewriteBattleMonsterReferences", label: `Swap battle monster IDs ${fromId} and ${toId}`, rewrite: { mode: "swap", fromId, toId } });
    }
    closeBattleRepair();
  };

  return (
    <>
    <div className="combat-record-layout monster-combined-layout">
      <div className="monster-source-lists">
        <aside
          className={`combat-record-list scrapbook-list combined-scrapbook-list${libraryDropActive ? " drop-active" : ""}`}
          aria-label="Monster Library entries"
          onDragOver={allowLibraryDrop}
          onDragEnter={allowLibraryDrop}
          onDragLeave={leaveLibraryDrop}
          onDrop={dropMonsterToLibrary}
        >
          <header className="monster-list-header">
            <div className="monster-list-heading-row">
              <strong className="combat-pane-title">Monster Library</strong>
              <div className="monster-list-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => setPopulateMenuOpen((open) => !open)}
                >
                  Populate Scenario...
                </button>
              </div>
            </div>
            {populateMenuOpen ? (
              <div className="monster-populate-menu" role="menu" aria-label="Populate scenario from monster library">
                <button type="button" className="btn btn-secondary btn-xs" onClick={populateStockMonsters}>
                  Copy Stock Monsters
                  <small>Fill missing built-in IDs.</small>
                </button>
                <button type="button" className="btn btn-secondary btn-xs" onClick={populateVisibleLibrary} disabled={filteredLibrary.length === 0}>
                  Copy Visible Library
                  <small>{filteredLibrary.length} visible entr{filteredLibrary.length === 1 ? "y" : "ies"}.</small>
                </button>
                <button type="button" className="btn btn-secondary btn-xs" onClick={populateCustomLibrary} disabled={!libraryEntries.some(isProvidenceMonsterLibraryEntry)}>
                  Copy Custom Library
                  <small>Providence entries only.</small>
                </button>
              </div>
            ) : null}
          </header>
          <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.currentTarget.value)} placeholder="Search monster library..." />
          <div className="combat-record-scroll">
            {filteredLibrary.map((entry) => {
              const custom = isProvidenceMonsterLibraryEntry(entry);
              const librarySelectionActive = activePreview === "library";
              const selectedForCopy = librarySelectionActive && selectedLibraryIds.includes(entry.id);
              const selectedLibraryEntry = librarySelectionActive && entry.id === selectedLibrary?.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  draggable
                  className={`${selectedLibraryEntry ? "selected" : ""}${selectedForCopy ? " multi-selected" : ""}`}
                  aria-selected={selectedForCopy}
                  onClick={(event) => selectLibraryMonster(entry, event)}
                  onDragStart={(event) => startLibraryDrag(entry, event)}
                  onDragEnd={() => {
                    setScenarioDropActive(false);
                    setLibraryDropActive(false);
                  }}
                >
                  <ScrapbookMonsterIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} compact />
                  <span>
                    <strong>{scrapbookName(entry)}</strong>
                    <small>{custom ? "Providence library" : "Built-in"} | {scrapbookFacts(entry)}</small>
                    {selectedForCopy && selectedLibraryIds.length > 1 ? <small className="monster-selected-badge">Selected for copy</small> : null}
                  </span>
                </button>
              );
            })}
            {filteredLibrary.length === 0 && <p className="empty-copy compact">No library monsters match that search.</p>}
          </div>
        </aside>

        <aside
          className={`combat-record-list scenario-monster-list${scenarioDropActive ? " drop-active" : ""}`}
          aria-label="Scenario monster records"
          onDragOver={allowScenarioDrop}
          onDragEnter={allowScenarioDrop}
          onDragLeave={leaveScenarioDrop}
          onDrop={dropLibraryMonsterToScenario}
        >
          <header className="monster-list-header">
            <div className="monster-list-heading-row">
              <strong className="combat-pane-title">Scenario Monsters</strong>
              <div className="monster-list-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={() => {
                    onApplyCommand?.({ kind: "createTargetRecord", label: "Create monster", recordType: "monster", id: nextMonsterId });
                    selectScenarioMonster(nextMonsterId);
                  }}
                >
                  New Monster {nextMonsterId}
                </button>
              </div>
            </div>
          </header>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search scenario monsters..." />
          <div className="combat-record-scroll">
            {filtered.map((entry) => (
              <ScenarioMonsterRow
                key={entry.id}
                entry={entry}
                activeSetId={activeSetId}
                selected={activePreview === "scenario" && selectedId === entry.id}
                iconEntries={iconEntries}
                project={project}
                lookups={lookups}
                previewContext={previewContext}
                onSelect={selectScenarioMonster}
                onDragStart={startScenarioDrag}
                onDragEnd={() => setLibraryDropActive(false)}
              />
            ))}
            {filtered.length === 0 && <p className="empty-copy compact">No scenario monsters match that search.</p>}
          </div>
        </aside>
      </div>

      {activePreview === "library" && multiSelectedLibraryEntries.length > 1 ? (
        <MonsterLibraryMultiSelection
          entries={multiSelectedLibraryEntries}
          project={project}
          onCopy={() => void copyLibraryEntriesToScenario(multiSelectedLibraryEntries, `Copy ${multiSelectedLibraryEntries.length} selected library monsters to scenario`)}
          onClear={clearLibraryMultiSelection}
        />
      ) : activePreview === "library" && selectedLibrary && selectedLibraryTemplate ? (
        <MonsterEditor
          project={project}
          catalog={catalog}
          monster={selectedLibraryTemplate}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          description={monsterLibraryEntryDescription(selectedLibrary)}
          duplicateLabel="New Variant"
          clearLabel={monsterLibraryOrigin(selectedLibrary).kind === "built-in-override" ? "Restore Scrapbook Default" : "Delete Library Entry"}
          onUpdate={(changes) => updateLibraryMonster(selectedLibrary, changes)}
          onUpdateDescription={(text) => updateLibraryMonster(selectedLibrary, {}, text)}
          onReplaceScenario={replaceScenarioId !== null ? () => void replaceScenarioMonsterFromLibraryEntry(selectedLibrary, replaceScenarioId) : undefined}
          replaceLabel={replaceScenarioId !== null ? `Replace Scenario ${replaceScenarioId}` : undefined}
          onDuplicate={() => duplicateLibraryMonster(selectedLibrary)}
          onClear={() => deleteLibraryMonster(selectedLibrary)}
        />
      ) : activePreview === "library" && selectedLibrary ? (
        <ScrapbookMonsterPreview
          entry={selectedLibrary}
          project={project}
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          copyId={monsterCopyTargetId(project, selectedLibrary)}
          onCopy={() => void copyLibraryEntryToScenario(selectedLibrary)}
          onCopyAll={() => void copyLibraryEntryToScenario(selectedLibrary, "all")}
          onCopyGenerated={() => void copyLibraryEntryToScenario(selectedLibrary, "generated")}
          onReplaceScenario={replaceScenarioId !== null ? () => void replaceScenarioMonsterFromLibraryEntry(selectedLibrary, replaceScenarioId) : undefined}
          replaceId={replaceScenarioId}
          onCustomize={() => copyLibraryEntryToLibrary(selectedLibrary)}
          onCopyVariant={() => copyLibraryEntryToLibrary(selectedLibrary, true)}
        />
      ) : selected ? (
        <MonsterEditor
          project={project}
          catalog={catalog}
          monster={selected}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          description={selectedDescription}
          headerMeta={selectedSetTools}
          onUpdate={(changes) => update(selected.id, changes, activeSetId)}
          onUpdateDescription={(text) => onApplyCommand?.({ kind: "upsertMonsterDescription", label: `Update monster ${selected.id} description`, id: selected.id, text })}
          onCopyToLibrary={() => copyScenarioMonsterToLibrary(selected)}
          onOpenIconSet={onSelectIconSetTab}
          onDuplicate={() => {
            const id = nextMonsterId;
            update(id, { ...selected, id, displayName: `${selected.displayName || `Monster ${selected.id}`} Copy` }, activeSetId);
            selectMonster(id);
          }}
          clearLabel="Clear Selection"
          onClear={() => clearScenarioMonster(selected, activeSetId)}
        />
      ) : activePreview === "scenario" && selectedId !== null ? (
        <MissingMonsterSetEditor
          id={selectedId}
          setId={activeSetId}
          normalRecord={selectedNormal}
          headerMeta={selectedSetTools}
          onCreate={() => {
            if (activeSetId === 0) return;
            onApplyCommand?.({ kind: "createMonsterVariantFromNormal", label: `Create ${monsterSetLabel(activeSetId)} monster ${selectedId} from Normal`, id: selectedId, setId: activeSetId });
          }}
        />
      ) : (
        <EmptyCombatEditor title="No monster selected" body="Create a scenario monster, select a scenario monster to edit, or select a Monster Library entry to preview and copy." />
      )}
    </div>
    {pendingBattleRepair ? (
      <BattleReferenceRepairDialog
        action={pendingBattleRepair}
        references={pendingRepairReferences}
        replacementIds={repairReplacementIds}
        onCancel={closeBattleRepair}
        onClearOnly={() => applyClearRepair("keep")}
        onClearPlacements={() => applyClearRepair("clear")}
        onReplacePlacements={(replacementId) => applyClearRepair("replace", replacementId)}
        onSwitchRecordsOnly={() => applySwitchRepair(false)}
        onSwitchAndSwapCells={() => applySwitchRepair(true)}
      />
    ) : null}
    </>
  );
}

type ScenarioMonsterRowProps = {
  entry: ScenarioMonsterListEntry;
  activeSetId: MonsterSetId;
  selected: boolean;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelect: (id: number) => void;
  onDragStart: (monster: MonsterRecord, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
};

const ScenarioMonsterRow = memo(function ScenarioMonsterRow({
  entry,
  activeSetId,
  selected,
  iconEntries,
  project,
  lookups,
  previewContext,
  onSelect,
  onDragStart,
  onDragEnd
}: ScenarioMonsterRowProps) {
  const monster = entry.fallback;
  if (!monster) return null;
  return (
    <button
      type="button"
      draggable
      className={selected ? "selected" : ""}
      onClick={() => onSelect(entry.id)}
      onDragStart={(event) => onDragStart(monster, event)}
      onDragEnd={onDragEnd}
    >
      <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} compact />
      <span>
        <strong>{monster.displayName || `Monster ${entry.id}`}</strong>
        <small>{monsterFacts(monster)}</small>
        <MonsterSetBadges entry={entry} activeSetId={activeSetId} />
      </span>
    </button>
  );
}, areScenarioMonsterRowPropsEqual);

function areScenarioMonsterRowPropsEqual(previous: ScenarioMonsterRowProps, next: ScenarioMonsterRowProps) {
  return previous.entry === next.entry
    && previous.activeSetId === next.activeSetId
    && previous.selected === next.selected
    && previous.iconEntries === next.iconEntries
    && previous.lookups === next.lookups
    && samePreviewContextInputs(previous.previewContext, next.previewContext)
    && sameProjectIconInputs(previous.project, next.project);
}

function BattleReferenceRepairDialog({
  action,
  references,
  replacementIds,
  onCancel,
  onClearOnly,
  onClearPlacements,
  onReplacePlacements,
  onSwitchRecordsOnly,
  onSwitchAndSwapCells
}: {
  action: PendingBattleReferenceRepair;
  references: BattleMonsterReference[];
  replacementIds: number[];
  onCancel: () => void;
  onClearOnly: () => void;
  onClearPlacements: () => void;
  onReplacePlacements: (replacementId: number) => void;
  onSwitchRecordsOnly: () => void;
  onSwitchAndSwapCells: () => void;
}) {
  const [replacementId, setReplacementId] = useState(replacementIds[0] ?? 0);
  const battleCount = new Set(references.map((reference) => reference.battleId)).size;
  const referenceSummary = references.slice(0, 8);
  return (
    <div className="battle-reference-repair-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="battle-reference-repair-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Battle reference repair"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <strong>Battle References</strong>
          <button type="button" className="btn btn-secondary btn-xs btn-icon" aria-label="Close battle reference repair" onClick={onCancel}>
            <X size={14} />
          </button>
        </header>
        <p>
          {references.length} placed battle cell{references.length === 1 ? "" : "s"} across {battleCount} battle{battleCount === 1 ? "" : "s"} reference {action.kind === "clear" ? `monster ${action.monsterId}` : `monster ${action.fromId} or ${action.toId}`}.
          Data BD stores raw monster IDs shared by Normal, Monster, and Mega sets.
        </p>
        <div className="battle-reference-repair-list">
          {referenceSummary.map((reference) => (
            <small key={`${reference.battleId}:${reference.slot}`}>
              Battle {reference.battleId}, cell {reference.col}, {reference.row}
              {reference.forcedFriendly ? " | Force Friends" : ""}
            </small>
          ))}
          {references.length > referenceSummary.length ? <small>+{references.length - referenceSummary.length} more placement{references.length - referenceSummary.length === 1 ? "" : "s"}</small> : null}
        </div>
        {action.kind === "clear" ? (
          <>
            <label className="combat-field battle-reference-replacement">
              <span>Replace With</span>
              <select value={String(replacementId)} onChange={(event) => setReplacementId(Number(event.currentTarget.value))}>
                {replacementIds.map((id) => (
                  <option key={id} value={id}>Monster {id}</option>
                ))}
              </select>
            </label>
            <div className="battle-reference-repair-actions">
              <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
              <button type="button" className="btn btn-danger btn-xs" onClick={onClearPlacements}>Clear Battle Placements</button>
              <button type="button" className="btn btn-secondary btn-xs" disabled={!replacementId} onClick={() => onReplacePlacements(replacementId)}>Replace Placements</button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={onClearOnly}>Clear Monster Only</button>
            </div>
          </>
        ) : (
          <div className="battle-reference-repair-actions">
            <button type="button" className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={onSwitchRecordsOnly}>Switch Records Only</button>
            <button type="button" className="btn btn-primary btn-xs" onClick={onSwitchAndSwapCells}>Also Swap Battle Cell IDs</button>
          </div>
        )}
      </section>
    </div>
  );
}

function MonsterLibraryMultiSelection({
  entries,
  project,
  onCopy,
  onClear
}: {
  entries: LibraryCatalog["entities"][number][];
  project: Project;
  onCopy: () => void;
  onClear: () => void;
}) {
  const used = new Set(monsterScenarioIds(project));
  const plans = entries.map((entry) => {
    const preferred = preferredMonsterCopyId(project, entry);
    const occupied = preferred > 0 && used.has(preferred);
    const id = preferred > 0 && !occupied
      ? preferred
      : nextAvailableMonsterRecordId([...used].map((candidate) => ({ id: candidate })));
    used.add(id);
    return { entry, id, occupied };
  });
  return (
    <section className="combat-editor monster-multi-selection">
      <header className="combat-editor-header monster-editor-title-header">
        <span className="combat-pane-title">Selected Monsters</span>
        <div className="combat-editor-actions">
          <button type="button" className="btn btn-primary btn-xs" onClick={onCopy}>Copy Selected To Scenario</button>
          <button type="button" className="btn btn-secondary btn-xs" onClick={onClear}>Clear Selection</button>
        </div>
      </header>
      <p className="empty-copy compact">{entries.length} monster library entries selected. Copying uses preferred IDs when empty, then the next open scenario monster slot.</p>
      <div className="monster-selection-list">
        {plans.map(({ entry, id, occupied }) => (
          <div key={entry.id} className="monster-selection-row">
            <span>
              <strong>{scrapbookName(entry)}</strong>
              <small>{isProvidenceMonsterLibraryEntry(entry) ? "Providence library" : "Built-in"} | {scrapbookFacts(entry)}</small>
            </span>
            <span className={occupied ? "copy-target shifted" : "copy-target"}>
              Monster {id}
              {occupied ? <small>preferred occupied</small> : <small>preferred slot</small>}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MonsterSetBadges({
  entry,
  activeSetId
}: {
  entry: { normal: MonsterRecord | null; monster: MonsterRecord | null; mega: MonsterRecord | null };
  activeSetId: MonsterSetId;
}) {
  return (
    <span className="monster-set-badges" aria-label="Monster set availability">
      {MONSTER_SET_OPTIONS.map((option) => {
        const available = option.id === 0 ? Boolean(entry.normal) : option.id === 1 ? Boolean(entry.monster) : Boolean(entry.mega);
        return (
          <span key={option.id} className={`${available ? "available" : "missing"}${activeSetId === option.id ? " active" : ""}`}>
            {option.label}
          </span>
        );
      })}
    </span>
  );
}

function MonsterSetToolbar({
  activeSetId,
  selectedId,
  selectedRecord,
  normalRecord,
  availableIds,
  battleReferenceCount,
  generateAllCount,
  onSetIdChange,
  onToggleNotOnMenu,
  onCreateFromNormal,
  onCopyToAll,
  onGenerate,
  onGenerateAll,
  onSwitch
}: {
  activeSetId: MonsterSetId;
  selectedId: number;
  selectedRecord: MonsterRecord | null;
  normalRecord: MonsterRecord | null;
  availableIds: Set<number>;
  battleReferenceCount: number;
  generateAllCount: number;
  onSetIdChange: (setId: MonsterSetId) => void;
  onToggleNotOnMenu: (notOnMenu: boolean) => void;
  onCreateFromNormal: () => void;
  onCopyToAll: () => void;
  onGenerate: () => void;
  onGenerateAll: () => void;
  onSwitch: (toId: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [generatePreviewOpen, setGeneratePreviewOpen] = useState(false);
  const [generateAllPreviewOpen, setGenerateAllPreviewOpen] = useState(false);
  const targetId = Number(draft);
  const canSwitch = Number.isInteger(targetId) && targetId >= 0 && targetId !== selectedId && availableIds.has(targetId);
  const generateRows = normalRecord ? monsterGeneratePreviewRows(normalRecord) : [];
  const statusText = monsterSetToolbarStatus(activeSetId, selectedRecord);
  useEffect(() => {
    setDraft("");
    setGeneratePreviewOpen(false);
    setGenerateAllPreviewOpen(false);
  }, [activeSetId, selectedId]);
  return (
    <div className="monster-set-toolbar">
      <div className="monster-set-primary-row">
        <div
          className="monster-set-segmented"
          role="group"
          aria-label="Monster Set"
          title="Normal = Data MD, Monster = Data MD1, Mega = Data MD-1"
        >
          {MONSTER_SET_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`combat-toggle${activeSetId === option.id ? " active" : ""}`}
              onClick={() => onSetIdChange(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="combat-check-field monster-bestiary-check">
          <FieldLabel label="Hide From Bestiary" help="Realmz rebuilds the player bestiary from Normal/Data MD only. Battles still place this scenario monster by Data BD monster ID." />
          <input
            type="checkbox"
            checked={Boolean(normalRecord?.notOnMenu)}
            disabled={!normalRecord}
            onChange={(event) => onToggleNotOnMenu(event.currentTarget.checked)}
          />
        </label>
      </div>
      {battleReferenceCount > 0 ? (
        <small className="monster-battle-reference-note">Used in {battleReferenceCount} battle placement{battleReferenceCount === 1 ? "" : "s"}</small>
      ) : null}
      {statusText ? <small className="monster-set-status">{statusText}</small> : null}
      <div className="monster-set-actions">
        {activeSetId !== 0 && !selectedRecord && normalRecord ? (
          <button type="button" className="btn btn-primary btn-xs" onClick={onCreateFromNormal}>Create From Normal</button>
        ) : null}
        {selectedRecord ? <button type="button" className="btn btn-secondary btn-xs" onClick={onCopyToAll}>Copy To All Sets</button> : null}
        {normalRecord ? <button type="button" className="btn btn-secondary btn-xs" onClick={() => setGeneratePreviewOpen((open) => !open)}>Generate Variants</button> : null}
        <button type="button" className="btn btn-secondary btn-xs" disabled={generateAllCount === 0} onClick={() => setGenerateAllPreviewOpen((open) => !open)}>Generate Variants For All</button>
        <label className="monster-switch-with">
          <span>Switch With</span>
          <input type="number" value={draft} onChange={(event) => setDraft(event.currentTarget.value)} />
          <button type="button" className="btn btn-secondary btn-xs" disabled={!canSwitch} onClick={() => canSwitch && onSwitch(targetId)}>
            Switch
          </button>
        </label>
      </div>
      {generatePreviewOpen ? (
        <div className="monster-generate-preview">
          <small>
            This replaces Monster and Mega variants for ID {selectedId}. Semantic fields stay copied from Normal; Providence scales strength fields and clamps values instead of emulating Divinity overflow.
          </small>
          <div className="monster-generate-preview-table" role="table" aria-label="Generate variant field preview">
            <div role="row" className="monster-generate-preview-row head">
              <span role="columnheader">Field</span>
              <span role="columnheader">Normal</span>
              <span role="columnheader">Monster</span>
              <span role="columnheader">Mega</span>
            </div>
            {generateRows.map((row) => (
              <div role="row" className="monster-generate-preview-row" key={row.label}>
                <span role="cell">{row.label}</span>
                <span role="cell">{row.normal}</span>
                <span role="cell" className={row.monsterChanged ? "changed" : ""}>{row.monster}</span>
                <span role="cell" className={row.megaChanged ? "changed" : ""}>{row.mega}</span>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-primary btn-xs" onClick={onGenerate}>Apply Generate Variants</button>
        </div>
      ) : null}
      {generateAllPreviewOpen ? (
        <div className="monster-generate-preview">
          <small>
            This replaces Monster and Mega variants for {generateAllCount} active Normal scenario monster{generateAllCount === 1 ? "" : "s"}. Blank Normal slots are skipped.
          </small>
          <button type="button" className="btn btn-primary btn-xs" disabled={generateAllCount === 0} onClick={onGenerateAll}>Apply Generate Variants For All</button>
        </div>
      ) : null}
    </div>
  );
}

function monsterSetToolbarStatus(setId: MonsterSetId, selectedRecord: MonsterRecord | null) {
  if (!selectedRecord) return `${monsterSetFile(setId)} missing`;
  if (isBlankMonsterSlot(selectedRecord)) return `${monsterSetFile(setId)} blank`;
  return "";
}

function isBlankMonsterSlot(record: MonsterRecord) {
  return record.hitDice === 0
    && record.agility === 0
    && record.movementMax === 0
    && record.attackCount === 0
    && (record.displayName ?? "").trim() === ""
    && Array.isArray(record.rawBytes)
    && record.rawBytes.length === MONSTER_RECORD_BYTES
    && record.rawBytes.every((value) => value === 0);
}

function MissingMonsterSetEditor({
  id,
  setId,
  normalRecord,
  headerMeta,
  onCreate
}: {
  id: number;
  setId: MonsterSetId;
  normalRecord: MonsterRecord | null;
  headerMeta?: ReactNode;
  onCreate: () => void;
}) {
  return (
    <article className="combat-editor monster-editor scenario-monster-editor missing-monster-set-editor">
      <header className="combat-editor-header monster-editor-title-header">
        <span className="combat-pane-title">{monsterSetLabel(setId)} Monster {id}</span>
        {headerMeta ? <div className="monster-editor-header-meta">{headerMeta}</div> : null}
      </header>
      <section className="monster-section">
        <header><strong>Missing {monsterSetLabel(setId)} Variant</strong><small>{monsterSetFile(setId)} has no record for monster ID {id}.</small></header>
        {setId === 0 ? (
          <p className="empty-copy compact">Create or copy a Normal scenario monster before editing this runtime ID.</p>
        ) : normalRecord ? (
          <div className="empty-copy compact">
            <p>This set can be created from Normal Monster {id}. Descriptions remain shared by monster ID across all monster sets.</p>
            <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>Create {monsterSetLabel(setId)} From Normal</button>
          </div>
        ) : (
          <p className="empty-copy compact">Normal Monster {id} is also missing, so Providence cannot seed this variant safely.</p>
        )}
      </section>
    </article>
  );
}

function ScrapbookMonsterPreview({
  entry,
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  copyId,
  onCopy,
  onCopyAll,
  onCopyGenerated,
  onReplaceScenario,
  replaceId,
  onCustomize,
  onCopyVariant
}: {
  entry: LibraryCatalog["entities"][number];
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  copyId: number;
  onCopy: () => void;
  onCopyAll?: () => void;
  onCopyGenerated?: () => void;
  onReplaceScenario?: () => void;
  replaceId?: number | null;
  onCustomize?: () => void;
  onCopyVariant?: () => void;
}) {
  const description = scrapbookDescription(entry);
  return (
    <article className="combat-editor monster-editor scrapbook-monster-preview">
      <header className="combat-editor-header monster-editor-title-header">
        <span className="combat-pane-title">{scrapbookName(entry)}</span>
        <div className="combat-editor-actions">
          {onCustomize ? (
            <button type="button" className="btn btn-secondary btn-xs" title="Create an editable override for this protected built-in template" onClick={onCustomize}>
              Customize
            </button>
          ) : null}
          {onCopyVariant ? (
            <button type="button" className="btn btn-secondary btn-xs" title="Create an editable Providence library variant" onClick={onCopyVariant}>
              Copy To Library Variant
            </button>
          ) : null}
          <button type="button" className="btn btn-primary btn-xs" title={`Copy to Scenario Monster ${copyId}`} onClick={onCopy}>
            Copy To Scenario
          </button>
          {onReplaceScenario && replaceId != null ? (
            <button type="button" className="btn btn-danger btn-xs" title={`Explicitly replace occupied Scenario Monster ${replaceId}`} onClick={onReplaceScenario}>
              Replace Scenario {replaceId}
            </button>
          ) : null}
          {onCopyAll ? <button type="button" className="btn btn-primary btn-xs" title="Copy exact records to Normal, Monster, and Mega scenario sets" onClick={onCopyAll}>Copy To All Sets</button> : null}
          {onCopyGenerated ? <button type="button" className="btn btn-primary btn-xs" title="Copy Normal, then generate Monster and Mega variants with Providence scaling" onClick={onCopyGenerated}>Copy And Generate Variants</button> : null}
        </div>
      </header>
      <section className="scrapbook-summary scrapbook-description-summary">
        <ScrapbookMonsterIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} />
        <div className="scrapbook-description-card">
          <header><strong>Description</strong><small>Copied to Data DES when this built-in monster is copied.</small></header>
          <p className="scrapbook-description">{description || "No description."}</p>
        </div>
      </section>
      <div className="scrapbook-stat-attack-row">
        <section className="monster-section scrapbook-stat-section">
          <header><strong>Stats</strong><small>Read-only preview.</small></header>
          <div className="scrapbook-stat-grid">
            <ScrapbookFact label="Hit Dice" value={summaryNumber(entry, "hitDice")} />
            <ScrapbookFact label="Armor" value={summaryNumber(entry, "armor")} />
            <ScrapbookFact label="Agility" value={summaryNumber(entry, "agility")} />
            <ScrapbookFact label="Movement" value={summaryNumber(entry, "movementMax")} />
            <ScrapbookFact label="Attacks" value={summaryNumber(entry, "attackCount")} />
            <ScrapbookFact label="Magic Attacks" value={summaryNumber(entry, "magicAttackCount")} />
            <ScrapbookFact label="Spell Points" value={summaryNumber(entry, "spellPoints")} />
            <ScrapbookFact label="Experience" value={summaryNumber(entry, "exp")} />
          </div>
        </section>
        <section className="monster-section scrapbook-attack-section">
          <header><strong>Attacks</strong><small>Read-only Realmz monster rows.</small></header>
          <div className="scrapbook-attack-table">
            <div className="scrapbook-attack-table-head">
              <span>Attack</span>
              <span>Damage</span>
              <span>Form</span>
              <span>Special</span>
            </div>
            {summaryNumberRows(entry, "attacks").map((attack, index) => (
              <div key={index} className="scrapbook-attack-table-row">
                <strong>Attack {index + 1}</strong>
                <span>{attack[0] ?? 0}-{attack[1] ?? 0}</span>
                <span>{attack[2] ?? 0}</span>
                <span>{attack[3] ?? 0}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="monster-section scrapbook-loot-section">
        <header><strong>Spells And Loot</strong><small>IDs preserved from the library record.</small></header>
        <div className="scrapbook-pill-grid">
          <ScrapbookSpellList
            values={summaryNumberArray(entry, "spells")}
            project={project}
            catalog={catalog}
            iconEntries={iconEntries}
            lookups={lookups}
            previewContext={previewContext}
          />
          <ScrapbookItemList
            values={summaryNumberArray(entry, "items")}
            project={project}
            catalog={catalog}
            iconEntries={iconEntries}
            lookups={lookups}
            previewContext={previewContext}
          />
          <ScrapbookMoneyList
            values={summaryNumberArray(entry, "money")}
            iconEntries={iconEntries}
            catalog={catalog}
            lookups={lookups}
            previewContext={previewContext}
          />
        </div>
      </section>
    </article>
  );
}

function MonsterEditor({
  project,
  catalog,
  monster,
  iconEntries,
  lookups,
  previewContext,
  description,
  headerMeta,
  onUpdate,
  onUpdateDescription,
  onCopyToLibrary,
  onReplaceScenario,
  onOpenIconSet,
  onDuplicate,
  onClear,
  duplicateLabel = "Duplicate",
  replaceLabel = "Replace Scenario",
  clearLabel = "Clear To Defaults"
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  description: string;
  headerMeta?: ReactNode;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
  onUpdateDescription: (text: string) => void;
  onCopyToLibrary?: () => void;
  onReplaceScenario?: () => void;
  onOpenIconSet?: () => void;
  onDuplicate: () => void;
  onClear?: () => void;
  duplicateLabel?: string;
  replaceLabel?: string;
  clearLabel?: string;
}) {
  useCombatRenderTiming("MonsterEditor");
  const [detailsMonsterId, setDetailsMonsterId] = useState<number | null>(null);
  const detailsReady = detailsMonsterId === monster.id;
  useEffect(() => {
    setDetailsMonsterId(null);
    const timer = window.setTimeout(() => setDetailsMonsterId(monster.id), 450);
    return () => window.clearTimeout(timer);
  }, [monster.id]);
  return (
    <article className="combat-editor monster-editor scenario-monster-editor">
      <header className="combat-editor-header monster-editor-title-header monster-record-editor-header">
        <div className="combat-editor-actions monster-editor-record-actions">
          {onCopyToLibrary ? <button type="button" className="btn btn-secondary btn-xs" onClick={onCopyToLibrary}>Copy To Library</button> : null}
          {onReplaceScenario ? <button type="button" className="btn btn-danger btn-xs" title="Explicitly replace the selected Normal scenario monster slot" onClick={onReplaceScenario}>{replaceLabel}</button> : null}
          <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicate}>{duplicateLabel}</button>
          {onClear ? <button type="button" className="btn btn-danger btn-xs" onClick={onClear}>{clearLabel}</button> : null}
        </div>
        {headerMeta ? <div className="monster-editor-header-meta">{headerMeta}</div> : null}
      </header>
      <div className="monster-editor-section-grid monster-editor-identity-description-grid">
        <section className="monster-section monster-identity-section">
          <MonsterIconControl
            monster={monster}
            iconEntries={iconEntries}
            project={project}
            lookups={lookups}
            previewContext={previewContext}
            onCommit={(iconId) => onUpdate({ iconId })}
            onOpenIconSet={onOpenIconSet}
          />
          <div className="monster-field-grid">
            <TextField label="Monster Name" value={monster.displayName} onCommit={(displayName) => onUpdate({ displayName })} />
            <MacroReferenceField project={project} value={monster.deathMacro} onCommit={(deathMacro) => onUpdate({ deathMacro })} />
          </div>
        </section>
        <section className="monster-section monster-description-section">
          <SectionHeader title="Monster Description" help="Data DES bestiary/scrapbook text." />
          <TextAreaField label="Description" value={description} placeholder="No monster description." onCommit={onUpdateDescription} />
        </section>
      </div>
      <div className="monster-editor-section-grid monster-editor-primary-grid">
        <MonsterNumberSection
          title="Combat Stats"
          className="monster-compact-number-section"
          monster={monster}
          fields={[
            ["Stamina Level", "hitDice"],
            ["Bonus Stamina", "staminaBonus"],
            ["Agility", "agility"],
            ["Move Max", "movementMax"],
            ["Armor Rating", "armor"],
            ["Magic Resist %", "magicResistance"],
            ["Magic + Required To Hit", "magicToHit"],
            ["Victory Points", "exp"],
            ["Spell Points", "spellPoints"],
            ["Max Spell Points", "maxSpellPoints"]
          ]}
          onUpdate={onUpdate}
        />
        <MonsterBehaviorSection
          project={project}
          catalog={catalog}
          monster={monster}
          onUpdate={onUpdate}
        />
      </div>
      {detailsReady ? (
        <>
          <div className="monster-editor-section-grid monster-editor-reference-grid">
            <div className="monster-attacks-traits-column">
              <section className="monster-section monster-attacks-section">
                <SectionHeader title="Attacks" />
                <div className="monster-attack-equipment-row">
                  <WeaponIdField project={project} catalog={catalog} value={monster.weapon} onCommit={(weapon) => onUpdate({ weapon })} />
                </div>
                <div className="monster-attacks-grid">
                  {Array.from({ length: 5 }, (_, row) => {
                    const values = monster.attacks[row] ?? [0, 0, 0, 0];
                    const updateAttackSlot = (slot: number, value: number) => {
                      const attacks = [...monster.attacks];
                      while (attacks.length < 5) attacks.push([0, 0, 0, 0]);
                      attacks[row] = updateArraySlot(attacks[row] ?? [], slot, value, 4);
                      onUpdate({ attacks });
                    };
                    return (
                      <div key={row} className="monster-attack-row">
                        <strong>Attack {row + 1}</strong>
                        <NumberField label="Damage Low" value={values[0] ?? 0} onCommit={(value) => updateAttackSlot(0, value)} />
                        <NumberField label="Damage High" value={values[1] ?? 0} onCommit={(value) => updateAttackSlot(1, value)} />
                        <MonsterAttackCodePicker label="Form" value={values[2] ?? 0} options={MONSTER_ATTACK_FORM_OPTIONS} onCommit={(value) => updateAttackSlot(2, value)} />
                        <MonsterAttackCodePicker label="Special" value={values[3] ?? 0} options={MONSTER_ATTACK_SPECIAL_OPTIONS} onCommit={(value) => updateAttackSlot(3, value)} />
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="monster-section monster-traits-section">
                <SectionHeader title="Traits" />
                <div className="monster-trait-grid combat-traits">
                  {["Magic Using", "Undead", "Demonic/Devil", "Reptilian", "Very Evil", "Intelligent", "Giant Size", "Non-Humanoid"].map((label, index) => (
                    <label key={label} className="combat-check-field">
                      <span>{label}</span>
                      <input
                        type="checkbox"
                        checked={Boolean(monster.typeFlags[index])}
                        onChange={(event) => onUpdate({ typeFlags: updateArraySlot(monster.typeFlags, index, event.currentTarget.checked ? 1 : 0, 8) })}
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>
            <section className="monster-section monster-spells-loot-section">
              <SectionHeader title="Spells / Loot" help="Spell slots, gold/gems/jewelry caps, and item drops." />
              <div className="monster-spells-loot-layout">
                <div className="monster-spells-column">
                  <SpellSlotGrid project={project} catalog={catalog} values={monster.spells} onCommit={(spells) => onUpdate({ spells })} />
                </div>
                <div className="monster-loot-column">
                  <ItemSlotGrid project={project} catalog={catalog} values={monster.items} onCommit={(items) => onUpdate({ items })} />
                  <MonsterMoneyFields
                    values={monster.money}
                    iconEntries={iconEntries}
                    catalog={catalog}
                    lookups={lookups}
                    previewContext={previewContext}
                    onCommit={(money) => onUpdate({ money })}
                  />
                </div>
              </div>
            </section>
          </div>
          <section className="monster-section monster-advanced-section">
            <SectionHeader title="Saves, Immunities, And Conditions" />
            <div className="monster-advanced-group monster-advanced-immunities">
              <CompactCheckboxFields labels={MONSTER_IMMUNITY_LABELS} values={monster.spellImmunities} onCommit={(spellImmunities) => onUpdate({ spellImmunities })} />
            </div>
            <div className="monster-advanced-group monster-advanced-saves">
              <CompactArrayFields labels={MONSTER_SAVE_LABELS} values={monster.saves} onCommit={(saves) => onUpdate({ saves })} />
            </div>
            <div className="monster-advanced-group monster-advanced-conditions">
              <CompactArrayFields labels={CONDITION_LABELS} values={monster.conditions} onCommit={(conditions) => onUpdate({ conditions })} />
            </div>
          </section>
        </>
      ) : <div className="monster-editor-details-placeholder" aria-hidden="true" />}
    </article>
  );
}

function PagedNumberControl({
  label,
  value,
  options,
  help,
  actions,
  allowArbitrary = true,
  className = "",
  onCommit
}: {
  label: string;
  value: number;
  options: number[];
  help?: string;
  actions?: ReactNode;
  allowArbitrary?: boolean;
  className?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const pageValues = useMemo(() => uniqueSortedNumbers(options), [options]);
  const valueSet = useMemo(() => new Set(pageValues), [pageValues]);
  const previousValue = [...pageValues].reverse().find((candidate) => candidate < value) ?? null;
  const nextValue = pageValues.find((candidate) => candidate > value) ?? null;
  useEffect(() => setDraft(String(value)), [value]);
  const commitDraft = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = Math.trunc(parsed);
    if (!allowArbitrary && !valueSet.has(next)) {
      setDraft(String(value));
      return;
    }
    onCommit(next);
    setDraft(String(next));
  };
  return (
    <div className={`combat-paged-field ${className}`.trim()}>
      <FieldLabel label={label} help={help} />
      <div className="combat-pager-action-row">
        <div className="combat-pager-row">
          <button type="button" className="btn btn-secondary btn-xs" disabled={previousValue === null} aria-label={`Previous ${label}`} onClick={() => previousValue !== null && onCommit(previousValue)}>
            &lt;
          </button>
          <input
            type="number"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={commitDraft}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <button type="button" className="btn btn-secondary btn-xs" disabled={nextValue === null} aria-label={`Next ${label}`} onClick={() => nextValue !== null && onCommit(nextValue)}>
            &gt;
          </button>
        </div>
        {actions ? <div className="battle-target-actions">{actions}</div> : null}
      </div>
    </div>
  );
}

function BattleStringField({
  project,
  label,
  value,
  help,
  onCommit,
  onSelectEntity,
  onCreate,
  onUpdateString
}: {
  project: Project;
  label: string;
  value: number;
  help?: string;
  onCommit: (value: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onCreate?: (id: number) => void;
  onUpdateString?: (id: number, text: string) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const targetId = Math.abs(value);
  const options = useMemo(
    () => uniqueSortedNumbers([0, targetId, ...(project.messages ?? []).map((message) => message.id)]),
    [project.messages, targetId]
  );
  return (
    <div className="combat-target-field battle-string-field">
      <PagedNumberControl
        label={label}
        value={targetId}
        options={options}
        help={help}
        onCommit={(id) => onCommit(Math.max(0, Math.trunc(Math.abs(id))))}
        actions={
          targetId ? (
            <>
              <button type="button" className="btn btn-xs battle-open-target-button" onClick={() => onSelectEntity(selectEntityFromId(`message:${targetId}`))}>
                Open String
              </button>
              <button
                type="button"
                className={`btn btn-xs battle-preview-button battle-icon-button${previewOpen ? " active" : ""}`}
                title="Preview / edit string"
                aria-label="Preview or edit selected string"
                aria-pressed={previewOpen}
                onClick={() => setPreviewOpen((open) => !open)}
              >
                <Eye size={14} aria-hidden="true" />
              </button>
            </>
          ) : null
        }
      />
      {targetId && previewOpen ? <BattleStringPreviewPanel project={project} stringId={targetId} onCreate={onCreate} onUpdateString={onUpdateString} /> : null}
    </div>
  );
}

function BattleDistanceField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const outOfRange = value < 0 || value > 30;
  return (
    <div className="combat-distance-field">
      <NumberField
        label="Distance"
        value={value}
        help="Set 1-30 to let Realmz spawn monsters farther from the party in a random direction. Zero means no randomized distance spread."
        onCommit={onCommit}
      />
      {outOfRange ? (
        <small className="combat-field-warning">Current value {value} is outside the usual 0-30 range. Providence preserves it until you edit this field.</small>
      ) : null}
    </div>
  );
}

function BattleMacroField({
  project,
  catalog,
  value,
  onCommit,
  onSelectEntity
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  value: number;
  onCommit: (value: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const macroId = Math.abs(value);
  const options = useMemo(
    () =>
      (project.triggers ?? [])
        .filter((trigger) => trigger.source === "Data ED3" && trigger.recordIndex > 0)
        .slice()
        .sort((a, b) => a.recordIndex - b.recordIndex),
    [project.triggers]
  );
  const optionIds = useMemo(
    () => uniqueSortedNumbers([0, macroId, ...options.map((trigger) => trigger.recordIndex)]),
    [macroId, options]
  );
  const selected = options.find((trigger) => trigger.recordIndex === macroId) ?? null;
  const commitMacroId = (nextMacroId: number) => {
    if (!nextMacroId) {
      onCommit(0);
      return;
    }
    onCommit(-Math.abs(nextMacroId));
  };
  return (
    <div className="combat-target-field battle-macro-field">
      <PagedNumberControl
        label="Battle Macro"
        value={macroId}
        options={optionIds}
        help={BATTLE_MACRO_HELP}
        onCommit={commitMacroId}
        actions={
          macroId ? (
            <>
              {selected ? (
                <button type="button" className="btn btn-xs battle-open-target-button" onClick={() => onSelectEntity(selectEntityFromId(`macro:${selected.recordIndex}`))}>
                  Open Battle Macro
                </button>
              ) : (
                <span className="battle-target-action-placeholder">Missing Macro</span>
              )}
              <button
                type="button"
                className={`btn btn-xs battle-preview-button battle-icon-button${previewOpen ? " active" : ""}`}
                title="Flow preview"
                aria-label="Toggle flow preview"
                aria-pressed={previewOpen}
                onClick={() => setPreviewOpen((open) => !open)}
              >
                <Eye size={14} aria-hidden="true" />
              </button>
            </>
          ) : null
        }
      />
      {value > 0 && (
        <p className="combat-inline-warning">
          Positive Battle Macro values are preserved, but modern Realmz does not run them at the end of each combat round. Re-selecting a macro will store the runnable value.
        </p>
      )}
      {macroId && previewOpen ? <BattleActionFlowPanel project={project} catalog={catalog} actionId={macroId} onSelectEntity={onSelectEntity} /> : null}
    </div>
  );
}

function BattleStringPreviewPanel({
  project,
  stringId,
  onCreate,
  onUpdateString
}: {
  project: Project;
  stringId: number;
  onCreate?: (id: number) => void;
  onUpdateString?: (id: number, text: string) => void;
}) {
  if (!stringId) return null;
  const record = (project.messages ?? []).find((candidate) => candidate.id === Math.abs(stringId)) ?? null;
  return (
    <div className="combat-target-disclosure battle-target-panel">
      {record ? (
        <textarea
          key={`battle-string-${record.id}-${record.text}`}
          defaultValue={record.text}
          onBlur={(event) => {
            if (event.currentTarget.value !== record.text) onUpdateString?.(record.id, event.currentTarget.value);
          }}
        />
      ) : (
        <div className="combat-disclosure-empty">
          <p>String {Math.abs(stringId)} has not been created yet.</p>
          {onCreate ? (
            <button type="button" className="btn btn-primary btn-xs" onClick={() => onCreate(Math.abs(stringId))}>
              Create String {Math.abs(stringId)}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function BattleActionFlowPanel({
  project,
  catalog,
  actionId,
  onSelectEntity
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  actionId: number;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  if (!actionId) return null;
  const trigger = (project.triggers ?? []).find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === Math.abs(actionId)) ?? null;
  const actions = trigger?.actions.filter((action) => action.rawCode !== 0).sort((a, b) => a.slot - b.slot) ?? [];
  return (
    <div className="combat-target-disclosure combat-flow-disclosure battle-target-panel">
      {!trigger && <p>Extra Action Point {Math.abs(actionId)} has not been created yet.</p>}
      {trigger && actions.length === 0 && <p>No action steps.</p>}
      {actions.map((action) => {
        const definition = scriptActionDefinitionFor(action.rawCode);
        const routes = scriptStepFlowRoutes(project, catalog, { rawCode: action.rawCode, id: action.id });
        const route = routes[0] ?? null;
        const summary = route?.target ? `${route.label}: ${route.target.label}` : route?.detail || scriptActionSummary(project, catalog, { rawCode: action.rawCode, id: action.id });
        return (
          <div key={`${action.slot}-${action.rawCode}-${action.id}`} className="combat-flow-step">
            <span>{action.slot + 1}</span>
            <p>
              <b>{definition.shortLabel}</b>
              <small>{summary}</small>
            </p>
            {route?.target && (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => onSelectEntity(selectEntityForCombatFlowTarget(route.target!))}>
                Open
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function selectEntityForCombatFlowTarget(target: { targetKind: string; value: number }): SelectedEntity {
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

function RecordList({
  title,
  query,
  onQuery,
  count,
  total,
  newLabel,
  help,
  onNew,
  children
}: {
  title: string;
  query: string;
  onQuery: (value: string) => void;
  count: number;
  total: number;
  newLabel: string;
  help?: string;
  onNew: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="combat-record-list">
      <header>
        <div>
          {help ? (
            <TutorialTip title={title} body={help} side="right">
              <strong>{title}</strong>
            </TutorialTip>
          ) : (
            <strong>{title}</strong>
          )}
          <small>{count.toLocaleString()} shown | {total.toLocaleString()} total</small>
        </div>
        <button type="button" className="btn btn-primary btn-xs" onClick={onNew}>{newLabel}</button>
      </header>
      <input value={query} onChange={(event) => onQuery(event.currentTarget.value)} placeholder={`Search ${title.toLowerCase()}...`} />
      <div className="combat-record-scroll">{children}</div>
    </aside>
  );
}

type MonsterIconProps = {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  resolvedIcon?: ResolvedBattleMonsterIcon | null;
  compact?: boolean;
  large?: boolean;
};

const MonsterIcon = memo(function MonsterIcon({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  resolvedIcon = null,
  compact = false,
  large = false
}: MonsterIconProps) {
  if (resolvedIcon) {
    return <MonsterIconDisplay resolution={resolvedIcon} primaryUrl={resolvedIcon.resolvedUrl} fallbackText={String(monster.id)} compact={compact} large={large} />;
  }
  return (
    <MonsterIconResolved
      monster={monster}
      iconEntries={iconEntries}
      project={project}
      lookups={lookups}
      previewContext={previewContext}
      compact={compact}
      large={large}
    />
  );
}, areMonsterIconPropsEqual);

function MonsterIconResolved({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  compact = false,
  large = false
}: MonsterIconProps) {
  const resolution = measureCombatWork("resolveMonsterIcon", () => resolveMonsterIcon(monster, iconEntries, project, lookups));
  const iconResourceId = monster.iconId ? Math.abs(monster.iconId) : null;
  const scenarioResourceId = resolution.url || resolution.libraryAsset ? null : iconResourceId;
  const scenarioUrl = useResolvedPreviewUrl(null, null, null, {
    ...previewContext,
    project,
    resourceType: "cicn",
    resourceId: scenarioResourceId
  });
  const fallbackUrl = useResolvedPreviewUrl(resolution.url, null, resolution.libraryAsset ?? null, previewContext);
  return <MonsterIconDisplay resolution={resolution} primaryUrl={fallbackUrl} fallbackUrl={scenarioUrl} fallbackText={String(monster.id)} compact={compact} large={large} />;
}

function MonsterIconDisplay({
  resolution,
  primaryUrl,
  fallbackUrl,
  fallbackText,
  compact,
  large
}: {
  resolution: Pick<MonsterIconResolution, "label">;
  primaryUrl: string | null;
  fallbackUrl?: string | null;
  fallbackText: string;
  compact: boolean;
  large: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    setFailedUrl(null);
    setLoadedUrl(null);
  }, [fallbackUrl, primaryUrl]);
  const displayUrl = primaryUrl && primaryUrl !== failedUrl
    ? primaryUrl
    : fallbackUrl && fallbackUrl !== failedUrl
      ? fallbackUrl
      : null;
  const ready = !displayUrl || loadedUrl === displayUrl;
  return (
    <span
      className={`monster-icon-preview${compact ? " compact" : ""}${large ? " large" : ""}`}
      title={resolution.label}
      data-combat-preview="monster-icon"
      data-combat-preview-ready={ready ? "true" : "false"}
    >
      {displayUrl ? (
        <img
          src={displayUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedUrl(displayUrl)}
          onError={() => setFailedUrl(displayUrl)}
        />
      ) : (
        <b>{fallbackText}</b>
      )}
    </span>
  );
}

function areMonsterIconPropsEqual(previous: MonsterIconProps, next: MonsterIconProps) {
  return previous.monster === next.monster
    && previous.iconEntries === next.iconEntries
    && previous.lookups === next.lookups
    && previous.resolvedIcon === next.resolvedIcon
    && previous.compact === next.compact
    && previous.large === next.large
    && samePreviewContextInputs(previous.previewContext, next.previewContext)
    && sameProjectIconInputs(previous.project, next.project);
}

function samePreviewContextInputs(left: PreviewRuntimeContext, right: PreviewRuntimeContext) {
  return left === right || (
    left.desktopRuntime === right.desktopRuntime
    && left.projectDir === right.projectDir
    && left.workspaceDir === right.workspaceDir
    && left.resourceType === right.resourceType
    && left.resourceId === right.resourceId
    && sameProjectIconInputs(left.project ?? null, right.project ?? null)
  );
}

function sameProjectIconInputs(left: Project | null | undefined, right: Project | null | undefined) {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.scenario.name === right.scenario.name
    && left.source.sourcePath === right.source.sourcePath
    && left.assets === right.assets
    && left.assetCatalog.icons === right.assetCatalog.icons
    && left.monsterIconOverrides === right.monsterIconOverrides
    && left.scenarioIconResources === right.scenarioIconResources;
}

function MonsterBattleDetail({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  forcedFriendly = false
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  forcedFriendly?: boolean;
}) {
  return (
    <div className="monster-battle-detail-card">
      <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} large />
      <div className="monster-battle-detail-body">
        <b>{monster.displayName || `Monster ${monster.id}`}</b>
        <small>Monster {monster.id} | icon {monster.iconId} | {monsterBattleFootprintLabel(monster, iconEntries, project, lookups)}</small>
        <dl className="monster-battle-stat-grid">
          {monsterBattleStats(monster).map(([label, value]) => (
            <div key={label}>
              <dt>
                {forcedFriendly && label === "Alliance" ? (
                  <TutorialTip
                    title="Forced Friend"
                    body={`This placed battle monster stores a negative monster ID. The source monster's Alliance value remains ${monster.traitor}; Realmz treats this placement as friendly during combat.`}
                    side="left"
                  >
                    <span>Alliance</span>
                  </TutorialTip>
                ) : label}
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function resolveMonsterIcon(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups): MonsterIconResolution {
  const iconId = Math.abs(monster.iconId);
  const targetPair = resolveMonsterIconTargetPair(project, lookups, iconEntries, iconId, true);
  if (targetPair?.asset) {
    const targetEntry = iconEntries[monster.iconId] ?? iconEntries[iconId] ?? iconEntries[-iconId] ?? null;
    const width = targetEntry?.image.naturalWidth || targetEntry?.image.width || null;
    const height = targetEntry?.image.naturalHeight || targetEntry?.image.height || null;
    const label = targetPair.override
      ? `cicn ${monster.iconId} overridden by ${targetPair.override.sourceLabel ?? `Source ${targetPair.override.sourceBaseIconId}`}`
      : targetPair.sourceLabel ?? targetPair.asset.label ?? `cicn ${monster.iconId}`;
    const sourceStatus = monsterIconTargetSourceStatus(targetPair);
    if (targetPair.asset.source === "Scenario icon resources") {
      return { url: targetPair.asset.previewPath ?? null, libraryAsset: targetPair.asset.previewPath ? null : targetPair.asset, label, sourceStatus, width, height };
    }
    return { url: null, libraryAsset: targetPair.asset, label, sourceStatus, width, height };
  }
  const entry = iconEntries[monster.iconId] ?? iconEntries[iconId] ?? iconEntries[-iconId];
  if (entry?.url) {
    return {
      url: entry.url,
      label: `cicn ${monster.iconId}`,
      sourceStatus: "scenario-resource",
      width: entry.image.naturalWidth || entry.image.width || null,
      height: entry.image.naturalHeight || entry.image.height || null
    };
  }
  const asset = lookups.iconAssetsByAbsId.get(iconId);
  if (asset?.previewPath) return { url: asset.previewPath, label: asset.label ?? `cicn ${monster.iconId}`, sourceStatus: "scenario-resource", width: null, height: null };
  const projectAsset = project.assetCatalog?.icons?.find((candidate) => Math.abs(candidate.resourceId) === iconId && candidate.previewPath) ?? null;
  if (projectAsset?.previewPath) return { url: projectAsset.previewPath, label: `cicn ${monster.iconId}`, sourceStatus: "scenario-resource", width: null, height: null };
  const realmzActorAsset = lookups.realmzActorIconAssetsByAbsId.get(iconId) ?? null;
  if (realmzActorAsset) return { url: null, libraryAsset: realmzActorAsset, label: realmzActorAsset.label || `cicn ${monster.iconId}`, sourceStatus: "default-art", width: null, height: null };
  if (isActorOrCreatureIconId(iconId)) {
    const referenceUrl = browserReferenceIconUrl(iconId);
    if (referenceUrl) return { url: referenceUrl, label: `cicn ${monster.iconId}`, sourceStatus: "default-art", width: null, height: null };
  }
  return { url: null, label: `No icon preview for cicn ${monster.iconId}`, sourceStatus: "missing-art", width: null, height: null };
}

function MonsterIconControl({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  onCommit,
  onOpenIconSet
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (iconId: number) => void;
  onOpenIconSet?: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const statusLabel = monsterIconSourceStatusLabel(resolution.sourceStatus);
  const canPickTargetIcon = Boolean(onOpenIconSet);
  const iconTitle = `${canPickTargetIcon ? "Choose monster icon" : "Monster icon"} (${statusLabel}: ${resolution.label})`;
  const showSourceBadge = resolution.sourceStatus !== "default-art";
  const preview = <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} large />;
  return (
    <div className="monster-icon-control">
      {canPickTargetIcon ? (
        <button
          type="button"
          className="monster-icon-button"
          onClick={() => setPickerOpen(true)}
          title={iconTitle}
          aria-label="Choose monster icon"
        >
          {preview}
        </button>
      ) : <span title={iconTitle}>{preview}</span>}
      {showSourceBadge ? (
        <span className={`monster-icon-source-badge ${resolution.sourceStatus}`} title={resolution.label}>
          {statusLabel}
        </span>
      ) : null}
      {canPickTargetIcon ? (
        <MonsterIconPickerModal
          open={pickerOpen}
          currentIconId={Math.abs(monster.iconId)}
          project={project}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelect={(iconId) => onCommit(iconId)}
          onOpenIconSet={onOpenIconSet}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

function MonsterIconPickerModal({
  open,
  currentIconId,
  project,
  iconEntries,
  lookups,
  previewContext,
  onSelect,
  onOpenIconSet,
  onClose
}: {
  open: boolean;
  currentIconId: number;
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelect: (iconId: number) => void;
  onOpenIconSet?: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <MonsterIconPickerDialog
      currentIconId={currentIconId}
      project={project}
      iconEntries={iconEntries}
      lookups={lookups}
      previewContext={previewContext}
      query={query}
      onQuery={setQuery}
      onSelect={onSelect}
      onOpenIconSet={onOpenIconSet}
      onClose={onClose}
    />
  );
}

function MonsterIconPickerDialog({
  currentIconId,
  project,
  iconEntries,
  lookups,
  previewContext,
  query,
  onQuery,
  onSelect,
  onOpenIconSet,
  onClose
}: {
  currentIconId: number;
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  query: string;
  onQuery: (query: string) => void;
  onSelect: (iconId: number) => void;
  onOpenIconSet?: () => void;
  onClose: () => void;
}) {
  const options = useMemo(() => monsterIconPickerOptions(project, lookups, iconEntries), [iconEntries, lookups, project]);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => {
      const haystack = [
        String(option.baseId),
        `icon ${option.baseId}`,
        option.sourceLabel,
        monsterIconSourceStatusLabel(option.sourceStatus)
      ].join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);
  return (
    <div className="monster-icon-picker-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="monster-icon-picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="monster-icon-picker-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="monster-icon-picker-header">
          <div>
            <h3 id="monster-icon-picker-title">Choose Monster Icon</h3>
          </div>
          <div className="monster-icon-picker-actions">
            {onOpenIconSet ? (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  onClose();
                  onOpenIconSet();
                }}
              >
                Open Icon Set
              </button>
            ) : null}
            <button type="button" className="btn btn-icon btn-xs" aria-label="Close icon picker" onClick={onClose}>
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        </header>
        <input
          className="monster-icon-picker-search"
          value={query}
          onChange={(event) => onQuery(event.currentTarget.value)}
          placeholder="Search icon ID or source..."
          autoFocus
        />
        <div className="monster-icon-picker-grid" role="listbox" aria-label="Scenario monster icon targets">
          {filteredOptions.map((option) => {
            const selected = option.baseId === currentIconId;
            return (
              <button
                key={option.key}
                type="button"
                className={`monster-icon-picker-option${selected ? " selected" : ""}`}
                aria-selected={selected}
                role="option"
                onClick={() => {
                  onSelect(option.baseId);
                  onClose();
                }}
              >
                <IconPairPreview baseAsset={option.asset} pairedAsset={option.pairedAsset} previewContext={previewContext} />
                <span>
                  <strong>Icon {option.baseId}</strong>
                  <small>{monsterIconSourceStatusLabel(option.sourceStatus)}</small>
                </span>
              </button>
            );
          })}
          {filteredOptions.length === 0 ? <p className="empty-copy compact">No scenario target icons match that search.</p> : null}
        </div>
      </section>
    </div>
  );
}

function MonsterSelect({
  monsters,
  setId,
  value,
  onCommit
}: {
  monsters: MonsterRecord[];
  setId: MonsterSetId;
  value: number;
  onCommit: (value: number) => void;
}) {
  const placeableMonsters = monsters.filter((monster) => monster.id !== 0);
  const hasValue = value === 0 || placeableMonsters.some((monster) => monster.id === value);
  return (
    <label className="combat-field">
      <FieldLabel label="Anchor Cell Monster" help="This writes the absolute monster ID for the selected anchor cell. Data BD uses 0 for empty cells, so Monster 0 cannot be selected here. Use Force Friends to preserve Realmz's negative side-flip encoding." />
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty</option>
        {!hasValue ? <option value={value}>{monsterSetLabel(setId)} Monster {value} missing</option> : null}
        {placeableMonsters.map((monster) => (
          <option key={monster.id} value={monster.id}>{monster.displayName || `Monster ${monster.id}`} ({monster.id})</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, help, onCommit }: { label: string; value: number; help?: string; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="combat-field">
      <FieldLabel label={label} help={help} />
      <input
        type="number"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(Number.isFinite(Number(draft)) ? Number(draft) : value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function TextField({ label, value, help, onCommit }: { label: string; value: string; help?: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="combat-field">
      <FieldLabel label={label} help={help} />
      <input
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(draft)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function TextAreaField({ label, value, placeholder, onCommit }: { label: string; value: string; placeholder?: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="combat-field combat-textarea-field">
      <span>{label}</span>
      <textarea
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(draft)}
      />
    </label>
  );
}

function ToggleButton({
  active,
  label,
  icon,
  disabled,
  help,
  helpSide = "right",
  onClick
}: {
  active: boolean;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  help?: string;
  helpSide?: "right" | "left" | "below" | "above";
  onClick: () => void;
}) {
  const button = (
    <button type="button" className={`combat-toggle${active ? " active" : ""}`} disabled={disabled} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
  if (!help) return button;
  return (
    <TutorialTip title={label} body={help} side={helpSide}>
      {button}
    </TutorialTip>
  );
}

function FieldLabel({ label, help }: { label: string; help?: string }) {
  if (!help) return <span title={label}>{label}</span>;
  return (
    <span>
      <TutorialTip title={label} body={help} side="right">
        <span title={label}>{label}</span>
      </TutorialTip>
    </span>
  );
}

function MonsterNumberSection({
  title,
  className = "",
  monster,
  fields,
  onUpdate
}: {
  title: string;
  className?: string;
  monster: MonsterRecord;
  fields: Array<[string, keyof MonsterRecord]>;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
}) {
  return (
    <section className={`monster-section${className ? ` ${className}` : ""}`}>
      <SectionHeader title={title} />
      <div className="monster-field-grid">
        {fields.map(([label, key]) => (
          <NumberField key={String(key)} label={label} value={Number(monster[key] ?? 0)} onCommit={(value) => onUpdate({ [key]: value } as Partial<MonsterRecord>)} />
        ))}
      </div>
    </section>
  );
}

function MonsterBehaviorSection({
  project,
  catalog,
  monster,
  onUpdate
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  monster: MonsterRecord;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
}) {
  const fields: Array<[string, keyof MonsterRecord]> = [
    ["Side", "traitor"],
    ["Size", "size"],
    ["Attacks", "attackCount"],
    ["Magical Attacks", "magicAttackCount"],
    ["Damage Plus", "damageBonus"],
    ["Cast Spell %", "castPercent"],
    ["Run Away %", "runPercent"],
    ["Surrender %", "surrenderPercent"],
    ["Use Missile %", "missilePercent"]
  ];
  return (
    <section className="monster-section monster-compact-number-section">
      <SectionHeader title="Behavior" />
      <div className="monster-field-grid">
        <NumberField label="Side" value={Number(monster.traitor ?? 0)} onCommit={(traitor) => onUpdate({ traitor })} />
        <NumberField label="Size" value={Number(monster.size ?? 0)} onCommit={(size) => onUpdate({ size })} />
        <RequiredWeaponField project={project} catalog={catalog} value={monster.distance} onCommit={(distance) => onUpdate({ distance })} />
        {fields.slice(2).map(([label, key]) => (
          <NumberField key={String(key)} label={label} value={Number(monster[key] ?? 0)} onCommit={(value) => onUpdate({ [key]: value } as Partial<MonsterRecord>)} />
        ))}
        <SummonEligibleField value={monster.canSummon} onCommit={(canSummon) => onUpdate({ canSummon })} />
      </div>
    </section>
  );
}

function SectionHeader({ title, help }: { title: string; help?: string }) {
  return (
    <header>
      <strong>
        {help ? (
          <TutorialTip title={title} body={help} side="right">
            <span>{title}</span>
          </TutorialTip>
        ) : title}
      </strong>
    </header>
  );
}

type CombatSelectOption = { key: string; value: number; label: string; detail?: string };

function MacroReferenceField({ project, value, onCommit }: { project: Project; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<CombatSelectOption[]>(
    () => (project.triggers ?? [])
      .filter((trigger) => trigger.source === "Data ED3")
      .sort((a, b) => a.recordIndex - b.recordIndex)
      .map((trigger) => ({
        key: `macro:${trigger.recordIndex}`,
        value: trigger.recordIndex,
        label: `Extra Action Point ${trigger.recordIndex}`,
        detail: `${trigger.actions.filter((action) => action.rawCode !== 0).length} action step(s)`
      })),
    [project.triggers]
  );
  return <NumberSelectField label="Monster Macro" help={MONSTER_DEATH_ACTION_HELP} value={value} options={options} emptyLabel="No monster macro" onCommit={onCommit} />;
}

function WeaponIdField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo<CombatSelectOption[]>(() => [
    ...RANDOM_WEAPON_OPTIONS,
    ...itemReferenceOptions(project, catalog).map((item) => ({
      key: item.key,
      value: item.value,
      label: item.label,
      detail: item.detail
    }))
  ], [catalog, project]);
  return <NumberSelectField label="Weapon Used" value={value} options={options} emptyLabel="No weapon" onCommit={onCommit} />;
}

function RequiredWeaponField({ project, catalog, value, onCommit }: { project: Project; catalog: LibraryCatalog | null; value: number; onCommit: (value: number) => void }) {
  const options = useMemo(() => monsterRequiredWeaponOptions(project, catalog), [catalog, project]);
  return (
    <NumberSelectField
      label="Required Weapon"
      value={monsterRequiredWeaponDisplayCode(value)}
      options={options}
      emptyLabel="All weapons"
      help={MONSTER_REQUIRED_WEAPON_HELP}
      onCommit={(displayCode) => onCommit(monsterRequiredWeaponStoredCode(displayCode))}
    />
  );
}

function SummonEligibleField({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  return (
    <NumberSelectField
      label="Summon Eligible"
      value={Math.trunc(Number.isFinite(value) ? value : 0)}
      options={MONSTER_SUMMON_ELIGIBLE_OPTIONS}
      emptyLabel="0 = No"
      help={MONSTER_SUMMON_ELIGIBLE_HELP}
      onCommit={onCommit}
    />
  );
}

function monsterRequiredWeaponOptions(project: Project, catalog: LibraryCatalog | null): CombatSelectOption[] {
  const weaponOptions = new Map(
    itemReferenceOptions(project, catalog)
      .filter((item) => item.category === "weapon" && item.value > 0 && item.value <= REQUIRED_WEAPON_MAX_SPECIFIC_CODE)
      .map((item) => [item.value, item])
  );
  return [
    { key: "required-weapon:blunt", value: -1, label: "Blunt only", detail: "Stored as -1." },
    { key: "required-weapon:sharp", value: -2, label: "Sharp only", detail: "Stored as -2." },
    ...Array.from({ length: REQUIRED_WEAPON_MAX_SPECIFIC_CODE }, (_, index) => {
      const code = index + 1;
      const item = weaponOptions.get(code);
      return {
        key: `required-weapon:${code}`,
        value: code,
        label: item?.label ?? `Weapon ${code}`,
        detail: item ? [item.detail, item.sourceState].filter(Boolean).join(" | ") : `Specific weapon code ${code}.`
      };
    })
  ];
}

export function monsterRequiredWeaponDisplayCode(storedValue: number) {
  const byte = normalizedByte(storedValue);
  if (byte === 0xff) return -1;
  if (byte === 0xfe) return -2;
  return byte;
}

export function monsterRequiredWeaponStoredCode(displayCode: number) {
  const code = Math.trunc(Number.isFinite(displayCode) ? displayCode : 0);
  if (code === -1 || code === -2) return code;
  const byte = Math.max(0, Math.min(REQUIRED_WEAPON_MAX_SPECIFIC_CODE, code));
  return byte > 127 ? byte - 256 : byte;
}

function normalizedByte(value: number) {
  return ((Math.trunc(Number.isFinite(value) ? value : 0) % 256) + 256) % 256;
}

function SpellSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(() => combatSpellOptions(project, catalog), [catalog, project]);
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 10 }, (_, index) => (
        <NumberSelectField
          key={index}
          label={`Spell ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No spell"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 10))}
        />
      ))}
    </div>
  );
}

function ItemSlotGrid({ project, catalog, values, onCommit }: { project: Project; catalog: LibraryCatalog | null; values: number[]; onCommit: (values: number[]) => void }) {
  const options = useMemo(
    () => itemReferenceOptions(project, catalog).map((item) => ({ key: item.key, value: item.value, label: item.label, detail: item.detail })),
    [catalog, project]
  );
  return (
    <div className="combat-compact-array monster-select-array">
      {Array.from({ length: 6 }, (_, index) => (
        <NumberSelectField
          key={index}
          label={`Item ${index + 1}`}
          value={values[index] ?? 0}
          options={options}
          emptyLabel="No item"
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, 6))}
        />
      ))}
    </div>
  );
}

function NumberSelectField({
  label,
  value,
  options,
  emptyLabel,
  help,
  onCommit
}: {
  label: string;
  value: number;
  options: CombatSelectOption[];
  emptyLabel: string;
  help?: string;
  onCommit: (value: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const selectedOption = value !== 0 ? options.find((option) => option.value === value) ?? null : null;
  const hasCurrentValue = value !== 0 && !selectedOption;
  const renderedOptions = expanded ? options : selectedOption ? [selectedOption] : [];
  return (
    <label className="combat-field combat-select-field">
      <FieldLabel label={label} help={help} />
      <select
        value={String(value)}
        onFocus={() => setExpanded(true)}
        onMouseDown={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onChange={(event) => {
          onCommit(Number(event.currentTarget.value));
          setExpanded(false);
        }}
      >
        <option value="0">{emptyLabel}</option>
        {hasCurrentValue && <option value={String(value)}>Current value {value}</option>}
        {renderedOptions.map((option, index) => (
          <option key={`${option.key}:${option.value}:${index}`} value={String(option.value)} title={option.detail}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MonsterAttackCodePicker({
  label,
  value,
  options,
  onCommit
}: {
  label: string;
  value: number;
  options: CombatSelectOption[];
  onCommit: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;
  const menuOptions = selected ? options : [{ key: `${label}:current:${value}`, value, label: `Current value ${value}` }, ...options];
  const title = selected ? `${selected.value} ${selected.label}` : `Current value ${value}`;
  return (
    <div
      className="combat-field monster-attack-code-picker"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false);
      }}
    >
      <FieldLabel label={label} />
      <button
        type="button"
        className="monster-attack-code-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {value}
      </button>
      {open ? (
        <div className="monster-attack-code-menu" role="listbox" aria-label={label}>
          {menuOptions.map((option) => (
            <button
              key={option.key}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "selected" : ""}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCommit(option.value);
                setOpen(false);
              }}
            >
              <span>{option.value}</span>
              <strong>{option.label}</strong>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompactArrayFields({ labels, values, onCommit }: { labels: string[]; values: number[]; onCommit: (values: number[]) => void }) {
  return (
    <div className="combat-compact-array">
      {labels.map((label, index) => (
        <NumberField
          key={`${label}:${index}`}
          label={label}
          value={values[index] ?? 0}
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, labels.length))}
        />
      ))}
    </div>
  );
}

function CompactCheckboxFields({ labels, values, onCommit }: { labels: string[]; values: number[]; onCommit: (values: number[]) => void }) {
  return (
    <div className="combat-compact-array monster-compact-checkbox-grid">
      {labels.map((label, index) => (
        <label key={`${label}:${index}`} className="combat-check-field monster-compact-check-field">
          <span title={label}>{label}</span>
          <input
            type="checkbox"
            checked={Boolean(values[index])}
            onChange={(event) => onCommit(updateArraySlot(values, index, event.currentTarget.checked ? 1 : 0, labels.length))}
          />
        </label>
      ))}
    </div>
  );
}

function MonsterMoneyFields({
  values,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  onCommit
}: {
  values: number[];
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (values: number[]) => void;
}) {
  return (
    <div className="combat-compact-array monster-money-fields">
      <strong className="monster-money-title">Treasure</strong>
      {MONSTER_MONEY_REWARDS.map((reward, index) => (
        <MonsterMoneyField
          key={reward.label}
          reward={reward}
          value={values[index] ?? 0}
          iconEntries={iconEntries}
          catalog={catalog}
          lookups={lookups}
          previewContext={previewContext}
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, MONSTER_MONEY_LABELS.length))}
        />
      ))}
    </div>
  );
}

function MonsterMoneyField({
  reward,
  value,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  onCommit
}: {
  reward: (typeof MONSTER_MONEY_REWARDS)[number];
  value: number;
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="monster-money-row" title={`${reward.label}: ${MONSTER_MONEY_HELP}`}>
      <ReferenceIconPreview
        iconId={reward.iconId}
        fallbackValue={reward.iconId}
        iconEntries={iconEntries}
        catalog={catalog}
        lookups={lookups}
        previewContext={previewContext}
        preferLibraryIcon
      />
      <input
        type="number"
        aria-label={reward.label}
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={() => onCommit(Number.isFinite(Number(draft)) ? Number(draft) : value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
    </label>
  );
}

function MonsterScrapbookWorkbench({
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const entries = useMemo(
    () => visibleMonsterLibraryEntries(catalog)
      .sort((a, b) => scrapbookIndex(a) - scrapbookIndex(b)),
    [catalog?.entities]
  );
  const filtered = filterRecords(entries, query, scrapbookSearchText);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (!filtered.some((entry) => entry.id === selectedId)) setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, selectedId]);
  const selected = filtered.find((entry) => entry.id === selectedId) ?? filtered[0] ?? null;
  const copyId = selected ? monsterCopyTargetId(project, selected) : null;
  const copySelected = () => {
    if (!selected || copyId == null) return;
    copyScrapbookMonsterToScenario(selected, copyId, onApplyCommand);
    onSelectEntity(selectEntityFromId(`monster:${copyId}`));
  };

  return (
    <div className="combat-record-layout scrapbook-layout">
      <aside className="combat-record-list scrapbook-list" aria-label="Monster Scrapbook entries">
        <header>
          <div>
            <TutorialTip title="Monster Scrapbook" body={SCRAPBOOK_HELP} side="right">
              <strong>Monster Scrapbook</strong>
            </TutorialTip>
            <small>{filtered.length.toLocaleString()} shown | {entries.length.toLocaleString()} total</small>
          </div>
        </header>
        <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search built-in monsters..." />
        <ScrollArea className="combat-record-scroll">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === selected?.id ? "selected" : ""}
              onClick={() => setSelectedId(entry.id)}
            >
              <ScrapbookMonsterIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} compact />
              <span>
                <strong>{scrapbookName(entry)}</strong>
                <small>{scrapbookFacts(entry)}</small>
              </span>
            </button>
          ))}
          {filtered.length === 0 && <p className="empty-copy compact">No built-in monsters match that search.</p>}
        </ScrollArea>
      </aside>
      <article className="combat-editor scrapbook-editor">
        {selected ? (
          <>
            <header className="combat-editor-header">
              <div>
                <span>{scrapbookName(selected)}</span>
                <small>{scrapbookFacts(selected)}</small>
              </div>
              <div className="combat-editor-actions">
                {copyId != null && (
                  <button className="btn btn-primary btn-sm" type="button" onClick={copySelected}>
                    Copy To Scenario Monster {copyId}
                  </button>
                )}
              </div>
            </header>
            <section className="scrapbook-summary">
              <ScrapbookMonsterIcon entry={selected} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} />
              <div className="scrapbook-stat-grid">
                <ScrapbookFact label="Hit Dice" value={summaryNumber(selected, "hitDice")} />
                <ScrapbookFact label="Armor" value={summaryNumber(selected, "armor")} />
                <ScrapbookFact label="Agility" value={summaryNumber(selected, "agility")} />
                <ScrapbookFact label="Movement" value={summaryNumber(selected, "movementMax")} />
                <ScrapbookFact label="Attacks" value={summaryNumber(selected, "attackCount")} />
                <ScrapbookFact label="Magic Attacks" value={summaryNumber(selected, "magicAttackCount")} />
                <ScrapbookFact label="Spell Points" value={summaryNumber(selected, "spellPoints")} />
                <ScrapbookFact label="Experience" value={summaryNumber(selected, "exp")} />
              </div>
            </section>
            {scrapbookDescription(selected) && (
              <section className="monster-section">
                <header><strong>Description</strong><small>Bundled Monster Scrapbook text.</small></header>
                <p className="scrapbook-description">{scrapbookDescription(selected)}</p>
              </section>
            )}
            <section className="monster-section">
              <header><strong>Attacks</strong><small>Read-only Realmz monster rows.</small></header>
              <div className="scrapbook-attack-grid">
                {summaryNumberRows(selected, "attacks").map((attack, index) => (
                  <div key={index} className="scrapbook-attack-row">
                    <strong>Attack {index + 1}</strong>
                    <span>low {attack[0] ?? 0}</span>
                    <span>high {attack[1] ?? 0}</span>
                    <span>form {attack[2] ?? 0}</span>
                    <span>special {attack[3] ?? 0}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="monster-section scrapbook-loot-section">
              <header><strong>Spells And Loot</strong><small>IDs preserved from the library record.</small></header>
              <div className="scrapbook-pill-grid">
                <ScrapbookSpellList
                  values={summaryNumberArray(selected, "spells")}
                  project={project}
                  catalog={catalog}
                  iconEntries={iconEntries}
                  lookups={lookups}
                  previewContext={previewContext}
                />
                <ScrapbookItemList
                  values={summaryNumberArray(selected, "items")}
                  project={project}
                  catalog={catalog}
                  iconEntries={iconEntries}
                  lookups={lookups}
                  previewContext={previewContext}
                />
                <ScrapbookMoneyList
                  values={summaryNumberArray(selected, "money")}
                  iconEntries={iconEntries}
                  catalog={catalog}
                  lookups={lookups}
                  previewContext={previewContext}
                />
              </div>
            </section>
          </>
        ) : (
          <EmptyCombatEditor title="No Monster Scrapbook entries" body="The bundled library catalog did not include Monster Scrapbook records." />
        )}
      </article>
    </div>
  );
}

function ScrapbookFact({ label, value }: { label: string; value: number }) {
  return (
    <div className="scrapbook-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScrapbookSpellList({
  values,
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext
}: {
  values: number[];
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
}) {
  const options = useMemo(() => new Map(combatSpellOptions(project, catalog).map((option) => [option.value, option])), [project, catalog]);
  const iconIds = useMemo(() => spellPreviewIconIdMap(project, catalog), [project, catalog]);
  const visible = values.filter((value) => value !== 0);
  return (
    <div className="scrapbook-array scrapbook-reference-array">
      <span>Spells</span>
      <div className="scrapbook-reference-list">
        {visible.length ? visible.map((value, index) => {
          const option = options.get(value);
          return (
            <ScrapbookReferenceRow
              key={`${value}:${index}`}
              value={value}
              label={option?.label ?? `Spell ${value}`}
              detail={option?.detail || "Raw spell ID; no catalog match yet."}
              iconId={iconIds.get(value) ?? null}
              iconEntries={iconEntries}
              catalog={catalog}
              lookups={lookups}
              previewContext={previewContext}
            />
          );
        }) : <ScrapbookEmptyValue label="No spells" />}
      </div>
    </div>
  );
}

function ScrapbookItemList({
  values,
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext
}: {
  values: number[];
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
}) {
  const options = useMemo(() => new Map(itemReferenceOptions(project, catalog).map((option) => [option.value, option])), [project, catalog]);
  const visible = values.filter((value) => value !== 0);
  return (
    <div className="scrapbook-array scrapbook-reference-array">
      <span>Items</span>
      <div className="scrapbook-reference-list">
        {visible.length ? visible.map((value, index) => {
          const option = options.get(value);
          return (
            <ScrapbookReferenceRow
              key={`${value}:${index}`}
              value={value}
              label={option?.label ?? `Item ${value}`}
              detail={option ? [option.summary, option.sourceState].filter(Boolean).join(" | ") : "Raw item ID; no catalog match yet."}
              iconId={option?.iconId ?? null}
              iconEntries={iconEntries}
              catalog={catalog}
              lookups={lookups}
              previewContext={previewContext}
              preferLibraryIcon={Math.abs(value) < 800}
            />
          );
        }) : <ScrapbookEmptyValue label="No items" />}
      </div>
    </div>
  );
}

function ScrapbookMoneyList({
  values,
  iconEntries,
  catalog,
  lookups,
  previewContext
}: {
  values: number[];
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
}) {
  const slots = fixedNumberArray(values, MONSTER_MONEY_LABELS.length);
  return (
    <div className="scrapbook-array scrapbook-money-array">
      <span>Money Rewards</span>
      <div>
        {MONSTER_MONEY_REWARDS.map((reward, index) => (
          <span key={reward.label} className="scrapbook-money-row" title={MONSTER_MONEY_HELP}>
            <ReferenceIconPreview
              iconId={reward.iconId}
              fallbackValue={index + 1}
              iconEntries={iconEntries}
              catalog={catalog}
              lookups={lookups}
              previewContext={previewContext}
            />
            <strong>{reward.label}</strong>
            <b className="scrapbook-money-value">{slots[index] ?? 0}</b>
          </span>
        ))}
      </div>
      <small>Realmz rolls 0..value for each reward type when this monster drops loot.</small>
    </div>
  );
}

function ScrapbookReferenceRow({
  value,
  label,
  detail,
  iconId,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  preferLibraryIcon = false
}: {
  value: number;
  label: string;
  detail: string;
  iconId: number | null;
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  preferLibraryIcon?: boolean;
}) {
  return (
    <div className="scrapbook-reference-row">
      <ReferenceIconPreview
        iconId={iconId}
        fallbackValue={value}
        iconEntries={iconEntries}
        catalog={catalog}
        lookups={lookups}
        previewContext={previewContext}
        preferLibraryIcon={preferLibraryIcon}
      />
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </div>
  );
}

function ScrapbookEmptyValue({ label }: { label: string }) {
  return <small className="scrapbook-empty-value">{label}</small>;
}

function ReferenceIconPreview({
  iconId,
  fallbackValue,
  iconEntries,
  catalog,
  lookups,
  previewContext,
  preferLibraryIcon = false
}: {
  iconId: number | null;
  fallbackValue: number;
  iconEntries: Record<number, IconEntry>;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  preferLibraryIcon?: boolean;
}) {
  const normalizedIconId = iconId ? Math.abs(iconId) : 0;
  const decoded = iconId ? iconEntries[iconId] ?? iconEntries[normalizedIconId] ?? iconEntries[-normalizedIconId] : null;
  const lookupAsset = normalizedIconId ? lookups.iconAssetsByAbsId.get(normalizedIconId) ?? null : null;
  const libraryAsset = iconId
    ? findLibraryResourceAsset(catalog?.assets ?? [], "cicn", iconId, "icon")
      ?? (normalizedIconId !== iconId ? findLibraryResourceAsset(catalog?.assets ?? [], "cicn", normalizedIconId, "icon") : null)
    : null;
  const directPath = preferLibraryIcon && libraryAsset ? null : decoded?.url ?? lookupAsset?.previewPath ?? null;
  const url = useResolvedPreviewUrl(directPath, null, libraryAsset, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  const usableUrl = url && url !== failedUrl ? url : null;
  return (
    <span className="scrapbook-reference-icon" title={iconId ? `cicn ${iconId}` : `Raw ID ${fallbackValue}`}>
      {usableUrl ? <img src={usableUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(usableUrl)} /> : <b>{fallbackValue}</b>}
    </span>
  );
}

function ScrapbookMonsterIcon({
  entry,
  iconEntries,
  lookups,
  previewContext,
  compact = false
}: {
  entry: LibraryCatalog["entities"][number];
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  compact?: boolean;
}) {
  const iconId = summaryNumber(entry, "iconId");
  const absIconId = Math.abs(iconId);
  const icon = iconEntries[iconId] ?? iconEntries[Math.abs(iconId)] ?? iconEntries[-Math.abs(iconId)];
  const realmzActorAsset = lookups.realmzActorIconAssetsByAbsId.get(absIconId) ?? null;
  const mashAsset = lookups.monsterMashAssetsByAbsId.get(absIconId) ?? null;
  const fallbackAsset = lookups.iconAssetsByAbsId.get(absIconId);
  const realmzActorUrl = useResolvedPreviewUrl(null, null, realmzActorAsset, previewContext);
  const fallbackUrl = useResolvedPreviewUrl(fallbackAsset?.previewPath ?? null, null, mashAsset, previewContext);
  const referenceUrl = isActorOrCreatureIconId(absIconId) ? browserReferenceIconUrl(absIconId) : null;
  const url = realmzActorUrl ?? referenceUrl ?? icon?.url ?? fallbackUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    setFailedUrl(null);
    setLoadedUrl(null);
  }, [url]);
  const usableUrl = url && url !== failedUrl ? url : null;
  const ready = !usableUrl || loadedUrl === usableUrl;
  return (
    <div
      className={compact ? "monster-icon-preview compact" : "monster-icon-preview"}
      data-combat-preview="monster-icon"
      data-combat-preview-ready={ready ? "true" : "false"}
    >
      {usableUrl ? <img src={usableUrl} alt="" loading="lazy" decoding="async" onLoad={() => setLoadedUrl(usableUrl)} onError={() => setFailedUrl(usableUrl)} /> : <span>{iconId || "?"}</span>}
    </div>
  );
}

function scrapbookIndex(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.index === "number" ? entry.summary.index : 0;
}

function scrapbookName(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.displayName === "string" && entry.summary.displayName ? entry.summary.displayName : entry.label;
}

function scrapbookFacts(entry: LibraryCatalog["entities"][number]) {
  return `ID ${scrapbookIndex(entry)}, HD ${summaryNumber(entry, "hitDice")}, armor ${summaryNumber(entry, "armor")}, agility ${summaryNumber(entry, "agility")}, icon ${summaryNumber(entry, "iconId")}`;
}

function scrapbookSearchText(entry: LibraryCatalog["entities"][number]) {
  return `${scrapbookName(entry)} ${scrapbookFacts(entry)} ${scrapbookDescription(entry)} ${entry.source}`;
}

function scrapbookDescription(entry: LibraryCatalog["entities"][number]) {
  return typeof entry.summary.description === "string" ? entry.summary.description : "";
}

function visibleMonsterLibraryEntries(catalog: LibraryCatalog | null) {
  return (catalog?.entities ?? []).filter((entry) => {
    if (entry.type !== "monster-scrapbook-entry") return false;
    return isProvidenceMonsterLibraryEntry(entry) || !isBlankBuiltInScrapbookPlaceholder(entry);
  });
}

function isBlankBuiltInScrapbookPlaceholder(entry: LibraryCatalog["entities"][number]) {
  if (isProvidenceMonsterLibraryEntry(entry)) return false;
  const index = scrapbookIndex(entry);
  const name = scrapbookName(entry).trim();
  if (name !== `Monster ${index}`) return false;
  if (scrapbookDescription(entry).trim()) return false;

  const scalarKeys = [
    "hitDice",
    "staminaBonus",
    "agility",
    "movementMax",
    "armor",
    "magicResistance",
    "distance",
    "size",
    "attackCount",
    "magicAttackCount",
    "damageBonus",
    "castPercent",
    "runPercent",
    "surrenderPercent",
    "missilePercent",
    "weapon",
    "iconId",
    "spellPoints",
    "exp"
  ];
  if (scalarKeys.some((key) => summaryNumber(entry, key) !== 0)) return false;

  const arrayKeys = ["money", "spells", "items", "saves", "spellImmunities"];
  if (arrayKeys.some((key) => summaryNumberArray(entry, key).some((value) => value !== 0))) return false;
  if (summaryNumberRows(entry, "attacks").some((row) => row.some((value) => value !== 0))) return false;

  return true;
}

function battleMonsterPaintEntrySearchText(entry: BattleMonsterPaintEntry) {
  return `${entry.id} ${entry.monster.displayName} icon ${entry.monster.iconId} hd ${entry.monster.hitDice} scenario`;
}

function monsterCopyTargetId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const scrapbookId = preferredMonsterCopyId(project, entry);
  const used = new Set(monsterScenarioIds(project));
  if (scrapbookId > 0 && !used.has(scrapbookId)) return scrapbookId;
  return nextAvailableMonsterRecordId([...used].map((id) => ({ id })));
}

function battleMonsterCopyTargetId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const scrapbookId = preferredMonsterCopyId(project, entry);
  const used = new Set(monsterScenarioIds(project));
  if (scrapbookId > 0 && !used.has(scrapbookId)) return scrapbookId;
  return nextAvailablePlaceableMonsterId([...used].map((id) => ({ id })));
}

function preferredMonsterCopyId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const preferred = typeof entry.summary.preferredScenarioMonsterId === "number" ? Math.trunc(entry.summary.preferredScenarioMonsterId) : scrapbookIndex(entry);
  if (preferred > 0) return preferred;
  return nextAvailableMonsterRecordId(monsterScenarioIds(project).map((id) => ({ id })));
}

function nextAvailableMonsterRecordId(records: Array<{ id: number }>) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return Math.max(1, used.size + 1);
}

function nextAvailablePlaceableMonsterId(records: Array<{ id: number }>) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 1; id <= MAX_DIVINITY_BATTLE_MONSTER_ID; id += 1) {
    if (!used.has(id)) return id;
  }
  return 0;
}

function scrapbookEntryForMonsterId(catalog: LibraryCatalog | null, monsterId: number) {
  return (catalog?.entities ?? []).find((entry) => entry.type === "monster-scrapbook-entry" && scrapbookIndex(entry) === monsterId) ?? null;
}

function copyMonsterLibraryEntryToScenario(
  entry: LibraryCatalog["entities"][number],
  id: number,
  onApplyCommand: ((command: ProjectCommand) => void) | undefined
) {
  const template = monsterRecordFromLibraryEntry(entry, id);
  onApplyCommand?.({
    kind: "createMonsterFromTemplate",
    label: `Copy ${scrapbookName(entry)} to Monster ${id}`,
    id,
    template,
    description: scrapbookDescription(entry)
  });
}

function copyScrapbookMonsterToScenario(
  entry: LibraryCatalog["entities"][number],
  id: number,
  onApplyCommand: ((command: ProjectCommand) => void) | undefined
) {
  copyMonsterLibraryEntryToScenario(entry, id, onApplyCommand);
}

export async function materializeMonsterLibraryIconOverrides(
  entries: MonsterLibraryCopyEntry[],
  project: Project,
  catalog: LibraryCatalog | null,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterMashAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry>,
  previewContext: PreviewRuntimeContext,
  onApplyCommand?: (command: ProjectCommand) => void
) {
  if (!onApplyCommand || entries.length === 0) return [] as MonsterIconOverride[];
  const overrides: MonsterIconOverride[] = [];
  const seenTargets = new Set<number>();
  for (const entry of entries) {
    const override = await monsterIconOverrideForLibraryCopy(entry.entry, entry.template, project, catalog, lookups, iconEntries, previewContext);
    if (!override) continue;
    const targetBaseIconId = normalizedMonsterIconBaseId(override.targetBaseIconId);
    if (!targetBaseIconId || seenTargets.has(targetBaseIconId)) continue;
    seenTargets.add(targetBaseIconId);
    overrides.push(override);
  }
  for (const override of overrides) {
    onApplyCommand({
      kind: "upsertMonsterIconOverride",
      label: `Materialize monster icon ${override.targetBaseIconId} from ${override.sourceLabel ?? `Source ${override.sourceBaseIconId}`}`,
      override
    });
  }
  return overrides;
}

export async function monsterIconOverrideForLibraryCopy(
  entry: LibraryCatalog["entities"][number],
  template: MonsterRecord,
  project: Project,
  catalog: LibraryCatalog | null,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterMashAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry>,
  previewContext: PreviewRuntimeContext
): Promise<MonsterIconOverride | null> {
  const targetBaseIconId = normalizedMonsterIconBaseId(template.iconId);
  if (!targetBaseIconId) return null;
  const targetPair = resolveMonsterIconTargetPair(project, lookups, iconEntries, targetBaseIconId, true);
  if (targetPair) return null;
  const source = monsterIconSourcePairs(catalog, lookups).find((candidate) => candidate.baseId === targetBaseIconId);
  if (!source?.asset || !source.pairedAsset || !source.sourceKind) return null;
  try {
    const [sourceBaseResourceBase64, sourcePairedResourceBase64] = await Promise.all([
      loadLibraryResourceBase64(source.asset, previewContext, catalog),
      loadLibraryResourceBase64(source.pairedAsset, previewContext, catalog)
    ]);
    if (!sourceBaseResourceBase64 || !sourcePairedResourceBase64) return null;
    return {
      targetBaseIconId,
      sourceBaseIconId: source.baseId,
      sourceKind: source.sourceKind,
      sourceLabel: source.sourceLabel ?? source.asset.label ?? scrapbookName(entry),
      sourceBaseResourceBase64,
      sourcePairedResourceBase64
    };
  } catch {
    return null;
  }
}

function monsterRecordFromLibraryEntry(entry: LibraryCatalog["entities"][number], id: number): MonsterRecord {
  const template = monsterLibraryEntryTemplate(entry);
  if (template) {
    return {
      ...template,
      id,
      displayName: template.displayName || scrapbookName(entry),
      authored: true
    };
  }
  return monsterRecordFromScrapbookEntry(entry, id);
}

function monsterRecordFromScrapbookEntry(entry: LibraryCatalog["entities"][number], id: number): MonsterRecord {
  const rawSource = summaryNumberArray(entry, "rawBytes");
  const hasRaw = rawSource.length >= MONSTER_RECORD_BYTES;
  const rawBytes = fixedNumberArray(rawSource, MONSTER_RECORD_BYTES);
  const byte = (offset: number, fallbackKey?: string) => hasRaw ? rawBytes[offset] ?? 0 : fallbackKey ? summaryNumber(entry, fallbackKey) : 0;
  const signed = (offset: number, fallbackKey?: string) => signedByte(byte(offset, fallbackKey));
  const short = (offset: number, fallbackKey?: string) => hasRaw ? i16At(rawBytes, offset) : fallbackKey ? summaryNumber(entry, fallbackKey) : 0;

  return {
    id,
    hitDice: byte(0, "hitDice"),
    staminaBonus: byte(1, "staminaBonus"),
    agility: byte(2, "agility"),
    nameId: byte(3),
    movementMax: byte(4, "movementMax"),
    armor: signed(5, "armor"),
    magicResistance: signed(6, "magicResistance"),
    distance: signed(7, "distance"),
    traitor: signed(8),
    size: signed(9, "size"),
    typeFlags: hasRaw ? Array.from({ length: 8 }, (_, index) => signedByte(rawBytes[10 + index] ?? 0)) : new Array(8).fill(0),
    attackCount: signed(18, "attackCount"),
    magicAttackCount: signed(19, "magicAttackCount"),
    attacks: hasRaw
      ? Array.from({ length: 5 }, (_, row) => Array.from({ length: 4 }, (_, slot) => signedByte(rawBytes[20 + row * 4 + slot] ?? 0)))
      : Array.from({ length: 5 }, (_, row) => fixedNumberArray(summaryNumberRows(entry, "attacks")[row], 4)),
    damageBonus: signed(40, "damageBonus"),
    castPercent: signed(41, "castPercent"),
    runPercent: signed(42, "runPercent"),
    surrenderPercent: signed(43, "surrenderPercent"),
    missilePercent: signed(44, "missilePercent"),
    canSummon: signed(45, "canSummon"),
    saves: hasRaw ? Array.from({ length: 6 }, (_, index) => signedByte(rawBytes[46 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "saves"), 6),
    spellImmunities: hasRaw ? Array.from({ length: 6 }, (_, index) => signedByte(rawBytes[52 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "spellImmunities"), 6),
    money: hasRaw ? Array.from({ length: 3 }, (_, index) => i16At(rawBytes, 58 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "money"), 3),
    spells: hasRaw ? Array.from({ length: 10 }, (_, index) => i16At(rawBytes, 64 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "spells"), 10),
    items: hasRaw ? Array.from({ length: 6 }, (_, index) => i16At(rawBytes, 84 + index * 2)) : fixedNumberArray(summaryNumberArray(entry, "items"), 6),
    weapon: short(96, "weapon"),
    iconId: short(98, "iconId"),
    spellPoints: short(100, "spellPoints"),
    exp: short(102, "exp"),
    stamina: short(104, "stamina"),
    staminaMax: short(106, "staminaMax"),
    underneath: hasRaw ? Array.from({ length: 4 }, (_, index) => i16At(rawBytes, 108 + index * 2)) : new Array(4).fill(0),
    target: signed(116),
    guarding: signed(117),
    notOnMenu: hasRaw ? (rawBytes[118] ?? 0) !== 0 : false,
    beenAttacked: signed(119),
    movement: signed(120),
    magicToHit: signed(121, "magicToHit"),
    conditions: hasRaw ? Array.from({ length: 40 }, (_, index) => signedByte(rawBytes[122 + index] ?? 0)) : fixedNumberArray(summaryNumberArray(entry, "conditions"), 40),
    lr: signed(162),
    up: signed(163),
    attackNum: signed(164),
    bonusAttack: signed(165),
    deathMacro: short(166, "deathMacro"),
    maxSpellPoints: short(168, "maxSpellPoints"),
    displayName: scrapbookName(entry),
    rawBytes,
    authored: true
  };
}

function summaryNumber(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function summaryNumberArray(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}

function summaryNumberRows(entry: LibraryCatalog["entities"][number], key: string) {
  const value = entry.summary[key];
  return Array.isArray(value)
    ? value.map((row) => Array.isArray(row) ? row.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [])
    : [];
}

function fixedNumberArray(values: number[] | undefined, length: number) {
  return Array.from({ length }, (_, index) => Number(values?.[index] ?? 0));
}

function signedByte(value: number) {
  const byte = value & 0xff;
  return byte > 0x7f ? byte - 0x100 : byte;
}

function i16At(bytes: number[], offset: number) {
  const high = bytes[offset] ?? 0;
  const low = bytes[offset + 1] ?? 0;
  const value = ((high & 0xff) << 8) | (low & 0xff);
  return value & 0x8000 ? value - 0x10000 : value;
}

function combatSpellOptions(project: Project, catalog: LibraryCatalog | null): CombatSelectOption[] {
  const options = new Map<number, CombatSelectOption>();
  const add = (option: CombatSelectOption) => {
    if (!option.value || options.has(option.value)) return;
    options.set(option.value, option);
  };
  for (const spell of project.spellOverrides ?? []) {
    const name = spell.displayName?.trim() || `Custom Spell ${spell.id}`;
    add({ key: `project-spell:${spell.id}`, value: spell.id, label: `${name} (${spell.id})`, detail: "Scenario custom spell override" });
  }
  for (const entry of catalog?.records ?? []) {
    if (entry.type !== "spell") continue;
    const id = recordSummaryNumber(entry, "packedSpellId");
    if (id == null) continue;
    const displayName = recordSummaryString(entry, "displayName");
    const level = recordSummaryNumber(entry, "spellLevel");
    const spellClass = recordSummaryNumber(entry, "spellcasterClass");
    add({
      key: entry.id,
      value: id,
      label: `${displayName || entry.label || "Spell"} (${id})`,
      detail: [
        level != null ? `level ${level}` : "",
        spellClass != null ? `class ${spellClass + 1}` : "",
        entry.source
      ].filter(Boolean).join(" | ")
    });
  }
  return [...options.values()].sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
}

function spellPreviewIconIdMap(project: Project, catalog: LibraryCatalog | null) {
  const icons = new Map<number, number>();
  const add = (id: number | null, summary: Record<string, unknown>) => {
    if (!id || icons.has(id)) return;
    const iconId = spellPreviewIconId(summary);
    if (iconId) icons.set(id, iconId);
  };
  for (const spell of project.spellOverrides ?? []) {
    add(spell.id, { spellLook1: spell.spellLook1, spellLook2: spell.spellLook2 });
  }
  for (const record of catalog?.records ?? []) {
    if (record.type !== "spell") continue;
    add(recordSummaryNumber(record, "packedSpellId"), record.summary);
  }
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "spell") continue;
    add(summaryFieldNumber(entity.summary, "packedSpellId"), entity.summary);
  }
  return icons;
}

function spellPreviewIconId(summary: Record<string, unknown>) {
  const castLook = summaryFieldNumber(summary, "spellLook1");
  if (castLook != null) {
    const frame = spellAnimationFrameIds(castLook, "blank-cast")[0];
    if (frame) return frame;
  }
  const resolutionLook = summaryFieldNumber(summary, "spellLook2");
  if (resolutionLook != null) {
    return spellAnimationFrameIds(resolutionLook, "default-resolution")[0] ?? null;
  }
  return null;
}

function summaryFieldNumber(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordSummaryNumber(record: LibraryCatalog["records"][number], key: string) {
  const value = record.summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordSummaryString(record: LibraryCatalog["records"][number], key: string) {
  const value = record.summary[key];
  return typeof value === "string" ? value.trim() : "";
}


function EmptyCombatEditor({ title, body }: { title: string; body: string }) {
  return (
    <article className="combat-editor empty">
      <h2>{title}</h2>
      <p>{body}</p>
    </article>
  );
}

function filterRecords<T>(records: T[], query: string, text: (record: T) => string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => text(record).toLowerCase().includes(needle));
}

export function monsterIconSourceStatusLabel(status: MonsterIconSourceStatus) {
  if (status === "scenario-override") return "Scenario override";
  if (status === "scenario-resource") return "Scenario resource";
  if (status === "default-art") return "Default art";
  return "Missing art";
}

function monsterIconTargetStatusTitle(status: MonsterIconSourceStatus) {
  if (status === "scenario-override") return "Scenario-owned override art. Providence exports this paired cicn set for the target ID.";
  if (status === "scenario-resource") return "Scenario-owned paired cicn resources imported from this project.";
  if (status === "default-art") return "Default Realmz art resolved at runtime. This row is not exported as scenario-owned art unless replaced with an override.";
  return "This target ID has no complete paired art.";
}

function monsterIconTargetSourceStatus(target: MonsterIconPairOption): Exclude<MonsterIconSourceStatus, "missing-art"> {
  if (target.override) return "scenario-override";
  if (target.asset?.source === "Scenario icon resources" || target.sourceLabel?.toLowerCase().startsWith("scenario")) return "scenario-resource";
  return "default-art";
}

export function monsterIconPickerOptions(
  project: Project,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry> = {}
): MonsterIconPickerOption[] {
  return monsterIconTargetPairs(project, lookups, iconEntries).map((target) => ({
    key: target.key,
    baseId: target.baseId,
    asset: target.asset,
    pairedAsset: target.pairedAsset,
    sourceStatus: monsterIconTargetSourceStatus(target),
    sourceLabel: target.sourceLabel ?? target.asset?.label ?? `Icon ${target.baseId}`
  }));
}

function monsterReferencedIconIds(project: Project) {
  return uniqueSortedNumbers([
    ...(project.monsters ?? []).map((monster) => Math.abs(monster.iconId)),
    ...(project.monsterSets ?? []).flatMap((set) => set.monsters.map((monster) => Math.abs(monster.iconId)))
  ]).filter((id) => id > 0);
}

export function monsterIconTargetPairs(
  project: Project,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry> = {}
): MonsterIconPairOption[] {
  const referencedIconIds = monsterReferencedIconIds(project);
  const referenced = new Set(referencedIconIds);
  const candidates = new Set<number>(referencedIconIds);
  for (const id of lookups.realmzActorIconAssetsByAbsId.keys()) {
    if (isMonsterIconPairBase(id, lookups.realmzActorIconAssetsByAbsId)) candidates.add(id);
  }
  for (const override of project.monsterIconOverrides ?? []) {
    candidates.add(Math.abs(override.targetBaseIconId));
  }
  return [...candidates]
    .filter((baseId) => baseId > 0 && baseId + MONSTER_ICON_PAIR_OFFSET <= 32767)
    .sort((left, right) => left - right)
    .map((baseId) => resolveMonsterIconTargetPair(project, lookups, iconEntries, baseId, referenced.has(baseId)))
    .filter((target): target is MonsterIconPairOption => Boolean(target));
}

export function monsterIconSetTabCount(
  project: Project,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry> = {}
) {
  return measureCombatWork("monsterIconSetTabCount", () => {
    const candidates = new Set<number>(monsterReferencedIconIds(project));
    for (const id of lookups.realmzActorIconAssetsByAbsId.keys()) {
      if (isMonsterIconPairBase(id, lookups.realmzActorIconAssetsByAbsId)) candidates.add(id);
    }
    for (const override of project.monsterIconOverrides ?? []) {
      candidates.add(Math.abs(override.targetBaseIconId));
    }
    const projectIconReferences = projectIconReferenceSet(project);
    const scenarioResourceIds = new Set(
      (project.scenarioIconResources ?? [])
        .filter((resource) => Boolean(resource.resourceBase64))
        .map((resource) => Math.abs(resource.resourceId))
    );
    let count = 0;
    const counted = new Set<number>();
    for (const rawBaseId of candidates) {
      const baseId = normalizedMonsterIconBaseId(rawBaseId);
      if (!baseId || counted.has(baseId)) continue;
      const pairedId = baseId + MONSTER_ICON_PAIR_OFFSET;
      counted.add(baseId);
      if (lookups.monsterIconOverridesByTarget.has(baseId)) {
        count += 1;
        continue;
      }
      if (scenarioResourceIds.has(baseId) && scenarioResourceIds.has(pairedId)) {
        count += 1;
        continue;
      }
      const projectBase = lookups.iconAssetsByAbsId.get(baseId) ?? null;
      const projectPaired = lookups.iconAssetsByAbsId.get(pairedId) ?? null;
      if (projectBase?.previewPath && projectPaired?.previewPath) {
        count += 1;
        continue;
      }
      const entryBase = iconEntries[baseId] ?? iconEntries[-baseId] ?? null;
      const entryPaired = iconEntries[pairedId] ?? iconEntries[-pairedId] ?? null;
      if (entryBase?.url && entryPaired?.url && projectIconReferences.has(baseId) && projectIconReferences.has(pairedId)) {
        count += 1;
        continue;
      }
      if (lookups.realmzActorIconAssetsByAbsId.has(baseId) && lookups.realmzActorIconAssetsByAbsId.has(pairedId)) {
        count += 1;
      }
    }
    return count;
  });
}

export function resolveMonsterIconTargetPair(
  project: Project,
  lookups: Pick<CombatLookups, "iconAssetsByAbsId" | "realmzActorIconAssetsByAbsId" | "monsterIconOverridesByTarget">,
  iconEntries: Record<number, IconEntry>,
  rawBaseId: number,
  referenced = false
): MonsterIconPairOption | null {
  const baseId = normalizedMonsterIconBaseId(rawBaseId);
  if (!baseId) return null;
  const pairedId = baseId + MONSTER_ICON_PAIR_OFFSET;
  const override = lookups.monsterIconOverridesByTarget.get(baseId) ?? null;
  if (override) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: previewAssetFromBase64(baseId, `${override.sourceLabel ?? `Scenario icon ${baseId}`} base`, override.sourceBaseResourceBase64, `monster-icon-override:${baseId}:base`),
      pairedAsset: previewAssetFromBase64(pairedId, `${override.sourceLabel ?? `Scenario icon ${baseId}`} paired`, override.sourcePairedResourceBase64, `monster-icon-override:${baseId}:paired`),
      resourceBase64: override.sourceBaseResourceBase64,
      pairedResourceBase64: override.sourcePairedResourceBase64,
      referenced,
      override,
      sourceLabel: override.sourceLabel ?? `Scenario icon override ${baseId}`
    };
  }

  const scenarioResourceBase = (project.scenarioIconResources ?? []).find((resource) => Math.abs(resource.resourceId) === baseId) ?? null;
  const scenarioResourcePaired = (project.scenarioIconResources ?? []).find((resource) => Math.abs(resource.resourceId) === pairedId) ?? null;
  if (scenarioResourceBase?.resourceBase64 && scenarioResourcePaired?.resourceBase64) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: previewAssetFromBase64(baseId, scenarioResourceBase.label || `Scenario cicn ${baseId}`, scenarioResourceBase.resourceBase64, `scenario-icon-resource:${baseId}:base`, scenarioResourceBase.previewPath ?? null),
      pairedAsset: previewAssetFromBase64(pairedId, scenarioResourcePaired.label || `Scenario cicn ${pairedId}`, scenarioResourcePaired.resourceBase64, `scenario-icon-resource:${baseId}:paired`, scenarioResourcePaired.previewPath ?? null),
      resourceBase64: scenarioResourceBase.resourceBase64,
      pairedResourceBase64: scenarioResourcePaired.resourceBase64,
      referenced,
      sourceLabel: `Scenario resources ${baseId} / ${pairedId}`
    };
  }

  const projectBase = lookups.iconAssetsByAbsId.get(baseId) ?? null;
  const projectPaired = lookups.iconAssetsByAbsId.get(pairedId) ?? null;
  if (projectBase?.previewPath && projectPaired?.previewPath) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: previewAssetFromCombatIconAsset(baseId, projectBase, `project-icon:${baseId}:base`),
      pairedAsset: previewAssetFromCombatIconAsset(pairedId, projectPaired, `project-icon:${baseId}:paired`),
      referenced,
      sourceLabel: `Scenario icons ${baseId} / ${pairedId}`
    };
  }

  const entryBase = iconEntries[baseId] ?? iconEntries[-baseId] ?? null;
  const entryPaired = iconEntries[pairedId] ?? iconEntries[-pairedId] ?? null;
  if (entryBase?.url && entryPaired?.url && hasProjectIconReference(project, baseId) && hasProjectIconReference(project, pairedId)) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: previewAssetFromUrl(baseId, `Scenario cicn ${baseId}`, entryBase.url, `decoded-project-icon:${baseId}:base`),
      pairedAsset: previewAssetFromUrl(pairedId, `Scenario cicn ${pairedId}`, entryPaired.url, `decoded-project-icon:${baseId}:paired`),
      referenced,
      sourceLabel: `Scenario icons ${baseId} / ${pairedId}`
    };
  }

  const defaultBase = lookups.realmzActorIconAssetsByAbsId.get(baseId) ?? null;
  const defaultPaired = lookups.realmzActorIconAssetsByAbsId.get(pairedId) ?? null;
  if (defaultBase && defaultPaired) {
    return {
      key: `target:${baseId}`,
      baseId,
      asset: defaultBase,
      pairedAsset: defaultPaired,
      referenced,
      sourceLabel: defaultBase.label || `Family Jewels ${baseId}`
    };
  }

  return null;
}

function hasProjectIconReference(project: Project, resourceId: number) {
  const id = Math.abs(resourceId);
  return projectIconReferenceSet(project).has(id);
}

function projectIconReferenceSet(project: Project) {
  return new Set([
    ...(project.assetCatalog?.icons ?? []).map((asset) => Math.abs(asset.resourceId)),
    ...(project.scenarioIconResources ?? []).map((resource) => Math.abs(resource.resourceId)),
    ...(project.assets ?? [])
      .filter((asset) => asset.resourceType === "cicn")
      .map((asset) => Math.abs(asset.resourceId))
  ]);
}

function previewAssetFromBase64(resourceId: number, label: string, resourceBase64: string, id: string, fallback: string | null = null): LibraryAsset {
  return previewAssetFromUrl(resourceId, label, previewPathFromCicnBase64(resourceBase64, fallback), id);
}

function previewAssetFromCombatIconAsset(resourceId: number, asset: CombatIconAsset, id: string): LibraryAsset {
  return previewAssetFromUrl(resourceId, asset.label || `cicn ${resourceId}`, asset.previewPath ?? null, id);
}

function previewAssetFromUrl(resourceId: number, label: string, previewPath: string | null, id: string): LibraryAsset {
  return {
    id,
    type: "scenario-monster-icon",
    label,
    source: "Scenario icon resources",
    relativePath: id,
    bytes: 0,
    sha256: `preview:${id}`,
    resourceType: "cicn",
    resourceId,
    previewPath,
    mimeType: "image/png"
  };
}

function monsterIconSourcePairs(catalog: LibraryCatalog | null, lookups: Pick<CombatLookups, "monsterMashAssetsByAbsId">): MonsterIconPairOption[] {
  const monsterMashPairs = [...lookups.monsterMashAssetsByAbsId.keys()]
    .filter((baseId) => isMonsterIconPairBase(baseId, lookups.monsterMashAssetsByAbsId))
    .sort((left, right) => left - right)
    .map((baseId) => ({
      key: `monster-mash:${baseId}`,
      baseId,
      asset: lookups.monsterMashAssetsByAbsId.get(baseId) ?? null,
      pairedAsset: lookups.monsterMashAssetsByAbsId.get(baseId + MONSTER_ICON_PAIR_OFFSET) ?? null,
      sourceKind: "monster-mash" as const,
      sourceLabel: `Monster Mash ${baseId}`,
      facingMode: "custom" as const
    }));
  const providencePairs = (catalog?.entities ?? [])
    .filter((entity) => isProvidenceIconLibraryEntry(entity) && iconLibraryEntryKind(entity) === "monster-pair")
    .map((entity) => {
      const number = iconLibraryEntityNumber(entity);
      const asset = catalog?.assets.find((candidate) => candidate.id === `library-asset:providence:icon-library:${number}:base`) ?? null;
      const pairedAsset = catalog?.assets.find((candidate) => candidate.id === `library-asset:providence:icon-library:${number}:paired`) ?? null;
      const baseId = Math.abs(asset?.resourceId ?? 0);
      const metadata = iconLibraryMonsterPairMetadata(entity);
      return {
        key: entity.id,
        baseId,
        asset,
        pairedAsset,
        sourceKind: "providence-library" as const,
        sourceLabel: entity.label || asset?.label || `Providence Icon ${baseId}`,
        facingMode: metadata.facingMode,
        canvas: metadata.canvas
      };
    })
    .filter((source) => source.baseId > 0 && source.pairedAsset);
  return [...monsterMashPairs, ...providencePairs];
}

export function nextScenarioMonsterIconTargetBaseId(
  sourceBaseIconId: number,
  targets: Array<Pick<MonsterIconPairOption, "baseId" | "override">>
) {
  const occupiedResourceIds = new Set<number>();
  for (const target of targets) {
    if (!target.override) continue;
    const baseId = normalizedMonsterIconBaseId(target.baseId);
    if (!baseId) continue;
    occupiedResourceIds.add(baseId);
    occupiedResourceIds.add(baseId + MONSTER_ICON_PAIR_OFFSET);
  }

  const sourceBaseId = normalizedMonsterIconBaseId(sourceBaseIconId);
  const fromSource = firstAvailableMonsterIconBaseId(sourceBaseId, occupiedResourceIds);
  if (fromSource) return fromSource;
  return firstAvailableMonsterIconBaseId(IMPORTED_MONSTER_ICON_BASE_START, occupiedResourceIds);
}

function firstAvailableMonsterIconBaseId(startBaseId: number, occupiedResourceIds: Set<number>) {
  const start = normalizedMonsterIconBaseId(startBaseId);
  if (!start) return 0;
  for (let baseId = start; baseId + MONSTER_ICON_PAIR_OFFSET <= 32767; baseId += 1) {
    if (!occupiedResourceIds.has(baseId) && !occupiedResourceIds.has(baseId + MONSTER_ICON_PAIR_OFFSET)) return baseId;
  }
  return 0;
}

function normalizedMonsterIconBaseId(baseId: number) {
  const normalized = Math.trunc(Math.abs(baseId));
  return normalized > 0 && normalized + MONSTER_ICON_PAIR_OFFSET <= 32767 ? normalized : 0;
}

function iconLibraryEntityNumber(entity: LibraryCatalog["entities"][number]) {
  const value = entity.summary.libraryNumber;
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function isMonsterIconPairBase(baseId: number, assets: Map<number, LibraryAsset>) {
  if (!Number.isInteger(baseId) || baseId <= 0) return false;
  if (!assets.has(baseId) || !assets.has(baseId + MONSTER_ICON_PAIR_OFFSET)) return false;
  return !assets.has(baseId - MONSTER_ICON_PAIR_OFFSET);
}

function IconPairPreview({
  baseAsset,
  pairedAsset,
  previewContext
}: {
  baseAsset: LibraryAsset | null;
  pairedAsset: LibraryAsset | null;
  previewContext: PreviewRuntimeContext;
}) {
  return (
    <span className="icon-pair-preview" aria-hidden="true">
      <LibraryIconSwatch asset={baseAsset} previewContext={previewContext} />
      <LibraryIconSwatch asset={pairedAsset} previewContext={previewContext} />
    </span>
  );
}

function LibraryIconSwatch({
  asset,
  previewContext
}: {
  asset: LibraryAsset | null;
  previewContext: PreviewRuntimeContext;
}) {
  const resourceId = asset?.resourceId ?? 0;
  const url = useResolvedPreviewUrl(asset?.previewPath ?? null, null, asset, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => setFailedUrl(null), [url]);
  const usableUrl = url && url !== failedUrl ? url : null;
  return (
    <span className="icon-pair-swatch" title={asset?.label ?? (resourceId ? `cicn ${resourceId}` : "Missing paired icon")}>
      {usableUrl ? <img src={usableUrl} alt="" loading="lazy" decoding="async" onError={() => setFailedUrl(usableUrl)} /> : <b>{resourceId || "?"}</b>}
    </span>
  );
}

async function loadLibraryResourceBase64(asset: LibraryAsset, previewContext: PreviewRuntimeContext, catalog?: LibraryCatalog | null) {
  const providenceBase64 = iconLibraryAssetResourceBase64(catalog, asset);
  if (providenceBase64) return providenceBase64;
  if (previewContext.desktopRuntime) {
    if (!previewContext.workspaceDir) throw new Error("Workspace directory is required to load Monster Mash resource data.");
    return invoke<string>("load_library_resource_data", {
      workspaceDir: previewContext.workspaceDir,
      source: asset.source,
      relativePath: asset.relativePath
    });
  }
  const data = await loadBrowserBundledLibraryResourceData(asset);
  return data ? bytesToBase64(data) : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function previewPathFromCicnBase64(resourceBase64: string, fallback: string | null) {
  try {
    const binary = atob(resourceBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return inspectResourcePreview("cicn", bytes).dataUrl ?? fallback;
  } catch {
    return fallback;
  }
}

function monsterIconCanvasPreset(key: (typeof MONSTER_ICON_CANVAS_PRESETS)[number]["key"]) {
  return MONSTER_ICON_CANVAS_PRESETS.find((preset) => preset.key === key) ?? MONSTER_ICON_CANVAS_PRESETS[0];
}

function nextImportedMonsterIconBaseId(sources: MonsterIconPairOption[]) {
  const used = new Set(sources.map((source) => Math.abs(source.baseId)));
  for (let baseId = IMPORTED_MONSTER_ICON_BASE_START; baseId + MONSTER_ICON_PAIR_OFFSET <= 32767; baseId += 1) {
    if (!used.has(baseId) && !used.has(baseId + MONSTER_ICON_PAIR_OFFSET)) return baseId;
  }
  return IMPORTED_MONSTER_ICON_BASE_START + used.size;
}

function stripFileExtension(name: string) {
  return name.replace(/\.[^.]+$/, "").trim();
}

async function loadImageFileToRgba(file: File, width: number, height: number) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Unable to load ${file.name}.`));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const left = Math.floor((width - drawWidth) / 2);
    const top = Math.floor((height - drawHeight) / 2);
    context.drawImage(image, left, top, drawWidth, drawHeight);
    return { width, height, rgba: context.getImageData(0, 0, width, height).data };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function rgbaToDataUrl(image: { width: number; height: number; rgba: Uint8Array | Uint8ClampedArray }) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
}

function uniqueSortedNumbers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isFinite(value)).map((value) => Math.trunc(value)))]
    .sort((left, right) => left - right);
}

function battleGridStorageIndexFromDisplayIndex(displayIndex: number) {
  const displayCol = displayIndex % BATTLE_GRID_SIZE;
  const displayRow = Math.floor(displayIndex / BATTLE_GRID_SIZE);
  return displayCol * BATTLE_GRID_SIZE + displayRow;
}

function battleGridStorageIndexFromDisplayCoords(displayCol: number, displayRow: number) {
  return displayCol * BATTLE_GRID_SIZE + displayRow;
}

function battleGridDisplayCoordsFromStorageIndex(storageIndex: number) {
  return {
    col: Math.floor(storageIndex / BATTLE_GRID_SIZE),
    row: storageIndex % BATTLE_GRID_SIZE
  };
}

function topVisiblePlacementAtDisplayCell(placements: BattleGridPlacementView[], displayCol: number, displayRow: number) {
  for (let index = placements.length - 1; index >= 0; index -= 1) {
    if (placementIntersectsDisplayCell(placements[index], displayCol, displayRow)) return placements[index];
  }
  return null;
}

function placementIntersectsDisplayCell(placement: BattleGridPlacementView, displayCol: number, displayRow: number) {
  const colSpan = Math.max(0.5, Math.min(placement.footprint.width, BATTLE_GRID_SIZE));
  const rowSpan = Math.max(0.5, Math.min(placement.footprint.height, BATTLE_GRID_SIZE));
  const leftCell = clamp(placement.col + 1 - colSpan, 0, BATTLE_GRID_SIZE - colSpan);
  const topCell = clamp(placement.row + 1 - rowSpan, 0, BATTLE_GRID_SIZE - rowSpan);
  return displayCol < leftCell + colSpan
    && displayCol + 1 > leftCell
    && displayRow < topCell + rowSpan
    && displayRow + 1 > topCell;
}

function normalizeBattleGridForEditor(grid: number[] | undefined) {
  return Array.from({ length: BATTLE_GRID_CELL_COUNT }, (_, index) => {
    const value = grid?.[index] ?? 0;
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  });
}

function battleGridChanges(fromGrid: number[], toGrid: number[]): BattleGridCellChange[] {
  const changes: BattleGridCellChange[] = [];
  for (let index = 0; index < BATTLE_GRID_CELL_COUNT; index += 1) {
    const from = Number(fromGrid[index] ?? 0);
    const to = Number(toGrid[index] ?? 0);
    if (from !== to) changes.push({ index, from, to });
  }
  return changes;
}

function syncBattleCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const size = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
  const scale = window.devicePixelRatio || 1;
  const pixelSize = Math.max(1, Math.round(size * scale));
  if (canvas.width !== pixelSize) canvas.width = pixelSize;
  if (canvas.height !== pixelSize) canvas.height = pixelSize;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  return { ctx, size };
}

function drawBattleGridLayer(ctx: CanvasRenderingContext2D, size: number, cells: BattleGridCellView[]) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const cellSize = size / BATTLE_GRID_SIZE;
  ctx.fillStyle = "#f7f7f7";
  for (const cell of cells) {
    if (!cell.value) continue;
    ctx.fillRect(cell.displayCol * cellSize, cell.displayRow * cellSize, cellSize, cellSize);
  }
  ctx.strokeStyle = "#b8b8b8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let index = 1; index < BATTLE_GRID_SIZE; index += 1) {
    const position = Math.round(index * cellSize) + 0.5;
    ctx.moveTo(position, 0);
    ctx.lineTo(position, size);
    ctx.moveTo(0, position);
    ctx.lineTo(size, position);
  }
  ctx.stroke();
}

function drawBattleMonsterLayer(
  ctx: CanvasRenderingContext2D,
  size: number,
  placements: BattleGridPlacementView[],
  imagesByPlacement: Record<string, BattleCanvasImageEntry>,
  draggingIndex: number | null
) {
  ctx.clearRect(0, 0, size, size);
  const cellSize = size / BATTLE_GRID_SIZE;
  for (const placement of placements) {
    const rect = battlePlacementRect(placement, cellSize);
    ctx.save();
    if (draggingIndex === placement.index) ctx.globalAlpha = 0.55;
    const image = imagesByPlacement[battlePlacementCanvasKey(placement)]?.image ?? null;
    if (image) drawImageContained(ctx, image, rect.x, rect.y, rect.width, rect.height);
    else drawMissingBattleMonster(ctx, placement, rect);
    if (placement.alternateSide) {
      ctx.strokeStyle = "#2fa85f";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(1, rect.width - 2), Math.max(1, rect.height - 2));
      ctx.shadowColor = "#2fa85f";
      ctx.shadowBlur = 4;
      ctx.strokeRect(rect.x + 3, rect.y + 3, Math.max(1, rect.width - 6), Math.max(1, rect.height - 6));
    }
    ctx.restore();
  }
}

function drawBattleInteractionLayer(
  ctx: CanvasRenderingContext2D,
  size: number,
  cells: BattleGridCellView[],
  placements: BattleGridPlacementView[],
  paintPreview: BattleGridPaintPreview | null,
  selectedIndex: number,
  hoverIndex: number | null
) {
  ctx.clearRect(0, 0, size, size);
  const cellSize = size / BATTLE_GRID_SIZE;
  if (paintPreview) drawBattlePaintPreview(ctx, paintPreview, cellSize);
  if (hoverIndex != null) {
    const hover = cells.find((cell) => cell.index === hoverIndex);
    if (hover) drawBattleCellOutline(ctx, hover.displayCol, hover.displayRow, cellSize, "#ff9d8f", 2);
  }
  const selectedCell = cells.find((cell) => cell.index === selectedIndex);
  if (selectedCell) drawBattleCellOutline(ctx, selectedCell.displayCol, selectedCell.displayRow, cellSize, "#f2cb70", 3);
  const selectedPlacement = placements.find((placement) => placement.index === selectedIndex);
  if (selectedPlacement) {
    const rect = battlePlacementRect(selectedPlacement, cellSize);
    ctx.strokeStyle = "#f2cb70";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 2, rect.y + 2, Math.max(1, rect.width - 4), Math.max(1, rect.height - 4));
  }
}

function drawBattlePaintPreview(ctx: CanvasRenderingContext2D, preview: BattleGridPaintPreview, cellSize: number) {
  const coveredCells = battlePlacementCoveredDisplayCells(preview);
  ctx.save();
  for (const cell of coveredCells) {
    if (cell.index === preview.anchorIndex) continue;
    drawBattleCellFill(ctx, cell.col, cell.row, cellSize, "rgba(42, 158, 234, 0.24)", "rgba(42, 158, 234, 0.78)", 1.5);
  }
  const anchor = battleGridDisplayCoordsFromStorageIndex(preview.anchorIndex);
  drawBattleCellFill(ctx, anchor.col, anchor.row, cellSize, "rgba(242, 203, 112, 0.38)", "rgba(255, 184, 71, 0.95)", 2.5);
  ctx.restore();
}

function battlePlacementCoveredDisplayCells(preview: BattleGridPaintPreview) {
  const colSpan = Math.max(0.5, Math.min(preview.footprint.width, BATTLE_GRID_SIZE));
  const rowSpan = Math.max(0.5, Math.min(preview.footprint.height, BATTLE_GRID_SIZE));
  const leftCell = clamp(preview.col + 1 - colSpan, 0, BATTLE_GRID_SIZE - colSpan);
  const topCell = clamp(preview.row + 1 - rowSpan, 0, BATTLE_GRID_SIZE - rowSpan);
  const left = Math.floor(leftCell);
  const top = Math.floor(topCell);
  const right = Math.min(BATTLE_GRID_SIZE, Math.ceil(leftCell + colSpan));
  const bottom = Math.min(BATTLE_GRID_SIZE, Math.ceil(topCell + rowSpan));
  const cells: Array<{ col: number; row: number; index: number }> = [];
  for (let row = top; row < bottom; row += 1) {
    for (let col = left; col < right; col += 1) {
      cells.push({ col, row, index: battleGridStorageIndexFromDisplayCoords(col, row) });
    }
  }
  return cells;
}

function drawBattleCellFill(ctx: CanvasRenderingContext2D, col: number, row: number, cellSize: number, fill: string, stroke: string, width: number) {
  const inset = width / 2;
  const x = col * cellSize;
  const y = row * cellSize;
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y + 1, Math.max(1, cellSize - 2), Math.max(1, cellSize - 2));
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.strokeRect(x + inset, y + inset, cellSize - width, cellSize - width);
}

function drawBattleCellOutline(ctx: CanvasRenderingContext2D, col: number, row: number, cellSize: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const inset = width / 2;
  ctx.strokeRect(col * cellSize + inset, row * cellSize + inset, cellSize - width, cellSize - width);
}

function battlePlacementRect(placement: BattleGridPlacementView, cellSize: number) {
  const colSpan = Math.max(0.5, Math.min(placement.footprint.width, BATTLE_GRID_SIZE));
  const rowSpan = Math.max(0.5, Math.min(placement.footprint.height, BATTLE_GRID_SIZE));
  const leftCell = clamp(placement.col + 1 - colSpan, 0, BATTLE_GRID_SIZE - colSpan);
  const topCell = clamp(placement.row + 1 - rowSpan, 0, BATTLE_GRID_SIZE - rowSpan);
  return {
    x: leftCell * cellSize,
    y: topCell * cellSize,
    width: colSpan * cellSize,
    height: rowSpan * cellSize
  };
}

function drawImageContained(ctx: CanvasRenderingContext2D, image: BattleCanvasImage, x: number, y: number, width: number, height: number) {
  const imageWidth = "naturalWidth" in image ? image.naturalWidth || image.width || 1 : image.width || 1;
  const imageHeight = "naturalHeight" in image ? image.naturalHeight || image.height || 1 : image.height || 1;
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = Math.max(1, imageWidth * scale);
  const drawHeight = Math.max(1, imageHeight * scale);
  const left = x + (width - drawWidth) / 2;
  const top = y + (height - drawHeight) / 2;
  ctx.drawImage(image, left, top, drawWidth, drawHeight);
}

function drawMissingBattleMonster(ctx: CanvasRenderingContext2D, placement: BattleGridPlacementView, rect: { x: number; y: number; width: number; height: number }) {
  ctx.fillStyle = "#0b1620";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(placement.monsterId || "?"), rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function battlePlacementCanvasKey(placement: BattleGridPlacementView) {
  return `${placement.index}:${placement.value}:${placement.monster?.iconId ?? 0}`;
}

function loadBattleCanvasImage(url: string) {
  if (battleCanvasResolvedImageCache.has(url)) {
    return Promise.resolve(battleCanvasResolvedImageCache.get(url) ?? null);
  }
  const cached = battleCanvasImageCache.get(url);
  if (cached) return cached;
  const request = loadBattleCanvasImageUncached(url).then((image) => {
    battleCanvasResolvedImageCache.set(url, image);
    return image;
  });
  battleCanvasImageCache.set(url, request);
  return request;
}

async function loadBattleCanvasImageUncached(url: string): Promise<BattleCanvasImage | null> {
  if (typeof window.createImageBitmap === "function") {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await window.createImageBitmap(blob);
    } catch {
      // Fall back to an HTML image below for URLs the browser cannot fetch as a blob.
    }
  }
  return new Promise<BattleCanvasImage | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function battleBoardHoverTitle(
  hoverIndex: number | null,
  cells: BattleGridCellView[],
  placements: BattleGridPlacementView[],
  activeMonsterById: Map<number, MonsterRecord>,
  monsterSetPreview: MonsterSetId
) {
  if (hoverIndex == null) return "Battle monster grid";
  const cell = cells.find((candidate) => candidate.index === hoverIndex);
  if (!cell) return "Battle monster grid";
  const topPlacement = topVisiblePlacementAtDisplayCell(placements, cell.displayCol, cell.displayRow);
  if (topPlacement) return monsterPlacementLabel(activeMonsterById.get(topPlacement.monsterId), topPlacement.value, monsterSetPreview);
  return `Empty cell ${cell.displayCol},${cell.displayRow}`;
}

function idFromEntity(entityId: string, prefix: string) {
  if (!entityId.startsWith(prefix)) return null;
  const value = Number(entityId.slice(prefix.length));
  return Number.isInteger(value) ? value : null;
}

function nextAvailableId(records: Array<{ id: number }>) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 0; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size;
}

function monsterScenarioIds(project: Project) {
  return uniqueSortedNumbers([
    ...(project.monsters ?? []).map((monster) => monster.id),
    ...(project.monsterSets ?? []).flatMap((set) => set.monsters.map((monster) => monster.id))
  ]);
}

function monstersForSet(lookups: CombatLookups, setId: MonsterSetId) {
  return lookups.monsterSetsById.get(setId) ?? [];
}

function monsterMapForSet(lookups: CombatLookups, setId: MonsterSetId) {
  return lookups.monsterBySetAndId.get(setId) ?? new Map<number, MonsterRecord>();
}

function monsterForSet(lookups: CombatLookups, setId: MonsterSetId, id: number) {
  return monsterMapForSet(lookups, setId).get(id) ?? null;
}

function monsterSetLabel(setId: MonsterSetId) {
  return MONSTER_SET_OPTIONS.find((option) => option.id === setId)?.label ?? "Normal";
}

function monsterSetFile(setId: MonsterSetId) {
  return MONSTER_SET_OPTIONS.find((option) => option.id === setId)?.file ?? "Data MD";
}

function monsterFacts(monster: MonsterRecord) {
  return `ID ${monster.id}, HD ${monster.hitDice}, armor ${monster.armor}, agility ${monster.agility}, icon ${monster.iconId}`;
}

function monsterGeneratePreviewRows(source: MonsterRecord) {
  const monster = previewGeneratedMonsterVariant(source, 1);
  const mega = previewGeneratedMonsterVariant(source, -1);
  const rows = [
    ["Hit Dice", source.hitDice, monster.hitDice, mega.hitDice],
    ["Bonus Stamina", source.staminaBonus, monster.staminaBonus, mega.staminaBonus],
    ["Armor", source.armor, monster.armor, mega.armor],
    ["Magic Resist", source.magicResistance, monster.magicResistance, mega.magicResistance],
    ["Agility", source.agility, monster.agility, mega.agility],
    ["Movement", source.movementMax, monster.movementMax, mega.movementMax],
    ["Damage Bonus", source.damageBonus, monster.damageBonus, mega.damageBonus],
    ["Spell Points", source.spellPoints, monster.spellPoints, mega.spellPoints],
    ["Max Spell Points", source.maxSpellPoints, monster.maxSpellPoints, mega.maxSpellPoints],
    ["Experience", source.exp, monster.exp, mega.exp],
    ["Saves 1-6", formatPreviewArray(source.saves), formatPreviewArray(monster.saves), formatPreviewArray(mega.saves)]
  ];
  return rows.map(([label, normal, monsterValue, megaValue]) => ({
    label: String(label),
    normal: String(normal),
    monster: String(monsterValue),
    mega: String(megaValue),
    monsterChanged: String(monsterValue) !== String(normal),
    megaChanged: String(megaValue) !== String(normal)
  }));
}

function previewGeneratedMonsterVariant(source: MonsterRecord, setId: Exclude<MonsterSetId, 0>) {
  const scale = MONSTER_VARIANT_SCALE[setId];
  const scaledSpellPoints = clampInteger(Math.floor(source.spellPoints * scale.spellPointsNumerator / scale.spellPointsDenominator), 0, 999);
  return {
    hitDice: clampInteger(source.hitDice + scale.hitDice, 0, 255),
    staminaBonus: clampInteger(source.staminaBonus + scale.staminaBonus, -128, 127),
    agility: clampInteger(source.agility + scale.agility, -128, 127),
    movementMax: clampInteger(source.movementMax + scale.movementMax, -128, 127),
    armor: clampInteger(source.armor + scale.armor, -128, 127),
    magicResistance: clampInteger(source.magicResistance + scale.magicResistance, -128, 127),
    damageBonus: clampInteger(source.damageBonus + scale.damageBonus, -128, 127),
    saves: source.saves.map((value) => clampInteger(value + scale.saves, -128, 127)),
    spellPoints: scaledSpellPoints,
    maxSpellPoints: clampInteger(Math.max(source.maxSpellPoints, scaledSpellPoints), 0, 999),
    exp: clampInteger(Math.floor(source.exp * scale.expNumerator / scale.expDenominator), 0, 32767)
  };
}

function formatPreviewArray(values: number[]) {
  return values.join(", ");
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function monsterBattleStats(monster: MonsterRecord): Array<[string, string | number]> {
  return [
    ["Stamina", monster.hitDice],
    ["Spell Points", monster.spellPoints],
    ["Armor Cat", monster.armor],
    ["Magic Resist", monster.magicResistance],
    ["Movement", monster.movementMax],
    ["Alliance", monster.traitor],
    ["Experience", monster.exp],
    ["# Att", monster.attackCount]
  ];
}

function monsterPlacementTitle(monster: MonsterRecord | null | undefined, rawValue: number, setId: MonsterSetId = 0) {
  const id = Math.abs(rawValue);
  const side = rawValue < 0 ? " (force friend)" : "";
  return monster ? `${monster.displayName || `Monster ${monster.id}`} | Monster ${monster.id}${side}` : `${monsterSetLabel(setId)} Monster ${id} missing${side}`;
}

function monsterPlacementLabel(monster: MonsterRecord | null | undefined, rawValue: number, setId: MonsterSetId = 0) {
  const id = Math.abs(rawValue);
  const side = rawValue < 0 ? " (force friend)" : "";
  return monster ? `${monster.displayName || `Monster ${monster.id}`} | ${monsterFacts(monster)}${side}` : `${monsterSetLabel(setId)} Monster ${id} missing in ${monsterSetFile(setId)}${side}`;
}

function monsterBattleFootprint(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups) {
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  if (resolution.width && resolution.height) {
    return {
      width: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SPAN, Math.ceil(resolution.width / MONSTER_GRID_ART_SIZE))),
      height: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SPAN, Math.ceil(resolution.height / MONSTER_GRID_ART_SIZE)))
    };
  }
  const size = Number.isFinite(monster.size) ? monster.size : 1;
  if (size === 1) return { width: 1, height: 2 };
  if (size === 2) return { width: 2, height: 1 };
  if (size >= 3 || monster.typeFlags?.[6]) return { width: 2, height: 2 };
  return { width: 1, height: 1 };
}

function monsterBattleFootprintCached(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups, sourceKey: string) {
  const cacheKey = [
    sourceKey,
    monster.id,
    monster.iconId,
    monster.size,
    monster.typeFlags?.[6] ?? 0
  ].join(":");
  const cached = battleMonsterFootprintCache.get(cacheKey);
  if (cached) return cached;
  const footprint = monsterBattleFootprint(monster, iconEntries, project, lookups);
  battleMonsterFootprintCache.set(cacheKey, footprint);
  return footprint;
}

function monsterPaletteMetricsCached(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups, sourceKey: string) {
  const cacheKey = [
    sourceKey,
    monster.id,
    monster.iconId,
    monster.size,
    monster.typeFlags?.[6] ?? 0
  ].join(":");
  const cached = battleMonsterPaletteMetricCache.get(cacheKey);
  if (cached) return cached;
  const footprint = monsterBattleFootprintCached(monster, iconEntries, project, lookups, sourceKey);
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const artSize = resolution.width && resolution.height
    ? {
      width: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, resolution.width)),
      height: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, resolution.height))
    }
    : {
      width: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, footprint.width * MONSTER_GRID_ART_SIZE)),
      height: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, footprint.height * MONSTER_GRID_ART_SIZE))
    };
  const metrics = { artSize, footprintLabel: `${formatGridSpan(footprint.width)} x ${formatGridSpan(footprint.height)} grid tile art` };
  battleMonsterPaletteMetricCache.set(cacheKey, metrics);
  return metrics;
}

function monsterBattleFootprintLabel(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups) {
  const footprint = monsterBattleFootprint(monster, iconEntries, project, lookups);
  return `${formatGridSpan(footprint.width)} x ${formatGridSpan(footprint.height)} grid tile art`;
}

function formatGridSpan(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function monsterBrushPaletteWindow(total: number, width: number, height: number, scrollTop: number) {
  if (total <= 0) return { startIndex: 0, endIndex: 0, topSpacer: 0, bottomSpacer: 0 };
  const columns = Math.max(1, Math.floor((Math.max(width, MONSTER_BRUSH_TILE_SIZE) + MONSTER_BRUSH_TILE_GAP) / MONSTER_BRUSH_TILE_STRIDE));
  const totalRows = Math.ceil(total / columns);
  const visibleRows = Math.max(1, Math.ceil(Math.max(height, MONSTER_BRUSH_TILE_STRIDE) / MONSTER_BRUSH_TILE_STRIDE));
  const startRow = clamp(Math.floor(scrollTop / MONSTER_BRUSH_TILE_STRIDE) - MONSTER_BRUSH_WINDOW_OVERSCAN_ROWS, 0, totalRows);
  const endRow = clamp(startRow + visibleRows + MONSTER_BRUSH_WINDOW_OVERSCAN_ROWS * 2, startRow, totalRows);
  return {
    startIndex: startRow * columns,
    endIndex: Math.min(total, endRow * columns),
    topSpacer: startRow * MONSTER_BRUSH_TILE_STRIDE,
    bottomSpacer: Math.max(0, (totalRows - endRow) * MONSTER_BRUSH_TILE_STRIDE)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tabFromEditor(editor: string): CombatWorkbenchTab {
  if (editor === "monsters") return "monsters";
  if (editor === "scrapbook") return "monsters";
  if (editor === "iconSet" || editor === "icon-set") return "iconSet";
  return "battles";
}

function updateArraySlot(values: number[] = [], index: number, value: number, length: number) {
  const next = [...values];
  while (next.length < length) next.push(0);
  next[index] = value;
  return next.slice(0, length);
}

function useCombatLookups(project: Project | null, catalog: LibraryCatalog | null): CombatLookups {
  const projectBattlesLength = project?.battles?.length ?? 0;
  const projectMonsters = project?.monsters;
  const projectMonsterSets = project?.monsterSets;
  const projectAssets = project?.assets;
  const projectCatalogIcons = project?.assetCatalog?.icons;
  const projectMonsterIconOverrides = project?.monsterIconOverrides;
  const projectScenarioIconResources = project?.scenarioIconResources;
  const catalogAssets = catalog?.assets;
  return useMemo(() => measureCombatWork("useCombatLookups", () => {
    if (!project) {
      return {
        monsters: [],
        monsterById: new Map(),
        monsterSetsById: new Map([[0, []]]),
        monsterBySetAndId: new Map([[0, new Map()]]),
        iconAssetsByAbsId: new Map(),
        realmzActorIconAssetsByAbsId: new Map(),
        monsterMashAssetsByAbsId: new Map(),
        monsterIconOverridesByTarget: new Map(),
        tabCounts: { battles: 0, monsters: 0, iconSet: 0 }
      };
    }
    const monsters = [...(project.monsters ?? [])].sort((a, b) => a.id - b.id);
    const monsterById = new Map(monsters.map((monster) => [monster.id, monster]));
    const monsterSetsById = new Map<MonsterSetId, MonsterRecord[]>([[0, monsters]]);
    const monsterBySetAndId = new Map<MonsterSetId, Map<number, MonsterRecord>>([[0, monsterById]]);
    for (const option of MONSTER_SET_OPTIONS) {
      if (option.id === 0) continue;
      const set = (project.monsterSets ?? []).find((candidate) => candidate.setId === option.id);
      const setMonsters = [...(set?.monsters ?? [])].sort((a, b) => a.id - b.id);
      monsterSetsById.set(option.id, setMonsters);
      monsterBySetAndId.set(option.id, new Map(setMonsters.map((monster) => [monster.id, monster])));
    }
    const iconAssetsByAbsId = new Map<number, CombatIconAsset>();
    const realmzActorIconAssetsByAbsId = new Map<number, LibraryAsset>();
    const monsterMashAssetsByAbsId = new Map<number, LibraryAsset>();
    const monsterIconOverridesByTarget = new Map<number, MonsterIconOverride>();
    for (const override of project.monsterIconOverrides ?? []) {
      if (Number.isInteger(override.targetBaseIconId)) {
        monsterIconOverridesByTarget.set(Math.abs(override.targetBaseIconId), override);
      }
    }
    const addIconAsset = (asset: CombatIconAsset | null | undefined) => {
      if (!asset?.previewPath || asset.resourceId == null) return;
      const key = Math.abs(asset.resourceId);
      if (!iconAssetsByAbsId.has(key)) iconAssetsByAbsId.set(key, asset);
    };
    for (const asset of project.assets ?? []) {
      if (asset.resourceType === "cicn") addIconAsset(asset);
    }
    for (const asset of project.assetCatalog?.icons ?? []) {
      if (asset.resourceType === "cicn") addIconAsset(asset);
    }
    for (const asset of catalog?.assets ?? []) {
      if (isRealmzActorOrCreatureIconLibraryAsset(asset)) {
        const key = Math.abs(asset.resourceId);
        if (!realmzActorIconAssetsByAbsId.has(key)) realmzActorIconAssetsByAbsId.set(key, asset);
      }
      if (!isMonsterMashLibraryAsset(asset)) continue;
      const key = Math.abs(asset.resourceId);
      if (!monsterMashAssetsByAbsId.has(key)) monsterMashAssetsByAbsId.set(key, asset);
    }
    const iconSetTargetCount = monsterIconSetTabCount(project, {
      iconAssetsByAbsId,
      realmzActorIconAssetsByAbsId,
      monsterIconOverridesByTarget
    });
    return {
      monsters,
      monsterById,
      monsterSetsById,
      monsterBySetAndId,
      iconAssetsByAbsId,
      realmzActorIconAssetsByAbsId,
      monsterMashAssetsByAbsId,
      monsterIconOverridesByTarget,
      tabCounts: {
        battles: project.battles?.length ?? 0,
        monsters: monsterScenarioIds(project).length,
        iconSet: iconSetTargetCount
      }
    };
  }), [
    catalogAssets,
    projectAssets,
    projectBattlesLength,
    projectCatalogIcons,
    projectMonsterIconOverrides,
    projectMonsters,
    projectMonsterSets,
    projectScenarioIconResources
  ]);
}

function isRealmzActorOrCreatureIconLibraryAsset(asset: LibraryAsset): asset is LibraryAsset & { resourceId: number } {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  if (!isActorOrCreatureIconId(Math.abs(asset.resourceId))) return false;
  if (isMonsterMashLibraryAsset(asset)) return false;
  const text = `${asset.source} ${asset.label} ${asset.relativePath}`.toLowerCase();
  return text.includes(":realmz:") || text.includes("realmz-reference") || text.includes("the family jewels");
}

function isMonsterMashLibraryAsset(asset: LibraryAsset): asset is LibraryAsset & { resourceId: number } {
  if (asset.resourceType !== "cicn" || asset.resourceId == null) return false;
  const text = `${asset.source} ${asset.label} ${asset.relativePath}`.toLowerCase();
  return text.includes("monster mash");
}
