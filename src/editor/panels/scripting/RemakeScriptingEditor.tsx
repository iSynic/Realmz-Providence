import { useEffect, useMemo, useState } from "react";
import SCENARIO_API_CATALOG_JSON from "../../../../schemas/remake-scenario-capabilities.v2.json";
import { REMAKE_EXTENSION_CATALOG } from "../../generated/remakeExtensionCatalog";
import {
  Project,
  ProjectCommand,
  RemakeArgumentBinding,
  RemakeBehaviorBinding,
  RemakeBehaviorDefinition,
  RemakeBehaviorRole,
  RemakeBehaviorTargetKind,
  RemakePluginRequirement,
  RemakeProviderBinding,
  RemakeRuntime,
  RemakeScriptParameter,
  RemakeScriptValueType,
  RemakeSemanticAction,
  RemakeStateDefinition,
  RemakeStateMigration,
  RemakeStateScope
} from "../../types";
import { parseSafeScript, printSafeScript } from "../../safeScriptLanguage";
import { CollapsibleSection, FormField, FormGrid, PanelSection } from "../../ui";
import { GuidedBehaviorEditor } from "./GuidedBehaviorEditor";

type CatalogRole = {
  id: RemakeBehaviorRole;
  label: string;
  contextType: string;
  resultType: string;
  hooks: string[];
  runtimeHooks?: string[];
  allowsYield: boolean;
  pureHooks?: string[];
};

type CatalogOperation = {
  id: string;
  label: string;
  category: string;
  roles: RemakeBehaviorRole[];
  yields: boolean;
  mutates: boolean;
  parameters: Record<string, string>;
  result: string;
  summary: string;
  reference: string;
  example: string;
};

type ScenarioApiCatalog = {
  apiVersion: number;
  executionBudget: number;
  limits: { maxArrayLength: number; maxAstNodes: number; maxCallDepth: number };
  roles: CatalogRole[];
  stateScopes: RemakeStateScope[];
  operations: CatalogOperation[];
};

const SCENARIO_API_CATALOG = SCENARIO_API_CATALOG_JSON as unknown as ScenarioApiCatalog;

type SemanticOperation = {
  id: string;
  extensionId: string;
  apiVersion: number;
};

const PROVIDER_BINDING_FIELDS = [
  ["spells", "Spell behavior", "spell"],
  ["items", "Item behavior", "item"],
  ["encounters", "Encounter resolver", "encounter"],
  ["monsterAi", "Monster AI", "monster-ai"],
  ["lifecycle", "Lifecycle provider", "lifecycle"],
  ["ruleModifiers", "Rule modifier", "rule-modifier"]
] as const;

const SCRIPT_VALUE_TYPES: RemakeScriptValueType[] = [
  "void",
  "bool",
  "int",
  "float",
  "string",
  "location-snapshot",
  "time-snapshot",
  "wealth-snapshot",
  "character-snapshot",
  "character-snapshot-array",
  "combat-snapshot",
  "exploration-snapshot",
  "item-instance-snapshot",
  "item-instance-snapshot-array",
  "map-definition-snapshot",
  "monster-definition-snapshot",
  "item-definition-snapshot",
  "spell-definition-snapshot",
  "battle-definition-snapshot",
  "encounter-definition-snapshot",
  "media-definition-snapshot",
  "action-outcome",
  "encounter-outcome",
  "effect-outcome",
  "item-outcome",
  "monster-decision",
  "rule-modifier",
  "bool-array",
  "int-array",
  "float-array",
  "string-array"
];

export type RemakeScriptingSection = "behaviors" | "state" | "extensions" | "bindings" | "reference";

export function RemakeScriptingEditor({
  project,
  section,
  onApplyCommand
}: {
  project: Project;
  section: RemakeScriptingSection;
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

  return (
    <div className="rules-editor-stack scripting-editor-stack">
      {section === "behaviors" && (
        <BehaviorLibrary
          project={project}
          onCommit={(behaviors, label) => update({ behaviors }, label)}
          onCommitRuntime={commit}
        />
      )}
      {section === "state" && (
        <StateAndBindingEditor project={project} onCommit={commit} />
      )}
      {section === "extensions" && (
        <ExtensionEditor
          project={project}
          operations={semanticOperations}
          onCommit={commit}
        />
      )}
      {section === "bindings" && (
        <ProviderBindingEditor project={project} onCommit={commit} />
      )}
      {section === "reference" && <ScenarioApiReference />}
    </div>
  );
}

function BehaviorLibrary({
  project,
  onCommit,
  onCommitRuntime
}: {
  project: Project;
  onCommit: (behaviors: RemakeBehaviorDefinition[], label: string) => void;
  onCommitRuntime: (runtime: RemakeRuntime, label: string) => void;
}) {
  const behaviors = project.remakeRuntime.behaviors;
  const [selectedId, setSelectedId] = useState(behaviors[0]?.id ?? "");
  const selected = behaviors.find((behavior) => behavior.id === selectedId) ?? null;
  const [draft, setDraft] = useState(() => behaviorSource(selected));
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    if (selected || behaviors.length === 0) return;
    setSelectedId(behaviors[0].id);
  }, [behaviors, selected]);

  const select = (id: string) => {
    const behavior = behaviors.find((entry) => entry.id === id) ?? null;
    setSelectedId(id);
    setDraft(behaviorSource(behavior));
    setDiagnostics([]);
  };

  const add = (role: RemakeBehaviorRole = "action") => {
    const roleContract = roleById(role);
    const identity = nextBehaviorIdentity(
      project.scenario.id || project.scenario.name,
      behaviors
    );
    const behavior: RemakeBehaviorDefinition = {
      id: identity.id,
      name: `${roleContract.label} Behavior ${identity.sequence}`,
      description: "",
      kind: role === "helper" ? "helper" : "entry",
      role,
      hook: roleRuntimeHooks(roleContract)[0] ?? "",
      tier: "safe",
      apiVersion: SCENARIO_API_CATALOG.apiVersion,
      behaviorVersion: 1,
      stateSchemaVersion: 1,
      parameters: [],
      returnType: roleReturnType(role),
      requestedCapabilities: [],
      stateSchema: {},
      sourceMap: { schemaVersion: 1, nodes: {} },
      ast: emptyBehaviorAst(`behavior_${identity.sequence}`, roleReturnType(role)),
      source: null
    };
    onCommit([...behaviors, behavior], "Add scenario behavior");
    setSelectedId(behavior.id);
    setDraft(printSafeScript(behavior.ast!));
    setDiagnostics([]);
  };

  const updateSelected = (changes: Partial<RemakeBehaviorDefinition>, label: string) => {
    if (!selected) return;
    onCommit(behaviors.map((behavior) =>
      behavior.id === selected.id ? { ...behavior, ...changes } : behavior
    ), label);
  };

  const changeRole = (role: RemakeBehaviorRole) => {
    if (!selected) return;
    const contract = roleById(role);
    const returnType = roleReturnType(role);
    const ast = selected.tier === "safe"
      ? {
        ...(selected.ast ?? emptyBehaviorAst(
          portableFunctionName(selected.name),
          returnType,
          selected.parameters
        )),
        returnType
      }
      : null;
    updateSelected({
      role,
      kind: role === "helper" ? "helper" : "entry",
      hook: roleRuntimeHooks(contract)[0] ?? "",
      returnType,
      ast
    }, "Change behavior role");
    if (ast) setDraft(printSafeScript(ast));
  };

  const applySafeSource = () => {
    if (!selected || selected.tier !== "safe") return;
    const parsed = parseSafeScript(
      draft,
      selected,
      behaviors,
      project.remakeRuntime.stateDefinitions
    );
    setDiagnostics(parsed.diagnostics.map(formatDiagnostic));
    if (!parsed.program) return;
    updateSelected({
      ast: parsed.program,
      source: null,
      sourceMap: { schemaVersion: 1, nodes: parsed.sourceMap },
      requestedCapabilities: parsed.requestedCapabilities
    }, "Apply Safe behavior source");
  };

  const updateAst = (ast: Record<string, unknown>) => {
    if (!selected) return;
    const requestedCapabilities = collectCapabilities(ast);
    updateSelected({
      ast,
      source: null,
      requestedCapabilities,
      sourceMap: { schemaVersion: 1, nodes: {} }
    }, "Edit guided behavior");
    setDraft(printSafeScript(ast));
    setDiagnostics([]);
  };

  const applyCaptainRecipe = (ast: Record<string, unknown>) => {
    if (!selected) return;
    const stateDefinitions = project.remakeRuntime.stateDefinitions.some((state) =>
      state.scope === "campaign"
      && state.ownerId === ""
      && state.name === "paid_the_captain"
    )
      ? project.remakeRuntime.stateDefinitions
      : [
        ...project.remakeRuntime.stateDefinitions,
        {
          name: "paid_the_captain",
          displayName: "Paid the Captain",
          documentation: "Whether the party paid the captain before the deadline.",
          scope: "campaign" as const,
          ownerId: "",
          schemaVersion: 1,
          valueType: "bool" as const,
          maxLength: null,
          defaultValue: false
        }
      ];
    onCommitRuntime({
      ...project.remakeRuntime,
      stateDefinitions,
      behaviors: behaviors.map((behavior) =>
        behavior.id === selected.id
          ? {
            ...behavior,
            ast,
            source: null,
            requestedCapabilities: collectCapabilities(ast),
            sourceMap: { schemaVersion: 1, nodes: {} }
          }
          : behavior
      )
    }, "Add gold, deadline, and healthy-party quest recipe");
    setDraft(printSafeScript(ast));
    setDiagnostics([]);
  };

  const convertTier = () => {
    if (!selected) return;
    const identity = nextBehaviorIdentity(
      project.scenario.id || project.scenario.name,
      behaviors
    );
    if (selected.tier === "safe") {
      const source = sandboxTemplate();
      const copy: RemakeBehaviorDefinition = {
        ...selected,
        id: identity.id,
        name: `${selected.name} (Sandboxed)`,
        tier: "sandboxed",
        behaviorVersion: 1,
        sourceMap: { schemaVersion: 1, nodes: {} },
        ast: null,
        source
      };
      onCommit([...behaviors, copy], "Create sandboxed behavior copy");
      setSelectedId(copy.id);
      setDraft(source);
      setDiagnostics([
        "Created an unbound sandboxed copy with the required reducer contract. "
          + "The original Safe behavior and its bindings were preserved."
      ]);
      setShowSource(true);
      return;
    }
    const ast = emptyBehaviorAst(
      `behavior_${identity.sequence}`,
      selected.returnType,
      selected.parameters
    );
    const copy: RemakeBehaviorDefinition = {
      ...selected,
      id: identity.id,
      name: `${selected.name} (Safe)`,
      tier: "safe",
      behaviorVersion: 1,
      source: null,
      ast,
      requestedCapabilities: [],
      sourceMap: { schemaVersion: 1, nodes: {} }
    };
    onCommit([...behaviors, copy], "Create Safe behavior copy");
    setSelectedId(copy.id);
    setDraft(printSafeScript(ast));
    setDiagnostics([
      "Created an unbound Safe copy. The sandboxed source and its bindings were preserved."
    ]);
    setShowSource(true);
  };

  return (
    <>
      <PanelSection
        eyebrow="Project Library"
        title="Behaviors"
        count={behaviors.length}
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={() => add()}>New Behavior</button>}
      >
        <p>
          Behaviors are reusable pieces of scenario logic. Pick what invokes the behavior; Providence
          supplies the right context and checks the result contract.
        </p>
        <FormGrid columns={2}>
          <FormField label="Behavior">
            <select value={selectedId} onChange={(event) => select(event.target.value)}>
              <option value="">Select a behavior</option>
              {behaviors.map((behavior) => (
                <option key={behavior.id} value={behavior.id}>
                  {behavior.name} · {roleById(behavior.role).label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Create for">
            <select defaultValue="" onChange={(event) => {
              if (!event.target.value) return;
              add(event.target.value as RemakeBehaviorRole);
              event.target.value = "";
            }}>
              <option value="">Choose a behavior role…</option>
              {SCENARIO_API_CATALOG.roles.map((role) => (
                <option key={role.id} value={role.id}>{role.label}</option>
              ))}
            </select>
          </FormField>
        </FormGrid>
      </PanelSection>

      {selected && (
        <>
          <PanelSection eyebrow={selected.tier === "safe" ? "Guided Safe Behavior" : "Advanced"} title={selected.name}>
            <FormGrid columns={3}>
              <FormField label="Name">
                <input
                  value={selected.name}
                  onChange={(event) => updateSelected({ name: event.target.value }, "Rename behavior")}
                />
              </FormField>
              <FormField label="Runs as">
                <select value={selected.role} onChange={(event) => changeRole(event.target.value as RemakeBehaviorRole)}>
                  {SCENARIO_API_CATALOG.roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="When">
                <select
                  value={selected.hook}
                  disabled={selected.role === "helper"}
                  onChange={(event) => updateSelected({ hook: event.target.value }, "Change behavior hook")}
                >
                  {roleRuntimeHooks(roleById(selected.role)).map((hook) => (
                    <option key={hook} value={hook}>{friendlyName(hook)}</option>
                  ))}
                  {selected.role === "helper" && <option value="">Called by another behavior</option>}
                </select>
              </FormField>
              <FormField label="Description" wide>
                <input
                  value={selected.description}
                  placeholder="What does this behavior do?"
                  onChange={(event) => updateSelected({ description: event.target.value }, "Document behavior")}
                />
              </FormField>
            </FormGrid>
            {selected.tier === "safe" && selected.ast ? (
              <GuidedBehaviorEditor
                project={project}
                behavior={selected}
                ast={selected.ast}
                onChange={updateAst}
                onApplyCaptainRecipe={applyCaptainRecipe}
              />
            ) : (
              <div className="rules-help-callout">
                <strong>Sandboxed full GDScript</strong>
                <span>
                  This source runs only in Remake’s isolated runner and may use the same typed
                  scenario API. It never receives Godot nodes or raw engine access.
                </span>
              </div>
            )}
          </PanelSection>

          <CollapsibleSection
            title={selected.tier === "safe" ? "Safe source" : "Sandboxed GDScript source"}
            eyebrow={selected.tier === "safe" ? "Optional Code View" : "Advanced"}
            defaultOpen={showSource || selected.tier === "sandboxed"}
          >
            <FormField
              label="Source"
              wide
              hint={diagnostics[0] ?? (
                selected.tier === "safe"
                  ? "A valid edit replaces the canonical outline. Invalid source remains only a draft."
                  : "Exact UTF-8 source. Remake enforces the declared role, capabilities, and reducer boundary."
              )}
            >
              <textarea rows={18} spellCheck={false} value={draft} onChange={(event) => setDraft(event.target.value)} />
            </FormField>
            {diagnostics.length > 0 && (
              <ul className="rules-diagnostics">
                {diagnostics.map((message) => <li key={message}>{message}</li>)}
              </ul>
            )}
            <div className="rules-toolbar">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={selected.tier === "safe"
                  ? applySafeSource
                  : () => updateSelected({ source: draft, ast: null }, "Apply sandboxed behavior source")}
              >
                Apply Source
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowSource((value) => !value)}>
                {showSource ? "Hide Code View" : "Keep Code View Open"}
              </button>
            </div>
          </CollapsibleSection>

          <CollapsibleSection title="Parameters and runtime details" eyebrow="Technical Details" defaultOpen={false}>
            <ParameterEditor
              parameters={selected.parameters}
              onChange={(parameters) => updateSelected({ parameters }, "Edit behavior parameters")}
            />
            <FormGrid columns={3}>
              <FormField label="Stable behavior ID"><input value={selected.id} readOnly /></FormField>
              <FormField label="Behavior version">
                <input
                  type="number"
                  min={1}
                  value={selected.behaviorVersion}
                  onChange={(event) => updateSelected({ behaviorVersion: Number(event.target.value) }, "Change behavior version")}
                />
              </FormField>
              <FormField label="State schema version">
                <input
                  type="number"
                  min={1}
                  value={selected.stateSchemaVersion}
                  onChange={(event) => updateSelected({ stateSchemaVersion: Number(event.target.value) }, "Change state schema version")}
                />
              </FormField>
            </FormGrid>
            <p>Capabilities are generated from Safe blocks: {selected.requestedCapabilities.join(", ") || "none"}</p>
            <div className="rules-toolbar">
              <button type="button" className="btn btn-secondary btn-sm" onClick={convertTier}>
                {selected.tier === "safe"
                  ? "Create Sandboxed Copy…"
                  : "Create Safe Copy…"}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  onCommit(behaviors.filter((behavior) => behavior.id !== selected.id), "Delete scenario behavior");
                  setSelectedId("");
                  setDraft("");
                }}
              >
                Delete Behavior
              </button>
            </div>
          </CollapsibleSection>
        </>
      )}
    </>
  );
}

function ParameterEditor({
  parameters,
  onChange
}: {
  parameters: RemakeScriptParameter[];
  onChange: (parameters: RemakeScriptParameter[]) => void;
}) {
  return (
    <div>
      <div className="rules-toolbar">
        <strong>Inputs</strong>
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          onClick={() => onChange([...parameters, { name: `input_${parameters.length + 1}`, valueType: "int", maxLength: null }])}
        >
          Add Input
        </button>
      </div>
      {parameters.map((parameter, index) => (
        <FormGrid columns={3} key={`${parameter.name}:${index}`}>
          <FormField label="Name">
            <input
              value={parameter.name}
              onChange={(event) => onChange(parameters.map((entry, entryIndex) =>
                entryIndex === index ? { ...entry, name: event.target.value } : entry
              ))}
            />
          </FormField>
          <FormField label="Type">
            <select
              value={parameter.valueType}
              onChange={(event) => onChange(parameters.map((entry, entryIndex) =>
                entryIndex === index ? { ...entry, valueType: event.target.value as RemakeScriptValueType } : entry
              ))}
            >
              {SCRIPT_VALUE_TYPES.filter((value) => value !== "void").map((valueType) => (
                <option key={valueType} value={valueType}>{friendlyName(valueType)}</option>
              ))}
            </select>
          </FormField>
          <button type="button" className="btn btn-danger btn-xs" onClick={() => onChange(parameters.filter((_, entryIndex) => entryIndex !== index))}>
            Remove Input
          </button>
        </FormGrid>
      ))}
    </div>
  );
}

function StateAndBindingEditor({
  project,
  onCommit
}: {
  project: Project;
  onCommit: (runtime: RemakeRuntime, label: string) => void;
}) {
  const runtime = project.remakeRuntime;
  const updateState = (stateDefinitions: RemakeStateDefinition[], label: string) => {
    onCommit({ ...runtime, stateDefinitions }, label);
  };
  const updateBindings = (behaviorBindings: RemakeBehaviorBinding[], label: string) => {
    onCommit({ ...runtime, behaviorBindings }, label);
  };
  const updateMigrations = (migrations: RemakeStateMigration[], label: string) => {
    onCommit({ ...runtime, migrations }, label);
  };
  const addState = () => {
    const suffix = runtime.stateDefinitions.length + 1;
    updateState([...runtime.stateDefinitions, {
      name: `story_state_${suffix}`,
      displayName: `Story State ${suffix}`,
      documentation: "",
      scope: "campaign",
      ownerId: "",
      schemaVersion: 1,
      valueType: "bool",
      maxLength: null,
      defaultValue: false
    }], "Add scenario state");
  };
  const addBinding = () => {
    const behavior = runtime.behaviors.find((entry) => entry.kind === "entry");
    if (!behavior) return;
    const target = targetOptions(project, behavior.role)[0];
    updateBindings([...runtime.behaviorBindings, {
      id: `binding.${portableId(project.scenario.id || project.scenario.name)}.${runtime.behaviorBindings.length + 1}`,
      targetKind: target?.kind ?? defaultTargetKind(behavior.role),
      recordId: target?.id ?? "",
      slot: behavior.role === "action" ? 0 : null,
      role: behavior.role,
      hook: behavior.hook,
      behaviorId: behavior.id,
      arguments: {},
      priority: 100
    }], "Attach scenario behavior");
  };
  const migrationHelpers = runtime.behaviors.filter((behavior) =>
    behavior.kind === "helper"
      && behavior.tier === "safe"
      && behavior.parameters.length === 0
      && behavior.returnType === "void"
  );
  const addMigration = () => {
    const helper = migrationHelpers[0];
    if (!helper) return;
    const suffix = runtime.migrations.length + 1;
    updateMigrations([...runtime.migrations, {
      id: `migration.${portableId(project.scenario.id || project.scenario.name)}.${suffix}`,
      fromContentVersion: project.scenario.contactInfo?.version || "1.0.0",
      toContentVersion: project.scenario.contactInfo?.version || "1.0.0",
      behaviorId: helper.id
    }], "Add scenario state migration");
  };

  return (
    <>
      <PanelSection
        eyebrow="Serializable Story Data"
        title="Scenario State"
        count={runtime.stateDefinitions.length}
        actions={<button type="button" className="btn btn-primary btn-sm" onClick={addState}>New State</button>}
      >
        <p>
          Named state replaces mystery flag numbers for new behavior. Choose where each value lives;
          Remake persists and migrates it with that owner.
        </p>
        {runtime.stateDefinitions.map((definition, index) => (
          <div className="rules-help-callout" key={`${definition.scope}:${definition.name}:${index}`}>
            <FormGrid columns={3}>
              <FormField label="Name">
                <input
                  value={definition.displayName}
                  onChange={(event) => updateState(runtime.stateDefinitions.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, displayName: event.target.value, name: portableFunctionName(event.target.value) }
                      : entry
                  ), "Rename scenario state")}
                />
              </FormField>
              <FormField label="Scope">
                <select
                  value={definition.scope}
                  onChange={(event) => updateState(runtime.stateDefinitions.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, scope: event.target.value as RemakeStateScope } : entry
                  ), "Change scenario state scope")}
                >
                  {SCENARIO_API_CATALOG.stateScopes.filter((scope) => scope !== "transient").map((scope) => (
                    <option key={scope} value={scope}>{friendlyName(scope)}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Type">
                <select
                  value={definition.valueType}
                  onChange={(event) => {
                    const valueType = event.target.value as RemakeScriptValueType;
                    updateState(runtime.stateDefinitions.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, valueType, defaultValue: defaultValueFor(valueType) }
                        : entry
                    ), "Change scenario state type");
                  }}
                >
                  {SCRIPT_VALUE_TYPES.filter((value) => value !== "void").map((valueType) => (
                    <option key={valueType} value={valueType}>{friendlyName(valueType)}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Description" wide>
                <input
                  value={definition.documentation}
                  placeholder="When and why is this state used?"
                  onChange={(event) => updateState(runtime.stateDefinitions.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, documentation: event.target.value } : entry
                  ), "Document scenario state")}
                />
              </FormField>
              <StateDefaultEditor
                definition={definition}
                onChange={(defaultValue) => updateState(runtime.stateDefinitions.map((entry, entryIndex) =>
                  entryIndex === index ? { ...entry, defaultValue } : entry
                ), "Change scenario state default")}
              />
            </FormGrid>
            <button type="button" className="btn btn-danger btn-xs" onClick={() => updateState(runtime.stateDefinitions.filter((_, entryIndex) => entryIndex !== index), "Delete scenario state")}>
              Delete State
            </button>
          </div>
        ))}
      </PanelSection>

      <PanelSection
        eyebrow="Released Scenario Updates"
        title="Save Migrations"
        count={runtime.migrations.length}
        actions={(
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={migrationHelpers.length === 0}
            onClick={addMigration}
          >
            New Migration
          </button>
        )}
      >
        <p>
          Connect exact released content versions with a Safe, parameterless helper. Migration helpers
          may update persistent state, but cannot show UI, start combat, or otherwise yield.
        </p>
        {migrationHelpers.length === 0 && (
          <div className="rules-help-callout">
            Create a Safe helper with no inputs and a void return before adding a migration.
          </div>
        )}
        {runtime.migrations.map((migration, index) => (
          <div className="rules-help-callout" key={migration.id}>
            <FormGrid columns={3}>
              <FormField label="From content version">
                <input
                  value={migration.fromContentVersion}
                  placeholder="1.0.0"
                  onChange={(event) => updateMigrations(runtime.migrations.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, fromContentVersion: event.target.value }
                      : entry
                  ), "Change migration source version")}
                />
              </FormField>
              <FormField label="To content version">
                <input
                  value={migration.toContentVersion}
                  placeholder="1.1.0"
                  onChange={(event) => updateMigrations(runtime.migrations.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, toContentVersion: event.target.value }
                      : entry
                  ), "Change migration target version")}
                />
              </FormField>
              <FormField label="Migration helper">
                <select
                  value={migration.behaviorId}
                  onChange={(event) => updateMigrations(runtime.migrations.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, behaviorId: event.target.value }
                      : entry
                  ), "Change migration helper")}
                >
                  {migrationHelpers.map((helper) => (
                    <option key={helper.id} value={helper.id}>{helper.name}</option>
                  ))}
                </select>
              </FormField>
            </FormGrid>
            <button
              type="button"
              className="btn btn-danger btn-xs"
              onClick={() => updateMigrations(
                runtime.migrations.filter((_, entryIndex) => entryIndex !== index),
                "Delete scenario state migration"
              )}
            >
              Delete Migration
            </button>
          </div>
        ))}
      </PanelSection>

      <PanelSection
        eyebrow="Contextual Connections"
        title="Behavior Attachments"
        count={runtime.behaviorBindings.length}
        actions={<button type="button" className="btn btn-primary btn-sm" disabled={!runtime.behaviors.some((entry) => entry.kind === "entry")} onClick={addBinding}>Attach Behavior</button>}
      >
        <p>
          Attach entry behaviors to named Action Points, encounters, spells, items, monsters, or
          campaign events. Providence keeps stable IDs and argument mappings behind these selectors.
        </p>
        {runtime.behaviorBindings.map((binding, index) => (
          <BehaviorBindingEditor
            key={binding.id}
            project={project}
            binding={binding}
            onChange={(next) => updateBindings(runtime.behaviorBindings.map((entry, entryIndex) => entryIndex === index ? next : entry), "Update behavior attachment")}
            onDelete={() => updateBindings(runtime.behaviorBindings.filter((_, entryIndex) => entryIndex !== index), "Delete behavior attachment")}
          />
        ))}
      </PanelSection>
    </>
  );
}

function BehaviorBindingEditor({
  project,
  binding,
  onChange,
  onDelete
}: {
  project: Project;
  binding: RemakeBehaviorBinding;
  onChange: (binding: RemakeBehaviorBinding) => void;
  onDelete: () => void;
}) {
  const availableBehaviors = project.remakeRuntime.behaviors.filter((behavior) => behavior.kind === "entry");
  const behavior = availableBehaviors.find((entry) => entry.id === binding.behaviorId) ?? availableBehaviors[0];
  const targets = targetOptions(project, behavior?.role ?? binding.role);
  const changeBehavior = (behaviorId: string) => {
    const nextBehavior = availableBehaviors.find((entry) => entry.id === behaviorId);
    if (!nextBehavior) return;
    const nextTargets = targetOptions(project, nextBehavior.role);
    onChange({
      ...binding,
      behaviorId,
      role: nextBehavior.role,
      hook: nextBehavior.hook,
      targetKind: nextTargets[0]?.kind ?? defaultTargetKind(nextBehavior.role),
      recordId: nextTargets[0]?.id ?? "",
      slot: nextBehavior.role === "action" ? 0 : null,
      arguments: {}
    });
  };
  return (
    <div className="rules-help-callout">
      <FormGrid columns={3}>
        <FormField label="Behavior">
          <select value={binding.behaviorId} onChange={(event) => changeBehavior(event.target.value)}>
            {availableBehaviors.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </FormField>
        <FormField label="Attach to">
          <select
            value={`${binding.targetKind}:${binding.recordId}`}
            onChange={(event) => {
              const next = targets.find((target) => `${target.kind}:${target.id}` === event.target.value);
              if (next) onChange({ ...binding, targetKind: next.kind, recordId: next.id });
            }}
          >
            {targets.map((target) => (
              <option key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>{target.label}</option>
            ))}
          </select>
        </FormField>
        <FormField label="When">
          <select value={binding.hook} onChange={(event) => onChange({ ...binding, hook: event.target.value })}>
            {(behavior ? roleRuntimeHooks(roleById(behavior.role)) : []).map((hook) => (
              <option key={hook} value={hook}>{friendlyName(hook)}</option>
            ))}
          </select>
        </FormField>
        {binding.role === "action" && (
          <FormField label="Action step">
            <select value={binding.slot ?? 0} onChange={(event) => onChange({ ...binding, slot: Number(event.target.value) })}>
              {Array.from({ length: 8 }, (_, slot) => <option key={slot} value={slot}>Step {slot + 1}</option>)}
            </select>
          </FormField>
        )}
        <FormField label="Priority" hint="Lower values run first.">
          <input type="number" value={binding.priority} onChange={(event) => onChange({ ...binding, priority: Number(event.target.value) })} />
        </FormField>
      </FormGrid>
      {behavior && behavior.parameters.length > 0 && (
        <ArgumentBindingEditor
          behavior={behavior}
          arguments={binding.arguments}
          onChange={(arguments_) => onChange({ ...binding, arguments: arguments_ })}
        />
      )}
      <button type="button" className="btn btn-danger btn-xs" onClick={onDelete}>Remove Attachment</button>
    </div>
  );
}

function ArgumentBindingEditor({
  behavior,
  arguments: arguments_,
  onChange
}: {
  behavior: RemakeBehaviorDefinition;
  arguments: Record<string, RemakeArgumentBinding>;
  onChange: (value: Record<string, RemakeArgumentBinding>) => void;
}) {
  return (
    <div>
      <strong>Inputs</strong>
      {behavior.parameters.map((parameter) => {
        const current = arguments_[parameter.name] ?? { kind: "constant", value: defaultValueFor(parameter.valueType) };
        return (
          <FormGrid columns={3} key={parameter.name}>
            <FormField label={friendlyName(parameter.name)}><input value={parameter.valueType} readOnly /></FormField>
            <FormField label="From">
              <select
                value={current.kind}
                onChange={(event) => onChange({
                  ...arguments_,
                  [parameter.name]: { kind: event.target.value as RemakeArgumentBinding["kind"], value: "" }
                })}
              >
                <option value="constant">A fixed value</option>
                <option value="state">Scenario state</option>
                <option value="context">Current context</option>
                <option value="record">Selected record</option>
              </select>
            </FormField>
            <FormField label="Value">
              <input
                value={String(current.value ?? "")}
                onChange={(event) => onChange({
                  ...arguments_,
                  [parameter.name]: { ...current, value: coerceInput(event.target.value, parameter.valueType) }
                })}
              />
            </FormField>
          </FormGrid>
        );
      })}
    </div>
  );
}

function ExtensionEditor({
  project,
  operations,
  onCommit
}: {
  project: Project;
  operations: SemanticOperation[];
  onCommit: (runtime: RemakeRuntime, label: string) => void;
}) {
  const runtime = project.remakeRuntime;
  const update = (changes: Partial<RemakeRuntime>, label: string) => onCommit({ ...runtime, ...changes }, label);
  const toggleExtension = (extensionId: string, apiVersion: number, enabled: boolean) => {
    update({
      requiredExtensions: enabled
        ? [...runtime.requiredExtensions.filter((entry) => entry.id !== extensionId), { id: extensionId, apiVersion, configuration: {} }]
        : runtime.requiredExtensions.filter((entry) => entry.id !== extensionId)
    }, enabled ? "Require Remake extension" : "Remove Remake extension");
  };
  const addSemanticAction = () => {
    const operation = operations[0];
    const record = project.triggers[0];
    if (!operation || !record) return;
    const requiredExtensions = runtime.requiredExtensions.some((entry) => entry.id === operation.extensionId)
      ? runtime.requiredExtensions
      : [...runtime.requiredExtensions, { id: operation.extensionId, apiVersion: operation.apiVersion, configuration: {} }];
    const used = new Set(runtime.semanticActions.filter((action) => action.recordId === record.id).map((action) => action.slot));
    const slot = Array.from({ length: 8 }, (_, index) => index).find((candidate) => !used.has(candidate)) ?? 0;
    update({
      requiredExtensions,
      semanticActions: [...runtime.semanticActions, {
        targetKind: "trigger",
        recordId: record.id,
        slot,
        operation: operation.id as `scenario.${string}`,
        parameters: {}
      }]
    }, "Add extension action");
  };
  const updatePlugin = (index: number, requirement: RemakePluginRequirement | null) => {
    update({
      requiredPlugins: requirement
        ? runtime.requiredPlugins.map((entry, entryIndex) => entryIndex === index ? requirement : entry)
        : runtime.requiredPlugins.filter((_, entryIndex) => entryIndex !== index)
    }, requirement ? "Update engine plug-in requirement" : "Remove engine plug-in requirement");
  };
  const addPlugin = () => {
    const used = new Set(runtime.requiredPlugins.map((entry) => entry.id));
    let sequence = runtime.requiredPlugins.length + 1;
    let id = `scenario.plugin-${sequence}`;
    while (used.has(id)) {
      sequence += 1;
      id = `scenario.plugin-${sequence}`;
    }
    update({
      requiredPlugins: [...runtime.requiredPlugins, { id, apiVersion: 1 }]
    }, "Require engine plug-in");
  };
  return (
    <>
      <PanelSection eyebrow="Installed Providers" title="Built-In Extensions" count={runtime.requiredExtensions.length}>
        <p>
          These are built-in providers shipped with Remake. Scenario packages can configure and
          require them, but cannot replace core operations.
        </p>
        {REMAKE_EXTENSION_CATALOG.extensions.map((extension) => {
          const requirement = runtime.requiredExtensions.find((entry) => entry.id === extension.id);
          return (
            <div key={extension.id} className="rules-help-callout">
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(requirement)}
                  onChange={(event) => toggleExtension(extension.id, extension.apiVersion, event.target.checked)}
                />
                {" "}{extension.id} API {extension.apiVersion}
              </label>
              <span>{extension.description}</span>
              {requirement && (
                <JsonObjectEditor
                  label="Advanced configuration"
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
      </PanelSection>
      <PanelSection
        eyebrow="Separately Installed"
        title="Engine Plug-ins"
        count={runtime.requiredPlugins.length}
      >
        <p>
          Engine plug-ins are not included in the scenario. Players install and approve them
          separately in Remake, and the exact plug-in ID and API version must be available before
          this campaign can start.
        </p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={addPlugin}>
          Add Engine Plug-in Requirement
        </button>
        {runtime.requiredPlugins.map((requirement, index) => (
          <FormGrid columns={3} key={`${requirement.id}:${index}`}>
            <FormField label="Plug-in ID">
              <input
                value={requirement.id}
                onChange={(event) => updatePlugin(index, {
                  ...requirement,
                  id: event.target.value.trim()
                })}
                placeholder="publisher.plugin-name"
              />
            </FormField>
            <FormField label="API version">
              <input
                type="number"
                min={1}
                step={1}
                value={requirement.apiVersion}
                onChange={(event) => updatePlugin(index, {
                  ...requirement,
                  apiVersion: Math.max(1, Number.parseInt(event.target.value || "1", 10))
                })}
              />
            </FormField>
            <button
              type="button"
              className="btn btn-danger btn-xs"
              onClick={() => updatePlugin(index, null)}
            >
              Remove
            </button>
          </FormGrid>
        ))}
        <div className="rules-help-callout">
          Plug-in code runs in Remake with the user&apos;s account privileges. Use Safe behaviors or
          sandboxed scripts unless the scenario genuinely needs an engine-level provider.
        </div>
      </PanelSection>
      <CollapsibleSection title="Extension action slots" eyebrow="Technical Details" defaultOpen={false}>
        <button type="button" className="btn btn-primary btn-sm" disabled={!operations.length || !project.triggers.length} onClick={addSemanticAction}>
          Add Extension Action
        </button>
        {runtime.semanticActions.map((action, index) => (
          <SemanticActionEditor
            key={`${action.targetKind}:${action.recordId}:${action.slot}:${index}`}
            project={project}
            action={action}
            operations={operations}
            onChange={(next) => update({
              semanticActions: runtime.semanticActions.map((entry, entryIndex) => entryIndex === index ? next : entry)
            }, "Update extension action")}
            onDelete={() => update({
              semanticActions: runtime.semanticActions.filter((_, entryIndex) => entryIndex !== index)
            }, "Delete extension action")}
          />
        ))}
      </CollapsibleSection>
    </>
  );
}

function ProviderBindingEditor({
  project,
  onCommit
}: {
  project: Project;
  onCommit: (runtime: RemakeRuntime, label: string) => void;
}) {
  const runtime = project.remakeRuntime;
  const updateBinding = (
    field: keyof RemakeRuntime["bindings"],
    recordId: string,
    binding: RemakeProviderBinding | null
  ) => {
    const next = { ...runtime.bindings[field] };
    if (binding) next[recordId] = binding;
    else delete next[recordId];
    onCommit({
      ...runtime,
      bindings: { ...runtime.bindings, [field]: next }
    }, "Update runtime provider binding");
  };
  return (
    <PanelSection eyebrow="Port-Owned Dispatch" title="Spell, Item, Encounter, AI, Lifecycle, and Rule Providers">
      <p>
        Most scenario work should use Behavior Attachments. Provider bindings replace a complete
        domain implementation with either a compatible behavior or an installed extension provider.
      </p>
      {PROVIDER_BINDING_FIELDS.map(([field, label, role]) => (
        <ProviderBindingFamily
          key={field}
          project={project}
          field={field}
          label={label}
          role={role}
          bindings={runtime.bindings[field]}
          onChange={(recordId, binding) => updateBinding(field, recordId, binding)}
        />
      ))}
    </PanelSection>
  );
}

function ProviderBindingFamily({
  project,
  label,
  role,
  bindings,
  onChange
}: {
  project: Project;
  field: keyof RemakeRuntime["bindings"];
  label: string;
  role: RemakeBehaviorRole;
  bindings: Record<string, RemakeProviderBinding>;
  onChange: (recordId: string, binding: RemakeProviderBinding | null) => void;
}) {
  const targets = targetOptions(project, role);
  const behaviors = project.remakeRuntime.behaviors.filter((behavior) => behavior.role === role);
  const firstTarget = targets[0];
  return (
    <CollapsibleSection title={label} count={Object.keys(bindings).length} defaultOpen={false}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={!firstTarget || !behaviors[0]}
        onClick={() => firstTarget && behaviors[0] && onChange(firstTarget.id, { kind: "script", behaviorId: behaviors[0].id })}
      >
        Add {label}
      </button>
      {Object.entries(bindings).map(([recordId, binding]) => (
        <FormGrid columns={3} key={recordId}>
          <FormField label="Record">
            <select value={recordId} onChange={(event) => {
              onChange(recordId, null);
              onChange(event.target.value, binding);
            }}>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
            </select>
          </FormField>
          <FormField label="Implementation">
            <select
              value={binding.kind === "script" ? binding.behaviorId : `extension:${binding.providerId}`}
              onChange={(event) => onChange(
                recordId,
                event.target.value.startsWith("extension:")
                  ? { kind: "extension", providerId: event.target.value.slice("extension:".length) }
                  : { kind: "script", behaviorId: event.target.value }
              )}
            >
              {behaviors.map((behavior) => <option key={behavior.id} value={behavior.id}>{behavior.name}</option>)}
              {extensionProviderOptions(role).map((providerId) => (
                <option key={providerId} value={`extension:${providerId}`}>{providerId}</option>
              ))}
            </select>
          </FormField>
          <button type="button" className="btn btn-danger btn-xs" onClick={() => onChange(recordId, null)}>Remove</button>
        </FormGrid>
      ))}
    </CollapsibleSection>
  );
}

function ScenarioApiReference() {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RemakeBehaviorRole | "all">("all");
  const [hook, setHook] = useState("all");
  const normalized = query.trim().toLowerCase();
  const selectedRole = role === "all" ? null : roleById(role);
  const pureHook = Boolean(
    selectedRole
    && (
      selectedRole.pureHooks?.includes("*")
      || (hook !== "all" && selectedRole.pureHooks?.includes(hook))
    )
  );
  const operations = SCENARIO_API_CATALOG.operations.filter((operation) =>
    (role === "all" || operation.roles.includes(role))
    && (!selectedRole || selectedRole.allowsYield || !operation.yields)
    && (!pureHook || (!operation.yields && !operation.mutates))
    && (!normalized || `${operation.label} ${operation.category} ${operation.summary} ${operation.id}`.toLowerCase().includes(normalized))
  );
  const grouped = operations.reduce<Map<string, CatalogOperation[]>>((result, operation) => {
    const entries = result.get(operation.category) ?? [];
    entries.push(operation);
    result.set(operation.category, entries);
    return result;
  }, new Map());
  return (
    <>
      <PanelSection eyebrow={`Scenario API ${SCENARIO_API_CATALOG.apiVersion}`} title="Scripting Reference" count={operations.length}>
        <p>
          This reference is loaded from the same catalog Remake validates at runtime. Every listed
          query and command has one owning port, a typed contract, and role compatibility.
        </p>
        <FormGrid columns={3}>
          <FormField label="Search">
            <input value={query} placeholder="gold, time, battle, condition…" onChange={(event) => setQuery(event.target.value)} />
          </FormField>
          <FormField label="Compatible with">
            <select value={role} onChange={(event) => {
              setRole(event.target.value as RemakeBehaviorRole | "all");
              setHook("all");
            }}>
              <option value="all">All behavior roles</option>
              {SCENARIO_API_CATALOG.roles.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </select>
          </FormField>
          <FormField label="Hook">
            <select value={hook} disabled={!selectedRole} onChange={(event) => setHook(event.target.value)}>
              <option value="all">All compatible hooks</option>
              {selectedRole ? roleRuntimeHooks(selectedRole).map((entry) => (
                <option key={entry} value={entry}>{friendlyName(entry)}</option>
              )) : null}
            </select>
          </FormField>
        </FormGrid>
        <small>
          Safe limits: {SCENARIO_API_CATALOG.limits.maxAstNodes.toLocaleString()} AST nodes,{" "}
          {SCENARIO_API_CATALOG.limits.maxArrayLength} values per array,{" "}
          {SCENARIO_API_CATALOG.limits.maxCallDepth} helper frames,{" "}
          {SCENARIO_API_CATALOG.executionBudget.toLocaleString()} deterministic execution steps.
        </small>
      </PanelSection>
      {[...grouped.entries()].map(([category, entries]) => (
        <PanelSection key={category} title={category} count={entries.length}>
          {entries.map((operation) => (
            <CollapsibleSection
              key={operation.id}
              title={operation.label}
              eyebrow={`${operation.yields ? "Yielding" : "Immediate"} · ${operation.mutates ? "Command" : "Query"}`}
              defaultOpen={false}
            >
              <p>{operation.summary}</p>
              <p>{operation.reference}</p>
              <code>{operation.example}</code>
              <small>{operation.id}</small>
            </CollapsibleSection>
          ))}
        </PanelSection>
      ))}
    </>
  );
}

function SemanticActionEditor({
  project,
  action,
  operations,
  onChange,
  onDelete
}: {
  project: Project;
  action: RemakeSemanticAction;
  operations: SemanticOperation[];
  onChange: (action: RemakeSemanticAction) => void;
  onDelete: () => void;
}) {
  const records = [
    ...project.triggers.map((record) => ({ kind: "trigger" as const, id: record.id, label: triggerLabel(record) })),
    ...project.simpleEncounters.map((record) => ({ kind: "simpleEncounter" as const, id: String(record.id), label: encounterLabel("Simple", record.id, record.texts) })),
    ...project.complexEncounters.map((record) => ({ kind: "complexEncounter" as const, id: String(record.id), label: encounterLabel("Complex", record.id, record.texts) }))
  ];
  return (
    <div className="rules-help-callout">
      <FormGrid columns={3}>
        <FormField label="Action Point or encounter">
          <select
            value={`${action.targetKind}:${action.recordId}`}
            onChange={(event) => {
              const record = records.find((entry) => `${entry.kind}:${entry.id}` === event.target.value);
              if (record) onChange({ ...action, targetKind: record.kind, recordId: record.id });
            }}
          >
            {records.map((record) => <option key={`${record.kind}:${record.id}`} value={`${record.kind}:${record.id}`}>{record.label}</option>)}
          </select>
        </FormField>
        <FormField label="Action step">
          <select value={action.slot} onChange={(event) => onChange({ ...action, slot: Number(event.target.value) })}>
            {Array.from({ length: action.targetKind === "trigger" ? 8 : 32 }, (_, slot) => (
              <option key={slot} value={slot}>Step {slot + 1}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Extension operation">
          <select value={action.operation} onChange={(event) => onChange({ ...action, operation: event.target.value as `scenario.${string}` })}>
            {operations.map((operation) => <option key={operation.id} value={operation.id}>{operation.id}</option>)}
          </select>
        </FormField>
      </FormGrid>
      <JsonObjectEditor label="Advanced parameters" value={action.parameters} onCommit={(parameters) => onChange({ ...action, parameters })} />
      <button type="button" className="btn btn-danger btn-xs" onClick={onDelete}>Delete Extension Action</button>
    </div>
  );
}

function StateDefaultEditor({
  definition,
  onChange
}: {
  definition: RemakeStateDefinition;
  onChange: (value: unknown) => void;
}) {
  if (definition.valueType === "bool") {
    return (
      <FormField label="Initial value">
        <select value={definition.defaultValue ? "true" : "false"} onChange={(event) => onChange(event.target.value === "true")}>
          <option value="false">False</option>
          <option value="true">True</option>
        </select>
      </FormField>
    );
  }
  return (
    <FormField label="Initial value">
      <input
        type={definition.valueType === "int" || definition.valueType === "float" ? "number" : "text"}
        value={Array.isArray(definition.defaultValue) ? definition.defaultValue.join(", ") : String(definition.defaultValue ?? "")}
        onChange={(event) => onChange(coerceInput(event.target.value, definition.valueType))}
      />
    </FormField>
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
    <FormField label={label} wide hint={error || "Visible only in advanced extension configuration."}>
      <textarea
        rows={4}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          try {
            const parsed: unknown = JSON.parse(text);
            if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Value must be an object.");
            setError("");
            onCommit(parsed as Record<string, unknown>);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Invalid configuration.");
          }
        }}
      />
    </FormField>
  );
}

type TargetOption = { kind: RemakeBehaviorTargetKind; id: string; label: string };

function targetOptions(project: Project, role: RemakeBehaviorRole): TargetOption[] {
  if (role === "action") {
    return project.triggers.map((record) => ({ kind: "trigger", id: record.id, label: triggerLabel(record) }));
  }
  if (role === "encounter") {
    return [
      ...project.simpleEncounters.map((record) => ({ kind: "simpleEncounter" as const, id: String(record.id), label: encounterLabel("Simple", record.id, record.texts) })),
      ...project.complexEncounters.map((record) => ({ kind: "complexEncounter" as const, id: String(record.id), label: encounterLabel("Complex", record.id, record.texts) }))
    ];
  }
  if (role === "spell") {
    return project.spellOverrides.map((record) => ({ kind: "spell", id: String(record.id), label: record.displayName || `Spell ${record.id}` }));
  }
  if (role === "item") {
    return project.scenarioItems.map((record) => ({
      kind: "item",
      id: String(record.id),
      label: project.itemTexts[record.id]?.description || `Scenario Item ${record.id}`
    }));
  }
  if (role === "monster-ai") {
    return project.monsters.map((record) => ({ kind: "monster", id: String(record.id), label: record.displayName || `Monster ${record.id}` }));
  }
  if (role === "lifecycle") {
    return [{ kind: "lifecycle", id: "campaign", label: "This Campaign" }];
  }
  if (role === "rule-modifier") {
    return [{ kind: "rule", id: "gameplay", label: "Gameplay Calculations" }];
  }
  return [];
}

function triggerLabel(record: Project["triggers"][number]) {
  const location = record.coordinate
    ? `${record.levelType ?? "map"} ${Number(record.levelIndex ?? 0) + 1} at ${record.coordinate.x},${record.coordinate.y}`
    : record.source;
  return `${location} · ${record.active ? "Active" : "Inactive"} AP`;
}

function encounterLabel(kind: string, id: number, texts: string[]) {
  const summary = texts.find((text) => text.trim())?.trim().slice(0, 64);
  return `${kind} Encounter ${id}${summary ? ` · ${summary}` : ""}`;
}

function defaultTargetKind(role: RemakeBehaviorRole): RemakeBehaviorTargetKind {
  if (role === "action") return "trigger";
  if (role === "encounter") return "simpleEncounter";
  if (role === "spell") return "spell";
  if (role === "item") return "item";
  if (role === "monster-ai") return "monster";
  if (role === "rule-modifier") return "rule";
  return "lifecycle";
}

function roleById(role: RemakeBehaviorRole) {
  return SCENARIO_API_CATALOG.roles.find((entry) => entry.id === role) ?? SCENARIO_API_CATALOG.roles[0];
}

function roleRuntimeHooks(role: CatalogRole) {
  return role.runtimeHooks ?? role.hooks;
}

function roleReturnType(role: RemakeBehaviorRole): RemakeScriptValueType {
  if (role === "helper") return "void";
  if (role === "action") return "action-outcome";
  if (role === "encounter") return "encounter-outcome";
  if (role === "spell") return "effect-outcome";
  if (role === "item") return "item-outcome";
  if (role === "monster-ai") return "monster-decision";
  if (role === "rule-modifier") return "rule-modifier";
  return "void";
}

function collectCapabilities(ast: Record<string, unknown>) {
  const capabilities = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (node.kind === "operation" && typeof node.capability === "string") capabilities.add(node.capability);
    Object.values(node).forEach(visit);
  };
  visit(ast);
  return [...capabilities].sort();
}

function emptyBehaviorAst(
  name: string,
  returnType: RemakeScriptValueType,
  parameters: RemakeScriptParameter[] = []
) {
  return {
    kind: "function",
    name,
    parameters: parameters.map((parameter) => ({
      name: parameter.name,
      valueType: parameter.valueType,
      maxLength: parameter.maxLength
    })),
    returnType,
    body: returnType === "void"
      ? [{ kind: "return" }]
      : [{ kind: "return", value: { kind: "literal", value: defaultValueFor(returnType) } }]
  };
}

function behaviorSource(behavior: RemakeBehaviorDefinition | null) {
  if (!behavior) return "";
  return behavior.tier === "safe" && behavior.ast
    ? printSafeScript(behavior.ast)
    : behavior.source ?? sandboxTemplate();
}

export function sandboxTemplate() {
  return "extends RefCounted\n\nfunc step(event: Dictionary, state: Dictionary, context) -> Dictionary:\n\treturn {\"state\": state, \"result\": {\"kind\": \"continue\"}}\n";
}

export function nextBehaviorIdentity(
  scenarioIdentity: string,
  behaviors: Pick<RemakeBehaviorDefinition, "id">[]
) {
  const prefix = `scenario.${portableId(scenarioIdentity)}.behavior-`;
  const used = new Set(behaviors.map((behavior) => behavior.id));
  let sequence = 1;
  while (used.has(`${prefix}${sequence}`)) sequence += 1;
  return { id: `${prefix}${sequence}`, sequence };
}

function extensionProviderOptions(role: RemakeBehaviorRole) {
  const field = role === "monster-ai" ? "monsterAi"
    : role === "rule-modifier" ? "gameplayRuleProviders"
      : role === "encounter" ? "encounterResolvers"
        : role === "spell" ? "spellImplementations"
          : role === "item" ? "itemBehaviorProviders"
            : role === "lifecycle" ? "lifecycleHooks"
              : null;
  if (!field) return [];
  return REMAKE_EXTENSION_CATALOG.extensions.flatMap((extension) => {
    const values = extension.capabilities[field as keyof typeof extension.capabilities];
    return Array.isArray(values) ? values.map((entry) => String(entry)) : [];
  });
}

function defaultValueFor(type: RemakeScriptValueType): unknown {
  if (type.endsWith("-array")) return [];
  if (type === "bool") return false;
  if (type === "int" || type === "float") return 0;
  if (type === "string") return "";
  if (type === "rule-modifier") return { add: 0, multiply: 1 };
  if (type === "monster-decision") return { kind: "wait" };
  if (type === "action-outcome" || type === "encounter-outcome") return { kind: "continue" };
  if (type === "effect-outcome") return { kind: "applied" };
  if (type === "item-outcome") return { kind: "used" };
  if (type.endsWith("-snapshot")) return {};
  return null;
}

function coerceInput(value: string, type: RemakeScriptValueType): unknown {
  if (type === "bool") return value === "true";
  if (type === "int") return Math.trunc(Number(value) || 0);
  if (type === "float") return Number(value) || 0;
  if (type.endsWith("-array")) return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  return value;
}

function portableId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign";
}

function portableFunctionName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "behavior";
}

function friendlyName(value: string) {
  return value
    .replace(/^core\./, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDiagnostic(diagnostic: { line: number; column: number; message: string }) {
  return `Line ${diagnostic.line}:${diagnostic.column} — ${diagnostic.message}`;
}
