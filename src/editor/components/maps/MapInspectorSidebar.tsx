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
import { MapInspectorCollapsedRail, MapInspectorSwitcher } from "./MapInspectorSwitcher";
import { MapPaintInspector } from "./MapPaintInspector";
import { MapSelectionInspector } from "./MapSelectionInspector";
import { MapModeInspector, MapSetupInspector } from "./MapSetupInspector";
import { useMapInspectorRouting } from "./useMapInspectorRouting";
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
    selection: {
      connectedSelection,
      setConnectedSelection: onSetConnectedSelection
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
      smartBrushDrawMode,
      setSmartBrushDrawMode: onSetSmartBrushDrawMode,
      smartBrushShapeFill,
      setSmartBrushShapeFill: onSetSmartBrushShapeFill,
      smartBrushMask,
      visibleSmartBrushPlan: smartBrushPlan,
      clearSmartBrushMask: onClearSmartBrushMask,
      loadSmartBrushMaskFromCells: onLoadSmartBrushMaskFromCells,
      growSmartBrushMask: onGrowSmartBrushMask,
      shrinkSmartBrushMask: onShrinkSmartBrushMask,
      applySmartBrush: onApplySmartBrush
    },
    safeguards: {
      protectMapFeatures,
      setProtectMapFeatures: onSetProtectMapFeatures
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
  const {
    open,
    setOpen,
    selection,
    selectedMapIsDungeon,
    route,
    activeSelection,
    switchInspector
  } = useMapInspectorRouting({
    state,
    selectedMap,
    selectedRandomLevel,
    mapTriggers,
    mapRecords,
    selectedRegion,
    connectedSelection,
    workbenchMode,
    onSetTool,
    onSetSelectedRegion,
    onSetConnectedSelection,
    onClearSelection,
    onSetWorkbenchMode
  });
  if (!open) {
    return <MapInspectorCollapsedRail label={route.choice === "paint" ? "Paint" : "Inspector"} onOpen={() => setOpen(true)} />;
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
            smartBrushDrawMode={smartBrushDrawMode}
            onSetSmartBrushDrawMode={onSetSmartBrushDrawMode}
            smartBrushShapeFill={smartBrushShapeFill}
            onSetSmartBrushShapeFill={onSetSmartBrushShapeFill}
            smartBrushMask={smartBrushMask}
            smartBrushPlan={smartBrushPlan}
            protectMapFeatures={protectMapFeatures}
            onSetProtectMapFeatures={onSetProtectMapFeatures}
            onClearSmartBrushMask={onClearSmartBrushMask}
            onGrowSmartBrushMask={onGrowSmartBrushMask}
            onShrinkSmartBrushMask={onShrinkSmartBrushMask}
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
            libraryAssets={state.libraryCatalog?.assets ?? []}
            atlasStatus={state.atlasStatus}
            selectedTileset={selectedTileset}
            atlas={atlas}
            icons={state.iconEntries}
            dungeonDrawFlags={dungeonDrawFlags}
            onSetDungeonDrawFlags={onSetDungeonDrawFlags}
            onSelectEntity={onSelectEntity}
            onOpenScripts={onOpenScripts}
            onApplyCommand={onApplyCommand}
            onClearConnectedSelection={() => onSetConnectedSelection(null)}
            onSetConnectedSelection={onSetConnectedSelection}
            selectedTile={state.selectedTile}
            onSelectTile={onSelectTile}
            paintVariation={paintVariation}
            activePaintGroupId={activePaintGroupId}
            onSetActivePaintGroup={onSetActivePaintGroup}
            paintPaletteMode={paintPaletteMode}
            onSetPaintPaletteMode={onSetPaintPaletteMode}
            activeCustomPaletteId={activeCustomPaletteId}
            onSetActiveCustomPaletteId={onSetActiveCustomPaletteId}
            variationTiles={variationTiles}
            onSetPaletteVariationTiles={onSetPaletteVariationTiles}
            smartBrushPreset={smartBrushPreset}
            onSetSmartBrushPreset={onSetSmartBrushPreset}
            protectMapFeatures={protectMapFeatures}
            onSetProtectMapFeatures={onSetProtectMapFeatures}
            onUseSelectionAsSmartMask={onLoadSmartBrushMaskFromCells}
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
