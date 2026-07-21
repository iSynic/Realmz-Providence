import type { LevelType } from "../../types";

export function MapCanvasEmptyState({
  hasProject,
  onCreateMap
}: {
  hasProject: boolean;
  onCreateMap: (levelType: LevelType) => void;
}) {
  return (
    <div className="room-canvas-placeholder map-empty-state">
      <div>
        <h2>{hasProject ? "Create your first map" : "Open a project to begin mapping"}</h2>
        <p>{hasProject ? "Start with a blank outdoor land map or a dungeon map, then paint tiles and add authoring data." : "Create or import a Providence project to browse maps."}</p>
      </div>
      {hasProject && (
        <div className="map-empty-actions">
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onCreateMap("land")}>
            New Land Map
          </button>
          <button className="btn btn-secondary btn-sm" type="button" onClick={() => onCreateMap("dungeon")}>
            New Dungeon Map
          </button>
        </div>
      )}
    </div>
  );
}
