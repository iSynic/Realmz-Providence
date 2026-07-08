import { LibraryCatalog, MapRecord, Project } from "../types";
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

export function playerMapMarkerIconIds(record: MapRecord) {
  const ids = new Set<number>();
  for (const marker of record.markers ?? []) {
    if (marker.iconId !== 0) ids.add(Math.abs(marker.iconId));
  }
  const raw = record.rawBytes ?? [];
  for (let slot = 0; slot < 10; slot += 1) {
    const offset = slot * 6;
    if (raw.length < offset + 2) continue;
    const iconId = readSignedShort(raw, offset);
    if (iconId !== 0) ids.add(Math.abs(iconId));
  }
  return [...ids];
}

export function nextUntitledProjectName() {
  return `Untitled Scenario ${new Date().toISOString().slice(0, 10)}`;
}

export function isMissingProjectJson(error: unknown) {
  const message = commandError(error).toLowerCase();
  return message.includes("project.json") || message.includes("notfound") || message.includes("not found");
}

export function isProjectEmpty(project: Project) {
  const hasAuthoredRecords = [
    project.triggers,
    project.extracodes,
    project.messages,
    project.optionLabels,
    project.battles,
    project.monsters,
    project.monsterSets,
    project.monsterDescriptions,
    project.monsterIconOverrides,
    project.scenarioIconResources,
    project.scenarioItems,
    project.treasures,
    project.shops,
    project.simpleEncounters,
    project.complexEncounters,
    project.thiefEncounters,
    project.timedEncounters,
    project.questLabels,
    project.spellOverrides,
    project.raceOverrides,
    project.casteOverrides,
    project.assets,
    project.mapRecords,
    project.customLandlooks,
    project.editorMetadata?.tilePalettes,
    project.editorMetadata?.mapStamps,
    project.editorMetadata?.questThreads,
    project.editorMetadata?.questContextSources
  ].some((records) => (records?.length ?? 0) > 0);
  return (
    !hasAuthoredRecords &&
    (project.maps.length === 0 || hasOnlyStarterLandMap(project)) &&
    (project.randomLevels.length === 0 || hasOnlyStarterLandRandomLevel(project)) &&
    project.landLayout == null &&
    project.source.files.length === 0 &&
    (project.semanticSchema?.records ?? []).length === 0 &&
    (project.semanticSchema?.entities ?? []).length === 0 &&
    project.records.alignments.length === 0 &&
    Object.keys(project.records.counts).length === 0
  );
}

function hasOnlyStarterLandMap(project: Project) {
  if (project.maps.length !== 1) return false;
  const map = project.maps[0];
  return map.id === "land:0" &&
    map.levelType === "land" &&
    map.index === 0 &&
    map.source === "Data LD" &&
    map.name === "Land level 0" &&
    map.width === 90 &&
    map.height === 90 &&
    map.render?.landlook === 0 &&
    map.render?.tilesetId === "landlook-0" &&
    map.tiles.length === 90 * 90 &&
    map.tiles.every((tile) => tile === 156);
}

function hasOnlyStarterLandRandomLevel(project: Project) {
  if (project.randomLevels.length !== 1) return false;
  const level = project.randomLevels[0];
  return level.id === "land:0:randlevel" &&
    level.source === "Data RD" &&
    level.levelType === "land" &&
    level.levelIndex === 0 &&
    level.landlook === 0 &&
    level.isDark === false &&
    level.useLos === false &&
    level.rects.length === 0 &&
    (level.rawValues?.length ?? 0) === 644 / 2 &&
    (level.rawValues ?? []).every((value) => value === 0);
}

export function isSemanticMappingPending(project: Project | null) {
  if (!project) return false;
  if ((project.semanticSchema?.schemaVersion ?? 0) !== 5) return true;
  const activeExtraActions = project.triggers.filter((trigger) => trigger.source === "Data ED3" && trigger.active !== false).length;
  if (activeExtraActions === 0) return false;
  return (project.semanticSchema?.decoding?.ed3Reachability ?? []).length < activeExtraActions;
}

export function nextMapFocusNonce() {
  mapFocusNonce += 1;
  return mapFocusNonce;
}

export function mapIdForEntity(project: Project | null, id: string) {
  if (!project) return null;
  const mapMatch = id.match(/^map:(land|dungeon):(\d+)$/);
  if (mapMatch) return `${mapMatch[1]}:${mapMatch[2]}`;
  const triggerMatch = id.match(/^trigger:(land|dungeon):(\d+):\d+$/);
  if (triggerMatch) return `${triggerMatch[1]}:${triggerMatch[2]}`;
  const randomMatch = id.match(/^random:(land|dungeon):(\d+):\d+$/);
  if (randomMatch) return `${randomMatch[1]}:${randomMatch[2]}`;
  const mapRecordMatch = id.match(/^map-record:(-?\d+)$/);
  if (mapRecordMatch) {
    const record = project.mapRecords.find((candidate) => candidate.id === Number(mapRecordMatch[1]));
    if (record?.level != null) return `${record.isDungeon ? "dungeon" : "land"}:${record.level}`;
  }
  return null;
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

function readSignedShort(bytes: number[], offset: number) {
  const unsigned = ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
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
