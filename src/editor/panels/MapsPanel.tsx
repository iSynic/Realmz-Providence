import { useEffect, useMemo, type ReactNode } from "react";
import { EditorState } from "../store";
import { LevelType, MapEntity, MapPreviewFocalPoint, MapViewFlag, MapWorkbenchMode, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { RealmzMapCanvas } from "../components/MapCanvas";
import { LandLayoutEditor, LandTileAtlasEditor, MapContextSidebar, MapSelectionSidebar, RandomAreasWorkbench } from "../components/MapContextSidebar";
import { MapViewFilters } from "../components/MapViewFilters";
import { buildPaintChanges, rectCells } from "../map/regionPaint";
import { clearTileForMap } from "../map/tileClear";
import { DUNGEON_CLEAR_TO_WALL_FLAGS } from "../map/dungeonCellFlags";
import { randomRectEntityId } from "../map/geometry";
import { useMapWorkbenchState } from "./maps/useMapWorkbenchState";

const MAP_WORKBENCH_MODES: Array<{ id: MapWorkbenchMode; label: string; description: string }> = [
  { id: "canvas", label: "Canvas", description: "Paint, sample, place Action Points, edit regions, and work directly on the map." },
  { id: "land-layout", label: "Land Layout", description: "Edit outdoor level adjacency for off-map travel." },
  { id: "land-tiles", label: "Land Tiles", description: "Inspect landlook tiles, movement metadata, and combat expansion." },
  { id: "random-areas", label: "Random Encounters", description: "Edit random encounter rectangles: priority, chance, battles, text, sounds, and extra AP doors." }
];

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
      setPreviewFocalPoint,
      selectedLayoutCell,
      setSelectedLayoutCell
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
      setSmartBrushMask,
      smartBrushDrawing,
      setSmartBrushDrawing,
      smartBrushPlan,
      visibleSmartBrushPlan,
      clearSmartBrushMask,
      applySmartBrush
    },
    openCanvasTool
  } = useMapWorkbenchState({
    project: state.project,
    selectedMap,
    selectedTileset,
    atlas,
    onSetTool,
    onApplyCommand
  });
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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextEditingTarget(event.target)) return;
      if (event.key === "Escape") {
        if (!selectedRegion && !state.selectedCell && !state.selectedEntity) return;
        event.preventDefault();
        setSelectedRegion(null);
        onClearSelection();
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (workbenchMode !== "canvas" || state.activeTool !== "select" || !selectedMap) return;
      const clearTile = clearTileForMap(selectedMap, selectedTileset);
      const cells = selectedRegion
        ? rectCells(selectedMap, selectedRegion)
        : state.selectedCell
          ? rectCells(selectedMap, { left: state.selectedCell.x, top: state.selectedCell.y, right: state.selectedCell.x, bottom: state.selectedCell.y })
          : [];
      if (selectedMap.levelType === "dungeon") {
        if (cells.length === 0) return;
        event.preventDefault();
        onApplyCommand({
          kind: "updateDungeonCellFlags",
          label: selectedRegion ? "Clear selected dungeon region" : "Clear selected dungeon cell",
          mapId: selectedMap.id,
          flags: DUNGEON_CLEAR_TO_WALL_FLAGS,
          cells: cells.map((cell) => ({ x: cell.x, y: cell.y, index: cell.index, from: cell.tile }))
        });
        return;
      }
      const changes = buildPaintChanges(selectedMap, cells, clearTile);
      if (changes.length === 0) return;
      event.preventDefault();
      onApplyCommand({
        kind: "paintTiles",
        label: selectedRegion ? "Clear selected region" : "Clear selected tile",
        mapId: selectedMap.id,
        cells: changes
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onApplyCommand, onClearSelection, selectedMap, selectedRegion, selectedTileset, state.activeTool, state.selectedCell, state.selectedEntity, workbenchMode]);
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
        previewFocalPoint={previewFocalPoint ?? state.selectedCell ?? defaultPreviewFocalPoint(selectedMap)}
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
                previewFocalPoint={previewFocalPoint ?? state.selectedCell ?? defaultPreviewFocalPoint(selectedMap)}
                focusTarget={state.focusTarget}
                selectedEntity={state.selectedEntity}
                selectedCell={state.selectedCell}
                selectedRegion={selectedRegion}
                smartBrushMask={smartBrushMask}
                smartBrushPlan={paintMode === "smart" ? visibleSmartBrushPlan : null}
                smartBrushDrawing={paintMode === "smart" && smartBrushDrawing}
                globalMapStamps={globalMapStamps}
                onSelectCell={onSelectCell}
                onSetSelectedRegion={setSelectedRegion}
                onClearSelection={onClearSelection}
                onSetSmartBrushMask={setSmartBrushMask}
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
              <MapEmptyState project={state.project} onCreateMap={createScenarioMap} />
            )}
          </>
        )}
        {workbenchMode === "land-layout" && (
          <MapModeSurface
            title="Land Layout"
            subtitle="Outdoor level adjacency. Blank cells disable edge travel; Land 0 is stored as -1 for Realmz."
          >
            <LandLayoutEditor
              project={state.project}
              selectedMap={selectedMap}
              atlasEntries={state.atlasEntries}
              icons={state.iconEntries}
              selectedCell={selectedLayoutCell}
              onSetSelectedCell={setSelectedLayoutCell}
              onSelectMap={onSelectMap}
              onApplyCommand={onApplyCommand}
            />
          </MapModeSurface>
        )}
        {workbenchMode === "land-tiles" && (
          <MapModeSurface
            title="Land Tiles And Combat Tiles"
            subtitle="Inspect the current landlook, tile movement metadata, and Realmz combat-map expansion."
          >
            <LandTileAtlasEditor
              project={state.project}
              selectedMapId={selectedMap?.id ?? null}
              selectedTileset={selectedTileset}
              atlas={atlas}
              atlasEntries={state.atlasEntries}
              icons={state.iconEntries}
              selectedPaintTile={state.selectedTile}
              onSelectTile={onSelectTile}
              onApplyCommand={onApplyCommand}
            />
          </MapModeSurface>
        )}
        {workbenchMode === "random-areas" && (
          <MapModeSurface
            title="Random Encounter Areas"
            subtitle="Realmz checks random encounter rectangle slots from 19 down to 0. Edit fields here or draw rectangles on the canvas."
          >
            <RandomAreasWorkbench
              selectedMap={selectedMap}
              randomLevel={selectedRandomLevel}
              onSetWorkbenchMode={switchWorkbenchMode}
              onSetViewFlag={onSetViewFlag}
              onSetTool={openCanvasTool}
              onSelectEntity={onSelectEntity}
              onApplyCommand={onApplyCommand}
            />
          </MapModeSurface>
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

function MapEmptyState({
  project,
  onCreateMap
}: {
  project: Project | null;
  onCreateMap: (levelType: LevelType) => void;
}) {
  return (
    <div className="room-canvas-placeholder map-empty-state">
      <div>
        <h2>{project ? "Create your first map" : "Open a project to begin mapping"}</h2>
        <p>{project ? "Start with a blank outdoor land map or a dungeon map, then paint tiles and add authoring data." : "Create or import a Providence project to browse maps."}</p>
      </div>
      {project && (
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

function nextMapIndex(maps: MapEntity[], levelType: LevelType) {
  return maps
    .filter((map) => map.levelType === levelType)
    .reduce((max, map) => Math.max(max, map.index), -1) + 1;
}

function semanticMapRecordId(record: SemanticEntity) {
  const summaryId = record.summary.id;
  if (typeof summaryId === "number" && Number.isFinite(summaryId)) return Math.trunc(summaryId);
  const match = /^map-record:(-?\d+)$/.exec(record.id);
  return match ? Number(match[1]) : null;
}

function MapModeSurface({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="map-mode-surface">
      <div className="map-mode-header">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="map-mode-body">
        {children}
      </div>
    </div>
  );
}

function defaultPreviewFocalPoint(map: MapEntity | null): MapPreviewFocalPoint {
  return {
    x: Math.max(0, Math.min(89, Math.floor((map?.width ?? 90) / 2))),
    y: Math.max(0, Math.min(89, Math.floor((map?.height ?? 90) / 2)))
  };
}

type EditorStateSetter<Key extends keyof EditorState> = (value: EditorState[Key]) => void;

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}
