import {
  emptyRemakeRuntime,
  type Project,
  type ProjectOrigin,
  type ProjectSource,
  type SourceFileRole
} from "./types";
import { PROVIDENCE_PROJECT_SCHEMA_VERSION } from "./generated/providenceProjectContract";

export const PROJECT_SCHEMA_VERSION = PROVIDENCE_PROJECT_SCHEMA_VERSION;

export function resolvedProjectOrigin(source: ProjectSource): ProjectOrigin {
  if (source.origin === "authored" || source.origin === "imported") return source.origin;
  return source.immutable || source.files.length > 0 ? "imported" : "authored";
}

export function requiresCompatibilityAnnex(project: Pick<Project, "source">) {
  return resolvedProjectOrigin(project.source) === "imported";
}

export function normalizeSourceFileRole(value: string | undefined, fallback: SourceFileRole = "unknown"): SourceFileRole {
  if (value === "supported-binary" || value === "pass-through" || value === "resource-fork" || value === "unknown") return value;
  return fallback;
}

export function normalizeProjectContract(project: Project): Project {
  const upgradingToAuthoringTargets = project.schemaVersion < 7;
  project.source.origin = resolvedProjectOrigin(project.source);
  for (const file of project.source.files) file.role = normalizeSourceFileRole(file.role);
  project.remakeRuntime = normalizeRemakeRuntime(project.remakeRuntime);
  const remakeOnly = project.remakeRuntime.semanticActions.length > 0
    || project.remakeRuntime.behaviors.length > 0
    || project.remakeRuntime.behaviorBindings.length > 0
    || project.remakeRuntime.stateDefinitions.length > 0
    || Object.values(project.remakeRuntime.bindings).some((bindings) => Object.keys(bindings).length > 0);
  project.authoringTarget ??= upgradingToAuthoringTargets && remakeOnly
    ? "remake-enhanced"
    : "classic-compatible";
  if (project.schemaVersion < PROJECT_SCHEMA_VERSION) project.schemaVersion = PROJECT_SCHEMA_VERSION;
  return project;
}

function normalizeRemakeRuntime(value: Project["remakeRuntime"] | null | undefined): Project["remakeRuntime"] {
  if (!value) return emptyRemakeRuntime();
  const legacy = value as unknown as Record<string, any>;
  const runtime = {
    ...emptyRemakeRuntime(),
    ...value,
    behaviors: Array.isArray(legacy.behaviors) ? legacy.behaviors : [],
    behaviorBindings: Array.isArray(legacy.behaviorBindings) ? legacy.behaviorBindings : [],
    stateDefinitions: Array.isArray(legacy.stateDefinitions) ? legacy.stateDefinitions : [],
    migrations: Array.isArray(legacy.migrations)
      ? legacy.migrations.map((migration: Record<string, any>) => ({
          id: String(migration.id ?? ""),
          fromContentVersion: String(migration.fromContentVersion ?? migration.fromVersion ?? ""),
          toContentVersion: String(migration.toContentVersion ?? migration.toVersion ?? ""),
          behaviorId: String(migration.behaviorId ?? "")
        }))
      : [],
    requiredPlugins: Array.isArray(legacy.requiredPlugins) ? legacy.requiredPlugins : [],
    bindings: {
      ...emptyRemakeRuntime().bindings,
      ...(legacy.bindings ?? {})
    }
  } as Project["remakeRuntime"];

  const legacyScripts = Array.isArray(legacy.scripts) ? legacy.scripts : [];
  const legacyAttachments = Array.isArray(legacy.scriptAttachments) ? legacy.scriptAttachments : [];
  if (!runtime.behaviors.length && legacyScripts.length) {
    runtime.behaviors = legacyScripts.map((script: Record<string, any>) => {
      const attachment = legacyAttachments.find((entry: Record<string, any>) => entry.scriptId === script.id);
      const role = attachment?.targetKind === "lifecycle"
        ? "lifecycle"
        : attachment?.targetKind === "simpleEncounter" || attachment?.targetKind === "complexEncounter"
          ? "encounter"
          : attachment ? "action" : "helper";
      return {
        id: script.id,
        name: script.name,
        description: script.documentation ?? "",
        kind: role === "helper" ? "helper" : "entry",
        role,
        hook: role === "action" ? "run" : role === "encounter" ? "result" : role === "lifecycle" ? String(attachment?.hook ?? "campaign-start") : "",
        tier: script.tier === "safe" ? "safe" : "sandboxed",
        apiVersion: 2,
        behaviorVersion: 1,
        stateSchemaVersion: 1,
        parameters: script.parameters ?? [],
        returnType: script.returnType ?? "void",
        requestedCapabilities: script.requestedCapabilities ?? [],
        stateSchema: script.stateSchema ?? {},
        sourceMap: script.sourceMap ?? {},
        ast: script.ast ?? null,
        source: script.source ?? null
      };
    });
  }
  if (!runtime.behaviorBindings.length && legacyAttachments.length) {
    runtime.behaviorBindings = legacyAttachments.map((attachment: Record<string, any>, index: number) => {
      const behavior = runtime.behaviors.find((entry) => entry.id === attachment.scriptId);
      return {
        id: `binding.${portableBindingId(attachment.scriptId ?? "behavior")}.${index + 1}`,
        targetKind: attachment.targetKind,
        recordId: attachment.recordId ?? "",
        slot: attachment.slot ?? null,
        role: behavior?.role ?? "action",
        hook: behavior?.hook ?? "run",
        behaviorId: attachment.scriptId,
        arguments: {},
        priority: 0
      };
    });
  }
  const legacyVariables = Array.isArray(legacy.persistentVariables) ? legacy.persistentVariables : [];
  if (!runtime.stateDefinitions.length && legacyVariables.length) {
    runtime.stateDefinitions = legacyVariables.map((variable: Record<string, any>) => ({
      name: variable.name,
      displayName: variable.name,
      documentation: "",
      scope: "campaign",
      ownerId: "",
      schemaVersion: 1,
      valueType: variable.valueType,
      maxLength: variable.maxLength ?? null,
      defaultValue: variable.defaultValue
    }));
  }
  for (const behavior of runtime.behaviors) behavior.sourceMap ??= {};
  for (const group of Object.values(runtime.bindings)) {
    for (const [key, binding] of Object.entries(group)) {
      if (typeof binding === "string") {
        group[key] = { kind: "extension", providerId: binding };
      }
    }
  }
  return runtime;
}

function portableBindingId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9.-]+/g, "-").replace(/^-|-$/g, "") || "behavior";
}
