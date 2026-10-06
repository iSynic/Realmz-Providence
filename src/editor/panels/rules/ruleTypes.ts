import { LibraryCatalog, Project, ProjectCommand, ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride, SelectedEntity } from "../../types";

export type RulesFamily = "spells" | "races" | "castes" | "remake";

export type SpellRuleEntry = {
  packedId: number;
  customId: number;
  spellcasterClass: number;
  levelIndex: number;
  slotIndex: number;
  label: string;
  record: ScenarioSpellOverride;
  hasScenarioVersion: boolean;
};

export type RaceRuleEntry = {
  id: number;
  record: ScenarioRaceOverride;
  hasScenarioVersion: boolean;
};

export type CasteRuleEntry = {
  id: number;
  record: ScenarioCasteOverride;
  hasScenarioVersion: boolean;
};

export type RulesEditorProps = {
  project: Project;
  catalog: LibraryCatalog | null;
  selectedEntity: SelectedEntity | null;
  onSelectEntity: (entity: SelectedEntity) => void;
  onApplyCommand: (command: ProjectCommand) => void;
};

export type SpellRulesEditorProps = RulesEditorProps & {
  queueAtlasUrl: string | null;
};
