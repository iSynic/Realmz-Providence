import { BenchmarkReport, Project, ScenarioShell, ValidationReport } from "../types";
import { BrowserProjectSource, BrowserRawSourceSnapshot, BrowserScenarioSource, readProjectPackage, readScenarioSource } from "./fsAccess";
import { browserReferenceAtlasUrl, browserTilesetAtlasUrl, hasBrowserReferenceAtlas } from "./atlasPaths";
import { parseResourceFork, parseStringListResource } from "./library";
import { buildBrowserSemanticSchema, type BrowserSemanticBuildProgress } from "./semantic";
import { landlookBaseTile, landlookName, landlookPictId, parseLandlookMapstats, parseScenarioBuffers, TRACKED_FILES } from "./realmzParser";
import { inspectResourcePreview } from "./resourcePreview";
import { assetFallbacks, blockedSemanticObjects, generatedRuntimeCaches, resourceGaps, unresolvedLinks } from "../semanticGraph";
import { validateRealmzTargetRecord } from "../targetValidation";
import { tileIconCandidates } from "../map/renderValues";
import { defaultRuleNames } from "../ruleNames";

const EMPTY_TARGET_COMPATIBILITY = { blockers: [], warnings: [], notes: [] };
const MAP_SIZE = 90;
const FIELD_BYTES = MAP_SIZE * MAP_SIZE * 2;
const RANDOM_LEVEL_BYTES = 644;
const pendingBrowserSemantics = new Map<string, { files: Map<string, Uint8Array>; sourceFiles: Project["source"]["files"] }>();
const browserScenarioPreviewSources = new Map<string, Map<string, Uint8Array>>();
const browserScenarioResourcePreviewCache = new Map<string, string | null>();
const browserScenarioRawSourceSnapshots = new Map<string, BrowserRawSourceSnapshot>();
let bundledLandlookMapstatsPromise: Promise<Project["tileAttributes"]> | null = null;

export function createBrowserProject(projectName: string): Project {
  const safeName = projectName.trim() || "Untitled Scenario";
  const project: Project = createDefaultLandLevelProject({
    schemaVersion: 4,
    appVersion: "browser-preview",
    scenario: {
      name: safeName,
      projectPath: `browser://${safeName}.providence`,
      importedAt: new Date().toISOString(),
      shell: defaultScenarioShell(safeName),
      supportFile: null,
      contactInfo: defaultScenarioContactInfo(safeName),
      restrictions: null,
      globalMacroHooks: null,
      securityBackup: null
    },
    source: {
      sourcePath: "",
      rawSourcesDir: "browser-memory",
      files: [],
      immutable: true
    },
    maps: [],
    landLayout: null,
    mapRecords: [],
    tileAttributes: [],
    triggers: [],
    randomLevels: [],
    extracodes: [],
    messages: [],
    optionLabels: [],
    battles: [],
    monsters: [],
    monsterSets: [],
    monsterDescriptions: [],
    monsterIconOverrides: [],
    scenarioIconResources: [],
    scenarioItems: [],
    treasures: [],
    shops: [],
    simpleEncounters: [],
    complexEncounters: [],
    thiefEncounters: [],
    timedEncounters: [],
    questLabels: [],
    spellOverrides: [],
    raceOverrides: [],
    casteOverrides: [],
    ruleNames: defaultRuleNames(),
    assets: [],
    assetCatalog: { tilesets: [] },
    editorMetadata: { displayNames: {}, tilePalettes: [], mapStamps: [], questThreads: [], questContextSources: [] },
    records: { counts: {}, alignments: [] },
    diagnostics: [],
    semanticSchema: emptySemanticSchema(),
    validation: { ok: true, errors: [], warnings: [], exportableFiles: [], passThroughFiles: [], targetCompatibilityIssues: [], targetCompatibility: EMPTY_TARGET_COMPATIBILITY }
  });
  project.validation = validateBrowserProject(project);
  return project;
}

function createDefaultLandLevelProject(project: Project): Project {
  const fillTile = landlookBaseTile(0) ?? 1;
  return {
    ...project,
    maps: [
      ...project.maps,
      {
        id: "land:0",
        levelType: "land",
        source: "Data LD",
        index: 0,
        name: "Land Level 0",
        width: MAP_SIZE,
        height: MAP_SIZE,
        tiles: new Array(MAP_SIZE * MAP_SIZE).fill(fillTile),
        render: { tilesetId: "landlook-0", landlook: 0, mode: "outdoor-landlook" },
        provenance: { sourceFile: "Data LD", recordIndex: 0, byteOffset: 0, byteLength: FIELD_BYTES, confidence: "inferred" }
      }
    ],
    randomLevels: [
      ...project.randomLevels,
      {
        id: "land:0:randlevel",
        source: "Data RD",
        levelType: "land",
        levelIndex: 0,
        landlook: 0,
        isDark: false,
        useLos: false,
        rects: [],
        rawValues: new Array(RANDOM_LEVEL_BYTES / 2).fill(0),
        provenance: { sourceFile: "Data RD", recordIndex: 0, byteOffset: 0, byteLength: RANDOM_LEVEL_BYTES, confidence: "inferred" }
      }
    ],
    assetCatalog: {
      ...project.assetCatalog,
      tilesets: [...(project.assetCatalog?.tilesets ?? []), browserReferenceTileset(0)]
    }
  };
}

export async function importBrowserScenario(source: BrowserScenarioSource): Promise<Project> {
  const { files, sourceFiles, rawSources } = await readScenarioSource(source, TRACKED_FILES);
  const parsed = parseScenarioBuffers(files);
  parsed.tileAttributes.push(...await loadBundledLandlookMapstats());
  const scenarioName = source.name || "Untitled Scenario";
  const projectPath = `browser://${scenarioName}.providence`;
  const scenarioShell = parseImportedScenarioShell(scenarioName, files) ?? defaultScenarioShell(scenarioName);
  const project: Project = {
    schemaVersion: 4,
    appVersion: "browser-preview",
    scenario: {
      name: scenarioName,
      projectPath,
      importedAt: new Date().toISOString(),
      shell: scenarioShell,
      supportFile: parseScenarioSupportFile("Scenario", files.get("Scenario")),
      contactInfo: parseScenarioContactInfo(files.get("Data CI")) ?? defaultScenarioContactInfo(scenarioName),
      restrictions: parseScenarioRestrictions(files.get("Data RI")),
      globalMacroHooks: parseGlobalMacroHooks(files.get("Global")),
      securityBackup: parseScenarioShell("Data CS", files.get("Data CS"))
    },
    source: {
      sourcePath: `browser://${scenarioName}`,
      rawSourcesDir: "browser-memory",
      files: sourceFiles,
      immutable: true
    },
    maps: parsed.maps,
    landLayout: parsed.landLayout,
    mapRecords: parsed.mapRecords,
    tileAttributes: parsed.tileAttributes,
    triggers: parsed.triggers,
    randomLevels: parsed.randomLevels,
    extracodes: parsed.extracodes,
    messages: parsed.messages,
    optionLabels: parsed.optionLabels,
    battles: parsed.battles,
    monsters: parsed.monsters,
    monsterSets: parsed.monsterSets,
    monsterDescriptions: parsed.monsterDescriptions,
    monsterIconOverrides: parsed.monsterIconOverrides,
    scenarioIconResources: [],
    scenarioItems: parsed.scenarioItems,
    treasures: parsed.treasures,
    shops: parsed.shops,
    simpleEncounters: parsed.simpleEncounters,
    complexEncounters: parsed.complexEncounters,
    thiefEncounters: parsed.thiefEncounters,
    timedEncounters: parsed.timedEncounters,
    questLabels: [],
    spellOverrides: parsed.spellOverrides,
    raceOverrides: parsed.raceOverrides,
    casteOverrides: parsed.casteOverrides,
    ruleNames: parseBrowserRuleNames(files),
    assets: [],
    assetCatalog: parsed.assetCatalog,
    editorMetadata: { displayNames: {}, tilePalettes: [], mapStamps: [], questThreads: [], questContextSources: [] },
    records: parsed.records,
    diagnostics: parsed.diagnostics,
    semanticSchema: emptySemanticSchema(0),
    validation: { ok: true, errors: [], warnings: [], exportableFiles: [], passThroughFiles: [], targetCompatibilityIssues: [], targetCompatibility: EMPTY_TARGET_COMPATIBILITY }
  };
  registerBrowserSourceSnapshot(project, rawSources);
  project.validation = validateBrowserProject(project);
  return project;
}

export function loadBrowserScenarioResourcePreview(project: Project | null | undefined, resourceType: string, resourceId: number) {
  if (!project || !Number.isFinite(resourceId)) return null;
  const cacheKey = `${browserSemanticCacheKey(project)}\n${normalizeResourceType(resourceType)}\n${resourceId}`;
  if (browserScenarioResourcePreviewCache.has(cacheKey)) return browserScenarioResourcePreviewCache.get(cacheKey) ?? null;
  const files = browserScenarioPreviewSources.get(browserSemanticCacheKey(project));
  if (!files) return null;
  const wantedType = normalizeResourceType(resourceType);
  for (const [name, bytes] of files) {
    if (!isScenarioResourceForkName(name)) continue;
    for (const resource of parseResourceFork(bytes)) {
      if (normalizeResourceType(resource.resourceType) !== wantedType || !resourceIdsMatch(wantedType, resource.id, resourceId)) continue;
      const preview = inspectResourcePreview(resource.resourceType, resource.data);
      browserScenarioResourcePreviewCache.set(cacheKey, preview.dataUrl ?? null);
      return preview.dataUrl ?? null;
    }
  }
  browserScenarioResourcePreviewCache.set(cacheKey, null);
  return null;
}

function normalizeResourceType(resourceType: string) {
  return resourceType.trim();
}

function resourceIdsMatch(resourceType: string, availableId: number, requestedId: number) {
  if (availableId === requestedId) return true;
  return resourceType === "snd" && Math.abs(availableId) === Math.abs(requestedId);
}

function isScenarioResourceForkName(name: string) {
  const normalized = name.trim().replace(/\\/g, "/").toLowerCase();
  const baseName = normalized.split("/").pop() ?? normalized;
  return baseName === "scenario" ||
    baseName === "._scenario" ||
    baseName === "scenario.rsrc" ||
    baseName === "scenario.rsf" ||
    normalized.endsWith("/.rsrc/scenario");
}

export async function buildPendingBrowserSemanticSchema(project: Project): Promise<{ semanticSchema: Project["semanticSchema"]; validation: Project["validation"] } | null> {
  const key = browserSemanticCacheKey(project);
  const pending = pendingBrowserSemantics.get(key);
  if (!pending) return null;
  return buildBrowserSemanticSchemaForProject(project);
}

export async function buildBrowserSemanticSchemaForProject(
  project: Project,
  onProgress?: (progress: BrowserSemanticBuildProgress) => void
): Promise<{ semanticSchema: Project["semanticSchema"]; validation: Project["validation"] }> {
  const key = browserSemanticCacheKey(project);
  const pending = pendingBrowserSemantics.get(key);
  const request = {
    scenario: project.scenario,
    buffers: pending?.files ?? new Map<string, Uint8Array>(),
    sourceFiles: pending?.sourceFiles ?? project.source.files ?? [],
    maps: project.maps,
    mapRecords: project.mapRecords,
    randomLevels: project.randomLevels,
    triggers: project.triggers,
    extracodes: project.extracodes,
    battles: project.battles,
    monsters: project.monsters,
    monsterSets: project.monsterSets,
    assetCatalog: project.assetCatalog,
    records: project.records
  };
  const semanticSchema = await buildBrowserSemanticSchemaAsync(request, onProgress);
  if (pending) pendingBrowserSemantics.delete(key);
  return {
    semanticSchema,
    validation: validateBrowserProject({ ...project, semanticSchema })
  };
}

function browserSemanticCacheKey(project: Project) {
  return project.source.sourcePath || project.scenario.projectPath || project.scenario.name;
}

export function registerBrowserSourceSnapshot(project: Project, rawSources: BrowserRawSourceSnapshot | null | undefined) {
  if (!rawSources) return;
  const key = browserSemanticCacheKey(project);
  const files = browserBuffersFromRawSourceSnapshot(rawSources);
  browserScenarioRawSourceSnapshots.set(key, rawSources);
  browserScenarioPreviewSources.set(key, files);
  pendingBrowserSemantics.set(key, { files, sourceFiles: project.source.files ?? [] });
}

export function browserSourceSnapshotForProject(project: Project | null | undefined) {
  return project ? browserScenarioRawSourceSnapshots.get(browserSemanticCacheKey(project)) ?? null : null;
}

function browserBuffersFromRawSourceSnapshot(rawSources: BrowserRawSourceSnapshot) {
  const files = new Map<string, Uint8Array>();
  for (const file of rawSources.files) {
    storeRawSourceBuffer(files, file.name, file.relativePath, file.bytesData);
  }
  return files;
}

function storeRawSourceBuffer(files: Map<string, Uint8Array>, name: string, relativePath: string, bytes: Uint8Array) {
  files.set(name, bytes);
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized && normalized !== name) files.set(normalized, bytes);
}

function buildBrowserSemanticSchemaAsync(
  request: Parameters<typeof buildBrowserSemanticSchema>[0],
  onProgress?: (progress: BrowserSemanticBuildProgress) => void
): Promise<Project["semanticSchema"]> {
  if (typeof Worker === "undefined") return Promise.resolve(buildBrowserSemanticSchema(request, onProgress));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./semanticWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (
      event: MessageEvent<
        | { ok: true; semanticSchema: Project["semanticSchema"] }
        | { ok: "progress"; progress: BrowserSemanticBuildProgress }
        | { ok: false; error: string }
      >
    ) => {
      if (event.data.ok === "progress") {
        onProgress?.(event.data.progress);
        return;
      }
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.semanticSchema);
      } else {
        reject(new Error(event.data.error));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Browser semantic worker failed."));
    };
    worker.postMessage(request);
  });
}

function emptySemanticSchema(schemaVersion = 5): Project["semanticSchema"] {
  return {
    schemaVersion,
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
    rawBytes: Array.from(buffer.slice(0, 4608)),
    authored: false
  };
}

function parseScenarioShell(sourceFile: string, buffer?: Uint8Array): ScenarioShell | null {
  if (!buffer || buffer.byteLength < 316) return null;
  return {
    sourceFile,
    recLevel: i32At(buffer, 0),
    maxLevel: i32At(buffer, 4),
    landLevel: i32At(buffer, 8),
    lookX: i32At(buffer, 12),
    lookY: i32At(buffer, 16),
    codeseg1: Array.from(buffer.slice(20, 40)),
    codeseg2: Array.from(buffer.slice(40, 60)),
    creatorUser: pascalString(buffer.slice(60, 316)),
    trailingBytes: Array.from(buffer.slice(316)),
    authored: false,
    provenance: {
      sourceFile,
      recordIndex: 0,
      byteOffset: 0,
      byteLength: buffer.byteLength,
      confidence: "confirmed"
    }
  };
}

function parseScenarioSupportFile(sourceFile: string, buffer?: Uint8Array): Project["scenario"]["supportFile"] {
  if (!buffer || buffer.byteLength < 40) return null;
  return {
    sourceFile,
    divinityStringEditorSlot: buffer[23],
    divinityStringSoundId: i16At(buffer, 38),
    rawBytes: Array.from(buffer),
    authored: false,
    provenance: {
      sourceFile,
      recordIndex: 0,
      byteOffset: 0,
      byteLength: buffer.byteLength,
      confidence: "confirmed"
    }
  };
}

function parseImportedScenarioShell(scenarioName: string, files: Map<string, Uint8Array>): ScenarioShell | null {
  const exact = parseScenarioShell(scenarioName, files.get(scenarioName));
  if (exact) return exact;
  const candidates = [...files.entries()]
    .filter(([name, buffer]) => isScenarioMarkerCandidate(name, buffer))
    .sort(([leftName, leftBytes], [rightName, rightBytes]) => {
      const leftExactSize = leftBytes.byteLength === 316 ? 0 : 1;
      const rightExactSize = rightBytes.byteLength === 316 ? 0 : 1;
      return leftExactSize - rightExactSize || leftName.localeCompare(rightName);
    });
  for (const [name, buffer] of candidates) {
    const shell = parseScenarioShell(name, buffer);
    if (shell) return shell;
  }
  return null;
}

function isScenarioMarkerCandidate(name: string, buffer: Uint8Array) {
  return buffer.byteLength >= 316
    && name !== "Scenario"
    && name !== "Global"
    && name !== "Layout"
    && name !== "Data CS"
    && !name.startsWith("Data ")
    && !name.endsWith(".rsrc")
    && !name.endsWith(".rsf")
    && !name.startsWith("._");
}

function parseScenarioRestrictions(buffer?: Uint8Array): Project["scenario"]["restrictions"] {
  if (!buffer || buffer.byteLength < 320) return null;
  return {
    description: pascalString(buffer.slice(0, 256)),
    maxPartyCharacters: i16At(buffer, 256),
    maxPartyLevel: i16At(buffer, 258),
    bannedRaces: Array.from(buffer.slice(260, 290)).flatMap((value, index) => value ? [index + 1] : []),
    bannedCastes: Array.from(buffer.slice(290, 320)).flatMap((value, index) => value ? [index + 1] : []),
    rawBytes: Array.from(buffer.slice(0, 320)),
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

function i32At(buffer: Uint8Array, offset: number) {
  const value = ((buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]) >>> 0;
  return value & 0x80000000 ? value - 0x100000000 : value;
}

export async function openBrowserProject(source: BrowserProjectSource): Promise<Project> {
  const { projectJson, rawSources } = await readProjectPackage(source);
  const project = normalizeBrowserProject(JSON.parse(projectJson) as Project);
  if (rawSources) registerBrowserSourceSnapshot(project, rawSources);
  return project;
}

export function normalizeBrowserProject(project: Project): Project {
  project.assets ??= [];
  project.scenario.shell ??= defaultScenarioShell(project.scenario.name);
  project.scenario.contactInfo ??= defaultScenarioContactInfo(project.scenario.name);
  project.scenario.restrictions ??= null;
  project.scenario.globalMacroHooks ??= null;
  project.scenario.securityBackup ??= null;
  project.mapRecords ??= [];
  project.tileAttributes ??= [];
  project.messages ??= [];
  project.optionLabels ??= [];
  project.battles ??= [];
  project.monsters ??= [];
  project.monsterSets ??= [];
  project.monsterDescriptions ??= [];
  project.monsterIconOverrides ??= [];
  project.scenarioIconResources ??= [];
  project.scenarioItems ??= [];
  project.treasures ??= [];
  project.shops ??= [];
  project.simpleEncounters ??= [];
  project.complexEncounters ??= [];
  project.thiefEncounters ??= [];
  project.timedEncounters ??= [];
  project.questLabels ??= [];
  project.spellOverrides ??= [];
  project.raceOverrides ??= [];
  project.casteOverrides ??= [];
  project.ruleNames = defaultRuleNames(project.ruleNames);
  project.editorMetadata ??= { displayNames: {}, tilePalettes: [], mapStamps: [], questThreads: [], questContextSources: [] };
  project.editorMetadata.displayNames ??= {};
  project.editorMetadata.tilePalettes ??= [];
  project.editorMetadata.mapStamps ??= [];
  project.editorMetadata.questThreads ??= [];
  project.editorMetadata.questContextSources ??= [];
  project.semanticSchema ??= emptySemanticSchema();
  project.semanticSchema.decoding ??= { ed3Reachability: [], dispatcherNoops: [], confidenceDebt: [] };
  backfillTilesetMetadata(project);
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
  bundledLandlookMapstatsPromise ??= loadBundledLandlookMapstatsUncached();
  return [...await bundledLandlookMapstatsPromise];
}

async function loadBundledLandlookMapstatsUncached() {
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
  project.assetCatalog.pictures ??= [];
  project.assetCatalog.icons ??= [];
  project.assetCatalog.sounds ??= [];

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
      source: "Browser project hydration: bundled Realmz reference PICT",
      available: hasBrowserReferenceAtlas(302),
      imagePath: null,
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
    if (referenceUrl && (!tileset.imagePath || tileset.imagePath.startsWith("assets/") || tileset.imagePath.startsWith("assets\\") || isLegacyLocalReferencePath(tileset.imagePath))) {
      tileset.imagePath = null;
      tileset.available = true;
      tileset.source = "Browser project hydration: bundled Realmz reference PICT";
    }
  }
}

function parseBrowserRuleNames(files: Map<string, Uint8Array>) {
  let ruleNames = defaultRuleNames();
  for (const [name, bytes] of files) {
    const normalized = name.replace(/\\/g, "/").toLowerCase();
    const baseName = normalized.split("/").pop() ?? normalized;
    if (baseName !== "custom names.rsrc" && baseName !== "custom names.rsf" && baseName !== "._custom names") continue;
    let found = false;
    for (const resource of parseResourceFork(bytes)) {
      if (resource.resourceType !== "STR#") continue;
      if (resource.id === 129) {
        ruleNames = { ...ruleNames, raceNames: mergeRuleNameStrings(ruleNames.raceNames, parseStringListResource(resource.data)) };
        found = true;
      } else if (resource.id === 131) {
        ruleNames = { ...ruleNames, casteNames: mergeRuleNameStrings(ruleNames.casteNames, parseStringListResource(resource.data)) };
        found = true;
      }
    }
    if (found) {
      return {
        ...ruleNames,
        sourceFile: name.includes("/") || name.includes("\\") ? name : "Data Files/Custom Names.rsrc",
        authored: false,
        provenance: { sourceFile: name, recordIndex: 0, byteOffset: 0, byteLength: bytes.byteLength, confidence: "source-backed" }
      };
    }
  }
  return ruleNames;
}

function mergeRuleNameStrings(defaults: string[], decoded: string[]) {
  return defaults.map((fallback, index) => decoded[index]?.trim() || fallback);
}

function browserReferenceTileset(landlook: number) {
  const pictId = landlookPictId(landlook);
  const imagePath = browserReferenceAtlasUrl(pictId);
  return {
    id: `landlook-${landlook}`,
    landlook,
    name: landlookName(landlook),
    source: imagePath
      ? "Browser project hydration: bundled Realmz reference PICT"
      : "Browser project hydration: missing reference atlas",
    available: hasBrowserReferenceAtlas(pictId),
    imagePath: null,
    pictId,
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    baseTile: landlookBaseTile(landlook),
    custom: landlook >= 6 && landlook <= 8
  };
}

function isLegacyLocalReferencePath(value: string) {
  const normalized = value.replace(/\\/g, "/").toLowerCase();
  return normalized.startsWith("/@fs/")
    || normalized.includes("realmz scenario utility/")
    || normalized.includes("f:/realmz");
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
  for (const levelType of ["land", "dungeon"] as const) {
    const maps = project.maps.filter((map) => map.levelType === levelType).sort((a, b) => a.index - b.index);
    maps.forEach((map, expected) => {
      if (map.index !== expected) {
        errors.push(`${levelType} maps must have dense indices; expected ${expected}, found ${map.index}.`);
      }
    });
  }
  for (const alignment of project.records.alignments) {
    if (alignment.status === "has-trailing-bytes") {
      warnings.push(`${alignment.source} has ${alignment.trailingBytes} trailing bytes after full records.`);
    }
  }
  for (const asset of project.assets ?? []) {
    if (asset.exportState === "blocked") errors.push(`${asset.label} needs adjustment before Realmz export.`);
    if (asset.exportState === "preview-only") warnings.push(`${asset.label} is preview-only in the browser; desktop export needs converted resource bytes.`);
    if (!["PICT", "cicn", "snd "].includes(asset.resourceType)) errors.push(`${asset.label} uses unsupported resource type ${asset.resourceType}.`);
    if (asset.kind === "picture" && asset.resourceType !== "PICT") errors.push(`${asset.label} must export as a PICT resource.`);
    if (asset.kind === "sound" && asset.resourceType !== "snd ") errors.push(`${asset.label} must export as an snd resource.`);
    if ((asset.kind === "icon" || asset.kind === "special-land-tile") && asset.resourceType !== "cicn") {
      errors.push(`${asset.label} must export as a cicn resource.`);
    }
    if ((asset.kind === "icon" || asset.kind === "special-land-tile") && (asset.width !== 32 || asset.height !== 32)) {
      warnings.push(`${asset.label} should be converted to 32 x 32 pixels before export.`);
    }
    for (const warning of asset.conversion?.warnings ?? []) warnings.push(`${asset.label} import note: ${warning}`);
  }
  for (const message of project.messages ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "message", message.id), errors, warnings);
  for (const option of project.optionLabels ?? []) {
    if (option.text.length > 24) errors.push(`Option label ${option.id} is too long for Realmz's 24-character option string slot.`);
    if (!/^[\x00-\x7F]*$/.test(option.text)) warnings.push(`Option label ${option.id} contains non-ASCII text and may not render as intended.`);
  }
  validateRulesRecords(project, errors, warnings);
  for (const battle of project.battles ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "battle", battle.id), errors, warnings);
  for (const description of project.monsterDescriptions ?? []) {
    if (description.text.length > 255) errors.push(`Monster description ${description.id} is too long for Realmz's 255-character description slot.`);
    if (!/^[\x00-\x7F]*$/.test(description.text)) warnings.push(`Monster description ${description.id} contains non-ASCII text and may not render as intended.`);
  }
  for (const monster of project.monsters ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "monster", monster.id), errors, warnings);
  for (const treasure of project.treasures ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "treasure", treasure.id), errors, warnings);
  for (const shop of project.shops ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "shop", shop.id), errors, warnings);
  for (const encounter of project.simpleEncounters ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "simpleEncounter", encounter.id), errors, warnings);
  for (const encounter of project.complexEncounters ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "complexEncounter", encounter.id), errors, warnings);
  for (const encounter of project.thiefEncounters ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "thiefEncounter", encounter.id), errors, warnings);
  for (const encounter of project.timedEncounters ?? []) appendTargetDiagnostics(validateRealmzTargetRecord(project, "timedEncounter", encounter.id), errors, warnings);
  if ((project.assets ?? []).length > 0) {
    warnings.push(`${project.assets.length.toLocaleString()} managed media asset(s) are present; desktop export writes them to the Scenario resource fork.`);
  }
  if ((project.assets ?? []).some((asset) => asset.kind === "text" && (asset.resourceType === "TEXT" || asset.resourceType.trim() === "styl"))) {
    warnings.push("Scrolling Text TEXT/styl export is runtime-suspect: recent Windows Realmz testing ignored styl formatting, and Mac Realmz 7.1.2 crashed after a Providence-authored Scrolling Text action step.");
  }
  if (project.semanticSchema.schemaVersion !== 5) {
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
  const exportableFiles = ["Data LD", "Data DL", "Data DD", "Data DDD", "Data RD", "Data RDD", "Layout", "Data ED3", "Data EDCD", "Data ED", "Data ED2", "Data TD2", "Data TD3", "Data MD", "Data MD1", "Data MD-1", "Data DES", "Data BD", "Data SD", "Data SD2", "Data OD", "Data MD2", "Data TD"].filter((name) =>
    sourceNames.has(name) || (name === "Layout" && project.landLayout)
  );
  const passThroughFiles = project.source.files
    .filter((file) => !file.editable && !isGeneratedRuntimeCacheFile(file.name))
    .map((file) => file.name);
  if (passThroughFiles.length > 0) {
    warnings.push(`${passThroughFiles.length.toLocaleString()} unsupported source file(s) will pass through unchanged: ${passThroughFiles.slice(0, 10).join(", ")}.`);
  }
  for (const source of project.source.files) {
    if (isGeneratedRuntimeCacheFile(source.name)) {
      warnings.push(`${source.name} looks like a generated runtime cache and is treated as evidence, not authored data.`);
    }
  }
  return { ok: errors.length === 0, errors, warnings, exportableFiles, passThroughFiles, targetCompatibilityIssues: [], targetCompatibility: EMPTY_TARGET_COMPATIBILITY };
}

function isGeneratedRuntimeCacheFile(name: string) {
  return ["CL", "CD", "CE", "CE2", "CS", "CT", "CTD3", "Data MENU"].includes(name);
}

function validateRulesRecords(project: Project, errors: string[], warnings: string[]) {
  project.ruleNames = defaultRuleNames(project.ruleNames);
  for (const spell of project.spellOverrides ?? []) {
    if (spell.id < 0 || spell.id > 104) errors.push(`Custom spell ${spell.id} is outside Data Spell's 0..104 custom slot range.`);
    for (const [field, value] of [
      ["Fixed Range", spell.range1],
      ["Power Range", spell.range2],
      ["Queue Icon", spell.queueIcon],
      ["No. of Attacks", spell.fixedTargetNum],
      ["Can Rotate", spell.canRotate],
      ["Cannot", spell.cannot],
      ["Base SP Cost", spell.cost],
      ["Fixed Damage Low", spell.damage1],
      ["Fixed Damage High", spell.damage2],
      ["Power Damage Low", spell.powerDamage1],
      ["Power Damage High", spell.powerDamage2],
      ["Fixed Duration Low", spell.duration1],
      ["Fixed Duration High", spell.duration2],
      ["Power Duration Low", spell.powerDuration1],
      ["Power Duration High", spell.powerDuration2],
      ["Cast Icon", spell.spellLook1],
      ["Resolution Icon", spell.spellLook2],
      ["Casting Sound", spell.sound1],
      ["Resolution Sound", spell.sound2],
      ["Target Type", spell.targetType],
      ["Spell Size", spell.size],
      ["Spell Effect", spell.special],
      ["Damage Type", spell.damageType],
      ["Spell Class", spell.spellClass]
    ] as const) {
      validateRange(errors, `Custom spell ${spell.id} ${field}`, value, 0, 255, "unsigned byte");
    }
    for (const [field, value] of [
      ["+/- To Hit %", spell.toHitBonus],
      ["+/- To DRV %", spell.saveBonus],
      ["Resist Type", spell.saveAdjust],
      ["+/- Resist / Level", spell.resistAdjust]
    ] as const) {
      validateRange(errors, `Custom spell ${spell.id} ${field}`, value, -128, 127, "signed byte");
    }
    if (spell.targetType < 0 || spell.targetType > 11) warnings.push(`Custom spell ${spell.id} Target Type ${spell.targetType} is outside Divinity's 0..11 target type list.`);
    if (spell.damageType < 0 || spell.damageType > 9) warnings.push(`Custom spell ${spell.id} Damage Type ${spell.damageType} is outside the known 0..9 damage type list.`);
  }

  for (const race of project.raceOverrides ?? []) {
    if (race.id < 0 || race.id > 69) errors.push(`Race override ${race.id} is outside Data Race's 0..69 record range.`);
    validateLength(errors, `Race ${race.id} +/- To Hit`, race.plusMinusToHit, 8);
    validateLength(errors, `Race ${race.id} Special Ability`, race.specialAbility, 14);
    validateLength(errors, `Race ${race.id} DRVs`, race.drvBonus, 8);
    validateLength(errors, `Race ${race.id} Att Bonus`, race.attBonus, 6);
    validateLength(errors, `Race ${race.id} Attribute Min/Max`, race.minMax, 12);
    validateLength(errors, `Race ${race.id} Conditions`, race.conditions, 40);
    validateLength(errors, `Race ${race.id} Caste Permissions`, race.canCaste, 30);
    validateLength(errors, `Race ${race.id} Item Type Words`, race.itemTypes, 2);
    for (const [field, values] of [
      ["+/- To Hit", race.plusMinusToHit],
      ["Special Ability", race.specialAbility],
      ["DRVs", race.drvBonus],
      ["Att Bonus", race.attBonus],
      ["Attribute Min/Max", race.minMax],
      ["Conditions", race.conditions],
      ["No. of Attacks", race.numOfAttacks]
    ] as const) validateNumberArray(errors, `Race ${race.id} ${field}`, values, -32768, 32767, "signed 16-bit");
    for (const [field, value] of [
      ["Max Age", race.maxAge],
      ["Does Not Die", race.doesNotDie],
      ["Base Movement Points", race.baseMove],
      ["Magic Resistance", race.magRes],
      ["Two Handed Weapon", race.twoHand],
      ["Missile Weapon", race.missile],
      ["Default Portrait Set", race.defaultIconSet],
      ["Descriptors", race.descriptors]
    ] as const) validateRange(errors, `Race ${race.id} ${field}`, value, -32768, 32767, "signed 16-bit");
    validateNumberArray(errors, `Race ${race.id} Caste Permissions`, race.canCaste, 0, 255, "unsigned byte");
    validateNumberArray(errors, `Race ${race.id} Item Type Words`, race.itemTypes, -2147483648, 2147483647, "signed 32-bit");
    validateRaceMatrices(race.id, race.ageRange, race.ageChange, errors);
    if (race.minMax.length >= 12) validateMinMaxPairs(`Race ${race.id}`, race.minMax, warnings);
  }

  for (const caste of project.casteOverrides ?? []) {
    if (caste.id < 0 || caste.id > 29) errors.push(`Caste override ${caste.id} is outside Data Caste's 0..29 record range.`);
    validateMatrix(errors, `Caste ${caste.id} Special Ability`, caste.specialAbility, 2, 14, -32768, 32767, "signed 16-bit");
    validateMatrix(errors, `Caste ${caste.id} Spellcasters`, caste.spellcasters, 4, 3, -32768, 32767, "signed 16-bit");
    for (const [field, values, length] of [
      ["DRVs", caste.drvBonus, 8],
      ["Att Bonus", caste.attBonus, 6],
      ["Attribute Min/Max", caste.minMax, 12],
      ["Conditions", caste.conditions, 40],
      ["Stamina", caste.stamina, 2],
      ["Strength", caste.strength, 2],
      ["Dodge", caste.dodge, 2],
      ["To Hit", caste.toHit, 2],
      ["Missile", caste.missile, 2],
      ["Hand To Hand", caste.hand2Hand, 2],
      ["Starting Items", caste.startItems, 20]
    ] as const) {
      validateLength(errors, `Caste ${caste.id} ${field}`, values, length);
      validateNumberArray(errors, `Caste ${caste.id} ${field}`, values, -32768, 32767, "signed 16-bit");
    }
    validateLength(errors, `Caste ${caste.id} Victory Points`, caste.victory, 30);
    validateNumberArray(errors, `Caste ${caste.id} Victory Points`, caste.victory, -2147483648, 2147483647, "signed 32-bit");
    validateLength(errors, `Caste ${caste.id} Bonus Attack Rounds`, caste.attacks, 10);
    validateNumberArray(errors, `Caste ${caste.id} Bonus Attack Rounds`, caste.attacks, 0, 255, "unsigned byte");
    validateLength(errors, `Caste ${caste.id} Item Type Words`, caste.itemTypes, 2);
    validateNumberArray(errors, `Caste ${caste.id} Item Type Words`, caste.itemTypes, -2147483648, 2147483647, "signed 32-bit");
    for (const [field, value] of [
      ["Can Use Missile Weapons", caste.canUseMissile],
      ["Missile Bonus Damage", caste.getsMissileBonus],
      ["Caste Class", caste.casteClass],
      ["Minimum Age Group", caste.minimumAgeGroup],
      ["Move Bonus", caste.moveBonus],
      ["Magic Resistance", caste.magRes],
      ["Two Handed Weapon", caste.twoHand],
      ["Max Stamina Bonus", caste.maxStaminaBonus],
      ["Bonus Attacks", caste.bonusAttacks],
      ["Max Attacks", caste.maxAttacks],
      ["Starting Gold", caste.startMoney],
      ["Default Icon", caste.defaultIcon],
      ["Max Spells Per Round", caste.maxSpellsAttacks],
      ["Spells So Far", caste.spellsSoFar]
    ] as const) validateRange(errors, `Caste ${caste.id} ${field}`, value, -32768, 32767, "signed 16-bit");
    if (caste.minMax.length >= 12) validateMinMaxPairs(`Caste ${caste.id}`, caste.minMax, warnings);
  }
}

function validateRaceMatrices(raceId: number, ageRange: number[][], ageChange: number[][], errors: string[]) {
  validateMatrix(errors, `Race ${raceId} Age Ranges`, ageRange, 5, 2, -32768, 32767, "signed 16-bit");
  validateMatrix(errors, `Race ${raceId} Age Changes`, ageChange, 5, 15, -128, 127, "signed byte");
}

function validateMatrix(errors: string[], label: string, values: number[][], rows: number, columns: number, min: number, max: number, rangeLabel: string) {
  if (values.length !== rows) errors.push(`${label} must have ${rows} row(s); found ${values.length}.`);
  for (let row = 0; row < values.length; row += 1) {
    validateLength(errors, `${label} row ${row + 1}`, values[row] ?? [], columns);
    validateNumberArray(errors, `${label} row ${row + 1}`, values[row] ?? [], min, max, rangeLabel);
  }
}

function validateMinMaxPairs(label: string, values: number[], warnings: string[]) {
  for (let index = 0; index + 1 < values.length; index += 2) {
    const min = values[index] ?? 0;
    const max = values[index + 1] ?? 0;
    if (min > max) warnings.push(`${label} attribute pair ${Math.floor(index / 2) + 1} has min ${min} greater than max ${max}.`);
  }
}

function validateLength(errors: string[], label: string, values: unknown[] | undefined, expected: number) {
  const actual = values?.length ?? 0;
  if (actual !== expected) errors.push(`${label} must have ${expected} value(s); found ${actual}.`);
}

function validateNumberArray(errors: string[], label: string, values: number[] | undefined, min: number, max: number, rangeLabel: string) {
  for (const [index, value] of (values ?? []).entries()) {
    validateRange(errors, `${label} ${index + 1}`, value, min, max, rangeLabel);
  }
}

function validateRange(errors: string[], label: string, value: number, min: number, max: number, rangeLabel: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    errors.push(`${label} must fit ${rangeLabel} range ${min}..${max}; found ${value}.`);
  }
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
      const candidates = tileIconCandidates(tile);
      if (candidates.length > 0 && !candidates.some((candidate) => knownIcons.has(candidate))) {
        missingIcons.add(candidates[0] ?? tile);
      }
    }
  }
  if (missingIcons.size > 0) {
    warnings.push(`${missingIcons.size.toLocaleString()} Realmz special tile value(s) do not currently resolve to decoded cicn icon art.`);
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
  for (const resource of project.scenarioIconResources ?? []) insertIconId(ids, resource.resourceId);
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
