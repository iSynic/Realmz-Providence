import { allMapCells, buildPaintChanges, buildReplaceChanges, rectCells, regionDimensions } from "../../map/regionPaint";
import { MapEntity, MapPaintMode, MapRegionSelection, ProjectCommand, TilesetAsset } from "../../types";

const PAINT_MODE_LABELS: Record<MapPaintMode, string> = {
  brush: "Brush",
  rectangle: "Rectangle Fill",
  region: "Region Select",
  replace: "Replace Tile",
  clear: "Clear Region"
};

export function fillRegion(
  map: MapEntity | null,
  region: MapRegionSelection | null,
  selectedTile: number,
  onApplyCommand: (command: ProjectCommand) => void
) {
  if (!map || !region) return;
  const changes = buildPaintChanges(map, rectCells(map, region), selectedTile);
  if (changes.length === 0) return;
  onApplyCommand({
    kind: "paintTiles",
    label: `Fill region ${region.left},${region.top}-${region.right},${region.bottom}`,
    mapId: map.id,
    cells: changes
  });
}

export function clearRegion(
  map: MapEntity | null,
  region: MapRegionSelection | null,
  selectedTileset: TilesetAsset | null,
  onApplyCommand: (command: ProjectCommand) => void
) {
  if (!map || !region) return;
  fillRegion(map, region, clearTileForMap(map, selectedTileset), onApplyCommand);
}

export function replaceRegion(
  map: MapEntity,
  region: MapRegionSelection,
  fromTile: number,
  toTile: number,
  onApplyCommand: (command: ProjectCommand) => void
) {
  const changes = buildReplaceChanges(map, rectCells(map, region), fromTile, toTile);
  if (changes.length === 0) return;
  onApplyCommand({
    kind: "paintTiles",
    label: `Replace tile ${fromTile} with ${toTile} in region`,
    mapId: map.id,
    cells: changes
  });
}

export function replaceWholeMap(
  map: MapEntity,
  fromTile: number,
  toTile: number,
  onApplyCommand: (command: ProjectCommand) => void
) {
  const changes = buildReplaceChanges(map, allMapCells(map), fromTile, toTile);
  if (changes.length === 0) return;
  onApplyCommand({
    kind: "paintTiles",
    label: `Replace tile ${fromTile} with ${toTile} on map`,
    mapId: map.id,
    cells: changes
  });
}

export function clearTileForMap(map: MapEntity | null, selectedTileset: TilesetAsset | null) {
  return selectedTileset?.baseTile ?? map?.tiles[0] ?? 1;
}

export function regionLabel(region: MapRegionSelection) {
  const { width, height } = regionDimensions(region);
  return `${region.left},${region.top} to ${region.right},${region.bottom} (${width}x${height})`;
}

export function paintModeLabel(mode: MapPaintMode) {
  return PAINT_MODE_LABELS[mode] ?? mode;
}
