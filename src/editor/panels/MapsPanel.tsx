import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EditorState } from "../store";
import { CustomMapStamp, DungeonCellFlag, LevelType, MapEntity, MapPaintMode, MapPaintVariation, MapPreviewFocalPoint, MapPreviewMode, MapRegionSelection, MapViewFlag, MapWorkbenchMode, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, SmartBrushMaskCell, SmartBrushPreset, TilePaletteCategory, TilesetAsset, TriggerRecord } from "../types";
import { RealmzMapCanvas } from "../components/MapCanvas";
import { LandLayoutEditor, LandTileAtlasEditor, MapContextSidebar, MapSelectionSidebar, RandomAreasWorkbench, type LandLayoutCellSelection } from "../components/MapContextSidebar";
import { MapViewFilters } from "../components/MapViewFilters";
import { landlookGroupTiles } from "../map/paintGroups";
import { buildPaintChanges, rectCells } from "../map/regionPaint";
import { clearTileForMap } from "../map/tileClear";
import { DUNGEON_CLEAR_TO_WALL_FLAGS, DUNGEON_DEFAULT_DRAW_FLAGS } from "../map/dungeonCellFlags";
import { buildSmartTerrainChanges, buildSmartTerrainPaintChanges, smartBrushProfileForTileset } from "../map/smartTerrainBrush";
import { builtInStampToMapStamp, customMapStampToMapStamp, superTileStampsForMap } from "../map/superTileStamps";
import { readGlobalMapStamps, writeGlobalMapStamps } from "../map/customMapStamps";
import { randomRectEntityId } from "../map/geometry";

const MAP_WORKBENCH_MODE_STORAGE_KEY = "providence.mapWorkbenchMode.v1";

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextFocus, setContextFocus] = useState<"flags" | "atlas" | "layout" | "source">("flags");
  const [workbenchMode, setWorkbenchMode] = useState<MapWorkbenchMode>(() => readStoredWorkbenchMode());
  const [paintMode, setPaintMode] = useState<MapPaintMode>("brush");
  const [paintVariation, setPaintVariation] = useState<MapPaintVariation>("single");
  const [activePaintGroupId, setActivePaintGroupId] = useState("all");
  const [paintPaletteMode, setPaintPaletteMode] = useState<TilePaletteCategory>("landlook");
  const [dungeonDrawFlags, setDungeonDrawFlags] = useState<Record<DungeonCellFlag, boolean>>(DUNGEON_DEFAULT_DRAW_FLAGS);
  const [activeCustomPaletteId, setActiveCustomPaletteId] = useState<string | null>(null);
  const [selectedSuperTileStampId, setSelectedSuperTileStampId] = useState<string | null>(null);
  const [globalMapStamps, setGlobalMapStamps] = useState<CustomMapStamp[]>(() => readGlobalMapStamps());
  const [paletteVariationTiles, setPaletteVariationTiles] = useState<number[] | null>(null);
  const [previewMode, setPreviewMode] = useState<MapPreviewMode>("off");
  const [previewFocalPoint, setPreviewFocalPoint] = useState<MapPreviewFocalPoint | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<MapRegionSelection | null>(null);
  const [smartBrushPreset, setSmartBrushPreset] = useState<SmartBrushPreset>("mountains");
  const [smartBrushMask, setSmartBrushMask] = useState<SmartBrushMaskCell[]>([]);
  const [smartBrushDrawing, setSmartBrushDrawing] = useState(false);
  const [selectedLayoutCell, setSelectedLayoutCell] = useState<LandLayoutCellSelection>(null);
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
    setSelectedRegion(null);
    setSmartBrushMask([]);
    setSmartBrushDrawing(false);
    setPreviewFocalPoint(null);
  }, [selectedMap?.id]);
  useEffect(() => {
    localStorage.setItem(MAP_WORKBENCH_MODE_STORAGE_KEY, workbenchMode);
  }, [workbenchMode]);
  useEffect(() => {
    writeGlobalMapStamps(globalMapStamps);
  }, [globalMapStamps]);
  const customPalettes = state.project?.editorMetadata?.tilePalettes ?? [];
  const activeCustomPalette = customPalettes.find((palette) => palette.id === activeCustomPaletteId) ?? customPalettes[0] ?? null;
  const availableSuperTileStamps = useMemo(
    () => [
      ...superTileStampsForMap(selectedMap, selectedTileset).map(builtInStampToMapStamp),
      ...(state.project?.editorMetadata?.mapStamps ?? []).map((stamp) => customMapStampToMapStamp(stamp, "project")),
      ...globalMapStamps.map((stamp) => customMapStampToMapStamp(stamp, "global"))
    ],
    [globalMapStamps, selectedMap, selectedTileset, state.project?.editorMetadata?.mapStamps]
  );
  const selectedSuperTileStamp = availableSuperTileStamps.find((stamp) => stamp.id === selectedSuperTileStampId) ?? availableSuperTileStamps[0] ?? null;
  const variationTiles = paletteVariationTiles;
  const smartBrushPlan = useMemo(
    () => buildSmartTerrainChanges(selectedMap, smartBrushMask, smartBrushPreset, selectedTileset, atlas),
    [atlas, selectedMap, selectedTileset, smartBrushMask, smartBrushPreset]
  );
  const visibleSmartBrushPlan = smartBrushDrawing
    ? {
        cells: [],
        skipped: [],
        changedCount: 0,
        skippedCount: 0,
        profileConfidence: smartBrushPlan.profileConfidence,
        reason: smartBrushMask.length > 0 ? "Release the pointer to resolve the full smart terrain shape." : "Draw a smart terrain mask on the map."
      }
    : smartBrushPlan;
  useEffect(() => {
    if (customPalettes.length === 0) {
      if (activeCustomPaletteId !== null) setActiveCustomPaletteId(null);
      return;
    }
    if (!activeCustomPaletteId || !customPalettes.some((palette) => palette.id === activeCustomPaletteId)) {
      setActiveCustomPaletteId(customPalettes[0].id);
    }
  }, [activeCustomPaletteId, customPalettes]);
  useEffect(() => {
    if (availableSuperTileStamps.length === 0) {
      if (selectedSuperTileStampId !== null) setSelectedSuperTileStampId(null);
      return;
    }
    if (!selectedSuperTileStampId || !availableSuperTileStamps.some((stamp) => stamp.id === selectedSuperTileStampId)) {
      setSelectedSuperTileStampId(availableSuperTileStamps[0].id);
    }
  }, [availableSuperTileStamps, selectedSuperTileStampId]);
  useEffect(() => {
    if (paintMode !== "smart") return;
    if (!selectedMap || selectedMap.levelType !== "land" || smartBrushProfileForTileset(selectedTileset) == null) {
      setPaintMode("brush");
      setSmartBrushMask([]);
      setSmartBrushDrawing(false);
    }
  }, [paintMode, selectedMap, selectedTileset]);
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
  const openCanvasTool = (tool: EditorState["activeTool"]) => {
    setWorkbenchMode("canvas");
    onSetTool(tool);
    if (tool === "paint" || tool === "stamp") setPaletteOpen(true);
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
        onSetPaletteVariationTiles={setPaletteVariationTiles}
        selectedRegion={selectedRegion}
        onSetSelectedRegion={setSelectedRegion}
        globalMapStamps={globalMapStamps}
        onSetGlobalMapStamps={setGlobalMapStamps}
        onApplyCommand={onApplyCommand}
        paletteOpen={paletteOpen}
        onSetPaletteOpen={setPaletteOpen}
        dungeonDrawFlags={dungeonDrawFlags}
        onSetDungeonDrawFlags={setDungeonDrawFlags}
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
        onSelectMap={onSelectMap}
        onSelectTile={onSelectTile}
        contextFocus={contextFocus}
        onSetContextFocus={setContextFocus}
        previewMode={previewMode}
        previewFocalPoint={previewFocalPoint ?? state.selectedCell ?? defaultPreviewFocalPoint(selectedMap)}
        onSetPreviewMode={setPreviewMode}
        onSetPreviewFocalPoint={setPreviewFocalPoint}
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
        onClearSmartBrushMask={() => {
          setSmartBrushMask([]);
          setSmartBrushDrawing(false);
        }}
        onApplySmartBrush={() => {
          if (!selectedMap) return;
          const cells = buildSmartTerrainPaintChanges(smartBrushPlan);
          if (cells.length === 0) return;
          onApplyCommand({
            kind: "paintTiles",
            label: `Smart ${smartBrushPreset} terrain`,
            mapId: selectedMap.id,
            cells
          });
          setSmartBrushMask([]);
        }}
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

function readStoredWorkbenchMode(): MapWorkbenchMode {
  if (typeof localStorage === "undefined") return "canvas";
  const stored = localStorage.getItem(MAP_WORKBENCH_MODE_STORAGE_KEY);
  return MAP_WORKBENCH_MODES.some((mode) => mode.id === stored) ? (stored as MapWorkbenchMode) : "canvas";
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
