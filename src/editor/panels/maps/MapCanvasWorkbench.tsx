import { useMemo } from "react";
import { RealmzMapCanvas } from "../../components/MapCanvas";
import { MapViewFilters } from "../../components/MapViewFilters";
import { randomRectEntityId } from "../../map/geometry";
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
    }
  } = workbench;
  const visibleTriggers = useMemo(
    () => state.showTriggers ? mapTriggers : [],
    [mapTriggers, state.showTriggers]
  );
  const visibleRandomLevel = useMemo(() => {
    if (!selectedMap || !selectedRandomLevel || !state.showRandomRects) return null;
    if (state.visibleRandomRectIds.length === 0) return selectedRandomLevel;
    const visibleIds = new Set(state.visibleRandomRectIds);
    const rects = selectedRandomLevel.rects.filter((rect) => visibleIds.has(randomRectEntityId(selectedMap, rect.rectIndex)));
    return rects.length > 0 ? { ...selectedRandomLevel, rects } : null;
  }, [selectedMap, selectedRandomLevel, state.showRandomRects, state.visibleRandomRectIds]);
  const visibleMapRecords = useMemo(() => {
    if (!state.showMapRecords) return [];
    if (state.visibleMapRecordIds.length === 0) return mapRecords;
    const visibleIds = new Set(state.visibleMapRecordIds);
    return mapRecords.filter((record) => {
      const recordId = semanticMapRecordId(record);
      return recordId != null && visibleIds.has(recordId);
    });
  }, [mapRecords, state.showMapRecords, state.visibleMapRecordIds]);
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
        <MapEmptyState hasProject={state.project != null} onCreateMap={onCreateMap} />
      )}
    </>
  );
}
function MapEmptyState({
  hasProject,
  onCreateMap
}: {
  hasProject: boolean;
  onCreateMap: (levelType: LevelType) => void;
}) {
  return (
    <div className="room-canvas-placeholder map-empty-state">
      <div>
        <h2>{hasProject ? "Create your first map" : "Open a project to begin mapping"}</h2>
        <p>{hasProject ? "Start with a blank outdoor land map or a dungeon map, then paint tiles and add authoring data." : "Create or import a Providence project to browse maps."}</p>
      </div>
      {hasProject && (
        <div className="map-empty-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onCreateMap("land")}>
            New Land Map
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => onCreateMap("dungeon")}>
            New Dungeon Map
          </button>
        </div>
      )}
    </div>
  );
}

function semanticMapRecordId(record: SemanticEntity) {
  const summaryId = record.summary.id;
  if (typeof summaryId === "number" && Number.isFinite(summaryId)) return Math.trunc(summaryId);
  const match = /^map-record:(-?\d+)$/.exec(record.id);
  return match ? Number(match[1]) : null;
}
