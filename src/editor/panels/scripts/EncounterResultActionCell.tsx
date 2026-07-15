import { Eye, X } from "lucide-react";
import {
  resolveSignedMessageTarget,
  signedTargetBehaviorLabel,
  targetPickerConfig,
  targetOptionForOpcodeValue
} from "../../components/RealmzTargetPicker";
import { actionOptionFor } from "../../realmzActions";
import type {
  EncounterActionRow,
  LibraryCatalog,
  Project
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
  onPreviewTarget
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  slot: number;
  row: EncounterActionRow;
  onUpdate: (changes: Partial<EncounterActionRow>) => void;
  onFocusCode: (code: number) => void;
  onPreviewTarget: (opcode: number, value: number) => void;
}) {
  const baseCode = resultActionBaseCode(row.rawCode);
  const isNegativeAction = row.rawCode < 0;
  const rowOption = actionOptionFor(baseCode);
  const selected = targetOptionForOpcodeValue(project, baseCode, row.id, catalog);
  const resolvedValue = resolveSignedMessageTarget(baseCode, row.id);
  const populated = row.rawCode !== 0 || row.id !== 0;
  const targetPicker = targetPickerConfig(baseCode);
  const canBrowse = Boolean(targetPicker);
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
        {canBrowse ? (
          <button
            type="button"
            className="encounter-action-preview"
            title={selected ? `Browse ${selected.label}` : `Browse ${targetPicker?.label ?? "action target"}`}
            aria-label={`Browse result action ${slot} target`}
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
