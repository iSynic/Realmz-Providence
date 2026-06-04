import { KeyboardEvent, MouseEvent, PointerEvent, RefObject, useEffect, useRef, useState } from "react";
import {
  EditorTool,
  MapEntity,
  MapHitTarget,
  MapPaintMode,
  MapPaintVariation,
  MapRegionSelection,
  PaintCellChange,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  SemanticEntity,
  TilesetAsset,
  TriggerRecord
} from "../types";
import { cellFromCanvasPoint, mapTileIndex, tileValueAt } from "./geometry";
import { hitTestMapTarget } from "./hitTest";
import { normalizeRegionBounds } from "./regionPaint";
import { makePaintTileResolver, paintSeed } from "./paintResolver";
import { nextActionPointRecordIndex } from "../actionPointCapacity";
import { selectEntityFromId, triggerEntityId } from "../utils";

export function useMapInteractions({
  map,
  activeTool,
  paintMode,
  paintVariation,
  activePaintGroupId,
  selectedTile,
  selectedTileset,
  triggers,
  randomLevel,
  mapRecords,
  showRandomRects,
  showMapRecords,
  selectedEntity,
  overlayCanvasRef,
  wrapRef,
  onSelectCell,
  onSetSelectedRegion,
  onSampleTile,
  onSelectEntity,
  onBeginPaintStroke,
  onApplyCommand,
  onCommitPaintStroke,
  onCancelPaintStroke,
  onPreviewPaintChange,
  onResetPaintPreview
}: {
  map: MapEntity;
  activeTool: EditorTool;
  paintMode: MapPaintMode;
  paintVariation: MapPaintVariation;
  activePaintGroupId: string;
  selectedTile: number;
  selectedTileset: TilesetAsset | null;
  triggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  showRandomRects: boolean;
  showMapRecords: boolean;
  selectedEntity: SelectedEntity | null;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
  onSelectCell: (cell: { x: number; y: number; tile: number } | null) => void;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  onSampleTile: (tile: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onCommitPaintStroke: () => void;
  onCancelPaintStroke: () => void;
  onPreviewPaintChange?: (change: PaintCellChange) => void;
  onResetPaintPreview?: () => void;
}) {
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const selectDragRef = useRef<{
    start: { x: number; y: number };
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const paintActiveRef = useRef(false);
  const randomDragRef = useRef<{
    start: { x: number; y: number };
    rectIndex: number | null;
    moved: boolean;
  } | null>(null);
  const strokeCellsRef = useRef<Set<string>>(new Set());
  const paintSequenceRef = useRef(0);
  const paintStrokeSeedRef = useRef(0);
  const pendingPaintChangesRef = useRef<PaintCellChange[]>([]);
  const lastPaintCellRef = useRef<{ x: number; y: number; tile: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<MapHitTarget | null>(null);
  const [paintCursor, setPaintCursor] = useState<{ x: number; y: number; tile: number } | null>(null);
  const [regionPreview, setRegionPreview] = useState<MapRegionSelection | null>(null);

  useEffect(() => {
    if ((activeTool === "paint" && paintMode === "brush") || activeTool === "stamp") return;
    setPaintCursor(null);
  }, [activeTool, paintMode]);

  useEffect(() => {
    if (!hover || !((activeTool === "paint" && paintMode === "brush") || activeTool === "stamp")) return;
    setPaintCursor({ ...hover, tile: brushTileForCell(hover) });
  }, [activePaintGroupId, activeTool, hover, paintMode, paintVariation, selectedTile, selectedTileset]);

  function cellFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return cellFromCanvasPoint(event.clientX, event.clientY, rect);
  }

  function selectTargetCell(cell: { x: number; y: number; tile: number }) {
    onSelectCell(cell);
  }

  function targetAt(cell: { x: number; y: number }) {
    return hitTestMapTarget({
      map,
      cell,
      triggers,
      randomLevel,
      mapRecords,
      showRandomRects,
      showMapRecords
    });
  }

  function inspectAt(cell: { x: number; y: number }) {
    const hit = targetAt(cell);
    onSetSelectedRegion(null);
    setHoverTarget(hit);
    selectTargetCell(hit.cell);
    if (hit.kind !== "cell") onSelectEntity(hit.entity);
  }

  function paintAt(cell: { x: number; y: number }) {
    const key = `${cell.x}:${cell.y}`;
    if (strokeCellsRef.current.has(key)) return;
    const index = mapTileIndex(map, cell.x, cell.y);
    const from = tileValueAt(map, cell.x, cell.y);
    const to = brushTileForCell(cell);
    if (!paintActiveRef.current) setHoverTarget({ kind: "cell", cell: { ...cell, tile: from } });
    if (from === to) {
      lastPaintCellRef.current = { ...cell, tile: from };
      strokeCellsRef.current.add(key);
      return;
    }
    const change: PaintCellChange = { ...cell, index, from, to };
    strokeCellsRef.current.add(key);
    paintSequenceRef.current += 1;
    lastPaintCellRef.current = { ...cell, tile: to };
    pendingPaintChangesRef.current.push(change);
    onPreviewPaintChange?.(change);
  }

  function brushTileForCell(cell: { x: number; y: number }) {
    const { resolver } = makePaintTileResolver({
      selectedTile,
      selectedTileset,
      variation: paintVariation,
      activeGroupId: activePaintGroupId,
      seed: paintStrokeSeedRef.current
    });
    return resolver({ ...cell, index: mapTileIndex(map, cell.x, cell.y), tile: tileValueAt(map, cell.x, cell.y) }, paintSequenceRef.current);
  }

  function updatePaintCursor(cell: { x: number; y: number }) {
    if (!((activeTool === "paint" && paintMode === "brush") || activeTool === "stamp")) {
      setPaintCursor(null);
      return;
    }
    setPaintCursor({ ...cell, tile: brushTileForCell(cell) });
  }

  function startPan(event: PointerEvent<HTMLCanvasElement>) {
    const wrap = wrapRef.current;
    if (!wrap) return false;
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop
    };
    setHoverTarget(null);
    setPaintCursor(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  }

  function applyToolAt(event: PointerEvent<HTMLCanvasElement>) {
    const cell = cellFromEvent(event);
    setHover(cell);
    updatePaintCursor(cell);
    if (activeTool === "sample") {
      const tile = tileValueAt(map, cell.x, cell.y);
      setHoverTarget({ kind: "cell", cell: { ...cell, tile } });
      selectTargetCell({ ...cell, tile });
      onSampleTile(tile);
      return;
    }
    if (activeTool === "trigger") {
      const hit = targetAt(cell);
      setHoverTarget(hit);
      selectTargetCell(hit.cell);
      if (hit.kind !== "cell") {
        onSelectEntity(hit.entity);
        return;
      }
      const recordIndex = nextActionPointRecordIndex(triggers, map.levelType, map.index);
      onApplyCommand({
        kind: "createActionPoint",
        label: `Create Action Point ${cell.x},${cell.y}`,
        levelType: map.levelType,
        levelIndex: map.index,
        x: cell.x,
        y: cell.y
      });
      if (recordIndex != null) {
        const source = map.levelType === "land" ? "Data DD" : "Data DDD";
        onSelectEntity(selectEntityFromId(triggerEntityId(map.levelType, map.index, recordIndex, source)));
      }
      return;
    }
    if (activeTool === "random") {
      const hit = targetAt(cell);
      setHoverTarget(hit);
      selectTargetCell(hit.cell);
      if (hit.kind !== "cell") onSelectEntity(hit.entity);
      return;
    }
    if (activeTool === "select") {
      inspectAt(cell);
      return;
    }
    if ((activeTool === "paint" && paintMode === "brush") || activeTool === "stamp") paintAt(cell);
  }

  function finishPaintStroke(commit: boolean) {
    if (!paintActiveRef.current) return;
    paintActiveRef.current = false;
    const changes = pendingPaintChangesRef.current;
    pendingPaintChangesRef.current = [];
    paintSequenceRef.current = 0;
    if (commit && changes.length > 0) {
      onApplyCommand({ kind: "paintTiles", mapId: map.id, label: "Paint tiles", cells: changes });
    } else if (!commit && changes.length > 0) {
      onResetPaintPreview?.();
    }
    if (commit && lastPaintCellRef.current) selectTargetCell(lastPaintCellRef.current);
    lastPaintCellRef.current = null;
    strokeCellsRef.current.clear();
    if (hover && ((activeTool === "paint" && paintMode === "brush") || activeTool === "stamp")) {
      setPaintCursor({ ...hover, tile: brushTileForCell(hover) });
    }
    if (commit) onCommitPaintStroke();
    else onCancelPaintStroke();
  }

  return {
    hover,
    hoverTarget,
    paintCursor,
    regionPreview,
    overlayHandlers: {
      onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
        event.currentTarget.focus();
        if (event.button === 2) {
          event.preventDefault();
          startPan(event);
          return;
        }
        if (activeTool === "select") {
          const cell = cellFromEvent(event);
          setHover(cell);
          setHoverTarget(targetAt(cell));
          selectDragRef.current = {
            start: cell,
            x: event.clientX,
            y: event.clientY,
            moved: false
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        if (activeTool === "pan") {
          startPan(event);
          return;
        }
        if (activeTool === "random") {
          const cell = cellFromEvent(event);
          const hit = targetAt(cell);
          const rectIndex = hit.kind === "randomRect" ? hit.rect.rectIndex : selectedRandomRectIndex(map, selectedEntity);
          randomDragRef.current = { start: cell, rectIndex, moved: false };
          setHover(cell);
          setHoverTarget(hit);
          selectTargetCell(hit.cell);
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        if ((activeTool === "paint" && paintMode === "brush") || activeTool === "stamp") {
          paintActiveRef.current = true;
          strokeCellsRef.current.clear();
          const startCell = cellFromEvent(event);
          paintStrokeSeedRef.current = paintSeed(map.id, startCell.x, startCell.y, selectedTile, activePaintGroupId);
          paintSequenceRef.current = 0;
          onBeginPaintStroke(activeTool === "stamp" ? "Place stamp" : "Paint tiles");
        }
        applyToolAt(event);
      },
      onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
        if (selectDragRef.current) {
          const cell = cellFromEvent(event);
          setHover(cell);
          const dx = event.clientX - selectDragRef.current.x;
          const dy = event.clientY - selectDragRef.current.y;
          if (selectDragRef.current.moved || Math.hypot(dx, dy) > 4) {
            if (!selectDragRef.current.moved) onSelectCell(null);
            selectDragRef.current.moved = true;
            setHoverTarget(null);
            setRegionPreview(normalizeRegionBounds(selectDragRef.current.start, cell));
            return;
          }
          setHoverTarget(targetAt(cell));
          return;
        }
        if (panRef.current && wrapRef.current) {
          wrapRef.current.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.x);
          wrapRef.current.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.y);
          return;
        }
        if (randomDragRef.current) {
          const cell = cellFromEvent(event);
          setHover(cell);
          setHoverTarget(targetAt(cell));
          if (
            randomDragRef.current.moved ||
            Math.abs(cell.x - randomDragRef.current.start.x) > 0 ||
            Math.abs(cell.y - randomDragRef.current.start.y) > 0
          ) {
            randomDragRef.current.moved = true;
          }
          return;
        }
        const cell = cellFromEvent(event);
        if (paintActiveRef.current) {
          setHover(cell);
          setHoverTarget({ kind: "cell", cell: { ...cell, tile: tileValueAt(map, cell.x, cell.y) } });
          updatePaintCursor(cell);
          paintAt(cell);
          return;
        }
        setHover(cell);
        setHoverTarget(targetAt(cell));
        updatePaintCursor(cell);
      },
      onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
        if (panRef.current) {
          panRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          return;
        }
        if (selectDragRef.current) {
          const didDrag = selectDragRef.current.moved;
          const start = selectDragRef.current.start;
          selectDragRef.current = null;
          if (!didDrag) {
            applyToolAt(event);
          } else {
            const end = cellFromEvent(event);
            setRegionPreview(null);
            onSetSelectedRegion(normalizeRegionBounds(start, end));
            onSelectCell(null);
            setHoverTarget(null);
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          return;
        }
        if (randomDragRef.current) {
          const drag = randomDragRef.current;
          randomDragRef.current = null;
          const end = cellFromEvent(event);
          const bounds = rectBounds(drag.start, end);
          if (!drag.moved) {
            applyToolAt(event);
          } else if (drag.rectIndex != null) {
            onApplyCommand({
              kind: "updateRandomRect",
              label: `Resize Random Rectangle ${drag.rectIndex}`,
              levelType: map.levelType,
              levelIndex: map.index,
              rectIndex: drag.rectIndex,
              fields: bounds
            });
            onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${drag.rectIndex}` });
          } else {
            const rectIndex = nextRandomRectIndex(randomLevel);
            onApplyCommand({
              kind: "createRandomRect",
              label: `Create Random Rectangle ${bounds.left},${bounds.top}`,
              levelType: map.levelType,
              levelIndex: map.index,
              rect: {
                ...bounds,
                percent: 1000,
                battleRange: [0, 0],
                randomDoors: [0, 0, 0],
                randomDoorPercent: [0, 0, 0],
                only: false,
                option: 0,
                sound: 0,
                text: 0
              }
            });
            if (rectIndex != null) onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rectIndex}` });
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          return;
        }
        finishPaintStroke(true);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onPointerCancel(event: PointerEvent<HTMLCanvasElement>) {
        panRef.current = null;
        selectDragRef.current = null;
        randomDragRef.current = null;
        setRegionPreview(null);
        setHoverTarget(null);
        setPaintCursor(null);
        finishPaintStroke(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onPointerLeave() {
        if (paintActiveRef.current || panRef.current || selectDragRef.current || randomDragRef.current) return;
        setHover(null);
        setHoverTarget(null);
        setPaintCursor(null);
      },
      onContextMenu(event: MouseEvent<HTMLCanvasElement>) {
        event.preventDefault();
      },
      onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
        if (event.key !== "Escape") return;
        selectDragRef.current = null;
        setRegionPreview(null);
        setPaintCursor(null);
        finishPaintStroke(false);
      }
    }
  };
}

function rectBounds(start: { x: number; y: number }, end: { x: number; y: number }) {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y)
  };
}

function selectedRandomRectIndex(map: MapEntity, selectedEntity: SelectedEntity | null) {
  const prefix = `random:${map.levelType}:${map.index}:`;
  if (!selectedEntity?.id.startsWith(prefix)) return null;
  const value = Number(selectedEntity.id.slice(prefix.length));
  return Number.isInteger(value) ? value : null;
}

function nextRandomRectIndex(randomLevel: RandomLevel | null) {
  const used = new Set((randomLevel?.rects ?? []).map((rect) => rect.rectIndex));
  for (let index = 0; index < 20; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}
