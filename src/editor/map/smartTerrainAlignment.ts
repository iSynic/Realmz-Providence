export type SmartTerrainEdge = "north" | "east" | "south" | "west";

export type SmartTerrainEdgeSignature = Record<SmartTerrainEdge, number[]>;

export type SmartTerrainAlignmentPlacement = {
  x: number;
  y: number;
  tile: number;
  candidates: number[];
};

type NeighborDirection = {
  dx: number;
  dy: number;
  edge: SmartTerrainEdge;
  opposite: SmartTerrainEdge;
};

const NEIGHBORS: NeighborDirection[] = [
  { dx: 0, dy: -1, edge: "north", opposite: "south" },
  { dx: 1, dy: 0, edge: "east", opposite: "west" },
  { dx: 0, dy: 1, edge: "south", opposite: "north" },
  { dx: -1, dy: 0, edge: "west", opposite: "east" }
];

export function alignSmartTerrainPlacementEdges(
  placements: SmartTerrainAlignmentPlacement[],
  readExistingTile: (x: number, y: number) => number | null,
  edgeSignatureForTile: (tile: number) => SmartTerrainEdgeSignature | null,
  tieRank: (tile: number, placement: SmartTerrainAlignmentPlacement) => number = (tile) => tile,
  candidatePenalty: (tile: number, placement: SmartTerrainAlignmentPlacement) => number = () => 0
) {
  const ordered = [...placements].sort((a, b) => a.y - b.y || a.x - b.x);
  const byCell = new Map(ordered.map((placement) => [cellKey(placement.x, placement.y), placement]));
  const selected = new Map(ordered.map((placement) => [cellKey(placement.x, placement.y), placement.tile]));

  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    const work = pass % 2 === 0 ? ordered : [...ordered].reverse();
    for (const placement of work) {
      const candidates = [...new Set(placement.candidates)];
      if (candidates.length <= 1) continue;
      const key = cellKey(placement.x, placement.y);
      const current = selected.get(key) ?? placement.tile;
      const currentScore = alignmentScore(placement, current, byCell, selected, readExistingTile, edgeSignatureForTile, candidatePenalty);
      let best = current;
      let bestScore = currentScore;
      for (const candidate of candidates) {
        const score = alignmentScore(placement, candidate, byCell, selected, readExistingTile, edgeSignatureForTile, candidatePenalty);
        if (score.compared === 0) continue;
        if (
          bestScore.compared === 0
          || score.error < bestScore.error - 0.0001
          || (Math.abs(score.error - bestScore.error) <= 0.0001 && tieRank(candidate, placement) < tieRank(best, placement))
        ) {
          best = candidate;
          bestScore = score;
        }
      }
      if (best !== current) {
        selected.set(key, best);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return selected;
}

function alignmentScore(
  placement: SmartTerrainAlignmentPlacement,
  tile: number,
  byCell: Map<string, SmartTerrainAlignmentPlacement>,
  selected: Map<string, number>,
  readExistingTile: (x: number, y: number) => number | null,
  edgeSignatureForTile: (tile: number) => SmartTerrainEdgeSignature | null,
  candidatePenalty: (tile: number, placement: SmartTerrainAlignmentPlacement) => number
) {
  const signature = edgeSignatureForTile(tile);
  if (!signature) return { error: Number.POSITIVE_INFINITY, compared: 0 };
  let error = 0;
  let compared = 0;
  for (const direction of NEIGHBORS) {
    const x = placement.x + direction.dx;
    const y = placement.y + direction.dy;
    const neighborKey = cellKey(x, y);
    const neighborTile = byCell.has(neighborKey) ? selected.get(neighborKey) ?? null : readExistingTile(x, y);
    if (neighborTile === null) continue;
    const neighborSignature = edgeSignatureForTile(neighborTile);
    if (!neighborSignature) continue;
    const mismatch = edgeMismatch(signature[direction.edge], neighborSignature[direction.opposite]);
    if (mismatch === null) continue;
    error += mismatch;
    compared += 1;
  }
  return { error: compared > 0 ? error / compared + Math.max(0, candidatePenalty(tile, placement)) : Number.POSITIVE_INFINITY, compared };
}

function edgeMismatch(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length === 0) return null;
  let error = 0;
  for (let index = 0; index < length; index += 1) error += Math.abs(left[index] - right[index]);
  return error / length;
}

function cellKey(x: number, y: number) {
  return `${x}:${y}`;
}
