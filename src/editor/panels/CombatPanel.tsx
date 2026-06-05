import { memo, ReactNode, useEffect, useMemo, useState } from "react";
import { browserReferenceIconUrl } from "../browser/atlasPaths";
import { TargetPicker } from "../components/RealmzTargetPicker";
import { TutorialTip } from "../components/TutorialTip";
import { useResolvedPreviewUrl, type PreviewRuntimeContext } from "../previewUrls";
import { isActorOrCreatureIconId } from "../resourceResolver";
import { LibraryAsset, LibraryCatalog, BattleRecord, IconEntry, MonsterRecord, Project, ProjectCommand, SelectedEntity } from "../types";
import { ScrollArea } from "../ui";
import { selectEntityFromId } from "../utils";

export type CombatWorkbenchTab = "battles" | "monsters" | "scrapbook" | "mash";

type BattleGridCellView = {
  index: number;
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

type MonsterPlacementBrush = {
  monsterId: number;
  forceFriend: boolean;
  erase: boolean;
};

type MonsterIconResolution = {
  url: string | null;
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
  monsters: "Monsters",
  scrapbook: "Monster Scrapbook",
  mash: "Monster Mash"
};

const TAB_HELP: Record<CombatWorkbenchTab, string> = {
  battles: "Author Data BD battle records: a 13 x 13 signed monster grid, distance, before/after messages, and battle macro target.",
  monsters: "Author scenario Data MD monster templates used by battles, spawn/add-ally scripts, bestiary generation, and monster death macros.",
  scrapbook: "Browse bundled read-only Monster Scrapbook records for built-in monster stats, descriptions, item/spell clues, and icon IDs.",
  mash: "Open the Assets reference view for Monster Mash cicn art. These icons are reference material unless copied or decoded into the scenario."
};

const BATTLE_RECORDS_HELP = "Data BD records are fixed 346-byte battle records. They store a 13 x 13 signed monster grid, distance, before/after message IDs, and a battle macro field.";
const BATTLE_GRID_HELP = "Each grid cell stores a signed monster ID. Zero is empty, abs(value) points at a Data MD monster, and a negative value forces the friendly/alternate side after Realmz loads it.";
const MONSTER_PLACEMENT_HELP = "Choose a scenario monster template for the placement brush. Erase clears cells; Force Friend writes the negative grid value Realmz uses for side flipping.";
const MONSTER_RECORDS_HELP = "Data MD records are 210-byte scenario monster templates. Realmz copies them into runtime combat state, so Providence edits the source template rather than generated bestiary cache data.";
const MONSTER_ICON_FIELD_HELP = "Monster icons are cicn resource IDs. Providence prefers project-local decoded scenario icons, then project assets, then bundled Realmz reference actor/creature art.";
const MONSTER_DEATH_ACTION_HELP = "Defeat Action is the monster death macro/door target. Realmz can run this when the monster dies, so treat it as linked behavior rather than a decorative number.";
const BATTLE_ACTION_HELP = "Battle Action is an Extra Action Point / macro reference used by combat-round logic. Runtime evidence is sign-sensitive, so imported values should keep their source evidence visible.";
const SCRAPBOOK_HELP = "Monster Scrapbook is bundled read-only reference data. It does not replace the current scenario's editable Data MD monster records.";

export function CombatPanel({
  activeEditor = "domain",
  project,
  catalog,
  selectedEntity,
  iconEntries,
  previewContext = {},
  onSelectEntity,
  onSelectEditor,
  onOpenTool,
  onApplyCommand
}: CombatPanelProps) {
  const [tab, setTab] = useState<CombatWorkbenchTab>(() => tabFromEditor(activeEditor));
  useEffect(() => setTab(tabFromEditor(activeEditor)), [activeEditor]);
  const selectTab = (next: CombatWorkbenchTab) => {
    if (next === "mash") {
      onOpenTool?.("assets", "divinity-icons");
      return;
    }
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
              body="Use Combat for scenario battles, scenario monsters, built-in Monster Scrapbook reference records, and Monster Mash icon reference material."
              side="right"
            >
              <span>Combat</span>
            </TutorialTip>
          </h1>
          <p>Author battles, monster placement, monster records, and combat art references.</p>
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
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {tab === "scrapbook" && (
        <MonsterScrapbookWorkbench
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onOpenMash={() => onOpenTool?.("assets", "divinity-icons")}
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
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const battles = useMemo(() => [...(project.battles ?? [])].sort((a, b) => a.id - b.id), [project.battles]);
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "battle:");
  const selectedId = selectedFromEntity ?? battles[0]?.id ?? 0;
  const selected = battles.find((battle) => battle.id === selectedId) ?? battles[0] ?? null;
  const filtered = filterRecords(battles, query, (battle) => `battle ${battle.id} ${battleSummary(project, battle)}`);
  const nextBattleId = nextAvailableId(battles);
  const selectBattle = (id: number) => onSelectEntity(selectEntityFromId(`battle:${id}`));
  const update = (id: number, changes: Partial<Pick<BattleRecord, "grid" | "dist" | "messageBefore" | "messageAfter" | "battleMacro">>) =>
    onApplyCommand?.({ kind: "updateBattleRecord", label: "Update battle", id, changes });

  return (
    <div className="combat-record-layout battle-layout">
      <RecordList
        title="Battle Records"
        query={query}
        onQuery={setQuery}
        count={filtered.length}
        total={battles.length}
        newLabel={`New Battle ${nextBattleId}`}
        help={BATTLE_RECORDS_HELP}
        onNew={() => {
          onApplyCommand?.({ kind: "createTargetRecord", label: "Create battle", recordType: "battle", id: nextBattleId });
          selectBattle(nextBattleId);
        }}
      >
        {filtered.map((battle) => (
          <button
            key={battle.id}
            type="button"
            className={selected?.id === battle.id ? "selected" : ""}
            onClick={() => selectBattle(battle.id)}
          >
            <strong>Battle {battle.id}</strong>
            <small>{battleSummary(project, battle)}</small>
          </button>
        ))}
      </RecordList>
      {selected ? (
        <BattleEditor
          project={project}
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          battle={selected}
          onUpdate={(changes) => update(selected.id, changes)}
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
        <EmptyCombatEditor title="No battle selected" body="Create a battle record to begin placing monsters." />
      )}
    </div>
  );
}

function BattleEditor({
  project,
  catalog,
  battle,
  iconEntries,
  lookups,
  onUpdate,
  onDuplicate,
  onClear,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  battle: BattleRecord;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  onUpdate: (changes: Partial<Pick<BattleRecord, "grid" | "dist" | "messageBefore" | "messageAfter" | "battleMacro">>) => void;
  onDuplicate: () => void;
  onClear: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  return (
    <article className="combat-editor battle-editor">
      <header className="combat-editor-header">
        <div>
          <span>Battle {battle.id}</span>
          <small>{battle.grid.filter(Boolean).length} placed monster slot(s)</small>
        </div>
        <div className="combat-editor-actions">
          <button type="button" className="btn btn-secondary btn-xs" onClick={onDuplicate}>Duplicate</button>
          <button type="button" className="btn btn-danger btn-xs" onClick={onClear}>Clear Battle</button>
        </div>
      </header>
      <section className="battle-summary-strip">
        <NumberField label="Distance" value={battle.dist} onCommit={(dist) => onUpdate({ dist })} />
        <TargetField
          project={project}
          catalog={catalog}
          label="Before Message"
          opcode={1}
          value={battle.messageBefore}
          help="Data BD before-message ID. Realmz displays this Data SD2 message before combat starts when the value is nonzero."
          onCommit={(messageBefore) => onUpdate({ messageBefore })}
          onSelectEntity={onSelectEntity}
          onCreate={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create before battle message", recordType: "message", id })}
        />
        <TargetField
          project={project}
          catalog={catalog}
          label="After Message"
          opcode={1}
          value={battle.messageAfter}
          help="Data BD after-message ID. Realmz copies this Data SD2 message for post-battle display when the value is nonzero."
          onCommit={(messageAfter) => onUpdate({ messageAfter })}
          onSelectEntity={onSelectEntity}
          onCreate={(id) => onApplyCommand?.({ kind: "createTargetRecord", label: "Create after battle message", recordType: "message", id })}
        />
        <TargetField
          project={project}
          catalog={catalog}
          label="Battle Action"
          opcode={39}
          value={battle.battleMacro}
          help={BATTLE_ACTION_HELP}
          onCommit={(battleMacro) => onUpdate({ battleMacro })}
          onSelectEntity={onSelectEntity}
        />
      </section>
      <BattleBoard
        project={project}
        iconEntries={iconEntries}
        lookups={lookups}
        battle={battle}
        onUpdateGrid={(grid) => onUpdate({ grid })}
      />
    </article>
  );
}

function BattleBoard({
  project,
  iconEntries,
  lookups,
  battle,
  onUpdateGrid
}: {
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  battle: BattleRecord;
  onUpdateGrid: (grid: number[]) => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(() => Math.max(0, battle.grid.findIndex(Boolean)));
  const [brush, setBrush] = useState<MonsterPlacementBrush>(() => ({
    monsterId: Math.abs(battle.grid.find(Boolean) ?? 0),
    forceFriend: false,
    erase: false
  }));
  const cells = useMemo<BattleGridCellView[]>(
    () => Array.from({ length: 169 }, (_, index) => {
      const value = battle.grid[index] ?? 0;
      return { index, value, monsterId: Math.abs(value), alternateSide: value < 0 };
    }),
    [battle.grid]
  );
  const selectedCell = cells[selectedIndex] ?? cells[0];
  const selectedMonster = selectedCell?.monsterId ? lookups.monsterById.get(selectedCell.monsterId) ?? null : null;
  const placementMonster = brush.monsterId ? lookups.monsterById.get(brush.monsterId) ?? null : null;
  const placements = useMemo<BattleGridPlacementView[]>(
    () =>
      cells
        .filter((cell) => cell.monsterId)
        .map((cell) => {
          const monster = lookups.monsterById.get(cell.monsterId) ?? null;
          const col = cell.index % 13;
          const row = Math.floor(cell.index / 13);
          return {
            ...cell,
            monster,
            col,
            row,
            footprint: monster ? monsterBattleFootprint(monster, iconEntries, project, lookups) : { width: 1, height: 1 }
          };
        }),
    [cells, iconEntries, lookups, project]
  );
  const place = (index: number) => {
    setSelectedIndex(index);
    const next = [...battle.grid];
    while (next.length < 169) next.push(0);
    if (brush.erase) next[index] = 0;
    else if (brush.monsterId) next[index] = brush.forceFriend ? -Math.abs(brush.monsterId) : Math.abs(brush.monsterId);
    onUpdateGrid(next.slice(0, 169));
  };
  const updateSelected = (value: number) => {
    const next = [...battle.grid];
    while (next.length < 169) next.push(0);
    next[selectedIndex] = value;
    onUpdateGrid(next.slice(0, 169));
  };

  return (
    <section className="battle-board-workbench">
      <div className="battle-board-card">
        <header>
          <div>
            <TutorialTip title="Battle Grid" body={BATTLE_GRID_HELP} side="right">
              <strong>Battle Grid</strong>
            </TutorialTip>
            <small>13 x 13 monster placement board</small>
          </div>
          <b>{battle.grid.filter(Boolean).length} placed</b>
        </header>
        <div className="battle-board" role="grid" aria-label="Battle monster grid">
          {cells.map((cell) => (
            <button
              key={cell.index}
              type="button"
              role="gridcell"
              className={`${cell.index === selectedIndex ? "selected" : ""}${cell.value ? " filled" : ""}${cell.alternateSide ? " alternate-side" : ""}`}
              title={cell.value ? monsterPlacementLabel(lookups.monsterById.get(cell.monsterId), cell.value) : `Empty cell ${cell.index % 13},${Math.floor(cell.index / 13)}`}
              onClick={() => place(cell.index)}
              aria-label={cell.value ? monsterPlacementLabel(lookups.monsterById.get(cell.monsterId), cell.value) : `Empty cell ${cell.index % 13},${Math.floor(cell.index / 13)}`}
            />
          ))}
          {placements.map((placement) => (
            <BattleMonsterOverlay
              key={`${placement.index}:${placement.value}`}
              placement={placement}
              iconEntries={iconEntries}
              project={project}
              lookups={lookups}
            />
          ))}
        </div>
      </div>
      <aside className="monster-placement-card">
        <MonsterPalette
          project={project}
          iconEntries={iconEntries}
          lookups={lookups}
          selectedId={brush.monsterId}
          onSelect={(monsterId) => setBrush((current) => ({ ...current, monsterId, erase: false }))}
        />
        <div className="placement-controls">
          <ToggleButton active={brush.erase} label="Erase" help="Clear clicked battle cells back to zero." onClick={() => setBrush((current) => ({ ...current, erase: !current.erase }))} />
          <ToggleButton active={brush.forceFriend} label="Force Friend" help="Write a negative monster ID so Realmz flips the loaded monster to the friendly/alternate side." disabled={brush.erase || !brush.monsterId} onClick={() => setBrush((current) => ({ ...current, forceFriend: !current.forceFriend }))} />
        </div>
        <div className="selected-battle-cell">
          <strong>Selected Cell {selectedIndex % 13}, {Math.floor(selectedIndex / 13)}</strong>
          <small>{selectedCell?.value ? monsterPlacementLabel(selectedMonster, selectedCell.value) : "Empty cell"}</small>
          <MonsterSelect lookups={lookups} value={selectedCell?.monsterId ?? 0} onCommit={(monsterId) => updateSelected(monsterId)} />
          <div className="placement-controls">
            <ToggleButton active={(selectedCell?.value ?? 0) < 0} label="Force Friend" help="Toggle the sign of this battle-grid value. The absolute value stays the same monster record." disabled={!selectedCell?.monsterId} onClick={() => selectedCell && updateSelected(selectedCell.value < 0 ? selectedCell.monsterId : -selectedCell.monsterId)} />
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => updateSelected(0)}>Clear Cell</button>
          </div>
          {selectedMonster && (
            <div className="selected-monster-preview">
              <MonsterIcon monster={selectedMonster} iconEntries={iconEntries} project={project} lookups={lookups} />
              <span>{monsterFacts(selectedMonster)}</span>
            </div>
          )}
          {!selectedMonster && placementMonster && (
            <div className="selected-monster-preview">
              <MonsterIcon monster={placementMonster} iconEntries={iconEntries} project={project} lookups={lookups} />
              <span>Brush: {placementMonster.displayName || `Monster ${placementMonster.id}`}</span>
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}

function MonsterPalette({
  project,
  iconEntries,
  lookups,
  selectedId,
  onSelect
}: {
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  selectedId: number;
  onSelect: (monsterId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => filterRecords(lookups.monsters, query, (monster) => `${monster.id} ${monster.displayName} icon ${monster.iconId}`),
    [lookups.monsters, query]
  );
  const selectedMonster = selectedId ? lookups.monsterById.get(selectedId) ?? null : null;
  return (
    <div className="monster-palette">
      <header>
        <TutorialTip title="Monster Placement Brush" body={MONSTER_PLACEMENT_HELP} side="right">
          <strong>Monster To Place</strong>
        </TutorialTip>
        <small>{selectedId ? `Monster ${selectedId}` : "Choose a monster"}</small>
      </header>
      {selectedMonster && (
        <div className="monster-to-place-preview">
          <MonsterIcon monster={selectedMonster} iconEntries={iconEntries} project={project} lookups={lookups} large />
          <span>
            <strong>{selectedMonster.displayName || `Monster ${selectedMonster.id}`}</strong>
            <small>{monsterFacts(selectedMonster)}</small>
            <small>{monsterBattleFootprintLabel(selectedMonster, iconEntries, project, lookups)}</small>
          </span>
        </div>
      )}
      <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search monsters..." />
      <div className="monster-palette-list">
        {filtered.slice(0, 32).map((monster) => (
          <button
            key={monster.id}
            type="button"
            className={selectedId === monster.id ? "selected" : ""}
            onClick={() => onSelect(monster.id)}
          >
            <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} compact />
            <span>
              <strong>{monster.displayName || `Monster ${monster.id}`}</strong>
              <small>{monsterFacts(monster)}</small>
            </span>
          </button>
        ))}
        {filtered.length > 32 ? <small className="combat-list-overflow-note">{(filtered.length - 32).toLocaleString()} more monster(s); search to narrow.</small> : null}
      </div>
    </div>
  );
}

function MonsterWorkbench({
  project,
  catalog: _catalog,
  selectedEntity,
  iconEntries,
  lookups,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "monster:");
  const selectedId = selectedFromEntity ?? lookups.monsters[0]?.id ?? 0;
  const selected = lookups.monsterById.get(selectedId) ?? lookups.monsters[0] ?? null;
  const filtered = useMemo(
    () => filterRecords(lookups.monsters, query, (monster) => `${monster.id} ${monster.displayName} icon ${monster.iconId} hd ${monster.hitDice}`),
    [lookups.monsters, query]
  );
  const nextMonsterId = nextAvailableId(lookups.monsters);
  const selectMonster = (id: number) => onSelectEntity(selectEntityFromId(`monster:${id}`));
  const update = (id: number, changes: Partial<MonsterRecord>) => onApplyCommand?.({ kind: "updateMonsterRecord", label: "Update monster", id, changes });

  return (
    <div className="combat-record-layout monster-layout">
      <RecordList
        title="Monster Records"
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
            <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} compact />
            <span>
              <strong>{monster.displayName || `Monster ${monster.id}`}</strong>
              <small>{monsterFacts(monster)}</small>
            </span>
          </button>
        ))}
      </RecordList>
      {selected ? (
        <MonsterEditor
          project={project}
          monster={selected}
          iconEntries={iconEntries}
          lookups={lookups}
          onUpdate={(changes) => update(selected.id, changes)}
          onDuplicate={() => {
            const id = nextMonsterId;
            update(id, { ...selected, id, displayName: `${selected.displayName || `Monster ${selected.id}`} Copy` });
            selectMonster(id);
          }}
          onClear={() => onApplyCommand?.({ kind: "deleteTargetRecord", label: "Clear monster", recordType: "monster", id: selected.id })}
        />
      ) : (
        <EmptyCombatEditor title="No monster selected" body="Create a monster record to edit its combat stats and icon." />
      )}
    </div>
  );
}

function MonsterEditor({
  project,
  monster,
  iconEntries,
  lookups,
  onUpdate,
  onDuplicate,
  onClear
}: {
  project: Project;
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  onUpdate: (changes: Partial<MonsterRecord>) => void;
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
        <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} lookups={lookups} large />
        <div className="monster-field-grid">
          <TextField label="Monster Name" value={monster.displayName} onCommit={(displayName) => onUpdate({ displayName })} />
          <NumberField label="Name ID" value={monster.nameId} onCommit={(nameId) => onUpdate({ nameId })} />
          <NumberField label="Icon" value={monster.iconId} help={MONSTER_ICON_FIELD_HELP} onCommit={(iconId) => onUpdate({ iconId })} />
          <label className="combat-check-field">
            <span>Hide From Bestiary</span>
            <input type="checkbox" checked={monster.notOnMenu} onChange={(event) => onUpdate({ notOnMenu: event.currentTarget.checked })} />
          </label>
          <NumberField label="Defeat Action" value={monster.deathMacro} help={MONSTER_DEATH_ACTION_HELP} onCommit={(deathMacro) => onUpdate({ deathMacro })} />
        </div>
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
          ["Summon Eligible", "canSummon"],
          ["Weapon Used", "weapon"]
        ]}
        onUpdate={onUpdate}
      />
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
        <CompactArrayFields label="Spell" values={monster.spells} length={10} onCommit={(spells) => onUpdate({ spells })} />
        <CompactArrayFields label="Money" values={monster.money} length={3} onCommit={(money) => onUpdate({ money })} />
        <CompactArrayFields label="Item" values={monster.items} length={6} onCommit={(items) => onUpdate({ items })} />
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

function TargetField({
  project,
  catalog,
  label,
  opcode,
  value,
  help,
  onCommit,
  onSelectEntity,
  onCreate
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  label: string;
  opcode: number;
  value: number;
  help?: string;
  onCommit: (value: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onCreate?: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const targetId = normalizedTargetValue(opcode, value);
  return (
    <div className="combat-target-field">
      <FieldLabel label={label} help={help} />
      {!editing ? (
        <div className="combat-target-summary">
          <strong>{combatTargetSummary(project, label, opcode, value)}</strong>
          <div>
            <button type="button" className="btn btn-primary btn-xs" onClick={() => setEditing(true)}>Choose</button>
            {targetId ? (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => onSelectEntity(selectEntityFromId(targetEntityId(opcode, targetId)))}>
                Open
              </button>
            ) : null}
            {onCreate && targetId ? (
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => onCreate(targetId)}>
                Create
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <TargetPicker
          project={project}
          catalog={catalog}
          opcode={opcode}
          value={value}
          onChange={(next) => {
            onCommit(next);
            setEditing(false);
          }}
          onInspect={onSelectEntity}
          onCreate={(_, id) => onCreate?.(id ?? targetId)}
        />
      )}
    </div>
  );
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
  compact = false,
  large = false
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  compact?: boolean;
  large?: boolean;
}) {
  const resolution = resolveMonsterIcon(monster, iconEntries, project, lookups);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    setFailedUrl(null);
    setLoadedUrl(null);
  }, [resolution.url]);
  const usableUrl = resolution.url && resolution.url !== failedUrl ? resolution.url : null;
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

const BattleMonsterOverlay = memo(function BattleMonsterOverlay({
  placement,
  iconEntries,
  project,
  lookups
}: {
  placement: BattleGridPlacementView;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
}) {
  const colSpan = Math.max(0.5, Math.min(placement.footprint.width, 13));
  const rowSpan = Math.max(0.5, Math.min(placement.footprint.height, 13));
  const leftCell = clamp(placement.col + 1 - colSpan, 0, 13 - colSpan);
  const topCell = clamp(placement.row + 1 - rowSpan, 0, 13 - rowSpan);
  return (
    <span
      className={`battle-monster-overlay${placement.alternateSide ? " alternate-side" : ""}`}
      style={{
        left: `${(leftCell / 13) * 100}%`,
        top: `${(topCell / 13) * 100}%`,
        width: `${(colSpan / 13) * 100}%`,
        height: `${(rowSpan / 13) * 100}%`
      }}
      aria-hidden="true"
    >
      {placement.monster ? (
        <MonsterIcon monster={placement.monster} iconEntries={iconEntries} project={project} lookups={lookups} />
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
  if (isActorOrCreatureIconId(iconId)) {
    const referenceUrl = browserReferenceIconUrl(iconId);
    if (referenceUrl) return { url: referenceUrl, label: `cicn ${monster.iconId}`, width: null, height: null };
  }
  return { url: null, label: `No icon preview for cicn ${monster.iconId}`, width: null, height: null };
}

function MonsterSelect({ lookups, value, onCommit }: { lookups: CombatLookups; value: number; onCommit: (value: number) => void }) {
  return (
    <label className="combat-field">
      <FieldLabel label="Selected Cell Monster" help="This writes the absolute monster ID for the selected battle cell. Use Force Friend to preserve Realmz's negative side-flip encoding." />
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty</option>
        {lookups.monsters.map((monster) => (
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

function ToggleButton({ active, label, disabled, help, onClick }: { active: boolean; label: string; disabled?: boolean; help?: string; onClick: () => void }) {
  return (
    <button type="button" className={`combat-toggle${active ? " active" : ""}`} disabled={disabled} title={help} onClick={onClick}>
      {label}
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
  catalog,
  iconEntries,
  lookups,
  previewContext,
  onOpenMash
}: {
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onOpenMash: () => void;
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
              <button className="btn btn-secondary btn-sm" type="button" title={TAB_HELP.mash} onClick={onOpenMash}>Open Monster Mash Icons</button>
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

function battleSummary(project: Project, battle: BattleRecord) {
  const placed = battle.grid.filter(Boolean).length;
  const before = messagePreview(project, battle.messageBefore);
  const after = messagePreview(project, battle.messageAfter);
  return `${placed} placed | before ${before} | after ${after}`;
}

function messagePreview(project: Project, id: number) {
  if (!id) return "none";
  const record = project.messages.find((message) => message.id === Math.abs(id));
  return record?.text ? `"${record.text.slice(0, 34)}${record.text.length > 34 ? "..." : ""}"` : `Message ${Math.abs(id)}`;
}

function combatTargetSummary(project: Project, label: string, opcode: number, value: number) {
  if (!value) return "None";
  if (opcode === 1) return messagePreview(project, value);
  if (opcode === 39) return `Extra Action Point ${Math.abs(value)}`;
  return `${label} ${Math.abs(value)}`;
}

function normalizedTargetValue(opcode: number, value: number) {
  if (!value) return 0;
  if (opcode === 1 || opcode === 9 || opcode === 39) return Math.abs(value);
  return value;
}

function targetEntityId(opcode: number, value: number) {
  if (opcode === 1) return `message:${value}`;
  if (opcode === 39) return `extra-code:${value}`;
  return `resource:${value}`;
}

function monsterFacts(monster: MonsterRecord) {
  return `ID ${monster.id}, HD ${monster.hitDice}, armor ${monster.armor}, agility ${monster.agility}, icon ${monster.iconId}`;
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
      width: Math.max(1, Math.min(4, Math.ceil(resolution.width / 32))),
      height: Math.max(1, Math.min(4, Math.ceil(resolution.height / 32)))
    };
  }
  const size = Number.isFinite(monster.size) ? monster.size : 1;
  if (size === 1) return { width: 1, height: 2 };
  if (size === 2) return { width: 2, height: 1 };
  if (size >= 3 || monster.typeFlags?.[6]) return { width: 2, height: 2 };
  return { width: 1, height: 1 };
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
  if (editor === "mash") return "mash";
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
        tabCounts: { battles: 0, monsters: 0, scrapbook: 0, mash: 0 }
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
    const mash = catalog?.entities.filter((entity) => entity.type === "monster-mash-icon").length ?? 0;
    return {
      monsters,
      monsterById,
      iconAssetsByAbsId,
      realmzActorIconAssetsByAbsId,
      monsterMashAssetsByAbsId,
      tabCounts: {
        battles: project.battles.length,
        monsters: project.monsters.length,
        scrapbook,
        mash
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
