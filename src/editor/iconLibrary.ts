import { LibraryAsset, LibraryCatalog, LibraryEntity } from "./types";

export const ICON_LIBRARY_SOURCE_ID = "library-source:providence:icon-library";

const ICON_LIBRARY_STORAGE_PREFIX = "providence.iconLibrary.v1:";
const ICON_LIBRARY_LEGACY_STORAGE_KEY = "providence.iconLibrary.v1";
const ICON_LIBRARY_ENTITY_PREFIX = "library-entity:providence:icon-library:";
const ICON_LIBRARY_RECORD_PREFIX = "library-record:providence:icon-library:";
const ICON_LIBRARY_ASSET_PREFIX = "library-asset:providence:icon-library:";

export type IconLibraryKind = "monster-pair" | "item-icon";
export type IconLibraryFacingMode = "mirrored" | "custom";
export type IconLibraryCanvas = { width: number; height: number };
export type IconLibraryOrigin = {
  kind: "monster-mash" | "vault-of-arcana" | "library-variant" | "external-resource" | "blank";
  sourceId?: string;
  sourceLabel?: string;
};

export type IconLibraryResource = {
  role: "base" | "paired" | "item";
  resourceId: number;
  resourceType: "cicn";
  label: string;
  resourceBase64: string;
  previewPath?: string | null;
  bytes?: number;
  sha256?: string;
  width?: number;
  height?: number;
};

export type CreateIconLibraryEntrySpec = {
  kind: IconLibraryKind;
  label: string;
  resources: IconLibraryResource[];
  origin?: IconLibraryOrigin;
  facingMode?: IconLibraryFacingMode;
  canvas?: IconLibraryCanvas | null;
};

export function isProvidenceIconLibraryEntry(entry: LibraryEntity) {
  return entry.source === ICON_LIBRARY_SOURCE_ID || entry.summary.providenceIconLibraryEntry === true;
}

export function iconLibraryEntryKind(entry: LibraryEntity): IconLibraryKind | null {
  const kind = entry.summary.iconLibraryKind;
  return kind === "monster-pair" || kind === "item-icon" ? kind : null;
}

export function iconLibraryEntryResources(entry: LibraryEntity): IconLibraryResource[] {
  const resources = entry.summary.resources;
  if (!Array.isArray(resources)) return [];
  return resources
    .map((resource) => normalizeResource(resource as Partial<IconLibraryResource>))
    .filter((resource): resource is IconLibraryResource => Boolean(resource));
}

export function iconLibraryMonsterPairMetadata(entry: LibraryEntity): { facingMode: IconLibraryFacingMode; canvas: IconLibraryCanvas | null } {
  const facingMode = normalizeFacingMode(entry.summary.facingMode);
  const canvas = normalizeCanvas(entry.summary.canvas) ?? inferCanvasFromResources(iconLibraryEntryResources(entry));
  return { facingMode, canvas };
}

export function createIconLibraryEntry(catalog: LibraryCatalog | null, managedPath: string, spec: CreateIconLibraryEntrySpec) {
  const resources = normalizeResourcesForKind(spec.kind, spec.resources);
  if (!resources) return { catalog: catalog ?? emptyCatalog(managedPath), entity: null as LibraryEntity | null };
  const next = cloneOrCreateCatalog(catalog, managedPath);
  ensureIconLibrarySource(next);
  const number = nextIconLibraryNumber(next);
  const id = `${ICON_LIBRARY_ENTITY_PREFIX}${number}`;
  const recordId = `${ICON_LIBRARY_RECORD_PREFIX}${number}`;
  const now = new Date().toISOString();
  const label = spec.label.trim() || (spec.kind === "monster-pair" ? `Monster Icon ${number}` : `Item Icon ${number}`);
  const summary = iconLibrarySummary(spec.kind, label, number, resources, spec.origin ?? { kind: "blank" }, now, now, {
    facingMode: spec.facingMode,
    canvas: spec.canvas
  });
  next.records.push({
    id: recordId,
    source: ICON_LIBRARY_SOURCE_ID,
    type: spec.kind === "monster-pair" ? "monster-icon-pair" : "item-icon",
    label,
    editState: "editable",
    byteRange: null,
    confidence: "confirmed",
    summary
  });
  const entity: LibraryEntity = {
    id,
    type: spec.kind === "monster-pair" ? "monster-icon-pair" : "item-icon",
    label,
    source: ICON_LIBRARY_SOURCE_ID,
    recordRef: recordId,
    editState: "editable",
    confidence: "confirmed",
    summary
  };
  next.entities.push(entity);
  next.assets.push(...assetsForEntry(number, spec.kind, label, resources));
  summarize(next);
  return { catalog: next, entity };
}

export function duplicateIconLibraryEntry(catalog: LibraryCatalog, entityId: string) {
  const source = catalog.entities.find((entry) => entry.id === entityId);
  if (!source || !isProvidenceIconLibraryEntry(source)) return { catalog, entity: source ?? null };
  const kind = iconLibraryEntryKind(source);
  if (!kind) return { catalog, entity: source };
  return createIconLibraryEntry(catalog, catalog.managedPath, {
    kind,
    label: `${source.label || "Icon"} Variant`,
    resources: iconLibraryEntryResources(source),
    origin: { kind: "library-variant", sourceId: source.id, sourceLabel: source.label },
    ...iconLibraryMonsterPairMetadata(source)
  });
}

export function updateIconLibraryEntry(catalog: LibraryCatalog, entityId: string, changes: { label?: string; resources?: IconLibraryResource[] }) {
  const next = cloneOrCreateCatalog(catalog, catalog.managedPath);
  let updatedEntity: LibraryEntity | null = null;
  let updatedRecordRef: string | null = null;
  next.entities = next.entities.map((entity) => {
    if (entity.id !== entityId || !isProvidenceIconLibraryEntry(entity)) return entity;
    const kind = iconLibraryEntryKind(entity);
    if (!kind) return entity;
    const resources = changes.resources ? normalizeResourcesForKind(kind, changes.resources) : iconLibraryEntryResources(entity);
    if (!resources) return entity;
    const label = changes.label?.trim() || entity.label;
    const summary = iconLibrarySummary(
      kind,
      label,
      summaryNumber(entity, "libraryNumber"),
      resources,
      iconLibraryOrigin(entity),
      typeof entity.summary.createdAt === "string" ? entity.summary.createdAt : new Date().toISOString(),
      new Date().toISOString(),
      iconLibraryMonsterPairMetadata(entity)
    );
    updatedEntity = { ...entity, label, summary };
    updatedRecordRef = entity.recordRef;
    return updatedEntity;
  });
  if (updatedEntity && updatedRecordRef) {
    const entity = updatedEntity as LibraryEntity;
    const libraryNumber = summaryNumber(entity, "libraryNumber");
    const kind = iconLibraryEntryKind(entity);
    next.records = next.records.map((record) => record.id === updatedRecordRef
      ? { ...record, label: entity.label, summary: entity.summary }
      : record);
    next.assets = [
      ...next.assets.filter((asset) => !asset.id.startsWith(`${ICON_LIBRARY_ASSET_PREFIX}${libraryNumber}:`)),
      ...(kind ? assetsForEntry(libraryNumber, kind, entity.label, iconLibraryEntryResources(entity)) : [])
    ];
  }
  summarize(next);
  return next;
}

export function deleteIconLibraryEntry(catalog: LibraryCatalog, entityId: string) {
  const next = cloneOrCreateCatalog(catalog, catalog.managedPath);
  const entity = next.entities.find((candidate) => candidate.id === entityId);
  if (!entity || !isProvidenceIconLibraryEntry(entity)) return next;
  const libraryNumber = summaryNumber(entity, "libraryNumber");
  next.entities = next.entities.filter((candidate) => candidate.id !== entityId);
  if (entity.recordRef) next.records = next.records.filter((record) => record.id !== entity.recordRef);
  next.assets = next.assets.filter((asset) => !asset.id.startsWith(`${ICON_LIBRARY_ASSET_PREFIX}${libraryNumber}:`));
  summarize(next);
  return next;
}

export function providenceIconLibraryAssets(catalog: LibraryCatalog | null | undefined, kind?: IconLibraryKind) {
  if (!catalog) return [];
  const entityByNumber = new Map<number, LibraryEntity>();
  for (const entity of catalog.entities) {
    if (!isProvidenceIconLibraryEntry(entity)) continue;
    if (kind && iconLibraryEntryKind(entity) !== kind) continue;
    entityByNumber.set(summaryNumber(entity, "libraryNumber"), entity);
  }
  return catalog.assets.filter((asset) => {
    if (asset.source !== ICON_LIBRARY_SOURCE_ID) return false;
    const number = iconLibraryAssetNumber(asset);
    return number != null && entityByNumber.has(number);
  });
}

export function iconLibraryAssetResourceBase64(catalog: LibraryCatalog | null | undefined, asset: LibraryAsset) {
  if (!catalog || asset.source !== ICON_LIBRARY_SOURCE_ID) return null;
  const number = iconLibraryAssetNumber(asset);
  const role = iconLibraryAssetRole(asset);
  if (number == null || !role) return null;
  const entity = catalog.entities.find((entry) => isProvidenceIconLibraryEntry(entry) && summaryNumber(entry, "libraryNumber") === number);
  const resource = entity ? iconLibraryEntryResources(entity).find((candidate) => candidate.role === role) : null;
  return resource?.resourceBase64 ?? null;
}

export function mergeBrowserIconLibraryEntries(catalog: LibraryCatalog): LibraryCatalog {
  if (typeof localStorage === "undefined") return catalog;
  const stored = readStoredIconLibrary(catalog.managedPath);
  if (!stored || stored.entities.length === 0) return catalog;
  const next = cloneOrCreateCatalog(catalog, catalog.managedPath);
  ensureIconLibrarySource(next);
  const recordIds = new Set(next.records.map((record) => record.id));
  const entityIds = new Set(next.entities.map((entity) => entity.id));
  const assetIds = new Set(next.assets.map((asset) => asset.id));
  for (const record of stored.records) if (!recordIds.has(record.id)) next.records.push(record);
  for (const entity of stored.entities) if (!entityIds.has(entity.id)) next.entities.push(entity);
  for (const asset of stored.assets) if (!assetIds.has(asset.id)) next.assets.push(asset);
  summarize(next);
  return next;
}

export function persistBrowserIconLibraryEntries(catalog: LibraryCatalog) {
  if (typeof localStorage === "undefined") return;
  const entities = catalog.entities.filter(isProvidenceIconLibraryEntry);
  const recordRefs = new Set(entities.map((entry) => entry.recordRef).filter((value): value is string => Boolean(value)));
  const records = catalog.records.filter((record) => record.source === ICON_LIBRARY_SOURCE_ID || recordRefs.has(record.id));
  const entityNumbers = new Set(entities.map((entry) => summaryNumber(entry, "libraryNumber")));
  const assets = catalog.assets.filter((asset) => asset.source === ICON_LIBRARY_SOURCE_ID && entityNumbers.has(iconLibraryAssetNumber(asset) ?? -1));
  localStorage.setItem(iconLibraryStorageKey(catalog.managedPath), JSON.stringify({ records, entities, assets }));
}

export function iconLibraryOrigin(entry: LibraryEntity): IconLibraryOrigin {
  const value = entry.summary.origin;
  if (!value || typeof value !== "object") return { kind: "blank" };
  const candidate = value as Partial<IconLibraryOrigin>;
  return {
    kind: candidate.kind ?? "blank",
    sourceId: candidate.sourceId,
    sourceLabel: candidate.sourceLabel
  };
}

function iconLibrarySummary(
  kind: IconLibraryKind,
  label: string,
  number: number,
  resources: IconLibraryResource[],
  origin: IconLibraryOrigin,
  createdAt: string,
  updatedAt: string,
  metadata?: { facingMode?: IconLibraryFacingMode; canvas?: IconLibraryCanvas | null }
) {
  const facingMode = kind === "monster-pair" ? normalizeFacingMode(metadata?.facingMode) : undefined;
  const canvas = kind === "monster-pair"
    ? normalizeCanvas(metadata?.canvas) ?? inferCanvasFromResources(resources)
    : null;
  return {
    providenceIconLibraryEntry: true,
    iconLibraryKind: kind,
    libraryNumber: number,
    displayName: label,
    origin,
    createdAt,
    updatedAt,
    resources,
    ...(kind === "monster-pair" ? { facingMode, canvas } : {})
  };
}

function assetsForEntry(number: number, kind: IconLibraryKind, label: string, resources: IconLibraryResource[]): LibraryAsset[] {
  return resources.map((resource) => ({
    id: `${ICON_LIBRARY_ASSET_PREFIX}${number}:${resource.role}`,
    type: kind === "monster-pair" ? "monster-icon-pair" : "vault-icon",
    label: resource.label || label,
    source: ICON_LIBRARY_SOURCE_ID,
    relativePath: `providence-library://icon-library/${number}/${resource.role}`,
    bytes: resource.bytes ?? estimateBase64Bytes(resource.resourceBase64),
    sha256: resource.sha256 ?? stableHash(resource.resourceBase64),
    resourceType: "cicn",
    resourceId: resource.resourceId,
    previewPath: resource.previewPath ?? null,
    mimeType: "image/png"
  }));
}

function normalizeResourcesForKind(kind: IconLibraryKind, resources: IconLibraryResource[]) {
  const normalized = resources
    .map((resource) => normalizeResource(resource))
    .filter((resource): resource is IconLibraryResource => Boolean(resource));
  if (kind === "monster-pair") {
    const base = normalized.find((resource) => resource.role === "base");
    const paired = normalized.find((resource) => resource.role === "paired");
    if (!base || !paired || Math.abs(paired.resourceId) !== Math.abs(base.resourceId) + 308) return null;
    return [base, paired];
  }
  const item = normalized.find((resource) => resource.role === "item");
  return item ? [item] : null;
}

function normalizeResource(resource: Partial<IconLibraryResource> | null | undefined): IconLibraryResource | null {
  if (!resource || resource.resourceType !== "cicn" || !resource.resourceBase64 || !Number.isInteger(resource.resourceId)) return null;
  const role = resource.role === "base" || resource.role === "paired" || resource.role === "item" ? resource.role : null;
  if (!role) return null;
  const rawResourceId = resource.resourceId;
  if (rawResourceId == null) return null;
  const resourceId = Math.trunc(Math.abs(rawResourceId));
  return {
    role,
    resourceId,
    resourceType: "cicn",
    label: resource.label?.trim() || `cicn ${resourceId}`,
    resourceBase64: resource.resourceBase64,
    previewPath: resource.previewPath ?? null,
    bytes: resource.bytes,
    sha256: resource.sha256,
    width: positiveInteger(resource.width),
    height: positiveInteger(resource.height)
  };
}

function cloneOrCreateCatalog(catalog: LibraryCatalog | null, managedPath: string): LibraryCatalog {
  return catalog ? {
    ...catalog,
    sources: [...catalog.sources],
    records: catalog.records.map((record) => ({ ...record, summary: { ...record.summary } })),
    entities: catalog.entities.map((entity) => ({ ...entity, summary: { ...entity.summary } })),
    assets: [...catalog.assets],
    diagnostics: [...catalog.diagnostics],
    summary: { ...catalog.summary }
  } : emptyCatalog(managedPath);
}

function emptyCatalog(managedPath: string): LibraryCatalog {
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

function ensureIconLibrarySource(catalog: LibraryCatalog) {
  if (catalog.sources.some((source) => source.id === ICON_LIBRARY_SOURCE_ID)) return;
  catalog.sources.push({
    id: ICON_LIBRARY_SOURCE_ID,
    name: "Providence Icon Library",
    relativePath: "providence://icon-library",
    originalPath: "providence://icon-library",
    sourceKind: "providence-library",
    role: "icon-library",
    bytes: 0,
    sha256: "providence-icon-library",
    copiedTo: catalog.managedPath,
    confidence: "confirmed"
  });
}

function nextIconLibraryNumber(catalog: LibraryCatalog) {
  const used = new Set(catalog.entities.filter(isProvidenceIconLibraryEntry).map((entry) => summaryNumber(entry, "libraryNumber")));
  for (let id = 1; id < 1_000_000; id += 1) if (!used.has(id)) return id;
  return used.size + 1;
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
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function iconLibraryAssetNumber(asset: LibraryAsset) {
  const match = asset.id.match(/^library-asset:providence:icon-library:(\d+):/);
  return match ? Number(match[1]) : null;
}

function iconLibraryAssetRole(asset: LibraryAsset): IconLibraryResource["role"] | null {
  const match = asset.id.match(/^library-asset:providence:icon-library:\d+:(base|paired|item)$/);
  return match ? match[1] as IconLibraryResource["role"] : null;
}

function readStoredIconLibrary(managedPath: string): { records: LibraryCatalog["records"]; entities: LibraryEntity[]; assets: LibraryAsset[] } | null {
  try {
    const raw = localStorage.getItem(iconLibraryStorageKey(managedPath)) ?? localStorage.getItem(ICON_LIBRARY_LEGACY_STORAGE_KEY);
    const parsed = JSON.parse(raw ?? "null");
    if (!parsed || !Array.isArray(parsed.records) || !Array.isArray(parsed.entities) || !Array.isArray(parsed.assets)) return null;
    return { records: parsed.records, entities: parsed.entities, assets: parsed.assets };
  } catch {
    return null;
  }
}

function iconLibraryStorageKey(managedPath: string) {
  return `${ICON_LIBRARY_STORAGE_PREFIX}${encodeURIComponent(managedPath || "browser://workspace/library")}`;
}

function estimateBase64Bytes(value: string) {
  const clean = value.replace(/\s/g, "");
  return Math.max(0, Math.floor(clean.length * 3 / 4) - (clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeFacingMode(value: unknown): IconLibraryFacingMode {
  return value === "mirrored" ? "mirrored" : "custom";
}

function normalizeCanvas(value: unknown): IconLibraryCanvas | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<IconLibraryCanvas>;
  const width = positiveInteger(candidate.width);
  const height = positiveInteger(candidate.height);
  return width && height ? { width, height } : null;
}

function inferCanvasFromResources(resources: IconLibraryResource[]): IconLibraryCanvas | null {
  const base = resources.find((resource) => resource.role === "base") ?? resources[0];
  const width = positiveInteger(base?.width);
  const height = positiveInteger(base?.height);
  return width && height ? { width, height } : null;
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : undefined;
}
