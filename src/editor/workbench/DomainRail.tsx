import { useRef, type KeyboardEvent } from "react";
import { ActiveWorkbench, EditorTab, LibraryCatalog, Project } from "../types";
import { TutorialTip } from "../components/TutorialTip";
import { workbenchTabKeyboardTarget } from "../ui";
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
  const buttons = useRef(new Map<EditorTab, HTMLButtonElement>());
  const options = DOMAIN_ORDER.map((domain) => ({ value: domain, label: DOMAIN_REGISTRY[domain].shortLabel }));

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const nextDomain = workbenchTabKeyboardTarget(options, activeDomain, event.key, "vertical");
    if (nextDomain == null) return;
    event.preventDefault();
    onSelectDomain(nextDomain);
    buttons.current.get(nextDomain)?.focus();
  };

  return (
    <nav className="domain-rail" aria-label="Providence domains" onKeyDown={handleKeyDown}>
      {DOMAIN_ORDER.map((domain) => {
        const descriptor = DOMAIN_REGISTRY[domain];
        const count = domainCount(domain, project, catalog, activeWorkbench, issueCount);
        return (
          <TutorialTip key={domain} title={descriptor.label} body={descriptor.description} side="right">
            <button
              ref={(element) => {
                if (element) buttons.current.set(domain, element);
                else buttons.current.delete(domain);
              }}
              className={`rail-tool domain-${domain}${activeDomain === domain ? " active" : ""}`}
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
