import { invoke } from "@tauri-apps/api/core";
import { applyProjectCommand } from "./projectCommands";
import { ExportReport, Project, ProjectCommand, ValidationReport } from "./types";

type ProvidenceHarnessConfig = {
  enabled: boolean;
  scriptPath: string;
  resultPath: string;
};

export type ProvidenceHarnessScript = {
  version: number;
  name: string;
  sourceScenarioDir: string;
  projectName: string;
  projectDir: string;
  exportDir: string;
  commands: ProjectCommand[];
  assertions?: {
    validationOk?: boolean;
    validationErrorsContain?: string[];
    validationWarningsContain?: string[];
    projectHasMaps?: boolean;
    projectTiles?: Array<{ mapId: string; index: number; value: number }>;
    triggerCountAtLeast?: number;
    commandsAppliedAtLeast?: number;
    exportContains?: string[];
    semanticLinkKinds?: string[];
  };
};

export type ProvidenceHarnessResult = {
  ok: boolean;
  projectDir: string;
  exportDir: string;
  commandsApplied: number;
  validation: ValidationReport | null;
  exportReport: ExportReport | null;
  artifacts: Record<string, string | string[] | null>;
  error: string | null;
};

export async function runProvidenceHarness(onStatus?: (status: string) => void) {
  let config: ProvidenceHarnessConfig;
  try {
    config = await invoke<ProvidenceHarnessConfig>("get_harness_config");
  } catch {
    return false;
  }

  let result: ProvidenceHarnessResult;
  try {
    onStatus?.("Harness: reading script...");
    const script = await invoke<ProvidenceHarnessScript>("read_harness_script");
    result = await executeHarnessScript(script, config, onStatus);
  } catch (error) {
    result = {
      ok: false,
      projectDir: "",
      exportDir: "",
      commandsApplied: 0,
      validation: null,
      exportReport: null,
      artifacts: {
        scriptPath: config.scriptPath,
        resultPath: config.resultPath
      },
      error: errorText(error)
    };
  }

  try {
    await invoke("write_harness_result", { result });
  } finally {
    window.setTimeout(() => {
      void invoke("harness_exit", { code: result.ok ? 0 : 1 });
    }, 250);
  }
  return true;
}

async function executeHarnessScript(
  script: ProvidenceHarnessScript,
  config: ProvidenceHarnessConfig,
  onStatus?: (status: string) => void
): Promise<ProvidenceHarnessResult> {
  onStatus?.(`Harness: importing ${script.sourceScenarioDir}...`);
  let project = await invoke<Project>("import_scenario_into_project", {
    sourcePath: script.sourceScenarioDir,
    projectDir: script.projectDir,
    projectName: script.projectName
  });

  let commandsApplied = 0;
  for (const command of script.commands ?? []) {
    const nextProject = applyProjectCommand(project, command);
    if (nextProject !== project) {
      commandsApplied += 1;
      project = nextProject;
    }
  }

  onStatus?.(`Harness: saving ${script.projectName}...`);
  project = await invoke<Project>("save_project", { projectDir: script.projectDir, project });

  onStatus?.("Harness: validating project...");
  const validation = await invoke<ValidationReport>("validate_project", { project });
  project = { ...project, validation };

  onStatus?.(`Harness: exporting to ${script.exportDir}...`);
  const exportReport = await invoke<ExportReport>("export_project", {
    projectDir: script.projectDir,
    project,
    outputDir: script.exportDir
  });

  const assertionErrors = assertHarnessResult(script, project, validation, exportReport, commandsApplied);
  return {
    ok: assertionErrors.length === 0,
    projectDir: script.projectDir,
    exportDir: script.exportDir,
    commandsApplied,
    validation,
    exportReport,
    artifacts: {
      scriptPath: config.scriptPath,
      resultPath: config.resultPath,
      exportDir: script.exportDir,
      writtenFiles: exportReport.writtenFiles,
      passThroughFiles: exportReport.passThroughFiles
    },
    error: assertionErrors.length ? assertionErrors.join("; ") : null
  };
}

function assertHarnessResult(
  script: ProvidenceHarnessScript,
  project: Project,
  validation: ValidationReport,
  exportReport: ExportReport,
  commandsApplied: number
) {
  const errors: string[] = [];
  const assertions = script.assertions ?? {};
  if (assertions.validationOk !== undefined && validation.ok !== assertions.validationOk) {
    errors.push(assertionError("validationOk", assertions.validationOk, validation.ok));
  }
  for (const expectedText of assertions.validationErrorsContain ?? []) {
    const observed = validation.errors.find((message) => message.includes(expectedText)) ?? null;
    if (observed === null) {
      errors.push(assertionError("validationErrorsContain", expectedText, validation.errors));
    }
  }
  for (const expectedText of assertions.validationWarningsContain ?? []) {
    const observed = validation.warnings.find((message) => message.includes(expectedText)) ?? null;
    if (observed === null) {
      errors.push(assertionError("validationWarningsContain", expectedText, validation.warnings));
    }
  }
  if (assertions.projectHasMaps && project.maps.length === 0) {
    errors.push(assertionError("projectHasMaps", "at least one map", project.maps.length));
  }
  for (const tileAssertion of assertions.projectTiles ?? []) {
    const map = project.maps.find((candidate) => candidate.id === tileAssertion.mapId);
    const observed = map?.tiles[tileAssertion.index] ?? null;
    if (observed !== tileAssertion.value) {
      errors.push(assertionError(`projectTiles:${tileAssertion.mapId}:${tileAssertion.index}`, tileAssertion.value, observed));
    }
  }
  if (assertions.triggerCountAtLeast !== undefined && project.triggers.length < assertions.triggerCountAtLeast) {
    errors.push(assertionError("triggerCountAtLeast", assertions.triggerCountAtLeast, project.triggers.length));
  }
  if (assertions.commandsAppliedAtLeast !== undefined && commandsApplied < assertions.commandsAppliedAtLeast) {
    errors.push(assertionError("commandsAppliedAtLeast", assertions.commandsAppliedAtLeast, commandsApplied));
  }
  const exportedFiles = new Set([...exportReport.writtenFiles, ...exportReport.passThroughFiles]);
  for (const fileName of assertions.exportContains ?? []) {
    if (!exportedFiles.has(fileName)) {
      errors.push(assertionError("exportContains", fileName, [...exportedFiles].sort()));
    }
  }
  for (const linkKind of assertions.semanticLinkKinds ?? []) {
    if (!project.semanticSchema.links.some((link) => link.kind === linkKind)) {
      errors.push(assertionError("semanticLinkKinds", linkKind, project.semanticSchema.links.map((link) => link.kind)));
    }
  }
  return errors;
}

function assertionError(name: string, expected: unknown, observed: unknown) {
  return `assertion ${name} expected ${formatAssertionValue(expected)} observed ${formatAssertionValue(observed)}`;
}

function formatAssertionValue(value: unknown) {
  if (typeof value === "string") return JSON.stringify(value);
  return JSON.stringify(value);
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}
