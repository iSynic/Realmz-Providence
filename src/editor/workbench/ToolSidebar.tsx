import { ActiveWorkbench, EditorTab, LibraryCatalog, Project } from "../types";
import { ResizablePane } from "../components/ResizablePane";
import { TutorialTip } from "../components/TutorialTip";
import { useRovingNavigation } from "../ui";
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
  const options = [
    { value: "domain", label: "All" },
    ...tools.map((tool) => ({ value: tool.id, label: tool.label }))
  ];
  const activeValue = options.some((option) => option.value === activeEditor) ? activeEditor : "domain";
  const { handleKeyDown, registerItem } = useRovingNavigation({
    options,
    value: activeValue,
    onChange: onSelectEditor,
    orientation: "vertical"
  });
  if (tools.length === 0) return null;
  if (activeDomain === "assets") return null;
  if (activeDomain === "combat") return null;
  if (activeDomain === "player-maps") return null;
  if (activeDomain === "economy" && activeWorkbench === "project") return null;
  if (activeDomain === "encounters" && activeWorkbench === "project") return null;
  if (activeDomain === "scripts" && activeWorkbench === "project") return null;
  if (activeDomain === "scripting" && activeWorkbench === "project") return null;
  if (activeDomain === "rules" && activeWorkbench === "project") return null;
  if (activeDomain === "text" && activeWorkbench === "project") return null;
  if (activeDomain === "scenario" && activeWorkbench === "project") return null;
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
      <section className="tool-sidebar-card" role="navigation" aria-label={`${domain.label} tools`} onKeyDown={handleKeyDown}>
        <header>
          <div>
            <strong>{domain.label}</strong>
            <span>{activeWorkbench === "library" ? "Library tools" : "Project tools"}</span>
          </div>
          <button
            ref={registerItem("domain")}
            className={activeValue === "domain" ? "active" : ""}
            aria-current={activeValue === "domain" ? "page" : undefined}
            tabIndex={activeValue === "domain" ? 0 : -1}
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
            const selected = activeValue === tool.id;
            return (
              <TutorialTip key={tool.id} title={tool.label} body={tool.description} side="right" focusable={false}>
                <button
                  ref={registerItem(tool.id)}
                  className={selected ? "selected" : ""}
                  aria-current={selected ? "page" : undefined}
                  tabIndex={selected ? 0 : -1}
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
