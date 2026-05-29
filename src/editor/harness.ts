import { invoke } from "@tauri-apps/api/core";
import { applyProjectCommand } from "./projectCommands";
import { ExportReport, Project, ProjectCommand, ValidationReport } from "./types";
import { validateScriptTrigger } from "./scriptValidation";
import { validateRealmzTargetRecord } from "./targetValidation";

type ProvidenceHarnessConfig = {
  enabled: boolean;
  scriptPath: string | null;
  resultPath: string | null;
  batchPath: string | null;
};

type ProvidenceHarnessRunConfig = {
  scriptPath: string;
  resultPath: string;
  batchPath?: string | null;
};

export type ProvidenceHarnessScript = {
  version: number;
  name: string;
  sourceScenarioDir: string;
  projectName: string;
  projectDir: string;
  exportDir: string;
  reopenAfterSave?: boolean;
  commands: ProjectCommand[];
  assertions?: {
    validationOk?: boolean;
    validationErrorsContain?: string[];
    validationWarningsContain?: string[];
    validationErrorsNotContain?: string[];
    validationWarningsNotContain?: string[];
    projectHasMaps?: boolean;
    projectTiles?: Array<{ mapId: string; index: number; value: number }>;
    mapRecords?: Array<{ id: number; fields?: Record<string, unknown> }>;
    randomLevels?: Array<{ levelType: "land" | "dungeon"; levelIndex: number; fields?: Record<string, unknown>; rects?: Array<{ rectIndex: number; fields?: Record<string, unknown> }> }>;
    triggers?: Array<{ triggerId: string; fields?: Record<string, unknown> }>;
    actionSlots?: Array<{ triggerId: string; slot: number; rawCode: number; id: number }>;
    edcdRows?: Array<{ rowId: number; values: number[] }>;
    targetRecords?: Array<{
      recordType: "message" | "optionLabel" | "battle" | "monster" | "treasure" | "shop" | "simpleEncounter" | "complexEncounter" | "questLabel";
      id: number;
      fields?: Record<string, unknown>;
    }>;
    targetRecordsAbsent?: Array<{
      recordType: "message" | "optionLabel" | "battle" | "monster" | "treasure" | "shop" | "simpleEncounter" | "complexEncounter" | "questLabel";
      id: number;
    }>;
    scriptDiagnosticsContain?: Array<{ triggerId: string; text: string }>;
    scriptDiagnosticsNotContain?: Array<{ triggerId: string; text: string }>;
    targetDiagnosticsContain?: Array<{
      recordType: "message" | "optionLabel" | "battle" | "monster" | "treasure" | "shop" | "simpleEncounter" | "complexEncounter" | "questLabel";
      id: number;
      text: string;
    }>;
    targetDiagnosticsNotContain?: Array<{
      recordType: "message" | "optionLabel" | "battle" | "monster" | "treasure" | "shop" | "simpleEncounter" | "complexEncounter" | "questLabel";
      id: number;
      text: string;
    }>;
    triggerCountAtLeast?: number;
    commandsAppliedAtLeast?: number;
    exportContains?: string[];
    semanticLinkKinds?: string[];
  };
};

export type ProvidenceHarnessBatch = {
  version: number;
  name: string;
  runs: Array<{
    fixture: string;
    scriptPath: string;
    resultPath: string;
  }>;
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

type HarnessTargetRecordType = NonNullable<
  NonNullable<ProvidenceHarnessScript["assertions"]>["targetRecords"]
>[number]["recordType"];

export async function runProvidenceHarness(onStatus?: (status: string) => void) {
  let config: ProvidenceHarnessConfig;
  try {
    config = await invoke<ProvidenceHarnessConfig>("get_harness_config");
  } catch {
    return false;
  }

  let result: ProvidenceHarnessResult;
  if (config.batchPath) {
    const ok = await runProvidenceHarnessBatch(config, onStatus);
    return ok;
  }

  if (!config.scriptPath || !config.resultPath) {
    return false;
  }
  const runConfig: ProvidenceHarnessRunConfig = {
    scriptPath: config.scriptPath,
    resultPath: config.resultPath
  };
  try {
    onStatus?.("Harness: reading script...");
    const script = await invoke<ProvidenceHarnessScript>("read_harness_script");
    result = await executeHarnessScript(script, runConfig, onStatus);
  } catch (error) {
    result = {
      ok: false,
      projectDir: "",
      exportDir: "",
      commandsApplied: 0,
      validation: null,
      exportReport: null,
      artifacts: {
        scriptPath: runConfig.scriptPath,
        resultPath: runConfig.resultPath
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

async function runProvidenceHarnessBatch(config: ProvidenceHarnessConfig, onStatus?: (status: string) => void) {
  try {
    onStatus?.("Harness: reading batch...");
    const batch = await invoke<ProvidenceHarnessBatch>("read_harness_batch");
    for (const run of batch.runs ?? []) {
      const runConfig: ProvidenceHarnessRunConfig = {
        scriptPath: run.scriptPath,
        resultPath: run.resultPath,
        batchPath: config.batchPath
      };
      let result: ProvidenceHarnessResult;
      try {
        onStatus?.(`Harness: running ${run.fixture}...`);
        const script = await invoke<ProvidenceHarnessScript>("read_harness_script_at", { path: run.scriptPath });
        result = await executeHarnessScript(script, runConfig, onStatus);
      } catch (error) {
        result = {
          ok: false,
          projectDir: "",
          exportDir: "",
          commandsApplied: 0,
          validation: null,
          exportReport: null,
          artifacts: {
            scriptPath: run.scriptPath,
            resultPath: run.resultPath,
            batchPath: config.batchPath
          },
          error: errorText(error)
        };
      }
      await invoke("write_harness_result_at", { path: run.resultPath, result });
    }
    window.setTimeout(() => {
      void invoke("harness_exit", { code: 0 });
    }, 250);
    return true;
  } catch (error) {
    console.error("Providence harness batch failed", error);
    window.setTimeout(() => {
      void invoke("harness_exit", { code: 1 });
    }, 250);
    return true;
  }
}

async function executeHarnessScript(
  script: ProvidenceHarnessScript,
  config: ProvidenceHarnessRunConfig,
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
  if (script.reopenAfterSave) {
    onStatus?.(`Harness: reopening ${script.projectName}...`);
    project = await invoke<Project>("open_project", { projectDir: script.projectDir });
  }

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
      batchPath: config.batchPath ?? null,
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
  for (const forbiddenText of assertions.validationErrorsNotContain ?? []) {
    const observed = validation.errors.find((message) => message.includes(forbiddenText)) ?? null;
    if (observed !== null) {
      errors.push(assertionError("validationErrorsNotContain", `no message containing ${forbiddenText}`, observed));
    }
  }
  for (const expectedText of assertions.validationWarningsContain ?? []) {
    const observed = validation.warnings.find((message) => message.includes(expectedText)) ?? null;
    if (observed === null) {
      errors.push(assertionError("validationWarningsContain", expectedText, validation.warnings));
    }
  }
  for (const forbiddenText of assertions.validationWarningsNotContain ?? []) {
    const observed = validation.warnings.find((message) => message.includes(forbiddenText)) ?? null;
    if (observed !== null) {
      errors.push(assertionError("validationWarningsNotContain", `no message containing ${forbiddenText}`, observed));
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
  for (const recordAssertion of assertions.mapRecords ?? []) {
    const record = (project.mapRecords ?? []).find((candidate) => candidate.id === recordAssertion.id);
    if (!record) {
      errors.push(assertionError(`mapRecords:${recordAssertion.id}`, "map record exists", null));
      continue;
    }
    for (const [field, expected] of Object.entries(recordAssertion.fields ?? {})) {
      const observed = readAssertionField(record, field);
      if (!sameJsonValue(observed, expected)) {
        errors.push(assertionError(`mapRecords:${recordAssertion.id}:${field}`, expected, observed));
      }
    }
  }
  for (const randomAssertion of assertions.randomLevels ?? []) {
    const level = project.randomLevels.find((candidate) => candidate.levelType === randomAssertion.levelType && candidate.levelIndex === randomAssertion.levelIndex);
    if (!level) {
      errors.push(assertionError(`randomLevels:${randomAssertion.levelType}:${randomAssertion.levelIndex}`, "random level exists", null));
      continue;
    }
    for (const [field, expected] of Object.entries(randomAssertion.fields ?? {})) {
      const observed = readAssertionField(level, field);
      if (!sameJsonValue(observed, expected)) {
        errors.push(assertionError(`randomLevels:${randomAssertion.levelType}:${randomAssertion.levelIndex}:${field}`, expected, observed));
      }
    }
    for (const rectAssertion of randomAssertion.rects ?? []) {
      const rect = level.rects.find((candidate) => candidate.rectIndex === rectAssertion.rectIndex);
      if (!rect) {
        errors.push(assertionError(`randomLevels:${randomAssertion.levelType}:${randomAssertion.levelIndex}:rect:${rectAssertion.rectIndex}`, "rect exists", null));
        continue;
      }
      for (const [field, expected] of Object.entries(rectAssertion.fields ?? {})) {
        const observed = readAssertionField(rect, field);
        if (!sameJsonValue(observed, expected)) {
          errors.push(assertionError(`randomLevels:${randomAssertion.levelType}:${randomAssertion.levelIndex}:rect:${rectAssertion.rectIndex}:${field}`, expected, observed));
        }
      }
    }
  }
  for (const triggerAssertion of assertions.triggers ?? []) {
    const trigger = project.triggers.find((candidate) => candidate.id === triggerAssertion.triggerId);
    if (!trigger) {
      errors.push(assertionError(`triggers:${triggerAssertion.triggerId}`, "trigger exists", null));
      continue;
    }
    for (const [field, expected] of Object.entries(triggerAssertion.fields ?? {})) {
      const observed = readAssertionField(trigger, field);
      if (!sameJsonValue(observed, expected)) {
        errors.push(assertionError(`triggers:${triggerAssertion.triggerId}:${field}`, expected, observed));
      }
    }
  }
  for (const slotAssertion of assertions.actionSlots ?? []) {
    const trigger = project.triggers.find((candidate) => candidate.id === slotAssertion.triggerId);
    const action = trigger?.actions.find((candidate) => candidate.slot === slotAssertion.slot);
    const observed = {
      rawCode: action?.rawCode ?? 0,
      id: action?.id ?? 0
    };
    const expected = {
      rawCode: slotAssertion.rawCode,
      id: slotAssertion.id
    };
    if (!sameJsonValue(observed, expected)) {
      errors.push(assertionError(`actionSlots:${slotAssertion.triggerId}:${slotAssertion.slot}`, expected, observed));
    }
  }
  for (const rowAssertion of assertions.edcdRows ?? []) {
    const row = project.extracodes.find((candidate) => candidate.id === rowAssertion.rowId);
    const observed = row?.values ?? null;
    if (!sameJsonValue(observed, rowAssertion.values)) {
      errors.push(assertionError(`edcdRows:${rowAssertion.rowId}`, rowAssertion.values, observed));
    }
  }
  for (const recordAssertion of assertions.targetRecords ?? []) {
    const record = targetRecordForAssertion(project, recordAssertion.recordType, recordAssertion.id);
    if (!record) {
      errors.push(assertionError(`targetRecords:${recordAssertion.recordType}:${recordAssertion.id}`, "record exists", null));
      continue;
    }
    for (const [field, expected] of Object.entries(recordAssertion.fields ?? {})) {
      const observed = readAssertionField(record, field);
      if (!sameJsonValue(observed, expected)) {
        errors.push(assertionError(`targetRecords:${recordAssertion.recordType}:${recordAssertion.id}:${field}`, expected, observed));
      }
    }
  }
  for (const recordAssertion of assertions.targetRecordsAbsent ?? []) {
    const record = targetRecordForAssertion(project, recordAssertion.recordType, recordAssertion.id);
    if (record) {
      errors.push(assertionError(`targetRecordsAbsent:${recordAssertion.recordType}:${recordAssertion.id}`, "no record", record));
    }
  }
  for (const diagnosticAssertion of assertions.scriptDiagnosticsContain ?? []) {
    const diagnostics = scriptDiagnosticsForAssertion(project, diagnosticAssertion.triggerId);
    const observed = diagnostics.find((message) => message.includes(diagnosticAssertion.text)) ?? null;
    if (observed === null) {
      errors.push(assertionError(`scriptDiagnosticsContain:${diagnosticAssertion.triggerId}`, diagnosticAssertion.text, diagnostics));
    }
  }
  for (const diagnosticAssertion of assertions.scriptDiagnosticsNotContain ?? []) {
    const diagnostics = scriptDiagnosticsForAssertion(project, diagnosticAssertion.triggerId);
    const observed = diagnostics.find((message) => message.includes(diagnosticAssertion.text)) ?? null;
    if (observed !== null) {
      errors.push(assertionError(`scriptDiagnosticsNotContain:${diagnosticAssertion.triggerId}`, `no diagnostic containing ${diagnosticAssertion.text}`, observed));
    }
  }
  for (const diagnosticAssertion of assertions.targetDiagnosticsContain ?? []) {
    const diagnostics = targetDiagnosticsForAssertion(project, diagnosticAssertion.recordType, diagnosticAssertion.id);
    const observed = diagnostics.find((message) => message.includes(diagnosticAssertion.text)) ?? null;
    if (observed === null) {
      errors.push(assertionError(`targetDiagnosticsContain:${diagnosticAssertion.recordType}:${diagnosticAssertion.id}`, diagnosticAssertion.text, diagnostics));
    }
  }
  for (const diagnosticAssertion of assertions.targetDiagnosticsNotContain ?? []) {
    const diagnostics = targetDiagnosticsForAssertion(project, diagnosticAssertion.recordType, diagnosticAssertion.id);
    const observed = diagnostics.find((message) => message.includes(diagnosticAssertion.text)) ?? null;
    if (observed !== null) {
      errors.push(assertionError(`targetDiagnosticsNotContain:${diagnosticAssertion.recordType}:${diagnosticAssertion.id}`, `no diagnostic containing ${diagnosticAssertion.text}`, observed));
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

function targetRecordForAssertion(project: Project, recordType: HarnessTargetRecordType, id: number) {
  const records =
    recordType === "message" ? project.messages :
    recordType === "optionLabel" ? project.optionLabels :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    project.questLabels;
  return records.find((record) => record.id === id) ?? null;
}

function scriptDiagnosticsForAssertion(project: Project, triggerId: string) {
  const trigger = project.triggers.find((candidate) => candidate.id === triggerId);
  if (!trigger) return [`missing trigger ${triggerId}`];
  return validateScriptTrigger(project, trigger).map(formatDiagnostic);
}

function targetDiagnosticsForAssertion(project: Project, recordType: HarnessTargetRecordType, id: number) {
  if (recordType === "optionLabel") {
    const record = project.optionLabels.find((candidate) => candidate.id === id);
    if (!record) return [`missing option label ${id}`];
    const diagnostics: string[] = [];
    if (record.text.length > 24) diagnostics.push(`Option label ${id} is too long for Realmz's 24-character option string slot.`);
    if (!/^[\x00-\x7F]*$/.test(record.text)) diagnostics.push(`Option label ${id} contains non-ASCII text and may not render as intended.`);
    return diagnostics;
  }
  return validateRealmzTargetRecord(project, recordType, id).map(formatDiagnostic);
}

function formatDiagnostic(diagnostic: { message: string; detail: string; slot?: number }) {
  return [
    diagnostic.slot != null ? `slot ${diagnostic.slot}` : "",
    diagnostic.message,
    diagnostic.detail
  ].filter(Boolean).join(": ");
}

function readAssertionField(record: Record<string, unknown>, field: string) {
  return field.split(".").reduce<unknown>((current, part) => {
    if (current == null) return null;
    if (Array.isArray(current)) {
      const index = Number(part);
      return Number.isInteger(index) ? current[index] ?? null : null;
    }
    if (typeof current === "object") return (current as Record<string, unknown>)[part] ?? null;
    return null;
  }, record);
}

function sameJsonValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
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
