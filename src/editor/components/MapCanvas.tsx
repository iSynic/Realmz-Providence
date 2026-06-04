import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtlasEntry,
  EditorTool,
  IconEntry,
  MapPreviewFocalPoint,
  MapPreviewMode,
  MapHitTarget,
  MapEntity,
  MapHudAnchor,
  MapPaintMode,
  MapPaintVariation,
  MapRegionSelection,
  MapViewOptions,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  SemanticEntity,
  SmartBrushMaskCell,
  SmartBrushPlan,
  TileAttributeProfile,
  TilesetAsset,
  TriggerRecord
} from "../types";
import { clampScroll, mapCellFromTileIndex, MAP_CELLS } from "../map/geometry";
import { useMapInteractions } from "../map/useMapInteractions";
import { hasSecretMarkerTile, isSecretWalkableTile } from "../map/secrets";
import { loadMapOverlaySprites } from "../map/mapOverlaySprites";
import { ScrollArea } from "../ui";
import {
  drawBaseMap,
  drawBaseMapCell,
  drawCoordinateLabels,
  drawHover,
  drawMapRecords,
  drawPaintCursor,
  drawMapVisibilityPreview,
  drawRandomRectangles,
  drawRegionSelection,
  drawSecretTileOverlay,
  drawSelectedCell,
  drawSmartTerrainMask,
  drawSmartTerrainPreview,
  drawTileValueCell,
  drawTriggers,
  syncCanvasSize
} from "../map/drawMapCanvas";
import { MapKeyHud } from "./MapCanvasHud";

const BASE_CANVAS_SIZE = 900;
const COORDINATE_GUTTER_CELLS = 1;

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
  variationTiles,
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
  smartBrushMask,
  smartBrushPlan,
  smartBrushDrawing,
  onSelectCell,
  onSetSelectedRegion,
  onSetSmartBrushMask,
  onSetSmartBrushDrawing,
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
  variationTiles?: number[] | null;
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
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushPlan: SmartBrushPlan | null;
  smartBrushDrawing: boolean;
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
}) {
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hudRef = useRef<HTMLDivElement | null>(null);
  const baseRenderRef = useRef<BaseRenderSnapshot | null>(null);
  const hudMoveCooldownRef = useRef(0);
  const [hudPosition, setHudPosition] = useState({ left: 10, top: 10 });
  const [hudAnchor, setHudAnchor] = useState<MapHudAnchor>("bottom-left");
  const [overlaySpriteVersion, setOverlaySpriteVersion] = useState(0);
  const setHudNode = useCallback((node: HTMLDivElement | null) => {
    hudRef.current = node;
  }, []);
  useEffect(() => {
    loadMapOverlaySprites(() => setOverlaySpriteVersion((version) => version + 1));
  }, []);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const handlePointerMove = (event: PointerEvent) => {
      const hud = hudRef.current;
      if (!hud) return;
      const rect = hud.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      const now = performance.now();
      if (now < hudMoveCooldownRef.current) return;
      hudMoveCooldownRef.current = now + 350;
      setHudAnchor(nextHudAnchor);
    };
    wrap.addEventListener("pointermove", handlePointerMove, { passive: true });
    return () => wrap.removeEventListener("pointermove", handlePointerMove);
  }, []);
  const mapCssSize = Math.round(BASE_CANVAS_SIZE * zoom);
  const coordinateGutterCss = viewOptions.showRealmzCoordinates ? mapCssSize / MAP_CELLS : 0;
  const canvasCssSize = Math.round(mapCssSize + coordinateGutterCss * 2);
  const previewPaintChange = useCallback((change: { x: number; y: number; to: number }) => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const size = syncCanvasSize(canvas, canvasCssSize);
    const layout = mapCanvasLayout(size, viewOptions.showRealmzCoordinates);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = smoothTiles;
    ctx.imageSmoothingQuality = smoothTiles ? "high" : "low";
    ctx.save();
    ctx.translate(layout.gutter, layout.gutter);
    drawTileValueCell(ctx, { tile: change.to, x: change.x, y: change.y, atlas, icons, viewOptions, cell: layout.cell });
    ctx.restore();
  }, [atlas, canvasCssSize, icons, smoothTiles, viewOptions]);
  const resetPaintPreview = useCallback(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const size = syncCanvasSize(canvas, canvasCssSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawBaseMapLayer(ctx, { map, atlas, icons, smoothTiles, viewOptions, size });
    baseRenderRef.current = baseRenderSnapshot({ map, atlas, icons, smoothTiles, viewOptions, size });
  }, [atlas, canvasCssSize, icons, map, smoothTiles, viewOptions]);
  const { hover, hoverTarget, paintCursor, regionPreview, overlayHandlers } = useMapInteractions({
    map,
    activeTool,
    paintMode,
    paintVariation,
    activePaintGroupId,
    variationTiles,
    selectedTile,
    selectedTileset: tileset,
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
      ? changedTileCells(previous.tiles, map.tiles, map)
      : null;

    ctx.imageSmoothingEnabled = smoothTiles;
    ctx.imageSmoothingQuality = smoothTiles ? "high" : "low";
    if (changedCells && changedCells.length > 0) {
      const layout = mapCanvasLayout(size, viewOptions.showRealmzCoordinates);
      for (const changed of changedCells) {
        ctx.save();
        ctx.translate(layout.gutter, layout.gutter);
        drawBaseMapCell(ctx, { map, x: changed.x, y: changed.y, atlas, icons, viewOptions, cell: layout.cell });
        ctx.restore();
      }
    } else if (!changedCells || changedCells.length > 0) {
      drawBaseMapLayer(ctx, { map, atlas, icons, smoothTiles, viewOptions, size });
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
    const size = syncCanvasSize(canvas, mapCssSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cell = size / MAP_CELLS;
    ctx.clearRect(0, 0, size, size);

    if (showRandomRects && randomLevel) {
      drawRandomRectangles(ctx, map, randomLevel, selectedEntity, cell);
    }
    if (viewOptions.showSecretOverlays) drawSecretTileOverlay(ctx, map, cell, icons);
    if (previewMode !== "off") drawMapVisibilityPreview(ctx, map, tileset, tileAttributes, cell, previewMode, previewFocalPoint);
    drawTriggers(ctx, triggers, selectedEntity, cell);
    if (showMapRecords) drawMapRecords(ctx, mapRecords, selectedEntity, cell);
    if (selectedRegion) drawRegionSelection(ctx, selectedRegion, cell, "selected");
    if (smartBrushDrawing && smartBrushMask.length > 0) {
      drawSmartTerrainMask(ctx, smartBrushMask, cell);
    } else if (smartBrushPlan && (smartBrushPlan.cells.length > 0 || smartBrushPlan.skipped.length > 0)) {
      drawSmartTerrainPreview(ctx, { cells: smartBrushPlan.cells, skipped: smartBrushPlan.skipped, atlas, icons, viewOptions, cell });
    }
    if (selectedCell && !selectedRegion && !paintCursor) drawSelectedCell(ctx, selectedCell, cell);
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
    smartBrushMask,
    smartBrushPlan,
    smartBrushDrawing,
    regionPreview,
    viewOptions.showSecretOverlays,
    previewMode,
    previewFocalPoint,
    tileAttributes,
    tileset,
    atlas,
    icons,
    viewOptions,
    mapCssSize,
    overlayMapDependency,
    overlaySpriteVersion
  ]);

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
      const hasHorizontalScrollbar = wrap.scrollWidth > wrap.clientWidth + 1;
      const hasVerticalScrollbar = wrap.scrollHeight > wrap.clientHeight + 1;
      const rightGutter = hasVerticalScrollbar ? 24 : padding;
      const bottomGutter = hasHorizontalScrollbar ? 84 : padding;
      const leftTarget = hudAnchor.endsWith("right")
        ? wrap.scrollLeft + wrap.clientWidth - hudWidth - rightGutter
        : wrap.scrollLeft + padding;
      const topTarget = hudAnchor.startsWith("bottom")
        ? wrap.scrollTop + wrap.clientHeight - hudHeight - bottomGutter
        : wrap.scrollTop + padding;
      const left = clampScroll(leftTarget, canvasCssSize - hudWidth - padding);
      const top = clampScroll(topTarget, canvasCssSize - hudHeight - padding);
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
    tileset,
    hudAnchor
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
          style={{
            cursor: cursorForTool(activeTool, paintMode, hoverTarget),
            left: `${coordinateGutterCss}px`,
            top: `${coordinateGutterCss}px`,
            right: "auto",
            bottom: "auto",
            width: `${mapCssSize}px`,
            height: `${mapCssSize}px`
          }}
          {...overlayHandlers}
        />
        <MapKeyHud
          setHudRef={setHudNode}
          style={{ left: `${hudPosition.left}px`, top: `${hudPosition.top}px` }}
          anchor={hudAnchor}
          onRequestMove={() => setHudAnchor(nextHudAnchor)}
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

function drawBaseMapLayer(
  ctx: CanvasRenderingContext2D,
  {
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
  }
) {
  const layout = mapCanvasLayout(size, viewOptions.showRealmzCoordinates);
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(layout.gutter, layout.gutter);
  drawBaseMap(ctx, { map, atlas, icons, smoothTiles, viewOptions, size: layout.mapSize });
  ctx.restore();
  if (viewOptions.showRealmzCoordinates) drawCoordinateLabels(ctx, layout.cell, size, layout.gutter);
}

function mapCanvasLayout(size: number, showRealmzCoordinates: boolean) {
  const totalCells = showRealmzCoordinates ? MAP_CELLS + COORDINATE_GUTTER_CELLS * 2 : MAP_CELLS;
  const cell = size / totalCells;
  const gutter = showRealmzCoordinates ? cell * COORDINATE_GUTTER_CELLS : 0;
  return {
    cell,
    gutter,
    mapSize: cell * MAP_CELLS
  };
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

function changedTileCells(previous: number[], next: number[], map: MapEntity) {
  if (previous.length !== next.length || map.width <= 0 || map.height <= 0) return null;
  const cells: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index] === next[index]) continue;
    cells.push(mapCellFromTileIndex(map, index));
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

function cursorForTool(tool: EditorTool, paintMode: MapPaintMode, target: MapHitTarget | null) {
  if (tool === "pan") return "grab";
  if (tool === "paint" && paintMode === "smart") return "crosshair";
  if (tool === "paint" || tool === "stamp") return "none";
  if (tool === "random") return target?.kind === "randomRect" ? "move" : "crosshair";
  if (tool === "sample") return "copy";
  if (tool === "select" && target?.kind === "cell") return "grab";
  if (target && target.kind !== "cell") return "pointer";
  return "default";
}

function nextHudAnchor(anchor: MapHudAnchor): MapHudAnchor {
  if (anchor === "bottom-left") return "bottom-right";
  if (anchor === "bottom-right") return "top-right";
  if (anchor === "top-right") return "top-left";
  return "bottom-left";
}
