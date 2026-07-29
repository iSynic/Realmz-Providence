import { ActiveWorkbench, EditorTab, LibraryCatalog, Project } from "../types";
import { TutorialTip } from "../components/TutorialTip";
import { useRovingNavigation } from "../ui";
import { domainCount, DOMAIN_ICONS, DOMAIN_ORDER, DOMAIN_REGISTRY } from "./registry";

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
  const visibleDomains = DOMAIN_ORDER.filter((domain) => (
    domain !== "scripting"
    || (activeWorkbench === "project" && project?.authoringTarget === "remake-enhanced")
  ));
  const options = visibleDomains.map((domain) => ({ value: domain, label: DOMAIN_REGISTRY[domain].shortLabel }));
  const { handleKeyDown, registerItem } = useRovingNavigation({
    options,
    value: activeDomain,
    onChange: onSelectDomain,
    orientation: "vertical"
  });

  return (
    <nav className="domain-rail" aria-label="Providence domains" onKeyDown={handleKeyDown}>
      {visibleDomains.map((domain) => {
        const descriptor = DOMAIN_REGISTRY[domain];
        const count = domainCount(domain, project, catalog, activeWorkbench, issueCount);
        return (
          <TutorialTip key={domain} title={descriptor.label} body={descriptor.description} side="right" focusable={false}>
            <button
              ref={registerItem(domain)}
              className={`rail-tool rail-group-${descriptor.railGroup} domain-${domain}${activeDomain === domain ? " active" : ""}`}
              title={`${descriptor.label}: ${descriptor.description}`}
              aria-current={activeDomain === domain ? "page" : undefined}
              tabIndex={activeDomain === domain ? 0 : -1}
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
