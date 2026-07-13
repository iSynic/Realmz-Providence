import { EditorState } from "../store";
import { LevelType, MapEntity, MapPreviewFocalPoint, MapViewFlag, MapWorkbenchMode, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { MapContextSidebar, MapSelectionSidebar } from "../components/MapContextSidebar";
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
  onCancelPaintStroke
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
      paletteOpen,
      setPaletteOpen,
      contextFocus,
      setContextFocus,
      workbenchMode,
      setWorkbenchMode,
      previewMode,
      setPreviewMode,
      previewFocalPoint,
      setPreviewFocalPoint
    },
    paint: {
      paintMode,
      setPaintMode,
      paintVariation,
      setPaintVariation,
      activePaintGroupId,
      setActivePaintGroupId,
      paintPaletteMode,
      setPaintPaletteMode,
      dungeonDrawFlags,
      setDungeonDrawFlags,
      activeCustomPaletteId,
      setActiveCustomPaletteId,
      variationTiles,
      setPaletteVariationTiles,
      selectedRegion,
      setSelectedRegion
    },
    stamps: {
      globalMapStamps,
      setGlobalMapStamps,
      selectedSuperTileStamp,
      setSelectedSuperTileStampId
    },
    smartBrush: {
      smartBrushPreset,
      setSmartBrushPreset,
      smartBrushMask,
      visibleSmartBrushPlan,
      clearSmartBrushMask,
      applySmartBrush
    },
    openCanvasTool
  } = workbench;
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
    const index = nextMapIndex(state.project.maps, levelType);
    const id = `${levelType}:${index}`;
    onApplyCommand({ kind: "createMap", label: `Create ${levelType} map`, levelType });
    onSelectMap(id);
    setWorkbenchMode("canvas");
  };
  const setPaintGroup = (groupId: string) => {
    setActivePaintGroupId(groupId);
  };
  return (
    <>
      <MapContextSidebar
        state={state}
        selectedMap={selectedMap}
        selectedTileset={selectedTileset}
        atlas={atlas}
        workbenchMode={workbenchMode}
        selectedRandomLevel={selectedRandomLevel}
        contextFocus={contextFocus}
        previewMode={previewMode}
        previewFocalPoint={resolvedPreviewFocalPoint}
        onSetPreviewMode={setPreviewMode}
        onSetPreviewFocalPoint={setPreviewFocalPoint}
        onSetWorkbenchMode={switchWorkbenchMode}
        onSelectMap={onSelectMap}
        onSetTool={openCanvasTool}
        onSelectTile={onSelectTile}
        onApplyCommand={onApplyCommand}
      />

      <section className={`editor-canvas-area map-workbench-area map-workbench-${workbenchMode}`}>
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
        state={state}
        selectedMap={selectedMap}
        selectedTileset={selectedTileset}
        atlas={atlas}
        workbenchMode={workbenchMode}
        onSetWorkbenchMode={switchWorkbenchMode}
        selectedRandomLevel={selectedRandomLevel}
        mapTriggers={mapTriggers}
        mapRecords={mapRecords}
        onSelectTile={onSelectTile}
        onSetContextFocus={setContextFocus}
        onSetTool={openCanvasTool}
        onSetViewFlag={onSetViewFlag}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenScripts={onOpenScripts}
        paletteOpen={paletteOpen}
        onSetPaletteOpen={setPaletteOpen}
        paintMode={paintMode}
        onSetPaintMode={setPaintMode}
        paintVariation={paintVariation}
        onSetPaintVariation={setPaintVariation}
        activePaintGroupId={activePaintGroupId}
        onSetActivePaintGroup={setPaintGroup}
        paintPaletteMode={paintPaletteMode}
        onSetPaintPaletteMode={setPaintPaletteMode}
        activeCustomPaletteId={activeCustomPaletteId}
        onSetActiveCustomPaletteId={setActiveCustomPaletteId}
        selectedSuperTileStampId={selectedSuperTileStamp?.id ?? null}
        onSelectSuperTileStamp={setSelectedSuperTileStampId}
        variationTiles={variationTiles}
        onSetPaletteVariationTiles={setPaletteVariationTiles}
        selectedRegion={selectedRegion}
        onSetSelectedRegion={setSelectedRegion}
        onClearSelection={onClearSelection}
        globalMapStamps={globalMapStamps}
        onSetGlobalMapStamps={setGlobalMapStamps}
        smartBrushPreset={smartBrushPreset}
        onSetSmartBrushPreset={setSmartBrushPreset}
        smartBrushMask={smartBrushMask}
        smartBrushPlan={visibleSmartBrushPlan}
        onClearSmartBrushMask={clearSmartBrushMask}
        onApplySmartBrush={applySmartBrush}
        onSelectEntity={onSelectEntity}
        onApplyCommand={onApplyCommand}
        dungeonDrawFlags={dungeonDrawFlags}
        onSetDungeonDrawFlags={setDungeonDrawFlags}
      />
    </>
  );
}

function nextMapIndex(maps: MapEntity[], levelType: LevelType) {
  return maps
    .filter((map) => map.levelType === levelType)
    .reduce((max, map) => Math.max(max, map.index), -1) + 1;
}

type EditorStateSetter<Key extends keyof EditorState> = (value: EditorState[Key]) => void;

function defaultPreviewFocalPoint(map: MapEntity | null): MapPreviewFocalPoint {
  return {
    x: Math.max(0, Math.min(89, Math.floor((map?.width ?? 90) / 2))),
    y: Math.max(0, Math.min(89, Math.floor((map?.height ?? 90) / 2)))
  };
}
