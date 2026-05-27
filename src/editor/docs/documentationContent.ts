export const DIVINITY_GUIDE_BASE_URL = "http://127.0.0.1:8766/index.html";

export type DocumentationGroup = {
  id: string;
  label: string;
  description: string;
};

export type DocumentationReference =
  | {
      kind: "divinity";
      label: string;
      detail: string;
      href: string;
    }
  | {
      kind: "repo";
      label: string;
      detail: string;
      path: string;
    };

export type DocumentationCallout = {
  tone: "info" | "success" | "warning";
  title: string;
  body: string;
};

export type DocumentationCard = {
  title: string;
  body: string;
  facts?: string[];
};

export type DocumentationVisualSlot = {
  title: string;
  caption: string;
  sourceLabel?: string;
  sourceHref?: string;
  imageSrc?: string;
};

export type DocumentationSection = {
  title: string;
  paragraphs?: string[];
  points?: string[];
  cards?: DocumentationCard[];
  callout?: DocumentationCallout;
};

export type DocumentationTopic = {
  id: string;
  groupId: string;
  label: string;
  title: string;
  summary: string;
  tags: string[];
  badges: string[];
  references: DocumentationReference[];
  sections: DocumentationSection[];
  relatedTopicIds: string[];
  visualSlots?: DocumentationVisualSlot[];
};

export const DOCUMENTATION_GROUPS: DocumentationGroup[] = [
  {
    id: "authoring",
    label: "Author Workflows",
    description: "Practical Providence workflows for building Realmz scenarios."
  },
  {
    id: "reference",
    label: "Reference",
    description: "Compatibility language, Divinity crosswalks, and troubleshooting."
  }
];

export const DIVINITY_CHAPTERS = {
  gettingStarted: divinityRef(1, "Getting Started"),
  landEditor: divinityRef(2, "Land Editor / Land Layout Editor"),
  startup: divinityRef(3, "Scenario Startup Information"),
  actionPoints: divinityRef(4, "Action Points / GOSUBs"),
  scriptingOne: divinityRef(5, "Scripting Codes 1 - 29"),
  scriptingTwo: divinityRef(6, "Scripting Codes 30 - 59"),
  scriptingThree: divinityRef(7, "Scripting Codes 60 - 89"),
  scriptingFour: divinityRef(8, "Scripting Codes 90 - End"),
  battle: divinityRef(10, "Battle Editor"),
  monster: divinityRef(11, "Monster Editor"),
  treasure: divinityRef(13, "Treasure Editor"),
  item: divinityRef(14, "Item Editor"),
  shop: divinityRef(15, "Shop Editor"),
  simpleEncounter: divinityRef(16, "Simple Encounter Editor"),
  complexEncounter: divinityRef(17, "Complex Encounter Editor"),
  map: divinityRef(20, "Map Editor"),
  dungeon: divinityRef(21, "Dungeon Editor"),
  macrosQuests: divinityRef(22, "Macros / Quests"),
  icons: divinityRef(25, "Adding Monster & Item Icons"),
  specialLand: divinityRef(26, "Creating Special Land Tiles"),
  picturesSounds: divinityRef(27, "Adding Pictures & Sounds"),
  standardLand: divinityRef(28, "Standard Land Tile Editor"),
  spell: divinityRef(29, "Spell Editor"),
  race: divinityRef(30, "Race Editor"),
  caste: divinityRef(31, "Caste Editor"),
  text: divinityRef(32, "Text Import / Export / Spell Checking"),
  release: divinityRef(34, "Release Checklist")
} as const;

export const MARKDOWN_REFERENCES = {
  divinityParity: repoRef("Divinity Parity Map", "Feature crosswalk and next milestones.", "docs/divinity-parity-map.md"),
  scriptsV2: repoRef("Scripts V2 Authoring Guide", "Action Point, EDCD, target, and diagnostics workflow.", "docs/scripts-v2-authoring.md"),
  formatIntegration: repoRef("Scenario Format Integration", "Authored source, runtime cache, and resource policy.", "docs/scenario-format-integration.md"),
  oracleHarness: repoRef("Oracle Harness", "Optional Realmz Classic compatibility workflow.", "docs/oracle-harness.md")
} as const;

export const DOCUMENTATION_TOPICS: DocumentationTopic[] = [
  {
    id: "getting-started",
    groupId: "authoring",
    label: "Getting Started",
    title: "Providence Workbenches",
    summary: "Choose the right workbench, start a project safely, and understand what the bundled libraries are for.",
    tags: ["project", "library", "import", "Divinity", "workspace"],
    badges: ["author-first", "orientation"],
    references: [DIVINITY_CHAPTERS.gettingStarted, MARKDOWN_REFERENCES.divinityParity],
    relatedTopicIds: ["projects", "maps", "linter-release"],
    sections: [
      {
        title: "What Providence Is For",
        paragraphs: [
          "Providence is a modern Realmz scenario editor. It keeps Realmz file formats authoritative while presenting authoring workflows in a calmer, guided interface.",
          "Use the Project Workbench when you are creating, importing, editing, validating, and exporting a scenario package. Use the Library Workbench when you need read-only Realmz and Divinity reference material."
        ],
        cards: [
          {
            title: "Project Workbench",
            body: "Maps, scripts, scenario data, assets, validation, and export reports for the current scenario package.",
            facts: ["editable", "exportable"]
          },
          {
            title: "Library Workbench",
            body: "Bundled Divinity and Realmz catalogs for pictures, sounds, icons, items, monsters, spells, races, castes, and reference resources.",
            facts: ["read-only", "shared"]
          }
        ]
      },
      {
        title: "Safe First Steps",
        points: [
          "Create or open a Providence project before importing a Realmz scenario.",
          "Import is available only while a project is empty, so source data cannot be accidentally merged into existing authored records.",
          "Use validation before export. Providence will explain missing targets, unsupported edits, malformed resources, and export blockers."
        ],
        callout: {
          tone: "info",
          title: "Divinity stays the capability reference",
          body: "The in-app handbook summarizes author workflows. The local Divinity Manual remains the chapter-level reference for legacy concepts and terminology."
        }
      }
    ],
    visualSlots: [
      {
        title: "Workbench overview",
        caption: "Reserved for a stable Providence screenshot showing the topbar, Project Workbench, Library button, and Documents entry."
      }
    ]
  },
  {
    id: "projects",
    groupId: "authoring",
    label: "Projects",
    title: "Projects, Import, and Export",
    summary: "Understand the folder package model, immutable source snapshots, save behavior, and conservative Realmz export.",
    tags: ["project", "import", "export", "source snapshot", "folder package"],
    badges: ["export-safe", "verified"],
    references: [DIVINITY_CHAPTERS.startup, MARKDOWN_REFERENCES.formatIntegration],
    relatedTopicIds: ["getting-started", "records-evidence", "linter-release"],
    sections: [
      {
        title: "Folder Packages",
        paragraphs: [
          "A Providence project is a folder package with its own schema, imported scenario snapshot, managed assets, decoded records, and editor-only names.",
          "Providence reads imported scenarios, stores editable structures, and keeps the original scenario folder out of the mutation path."
        ]
      },
      {
        title: "Export Contract",
        points: [
          "Export writes a Realmz-readable scenario folder.",
          "Supported edited files are written from Providence's typed project state.",
          "Compatible unsupported files pass through when Providence can preserve them safely.",
          "Unknown destructive writes are blocked and explained by the linter."
        ],
        cards: [
          {
            title: "New Project",
            body: "Starts an empty package and leaves scenario import available.",
            facts: ["empty package"]
          },
          {
            title: "Open Project",
            body: "Loads an existing Providence folder package.",
            facts: ["project.json"]
          },
          {
            title: "Export",
            body: "Writes supported Realmz files and reports preserved resources and warnings.",
            facts: ["safe output"]
          }
        ]
      }
    ]
  },
  {
    id: "maps",
    groupId: "authoring",
    label: "Maps",
    title: "Maps, Painting, and Overlays",
    summary: "Work with land and dungeon maps, tile painting, overlays, map records, triggers, and random rectangles.",
    tags: ["maps", "land", "dungeon", "painting", "overlays", "Action Point"],
    badges: ["authoring", "visual"],
    references: [DIVINITY_CHAPTERS.landEditor, DIVINITY_CHAPTERS.map, DIVINITY_CHAPTERS.dungeon],
    relatedTopicIds: ["scripts", "assets", "records-evidence"],
    sections: [
      {
        title: "Map Authoring Surface",
        paragraphs: [
          "The map canvas is the primary editing surface. Use tool controls for selection, painting, sampling, panning, and Action Point placement.",
          "Map overlays expose Realmz data that is easy to miss in a flat tile view: triggers, random rectangles, map records, encounter markers, quest links, secret overlays, and other decoded semantic hints."
        ]
      },
      {
        title: "Tile Safety",
        points: [
          "Use real tile atlases when available to inspect the artwork Realmz will use.",
          "Use decoded-color mode when an atlas is missing or when raw values are easier to audit.",
          "Standard positive land tiles use Realmz landlook data for movement, solidity, shore/path, LOS, and related attributes.",
          "Special Land Tiles are negative tile IDs backed by scenario cicn resources; Data Solids supplies their scenario-local solidity rules."
        ],
        callout: {
          tone: "warning",
          title: "Attribute table editing is not ready yet",
          body: "Providence can group and validate tiles from Realmz mapstats/Data Solids data, but land tile attribute table editing remains disabled until the remaining bytes are understood."
        }
      },
      {
        title: "Darkness And Line Of Sight",
        paragraphs: [
          "Dark Level and Use Line Of Sight are authored Realmz map flags. Providence previews them as an editor-only approximation from a chosen focal cell; it does not write Realmz runtime site/visibility cache data."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Map overlay stack",
        caption: "Reserved for a screenshot showing triggers, map records, and random rectangles on a land map."
      }
    ]
  },
  {
    id: "scripts",
    groupId: "authoring",
    label: "Scripts",
    title: "Action Points, Macros, CODE/ID, and EDCD",
    summary: "Author Realmz-native scripts with guided step editing while keeping raw CODE, ID, and EDCD available.",
    tags: ["scripts", "Action Point", "GOSUB", "macro", "CODE", "ID", "EDCD", "Divinity"],
    badges: ["Realmz-native", "diagnostic"],
    references: [
      DIVINITY_CHAPTERS.actionPoints,
      DIVINITY_CHAPTERS.scriptingOne,
      DIVINITY_CHAPTERS.scriptingTwo,
      DIVINITY_CHAPTERS.scriptingThree,
      DIVINITY_CHAPTERS.scriptingFour,
      DIVINITY_CHAPTERS.macrosQuests,
      MARKDOWN_REFERENCES.scriptsV2
    ],
    relatedTopicIds: ["encounters-targets", "text", "compatibility-terms"],
    sections: [
      {
        title: "Realmz Data, Guided Controls",
        paragraphs: [
          "Providence scripts are Realmz-native. Each visual step maps to raw CODE and ID fields, and EDCD-backed operations keep the EDCD row visible.",
          "The interface borrows the shape of modern visual scripting, but it does not compile another runtime. It emits and validates the Realmz records that Classic already understands."
        ],
        cards: [
          {
            title: "Action Points",
            body: "Fixed map trigger records. Clearing an Action Point makes the slot reusable instead of truncating the Realmz file.",
            facts: ["fixed records"]
          },
          {
            title: "Macros",
            body: "Reachable or user-authored script records that Realmz can call.",
            facts: ["callable"]
          },
          {
            title: "Imported ED3 Rows",
            body: "Imported rows that are not callable macros yet. Promote or duplicate them before using as authored behavior.",
            facts: ["inspect first"]
          }
        ]
      },
      {
        title: "Targets and Diagnostics",
        points: [
          "Target pickers resolve messages, sounds, pictures, encounters, shops, treasure, maps, monsters, quest flags, and macros where decoded targets exist.",
          "EDCD-backed opcodes place the real targets inside the EDCD row, so Providence warns beside the exact EDCD field when a target is missing.",
          "Dispatcher no-ops are reported separately from unknown executable behavior so dormant imported data does not look scarier than it is."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Script step detail",
        caption: "Reserved for a screenshot showing a selected Action Point slot with CODE, ID, EDCD, target picker, and diagnostics."
      }
    ]
  },
  {
    id: "encounters-targets",
    groupId: "authoring",
    label: "Encounters & Targets",
    title: "Target Records and Encounter Shells",
    summary: "Create and edit common script targets such as messages, battles, treasure, shops, simple encounters, and complex encounters.",
    tags: ["encounter", "target", "battle", "treasure", "shop", "message", "Data ED", "Data ED2"],
    badges: ["usable shells", "writer-backed"],
    references: [
      DIVINITY_CHAPTERS.battle,
      DIVINITY_CHAPTERS.treasure,
      DIVINITY_CHAPTERS.shop,
      DIVINITY_CHAPTERS.simpleEncounter,
      DIVINITY_CHAPTERS.complexEncounter,
      MARKDOWN_REFERENCES.scriptsV2
    ],
    relatedTopicIds: ["scripts", "text", "linter-release"],
    sections: [
      {
        title: "Inline Target Creation",
        paragraphs: [
          "Script target pickers can create common Realmz target records inline so an author does not have to leave the script flow just to satisfy a missing reference.",
          "These editors are usable shells: they expose common Divinity-style fields, keep raw evidence visible, and preserve imported bytes outside the fields Providence owns."
        ],
        cards: [
          { title: "Messages", body: "Data SD2 records used by script text actions.", facts: ["text"] },
          { title: "Battles", body: "Data BD shells with grid, distance, messages, and battle macro fields.", facts: ["combat"] },
          { title: "Treasure", body: "Data TD shells with item IDs and reward amounts.", facts: ["reward"] },
          { title: "Shops", body: "Data SD shells with item stock, quantities, and inflation.", facts: ["economy"] },
          { title: "Encounters", body: "Data ED and Data ED2 shells for simple and complex encounter flows.", facts: ["branching"] }
        ]
      },
      {
        title: "Preservation Rule",
        callout: {
          tone: "success",
          title: "Providence writes only what it owns",
          body: "Imported records keep their original raw bytes unless the user edits that record. When a record is edited, unsupported bytes are preserved wherever the writer can do so safely."
        }
      }
    ]
  },
  {
    id: "assets",
    groupId: "authoring",
    label: "Assets",
    title: "Assets and Resource Forks",
    summary: "Import, preview, name, replace, and assign resource IDs for pictures, sounds, icons, text, and Special Land Tiles.",
    tags: ["assets", "resources", "PICT", "snd", "cicn", "special land", "pictures", "sounds"],
    badges: ["resources", "previewable"],
    references: [
      DIVINITY_CHAPTERS.icons,
      DIVINITY_CHAPTERS.specialLand,
      DIVINITY_CHAPTERS.picturesSounds,
      DIVINITY_CHAPTERS.standardLand,
      MARKDOWN_REFERENCES.formatIntegration
    ],
    relatedTopicIds: ["maps", "scripts", "compatibility-terms"],
    sections: [
      {
        title: "Project Assets vs Library Assets",
        paragraphs: [
          "Project assets are user-authored media converted into Realmz resource entries. Library assets are bundled reference material and remain read-only.",
          "Each resource should either preview, play, decode, or explain why it is metadata-only, unsupported, malformed, or missing a fallback."
        ],
        cards: [
          { title: "Pictures", body: "Imported images are converted into PICT resources for picture display actions.", facts: ["PICT"] },
          { title: "Scenario Pictures", body: "Divinity-style scenario pictures use IDs 30000 through 30128; 30128 is the title picture.", facts: ["PICT"] },
          { title: "Sounds", body: "Imported audio is decoded for custom scenario snd resources in the 200 through 500 range when supported.", facts: ["snd"] },
          { title: "Icons", body: "Icon-like art can become cicn resources for Realmz-compatible icon workflows.", facts: ["cicn"] },
          { title: "Special Land Tiles", body: "32 x 32 cicn-backed negative tile IDs that can be selected for painting on land maps.", facts: ["negative ID"] }
        ]
      },
      {
        title: "Resource ID Discipline",
        points: [
          "Editor-only names help authors work, but only real Realmz fields and resources are exported.",
          "Use target pickers for picture and sound actions so resource IDs are checked against project and library assets.",
          "Resolve ID conflicts before release so Realmz finds the intended scenario resource or fallback."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Asset preview strip",
        caption: "Reserved for a screenshot showing picture, sound, icon, and Special Land Tile assets with export status badges."
      }
    ]
  },
  {
    id: "text",
    groupId: "authoring",
    label: "Text",
    title: "Scenario Text and Message Records",
    summary: "Work with scenario strings, message records, TEXT and STR# resources, and text-linked script targets.",
    tags: ["text", "messages", "Data SD2", "TEXT", "STR#", "spell check"],
    badges: ["authoring", "resource-aware"],
    references: [DIVINITY_CHAPTERS.text, MARKDOWN_REFERENCES.scriptsV2],
    relatedTopicIds: ["scripts", "encounters-targets", "assets"],
    sections: [
      {
        title: "String Records",
        paragraphs: [
          "Providence authors the scenario strings used by scripts, encounters, battles, and random areas. The editor follows Divinity's one-string-at-a-time flow with previous/next navigation, Go To String, optional search, duplicate, clear, and create actions.",
          "Use Find Occurrence to search text across all strings, and Find Long String after a spell-check import to review strings at the Realmz length limit."
        ]
      },
      {
        title: "Import, Export, and References",
        points: [
          "Export Text creates a plain text spell-check file with Divinity-style separators between strings.",
          "Import Text expects a file produced by this workflow and refuses files with the wrong number of string segments.",
          "TEXT and STR# resources remain searchable read-only references."
        ]
      }
    ]
  },
  {
    id: "combat-economy-rules",
    groupId: "authoring",
    label: "Combat, Economy, Rules",
    title: "Combat, Economy, and Rules Coverage",
    summary: "See which Divinity-style editors are authorable today, read-only today, or future work.",
    tags: ["combat", "economy", "rules", "monster", "item", "spell", "race", "caste", "Divinity"],
    badges: ["coverage", "roadmap"],
    references: [
      DIVINITY_CHAPTERS.monster,
      DIVINITY_CHAPTERS.item,
      DIVINITY_CHAPTERS.spell,
      DIVINITY_CHAPTERS.race,
      DIVINITY_CHAPTERS.caste,
      MARKDOWN_REFERENCES.divinityParity
    ],
    relatedTopicIds: ["encounters-targets", "assets", "divinity-parity"],
    sections: [
      {
        title: "What Authors Can Do Now",
        points: [
          "Battle shells can be authored where the writer owns the supported Data BD fields.",
          "Treasure and shop shells can be authored for common reward and stock workflows.",
          "Monster, item, spell, race, and caste records are visible through imported project data or library reference material when decoded."
        ]
      },
      {
        title: "Read-Only Means Intentional",
        paragraphs: [
          "When a record family is read-only, Providence can explain the data but should not edit it until export support is ready.",
          "That conservative boundary is what allows Providence to preserve imported scenarios while steadily expanding authoring power."
        ]
      }
    ]
  },
  {
    id: "records-evidence",
    groupId: "authoring",
    label: "Technical Records",
    title: "Records and Technical Details",
    summary: "Understand imported files, decoded records, links, reverse links, and diagnostics.",
    tags: ["records", "technical details", "source", "runtime cache"],
    badges: ["verified", "audit"],
    references: [MARKDOWN_REFERENCES.formatIntegration],
    relatedTopicIds: ["projects", "compatibility-terms", "troubleshooting"],
    sections: [
      {
        title: "Technical Model",
        paragraphs: [
          "Providence keeps imported files, decoded records, editor items, links, reverse links, and diagnostics separate.",
          "Unknown records stay readable. Editing is blocked until export support is ready."
        ]
      },
      {
        title: "Authored Source vs Runtime Cache",
        points: [
          "Authored scenario files can become export targets when Providence has enough writer support.",
          "Runtime caches are read-only and are not promoted to authored export targets.",
          "Byte ranges, status, and diagnostics should stay visible where they explain an editing boundary."
        ]
      }
    ]
  },
  {
    id: "linter-release",
    groupId: "authoring",
    label: "Linter & Release",
    title: "Linter and Release Safety",
    summary: "Use validation and export reports to catch missing resources, unsupported edits, malformed forks, and release blockers.",
    tags: ["linter", "export", "release", "validation", "blocker", "warning", "oracle"],
    badges: ["release", "compatibility"],
    references: [DIVINITY_CHAPTERS.release, MARKDOWN_REFERENCES.oracleHarness],
    relatedTopicIds: ["projects", "assets", "troubleshooting"],
    sections: [
      {
        title: "What the Linter Explains",
        points: [
          "Missing resources and unresolved script targets.",
          "Unsupported edits and read-only records.",
          "Malformed resource forks or missing fallbacks.",
          "Generated caches, unresolved links, and export blockers."
        ]
      },
      {
        title: "Release Flow",
        paragraphs: [
          "Run validation before export, read the export report after export, and treat warnings as compatibility notes rather than noise.",
          "The optional oracle harness can round-trip exported scenarios through Realmz Classic when you need higher confidence than the normal app checks provide."
        ],
        callout: {
          tone: "info",
          title: "Oracle is optional",
          body: "The oracle harness launches the desktop app and Realmz Classic. Keep it as a deeper troubleshooting and compatibility lane, not the ordinary authoring path."
        }
      }
    ]
  },
  {
    id: "divinity-parity",
    groupId: "reference",
    label: "Divinity Parity",
    title: "Divinity Chapter Crosswalk",
    summary: "Map Divinity Manual chapters to Providence domains without cloning Divinity screen-for-screen.",
    tags: ["Divinity", "parity", "chapter", "roadmap", "manual"],
    badges: ["reference", "crosswalk"],
    references: [MARKDOWN_REFERENCES.divinityParity, DIVINITY_CHAPTERS.gettingStarted],
    relatedTopicIds: ["combat-economy-rules", "scripts", "linter-release"],
    sections: [
      {
        title: "How To Use The Manual",
        paragraphs: [
          "The Divinity Manual remains the legacy capability and terminology reference. Providence uses it to make sure authors can still perform the same scenario work, but the UI does not need to mirror every Divinity screen.",
          "Each Providence handbook topic links to the relevant Divinity chapter anchors so authors can jump from a modern workflow to the original manual context."
        ]
      },
      {
        title: "Important Crosswalks",
        cards: [
          { title: "Maps", body: "Land Editor, Land Layout Editor, Map Editor, and Dungeon Editor map into the Maps domain.", facts: ["pages 2, 20, 21"] },
          { title: "Scripts", body: "Action Points, GOSUBs, script code chapters, macros, and quests map into Scripts.", facts: ["pages 4-8, 22"] },
          { title: "Assets", body: "Icons, Special Land Tiles, Pictures, Sounds, and Standard Land Tiles map into Assets and Maps.", facts: ["pages 25-28"] },
          { title: "Release", body: "Divinity's release checklist maps into Providence linter and export readiness.", facts: ["page 34"] }
        ]
      }
    ]
  },
  {
    id: "compatibility-terms",
    groupId: "reference",
    label: "Compatibility Terms",
    title: "Compatibility Terms",
    summary: "Learn the status language Providence uses for writable, preserved, read-only, ignored, and manually verified behavior.",
    tags: ["compatibility", "Realmz-writable", "preserved imported bytes", "read-only", "dispatcher", "no-op"],
    badges: ["glossary", "export policy"],
    references: [MARKDOWN_REFERENCES.scriptsV2, MARKDOWN_REFERENCES.formatIntegration],
    relatedTopicIds: ["scripts", "records-evidence", "linter-release"],
    sections: [
      {
        title: "Status Language",
        cards: [
          { title: "Realmz-writable", body: "Providence has a typed writer for the record family.", facts: ["editable"] },
          { title: "Preserved imported bytes", body: "Some bytes are intentionally retained from the original scenario.", facts: ["preserved"] },
          { title: "Read-only", body: "Providence can explain the data but should not edit it directly.", facts: ["blocked"] },
          { title: "Dispatcher no-op", body: "Realmz reads a nonzero CODE value but has no dispatcher case and ignores it.", facts: ["informational"] },
          { title: "Needs manual verification", body: "The editor can preserve or export it, but behavior is not fully decoded yet.", facts: ["caution"] }
        ]
      },
      {
        title: "Why The Language Matters",
        paragraphs: [
          "The same words appear in scripts, records, assets, linter output, and export reports. They are meant to explain risk clearly without forcing authors to read raw source notes every time.",
          "When a status is conservative, that is usually a safety boundary around Realmz compatibility rather than a missing UI flourish."
        ]
      }
    ]
  },
  {
    id: "troubleshooting",
    groupId: "reference",
    label: "Troubleshooting",
    title: "Troubleshooting and Deeper Checks",
    summary: "Know where to look when import, validation, export, resources, or optional Realmz Classic oracle checks fail.",
    tags: ["troubleshooting", "oracle", "validation", "export", "resource", "failure", "Classic"],
    badges: ["reference", "debug"],
    references: [MARKDOWN_REFERENCES.oracleHarness, MARKDOWN_REFERENCES.formatIntegration],
    relatedTopicIds: ["linter-release", "records-evidence", "projects"],
    sections: [
      {
        title: "Common Author Checks",
        points: [
          "If import fails, confirm the selected folder is a Realmz scenario source and not a generated runtime mirror.",
          "If validation fails, inspect the linter category and target instead of changing unrelated records.",
          "If export reports missing resources, check whether the script target expects a project resource or a shared Realmz fallback.",
          "If a script target is missing, create the target record through the picker when the record family is writable."
        ]
      },
      {
        title: "When To Use Oracle Notes",
        paragraphs: [
          "The oracle harness documentation is for deeper local compatibility checks. It is useful when a project exports cleanly but you want Realmz Classic to load, start, or exercise the scenario in an isolated profile.",
          "Most authors should start with Providence validation and export reports before reaching for deeper oracle checks."
        ],
        callout: {
          tone: "warning",
          title: "Oracle runs are side-effectful",
          body: "They launch desktop processes and write artifacts under tmp/oracle-runs. Use them deliberately and read the run summary before chasing individual files."
        }
      }
    ]
  }
];

export function documentationTopicById(topicId: string) {
  return DOCUMENTATION_TOPICS.find((topic) => topic.id === topicId) ?? DOCUMENTATION_TOPICS[0];
}

export function documentationSearchText(topic: DocumentationTopic) {
  return [
    topic.label,
    topic.title,
    topic.summary,
    topic.tags.join(" "),
    topic.badges.join(" "),
    topic.references.map((reference) => `${reference.label} ${reference.detail}`).join(" "),
    topic.sections
      .map((section) => [
        section.title,
        section.paragraphs?.join(" ") ?? "",
        section.points?.join(" ") ?? "",
        section.cards?.map((card) => `${card.title} ${card.body} ${card.facts?.join(" ") ?? ""}`).join(" ") ?? "",
        section.callout ? `${section.callout.title} ${section.callout.body}` : ""
      ].join(" "))
      .join(" ")
  ].join(" ").toLowerCase();
}

function divinityRef(page: number, title: string): DocumentationReference {
  return {
    kind: "divinity",
    label: title,
    detail: `Divinity Manual 7.0, chapter ${page}`,
    href: `${DIVINITY_GUIDE_BASE_URL}#page-${page}`
  };
}

function repoRef(label: string, detail: string, path: string): DocumentationReference {
  return {
    kind: "repo",
    label,
    detail,
    path
  };
}
