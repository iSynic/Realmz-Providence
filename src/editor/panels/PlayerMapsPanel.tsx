import { AtlasEntry, IconEntry, MapRecord, Project, ProjectCommand, SelectedEntity, SemanticEntity } from "../types";
import { MapRecordsWorkbench } from "../components/maps/MapRecordsWorkbench";

export function PlayerMapsPanel({
  project,
  selectedEntity,
  atlasEntries,
  icons,
  onSelectEntity,
  onOpenTool,
  onOpenRelatedMap,
  onApplyCommand
}: {
  project: Project;
  selectedEntity: SelectedEntity | null;
  atlasEntries: Record<string, AtlasEntry>;
  icons: Record<number, IconEntry>;
  onSelectEntity: (entity: SelectedEntity) => void;
  onOpenTool: (tab: "text", editor: string) => void;
  onOpenRelatedMap: (record: MapRecord) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const mapRecords = (project.semanticSchema?.entities ?? []).filter((entity): entity is SemanticEntity => entity.type === "map record");
  return (
    <section className="player-maps-panel">
      <div className="player-maps-pane">
        <header className="panel-card player-maps-header">
          <div>
            <h2>Player Maps</h2>
            <p>Create and edit the Maps/Notes entries players can find in game.</p>
          </div>
          <strong>{project.mapRecords.length} map(s)</strong>
        </header>
        <MapRecordsWorkbench
          project={project}
          selectedMap={null}
          selectedEntity={selectedEntity}
          mapRecords={mapRecords}
          filterToSelectedMap={false}
          atlasEntries={atlasEntries}
          icons={icons}
          onSelectEntity={onSelectEntity}
          onOpenTool={onOpenTool}
          onOpenRelatedMap={onOpenRelatedMap}
          onApplyCommand={onApplyCommand}
        />
      </div>
    </section>
  );
}
