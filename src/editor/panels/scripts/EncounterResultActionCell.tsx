import { useId } from "react";
import { Eye, SlidersHorizontal, X } from "lucide-react";
import { TutorialTip } from "../../components/TutorialTip";
import {
  resolveSignedMessageTarget,
  signedTargetBehaviorLabel,
  targetPickerConfig,
  targetOptionForOpcodeValue
} from "../../components/RealmzTargetPicker";
import { divinityHelpForOpcode } from "../../divinityOpcodeHelp";
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
import { encounterEcodeActionSummary } from "./encounterEcodeSettings";
import {
  directActionSettingsFor,
  directActionSummary
} from "./directActionSettings";
import { scriptActionAllowedInContext, scriptActionContextRestrictionReason } from "./scriptActionContexts";

export function encounterResultIdHelp(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  row: EncounterActionRow
) {
  const baseCode = resultActionBaseCode(row.rawCode);
  const action = actionOptionFor(baseCode);
  const manualHelp = divinityHelpForOpcode(baseCode);
  const picker = targetPickerConfig(baseCode);
  const selected = targetOptionForOpcodeValue(project, baseCode, row.id, catalog);
  const resolvedValue = resolveSignedMessageTarget(baseCode, row.id);
  const fieldMeaning = documentedIdField(manualHelp?.idField);
  const actionLabel = manualHelp?.title || action?.shortLabel || action?.label || `Code ${baseCode}`;
  const definition = fieldMeaning
    ? asSentence(fieldMeaning)
    : "No contextual ID-field description is documented for this action.";
  let context = `Current raw value: ${row.id}.`;
  if (picker) {
    if (selected) {
      const detail = conciseTargetDetail(selected.detail);
      const target = [selected.label, detail, signedTargetBehaviorLabel(baseCode, row.id)].filter(Boolean).join(" | ");
      context = `Current target: ${target}.`;
    } else if (resolvedValue === 0) {
      context = "Current target: none.";
    } else {
      context = `Current raw value: ${row.id}; no matching ${picker.label.toLowerCase()} was found.`;
    }
  }
  return {
    title: `${baseCode} ${actionLabel} ID Field`,
    body: `${definition} ${context}`
  };
}

function documentedIdField(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized || /^(none|n\/a|not specified)$/i.test(normalized)) return null;
  return normalized;
}

function asSentence(value: string) {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function conciseTargetDetail(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "empty") return null;
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

export function EncounterResultActionCell({
  project,
  catalog,
  recordKind,
  slot,
  row,
  onUpdate,
  onFocusCode,
  onPreviewTarget,
  onEditSettings,
  onEditDirect
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  recordKind: "simple" | "complex";
  slot: number;
  row: EncounterActionRow;
  onUpdate: (changes: Partial<EncounterActionRow>) => void;
  onFocusCode: (code: number) => void;
  onPreviewTarget: (opcode: number, value: number) => void;
  onEditSettings: (rawCode: number) => void;
  onEditDirect: (rawCode: number) => void;
}) {
  const idHelpId = useId();
  const baseCode = resultActionBaseCode(row.rawCode);
  const isNegativeAction = row.rawCode < 0;
  const rowOption = actionOptionFor(baseCode);
  const isEcodeBacked = Boolean(rowOption?.edcdShape);
  const ecodeSummary = isEcodeBacked ? encounterEcodeActionSummary(project, catalog, row) : null;
  const directSettings = isEcodeBacked ? null : directActionSettingsFor(row.rawCode);
  const directSummary = isEcodeBacked ? null : directActionSummary(project, catalog, row.rawCode, row.id);
  const selected = targetOptionForOpcodeValue(project, baseCode, row.id, catalog);
  const populated = row.rawCode !== 0 || row.id !== 0;
  const targetPicker = targetPickerConfig(baseCode);
  const canBrowse = Boolean(targetPicker) && !isEcodeBacked;
  const options = resultActionOptionsFor(baseCode, recordKind);
  const allowedInEncounter = scriptActionAllowedInContext(
    baseCode,
    recordKind === "simple" ? "simple-encounter" : "complex-encounter"
  );
  const idHelp = encounterResultIdHelp(project, catalog, row);
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
          const nextRawCode = signedResultActionCode(nextCode, isNegativeAction);
          if (actionOptionFor(nextCode)?.edcdShape) {
            onEditSettings(nextRawCode);
            return;
          }
          const nextSettings = directActionSettingsFor(nextRawCode);
          if (nextSettings.kind === "none") {
            onUpdate({ rawCode: nextRawCode, id: 0 });
            return;
          }
          onEditDirect(nextRawCode);
        }}
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>{option.code} {option.shortLabel}</option>
        ))}
      </select>
      {isEcodeBacked ? (
        <TutorialTip
          title={`${rowOption?.displayTitle ?? rowOption?.shortLabel ?? `Opcode ${baseCode}`} Settings`}
          body={`${ecodeSummary ?? "Configure this action's settings."} Raw storage details remain available inside the settings dialog.`}
          side="below"
          focusable={false}
          tooltipId={idHelpId}
        >
          <button
            type="button"
            className="encounter-action-settings-field"
            aria-label={`Edit result action ${slot} settings`}
            aria-describedby={idHelpId}
            onFocus={() => onFocusCode(baseCode)}
            onClick={() => onEditSettings(row.rawCode)}
          >
            <span>{ecodeSummary}</span>
            <SlidersHorizontal size={12} />
          </button>
        </TutorialTip>
      ) : directSettings?.kind !== "none" && baseCode !== 0 ? (
        <TutorialTip title={idHelp.title} body={idHelp.body} side="below" focusable={false} tooltipId={idHelpId}>
          <button
            type="button"
            className="encounter-action-settings-field"
            aria-label={`Edit result action ${slot} settings`}
            aria-describedby={idHelpId}
            onFocus={() => onFocusCode(baseCode)}
            onClick={() => onEditDirect(row.rawCode)}
          >
            <span>{directSummary}</span>
            <SlidersHorizontal size={12} />
          </button>
        </TutorialTip>
      ) : (
        <span
          className="encounter-action-settings-field encounter-action-no-settings-field"
          aria-label={`Result action ${slot} has no settings`}
        >
          <span>{baseCode === 0 ? "Empty" : directSummary}</span>
        </span>
      )}
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
      {populated && !allowedInEncounter && (
        <small className="field-warning encounter-action-context-warning">
          Imported value preserved. {scriptActionContextRestrictionReason(baseCode)}
        </small>
      )}
    </div>
  );
}
