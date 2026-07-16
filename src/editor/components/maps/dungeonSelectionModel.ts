import { activeManagedDungeonFlags, DUNGEON_CELL_FLAG_DEFINITIONS, dungeonCellMask } from "../../map/dungeonCellFlags";
import { mapTileIndex, tileValueAt } from "../../map/geometry";
import { rectCells } from "../../map/regionPaint";
import type { MapEntity } from "../../types";
import { regionLabel } from "./mapRegionUiUtils";
import type { MapSelection } from "./mapSelectionModel";

type DungeonSelection = Extract<MapSelection, { kind: "cell" }> | Extract<MapSelection, { kind: "region" }>;

export const DUNGEON_FLAG_SECTIONS = [
  { id: "structure", title: "Structure", eyebrow: "walls, doors, and features", groups: ["Shape"], defaultOpen: true },
  { id: "movement", title: "Movement", eyebrow: "secret and walkable directions", groups: ["Movement"], defaultOpen: true },
  { id: "runtime", title: "Runtime", eyebrow: "visibility and combat", groups: ["Visibility", "Combat"], defaultOpen: false }
] as const;

export function dungeonFlagDefinitionsForSection(section: (typeof DUNGEON_FLAG_SECTIONS)[number]) {
  return DUNGEON_CELL_FLAG_DEFINITIONS.filter((definition) => section.groups.some((group) => group === definition.group));
}

export function resolveDungeonSelection(map: MapEntity, selection: DungeonSelection) {
  const selectedCell = selection.kind === "cell"
    ? {
        ...selection.cell,
        index: mapTileIndex(map, selection.cell.x, selection.cell.y),
        tile: tileValueAt(map, selection.cell.x, selection.cell.y)
      }
    : null;
  const cells = selection.kind === "cell"
    ? selectedCell ? [selectedCell] : []
    : rectCells(map, selection.region);
  const values = cells.map((cell) => cell.tile);
  return {
    cells,
    values,
    managedFlags: activeManagedDungeonFlags(values),
    selectedCellTile: selectedCell?.tile ?? null,
    scopeLabel: selection.kind === "cell"
      ? `${selection.cell.x}, ${selection.cell.y}`
      : regionLabel(selection.region),
    scopeTitle: selection.kind === "cell" ? "Selected Cell" : "Selected Region"
  };
}

export function summarizeRawDungeonValues(values: number[]) {
  if (values.length === 0) return "none";
  const unique = [...new Set(values)];
  if (unique.length === 1) return String(unique[0]);
  return `${unique.length} values`;
}

export function summarizeDungeonMasks(values: number[]) {
  if (values.length === 0) return "none";
  const unique = [...new Set(values.map((value) => `0x${dungeonCellMask(value).toString(16).padStart(4, "0")}`))];
  return unique.length === 1 ? unique[0] : `${unique.length} masks`;
}
