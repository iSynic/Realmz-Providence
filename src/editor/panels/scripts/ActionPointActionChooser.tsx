import { X } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import { SearchField } from "../../ui";
import {
  SCRIPT_ACTION_CATEGORY_FILTERS,
  actionDefinitionPathLabel,
  canonicalActionChooserOpcode,
  scriptActionDefinitionFor,
  type ScriptActionCategoryFilter,
  type ScriptActionDefinition
} from "./scriptActionCatalog";
import {
  combatMacroActionNote,
  combatMacroActionOpcodes,
  combatMacroContextTitle,
  type CombatMacroContext
} from "./actionPointPresentation";

const ACTION_CHOOSER_HELP =
  "Choose Action changes only the selected step draft. Apply Step is still required before the script record is updated.";

export function actionChooserDefinitionMatchesOpcode(definition: ScriptActionDefinition, rawCode: number) {
  return canonicalActionChooserOpcode(definition.opcode) === canonicalActionChooserOpcode(rawCode);
}

export function ActionPointActionChooser({
  selectedRawCode,
  categoryFilter,
  opcodeQuery,
  filteredDefinitions,
  combatMacroContext,
  onSetCategoryFilter,
  onSetOpcodeQuery,
  onSelectDefinition,
  onClose
}: {
  selectedRawCode: number;
  categoryFilter: ScriptActionCategoryFilter;
  opcodeQuery: string;
  filteredDefinitions: ScriptActionDefinition[];
  combatMacroContext?: CombatMacroContext | null;
  onSetCategoryFilter: (category: ScriptActionCategoryFilter) => void;
  onSetOpcodeQuery: (query: string) => void;
  onSelectDefinition: (definition: ScriptActionDefinition) => void;
  onClose: () => void;
}) {
  const combatMacroActionDefinitions = combatMacroActionOpcodes(combatMacroContext ?? null)
    .map((opcode) => scriptActionDefinitionFor(opcode));
  const matchesDraft = (definition: ScriptActionDefinition) => actionChooserDefinitionMatchesOpcode(definition, selectedRawCode);

  return (
    <div className="script-action-chooser action-chooser-dropdown" role="dialog" aria-label="Choose action for selected step">
      <header>
        <div>
          <TutorialTip title="Choose Action" body={ACTION_CHOOSER_HELP} side="below">
            <strong>{selectedRawCode === 0 ? "Choose Action" : "Change Action"}</strong>
          </TutorialTip>
        </div>
        <button type="button" className="btn btn-secondary btn-xs icon-only" title="Close action chooser" aria-label="Close action chooser" onClick={onClose}>
          <X size={12} />
        </button>
      </header>
      <div className="realmz-opcode-catalog">
        <div className="realmz-step-category-bar">
          {SCRIPT_ACTION_CATEGORY_FILTERS.map((category) => (
            <button key={category} type="button" className={categoryFilter === category ? "active" : ""} onClick={() => onSetCategoryFilter(category)}>
              {category}
            </button>
          ))}
        </div>
        <SearchField
          className="realmz-opcode-search"
          value={opcodeQuery}
          onChange={onSetOpcodeQuery}
          placeholder="Search actions, targets, and settings..."
          ariaLabel="Search script actions"
          resultCount={filteredDefinitions.length}
          resultNoun="action"
        />
        {combatMacroContext && combatMacroActionDefinitions.length > 0 && (
          <div className="combat-macro-action-strip">
            <header>
              <strong>Combat Macro Actions</strong>
              <small>{combatMacroContextTitle(combatMacroContext)}</small>
            </header>
            <div>
              {combatMacroActionDefinitions.map((definition) => (
                <button
                  key={definition.opcode}
                  type="button"
                  className={matchesDraft(definition) ? "selected" : ""}
                  title={combatMacroActionNote(definition.opcode, combatMacroContext) ?? definition.description}
                  onClick={() => onSelectDefinition(definition)}
                >
                  <strong>{definition.shortLabel}</strong>
                  <span>{definition.opcode}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="realmz-step-picker-grid action-chooser-grid">
          {filteredDefinitions.map((definition) => (
            <button
              key={definition.opcode}
              type="button"
              title={`${actionDefinitionPathLabel(definition)}. ${definition.summary}`}
              className={matchesDraft(definition) ? "selected" : ""}
              onClick={() => onSelectDefinition(definition)}
            >
              <strong>{categoryFilter === "All" ? actionDefinitionPathLabel(definition) : definition.label}</strong>
              <span>{definition.summary}</span>
              <small>{matchesDraft(definition) ? "Current action" : definition.categoryLabel}</small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
