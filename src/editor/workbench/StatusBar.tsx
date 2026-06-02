import { ActiveWorkbench, LibraryCatalog, Project } from "../types";
import { isSemanticMappingPending } from "../app/appUtils";

export function StatusBar({
  status,
  activeWorkbench,
  project,
  catalog
}: {
  status: string;
  activeWorkbench: ActiveWorkbench;
  project: Project | null;
  catalog: LibraryCatalog | null;
}) {
  const mappingPending = isSemanticMappingPending(project) && status.startsWith("Mapping scenario links");
  const projectSummary = project
    ? isSemanticMappingPending(project)
      ? mappingPending
        ? `${project.maps.length} maps | ${project.triggers.length.toLocaleString()} triggers | mapping links...`
        : `${project.maps.length} maps | ${project.triggers.length.toLocaleString()} triggers | links on demand`
      : `${project.maps.length} maps | ${project.triggers.length.toLocaleString()} triggers | links on demand`
    : "Awaiting project";
  return (
    <footer className="status-bar">
      <span>{status}</span>
      <span className="status-bar-summary">
        <span>
          {activeWorkbench === "library"
            ? `${catalog?.summary.sourceCount ?? 0} library sources | ${catalog?.summary.entityCount ?? 0} entities`
            : projectSummary}
        </span>
        {mappingPending && <span className="semantic-mapping-progress compact" aria-label="Mapping scenario links" />}
      </span>
    </footer>
  );
}
