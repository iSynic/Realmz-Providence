import type {
  DocumentationCallout,
  DocumentationCard,
  DocumentationGroup,
  DocumentationReference,
  DocumentationSection,
  DocumentationTopic,
  DocumentationVisualSlot
} from "./documentationContent";
import { DIVINITY_CHAPTERS, MARKDOWN_REFERENCES } from "./documentationContent";

export type {
  DocumentationCallout,
  DocumentationCard,
  DocumentationGroup,
  DocumentationReference,
  DocumentationSection,
  DocumentationTopic,
  DocumentationVisualSlot
} from "./documentationContent";

export const DOCUMENTATION_GROUPS: DocumentationGroup[] = [
  {
    id: "chapters",
    label: "Manual Chapters",
    description: "Author-facing Providence chapters for building and releasing Realmz scenarios."
  },
  {
    id: "appendix",
    label: "Appendices",
    description: "Reference material for search, compatibility terms, Divinity crosswalks, libraries, and deeper evidence."
  }
];

export const DOCUMENTATION_TOPICS: DocumentationTopic[] = [
  {
    id: "getting-started",
    groupId: "chapters",
    label: "Getting Started",
    title: "Getting Started With Providence",
    summary: "Build a Realmz scenario through a repeatable authoring loop: set up the project, make the playable change, validate it, and export deliberately.",
    tags: ["start", "project", "manual", "workflow", "Divinity", "chapter", "authoring"],
    badges: ["chapter", "orientation"],
    references: [DIVINITY_CHAPTERS.gettingStarted, MARKDOWN_REFERENCES.divinityParity],
    relatedTopicIds: ["projects", "scenario", "maps", "scripts", "assets", "linter-release", "documents-help"],
    sections: [
      {
        title: "The Providence Authoring Loop",
        paragraphs: [
          "Providence is a Realmz scenario authoring tool, not a source-code browser with editor controls attached. The normal path is to open or create a Providence project, work in the chapter that owns the thing you want to change, validate the project, then export a Realmz-readable scenario package.",
          "Most tools have the same shape: choose the record or asset, edit the author-facing fields, inspect links and warnings only when something is unclear, then apply or save the project state."
        ],
        cards: [
          {
            title: "Set Up",
            body: "Create a new project or import an existing scenario into an empty Providence package before authoring content.",
            facts: ["New", "Open", "Import"]
          },
          {
            title: "Author",
            body: "Use Maps, Action Points, Text, Encounters, Combat, Economy, Rules, Assets, and Scenario Shell chapters for day-to-day work.",
            facts: ["editable"]
          },
          {
            title: "Validate and Export",
            body: "Use Linter and Export to catch missing targets, resource problems, and target-package differences before testing in Realmz.",
            facts: ["release path"]
          }
        ]
      },
      {
        title: "Pick The Right Chapter",
        points: [
          "Use Scenario Setup when the question is about opening, saving, importing, or packaging the project.",
          "Use Scenario Shell for startup location, party restrictions, contact info, music, security, and global scenario hooks.",
          "Use Land/Dungeon Maps and Player Maps for geography, map records, map notes, movement, starts, display rectangles, and map pictures.",
          "Use Action Points for scripts, macros, global hooks, target links, and visible effects when the player steps on or triggers something.",
          "Use Strings & Text for messages, option labels, scrolling text, and readable text resources.",
          "Use Assets when the question is about pictures, sounds, icons, custom tiles, raw resources, or moving library media into the scenario.",
          "Use Linter & Export when you are checking whether the project can ship."
        ]
      },
      {
        title: "When To Open References",
        paragraphs: [
          "The right rail and reference drawer are there when you need legacy wording or proof. They are not the main reading path. Start with the chapter workflow, then open the Divinity Manual or source notes when a field name, compatibility warning, or writer boundary needs backup.",
          "Divinity references explain the classic editor idea. Repo references explain why Providence marks something writable, preserved, read-only, or warning-worthy."
        ],
        callout: {
          tone: "info",
          title: "Author first, evidence second",
          body: "If a chapter sends you to evidence before explaining the author task, that chapter still needs rewriting."
        }
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not start from Technical Records unless you are investigating a specific warning or compatibility boundary.",
          "Do not treat Reference Assets or bundled libraries as scenario-owned data until you intentionally copy or import something into the project.",
          "Do not export as a substitute for saving the Providence project. Save is authoring state; export is Realmz output.",
          "Do not ignore warnings that point to missing visible results, missing resources, or unsupported target packaging."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Manual overview",
        caption: "Chapter navigation, main reading column, optional Classic Manual shortcuts, and collapsed source notes."
      }
    ]
  },
  {
    id: "projects",
    groupId: "chapters",
    label: "Scenario Setup",
    title: "Scenario Setup and Project Files",
    summary: "Create, open, import, save, and recover Providence projects before editing scenario content.",
    tags: ["project", "new", "open", "import", "save", "export", "browser", "desktop", "project zip", "source snapshot"],
    badges: ["chapter", "project"],
    references: [
      DIVINITY_CHAPTERS.gettingStarted,
      DIVINITY_CHAPTERS.startup,
      MARKDOWN_REFERENCES.formatIntegration,
      MARKDOWN_REFERENCES.byteRoundtripLedger,
      MARKDOWN_REFERENCES.releaseChecklist
    ],
    relatedTopicIds: ["getting-started", "scenario", "assets", "linter-release", "troubleshooting"],
    sections: [
      {
        title: "What A Providence Project Is",
        paragraphs: [
          "A Providence project is the editable authoring package. It contains the decoded scenario model, editor metadata, managed assets, saved drafts, and any raw-source snapshot captured during import.",
          "The original Realmz scenario folder is input material. Providence reads it into the project package; it does not keep editing the original folder in place."
        ],
        cards: [
          { title: "Providence Project", body: "The saved authoring state you keep returning to while building the scenario.", facts: ["editable"] },
          { title: "Source Snapshot", body: "Imported original files used for preservation, diagnostics, and target exports when a writer does not own every byte.", facts: ["evidence"] },
          { title: "Scenario Export", body: "The Realmz-readable output folder or ZIP written from current project state.", facts: ["output"] }
        ]
      },
      {
        title: "Setup Workflow",
        points: [
          "Use New Project when you are starting a scenario from scratch.",
          "Use Import only while the project is empty; this prevents raw scenario bytes from being merged into already-authored project data.",
          "Use Open when returning to a saved Providence package or browser project ZIP.",
          "Save before a risky editing pass, a visual smoke pass, or any export comparison.",
          "Validate before export so missing targets and resource problems are caught before you test the package in Realmz."
        ]
      },
      {
        title: "Browser And Desktop Differences",
        paragraphs: [
          "Desktop is the release-grade environment for filesystem-heavy workflows. Browser preview is useful for fast iteration and visual review, but it has browser file-access limits.",
          "Browser export can produce Providence project ZIPs and snapshot-backed scenario ZIPs when the needed raw-source material is present. If raw sources are missing, Export should say so instead of pretending it can build a complete classic package."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not import a raw scenario into a project that already contains author edits.",
          "Do not confuse Save with Export.",
          "Do not assume browser behavior is final desktop parity for resource forks, native folders, or release packaging.",
          "Do not edit the original imported folder and expect Providence to merge those changes later."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Project lifecycle",
        caption: "New/Open/Import feed the Providence package; Save persists it; Linter and Export create Realmz output."
      }
    ]
  },
  {
    id: "scenario",
    groupId: "chapters",
    label: "Scenario Shell",
    title: "Scenario Startup, Restrictions, and Release Identity",
    summary: "Author the data Realmz checks before play begins: startup location, party restrictions, contact information, music, security, and global hooks.",
    tags: ["scenario", "startup", "restrictions", "contact", "registration", "security", "music", "global hooks", "Data CI", "Data RI"],
    badges: ["chapter", "startup"],
    references: [
      DIVINITY_CHAPTERS.startup,
      MARKDOWN_REFERENCES.scenarioStartupEvidence,
      MARKDOWN_REFERENCES.scenarioRestrictionsEvidence,
      MARKDOWN_REFERENCES.scenarioRegistrationEvidence,
      MARKDOWN_REFERENCES.scenarioShellEvidence
    ],
    relatedTopicIds: ["projects", "maps", "scripts", "rules", "linter-release", "compatibility-terms"],
    sections: [
      {
        title: "What The Scenario Shell Owns",
        paragraphs: [
          "Scenario Shell is the front door of the scenario. Realmz uses this data before normal play: where the party starts, who is allowed to enter, what scenario identity is shown, and which global scripts run around major lifecycle events.",
          "Treat this chapter as the place to make the scenario loadable and recognizable before filling in rooms, encounters, and rewards."
        ],
        cards: [
          { title: "Startup", body: "Starting map, coordinates, facing context, and first-load requirements.", facts: ["load path"] },
          { title: "Restrictions", body: "Party size, race/caste bans, and other gates that decide whether a party can enter.", facts: ["entry gate"] },
          { title: "Identity", body: "Contact info, release metadata, music, registration/security data, and global scenario hooks.", facts: ["release"] }
        ]
      },
      {
        title: "Authoring Workflow",
        points: [
          "Set the startup map and coordinates early, then test from that position as the scenario grows.",
          "Decide party restrictions before balancing combat or reward pacing.",
          "Fill contact and release fields before packaging a public build.",
          "Use global hooks sparingly and link them to clear Action Points so they are easy to inspect later.",
          "Run Linter after changing startup, restrictions, security, or global hooks."
        ]
      },
      {
        title: "Practical Checks",
        points: [
          "The startup map must exist and point to a playable location.",
          "Restrictions should not block the test party unless that is the design.",
          "Registration/security changes are compatibility-sensitive and should be validated before release.",
          "Global hooks should have visible, testable effects or clear script comments."
        ],
        callout: {
          tone: "warning",
          title: "Startup failures are release blockers",
          body: "A scenario can have beautiful maps and still fail immediately if the shell points at missing maps, invalid coordinates, or impossible party restrictions."
        }
      }
    ],
    visualSlots: [
      {
        title: "Startup fields",
        caption: "Scenario shell fields beside the selected start map and validation state."
      }
    ]
  },
  {
    id: "maps",
    groupId: "chapters",
    label: "Land/Dungeon Maps",
    title: "Land, Dungeon, and Playable Space",
    summary: "Build the spaces players walk through: outdoor lands, dungeons, tile painting, edge travel, random rectangles, and Action Point placement.",
    tags: ["maps", "land", "dungeon", "tiles", "painting", "layout", "edge travel", "random rectangles", "Action Points", "special land"],
    badges: ["chapter", "visual"],
    references: [
      DIVINITY_CHAPTERS.landEditor,
      DIVINITY_CHAPTERS.dungeon,
      DIVINITY_CHAPTERS.map,
      DIVINITY_CHAPTERS.specialLand,
      MARKDOWN_REFERENCES.resourceIconEvidence
    ],
    relatedTopicIds: ["player-maps", "scripts", "assets", "encounters-targets", "linter-release"],
    sections: [
      {
        title: "Think In Three Layers",
        paragraphs: [
          "Map authoring works best when you separate the visible ground, the movement rules, and the event layer. The visible tile tells the player what they see. The tile metadata decides what movement and travel mean. Action Points and random rectangles decide what happens at a place.",
          "Providence keeps those layers together on the map canvas, but you should still author them deliberately."
        ],
        cards: [
          { title: "Terrain", body: "Paint the outdoor or dungeon space the player will read visually.", facts: ["tiles"] },
          { title: "Movement", body: "Check passability, edge travel, doors, walls, darkness, and special tile behavior.", facts: ["rules"] },
          { title: "Events", body: "Place Action Points, random rectangles, encounters, and other triggers only where players can understand them.", facts: ["scripts"] }
        ]
      },
      {
        title: "Map Building Workflow",
        points: [
          "Block in the playable route first; decoration can wait.",
          "Use sampling and stamps to keep repeated structures consistent.",
          "Place transitions after both sides of the transition exist.",
          "Place Action Points after the geography makes the trigger location clear.",
          "Use overlays while authoring, but turn them off periodically to inspect what players will actually see."
        ]
      },
      {
        title: "Random Rectangles and Encounters",
        paragraphs: [
          "Random rectangles are map-authored zones that connect geography to encounter behavior. Draw them around meaningful spaces, not just available empty map area.",
          "When a random rectangle points to an encounter, make sure the encounter text, combat target, reward, and failure path make sense for that location."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not create one-way edge travel accidentally; inspect both sides of a layout connection.",
          "Do not hide essential progress behind invisible or unexplained triggers.",
          "Do not assume a special/icon tile changes movement rules; verify the underlying tile and metadata.",
          "Do not delete or reorder maps casually once scripts, records, and starts point at them."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Map layer stack",
        caption: "Canvas, movement metadata, Action Point overlays, random rectangles, and player-facing map records."
      }
    ]
  },
  {
    id: "player-maps",
    groupId: "chapters",
    label: "Player Maps",
    title: "Player Maps, Notes, Starts, and Pictures",
    summary: "Author the map records players read: map names, notes, starting positions, display rectangles, markers, and picture links.",
    tags: ["player maps", "map records", "notes", "map names", "starts", "pictures", "PICT", "markers"],
    badges: ["chapter", "player-facing"],
    references: [DIVINITY_CHAPTERS.map, MARKDOWN_REFERENCES.textEvidence, MARKDOWN_REFERENCES.resourceAuthoringEvidence],
    relatedTopicIds: ["maps", "text", "assets", "scenario", "linter-release"],
    sections: [
      {
        title: "What Player Maps Are For",
        paragraphs: [
          "Player Maps are the records that turn world geometry into information a player can use. They can name a place, define a visible map rectangle, attach a picture, place starts or markers, and connect notes to the scenario's text.",
          "Use them when you want the party to understand a location, remember a clue, or arrive at a consistent map-facing position."
        ],
        cards: [
          { title: "Map Identity", body: "Name, label, and describe a map-facing place.", facts: ["names"] },
          { title: "Display Setup", body: "Choose the map region, markers, starts, and picture links shown to players.", facts: ["view"] },
          { title: "Notes", body: "Connect readable text to places, clues, and player-facing guidance.", facts: ["text"] }
        ]
      },
      {
        title: "Authoring Workflow",
        points: [
          "Create or select the map record for the place the player should understand.",
          "Set the name and display rectangle before writing long notes.",
          "Attach a PICT only when the image improves player understanding or scenario presentation.",
          "Use Strings & Text for substantial prose, then link the relevant string from the map record.",
          "Validate missing strings, missing pictures, and map references before release."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not use a player map record as a substitute for playable terrain.",
          "Do not leave map names generic if they appear in navigation or notes.",
          "Do not reference a picture ID unless the asset is available to the target runtime.",
          "Do not let notes spoil branches or hidden information unless that is intentional."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Player map record",
        caption: "Map record fields, text links, picture preview, markers, and validation badges."
      }
    ]
  },
  {
    id: "scripts",
    groupId: "chapters",
    label: "Action Points",
    title: "Action Points, Scripts, and Macros",
    summary: "Author player-triggered events, reusable macros, global hooks, and script targets with visible results and readable flow.",
    tags: ["Action Point", "script", "macro", "GOSUB", "CODE", "ID", "EDCD", "targets", "quest flags"],
    badges: ["chapter", "scripts"],
    references: [
      DIVINITY_CHAPTERS.actionPoints,
      DIVINITY_CHAPTERS.scriptingOne,
      DIVINITY_CHAPTERS.scriptingTwo,
      DIVINITY_CHAPTERS.scriptingThree,
      DIVINITY_CHAPTERS.scriptingFour,
      DIVINITY_CHAPTERS.macrosQuests,
      MARKDOWN_REFERENCES.scriptsV2,
      MARKDOWN_REFERENCES.actionPointEvidence,
      MARKDOWN_REFERENCES.opcodeEdcdEvidence
    ],
    relatedTopicIds: ["maps", "text", "encounters-targets", "combat", "economy", "scenario", "linter-release"],
    sections: [
      {
        title: "Think In Events",
        paragraphs: [
          "An Action Point is a player-facing event. It might show a message, play a sound, start combat, move the party, set a flag, give treasure, call another script, or branch based on party state.",
          "Good scripts read like cause and effect. The player does something, Realmz checks the condition, then something visible or meaningful happens."
        ],
        cards: [
          { title: "Map Action Points", body: "Triggers placed on land or dungeon maps.", facts: ["location"] },
          { title: "Extra Action Points", body: "Reusable scripts called by maps, encounters, battles, monsters, globals, and other scripts.", facts: ["reuse"] },
          { title: "Global Hooks", body: "Scenario lifecycle scripts such as startup, death, quit, shop, or temple behavior.", facts: ["scenario"] }
        ]
      },
      {
        title: "Script Authoring Workflow",
        points: [
          "Name the purpose of the script before filling in steps.",
          "Add the player-visible message, sound, movement, combat, reward, or state change first.",
          "Add conditions and branches only after the main result is clear.",
          "Use target pickers to link strings, maps, encounters, battles, treasure, shops, and assets instead of typing numbers from memory.",
          "Use Flow Preview to check branch order, GOSUB calls, and missing visible results."
        ]
      },
      {
        title: "Visible Results",
        paragraphs: [
          "A script that succeeds silently is usually a bad authoring experience. If the player can attempt an action, the script should normally show a string, play a sound, change the map, start combat, move the party, or otherwise make the result legible.",
          "Silent state changes are fine for setup and bookkeeping, but they should not be the only feedback for a player-facing trap, lock, clue, reward, or branch."
        ],
        callout: {
          tone: "warning",
          title: "Make success and failure visible",
          body: "Linter warnings about no visible result usually mean the script works technically but will feel broken to players."
        }
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not leave orphan Extra Action Points without understanding whether a hidden global, encounter, or macro still reaches them.",
          "Do not hand-enter target IDs when the picker can create or link the target.",
          "Do not treat CODE/ID/EDCD as the first reading path; use them when the guided label is missing or a warning needs deeper proof.",
          "Do not forget failure branches for traps, locks, typed answers, and item/magic checks."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Script flow",
        caption: "Step editor, target links, visible-result warnings, and Flow Preview."
      }
    ]
  },
  {
    id: "text",
    groupId: "chapters",
    label: "Strings & Text",
    title: "Strings, Scrolling Text, and Message Records",
    summary: "Write and manage the text players see: message strings, option labels, scrolling text, and readable imported resources.",
    tags: ["strings", "text", "messages", "Data SD2", "Data OD", "TEXT", "STR#", "styl", "scrolling text", "spell check"],
    badges: ["chapter", "writing"],
    references: [DIVINITY_CHAPTERS.text, MARKDOWN_REFERENCES.textEvidence, MARKDOWN_REFERENCES.resourceAuthoringEvidence],
    relatedTopicIds: ["scripts", "encounters-targets", "player-maps", "assets", "combat", "economy"],
    sections: [
      {
        title: "What Text Owns",
        paragraphs: [
          "Strings & Text is where player-facing prose belongs. Scripts, encounters, battles, map records, rewards, and rules can all point into the shared message pool, so this chapter is often the safest place to improve scenario clarity.",
          "Assets can import and preserve readable TEXT, STR#, styl, and raw resources, but ordinary text authoring should stay here."
        ],
        cards: [
          { title: "Scenario Strings", body: "Reusable messages referenced by scripts, encounters, battles, maps, and other records.", facts: ["messages"] },
          { title: "Option Labels", body: "Short labels used for choices and interface-facing prompts.", facts: ["choices"] },
          { title: "Readable Resources", body: "TEXT, STR#, styl, and raw text-like resources previewed from imported or scenario-owned assets.", facts: ["resources"] }
        ]
      },
      {
        title: "Writing Workflow",
        points: [
          "Write the message in the context of the tool that will show it, then edit the final wording here.",
          "Use clear success, failure, and refusal text for every player-facing branch.",
          "Keep option labels short enough to scan quickly.",
          "Use search and usage links before changing an old string that may be reused in multiple places.",
          "Run Linter after text changes that affect script warnings or missing-result checks."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not duplicate text in Assets just because the source resource is readable.",
          "Do not rewrite a reused string until you have checked where it appears.",
          "Do not leave placeholder labels on choices that players can click.",
          "Do not rely on a sound or animation alone when a text result is needed for clarity."
        ]
      }
    ],
    visualSlots: [
      {
        title: "String usage",
        caption: "Message editor with usage links back to scripts, encounters, combat, player maps, and assets."
      }
    ]
  },
  {
    id: "encounters-targets",
    groupId: "chapters",
    label: "Encounters",
    title: "Simple, Complex, Rogue, and Timed Encounters",
    summary: "Author conversations and event gates that sit between map triggers, scripts, text, combat, rewards, thief actions, and timing.",
    tags: ["encounters", "simple", "complex", "rogue", "timed", "trap", "lock", "choices", "branches"],
    badges: ["chapter", "branching"],
    references: [DIVINITY_CHAPTERS.simpleEncounter, DIVINITY_CHAPTERS.complexEncounter, MARKDOWN_REFERENCES.encounterEvidence, MARKDOWN_REFERENCES.thiefTimedEvidence],
    relatedTopicIds: ["scripts", "text", "combat", "economy", "rules", "linter-release"],
    sections: [
      {
        title: "Choose The Encounter Family",
        paragraphs: [
          "Encounters are structured interaction records. Use them when a map trigger needs prompts, choices, thief checks, timing, or reusable branches rather than a straight Action Point sequence.",
          "Each family solves a different authoring problem. Pick the smallest encounter type that expresses the player interaction clearly."
        ],
        cards: [
          { title: "Simple", body: "A prompt with straightforward action choices and results.", facts: ["choices"] },
          { title: "Complex", body: "Branching checks for spells, items, thief skills, typed words, and grouped actions.", facts: ["branches"] },
          { title: "Rogue", body: "Trap and lock interactions with chances, sounds, spells, damage, and visible outcomes.", facts: ["thief"] },
          { title: "Timed", body: "Scheduled or position-gated events that can repeat or depend on timing.", facts: ["schedule"] }
        ]
      },
      {
        title: "Encounter Workflow",
        points: [
          "Write the prompt first so the player understands the situation.",
          "Choose the available actions and make each action lead to an understandable result.",
          "Link result rows to strings, scripts, combat, rewards, or other records using pickers.",
          "Check both success and failure paths for thief, item, magic, and typed-word branches.",
          "Use Linter warnings to find branches that can be attempted but produce no visible result."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not leave duplicate action labels that lead to different outcomes without explaining the difference.",
          "Do not make a trap or lock attempt silent on success or failure.",
          "Do not use runtime cache records as the authoring source when the original encounter source record owns the behavior.",
          "Do not bury required progress behind a low-probability thief check unless alternate progress exists."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Encounter branch editor",
        caption: "Prompt, action rows, branch tests, target links, and visible-result warnings."
      }
    ]
  },
  {
    id: "combat",
    groupId: "chapters",
    label: "Combat",
    title: "Battles, Monsters, and Combat Libraries",
    summary: "Build combat encounters by authoring battle grids, scenario monster records, reusable monster-library entries, and icon references.",
    tags: ["combat", "battle", "monster", "monster library", "battle macro", "icons", "Data BD", "Data MD"],
    badges: ["chapter", "combat"],
    references: [DIVINITY_CHAPTERS.battle, DIVINITY_CHAPTERS.monster, DIVINITY_CHAPTERS.icons, MARKDOWN_REFERENCES.battleEvidence, MARKDOWN_REFERENCES.monsterEvidence],
    relatedTopicIds: ["scripts", "encounters-targets", "assets", "economy", "linter-release"],
    sections: [
      {
        title: "Battle Records And Monster Records",
        paragraphs: [
          "Combat authoring has two halves. Battle records decide where a fight happens, which monsters appear, what text plays before or after, and what macro can run. Monster records decide what those monsters are.",
          "Keep those halves separate while authoring. If a battle feels wrong, check whether the problem is placement, monster selection, monster stats, icon resolution, or script linkage."
        ],
        cards: [
          { title: "Battle Editor", body: "Places monster IDs on a grid, sets distance, links before/after text, and points to battle macros.", facts: ["encounter setup"] },
          { title: "Monster Editor", body: "Authors scenario monsters with stats, attacks, behavior, loot, icons, and death hooks.", facts: ["creature"] },
          { title: "Monster Library", body: "Stores reusable Providence monster templates that can be copied into scenarios.", facts: ["reuse"] }
        ]
      },
      {
        title: "Combat Workflow",
        points: [
          "Create or choose the monster records before polishing the battle grid.",
          "Use icons that resolve from Realmz stock assets, scenario assets, or intentional copied library assets.",
          "Place monsters so their footprints and starting positions are legible.",
          "Write before and after text in Strings & Text, then link it from the battle.",
          "Use battle macros only when round-by-round scripted behavior is needed."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not confuse a monster-library template with a scenario monster that exports with the project.",
          "Do not offer a scenario copy for stock Realmz assets that can already be referenced by stock ID.",
          "Do not place more monsters than the runtime can load.",
          "Do not leave missing icon resources unresolved; combat previews and runtime drawing both depend on them."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Battle and monster link",
        caption: "Battle grid, selected monster, icon preview, text links, and macro target."
      }
    ]
  },
  {
    id: "economy",
    groupId: "chapters",
    label: "Economy",
    title: "Treasure, Items, Shops, and Item Libraries",
    summary: "Author rewards and stores with clear item ownership: built-in items, scenario custom items, treasure records, shop stock, and reusable libraries.",
    tags: ["economy", "treasure", "items", "shops", "custom items", "Bag of Holding", "Vault of Arcana", "gold", "gems", "jewelry"],
    badges: ["chapter", "items"],
    references: [DIVINITY_CHAPTERS.treasure, DIVINITY_CHAPTERS.item, DIVINITY_CHAPTERS.shop, MARKDOWN_REFERENCES.economyEvidence],
    relatedTopicIds: ["scripts", "encounters-targets", "combat", "assets", "rules", "linter-release"],
    sections: [
      {
        title: "What Economy Owns",
        paragraphs: [
          "Economy tools decide what players can gain, buy, carry, and use. Treasure records describe fixed rewards. Shop records describe source stock and pricing. Item records and item libraries describe what those IDs mean.",
          "Built-in items are useful references. Scenario custom items are project data and need scenario-safe IDs, names, icons, descriptions, and behavior."
        ],
        cards: [
          { title: "Treasure", body: "Victory points, money, gems, jewelry, and item-slot rewards.", facts: ["rewards"] },
          { title: "Items", body: "Built-in item references plus scenario custom items when the scenario owns the record.", facts: ["catalog"] },
          { title: "Shops", body: "Author-owned shop stock, quantities, inflation, and restrictions.", facts: ["stores"] }
        ]
      },
      {
        title: "Economy Workflow",
        points: [
          "Pick built-in items by meaning, not just by nearby ID.",
          "Create scenario custom items only when stock Realmz items cannot express the design.",
          "Use Treasure for rewards that happen once or after a clear script result.",
          "Use Shops for repeatable purchasing and restocking expectations.",
          "Check icon and description links for every custom item."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not treat a library item as scenario-owned just because it appears in a picker.",
          "Do not rebalance shop stock by editing saved-game/runtime stock first.",
          "Do not create custom items without checking ID range and icon availability.",
          "Do not reward hidden quest-critical items without a visible message or inventory clue."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Reward and shop flow",
        caption: "Treasure records, shop stock, item picker, custom item details, and validation warnings."
      }
    ]
  },
  {
    id: "rules",
    groupId: "chapters",
    label: "Rules",
    title: "Spells, Races, Castes, and Scenario Overrides",
    summary: "Browse shared Realmz rules and author scenario-local overrides deliberately, because rule changes affect the whole scenario.",
    tags: ["rules", "spells", "races", "castes", "override", "custom spells", "Data Spell", "Data Race", "Data Caste"],
    badges: ["chapter", "rules"],
    references: [DIVINITY_CHAPTERS.spell, DIVINITY_CHAPTERS.race, DIVINITY_CHAPTERS.caste, MARKDOWN_REFERENCES.rulesEvidence],
    relatedTopicIds: ["scenario", "combat", "economy", "assets", "linter-release", "compatibility-terms"],
    sections: [
      {
        title: "Built-In Rules Versus Scenario Overrides",
        paragraphs: [
          "Realmz starts from built-in spell, race, and caste data. A scenario can override parts of that ruleset when it supplies scenario-local rule records.",
          "Providence keeps this split visible so authors can browse stock behavior without accidentally turning a reference record into project-owned data."
        ],
        cards: [
          { title: "Spells", body: "Custom spell records, class, target, range, damage, duration, resistance, icon, sound, and text.", facts: ["magic"] },
          { title: "Races", body: "Race stats, permissions, aging, descriptors, usability, and restrictions.", facts: ["party"] },
          { title: "Castes", body: "Caste progression, spell access, starting items, stats, conditions, and default icon.", facts: ["class"] }
        ]
      },
      {
        title: "Rules Workflow",
        points: [
          "Browse stock Realmz behavior before deciding an override is needed.",
          "Create overrides only for rules the scenario intentionally changes.",
          "Check downstream impact on party restrictions, monsters, items, shops, and scripts.",
          "Use clear names and text for custom spells so players can understand them.",
          "Validate resource links for spell and caste icons or sounds."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not change a race or caste without considering existing party builds.",
          "Do not create a spell that references missing text, icon, sound, or target behavior.",
          "Do not assume built-in rule browsing means those records export with the scenario.",
          "Do not hide balance-critical changes in preserved bytes or technical notes."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Override comparison",
        caption: "Shared rule reference beside scenario-owned override fields and validation state."
      }
    ]
  },
  {
    id: "assets",
    groupId: "chapters",
    label: "Assets",
    title: "Assets, Custom Library, and Resource IDs",
    summary: "Import, preview, preserve, replace, and move media between Scenario Assets, the Providence Custom Library, and read-only Reference Assets.",
    tags: ["assets", "PICT", "snd", "cicn", "TEXT", "STR#", "styl", "raw", "custom library", "reference assets", "resource IDs"],
    badges: ["chapter", "resources"],
    references: [
      DIVINITY_CHAPTERS.icons,
      DIVINITY_CHAPTERS.specialLand,
      DIVINITY_CHAPTERS.picturesSounds,
      MARKDOWN_REFERENCES.resourceAuthoringEvidence,
      MARKDOWN_REFERENCES.resourceTaxonomyEvidence,
      MARKDOWN_REFERENCES.resourceIconEvidence,
      MARKDOWN_REFERENCES.scenarioMusicEvidence
    ],
    relatedTopicIds: ["maps", "player-maps", "scripts", "text", "combat", "linter-release", "compatibility-terms"],
    sections: [
      {
        title: "Asset Lanes",
        paragraphs: [
          "Assets is the resource authoring surface. It should answer what the asset is, whether Realmz already owns it, whether it belongs to this scenario, whether it belongs to Providence's reusable custom library, and what resource ID it will use if exported.",
          "The lane matters because not every previewable asset should be copied into the scenario. Stock Realmz resources can be referenced by stock ID. Non-stock library material must become a scenario asset before a scenario can depend on it at runtime."
        ],
        cards: [
          { title: "Scenario Assets", body: "Project-owned resources that ship in the scenario package.", facts: ["exports"] },
          { title: "Custom Library", body: "A living Providence library of reusable non-stock assets that can be copied into any scenario when needed.", facts: ["reusable"] },
          { title: "Reference Assets", body: "Realmz and useful Divinity/reference material for previewing, comparing, and resolving stock IDs.", facts: ["read-only"] },
          { title: "Technical Inventory", body: "Lower-priority resource fork diagnostics for unsupported, raw, or preservation-focused entries.", facts: ["advanced"] }
        ]
      },
      {
        title: "Import And Copy Workflow",
        points: [
          "Import pictures, icons, special land tiles, sounds, text resources, or raw payloads into the lane that matches how the asset should be used.",
          "Copy a Custom Library or Reference Asset to Scenario Assets only when the scenario needs its own bundled copy.",
          "Do not offer copy-to-scenario for assets Realmz already owns by stock ID; scripts and records can reference those stock IDs directly.",
          "After copying to Scenario Assets, inspect the preview, resource type, assigned ID, usage links, and export scope.",
          "Move Scenario Assets back to the Custom Library when the asset is reusable and no longer meant to ship only with this scenario."
        ],
        callout: {
          tone: "info",
          title: "Custom Library is global Providence material",
          body: "The Custom Library is not just a project drawer. It should grow into a reusable Providence asset collection that can feed any scenario."
        }
      },
      {
        title: "Resource ID Discipline",
        paragraphs: [
          "Scenario-owned resources need IDs that Realmz treats as scenario-safe for their type. Pictures, sounds, custom icons, special land tiles, text resources, and raw payloads have different constraints and different consumers.",
          "When Providence allocates an ID, it should choose a valid scenario range, avoid conflicts with existing scenario resources, and preserve imported IDs when that is safer than renumbering."
        ],
        points: [
          "Pictures used by scenarios should stay in scenario PICT ranges and keep title-picture rules in mind.",
          "Custom sounds should stay in scenario sound ranges and remain playable in the target package.",
          "Icon and special tile resources must match the map, monster, item, or tile consumer that will read them.",
          "TEXT, STR#, styl, and raw resources should be preserved and previewed, but long-form text authoring still belongs in Strings & Text."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not copy stock Realmz assets into the scenario just because they are visible in Reference Assets.",
          "Do not assume a copied asset is correct until its preview and ID show correctly in Scenario Assets.",
          "Do not place Custom Library assets in exports until they are intentionally moved or copied to Scenario Assets.",
          "Do not edit narrative text in Assets when the Strings & Text chapter owns the authoring workflow."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Asset lanes",
        caption: "Scenario Assets, Custom Library, Reference Assets, preview inspector, and copy/move actions."
      }
    ]
  },
  {
    id: "linter-release",
    groupId: "chapters",
    label: "Linter & Export",
    title: "Linter, Export, and Release Safety",
    summary: "Use validation and export reports to fix release blockers, review warnings, choose target packages, and avoid source/runtime confusion.",
    tags: ["linter", "export", "release", "warnings", "blockers", "Mac", "Windows", "project zip", "source snapshot", "oracle"],
    badges: ["chapter", "release"],
    references: [
      DIVINITY_CHAPTERS.release,
      MARKDOWN_REFERENCES.releaseChecklist,
      MARKDOWN_REFERENCES.runtimeCacheEvidence,
      MARKDOWN_REFERENCES.byteRoundtripLedger,
      MARKDOWN_REFERENCES.oracleHarness
    ],
    relatedTopicIds: ["projects", "scenario", "assets", "scripts", "troubleshooting", "compatibility-terms"],
    sections: [
      {
        title: "The Release Loop",
        paragraphs: [
          "Linter and Export turn authoring work into release confidence. Linter tells you what is missing, risky, unsupported, or inconsistent. Export writes the selected package and reports what it wrote, preserved, skipped, or blocked.",
          "Use them together. A green-looking export is not enough if warnings explain missing art, missing visible results, unsupported target data, or source files that only passed through unchanged."
        ],
        cards: [
          { title: "Fix Blockers", body: "Resolve missing targets, invalid records, malformed resources, and unsafe writer boundaries.", facts: ["must fix"] },
          { title: "Review Warnings", body: "Check compatibility risks, missing visible results, preserved source files, and target-specific notes.", facts: ["review"] },
          { title: "Export Target", body: "Choose Providence project ZIP, Mac scenario ZIP, Windows scenario ZIP, or desktop folder output intentionally.", facts: ["package"] }
        ]
      },
      {
        title: "Validation Workflow",
        points: [
          "Run validation after major map, script, asset, encounter, combat, economy, rules, or shell changes.",
          "Open warnings through their owning tool; do not edit records from the diagnostic sentence alone.",
          "Fix missing visible results by adding strings, sounds, result code, movement, combat, reward, or another player-visible outcome.",
          "Review preserved-source notes before classic scenario ZIP export.",
          "Use Export reports as the record of what the chosen target actually received."
        ]
      },
      {
        title: "Target Package Expectations",
        paragraphs: [
          "A Providence project ZIP is an authoring backup. A Mac or Windows scenario package is runtime output. They do different jobs and should have different diagnostics.",
          "If a classic target needs raw imported sources and the browser does not have them, Export should warn or block instead of silently producing an incomplete package."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not treat info notes as blockers, but do read them before release.",
          "Do not fix runtime-cache warnings by editing cache files first; fix the author-owned source record.",
          "Do not release from browser visual smoke alone when desktop file/resource behavior changed.",
          "Do not assume a no-edit roundtrip guarantee still holds after changing writer-owned records."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Export readiness",
        caption: "Artifact choice, source/package readiness, diagnostics, benchmark, and export report."
      }
    ]
  },
  {
    id: "search-navigation",
    groupId: "appendix",
    label: "Search Appendix",
    title: "Search and Navigation Appendix",
    summary: "Find records, resources, chapters, library entries, and diagnostics quickly without changing the project.",
    tags: ["search", "navigation", "Ctrl+K", "shortcut", "diagnostics", "record ID", "resource ID"],
    badges: ["appendix", "navigation"],
    references: [DIVINITY_CHAPTERS.gettingStarted, MARKDOWN_REFERENCES.coreRecordEvidence, MARKDOWN_REFERENCES.resourceTaxonomyEvidence],
    relatedTopicIds: ["getting-started", "documents-help", "records-evidence", "assets", "linter-release"],
    sections: [
      {
        title: "What Search Is For",
        paragraphs: [
          "Global Search is a jump tool. It can find editable scenario records, resource IDs, library references, manual chapters, and diagnostics, then open the owning tool.",
          "Use it when you know a name, ID, warning phrase, or concept but not which tool owns it."
        ]
      },
      {
        title: "Useful Searches",
        points: [
          "Search `string 349`, `message 349`, `ap 4`, `macro 143`, `pict 304`, `sound 208`, or `cicn -74` when a warning gives you an ID.",
          "Search `missing`, `visible result`, `runtime cache`, `special land`, `registration`, or `release` when diagnosing a warning.",
          "Enable Docs when you need a concept explained, and enable Diagnostics when you need the active project warning."
        ]
      }
    ]
  },
  {
    id: "documents-help",
    groupId: "appendix",
    label: "Help Appendix",
    title: "Documents, Help, and References",
    summary: "Use the manual, hover help, Classic Manual links, related chapters, search terms, and source notes without turning evidence into the main workflow.",
    tags: ["documents", "manual", "help", "Divinity Manual", "source references", "related chapters"],
    badges: ["appendix", "help"],
    references: [DIVINITY_CHAPTERS.gettingStarted, MARKDOWN_REFERENCES.divinityParity, MARKDOWN_REFERENCES.formatIntegration],
    relatedTopicIds: ["getting-started", "search-navigation", "divinity-parity", "compatibility-terms", "troubleshooting"],
    sections: [
      {
        title: "How To Read This Manual",
        paragraphs: [
          "The chapter body is the normal reading path. It explains what an author is trying to build, the workflow to build it, and common mistakes to avoid.",
          "The right rail gives quick Classic Manual links, status badges, and indexed search terms. The source drawer at the bottom is for verification, not for first-pass reading."
        ]
      },
      {
        title: "Help On Versus Manual",
        cards: [
          { title: "Help On", body: "Short control-level guidance while you work in a tool.", facts: ["inline"] },
          { title: "Manual", body: "Longer workflow guidance and pitfalls for a whole authoring area.", facts: ["chapter"] },
          { title: "Source Notes", body: "Evidence for compatibility, preservation, writer support, and legacy behavior.", facts: ["secondary"] }
        ]
      }
    ]
  },
  {
    id: "compatibility-terms",
    groupId: "appendix",
    label: "Compatibility Appendix",
    title: "Compatibility Terms",
    summary: "Understand the status language Providence uses for writable, preserved, read-only, ignored, and manually verified behavior.",
    tags: ["compatibility", "writable", "preserved", "read-only", "dispatcher", "manual verification", "export policy"],
    badges: ["appendix", "glossary"],
    references: [MARKDOWN_REFERENCES.scriptsV2, MARKDOWN_REFERENCES.formatIntegration, MARKDOWN_REFERENCES.byteRoundtripLedger],
    relatedTopicIds: ["scripts", "records-evidence", "linter-release", "troubleshooting"],
    sections: [
      {
        title: "Terms Authors Will See",
        cards: [
          { title: "Writable", body: "Providence has a typed editor and writer for this data.", facts: ["safe to edit"] },
          { title: "Preserved", body: "Imported bytes or resources are kept intact because Providence should not rewrite them yet.", facts: ["pass-through"] },
          { title: "Read-Only", body: "Providence can explain or preview the data, but it is not an authoring target yet.", facts: ["reference"] },
          { title: "Ignored / No-Op", body: "Realmz can read a value but does not appear to act on it in the known runtime path.", facts: ["diagnostic"] },
          { title: "Needs Verification", body: "The editor can preserve the data, but behavior needs more proof before strong authoring claims.", facts: ["caution"] }
        ]
      },
      {
        title: "How To Use Status Language",
        points: [
          "Treat writable fields as normal authoring surfaces.",
          "Treat preserved data as package context unless a tool explicitly promotes it to author-owned state.",
          "Treat read-only material as reference until a follow-up issue adds writer support.",
          "Open source notes when a compatibility term changes whether you can safely edit or export something."
        ]
      }
    ]
  },
  {
    id: "divinity-parity",
    groupId: "appendix",
    label: "Divinity Appendix",
    title: "Divinity Chapter Crosswalk",
    summary: "Map the classic Divinity Manual to Providence chapters without making Divinity's UI the primary Providence workflow.",
    tags: ["Divinity", "manual", "crosswalk", "parity", "legacy"],
    badges: ["appendix", "crosswalk"],
    references: [DIVINITY_CHAPTERS.gettingStarted, MARKDOWN_REFERENCES.divinityParity],
    relatedTopicIds: ["getting-started", "documents-help", "maps", "scripts", "assets", "linter-release"],
    sections: [
      {
        title: "How To Use The Classic Manual",
        paragraphs: [
          "The Divinity Manual is still valuable for original terminology and capability coverage. Providence should cover the same scenario-authoring power through modern chapters, not by forcing authors to think in old window names first.",
          "Use the Classic Manual links when a chapter mentions a legacy concept, when you need the original wording, or when checking whether Providence still exposes an equivalent authoring path."
        ]
      },
      {
        title: "Major Crosswalks",
        cards: [
          { title: "Maps", body: "Land Editor, Land Layout, Map Editor, Dungeon Editor, special land, and standard tiles.", facts: ["maps"] },
          { title: "Scripts", body: "Action Points, GOSUBs, scripting codes, macros, and quests.", facts: ["scripts"] },
          { title: "Scenario", body: "Startup information, restrictions, registration, security, and release metadata.", facts: ["shell"] },
          { title: "Assets", body: "Icons, special land tiles, pictures, sounds, text resources, and resource IDs.", facts: ["resources"] },
          { title: "Release", body: "Release checklist concepts mapped to Linter and Export.", facts: ["shipping"] }
        ]
      }
    ]
  },
  {
    id: "library",
    groupId: "appendix",
    label: "Libraries Appendix",
    title: "Reference Libraries and Shared Data",
    summary: "Use bundled Realmz, Divinity, and Providence library material without confusing it with scenario-owned records or assets.",
    tags: ["library", "Realmz", "Divinity", "Custom Library", "reference assets", "Monster Library", "items", "rules"],
    badges: ["appendix", "reference"],
    references: [DIVINITY_CHAPTERS.gettingStarted, DIVINITY_CHAPTERS.icons, MARKDOWN_REFERENCES.resourceTaxonomyEvidence, MARKDOWN_REFERENCES.coreRecordEvidence],
    relatedTopicIds: ["assets", "combat", "economy", "rules", "records-evidence"],
    sections: [
      {
        title: "Library Boundaries",
        paragraphs: [
          "Libraries help authors browse, preview, copy, and compare reusable material. They do not automatically make that material part of the scenario.",
          "This distinction matters most for assets, monsters, items, spells, races, and castes. Stock Realmz material can often be referenced by ID. Non-stock custom material must become scenario-owned before the scenario can depend on it at runtime."
        ]
      },
      {
        title: "Library Types",
        cards: [
          { title: "Realmz Reference", body: "Stock data and resources the runtime already knows how to resolve.", facts: ["stock"] },
          { title: "Providence Custom Library", body: "Reusable Providence-authored material that can be copied into scenarios.", facts: ["custom"] },
          { title: "Divinity Reference", body: "Useful legacy material retained for comparison, previews, or manual context.", facts: ["reference"] }
        ]
      }
    ]
  },
  {
    id: "records-evidence",
    groupId: "appendix",
    label: "Technical Appendix",
    title: "Records and Technical Details",
    summary: "Use decoded records, byte ranges, semantic links, and writer evidence when a chapter needs deeper investigation.",
    tags: ["records", "technical", "source", "byte ownership", "writer gates", "runtime cache", "evidence"],
    badges: ["appendix", "technical"],
    references: [
      MARKDOWN_REFERENCES.formatIntegration,
      MARKDOWN_REFERENCES.coreRecordEvidence,
      MARKDOWN_REFERENCES.byteOwnership,
      MARKDOWN_REFERENCES.completenessTruth,
      MARKDOWN_REFERENCES.fixedRecordWriterGates,
      MARKDOWN_REFERENCES.runtimeCacheEvidence
    ],
    relatedTopicIds: ["compatibility-terms", "linter-release", "troubleshooting", "assets", "scripts"],
    sections: [
      {
        title: "When To Use Technical Records",
        paragraphs: [
          "Technical Records is for investigation, not normal authoring. Open it when a warning mentions byte ownership, source/runtime cache confusion, unresolved links, preserved data, or writer coverage.",
          "The goal is to explain why a field is writable, preserved, read-only, or risky. Once you know that, return to the owning chapter to make the authoring change."
        ]
      },
      {
        title: "What To Inspect",
        points: [
          "Source group and file family when you need to know where a decoded record came from.",
          "Incoming and outgoing semantic links when a missing target or duplicate reference is unclear.",
          "Writer status when an export warning says Providence can preserve but not safely rewrite a record.",
          "Runtime cache labels when a file looks important but is not the author-owned source."
        ]
      }
    ]
  },
  {
    id: "combat-economy-rules",
    groupId: "appendix",
    label: "Coverage Appendix",
    title: "Combat, Economy, and Rules Coverage",
    summary: "See which Divinity-style editors are authorable today, which are library/reference surfaces, and which need follow-up writer work.",
    tags: ["coverage", "combat", "economy", "rules", "writer support", "roadmap"],
    badges: ["appendix", "coverage"],
    references: [MARKDOWN_REFERENCES.divinityParity, MARKDOWN_REFERENCES.coreRecordEvidence],
    relatedTopicIds: ["combat", "economy", "rules", "compatibility-terms"],
    sections: [
      {
        title: "How To Read Coverage",
        paragraphs: [
          "Coverage is not a substitute for the authoring chapters. Use it when deciding whether a visible surface is fully writable, browse-only, library-backed, or still future work.",
          "When coverage is conservative, Providence is choosing preservation over risky writes."
        ]
      },
      {
        title: "Practical Rule",
        points: [
          "If the chapter has an editor, validation, and export support, author there.",
          "If the chapter only previews a library or imported record, treat it as reference until copy/import support says otherwise.",
          "If Linter or Export reports a writer boundary, file or continue a focused follow-up rather than editing raw bytes."
        ]
      }
    ]
  },
  {
    id: "troubleshooting",
    groupId: "appendix",
    label: "Troubleshooting",
    title: "Troubleshooting and Deeper Checks",
    summary: "Know where to look when import, validation, export, previews, resources, or optional Realmz Classic checks fail.",
    tags: ["troubleshooting", "validation", "export", "resource", "oracle", "Classic", "failure"],
    badges: ["appendix", "debug"],
    references: [MARKDOWN_REFERENCES.oracleHarness, MARKDOWN_REFERENCES.formatIntegration, MARKDOWN_REFERENCES.releaseChecklist],
    relatedTopicIds: ["linter-release", "records-evidence", "projects", "assets", "compatibility-terms"],
    sections: [
      {
        title: "Start With The Owning Tool",
        points: [
          "If import fails, confirm the selected folder is a Realmz scenario source and that the project is empty.",
          "If validation fails, open the warning through Linter and then move to the owning chapter.",
          "If preview fails, check whether the asset is scenario-owned, stock Realmz, custom library, Divinity reference, or unsupported raw inventory.",
          "If export fails, check the selected target and whether raw source snapshots are available.",
          "If a Realmz runtime fails after export, compare Linter warnings, Export report notes, and optional oracle evidence."
        ]
      },
      {
        title: "When To Use Oracle Notes",
        paragraphs: [
          "The oracle harness is a deeper compatibility lane for testing exported scenarios in Realmz Classic. It is useful when normal validation and export look clean but the runtime still fails to load, start, render, or behave correctly.",
          "Use it deliberately. It is a release-confidence tool, not the first stop for ordinary authoring questions."
        ],
        callout: {
          tone: "warning",
          title: "Oracle runs are side-effectful",
          body: "They launch desktop processes and write run artifacts. Read the run summary before chasing individual files."
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
