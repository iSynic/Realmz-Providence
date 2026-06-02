import {
  AlertTriangle,
  BookOpen,
  Boxes,
  Coins,
  Download,
  FileArchive,
  Flag,
  Grid3X3,
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
  "scripts",
  "text",
  "scenario",
  "rules",
  "encounters",
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
    label: "Maps",
    shortLabel: "Maps",
    description: "Land levels, dungeon levels, layout, map starts, Action Points, and random rectangles.",
    help: "Use the contextual sidebar for core map setup or selection details. The canvas stays the primary surface.",
    tools: [
      t({ id: "land", label: "Land Editor", iconLabel: "L", workbench: "project", description: "Paint and inspect 90 x 90 land levels.", entityTypes: ["map"], defaultInspector: "map" }),
      t({ id: "dungeon", label: "Dungeon Editor", iconLabel: "D", workbench: "project", description: "Inspect dungeon levels, darkness, LOS, and render provenance.", entityTypes: ["map"], defaultInspector: "map" }),
      t({ id: "layout", label: "Land Layout", iconLabel: "LL", workbench: "project", description: "Scenario-level arrangement, starts, and map-record navigation.", entityTypes: ["land-layout", "map record"], defaultInspector: "semantic" }),
      t({ id: "special-land", label: "Special Land Tiles", iconLabel: "SL", workbench: "both", description: "32 x 32 cicn-backed negative tile IDs.", entityTypes: ["special-land-tile"], defaultInspector: "resource" })
    ]
  },
  scripts: {
    id: "scripts",
    label: "Action Points",
    shortLabel: "Action Points",
    description: "Action Points, reusable actions, global events, quests, and links to the rest of the scenario.",
    help: "Action Points are the scenario behavior hub. Build them from clear steps, targets, settings, and reusable actions.",
    tools: [
      t({ id: "action-points", label: "Action Points", iconLabel: "AP", workbench: "project", description: "Create and edit map Action Points.", entityTypes: ["trigger", "action-slot"], defaultInspector: "semantic" }),
      t({ id: "macros", label: "Reusable Actions", iconLabel: "RA", workbench: "project", description: "Reusable actions and branch targets.", entityTypes: ["macro"], defaultInspector: "semantic" }),
      t({ id: "global-macros", label: "Global Events", iconLabel: "GE", workbench: "project", description: "Scenario-wide event hooks and startup logic.", entityTypes: ["global-macro"], defaultInspector: "semantic" }),
      t({ id: "ed3-evidence", label: "Advanced Imports", iconLabel: "AI", workbench: "project", description: "Imported advanced action data kept with the scenario.", entityTypes: ["ed3-action-record"], defaultInspector: "semantic" }),
      t({ id: "quests", label: "Quests", iconLabel: "Q", workbench: "project", description: "Quest flags and script references.", entityTypes: ["quest flag"], defaultInspector: "semantic" })
    ]
  },
  scenario: {
    id: "scenario",
    label: "Scenario",
    shortLabel: "Scenario",
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
    description: "Battles, monsters, Monster Scrapbook, and Monster Mash.",
    help: "Library material is usable reference data; project records remain editable where supported.",
    tools: [
      t({ id: "battles", label: "Battle Editor", iconLabel: "B", workbench: "project", description: "Battle records, monster links, reusable actions, and messages.", entityTypes: ["battle"], defaultInspector: "semantic" }),
      t({ id: "monsters", label: "Monster Editor", iconLabel: "M", workbench: "both", description: "Monster records and cicn/icon links.", entityTypes: ["monster"], defaultInspector: "semantic" }),
      t({ id: "scrapbook", label: "Monster Scrapbook", iconLabel: "SB", workbench: "library", description: "Shared monster entries.", entityTypes: ["monster-scrapbook-entry"], defaultInspector: "resource" }),
      t({ id: "mash", label: "Monster Mash", iconLabel: "MM", workbench: "library", description: "Shared monster icon material.", entityTypes: ["monster-mash-icon"], defaultInspector: "resource" })
    ]
  },
  economy: {
    id: "economy",
    label: "Economy",
    shortLabel: "Economy",
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
    description: "Scenario media and bundled reference libraries.",
    help: "Scenario assets ship with your scenario. Bundled Realmz and Divinity resources are reference-only unless copied into the scenario.",
    tools: [
      t({ id: "project-assets", label: "Scenario Assets", iconLabel: "SA", workbench: "project", description: "Media that exports with this scenario.", entityTypes: ["picture", "sound", "special-land-tile"], defaultInspector: "resource" }),
      t({ id: "pictures", label: "Scenario Pictures", iconLabel: "PI", workbench: "both", description: "Project-owned PICT resources.", entityTypes: ["picture"], defaultInspector: "resource" }),
      t({ id: "sounds", label: "Scenario Sounds", iconLabel: "SN", workbench: "both", description: "Project-owned snd resources.", entityTypes: ["sound"], defaultInspector: "resource" }),
      t({ id: "icons", label: "Scenario Icons", iconLabel: "IC", workbench: "both", description: "Project-owned cicn resources.", entityTypes: ["icon-resource"], defaultInspector: "resource" }),
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
    description: "Realmz Revisited export readiness, pass-through files, and resource reports.",
    help: "Export stays conservative and explains exactly what it writes or preserves.",
    tools: [
      t({ id: "export-plan", label: "Export Plan", iconLabel: "EX", workbench: "project", description: "Supported files and pass-through behavior.", defaultInspector: "export" }),
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
  if (domain === "maps") return project?.maps.length ?? 0;
  if (domain === "scripts") return (project?.triggers.length ?? 0) + (project?.extracodes.length ?? 0);
  if (domain === "text") return (project?.messages.length ?? 0) + (project?.optionLabels.length ?? 0);
  if (domain === "scenario") return project ? [
    project.scenario.shell,
    project.scenario.contactInfo,
    project.scenario.restrictions,
    project.scenario.globalMacroHooks,
    project.scenario.securityBackup
  ].filter(Boolean).length : 0;
  if (domain === "encounters") return (project?.simpleEncounters.length ?? 0) + (project?.complexEncounters.length ?? 0) + (project?.thiefEncounters.length ?? 0) + (project?.timedEncounters.length ?? 0);
  if (domain === "combat") return (project?.battles.length ?? 0) + (project?.monsters.length ?? 0) + (activeWorkbench === "library" ? catalog?.entities.filter((entity) => ["monster-scrapbook-entry", "monster-mash-icon"].includes(entity.type)).length ?? 0 : 0);
  if (domain === "economy") return (project?.treasures.length ?? 0) + (project?.shops.length ?? 0) + (project?.scenarioItems.length ?? 0) + (activeWorkbench === "library" ? catalog?.entities.filter((entity) => ["item", "bag-item", "vault-icon"].includes(entity.type)).length ?? 0 : 0);
  if (domain === "rules") return (project?.spellOverrides.length ?? 0) + (project?.raceOverrides.length ?? 0) + (project?.casteOverrides.length ?? 0) + (activeWorkbench === "library" ? catalog?.entities.filter((entity) => ["spell", "race", "caste"].includes(entity.type)).length ?? 0 : 0);
  if (domain === "assets") return (project?.assets.length ?? 0) + (project?.assetCatalog.tilesets.length ?? 0) + (project?.assetCatalog.pictures?.length ?? 0) + (project?.assetCatalog.icons?.length ?? 0) + (activeWorkbench === "library" ? catalog?.assets.length ?? 0 : 0);
  if (domain === "records") return Object.values(project?.records.counts ?? {}).reduce((total, count) => total + count, 0) + (activeWorkbench === "library" ? catalog?.records.length ?? 0 : 0);
  if (domain === "export") return project ? project.validation.exportableFiles.length + project.validation.passThroughFiles.length : 0;
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
  if (toolId === "land") return project.maps.filter((map) => map.levelType === "land").length;
  if (toolId === "dungeon") return project.maps.filter((map) => map.levelType === "dungeon").length;
  if (toolId === "layout") return project.mapRecords.length + (project.landLayout ? 1 : 0);
  if (toolId === "action-points") return project.triggers.filter((trigger) => trigger.source !== "Data ED3").length;
  if (toolId === "macros" || toolId === "ed3-evidence") return project.triggers.filter((trigger) => trigger.source === "Data ED3").length;
  if (toolId === "global-macros") return project.scenario.globalMacroHooks ? 1 : 0;
  if (toolId === "quests") return project.questLabels.length;
  if (toolId === "startup") return project.scenario.shell ? 1 : 0;
  if (toolId === "restrictions") return project.scenario.restrictions ? 1 : 0;
  if (toolId === "contact") return project.scenario.contactInfo ? 1 : 0;
  if (toolId === "registration") return project.scenario.securityBackup ? 1 : 0;
  if (toolId === "simple") return project.simpleEncounters.length;
  if (toolId === "complex") return project.complexEncounters.length;
  if (toolId === "rogue") return project.thiefEncounters.length;
  if (toolId === "timed") return project.timedEncounters.length;
  if (toolId === "battles") return project.battles.length;
  if (toolId === "monsters") return project.monsters.length;
  if (toolId === "treasure") return project.treasures.length;
  if (toolId === "items") return project.scenarioItems.length;
  if (toolId === "shops") return project.shops.length;
  if (toolId === "spells") return project.spellOverrides.length;
  if (toolId === "races") return project.raceOverrides.length;
  if (toolId === "castes") return project.casteOverrides.length;
  if (toolId === "messages" || toolId === "spell-check") return project.messages.length;
  if (toolId === "text-resources") return project.assets.filter((asset) => asset.kind === "text" || ["TEXT", "STR#", "styl"].includes(asset.resourceType.trim())).length;
  if (toolId === "project-assets") return project.assets.length;
  if (toolId === "pictures") return project.assetCatalog.pictures?.length ?? 0;
  if (toolId === "sounds") return project.assets.filter((asset) => asset.resourceType.trim() === "snd").length;
  if (toolId === "icons" || toolId === "special-land") return project.assetCatalog.icons?.length ?? 0;
  if (toolId === "decoded-records") return Object.values(project.records.counts).reduce((total, value) => total + value, 0);
  return null;
}
