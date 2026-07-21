import { TABS } from "../constants";
import { ActiveWorkbench, EditorTab, LibraryCatalog, Project } from "../types";
import { domainCount } from "../workbench/registry";
import { TutorialTip } from "./TutorialTip";

const RAIL_HINTS: Record<EditorTab, { short: string; title: string; detail: string }> = {
  maps: { short: "Land & Dungeon", title: "Land/Dungeon Maps", detail: "Land levels, dungeon levels, tile painting, Action Points, Random Rectangles" },
  "player-maps": { short: "Player Maps", title: "Player Maps", detail: "Maps/Notes helper maps, names, pictures, markers, and notes" },
  scripts: { short: "Action Points", title: "Action Points", detail: "Action Points, reusable actions, global events, and quest links" },
  scenario: { short: "Scenario", title: "Scenario", detail: "Startup information, restrictions, contact data, global events, registration" },
  encounters: { short: "Encounters", title: "Encounters", detail: "Simple, complex, rogue, and timed encounters" },
  combat: { short: "Combat", title: "Combat", detail: "Battles, monsters, Monster Scrapbook, Monster Mash" },
  economy: { short: "Economy", title: "Economy", detail: "Treasure, items, shops, Bag of Holding, Vault of Arcana" },
  rules: { short: "Rules", title: "Rules", detail: "Spells, races, castes, and selector data" },
  assets: { short: "Assets", title: "Assets", detail: "Pictures, sounds, resource forks, special land tiles" },
  text: { short: "Strings", title: "Strings", detail: "Scenario strings, TEXT/styl resources, import/export spell checking" },
  records: { short: "Records", title: "Records", detail: "Realmz Data files, decoded records, byte ranges, provenance" },
  linter: { short: "Linter", title: "Linter", detail: "Compatibility diagnostics and export blockers" },
  export: { short: "Export", title: "Export", detail: "Native Realmz compiler readiness and imported compatibility report" }
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
  return domainCount(tab, project, catalog, activeWorkbench, issueCount);
}

function compactCount(value: number) {
  if (value >= 1000) return `${Math.floor(value / 100) / 10}k`;
  return String(value);
}
