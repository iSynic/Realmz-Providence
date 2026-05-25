import { Project, SemanticEntity, SemanticLink, SemanticRecord } from "./types";

type SemanticIndex = {
  entitiesById: Map<string, SemanticEntity>;
  recordsById: Map<string, SemanticRecord>;
  linksById: Map<string, SemanticLink>;
};

const indexes = new WeakMap<Project, SemanticIndex>();

export function semanticIndex(project: Project): SemanticIndex {
  const cached = indexes.get(project);
  if (cached) return cached;
  const index = {
    entitiesById: new Map(project.semanticSchema.entities.map((entity) => [entity.id, entity])),
    recordsById: new Map(project.semanticSchema.records.map((record) => [record.id, record])),
    linksById: new Map(project.semanticSchema.links.map((link) => [link.id, link]))
  };
  indexes.set(project, index);
  return index;
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
  const reverse = project.semanticSchema.reverseLinks[id];
  if (!reverse) return { outgoing: [], incoming: [] };
  const links = semanticIndex(project).linksById;
  return {
    outgoing: reverse.outgoing.map((linkId) => links.get(linkId)).filter(Boolean) as SemanticLink[],
    incoming: reverse.incoming.map((linkId) => links.get(linkId)).filter(Boolean) as SemanticLink[]
  };
}
