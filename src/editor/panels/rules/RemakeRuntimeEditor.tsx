import { useMemo, useState } from "react";
import { REMAKE_EXTENSION_CATALOG } from "../../generated/remakeExtensionCatalog";
import {
  Project,
  ProjectCommand,
  RemakeRuntime,
  RemakePersistentVariable,
  RemakeScript,
  RemakeScriptAttachment,
  RemakeScriptParameter,
  RemakeScriptTier,
  RemakeScriptValueType,
  RemakeSemanticAction
} from "../../types";
import { isRemakeOnly } from "../../remakeRuntimeCatalog";
import { parseSafeScript, printSafeScript } from "../../safeScriptLanguage";
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
  const enhanced = project.authoringTarget === "remake-enhanced";
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
  const remakeOnly = isRemakeOnly(project);

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
        <div className="section-kicker">Realmz Remake Scenario v3</div>
        <h2>Runtime Contract</h2>
        <p>
          Classic-compatible projects expose the original scenario tools. Remake-enhanced projects
          add safe, sandboxed, and trusted scenario scripting without changing the Classic records
          you imported.
        </p>
        <FormGrid columns={2}>
          <FormField
            label="Authoring target"
            hint={remakeOnly ? "Remove Remake-only features before returning to Classic-compatible mode." : "This changes the visible tools; export support is computed from the project contents."}
          >
            <select
              value={project.authoringTarget}
              onChange={(event) => onApplyCommand({
                kind: "updateAuthoringTarget",
                label: "Change scenario authoring target",
                target: event.target.value as Project["authoringTarget"]
              })}
            >
              <option value="classic-compatible" disabled={remakeOnly}>Classic-compatible</option>
              <option value="remake-enhanced">Remake-enhanced</option>
            </select>
          </FormField>
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

      {enhanced && (
        <ScenarioScriptEditor
          project={project}
          onCommit={(scripts, label) => update({ scripts }, label)}
        />
      )}

      {enhanced && (
        <ScenarioStateAndAttachmentEditor
          runtime={runtime}
          onCommit={commit}
        />
      )}

      {enhanced && (
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
      )}

      {enhanced && (
      <section className="panel-card">
        <div className="section-kicker">Remake-Only</div>
        <h2>Semantic Actions</h2>
        <p>
          Semantic actions replace a Classic action slot in the exported v3 record. Adding one
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
      )}

      {enhanced && (
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
      )}
    </div>
  );
}

function ScenarioScriptEditor({
  project,
  onCommit
}: {
  project: Project;
  onCommit: (scripts: RemakeScript[], label: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(project.remakeRuntime.scripts[0]?.id ?? "");
  const selected = project.remakeRuntime.scripts.find((script) => script.id === selectedId) ?? null;
  const initialText = selected
    ? selected.tier === "safe" && selected.ast
      ? printSafeScript(selected.ast)
      : selected.source ?? fullScriptTemplate()
    : "";
  const [draft, setDraft] = useState(initialText);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);

  const select = (id: string) => {
    const script = project.remakeRuntime.scripts.find((entry) => entry.id === id);
    setSelectedId(id);
    setDiagnostics([]);
    setDraft(script?.tier === "safe" && script.ast
      ? printSafeScript(script.ast)
      : script?.source ?? fullScriptTemplate());
  };
  const add = () => {
    const suffix = project.remakeRuntime.scripts.length + 1;
    const script: RemakeScript = {
      id: `scenario.${portableId(project.scenario.id || project.scenario.name)}.script-${suffix}`,
      name: `Scenario Script ${suffix}`,
      documentation: "",
      tier: "safe",
      apiVersion: 1,
      parameters: [],
      returnType: "void",
      requestedCapabilities: [],
      stateSchema: {},
      sourceMap: { schemaVersion: 1, nodes: {} },
      ast: { kind: "function", name: `scenario_script_${suffix}`, parameters: [], returnType: "void", body: [{ kind: "return", sourceNode: "n1" }] },
      source: null
    };
    onCommit([...project.remakeRuntime.scripts, script], "Add scenario script");
    setSelectedId(script.id);
    setDraft(printSafeScript(script.ast!));
    setDiagnostics([]);
  };
  const updateSelected = (changes: Partial<RemakeScript>, label: string) => {
    if (!selected) return;
    onCommit(project.remakeRuntime.scripts.map((script) => script.id === selected.id ? { ...script, ...changes } : script), label);
  };
  const changeTier = (tier: RemakeScriptTier) => {
    if (!selected || tier === selected.tier) return;
    if (tier === "safe") {
      const parsed = parseSafeScript(draft, selected, project.remakeRuntime.scripts, project.remakeRuntime.persistentVariables);
      if (!parsed.program) {
        setDiagnostics(parsed.diagnostics.map(formatDiagnostic));
        return;
      }
      updateSelected({
        tier,
        ast: parsed.program,
        source: null,
        sourceMap: { schemaVersion: 1, nodes: parsed.sourceMap },
        requestedCapabilities: parsed.requestedCapabilities
      }, "Change scenario script tier");
      setDraft(printSafeScript(parsed.program));
      setDiagnostics([]);
      return;
    }
    const source = selected.tier === "safe" && selected.ast ? printSafeScript(selected.ast) : draft;
    updateSelected({ tier, ast: null, source }, "Change scenario script tier");
    setDraft(source);
    setDiagnostics([]);
  };
  const apply = () => {
    if (!selected) return;
    if (selected.tier === "safe") {
      const parsed = parseSafeScript(draft, selected, project.remakeRuntime.scripts, project.remakeRuntime.persistentVariables);
      setDiagnostics(parsed.diagnostics.map(formatDiagnostic));
      if (!parsed.program) return;
      updateSelected({
        ast: parsed.program,
        source: null,
        sourceMap: { schemaVersion: 1, nodes: parsed.sourceMap },
        requestedCapabilities: parsed.requestedCapabilities
      }, "Compile safe scenario script");
    } else {
      updateSelected({ source: draft, ast: null }, "Update full scenario script source");
      setDiagnostics([]);
    }
  };

  return (
    <section className="panel-card">
      <div className="section-kicker">Remake-Enhanced</div>
      <h2>Scenario Scripts</h2>
      <p>
        Safe source is parsed and type-checked into canonical VM instructions. Sandboxed and
        trusted tiers preserve the exact UTF-8 source; changing tiers is always an explicit action.
      </p>
      <div className="rules-toolbar">
        <button type="button" className="btn btn-primary btn-sm" onClick={add}>Add Script</button>
        <select value={selectedId} onChange={(event) => select(event.target.value)}>
          <option value="">Select a script</option>
          {project.remakeRuntime.scripts.map((script) => (
            <option key={script.id} value={script.id}>{script.name} ({script.tier})</option>
          ))}
        </select>
      </div>
      {selected && (
        <>
          <FormGrid columns={2}>
            <FormField label="Stable script ID">
              <input value={selected.id} readOnly />
            </FormField>
            <FormField label="Execution tier">
              <select value={selected.tier} onChange={(event) => changeTier(event.target.value as RemakeScriptTier)}>
                <option value="safe">Safe VM subset</option>
                <option value="sandboxed">Sandboxed full GDScript</option>
                <option value="trusted">Trusted full GDScript</option>
              </select>
            </FormField>
            <FormField label="Display name">
              <input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value }, "Rename scenario script")} />
            </FormField>
            <FormField label="Documentation">
              <input value={selected.documentation} onChange={(event) => updateSelected({ documentation: event.target.value }, "Document scenario script")} />
            </FormField>
            <FormField label="Return type">
              <select
                value={selected.returnType}
                onChange={(event) => updateSelected(
                  { returnType: event.target.value as RemakeScriptValueType },
                  "Change scenario script return type"
                )}
              >
                {SCRIPT_VALUE_TYPES.map((valueType) => (
                  <option key={valueType} value={valueType}>{valueType}</option>
                ))}
              </select>
            </FormField>
            <JsonValueEditor
              label="Typed parameters"
              value={selected.parameters}
              expect="array"
              onCommit={(value) => updateSelected(
                { parameters: value as RemakeScriptParameter[] },
                "Update scenario script parameters"
              )}
            />
            <JsonValueEditor
              label="Explicit state schema"
              value={selected.stateSchema}
              expect="object"
              onCommit={(value) => updateSelected(
                { stateSchema: value as Record<string, unknown> },
                "Update scenario script state schema"
              )}
            />
            {selected.tier !== "safe" && (
              <FormField label="Requested capabilities" hint="Comma-separated stable capability IDs. Remake validates every yielded command against this list." wide>
                <input
                  value={selected.requestedCapabilities.join(", ")}
                  onChange={(event) => updateSelected({
                    requestedCapabilities: Array.from(new Set(
                      event.target.value.split(",").map((value) => value.trim()).filter(Boolean)
                    )).sort()
                  }, "Update scenario script capabilities")}
                />
              </FormField>
            )}
          </FormGrid>
          <FormField
            label={selected.tier === "safe" ? "Safe GDScript subset" : "Exact UTF-8 GDScript source"}
            hint={diagnostics[0] ?? (selected.tier === "safe" ? "Unsupported syntax remains a draft until corrected." : "Execution requires the declared runtime policy and capabilities.")}
          >
            <textarea rows={16} spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </FormField>
          {diagnostics.length > 0 && (
            <ul>{diagnostics.map((message) => <li key={message}>{message}</li>)}</ul>
          )}
          <div className="rules-toolbar">
            <button type="button" className="btn btn-primary btn-sm" onClick={apply}>Apply Script</button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                onCommit(project.remakeRuntime.scripts.filter((script) => script.id !== selected.id), "Delete scenario script");
                setSelectedId("");
                setDraft("");
              }}
            >
              Delete Script
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const SCRIPT_VALUE_TYPES: RemakeScriptValueType[] = [
  "void",
  "bool",
  "int",
  "float",
  "string",
  "bool-array",
  "int-array",
  "float-array",
  "string-array"
];

function ScenarioStateAndAttachmentEditor({
  runtime,
  onCommit
}: {
  runtime: RemakeRuntime;
  onCommit: (runtime: RemakeRuntime, label: string) => void;
}) {
  const updateVariables = (persistentVariables: RemakePersistentVariable[], label: string) => {
    onCommit({ ...runtime, persistentVariables }, label);
  };
  const updateAttachments = (scriptAttachments: RemakeScriptAttachment[], label: string) => {
    onCommit({ ...runtime, scriptAttachments }, label);
  };
  return (
    <section className="panel-card">
      <div className="section-kicker">Serializable State</div>
      <h2>Persistent Variables and Script Attachments</h2>
      <p>
        Variables are typed campaign state stored in saves. Attachments call a named script from an
        AP/XAP slot, encounter result, or lifecycle hook without replacing the Classic executor.
      </p>
      <div className="rules-toolbar">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => updateVariables([
            ...runtime.persistentVariables,
            { name: `variable_${runtime.persistentVariables.length + 1}`, valueType: "int", maxLength: null, defaultValue: 0 }
          ], "Add persistent scenario variable")}
        >
          Add Variable
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!runtime.scripts.length}
          onClick={() => updateAttachments([
            ...runtime.scriptAttachments,
            {
              targetKind: "trigger",
              recordId: "",
              slot: 0,
              hook: null,
              scriptId: runtime.scripts[0].id
            }
          ], "Attach scenario script")}
        >
          Add Attachment
        </button>
      </div>
      {runtime.persistentVariables.map((variable, index) => (
        <div className="rules-help-callout" key={`${variable.name}:${index}`}>
          <FormGrid columns="auto">
            <FormField label="Name">
              <input
                value={variable.name}
                onChange={(event) => updateVariables(runtime.persistentVariables.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, name: event.target.value } : entry
                ), "Rename persistent scenario variable")}
              />
            </FormField>
            <FormField label="Type">
              <select
                value={variable.valueType}
                onChange={(event) => updateVariables(runtime.persistentVariables.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, valueType: event.target.value as RemakeScriptValueType } : entry
                ), "Change persistent scenario variable type")}
              >
                {SCRIPT_VALUE_TYPES.filter((valueType) => valueType !== "void").map((valueType) => (
                  <option key={valueType} value={valueType}>{valueType}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Array maximum">
              <input
                type="number"
                min={0}
                max={256}
                disabled={!variable.valueType.endsWith("-array")}
                value={variable.maxLength ?? ""}
                onChange={(event) => updateVariables(runtime.persistentVariables.map((entry, entryIndex) =>
                  entryIndex === index
                    ? { ...entry, maxLength: event.target.value ? Math.min(256, Math.max(0, Number(event.target.value))) : null }
                    : entry
                ), "Change persistent scenario array bound")}
              />
            </FormField>
            <JsonValueEditor
              label="Default"
              value={variable.defaultValue}
              expect="any"
              onCommit={(defaultValue) => updateVariables(runtime.persistentVariables.map((entry, entryIndex) =>
                entryIndex === index ? { ...entry, defaultValue } : entry
              ), "Change persistent scenario variable default")}
            />
          </FormGrid>
          <button
            type="button"
            className="btn btn-danger btn-xs"
            onClick={() => updateVariables(
              runtime.persistentVariables.filter((_, entryIndex) => entryIndex !== index),
              "Delete persistent scenario variable"
            )}
          >
            Delete Variable
          </button>
        </div>
      ))}
      {runtime.scriptAttachments.map((attachment, index) => (
        <div className="rules-help-callout" key={`${attachment.targetKind}:${attachment.recordId}:${index}`}>
          <FormGrid columns="auto">
            <FormField label="Target">
              <select
                value={attachment.targetKind}
                onChange={(event) => updateAttachments(runtime.scriptAttachments.map((entry, entryIndex) =>
                  entryIndex === index
                    ? { ...entry, targetKind: event.target.value as RemakeScriptAttachment["targetKind"] }
                    : entry
                ), "Change script attachment target")}
              >
                <option value="trigger">AP / XAP</option>
                <option value="simpleEncounter">Simple encounter result</option>
                <option value="complexEncounter">Complex encounter result</option>
                <option value="lifecycle">Campaign lifecycle</option>
              </select>
            </FormField>
            <FormField label="Stable record ID">
              <input
                value={attachment.recordId}
                onChange={(event) => updateAttachments(runtime.scriptAttachments.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, recordId: event.target.value } : entry
                ), "Change script attachment record")}
              />
            </FormField>
            <FormField label="Slot / result">
              <input
                type="number"
                min={0}
                value={attachment.slot ?? ""}
                disabled={attachment.targetKind === "lifecycle"}
                onChange={(event) => updateAttachments(runtime.scriptAttachments.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, slot: event.target.value ? Number(event.target.value) : null } : entry
                ), "Change script attachment slot")}
              />
            </FormField>
            <FormField label="Lifecycle hook">
              <input
                value={attachment.hook ?? ""}
                disabled={attachment.targetKind !== "lifecycle"}
                onChange={(event) => updateAttachments(runtime.scriptAttachments.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, hook: event.target.value || null } : entry
                ), "Change script lifecycle hook")}
              />
            </FormField>
            <FormField label="Script">
              <select
                value={attachment.scriptId}
                onChange={(event) => updateAttachments(runtime.scriptAttachments.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, scriptId: event.target.value } : entry
                ), "Change attached scenario script")}
              >
                {runtime.scripts.map((script) => (
                  <option key={script.id} value={script.id}>{script.name}</option>
                ))}
              </select>
            </FormField>
          </FormGrid>
          <button
            type="button"
            className="btn btn-danger btn-xs"
            onClick={() => updateAttachments(
              runtime.scriptAttachments.filter((_, entryIndex) => entryIndex !== index),
              "Delete scenario script attachment"
            )}
          >
            Delete Attachment
          </button>
        </div>
      ))}
    </section>
  );
}

function portableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign";
}

function fullScriptTemplate() {
  return "extends RefCounted\n\nfunc step(event: Dictionary, state: Dictionary, context) -> Dictionary:\n\treturn {\"state\": state, \"result\": {\"kind\": \"continue\"}}\n";
}

function formatDiagnostic(diagnostic: { line: number; column: number; message: string }) {
  return `Line ${diagnostic.line}:${diagnostic.column} — ${diagnostic.message}`;
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

function JsonValueEditor({
  label,
  value,
  expect,
  onCommit
}: {
  label: string;
  value: unknown;
  expect: "object" | "array" | "any";
  onCommit: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [error, setError] = useState("");
  return (
    <FormField label={label} wide hint={error || `JSON ${expect === "any" ? "value" : expect}`}>
      <textarea
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          try {
            const parsed: unknown = JSON.parse(text);
            if (expect === "array" && !Array.isArray(parsed)) {
              throw new Error("Value must be a JSON array.");
            }
            if (expect === "object" && (!parsed || Array.isArray(parsed) || typeof parsed !== "object")) {
              throw new Error("Value must be a JSON object.");
            }
            setError("");
            onCommit(parsed);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Invalid JSON value.");
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
