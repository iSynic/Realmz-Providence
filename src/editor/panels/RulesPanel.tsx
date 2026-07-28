import { useEffect, useState } from "react";
import { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../types";
import { TutorialTip } from "../components/TutorialTip";
import { SpellRulesEditor } from "./rules/SpellRulesEditor";
import { RaceRulesEditor } from "./rules/RaceRulesEditor";
import { CasteRulesEditor } from "./rules/CasteRulesEditor";
import { RemakeRuntimeEditor } from "./rules/RemakeRuntimeEditor";
import { RulesFamily } from "./rules/ruleTypes";
import { familyLabel, normalizeFamily, overrideCount } from "./rules/ruleUtils";
import { PanelHeader, WorkbenchTabs, type WorkbenchTabOption } from "../ui";

const RULES_HELP = "Rules covers Realmz spells, races, and castes. Shared Realmz definitions are reference/copy sources; scenario-local Data Spell, Data Race, and Data Caste overrides are the editable/exported surface.";
const RULES_FAMILY_HELP: Record<RulesFamily, string> = {
  spells: "Browse packed Realmz spell IDs and author scenario-local custom spells in Data Spell. Built-in spell catalogs remain reference/copy sources, while Custom slots 5101 through 5715 are scenario-owned.",
  races: "Browse shared races and customize scenario Data Race overrides for movement, aging, caste permissions, descriptors, portraits, and item usability. Race edits can affect Scenario restrictions and Economy item use.",
  castes: "Browse shared castes and customize scenario Data Caste overrides for progression, spellcasting, starting items, combat rules, and item usability. Caste edits can affect spell access, party creation, and item restrictions.",
  remake: "Select the recommended gameplay profile and author scenario scripts, semantic actions, or built-in extension bindings for Realmz Remake format v3. These features make the project Remake-only."
};

export function RulesPanel({
  project,
  catalog,
  activeEditor,
  selectedEntity,
  queueAtlasUrl,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog: LibraryCatalog | null;
  activeEditor: string;
  selectedEntity: SelectedEntity | null;
  queueAtlasUrl?: string | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const [family, setFamily] = useState<RulesFamily>(() => normalizeFamily(activeEditor));
  useEffect(() => setFamily(normalizeFamily(activeEditor)), [activeEditor]);
  const familyTabs: WorkbenchTabOption<RulesFamily>[] = (["spells", "races", "castes", "remake"] as RulesFamily[]).map((candidate) => ({
    value: candidate,
    label: (
      <TutorialTip title={familyLabel(candidate)} body={RULES_FAMILY_HELP[candidate]} side="right">
        <span>{familyLabel(candidate)}</span>
      </TutorialTip>
    ),
    meta: overrideCount(project, candidate)
  }));
  return (
    <section className="rules-workbench">
      <PanelHeader
        className="domain-header"
        headingLevel={1}
        title={(
          <TutorialTip title="Rules" body={RULES_HELP} side="right">
            <span>Rules</span>
          </TutorialTip>
        )}
        description="Browse Realmz spells, races, and castes, then customize the records this scenario is allowed to override."
        meta={project.scenario.name}
      />
      <WorkbenchTabs
        ariaLabel="Rules editor"
        className="rules-tabs"
        value={family}
        options={familyTabs}
        onChange={setFamily}
      />
      {family === "spells" && <SpellRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} queueAtlasUrl={queueAtlasUrl ?? null} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      {family === "races" && <RaceRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      {family === "castes" && <CasteRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      {family === "remake" && <RemakeRuntimeEditor project={project} onApplyCommand={onApplyCommand} />}
    </section>
  );
}
