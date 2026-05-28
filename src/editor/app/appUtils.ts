import { LibraryCatalog, Project } from "../types";
import { commandError } from "../utils";

let mapFocusNonce = 0;

export function normalizeDialogPath(value: string | string[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

export function pathBaseName(path: string) {
  return path.split(/[\\/]/).filter(Boolean).pop() || "Untitled Scenario";
}

export function parentPath(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 1) return "";
  const driveMatch = path.match(/^[A-Za-z]:/);
  const parentParts = parts.slice(0, -1);
  if (driveMatch && parentParts[0] === driveMatch[0]) {
    return `${parentParts[0]}\\${parentParts.slice(1).join("\\")}`;
  }
  return parentParts.join("\\");
}

export function defaultProjectPath(projectRoot: string, scenarioName: string) {
  return `${projectRoot}\\${sanitizePackageName(scenarioName)}.providence`;
}

export function defaultExportPath(exportRoot: string, scenarioName: string) {
  return `${exportRoot}\\${sanitizePackageName(scenarioName)}`;
}

export function isPaintableSpecialLandLibraryAsset(asset: LibraryCatalog["assets"][number]) {
  if (asset.resourceType !== "cicn") return false;
  return (
    asset.type === "special-land-tile" ||
    asset.relativePath.includes("Land Archive") ||
    asset.label.includes("Special Land") ||
    (typeof asset.resourceId === "number" && (asset.resourceId < 0 || isActorIconResourceId(Math.abs(asset.resourceId))))
  );
}

export function nextUntitledProjectName() {
  return `Untitled Scenario ${new Date().toISOString().slice(0, 10)}`;
}

export function isMissingProjectJson(error: unknown) {
  const message = commandError(error).toLowerCase();
  return message.includes("project.json") || message.includes("notfound") || message.includes("not found");
}

export function isProjectEmpty(project: Project) {
  return (
    project.maps.length === 0 &&
    project.triggers.length === 0 &&
    project.randomLevels.length === 0 &&
    project.extracodes.length === 0 &&
    project.source.files.length === 0 &&
    project.semanticSchema.records.length === 0 &&
    project.semanticSchema.entities.length === 0 &&
    project.records.alignments.length === 0 &&
    Object.keys(project.records.counts).length === 0
  );
}

export function nextMapFocusNonce() {
  mapFocusNonce += 1;
  return mapFocusNonce;
}

export function mapIdForEntity(project: Project | null, id: string) {
  if (!project) return null;
  const triggerMatch = id.match(/^trigger:(land|dungeon):(\d+):\d+$/);
  if (triggerMatch) return `${triggerMatch[1]}:${triggerMatch[2]}`;
  const randomMatch = id.match(/^random:(land|dungeon):(\d+):\d+$/);
  if (randomMatch) return `${randomMatch[1]}:${randomMatch[2]}`;
  const entity = project.semanticSchema.entities.find((candidate) => candidate.id === id);
  if (!entity) return null;
  if (entity.type === "trigger" || entity.type === "random-region") {
    const levelType = stringSummary(entity.summary.levelType);
    const levelIndex = numberSummary(entity.summary.levelIndex);
    if (levelType && levelIndex != null) return `${levelType}:${levelIndex}`;
  }
  if (entity.type === "map record") {
    const level = numberSummary(entity.summary.level);
    const isDungeon = booleanSummary(entity.summary.isDungeon);
    if (level != null && isDungeon != null) return `${isDungeon ? "dungeon" : "land"}:${level}`;
  }
  const mapLink = project.semanticSchema.links.find(
    (link) =>
      link.from === id &&
      ["located_on", "describes_map", "occupies_region", "names_map_level"].includes(link.kind) &&
      link.to.startsWith("map:")
  );
  return mapLink ? mapLink.to.replace(/^map:/, "") : null;
}

function isActorIconResourceId(resourceId: number) {
  return (
    (resourceId >= 379 && resourceId <= 461) ||
    (resourceId >= 464 && resourceId <= 496) ||
    (resourceId >= 500 && resourceId <= 590) ||
    (resourceId >= 600 && resourceId <= 619) ||
    (resourceId >= 692 && resourceId <= 824)
  );
}

function sanitizePackageName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Untitled Scenario";
}

function stringSummary(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberSummary(value: unknown) {
  return typeof value === "number" ? value : null;
}

function booleanSummary(value: unknown) {
  return typeof value === "boolean" ? value : null;
}
