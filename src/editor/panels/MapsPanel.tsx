import { useEffect } from "react";
import type { TransientUndoScope } from "../app/transientUndo";
import { EditorState } from "../store";
import { LevelType, MapEntity, MapPreviewFocalPoint, MapViewFlag, MapWorkbenchMode, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { MapContextSidebar, MapSelectionSidebar } from "../components/MapContextSidebar";
import { buildCreateMapAction } from "../components/maps/mapBrowserModel";
import { MapSectionTabs } from "../components/maps/MapSectionTabs";
import { MapAuxiliaryWorkbenches } from "./maps/MapAuxiliaryWorkbenches";
import { MapCanvasWorkbench } from "./maps/MapCanvasWorkbench";
import { useMapSelectionShortcuts } from "./maps/useMapSelectionShortcuts";
import { useMapWorkbenchState } from "./maps/useMapWorkbenchState";

export function MapsPanel({
  state,
  selectedMap,
  selectedRandomLevel,
  mapTriggers,
  selectedTileset,
  mapRecords,
  atlas,
  onSelectMap,
  onSelectTile,
  onSelectCell,
  onSelectEntity,
  onSetTool,
  onSetZoom,
  onSetSmoothTiles,
  onSetViewFlag,
  onSetVisibleRandomRectIds,
  onSetVisibleMapRecordIds,
  onClearSelection,
  onOpenScripts,
  onBeginPaintStroke,
  onApplyCommand,
  onCommitPaintStroke,
  onCancelPaintStroke,
  onSetTransientUndoScope
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  selectedTileset: TilesetAsset | null;
  mapRecords: SemanticEntity[];
  atlas: EditorState["atlasEntries"][string] | null;
  onSelectMap: (id: string) => void;
  onSelectTile: (tile: number) => void;
  onSelectCell: (cell: { x: number; y: number; tile: number } | null) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSetTool: EditorStateSetter<"activeTool">;
  onSetZoom: (zoom: number) => void;
  onSetSmoothTiles: (value: boolean) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onSetVisibleRandomRectIds: (ids: string[]) => void;
  onSetVisibleMapRecordIds: (ids: number[]) => void;
  onClearSelection: () => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onCommitPaintStroke: () => void;
  onCancelPaintStroke: () => void;
  onSetTransientUndoScope: (scope: TransientUndoScope | null) => void;
}) {
  const workbench = useMapWorkbenchState({
    project: state.project,
    selectedMap,
    selectedTileset,
    atlas,
    onSetTool,
    onApplyCommand
  });
  const {
    shell: {
      contextFocus,
      workbenchMode,
      setWorkbenchMode,
      previewMode,
      setPreviewMode,
      previewFocalPoint,
      setPreviewFocalPoint
    },
    paint: {
      selectedRegion,
      setSelectedRegion
    },
    selection: {
      connectedSelectionMode,
      setConnectedSelectionMode,
      selectionDrawMode,
      setSelectionDrawMode,
      selectionShapeFill,
      setSelectionShapeFill
    },
    openCanvasTool
  } = workbench;
  const {
    paint: { paintMode },
    smartBrush: { canUndoSmartBrushMaskStep, undoSmartBrushMaskStep }
  } = workbench;
  useEffect(() => {
    if (paintMode !== "smart" || !canUndoSmartBrushMaskStep) {
      onSetTransientUndoScope(null);
      return;
    }
    onSetTransientUndoScope({ label: "Smart Brush mask stroke", undo: undoSmartBrushMaskStep });
    return () => onSetTransientUndoScope(null);
  }, [canUndoSmartBrushMaskStep, onSetTransientUndoScope, paintMode, undoSmartBrushMaskStep]);
  useMapSelectionShortcuts({
    activeTool: state.activeTool,
    selectedCell: state.selectedCell,
    hasSelectedEntity: state.selectedEntity != null,
    selectedMap,
    selectedRegion,
    selectedTileset,
    workbenchMode,
    onApplyCommand,
    onClearSelection,
    onSetSelectedRegion: setSelectedRegion
  });
  const resolvedPreviewFocalPoint = previewFocalPoint ?? state.selectedCell ?? defaultPreviewFocalPoint(selectedMap);
  const switchWorkbenchMode = (mode: MapWorkbenchMode) => {
    setWorkbenchMode(mode);
  };
  const createScenarioMap = (levelType: LevelType) => {
    if (!state.project) return;
    const action = buildCreateMapAction(state.project.maps, levelType);
    onApplyCommand(action.command);
    onSelectMap(action.mapId);
    setWorkbenchMode("canvas");
  };
  return (
    <>
      <MapContextSidebar
        state={state}
        selectedMap={selectedMap}
        selectedTileset={selectedTileset}
        atlas={atlas}
        workbenchMode={workbenchMode}
        connectedSelectionMode={connectedSelectionMode}
        selectionDrawMode={selectionDrawMode}
        selectionShapeFill={selectionShapeFill}
        selectedRandomLevel={selectedRandomLevel}
        contextFocus={contextFocus}
        previewMode={previewMode}
        previewFocalPoint={resolvedPreviewFocalPoint}
        onSetPreviewMode={setPreviewMode}
        onSetPreviewFocalPoint={setPreviewFocalPoint}
        onSetWorkbenchMode={switchWorkbenchMode}
        onSetConnectedSelectionMode={setConnectedSelectionMode}
        onSetSelectionDrawMode={setSelectionDrawMode}
        onSetSelectionShapeFill={setSelectionShapeFill}
        onSelectMap={onSelectMap}
        onSetTool={openCanvasTool}
        onSelectTile={onSelectTile}
        onApplyCommand={onApplyCommand}
      />

      <section className={`editor-canvas-area map-workbench-area map-workbench-${workbenchMode}`}>
        <MapSectionTabs value={workbenchMode} onChange={switchWorkbenchMode} />
        {workbenchMode === "canvas" && (
          <MapCanvasWorkbench
            state={state}
            selectedMap={selectedMap}
            selectedRandomLevel={selectedRandomLevel}
            selectedTileset={selectedTileset}
            mapTriggers={mapTriggers}
            mapRecords={mapRecords}
            atlas={atlas}
            workbench={workbench}
            previewFocalPoint={resolvedPreviewFocalPoint}
            onCreateMap={createScenarioMap}
            onSelectTile={onSelectTile}
            onSelectCell={onSelectCell}
            onSelectEntity={onSelectEntity}
            onSetZoom={onSetZoom}
            onSetSmoothTiles={onSetSmoothTiles}
            onSetViewFlag={onSetViewFlag}
            onSetVisibleRandomRectIds={onSetVisibleRandomRectIds}
            onSetVisibleMapRecordIds={onSetVisibleMapRecordIds}
            onClearSelection={onClearSelection}
            onBeginPaintStroke={onBeginPaintStroke}
            onApplyCommand={onApplyCommand}
            onCommitPaintStroke={onCommitPaintStroke}
            onCancelPaintStroke={onCancelPaintStroke}
          />
        )}
        {workbenchMode !== "canvas" && (
          <MapAuxiliaryWorkbenches
            state={state}
            selectedMap={selectedMap}
            selectedRandomLevel={selectedRandomLevel}
            selectedTileset={selectedTileset}
            atlas={atlas}
            workbench={workbench}
            onSelectMap={onSelectMap}
            onSelectTile={onSelectTile}
            onSelectEntity={onSelectEntity}
            onSetViewFlag={onSetViewFlag}
            onApplyCommand={onApplyCommand}
          />
        )}
      </section>
      <MapSelectionSidebar
        context={{
          state,
          selectedMap,
          selectedTileset,
          atlas,
          selectedRandomLevel,
          mapTriggers,
          mapRecords
        }}
        workbench={workbench}
        actions={{
          onSelectTile,
          onSetViewFlag,
          onOpenScripts,
          onClearSelection,
          onSelectEntity,
          onApplyCommand
        }}
      />
    </>
  );
}

type EditorStateSetter<Key extends keyof EditorState> = (value: EditorState[Key]) => void;

function defaultPreviewFocalPoint(map: MapEntity | null): MapPreviewFocalPoint {
  return {
    x: Math.max(0, Math.min(89, Math.floor((map?.width ?? 90) / 2))),
    y: Math.max(0, Math.min(89, Math.floor((map?.height ?? 90) / 2)))
  };
}
