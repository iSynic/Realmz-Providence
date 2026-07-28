import { REMAKE_EXTENSION_CATALOG } from "./generated/remakeExtensionCatalog";
import { Project } from "./types";

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
    ["lifecycle", "lifecycleHooks", project.remakeRuntime.bindings.lifecycle]
  ] as const) {
    for (const [recordId, providerId] of Object.entries(values)) {
      const context = `remakeRuntime.bindings.${field}.${recordId}`;
      const binding = bindings.get(`${capability}:${providerId}`);
      if (!binding) {
        errors.push(`${context} uses unavailable built-in provider '${providerId}'.`);
        continue;
      }
      requireOwner(context, binding.owner, requiredIds, errors);
    }
  }

  return errors;
}

export function isRemakeOnly(project: Project) {
  return project.remakeRuntime.semanticActions.length > 0
    || project.remakeRuntime.scripts.length > 0
    || project.remakeRuntime.scriptAttachments.length > 0
    || project.remakeRuntime.persistentVariables.length > 0
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
