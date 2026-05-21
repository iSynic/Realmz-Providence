import { ActiveWorkbench, EditorTab, LibraryCatalog, Project } from "../types";
import { TutorialTip } from "../components/TutorialTip";
import { DOMAIN_ICONS, DOMAIN_ORDER, DOMAIN_REGISTRY, domainCount } from "./registry";

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
  return (
    <nav className="domain-rail" aria-label="Providence domains">
      {DOMAIN_ORDER.map((domain) => {
        const descriptor = DOMAIN_REGISTRY[domain];
        const count = domainCount(domain, project, catalog, activeWorkbench, issueCount);
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
