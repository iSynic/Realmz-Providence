import type { CSSProperties } from "react";
import type { ActiveWorkbench, LibraryCatalog, Project, SemanticMappingProgress } from "../types";
import { isSemanticMappingPending } from "../app/appUtils";

export function StatusBar({
  status,
  activeWorkbench,
  project,
  catalog,
  semanticMapping
}: {
  status: string;
  activeWorkbench: ActiveWorkbench;
  project: Project | null;
  catalog: LibraryCatalog | null;
  semanticMapping: SemanticMappingProgress | null;
}) {
  const mappingPending = Boolean(semanticMapping?.active) || (isSemanticMappingPending(project) && status.startsWith("Mapping scenario links"));
  const mappingLabel = semanticMapping
    ? `${semanticMapping.label}${semanticMapping.indeterminate ? "" : ` ${semanticMapping.completed}/${semanticMapping.total}`} | ${formatElapsed(semanticMapping.updatedAt - semanticMapping.startedAt)}`
    : "Mapping links...";
  const progressPercent = semanticMapping?.total
    ? Math.max(2, Math.min(100, Math.round((semanticMapping.completed / semanticMapping.total) * 100)))
    : 0;
  const progressStyle = { "--semantic-progress": `${progressPercent}%` } as CSSProperties;
  const projectSummary = project
    ? semanticMapping?.active
      ? `${project.maps.length} maps | ${project.triggers.length.toLocaleString()} triggers | ${mappingLabel}`
      : isSemanticMappingPending(project)
      ? mappingPending
        ? `${project.maps.length} maps | ${project.triggers.length.toLocaleString()} triggers | mapping links...`
        : `${project.maps.length} maps | ${project.triggers.length.toLocaleString()} triggers | links on demand`
      : `${project.maps.length} maps | ${project.triggers.length.toLocaleString()} triggers | links on demand`
    : "Awaiting project";
  const workbenchSummary = activeWorkbench === "library"
    ? `${catalog?.summary.sourceCount ?? 0} library sources | ${catalog?.summary.entityCount ?? 0} entities`
    : projectSummary;
  const workbenchSummaryLabel = activeWorkbench === "library" ? "Library summary" : "Project summary";
  return (
    <footer className="status-bar" aria-label="Application status">
      <span role="status" aria-live="polite" aria-atomic="true" title={status}>{status}</span>
      <span className="status-bar-summary" role="group" aria-label={workbenchSummaryLabel}>
        <span title={workbenchSummary}>
          {workbenchSummary}
        </span>
        {mappingPending && (
          <span
            className={`semantic-mapping-progress compact${semanticMapping?.indeterminate ? "" : " determinate"}`}
            style={progressStyle}
            title={semanticMapping?.detail ?? "Mapping scenario links"}
            aria-label={semanticMapping?.detail ?? "Mapping scenario links"}
            role="progressbar"
            aria-valuemin={semanticMapping?.indeterminate ? undefined : 0}
            aria-valuemax={semanticMapping?.indeterminate ? undefined : semanticMapping?.total}
            aria-valuenow={semanticMapping?.indeterminate ? undefined : semanticMapping?.completed}
          />
        )}
      </span>
    </footer>
  );
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
}
