import { useMemo, useState } from "react";
import { Braces, Play, Plus, Trash2 } from "lucide-react";
import SCENARIO_API_CATALOG_JSON from "../../../schemas/remake-scenario-capabilities.v2.json";
import type {
  Project,
  ProjectCommand,
  RemakeArgumentBinding,
  RemakeBehaviorBinding,
  RemakeBehaviorDefinition,
  RemakeBehaviorRole,
  RemakeBehaviorTargetKind,
  RemakeScriptValueType
} from "../types";
import { CollapsibleSection, FormField, FormGrid } from "../ui";

const SCENARIO_API_CATALOG = SCENARIO_API_CATALOG_JSON as {
  apiVersion: number;
  roles: Array<{ id: RemakeBehaviorRole; label: string }>;
};

type ContextualBehaviorCardProps = {
  project: Project;
  role: Exclude<RemakeBehaviorRole, "helper">;
  hook: string;
  targetKind: RemakeBehaviorTargetKind;
  recordId: string;
  recordLabel: string;
  slot?: number | null;
  onApplyCommand?: (command: ProjectCommand) => void;
  onOpenWorkbench?: () => void;
};

export function ContextualBehaviorCard({
  project,
  role,
  hook,
  targetKind,
  recordId,
  recordLabel,
  slot = null,
  onApplyCommand,
  onOpenWorkbench
}: ContextualBehaviorCardProps) {
  const runtime = project.remakeRuntime;
  const compatible = useMemo(
    () => runtime.behaviors.filter((behavior) =>
      behavior.kind === "entry" && behavior.role === role && behavior.hook === hook
    ),
    [hook, role, runtime.behaviors]
  );
  const bindings = useMemo(
    () => runtime.behaviorBindings.filter((binding) =>
      binding.targetKind === targetKind
      && binding.recordId === recordId
      && binding.role === role
      && binding.hook === hook
      && (binding.slot ?? null) === slot
    ),
    [hook, recordId, role, runtime.behaviorBindings, slot, targetKind]
  );
  const [selectedBehaviorId, setSelectedBehaviorId] = useState(compatible[0]?.id ?? "");
  const roleContract = SCENARIO_API_CATALOG.roles.find((entry) => entry.id === role);
  const location = slot == null ? recordLabel : `${recordLabel}, position ${slot + 1}`;

  if (project.authoringTarget !== "remake-enhanced") return null;

  const commit = (next: typeof runtime, label: string) => {
    onApplyCommand?.({ kind: "updateRemakeRuntime", label, runtime: next });
  };
  const attach = (behavior: RemakeBehaviorDefinition) => {
    const existing = bindings.find((binding) => binding.behaviorId === behavior.id);
    if (existing) return;
    const binding: RemakeBehaviorBinding = {
      id: nextStableId(
        `binding.${portableId(project.scenario.id || project.scenario.name)}.${portableId(role)}`,
        runtime.behaviorBindings.map((entry) => entry.id)
      ),
      targetKind,
      recordId,
      slot,
      role,
      hook,
      behaviorId: behavior.id,
      arguments: Object.fromEntries(
        behavior.parameters.map((parameter) => [
          parameter.name,
          defaultArgumentBinding(parameter.valueType)
        ])
      ),
      priority: nextPriority(bindings)
    };
    commit({
      ...runtime,
      behaviorBindings: [...runtime.behaviorBindings, binding]
    }, `Attach ${behavior.name} to ${recordLabel}`);
  };
  const createAndAttach = () => {
    const suffix = runtime.behaviors.length + 1;
    const behaviorId = nextStableId(
      `scenario.${portableId(project.scenario.id || project.scenario.name)}.${portableId(role)}-behavior`,
      runtime.behaviors.map((entry) => entry.id)
    );
    const returnType = roleReturnType(role);
    const behavior: RemakeBehaviorDefinition = {
      id: behaviorId,
      name: `${roleContract?.label ?? friendlyName(role)} Behavior ${suffix}`,
      description: `Runs from ${location}.`,
      kind: "entry",
      role,
      hook,
      tier: "safe",
      apiVersion: SCENARIO_API_CATALOG.apiVersion,
      behaviorVersion: 1,
      stateSchemaVersion: 1,
      parameters: [],
      returnType,
      requestedCapabilities: [],
      stateSchema: {},
      sourceMap: { schemaVersion: 1, nodes: {} },
      ast: emptyBehaviorAst(`behavior_${suffix}`, returnType, role),
      source: null
    };
    const binding: RemakeBehaviorBinding = {
      id: nextStableId(
        `binding.${portableId(project.scenario.id || project.scenario.name)}.${portableId(role)}`,
        runtime.behaviorBindings.map((entry) => entry.id)
      ),
      targetKind,
      recordId,
      slot,
      role,
      hook,
      behaviorId,
      arguments: {},
      priority: nextPriority(bindings)
    };
    commit({
      ...runtime,
      behaviors: [...runtime.behaviors, behavior],
      behaviorBindings: [...runtime.behaviorBindings, binding]
    }, `Create behavior for ${recordLabel}`);
    setSelectedBehaviorId(behaviorId);
  };
  const detach = (bindingId: string) => {
    commit({
      ...runtime,
      behaviorBindings: runtime.behaviorBindings.filter((binding) => binding.id !== bindingId)
    }, `Detach behavior from ${recordLabel}`);
  };
  const preview = (behaviorId: string) => {
    window.localStorage.setItem("providence.remakePreviewIntent", JSON.stringify({
      behaviorId, role, hook, targetKind, recordId, slot
    }));
    window.dispatchEvent(new CustomEvent("providence:preview-behavior", {
      detail: { behaviorId, role, hook, targetKind, recordId, slot }
    }));
  };

  return (
    <CollapsibleSection
      title="Behavior"
      eyebrow={friendlyName(hook)}
      count={bindings.length}
      density="compact"
      defaultOpen={bindings.length > 0}
      className="contextual-behavior-card"
      storageKey={`behavior.${targetKind}.${recordId}.${slot ?? "record"}.${hook}`}
    >
      <p className="contextual-behavior-intro">
        Add Remake behavior to <strong>{location}</strong>. New behavior uses the Safe interpreter
        and can be edited visually or as synchronized Safe source.
      </p>
      {bindings.map((binding) => {
        const behavior = runtime.behaviors.find((entry) => entry.id === binding.behaviorId);
        return (
          <div className="contextual-behavior-row" key={binding.id}>
            <div>
              <strong>{behavior?.name ?? binding.behaviorId}</strong>
              <small>{behavior?.description || `${roleContract?.label ?? friendlyName(role)} · ${friendlyName(hook)}`}</small>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={() => preview(binding.behaviorId)}
              title="Open this entry point in the managed Remake preview"
            >
              <Play size={12} /> Preview This
            </button>
            <button
              type="button"
              className="btn btn-danger btn-xs"
              onClick={() => detach(binding.id)}
              aria-label={`Detach ${behavior?.name ?? binding.behaviorId}`}
            >
              <Trash2 size={12} /> Detach
            </button>
          </div>
        );
      })}
      <FormGrid columns={2}>
        <FormField
          label="Reuse a behavior"
          hint={compatible.length
            ? "Only behaviors with a compatible role and hook appear here."
            : "Create the first compatible Safe behavior below."}
        >
          <select
            value={selectedBehaviorId}
            disabled={compatible.length === 0}
            onChange={(event) => setSelectedBehaviorId(event.currentTarget.value)}
          >
            {compatible.length === 0 && <option value="">No compatible behavior yet</option>}
            {compatible.map((behavior) => (
              <option key={behavior.id} value={behavior.id}>{behavior.name}</option>
            ))}
          </select>
        </FormField>
        <div className="contextual-behavior-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!selectedBehaviorId || !onApplyCommand}
            onClick={() => {
              const behavior = compatible.find((entry) => entry.id === selectedBehaviorId);
              if (behavior) attach(behavior);
            }}
          >
            <Braces size={13} /> Attach Existing
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!onApplyCommand}
            onClick={createAndAttach}
          >
            <Plus size={13} /> Create Safe Behavior
          </button>
          {onOpenWorkbench && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenWorkbench}>
              Open Library
            </button>
          )}
        </div>
      </FormGrid>
      {slot != null && (
        <small className="contextual-behavior-note">
          This binding occupies action position {slot + 1} in the Remake export. The original
          Classic action remains in the Providence project and returns if the behavior is detached.
        </small>
      )}
    </CollapsibleSection>
  );
}

function defaultArgumentBinding(valueType: RemakeScriptValueType): RemakeArgumentBinding {
  if (valueType === "bool") return { kind: "constant", value: false };
  if (valueType === "int" || valueType === "float") return { kind: "constant", value: 0 };
  if (valueType.endsWith("-array")) return { kind: "constant", value: [] };
  if (valueType.endsWith("-snapshot") || valueType.endsWith("-outcome") || valueType === "monster-decision" || valueType === "rule-modifier") {
    return { kind: "constant", value: {} };
  }
  return { kind: "constant", value: "" };
}

function roleReturnType(role: RemakeBehaviorRole): RemakeScriptValueType {
  if (role === "action") return "action-outcome";
  if (role === "encounter") return "encounter-outcome";
  if (role === "spell") return "effect-outcome";
  if (role === "item") return "item-outcome";
  if (role === "monster-ai") return "monster-decision";
  if (role === "rule-modifier") return "rule-modifier";
  return "void";
}

function emptyBehaviorAst(
  name: string,
  returnType: RemakeScriptValueType,
  role: RemakeBehaviorRole
) {
  return {
    kind: "function",
    name,
    parameters: [],
    returnType,
    body: returnType === "void"
      ? [{ kind: "return" }]
      : [{
        kind: "return",
        value: { kind: "literal", value: defaultOutcome(role) }
      }]
  };
}

function defaultOutcome(role: RemakeBehaviorRole) {
  if (role === "monster-ai") return { kind: "wait" };
  if (role === "rule-modifier") return { add: 0, multiply: 1 };
  if (role === "spell") return { kind: "applied" };
  if (role === "item") return { kind: "used" };
  return { kind: "continue" };
}

function nextPriority(bindings: RemakeBehaviorBinding[]) {
  return bindings.reduce((highest, binding) => Math.max(highest, binding.priority), -1) + 1;
}

function nextStableId(prefix: string, existing: string[]) {
  const used = new Set(existing);
  for (let suffix = 1; suffix < 100_000; suffix += 1) {
    const candidate = `${prefix}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`Could not allocate a stable ID beneath '${prefix}'.`);
}

function portableId(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "scenario";
}

function friendlyName(value: string) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}
