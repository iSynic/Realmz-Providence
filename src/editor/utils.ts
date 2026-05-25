import {
  Issue,
  LevelType,
  Project,
  SelectedEntity,
  SemanticEntity,
  SemanticLink,
  SemanticRecord
} from "./types";
import { semanticEntityById, semanticIndex, semanticLinksForId, semanticRecordById } from "./semanticIndex";

export function hasDesktopRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function commandError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

export function mapEntityId(levelType: LevelType, index: number) {
  return `map:${levelType}:${index}`;
}

export function triggerEntityId(levelType: LevelType | null, levelIndex: number | null, recordIndex: number, source: string) {
  if (source === "Data ED3") return `macro:${recordIndex}`;
  return `trigger:${levelType ?? "unknown"}:${levelIndex ?? 0}:${recordIndex}`;
}

export function selectedEntityForSemantic(entity: SemanticEntity): SelectedEntity {
  if (entity.type === "scenario") return { type: "record", id: entity.id };
  if (entity.type === "trigger") return { type: "trigger", id: entity.id };
  if (entity.type === "macro") return { type: "macro", id: entity.id };
  if (entity.type === "map") return { type: "map", id: entity.id };
  if (
    entity.type === "resource" ||
    entity.type === "resource type" ||
    entity.type === "picture" ||
    entity.type === "icon-resource" ||
    entity.type === "sound" ||
    entity.type === "text-resource" ||
    entity.type === "style-resource" ||
    entity.type === "string-list-resource" ||
    entity.type === "realmz-metadata-resource" ||
    entity.type === "version-resource" ||
    entity.type === "tile atlas" ||
    entity.type === "asset-fallback" ||
    entity.type === "render-profile" ||
    entity.type === "runtime-cache"
  ) {
    return { type: "resource", id: entity.id };
  }
  if (entity.type.includes("encounter")) return { type: "encounter", id: entity.id };
  if (entity.type === "battle") return { type: "battle", id: entity.id };
  if (entity.type === "monster") return { type: "monster", id: entity.id };
  if (entity.type === "message") return { type: "message", id: entity.id };
  if (entity.type === "shop") return { type: "shop", id: entity.id };
  if (entity.type === "item-reference" || entity.type === "spell-reference") return { type: "record", id: entity.id };
  if (entity.type === "quest flag") return { type: "questFlag", id: entity.id };
  return { type: "record", id: entity.id };
}

export function selectEntityFromId(id: string): SelectedEntity {
  if (id.startsWith("map:")) return { type: "map", id };
  if (id.startsWith("scenario:")) return { type: "record", id };
  if (id.startsWith("trigger:")) return { type: "trigger", id };
  if (id.startsWith("macro:")) return { type: "macro", id };
  if (id.startsWith("action-slot:")) return { type: "record", id };
  if (id.startsWith("random:")) return { type: "encounter", id };
  if (
    id.startsWith("resource:") ||
    id.startsWith("resource-type:") ||
    id.startsWith("picture:") ||
    id.startsWith("sound:") ||
    id.startsWith("asset:") ||
    id.startsWith("render-profile:") ||
    id.startsWith("asset-fallback:") ||
    id.startsWith("runtime-cache:")
  ) {
    return { type: "resource", id };
  }
  if (id.startsWith("encounter:")) return { type: "encounter", id };
  if (id.startsWith("battle:")) return { type: "battle", id };
  if (id.startsWith("monster:")) return { type: "monster", id };
  if (id.startsWith("message:")) return { type: "message", id };
  if (id.startsWith("shop:")) return { type: "shop", id };
  if (id.startsWith("treasure:") || id.startsWith("thief:") || id.startsWith("time:") || id.startsWith("contact:") || id.startsWith("solids:") || id.startsWith("menu:") || id.startsWith("item:") || id.startsWith("spell:")) {
    return { type: "record", id };
  }
  if (id.startsWith("quest-flag:")) return { type: "questFlag", id };
  return { type: "record", id };
}

export function findSemanticEntity(project: Project | null, selected: SelectedEntity | null) {
  if (!project || !selected) return null;
  return semanticEntityById(project, selected.id);
}

export function findSemanticRecord(project: Project | null, id: string | null): SemanticRecord | null {
  return semanticRecordById(project, id);
}

export function linksFor(project: Project | null, id: string | null) {
  return semanticLinksForId(project, id);
}

export function semanticLabel(project: Project | null, id: string) {
  if (!project) return id;
  const index = semanticIndex(project);
  return (
    index.entitiesById.get(id)?.label ??
    index.recordsById.get(id)?.label ??
    id
  );
}

export function issuesFor(project: Project | null): Issue[] {
  if (!project) return [];
  return [
    ...project.validation.errors.map((message) => ({ severity: "error", message, source: "project" })),
    ...project.validation.warnings.map((message) => ({ severity: "warning", message, source: "project" })),
    ...project.semanticSchema.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: diagnostic.source ?? diagnostic.type,
      target: typeof diagnostic.data.target === "string" ? diagnostic.data.target : null
    })),
    ...project.diagnostics.map((diagnostic) => ({
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: diagnostic.source ?? diagnostic.code
    }))
  ];
}

export function compactValue(value: unknown) {
  if (value === null || value === undefined) return "none";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length > 10 ? `${value.slice(0, 10).join(", ")}...` : value.join(", ");
  return JSON.stringify(value);
}

export function entityTypeCount(project: Project | null, type: string) {
  return project?.semanticSchema.entities.filter((entity) => entity.type === type).length ?? 0;
}
