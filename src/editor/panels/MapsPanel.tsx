import { EditorState } from "../store";
import { MapEntity, MapViewFlag, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { triggerOverlayKinds } from "../semanticGraph";
import { RealmzMapCanvas } from "../components/MapCanvas";
import { MapContextSidebar } from "../components/MapContextSidebar";
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
  onBeginPaintStroke: (label: string) => void;
  onApplyCommand: (command: ProjectCommand) => void;
  onCommitPaintStroke: () => void;
  onCancelPaintStroke: () => void;
}) {
  const visibleTriggers = state.showTriggers ? mapTriggers.filter((trigger) => triggerMatchesViewFilters(state.project, trigger, state)) : [];
  return (
    <>
      <MapContextSidebar
        state={state}
        selectedMap={selectedMap}
        selectedRandomLevel={selectedRandomLevel}
        mapTriggers={mapTriggers}
        mapRecords={mapRecords}
        selectedTileset={selectedTileset}
        atlas={atlas}
        onSelectMap={onSelectMap}
        onSetTool={onSetTool}
        onSelectTile={onSelectTile}
        onSelectEntity={onSelectEntity}
        onClearSelection={onClearSelection}
        onApplyCommand={onApplyCommand}
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
              selectedTile={state.selectedTile}
              zoom={state.zoom}
              smoothTiles={state.smoothTiles}
              viewOptions={state}
              showRandomRects={state.showRandomRects}
              showMapRecords={state.showMapRecords}
              selectedEntity={state.selectedEntity}
              selectedCell={state.selectedCell}
              focusTarget={state.focusTarget}
              onSelectCell={onSelectCell}
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
    </>
  );
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
