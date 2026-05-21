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

function compactCount(value: number) {
  if (value >= 1000) return `${Math.floor(value / 100) / 10}k`;
  return String(value);
}
