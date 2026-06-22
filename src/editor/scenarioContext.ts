import { Project, QuestContextSource, QuestThread } from "./types";

export type RecognizedScenarioContext = {
  id: string;
  scenarioName: string;
  confidence: "high" | "medium" | "low";
  summary: string;
  recognitionNotes: string[];
  sources: QuestContextSource[];
  threads: QuestThread[];
};

const CASTLE_CONTEXT_SOURCE: QuestContextSource = {
  id: "bundled-context:castle-in-the-clouds:keto-sequence",
  title: "Castle in the Clouds Context Notes",
  sourceType: "bundled-scenario-context",
  scenarioSlug: "castle-in-the-clouds",
  contentHash: "castle-keto-v1",
  sections: [
    {
      id: "keto-war",
      title: "Lord and Lady Keto War",
      snippet: "Early Ketonia encounters ask the party to side with Lord Keto or Lady Keto. Guard gates and shops react to those allegiance flags.",
      terms: ["lord keto", "lady keto", "ketonia", "guards", "alliance", "gate"]
    },
    {
      id: "real-lord-keto",
      title: "Real Lord Keto Imprisoned",
      snippet: "A prisoner identifies himself as the real Lord Keto and asks the party to find Lady Keto and destroy Ulmac.",
      terms: ["lord keto", "ulmac", "imprisoned", "find lady keto", "impostor"]
    },
    {
      id: "real-lady-keto",
      title: "Real Lady Keto And Revival",
      snippet: "The real Lady Keto can be found dead; revival text says she asks for Lord Keto and warns that Ulmac controls an impostor.",
      terms: ["lady keto", "dead", "revive", "impostor", "lord keto", "ulmac"]
    },
    {
      id: "ulmac-ambersair",
      title: "Ulmac And Ambersair",
      snippet: "Later story text links Ulmac and Ambersair to Ketonia's false rulers. Several messages ask whether they have been destroyed before the Keto reunion can resolve.",
      terms: ["ulmac", "ambersair", "ketonia", "destroyed", "reunion"]
    },
    {
      id: "keto-reunion",
      title: "Keto Reunion",
      snippet: "The happy path appears to reunite Lord Keto and Lady Keto after the impostors and controlling villains are handled.",
      terms: ["lord keto", "lady keto", "reunion", "peace", "ketonia"]
    }
  ]
};

const CASTLE_THREADS: QuestThread[] = [
  {
    id: "bundled-thread:castle-in-the-clouds:keto-allegiances",
    name: "Keto Allegiances And Gates",
    description: "Tracks the early Lord/Lady Keto faction choice and the guard/shop gates that react to those story flags.",
    questIds: [2],
    contextRefs: [
      contextRef("keto-war", ["lord keto", "lady keto", "gate", "alliance"])
    ],
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    source: "bundled"
  },
  {
    id: "bundled-thread:castle-in-the-clouds:real-ketos",
    name: "Find The Real Ketos",
    description: "Connects the imprisoned real Lord Keto, the dead/revived real Lady Keto, and the warnings about impostors.",
    questIds: [4, 5],
    contextRefs: [
      contextRef("real-lord-keto", ["lord keto", "ulmac", "imprisoned"]),
      contextRef("real-lady-keto", ["lady keto", "dead", "revive", "impostor"])
    ],
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    source: "bundled"
  },
  {
    id: "bundled-thread:castle-in-the-clouds:ulmac-ambersair",
    name: "Ulmac, Ambersair, And Ketonia",
    description: "Surfaces the likely main-resolution chain around destroying Ulmac and Ambersair before Ketonia can be restored.",
    questIds: [6, 7, 8],
    contextRefs: [
      contextRef("ulmac-ambersair", ["ulmac", "ambersair", "ketonia"]),
      contextRef("keto-reunion", ["lord keto", "lady keto", "peace"])
    ],
    createdAt: "2026-06-22T00:00:00.000Z",
    updatedAt: "2026-06-22T00:00:00.000Z",
    source: "bundled"
  }
];

const RECOGNIZED_CONTEXTS: RecognizedScenarioContext[] = [
  {
    id: "castle-in-the-clouds",
    scenarioName: "Castle in the Clouds",
    confidence: "high",
    summary: "Providence recognizes this as Castle in the Clouds and can show curated context for the Keto/Ulmac continuity. Treat it as a navigation aid over raw Divinity quest flags and scripts, not as a replacement for runtime testing.",
    recognitionNotes: [
      "Matched by scenario/source name containing Castle in the Clouds.",
      "Context is based on decoded scenario strings and the bundled Castle hint-guide candidate."
    ],
    sources: [CASTLE_CONTEXT_SOURCE],
    threads: CASTLE_THREADS
  }
];

export function recognizedScenarioContextForProject(project: Project): RecognizedScenarioContext | null {
  const haystack = [
    project.scenario?.name,
    project.source?.sourcePath,
    project.scenario?.shell?.sourceFile,
    project.scenario?.contactInfo?.scenarioName,
    project.scenario?.contactInfo?.titles?.join(" ")
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\bcastle\s+in\s+the\s+clouds\b/.test(haystack)) return RECOGNIZED_CONTEXTS[0];
  return null;
}

export function recognizedQuestContextSources(project: Project) {
  return recognizedScenarioContextForProject(project)?.sources ?? [];
}

export function recognizedQuestThreads(project: Project) {
  return recognizedScenarioContextForProject(project)?.threads ?? [];
}

function contextRef(sectionId: string, terms: string[]) {
  const section = CASTLE_CONTEXT_SOURCE.sections.find((candidate) => candidate.id === sectionId);
  return {
    sourceId: CASTLE_CONTEXT_SOURCE.id,
    sectionId,
    label: `${CASTLE_CONTEXT_SOURCE.title}: ${section?.title ?? sectionId}`,
    snippet: section?.snippet,
    terms
  };
}
