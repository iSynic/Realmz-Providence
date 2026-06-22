import { Project, QuestContextRef, QuestContextSource, QuestContextSourceType, QuestThread } from "./types";

export type QuestContextWebSource = {
  id: string;
  title: string;
  url: string;
};

export type ContextQuestLike = {
  id: number;
  label: string;
  note?: string;
  uses: Array<{ label: string; detail: string; sourceLabel: string }>;
};

export type ContextThreadSuggestion = {
  id: string;
  name: string;
  description: string;
  questIds: number[];
  reason: string;
  contextRefs: QuestContextRef[];
  evidence: string[];
};

export const QUEST_CONTEXT_WEB_SOURCES: QuestContextWebSource[] = [
  {
    id: "gamefaqs-realmz-faq",
    title: "GameFAQs Realmz FAQ",
    url: "https://gamefaqs.gamespot.com/mac/564322-realmz/faqs/77703"
  },
  {
    id: "realmz-fandom",
    title: "Realmz Wiki",
    url: "https://realmz.fandom.com/wiki/Realmz_Wiki"
  }
];

const QUEST_CONTEXT_CACHE_KEY = "providence.questContextSources.v1";
const STOP_TERMS = new Set([
  "about", "after", "again", "also", "area", "before", "being", "branch", "castle", "chapter", "click", "could", "divinity",
  "does", "done", "door", "each", "encounter", "enter", "extra", "fantasoft", "flag", "from", "game", "guide", "have", "into",
  "item", "level", "lord", "make", "message", "monster", "open", "party", "quest", "realmz", "scenario", "should", "spell",
  "string", "that", "their", "there", "these", "they", "this", "through", "time", "when", "where", "which", "with", "would"
]);

export function scenarioSlugForProject(project: Project) {
  return slugify(project.scenario?.name || project.source?.sourcePath || "scenario");
}

export async function fetchQuestContextSource(adapter: QuestContextWebSource, project: Project) {
  const response = await fetch(adapter.url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Could not fetch ${adapter.title}: HTTP ${response.status}`);
  const text = await response.text();
  return indexQuestContextText(htmlToText(text), {
    title: adapter.title,
    sourceType: "web-guide",
    sourceUrl: adapter.url,
    scenarioSlug: scenarioSlugForProject(project)
  });
}

export async function fileToQuestContextSource(file: File, project: Project) {
  const text = await file.text();
  return indexQuestContextText(file.name.toLowerCase().endsWith(".htm") || file.name.toLowerCase().endsWith(".html") ? htmlToText(text) : text, {
    title: file.name.replace(/\.[^.]+$/, ""),
    sourceType: "bundled-hint-guide",
    sourcePath: file.name,
    scenarioSlug: scenarioSlugForProject(project)
  });
}

export function indexQuestContextText(text: string, options: {
  title: string;
  sourceType: QuestContextSourceType;
  sourceUrl?: string;
  sourcePath?: string;
  scenarioSlug?: string;
}) {
  const normalizedText = normalizeWhitespace(text);
  const sections = splitIntoSections(normalizedText).map((section, index) => {
    const title = section.title || `${options.title} ${index + 1}`;
    const snippet = section.body.slice(0, 360);
    return {
      id: `${slugify(title) || "section"}-${index + 1}`,
      title,
      snippet,
      terms: extractContextTerms(`${title} ${section.body}`).slice(0, 28)
    };
  }).filter((section) => section.snippet && section.terms.length > 0).slice(0, 160);
  const contentHash = stableHash(`${options.title}\n${normalizedText}`);
  const source: QuestContextSource = {
    id: `quest-context:${slugify(options.title)}:${contentHash.slice(0, 8)}`,
    title: options.title.trim() || "Quest context source",
    sourceType: options.sourceType,
    scenarioSlug: options.scenarioSlug,
    sourceUrl: options.sourceUrl,
    sourcePath: options.sourcePath,
    fetchedAt: new Date().toISOString(),
    contentHash,
    sections
  };
  return source;
}

export function suggestThreadsFromContext(quests: ContextQuestLike[], threads: QuestThread[], sources: QuestContextSource[]): ContextThreadSuggestion[] {
  const existing = new Set(threads.map((thread) => normalizedQuestSet(thread.questIds)));
  const suggestions: ContextThreadSuggestion[] = [];
  const seen = new Set<string>();
  const questTermIndex = quests.map((quest) => ({
    quest,
    terms: new Set(extractContextTerms(`${quest.label} ${quest.note ?? ""} ${quest.uses.map((use) => `${use.label} ${use.detail} ${use.sourceLabel}`).join(" ")}`))
  }));

  for (const source of sources) {
    for (const section of source.sections ?? []) {
      const sectionTerms = new Set(section.terms ?? []);
      if (sectionTerms.size === 0) continue;
      const matches = questTermIndex.map(({ quest, terms }) => {
        const shared = [...sectionTerms].filter((term) => terms.has(term));
        return { quest, shared };
      }).filter((match) => match.shared.length >= 2 || strongNameMatch(match.quest.label, section));
      if (matches.length < 2) continue;
      const questIds = [...new Set(matches.map((match) => match.quest.id))].sort((a, b) => a - b);
      const key = normalizedQuestSet(questIds);
      if (!key || existing.has(key) || seen.has(`${source.id}:${section.id}:${key}`)) continue;
      seen.add(`${source.id}:${section.id}:${key}`);
      const evidence = matches.slice(0, 5).map((match) => `Quest ${match.quest.id}: ${match.shared.slice(0, 4).join(", ") || match.quest.label}`);
      suggestions.push({
        id: `context:${source.id}:${section.id}:${key}`,
        name: suggestionName(section.title, questIds),
        description: `Suggested from ${source.title}. Treat this as a story-context clue, then rename or edit it if it matches the scenario.`,
        questIds,
        reason: `context source: ${source.title}`,
        contextRefs: [{
          sourceId: source.id,
          sectionId: section.id,
          label: `${source.title}: ${section.title}`,
          snippet: section.snippet,
          terms: [...sectionTerms].slice(0, 10)
        }],
        evidence
      });
    }
  }
  return suggestions.slice(0, 16);
}

export function contextRefsForQuest(quest: ContextQuestLike, sources: QuestContextSource[]) {
  const questTerms = new Set(extractContextTerms(`${quest.label} ${quest.note ?? ""} ${quest.uses.map((use) => `${use.label} ${use.detail} ${use.sourceLabel}`).join(" ")}`));
  const refs: QuestContextRef[] = [];
  for (const source of sources) {
    for (const section of source.sections ?? []) {
      const shared = (section.terms ?? []).filter((term) => questTerms.has(term));
      if (shared.length < 2 && !strongNameMatch(quest.label, section)) continue;
      refs.push({
        sourceId: source.id,
        sectionId: section.id,
        label: `${source.title}: ${section.title}`,
        snippet: section.snippet,
        terms: shared.slice(0, 10)
      });
    }
  }
  return refs.slice(0, 6);
}

export function loadQuestContextSourceCache() {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(QUEST_CONTEXT_CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed as QuestContextSource[] : [];
  } catch {
    return [];
  }
}

export function saveQuestContextSourceCache(sources: QuestContextSource[]) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(QUEST_CONTEXT_CACHE_KEY, JSON.stringify(sources.slice(-48)));
}

export function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(h[1-6]|p|li|div|section|article|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"");
}

export function extractContextTerms(text: string) {
  const normalized = normalizeWhitespace(text);
  const phrases = new Set<string>();
  for (const match of normalized.matchAll(/\b[A-Z][A-Za-z']+(?:\s+(?:of|the|and|in|on|at|to|from|[A-Z][A-Za-z']+)){0,4}\b/g)) {
    const phrase = match[0].trim();
    if (phrase.length >= 4) phrases.add(phrase.toLowerCase());
  }
  for (const match of normalized.matchAll(/\b[a-zA-Z][a-zA-Z']{3,}\b/g)) {
    const word = match[0].toLowerCase();
    if (!STOP_TERMS.has(word)) phrases.add(word);
  }
  return [...phrases].filter((term) => term.length >= 4 && !STOP_TERMS.has(term)).slice(0, 80);
}

function splitIntoSections(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sections: Array<{ title: string; body: string }> = [];
  let currentTitle = "";
  let body: string[] = [];
  const flush = () => {
    const content = body.join(" ").trim();
    if (content.length > 80) sections.push({ title: currentTitle, body: content });
    body = [];
  };
  for (const line of lines) {
    const looksLikeHeading = line.length <= 72 && /^[A-Z0-9][A-Z0-9 '\-:,&/()]+$/.test(line) && body.length > 0;
    if (looksLikeHeading) {
      flush();
      currentTitle = line.replace(/\s+/g, " ");
    } else {
      if (!currentTitle && line.length <= 72) currentTitle = line.replace(/\s+/g, " ");
      else body.push(line);
    }
  }
  flush();
  if (sections.length === 0 && text.trim()) return [{ title: "Imported guide text", body: text.trim() }];
  return sections;
}

function suggestionName(sectionTitle: string, questIds: number[]) {
  const title = sectionTitle.replace(/^chapter\s+\d+\s*[:.-]?\s*/i, "").trim();
  if (title && title.length <= 48) return `Possible ${title} thread`;
  return `Possible flags ${questIds[0]}-${questIds[questIds.length - 1]} thread`;
}

function strongNameMatch(label: string, section: { title: string; snippet: string }) {
  const normalized = label.toLowerCase().replace(/^quest\s+\d+$/, "").trim();
  return normalized.length >= 5 && `${section.title} ${section.snippet}`.toLowerCase().includes(normalized);
}

function normalizedQuestSet(questIds: number[]) {
  return [...new Set(questIds)].sort((a, b) => a - b).join(",");
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
