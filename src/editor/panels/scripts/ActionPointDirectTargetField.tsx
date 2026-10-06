import { Eye, SlidersHorizontal } from "lucide-react";
import type { LibraryCatalog, Project, SelectedEntity, TriggerRecord } from "../../types";
import { selectEntityFromId, triggerEntityId } from "../../utils";
import { directActionSettingsFor, directActionSummary } from "./directActionSettings";
import type { ScriptActionDefinition } from "./scriptActionCatalog";

export function ActionPointDirectTargetField({
  project,
  catalog,
  selectedSlot,
  rawCode,
  id,
  definition,
  idLabel,
  sameMapActionPointStep,
  sameMapTarget,
  sameMapJumpTitle,
  onEdit,
  onPreviewEntity
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  selectedSlot: number;
  rawCode: number;
  id: number;
  definition: ScriptActionDefinition;
  idLabel: string;
  sameMapActionPointStep: boolean;
  sameMapTarget: TriggerRecord | null;
  sameMapJumpTitle: string;
  onEdit: () => void;
  onPreviewEntity: (entity: SelectedEntity) => void;
}) {
  const settings = directActionSettingsFor(rawCode);
  const summary = directActionSummary(project, catalog, rawCode, id);
  return (
    <div className="realmz-step-form-grid realmz-current-step-authoring-subpane">
      <div className={`script-required-field realmz-step-id-field${sameMapActionPointStep ? " script-source-ap-id-field" : ""}`}>
        <span>{settings.label || definition.target?.label || idLabel}</span>
        <div className="script-source-ap-field-row">
          <button
            type="button"
            className="direct-action-summary-button"
            aria-label={`Edit slot ${selectedSlot + 1} ${settings.label || idLabel}`}
            onClick={onEdit}
          >
            <span>{summary}</span>
            <SlidersHorizontal size={13} />
          </button>
          {sameMapActionPointStep && (
            <button
              type="button"
              className="btn btn-secondary btn-xs icon-only script-source-ap-jump"
              title={sameMapJumpTitle}
              aria-label={sameMapJumpTitle}
              disabled={!sameMapTarget}
              onClick={() => {
                if (!sameMapTarget) return;
                onPreviewEntity(selectEntityFromId(triggerEntityId(
                  sameMapTarget.levelType,
                  sameMapTarget.levelIndex,
                  sameMapTarget.recordIndex,
                  sameMapTarget.source
                )));
              }}
            >
              <Eye size={12} />
            </button>
          )}
        </div>
        <small>{settings.help || definition.target?.help || definition.description}</small>
      </div>
    </div>
  );
}
