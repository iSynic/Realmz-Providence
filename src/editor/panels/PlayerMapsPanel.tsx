import { AtlasEntry, IconEntry, MapRecord, Project, ProjectCommand, SelectedEntity, SemanticEntity } from "../types";
import { MapRecordsWorkbench } from "../components/maps/MapRecordsWorkbench";
import { PanelHeader } from "../ui";

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
        <PanelHeader
          className="panel-card player-maps-header"
          headingLevel={2}
          title="Player Maps"
          description="Create and edit the Maps/Notes entries players can find in game."
          meta={`${project.mapRecords.length} map(s)`}
        />
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
