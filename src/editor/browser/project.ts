import { BenchmarkReport, Project, ValidationReport } from "../types";
import { BrowserScenarioSource, readProjectJson, readScenarioSource } from "./fsAccess";
import { browserReferenceAtlasUrl, browserTilesetAtlasUrl, hasBrowserReferenceAtlas } from "./atlasPaths";
import { buildBrowserSemanticSchema } from "./semantic";
import { landlookBaseTile, landlookName, landlookPictId, parseLandlookMapstats, parseScenarioBuffers, TRACKED_FILES } from "./realmzParser";
import { assetFallbacks, blockedSemanticObjects, generatedRuntimeCaches, resourceGaps, unresolvedLinks } from "../semanticGraph";
import { validateRealmzTargetRecord } from "../targetValidation";
import { tileIconCandidates } from "../map/renderValues";

export function createBrowserProject(projectName: string): Project {
  const safeName = projectName.trim() || "Untitled Scenario";
  const project: Project = {
    schemaVersion: 4,
    appVersion: "browser-preview",
    scenario: {
      name: safeName,
      projectPath: `browser://${safeName}.providence`,
      importedAt: new Date().toISOString(),
      shell: defaultScenarioShell(safeName),
      contactInfo: defaultScenarioContactInfo(safeName),
      restrictions: null,
      globalMacroHooks: null
    },
    source: {
      sourcePath: "",
      rawSourcesDir: "browser-memory",
      files: [],
      immutable: true
    },
    maps: [],
    mapRecords: [],
    tileAttributes: [],
    triggers: [],
    randomLevels: [],
    extracodes: [],
    messages: [],
    battles: [],
    treasures: [],
    shops: [],
    simpleEncounters: [],
    complexEncounters: [],
    questLabels: [],
    spellOverrides: [],
    raceOverrides: [],
    casteOverrides: [],
    assets: [],
    assetCatalog: { tilesets: [] },
    editorMetadata: { displayNames: {} },
    records: { counts: {}, alignments: [] },
    diagnostics: [],
    semanticSchema: emptySemanticSchema(),
    validation: { ok: true, errors: [], warnings: [], exportableFiles: [], passThroughFiles: [] }
  };
  project.validation = validateBrowserProject(project);
  return project;
}

export async function importBrowserScenario(source: BrowserScenarioSource): Promise<Project> {
  const { files, sourceFiles } = await readScenarioSource(source, TRACKED_FILES);
  const parsed = parseScenarioBuffers(files);
  parsed.tileAttributes.push(...await loadBundledLandlookMapstats());
  const scenarioName = source.name || "Untitled Scenario";
  const projectPath = `browser://${scenarioName}.providence`;
  const project: Project = {
    schemaVersion: 4,
    appVersion: "browser-preview",
    scenario: {
      name: scenarioName,
      projectPath,
      importedAt: new Date().toISOString(),
      shell: defaultScenarioShell(scenarioName),
      contactInfo: parseScenarioContactInfo(files.get("Data CI")) ?? defaultScenarioContactInfo(scenarioName),
      restrictions: parseScenarioRestrictions(files.get("Data RI")),
      globalMacroHooks: parseGlobalMacroHooks(files.get("Global"))
    },
    source: {
      sourcePath: `browser://${scenarioName}`,
      rawSourcesDir: "browser-memory",
      files: sourceFiles,
      immutable: true
    },
    maps: parsed.maps,
    mapRecords: parsed.mapRecords,
    tileAttributes: parsed.tileAttributes,
    triggers: parsed.triggers,
    randomLevels: parsed.randomLevels,
    extracodes: parsed.extracodes,
    messages: parsed.messages,
    battles: parsed.battles,
    treasures: parsed.treasures,
    shops: parsed.shops,
    simpleEncounters: parsed.simpleEncounters,
    complexEncounters: parsed.complexEncounters,
    questLabels: [],
    spellOverrides: parsed.spellOverrides,
    raceOverrides: parsed.raceOverrides,
    casteOverrides: parsed.casteOverrides,
    assets: [],
    assetCatalog: parsed.assetCatalog,
    editorMetadata: { displayNames: {} },
    records: parsed.records,
    diagnostics: parsed.diagnostics,
    semanticSchema: emptySemanticSchema(),
    validation: { ok: true, errors: [], warnings: [], exportableFiles: [], passThroughFiles: [] }
  };
  project.semanticSchema = buildBrowserSemanticSchema({ scenario: project.scenario, buffers: files, sourceFiles, ...parsed });
  project.validation = validateBrowserProject(project);
  return project;
}

function emptySemanticSchema(): Project["semanticSchema"] {
  return {
    schemaVersion: 4,
    sources: [],
    records: [],
    entities: [],
    links: [],
    reverseLinks: {},
    evidence: [],
    diagnostics: [],
    decoding: { ed3Reachability: [], dispatcherNoops: [], confidenceDebt: [] },
    summary: { sourceCount: 0, recordCount: 0, entityCount: 0, linkCount: 0, diagnosticCount: 0 }
  };
}

function defaultScenarioShell(name: string): NonNullable<Project["scenario"]["shell"]> {
  return {
    sourceFile: name,
    recLevel: 1,
    maxLevel: 999,
    landLevel: 0,
    lookX: 0,
    lookY: 0,
    creatorUser: "",
    codeseg1: new Array(20).fill(0),
    codeseg2: new Array(20).fill(0),
    trailingBytes: [],
    authored: true
  };
}

function defaultScenarioContactInfo(name: string): NonNullable<Project["scenario"]["contactInfo"]> {
  return {
    scenarioName: name,
    version: "",
    date: "",
    author: "",
    email: "",
    web: "",
    fee: "",
    payInfo: ["", "", "", "", ""],
    titles: ["", "", "", "", ""],
    description: "",
    authored: true
  };
}

function parseScenarioContactInfo(buffer?: Uint8Array): Project["scenario"]["contactInfo"] {
  if (!buffer || buffer.byteLength < 4608) return null;
  return {
    scenarioName: pascalSlot(buffer, 0),
    version: pascalSlot(buffer, 1),
    date: pascalSlot(buffer, 2),
    author: pascalSlot(buffer, 3),
    email: pascalSlot(buffer, 4),
    web: pascalSlot(buffer, 5),
    fee: pascalSlot(buffer, 6),
    payInfo: [7, 8, 9, 10, 11].map((slot) => pascalSlot(buffer, slot)),
    titles: [12, 13, 14, 15, 16].map((slot) => pascalSlot(buffer, slot)),
    description: pascalSlot(buffer, 17),
    authored: false
  };
}

function parseScenarioRestrictions(buffer?: Uint8Array): Project["scenario"]["restrictions"] {
  if (!buffer || buffer.byteLength < 320) return null;
  return {
    description: pascalString(buffer.slice(0, 256)),
    maxPartyCharacters: i16At(buffer, 256),
    maxPartyLevel: i16At(buffer, 258),
    bannedRaces: Array.from(buffer.slice(260, 290)).flatMap((value, index) => value ? [index + 1] : []),
    bannedCastes: Array.from(buffer.slice(290, 320)).flatMap((value, index) => value ? [index + 1] : []),
    authored: false
  };
}

function parseGlobalMacroHooks(buffer?: Uint8Array): Project["scenario"]["globalMacroHooks"] {
  if (!buffer) return null;
  const defaults = [
    ["Start", "mainscreeninit/new-game start", true],
    ["Death", "partyloss death/revive path", true],
    ["Quit", "end current game", true],
    ["Reserved", "reserved", false],
    ["Shop", "shop button when a shop is available", true],
    ["Temple", "shop/temple button when a temple is available", true],
    ["Reserved", "reserved", false]
  ] as const;
  return {
    slots: defaults.map(([label, runtimeConsumer, sourceBacked], slot) => ({
      slot,
      label,
      door: buffer.byteLength >= slot * 2 + 2 ? i16At(buffer, slot * 2) : 0,
      sourceBacked,
      runtimeConsumer
    })),
    rawBytes: Array.from(buffer),
    authored: false
  };
}

function pascalSlot(buffer: Uint8Array, slot: number) {
  return pascalString(buffer.slice(slot * 256, slot * 256 + 256));
}

function pascalString(buffer: Uint8Array) {
  const length = Math.min(buffer[0] ?? 0, Math.max(0, buffer.byteLength - 1));
  return Array.from(buffer.slice(1, 1 + length))
    .map((byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : " ")
    .join("")
    .trimEnd();
}

function i16At(buffer: Uint8Array, offset: number) {
  const value = (buffer[offset] << 8) | buffer[offset + 1];
  return value & 0x8000 ? value - 0x10000 : value;
}

export async function openBrowserProject(source: BrowserScenarioSource): Promise<Project> {
  const text = await readProjectJson(source);
  const project = JSON.parse(text) as Project;
  project.assets ??= [];
  project.scenario.shell ??= defaultScenarioShell(project.scenario.name);
  project.scenario.contactInfo ??= defaultScenarioContactInfo(project.scenario.name);
  project.scenario.restrictions ??= null;
  project.scenario.globalMacroHooks ??= null;
  project.mapRecords ??= [];
  project.tileAttributes ??= [];
  project.messages ??= [];
  project.battles ??= [];
  project.treasures ??= [];
  project.shops ??= [];
  project.simpleEncounters ??= [];
  project.complexEncounters ??= [];
  project.questLabels ??= [];
  project.spellOverrides ??= [];
  project.raceOverrides ??= [];
  project.casteOverrides ??= [];
  project.editorMetadata ??= { displayNames: {} };
  project.semanticSchema.decoding ??= { ed3Reachability: [], dispatcherNoops: [], confidenceDebt: [] };
  backfillTilesetMetadata(project);
  await ensureBrowserReferenceTileAttributes(project);
  project.validation = validateBrowserProject(project);
  return project;
}

export async function ensureBrowserReferenceTileAttributes(project: Project) {
  project.tileAttributes ??= [];
  backfillTilesetMetadata(project);
  project.tileAttributes = [
    ...project.tileAttributes.filter((profile) => profile.sourceKind !== "mapstats"),
    ...await loadBundledLandlookMapstats()
  ];
  return project;
}

async function loadBundledLandlookMapstats() {
  const out: Project["tileAttributes"] = [];
  for (const [fileName, landlook] of [
    ["Data P BD", 0],
    ["Data SUB BD", 3],
    ["Data Castle BD", 4],
    ["Data Desert BD", 5],
    ["Data Swamp BD", 9],
    ["Data Snow BD", 10]
  ] as const) {
    try {
      const response = await fetch(`/bundled-libraries/realmz-reference/${encodeURIComponent(fileName)}`, { cache: "force-cache" });
      if (!response.ok) continue;
      out.push(...parseLandlookMapstats(new Uint8Array(await response.arrayBuffer()), landlook, fileName));
    } catch {
      // Browser preview can still operate from scenario-local data when bundled reference files are unavailable.
    }
  }
  return out;
}

function backfillTilesetMetadata(project: Project) {
  project.assetCatalog ??= { tilesets: [] };
  project.assetCatalog.tilesets ??= [];

  const requiredLandlooks = new Set<number>();
  for (const map of project.maps ?? []) {
    const landlook = map.render?.landlook;
    if (typeof landlook === "number" && landlook >= 0 && map.levelType !== "dungeon") requiredLandlooks.add(landlook);
  }
  for (const randomLevel of project.randomLevels ?? []) {
    if (typeof randomLevel.landlook === "number" && randomLevel.landlook >= 0 && randomLevel.levelType !== "dungeon") {
      requiredLandlooks.add(randomLevel.landlook);
    }
  }
  for (const landlook of requiredLandlooks) {
    if (!project.assetCatalog.tilesets.some((tileset) => tileset.landlook === landlook || tileset.id === `landlook-${landlook}`)) {
      project.assetCatalog.tilesets.push(browserReferenceTileset(landlook));
    }
  }
  if ((project.maps ?? []).some((map) => map.levelType === "dungeon") && !project.assetCatalog.tilesets.some((tileset) => tileset.id === "dungeon-top-down-302")) {
    project.assetCatalog.tilesets.push({
      id: "dungeon-top-down-302",
      landlook: 2,
      name: "Dungeon Top Down",
      source: "Browser project hydration: Scenario Utility reference PICT PNG",
      available: hasBrowserReferenceAtlas(302),
      imagePath: browserReferenceAtlasUrl(302),
      pictId: 302,
      tileWidth: 16,
      tileHeight: 16,
      columns: 4,
      rows: 4,
      baseTile: null,
      custom: false
    });
  }
  for (const tileset of project.assetCatalog.tilesets) {
    if (tileset.baseTile == null) tileset.baseTile = landlookBaseTile(tileset.landlook);
    const referenceUrl = browserReferenceAtlasUrl(tileset.pictId);
    if (referenceUrl && (!tileset.imagePath || tileset.imagePath.startsWith("assets/") || tileset.imagePath.startsWith("assets\\"))) {
      tileset.imagePath = referenceUrl;
      tileset.available = true;
      tileset.source = "Browser project hydration: Scenario Utility reference PICT PNG";
    }
  }
}

function browserReferenceTileset(landlook: number) {
  const pictId = landlookPictId(landlook);
  const imagePath = browserReferenceAtlasUrl(pictId);
  return {
    id: `landlook-${landlook}`,
    landlook,
    name: landlookName(landlook),
    source: imagePath
      ? "Browser project hydration: Scenario Utility reference PICT PNG"
      : "Browser project hydration: missing reference atlas",
    available: hasBrowserReferenceAtlas(pictId),
    imagePath,
    pictId,
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    baseTile: landlookBaseTile(landlook),
    custom: landlook >= 6 && landlook <= 8
  };
}

export function validateBrowserProject(project: Project): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (project.maps.length === 0) errors.push("Project has no maps. At least one land or dungeon map is required.");
  for (const map of project.maps) {
    if (map.width !== 90 || map.height !== 90 || map.tiles.length !== 8100) {
      errors.push(`${map.name} must be a 90 x 90 map with 8100 tiles.`);
    }
  }
  for (const alignment of project.records.alignments) {
    if (alignment.status === "has-trailing-bytes") {
      warnings.push(`${alignment.source} has ${alignment.trailingBytes} trailing bytes after full records.`);
    }
  }
  for (const asset of project.assets ?? []) {
    if (asset.exportState === "blocked") errors.push(`${asset.label} is blocked from Realmz export.`);
    if (!["PICT", "cicn", "snd "].includes(asset.resourceType)) errors.push(`${asset.label} uses unsupported resource type ${asset.resourceType}.`);
  }
  for (const message of project.messages ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "message", message.id), errors, warnings);
  for (const battle of project.battles ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "battle", battle.id), errors, warnings);
  for (const treasure of project.treasures ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "treasure", treasure.id), errors, warnings);
  for (const shop of project.shops ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "shop", shop.id), errors, warnings);
  for (const encounter of project.simpleEncounters ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "simpleEncounter", encounter.id), errors, warnings);
  for (const encounter of project.complexEncounters ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "complexEncounter", encounter.id), errors, warnings);
  if ((project.assets ?? []).length > 0) {
    warnings.push(`${project.assets.length.toLocaleString()} managed media asset(s) are present; desktop export writes them to the Scenario resource fork.`);
  }
  if (project.semanticSchema.schemaVersion !== 4) {
    warnings.push(`Semantic schema version ${project.semanticSchema.schemaVersion} is stale; re-import this scenario to refresh archaeology data.`);
  }
  for (const diagnostic of project.semanticSchema.diagnostics) {
    const message = `Semantic ${diagnostic.type}: ${diagnostic.message}`;
    if (diagnostic.severity === "error") errors.push(message);
    else if (diagnostic.severity === "warning") warnings.push(message);
  }
  const unresolved = unresolvedLinks(project);
  if (unresolved.length > 0) {
    warnings.push(`Semantic graph has ${unresolved.length.toLocaleString()} unresolved link endpoint(s); first: ${unresolved[0].from} -> ${unresolved[0].to}.`);
  }
  for (const tileset of project.assetCatalog.tilesets) {
    if (!browserTilesetAtlasUrl(tileset)) warnings.push(`${tileset.id} atlas is not available in browser import; decoded colors are used.`);
  }
  const resourceFallbacks = resourceGaps(project);
  if (resourceFallbacks.length > 0) {
    warnings.push(`${resourceFallbacks.length.toLocaleString()} referenced resource(s) are not scenario-supplied and will use shared/fallback provenance when available.`);
  }
  const missingAtlases = assetFallbacks(project);
  if (missingAtlases.length > 0) {
    warnings.push(`${missingAtlases.length.toLocaleString()} render asset fallback(s) are present; maps using them may render as decoded colors.`);
  }
  const caches = generatedRuntimeCaches(project);
  if (caches.length > 0) {
    warnings.push(`${caches.length.toLocaleString()} generated runtime cache model(s) are read-only and will not be authored on export.`);
  }
  const blocked = blockedSemanticObjects(project);
  for (const entity of blocked.entities) {
    if (entity.summary.edited === true) errors.push(`${entity.id} is marked edited but its semantic edit state is blocked.`);
  }
  for (const record of blocked.records) {
    if (record.summary.edited === true) errors.push(`${record.id} is marked edited but its semantic edit state is blocked.`);
  }
  const sourceNames = new Set(project.source.files.map((file) => file.name));
  validateTileAttributes(project, sourceNames, warnings);
  validateMapRecords(project, errors, warnings);
  const exportableFiles = ["Data LD", "Data DL", "Data DD", "Data DDD", "Data RD", "Data RDD", "Data ED3", "Data EDCD", "Data ED", "Data ED2", "Data BD", "Data SD", "Data SD2", "Data MD2", "Data TD"].filter((name) =>
    sourceNames.has(name)
  );
  const passThroughFiles = project.source.files.filter((file) => !file.editable).map((file) => file.name);
  if (passThroughFiles.length > 0) {
    warnings.push(`${passThroughFiles.length.toLocaleString()} unsupported source file(s) will pass through unchanged: ${passThroughFiles.slice(0, 10).join(", ")}.`);
  }
  for (const source of project.source.files) {
    if (["CL", "CD", "CE", "CE2", "CS", "CT", "CTD3"].includes(source.name)) {
      warnings.push(`${source.name} looks like a generated runtime cache and is treated as evidence/pass-through, not authored data.`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, exportableFiles, passThroughFiles };
}

function validateTileAttributes(project: Project, sourceNames: Set<string>, warnings: string[]) {
  if (!sourceNames.has("Data Solids")) {
    warnings.push("Data Solids is missing; special negative tile solidity will remain unknown.");
  }
  const usedLandlooks = new Set(project.maps.map((map) => map.render.landlook).filter((value): value is number => value != null && value >= 0));
  const mapstatsLandlooks = new Set(project.tileAttributes.filter((profile) => profile.sourceKind === "mapstats").map((profile) => profile.landlook).filter((value): value is number => value != null));
  for (const landlook of usedLandlooks) {
    if (!mapstatsLandlooks.has(landlook) && landlook !== 2) {
      warnings.push(`Landlook ${landlook} has no decoded mapstats; tile attributes will be shown as unknown metadata.`);
    }
  }
  const knownIcons = knownIconIds(project);
  const missingIcons = new Set<number>();
  let positiveStateValues = 0;
  for (const map of project.maps) {
    for (const tile of map.tiles) {
      if (tile > 999) positiveStateValues += 1;
      if (tile >= 0) continue;
      const candidates = tileIconCandidates(tile);
      if (!candidates.some((candidate) => knownIcons.has(candidate))) {
        missingIcons.add(candidates[0] ?? tile);
      }
    }
  }
  if (missingIcons.size > 0) {
    warnings.push(`${missingIcons.size.toLocaleString()} negative/special tile value(s) do not currently resolve to decoded cicn icon art.`);
  }
  if (positiveStateValues > 0) {
    warnings.push(`${positiveStateValues.toLocaleString()} positive high map field value(s) carry Realmz state bands; edit them through AP/secret/path workflows or Raw/Advanced tile tools.`);
  }
}

function knownIconIds(project: Project) {
  const ids = new Set<number>();
  for (const asset of project.assets ?? []) {
    if (asset.resourceType === "cicn") insertIconId(ids, asset.resourceId);
  }
  for (const asset of project.assetCatalog.icons ?? []) insertIconId(ids, asset.resourceId);
  for (const entity of project.semanticSchema.entities) {
    if (entity.type !== "resource" && entity.type !== "icon-resource" && entity.type !== "special-land-tile") continue;
    const resourceId = typeof entity.summary.resourceId === "number" ? entity.summary.resourceId : Number(entity.summary.resourceId);
    const resourceType = String(entity.summary.type ?? entity.summary.resourceType ?? "");
    if (Number.isFinite(resourceId) && (resourceType === "cicn" || entity.type !== "resource")) insertIconId(ids, resourceId);
  }
  return ids;
}

function insertIconId(ids: Set<number>, id: number) {
  ids.add(id);
  if (id > 0) ids.add(-id);
}

function validateMapRecords(project: Project, errors: string[], warnings: string[]) {
  const mapIds = new Set(project.maps.map((map) => `${map.levelType}:${map.index}`));
  const pictures = new Set(project.assetCatalog.pictures?.map((picture) => picture.resourceId) ?? []);
  for (const record of project.mapRecords ?? []) {
    if (record.startX < 0 || record.startX >= 90 || record.startY < 0 || record.startY >= 90) {
      warnings.push(`Map record ${record.id} starts outside the 90x90 map at ${record.startX},${record.startY}.`);
    }
    const mapId = `${record.isDungeon ? "dungeon" : "land"}:${record.level}`;
    if (!mapIds.has(mapId)) warnings.push(`Map record ${record.id} points to missing ${mapId}.`);
    if (record.rect.left > record.rect.right || record.rect.top > record.rect.bottom) {
      warnings.push(`Map record ${record.id} has an inverted display rectangle.`);
    }
    if (record.pictId !== 0 && pictures.size > 0 && !pictures.has(record.pictId)) {
      warnings.push(`Map record ${record.id} references picture ${record.pictId}, which is not decoded in the scenario resource catalog.`);
    }
    if ((record.rawBytes?.length ?? 0) !== 340) {
      errors.push(`Map record ${record.id} does not preserve a 340-byte raw record.`);
    }
  }
}

function appendTargetDiagnostics(issues: ReturnType<typeof validateRealmzTargetRecord>, errors: string[], warnings: string[]) {
  for (const issue of issues) {
    const message = `${issue.message} ${issue.detail}`;
    if (issue.severity === "error") errors.push(message);
    else if (issue.severity === "warning") warnings.push(message);
  }
}

export function benchmarkBrowserProject(project: Project): BenchmarkReport {
  const started = performance.now();
  const validation = validateBrowserProject(project);
  return {
    projectName: project.scenario.name,
    maps: project.maps.length,
    triggers: project.triggers.length,
    extracodes: project.extracodes.length,
    randomLevels: project.randomLevels.length,
    validationMs: Math.round(performance.now() - started),
    estimatedCanvasTiles: project.maps.length * 90 * 90,
    ok: validation.ok
  };
}
