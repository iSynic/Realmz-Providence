import { useEffect, useState } from "react";
import { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../types";
import { TutorialTip } from "../components/TutorialTip";
import { SpellRulesEditor } from "./rules/SpellRulesEditor";
import { RaceRulesEditor } from "./rules/RaceRulesEditor";
import { CasteRulesEditor } from "./rules/CasteRulesEditor";
import { RulesFamily } from "./rules/ruleTypes";
import { familyLabel, normalizeFamily, overrideCount } from "./rules/ruleUtils";
import { PanelHeader, WorkbenchTabs, type WorkbenchTabOption } from "../ui";

const DEFINITIONS_HELP = "This workspace covers Realmz spells, races, and castes. Stock definitions are reference and copy sources; scenario-local Data Spell, Data Race, and Data Caste records are the editable and exported surface.";
const RULES_FAMILY_HELP: Record<RulesFamily, string> = {
  spells: "Browse packed Realmz spell IDs and author scenario-local custom spells in Data Spell. Built-in spell catalogs remain reference/copy sources, while Custom slots 5101 through 5715 are scenario-owned.",
  races: "Browse shared races and customize scenario Data Race overrides for movement, aging, caste permissions, descriptors, portraits, and item usability. Race edits can affect Scenario restrictions and Economy item use.",
  castes: "Browse shared castes and customize scenario Data Caste overrides for progression, spellcasting, starting items, combat rules, and item usability. Caste edits can affect spell access, party creation, and item restrictions."
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
  const familyTabs: WorkbenchTabOption<RulesFamily>[] = (["spells", "races", "castes"] as RulesFamily[]).map((candidate) => ({
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
          <TutorialTip title="Spells, Races & Castes" body={DEFINITIONS_HELP} side="right">
            <span>Spells, Races & Castes</span>
          </TutorialTip>
        )}
        description="Browse stock Realmz definitions, then customize the spells, races, and castes owned by this scenario."
        meta={project.scenario.name}
      />
      <WorkbenchTabs
        ariaLabel="Spell, race, and caste editor"
        className="rules-tabs"
        value={family}
        options={familyTabs}
        onChange={setFamily}
      />
      {family === "spells" && <SpellRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} queueAtlasUrl={queueAtlasUrl ?? null} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      {family === "races" && <RaceRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
      {family === "castes" && <CasteRulesEditor project={project} catalog={catalog} selectedEntity={selectedEntity} onSelectEntity={onSelectEntity} onApplyCommand={onApplyCommand} />}
    </section>
  );
}
