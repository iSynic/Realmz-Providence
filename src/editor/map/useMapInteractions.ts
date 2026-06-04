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
  SmartBrushMaskCell,
  TilesetAsset,
  TriggerRecord
} from "../types";
import { cellFromCanvasPoint, mapTileIndex, tileValueAt } from "./geometry";
import { hitTestMapTarget } from "./hitTest";
import { normalizeRegionBounds } from "./regionPaint";
import { makePaintTileResolver, paintSeed } from "./paintResolver";
import { clearTileForMap } from "./tileClear";
import { nextActionPointRecordIndex } from "../actionPointCapacity";
import { selectEntityFromId, triggerEntityId } from "../utils";
import { buildSuperTileStampChanges, MapStamp, superTileStampPreviewCells } from "./superTileStamps";

export function useMapInteractions({
  map,
  activeTool,
  paintMode,
  paintVariation,
  activePaintGroupId,
  variationTiles,
  selectedTile,
  selectedSuperTileStamp,
  selectedTileset,
  triggers,
  randomLevel,
  mapRecords,
  showRandomRects,
  showMapRecords,
  selectedEntity,
  smartBrushMask,
  smartBrushDrawing,
  overlayCanvasRef,
  wrapRef,
  onSelectCell,
  onSetSelectedRegion,
  onSetSmartBrushMask,
  onSetSmartBrushDrawing,
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
  variationTiles?: number[] | null;
  selectedTile: number;
  selectedSuperTileStamp: MapStamp | null;
  selectedTileset: TilesetAsset | null;
  triggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  showRandomRects: boolean;
  showMapRecords: boolean;
  selectedEntity: SelectedEntity | null;
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushDrawing: boolean;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
  onSelectCell: (cell: { x: number; y: number; tile: number } | null) => void;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  onSetSmartBrushMask: (mask: SmartBrushMaskCell[]) => void;
  onSetSmartBrushDrawing: (drawing: boolean) => void;
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
  const smartMaskDragRef = useRef<{
    cells: Map<string, SmartBrushMaskCell>;
    last: { x: number; y: number } | null;
    path: Array<{ x: number; y: number }>;
  } | null>(null);
  const strokeCellsRef = useRef<Set<string>>(new Set());
  const paintSequenceRef = useRef(0);
  const paintStrokeSeedRef = useRef(0);
  const pendingPaintChangesRef = useRef<PaintCellChange[]>([]);
  const lastPaintCellRef = useRef<{ x: number; y: number; tile: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<MapHitTarget | null>(null);
  const [paintCursor, setPaintCursor] = useState<{ x: number; y: number; tile: number } | null>(null);
  const [stampCursor, setStampCursor] = useState<Array<{ x: number; y: number; tile: number }> | null>(null);
  const [regionPreview, setRegionPreview] = useState<MapRegionSelection | null>(null);

  useEffect(() => {
    if (isBrushLikeTool(activeTool, paintMode)) return;
    setPaintCursor(null);
  }, [activeTool, paintMode]);

  useEffect(() => {
    if (!hover || !isBrushLikeTool(activeTool, paintMode)) return;
    setPaintCursor({ ...hover, tile: brushTileForCell(hover) });
  }, [activePaintGroupId, activeTool, hover, paintMode, paintVariation, selectedTile, selectedTileset, variationTiles]);

  useEffect(() => {
    if (activeTool !== "stamp" || !hover || !selectedSuperTileStamp) {
      setStampCursor(null);
      return;
    }
    setStampCursor(superTileStampPreviewCells(map, selectedSuperTileStamp, hover));
  }, [activeTool, hover, map, selectedSuperTileStamp]);

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
    if (activeTool === "paint" && paintMode === "clear") return clearTileForMap(map, selectedTileset);
    const { resolver } = makePaintTileResolver({
      selectedTile,
      selectedTileset,
      variation: paintVariation,
      activeGroupId: activePaintGroupId,
      variationTiles,
      seed: paintStrokeSeedRef.current
    });
    return resolver({ ...cell, index: mapTileIndex(map, cell.x, cell.y), tile: tileValueAt(map, cell.x, cell.y) }, paintSequenceRef.current);
  }

  function updatePaintCursor(cell: { x: number; y: number }) {
    if (!isBrushLikeTool(activeTool, paintMode)) {
      setPaintCursor(null);
      return;
    }
    setPaintCursor({ ...cell, tile: brushTileForCell(cell) });
  }

  function placeStampAt(cell: { x: number; y: number }) {
    if (!selectedSuperTileStamp) return;
    const changes = buildSuperTileStampChanges(map, selectedSuperTileStamp, cell);
    setStampCursor(superTileStampPreviewCells(map, selectedSuperTileStamp, cell));
    setHoverTarget({ kind: "cell", cell: { ...cell, tile: tileValueAt(map, cell.x, cell.y) } });
    selectTargetCell({ ...cell, tile: selectedSuperTileStamp.cells[0]?.tile ?? tileValueAt(map, cell.x, cell.y) });
    if (changes.length === 0) return;
    onBeginPaintStroke(`Place ${selectedSuperTileStamp.label}`);
    onApplyCommand({ kind: "paintTiles", mapId: map.id, label: `Place ${selectedSuperTileStamp.label}`, cells: changes });
    onCommitPaintStroke();
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
    if (activeTool === "stamp") {
      placeStampAt(cell);
      return;
    }
    if (isBrushLikeTool(activeTool, paintMode)) paintAt(cell);
  }

  function addSmartMaskCell(cell: { x: number; y: number }) {
    const drag = smartMaskDragRef.current;
    if (!drag) return false;
    const key = `${cell.x}:${cell.y}`;
    if (drag.cells.has(key)) return false;
    drag.cells.set(key, { x: cell.x, y: cell.y });
    return true;
  }

  function addSmartMaskPath(cell: { x: number; y: number }) {
    const drag = smartMaskDragRef.current;
    if (!drag) return;
    let changed = false;
    const start = drag.last ?? cell;
    for (const step of lineCells(start, cell)) {
      changed = addSmartMaskCell(step) || changed;
    }
    drag.last = cell;
    const lastPath = drag.path[drag.path.length - 1];
    if (!lastPath || lastPath.x !== cell.x || lastPath.y !== cell.y) drag.path.push(cell);
    if (changed) onSetSmartBrushMask([...drag.cells.values()]);
    setHover(cell);
    setHoverTarget({ kind: "cell", cell: { ...cell, tile: tileValueAt(map, cell.x, cell.y) } });
  }

  function finishSmartMaskDrag() {
    const drag = smartMaskDragRef.current;
    if (!drag) return;
    let changed = false;
    for (const cell of filledLassoCells(drag.path, map)) {
      changed = addSmartMaskCell(cell) || changed;
    }
    if (changed) onSetSmartBrushMask([...drag.cells.values()]);
    smartMaskDragRef.current = null;
    onSetSmartBrushDrawing(false);
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
    if (hover && isBrushLikeTool(activeTool, paintMode)) {
      setPaintCursor({ ...hover, tile: brushTileForCell(hover) });
    }
    if (commit) onCommitPaintStroke();
    else onCancelPaintStroke();
  }

  return {
    hover,
    hoverTarget,
    paintCursor,
    stampCursor,
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
        if (activeTool === "paint" && paintMode === "smart") {
          const existing = new Map(smartBrushMask.map((cell) => [`${cell.x}:${cell.y}`, cell]));
          smartMaskDragRef.current = { cells: existing, last: null, path: [] };
          onSetSmartBrushDrawing(true);
          addSmartMaskPath(cellFromEvent(event));
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        if (activeTool === "stamp") {
          applyToolAt(event);
          return;
        }
        if (isBrushLikeTool(activeTool, paintMode)) {
          paintActiveRef.current = true;
          strokeCellsRef.current.clear();
          const startCell = cellFromEvent(event);
          paintStrokeSeedRef.current = paintSeed(map.id, startCell.x, startCell.y, selectedTile, activePaintGroupId, variationTiles?.join(","));
          paintSequenceRef.current = 0;
          onBeginPaintStroke("Paint tiles");
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
        if (smartMaskDragRef.current) {
          const cell = cellFromEvent(event);
          addSmartMaskPath(cell);
          return;
        }
        const cell = cellFromEvent(event);
        if (activeTool === "stamp") {
          setHover(cell);
          setHoverTarget({ kind: "cell", cell: { ...cell, tile: tileValueAt(map, cell.x, cell.y) } });
          if (selectedSuperTileStamp) setStampCursor(superTileStampPreviewCells(map, selectedSuperTileStamp, cell));
          return;
        }
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
        if (smartMaskDragRef.current) {
          finishSmartMaskDrag();
          const cell = cellFromEvent(event);
          setHover(cell);
          setHoverTarget({ kind: "cell", cell: { ...cell, tile: tileValueAt(map, cell.x, cell.y) } });
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
        smartMaskDragRef.current = null;
        if (smartBrushDrawing) onSetSmartBrushDrawing(false);
        setRegionPreview(null);
        setHoverTarget(null);
        setPaintCursor(null);
        setStampCursor(null);
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
        setStampCursor(null);
      },
      onContextMenu(event: MouseEvent<HTMLCanvasElement>) {
        event.preventDefault();
      },
      onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
        if (event.key !== "Escape") return;
        selectDragRef.current = null;
        setRegionPreview(null);
        setPaintCursor(null);
        setStampCursor(null);
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

function lineCells(start: { x: number; y: number }, end: { x: number; y: number }) {
  const cells: Array<{ x: number; y: number }> = [];
  let x0 = start.x;
  let y0 = start.y;
  const x1 = end.x;
  const y1 = end.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let error = dx - dy;
  while (true) {
    cells.push({ x: x0, y: y0 });
    if (x0 === x1 && y0 === y1) break;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x0 += sx;
    }
    if (doubled < dx) {
      error += dx;
      y0 += sy;
    }
  }
  return cells;
}

function filledLassoCells(path: Array<{ x: number; y: number }>, map: MapEntity) {
  if (path.length < 4) return [];
  const first = path[0];
  const last = path[path.length - 1];
  const bounds = path.reduce(
    (acc, point) => ({
      left: Math.min(acc.left, point.x),
      right: Math.max(acc.right, point.x),
      top: Math.min(acc.top, point.y),
      bottom: Math.max(acc.bottom, point.y)
    }),
    { left: first.x, right: first.x, top: first.y, bottom: first.y }
  );
  const width = bounds.right - bounds.left + 1;
  const height = bounds.bottom - bounds.top + 1;
  const closeDistance = Math.abs(first.x - last.x) + Math.abs(first.y - last.y);
  if (width < 3 || height < 3 || closeDistance > Math.max(3, Math.min(width, height))) return [];

  const polygon = path.map((point) => ({ x: point.x + 0.5, y: point.y + 0.5 }));
  const cells: Array<{ x: number; y: number }> = [];
  const left = Math.max(0, bounds.left);
  const right = Math.min(map.width - 1, bounds.right);
  const top = Math.max(0, bounds.top);
  const bottom = Math.min(map.height - 1, bounds.bottom);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, polygon)) cells.push({ x, y });
    }
  }
  return cells;
}

function pointInPolygon(x: number, y: number, polygon: Array<{ x: number; y: number }>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = (a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function isBrushLikeTool(activeTool: EditorTool, paintMode: MapPaintMode) {
  return activeTool === "paint" && (paintMode === "brush" || paintMode === "clear");
}
