import { ActiveWorkbench, EditorTab, LibraryCatalog, Project } from "../types";
import { ResizablePane } from "../components/ResizablePane";
import { TutorialTip } from "../components/TutorialTip";
import { DOMAIN_REGISTRY, toolCount } from "./registry";

export function ToolSidebar({
  activeDomain,
  activeEditor,
  activeWorkbench,
  project,
  catalog,
  onSelectEditor
}: {
  activeDomain: EditorTab;
  activeEditor: string;
  activeWorkbench: ActiveWorkbench;
  project: Project | null;
  catalog: LibraryCatalog | null;
  onSelectEditor: (editor: string) => void;
}) {
  const domain = DOMAIN_REGISTRY[activeDomain];
  const tools = domain.tools.filter((tool) => tool.workbench === "both" || tool.workbench === activeWorkbench);
  if (tools.length === 0) return null;
  if (activeDomain === "assets") return null;
  if (activeDomain === "combat") return null;
  if (activeDomain === "encounters" && activeWorkbench === "project") return null;
  if (activeDomain === "scripts" && activeWorkbench === "project") return null;
  if (activeDomain === "rules" && activeWorkbench === "project") return null;
  if (activeDomain === "text" && activeWorkbench === "project") return null;
  if (activeDomain === "scenario" && activeWorkbench === "project") {
    return <ScenarioToolSidebar project={project} />;
  }
  return (
    <ResizablePane
      className="tool-sidebar"
      ariaLabel={`${domain.label} tools`}
      storageKey="providence.toolSidebarWidth.v3"
      defaultWidth={280}
      minWidth={250}
      maxWidth={480}
      edge="right"
    >
      <section className="tool-sidebar-card">
        <header>
          <div>
            <strong>{domain.label}</strong>
            <span>{activeWorkbench === "library" ? "Library tools" : "Project tools"}</span>
          </div>
          <button
            className={activeEditor === "domain" ? "active" : ""}
            type="button"
            onClick={() => onSelectEditor("domain")}
            title="Show the domain overview"
          >
            All
          </button>
        </header>
        <p>{domain.help}</p>
        <div className="tool-sidebar-list">
          {tools.map((tool) => {
            const count = toolCount(tool, project, catalog, activeWorkbench);
            const selected = activeEditor === tool.id;
            return (
              <TutorialTip key={tool.id} title={tool.label} body={tool.description} side="right">
                <button
                  className={selected ? "selected" : ""}
                  type="button"
                  onClick={() => onSelectEditor(tool.id)}
                >
                  <span className="tool-sidebar-glyph">{tool.iconLabel}</span>
                  <span>
                    <strong>{tool.label}</strong>
                    <small>{tool.description}</small>
                  </span>
                  {count > 0 && <b>{compactCount(count)}</b>}
                </button>
              </TutorialTip>
            );
          })}
        </div>
      </section>
    </ResizablePane>
  );
}

function ScenarioToolSidebar({ project }: { project: Project | null }) {
  const links = [
    { id: "scenario-startup", label: "Startup Shell", detail: "Marker file, recommended level, starting land and coordinates.", badge: project?.scenario.shell ? "ok" : "new" },
    { id: "scenario-contact", label: "Contact Info", detail: "Title, version, author, web, email, and description.", badge: project?.scenario.contactInfo ? "ok" : "new" },
    { id: "scenario-restrictions", label: "Restrictions", detail: "Race, caste, party-size, and level admission rules.", badge: project?.scenario.restrictions ? "on" : "off" },
    { id: "scenario-readiness", label: "Load Readiness", detail: "Realmz shell checks and export confidence.", badge: String(project?.validation.errors.length ?? 0) }
  ];
  return (
    <ResizablePane
      className="tool-sidebar"
      ariaLabel="Scenario table of contents"
      storageKey="providence.toolSidebarWidth.v3"
      defaultWidth={280}
      minWidth={250}
      maxWidth={480}
      edge="right"
    >
      <section className="tool-sidebar-card scenario-toc-card">
        <header>
          <div>
            <strong>Scenario</strong>
            <span>Table of contents</span>
          </div>
        </header>
        <p>Jump to the scenario-wide records you can edit or verify.</p>
        <div className="tool-sidebar-list scenario-toc-list">
          {links.map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => document.getElementById(link.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <span className="tool-sidebar-glyph">{link.label.slice(0, 2).toUpperCase()}</span>
              <span>
                <strong>{link.label}</strong>
                <small>{link.detail}</small>
              </span>
              <b>{link.badge}</b>
            </button>
          ))}
        </div>
      </section>
    </ResizablePane>
  );
}

function compactCount(value: number) {
  if (value >= 1000) return `${Math.floor(value / 100) / 10}k`;
  return String(value);
}
