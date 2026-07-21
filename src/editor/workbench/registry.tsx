import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Coins,
  Download,
  FileArchive,
  Flag,
  Grid3X3,
  Map as MapIcon,
  MessageSquareText,
  Spline,
  Sword,
  UserCog
} from "lucide-react";
import { ActiveWorkbench, DomainDescriptor, EditorTab, EditorToolDescriptor, LibraryCatalog, Project } from "../types";

export const WORKBENCHES = [
  {
    id: "project",
    label: "Project Workbench",
    description: "Scenario maps, scripts, records, resources, linter, and export."
  },
  {
    id: "library",
    label: "Library Workbench",
    description: "Bundled Realmz and Divinity catalogs, assets, and reference data."
  }
] as const;

export const DOMAIN_ICONS: Record<EditorTab, JSX.Element> = {
  maps: <Grid3X3 size={15} />,
  "player-maps": <MapIcon size={15} />,
  scripts: <Spline size={15} />,
  scenario: <Flag size={15} />,
  encounters: <BookOpen size={15} />,
  combat: <Sword size={15} />,
  economy: <Coins size={15} />,
  rules: <UserCog size={15} />,
  assets: <FileArchive size={15} />,
  text: <MessageSquareText size={15} />,
  records: <Boxes size={15} />,
  linter: <AlertTriangle size={15} />,
  export: <Download size={15} />
};

export const DOMAIN_ORDER: EditorTab[] = [
  "maps",
  "player-maps",
  "scripts",
  "text",
  "encounters",
  "scenario",
  "rules",
  "combat",
  "economy",
  "assets",
  "linter",
  "export"
];

const t = (tool: EditorToolDescriptor) => tool;

export const DOMAIN_REGISTRY: Record<EditorTab, DomainDescriptor> = {
  maps: {
    id: "maps",
    label: "Land/Dungeon Maps",
    shortLabel: "Land & Dungeon",
    railGroup: "world",
    description: "Land levels, dungeon levels, layout, tile painting, Action Points, and random rectangles.",
    help: "Use the contextual sidebar for core map setup or selection details. The canvas stays the primary surface.",
    tools: [
      t({ id: "land", label: "Land Editor", iconLabel: "L", workbench: "project", description: "Paint and inspect 90 x 90 land levels.", entityTypes: ["map"], defaultInspector: "map" }),
      t({ id: "dungeon", label: "Dungeon Editor", iconLabel: "D", workbench: "project", description: "Inspect dungeon levels, darkness, LOS, and render provenance.", entityTypes: ["map"], defaultInspector: "map" }),
      t({ id: "layout", label: "Land Layout", iconLabel: "LL", workbench: "project", description: "Scenario-level outdoor arrangement and starts.", entityTypes: ["land-layout"], defaultInspector: "semantic" }),
      t({ id: "special-land", label: "Special Land Tiles", iconLabel: "SL", workbench: "both", description: "32 x 32 cicn-backed negative tile IDs.", entityTypes: ["special-land-tile"], defaultInspector: "resource" })
    ]
  },
  "player-maps": {
    id: "player-maps",
    label: "Player Maps",
    shortLabel: "Player Maps",
    railGroup: "world",
    description: "Maps/Notes helper maps, names, pictures, markers, and description text.",
    help: "Create and edit the Maps/Notes entries players can find in game.",
    tools: [
      t({ id: "map-records", label: "Player Maps", iconLabel: "PM", workbench: "project", description: "Edit player map names, previews, markers, and notes.", entityTypes: ["map record"], defaultInspector: "semantic" })
    ]
  },
  scripts: {
    id: "scripts",
    label: "Action Points",
    shortLabel: "Action Points",
    railGroup: "story",
    description: "Action Points, Extra Action Points, global events, quests, and links to the rest of the scenario.",
    help: "Action Points are the scenario behavior hub. Build them from clear steps, targets, settings, and Extra Action Points.",
    tools: [
      t({ id: "action-points", label: "Action Points", iconLabel: "AP", workbench: "project", description: "Create and edit map Action Points.", entityTypes: ["trigger", "action-slot"], defaultInspector: "semantic" }),
      t({ id: "macros", label: "Extra Action Points", iconLabel: "EA", workbench: "project", description: "Extra Action Points and branch targets.", entityTypes: ["macro"], defaultInspector: "semantic" }),
      t({ id: "global-macros", label: "Global Macros", iconLabel: "GM", workbench: "project", description: "Extra Action Point scripts assigned in Scenario > Global Macros.", entityTypes: ["global-macro"], defaultInspector: "semantic" }),
      t({ id: "quests", label: "Quests", iconLabel: "Q", workbench: "project", description: "Quest flags and script references.", entityTypes: ["quest flag"], defaultInspector: "semantic" })
    ]
  },
  scenario: {
    id: "scenario",
    label: "Scenario",
    shortLabel: "Scenario",
    railGroup: "systems",
    description: "Startup information, restrictions, contact metadata, and legacy security.",
    help: "Scenario-wide startup, contact, restrictions, and load-readiness records.",
    tools: [
      t({ id: "startup", label: "Startup Info", iconLabel: "ST", workbench: "project", description: "Starting conditions, initial map, and party restrictions.", entityTypes: ["scenario-startup", "scenario"], defaultInspector: "semantic" }),
      t({ id: "restrictions", label: "Restrictions", iconLabel: "R", workbench: "project", description: "Caste, race, level, and scenario restrictions.", entityTypes: ["scenario-restriction"], defaultInspector: "semantic" }),
      t({ id: "contact", label: "Contact Info", iconLabel: "CI", workbench: "project", description: "Creator contact and scenario metadata.", entityTypes: ["contact-info"], defaultInspector: "semantic" }),
      t({ id: "registration", label: "Security", iconLabel: "SEC", workbench: "project", description: "Legacy registration gates and code usage.", entityTypes: ["registration-security"], defaultInspector: "semantic" })
    ]
  },
  encounters: {
    id: "encounters",
    label: "Encounters",
    shortLabel: "Encounters",
    railGroup: "story",
    description: "Simple, complex, rogue, timed, and random encounter authoring.",
    help: "Encounter editors show Realmz links to battles, text, maps, and runtime state.",
    tools: [
      t({ id: "simple", label: "Simple Encounter", iconLabel: "SE", workbench: "project", description: "Simple encounter records and AP links.", entityTypes: ["simple encounter"], defaultInspector: "semantic" }),
      t({ id: "complex", label: "Complex Encounter", iconLabel: "CE", workbench: "project", description: "Complex encounter records and branch state.", entityTypes: ["complex encounter"], defaultInspector: "semantic" }),
      t({ id: "rogue", label: "Rogue Encounter", iconLabel: "RG", workbench: "project", description: "Thief/rogue encounter data.", entityTypes: ["thief-encounter"], defaultInspector: "semantic" }),
      t({ id: "timed", label: "Timed Encounter", iconLabel: "TE", workbench: "project", description: "Timed encounter schedules and mutations.", entityTypes: ["timed-encounter"], defaultInspector: "semantic" })
    ]
  },
  combat: {
    id: "combat",
    label: "Combat",
    shortLabel: "Combat",
    railGroup: "systems",
    description: "Battles, scenario monsters, and Monster Library.",
    help: "Library material is usable reference data; project records remain editable where supported.",
    tools: [
      t({ id: "battles", label: "Battle Editor", iconLabel: "B", workbench: "project", description: "Battle records, monster links, reusable actions, and strings.", entityTypes: ["battle"], defaultInspector: "semantic" }),
      t({ id: "monsters", label: "Monster Editor", iconLabel: "M", workbench: "both", description: "Scenario monsters, editable Providence library entries, and cicn/icon links.", entityTypes: ["monster"], defaultInspector: "semantic" }),
      t({ id: "scrapbook", label: "Monster Library", iconLabel: "ML", workbench: "library", description: "Protected built-in templates and editable Providence monster variants for copying into scenarios.", entityTypes: ["monster-scrapbook-entry"], defaultInspector: "resource" })
    ]
  },
  economy: {
    id: "economy",
    label: "Economy",
    shortLabel: "Economy",
    railGroup: "systems",
    description: "Treasure, items, shops, Bag of Holding, and Vault of Arcana.",
    help: "Economy tools combine scenario records with shared library assets when available.",
    tools: [
      t({ id: "treasure", label: "Treasure", iconLabel: "T", workbench: "project", description: "Treasure records and reward links.", entityTypes: ["treasure"], defaultInspector: "semantic" }),
      t({ id: "items", label: "Items", iconLabel: "I", workbench: "both", description: "Items and item references.", entityTypes: ["item", "item-reference"], defaultInspector: "semantic" }),
      t({ id: "shops", label: "Shops", iconLabel: "S", workbench: "project", description: "Shop records and restricted shop gates.", entityTypes: ["shop"], defaultInspector: "semantic" }),
      t({ id: "bag", label: "Bag of Holding", iconLabel: "BH", workbench: "library", description: "Shared item dataset.", entityTypes: ["bag-item"], defaultInspector: "resource" }),
      t({ id: "vault", label: "Vault of Arcana", iconLabel: "VA", workbench: "library", description: "Shared icon/art dataset.", entityTypes: ["vault-icon"], defaultInspector: "resource" })
    ]
  },
  rules: {
    id: "rules",
    label: "Rules",
    shortLabel: "Rules",
    railGroup: "systems",
    description: "Spells, races, castes, and selector data.",
    help: "Rule editors expose authored records and shared Realmz reference catalogs.",
    tools: [
      t({ id: "spells", label: "Spell Editor", iconLabel: "SP", workbench: "both", description: "Spells and spell references.", entityTypes: ["spell", "spell-reference"], defaultInspector: "semantic" }),
      t({ id: "races", label: "Race Editor", iconLabel: "RA", workbench: "both", description: "Race records and restrictions.", entityTypes: ["race"], defaultInspector: "semantic" }),
      t({ id: "castes", label: "Caste Editor", iconLabel: "CA", workbench: "both", description: "Caste records and restrictions.", entityTypes: ["caste"], defaultInspector: "semantic" })
    ]
  },
  assets: {
    id: "assets",
    label: "Assets",
    shortLabel: "Assets",
    railGroup: "media",
    description: "Scenario media and bundled reference libraries.",
    help: "Scenario assets ship with your scenario. Bundled Realmz and Divinity resources are reference-only unless copied into the scenario.",
    tools: [
      t({ id: "project-assets", label: "Scenario Assets", iconLabel: "SA", workbench: "project", description: "Media that exports with this scenario.", entityTypes: ["picture", "sound", "special-land-tile"], defaultInspector: "resource" }),
      t({ id: "pictures", label: "Scenario Pictures", iconLabel: "PI", workbench: "both", description: "Project-owned PICT resources.", entityTypes: ["picture"], defaultInspector: "resource" }),
      t({ id: "sounds", label: "Scenario Sounds", iconLabel: "SN", workbench: "both", description: "Project-owned snd resources.", entityTypes: ["sound"], defaultInspector: "resource" }),
      t({ id: "icons", label: "Scenario Icons", iconLabel: "IC", workbench: "both", description: "Project-owned cicn resources.", entityTypes: ["icon-resource"], defaultInspector: "resource" }),
      t({ id: "text-resources", label: "Text Resources", iconLabel: "TX", workbench: "both", description: "Project-owned and imported TEXT, STR#, and styl resources.", entityTypes: ["text-resource", "string-list-resource", "style-resource"], defaultInspector: "resource" }),
      t({ id: "special-land", label: "Special Land Tiles", iconLabel: "SL", workbench: "both", description: "Project-owned 32 x 32 placeable cicn land tiles.", entityTypes: ["special-land-tile"], defaultInspector: "resource" }),
      t({ id: "library-assets", label: "Reference Libraries", iconLabel: "RL", workbench: "library", description: "Bundled read-only Realmz resources for previews and selectors.", entityTypes: ["picture", "sound", "icon-resource", "special-land-tile"], defaultInspector: "resource" }),
      t({ id: "decoded-records", label: "Decoded Records", iconLabel: "DR", workbench: "project", description: "Record catalog grouped by source.", defaultInspector: "semantic" }),
      t({ id: "resource-forks", label: "Advanced Resources", iconLabel: "RF", workbench: "both", description: "Raw PICT, cicn, snd, TEXT, STR#, styl, RLMZ inventory.", entityTypes: ["resource", "resource type"], defaultInspector: "resource" })
    ]
  },
  text: {
    id: "text",
    label: "Strings",
    shortLabel: "Strings",
    railGroup: "story",
    description: "Scenario strings, reference string tables, and export checks.",
    help: "Scenario strings are editable. TEXT and STR# resources are readable reference material.",
    tools: [
      t({ id: "messages", label: "String Editor", iconLabel: "STR", workbench: "project", description: "Create, edit, duplicate, clear, and find scenario strings.", entityTypes: ["message"], defaultInspector: "semantic" }),
      t({ id: "text-resources", label: "Reference Strings", iconLabel: "REF", workbench: "both", description: "Readable TEXT, STR#, and style resources.", entityTypes: ["text-resource", "string-list-resource", "style-resource"], defaultInspector: "resource" }),
      t({ id: "spell-check", label: "Export Check", iconLabel: "OK", workbench: "project", description: "Length and character checks for exported strings.", entityTypes: ["message", "text-resource"], defaultInspector: "semantic" })
    ]
  },
  records: {
    id: "records",
    label: "Records",
    shortLabel: "Records",
    railGroup: "release",
    description: "Decoded binary records, byte ranges, provenance, and diagnostics.",
    help: "Records show the technical details behind editable scenario content.",
    tools: [
      t({ id: "decoded-records", label: "Decoded Records", iconLabel: "DR", workbench: "both", description: "Record catalog grouped by source.", defaultInspector: "semantic" }),
      t({ id: "evidence", label: "Technical Details", iconLabel: "TD", workbench: "both", description: "Byte ranges, status, and diagnostics.", defaultInspector: "semantic" })
    ]
  },
  linter: {
    id: "linter",
    label: "Linter",
    shortLabel: "Linter",
    railGroup: "release",
    description: "Compatibility diagnostics, missing resources, unsupported edits, and export blockers.",
    help: "The linter is the compatibility map for what Providence can safely write.",
    tools: [
      t({ id: "issues", label: "Issues", iconLabel: "!", workbench: "project", description: "Grouped project diagnostics.", defaultInspector: "validation" }),
      t({ id: "readiness", label: "Readiness", iconLabel: "OK", workbench: "project", description: "Export and validation gates.", defaultInspector: "validation" })
    ]
  },
  export: {
    id: "export",
    label: "Export",
    shortLabel: "Export",
    railGroup: "release",
    description: "Native Realmz compiler readiness, generated files, and imported compatibility reports.",
    help: "Export compiles authored projects from canonical data and reports any imported compatibility material it preserves.",
    tools: [
      t({ id: "export-plan", label: "Export Plan", iconLabel: "EX", workbench: "project", description: "Generated native files and imported compatibility behavior.", defaultInspector: "export" }),
      t({ id: "benchmark", label: "Benchmark", iconLabel: "BM", workbench: "project", description: "Large scenario interaction/export checks.", defaultInspector: "export" })
    ]
  }
};

export function domainCount(
  domain: EditorTab,
  project: Project | null,
  catalog: LibraryCatalog | null,
  activeWorkbench: ActiveWorkbench,
  issueCount: number
) {
  if (domain === "linter") return issueCount;
  if (domain === "maps") return listCount(project?.maps);
  if (domain === "player-maps") return listCount(project?.mapRecords);
  if (domain === "scripts") return listCount(project?.triggers) + listCount(project?.extracodes);
  if (domain === "text") return listCount(project?.messages) + listCount(project?.optionLabels);
  if (domain === "scenario") return project ? [
    project.scenario?.shell,
    project.scenario?.contactInfo,
    project.scenario?.restrictions,
    project.scenario?.globalMacroHooks,
    project.scenario?.securityBackup
  ].filter(Boolean).length : 0;
  if (domain === "encounters") return listCount(project?.simpleEncounters) + listCount(project?.complexEncounters) + listCount(project?.thiefEncounters) + listCount(project?.timedEncounters);
  if (domain === "combat") return listCount(project?.battles) + listCount(project?.monsters) + (activeWorkbench === "library" ? filteredListCount(catalog?.entities, (entity) => entity.type === "monster-scrapbook-entry") : 0);
  if (domain === "economy") return listCount(project?.treasures) + listCount(project?.shops) + listCount(project?.scenarioItems) + (activeWorkbench === "library" ? filteredListCount(catalog?.entities, (entity) => ["item", "bag-item", "vault-icon"].includes(entity.type)) : 0);
  if (domain === "rules") return listCount(project?.spellOverrides) + listCount(project?.raceOverrides) + listCount(project?.casteOverrides) + (activeWorkbench === "library" ? filteredListCount(catalog?.entities, (entity) => ["spell", "race", "caste"].includes(entity.type)) : 0);
  if (domain === "assets") return listCount(project?.assets) + listCount(project?.assetCatalog?.tilesets) + listCount(project?.assetCatalog?.pictures) + listCount(project?.assetCatalog?.icons) + listCount(project?.assetCatalog?.sounds) + (activeWorkbench === "library" ? listCount(catalog?.assets) : 0);
  if (domain === "records") return objectNumberTotal(project?.records?.counts) + (activeWorkbench === "library" ? listCount(catalog?.records) : 0);
  if (domain === "export") return project ? listCount(project.validation?.exportableFiles) + listCount(project.validation?.passThroughFiles) : 0;
  return 0;
}

export function toolCount(
  tool: EditorToolDescriptor,
  project: Project | null,
  catalog: LibraryCatalog | null,
  activeWorkbench: ActiveWorkbench
) {
  const types = new Set(tool.entityTypes ?? []);
  if (types.size === 0) return 0;
  let count = 0;
  if (tool.workbench !== "library" && activeWorkbench !== "library") {
    const directCount = directProjectToolCount(tool.id, project);
    count += directCount ?? 0;
  }
  if (tool.workbench !== "project") {
    count += catalog?.entities.filter((entity) => types.has(entity.type)).length ?? 0;
  }
  return count;
}

function directProjectToolCount(toolId: string, project: Project | null) {
  if (!project) return 0;
  if (toolId === "land") return filteredListCount(project.maps, (map) => map.levelType === "land");
  if (toolId === "dungeon") return filteredListCount(project.maps, (map) => map.levelType === "dungeon");
  if (toolId === "layout") return project.landLayout ? 1 : 0;
  if (toolId === "map-records") return listCount(project.mapRecords);
  if (toolId === "action-points") return filteredListCount(project.triggers, (trigger) => trigger.source !== "Data ED3");
  if (toolId === "macros" || toolId === "ed3-evidence") return filteredListCount(project.triggers, (trigger) => trigger.source === "Data ED3");
  if (toolId === "global-macros") return project.scenario?.globalMacroHooks ? 1 : 0;
  if (toolId === "quests") return listCount(project.questLabels);
  if (toolId === "startup") return project.scenario?.shell ? 1 : 0;
  if (toolId === "restrictions") return project.scenario?.restrictions ? 1 : 0;
  if (toolId === "contact") return project.scenario?.contactInfo ? 1 : 0;
  if (toolId === "registration") return project.scenario?.securityBackup ? 1 : 0;
  if (toolId === "simple") return listCount(project.simpleEncounters);
  if (toolId === "complex") return listCount(project.complexEncounters);
  if (toolId === "rogue") return listCount(project.thiefEncounters);
  if (toolId === "timed") return listCount(project.timedEncounters);
  if (toolId === "battles") return listCount(project.battles);
  if (toolId === "monsters") return listCount(project.monsters);
  if (toolId === "treasure") return listCount(project.treasures);
  if (toolId === "items") return listCount(project.scenarioItems);
  if (toolId === "shops") return listCount(project.shops);
  if (toolId === "spells") return listCount(project.spellOverrides);
  if (toolId === "races") return listCount(project.raceOverrides);
  if (toolId === "castes") return listCount(project.casteOverrides);
  if (toolId === "messages" || toolId === "spell-check") return listCount(project.messages);
  if (toolId === "text-resources") return filteredListCount(project.assets, (asset) => asset.kind === "text" || ["TEXT", "STR#", "styl"].includes((asset.resourceType ?? "").trim()));
  if (toolId === "project-assets") return listCount(project.assets);
  if (toolId === "pictures") return listCount(project.assetCatalog?.pictures);
  if (toolId === "sounds") return filteredListCount(project.assets, (asset) => (asset.resourceType ?? "").trim() === "snd") + listCount(project.assetCatalog?.sounds);
  if (toolId === "icons" || toolId === "special-land") return listCount(project.assetCatalog?.icons);
  if (toolId === "decoded-records") return objectNumberTotal(project.records?.counts);
  return null;
}

function listCount<T>(items: T[] | null | undefined) {
  return Array.isArray(items) ? items.length : 0;
}

function filteredListCount<T>(items: T[] | null | undefined, predicate: (item: T) => boolean) {
  return Array.isArray(items) ? items.filter(predicate).length : 0;
}

function objectNumberTotal(values: Record<string, number> | null | undefined) {
  if (!values) return 0;
  return Object.values(values).reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);
}
