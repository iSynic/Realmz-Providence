import { useMemo, useState } from "react";
import { REMAKE_EXTENSION_CATALOG } from "../../generated/remakeExtensionCatalog";
import {
  Project,
  ProjectCommand,
  RemakeRuntime,
  RemakeSemanticAction
} from "../../types";
import { FormField, FormGrid } from "../../ui";

type SemanticOperation = {
  id: string;
  extensionId: string;
  apiVersion: number;
};

const BINDING_FIELDS = [
  ["spells", "Spell implementations"],
  ["items", "Item behavior providers"],
  ["encounters", "Encounter resolvers"],
  ["monsterAi", "Monster AI providers"],
  ["lifecycle", "Campaign lifecycle hooks"]
] as const;

export function RemakeRuntimeEditor({
  project,
  onApplyCommand
}: {
  project: Project;
  onApplyCommand: (command: ProjectCommand) => void;
}) {
  const runtime = project.remakeRuntime;
  const semanticOperations = useMemo<SemanticOperation[]>(
    () => REMAKE_EXTENSION_CATALOG.extensions.flatMap((extension) =>
      extension.capabilities.semanticOperations.map((operation) => ({
        id: operation.id,
        extensionId: extension.id,
        apiVersion: extension.apiVersion
      }))
    ),
    []
  );
  const commit = (next: RemakeRuntime, label: string) => {
    onApplyCommand({ kind: "updateRemakeRuntime", label, runtime: next });
  };
  const update = (changes: Partial<RemakeRuntime>, label: string) => {
    commit({ ...runtime, ...changes }, label);
  };
  const remakeOnly = runtime.semanticActions.length > 0
    || Object.values(runtime.bindings).some((bindings) => Object.keys(bindings).length > 0);

  const toggleExtension = (extensionId: string, apiVersion: number, enabled: boolean) => {
    const requiredExtensions = enabled
      ? [
          ...runtime.requiredExtensions.filter((entry) => entry.id !== extensionId),
          { id: extensionId, apiVersion, configuration: {} }
        ]
      : runtime.requiredExtensions.filter((entry) => entry.id !== extensionId);
    update({ requiredExtensions }, enabled ? "Require Remake extension" : "Remove Remake extension");
  };

  const addSemanticAction = () => {
    const operation = semanticOperations[0];
    const record = project.triggers[0];
    if (!operation || !record) return;
    const requiredExtensions = runtime.requiredExtensions.some((entry) => entry.id === operation.extensionId)
      ? runtime.requiredExtensions
      : [...runtime.requiredExtensions, {
          id: operation.extensionId,
          apiVersion: operation.apiVersion,
          configuration: {}
        }];
    const used = new Set(
      runtime.semanticActions
        .filter((action) => action.targetKind === "trigger" && action.recordId === record.id)
        .map((action) => action.slot)
    );
    const slot = Array.from({ length: 8 }, (_, index) => index).find((candidate) => !used.has(candidate)) ?? 0;
    const semanticActions: RemakeSemanticAction[] = [...runtime.semanticActions, {
      targetKind: "trigger",
      recordId: record.id,
      slot,
      operation: operation.id as `scenario.${string}`,
      parameters: {}
    }];
    commit({ ...runtime, requiredExtensions, semanticActions }, "Add Remake semantic action");
  };

  return (
    <div className="rules-editor-stack">
      <section className="panel-card">
        <div className="section-kicker">Realmz Remake Scenario v2</div>
        <h2>Runtime Contract</h2>
        <p>
          This metadata selects only trusted extensions shipped with Realmz Remake. Providence
          exports IDs and JSON configuration; scenario folders never receive or execute GDScript.
        </p>
        <FormGrid columns={2}>
          <FormField
            label="Recommended gameplay profile"
            hint="This is a recommendation. The player can choose another preset before starting."
          >
            <select
              value={runtime.recommendedGameplayProfile}
              onChange={(event) => update(
                { recommendedGameplayProfile: event.target.value },
                "Change recommended gameplay profile"
              )}
            >
              <option value="core.classic">Classic fidelity</option>
              <option value="core.samuel">Samuel native behavior</option>
            </select>
          </FormField>
          <FormField label="Native Realmz target">
            <output>{remakeOnly ? "Blocked by Remake-only behavior" : "Available"}</output>
          </FormField>
        </FormGrid>
      </section>

      <section className="panel-card">
        <div className="section-kicker">Trusted Registry</div>
        <h2>Built-In Extensions</h2>
        {REMAKE_EXTENSION_CATALOG.extensions.map((extension) => {
          const requirement = runtime.requiredExtensions.find((entry) => entry.id === extension.id);
          return (
            <div key={extension.id} className="rules-help-callout">
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(requirement)}
                  onChange={(event) => toggleExtension(
                    extension.id,
                    extension.apiVersion,
                    event.target.checked
                  )}
                />
                {" "}{extension.id} API {extension.apiVersion}
              </label>
              <span>{extension.description}</span>
              {requirement && (
                <JsonObjectEditor
                  label="Configuration"
                  value={requirement.configuration}
                  onCommit={(configuration) => update({
                    requiredExtensions: runtime.requiredExtensions.map((entry) =>
                      entry.id === extension.id ? { ...entry, configuration } : entry
                    )
                  }, "Configure Remake extension")}
                />
              )}
            </div>
          );
        })}
      </section>

      <section className="panel-card">
        <div className="section-kicker">Remake-Only</div>
        <h2>Semantic Actions</h2>
        <p>
          Semantic actions replace a Classic action slot in the exported v2 record. Adding one
          automatically declares the extension that owns it and disables native Realmz export.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!semanticOperations.length || !project.triggers.length}
          onClick={addSemanticAction}
        >
          Add Semantic Action
        </button>
        {runtime.semanticActions.map((action, index) => (
          <SemanticActionEditor
            key={`${action.targetKind}:${action.recordId}:${action.slot}:${index}`}
            action={action}
            operations={semanticOperations}
            onChange={(next) => update({
              semanticActions: runtime.semanticActions.map((entry, entryIndex) =>
                entryIndex === index ? next : entry
              )
            }, "Update Remake semantic action")}
            onDelete={() => update({
              semanticActions: runtime.semanticActions.filter((_, entryIndex) => entryIndex !== index)
            }, "Delete Remake semantic action")}
          />
        ))}
      </section>

      <section className="panel-card">
        <div className="section-kicker">Provider IDs</div>
        <h2>Runtime Bindings</h2>
        <p>
          Keys are scenario record IDs; values are stable provider IDs from a required built-in
          extension. Empty objects preserve native Realmz export eligibility.
        </p>
        <FormGrid columns={2}>
          {BINDING_FIELDS.map(([field, label]) => (
            <JsonObjectEditor
              key={field}
              label={label}
              value={runtime.bindings[field]}
              onCommit={(value) => update({
                bindings: { ...runtime.bindings, [field]: stringRecord(value) }
              }, `Update ${label.toLowerCase()}`)}
            />
          ))}
        </FormGrid>
      </section>
    </div>
  );
}

function SemanticActionEditor({
  action,
  operations,
  onChange,
  onDelete
}: {
  action: RemakeSemanticAction;
  operations: SemanticOperation[];
  onChange: (action: RemakeSemanticAction) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rules-help-callout">
      <FormGrid columns={3}>
        <FormField label="Record kind">
          <select
            value={action.targetKind}
            onChange={(event) => onChange({
              ...action,
              targetKind: event.target.value as RemakeSemanticAction["targetKind"]
            })}
          >
            <option value="trigger">Action Point / XAP</option>
            <option value="simpleEncounter">Simple Encounter</option>
            <option value="complexEncounter">Complex Encounter</option>
          </select>
        </FormField>
        <FormField label="Record ID">
          <input
            value={action.recordId}
            onChange={(event) => onChange({ ...action, recordId: event.target.value })}
          />
        </FormField>
        <FormField label="Slot">
          <input
            type="number"
            min={0}
            max={action.targetKind === "trigger" ? 7 : 31}
            value={action.slot}
            onChange={(event) => onChange({ ...action, slot: Number(event.target.value) })}
          />
        </FormField>
        <FormField label="Operation" wide>
          <select
            value={action.operation}
            onChange={(event) => onChange({
              ...action,
              operation: event.target.value as `scenario.${string}`
            })}
          >
            {operations.map((operation) => (
              <option key={operation.id} value={operation.id}>{operation.id}</option>
            ))}
          </select>
        </FormField>
        <JsonObjectEditor
          label="Parameters"
          value={action.parameters}
          onCommit={(parameters) => onChange({ ...action, parameters })}
        />
      </FormGrid>
      <button type="button" className="btn btn-danger btn-xs" onClick={onDelete}>
        Delete Semantic Action
      </button>
    </div>
  );
}

function JsonObjectEditor({
  label,
  value,
  onCommit
}: {
  label: string;
  value: Record<string, unknown>;
  onCommit: (value: Record<string, unknown>) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  return (
    <FormField label={label} wide hint={error || "JSON object"}>
      <textarea
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          try {
            const parsed: unknown = JSON.parse(text);
            if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
              throw new Error("Value must be a JSON object.");
            }
            setError("");
            onCommit(parsed as Record<string, unknown>);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Invalid JSON object.");
          }
        }}
      />
    </FormField>
  );
}

function stringRecord(value: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, String(entry)])
  );
}
