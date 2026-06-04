import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EditorState } from "../store";
import { LevelType, MapEntity, MapPaintMode, MapPaintVariation, MapPreviewFocalPoint, MapPreviewMode, MapRegionSelection, MapViewFlag, MapWorkbenchMode, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilePaletteCategory, TilesetAsset, TriggerRecord } from "../types";
import { triggerOverlayKinds } from "../semanticGraph";
import { RealmzMapCanvas } from "../components/MapCanvas";
import { LandLayoutEditor, LandTileAtlasEditor, MapContextSidebar, MapRecordsWorkbench, MapSelectionSidebar, RandomAreasWorkbench, type LandLayoutCellSelection } from "../components/MapContextSidebar";
import { MapViewFilters } from "../components/MapViewFilters";
import { landlookGroupTiles } from "../map/paintGroups";
import { buildPaintChanges, rectCells } from "../map/regionPaint";
import { clearTileForMap } from "../map/tileClear";

const MAP_WORKBENCH_MODE_STORAGE_KEY = "providence.mapWorkbenchMode.v1";

const MAP_WORKBENCH_MODES: Array<{ id: MapWorkbenchMode; label: string; description: string }> = [
  { id: "canvas", label: "Canvas", description: "Paint, sample, place Action Points, edit regions, and work directly on the map." },
  { id: "land-layout", label: "Land Layout", description: "Edit outdoor level adjacency for off-map travel." },
  { id: "land-tiles", label: "Land Tiles", description: "Inspect landlook tiles, movement metadata, and combat expansion." },
  { id: "random-areas", label: "Random Encounters", description: "Edit random encounter rectangles: priority, chance, battles, text, sounds, and extra AP doors." },
  { id: "map-records", label: "Map Records", description: "Browse and edit map starts, picture links, rectangles, and notes." }
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
  const [activeCustomPaletteId, setActiveCustomPaletteId] = useState<string | null>(null);
  const [paletteVariationTiles, setPaletteVariationTiles] = useState<number[] | null>(null);
  const [previewMode, setPreviewMode] = useState<MapPreviewMode>("off");
  const [previewFocalPoint, setPreviewFocalPoint] = useState<MapPreviewFocalPoint | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<MapRegionSelection | null>(null);
  const [selectedLayoutCell, setSelectedLayoutCell] = useState<LandLayoutCellSelection>(null);
  const [replaceSourceTile, setReplaceSourceTile] = useState<number | null>(null);
  const semanticSchema = state.project?.semanticSchema;
  const visibleTriggers = useMemo(
    () => state.showTriggers ? mapTriggers.filter((trigger) => triggerMatchesViewFilters(state.project, trigger, state)) : [],
    [
      mapTriggers,
      semanticSchema,
      state.showBattleOverlays,
      state.showEncounterOverlays,
      state.showMapOverlays,
      state.showQuestOverlays,
      state.showTextOverlays,
      state.showTriggers,
      state.showUnknownOverlays
    ]
  );
  useEffect(() => {
    setSelectedRegion(null);
    setReplaceSourceTile(null);
    setPreviewFocalPoint(null);
  }, [selectedMap?.id]);
  useEffect(() => {
    localStorage.setItem(MAP_WORKBENCH_MODE_STORAGE_KEY, workbenchMode);
  }, [workbenchMode]);
  useEffect(() => {
    if (paintPaletteMode !== "landlook") return;
    const groupTiles = landlookGroupTiles(selectedTileset, activePaintGroupId);
    if (groupTiles.length > 0 && !groupTiles.includes(state.selectedTile)) {
      onSelectTile(groupTiles[0]);
    }
  }, [activePaintGroupId, onSelectTile, paintPaletteMode, selectedTileset, state.selectedTile]);
  const customPalettes = state.project?.editorMetadata?.tilePalettes ?? [];
  const activeCustomPalette = customPalettes.find((palette) => palette.id === activeCustomPaletteId) ?? customPalettes[0] ?? null;
  const variationTiles = paletteVariationTiles;
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
    if (paintPaletteMode !== "custom") return;
    if (!activeCustomPalette?.tiles.length) return;
    if (!activeCustomPalette.tiles.includes(state.selectedTile)) onSelectTile(activeCustomPalette.tiles[0]);
  }, [activeCustomPalette, onSelectTile, paintPaletteMode, state.selectedTile]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTextEditingTarget(event.target)) return;
      if (workbenchMode !== "canvas" || state.activeTool !== "select" || !selectedMap) return;
      const clearTile = clearTileForMap(selectedMap, selectedTileset);
      const cells = selectedRegion
        ? rectCells(selectedMap, selectedRegion)
        : state.selectedCell
          ? rectCells(selectedMap, { left: state.selectedCell.x, top: state.selectedCell.y, right: state.selectedCell.x, bottom: state.selectedCell.y })
          : [];
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
  }, [onApplyCommand, selectedMap, selectedRegion, selectedTileset, state.activeTool, state.selectedCell, workbenchMode]);
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
    const groupTiles = landlookGroupTiles(selectedTileset, groupId);
    if (groupTiles.length > 0 && !groupTiles.includes(state.selectedTile)) onSelectTile(groupTiles[0]);
  };
  const openCanvasTool = (tool: EditorState["activeTool"]) => {
    setWorkbenchMode("canvas");
    onSetTool(tool);
    if (tool === "paint") setPaletteOpen(true);
  };
  return (
    <>
      <MapContextSidebar
        state={state}
        selectedMap={selectedMap}
        selectedTileset={selectedTileset}
        atlas={atlas}
        workbenchMode={workbenchMode}
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
        replaceSourceTile={replaceSourceTile}
        onSetReplaceSourceTile={setReplaceSourceTile}
        onApplyCommand={onApplyCommand}
        paletteOpen={paletteOpen}
        onSetPaletteOpen={setPaletteOpen}
      />

      <section className={`editor-canvas-area map-workbench-area map-workbench-${workbenchMode}`}>
        {workbenchMode === "canvas" && (
          <>
            <MapViewFilters
              state={state}
              onSetZoom={onSetZoom}
              onSetSmoothTiles={onSetSmoothTiles}
              onSetViewFlag={onSetViewFlag}
            />
            {selectedMap ? (
              <RealmzMapCanvas
                map={selectedMap}
                tileset={selectedTileset}
                atlas={atlas}
                icons={state.iconEntries}
                triggers={visibleTriggers}
                allTriggers={mapTriggers}
                randomLevel={selectedRandomLevel}
                mapRecords={mapRecords}
                activeTool={state.activeTool}
                paintMode={paintMode}
                paintVariation={paintVariation}
                activePaintGroupId={activePaintGroupId}
                variationTiles={variationTiles}
                selectedTile={state.selectedTile}
                zoom={state.zoom}
                smoothTiles={state.smoothTiles}
                viewOptions={state}
                tileAttributes={state.project?.tileAttributes ?? []}
                showRandomRects={state.showRandomRects}
                showMapRecords={state.showMapRecords}
                previewMode={previewMode}
                previewFocalPoint={previewFocalPoint ?? state.selectedCell ?? defaultPreviewFocalPoint(selectedMap)}
                selectedEntity={state.selectedEntity}
                selectedCell={state.selectedCell}
                selectedRegion={selectedRegion}
                onSelectCell={onSelectCell}
                onSetSelectedRegion={setSelectedRegion}
                onSampleTile={onSelectTile}
                onSelectEntity={onSelectEntity}
                onBeginPaintStroke={onBeginPaintStroke}
                onApplyCommand={onApplyCommand}
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
              selectedTileset={selectedTileset}
              atlas={atlas}
              icons={state.iconEntries}
              selectedPaintTile={state.selectedTile}
              onSelectTile={onSelectTile}
              onSetTool={openCanvasTool}
              onOpenPalette={() => {
                setPaletteOpen(true);
                setWorkbenchMode("canvas");
              }}
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
        {workbenchMode === "map-records" && (
          <MapModeSurface
            title="Map Records"
            subtitle="Map records describe starts, picture links, rectangles, notes, and related map navigation."
          >
            <MapRecordsWorkbench
              project={state.project}
              selectedMap={selectedMap}
              mapRecords={mapRecords}
              onSelectMap={onSelectMap}
              onSelectEntity={onSelectEntity}
              onSetWorkbenchMode={switchWorkbenchMode}
              onSetViewFlag={onSetViewFlag}
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
        variationTiles={variationTiles}
        onSetPaletteVariationTiles={setPaletteVariationTiles}
        selectedRegion={selectedRegion}
        onSetSelectedRegion={setSelectedRegion}
        replaceSourceTile={replaceSourceTile}
        onSetReplaceSourceTile={setReplaceSourceTile}
        onSelectEntity={onSelectEntity}
        onClearSelection={onClearSelection}
        onApplyCommand={onApplyCommand}
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

function triggerMatchesViewFilters(project: Project | null, trigger: TriggerRecord, state: EditorState) {
  const kinds = triggerOverlayKinds(project, trigger);
  if (kinds.size === 0) return state.showUnknownOverlays;
  return (
    (kinds.has("encounter") && state.showEncounterOverlays) ||
    (kinds.has("battle") && state.showBattleOverlays) ||
    (kinds.has("map") && state.showMapOverlays) ||
    (kinds.has("text") && state.showTextOverlays) ||
    (kinds.has("quest") && state.showQuestOverlays) ||
    (kinds.has("unknown") && state.showUnknownOverlays)
  );
}
