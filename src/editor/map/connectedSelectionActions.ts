import type { MapEntity, MapPaintIntent, PaintCellChange, ProjectCommand, TilesetAsset } from "../types";
import { mapTileIndex, tileValueAt } from "./geometry";
import { buildPaintChangesWithResolver, makePaintTileResolver } from "./paintResolver";
import { clearTileForMap } from "./tileClear";

export type ConnectedSelectionActionPlan = {
  changes: PaintCellChange[];
  selectedCount: number;
};

export function buildConnectedSelectionFillPlan(
  map: MapEntity,
  cells: ReadonlyArray<{ x: number; y: number }>,
  intent: MapPaintIntent
): ConnectedSelectionActionPlan {
  const selected = hydrateSelectedCells(map, cells);
  const { resolver } = makePaintTileResolver(intent);
  return {
    changes: buildPaintChangesWithResolver(selected, resolver),
    selectedCount: selected.length
  };
}

export function buildConnectedSelectionReplacePlan(
  map: MapEntity,
  cells: ReadonlyArray<{ x: number; y: number }>,
  sourceTile: number,
  intent: MapPaintIntent
): ConnectedSelectionActionPlan {
  const selected = hydrateSelectedCells(map, cells);
  const matching = selected.filter((cell) => cell.tile === sourceTile);
  const { resolver } = makePaintTileResolver(intent);
  return {
    changes: buildPaintChangesWithResolver(matching, resolver),
    selectedCount: selected.length
  };
}

export function buildConnectedSelectionClearPlan(
  map: MapEntity,
  cells: ReadonlyArray<{ x: number; y: number }>,
  tileset: TilesetAsset | null
): ConnectedSelectionActionPlan {
  const selected = hydrateSelectedCells(map, cells);
  const clearTile = clearTileForMap(map, tileset);
  return {
    changes: selected
      .filter((cell) => cell.tile !== clearTile)
      .map((cell) => ({ x: cell.x, y: cell.y, index: cell.index, from: cell.tile, to: clearTile })),
    selectedCount: selected.length
  };
}

export function connectedSelectionPaintCommand(
  map: MapEntity,
  label: string,
  plan: ConnectedSelectionActionPlan
): Extract<ProjectCommand, { kind: "paintTiles" }> | null {
  if (plan.changes.length === 0) return null;
  return { kind: "paintTiles", mapId: map.id, label, cells: plan.changes };
}

function hydrateSelectedCells(
  map: MapEntity,
  cells: ReadonlyArray<{ x: number; y: number }>
) {
  const seen = new Set<string>();
  return cells
    .filter((cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y))
    .filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height)
    .filter((cell) => {
      const key = `${cell.x}:${cell.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((cell) => ({
      x: cell.x,
      y: cell.y,
      index: mapTileIndex(map, cell.x, cell.y),
      tile: tileValueAt(map, cell.x, cell.y)
    }))
    .sort((left, right) => left.y - right.y || left.x - right.x);
}
