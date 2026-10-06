import { useId, useState, type FormEvent } from "react";
import { Save, X } from "lucide-react";
import { TargetPicker } from "../../components/RealmzTargetPicker";
import type { PreviewRuntimeContext } from "../../previewUrls";
import type {
  LibraryCatalog,
  Project,
  RealmzTargetRecordKind,
  SelectedEntity
} from "../../types";
import { ModalDialog, ModalDialogActions, ModalDialogHeader } from "../../ui";
import { scriptActionDefinitionFor } from "./scriptActionCatalog";
import {
  directActionSettingsFor,
  directActionStoredValue,
  directActionSummary
} from "./directActionSettings";

export type ContextualDirectActionModalProps = {
  project: Project;
  catalog?: LibraryCatalog | null;
  title: string;
  description: string;
  rawCode: number;
  initialValue: number;
  previewContext?: PreviewRuntimeContext;
  onInspect?: (entity: SelectedEntity) => void;
  onCreate?: (recordType: RealmzTargetRecordKind, id?: number) => number | void;
  onApply: (value: number) => void;
  onCancel: () => void;
};

export function ContextualDirectActionModal({
  project,
  catalog,
  title,
  description,
  rawCode,
  initialValue,
  previewContext = {},
  onInspect,
  onCreate,
  onApply,
  onCancel
}: ContextualDirectActionModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const settings = directActionSettingsFor(rawCode);
  const definition = scriptActionDefinitionFor(rawCode);
  const [value, setValue] = useState(initialValue);
  const [negativeMode, setNegativeMode] = useState(initialValue < 0);
  const summary = directActionSummary(project, catalog, rawCode, value);
  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply(value);
  };
  const setSignedMagnitude = (magnitude: number) => {
    setValue(directActionStoredValue(magnitude, negativeMode));
  };
  const setMode = (negative: boolean) => {
    setNegativeMode(negative);
    setValue(directActionStoredValue(Math.abs(value), negative));
  };

  return (
    <ModalDialog
      ariaLabelledBy={titleId}
      ariaDescribedBy={descriptionId}
      className="ecode-settings-modal direct-action-settings-modal"
      surfaceTag="form"
      onDismiss={onCancel}
      onSubmit={apply}
    >
      <ModalDialogHeader
        titleId={titleId}
        title={title}
        description={<span id={descriptionId}>{description}</span>}
        actions={(
          <button type="button" className="btn btn-ghost btn-xs" aria-label="Close action settings" onClick={onCancel}>
            <X size={14} />
          </button>
        )}
      />
      <div className="ecode-settings-modal-body direct-action-settings-modal-body">
        <div className="ecode-settings-modal-summary" aria-live="polite">
          <span>Current behavior</span>
          <strong>{summary}</strong>
        </div>
        <section className="direct-action-settings-pane">
          <header>
            <span>{settings.label}</span>
            <strong>{definition.shortLabel}</strong>
          </header>
          <p>{settings.help}</p>
          {settings.kind === "target" && (
            <TargetPicker
              project={project}
              catalog={catalog}
              opcode={rawCode}
              value={value}
              onChange={(nextValue) => {
                const magnitude = Math.abs(nextValue);
                setValue(directActionStoredValue(magnitude, negativeMode));
              }}
              onInspect={onInspect}
              onCreate={onCreate ? (recordType, requestedId) => {
                const createdId = onCreate(recordType, requestedId);
                if (typeof createdId === "number") {
                  setValue(directActionStoredValue(createdId, negativeMode));
                }
              } : undefined}
              showSignedBehavior={false}
              allowCreateAtZero
              previewContext={previewContext}
            />
          )}
          {settings.kind === "choice" && (
            <fieldset className="direct-action-choice-grid">
              <legend>{settings.label}</legend>
              {settings.options.map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="direct-action-choice"
                    value={option.value}
                    checked={value === option.value}
                    onChange={() => setValue(option.value)}
                  />
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </label>
              ))}
              {!settings.options.some((option) => option.value === value) && (
                <label className="imported">
                  <input type="radio" name="direct-action-choice" checked readOnly />
                  <span>Keep imported value {value}</span>
                  <small>This value is outside the documented authoring choices. It will be preserved unless you select a known option.</small>
                </label>
              )}
            </fieldset>
          )}
          {settings.kind === "number" && (
            <label className="direct-action-number-field">
              <span>{settings.label}</span>
              <span className="direct-action-number-control">
                <input
                  type="number"
                  value={settings.signedMode ? Math.abs(value) : value}
                  min={settings.min}
                  max={settings.max}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value);
                    if (Number.isFinite(next)) {
                      if (settings.signedMode) setSignedMagnitude(next);
                      else setValue(Math.trunc(next));
                    }
                  }}
                  aria-label={settings.label}
                />
                {settings.suffix && <span>{settings.suffix}</span>}
              </span>
              <small>{settings.help}</small>
            </label>
          )}
          {settings.kind === "none" && (
            <div className="direct-action-no-settings">
              <strong>No authoring choices are required.</strong>
              <span>{settings.help}</span>
              {initialValue !== 0 && <small>Imported ID {initialValue} is preserved because Realmz does not read it.</small>}
            </div>
          )}
          {settings.signedMode && settings.kind !== "choice" && (
            <fieldset className="direct-action-choice-grid direct-action-mode-grid">
              <legend>Runtime behavior</legend>
              <label>
                <input
                  type="radio"
                  name="direct-action-mode"
                  checked={!negativeMode}
                  onChange={() => setMode(false)}
                />
                <span>{settings.signedMode.positiveLabel}</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="direct-action-mode"
                  checked={negativeMode}
                  onChange={() => setMode(true)}
                />
                <span>{settings.signedMode.negativeLabel}</span>
              </label>
              <small>{settings.signedMode.help}</small>
            </fieldset>
          )}
        </section>
        <details className="direct-action-technical-details">
          <summary>Technical Details</summary>
          <dl>
            <div><dt>CODE</dt><dd>{rawCode}</dd></div>
            <div><dt>ID</dt><dd>{value}</dd></div>
            <div><dt>Storage</dt><dd>Direct CODE/ID action row</dd></div>
          </dl>
        </details>
      </div>
      <ModalDialogActions>
        <small className="ecode-settings-apply-detail">Stores ID {value} for this action.</small>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary">
          <Save size={14} /> Apply Settings
        </button>
      </ModalDialogActions>
    </ModalDialog>
  );
}
