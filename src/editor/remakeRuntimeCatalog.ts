import { REMAKE_EXTENSION_CATALOG } from "./generated/remakeExtensionCatalog";
import SCENARIO_API_CATALOG_JSON from "../../schemas/remake-scenario-capabilities.v2.json";
import {
  Project,
  RemakeBehaviorDefinition,
  RemakeBehaviorRole,
  RemakeScriptValueType
} from "./types";

type JsonSchema = {
  type?: string;
  enum?: readonly unknown[];
  required?: readonly string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
};

type CatalogEntry = string | {
  id: string;
  parametersSchema?: JsonSchema;
};

type ScenarioCatalogRole = {
  id: RemakeBehaviorRole;
  resultType: string;
  hooks: string[];
  runtimeHooks?: string[];
  allowsYield: boolean;
  pureHooks?: string[];
};

type ScenarioCatalogOperation = {
  id: string;
  roles: RemakeBehaviorRole[];
  yields: boolean;
  mutates: boolean;
};

const SCENARIO_API_CATALOG = SCENARIO_API_CATALOG_JSON as {
  apiVersion: number;
  roles: ScenarioCatalogRole[];
  operations: ScenarioCatalogOperation[];
};

export function validateRemakeRuntime(project: Project): string[] {
  const errors: string[] = [];
  const extensions = new Map<string, (typeof REMAKE_EXTENSION_CATALOG.extensions)[number]>(
    REMAKE_EXTENSION_CATALOG.extensions.map((extension) => [extension.id, extension])
  );
  const bindings = new Map<string, { owner: string; entry: CatalogEntry }>();
  for (const extension of REMAKE_EXTENSION_CATALOG.extensions) {
    for (const [capability, rawEntries] of Object.entries(extension.capabilities)) {
      for (const entry of rawEntries as readonly CatalogEntry[]) {
        const id = typeof entry === "string" ? entry : entry.id;
        bindings.set(`${capability}:${id}`, { owner: extension.id, entry });
      }
    }
  }

  const requiredIds = new Set<string>();
  for (const requirement of project.remakeRuntime.requiredExtensions) {
    if (requiredIds.has(requirement.id)) {
      errors.push(`remakeRuntime.requiredExtensions duplicates '${requirement.id}'.`);
      continue;
    }
    requiredIds.add(requirement.id);
    const extension = extensions.get(requirement.id);
    if (!extension) {
      errors.push(`Required built-in Remake extension '${requirement.id}' is unavailable.`);
      continue;
    }
    if (requirement.apiVersion !== extension.apiVersion) {
      errors.push(
        `Remake extension '${requirement.id}' requires API ${requirement.apiVersion} `
        + `but Providence provides API ${extension.apiVersion}.`
      );
    }
    const schemaError = validateSchema(
      requirement.configuration,
      extension.configurationSchema,
      `Remake extension '${requirement.id}' configuration`
    );
    if (schemaError) errors.push(schemaError);
  }

  const occupied = new Set<string>();
  for (const action of project.remakeRuntime.semanticActions) {
    const context = `Remake semantic action ${action.targetKind}:${action.recordId} slot ${action.slot}`;
    const slotKey = `${action.targetKind}\u0000${action.recordId}\u0000${action.slot}`;
    if (occupied.has(slotKey)) errors.push(`${context} is duplicated.`);
    occupied.add(slotKey);
    const maxSlot = action.targetKind === "trigger" ? 7 : 31;
    if (!Number.isInteger(action.slot) || action.slot < 0 || action.slot > maxSlot) {
      errors.push(`${context} must use a slot from 0 through ${maxSlot}.`);
    }
    const recordExists = action.targetKind === "trigger"
      ? project.triggers.some((record) => record.id === action.recordId)
      : action.targetKind === "simpleEncounter"
        ? project.simpleEncounters.some((record) => String(record.id) === action.recordId)
        : project.complexEncounters.some((record) => String(record.id) === action.recordId);
    if (!recordExists) errors.push(`${context} references an unavailable record.`);
    if (!isNamespaced(action.operation) || action.operation.startsWith("core.")) {
      errors.push(`${context} operation '${action.operation}' must use an additive scenario namespace.`);
      continue;
    }
    const binding = bindings.get(`semanticOperations:${action.operation}`);
    if (!binding) {
      errors.push(`${context} uses unavailable semantic operation '${action.operation}'.`);
      continue;
    }
    requireOwner(context, binding.owner, requiredIds, errors);
    if (typeof binding.entry !== "string") {
      const schemaError = validateSchema(
        action.parameters,
        binding.entry.parametersSchema,
        `${context} parameters`
      );
      if (schemaError) errors.push(schemaError);
    }
  }

  for (const [field, capability, values] of [
    ["spells", "spells", project.remakeRuntime.bindings.spells],
    ["items", "itemBehaviors", project.remakeRuntime.bindings.items],
    ["encounters", "encounterResolvers", project.remakeRuntime.bindings.encounters],
    ["monsterAi", "monsterAiProviders", project.remakeRuntime.bindings.monsterAi],
    ["lifecycle", "lifecycleHooks", project.remakeRuntime.bindings.lifecycle],
    ["ruleModifiers", "gameplayRuleProviders", project.remakeRuntime.bindings.ruleModifiers]
  ] as const) {
    for (const [recordId, providerBinding] of Object.entries(values)) {
      const context = `remakeRuntime.bindings.${field}.${recordId}`;
      if (providerBinding.kind === "script") {
        const behavior = project.remakeRuntime.behaviors.find((entry) => entry.id === providerBinding.behaviorId);
        if (!behavior) errors.push(`${context} references unavailable behavior '${providerBinding.behaviorId}'.`);
        continue;
      }
      const providerId = providerBinding.providerId;
      const binding = bindings.get(`${capability}:${providerId}`);
      if (!binding) {
        errors.push(`${context} uses unavailable built-in provider '${providerId}'.`);
        continue;
      }
      requireOwner(context, binding.owner, requiredIds, errors);
    }
  }

  validateBehaviors(project, errors);

  return errors;
}

export function isRemakeOnly(project: Project) {
  return project.remakeRuntime.semanticActions.length > 0
    || project.remakeRuntime.behaviors.length > 0
    || project.remakeRuntime.behaviorBindings.length > 0
    || project.remakeRuntime.stateDefinitions.length > 0
    || Object.values(project.remakeRuntime.bindings).some(
      (bindings) => Object.keys(bindings).length > 0
    );
}

function requireOwner(
  context: string,
  owner: string,
  requiredIds: Set<string>,
  errors: string[]
) {
  if (!requiredIds.has(owner)) {
    errors.push(
      `${context} requires remakeRuntime.requiredExtensions to include '${owner}'.`
    );
  }
}

function isNamespaced(value: string) {
  return /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/.test(value);
}

function validateBehaviors(project: Project, errors: string[]) {
  const roles = new Map(
    SCENARIO_API_CATALOG.roles.map((role) => [role.id, role])
  );
  const operations = new Map(
    SCENARIO_API_CATALOG.operations.map((operation) => [operation.id, operation])
  );
  const behaviors = new Map<string, RemakeBehaviorDefinition>();
  for (const behavior of project.remakeRuntime.behaviors) {
    const context = `Scenario behavior '${behavior.id || behavior.name}'`;
    if (!behavior.id || behaviors.has(behavior.id)) {
      errors.push(`${context} has a missing or duplicate stable ID.`);
      continue;
    }
    behaviors.set(behavior.id, behavior);
    if (behavior.apiVersion !== SCENARIO_API_CATALOG.apiVersion) {
      errors.push(
        `${context} uses Scenario API ${behavior.apiVersion}; `
        + `this Providence build provides API ${SCENARIO_API_CATALOG.apiVersion}.`
      );
    }
    const roleId = behavior.kind === "helper" ? "helper" : behavior.role;
    const role = roles.get(roleId);
    if (!role) {
      errors.push(`${context} uses unavailable role '${roleId}'.`);
      continue;
    }
    const runtimeHooks = role.runtimeHooks ?? role.hooks;
    if (behavior.kind === "entry" && !runtimeHooks.includes(behavior.hook)) {
      errors.push(
        `${context} hook '${behavior.hook}' is not connected to a runtime boundary `
        + `for role '${roleId}'.`
      );
    }
    if (behavior.kind === "helper" && behavior.hook) {
      errors.push(`${context} is a helper and cannot declare hook '${behavior.hook}'.`);
    }
    const expectedReturnType = roleReturnType(role.resultType);
    if (behavior.kind === "entry" && behavior.returnType !== expectedReturnType) {
      errors.push(
        `${context} role '${roleId}' must return '${expectedReturnType}', `
        + `not '${behavior.returnType}'.`
      );
    }
    const pure = (role.pureHooks ?? []).some(
      (hook) => hook === "*" || hook === behavior.hook
    );
    const seenCapabilities = new Set<string>();
    for (const capability of behavior.requestedCapabilities) {
      if (seenCapabilities.has(capability)) {
        errors.push(`${context} requests capability '${capability}' more than once.`);
        continue;
      }
      seenCapabilities.add(capability);
      const operation = operations.get(capability);
      if (!operation) {
        errors.push(`${context} requests unavailable capability '${capability}'.`);
        continue;
      }
      if (!operation.roles.includes(roleId)) {
        errors.push(
          `${context} cannot use capability '${capability}' from role '${roleId}'.`
        );
      }
      if (operation.yields && !role.allowsYield) {
        errors.push(
          `${context} role '${roleId}' cannot use yielding capability '${capability}'.`
        );
      }
      if (pure && (operation.yields || operation.mutates)) {
        errors.push(
          `${context} pure hook '${behavior.hook}' cannot yield or mutate state.`
        );
      }
    }
  }

  const bindingIds = new Set<string>();
  for (const binding of project.remakeRuntime.behaviorBindings) {
    const context = `Scenario behavior binding '${binding.id || binding.behaviorId}'`;
    if (!binding.id || bindingIds.has(binding.id)) {
      errors.push(`${context} has a missing or duplicate stable ID.`);
      continue;
    }
    bindingIds.add(binding.id);
    const behavior = behaviors.get(binding.behaviorId);
    if (!behavior) {
      errors.push(`${context} references unavailable behavior '${binding.behaviorId}'.`);
      continue;
    }
    if (binding.role !== behavior.role || binding.hook !== behavior.hook) {
      errors.push(
        `${context} role and hook must match behavior '${binding.behaviorId}'.`
      );
    }
    const role = roles.get(binding.role);
    const runtimeHooks = role?.runtimeHooks ?? role?.hooks ?? [];
    if (!runtimeHooks.includes(binding.hook)) {
      errors.push(
        `${context} hook '${binding.hook}' is not connected to a runtime boundary `
        + `for role '${binding.role}'.`
      );
    }
    const targetError = validateBehaviorTarget(project, binding.targetKind, binding.recordId);
    if (targetError) errors.push(`${context} ${targetError}`);
    const parameterNames = new Set(behavior.parameters.map((parameter) => parameter.name));
    for (const parameter of behavior.parameters) {
      if (!(parameter.name in binding.arguments)) {
        errors.push(
          `${context} requires an argument binding for '${parameter.name}'.`
        );
      }
    }
    for (const name of Object.keys(binding.arguments)) {
      if (!parameterNames.has(name)) {
        errors.push(`${context} maps unknown argument '${name}'.`);
      }
    }
  }
}

function roleReturnType(resultType: string): RemakeScriptValueType {
  const resultTypes: Record<string, RemakeScriptValueType> = {
    ActionOutcome: "action-outcome",
    EncounterOutcome: "encounter-outcome",
    EffectOutcome: "effect-outcome",
    ItemOutcome: "item-outcome",
    MonsterDecision: "monster-decision",
    RuleModifier: "rule-modifier",
    void: "void"
  };
  return resultTypes[resultType] ?? "void";
}

function validateBehaviorTarget(
  project: Project,
  targetKind: string,
  recordId: string
): string | null {
  const exists = targetKind === "trigger"
    ? project.triggers.some((record) => record.id === recordId)
    : targetKind === "simpleEncounter"
      ? project.simpleEncounters.some((record) => String(record.id) === recordId)
        : targetKind === "complexEncounter"
          ? project.complexEncounters.some((record) => String(record.id) === recordId)
          : targetKind === "spell"
          ? project.spellOverrides.some((record) => String(record.id) === recordId)
          : targetKind === "item"
            ? project.scenarioItems.some((record) => String(record.id) === recordId)
            : targetKind === "monster"
              ? project.monsters.some((record) => String(record.id) === recordId)
              : targetKind === "lifecycle" || targetKind === "rule";
  return exists ? null : `references unavailable ${targetKind} record '${recordId}'.`;
}

function validateSchema(
  value: unknown,
  schema: JsonSchema | undefined,
  context: string
): string | null {
  if (!schema) return null;
  const typeValid = !schema.type
    || (schema.type === "object" && Boolean(value) && typeof value === "object" && !Array.isArray(value))
    || (schema.type === "array" && Array.isArray(value))
    || (schema.type === "string" && typeof value === "string")
    || (schema.type === "integer" && Number.isInteger(value))
    || (schema.type === "number" && typeof value === "number" && Number.isFinite(value))
    || (schema.type === "boolean" && typeof value === "boolean");
  if (!typeValid) return `${context} must be a JSON ${schema.type}.`;
  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    return `${context} is not one of the allowed values.`;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in object)) return `${context} requires '${required}'.`;
    }
    for (const [key, child] of Object.entries(object)) {
      const childSchema = schema.properties?.[key];
      if (!childSchema) {
        if (schema.additionalProperties === false) return `${context} does not allow '${key}'.`;
        continue;
      }
      const childError = validateSchema(child, childSchema, `${context}.${key}`);
      if (childError) return childError;
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (let index = 0; index < value.length; index += 1) {
      const childError = validateSchema(value[index], schema.items, `${context}[${index}]`);
      if (childError) return childError;
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) return `${context} is below the allowed minimum.`;
    if (schema.maximum !== undefined && value > schema.maximum) return `${context} exceeds the allowed maximum.`;
  }
  return null;
}
