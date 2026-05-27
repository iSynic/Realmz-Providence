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
  "scenario",
  "encounters",
  "combat",
  "economy",
  "rules",
  "assets",
  "text",
  "records",
  "linter",
  "export"
];

const t = (tool: EditorToolDescriptor) => tool;

export const DOMAIN_REGISTRY: Record<EditorTab, DomainDescriptor> = {
  maps: {
    id: "maps",
    label: "Maps",
    shortLabel: "Map",
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
    label: "Scripts",
    shortLabel: "AP",
    description: "Action Points, GOSUBs, macros, global macros, and quests.",
    help: "Visual steps are a friendlier presentation over Realmz CODE/ID slots and EDCD rows.",
    tools: [
      t({ id: "action-points", label: "Action Points / GOSUBs", iconLabel: "AP", workbench: "project", description: "Create and edit map action slots.", entityTypes: ["trigger", "action-slot"], defaultInspector: "semantic" }),
      t({ id: "macros", label: "Macros", iconLabel: "M", workbench: "project", description: "Extra Action Point macros and branch targets.", entityTypes: ["macro"], defaultInspector: "semantic" }),
      t({ id: "ed3-evidence", label: "Imported ED3 Rows", iconLabel: "E3", workbench: "project", description: "Imported Data ED3 rows that are not callable macros yet.", entityTypes: ["ed3-action-record"], defaultInspector: "semantic" }),
      t({ id: "global-macros", label: "Global Macros", iconLabel: "GM", workbench: "project", description: "Scenario-wide macro hooks and startup logic.", entityTypes: ["global-macro"], defaultInspector: "semantic" }),
      t({ id: "quests", label: "Quests", iconLabel: "Q", workbench: "project", description: "Quest flags and script references.", entityTypes: ["quest flag"], defaultInspector: "semantic" })
    ]
  },
  scenario: {
    id: "scenario",
    label: "Scenario",
    shortLabel: "Scn",
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
    shortLabel: "Enc",
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
    shortLabel: "Cmb",
    description: "Battles, monsters, Monster Scrapbook, and Monster Mash.",
    help: "Library material is usable reference data; project records remain editable where supported.",
    tools: [
      t({ id: "battles", label: "Battle Editor", iconLabel: "B", workbench: "project", description: "Battle records, monster links, macros, and messages.", entityTypes: ["battle"], defaultInspector: "semantic" }),
      t({ id: "monsters", label: "Monster Editor", iconLabel: "M", workbench: "both", description: "Monster records and cicn/icon links.", entityTypes: ["monster"], defaultInspector: "semantic" }),
      t({ id: "scrapbook", label: "Monster Scrapbook", iconLabel: "SB", workbench: "library", description: "Shared monster entries.", entityTypes: ["monster-scrapbook-entry"], defaultInspector: "resource" }),
      t({ id: "mash", label: "Monster Mash", iconLabel: "MM", workbench: "library", description: "Shared monster icon material.", entityTypes: ["monster-mash-icon"], defaultInspector: "resource" })
    ]
  },
  economy: {
    id: "economy",
    label: "Economy",
    shortLabel: "Eco",
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
    shortLabel: "Rule",
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
    shortLabel: "Ast",
    description: "Pictures, sounds, resource forks, special land tiles, and render assets.",
    help: "Project assets are editable. Bundled Realmz/Divinity fixtures are read-only but previewable.",
    tools: [
      t({ id: "project-assets", label: "Project Assets", iconLabel: "PA", workbench: "project", description: "Imported pictures, icons, sounds, and text.", entityTypes: ["picture", "sound", "special-land-tile"], defaultInspector: "resource" }),
      t({ id: "library-assets", label: "Library Assets", iconLabel: "LA", workbench: "library", description: "Bundled read-only media and reference assets.", entityTypes: ["picture", "sound", "icon-resource", "special-land-tile"], defaultInspector: "resource" }),
      t({ id: "resource-forks", label: "Resource Forks", iconLabel: "RF", workbench: "both", description: "PICT, cicn, snd, TEXT, STR#, styl, RLMZ inventory.", entityTypes: ["resource", "resource type"], defaultInspector: "resource" }),
      t({ id: "render-assets", label: "Render Assets", iconLabel: "RA", workbench: "project", description: "Tile atlases, render profiles, and fallbacks.", entityTypes: ["tile atlas", "render-profile", "asset-fallback"], defaultInspector: "resource" })
    ]
  },
  text: {
    id: "text",
    label: "Text",
    shortLabel: "Txt",
    description: "Scenario strings, TEXT/styl resources, import/export, and spell-check workflow.",
    help: "Text views prefer readable previews and message links.",
    tools: [
      t({ id: "messages", label: "Scenario Strings", iconLabel: "MSG", workbench: "project", description: "Message records and string links.", entityTypes: ["message"], defaultInspector: "semantic" }),
      t({ id: "text-resources", label: "TEXT / STR#", iconLabel: "TXT", workbench: "both", description: "Readable resource text and string lists.", entityTypes: ["text-resource", "string-list-resource", "style-resource"], defaultInspector: "resource" }),
      t({ id: "spell-check", label: "Spell Check", iconLabel: "SC", workbench: "project", description: "Text import/export and spell-check workflow.", entityTypes: ["message", "text-resource"], defaultInspector: "semantic" })
    ]
  },
  records: {
    id: "records",
    label: "Records",
    shortLabel: "Rec",
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
    shortLabel: "Lint",
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
    shortLabel: "Out",
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
  if (domain === "records") return (project?.semanticSchema.records.length ?? 0) + (activeWorkbench === "library" ? catalog?.records.length ?? 0 : 0);
  if (domain === "export") return project ? project.validation.exportableFiles.length + project.validation.passThroughFiles.length : 0;
  const descriptor = DOMAIN_REGISTRY[domain];
  return descriptor.tools.reduce((total, tool) => total + toolCount(tool, project, catalog, activeWorkbench), 0);
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
    count += project?.semanticSchema.entities.filter((entity) => types.has(entity.type)).length ?? 0;
  }
  if (tool.workbench !== "project") {
    count += catalog?.entities.filter((entity) => types.has(entity.type)).length ?? 0;
  }
  return count;
}
