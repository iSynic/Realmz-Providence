import { messageUsageLinks, optionLabelUsageLinks, resourceUsageLinks, type ContentUsageLink } from "./contentLinks";
import { LibraryCatalog, Project, RealmzTargetRecordKind, SemanticLink } from "./types";

export type DirectRecordRow = {
  id: string;
  label: string;
  type: string;
  summary: string;
};

export type ProjectRecordIndex = {
  messages: Map<number, Project["messages"][number]>;
  optionLabels: Map<number, Project["optionLabels"][number]>;
  triggers: Map<string, Project["triggers"][number]>;
  battles: Map<number, Project["battles"][number]>;
  monsters: Map<number, Project["monsters"][number]>;
  treasures: Map<number, Project["treasures"][number]>;
  shops: Map<number, Project["shops"][number]>;
  simpleEncounters: Map<number, Project["simpleEncounters"][number]>;
  complexEncounters: Map<number, Project["complexEncounters"][number]>;
  thiefEncounters: Map<number, Project["thiefEncounters"][number]>;
  timedEncounters: Map<number, Project["timedEncounters"][number]>;
  items: Map<number, Project["scenarioItems"][number]>;
  maps: Map<string, Project["maps"][number]>;
  assets: Map<string, Project["assets"][number]>;
  resources: Map<string, { label: string; type: string; resourceType: string; resourceId: number; previewPath?: string | null; source?: string | null }>;
};

const indexCache = new WeakMap<Project, ProjectRecordIndex>();

export function buildProjectRecordIndex(project: Project): ProjectRecordIndex {
  const cached = indexCache.get(project);
  if (cached) return cached;
  const resources = new Map<ProjectRecordIndex["resources"] extends Map<infer K, unknown> ? K : string, ProjectRecordIndex["resources"] extends Map<string, infer V> ? V : never>();
  const addResource = (resourceType: string, resourceId: number, label: string, source?: string | null, previewPath?: string | null) => {
    resources.set(resourceKey(resourceType, resourceId), { label, type: resourceTypeToEntityType(resourceType), resourceType, resourceId, previewPath, source });
  };
  for (const asset of project.assets ?? []) {
    addResource(asset.resourceType, asset.resourceId, asset.label, "project asset", asset.previewPath);
  }
  for (const picture of project.assetCatalog.pictures ?? []) {
    addResource(picture.resourceType, picture.resourceId, picture.name || `${picture.resourceType} ${picture.resourceId}`, picture.source, picture.previewPath);
  }
  for (const icon of project.assetCatalog.icons ?? []) {
    addResource(icon.resourceType, icon.resourceId, icon.name || `${icon.resourceType} ${icon.resourceId}`, icon.source, icon.previewPath);
  }
  for (const tileset of project.assetCatalog.tilesets ?? []) {
    if (tileset.pictId != null) addResource("PICT", tileset.pictId, tileset.name, tileset.source, tileset.imagePath);
  }
  const index: ProjectRecordIndex = {
    messages: new Map((project.messages ?? []).map((record) => [record.id, record])),
    optionLabels: new Map((project.optionLabels ?? []).map((record) => [record.id, record])),
    triggers: new Map((project.triggers ?? []).map((record) => [record.id, record])),
    battles: new Map((project.battles ?? []).map((record) => [record.id, record])),
    monsters: new Map((project.monsters ?? []).map((record) => [record.id, record])),
    treasures: new Map((project.treasures ?? []).map((record) => [record.id, record])),
    shops: new Map((project.shops ?? []).map((record) => [record.id, record])),
    simpleEncounters: new Map((project.simpleEncounters ?? []).map((record) => [record.id, record])),
    complexEncounters: new Map((project.complexEncounters ?? []).map((record) => [record.id, record])),
    thiefEncounters: new Map((project.thiefEncounters ?? []).map((record) => [record.id, record])),
    timedEncounters: new Map((project.timedEncounters ?? []).map((record) => [record.id, record])),
    items: new Map((project.scenarioItems ?? []).map((record) => [record.itemId || 800 + record.id, record])),
    maps: new Map((project.maps ?? []).map((record) => [`map:${record.levelType}:${record.index}`, record])),
    assets: new Map((project.assets ?? []).map((record) => [record.id, record])),
    resources
  };
  indexCache.set(project, index);
  return index;
}

export function labelForSelectedId(project: Project | null, catalog: LibraryCatalog | null | undefined, id: string | null | undefined): string {
  if (!id) return "";
  if (project) {
    const index = buildProjectRecordIndex(project);
    const parsed = parseSelectedId(id);
    if (parsed) {
      const { type, numericId } = parsed;
      if (type === "message") return messageLabel(index.messages.get(numericId), numericId);
      if (type === "option-label") return optionLabel(index.optionLabels.get(numericId), numericId);
      if (type === "battle") return `Battle ${numericId}`;
      if (type === "monster") return index.monsters.get(numericId)?.displayName || `Monster ${numericId}`;
      if (type === "treasure") return `Treasure ${numericId}`;
      if (type === "shop") return `Shop ${numericId}`;
      if (type === "item") return `Item ${numericId}`;
      if (type === "encounter:simple") return `Simple Encounter ${numericId}`;
      if (type === "encounter:complex") return `Complex Encounter ${numericId}`;
      if (type === "thief") return `Rogue Encounter ${numericId}`;
      if (type === "time") return `Time Encounter ${numericId}`;
      if (type === "resource" && "resourceType" in parsed) {
        const resourceType = parsed.resourceType ?? "";
        const resource = index.resources.get(resourceKey(resourceType, numericId));
        return resource?.label ?? `${resourceType} ${numericId}`;
      }
    }
    if (id.startsWith("trigger:") || id.startsWith("macro:")) {
      const trigger = [...index.triggers.values()].find((record) => record.id === id);
      if (trigger) return trigger.source === "Data ED3" ? `Reusable Action ${trigger.recordIndex}` : `Action Point ${trigger.recordIndex}`;
    }
    if (id.startsWith("map:")) return index.maps.get(id)?.name ?? id;
    if (id.startsWith("asset:")) return index.assets.get(id)?.label ?? id;
  }
  const library = catalog?.entities.find((entity) => entity.id === id) ?? catalog?.records.find((record) => record.id === id);
  return library?.label ?? id;
}

export function directUsagesFor(project: Project | null, id: string | null | undefined): ContentUsageLink[] {
  if (!project || !id) return [];
  const parsed = parseSelectedId(id);
  if (!parsed) return [];
  if (parsed.type === "message") return messageUsageLinks(project, parsed.numericId);
  if (parsed.type === "option-label") return optionLabelUsageLinks(project, parsed.numericId);
  if (parsed.type === "resource" && "resourceType" in parsed) return resourceUsageLinks(project, parsed.resourceType, parsed.numericId);
  if (parsed.type === "item") return itemUsageLinks(project, parsed.numericId);
  return [];
}

export function directSemanticLinksFor(project: Project | null, id: string | null | undefined): SemanticLink[] {
  return directUsagesFor(project, id).map((usage, index) => ({
    id: `direct:${id}:${usage.key}:${index}`,
    from: usage.entity?.id ?? usage.key,
    to: id ?? "",
    kind: usage.detail || "direct usage",
    confidence: "source-backed",
    evidence: [usage.label],
    metadata: { label: usage.label, detail: usage.detail, direct: true }
  }));
}

export function directRecordsForTool(project: Project | null, toolId: string): DirectRecordRow[] {
  if (!project) return [];
  const rowsFor = (recordType: RealmzTargetRecordKind) => targetRecords(project, recordType).map((record) => ({
    id: targetEntityId(recordType, record.id),
    label: `${targetRecordLabel(recordType)} ${record.id}`,
    type: targetRecordLabel(recordType),
    summary: targetRecordSummary(project, recordType, record.id)
  }));
  if (toolId === "messages") return rowsFor("message");
  if (toolId === "battles") return rowsFor("battle");
  if (toolId === "monsters") return rowsFor("monster");
  if (toolId === "treasure") return rowsFor("treasure");
  if (toolId === "shops") return rowsFor("shop");
  if (toolId === "simple") return rowsFor("simpleEncounter");
  if (toolId === "complex") return rowsFor("complexEncounter");
  if (toolId === "rogue") return rowsFor("thiefEncounter");
  if (toolId === "timed") return rowsFor("timedEncounter");
  if (toolId === "action-points") {
    return project.triggers.filter((trigger) => trigger.source !== "Data ED3").map((trigger) => ({
      id: trigger.id,
      label: `Action Point ${trigger.recordIndex}`,
      type: "Action Point",
      summary: `${trigger.actions.length} action step(s)`
    }));
  }
  if (toolId === "macros" || toolId === "ed3-evidence") {
    return project.triggers.filter((trigger) => trigger.source === "Data ED3").map((trigger) => ({
      id: trigger.id,
      label: `Reusable Action ${trigger.recordIndex}`,
      type: "Reusable Action",
      summary: `${trigger.actions.length} action step(s)`
    }));
  }
  return [];
}

function itemUsageLinks(project: Project, itemId: number): ContentUsageLink[] {
  const links: ContentUsageLink[] = [];
  for (const treasure of project.treasures ?? []) {
    const slots = treasure.itemIds.map((id, slot) => id === itemId ? slot : -1).filter((slot) => slot >= 0);
    if (slots.length) links.push({ key: `treasure:${treasure.id}`, label: `Treasure ${treasure.id}`, detail: `slot${slots.length === 1 ? "" : "s"} ${slots.join(", ")}` });
  }
  for (const shop of project.shops ?? []) {
    const slots = shop.itemIds.map((id, slot) => id === itemId ? slot : -1).filter((slot) => slot >= 0);
    if (slots.length) links.push({ key: `shop:${shop.id}`, label: `Shop ${shop.id}`, detail: `${slots.length} shop slot${slots.length === 1 ? "" : "s"}` });
  }
  return links;
}

function parseSelectedId(id: string):
  | { type: string; numericId: number; resourceType: string }
  | { type: string; numericId: number; resourceType?: never }
  | null {
  const resource = id.match(/^resource:([^:]+):(-?\d+)$/);
  if (resource) return { type: "resource", resourceType: resource[1], numericId: Number(resource[2]) };
  const prefixed = id.match(/^(message|option-label|battle|monster|treasure|shop|item|thief|time):(-?\d+)$/);
  if (prefixed) return { type: prefixed[1], numericId: Number(prefixed[2]) };
  const encounter = id.match(/^(encounter:(?:simple|complex)):(-?\d+)$/);
  if (encounter) return { type: encounter[1], numericId: Number(encounter[2]) };
  return null;
}

function targetRecords(project: Project, recordType: RealmzTargetRecordKind): Array<{ id: number }> {
  const records =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    recordType === "timedEncounter" ? project.timedEncounters :
    project.questLabels;
  return [...(records ?? [])].sort((a, b) => a.id - b.id);
}

function targetEntityId(recordType: RealmzTargetRecordKind, id: number) {
  if (recordType === "simpleEncounter") return `encounter:simple:${id}`;
  if (recordType === "complexEncounter") return `encounter:complex:${id}`;
  if (recordType === "thiefEncounter") return `thief:${id}`;
  if (recordType === "timedEncounter") return `time:${id}`;
  if (recordType === "questLabel") return `quest:${id}`;
  return `${recordType}:${id}`;
}

function targetRecordLabel(recordType: RealmzTargetRecordKind) {
  const labels: Record<RealmzTargetRecordKind, string> = {
    message: "Message",
    battle: "Battle",
    monster: "Monster",
    treasure: "Treasure",
    shop: "Shop",
    simpleEncounter: "Simple Encounter",
    complexEncounter: "Complex Encounter",
    thiefEncounter: "Rogue Encounter",
    timedEncounter: "Time Encounter",
    questLabel: "Quest Label"
  };
  return labels[recordType];
}

function targetRecordSummary(project: Project, recordType: RealmzTargetRecordKind, id: number) {
  if (recordType === "message") return project.messages.find((record) => record.id === id)?.text.slice(0, 80) || "empty message";
  if (recordType === "battle") return `${project.battles.find((record) => record.id === id)?.grid.filter(Boolean).length ?? 0} monster slot(s)`;
  if (recordType === "monster") return project.monsters.find((record) => record.id === id)?.displayName || `Monster ${id}`;
  if (recordType === "treasure") return `${project.treasures.find((record) => record.id === id)?.itemIds.filter(Boolean).length ?? 0} item(s)`;
  if (recordType === "shop") return `${project.shops.find((record) => record.id === id)?.itemIds.filter(Boolean).length ?? 0} stocked slot(s)`;
  if (recordType === "simpleEncounter") return `${project.simpleEncounters.find((record) => record.id === id)?.actions.length ?? 0} action row(s)`;
  if (recordType === "complexEncounter") return `${project.complexEncounters.find((record) => record.id === id)?.actions.length ?? 0} action row(s)`;
  if (recordType === "thiefEncounter") return `${project.thiefEncounters.find((record) => record.id === id)?.typeFlags.filter(Boolean).length ?? 0} enabled action(s)`;
  if (recordType === "timedEncounter") return `day ${project.timedEncounters.find((record) => record.id === id)?.day ?? 0}`;
  return "metadata";
}

function messageLabel(record: Project["messages"][number] | undefined, id: number) {
  const text = record?.text?.trim();
  return text ? `Message ${id}: ${text.slice(0, 48)}` : `Message ${id}`;
}

function optionLabel(record: Project["optionLabels"][number] | undefined, id: number) {
  const text = record?.text?.trim();
  return text ? `Option ${id}: ${text.slice(0, 48)}` : `Option ${id}`;
}

function resourceKey(resourceType: string, resourceId: number) {
  return `${resourceType.trim()}:${resourceId}`;
}

function resourceTypeToEntityType(resourceType: string) {
  const normalized = resourceType.trim();
  if (normalized === "PICT") return "picture";
  if (normalized === "cicn") return "icon-resource";
  if (normalized === "snd") return "sound";
  if (normalized === "TEXT") return "text-resource";
  if (normalized === "STR#") return "string-list-resource";
  if (normalized === "styl") return "style-resource";
  return "resource";
}
