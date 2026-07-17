import { buildPaintChanges, rectCells, regionDimensions } from "../../map/regionPaint";
import { buildRegionPaintPlan, paintSeed } from "../../map/paintResolver";
import { clearTileForMap } from "../../map/tileClear";
import { MapEntity, MapPaintMode, MapPaintVariation, MapRegionSelection, PaintCellChange, ProjectCommand, TilesetAsset } from "../../types";

export type RegionPaintOperation = {
  label: string;
  changes: PaintCellChange[];
};

const PAINT_MODE_LABELS: Record<MapPaintMode, string> = {
  brush: "Brush",
  clear: "Eraser",
  smart: "Smart"
};

export function buildFillRegionOperation(
  map: MapEntity | null,
  region: MapRegionSelection | null,
  selectedTile: number,
  selectedTileset: TilesetAsset | null,
  paintVariation: MapPaintVariation,
  activePaintGroupId: string,
  variationTiles: number[] | null | undefined,
  fillChancePercent: number,
): RegionPaintOperation | null {
  if (!map || !region) return null;
  const chance = Math.max(0, Math.min(100, Math.trunc(fillChancePercent)));
  const plan = buildRegionPaintPlan(map, region, {
    selectedTile,
    selectedTileset,
    variation: paintVariation,
    activeGroupId: activePaintGroupId,
    variationTiles,
    seed: paintSeed(map.id, region.left, region.top, region.right, region.bottom, selectedTile, activePaintGroupId, variationTiles?.join(","))
  });
  const changes = chance >= 100
    ? plan.changes
    : plan.changes.filter((cell) => fillChanceHit(map.id, region, cell.x, cell.y, selectedTile, activePaintGroupId, variationTiles, chance));
  return {
    label: chance >= 100
      ? `Fill region ${region.left},${region.top}-${region.right},${region.bottom}`
      : `Fill region ${region.left},${region.top}-${region.right},${region.bottom} ${chance}%`,
    changes
  };
}

export function buildClearRegionOperation(
  map: MapEntity | null,
  region: MapRegionSelection | null,
  selectedTileset: TilesetAsset | null
): RegionPaintOperation | null {
  if (!map || !region) return null;
  const clearTile = clearTileForMap(map, selectedTileset);
  const changes = buildPaintChanges(map, rectCells(map, region), clearTile);
  return {
    label: `Clear region ${region.left},${region.top}-${region.right},${region.bottom}`,
    changes
  };
}

export function applyRegionPaintOperation(
  map: MapEntity | null,
  operation: RegionPaintOperation | null,
  changes: PaintCellChange[],
  onApplyCommand: (command: ProjectCommand) => void
) {
  if (!map || !operation || changes.length === 0) return;
  onApplyCommand({
    kind: "paintTiles",
    label: operation.label,
    mapId: map.id,
    cells: changes
  });
}

export function regionLabel(region: MapRegionSelection) {
  const { width, height } = regionDimensions(region);
  return `${region.left},${region.top} to ${region.right},${region.bottom} (${width}x${height})`;
}

export function paintModeLabel(mode: MapPaintMode) {
  return PAINT_MODE_LABELS[mode] ?? mode;
}

function fillChanceHit(
  mapId: string,
  region: MapRegionSelection,
  x: number,
  y: number,
  selectedTile: number,
  activePaintGroupId: string,
  variationTiles: number[] | null | undefined,
  chance: number
) {
  if (chance <= 0) return false;
  if (chance >= 100) return true;
  const hash = paintSeed(mapId, region.left, region.top, region.right, region.bottom, x, y, selectedTile, activePaintGroupId, variationTiles?.join(","));
  return hash % 100 < chance;
}
