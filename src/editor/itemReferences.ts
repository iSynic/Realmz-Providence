import { LibraryCatalog, LibraryEntity, Project, ScenarioItemRecord, SemanticEntity } from "./types";

export type ItemReferenceOption = {
  key: string;
  value: number;
  label: string;
  category: ItemReferenceCategory;
  detail: string;
  summary: string;
  sourceState: string;
  iconId: number | null;
};

export type ItemReferenceCategory = "weapon" | "armor" | "accessory" | "magic" | "supply" | "unknown";

export const ITEM_REFERENCE_CATEGORIES: { id: ItemReferenceCategory | "all"; label: string; range?: string }[] = [
  { id: "all", label: "All Items" },
  { id: "weapon", label: "Weapons", range: "1-199" },
  { id: "armor", label: "Armor", range: "200-399" },
  { id: "accessory", label: "Accessories", range: "400-599" },
  { id: "magic", label: "Magic", range: "600-799" },
  { id: "supply", label: "Supplies / Special", range: "800-999" }
];

type ItemUsage = {
  treasureSlots: number;
  shopSlots: number;
  semanticRefs: number;
};

type ItemEntity = SemanticEntity | LibraryEntity;

const itemReferenceOptionCache = new WeakMap<Project, { noCatalog: ItemReferenceOption[] | null; catalogs: WeakMap<LibraryCatalog, ItemReferenceOption[]> }>();

export function itemReferenceOptions(project: Project, catalog?: LibraryCatalog | null): ItemReferenceOption[] {
  const cached = readCachedItemReferenceOptions(project, catalog);
  if (cached) return cached;
  const entities = [
    ...(catalog?.entities.filter((entity) => entity.type === "item" || entity.type === "item-reference") ?? [])
  ];
  const names = itemNamesFromStringLists(project, catalog);
  const ids = new Set<number>();
  const entityById = new Map<number, ItemEntity>();
  const scenarioItemById = new Map<number, ScenarioItemRecord>();
  const iconByItemId = new Map<number, number>();
  for (const entity of entities) {
    const id = itemIdFromEntity(entity);
    if (id == null || !isCatalogItemId(id)) continue;
    ids.add(id);
    if (!entityById.has(id) || entity.type === "item") entityById.set(id, entity);
    const iconId = itemIconId(entity, undefined);
    if (iconId != null) iconByItemId.set(id, iconId);
  }
  for (const record of project.scenarioItems ?? []) {
    const itemId = scenarioItemId(record);
    if (!isCatalogItemId(itemId)) continue;
    ids.add(itemId);
    scenarioItemById.set(itemId, record);
    if (record.iconId) iconByItemId.set(itemId, record.iconId);
  }
  for (let itemId = 900; itemId < 1000; itemId += 1) ids.add(itemId);
  for (const treasure of project.treasures ?? []) {
    for (const id of treasure.itemIds) if (isCatalogItemId(id)) ids.add(id);
  }
  for (const shop of project.shops ?? []) {
    for (const id of shop.itemIds) if (isCatalogItemId(id)) ids.add(id);
  }
  const usageById = itemUsageMap(project);
  const iconByName = itemIconMapByName(entities, scenarioItemById, names);

  const options = [...ids]
    .map((id) => {
      const entity = entityById.get(id);
      const scenarioItem = scenarioItemById.get(id);
      const usage = usageById.get(id) ?? emptyItemUsage();
      const usageSummary = formatItemUsage(usage);
      const named = names.get(Math.abs(id));
      const label = named ?? (entity ? itemLabel(entity, id) : itemCategoryLabel(id));
      const category = itemReferenceCategory(id);
      const sourceState = scenarioItem ? itemScenarioSourceLabel(id, scenarioItem) : itemSourceLabel(entity, named != null);
      const iconId =
        itemIconId(entity, scenarioItem) ??
        iconByName.get(normalizeItemName(label)) ??
        nearestCategoryIcon(id, iconByItemId);
      return {
        key: entity?.id ?? `item:${id}`,
        value: id,
        category,
        label: `${label} (${id})`,
        detail: usageSummary || scenarioItemDetail(scenarioItem) || entityDetail(entity) || customItemDetail(id),
        summary: scenarioItemDetail(scenarioItem) || entityDetail(entity) || customItemDetail(id),
        sourceState,
        iconId
      };
    })
    .sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
  writeCachedItemReferenceOptions(project, catalog, options);
  return options;
}

export function itemReferenceDetail(project: Project, itemId: number, catalog?: LibraryCatalog | null) {
  if (itemId === 0) return "No item selected.";
  const option = itemReferenceOptions(project, catalog).find((candidate) => candidate.value === itemId);
  return option ? [option.detail, option.sourceState].filter(Boolean).join(" | ") : `Raw item ID ${itemId}; no decoded project usage yet.`;
}

function scenarioItemId(record: ScenarioItemRecord) {
  return record.itemId || 800 + record.id;
}

function scenarioItemDetail(record: ScenarioItemRecord | undefined) {
  if (!record) return "";
  const parts = [];
  if (record.cost) parts.push(record.cost < 0 ? `${Math.abs(record.cost)} gp unique` : `${record.cost} gp`);
  if (record.damage) parts.push(`damage ${record.damage}`);
  if (record.ac) parts.push(`AC ${record.ac}`);
  if (record.charge) parts.push(`${record.charge} charge${record.charge === 1 ? "" : "s"}`);
  if (record.weight) parts.push(`weight ${record.weight}`);
  if (record.iconId) parts.push(`icon ${record.iconId}`);
  return parts.join(", ") || (scenarioItemId(record) >= 900 ? "Custom item slot" : "Scenario item");
}

function customItemDetail(itemId: number) {
  return itemId >= 900 && itemId < 1000 ? "Custom item slot" : "Raw Realmz item ID";
}

function itemScenarioSourceLabel(itemId: number, record: ScenarioItemRecord) {
  if (itemId >= 900 && itemId < 1000) return scenarioItemHasData(record) ? "Custom scenario item" : "Custom item slot";
  return "Scenario item";
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

function itemIconId(entity: ItemEntity | undefined, record: ScenarioItemRecord | undefined) {
  if (record?.iconId) return record.iconId;
  return entity ? numericSummaryValue(entity, ["iconId"]) : null;
}

function itemIconMapByName(entities: ItemEntity[], scenarioItems: Map<number, ScenarioItemRecord>, names: Map<number, string>) {
  const iconByName = new Map<string, number>();
  for (const entity of entities) {
    const itemId = itemIdFromEntity(entity);
    if (itemId == null) continue;
    const iconId = itemIconId(entity, undefined);
    if (iconId == null) continue;
    addItemIconName(iconByName, itemLabel(entity, itemId), iconId);
    const named = names.get(Math.abs(itemId));
    if (named) addItemIconName(iconByName, named, iconId);
  }
  for (const [itemId, record] of scenarioItems.entries()) {
    if (!record.iconId) continue;
    const named = names.get(Math.abs(itemId));
    if (named) addItemIconName(iconByName, named, record.iconId);
  }
  return iconByName;
}

function addItemIconName(iconByName: Map<string, number>, label: string, iconId: number) {
  const normalized = normalizeItemName(label);
  if (!normalized || isGenericItemName(normalized)) return;
  if (!iconByName.has(normalized)) iconByName.set(normalized, iconId);
}

function normalizeItemName(value: string) {
  return value
    .replace(/\s+\(-?\d+\)$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isGenericItemName(value: string) {
  return /^(weapon|armor|accessory|magic|supply \/ special|item) -?\d+$/.test(value);
}

function nearestCategoryIcon(itemId: number, iconByItemId: Map<number, number>) {
  const category = itemReferenceCategory(itemId);
  let best: { distance: number; iconId: number } | null = null;
  for (const [candidateId, iconId] of iconByItemId.entries()) {
    if (itemReferenceCategory(candidateId) !== category) continue;
    const distance = Math.abs(Math.abs(candidateId) - Math.abs(itemId));
    if (!best || distance < best.distance) best = { distance, iconId };
  }
  return best?.iconId ?? null;
}

function entityDetail(entity: ItemEntity | undefined) {
  if (!entity) return "";
  const facts = itemEntityFacts(entity);
  if (facts) return facts;
  const preview = typeof entity.summary.preview === "string" ? entity.summary.preview : "";
  const referenceOnly = typeof entity.summary.referenceOnly === "string" ? entity.summary.referenceOnly : "";
  return preview || referenceOnly || `${entity.type} | ${entity.editState}`;
}

function itemSourceLabel(entity: ItemEntity | undefined, named: boolean) {
  if (entity?.type === "item") {
    if (entity.source === "Data NI" || entity.summary.scenarioLocal === true || entity.summary.sourceFile === "Data NI") {
      return named ? "Scenario item" : "Scenario item table";
    }
    return named ? "Named library item" : "Realmz library item";
  }
  if (entity) return "Referenced item";
  if (named) return "Named item";
  return "Used by records";
}

function itemUsageMap(project: Project) {
  const usageById = new Map<number, ItemUsage>();
  const usageFor = (itemId: number) => {
    const existing = usageById.get(itemId);
    if (existing) return existing;
    const usage = emptyItemUsage();
    usageById.set(itemId, usage);
    return usage;
  };
  for (const treasure of project.treasures ?? []) {
    for (const itemId of treasure.itemIds) {
      if (itemId !== 0) usageFor(itemId).treasureSlots += 1;
    }
  }
  for (const shop of project.shops ?? []) {
    for (const itemId of shop.itemIds) {
      if (itemId !== 0) usageFor(itemId).shopSlots += 1;
    }
  }
  return usageById;
}

function emptyItemUsage(): ItemUsage {
  return { treasureSlots: 0, shopSlots: 0, semanticRefs: 0 };
}

function readCachedItemReferenceOptions(project: Project, catalog?: LibraryCatalog | null) {
  const entry = itemReferenceOptionCache.get(project);
  if (!entry) return null;
  if (!catalog) return entry.noCatalog;
  return entry.catalogs.get(catalog) ?? null;
}

function writeCachedItemReferenceOptions(project: Project, catalog: LibraryCatalog | null | undefined, options: ItemReferenceOption[]) {
  let entry = itemReferenceOptionCache.get(project);
  if (!entry) {
    entry = { noCatalog: null, catalogs: new WeakMap<LibraryCatalog, ItemReferenceOption[]>() };
    itemReferenceOptionCache.set(project, entry);
  }
  if (catalog) {
    entry.catalogs.set(catalog, options);
  } else {
    entry.noCatalog = options;
  }
}

function formatItemUsage(usage: ItemUsage) {
  const parts = [];
  if (usage.treasureSlots) parts.push(`${usage.treasureSlots} treasure slot${usage.treasureSlots === 1 ? "" : "s"}`);
  if (usage.shopSlots) parts.push(`${usage.shopSlots} shop slot${usage.shopSlots === 1 ? "" : "s"}`);
  if (usage.semanticRefs) parts.push(`${usage.semanticRefs} linked use${usage.semanticRefs === 1 ? "" : "s"}`);
  return parts.join(", ");
}

function itemNamesFromStringLists(project: Project, catalog?: LibraryCatalog | null) {
  const names = new Map<number, string>();
  const resources = [
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

export function itemReferenceCategory(itemId: number): ItemReferenceCategory {
  const abs = Math.abs(itemId);
  if (abs > 0 && abs < 200) return "weapon";
  if (abs >= 200 && abs < 400) return "armor";
  if (abs >= 400 && abs < 600) return "accessory";
  if (abs >= 600 && abs < 800) return "magic";
  if (abs >= 800 && abs < 1000) return "supply";
  return "unknown";
}

function isCatalogItemId(itemId: number) {
  return Number.isInteger(itemId) && itemId > 0 && itemId < 1000;
}

function itemCategory(itemId: number) {
  if (itemId > 0 && itemId < 200) return "Weapon";
  if (itemId >= 200 && itemId < 400) return "Armor";
  if (itemId >= 400 && itemId < 600) return "Accessory";
  if (itemId >= 600 && itemId < 800) return "Magic";
  if (itemId >= 800 && itemId < 1000) return "Supply / Special";
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

function scenarioItemHasData(record: ScenarioItemRecord) {
  const canonicalItemId = 800 + record.id;
  const fields = [
    record.iconId,
    record.type,
    record.st,
    record.blunt,
    record.hands,
    record.lu,
    record.movement,
    record.ac,
    record.magicResistance,
    record.damage,
    record.spellPoints,
    record.sound,
    record.weight,
    record.cost,
    record.charge,
    record.cursedItemId,
    record.magical,
    record.itemCat0,
    record.itemCat1,
    record.raceRestrictions,
    record.casteRestrictions,
    record.specificRace,
    record.specificCaste,
    record.raceClassOnly,
    record.casteClassOnly,
    record.vSmall,
    record.vLarge,
    record.heat,
    record.cold,
    record.electric,
    record.vsUndead,
    record.vsDemonDevil,
    record.vsEvil,
    record.special1,
    record.special2,
    record.special3,
    record.special4,
    record.special5,
    record.weightPerCharge,
    record.dropOnEmpty
  ];
  return record.itemId !== canonicalItemId || fields.some((value) => value !== 0);
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
