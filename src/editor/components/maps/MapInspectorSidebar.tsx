import { useEffect, useState } from "react";
import type { EditorState } from "../../store";
import type {
  MapEntity,
  MapViewFlag,
  ProjectCommand,
  RandomLevel,
  SelectedEntity,
  SemanticEntity,
  TilesetAsset,
  TriggerRecord
} from "../../types";
import { ScrollArea } from "../../ui";
import type { MapWorkbenchState } from "../../panels/maps/useMapWorkbenchState";
import { ResizablePane } from "../ResizablePane";
import { DungeonDrawInspector } from "./DungeonFlagInspector";
import { MapPaintInspector } from "./MapPaintInspector";
import { resolveMapSelection } from "./mapSelectionModel";
import { MapSelectionInspector } from "./MapSelectionInspector";
import { MapModeInspector, MapSetupInspector } from "./MapSetupInspector";
import {
  compatibleMapTool,
  resolveMapInspectorRoute,
  transitionToMapInspector,
  type MapSidebarInspector
} from "./mapInspectorRouting";
interface MapInspectorContext {
  state: EditorState;
  selectedMap: MapEntity | null;
  selectedTileset: TilesetAsset | null;
  atlas: EditorState["atlasEntries"][string] | null;
  selectedRandomLevel: RandomLevel | null;
  mapTriggers: TriggerRecord[];
  mapRecords: SemanticEntity[];
}
interface MapInspectorActions {
  onSelectTile: (tile: number) => void;
  onSetViewFlag: (flag: MapViewFlag, value: boolean) => void;
  onOpenScripts: (entity: SelectedEntity) => void;
  onClearSelection: () => void;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}
export function MapInspectorSidebar({
  context: {
    state,
    selectedMap,
    selectedTileset,
    atlas,
    selectedRandomLevel,
    mapTriggers,
    mapRecords
  },
  workbench: {
    shell: {
      paletteOpen,
      setPaletteOpen: onSetPaletteOpen,
      setContextFocus: onSetContextFocus,
      workbenchMode,
      setWorkbenchMode: onSetWorkbenchMode
    },
    paint: {
      paintMode,
      setPaintMode: onSetPaintMode,
      paintVariation,
      setPaintVariation: onSetPaintVariation,
      activePaintGroupId,
      setActivePaintGroupId: onSetActivePaintGroup,
      paintPaletteMode,
      setPaintPaletteMode: onSetPaintPaletteMode,
      dungeonDrawFlags,
      setDungeonDrawFlags: onSetDungeonDrawFlags,
      activeCustomPaletteId,
      setActiveCustomPaletteId: onSetActiveCustomPaletteId,
      variationTiles,
      setPaletteVariationTiles: onSetPaletteVariationTiles,
      selectedRegion,
      setSelectedRegion: onSetSelectedRegion
    },
    stamps: {
      globalMapStamps,
      setGlobalMapStamps: onSetGlobalMapStamps,
      selectedSuperTileStamp,
      setSelectedSuperTileStampId: onSelectSuperTileStamp
    },
    smartBrush: {
      smartBrushPreset,
      setSmartBrushPreset: onSetSmartBrushPreset,
      smartBrushMask,
      visibleSmartBrushPlan: smartBrushPlan,
      clearSmartBrushMask: onClearSmartBrushMask,
      applySmartBrush: onApplySmartBrush
    },
    openCanvasTool: onSetTool
  },
  actions: {
    onSelectTile,
    onSetViewFlag,
    onOpenScripts,
    onClearSelection,
    onSelectEntity,
    onApplyCommand
  }
}: {
  context: MapInspectorContext;
  workbench: MapWorkbenchState;
  actions: MapInspectorActions;
}) {
  const selectedSuperTileStampId = selectedSuperTileStamp?.id ?? null;
  const [open, setOpen] = useState(() => localStorage.getItem("providence.mapRightContextOpen.v1") !== "0");
  useEffect(() => {
    localStorage.setItem("providence.mapRightContextOpen.v1", open ? "1" : "0");
  }, [open]);
  useEffect(() => {
    const compatibleTool = compatibleMapTool(selectedMap?.levelType ?? null, state.activeTool);
    if (compatibleTool !== state.activeTool) onSetTool(compatibleTool);
  }, [onSetTool, selectedMap?.levelType, state.activeTool]);
  const selection = resolveMapSelection(selectedMap, state.selectedEntity, state.selectedCell, selectedRegion, mapTriggers, selectedRandomLevel, mapRecords);
  const selectedMapIsDungeon = selectedMap?.levelType === "dungeon";
  const route = resolveMapInspectorRoute({
    workbenchMode,
    activeTool: state.activeTool,
    levelType: selectedMap?.levelType ?? null,
    hasSelection: selection != null,
    hasSelectedRegion: selectedRegion != null
  });
  const activeSelection = route.showSelection ? selection : null;
  const switchInspector = (choice: MapSidebarInspector) => {
    const transition = transitionToMapInspector(choice, { isDungeon: selectedMapIsDungeon, hasSelection: selection != null });
    if (!transition) return;
    if (transition.clearRegion) onSetSelectedRegion(null);
    if (transition.clearSelection) onClearSelection();
    onSetWorkbenchMode(transition.workbenchMode);
    if (transition.tool) onSetTool(transition.tool);
  };
  if (!open) {
    return (
      <aside className="map-context-rail">
        <button type="button" onClick={() => setOpen(true)}>
          {route.choice === "paint" ? "Paint" : "Inspector"}
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
              value={route.choice}
              hasSelection={selection != null}
              hasDungeonDraw={selectedMapIsDungeon}
              onChange={switchInspector}
            />
            <button className="btn btn-ghost btn-xs" type="button" onClick={() => setOpen(false)}>Collapse</button>
          </div>
        {route.showPaint ? (
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
        ) : route.showDungeonDraw ? (
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
            onOpenPalette={() => onSetPaletteOpen(true)}
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
