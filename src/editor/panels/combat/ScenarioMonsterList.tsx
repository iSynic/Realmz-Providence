import { DragEvent, memo } from "react";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { IconEntry, MonsterRecord, MonsterSetId, Project } from "../../types";
import { ScrollArea, SearchField } from "../../ui";
import { MONSTER_SET_OPTIONS, type CombatLookups } from "./combatLookups";
import { MonsterIcon, samePreviewContextInputs, sameProjectIconInputs } from "./MonsterIconPreview";

export type ScenarioMonsterListEntry = {
  id: number;
  normal: MonsterRecord | null;
  monster: MonsterRecord | null;
  mega: MonsterRecord | null;
  active: MonsterRecord | null;
  fallback: MonsterRecord | null;
};

type ScenarioMonsterListProps = {
  entries: ScenarioMonsterListEntry[];
  query: string;
  activeSetId: MonsterSetId;
  selectedId: number | null;
  selectionActive: boolean;
  nextMonsterId: number;
  dropActive: boolean;
  iconEntries: Record<number, IconEntry>;
  project: Project;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  onQuery: (query: string) => void;
  onCreate: () => void;
  onSelect: (id: number) => void;
  onDragStart: (monster: MonsterRecord, event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
};

export function ScenarioMonsterList({
  entries,
  query,
  activeSetId,
  selectedId,
  selectionActive,
  nextMonsterId,
  dropActive,
  iconEntries,
  project,
  lookups,
  previewContext,
  onQuery,
  onCreate,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop
}: ScenarioMonsterListProps) {
  return (
    <aside
      className={`combat-record-list scenario-monster-list${dropActive ? " drop-active" : ""}`}
      aria-label="Scenario monster records"
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="monster-list-header">
        <div className="monster-list-heading-row">
          <strong className="combat-pane-title">Scenario Monsters</strong>
          <div className="monster-list-actions">
            <button type="button" className="btn btn-primary btn-xs" onClick={onCreate}>
              New Monster {nextMonsterId}
            </button>
          </div>
        </div>
      </header>
      <SearchField value={query} onChange={onQuery} placeholder="Search scenario monsters..."
        ariaLabel="Search scenario monsters" resultCount={entries.length} resultNoun="monster" />
      <ScrollArea shellClassName="combat-record-scroll-shell" className="combat-record-scroll" aria-label="Scenario monster results">
        {entries.map((entry) => (
          <ScenarioMonsterRow
            key={entry.id}
            entry={entry}
            activeSetId={activeSetId}
            selected={selectionActive && selectedId === entry.id}
            iconEntries={iconEntries}
            project={project}
            lookups={lookups}
            previewContext={previewContext}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
        {entries.length === 0 && <p className="empty-copy compact">No scenario monsters match that search.</p>}
      </ScrollArea>
    </aside>
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

function MonsterSetBadges({
  entry,
  activeSetId
}: {
  entry: Pick<ScenarioMonsterListEntry, "normal" | "monster" | "mega">;
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

function monsterFacts(monster: MonsterRecord) {
  return `ID ${monster.id}, HD ${monster.hitDice}, armor ${monster.armor}, agility ${monster.agility}, icon ${monster.iconId}`;
}
