import type { EditorState } from "../../store";
import type {
  MapEntity,
  MapPreviewFocalPoint,
  MapPreviewMode,
  MapWorkbenchMode,
  Project,
  ProjectCommand,
  RandomLevel,
  TilesetAsset
} from "../../types";
import { buildCreateMapAction, buildDuplicateMapAction, type MapContextFocus } from "./mapBrowserModel";
import { MapLevelSettings } from "./MapLevelSettings";

export function MapOutliner({
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
    const action = buildCreateMapAction(maps, levelType);
    onApplyCommand(action.command);
    onSelectMap(action.mapId);
    onSetWorkbenchMode("canvas");
  };
  const duplicateMap = () => {
    if (!project || !selectedMap) return;
    const action = buildDuplicateMapAction(maps, selectedMap);
    onApplyCommand(action.command);
    onSelectMap(action.mapId);
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
