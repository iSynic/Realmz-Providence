import { TABS } from "../constants";
import { ActiveWorkbench, EditorTab, LibraryCatalog, Project } from "../types";
import { TutorialTip } from "./TutorialTip";

const RAIL_HINTS: Record<EditorTab, { short: string; title: string; detail: string }> = {
  maps: { short: "Map", title: "Maps", detail: "Land levels, dungeon levels, tile painting, Action Points, Random Rectangles" },
  scripts: { short: "AP", title: "Action Points", detail: "Action Points, reusable actions, global events, and quest links" },
  scenario: { short: "Scn", title: "Scenario", detail: "Startup information, restrictions, contact data, global events, registration" },
  encounters: { short: "Enc", title: "Encounters", detail: "Simple, complex, rogue, and timed encounters" },
  combat: { short: "Cmb", title: "Combat", detail: "Battles, monsters, Monster Scrapbook, Monster Mash" },
  economy: { short: "Eco", title: "Economy", detail: "Treasure, items, shops, Bag of Holding, Vault of Arcana" },
  rules: { short: "Rule", title: "Rules", detail: "Spells, races, castes, and selector data" },
  assets: { short: "Ast", title: "Assets", detail: "Pictures, sounds, resource forks, special land tiles" },
  text: { short: "Txt", title: "Text", detail: "Scenario strings, TEXT/styl resources, import/export spell checking" },
  records: { short: "Rec", title: "Records", detail: "Realmz Data files, decoded records, byte ranges, provenance" },
  linter: { short: "Lint", title: "Linter", detail: "Compatibility diagnostics and export blockers" },
  export: { short: "Out", title: "Export", detail: "Realmz Revisited export readiness and pass-through report" }
};

export function EditorToolRail({
  activeTab,
  project,
  catalog,
  activeWorkbench,
  issueCount,
  onSelectTab
}: {
  activeTab: EditorTab;
  project: Project | null;
  catalog: LibraryCatalog | null;
  activeWorkbench: ActiveWorkbench;
  issueCount: number;
  onSelectTab: (tab: EditorTab) => void;
}) {
  return (
    <nav className="editor-tool-rail" aria-label="Editor tools">
      {TABS.map((tab) => {
        const meta = RAIL_HINTS[tab.id];
        const count = countFor(tab.id, project, catalog, activeWorkbench, issueCount);
        return (
          <TutorialTip key={tab.id} title={meta.title} body={meta.detail} side="right">
            <button
              className={`rail-tool${activeTab === tab.id ? " active" : ""}`}
              title={`${meta.title}: ${meta.detail}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span className="rail-icon">{tab.icon}</span>
              <span className="rail-label">{meta.short}</span>
              {count > 0 && <b>{compactCount(count)}</b>}
            </button>
          </TutorialTip>
        );
      })}
    </nav>
  );
}

function countFor(tab: EditorTab, project: Project | null, catalog: LibraryCatalog | null, activeWorkbench: ActiveWorkbench, issueCount: number) {
  if (tab === "linter") return issueCount;
  const libraryEntities = activeWorkbench === "library" ? catalog?.entities ?? [] : [];
  if (!project && libraryEntities.length === 0) return 0;
  if (tab === "maps") return project?.maps.length ?? 0;
  if (tab === "scripts") return project?.semanticSchema.entities.filter((entity) => entity.type === "trigger" || entity.type === "macro" || entity.type === "ed3-action-record").length ?? 0;
  if (tab === "scenario") return (project?.semanticSchema.entities.filter((entity) => ["scenario", "contact-info", "global-macro", "registration-security"].includes(entity.type)).length ?? 0);
  if (tab === "encounters") {
    return project?.semanticSchema.entities.filter((entity) =>
      ["simple encounter", "complex encounter", "thief-encounter", "timed-encounter"].includes(entity.type)
    ).length ?? 0;
  }
  if (tab === "combat") return (project?.semanticSchema.entities.filter((entity) => ["battle", "monster"].includes(entity.type)).length ?? 0) + libraryEntities.filter((entity) => ["monster-scrapbook-entry", "monster-mash-icon"].includes(entity.type)).length;
  if (tab === "economy") return (project?.semanticSchema.entities.filter((entity) => ["treasure", "shop", "item-reference"].includes(entity.type)).length ?? 0) + libraryEntities.filter((entity) => ["item", "bag-item", "vault-icon"].includes(entity.type)).length;
  if (tab === "rules") return (project?.semanticSchema.entities.filter((entity) => ["spell-reference"].includes(entity.type)).length ?? 0) + libraryEntities.filter((entity) => ["spell", "race", "caste"].includes(entity.type)).length;
  if (tab === "assets") return (project?.semanticSchema.entities.filter((entity) => entity.type === "resource" || entity.type === "tile atlas").length ?? 0) + libraryEntities.filter((entity) => ["resource", "resource type", "special-land-tile"].includes(entity.type)).length;
  if (tab === "text") return project?.semanticSchema.entities.filter((entity) => ["message", "resource"].includes(entity.type)).length ?? 0;
  if (tab === "records") return (project?.semanticSchema.records.length ?? 0) + (activeWorkbench === "library" ? catalog?.records.length ?? 0 : 0);
  if (tab === "export") return project ? project.validation.exportableFiles.length + project.validation.passThroughFiles.length : 0;
  return 0;
}

function compactCount(value: number) {
  if (value >= 1000) return `${Math.floor(value / 100) / 10}k`;
  return String(value);
}
