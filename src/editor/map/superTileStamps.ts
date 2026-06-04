import { CustomMapStamp, MapEntity, PaintCellChange, TilesetAsset } from "../types";
import { mapTileIndex, tileValueAt } from "./geometry";
import { standardTileValues } from "./tileMetadata";

export type SuperTileStampCell = {
  dx: number;
  dy: number;
  tile: number;
};

export type MapStampSource = "built-in" | "project" | "global";

export type MapStamp = {
  id: string;
  label: string;
  source: MapStampSource;
  description: string;
  width?: number;
  height?: number;
  cells: SuperTileStampCell[];
};

export type SuperTileStamp = {
  id: string;
  label: string;
  source?: "built-in";
  category: "trees" | "structures";
  description: string;
  cells: SuperTileStampCell[];
};

export const SUPER_TILE_STAMPS: SuperTileStamp[] = [
  {
    id: "tree-pair-151-152",
    label: "Tree 151/152",
    category: "trees",
    description: "Vertical two-cell Realmz tree art with the leafy crown above the trunk.",
    cells: [
      { dx: 0, dy: 0, tile: 151 },
      { dx: 0, dy: 1, tile: 152 }
    ]
  },
  {
    id: "tree-pair-153-154",
    label: "Tree 153/154",
    category: "trees",
    description: "Vertical two-cell Realmz tree art with the leafy crown above the trunk.",
    cells: [
      { dx: 0, dy: 0, tile: 153 },
      { dx: 0, dy: 1, tile: 154 }
    ]
  },
  {
    id: "structure-dome-91-90",
    label: "Dome -91/-90",
    category: "structures",
    description: "Side-by-side special land dome fragments from the Realmz reference cicn set.",
    cells: [
      { dx: 0, dy: 0, tile: -91 },
      { dx: 1, dy: 0, tile: -90 }
    ]
  },
  {
    id: "structure-house-75-72",
    label: "House -75/-72",
    category: "structures",
    description: "Four-cell yellow building assembled from Realmz special land pieces.",
    cells: [
      { dx: 0, dy: 0, tile: -75 },
      { dx: 1, dy: 0, tile: -74 },
      { dx: 0, dy: 1, tile: -73 },
      { dx: 1, dy: 1, tile: -72 }
    ]
  },
  {
    id: "structure-castle-93-92",
    label: "Castle -93/-92",
    category: "structures",
    description: "Two-cell special land castle from authored map placement.",
    cells: [
      { dx: 0, dy: 0, tile: -93 },
      { dx: 1, dy: 0, tile: -92 }
    ]
  },
  {
    id: "structure-red-building-64-67",
    label: "Red Building -64/-67",
    category: "structures",
    description: "Four-cell red building from authored map placement.",
    cells: [
      { dx: 0, dy: 0, tile: -64 },
      { dx: 1, dy: 0, tile: -65 },
      { dx: 0, dy: 1, tile: -66 },
      { dx: 1, dy: 1, tile: -67 }
    ]
  },
  {
    id: "structure-temple-63-60",
    label: "Temple -63/-60",
    category: "structures",
    description: "Four-cell temple from authored map placement.",
    cells: [
      { dx: 0, dy: 0, tile: -63 },
      { dx: 1, dy: 0, tile: -62 },
      { dx: 0, dy: 1, tile: -61 },
      { dx: 1, dy: 1, tile: -60 }
    ]
  },
  {
    id: "structure-gold-hall-59-56",
    label: "Gold Hall -59/-56",
    category: "structures",
    description: "Four-cell gold hall from authored map placement.",
    cells: [
      { dx: 0, dy: 0, tile: -59 },
      { dx: 1, dy: 0, tile: -58 },
      { dx: 0, dy: 1, tile: -57 },
      { dx: 1, dy: 1, tile: -56 }
    ]
  },
  {
    id: "structure-arch-52-55",
    label: "Arch -52/-55",
    category: "structures",
    description: "Four-cell arch from authored map placement.",
    cells: [
      { dx: 0, dy: 0, tile: -52 },
      { dx: 1, dy: 0, tile: -53 },
      { dx: 0, dy: 1, tile: -54 },
      { dx: 1, dy: 1, tile: -55 }
    ]
  },
  {
    id: "structure-stone-hall-38-37",
    label: "Stone Hall -38/-37",
    category: "structures",
    description: "Side-by-side stone hall fragments from the Realmz reference cicn set.",
    cells: [
      { dx: 0, dy: 0, tile: -38 },
      { dx: 1, dy: 0, tile: -37 }
    ]
  },
  {
    id: "structure-wooden-tower-50-51",
    label: "Wooden Tower -50/-51",
    category: "structures",
    description: "Vertical two-cell wooden lookout tower with the roof above the legs.",
    cells: [
      { dx: 0, dy: 0, tile: -50 },
      { dx: 0, dy: 1, tile: -51 }
    ]
  },
  {
    id: "structure-red-tower-36-33",
    label: "Red Tower -36/-33",
    category: "structures",
    description: "Four-cell red tower from authored map placement.",
    cells: [
      { dx: 0, dy: 0, tile: -36 },
      { dx: 1, dy: 0, tile: -35 },
      { dx: 0, dy: 1, tile: -34 },
      { dx: 1, dy: 1, tile: -33 }
    ]
  },
  {
    id: "structure-green-gate-30-31",
    label: "Green Gate -30/-31",
    category: "structures",
    description: "Four-cell green gate from authored map placement.",
    cells: [
      { dx: 0, dy: 0, tile: -30 },
      { dx: 1, dy: 0, tile: -29 },
      { dx: 0, dy: 1, tile: -32 },
      { dx: 1, dy: 1, tile: -31 }
    ]
  },
  {
    id: "structure-gnarled-root-25-28",
    label: "Gnarled Root -25/-28",
    category: "structures",
    description: "Four-cell gnarled root landmark from authored map placement.",
    cells: [
      { dx: 0, dy: 0, tile: -26 },
      { dx: 1, dy: 0, tile: -25 },
      { dx: 0, dy: 1, tile: -28 },
      { dx: 1, dy: 1, tile: -27 }
    ]
  }
];

export function superTileStampsForMap(map: MapEntity | null, tileset: TilesetAsset | null) {
  if (!map || map.levelType !== "land") return [];
  const standardTiles = new Set(standardTileValues(tileset));
  return SUPER_TILE_STAMPS.filter((stamp) => {
    if (stamp.category !== "trees") return true;
    return stamp.cells.every((cell) => standardTiles.has(cell.tile));
  });
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

export function superTileStampPreviewCells(map: MapEntity, stamp: MapStamp, origin: { x: number; y: number }) {
  return stamp.cells
    .map((cell) => ({ x: origin.x + cell.dx, y: origin.y + cell.dy, tile: cell.tile }))
    .filter((cell) => cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height);
}
