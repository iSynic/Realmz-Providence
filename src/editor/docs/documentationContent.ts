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
  scenarioStartupEvidence: repoRef("Scenario Startup Runtime Anchors", "Marker/main file, Data CI, Data RI, first-start source files, and load-readiness evidence.", "docs/format-evidence-cards/scenario-startup-runtime-anchors.md"),
  scenarioRestrictionsEvidence: repoRef("Scenario Party Restriction Runtime Anchors", "Data RI layout, banned race/caste behavior, party-count gates, and validation candidates.", "docs/format-evidence-cards/scenario-party-restrictions-runtime-anchors.md"),
  scenarioRegistrationEvidence: repoRef("Scenario Registration Code Generator", "Security segment decoding, Divinity Coder/custom-scenario formulas, and evidence-labeled registration variants.", "docs/format-evidence-cards/scenario-registration-code-generator.md"),
  scenarioShellEvidence: repoRef("Scenario Shell, Startup, and Release", "Blank scenario shell, startup fields, contact info, restrictions, and release-readiness evidence.", "docs/format-evidence-cards/scenario-shell-startup-release.md"),
  battleEvidence: repoRef("Battle Record Runtime Anchors", "Data BD layout, grid semantics, messages, and battle macro evidence.", "docs/format-evidence-cards/battle-record-runtime-anchors.md"),
  monsterEvidence: repoRef("Monster Record Runtime Anchors", "Data MD layout, icon links, bestiary behavior, spawn paths, and death macro evidence.", "docs/format-evidence-cards/monster-record-runtime-anchors.md"),
  economyEvidence: repoRef("Item, Treasure, and Shop Runtime Anchors", "Item family ranges, Data NI, Data TD, Data SD, and shop cache behavior.", "docs/format-evidence-cards/item-treasure-shop-runtime-anchors.md"),
  rulesEvidence: repoRef("Rules Runtime Anchors", "Spell, race, and caste source files, override behavior, record sizes, and preservation policy.", "docs/format-evidence-cards/rules-spell-race-caste-runtime-anchors.md"),
  encounterEvidence: repoRef("Encounter Record Runtime Anchors", "Simple and complex encounter source records, runtime caches, action rows, and branch semantics.", "docs/format-evidence-cards/encounter-record-runtime-anchors.md"),
  thiefTimedEvidence: repoRef("Rogue and Timed Encounter Runtime Anchors", "Thief/rogue and timed encounter source records, runtime cache mutation, and validation rules.", "docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md"),
  resourceAuthoringEvidence: repoRef("Resource Authoring Evidence", "PICT, cicn, snd, text, map-name, fallback, and resource-writing boundaries.", "docs/format-evidence-cards/resource-authoring.md"),
  resourceTaxonomyEvidence: repoRef("Resource Fork Taxonomy", "Scenario-owned, Realmz reference, Divinity reference, UI-only, and advanced resource scope rules.", "docs/format-evidence-cards/resource-fork-taxonomy-authoring.md"),
  resourceIconEvidence: repoRef("Special/Icon Tile Runtime Anchors", "Negative tile values, normalized cicn lookup, base terrain rendering, and Data Solids behavior.", "docs/format-evidence-cards/resource-icon-runtime-anchors.md"),
  scenarioMusicEvidence: repoRef("Scenario Music and Format Files", "Custom scenario music modules, legacy Custom N files, and Format compatibility markers.", "docs/format-evidence-cards/scenario-music-and-format-files.md"),
  textEvidence: repoRef("Strings, Data OD, and String Sound", "Data SD2 strings, Data OD option labels, Divinity text import/export, and string sound support data.", "docs/format-evidence-cards/strings-data-od-string-sound.md"),
  actionPointEvidence: repoRef("Action Point and Extra AP Reachability", "Data DD/Data DDD/Data ED3 storage, GOSUB reachability, global hooks, random rectangles, battle and monster macro paths.", "docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md"),
  opcodeEdcdEvidence: repoRef("Opcode / EDCD Crosswalk", "Divinity opcode help, Realmz dispatcher anchors, CODE/ID meaning, and five-short EDCD shape coverage.", "docs/format-evidence-cards/opcode-edcd-crosswalk.md"),
  scriptRuntimeEvidence: repoRef("Scripts Runtime State Semantics", "Source-authored scripts, generated runtime state, encounter/shop mutation, and dispatcher-no-op classification.", "docs/format-evidence-cards/scripts-runtime-state-semantics.md"),
  globalMacroEvidence: repoRef("Global Macro Runtime Anchors", "Global hook slots, source-backed startup/death/quit/shop/temple consumers, and preserved unproven slots.", "docs/format-evidence-cards/global-macro-runtime-anchors.md"),
  coreRecordEvidence: repoRef("Core Records For Full Scenario Construction", "Monster, item, spell, race, caste, battle, treasure, shop, encounter, and map-note record evidence.", "docs/format-evidence-cards/core-records-full-construction.md"),
  byteOwnership: repoRef("Scenario Byte Ownership", "Container classification, byte ranges, writer gates, runtime caches, resource containers, and editor policy.", "docs/generated/scenario-byte-ownership.json"),
  completenessTruth: repoRef("Scenario Completeness Truth", "Fixture-backed writer readiness, semantic ownership, and known record construction status.", "docs/generated/scenario-completeness-truth.json"),
  fixedRecordWriterGates: repoRef("Fixed Record Writer Gates", "Record-size, writer ownership, and fixture-gate evidence for fixed Realmz source files.", "docs/generated/fixed-record-writer-gates.json"),
  releaseChecklist: repoRef("Release Checklist", "Desktop gate, manual smoke coverage, and public release requirements.", "docs/release-checklist.md"),
  runtimeCacheEvidence: repoRef("Runtime Caches vs Authored Source", "Source files, generated caches, save-state files, and export policy.", "docs/format-evidence-cards/runtime-caches-vs-authored-source.md"),
  byteRoundtripLedger: repoRef("Scenario Byte Roundtrip Ledger", "No-edit import/export preservation audit and source file classification.", "docs/generated/scenario-byte-roundtrip-ledger.json"),
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
    relatedTopicIds: ["documents-help", "search-navigation", "projects", "library", "maps", "linter-release"],
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
    id: "search-navigation",
    groupId: "authoring",
    label: "Search",
    title: "Global Search and Navigation",
    summary: "Jump across scenario records, assets, bundled libraries, documents, and diagnostics with scoped search and Realmz-style numeric shortcuts.",
    tags: ["search", "navigation", "Ctrl+K", "shortcut", "scenario", "assets", "libraries", "docs", "diagnostics", "record ID", "resource ID"],
    badges: ["navigation", "cross-tool"],
    references: [
      DIVINITY_CHAPTERS.gettingStarted,
      DIVINITY_CHAPTERS.text,
      MARKDOWN_REFERENCES.divinityParity,
      MARKDOWN_REFERENCES.coreRecordEvidence,
      MARKDOWN_REFERENCES.resourceTaxonomyEvidence,
      MARKDOWN_REFERENCES.releaseChecklist
    ],
    relatedTopicIds: ["documents-help", "getting-started", "library", "records-evidence", "assets", "scripts", "text", "linter-release"],
    sections: [
      {
        title: "What Search Owns",
        paragraphs: [
          "Global Search is Providence's cross-workbench jump tool. It indexes the current project, bundled reference libraries, handbook topics, validation output, and diagnostics so an author can move from a clue to the relevant editor without remembering which tab owns it.",
          "Divinity split this kind of work across Go To buttons, Find Occurrence, editor lists, and reference windows. Providence keeps those local searches, then adds one topbar search for the whole authoring environment."
        ],
        cards: [
          {
            title: "Project Data",
            body: "Scenario shell, maps, map records, Action Points, strings, encounters, battles, monsters, treasure, shops, item references, rules overrides, and quest labels.",
            facts: ["editable"]
          },
          {
            title: "Resources",
            body: "Scenario assets, decoded resource catalog entries, tile atlases, pictures, sounds, icons, and reference assets.",
            facts: ["asset-aware"]
          },
          {
            title: "Reference Material",
            body: "Bundled library entities, library records, library assets, and Documents topics.",
            facts: ["read-only"]
          },
          {
            title: "Diagnostics",
            body: "Validation errors, warnings, source diagnostics, and linter/export clues that point back to the affected workbench.",
            facts: ["release clues"]
          }
        ]
      },
      {
        title: "Search Scopes",
        paragraphs: [
          "The scope chips filter results without changing the project. Use them when a common word returns too many matches or when you know the answer should live in one source family."
        ],
        cards: [
          { title: "Scenario", body: "Editable project records and labels from the current Providence project.", facts: ["project"] },
          { title: "Assets", body: "Project-owned media plus reference assets that can explain a resource ID or preview.", facts: ["PICT", "snd", "cicn"] },
          { title: "Libraries", body: "Bundled Realmz and Divinity reference entries such as built-in monsters, items, spells, races, castes, and source records.", facts: ["reference-only"] },
          { title: "Docs", body: "Providence handbook topics, status language, Divinity crosswalks, and troubleshooting notes.", facts: ["handbook"] },
          { title: "Diagnostics", body: "Project validation and diagnostic messages, routed to Linter when opened.", facts: ["warnings"] }
        ],
        callout: {
          tone: "info",
          title: "Scopes are navigation filters",
          body: "Turning a scope off only hides matching rows in the search dialog. It never deletes records, changes validation state, or changes export behavior."
        }
      },
      {
        title: "Shortcut Searches",
        paragraphs: [
          "Numeric shortcuts are the fastest way to jump to Realmz records and resources when a warning, source note, or manual page gives you an ID. Type a family name plus a number; exact shortcuts are evaluated immediately."
        ],
        points: [
          "`string 349` or `message 349` jumps to a Data SD2 message when present.",
          "`ap 4`, `action point 4`, `macro 143`, or `extra action point 143` finds map scripts or Extra Action Points.",
          "`monster 12`, `item 900`, `battle 3`, `shop 5`, `treasure 18`, `quest 7`, `spell 401`, `race 2`, and `caste 9` target common record families.",
          "`pict 304`, `picture 304`, `sound 208`, `snd 208`, `icon 139`, and `cicn -74` target resource families and library fallbacks.",
          "`map 0`, `land 0`, `dungeon 0`, and `map record 6` jump to map-level data.",
          "A bare number can still match numeric IDs, but a typed shortcut is clearer when many families share the same number."
        ]
      },
      {
        title: "Opening Results",
        paragraphs: [
          "Opening a result changes workbench, domain, editor, and selected entity when the row knows a target route. This is navigation, not editing. You still make the actual change inside the destination tool.",
          "Search rows deliberately preserve source boundaries: a library monster opens as reference material, a scenario monster opens as editable project data, and a diagnostic opens through Linter context."
        ],
        points: [
          "Use Enter to open the highlighted result.",
          "Use Arrow Up and Arrow Down to move through visible rows.",
          "Use Show More when the right result is hidden inside a large scope group.",
          "Use Esc or Ctrl+K to close the dialog.",
          "After opening a result, inspect its badges and source labels before editing."
        ]
      },
      {
        title: "Good Search Habits",
        points: [
          "Search by exact ID when you have one from a linter warning, source record, Divinity note, or Realmz file.",
          "Search by title or visible text when looking for strings, map names, items, monsters, or documentation concepts.",
          "Search `registration`, `Divinity`, `runtime cache`, `special land`, `Data Solids`, `dispatcher`, or `release` when you need a handbook explanation.",
          "Search `missing`, `fallback`, `unsupported`, or a resource ID when tracking release warnings.",
          "Enable Libraries when a scenario points at a built-in Realmz resource that is not project-owned.",
          "Enable Docs when you know the concept but not the tool."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not mistake a library result for editable scenario data. The badges and destination workbench tell you whether it is reference-only.",
          "Do not keep a scope disabled and then assume the result is missing; re-enable all scopes when investigating.",
          "Do not expect one-character ordinary searches to run. Use at least two characters or a numeric shortcut.",
          "Do not treat duplicate titles as duplicates in the project. Scenario, asset, library, docs, and diagnostics rows can legitimately describe the same ID from different angles.",
          "Do not fix a linter warning from the search row alone. Open the result, read the owning tool, and then make the source-backed edit."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Global search dialog",
        caption: "Search input, scope chips, grouped results, preview badges, and keyboard footer."
      },
      {
        title: "Numeric shortcut jump",
        caption: "Example search for a Realmz record or resource ID, such as string 349, macro 143, pict 304, or icon 139."
      }
    ]
  },
  {
    id: "documents-help",
    groupId: "authoring",
    label: "Documents & Help",
    title: "Documents, Help On, and Divinity References",
    summary: "Use the handbook, hover help, source references, related topics, and Divinity Manual links as a layered authoring guide.",
    tags: ["documents", "help", "Help On", "Divinity Manual", "source references", "repo evidence", "related topics", "manual", "handbook"],
    badges: ["orientation", "in-app-help"],
    references: [
      DIVINITY_CHAPTERS.gettingStarted,
      MARKDOWN_REFERENCES.divinityParity,
      MARKDOWN_REFERENCES.formatIntegration,
      MARKDOWN_REFERENCES.releaseChecklist,
      MARKDOWN_REFERENCES.oracleHarness
    ],
    relatedTopicIds: ["getting-started", "search-navigation", "library", "compatibility-terms", "divinity-parity", "troubleshooting"],
    sections: [
      {
        title: "What Documents Owns",
        paragraphs: [
          "Documents is Providence's in-app handbook. It explains tool workflows, Divinity crosswalks, compatibility vocabulary, source evidence, and release practices in one place.",
          "The handbook is not a replacement for the Divinity Manual or the repo evidence cards. It is the bridge between them: author-facing guidance first, with source links when you need to verify the underlying legacy behavior."
        ],
        cards: [
          {
            title: "Author Workflows",
            body: "Practical tool pages for Maps, Scripts, Scenario, Assets, Text, Combat, Economy, Rules, Encounters, Records, Linter, Export, Library, and Search.",
            facts: ["how to use"]
          },
          {
            title: "Reference Topics",
            body: "Compatibility terms, Divinity parity, troubleshooting, oracle checks, and other cross-cutting explanations.",
            facts: ["why it works"]
          },
          {
            title: "Source References",
            body: "Divinity Manual chapters and local repo evidence cards attached to the topic they support.",
            facts: ["evidence"]
          }
        ]
      },
      {
        title: "Help On vs Documents",
        paragraphs: [
          "Help On and Documents serve different moments. Help On answers the small question you have while your cursor is already over a control. Documents answers the larger question of how a tool fits into Realmz and Divinity authoring.",
          "Turn Help On off when the interface feels too chatty; it only affects hover/focus help bubbles. The Documents handbook remains available from the topbar either way."
        ],
        cards: [
          {
            title: "Help On",
            body: "Inline hover/focus bubbles for controls, sections, fields, and source labels.",
            facts: ["moment-of-use"]
          },
          {
            title: "Documents",
            body: "Longer-form handbook pages with sections, cards, pitfalls, references, related topics, and visual slots.",
            facts: ["deeper context"]
          },
          {
            title: "Global Search",
            body: "Fast jump to a document topic, scenario record, reference library entry, resource, or diagnostic.",
            facts: ["Ctrl+K"]
          }
        ]
      },
      {
        title: "Using Document Search",
        paragraphs: [
          "Document search scans topic titles, summaries, tags, badges, source references, section text, cards, and callouts. It is best for concepts rather than exact record navigation; use Global Search for project IDs and resource IDs."
        ],
        points: [
          "Search `EDCD`, `dispatcher`, `macro`, or `Action Point` when scripting terms blur together.",
          "Search `special land`, `Data Solids`, `cicn`, or `PICT` when resource behavior is unclear.",
          "Search `runtime cache`, `preserved`, `writer gate`, or `source` when export or Records warnings need context.",
          "Search `release`, `oracle`, `desktop`, or `roundtrip` before a build/release pass.",
          "Click an indexed tag in the right rail to reuse one of the topic's own search terms."
        ]
      },
      {
        title: "Source References",
        paragraphs: [
          "Every strong handbook page should show where its claims come from. Divinity chips link to the local manual chapter. Repo chips point at local evidence files, generated ledgers, format notes, or release documents.",
          "Use Divinity links for legacy terminology and screen-level intent. Use repo evidence when you need parser layouts, byte ownership, writer gates, runtime-cache boundaries, or fixture-backed verification."
        ],
        cards: [
          {
            title: "Divinity Manual",
            body: "Legacy editor concepts, workflow names, and original scenario-authoring vocabulary.",
            facts: ["manual chapter"]
          },
          {
            title: "Evidence Cards",
            body: "Realmz source/runtime anchors, record sizes, resource policies, export boundaries, and diagnostic reasoning.",
            facts: ["repo"]
          },
          {
            title: "Generated Ledgers",
            body: "Machine-generated coverage, byte ownership, writer gates, and roundtrip summaries.",
            facts: ["audit"]
          }
        ],
        callout: {
          tone: "info",
          title: "Evidence is there to keep us honest",
          body: "When a page is uncertain, it should say so. Providence docs should distinguish confirmed Realmz behavior from inferred or planned editor behavior."
        }
      },
      {
        title: "Related Topics and Visual Slots",
        paragraphs: [
          "Related topics are curated reading paths. They should move you from a workflow page to its supporting reference, or from a warning page to the tool that can fix it.",
          "Visual Reference Slots are reserved places for stable screenshots or diagrams. Empty slots mean the doc is prepared for a future image, not that the scenario or editor is missing data."
        ],
        points: [
          "Use Related Topics when a section mentions another tool or compatibility concept.",
          "Use Search Terms when you want to filter the handbook by the current topic's vocabulary.",
          "Use Visual Slots as a reminder that some authoring concepts are easier to learn from screenshots once the UI stabilizes."
        ]
      },
      {
        title: "Divinity Manual Access",
        paragraphs: [
          "The Divinity Manual remains the canonical legacy authoring reference. Providence surfaces it from source chips inside Documents and from the topbar app mark.",
          "Triple-click the Realmz Providence mark in the topbar to open the local manual directly. The handbook should still be the first stop for Providence-specific workflow guidance."
        ],
        points: [
          "Use the manual for original Divinity vocabulary, screen layout, and classic editor intent.",
          "Use Providence Documents for modern UI mapping, compatibility status, and current implementation boundaries.",
          "Use Records, Linter, and source references when a manual concept needs byte-level or runtime confirmation."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not treat every handbook statement as a writer guarantee; check badges, source references, and linter/export gates.",
          "Do not leave Help On disabled and assume the tool lacks inline guidance.",
          "Do not use document search for exact project navigation when Global Search can jump directly to a record or resource.",
          "Do not ignore source references when behavior looks surprising; the attached evidence often explains the boundary.",
          "Do not let empty visual slots imply missing app functionality. They are documentation placeholders."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Documents panel anatomy",
        caption: "Navigation/search rail, topic content, related topics, source references, status badges, and indexed search terms."
      },
      {
        title: "Help On bubbles",
        caption: "A hover/focus help bubble attached to a tool control, contrasted with the longer Documents topic for the same area."
      }
    ]
  },
  {
    id: "projects",
    groupId: "authoring",
    label: "Projects",
    title: "Projects, Import, and Export",
    summary: "Create, open, import, save, validate, export, and recover Providence project packages without mutating source scenarios.",
    tags: [
      "project",
      "New Project",
      "Open Project",
      "Import Scenario",
      "save",
      "export",
      "undo",
      "dirty",
      "desktop",
      "browser preview",
      "source snapshot",
      "folder package",
      "project.json",
      "File System Access",
      "no-edit roundtrip"
    ],
    badges: ["export-safe", "verified"],
    references: [
      DIVINITY_CHAPTERS.gettingStarted,
      DIVINITY_CHAPTERS.startup,
      DIVINITY_CHAPTERS.release,
      MARKDOWN_REFERENCES.formatIntegration,
      MARKDOWN_REFERENCES.runtimeCacheEvidence,
      MARKDOWN_REFERENCES.byteRoundtripLedger,
      MARKDOWN_REFERENCES.releaseChecklist,
      MARKDOWN_REFERENCES.divinityParity
    ],
    relatedTopicIds: ["getting-started", "documents-help", "search-navigation", "scenario", "assets", "records-evidence", "linter-release", "troubleshooting"],
    sections: [
      {
        title: "What Projects Own",
        paragraphs: [
          "A Providence project is a folder package. The package owns project.json, decoded Realmz records, managed preview/export assets, semantic links, editor metadata, and any source snapshot captured during import.",
          "The original Realmz scenario folder stays outside the mutation path. Providence reads it, records what it needs for roundtrip/export, then edits the Providence package until you explicitly export a new Realmz-readable scenario folder."
        ],
        cards: [
          {
            title: "Project Package",
            body: "The editable Providence workspace. Save updates this package, not the original scenario folder.",
            facts: ["project.json", "editor-owned"]
          },
          {
            title: "Source Snapshot",
            body: "Imported bytes and resource forks Providence can preserve, compare, decode, or pass through when export support is partial.",
            facts: ["preservation"]
          },
          {
            title: "Export Folder",
            body: "The Realmz output folder written from the current project state after validation and writer checks.",
            facts: ["scenario output"]
          }
        ]
      },
      {
        title: "Lifecycle Flow",
        points: [
          "Use New to create a Providence package. This is the starting point for a blank scenario or a later import.",
          "Use Import Scenario only while the project is empty. Import reads a Realmz scenario folder into the project package and captures preservation evidence.",
          "Author maps, records, resources, strings, encounters, rules, scripts, and editor metadata inside the project.",
          "Use Save to persist the Providence package on desktop. Dirty means there are unsaved project edits.",
          "Use Linter and Export to write a Realmz-readable scenario folder once the project is release-ready."
        ],
        callout: {
          tone: "info",
          title: "Import is intentionally early",
          body: "Providence does not currently merge a raw Realmz scenario into an already-authored project. Keeping import limited to empty projects prevents source snapshots and project-owned edits from colliding invisibly."
        }
      },
      {
        title: "New, Open, And Import",
        paragraphs: [
          "New creates an empty Providence package with library-backed defaults. Empty projects can author new maps directly or import a raw Realmz scenario before any project content exists.",
          "Open loads an existing Providence project package. If you select a raw scenario folder when you meant to import, Providence cannot assume how to merge it into the current project.",
          "Import Scenario reads classic Realmz scenario files, resource forks, fixed-record data, pictures, sounds, icons, maps, scripts, and runtime-adjacent evidence into the empty package. Imported source files are then treated as evidence and preservation inputs."
        ],
        cards: [
          {
            title: "New Project",
            body: "Creates the package and leaves import available while no maps, records, or resources have been authored.",
            facts: ["empty workspace"]
          },
          {
            title: "Open Project",
            body: "Returns to a saved Providence project folder, including editor metadata and decoded assets.",
            facts: ["project.json"]
          },
          {
            title: "Import Scenario",
            body: "Consumes a raw Realmz scenario folder into an empty Providence package, with source snapshots for preservation and diagnostics.",
            facts: ["empty only"]
          }
        ]
      },
      {
        title: "Desktop And Browser Preview",
        paragraphs: [
          "Desktop is Providence's primary target. It owns native folder dialogs, persistent project save, scenario export, desktop smoke testing, and release builds.",
          "Browser preview is useful for quick UI work and some import experiments, but its file behavior depends on the browser's File System Access support. Save and Export are intentionally limited when the runtime cannot safely write the same desktop package/output model."
        ],
        points: [
          "Trust desktop for final parity checks, fixture reproduction, and public release validation.",
          "Use browser preview for fast interface review, but confirm file-heavy workflows again in desktop.",
          "When a topbar action is disabled in browser preview, read the status text; it usually reflects runtime file-system limits rather than missing scenario support."
        ]
      },
      {
        title: "Source Snapshots",
        paragraphs: [
          "Source snapshots are the reason Providence can be conservative. Imported bytes remain available for no-edit roundtrip checks, unsupported resource pass-through, asset restoration, and warnings when an edit would cross an unimplemented writer boundary.",
          "Snapshots are not a second editable scenario. They are evidence plus preservation material. Providence edits typed project state and writes only the scenario outputs it knows how to own safely."
        ],
        points: [
          "Unsupported but preserved files should pass through when the byte-roundtrip ledger marks them safe.",
          "Runtime caches and generated save-state files should not be mistaken for primary authored source.",
          "If the linter says a destructive write is blocked, treat that as a writer coverage problem rather than a reason to hand-edit the snapshot."
        ]
      },
      {
        title: "Save, Dirty, Undo, Redo",
        paragraphs: [
          "Save writes the Providence project package. It is separate from Export, which writes a Realmz scenario folder. A clean saved project can still need validation before export.",
          "The Dirty badge means the package has unsaved editor changes. Undo and Redo operate on Providence project commands, such as map painting, resource edits, record changes, custom palettes, or metadata changes."
        ],
        points: [
          "Save before risky editing passes, desktop smoke tests, or export attempts.",
          "Use Undo/Redo for editor commands; text fields may temporarily own keyboard shortcuts while Editing is shown.",
          "Do not treat export as backup. Export is scenario output, while Save is the Providence authoring state."
        ]
      },
      {
        title: "Validation And Export",
        points: [
          "Run validation before export, especially after changing maps, scripts, resources, registration data, or fixed-record structures.",
          "Export writes supported Realmz files from typed project state and preserves compatible unsupported source bytes when the evidence says that is safe.",
          "Export reports warnings, preserved resources, and blocked writes so release decisions stay visible.",
          "Release builds should pass fixture roundtrip tests, typecheck/build, desktop smoke, and the release checklist before pushing public packages."
        ],
        cards: [
          {
            title: "Validate",
            body: "Checks maps, record references, assets, scripts, semantic links, and writer boundaries before output.",
            facts: ["diagnostics"]
          },
          {
            title: "Export",
            body: "Writes a Realmz-readable scenario folder from project state plus safe preservation material.",
            facts: ["Realmz output"]
          },
          {
            title: "Release Gate",
            body: "Combines linter output, fixture tests, desktop smoke, and build artifacts before shipping.",
            facts: ["desktop primary"]
          }
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not import into a project that already has authored content; create a fresh package for a raw scenario import.",
          "Do not edit the original imported scenario folder and expect Providence to merge those changes later.",
          "Do not confuse Save with Export. Save preserves Providence authoring state; Export produces the Realmz scenario folder.",
          "Do not treat browser preview as final desktop parity for import/export, resource forks, or native file dialogs.",
          "Do not ignore Dirty before quitting, building, or comparing desktop output.",
          "Do not assume every source-backed file is writer-owned. Check the linter, evidence badges, and export report."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Project lifecycle boundary",
        caption: "New/Open/Import feed the Providence package; Save persists the package; Validate and Export write the Realmz scenario output."
      },
      {
        title: "Source snapshot versus authored state",
        caption: "Imported source bytes remain preservation evidence while typed project records, assets, and editor metadata become the editable surface."
      }
    ]
  },
  {
    id: "library",
    groupId: "authoring",
    label: "Library",
    title: "Library Workbench and Reference Data",
    summary: "Use bundled Realmz and Divinity reference material without confusing it with scenario-owned records, assets, or export data.",
    tags: ["library", "reference", "Realmz Library", "Divinity", "Monster Scrapbook", "Monster Mash", "Bag of Holding", "Vault of Arcana", "fallback", "built-in"],
    badges: ["reference-only", "bundled"],
    references: [
      DIVINITY_CHAPTERS.gettingStarted,
      DIVINITY_CHAPTERS.icons,
      DIVINITY_CHAPTERS.specialLand,
      DIVINITY_CHAPTERS.picturesSounds,
      MARKDOWN_REFERENCES.resourceTaxonomyEvidence,
      MARKDOWN_REFERENCES.resourceAuthoringEvidence,
      MARKDOWN_REFERENCES.resourceIconEvidence,
      MARKDOWN_REFERENCES.coreRecordEvidence,
      MARKDOWN_REFERENCES.divinityParity
    ],
    relatedTopicIds: ["search-navigation", "assets", "maps", "combat", "combat-economy-rules", "rules", "records-evidence", "compatibility-terms"],
    sections: [
      {
        title: "What Library Owns",
        paragraphs: [
          "Library Workbench is Providence's bundled reference surface. It catalogs known Realmz and Divinity source files so the editor can show built-in art, shared records, item libraries, monster reference material, spells, races, castes, and resource-fork examples before a scenario has imported its own data.",
          "The catalog is intentionally reference-first. Library entries help Providence resolve previews, search results, picker choices, fallback art, and evidence labels, but they do not become scenario-owned files just because they are visible."
        ],
        cards: [
          {
            title: "Sources",
            body: "The files that fed the catalog, such as Realmz reference data, Divinity import material, Monster Scrapbook, Monster Mash, Bag of Holding, Vault of Arcana, and resource forks.",
            facts: ["catalog input"]
          },
          {
            title: "Records",
            body: "Decoded fixed or resource records with byte ranges, confidence, and source labels. These are evidence until a project creates or imports its own editable counterpart.",
            facts: ["read-only evidence"]
          },
          {
            title: "Entities",
            body: "Searchable built-in objects such as monsters, items, spells, races, castes, pictures, sounds, icons, and special land tiles.",
            facts: ["picker/search"]
          },
          {
            title: "Assets",
            body: "Previewable reference resources that can satisfy Realmz fallback lookups and authoring pickers without being copied into the scenario package.",
            facts: ["preview/fallback"]
          }
        ]
      },
      {
        title: "Divinity and Realmz Crosswalk",
        paragraphs: [
          "Divinity exposes many built-in Realmz concepts as editor pickers, reference books, or importable resource material. Providence keeps that idea, but it separates the read-only reference layer from the current project's exportable layer more explicitly.",
          "A useful mental model is: Library answers what Realmz already knows; Project answers what this scenario owns."
        ],
        points: [
          "Divinity's monster and item reference material maps to Combat, Economy, Rules, Assets, and Records library views.",
          "Divinity's icon, special land tile, picture, and sound chapters map to the Assets reference library and map paint pickers.",
          "Standard Realmz landlooks, monster icons, and shared rules can be displayed from Library even when the scenario does not carry those resources.",
          "Scenario-local custom records, Scenario.rsrc entries, custom landlooks, and imported assets remain project-owned and exportable when Providence has writer support."
        ],
        callout: {
          tone: "info",
          title: "Reference-only is a feature",
          body: "Providence labels built-ins as reference-only so authors can use them confidently without accidentally bloating or corrupting the scenario resource fork."
        }
      },
      {
        title: "Reference vs Project-Owned",
        paragraphs: [
          "The most important Library rule is that visibility is not ownership. A library icon preview, item row, spell record, or special land tile can explain an ID, but export still depends on whether the current project owns a source-backed record or resource.",
          "When an author wants an editable custom record, Providence should copy or create a project-owned version through a domain tool instead of editing the library entry."
        ],
        cards: [
          {
            title: "Library Reference",
            body: "Built into Realmz or bundled with Providence for lookup, preview, comparison, or fallback.",
            facts: ["not exported by itself"]
          },
          {
            title: "Project Asset",
            body: "Managed by the current Providence project, cataloged under Assets, and eligible for scenario resource export when supported.",
            facts: ["scenario-owned"]
          },
          {
            title: "Raw Source Snapshot",
            body: "Imported scenario files preserved for no-edit roundtrip and writer boundaries. They are not the same as the shared library catalog.",
            facts: ["import evidence"]
          }
        ],
        points: [
          "Do not treat a library fallback as proof that the scenario ships the resource.",
          "Do not edit or delete library material when fixing a scenario export warning.",
          "Use Assets when importing new scenario media; use Library when checking whether a Realmz built-in already exists.",
          "Use Records when you need byte-range and source confidence evidence for a library or project entry."
        ]
      },
      {
        title: "How Tools Use Library",
        paragraphs: [
          "Most Providence tools quietly consult Library so their pickers and previews work even in new projects. This is why the Library Workbench matters even if authors do most day-to-day work in Project Workbench."
        ],
        points: [
          "Maps uses library landlook atlases, official marker/icon references, paintable special land tiles, and fallback previews for negative tile resources.",
          "Combat uses library actor/creature icons, Monster Scrapbook templates, and Monster Mash art while keeping scenario Data MD and Data BD records editable in Project Workbench.",
          "Economy uses Bag of Holding, Vault of Arcana, and shared item records to label treasure, shops, and custom item copy workflows.",
          "Rules uses shared spell, race, and caste data as reference/copy sources while scenario overrides remain source-backed project records.",
          "Assets uses Library to distinguish Realmz built-ins, Divinity reference art, UI-only evidence, scenario-owned media, and unresolved resource fallbacks.",
          "Global Search indexes Library entries so a known icon, item, monster, spell, or resource can be found even before the current scenario references it."
        ]
      },
      {
        title: "Catalog Sources and Diagnostics",
        paragraphs: [
          "The Library Hub lists catalog sources and counts for records, entities, assets, and diagnostics. The source kind and role columns are meant to keep the origin of every reference visible.",
          "Diagnostics in the Library Workbench describe the health of the bundled catalog itself: parser confidence, trailing bytes, resource-fork decoding, missing previews, or source classification issues. They are separate from Linter diagnostics for the current scenario."
        ],
        cards: [
          {
            title: "realmz-reference",
            body: "Reference data from Realmz itself. These are the safest built-in fallback labels and art sources for Realmz runtime behavior.",
            facts: ["built-in"]
          },
          {
            title: "divinity-import",
            body: "Divinity source/reference material used to compare editor behavior, manual examples, and historical tool data.",
            facts: ["manual/editor evidence"]
          },
          {
            title: "providence-library",
            body: "Providence-created draft or bundled reference entries used to support modern workflows without changing Realmz source files.",
            facts: ["editor-only"]
          }
        ]
      },
      {
        title: "Developer Refresh Boundary",
        paragraphs: [
          "Normal scenario authoring should not rebuild the managed library. The catalog is packaged with Providence and loaded automatically in browser and desktop paths.",
          "Refresh or rebuild the library only during developer asset updates, when adding new reference fixtures, improving decoders, or correcting source classification. After a refresh, check desktop parity because filesystem-backed library previews can differ from browser memory previews."
        ],
        points: [
          "New scenario media belongs in Assets, not in the managed library.",
          "New custom items, monsters, spells, races, or castes belong in the current project unless they are deliberately being added as Providence reference fixtures.",
          "A changed library decoder should be checked in Maps, Combat, Economy, Rules, Assets, Records, and Search because the catalog feeds all of them."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not assume a preview means the current scenario owns a resource. It may be a library fallback.",
          "Do not export library resources unless the project explicitly imports or owns equivalent scenario assets.",
          "Do not confuse Monster Scrapbook reference entries with scenario Data MD monster records.",
          "Do not confuse Monster Mash art with editable monster definitions.",
          "Do not rename or renumber a scenario record just because the library has a friendlier label for a built-in ID.",
          "Do not chase scenario linter warnings by modifying bundled reference data; fix the project-owned record, asset, or source file instead."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Library hub",
        caption: "Summary cards for bundled source, record, entity, asset, and diagnostic counts, plus the managed catalog source list."
      },
      {
        title: "Reference asset boundary",
        caption: "Library asset preview beside a scenario asset preview, showing which one is reference-only and which one can export."
      }
    ]
  },
  {
    id: "scenario",
    groupId: "authoring",
    label: "Scenario",
    title: "Startup, Restrictions, Contact Info, and Security",
    summary: "Author the scenario shell Realmz checks before play begins: marker/main startup fields, contact metadata, party restrictions, global hooks, registration segments, and load-readiness gates.",
    tags: ["scenario", "startup", "Data CI", "Data RI", "Global", "registration", "security", "Scenario resource fork", "release"],
    badges: ["load-ready", "shell-aware"],
    references: [
      DIVINITY_CHAPTERS.startup,
      MARKDOWN_REFERENCES.scenarioStartupEvidence,
      MARKDOWN_REFERENCES.scenarioRestrictionsEvidence,
      MARKDOWN_REFERENCES.scenarioRegistrationEvidence,
      MARKDOWN_REFERENCES.scenarioShellEvidence,
      MARKDOWN_REFERENCES.divinityParity
    ],
    relatedTopicIds: ["projects", "maps", "assets", "rules", "scripts", "linter-release", "compatibility-terms"],
    sections: [
      {
        title: "What Scenario Owns",
        paragraphs: [
          "Scenario is the Providence workbench for the startup shell Realmz reads before launching a new game. It covers the marker/main scenario file, contact/release text, party admission restrictions, global event hooks, legacy security segments, and load-readiness checks.",
          "This tool is intentionally separate from Maps, Assets, Rules, and Scripts. Scenario decides whether the package can be selected and started; the other tools author the content the party reaches after startup."
        ],
        cards: [
          {
            title: "Startup Shell",
            body: "The marker/main scenario file stores recommended level, maximum party level, startup land level, startup X/Y, creator/user check, and two registration/security code segments.",
            facts: ["marker/main file", "316 bytes"]
          },
          {
            title: "Contact Info",
            body: "Data CI stores release-facing scenario title, version, date, author, contact, payment, title, and description strings.",
            facts: ["Data CI", "18 Str255 slots"]
          },
          {
            title: "Party Restrictions",
            body: "Data RI optionally bans races/castes and gates party size or character level before a party can enter the scenario.",
            facts: ["Data RI", "320 bytes"]
          }
        ]
      },
      {
        title: "Startup Shell",
        paragraphs: [
          "Realmz requires a scenario folder, a marker/main file named like the scenario, and a Scenario resource file. The marker/main file is where the first-start fields live.",
          "Providence exposes the source-backed startup values directly while preserving unknown trailing bytes from imported marker files."
        ],
        points: [
          "Recommended Level is the party level target shown during party selection.",
          "Maximum Party Level is an optional cap; imported values such as 999 should be preserved unless intentionally changed.",
          "Startup Land selects the outdoor land level Realmz loads first.",
          "Startup X and Startup Y are map/view coordinates and should remain inside the 0..89 map bounds.",
          "Creator / User Check is a Str255 legacy access field; empty means no creator/user check.",
          "Code Segment 1 and Code Segment 2 are twenty-byte security/registration segments stored in the same marker file."
        ]
      },
      {
        title: "Contact and Release Metadata",
        paragraphs: [
          "Data CI is optional in the corpus but fixed-size when present. It contains eighteen classic Str255 fields used by the contact/release information dialog.",
          "Providence treats these fields as scenario-owned strings. They help authors track version, author, web/email contact, fee/payment notes, and the public scenario description."
        ],
        points: [
          "Title should match the intended public scenario title, not necessarily the folder name.",
          "Version, Date, Author, Email, and Web are release-facing metadata.",
          "Description is the long user-facing scenario summary.",
          "Payment/title slots are preserved in the data model even when the current UI only exposes the most useful public fields."
        ]
      },
      {
        title: "Party Restrictions",
        paragraphs: [
          "Data RI adds optional admission rules beyond the marker/main recommended and maximum level fields. Runtime evidence proves race and caste flags are bans, despite legacy field names that sound like permissions.",
          "If Data RI is absent, Realmz applies no extra race/caste/party-count restriction dialog evidence from that file."
        ],
        points: [
          "Maximum Number Of Characters should stay in the Realmz party-size range.",
          "Maximum Level Of Any Character uses zero for no extra level cap.",
          "Banned Races and Banned Castes should be checked carefully against Rules overrides.",
          "Restriction Message is the text Realmz shows in the restriction dialog.",
          "Validation should warn when every race or every caste is banned."
        ],
        callout: {
          tone: "warning",
          title: "Banned means banned",
          body: "The raw arrays are historically named canrace/cancaste, but Realmz rejects a candidate when the flag is nonzero. Providence labels them as banned races and banned castes."
        }
      },
      {
        title: "Security and Registration",
        paragraphs: [
          "Legacy scenarios can include two 20-character security code segments. Realmz and Divinity use those segments, the scenario title, the registration name, and the Realmz serial number to compute scenario registration codes.",
          "Providence shows evidence-labeled registration variants instead of pretending every Mac/Windows path shares one universal formula."
        ],
        points: [
          "Unlock editing only when intentionally changing the code players need.",
          "Apply Security Codes updates the marker/main encoded bytes and creates a zero-mask backup when none was imported.",
          "The Divinity Coder / PC v7.1 custom formula is the proven custom-scenario path for tested Divinity scenarios.",
          "Bundled official Fantasoft scenario formulas are a separate algorithm family.",
          "Candidate variants should remain labeled until runtime acceptance evidence proves them."
        ],
        callout: {
          tone: "info",
          title: "Security edits are compatibility edits",
          body: "Changing code segments affects player registration codes. Keep the exact segment text and generated code evidence with release notes when distributing a protected scenario."
        }
      },
      {
        title: "Global Events and Scenario Hub",
        paragraphs: [
          "Divinity's Scenario area is a hub: it links startup data to pictures, rules overrides, security, contact info, and global macro hooks. Providence mirrors that split by linking from Scenario into the focused tools that own each deeper editor.",
          "Global event hooks live in the Global source file. Start, Death, Quit, Shop, and Temple have source-backed runtime consumers; reserved slots should be preserved unless further evidence promotes them."
        ],
        points: [
          "Start runs during new-game/startup flow. A Start hook value of 0 means no startup macro, so tests should use a nonzero Extra Action Point row.",
          "Death and Quit attach to party loss/revive and game-exit paths.",
          "Shop and Temple fire from the button flow; teleporting or sending a party to a shop by negative shop ID does not trigger these hooks.",
          "Scenario pictures are managed in Assets, including the Divinity title/splash picture range.",
          "Spell, race, and caste overrides are managed in Rules."
        ]
      },
      {
        title: "Load Readiness",
        paragraphs: [
          "Load Readiness checks whether Realmz can select and start the exported scenario. It is not the same as full release validation, but it catches missing shell pieces early.",
          "The minimum startup model includes the marker/main file, Scenario resource fork, valid startup map/coordinates, contact info when present, and first-start source files for outdoor data."
        ],
        points: [
          "Marker/main file must have a non-empty source name.",
          "Scenario resource fork should be present for Realmz resource lookup.",
          "Startup land and coordinates should resolve to an authored land map.",
          "First-start outdoor files such as Data DD, Data LD, and Data RD are checked here.",
          "The Linter and Export tools still own broader release blockers."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not confuse the scenario folder name, marker file name, and display title; Realmz cares about the marker/main file path during selection.",
          "Do not treat runtime cache files such as CL, CD, CE, CE2, CS, CT, or CTD3 as Scenario export sources.",
          "Do not overwrite unknown marker trailing bytes or Scenario resource metadata unless writer fixtures prove the behavior.",
          "Do not ban races/castes without checking Rules overrides and party creation expectations.",
          "Do not assume registration formulas are interchangeable between bundled Fantasoft scenarios and Divinity/custom scenarios."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Scenario shell overview",
        caption: "Reserved for a screenshot showing Startup Shell, Security / Registration, Contact Info, Restrictions, Global Events, and Load Readiness together."
      }
    ]
  },
  {
    id: "maps",
    groupId: "authoring",
    label: "Maps",
    title: "Maps, Painting, and Overlays",
    summary: "Work with land and dungeon maps, tile painting, overlays, map records, triggers, and random rectangles.",
    tags: ["maps", "land", "dungeon", "painting", "overlays", "Action Point", "Land Layout", "random rectangles", "edge travel", "Extra AP doors"],
    badges: ["authoring", "visual"],
    references: [
      DIVINITY_CHAPTERS.landEditor,
      DIVINITY_CHAPTERS.map,
      DIVINITY_CHAPTERS.dungeon,
      DIVINITY_CHAPTERS.actionPoints,
      DIVINITY_CHAPTERS.specialLand,
      DIVINITY_CHAPTERS.standardLand,
      MARKDOWN_REFERENCES.divinityParity
    ],
    relatedTopicIds: ["scripts", "encounters-targets", "assets", "records-evidence", "linter-release"],
    sections: [
      {
        title: "What Maps Own",
        paragraphs: [
          "Maps is the Providence workbench for Realmz land levels, dungeon levels, land layout adjacency, map records, tile painting, Action Points, random rectangles, tile metadata, and map-facing diagnostics.",
          "Every land and dungeon level is a Realmz 90 x 90 map field. Providence edits those map fields directly, then layers modern inspection, palettes, overlays, and source evidence on top so the classic data stays visible."
        ],
        cards: [
          {
            title: "Canvas",
            body: "The normal painting and placement surface for land tiles, dungeon tiles, special land icons, Action Points, random rectangles, and map starts.",
            facts: ["paint", "inspect", "place"]
          },
          {
            title: "Land Layout",
            body: "The outdoor adjacency grid Realmz uses when the party walks off a land map edge. Blank layout cells mean no automatic edge travel.",
            facts: ["edge travel", "land only"]
          },
          {
            title: "Land Tiles",
            body: "The Divinity-style atlas and attribute inspector for the active landlook, including movement, passability, shore/water, path, LOS, forest, and combat-build evidence.",
            facts: ["mapstats", "Data Solids"]
          }
        ]
      },
      {
        title: "Divinity Crosswalk",
        points: [
          "Divinity's Land Editor maps to Providence's Canvas, Paint Inspector, Paint Palette, Map Setup, and Land Layout views.",
          "Divinity's Map Editor maps to Providence map records, map starts, Action Point overlays, random rectangles, and map flags.",
          "Divinity's Dungeon Editor maps to Providence dungeon rendering, dungeon Action Points, dungeon map fields, darkness, and line-of-sight preview.",
          "Divinity's Creating Special Land Tiles chapter maps to Providence Assets plus the Paint Palette's Special / Icons tab.",
          "Divinity's Standard Land Tile Editor maps to Providence's Land Tiles and Combat Tiles view. Standard Realmz landlook records remain read-only until every exported byte is understood."
        ],
        callout: {
          tone: "info",
          title: "Providence keeps the classic terms visible",
          body: "When a field is named differently from Divinity, the inspector should still expose the Realmz source concept: mapstats, Data Solids, Data LD/DL, Data RD/RDD, Action Points, map records, and special land cicn resources."
        }
      },
      {
        title: "Tile Value Model",
        paragraphs: [
          "A map cell stores a raw Realmz tile value. That value may point at a standard landlook tile, a dungeon tile, an encoded state band, a negative special land icon, a positive icon-backed value, or a value already used by the imported map.",
          "The Paint Palette is the authoring surface for those values. The Assets tool is where resources are inspected or managed; Maps is where map-paintable values are placed."
        ],
        points: [
          "Landlook tiles are positive tile values drawn from the selected Realmz landlook atlas.",
          "Dungeon maps use dungeon tile values and dungeon render metadata instead of landlook terrain.",
          "Special land tiles are negative cicn-backed values. Large structures and landmarks often live here, so they appear under Special / Icons rather than ordinary terrain groups.",
          "Used In This Map lists raw values already present on the selected map, including values that do not fit the current atlas range.",
          "Attributes groups tiles by decoded behavior such as walkable, solid, runtime path, shore/water, boat, fly/float, LOS blocking, forest, and combat map evidence.",
          "Raw / Advanced exists for compatibility auditing and expert painting of values not exposed by the safer grouped tabs."
        ],
        cards: [
          {
            title: "Road art is not always runtime path",
            body: "Some tiles look like roads or paths because of their art. The Realmz runtime path flag is separate metadata from mapstats or source evidence.",
            facts: ["visual art", "runtime flag"]
          },
          {
            title: "Secret and passable markers",
            body: "Providence uses official-style marker overlays where confirmed. They are overlays on top of the underlying map tile, not replacement terrain.",
            facts: ["overlay", "preserve tile art"]
          }
        ]
      },
      {
        title: "Painting Workflow",
        paragraphs: [
          "Select inspects a tile and drag-selects rectangular regions. Pan moves the canvas, and right-click-drag pans from any map tool. Paint opens the Paint Inspector and uses the selected tile, palette mode, paint subtool, and variation setting.",
          "The palette can be docked in the Paint Inspector or floated over the canvas. Custom palettes are project-saved tile buckets; drag tiles from any palette tab into the reveal dock to collect reusable town kits, terrain blends, dungeon props, or scenario-specific values.",
          "Stamp is a separate canvas tool for multi-cell placement. Use it when the thing you want to draw is a building, tree pair, landmark, or other assembled tile pattern rather than a single raw tile value."
        ],
        points: [
          "Brush paints the selected value by dragging.",
          "Replace swaps one source tile value for the selected paint tile in a region or whole map.",
          "Eraser restores cells to the current map's clear tile, which can be walkable blank space on dungeon maps.",
          "Fill Region uses the selected tile, cycle group, random group, or custom palette variation.",
          "Chance To Fill scatters paint across only some eligible cells, useful for rocks, trees, graves, ruins, or other flavor tiles.",
          "Sample picks an existing map cell into the paint tile so imported maps can teach the palette."
        ]
      },
      {
        title: "Stamp Library",
        paragraphs: [
          "The Stamp tool places reusable multi-tile brushes on the map. Providence ships built-in stamps for known Realmz special-land assemblies such as paired trees, towers, gates, halls, domes, and other structures that are awkward to rebuild one cell at a time.",
          "Project stamps are saved inside the Providence project. Global stamps are saved in the local app profile and are meant as a personal toolbox across projects. Neither kind writes extra Realmz scenario data; applying a stamp writes ordinary map tile values."
        ],
        points: [
          "Built-In shows Providence's curated stamp set, including authored special-land structures.",
          "Project shows stamps saved with the current project and traveling with that project file.",
          "Global shows local personal stamps available across projects on this machine.",
          "New From Selection captures the selected map region as a project stamp, omitting clear/base cells so transparent gaps do not overwrite surrounding terrain.",
          "Edit opens a grid where cells can be filled with the current paint tile, cleared to transparent, resized, renamed, and rearranged.",
          "Copy To Global and Copy To Project move useful stamps between the project library and your personal library.",
          "Transparent stamp cells are skipped during placement; explicit clear/base tiles only paint when they are deliberately stored as cells."
        ],
        callout: {
          tone: "info",
          title: "Sample first when recreating authored structures",
          body: "If a special-land assembly looks wrong, sample or select the real authored map placement and capture it as a project stamp. Authored adjacency is better evidence than the resource atlas row."
        }
      },
      {
        title: "Smart Terrain",
        paragraphs: [
          "Smart terrain is a beta implementation for land maps with supported standard landlooks. It is useful for roughing in mountains, water, and forest, but the edge resolver is still being refined and should be reviewed before release-quality maps are exported.",
          "Draw the full intended region, preview the resolved result, then apply it as ordinary undoable tile edits.",
          "Mountains, water, and forest use curated tile families plus atlas-derived shape matching. Interior cells should become full terrain; boundary cells should choose edges, corners, notches, and narrow-line fallbacks that fit the mask."
        ],
        points: [
          "Presets currently cover Mountains, Water, and Trees / Forest.",
          "Smart terrain preserves roads, buildings, special/icon tiles, Action Point markers, and unrelated terrain.",
          "Re-running Smart over the same family is allowed so rough output can be reshaped.",
          "Mountains currently have the strongest profile; water and forest remain useful but need manual inspection and touch-up.",
          "Custom landlooks are intentionally unsupported until Providence can analyze or author their own smart profiles."
        ],
        callout: {
          tone: "warning",
          title: "Beta: review the preview",
          body: "Smart terrain is not a final replacement for hand-authored Divinity tile work. Treat the preview as a starting point, especially for tapered water edges, narrow bands, and forest boundaries."
        }
      },
      {
        title: "Land Layout Edge Travel",
        paragraphs: [
          "Land Layout is the outdoor adjacency table behind Divinity's Land Layout Editor. It is not a picture of every outdoor map; it is the lookup grid Realmz uses when the party walks off the north, south, east, or west edge of a land level.",
          "Realmz finds the party's current outdoor level in the layout table, then looks at the neighboring cell in the direction the party exited. If that neighboring cell is blank, automatic edge travel stops. If it references a land level, Realmz loads that destination."
        ],
        points: [
          "The table is 8 rows by 16 columns, giving 128 possible layout slots.",
          "Blank cells mean no automatic outdoor edge travel.",
          "Land level 0 is stored as -1 in the legacy table; Providence keeps that raw value visible.",
          "Positive values refer to matching land level indices.",
          "Preview mode draws thumbnails for orientation, while Compact mode keeps the same data dense for editing.",
          "Neighbor Preview focuses on the four cells Realmz checks for edge travel from the selected slot.",
          "Place Current Land Here writes the selected land map into the active layout cell; Open Linked Map jumps to the referenced destination."
        ],
        callout: {
          tone: "warning",
          title: "Layout references map indices",
          body: "Deleting, inserting, or renumbering land maps can invalidate scripts, map records, random levels, and layout cells. Providence currently favors append/duplicate workflows and explicit layout placement."
        }
      },
      {
        title: "Random Rectangle Authoring",
        paragraphs: [
          "Random Rectangles are level-local encounter areas stored with the selected land or dungeon random-level record. They are how Realmz decides whether a random encounter, battle range, text/sound hint, or Extra Action Point door path can fire while the party moves through part of a map.",
          "Divinity exposes these as numbered rectangles. Providence keeps the same slot model and adds diagnostics for inverted bounds, out-of-range chance, inactive rectangles, and overlapping regions."
        ],
        points: [
          "Each random-level record can store up to twenty rectangle slots.",
          "Realmz checks slots from 19 down to 0, so higher-numbered rectangles win when active areas overlap.",
          "Bounds use Classic QuickDraw-style map coordinates. Left/Top are covered cells; Right/Bottom are edge coordinates, so the last covered tile is one cell before them.",
          "Times in 10,000 is the encounter chance field. A value of 1000 is roughly ten percent before other runtime checks.",
          "Battle Low and Battle High are an inclusive Data BD battle range for the random encounter.",
          "Sound and Text are numeric links, not free-form labels.",
          "Only this rectangle can fire is an imported exclusivity flag and should be used carefully because it can suppress competing random areas.",
          "Show All On Map enables the overlay; Draw On Canvas switches back to spatial rectangle editing."
        ]
      },
      {
        title: "Extra Action Point Doors",
        paragraphs: [
          "Random rectangles can also call up to three Extra Action Point door paths. These are part of the same map/runtime behavior family as scripts, but they are stored on the random rectangle instead of as ordinary map trigger placement.",
          "Providence labels the door fields inside Random Areas and keeps their signed percentage behavior visible because legacy scenarios use both one-shot and repeatable forms."
        ],
        points: [
          "Door 1 through Door 3 are Extra Action Point references associated with the selected random rectangle.",
          "A positive door percent means a one-shot chance.",
          "A negative door percent means a repeatable chance.",
          "Zero percent means no Extra AP chance for that door slot.",
          "Use Scripts or Global Search to inspect the target Extra Action Point body once you know the door ID."
        ],
        callout: {
          tone: "info",
          title: "Random areas bridge Maps and Scripts",
          body: "When a random rectangle references Extra Action Points, fix the rectangle bounds/chance in Maps and the actual CODE/ID/EDCD behavior in Scripts."
        }
      },
      {
        title: "Action Points On Maps",
        paragraphs: [
          "Action Points are script entry records placed at map coordinates. They can show text, branch on state, teleport, mutate map tiles, start encounters, trigger battles, play media, call macros, and perform many other Realmz actions.",
          "Map placement and script body editing are intentionally split. Maps answers where the Action Point sits and what overlay category it belongs to; Scripts answers what its CODE, ID, and EDCD rows do."
        ],
        points: [
          "Use the Action Point tool for placement and the Scripts tool for deeper opcode editing.",
          "Overlay filters can show all Action Points or isolate links by encounters, quests, map mutation, battle, text, and unresolved opcodes.",
          "Use Global Search for AP IDs, macro IDs, text IDs, and battle IDs when jumping between the map overlay and the script body."
        ]
      },
      {
        title: "Map Records, Starts, Pictures, and Notes",
        paragraphs: [
          "Map Records are the source-backed records behind Divinity's Map Editor list entries. They are not map tiles and they are not Action Point scripts; they are entry/settings records that point at a land or dungeon level and describe how that entry should be displayed or reached.",
          "Providence shows the decoded Data MD2 evidence, byte range, outgoing/incoming semantic links, editable fields, and canvas overlay actions together so you can check the record against the map it references."
        ],
        points: [
          "Start X and Start Y are 0..89 coordinates for the record's map start.",
          "Level plus Dungeon record identifies the target land or dungeon map. Changing these can move a record away from the currently selected map.",
          "Picture ID links the map record to a PICT resource when the scenario uses one.",
          "Icon Size and Show are legacy display/control fields. They are editable because they are source-backed, but they should be changed conservatively.",
          "Note is a short source-backed map-record note field, separate from free-form Providence editor notes.",
          "Markers can store up to ten icon IDs with X/Y coordinates. Marker slots are map-record display data, not Action Points.",
          "Display Rect is a source-backed rectangle and should keep ordered top/left/bottom/right bounds.",
          "Open Related Map jumps to the target level with map-record overlays visible; Copy Coordinates copies the start coordinate for cross-checking."
        ],
        callout: {
          tone: "info",
          title: "Map records are a third map layer",
          body: "Tiles draw the map, Action Points run scripts, and Map Records describe starts/display metadata for a level. Keeping those layers separate makes export and debugging much less mysterious."
        }
      },
      {
        title: "Map Setup and Map Creation",
        points: [
          "Map Setup owns the selected map's name, landlook, renderer, darkness, line-of-sight flag, and map-level validation.",
          "Land map creation appends dense land indices and creates a companion random-level shell.",
          "Dungeon map creation appends dense dungeon indices and creates a companion dungeon random-level shell.",
          "Duplicate Map copies tiles and basic render setup into the next dense index, then creates fresh authored random-level settings.",
          "Map-record overlays can be enabled separately from Action Point and random-rectangle overlays."
        ],
        callout: {
          tone: "info",
          title: "Deletion and reordering are deferred",
          body: "Realmz references map indices from scripts, layout cells, map records, encounters, and random data. Providence currently appends and duplicates maps rather than deleting or inserting them in the middle."
        }
      },
      {
        title: "Tile Metadata and Safety",
        paragraphs: [
          "Providence derives standard land tile behavior from Realmz mapstats and derives scenario-local special tile solidity from Data Solids. The inspector names the source whenever possible so authored edits can stay grounded in evidence.",
          "Standard Realmz landlook records are read-only in this pass. Scenario custom landlook data and Data Solids are the intended writable surfaces where Providence has a typed command path and export support."
        ],
        points: [
          "Passable/solid describes runtime movement, not whether the art visually looks open.",
          "Runtime path is separate from road/path-looking art.",
          "Shore, water, boat required, fly/float required, blocks LOS, forest type, movement sound/time, clear tile, and combat build are tile behavior metadata.",
          "Use diagnostics before release to find missing special icon art, missing Data Solids, unknown tile metadata, suspicious path-like solid tiles, and incomplete combat expansion data."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Large buildings, towers, and landmarks are often negative special land icons. Look under Paint Palette > Special / Icons > Structures.",
          "Browser imports need the scenario files plus resource-fork sidecars when Mac resources hold special land art.",
          "A blank dungeon tile may be the walkable clear tile, so erasing a dungeon cell is not the same concept as deleting a map record.",
          "Encoded secret/passable markers are overlays. They should not hide the tile art underneath.",
          "If a palette tile renders as fallback grass, verify whether the map value is a landlook tile, special/icon value, raw used value, or missing resource-backed icon."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Map overlay stack",
        caption: "Reserved for a screenshot showing triggers, map records, and random rectangles on a land map."
      },
      {
        title: "Land layout edge travel",
        caption: "Reserved for a screenshot showing the 8 by 16 layout grid, selected cell, raw stored value, and N/S/E/W neighbor preview."
      },
      {
        title: "Random rectangle priority",
        caption: "Reserved for a screenshot showing slots 19 down to 0, overlap warnings, chance out of 10,000, and Extra AP door fields."
      },
      {
        title: "Map record editor",
        caption: "Reserved for a screenshot showing a map-record start, PICT ID, markers, display rectangle, decoded source evidence, and related map overlay."
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
      MARKDOWN_REFERENCES.scriptsV2,
      MARKDOWN_REFERENCES.actionPointEvidence,
      MARKDOWN_REFERENCES.opcodeEdcdEvidence,
      MARKDOWN_REFERENCES.scriptRuntimeEvidence,
      MARKDOWN_REFERENCES.globalMacroEvidence
    ],
    relatedTopicIds: ["maps", "encounters-targets", "text", "combat", "economy", "scenario", "linter-release", "compatibility-terms"],
    sections: [
      {
        title: "What Scripts Owns",
        paragraphs: [
          "Scripts is Providence's Action Point hub. It owns map and dungeon Action Points, reusable Extra Action Points, Global Event hooks, quest-flag usage, opcode settings, target links, and the source evidence needed to understand how Realmz will execute a selected step.",
          "The workbench borrows a modern visual-scripting shape, but it does not compile a new runtime. Every authored step still becomes Realmz CODE, ID, and sometimes Data EDCD rows that Classic already understands."
        ],
        cards: [
          {
            title: "Action Points",
            body: "Fixed map or dungeon trigger records stored in Data DD/Data DDD. They have a map cell, percent chance, goto fields, and eight script slots.",
            facts: ["map-owned", "fixed record"]
          },
          {
            title: "Extra Action Points",
            body: "Reusable script rows stored in Data ED3. Realmz calls them from GOSUBs, branches, random rectangles, battle macros, monster death hooks, timed gates, global hooks, and door items.",
            facts: ["reusable", "Data ED3"]
          },
          {
            title: "EDCD Settings",
            body: "Five-short Data EDCD rows used by many opcodes for targets, ranges, branch modes, sounds, messages, or mutation settings.",
            facts: ["5 shorts", "typed fields"]
          }
        ]
      },
      {
        title: "Divinity Crosswalk",
        paragraphs: [
          "Divinity treats Action Points as the scenario behavior hub because they connect maps, encounters, battles, treasures, shops, text, sounds, pictures, quest flags, random areas, and macro/GOSUB flow. Providence keeps that hub model, but adds source-backed diagnostics and typed target pickers.",
          "Divinity's scripting code chapters are available directly in the selected-step help. Providence pairs that manual text with Realmz source anchors so authors can see whether a value is a direct ID, an Extra Action Point target, or an EDCD row."
        ],
        points: [
          "Action Points/GOSUBs map to the Scripts workbench inventory, eight-step editor, flow preview, and Clear/Reuse controls.",
          "Scripting Codes 1-127 map to the Action catalog, selected opcode help card, target picker, and Settings section.",
          "Macros/Quests map to Extra Action Points, Global Events, quest usage summaries, and branch/action diagnostics.",
          "Random Rectangles, battles, monster death actions, timed encounters, and door items can all call Extra Action Points; those incoming paths affect whether imported Data ED3 rows are shown as callable."
        ],
        callout: {
          tone: "info",
          title: "Providence names the storage without making authors live there",
          body: "Data DD, Data DDD, Data ED3, and Data EDCD remain visible in Technical Details, but normal authoring labels should say Action Point, Extra Action Point, Global Event, Step, Target, and Settings."
        }
      },
      {
        title: "Record Model",
        paragraphs: [
          "Action Point, dungeon Action Point, and Extra Action Point records all share Realmz's fixed 40-byte door/script record shape. The eight CODE values and eight ID values are the script steps. Clearing one of these records should make a slot reusable; it should not silently compact fixed Realmz files.",
          "Data EDCD is separate sidecar storage. When an opcode uses EDCD, the step ID is usually the EDCD row number and the real author-facing targets live inside the Settings fields."
        ],
        cards: [
          {
            title: "Data DD / Data DDD",
            body: "Map and dungeon Action Point records tied to coordinates and percent chance.",
            facts: ["source"]
          },
          {
            title: "Data ED3",
            body: "Extra Action Point rows. Callable rows are promoted when source-backed incoming links prove Realmz can reach them.",
            facts: ["source", "macro"]
          },
          {
            title: "Data EDCD",
            body: "Five signed shorts per settings row. The selected opcode determines how those five values should be labeled.",
            facts: ["settings"]
          }
        ]
      },
      {
        title: "Imported ED3 Triage",
        paragraphs: [
          "Imported Data ED3 rows are preserved exactly, but not every occupied row is a callable authoring macro. Realmz scenarios can contain fixed-row padding, old editor leftovers, runtime-cache residue, and authored-looking rows whose caller has not been proven yet.",
          "Providence separates those rows in Unlinked Extra APs so authors can decide what to keep, promote, duplicate, or ignore without losing source bytes."
        ],
        points: [
          "Likely Padding means an empty or fixed-shape row that looks like editor/storage slack rather than script behavior.",
          "Runtime Residue means the row resembles state mutated during play or generated runtime storage more than authored scenario logic.",
          "Orphan Authored means the row has a small authored-looking script body, but Providence has not found an incoming GOSUB, hook, random rectangle, battle, monster, or item path.",
          "Needs Trace means the row has enough content that it should be checked against Realmz runtime behavior before it is treated as disposable or promoted to normal authoring.",
          "The selected-row ED3 details show incoming reference count, root type, occupied steps, raw signature, and the rule Providence used for the classification."
        ],
        callout: {
          tone: "warning",
          title: "Unlinked does not mean safe to delete",
          body: "A row can be source-preserved and still lack a decoded caller. Use the ED3 filters to triage, then duplicate or promote rows only after checking the surrounding scenario behavior."
        }
      },
      {
        title: "Authoring Workflow",
        points: [
          "Choose the right tab: Action Points for map-cell scripts, Extra Action Points for reusable behavior, Global Events for scenario hooks, Quests for flag usage, and Unlinked Extra APs for preserved imported rows without proven callers.",
          "Filter the inventory before editing. Current Map is fastest while map authoring; Warnings is best before release; Reusable shows empty fixed slots that can be repurposed safely.",
          "Create or select an Action Point, then edit its map cell, chance, and goto fields only when those fields are meaningful for map triggers.",
          "Choose a step, pick an action, inspect the Divinity help, set a target or Settings fields, then Apply Step. Dirty step changes are draft-only until applied.",
          "Use Target Details when a direct target has an inline editor. Use Settings when an opcode's target and branch fields live in EDCD."
        ]
      },
      {
        title: "CODE, ID, and EDCD",
        paragraphs: [
          "A Realmz step is small but dense: CODE says what to do, ID either points directly at a target or selects an EDCD row, and EDCD optionally supplies five additional signed-short settings. The same number can mean very different things depending on the opcode.",
          "Providence therefore keeps the raw numbers visible but encourages guided editing. The selected action definition, target picker, Settings labels, and diagnostics are all derived from the opcode/EDCD crosswalk."
        ],
        points: [
          "Direct-target opcodes use ID as the target record number, such as a message, sound, picture, battle, shop, encounter, treasure, monster, or Extra Action Point.",
          "EDCD-backed opcodes use ID as a settings-row pointer. Missing targets inside EDCD should be fixed in Settings, not by changing the raw ID blindly.",
          "Opcode 39 directly runs an Extra Action Point. Opcode 8 copies an Action Point from the current map. They are intentionally not the same authoring operation.",
          "Dispatcher no-op or Not Used codes are preserved and labeled, but they should not be treated as active unknown behavior unless evidence says Realmz executes them."
        ]
      },
      {
        title: "Flow, Branches, and Runtime State",
        paragraphs: [
          "Flow Preview is a quick map of branch and call behavior. It is not a full interpreter, but it helps authors catch obvious GOSUB, branch, battle macro, choice, and Extra Action Point paths before opening deeper technical details.",
          "Some opcodes mutate runtime state: shop caches, encounter options, random rectangles, action point chance, party flags, quests, tiles, and battle state. Those are real Realmz behaviors, but they affect active play state, not necessarily the scenario source file being edited."
        ],
        points: [
          "Positive and negative values can have different meanings. Examples include one-shot vs repeat random rectangles, signed battle macro behavior, negative sound sequencing, and branch/backstep sentinels.",
          "Global Events are source-backed hooks such as new game, party death, quit/end game, before shop, and before temple. Start hook row 0 means no startup macro, so smoke-test macros should use a nonzero Extra Action Point row.",
          "Other Global slots remain preserved evidence until a source-backed consumer is known.",
          "Unlinked Extra APs are preserved imported script rows. Duplicate or promote them into authored behavior before relying on them as callable scenario logic."
        ],
        callout: {
          tone: "warning",
          title: "Runtime cache edits are not scenario source edits",
          body: "When an opcode changes shops, encounters, random areas, or trigger state during play, Realmz may be changing generated runtime data. Linter and Export should keep that distinction visible."
        }
      },
      {
        title: "Targets and Diagnostics",
        points: [
          "Target pickers resolve messages, sounds, pictures, encounters, shops, treasure, maps, monsters, quest flags, and macros where decoded targets exist.",
          "Create Target buttons build safe source-backed shells for common Realmz record families, but unsupported imported byte ranges are still preserved until Providence owns them.",
          "Slot diagnostics distinguish missing targets, missing EDCD rows, writer-gated target families, dispatcher no-ops, and preserve-only imported behavior.",
          "Technical Details shows raw storage, record index, door ID, CODE/ID, EDCD row, edit state, incoming links, and outgoing links for forensic checks."
        ]
      },
      {
        title: "Clear, Duplicate, and Reuse",
        paragraphs: [
          "Realmz script files are fixed-record structures. In Providence, Clear Action Point means 'make this fixed slot empty/reusable' rather than 'delete and shift everything after it.' That protects source references from silently changing IDs.",
          "Duplicating a script is the safer way to fork behavior. Use duplicate before experimenting with imported Action Points or Extra Action Points that are already targeted by encounters, battles, monsters, random regions, or global hooks."
        ],
        points: [
          "Clear Step affects only the selected one of eight CODE/ID slots.",
          "Clear Action Point clears the selected map trigger record and leaves the fixed slot reusable.",
          "Delete Extra Action Point clears/removes the reusable macro row through the safe command path for that row type.",
          "Moving a map Action Point changes its map/cell ownership without rewriting unrelated scripts."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not treat an EDCD row number as the final target when the Settings section names actual message, battle, shop, item, or branch fields.",
          "Do not assume every imported Data ED3 row is callable. Check its classification and incoming links first.",
          "Do not clear a script just to hide a warning unless you have checked who calls it.",
          "Do not ignore sign-sensitive fields. Realmz often uses negative values as behavior flags, branch modes, one-shot/repeat switches, or alternate target forms.",
          "Do not edit runtime-cache records as though they were authored source; export should write source-backed scenario files and preserve/pass through the rest."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Script step detail",
        caption: "Selected Action Point slot with CODE, ID, Divinity help, target picker, EDCD Settings, diagnostics, and Apply Step."
      },
      {
        title: "Action Point flow",
        caption: "Flow Preview and Technical Details showing branch, GOSUB, Extra Action Point, and target links."
      }
    ]
  },
  {
    id: "encounters-targets",
    groupId: "authoring",
    label: "Encounters",
    title: "Simple, Complex, Rogue, and Timed Encounters",
    summary: "Author Realmz encounter source records while keeping prompts, action rows, runtime cache behavior, thief hooks, timed gates, and linked targets visible.",
    tags: ["encounter", "simple encounter", "complex encounter", "rogue encounter", "timed encounter", "Data ED", "Data ED2", "Data TD2", "Data TD3", "CE", "CE2"],
    badges: ["branching", "source-backed"],
    references: [
      DIVINITY_CHAPTERS.simpleEncounter,
      DIVINITY_CHAPTERS.complexEncounter,
      MARKDOWN_REFERENCES.encounterEvidence,
      MARKDOWN_REFERENCES.thiefTimedEvidence,
      MARKDOWN_REFERENCES.scriptsV2
    ],
    relatedTopicIds: ["scripts", "text", "combat", "economy", "rules", "linter-release"],
    sections: [
      {
        title: "What Encounters Owns",
        paragraphs: [
          "Encounters is the Providence workbench for four Realmz source record families: Simple Encounters, Complex Encounters, Rogue/Thief Encounters, and Timed Encounters.",
          "Simple and complex encounters are Divinity's main branch-dialog systems. Rogue encounters model lock, trap, search, and thief-skill interactions. Timed encounters schedule macro-style actions when date, chance, location, item, and quest requirements pass."
        ],
        cards: [
          {
            title: "Simple Encounters",
            body: "Data ED source records with four visible choices, prompt message, back-out behavior, attempt counts, inline choice text, and four result action rows.",
            facts: ["Data ED", "4 choices"]
          },
          {
            title: "Complex Encounters",
            body: "Data ED2 source records with spell, item, thief, typed-word, and action-picker branches feeding four result action rows.",
            facts: ["Data ED2", "branch tests"]
          },
          {
            title: "Rogue Encounters",
            body: "Data TD2 source records for thief/rogue actions, locks, traps, success/failure text and sounds, trap damage, trap spells, and tumblers.",
            facts: ["Data TD2", "118 bytes"]
          },
          {
            title: "Timed Encounters",
            body: "Data TD3 source records that trigger a macro/door when day, chance, location, item, and quest conditions match.",
            facts: ["Data TD3", "40 bytes"]
          }
        ]
      },
      {
        title: "Source Records vs Runtime Cache",
        paragraphs: [
          "Realmz copies encounter source files into runtime caches when a new game starts. Player actions and scripts can then mutate those runtime caches without rewriting the scenario source files.",
          "Providence edits the scenario source records. Runtime cache names appear in diagnostics and evidence so authors understand why an encounter can behave differently after play begins."
        ],
        points: [
          "Data ED is the source file for simple encounters; runtime uses CE.",
          "Data ED2 is the source file for complex encounters; runtime uses CE2.",
          "Data TD2 is the source file for rogue/thief encounters; runtime uses CT and saved games may persist related state differently.",
          "Data TD3 is the source file for timed encounters; runtime uses CTD3 and updates next-day/chance state during play.",
          "Runtime mutation opcodes should be read as effects on active play state, not as static edits to the scenario source record."
        ],
        callout: {
          tone: "info",
          title: "Author the source, inspect the cache",
          body: "When you edit Encounters in Providence, you are changing the scenario's starting source data. A party already inside a saved game may keep runtime encounter state that has already mutated."
        }
      },
      {
        title: "Authoring Workflow",
        paragraphs: [
          "Build encounters from the outside inward. First create or pick the prompt message, then decide which branch paths the player can take, then map each branch to a result number, and finally fill the result action columns.",
          "This mirrors Divinity's editor model: encounter screens describe player-facing choices and tests, while the result columns are compact script-like CODE/ID rows."
        ],
        points: [
          "Create central Data SD2 messages in Text before wiring prompt, success, and failure fields.",
          "Use the target picker for items, spells, rogue encounters, sounds, and Extra Action Points whenever Providence can resolve them.",
          "Keep result numbers simple while prototyping: Result 1 can be success, Result 2 failure, Result 3 alternate, and Result 4 rare or cleanup.",
          "After changing branches, inspect related links so scripts, random rectangles, battles, treasures, and shops still point at the intended records.",
          "Run Linter before export; unresolved encounter targets are often invisible until the player takes that branch."
        ],
        callout: {
          tone: "info",
          title: "Think in two layers",
          body: "Encounter fields decide which result number is chosen. Result columns decide what Realmz actually does after that choice succeeds."
        }
      },
      {
        title: "Simple Encounter Editor",
        paragraphs: [
          "Simple encounters present up to four choices. Each choice has display text and a result mapping; a result selects one of four action rows that then execute Realmz CODE/ID script slots.",
          "The prompt points at a central Data SD2 message. The inline choice buffers are part of the encounter source record and have classic byte limits."
        ],
        points: [
          "Zero choice result means eliminated or unavailable.",
          "Can Back Out controls whether the encounter offers a cancel/back-out path.",
          "Max Times and Caste Success are source-backed fields whose exact Divinity labels still need final confirmation.",
          "Four result action rows share the same CODE/ID action-slot model used by Scripts.",
          "Simple encounter source records are 426 bytes in the current source-backed model; imported tail evidence is preserved where needed."
        ]
      },
      {
        title: "Result Numbers and Action Columns",
        paragraphs: [
          "Simple and complex encounters both end by selecting a result number. Providence shows four result columns because Realmz stores four compact action-column targets for each encounter.",
          "Each result column contains ordered CODE/ID rows. These rows use the same action vocabulary as Scripts, but they are stored inside the encounter record rather than as a separate Action Point."
        ],
        points: [
          "Result 1 runs the first column; Result 2 runs the second column; Result 3 and Result 4 do the same for their columns.",
          "Result 0 usually means no branch result or an unavailable path.",
          "A result column can show text, play sounds, start battles, grant treasure, call shops, branch to scripts, or do any other supported CODE/ID action.",
          "Use Scripts when the behavior needs a longer reusable macro, GOSUB flow, or stateful logic that does not fit cleanly in the encounter's compact columns.",
          "Clearing an encounter should be done carefully because scripts and complex encounters can still target its numeric record ID."
        ]
      },
      {
        title: "Complex Encounter Editor",
        paragraphs: [
          "Complex encounters are not just four generic choices. Realmz supports several independent paths: spell/scroll, item, thief, typed word, and action-picker groups.",
          "Each successful path maps into one of the four result action rows, then Realmz executes that action row like a compact script door."
        ],
        points: [
          "Spell tests accept exact packed spell IDs or spell class IDs below 7.",
          "Item tests match used item IDs from the item library.",
          "The thief path links to a Data TD2 Rogue Encounter. That Rogue Encounter returns result numbers into the Complex Encounter result columns.",
          "The word path compares typed player text against the encounter's word buffer.",
          "Action-picker tests use eight group flags plus the action result.",
          "Complex encounter source records are 520 bytes across current corpus evidence."
        ],
        callout: {
          tone: "warning",
          title: "Complex branch labels matter",
          body: "Older generic labels can hide what Realmz actually tests. Prefer spell, item, thief, word, and group-action language when interpreting or documenting complex encounter fields."
        }
      },
      {
        title: "Complex Branch Test Reference",
        paragraphs: [
          "The complex editor is easiest to read as five branch families that all feed the same four result columns. A matching family chooses a result number; the selected result column then runs.",
          "Providence labels these branch families explicitly so older generic imported labels do not hide the runtime test being authored."
        ],
        cards: [
          {
            title: "Spell / Scroll",
            body: "Tests packed Realmz spell IDs or low spell-class values. Matching rows return the paired result number.",
            facts: ["10 rows", "spell target"]
          },
          {
            title: "Item",
            body: "Tests Realmz item IDs from Economy or the reference item library. Matching rows return the paired result number.",
            facts: ["5 rows", "item target"]
          },
          {
            title: "Thief",
            body: "Links to a Rogue Encounter. The Rogue Encounter owns the lock/trap action checks and returns success or failure result codes.",
            facts: ["Data TD2", "result codes"]
          },
          {
            title: "Word",
            body: "Compares typed player text against the word buffer, then returns the word result.",
            facts: ["typed text", "result"]
          },
          {
            title: "Action Picker",
            body: "Uses action labels and group flags to decide whether the chosen encounter-bar action is valid and which result column runs.",
            facts: ["8 labels", "group flags"]
          }
        ]
      },
      {
        title: "Rogue Encounter Editor",
        paragraphs: [
          "Rogue encounters represent thief-skill scenes: locks, traps, detecting, disarming, searching, success/failure messages, sounds, trap damage, and optional trap spells.",
          "Runtime can mutate rogue encounter state as traps are detected, disarmed, sprung, or disabled. Providence should keep source values and runtime evidence clearly separated."
        ],
        points: [
          "Type flags decide which thief actions are available.",
          "Modifiers adjust the skill roll for each action.",
          "Success and failure codes return branch results to the complex encounter flow.",
          "Open Lock spell chance and Disarm Trap spell chance are separate support fields shown beside the rows they use.",
          "Success/failure text IDs should resolve to Data SD2 messages when nonzero.",
          "Success/failure sound IDs should resolve to sound resources when nonzero.",
          "Trap damage should validate low <= high when both values are present."
        ]
      },
      {
        title: "Rogue Authoring Checklist",
        paragraphs: [
          "A Rogue Encounter should describe both what the rogue can attempt and what Realmz does after each attempt. The action rows enable the attempts; the success/failure columns return result codes, messages, and sounds.",
          "Trap and lock fields are source-backed setup. Runtime can still update the play-state copy as the party detects, disarms, springs, or bypasses the encounter."
        ],
        points: [
          "Enable only the rogue actions that should appear or be tested for this scene.",
          "Use % Mod to tune difficulty relative to the party's thief skill.",
          "Use success and failure result codes to return to the expected complex encounter result columns.",
          "For Open Lock spell tests, set % Chance / Level to Open in Trap / Lock Setup.",
          "For Disarm Trap spell tests, set % Chance / Level to Disarm Trap in Trap / Lock Setup.",
          "Confirm the linked Complex Encounter result rows visibly do something, such as showing a message, branching, giving a reward, or exiting.",
          "Resolve success/failure text fields to Data SD2 messages so the player sees useful feedback.",
          "Use trap damage, trap spell, power level, and knock/disarm percentage fields together; avoid changing reserved fields unless matching known Divinity behavior."
        ]
      },
      {
        title: "Timed Encounter Editor",
        paragraphs: [
          "Timed encounters scan during play and can execute a macro/door when schedule and requirements match. They are useful for delayed events, recurring events, quest clocks, and location-sensitive story beats.",
          "The clean 40-byte source record makes timed encounters one of the safest encounter families to explain: day, increment, percent chance, door, optional level/rectangle/X/Y gates, item requirement, quest requirement, and extra fields."
        ],
        points: [
          "Day is the runtime trigger day; zero terminates the runtime scan.",
          "Increment advances the next trigger check after a timed encounter is considered.",
          "Percent gates whether the event executes.",
          "Door points at the macro/action door Realmz runs when all checks pass.",
          "Location gates can require land, dungeon, level, random rectangle, X, and Y.",
          "Item and quest requirements should resolve through Economy and Scripts/quest labels."
        ]
      },
      {
        title: "Timed Gate Checklist",
        paragraphs: [
          "Timed encounters are compact but easy to overconstrain. If any gate fails, the Extra Action Point target does not run, so it helps to build them one gate at a time.",
          "Use the schedule fields first, then add chance, item, quest, and location gates only when the event already works in a simpler form."
        ],
        points: [
          "Day decides when the runtime scan begins considering the record.",
          "Increment controls the next check cadence after the event is considered.",
          "Percent gates execution after schedule and requirements are checked.",
          "Extra AP To Activate should point at the reusable Action Point or macro that performs the real event.",
          "Position Required can be Any, Land, or Dungeon; level, rectangle, X, and Y narrow that location gate.",
          "Reserved extra fields should remain preserved unless the Divinity manual or fixture evidence identifies their meaning for the scenario."
        ]
      },
      {
        title: "Targets and Cross-Links",
        paragraphs: [
          "Encounters sit in the middle of Providence's authoring graph. They reference messages, items, spells, rogue encounters, sounds, quest flags, maps, random rectangles, battles, treasure, shops, and script action rows.",
          "The safest workflow is to create the target record first or use a picker that can create the missing target, then return to the encounter and verify the link."
        ],
        points: [
          "Use Text for prompt and result messages.",
          "Use Economy for item IDs, treasure rewards, and shop targets.",
          "Use Combat for battles and monster-related branches.",
          "Use Rules for packed spell IDs and spell-class tests.",
          "Use Scripts when an encounter result row needs deeper CODE/ID behavior."
        ]
      },
      {
        title: "Preservation Rule",
        paragraphs: [
          "Imported encounter data can contain runtime-era oddities, tail bytes, or fields whose Divinity labels are still being verified. Providence should keep unsupported bytes visible and preserved instead of pretending every byte is understood."
        ],
        callout: {
          tone: "success",
          title: "Providence writes only what it owns",
          body: "Imported records keep their original raw bytes unless the user edits that record. When a record is edited, unsupported bytes are preserved wherever the writer can do so safely."
        }
      }
    ],
    visualSlots: [
      {
        title: "Encounter branch model",
        caption: "Reserved for a screenshot showing a complex encounter prompt, spell/item/thief/word/group branches, and the four result action rows."
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
      MARKDOWN_REFERENCES.resourceAuthoringEvidence,
      MARKDOWN_REFERENCES.resourceTaxonomyEvidence,
      MARKDOWN_REFERENCES.resourceIconEvidence,
      MARKDOWN_REFERENCES.scenarioMusicEvidence,
      MARKDOWN_REFERENCES.formatIntegration
    ],
    relatedTopicIds: ["maps", "scripts", "text", "records-evidence", "linter-release", "compatibility-terms"],
    sections: [
      {
        title: "What Assets Owns",
        paragraphs: [
          "The Assets workbench is Providence's resource-fork surface. It covers scenario media that can ship with the scenario, read-only Realmz library resources that the runtime already knows about, Divinity reference art used for comparison, and the advanced inventory of raw imported resource-fork entries.",
          "Use it when an author needs to answer four questions: where did this media come from, does it export with the scenario, which Realmz resource ID does it use, and what records or scripts refer to it?"
        ],
        callout: {
          tone: "info",
          title: "Export scope comes first",
          body: "A resource can be previewable without being scenario-owned. Reference assets help Providence render maps, monsters, icons, and pickers, but they are not copied into export unless they are explicitly imported or already scenario-supplied."
        }
      },
      {
        title: "Divinity Crosswalk",
        paragraphs: [
          "Divinity split resource authoring across Adding Monster & Item Icons, Creating Special Land Tiles, Adding Pictures & Sounds, Text Import/Export, and the Standard Land Tile Editor. Providence keeps those workflows in one workbench but labels each resource by type, origin, export scope, preview status, and usage.",
          "This is especially important because Realmz lookup rules can resolve through the scenario resource fork or shared Realmz libraries. Providence should not make a library fallback look like authored scenario data."
        ],
        cards: [
          { title: "Scenario Assets", body: "Project-owned pictures, sounds, icons, text, and special land tiles that Providence can package with the scenario.", facts: ["exports"] },
          { title: "Reference Libraries", body: "Realmz built-ins used for previews, map painting, monster icons, and script target context. These stay read-only.", facts: ["reference-only"] },
          { title: "Divinity Reference", body: "Editor/manual/UI resources used as evidence or comparison material. Hide UI reference art from normal authoring unless it is a valid runtime target.", facts: ["evidence"] },
          { title: "Advanced Inventory", body: "The decoded resource-fork ledger for PICT, cicn, snd, TEXT, STR#, styl, RLMZ, vers, and compatibility baggage.", facts: ["diagnostic"] }
        ]
      },
      {
        title: "Resource Ownership Model",
        paragraphs: [
          "The most important Assets question is not whether something can be previewed. It is whether Realmz will find that resource from the scenario folder, from the built-in Realmz application resources, or not at all.",
          "Providence therefore shows export scope separately from preview status. A resource can be previewable but read-only, scenario-owned but unsupported for preview, or missing but still referenced by an imported record."
        ],
        cards: [
          {
            title: "Ships With Scenario",
            body: "Scenario-supplied or Providence-authored resources that should be written into the exported scenario when the writer supports that resource family.",
            facts: ["export"]
          },
          {
            title: "Realmz Built-In",
            body: "Reference resources that the Realmz application already supplies. They power previews and pickers but should not be copied into the scenario.",
            facts: ["fallback"]
          },
          {
            title: "Divinity / UI Reference",
            body: "Manual/editor evidence and interface art. Useful for parity work, but not normal player-facing scenario media.",
            facts: ["evidence"]
          },
          {
            title: "Unknown Advanced",
            body: "Raw resource-fork data whose export role is not proven. Preserve it unless a writer path and runtime purpose are known.",
            facts: ["inspect"]
          }
        ],
        callout: {
          tone: "warning",
          title: "Do not promote previews into source",
          body: "Seeing a library picture, icon, sound, or text resource in Assets does not mean the scenario owns it. Import or author a scenario asset when you need the exported scenario to carry that media."
        }
      },
      {
        title: "Import and Conversion Workflow",
        paragraphs: [
          "Asset import converts modern source files into Realmz-ready resources. The import dialog shows the original source beside the converted output so authors can catch scaling, transparency, palette, and audio conversion problems before committing the asset.",
          "The same image can have very different meaning depending on the target: a large scene becomes a PICT picture, a 32 x 32 sprite becomes a cicn icon, and a map overlay becomes a special land tile."
        ],
        points: [
          "Choose Import As first: Scenario Picture/PICT, Icon/cicn, Special Land Tile/cicn, or Sound/snd.",
          "Use Fit, Crop, or Stretch only for fixed-size 32 x 32 targets; pictures keep their picture dimensions.",
          "Use Crisp Pixels for pixel art, icons, and tiles; use Smooth for source art that benefits from interpolation.",
          "Keep transparent pixels for cicn overlays when the underlying map tile should remain visible.",
          "Use Floyd-Steinberg dithering mainly for larger pictures; small icons and special tiles often read better without dither.",
          "After import, verify resource ID, export scope, preview status, and Used By links before release."
        ]
      },
      {
        title: "Pictures, Sounds, and Music",
        paragraphs: [
          "Imported pictures are converted into Realmz-ready PICT resources. Divinity-style scenario picture IDs live in the 30000 through 30128 range, and 30128 is the title picture used by the scenario startup flow.",
          "Imported sound effects become custom scenario snd resources in the supported custom sound range. Scenario music is a separate preservation surface: files such as Custom 1 Music are module files, not short snd sound effects, and should remain byte-preserved until Providence has a dedicated music authoring path."
        ],
        points: [
          "Use the import dialog preview to compare original source media with the Realmz-ready output before committing it as a scenario asset.",
          "Use usage links to jump from a picture or sound resource to scripts, startup fields, strings, or encounter records that refer to it.",
          "Treat zero-byte Format files and legacy Custom N files as compatibility baggage unless newer source evidence proves they should be editable."
        ]
      },
      {
        title: "Icons and Special Land Tiles",
        paragraphs: [
          "Monster and item icons are cicn resources. Some are standard Realmz library assets, while scenario-local cicn resources may be required for custom monsters, maps, and negative tile overlays.",
          "Special Land Tiles are 32 x 32 cicn-backed negative tile values. Realmz draws the current landlook base tile first, then overlays the normalized cicn icon, so Providence must preserve the raw map field value while showing the resolved icon art."
        ],
        points: [
          "Raw negative values such as -91 and encoded values such as -1091 can preview the same normalized icon while still round-tripping different field values.",
          "Scenario-local special/icon tiles should show as Ships With Scenario when they were imported from the scenario resource fork or authored in Providence.",
          "Reference-only special tiles can be selected as paint targets only when Realmz would already know that resource at runtime."
        ]
      },
      {
        title: "Special Land Tile Authoring",
        paragraphs: [
          "Special Land Tiles are map-paintable cicn overlays addressed by negative tile values. They are not standard landlook atlas tiles, and they are not the same thing as a large PICT picture.",
          "Realmz draws the current landlook base tile first, then overlays the transparent cicn art. That means a good special tile usually needs transparent pixels around the object or marker."
        ],
        points: [
          "Use Special Land Tile import for 32 x 32 map overlays such as buildings, doors, markers, props, or custom terrain decals.",
          "Keep transparency when the base land tile should show through.",
          "Select for painting sends the negative tile/resource ID to Maps; Maps still writes an ordinary map field value.",
          "Raw negative values like -91 and encoded thousand-band values like -1091 can preview the same normalized icon but must round-trip their original field values.",
          "Use Data Solids / special tile solidity in Maps when a special tile needs movement blocking behavior.",
          "If an imported scenario references a negative tile whose cicn is missing, treat it as a map rendering and release warning, not as harmless missing decoration."
        ],
        callout: {
          tone: "info",
          title: "Transparent overlay, not white tile",
          body: "Realmz special tiles are usually transparent overlays. If a marker or building appears on a solid square, inspect the source alpha/matte settings before assuming the map tile is wrong."
        }
      },
      {
        title: "Resource ID Discipline",
        points: [
          "Editor-only names help authors work, but only real Realmz fields and resource IDs are exported.",
          "Use target pickers for picture and sound actions so resource IDs are checked against project and library assets.",
          "Resolve ID conflicts before release so Realmz finds the intended scenario resource or fallback.",
          "Do not rewrite metadata-only or malformed raw resources just because they appear in Advanced Inventory; they may be compatibility evidence."
        ]
      },
      {
        title: "Preview and Diagnostic Status",
        paragraphs: [
          "Every resource should either preview, play, decode, or explain why it is metadata-only, unsupported, malformed, or missing a fallback. The preview filters are intentionally diagnostic, not cosmetic.",
          "Missing fallback warnings mean a Realmz record refers to something Providence could not find in scenario or library resources. Those are release risks when the missing resource is used by maps, monsters, scripts, startup pictures, or sound actions."
        ],
        cards: [
          { title: "Previewable", body: "A picture, icon, tile, or text resource decoded into a usable preview.", facts: ["safe to inspect"] },
          { title: "Playable", body: "A sound resource decoded into browser/desktop playable audio.", facts: ["snd"] },
          { title: "Info Only", body: "A known resource type or compatibility marker that is intentionally not rendered.", facts: ["preserve"] },
          { title: "Cannot Preview", body: "A known type with an unsupported variant. Preserve unless the author replaces it.", facts: ["unsupported"] },
          { title: "Missing", body: "A referenced scenario or library resource could not be resolved.", facts: ["release risk"] }
        ]
      },
      {
        title: "Advanced Inventory and Raw Forks",
        paragraphs: [
          "Advanced Inventory is the low-level resource-fork ledger. It is where Providence exposes resource types, decoded resource records, runtime caches, render profiles, malformed entries, and preview diagnostics without pretending every resource is authorable.",
          "Use this view when a linter warning mentions a resource type, when a preview is missing, or when an imported scenario contains compatibility baggage that should be preserved but not edited."
        ],
        points: [
          "PICT resources are pictures and tile-atlas source art.",
          "cicn resources are icons, monster/item art, and special land overlays.",
          "snd resources are classic sound effects, not module music files.",
          "TEXT, STR#, and styl resources are external/readable text and style data; central Data SD2 messages live in Text.",
          "RLMZ and vers resources are metadata or compatibility records unless a source-backed writer proves otherwise.",
          "Malformed resources should stay visible and preserved; do not delete or rewrite them simply because they cannot preview."
        ]
      },
      {
        title: "Asset Release Checklist",
        paragraphs: [
          "Before exporting, Assets should answer whether every used resource is present, previewable or explainable, correctly scoped, and in the expected Realmz ID range.",
          "This is especially important for desktop parity: Realmz Classic resolves resources by classic resource type and numeric ID, not by Providence filenames or labels."
        ],
        points: [
          "Filter to Missing and Problem statuses in Assets and fix any used resources.",
          "Check Used By links before deleting or renumbering scenario-owned assets.",
          "Verify title picture ID 30128 and custom picture/sound ranges when editing startup media.",
          "Verify scenario-local monster, item, and special-land cicns are marked Ships With Scenario.",
          "Open Linter and Export after asset changes; resource gaps and fallback-only warnings should be reviewed before release.",
          "Smoke desktop import/export when changing resource-fork behavior, because browser previews can hide platform-specific resource packaging issues."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Asset preview strip",
        caption: "Reserved for a screenshot showing project assets, reference assets, preview status badges, export-scope badges, and usage links."
      },
      {
        title: "Special tile rendering",
        caption: "Reserved for a screenshot showing a negative special/icon tile previewed as base terrain plus transparent cicn overlay."
      }
    ]
  },
  {
    id: "text",
    groupId: "authoring",
    label: "Text",
    title: "Scenario Text and Message Records",
    summary: "Work with scenario strings, option labels, TEXT and STR# resources, and text-linked script targets.",
    tags: ["text", "messages", "option labels", "Data SD2", "Data OD", "TEXT", "STR#", "spell check"],
    badges: ["authoring", "resource-aware"],
    references: [DIVINITY_CHAPTERS.text, MARKDOWN_REFERENCES.textEvidence, MARKDOWN_REFERENCES.scriptsV2, MARKDOWN_REFERENCES.resourceAuthoringEvidence],
    relatedTopicIds: ["scripts", "encounters-targets", "assets", "combat", "economy"],
    sections: [
      {
        title: "What Text Owns",
        paragraphs: [
          "Text is the Providence workbench for the central Realmz message pool, two-choice option labels, and readable text resources. It is the author-facing version of Divinity's Strings editor plus the text import/export spell-check workflow.",
          "Most other tools point back here. Scripts, battles, encounters, map records, treasure/shop flows, and notes can reference Data SD2 messages, so a text edit can affect many visible parts of a scenario."
        ],
        cards: [
          {
            title: "Scenario Strings",
            body: "Data SD2 is a dense table of 256-byte Str255 message records. These are the text boxes used by scripts, battles, encounters, random regions, and many Realmz prompts.",
            facts: ["Data SD2", "255 bytes"]
          },
          {
            title: "Option Labels",
            body: "Data OD stores compact two-choice labels. Realmz prefers these labels for player-option dialogs when Data OD is present.",
            facts: ["Data OD", "24 bytes"]
          },
          {
            title: "Reference Strings",
            body: "TEXT, STR#, and styl resources are searchable reference material from resource forks. They are not the same thing as authored Data SD2 messages.",
            facts: ["TEXT", "STR#", "styl"]
          }
        ]
      },
      {
        title: "Divinity Crosswalk",
        paragraphs: [
          "Divinity's Strings screen has previous/next navigation, Go To No., a String field, a character count, Find First/Next Occurrence, Export Text, Import Text, and maximum-length search. Providence mirrors that workflow while showing usage links and byte-accurate Realmz validation.",
          "The Divinity screen also shows a Sound field. Providence stores that assignment in the scenario support data while keeping visible string text in Data SD2. A negative string sound value is preserved as legacy sign data; it is not a separate sound asset."
        ],
        callout: {
          tone: "info",
          title: "Sound sign behavior",
          body: "For Action Point Play Sound, negative values are classic Realmz/Divinity wait-for-completion values. For String sounds, Providence preserves the sign without claiming proven wait behavior. Preview availability stays separate from whether the sound ID is valid to reference."
        }
      },
      {
        title: "Scenario Strings",
        paragraphs: [
          "Providence authors one scenario string at a time so edits remain easy to review and undo. The list and navigator make it possible to jump by ID, search by content, duplicate a useful string, clear stale text, or create the next open string slot.",
          "Classic Realmz strings are byte-limited rather than character-limited. Non-ASCII characters and line endings can consume or lose bytes differently than modern text, so Providence shows the encoded byte count before export."
        ],
        points: [
          "Use Used By links before changing a string that already appears in scripts, battles, encounters, maps, or other records.",
          "Use Duplicate when creating a variant so the original references remain intact.",
          "Use Clear when preserving the string slot matters but the text should become blank.",
          "Strings over 255 bytes are blocked from export because Data SD2 records are fixed 256-byte Pascal strings.",
          "Unsupported Classic characters are flagged before export because they may become question marks."
        ]
      },
      {
        title: "Option Labels",
        paragraphs: [
          "Option Labels authors the short two-choice labels used by player-option dialogs. Realmz reads Data OD in fixed 25-byte slots and uses the first visible character as the keyboard shortcut.",
          "If Data OD is absent, Realmz can fall back to Data SD2 for option text. Providence keeps the Data OD editor separate so authors can see which compact labels are source-backed and which script rows use them."
        ],
        points: [
          "Keep labels short and direct; the export limit is 24 text bytes plus the Pascal length byte.",
          "Watch duplicate shortcut warnings when two labels begin with the same visible character.",
          "Use Used By links to find player-option script parameters before renaming a label.",
          "Create and duplicate labels only when a two-choice script row needs a new compact label."
        ]
      },
      {
        title: "Import, Export, and References",
        paragraphs: [
          "Export Text writes every Data SD2 string to a plain text file using Divinity-style separators. This makes spell-checking practical without changing the scenario until the cleaned file is imported back.",
          "Import Text expects the same separator structure and refuses files with the wrong number of string segments. That prevents accidentally shifting every string ID after a bad edit."
        ],
        points: [
          "Run Find Long String after import to review strings at the length limit and strings with unsupported characters.",
          "Search Reference Strings when you need readable TEXT, STR#, or styl resource-fork evidence.",
          "Do not paste resource-fork text into Data SD2 blindly; resource text may be documentation, metadata, UI reference material, or a different runtime string family.",
          "Use Assets for resource ownership and export-scope questions; use Text for authoring Data SD2 and Data OD records."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not renumber or delete a string just to reorganize prose; other records store numeric message IDs.",
          "Do not assume an unused string is safe to remove if it might be reached by an unknown or preserved script path.",
          "Do not confuse Data ED/Data ED2 inline encounter display buffers with central Data SD2 message records.",
          "Do not treat TEXT or STR# resources as editable Data SD2 strings unless a writer path explicitly imports or converts them.",
          "Do not treat positive and negative sound values as different sounds; the sign stores field-specific behavior or legacy compatibility data."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Strings workflow",
        caption: "Reserved for a screenshot showing the string navigator, byte-count validation, Used By links, export/import actions, and reference string panel."
      },
      {
        title: "Option label workflow",
        caption: "Reserved for a screenshot showing Data OD labels, shortcut warnings, and script usage links."
      }
    ]
  },
  {
    id: "combat",
    groupId: "authoring",
    label: "Combat",
    title: "Battles, Monsters, and Combat Libraries",
    summary: "Author battle grids, scenario monster sets, and reusable monster templates while keeping Realmz Data BD/Data MD semantics, icon resolution, and library reference material visible.",
    tags: ["combat", "battle", "monster", "Data BD", "Data MD", "Data MD1", "Data MD-1", "Monster Scrapbook", "Monster Library", "cicn"],
    badges: ["writer-backed", "icon-aware"],
    references: [
      DIVINITY_CHAPTERS.battle,
      DIVINITY_CHAPTERS.monster,
      DIVINITY_CHAPTERS.icons,
      MARKDOWN_REFERENCES.battleEvidence,
      MARKDOWN_REFERENCES.monsterEvidence,
      MARKDOWN_REFERENCES.divinityParity
    ],
    relatedTopicIds: ["scripts", "encounters-targets", "assets", "records-evidence", "compatibility-terms"],
    sections: [
      {
        title: "What Combat Owns",
        paragraphs: [
          "Combat is the Providence workbench for scenario battle records, scenario monster sets, protected built-in Monster Scrapbook templates, editable Providence monster-library entries, and monster icon reference material.",
          "Realmz keeps battle setup and monster templates in separate source files. Battles place monsters by ID; Normal, Monster, and Mega monster sets define the stats, icon, attacks, spells, loot, flags, and death behavior used when combat builds a runtime monster."
        ],
        cards: [
          {
            title: "Battle Editor",
            body: "Authors Data BD records with a 13 x 13 signed monster grid, combat distance, before/after string links, and battle macro field.",
            facts: ["Data BD", "346 bytes"]
          },
          {
            title: "Monster Editor",
            body: "Authors scenario monster records across Normal, Monster, and Mega runtime sets with identity, icon, combat stats, behavior, attacks, spells, loot, saves, conditions, bestiary visibility, and death macro links.",
            facts: ["Data MD", "Data MD1", "Data MD-1", "210 bytes"]
          },
          {
            title: "Library Tabs",
            body: "Built-in Monster Scrapbook material remains protected reference data. Providence monster-library entries are editable workspace templates that must be copied into Scenario Monsters before runtime use.",
            facts: ["protected built-ins", "workspace library"]
          }
        ]
      },
      {
        title: "Battle Editor",
        paragraphs: [
          "A battle grid cell stores a signed monster ID. Zero is empty, the absolute value points at a scenario monster ID, and a negative value flips the side/friendly state after Realmz loads the monster.",
          "The grid is 13 x 13 because that is the source-backed Realmz battle record shape. Providence can preview the grid against Normal, Monster, or Mega monster sets, but the saved value remains the signed short Realmz expects."
        ],
        points: [
          "Distance controls runtime initial spread. Realmz randomizes setup from this value, so imported zero-distance records should be reviewed rather than silently normalized.",
          "Before String and After String target Data SD2 string records.",
          "Battle Action points at Extra Action Point / macro behavior used by combat-round logic. Runtime evidence is sign-sensitive, so diagnostics and source evidence should stay visible.",
          "Create and Duplicate preserve the dense battle record model; Clear Battle resets supported fields while keeping the record slot reusable."
        ],
        callout: {
          tone: "warning",
          title: "Negative monster IDs are meaningful",
          body: "A negative battle-grid value is not an invalid monster. It is Realmz's compact side/friendly toggle for the same monster ID."
        }
      },
      {
        title: "Monster Editor",
        paragraphs: [
          "Scenario monsters are runtime templates. Normal writes Data MD, Monster writes Data MD1, and Mega writes Data MD-1. Realmz chooses the active table globally through its monster-set setting, then copies the selected template into mutable combat state.",
          "Providence edits writer-backed source template fields for the selected set, keeps Data DES descriptions shared by monster ID, and keeps advanced arrays visible where exact Realmz behavior matters."
        ],
        points: [
          "Identity fields include display name, name ID, icon ID, bestiary visibility, and defeat/death action.",
          "Combat Stats covers stamina template values, armor, agility, movement, magic resistance, hit requirements, experience, and spell points.",
          "Behavior covers side, size, distance, attack counts, spell-cast chance, run/surrender chance, missile chance, summon eligibility, and weapon selection.",
          "Attacks are five Realmz attack rows. Spells, money, items, saves, immunities, and conditions remain fixed-width arrays because the source file stores them that way.",
          "Copy Current To All Sets performs an exact record copy across Normal, Monster, and Mega. Generate Variants is a Providence-safe generator, not an exact clone of Divinity's lossy Create Sets behavior.",
          "Hide From Bestiary is source-backed. Data MENU is generated/effective menu evidence, not source identity; Providence omits it on export so Realmz rebuilds it from Data MD."
        ]
      },
      {
        title: "Monster Icons",
        paragraphs: [
          "Monster icon IDs resolve through cicn resources. Providence prefers project-local decoded scenario icons, then imported asset catalog entries, then bundled Realmz actor/creature reference art when the ID is known to be built into Realmz.",
          "Scenario-local monster icons can be high-numbered cicn resources, especially in imported third-party scenarios. Those must be decoded into the project so desktop Battles and Monsters can preview the same art Realmz uses."
        ],
        points: [
          "A blank preview means the monster record still has an icon ID, but Providence cannot currently resolve usable art for that ID.",
          "Monster Mash is useful icon reference material, but it is not automatically a scenario-owned asset.",
          "Actor and creature library icons are built into Realmz and can be shown as reference-only previews.",
          "Project-local cicn previews should win over reference libraries when a scenario provides its own icon with the same ID."
        ],
        callout: {
          tone: "info",
          title: "Desktop parity matters here",
          body: "Combat art should be verified in the desktop path because project-local cicn decoding, library fallbacks, and file URLs differ from the browser preview path."
        }
      },
      {
        title: "Monster Library",
        paragraphs: [
          "Monster Library combines protected built-in Monster Scrapbook records with editable Providence workspace entries, overrides, and variants. Built-ins can be inspected, customized through an override, restored to their protected default, or copied forward, but they cannot be overwritten in place.",
          "Monster Mash remains resource reference material rather than an editable scenario monster record."
        ],
        points: [
          "Use built-ins as design reference, customize them into the Providence library for editing, or copy any library entry into Scenario Monsters before using it in battles or scripts.",
          "Library copies can create Normal only, exact records in all monster sets, or Normal plus Providence-generated Monster/Mega variants.",
          "Use Monster Mash and Reference Libraries to understand icon IDs, but import or decode scenario-owned cicn resources when a scenario needs custom art.",
          "Scenario Monsters are the runtime/export layer. Providence monster-library entries are not exported as scenario data unless copied into Scenario Monsters."
        ]
      },
      {
        title: "Script and Encounter Links",
        paragraphs: [
          "Combat records are frequent script targets. Action Points can start battles, spawn monsters, add allies, branch to battle macros, or run monster death macros.",
          "The safe authoring pattern is to create or choose the target from the picker, then use semantic links and linter diagnostics to confirm messages, battles, monsters, and macros resolve."
        ],
        points: [
          "Battle target pickers create Data BD records when needed.",
          "Monster target links should resolve to shared Scenario Monster IDs, not generated menu positions.",
          "Death Action / defeat action fields should be treated as macro targets rather than anonymous numbers when the link can be resolved.",
          "Before/after battle messages should resolve to editable Text records before export."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not remap scenario-local monster icon IDs to nearby built-in icons just because the preview is blank. Fix the icon resource import or catalog first.",
          "Do not treat Monster Scrapbook as the current scenario's monster file. Scenario monsters come from Data MD, Data MD1, and Data MD-1.",
          "Do not treat Data MENU as source identity or export source. Realmz can rebuild bestiary menu evidence from active Data MD records.",
          "Large monster art can cover multiple battle grid cells. Providence derives an approximate footprint from the icon dimensions when available.",
          "Clearing a battle or monster record should keep fixed record-file constraints in mind, because scripts and encounters may still target that ID."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Combat editor overview",
        caption: "Reserved for a screenshot showing the battle grid, monster picker, monster icon preview, and source-backed target fields."
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
    relatedTopicIds: ["combat", "encounters-targets", "assets", "divinity-parity"],
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
    id: "rules",
    groupId: "authoring",
    label: "Rules",
    title: "Spells, Races, Castes, and Scenario Overrides",
    summary: "Browse shared Realmz rules data and author the scenario-local spell, race, and caste overrides that Realmz actually loads for third-party scenarios.",
    tags: ["rules", "spells", "races", "castes", "Data Spell", "Data Race", "Data Caste", "Data S", "override", "packed spell ID"],
    badges: ["override-aware", "source-backed"],
    references: [
      DIVINITY_CHAPTERS.spell,
      DIVINITY_CHAPTERS.race,
      DIVINITY_CHAPTERS.caste,
      MARKDOWN_REFERENCES.rulesEvidence,
      MARKDOWN_REFERENCES.divinityParity
    ],
    relatedTopicIds: ["scripts", "encounters-targets", "combat", "economy", "assets", "compatibility-terms"],
    sections: [
      {
        title: "What Rules Owns",
        paragraphs: [
          "Rules is the Providence workbench for spell records, race definitions, and caste definitions. These are not ordinary one-off scenario lists: Realmz starts with shared built-in rules data, then applies scenario-local overrides when a scenario supplies the matching data files.",
          "Providence makes that split explicit. Built-in rules are safe reference material. Scenario overrides are writable project data and export with the scenario."
        ],
        cards: [
          {
            title: "Spell Editor",
            body: "Browses the shared Data S spell catalogs and authors scenario Data Spell custom spell records. Only the Custom spell class is scenario-local.",
            facts: ["Data S", "Data Spell"]
          },
          {
            title: "Race Editor",
            body: "Browses shared race data and creates scenario Data Race overrides for the selected race when an author changes a field.",
            facts: ["30 records", "408 bytes each"]
          },
          {
            title: "Caste Editor",
            body: "Browses shared caste data and creates scenario Data Caste overrides for class rules, spellcasting, starting items, progression, and item usability.",
            facts: ["30 records", "576 bytes each"]
          }
        ]
      },
      {
        title: "Shared Data vs Scenario Overrides",
        paragraphs: [
          "Realmz loads built-in rules from shared data files, then checks whether the selected scenario provides override files. A scenario can therefore change a race, caste, or custom spell without rewriting the whole Realmz installation.",
          "That is why Providence does not edit built-in rules in place. Editing a shared race or caste creates a scenario-specific override for that record. Clearing the override returns the scenario to the shared Realmz definition."
        ],
        points: [
          "Shared spells come from Data S; scenario custom spells come from Data Spell.",
          "Shared races come from Data Race; third-party scenarios can provide scenario-local Data Race overrides.",
          "Shared castes come from Data Caste; third-party scenarios can provide scenario-local Data Caste overrides.",
          "Race and caste override files are fixed 30-record tables, so Providence preserves unknown spacer bytes while editing known fields.",
          "Custom spell names are tied to STR# 5000 through 5006 resources when scenario Data Spell packaging is present."
        ],
        callout: {
          tone: "info",
          title: "Built-in does not mean editable",
          body: "A built-in spell, race, or caste is a reference source. Use Copy/Create/Customize to create the scenario-owned override before expecting the change to export."
        }
      },
      {
        title: "Override Authoring Workflow",
        paragraphs: [
          "Use Rules as a compare-and-copy tool first. Inspect the shared Realmz definition, decide whether the scenario needs a local difference, then create the override only for the records that should actually diverge.",
          "Once an override exists, the edited row is scenario-owned and dirty like any other project record. Undo/redo, save, export, and validation should treat it as Providence-authored scenario data."
        ],
        points: [
          "For spells, copy a built-in spell into the matching Custom class slot or create an empty Custom spell slot before editing fields.",
          "For races, Customize In This Scenario creates the matching Data Race row and keeps the remaining 30-record table source-backed.",
          "For castes, Customize In This Scenario creates the matching Data Caste row for class, spellcasting, progression, item use, and starting equipment edits.",
          "Clear Scenario Custom should be used deliberately; it removes the scenario override and restores the shared Realmz behavior for that ID.",
          "After changing a rule, check the tools that reference it instead of assuming the change is isolated."
        ],
        cards: [
          {
            title: "Writable",
            body: "Scenario Data Spell custom records, scenario Data Race overrides, and scenario Data Caste overrides.",
            facts: ["exported", "undoable"]
          },
          {
            title: "Reference",
            body: "Shared Realmz Data S, Data Race, and Data Caste records shown as library/copy sources.",
            facts: ["not mutated"]
          },
          {
            title: "Preserved",
            body: "Unknown spacer bytes, Data Spell packaging tail, and resource-fork evidence that Providence can roundtrip but does not fully explain yet.",
            facts: ["roundtrip first"]
          }
        ]
      },
      {
        title: "Spell IDs and Custom Spells",
        paragraphs: [
          "Realmz encodes spells as packed IDs. Providence shows those IDs because scripts, encounters, items, castes, and combat behavior can all reference spells by the packed value.",
          "The visible pattern is class, level, and slot. For example, class 1 level 1 slot 1 is 1101. The scenario-custom spell catalog is class 5 in the visible ID pattern, so custom spells appear as 5101 through 5715."
        ],
        points: [
          "Spell classes are Sorcerer, Priest, Enchanter, Special, and Custom.",
          "Each class has seven spell levels.",
          "Providence exposes twelve currently browsed slots per level in the Rules UI while preserving source-backed custom spell records.",
          "Copying a built-in spell to a custom slot creates a scenario-local Data Spell override; it does not mutate the shared spell catalog.",
          "Availability, targeting, range, damage, duration, sounds, and animation fields are source-backed 30-byte spell-record fields."
        ]
      },
      {
        title: "Spell Field Checklist",
        paragraphs: [
          "The Divinity Spell Editor exposed compact numeric spell behavior. Providence keeps the same record shape visible while adding previews for icon, sound, and queue fields where the reference libraries can resolve them.",
          "A spell is not just damage. Realmz combines target type, size, rotate behavior, combat/camp availability, resistance rules, SP cost, visual effect, sounds, and the special/effect handler to decide what happens at runtime."
        ],
        points: [
          "Casting Context controls whether the spell can be used in combat, camp/adventure mode, or both.",
          "Target Type, Spell Size, Fixed Target Count, and Can Rotate define the target shape and target selection rules.",
          "Math fields include range, hit bonus, save/DRV adjustment, resistance class, SP cost, spell class, and damage type.",
          "Damage And Duration separates fixed values from power-scaled values.",
          "Presentation connects cast/resolution animations, Fastplot queue art, sound resources, and the special effect handler.",
          "Custom spell names use STR# 5000 through 5006 when Data Spell resource packaging is present; descriptions remain less certain and should be treated as editor notes."
        ]
      },
      {
        title: "Race Authoring",
        paragraphs: [
          "Race overrides affect character creation, aging, movement, magic resistance, regeneration, caste eligibility, item usability, portrait sets, descriptors, and condition thresholds.",
          "Race names currently use shared labels or editor-authored display labels; the binary race record itself is mostly numeric behavior data."
        ],
        points: [
          "Possible Castes controls which castes the race may choose.",
          "Usable Items controls broad item category permissions for that race.",
          "Age Parameters cover maximum age, age bands, and stat changes by age group.",
          "Combat and DRV modifiers affect to-hit and resistance families.",
          "Changing a built-in race creates a scenario Data Race override for that race ID."
        ]
      },
      {
        title: "Caste Authoring",
        paragraphs: [
          "Caste overrides define class-like rules: stat limits, movement, magic resistance, combat progression, victory point table, spellcasting access, starting money/items, default icon, item usability, and condition progression.",
          "Several matrices still use source-backed labels rather than perfect Divinity wording. Providence keeps them grouped by behavior so authors can work safely while the archaeology continues."
        ],
        points: [
          "Spellcasting rows describe which spell catalogs the caste can use, plus start and maximum levels.",
          "Victory Points stores the level progression table.",
          "Initial Items And Gold controls newly created characters of that caste.",
          "Usable Items controls broad item category permissions for that caste.",
          "Changing a built-in caste creates a scenario Data Caste override for that caste ID."
        ]
      },
      {
        title: "Cross-Tool Dependencies",
        paragraphs: [
          "Rules records are small, but their effects spread across the whole scenario. A race/caste edit can change whether a party can be created, whether an item can be used, which spells appear in the spell picker, and whether encounters or scripts point at valid IDs.",
          "Before release-testing a scenario with custom rules, use this checklist to catch the most common mismatches."
        ],
        points: [
          "Scenario restrictions: banned races and banned castes should still allow at least one viable party path.",
          "Economy items: exact race/caste restrictions, item category permissions, and descriptors/class restrictions should agree with the new rule data.",
          "Scripts and Encounters: spell tests can reference exact packed spell IDs, while some fields intentionally accept spell-class IDs.",
          "Combat monsters and treasures: spell/item references should still resolve after custom spell and caste edits.",
          "Text and Assets: visible names, portraits, caste icons, spell icons, and spell sounds should match the behavior changes authors are making."
        ],
        callout: {
          tone: "warning",
          title: "Rules changes are global",
          body: "A one-field race or caste edit can invalidate unrelated-looking content. Run Linter after larger rules edits and inspect the dependent tools before exporting."
        }
      },
      {
        title: "Preservation and Unknowns",
        paragraphs: [
          "Providence is intentionally strict about byte ownership here. Source-backed fields are editable; unknown spacer bytes and undecoded packaging evidence are preserved rather than guessed.",
          "The current Rules UI follows Realmz source anchors and Divinity manual/editor evidence, but a few labels are still source-backed approximations rather than final Divinity wording."
        ],
        points: [
          "Data Spell owns 105 custom spell records; its extra tail/resource packaging is preserved while name packaging evidence continues to be mapped.",
          "Data Race override files are 30 x 408-byte tables; unknown spacer bytes remain intact when known fields are edited.",
          "Data Caste override files are 30 x 576-byte tables; progression, victory, spellcasting, starting items, item use, and combat fields are source-backed.",
          "Race and caste names are safest as editor-authored display labels unless a scenario/resource storage path is proven for that package.",
          "When a label seems vague, prefer the field help and evidence references over renaming the field casually."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not expect a built-in rule edit to export until a scenario override exists.",
          "Do not confuse the Custom spell class with the shared Special spell class.",
          "Do not delete a race or caste override casually; existing party creation, item usability, and script assumptions may rely on it.",
          "Do not treat every numeric matrix as fully Divinity-labeled yet. The record offsets are source-backed, but some names/order details remain under review.",
          "When changing race/caste item permissions, cross-check Economy item families and Scenario party restrictions."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Rules override model",
        caption: "Reserved for a screenshot showing shared Realmz rules data beside scenario custom spell, race, and caste overrides."
      }
    ]
  },
  {
    id: "economy",
    groupId: "authoring",
    label: "Economy",
    title: "Treasure, Items, Shops, and Item Libraries",
    summary: "Author rewards and shops with source-backed item pickers while keeping built-in item families, scenario custom items, and library assets clearly separated.",
    tags: ["economy", "treasure", "items", "shops", "Data TD", "Data SD", "Data NI", "Data ID", "Bag of Holding", "Vault of Arcana"],
    badges: ["writer-backed", "item-aware"],
    references: [
      DIVINITY_CHAPTERS.treasure,
      DIVINITY_CHAPTERS.item,
      DIVINITY_CHAPTERS.shop,
      MARKDOWN_REFERENCES.economyEvidence,
      MARKDOWN_REFERENCES.divinityParity
    ],
    relatedTopicIds: ["scripts", "encounters-targets", "combat", "assets", "compatibility-terms"],
    sections: [
      {
        title: "What Economy Owns",
        paragraphs: [
          "Economy is the Providence workbench for scenario Treasure records, scenario Shop records, item reference browsing, scenario custom items, and read-only shared item/icon libraries.",
          "Realmz item authoring is split across shared built-in data and scenario data. Providence keeps that split visible so authors can use built-in items safely while editing only the scenario-owned records it can export."
        ],
        cards: [
          {
            title: "Treasure Editor",
            body: "Authors Data TD reward records with victory points, gold, gems, jewelry, and twenty item slots.",
            facts: ["Data TD", "20 slots"]
          },
          {
            title: "Item Editor",
            body: "Browses shared Data ID item families and scenario Data NI supply/special items. Built-in items are reference/copy sources; custom scenario items live in the 900-999 range.",
            facts: ["Data ID", "Data NI"]
          },
          {
            title: "Shop Editor",
            body: "Authors Data SD source shop records with item IDs, quantities, and inflation. Runtime shop stock can mutate separately in cache data.",
            facts: ["Data SD", "source stock"]
          }
        ]
      },
      {
        title: "Item Families",
        paragraphs: [
          "Realmz resolves item IDs through five 200-record families. The shared Realmz Data ID file owns built-in IDs 0-799, while a scenario's Data NI supplies IDs 800-999.",
          "Divinity's custom item authoring promise is narrower than the full item table: custom/special scenario item editing starts in the 900-999 range. Providence treats built-in items as reference data unless copied into a writable custom slot."
        ],
        points: [
          "0-199 are weapons.",
          "200-399 are armor.",
          "400-599 are accessories and related equipment.",
          "600-799 are magic items.",
          "800-999 are supplies and scenario special/custom item space.",
          "Negative item references may be meaningful in some runtime contexts, so the raw ID stays visible where relevant."
        ],
        callout: {
          tone: "info",
          title: "Reference does not mean scenario-owned",
          body: "Bag of Holding, Vault of Arcana, and bundled Realmz item libraries help authors choose IDs and inspect art, but those records do not become exported scenario assets unless copied or authored through a scenario-backed path."
        }
      },
      {
        title: "Treasure Editor",
        paragraphs: [
          "Treasure records are fixed reward bundles that scripts, encounters, battles, random events, and map behavior can reference.",
          "A treasure can mix fixed rewards with up to twenty item IDs. Providence uses the same item picker categories as the Item Editor so rewards can be built from known Realmz families instead of raw numbers."
        ],
        points: [
          "Victory Points are advancement reward values.",
          "Gold, Gems, and Jewelry are direct party rewards.",
          "Treasure Items are twenty ordered slots; zero means empty.",
          "Use the item browser to fill the next open slot quickly, or edit a slot directly when preserving an imported raw ID.",
          "Opcode 65 random item rewards can build temporary treasure from an item range without reading a Data TD record."
        ]
      },
      {
        title: "Shop Editor",
        paragraphs: [
          "Shop records are source shop definitions: item IDs, quantities, and inflation. Realmz can copy that source stock into runtime shop cache data, and player actions or scripts can mutate the runtime stock later.",
          "Providence edits the scenario source record. That is the right place for authoring what a new game or fresh shop state should contain."
        ],
        points: [
          "Inflation changes prices for that shop.",
          "Item IDs resolve through the same item family model used by treasure and item pickers.",
          "Quantities describe source stock amounts; zero quantity usually means the item should not appear as stocked.",
          "Restricted-shop script flows can gate which party or item contexts reach a shop, but the stock record still lives here."
        ],
        callout: {
          tone: "warning",
          title: "Source stock is not saved-game stock",
          body: "Parties already inside a saved game may keep mutated runtime shop inventory. Exported Data SD controls the scenario source record."
        }
      },
      {
        title: "Custom Items",
        paragraphs: [
          "The Item Editor can copy a built-in item into the next available custom slot, then edit scenario-backed fields for the custom item.",
          "Scenario item fields remain numeric where Divinity/Realmz labels are still being verified, but the editor groups them by identity, equipping, damage, restrictions, and special behavior so authors do not have to read a raw 100-byte record."
        ],
        points: [
          "Custom item slots use item IDs 900-999.",
          "Negative cost marks a unique item in Realmz evidence.",
          "Door-like items can call Extra Action Points through special fields, so item edits can affect Scripts as well as Economy.",
          "Use Used By links to find treasure, shop, and script references before changing an existing item ID."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not edit a built-in item and expect it to export as scenario data. Copy it into a custom slot first.",
          "Do not confuse Data SD source shop records with runtime shop cache stock.",
          "Do not erase unknown imported item IDs just because the current library cannot name them; preserve raw IDs until the source is understood.",
          "Do not assume an item icon preview means the item itself is scenario-owned. The art may come from a reference library.",
          "Treasure and shop item pickers should prefer known item families, but raw numeric entry remains necessary for compatibility."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Economy workbench overview",
        caption: "Reserved for a screenshot showing Treasure rewards, item picker categories, custom item detail, and shop source stock."
      }
    ]
  },
  {
    id: "records-evidence",
    groupId: "authoring",
    label: "Technical Records",
    title: "Records and Technical Details",
    summary: "Use decoded records, byte ranges, source groups, semantic links, and writer-status evidence to understand what Providence can safely edit or preserve.",
    tags: ["records", "technical details", "source", "runtime cache", "byte ownership", "semantic links", "writer gates", "Divinity"],
    badges: ["verified", "audit", "source-backed"],
    references: [
      MARKDOWN_REFERENCES.formatIntegration,
      MARKDOWN_REFERENCES.coreRecordEvidence,
      MARKDOWN_REFERENCES.byteOwnership,
      MARKDOWN_REFERENCES.completenessTruth,
      MARKDOWN_REFERENCES.fixedRecordWriterGates,
      MARKDOWN_REFERENCES.runtimeCacheEvidence
    ],
    relatedTopicIds: ["projects", "maps", "scripts", "assets", "linter-release", "compatibility-terms", "troubleshooting"],
    sections: [
      {
        title: "What Records Owns",
        paragraphs: [
          "Records is Providence's audit workbench. It is where imported scenario files, decoded fixed records, semantic entities, byte ranges, links, reverse links, and preservation boundaries become inspectable.",
          "The goal is not to make authors edit raw bytes. The goal is to explain why a Maps, Scripts, Combat, Economy, Rules, Text, Assets, or Scenario field is editable, read-only, preserved, runtime-only, or still waiting for writer proof."
        ],
        cards: [
          {
            title: "Record Catalog",
            body: "The dense list of decoded records from the current semantic schema, including labels, source files, byte ranges, summaries, and links.",
            facts: ["inspect"]
          },
          {
            title: "Source Groups",
            body: "A per-file grouping of records by origin and fixed-record layout, useful for understanding Data MD, Data BD, Data ED3, Data SD2, resource forks, and runtime caches.",
            facts: ["source"]
          },
          {
            title: "Semantic Inspector",
            body: "The selected record's details, outgoing links, incoming links, diagnostics, edit state, and target relationships.",
            facts: ["links"]
          }
        ]
      },
      {
        title: "Divinity Crosswalk",
        paragraphs: [
          "Divinity presents separate editors for maps, Action Points, monsters, battles, treasure, shops, encounters, text, pictures, sounds, spells, races, castes, and release checks. Records is the bridge underneath those screens: it shows the Realmz containers and fixed-record shapes those editors write.",
          "Use Records when a Divinity-facing field is unclear, when a picker points at the wrong target, when a missing-resource warning needs evidence, or when you need to know whether an imported value is source-authored or generated during play."
        ],
        points: [
          "Maps and Map Records connect to Data LD, Data DL, Data RD, Data RDD, Data MD2, mapstats, Data Solids, and Action Point records.",
          "Scripts connect to Data DD, Data DDD, Data ED3, Data EDCD, Global, and any target records a step references.",
          "Combat connects to Data BD, Data MD, Data DES, Monster Scrapbook/Monster Mash reference data, and battle/monster macro links.",
          "Economy connects to Data TD, Data SD, Data NI, shared Data ID item families, runtime shop cache evidence, and item icon resources.",
          "Assets connect to Scenario resource forks, PICT, cicn, snd, TEXT, STR#, map-name resources, and reference-library fallbacks."
        ]
      },
      {
        title: "Source, Runtime, and Resource Containers",
        paragraphs: [
          "Realmz scenario packages mix authored source files, generated runtime caches, resource containers, compatibility files, and distribution baggage. Records keeps these categories visible so export decisions do not blur together.",
          "A source-backed record can become an authoring surface when Providence has parser and writer proof. A runtime cache can be useful evidence but should not become an export target. A resource container may be fully understood as a fork while individual payload codecs still vary."
        ],
        cards: [
          {
            title: "Authored Source",
            body: "Files such as maps, Action Points, encounters, monsters, battles, messages, treasures, shops, rules overrides, and scenario shell data.",
            facts: ["editable when owned"]
          },
          {
            title: "Runtime Cache",
            body: "Generated or mutated play-state data such as encounter/shop/cache families. Useful evidence, not normal authoring source.",
            facts: ["inspect only"]
          },
          {
            title: "Resource Container",
            body: "Mac/Windows resource forks and extracted resources that may hold pictures, sounds, icons, text, map names, and compatibility payloads.",
            facts: ["resource fork"]
          }
        ],
        callout: {
          tone: "warning",
          title: "Do not fix source bugs by editing caches",
          body: "If a runtime cache looks wrong, find the source record that creates or mutates it. Export should write source-backed scenario data and preserve/pass through generated state unless a specific workflow owns it."
        }
      },
      {
        title: "Byte Ranges and Writer Gates",
        paragraphs: [
          "Byte ranges are the reason Providence can be conservative without being blind. A record can be partially decoded, fully writer-backed, mixed writable/preserved, resource-backed, or read-only until a writer gate proves exact export behavior.",
          "Fixed-record files are especially sensitive. Clearing a record usually means writing an empty/default record in place; it does not mean shrinking the file or shifting later IDs."
        ],
        points: [
          "Decoded-writable ranges have parser/writer ownership and may be changed by a typed command.",
          "Mixed writable/preserved records expose supported fields while retaining unsupported imported bytes.",
          "Preserved-known data is understood enough to keep, but not necessarily to edit.",
          "Preserved-unknown data remains visible so releases do not silently discard bytes.",
          "Fixture-backed writer gates prove that edits mutate only owned bytes and preserve the rest."
        ],
        callout: {
          tone: "success",
          title: "No-edit roundtrip is the baseline",
          body: "Records should help explain why importing and exporting without edits preserves bytes. A new editor becomes safer when its Records evidence shows exactly which bytes it owns."
        }
      },
      {
        title: "Links and Reverse Links",
        paragraphs: [
          "The most useful Records feature is often not the raw file name; it is the link graph. Links explain who points at a message, picture, sound, battle, shop, treasure, monster, map, Action Point, Extra Action Point, quest, or resource.",
          "Reverse links are especially important before deleting, clearing, renaming, or renumbering anything. Realmz stores numeric IDs everywhere, and a visually small change can affect scripts, encounters, maps, combat, text, or assets."
        ],
        points: [
          "Outgoing links show what the selected record references.",
          "Incoming links show what other records depend on the selected record.",
          "Missing target links become linter diagnostics when the target family should resolve.",
          "Link chips are navigation, not editing; use the destination tool when changing the target record."
        ]
      },
      {
        title: "How To Use Records",
        points: [
          "Start with the source group strip to identify which file family you are looking at and whether it has fixed record bytes.",
          "Open a record row when you need byte range, source, type, summary, or link context for a specific decoded entity.",
          "Use the Semantic Inspector to inspect links, diagnostics, edit state, and provenance before changing the same entity in a domain tool.",
          "When Linter reports a missing target or export boundary, open the linked record and inspect both outgoing and incoming links.",
          "When a domain tool looks wrong, Records can tell whether the problem is parser data, source-vs-cache confusion, missing resources, or incomplete writer support."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not treat every decoded record as editable. Some records are evidence until writer support is ready.",
          "Do not confuse identical file abbreviations across contexts, such as scenario source data and runtime cache data.",
          "Do not renumber records casually; scripts and other fixed records store numeric target IDs.",
          "Do not assume a missing preview is an art problem before checking the record links and resource source.",
          "Do not hide unknown data just because it is not pleasant to look at. Visible unknowns are what keep Providence honest."
        ]
      },
      {
        title: "Records and Release Confidence",
        paragraphs: [
          "Records is not the final release gate; Linter and Export are. But Records is the place to investigate why a gate exists. It gives the raw source, byte ownership, and semantic-link evidence behind the author-facing warning.",
          "A healthy Records pass before release means the risky records are understood, linked, and either writer-backed or intentionally preserved."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Record catalog and source groups",
        caption: "Source group strip plus decoded record rows showing source file, record type, byte range, summary, and link chips."
      },
      {
        title: "Semantic inspector",
        caption: "Selected record details with incoming/outgoing links, edit state, diagnostics, and provenance."
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
    references: [
      DIVINITY_CHAPTERS.release,
      MARKDOWN_REFERENCES.releaseChecklist,
      MARKDOWN_REFERENCES.runtimeCacheEvidence,
      MARKDOWN_REFERENCES.byteRoundtripLedger,
      MARKDOWN_REFERENCES.scenarioShellEvidence,
      MARKDOWN_REFERENCES.oracleHarness
    ],
    relatedTopicIds: ["projects", "scenario", "assets", "scripts", "troubleshooting"],
    sections: [
      {
        title: "What Linter and Export Own",
        paragraphs: [
          "Linter and Export are Providence's release-safety tools. Linter explains whether the project still has missing targets, unresolved resources, unsupported edits, source/runtime-cache confusion, or compatibility risks. Export writes the chosen Realmz folder target and reports exactly what was written, preserved, blocked, or warned.",
          "Divinity's Release Checklist becomes a living workflow here: validate the author-owned data, export into the target package shape, inspect the report, then run desktop and optional Realmz Classic smoke checks when confidence matters."
        ],
        cards: [
          {
            title: "Project Linter",
            body: "Groups validation issues, semantic coverage, resource coverage, export boundaries, unresolved links, and source-vs-runtime-cache diagnostics.",
            facts: ["pre-export"]
          },
          {
            title: "Export",
            body: "Writes a Portable Providence, Mac Classic, or Windows Realmz folder and reports files, resources, pass-through data, blocked assets, and target compatibility notes.",
            facts: ["writer gate"]
          },
          {
            title: "Oracle Harness",
            body: "Optional deeper lane that stages exports into Realmz Classic and records startup/gameplay evidence.",
            facts: ["optional"]
          }
        ]
      },
      {
        title: "Divinity Release Crosswalk",
        paragraphs: [
          "The Divinity manual's release mindset is simple: make sure the scenario starts, resources exist, player-facing information is correct, and classic Realmz can load the package. Providence adds source-backed diagnostics so authors can see which data is author-owned, preserved, generated, or still writer-gated.",
          "A clean release is not just a green UI. Desktop is the primary Providence platform, and public releases should use the desktop gate plus a manual desktop smoke pass."
        ],
        points: [
          "Check Scenario startup, contact info, party restrictions, security/registration segments, and first-start map coordinates.",
          "Check Maps, Scripts, Text, Encounters, Combat, Economy, Rules, and Assets for unresolved targets and missing resources.",
          "Confirm generated/runtime caches are not being treated as authored source data.",
          "Run export and inspect the report before testing the exported folder in Realmz.",
          "Use `npm run release:desktop-gate` before tagging or replacing public release artifacts."
        ],
        callout: {
          tone: "warning",
          title: "Desktop is the release target",
          body: "The web build is useful for iteration, but desktop parity is the public release bar. Use desktop smoke testing for image/resource previews, import/export, and any filesystem-backed workflow."
        }
      },
      {
        title: "Validation Severity",
        paragraphs: [
          "Linter output is intentionally split between blockers and warnings. A blocker means Providence does not believe the current project can be exported safely or loaded correctly. A warning means the project may still export, but a classic runtime behavior, fallback, or preservation boundary deserves review."
        ],
        cards: [
          { title: "Blocking Error", body: "A required file, target, resource, or writer-supported shape is missing or invalid. Fix before export or release.", facts: ["red"] },
          { title: "Warning", body: "A compatibility risk, fallback, pass-through file, unresolved semantic link, or read-only area needs author review.", facts: ["yellow"] },
          { title: "Info / Note", body: "Context about preserved data, generated state, target packaging, or optional checks.", facts: ["review"] }
        ]
      },
      {
        title: "Source, Runtime, and Pass-Through",
        paragraphs: [
          "Realmz builds several runtime caches from source files when a scenario starts. Providence should edit and export authored source files, not generated gameplay state. Runtime caches can still be useful evidence, but they are not normal authoring targets.",
          "Pass-through files are preserved because they belong to the package, are compatibility baggage, or have not yet become a safe typed editor surface. They should be visible in release reports instead of silently copied."
        ],
        points: [
          "Source files include land/dungeon maps, Action Points, random levels, shops, encounters, strings, battles, monsters, treasures, rules overrides, scenario shell files, and scenario resource forks.",
          "Runtime caches include families such as `CL`, `CD`, `CE`, `CE2`, `CS`, `CT`, and `CTD3` depending on context.",
          "Save/runtime files such as `Data H1` explain gameplay state and should not be exported as blank scenario source.",
          "Scenario `Data CS` is registration/security support data, not the same thing as the runtime shop cache named `CS`.",
          "Known preserve-only files such as custom music modules, `Format`, and distribution readmes should remain visible as package context."
        ]
      },
      {
        title: "Export Targets and Reports",
        paragraphs: [
          "Export target controls choose the folder shape Providence writes. Portable Providence folders are useful for internal roundtrips. Mac Classic and Windows Realmz folders are compatibility targets for actual Realmz runtimes.",
          "The export report is the release ledger for the current session: output path, target, written source files, pass-through files, resource writes, preserved resources, blocked assets, target compatibility, and warnings."
        ],
        points: [
          "Written files are writer-supported source files Providence encoded from the project model.",
          "Pass-through files are copied from the import/source snapshot without typed rewriting.",
          "Written resources are scenario-owned resource fork entries Providence can package.",
          "Preserved resources are kept intact because Providence did not need or did not yet safely own their payload.",
          "Blocked assets should be resolved before release when they are used by a runtime target."
        ]
      },
      {
        title: "Release Flow",
        paragraphs: [
          "Use this flow when preparing a scenario or a Providence release candidate. It keeps authoring checks, export checks, and desktop/runtime checks from blurring together.",
          "The optional oracle harness can round-trip exported scenarios through Realmz Classic when you need higher confidence than the normal app checks provide."
        ],
        points: [
          "Save the project.",
          "Run validation and fix blockers first.",
          "Review warnings by category instead of mass-editing unrelated records.",
          "Export the intended target folder.",
          "Read Resource Export Notes and Target Compatibility.",
          "Open the exported scenario in the target Realmz runtime when available.",
          "For public Providence artifacts, run the desktop release gate and manual desktop smoke from the release checklist."
        ],
        callout: {
          tone: "success",
          title: "No-edit roundtrip is a core guarantee",
          body: "The current audit baseline imports and immediately exports known scenario roots byte-identically when no authoring changes are made. New writer changes should preserve that standard unless an edit explicitly owns the bytes."
        }
      },
      {
        title: "Oracle and Deeper Compatibility",
        paragraphs: [
          "The oracle harness is a deeper local compatibility workflow. It can export through Providence, stage scenarios into an isolated Realmz Classic profile, select or start the scenario, collect runtime logs, capture screens, and classify source/export mismatches.",
          "Most authoring work should start with Providence validation and export reports. Reach for oracle runs when an exported scenario passes normal checks but fails to load, start, render, or behave correctly in Realmz Classic."
        ],
        callout: {
          tone: "info",
          title: "Oracle is optional",
          body: "The oracle harness launches the desktop app and Realmz Classic. Keep it as a deeper troubleshooting and compatibility lane, not the ordinary authoring path."
        }
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not ignore warnings just because export completed; target compatibility warnings can still explain missing menu entries, missing art, or runtime fallback behavior.",
          "Do not fix runtime-cache diagnostics by editing cache files first; fix the source record that Realmz copies into the cache.",
          "Do not treat reference-library assets as scenario-owned resources unless they are intentionally imported or authored.",
          "Do not release from a web-only smoke check when desktop resource loading, filesystem import/export, or bundled libraries changed.",
          "Do not assume a fresh export validates old saved games; source scenario data and saved runtime state are different lanes."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Release readiness overview",
        caption: "Reserved for a screenshot showing Linter validation groups beside semantic inspector details."
      },
      {
        title: "Export report",
        caption: "Reserved for a screenshot showing export target, written files, pass-through files, resource notes, and target compatibility."
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
    href: `#page-${page}`
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
