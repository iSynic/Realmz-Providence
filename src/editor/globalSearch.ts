import { DOCUMENTATION_TOPICS, documentationSearchText } from "./docs/documentationContent";
import { itemReferenceOptions } from "./itemReferences";
import { monsterReferenceOptions } from "./monsterReferences";
import { AssetWorkbenchSection, EditorTab, LibraryCatalog, ManagedAssetKind, Project, SelectedEntity } from "./types";
import { selectEntityFromId, triggerEntityId } from "./utils";
import { ed3DiagnosticForTrigger } from "./scriptDiagnostics";
import { buildEdcdRowUsages } from "./edcdRows";
import { ruleCasteName, ruleRaceName } from "./ruleNames";

export type GlobalSearchScope = "scenario" | "assets" | "libraries" | "docs" | "diagnostics";

export type GlobalSearchRoute =
  | { kind: "workbench"; workbench: "project" | "library"; domain: EditorTab; editor: string; searchHint?: string; assetSection?: AssetWorkbenchSection; assetKindFilter?: ManagedAssetKind | "all" }
  | { kind: "documents"; sectionId: string }
  | { kind: "divinity-manual"; href?: string };

export type GlobalSearchResult = {
  id: string;
  scope: GlobalSearchScope;
  kind: string;
  title: string;
  subtitle: string;
  snippet: string;
  badges: string[];
  selectedEntity?: SelectedEntity;
  route?: GlobalSearchRoute;
  preview?: string | null;
};

export type GlobalSearchIndex = {
  rows: GlobalSearchResult[];
};

export type GlobalSearchFilters = {
  scopes?: GlobalSearchScope[];
};

type SearchableRow = GlobalSearchResult & {
  searchText?: string;
  numericId?: number;
  aliases?: string[];
};

const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
const MAX_GLOBAL_SEARCH_PROJECT_CACHE_ENTRIES = 48;
const projectIndexCache = new Map<string, SearchableRow[]>();
const catalogIndexCache = new WeakMap<LibraryCatalog, SearchableRow[]>();
const docsRows = buildDocsRows();
const scopeOrder: GlobalSearchScope[] = ["scenario", "assets", "libraries", "docs", "diagnostics"];

export function buildGlobalSearchIndex(project: Project | null, catalog?: LibraryCatalog | null): GlobalSearchIndex {
  const rows = [
    ...(project ? projectRows(project, catalog) : []),
    ...(catalog ? catalogRows(catalog) : []),
    ...docsRows
  ];
  return { rows };
}

export function searchGlobalIndex(index: GlobalSearchIndex, query: string, filters: GlobalSearchFilters = {}): GlobalSearchResult[] {
  const normalized = normalize(query);
  const shortcut = parseShortcut(normalized);
  if (!normalized) return [];
  if (!shortcut && normalized.length < 2) return [];
  const allowedScopes = new Set(filters.scopes ?? scopeOrder);
  const scored = index.rows
    .filter((row) => allowedScopes.has(row.scope))
    .map((row) => ({ row, score: scoreRow(row as SearchableRow, normalized, shortcut) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const scopeDelta = scopeOrder.indexOf(a.row.scope) - scopeOrder.indexOf(b.row.scope);
      if (scopeDelta !== 0) return scopeDelta;
      return a.row.title.localeCompare(b.row.title);
    });
  return scored.map((entry) => entry.row);
}

function projectRows(project: Project, catalog?: LibraryCatalog | null) {
  const cacheKey = projectRowsDependencyKey(project, catalog);
  const cached = projectIndexCache.get(cacheKey);
  if (cached) return cached;
  const rows: SearchableRow[] = [];
  const add = (row: SearchableRow) => rows.push(withSearchText(row));

  add(scenarioRow("scenario:meta", "Scenario", project.scenario.name, "Scenario metadata", [
    project.scenario.name,
    project.scenario.projectPath,
    project.source.sourcePath,
    project.scenario.contactInfo,
    project.scenario.restrictions,
    project.scenario.shell
  ], ["scenario", "metadata"], { kind: "workbench", workbench: "project", domain: "scenario", editor: "startup" }));
  if (project.scenario.securityBackup) {
    add(scenarioRow("scenario:security", "Security", "Security / Registration", "Scenario code segments and registration gates", [
      project.scenario.securityBackup
    ], ["registration", "security"], { kind: "workbench", workbench: "project", domain: "scenario", editor: "registration" }));
  }

  for (const map of project.maps ?? []) {
    add({
      id: `map:${map.levelType}:${map.index}`,
      scope: "scenario",
      kind: "Map",
      title: map.name || `${titleCase(map.levelType)} level ${map.index}`,
      subtitle: `${titleCase(map.levelType)} level ${map.index} | ${map.width} x ${map.height}`,
      snippet: `Landlook ${map.render.landlook ?? "none"} | ${map.render.mode}`,
      badges: ["Map"],
      selectedEntity: selectEntityFromId(`map:${map.levelType}:${map.index}`),
      numericId: map.index,
      aliases: [`${map.levelType} ${map.index}`, `map ${map.index}`]
    });
  }

  for (const record of project.mapRecords ?? []) {
    add({
      id: `map-record:${record.id}`,
      scope: "scenario",
      kind: "Map Record",
      title: record.name || record.primaryName || `Map Record ${record.id}`,
      subtitle: `Level ${record.level} | start ${record.startX},${record.startY}`,
      snippet: [record.secondaryName, record.note, `PICT ${record.pictId}`].filter(Boolean).join(" | "),
      badges: ["Map Record"],
      selectedEntity: selectEntityFromId(`map-record:${record.id}`),
      numericId: record.id,
      aliases: [`map record ${record.id}`]
    });
  }

  for (const trigger of project.triggers ?? []) {
    const isExtra = trigger.source === "Data ED3";
    const id = isExtra ? `macro:${trigger.recordIndex}` : triggerEntityId(trigger.levelType, trigger.levelIndex, trigger.recordIndex, trigger.source);
    const ed3Summary = isExtra ? ed3DiagnosticForTrigger(project, trigger) : null;
    add({
      id,
      scope: "scenario",
      kind: isExtra ? ed3Summary?.searchTitle ?? "Extra Action Point" : "Action Point",
      title: isExtra ? `${ed3Summary?.searchTitle ?? "Extra Action Point"} ${trigger.recordIndex}` : `Action Point ${trigger.recordIndex}`,
      subtitle: isExtra ? `${ed3Summary?.actionCount ?? trigger.actions.length} step(s) | ${ed3Summary?.detail ?? "Data ED3 row"}` : `${trigger.levelType ?? "Unknown"} level ${trigger.levelIndex ?? "?"} | ${trigger.coordinate?.x ?? "?"},${trigger.coordinate?.y ?? "?"}`,
      snippet: isExtra
        ? `${trigger.actions.map((action) => `${action.slot}: ${action.label || action.category || action.rawCode}`).join(" | ")} | ${ed3Summary?.promotionRule ?? ""}`.trim()
        : trigger.actions.map((action) => `${action.slot}: ${action.label || action.category || action.rawCode}`).join(" | "),
      badges: [isExtra ? ed3Summary?.badge ?? "Extra AP" : "Action Point", `${trigger.actions.length} step${trigger.actions.length === 1 ? "" : "s"}`],
      selectedEntity: selectEntityFromId(id),
      numericId: trigger.recordIndex,
      aliases: [isExtra ? `macro ${trigger.recordIndex}` : `ap ${trigger.recordIndex}`, `action point ${trigger.recordIndex}`, ed3Summary?.classification ?? "", ed3Summary?.label ?? ""]
    });
  }

  for (const usage of buildEdcdRowUsages(project, catalog)) {
    add({
      id: `edcd-settings:${usage.rowId}`,
      scope: "scenario",
      kind: usage.status === "missing" ? "Missing Settings Row" : usage.status === "shared" ? "Shared Settings Row" : "Action Settings Row",
      title: `Settings Row ${usage.rowId}`,
      subtitle: `${usage.statusLabel} | ${usage.primaryActionLabel ?? usage.primaryShape ?? "Raw settings"}`,
      snippet: usage.summary,
      badges: ["Settings", usage.statusLabel],
      selectedEntity: selectEntityFromId(`record:Data EDCD:${usage.rowId}`),
      route: { kind: "workbench", workbench: "project", domain: "scripts", editor: "settings-rows", searchHint: String(usage.rowId) },
      numericId: usage.rowId,
      aliases: [
        `settings ${usage.rowId}`,
        `settings row ${usage.rowId}`,
        `edcd ${usage.rowId}`,
        `data edcd ${usage.rowId}`,
        usage.status,
        usage.primaryActionLabel ?? "",
        usage.primaryShape ?? ""
      ]
    });
  }

  for (const message of project.messages ?? []) {
    add({
      id: `message:${message.id}`,
      scope: "scenario",
      kind: "String",
      title: `String ${message.id}`,
      subtitle: `${message.text.length}/255 bytes`,
      snippet: message.text || "Empty string",
      badges: ["String"],
      selectedEntity: selectEntityFromId(`message:${message.id}`),
      numericId: message.id,
      aliases: [`string ${message.id}`, `message ${message.id}`]
    });
  }

  for (const option of project.optionLabels ?? []) {
    add({
      id: `option-label:${option.id}`,
      scope: "scenario",
      kind: "Option Label",
      title: `Option Label ${option.id}`,
      subtitle: `${option.text.length}/80 bytes`,
      snippet: option.text || "Empty option label",
      badges: ["Option"],
      selectedEntity: selectEntityFromId(`option-label:${option.id}`),
      numericId: option.id,
      aliases: [`option ${option.id}`, `option label ${option.id}`]
    });
  }

  for (const encounter of project.simpleEncounters ?? []) {
    add(encounterRow("encounter:simple", encounter.id, "Simple Encounter", "simple", `${encounter.actions.length} action row(s) | prompt ${encounter.prompt}`, encounter.texts));
  }
  for (const encounter of project.complexEncounters ?? []) {
    add(encounterRow("encounter:complex", encounter.id, "Complex Encounter", "complex", `${encounter.actions.length} action row(s) | prompt ${encounter.prompt}`, encounter.texts));
  }
  for (const encounter of project.thiefEncounters ?? []) {
    add({
      id: `thief:${encounter.id}`,
      scope: "scenario",
      kind: "Rogue Encounter",
      title: `Rogue Encounter ${encounter.id}`,
      subtitle: `${encounter.typeFlags.filter(Boolean).length} enabled action(s)`,
      snippet: `Prompt strings ${encounter.prompts.join(", ")} | sounds ${encounter.promptSounds.join(", ")}`,
      badges: ["Encounter", "Rogue"],
      selectedEntity: selectEntityFromId(`thief:${encounter.id}`),
      numericId: encounter.id,
      aliases: [`rogue ${encounter.id}`, `thief ${encounter.id}`]
    });
  }
  for (const encounter of project.timedEncounters ?? []) {
    add({
      id: `time:${encounter.id}`,
      scope: "scenario",
      kind: "Timed Encounter",
      title: `Timed Encounter ${encounter.id}`,
      subtitle: `day ${encounter.day} | ${encounter.percent}% chance`,
      snippet: `Extra Action Point ${encounter.door} | required item ${encounter.requiredItem} | quest ${encounter.requiredQuest}`,
      badges: ["Encounter", "Timed"],
      selectedEntity: selectEntityFromId(`time:${encounter.id}`),
      numericId: encounter.id,
      aliases: [`timed ${encounter.id}`, `time ${encounter.id}`]
    });
  }

  for (const battle of project.battles ?? []) {
    add({
      id: `battle:${battle.id}`,
      scope: "scenario",
      kind: "Battle",
      title: `Battle ${battle.id}`,
      subtitle: `${battle.grid.filter(Boolean).length} placed monster slot(s)`,
      snippet: `before ${battle.messageBefore || "none"} | after ${battle.messageAfter || "none"} | action ${battle.battleMacro || "none"}`,
      badges: ["Battle"],
      selectedEntity: selectEntityFromId(`battle:${battle.id}`),
      numericId: battle.id,
      aliases: [`battle ${battle.id}`]
    });
  }

  for (const monster of project.monsters ?? []) {
    add({
      id: `monster:${monster.id}`,
      scope: "scenario",
      kind: "Monster",
      title: monster.displayName || `Monster ${monster.id}`,
      subtitle: `Monster ${monster.id} | HD ${monster.hitDice} | icon ${monster.iconId}`,
      snippet: `armor ${monster.armor}, agility ${monster.agility}, exp ${monster.exp}, death Extra AP ${monster.deathMacro}`,
      badges: ["Monster"],
      selectedEntity: selectEntityFromId(`monster:${monster.id}`),
      numericId: monster.id,
      aliases: [`monster ${monster.id}`]
    });
  }

  for (const option of monsterReferenceOptions(project, catalog)) {
    if (project.monsters.some((monster) => monster.id === option.value)) continue;
    add({
      id: `monster-reference:${option.value}`,
      scope: "libraries",
      kind: "Monster Reference",
      title: option.label.replace(/\s+\(-?\d+\)$/, ""),
      subtitle: `Monster ${option.value} | ${option.sourceState}`,
      snippet: option.detail || option.summary,
      badges: ["Monster", "Reference"],
      selectedEntity: selectEntityFromId(`monster:${option.value}`),
      numericId: option.value,
      aliases: [`monster ${option.value}`]
    });
  }

  for (const treasure of project.treasures ?? []) {
    add({
      id: `treasure:${treasure.id}`,
      scope: "scenario",
      kind: "Treasure",
      title: `Treasure ${treasure.id}`,
      subtitle: `${treasure.itemIds.filter(Boolean).length} item slot(s)`,
      snippet: `gold ${treasure.gold} | gems ${treasure.gems} | jewelry ${treasure.jewelry} | exp ${treasure.exp}`,
      badges: ["Treasure"],
      selectedEntity: selectEntityFromId(`treasure:${treasure.id}`),
      numericId: treasure.id,
      aliases: [`treasure ${treasure.id}`]
    });
  }

  for (const shop of project.shops ?? []) {
    add({
      id: `shop:${shop.id}`,
      scope: "scenario",
      kind: "Shop",
      title: `Shop ${shop.id}`,
      subtitle: `${shop.itemIds.filter(Boolean).length} stocked slot(s) | inflation ${shop.inflation}`,
      snippet: shop.itemIds.filter(Boolean).slice(0, 12).map((id) => `item ${id}`).join(", "),
      badges: ["Shop"],
      selectedEntity: selectEntityFromId(`shop:${shop.id}`),
      numericId: shop.id,
      aliases: [`shop ${shop.id}`]
    });
  }

  for (const option of itemReferenceOptions(project, catalog)) {
    add({
      id: `item:${option.value}`,
      scope: option.sourceState.toLowerCase().includes("scenario") || option.detail.includes("slot") ? "scenario" : "libraries",
      kind: "Item",
      title: option.label.replace(/\s+\(-?\d+\)$/, ""),
      subtitle: `Item ${option.value} | ${option.category}`,
      snippet: [option.detail, option.summary, option.sourceState].filter(Boolean).join(" | "),
      badges: ["Item", option.category],
      selectedEntity: selectEntityFromId(`item:${option.value}`),
      numericId: option.value,
      aliases: [`item ${option.value}`]
    });
  }

  for (const spell of project.spellOverrides ?? []) {
    add({
      id: `spell:${spell.id}`,
      scope: "scenario",
      kind: "Spell",
      title: spell.displayName || `Spell ${spell.id}`,
      subtitle: `Spell ${spell.id}`,
      snippet: [spell.description, `sounds ${spell.sound1}/${spell.sound2}`, `icons ${spell.spellLook1}/${spell.spellLook2}`].filter(Boolean).join(" | "),
      badges: ["Rules", "Spell"],
      selectedEntity: selectEntityFromId(`spell:${spell.id}`),
      numericId: spell.id,
      aliases: [`spell ${spell.id}`]
    });
  }
  for (const race of project.raceOverrides ?? []) {
    add(ruleRow(`race:${race.id}`, "Race", ruleRaceName(project, race.id, race.displayName), race.id, `default icon set ${race.defaultIconSet}`));
  }
  for (const caste of project.casteOverrides ?? []) {
    add(ruleRow(`caste:${caste.id}`, "Caste", ruleCasteName(project, caste.id, caste.displayName), caste.id, `default icon ${caste.defaultIcon}`));
  }
  for (const quest of project.questLabels ?? []) {
    add({
      id: `quest-flag:${quest.id}`,
      scope: "scenario",
      kind: "Quest",
      title: quest.label || `Quest ${quest.id}`,
      subtitle: `Quest flag ${quest.id}`,
      snippet: quest.note ?? "",
      badges: ["Quest"],
      selectedEntity: selectEntityFromId(`quest-flag:${quest.id}`),
      numericId: quest.id,
      aliases: [`quest ${quest.id}`]
    });
  }

  addAssetRows(project, add);
  addDiagnosticRows(project, add);

  writeProjectRowsCache(cacheKey, rows);
  return rows;
}

function projectRowsDependencyKey(project: Project, catalog?: LibraryCatalog | null) {
  return [
    "scenario", objectCacheKey(project.scenario),
    "source", objectCacheKey(project.source),
    "maps", objectCacheKey(project.maps),
    "mapRecords", objectCacheKey(project.mapRecords),
    "triggers", objectCacheKey(project.triggers),
    "ed3Reachability", objectCacheKey(project.semanticSchema?.decoding?.ed3Reachability),
    "extracodes", objectCacheKey(project.extracodes),
    "messages", objectCacheKey(project.messages),
    "optionLabels", objectCacheKey(project.optionLabels),
    "simple", objectCacheKey(project.simpleEncounters),
    "complex", objectCacheKey(project.complexEncounters),
    "thief", objectCacheKey(project.thiefEncounters),
    "timed", objectCacheKey(project.timedEncounters),
    "battles", objectCacheKey(project.battles),
    "monsters", objectCacheKey(project.monsters),
    "treasures", objectCacheKey(project.treasures),
    "shops", objectCacheKey(project.shops),
    "scenarioItems", objectCacheKey(project.scenarioItems),
    "spellOverrides", objectCacheKey(project.spellOverrides),
    "raceOverrides", objectCacheKey(project.raceOverrides),
    "casteOverrides", objectCacheKey(project.casteOverrides),
    "ruleNames", objectCacheKey(project.ruleNames),
    "questLabels", objectCacheKey(project.questLabels),
    "assets", objectCacheKey(project.assets),
    "pictures", objectCacheKey(project.assetCatalog.pictures),
    "icons", objectCacheKey(project.assetCatalog.icons),
    "sounds", objectCacheKey(project.assetCatalog.sounds),
    "tilesets", objectCacheKey(project.assetCatalog.tilesets),
    "validation", objectCacheKey(project.validation),
    "diagnostics", objectCacheKey(project.diagnostics),
    "catalog", objectCacheKey(catalog)
  ].join(":");
}

function objectCacheKey(value: object | null | undefined) {
  if (!value) return "none";
  const existing = objectIds.get(value);
  if (existing) return String(existing);
  const next = nextObjectId++;
  objectIds.set(value, next);
  return String(next);
}

function writeProjectRowsCache(key: string, rows: SearchableRow[]) {
  projectIndexCache.set(key, rows);
  if (projectIndexCache.size <= MAX_GLOBAL_SEARCH_PROJECT_CACHE_ENTRIES) return;
  const firstKey = projectIndexCache.keys().next().value;
  if (firstKey) projectIndexCache.delete(firstKey);
}

function catalogRows(catalog: LibraryCatalog) {
  const cached = catalogIndexCache.get(catalog);
  if (cached) return cached;
  const rows: SearchableRow[] = [];
  const add = (row: SearchableRow) => rows.push(withSearchText(row));
  for (const entity of catalog.entities ?? []) {
    const routeDomain = domainForLibraryEntity(entity.type);
    const routeEditor = editorForLibraryEntity(entity.type);
    const routeSearchHint = routeDomain === "assets" ? libraryEntityAssetSearchHint(entity) : "";
    const routeAssetSection = routeDomain === "assets"
      ? libraryAssetSearchSection({ source: entity.source, label: entity.label, type: entity.type })
      : undefined;
    const routeAssetKindFilter = routeDomain === "assets"
      ? assetKindFilter(libraryEntityResourceType(entity), entity.type)
      : undefined;
    add({
      id: entity.id,
      scope: "libraries",
      kind: entity.type,
      title: entity.label,
      subtitle: `${entity.type} | ${entity.source}`,
      snippet: compactSummary(entity.summary),
      badges: ["Library", entity.type],
      selectedEntity: selectEntityFromId(entity.id),
      route: {
        kind: "workbench",
        workbench: "library",
        domain: routeDomain,
        editor: routeEditor,
        searchHint: routeSearchHint || undefined,
        assetSection: routeAssetSection,
        assetKindFilter: routeAssetKindFilter
      },
      numericId: trailingNumber(entity.id),
      aliases: [entity.type.replace(/-/g, " ")]
    });
  }
  for (const record of catalog.records ?? []) {
    add({
      id: record.id,
      scope: "libraries",
      kind: record.type,
      title: record.label,
      subtitle: `${record.type} | ${record.source}`,
      snippet: compactSummary(record.summary),
      badges: ["Library Record", record.type],
      route: { kind: "workbench", workbench: "library", domain: "records", editor: "decoded-records" },
      selectedEntity: selectEntityFromId(record.id),
      numericId: trailingNumber(record.id),
      aliases: [record.type.replace(/-/g, " ")]
    });
  }
  for (const asset of catalog.assets ?? []) {
    add({
      id: asset.id,
      scope: "assets",
      kind: asset.type,
      title: asset.label,
      subtitle: [asset.resourceType, asset.resourceId, asset.source].filter((part) => part !== null && part !== undefined && part !== "").join(" | "),
      snippet: asset.relativePath,
      badges: ["Reference Asset", asset.type],
      route: {
        kind: "workbench",
        workbench: "library",
        domain: "assets",
        editor: "library-assets",
        searchHint: assetSearchHint(asset.resourceType ?? asset.type, asset.resourceId, asset.label),
        assetSection: libraryAssetSearchSection(asset),
        assetKindFilter: assetKindFilter(asset.resourceType ?? asset.type, asset.type)
      },
      selectedEntity: selectEntityFromId(asset.id),
      preview: asset.previewPath ?? null,
      numericId: asset.resourceId ?? trailingNumber(asset.id) ?? undefined,
      aliases: resourceAliases(asset.resourceType ?? asset.type, asset.resourceId ?? trailingNumber(asset.id))
    });
  }
  catalogIndexCache.set(catalog, rows);
  return rows;
}

function addAssetRows(project: Project, add: (row: SearchableRow) => void) {
  for (const asset of project.assets ?? []) {
    const assetSection: AssetWorkbenchSection = asset.libraryScope === "custom-library" ? "custom" : "project";
    add({
      id: asset.id,
      scope: "assets",
      kind: asset.kind,
      title: asset.label,
      subtitle: `${asset.resourceType} ${asset.resourceId} | ${asset.fileName}`,
      snippet: [asset.provenance, asset.exportState, asset.originalPath].filter(Boolean).join(" | "),
      badges: [asset.libraryScope === "custom-library" ? "Custom Library" : "Scenario Asset", asset.kind],
      selectedEntity: selectEntityFromId(asset.id),
      route: { kind: "workbench", workbench: "project", domain: "assets", editor: assetEditor(asset.kind, asset.resourceType), searchHint: assetSearchHint(asset.resourceType, asset.resourceId, asset.label), assetSection, assetKindFilter: asset.kind },
      preview: asset.previewPath,
      numericId: asset.resourceId,
      aliases: resourceAliases(asset.resourceType, asset.resourceId)
    });
  }
  for (const asset of [...(project.assetCatalog.pictures ?? []), ...(project.assetCatalog.icons ?? []), ...(project.assetCatalog.sounds ?? [])]) {
    const id = `resource:${asset.resourceType}:${asset.resourceId}`;
    add({
      id,
      scope: "assets",
      kind: asset.resourceType,
      title: asset.name || `${asset.resourceType} ${asset.resourceId}`,
      subtitle: `${asset.resourceType} ${asset.resourceId} | ${asset.source}`,
      snippet: asset.previewPath ?? "",
      badges: ["Scenario Resource", asset.resourceType],
      selectedEntity: selectEntityFromId(id),
      route: { kind: "workbench", workbench: "project", domain: "assets", editor: assetEditor("other", asset.resourceType), searchHint: assetSearchHint(asset.resourceType, asset.resourceId, asset.name ?? ""), assetSection: "project", assetKindFilter: assetKindFilter(asset.resourceType, "other") },
      preview: asset.previewPath ?? null,
      numericId: asset.resourceId,
      aliases: resourceAliases(asset.resourceType, asset.resourceId)
    });
  }
  const managedResourceKeys = new Set((project.assets ?? [])
    .filter((asset) => asset.libraryScope !== "custom-library")
    .map((asset) => `${asset.resourceType.trim()}:${asset.resourceId}`));
  for (const entity of project.semanticSchema?.entities ?? []) {
    const resourceType = libraryEntityResourceType(entity);
    const resourceId = libraryEntityResourceId(entity);
    if (!["TEXT", "STR#", "styl"].includes(resourceType.trim()) || !Number.isFinite(resourceId)) continue;
    if (managedResourceKeys.has(`${resourceType.trim()}:${resourceId}`)) continue;
    add({
      id: entity.id,
      scope: "assets",
      kind: resourceType,
      title: entity.label || `${resourceType} ${resourceId}`,
      subtitle: `${resourceType} ${resourceId} | ${entity.source}`,
      snippet: compactSummary(entity.summary),
      badges: ["Scenario Resource", resourceType],
      selectedEntity: selectEntityFromId(entity.id),
      route: {
        kind: "workbench",
        workbench: "project",
        domain: "assets",
        editor: "text-resources",
        searchHint: assetSearchHint(resourceType, resourceId, entity.label),
        assetSection: "project",
        assetKindFilter: "text"
      },
      numericId: resourceId,
      aliases: resourceAliases(resourceType, resourceId)
    });
  }
  for (const tileset of project.assetCatalog.tilesets ?? []) {
    add({
      id: `tileset:${tileset.id}`,
      scope: "assets",
      kind: "Tile Atlas",
      title: tileset.name,
      subtitle: `Landlook ${tileset.landlook} | PICT ${tileset.pictId ?? "none"}`,
      snippet: `${tileset.columns} x ${tileset.rows} | ${tileset.source}`,
      badges: ["Tileset"],
      route: { kind: "workbench", workbench: "project", domain: "assets", editor: "pictures", searchHint: tileset.pictId != null ? `PICT ${tileset.pictId}` : `landlook ${tileset.landlook}`, assetSection: "project", assetKindFilter: "picture" },
      preview: tileset.imagePath,
      numericId: tileset.pictId ?? tileset.landlook,
      aliases: [`landlook ${tileset.landlook}`, tileset.pictId != null ? `pict ${tileset.pictId}` : ""]
    });
  }
}

function addDiagnosticRows(project: Project, add: (row: SearchableRow) => void) {
  const validation = [
    ...project.validation.errors.map((message) => ({ severity: "Error", message })),
    ...project.validation.warnings.map((message) => ({ severity: "Warning", message }))
  ];
  validation.forEach((issue, index) => add({
    id: `validation:${index}`,
    scope: "diagnostics",
    kind: issue.severity,
    title: `${issue.severity}: ${issue.message.slice(0, 80)}`,
    subtitle: "Project validation",
    snippet: issue.message,
    badges: ["Linter", issue.severity],
    route: { kind: "workbench", workbench: "project", domain: "linter", editor: "issues" }
  }));
  for (const [index, diagnostic] of (project.diagnostics ?? []).entries()) {
    add({
      id: `diagnostic:${index}`,
      scope: "diagnostics",
      kind: diagnostic.severity,
      title: `${titleCase(diagnostic.severity)}: ${diagnostic.message.slice(0, 80)}`,
      subtitle: diagnostic.source ?? diagnostic.code,
      snippet: diagnostic.message,
      badges: ["Diagnostic", diagnostic.severity],
      route: { kind: "workbench", workbench: "project", domain: "linter", editor: "issues" }
    });
  }
}

function buildDocsRows() {
  return DOCUMENTATION_TOPICS.map<SearchableRow>((topic) => withSearchText({
    id: `docs:${topic.id}`,
    scope: "docs",
    kind: "Documentation",
    title: topic.title,
    subtitle: `${topic.label} | ${topic.badges.join(", ")}`,
    snippet: topic.summary,
    badges: ["Docs", ...topic.badges.slice(0, 2)],
    route: { kind: "documents", sectionId: topic.id },
    aliases: topic.tags,
    searchText: documentationSearchText(topic)
  }));
}

function scenarioRow(id: string, kind: string, title: string, subtitle: string, parts: unknown[], badges: string[], route: GlobalSearchRoute): SearchableRow {
  return {
    id,
    scope: "scenario",
    kind,
    title,
    subtitle,
    snippet: compactParts(parts),
    badges,
    selectedEntity: selectEntityFromId(id),
    route
  };
}

function encounterRow(prefix: "encounter:simple" | "encounter:complex", id: number, kind: string, alias: string, subtitle: string, texts: string[]): SearchableRow {
  return {
    id: `${prefix}:${id}`,
    scope: "scenario",
    kind,
    title: `${kind} ${id}`,
    subtitle,
    snippet: texts.filter(Boolean).join(" | "),
    badges: ["Encounter", kind.replace(" Encounter", "")],
    selectedEntity: selectEntityFromId(`${prefix}:${id}`),
    numericId: id,
    aliases: [`${alias} ${id}`, `encounter ${id}`]
  };
}

function ruleRow(id: string, kind: string, title: string, numericId: number, snippet: string): SearchableRow {
  return {
    id,
    scope: "scenario",
    kind,
    title,
    subtitle: `${kind} ${numericId}`,
    snippet,
    badges: ["Rules", kind],
    selectedEntity: selectEntityFromId(id),
    numericId,
    aliases: [`${kind.toLowerCase()} ${numericId}`]
  };
}

function withSearchText<T extends SearchableRow>(row: T): T {
  if (row.searchText) return row;
  row.searchText = [
    row.id,
    row.kind,
    row.title,
    row.subtitle,
    row.snippet,
    row.badges.join(" "),
    row.aliases?.join(" ") ?? ""
  ].join(" ").toLowerCase();
  return row;
}

function scoreRow(row: SearchableRow, normalized: string, shortcut: ReturnType<typeof parseShortcut>) {
  const searchText = row.searchText ?? "";
  if (shortcut) {
    const kindText = `${row.kind} ${row.aliases?.join(" ") ?? ""}`.toLowerCase();
    const kindMatches = !shortcut.kind || kindText.includes(shortcut.kind);
    const numberMatches = row.numericId === shortcut.id || row.id.endsWith(`:${shortcut.id}`) || searchText.includes(`${shortcut.kind ?? ""} ${shortcut.id}`.trim());
    if (kindMatches && numberMatches) return 1000 + scopeBoost(row.scope);
    if (numberMatches && !shortcut.kind) return 640 + scopeBoost(row.scope);
  }
  if (row.id.toLowerCase() === normalized) return 900 + scopeBoost(row.scope);
  if (row.title.toLowerCase() === normalized) return 760 + scopeBoost(row.scope);
  if (row.title.toLowerCase().startsWith(normalized)) return 520 + scopeBoost(row.scope);
  if (searchText.includes(normalized)) return 240 + scopeBoost(row.scope) + Math.max(0, 80 - searchText.indexOf(normalized) / 12);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((word) => searchText.includes(word))) return 180 + scopeBoost(row.scope);
  return 0;
}

function parseShortcut(normalized: string) {
  const bare = normalized.match(/^-?\d+$/);
  if (bare) return { id: Number(bare[0]), kind: "" };
  const match = normalized.match(/^(string|message|ap|action point|macro|extra action point|sound|snd|pict|picture|cicn|icon|item|monster|battle|shop|treasure|quest|spell|race|caste|encounter|simple|complex|rogue|thief|timed|time|map|land|dungeon|map record)\s+(-?\d+)$/);
  if (!match) return null;
  return { kind: shortcutKind(match[1]), id: Number(match[2]) };
}

function shortcutKind(kind: string) {
  const normalized = kind.replace(/\s+/g, " ");
  if (normalized === "string") return "message";
  if (normalized === "ap") return "action point";
  if (normalized === "extra action point") return "macro";
  if (normalized === "snd") return "sound";
  if (normalized === "picture") return "pict";
  if (normalized === "icon") return "cicn";
  if (normalized === "thief") return "rogue";
  if (normalized === "time") return "timed";
  return normalized;
}

function scopeBoost(scope: GlobalSearchScope) {
  return scope === "scenario" ? 60 : scope === "assets" ? 42 : scope === "libraries" ? 28 : scope === "docs" ? 12 : 0;
}

function compactParts(parts: unknown[]) {
  return parts.map(compactUnknown).filter(Boolean).join(" | ").slice(0, 360);
}

function compactSummary(summary: Record<string, unknown>) {
  return Object.entries(summary ?? {})
    .slice(0, 12)
    .map(([key, value]) => `${key}: ${compactUnknown(value)}`)
    .filter(Boolean)
    .join(" | ")
    .slice(0, 360);
}

function compactUnknown(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.slice(0, 12).map(compactUnknown).filter(Boolean).join(", ");
  if (typeof value === "object") return compactSummary(value as Record<string, unknown>);
  return "";
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function titleCase(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function trailingNumber(value: string) {
  const match = value.match(/(-?\d+)(?!.*\d)/);
  return match ? Number(match[1]) : undefined;
}

function resourceAliases(resourceType: string | null | undefined, resourceId: number | null | undefined) {
  if (resourceId == null) return [];
  const normalized = (resourceType ?? "").trim();
  const aliases = [`${normalized} ${resourceId}`];
  if (normalized === "snd") {
    aliases.push(`sound ${resourceId}`);
    if (resourceId !== 0) {
      aliases.push(`snd ${Math.abs(resourceId)}`, `snd ${-Math.abs(resourceId)}`, `sound ${Math.abs(resourceId)}`, `sound ${-Math.abs(resourceId)}`);
    }
  }
  if (normalized === "PICT") aliases.push(`pict ${resourceId}`, `picture ${resourceId}`);
  if (normalized === "cicn") aliases.push(`icon ${resourceId}`);
  return aliases;
}

function assetSearchHint(resourceType: string | null | undefined, resourceId: number | null | undefined, label = "") {
  const normalizedType = (resourceType ?? "").trim();
  if (normalizedType && resourceId != null) return `${normalizedType} ${resourceId}`;
  if (label.trim()) return label.trim();
  return "";
}

function assetKindFilter(resourceType: string | null | undefined, kind: string): ManagedAssetKind | "all" {
  const type = (resourceType ?? "").trim();
  if (type === "PICT" || kind === "picture") return "picture";
  if (type === "snd" || type === "snd " || kind === "sound") return "sound";
  if (type === "cicn" || kind === "icon" || kind.includes("icon")) return "icon";
  if (kind === "special-land-tile") return "special-land-tile";
  if (["TEXT", "STR#", "styl"].includes(type) || kind === "text") return "text";
  return "all";
}

function libraryAssetSearchSection(asset: { source?: string; relativePath?: string; label?: string; type?: string }): AssetWorkbenchSection {
  const parts = [asset.source, asset.relativePath, asset.label, asset.type].join(" ").toLowerCase();
  if (parts.includes("manual") || parts.includes("ui")) return "divinity";
  return "realmz";
}

function libraryEntityAssetSearchHint(entity: { id: string; label: string; summary: Record<string, unknown> }) {
  const resourceType = libraryEntityResourceType(entity);
  const resourceId = libraryEntityResourceId(entity);
  return assetSearchHint(resourceType, Number.isFinite(resourceId) ? resourceId : null, entity.label);
}

function libraryEntityResourceType(entity: { summary: Record<string, unknown> }) {
  return typeof entity.summary.resourceType === "string"
    ? entity.summary.resourceType
    : typeof entity.summary.type === "string"
      ? entity.summary.type
      : "";
}

function libraryEntityResourceId(entity: { id: string; summary: Record<string, unknown> }) {
  return typeof entity.summary.resourceId === "number"
    ? entity.summary.resourceId
    : typeof entity.summary.resourceId === "string"
      ? Number(entity.summary.resourceId)
      : trailingNumber(entity.id);
}

function assetEditor(kind: string, resourceType: string) {
  const type = resourceType.trim();
  if (type === "PICT" || kind === "picture") return "pictures";
  if (type === "snd" || kind === "sound") return "sounds";
  if (type === "cicn" || kind === "icon" || kind === "special-land-tile") return "icons";
  if (["TEXT", "STR#", "styl"].includes(type) || kind === "text") return "text-resources";
  return "project-assets";
}

function domainForLibraryEntity(type: string): EditorTab {
  if (type.includes("monster")) return "combat";
  if (type.includes("item") || type.includes("bag") || type.includes("vault")) return "economy";
  if (type.includes("spell") || type.includes("race") || type.includes("caste")) return "rules";
  if (type.includes("text") || type.includes("string") || type.includes("style")) return "text";
  if (type.includes("resource") || type.includes("picture") || type.includes("sound") || type.includes("icon")) return "assets";
  return "assets";
}

function editorForLibraryEntity(type: string) {
  if (type.includes("monster")) return "monsters";
  if (type.includes("item")) return "items";
  if (type.includes("spell")) return "spells";
  if (type.includes("race")) return "races";
  if (type.includes("caste")) return "castes";
  if (type.includes("text") || type.includes("string") || type.includes("style")) return "text-resources";
  return "library-assets";
}
