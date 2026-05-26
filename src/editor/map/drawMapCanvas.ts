import { AtlasEntry, IconEntry, MapEntity, MapRegionSelection, MapViewOptions, RandomLevel, SelectedEntity, SemanticEntity, TriggerRecord } from "../types";
import {
  clampCell,
  MAP_CELLS,
  numberSummary,
  randomRectEntityId,
  tileValueAt
} from "./geometry";
import { hasSecretMarkerTile, isSecretWalkableTile } from "./secrets";
import { triggerEntityId } from "../utils";
import { drawTileSprite, tileColor } from "../components/TileSprite";

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
      const tile = tileValueAt(map, x, y);
      const drewSprite = viewOptions.showRealTiles
        ? drawTileSprite(ctx, atlas, tile, x * cell, y * cell, Math.ceil(cell), Math.ceil(cell), icons)
        : false;
      if (!drewSprite) {
        ctx.fillStyle = tileColor(tile);
        ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  drawGrid(ctx, cell, size);
  if (viewOptions.showRealmzCoordinates) drawCoordinateLabels(ctx, cell, size);
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

export function drawGrid(ctx: CanvasRenderingContext2D, cell: number, size: number) {
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

export function drawCoordinateLabels(ctx: CanvasRenderingContext2D, cell: number, size: number) {
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

export function drawRandomRectangles(
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

export function drawSecretTileOverlay(ctx: CanvasRenderingContext2D, map: MapEntity, cell: number) {
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

export function drawHover(ctx: CanvasRenderingContext2D, hover: { x: number; y: number }, cell: number) {
  ctx.strokeStyle = "#f3c869";
  ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.16));
  ctx.strokeRect(hover.x * cell + 1, hover.y * cell + 1, cell - 2, cell - 2);
}

export function drawSelectedCell(ctx: CanvasRenderingContext2D, selectedCell: { x: number; y: number }, cell: number) {
  const inset = Math.max(2, cell * 0.12);
  ctx.save();
  ctx.strokeStyle = "#78d7ff";
  ctx.lineWidth = Math.max(2, Math.min(5, cell * 0.14));
  ctx.setLineDash([Math.max(4, cell * 0.34), Math.max(3, cell * 0.2)]);
  ctx.strokeRect(selectedCell.x * cell + inset, selectedCell.y * cell + inset, cell - inset * 2, cell - inset * 2);
  ctx.restore();
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
