import { useEffect, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../types";
import { CollapsibleSection, EmptyState, FieldRow, PanelSection } from "../ui";
import { itemReferenceDetail, itemReferenceOptions } from "../itemReferences";
import { createRecordTypeForEdcdTarget, edcdFieldTargetKind, edcdTargetLabel, edcdTargetOptions, missingEdcdTargetReferences } from "../edcdTargets";
import { type OpcodeParameterLabel } from "../opcodeCrosswalk";

type EdcdField = {
  name?: string;
  value?: number;
};

type EdcdUsage = {
  rowId?: number;
  shape?: string;
  opcode?: number;
  fields?: EdcdField[];
  secondaryRowId?: number;
  secondaryShape?: string;
  secondaryFields?: EdcdField[];
  diagnostics?: string[];
  summary?: string;
};

export function EdcdRowEditor({
  project,
  catalog,
  edcdUsage,
  fallbackRowId,
  fallbackShape,
  fallbackFieldNames,
  fallbackOpcode,
  parameterLabels,
  selectedSlotLabel,
  onSelectEntity,
  onApplyCommand
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  edcdUsage?: EdcdUsage | null;
  fallbackRowId: number;
  fallbackShape?: string;
  fallbackFieldNames?: string[];
  fallbackOpcode?: number;
  parameterLabels?: OpcodeParameterLabel[];
  selectedSlotLabel: string;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const rowId = edcdUsage?.rowId ?? (fallbackShape ? Math.max(0, fallbackRowId) : null);
  const shape = edcdUsage?.shape ?? fallbackShape ?? null;
  const row = typeof rowId === "number" ? project.extracodes.find((candidate) => candidate.id === rowId) : null;
  const fieldNames = useMemo(() => {
    const semanticNames = edcdUsage?.fields?.map((field, index) => field.name || `param${index}`) ?? [];
    return [0, 1, 2, 3, 4].map((index) => semanticNames[index] ?? fallbackFieldNames?.[index] ?? `param${index}`);
  }, [edcdUsage, fallbackFieldNames]);
  const initialValues = useMemo(() => {
    const semanticValues = edcdUsage?.fields?.map((field) => Number(field.value ?? 0)) ?? [];
    const rawValues = row?.values ?? [];
    return [0, 1, 2, 3, 4].map((index) => Number(semanticValues[index] ?? rawValues[index] ?? 0));
  }, [edcdUsage, row]);
  const [draft, setDraft] = useState(initialValues.map(String));
  const itemOptions = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);

  useEffect(() => {
    setDraft(initialValues.map(String));
  }, [initialValues]);

  if (rowId == null || !shape) return null;
  const shapeId = shape;

  const numericDraft = draft.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const opcode = edcdUsage?.opcode ?? fallbackOpcode;
  const changed = numericDraft.some((value, index) => value !== initialValues[index]);
  const fieldMetadata = fieldNames.map((name, index) => {
    const metadata = parameterLabels?.find((label) => label.index === index);
    return {
      index,
      internalName: name,
      label: metadata?.label || humanizeFieldName(name),
      help: metadata?.help ?? "",
      preserved: metadata?.preserved ?? fieldNameIsPreserved(name)
    };
  });
  const primaryFields = fieldMetadata.filter((field) => !field.preserved);
  const preservedFields = fieldMetadata.filter((field) => field.preserved);
  const preservedIndexes = preservedFields.map((field) => field.index);
  const targetIssues = missingEdcdTargetReferences(project, shapeId, fieldNames, numericDraft, opcode, preservedIndexes);

  return (
    <PanelSection
      title={`Parameter Row ${rowId}`}
      eyebrow="extra settings"
      density="compact"
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!onApplyCommand || !changed}
            onClick={() => onApplyCommand?.({
              kind: "updateEdcdRow",
              label: `Update parameter row ${rowId}`,
              rowId,
              values: numericDraft
            })}
          >
            <Save size={12} /> Apply Parameters
          </button>
          {row && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              disabled={!onApplyCommand}
              onClick={() => onApplyCommand?.({ kind: "deleteEdcdRow", label: `Delete parameter row ${rowId}`, rowId })}
            >
              <Trash2 size={12} /> Delete Row
            </button>
          )}
        </>
      }
    >
      <div className="edcd-row-editor">
        {edcdUsage?.summary && <p className="field-help">{edcdUsage.summary}</p>}
        {!row && (
          <EmptyState
            compact
            title="Missing parameter row"
            body={`This ${selectedSlotLabel} references parameter row ${rowId}; applying values here will create the row for export-backed script data.`}
          />
        )}
        {primaryFields.length > 0 ? (
          <div className="edcd-field-grid">
            {primaryFields.map((field) => renderParameterField(field))}
          </div>
        ) : (
          <EmptyState compact title="No editable parameters" body="Realmz loads this row for compatibility; Providence preserves its values for export." />
        )}
        {preservedFields.length > 0 && (
          <CollapsibleSection title="Preserved Values" eyebrow={`${preservedFields.length}`} density="compact" storageKey={`scripts.parameterRow.${rowId}.preserved.open`} defaultOpen={false}>
            <div className="edcd-field-grid preserved">
              {preservedFields.map((field) => renderParameterField(field))}
            </div>
          </CollapsibleSection>
        )}
        {edcdUsage?.secondaryRowId != null && (
          <div className="edcd-secondary-row">
            <FieldRow label="Secondary Parameter Row" value={edcdUsage.secondaryRowId} />
            {edcdUsage.secondaryFields?.map((field, index) => (
              <FieldRow key={`${edcdUsage.secondaryRowId}-${index}`} label={humanizeFieldName(field.name ?? `param${index}`)} value={field.value ?? 0} />
            ))}
          </div>
        )}
        {edcdUsage?.diagnostics?.map((diagnostic) => (
          <p key={diagnostic} className="field-warning">{diagnostic}</p>
        ))}
        <CollapsibleSection title="Advanced Details" eyebrow="raw row" density="compact" storageKey={`scripts.parameterRow.${rowId}.advanced.open`} defaultOpen={false}>
          <div className="realmz-raw-preview">
            <FieldRow label="Data EDCD Row" value={rowId} />
            <FieldRow label="Internal Shape" value={shapeId} />
            <FieldRow label="Internal Fields" value={fieldNames.join(", ")} />
          </div>
        </CollapsibleSection>
      </div>
    </PanelSection>
  );

  function renderParameterField(field: { index: number; internalName: string; label: string; help: string; preserved: boolean }) {
    const { index, internalName, label, help, preserved } = field;
    const value = Number(draft[index] ?? "0");
    const isItemField = !preserved && edcdFieldLooksLikeItem(shapeId, internalName);
    const targetKind = !preserved ? edcdFieldTargetKind(shapeId, internalName, fieldNames, numericDraft, opcode) : null;
    const selectedItem = itemOptions.find((option) => option.value === value);
    const targetOptions = targetKind ? edcdTargetOptions(project, targetKind) : [];
    const selectedTarget = targetOptions.find((option) => option.value === value);
    const createRecordType = createRecordTypeForEdcdTarget(targetKind);
    const targetLabel = targetKind ? edcdTargetLabel(targetKind) : "";
    const targetIssue = targetIssues.find((issue) => issue.index === index);
    return (
      <label key={`${rowId}-${internalName}-${index}`} className={`${isItemField || targetKind ? "edcd-item-field" : ""}${targetIssue ? " has-warning" : ""}`}>
        <span title={internalName}>{label}</span>
        {targetKind && (
          <select
            value={selectedTarget ? String(value) : value === 0 ? "0" : `raw:${value}`}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              if (raw.startsWith("raw:")) return;
              const next = [...draft];
              next[index] = raw;
              setDraft(next);
            }}
          >
            <option value="0">No {targetLabel}</option>
            {value !== 0 && !selectedTarget && <option value={`raw:${value}`}>Current {targetLabel} ID {value}</option>}
            {targetOptions.map((option) => (
              <option key={option.key} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
        {isItemField && (
          <select
            value={selectedItem ? String(value) : value === 0 ? "0" : `raw:${value}`}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              if (raw.startsWith("raw:")) return;
              const next = [...draft];
              next[index] = raw;
              setDraft(next);
            }}
          >
            <option value="0">No item</option>
            {value !== 0 && !selectedItem && <option value={`raw:${value}`}>Current item ID {value}</option>}
            {itemOptions.slice(0, 260).map((option) => (
              <option key={option.key} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
        <input
          type="number"
          value={draft[index] ?? "0"}
          onChange={(event) => {
            const next = [...draft];
            next[index] = event.currentTarget.value;
            setDraft(next);
          }}
        />
        {help && <small>{help}</small>}
        {isItemField && <small>{selectedItem ? [selectedItem.detail, selectedItem.sourceState].filter(Boolean).join(" | ") : itemReferenceDetail(project, value, catalog)}</small>}
        {targetKind && (
          <small>
            {selectedTarget
              ? selectedTarget.detail
              : value > 0
                ? `No ${targetLabel} ${value} exists yet.`
                : `No ${targetLabel} target selected.`}
          </small>
        )}
        {targetIssue && (
          <p className="field-warning">
            Missing {targetIssue.targetLabel} target {targetIssue.value}. Create or select it before export.
          </p>
        )}
        {selectedTarget?.entity && onSelectEntity && (
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => onSelectEntity(selectedTarget.entity!)}
          >
            Inspect {targetLabel}
          </button>
        )}
        {createRecordType && value > 0 && !selectedTarget && onApplyCommand && (
          <button
            type="button"
            className="btn btn-secondary btn-xs"
            onClick={() => onApplyCommand({
              kind: "createTargetRecord",
              label: `Create ${targetLabel} ${value}`,
              recordType: createRecordType,
              id: value
            })}
          >
            Create {targetLabel} {value}
          </button>
        )}
      </label>
    );
  }
}

function edcdFieldLooksLikeItem(shape: string, name: string) {
  const normalizedShape = shape.toLowerCase();
  const normalizedName = name.toLowerCase();
  if (!normalizedShape.includes("item") && normalizedShape !== "random-items") return false;
  return ["item", "itemlow", "itemhigh", "replacementitem"].includes(normalizedName) || normalizedName.includes("item");
}

function fieldNameIsPreserved(name: string) {
  return name.toLowerCase().includes("unused");
}

function humanizeFieldName(name: string) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\bOr\b/g, " / ")
    .replace(/\bAnd\b/g, " & ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bId\b/g, "ID")
    .replace(/\bAp\b/g, "AP")
    .replace(/\bDrv\b/g, "DRV");
}
