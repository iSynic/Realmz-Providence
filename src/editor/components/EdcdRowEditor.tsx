import { useEffect, useMemo, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { LibraryCatalog, Project, ProjectCommand, SelectedEntity } from "../types";
import { CollapsibleSection, EmptyState, FieldRow, PanelSection } from "../ui";
import { itemReferenceDetail, itemReferenceOptions } from "../itemReferences";
import { createRecordTypeForEdcdTarget, edcdFieldTargetKind, edcdTargetLabel, edcdTargetOptions, missingEdcdTargetReferences, type EdcdTargetKind } from "../edcdTargets";
import { type OpcodeParameterLabel } from "../opcodeCrosswalk";
import { CHOICE_BRANCH_MODES, choiceBranchModeLabel, choiceBranchTargetKind, choiceContinueLabel, nextOptionLabelId, parseChoicePromptValue, serializeChoicePromptValue, type ChoicePromptKind } from "../choiceDialogs";
import { scriptActionSummary } from "../panels/scripts/scriptActionCatalog";
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
  fallbackInitialValues,
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
  fallbackInitialValues?: readonly number[];
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
    return [0, 1, 2, 3, 4].map((index) => Number(semanticValues[index] ?? rawValues[index] ?? fallbackInitialValues?.[index] ?? 0));
  }, [edcdUsage, fallbackInitialValues, row]);
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
  const guidedSections = guidedSectionsForShape(shapeId, primaryFields, numericDraft, opcode);
  const guidedSummary = guidedSummaryForEdcd(project, catalog, shapeId, opcode, rowId, numericDraft, fieldNames, edcdUsage?.summary);

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
            body={`This ${selectedSlotLabel} will use settings ${rowId}. Applying the guided settings below will create that row.`}
          />
        )}
        {guidedSummary && (
          <div className="guided-edcd-summary">
            <span>Behavior</span>
            <strong>{guidedSummary}</strong>
          </div>
        )}
        {guidedSections.length > 0 ? (
          <div className="guided-edcd-sections">
            {guidedSections.map((section) => (
              <section key={section.title} className="guided-edcd-section">
                <header>
                  <span>{section.eyebrow}</span>
                  <h4>{section.title}</h4>
                </header>
                <div className="edcd-field-grid">
                  {section.fields.map((field) => renderParameterField(field))}
                </div>
              </section>
            ))}
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
            <FieldRow label="Settings Row" value={rowId} />
            <FieldRow label="Internal Shape" value={shapeId} />
            <FieldRow label="Internal Fields" value={fieldNames.join(", ")} />
            <FieldRow label="Raw Values" value={numericDraft.join(", ")} />
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
    const presentation = guidedFieldPresentation(shapeId, internalName, numericDraft, opcode);
    const modeOptions = guidedModeOptionsForField(shapeId, internalName, opcode);
    const isItemField = !preserved && edcdFieldLooksLikeItem(shapeId, internalName);
    const targetKind = !preserved && !modeOptions ? edcdFieldTargetKind(shapeId, internalName, fieldNames, numericDraft, opcode) : null;
    const selectedItem = itemOptions.find((option) => option.value === value);
    const targetOptions = targetKind ? edcdTargetOptions(project, targetKind, catalog) : [];
    const selectedTarget = targetOptions.find((option) => option.value === value);
    const createRecordType = createRecordTypeForEdcdTarget(targetKind);
    const targetLabel = targetKind ? edcdTargetLabel(targetKind) : "";
    const targetIssue = targetIssues.find((issue) => issue.index === index);
    const fieldHelp = [presentation.help, help].filter(Boolean).join(" ");
    return (
      <label key={`${rowId}-${internalName}-${index}`} className={`${isItemField || targetKind ? "edcd-item-field" : ""}${targetIssue ? " has-warning" : ""}${presentation.disabled ? " is-disabled" : ""}`}>
        <span title={internalName}>{presentation.label ?? label}</span>
        {modeOptions && (
          <select
            disabled={presentation.disabled}
            value={modeOptions.some((option) => option.value === value) ? String(value) : `raw:${value}`}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              if (raw.startsWith("raw:")) return;
              const next = [...draft];
              next[index] = raw;
              setDraft(next);
            }}
          >
            {!modeOptions.some((option) => option.value === value) && <option value={`raw:${value}`}>Imported value {value}</option>}
            {modeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        )}
        {targetKind && (
          <select
            disabled={presentation.disabled}
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
            disabled={presentation.disabled}
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
          disabled={presentation.disabled}
          value={draft[index] ?? "0"}
          onChange={(event) => {
            const next = [...draft];
            next[index] = event.currentTarget.value;
            setDraft(next);
          }}
        />
        {fieldHelp && <small>{fieldHelp}</small>}
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
            This {targetIssue.targetLabel} {targetIssue.value} does not exist yet. Create it or choose an existing {targetIssue.targetLabel}.
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

type GuidedField = {
  index: number;
  internalName: string;
  label: string;
  help: string;
  preserved: boolean;
};

type GuidedSection = {
  title: string;
  eyebrow: string;
  fields: GuidedField[];
};

type ModeOption = {
  value: number;
  label: string;
};

function guidedSectionsForShape(shape: string, fields: GuidedField[], values: number[], opcode?: number): GuidedSection[] {
  const normalized = normalizeShape(shape);
  const sections = guidedSectionPlan(normalized, opcode);
  const placed = new Set<number>();
  const result: GuidedSection[] = [];
  for (const section of sections) {
    const sectionFields = fields.filter((field) => section.names.includes(normalizeField(field.internalName)));
    for (const field of sectionFields) placed.add(field.index);
    if (sectionFields.length > 0) result.push({ title: section.title, eyebrow: section.eyebrow, fields: sectionFields });
  }
  const remaining = fields.filter((field) => !placed.has(field.index) && !guidedFieldPresentation(shape, field.internalName, values, opcode).technicalOnly);
  if (remaining.length > 0) result.push({ title: "Additional Settings", eyebrow: "Imported Behavior", fields: remaining });
  return result;
}

function guidedSectionPlan(shape: string, opcode?: number) {
  if (shape.includes("branch") || ["choice", "force-branch", "percent-branch", "range-branch", "random-branch"].includes(shape)) {
    return [
      { title: "Condition", eyebrow: "When To Branch", names: ["testa", "testb", "percent", "condition", "expectedstate", "testselector", "signedtestvalue", "daylimit", "hourlimit", "pickedselector", "failurebehavior", "falsebehavior", "abilityorattribute", "adjustment", "attributeflag", "threshold", "quest"] },
      { title: "Result", eyebrow: "Where To Go", names: ["branchmode", "target", "slot", "falsetarget", "truetarget", "successtarget", "failuretarget", "successmacro", "failuremacro", "hastarget", "missingtarget"] }
    ];
  }
  if (shape === "teleport" || shape === "dungeon-move" || shape === "position-shift" || shape === "save-restore-position") {
    return [
      { title: "Destination", eyebrow: "Movement", names: ["levelorkeep", "xorkeep", "yorkeep", "level", "x", "y", "signedheading", "legacylevel", "xshift", "yshift", "randomize", "mode"] },
      { title: "Arrival Feedback", eyebrow: "Media", names: ["sound", "message"] }
    ];
  }
  if (shape.includes("battle")) {
    return [
      { title: "Battle", eyebrow: "Encounter", names: ["battlelow", "battlehigh", "cowardmacro", "fleebranch"] },
      { title: "Outcome And Feedback", eyebrow: "Result", names: ["sound", "message", "treasure", "revivepartyflag", "soundorrevivelossmacro"] }
    ];
  }
  if (shape.includes("item") || shape.includes("shop") || shape === "gold" || shape === "random-items") {
    return [
      { title: "Item Or Shop", eyebrow: "Economy", names: ["item", "itemlow", "itemhigh", "replacementitem", "shop", "stockdelta", "inflationdelta", "signedamount", "countorrandomlimit", "maxmatches", "mode", "chargedelta"] },
      { title: "Failure Behavior", eyebrow: "Branch", names: ["branchmode", "missingbehavior", "hastarget", "missingtarget", "failuremarker", "minimumcharges", "successtarget", "failuretarget"] }
    ];
  }
  if (shape.includes("message") || shape === "fumble" || shape === "damage-heal" || shape === "condition") {
    return [
      { title: "Effect", eyebrow: "Action", names: ["scope", "condition", "durationordelta", "multiplier", "low", "high", "message", "messagelow", "messagehigh"] },
      { title: "Sound", eyebrow: "Media", names: ["sound", "loworsound", "playsound"] }
    ];
  }
  if (shape.includes("monster") || shape === "spawn" || shape === "rout" || shape === "destroy-related") {
    return [
      { title: "Monster Targets", eyebrow: "Combat", names: ["targetclass", "monsterid", "monster", "monster1", "monster2", "monster3", "monster4", "monster5"] },
      { title: "Mutation", eyebrow: "Result", names: ["count", "countorrandomlimit", "replacementicon", "traitoroverride", "maxcount", "includetraitorside", "sound"] }
    ];
  }
  if (shape.includes("region") || shape.includes("tile") || shape.includes("render") || shape.includes("dark") || opcode === -23) {
    return [
      { title: "Map Target", eyebrow: "Map", names: ["level", "randomregion", "rect", "isdungeon", "targetlandlevel", "landlook", "singletrigger", "rangestartwithsign", "rangeend", "xordungeony", "yordungeonx"] },
      { title: "Map Change", eyebrow: "Result", names: ["percent", "battleloworkeep", "battlehighorkeep", "percentdelta", "shapemode", "isdark", "darkstateplusone", "stopifalready", "tilevalue"] }
    ];
  }
  return [
    { title: "Settings", eyebrow: "Action", names: fieldsForGenericSection(shape) }
  ];
}

function fieldsForGenericSection(_shape: string) {
  return ["param0", "param1", "param2", "param3", "param4", "mode", "value", "scope", "selector", "sourceset", "unused"];
}

function guidedFieldPresentation(shape: string, name: string, values: number[], opcode?: number) {
  const normalizedShape = normalizeShape(shape);
  const normalizedName = normalizeField(name);
  const branchMode = fieldValue(values, 2);
  if (normalizedShape === "force-branch" && normalizedName === "slot" && branchMode === 0) {
    return {
      label: "Result Slot",
      help: "Extra Action Point destinations start at the top of that action, so this imported slot value is preserved but not used by the normal authoring path.",
      disabled: true,
      technicalOnly: false
    };
  }
  if (normalizedName.includes("unused")) return { disabled: true, technicalOnly: true, help: "Preserved imported compatibility value." };
  if (normalizedShape === "force-branch" && normalizedName === "testb" && opcode === 46) {
    return { label: "Branch When", help: "Classic Realmz checks the quest flag, then branches when this condition matches." };
  }
  if (normalizedShape === "force-branch" && normalizedName === "testa" && opcode === 46) {
    return { label: "Quest To Check", help: "Quest flag tested by this branch." };
  }
  if (normalizedName === "branchmode") return { label: "Destination Type", help: "Controls what kind of record the target field points to." };
  if (normalizedName === "target") return { label: "Destination", help: "Where the script goes when this condition succeeds." };
  return {};
}

function guidedModeOptionsForField(shape: string, name: string, opcode?: number): ModeOption[] | null {
  const normalizedShape = normalizeShape(shape);
  const normalizedName = normalizeField(name);
  if (normalizedShape === "force-branch" && normalizedName === "testb" && opcode === 46) {
    return [
      { value: 0, label: "Quest is not set" },
      { value: 1, label: "Quest is set" },
      { value: 2, label: "Always branch" }
    ];
  }
  if ((normalizedShape === "force-branch" || normalizedShape === "percent-branch") && normalizedName === "branchmode") {
    return forceBranchDestinationOptions();
  }
  if ([
    "false-true-branch",
    "range-branch",
    "random-branch",
    "conditional-branch",
    "misc-conditional-branch",
    "item-branch",
    "item-charge-branch",
    "quest-value"
  ].includes(normalizedShape) && normalizedName === "branchmode") {
    return zeroBasedBranchDestinationOptions();
  }
  if (normalizedName === "isdungeon") {
    return [
      { value: 0, label: "Land map" },
      { value: 1, label: "Dungeon map" }
    ];
  }
  if (normalizedName === "darkstateplusone") {
    return [
      { value: 1, label: "Make light" },
      { value: 2, label: "Make dark" }
    ];
  }
  if (normalizedName === "shapemode") {
    return [
      { value: -1, label: "Keep current shape" },
      { value: 0, label: "Set coordinates" },
      { value: 1, label: "Offset rectangle" },
      { value: 2, label: "Use next settings row" }
    ];
  }
  if (normalizedName === "revivepartyflag") {
    return [
      { value: 0, label: "Victory and treasure" },
      { value: 5, label: "Victory only" },
      { value: 10, label: "Revive after loss" }
    ];
  }
  return null;
}

function guidedSummaryForEdcd(
  project: Project,
  catalog: LibraryCatalog | null | undefined,
  shape: string,
  opcode: number | undefined,
  rowId: number,
  values: number[],
  fieldNames: string[],
  importedSummary?: string
) {
  const normalized = normalizeShape(shape);
  if (normalized === "force-branch") {
    const condition = forceBranchConditionSummary(opcode, values[0] ?? 0, values[1] ?? 0);
    const destination = branchDestinationSummary(project, catalog, values[2] ?? 0, values[3] ?? 0, values[4] ?? 0, "force");
    return `${condition}, then ${destination}; otherwise continue.`;
  }
  if (normalized === "percent-branch") {
    const percent = values[0] ?? 0;
    const destination = branchDestinationSummary(project, catalog, values[2] ?? 0, values[3] ?? 0, values[4] ?? 0, "force");
    return `On a ${percent}% success roll, ${destination}; otherwise continue.`;
  }
  if (normalized === "teleport") {
    return `Move to ${mapLevelSummary(project, values[0] ?? -1)} at ${coordSummary(values[1])}, ${coordSummary(values[2])}${mediaTail(project, catalog, values[3] ?? 0, values[4] ?? 0)}.`;
  }
  if (normalized === "random-message") {
    return `${messageSummary(project, values[0] ?? 0)} through ${messageSummary(project, values[1] ?? values[0] ?? 0)}.`;
  }
  if (normalized.includes("battle")) {
    return `${battleRangeSummary(project, values[0] ?? 0, values[1] ?? 0)}${mediaTail(project, catalog, values[2] ?? 0, values[3] ?? 0)}.`;
  }
  if (normalized === "item-branch") {
    return `Check for ${itemIdSummary(values[0] ?? 0)}, then route using ${branchModeLabel(values[1] ?? 0, "zero")}.`;
  }
  if (normalized === "item-mutation") {
    return `Change ${itemIdSummary(values[0] ?? 0)} using mode ${values[2] ?? 0}.`;
  }
  if (normalized === "dark-level-state") {
    const state = values[0] === 1 ? "light" : values[0] === 2 ? "dark" : `state ${values[0] ?? 0}`;
    return `Set the current land level to ${state}.`;
  }
  if (opcode != null) {
    const summary = scriptActionSummary(project, catalog, { rawCode: opcode, id: rowId, parameters: valuesToTuple(values) }, "");
    if (summary) return summary;
  }
  if (importedSummary) return importedSummary;
  const preview = fieldNames
    .map((name, index) => `${humanizeFieldName(name)} ${values[index] ?? 0}`)
    .slice(0, 3)
    .join(", ");
  return preview || "";
}

function forceBranchConditionSummary(opcode: number | undefined, testA: number, testB: number) {
  if (opcode === 46) {
    if (testB === 0) return `If Quest ${testA} is not set`;
    if (testB === 1) return `If Quest ${testA} is set`;
    if (testB === 2) return `Always branch after checking Quest ${testA}`;
    return `If Quest ${testA} matches imported test ${testB}`;
  }
  return `If test ${testA} / ${testB} succeeds`;
}

function branchDestinationSummary(project: Project, catalog: LibraryCatalog | null | undefined, mode: number, target: number, slot: number, family: "force" | "zero") {
  const kind = family === "force" ? forceBranchTargetKind(mode) : zeroBasedBranchTargetKind(mode);
  if (!kind) return branchModeLabel(mode, family);
  const option = edcdTargetOptions(project, kind, catalog).find((candidate) => candidate.value === Math.abs(target));
  const label = option?.label ?? `${edcdTargetLabel(kind)} ${target}`;
  if (kind === "macro") return `run ${label}`;
  if (slot > 0) return `go to ${label}, result slot ${slot}`;
  return `go to ${label}`;
}

function branchModeLabel(mode: number, family: "force" | "zero") {
  const options = family === "force" ? forceBranchDestinationOptions() : zeroBasedBranchDestinationOptions();
  return options.find((option) => option.value === mode)?.label ?? `imported branch mode ${mode}`;
}

function forceBranchTargetKind(mode: number): EdcdTargetKind | null {
  if (mode === 0) return "macro";
  if (mode === 1) return "simpleEncounter";
  if (mode === 2) return "complexEncounter";
  return null;
}

function zeroBasedBranchTargetKind(mode: number): EdcdTargetKind | null {
  if (mode === 0) return "macro";
  if (mode === 1) return "simpleEncounter";
  if (mode === 2) return "complexEncounter";
  return null;
}

function forceBranchDestinationOptions(): ModeOption[] {
  return [
    { value: -1, label: "Stop / drop out" },
    { value: 0, label: "Extra Action Point" },
    { value: 1, label: "Simple Encounter Result" },
    { value: 2, label: "Complex Encounter Result" },
    { value: 3, label: "Exit script and keep actions" }
  ];
}

function zeroBasedBranchDestinationOptions(): ModeOption[] {
  return [
    { value: 0, label: "Extra Action Point" },
    { value: 1, label: "Simple Encounter Result" },
    { value: 2, label: "Complex Encounter Result" },
    { value: 3, label: "Continue / imported mode 3" }
  ];
}

function mediaTail(project: Project, catalog: LibraryCatalog | null | undefined, sound: number, message: number) {
  const parts = [];
  if (sound) parts.push(soundSummary(project, catalog, sound));
  if (message) parts.push(messageSummary(project, message));
  return parts.length ? ` with ${parts.join(" and ")}` : "";
}

function soundSummary(project: Project, catalog: LibraryCatalog | null | undefined, value: number) {
  const id = Math.abs(value);
  const option = edcdTargetOptions(project, "sound", catalog).find((candidate) => candidate.value === id);
  const behavior = value < 0 ? "negative reference" : "sound";
  return option ? `${behavior} ${option.label}` : `${behavior} ${id}`;
}

function messageSummary(project: Project, value: number) {
  const id = Math.abs(value);
  if (!id) return "No message";
  const message = project.messages.find((record) => record.id === id);
  return message?.text ? `String ${id}: "${clipText(message.text, 42)}"` : `String ${id}`;
}

function battleRangeSummary(project: Project, low: number, high: number) {
  const start = Math.abs(low);
  const end = Math.abs(high || low);
  const battle = (id: number) => project.battles.find((record) => record.id === id);
  const startLabel = battle(start) ? `Battle ${start}` : `battle ${start}`;
  const endLabel = battle(end) ? `Battle ${end}` : `battle ${end}`;
  return start === end ? `Start ${startLabel}` : `Start ${startLabel} through ${endLabel}`;
}

function mapLevelSummary(project: Project, value: number) {
  if (value < 0) return "current level";
  const map = project.maps.find((candidate) => candidate.index === value);
  return map?.name ?? `Land level ${value}`;
}

function coordSummary(value: number | undefined) {
  if (value == null || value < 0) return "current";
  return String(value);
}

function itemIdSummary(value: number) {
  return value ? `item ${value}` : "no item";
}

function valuesToTuple(values: number[]): readonly [number, number, number, number, number] {
  return [0, 1, 2, 3, 4].map((index) => Number(values[index] ?? 0)) as [number, number, number, number, number];
}

function fieldValue(values: number[], index: number) {
  return Number(values[index] ?? 0);
}

function normalizeShape(shape: string) {
  return shape.toLowerCase().replace(/\s*\/\s*/g, "-").replace(/\s+/g, "-");
}

function normalizeField(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clipText(value: string, max: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, Math.max(0, max - 1))}...` : clean;
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
            <FieldRow label="Settings Row" value={rowId} />
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
