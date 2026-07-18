import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(repoRoot, "fixtures", "scenario-seeds", "authoritative-ownership-proof.seed.json");
const proofRoot = path.join(repoRoot, "tmp", "authoritative-scenario-proof");
const buildRoot = path.join(proofRoot, "compiler-build");
const projectDir = path.join(proofRoot, "Providence Ownership Proof.providence");
const windowsOutputA = path.join(proofRoot, "native-windows-a", "Providence Ownership Proof");
const windowsOutputB = path.join(proofRoot, "native-windows-b", "Providence Ownership Proof");
const classicOutputA = path.join(proofRoot, "native-classic-a", "Providence Ownership Proof");
const classicOutputB = path.join(proofRoot, "native-classic-b", "Providence Ownership Proof");
const reimportDir = path.join(proofRoot, "reimported.providence");
const scenarioName = "Providence Ownership Proof";

await fs.rm(proofRoot, { recursive: true, force: true });
await fs.mkdir(buildRoot, { recursive: true });
await bundleScenarioCompiler();

const requireFromBuild = createRequire(path.join(buildRoot, "proof.cjs"));
const { createProjectFromScenarioSeed } = requireFromBuild("./scenarioSeed.cjs");
const seed = JSON.parse(await fs.readFile(fixturePath, "utf8"));
const result = createProjectFromScenarioSeed(seed, {
  now: "2026-07-18T00:00:00.000Z",
  appVersion: "authoritative-scenario-proof"
});

expect(result.ok, `Scenario JSON compilation failed: ${result.ok ? "" : result.errors.join("; ")}`);
const project = result.project;
expect(project.validation.ok, `Canonical project validation failed: ${project.validation.errors.join("; ")}`);
expect(project.maps.length === 1, `Expected one map, found ${project.maps.length}`);
expect(project.triggers.length === 1, `Expected one Action Point, found ${project.triggers.length}`);
expect(project.messages.length === 1, `Expected one message, found ${project.messages.length}`);
expect(project.schemaVersion === 5, `Canonical project must use schema v5, found v${project.schemaVersion}`);
expect(project.source.origin === "authored", `Fresh canonical project must declare authored origin, found ${project.source.origin}`);
expect(project.source.files.length === 0, "Fresh canonical project must not inventory source files");
expect(project.source.immutable === false, "Fresh canonical project must not be immutable");
const questAction = project.triggers[0].actions.find((action) => action.rawCode === 47);
expect(questAction?.id === 1, `First authored quest flag must be runtime-valid ID 1, found ${questAction?.id}`);

project.scenario.projectPath = projectDir;
project.source.rawSourcesDir = "";
await fs.mkdir(path.join(projectDir, "assets"), { recursive: true });
await fs.writeFile(path.join(projectDir, "project.json"), `${JSON.stringify(project, null, 2)}\n`);
await assertNoRawSources("after canonical project creation");

await runCargoExample("export_project_fixture", [projectDir, windowsOutputA, "windows-realmz-folder"]);
await assertNoRawSources("after first Windows export");
await runCargoExample("export_project_fixture", [projectDir, windowsOutputB, "windows-realmz-folder"]);
await assertNoRawSources("after repeated Windows export");
await runCargoExample("export_project_fixture", [projectDir, classicOutputA, "mac-classic-folder"]);
await assertNoRawSources("after first Classic-Mac export");
await runCargoExample("export_project_fixture", [projectDir, classicOutputB, "mac-classic-folder"]);
await assertNoRawSources("after repeated Classic-Mac export");

const windowsFilesA = await readFlatDirectory(windowsOutputA);
const windowsFilesB = await readFlatDirectory(windowsOutputB);
const classicFilesA = await readFlatDirectory(classicOutputA);
const classicFilesB = await readFlatDirectory(classicOutputB);
assertCompleteNativeFolder(windowsFilesA, "Windows");
assertCompleteNativeFolder(classicFilesA, "Classic Mac");
assertFileMapsEqual(windowsFilesA, windowsFilesB, "repeated Windows compile");
assertFileMapsEqual(classicFilesA, classicFilesB, "repeated Classic-Mac compile");

await runCargoExample("import_scenario_project", [windowsOutputA, reimportDir, `${scenarioName} Reimported`]);
const reimported = JSON.parse(await fs.readFile(path.join(reimportDir, "project.json"), "utf8"));
expect(reimported.source.immutable === true, "Reimported native output should be a preserved legacy snapshot");
expect(reimported.source.files.length > 0, "Reimported native output should inventory compatibility files");
expect(await isDirectory(path.join(reimportDir, "raw-sources")), "Reimport should create a bounded compatibility annex");
expect(reimported.maps.filter((map) => map.levelType === "land").length === 1, "Reimport should recover one land map");
const activeTrigger = reimported.triggers.find((trigger) =>
  trigger.active
  && trigger.levelType === "land"
  && trigger.levelIndex === 0
  && trigger.coordinate?.x === 11
  && trigger.coordinate?.y === 12
);
expect(activeTrigger, "Reimport should recover the authored Action Point at 11,12");
expect(activeTrigger.actions.some((action) => action.rawCode === 1), "Reimported Action Point should retain the message action");
expect(activeTrigger.actions.some((action) => action.rawCode === 47), "Reimported Action Point should retain the quest action");
expect(
  reimported.messages.some((message) => message.text === "Providence owns this scenario."),
  "Reimport should recover the authored message"
);

const summary = {
  proofVersion: 1,
  scenarioName,
  canonicalProject: {
    path: relative(projectDir),
    origin: project.source.origin,
    rawSourcesPresent: false,
    sourceFileCount: project.source.files.length,
    maps: project.maps.length,
    actionPoints: project.triggers.length,
    messages: project.messages.length,
    questFlags: project.questLabels.map((quest) => quest.id)
  },
  nativeOutputs: {
    deterministic: true,
    windows: {
      path: relative(windowsOutputA),
      manifest: fileManifest(windowsFilesA)
    },
    classicMac: {
      path: relative(classicOutputA),
      manifest: fileManifest(classicFilesA)
    }
  },
  conservativeReimport: {
    path: relative(reimportDir),
    immutable: reimported.source.immutable,
    compatibilityAnnexPresent: true,
    activeActionPointRecovered: true,
    messageRecovered: true
  },
  runtime: {
    realmzStarted: false,
    gameplayScript: "fixtures/scenario-seeds/authoritative-ownership-proof.gameplay.json",
    note: "Run npm run smoke:oracle:authoritative for the external Realmz movement, Action Point, save, and reload gate."
  }
};
const summaryPath = path.join(proofRoot, "proof-summary.json");
await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

console.log("Authoritative scenario compiler proof passed.");
console.log(`- Canonical project: ${relative(projectDir)} (no raw-sources)`);
console.log(`- Native Windows folder: ${relative(windowsOutputA)}`);
console.log(`- Native Classic-Mac folder: ${relative(classicOutputA)}`);
console.log(`- Proof summary: ${relative(summaryPath)}`);

async function bundleScenarioCompiler() {
  const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));
  const { build } = requireFromRoot("esbuild");
  await build({
    entryPoints: [path.join(repoRoot, "src", "editor", "scenarioSeed.ts")],
    outfile: path.join(buildRoot, "scenarioSeed.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "silent"
  });
}

async function runCargoExample(example, args) {
  const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
  try {
    await execFileAsync(
      cargo,
      ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--example", example, "--", ...args],
      { cwd: repoRoot, maxBuffer: 1024 * 1024 * 16 }
    );
  } catch (error) {
    const stdout = error.stdout ? `\n${error.stdout}` : "";
    const stderr = error.stderr ? `\n${error.stderr}` : "";
    throw new Error(`Cargo example ${example} failed.${stdout}${stderr}`);
  }
}

async function assertNoRawSources(stage) {
  expect(!await pathExists(path.join(projectDir, "raw-sources")), `Fresh project created raw-sources ${stage}`);
  const savedProject = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
  expect(savedProject.source.files.length === 0, `Fresh project gained a source inventory ${stage}`);
}

function assertCompleteNativeFolder(files, label) {
  const exactSizes = new Map([
    [scenarioName, 316],
    ["Scenario", 600],
    ["Data CS", 316],
    ["Data LD", 90 * 90 * 2],
    ["Data RD", 644],
    ["Data DD", 100 * 40],
    ["Data NI", 200 * 100],
    ["Data Solids", 1024]
  ]);
  for (const [name, bytes] of exactSizes) {
    expect(files.has(name), `${label} output is missing ${name}`);
    expect(files.get(name).byteLength === bytes, `${label} ${name} should be ${bytes} bytes, found ${files.get(name).byteLength}`);
  }
  for (const name of ["Data DDD", "Data DL", "Data RDD", "Data SD", "Data TD2", "Data TD3", "Data ED", "Data ED2", "Data MD"]) {
    expect(files.has(name), `${label} output is missing required empty table ${name}`);
    expect(files.get(name).byteLength === 0, `${label} ${name} should be empty`);
  }
  expect(files.has("Scenario.rsrc"), `${label} output is missing Scenario.rsrc`);
  expect(files.get("Scenario.rsrc").byteLength >= 46, `${label} Scenario.rsrc is not structurally plausible`);
  expect(files.has("Data SD2"), `${label} output is missing authored messages`);
  expect(Buffer.from(files.get("Data SD2")).includes(Buffer.from("Providence owns this scenario.")), `${label} Data SD2 is missing the authored message`);
  expect(files.get("Data DD").some((byte) => byte !== 0), `${label} Data DD does not contain the authored Action Point`);
  expect(!files.has("Data MENU"), `${label} output should not include the Realmz-owned runtime cache Data MENU`);
}

async function readFlatDirectory(root) {
  const files = new Map();
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    files.set(entry.name, new Uint8Array(await fs.readFile(path.join(root, entry.name))));
  }
  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)));
}

function assertFileMapsEqual(left, right, label) {
  expect([...left.keys()].join("\n") === [...right.keys()].join("\n"), `${label} produced a different file set`);
  for (const [name, bytes] of left) {
    expect(Buffer.from(bytes).equals(Buffer.from(right.get(name))), `${label} produced different bytes for ${name}`);
  }
}

function fileManifest(files) {
  return [...files].map(([name, bytes]) => ({
    name,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex")
  }));
}

async function pathExists(target) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(target) {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

function relative(target) {
  return path.relative(repoRoot, target).replaceAll("\\", "/");
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
