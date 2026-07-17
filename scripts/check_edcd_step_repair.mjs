import { build } from "esbuild";

const root = process.cwd();
const bundled = await build({
  stdin: {
    contents: `
      import { createBrowserProject } from "./src/editor/browser/project.ts";
      import { applyProjectCommand } from "./src/editor/projectCommands.ts";
      import { validateActionDraft } from "./src/editor/scriptValidation.ts";
      import { buildEdcdRowUsages, edcdUsageForAction, edcdUsageToEditorUsage } from "./src/editor/edcdRows.ts";
      export { createBrowserProject, applyProjectCommand, validateActionDraft, buildEdcdRowUsages, edcdUsageForAction, edcdUsageToEditorUsage };
    `,
    loader: "ts",
    resolveDir: root,
    sourcefile: "edcd-step-repair-check.ts"
  },
  bundle: true,
  format: "esm",
  loader: { ".css": "empty" },
  platform: "node",
  target: "node24",
  write: false,
  logLevel: "silent"
});

const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`;
const { createBrowserProject, applyProjectCommand, validateActionDraft, buildEdcdRowUsages, edcdUsageForAction, edcdUsageToEditorUsage } = await import(moduleUrl);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function projectWithTrigger() {
  const project = createBrowserProject("EDCD step repair check");
  const trigger = {
    id: "Data DD:0:0",
    source: "Data DD",
    recordIndex: 0,
    active: true,
    levelType: "land",
    levelIndex: 0,
    coordinate: { x: 1, y: 1 },
    doorid: 1,
    landid: 0,
    targetX: 1,
    targetY: 1,
    percent: 100,
    actions: []
  };
  return [{ ...project, triggers: [trigger] }, trigger];
}

function hasDiagnostic(diagnostics, suffix) {
  return diagnostics.some((diagnostic) => diagnostic.id.endsWith(`:${suffix}`));
}

for (const opcode of [54, 58]) {
  const [project, trigger] = projectWithTrigger();
  const before = validateActionDraft(project, trigger, 3, opcode, 5282);
  assert(hasDiagnostic(before, "missing-settings"), `Opcode ${opcode} should report its missing settings row.`);
  assert(before.some((diagnostic) => diagnostic.detail.includes("Apply Step to create them")), `Opcode ${opcode} should describe the in-step repair path.`);

  const values = opcode === 54 ? [4, 25, 1, 0, -1] : [4, 2, 0, 8, 0];
  const repaired = applyProjectCommand(project, {
    kind: "applyRealmzScriptStep",
    label: `Repair opcode ${opcode}`,
    triggerId: trigger.id,
    slot: 3,
    opcode,
    id: 5282,
    edcdValues: values
  });
  const row = repaired.extracodes.find((candidate) => candidate.id === 5282);
  assert(JSON.stringify(row?.values) === JSON.stringify(values), `Opcode ${opcode} should create settings row 5282 with the authored values.`);
  const repairedTrigger = repaired.triggers.find((candidate) => candidate.id === trigger.id);
  assert(repairedTrigger?.actions.some((action) => action.slot === 3 && action.rawCode === opcode && action.id === 5282), `Opcode ${opcode} should update the script slot atomically.`);
  const after = validateActionDraft(repaired, repairedTrigger, 3, opcode, 5282);
  assert(!hasDiagnostic(after, "missing-settings"), `Opcode ${opcode} should clear the missing-settings warning after Apply Step.`);
}

{
  const [project, trigger] = projectWithTrigger();
  const before = validateActionDraft(project, trigger, 2, 92, 40);
  assert(hasDiagnostic(before, "missing-settings"), "Opcode 92 should report a missing primary settings row.");
  assert(hasDiagnostic(before, "missing-secondary-settings"), "Opcode 92 should report a missing secondary settings row.");
  const missingUsage = edcdUsageToEditorUsage(edcdUsageForAction(project, null, 92, 40));
  assert(missingUsage.secondaryRowId === 41, "Opcode 92 should expose ID + 1 to the selected-step editor even when the row is missing.");
  assert(missingUsage.secondaryFields?.length === 5, "Opcode 92 should expose five editable secondary shape fields.");

  const primaryValues = [2, 3, 0, 15, 2];
  const secondaryValues = [4, 5, 8, 9, 1];
  const repaired = applyProjectCommand(project, {
    kind: "applyRealmzScriptStep",
    label: "Repair opcode 92",
    triggerId: trigger.id,
    slot: 2,
    opcode: 92,
    id: 40,
    edcdValues: primaryValues,
    secondaryEdcdValues: secondaryValues
  });
  assert(JSON.stringify(repaired.extracodes.find((row) => row.id === 40)?.values) === JSON.stringify(primaryValues), "Opcode 92 should create its primary row.");
  assert(JSON.stringify(repaired.extracodes.find((row) => row.id === 41)?.values) === JSON.stringify(secondaryValues), "Opcode 92 should create its ID + 1 secondary row in the same command.");
  const repairedTrigger = repaired.triggers.find((candidate) => candidate.id === trigger.id);
  const after = validateActionDraft(repaired, repairedTrigger, 2, 92, 40);
  assert(!hasDiagnostic(after, "missing-settings"), "Opcode 92 should clear its primary missing-settings warning.");
  assert(!hasDiagnostic(after, "missing-secondary-settings"), "Opcode 92 should clear its secondary missing-settings warning.");
  const secondaryInventoryUsage = buildEdcdRowUsages(repaired).find((usage) => usage.rowId === 41);
  assert(secondaryInventoryUsage?.status === "in-use", "Opcode 92 ID + 1 should be tracked as an in-use settings row, not unused inventory.");
}

{
  const [project, trigger] = projectWithTrigger();
  const repaired = applyProjectCommand(project, {
    kind: "applyRealmzScriptStep",
    label: "Create default opcode 92 rows",
    triggerId: trigger.id,
    slot: 1,
    opcode: 92,
    id: 60,
    edcdValues: [0, 0, 0, 0, -1]
  });
  assert(JSON.stringify(repaired.extracodes.find((row) => row.id === 61)?.values) === JSON.stringify([0, 0, 0, 0, 0]), "Opcode 92 should always create ID + 1, even when a caller omits secondary draft values.");
}

console.log("EDCD selected-step repair checks passed.");
