import { LibraryCatalog, LibraryEntity, MonsterRecord } from "./types";

const MONSTER_LIBRARY_SOURCE_ID = "library-source:providence:monster-library";
const MONSTER_LIBRARY_STORAGE_PREFIX = "providence.monsterLibrary.v1:";
const MONSTER_LIBRARY_LEGACY_STORAGE_KEY = "providence.monsterLibrary.v1";
const MONSTER_LIBRARY_ENTITY_PREFIX = "library-entity:providence:monster-library:";
const MONSTER_LIBRARY_RECORD_PREFIX = "library-record:providence:monster-library:";

export type MonsterLibraryOrigin = {
  kind: "built-in-scrapbook" | "built-in-override" | "scenario-monster" | "library-variant" | "blank";
  sourceId?: string;
  sourceLabel?: string;
};

export function isProvidenceMonsterLibraryEntry(entry: LibraryEntity) {
  return entry.source === MONSTER_LIBRARY_SOURCE_ID || entry.summary.providenceMonsterLibraryEntry === true;
}

export function monsterLibraryEntryTemplate(entry: LibraryEntity): MonsterRecord | null {
  const value = entry.summary.monsterRecord;
  if (!value || typeof value !== "object") return null;
  return normalizeMonsterRecord(value as Partial<MonsterRecord>);
}

export function monsterLibraryEntryDescription(entry: LibraryEntity) {
  return typeof entry.summary.description === "string" ? entry.summary.description : "";
}

export function createMonsterLibraryEntry(
  catalog: LibraryCatalog | null,
  managedPath: string,
  template: MonsterRecord,
  description: string,
  options: { label?: string; origin?: MonsterLibraryOrigin; preferredScenarioMonsterId?: number } = {}
) {
  const next = cloneOrCreateCatalog(catalog, managedPath);
  ensureMonsterLibrarySource(next);
  const number = nextMonsterLibraryNumber(next);
  const id = `${MONSTER_LIBRARY_ENTITY_PREFIX}${number}`;
  const recordId = `${MONSTER_LIBRARY_RECORD_PREFIX}${number}`;
  const now = new Date().toISOString();
  const label = options.label?.trim() || template.displayName?.trim() || `Monster Library ${number}`;
  const preferredScenarioMonsterId = Number.isInteger(options.preferredScenarioMonsterId)
    ? Number(options.preferredScenarioMonsterId)
    : Number.isInteger(template.id)
      ? template.id
      : number;
  const summary = monsterLibrarySummary(template, description, {
    label,
    number,
    preferredScenarioMonsterId,
    origin: options.origin ?? { kind: "blank" },
    createdAt: now,
    updatedAt: now
  });

  next.records.push({
    id: recordId,
    source: MONSTER_LIBRARY_SOURCE_ID,
    type: "monster-scrapbook-entry",
    label,
    editState: "editable",
    byteRange: null,
    confidence: "confirmed",
    summary
  });
  const entity: LibraryEntity = {
    id,
    type: "monster-scrapbook-entry",
    label,
    source: MONSTER_LIBRARY_SOURCE_ID,
    recordRef: recordId,
    editState: "editable",
    confidence: "confirmed",
    summary
  };
  next.entities.push(entity);
  summarize(next);
  return { catalog: next, entity };
}

export function updateMonsterLibraryEntry(
  catalog: LibraryCatalog,
  entityId: string,
  changes: Partial<MonsterRecord>,
  description?: string
) {
  const next = cloneOrCreateCatalog(catalog, catalog.managedPath);
  let updatedEntity: LibraryEntity | null = null;
  let updatedRecordRef: string | null = null;
  next.entities = next.entities.map((entity) => {
    if (entity.id !== entityId || !isProvidenceMonsterLibraryEntry(entity)) return entity;
    const current = monsterLibraryEntryTemplate(entity);
    if (!current) return entity;
    const monsterRecord = normalizeMonsterRecord({ ...current, ...changes });
    const nextDescription = description ?? monsterLibraryEntryDescription(entity);
    const label = monsterRecord.displayName?.trim() || entity.label;
    const summary = monsterLibrarySummary(monsterRecord, nextDescription, {
      label,
      number: summaryNumber(entity, "libraryNumber"),
      preferredScenarioMonsterId: summaryNumber(entity, "preferredScenarioMonsterId"),
      origin: monsterLibraryOrigin(entity),
      createdAt: typeof entity.summary.createdAt === "string" ? entity.summary.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    updatedEntity = { ...entity, label, summary };
    updatedRecordRef = entity.recordRef;
    return updatedEntity;
  });
  if (updatedEntity && updatedRecordRef) {
    next.records = next.records.map((record) => record.id === updatedRecordRef
      ? { ...record, label: updatedEntity!.label, summary: updatedEntity!.summary }
      : record);
  }
  summarize(next);
  return next;
}

export function duplicateMonsterLibraryEntry(catalog: LibraryCatalog, entityId: string) {
  const source = catalog.entities.find((entry) => entry.id === entityId);
  const template = source ? monsterLibraryEntryTemplate(source) : null;
  if (!source || !template) return { catalog, entity: source ?? null };
  const label = `${source.label || template.displayName || "Monster"} Variant`;
  return createMonsterLibraryEntry(catalog, catalog.managedPath, { ...template, displayName: label }, monsterLibraryEntryDescription(source), {
    label,
    origin: { kind: "library-variant", sourceId: source.id, sourceLabel: source.label },
    preferredScenarioMonsterId: summaryNumber(source, "preferredScenarioMonsterId")
  });
}

export function deleteMonsterLibraryEntry(catalog: LibraryCatalog, entityId: string) {
  const next = cloneOrCreateCatalog(catalog, catalog.managedPath);
  const entity = next.entities.find((candidate) => candidate.id === entityId);
  if (!entity || !isProvidenceMonsterLibraryEntry(entity)) return next;
  next.entities = next.entities.filter((candidate) => candidate.id !== entityId);
  if (entity.recordRef) next.records = next.records.filter((record) => record.id !== entity.recordRef);
  summarize(next);
  return next;
}

export function mergeBrowserMonsterLibraryEntries(catalog: LibraryCatalog): LibraryCatalog {
  if (typeof localStorage === "undefined") return catalog;
  const stored = readStoredMonsterLibrary(catalog.managedPath);
  if (!stored || stored.entities.length === 0) return catalog;
  const next = cloneOrCreateCatalog(catalog, catalog.managedPath);
  ensureMonsterLibrarySource(next);
  const entityIds = new Set(next.entities.map((entry) => entry.id));
  const recordIds = new Set(next.records.map((record) => record.id));
  for (const record of stored.records) {
    if (!recordIds.has(record.id)) next.records.push(record);
  }
  for (const entity of stored.entities) {
    if (!entityIds.has(entity.id)) next.entities.push(entity);
  }
  summarize(next);
  return next;
}

export function persistBrowserMonsterLibraryEntries(catalog: LibraryCatalog) {
  if (typeof localStorage === "undefined") return;
  const entities = catalog.entities.filter(isProvidenceMonsterLibraryEntry);
  const recordRefs = new Set(entities.map((entry) => entry.recordRef).filter((value): value is string => Boolean(value)));
  const records = catalog.records.filter((record) => record.source === MONSTER_LIBRARY_SOURCE_ID || recordRefs.has(record.id));
  localStorage.setItem(monsterLibraryStorageKey(catalog.managedPath), JSON.stringify({ records, entities }));
}

function readStoredMonsterLibrary(managedPath: string): { records: LibraryCatalog["records"]; entities: LibraryEntity[] } | null {
  try {
    const raw = localStorage.getItem(monsterLibraryStorageKey(managedPath)) ?? localStorage.getItem(MONSTER_LIBRARY_LEGACY_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "null");
    if (!parsed || !Array.isArray(parsed.records) || !Array.isArray(parsed.entities)) return null;
    return {
      records: parsed.records,
      entities: parsed.entities
    };
  } catch {
    return null;
  }
}

function monsterLibraryStorageKey(managedPath: string) {
  return `${MONSTER_LIBRARY_STORAGE_PREFIX}${encodeURIComponent(managedPath || "browser://workspace/library")}`;
}

function monsterLibrarySummary(
  template: MonsterRecord,
  description: string,
  meta: {
    label: string;
    number: number;
    preferredScenarioMonsterId: number;
    origin: MonsterLibraryOrigin;
    createdAt: string;
    updatedAt: string;
  }
) {
  const monsterRecord = normalizeMonsterRecord({
    ...template,
    id: meta.preferredScenarioMonsterId,
    displayName: meta.label
  });
  return {
    providenceMonsterLibraryEntry: true,
    libraryNumber: meta.number,
    index: meta.preferredScenarioMonsterId,
    preferredScenarioMonsterId: meta.preferredScenarioMonsterId,
    displayName: meta.label,
    description,
    origin: meta.origin,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    monsterRecord,
    hitDice: monsterRecord.hitDice,
    staminaBonus: monsterRecord.staminaBonus,
    agility: monsterRecord.agility,
    movementMax: monsterRecord.movementMax,
    armor: monsterRecord.armor,
    magicResistance: monsterRecord.magicResistance,
    distance: monsterRecord.distance,
    size: monsterRecord.size,
    attackCount: monsterRecord.attackCount,
    magicAttackCount: monsterRecord.magicAttackCount,
    attacks: monsterRecord.attacks,
    damageBonus: monsterRecord.damageBonus,
    castPercent: monsterRecord.castPercent,
    runPercent: monsterRecord.runPercent,
    surrenderPercent: monsterRecord.surrenderPercent,
    missilePercent: monsterRecord.missilePercent,
    money: monsterRecord.money,
    spells: monsterRecord.spells,
    items: monsterRecord.items,
    weapon: monsterRecord.weapon,
    iconId: monsterRecord.iconId,
    spellPoints: monsterRecord.spellPoints,
    exp: monsterRecord.exp,
    saves: monsterRecord.saves,
    spellImmunities: monsterRecord.spellImmunities,
    conditions: monsterRecord.conditions
  };
}

export function monsterLibraryOrigin(entry: LibraryEntity): MonsterLibraryOrigin {
  const value = entry.summary.origin;
  if (!value || typeof value !== "object") return { kind: "blank" };
  const candidate = value as Partial<MonsterLibraryOrigin>;
  return {
    kind: candidate.kind ?? "blank",
    sourceId: candidate.sourceId,
    sourceLabel: candidate.sourceLabel
  };
}

function normalizeMonsterRecord(value: Partial<MonsterRecord>): MonsterRecord {
  return {
    id: numberValue(value.id),
    hitDice: numberValue(value.hitDice),
    staminaBonus: numberValue(value.staminaBonus),
    agility: numberValue(value.agility),
    nameId: numberValue(value.nameId),
    movementMax: numberValue(value.movementMax),
    armor: numberValue(value.armor),
    magicResistance: numberValue(value.magicResistance),
    distance: numberValue(value.distance),
    traitor: numberValue(value.traitor),
    size: numberValue(value.size),
    typeFlags: fixedNumberArray(value.typeFlags, 8),
    attackCount: numberValue(value.attackCount),
    magicAttackCount: numberValue(value.magicAttackCount),
    attacks: Array.from({ length: 5 }, (_, index) => fixedNumberArray(value.attacks?.[index], 4)),
    damageBonus: numberValue(value.damageBonus),
    castPercent: numberValue(value.castPercent),
    runPercent: numberValue(value.runPercent),
    surrenderPercent: numberValue(value.surrenderPercent),
    missilePercent: numberValue(value.missilePercent),
    canSummon: numberValue(value.canSummon),
    saves: fixedNumberArray(value.saves, 6),
    spellImmunities: fixedNumberArray(value.spellImmunities, 6),
    money: fixedNumberArray(value.money, 3),
    spells: fixedNumberArray(value.spells, 10),
    items: fixedNumberArray(value.items, 6),
    weapon: numberValue(value.weapon),
    iconId: numberValue(value.iconId),
    spellPoints: numberValue(value.spellPoints),
    exp: numberValue(value.exp),
    stamina: numberValue(value.stamina),
    staminaMax: numberValue(value.staminaMax),
    underneath: fixedNumberArray(value.underneath, 4),
    target: numberValue(value.target),
    guarding: numberValue(value.guarding),
    notOnMenu: Boolean(value.notOnMenu),
    beenAttacked: numberValue(value.beenAttacked),
    movement: numberValue(value.movement),
    magicToHit: numberValue(value.magicToHit),
    conditions: fixedNumberArray(value.conditions, 40),
    lr: numberValue(value.lr),
    up: numberValue(value.up),
    attackNum: numberValue(value.attackNum),
    bonusAttack: numberValue(value.bonusAttack),
    deathMacro: numberValue(value.deathMacro),
    maxSpellPoints: numberValue(value.maxSpellPoints),
    displayName: typeof value.displayName === "string" ? value.displayName : "",
    authored: value.authored ?? true,
    provenance: value.provenance
  };
}

function cloneOrCreateCatalog(catalog: LibraryCatalog | null, managedPath: string): LibraryCatalog {
  if (catalog) {
    return {
      ...catalog,
      sources: [...catalog.sources],
      records: [...catalog.records],
      entities: [...catalog.entities],
      assets: [...catalog.assets],
      diagnostics: [...catalog.diagnostics],
      summary: { ...catalog.summary }
    };
  }
  return {
    schemaVersion: 4,
    importedAt: new Date().toISOString(),
    managedPath,
    sources: [],
    records: [],
    entities: [],
    assets: [],
    diagnostics: [],
    summary: { sourceCount: 0, recordCount: 0, entityCount: 0, assetCount: 0, diagnosticCount: 0 }
  };
}

function ensureMonsterLibrarySource(catalog: LibraryCatalog) {
  if (catalog.sources.some((source) => source.id === MONSTER_LIBRARY_SOURCE_ID)) return;
  catalog.sources.push({
    id: MONSTER_LIBRARY_SOURCE_ID,
    name: "Providence Monster Library",
    relativePath: "Providence Monster Library",
    originalPath: "providence-library://monster-library",
    sourceKind: "providence-library",
    role: "monster-library",
    bytes: 0,
    sha256: "providence-monster-library",
    copiedTo: "providence-library://monster-library",
    confidence: "confirmed"
  });
}

function nextMonsterLibraryNumber(catalog: LibraryCatalog) {
  let max = 0;
  for (const entity of catalog.entities) {
    if (!isProvidenceMonsterLibraryEntry(entity)) continue;
    max = Math.max(max, summaryNumber(entity, "libraryNumber"));
    const match = entity.id.match(/:(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function summarize(catalog: LibraryCatalog) {
  catalog.summary = {
    sourceCount: catalog.sources.length,
    recordCount: catalog.records.length,
    entityCount: catalog.entities.length,
    assetCount: catalog.assets.length,
    diagnosticCount: catalog.diagnostics.length
  };
}

function summaryNumber(entry: LibraryEntity, key: string) {
  const value = entry.summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function fixedNumberArray(values: unknown, length: number) {
  return Array.from({ length }, (_, index) => Array.isArray(values) ? numberValue(values[index]) : 0);
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}
