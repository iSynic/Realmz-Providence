import { LibraryCatalog, LibraryEntity, Project, SemanticEntity } from "./types";
import { schemaEntities } from "./semanticGraph";

export type ItemReferenceOption = {
  key: string;
  value: number;
  label: string;
  detail: string;
  summary: string;
  sourceState: string;
};

type ItemUsage = {
  treasureSlots: number;
  shopSlots: number;
  semanticRefs: number;
};

type ItemEntity = SemanticEntity | LibraryEntity;

export function itemReferenceOptions(project: Project, catalog?: LibraryCatalog | null): ItemReferenceOption[] {
  const entities = [
    ...schemaEntities(project, "item"),
    ...schemaEntities(project, "item-reference"),
    ...(catalog?.entities.filter((entity) => entity.type === "item" || entity.type === "item-reference") ?? [])
  ];
  const names = itemNamesFromStringLists(project, catalog);
  const ids = new Set<number>();
  const entityById = new Map<number, ItemEntity>();
  for (const entity of entities) {
    const id = itemIdFromEntity(entity);
    if (id == null) continue;
    ids.add(id);
    if (!entityById.has(id) || entity.type === "item") entityById.set(id, entity);
  }
  for (const treasure of project.treasures ?? []) {
    for (const id of treasure.itemIds) if (id !== 0) ids.add(id);
  }
  for (const shop of project.shops ?? []) {
    for (const id of shop.itemIds) if (id !== 0) ids.add(id);
  }
  for (const link of project.semanticSchema.links ?? []) {
    if (!link.to.startsWith("item:")) continue;
    const id = trailingNumber(link.to);
    if (id != null) ids.add(id);
  }

  return [...ids]
    .map((id) => {
      const entity = entityById.get(id);
      const usage = itemUsage(project, id);
      const usageSummary = formatItemUsage(usage);
      const named = names.get(Math.abs(id));
      const label = named ?? (entity ? itemLabel(entity, id) : itemCategoryLabel(id));
      const sourceState = named ? "Named item" : entity?.type === "item" ? "Imported item catalog" : entity ? "Scenario reference" : "Used by authored records";
      return {
        key: entity?.id ?? `item:${id}`,
        value: id,
        label: `${label} (${id})`,
        detail: usageSummary || entityDetail(entity) || "No decoded usage yet",
        summary: entityDetail(entity) || "Raw Realmz item ID",
        sourceState
      };
    })
    .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
}

export function itemReferenceDetail(project: Project, itemId: number, catalog?: LibraryCatalog | null) {
  if (itemId === 0) return "No item selected.";
  const option = itemReferenceOptions(project, catalog).find((candidate) => candidate.value === itemId);
  return option ? [option.detail, option.sourceState].filter(Boolean).join(" | ") : `Raw item ID ${itemId}; no decoded project usage yet.`;
}

function itemIdFromEntity(entity: ItemEntity) {
  return numericSummaryValue(entity, ["itemId", "id", "recordIndex"]) ?? trailingNumber(entity.id);
}

function itemLabel(entity: ItemEntity, id: number) {
  const name = typeof entity.summary.name === "string" ? entity.summary.name.trim() : "";
  if (name) return name;
  if (entity.label && entity.label !== `Item ${id}`) return entity.label;
  return itemCategoryLabel(id);
}

function entityDetail(entity: ItemEntity | undefined) {
  if (!entity) return "";
  const facts = itemEntityFacts(entity);
  if (facts) return facts;
  const preview = typeof entity.summary.preview === "string" ? entity.summary.preview : "";
  const referenceOnly = typeof entity.summary.referenceOnly === "string" ? entity.summary.referenceOnly : "";
  return preview || referenceOnly || `${entity.type} | ${entity.editState}`;
}

function itemUsage(project: Project, itemId: number): ItemUsage {
  let treasureSlots = 0;
  let shopSlots = 0;
  for (const treasure of project.treasures ?? []) {
    treasureSlots += treasure.itemIds.filter((id) => id === itemId).length;
  }
  for (const shop of project.shops ?? []) {
    shopSlots += shop.itemIds.filter((id) => id === itemId).length;
  }
  const semanticRefs = (project.semanticSchema.links ?? []).filter((link) => link.to === `item:${itemId}`).length;
  return { treasureSlots, shopSlots, semanticRefs };
}

function formatItemUsage(usage: ItemUsage) {
  const parts = [];
  if (usage.treasureSlots) parts.push(`${usage.treasureSlots} treasure slot${usage.treasureSlots === 1 ? "" : "s"}`);
  if (usage.shopSlots) parts.push(`${usage.shopSlots} shop slot${usage.shopSlots === 1 ? "" : "s"}`);
  if (usage.semanticRefs) parts.push(`${usage.semanticRefs} semantic ref${usage.semanticRefs === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function itemNamesFromStringLists(project: Project, catalog?: LibraryCatalog | null) {
  const names = new Map<number, string>();
  const resources = [
    ...schemaEntities(project, "resource"),
    ...schemaEntities(project, "string-list-resource"),
    ...(catalog?.entities.filter((entity) => entity.type === "resource" || entity.type === "string-list-resource") ?? [])
  ];
  for (const resource of resources) {
    const resourceType = String(resource.summary.type ?? resource.summary.resourceType ?? "").trim();
    const family = String(resource.summary.family ?? "");
    if (resourceType !== "STR#" && family !== "string-list") continue;
    const resourceId = numericSummaryValue(resource, ["resourceId", "id"]);
    const strings = Array.isArray(resource.summary.strings) ? resource.summary.strings : [];
    if (resourceId == null || strings.length === 0) continue;
    const base = resourceId - 1;
    if (base < 0 || base % 200 !== 0) continue;
    for (let index = 0; index < strings.length; index += 1) {
      const itemId = base + index;
      if (itemId <= 0) continue;
      const text = typeof strings[index] === "string" ? strings[index].trim() : "";
      if (!text || /^item\s+-?\d+$/i.test(text)) continue;
      names.set(itemId, text);
    }
  }
  return names;
}

function itemCategoryLabel(itemId: number) {
  const abs = Math.abs(itemId);
  const category = itemCategory(abs);
  return category ? `${category} ${abs}` : `Item ${itemId}`;
}

function itemCategory(itemId: number) {
  if (itemId >= 0 && itemId < 200) return "Weapon";
  if (itemId >= 200 && itemId < 400) return "Armor";
  if (itemId >= 400 && itemId < 600) return "Shield/Helm";
  if (itemId >= 600 && itemId < 800) return "Magic";
  if (itemId >= 800 && itemId < 1000) return "Supply";
  return "";
}

function itemEntityFacts(entity: ItemEntity) {
  const parts = [];
  const cost = numericSummaryValue(entity, ["cost"]);
  const damage = numericSummaryValue(entity, ["damage"]);
  const ac = numericSummaryValue(entity, ["ac"]);
  const charge = numericSummaryValue(entity, ["charge"]);
  const weight = numericSummaryValue(entity, ["weight"]);
  const iconId = numericSummaryValue(entity, ["iconId"]);
  if (cost != null) parts.push(`${cost} gp`);
  if (damage) parts.push(`damage ${damage}`);
  if (ac) parts.push(`AC ${ac}`);
  if (charge) parts.push(`${charge} charge${charge === 1 ? "" : "s"}`);
  if (weight) parts.push(`weight ${weight}`);
  if (iconId) parts.push(`icon ${iconId}`);
  return parts.join(", ");
}

function numericSummaryValue(entity: ItemEntity, keys: string[]) {
  for (const key of keys) {
    const value = entity.summary[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  }
  return null;
}

function trailingNumber(value: string) {
  const match = value.match(/(-?\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
}
