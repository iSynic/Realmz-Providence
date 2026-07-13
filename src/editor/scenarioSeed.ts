import type { LibraryCatalog, Project } from "./types";
import { createBrowserProject, validateBrowserProject } from "./browser/project";
import {
  addScenarioSeedDiagnostic as addDiagnostic,
  createScenarioSeedCompilerContext,
  type ScenarioSeedCompilerContext
} from "./scenarioSeed/compilerContext";
import {
  allocateScenarioSeed
} from "./scenarioSeed/allocation";
import {
  addScenarioSeedMapPlacementDiagnostics,
  addScenarioSeedTopologyDiagnostics
} from "./scenarioSeed/diagnostics";
import {
  compileScenarioSeedMaps,
  scenarioSeedOperationRegions
} from "./scenarioSeed/mapCompiler";
import { applyScenarioSeedMapOperation } from "./scenarioSeed/mapOperationCompiler";
import {
  compileScenarioSeedAssets,
  compileScenarioSeedCoreRecords
} from "./scenarioSeed/coreRecordCompiler";
import {
  compileScenarioSeedScripts,
  syncActionPointMarkers
} from "./scenarioSeed/scriptCompiler";
import {
  type ScenarioSeedProjectOptions,
  type ScenarioSeedProjectResult
} from "./scenarioSeed/contracts";
import { parseScenarioSeed } from "./scenarioSeed/parser";

export * from "./scenarioSeed/contracts";
export { parseScenarioSeed };

const PROJECT_SCHEMA_VERSION = 4;

type BuildContext = ScenarioSeedCompilerContext;

export function createProjectFromScenarioSeed(input: unknown, options: ScenarioSeedProjectOptions = {}): ScenarioSeedProjectResult {
  const parsed = parseScenarioSeed(input);
  if (!parsed.ok) return { ...parsed, diagnostics: parsed.errors.map((message) => ({ severity: "error", code: "parse-error", message })) };

  const now = options.now ?? new Date().toISOString();
  const seed = parsed.seed;
  const baseTemplate = seed.baseTemplate ?? "blank";
  const buildContext = createBuildContext(baseTemplate, options.libraryCatalog ?? null);
  let project = createScenarioSeedBaseProject(seed.scenario.name, baseTemplate, options, buildContext);
  if (!project) {
    return { ok: false, errors: buildContext.errors, warnings: [...parsed.warnings, ...buildContext.warnings], allocations: buildContext.allocations, diagnostics: buildContext.diagnostics };
  }
  allocateScenarioSeed(seed, buildContext, { operationRegions: scenarioSeedOperationRegions });
  addScenarioSeedTopologyDiagnostics(seed, buildContext);
  if (buildContext.errors.length > 0) {
    return { ok: false, errors: buildContext.errors, warnings: [...parsed.warnings, ...buildContext.warnings], allocations: buildContext.allocations, diagnostics: buildContext.diagnostics };
  }
  project.schemaVersion = PROJECT_SCHEMA_VERSION;
  project.appVersion = options.appVersion ?? "scenario-seed";
  const scenarioDefaults = createBrowserProject(seed.scenario.name).scenario;
  const scenarioShell = project.scenario.shell ?? scenarioDefaults.shell;
  const contactInfo = project.scenario.contactInfo ?? scenarioDefaults.contactInfo;
  project.scenario = {
    ...project.scenario,
    id: seed.scenario.id ?? project.scenario.id,
    name: seed.scenario.name,
    projectPath: `seed://${slugify(seed.scenario.name)}.providence`,
    importedAt: now,
    shell: scenarioShell
      ? {
          ...scenarioShell,
          ...(seed.scenario.start
            ? {
                landLevel: seed.scenario.start.landLevel,
                lookX: seed.scenario.start.x,
                lookY: seed.scenario.start.y
              }
            : {}),
          sourceFile: seed.scenario.name,
          authored: true
        }
      : null,
    contactInfo: contactInfo
      ? {
          ...contactInfo,
          scenarioName: seed.scenario.name,
          version: seed.scenario.version ?? contactInfo.version,
          date: seed.scenario.date ?? contactInfo.date,
          author: seed.scenario.author ?? contactInfo.author,
          email: seed.scenario.email ?? contactInfo.email,
          web: seed.scenario.web ?? contactInfo.web,
          description: seed.scenario.description ?? contactInfo.description,
          authored: true
        }
      : null
  };
  project.source = {
    sourcePath: `seed://${slugify(seed.scenario.name)}`,
    rawSourcesDir: baseTemplate === "blank" ? "scenario-seed" : project.source.rawSourcesDir || "scenario-seed",
    immutable: false,
    files: baseTemplate === "blank" ? [] : [...(project.source.files ?? [])]
  };

  const compiledAssets = compileScenarioSeedAssets(seed.assets, options.customAssets ?? [], buildContext);
  if (compiledAssets !== undefined) project = { ...project, assets: compiledAssets };

  if (seed.maps !== undefined) {
    const mapCompilation = compileScenarioSeedMaps(seed.maps, buildContext, { applyOperation: applyScenarioSeedMapOperation });
    project.maps = mapCompilation.maps;
    addScenarioSeedMapPlacementDiagnostics(seed, project.maps, buildContext);
    project.randomLevels = mapCompilation.randomLevels;
    project.assetCatalog = {
      ...project.assetCatalog,
      tilesets: mapCompilation.tilesets
    };
  }

  project = compileScenarioSeedCoreRecords(project, seed, buildContext);

  const baseMapTriggers = project.triggers.filter((trigger) => trigger.source !== "Data ED3");
  const baseExtraActionPoints = project.triggers.filter((trigger) => trigger.source === "Data ED3");
  const scriptCompilation = compileScenarioSeedScripts(seed, buildContext, project.extracodes);
  if (seed.simpleEncounters !== undefined) project.simpleEncounters = scriptCompilation.simpleEncounters;
  if (seed.thiefEncounters !== undefined) project.thiefEncounters = scriptCompilation.thiefEncounters;
  if (seed.complexEncounters !== undefined) project.complexEncounters = scriptCompilation.complexEncounters;
  if (seed.timedEncounters !== undefined) project.timedEncounters = scriptCompilation.timedEncounters;
  const generatedMapTriggers = scriptCompilation.triggers.filter((trigger) => trigger.source !== "Data ED3");
  const generatedExtraActionPoints = scriptCompilation.triggers.filter((trigger) => trigger.source === "Data ED3");
  project.triggers = [
    ...(seed.actionPoints === undefined ? baseMapTriggers : generatedMapTriggers),
    ...(seed.extraActionPoints === undefined ? baseExtraActionPoints : generatedExtraActionPoints)
  ];
  project.maps = syncActionPointMarkers(project.maps, project.triggers);
  project.extracodes = scriptCompilation.extracodes;
  project.validation = validateBrowserProject(project);
  if (buildContext.errors.length > 0) {
    return { ok: false, errors: buildContext.errors, warnings: [...parsed.warnings, ...buildContext.warnings, ...project.validation.warnings], allocations: buildContext.allocations, diagnostics: buildContext.diagnostics };
  }
  return { ok: true, project, warnings: [...parsed.warnings, ...buildContext.warnings, ...project.validation.warnings], allocations: buildContext.allocations, diagnostics: buildContext.diagnostics };
}

function createScenarioSeedBaseProject(projectName: string, baseTemplate: string, options: ScenarioSeedProjectOptions, context: BuildContext): Project | null {
  if (baseTemplate === "blank") return createBrowserProject(projectName);
  const templates = options.baseTemplates;
  if (!templates || !Object.prototype.hasOwnProperty.call(templates, baseTemplate)) {
    addDiagnostic(context, "error", "unresolved-base-template", `Base template "${baseTemplate}" was not provided by the caller.`, "base template", baseTemplate);
    return null;
  }
  const template = templates[baseTemplate];
  try {
    return JSON.parse(JSON.stringify(template)) as Project;
  } catch {
    addDiagnostic(context, "error", "invalid-base-template", `Base template "${baseTemplate}" could not be cloned as Providence project data.`, "base template", baseTemplate);
    return null;
  }
}

function createBuildContext(baseTemplate = "blank", libraryCatalog: LibraryCatalog | null = null): BuildContext {
  return createScenarioSeedCompilerContext(baseTemplate, libraryCatalog);
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-scenario";
}
