import { memo, ReactNode, useEffect, useMemo, useState } from "react";
import { TargetPicker } from "../components/RealmzTargetPicker";
import { monsterReferenceDetail } from "../monsterReferences";
import { LibraryCatalog, BattleRecord, IconEntry, MonsterRecord, Project, ProjectCommand, SelectedEntity } from "../types";
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

type CombatPanelProps = {
  activeEditor?: string;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor: (editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
};

const TAB_LABELS: Record<CombatWorkbenchTab, string> = {
  battles: "Battles",
  monsters: "Monsters",
  scrapbook: "Monster Scrapbook",
  mash: "Monster Mash"
};

export function CombatPanel({
  activeEditor = "domain",
  project,
  catalog,
  selectedEntity,
  iconEntries,
  onSelectEntity,
  onSelectEditor,
  onApplyCommand
}: CombatPanelProps) {
  const [tab, setTab] = useState<CombatWorkbenchTab>(() => tabFromEditor(activeEditor));
  useEffect(() => setTab(tabFromEditor(activeEditor)), [activeEditor]);
  const selectTab = (next: CombatWorkbenchTab) => {
    setTab(next);
    onSelectEditor(next === "battles" ? "battles" : next === "monsters" ? "monsters" : next);
  };

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
          <h1>Combat</h1>
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
          >
            <span>{TAB_LABELS[candidate]}</span>
            <b>{tabCount(project, catalog, candidate).toLocaleString()}</b>
          </button>
        ))}
      </div>

      {tab === "battles" && (
        <BattleWorkbench
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          iconEntries={iconEntries}
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
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
        />
      )}
      {tab === "scrapbook" && (
        <ReferenceOnlyCombatTab
          title="Monster Scrapbook"
          body="Shared monster reference entries are preserved as library material. Editing custom monster records happens in the Monsters tab."
          count={catalog?.entities.filter((entity) => entity.type === "monster-scrapbook-entry").length ?? 0}
        />
      )}
      {tab === "mash" && (
        <ReferenceOnlyCombatTab
          title="Monster Mash"
          body="Shared Monster Mash icons are available as reference art for monster records. Scenario-specific icon replacement belongs in Assets."
          count={catalog?.entities.filter((entity) => entity.type === "monster-mash-icon").length ?? 0}
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
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
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
          onCommit={(battleMacro) => onUpdate({ battleMacro })}
          onSelectEntity={onSelectEntity}
        />
      </section>
      <BattleBoard
        project={project}
        catalog={catalog}
        iconEntries={iconEntries}
        battle={battle}
        onUpdateGrid={(grid) => onUpdate({ grid })}
      />
    </article>
  );
}

function BattleBoard({
  project,
  catalog,
  iconEntries,
  battle,
  onUpdateGrid
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  iconEntries: Record<number, IconEntry>;
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
  const selectedMonster = selectedCell?.monsterId ? project.monsters.find((monster) => monster.id === selectedCell.monsterId) ?? null : null;
  const placementMonster = brush.monsterId ? project.monsters.find((monster) => monster.id === brush.monsterId) ?? null : null;
  const placements = useMemo<BattleGridPlacementView[]>(
    () =>
      cells
        .filter((cell) => cell.monsterId)
        .map((cell) => {
          const monster = project.monsters.find((candidate) => candidate.id === cell.monsterId) ?? null;
          const col = cell.index % 13;
          const row = Math.floor(cell.index / 13);
          return {
            ...cell,
            monster,
            col,
            row,
            footprint: monster ? monsterBattleFootprint(monster, iconEntries, project) : { width: 1, height: 1 }
          };
        }),
    [cells, iconEntries, project]
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
            <strong>Battle Grid</strong>
            <small>13 x 13 monster placement board</small>
          </div>
          <b>{battle.grid.filter(Boolean).length} placed</b>
        </header>
        <div className="battle-board" role="grid" aria-label="Battle monster grid">
          {cells.map((cell) => {
            const monster = cell.monsterId ? project.monsters.find((candidate) => candidate.id === cell.monsterId) ?? null : null;
            return (
              <button
                key={cell.index}
                type="button"
                role="gridcell"
                className={`${cell.index === selectedIndex ? "selected" : ""}${cell.value ? " filled" : ""}${cell.alternateSide ? " alternate-side" : ""}`}
                title={cell.value ? monsterReferenceDetail(project, cell.value, catalog) : `Empty cell ${cell.index % 13},${Math.floor(cell.index / 13)}`}
                onClick={() => place(cell.index)}
                aria-label={cell.value ? monsterReferenceDetail(project, cell.value, catalog) : `Empty cell ${cell.index % 13},${Math.floor(cell.index / 13)}`}
              />
            );
          })}
          {placements.map((placement) => (
            <BattleMonsterOverlay
              key={`${placement.index}:${placement.value}`}
              placement={placement}
              iconEntries={iconEntries}
              project={project}
            />
          ))}
        </div>
      </div>
      <aside className="monster-placement-card">
        <MonsterPalette
          project={project}
          iconEntries={iconEntries}
          selectedId={brush.monsterId}
          onSelect={(monsterId) => setBrush((current) => ({ ...current, monsterId, erase: false }))}
        />
        <div className="placement-controls">
          <ToggleButton active={brush.erase} label="Erase" onClick={() => setBrush((current) => ({ ...current, erase: !current.erase }))} />
          <ToggleButton active={brush.forceFriend} label="Force Friend" disabled={brush.erase || !brush.monsterId} onClick={() => setBrush((current) => ({ ...current, forceFriend: !current.forceFriend }))} />
        </div>
        <div className="selected-battle-cell">
          <strong>Selected Cell {selectedIndex % 13}, {Math.floor(selectedIndex / 13)}</strong>
          <small>{selectedCell?.value ? monsterReferenceDetail(project, selectedCell.value, catalog) : "Empty cell"}</small>
          <MonsterSelect project={project} value={selectedCell?.monsterId ?? 0} onCommit={(monsterId) => updateSelected(monsterId)} />
          <div className="placement-controls">
            <ToggleButton active={(selectedCell?.value ?? 0) < 0} label="Force Friend" disabled={!selectedCell?.monsterId} onClick={() => selectedCell && updateSelected(selectedCell.value < 0 ? selectedCell.monsterId : -selectedCell.monsterId)} />
            <button type="button" className="btn btn-secondary btn-xs" onClick={() => updateSelected(0)}>Clear Cell</button>
          </div>
          {selectedMonster && (
            <div className="selected-monster-preview">
              <MonsterIcon monster={selectedMonster} iconEntries={iconEntries} project={project} />
              <span>{monsterFacts(selectedMonster)}</span>
            </div>
          )}
          {!selectedMonster && placementMonster && (
            <div className="selected-monster-preview">
              <MonsterIcon monster={placementMonster} iconEntries={iconEntries} project={project} />
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
  selectedId,
  onSelect
}: {
  project: Project;
  iconEntries: Record<number, IconEntry>;
  selectedId: number;
  onSelect: (monsterId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const monsters = useMemo(() => [...(project.monsters ?? [])].sort((a, b) => a.id - b.id), [project.monsters]);
  const filtered = filterRecords(monsters, query, (monster) => `${monster.id} ${monster.displayName} icon ${monster.iconId}`);
  const selectedMonster = selectedId ? project.monsters.find((monster) => monster.id === selectedId) ?? null : null;
  return (
    <div className="monster-palette">
      <header>
        <strong>Monster To Place</strong>
        <small>{selectedId ? `Monster ${selectedId}` : "Choose a monster"}</small>
      </header>
      {selectedMonster && (
        <div className="monster-to-place-preview">
          <MonsterIcon monster={selectedMonster} iconEntries={iconEntries} project={project} large />
          <span>
            <strong>{selectedMonster.displayName || `Monster ${selectedMonster.id}`}</strong>
            <small>{monsterFacts(selectedMonster)}</small>
            <small>{monsterBattleFootprintLabel(selectedMonster, iconEntries, project)}</small>
          </span>
        </div>
      )}
      <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search monsters..." />
      <div className="monster-palette-list">
        {filtered.slice(0, 80).map((monster) => (
          <button
            key={monster.id}
            type="button"
            className={selectedId === monster.id ? "selected" : ""}
            onClick={() => onSelect(monster.id)}
          >
            <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} compact />
            <span>
              <strong>{monster.displayName || `Monster ${monster.id}`}</strong>
              <small>{monsterFacts(monster)}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonsterWorkbench({
  project,
  catalog: _catalog,
  selectedEntity,
  iconEntries,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [query, setQuery] = useState("");
  const monsters = useMemo(() => [...(project.monsters ?? [])].sort((a, b) => a.id - b.id), [project.monsters]);
  const selectedFromEntity = idFromEntity(selectedEntity?.id ?? "", "monster:");
  const selectedId = selectedFromEntity ?? monsters[0]?.id ?? 0;
  const selected = monsters.find((monster) => monster.id === selectedId) ?? monsters[0] ?? null;
  const filtered = filterRecords(monsters, query, (monster) => `${monster.id} ${monster.displayName} icon ${monster.iconId} hd ${monster.hitDice}`);
  const nextMonsterId = nextAvailableId(monsters);
  const selectMonster = (id: number) => onSelectEntity(selectEntityFromId(`monster:${id}`));
  const update = (id: number, changes: Partial<MonsterRecord>) => onApplyCommand?.({ kind: "updateMonsterRecord", label: "Update monster", id, changes });

  return (
    <div className="combat-record-layout monster-layout">
      <RecordList
        title="Monster Records"
        query={query}
        onQuery={setQuery}
        count={filtered.length}
        total={monsters.length}
        newLabel={`New Monster ${nextMonsterId}`}
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
            <strong>{monster.displayName || `Monster ${monster.id}`}</strong>
            <small>{monsterFacts(monster)}</small>
          </button>
        ))}
      </RecordList>
      {selected ? (
        <MonsterEditor
          project={project}
          monster={selected}
          iconEntries={iconEntries}
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
  onUpdate,
  onDuplicate,
  onClear
}: {
  project: Project;
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
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
        <MonsterIcon monster={monster} iconEntries={iconEntries} project={project} large />
        <div className="monster-field-grid">
          <TextField label="Monster Name" value={monster.displayName} onCommit={(displayName) => onUpdate({ displayName })} />
          <NumberField label="Name ID" value={monster.nameId} onCommit={(nameId) => onUpdate({ nameId })} />
          <NumberField label="Icon" value={monster.iconId} onCommit={(iconId) => onUpdate({ iconId })} />
          <label className="combat-check-field">
            <span>Hide From Bestiary</span>
            <input type="checkbox" checked={monster.notOnMenu} onChange={(event) => onUpdate({ notOnMenu: event.currentTarget.checked })} />
          </label>
          <NumberField label="Defeat Action" value={monster.deathMacro} onCommit={(deathMacro) => onUpdate({ deathMacro })} />
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
  onCommit,
  onSelectEntity,
  onCreate
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  label: string;
  opcode: number;
  value: number;
  onCommit: (value: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onCreate?: (id: number) => void;
}) {
  return (
    <div className="combat-target-field">
      <span>{label}</span>
      <TargetPicker
        project={project}
        catalog={catalog}
        opcode={opcode}
        value={value}
        onChange={onCommit}
        onInspect={onSelectEntity}
        onCreate={(_, id) => onCreate?.(id ?? Math.abs(value))}
      />
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
  onNew,
  children
}: {
  title: string;
  query: string;
  onQuery: (value: string) => void;
  count: number;
  total: number;
  newLabel: string;
  onNew: () => void;
  children: ReactNode;
}) {
  return (
    <aside className="combat-record-list">
      <header>
        <div>
          <strong>{title}</strong>
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
  compact = false,
  large = false
}: {
  monster: MonsterRecord;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  compact?: boolean;
  large?: boolean;
}) {
  const resolution = resolveMonsterIcon(monster, iconEntries, project);
  return (
    <span className={`monster-icon-preview${compact ? " compact" : ""}${large ? " large" : ""}`} title={resolution.label}>
      {resolution.url ? <img src={resolution.url} alt="" loading="lazy" decoding="async" /> : <b>{monster.id}</b>}
    </span>
  );
});

const BattleMonsterOverlay = memo(function BattleMonsterOverlay({
  placement,
  iconEntries,
  project
}: {
  placement: BattleGridPlacementView;
  iconEntries: Record<number, IconEntry>;
  project: Project;
}) {
  const colSpan = Math.max(0.5, Math.min(placement.footprint.width, 13));
  const rowSpan = Math.max(0.5, Math.min(placement.footprint.height, 13));
  const leftCell = clamp(placement.col - (colSpan - 1) / 2, 0, 13 - colSpan);
  const topCell = clamp(placement.row - (rowSpan - 1) / 2, 0, 13 - rowSpan);
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
        <MonsterIcon monster={placement.monster} iconEntries={iconEntries} project={project} />
      ) : (
        <b>{placement.monsterId}</b>
      )}
    </span>
  );
});

function resolveMonsterIcon(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project): MonsterIconResolution {
  const iconId = Math.abs(monster.iconId);
  const entry = iconEntries[monster.iconId] ?? iconEntries[-iconId];
  if (entry?.url) {
    return {
      url: entry.url,
      label: `cicn ${monster.iconId}`,
      width: entry.image.naturalWidth || entry.image.width || null,
      height: entry.image.naturalHeight || entry.image.height || null
    };
  }
  const asset = project.assetCatalog.icons?.find((candidate) => Math.abs(candidate.resourceId) === iconId && candidate.previewPath) ?? null;
  if (asset?.previewPath) return { url: asset.previewPath, label: `cicn ${monster.iconId}`, width: null, height: null };
  return { url: null, label: `No icon preview for cicn ${monster.iconId}`, width: null, height: null };
}

function MonsterSelect({ project, value, onCommit }: { project: Project; value: number; onCommit: (value: number) => void }) {
  return (
    <label className="combat-field">
      <span>Selected Cell Monster</span>
      <select value={value} onChange={(event) => onCommit(Number(event.currentTarget.value))}>
        <option value={0}>Empty</option>
        {project.monsters.map((monster) => (
          <option key={monster.id} value={monster.id}>{monster.displayName || `Monster ${monster.id}`} ({monster.id})</option>
        ))}
      </select>
    </label>
  );
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="combat-field">
      <span>{label}</span>
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

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <label className="combat-field">
      <span>{label}</span>
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

function ToggleButton({ active, label, disabled, onClick }: { active: boolean; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`combat-toggle${active ? " active" : ""}`} disabled={disabled} onClick={onClick}>
      {label}
    </button>
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

function ReferenceOnlyCombatTab({ title, body, count }: { title: string; body: string; count: number }) {
  return (
    <article className="combat-reference-tab">
      <header>
        <div>
          <span>{title}</span>
          <small>{count.toLocaleString()} reference entr{count === 1 ? "y" : "ies"}</small>
        </div>
      </header>
      <p>{body}</p>
    </article>
  );
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

function monsterFacts(monster: MonsterRecord) {
  return `ID ${monster.id}, HD ${monster.hitDice}, armor ${monster.armor}, agility ${monster.agility}, icon ${monster.iconId}`;
}

function monsterBattleFootprint(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project) {
  const resolution = resolveMonsterIcon(monster, iconEntries, project);
  if (resolution.width && resolution.height) {
    return {
      width: Math.max(0.5, Math.min(4, resolution.width / 32)),
      height: Math.max(0.5, Math.min(4, resolution.height / 32))
    };
  }
  const size = Number.isFinite(monster.size) ? monster.size : 1;
  const sizeFootprint = size <= 1 ? 0.95 : size === 2 ? 1.35 : 1.75;
  const giantFootprint = monster.typeFlags?.[6] ? 1.9 : 0.95;
  const fallback = Math.max(0.95, Math.min(2.15, Math.max(sizeFootprint, giantFootprint)));
  return { width: fallback, height: fallback };
}

function monsterBattleFootprintLabel(monster: MonsterRecord, iconEntries: Record<number, IconEntry>, project: Project) {
  const footprint = monsterBattleFootprint(monster, iconEntries, project);
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

function tabCount(project: Project, catalog: LibraryCatalog | null, tab: CombatWorkbenchTab) {
  if (tab === "battles") return project.battles.length;
  if (tab === "monsters") return project.monsters.length;
  if (tab === "scrapbook") return catalog?.entities.filter((entity) => entity.type === "monster-scrapbook-entry").length ?? 0;
  return catalog?.entities.filter((entity) => entity.type === "monster-mash-icon").length ?? 0;
}

function updateArraySlot(values: number[] = [], index: number, value: number, length: number) {
  const next = [...values];
  while (next.length < length) next.push(0);
  next[index] = value;
  return next.slice(0, length);
}
