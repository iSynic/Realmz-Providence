import { Project, QuestContextSource, QuestThread } from "../types";
import { normalizedEditorMetadata } from "./tilePaletteCommands";

export function createQuestThread(project: Project, command: { id?: string; name: string; description?: string; questIds?: number[]; contextRefs?: QuestThread["contextRefs"] }) {
  const metadata = normalizedEditorMetadata(project);
  const now = new Date().toISOString();
  const name = normalizeThreadName(command.name, metadata.questThreads.length + 1);
  const thread: QuestThread = {
    id: uniqueQuestThreadId(metadata.questThreads, command.id ?? questThreadIdFromName(name)),
    name,
    description: command.description?.trim() ?? "",
    questIds: uniqueQuestIds(command.questIds ?? []),
    contextRefs: normalizeContextRefs(command.contextRefs ?? []),
    createdAt: now,
    updatedAt: now,
    source: "user"
  };
  return {
    ...project,
    editorMetadata: {
      ...metadata,
      questThreads: [...metadata.questThreads, thread]
    }
  };
}

export function updateQuestThread(project: Project, threadId: string, changes: Partial<Pick<QuestThread, "name" | "description" | "questIds" | "contextRefs">>) {
  const metadata = normalizedEditorMetadata(project);
  let changed = false;
  const questThreads = metadata.questThreads.map((thread) => {
    if (thread.id !== threadId) return thread;
    const next: QuestThread = {
      ...thread,
      name: changes.name == null ? thread.name : normalizeThreadName(changes.name, 1),
      description: changes.description == null ? thread.description : changes.description,
      questIds: changes.questIds == null ? thread.questIds : uniqueQuestIds(changes.questIds),
      contextRefs: changes.contextRefs == null ? thread.contextRefs : normalizeContextRefs(changes.contextRefs)
    };
    if (threadsEqual(thread, next)) return thread;
    changed = true;
    return { ...next, updatedAt: new Date().toISOString() };
  });
  return changed ? { ...project, editorMetadata: { ...metadata, questThreads } } : project;
}

export function addQuestContextSource(project: Project, source: QuestContextSource) {
  const metadata = normalizedEditorMetadata(project);
  const exists = metadata.questContextSources.some((candidate) => candidate.id === source.id || candidate.contentHash === source.contentHash);
  const questContextSources = exists
    ? metadata.questContextSources.map((candidate) => candidate.id === source.id || candidate.contentHash === source.contentHash ? source : candidate)
    : [...metadata.questContextSources, source];
  return { ...project, editorMetadata: { ...metadata, questContextSources } };
}

export function deleteQuestContextSource(project: Project, sourceId: string) {
  const metadata = normalizedEditorMetadata(project);
  const questContextSources = metadata.questContextSources.filter((source) => source.id !== sourceId);
  const questThreads = metadata.questThreads.map((thread) => ({
    ...thread,
    contextRefs: (thread.contextRefs ?? []).filter((ref) => ref.sourceId !== sourceId)
  }));
  return questContextSources.length === metadata.questContextSources.length
    ? project
    : { ...project, editorMetadata: { ...metadata, questContextSources, questThreads } };
}

export function deleteQuestThread(project: Project, threadId: string) {
  const metadata = normalizedEditorMetadata(project);
  const questThreads = metadata.questThreads.filter((thread) => thread.id !== threadId);
  return questThreads.length === metadata.questThreads.length
    ? project
    : { ...project, editorMetadata: { ...metadata, questThreads } };
}

function normalizeThreadName(name: string, index: number) {
  const trimmed = name.trim();
  return trimmed || `Quest Thread ${index}`;
}

function uniqueQuestIds(questIds: number[]) {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const questId of questIds) {
    if (!Number.isFinite(questId)) continue;
    const normalized = Math.trunc(questId);
    if (normalized < 0 || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeContextRefs(refs: QuestThread["contextRefs"]) {
  return (refs ?? []).map((ref) => ({
    sourceId: ref.sourceId?.trim() || "",
    sectionId: ref.sectionId?.trim() || undefined,
    label: ref.label?.trim() || "Quest context",
    snippet: ref.snippet?.trim() || undefined,
    terms: [...new Set((ref.terms ?? []).map((term) => term.trim()).filter(Boolean))]
  })).filter((ref) => ref.sourceId || ref.snippet || ref.terms.length > 0);
}

function questThreadIdFromName(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `quest-thread:${slug || "thread"}`;
}

function uniqueQuestThreadId(threads: QuestThread[], preferred: string) {
  const used = new Set(threads.map((thread) => thread.id));
  const base = preferred.trim() || "quest-thread:thread";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function threadsEqual(a: QuestThread, b: QuestThread) {
  return a.id === b.id &&
    a.name === b.name &&
    a.description === b.description &&
    a.questIds.length === b.questIds.length &&
    a.questIds.every((questId, index) => questId === b.questIds[index]) &&
    JSON.stringify(a.contextRefs ?? []) === JSON.stringify(b.contextRefs ?? []);
}
