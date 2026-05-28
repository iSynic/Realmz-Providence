import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtlasEntry,
  EditorTool,
  IconEntry,
  MapFocusTarget,
  MapPreviewFocalPoint,
  MapPreviewMode,
  MapHitTarget,
  MapEntity,
  MapPaintMode,
  MapPaintVariation,
  MapRegionSelection,
  MapViewOptions,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  SemanticEntity,
  TileAttributeProfile,
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
import { hasSecretMarkerTile, isSecretWalkableTile } from "../map/secrets";
import { triggerEntityId } from "../utils";
import { ScrollArea } from "../ui";
import {
  drawBaseMap,
  drawBaseMapCell,
  drawHover,
  drawMapRecords,
  drawPaintCursor,
  drawMapVisibilityPreview,
  drawRandomRectangles,
  drawRegionSelection,
  drawSecretTileOverlay,
  drawSelectedCell,
  drawTileValueCell,
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
  paintMode,
  paintVariation,
  activePaintGroupId,
  selectedTile,
  zoom,
  smoothTiles,
  viewOptions,
  tileAttributes,
  showRandomRects,
  showMapRecords,
  previewMode,
  previewFocalPoint,
  selectedEntity,
  selectedCell,
  selectedRegion,
  focusTarget,
  onSelectCell,
  onSetSelectedRegion,
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
  paintMode: MapPaintMode;
  paintVariation: MapPaintVariation;
  activePaintGroupId: string;
  selectedTile: number;
  zoom: number;
  smoothTiles: boolean;
  viewOptions: MapViewOptions;
  tileAttributes: TileAttributeProfile[];
  showRandomRects: boolean;
  showMapRecords: boolean;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  selectedEntity: SelectedEntity | null;
  selectedCell: { x: number; y: number; tile: number } | null;
  selectedRegion: MapRegionSelection | null;
  focusTarget: MapFocusTarget | null;
  onSelectCell: (cell: { x: number; y: number; tile: number }) => void;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
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
  const baseRenderRef = useRef<BaseRenderSnapshot | null>(null);
  const [hudPosition, setHudPosition] = useState({ left: 10, top: 10 });
  const setHudNode = useCallback((node: HTMLDivElement | null) => {
    hudRef.current = node;
  }, []);
  const canvasCssSize = Math.round(BASE_CANVAS_SIZE * zoom);
  const previewPaintChange = useCallback((change: { x: number; y: number; to: number }) => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const size = syncCanvasSize(canvas, canvasCssSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = size / MAP_CELLS;
    ctx.imageSmoothingEnabled = smoothTiles;
    ctx.imageSmoothingQuality = smoothTiles ? "high" : "low";
    drawTileValueCell(ctx, { tile: change.to, x: change.x, y: change.y, atlas, icons, viewOptions, cell });
  }, [atlas, canvasCssSize, icons, smoothTiles, viewOptions]);
  const resetPaintPreview = useCallback(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const size = syncCanvasSize(canvas, canvasCssSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawBaseMap(ctx, { map, atlas, icons, smoothTiles, viewOptions, size });
    baseRenderRef.current = baseRenderSnapshot({ map, atlas, icons, smoothTiles, viewOptions, size });
  }, [atlas, canvasCssSize, icons, map, smoothTiles, viewOptions]);
  const { hover, hoverTarget, paintCursor, regionPreview, overlayHandlers } = useMapInteractions({
    map,
    activeTool,
    paintMode,
    paintVariation,
    activePaintGroupId,
    selectedTile,
    selectedTileset: tileset,
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
    onPreviewPaintChange: previewPaintChange,
    onResetPaintPreview: resetPaintPreview
  });
  const secretOverlayDependency = useMemo(
    () => viewOptions.showSecretOverlays ? secretOverlaySignature(map) : "secrets-off",
    [map.tiles, map.levelType, map.render.mode, viewOptions.showSecretOverlays]
  );
  const overlayMapDependency = previewMode !== "off" ? map : `${map.id}:${secretOverlayDependency}`;

  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const size = syncCanvasSize(canvas, canvasCssSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const nextSnapshot = baseRenderSnapshot({ map, atlas, icons, smoothTiles, viewOptions, size });
    const previous = baseRenderRef.current;
    const changedCells = previous && canPatchBaseMap(previous, nextSnapshot)
      ? changedTileCells(previous.tiles, map.tiles, map.width)
      : null;

    ctx.imageSmoothingEnabled = smoothTiles;
    ctx.imageSmoothingQuality = smoothTiles ? "high" : "low";
    if (changedCells && changedCells.length > 0) {
      const cell = size / MAP_CELLS;
      for (const changed of changedCells) {
        drawBaseMapCell(ctx, { map, x: changed.x, y: changed.y, atlas, icons, viewOptions, cell });
      }
    } else if (!changedCells || changedCells.length > 0) {
      drawBaseMap(ctx, { map, atlas, icons, smoothTiles, viewOptions, size });
    }
    baseRenderRef.current = nextSnapshot;
  }, [
    map,
    atlas,
    icons,
    tileset,
    zoom,
    smoothTiles,
    canvasCssSize,
    viewOptions.showRealTiles,
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
    if (previewMode !== "off") drawMapVisibilityPreview(ctx, map, tileset, tileAttributes, cell, previewMode, previewFocalPoint);
    drawTriggers(ctx, triggers, selectedEntity, cell);
    if (showMapRecords) drawMapRecords(ctx, mapRecords, selectedEntity, cell);
    if (selectedRegion) drawRegionSelection(ctx, selectedRegion, cell, "selected");
    if (selectedCell && !paintCursor) drawSelectedCell(ctx, selectedCell, cell);
    if (regionPreview) drawRegionSelection(ctx, regionPreview, cell, "preview");
    if (paintCursor) drawPaintCursor(ctx, { cursor: paintCursor, atlas, icons, viewOptions, cell });
    else if (hover) drawHover(ctx, hover, cell);
  }, [
    triggers,
    randomLevel,
    mapRecords,
    hover,
    paintCursor,
    showRandomRects,
    showMapRecords,
    selectedEntity,
    selectedCell,
    selectedRegion,
    regionPreview,
    viewOptions.showSecretOverlays,
    previewMode,
    previewFocalPoint,
    tileAttributes,
    tileset,
    atlas,
    icons,
    viewOptions,
    canvasCssSize,
    overlayMapDependency
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

type BaseRenderSnapshot = {
  mapId: string;
  tiles: number[];
  width: number;
  size: number;
  atlas: AtlasEntry | null;
  icons: Record<number, IconEntry>;
  smoothTiles: boolean;
  showRealTiles: boolean;
  showRealmzCoordinates: boolean;
};

function baseRenderSnapshot({
  map,
  atlas,
  icons,
  smoothTiles,
  viewOptions,
  size
}: {
  map: MapEntity;
  atlas: AtlasEntry | null;
  icons: Record<number, IconEntry>;
  smoothTiles: boolean;
  viewOptions: MapViewOptions;
  size: number;
}): BaseRenderSnapshot {
  return {
    mapId: map.id,
    tiles: map.tiles,
    width: map.width,
    size,
    atlas,
    icons,
    smoothTiles,
    showRealTiles: viewOptions.showRealTiles,
    showRealmzCoordinates: viewOptions.showRealmzCoordinates
  };
}

function canPatchBaseMap(previous: BaseRenderSnapshot, next: BaseRenderSnapshot) {
  return previous.mapId === next.mapId &&
    previous.width === next.width &&
    previous.size === next.size &&
    previous.atlas === next.atlas &&
    previous.icons === next.icons &&
    previous.smoothTiles === next.smoothTiles &&
    previous.showRealTiles === next.showRealTiles &&
    previous.showRealmzCoordinates === next.showRealmzCoordinates;
}

function changedTileCells(previous: number[], next: number[], width: number) {
  if (previous.length !== next.length || width <= 0) return null;
  const cells: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] === next[index]) continue;
    cells.push({ x: index % width, y: Math.floor(index / width) });
  }
  return cells;
}

function secretOverlaySignature(map: MapEntity) {
  let hash = map.levelType === "dungeon" || map.render.mode === "dungeon-top-down" ? 0x811c9dc5 : 0x45d9f3b;
  for (const value of map.tiles) {
    let marker = 0;
    if (isSecretWalkableTile(value, map)) marker |= 1;
    if (hasSecretMarkerTile(value, map)) marker |= 2;
    hash = Math.imul(hash ^ marker, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cursorForTool(tool: EditorTool, target: MapHitTarget | null) {
  if (tool === "pan") return "grab";
  if (tool === "paint" || tool === "stamp") return "none";
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
