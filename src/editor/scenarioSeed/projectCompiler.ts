import { createBrowserProject, validateBrowserProject } from "../browser/project";
import { PROJECT_SCHEMA_VERSION, resolvedProjectOrigin } from "../projectOrigin";
import { defaultGlobalMacroHooks } from "../projectCommands";
import type { LibraryCatalog, Project } from "../types";
import { allocateScenarioSeed, resolveRef } from "./allocation";
import {
  addScenarioSeedDiagnostic as addDiagnostic,
  createScenarioSeedCompilerContext,
  type ScenarioSeedCompilerContext
} from "./compilerContext";
import type { ScenarioSeed, ScenarioSeedProjectOptions, ScenarioSeedProjectResult } from "./contracts";
import { compileScenarioSeedAssets, compileScenarioSeedCoreRecords } from "./coreRecordCompiler";
import { addScenarioSeedMapPlacementDiagnostics, addScenarioSeedTopologyDiagnostics } from "./diagnostics";
import { compileScenarioSeedMaps, scenarioSeedOperationRegions } from "./mapCompiler";
import { applyScenarioSeedMapOperation } from "./mapOperationCompiler";
import { compileScenarioSeedScripts, syncActionPointMarkers, type ScenarioSeedScriptCompilation } from "./scriptCompiler";

export function compileScenarioSeedProject(
  seed: ScenarioSeed,
  options: ScenarioSeedProjectOptions = {},
  parseWarnings: string[] = []
): ScenarioSeedProjectResult {
  const now = options.now ?? new Date().toISOString();
  const baseTemplate = seed.baseTemplate ?? "blank";
  const context = createScenarioSeedCompilerContext(baseTemplate, options.libraryCatalog ?? null);
  const baseProject = createScenarioSeedBaseProject(seed.scenario.name, baseTemplate, options, context);
  if (!baseProject) return failedProjectResult(context, parseWarnings);

  allocateScenarioSeed(seed, context, { operationRegions: scenarioSeedOperationRegions });
  addScenarioSeedTopologyDiagnostics(seed, context);
  if (context.errors.length > 0) return failedProjectResult(context, parseWarnings);

  let project = initializeScenarioSeedProject(baseProject, seed, baseTemplate, options.appVersion ?? "scenario-seed", now, context);

  const compiledAssets = compileScenarioSeedAssets(seed.assets, options.customAssets ?? [], context);
  if (compiledAssets !== undefined) project = { ...project, assets: compiledAssets };

  if (seed.maps !== undefined) {
    const mapCompilation = compileScenarioSeedMaps(seed.maps, context, { applyOperation: applyScenarioSeedMapOperation });
    project = {
      ...project,
      maps: mapCompilation.maps,
      randomLevels: mapCompilation.randomLevels,
      assetCatalog: {
        ...project.assetCatalog,
        tilesets: mapCompilation.tilesets
      }
    };
    addScenarioSeedMapPlacementDiagnostics(seed, project.maps, context);
  }

  project = compileScenarioSeedCoreRecords(project, seed, context);
  const scriptCompilation = compileScenarioSeedScripts(seed, context, project.extracodes);
  project = applyScenarioSeedScripts(project, seed, scriptCompilation);

  const validation = validateBrowserProject(project);
  project = { ...project, validation };
  const warnings = [...parseWarnings, ...context.warnings, ...validation.warnings];
  if (context.errors.length > 0) return failedProjectResult(context, parseWarnings, validation.warnings);
  return { ok: true, project, warnings, allocations: context.allocations, diagnostics: context.diagnostics };
}

function createScenarioSeedBaseProject(
  projectName: string,
  baseTemplate: string,
  options: ScenarioSeedProjectOptions,
  context: ScenarioSeedCompilerContext
): Project | null {
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

function initializeScenarioSeedProject(
  project: Project,
  seed: ScenarioSeed,
  baseTemplate: string,
  appVersion: string,
  now: string,
  context: ScenarioSeedCompilerContext
): Project {
  const scenarioDefaults = createBrowserProject(seed.scenario.name).scenario;
  const scenarioShell = project.scenario.shell ?? scenarioDefaults.shell;
  const contactInfo = project.scenario.contactInfo ?? scenarioDefaults.contactInfo;
  const origin = baseTemplate === "blank" ? "authored" : resolvedProjectOrigin(project.source);
  const globalMacroFields = ["start", "death", "quit", null, "shop", "temple", null] as const;
  const globalMacroHooksSource = seed.scenario.globalMacros === undefined
    ? project.scenario.globalMacroHooks
    : {
        ...defaultGlobalMacroHooks(),
        slots: defaultGlobalMacroHooks().slots.map((slot) => {
          const field = globalMacroFields[slot.slot];
          const ref = field ? seed.scenario.globalMacros?.[field] : undefined;
          return { ...slot, door: ref === undefined ? 0 : resolveRef(ref, context.extraActionPoints, "extra action point", context) };
        }),
        authored: true
      };
  const globalMacroHooks = globalMacroHooksSource ? withoutLegacyRawBytes(globalMacroHooksSource) : null;
  return {
    ...project,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    appVersion,
    scenario: {
      ...project.scenario,
      id: seed.scenario.id ?? project.scenario.id,
      name: seed.scenario.name,
      projectPath: `seed://${slugify(seed.scenario.name)}.providence`,
      importedAt: now,
      globalMacroHooks,
      supportFile: project.scenario.supportFile ? withoutLegacyRawBytes(project.scenario.supportFile) : null,
      shell: scenarioShell
        ? withoutLegacyScenarioShellSourceBytes({
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
          })
        : null,
      restrictions: project.scenario.restrictions ? withoutLegacyRawBytes(project.scenario.restrictions) : null,
      contactInfo: contactInfo
        ? withoutLegacyRawBytes({
            ...contactInfo,
            scenarioName: seed.scenario.name,
            version: seed.scenario.version ?? contactInfo.version,
            date: seed.scenario.date ?? contactInfo.date,
            author: seed.scenario.author ?? contactInfo.author,
            email: seed.scenario.email ?? contactInfo.email,
            web: seed.scenario.web ?? contactInfo.web,
            description: seed.scenario.description ?? contactInfo.description,
            authored: true
          })
        : null
    },
    source: {
      origin,
      sourcePath: `seed://${slugify(seed.scenario.name)}`,
      rawSourcesDir: origin === "authored" ? "" : project.source.rawSourcesDir || "raw-sources",
      immutable: false,
      files: origin === "authored" ? [] : [...(project.source.files ?? [])]
    },
    customLandlooks: (project.customLandlooks ?? []).map(withoutLegacyCustomLandlookSourceBytes)
  };
}

function withoutLegacyRawBytes<T extends object>(record: T): T {
  const { rawBytes: _legacyRawBytes, ...canonical } = record as T & { rawBytes?: number[] };
  return canonical as T;
}

function withoutLegacyScenarioShellSourceBytes<T extends object>(shell: T): T {
  const {
    rawBytes: _legacyRawBytes,
    trailingBytes: _legacyTrailingBytes,
    ...canonical
  } = shell as T & { rawBytes?: number[]; trailingBytes?: number[] };
  return canonical as T;
}

function withoutLegacyCustomLandlookSourceBytes<T extends object>(landlook: T): T {
  const {
    rawBytes: _legacyRawBytes,
    trailingBytes: _legacyTrailingBytes,
    ...canonical
  } = landlook as T & { rawBytes?: number[]; trailingBytes?: number[] };
  return canonical as T;
}

function applyScenarioSeedScripts(
  project: Project,
  seed: ScenarioSeed,
  compilation: ScenarioSeedScriptCompilation
): Project {
  const baseMapTriggers = project.triggers.filter((trigger) => trigger.source !== "Data ED3");
  const baseExtraActionPoints = project.triggers.filter((trigger) => trigger.source === "Data ED3");
  const generatedMapTriggers = compilation.triggers.filter((trigger) => trigger.source !== "Data ED3");
  const generatedExtraActionPoints = compilation.triggers.filter((trigger) => trigger.source === "Data ED3");
  const triggers = [
    ...(seed.actionPoints === undefined ? baseMapTriggers : generatedMapTriggers),
    ...(seed.extraActionPoints === undefined ? baseExtraActionPoints : generatedExtraActionPoints)
  ];
  return {
    ...project,
    ...(seed.simpleEncounters !== undefined ? { simpleEncounters: compilation.simpleEncounters } : {}),
    ...(seed.thiefEncounters !== undefined ? { thiefEncounters: compilation.thiefEncounters } : {}),
    ...(seed.complexEncounters !== undefined ? { complexEncounters: compilation.complexEncounters } : {}),
    ...(seed.timedEncounters !== undefined ? { timedEncounters: compilation.timedEncounters } : {}),
    triggers,
    maps: syncActionPointMarkers(project.maps, triggers),
    extracodes: compilation.extracodes
  };
}

function failedProjectResult(
  context: ScenarioSeedCompilerContext,
  parseWarnings: string[],
  validationWarnings: string[] = []
): ScenarioSeedProjectResult {
  return {
    ok: false,
    errors: context.errors,
    warnings: [...parseWarnings, ...context.warnings, ...validationWarnings],
    allocations: context.allocations,
    diagnostics: context.diagnostics
  };
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-scenario";
}
