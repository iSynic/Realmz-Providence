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
  project.source.origin = resolvedProjectOrigin(project.source);
  for (const file of project.source.files) file.role = normalizeSourceFileRole(file.role);
  if (project.schemaVersion < PROJECT_SCHEMA_VERSION) project.schemaVersion = PROJECT_SCHEMA_VERSION;
  project.remakeRuntime ??= emptyRemakeRuntime();
  return project;
}
