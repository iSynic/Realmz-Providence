import { Eye } from "lucide-react";
import type { SelectedEntity, TriggerRecord } from "../../types";
import { selectEntityFromId, triggerEntityId } from "../../utils";
import type { ScriptActionDefinition } from "./scriptActionCatalog";

export function ActionPointDirectTargetField({
  selectedSlot,
  rawCode,
  id,
  definition,
  idLabel,
  sameMapActionPointStep,
  sameMapTarget,
  sameMapJumpTitle,
  onChange,
  onPreviewEntity
}: {
  selectedSlot: number;
  rawCode: number;
  id: number;
  definition: ScriptActionDefinition;
  idLabel: string;
  sameMapActionPointStep: boolean;
  sameMapTarget: TriggerRecord | null;
  sameMapJumpTitle: string;
  onChange: (draft: { rawCode: number; id: number }) => void;
  onPreviewEntity: (entity: SelectedEntity) => void;
}) {
  return (
    <div className="realmz-step-form-grid realmz-current-step-authoring-subpane">
      <div className={`script-required-field realmz-step-id-field${sameMapActionPointStep ? " script-source-ap-id-field" : ""}`}>
        <span>{definition.target?.label ?? idLabel}</span>
        <div className="script-source-ap-field-row">
          <input
            type={sameMapActionPointStep ? "text" : "number"}
            inputMode={sameMapActionPointStep ? "numeric" : undefined}
            pattern={sameMapActionPointStep ? "-?[0-9]*" : undefined}
            value={id}
            onChange={(event) => {
              const nextValue = Number.parseInt(event.currentTarget.value, 10);
              onChange({ rawCode, id: Number.isFinite(nextValue) ? nextValue : 0 });
            }}
            aria-label={`Slot ${selectedSlot} ${idLabel}`}
          />
          {sameMapActionPointStep && (
            <button
              type="button"
              className="btn btn-secondary btn-xs icon-only script-source-ap-jump"
              title={sameMapJumpTitle}
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
        <small>{definition.target?.help || definition.description}</small>
      </div>
    </div>
  );
}
