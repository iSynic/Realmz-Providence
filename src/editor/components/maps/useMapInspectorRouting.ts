import { useEffect, useState } from "react";
import type { EditorState } from "../../store";
import type {
  EditorTool,
  MapEntity,
  MapRegionSelection,
  MapWorkbenchMode,
  RandomLevel,
  SemanticEntity,
  TriggerRecord
} from "../../types";
import type { ConnectedCellSelection } from "../../map/connectedMapSelection";
import {
  compatibleMapTool,
  resolveMapInspectorRoute,
  transitionToMapInspector,
  type MapSidebarInspector
} from "./mapInspectorRouting";
import { resolveMapSelection } from "./mapSelectionModel";

const OPEN_STORAGE_KEY = "providence.mapRightContextOpen.v1";

export function useMapInspectorRouting({
  state,
  selectedMap,
  selectedRandomLevel,
  mapTriggers,
  mapRecords,
  selectedRegion,
  connectedSelection,
  workbenchMode,
  onSetTool,
  onSetSelectedRegion,
  onSetConnectedSelection,
  onClearSelection,
  onSetWorkbenchMode
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  mapRecords: SemanticEntity[];
  selectedRegion: MapRegionSelection | null;
  connectedSelection: ConnectedCellSelection | null;
  workbenchMode: MapWorkbenchMode;
  onSetTool: (tool: EditorTool) => void;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  onSetConnectedSelection: (selection: ConnectedCellSelection | null) => void;
  onClearSelection: () => void;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
}) {
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_STORAGE_KEY) !== "0");

  useEffect(() => {
    localStorage.setItem(OPEN_STORAGE_KEY, open ? "1" : "0");
  }, [open]);
  useEffect(() => {
    const compatibleTool = compatibleMapTool(selectedMap?.levelType ?? null, state.activeTool);
    if (compatibleTool !== state.activeTool) onSetTool(compatibleTool);
  }, [onSetTool, selectedMap?.levelType, state.activeTool]);

  const selection = resolveMapSelection(
    selectedMap,
    state.selectedEntity,
    state.selectedCell,
    selectedRegion,
    connectedSelection,
    mapTriggers,
    selectedRandomLevel,
    mapRecords
  );
  const selectedMapIsDungeon = selectedMap?.levelType === "dungeon";
  const route = resolveMapInspectorRoute({
    workbenchMode,
    activeTool: state.activeTool,
    levelType: selectedMap?.levelType ?? null,
    hasSelection: selection != null,
    hasSelectedRegion: selectedRegion != null
  });
  const switchInspector = (choice: MapSidebarInspector) => {
    const transition = transitionToMapInspector(choice, { isDungeon: selectedMapIsDungeon, hasSelection: selection != null });
    if (!transition) return;
    if (transition.clearRegion) onSetSelectedRegion(null);
    if (transition.clearSelection) {
      onSetConnectedSelection(null);
      onClearSelection();
    }
    onSetWorkbenchMode(transition.workbenchMode);
    if (transition.tool) onSetTool(transition.tool);
  };

  return {
    open,
    setOpen,
    selection,
    selectedMapIsDungeon,
    route,
    activeSelection: route.showSelection ? selection : null,
    switchInspector
  };
}
