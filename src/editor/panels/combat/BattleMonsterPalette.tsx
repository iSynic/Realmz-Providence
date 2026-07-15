import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TutorialTip } from "../../components/TutorialTip";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { IconEntry, MonsterRecord, MonsterSetId, Project } from "../../types";
import { SearchField } from "../../ui";
import { battleMonsterIconLookupKey } from "./BattleBoardCanvas";
import { BattleScenarioMonsterSetField } from "./BattleWorkbench";
import type { CombatLookups } from "./combatLookups";
import {
  MonsterIconDisplay,
  samePreviewContextInputs,
  sameProjectIconInputs,
  type ResolvedBattleMonsterIcon
} from "./MonsterIconPreview";
import {
  monsterPaletteMetricsCached,
  useBattleIconSourceKey,
  useResolvedBattleMonsterIcons
} from "./battleMonsterIcons";
import {
  MAX_DIVINITY_BATTLE_MONSTER_ID,
  battleMonsterPaintEntries,
  battleMonsterPaintEntrySearchText,
  monsterBrushPaletteWindow,
  monsterFacts,
  monsterSetFile,
  monsterSetLabel,
  type BattleMonsterPaintEntry
} from "./battleMonsterPaletteModel";
import { useCombatRenderTiming } from "./performance";

const MONSTER_PLACEMENT_HELP = "Choose a scenario monster or library template for the placement brush. Library templates are copied into Scenario Monsters before Providence writes the battle grid, because Data BD stores scenario monster IDs. Erase clears the top visible monster on the clicked tile; Force Friends writes the negative grid value Realmz uses for side flipping.";

export function BattleMonsterPalette({
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
  const pendingPaletteViewportRef = useRef(paletteViewport);
  const paletteViewportFrameRef = useRef<number | null>(null);
  const schedulePaletteViewportUpdate = useCallback((element: HTMLDivElement) => {
    const next = {
      width: element.clientWidth,
      height: element.clientHeight,
      scrollTop: element.scrollTop
    };
    pendingPaletteViewportRef.current = next;
    if (paletteViewportFrameRef.current != null) return;
    paletteViewportFrameRef.current = window.requestAnimationFrame(() => {
      paletteViewportFrameRef.current = null;
      const pending = pendingPaletteViewportRef.current;
      setPaletteViewport((current) =>
        current.width === pending.width && current.height === pending.height && current.scrollTop === pending.scrollTop
          ? current
          : pending
      );
    });
  }, []);
  useEffect(() => {
    return () => {
      if (paletteViewportFrameRef.current != null) window.cancelAnimationFrame(paletteViewportFrameRef.current);
    };
  }, []);
  const entries = useMemo<BattleMonsterPaintEntry[]>(
    () => battleMonsterPaintEntries(activeMonsters),
    [activeMonsters]
  );
  const filtered = useMemo(
    () => filterRecords(entries, query, battleMonsterPaintEntrySearchText),
    [entries, query]
  );
  useEffect(() => {
    const element = paletteRef.current;
    if (!element) return;
    const update = () => schedulePaletteViewportUpdate(element);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [schedulePaletteViewportUpdate]);
  useEffect(() => {
    const element = paletteRef.current;
    if (element) element.scrollTop = 0;
    setPaletteViewport((current) => ({ ...current, scrollTop: 0 }));
  }, [monsterSetPreview, query]);
  const paletteWindow = useMemo(
    () => monsterBrushPaletteWindow(filtered.length, paletteViewport.width, paletteViewport.height, paletteViewport.scrollTop),
    [filtered.length, paletteViewport.height, paletteViewport.scrollTop, paletteViewport.width]
  );
  const visibleEntries = useMemo(() => filtered.slice(paletteWindow.startIndex, paletteWindow.endIndex), [filtered, paletteWindow.endIndex, paletteWindow.startIndex]);
  const battleIconSourceKey = useBattleIconSourceKey(project, iconEntries, lookups, previewContext);
  const visibleIconUrls = useResolvedBattleMonsterIcons(
    visibleEntries.map((entry) => entry.monster),
    iconEntries,
    project,
    lookups,
    previewContext,
    battleIconSourceKey
  );
  const hasReservedMonsterZero = activeMonsters.some((monster) => monster.id === 0);
  const hasScenarioMonsters = activeMonsters.some((monster) => monster.id > 0);
  const hasOnlyUnplaceableMonsterZero = activeMonsters.length > 0 && !hasScenarioMonsters;
  const hasOnlyOutOfRangeMonsters = hasScenarioMonsters && entries.length === 0;
  return (
    <div className="monster-palette">
      <header>
        <div>
          <TutorialTip title="Monster Placement Brush" body={MONSTER_PLACEMENT_HELP} side="right">
            <strong>Monster Palette</strong>
          </TutorialTip>
          <small>{entries.length} placeable{hasReservedMonsterZero ? " | Monster 0 reserved" : ""}</small>
        </div>
        <BattleScenarioMonsterSetField value={monsterSetPreview} onCommit={onMonsterSetPreviewChange} compact />
      </header>
      <SearchField value={query} onChange={setQuery} placeholder="Search monsters..." ariaLabel="Search paintable monsters"
        resultCount={filtered.length} resultNoun="monster" />
      <div
        ref={paletteRef}
        className="monster-brush-palette"
        aria-label="Paintable monsters"
        onScroll={(event) => schedulePaletteViewportUpdate(event.currentTarget)}
      >
        {entries.length === 0 && !hasOnlyUnplaceableMonsterZero && !hasOnlyOutOfRangeMonsters && (
          <p className="empty-copy compact">No {monsterSetLabel(monsterSetPreview)} scenario monsters are available for battle placement. Copy from Monster Library into Scenario Monsters first.</p>
        )}
        {hasOnlyUnplaceableMonsterZero && (
          <p className="empty-copy compact">Monster 0 exists in {monsterSetFile(monsterSetPreview)}, but Data BD uses 0 for empty battle cells. Create or copy a monster into slot 1 or higher before placing battle monsters.</p>
        )}
        {hasReservedMonsterZero && !hasOnlyUnplaceableMonsterZero && (
          <p className="combat-list-overflow-note">Monster 0 is reserved because Data BD uses 0 for empty battle cells.</p>
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
    <TutorialTip title={`${name} (${entry.id})`} body={`${facts}. ${metrics.footprintLabel}. Scenario monster.`} side="right">
      <button
        type="button"
        className={`monster-brush${selected ? " selected" : ""}`}
        data-monster-brush-id={entry.id}
        onClick={() => onSelect(entry)}
      >
        <span
          className="monster-brush-icon"
          style={{ width: artSize.width, height: artSize.height, maxWidth: "100%", maxHeight: "100%" }}
        >
          {resolvedIcon ? (
            <MonsterIconDisplay
              resolution={resolvedIcon}
              primaryUrl={resolvedIcon.resolvedUrl}
              fallbackText={String(monster.id)}
              compact={false}
              large={false}
            />
          ) : (
            <span
              className="monster-icon-preview"
              title="Loading monster icon"
              data-combat-preview="monster-icon"
              data-combat-preview-ready="false"
            >
              <b>{monster.id}</b>
            </span>
          )}
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

function filterRecords<T>(records: T[], query: string, text: (record: T) => string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => text(record).toLowerCase().includes(needle));
}
