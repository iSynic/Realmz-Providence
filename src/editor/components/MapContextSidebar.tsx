import { useEffect, useState } from "react";
import { TOOLS } from "../constants";
import { EditorState } from "../store";
import { CustomMapStamp, DungeonCellFlag, EditorTool, IconEntry, MapEntity, MapPaintMode, MapPaintVariation, MapPreviewFocalPoint, MapPreviewMode, MapRecord, MapRegionSelection, MapViewFlag, MapWorkbenchMode, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, SmartBrushMaskCell, SmartBrushPlan, SmartBrushPreset, TileAttributeFlag, TilePaletteCategory, TilesetAsset, TriggerRecord } from "../types";
import { randomRectEntityId } from "../map/geometry";
import { compactValue, linksFor, mapEntityId, semanticLabel } from "../utils";
import { InfoGrid } from "./InfoGrid";
import { MapCapabilityPanel } from "./MapAffordances";
import { classifyTileValue, standardTileValues } from "../map/tileMetadata";
import { atlasBaseTile, normalizeIconId } from "../map/renderValues";
import { clearTileForMap, clearTileLabel } from "../map/tileClear";
import { tileColor } from "./TileSprite";
import { TileSwatch } from "./TileSwatch";
import { TutorialTip } from "./TutorialTip";
import { ScrollArea } from "../ui";
import { ResizablePane } from "./ResizablePane";
import { actionPointCapacity } from "../actionPointCapacity";
import { LandLayoutEditor, type LandLayoutCellSelection, landLayoutStats, normalizeLayoutCells } from "./maps/LandLayoutWorkbench";
import { tileAttributeRows } from "./maps/mapTileUiUtils";
import { LandTileAtlasEditor } from "./maps/LandTilesWorkbench";
import { MapNumberField } from "./maps/MapFormControls";
import { RandomAreasWorkbench } from "./maps/RandomEncountersWorkbench";
import { resolveMapSelection, type MapSelection } from "./maps/mapSelectionModel";
import { DungeonDrawInspector } from "./maps/DungeonFlagInspector";
import { MapSelectionInspector } from "./maps/MapSelectionInspector";
import { MapPaintInspector, PaintTileSummary } from "./maps/MapPaintInspector";

export { LandLayoutEditor };
export type { LandLayoutCellSelection };
export { LandTileAtlasEditor };
export { RandomAreasWorkbench };

type MapContextFocus = "flags" | "atlas" | "layout" | "source";
type MapSidebarInspector = "setup" | "paint" | "dungeon-draw" | "selection" | "land-layout" | "land-tiles" | "random-areas";

const MAP_TOOLSET_MODES: Array<{ id: MapWorkbenchMode; label: string; body: string }> = [
  { id: "canvas", label: "Canvas", body: "Map painting and placement" },
  { id: "land-layout", label: "Land Layout", body: "Outdoor adjacency grid" },
  { id: "land-tiles", label: "Land Tiles", body: "Tile attributes and combat map" },
  { id: "random-areas", label: "Random Encounters", body: "Encounter rectangles" }
];

export function MapContextSidebar({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  workbenchMode,
  selectedRandomLevel,
  contextFocus,
  previewMode,
  previewFocalPoint,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onSetWorkbenchMode,
  onSelectMap,
  onSetTool,
  onSelectTile,
  paintMode,
  onSetPaintMode,
  paintVariation,
  onSetPaintVariation,
  activePaintGroupId,
  onSetActivePaintGroup,
  paintPaletteMode,
  onSetPaintPaletteMode,
  activeCustomPaletteId,
  onSetActiveCustomPaletteId,
  onSetPaletteVariationTiles,
  selectedRegion,
  onSetSelectedRegion,
  globalMapStamps,
  onSetGlobalMapStamps,
  onApplyCommand,
  paletteOpen,
  onSetPaletteOpen,
  dungeonDrawFlags: _dungeonDrawFlags,
  onSetDungeonDrawFlags: _onSetDungeonDrawFlags
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  workbenchMode: MapWorkbenchMode;
  selectedRandomLevel: RandomLevel | null;
  contextFocus: MapContextFocus;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onSelectMap: (id: string) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  paintVariation: MapPaintVariation;
  onSetPaintVariation: (variation: MapPaintVariation) => void;
  activePaintGroupId: string;
  onSetActivePaintGroup: (groupId: string) => void;
  paintPaletteMode: TilePaletteCategory;
  onSetPaintPaletteMode: (mode: TilePaletteCategory) => void;
  activeCustomPaletteId: string | null;
  onSetActiveCustomPaletteId: (paletteId: string | null) => void;
  onSetPaletteVariationTiles: (tiles: number[] | null) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  globalMapStamps: CustomMapStamp[];
  onSetGlobalMapStamps: (stamps: CustomMapStamp[]) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  paletteOpen: boolean;
  onSetPaletteOpen: (open: boolean) => void;
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
}) {
  return (
    <ResizablePane
      className="editor-sidebar contextual-sidebar"
      ariaLabel="Map tools and context"
      storageKey="providence.mapLeftSidebarWidth.v4"
      defaultWidth={360}
      minWidth={320}
      maxWidth={560}
      edge="right"
    >
      <ScrollArea className="contextual-sidebar-scroll" aria-label="Map tools and browser">
        <MapOutliner
          project={state.project}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          randomLevel={selectedRandomLevel}
          contextFocus={contextFocus}
          previewMode={previewMode}
          previewFocalPoint={previewFocalPoint}
          onSelectMap={onSelectMap}
          onSetPreviewMode={onSetPreviewMode}
          onSetPreviewFocalPoint={onSetPreviewFocalPoint}
          onSetWorkbenchMode={onSetWorkbenchMode}
          onApplyCommand={onApplyCommand}
        />
        <MapToolset
          state={state}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          workbenchMode={workbenchMode}
          onSetWorkbenchMode={onSetWorkbenchMode}
          onSetTool={onSetTool}
          onSelectTile={onSelectTile}
        />
      </ScrollArea>
    </ResizablePane>
  );
}

export function MapSelectionSidebar({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  workbenchMode,
  onSetWorkbenchMode,
  selectedRandomLevel,
  mapTriggers,
  mapRecords,
  onSelectMap,
  onSelectTile,
  contextFocus,
  onSetContextFocus,
  previewMode,
  previewFocalPoint,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onSetTool,
  onSetViewFlag,
  onOpenPalette,
  onOpenScripts,
  paletteOpen,
  onSetPaletteOpen,
  paintMode,
  onSetPaintMode,
  paintVariation,
  onSetPaintVariation,
  activePaintGroupId,
  onSetActivePaintGroup,
  paintPaletteMode,
  onSetPaintPaletteMode,
  activeCustomPaletteId,
  onSetActiveCustomPaletteId,
  variationTiles,
  onSetPaletteVariationTiles,
  selectedRegion,
  onSetSelectedRegion,
  onClearSelection,
  globalMapStamps,
  onSetGlobalMapStamps,
  smartBrushPreset,
  onSetSmartBrushPreset,
  smartBrushMask,
  smartBrushPlan,
  onClearSmartBrushMask,
  onApplySmartBrush,
  selectedSuperTileStampId,
  onSelectSuperTileStamp,
  onSelectEntity,
  onApplyCommand,
  dungeonDrawFlags,
  onSetDungeonDrawFlags
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  workbenchMode: MapWorkbenchMode;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  mapRecords: SemanticEntity[];
  onSelectMap: (id: string) => void;
  onSelectTile: (tile: number) => void;
  contextFocus: MapContextFocus;
  onSetContextFocus: (focus: MapContextFocus) => void;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onSetTool: (tool: EditorTool) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onOpenPalette: () => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  paletteOpen: boolean;
  onSetPaletteOpen: (open: boolean) => void;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  paintVariation: MapPaintVariation;
  onSetPaintVariation: (variation: MapPaintVariation) => void;
  activePaintGroupId: string;
  onSetActivePaintGroup: (groupId: string) => void;
  paintPaletteMode: TilePaletteCategory;
  onSetPaintPaletteMode: (mode: TilePaletteCategory) => void;
  activeCustomPaletteId: string | null;
  onSetActiveCustomPaletteId: (paletteId: string | null) => void;
  variationTiles: number[] | null;
  onSetPaletteVariationTiles: (tiles: number[] | null) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
  onClearSelection: () => void;
  globalMapStamps: CustomMapStamp[];
  onSetGlobalMapStamps: (stamps: CustomMapStamp[]) => void;
  smartBrushPreset: SmartBrushPreset;
  onSetSmartBrushPreset: (preset: SmartBrushPreset) => void;
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushPlan: SmartBrushPlan;
  onClearSmartBrushMask: () => void;
  onApplySmartBrush: () => void;
  selectedSuperTileStampId: string | null;
  onSelectSuperTileStamp: (stampId: string) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
}) {
  const [open, setOpen] = useState(() => localStorage.getItem("providence.mapRightContextOpen.v1") !== "0");
  useEffect(() => {
    localStorage.setItem("providence.mapRightContextOpen.v1", open ? "1" : "0");
  }, [open]);
  useEffect(() => {
    if (selectedMap?.levelType === "dungeon" && (state.activeTool === "paint" || state.activeTool === "stamp")) {
      onSetTool("select");
    }
    if (selectedMap?.levelType !== "dungeon" && state.activeTool === "dungeon-draw") {
      onSetTool("select");
    }
  }, [onSetTool, selectedMap?.levelType, state.activeTool]);
  const selection = resolveMapSelection(selectedMap, state.selectedEntity, state.selectedCell, selectedRegion, mapTriggers, selectedRandomLevel, mapRecords);
  const activeSelection = workbenchMode === "canvas" ? selection : null;
  const selectedMapIsDungeon = selectedMap?.levelType === "dungeon";
  const isPaintInspector = workbenchMode === "canvas" && !selectedMapIsDungeon && (state.activeTool === "paint" || state.activeTool === "stamp" || selectedRegion != null);
  const isDungeonDrawInspector = workbenchMode === "canvas" && selectedMapIsDungeon && state.activeTool === "dungeon-draw";
  const inspectorChoice: MapSidebarInspector = isPaintInspector
    ? "paint"
    : isDungeonDrawInspector
      ? "dungeon-draw"
      : activeSelection
        ? "selection"
        : workbenchMode === "canvas"
          ? "setup"
          : workbenchMode;
  const switchInspector = (choice: MapSidebarInspector) => {
    switch (choice) {
      case "paint":
        onSetWorkbenchMode("canvas");
        onSetTool("paint");
        break;
      case "dungeon-draw":
        if (!selectedMapIsDungeon) return;
        onSetWorkbenchMode("canvas");
        onSetTool("dungeon-draw");
        break;
      case "selection":
        if (!selection) return;
        onSetWorkbenchMode("canvas");
        onSetTool("select");
        break;
      case "setup":
        onSetSelectedRegion(null);
        onClearSelection();
        onSetWorkbenchMode("canvas");
        onSetTool("select");
        break;
      case "land-layout":
      case "land-tiles":
      case "random-areas":
        onSetSelectedRegion(null);
        onSetWorkbenchMode(choice);
        break;
    }
  };
  if (!open) {
    return (
      <aside className="map-context-rail">
        <button type="button" onClick={() => setOpen(true)}>
          {inspectorChoice === "paint" ? "Paint" : "Inspector"}
        </button>
      </aside>
    );
  }
  return (
    <>
      <ResizablePane
        className="editor-inspector map-context-sidebar"
        ariaLabel="Map contextual inspector"
        storageKey="providence.mapRightContextWidth.v1"
        defaultWidth={380}
        minWidth={320}
        maxWidth={680}
        edge="left"
      >
        <ScrollArea className="editor-inspector-scroll map-context-scroll" aria-label="Map contextual inspector">
          <div className="panel-header map-context-header">
            <MapInspectorSwitcher
              value={inspectorChoice}
              hasSelection={selection != null}
              hasDungeonDraw={selectedMapIsDungeon}
              onChange={switchInspector}
            />
            <button className="btn btn-ghost btn-xs" type="button" onClick={() => setOpen(false)}>Collapse</button>
          </div>
        {isPaintInspector ? (
          <MapPaintInspector
            state={state}
            map={selectedMap}
            selectedTileset={selectedTileset}
            atlas={atlas}
            paintMode={paintMode}
            onSetPaintMode={onSetPaintMode}
            paintVariation={paintVariation}
            onSetPaintVariation={onSetPaintVariation}
            activePaintGroupId={activePaintGroupId}
            onSetActivePaintGroup={onSetActivePaintGroup}
            paintPaletteMode={paintPaletteMode}
            onSetPaintPaletteMode={onSetPaintPaletteMode}
            activeCustomPaletteId={activeCustomPaletteId}
            onSetActiveCustomPaletteId={onSetActiveCustomPaletteId}
            variationTiles={variationTiles}
            onSetPaletteVariationTiles={onSetPaletteVariationTiles}
            selectedRegion={selectedRegion}
            onSetSelectedRegion={onSetSelectedRegion}
            globalMapStamps={globalMapStamps}
            onSetGlobalMapStamps={onSetGlobalMapStamps}
            smartBrushPreset={smartBrushPreset}
            onSetSmartBrushPreset={onSetSmartBrushPreset}
            smartBrushMask={smartBrushMask}
            smartBrushPlan={smartBrushPlan}
            onClearSmartBrushMask={onClearSmartBrushMask}
            onApplySmartBrush={onApplySmartBrush}
            selectedSuperTileStampId={selectedSuperTileStampId}
            onSelectSuperTileStamp={onSelectSuperTileStamp}
            onSetTool={onSetTool}
            onSelectTile={onSelectTile}
            onApplyCommand={onApplyCommand}
            paletteOpen={paletteOpen}
            onSetPaletteOpen={onSetPaletteOpen}
          />
        ) : isDungeonDrawInspector ? (
          <DungeonDrawInspector
            atlas={atlas}
            selectedTileset={selectedTileset}
            icons={state.iconEntries}
            dungeonDrawFlags={dungeonDrawFlags}
            onSetDungeonDrawFlags={onSetDungeonDrawFlags}
          />
        ) : activeSelection ? (
          <MapSelectionInspector
            selection={activeSelection}
            map={selectedMap}
            project={state.project}
            selectedTileset={selectedTileset}
            atlas={atlas}
            icons={state.iconEntries}
            dungeonDrawFlags={dungeonDrawFlags}
            onSetDungeonDrawFlags={onSetDungeonDrawFlags}
            onSelectEntity={onSelectEntity}
            onOpenScripts={onOpenScripts}
            onApplyCommand={onApplyCommand}
          />
        ) : workbenchMode !== "canvas" ? (
          <MapModeInspector
            mode={workbenchMode}
            project={state.project}
            selectedMap={selectedMap}
            selectedTileset={selectedTileset}
            atlas={atlas}
            icons={state.iconEntries}
            selectedTile={state.selectedTile}
            randomLevel={selectedRandomLevel}
            mapRecords={mapRecords}
            onSetWorkbenchMode={onSetWorkbenchMode}
          />
        ) : (
          <CoreMapSetup
            project={state.project}
            selectedMap={selectedMap}
            selectedTileset={selectedTileset}
            atlas={atlas}
            randomLevel={selectedRandomLevel}
            activeTool={state.activeTool}
            workbenchMode={workbenchMode}
            contextFocus={contextFocus}
            icons={state.iconEntries}
            selectedPaintTile={state.selectedTile}
            onSelectMap={onSelectMap}
            onSelectTile={onSelectTile}
            previewMode={previewMode}
            previewFocalPoint={previewFocalPoint}
            showRandomRects={state.showRandomRects}
            onSetContextFocus={onSetContextFocus}
            onSetWorkbenchMode={onSetWorkbenchMode}
            onSetPreviewMode={onSetPreviewMode}
            onSetPreviewFocalPoint={onSetPreviewFocalPoint}
            onSetTool={onSetTool}
            onSetViewFlag={onSetViewFlag}
            onOpenPalette={onOpenPalette}
            onSelectEntity={onSelectEntity}
            onApplyCommand={onApplyCommand}
          />
        )}
        </ScrollArea>
      </ResizablePane>
    </>
  );
}

function MapInspectorSwitcher({
  value,
  hasSelection,
  hasDungeonDraw,
  onChange
}: {
  value: MapSidebarInspector;
  hasSelection: boolean;
  hasDungeonDraw: boolean;
  onChange: (choice: MapSidebarInspector) => void;
}) {
  return (
    <select
      className="map-inspector-switcher"
      aria-label="Choose right sidebar inspector"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value as MapSidebarInspector)}
    >
      <option value="setup">Map Setup</option>
      <option value="paint">Paint Inspector</option>
      <option value="dungeon-draw" disabled={!hasDungeonDraw}>Dungeon Draw</option>
      <option value="selection" disabled={!hasSelection}>Selection Inspector</option>
      <option value="land-layout">Land Layout</option>
      <option value="land-tiles">Land Tiles</option>
      <option value="random-areas">Random Rectangles</option>
    </select>
  );
}

function MapModeInspector({
  mode,
  project,
  selectedMap,
  selectedTileset,
  atlas,
  icons,
  selectedTile,
  randomLevel,
  mapRecords,
  onSetWorkbenchMode
}: {
  mode: MapWorkbenchMode;
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: EditorState["iconEntries"];
  selectedTile: number;
  randomLevel: RandomLevel | null;
  mapRecords: SemanticEntity[];
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
}) {
  const landMaps = (project?.maps ?? []).filter((map) => map.levelType === "land");
  const layoutCells = normalizeLayoutCells(project?.landLayout?.cells ?? []);
  const layoutWarnings = project?.landLayout ? landLayoutStats(layoutCells, landMaps, selectedMap).warnings : [];
  const modeTitle = modeLabel(mode);
  return (
    <section className="context-panel map-mode-inspector">
      <div className="panel-header">
        <span>{modeTitle}</span>
        <small>Mode</small>
      </div>
      {mode === "land-layout" && (
        <>
          <InfoGrid
            rows={[
              ["Layout", project?.landLayout ? "configured" : "not created"],
              ["Outdoor Maps", landMaps.length],
              ["Current Map", selectedMap?.levelType === "land" ? selectedMap.name : "none"],
              ["Warnings", layoutWarnings.length]
            ]}
          />
          {layoutWarnings.length > 0 && (
            <div className="inline-diagnostics mode-summary">
              {layoutWarnings.slice(0, 4).map((warning) => <div key={warning} className="diagnostic warning">{warning}</div>)}
            </div>
          )}
        </>
      )}
      {mode === "land-tiles" && (
        <LandTilesModeInspector
          project={project}
          selectedMap={selectedMap}
          selectedTileset={selectedTileset}
          atlas={atlas}
          icons={icons}
          selectedTile={selectedTile}
        />
      )}
      {mode === "random-areas" && (
        <InfoGrid
          rows={[
            ["Current Map", selectedMap?.name ?? "none"],
            ["Rectangles", `${randomLevel?.rects.length ?? 0} / 20`],
            ["Editing", "Canvas-backed"],
            ["Next Step", "Full table planned"]
          ]}
        />
      )}
      <div className="context-action-stack compact">
        <button className="btn btn-primary btn-xs context-action-button context-action-button-narrow" type="button" onClick={() => onSetWorkbenchMode("canvas")}>
          Return To Canvas
        </button>
      </div>
    </section>
  );
}

function LandTilesModeInspector({
  project,
  selectedMap,
  selectedTileset,
  atlas,
  icons,
  selectedTile
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: EditorState["iconEntries"];
  selectedTile: number;
}) {
  if (!selectedTileset) {
    return <p className="empty-copy compact">Select a land map to inspect its land tiles.</p>;
  }
  const meaning = classifyTileValue(selectedTile, selectedTileset, project?.tileAttributes ?? [], icons);
  return (
    <div className="land-tiles-sidebar-detail">
      <div className="land-tiles-sidebar-summary">
        <div className="land-tiles-sidebar-swatch" style={{ background: tileColor(selectedTile) }}>
          <TileSwatch atlas={atlas} icons={icons} tile={selectedTile} tileset={selectedTileset} showBadge={false} />
        </div>
        <div>
          <strong>{meaning.label}</strong>
          <small>{selectedTileset.name}</small>
          <small>{selectedMap?.name ?? "No current map"}</small>
        </div>
      </div>
      <InfoGrid rows={tileAttributeRows(meaning)} />
    </div>
  );
}

function modeLabel(mode: MapWorkbenchMode) {
  switch (mode) {
    case "canvas": return "Canvas";
    case "land-layout": return "Land Layout";
    case "land-tiles": return "Land Tiles";
    case "random-areas": return "Random Encounters";
  }
}

function CoreMapSetup({
  project,
  selectedMap,
  selectedTileset,
  atlas,
  randomLevel,
  activeTool,
  workbenchMode,
  contextFocus,
  onSelectMap,
  onSelectTile,
  previewMode,
  previewFocalPoint,
  showRandomRects,
  onSetContextFocus,
  onSetWorkbenchMode,
  icons,
  selectedPaintTile,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onSetTool,
  onSetViewFlag,
  onOpenPalette,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  randomLevel: RandomLevel | null;
  activeTool: EditorTool;
  workbenchMode: MapWorkbenchMode;
  contextFocus: MapContextFocus;
  icons: EditorState["iconEntries"];
  selectedPaintTile: number;
  onSelectMap: (id: string) => void;
  onSelectTile: (tile: number) => void;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  showRandomRects: boolean;
  onSetContextFocus: (focus: MapContextFocus) => void;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onSetTool: (tool: EditorTool) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onOpenPalette: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const clearLevel = () => {
    if (!selectedMap) return;
    const fillTile = clearTileForMap(selectedMap, selectedTileset);
    const confirmed = window.confirm(`Clear ${selectedMap.name} to ${clearTileLabel(selectedMap, selectedTileset)}? This will overwrite all ${selectedMap.tiles.length.toLocaleString()} cells.`);
    if (!confirmed) return;
    onApplyCommand({
      kind: "paintTiles",
      label: "Clear level",
      mapId: selectedMap.id,
      cells: selectedMap.tiles.map((from, index) => ({
        index,
        x: index % selectedMap.width,
        y: Math.floor(index / selectedMap.width),
        from,
        to: fillTile
      }))
    });
  };
  const setEntireDungeonMappedState = (unmapped: boolean) => {
    if (!selectedMap || selectedMap.levelType !== "dungeon") return;
    onApplyCommand({
      kind: "updateDungeonCellFlags",
      label: unmapped ? "Unmap entire dungeon" : "Map entire dungeon",
      mapId: selectedMap.id,
      flags: { unmapped },
      cells: selectedMap.tiles.map((from, index) => ({
        index,
        x: index % selectedMap.width,
        y: Math.floor(index / selectedMap.width),
        from
      }))
    });
  };
  const focusFirstRandomRect = () => {
    if (!selectedMap || !randomLevel?.rects.length) return;
    onSetViewFlag("showRandomRects", true);
    onSelectEntity({ type: "encounter", id: randomRectEntityId(selectedMap, randomLevel.rects[0].rectIndex) });
  };
  return (
    <section className="context-panel map-setup-panel">
      <div className="panel-header">
        <span>Level Setup</span>
        <small>{modeLabel(workbenchMode)} | {selectedMap ? selectedMap.levelType : "none"}</small>
      </div>
      <div className="map-setup-body">
        <section className="map-setup-card">
          <header>
            <span>Current Level</span>
            <b>{selectedMap ? selectedMap.levelType : "none"}</b>
          </header>
          <InfoGrid
            rows={[
              ["Name", selectedMap?.name ?? "none"],
              ["Index", selectedMap ? selectedMap.index : "none"],
              ["Tileset", selectedTileset?.name ?? selectedMap?.render.tilesetId ?? "none"],
              ["Landlook", randomLevel?.landlook ?? selectedMap?.render.landlook ?? "none"]
            ]}
          />
          {selectedMap && project && (
            <div className="map-setup-counts">
              <span>{actionPointCapacity(project.triggers, selectedMap.levelType, selectedMap.index).active}/100 AP</span>
              <span>{randomLevel?.rects.length ?? 0}/20 random</span>
            </div>
          )}
        </section>
      </div>
      <MapCapabilityPanel
        map={selectedMap}
        randomLevel={randomLevel}
        activeTool={activeTool}
        showRandomRects={showRandomRects}
        onSetTool={(tool) => {
          onSetTool(tool);
          if (tool === "paint") onOpenPalette();
        }}
        onOpenPalette={onOpenPalette}
        onFocusFlags={() => onSetContextFocus("flags")}
        onFocusAtlas={() => onSetWorkbenchMode("land-tiles")}
        onFocusLayout={() => onSetWorkbenchMode("land-layout")}
        onClearLevel={clearLevel}
        onShowRandomRects={() => onSetViewFlag("showRandomRects", true)}
        onHighlightRandomRect={focusFirstRandomRect}
        onEditRandomRect={() => onSetWorkbenchMode("random-areas")}
        onMapEntireDungeon={selectedMap?.levelType === "dungeon" ? () => setEntireDungeonMappedState(false) : undefined}
        onUnmapEntireDungeon={selectedMap?.levelType === "dungeon" ? () => setEntireDungeonMappedState(true) : undefined}
        onSelectRandomRect={
          selectedMap
            ? (rectIndex) => onSelectEntity({ type: "encounter", id: randomRectEntityId(selectedMap, rectIndex) })
            : undefined
        }
      />
    </section>
  );
}

function MapOutliner({
  project,
  selectedMap,
  selectedTileset,
  atlas,
  randomLevel,
  contextFocus,
  previewMode,
  previewFocalPoint,
  onSelectMap,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onSetWorkbenchMode,
  onApplyCommand
}: {
  project: Project | null;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  randomLevel: RandomLevel | null;
  contextFocus: MapContextFocus;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  onSelectMap: (id: string) => void;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const maps = project?.maps ?? [];
  const createMap = (levelType: "land" | "dungeon") => {
    if (!project) return;
    const index = nextMapIndex(maps, levelType);
    const id = `${levelType}:${index}`;
    onApplyCommand({ kind: "createMap", label: `Create ${levelType} map`, levelType });
    onSelectMap(id);
    onSetWorkbenchMode("canvas");
  };
  const duplicateMap = () => {
    if (!project || !selectedMap) return;
    const index = nextMapIndex(maps, selectedMap.levelType);
    const id = `${selectedMap.levelType}:${index}`;
    onApplyCommand({ kind: "duplicateMap", label: `Duplicate ${selectedMap.name}`, mapId: selectedMap.id });
    onSelectMap(id);
    onSetWorkbenchMode("canvas");
  };
  return (
    <section className="context-panel map-outliner-panel compact">
      <div className="panel-header">
        <span>Scenario Maps</span>
        <small>{maps.length.toLocaleString()}</small>
      </div>
      <div className="map-sidebar-group map-records-group">
        <div className="map-sidebar-group-title">Map Records</div>
        <div className="map-outliner-actions">
          <button className="btn btn-primary btn-xs" type="button" disabled={!project} onClick={() => createMap("land")}>
            New Land
          </button>
          <button className="btn btn-secondary btn-xs" type="button" disabled={!project} onClick={() => createMap("dungeon")}>
            New Dungeon
          </button>
          <button className="btn btn-secondary btn-xs" type="button" disabled={!project || !selectedMap} onClick={duplicateMap}>
            Duplicate
          </button>
        </div>
      </div>
      <div className={`map-sidebar-group map-sidebar-current-map map-current-map-group${contextFocus === "flags" ? " active" : ""}`}>
        <label className="context-field compact">
          <span>Current Map</span>
          <select value={selectedMap?.id ?? ""} onChange={(event) => onSelectMap(event.currentTarget.value)} disabled={!project}>
            {!project && <option value="">No project loaded</option>}
            {project && maps.length === 0 && <option value="">No maps yet</option>}
            {maps.map((map) => (
              <option key={map.id} value={map.id}>
                {map.name}
              </option>
            ))}
          </select>
        </label>
        {selectedMap && (
          <MapLevelSettings
            map={selectedMap}
            randomLevel={randomLevel}
            selectedTileset={selectedTileset}
            atlas={atlas}
            previewMode={previewMode}
            previewFocalPoint={previewFocalPoint}
            onSetPreviewMode={onSetPreviewMode}
            onSetPreviewFocalPoint={onSetPreviewFocalPoint}
            onApplyCommand={onApplyCommand}
          />
        )}
      </div>
      {!project && <p className="empty-copy compact">Create or import a scenario to browse maps.</p>}
      {project && maps.length === 0 && <p className="empty-copy compact">Create a land or dungeon map to begin authoring this scenario.</p>}
    </section>
  );
}

function nextMapIndex(maps: MapEntity[], levelType: "land" | "dungeon") {
  return maps
    .filter((map) => map.levelType === levelType)
    .reduce((max, map) => Math.max(max, map.index), -1) + 1;
}

const LAND_AUTHORING_TOOL_IDS: EditorTool[] = ["paint", "stamp", "trigger", "random"];
const DUNGEON_AUTHORING_TOOL_IDS: EditorTool[] = ["dungeon-draw", "trigger", "random"];
const NAVIGATION_TOOL_IDS: EditorTool[] = ["select", "pan", "sample"];
const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

function MapToolset({
  state,
  selectedMap,
  selectedTileset,
  atlas,
  workbenchMode,
  onSetWorkbenchMode,
  onSetTool,
  onSelectTile
}: {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  workbenchMode: MapWorkbenchMode;
  onSetWorkbenchMode: (mode: MapWorkbenchMode) => void;
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
}) {
  const isDungeon = selectedMap?.levelType === "dungeon";
  const authoringTools = isDungeon ? DUNGEON_AUTHORING_TOOL_IDS : LAND_AUTHORING_TOOL_IDS;
  return (
    <section className="context-panel map-toolset-panel">
      <div className="panel-header">
        <span>Map Toolset</span>
        <small>{workbenchMode === "canvas" ? toolLabel(state.activeTool) : modeLabel(workbenchMode)}</small>
      </div>
      <div className="map-sidebar-group map-sections-group">
        <div className="map-sidebar-group-title">Map Sections</div>
        <div className="map-toolset-mode-grid" role="group" aria-label="Map workbench modes">
          {MAP_TOOLSET_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={workbenchMode === mode.id ? "active" : ""}
              onClick={() => onSetWorkbenchMode(mode.id)}
              title={mode.body}
            >
              <span>{mode.label}</span>
            </button>
          ))}
        </div>
      </div>
      {workbenchMode === "canvas" ? (
        <>
          <div className="map-sidebar-group canvas-tools-group">
            <div className="map-sidebar-group-title">Canvas Tools</div>
            <div className="sidebar-tool-columns">
              <div className="sidebar-tool-column authoring-tools" aria-label="Authoring tools">
                {authoringTools.map((id) => renderSidebarTool(id, state.activeTool, onSetTool))}
              </div>
              <div className="sidebar-tool-column navigation-tools" aria-label="Navigation and selection tools">
                {NAVIGATION_TOOL_IDS.map((id) => renderSidebarTool(id, state.activeTool, onSetTool))}
              </div>
            </div>
          </div>
          {isDungeon ? (
            <div className="map-toolset-mode-notice">
              <strong>Dungeon cells use flags</strong>
              <p>Draw applies the selected dungeon cell flags. Select a cell or region to adjust the draw flags in the inspector.</p>
            </div>
          ) : (
            <PaintTileSummary
              selectedTile={state.selectedTile}
              inspectedTile={state.selectedCell?.tile ?? null}
              atlas={atlas}
              selectedTileset={selectedTileset}
              tileAttributes={state.project?.tileAttributes ?? []}
              icons={state.iconEntries}
              onSelectTile={onSelectTile}
            />
          )}
        </>
      ) : (
        <MapToolsetModeNotice
          mode={workbenchMode}
          onReturnToCanvas={() => onSetWorkbenchMode("canvas")}
        />
      )}
    </section>
  );
}

function renderSidebarTool(id: EditorTool, activeTool: EditorTool, onSetTool: (tool: EditorTool) => void) {
  const tool = TOOL_BY_ID.get(id);
  if (!tool) return null;
  return (
    <TutorialTip key={tool.id} title={toolLabel(tool.id)} body={tool.hint} side="right">
      <button className={`sidebar-tool${activeTool === tool.id ? " active" : ""}`} onClick={() => onSetTool(tool.id)}>
        {tool.icon}
        <span>{toolLabel(tool.id)}</span>
      </button>
    </TutorialTip>
  );
}

function MapToolsetModeNotice({
  mode,
  onReturnToCanvas
}: {
  mode: MapWorkbenchMode;
  onReturnToCanvas: () => void;
}) {
  const copy: Record<MapWorkbenchMode, { title: string; body: string }> = {
    canvas: {
      title: "Canvas tools",
      body: "Paint, sample, place Action Points, and work directly on the map."
    },
    "land-layout": {
      title: "Land Layout mode",
      body: "Use the center grid to arrange outdoor levels for off-map travel. Canvas painting tools are hidden here."
    },
    "land-tiles": {
      title: "Land Tiles mode",
      body: "Use the center suite to inspect landlook tiles, movement flags, and combat-map expansion. Painting tools live in Canvas mode."
    },
    "random-areas": {
      title: "Random Encounter Areas",
      body: "These are Realmz random encounter rectangles: chance, battle ranges, text, sound, and extra Action Point doors."
    }
  };
  return (
    <div className="map-toolset-mode-notice">
      <strong>{copy[mode].title}</strong>
      <p>{copy[mode].body}</p>
      <button className="btn btn-secondary btn-xs" type="button" onClick={onReturnToCanvas}>
        Return To Canvas Tools
      </button>
    </div>
  );
}


const STANDARD_LANDLOOK_OPTIONS = [
  { value: 0, label: "0 - Plains" },
  { value: 3, label: "3 - Subterranean" },
  { value: 4, label: "4 - Castle" },
  { value: 5, label: "5 - Desert" },
  { value: 6, label: "6 - Custom 1" },
  { value: 7, label: "7 - Custom 2" },
  { value: 8, label: "8 - Custom 3" },
  { value: 9, label: "9 - Swamp" },
  { value: 10, label: "10 - Snow" }
];

function MapLevelSettings({
  map,
  randomLevel,
  selectedTileset,
  atlas,
  previewMode,
  previewFocalPoint,
  onSetPreviewMode,
  onSetPreviewFocalPoint,
  onApplyCommand
}: {
  map: MapEntity | null;
  randomLevel: RandomLevel | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  previewMode: MapPreviewMode;
  previewFocalPoint: MapPreviewFocalPoint;
  onSetPreviewMode: (mode: MapPreviewMode) => void;
  onSetPreviewFocalPoint: (point: MapPreviewFocalPoint | null) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [applied, setApplied] = useState<string | null>(null);
  if (!map) return <p className="empty-copy compact">Select a map to edit Realmz level flags.</p>;
  const commit = (fields: Partial<Pick<RandomLevel, "landlook" | "isDark" | "useLos">>) => {
    onApplyCommand({
      kind: "updateRandomLevelSettings",
      label: "Update map level flags",
      levelType: map.levelType,
      levelIndex: map.index,
      fields
    });
    setApplied("Applied");
    window.setTimeout(() => setApplied(null), 1200);
  };
  const atlasMissing = map.levelType === "land" && selectedTileset && !atlas && !selectedTileset.imagePath;
  const currentLandlook = randomLevel?.landlook ?? map.render.landlook ?? (map.levelType === "land" ? 0 : -1);
  const currentLandlookSupported = STANDARD_LANDLOOK_OPTIONS.some((option) => option.value === currentLandlook);
  return (
    <div className="map-level-settings">
      {map.levelType === "dungeon" ? (
        <label className="map-select-field">
          <span>Renderer</span>
          <select value="-1" disabled>
            <option value="-1">Dungeon top-down (-1)</option>
          </select>
        </label>
      ) : (
        <label className="map-select-field">
          <span>Landlook</span>
          <select value={String(currentLandlook)} onChange={(event) => commit({ landlook: Number(event.currentTarget.value) })}>
            {!currentLandlookSupported && <option value={String(currentLandlook)}>Unsupported landlook {currentLandlook}</option>}
            {STANDARD_LANDLOOK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
      <div className="map-flag-row">
        <label className="map-check-field">
          <input type="checkbox" checked={Boolean(randomLevel?.isDark)} onChange={(event) => commit({ isDark: event.currentTarget.checked })} />
          <span>Dark level</span>
        </label>
        <label className="map-check-field">
          <input type="checkbox" checked={Boolean(randomLevel?.useLos)} onChange={(event) => commit({ useLos: event.currentTarget.checked })} />
          <span>Line of sight</span>
        </label>
      </div>
      {applied && <small className="map-applied-status">{applied}</small>}
      {atlasMissing && <div className="map-diagnostic-list"><span>Landlook atlas is unavailable; map rendering will fall back to colors.</span></div>}
      <div className="map-preview-controls">
        <label className="context-field compact">
          <span>Editor Preview</span>
          <select value={previewMode} onChange={(event) => onSetPreviewMode(event.currentTarget.value as MapPreviewMode)}>
            <option value="off">Off</option>
            <option value="los">LOS preview</option>
            <option value="darkness">Darkness preview</option>
            <option value="both">Both</option>
          </select>
        </label>
        <div className="map-setup-focus-row">
          <MapNumberField label="Focus X" value={previewFocalPoint.x} min={0} max={89} compact plain maxLength={2} onCommit={(x) => onSetPreviewFocalPoint({ ...previewFocalPoint, x })} />
          <MapNumberField label="Focus Y" value={previewFocalPoint.y} min={0} max={89} compact plain maxLength={2} onCommit={(y) => onSetPreviewFocalPoint({ ...previewFocalPoint, y })} />
          <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onSetPreviewFocalPoint(null)}>
            Use Current
          </button>
        </div>
      </div>
    </div>
  );
}






function toolLabel(tool: EditorTool) {
  const definition = TOOL_BY_ID.get(tool);
  if (definition) return definition.label;
  return tool[0].toUpperCase() + tool.slice(1);
}
