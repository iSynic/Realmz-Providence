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
const browserWindowsOutput = path.join(proofRoot, "browser-native-windows", "Providence Ownership Proof");
const browserClassicOutput = path.join(proofRoot, "browser-native-classic", "Providence Ownership Proof");
const reimportDir = path.join(proofRoot, "reimported.providence");
const scenarioName = "Providence Ownership Proof";

await fs.rm(proofRoot, { recursive: true, force: true });
await fs.mkdir(buildRoot, { recursive: true });
await bundleScenarioCompiler();

const requireFromBuild = createRequire(path.join(buildRoot, "proof.cjs"));
const { createProjectFromScenarioSeed } = requireFromBuild("./scenarioSeed.cjs");
const { createBrowserScenarioPackageZip } = requireFromBuild("./scenarioPackage.cjs");
const { readStoredZip } = requireFromBuild("./zip.cjs");
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
expect(project.scenarioItems.length === 1, `Expected one scenario item, found ${project.scenarioItems.length}`);
expect((project.scenarioItems[0].rawBytes?.length ?? 0) === 0, "Fresh canonical scenario item must not carry compatibility bytes");
expect(project.scenarioItems[0].spare2?.length === 7, "Fresh canonical scenario item must own all seven spare words");
expect(project.treasures.length === 1, `Expected one treasure, found ${project.treasures.length}`);
expect((project.treasures[0].rawBytes?.length ?? 0) === 0, "Fresh canonical treasure must not carry compatibility bytes");
expect(project.treasures[0].itemIds?.length === 20, "Fresh canonical treasure must own all twenty item slots");
expect(project.treasures[0].itemIds[0] === 901 && project.treasures[0].gold === 1, "Fresh canonical treasure has the wrong semantic rewards");
expect(project.shops.length === 1, `Expected one shop, found ${project.shops.length}`);
expect((project.shops[0].rawBytes?.length ?? 0) === 0, "Fresh canonical shop must not carry compatibility bytes");
expect(project.shops[0].itemIds?.length === 1000 && project.shops[0].quantities?.length === 1000, "Fresh canonical shop must own all stock slots");
expect(project.shops[0].itemIds[0] === 901 && project.shops[0].quantities[0] === 1 && project.shops[0].inflation === 105, "Fresh canonical shop has the wrong semantic stock");
expect(project.itemTexts.length === 1, `Expected one item-text record, found ${project.itemTexts.length}`);
assertOwnershipItemText(project.itemTexts, "Canonical project");
expect(project.spellOverrides.length === 1, `Expected one custom spell, found ${project.spellOverrides.length}`);
assertOwnershipSpell(project.spellOverrides, "Canonical project");
expect(project.raceOverrides.length === 1, `Expected one race override, found ${project.raceOverrides.length}`);
expect(project.casteOverrides.length === 1, `Expected one caste override, found ${project.casteOverrides.length}`);
assertOwnershipRules(project, "Canonical project", true);
assertNoFreshRuleCompatibilityBytes(project, "Canonical project");
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
const browserWindowsPackage = createBrowserScenarioPackageZip(project, null, "windows-realmz-folder");
const browserClassicPackage = createBrowserScenarioPackageZip(project, null, "mac-classic-folder");
const browserAnnexTrapPackage = createBrowserScenarioPackageZip(project, {
  rootName: "ANNEX READ TRAP",
  sourceKind: "browser-scenario-import",
  targetPlatform: "windows-realmz",
  capturedAt: "2026-07-18T00:00:00.000Z",
  files: [
    {
      name: "Data NI",
      relativePath: "Data NI",
      originalRelativePath: "Data NI",
      bytes: 20_001,
      sha256: "must-not-be-read",
      role: "supported-binary",
      editable: true,
      targetPlatform: "windows-realmz",
      captureConfidence: "captured",
      bytesData: new Uint8Array(20_001).fill(0xA5)
    },
    {
      name: "ANNEX ENUMERATION TRAP",
      relativePath: "ANNEX ENUMERATION TRAP",
      originalRelativePath: "ANNEX ENUMERATION TRAP",
      bytes: 3,
      sha256: "must-not-be-enumerated",
      role: "pass-through",
      editable: false,
      targetPlatform: "windows-realmz",
      captureConfidence: "captured",
      bytesData: new Uint8Array([1, 2, 3])
    }
  ]
}, "windows-realmz-folder");
const browserWindowsFiles = browserPackageFiles(browserWindowsPackage.zip, readStoredZip);
const browserClassicFiles = browserPackageFiles(browserClassicPackage.zip, readStoredZip);
const browserAnnexTrapFiles = browserPackageFiles(browserAnnexTrapPackage.zip, readStoredZip);
assertCompleteNativeFolder(windowsFilesA, "Windows");
assertCompleteNativeFolder(classicFilesA, "Classic Mac");
assertCompleteNativeFolder(browserWindowsFiles, "browser Windows");
assertCompleteNativeFolder(browserClassicFiles, "browser Classic Mac");
assertManifestNamesEqual(project.validation.exportableFiles, browserWindowsFiles, "Browser validation manifest");
assertFileMapsEqual(windowsFilesA, windowsFilesB, "repeated Windows compile");
assertFileMapsEqual(classicFilesA, classicFilesB, "repeated Classic-Mac compile");
assertFileMapsEqual(windowsFilesA, browserWindowsFiles, "Rust/browser Windows compile");
assertFileMapsEqual(classicFilesA, browserClassicFiles, "Rust/browser Classic-Mac compile");
assertFileMapsEqual(browserWindowsFiles, browserAnnexTrapFiles, "authored browser annex access guard");
expect(browserWindowsPackage.report.passThroughFiles.length === 0, "Browser Windows authored compile must not pass through compatibility files");
expect(browserClassicPackage.report.passThroughFiles.length === 0, "Browser Classic-Mac authored compile must not pass through compatibility files");
expect(browserAnnexTrapPackage.report.passThroughFiles.length === 0, "Authored browser compile must ignore a supplied compatibility snapshot");
await writeFlatDirectory(browserWindowsOutput, browserWindowsFiles);
await writeFlatDirectory(browserClassicOutput, browserClassicFiles);

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
assertOwnershipItemText(reimported.itemTexts, "Reimport");
assertOwnershipTreasure(reimported.treasures, "Reimport");
assertOwnershipShop(reimported.shops, "Reimport");
assertOwnershipSpell(reimported.spellOverrides, "Reimport");
assertOwnershipRules(reimported, "Reimport", false);

const summary = {
  proofVersion: 1,
  scenarioName,
  canonicalProject: {
    path: relative(projectDir),
    origin: project.source.origin,
    rawSourcesPresent: false,
    annexAccessGuard: "passed",
    sourceFileCount: project.source.files.length,
    maps: project.maps.length,
    actionPoints: project.triggers.length,
    messages: project.messages.length,
    itemTexts: project.itemTexts.length,
    treasures: project.treasures.length,
    shops: project.shops.length,
    customSpells: project.spellOverrides.length,
    raceOverrides: project.raceOverrides.length,
    casteOverrides: project.casteOverrides.length,
    questFlags: project.questLabels.map((quest) => quest.id)
  },
  nativeOutputs: {
    deterministic: true,
    browserDesktopByteParity: true,
    windows: {
      path: relative(windowsOutputA),
      manifest: fileManifest(windowsFilesA)
    },
    classicMac: {
      path: relative(classicOutputA),
      manifest: fileManifest(classicFilesA)
    },
    browserWindows: {
      path: relative(browserWindowsOutput),
      passThroughFiles: browserWindowsPackage.report.passThroughFiles.length,
      manifest: fileManifest(browserWindowsFiles)
    },
    browserClassicMac: {
      path: relative(browserClassicOutput),
      passThroughFiles: browserClassicPackage.report.passThroughFiles.length,
      manifest: fileManifest(browserClassicFiles)
    }
  },
  conservativeReimport: {
    path: relative(reimportDir),
    immutable: reimported.source.immutable,
    compatibilityAnnexPresent: true,
    activeActionPointRecovered: true,
    messageRecovered: true,
    itemTextRecovered: true,
    treasureRecovered: true,
    shopRecovered: true,
    customSpellRecovered: true,
    raceOverrideRecovered: true,
    casteOverrideRecovered: true
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
console.log(`- Browser/native byte parity: Windows and Classic-Mac (no raw sources)`);
console.log(`- Proof summary: ${relative(summaryPath)}`);

async function bundleScenarioCompiler() {
  const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));
  const { build } = requireFromRoot("esbuild");
  await build({
    entryPoints: {
      scenarioSeed: path.join(repoRoot, "src", "editor", "scenarioSeed.ts"),
      scenarioPackage: path.join(repoRoot, "src", "editor", "browser", "scenarioPackage.ts"),
      zip: path.join(repoRoot, "src", "editor", "browser", "zip.ts")
    },
    outdir: buildRoot,
    outExtension: { ".js": ".cjs" },
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
  assertOwnershipItemText(savedProject.itemTexts, `Rust-saved project ${stage}`);
  assertOwnershipTreasure(savedProject.treasures, `Rust-saved project ${stage}`);
  expect(savedProject.treasures?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} treasures contain compatibility bytes`);
  assertOwnershipShop(savedProject.shops, `Rust-saved project ${stage}`);
  expect(savedProject.shops?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} shops contain compatibility bytes`);
  assertOwnershipSpell(savedProject.spellOverrides, `Rust-saved project ${stage}`);
  assertOwnershipRules(savedProject, `Rust-saved project ${stage}`, true);
  assertNoFreshRuleCompatibilityBytes(savedProject, `Rust-saved project ${stage}`);
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
    ["Data TD", 48],
    ["Data SD", 3002],
    ["Data Spell", 105 * 30],
    ["Data Race", 30 * 408],
    ["Data Caste", 30 * 576],
    ["Data Solids", 1024]
  ]);
  for (const [name, bytes] of exactSizes) {
    expect(files.has(name), `${label} output is missing ${name}`);
    expect(files.get(name).byteLength === bytes, `${label} ${name} should be ${bytes} bytes, found ${files.get(name).byteLength}`);
  }
  for (const name of ["Data DDD", "Data DL", "Data RDD", "Data TD2", "Data TD3", "Data ED", "Data ED2", "Data MD"]) {
    expect(files.has(name), `${label} output is missing required empty table ${name}`);
    expect(files.get(name).byteLength === 0, `${label} ${name} should be empty`);
  }
  expect(files.has("Scenario.rsrc"), `${label} output is missing Scenario.rsrc`);
  expect(files.get("Scenario.rsrc").byteLength >= 46, `${label} Scenario.rsrc is not structurally plausible`);
  expect(files.has("Data ID.rsrc"), `${label} output is missing canonical item text resources`);
  expect(files.get("Data ID.rsrc").byteLength >= 46, `${label} Data ID.rsrc is not structurally plausible`);
  expect(files.has("Data Spell.rsrc"), `${label} output is missing canonical custom-spell names`);
  expect(files.get("Data Spell.rsrc").byteLength >= 46, `${label} Data Spell.rsrc is not structurally plausible`);
  expect(files.has("Data SD2"), `${label} output is missing authored messages`);
  expect(Buffer.from(files.get("Data SD2")).includes(Buffer.from("Providence owns this scenario.")), `${label} Data SD2 is missing the authored message`);
  expect(files.get("Data DD").some((byte) => byte !== 0), `${label} Data DD does not contain the authored Action Point`);
  expect(files.get("Data NI").some((byte) => byte !== 0), `${label} Data NI does not contain the authored scenario item`);
  expect(files.get("Data TD").some((byte) => byte !== 0), `${label} Data TD does not contain the authored treasure`);
  expect(files.get("Data SD").some((byte) => byte !== 0), `${label} Data SD does not contain the authored shop`);
  expect(!files.has("Data MENU"), `${label} output should not include the Realmz-owned runtime cache Data MENU`);
}

function assertOwnershipItemText(records, label) {
  const itemText = records?.find((record) => record.itemId === 901);
  expect(itemText, `${label} is missing item-text record 901`);
  expect(itemText.unidentifiedName === "Unknown Providence Token", `${label} has the wrong unidentified item name`);
  expect(itemText.identifiedName === "Providence Token", `${label} has the wrong identified item name`);
  expect(itemText.description === "This item text was compiled from canonical Providence data.", `${label} has the wrong item description`);
}

function assertOwnershipTreasure(records, label) {
  const treasure = records?.find((record) => record.id === 0);
  expect(treasure, `${label} is missing treasure 0`);
  expect(treasure.itemIds?.length === 20, `${label} treasure has the wrong item-slot inventory`);
  expect(treasure.itemIds[0] === 901 && treasure.gold === 1, `${label} treasure has the wrong semantic rewards`);
}

function assertOwnershipShop(records, label) {
  const shop = records?.find((record) => record.id === 0);
  expect(shop, `${label} is missing shop 0`);
  expect(shop.itemIds?.length === 1000 && shop.quantities?.length === 1000, `${label} shop has the wrong stock-slot inventory`);
  expect(shop.itemIds[0] === 901 && shop.quantities[0] === 1 && shop.inflation === 105, `${label} shop has the wrong semantic stock`);
}

function assertOwnershipSpell(records, label) {
  const spell = records?.find((record) => record.id === 16);
  expect(spell, `${label} is missing custom spell 16`);
  expect(spell.displayName === "Providence Ward", `${label} has the wrong custom spell name`);
  expect(spell.cost === 4, `${label} has the wrong custom spell cost`);
  expect(spell.inCombat === true && spell.inCamp === false, `${label} has the wrong custom spell availability`);
}

function assertOwnershipRules(project, label, expectCanonicalNames) {
  const race = project.raceOverrides?.find((record) => record.id === 19);
  expect(race, `${label} is missing race override 19`);
  expect(race.baseMove === 11 && race.maxAge === 120 && race.magRes === 7 && race.canRegenerate === 1, `${label} has the wrong race semantics`);
  const caste = project.casteOverrides?.find((record) => record.id === 20);
  expect(caste, `${label} is missing caste override 20`);
  expect(caste.casteClass === 2 && caste.moveBonus === 1 && caste.magRes === 5 && caste.startMoney === 25, `${label} has the wrong caste semantics`);
  if (expectCanonicalNames) {
    expect(race.displayName === "Providence Kin", `${label} has the wrong canonical race label`);
    expect(caste.displayName === "Providence Warden", `${label} has the wrong canonical caste label`);
  }
}

function assertNoFreshRuleCompatibilityBytes(project, label) {
  expect(project.raceOverrides?.every((record) => (record.rawBytes?.length ?? 0) === 0), `${label} race overrides contain compatibility bytes`);
  expect(project.casteOverrides?.every((record) => (record.rawBytes?.length ?? 0) === 0), `${label} caste overrides contain compatibility bytes`);
}

async function readFlatDirectory(root) {
  const files = new Map();
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    files.set(entry.name, new Uint8Array(await fs.readFile(path.join(root, entry.name))));
  }
  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)));
}

function browserPackageFiles(zipBytes, readZip) {
  const files = new Map();
  for (const entry of readZip(zipBytes)) {
    const name = entry.path.split("/").slice(1).join("/");
    if (name && !name.includes("/")) files.set(name, entry.bytes);
  }
  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)));
}

async function writeFlatDirectory(root, files) {
  await fs.mkdir(root, { recursive: true });
  for (const [name, bytes] of files) {
    await fs.writeFile(path.join(root, name), bytes);
  }
}

function assertFileMapsEqual(left, right, label) {
  expect([...left.keys()].join("\n") === [...right.keys()].join("\n"), `${label} produced a different file set`);
  for (const [name, bytes] of left) {
    expect(Buffer.from(bytes).equals(Buffer.from(right.get(name))), `${label} produced different bytes for ${name}`);
  }
}

function assertManifestNamesEqual(expectedNames, files, label) {
  const expected = [...expectedNames].sort((left, right) => left.localeCompare(right));
  const actual = [...files.keys()].sort((left, right) => left.localeCompare(right));
  expect(expected.join("\n") === actual.join("\n"), `${label} does not match the compiler output file set`);
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
