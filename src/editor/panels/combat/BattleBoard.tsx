import { memo, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brush, Eraser, MousePointer2 } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import { resolvePreviewUrl, type PreviewRuntimeContext } from "../../previewUrls";
import type { BattleRecord, IconEntry, LibraryAsset, MonsterRecord, MonsterSetId, Project, ProjectCommand } from "../../types";
import { BATTLE_RUNTIME_MONSTER_LIMIT, countBattleRuntimeMonsterSlots } from "../../battleReferences";
import { authorFacingMonsterRecordsForSet } from "../../monsterRecords";
import { MONSTER_SET_OPTIONS, type CombatLookups } from "./combatLookups";
import { measureCombatWork, recordCombatPerf, useCombatRenderTiming } from "./performance";
import { BattleScenarioMonsterSetField } from "./BattleWorkbench";
import { BattleBoardCanvas, battleMonsterIconLookupKey } from "./BattleBoardCanvas";
import { FieldLabel, ToggleButton } from "./CombatFields";
import {
  MonsterIcon,
  MonsterIconDisplay,
  resolveMonsterIcon,
  samePreviewContextInputs,
  sameProjectIconInputs,
  type ResolvedBattleMonsterIcon
} from "./MonsterIconPreview";
import {
  BATTLE_GRID_CELL_COUNT,
  BATTLE_GRID_SIZE,
  battleGridCells,
  battleGridChanges,
  battleGridStorageIndexFromDisplayCoords,
  normalizeBattleGridForEditor,
  topVisiblePlacementAtDisplayCell,
  type BattleGridCellView,
  type BattleGridPaintPreview,
  type BattleGridPlacementView
} from "./battleGridModel";

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

type BattleMonsterPaintEntry = { kind: "scenario"; key: string; id: number; monster: MonsterRecord };

const BATTLE_GRID_HELP = "Each grid cell stores a signed monster ID. Zero is empty, abs(value) points at a Data MD monster, and a negative value forces the friendly/alternate side after Realmz loads it. Large, tall, and wide monsters use their lower-right grid square as the anchor cell for placement; erase mode clears the top visible monster on the clicked tile.";
const MONSTER_PLACEMENT_HELP = "Choose a scenario monster or library template for the placement brush. Library templates are copied into Scenario Monsters before Providence writes the battle grid, because Data BD stores scenario monster IDs. Erase clears the top visible monster on the clicked tile; Force Friends writes the negative grid value Realmz uses for side flipping.";
const BATTLE_SUMMON_SPACE_WARNING_LIMIT = 75;
export const MAX_DIVINITY_BATTLE_MONSTER_ID = 217;
const MONSTER_GRID_ART_SIZE = 32;
const MONSTER_PALETTE_TILE_SPAN = 2;
const MONSTER_PALETTE_TILE_SIZE = MONSTER_GRID_ART_SIZE * MONSTER_PALETTE_TILE_SPAN;
const MONSTER_BRUSH_TILE_SIZE = 72;
const MONSTER_BRUSH_TILE_GAP = 8;
const MONSTER_BRUSH_TILE_STRIDE = MONSTER_BRUSH_TILE_SIZE + MONSTER_BRUSH_TILE_GAP;
const MONSTER_BRUSH_WINDOW_OVERSCAN_ROWS = 2;


export function BattleBoard({
  project,
  iconEntries,
  lookups,
  previewContext,
  monsterSetPreview,
  onMonsterSetPreviewChange,
  battle,
  canCopyMissingMonster,
  onCopyMissingMonster,
  onApplyCommand,
  onUpdateGrid
}: {
  project: Project;
  iconEntries: Record<number, IconEntry>;
  lookups: CombatLookups;
  previewContext: PreviewRuntimeContext;
  monsterSetPreview: MonsterSetId;
  onMonsterSetPreviewChange: (value: MonsterSetId) => void;
  battle: BattleRecord;
  canCopyMissingMonster: (monsterId: number) => boolean;
  onCopyMissingMonster: (monsterId: number) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateGrid: (grid: number[]) => void;
}) {
  useCombatRenderTiming("BattleBoard");
  const activeMonsters = useMemo(
    () => authorFacingMonsterRecordsForSet(project, monsterSetPreview),
    [monsterSetPreview, project.battles, project.monsters, project.monsterSets]
  );
  const activeMonsterById = useMemo(
    () => new Map(activeMonsters.map((monster) => [monster.id, monster])),
    [activeMonsters]
  );
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
    () => measureCombatWork("BattleBoard cells", () => battleGridCells(draftGrid)),
    [draftGrid]
  );
  const selectedCell = cells.find((cell) => cell.index === selectedIndex) ?? cells[0];
  const selectedMonster = selectedCell?.monsterId ? activeMonsterById.get(selectedCell.monsterId) ?? null : null;
  const selectedNormalMonster = selectedCell?.monsterId ? lookups.monsterById.get(selectedCell.monsterId) ?? null : null;
  const canCopySelectedMissingMonster = Boolean(selectedCell?.monsterId && !selectedNormalMonster && canCopyMissingMonster(selectedCell.monsterId));
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
                  {canCopySelectedMissingMonster ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      onClick={() => onCopyMissingMonster(selectedCell.monsterId)}
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

const battleMonsterIconUrlCache = new Map<string, Promise<ResolvedBattleMonsterIcon>>();
const battleMonsterResolvedIconUrlCache = new Map<string, ResolvedBattleMonsterIcon>();
const battleMonsterFootprintCache = new Map<string, { width: number; height: number }>();
const battleMonsterPaletteMetricCache = new Map<string, { artSize: { width: number; height: number }; footprintLabel: string }>();
const battleIconSourceKeyTokens = new Map<string, string>();
let battleIconSourceKeyTokenSequence = 0;

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
  const syncCachedIcons = useMemo(() => {
    const cachedIcons: Record<string, ResolvedBattleMonsterIcon> = {};
    for (const monster of uniqueBattleMonsterIconMonsters(monsters)) {
      const cached = battleMonsterResolvedIconUrlCache.get(battleMonsterIconCacheKey(sourceKey, monster));
      if (cached) cachedIcons[battleMonsterIconLookupKey(monster)] = cached;
    }
    return cachedIcons;
  }, [monsterKey, sourceKey]);
  const [resolvedState, setResolvedState] = useState<{ sourceKey: string; icons: Record<string, ResolvedBattleMonsterIcon> }>({ sourceKey: "", icons: {} });
  useEffect(() => {
    let disposed = false;
    const uniqueMonsters = uniqueBattleMonsterIconMonsters(monsters);
    if (uniqueMonsters.length === 0) {
      setResolvedState({ sourceKey, icons: {} });
      return () => {
        disposed = true;
      };
    }
    const cachedIcons: Record<string, ResolvedBattleMonsterIcon> = {};
    const missingMonsters: MonsterRecord[] = [];
    for (const monster of uniqueMonsters) {
      const cached = battleMonsterResolvedIconUrlCache.get(battleMonsterIconCacheKey(sourceKey, monster));
      if (cached) {
        cachedIcons[battleMonsterIconLookupKey(monster)] = cached;
      } else {
        missingMonsters.push(monster);
      }
    }
    setResolvedState({ sourceKey, icons: cachedIcons });
    if (missingMonsters.length === 0) {
      return () => {
        disposed = true;
      };
    }
    const started = performance.now();
    Promise.all(missingMonsters.map((monster) => resolveCachedBattleMonsterIcon(monster, iconEntries, project, lookups, previewContext, sourceKey)))
      .then((resolved) => {
        if (disposed) return;
        setResolvedState((current) => {
          if (current.sourceKey !== sourceKey) return current;
          return { sourceKey, icons: { ...current.icons, ...Object.fromEntries(resolved.map((icon) => [icon.cacheKey, icon])) } };
        });
        recordCombatPerf("battleIconUrlResolve", performance.now() - started);
      })
      .catch(() => {
        if (!disposed) setResolvedState((current) => current.sourceKey === sourceKey ? { sourceKey, icons: cachedIcons } : current);
      });
    return () => {
      disposed = true;
    };
  }, [monsterKey, sourceKey]);
  const resolvedIcons = resolvedState.sourceKey === sourceKey ? resolvedState.icons : {};
  return useMemo(() => ({ ...resolvedIcons, ...syncCachedIcons }), [resolvedIcons, syncCachedIcons]);
}

function uniqueBattleMonsterIconMonsters(monsters: MonsterRecord[]) {
  const byKey = new Map<string, MonsterRecord>();
  for (const monster of monsters) byKey.set(battleMonsterIconLookupKey(monster), monster);
  return [...byKey.values()];
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
  return compactBattleIconSourceKey([
    previewContext.desktopRuntime ? "desktop" : "browser",
    previewContext.projectDir ?? "",
    previewContext.workspaceDir ?? "",
    project.scenario.name,
    project.source.sourcePath,
    iconEntryKey,
    projectIconKey
  ].join("\n"));
}

function compactBattleIconSourceKey(sourceKey: string) {
  const cached = battleIconSourceKeyTokens.get(sourceKey);
  if (cached) return cached;
  const next = `battle-icons:${++battleIconSourceKeyTokenSequence}`;
  battleIconSourceKeyTokens.set(sourceKey, next);
  return next;
}

function resolveCachedBattleMonsterIcon(
  monster: MonsterRecord,
  iconEntries: Record<number, IconEntry>,
  project: Project,
  lookups: CombatLookups,
  previewContext: PreviewRuntimeContext,
  sourceKey: string
) {
  const cacheKey = battleMonsterIconCacheKey(sourceKey, monster);
  const resolved = battleMonsterResolvedIconUrlCache.get(cacheKey);
  if (resolved) return Promise.resolve(resolved);
  const cached = battleMonsterIconUrlCache.get(cacheKey);
  if (cached) return cached;
  const request = resolveBattleMonsterIcon(monster, iconEntries, project, lookups, previewContext).then((icon) => {
    battleMonsterResolvedIconUrlCache.set(cacheKey, icon);
    return icon;
  });
  battleMonsterIconUrlCache.set(cacheKey, request);
  return request;
}

function battleMonsterIconCacheKey(sourceKey: string, monster: MonsterRecord) {
  return `${sourceKey}\n${battleMonsterIconLookupKey(monster)}`;
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
  const hasReservedMonsterZero = activeMonsters.some((monster) => monster.id === 0);
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
          <small>{entries.length} placeable{hasReservedMonsterZero ? " | Monster 0 reserved" : ""}</small>
        </div>
        <BattleScenarioMonsterSetField value={monsterSetPreview} onCommit={onMonsterSetPreviewChange} compact />
      </header>
      <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search monsters..." />
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



function battleMonsterPaintEntrySearchText(entry: BattleMonsterPaintEntry) {
  return `${entry.id} ${entry.monster.displayName} icon ${entry.monster.iconId} hd ${entry.monster.hitDice} scenario`;
}

function filterRecords<T>(records: T[], query: string, text: (record: T) => string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => text(record).toLowerCase().includes(needle));
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

export function monsterBrushPaletteWindow(total: number, width: number, height: number, scrollTop: number) {
  if (total <= 0) return { startIndex: 0, endIndex: 0, topSpacer: 0, bottomSpacer: 0 };
  if (width <= 0 || height <= 0) return { startIndex: 0, endIndex: total, topSpacer: 0, bottomSpacer: 0 };
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
