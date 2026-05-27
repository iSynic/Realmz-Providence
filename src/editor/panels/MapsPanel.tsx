import { useEffect, useState } from "react";
import { EditorState } from "../store";
import { MapEntity, MapPaintMode, MapPreviewFocalPoint, MapPreviewMode, MapRegionSelection, MapViewFlag, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { triggerOverlayKinds } from "../semanticGraph";
import { RealmzMapCanvas } from "../components/MapCanvas";
import { MapContextSidebar, MapSelectionSidebar } from "../components/MapContextSidebar";
import { MapViewFilters } from "../components/MapViewFilters";

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
  onSelectCell: (cell: { x: number; y: number; tile: number }) => void;
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
  const [paintMode, setPaintMode] = useState<MapPaintMode>("brush");
  const [previewMode, setPreviewMode] = useState<MapPreviewMode>("off");
  const [previewFocalPoint, setPreviewFocalPoint] = useState<MapPreviewFocalPoint | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<MapRegionSelection | null>(null);
  const [replaceSourceTile, setReplaceSourceTile] = useState<number | null>(null);
  const visibleTriggers = state.showTriggers ? mapTriggers.filter((trigger) => triggerMatchesViewFilters(state.project, trigger, state)) : [];
  useEffect(() => {
    setSelectedRegion(null);
    setReplaceSourceTile(null);
    setPreviewFocalPoint(null);
  }, [selectedMap?.id]);
  return (
    <>
      <MapContextSidebar
        state={state}
        selectedMap={selectedMap}
        selectedTileset={selectedTileset}
        atlas={atlas}
        onSelectMap={onSelectMap}
        onSetTool={(tool) => {
          onSetTool(tool);
          if (tool === "paint") setPaletteOpen(true);
        }}
        onSelectTile={onSelectTile}
        paintMode={paintMode}
        onSetPaintMode={setPaintMode}
        selectedRegion={selectedRegion}
        onSetSelectedRegion={setSelectedRegion}
        replaceSourceTile={replaceSourceTile}
        onSetReplaceSourceTile={setReplaceSourceTile}
        onApplyCommand={onApplyCommand}
        paletteOpen={paletteOpen}
        onSetPaletteOpen={setPaletteOpen}
      />

      <section className="editor-canvas-area">
        <MapViewFilters
          state={state}
          onSetZoom={onSetZoom}
          onSetSmoothTiles={onSetSmoothTiles}
          onSetViewFlag={onSetViewFlag}
        />
        {selectedMap ? (
          <>
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
              focusTarget={state.focusTarget}
              onSelectCell={onSelectCell}
              onSetSelectedRegion={setSelectedRegion}
              onSampleTile={onSelectTile}
              onSelectEntity={onSelectEntity}
              onBeginPaintStroke={onBeginPaintStroke}
              onApplyCommand={onApplyCommand}
              onCommitPaintStroke={onCommitPaintStroke}
              onCancelPaintStroke={onCancelPaintStroke}
            />
          </>
        ) : (
          <div className="room-canvas-placeholder">Import or open a Providence project.</div>
        )}
      </section>
      <MapSelectionSidebar
        state={state}
        selectedMap={selectedMap}
        selectedTileset={selectedTileset}
        atlas={atlas}
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
        onSetTool={(tool) => {
          onSetTool(tool);
          if (tool === "paint") setPaletteOpen(true);
        }}
        onSetViewFlag={onSetViewFlag}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenScripts={onOpenScripts}
        paintMode={paintMode}
        onSetPaintMode={setPaintMode}
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
