import { Eye, Plus, X } from "lucide-react";
import {
  resolveSignedMessageTarget,
  signedTargetBehaviorLabel,
  targetOptionForOpcodeValue
} from "../../components/RealmzTargetPicker";
import { actionOptionFor } from "../../realmzActions";
import { realmzScriptStepDescriptorFor } from "../../realmzScriptDescriptors";
import type {
  EncounterActionRow,
  LibraryCatalog,
  Project,
  RealmzTargetRecordKind
} from "../../types";
import {
  resultActionBaseCode,
  resultActionOptionsFor,
  signedResultActionCode
} from "./encounterFlow";

export function EncounterResultActionCell({
  project,
  catalog,
  slot,
  row,
  onUpdate,
  onFocusCode,
  onCreateTarget,
  onPreviewTarget,
  targetExists
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  slot: number;
  row: EncounterActionRow;
  onUpdate: (changes: Partial<EncounterActionRow>) => void;
  onFocusCode: (code: number) => void;
  onCreateTarget: (recordType: RealmzTargetRecordKind, targetId: number) => void;
  onPreviewTarget: (opcode: number, value: number) => void;
  targetExists: (recordType: RealmzTargetRecordKind, id: number) => boolean;
}) {
  const baseCode = resultActionBaseCode(row.rawCode);
  const isNegativeAction = row.rawCode < 0;
  const rowOption = actionOptionFor(baseCode);
  const targetType = realmzScriptStepDescriptorFor(baseCode).targetType;
  const selected = targetOptionForOpcodeValue(project, baseCode, row.id, catalog);
  const resolvedValue = resolveSignedMessageTarget(baseCode, row.id);
  const canCreate = Boolean(targetType && resolvedValue > 0 && !selected);
  const populated = row.rawCode !== 0 || row.id !== 0;
  const canPreview = baseCode !== 0 && Boolean(
    selected || (targetType && targetExists(targetType, resolvedValue))
  );
  const options = resultActionOptionsFor(baseCode);
  const resolvedTitle = selected
    ? [selected.label, signedTargetBehaviorLabel(baseCode, row.id)].filter(Boolean).join(" | ")
    : resolvedValue !== 0
      ? `Raw value ${row.id}`
      : "No target";
  return (
    <div className={`simple-encounter-action-cell${populated ? " populated" : ""}`}>
      <button
        type="button"
        className={`encounter-action-sign-toggle${isNegativeAction ? " active" : ""}`}
        title={baseCode === 0 ? "Empty rows cannot be negative" : "Run the negative version of this code"}
        aria-label={`Toggle negative result action ${slot}`}
        disabled={baseCode === 0}
        onClick={() => onUpdate({ rawCode: signedResultActionCode(baseCode, !isNegativeAction) })}
      >
        {isNegativeAction ? "-" : ""}
      </button>
      <select
        aria-label={`Result action ${slot} opcode`}
        value={baseCode}
        title={rowOption ? `${rowOption.category}: ${rowOption.description}` : "Empty action row"}
        onFocus={() => onFocusCode(baseCode)}
        onChange={(event) => {
          const nextCode = Number(event.currentTarget.value);
          onUpdate({ rawCode: signedResultActionCode(nextCode, isNegativeAction) });
        }}
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>{option.code} {option.shortLabel}</option>
        ))}
      </select>
      <label className="encounter-action-id-field">
        <input
          type="number"
          value={row.id}
          title={resolvedTitle}
          aria-label={`Result action ${slot} ID`}
          onFocus={() => onFocusCode(baseCode)}
          onChange={(event) => onUpdate({ id: Number(event.currentTarget.value) })}
        />
      </label>
      <div className="encounter-action-row-actions">
        {canCreate ? (
          <button
            type="button"
            className="encounter-action-create"
            title={`Create ${targetType} ${resolvedValue}`}
            aria-label={`Create result action ${slot} target`}
            onClick={() => targetType && onCreateTarget(targetType, resolvedValue)}
          >
            <Plus size={12} />
          </button>
        ) : canPreview ? (
          <button
            type="button"
            className="encounter-action-preview"
            title={`Preview ${selected?.label ?? `${targetType} ${resolvedValue}`}`}
            aria-label={`Preview result action ${slot} target`}
            onClick={() => onPreviewTarget(baseCode, row.id)}
          >
            <Eye size={12} />
          </button>
        ) : <span className="encounter-action-preview-placeholder" aria-hidden="true" />}
        {populated && (
          <button
            type="button"
            className="encounter-action-clear"
            title="Clear"
            aria-label={`Clear result action ${slot}`}
            onClick={() => onUpdate({ rawCode: 0, id: 0 })}
          >
            <X size={12} />
          </button>
        )}
        {!populated && <span className="encounter-action-clear-placeholder" aria-hidden="true" />}
      </div>
    </div>
  );
}
