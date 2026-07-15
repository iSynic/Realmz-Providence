import { useEffect, useState } from "react";
import { TutorialTip } from "../components/TutorialTip";
import type { PreviewRuntimeContext } from "../previewUrls";
import type { LibraryCatalog, IconEntry, Project, ProjectCommand, SelectedEntity } from "../types";
import { selectEntityFromId } from "../utils";
import {
  useCombatLookups,
  type CombatWorkbenchTab
} from "./combat/combatLookups";
import { useCombatRenderTiming } from "./combat/performance";
import { BattleWorkbench } from "./combat/BattleWorkbench";
import { BattleBoard } from "./combat/BattleBoard";
import { MonsterIconSetWorkbench } from "./combat/MonsterIconSetWorkbench";
import { MonsterWorkbench } from "./combat/MonsterWorkbench";
import { copyScrapbookMonsterToScenario, scrapbookEntryForMonsterId } from "./combat/monsterLibraryWorkflow";
import { WorkbenchTabs, type WorkbenchTabOption } from "../ui";

export {
  monsterIconPickerOptions,
  monsterIconSetTabCount,
  monsterIconSourceStatusLabel,
  monsterIconTargetPairs,
  nextScenarioMonsterIconTargetBaseId,
  resolveMonsterIconTargetPair
} from "./combat/iconSetModel";
export type { MonsterIconPickerOption, MonsterIconSourceStatus } from "./combat/iconSetModel";
export type { CombatWorkbenchTab } from "./combat/combatLookups";
export { monsterBrushPaletteWindow } from "./combat/battleMonsterPaletteModel";
export {
  materializeMonsterLibraryIconOverrides,
  monsterIconOverrideForLibraryCopy
} from "./combat/monsterLibraryWorkflow";
export {
  monsterRequiredWeaponDisplayCode,
  monsterRequiredWeaponStoredCode
} from "./combat/MonsterWorkbench";

type CombatPanelProps = {
  activeEditor?: string;
  project: Project | null;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  iconEntries: Record<number, IconEntry>;
  previewContext?: PreviewRuntimeContext;
  onSelectEntity: (entity: SelectedEntity) => void;
  onSelectEditor: (editor: string) => void;
  onOpenTool?: (tab: "assets", editor: string) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  onUpdateLibraryCatalog?: (catalog: LibraryCatalog, status: string) => void;
};

const TAB_LABELS: Record<CombatWorkbenchTab, string> = {
  battles: "Battles",
  monsters: "Monsters",
  iconSet: "Icon Set"
};

const TAB_HELP: Record<CombatWorkbenchTab, string> = {
  battles: "Author Data BD battle records: a 13 x 13 signed monster grid, distance, before/after strings, and battle macro target.",
  monsters: "Manage protected built-in templates, editable Providence library monsters, and scenario Data MD monster records.",
  iconSet: "Build scenario-local Monster Mash icon overrides without changing monster records."
};

export function CombatPanel({
  activeEditor = "domain",
  project,
  catalog,
  selectedEntity,
  iconEntries,
  previewContext = {},
  onSelectEntity,
  onSelectEditor,
  onApplyCommand,
  onUpdateLibraryCatalog
}: CombatPanelProps) {
  useCombatRenderTiming("CombatPanel");
  const [tab, setTab] = useState<CombatWorkbenchTab>(() => tabFromEditor(activeEditor));
  useEffect(() => setTab(tabFromEditor(activeEditor)), [activeEditor]);
  const selectTab = (next: CombatWorkbenchTab) => {
    setTab(next);
    onSelectEditor(next);
  };
  const lookups = useCombatLookups(project, catalog);
  const combatTabs: WorkbenchTabOption<CombatWorkbenchTab>[] = (Object.keys(TAB_LABELS) as CombatWorkbenchTab[]).map((candidate) => ({
    value: candidate,
    label: TAB_LABELS[candidate],
    meta: lookups.tabCounts[candidate].toLocaleString(),
    title: TAB_HELP[candidate]
  }));

  if (!project) {
    return (
      <section className="combat-workbench">
        <header className="combat-hero">
          <div>
            <h1>Combat</h1>
            <p>Open or create a scenario before editing battles and monsters.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="combat-workbench">
      <header className="combat-hero">
        <div>
          <h1>
            <TutorialTip
              title="Combat Workbench"
              body="Use Combat for scenario battles, scenario monsters, protected built-in Monster Scrapbook templates, and editable Providence monster-library variants."
              side="right"
            >
              <span>Combat</span>
            </TutorialTip>
          </h1>
          <p>Author battles, scenario monsters, and reusable Providence monster-library templates.</p>
        </div>
        <small>{project.scenario.name}</small>
      </header>
      <WorkbenchTabs
        ariaLabel="Combat workbench sections"
        className="combat-tabs"
        value={tab}
        options={combatTabs}
        onChange={selectTab}
      />

      {tab === "battles" && (
        <BattleWorkbench
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          onSelectEntity={onSelectEntity}
          onApplyCommand={onApplyCommand}
          renderBoard={({ battle, monsterSetPreview, onMonsterSetPreviewChange, onUpdateGrid }) => (
            <BattleBoard
              project={project}
              iconEntries={iconEntries}
              lookups={lookups}
              previewContext={previewContext}
              monsterSetPreview={monsterSetPreview}
              onMonsterSetPreviewChange={onMonsterSetPreviewChange}
              battle={battle}
              canCopyMissingMonster={(monsterId) => Boolean(scrapbookEntryForMonsterId(catalog, monsterId))}
              onCopyMissingMonster={(monsterId) => {
                const entry = scrapbookEntryForMonsterId(catalog, monsterId);
                if (!entry) return;
                copyScrapbookMonsterToScenario(entry, monsterId, onApplyCommand);
                onSelectEntity(selectEntityFromId(`monster:${monsterId}`));
              }}
              onApplyCommand={onApplyCommand}
              onUpdateGrid={onUpdateGrid}
            />
          )}
        />
      )}
      {tab === "monsters" && (
        <MonsterWorkbench
          project={project}
          catalog={catalog}
          selectedEntity={selectedEntity}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onSelectEntity={onSelectEntity}
          onSelectIconSetTab={() => selectTab("iconSet")}
          onApplyCommand={onApplyCommand}
          onUpdateLibraryCatalog={onUpdateLibraryCatalog}
        />
      )}
      {tab === "iconSet" && (
        <MonsterIconSetWorkbench
          project={project}
          catalog={catalog}
          iconEntries={iconEntries}
          lookups={lookups}
          previewContext={previewContext}
          onApplyCommand={onApplyCommand}
          onUpdateLibraryCatalog={onUpdateLibraryCatalog}
        />
      )}
    </section>
  );
}



function tabFromEditor(editor: string): CombatWorkbenchTab {
  if (editor === "monsters") return "monsters";
  if (editor === "scrapbook") return "monsters";
  if (editor === "iconSet" || editor === "icon-set") return "iconSet";
  return "battles";
}
