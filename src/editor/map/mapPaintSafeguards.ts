import type {
  MapEntity,
  PaintCellChange,
  SmartBrushPlan,
  TilesetAsset,
  TriggerRecord
} from "../types";
import { landlookTileVisualSemantics } from "./landlookTileSemantics";
import { atlasBaseTile, normalizeAtlasTile, tileIconCandidates } from "./renderValues";

export type MapPaintProtectionReason = "action-point" | "special-icon" | "structure";

export type MapPaintOperationImpact = {
  requestedCount: number;
  allowedChanges: PaintCellChange[];
  protectedChanges: Array<PaintCellChange & { protectionReason: MapPaintProtectionReason }>;
  protectedCounts: Record<MapPaintProtectionReason, number>;
  sourceComposition: Array<{ tile: number; count: number }>;
};

const STRUCTURE_CATEGORIES = new Set(["buildings", "cave-transition", "graves", "watercraft"]);

export function analyzeMapPaintOperation({
  map,
  changes,
  triggers,
  tileset,
  protectFeatures
}: {
  map: MapEntity;
  changes: ReadonlyArray<PaintCellChange>;
  triggers: ReadonlyArray<TriggerRecord>;
  tileset: TilesetAsset | null;
  protectFeatures: boolean;
}): MapPaintOperationImpact {
  const actionPointCells = new Set(
    triggers
      .filter((trigger) => trigger.active && trigger.levelType === map.levelType && trigger.levelIndex === map.index && trigger.coordinate)
      .map((trigger) => `${trigger.coordinate!.x}:${trigger.coordinate!.y}`)
  );
  const allowedChanges: PaintCellChange[] = [];
  const protectedChanges: MapPaintOperationImpact["protectedChanges"] = [];
  const protectedCounts: MapPaintOperationImpact["protectedCounts"] = {
    "action-point": 0,
    "special-icon": 0,
    structure: 0
  };
  const composition = new Map<number, number>();

  for (const change of changes) {
    composition.set(change.from, (composition.get(change.from) ?? 0) + 1);
    const protectionReason = protectFeatures
      ? mapPaintProtectionReason(change, map, tileset, actionPointCells)
      : null;
    if (protectionReason) {
      protectedChanges.push({ ...change, protectionReason });
      protectedCounts[protectionReason] += 1;
    } else {
      allowedChanges.push(change);
    }
  }

  return {
    requestedCount: changes.length,
    allowedChanges,
    protectedChanges,
    protectedCounts,
    sourceComposition: [...composition.entries()]
      .map(([tile, count]) => ({ tile, count }))
      .sort((left, right) => right.count - left.count || left.tile - right.tile)
  };
}

export function applyMapPaintImpactToSmartPlan(
  plan: SmartBrushPlan,
  impact: MapPaintOperationImpact
): SmartBrushPlan {
  if (impact.protectedChanges.length === 0) return plan;
  const protectedKeys = new Set(impact.protectedChanges.map(cellKey));
  const protectedCells = impact.protectedChanges.map(({ x, y }) => ({ x, y }));
  const skippedByKey = new Map(plan.skipped.map((cell) => [cellKey(cell), cell]));
  for (const cell of protectedCells) skippedByKey.set(cellKey(cell), cell);
  const cells = plan.cells.filter((cell) => !protectedKeys.has(cellKey(cell)));
  return {
    ...plan,
    cells,
    skipped: [...skippedByKey.values()],
    changedCount: cells.filter((cell) => cell.from !== cell.to).length,
    skippedCount: skippedByKey.size
  };
}

function mapPaintProtectionReason(
  change: PaintCellChange,
  map: MapEntity,
  tileset: TilesetAsset | null,
  actionPointCells: Set<string>
): MapPaintProtectionReason | null {
  if (actionPointCells.has(cellKey(change))) return "action-point";
  if (tileIconCandidates(change.from).length > 0) return "special-icon";
  if (map.levelType !== "land") return null;
  const tile = normalizeAtlasTile(
    change.from,
    atlasBaseTile(tileset?.baseTile, tileset?.custom ?? false)
  );
  const semantics = landlookTileVisualSemantics(tile, tileset?.landlook ?? map.render.landlook);
  return semantics && STRUCTURE_CATEGORIES.has(semantics.category) ? "structure" : null;
}

function cellKey(cell: { x: number; y: number }) {
  return `${cell.x}:${cell.y}`;
}
