import { DragEvent, memo, ReactNode, useEffect, useMemo, useState } from "react";
import { Brush, Eraser, Eye, MousePointer2 } from "lucide-react";
import { browserReferenceIconUrl } from "../browser/atlasPaths";
import { TutorialTip } from "../components/TutorialTip";
import { itemReferenceOptions } from "../itemReferences";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";
import { spellAnimationFrameIds } from "../resourceIds";
import { findLibraryResourceAsset, isActorOrCreatureIconId } from "../resourceResolver";
import { scriptActionDefinitionFor, scriptActionSummary, scriptStepFlowRoutes } from "./scripts/scriptActionCatalog";
import { LibraryAsset, LibraryCatalog, BattleRecord, IconEntry, MonsterRecord, MonsterSetId, Project, ProjectCommand, SelectedEntity } from "../types";
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

export type CombatWorkbenchTab = "battles" | "monsters";

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

type BattleBrushMode = "select" | "paint" | "erase";

type MonsterPlacementBrush = {
  mode: BattleBrushMode;
  source: "scenario" | null;
  key: string | null;
  monsterId: number | null;
  forceFriend: boolean;
};

type MonsterIconResolution = {
  url: string | null;
  libraryAsset?: LibraryAsset | null;
  label: string;
  width: number | null;
  height: number | null;
};

type CombatIconAsset = {
  previewPath?: string | null;
  label?: string | null;
  resourceId?: number | null;
};

type CombatLookups = {
  monsters: MonsterRecord[];
  monsterById: Map<number, MonsterRecord>;
  monsterSetsById: Map<MonsterSetId, MonsterRecord[]>;
  monsterBySetAndId: Map<MonsterSetId, Map<number, MonsterRecord>>;
  iconAssetsByAbsId: Map<number, CombatIconAsset>;
  realmzActorIconAssetsByAbsId: Map<number, LibraryAsset>;
  monsterMashAssetsByAbsId: Map<number, LibraryAsset>;
  tabCounts: Record<CombatWorkbenchTab, number>;
};

const MONSTER_SET_OPTIONS: Array<{ id: MonsterSetId; label: string; file: string }> = [
  { id: 0, label: "Normal", file: "Data MD" },
  { id: 1, label: "Monster", file: "Data MD1" },
  { id: -1, label: "Mega", file: "Data MD-1" }
];

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
  monsters: "Monsters"
};

const TAB_HELP: Record<CombatWorkbenchTab, string> = {
  battles: "Author Data BD battle records: a 13 x 13 signed monster grid, distance, before/after strings, and battle macro target.",
  monsters: "Manage protected built-in templates, editable Providence library monsters, and scenario Data MD monster records."
};

const BATTLE_GRID_HELP = "Each grid cell stores a signed monster ID. Zero is empty, abs(value) points at a Data MD monster, and a negative value forces the friendly/alternate side after Realmz loads it. Large, tall, and wide monsters use their lower-right grid square as the anchor cell for placement; erase mode clears the top visible monster on the clicked tile.";
const MONSTER_PLACEMENT_HELP = "Choose a scenario monster or library template for the placement brush. Library templates are copied into Scenario Monsters before Providence writes the battle grid, because Data BD stores scenario monster IDs. Erase clears the top visible monster on the clicked tile; Force Friends writes the negative grid value Realmz uses for side flipping.";
const MONSTER_RECORDS_HELP = "Data MD records are 210-byte scenario monster templates. Realmz copies them into runtime combat state, so Providence edits the source template rather than generated bestiary cache data.";
const MONSTER_ICON_FIELD_HELP = "Monster icons are cicn resource IDs. Providence prefers project-local decoded scenario icons, then project assets, then bundled Realmz reference actor/creature art.";
const MONSTER_DEATH_ACTION_HELP = "Defeat Action is the monster death macro/door target. Realmz can run this when the monster dies, so treat it as linked behavior rather than a decorative number.";
const BATTLE_MACRO_HELP = "Battle Macro is an Extra Action Point reference that Realmz checks at the end of each combat round. Providence writes selected macros in the runnable form; positive imports are preserved but warned until edited.";
const SCRAPBOOK_HELP = "Monster Library combines protected built-in Realmz scrapbook templates with editable Providence entries. Copy entries into Scenario Monsters before using them in runtime battles.";
const MONSTER_MONEY_REWARDS = [
  { label: "Gold", iconId: 2002 },
  { label: "Gems", iconId: 2014 },
  { label: "Jewelry", iconId: 2012 }
];
const MONSTER_MONEY_LABELS = MONSTER_MONEY_REWARDS.map((reward) => reward.label);
const MONSTER_MONEY_HELP = "Monster reward caps. Realmz rolls 0..value for gold, gems, and jewelry when a reward-eligible monster is killed.";
const MONSTER_LIBRARY_DRAG_MIME = "application/x-realmz-monster-library-id";
const SCENARIO_MONSTER_DRAG_MIME = "application/x-realmz-scenario-monster-id";
const MONSTER_RECORD_BYTES = 210;
const BATTLE_GRID_SIZE = 13;
const BATTLE_GRID_CELL_COUNT = BATTLE_GRID_SIZE * BATTLE_GRID_SIZE;
const BATTLE_RUNTIME_MONSTER_LIMIT = 100;
const BATTLE_SUMMON_SPACE_WARNING_LIMIT = 75;
const MAX_DIVINITY_BATTLE_MONSTER_ID = 217;
const MONSTER_GRID_ART_SIZE = 32;
const MONSTER_PALETTE_TILE_SPAN = 2;
const MONSTER_PALETTE_TILE_SIZE = MONSTER_GRID_ART_SIZE * MONSTER_PALETTE_TILE_SPAN;
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
          <p>Create a battle record to begin placing monsters.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={createBattle}>New Battle {nextBattleId}</button>
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
  const [monsterSetPreview, setMonsterSetPreview] = useState<MonsterSetId>(0);
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
          <BattleMonsterSetPreviewField value={monsterSetPreview} onCommit={setMonsterSetPreview} />
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
        monsterSetPreview={monsterSetPreview}
        battle={battle}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
        onUpdateGrid={(grid) => onUpdate({ grid })}
      />
    </article>
  );
}

function BattleMonsterSetPreviewField({ value, onCommit }: { value: MonsterSetId; onCommit: (value: MonsterSetId) => void }) {
  return (
    <div className="combat-field battle-monster-set-preview">
      <FieldLabel label="Monster Set Preview" help="Preview this battle against Normal, Monster, or Mega scenario monster tables. Data BD still stores only monster IDs; this does not write battle data." />
      <div className="monster-set-segmented" role="group" aria-label="Monster set preview">
        {MONSTER_SET_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`combat-toggle${value === option.id ? " active" : ""}`}
            onClick={() => onCommit(option.id)}
          >
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function BattleBoard({
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
  monsterSetPreview,
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
  battle: BattleRecord;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateGrid: (grid: number[]) => void;
}) {
  const activeMonsterById = monsterMapForSet(lookups, monsterSetPreview);
  const activeMonsters = monstersForSet(lookups, monsterSetPreview);
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, battle.grid.findIndex(Boolean)));
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [brush, setBrush] = useState<MonsterPlacementBrush>(() => ({
    mode: "select",
    source: battle.grid.find(Boolean) ? "scenario" : null,
    key: battle.grid.find(Boolean) ? `scenario:${Math.abs(battle.grid.find(Boolean) ?? 0)}` : null,
    monsterId: battle.grid.find(Boolean) ? Math.abs(battle.grid.find(Boolean) ?? 0) : null,
    forceFriend: false
  }));
  const cells = useMemo<BattleGridCellView[]>(
    () => Array.from({ length: BATTLE_GRID_CELL_COUNT }, (_, displayIndex) => {
      const index = battleGridStorageIndexFromDisplayIndex(displayIndex);
      const { col: displayCol, row: displayRow } = battleGridDisplayCoordsFromStorageIndex(index);
      const value = battle.grid[index] ?? 0;
      return { index, displayIndex, displayCol, displayRow, value, monsterId: Math.abs(value), alternateSide: value < 0 };
    }),
    [battle.grid]
  );
  const selectedCell = cells.find((cell) => cell.index === selectedIndex) ?? cells[0];
  const selectedMonster = selectedCell?.monsterId ? activeMonsterById.get(selectedCell.monsterId) ?? null : null;
  const selectedNormalMonster = selectedCell?.monsterId ? lookups.monsterById.get(selectedCell.monsterId) ?? null : null;
  const selectedMissingScrapbookEntry = selectedCell?.monsterId && !selectedNormalMonster ? scrapbookEntryForMonsterId(catalog, selectedCell.monsterId) : null;
  const brushMonster = brush.monsterId ? activeMonsterById.get(brush.monsterId) ?? null : null;
  const placedCount = cells.filter((cell) => cell.value !== 0).length;
  const placementWarning = placedCount > BATTLE_RUNTIME_MONSTER_LIMIT
    ? `Realmz loads only ${BATTLE_RUNTIME_MONSTER_LIMIT} monsters; ${placedCount - BATTLE_RUNTIME_MONSTER_LIMIT} placed slot(s) will be omitted at runtime.`
    : placedCount > BATTLE_SUMMON_SPACE_WARNING_LIMIT
      ? "This battle leaves little room for creature spawning or summon spells."
      : "";
  const placements = useMemo<BattleGridPlacementView[]>(
    () =>
      cells
        .filter((cell) => cell.monsterId)
        .map((cell) => {
          const monster = activeMonsterById.get(cell.monsterId) ?? null;
          return {
            ...cell,
            monster,
            col: cell.displayCol,
            row: cell.displayRow,
            footprint: monster ? monsterBattleFootprint(monster, iconEntries, project, lookups) : { width: 1, height: 1 }
          };
        }),
    [activeMonsterById, cells, iconEntries, lookups, project]
  );
  const eraseCell = (index: number) => {
    setSelectedIndex(index);
    const next = [...battle.grid];
    while (next.length < 169) next.push(0);
    next[index] = 0;
    onUpdateGrid(next.slice(0, 169));
  };
  const eraseVisibleAtCell = (index: number) => {
    const cell = cells.find((candidate) => candidate.index === index);
    const topPlacement = cell ? topVisiblePlacementAtDisplayCell(placements, cell.displayCol, cell.displayRow) : null;
    eraseCell(topPlacement?.index ?? index);
  };
  const paintCell = (index: number) => {
    setSelectedIndex(index);
    if (brush.monsterId === null) return;
    const next = [...battle.grid];
    while (next.length < 169) next.push(0);
    let monsterId = brush.monsterId;
    if (!activeMonsterById.has(monsterId)) return;
    next[index] = brush.forceFriend ? -Math.abs(monsterId) : Math.abs(monsterId);
    onUpdateGrid(next.slice(0, 169));
  };
  const moveCell = (fromIndex: number, toIndex: number) => {
    setDraggingIndex(null);
    setSelectedIndex(toIndex);
    if (fromIndex === toIndex) return;
    const next = [...battle.grid];
    while (next.length < 169) next.push(0);
    const moving = next[fromIndex] ?? 0;
    if (!moving) return;
    const target = next[toIndex] ?? 0;
    next[toIndex] = moving;
    next[fromIndex] = target;
    onUpdateGrid(next.slice(0, 169));
  };
  const handleCellClick = (index: number) => {
    if (brush.mode === "erase") {
      eraseVisibleAtCell(index);
      return;
    }
    if (brush.mode === "paint") {
      paintCell(index);
      return;
    }
    setSelectedIndex(index);
  };
  const updateSelected = (value: number) => {
    const next = [...battle.grid];
    while (next.length < 169) next.push(0);
    next[selectedIndex] = value;
    onUpdateGrid(next.slice(0, 169));
  };
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (target && (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName) || target.isContentEditable)) return;
      if (!(battle.grid[selectedIndex] ?? 0)) return;
      event.preventDefault();
      eraseCell(selectedIndex);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [battle.grid, selectedIndex]);

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
          activeMonsters={activeMonsters}
        />
      </aside>
      <div className="battle-board-card">
        <header>
          <TutorialTip title="Battle Grid" body={BATTLE_GRID_HELP} side="right">
            <strong>Battle Grid</strong>
          </TutorialTip>
          <b className={placedCount > BATTLE_RUNTIME_MONSTER_LIMIT ? "limit-error" : placedCount > BATTLE_SUMMON_SPACE_WARNING_LIMIT ? "limit-warning" : "limit-safe"}>
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
            <div className="battle-board" role="grid" aria-label="Battle monster grid">
              {cells.map((cell) => (
                <button
                  key={cell.index}
                  type="button"
                  role="gridcell"
                  className={`${brush.mode === "select" && cell.index === selectedIndex ? "selected" : ""}${cell.value ? " filled" : ""}${cell.alternateSide ? " alternate-side" : ""}`}
                  title={cell.value ? monsterPlacementLabel(activeMonsterById.get(cell.monsterId), cell.value, monsterSetPreview) : `Empty cell ${cell.displayCol},${cell.displayRow}`}
                  onClick={() => handleCellClick(cell.index)}
                  onDragOver={(event) => {
                    if (brush.mode !== "select") return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    if (brush.mode !== "select") return;
                    const transferred = event.dataTransfer.getData("text/plain");
                    const transferredIndex = transferred ? Number(transferred) : NaN;
                    const fromIndex = draggingIndex ?? (Number.isInteger(transferredIndex) ? transferredIndex : null);
                    if (fromIndex === null) return;
                    event.preventDefault();
                    moveCell(fromIndex, cell.index);
                  }}
                  aria-label={cell.value ? monsterPlacementLabel(activeMonsterById.get(cell.monsterId), cell.value, monsterSetPreview) : `Empty cell ${cell.displayCol},${cell.displayRow}`}
                />
              ))}
              {placements.map((placement) => (
                <BattleMonsterOverlay
                  key={`${placement.index}:${placement.value}`}
                  placement={placement}
                  iconEntries={iconEntries}
                  project={project}
                  lookups={lookups}
                  previewContext={previewContext}
                  mode={brush.mode}
                  selected={brush.mode === "select" && placement.index === selectedIndex}
                  dragging={draggingIndex === placement.index}
                  onSelect={() => setSelectedIndex(placement.index)}
                  onErase={() => eraseCell(placement.index)}
                  onDragStart={() => {
                    setSelectedIndex(placement.index);
                    setDraggingIndex(placement.index);
                  }}
                  onDragEnd={() => setDraggingIndex(null)}
                />
              ))}
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

function MonsterPalette({
  project,
  iconEntries,
  lookups,
  previewContext,
  selectedKey,
  onSelect,
  monsterSetPreview,
  activeMonsters
}: {
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  selectedKey: string | null;
  onSelect: (entry: BattleMonsterPaintEntry) => void;
  monsterSetPreview: MonsterSetId;
  activeMonsters: MonsterRecord[];
}) {
  const [query, setQuery] = useState("");
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
  const hasScenarioMonsters = activeMonsters.some((monster) => monster.id > 0);
  const hasOnlyUnplaceableMonsterZero = activeMonsters.length > 0 && !hasScenarioMonsters;
  const hasOnlyOutOfRangeMonsters = hasScenarioMonsters && placeableMonsters.length === 0;
  return (
    <div className="monster-palette">
      <header>
        <TutorialTip title="Monster Placement Brush" body={MONSTER_PLACEMENT_HELP} side="right">
          <strong>Monster Palette</strong>
        </TutorialTip>
        <small>{monsterSetLabel(monsterSetPreview)} | {entries.length} placeable</small>
      </header>
      <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search monsters..." />
      <div className="monster-brush-palette" aria-label="Paintable monsters">
        {entries.length === 0 && !hasOnlyUnplaceableMonsterZero && !hasOnlyOutOfRangeMonsters && (
          <p className="empty-copy compact">No {monsterSetLabel(monsterSetPreview)} scenario monsters are available for battle placement. Copy from Monster Library into Scenario Monsters first.</p>
        )}
        {hasOnlyUnplaceableMonsterZero && (
          <p className="empty-copy compact">Monster 0 exists in {monsterSetFile(monsterSetPreview)}, but Data BD uses 0 for empty battle cells. Create or copy a monster into slot 1 or higher before placing battle monsters.</p>
        )}
        {hasOnlyOutOfRangeMonsters && (
          <p className="empty-copy compact">This scenario only has monster IDs outside Divinity's battle-authorable range. Use Scenario Monsters 1-{MAX_DIVINITY_BATTLE_MONSTER_ID} for battle placement.</p>
        )}
        {filtered.map((entry) => {
          const monster = entry.monster;
          const name = monster.displayName || `Monster ${monster.id}`;
          const facts = monsterFacts(monster);
          const artSize = monsterPaletteArtSize(monster, iconEntries, project, lookups);
          const footprint = monsterBattleFootprintLabel(monster, iconEntries, project, lookups);
          const paintNote = "Scenario monster.";
          return (
            <TutorialTip key={entry.key} title={`${name} (${entry.id})`} body={`${facts}. ${footprint}. ${paintNote}`} side="right">
              <button
                type="button"
                className={selectedKey === entry.key ? "selected" : ""}
                aria-label={`${name}. ${facts}. ${footprint}. ${paintNote}`}
                onClick={() => onSelect(entry)}
              >
                <span className="monster-brush-art" style={{ width: `${artSize.width}px`, height: `${artSize.height}px` }}>
                  <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} />
                </span>
                <span className="monster-brush-id">{entry.id}</span>
              </button>
            </TutorialTip>
          );
        })}
        {filtered.length === 0 && entries.length > 0 ? <small className="combat-list-overflow-note">No matching placeable monster.</small> : null}
      </div>
    </div>
  );
}

function MonsterWorkbench({
  project,
  catalog,
  selectedEntity,
  iconEntries,
  lookups,
  previewContext,
  onSelectEntity,
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
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<"scenario" | "library">("scenario");
  const [activeSetId, setActiveSetId] = useState<MonsterSetId>(0);
  const [scenarioDropActive, setScenarioDropActive] = useState(false);
  const [libraryDropActive, setLibraryDropActive] = useState(false);
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "monster:");
  const scenarioIds = useMemo(() => monsterScenarioIds(project), [project]);
  const scenarioEntries = useMemo(
    () => scenarioIds.map((id) => {
      const normal = monsterForSet(lookups, 0, id);
      const monster = monsterForSet(lookups, 1, id);
      const mega = monsterForSet(lookups, -1, id);
      const active = monsterForSet(lookups, activeSetId, id);
      const fallback = active ?? normal ?? monster ?? mega;
      return { id, normal, monster, mega, active, fallback };
    }),
    [activeSetId, lookups, scenarioIds]
  );
  const filtered = useMemo(
    () => filterRecords(scenarioEntries, query, (entry) => {
      const record = entry.fallback;
      return `${entry.id} ${record?.displayName ?? ""} icon ${record?.iconId ?? ""} hd ${record?.hitDice ?? ""} normal ${Boolean(entry.normal)} monster ${Boolean(entry.monster)} mega ${Boolean(entry.mega)}`;
    }),
    [scenarioEntries, query]
  );
  const libraryEntries = useMemo(() => {
    const entries = (catalog?.entities ?? [])
      .filter((entity) => entity.type === "monster-scrapbook-entry")
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
      return;
    }
    if (selectedLibraryId === null || !filteredLibrary.some((entry) => entry.id === selectedLibraryId)) {
      setSelectedLibraryId(filteredLibrary[0].id);
    }
  }, [filteredLibrary, selectedLibraryId]);
  const nextMonsterId = nextAvailableId(scenarioIds.map((id) => ({ id })));
  const selectedId = selectedFromEntity ?? scenarioEntries[0]?.id ?? null;
  const selectedEntry = selectedId !== null ? scenarioEntries.find((entry) => entry.id === selectedId) ?? null : null;
  const selected = selectedId !== null ? monsterForSet(lookups, activeSetId, selectedId) : null;
  const selectedNormal = selectedId !== null ? monsterForSet(lookups, 0, selectedId) : null;
  const selectedLibrary =
    selectedLibraryId !== null ? filteredLibrary.find((entry) => entry.id === selectedLibraryId) ?? null :
    filteredLibrary[0] ?? null;
  const selectedLibraryTemplate = selectedLibrary ? monsterLibraryEntryTemplate(selectedLibrary) : null;
  const selectedDescription = selectedId !== null ? project.monsterDescriptions.find((description) => description.id === selectedId)?.text ?? "" : "";
  const selectMonster = (id: number) => onSelectEntity(selectEntityFromId(`monster:${id}`));
  const update = (id: number, changes: Partial<MonsterRecord>, setId: MonsterSetId = activeSetId) => onApplyCommand?.({ kind: "updateMonsterRecord", label: `Update ${monsterSetLabel(setId)} monster`, id, changes, setId });
  const managedLibraryPath = catalog?.managedPath ?? "browser://workspace/library";
  const commitCatalog = (nextCatalog: LibraryCatalog, status: string) => onUpdateLibraryCatalog?.(nextCatalog, status);
  const selectScenarioMonster = (id: number) => {
    setActivePreview("scenario");
    selectMonster(id);
  };
  const selectLibraryMonster = (entry: LibraryCatalog["entities"][number]) => {
    setActivePreview("library");
    setSelectedLibraryId(entry.id);
  };
  const copyLibraryEntryToScenario = (entry: LibraryCatalog["entities"][number], mode: "normal" | "all" | "generated" = "normal") => {
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
    } else {
      copyMonsterLibraryEntryToScenario(entry, copyId, onApplyCommand);
      if (mode === "generated") {
        onApplyCommand?.({ kind: "generateMonsterVariants", label: `Generate variants for monster ${copyId}`, id: copyId });
      }
    }
    setActiveSetId(0);
    setActivePreview("scenario");
    selectMonster(copyId);
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
    copyLibraryEntryToScenario(entry);
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
  const selectedSetTools = selectedId !== null ? (
    <MonsterSetToolbar
      activeSetId={activeSetId}
      selectedId={selectedId}
      selectedRecord={selected}
      normalRecord={selectedNormal}
      availableIds={activeSetIds}
      onSetIdChange={setActiveSetId}
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
      onSwitch={(toId) => {
        if (selectedId === null) return;
        onApplyCommand?.({ kind: "switchMonsterRecords", label: `Switch ${monsterSetLabel(activeSetId)} monster ${selectedId} with ${toId}`, setId: activeSetId, fromId: selectedId, toId });
        selectMonster(toId);
      }}
    />
  ) : null;

  return (
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
            <strong className="combat-pane-title">Monster Library</strong>
            <div className="monster-list-actions">
              <button
                type="button"
                className="btn btn-primary btn-xs"
                disabled={!selectedLibrary}
                onClick={() => selectedLibrary && copyLibraryEntryToScenario(selectedLibrary)}
              >
                Copy To Scenario
              </button>
            </div>
          </header>
          <input value={libraryQuery} onChange={(event) => setLibraryQuery(event.currentTarget.value)} placeholder="Search monster library..." />
          <div className="combat-record-scroll">
            {filteredLibrary.map((entry) => {
              const custom = isProvidenceMonsterLibraryEntry(entry);
              return (
                <button
                  key={entry.id}
                  type="button"
                  draggable
                  className={entry.id === selectedLibrary?.id ? "selected" : ""}
                  onClick={() => selectLibraryMonster(entry)}
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
          </header>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search scenario monsters..." />
          <div className="combat-record-scroll">
            {filtered.map((entry) => {
              const monster = entry.fallback;
              if (!monster) return null;
              return (
              <button
                key={entry.id}
                type="button"
                draggable
                className={activePreview === "scenario" && selectedId === entry.id ? "selected" : ""}
                onClick={() => selectScenarioMonster(entry.id)}
                onDragStart={(event) => startScenarioDrag(monster, event)}
                onDragEnd={() => setLibraryDropActive(false)}
              >
                <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} compact />
                <span>
                  <strong>{monster.displayName || `Monster ${entry.id}`}</strong>
                  <small>{monsterFacts(monster)}</small>
                  <MonsterSetBadges entry={entry} activeSetId={activeSetId} />
                </span>
              </button>
            );
            })}
            {filtered.length === 0 && <p className="empty-copy compact">No scenario monsters match that search.</p>}
          </div>
        </aside>
      </div>

      {activePreview === "library" && selectedLibrary && selectedLibraryTemplate ? (
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
          onCopy={() => copyLibraryEntryToScenario(selectedLibrary)}
          onCopyAll={() => copyLibraryEntryToScenario(selectedLibrary, "all")}
          onCopyGenerated={() => copyLibraryEntryToScenario(selectedLibrary, "generated")}
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
          onDuplicate={() => {
            const id = nextMonsterId;
            update(id, { ...selected, id, displayName: `${selected.displayName || `Monster ${selected.id}`} Copy` }, activeSetId);
            selectMonster(id);
          }}
          onClear={activeSetId === 0 ? () => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear monster", recordType: "monster", id: selected.id }) : undefined}
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
  onSetIdChange,
  onCreateFromNormal,
  onCopyToAll,
  onGenerate,
  onSwitch
}: {
  activeSetId: MonsterSetId;
  selectedId: number;
  selectedRecord: MonsterRecord | null;
  normalRecord: MonsterRecord | null;
  availableIds: Set<number>;
  onSetIdChange: (setId: MonsterSetId) => void;
  onCreateFromNormal: () => void;
  onCopyToAll: () => void;
  onGenerate: () => void;
  onSwitch: (toId: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [generatePreviewOpen, setGeneratePreviewOpen] = useState(false);
  const targetId = Number(draft);
  const canSwitch = Number.isInteger(targetId) && targetId >= 0 && targetId !== selectedId && availableIds.has(targetId);
  useEffect(() => {
    setDraft("");
    setGeneratePreviewOpen(false);
  }, [activeSetId, selectedId]);
  return (
    <div className="monster-set-toolbar">
      <div className="monster-set-segmented" role="group" aria-label="Scenario monster set">
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
      <small>{monsterSetFile(activeSetId)} {selectedRecord ? "available" : "missing"}</small>
      <div className="monster-set-actions">
        {activeSetId !== 0 && !selectedRecord && normalRecord ? (
          <button type="button" className="btn btn-primary btn-xs" onClick={onCreateFromNormal}>Create From Normal</button>
        ) : null}
        {selectedRecord ? <button type="button" className="btn btn-secondary btn-xs" onClick={onCopyToAll}>Copy Current To All Sets</button> : null}
        {normalRecord ? <button type="button" className="btn btn-secondary btn-xs" onClick={() => setGeneratePreviewOpen((open) => !open)}>Preview Generate Variants</button> : null}
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
          <button type="button" className="btn btn-primary btn-xs" onClick={onGenerate}>Apply Generate Variants</button>
        </div>
      ) : null}
    </div>
  );
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
  onDuplicate,
  onClear,
  duplicateLabel = "Duplicate",
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
  onDuplicate: () => void;
  onClear?: () => void;
  duplicateLabel?: string;
  clearLabel?: string;
}) {
  return (
    <article className="combat-editor monster-editor scenario-monster-editor">
      <header className="combat-editor-header monster-editor-title-header">
        <span className="combat-pane-title">{monster.displayName || `Monster ${monster.id}`}</span>
        {headerMeta ? <div className="monster-editor-header-meta">{headerMeta}</div> : null}
        <div className="combat-editor-actions">
          {onCopyToLibrary ? <button type="button" className="btn btn-secondary btn-xs" onClick={onCopyToLibrary}>Copy To Library</button> : null}
          <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicate}>{duplicateLabel}</button>
          {onClear ? <button type="button" className="btn btn-danger btn-xs" onClick={onClear}>{clearLabel}</button> : null}
        </div>
      </header>
      <section className="monster-section monster-identity-section">
        <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} large />
        <div className="monster-field-grid">
          <TextField label="Monster Name" value={monster.displayName} onCommit={(displayName) => onUpdate({ displayName })} />
          <NumberField label="Name ID" value={monster.nameId} onCommit={(nameId) => onUpdate({ nameId })} />
          <MonsterIconField project={project} catalog={catalog} lookups={lookups} value={monster.iconId} onCommit={(iconId) => onUpdate({ iconId })} />
          <label className="combat-check-field">
            <span>Not On Menu</span>
            <input type="checkbox" checked={monster.notOnMenu} onChange={(event) => onUpdate({ notOnMenu: event.currentTarget.checked })} />
          </label>
          <MacroReferenceField project={project} value={monster.deathMacro} onCommit={(deathMacro) => onUpdate({ deathMacro })} />
        </div>
      </section>
      <section className="monster-section monster-description-section">
        <header><strong>Monster Description</strong><small>Data DES bestiary/scrapbook text.</small></header>
        <TextAreaField label="Description" value={description} placeholder="No monster description." onCommit={onUpdateDescription} />
      </section>
      <MonsterNumberSection
        title="Combat Stats"
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
      <MonsterNumberSection
        title="Behavior"
        monster={monster}
        fields={[
          ["Side", "traitor"],
          ["Size", "size"],
          ["Distance", "distance"],
          ["Attacks", "attackCount"],
          ["Magical Attacks", "magicAttackCount"],
          ["Damage Plus", "damageBonus"],
          ["Cast Spell %", "castPercent"],
          ["Run Away %", "runPercent"],
          ["Surrender %", "surrenderPercent"],
          ["Use Missile %", "missilePercent"],
          ["Summon Eligible", "canSummon"]
        ]}
        onUpdate={onUpdate}
      />
      <section className="monster-section">
        <header><strong>Equipment Reference</strong><small>Weapon IDs can use item IDs or Divinity's negative random weapon groups.</small></header>
        <div className="monster-field-grid">
          <WeaponIdField project={project} catalog={catalog} value={monster.weapon} onCommit={(weapon) => onUpdate({ weapon })} />
        </div>
      </section>
      <section className="monster-section">
        <header><strong>Traits</strong><small>Physical and targeting flags.</small></header>
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
      <section className="monster-section">
        <header><strong>Attacks</strong><small>Five Realmz attack rows.</small></header>
        <div className="monster-attacks-grid">
          {Array.from({ length: 5 }, (_, row) => {
            const values = monster.attacks[row] ?? [0, 0, 0, 0];
            return (
              <div key={row} className="monster-attack-row">
                <strong>Attack {row + 1}</strong>
                {["Damage Low", "Damage High", "Form", "Special"].map((label, slot) => (
                  <NumberField
                    key={label}
                    label={label}
                    value={values[slot] ?? 0}
                    onCommit={(value) => {
                      const attacks = [...monster.attacks];
                      while (attacks.length < 5) attacks.push([0, 0, 0, 0]);
                      attacks[row] = updateArraySlot(attacks[row] ?? [], slot, value, 4);
                      onUpdate({ attacks });
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </section>
      <section className="monster-section">
        <header><strong>Spells And Loot</strong><small>Spell slots, gold/gems/jewelry caps, and item drops.</small></header>
        <SpellSlotGrid project={project} catalog={catalog} values={monster.spells} onCommit={(spells) => onUpdate({ spells })} />
        <MonsterMoneyFields values={monster.money} onCommit={(money) => onUpdate({ money })} />
        <ItemSlotGrid project={project} catalog={catalog} values={monster.items} onCommit={(items) => onUpdate({ items })} />
      </section>
      <section className="monster-section">
        <header><strong>Saves, Immunities, And Advanced Fields</strong><small>Combat runtime fields that remain useful for exact Realmz behavior.</small></header>
        <CompactArrayFields label="Save" values={monster.saves} length={6} onCommit={(saves) => onUpdate({ saves })} />
        <CompactArrayFields label="Immune" values={monster.spellImmunities} length={6} onCommit={(spellImmunities) => onUpdate({ spellImmunities })} />
        <CompactArrayFields label="Condition" values={monster.conditions} length={40} onCommit={(conditions) => onUpdate({ conditions })} />
      </section>
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
    () => uniqueSortedNumbers([0, targetId, ...project.messages.map((message) => message.id)]),
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
      project.triggers
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
  const record = project.messages.find((candidate) => candidate.id === Math.abs(stringId)) ?? null;
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
  const trigger = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === Math.abs(actionId)) ?? null;
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

const MonsterIcon = memo(function MonsterIcon({
  monster,
  iconEntries,
  project,
  lookups,
  previewContext,
  compact = false,
  large = false
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  compact?: boolean;
  large?: boolean;
}) {
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const iconResourceId = monster.iconId ? Math.abs(monster.iconId) : null;
  const scenarioUrl = useResolvedPreviewUrl(null, null, null, {
    ...previewContext,
    project,
    resourceType: "cicn",
    resourceId: iconResourceId
  });
  const fallbackUrl = useResolvedPreviewUrl(resolution.url, null, resolution.libraryAsset ?? null, previewContext);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    setFailedUrl(null);
    setLoadedUrl(null);
  }, [fallbackUrl, scenarioUrl]);
  const usableUrl = scenarioUrl && scenarioUrl !== failedUrl
    ? scenarioUrl
    : fallbackUrl && fallbackUrl !== failedUrl
      ? fallbackUrl
      : null;
  const ready = !usableUrl || loadedUrl === usableUrl;
  return (
    <span
      className={`monster-icon-preview${compact ? " compact" : ""}${large ? " large" : ""}`}
      title={resolution.label}
      data-combat-preview="monster-icon"
      data-combat-preview-ready={ready ? "true" : "false"}
    >
      {usableUrl ? (
        <img
          src={usableUrl}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedUrl(usableUrl)}
          onError={() => setFailedUrl(usableUrl)}
        />
      ) : (
        <b>{monster.id}</b>
      )}
    </span>
  );
});

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

const BattleMonsterOverlay = memo(function BattleMonsterOverlay({
  placement,
  iconEntries,
  project,
  lookups,
  previewContext,
  mode,
  selected,
  dragging,
  onSelect,
  onErase,
  onDragStart,
  onDragEnd
}: {
  placement: BattleGridPlacementView;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  mode: BattleBrushMode;
  selected: boolean;
  dragging: boolean;
  onSelect: () => void;
  onErase: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const colSpan = Math.max(0.5, Math.min(placement.footprint.width, 13));
  const rowSpan = Math.max(0.5, Math.min(placement.footprint.height, 13));
  const leftCell = clamp(placement.col + 1 - colSpan, 0, 13 - colSpan);
  const topCell = clamp(placement.row + 1 - rowSpan, 0, 13 - rowSpan);
  const label = `${monsterPlacementLabel(placement.monster, placement.value)}; anchor cell ${placement.col},${placement.row}`;
  const name = placement.monster?.displayName || `Monster ${placement.monsterId}`;
  const facts = placement.monster ? monsterFacts(placement.monster) : `ID ${placement.monsterId}`;
  const footprint = placement.monster ? monsterBattleFootprintLabel(placement.monster, iconEntries, project, lookups) : "Missing scenario monster record.";
  const sideNote = placement.alternateSide
    ? `Forced Friend: grid value ${placement.value}; source Alliance ${placement.monster?.traitor ?? "unknown"}; Realmz treats this placement as friendly.`
    : `Normal side: grid value ${placement.value}.`;
  const anchorNote = `Anchor cell ${placement.col}, ${placement.row}.`;
  const interactive = mode === "select" || mode === "erase";
  const ariaLabel = mode === "erase" ? `Erase ${label}` : mode === "select" ? `Select or drag ${label}` : undefined;
  const handleActivate = () => {
    if (mode === "erase") {
      onErase();
      return;
    }
    if (mode === "select") onSelect();
  };
  return (
    <span
      className={`battle-monster-overlay${placement.alternateSide ? " alternate-side" : ""}${mode === "erase" ? " erasable" : ""}${mode === "select" ? " selectable" : ""}${selected ? " selected-anchor" : ""}${dragging ? " dragging" : ""}`}
      style={{
        left: `${(leftCell / 13) * 100}%`,
        top: `${(topCell / 13) * 100}%`,
        width: `${(colSpan / 13) * 100}%`,
        height: `${(rowSpan / 13) * 100}%`
      }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-hidden={interactive ? undefined : "true"}
      aria-label={ariaLabel}
      draggable={mode === "select"}
      onClick={interactive ? handleActivate : undefined}
      onDragStart={mode === "select" ? (event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(placement.index));
        onDragStart();
      } : undefined}
      onDragEnd={mode === "select" ? onDragEnd : undefined}
      onKeyDown={interactive ? (event) => {
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          event.stopPropagation();
          onErase();
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          handleActivate();
        }
      } : undefined}
    >
      {interactive ? (
        <TutorialTip title={`${name} (${placement.monsterId})`} body={`${facts}. ${footprint}. ${anchorNote} ${sideNote}`} side="right">
          <span className="battle-monster-overlay-art">
            {placement.monster ? (
              <MonsterIcon monster={placement.monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} />
            ) : (
              <b>{placement.monsterId}</b>
            )}
          </span>
        </TutorialTip>
      ) : (
        <span className="battle-monster-overlay-art">
          {placement.monster ? (
            <MonsterIcon monster={placement.monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} />
          ) : (
            <b>{placement.monsterId}</b>
          )}
        </span>
      )}
    </span>
  );
});

function resolveMonsterIcon(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups): MonsterIconResolution {
  const iconId = Math.abs(monster.iconId);
  const entry = iconEntries[monster.iconId] ?? iconEntries[iconId] ?? iconEntries[-iconId];
  if (entry?.url) {
    return {
      url: entry.url,
      label: `cicn ${monster.iconId}`,
      width: entry.image.naturalWidth || entry.image.width || null,
      height: entry.image.naturalHeight || entry.image.height || null
    };
  }
  const asset = lookups.iconAssetsByAbsId.get(iconId);
  if (asset?.previewPath) return { url: asset.previewPath, label: asset.label ?? `cicn ${monster.iconId}`, width: null, height: null };
  const projectAsset = project.assetCatalog.icons?.find((candidate) => Math.abs(candidate.resourceId) === iconId && candidate.previewPath) ?? null;
  if (projectAsset?.previewPath) return { url: projectAsset.previewPath, label: `cicn ${monster.iconId}`, width: null, height: null };
  const realmzActorAsset = lookups.realmzActorIconAssetsByAbsId.get(iconId) ?? null;
  if (realmzActorAsset) return { url: null, libraryAsset: realmzActorAsset, label: realmzActorAsset.label || `cicn ${monster.iconId}`, width: null, height: null };
  const mashAsset = lookups.monsterMashAssetsByAbsId.get(iconId) ?? null;
  if (mashAsset) return { url: null, libraryAsset: mashAsset, label: mashAsset.label || `cicn ${monster.iconId}`, width: null, height: null };
  if (isActorOrCreatureIconId(iconId)) {
    const referenceUrl = browserReferenceIconUrl(iconId);
    if (referenceUrl) return { url: referenceUrl, label: `cicn ${monster.iconId}`, width: null, height: null };
  }
  return { url: null, label: `No icon preview for cicn ${monster.iconId}`, width: null, height: null };
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
  if (!help) return <span>{label}</span>;
  return (
    <span>
      <TutorialTip title={label} body={help} side="right">
        <span>{label}</span>
      </TutorialTip>
    </span>
  );
}

function MonsterNumberSection({
  title,
  monster,
  fields,
  onUpdate
}: {
  title: string;
  monster: MonsterRecord;
  fields: Array<[string, keyof MonsterRecord]>;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
}) {
  return (
    <section className="monster-section">
      <header><strong>{title}</strong><small>Editable Realmz monster fields.</small></header>
      <div className="monster-field-grid">
        {fields.map(([label, key]) => (
          <NumberField key={String(key)} label={label} value={Number(monster[key] ?? 0)} onCommit={(value) => onUpdate({ [key]: value } as Partial<MonsterRecord>)} />
        ))}
      </div>
    </section>
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

function MonsterIconField({
  project,
  catalog,
  lookups,
  value,
  onCommit
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  lookups: CombatLookups;
  value: number;
  onCommit: (value: number) => void;
}) {
  const options = useMemo(() => monsterIconOptions(project, catalog, lookups), [catalog, lookups, project]);
  return <NumberSelectField label="Icon" help={MONSTER_ICON_FIELD_HELP} value={value} options={options} emptyLabel="No icon" onCommit={onCommit} />;
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
  const hasCurrentValue = value !== 0 && !options.some((option) => option.value === value);
  return (
    <label className="combat-field combat-select-field">
      <FieldLabel label={label} help={help} />
      <select value={String(value)} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value="0">{emptyLabel}</option>
        {hasCurrentValue && <option value={String(value)}>Current value {value}</option>}
        {options.map((option) => (
          <option key={option.key} value={String(option.value)} title={option.detail}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompactArrayFields({ label, values, length, onCommit }: { label: string; values: number[]; length: number; onCommit: (values: number[]) => void }) {
  return (
    <div className="combat-compact-array">
      {Array.from({ length }, (_, index) => (
        <NumberField
          key={index}
          label={`${label} ${index + 1}`}
          value={values[index] ?? 0}
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, length))}
        />
      ))}
    </div>
  );
}

function MonsterMoneyFields({ values, onCommit }: { values: number[]; onCommit: (values: number[]) => void }) {
  return (
    <div className="combat-compact-array monster-money-fields">
      {MONSTER_MONEY_LABELS.map((label, index) => (
        <NumberField
          key={label}
          label={label}
          help={MONSTER_MONEY_HELP}
          value={values[index] ?? 0}
          onCommit={(value) => onCommit(updateArraySlot(values, index, value, MONSTER_MONEY_LABELS.length))}
        />
      ))}
    </div>
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
    () => (catalog?.entities ?? [])
      .filter((entity) => entity.type === "monster-scrapbook-entry")
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

function battleMonsterPaintEntrySearchText(entry: BattleMonsterPaintEntry) {
  return `${entry.id} ${entry.monster.displayName} icon ${entry.monster.iconId} hd ${entry.monster.hitDice} scenario`;
}

function monsterCopyTargetId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const scrapbookId = preferredMonsterCopyId(project, entry);
  const used = new Set(monsterScenarioIds(project));
  if (scrapbookId >= 0 && !used.has(scrapbookId)) return scrapbookId;
  return nextAvailableId([...used].map((id) => ({ id })));
}

function battleMonsterCopyTargetId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const scrapbookId = preferredMonsterCopyId(project, entry);
  const used = new Set(monsterScenarioIds(project));
  if (scrapbookId > 0 && !used.has(scrapbookId)) return scrapbookId;
  return nextAvailablePlaceableMonsterId([...used].map((id) => ({ id })));
}

function preferredMonsterCopyId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const preferred = typeof entry.summary.preferredScenarioMonsterId === "number" ? Math.trunc(entry.summary.preferredScenarioMonsterId) : scrapbookIndex(entry);
  if (preferred >= 0) return preferred;
  return nextAvailableId(monsterScenarioIds(project).map((id) => ({ id })));
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

function monsterIconOptions(project: Project, catalog: LibraryCatalog | null, lookups: CombatLookups): CombatSelectOption[] {
  const options = new Map<number, CombatSelectOption>();
  const add = (value: number | null | undefined, label: string, detail: string, key: string) => {
    if (value == null || !Number.isFinite(value) || value === 0) return;
    if (!options.has(value)) options.set(value, { key, value, label, detail });
  };
  for (const asset of project.assets ?? []) {
    if (asset.resourceType === "cicn") add(asset.resourceId, `${asset.label} (${asset.resourceId})`, "Scenario icon asset", asset.id);
  }
  for (const asset of project.assetCatalog.icons ?? []) {
    add(asset.resourceId, `${asset.name || `cicn ${asset.resourceId}`} (${asset.resourceId})`, asset.source, `project-icon:${asset.resourceId}`);
  }
  for (const asset of catalog?.assets ?? []) {
    if (asset.resourceType !== "cicn" || asset.resourceId == null) continue;
    add(asset.resourceId, `${asset.label || `cicn ${asset.resourceId}`} (${asset.resourceId})`, asset.type, asset.id);
  }
  for (const [id, asset] of lookups.realmzActorIconAssetsByAbsId.entries()) {
    add(id, `${asset.label || `Realmz icon ${id}`} (${id})`, "Realmz actor/creature icon", `realmz-icon:${id}`);
  }
  for (const [id, asset] of lookups.monsterMashAssetsByAbsId.entries()) {
    add(id, `${asset.label || `Monster Mash ${id}`} (${id})`, "Monster Mash reference icon", `monster-mash:${id}`);
  }
  return [...options.values()].sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
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

function uniqueSortedNumbers(values: number[]) {
  return [...new Set(values.filter((value) => Number.isFinite(value)).map((value) => Math.trunc(value)))]
    .sort((left, right) => left - right);
}

function battleGridStorageIndexFromDisplayIndex(displayIndex: number) {
  const displayCol = displayIndex % BATTLE_GRID_SIZE;
  const displayRow = Math.floor(displayIndex / BATTLE_GRID_SIZE);
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

function monsterPaletteArtSize(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups) {
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  if (resolution.width && resolution.height) {
    return {
      width: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, resolution.width)),
      height: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, resolution.height))
    };
  }
  const footprint = monsterBattleFootprint(monster, iconEntries, project, lookups);
  return {
    width: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, footprint.width * MONSTER_GRID_ART_SIZE)),
    height: Math.max(1, Math.min(MONSTER_PALETTE_TILE_SIZE, footprint.height * MONSTER_GRID_ART_SIZE))
  };
}

function monsterBattleFootprintLabel(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project, lookups: CombatLookups) {
  const footprint = monsterBattleFootprint(monster, iconEntries, project, lookups);
  return `${formatGridSpan(footprint.width)} x ${formatGridSpan(footprint.height)} grid tile art`;
}

function formatGridSpan(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function tabFromEditor(editor: string): CombatWorkbenchTab {
  if (editor === "monsters") return "monsters";
  if (editor === "scrapbook") return "monsters";
  return "battles";
}

function updateArraySlot(values: number[] = [], index: number, value: number, length: number) {
  const next = [...values];
  while (next.length < length) next.push(0);
  next[index] = value;
  return next.slice(0, length);
}

function useCombatLookups(project: Project | null, catalog: LibraryCatalog | null): CombatLookups {
  return useMemo(() => {
    if (!project) {
      return {
        monsters: [],
        monsterById: new Map(),
        monsterSetsById: new Map([[0, []]]),
        monsterBySetAndId: new Map([[0, new Map()]]),
        iconAssetsByAbsId: new Map(),
        realmzActorIconAssetsByAbsId: new Map(),
        monsterMashAssetsByAbsId: new Map(),
        tabCounts: { battles: 0, monsters: 0 }
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
    const addIconAsset = (asset: CombatIconAsset | null | undefined) => {
      if (!asset?.previewPath || asset.resourceId == null) return;
      const key = Math.abs(asset.resourceId);
      if (!iconAssetsByAbsId.has(key)) iconAssetsByAbsId.set(key, asset);
    };
    for (const asset of project.assets ?? []) {
      if (asset.resourceType === "cicn") addIconAsset(asset);
    }
    for (const asset of project.assetCatalog.icons ?? []) {
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
    return {
      monsters,
      monsterById,
      monsterSetsById,
      monsterBySetAndId,
      iconAssetsByAbsId,
      realmzActorIconAssetsByAbsId,
      monsterMashAssetsByAbsId,
      tabCounts: {
        battles: project.battles.length,
        monsters: monsterScenarioIds(project).length
      }
    };
  }, [catalog?.assets, catalog?.entities, project]);
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
