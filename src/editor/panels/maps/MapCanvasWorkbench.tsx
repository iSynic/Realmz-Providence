import { RealmzMapCanvas } from "../../components/MapCanvas";
import { MapViewFilters } from "../../components/MapViewFilters";
import type { EditorState } from "../../store";
import type {
  LevelType,
  MapEntity,
  MapPreviewFocalPoint,
  MapViewFlag,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  SemanticEntity,
  TilesetAsset,
  TriggerRecord
} from "../../types";
import type { MapWorkbenchState } from "./useMapWorkbenchState";
import { useMapCanvasVisibility } from "./useMapCanvasVisibility";
import { MapCanvasEmptyState } from "./MapCanvasEmptyState";
export function MapCanvasWorkbench({
  state,
  selectedMap,
  selectedRandomLevel,
  selectedTileset,
  mapTriggers,
  mapRecords,
  atlas,
  workbench,
  previewFocalPoint,
  onCreateMap,
  onSelectTile,
  onSelectCell,
  onSelectEntity,
  onSetZoom,
  onSetSmoothTiles,
  onSetViewFlag,
  onSetVisibleRandomRectIds,
  onSetVisibleMapRecordIds,
  onClearSelection,
  onBeginPaintStroke,
  onApplyCommand,
  onCommitPaintStroke,
  onCancelPaintStroke
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedRandomLevel: RandomLevel | null;
  selectedTileset: TilesetAsset | null;
  mapTriggers: TriggerRecord[];
  mapRecords: SemanticEntity[];
  atlas: EditorState["atlasEntries"][string] | null;
  workbench: MapWorkbenchState;
  previewFocalPoint: MapPreviewFocalPoint;
  onCreateMap: (levelType: LevelType) => void;
  onSelectTile: (tile: number) => void;
  onSelectCell: (cell: { x: number; y: number; tile: number } | null) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSetZoom: (zoom: number) => void;
  onSetSmoothTiles: (value: boolean) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onSetVisibleRandomRectIds: (ids: string[]) => void;
  onSetVisibleMapRecordIds: (ids: number[]) => void;
  onClearSelection: () => void;
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onCommitPaintStroke: () => void;
  onCancelPaintStroke: () => void;
}) {
  const {
    shell: { previewMode },
    paint: {
      paintMode,
      paintVariation,
      activePaintGroupId,
      dungeonDrawFlags,
      variationTiles,
      selectedRegion,
      setSelectedRegion
    },
    stamps: { globalMapStamps, setGlobalMapStamps, selectedSuperTileStamp, setSelectedSuperTileStampId },
    smartBrush: {
      smartBrushMask,
      smartBrushDrawMode,
      smartBrushShapeFill,
      setSmartBrushMask,
      commitSmartBrushMaskStep,
      smartBrushDrawing,
      setSmartBrushDrawing,
      visibleSmartBrushPlan
    },
    selection: {
      connectedSelection,
      setConnectedSelection,
      connectedSelectionMode,
      selectionDrawMode,
      selectionShapeFill
    },
    safeguards: { protectMapFeatures }
  } = workbench;
  const { visibleTriggers, visibleRandomLevel, visibleMapRecords } = useMapCanvasVisibility({
    selectedMap,
    selectedRandomLevel,
    mapTriggers,
    mapRecords,
    showTriggers: state.showTriggers,
    showRandomRects: state.showRandomRects,
    visibleRandomRectIds: state.visibleRandomRectIds,
    showMapRecords: state.showMapRecords,
    visibleMapRecordIds: state.visibleMapRecordIds
  });
  return (
    <>
      <MapViewFilters
        state={state}
        selectedMap={selectedMap}
        selectedRandomLevel={selectedRandomLevel}
        mapRecords={mapRecords}
        onSetZoom={onSetZoom}
        onSetSmoothTiles={onSetSmoothTiles}
        onSetViewFlag={onSetViewFlag}
        onSetVisibleRandomRectIds={onSetVisibleRandomRectIds}
        onSetVisibleMapRecordIds={onSetVisibleMapRecordIds}
      />
      {selectedMap ? (
        <RealmzMapCanvas
          project={state.project}
          map={selectedMap}
          tileset={selectedTileset}
          atlas={atlas}
          icons={state.iconEntries}
          triggers={visibleTriggers}
          allTriggers={mapTriggers}
          randomLevel={visibleRandomLevel}
          mapRecords={visibleMapRecords}
          activeTool={state.activeTool}
          paintMode={paintMode}
          paintVariation={paintVariation}
          activePaintGroupId={activePaintGroupId}
          variationTiles={variationTiles}
          selectedTile={state.selectedTile}
          selectedSuperTileStamp={selectedSuperTileStamp}
          dungeonDrawFlags={dungeonDrawFlags}
          zoom={state.zoom}
          smoothTiles={state.smoothTiles}
          viewOptions={state}
          tileAttributes={state.project?.tileAttributes ?? []}
          showRandomRects={Boolean(visibleRandomLevel)}
          showMapRecords={visibleMapRecords.length > 0}
          previewMode={previewMode}
          previewFocalPoint={previewFocalPoint}
          focusTarget={state.focusTarget}
          selectedEntity={state.selectedEntity}
          selectedCell={state.selectedCell}
          selectedRegion={selectedRegion}
          connectedSelection={connectedSelection}
          connectedSelectionMode={connectedSelectionMode}
          selectionDrawMode={selectionDrawMode}
          selectionShapeFill={selectionShapeFill}
          smartBrushMask={smartBrushMask}
          smartBrushDrawMode={smartBrushDrawMode}
          smartBrushShapeFill={smartBrushShapeFill}
          smartBrushPlan={paintMode === "smart" ? visibleSmartBrushPlan : null}
          smartBrushDrawing={paintMode === "smart" && smartBrushDrawing}
          protectMapFeatures={protectMapFeatures}
          globalMapStamps={globalMapStamps}
          onSelectCell={onSelectCell}
          onSetSelectedRegion={setSelectedRegion}
          onSetConnectedSelection={setConnectedSelection}
          onClearSelection={onClearSelection}
          onSetSmartBrushMask={setSmartBrushMask}
          onCommitSmartBrushMaskStep={commitSmartBrushMaskStep}
          onSetSmartBrushDrawing={setSmartBrushDrawing}
          onSampleTile={onSelectTile}
          onSelectEntity={onSelectEntity}
          onBeginPaintStroke={onBeginPaintStroke}
          onApplyCommand={onApplyCommand}
          onSetGlobalMapStamps={setGlobalMapStamps}
          onSelectSuperTileStamp={setSelectedSuperTileStampId}
          onCommitPaintStroke={onCommitPaintStroke}
          onCancelPaintStroke={onCancelPaintStroke}
        />
      ) : (
        <MapCanvasEmptyState hasProject={state.project != null} onCreateMap={onCreateMap} />
      )}
    </>
  );
}
