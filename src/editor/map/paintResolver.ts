import { MapEntity, MapPaintIntent, MapPaintVariation, PaintCellChange, PaintTileResolver, RegionPaintPlan } from "../types";
import { landlookGroupTiles } from "./paintGroups";
import { rectCells } from "./regionPaint";

export function makePaintTileResolver(intent: MapPaintIntent): {
  resolver: PaintTileResolver;
  effectiveVariation: MapPaintVariation;
  groupTileCount: number;
} {
  const groupTiles = landlookGroupTiles(intent.selectedTileset, intent.activeGroupId);
  const effectiveVariation = intent.variation === "single" || groupTiles.length === 0 ? "single" : intent.variation;
  return {
    effectiveVariation,
    groupTileCount: groupTiles.length,
    resolver: (cell, sequence) => {
      if (effectiveVariation === "single") return intent.selectedTile;
      if (effectiveVariation === "cycle-group") return groupTiles[sequence % groupTiles.length];
      return groupTiles[stableRandomIndex(intent.seed, cell.x, cell.y, sequence, groupTiles.length)];
    }
  };
}

export function buildPaintChangesWithResolver(
  cells: Array<{ x: number; y: number; index: number; tile: number }>,
  resolver: PaintTileResolver
): PaintCellChange[] {
  const changes: PaintCellChange[] = [];
  let sequence = 0;
  for (const cell of cells) {
    const to = resolver(cell, sequence);
    if (cell.tile === to) continue;
    changes.push({ x: cell.x, y: cell.y, index: cell.index, from: cell.tile, to });
    sequence += 1;
  }
  return changes;
}

export function buildRegionPaintPlan(
  map: MapEntity,
  region: { left: number; top: number; right: number; bottom: number },
  intent: MapPaintIntent
): RegionPaintPlan {
  const { resolver, effectiveVariation, groupTileCount } = makePaintTileResolver(intent);
  return {
    changes: buildPaintChangesWithResolver(rectCells(map, region), resolver),
    effectiveVariation,
    groupTileCount
  };
}

export function paintSeed(...parts: Array<string | number | null | undefined>) {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const value = String(part ?? "");
    for (let index = 0; index < value.length; index += 1) {
      hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
    }
    hash = Math.imul(hash ^ 58, 16777619);
  }
  return hash >>> 0;
}

function stableRandomIndex(seed: number, x: number, y: number, sequence: number, length: number) {
  if (length <= 1) return 0;
  let value = seed ^ Math.imul(x + 0x9e3779b9, 0x85ebca6b);
  value ^= Math.imul(y + 0xc2b2ae35, 0x27d4eb2f);
  value ^= Math.imul(sequence + 0x165667b1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) % length;
}
