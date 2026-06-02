import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EditorState } from "../store";
import { MapEntity, MapPaintMode, MapPaintVariation, MapPreviewFocalPoint, MapPreviewMode, MapRegionSelection, MapViewFlag, MapWorkbenchMode, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { triggerOverlayKinds } from "../semanticGraph";
import { RealmzMapCanvas } from "../components/MapCanvas";
import { LandLayoutEditor, LandTileAtlasEditor, MapContextSidebar, MapRecordsWorkbench, MapSelectionSidebar, RandomAreasWorkbench, type LandLayoutCellSelection } from "../components/MapContextSidebar";
import { MapViewFilters } from "../components/MapViewFilters";
import { landlookGroupTiles } from "../map/paintGroups";

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
    const groupTiles = landlookGroupTiles(selectedTileset, activePaintGroupId);
    if (groupTiles.length > 0 && !groupTiles.includes(state.selectedTile)) {
      onSelectTile(groupTiles[0]);
    }
  }, [activePaintGroupId, onSelectTile, selectedTileset, state.selectedTile]);
  const switchWorkbenchMode = (mode: MapWorkbenchMode) => {
    setWorkbenchMode(mode);
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
              <div className="room-canvas-placeholder">Import or open a Providence project.</div>
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
        paintMode={paintMode}
        onSetPaintMode={setPaintMode}
        paintVariation={paintVariation}
        onSetPaintVariation={setPaintVariation}
        activePaintGroupId={activePaintGroupId}
        onSetActivePaintGroup={setPaintGroup}
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
