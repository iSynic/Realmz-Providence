import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const MODULE_BASELINES = [
  { path: "src/editor/panels/ScriptsPanel.tsx", maximum: 8587, owner: "ISY-315/ISY-316" },
  { path: "src/editor/panels/CombatPanel.tsx", maximum: 6773, owner: "ISY-318" },
  { path: "src/editor/scenarioSeed.ts", maximum: 22, owner: "ISY-317" },
  { path: "src/editor/panels/SuiteDomainPanel.tsx", maximum: 3884, owner: "ISY-319" },
  { path: "src/editor/components/MapContextSidebar.tsx", maximum: 2848, owner: "ISY-319" },
  { path: "src-tauri/src/realmz.rs", maximum: 5173, owner: "ISY-320" },
  { path: "src/editor/styles/scripts.css", maximum: 8712, owner: "ISY-321" },
  { path: "src/editor/styles/maps.css", maximum: 6546, owner: "ISY-321" },
  { path: "src/editor/styles/shell.css", maximum: 4855, owner: "ISY-321" },
  { path: "src/editor/styles/text-scenario.css", maximum: 3653, owner: "ISY-321" },
  { path: "src/editor/styles/combat.css", maximum: 3298, owner: "ISY-321" },
  { path: "src/editor/styles/rules.css", maximum: 1806, owner: "ISY-321" },
  { path: "src/editor/styles/assets.css", maximum: 1659, owner: "ISY-321" },
  { path: "src/editor/ui/workbench.css", maximum: 912, owner: "ISY-321" }
];

function evaluateModuleSizes(measurements) {
  return measurements
    .filter((measurement) => measurement.lines > measurement.maximum)
    .map((measurement) => `${measurement.path} grew from ${measurement.maximum} to ${measurement.lines} lines (${measurement.owner})`);
}

function runSelfTest() {
  const baseline = { path: "module.ts", maximum: 100, owner: "ISY-test" };
  assert.deepEqual(evaluateModuleSizes([{ ...baseline, lines: 100 }]), []);
  assert.match(evaluateModuleSizes([{ ...baseline, lines: 101 }])[0] ?? "", /grew from 100 to 101/);
  console.log("Module size baseline self-test passed (growth is rejected).");
}

async function runModuleSizeCheck() {
  const failures = [];
  const measurements = [];

  for (const baseline of MODULE_BASELINES) {
    try {
      const source = await readFile(baseline.path, "utf8");
      measurements.push({ ...baseline, lines: source.split(/\r?\n/).length });
    } catch (error) {
      failures.push(`${baseline.path} could not be measured: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  failures.push(...evaluateModuleSizes(measurements));
  if (failures.length > 0) {
    process.stderr.write("Module size baseline failed:\n");
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.stderr.write("Extract new responsibilities or update the baseline with an explicit ownership decision.\n");
    process.exitCode = 1;
    return;
  }

  const totalLines = measurements.reduce((total, measurement) => total + measurement.lines, 0);
  console.log(`Module size baseline passed (${measurements.length} hotspots, ${totalLines.toLocaleString()} lines).`);
}

if (process.argv.includes("--self-test")) runSelfTest();
else await runModuleSizeCheck();
