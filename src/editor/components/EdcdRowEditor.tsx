import { useEffect, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../types";
import { EmptyState, FieldRow, PanelSection } from "../ui";
import { itemReferenceDetail, itemReferenceOptions } from "../itemReferences";
import { createRecordTypeForEdcdTarget, edcdFieldTargetKind, edcdTargetLabel, edcdTargetOptions, missingEdcdTargetReferences } from "../edcdTargets";

type EdcdField = {
  name?: string;
  value?: number;
};

type EdcdUsage = {
  rowId?: number;
  shape?: string;
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

  const numericDraft = draft.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const targetIssues = missingEdcdTargetReferences(project, shape, fieldNames, numericDraft);
  const changed = numericDraft.some((value, index) => value !== initialValues[index]);

  return (
    <PanelSection
      title={`Data EDCD row ${rowId}`}
      eyebrow={shape}
      density="compact"
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!onApplyCommand || !changed}
            onClick={() => onApplyCommand?.({
              kind: "updateEdcdRow",
              label: `Update EDCD row ${rowId}`,
              rowId,
              values: numericDraft
            })}
          >
            <Save size={12} /> Apply Row
          </button>
          {row && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              disabled={!onApplyCommand}
              onClick={() => onApplyCommand?.({ kind: "deleteEdcdRow", label: `Delete EDCD row ${rowId}`, rowId })}
            >
              <Trash2 size={12} /> Delete
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
            title="Missing source row"
            body={`This ${selectedSlotLabel} references Data EDCD row ${rowId}; applying values here will create the Providence row for export-backed script data.`}
          />
        )}
        <div className="edcd-field-grid">
          {fieldNames.map((name, index) => {
            const value = Number(draft[index] ?? "0");
            const isItemField = edcdFieldLooksLikeItem(shape, name);
            const targetKind = edcdFieldTargetKind(shape, name, fieldNames, numericDraft);
            const selectedItem = itemOptions.find((option) => option.value === value);
            const targetOptions = targetKind ? edcdTargetOptions(project, targetKind) : [];
            const selectedTarget = targetOptions.find((option) => option.value === value);
            const createRecordType = createRecordTypeForEdcdTarget(targetKind);
            const targetLabel = targetKind ? edcdTargetLabel(targetKind) : "";
            const targetIssue = targetIssues.find((issue) => issue.index === index);
            return (
              <label key={`${rowId}-${name}-${index}`} className={`${isItemField || targetKind ? "edcd-item-field" : ""}${targetIssue ? " has-warning" : ""}`}>
                <span>{name}</span>
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
                    Create or select {targetIssue.targetLabel} {targetIssue.value}; Realmz will receive this ID, but Providence cannot prove it exists yet.
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
          })}
        </div>
        {edcdUsage?.secondaryRowId != null && (
          <div className="edcd-secondary-row">
            <FieldRow label="Secondary Row" value={edcdUsage.secondaryRowId} />
            <FieldRow label="Secondary Shape" value={edcdUsage.secondaryShape ?? "random-region-shape-details"} />
            {edcdUsage.secondaryFields?.map((field, index) => (
              <FieldRow key={`${edcdUsage.secondaryRowId}-${index}`} label={field.name ?? `param${index}`} value={field.value ?? 0} />
            ))}
          </div>
        )}
        {edcdUsage?.diagnostics?.map((diagnostic) => (
          <p key={diagnostic} className="field-warning">{diagnostic}</p>
        ))}
      </div>
    </PanelSection>
  );
}

function edcdFieldLooksLikeItem(shape: string, name: string) {
  const normalizedShape = shape.toLowerCase();
  const normalizedName = name.toLowerCase();
  if (!normalizedShape.includes("item") && normalizedShape !== "random-items") return false;
  return ["item", "itemlow", "itemhigh", "replacementitem"].includes(normalizedName) || normalizedName.includes("item");
}
