import { EditorState } from "../store";
import { MapEntity, MapViewFlag, Project, ProjectCommand, RandomLevel, SelectedEntity, SemanticEntity, TilesetAsset, TriggerRecord } from "../types";
import { mapEntityId, triggerEntityId } from "../utils";
import { actionSlotEntitiesForTriggerRecord, triggerOverlayKinds } from "../semanticGraph";
import { InfoGrid } from "../components/InfoGrid";
import { RealmzMapCanvas } from "../components/MapCanvas";
import { MapContextSidebar } from "../components/MapContextSidebar";
import { MapViewFilters } from "../components/MapViewFilters";
import { OverlayInspector } from "../components/OverlayInspector";
import { SemanticInspector } from "../components/SemanticInspector";
import { tileValueAt } from "../map/geometry";

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
  onSetShowTriggers,
  onSetShowRandomRects,
  onSetShowMapRecords,
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
  onSetShowTriggers: (value: boolean) => void;
  onSetShowRandomRects: (value: boolean) => void;
  onSetShowMapRecords: (value: boolean) => void;
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

      <aside className="editor-inspector">
        <MapInspector
          map={selectedMap}
          project={state.project}
          randomLevel={selectedRandomLevel}
          selectedCell={state.selectedCell}
          triggers={mapTriggers}
          mapRecords={mapRecords}
          onSelectEntity={onSelectEntity}
        />
        <OverlayInspector
          map={selectedMap}
          selectedEntity={state.selectedEntity}
          selectedCell={state.selectedCell}
          triggers={mapTriggers}
          randomLevel={selectedRandomLevel}
          mapRecords={mapRecords}
          onSelectEntity={onSelectEntity}
        />
        <TriggerInspector project={state.project} triggers={mapTriggers} onSelectEntity={onSelectEntity} />
        <SemanticInspector project={state.project} selectedEntity={state.selectedEntity} onSelect={onSelectEntity} />
      </aside>
    </>
  );
}

type EditorStateSetter<Key extends keyof EditorState> = (value: EditorState[Key]) => void;

function MapList({ project, selectedMapId, onSelect }: { project: Project | null; selectedMapId: string | null; onSelect: (id: string) => void }) {
  return (
    <section className="room-list">
      <div className="panel-header">
        <span>Scenario Maps</span>
        <b>{project?.maps.length ?? 0}</b>
      </div>
      <div className="room-list-items">
        {project?.maps.map((map) => (
          <button key={map.id} className={`room-item${selectedMapId === map.id ? " selected" : ""}`} onClick={() => onSelect(map.id)}>
            <span className="room-item-icon">{map.levelType === "dungeon" ? "D" : "L"}</span>
            <span className="room-item-info">
              <span className="room-item-name">{map.name}</span>
              <small>{map.render.tilesetId}</small>
            </span>
          </button>
        ))}
        {!project && <div className="entity-empty">Import a Realmz scenario to begin.</div>}
      </div>
    </section>
  );
}

function SourceSummary({ project }: { project: Project | null }) {
  if (!project) return null;
  const editable = project.source.files.filter((file) => file.editable).length;
  return (
    <section className="source-summary">
      <div className="panel-header">
        <span>Source Snapshot</span>
      </div>
      <dl>
        <dt>Mode</dt>
        <dd>{project.source.immutable ? "read-only import" : "mutable"}</dd>
        <dt>Files</dt>
        <dd>{project.source.files.length}</dd>
        <dt>Editable</dt>
        <dd>{editable}</dd>
      </dl>
    </section>
  );
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

function MapInspector({
  map,
  project,
  randomLevel,
  selectedCell,
  triggers,
  mapRecords,
  onSelectEntity
}: {
  map: MapEntity | null;
  project: Project | null;
  randomLevel: RandomLevel | null;
  selectedCell: { x: number; y: number; tile: number } | null;
  triggers: TriggerRecord[];
  mapRecords: SemanticEntity[];
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const cellTriggers = selectedCell
    ? triggers.filter((trigger) => trigger.coordinate?.x === selectedCell.x && trigger.coordinate.y === selectedCell.y)
    : [];
  const randomMembership = selectedCell
    ? randomLevel?.rects.filter(
        (rect) =>
          selectedCell.x >= rect.left &&
          selectedCell.x <= rect.right &&
          selectedCell.y >= rect.top &&
          selectedCell.y <= rect.bottom
      ) ?? []
    : [];
  const cellMapRecords = selectedCell
    ? mapRecords.filter((entity) => entity.summary.startX === selectedCell.x && entity.summary.startY === selectedCell.y)
    : [];

  return (
    <section className="object-inspector">
      <div className="inspector-header">Map Inspector</div>
      {map ? (
        <>
          <InfoGrid
            rows={[
              ["Name", map.name],
              ["Type", map.levelType],
              ["Record", `${map.source} #${map.index}`],
              ["Tileset", map.render.tilesetId],
              ["Landlook", randomLevel?.landlook ?? "none"],
              ["Dark", randomLevel?.isDark ? "yes" : "no"],
              ["LOS", randomLevel?.useLos ? "yes" : "no"],
              ["Triggers", triggers.length.toLocaleString()],
              ["Cell", selectedCell ? `${selectedCell.x}, ${selectedCell.y}` : "none"],
              ["Tile", selectedCell ? String(selectedCell.tile) : "none"]
            ]}
          />
          <CellLinks
            project={project}
            map={map}
            cellTriggers={cellTriggers}
            randomMembership={randomMembership}
            cellMapRecords={cellMapRecords}
            onSelectEntity={onSelectEntity}
          />
        </>
      ) : (
        <p className="empty-copy">No map selected.</p>
      )}
    </section>
  );
}

function CellLinks({
  project,
  map,
  cellTriggers,
  randomMembership,
  cellMapRecords,
  onSelectEntity
}: {
  project: Project | null;
  map: MapEntity;
  cellTriggers: TriggerRecord[];
  randomMembership: RandomLevel["rects"];
  cellMapRecords: SemanticEntity[];
  onSelectEntity: (entity: SelectedEntity) => void;
}) {
  const currentMapId = mapEntityId(map.levelType, map.index);
  return (
    <div className="cell-link-stack">
      <button className="link-chip" onClick={() => onSelectEntity({ type: "map", id: currentMapId })}>
        {currentMapId}
      </button>
      {cellTriggers.map((trigger) => {
        const id = triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source);
        return (
          <button key={trigger.id} className="link-chip" onClick={() => onSelectEntity({ type: "trigger", id })}>
            {trigger.actions[0]?.label ?? trigger.id}
          </button>
        );
      })}
      {randomMembership.map((rect) => (
        <button
          className="link-chip"
          key={rect.rectIndex}
          onClick={() => onSelectEntity({ type: "encounter", id: `random:${map.levelType}:${map.index}:${rect.rectIndex}` })}
        >
          random rect {rect.rectIndex}
        </button>
      ))}
      {cellMapRecords.map((record) => (
        <button key={record.id} className="link-chip" onClick={() => onSelectEntity({ type: "record", id: record.id })}>
          {record.label}
        </button>
      ))}
    </div>
  );
}

function TriggerInspector({ project, triggers, onSelectEntity }: { project: Project | null; triggers: TriggerRecord[]; onSelectEntity: (entity: SelectedEntity) => void }) {
  return (
    <section className="object-inspector trigger-panel">
      <div className="inspector-header">Trigger Stack</div>
      <div className="trigger-list">
        {triggers.slice(0, 90).map((trigger) => {
          const slots = actionSlotEntitiesForTriggerRecord(project, trigger);
          const summary = slots.length
            ? slots.map((slot) => actionSlotLabel(slot)).join(", ")
            : trigger.actions.map((action) => action.label).join(", ");
          return (
            <button
              key={trigger.id}
              onClick={() =>
                onSelectEntity({
                  type: trigger.source === "Data ED3" ? "macro" : "trigger",
                  id: triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source)
                })
              }
            >
              <strong>{trigger.coordinate ? `${trigger.coordinate.x},${trigger.coordinate.y}` : "macro"}</strong>
              <span>{summary || "No actions"}</span>
            </button>
          );
        })}
        {triggers.length === 0 && <p className="empty-copy">No active triggers on this map.</p>}
      </div>
    </section>
  );
}

function actionSlotLabel(slot: SemanticEntity) {
  const usage = slot.summary.edcdUsage as { summary?: string } | undefined;
  return usage?.summary ?? String(slot.summary.label ?? `opcode ${slot.summary.code ?? "?"}`);
}
