import { ActiveWorkbench, LibraryCatalog, Project } from "../types";

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
  return (
    <footer className="status-bar">
      <span>{status}</span>
      <span>
        {activeWorkbench === "library"
          ? `${catalog?.summary.sourceCount ?? 0} library sources | ${catalog?.summary.entityCount ?? 0} entities`
          : project
            ? `${project.maps.length} maps | ${project.triggers.length.toLocaleString()} triggers | ${project.semanticSchema.summary.linkCount.toLocaleString()} links`
            : "Awaiting project"}
      </span>
    </footer>
  );
}
