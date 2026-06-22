import type { Project, QuestContextSource, QuestThread } from "./types";
import { RECOGNIZED_SCENARIO_CONTEXT_REGISTRY, type RecognizedScenarioContextRegistryEntry } from "./scenarioContextRegistry";

export type RecognizedScenarioContext = {
  id: string;
  scenarioName: string;
  confidence: "high" | "medium" | "low";
  summary: string;
  recognitionNotes: string[];
  sources: QuestContextSource[];
  threads: QuestThread[];
};

export function recognizedScenarioContextForProject(project: Project): RecognizedScenarioContext | null {
  const haystack = scenarioRecognitionHaystack(project);
  const entry = RECOGNIZED_SCENARIO_CONTEXT_REGISTRY.find((candidate) => candidate.matchers.some((matcher) => matcher.test(haystack)));
  return entry ? materializeRecognizedContext(entry) : null;
}

export function recognizedQuestContextSources(project: Project) {
  return recognizedScenarioContextForProject(project)?.sources ?? [];
}

export function recognizedQuestThreads(project: Project) {
  return recognizedScenarioContextForProject(project)?.threads ?? [];
}

function scenarioRecognitionHaystack(project: Project) {
  return [
    project.scenario?.name,
    project.source?.sourcePath,
    project.scenario?.shell?.sourceFile,
    project.scenario?.contactInfo?.scenarioName,
    project.scenario?.contactInfo?.titles?.join(" ")
  ].filter(Boolean).join(" ").toLowerCase();
}

function materializeRecognizedContext(entry: RecognizedScenarioContextRegistryEntry): RecognizedScenarioContext {
  const source: QuestContextSource = {
    ...entry.source,
    sections: entry.source.sections.map((section) => ({ ...section, terms: [...section.terms] }))
  };
  return {
    id: entry.id,
    scenarioName: entry.scenarioName,
    confidence: entry.confidence,
    summary: entry.summary,
    recognitionNotes: [...entry.recognitionNotes],
    sources: [source],
    threads: entry.threads.map((thread) => ({
      id: thread.id,
      name: thread.name,
      description: thread.description,
      questIds: [...thread.questIds],
      contextRefs: thread.contextRefs.map((ref) => contextRef(source, ref.sectionId, ref.terms)),
      createdAt: "2026-06-22T00:00:00.000Z",
      updatedAt: "2026-06-22T00:00:00.000Z",
      source: "bundled"
    }))
  };
}

function contextRef(source: QuestContextSource, sectionId: string, terms: string[]) {
  const section = source.sections.find((candidate) => candidate.id === sectionId);
  return {
    sourceId: source.id,
    sectionId,
    label: `${source.title}: ${section?.title ?? sectionId}`,
    snippet: section?.snippet,
    terms: [...terms]
  };
}
