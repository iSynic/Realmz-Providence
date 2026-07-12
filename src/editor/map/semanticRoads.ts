export const SEMANTIC_ROAD_LANDLOOKS = [0, 2, 3, 5, 9, 10] as const;

const SEMANTIC_ROAD_LANDLOOK_SET = new Set<number>(SEMANTIC_ROAD_LANDLOOKS);

const SEMANTIC_ROAD_TILE_BY_MASK: Record<number, number> = {
  1: 146,
  2: 143,
  3: 141,
  4: 144,
  5: 133,
  6: 139,
  7: 137,
  8: 145,
  9: 140,
  10: 132,
  11: 136,
  12: 142,
  13: 138,
  14: 135,
  15: 134
};

export function supportsSemanticRoads(landlook: number) {
  return SEMANTIC_ROAD_LANDLOOK_SET.has(landlook);
}

export function semanticRoadTile(neighborMask: number) {
  return SEMANTIC_ROAD_TILE_BY_MASK[neighborMask] ?? null;
}
