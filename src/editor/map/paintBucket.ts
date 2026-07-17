import type {
  MapEntity,
  MapPaintIntent,
  MapRegionSelection,
  ProjectCommand,
  TileAttributeProfile,
  TilesetAsset
} from "../types";
import { connectedMapCellsByTile, type ConnectedTileMatchMode } from "./connectedMapSelection";
import { mapTileIndex } from "./geometry";
import { buildPaintChangesWithResolver, makePaintTileResolver } from "./paintResolver";

export type PaintBucketOptions = {
  map: MapEntity;
  start: { x: number; y: number };
  matchMode: ConnectedTileMatchMode;
  tileset: TilesetAsset | null;
  attributes?: TileAttributeProfile[];
  intent: MapPaintIntent;
  region?: MapRegionSelection | null;
  selectionCells?: ReadonlyArray<{ x: number; y: number }> | null;
};

export type PaintBucketPlan = {
  component: Array<{ x: number; y: number; tile: number }>;
  changes: Extract<ProjectCommand, { kind: "paintTiles" }>["cells"];
};

export function buildPaintBucketPlan(options: PaintBucketOptions): PaintBucketPlan {
  const selectedCells = options.selectionCells?.length
    ? new Set(options.selectionCells.map(cellKey))
    : null;
  if (selectedCells && !selectedCells.has(cellKey(options.start))) {
    return { component: [], changes: [] };
  }

  const component = connectedMapCellsByTile(options.map, options.start, {
    mode: options.matchMode,
    tileset: options.tileset,
    attributes: options.attributes
  }).filter((cell) => cellAllowed(cell, options.region ?? null, selectedCells));
  const { resolver } = makePaintTileResolver(options.intent);
  const cells = component.map((cell) => ({
    ...cell,
    index: mapTileIndex(options.map, cell.x, cell.y)
  }));
  return {
    component,
    changes: buildPaintChangesWithResolver(cells, resolver)
  };
}

export function buildPaintBucketCommand(
  options: PaintBucketOptions
): Extract<ProjectCommand, { kind: "paintTiles" }> | null {
  const plan = buildPaintBucketPlan(options);
  if (plan.changes.length === 0) return null;
  return {
    kind: "paintTiles",
    mapId: options.map.id,
    label: "Fill connected terrain",
    cells: plan.changes
  };
}

function cellAllowed(
  cell: { x: number; y: number },
  region: MapRegionSelection | null,
  selectedCells: Set<string> | null
) {
  if (region && (cell.x < region.left || cell.x > region.right || cell.y < region.top || cell.y > region.bottom)) {
    return false;
  }
  return selectedCells === null || selectedCells.has(cellKey(cell));
}

function cellKey(cell: { x: number; y: number }) {
  return `${cell.x}:${cell.y}`;
}
