import { LibraryCatalog, LibraryEntity } from "./types";

export type LibraryDraftSpec = {
  editorId: string;
  editorLabel: string;
  entityType: string;
};

const DRAFT_SOURCE_ID = "library-source:providence:drafts";

export function createLibraryDraft(catalog: LibraryCatalog | null, managedPath: string, spec: LibraryDraftSpec) {
  const next = cloneOrCreateCatalog(catalog, managedPath);
  ensureDraftSource(next);
  const number = next.entities.filter((entity) => entity.type === spec.entityType && isDraftEntity(entity.id)).length + 1;
  const token = stableToken(spec.entityType);
  const id = `library-entity:providence:${token}:${number}`;
  const recordId = `library-record:providence:${token}:${number}`;
  const label = `Draft ${spec.editorLabel} ${number}`;
  const now = new Date().toISOString();

  next.records.push({
    id: recordId,
    source: DRAFT_SOURCE_ID,
    type: spec.entityType,
    label,
    editState: "editable",
    byteRange: null,
    confidence: "author-draft",
    summary: {
      draft: true,
      editorId: spec.editorId,
      createdAt: now,
      exportState: "blocked until a fixture-backed Realmz writer exists",
      fields: {}
    }
  });
  const entity: LibraryEntity = {
    id,
    type: spec.entityType,
    label,
    source: DRAFT_SOURCE_ID,
    recordRef: recordId,
    editState: "editable",
    confidence: "author-draft",
    summary: {
      draft: true,
      editorId: spec.editorId,
      notes: "",
      createdAt: now,
      exportState: "blocked until a fixture-backed Realmz writer exists"
    }
  };
  next.entities.push(entity);
  summarize(next);
  return { catalog: next, entity };
}

export function updateLibraryDraft(catalog: LibraryCatalog, entityId: string, changes: { label?: string; notes?: string }) {
  const next = cloneOrCreateCatalog(catalog, catalog.managedPath);
  next.entities = next.entities.map((entity) => {
    if (entity.id !== entityId) return entity;
    return {
      ...entity,
      label: changes.label ?? entity.label,
      summary: {
        ...entity.summary,
        notes: changes.notes ?? entity.summary.notes ?? ""
      }
    };
  });
  const updated = next.entities.find((entity) => entity.id === entityId);
  if (updated?.recordRef) {
    next.records = next.records.map((record) => {
      if (record.id !== updated.recordRef) return record;
      return {
        ...record,
        label: updated.label,
        summary: {
          ...record.summary,
          label: updated.label,
          notes: updated.summary.notes ?? ""
        }
      };
    });
  }
  summarize(next);
  return next;
}

export function isDraftEntity(id: string) {
  return id.startsWith("library-entity:providence:");
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
    schemaVersion: 1,
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

function ensureDraftSource(catalog: LibraryCatalog) {
  if (catalog.sources.some((source) => source.id === DRAFT_SOURCE_ID)) return;
  catalog.sources.push({
    id: DRAFT_SOURCE_ID,
    name: "Providence Drafts",
    relativePath: "Providence Drafts",
    originalPath: "providence-library://drafts",
    sourceKind: "providence-library",
    role: "authoring-drafts",
    bytes: 0,
    sha256: "draft",
    copiedTo: "providence-library://drafts",
    confidence: "author-draft"
  });
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

function stableToken(value: string) {
  return value
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "entry";
}
