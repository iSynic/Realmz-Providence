import { normalizeAtlasTile, normalizeTile, tileIconCandidates } from "../map/renderValues";
import { AtlasEntry, IconEntry, TilesetAsset } from "../types";

const DUNGEON_ATLAS_ID = "dungeon-top-down-302";
const DUNGEON_TINY_SIZE = 16;
const DUNGEON_TINY_COLUMNS = 4;
const DUNGEON_TINY_SOURCE_X = 576;
const DUNGEON_TINY_SOURCE_Y = 320;

export function TileSprite({ atlas, tile }: { atlas: AtlasEntry; tile: number }) {
  if (isDungeonAtlas(atlas.asset)) return null;
  const rect = tileAtlasRect(atlas.asset, tile);
  if (!rect) return null;
  const backgroundSize = `${atlas.asset.columns * 100}% ${atlas.asset.rows * 100}%`;
  const backgroundPosition =
    atlas.asset.columns === 1 && atlas.asset.rows === 1
      ? "0% 0%"
      : `${(rect.column / Math.max(1, atlas.asset.columns - 1)) * 100}% ${
          (rect.row / Math.max(1, atlas.asset.rows - 1)) * 100
        }%`;
  return (
    <span
      className="tile-sprite"
      style={{
        backgroundImage: `url(${atlas.url})`,
        backgroundSize,
        backgroundPosition
      }}
    />
  );
}

export function drawTileSprite(
  ctx: CanvasRenderingContext2D,
  atlas: AtlasEntry | null,
  tile: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  iconEntries?: Record<number, IconEntry>
) {
  const icon = tileIconCandidates(tile).map((iconId) => iconEntries?.[iconId]).find((entry) => Boolean(entry?.image));
  if (!atlas) {
    if (icon?.image) {
      ctx.drawImage(icon.image, dx, dy, dw, dh);
      return true;
    }
    return false;
  }
  if (isDungeonAtlas(atlas.asset)) {
    const drewDungeon = drawDungeonTileSprite(ctx, atlas.image, tile, dx, dy, dw, dh);
    if (icon?.image) ctx.drawImage(icon.image, dx, dy, dw, dh);
    return drewDungeon || Boolean(icon?.image);
  }
  const rect = tileAtlasRect(atlas.asset, tile);
  if (!rect) {
    if (icon?.image) {
      ctx.drawImage(icon.image, dx, dy, dw, dh);
      return true;
    }
    return false;
  }
  const sprite = landSpriteCanvas(atlas.image, atlas.asset, rect);
  ctx.drawImage(
    sprite,
    1,
    1,
    atlas.asset.tileWidth,
    atlas.asset.tileHeight,
    dx,
    dy,
    dw,
    dh
  );
  if (icon?.image) ctx.drawImage(icon.image, dx, dy, dw, dh);
  return true;
}

export function tileAtlasRect(asset: TilesetAsset, tile: number) {
  if (isDungeonAtlas(asset)) return null;
  const columns = Math.max(1, asset.columns);
  const rows = Math.max(1, asset.rows);
  const normalized = normalizeAtlasTile(tile, asset.baseTile ?? 1);
  const capacity = columns * rows;
  if (capacity <= 0) return null;
  const index = normalized - 1;
  if (index < 0 || index >= capacity) return null;
  return {
    column: index % columns,
    row: Math.floor(index / columns)
  };
}

export function tileColor(tile: number) {
  const base = normalizeTile(tile);
  const hasDoorMarker = tile > 999;
  const noteBit = tile > 0 && (tile & 2);
  const pathBit = tile > 0 && (tile & 4);
  let hue = (base * 43 + 2100) % 360;
  let saturation = 34 + (Math.abs(base) % 20);
  let lightness = 28 + (Math.abs(base) % 26);

  if (base < 0) {
    hue = (hue + 180) % 360;
    saturation += 10;
    lightness -= 8;
  }
  if (hasDoorMarker) {
    saturation += 12;
    lightness += 10;
  }
  if (pathBit) {
    hue = 90;
    saturation = 42;
    lightness = 45;
  }
  if (noteBit) {
    hue = 285;
    saturation = 44;
    lightness = 48;
  }
  const [r, g, b] = hslToRgb(hue, Math.min(saturation, 80), Math.max(12, Math.min(lightness, 70)));
  return `rgb(${r}, ${g}, ${b})`;
}

export function categoryColor(category: string) {
  const colors: Record<string, string> = {
    advanced: "#94a3b8",
    branch: "#9dcfff",
    characters: "#4ade80",
    combat: "#f87171",
    core: "#93c5fd",
    economy: "#fbbf24",
    encounter: "#c084fc",
    item_shop: "#fbbf24",
    map: "#38bdf8",
    media: "#22d3ee",
    quest: "#a7f3d0",
    registration: "#94a3b8",
    rules: "#f0abfc",
    scenario: "#fb923c",
    state: "#4ade80",
    text: "#eab308",
    time: "#fb923c",
    ui_text: "#eab308",
    unknown: "#cbd5e1"
  };
  return colors[category.toLowerCase()] ?? colors.unknown;
}

export function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load"));
    image.src = url;
  });
}

function isDungeonAtlas(asset: TilesetAsset) {
  return asset.id === DUNGEON_ATLAS_ID || asset.pictId === 302;
}

const landSpriteCache = new WeakMap<HTMLImageElement, Map<string, HTMLCanvasElement>>();

// Smooth scaling can sample neighboring atlas slots; pad each cached tile with
// duplicated edges before it reaches the map canvas.
function landSpriteCanvas(
  image: HTMLImageElement,
  asset: TilesetAsset,
  rect: { column: number; row: number }
) {
  let spriteMap = landSpriteCache.get(image);
  if (!spriteMap) {
    spriteMap = new Map();
    landSpriteCache.set(image, spriteMap);
  }

  const key = `${rect.column}:${rect.row}:${asset.tileWidth}:${asset.tileHeight}`;
  const cached = spriteMap.get(key);
  if (cached) return cached;

  const width = asset.tileWidth;
  const height = asset.tileHeight;
  const sx = rect.column * width;
  const sy = rect.row * height;
  const canvas = document.createElement("canvas");
  canvas.width = width + 2;
  canvas.height = height + 2;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.imageSmoothingEnabled = false;
  context.drawImage(image, sx, sy, width, height, 1, 1, width, height);

  context.drawImage(image, sx, sy, width, 1, 1, 0, width, 1);
  context.drawImage(image, sx, sy + height - 1, width, 1, 1, height + 1, width, 1);
  context.drawImage(image, sx, sy, 1, height, 0, 1, 1, height);
  context.drawImage(image, sx + width - 1, sy, 1, height, width + 1, 1, 1, height);

  context.drawImage(image, sx, sy, 1, 1, 0, 0, 1, 1);
  context.drawImage(image, sx + width - 1, sy, 1, 1, width + 1, 0, 1, 1);
  context.drawImage(image, sx, sy + height - 1, 1, 1, 0, height + 1, 1, 1);
  context.drawImage(image, sx + width - 1, sy + height - 1, 1, 1, width + 1, height + 1, 1, 1);

  spriteMap.set(key, canvas);
  return canvas;
}

function hslToRgb(h: number, s: number, l: number) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255)
  ];
}

function dungeonFieldHasBit(value: number, bit: number) {
  return Boolean((value & 0xffff) & (1 << (15 - bit)));
}

const dungeonSpriteCache = new WeakMap<HTMLImageElement, Map<number, HTMLCanvasElement>>();

function drawDungeonTileSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  value: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  drawDungeonSprite(ctx, image, 15, dx, dy, dw, dh);
  for (let index = 0; index <= 6; index += 1) {
    if (dungeonFieldHasBit(value, 15 - index)) {
      drawDungeonSprite(ctx, image, index, dx, dy, dw, dh);
    }
  }
  return true;
}

function drawDungeonSprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  index: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number
) {
  const sprite = dungeonSpriteCanvas(image, index);
  ctx.drawImage(sprite, dx, dy, dw, dh);
}

function dungeonSpriteCanvas(image: HTMLImageElement, index: number) {
  let spriteMap = dungeonSpriteCache.get(image);
  if (!spriteMap) {
    spriteMap = new Map();
    dungeonSpriteCache.set(image, spriteMap);
  }
  const cached = spriteMap.get(index);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = DUNGEON_TINY_SIZE;
  canvas.height = DUNGEON_TINY_SIZE;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.imageSmoothingEnabled = false;
  const sx = DUNGEON_TINY_SOURCE_X + (index % DUNGEON_TINY_COLUMNS) * DUNGEON_TINY_SIZE;
  const sy = DUNGEON_TINY_SOURCE_Y + Math.floor(index / DUNGEON_TINY_COLUMNS) * DUNGEON_TINY_SIZE;
  context.drawImage(image, sx, sy, DUNGEON_TINY_SIZE, DUNGEON_TINY_SIZE, 0, 0, DUNGEON_TINY_SIZE, DUNGEON_TINY_SIZE);

  if (index !== 15) {
    const pixels = context.getImageData(0, 0, DUNGEON_TINY_SIZE, DUNGEON_TINY_SIZE);
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      const r = pixels.data[offset];
      const g = pixels.data[offset + 1];
      const b = pixels.data[offset + 2];
      if (r > 245 && g > 245 && b > 245) {
        pixels.data[offset + 3] = 0;
      }
    }
    context.putImageData(pixels, 0, 0);
  }

  spriteMap.set(index, canvas);
  return canvas;
}
