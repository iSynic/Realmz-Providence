import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Project, ProjectCommand } from "../types";
import { EmptyState, FieldRow, PanelSection } from "../ui";

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
  edcdUsage,
  fallbackRowId,
  fallbackShape,
  fallbackFieldNames,
  selectedSlotLabel,
  onApplyCommand
}: {
  project: Project;
  edcdUsage?: EdcdUsage | null;
  fallbackRowId: number;
  fallbackShape?: string;
  fallbackFieldNames?: string[];
  selectedSlotLabel: string;
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

  useEffect(() => {
    setDraft(initialValues.map(String));
  }, [initialValues]);

  if (rowId == null || !shape) return null;

  const numericDraft = draft.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const changed = numericDraft.some((value, index) => value !== initialValues[index]);

  return (
    <PanelSection
      title={`Data EDCD row ${rowId}`}
      eyebrow={shape}
      density="compact"
      actions={
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
          {fieldNames.map((name, index) => (
            <label key={`${rowId}-${name}-${index}`}>
              <span>{name}</span>
              <input
                type="number"
                value={draft[index] ?? "0"}
                onChange={(event) => {
                  const next = [...draft];
                  next[index] = event.currentTarget.value;
                  setDraft(next);
                }}
              />
            </label>
          ))}
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
