import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
  clampCell,
  clampScroll,
  MAP_CELLS,
  numberSummary,
  randomRectEntityId,
  rectCenter,
  tileValueAt
} from "../map/geometry";
import { hasSecretMarkerTile, hasSecretPathTile, isSecretWalkableTile } from "../map/secrets";
import { useMapInteractions } from "../map/useMapInteractions";
import { triggerEntityId } from "../utils";
import { drawTileSprite, tileColor } from "./TileSprite";

const BASE_CANVAS_SIZE = 900;
const MAX_BACKING_CANVAS_SIZE = 4096;

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
    const cell = size / MAP_CELLS;
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = smoothTiles;
    ctx.imageSmoothingQuality = smoothTiles ? "high" : "low";

    for (let y = 0; y < MAP_CELLS; y += 1) {
      for (let x = 0; x < MAP_CELLS; x += 1) {
        const tile = tileValueAt(map, x, y);
        const drewSprite = viewOptions.showRealTiles
          ? drawTileSprite(ctx, atlas, tile, x * cell, y * cell, Math.ceil(cell), Math.ceil(cell), icons)
          : false;
        if (!drewSprite) {
          ctx.fillStyle = tileColor(tile);
          ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
        } else if (viewOptions.showDecodedColors) {
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = tileColor(tile);
          ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
          ctx.globalAlpha = 1;
        }
      }
    }

    drawGrid(ctx, cell, size);
    if (viewOptions.showRealmzCoordinates) drawCoordinateLabels(ctx, cell, size);
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
    <div className="room-canvas-wrap" ref={wrapRef}>
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
    </div>
  );
}

function cursorForTool(tool: EditorTool, target: MapHitTarget | null) {
  if (tool === "pan") return "grab";
  if (tool === "paint") return "crosshair";
  if (tool === "sample") return "copy";
  if (tool === "select" && target?.kind === "cell") return "grab";
  if (target && target.kind !== "cell") return "pointer";
  return "default";
}

function MapKeyHud({
  setHudRef,
  style,
  map,
  hover,
  triggers,
  randomLevel,
  mapRecords,
  activeTool,
  selectedTile,
  tilesetLabel
}: {
  setHudRef: (node: HTMLDivElement | null) => void;
  style: CSSProperties;
  map: MapEntity;
  hover: { x: number; y: number } | null;
  triggers: TriggerRecord[];
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  activeTool: EditorTool;
  selectedTile: number;
  tilesetLabel: string;
}) {
  const boxes = hover ? hoverBoxesAt(hover, triggers, randomLevel, mapRecords) : [];
  const raw = hover ? tileValueAt(map, hover.x, hover.y) : null;
  const secretTags = hover && raw != null ? secretHoverTags(raw, map) : [];
  const overlayCount = triggers.length + (randomLevel?.rects.length ?? 0) + mapRecords.length;
  return (
    <div className="map-key-hud" ref={setHudRef} style={style} aria-live="polite">
      <div className="map-key-title">
        {map.name} ({map.levelType} {map.index}) | {map.width} x {map.height} | {overlayCount} boxes
      </div>
      <div className="map-key-row">
        {hover ? (
          <>
            tile {hover.x},{hover.y} | raw {raw}
            {secretTags.length > 0 ? ` | ${secretTags.join(", ")}` : ""}
          </>
        ) : (
          "hover a tile for metadata"
        )}
      </div>
      {boxes.length > 0 && (
        <div className="map-key-row">
          {boxes.slice(0, 4).map((box) => (
            <div key={box}>{box}</div>
          ))}
          {boxes.length > 4 && <div>+ {boxes.length - 4} more</div>}
        </div>
      )}
      <div className="map-key-row subtle">
        {activeTool === "paint" ? `painting ${selectedTile}` : activeTool} | {tilesetLabel}
      </div>
      <div className="map-key-legend">
        <span><i className="map-key-swatch random" />random</span>
        <span><i className="map-key-swatch quest" />quest</span>
        <span><i className="map-key-swatch encounter" />encounter</span>
        <span><i className="map-key-swatch battle" />battle</span>
        <span><i className="map-key-swatch entrance" />entrance</span>
        <span><i className="map-key-swatch map" />map</span>
        <span><i className="map-key-swatch text" />text</span>
        <span><i className="map-key-swatch trigger" />trigger</span>
      </div>
    </div>
  );
}

function hoverBoxesAt(
  hover: { x: number; y: number },
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
) {
  const boxes: string[] = [];
  for (const rect of randomLevel?.rects ?? []) {
    const left = clampCell(rect.left);
    const top = clampCell(rect.top);
    const right = clampCell(rect.right);
    const bottom = clampCell(rect.bottom);
    if (hover.x >= left && hover.x <= right && hover.y >= top && hover.y <= bottom) {
      boxes.push(`Random encounter area R${rect.rectIndex} @ ${left},${top} - ${right},${bottom}`);
    }
  }
  for (const trigger of triggers) {
    if (trigger.coordinate?.x !== hover.x || trigger.coordinate.y !== hover.y) continue;
    const category = triggerOverlayLabel(trigger);
    boxes.push(`Action Point ${trigger.recordIndex} ${category} @ ${hover.x},${hover.y}`);
  }
  for (const record of mapRecords) {
    const x = numberSummary(record, "startX");
    const y = numberSummary(record, "startY");
    if (x === hover.x && y === hover.y) boxes.push(`${record.label} start @ ${hover.x},${hover.y}`);
  }
  return boxes.sort((a, b) => {
    const aRandom = a.startsWith("Random") ? 1 : 0;
    const bRandom = b.startsWith("Random") ? 1 : 0;
    return aRandom - bRandom || a.localeCompare(b);
  });
}

function triggerOverlayLabel(trigger: TriggerRecord) {
  return triggerOverlayKind(trigger);
}

function triggerOverlayKind(trigger: TriggerRecord): "battle" | "encounter" | "map" | "quest" | "text" | "trigger" {
  const categories = new Set(trigger.actions.map((action) => action.category));
  if (categories.has("combat")) return "battle";
  if (categories.has("encounter")) return "encounter";
  if (categories.has("map")) return "map";
  if (categories.has("ui_text")) return "text";
  if ([...categories].some((category) => ["branch", "state", "time", "registration", "item_shop"].includes(category))) return "quest";
  return "trigger";
}

function overlayKindColor(kind: "battle" | "encounter" | "map" | "quest" | "text" | "trigger") {
  const colors = {
    battle: "#f87171",
    encounter: "#9dcfff",
    map: "#38bdf8",
    quest: "#c084fc",
    text: "#eab308",
    trigger: "#cbd5e1"
  };
  return colors[kind];
}

function secretHoverTags(value: number, map: MapEntity) {
  const tags = [];
  if (hasSecretMarkerTile(value, map)) tags.push(map.levelType === "dungeon" ? "dungeon secret" : "secret marker");
  if (isSecretWalkableTile(value, map)) tags.push("hidden walkable tile");
  else if (hasSecretPathTile(value, map)) tags.push("encoded passability flag");
  return tags;
}

function syncCanvasSize(canvas: HTMLCanvasElement, cssSize: number) {
  const backingSize = canvasBackingSize(cssSize);
  if (canvas.width !== backingSize || canvas.height !== backingSize) {
    canvas.width = backingSize;
    canvas.height = backingSize;
  }
  return backingSize;
}

function canvasBackingSize(cssSize: number) {
  const deviceRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(BASE_CANVAS_SIZE, Math.min(MAX_BACKING_CANVAS_SIZE, Math.round(cssSize * deviceRatio)));
}

function drawGrid(ctx: CanvasRenderingContext2D, cell: number, size: number) {
  ctx.strokeStyle = "rgba(210, 220, 232, 0.13)";
  ctx.lineWidth = 0.5;
  for (let line = 0; line <= MAP_CELLS; line += 5) {
    ctx.beginPath();
    ctx.moveTo(line * cell, 0);
    ctx.lineTo(line * cell, size);
    ctx.moveTo(0, line * cell);
    ctx.lineTo(size, line * cell);
    ctx.stroke();
  }
}

function drawCoordinateLabels(ctx: CanvasRenderingContext2D, cell: number, size: number) {
  if (cell < 9) return;
  ctx.save();
  ctx.font = `${Math.max(9, Math.min(18, cell * 0.38))}px monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(4, 7, 10, 0.68)";
  ctx.fillRect(0, 0, size, Math.max(18, cell * 0.72));
  ctx.fillRect(0, 0, Math.max(28, cell * 1.05), size);
  ctx.fillStyle = "rgba(219, 235, 248, 0.82)";
  for (let value = 0; value < MAP_CELLS; value += 10) {
    ctx.fillText(String(value), value * cell + 3, 3);
    ctx.fillText(String(value), 3, value * cell + 3);
  }
  ctx.restore();
}

function drawRandomRectangles(
  ctx: CanvasRenderingContext2D,
  map: MapEntity,
  randomLevel: RandomLevel,
  selectedEntity: SelectedEntity | null,
  cell: number
) {
  for (const rect of randomLevel.rects) {
    const left = clampCell(rect.left);
    const top = clampCell(rect.top);
    const right = clampCell(rect.right);
    const bottom = clampCell(rect.bottom);
    if (right < left || bottom < top) continue;
    const isSelected = selectedEntity?.id === randomRectEntityId(map, rect.rectIndex);
    if (isSelected) {
      ctx.fillStyle = "rgba(244, 190, 92, 0.14)";
      ctx.fillRect(left * cell, top * cell, (right - left + 1) * cell, (bottom - top + 1) * cell);
    }
    ctx.strokeStyle = isSelected ? "#ffd47a" : "rgba(244, 190, 92, 0.72)";
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(left * cell + 1, top * cell + 1, (right - left + 1) * cell - 2, (bottom - top + 1) * cell - 2);
  }
}

function drawTriggers(
  ctx: CanvasRenderingContext2D,
  triggers: TriggerRecord[],
  selectedEntity: SelectedEntity | null,
  cell: number
) {
  for (const trigger of triggers) {
    if (!trigger.coordinate) continue;
    const id = triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source);
    const isSelected = selectedEntity?.id === id;
    const primary = triggerOverlayKind(trigger);
    const hasUnknown = trigger.actions.some((action) => action.category === "unknown");
    drawActionPointMarker(ctx, trigger.coordinate.x, trigger.coordinate.y, cell, overlayKindColor(primary), isSelected, hasUnknown);
  }
}

function drawActionPointMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  fill: string,
  isSelected: boolean,
  hasUnknown: boolean
) {
  const centerX = x * cell + cell / 2;
  const centerY = y * cell + cell / 2;
  const radius = Math.max(3, cell * 0.34);

  ctx.save();
  ctx.globalAlpha = isSelected ? 1 : hasUnknown ? 0.95 : 0.82;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX + radius, centerY);
  ctx.lineTo(centerX, centerY + radius);
  ctx.lineTo(centerX - radius, centerY);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = Math.max(0, cell * 0.12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isSelected ? "#ffd47a" : hasUnknown ? "#eff6ff" : "rgba(7, 10, 14, 0.9)";
  ctx.lineWidth = isSelected ? Math.max(2, cell * 0.13) : Math.max(1, cell * 0.08);
  ctx.stroke();

  if (cell >= 12) {
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, Math.max(1.5, cell * 0.08), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8, 12, 16, 0.78)";
    ctx.fill();
  }
  ctx.restore();
}

function drawMapRecords(
  ctx: CanvasRenderingContext2D,
  mapRecords: SemanticEntity[],
  selectedEntity: SelectedEntity | null,
  cell: number
) {
  for (const record of mapRecords) {
    const x = numberSummary(record, "startX");
    const y = numberSummary(record, "startY");
    if (x == null || y == null || x < 0 || y < 0 || x >= MAP_CELLS || y >= MAP_CELLS) continue;
    const isSelected = selectedEntity?.id === record.id;
    ctx.fillStyle = "#1d2530";
    ctx.strokeStyle = isSelected ? "#ffd47a" : "#eff6ff";
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.rect(x * cell + cell * 0.25, y * cell + cell * 0.25, cell * 0.5, cell * 0.5);
    ctx.fill();
    ctx.stroke();
  }
}

function drawSecretTileOverlay(ctx: CanvasRenderingContext2D, map: MapEntity, cell: number) {
  ctx.save();
  ctx.fillStyle = "rgba(217, 54, 35, 0.34)";
  ctx.strokeStyle = "rgba(255, 132, 92, 0.75)";
  ctx.lineWidth = Math.max(1, Math.min(2, cell * 0.07));
  ctx.font = `${Math.max(8, cell * 0.68)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let y = 0; y < MAP_CELLS; y += 1) {
    for (let x = 0; x < MAP_CELLS; x += 1) {
      const value = tileValueAt(map, x, y);
      if (isSecretWalkableTile(value, map)) {
        ctx.fillRect(x * cell, y * cell, cell, cell);
        ctx.strokeRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
      }
      if (hasSecretMarkerTile(value, map)) {
        ctx.lineWidth = Math.max(2, cell * 0.13);
        ctx.strokeStyle = "rgba(8, 10, 13, 0.78)";
        ctx.fillStyle = "#ff523b";
        ctx.strokeText("S", (x + 0.5) * cell, (y + 0.55) * cell);
        ctx.fillText("S", (x + 0.5) * cell, (y + 0.55) * cell);
        ctx.fillStyle = "rgba(217, 54, 35, 0.34)";
        ctx.strokeStyle = "rgba(255, 132, 92, 0.75)";
      }
    }
  }
  ctx.restore();
}

function drawHover(ctx: CanvasRenderingContext2D, hover: { x: number; y: number }, cell: number) {
  ctx.strokeStyle = "#f3c869";
  ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.16));
  ctx.strokeRect(hover.x * cell + 1, hover.y * cell + 1, cell - 2, cell - 2);
}

function drawSelectedCell(ctx: CanvasRenderingContext2D, selectedCell: { x: number; y: number }, cell: number) {
  const inset = Math.max(2, cell * 0.12);
  ctx.save();
  ctx.strokeStyle = "#78d7ff";
  ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.14));
  ctx.setLineDash([Math.max(4, cell * 0.34), Math.max(3, cell * 0.2)]);
  ctx.strokeRect(selectedCell.x * cell + inset, selectedCell.y * cell + inset, cell - inset * 2, cell - inset * 2);
  ctx.restore();
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
