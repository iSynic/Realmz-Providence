import {
  DIVINITY_CHAPTERS,
  MARKDOWN_REFERENCES,
  type DocumentationCallout,
  type DocumentationCard,
  type DocumentationGroup,
  type DocumentationReference,
  type DocumentationSection,
  type DocumentationStep,
  type DocumentationTopic,
  type DocumentationToolTarget,
  type DocumentationVisualSlot
} from "./documentationContent";

export type {
  DocumentationCallout,
  DocumentationCard,
  DocumentationGroup,
  DocumentationReference,
  DocumentationSection,
  DocumentationStep,
  DocumentationTopic,
  DocumentationToolTarget,
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
    toolTargets: [{ domain: "maps", editor: "land", label: "Open Land/Dungeon Maps" }],
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
        title: "Tour The Providence Workspace",
        paragraphs: [
          "The top bar owns project-wide actions: create or open a project, import an existing scenario, save authoring state, search the project, open this manual, and start an export. The status line reports the last completed operation and any background loading still in progress.",
          "The left domain rail opens the major authoring areas. A domain can contain several tools, such as Land Editor and Dungeon Editor under Maps or Battle Editor and Monster Editor under Combat. The center workbench is the active editor; the side panels hold record lists, palettes, selection details, previews, and related links."
        ],
        points: [
          "Select a domain first, then use its tool buttons or tabs to choose the exact editor.",
          "Use lists and search fields to locate a record; selecting it loads the form or inspector without changing other records.",
          "Buttons labeled Apply commit the current form or step to the project. The project remains unsaved until the main Save action completes.",
          "Eye buttons open a preview or searchable picker without leaving the current editor.",
          "Links such as Open in Action Points change tools while preserving enough context to return to the original record."
        ]
      },
      {
        title: "Build A Testable Slice",
        steps: [
          {
            title: "Create or import the project",
            body: "Use New for a blank scenario, Open for an existing Providence project, or Import for a Realmz scenario folder. Give the project a recognizable scenario name before adding content.",
            result: "You have one saved Providence project and know whether its source is blank, generated, or imported."
          },
          {
            title: "Make one playable place",
            body: "Open Land/Dungeon Maps, choose or create a level, and build a short readable route with a clear start and destination. Keep overlays available, but inspect the player-facing terrain with them off as well.",
            result: "A party can stand somewhere intentional and move through a coherent small area."
          },
          {
            title: "Add one visible event",
            body: "Place an Action Point on the object or location that causes the event. Give it a message, sound, movement, battle, reward, map change, or another result the player can recognize.",
            result: "The first interaction has an observable success or failure path."
          },
          {
            title: "Validate the slice",
            body: "Open Linter, follow warnings back to their owning tools, and fix missing targets or resources. Save the Providence project before producing a scenario package.",
            result: "The small slice is internally linked and ready for a Realmz test."
          },
          {
            title: "Export and test in Realmz",
            body: "Choose the intended package target in Export, review what will be written or preserved, then test the resulting scenario from its configured starting location.",
            result: "You have proved the project loop before scaling the scenario."
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
          "The Further Reference drawer is there when you need classic terminology or technical background. It is not the main reading path. Start with the chapter's editor tour and task instructions, then open a reference when an imported value or compatibility warning needs more context.",
          "Classic Manual links explain how Divinity described the original concept. Technical references explain compatibility limits that affect editing or export."
        ],
        callout: {
          tone: "info",
          title: "The Providence chapter is the manual",
          body: "References add background; they do not replace the editor instructions in this manual."
        }
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not start from Technical Records unless you are investigating a specific warning or compatibility boundary.",
          "Do not treat Realmz Gallery or bundled Custom Library assets as scenario-owned data until you intentionally copy or import something into the project.",
          "Do not export as a substitute for saving the Providence project. Save is authoring state; export is Realmz output.",
          "Do not ignore warnings that point to missing visible results, missing resources, or unsupported target packaging."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Manual overview",
        caption: "The Providence application frame keeps project actions, authoring domains, the active workbench, and project status visible together.",
        imageSrc: "/manual/gallery/land-dungeon-maps.png"
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
          { title: "Imported Sources", body: "Original scenario files retained when an export target needs content that Providence does not edit directly.", facts: ["package input"] },
          { title: "Scenario Export", body: "The Realmz-readable output folder or ZIP written from current project state.", facts: ["output"] }
        ]
      },
      {
        title: "Project Controls In The Editor",
        paragraphs: [
          "New opens the blank-scenario setup and can also accept generated Scenario JSON. Open loads a saved Providence project. Import reads a Realmz scenario folder into a new project. Save updates the Providence project; it does not create a playable Realmz scenario.",
          "The current project name and save state stay visible in the application frame. Use Export only after the project is saved and the Linter reflects the current edits."
        ],
        cards: [
          { title: "New", body: "Start a blank project or create one from validated Scenario JSON.", facts: ["new project"] },
          { title: "Open", body: "Resume an existing Providence project package without re-importing its source scenario. Desktop accepts a .providence.zip package or the project.json inside an extracted project folder.", facts: ["continue work"] },
          { title: "Import", body: "Convert a Realmz scenario folder into a new Providence project and inspect the import summary.", facts: ["existing scenario"] },
          { title: "Save", body: "Persist maps, records, assets, editor metadata, and project history needed for later authoring.", facts: ["authoring state"] }
        ]
      },
      {
        title: "Setup Workflow",
        steps: [
          {
            title: "Choose the correct starting action",
            body: "Use New Project for a blank project or Scenario JSON prompt, Open for a Providence package, and Import only for a Realmz scenario source. Import is intentionally limited to an empty project.",
            result: "The project has one unambiguous source and no merged raw-scenario state."
          },
          {
            title: "Confirm the scenario identity",
            body: "Check the scenario name, project location, source snapshot status, and intended export target before editing. Rename generic or temporary projects early.",
            result: "Save and export artifacts will be easy to identify."
          },
          {
            title: "Save an authoring baseline",
            body: "Save immediately after import or generation, before risky map changes, and before comparing export behavior. In browser mode, download a Providence project ZIP when you need a portable backup.",
            result: "You can return to a known project state without relying on an exported scenario."
          },
          {
            title: "Validate before packaging",
            body: "Run Linter after substantial edits. Resolve missing links and unsupported target data before opening Export, then read package readiness rather than assuming every source file is writable.",
            result: "The chosen output path reflects current project state and the package files available for that target."
          }
        ]
      },
      {
        title: "Browser And Desktop Differences",
        paragraphs: [
          "Desktop is the release-grade environment for filesystem-heavy workflows. Browser preview is useful for fast iteration and visual review, but it has browser file-access limits.",
          "Browser export can produce Providence project ZIPs and native scenario ZIPs. Authored projects compile from canonical Providence data; imported projects still need their compatibility annex so unsupported source material can pass through unchanged."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not import a raw scenario into a project that already contains author edits.",
          "Do not confuse Save with Export.",
          "Do not open .windows.zip or .mac-classic.zip as projects. They are playable Realmz exports; Open expects .providence.zip or project.json.",
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
    toolTargets: [{ domain: "scenario", editor: "startup", label: "Open Scenario" }],
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
        title: "Inside The Scenario Editors",
        paragraphs: [
          "Open Scenario from the domain rail, then choose Startup Info, Restrictions, Contact Info, or Security. Each tool edits one scenario-wide record rather than a list of map objects. Changes here affect party entry, first load, release identity, or legacy registration behavior across the entire scenario.",
          "Startup Info selects the opening land or dungeon level and its coordinates. Restrictions controls party size, level limits, and race or caste exclusions. Contact Info stores author and release-facing metadata. Security exposes the legacy fields required by scenarios that use registration checks."
        ],
        points: [
          "Use the map picker and coordinate controls in Startup Info; verify the chosen cell in Land/Dungeon Maps before release.",
          "Treat zero or blank restriction fields according to the label shown by the editor rather than assuming every zero forbids entry.",
          "Keep title, author, version, and contact fields consistent with the exported folder and release notes.",
          "Use Scenario > Global Macros to assign Extra Action Points to Start, Death, Quit, Shop, and Temple. Open Global Macros in Action Points to edit only the scripts currently assigned there."
        ]
      },
      {
        title: "Authoring Workflow",
        steps: [
          {
            title: "Set the first playable location",
            body: "In Startup Info, choose an existing land or dungeon level and coordinates that place the party on valid terrain. Recheck this whenever maps are added, removed, or reorganized.",
            result: "Realmz can enter the scenario at a real, testable location."
          },
          {
            title: "Define entry restrictions",
            body: "In Restrictions, set party size, level, race, and caste rules deliberately. Test with an allowed party and with a party that should be refused so the gate and its message agree.",
            result: "The intended audience can enter and excluded parties receive a clear refusal."
          },
          {
            title: "Complete release identity",
            body: "Fill Contact Info and scenario metadata before a public build. Treat Security and registration fields as compatibility-sensitive legacy data rather than ordinary flavor text.",
            result: "The scenario identifies its author and carries intentional release metadata."
          },
          {
            title: "Connect global behavior",
            body: "Point only the global hooks you use at named Extra Action Points. Open each target in Action Points and verify that startup, death, quit, shop, temple, or other lifecycle behavior has a clear purpose.",
            result: "Global behavior is inspectable instead of hidden behind unexplained numeric slots."
          },
          {
            title: "Validate the shell",
            body: "Run Linter after changing startup, restrictions, security, or global hooks. Treat missing maps, impossible coordinates, and missing macro targets as release blockers.",
            result: "The scenario shell is ready for repeated playtesting."
          }
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
        caption: "Scenario-wide startup, release identity, restrictions, Global Macros, and security controls.",
        imageSrc: "/manual/gallery/scenario-shell.png"
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
    toolTargets: [{ domain: "maps", editor: "land", label: "Open Land/Dungeon Maps" }],
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
        title: "Inside Land And Dungeon Maps",
        paragraphs: [
          "The map browser chooses the level. The canvas is the editable 90 by 90 land map or dungeon grid. Paint controls choose Brush, Eraser, or Smart behavior; the tile palette supplies landlook tiles, named categories, stamps, special tiles, and custom assets. Zoom and smoothing change only the editor view.",
          "The Selection Inspector describes the selected tile, Action Point, random rectangle, or player-map marker. Overlay controls independently show Action Points, secret areas, hidden-walkable tiles, combat-clearing tiles, passability, and other map data that is not always visible in the artwork."
        ],
        points: [
          "Land Editor paints outdoor tile IDs and landlook-specific stamps. Dungeon Editor edits dungeon levels, walls, darkness, movement, and line-of-sight data.",
          "Single Tile paints the selected tile. Cycle Group and Random Group use the semantic variation group shown by the palette. Smart uses terrain rules to choose adjoining edges and corners.",
          "Land Layout arranges outdoor levels and scenario starts. It does not replace painting the contents of each level.",
          "Select an Action Point marker to inspect its chance, trigger location, destination, and steps; open Scripts/AP when the script itself needs editing.",
          "Turn overlays off before judging the final player-facing composition, then turn them back on to verify hidden behavior."
        ]
      },
      {
        title: "Map Building Workflow",
        steps: [
          {
            title: "Choose the level and landlook",
            body: "Create or select the land or dungeon level, confirm its name and landlook, and set darkness or line-of-sight behavior before detailed painting. Use Land Layout when the level participates in outdoor edge travel.",
            result: "The level has the correct tile vocabulary and runtime context."
          },
          {
            title: "Block the traversable route",
            body: "Use Paint for terrain, Sample to reuse a nearby tile, and Eraser only when clearing is intended. Build entrances, exits, rooms, shorelines, roads, and corridors before scattering decoration.",
            result: "The playable route is visually readable and reaches every required destination."
          },
          {
            title: "Resolve joins and repeated structures",
            body: "Use Smart painting for semantic terrain families and Stamps for known multi-tile structures. Inspect corners, shoreline or mountain continuity, wall orientation, doors, caves, forest edges, and road turns at normal zoom.",
            result: "Adjacent tiles meet consistently instead of merely belonging to the same broad category."
          },
          {
            title: "Author movement and overlays",
            body: "Use selection details and overlays to inspect walkability, hidden walkable tiles, combat-clearing behavior, Action Points, random rectangles, and Player Map markers. Keep hidden walkable and combat-clearing concepts distinct.",
            result: "The runtime movement rules agree with what the map communicates."
          },
          {
            title: "Place transitions and events",
            body: "Put teleport Action Points on the door, cave, stair, or object that causes travel. Draw random rectangles around meaningful encounter spaces and verify both sides of edge travel and level transitions.",
            result: "Triggers are attached to their visible points of interest and lead to valid destinations."
          },
          {
            title: "Inspect the player-facing map",
            body: "Turn authoring overlays off, scan at Fit and normal zoom, and look for bald forest interiors, broken edges, isolated decorations, unreachable spaces, or markers that reveal hidden information.",
            result: "The level reads coherently without editor-only assistance."
          }
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
        caption: "Land map canvas with the level browser, paint tools, overlays, setup controls, and random rectangles.",
        imageSrc: "/manual/gallery/land-dungeon-maps.png"
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
    toolTargets: [{ domain: "player-maps", editor: "map-records", label: "Open Player Maps" }],
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
        title: "Inside The Player Maps Editor",
        paragraphs: [
          "The record list selects a Maps/Notes entry. The editor then shows its player-facing name, target land or dungeon level, picture resource, visible map rectangle, starting position, marker slots, and note text. The preview combines those fields so you can check what the player will actually receive.",
          "Markers use icon IDs and map coordinates. A marker belongs to the player-map record, not to the painted terrain, so moving a map feature may require moving its marker separately."
        ],
        points: [
          "Choose the target level before entering the display rectangle so the coordinates can be checked against the correct map.",
          "Use the picture preview to confirm the selected PICT resource and dimensions.",
          "Use marker rows for icons that should appear on the player map; clear unused rows instead of leaving accidental icon ID 0 assumptions.",
          "Use the note and description fields for player-facing text, then follow their links into Strings when the wording is shared elsewhere."
        ]
      },
      {
        title: "Authoring Workflow",
        steps: [
          {
            title: "Create the Maps/Notes entry",
            body: "Add or select one of the player map records and give it the name players should recognize in Realmz. Decide whether it shows a land/dungeon tile region or a dedicated picture resource.",
            result: "The record has a clear player-facing identity and display mode."
          },
          {
            title: "Frame the visible area",
            body: "For tile-view maps, choose the level, tile size, and display rectangle so the preview includes the useful region without exposing hidden areas. For picture mode, choose a scenario-safe PICT and inspect its bounds.",
            result: "The preview matches the intended in-game map view."
          },
          {
            title: "Place markers and starts",
            body: "Add markers only where they help navigation. Verify icon resources, coordinates, and labels, then set any start or focus position to a meaningful visible location.",
            result: "Markers sit on the places they describe and remain inside the displayed region."
          },
          {
            title: "Write notes and descriptions",
            body: "Keep substantial prose in Strings or Scrolling Text and link it from the map record. Read the result as a player and remove spoilers or author-only directions.",
            result: "The map explains what the party has learned without exposing hidden state."
          },
          {
            title: "Validate every dependency",
            body: "Check missing levels, invalid rectangles, absent PICT resources, broken strings, and unresolved marker icons before export.",
            result: "The Maps/Notes entry can be opened with all of its visible content intact."
          }
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
        caption: "A Player Map record with terrain preview, marker controls, map fields, and player-facing note text.",
        imageSrc: "/manual/gallery/player-maps.png"
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
    toolTargets: [{ domain: "scripts", editor: "action-points", label: "Open Action Points" }],
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
        title: "Inside The Action Point Editor",
        paragraphs: [
          "The record browser selects an Action Point, Extra Action Point, Global Macro, or Quest. An Action Point header shows its source record, map location, activation chance, and filled step count. The step list contains the ordered Realmz CODE and ID slots; selecting a step opens the guided action editor beside it.",
          "Change Action opens the action catalog. The selected action replaces raw numbers with named controls such as destination level and coordinates, string, sound, battle, treasure, condition, or result slot. Apply Step stores the current controls in that slot. Move, duplicate, and delete buttons operate on the selected step."
        ],
        points: [
          "Use the target search field to find records by ID, name, or text; use the eye button to inspect a candidate before selecting it.",
          "Settings-backed actions create or update their settings row when Apply Step is used. Authors do not need to create a separate settings record first.",
          "Flow Preview summarizes branch destinations and continuation. Incoming links show which maps, encounters, battles, monsters, or scripts call the selected record.",
          "Technical Details exposes CODE, ID, and settings rows when needed, but the named action controls are the normal editing surface."
        ]
      },
      {
        title: "Script Authoring Workflow",
        steps: [
          {
            title: "Choose the script owner",
            body: "Use Action Points for map-triggered behavior and Extra Action Points for reusable calls. Scenario > Global Macros assigns five automatic triggers to those Extra Action Points; the Global Macros tab is a filtered view of the assigned scripts. Name a script by what it does, not by its numeric slot.",
            result: "The behavior lives in the smallest reusable record that owns it."
          },
          {
            title: "Build the visible result first",
            body: "Add a step, choose its action by author intent, and set the target with the search picker. Use Apply Step to store the drafted fields; settings-backed actions create their authoring row as part of applying the step.",
            result: "The event already communicates a message, sound, movement, battle, reward, map change, or other observable outcome."
          },
          {
            title: "Add conditions and branches",
            body: "Add checks only after the main path is understandable. For item, magic, thief, typed answer, quest, difficulty, and chance branches, author both outcomes and verify where Exit, GOSUB, or result slots continue execution.",
            result: "Every attempted branch has a known destination and completion path."
          },
          {
            title: "Reuse targets intentionally",
            body: "Use Extra Action Points when behavior is genuinely shared. Preview selected strings, battles, treasure, maps, and encounters before choosing them instead of copying numeric IDs from another record.",
            result: "Shared behavior has one inspectable source and links point at the intended record."
          },
          {
            title: "Read the completed flow",
            body: "Use Flow Preview, incoming links, and Linter warnings to inspect step order, GOSUB reachability, missing settings, missing targets, and player-facing success or failure feedback.",
            result: "The script can be explained from trigger through final visible result."
          }
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
          "Do not treat CODE, ID, or settings row numbers as the first reading path; use Technical Details only when the guided action does not explain an imported value.",
          "Do not forget failure branches for traps, locks, typed answers, and item/magic checks."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Script flow",
        caption: "An Action Point with its map location, ordered steps, guided action controls, string preview, and validation state.",
        imageSrc: "/manual/gallery/action-points.png"
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
    toolTargets: [{ domain: "text", editor: "messages", label: "Open Strings" }],
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
        title: "Inside Strings And Text",
        paragraphs: [
          "The String Editor has a searchable message list and an editor for the selected string. The header shows the string ID, length, and usage count. The main field edits the player-facing text; sound and presentation controls appear when that string format supports them.",
          "The Used By area links back to Action Points, encounters, battles, Player Maps, and other records. Reference Strings previews imported TEXT, STR#, and styl resources. Export Check finds overlong or incompatible text before packaging."
        ],
        points: [
          "Search by a phrase when you know the wording and by ID when another editor or warning provides the number.",
          "Create or duplicate before rewriting a heavily reused message whose callers need different text.",
          "Use scrolling text records for long passages and inspect styl runs beside the readable fallback.",
          "Use the usage links to verify context; the same sentence can be correct in one branch and misleading in another."
        ]
      },
      {
        title: "Writing Workflow",
        steps: [
          {
            title: "Find or create the right text record",
            body: "Search by ID, phrase, or usage before adding a new message. Use Strings for ordinary scenario messages and Scrolling Text for longer TEXT resources with optional same-ID styl formatting.",
            result: "The prose is stored in the text family Realmz expects for its consumer."
          },
          {
            title: "Write for the moment of play",
            body: "State what the player perceives, what changed, and what choices remain. Write distinct success, failure, refusal, and no-effect messages when those states matter.",
            result: "A player can understand the outcome without seeing the script."
          },
          {
            title: "Check reuse before editing",
            body: "Open usage links for an existing string before changing it. Duplicate the message when one caller needs different wording and the other callers should remain unchanged.",
            result: "A local wording improvement does not silently alter unrelated scenes."
          },
          {
            title: "Author presentation details",
            body: "Keep option labels concise, attach a sound only when it supports the message, and preview styled scrolling text to verify its runs and readable fallback text.",
            result: "The text remains legible in both Providence and the intended Realmz presentation."
          },
          {
            title: "Follow the text back to its callers",
            body: "Use deep links to inspect Action Points, encounters, battles, Player Maps, or other records that reference the text. Run Linter for missing messages and no-visible-result warnings.",
            result: "Every important message is reachable from a valid authoring record."
          }
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
        caption: "The String Editor combines search, text, byte count, sound selection, and links to every known caller.",
        imageSrc: "/manual/gallery/strings-text.png"
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
    toolTargets: [{ domain: "encounters", editor: "simple", label: "Open Encounters" }],
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
        title: "Inside The Encounter Editors",
        paragraphs: [
          "The Encounters domain has separate Simple, Complex, Rogue, and Timed tools. Each tool starts with a searchable record list and opens a form tailored to that encounter family. Prompt and label fields are followed by condition rows and result columns, so the visible choice can be read beside the behavior it triggers.",
          "Complex Encounter keeps Magic Responses, Item Responses, typed words, grouped actions, and result scripts in distinct sections. Rogue Encounter separates trap and lock chances, sounds, damage, and success or failure results. Timed Encounter exposes schedule, repeat, and location conditions."
        ],
        points: [
          "The eye button beside a string, spell, item, battle, treasure, or script opens a searchable picker and preview without leaving the encounter.",
          "Selecting an entry in a picker updates the numbered field only after you confirm the choice.",
          "Item-response rows show response number, item number, and item name together so the requirement remains readable.",
          "Result columns use the same named action families as Action Points; empty rows remain available for additional outcomes."
        ]
      },
      {
        title: "Encounter Workflow",
        steps: [
          {
            title: "Choose the encounter family",
            body: "Start with Simple for direct choices, Complex for item, magic, typed-word, or multi-result branches, Rogue for trap and lock interactions, and Timed for scheduled events. Do not use a larger record merely because it has more fields.",
            result: "The record structure matches the interaction the player will experience."
          },
          {
            title: "Write the opening situation",
            body: "Link or create the prompt string first. It should tell the player what is present and why the available responses make sense without exposing hidden checks.",
            result: "The encounter is understandable before any result codes are configured."
          },
          {
            title: "Author responses in player order",
            body: "Give each response a distinct label and configure its requirement, chance, item, spell, thief skill, typed answer, or timing rule. Use the preview/search buttons for long magic and item lists.",
            result: "Each visible response corresponds to one intentional condition."
          },
          {
            title: "Build every result column",
            body: "Use the eye button beside a result to open the searchable picker, inspect the target, and choose the correct string, battle, treasure, script, or other record.",
            result: "Success and failure rows point to records the author has inspected."
          },
          {
            title: "Test alternate outcomes",
            body: "Read item, magic, thief, typed-word, chance, and timing paths independently. Verify failure feedback, repeat behavior, and whether the encounter exits, continues, or calls another script.",
            result: "No selectable or attemptable branch ends silently or reaches a missing target."
          }
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
        caption: "A Complex Encounter with player choices, magic and item requirements, typed reply, and result scripts.",
        imageSrc: "/manual/gallery/complex-encounters.png"
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
    toolTargets: [{ domain: "combat", editor: "battles", label: "Open Combat" }],
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
        title: "Inside Combat",
        paragraphs: [
          "Battle Editor combines a battle-record list, battle settings, a fixed combat board, and a scenario-monster palette. Select a monster in the palette, then place or remove its starting position on the board. Text, distance, rewards, and reusable-action fields remain part of the selected battle record.",
          "Monster Editor shows scenario monsters and the reusable Monster Library side by side. A scenario monster has stats, attacks, spell behavior, resistances, rewards, hooks, and a cicn preview. Library entries are templates; Populate Scenario or copy actions create scenario-owned monster records before a battle can place them."
        ],
        points: [
          "The battle palette includes only monster IDs available to the selected scenario; its count should match the scenario-monster list.",
          "Use icon previews to distinguish a valid cicn from a missing resource before placing the monster.",
          "Select battle text, rewards, and actions with their preview controls rather than relying on an unexplained number.",
          "Open a monster or reusable action in its owning editor when the battle preview identifies the wrong record."
        ]
      },
      {
        title: "Combat Workflow",
        steps: [
          {
            title: "Prepare scenario monsters",
            body: "Create or copy the monsters the battle needs before painting the grid. Review names, hit dice, armor, agility, attacks, behavior, immunities, loot, death hooks, and scenario-safe icon ownership.",
            result: "Every placeable monster ID resolves to an intentional scenario monster."
          },
          {
            title: "Set the battle context",
            body: "Choose the battle record, distance, terrain or backdrop context, before text, after text, rewards, and any reusable action links before arranging every combatant.",
            result: "The fight has a narrative entrance and a defined completion path."
          },
          {
            title: "Paint the starting formation",
            body: "Select monsters from the scenario palette and place them on the battle grid. Keep footprints inside valid cells, avoid accidental overlap, and use a formation that supports the intended range and movement pressure.",
            result: "The opening round is readable and uses only valid scenario monster entries."
          },
          {
            title: "Add scripted combat behavior",
            body: "Use battle and monster macros only for behavior that cannot be expressed by the battle or monster records alone. Open each macro in Action Points and verify its combat-specific conditions and targets.",
            result: "Round behavior has one clear owner and does not hide ordinary setup in a macro."
          },
          {
            title: "Preview and validate",
            body: "Check every icon preview, scenario monster limit, battle text link, macro link, reward, and placement count. Test the battle from the map or encounter that actually launches it.",
            result: "The authored fight matches both the Battle Editor preview and its real entry path."
          }
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
        caption: "The Battle Editor with scenario-monster palette, combat grid, selected monster details, text, and macro target.",
        imageSrc: "/manual/gallery/combat.png"
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
    toolTargets: [{ domain: "economy", editor: "treasure", label: "Open Economy" }],
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
        title: "Inside The Economy Editors",
        paragraphs: [
          "Treasure lists reward records and edits victory points, currency, gems, jewelry, and item slots. Items combines built-in references with scenario custom items and their names, descriptions, icons, values, restrictions, and use behavior. Shops edits stock rows, quantities, pricing, inflation, and entry restrictions.",
          "Searchable item pickers are shared across Treasure, Shops, encounters, castes, and scripts. Their preview shows enough item identity and behavior to choose the correct record before the numeric field changes."
        ],
        points: [
          "Use the ownership label to distinguish a stock Realmz item from a scenario custom item.",
          "Keep item number, item name, and slot or response number visible together when reviewing a list.",
          "Use Bag of Holding and Vault of Arcana as reusable reference libraries; copy or create scenario records only when the scenario owns custom behavior or art.",
          "Open usage links before renumbering an item that already appears in rewards, shops, scripts, or encounters."
        ]
      },
      {
        title: "Economy Workflow",
        steps: [
          {
            title: "Decide whether the item is stock or custom",
            body: "Search built-in Realmz items by name and behavior before creating a scenario item. Use a custom record only when its mechanics, description, art, or quest role cannot be represented by stock data.",
            result: "The scenario owns only the item records it actually needs to export."
          },
          {
            title: "Finish custom item dependencies",
            body: "For each scenario item, set a clear name, type, value, use behavior, restrictions, description, and icon. Copy non-stock art into Scenario Assets; keep stock art referenced by its existing ID.",
            result: "The item is understandable in inventory and all of its resources resolve."
          },
          {
            title: "Build one-time rewards",
            body: "Use Treasure for victory points, gold, gems, jewelry, and item slots awarded by a script, encounter, or battle. Preview item choices and add a visible acquisition message for important rewards.",
            result: "The reward is complete, bounded, and linked from a real gameplay result."
          },
          {
            title: "Build repeatable stores",
            body: "Use Shops for purchasable stock, quantities, inflation, restrictions, and shop-facing text. Edit the author-owned source stock rather than runtime or saved-game inventory caches.",
            result: "The shop opens with intentional stock and predictable pricing rules."
          },
          {
            title: "Test the economic loop",
            body: "Verify that rewards can be received, quest items cannot be lost accidentally, shops expose the intended items, and custom icons and descriptions appear wherever the item is selected or used.",
            result: "Items move through rewards, inventory, use, and shops without broken references."
          }
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
        caption: "Treasure records with fixed rewards, searchable item catalog, and numbered reward slots.",
        imageSrc: "/manual/gallery/economy-treasure.png"
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
    toolTargets: [{ domain: "rules", editor: "spells", label: "Open Rules" }],
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
        title: "Inside The Rules Editors",
        paragraphs: [
          "Rules opens Spell Editor, Race Editor, or Caste Editor. The selector at the top chooses the record and shows whether the displayed values are built-in reference data or a scenario custom override. New Custom creates an editable scenario record; Clear Scenario Custom removes that override and returns the view to built-in behavior.",
          "Each form groups related fields rather than presenting one long binary record. Spells group identity, targeting, effects, class access, text, sounds, and icons. Races group attributes, permissions, aging, and restrictions. Castes group identity, stats, movement, spellcasting, attack progression, starting items, gold, conditions, and default icon."
        ],
        points: [
          "Use the previous and next controls or selector to compare neighboring built-in records before creating an override.",
          "A zero in an imported custom record is a real value; compare it with the built-in reference before deciding whether the override is intentional.",
          "Use the icon preview beside the numeric cicn field to verify the default art.",
          "Apply related changes together, then inspect party restrictions, combat, starting equipment, and scripts that consume the rule."
        ]
      },
      {
        title: "Rules Workflow",
        steps: [
          {
            title: "Inspect the built-in rule",
            body: "Open the stock spell, race, or caste and read the fields that affect your design before creating a scenario override. Confirm that a local change is necessary rather than assuming blank or zero-valued imported data is authoritative.",
            result: "The override begins from understood Realmz behavior."
          },
          {
            title: "Create the smallest intentional override",
            body: "Add a scenario custom record and change only the behavior your scenario owns. Keep names, class or race identity, progression, permissions, targets, and ranges internally consistent.",
            result: "The scenario-local rule has a clear design purpose."
          },
          {
            title: "Complete linked presentation",
            body: "Set player-facing names and descriptions, then verify spell or caste icons, sounds, starting items, and any text resources. Reference stock assets by stock ID and bundle only non-stock material.",
            result: "The rule is both mechanically complete and visible to the player."
          },
          {
            title: "Trace downstream effects",
            body: "Review Scenario restrictions, party eligibility, starting equipment, combat balance, items, shops, monsters, and scripts that depend on the changed spell, race, or caste.",
            result: "The override does not create an impossible party or an unresolved dependency."
          },
          {
            title: "Validate in context",
            body: "Test the changed rule with a party or encounter that actually uses it. Linter can find missing resources and invalid links, but gameplay testing must confirm progression and balance.",
            result: "The override works as authored rather than merely serializing successfully."
          }
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not change a race or caste without considering existing party builds.",
          "Do not create a spell that references missing text, icon, sound, or target behavior.",
          "Do not assume built-in rule browsing means those records export with the scenario.",
          "Do not leave balance-critical behavior unexplained in fields that authors and testers cannot identify from the rule form."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Override comparison",
        caption: "The Caste Editor shows built-in Realmz values, scenario-copy controls, grouped fields, and icon preview.",
        imageSrc: "/manual/gallery/rules-castes.png"
      }
    ]
  },
  {
    id: "assets",
    groupId: "chapters",
    label: "Assets",
    title: "Assets, Custom Library, and Resource IDs",
    summary: "Import, preview, preserve, replace, and move media between Scenario Assets, the Providence Custom Library, and the stock-ID Realmz Gallery.",
    tags: ["assets", "PICT", "snd", "cicn", "TEXT", "STR#", "styl", "raw", "custom library", "Realmz Gallery", "resource IDs"],
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
    toolTargets: [{ domain: "assets", editor: "project-assets", label: "Open Assets" }],
    sections: [
      {
        title: "Asset Lanes",
        paragraphs: [
          "Assets imports, previews, replaces, and organizes the media used by a scenario. The three primary tabs distinguish media that ships with the current scenario, reusable non-stock media available to every project, and stock Realmz media that can already be selected by ID.",
          "Not every previewable asset belongs in the scenario package. Realmz Gallery resources stay referenceable by stock ID. Custom Library material becomes a Scenario Asset before the scenario can depend on it in Realmz."
        ],
        cards: [
          { title: "Scenario Assets", body: "Project-owned resources that ship in the scenario package.", facts: ["exports"] },
          { title: "Custom Library", body: "Protected built-in custom art plus user-managed reusable assets that can be copied into any scenario.", facts: ["reusable"] },
          { title: "Realmz Gallery", body: "Stock Realmz icons, sounds, and special land tiles that are selected by their existing IDs and never bundled as copies.", facts: ["stock IDs"] },
          { title: "Technical Inventory", body: "An advanced inventory of raw resource entries used when troubleshooting an import or export.", facts: ["advanced"] }
        ]
      },
      {
        title: "Inside Assets",
        paragraphs: [
          "Scenario Assets, Custom Library, and Realmz Gallery are the main views. Search and type filters narrow the grid. Selecting a card opens the inspector, where the asset label, resource type and ID, ownership, decoded metadata, usage links, and preview controls appear together.",
          "Import opens a target chooser for pictures, icons, special land tiles, sounds, TEXT, STR#, styl, and raw resources. Image previews support Fit and integer scales. Sounds can be played. Text and raw records use readable previews instead of an empty image frame."
        ],
        points: [
          "Add to Custom Library keeps reusable non-stock media available across Providence projects without adding it to the current scenario.",
          "Add to Scenario Assets copies eligible non-stock library media into the current scenario and assigns a valid ID for that resource type.",
          "Realmz Gallery assets do not offer a scenario copy because the same asset can be selected by its existing stock ID.",
          "Built-in Custom Library assets are distributed with Providence and cannot be deleted; user-added Custom Library assets remain editable and removable.",
          "Replace keeps the scenario asset's role and ID while updating its contents; delete removes the scenario-owned resource after usage links are reviewed.",
          "Technical Inventory is opened separately and is not the normal place to organize author-facing media."
        ]
      },
      {
        title: "Import And Copy Workflow",
        steps: [
          {
            title: "Choose the ownership lane",
            body: "Import into Scenario Assets when this scenario must ship the resource. Import into Custom Library when the non-stock asset should remain reusable across Providence projects. Use Realmz Gallery to find the stock ID for material Realmz already supplies.",
            result: "The resource's storage scope matches how authors and Realmz will use it."
          },
          {
            title: "Choose the resource target",
            body: "Select picture, icon, special land tile, sound, TEXT, STR#, styl, or raw preservation according to the consumer. Keep narrative editing in Strings even when Assets can preview and preserve the text resource.",
            result: "The imported bytes have the resource type their runtime consumer expects."
          },
          {
            title: "Preview before copying",
            body: "Inspect the asset at Fit and useful integer scales, play sounds, and read text or raw metadata. Realmz Gallery entries stay stock-ID references; Custom Library entries can be copied when the scenario needs them.",
            result: "The selected asset is recognizable and is copied only when the scenario needs to own it."
          },
          {
            title: "Copy non-stock material into the scenario",
            body: "Use Add to Scenario Assets for a Custom Library asset required at runtime. The copy action assigns a valid scenario-range ID, avoids conflicts, and keeps the preview available in Scenario Assets.",
            result: "The scenario now owns an exportable resource with a valid type-specific ID."
          },
          {
            title: "Verify consumers and export scope",
            body: "Open usage links from the inspector, confirm maps, monsters, items, scripts, or text records reference the assigned ID, then check Export accounting. Custom Library entries are not packaged until they are copied into Scenario Assets.",
            result: "Every bundled asset is used intentionally and every reusable-only asset stays out of the package."
          }
        ],
        callout: {
          tone: "info",
          title: "Custom Library is global Providence material",
          body: "The Custom Library is shared across Providence projects. Use it for reusable non-stock media that may feed several scenarios."
        }
      },
      {
        title: "Resource ID Discipline",
        paragraphs: [
          "Scenario-owned resources need IDs that Realmz treats as scenario-safe for their type. Pictures, sounds, custom icons, special land tiles, text resources, and raw payloads have different constraints and different consumers.",
          "Automatic allocation chooses a valid scenario range and avoids conflicts with existing scenario resources. Imported IDs are retained when they are already valid and unambiguous."
        ],
        points: [
          "Pictures used by scenarios should stay in scenario PICT ranges and keep title-picture rules in mind.",
          "Custom sounds should stay in scenario sound ranges and remain playable in the target package.",
          "Icon and special tile resources must match the map, monster, item, or tile consumer that will read them.",
          "TEXT, STR#, styl, and raw resources can be imported and previewed, but long-form text authoring still belongs in Strings & Text."
        ]
      },
      {
        title: "Common Pitfalls",
        points: [
          "Do not copy stock Realmz assets into the scenario; select their existing IDs from Realmz Gallery.",
          "Do not assume a copied asset is correct until its preview and ID show correctly in Scenario Assets.",
          "Do not place Custom Library assets in exports until they are intentionally moved or copied to Scenario Assets.",
          "Do not edit narrative text in Assets when the Strings & Text chapter owns the authoring workflow."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Asset lanes",
        caption: "Scenario Assets, Custom Library, Realmz Gallery, type filters, previews, and the selection inspector.",
        imageSrc: "/manual/gallery/assets.png"
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
    toolTargets: [
      { domain: "linter", editor: "issues", label: "Open Linter" },
      { domain: "export", editor: "export-plan", label: "Open Export" }
    ],
    sections: [
      {
        title: "The Release Loop",
        paragraphs: [
          "Linter and Export turn authoring work into release confidence. Linter tells you what is missing, risky, unsupported, or inconsistent. Export writes the selected package and reports what it wrote, preserved, skipped, or blocked.",
          "Use them together. A green-looking export is not enough if warnings explain missing art, missing visible results, unsupported target data, or source files that only passed through unchanged."
        ],
        cards: [
          { title: "Fix Blockers", body: "Resolve missing targets, invalid records, malformed resources, and package errors that prevent export.", facts: ["must fix"] },
          { title: "Review Warnings", body: "Check compatibility risks, missing visible results, preserved source files, and target-specific notes.", facts: ["review"] },
          { title: "Export Target", body: "Choose Providence project ZIP, Mac scenario ZIP, Windows scenario ZIP, native desktop folder, or self-contained Realmz Remake scenario folder output intentionally.", facts: ["package"] }
        ]
      },
      {
        title: "Inside Linter And Export",
        paragraphs: [
          "Linter groups current project findings by authoring area and severity. Each actionable finding names the map, Action Point, encounter, battle, asset, text record, or scenario field involved. Open links take you to that exact owner instead of leaving you to search by hand.",
          "Export presents the available output targets, their readiness, and the files involved. After an export, the report separates files written from current edits, files carried into the package unchanged, files skipped for that target, and blockers that prevented completion."
        ],
        points: [
          "Use Blockers for conditions that prevent a valid package. Review Warnings for behavior that can export but still needs an author decision.",
          "Expand a category to see every affected record and use its link to fix the issue in the owning editor.",
          "Choose Providence Project ZIP for a portable editable backup; choose a scenario target for a Realmz-readable package.",
          "Read the completed export report before opening the output folder so you know which project state and target it describes."
        ]
      },
      {
        title: "Validation Workflow",
        steps: [
          {
            title: "Run Linter from current project state",
            body: "Validate after changes to maps, scripts, assets, encounters, combat, economy, rules, or the scenario shell. Read the category and owning location before changing data.",
            result: "The issue list reflects the project you intend to package."
          },
          {
            title: "Fix author-owned blockers first",
            body: "Open missing targets, invalid coordinates, resource conflicts, broken IDs, and malformed author records in their owning tools. Follow the finding link instead of changing unrelated imported files.",
            result: "Blocking diagnostics are resolved at their real authoring source."
          },
          {
            title: "Review warnings by player impact",
            body: "Prioritize missing visible results, absent art or sounds, unreachable progress, unsupported target data, and imported files that may affect the selected package. Record any warning you intentionally accept for release.",
            result: "Remaining warnings are understood decisions instead of unread noise."
          },
          {
            title: "Choose the package intentionally",
            body: "Use a Providence project ZIP for editable backup and a Mac or Windows scenario package for Realmz runtime output. Confirm raw-source readiness and target-specific resource behavior before starting export.",
            result: "The selected artifact matches whether you are backing up or shipping."
          },
          {
            title: "Read the export report and test",
            body: "Review written, preserved, skipped, and blocked files after export. Test the resulting package in Realmz from startup through the workflows changed in this build; do not substitute a browser preview for runtime verification.",
            result: "The tested artifact is the same artifact the report describes."
          }
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
          "Do not assume an imported scenario will export byte-for-byte unchanged after editing supported records."
        ]
      }
    ],
    visualSlots: [
      {
        title: "Export readiness",
        caption: "Export target selection, package readiness, diagnostics, source availability, and benchmark controls.",
        imageSrc: "/manual/gallery/export.png"
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
    summary: "Use chapter search, hover help, galleries, in-page links, related chapters, and optional classic references.",
    tags: ["documents", "manual", "help", "Divinity Manual", "gallery", "related chapters"],
    badges: ["appendix", "help"],
    references: [DIVINITY_CHAPTERS.gettingStarted, MARKDOWN_REFERENCES.divinityParity, MARKDOWN_REFERENCES.formatIntegration],
    relatedTopicIds: ["getting-started", "search-navigation", "divinity-parity", "compatibility-terms", "troubleshooting"],
    sections: [
      {
        title: "How To Read This Manual",
        paragraphs: [
          "The chapter body explains the Providence editor, the records it owns, the workflow to use, and common mistakes to avoid. Gallery images show the actual controls described in the text.",
          "Use the chapter list to change topics and the In This Chapter links to jump within a long chapter. Further Reference is optional background for classic terminology."
        ]
      },
      {
        title: "Help On Versus Manual",
        cards: [
          { title: "Help On", body: "Short control-level guidance while you work in a tool.", facts: ["inline"] },
          { title: "Manual", body: "Editor tours, field explanations, workflows, galleries, and pitfalls for a whole authoring area.", facts: ["chapter"] },
          { title: "Further Reference", body: "Optional classic terminology and compatibility background.", facts: ["secondary"] }
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
          { title: "Writable", body: "Providence can edit this data and include the change in a supported export.", facts: ["safe to edit"] },
          { title: "Preserved", body: "Imported data is retained unchanged when the selected package needs it.", facts: ["pass-through"] },
          { title: "Read-Only", body: "Providence can explain or preview the data, but it is not an authoring target yet.", facts: ["reference"] },
          { title: "Ignored / No-Op", body: "Realmz can read a value but does not appear to act on it in the known runtime path.", facts: ["diagnostic"] },
          { title: "Needs Verification", body: "The data can remain in the package, but its in-game behavior has not been confirmed.", facts: ["caution"] }
        ]
      },
      {
        title: "How To Use Status Language",
        points: [
          "Treat writable fields as normal authoring surfaces.",
          "Treat preserved data as package context unless a tool explicitly promotes it to author-owned state.",
          "Treat read-only material as reference and make the intended change in another supported editor when one is available.",
          "Open Further Reference when a compatibility term changes whether you can safely edit or export something."
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
          "The Divinity Manual remains useful for original terminology and descriptions of the classic editor. Providence chapters describe the current controls and workflows without requiring authors to translate old window names first.",
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
    tags: ["library", "Realmz", "Divinity", "Custom Library", "Realmz Gallery", "Monster Library", "items", "rules"],
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
    summary: "Inspect decoded records, byte ranges, and links when an imported value or warning needs deeper investigation.",
    tags: ["records", "technical", "source", "byte ranges", "runtime cache", "links"],
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
          "Technical Records is for investigation, not normal authoring. Open it when a warning names an imported file, unresolved link, preserved record, or cached runtime copy that the ordinary editor does not explain.",
          "Use the record details to identify the owning map, script, encounter, resource, or scenario field, then return to that editor to make the change."
        ]
      },
      {
        title: "What To Inspect",
        points: [
          "Source group and file family when you need to know where a decoded record came from.",
          "Incoming and outgoing semantic links when a missing target or duplicate reference is unclear.",
          "Edit and package status when an export warning says a record will remain unchanged.",
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
    summary: "Distinguish editable scenario records from stock references and reusable libraries across Combat, Economy, and Rules.",
    tags: ["coverage", "combat", "economy", "rules", "editable", "libraries"],
    badges: ["appendix", "coverage"],
    references: [MARKDOWN_REFERENCES.divinityParity, MARKDOWN_REFERENCES.coreRecordEvidence],
    relatedTopicIds: ["combat", "economy", "rules", "compatibility-terms"],
    sections: [
      {
        title: "How To Read Coverage",
        paragraphs: [
          "Coverage is not a substitute for the authoring chapters. Use it when deciding whether a visible surface edits a scenario record, browses stock data, or copies from a reusable library.",
          "When a record is preserved or read-only, leave it unchanged and use the owning editor or copy action described by the chapter."
        ]
      },
      {
        title: "Practical Rule",
        points: [
          "If the chapter has an editor, validation, and export support, author there.",
          "If the chapter only previews a library or imported record, treat it as reference until copy/import support says otherwise.",
          "If Linter or Export says a record cannot be edited for the selected package, leave its raw data unchanged and use a supported authoring path."
        ]
      }
    ]
  },
  {
    id: "troubleshooting",
    groupId: "appendix",
    label: "Troubleshooting",
    title: "Troubleshooting and Deeper Checks",
    summary: "Know where to look when import, validation, export, previews, resources, or an in-game Realmz test fails.",
    tags: ["troubleshooting", "validation", "export", "resource", "Realmz", "failure"],
    badges: ["appendix", "debug"],
    references: [MARKDOWN_REFERENCES.formatIntegration, MARKDOWN_REFERENCES.releaseChecklist],
    relatedTopicIds: ["linter-release", "records-evidence", "projects", "assets", "compatibility-terms"],
    sections: [
      {
        title: "Start With The Owning Tool",
        points: [
          "If import fails, confirm the selected folder is a Realmz scenario source and that the project is empty.",
          "If validation fails, open the warning through Linter and then move to the owning chapter.",
          "If preview fails, check whether the asset is scenario-owned, stock Realmz, custom library, Divinity reference, or unsupported raw inventory.",
          "If export fails, check the selected target and whether imported source files are available.",
          "If Realmz fails after export, compare the tested package with the Export report, reproduce the smallest failing path, and return to the editor that owns the changed record."
        ]
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
        section.steps?.map((step) => `${step.title} ${step.body} ${step.result ?? ""}`).join(" ") ?? "",
        section.cards?.map((card) => `${card.title} ${card.body} ${card.facts?.join(" ") ?? ""}`).join(" ") ?? "",
        section.callout ? `${section.callout.title} ${section.callout.body}` : ""
      ].join(" "))
      .join(" ")
  ].join(" ").toLowerCase();
}

export function documentationVisualReferences(topic: DocumentationTopic) {
  return (topic.visualSlots ?? []).filter(
    (slot): slot is DocumentationVisualSlot & { imageSrc: string } => Boolean(slot.imageSrc)
  );
}
