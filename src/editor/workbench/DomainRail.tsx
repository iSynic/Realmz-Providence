import { useMemo } from "react";
import { ActiveWorkbench, EditorTab, LibraryCatalog, Project } from "../types";
import { TutorialTip } from "../components/TutorialTip";
import { DOMAIN_ICONS, DOMAIN_ORDER, DOMAIN_REGISTRY } from "./registry";

export function DomainRail({
  activeDomain,
  project,
  catalog,
  activeWorkbench,
  issueCount,
  onSelectDomain
}: {
  activeDomain: EditorTab;
  project: Project | null;
  catalog: LibraryCatalog | null;
  activeWorkbench: ActiveWorkbench;
  issueCount: number;
  onSelectDomain: (domain: EditorTab) => void;
}) {
  const entityCounts = useMemo(() => {
    const projectCounts = new Map<string, number>();
    const catalogCounts = new Map<string, number>();
    for (const entity of project?.semanticSchema.entities ?? []) {
      projectCounts.set(entity.type, (projectCounts.get(entity.type) ?? 0) + 1);
    }
    for (const entity of catalog?.entities ?? []) {
      catalogCounts.set(entity.type, (catalogCounts.get(entity.type) ?? 0) + 1);
    }
    return { projectCounts, catalogCounts };
  }, [project?.semanticSchema.entities, catalog?.entities]);
  return (
    <nav className="domain-rail" aria-label="Providence domains">
      {DOMAIN_ORDER.map((domain) => {
        const descriptor = DOMAIN_REGISTRY[domain];
        const count = fastDomainCount(domain, project, catalog, activeWorkbench, issueCount, entityCounts.projectCounts, entityCounts.catalogCounts);
        return (
          <TutorialTip key={domain} title={descriptor.label} body={descriptor.description} side="right">
            <button
              className={`rail-tool domain-${domain}${activeDomain === domain ? " active" : ""}`}
              title={`${descriptor.label}: ${descriptor.description}`}
              onClick={() => onSelectDomain(domain)}
              type="button"
            >
              <span className="rail-icon">{DOMAIN_ICONS[domain]}</span>
              <span className="rail-label">{descriptor.shortLabel}</span>
              {count > 0 && <b>{compactCount(count)}</b>}
            </button>
          </TutorialTip>
        );
      })}
    </nav>
  );
}

function compactCount(value: number) {
  if (value >= 1000) return `${Math.floor(value / 100) / 10}k`;
  return String(value);
}

function fastDomainCount(
  domain: EditorTab,
  project: Project | null,
  catalog: LibraryCatalog | null,
  activeWorkbench: ActiveWorkbench,
  issueCount: number,
  projectCounts: Map<string, number>,
  catalogCounts: Map<string, number>
) {
  if (domain === "linter") return issueCount;
  if (domain === "maps") return project?.maps.length ?? 0;
  if (domain === "records") return (project?.semanticSchema.records.length ?? 0) + (activeWorkbench === "library" ? catalog?.records.length ?? 0 : 0);
  if (domain === "export") return project ? project.validation.exportableFiles.length + project.validation.passThroughFiles.length : 0;
  const descriptor = DOMAIN_REGISTRY[domain];
  return descriptor.tools.reduce((total, tool) => {
    const types = tool.entityTypes ?? [];
    if (types.length === 0) return total;
    let count = 0;
    if (tool.workbench !== "library" && activeWorkbench !== "library") {
      count += types.reduce((sum, type) => sum + (projectCounts.get(type) ?? 0), 0);
    }
    if (tool.workbench !== "project") {
      count += types.reduce((sum, type) => sum + (catalogCounts.get(type) ?? 0), 0);
    }
    return total + count;
  }, 0);
}
