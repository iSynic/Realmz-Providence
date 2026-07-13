import { useEffect, useState } from "react";
import type { MapContextFocus } from "./maps/mapBrowserModel";
import { EditorState } from "../store";
import { CustomMapStamp, DungeonCellFlag, EditorTool, MapEntity, MapPaintMode, MapPaintVariation, MapRegionSelection, MapViewFlag, MapWorkbenchMode, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, SmartBrushMaskCell, SmartBrushPlan, SmartBrushPreset, TilePaletteCategory, TilesetAsset, TriggerRecord } from "../types";
import { ScrollArea } from "../ui";
import { ResizablePane } from "./ResizablePane";
import { LandLayoutEditor, type LandLayoutCellSelection } from "./maps/LandLayoutWorkbench";
import { LandTileAtlasEditor } from "./maps/LandTilesWorkbench";
import { RandomAreasWorkbench } from "./maps/RandomEncountersWorkbench";
import { resolveMapSelection, type MapSelection } from "./maps/mapSelectionModel";
import { DungeonDrawInspector } from "./maps/DungeonFlagInspector";
import { MapSelectionInspector } from "./maps/MapSelectionInspector";
import { MapPaintInspector } from "./maps/MapPaintInspector";
import { MapModeInspector, MapSetupInspector } from "./maps/MapSetupInspector";

export { LandLayoutEditor };
export type { LandLayoutCellSelection };
export { LandTileAtlasEditor };
export { RandomAreasWorkbench };

type MapSidebarInspector = "setup" | "paint" | "dungeon-draw" | "selection" | "land-layout" | "land-tiles" | "random-areas";

export { MapBrowserSidebar as MapContextSidebar } from "./maps/MapBrowserSidebar";
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
  onSelectTile,
  onSetContextFocus,
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
  onSelectTile: (tile: number) => void;
  onSetContextFocus: (focus: MapContextFocus) => void;
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
            onSetWorkbenchMode={onSetWorkbenchMode}
          />
        ) : (
          <MapSetupInspector
            project={state.project}
            selectedMap={selectedMap}
            selectedTileset={selectedTileset}
            randomLevel={selectedRandomLevel}
            activeTool={state.activeTool}
            workbenchMode={workbenchMode}
            showRandomRects={state.showRandomRects}
            onSetContextFocus={onSetContextFocus}
            onSetWorkbenchMode={onSetWorkbenchMode}
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
