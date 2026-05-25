import { BenchmarkReport, Project, ValidationReport } from "../types";
import { BrowserScenarioSource, readProjectJson, readScenarioSource } from "./fsAccess";
import { browserTilesetAtlasUrl } from "./atlasPaths";
import { buildBrowserSemanticSchema } from "./semantic";
import { landlookBaseTile, parseScenarioBuffers, TRACKED_FILES } from "./realmzParser";
import { assetFallbacks, blockedSemanticObjects, generatedRuntimeCaches, resourceGaps, unresolvedLinks } from "../semanticGraph";

export function createBrowserProject(projectName: string): Project {
  const safeName = projectName.trim() || "Untitled Scenario";
  const project: Project = {
    schemaVersion: 4,
    appVersion: "browser-preview",
    scenario: {
      name: safeName,
      projectPath: `browser://${safeName}.providence`,
      importedAt: new Date().toISOString()
    },
    source: {
      sourcePath: "",
      rawSourcesDir: "browser-memory",
      files: [],
      immutable: true
    },
    maps: [],
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
  const scenarioName = source.name || "Untitled Scenario";
  const projectPath = `browser://${scenarioName}.providence`;
  const project: Project = {
    schemaVersion: 4,
    appVersion: "browser-preview",
    scenario: {
      name: scenarioName,
      projectPath,
      importedAt: new Date().toISOString()
    },
    source: {
      sourcePath: `browser://${scenarioName}`,
      rawSourcesDir: "browser-memory",
      files: sourceFiles,
      immutable: true
    },
    maps: parsed.maps,
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

export async function openBrowserProject(source: BrowserScenarioSource): Promise<Project> {
  const text = await readProjectJson(source);
  const project = JSON.parse(text) as Project;
  project.assets ??= [];
  project.messages ??= [];
  project.battles ??= [];
  project.treasures ??= [];
  project.shops ??= [];
  project.simpleEncounters ??= [];
  project.complexEncounters ??= [];
  project.questLabels ??= [];
  project.editorMetadata ??= { displayNames: {} };
  project.semanticSchema.decoding ??= { ed3Reachability: [], dispatcherNoops: [], confidenceDebt: [] };
  backfillTilesetMetadata(project);
  project.validation = validateBrowserProject(project);
  return project;
}

function backfillTilesetMetadata(project: Project) {
  for (const tileset of project.assetCatalog.tilesets) {
    if (tileset.baseTile == null) tileset.baseTile = landlookBaseTile(tileset.landlook);
  }
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
    warnings.push(`${caches.length.toLocaleString()} generated runtime cache model(s) are inspect-only and will not be authored on export.`);
  }
  const blocked = blockedSemanticObjects(project);
  for (const entity of blocked.entities) {
    if (entity.summary.edited === true) errors.push(`${entity.id} is marked edited but its semantic edit state is blocked.`);
  }
  for (const record of blocked.records) {
    if (record.summary.edited === true) errors.push(`${record.id} is marked edited but its semantic edit state is blocked.`);
  }
  const sourceNames = new Set(project.source.files.map((file) => file.name));
  const exportableFiles = ["Data LD", "Data DL", "Data DD", "Data DDD", "Data RD", "Data RDD", "Data ED3", "Data EDCD", "Data ED", "Data ED2", "Data BD", "Data SD", "Data SD2", "Data TD"].filter((name) =>
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
