import { KeyboardEvent, PointerEvent, RefObject, useRef, useState } from "react";
import {
  EditorTool,
  MapEntity,
  MapHitTarget,
  PaintCellChange,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  SemanticEntity,
  TriggerRecord
} from "../types";
import { cellFromCanvasPoint, mapTileIndex, tileValueAt } from "./geometry";
import { hitTestMapTarget } from "./hitTest";

export function useMapInteractions({
  map,
  activeTool,
  selectedTile,
  triggers,
  randomLevel,
  mapRecords,
  showRandomRects,
  showMapRecords,
  overlayCanvasRef,
  wrapRef,
  onSelectCell,
  onSampleTile,
  onSelectEntity,
  onBeginPaintStroke,
  onApplyCommand,
  onCommitPaintStroke,
  onCancelPaintStroke
}: {
  map: MapEntity;
  activeTool: EditorTool;
  selectedTile: number;
  triggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  showRandomRects: boolean;
  showMapRecords: boolean;
  overlayCanvasRef: RefObject<HTMLCanvasElement | null>;
  wrapRef: RefObject<HTMLDivElement | null>;
  onSelectCell: (cell: { x: number; y: number; tile: number }) => void;
  onSampleTile: (tile: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onCommitPaintStroke: () => void;
  onCancelPaintStroke: () => void;
}) {
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const selectDragRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
    moved: boolean;
  } | null>(null);
  const paintActiveRef = useRef(false);
  const strokeCellsRef = useRef<Set<string>>(new Set());
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [hoverTarget, setHoverTarget] = useState<MapHitTarget | null>(null);

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
    setHoverTarget(hit);
    selectTargetCell(hit.cell);
    if (hit.kind !== "cell") onSelectEntity(hit.entity);
  }

  function paintAt(cell: { x: number; y: number }) {
    const key = `${cell.x}:${cell.y}`;
    if (strokeCellsRef.current.has(key)) return;
    const index = mapTileIndex(map, cell.x, cell.y);
    const from = tileValueAt(map, cell.x, cell.y);
    setHoverTarget({ kind: "cell", cell: { ...cell, tile: from } });
    if (from === selectedTile) {
      selectTargetCell({ ...cell, tile: from });
      strokeCellsRef.current.add(key);
      return;
    }
    const change: PaintCellChange = { ...cell, index, from, to: selectedTile };
    strokeCellsRef.current.add(key);
    onApplyCommand({ kind: "paintTiles", mapId: map.id, label: "Paint tiles", cells: [change] });
    selectTargetCell({ ...cell, tile: selectedTile });
  }

  function applyToolAt(event: PointerEvent<HTMLCanvasElement>) {
    const cell = cellFromEvent(event);
    setHover(cell);
    if (activeTool === "sample") {
      const tile = tileValueAt(map, cell.x, cell.y);
      setHoverTarget({ kind: "cell", cell: { ...cell, tile } });
      selectTargetCell({ ...cell, tile });
      onSampleTile(tile);
      return;
    }
    if (activeTool === "select" || activeTool === "trigger") {
      inspectAt(cell);
      return;
    }
    if (activeTool === "paint") paintAt(cell);
  }

  function finishPaintStroke(commit: boolean) {
    if (!paintActiveRef.current) return;
    paintActiveRef.current = false;
    strokeCellsRef.current.clear();
    if (commit) onCommitPaintStroke();
    else onCancelPaintStroke();
  }

  return {
    hover,
    hoverTarget,
    overlayHandlers: {
      onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
        event.currentTarget.focus();
        if (activeTool === "select") {
          const cell = cellFromEvent(event);
          const wrap = wrapRef.current;
          setHover(cell);
          setHoverTarget(targetAt(cell));
          selectDragRef.current = {
            x: event.clientX,
            y: event.clientY,
            scrollLeft: wrap?.scrollLeft ?? 0,
            scrollTop: wrap?.scrollTop ?? 0,
            moved: false
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
        if (activeTool === "pan") {
          const wrap = wrapRef.current;
          if (wrap) {
            panRef.current = {
              x: event.clientX,
              y: event.clientY,
              scrollLeft: wrap.scrollLeft,
              scrollTop: wrap.scrollTop
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        if (activeTool === "paint") {
          paintActiveRef.current = true;
          strokeCellsRef.current.clear();
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
            const wrap = wrapRef.current;
            selectDragRef.current.moved = true;
            setHoverTarget(null);
            if (wrap) {
              wrap.scrollLeft = selectDragRef.current.scrollLeft - dx;
              wrap.scrollTop = selectDragRef.current.scrollTop - dy;
            }
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
        const cell = cellFromEvent(event);
        setHover(cell);
        if (!paintActiveRef.current) setHoverTarget(targetAt(cell));
        if (paintActiveRef.current) paintAt(cell);
      },
      onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
        if (selectDragRef.current) {
          const didDrag = selectDragRef.current.moved;
          selectDragRef.current = null;
          if (!didDrag) applyToolAt(event);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          return;
        }
        panRef.current = null;
        finishPaintStroke(true);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onPointerCancel(event: PointerEvent<HTMLCanvasElement>) {
        panRef.current = null;
        selectDragRef.current = null;
        setHoverTarget(null);
        finishPaintStroke(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      },
      onPointerLeave() {
        if (paintActiveRef.current || panRef.current || selectDragRef.current) return;
        setHover(null);
        setHoverTarget(null);
      },
      onKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
        if (event.key !== "Escape") return;
        finishPaintStroke(false);
      }
    }
  };
}
