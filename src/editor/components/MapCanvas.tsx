import { useCallback, useEffect, useRef, useState } from "react";
import {
  AtlasEntry,
  EditorTool,
  IconEntry,
  MapFocusTarget,
  MapHitTarget,
  MapEntity,
  MapViewOptions,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  SemanticEntity,
  TilesetAsset,
  TriggerRecord
} from "../types";
import {
  cellScrollTarget,
  clampScroll,
  MAP_CELLS,
  numberSummary,
  randomRectEntityId,
  rectCenter
} from "../map/geometry";
import { useMapInteractions } from "../map/useMapInteractions";
import { triggerEntityId } from "../utils";
import { ScrollArea } from "../ui";
import {
  drawBaseMap,
  drawHover,
  drawMapRecords,
  drawRandomRectangles,
  drawSecretTileOverlay,
  drawSelectedCell,
  drawTriggers,
  syncCanvasSize
} from "../map/drawMapCanvas";
import { MapKeyHud } from "./MapCanvasHud";

const BASE_CANVAS_SIZE = 900;

export function RealmzMapCanvas({
  map,
  tileset,
  atlas,
  icons,
  triggers,
  allTriggers,
  randomLevel,
  mapRecords,
  activeTool,
  selectedTile,
  zoom,
  smoothTiles,
  viewOptions,
  showRandomRects,
  showMapRecords,
  selectedEntity,
  selectedCell,
  focusTarget,
  onSelectCell,
  onSampleTile,
  onSelectEntity,
  onBeginPaintStroke,
  onApplyCommand,
  onCommitPaintStroke,
  onCancelPaintStroke
}: {
  map: MapEntity;
  tileset: TilesetAsset | null;
  atlas: AtlasEntry | null;
  icons: Record<number, IconEntry>;
  triggers: TriggerRecord[];
  allTriggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  activeTool: EditorTool;
  selectedTile: number;
  zoom: number;
  smoothTiles: boolean;
  viewOptions: MapViewOptions;
  showRandomRects: boolean;
  showMapRecords: boolean;
  selectedEntity: SelectedEntity | null;
  selectedCell: { x: number; y: number; tile: number } | null;
  focusTarget: MapFocusTarget | null;
  onSelectCell: (cell: { x: number; y: number; tile: number }) => void;
  onSampleTile: (tile: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onCommitPaintStroke: () => void;
  onCancelPaintStroke: () => void;
}) {
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const focusKeyRef = useRef<string | null>(null);
  const [hudPosition, setHudPosition] = useState({ left: 10, top: 10 });
  const setHudNode = useCallback((node: HTMLDivElement | null) => {
    hudRef.current = node;
  }, []);
  const canvasCssSize = Math.round(BASE_CANVAS_SIZE * zoom);
  const { hover, hoverTarget, overlayHandlers } = useMapInteractions({
    map,
    activeTool,
    selectedTile,
    triggers,
    randomLevel,
    mapRecords,
    showRandomRects,
    showMapRecords,
    selectedEntity,
    overlayCanvasRef,
    wrapRef,
    onSelectCell,
    onSampleTile,
    onSelectEntity,
    onBeginPaintStroke,
    onApplyCommand,
    onCommitPaintStroke,
    onCancelPaintStroke
  });

  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const size = syncCanvasSize(canvas, canvasCssSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawBaseMap(ctx, { map, atlas, icons, smoothTiles, viewOptions, size });
  }, [
    map,
    atlas,
    icons,
    tileset,
    zoom,
    smoothTiles,
    canvasCssSize,
    viewOptions.showRealTiles,
    viewOptions.showDecodedColors,
    viewOptions.showRealmzCoordinates
  ]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const size = syncCanvasSize(canvas, canvasCssSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = size / MAP_CELLS;
    ctx.clearRect(0, 0, size, size);

    if (showRandomRects && randomLevel) {
      drawRandomRectangles(ctx, map, randomLevel, selectedEntity, cell);
    }
    if (viewOptions.showSecretOverlays) drawSecretTileOverlay(ctx, map, cell);
    drawTriggers(ctx, triggers, selectedEntity, cell);
    if (showMapRecords) drawMapRecords(ctx, mapRecords, selectedEntity, cell);
    if (selectedCell) drawSelectedCell(ctx, selectedCell, cell);
    if (hover) drawHover(ctx, hover, cell);
  }, [
    triggers,
    randomLevel,
    mapRecords,
    hover,
    showRandomRects,
    showMapRecords,
    selectedEntity,
    selectedCell,
    viewOptions.showSecretOverlays,
    canvasCssSize,
    map
  ]);

  useEffect(() => {
    const focus = focusCellForTarget(map, focusTarget, selectedEntity, allTriggers, randomLevel, mapRecords);
    if (!focus) return;
    const key = `${focusTarget?.nonce ?? selectedEntity?.id}:${focus.x}:${focus.y}:${canvasCssSize}`;
    if (focusKeyRef.current === key) return;
    focusKeyRef.current = key;
    window.requestAnimationFrame(() => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const target = cellScrollTarget(focus, canvasCssSize);
      const targetX = target.x;
      const targetY = target.y;
      wrap.scrollLeft = clampScroll(targetX - wrap.clientWidth / 2, wrap.scrollWidth - wrap.clientWidth);
      wrap.scrollTop = clampScroll(targetY - wrap.clientHeight / 2, wrap.scrollHeight - wrap.clientHeight);
    });
  }, [selectedEntity, focusTarget, allTriggers, randomLevel, mapRecords, map, canvasCssSize]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const hud = hudRef.current;
    if (!wrap || !hud) return;

    let frame = 0;
    const updateHudPosition = () => {
      frame = 0;
      const padding = 10;
      const hudWidth = hud.offsetWidth;
      const hudHeight = hud.offsetHeight;
      const left = clampScroll(wrap.scrollLeft + padding, canvasCssSize - hudWidth - padding);
      const top = clampScroll(wrap.scrollTop + wrap.clientHeight - hudHeight - padding, canvasCssSize - hudHeight - padding);
      setHudPosition((current) => (current.left === left && current.top === top ? current : { left, top }));
    };
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateHudPosition);
    };

    updateHudPosition();
    wrap.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      wrap.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [
    canvasCssSize,
    hover,
    triggers.length,
    randomLevel?.rects.length,
    mapRecords.length,
    activeTool,
    selectedTile,
    viewOptions.showRealTiles,
    atlas,
    tileset
  ]);

  return (
    <ScrollArea className="room-canvas-wrap" orientation="both" aria-label="Map canvas" onViewportRef={(node) => { wrapRef.current = node; }}>
      <div className="canvas-frame" style={{ width: `${canvasCssSize}px`, height: `${canvasCssSize}px` }}>
        <canvas
          ref={baseCanvasRef}
          className="room-canvas room-canvas-base"
          style={{ imageRendering: smoothTiles ? "auto" : "pixelated" }}
          aria-hidden="true"
        />
        <canvas
          ref={overlayCanvasRef}
          className="room-canvas room-canvas-overlay"
          tabIndex={0}
          style={{ cursor: cursorForTool(activeTool, hoverTarget) }}
          {...overlayHandlers}
        />
        <MapKeyHud
          setHudRef={setHudNode}
          style={{ left: `${hudPosition.left}px`, top: `${hudPosition.top}px` }}
          map={map}
          hover={hover}
          triggers={triggers}
          randomLevel={showRandomRects ? randomLevel : null}
          mapRecords={showMapRecords ? mapRecords : []}
          activeTool={activeTool}
          selectedTile={selectedTile}
          tilesetLabel={viewOptions.showRealTiles && atlas ? `${atlas.asset.name} atlas` : `${tileset?.name ?? "unknown"} decoded`}
        />
      </div>
    </ScrollArea>
  );
}

function cursorForTool(tool: EditorTool, target: MapHitTarget | null) {
  if (tool === "pan") return "grab";
  if (tool === "paint") return "crosshair";
  if (tool === "random") return target?.kind === "randomRect" ? "move" : "crosshair";
  if (tool === "sample") return "copy";
  if (tool === "select" && target?.kind === "cell") return "grab";
  if (target && target.kind !== "cell") return "pointer";
  return "default";
}

function focusCellForTarget(
  map: MapEntity,
  focusTarget: MapFocusTarget | null,
  selectedEntity: SelectedEntity | null,
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
) {
  if (focusTarget?.mapId === map.id) {
    if (focusTarget.kind === "cell" || focusTarget.kind === "rect") return { x: focusTarget.x, y: focusTarget.y };
    return focusCellForEntity(map, focusTarget.entity, triggers, randomLevel, mapRecords);
  }
  return focusCellForEntity(map, selectedEntity, triggers, randomLevel, mapRecords);
}

function focusCellForEntity(
  map: MapEntity,
  selectedEntity: SelectedEntity | null,
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
) {
  if (!selectedEntity) return null;
  const trigger = triggers.find(
    (candidate) => triggerEntityId(candidate.levelType, candidate.levelIndex, candidate.recordIndex, candidate.source) === selectedEntity.id
  );
  if (trigger?.coordinate) return trigger.coordinate;
  const rect = randomLevel?.rects.find((candidate) => selectedEntity.id === randomRectEntityId(map, candidate.rectIndex));
  if (rect) return rectCenter(rect);
  const record = mapRecords.find((candidate) => candidate.id === selectedEntity.id);
  const x = record ? numberSummary(record, "startX") : null;
  const y = record ? numberSummary(record, "startY") : null;
  return x == null || y == null ? null : { x, y };
}
