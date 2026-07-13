import { useEffect, useRef, useState } from "react";
import type { MonsterRecord } from "../../types";
import {
  BATTLE_GRID_SIZE,
  battleGridDisplayCoordsFromStorageIndex,
  battlePlacementCoveredDisplayCells,
  battlePlacementRect,
  type BattleGridCellView,
  type BattleGridPaintPreview,
  type BattleGridPlacementView
} from "./battleGridModel";

type BattleCanvasImage = HTMLImageElement | ImageBitmap;

type BattleCanvasImageEntry = {
  url: string | null;
  image: BattleCanvasImage | null;
};

type BattleBoardCanvasProps = {
  cells: BattleGridCellView[];
  placements: BattleGridPlacementView[];
  iconUrls: Record<string, { resolvedUrl: string | null }>;
  paintPreview: BattleGridPaintPreview | null;
  selectedIndex: number;
  hoverIndex: number | null;
  draggingIndex: number | null;
};

const battleCanvasImageCache = new Map<string, Promise<BattleCanvasImage | null>>();
const battleCanvasResolvedImageCache = new Map<string, BattleCanvasImage | null>();

export function battleMonsterIconLookupKey(monster: MonsterRecord) {
  return `${monster.id}:${monster.iconId}`;
}

export function BattleBoardCanvas({
  cells,
  placements,
  iconUrls,
  paintPreview,
  selectedIndex,
  hoverIndex,
  draggingIndex
}: BattleBoardCanvasProps) {
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const monsterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imagesByPlacement, setImagesByPlacement] = useState<Record<string, BattleCanvasImageEntry>>({});

  useEffect(() => {
    let disposed = false;
    const nextImages: Record<string, BattleCanvasImageEntry> = {};
    const missing: Array<{ key: string; url: string | null }> = [];
    for (const placement of placements) {
      const key = battlePlacementCanvasKey(placement);
      if (!placement.monster) {
        nextImages[key] = { url: null, image: null };
        continue;
      }
      const resolved = iconUrls[battleMonsterIconLookupKey(placement.monster)] ?? null;
      const url = resolved?.resolvedUrl ?? null;
      const cached = imagesByPlacement[key];
      if (cached && cached.url === url) {
        nextImages[key] = cached;
      } else {
        nextImages[key] = { url, image: url ? battleCanvasResolvedImageCache.get(url) ?? null : null };
      }
      if (url && !nextImages[key].image) missing.push({ key, url });
    }
    setImagesByPlacement(nextImages);
    if (missing.length === 0) {
      return () => {
        disposed = true;
      };
    }
    Promise.all(missing.map(async ({ key, url }) => {
      const image = url ? await loadBattleCanvasImage(url) : null;
      return [key, { url, image }] as const;
    })).then((entries) => {
      if (disposed) return;
      setImagesByPlacement((current) => {
        let changed = false;
        const next = { ...current };
        for (const [key, entry] of entries) {
          if (next[key]?.url !== entry.url) continue;
          if (next[key].image === entry.image) continue;
          next[key] = entry;
          changed = true;
        }
        return changed ? next : current;
      });
    }).catch(() => {
      if (disposed) return;
      setImagesByPlacement((current) => {
        let changed = false;
        const next = { ...current };
        for (const { key, url } of missing) {
          if (next[key]?.url !== url || next[key].image === null) continue;
          next[key] = { url, image: null };
          changed = true;
        }
        return changed ? next : current;
      });
    });
    return () => {
      disposed = true;
    };
  }, [iconUrls, placements]);

  useEffect(() => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const { ctx, size } = syncBattleCanvas(canvas);
    if (!ctx) return;
    drawBattleGridLayer(ctx, size, cells);
  }, [cells]);

  useEffect(() => {
    const canvas = monsterCanvasRef.current;
    if (!canvas) return;
    const { ctx, size } = syncBattleCanvas(canvas);
    if (!ctx) return;
    drawBattleMonsterLayer(ctx, size, placements, imagesByPlacement, draggingIndex);
  }, [draggingIndex, imagesByPlacement, placements]);

  useEffect(() => {
    const canvas = interactionCanvasRef.current;
    if (!canvas) return;
    const { ctx, size } = syncBattleCanvas(canvas);
    if (!ctx) return;
    drawBattleInteractionLayer(ctx, size, cells, placements, paintPreview, selectedIndex, hoverIndex);
  }, [cells, hoverIndex, paintPreview, placements, selectedIndex]);

  return (
    <>
      <canvas ref={gridCanvasRef} className="battle-board-canvas battle-board-grid-canvas" aria-hidden="true" />
      <canvas ref={monsterCanvasRef} className="battle-board-canvas battle-board-monster-canvas" aria-hidden="true" />
      <canvas ref={interactionCanvasRef} className="battle-board-canvas battle-board-interaction-canvas" aria-hidden="true" />
    </>
  );
}

function syncBattleCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const size = Math.max(1, Math.round(Math.min(rect.width, rect.height)));
  const scale = window.devicePixelRatio || 1;
  const pixelSize = Math.max(1, Math.round(size * scale));
  if (canvas.width !== pixelSize) canvas.width = pixelSize;
  if (canvas.height !== pixelSize) canvas.height = pixelSize;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  return { ctx, size };
}

function drawBattleGridLayer(ctx: CanvasRenderingContext2D, size: number, cells: BattleGridCellView[]) {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const cellSize = size / BATTLE_GRID_SIZE;
  ctx.fillStyle = "#f7f7f7";
  for (const cell of cells) {
    if (!cell.value) continue;
    ctx.fillRect(cell.displayCol * cellSize, cell.displayRow * cellSize, cellSize, cellSize);
  }
  ctx.strokeStyle = "#b8b8b8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let index = 1; index < BATTLE_GRID_SIZE; index += 1) {
    const position = Math.round(index * cellSize) + 0.5;
    ctx.moveTo(position, 0);
    ctx.lineTo(position, size);
    ctx.moveTo(0, position);
    ctx.lineTo(size, position);
  }
  ctx.stroke();
}

function drawBattleMonsterLayer(
  ctx: CanvasRenderingContext2D,
  size: number,
  placements: BattleGridPlacementView[],
  imagesByPlacement: Record<string, BattleCanvasImageEntry>,
  draggingIndex: number | null
) {
  ctx.clearRect(0, 0, size, size);
  const cellSize = size / BATTLE_GRID_SIZE;
  for (const placement of placements) {
    const rect = battlePlacementRect(placement, cellSize);
    ctx.save();
    if (draggingIndex === placement.index) ctx.globalAlpha = 0.55;
    const image = imagesByPlacement[battlePlacementCanvasKey(placement)]?.image ?? null;
    if (image) drawImageContained(ctx, image, rect.x, rect.y, rect.width, rect.height);
    else drawMissingBattleMonster(ctx, placement, rect);
    if (placement.alternateSide) {
      ctx.strokeStyle = "#2fa85f";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, Math.max(1, rect.width - 2), Math.max(1, rect.height - 2));
      ctx.shadowColor = "#2fa85f";
      ctx.shadowBlur = 4;
      ctx.strokeRect(rect.x + 3, rect.y + 3, Math.max(1, rect.width - 6), Math.max(1, rect.height - 6));
    }
    ctx.restore();
  }
}

function drawBattleInteractionLayer(
  ctx: CanvasRenderingContext2D,
  size: number,
  cells: BattleGridCellView[],
  placements: BattleGridPlacementView[],
  paintPreview: BattleGridPaintPreview | null,
  selectedIndex: number,
  hoverIndex: number | null
) {
  ctx.clearRect(0, 0, size, size);
  const cellSize = size / BATTLE_GRID_SIZE;
  if (paintPreview) drawBattlePaintPreview(ctx, paintPreview, cellSize);
  if (hoverIndex != null) {
    const hover = cells.find((cell) => cell.index === hoverIndex);
    if (hover) drawBattleCellOutline(ctx, hover.displayCol, hover.displayRow, cellSize, "#ff9d8f", 2);
  }
  const selectedCell = cells.find((cell) => cell.index === selectedIndex);
  if (selectedCell) drawBattleCellOutline(ctx, selectedCell.displayCol, selectedCell.displayRow, cellSize, "#f2cb70", 3);
  const selectedPlacement = placements.find((placement) => placement.index === selectedIndex);
  if (selectedPlacement) {
    const rect = battlePlacementRect(selectedPlacement, cellSize);
    ctx.strokeStyle = "#f2cb70";
    ctx.lineWidth = 2;
    ctx.strokeRect(rect.x + 2, rect.y + 2, Math.max(1, rect.width - 4), Math.max(1, rect.height - 4));
  }
}

function drawBattlePaintPreview(ctx: CanvasRenderingContext2D, preview: BattleGridPaintPreview, cellSize: number) {
  const coveredCells = battlePlacementCoveredDisplayCells(preview);
  ctx.save();
  for (const cell of coveredCells) {
    if (cell.index === preview.anchorIndex) continue;
    drawBattleCellFill(ctx, cell.col, cell.row, cellSize, "rgba(42, 158, 234, 0.24)", "rgba(42, 158, 234, 0.78)", 1.5);
  }
  const anchor = battleGridDisplayCoordsFromStorageIndex(preview.anchorIndex);
  drawBattleCellFill(ctx, anchor.col, anchor.row, cellSize, "rgba(242, 203, 112, 0.38)", "rgba(255, 184, 71, 0.95)", 2.5);
  ctx.restore();
}

function drawBattleCellFill(ctx: CanvasRenderingContext2D, col: number, row: number, cellSize: number, fill: string, stroke: string, width: number) {
  const inset = width / 2;
  const x = col * cellSize;
  const y = row * cellSize;
  ctx.fillStyle = fill;
  ctx.fillRect(x + 1, y + 1, Math.max(1, cellSize - 2), Math.max(1, cellSize - 2));
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.strokeRect(x + inset, y + inset, cellSize - width, cellSize - width);
}

function drawBattleCellOutline(ctx: CanvasRenderingContext2D, col: number, row: number, cellSize: number, color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  const inset = width / 2;
  ctx.strokeRect(col * cellSize + inset, row * cellSize + inset, cellSize - width, cellSize - width);
}

function drawImageContained(ctx: CanvasRenderingContext2D, image: BattleCanvasImage, x: number, y: number, width: number, height: number) {
  const imageWidth = "naturalWidth" in image ? image.naturalWidth || image.width || 1 : image.width || 1;
  const imageHeight = "naturalHeight" in image ? image.naturalHeight || image.height || 1 : image.height || 1;
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = Math.max(1, imageWidth * scale);
  const drawHeight = Math.max(1, imageHeight * scale);
  const left = x + (width - drawWidth) / 2;
  const top = y + (height - drawHeight) / 2;
  ctx.drawImage(image, left, top, drawWidth, drawHeight);
}

function drawMissingBattleMonster(
  ctx: CanvasRenderingContext2D,
  placement: BattleGridPlacementView,
  rect: { x: number; y: number; width: number; height: number }
) {
  ctx.fillStyle = "#0b1620";
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(placement.monsterId || "?"), rect.x + rect.width / 2, rect.y + rect.height / 2);
}

function battlePlacementCanvasKey(placement: BattleGridPlacementView) {
  return `${placement.index}:${placement.value}:${placement.monster?.iconId ?? 0}`;
}

function loadBattleCanvasImage(url: string) {
  if (battleCanvasResolvedImageCache.has(url)) {
    return Promise.resolve(battleCanvasResolvedImageCache.get(url) ?? null);
  }
  const cached = battleCanvasImageCache.get(url);
  if (cached) return cached;
  const request = loadBattleCanvasImageUncached(url).then((image) => {
    battleCanvasResolvedImageCache.set(url, image);
    return image;
  });
  battleCanvasImageCache.set(url, request);
  return request;
}

async function loadBattleCanvasImageUncached(url: string): Promise<BattleCanvasImage | null> {
  if (typeof window.createImageBitmap === "function") {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await window.createImageBitmap(blob);
    } catch {
      // Fall back to an HTML image below for URLs the browser cannot fetch as a blob.
    }
  }
  return new Promise<BattleCanvasImage | null>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}
