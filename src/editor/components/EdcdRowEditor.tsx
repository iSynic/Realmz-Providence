import { useEffect, useMemo, useState } from "react";
import { Eye, Save, Trash2 } from "lucide-react";
import { LibraryCatalog, MapCoordinateTarget, Project, ProjectCommand, SelectedEntity } from "../types";
import { CollapsibleSection, EmptyState, FieldRow, PanelSection, type ReferencePickerOption } from "../ui";
import { itemReferenceOptions, type ItemReferenceOption } from "../itemReferences";
import { createRecordTypeForEdcdTarget, edcdFieldTargetKind, edcdTargetLabel, edcdTargetOptions, missingEdcdTargetReferences, type EdcdTargetKind, type EdcdTargetOption } from "../edcdTargets";
import { type OpcodeParameterLabel } from "../opcodeCrosswalk";
import { CHOICE_BRANCH_MODES, choiceBranchModeLabel, choiceBranchTargetKind, choiceContinueLabel, choicePromptStorageFromOptionLabels, parseChoicePromptValue, serializeChoicePromptValue } from "../choiceDialogs";
import { scriptActionSummary } from "../panels/scripts/scriptActionCatalog";
import { selectEntityFromId } from "../utils";
import { EdcdReferenceTargetField, numericReferenceQuery } from "./EdcdReferenceTargetField";

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

type EdcdRowEditorPresentation = "inventory" | "selected-step";

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
  onOpenMapCoordinate,
  onStepOpcodeChange,
  onDraftValuesChange,
  onSecondaryDraftValuesChange,
  onApplyCommand,
  showActionButtons = true,
  presentation = "inventory"
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
  onOpenMapCoordinate?: (target: MapCoordinateTarget) => void;
  onStepOpcodeChange?: (rawCode: number) => void;
  onDraftValuesChange?: (values: number[], dirty: boolean) => void;
  onSecondaryDraftValuesChange?: (values: number[], dirty: boolean) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  showActionButtons?: boolean;
  presentation?: EdcdRowEditorPresentation;
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
  const opcode = edcdUsage?.opcode ?? fallbackOpcode;
  const rowExists = Boolean(row);
  const initialDraftKey = `${rowId ?? "none"}:${shape ?? "none"}:${opcode ?? "none"}:${rowExists ? "stored" : "missing"}:${initialValues.join("|")}`;
  const [draft, setDraft] = useState(initialValues.map(String));
  const itemOptions = useMemo(() => itemReferenceOptions(project, catalog), [project, catalog]);

  useEffect(() => {
    setDraft(initialValues.map(String));
  }, [initialDraftKey]);

  const numericDraft = useMemo(() => draft.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }), [draft]);
  const changed = numericDraft.some((value, index) => value !== initialValues[index]);
  const needsSelectedStepApply = !rowExists || changed;
  const canApplySettings = Boolean(onApplyCommand) && (!rowExists || changed);
  const settingsActionLabel = rowExists ? "Apply Settings" : "Create Settings";
  const settingsCommandLabel = rowExists ? `Update settings ${rowId}` : `Create settings ${rowId}`;

  useEffect(() => {
    if (rowId == null || !shape) return;
    onDraftValuesChange?.(numericDraft, needsSelectedStepApply);
  }, [needsSelectedStepApply, numericDraft, onDraftValuesChange, rowId, shape]);

  if (rowId == null || !shape) return null;
  const shapeId = shape;
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
  const mapCoordinateTarget = mapCoordinateTargetForEdcd(shapeId, numericDraft);
  const mapCoordinateMap = mapCoordinateTarget
    ? project.maps.find((candidate) => candidate.levelType === mapCoordinateTarget.levelType && candidate.index === mapCoordinateTarget.levelIndex) ?? null
    : null;
  const showGuidedSummary = Boolean(guidedSummary && presentation !== "selected-step");

  if (shapeId.toLowerCase() === "choice" && Math.abs(opcode ?? 0) === 3) {
    return (
      <ChoiceDialogEditor
        project={project}
        catalog={catalog}
        rowId={rowId}
        rowExists={Boolean(row)}
        initialValues={initialValues}
        targetIssues={targetIssues}
        selectedSlotLabel={selectedSlotLabel}
        onSelectEntity={onSelectEntity}
        onOpenText={onOpenText}
        onDraftValuesChange={onDraftValuesChange}
        onApplyCommand={onApplyCommand}
        showActionButtons={showActionButtons}
        presentation={presentation}
      />
    );
  }

  const actionButtons = (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        disabled={!canApplySettings}
        onClick={() => onApplyCommand?.({
          kind: "updateEdcdRow",
          label: settingsCommandLabel,
          rowId,
          values: numericDraft
        })}
      >
        <Save size={12} /> {settingsActionLabel}
      </button>
      {rowExists && (
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
  );
  const editorBody = (
      <div className={`edcd-row-editor${presentation === "selected-step" ? " selected-step-edcd-editor" : ""}`}>
        {!row && (
          <EmptyState
            compact
            title={presentation === "selected-step" ? "Step fields are ready to apply" : "Settings not created yet"}
            body={presentation === "selected-step"
              ? `Choose values below, then Apply Step to store them for this ${selectedSlotLabel}.`
              : `This ${selectedSlotLabel} will use settings ${rowId}. Create settings to store the guided values below.`}
          />
        )}
        {showGuidedSummary && (
          <div className="guided-edcd-summary">
            <span>Behavior</span>
            <strong>{guidedSummary}</strong>
          </div>
        )}
        {guidedSections.length > 0 ? (
          <div className="guided-edcd-sections">
            {guidedSections.map((section) => renderGuidedSection(section))}
          </div>
        ) : (
          <EmptyState compact title="No editable settings" body="These imported settings do not have normal editable fields." />
        )}
        {edcdUsage?.secondaryRowId != null && (
          <div className="edcd-secondary-row">
            <header className="edcd-secondary-row-header">
              <span>Secondary Settings {edcdUsage.secondaryRowId}</span>
              <strong>Random Area Bounds</strong>
            </header>
            <EdcdRowEditor
              project={project}
              catalog={catalog}
              edcdUsage={{
                rowId: edcdUsage.secondaryRowId,
                shape: edcdUsage.secondaryShape ?? "random-region-shape-details",
                opcode,
                fields: edcdUsage.secondaryFields
              }}
              fallbackRowId={edcdUsage.secondaryRowId}
              fallbackShape={edcdUsage.secondaryShape ?? "random-region-shape-details"}
              fallbackFieldNames={edcdUsage.secondaryFields?.map((field, index) => field.name ?? `param${index}`)}
              fallbackInitialValues={edcdUsage.secondaryFields?.map((field) => Number(field.value ?? 0))}
              fallbackOpcode={opcode}
              selectedSlotLabel={`${selectedSlotLabel} secondary shape`}
              onSelectEntity={onSelectEntity}
              onOpenText={onOpenText}
              onOpenMapCoordinate={onOpenMapCoordinate}
              onDraftValuesChange={onSecondaryDraftValuesChange}
              onApplyCommand={onApplyCommand}
              showActionButtons={showActionButtons && presentation !== "selected-step"}
              presentation="selected-step"
            />
          </div>
        )}
        {edcdUsage?.diagnostics?.map((diagnostic) => (
          <p key={diagnostic} className="field-warning">{diagnostic}</p>
        ))}
        <CollapsibleSection title="Technical Details" eyebrow="advanced" density="compact" storageKey={`scripts.parameterRow.${rowId}.advanced.open`} defaultOpen={false}>
          <div className="realmz-raw-preview">
            {edcdUsage?.summary && <FieldRow label="Summary" value={edcdUsage.summary} />}
            <FieldRow label="Action Settings Row" value={rowId} />
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
  );

  if (presentation === "selected-step") {
    return (
      <>
        {showActionButtons && (
          <div className="edcd-selected-step-action-strip">
            {actionButtons}
          </div>
        )}
        <div className="realmz-current-step-authoring-subpane">
          {editorBody}
        </div>
      </>
    );
  }

  return (
    <PanelSection
      title={settingsTitleForShape(shapeId)}
      eyebrow={`settings ${rowId}`}
      density="compact"
      actions={actionButtons}
    >
      {editorBody}
    </PanelSection>
  );

  function setDraftValue(index: number, value: number | string) {
    const next = [...draft];
    next[index] = String(value);
    setDraft(next);
  }

  function renderGuidedSection(section: GuidedSection) {
    const normalizedShape = normalizeShape(shapeId);
    const normalizedTitle = section.title.toLowerCase();
    if (normalizedShape === "item-branch" && normalizedTitle === "result") {
      return renderItemBranchResultSection(section);
    }
    if ((normalizedShape === "teleport" || normalizedShape === "dungeon-move") && normalizedTitle === "destination") {
      return renderTeleportDestinationSection(section);
    }
    return (
      <section key={section.title} className="guided-edcd-section">
        <header>
          <span>{section.eyebrow}</span>
          <h4>{section.title}</h4>
        </header>
        <div className="edcd-field-grid">
          {section.fields.map((field) => renderParameterField(field))}
        </div>
      </section>
    );
  }

  function renderItemBranchResultSection(section: GuidedSection) {
    const fieldByName = (name: string) => section.fields.find((field) => normalizeField(field.internalName) === name);
    const possessedMode = fieldByName("branchmode");
    const possessedTarget = fieldByName("hastarget");
    const missingMode = fieldByName("missingbehavior");
    const missingTarget = fieldByName("missingtarget");
    const groupedIndexes = new Set(
      [possessedMode, possessedTarget, missingMode, missingTarget]
        .filter((field): field is GuidedField => Boolean(field))
        .map((field) => field.index)
    );
    const additionalFields = section.fields.filter((field) => !groupedIndexes.has(field.index));
    return (
      <section key={section.title} className="guided-edcd-section edcd-item-branch-result-section">
        <header>
          <span>{section.eyebrow}</span>
          <h4>{section.title}</h4>
        </header>
        <div className="edcd-branch-result-grid">
          <div className="edcd-branch-result-row">
            {possessedMode && renderParameterField(possessedMode)}
            {possessedTarget && renderParameterField(possessedTarget)}
          </div>
          <div className="edcd-branch-result-row">
            {missingMode && renderParameterField(missingMode)}
            {missingTarget && renderParameterField(missingTarget)}
          </div>
          {additionalFields.length > 0 && (
            <div className="edcd-field-grid">
              {additionalFields.map((field) => renderParameterField(field))}
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderTeleportDestinationSection(section: GuidedSection) {
    const normalizedShape = normalizeShape(shapeId);
    const destinationLevelType = normalizedShape === "dungeon-move" ? "dungeon" : "land";
    const levelField = section.fields.find((field) => ["levelorkeep", "level", "legacylevel"].includes(normalizeField(field.internalName)));
    const xField = section.fields.find((field) => ["xorkeep", "x"].includes(normalizeField(field.internalName)));
    const yField = section.fields.find((field) => ["yorkeep", "y"].includes(normalizeField(field.internalName)));
    const levelValue = levelField ? Number(draft[levelField.index] ?? -1) : -1;
    const mapOptions = project.maps
      .filter((map) => map.levelType === destinationLevelType)
      .slice()
      .sort((a, b) => a.index - b.index);
    const hasLevelValue = levelValue === -1 || mapOptions.some((map) => map.index === levelValue);
    const jumpTarget = mapCoordinateTargetForEdcd(shapeId, numericDraft);
    const jumpMap = jumpTarget
      ? project.maps.find((candidate) => candidate.levelType === jumpTarget.levelType && candidate.index === jumpTarget.levelIndex) ?? null
      : null;
    const jumpTitle = jumpTarget
      ? jumpMap
        ? `Open ${jumpMap.name} at ${jumpTarget.x}, ${jumpTarget.y} on Maps.`
        : `No ${jumpTarget.levelType} level ${jumpTarget.levelIndex} exists for ${jumpTarget.x}, ${jumpTarget.y}.`
      : "Choose a concrete level, X, and Y to preview this destination on Maps.";
    return (
      <section key={section.title} className="guided-edcd-section">
        <header>
          <span>{section.eyebrow}</span>
          <h4>{section.title}</h4>
        </header>
        <div className="edcd-teleport-destination-grid">
          {levelField && (
            <label className={fieldClassName(levelField, false, null, guidedFieldPresentation(shapeId, levelField.internalName, numericDraft, opcode))}>
              <span title={levelField.internalName}>{destinationLevelType === "dungeon" ? "Dungeon Level" : "Land Level"}</span>
              <select
                disabled={guidedFieldPresentation(shapeId, levelField.internalName, numericDraft, opcode).disabled}
                value={hasLevelValue ? String(levelValue) : `raw:${levelValue}`}
                onChange={(event) => {
                  const raw = event.currentTarget.value;
                  if (raw.startsWith("raw:")) return;
                  setDraftValue(levelField.index, Number(raw));
                }}
              >
                {!hasLevelValue && <option value={`raw:${levelValue}`}>Imported level {levelValue}</option>}
                <option value="-1">-1 = Current {destinationLevelType === "dungeon" ? "Dungeon Level" : "Land Level"}</option>
                {mapOptions.map((map) => (
                  <option key={map.id} value={map.index}>{map.name}</option>
                ))}
              </select>
            </label>
          )}
          {xField && (
            <CompactNumberField
              field={xField}
              label="X Coordinate"
              value={draft[xField.index] ?? "0"}
              disabled={guidedFieldPresentation(shapeId, xField.internalName, numericDraft, opcode).disabled}
              onChange={(value) => setDraftValue(xField.index, value)}
            />
          )}
          {yField && (
            <CompactNumberField
              field={yField}
              label="Y Coordinate"
              value={draft[yField.index] ?? "0"}
              disabled={guidedFieldPresentation(shapeId, yField.internalName, numericDraft, opcode).disabled}
              onChange={(value) => setDraftValue(yField.index, value)}
            />
          )}
          <button
            type="button"
            className="btn btn-secondary btn-xs icon-only edcd-map-jump-button edcd-destination-jump"
            title={jumpTitle}
            aria-label={jumpTitle}
            disabled={!jumpTarget || !jumpMap || !onOpenMapCoordinate}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!jumpTarget || !jumpMap) return;
              onOpenMapCoordinate?.(jumpTarget);
            }}
          >
            <Eye size={12} />
          </button>
        </div>
      </section>
    );
  }

  function fieldClassName(
    field: { index: number; internalName: string },
    isItemField: boolean,
    targetIssue: ReturnType<typeof missingEdcdTargetReferences>[number] | undefined | null,
    presentation: ReturnType<typeof guidedFieldPresentation>
  ) {
    return `${isItemField ? "edcd-item-field" : ""}${targetIssue ? " has-warning" : ""}${presentation.disabled ? " is-disabled" : ""}`;
  }

  function renderParameterField(field: { index: number; internalName: string; label: string; help: string; preserved: boolean }) {
    const { index, internalName, label, help, preserved } = field;
    const value = Number(draft[index] ?? "0");
    const presentation = guidedFieldPresentation(shapeId, internalName, numericDraft, opcode);
    const modeOptions = guidedModeOptionsForField(shapeId, internalName, opcode);
    const isRandomRegionLevel = randomRegionLevelField(shapeId, internalName);
    const isRandomRegionChance = randomRegionChanceField(shapeId, internalName);
    const detectedTargetKind = !preserved && !modeOptions && !isRandomRegionLevel && !isRandomRegionChance
      ? edcdFieldTargetKind(shapeId, internalName, fieldNames, numericDraft, opcode)
      : null;
    const isItemField = !preserved && (detectedTargetKind === "item" || (!detectedTargetKind && edcdFieldLooksLikeItem(shapeId, internalName, opcode)));
    const targetKind = isItemField ? null : detectedTargetKind;
    const targetOptions = targetKind ? edcdTargetOptions(project, targetKind, catalog) : [];
    const selectedTarget = targetOptions.find((option) => option.value === value);
    const createRecordType = createRecordTypeForEdcdTarget(targetKind);
    const targetLabel = targetKind ? edcdTargetLabel(targetKind) : "";
    const targetIssue = targetIssues.find((issue) => issue.index === index);
    const rawFieldHelp = presentation.suppressHelp ? presentation.help ?? "" : [presentation.help, help].filter(Boolean).join(" ");
    const fieldHelp = authorFieldHelp(rawFieldHelp, presentation.label ?? label);
    const mapJumpTarget = onOpenMapCoordinate && isCoordinateJumpField(shapeId, internalName) ? mapCoordinateTarget : null;
    const mapJumpTitle = mapJumpTarget
      ? mapCoordinateMap
        ? `Open ${mapCoordinateMap.name} at ${mapJumpTarget.x}, ${mapJumpTarget.y} on Maps.`
        : `No ${mapJumpTarget.levelType} level ${mapJumpTarget.levelIndex} exists for ${mapJumpTarget.x}, ${mapJumpTarget.y}.`
      : "";
    const useSearchTarget = targetKind === "message" || targetKind === "sound";
    return (
      <label key={`${rowId}-${internalName}-${index}`} className={fieldClassName(field, Boolean(isItemField || targetKind || isRandomRegionLevel), targetIssue, presentation)}>
        <span className="edcd-field-label-row" title={internalName}>
          <span>{presentation.label ?? label}</span>
          {mapJumpTarget && (
            <button
              type="button"
              className="btn btn-secondary btn-xs icon-only edcd-map-jump-button"
              title={mapJumpTitle}
              aria-label={mapJumpTitle}
              disabled={!mapCoordinateMap}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!mapCoordinateMap) return;
                onOpenMapCoordinate?.(mapJumpTarget);
              }}
            >
              <Eye size={12} />
            </button>
          )}
        </span>
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
        {isRandomRegionLevel && (
          <RandomRegionLevelField
            project={project}
            value={value}
            opcode={opcode}
            disabled={presentation.disabled}
            onChange={(levelType, nextValue) => {
              setDraftValue(index, nextValue);
              onStepOpcodeChange?.(levelType === "dungeon" ? -23 : 23);
            }}
            onOpen={(entity) => onSelectEntity?.(entity)}
          />
        )}
        {targetKind && !useSearchTarget && (
          <EdcdSelectTargetField
            project={project}
            catalog={catalog}
            label={targetLabel}
            targetKind={targetKind}
            value={value}
            disabled={presentation.disabled}
            options={targetOptions}
            onChange={(nextValue) => setDraftValue(index, nextValue)}
            onOpen={(entity) => onSelectEntity?.(entity)}
          />
        )}
        {isRandomRegionChance && (
          <RandomRegionChanceField
            value={draft[index] ?? "0"}
            disabled={presentation.disabled}
            onChange={(nextValue) => setDraftValue(index, nextValue)}
          />
        )}
        {isItemField && (
          <EdcdItemTargetField
            value={value}
            disabled={presentation.disabled}
            options={itemOptions}
            onChange={(nextValue) => setDraftValue(index, nextValue)}
            onOpen={(entity) => onSelectEntity?.(entity)}
          />
        )}
        {!modeOptions && !targetKind && !isItemField && !isRandomRegionLevel && !isRandomRegionChance && (
          <input
            type="number"
            disabled={presentation.disabled}
            value={draft[index] ?? "0"}
            onChange={(event) => setDraftValue(index, event.currentTarget.value)}
          />
        )}
        {useSearchTarget && targetKind && (
          <EdcdSearchTargetField
            label={targetKind === "message" ? "String" : targetLabel}
            targetKind={targetKind}
            value={value}
            disabled={presentation.disabled}
            options={targetOptions}
            onChange={(nextValue) => setDraftValue(index, nextValue)}
            onOpen={(entity) => onSelectEntity?.(entity)}
          />
        )}
        {fieldHelp && !targetKind && !isItemField && !isRandomRegionLevel && !isRandomRegionChance && <small>{fieldHelp}</small>}
        {targetIssue && (
          <p className="field-warning">
            This {targetIssue.targetLabel} {targetIssue.value} does not exist yet. Create it or choose an existing {targetIssue.targetLabel}.
          </p>
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

function authorFieldHelp(text: string, label: string) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const normalizedText = trimmed.toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  const normalizedLabel = label.trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!normalizedLabel) return trimmed;
  if (normalizedText === normalizedLabel) return "";
  if (normalizedText === `${normalizedLabel} to check for`) return "";
  if (normalizedText === `${normalizedLabel} to alter`) return "";
  if (normalizedText === `${normalizedLabel} to goto`) return "";
  if (normalizedText === `select ${normalizedLabel}`) return "";
  if (normalizedText === `select the ${normalizedLabel}`) return "";
  if (normalizedText === `select a ${normalizedLabel}`) return "";
  return trimmed;
}

function CompactNumberField({
  field,
  label,
  value,
  disabled,
  onChange
}: {
  field: { internalName: string };
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`edcd-compact-number-field${disabled ? " is-disabled" : ""}`}>
      <span title={field.internalName}>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        pattern="-?[0-9]*"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}

function RandomRegionLevelField({
  project,
  value,
  opcode,
  disabled,
  onChange,
  onOpen
}: {
  project: Project;
  value: number;
  opcode?: number;
  disabled?: boolean;
  onChange: (levelType: "land" | "dungeon", value: number) => void;
  onOpen?: (entity: SelectedEntity) => void;
}) {
  const currentLevelType = opcode === -23 ? "dungeon" : "land";
  const options = (project.maps ?? [])
    .filter((map) => map.levelType === "land" || map.levelType === "dungeon")
    .slice()
    .sort((a, b) => mapLevelTypeSort(a.levelType) - mapLevelTypeSort(b.levelType) || a.index - b.index)
    .map((map) => ({
      key: `${map.levelType}:${map.index}`,
      levelType: map.levelType as "land" | "dungeon",
      value: map.index,
      label: `${map.levelType === "dungeon" ? "Dungeon" : "Land"} Level ${map.index}`,
      detail: `${map.name}, ${map.width} x ${map.height}`,
      entity: selectEntityFromId(`map:${map.id}`)
    }));
  const selected = options.find((option) => option.levelType === currentLevelType && option.value === value) ?? null;
  const selectValue = selected ? selected.key : `raw:${currentLevelType}:${value}`;
  return (
    <div className="edcd-select-target-field edcd-random-region-level-field">
      <div className={selected?.entity && onOpen ? "edcd-target-select-row with-open-action" : "edcd-target-select-row"}>
        <select
          disabled={disabled}
          value={selectValue}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            if (raw.startsWith("raw:")) return;
            const option = options.find((candidate) => candidate.key === raw);
            if (!option) return;
            onChange(option.levelType, option.value);
          }}
        >
          {!selected && (
            <option value={selectValue}>
              Missing {currentLevelType === "dungeon" ? "Dungeon" : "Land"} Level {value}
            </option>
          )}
          {options.map((option) => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
        {selected?.entity && onOpen && (
          <button
            type="button"
            className="btn btn-secondary btn-xs icon-only"
            title={`Open ${selected.label}`}
            aria-label={`Open ${selected.label}`}
            disabled={disabled}
            onClick={(event) => {
              event.preventDefault();
              onOpen(selected.entity);
            }}
          >
            <Eye size={12} />
          </button>
        )}
      </div>
      <small className={`edcd-target-inline-detail${selected ? "" : " missing"}`}>
        {selected?.detail ?? `No ${currentLevelType} level ${value} exists yet.`}
      </small>
    </div>
  );
}

function RandomRegionChanceField({
  value,
  disabled,
  onChange
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: number | string) => void;
}) {
  const raw = Number(value);
  const safeRaw = Number.isFinite(raw) ? raw : 0;
  const mode = safeRaw === -1 ? "invisible" : safeRaw > 0 ? "percent" : "none";
  const [percentText, setPercentText] = useState(mode === "percent" ? formatPercentFromTenThousand(safeRaw) : "");

  useEffect(() => {
    setPercentText(mode === "percent" ? formatPercentFromTenThousand(safeRaw) : "");
  }, [mode, safeRaw]);

  return (
    <div className="edcd-random-chance-field">
      <select
        disabled={disabled}
        value={mode}
        onChange={(event) => {
          const nextMode = event.currentTarget.value;
          if (nextMode === "invisible") {
            onChange(-1);
            return;
          }
          if (nextMode === "none") {
            onChange(0);
            return;
          }
          const nextRaw = safeRaw > 0 ? safeRaw : 100;
          setPercentText(formatPercentFromTenThousand(nextRaw));
          onChange(nextRaw);
        }}
      >
        <option value="none">No random encounters</option>
        <option value="percent">Percent chance</option>
        <option value="invisible">Invisible encounter (-1)</option>
      </select>
      {mode === "percent" && (
        <label className="edcd-random-chance-percent">
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={percentText}
            onChange={(event) => {
              const text = event.currentTarget.value;
              setPercentText(text);
              const parsed = Number(text);
              if (!Number.isFinite(parsed)) return;
              const clamped = Math.min(100, Math.max(0, parsed));
              onChange(Math.round(clamped * 100));
            }}
          />
          <span>%</span>
        </label>
      )}
      <span className="visually-hidden">{randomRegionChanceDescription(safeRaw)}</span>
    </div>
  );
}

function randomRegionLevelField(shape: string, name: string) {
  return normalizeShape(shape) === "random-region-mutation" && normalizeField(name) === "level";
}

function randomRegionChanceField(shape: string, name: string) {
  return normalizeShape(shape) === "random-region-mutation" && normalizeField(name) === "percent";
}

function formatPercentFromTenThousand(raw: number) {
  const percent = raw / 100;
  return Number.isInteger(percent)
    ? String(percent)
    : percent.toFixed(2).replace(/0+$/g, "").replace(/\.$/, "");
}

function randomRegionChanceDescription(raw: number) {
  if (raw === -1) return "Uses Realmz's invisible encounter sentinel.";
  if (raw <= 0) return "0 in 10,000: no random encounters.";
  return `${raw} in 10,000 (${formatPercentFromTenThousand(raw)}%).`;
}

function mapLevelTypeSort(levelType: string) {
  return levelType === "land" ? 0 : 1;
}

function EdcdItemTargetField({
  value,
  disabled,
  options,
  onChange,
  onOpen
}: {
  value: number;
  disabled?: boolean;
  options: ItemReferenceOption[];
  onChange: (value: number) => void;
  onOpen?: (entity: SelectedEntity) => void;
}) {
  const selected = options.find((option) => option.value === value) ?? null;
  const pickerOptions = useMemo(() => options.map((option): ReferencePickerOption<number> => ({
    key: option.key,
    value: option.value,
    label: option.label,
    detail: edcdSearchResultDetail(option.detail, option.sourceState),
    searchText: [option.value, option.label, option.detail, option.summary, option.sourceState].filter(Boolean).join(" "),
    title: edcdSearchResultDetail(option.detail, option.sourceState)
  })), [options]);
  const selectedLabel = selected?.label ?? (value ? `Item ${value}` : "No item selected");
  const selectedDetail = selected
    ? [selected.detail, selected.sourceState].filter(Boolean).join(" | ")
    : value
      ? "Raw Realmz item ID; no decoded project usage yet."
      : "";
  const selectedEntity = selected ? selectEntityFromId(`item:${selected.value}`) : null;
  return (
    <EdcdReferenceTargetField
      ariaLabel="Search item"
      placeholder="Search item # or name..."
      options={pickerOptions}
      value={value}
      current={{
        label: selectedLabel,
        detail: selectedDetail,
        state: selected ? "resolved" : value === 0 ? "empty" : "unresolved"
      }}
      disabled={disabled}
      rawOptionForQuery={(query) => {
        const queryNumber = numericReferenceQuery(query);
        if (queryNumber == null || options.some((option) => option.value === queryNumber)) return null;
        return {
          key: `raw:item:${queryNumber}`,
          value: queryNumber,
          label: `Item ${queryNumber}`,
          detail: "Raw Realmz item ID | No decoded item record",
          searchText: `${queryNumber} item raw realmz no decoded record`
        };
      }}
      resultNoun="item"
      resultNounPlural="items"
      emptyTitle="No matching items"
      emptyBody="Try an item name, numeric ID, category, source, or use."
      selectedEntity={selectedEntity}
      openLabel={`Open ${selectedLabel}`}
      clearLabel="Clear item"
      onChange={onChange}
      onOpen={onOpen}
    />
  );
}

function EdcdSearchTargetField({
  label,
  targetKind,
  value,
  disabled,
  options,
  onChange,
  onOpen
}: {
  label: string;
  targetKind: EdcdTargetKind;
  value: number;
  disabled?: boolean;
  options: EdcdTargetOption[];
  onChange: (value: number) => void;
  onOpen?: (entity: SelectedEntity) => void;
}) {
  const resolvedValue = targetKind === "message" || targetKind === "sound" ? Math.abs(value) : value;
  const selected = options.find((option) => option.value === resolvedValue) ?? null;
  const pickerOptions = useMemo(() => options.map((option): ReferencePickerOption<number> => ({
    key: option.key,
    value: option.value,
    label: option.label,
    detail: option.detail,
    searchText: [
      option.value,
      targetKind === "message" ? -Math.abs(option.value) : null,
      option.label,
      option.detail
    ].filter((part) => part != null && part !== "").join(" "),
    title: option.detail
  })), [options, targetKind]);
  const selectedLabel = selected?.label ?? (value ? `${targetKind === "message" ? "String" : label} ${Math.abs(value)}` : `No ${label.toLowerCase()} selected`);
  const selectedDetail = edcdCompactTargetDetail(targetKind, selected, value, label);
  return (
    <EdcdReferenceTargetField
      ariaLabel={`Search ${label}`}
      placeholder={targetKind === "message" ? "Search string # or text..." : "Search sound # or name..."}
      options={pickerOptions}
      value={value}
      selectedValue={resolvedValue}
      current={{
        label: selectedLabel,
        detail: selectedDetail,
        state: selected ? "resolved" : value === 0 ? "empty" : "unresolved"
      }}
      disabled={disabled}
      rawOptionForQuery={(query) => {
        const queryNumber = numericReferenceQuery(query);
        if (queryNumber == null) return null;
        const rawValue = targetKind === "sound" ? queryNumber : Math.abs(queryNumber);
        if (options.some((option) => option.value === rawValue)) return null;
        return {
          key: `raw:${targetKind}:${queryNumber}`,
          value: rawValue,
          label: `${targetKind === "message" ? "String" : label} ${Math.abs(queryNumber)}`,
          detail: targetKind === "message" ? "No string record exists yet." : "Raw sound reference.",
          searchText: `${queryNumber} ${Math.abs(queryNumber)} ${targetKind} ${label} raw`
        };
      }}
      resultNoun={targetKind === "message" ? "string" : "sound"}
      resultNounPlural={targetKind === "message" ? "strings" : "sounds"}
      emptyTitle={`No matching ${targetKind === "message" ? "strings" : "sounds"}`}
      emptyBody={`Try a ${targetKind === "message" ? "string" : "sound"} name, numeric ID, or detail.`}
      selectedEntity={selected?.entity}
      openLabel={`Open ${selected?.label ?? selectedLabel}`}
      clearLabel={`Clear ${label}`}
      onChange={onChange}
      onOpen={onOpen}
    />
  );
}

function EdcdSelectTargetField({
  project,
  catalog,
  label,
  targetKind,
  value,
  disabled,
  options,
  onChange,
  onOpen
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  label: string;
  targetKind: EdcdTargetKind;
  value: number;
  disabled?: boolean;
  options: EdcdTargetOption[];
  onChange: (value: number) => void;
  onOpen?: (entity: SelectedEntity) => void;
}) {
  const selected = options.find((option) => option.value === value) ?? null;
  const selectValue = selected ? String(value) : `raw:${value}`;
  const displayLabel = sentenceCase(label);
  const isMacroTarget = targetKind === "macro";
  const useSearchTarget = edcdTargetKindUsesSearch(targetKind);
  const hasOpenTarget = Boolean(selected?.entity && onOpen);
  const targetDetail = selected
    ? edcdCompactTargetDetail(targetKind, selected, value, label)
    : value > 0
      ? `No ${label} ${value} exists yet.`
      : "";
  const selectedLabel = selected?.label ?? (value > 0 ? `Missing ${displayLabel} ${value}` : `No ${label.toLowerCase()} selected`);
  const selectedDetail = selected?.detail ?? (value > 0 ? `No ${label} ${value} exists yet.` : "");
  if (useSearchTarget) {
    const pickerOptions = options.map((option): ReferencePickerOption<number> => ({
      key: option.key,
      value: option.value,
      label: option.label,
      detail: option.detail,
      searchText: [option.value, option.label, option.detail].filter(Boolean).join(" "),
      title: option.detail
    }));
    return (
      <EdcdReferenceTargetField
        ariaLabel={`Search ${label}`}
        placeholder={`Search ${label.toLowerCase()}...`}
        options={pickerOptions}
        value={value}
        current={{
          label: selectedLabel,
          detail: selectedDetail,
          state: selected ? "resolved" : value === 0 ? "empty" : "unresolved"
        }}
        disabled={disabled}
        rawOptionForQuery={(query) => {
          const queryNumber = numericReferenceQuery(query);
          if (queryNumber == null || options.some((option) => option.value === queryNumber)) return null;
          return {
            key: `raw:${targetKind}:${queryNumber}`,
            value: queryNumber,
            label: `${displayLabel} ${queryNumber}`,
            detail: `No ${label} ${queryNumber} exists yet.`,
            searchText: `${queryNumber} ${targetKind} ${label} missing raw`
          };
        }}
        resultNoun="target"
        resultNounPlural="targets"
        emptyTitle={`No matching ${label.toLowerCase()} targets`}
        emptyBody={`Try a ${label.toLowerCase()} name, numeric ID, or target detail.`}
        selectedEntity={selected?.entity}
        openLabel={`Open ${selected?.label ?? selectedLabel}`}
        clearLabel={`Clear ${label}`}
        currentSupplement={isMacroTarget ? <EdcdMacroFlowPreview project={project} catalog={catalog} macroId={value} /> : undefined}
        onChange={onChange}
        onOpen={onOpen}
      />
    );
  }
  return (
    <div className="edcd-select-target-field">
      <div className={hasOpenTarget ? "edcd-target-select-row with-open-action" : "edcd-target-select-row"}>
        <select
          disabled={disabled}
          value={selectValue}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            if (raw.startsWith("raw:")) return;
            onChange(Number(raw));
          }}
        >
          {!selected && (
            <option value={`raw:${value}`}>
              {value > 0 ? `Missing ${displayLabel} ${value}` : `Current ${displayLabel} ${value}`}
            </option>
          )}
          {options.map((option) => (
            <option key={option.key} value={option.value}>{option.label}</option>
          ))}
        </select>
        {hasOpenTarget && (
          <button
            type="button"
            className="btn btn-secondary btn-xs icon-only"
            title={selected ? `Open ${selected.label}` : `No ${displayLabel} selected`}
            aria-label={selected ? `Open ${selected.label}` : `No ${displayLabel} selected`}
            disabled={disabled || !selected?.entity || !onOpen}
            onClick={(event) => {
              event.preventDefault();
              if (!selected?.entity) return;
              onOpen?.(selected.entity);
            }}
          >
            <Eye size={12} />
          </button>
        )}
      </div>
      {targetDetail && <small className={`edcd-target-inline-detail${selected ? "" : " missing"}`}>{targetDetail}</small>}
      {isMacroTarget && <EdcdMacroFlowPreview project={project} catalog={catalog} macroId={value} />}
    </div>
  );
}

function edcdTargetKindUsesSearch(targetKind: EdcdTargetKind) {
  return [
    "battle",
    "treasure",
    "shop",
    "simpleEncounter",
    "complexEncounter",
    "thiefEncounter",
    "timedEncounter",
    "macro",
    "monster"
  ].includes(targetKind);
}

function edcdCompactTargetDetail(targetKind: EdcdTargetKind, selected: EdcdTargetOption | null, value: number, label: string) {
  if (!selected) return value ? `No matching ${label.toLowerCase()} target exists yet.` : "";
  const detail = selected.detail.trim();
  if (!detail) return "";
  if (targetKind === "sound" && edcdSoundDetailIsGeneric(detail)) return "";
  return detail;
}

function edcdSearchResultDetail(...parts: Array<string | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(" | ");
}

function edcdSoundDetailIsGeneric(detail: string) {
  const normalized = detail.toLowerCase().replace(/\s+/g, " ").trim();
  return normalized === "library sound reference" ||
    normalized === "built-in realmz/divinity sound reference" ||
    normalized === "raw sound reference";
}

function EdcdMacroFlowPreview({
  project,
  catalog,
  macroId
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  macroId: number;
}) {
  const trigger = project.triggers.find((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === macroId);
  if (!trigger) return null;
  const actions = trigger.actions
    .filter((action) => action.rawCode !== 0)
    .slice()
    .sort((a, b) => a.slot - b.slot);
  if (actions.length === 0) return <small className="edcd-target-flow-empty">Extra Action Point {macroId} has no occupied action slots.</small>;
  return (
    <div className="edcd-target-flow-preview" aria-label={`Extra Action Point ${macroId} flow preview`}>
      {actions.slice(0, 5).map((action) => (
        <div key={`${action.slot}-${action.rawCode}-${action.id}`}>
          <span>{action.slot + 1}</span>
          <small>{scriptActionSummary(project, catalog, { rawCode: action.rawCode, id: action.id })}</small>
        </div>
      ))}
      {actions.length > 5 && <small>{actions.length - 5} more action slot(s).</small>}
    </div>
  );
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

type GuidedFieldPresentation = {
  label?: string;
  help?: string;
  disabled?: boolean;
  technicalOnly?: boolean;
  suppressHelp?: boolean;
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
  if (shape === "action-data-patching") {
    return [
      { title: "What To Replace", eyebrow: "Target Script", names: ["levelorcache", "targetrecord", "levelkind", "resultslot"] },
      { title: "Replacement Codes", eyebrow: "Source", names: ["macro"] }
    ];
  }
  if (shape === "item-branch") {
    return [
      { title: "Item Check", eyebrow: "Condition", names: ["item", "required"] },
      { title: "Result", eyebrow: "Where To Go", names: ["branchmode", "hastarget", "missingbehavior", "missingtarget"] }
    ];
  }
  if (shape === "item-charge-branch") {
    return [
      { title: "Item Check", eyebrow: "Condition", names: ["item", "required", "minimumcharges"] },
      { title: "Result", eyebrow: "Where To Go", names: ["branchmode", "successtarget", "failuretarget"] }
    ];
  }
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

function guidedFieldPresentation(shape: string, name: string, values: number[], opcode?: number): GuidedFieldPresentation {
  const normalizedShape = normalizeShape(shape);
  const normalizedName = normalizeField(name);
  const branchMode = fieldValue(values, 2);
  if (normalizedShape === "action-data-patching" && normalizedName === "levelorcache") {
    return {
      label: "Target Kind / Level",
      help: "-2 replaces a simple encounter script, -3 replaces a complex encounter script. Otherwise this is the land/dungeon level that owns the Action Point being patched."
    };
  }
  if (normalizedShape === "action-data-patching" && normalizedName === "targetrecord") {
    const levelOrCache = fieldValue(values, 0);
    return {
      label: levelOrCache === -2 ? "Simple Encounter" : levelOrCache === -3 ? "Complex Encounter" : "Action Point Number",
      help: levelOrCache === -2 || levelOrCache === -3
        ? "Encounter script whose result row will be replaced."
        : "Action Point number on the selected land/dungeon level whose CODE/ID slots will be replaced."
    };
  }
  if (normalizedShape === "action-data-patching" && normalizedName === "macro") {
    return { label: "Replacement Extra Action Point", help: "Extra Action Point that contains the new CODE/ID slots to copy into the target script." };
  }
  if (normalizedShape === "action-data-patching" && normalizedName === "levelkind") {
    return { label: "Action Point Level Kind", help: "Only used when replacing an Action Point. Encounter replacements ignore this field." };
  }
  if (normalizedShape === "action-data-patching" && normalizedName === "resultslot") {
    return { label: "Encounter Result Slot", help: "Only used when replacing a simple or complex encounter result script. Action Point replacements ignore this field." };
  }
  if (normalizedShape === "force-branch" && normalizedName === "slot" && branchMode === 0) {
    return {
      label: "Result Slot",
      help: "Extra Action Point destinations start at the top of that action, so this imported slot value is preserved but not used by the normal authoring path.",
      disabled: true,
      technicalOnly: false
    };
  }
  if (normalizedName.includes("unused")) return { disabled: true, technicalOnly: true, help: "Preserved imported compatibility value." };
  if (normalizedShape === "force-branch" && normalizedName === "testa" && opcode === 38) {
    return { label: "Item To Check", help: "", suppressHelp: true };
  }
  if (normalizedShape === "force-branch" && normalizedName === "testb" && opcode === 38) {
    return { label: "Continue When", help: "", suppressHelp: true };
  }
  if (normalizedShape === "force-branch" && normalizedName === "testb" && opcode === 46) {
    return { label: "Branch When", help: "Classic Realmz checks the quest flag, then branches when this condition matches." };
  }
  if (normalizedShape === "force-branch" && normalizedName === "testa" && opcode === 46) {
    return { label: "Quest To Check", help: "Quest flag tested by this branch." };
  }
  if (normalizedShape === "random-region-mutation" && normalizedName === "level") {
    return { label: "Map Level", help: "", suppressHelp: true };
  }
  if (normalizedShape === "random-region-mutation" && normalizedName === "randomregion") {
    return { label: "Random Area", help: "", suppressHelp: true };
  }
  if (normalizedShape === "random-region-mutation" && normalizedName === "percent") {
    return { label: "Encounter Chance", help: "", suppressHelp: true };
  }
  if (normalizedShape === "random-region-mutation" && normalizedName === "battleloworkeep") {
    return { label: "Battle Range Low", help: "-1 keeps the current low battle range." };
  }
  if (normalizedShape === "random-region-mutation" && normalizedName === "battlehighorkeep") {
    return { label: "Battle Range High", help: "-1 keeps the current high battle range." };
  }
  if (normalizedName === "message") return { label: "String", help: "" };
  if (normalizedName === "messagelow") return { label: "String Low", help: "" };
  if (normalizedName === "messagehigh") return { label: "String High", help: "" };
  if ((normalizedShape === "item-branch" || normalizedShape === "item-charge-branch") && normalizedName === "item") return { label: "Item To Check", help: "" };
  if (normalizedShape === "item-branch" && normalizedName === "branchmode") return { label: "If Possessed, Go To", help: "" };
  if (normalizedShape === "item-branch" && normalizedName === "hastarget") return { label: "If Possessed Target", help: "" };
  if (normalizedShape === "item-branch" && normalizedName === "missingbehavior") return { label: "If Missing", help: "" };
  if (normalizedShape === "item-branch" && normalizedName === "missingtarget") return { label: "If Missing Target", help: "" };
  if (normalizedShape === "item-charge-branch" && normalizedName === "branchmode") return { label: "If Enough Charges, Go To", help: "" };
  if (normalizedShape === "item-charge-branch" && normalizedName === "successtarget") return { label: "If Enough Charges Target", help: "" };
  if (normalizedShape === "item-charge-branch" && normalizedName === "failuretarget") return { label: "If Not Enough Charges Target", help: "" };
  if (normalizedName === "branchmode") return { label: "Destination Type", help: "Controls what kind of record the target field points to." };
  if (normalizedName === "target") return { label: "Destination", help: "Where the script goes when this condition succeeds." };
  return {};
}

function guidedModeOptionsForField(shape: string, name: string, opcode?: number): ModeOption[] | null {
  const normalizedShape = normalizeShape(shape);
  const normalizedName = normalizeField(name);
  if (normalizedShape === "action-data-patching" && normalizedName === "levelorcache") {
    return [
      { value: -3, label: "Complex Encounter Script" },
      { value: -2, label: "Simple Encounter Script" },
      { value: 0, label: "Action Point on current/same land type" }
    ];
  }
  if (normalizedShape === "action-data-patching" && normalizedName === "levelkind") {
    return [
      { value: 0, label: "Same land type / current AP context" },
      { value: 1, label: "Land Level" },
      { value: 2, label: "Dungeon Level" }
    ];
  }
  if (normalizedShape === "action-data-patching" && normalizedName === "resultslot") {
    return [
      { value: 0, label: "Result slot 0" },
      { value: 1, label: "Result slot 1" },
      { value: 2, label: "Result slot 2" },
      { value: 3, label: "Result slot 3" }
    ];
  }
  if (normalizedShape === "force-branch" && normalizedName === "testb" && opcode === 46) {
    return [
      { value: 0, label: "Quest is not set" },
      { value: 1, label: "Quest is set" },
      { value: 2, label: "Always branch" }
    ];
  }
  if (normalizedShape === "force-branch" && normalizedName === "testb" && opcode === 38) {
    return [
      { value: 0, label: "Party has item" },
      { value: 1, label: "Party does not have item" }
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
  if (normalizedShape === "item-branch" && normalizedName === "missingbehavior") {
    return [
      { value: 0, label: "Use If Missing Target" },
      { value: 1, label: "Continue Current Script" },
      { value: 2, label: "Show String And Exit" }
    ];
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
      { value: 2, label: "Use paired shape details" }
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
  if (normalized === "action-data-patching") {
    const levelOrCache = values[0] ?? 0;
    const targetRecord = values[1] ?? 0;
    const sourceMacro = values[2] ?? 0;
    const levelKind = values[3] ?? 0;
    const resultSlot = values[4] ?? 0;
    const source = edcdTargetOptions(project, "macro", catalog).find((option) => option.value === Math.abs(sourceMacro));
    const sourceLabel = source?.label ?? `Extra Action Point ${sourceMacro}`;
    if (levelOrCache === -2) return `Replace Simple Encounter ${targetRecord}, result slot ${resultSlot}, with ${sourceLabel}.`;
    if (levelOrCache === -3) return `Replace Complex Encounter ${targetRecord}, result slot ${resultSlot}, with ${sourceLabel}.`;
    const levelLabel = levelKind === 2 ? `dungeon level ${levelOrCache}` : levelKind === 1 ? `land level ${levelOrCache}` : `the matching Action Point context`;
    return `Replace Action Point ${targetRecord} on ${levelLabel} with ${sourceLabel}.`;
  }
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
  if (opcode === 38) {
    if (testB === 0) return `If party has ${itemIdSummary(testA)}`;
    if (testB === 1) return `If party does not have ${itemIdSummary(testA)}`;
    return `If ${itemIdSummary(testA)} matches imported possession test ${testB}`;
  }
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

function sentenceCase(value: string) {
  const clean = value.trim();
  return clean ? `${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : value;
}

function ChoiceDialogEditor({
  project,
  catalog,
  rowId,
  rowExists,
  initialValues,
  targetIssues,
  selectedSlotLabel,
  onSelectEntity,
  onOpenText,
  onDraftValuesChange,
  onApplyCommand,
  showActionButtons = true,
  presentation = "inventory"
}: {
  project: Project;
  catalog?: LibraryCatalog | null;
  rowId: number;
  rowExists: boolean;
  initialValues: number[];
  targetIssues: ReturnType<typeof missingEdcdTargetReferences>;
  selectedSlotLabel: string;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenText?: (editor: "messages" | "option-labels") => void;
  onDraftValuesChange?: (values: number[], dirty: boolean) => void;
  onApplyCommand?: (command: ProjectCommand) => void;
  showActionButtons?: boolean;
  presentation?: EdcdRowEditorPresentation;
}) {
  const initialDraftKey = `${rowId}:${rowExists ? "stored" : "missing"}:${initialValues.join("|")}`;
  const [draft, setDraft] = useState(initialValues.map(String));

  useEffect(() => {
    setDraft(initialValues.map(String));
  }, [initialDraftKey]);

  const numericDraft = useMemo(() => draft.map((value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }), [draft]);
  const changed = numericDraft.some((value, index) => value !== initialValues[index]);
  const needsSelectedStepApply = !rowExists || changed;
  const canApplyChoice = Boolean(onApplyCommand) && (!rowExists || changed);
  const choiceActionLabel = rowExists ? "Apply Choice" : "Create Choice";
  const choiceCommandLabel = rowExists ? `Update choice dialog ${rowId}` : `Create choice dialog ${rowId}`;
  const continueValue = numericDraft[0] ?? 0;
  const branchMode = numericDraft[1] ?? 0;
  const branchKind = choiceBranchTargetKind(branchMode);
  const branchOptions = branchKind ? edcdTargetOptions(project, branchKind, catalog) : [];
  const branchTarget = numericDraft[2] ?? 0;

  const setField = (index: number, value: number) => {
    const next = [...draft];
    next[index] = String(value);
    setDraft(next);
  };

  useEffect(() => {
    onDraftValuesChange?.(numericDraft, needsSelectedStepApply);
  }, [needsSelectedStepApply, numericDraft, onDraftValuesChange]);

  const actionButtons = (
    <>
      <button
        type="button"
        className="btn btn-primary btn-xs"
        disabled={!canApplyChoice}
        onClick={() => onApplyCommand?.({
          kind: "updateEdcdRow",
          label: choiceCommandLabel,
          rowId,
          values: numericDraft
        })}
      >
        <Save size={12} /> {choiceActionLabel}
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
  );
  const editorBody = (
      <div className={`choice-dialog-editor${presentation === "selected-step" ? " selected-step-edcd-editor" : ""}`}>
        {!rowExists && (
          <EmptyState
            compact
            title={presentation === "selected-step" ? "Choice fields are ready to apply" : "Missing choice dialog settings"}
            body={presentation === "selected-step"
              ? `Choose values below, then Apply Step to store them for this ${selectedSlotLabel}.`
              : `This ${selectedSlotLabel} uses choice dialog ${rowId}. Create choice settings to store the values below.`}
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
              <EdcdSelectTargetField
                project={project}
                catalog={catalog}
                label={edcdTargetLabel(branchKind)}
                targetKind={branchKind}
                value={branchTarget}
                options={branchOptions}
                onChange={(nextValue) => setField(2, nextValue)}
                onOpen={(entity) => onSelectEntity?.(entity)}
              />
            ) : (
              <div className="edcd-selected-target-row missing">
                <div>
                  <strong>No branch target</strong>
                  <small>{choiceBranchModeLabel(branchMode)} does not use a target record.</small>
                </div>
              </div>
            )}
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
          />
          <ChoicePromptField
            project={project}
            label="Right Option"
            value={numericDraft[4] ?? 0}
            warning={targetIssues.find((issue) => issue.index === 4)?.targetLabel}
            onChange={(value) => setField(4, value)}
            onSelectEntity={onSelectEntity}
            onOpenText={onOpenText}
          />
        </div>
        {targetIssues.map((issue) => (
          <p key={`${issue.index}-${issue.targetKind}-${issue.value}`} className="field-warning">
            Missing {issue.targetLabel} {issue.value} for {issue.index === 2 ? "branch target" : issue.index === 3 ? "left option" : "right option"}.
          </p>
        ))}
        <CollapsibleSection title="Technical Details" eyebrow="advanced" density="compact" storageKey={`scripts.choiceDialog.${rowId}.advanced.open`} defaultOpen={false}>
          <div className="realmz-raw-preview">
            <FieldRow label="Action Settings Row" value={rowId} />
            <FieldRow label="Internal Shape" value="choice" />
            <FieldRow label="Internal Fields" value="replyPolarity, branchMode, branchTarget, promptA, promptB" />
            <FieldRow label="Raw Values" value={numericDraft.join(", ")} />
          </div>
        </CollapsibleSection>
      </div>
  );

  if (presentation === "selected-step") {
    return (
      <>
        {showActionButtons && (
          <div className="edcd-selected-step-action-strip">
            {actionButtons}
          </div>
        )}
        <div className="realmz-current-step-authoring-subpane">
          {editorBody}
        </div>
      </>
    );
  }

  return (
    <PanelSection
      title={`Choice Dialog ${rowId}`}
      eyebrow="Player Option"
      density="compact"
      actions={actionButtons}
    >
      {editorBody}
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
  onOpenText
}: {
  project: Project;
  label: string;
  value: number;
  warning?: string;
  onChange: (value: number) => void;
  onSelectEntity?: (entity: SelectedEntity) => void;
  onOpenText?: (editor: "messages" | "option-labels") => void;
}) {
  const storage = choicePromptStorageFromOptionLabels(project.optionLabels);
  const usesOptionLabels = storage === "option-labels";
  const prompt = parseChoicePromptValue(value, storage);
  const messages = [...(project.messages ?? [])].sort((a, b) => a.id - b.id);
  const optionLabels = [...(project.optionLabels ?? [])].sort((a, b) => a.id - b.id);
  const promptMessages = messages.filter((record) => record.id > 0);
  const promptOptionLabels = optionLabels.filter((record) => record.id > 0);
  const selectedMessage = prompt.kind === "message" ? messages.find((record) => record.id === prompt.id) : null;
  const selectedOptionLabel = prompt.kind === "option-label" ? optionLabels.find((record) => record.id === prompt.id) : null;
  const promptRecords = usesOptionLabels ? promptOptionLabels : promptMessages;
  const selectedPromptId = prompt.kind === "default" ? 0 : prompt.id;
  const selectedPromptExists = usesOptionLabels ? Boolean(selectedOptionLabel) : Boolean(selectedMessage);
  const promptKind = usesOptionLabels ? "option-label" : "message";
  const promptLabel = usesOptionLabels ? "Choice Label" : "String";
  const promptHelp = usesOptionLabels
    ? "This scenario stores Player Option choice text in compact option labels."
    : "This scenario stores Player Option choice text in ordinary scenario strings.";
  const promptText = usesOptionLabels ? selectedOptionLabel?.text : selectedMessage?.text;
  const openMessage = (id: number) => {
    onSelectEntity?.(selectEntityFromId(`message:${id}`));
    onOpenText?.("messages");
  };
  const openOptionLabel = (id: number) => {
    onSelectEntity?.(selectEntityFromId(`option-label:${id}`));
    onOpenText?.("option-labels");
  };

  return (
    <div className={`choice-prompt-field script-required-field${warning ? " has-warning" : ""}`}>
      <label>
        <span>{label}</span>
        <select
          value={selectedPromptId > 0 && !selectedPromptExists ? `raw:${selectedPromptId}` : String(selectedPromptId)}
          disabled={promptRecords.length === 0 && selectedPromptId === 0}
          onChange={(event) => {
            const raw = event.currentTarget.value;
            if (raw.startsWith("raw:")) return;
            const nextId = Number(raw);
            onChange(nextId > 0 ? serializeChoicePromptValue(promptKind, nextId) : 0);
          }}
        >
          <option value="0">Default Yes/No</option>
          {!selectedPromptExists && selectedPromptId > 0 && (
            <option value={`raw:${selectedPromptId}`}>Missing {promptLabel} {selectedPromptId}</option>
          )}
          {promptRecords.map((record) => (
            <option key={record.id} value={record.id}>{record.id}: {record.text || "Empty"}</option>
          ))}
          </select>
        <small>{prompt.kind === "default" ? "Uses the standard Yes / No option text." : promptText || promptHelp}</small>
      </label>
      <div className="choice-prompt-actions">
        {prompt.kind === "message" && prompt.id > 0 && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => openMessage(prompt.id)}>
            Edit String
          </button>
        )}
        {prompt.kind === "option-label" && prompt.id > 0 && selectedOptionLabel && (
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => openOptionLabel(prompt.id)}>
            Edit Choice Label
          </button>
        )}
      </div>
    </div>
  );
}

function edcdFieldLooksLikeItem(shape: string, name: string, opcode?: number) {
  const normalizedShape = shape.toLowerCase();
  const normalizedName = name.toLowerCase();
  if (normalizeShape(shape) === "force-branch" && opcode === 38 && normalizedName === "testa") return true;
  if (!normalizedShape.includes("item") && normalizedShape !== "random-items") return false;
  return ["item", "itemlow", "itemhigh", "replacementitem"].includes(normalizedName) || normalizedName.includes("item");
}

function fieldNameIsPreserved(name: string) {
  return name.toLowerCase().includes("unused");
}

function mapCoordinateTargetForEdcd(shape: string, values: number[]): MapCoordinateTarget | null {
  const normalized = normalizeShape(shape);
  if (normalized !== "teleport" && normalized !== "dungeon-move") return null;
  const levelIndex = Number(values[0] ?? -1);
  const x = Number(values[1] ?? -1);
  const y = Number(values[2] ?? -1);
  if (!Number.isInteger(levelIndex) || !Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (levelIndex < 0 || x < 0 || y < 0) return null;
  return {
    levelType: normalized === "dungeon-move" ? "dungeon" : "land",
    levelIndex,
    x,
    y
  };
}

function isCoordinateJumpField(shape: string, name: string) {
  const normalizedShape = normalizeShape(shape);
  if (normalizedShape !== "teleport" && normalizedShape !== "dungeon-move") return false;
  const normalizedName = normalizeField(name);
  return normalizedName === "x" || normalizedName === "y" || normalizedName === "xorkeep" || normalizedName === "yorkeep";
}

function settingsTitleForShape(shape: string) {
  const normalized = shape.toLowerCase();
  const labels: Record<string, string> = {
    "action-data-patching": "Action Code Replacement",
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
