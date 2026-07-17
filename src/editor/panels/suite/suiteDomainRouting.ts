import { directRecordsForTool, labelForSelectedId, type DirectRecordRow } from "../../directRecordIndex";
import { ruleCasteName, ruleRaceName } from "../../ruleNames";
import type { EditorTab, LibraryEntity, Project } from "../../types";

export type DomainEditor = {
  id: string;
  label: string;
  entityTypes: string[];
  createType?: string;
};

export type DomainListEntry = DirectRecordRow | LibraryEntity;

export const DOMAIN_CONFIG: Record<EditorTab, { title: string; subtitle: string; editors: DomainEditor[] }> = {
  maps: {
    title: "Land/Dungeon Maps",
    subtitle: "Land levels, dungeon levels, layout, and special land tile workflows.",
    editors: [
      { id: "land", label: "Land Editor", entityTypes: ["map"] },
      { id: "land-layout", label: "Land Layout", entityTypes: ["land-layout"], createType: "land-layout" },
      { id: "map-editor", label: "Map Editor", entityTypes: ["map"] },
      { id: "dungeon", label: "Dungeon Editor", entityTypes: ["map"] },
      { id: "special-land", label: "Special Land Tiles", entityTypes: ["special-land-tile"], createType: "special-land-tile" }
    ]
  },
  "player-maps": {
    title: "Player Maps",
    subtitle: "Maps/Notes helper maps, names, pictures, markers, and description text.",
    editors: [
      { id: "map-records", label: "Player Maps", entityTypes: ["map record"], createType: "map record" }
    ]
  },
  scripts: {
    title: "Action Point Hub",
    subtitle: "Action Points, GOSUBs, macros, global macros, quests, and cross-links into scenario content.",
    editors: [
      { id: "action-points", label: "Action Points / GOSUBs", entityTypes: ["trigger", "action-slot"] },
      { id: "macros", label: "Macros", entityTypes: ["macro"], createType: "macro" },
      { id: "global-macros", label: "Global Macro Scripts", entityTypes: ["global-macro"], createType: "global-macro" },
      { id: "quests", label: "Quests", entityTypes: ["quest flag"], createType: "quest flag" }
    ]
  },
  scenario: {
    title: "Scenario",
    subtitle: "Startup information, restrictions, contact metadata, and legacy security.",
    editors: [
      { id: "startup", label: "Scenario Startup Information", entityTypes: ["scenario-startup", "scenario", "contact-info"], createType: "scenario-startup" },
      { id: "restrictions", label: "Scenario Restrictions", entityTypes: ["scenario-restriction"], createType: "scenario-restriction" },
      { id: "global-macros", label: "Global Macros", entityTypes: ["global-macro", "macro"], createType: "global-macro" },
      { id: "registration", label: "Scenario Security / Registration Codes", entityTypes: ["registration-security", "action-slot"] }
    ]
  },
  encounters: {
    title: "Encounters",
    subtitle: "Simple, complex, rogue, and timed encounter authoring.",
    editors: [
      { id: "simple", label: "Simple Encounter Editor", entityTypes: ["simple encounter"], createType: "simple encounter" },
      { id: "complex", label: "Complex Encounter Editor", entityTypes: ["complex encounter"], createType: "complex encounter" },
      { id: "rogue", label: "Rogue Encounter Editor", entityTypes: ["thief-encounter"], createType: "thief-encounter" },
      { id: "timed", label: "Time Encounter Editor", entityTypes: ["timed-encounter"], createType: "timed-encounter" }
    ]
  },
  combat: {
    title: "Combat",
    subtitle: "Battles, monsters, monster icons, and shared monster datasets.",
    editors: [
      { id: "battles", label: "Battle Editor", entityTypes: ["battle"], createType: "battle" },
      { id: "monsters", label: "Monster Editor", entityTypes: ["monster"], createType: "monster" },
      { id: "scrapbook", label: "Monster Scrapbook", entityTypes: ["monster-scrapbook-entry"], createType: "monster-scrapbook-entry" },
      { id: "mash", label: "Monster Mash", entityTypes: ["monster-mash-icon"], createType: "monster-mash-icon" }
    ]
  },
  economy: {
    title: "Economy",
    subtitle: "Scenario treasure, items, and shops; reusable item and icon references live in Library Workbench.",
    editors: [
      { id: "treasure", label: "Treasure Editor", entityTypes: ["treasure"], createType: "treasure" },
      { id: "items", label: "Item Editor", entityTypes: ["item", "item-reference"], createType: "item" },
      { id: "shops", label: "Shop Editor", entityTypes: ["shop"], createType: "shop" },
      { id: "bag", label: "Bag of Holding", entityTypes: ["bag-item"] },
      { id: "vault", label: "Vault of Arcana", entityTypes: ["vault-icon"] }
    ]
  },
  rules: {
    title: "Rules",
    subtitle: "Custom spells, races, castes, and selectors used by scenario logic.",
    editors: [
      { id: "spells", label: "Spell Editor", entityTypes: ["spell", "spell-reference"], createType: "spell" },
      { id: "races", label: "Race Editor", entityTypes: ["race"], createType: "race" },
      { id: "castes", label: "Caste Editor", entityTypes: ["caste"], createType: "caste" }
    ]
  },
  assets: {
    title: "Assets",
    subtitle: "Pictures, sounds, resource forks, special land tiles, and render assets.",
    editors: [
      { id: "pictures", label: "Pictures", entityTypes: ["picture", "tile atlas"] },
      { id: "sounds", label: "Sounds", entityTypes: ["sound"] },
      { id: "special-land", label: "Create Special Land Tiles", entityTypes: ["special-land-tile"], createType: "special-land-tile" },
      {
        id: "resource-inventory",
        label: "Resource Fork Inventory",
        entityTypes: [
          "resource type",
          "resource",
          "picture",
          "icon-resource",
          "sound",
          "text-resource",
          "style-resource",
          "string-list-resource",
          "realmz-metadata-resource",
          "version-resource"
        ]
      }
    ]
  },
  text: {
    title: "Text",
    subtitle: "Scenario strings, external text resources, style resources, and spell-check workflows.",
    editors: [
      { id: "messages", label: "Scenario Strings", entityTypes: ["message"], createType: "message" },
      { id: "text-import", label: "Text Import / Export / Spell Checking", entityTypes: ["message", "text-resource", "string-list-resource", "style-resource"] }
    ]
  },
  records: { title: "Records", subtitle: "Decoded binary records and byte provenance.", editors: [] },
  linter: { title: "Linter", subtitle: "Compatibility diagnostics and export blockers.", editors: [] },
  export: { title: "Export", subtitle: "Realmz scenario folder export readiness.", editors: [] }
};

const DOMAIN_HEADER_HELP: Partial<Record<EditorTab, string>> = {
  economy: "Project Economy covers scenario Treasure records, Shop records, item references, and custom items. Bag of Holding and Vault of Arcana remain read-only references in Library Workbench.",
  encounters: "Encounters covers source Data ED, Data ED2, Data TD2, and Data TD3 records: simple choices, complex branch tests, rogue/thief scenes, and timed macro triggers."
};

export function editorSubtitle(editor: DomainEditor) {
  if (editor.createType) return `Create, inspect, and validate ${editor.label.toLowerCase()} entries. Export is available when that record family is supported.`;
  return `Inspect ${editor.label.toLowerCase()} records, resources, links, and diagnostics.`;
}

export function domainHeaderHelp(tab: EditorTab) {
  return DOMAIN_HEADER_HELP[tab] ?? null;
}

export function matchingEntries(editor: DomainEditor, project: Project | null, libraryEntities: LibraryEntity[]) {
  const wanted = new Set(editor.entityTypes);
  const projectMatches = project ? directRowsForEditor(project, editor) : [];
  const libraryMatches = libraryEntities.filter((entity) => wanted.has(entity.type));
  return [...projectMatches, ...libraryMatches];
}

export function directRowsForEditor(project: Project, editor: DomainEditor): DirectRecordRow[] {
  const direct = directRecordsForTool(project, editor.id);
  if (direct.length) return direct;
  if (editor.id === "land" || editor.id === "map-editor" || editor.id === "dungeon") {
    return project.maps
      .filter((map) => editor.id === "dungeon" ? map.levelType === "dungeon" : editor.id === "land" ? map.levelType === "land" : true)
      .map((map) => ({ id: `map:${map.levelType}:${map.index}`, label: map.name, type: "map", summary: `${map.width} x ${map.height} ${map.levelType}` }));
  }
  if (editor.id === "land-layout") {
    return project.landLayout ? [{ id: "land-layout:0", label: "Land Layout", type: "land-layout", summary: `${project.landLayout.rows} x ${project.landLayout.cols}` }] : [];
  }
  if (editor.id === "special-land") {
    return [
      ...project.assets
        .filter((asset) => asset.kind === "special-land-tile")
        .map((asset) => ({ id: asset.id, label: asset.label, type: "special-land-tile", summary: `cicn ${asset.resourceId}` })),
      ...(project.assetCatalog?.icons ?? [])
        .filter((asset) => asset.resourceId < 0)
        .map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "special-land-tile", summary: asset.source }))
    ];
  }
  if (editor.id === "global-macros") {
    return project.scenario.globalMacroHooks ? [{ id: "scenario:global-macros", label: "Global Macros", type: "global-macro", summary: "Five automatic Extra Action Point assignments" }] : [];
  }
  if (editor.id === "quests") {
    return (project.questLabels ?? []).map((record) => ({ id: `quest-flag:${record.id}`, label: record.label || `Quest ${record.id}`, type: "quest flag", summary: record.note ?? "" }));
  }
  if (editor.id === "startup") {
    const rows: DirectRecordRow[] = [];
    if (project.scenario.shell) rows.push({ id: "scenario:startup", label: "Startup Info", type: "scenario-startup", summary: `land ${project.scenario.shell.landLevel}` });
    if (project.scenario.contactInfo) rows.push({ id: "contact:info", label: "Contact Info", type: "contact-info", summary: project.scenario.contactInfo.scenarioName || project.scenario.name });
    return rows;
  }
  if (editor.id === "restrictions") {
    return project.scenario.restrictions ? [{ id: "scenario:restrictions", label: "Restrictions", type: "scenario-restriction", summary: "Scenario restrictions" }] : [];
  }
  if (editor.id === "registration") {
    return project.scenario.securityBackup ? [{ id: "scenario:security", label: "Security / Registration", type: "registration-security", summary: "Divinity code segments" }] : [];
  }
  if (editor.id === "spells") return project.spellOverrides.map((record) => ({ id: `spell:${record.id}`, label: record.displayName || `Spell ${record.id}`, type: "spell-reference", summary: `sound ${record.sound1}/${record.sound2}` }));
  if (editor.id === "races") return project.raceOverrides.map((record) => ({ id: `race:${record.id}`, label: ruleRaceName(project, record.id, record.displayName), type: "race", summary: `default icons ${record.defaultIconSet}` }));
  if (editor.id === "castes") return project.casteOverrides.map((record) => ({ id: `caste:${record.id}`, label: ruleCasteName(project, record.id, record.displayName), type: "caste", summary: `default icon ${record.defaultIcon}` }));
  if (editor.id === "pictures") {
    return [
      ...(project.assetCatalog?.pictures ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "picture", summary: asset.source })),
      ...(project.assetCatalog?.tilesets ?? []).filter((asset) => asset.pictId != null).map((asset) => ({ id: `resource:PICT:${asset.pictId}`, label: asset.name, type: "tile atlas", summary: asset.source }))
    ];
  }
  if (editor.id === "sounds") {
    return [
      ...project.assets.filter((asset) => asset.resourceType.trim() === "snd").map((asset) => ({ id: asset.id, label: asset.label, type: "sound", summary: `snd ${asset.resourceId}` })),
      ...(project.assetCatalog?.sounds ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "sound", summary: asset.source }))
    ];
  }
  if (editor.id === "resource-inventory") {
    return [
      ...project.assets.map((asset) => ({ id: asset.id, label: asset.label, type: asset.kind, summary: `${asset.resourceType} ${asset.resourceId}` })),
      ...(project.assetCatalog?.icons ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "icon-resource", summary: asset.source })),
      ...(project.assetCatalog?.pictures ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "picture", summary: asset.source })),
      ...(project.assetCatalog?.sounds ?? []).map((asset) => ({ id: `resource:${asset.resourceType}:${asset.resourceId}`, label: asset.name || `${asset.resourceType} ${asset.resourceId}`, type: "sound", summary: asset.source }))
    ];
  }
  if (editor.id === "text-import") {
    return [
      ...(project.messages ?? []).map((record) => ({ id: `message:${record.id}`, label: `Message ${record.id}`, type: "message", summary: record.text.slice(0, 80) })),
      ...(project.optionLabels ?? []).map((record) => ({ id: `option-label:${record.id}`, label: `Option Label ${record.id}`, type: "option-label", summary: record.text.slice(0, 80) }))
    ];
  }
  return [];
}

export function directDetailForSelection(project: Project | null, entityId: string | null): DirectRecordRow | null {
  if (!project || !entityId) return null;
  const rows = [
    ...DOMAIN_CONFIG.maps.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.scripts.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.scenario.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.text.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.combat.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.economy.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.rules.editors.flatMap((editor) => directRowsForEditor(project, editor)),
    ...DOMAIN_CONFIG.assets.editors.flatMap((editor) => directRowsForEditor(project, editor))
  ];
  const direct = rows.find((row) => row.id === entityId);
  if (direct) return direct;
  const label = labelForSelectedId(project, null, entityId);
  return label && label !== entityId ? { id: entityId, label, type: "record", summary: "Direct project record" } : null;
}
