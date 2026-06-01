import { useEffect, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../types";
import { CollapsibleSection, EmptyState, FieldRow, PanelSection } from "../ui";
import { itemReferenceDetail, itemReferenceOptions } from "../itemReferences";
import { createRecordTypeForEdcdTarget, edcdFieldTargetKind, edcdTargetLabel, edcdTargetOptions, missingEdcdTargetReferences } from "../edcdTargets";
import { type OpcodeParameterLabel } from "../opcodeCrosswalk";
import { CHOICE_BRANCH_MODES, choiceBranchModeLabel, choiceBranchTargetKind, choiceContinueLabel, nextOptionLabelId, parseChoicePromptValue, serializeChoicePromptValue, type ChoicePromptKind } from "../choiceDialogs";
import { selectEntityFromId } from "../utils";

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
  onOpenText,
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
  onOpenText?: (editor: "messages" | "option-labels") => void;
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
  const targetIssues = missingEdcdTargetReferences(project, shapeId, fieldNames, numericDraft, opcode, preservedIndexes, catalog);

  if (shapeId.toLowerCase() === "choice" && Math.abs(opcode ?? 0) === 3) {
    return (
      <ChoiceDialogEditor
        project={project}
        rowId={rowId}
        rowExists={Boolean(row)}
        initialValues={initialValues}
        targetIssues={targetIssues}
        selectedSlotLabel={selectedSlotLabel}
        onSelectEntity={onSelectEntity}
        onOpenText={onOpenText}
        onApplyCommand={onApplyCommand}
      />
    );
  }

  return (
    <PanelSection
      title={settingsTitleForShape(shapeId)}
      eyebrow={`settings ${rowId}`}
      density="compact"
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!onApplyCommand || !changed}
            onClick={() => onApplyCommand?.({
              kind: "updateEdcdRow",
              label: `Update settings ${rowId}`,
              rowId,
              values: numericDraft
            })}
          >
            <Save size={12} /> Apply Settings
          </button>
          {row && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              disabled={!onApplyCommand}
              onClick={() => onApplyCommand?.({ kind: "deleteEdcdRow", label: `Delete settings ${rowId}`, rowId })}
            >
              <Trash2 size={12} /> Clear Settings
            </button>
          )}
        </>
      }
    >
      <div className="edcd-row-editor">
        {!row && (
          <EmptyState
            compact
            title="Settings not created yet"
            body={`This ${selectedSlotLabel} uses settings ${rowId}. Applying values here will create them.`}
          />
        )}
        {primaryFields.length > 0 ? (
          <div className="edcd-field-grid">
            {primaryFields.map((field) => renderParameterField(field))}
          </div>
        ) : (
          <EmptyState compact title="No editable settings" body="This imported settings row does not have normal editable fields." />
        )}
        {edcdUsage?.secondaryRowId != null && (
          <div className="edcd-secondary-row">
            <FieldRow label="Secondary Settings" value={edcdUsage.secondaryRowId} />
            {edcdUsage.secondaryFields?.map((field, index) => (
              <FieldRow key={`${edcdUsage.secondaryRowId}-${index}`} label={humanizeFieldName(field.name ?? `param${index}`)} value={field.value ?? 0} />
            ))}
          </div>
        )}
        {edcdUsage?.diagnostics?.map((diagnostic) => (
          <p key={diagnostic} className="field-warning">{diagnostic}</p>
        ))}
        <CollapsibleSection title="Technical Details" eyebrow="advanced" density="compact" storageKey={`scripts.parameterRow.${rowId}.advanced.open`} defaultOpen={false}>
          <div className="realmz-raw-preview">
            {edcdUsage?.summary && <FieldRow label="Summary" value={edcdUsage.summary} />}
            <FieldRow label="Data EDCD Row" value={rowId} />
            <FieldRow label="Internal Shape" value={shapeId} />
            <FieldRow label="Internal Fields" value={fieldNames.join(", ")} />
            {preservedFields.length > 0 && (
              <FieldRow
                label="Compatibility Values"
                value={preservedFields.map((field) => `${field.label}: ${numericDraft[field.index] ?? 0}`).join("; ")}
              />
            )}
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
    const targetOptions = targetKind ? edcdTargetOptions(project, targetKind, catalog) : [];
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
            {value !== 0 && !selectedTarget && (
              <option value={`raw:${value}`}>
                {value > 0 ? `Missing ${targetLabel} ${value}` : `No ${targetLabel} selected (${value})`}
              </option>
            )}
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
            {value !== 0 && !selectedItem && <option value={`raw:${value}`}>Current item {value}</option>}
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
                  : `No ${targetLabel} selected. ${value < 0 ? `${value} is kept as an imported blank value.` : ""}`}
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
            Open {targetLabel}
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

function ChoiceDialogEditor({
  project,
  rowId,
  rowExists,
  initialValues,
  targetIssues,
  selectedSlotLabel,
  onSelectEntity,
  onOpenText,
  onApplyCommand
}: {
  project: Project;
  rowId: number;
  rowExists: boolean;
  initialValues: number[];
  targetIssues: ReturnType<typeof missingEdcdTargetReferences>;
  selectedSlotLabel: string;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenText?: (editor: "messages" | "option-labels") => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const [draft, setDraft] = useState(initialValues.map(String));

  useEffect(() => {
    setDraft(initialValues.map(String));
  }, [initialValues]);

  const numericDraft = draft.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const changed = numericDraft.some((value, index) => value !== initialValues[index]);
  const continueValue = numericDraft[0] ?? 0;
  const branchMode = numericDraft[1] ?? 0;
  const branchKind = choiceBranchTargetKind(branchMode);
  const branchOptions = branchKind ? edcdTargetOptions(project, branchKind) : [];
  const branchTarget = numericDraft[2] ?? 0;
  const selectedBranch = branchOptions.find((option) => option.value === branchTarget);

  const setField = (index: number, value: number) => {
    const next = [...draft];
    next[index] = String(value);
    setDraft(next);
  };

  return (
    <PanelSection
      title={`Choice Dialog ${rowId}`}
      eyebrow="Player Option"
      density="compact"
      actions={
        <>
          <button
            type="button"
            className="btn btn-primary btn-xs"
            disabled={!onApplyCommand || !changed}
            onClick={() => onApplyCommand?.({
              kind: "updateEdcdRow",
              label: `Update choice dialog ${rowId}`,
              rowId,
              values: numericDraft
            })}
          >
            <Save size={12} /> Apply Choice
          </button>
          {rowExists && (
            <button
              type="button"
              className="btn btn-danger btn-xs"
              disabled={!onApplyCommand}
              onClick={() => onApplyCommand?.({ kind: "deleteEdcdRow", label: `Clear choice dialog ${rowId}`, rowId })}
            >
              <Trash2 size={12} /> Clear Choice
            </button>
          )}
        </>
      }
    >
      <div className="choice-dialog-editor">
        {!rowExists && (
          <EmptyState
            compact
            title="Missing choice dialog settings"
            body={`This ${selectedSlotLabel} uses choice dialog ${rowId}. Applying values here will create it.`}
          />
        )}
        <div className="choice-dialog-grid">
          <label className="script-required-field">
            <span>Continue When</span>
            <select value={continueValue === 0 || continueValue === 1 ? String(continueValue) : `raw:${continueValue}`} onChange={(event) => {
              const raw = event.currentTarget.value;
              if (raw.startsWith("raw:")) return;
              setField(0, Number(raw));
            }}>
              {continueValue !== 0 && continueValue !== 1 && <option value={`raw:${continueValue}`}>{choiceContinueLabel(continueValue)}</option>}
              <option value="1">Left / Yes continues</option>
              <option value="0">Right / No continues</option>
            </select>
            <small>The other choice branches using the behavior below.</small>
          </label>
          <label className="script-required-field">
            <span>Otherwise</span>
            <select value={CHOICE_BRANCH_MODES.some((mode) => mode.value === branchMode) ? String(branchMode) : `raw:${branchMode}`} onChange={(event) => {
              const raw = event.currentTarget.value;
              if (raw.startsWith("raw:")) return;
              setField(1, Number(raw));
            }}>
              {!CHOICE_BRANCH_MODES.some((mode) => mode.value === branchMode) && <option value={`raw:${branchMode}`}>{choiceBranchModeLabel(branchMode)}</option>}
              {CHOICE_BRANCH_MODES.map((mode) => (
                <option key={mode.value} value={mode.value}>{mode.label}</option>
              ))}
            </select>
            <small>{CHOICE_BRANCH_MODES.find((mode) => mode.value === branchMode)?.help ?? "Imported branch behavior; edit with care."}</small>
          </label>
          <label className={`${branchKind ? "script-required-field" : ""}${targetIssues.some((issue) => issue.index === 2) ? " has-warning" : ""}`}>
            <span>Branch Target</span>
            {branchKind ? (
              <select
                value={selectedBranch ? String(branchTarget) : branchTarget === 0 ? "0" : `raw:${branchTarget}`}
                onChange={(event) => {
                  const raw = event.currentTarget.value;
                  if (raw.startsWith("raw:")) return;
                  setField(2, Number(raw));
                }}
              >
                <option value="0">No target</option>
                {branchTarget !== 0 && !selectedBranch && <option value={`raw:${branchTarget}`}>Current target {branchTarget}</option>}
                {branchOptions.map((option) => (
                  <option key={option.key} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input type="number" value={draft[2] ?? "0"} onChange={(event) => setField(2, Number(event.currentTarget.value))} />
            )}
            <small>{branchKind ? selectedBranch?.detail ?? `${choiceBranchModeLabel(branchMode)} target.` : "Only used when the branch mode needs a target."}</small>
          </label>
        </div>
        <div className="choice-prompt-grid">
          <ChoicePromptField
            project={project}
            label="Left Option"
            value={numericDraft[3] ?? 0}
            warning={targetIssues.find((issue) => issue.index === 3)?.targetLabel}
            onChange={(value) => setField(3, value)}
            onSelectEntity={onSelectEntity}
            onOpenText={onOpenText}
            onApplyCommand={onApplyCommand}
          />
          <ChoicePromptField
            project={project}
            label="Right Option"
            value={numericDraft[4] ?? 0}
            warning={targetIssues.find((issue) => issue.index === 4)?.targetLabel}
            onChange={(value) => setField(4, value)}
            onSelectEntity={onSelectEntity}
            onOpenText={onOpenText}
            onApplyCommand={onApplyCommand}
          />
        </div>
        {targetIssues.map((issue) => (
          <p key={`${issue.index}-${issue.targetKind}-${issue.value}`} className="field-warning">
            Missing {issue.targetLabel} {issue.value} for {issue.index === 2 ? "branch target" : issue.index === 3 ? "left option" : "right option"}.
          </p>
        ))}
        <CollapsibleSection title="Technical Details" eyebrow="advanced" density="compact" storageKey={`scripts.choiceDialog.${rowId}.advanced.open`} defaultOpen={false}>
          <div className="realmz-raw-preview">
            <FieldRow label="Data EDCD Row" value={rowId} />
            <FieldRow label="Internal Shape" value="choice" />
            <FieldRow label="Internal Fields" value="replyPolarity, branchMode, branchTarget, promptA, promptB" />
            <FieldRow label="Raw Values" value={numericDraft.join(", ")} />
          </div>
        </CollapsibleSection>
      </div>
    </PanelSection>
  );
}

function ChoicePromptField({
  project,
  label,
  value,
  warning,
  onChange,
  onSelectEntity,
  onOpenText,
  onApplyCommand
}: {
  project: Project;
  label: string;
  value: number;
  warning?: string;
  onChange: (value: number) => void;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenText?: (editor: "messages" | "option-labels") => void;
  onApplyCommand?: (command: ProjectCommand) => void;
}) {
  const prompt = parseChoicePromptValue(value);
  const messages = [...(project.messages ?? [])].sort((a, b) => a.id - b.id);
  const optionLabels = [...(project.optionLabels ?? [])].sort((a, b) => a.id - b.id);
  const selectedMessage = prompt.kind === "message" ? messages.find((record) => record.id === prompt.id) : null;
  const selectedOptionLabel = prompt.kind === "option-label" ? optionLabels.find((record) => record.id === prompt.id) : null;
  const selectKind = (kind: ChoicePromptKind) => {
    if (kind === "message") onChange(serializeChoicePromptValue(kind, selectedMessage?.id ?? messages[0]?.id ?? 0));
    else if (kind === "option-label") {
      const existingId = selectedOptionLabel?.id ?? optionLabels[0]?.id;
      if (existingId != null) {
        onChange(serializeChoicePromptValue(kind, existingId));
        return;
      }
      const id = nextOptionLabelId(optionLabels);
      onApplyCommand?.({ kind: "createOptionLabel", label: `Create Option Label ${id}`, id });
      onChange(-id);
      openOptionLabel(id);
    }
    else onChange(0);
  };
  const openMessage = (id: number) => {
    onSelectEntity?.(selectEntityFromId(`message:${id}`));
    onOpenText?.("messages");
  };
  const openOptionLabel = (id: number) => {
    onSelectEntity?.(selectEntityFromId(`option-label:${id}`));
    onOpenText?.("option-labels");
  };
  const createOptionLabel = () => {
    const id = prompt.kind === "option-label" && prompt.id > 0 ? prompt.id : nextOptionLabelId(optionLabels);
    onApplyCommand?.({ kind: "createOptionLabel", label: `Create Option Label ${id}`, id });
    onChange(-id);
    openOptionLabel(id);
  };

  return (
    <div className={`choice-prompt-field script-required-field${warning ? " has-warning" : ""}`}>
      <label>
        <span>{label}</span>
        <select value={prompt.kind} onChange={(event) => selectKind(event.currentTarget.value as ChoicePromptKind)}>
          <option value="default">Default Yes/No</option>
          <option value="message">String</option>
          <option value="option-label">Option Label</option>
        </select>
      </label>
      {prompt.kind === "message" && (
        <label>
          <span>String</span>
          <select value={selectedMessage ? String(prompt.id) : `raw:${prompt.id}`} onChange={(event) => {
            const raw = event.currentTarget.value;
            if (raw.startsWith("raw:")) return;
            onChange(Number(raw));
          }}>
            {!selectedMessage && prompt.id > 0 && <option value={`raw:${prompt.id}`}>Missing String {prompt.id}</option>}
            {messages.map((record) => (
              <option key={record.id} value={record.id}>{record.id}: {record.text || "Empty"}</option>
            ))}
          </select>
          <small>{selectedMessage?.text || "Choose a scenario string."}</small>
        </label>
      )}
      {prompt.kind === "option-label" && (
        <label>
          <span>Option Label</span>
          <select value={selectedOptionLabel ? String(prompt.id) : `raw:${prompt.id}`} onChange={(event) => {
            const raw = event.currentTarget.value;
            if (raw.startsWith("raw:")) return;
            onChange(-Number(raw));
          }}>
            {!selectedOptionLabel && prompt.id > 0 && <option value={`raw:${prompt.id}`}>Missing Option Label {prompt.id}</option>}
            {optionLabels.map((record) => (
              <option key={record.id} value={record.id}>{record.id}: {record.text || "Empty"}</option>
            ))}
          </select>
          <small>{selectedOptionLabel?.text || "Option labels are compact choice text."}</small>
        </label>
      )}
      {prompt.kind === "default" && <p>Uses the standard Yes / No option text.</p>}
      <div className="choice-prompt-actions">
        {prompt.kind === "message" && prompt.id > 0 && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => openMessage(prompt.id)}>
            Edit String
          </button>
        )}
        {prompt.kind === "option-label" && prompt.id > 0 && selectedOptionLabel && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => openOptionLabel(prompt.id)}>
            Edit Label
          </button>
        )}
        {prompt.kind === "option-label" && (!selectedOptionLabel || prompt.id === 0) && (
          <button type="button" className="btn btn-primary btn-xs" onClick={createOptionLabel}>
            {prompt.id > 0 ? "Create Label" : "New Label"}
          </button>
        )}
      </div>
    </div>
  );
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

function settingsTitleForShape(shape: string) {
  const normalized = shape.toLowerCase();
  const labels: Record<string, string> = {
    battle: "Battle Setup",
    choice: "Choice Dialog",
    "random-message": "Message Range",
    teleport: "Movement",
    "party-condition-branch": "Condition Branch",
    "force-branch": "Branch Target",
    "percent-branch": "Percent Branch",
    "condition-branch": "Condition Branch",
    "random-region-shape-mutation": "Random Area Shape",
    fumble: "Fumble Result"
  };
  return labels[normalized] ?? humanizeFieldName(shape);
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
