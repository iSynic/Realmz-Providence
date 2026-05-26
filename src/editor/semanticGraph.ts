import {
  MapEntity,
  Project,
  RandomLevel,
  RandomRect,
  SemanticEntity,
  SemanticLink,
  SemanticRecord,
  SemanticSource,
  TilesetAsset,
  TriggerRecord
} from "./types";
import { mapEntityId, triggerEntityId } from "./utils";
import { semanticEntityById, semanticLinkById, semanticLinksForId, semanticRecordById } from "./semanticIndex";

const MAP_LINK_KINDS = new Set(["located_on", "contains_region", "describes_map", "configures_map", "names_map_level"]);
const TEXT_LINK_KINDS = new Set(["shows_message", "uses_resource", "has_text_resource", "has_style_resource", "has_name_evidence"]);
const BATTLE_LINK_KINDS = new Set(["starts_battle", "spawns_battle", "uses_monster", "mutates_encounter_state"]);
const ENCOUNTER_LINK_KINDS = new Set(["starts_encounter", "uses_thief_encounter"]);
const QUEST_LINK_KINDS = new Set([
  "opens_shop",
  "gives_treasure",
  "requires_item",
  "reads_flag",
  "writes_flag",
  "calls_macro",
  "calls_battle_macro",
  "branches_to",
  "branches_true",
  "branches_false",
  "branches_keep",
  "branches_drop",
  "selects_characters",
  "alters_party_state",
  "alters_character_state",
  "mutates_time_encounter"
]);
const MUTATION_LINK_KINDS = new Set([
  "uses_map_record",
  "mutates_tile",
  "mutates_trigger",
  "mutates_random_region",
  "changes_rendering",
  "mutates_cache",
  "writes_runtime_state",
  "copied_to_cache"
]);

export type SemanticRecordGroup = {
  source: SemanticSource;
  records: SemanticRecord[];
};

export type ResourceGap = {
  entity: SemanticEntity;
  consumers: SemanticLink[];
  reason: string;
};

export function schemaEntities(project: Project | null, type?: string) {
  const entities = project?.semanticSchema.entities ?? [];
  return type ? entities.filter((entity) => entity.type === type) : entities;
}

export function entityById(project: Project | null, id: string | null | undefined) {
  return semanticEntityById(project, id);
}

export function recordById(project: Project | null, id: string | null | undefined) {
  return semanticRecordById(project, id);
}

export function sourceByName(project: Project | null, name: string) {
  return project?.semanticSchema.sources.find((source) => source.name === name || source.id === `source:file:${name}`) ?? null;
}

export function linkById(project: Project | null, id: string | null | undefined) {
  return semanticLinkById(project, id);
}

export function semanticLinksFor(project: Project | null, id: string | null | undefined) {
  return semanticLinksForId(project, id);
}

export function outgoingLinks(project: Project | null, id: string | null | undefined, kinds?: Iterable<string>) {
  return filterLinks(semanticLinksFor(project, id).outgoing, kinds);
}

export function incomingLinks(project: Project | null, id: string | null | undefined, kinds?: Iterable<string>) {
  return filterLinks(semanticLinksFor(project, id).incoming, kinds);
}

export function linkedEntities(project: Project | null, id: string, kinds?: Iterable<string>, direction: "outgoing" | "incoming" = "outgoing") {
  const links = direction === "outgoing" ? outgoingLinks(project, id, kinds) : incomingLinks(project, id, kinds);
  return links
    .map((link) => entityById(project, direction === "outgoing" ? link.to : link.from))
    .filter(Boolean) as SemanticEntity[];
}

export function semanticTriggersForMap(project: Project | null, map: MapEntity | null) {
  if (!project || !map) return [];
  const mapId = mapEntityId(map.levelType, map.index);
  const triggerEntities = incomingLinks(project, mapId, ["located_on"])
    .map((link) => entityById(project, link.from))
    .filter((entity): entity is SemanticEntity => entity?.type === "trigger");
  const records = triggerEntities
    .map((entity) => triggerRecordForEntity(project, entity))
    .filter((trigger): trigger is TriggerRecord => Boolean(trigger?.active));
  return records.length > 0
    ? records
    : project.triggers.filter((trigger) => trigger.active && trigger.levelType === map.levelType && trigger.levelIndex === map.index);
}

export function semanticMapRecordsForMap(project: Project | null, map: MapEntity | null) {
  if (!project || !map) return [];
  const mapId = mapEntityId(map.levelType, map.index);
  const linked = incomingLinks(project, mapId, ["describes_map"])
    .map((link) => entityById(project, link.from))
    .filter((entity): entity is SemanticEntity => entity?.type === "map record");
  if (linked.length > 0) return linked;
  return schemaEntities(project, "map record").filter((entity) => {
    const level = numberSummary(entity, "level");
    const isDungeon = booleanSummary(entity, "isDungeon");
    return level === map.index && isDungeon === (map.levelType === "dungeon");
  });
}

export function semanticRandomRegionsForMap(project: Project | null, map: MapEntity | null) {
  if (!project || !map) return [];
  const mapId = mapEntityId(map.levelType, map.index);
  return incomingLinks(project, mapId, ["contains_region"])
    .map((link) => entityById(project, link.from))
    .filter((entity): entity is SemanticEntity => entity?.type === "random-region")
    .sort((a, b) => (numberSummary(a, "rectIndex") ?? 0) - (numberSummary(b, "rectIndex") ?? 0));
}

export function semanticRandomLevelForMap(project: Project | null, map: MapEntity | null): RandomLevel | null {
  if (!project || !map) return null;
  const fallback = project.randomLevels.find((level) => level.levelType === map.levelType && level.levelIndex === map.index) ?? null;
  if (fallback) return fallback;
  const regions = semanticRandomRegionsForMap(project, map);
  const configRecord = incomingLinks(project, mapEntityId(map.levelType, map.index), ["configures_map"])
    .map((link) => recordById(project, link.from))
    .find(Boolean);
  if (regions.length === 0 && !configRecord) return fallback;
  return {
    id: `${map.levelType}-${map.index}`,
    source: map.levelType === "land" ? "Data RD" : "Data RDD",
    levelType: map.levelType,
    levelIndex: map.index,
    landlook: numberRecordSummary(configRecord, "landlook") ?? map.render.landlook ?? -1,
    isDark: booleanRecordSummary(configRecord, "isDark") ?? false,
    useLos: booleanRecordSummary(configRecord, "useLos") ?? false,
    rects: regions.length > 0 ? regions.map(randomRectFromEntity) : [],
    rawValues: undefined,
    provenance: undefined
  };
}

export function semanticTilesetForMap(project: Project | null, map: MapEntity | null): TilesetAsset | null {
  if (!project || !map) return null;
  const liveTileset = project.assetCatalog.tilesets.find((tileset) => tileset.id === map.render.tilesetId);
  if (liveTileset) return liveTileset;
  const mapId = mapEntityId(map.levelType, map.index);
  const profile = linkedEntities(project, mapId, ["has_render_profile"])[0];
  const atlasId = profile
    ? outgoingLinks(project, profile.id, ["renders_with"])
        .map((link) => link.to)
        .find((id) => id.startsWith("asset:tile-atlas:"))
    : null;
  const tilesetId = atlasId?.replace("asset:tile-atlas:", "") ?? stringSummary(profile, "tilesetId") ?? map.render.tilesetId;
  return (
    project.assetCatalog.tilesets.find((tileset) => tileset.id === tilesetId) ??
    project.assetCatalog.tilesets.find((tileset) => tileset.landlook === (numberSummary(profile, "landlook") ?? map.render.landlook)) ??
    null
  );
}

export function actionSlotEntitiesForScript(project: Project | null, entity: SemanticEntity) {
  return linkedEntities(project, entity.id, ["has_action_slot"])
    .filter((slot) => slot.type === "action-slot")
    .sort((a, b) => (numberSummary(a, "slot") ?? 0) - (numberSummary(b, "slot") ?? 0));
}

export function actionSlotEntitiesForTriggerRecord(project: Project | null, trigger: TriggerRecord) {
  const entity = triggerEntityForRecord(project, trigger);
  return entity ? actionSlotEntitiesForScript(project, entity) : [];
}

export function scriptPrimaryCategory(project: Project | null, entity: SemanticEntity) {
  const slot = actionSlotEntitiesForScript(project, entity)[0];
  return stringSummary(slot, "category") ?? "unknown";
}

export function triggerOverlayKinds(project: Project | null, trigger: TriggerRecord) {
  const kinds = new Set<"battle" | "encounter" | "map" | "quest" | "text" | "unknown">();
  const slots = actionSlotEntitiesForTriggerRecord(project, trigger);
  if (slots.length === 0) {
    for (const action of trigger.actions) kinds.add(overlayKindForLegacyCategory(action.category));
    return kinds;
  }
  for (const slot of slots) {
    const links = outgoingLinks(project, slot.id);
    if (links.length === 0 && stringSummary(slot, "category") === "unknown") kinds.add("unknown");
    for (const link of links) {
      if (TEXT_LINK_KINDS.has(link.kind)) kinds.add("text");
      else if (BATTLE_LINK_KINDS.has(link.kind)) kinds.add("battle");
      else if (ENCOUNTER_LINK_KINDS.has(link.kind)) kinds.add("encounter");
      else if (MAP_LINK_KINDS.has(link.kind) || MUTATION_LINK_KINDS.has(link.kind)) kinds.add("map");
      else if (QUEST_LINK_KINDS.has(link.kind)) kinds.add("quest");
      else if (link.kind !== "uses_parameter_row") kinds.add("unknown");
    }
  }
  return kinds;
}

export function triggerEntityForRecord(project: Project | null, trigger: TriggerRecord) {
  const id = triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source);
  return entityById(project, id);
}

export function ed3ReachabilityFor(project: Project | null, recordIndex: number) {
  return project?.semanticSchema.decoding?.ed3Reachability?.find((row) => row.recordIndex === recordIndex) ?? null;
}

export function isCallableMacro(project: Project | null, trigger: TriggerRecord) {
  if (trigger.source !== "Data ED3") return false;
  const entity = triggerEntityForRecord(project, trigger);
  const row = ed3ReachabilityFor(project, trigger.recordIndex);
  if (entity?.type === "macro" && entity.summary.callable !== false) return true;
  if (row?.reachable) return true;
  if (project?.editorMetadata?.displayNames?.[trigger.id]?.source === "user") return true;
  if (trigger.provenance?.confidence === "inferred") return true;
  if ((project?.semanticSchema.schemaVersion ?? 0) < 4 && trigger.active) return true;
  return false;
}

export function ed3EvidenceRecords(project: Project | null) {
  if (!project) return [];
  return project.triggers
    .filter((trigger) => trigger.source === "Data ED3" && !isCallableMacro(project, trigger))
    .sort((a, b) => a.recordIndex - b.recordIndex);
}

export function semanticRecordGroups(project: Project | null): SemanticRecordGroup[] {
  if (!project) return [];
  return project.semanticSchema.sources
    .map((source) => ({
      source,
      records: project.semanticSchema.records.filter((record) => record.source === source.id)
    }))
    .filter((group) => group.records.length > 0 || group.source.layout || group.source.origin !== "runtime-cache");
}

export function resourceMembersForType(project: Project | null, typeEntityId: string) {
  return incomingLinks(project, typeEntityId, ["member_of_resource_type"])
    .map((link) => entityById(project, link.from))
    .filter((entity): entity is SemanticEntity => entity?.type === "resource");
}

export function resourceConsumers(project: Project | null, resourceId: string) {
  return incomingLinks(project, resourceId).filter((link) => link.kind !== "member_of_resource_type" && link.kind !== "styled_by");
}

export function resourceGaps(project: Project | null): ResourceGap[] {
  if (!project) return [];
  return schemaEntities(project, "resource")
    .filter((entity) => booleanSummary(entity, "referenceOnly") || booleanSummary(entity, "sharedFallback") || booleanSummary(entity, "scenarioSupplied") === false)
    .map((entity) => ({
      entity,
      consumers: resourceConsumers(project, entity.id),
      reason: booleanSummary(entity, "sharedFallback")
        ? "shared Realmz fallback"
        : booleanSummary(entity, "referenceOnly")
          ? "referenced but not scenario-supplied"
          : "scenario resource missing"
    }));
}

export function generatedRuntimeCaches(project: Project | null) {
  return schemaEntities(project, "runtime-cache").sort((a, b) => a.id.localeCompare(b.id));
}

export function assetFallbacks(project: Project | null) {
  return schemaEntities(project, "asset-fallback").sort((a, b) => a.id.localeCompare(b.id));
}

export function sourcePassThroughList(project: Project | null) {
  if (!project) return [] as SemanticSource[];
  const names = new Set(project.validation.passThroughFiles);
  return project.semanticSchema.sources.filter((source) => names.has(source.name));
}

export function editableSemanticRecords(project: Project | null) {
  return project?.semanticSchema.records.filter((record) => record.editState === "editable") ?? [];
}

export function blockedSemanticObjects(project: Project | null) {
  if (!project) return { entities: [] as SemanticEntity[], records: [] as SemanticRecord[] };
  return {
    entities: project.semanticSchema.entities.filter((entity) => entity.editState === "blocked"),
    records: project.semanticSchema.records.filter((record) => record.editState === "blocked")
  };
}

export function unresolvedLinks(project: Project | null) {
  if (!project) return [] as SemanticLink[];
  const known = new Set([
    ...project.semanticSchema.entities.map((entity) => entity.id),
    ...project.semanticSchema.records.map((record) => record.id),
    ...project.semanticSchema.sources.map((source) => source.id)
  ]);
  return project.semanticSchema.links.filter((link) => !known.has(link.from) || !known.has(link.to));
}

export function numberSummary(entity: SemanticEntity | null | undefined, key: string) {
  const value = entity?.summary[key];
  return typeof value === "number" ? value : null;
}

export function stringSummary(entity: SemanticEntity | null | undefined, key: string) {
  const value = entity?.summary[key];
  return typeof value === "string" ? value : null;
}

export function booleanSummary(entity: SemanticEntity | null | undefined, key: string) {
  const value = entity?.summary[key];
  return typeof value === "boolean" ? value : null;
}

function numberRecordSummary(record: SemanticRecord | null | undefined, key: string) {
  const value = record?.summary[key];
  return typeof value === "number" ? value : null;
}

function booleanRecordSummary(record: SemanticRecord | null | undefined, key: string) {
  const value = record?.summary[key];
  return typeof value === "boolean" ? value : null;
}

function filterLinks(links: SemanticLink[], kinds?: Iterable<string>) {
  if (!kinds) return links;
  const wanted = new Set(kinds);
  return links.filter((link) => wanted.has(link.kind));
}

function triggerRecordForEntity(project: Project, entity: SemanticEntity) {
  const match = entity.id.match(/^trigger:(land|dungeon):(\d+):(\d+)$/);
  if (!match) return null;
  const [, levelType, levelIndex, recordIndex] = match;
  return project.triggers.find(
    (trigger) =>
      trigger.source !== "Data ED3" &&
      trigger.levelType === levelType &&
      trigger.levelIndex === Number(levelIndex) &&
      trigger.recordIndex === Number(recordIndex)
  ) ?? null;
}

function randomRectFromEntity(entity: SemanticEntity): RandomRect {
  const rect = rectSummary(entity);
  return {
    rectIndex: numberSummary(entity, "rectIndex") ?? 0,
    top: rect.top,
    left: rect.left,
    bottom: rect.bottom,
    right: rect.right,
    percent: numberSummary(entity, "percent") ?? 0,
    battleRange: numberArraySummary(entity, "battleRange", 2),
    randomDoors: numberArraySummary(entity, "randomDoors", 3),
    randomDoorPercent: numberArraySummary(entity, "randomDoorPercent", 3),
    only: booleanSummary(entity, "only") ?? false,
    option: numberSummary(entity, "option") ?? 0,
    sound: numberSummary(entity, "sound") ?? 0,
    text: numberSummary(entity, "text") ?? 0
  };
}

function rectSummary(entity: SemanticEntity) {
  const rect = entity.summary.rect;
  if (rect && typeof rect === "object" && !Array.isArray(rect)) {
    const value = rect as Record<string, unknown>;
    return {
      top: typeof value.top === "number" ? value.top : 0,
      left: typeof value.left === "number" ? value.left : 0,
      bottom: typeof value.bottom === "number" ? value.bottom : 0,
      right: typeof value.right === "number" ? value.right : 0
    };
  }
  return { top: 0, left: 0, bottom: 0, right: 0 };
}

function numberArraySummary(entity: SemanticEntity, key: string, length: number) {
  const value = entity.summary[key];
  const numbers = Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
  return Array.from({ length }, (_, index) => numbers[index] ?? 0);
}

function overlayKindForLegacyCategory(category: string): "battle" | "encounter" | "map" | "quest" | "text" | "unknown" {
  if (category === "encounter") return "encounter";
  if (category === "combat") return "battle";
  if (category === "map") return "map";
  if (category === "ui_text") return "text";
  if (["branch", "state", "time", "registration", "item_shop"].includes(category)) return "quest";
  return "unknown";
}
