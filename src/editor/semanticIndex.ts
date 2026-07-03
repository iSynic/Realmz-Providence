import { Project, SemanticEntity, SemanticLink, SemanticRecord } from "./types";

type SemanticIndex = {
  entitiesById: Map<string, SemanticEntity>;
  recordsById: Map<string, SemanticRecord>;
  linksById: Map<string, SemanticLink>;
};

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
const MAX_SEMANTIC_INDEX_CACHE_ENTRIES = 48;
const indexes = new Map<string, SemanticIndex>();

export function semanticIndex(project: Project): SemanticIndex {
  const cacheKey = semanticIndexDependencyKey(project);
  const cached = indexes.get(cacheKey);
  if (cached) return cached;
  const schema = project.semanticSchema;
  const index = {
    entitiesById: new Map((schema?.entities ?? []).map((entity) => [entity.id, entity])),
    recordsById: new Map((schema?.records ?? []).map((record) => [record.id, record])),
    linksById: new Map((schema?.links ?? []).map((link) => [link.id, link]))
  };
  writeSemanticIndexCache(cacheKey, index);
  return index;
}

function semanticIndexDependencyKey(project: Project) {
  return [
    "entities", objectCacheKey(project.semanticSchema?.entities),
    "records", objectCacheKey(project.semanticSchema?.records),
    "links", objectCacheKey(project.semanticSchema?.links)
  ].join(":");
}

function objectCacheKey(value: object | null | undefined) {
  if (!value) return "none";
  const existing = objectIds.get(value);
  if (existing) return String(existing);
  const next = nextObjectId++;
  objectIds.set(value, next);
  return String(next);
}

function writeSemanticIndexCache(key: string, index: SemanticIndex) {
  indexes.set(key, index);
  if (indexes.size <= MAX_SEMANTIC_INDEX_CACHE_ENTRIES) return;
  const firstKey = indexes.keys().next().value;
  if (firstKey) indexes.delete(firstKey);
}

export function semanticEntityById(project: Project | null, id: string | null | undefined) {
  if (!project || !id) return null;
  return semanticIndex(project).entitiesById.get(id) ?? null;
}

export function semanticRecordById(project: Project | null, id: string | null | undefined) {
  if (!project || !id) return null;
  return semanticIndex(project).recordsById.get(id) ?? null;
}

export function semanticLinkById(project: Project | null, id: string | null | undefined) {
  if (!project || !id) return null;
  return semanticIndex(project).linksById.get(id) ?? null;
}

export function semanticLinksForId(project: Project | null, id: string | null | undefined) {
  if (!project || !id) return { outgoing: [] as SemanticLink[], incoming: [] as SemanticLink[] };
  const reverse = project.semanticSchema?.reverseLinks?.[id];
  if (!reverse) return { outgoing: [], incoming: [] };
  const links = semanticIndex(project).linksById;
  return {
    outgoing: reverse.outgoing.map((linkId) => links.get(linkId)).filter(Boolean) as SemanticLink[],
    incoming: reverse.incoming.map((linkId) => links.get(linkId)).filter(Boolean) as SemanticLink[]
  };
}
