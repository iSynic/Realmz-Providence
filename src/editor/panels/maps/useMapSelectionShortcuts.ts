import { useEffect } from "react";
import { buildPaintChanges, rectCells } from "../../map/regionPaint";
import { clearTileForMap } from "../../map/tileClear";
import { DUNGEON_CLEAR_TO_WALL_FLAGS } from "../../map/dungeonCellFlags";
import type { EditorState } from "../../store";
import type { MapEntity, MapRegionSelection, MapWorkbenchMode, ProjectCommand, TilesetAsset } from "../../types";

export function useMapSelectionShortcuts({
  activeTool,
  selectedCell,
  hasSelectedEntity,
  selectedMap,
  selectedRegion,
  selectedTileset,
  workbenchMode,
  onApplyCommand,
  onClearSelection,
  onSetSelectedRegion
}: {
  activeTool: EditorState["activeTool"];
  selectedCell: EditorState["selectedCell"];
  hasSelectedEntity: boolean;
  selectedMap: MapEntity | null;
  selectedRegion: MapRegionSelection | null;
  selectedTileset: TilesetAsset | null;
  workbenchMode: MapWorkbenchMode;
  onApplyCommand: (command: ProjectCommand) => void;
  onClearSelection: () => void;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      if (event.key === "Escape") {
        if (!selectedRegion && !selectedCell && !hasSelectedEntity) return;
        event.preventDefault();
        onSetSelectedRegion(null);
        onClearSelection();
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (workbenchMode !== "canvas" || activeTool !== "select") return;
      const command = buildMapClearCommand(selectedMap, selectedTileset, selectedRegion, selectedCell);
      if (!command) return;
      event.preventDefault();
      onApplyCommand(command);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, hasSelectedEntity, onApplyCommand, onClearSelection, onSetSelectedRegion, selectedCell, selectedMap, selectedRegion, selectedTileset, workbenchMode]);
}

export function buildMapClearCommand(
  selectedMap: MapEntity | null,
  selectedTileset: TilesetAsset | null,
  selectedRegion: MapRegionSelection | null,
  selectedCell: EditorState["selectedCell"]
): ProjectCommand | null {
  if (!selectedMap) return null;
  const cells = selectedRegion
    ? rectCells(selectedMap, selectedRegion)
    : selectedCell
      ? rectCells(selectedMap, { left: selectedCell.x, top: selectedCell.y, right: selectedCell.x, bottom: selectedCell.y })
      : [];
  if (cells.length === 0) return null;
  if (selectedMap.levelType === "dungeon") {
    return {
      kind: "updateDungeonCellFlags",
      label: selectedRegion ? "Clear selected dungeon region" : "Clear selected dungeon cell",
      mapId: selectedMap.id,
      flags: DUNGEON_CLEAR_TO_WALL_FLAGS,
      cells: cells.map((cell) => ({ x: cell.x, y: cell.y, index: cell.index, from: cell.tile }))
    };
  }
  const changes = buildPaintChanges(selectedMap, cells, clearTileForMap(selectedMap, selectedTileset));
  if (changes.length === 0) return null;
  return {
    kind: "paintTiles",
    label: selectedRegion ? "Clear selected region" : "Clear selected tile",
    mapId: selectedMap.id,
    cells: changes
  };
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}
