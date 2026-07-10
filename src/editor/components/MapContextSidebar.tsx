import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { TOOLS } from "../constants";
import { EditorState } from "../store";
import { CustomMapStamp, DungeonCellFlag, EditorTool, IconEntry, LandCellSecretState, MapEntity, MapPaintMode, MapPaintVariation, MapPreviewFocalPoint, MapPreviewMode, MapRecord, MapRegionSelection, MapViewFlag, MapWorkbenchMode, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, SmartBrushMaskCell, SmartBrushPlan, SmartBrushPreset, TileAttributeFlag, TilePaletteCategory, TilesetAsset, TriggerRecord } from "../types";
import { mapRecordContainsCell, mapTileIndex, randomRectContainsCell, randomRectEntityId, tileValueAt } from "../map/geometry";
import { rectCells, regionCellCount } from "../map/regionPaint";
import { actionSlotEntitiesForTriggerRecord } from "../semanticGraph";
import { compactValue, linksFor, mapEntityId, selectEntityFromId, semanticLabel, triggerEntityId } from "../utils";
import { InfoGrid } from "./InfoGrid";
import { CellTileEvidence, MapCapabilityPanel } from "./MapAffordances";
import { PaintPalettePanel } from "./TileSelectionBar";
import { classifyTileValue, standardTileValues, tileAttributeGroup } from "../map/tileMetadata";
import { atlasBaseTile, normalizeIconId } from "../map/renderValues";
import { hasSecretMarkerTile, isSecretWalkableTile } from "../map/secrets";
import { clearTileForMap, clearTileLabel } from "../map/tileClear";
import { activeManagedDungeonFlags, DUNGEON_CELL_FLAG_DEFINITIONS, DUNGEON_CLEAR_TO_WALL_FLAGS, DUNGEON_CELL_FLAG_MASKS, dungeonCellMask, dungeonDrawFlagsFromValue, dungeonFlagState } from "../map/dungeonCellFlags";
import { tileColor } from "./TileSprite";
import { TileSwatch } from "./TileSwatch";
import { TutorialTip } from "./TutorialTip";
import { ScrollArea } from "../ui";
import { ResizablePane } from "./ResizablePane";
import { actionPointCapacity, nextActionPointRecordIndex } from "../actionPointCapacity";
import { actionPointMarkerState, actionPointMarkerStateForTrigger, isSecretActionPointState, landCellSecretState } from "../map/actionPointMarkers";
import { LandLayoutEditor, type LandLayoutCellSelection, landLayoutStats, normalizeLayoutCells } from "./maps/LandLayoutWorkbench";
import { attributeSourceLabel, forestTypeLabel, normalizedCombatBuild, tileAttributeLabel, tileAttributeRows, yesNo } from "./maps/mapTileUiUtils";
import { LandTileAtlasEditor } from "./maps/LandTilesWorkbench";
import { MapDiagnostics, MapNumberField } from "./maps/MapFormControls";
import { RandomAreasWorkbench, RandomRectangleEditor, randomRectDiagnostics } from "./maps/RandomEncountersWorkbench";
import { clearRegion, fillRegion, paintModeLabel, regionLabel } from "./maps/mapRegionUiUtils";
import { RecordSelectionDetails } from "./maps/MapRecordsWorkbench";
import { SMART_BRUSH_PRESETS, smartBrushProfileForTileset } from "../map/smartTerrainBrush";

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

const PAINT_PALETTE_STORAGE_KEY = "providence.mapPaintPalette.v1";
const DEFAULT_PALETTE_STATE: PaintPaletteState = {
  mode: "docked",
  x: 720,
  y: 120,
  width: 440,
  height: 560
};
const MAP_SAME_AS_TRIGGER_DESTINATION_HELP =
  "This after-script destination exactly matches the trigger cell. Expand this section and edit Level/X/Y to make the destination separate.";

type PaintPaletteState = {
  mode: "docked" | "floating";
  x: number;
  y: number;
  width: number;
  height: number;
};

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
  const [paletteState, setPaletteState] = useState<PaintPaletteState>(() => readPaintPaletteState());
  const [paintFillChance, setPaintFillChance] = useState(100);
  useEffect(() => {
    localStorage.setItem("providence.mapRightContextOpen.v1", open ? "1" : "0");
  }, [open]);
  useEffect(() => {
    localStorage.setItem(PAINT_PALETTE_STORAGE_KEY, JSON.stringify(paletteState));
  }, [paletteState]);
  useEffect(() => {
    if (selectedMap?.levelType === "dungeon" && (state.activeTool === "paint" || state.activeTool === "stamp")) {
      onSetTool("select");
    }
    if (selectedMap?.levelType !== "dungeon" && state.activeTool === "dungeon-draw") {
      onSetTool("select");
    }
  }, [onSetTool, selectedMap?.levelType, state.activeTool]);
  const selection = selectionSummary(selectedMap, state.selectedEntity, state.selectedCell, selectedRegion, mapTriggers, selectedRandomLevel, mapRecords);
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
          <PaintInspector
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
            paintFillChance={paintFillChance}
            onSetPaintFillChance={setPaintFillChance}
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
            paletteState={paletteState}
            onSetPaletteState={setPaletteState}
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
          <SelectionInspector
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

type Selection =
  | { kind: "cell"; cell: { x: number; y: number; tile: number }; triggers: TriggerRecord[]; rects: RandomLevel["rects"]; records: SemanticEntity[] }
  | { kind: "region"; region: MapRegionSelection }
  | { kind: "trigger"; trigger: TriggerRecord }
  | { kind: "random"; rect: RandomLevel["rects"][number] }
  | { kind: "record"; record: SemanticEntity };

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

function PaintInspector({
  state,
  map,
  selectedTileset,
  atlas,
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
  paintFillChance,
  onSetPaintFillChance,
  selectedRegion,
  onSetSelectedRegion,
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
  onSetTool,
  onSelectTile,
  onApplyCommand,
  paletteOpen,
  onSetPaletteOpen,
  paletteState,
  onSetPaletteState
}: {
  state: EditorState;
  map: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
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
  paintFillChance: number;
  onSetPaintFillChance: (chance: number) => void;
  selectedRegion: MapRegionSelection | null;
  onSetSelectedRegion: (region: MapRegionSelection | null) => void;
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
  onSetTool: (tool: EditorTool) => void;
  onSelectTile: (tile: number) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  paletteOpen: boolean;
  onSetPaletteOpen: (open: boolean) => void;
  paletteState: PaintPaletteState;
  onSetPaletteState: (state: PaintPaletteState) => void;
}) {
  const selectedMeaning = classifyTileValue(state.selectedTile, selectedTileset, state.project?.tileAttributes ?? [], state.iconEntries);
  const docked = paletteState.mode === "docked";
  const palette = (
    <PaintPalettePanel
      map={map}
      project={state.project}
      libraryAssets={state.libraryCatalog?.assets ?? []}
      selectedTile={state.selectedTile}
      inspectedTile={state.selectedCell?.tile ?? null}
      setSelectedTile={onSelectTile}
      tileset={selectedTileset}
      atlas={atlas}
      icons={state.iconEntries}
      atlasStatus={state.atlasStatus}
      mode={state.activeTool === "stamp" ? "super" : paintPaletteMode}
      onSetMode={state.activeTool === "stamp" ? () => undefined : onSetPaintPaletteMode}
      activePaintGroupId={activePaintGroupId}
      onSetActivePaintGroup={onSetActivePaintGroup}
      activeCustomPaletteId={activeCustomPaletteId}
      onSetActiveCustomPaletteId={onSetActiveCustomPaletteId}
      selectedRegion={selectedRegion}
      globalMapStamps={globalMapStamps}
      onSetGlobalMapStamps={onSetGlobalMapStamps}
      onSetVariationTiles={onSetPaletteVariationTiles}
      paintVariation={paintVariation}
      onApplyCommand={onApplyCommand}
      selectedSuperTileStampId={selectedSuperTileStampId}
      onSelectSuperTileStamp={onSelectSuperTileStamp}
      onActivateStampTool={() => onSetTool("stamp")}
      stampOnly={state.activeTool === "stamp"}
      variant="sidebar"
    />
  );
  return (
    <section className="context-panel paint-inspector-panel">
      <div className="paint-inspector-hero">
        <div className="paint-inspector-preview" style={{ background: tileColor(state.selectedTile) }}>
          <TileSwatch atlas={atlas} icons={state.iconEntries} tile={state.selectedTile} tileset={selectedTileset} />
        </div>
        <div>
          <TutorialTip
            title="Selected Paint Tile"
            body="This is the raw Realmz map-field value the Paint tool will place. It may be a standard landlook tile, dungeon tile, negative special land icon, icon-backed value, or raw used value."
            side="right"
          >
            <span>Selected Paint Tile</span>
          </TutorialTip>
          <strong>{state.selectedTile}</strong>
          <small>{selectedMeaning.label}</small>
        </div>
      </div>
      <PaintModePanel
        map={map}
        selectedTileset={selectedTileset}
        selectedTile={state.selectedTile}
        paintVariation={paintVariation}
        activePaintGroupId={activePaintGroupId}
        variationTiles={variationTiles}
        paintFillChance={paintFillChance}
        onSetPaintFillChance={onSetPaintFillChance}
        paintMode={paintMode}
        onSetPaintMode={onSetPaintMode}
        selectedRegion={selectedRegion}
        smartBrushPreset={smartBrushPreset}
        onSetSmartBrushPreset={onSetSmartBrushPreset}
        smartBrushMask={smartBrushMask}
        smartBrushPlan={smartBrushPlan}
        onClearSmartBrushMask={onClearSmartBrushMask}
        onApplySmartBrush={onApplySmartBrush}
        onApplyCommand={onApplyCommand}
        showVariation={state.activeTool !== "stamp"}
        onSetPaintVariation={onSetPaintVariation}
        onActivatePaintTool={() => {
          if (state.activeTool !== "paint") onSetTool("paint");
        }}
      />
      {selectedRegion && paintMode !== "smart" && (
        <RegionSelectionDetails
          map={map}
          region={selectedRegion}
          selectedTileset={selectedTileset}
          tileAttributes={state.project?.tileAttributes ?? []}
          icons={state.iconEntries}
          selectedPaintTile={state.selectedTile}
        />
      )}
      <div className={`paint-palette-shell${paletteOpen && docked ? " paint-palette-shell-docked" : ""}`}>
        <div className="paint-palette-shell-header">
          <TutorialTip
            title="Tile Palette"
            body="Dock the palette in the Paint Inspector or pop it out over the map. Custom palettes are saved with the project; drag tiles from any tab into the reveal dock to collect them."
            side="right"
          >
            <span>Tile Palette</span>
          </TutorialTip>
          <div>
            {!paletteOpen && (
              <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSetPaletteOpen(true)}>
                Open
              </button>
            )}
            {paletteOpen && (
              <button className="btn btn-secondary btn-xs" type="button" onClick={() => onSetPaletteState({ ...paletteState, mode: docked ? "floating" : "docked" })}>
                {docked ? "Pop-Out" : "Dock"}
              </button>
            )}
            {paletteOpen && (
              <button className="btn btn-ghost btn-xs" type="button" onClick={() => onSetPaletteOpen(false)}>
                Close
              </button>
            )}
          </div>
        </div>
        {paletteOpen && docked && <div className="paint-palette-scroll">{palette}</div>}
        {paletteOpen && !docked && <p className="empty-copy compact">Palette is floating over the map canvas.</p>}
      </div>
      {paletteOpen && !docked && (
        <FloatingPaintPalette
          paletteState={paletteState}
          onSetPaletteState={onSetPaletteState}
          onClose={() => onSetPaletteOpen(false)}
          onDock={() => onSetPaletteState({ ...paletteState, mode: "docked" })}
        >
          {palette}
        </FloatingPaintPalette>
      )}
    </section>
  );
}

const PAINT_VARIATION_OPTIONS: Array<{ id: MapPaintVariation; label: string; hint: string }> = [
  { id: "single", label: "Single Tile", hint: "Paint the selected tile." },
  { id: "cycle-group", label: "Cycle Group", hint: "Advance through the active palette group once for each newly painted cell." },
  { id: "random-group", label: "Random Group", hint: "Pick a stable pseudo-random tile from the active palette group for each newly painted cell." }
];

function FloatingPaintPalette({
  paletteState,
  onSetPaletteState,
  onClose,
  onDock,
  children
}: {
  paletteState: PaintPaletteState;
  onSetPaletteState: (state: PaintPaletteState) => void;
  onClose: () => void;
  onDock: () => void;
  children: ReactNode;
}) {
  const draggingRef = useRef(false);
  const resizingRef = useRef(false);
  const stateRef = useRef(paletteState);
  useEffect(() => {
    stateRef.current = paletteState;
  }, [paletteState]);
  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    const start = { x: event.clientX, y: event.clientY, left: paletteState.x, top: paletteState.y };
    const move = (moveEvent: PointerEvent) => {
      const next = clampPaletteRect({
        ...stateRef.current,
        x: start.left + moveEvent.clientX - start.x,
        y: start.top + moveEvent.clientY - start.y
      });
      onSetPaletteState(next);
    };
    const up = () => {
      draggingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    resizingRef.current = true;
    const start = { x: event.clientX, y: event.clientY, width: paletteState.width, height: paletteState.height };
    const move = (moveEvent: PointerEvent) => {
      const next = clampPaletteRect({
        ...stateRef.current,
        width: Math.max(320, start.width + moveEvent.clientX - start.x),
        height: Math.max(360, start.height + moveEvent.clientY - start.y)
      });
      onSetPaletteState(next);
    };
    const up = () => {
      resizingRef.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const clamped = clampPaletteRect(paletteState);
  return (
    <div
      className="floating-paint-palette"
      style={{ left: `${clamped.x}px`, top: `${clamped.y}px`, width: `${clamped.width}px`, height: `${clamped.height}px` }}
    >
      <div className="floating-paint-palette-header" onPointerDown={startDrag}>
        <span>Paint Palette</span>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onDock}>Dock</button>
        <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={onClose}>Close</button>
      </div>
      <div className="floating-paint-palette-body">{children}</div>
      <button className="floating-paint-palette-resize" type="button" aria-label="Resize paint palette" onPointerDown={startResize} />
    </div>
  );
}

function readPaintPaletteState(): PaintPaletteState {
  if (typeof localStorage === "undefined") return DEFAULT_PALETTE_STATE;
  try {
    const parsed = JSON.parse(localStorage.getItem(PAINT_PALETTE_STORAGE_KEY) ?? "");
    if (!parsed || typeof parsed !== "object") return DEFAULT_PALETTE_STATE;
    return clampPaletteRect({
      mode: parsed.mode === "floating" ? "floating" : "docked",
      x: numberOrDefault(parsed.x, DEFAULT_PALETTE_STATE.x),
      y: numberOrDefault(parsed.y, DEFAULT_PALETTE_STATE.y),
      width: numberOrDefault(parsed.width, DEFAULT_PALETTE_STATE.width),
      height: numberOrDefault(parsed.height, DEFAULT_PALETTE_STATE.height)
    });
  } catch {
    return DEFAULT_PALETTE_STATE;
  }
}

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampPaletteRect(state: PaintPaletteState): PaintPaletteState {
  if (typeof window === "undefined") return state;
  const margin = 12;
  const width = Math.min(Math.max(320, state.width), Math.max(320, window.innerWidth - margin * 2));
  const height = Math.min(Math.max(360, state.height), Math.max(360, window.innerHeight - margin * 2));
  return {
    ...state,
    width,
    height,
    x: Math.max(margin, Math.min(state.x, window.innerWidth - width - margin)),
    y: Math.max(margin, Math.min(state.y, window.innerHeight - height - margin))
  };
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





function PaintTileSummary({
  selectedTile,
  inspectedTile,
  atlas,
  selectedTileset,
  tileAttributes,
  icons,
  onSelectTile
}: {
  selectedTile: number;
  inspectedTile: number | null;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  tileAttributes: Project["tileAttributes"];
  icons: EditorState["iconEntries"];
  onSelectTile: (tile: number) => void;
}) {
  const paintMeaning = classifyTileValue(selectedTile, selectedTileset, tileAttributes, icons);
  const inspectedMeaning = inspectedTile != null && inspectedTile !== selectedTile
    ? classifyTileValue(inspectedTile, selectedTileset, tileAttributes, icons)
    : null;
  return (
    <div className="paint-tile-card">
      <div className="paint-tile-summary">
        <button
          type="button"
          className="paint-tile-preview"
          style={{ background: tileColor(selectedTile) }}
          onClick={() => onSelectTile(selectedTile)}
          title={`Selected paint tile ${selectedTile}`}
        >
          <TileSwatch atlas={atlas} icons={icons} tile={selectedTile} tileset={selectedTileset} />
        </button>
        <div>
          <strong>{paintMeaning.label}</strong>
          <small>{selectedTileset?.name ?? "No tileset loaded"}</small>
          {inspectedTile != null && <small>Selected cell tile {inspectedTile}</small>}
        </div>
      </div>
      <CompactTileReadout label="Paint" meaning={paintMeaning} />
      {inspectedMeaning && <CompactTileReadout label="Cell" meaning={inspectedMeaning} />}
    </div>
  );
}

function CompactTileReadout({
  label,
  meaning
}: {
  label: string;
  meaning: ReturnType<typeof classifyTileValue>;
}) {
  const traits = compactTileTraits(meaning);
  return (
    <div className="compact-tile-readout">
      <span>{label}</span>
      <b>{meaning.raw}</b>
      <small>{traits}</small>
    </div>
  );
}

function compactTileTraits(meaning: ReturnType<typeof classifyTileValue>) {
  const traits: string[] = meaning.attributeFlags
    .filter((flag) => flag !== "unknown-metadata")
    .slice(0, 3)
    .map(tileAttributeLabel);
  if (meaning.attributes?.movementSoundId != null) traits.push(`snd ${meaning.attributes.movementSoundId}`);
  if (meaning.attributes?.movementCost != null) traits.push(`move ${meaning.attributes.movementCost}`);
  return traits.length ? traits.join(" | ") : meaning.kind.replace(/-/g, " ");
}

function TileMeaningInspector({
  title,
  meaning,
  compact = false
}: {
  title: string;
  meaning: ReturnType<typeof classifyTileValue>;
  compact?: boolean;
}) {
  const flags = [
    meaning.flags.markerBit ? "marker" : null,
    meaning.flags.pathBit ? "path" : null,
    meaning.flags.noteBit ? "note" : null,
    meaning.iconId != null ? `icon ${meaning.iconId}` : null
  ].filter(Boolean).join(", ") || "none";
  const iconState = meaning.iconCandidates.length === 0
    ? "none"
    : meaning.iconAvailable
      ? `loaded ${meaning.iconCandidates.join(", ")}`
      : `missing ${meaning.iconCandidates.join(", ")}`;
  const attributes = meaning.attributes;
  const attributeFlags = meaning.attributeFlags.length ? meaning.attributeFlags.map(tileAttributeLabel).join(", ") : "unknown";
  return (
    <div className={`tile-meaning-inspector${compact ? " compact" : ""}`}>
      <div className="tile-meaning-title">
        <span>{title}</span>
        <b>{meaning.kind.replace(/-/g, " ")}</b>
      </div>
      <div className="tile-meaning-grid">
        <span>Raw</span>
        <b>{meaning.raw}</b>
        <span>Render</span>
        <b>{meaning.renderTile}</b>
        <span>Normalized</span>
        <b>{meaning.normalized}</b>
        <span>Flags</span>
        <b>{flags}</b>
        <span>Icon Art</span>
        <b>{iconState}</b>
        <span>Solid Type</span>
        <b>{attributes?.solidType ?? "unknown"}</b>
        <span>Traits</span>
        <b>{attributeFlags}</b>
        <span>Attribute Table</span>
        <b>{attributeSourceLabel(attributes)}</b>
        <span>Move Cost</span>
        <b>{attributes?.movementCost ?? "unknown"}</b>
        <span>Sound</span>
        <b>{attributes?.movementSoundId ?? "unknown"}</b>
        <span>Shore / Water</span>
        <b>{yesNo(attributes?.shore)}</b>
        <span>Runtime Path</span>
        <b>{yesNo(attributes?.pathFlag)}</b>
        <span>Road Art</span>
        <b>{meaning.attributeFlags.includes("visual-path") ? "yes" : "no"}</b>
        <span>Blocks LOS</span>
        <b>{yesNo(attributes?.blocksLos)}</b>
        <span>Fly / Float</span>
        <b>{yesNo(attributes?.flyFloatRequired)}</b>
        <span>Forest</span>
        <b>{forestTypeLabel(attributes?.forestType)}</b>
        <span>Combat Map</span>
        <b>{normalizedCombatBuild(attributes) ? "3 x 3 expansion" : "none"}</b>
        <span>Status</span>
        <b>{userFacingConfidence(attributes?.confidence ?? (meaning.iconCandidates.length > 0 ? "preserved" : "unknown"))}</b>
      </div>
      {!compact && <p>{meaning.compatibility}</p>}
    </div>
  );
}

function SpecialTileSolidityEditor({
  meaning,
  onApplyCommand
}: {
  meaning: ReturnType<typeof classifyTileValue>;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const attributes = meaning.attributes;
  if (meaning.raw >= 0 || attributes?.sourceKind !== "data-solids") return null;
  const tile = attributes.tile ?? Math.abs(normalizeIconId(meaning.raw) ?? meaning.raw);
  const solid = attributes.flags.includes("solid") || Boolean(attributes.solidType);
  return (
    <div className="tile-attribute-editor compact">
      <div className="tile-meaning-title">
        <span>Special Tile Solidity</span>
        <b>Data Solids</b>
      </div>
      <InfoGrid
        rows={[
          ["Special Tile", meaning.raw],
          ["Data Solids Row", tile],
          ["Passable", solid ? "no" : "yes"],
          ["Source", attributes.source]
        ]}
      />
      <div className="tile-toggle-grid">
        <button
          type="button"
          className={!solid ? "active" : ""}
          onClick={() => onApplyCommand({ kind: "updateSpecialTileSolidity", label: "Make special tile passable", tile, solid: false })}
        >
          Passable
          <b>{!solid ? "yes" : "set"}</b>
        </button>
        <button
          type="button"
          className={solid ? "active" : ""}
          onClick={() => onApplyCommand({ kind: "updateSpecialTileSolidity", label: "Make special tile solid", tile, solid: true })}
        >
          Solid
          <b>{solid ? "yes" : "set"}</b>
        </button>
      </div>
    </div>
  );
}

const PAINT_MODES: Array<{ id: MapPaintMode; label: string; body: string }> = [
  { id: "brush", label: "Brush", body: "Paint cells by dragging." },
  { id: "clear", label: "Eraser", body: "Restore cells to the current map's clear tile." },
  { id: "smart", label: "Smart", body: "Beta: draw a terrain mask and resolve mountain, water, or forest edges automatically." }
];

function PaintModePanel({
  map,
  selectedTileset,
  selectedTile,
  paintVariation,
  activePaintGroupId,
  variationTiles,
  paintFillChance,
  onSetPaintFillChance,
  paintMode,
  onSetPaintMode,
  selectedRegion,
  smartBrushPreset,
  onSetSmartBrushPreset,
  smartBrushMask,
  smartBrushPlan,
  onClearSmartBrushMask,
  onApplySmartBrush,
  onApplyCommand,
  showVariation,
  onSetPaintVariation,
  onActivatePaintTool
}: {
  map: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  selectedTile: number;
  paintVariation: MapPaintVariation;
  activePaintGroupId: string;
  variationTiles: number[] | null | undefined;
  paintFillChance: number;
  onSetPaintFillChance: (chance: number) => void;
  paintMode: MapPaintMode;
  onSetPaintMode: (mode: MapPaintMode) => void;
  selectedRegion: MapRegionSelection | null;
  smartBrushPreset: SmartBrushPreset;
  onSetSmartBrushPreset: (preset: SmartBrushPreset) => void;
  smartBrushMask: SmartBrushMaskCell[];
  smartBrushPlan: SmartBrushPlan;
  onClearSmartBrushMask: () => void;
  onApplySmartBrush: () => void;
  onApplyCommand: (command: ProjectCommand) => void;
  showVariation: boolean;
  onSetPaintVariation: (variation: MapPaintVariation) => void;
  onActivatePaintTool: () => void;
}) {
  const smartUnavailable = paintMode === "smart" && smartBrushPlan.reason != null && smartBrushMask.length === 0;
  const smartDisabled = !map || map.levelType !== "land" || smartBrushProfileForTileset(selectedTileset) == null;
  const activeVariation = PAINT_VARIATION_OPTIONS.find((variation) => variation.id === paintVariation) ?? PAINT_VARIATION_OPTIONS[0];
  const setMode = (mode: MapPaintMode) => {
    onSetPaintMode(mode);
    onActivatePaintTool();
  };
  return (
    <div className="paint-mode-panel">
      <div className="paint-mode-header">
        <TutorialTip
          title="Paint Subtools"
          body="Brush paints the selected value, Eraser writes the map's clear tile, and Smart is a beta terrain-mask resolver for mountains, water, and forest."
          side="right"
        >
          <span>Paint Subtool</span>
        </TutorialTip>
        <b>{paintModeLabel(paintMode)}</b>
      </div>
      <div className="paint-mode-grid">
        {PAINT_MODES.map((mode) => (
          <button
            key={mode.id}
            className={paintMode === mode.id ? "active" : ""}
            type="button"
            disabled={mode.id === "smart" && smartDisabled}
            onClick={() => setMode(mode.id)}
            title={mode.id === "smart" && smartDisabled ? "Smart terrain is available for supported land maps." : mode.body}
          >
            {mode.label}
          </button>
        ))}
      </div>
      {showVariation && (
        <>
          <div className="paint-mode-divider" />
          <div className="paint-mode-variation" aria-label="Brush variation">
            <div className="paint-variation-header">
              <span>Variation</span>
              <b>{activeVariation.label}</b>
            </div>
            <div className="paint-variation-buttons" role="toolbar" aria-label="Brush variation mode">
              {PAINT_VARIATION_OPTIONS.map((variation) => (
                <button
                  key={variation.id}
                  type="button"
                  className={paintVariation === variation.id ? "active" : ""}
                  onClick={() => onSetPaintVariation(variation.id)}
                  title={variation.hint}
                >
                  {variation.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {paintMode === "smart" && (
        <div className="smart-brush-panel">
          <label className="map-number-field">
            <TutorialTip
              title="Terrain Preset"
              body="Beta smart terrain currently supports curated standard landlook profiles for mountains, water, and forest. Draw the full intended shape, inspect the preview, then apply and touch up as needed."
              side="right"
            >
              <span>Terrain Preset</span>
            </TutorialTip>
            <small className="context-capacity-note">Beta implementation; review preview before applying.</small>
            <select value={smartBrushPreset} onChange={(event) => onSetSmartBrushPreset(event.currentTarget.value as SmartBrushPreset)}>
              {SMART_BRUSH_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>{preset.label}</option>
              ))}
            </select>
          </label>
          <InfoGrid
            rows={[
              ["Mask Cells", smartBrushMask.length],
              ["Will Change", smartBrushPlan.changedCount],
              ["Preserved", smartBrushPlan.skippedCount],
              ["Profile", smartBrushPlan.profileConfidence === "corpus-ranked" ? "corpus ranked" : smartBrushPlan.profileConfidence === "pixel-ranked" ? "pixel ranked" : smartBrushPlan.profileConfidence === "curated-fallback" ? "curated fallback" : "unsupported"],
              ["Landlook", selectedTileset?.landlook ?? "none"]
            ]}
          />
          {smartBrushPlan.reason && <p className={`context-capacity-note${smartUnavailable ? " blocked" : ""}`}>{smartBrushPlan.reason}</p>}
          {!smartBrushPlan.reason && (
            <p className="empty-copy compact">
              Preview preserves roads, buildings, icon-backed tiles, and unrelated terrain. Yellow outlined cells are preserved.
            </p>
          )}
          {smartBrushPlan.cells.length > 0 && (
            <details className="context-debug-details">
              <summary>Smart Debug</summary>
              <div className="context-chip-row">
                {smartBrushPlan.cells.slice(0, 6).map((cell) => (
                  <span key={`${cell.x}:${cell.y}`} className="context-chip">
                    {cell.x},{cell.y} m{cell.neighborMask ?? "-"} {cell.from}{"->"}{cell.to} {cell.source ?? "fallback"}{cell.samples != null ? ` ${cell.samples}` : ""}{cell.score != null ? ` ${cell.score.toFixed(2)}` : ""}
                  </span>
                ))}
              </div>
            </details>
          )}
          <div className="context-action-stack">
            <button className="btn btn-primary btn-xs context-action-button" type="button" disabled={smartBrushPlan.changedCount === 0} onClick={onApplySmartBrush}>
              Apply Smart Terrain ({smartBrushPlan.changedCount})
            </button>
            <button className="btn btn-secondary btn-xs context-action-button" type="button" disabled={smartBrushMask.length === 0} onClick={onClearSmartBrushMask}>
              Clear Smart Mask
            </button>
            <button className="btn btn-ghost btn-xs context-action-button" type="button" disabled={smartBrushMask.length === 0} onClick={onClearSmartBrushMask}>
              Cancel Preview
            </button>
          </div>
        </div>
      )}
      {selectedRegion && paintMode !== "smart" && (
        <div className="paint-region-quick-actions">
          <span>{regionLabel(selectedRegion)} | {regionCellCount(selectedRegion).toLocaleString()} cells</span>
          <label className="paint-fill-chance">
            <TutorialTip
              title="Chance To Fill"
              body="Use less than 100% to scatter the selected tile, random group, cycle group, or custom palette across a region. This is useful for flavor tiles such as rocks, trees, graves, and ruins."
              side="right"
            >
              <span>Chance To Fill</span>
            </TutorialTip>
            <b>{paintFillChance}%</b>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={paintFillChance}
              onChange={(event) => onSetPaintFillChance(Number(event.currentTarget.value))}
            />
            <small>{paintFillChance === 100 ? "Fill every eligible cell." : `Scatter paint across about ${paintFillChance}% of the selected region.`}</small>
          </label>
          <button type="button" onClick={() => fillRegion(map, selectedRegion, selectedTile, selectedTileset, paintVariation, activePaintGroupId, variationTiles, paintFillChance, onApplyCommand)}>Fill</button>
          <button type="button" onClick={() => clearRegion(map, selectedRegion, selectedTileset, onApplyCommand)}>Clear</button>
        </div>
      )}
    </div>
  );
}

function RegionSelectionDetails({
  map,
  region,
  selectedTileset,
  tileAttributes,
  icons,
  selectedPaintTile
}: {
  map: MapEntity | null;
  region: MapRegionSelection;
  selectedTileset: TilesetAsset | null;
  tileAttributes: Project["tileAttributes"];
  icons: EditorState["iconEntries"];
  selectedPaintTile: number;
}) {
  if (!map) return <p className="empty-copy compact">Select a map region to edit tiles.</p>;
  const selectedMeaning = classifyTileValue(selectedPaintTile, selectedTileset, tileAttributes, icons);
  return (
    <div className="region-selection-details">
      <div className="tile-meaning-inspector compact">
        <div className="tile-meaning-title">
          <span>Selected Paint Tile</span>
          <b>{selectedMeaning.kind.replace(/-/g, " ")}</b>
        </div>
        <p>{selectedMeaning.compatibility}</p>
      </div>
    </div>
  );
}

const DUNGEON_FLAG_PREVIEW_TILES: Partial<Record<DungeonCellFlag, number>> = {
  wall: DUNGEON_CELL_FLAG_MASKS.wall,
  horizontalDoor: DUNGEON_CELL_FLAG_MASKS.horizontalDoor,
  verticalDoor: DUNGEON_CELL_FLAG_MASKS.verticalDoor,
  stairs: DUNGEON_CELL_FLAG_MASKS.stairs,
  column: DUNGEON_CELL_FLAG_MASKS.column,
  unmapped: DUNGEON_CELL_FLAG_MASKS.unmapped,
  allowMoveNorth: DUNGEON_CELL_FLAG_MASKS.allowMoveNorth,
  allowMoveEast: DUNGEON_CELL_FLAG_MASKS.allowMoveEast,
  allowMoveSouth: DUNGEON_CELL_FLAG_MASKS.allowMoveSouth,
  allowMoveWest: DUNGEON_CELL_FLAG_MASKS.allowMoveWest,
  archway: DUNGEON_CELL_FLAG_MASKS.archway,
  noWallInBattle: DUNGEON_CELL_FLAG_MASKS.noWallInBattle
};

function DungeonDrawInspector({
  atlas,
  selectedTileset,
  icons,
  dungeonDrawFlags,
  onSetDungeonDrawFlags
}: {
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
}) {
  const setFlag = (flag: DungeonCellFlag, enabled: boolean) => {
    onSetDungeonDrawFlags({ ...dungeonDrawFlags, [flag]: enabled });
  };
  return (
    <section className="context-panel dungeon-draw-inspector">
      <div className="panel-header">
        <span>Dungeon Draw</span>
        <b>Flags</b>
      </div>
      <div className="selection-summary-card">
        <strong>Draw flags</strong>
        <span>Choose the cell flags Draw will place on the dungeon canvas.</span>
      </div>
      <div className="dungeon-flag-actions">
        <button
          className="btn btn-ghost btn-xs"
          type="button"
          onClick={() => onSetDungeonDrawFlags({ ...dungeonDrawFlags, ...DUNGEON_CLEAR_TO_WALL_FLAGS })}
        >
          Clear To Wall
        </button>
      </div>
      <div className="dungeon-flag-grid">
        {DUNGEON_CELL_FLAG_DEFINITIONS.map((definition) => (
          <DungeonFlagToggle
            key={definition.id}
            label={definition.label}
            group={definition.group}
            state={dungeonDrawFlags[definition.id] ? "on" : "off"}
            previewTile={DUNGEON_FLAG_PREVIEW_TILES[definition.id]}
            atlas={atlas}
            selectedTileset={selectedTileset}
            icons={icons}
            onChange={(enabled) => setFlag(definition.id, enabled)}
          />
        ))}
      </div>
    </section>
  );
}

function DungeonCellFlagEditor({
  map,
  selection,
  atlas,
  selectedTileset,
  icons,
  dungeonDrawFlags,
  onSetDungeonDrawFlags,
  onApplyCommand
}: {
  map: MapEntity;
  selection: Extract<Selection, { kind: "cell" }> | Extract<Selection, { kind: "region" }>;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const selectedCell = selection.kind === "cell"
    ? {
        ...selection.cell,
        index: mapTileIndex(map, selection.cell.x, selection.cell.y),
        tile: tileValueAt(map, selection.cell.x, selection.cell.y)
      }
    : null;
  const cells = selection.kind === "cell"
    ? selectedCell ? [selectedCell] : []
    : rectCells(map, selection.region);
  const values = cells.map((cell) => cell.tile);
  const managedFlags = activeManagedDungeonFlags(values);
  const scopeLabel = selection.kind === "cell"
    ? `Cell ${selection.cell.x}, ${selection.cell.y}`
    : `${regionLabel(selection.region)} (${cells.length} cells)`;
  const selectedCellTile = selectedCell?.tile ?? null;
  useEffect(() => {
    if (selection.kind !== "cell" || selectedCellTile == null) return;
    onSetDungeonDrawFlags(dungeonDrawFlagsFromValue(selectedCellTile));
  }, [onSetDungeonDrawFlags, selectedCellTile, selection.kind]);
  const applyFlags = (label: string, flags: Extract<ProjectCommand, { kind: "updateDungeonCellFlags" }>["flags"]) => {
    onApplyCommand({
      kind: "updateDungeonCellFlags",
      label,
      mapId: map.id,
      flags,
      cells: cells.map((cell) => ({ x: cell.x, y: cell.y, index: cell.index, from: cell.tile }))
    });
  };
  const setDrawAndApplyFlags = (
    label: string,
    flags: Extract<ProjectCommand, { kind: "updateDungeonCellFlags" }>["flags"]
  ) => {
    onSetDungeonDrawFlags({ ...dungeonDrawFlags, ...flags });
    applyFlags(label, flags);
  };
  const clearDrawFlags = () => {
    onSetDungeonDrawFlags({ ...dungeonDrawFlags, ...DUNGEON_CLEAR_TO_WALL_FLAGS });
    applyFlags("Clear selected dungeon cells", DUNGEON_CLEAR_TO_WALL_FLAGS);
  };

  return (
    <div className="dungeon-flag-editor">
      <div className="selection-summary-card">
        <strong>{scopeLabel}</strong>
        <span>{selection.kind === "region" ? "Batch edit dungeon cell flags" : "Edit dungeon cell flags"}; Draw uses these toggles.</span>
      </div>
      <div className="dungeon-flag-actions">
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => setDrawAndApplyFlags("Map selected dungeon cells", { unmapped: false })}>
          Map Selected
        </button>
        <button className="btn btn-secondary btn-xs" type="button" onClick={() => setDrawAndApplyFlags("Unmap selected dungeon cells", { unmapped: true })}>
          Unmap Selected
        </button>
        <button className="btn btn-ghost btn-xs" type="button" onClick={clearDrawFlags}>
          Clear To Wall
        </button>
      </div>
      <div className="dungeon-flag-grid">
        {DUNGEON_CELL_FLAG_DEFINITIONS.map((definition) => (
          <DungeonFlagToggle
            key={definition.id}
            label={definition.label}
            group={definition.group}
            state={dungeonFlagState(values, definition.id)}
            previewTile={DUNGEON_FLAG_PREVIEW_TILES[definition.id]}
            atlas={atlas}
            selectedTileset={selectedTileset}
            icons={icons}
            onChange={(enabled) => setDrawAndApplyFlags(`${enabled ? "Set" : "Clear"} ${definition.label}`, { [definition.id]: enabled })}
          />
        ))}
      </div>
      {managedFlags.length > 0 && (
        <div className="dungeon-managed-flags">
          <span>Preserved</span>
          {managedFlags.map((flag) => <b key={flag.id}>{flag.label}</b>)}
        </div>
      )}
      <details className="context-section dungeon-technical-details">
        <summary><span>Technical Details</span><b>{cells.length}</b></summary>
        <InfoGrid
          rows={[
            ["Raw values", summarizeRawDungeonValues(values)],
            ["Masks", summarizeDungeonMasks(values)]
          ]}
        />
      </details>
    </div>
  );
}

function DungeonFlagToggle({
  label,
  group,
  state,
  previewTile,
  atlas,
  selectedTileset,
  icons,
  onChange
}: {
  label: string;
  group: string;
  state: "on" | "off" | "mixed";
  previewTile: number | undefined;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedTileset: TilesetAsset | null;
  icons: EditorState["iconEntries"];
  onChange: (enabled: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "mixed";
  }, [state]);
  return (
    <label className={`dungeon-flag-toggle ${state}`}>
      <input
        ref={ref}
        type="checkbox"
        checked={state === "on"}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <span className="dungeon-flag-preview">
        {previewTile != null
          ? <TileSwatch atlas={atlas} icons={icons} tile={previewTile} tileset={selectedTileset} showBadge={false} allowIconFallback={false} />
          : <span className="dungeon-flag-preview-empty" />}
      </span>
      <span>{label}</span>
      <small>{state === "mixed" ? "mixed" : group}</small>
    </label>
  );
}

function summarizeRawDungeonValues(values: number[]) {
  if (values.length === 0) return "none";
  const unique = [...new Set(values)];
  if (unique.length === 1) return String(unique[0]);
  return `${unique.length} values`;
}

function summarizeDungeonMasks(values: number[]) {
  if (values.length === 0) return "none";
  const unique = [...new Set(values.map((value) => `0x${dungeonCellMask(value).toString(16).padStart(4, "0")}`))];
  return unique.length === 1 ? unique[0] : `${unique.length} masks`;
}

function SelectionInspector({
  selection,
  map,
  project,
  selectedTileset,
  atlas,
  icons,
  dungeonDrawFlags,
  onSetDungeonDrawFlags,
  onSelectEntity,
  onOpenScripts,
  onApplyCommand
}: {
  selection: Selection;
  map: MapEntity | null;
  project: Project | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  icons: EditorState["iconEntries"];
  dungeonDrawFlags: Record<DungeonCellFlag, boolean>;
  onSetDungeonDrawFlags: (flags: Record<DungeonCellFlag, boolean>) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const selectedCellMeaning = selection.kind === "cell"
    ? classifyTileValue(selection.cell.tile, selectedTileset, project?.tileAttributes ?? [], icons)
    : null;
  return (
    <section className="context-panel">
      <div className="panel-header">
        <span>Selection Inspector</span>
      </div>
      {map?.levelType === "dungeon" && (selection.kind === "cell" || selection.kind === "region") && (
        <DungeonCellFlagEditor
          map={map}
          selection={selection}
          atlas={atlas}
          selectedTileset={selectedTileset}
          icons={icons}
          dungeonDrawFlags={dungeonDrawFlags}
          onSetDungeonDrawFlags={onSetDungeonDrawFlags}
          onApplyCommand={onApplyCommand}
        />
      )}
      {selection.kind === "cell" && map?.levelType !== "dungeon" && (
        <>
          {map && project && (
            <p className={`context-capacity-note${actionPointCapacity(project.triggers, map.levelType, map.index).canCreate ? "" : " blocked"}`}>
              {actionPointCapacity(project.triggers, map.levelType, map.index).active}/100 Action Point records used on this map.
            </p>
          )}
          <InfoGrid
            rows={[
              ["Cell", `${selection.cell.x}, ${selection.cell.y}`],
              ["Raw Tile", selection.cell.tile],
              ["Render Tile", selectedCellMeaning?.renderTile ?? "unknown"],
              ["Tile Group", selectedCellMeaning ? tileAttributeGroup(selectedCellMeaning.attributes ?? null, selection.cell.tile, selectedTileset).join(", ") || "uncategorized" : "unknown"],
              ["Special/Icon", selectedCellMeaning?.iconId ?? "none"],
              ["Icon Art", selectedCellMeaning?.iconCandidates.length ? (selectedCellMeaning.iconAvailable ? "loaded" : "missing") : "none"],
              ["Solid Type", selectedCellMeaning?.attributes?.solidType ?? "unknown"],
              ["Move Cost", selectedCellMeaning?.attributes?.movementCost ?? "unknown"],
              ["Sound", selectedCellMeaning?.attributes?.movementSoundId ?? "none"],
              ["Shore / Water", yesNo(selectedCellMeaning?.attributes?.shore)],
              ["Runtime Path", yesNo(selectedCellMeaning?.attributes?.pathFlag)],
              ["Road Art", selectedCellMeaning?.attributeFlags.includes("visual-path") ? "yes" : "no"],
              ["Boat Required", selectedCellMeaning?.attributes?.boatRequirement ?? "unknown"],
              ["Fly / Float", yesNo(selectedCellMeaning?.attributes?.flyFloatRequired)],
              ["Blocks LOS", yesNo(selectedCellMeaning?.attributes?.blocksLos)],
              ["Combat Expansion", normalizedCombatBuild(selectedCellMeaning?.attributes ?? null) ? "3 x 3" : "none"],
              ["Action Points", selection.triggers.length],
              ["Random Rects", selection.rects.length],
              ["Player Maps", selection.records.length],
              ["Edit State", "editable"]
            ]}
          />
          {map && (
            <LandCellSecretEditor
              map={map}
              cell={selection.cell}
              onApplyCommand={onApplyCommand}
            />
          )}
          <CellTileEvidence cell={selection.cell} records={selection.records} />
          {selectedCellMeaning && <TileMeaningInspector title="Selected Cell Meaning" meaning={selectedCellMeaning} compact />}
          {selectedCellMeaning && (
            <SpecialTileSolidityEditor
              meaning={selectedCellMeaning}
              onApplyCommand={onApplyCommand}
            />
          )}
          <CellActionPointDetails
            project={project}
            triggers={selection.triggers}
            onSelectEntity={onSelectEntity}
            onOpenScripts={onOpenScripts}
          />
          <ScriptedChangeSection project={project} map={map} cell={selection.cell} onSelectEntity={onSelectEntity} onOpenScripts={onOpenScripts} />
          <MapDiagnostics diagnostics={[...(map ? cellDiagnostics(selection, map) : []), ...mapTileDiagnostics(selection, map, selectedCellMeaning)]} />
          <SelectionLinks
            map={map}
            triggers={selection.triggers}
            rects={selection.rects}
            records={selection.records}
            onSelectEntity={onSelectEntity}
            onOpenScripts={onOpenScripts}
          />
          {map && (
            <div className="context-action-stack">
              <button
                className="btn btn-secondary btn-xs context-action-button"
                type="button"
                disabled={selection.cell.tile === clearTileForMap(map, selectedTileset)}
                title={`Restore this cell to ${clearTileLabel(map, selectedTileset)}.`}
                onClick={() => {
                  const to = clearTileForMap(map, selectedTileset);
                  onApplyCommand({
                    kind: "paintTiles",
                    label: `Clear tile ${selection.cell.x},${selection.cell.y}`,
                    mapId: map.id,
                    cells: [{ ...selection.cell, index: mapTileIndex(map, selection.cell.x, selection.cell.y), from: selection.cell.tile, to }]
                  });
                }}
              >
                Clear Tile To {clearTileForMap(map, selectedTileset)}
              </button>
              <button
                className="btn btn-primary btn-xs context-action-button"
                type="button"
                disabled={project ? !actionPointCapacity(project.triggers, map.levelType, map.index).canCreate : false}
                title={project && !actionPointCapacity(project.triggers, map.levelType, map.index).canCreate ? "This map already uses all 100 Realmz Action Point records." : "Create an Action Point at the selected cell."}
                onClick={() => {
                  const recordIndex = nextActionPointRecordIndex(project?.triggers ?? [], map.levelType, map.index);
                  onApplyCommand({
                    kind: "createActionPoint",
                    label: `Create Action Point ${selection.cell.x},${selection.cell.y}`,
                    levelType: map.levelType,
                    levelIndex: map.index,
                    x: selection.cell.x,
                    y: selection.cell.y
                  });
                  if (recordIndex != null) {
                    const source = map.levelType === "land" ? "Data DD" : "Data DDD";
                    onSelectEntity(selectEntityFromId(triggerEntityId(map.levelType, map.index, recordIndex, source)));
                  }
                }}
              >
                Create Action Point Here
              </button>
              <button
                className="btn btn-ghost btn-xs context-action-button"
                type="button"
                onClick={() => {
                  const rectIndex = nextAvailableRandomRectIndex(project, map.levelType, map.index);
                  onApplyCommand({
                    kind: "createRandomRect",
                    label: `Create Random Rectangle ${selection.cell.x},${selection.cell.y}`,
                    levelType: map.levelType,
                    levelIndex: map.index,
                    rect: {
                      left: selection.cell.x,
                      top: selection.cell.y,
                      right: selection.cell.x,
                      bottom: selection.cell.y,
                      percent: 1000,
                      battleRange: [0, 0],
                      randomDoors: [0, 0, 0],
                      randomDoorPercent: [0, 0, 0],
                      only: false,
                      option: 0,
                      sound: 0,
                      text: 0
                    }
                  });
                  if (rectIndex != null) onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rectIndex}` });
                }}
                disabled={nextAvailableRandomRectIndex(project, map.levelType, map.index) == null}
              >
                Create Random Rectangle Here
              </button>
              {selection.cell.tile < 0 && (
                <button
                  className="btn btn-ghost btn-xs context-action-button"
                  type="button"
                  onClick={() => {
                    const fallback = clearTileForMap(map, selectedTileset);
                    onApplyCommand({
                      kind: "paintTiles",
                      label: "Remove stamp",
                      mapId: map.id,
                      cells: [{ ...selection.cell, index: mapTileIndex(map, selection.cell.x, selection.cell.y), from: selection.cell.tile, to: fallback }]
                    });
                  }}
                >
                  Remove Stamp to {clearTileLabel(map, selectedTileset)}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {selection.kind === "trigger" && (
        <TriggerSelectionDetails
          project={project}
          trigger={selection.trigger}
          onApplyCommand={onApplyCommand}
          onSelectEntity={onSelectEntity}
          onOpenScripts={onOpenScripts}
        />
      )}
      {selection.kind === "random" && (
        <RandomRectangleEditor map={map} rect={selection.rect} onApplyCommand={onApplyCommand} compact />
      )}
      {selection.kind === "record" && (
        <RecordSelectionDetails project={project} map={map} record={selection.record} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />
      )}
      {project && <small className="context-footnote">{project.scenario.name}</small>}
    </section>
  );
}

function ScriptedChangeSection({
  project,
  map,
  cell,
  onSelectEntity,
  onOpenScripts
}: {
  project: Project | null;
  map: MapEntity | null;
  cell: { x: number; y: number; tile: number };
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  const changes = scriptedTileChangesForCell(project, map, cell);
  if (changes.length === 0) return null;
  return (
    <details className="context-section scripted-change-section" open>
      <summary><span>Scripted Changes</span><b>{changes.length}</b></summary>
      <div className="selection-link-list">
        {changes.map((change) => {
          const selected = selectEntityFromId(change.entityId);
          return (
            <div className="link-chip-group" key={`${change.entityId}:${change.slot}`}>
              <button className="link-chip" type="button" onClick={() => onSelectEntity(selected)}>
                Slot {change.slot}: {change.label}
              </button>
              <button className="link-chip action" type="button" onClick={() => onOpenScripts(selected)}>
                Scripts/AP
              </button>
            </div>
          );
        })}
      </div>
      <p className="empty-copy compact">These are runtime script effects, not static stamps painted into the map grid.</p>
    </details>
  );
}

function CellActionPointDetails({
  project,
  triggers,
  onSelectEntity,
  onOpenScripts
}: {
  project: Project | null;
  triggers: TriggerRecord[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  if (triggers.length === 0) return null;
  return (
    <details className="context-section cell-action-point-details" open>
      <summary><span>Action Points On This Cell</span><b>{triggers.length}</b></summary>
      <div className="selection-link-list">
        {triggers.map((trigger) => {
          const selected = selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source));
          const markerState = actionPointMarkerStateForTrigger(project, trigger);
          const steps = trigger.actions
            .filter((action) => action.code !== 0)
            .slice(0, 4)
            .map((action) => ({ slot: action.slot, summary: mapInspectorActionSummary(project, action) }));
          return (
            <article className="cell-action-card" key={trigger.id}>
              <div>
                <strong>Action Point {trigger.recordIndex}</strong>
                <small>{trigger.percent}% chance{trigger.targetX != null && trigger.targetY != null ? ` | sends to ${trigger.landid ?? 0}, ${trigger.targetX},${trigger.targetY}` : ""}</small>
                {trigger.levelType === "land" && markerState !== "normal" && markerState !== "none" && (
                  <small>{markerState === "secret" ? "Hidden Secret via land cell state" : "Revealed Secret via land cell state"}</small>
                )}
              </div>
              {steps.length > 0 ? (
                <ol>
                  {steps.map((step) => <li key={`${trigger.id}:${step.slot}`}>{step.slot}. {step.summary}</li>)}
                </ol>
              ) : (
                <p className="empty-copy compact">No active steps.</p>
              )}
              <div className="link-chip-group">
                <button className="link-chip" type="button" onClick={() => onSelectEntity(selected)}>Select</button>
                <button className="link-chip action" type="button" onClick={() => onOpenScripts(selected)}>Open in AP</button>
              </div>
            </article>
          );
        })}
      </div>
    </details>
  );
}

function LandCellSecretEditor({
  map,
  cell,
  onApplyCommand
}: {
  map: MapEntity;
  cell: { x: number; y: number; tile: number };
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const state = landCellSecretState(cell.tile);
  const options: Array<{ id: LandCellSecretState; label: string }> = [
    { id: "normal", label: "Normal" },
    { id: "hidden", label: "Hidden Secret" },
    { id: "revealed", label: "Revealed Secret" }
  ];
  return (
    <section className="map-authoring-group land-cell-secret-editor" aria-label="Land cell secret state">
      <h4>Secret Area</h4>
      <div className="segmented-control" role="group" aria-label="Secret area state">
        {options.map((option) => (
          <button
            key={option.id}
            className={state === option.id ? "active" : ""}
            type="button"
            aria-pressed={state === option.id}
            onClick={() => onApplyCommand({
              kind: "setLandCellSecretState",
              label: `Set land cell ${option.label}`,
              mapId: map.id,
              x: cell.x,
              y: cell.y,
              state: option.id
            })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <small>{state === "hidden" ? "Undetected until Realmz reveals this cell." : state === "revealed" ? "Stored as already detected." : "Ordinary land cell state."}</small>
    </section>
  );
}

function ActionPointStepTable({
  project,
  trigger,
  slots,
  onSelectEntity
}: {
  project: Project | null;
  trigger: TriggerRecord;
  slots: ReturnType<typeof actionSlotEntitiesForTriggerRecord>;
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  return (
    <section className="map-authoring-group map-action-steps" aria-label="Action point steps">
      <h4>Steps</h4>
      <div className="map-linked-step-table">
        <div className="map-linked-step-head">
          <span>Step</span>
          <span>Code</span>
          <span>ID</span>
          <span>Action</span>
        </div>
        {Array.from({ length: 8 }, (_, step) => {
          const action = trigger.actions.find((candidate) => candidate.slot === step);
          const slotEntity = slots.find((slot) => Number(slot.summary.slot) === step);
          const label = action ? mapInspectorActionSummary(project, action) : "Empty";
          const content = (
            <>
              <span>{step}</span>
              <span>{action?.rawCode ?? 0}{action?.gosub ? "*" : ""}</span>
              <span>{action?.id ?? 0}</span>
              <span>{label}</span>
            </>
          );
          return slotEntity ? (
            <button
              key={step}
              className={action ? "filled" : ""}
              type="button"
              onClick={() => onSelectEntity(selectEntityFromId(slotEntity.id))}
            >
              {content}
            </button>
          ) : (
            <div key={step} className={action ? "filled" : ""}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function mapInspectorActionSummary(project: Project | null, action: TriggerRecord["actions"][number]) {
  const message = messageTargetPreview(project, action);
  if (message) {
    const text = message.text ? `: "${truncateMapInspectorText(message.text, 80)}"` : "";
    return `Show Message ${message.id}${message.noWait ? " · no wait" : ""}${text}`;
  }
  if (action.code === 0) return "Empty step";
  return `${action.label}${action.id ? ` ${action.id}` : ""}`;
}

function messageTargetPreview(project: Project | null, action: TriggerRecord["actions"][number]) {
  if (action.code !== 1 || action.id === 0) return null;
  const id = Math.abs(action.id);
  const text = messageTextForId(project, id);
  return {
    slot: action.slot,
    id,
    noWait: action.id < 0,
    text
  };
}

function messageTextForId(project: Project | null, id: number) {
  const record = project?.messages?.find((candidate) => candidate.id === id);
  if (record?.text?.trim()) return record.text.trim();
  return "";
}

function truncateMapInspectorText(text: string, max: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}...`;
}

function scriptedTileChangesForCell(project: Project | null, map: MapEntity | null, cell: { x: number; y: number }) {
  if (!project || !map) return [];
  const out: { entityId: string; slot: number; label: string }[] = [];
  for (const trigger of project.triggers ?? []) {
    for (const action of trigger.actions) {
      if (![12, 13, 25].includes(action.code)) continue;
      const edcd = project.extracodes?.find((row) => row.id === action.id);
      const values = edcd?.values ?? [];
      const targetLevel = values[0];
      const targetX = values[1];
      const targetY = values[2];
      const matches = targetLevel === map.index && targetX === cell.x && targetY === cell.y;
      if (!matches) continue;
      const entityId = trigger.levelType && trigger.levelIndex != null
        ? triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)
        : `ed3-action-record:${trigger.recordIndex}`;
      out.push({ entityId, slot: action.slot, label: `${action.label} targets ${cell.x},${cell.y}` });
    }
  }
  return out;
}

function cellDiagnostics(selection: Extract<Selection, { kind: "cell" }>, map: MapEntity) {
  const diagnostics: string[] = [];
  const markerState = actionPointMarkerState(selection.cell.tile, map.levelType);
  const tileLooksLikeActionMarker = markerState !== "none";
  if (selection.triggers.length > 0 && !tileLooksLikeActionMarker) {
    diagnostics.push("Action Point exists here, but the tile does not look like an AP marker.");
  }
  const orphanedActionMarker = map.levelType === "land" ? markerState === "normal" : tileLooksLikeActionMarker;
  if (orphanedActionMarker && selection.triggers.length === 0) {
    diagnostics.push("Tile looks like an AP marker, but no Action Point record resolves to this cell.");
  }
  for (const rect of selection.rects) {
    diagnostics.push(...randomRectDiagnostics(rect).map((message) => `Random Rectangle ${rect.rectIndex}: ${message}`));
  }
  if (selection.rects.length > 1) {
    const priority = [...selection.rects].sort((a, b) => b.rectIndex - a.rectIndex)[0];
    diagnostics.push(`Multiple Random Rectangles overlap this cell; Realmz checks higher record indexes first, so rectangle ${priority.rectIndex} has priority here.`);
  }
  return diagnostics;
}

function mapTileDiagnostics(
  selection: Extract<Selection, { kind: "cell" }>,
  map: MapEntity | null,
  meaning: ReturnType<typeof classifyTileValue> | null
) {
  const diagnostics: string[] = [];
  if (!meaning) return diagnostics;
  const attributes = meaning.attributes;
  if (meaning.attributeFlags.includes("visual-path") && !attributes?.pathFlag) {
    diagnostics.push("Tile is Divinity road/path art, but Realmz mapstats does not mark it as a runtime path.");
  }
  if (meaning.raw < 0 && attributes?.sourceKind !== "data-solids") {
    diagnostics.push("Special negative tile has no decoded Data Solids row; passability remains unknown.");
  }
  if (meaning.attributeFlags.includes("unknown-metadata")) {
    diagnostics.push("Tile behavior is unknown because no mapstats or Data Solids metadata matched this value.");
  }
  if (map) {
    const hasLandSecretState = map.levelType === "land" && landCellSecretState(selection.cell.tile) !== "normal";
    if ((hasLandSecretState || hasSecretMarkerTile(selection.cell.tile, map)) && attributes?.flags.includes("solid")) {
      diagnostics.push("Secret marker appears on a tile marked solid; verify that Realmz can actually enter this cell.");
    }
    if (isSecretWalkableTile(selection.cell.tile, map) && (attributes?.boatRequirement || attributes?.flyFloatRequired)) {
      diagnostics.push("Secret/passable marker is on a tile with boat or fly/float movement requirements.");
    }
  }
  return diagnostics;
}

function TriggerSelectionDetails({
  project,
  trigger,
  onApplyCommand,
  onSelectEntity,
  onOpenScripts
}: {
  project: Project | null;
  trigger: TriggerRecord;
  onApplyCommand: (command: ProjectCommand) => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  const slots = actionSlotEntitiesForTriggerRecord(project, trigger);
  const isActionPoint = trigger.source !== "Data ED3" && trigger.levelType && trigger.levelIndex != null;
  const markerState = actionPointMarkerStateForTrigger(project, trigger);
  const secret = isSecretActionPointState(markerState);
  const move = (patch: Partial<{ x: number; y: number }>) => {
    const levelType = trigger.levelType;
    const levelIndex = trigger.levelIndex;
    if (!isActionPoint || !trigger.coordinate || !levelType || levelIndex == null) return;
    onApplyCommand({
      kind: "moveActionPoint",
      label: "Move Action Point",
      triggerId: trigger.id,
      levelType,
      levelIndex,
      x: patch.x ?? trigger.coordinate.x,
      y: patch.y ?? trigger.coordinate.y
    });
  };
  const destinationMatchesTrigger = Boolean(
    isActionPoint &&
    trigger.coordinate &&
    trigger.landid === trigger.levelIndex &&
    trigger.targetX === trigger.coordinate.x &&
    trigger.targetY === trigger.coordinate.y
  );
  return (
    <div className="map-trigger-editor">
      <section className="map-authoring-group map-trigger-summary" aria-label="Action point summary">
        <h4>{trigger.source === "Data ED3" ? "Extra Action Point" : "Action Point"} {trigger.recordIndex}</h4>
        <InfoGrid
          rows={[
            ["Record", `${trigger.source} #${trigger.recordIndex}`],
            ["Type", secret ? markerState === "revealed-secret" ? "Revealed Secret Action Point" : "Secret Action Point" : "Action Point"],
            ["Chance", `${trigger.percent}%`],
            ["Steps", `${trigger.actions.filter((action) => action.code !== 0 || action.id !== 0).length}/8 filled`]
          ]}
        />
      </section>
      {isActionPoint && (
        <div className="context-action-stack">
          <button
            className="btn btn-primary btn-xs context-action-button context-action-button-narrow"
            type="button"
            onClick={() => onOpenScripts(selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)))}
          >
            Open in Scripts/AP
          </button>
        </div>
      )}
      {isActionPoint && trigger.coordinate && (
        <div className="map-authoring-form">
          <section className="map-authoring-group" aria-label="Trigger Location">
            <h4>Trigger Location</h4>
            <div className="map-authoring-fields two-column">
              <MapNumberField label="X" value={trigger.coordinate.x} min={0} max={89} compact plain maxLength={2} commitOnChange onCommit={(x) => move({ x })} />
              <MapNumberField label="Y" value={trigger.coordinate.y} min={0} max={89} compact plain maxLength={2} commitOnChange onCommit={(y) => move({ y })} />
            </div>
          </section>
          <section className="map-authoring-group" aria-label="Activation">
            <h4>Activation</h4>
            <MapNumberField label="% Chance" value={trigger.percent} min={0} max={100} compact plain maxLength={3} onCommit={(percent) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point chance", triggerId: trigger.id, fields: { percent } })} />
            {trigger.levelType === "land" ? (
              <small className="map-ap-secret-status">
                {markerState === "secret" ? "Hidden Secret via land cell state." : markerState === "revealed-secret" ? "Revealed Secret via land cell state." : "Normal land cell. Edit Secret Area in the map Selection Inspector."}
              </small>
            ) : (
              <small className="map-ap-dungeon-secret-status">
                {secret ? "Secret via this cell's Allow Move directions." : "Paint Allow Move directions in Dungeon Draw to make this cell secret."}
              </small>
            )}
            {markerState === "revealed-secret" && (
              <small className="map-ap-marker-status">
                {trigger.levelType === "land" ? "Stored as already detected in the land cell." : "Stored with Realmz's already-revealed runtime marker."}
              </small>
            )}
          </section>
          <details className="map-authoring-group map-authoring-destination" open={!destinationMatchesTrigger}>
            <summary>
              <span>After Script Destination</span>
              {destinationMatchesTrigger && (
                <TutorialTip title="Same As Trigger" body={MAP_SAME_AS_TRIGGER_DESTINATION_HELP} side="below">
                  <small>Same as trigger</small>
                </TutorialTip>
              )}
            </summary>
            <div className="map-authoring-fields three-column">
              <MapNumberField label="Level" value={trigger.landid ?? 0} min={0} max={255} compact plain maxLength={3} onCommit={(landid) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target level", triggerId: trigger.id, fields: { landid } })} />
              <MapNumberField label="X" value={trigger.targetX ?? 0} min={0} max={89} compact plain maxLength={2} onCommit={(targetX) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target X", triggerId: trigger.id, fields: { targetX } })} />
              <MapNumberField label="Y" value={trigger.targetY ?? 0} min={0} max={89} compact plain maxLength={2} onCommit={(targetY) => onApplyCommand({ kind: "updateTriggerHeader", label: "Update Action Point target Y", triggerId: trigger.id, fields: { targetY } })} />
            </div>
          </details>
          <button className="btn btn-ghost btn-xs context-action-button" type="button" onClick={() => onApplyCommand({ kind: "deleteTrigger", label: "Clear Action Point", triggerId: trigger.id })}>
            Clear to reusable slot
          </button>
        </div>
      )}
      <ActionPointStepTable project={project} trigger={trigger} slots={slots} onSelectEntity={onSelectEntity} />
    </div>
  );
}





function SelectionLinks({
  map,
  triggers,
  rects,
  records,
  onSelectEntity,
  onOpenScripts
}: {
  map: MapEntity | null;
  triggers: TriggerRecord[];
  rects: RandomLevel["rects"];
  records: SemanticEntity[];
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
}) {
  return (
    <div className="selection-link-list">
      {triggers.map((trigger) => {
        const selected = selectEntityFromId(triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source));
        return (
          <div className="link-chip-group" key={trigger.id}>
            <button
              className="link-chip"
              onClick={() => onSelectEntity(selected)}
            >
              {trigger.actions[0]?.label ?? "Action Point"} #{trigger.recordIndex}
            </button>
            <button className="link-chip action" onClick={() => onOpenScripts(selected)}>
              Scripts/AP
            </button>
          </div>
        );
      })}
      {map && rects.map((rect) => (
        <button key={rect.rectIndex} className="link-chip" onClick={() => onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rect.rectIndex}` })}>
          Random Rectangle {rect.rectIndex}
        </button>
      ))}
      {records.map((record) => (
        <button key={record.id} className="link-chip" onClick={() => onSelectEntity(selectEntityFromId(record.id))}>
          {record.label}
        </button>
      ))}
    </div>
  );
}







function selectionSummary(
  map: MapEntity | null,
  selectedEntity: SelectedEntity | null,
  selectedCell: { x: number; y: number; tile: number } | null,
  selectedRegion: MapRegionSelection | null,
  triggers: TriggerRecord[],
  randomLevel: RandomLevel | null,
  mapRecords: SemanticEntity[]
): Selection | null {
  if (selectedRegion) return { kind: "region", region: selectedRegion };
  if (map && selectedEntity?.id) {
    const trigger = triggers.find((candidate) => triggerEntityId(candidate.levelType, candidate.levelIndex, candidate.recordIndex, candidate.source) === selectedEntity.id);
    if (trigger) return { kind: "trigger", trigger };
    const rect = randomLevel?.rects.find((candidate) => selectedEntity.id === `random:${map.levelType}:${map.index}:${candidate.rectIndex}`);
    if (rect) return { kind: "random", rect };
    const record = mapRecords.find((candidate) => candidate.id === selectedEntity.id);
    if (record) return { kind: "record", record };
  }
  if (!selectedCell) return null;
  return {
    kind: "cell",
    cell: selectedCell,
    triggers: triggers.filter((trigger) => trigger.coordinate?.x === selectedCell.x && trigger.coordinate.y === selectedCell.y),
    rects: randomLevel?.rects.filter((rect) => randomRectContainsCell(rect, selectedCell.x, selectedCell.y)) ?? [],
    records: map ? mapRecords.filter((record) => mapRecordContainsCell(record, map, selectedCell.x, selectedCell.y)) : []
  };
}

function toolLabel(tool: EditorTool) {
  const definition = TOOL_BY_ID.get(tool);
  if (definition) return definition.label;
  return tool[0].toUpperCase() + tool.slice(1);
}

function summaryNumber(entity: SemanticEntity, key: string) {
  const value = entity.summary[key];
  return typeof value === "number" ? value : null;
}

function userFacingEditState(state: string | null | undefined) {
  if (state === "editable") return "Editable";
  if (state === "blocked") return "Not editable yet";
  if (state === "inspect-only") return "Read-only";
  return state ?? "Read-only";
}

function userFacingConfidence(confidence: string | null | undefined) {
  if (confidence === "source-backed" || confidence === "fixture-backed") return "Verified";
  if (confidence === "inferred") return "Likely";
  if (confidence === "preserved") return "Imported";
  if (confidence === "unknown") return "Unknown";
  return confidence ?? "Unknown";
}

function nextAvailableRandomRectIndex(project: Project | null, levelType: MapEntity["levelType"], levelIndex: number) {
  const level = project?.randomLevels?.find((candidate) => candidate.levelType === levelType && candidate.levelIndex === levelIndex);
  const used = new Set((level?.rects ?? []).map((rect) => rect.rectIndex));
  for (let index = 0; index < 20; index += 1) {
    if (!used.has(index)) return index;
  }
  return null;
}
