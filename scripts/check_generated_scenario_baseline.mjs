import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const { buildSync } = requireFromRoot("esbuild");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "providence-generated-baseline-"));

try {
  buildSync({
    entryPoints: {
      seed: path.join(root, "src", "editor", "scenarioSeed.ts"),
      baseline: path.join(root, "src", "editor", "browser", "generatedScenarioBaseline.ts"),
      scenarioPackage: path.join(root, "src", "editor", "browser", "scenarioPackage.ts"),
      zip: path.join(root, "src", "editor", "browser", "zip.ts")
    },
    outdir: tmpDir,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "silent"
  });
  const requireFromFixture = createRequire(path.join(tmpDir, "check.cjs"));
  const { createProjectFromScenarioSeed } = requireFromFixture("./seed.js");
  const { attachGeneratedScenarioBaseline, GENERATED_SCENARIO_BASELINE_SIZES } = requireFromFixture("./baseline.js");
  const { createBrowserScenarioPackageZip } = requireFromFixture("./scenarioPackage.js");
  const { readStoredZip } = requireFromFixture("./zip.js");

  const compiled = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Generated Baseline" },
    items: [{ key: "token", itemId: 901, identifiedName: "Generated Token", cost: 5 }]
  }, { now: "2026-07-10T00:00:00.000Z", appVersion: "fixture" });
  expect(compiled.ok, "minimal Scenario JSON should compile");
  if (!compiled.ok) process.exit(1);

  const firstMap = compiled.project.maps[0];
  const firstRandomLevel = compiled.project.randomLevels[0];
  compiled.project.maps.push({
    ...firstMap,
    id: "land:1",
    index: 1,
    name: "Land Level 2",
    tiles: [...firstMap.tiles],
    provenance: { ...firstMap.provenance, recordIndex: 1, byteOffset: firstMap.provenance.byteLength }
  });
  compiled.project.randomLevels.push({
    ...firstRandomLevel,
    id: "land:1:randlevel",
    levelIndex: 1,
    rawValues: [...firstRandomLevel.rawValues],
    rects: [],
    provenance: { ...firstRandomLevel.provenance, recordIndex: 1, byteOffset: firstRandomLevel.provenance.byteLength }
  });

  const generated = await attachGeneratedScenarioBaseline(compiled.project, "2026-07-10T00:00:00.000Z");
  expect(generated.rawSources.sourceKind === "generated-scenario-baseline", "generated source kind should be explicit");
  expect(generated.project.source.files.length === generated.rawSources.files.length, "project source inventory should describe every generated raw file");
  const result = createBrowserScenarioPackageZip(generated.project, generated.rawSources, "windows-realmz-folder");
  const files = new Map(readStoredZip(result.zip).map((entry) => [entry.path.split("/").slice(1).join("/"), entry.bytes]));

  for (const name of [
    "Generated Baseline",
    "Scenario",
    "Scenario.rsrc",
    "Data CS",
    "Data LD",
    "Data DD",
    "Data RD",
    "Data DL",
    "Data DDD",
    "Data RDD",
    "Data SD",
    "Data TD2",
    "Data TD3",
    "Data ED",
    "Data ED2",
    "Data MD",
    "Data NI",
    "Data Solids"
  ]) {
    expect(files.has(name), `generated scenario ZIP should contain ${name}`);
  }
  expect(files.get("Data DD")?.byteLength === 2 * GENERATED_SCENARIO_BASELINE_SIZES.doorLevel, "Data DD should contain one door table per land map");
  expect(files.get("Data DDD")?.byteLength === 0, "a scenario without dungeon maps should retain an empty Data DDD startup file");
  expect(files.get("Data NI")?.byteLength === GENERATED_SCENARIO_BASELINE_SIZES.scenarioItems, "authored items should overlay Realmz's fixed 200-item table without truncating it");
  expect(files.get("Data Solids")?.byteLength === GENERATED_SCENARIO_BASELINE_SIZES.tileSolids, "Data Solids should contain the neutral 1024-byte table");
  expect((files.get("Scenario.rsrc")?.byteLength ?? 0) >= 46, "Scenario.rsrc should be a structurally valid empty resource fork");
  expect(result.report.writtenFiles.includes("Data DD"), "browser export should report the generated door table as authored output");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("Generated scenario runtime baseline check passed.");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
