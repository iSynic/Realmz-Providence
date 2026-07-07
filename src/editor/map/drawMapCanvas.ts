import { AtlasEntry, IconEntry, MapEntity, MapPreviewFocalPoint, MapPreviewMode, MapRegionSelection, MapViewOptions, RandomLevel, SelectedEntity, SemanticEntity, SmartBrushMaskCell, SmartBrushPreviewCell, TileAttributeProfile, TilesetAsset, TriggerRecord } from "../types";
import {
  clampCell,
  MAP_CELLS,
  mapRecordTerrainFootprint,
  numberSummary,
  randomRectCellBounds,
  randomRectEntityId,
  tileValueAt
} from "./geometry";
import { hasSecretMarkerTile, isSecretWalkableTile } from "./secrets";
import { triggerEntityId } from "../utils";
import { drawTileSprite, tileColor } from "../components/TileSprite";
import { classifyTileValue } from "./tileMetadata";
import { mapOverlaySprite } from "./mapOverlaySprites";
import type { MapStampPreviewCell } from "./superTileStamps";

export function drawBaseMap(
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
  const cell = size / MAP_CELLS;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = smoothTiles;
  ctx.imageSmoothingQuality = smoothTiles ? "high" : "low";

  for (let y = 0; y < MAP_CELLS; y += 1) {
    for (let x = 0; x < MAP_CELLS; x += 1) {
      drawBaseMapCell(ctx, { map, x, y, atlas, icons, viewOptions, cell });
    }
  }
}

export function drawBaseMapCell(
  ctx: CanvasRenderingContext2D,
  {
    map,
    x,
    y,
    atlas,
    icons,
    viewOptions,
    cell
  }: {
    map: MapEntity;
    x: number;
    y: number;
    atlas: AtlasEntry | null;
    icons: Record<number, IconEntry>;
    viewOptions: MapViewOptions;
    cell: number;
  }
) {
  const tile = tileValueAt(map, x, y);
  drawTileValueCell(ctx, { tile, x, y, atlas, icons, viewOptions, cell });
}

export function drawTileValueCell(
  ctx: CanvasRenderingContext2D,
  {
    tile,
    x,
    y,
    atlas,
    icons,
    viewOptions,
    cell
  }: {
    tile: number;
    x: number;
    y: number;
    atlas: AtlasEntry | null;
    icons: Record<number, IconEntry>;
    viewOptions: MapViewOptions;
    cell: number;
  }
) {
  const left = x * cell;
  const top = y * cell;
  const size = Math.ceil(cell);
  const drewSprite = viewOptions.showRealTiles
    ? drawTileSprite(ctx, atlas, tile, left, top, size, size, icons)
    : false;
  if (!drewSprite) {
    ctx.fillStyle = tileColor(tile);
    ctx.fillRect(left, top, size, size);
  }
}

export function drawSmartTerrainPreview(
  ctx: CanvasRenderingContext2D,
  {
    cells,
    skipped,
    atlas,
    icons,
    viewOptions,
    cell
  }: {
    cells: SmartBrushPreviewCell[];
    skipped: SmartBrushMaskCell[];
    atlas: AtlasEntry | null;
    icons: Record<number, IconEntry>;
    viewOptions: MapViewOptions;
    cell: number;
  }
) {
  ctx.save();
  ctx.globalAlpha = 0.86;
  for (const preview of cells) {
    drawTileValueCell(ctx, { tile: preview.to, x: preview.x, y: preview.y, atlas, icons, viewOptions, cell });
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(111, 211, 255, 0.96)";
  ctx.lineWidth = Math.max(1, cell * 0.09);
  for (const preview of cells) {
    ctx.strokeRect(preview.x * cell + 1, preview.y * cell + 1, cell - 2, cell - 2);
  }
  ctx.fillStyle = "rgba(9, 13, 18, 0.34)";
  ctx.strokeStyle = "rgba(255, 212, 122, 0.82)";
  ctx.lineWidth = Math.max(1, cell * 0.07);
  for (const skip of skipped) {
    ctx.fillRect(skip.x * cell, skip.y * cell, cell, cell);
    ctx.strokeRect(skip.x * cell + 1, skip.y * cell + 1, cell - 2, cell - 2);
  }
  ctx.restore();
}

export function drawSmartTerrainMask(
  ctx: CanvasRenderingContext2D,
  mask: SmartBrushMaskCell[],
  cell: number
) {
  ctx.save();
  ctx.fillStyle = "rgba(111, 211, 255, 0.18)";
  ctx.strokeStyle = "rgba(111, 211, 255, 0.72)";
  ctx.lineWidth = Math.max(1, cell * 0.07);
  for (const maskCell of mask) {
    ctx.fillRect(maskCell.x * cell, maskCell.y * cell, cell, cell);
    ctx.strokeRect(maskCell.x * cell + 1, maskCell.y * cell + 1, cell - 2, cell - 2);
  }
  ctx.restore();
}

export function syncCanvasSize(canvas: HTMLCanvasElement, cssSize: number) {
  const backingSize = canvasBackingSize(cssSize);
  if (canvas.width !== backingSize || canvas.height !== backingSize) {
    canvas.width = backingSize;
    canvas.height = backingSize;
  }
  return backingSize;
}

function canvasBackingSize(cssSize: number) {
  const deviceRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  return Math.max(900, Math.min(4096, Math.round(cssSize * deviceRatio)));
}

export function drawCoordinateLabels(ctx: CanvasRenderingContext2D, cell: number, size: number, gutter = 0) {
  if (cell < 9) return;
  ctx.save();
  ctx.font = `${Math.max(9, Math.min(18, cell * 0.38))}px monospace`;
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(4, 7, 10, 0.78)";
  if (gutter > 0) {
    ctx.fillRect(0, 0, size, gutter);
    ctx.fillRect(0, size - gutter, size, gutter);
    ctx.fillRect(0, 0, gutter, size);
    ctx.fillRect(size - gutter, 0, gutter, size);
  } else {
    ctx.fillRect(0, 0, size, Math.max(18, cell * 0.72));
    ctx.fillRect(0, 0, Math.max(28, cell * 1.05), size);
  }
  ctx.fillStyle = "rgba(219, 235, 248, 0.82)";
  for (let value = 0; value < MAP_CELLS; value += 10) {
    const label = String(value);
    if (gutter > 0) {
      ctx.fillText(label, gutter + value * cell + 3, Math.max(2, gutter * 0.16));
      ctx.fillText(label, Math.max(2, gutter * 0.16), gutter + value * cell + 3);
    } else {
      ctx.fillText(label, value * cell + 3, 3);
      ctx.fillText(label, 3, value * cell + 3);
    }
  }
  ctx.restore();
}

export function drawRandomRectangles(
  ctx: CanvasRenderingContext2D,
  map: MapEntity,
  randomLevel: RandomLevel,
  selectedEntity: SelectedEntity | null,
  cell: number
) {
  for (const rect of randomLevel.rects) {
    const { left, top, width, height } = randomRectCellBounds(rect);
    if (width <= 0 || height <= 0) continue;
    const isSelected = selectedEntity?.id === randomRectEntityId(map, rect.rectIndex);
    if (isSelected) {
      ctx.fillStyle = "rgba(244, 190, 92, 0.14)";
      ctx.fillRect(left * cell, top * cell, width * cell, height * cell);
    }
    ctx.strokeStyle = isSelected ? "#ffd47a" : "rgba(244, 190, 92, 0.72)";
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.strokeRect(left * cell + 1, top * cell + 1, width * cell - 2, height * cell - 2);
  }
}

export function drawTriggers(
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

export function drawMapRecords(
  ctx: CanvasRenderingContext2D,
  map: MapEntity,
  mapRecords: SemanticEntity[],
  selectedEntity: SelectedEntity | null,
  cell: number
) {
  for (const record of mapRecords) {
    const footprint = mapRecordTerrainFootprint(record, map);
    if (!footprint) continue;
    const x = numberSummary(record, "startX");
    const y = numberSummary(record, "startY");
    if (x == null || y == null || x < 0 || y < 0 || x >= MAP_CELLS || y >= MAP_CELLS) continue;
    const isSelected = selectedEntity?.id === record.id;
    ctx.save();
    ctx.fillStyle = isSelected ? "rgba(255, 212, 122, 0.13)" : "rgba(82, 168, 255, 0.12)";
    ctx.strokeStyle = isSelected ? "rgba(255, 212, 122, 0.9)" : "rgba(82, 168, 255, 0.72)";
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.setLineDash([Math.max(3, cell * 0.32), Math.max(2, cell * 0.22)]);
    ctx.fillRect(footprint.left * cell, footprint.top * cell, footprint.width * cell, footprint.height * cell);
    ctx.strokeRect(
      footprint.left * cell + 0.5,
      footprint.top * cell + 0.5,
      footprint.width * cell - 1,
      footprint.height * cell - 1
    );
    ctx.setLineDash([]);
    ctx.fillStyle = "#1d2530";
    ctx.strokeStyle = isSelected ? "#ffd47a" : "#eff6ff";
    ctx.lineWidth = isSelected ? 3 : 2;
    ctx.beginPath();
    ctx.rect(x * cell + cell * 0.25, y * cell + cell * 0.25, cell * 0.5, cell * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

const whiteKeyedOverlayCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

export function drawSecretTileOverlay(ctx: CanvasRenderingContext2D, map: MapEntity, cell: number, icons: Record<number, IconEntry> = {}) {
  ctx.save();
  for (let y = 0; y < MAP_CELLS; y += 1) {
    for (let x = 0; x < MAP_CELLS; x += 1) {
      const value = tileValueAt(map, x, y);
      if (isSecretWalkableTile(value, map)) {
        drawOfficialPathMarker(ctx, x, y, cell);
      }
      if (hasSecretMarkerTile(value, map)) {
        drawSecretMarker(ctx, x, y, cell, icons);
      }
    }
  }
  ctx.restore();
}

function drawOfficialPathMarker(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number) {
  const sprite = mapOverlaySprite("path");
  const left = x * cell;
  const top = y * cell;
  const inset = Math.max(1, cell * 0.08);
  if (sprite.image?.complete) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.imageSmoothingEnabled = false;
    drawWhiteKeyedOverlayImage(ctx, sprite.image, left + inset, top + inset, cell - inset * 2, cell - inset * 2);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.strokeStyle = "rgba(255, 60, 36, 0.86)";
  ctx.lineWidth = Math.max(2, cell * 0.16);
  ctx.beginPath();
  ctx.moveTo(left + cell * 0.5, top + cell * 0.18);
  ctx.lineTo(left + cell * 0.5, top + cell * 0.82);
  ctx.moveTo(left + cell * 0.18, top + cell * 0.5);
  ctx.lineTo(left + cell * 0.82, top + cell * 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawSecretMarker(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, icons: Record<number, IconEntry>) {
  const left = x * cell;
  const top = y * cell;
  const icon = mapOverlaySprite("secret").image;
  if (icon?.complete) {
    const inset = Math.max(1, cell * 0.08);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.imageSmoothingEnabled = false;
    drawWhiteKeyedOverlayImage(ctx, icon, left + inset, top + inset, cell - inset * 2, cell - inset * 2);
    ctx.restore();
    return;
  }
  const referenceIcon = icons[139]?.image;
  if (referenceIcon?.complete) {
    const inset = Math.max(1, cell * 0.08);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.imageSmoothingEnabled = false;
    drawWhiteKeyedOverlayImage(ctx, referenceIcon, left + inset, top + inset, cell - inset * 2, cell - inset * 2);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.font = `700 ${Math.max(8, cell * 0.68)}px monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, cell * 0.13);
  ctx.strokeStyle = "rgba(8, 10, 13, 0.86)";
  ctx.fillStyle = "#ff523b";
  ctx.strokeText("S", left + cell * 0.5, top + cell * 0.55);
  ctx.fillText("S", left + cell * 0.5, top + cell * 0.55);
  ctx.restore();
}

function drawWhiteKeyedOverlayImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const keyed = whiteKeyedOverlay(image);
  ctx.drawImage(keyed, x, y, width, height);
}

function whiteKeyedOverlay(image: HTMLImageElement) {
  const cached = whiteKeyedOverlayCache.get(image);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    if (red >= 238 && green >= 238 && blue >= 238) {
      data[index + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  whiteKeyedOverlayCache.set(image, canvas);
  return canvas;
}

export function drawMapVisibilityPreview(
  ctx: CanvasRenderingContext2D,
  map: MapEntity,
  tileset: TilesetAsset | null,
  tileAttributes: TileAttributeProfile[],
  cell: number,
  mode: MapPreviewMode,
  focalPoint: MapPreviewFocalPoint
) {
  const focusX = clampCell(focalPoint.x);
  const focusY = clampCell(focalPoint.y);
  const radius = 9;
  ctx.save();
  if (mode === "darkness" || mode === "both") {
    ctx.fillStyle = "rgba(3, 6, 9, 0.42)";
    ctx.fillRect(0, 0, MAP_CELLS * cell, MAP_CELLS * cell);
  }
  if (mode === "los" || mode === "both") {
    for (let y = 0; y < MAP_CELLS; y += 1) {
      for (let x = 0; x < MAP_CELLS; x += 1) {
        const distance = Math.abs(x - focusX) + Math.abs(y - focusY);
        const tile = tileValueAt(map, x, y);
        const blocksLos = classifyTileValue(tile, tileset, tileAttributes).attributes?.flags.includes("blocks-los") ?? false;
        if (distance > radius) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.46)";
          ctx.fillRect(x * cell, y * cell, cell, cell);
        } else if (blocksLos) {
          ctx.fillStyle = "rgba(250, 204, 21, 0.20)";
          ctx.fillRect(x * cell, y * cell, cell, cell);
          ctx.strokeStyle = "rgba(250, 204, 21, 0.66)";
          ctx.strokeRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
        }
      }
    }
  }
  ctx.strokeStyle = "#facc15";
  ctx.lineWidth = Math.max(2, cell * 0.12);
  ctx.beginPath();
  ctx.arc((focusX + 0.5) * cell, (focusY + 0.5) * cell, Math.max(3, cell * 0.28), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawHover(ctx: CanvasRenderingContext2D, hover: { x: number; y: number }, cell: number) {
  ctx.strokeStyle = "#f3c869";
  ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.16));
  ctx.strokeRect(hover.x * cell + 1, hover.y * cell + 1, cell - 2, cell - 2);
}

export function drawPaintCursor(
  ctx: CanvasRenderingContext2D,
  {
    cursor,
    atlas,
    icons,
    viewOptions,
    cell
  }: {
    cursor: { x: number; y: number; tile: number };
    atlas: AtlasEntry | null;
    icons: Record<number, IconEntry>;
    viewOptions: MapViewOptions;
    cell: number;
  }
) {
  const left = cursor.x * cell;
  const top = cursor.y * cell;
  ctx.save();
  ctx.globalAlpha = 0.92;
  drawTileValueCell(ctx, { tile: cursor.tile, x: cursor.x, y: cursor.y, atlas, icons, viewOptions, cell });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.14));
  ctx.strokeRect(left + 1, top + 1, cell - 2, cell - 2);
  ctx.strokeStyle = "rgba(5, 7, 10, 0.75)";
  ctx.lineWidth = Math.max(1, Math.min(3, cell * 0.07));
  ctx.strokeRect(left + 4, top + 4, Math.max(1, cell - 8), Math.max(1, cell - 8));
  ctx.restore();
}

export function drawStampCursor(
  ctx: CanvasRenderingContext2D,
  {
    cursor,
    atlas,
    icons,
    viewOptions,
    cell
  }: {
    cursor: MapStampPreviewCell[];
    atlas: AtlasEntry | null;
    icons: Record<number, IconEntry>;
    viewOptions: MapViewOptions;
    cell: number;
  }
) {
  if (cursor.length === 0) return;
  const left = Math.min(...cursor.map((preview) => preview.x)) * cell;
  const top = Math.min(...cursor.map((preview) => preview.y)) * cell;
  const right = (Math.max(...cursor.map((preview) => preview.x)) + 1) * cell;
  const bottom = (Math.max(...cursor.map((preview) => preview.y)) + 1) * cell;
  ctx.save();
  const transparentCells = cursor.filter((preview) => !preview.occupied);
  if (transparentCells.length > 0) {
    ctx.fillStyle = "rgba(111, 211, 255, 0.12)";
    ctx.strokeStyle = "rgba(111, 211, 255, 0.36)";
    ctx.lineWidth = Math.max(1, Math.min(2, cell * 0.05));
    for (const preview of transparentCells) {
      const x = preview.x * cell;
      const y = preview.y * cell;
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeRect(x + 1, y + 1, Math.max(1, cell - 2), Math.max(1, cell - 2));
    }
  }
  ctx.globalAlpha = 0.88;
  for (const preview of cursor) {
    if (preview.tile == null) continue;
    drawTileValueCell(ctx, { tile: preview.tile, x: preview.x, y: preview.y, atlas, icons, viewOptions, cell });
  }
  ctx.globalAlpha = 1;
  const anchor = cursor.find((preview) => preview.anchor);
  if (anchor) {
    ctx.fillStyle = "rgba(248, 250, 252, 0.12)";
    ctx.fillRect(anchor.x * cell, anchor.y * cell, cell, cell);
    ctx.strokeStyle = "#ffd47a";
    ctx.lineWidth = Math.max(2, Math.min(4, cell * 0.11));
    ctx.strokeRect(anchor.x * cell + 2, anchor.y * cell + 2, Math.max(1, cell - 4), Math.max(1, cell - 4));
  }
  ctx.strokeStyle = "#f8fafc";
  ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.14));
  ctx.strokeRect(left + 1, top + 1, Math.max(1, right - left - 2), Math.max(1, bottom - top - 2));
  ctx.strokeStyle = "rgba(5, 7, 10, 0.75)";
  ctx.lineWidth = Math.max(1, Math.min(3, cell * 0.07));
  ctx.strokeRect(left + 4, top + 4, Math.max(1, right - left - 8), Math.max(1, bottom - top - 8));
  ctx.restore();
}

export function drawSelectedCell(ctx: CanvasRenderingContext2D, selectedCell: { x: number; y: number }, cell: number) {
  const left = selectedCell.x * cell;
  const top = selectedCell.y * cell;
  const inset = Math.max(2, cell * 0.1);
  const arm = Math.max(6, cell * 0.32);
  const lineWidth = Math.max(2, Math.min(5, cell * 0.13));

  ctx.save();
  drawSelectionCorners(ctx, left, top, cell, inset, arm, lineWidth + 2, "rgba(2, 8, 12, 0.78)");
  drawSelectionCorners(ctx, left, top, cell, inset, arm, lineWidth, "#80eaff");
  ctx.restore();
}

function drawSelectionCorners(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  cell: number,
  inset: number,
  arm: number,
  lineWidth: number,
  strokeStyle: string
) {
  const right = left + cell - inset;
  const bottom = top + cell - inset;
  const x0 = left + inset;
  const y0 = top + inset;

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(x0, y0 + arm);
  ctx.lineTo(x0, y0);
  ctx.lineTo(x0 + arm, y0);
  ctx.moveTo(right - arm, y0);
  ctx.lineTo(right, y0);
  ctx.lineTo(right, y0 + arm);
  ctx.moveTo(right, bottom - arm);
  ctx.lineTo(right, bottom);
  ctx.lineTo(right - arm, bottom);
  ctx.moveTo(x0 + arm, bottom);
  ctx.lineTo(x0, bottom);
  ctx.lineTo(x0, bottom - arm);
  ctx.stroke();
}

export function drawRegionSelection(
  ctx: CanvasRenderingContext2D,
  region: MapRegionSelection,
  cell: number,
  mode: "selected" | "preview" = "selected"
) {
  const left = Math.min(region.left, region.right);
  const top = Math.min(region.top, region.bottom);
  const width = Math.abs(region.right - region.left) + 1;
  const height = Math.abs(region.bottom - region.top) + 1;
  ctx.save();
  ctx.fillStyle = mode === "preview" ? "rgba(120, 215, 255, 0.16)" : "rgba(120, 215, 255, 0.11)";
  ctx.strokeStyle = mode === "preview" ? "#f3c869" : "#78d7ff";
  ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.13));
  ctx.setLineDash(mode === "preview" ? [] : [Math.max(6, cell * 0.38), Math.max(3, cell * 0.2)]);
  ctx.fillRect(left * cell, top * cell, width * cell, height * cell);
  ctx.strokeRect(left * cell + 1, top * cell + 1, width * cell - 2, height * cell - 2);
  ctx.restore();
}

export function triggerOverlayKind(trigger: TriggerRecord): "battle" | "encounter" | "map" | "quest" | "text" | "trigger" {
  const categories = new Set(trigger.actions.map((action) => action.category));
  if (categories.has("Combat") || categories.has("combat")) return "battle";
  if (categories.has("Encounter") || categories.has("encounter")) return "encounter";
  if (categories.has("Map") || categories.has("map")) return "map";
  if (categories.has("Text") || categories.has("ui_text")) return "text";
  if ([...categories].some((category) => ["Branch", "Quest", "Scenario", "Economy", "branch", "state", "time", "registration", "item_shop"].includes(category))) return "quest";
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
