import type { QuestContextSourceType } from "./types";

export type RecognizedScenarioContextRegistryEntry = {
  id: string;
  scenarioName: string;
  aliases: string[];
  confidence: "high" | "medium" | "low";
  summary: string;
  recognitionNotes: string[];
  coverageCriteria: string[];
  matchers: RegExp[];
  source: {
    id: string;
    title: string;
    sourceType: QuestContextSourceType;
    scenarioSlug: string;
    contentHash: string;
    sections: {
      id: string;
      title: string;
      snippet: string;
      terms: string[];
    }[];
  };
  threads: {
    id: string;
    name: string;
    description: string;
    questIds: number[];
    contextRefs: {
      sectionId: string;
      terms: string[];
    }[];
  }[];
};

export const RECOGNIZED_SCENARIO_CONTEXT_REGISTRY: RecognizedScenarioContextRegistryEntry[] = [
  {
    id: "castle-in-the-clouds",
    scenarioName: "Castle in the Clouds",
    aliases: ["Castle", "Castle in the Clouds"],
    confidence: "high",
    summary: "Providence recognizes this as Castle in the Clouds and can show curated beta context for the Keto/Ulmac continuity. Treat it as a navigation aid over raw Divinity quest flags and scripts, not as a replacement for runtime testing.",
    recognitionNotes: [
      "Matched by scenario/source name containing Castle in the Clouds.",
      "Context is based on decoded scenario strings and the bundled Castle hint-guide candidate."
    ],
    coverageCriteria: [
      "Recognition must come from scenario/source metadata or an exact known scenario alias.",
      "Curated notes must stay read-only and separate from project-authored flag labels.",
      "Story Flags must still expose decoded set/test/clear/increment/branch uses for the raw flag IDs.",
      "Stronger Castle continuity claims require cited developer reports, fixtures, or decoded runtime evidence."
    ],
    matchers: [/\bcastle\s+in\s+the\s+clouds\b/i],
    source: {
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
        },
        {
          id: "coverage-criteria",
          title: "Curated Beta Coverage Criteria",
          snippet: "Castle support is currently a curated beta note set. Providence should not claim complete scenario continuity until decoded runtime evidence, fixtures, or cited developer reports cover the relevant story paths.",
          terms: ["coverage", "beta", "runtime evidence", "fixtures", "developer reports", "continuity"]
        }
      ]
    },
    threads: [
      {
        id: "bundled-thread:castle-in-the-clouds:keto-allegiances",
        name: "Keto Allegiances And Gates",
        description: "Tracks the early Lord/Lady Keto faction choice and the guard/shop gates that react to those story flags.",
        questIds: [2],
        contextRefs: [
          { sectionId: "keto-war", terms: ["lord keto", "lady keto", "gate", "alliance"] }
        ]
      },
      {
        id: "bundled-thread:castle-in-the-clouds:real-ketos",
        name: "Find The Real Ketos",
        description: "Connects the imprisoned real Lord Keto, the dead/revived real Lady Keto, and the warnings about impostors.",
        questIds: [4, 5],
        contextRefs: [
          { sectionId: "real-lord-keto", terms: ["lord keto", "ulmac", "imprisoned"] },
          { sectionId: "real-lady-keto", terms: ["lady keto", "dead", "revive", "impostor"] }
        ]
      },
      {
        id: "bundled-thread:castle-in-the-clouds:ulmac-ambersair",
        name: "Ulmac, Ambersair, And Ketonia",
        description: "Surfaces the likely main-resolution chain around destroying Ulmac and Ambersair before Ketonia can be restored.",
        questIds: [6, 7, 8],
        contextRefs: [
          { sectionId: "ulmac-ambersair", terms: ["ulmac", "ambersair", "ketonia"] },
          { sectionId: "keto-reunion", terms: ["lord keto", "lady keto", "peace"] }
        ]
      }
    ]
  }
];
