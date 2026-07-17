import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AtlasEntry,
  CustomMapStamp,
  DungeonCellFlag,
  EditorTool,
  IconEntry,
  MapPreviewFocalPoint,
  MapPreviewMode,
  MapHitTarget,
  MapEntity,
  MapHudAnchor,
  MapPaintMode,
  MapPaintVariation,
  MapFocusTarget,
  MapRegionSelection,
  MapViewOptions,
  Project,
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
import { captureMapStampFromRegion, createMapStampId, normalizeMapStamps } from "../map/customMapStamps";
import { hasSecretMarkerTile, showsCombatClearingOverlay, showsHiddenWalkableOverlay } from "../map/secrets";
import { loadMapOverlaySprites } from "../map/mapOverlaySprites";
import { ScrollArea } from "../ui";
import {
  drawBaseMap,
  drawBaseMapCell,
  drawCombatClearingOverlay,
  drawCoordinateLabels,
  drawHover,
  drawMapRecords,
  drawPaintCursor,
  drawMapVisibilityPreview,
  drawRandomRectangles,
  drawRegionSelection,
  drawSecretTileOverlay,
  drawSelectedCell,
  drawStampCursor,
  drawSmartTerrainMask,
  drawSmartTerrainPreview,
  drawTileValueCell,
  drawTriggers,
  syncCanvasSize
} from "../map/drawMapCanvas";
import { MapStamp } from "../map/superTileStamps";
import { MapKeyHud } from "./MapCanvasHud";

const BASE_CANVAS_SIZE = 900;
const COORDINATE_GUTTER_CELLS = 1;

type RegionContextMenuState = {
  x: number;
  y: number;
  cell: { x: number; y: number };
  region: MapRegionSelection;
  error?: string;
};

type StampLibraryTarget = "project" | "global";

export function RealmzMapCanvas({
  project,
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
  selectedSuperTileStamp,
  dungeonDrawFlags,
  zoom,
  smoothTiles,
  viewOptions,
  tileAttributes,
  showRandomRects,
  showMapRecords,
  previewMode,
  previewFocalPoint,
  focusTarget,
  selectedEntity,
  selectedCell,
  selectedRegion,
  smartBrushMask,
  smartBrushPlan,
  smartBrushDrawing,
  globalMapStamps,
  onSelectCell,
  onSetSelectedRegion,
  onClearSelection,
  onSetSmartBrushMask,
  onCommitSmartBrushMaskStep,
  onSetSmartBrushDrawing,
  onSampleTile,
  onSelectEntity,
  onBeginPaintStroke,
  onApplyCommand,
  onSetGlobalMapStamps,
  onSelectSuperTileStamp,
  onCommitPaintStroke,
  onCancelPaintStroke
}: {
  project: Project | null;
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
  selectedSuperTileStamp: MapStamp | null;
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  zoom: number;
  smoothTiles: boolean;
  viewOptions: MapViewOptions;
  tileAttributes: TileAttributeProfile[];
  showRandomRects: boolean;
  showMapRecords: boolean;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  focusTarget: MapFocusTarget | null;
  selectedEntity: SelectedEntity | null;
  selectedCell: { x: number; y: number; tile: number } | null;
  selectedRegion: MapRegionSelection | null;
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushPlan: SmartBrushPlan | null;
  smartBrushDrawing: boolean;
  globalMapStamps: CustomMapStamp[];
  onSelectCell: (cell: { x: number; y: number; tile: number } | null) => void;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  onClearSelection: () => void;
  onSetSmartBrushMask: (mask: SmartBrushMaskCell[]) => void;
  onCommitSmartBrushMaskStep: (before: SmartBrushMaskCell[], after: SmartBrushMaskCell[]) => void;
  onSetSmartBrushDrawing: (drawing: boolean) => void;
  onSampleTile: (tile: number) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onSetGlobalMapStamps: (stamps: CustomMapStamp[]) => void;
  onSelectSuperTileStamp: (stampId: string) => void;
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
  const [regionContextMenu, setRegionContextMenu] = useState<RegionContextMenuState | null>(null);
  const [stampLibraryTarget, setStampLibraryTarget] = useState<StampLibraryTarget>("project");
  const tileRevisionRef = useRef(0);
  const tileReferenceRef = useRef(map.tiles);
  if (tileReferenceRef.current !== map.tiles) {
    tileReferenceRef.current = map.tiles;
    tileRevisionRef.current += 1;
  }
  const setHudNode = useCallback((node: HTMLDivElement | null) => {
    hudRef.current = node;
  }, []);
  const contextStampRegion = regionContextMenu?.region ?? selectedRegion;
  const selectedRegionSize = contextStampRegion
    ? {
        width: Math.abs(contextStampRegion.right - contextStampRegion.left) + 1,
        height: Math.abs(contextStampRegion.bottom - contextStampRegion.top) + 1
      }
    : null;
  const createStampFromSelection = useCallback(() => {
    if (!contextStampRegion) return;
    const existingCount = stampLibraryTarget === "project"
      ? project?.editorMetadata?.mapStamps?.length ?? 0
      : globalMapStamps.length;
    const fallbackName = `Stamp ${existingCount + 1}`;
    const name = window.prompt("Name this map stamp", fallbackName)?.trim();
    if (!name) return;
    const stamp = captureMapStampFromRegion(map, contextStampRegion, tileset, name, createMapStampId(name));
    if (!stamp) {
      setRegionContextMenu((current) => current
        ? { ...current, error: "Selected region has no stampable tiles." }
        : current);
      return;
    }
    if (stampLibraryTarget === "project") {
      if (!project) {
        setRegionContextMenu((current) => current ? { ...current, error: "Open a project before creating a project stamp." } : current);
        return;
      }
      onApplyCommand({
        kind: "createMapStamp",
        label: `Create stamp ${stamp.name}`,
        id: stamp.id,
        name: stamp.name,
        width: stamp.width,
        height: stamp.height,
        cells: stamp.cells
      });
    } else {
      onSetGlobalMapStamps(normalizeMapStamps([...globalMapStamps, stamp]));
    }
    onSelectSuperTileStamp(`${stampLibraryTarget}:${stamp.id}`);
    setRegionContextMenu(null);
  }, [contextStampRegion, globalMapStamps, map, onApplyCommand, onSelectSuperTileStamp, onSetGlobalMapStamps, project, stampLibraryTarget, tileset]);

  useEffect(() => {
    if (!regionContextMenu) return;
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-map-context-menu]")) return;
      setRegionContextMenu(null);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setRegionContextMenu(null);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [regionContextMenu]);

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

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !focusTarget || focusTarget.kind !== "cell" || focusTarget.mapId !== map.id) return;
    const cellSize = mapCssSize / MAP_CELLS;
    const centerX = coordinateGutterCss + (focusTarget.x + 0.5) * cellSize;
    const centerY = coordinateGutterCss + (focusTarget.y + 0.5) * cellSize;
    wrap.scrollTo({
      left: clampScroll(centerX - wrap.clientWidth / 2, wrap.scrollWidth - wrap.clientWidth),
      top: clampScroll(centerY - wrap.clientHeight / 2, wrap.scrollHeight - wrap.clientHeight),
      behavior: "smooth"
    });
  }, [
    focusTarget,
    focusTarget?.kind,
    focusTarget?.mapId,
    focusTarget?.nonce,
    map.id,
    mapCssSize,
    coordinateGutterCss
  ]);

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
    drawTileValueCell(ctx, { tile: change.to, x: change.x, y: change.y, atlas, icons, viewOptions, cell: layout.cell, allowIconFallback: map.levelType !== "dungeon" });
    ctx.restore();
  }, [atlas, canvasCssSize, icons, map.levelType, smoothTiles, viewOptions]);
  const resetPaintPreview = useCallback(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;
    const size = syncCanvasSize(canvas, canvasCssSize);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawBaseMapLayer(ctx, { map, atlas, icons, smoothTiles, viewOptions, size });
    baseRenderRef.current = baseRenderSnapshot({ map, atlas, icons, smoothTiles, viewOptions, size });
  }, [atlas, canvasCssSize, icons, map, smoothTiles, viewOptions]);
  const { hover, hoverTarget, paintCursor, stampCursor, regionPreview, overlayHandlers } = useMapInteractions({
    map,
    activeTool,
    paintMode,
    paintVariation,
    activePaintGroupId,
    variationTiles,
    selectedTile,
    selectedSuperTileStamp,
    dungeonDrawFlags,
    selectedTileset: tileset,
    triggers,
    randomLevel,
    mapRecords,
    showRandomRects,
    showMapRecords,
    selectedEntity,
    selectedCell,
    selectedRegion,
    smartBrushMask,
    smartBrushDrawing,
    overlayCanvasRef,
    wrapRef,
    onSelectCell,
    onSetSelectedRegion,
    onClearSelection,
    onSetSmartBrushMask,
    onCommitSmartBrushMaskStep,
    onSetSmartBrushDrawing,
    onSampleTile,
    onSelectEntity,
    onBeginPaintStroke,
    onApplyCommand,
    onCommitPaintStroke,
    onCancelPaintStroke,
    onOpenRegionContextMenu: (menu) => setRegionContextMenu({ ...menu }),
    onPreviewPaintChange: previewPaintChange,
    onResetPaintPreview: resetPaintPreview
  });
  const terrainOverlayDependency = useMemo(
    () => `${viewOptions.showSecretOverlays ? secretOverlaySignature(map) : "secrets-off"}:${viewOptions.showCombatClearingOverlays ? combatClearingOverlaySignature(map) : "combat-clearing-off"}`,
    [map.tiles, map.levelType, map.render.mode, viewOptions.showSecretOverlays, viewOptions.showCombatClearingOverlays]
  );
  const overlayMapDependency = previewMode !== "off" ? map : `${map.id}:${terrainOverlayDependency}`;

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
    if (viewOptions.showCombatClearingOverlays) drawCombatClearingOverlay(ctx, map, cell);
    if (previewMode !== "off") drawMapVisibilityPreview(ctx, map, tileset, tileAttributes, cell, previewMode, previewFocalPoint);
    drawTriggers(ctx, triggers, selectedEntity, cell);
    if (showMapRecords) drawMapRecords(ctx, map, mapRecords, selectedEntity, cell);
    if (selectedRegion) drawRegionSelection(ctx, selectedRegion, cell, "selected");
    if (smartBrushDrawing && smartBrushMask.length > 0) {
      drawSmartTerrainMask(ctx, smartBrushMask, cell);
    } else if (smartBrushPlan && (smartBrushPlan.cells.length > 0 || smartBrushPlan.skipped.length > 0)) {
      drawSmartTerrainPreview(ctx, { cells: smartBrushPlan.cells, skipped: smartBrushPlan.skipped, atlas, icons, viewOptions, cell });
    }
    if (selectedCell && !selectedRegion && !paintCursor && !stampCursor) drawSelectedCell(ctx, selectedCell, cell);
    if (regionPreview) drawRegionSelection(ctx, regionPreview, cell, "preview");
    if (paintCursor) drawPaintCursor(ctx, { cursor: paintCursor, atlas, icons, viewOptions, cell, allowIconFallback: map.levelType !== "dungeon" });
    else if (stampCursor) drawStampCursor(ctx, { cursor: stampCursor, atlas, icons, viewOptions, cell });
    else if (hover) drawHover(ctx, hover, cell);
  }, [
    triggers,
    randomLevel,
    mapRecords,
    hover,
    paintCursor,
    stampCursor,
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
    viewOptions.showCombatClearingOverlays,
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

  const regionMenuStyle = regionContextMenu
    ? {
        left: `${Math.max(8, Math.min(regionContextMenu.x, window.innerWidth - 300))}px`,
        top: `${Math.max(8, Math.min(regionContextMenu.y, window.innerHeight - 190))}px`
      }
    : undefined;

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
          data-map-id={map.id}
          data-map-tiles-revision={tileRevisionRef.current}
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
      {regionContextMenu && selectedRegionSize ? (
        <div
          className="map-canvas-context-menu"
          data-map-context-menu
          role="menu"
          style={regionMenuStyle}
        >
          <div className="map-canvas-context-menu-header">
            <strong>{selectedRegionSize.width === 1 && selectedRegionSize.height === 1 ? "Selected Tile" : "Selected Region"}</strong>
            <span>{selectedRegionSize.width}x{selectedRegionSize.height}</span>
          </div>
          <label className="map-canvas-context-menu-field">
            <span>Stamp Library</span>
            <select
              value={stampLibraryTarget}
              onChange={(event) => setStampLibraryTarget(event.currentTarget.value as StampLibraryTarget)}
            >
              <option value="project" disabled={!project}>Project Stamps</option>
              <option value="global">Global Stamps</option>
            </select>
          </label>
          <button
            className="context-action-button"
            type="button"
            disabled={stampLibraryTarget === "project" && !project}
            onClick={createStampFromSelection}
          >
            Send To Stamp
          </button>
          {regionContextMenu.error ? <p className="map-canvas-context-menu-error">{regionContextMenu.error}</p> : null}
        </div>
      ) : null}
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
    if (showsHiddenWalkableOverlay(value, map)) marker |= 1;
    if (hasSecretMarkerTile(value, map)) marker |= 2;
    hash = Math.imul(hash ^ marker, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function combatClearingOverlaySignature(map: MapEntity) {
  let hash = map.levelType === "dungeon" || map.render.mode === "dungeon-top-down" ? 0x811c9dc5 : 0x45d9f3b;
  for (const value of map.tiles) {
    hash = Math.imul(hash ^ (showsCombatClearingOverlay(value, map) ? 1 : 0), 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cursorForTool(tool: EditorTool, paintMode: MapPaintMode, target: MapHitTarget | null) {
  if (tool === "pan") return "grab";
  if (tool === "paint" && paintMode === "smart") return "crosshair";
  if (tool === "paint") return "none";
  if (tool === "stamp") return "copy";
  if (tool === "dungeon-draw") return "none";
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
