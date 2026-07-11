import { CustomMapStamp, MapEntity, PaintCellChange, TilesetAsset } from "../types";
import { mapTileIndex, tileValueAt } from "./geometry";
import { standardTileValues } from "./tileMetadata";
import { SUPER_TILE_STAMPS, type MapStampCategory, type SuperTileStamp, type SuperTileStampCell } from "./builtInMapStamps";

export { SUPER_TILE_STAMPS } from "./builtInMapStamps";
export type { MapStampCategory, SuperTileStamp, SuperTileStampCell } from "./builtInMapStamps";

export type MapStampSource = "built-in" | "project" | "global";

export type MapStamp = {
  id: string;
  label: string;
  source: MapStampSource;
  category: MapStampCategory;
  description: string;
  width?: number;
  height?: number;
  cells: SuperTileStampCell[];
};

export type MapStampPreviewCell = {
  x: number;
  y: number;
  tile: number | null;
  occupied: boolean;
  anchor: boolean;
};

export function superTileStampsForMap(map: MapEntity | null, tileset: TilesetAsset | null) {
  if (!map || map.levelType !== "land") return [];
  const standardTiles = new Set(standardTileValues(tileset));
  const landlook = tileset?.landlook ?? map.render.landlook ?? 0;
  return SUPER_TILE_STAMPS.filter((stamp) =>
    (!stamp.landlooks || stamp.landlooks.includes(landlook)) &&
    stamp.cells.every((cell) => cell.tile < 0 || standardTiles.has(cell.tile))
  );
}

export function superTileStampById(id: string | null | undefined, map: MapEntity | null, tileset: TilesetAsset | null) {
  const stamps = superTileStampsForMap(map, tileset);
  return stamps.find((stamp) => stamp.id === id) ?? stamps[0] ?? null;
}

export function customMapStampToMapStamp(stamp: CustomMapStamp, source: "project" | "global"): MapStamp {
  return {
    id: `${source}:${stamp.id}`,
    label: stamp.name,
    source,
    category: "custom",
    description: `${source === "project" ? "Project" : "Global"} custom stamp. ${stamp.width} x ${stamp.height}.`,
    width: stamp.width,
    height: stamp.height,
    cells: stamp.cells.map((cell) => ({ dx: cell.x, dy: cell.y, tile: cell.tile }))
  };
}

export function builtInStampToMapStamp(stamp: SuperTileStamp): MapStamp {
  return { ...stamp, id: `built-in:${stamp.id}`, source: "built-in" };
}

export function buildSuperTileStampChanges(
  map: MapEntity,
  stamp: MapStamp,
  origin: { x: number; y: number }
): PaintCellChange[] {
  const changes: PaintCellChange[] = [];
  for (const cell of stamp.cells) {
    const x = origin.x + cell.dx;
    const y = origin.y + cell.dy;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const index = mapTileIndex(map, x, y);
    const from = tileValueAt(map, x, y);
    if (from === cell.tile) continue;
    changes.push({ x, y, index, from, to: cell.tile });
  }
  return changes;
}

export function superTileStampPreviewCells(map: MapEntity, stamp: MapStamp, origin: { x: number; y: number }): MapStampPreviewCell[] {
  const bounds = stampPreviewBounds(stamp);
  const occupied = new Map(stamp.cells.map((cell) => [`${cell.dx}:${cell.dy}`, cell.tile]));
  const preview: MapStampPreviewCell[] = [];
  for (let dy = bounds.top; dy <= bounds.bottom; dy += 1) {
    for (let dx = bounds.left; dx <= bounds.right; dx += 1) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      const tile = occupied.get(`${dx}:${dy}`) ?? null;
      preview.push({ x, y, tile, occupied: tile != null, anchor: dx === 0 && dy === 0 });
    }
  }
  return preview;
}

function stampPreviewBounds(stamp: MapStamp) {
  if (stamp.width && stamp.height) {
    return { left: 0, top: 0, right: stamp.width - 1, bottom: stamp.height - 1 };
  }
  if (stamp.cells.length === 0) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.min(...stamp.cells.map((cell) => cell.dx)),
    top: Math.min(...stamp.cells.map((cell) => cell.dy)),
    right: Math.max(...stamp.cells.map((cell) => cell.dx)),
    bottom: Math.max(...stamp.cells.map((cell) => cell.dy))
  };
}
