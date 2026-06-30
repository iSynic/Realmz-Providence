import { memo, ReactNode, useEffect, useMemo, useState } from "react";
import { Brush, Eraser, Eye, MousePointer2 } from "lucide-react";
import { browserReferenceIconUrl } from "../browser/atlasPaths";
import { TutorialTip } from "../components/TutorialTip";
import { itemReferenceOptions } from "../itemReferences";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";
import { isActorOrCreatureIconId } from "../resourceResolver";
import { scriptActionDefinitionFor, scriptActionSummary, scriptStepFlowRoutes } from "./scripts/scriptActionCatalog";
import { LibraryAsset, LibraryCatalog, BattleRecord, IconEntry, MonsterRecord, Project, ProjectCommand, SelectedEntity } from "../types";
import { ScrollArea } from "../ui";
import { selectEntityFromId } from "../utils";

export type CombatWorkbenchTab = "battles" | "monsters" | "scrapbook";

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
  source: "scenario" | "scrapbook" | null;
  key: string | null;
  monsterId: number | null;
  scrapbookEntry?: LibraryCatalog["entities"][number] | null;
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
  iconAssetsByAbsId: Map<number, CombatIconAsset>;
  realmzActorIconAssetsByAbsId: Map<number, LibraryAsset>;
  monsterMashAssetsByAbsId: Map<number, LibraryAsset>;
  tabCounts: Record<CombatWorkbenchTab, number>;
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
};

const TAB_LABELS: Record<CombatWorkbenchTab, string> = {
  battles: "Battles",
  monsters: "Scenario Monsters",
  scrapbook: "Monster Scrapbook"
};

const TAB_HELP: Record<CombatWorkbenchTab, string> = {
  battles: "Author Data BD battle records: a 13 x 13 signed monster grid, distance, before/after strings, and battle macro target.",
  monsters: "Author scenario Data MD monster templates used by battles, spawn/add-ally scripts, bestiary generation, and monster death macros.",
  scrapbook: "Browse bundled read-only Monster Scrapbook records for built-in monster stats, descriptions, item/spell clues, and icon IDs."
};

const BATTLE_GRID_HELP = "Each grid cell stores a signed monster ID. Zero is empty, abs(value) points at a Data MD monster, and a negative value forces the friendly/alternate side after Realmz loads it. Large, tall, and wide monsters use their lower-right grid square as the anchor cell for placement; erase mode clears the top visible monster on the clicked tile.";
const MONSTER_PLACEMENT_HELP = "Choose a scenario monster for the placement brush. Copy built-in Monster Scrapbook entries into Scenario Monsters first if you want to paint them. Data BD stores scenario monster IDs. Erase clears the top visible monster on the clicked tile; Force Friends writes the negative grid value Realmz uses for side flipping.";
const MONSTER_RECORDS_HELP = "Data MD records are 210-byte scenario monster templates. Realmz copies them into runtime combat state, so Providence edits the source template rather than generated bestiary cache data.";
const MONSTER_ICON_FIELD_HELP = "Monster icons are cicn resource IDs. Providence prefers project-local decoded scenario icons, then project assets, then bundled Realmz reference actor/creature art.";
const MONSTER_DEATH_ACTION_HELP = "Defeat Action is the monster death macro/door target. Realmz can run this when the monster dies, so treat it as linked behavior rather than a decorative number.";
const BATTLE_MACRO_HELP = "Battle Macro is an Extra Action Point reference that Realmz checks at the end of each combat round. Providence writes selected macros in the runnable form; positive imports are preserved but warned until edited.";
const SCRAPBOOK_HELP = "Monster Scrapbook is bundled read-only reference/template data. Copy an entry into scenario Data MD before treating it as a runtime scenario monster.";
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
  onApplyCommand
}: CombatPanelProps) {
  const [tab, setTab] = useState<CombatWorkbenchTab>(() => tabFromEditor(activeEditor));
  useEffect(() => setTab(tabFromEditor(activeEditor)), [activeEditor]);
  const selectTab = (next: CombatWorkbenchTab) => {
    setTab(next);
    onSelectEditor(next === "battles" ? "battles" : next === "monsters" ? "monsters" : "scrapbook");
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
              body="Use Combat for scenario battles, scenario monsters, and built-in Monster Scrapbook reference records."
              side="right"
            >
              <span>Combat</span>
            </TutorialTip>
          </h1>
          <p>Author battles, monster placement, monster records, and reusable monster templates.</p>
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
        />
      )}
      {tab === "scrapbook" && (
        <MonsterScrapbookWorkbench
          project={project}
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
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
          <span>Record Tools</span>
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
        battle={battle}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
        onUpdateGrid={(grid) => onUpdate({ grid })}
      />
    </article>
  );
}

function BattleBoard({
  project,
  catalog,
  iconEntries,
  lookups,
  previewContext,
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
  battle: BattleRecord;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateGrid: (grid: number[]) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, battle.grid.findIndex(Boolean)));
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [brush, setBrush] = useState<MonsterPlacementBrush>(() => ({
    mode: "select",
    source: battle.grid.find(Boolean) ? "scenario" : null,
    key: battle.grid.find(Boolean) ? `scenario:${Math.abs(battle.grid.find(Boolean) ?? 0)}` : null,
    monsterId: battle.grid.find(Boolean) ? Math.abs(battle.grid.find(Boolean) ?? 0) : null,
    scrapbookEntry: null,
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
  const selectedMonster = selectedCell?.monsterId ? lookups.monsterById.get(selectedCell.monsterId) ?? null : null;
  const selectedMissingScrapbookEntry = selectedCell?.monsterId && !selectedMonster ? scrapbookEntryForMonsterId(catalog, selectedCell.monsterId) : null;
  const brushMonster = brush.monsterId ? lookups.monsterById.get(brush.monsterId) ?? null : null;
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
          const monster = lookups.monsterById.get(cell.monsterId) ?? null;
          return {
            ...cell,
            monster,
            col: cell.displayCol,
            row: cell.displayRow,
            footprint: monster ? monsterBattleFootprint(monster, iconEntries, project, lookups) : { width: 1, height: 1 }
          };
        }),
    [cells, iconEntries, lookups, project]
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
    if (brush.source === "scrapbook" && brush.scrapbookEntry) {
      if (!onApplyCommand) return;
      if (lookups.monsterById.has(monsterId)) {
        monsterId = battleMonsterCopyTargetId(project, brush.scrapbookEntry);
      }
      copyScrapbookMonsterToScenario(brush.scrapbookEntry, monsterId, onApplyCommand);
      setBrush((current) =>
        current.source === "scrapbook" && current.key === brush.key
          ? { ...current, source: "scenario", key: `scenario:${monsterId}`, monsterId, scrapbookEntry: null }
          : current
      );
    }
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
              scrapbookEntry: null,
              mode: "paint"
            }))
          }
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
                  title={cell.value ? monsterPlacementLabel(lookups.monsterById.get(cell.monsterId), cell.value) : `Empty cell ${cell.displayCol},${cell.displayRow}`}
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
                  aria-label={cell.value ? monsterPlacementLabel(lookups.monsterById.get(cell.monsterId), cell.value) : `Empty cell ${cell.displayCol},${cell.displayRow}`}
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
                  <ToggleButton active={brush.forceFriend} label="Force Friends" help="Write a negative monster ID so Realmz flips the loaded monster to the friendly/alternate side." onClick={() => setBrush((current) => ({ ...current, forceFriend: !current.forceFriend }))} />
                </div>
              </>
            ) : (
              <p className="empty-copy compact">Choose a monster from the palette to paint it into the battle grid.</p>
            )}
          </div>
        ) : (
          <div className="selected-battle-cell">
            <strong>Anchor Cell {selectedCell?.displayCol ?? 0}, {selectedCell?.displayRow ?? 0}</strong>
            <small>{selectedCell?.value ? monsterPlacementTitle(selectedMonster, selectedCell.value) : "Empty anchor cell"}</small>
            <small className="battle-anchor-note">Large, tall, and wide monsters are placed by their lower-right anchor cell. Erase mode clears the top visible monster on the clicked tile.</small>
            <MonsterSelect
              lookups={lookups}
              value={selectedCell?.monsterId ?? 0}
              onCommit={(monsterId) => updateSelected(monsterId === 0 ? 0 : (selectedCell?.value ?? 0) < 0 ? -Math.abs(monsterId) : Math.abs(monsterId))}
            />
            <div className="placement-controls">
              <ToggleButton active={(selectedCell?.value ?? 0) < 0} label="Force Friends" help="Toggle the sign of this battle-grid value. The absolute value stays the same monster record; Realmz flips the loaded monster's traiter flag." disabled={!selectedCell?.monsterId} onClick={() => selectedCell && updateSelected(selectedCell.value < 0 ? selectedCell.monsterId : -selectedCell.monsterId)} />
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
                  Monster {selectedCell.monsterId} is not in scenario Data MD.
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
  onSelect
}: {
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  selectedKey: string | null;
  onSelect: (entry: BattleMonsterPaintEntry) => void;
}) {
  const [query, setQuery] = useState("");
  const placeableMonsters = useMemo(
    () => lookups.monsters.filter((monster) => monster.id > 0 && monster.id <= MAX_DIVINITY_BATTLE_MONSTER_ID),
    [lookups.monsters]
  );
  const entries = useMemo<BattleMonsterPaintEntry[]>(
    () => placeableMonsters.map((monster) => ({ kind: "scenario" as const, key: `scenario:${monster.id}`, id: monster.id, monster })),
    [placeableMonsters]
  );
  const filtered = useMemo(
    () => filterRecords(entries, query, battleMonsterPaintEntrySearchText),
    [entries, query]
  );
  const hasScenarioMonsters = lookups.monsters.some((monster) => monster.id > 0);
  const hasOnlyUnplaceableMonsterZero = lookups.monsters.length > 0 && !hasScenarioMonsters;
  const hasOnlyOutOfRangeMonsters = hasScenarioMonsters && placeableMonsters.length === 0;
  return (
    <div className="monster-palette">
      <header>
        <TutorialTip title="Monster Placement Brush" body={MONSTER_PLACEMENT_HELP} side="right">
          <strong>Monster Palette</strong>
        </TutorialTip>
        <small>{entries.length} placeable</small>
      </header>
      <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search monsters..." />
      <div className="monster-brush-palette" aria-label="Paintable monsters">
        {entries.length === 0 && !hasOnlyUnplaceableMonsterZero && !hasOnlyOutOfRangeMonsters && (
          <p className="empty-copy compact">No scenario monsters are available for battle placement.</p>
        )}
        {hasOnlyUnplaceableMonsterZero && (
          <p className="empty-copy compact">Monster 0 exists, but Data BD uses 0 for empty battle cells. Create or copy a monster into slot 1 or higher before placing battle monsters.</p>
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
            <button
              key={entry.key}
              type="button"
              className={selectedKey === entry.key ? "selected" : ""}
              title={`${name}\n${facts}\n${footprint}\n${paintNote}`}
              aria-label={`${name}. ${facts}. ${footprint}. ${paintNote}`}
              onClick={() => onSelect(entry)}
            >
              <span className="monster-brush-art" style={{ width: `${artSize.width}px`, height: `${artSize.height}px` }}>
                <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} />
              </span>
              <span className="monster-brush-id">{entry.id}</span>
            </button>
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
  const [query, setQuery] = useState("");
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "monster:");
  const filtered = useMemo(
    () => filterRecords(lookups.monsters, query, (monster) => `${monster.id} ${monster.displayName} icon ${monster.iconId} hd ${monster.hitDice}`),
    [lookups.monsters, query]
  );
  const nextMonsterId = nextAvailableId(lookups.monsters);
  const selected =
    selectedFromEntity !== null ? lookups.monsters.find((monster) => monster.id === selectedFromEntity) ?? null :
    lookups.monsters[0] ?? null;
  const selectedDescription = selected ? project.monsterDescriptions.find((description) => description.id === selected.id)?.text ?? "" : "";
  const selectMonster = (id: number) => onSelectEntity(selectEntityFromId(`monster:${id}`));
  const update = (id: number, changes: Partial<MonsterRecord>) => onApplyCommand?.({ kind: "updateMonsterRecord", label: "Update monster", id, changes });

  return (
    <div className="combat-record-layout monster-layout">
      <RecordList
        title="Scenario Monster Records"
        query={query}
        onQuery={setQuery}
        count={filtered.length}
        total={lookups.monsters.length}
        newLabel={`New Monster ${nextMonsterId}`}
        help={MONSTER_RECORDS_HELP}
        onNew={() => {
          onApplyCommand?.({ kind: "createTargetRecord", label: "Create monster", recordType: "monster", id: nextMonsterId });
          selectMonster(nextMonsterId);
        }}
      >
        {filtered.map((monster) => (
          <button
            key={monster.id}
            type="button"
            className={selected?.id === monster.id ? "selected" : ""}
            onClick={() => selectMonster(monster.id)}
          >
            <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} compact />
            <span>
              <strong>{monster.displayName || `Monster ${monster.id}`}</strong>
              <small>{monsterFacts(monster)}</small>
            </span>
          </button>
        ))}
        {filtered.length === 0 && <p className="empty-copy compact">No scenario monsters match that search.</p>}
      </RecordList>
      {selected ? (
        <MonsterEditor
          project={project}
          catalog={catalog}
          monster={selected}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          description={selectedDescription}
          onUpdate={(changes) => update(selected.id, changes)}
          onUpdateDescription={(text) => onApplyCommand?.({ kind: "upsertMonsterDescription", label: `Update monster ${selected.id} description`, id: selected.id, text })}
          onDuplicate={() => {
            const id = nextMonsterId;
            update(id, { ...selected, id, displayName: `${selected.displayName || `Monster ${selected.id}`} Copy` });
            selectMonster(id);
          }}
          onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear monster", recordType: "monster", id: selected.id })}
        />
      ) : (
        <EmptyCombatEditor title="No scenario monster selected" body="Create a Data MD monster record or copy a built-in Monster Scrapbook entry into this scenario." />
      )}
    </div>
  );
}

function ScrapbookMonsterPreview({
  entry,
  iconEntries,
  lookups,
  previewContext,
  copyId,
  onCopy
}: {
  entry: LibraryCatalog["entities"][number];
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  copyId: number;
  onCopy: () => void;
}) {
  const description = scrapbookDescription(entry);
  return (
    <article className="combat-editor monster-editor scrapbook-monster-preview">
      <header className="combat-editor-header">
        <div>
          <span>{scrapbookName(entry)}</span>
          <small>Built-in Monster Scrapbook entry {scrapbookIndex(entry)}</small>
        </div>
        <div className="combat-editor-actions">
          <button type="button" className="btn btn-primary btn-xs" onClick={onCopy}>
            Copy To Scenario Monster {copyId}
          </button>
        </div>
      </header>
      <section className="monster-section monster-identity-section">
        <ScrapbookMonsterIcon entry={entry} iconEntries={iconEntries} lookups={lookups} previewContext={previewContext} />
        <div className="scrapbook-stat-grid">
          <ScrapbookFact label="Hit Dice" value={summaryNumber(entry, "hitDice")} />
          <ScrapbookFact label="Armor" value={summaryNumber(entry, "armor")} />
          <ScrapbookFact label="Agility" value={summaryNumber(entry, "agility")} />
          <ScrapbookFact label="Icon" value={summaryNumber(entry, "iconId")} />
          <ScrapbookFact label="Spell Points" value={summaryNumber(entry, "spellPoints")} />
          <ScrapbookFact label="Victory Points" value={summaryNumber(entry, "exp")} />
        </div>
      </section>
      {description && (
        <section className="monster-section">
          <header><strong>Description</strong><small>Copied to Data DES when this built-in monster is copied.</small></header>
          <p className="scrapbook-description">{description}</p>
        </section>
      )}
      <section className="monster-section">
        <header><strong>Copy Behavior</strong><small>Scenario-owned data only.</small></header>
        <p className="empty-copy compact">
          Battle grids can only place scenario Data MD monsters. Copy this built-in entry into the scenario before placing it in a battle.
        </p>
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
  onUpdate,
  onUpdateDescription,
  onDuplicate,
  onClear
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  description: string;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
  onUpdateDescription: (text: string) => void;
  onDuplicate: () => void;
  onClear: () => void;
}) {
  return (
    <article className="combat-editor monster-editor">
      <header className="combat-editor-header">
        <div>
          <span>{monster.displayName || `Monster ${monster.id}`}</span>
          <small>{monsterFacts(monster)}</small>
        </div>
        <div className="combat-editor-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicate}>Duplicate</button>
          <button type="button" className="btn btn-danger btn-xs" onClick={onClear}>Clear To Defaults</button>
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
        <header><strong>Spells And Loot</strong><small>Spell slots, money, and item drops.</small></header>
        <SpellSlotGrid project={project} catalog={catalog} values={monster.spells} onCommit={(spells) => onUpdate({ spells })} />
        <CompactArrayFields label="Money" values={monster.money} length={3} onCommit={(money) => onUpdate({ money })} />
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
          {monsterBattleStats(monster, forcedFriendly).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
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
  const interactive = mode === "select" || mode === "erase";
  const title = mode === "erase" ? `Erase ${label}` : mode === "select" ? `Select or drag ${label}` : label;
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
      title={title}
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
      {placement.monster ? (
        <MonsterIcon monster={placement.monster} iconEntries={iconEntries} project={project} lookups={lookups} previewContext={previewContext} />
      ) : (
        <b>{placement.monsterId}</b>
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

function MonsterSelect({ lookups, value, onCommit }: { lookups: CombatLookups; value: number; onCommit: (value: number) => void }) {
  const placeableMonsters = lookups.monsters.filter((monster) => monster.id !== 0);
  return (
    <label className="combat-field">
      <FieldLabel label="Anchor Cell Monster" help="This writes the absolute monster ID for the selected anchor cell. Data BD uses 0 for empty cells, so Monster 0 cannot be selected here. Use Force Friends to preserve Realmz's negative side-flip encoding." />
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty</option>
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

function ToggleButton({ active, label, icon, disabled, help, onClick }: { active: boolean; label: string; icon?: ReactNode; disabled?: boolean; help?: string; onClick: () => void }) {
  return (
    <button type="button" className={`combat-toggle${active ? " active" : ""}`} disabled={disabled} title={help} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
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
            <section className="monster-section">
              <header><strong>Spells And Loot</strong><small>IDs preserved from the library record.</small></header>
              <div className="scrapbook-pill-grid">
                <ScrapbookArray label="Spells" values={summaryNumberArray(selected, "spells")} />
                <ScrapbookArray label="Items" values={summaryNumberArray(selected, "items")} />
                <ScrapbookArray label="Money" values={summaryNumberArray(selected, "money")} />
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

function ScrapbookArray({ label, values }: { label: string; values: number[] }) {
  const visible = values.filter((value) => value !== 0);
  return (
    <div className="scrapbook-array">
      <span>{label}</span>
      <div>
        {(visible.length ? visible : [0]).map((value, index) => <b key={`${value}:${index}`}>{value}</b>)}
      </div>
    </div>
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
  const scrapbookId = scrapbookIndex(entry);
  if (scrapbookId >= 0 && !project.monsters.some((monster) => monster.id === scrapbookId)) return scrapbookId;
  return nextAvailableId(project.monsters);
}

function battleMonsterCopyTargetId(project: Project, entry: LibraryCatalog["entities"][number]) {
  const scrapbookId = scrapbookIndex(entry);
  if (scrapbookId > 0 && !project.monsters.some((monster) => monster.id === scrapbookId)) return scrapbookId;
  return nextAvailablePlaceableMonsterId(project.monsters);
}

function nextAvailablePlaceableMonsterId(records: Array<{ id: number }>) {
  const used = new Set(records.map((record) => record.id));
  for (let id = 1; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return Math.max(1, used.size);
}

function scrapbookEntryForMonsterId(catalog: LibraryCatalog | null, monsterId: number) {
  return (catalog?.entities ?? []).find((entry) => entry.type === "monster-scrapbook-entry" && scrapbookIndex(entry) === monsterId) ?? null;
}

function copyScrapbookMonsterToScenario(
  entry: LibraryCatalog["entities"][number],
  id: number,
  onApplyCommand: ((command: ProjectCommand) => void) | undefined
) {
  const template = monsterRecordFromScrapbookEntry(entry, id);
  onApplyCommand?.({
    kind: "createMonsterFromTemplate",
    label: `Copy ${scrapbookName(entry)} to Monster ${id}`,
    id,
    template,
    description: scrapbookDescription(entry)
  });
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

function monsterFacts(monster: MonsterRecord) {
  return `ID ${monster.id}, HD ${monster.hitDice}, armor ${monster.armor}, agility ${monster.agility}, icon ${monster.iconId}`;
}

function monsterBattleStats(monster: MonsterRecord, forcedFriendly = false): Array<[string, string | number]> {
  return [
    ["Stamina", monster.hitDice],
    ["Spell Points", monster.spellPoints],
    ["Armor Cat", monster.armor],
    ["Magic Resist", monster.magicResistance],
    ["Movement", monster.movementMax],
    ["Alliance", forcedFriendly ? `${monster.traitor} -> friendly` : monster.traitor],
    ["Experience", monster.exp],
    ["# Att", monster.attackCount]
  ];
}

function monsterPlacementTitle(monster: MonsterRecord | null | undefined, rawValue: number) {
  const id = Math.abs(rawValue);
  const side = rawValue < 0 ? " (force friend)" : "";
  return monster ? `${monster.displayName || `Monster ${monster.id}`} | Monster ${monster.id}${side}` : `Monster ${id}${side}`;
}

function monsterPlacementLabel(monster: MonsterRecord | null | undefined, rawValue: number) {
  const id = Math.abs(rawValue);
  const side = rawValue < 0 ? " (force friend)" : "";
  return monster ? `${monster.displayName || `Monster ${monster.id}`} | ${monsterFacts(monster)}${side}` : `Monster ${id}${side}`;
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
  if (editor === "scrapbook") return "scrapbook";
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
        iconAssetsByAbsId: new Map(),
        realmzActorIconAssetsByAbsId: new Map(),
        monsterMashAssetsByAbsId: new Map(),
        tabCounts: { battles: 0, monsters: 0, scrapbook: 0 }
      };
    }
    const monsters = [...(project.monsters ?? [])].sort((a, b) => a.id - b.id);
    const monsterById = new Map(monsters.map((monster) => [monster.id, monster]));
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
    const scrapbook = catalog?.entities.filter((entity) => entity.type === "monster-scrapbook-entry").length ?? 0;
    return {
      monsters,
      monsterById,
      iconAssetsByAbsId,
      realmzActorIconAssetsByAbsId,
      monsterMashAssetsByAbsId,
      tabCounts: {
        battles: project.battles.length,
        monsters: project.monsters.length,
        scrapbook
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
