import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Brush, Eraser, MousePointer2 } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type { BattleRecord, IconEntry, MonsterRecord, MonsterSetId, Project, ProjectCommand } from "../../types";
import { BATTLE_RUNTIME_MONSTER_LIMIT, countBattleRuntimeMonsterSlots } from "../../battleReferences";
import { authorFacingMonsterRecordsForSet } from "../../monsterRecords";
import type { CombatLookups } from "./combatLookups";
import { measureCombatWork, useCombatRenderTiming } from "./performance";
import { BattleBoardCanvas } from "./BattleBoardCanvas";
import { ToggleButton } from "./CombatFields";
import { BattleMonsterDetail, BattleMonsterSelect } from "./BattleMonsterReferenceField";
import { BattleMonsterPalette } from "./BattleMonsterPalette";
import {
  monsterBattleFootprintCached,
  useBattleIconSourceKey,
  useResolvedBattleMonsterIcons
} from "./battleMonsterIcons";
import {
  monsterPlacementLabel,
  monsterPlacementTitle,
  monsterSetFile,
  monsterSetLabel
} from "./battleMonsterPaletteModel";
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

const BATTLE_GRID_HELP = "Each grid cell stores a signed monster ID. Zero is empty, abs(value) points at a Data MD monster, and a negative value forces the friendly/alternate side after Realmz loads it. Large, tall, and wide monsters use their lower-right grid square as the anchor cell for placement; erase mode clears the top visible monster on the clicked tile.";
const BATTLE_SUMMON_SPACE_WARNING_LIMIT = 75;


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
    [monsterSetPreview, project.monsters, project.monsterSets]
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
        <BattleMonsterPalette
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
                <BattleMonsterDetail
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
              <BattleMonsterSelect
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
              <BattleMonsterDetail
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



function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
