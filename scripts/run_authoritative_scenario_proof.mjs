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
assertOwnershipScenarioMetadata(project, "Canonical project", true);
assertOwnershipGlobalMacros(project, "Canonical project", true);
expect(project.maps.length === 1, `Expected one map, found ${project.maps.length}`);
expect(project.triggers.length === 2, `Expected one map Action Point and one Extra Action Point, found ${project.triggers.length}`);
expect(project.messages.length === 2, `Expected two messages, found ${project.messages.length}`);
assertOwnershipMessage(project.messages, "Canonical project");
expect(project.messages.every((record) => (record.rawBytes?.length ?? 0) === 0), "Fresh canonical messages must not carry compatibility bytes");
assertOwnershipOptionLabels(project.optionLabels, "Canonical project");
expect(project.optionLabels.every((record) => (record.rawBytes?.length ?? 0) === 0), "Fresh canonical option labels must not carry compatibility bytes");
assertOwnershipSimpleEncounter(project.simpleEncounters, "Canonical project");
expect(project.simpleEncounters.every((record) => (record.rawBytes?.length ?? 0) === 0), "Fresh canonical simple encounters must not carry compatibility bytes");
assertOwnershipComplexEncounter(project.complexEncounters, "Canonical project");
expect(project.complexEncounters.every((record) => (record.rawBytes?.length ?? 0) === 0), "Fresh canonical complex encounters must not carry compatibility bytes");
assertOwnershipThiefEncounter(project.thiefEncounters, "Canonical project");
expect(project.thiefEncounters.every((record) => (record.rawBytes?.length ?? 0) === 0), "Fresh canonical thief encounters must not carry compatibility bytes");
assertOwnershipTimedEncounter(project.timedEncounters, "Canonical project");
expect(project.timedEncounters.every((record) => (record.rawBytes?.length ?? 0) === 0 && (record.reservedWords?.length ?? 0) === 0), "Fresh canonical timed encounters must not carry compatibility bytes");
assertOwnershipBattle(project.battles, "Canonical project");
expect(project.battles.every((record) => (record.rawBytes?.length ?? 0) === 0), "Fresh canonical battles must not carry compatibility bytes");
assertOwnershipMonster(project.monsters, project.monsterDescriptions, "Canonical project");
expect(project.monsters.every((record) => (record.rawBytes?.length ?? 0) === 0), "Fresh canonical monsters must not carry compatibility bytes");
expect(project.monsterDescriptions.every((record) => (record.rawBytes?.length ?? 0) === 0), "Fresh canonical monster descriptions must not carry compatibility bytes");
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
const questAction = project.triggers.flatMap((trigger) => trigger.actions).find((action) => action.rawCode === 47);
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
assertOwnershipMessage(reimported.messages, "Reimport");
assertOwnershipOptionLabels(reimported.optionLabels, "Reimport");
assertOwnershipSimpleEncounter(reimported.simpleEncounters, "Reimport");
assertOwnershipComplexEncounter(reimported.complexEncounters, "Reimport");
assertOwnershipThiefEncounter(reimported.thiefEncounters, "Reimport");
assertOwnershipTimedEncounter(reimported.timedEncounters, "Reimport");
assertOwnershipBattle(reimported.battles, "Reimport");
assertOwnershipMonster(reimported.monsters, reimported.monsterDescriptions, "Reimport");
assertOwnershipItemText(reimported.itemTexts, "Reimport");
assertOwnershipTreasure(reimported.treasures, "Reimport");
assertOwnershipShop(reimported.shops, "Reimport");
assertOwnershipSpell(reimported.spellOverrides, "Reimport");
assertOwnershipRules(reimported, "Reimport", false);
assertOwnershipScenarioMetadata(reimported, "Reimport", false);
assertOwnershipGlobalMacros(reimported, "Reimport", false);

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
    simpleEncounters: project.simpleEncounters.length,
    complexEncounters: project.complexEncounters.length,
    thiefEncounters: project.thiefEncounters.length,
    timedEncounters: project.timedEncounters.length,
    battles: project.battles.length,
    monsters: project.monsters.length,
    monsterDescriptions: project.monsterDescriptions.length,
    itemTexts: project.itemTexts.length,
    treasures: project.treasures.length,
    shops: project.shops.length,
    customSpells: project.spellOverrides.length,
    raceOverrides: project.raceOverrides.length,
    casteOverrides: project.casteOverrides.length,
    globalMacroHooks: project.scenario.globalMacroHooks?.slots.filter((slot) => slot.door !== 0).length ?? 0,
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
    timedEncounterRecovered: true,
    simpleEncounterRecovered: true,
    battleRecovered: true,
    monsterRecovered: true,
    monsterDescriptionRecovered: true,
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
  assertOwnershipScenarioMetadata(savedProject, `Rust-saved project ${stage}`, true);
  assertOwnershipGlobalMacros(savedProject, `Rust-saved project ${stage}`, true);
  assertOwnershipMessage(savedProject.messages, `Rust-saved project ${stage}`);
  expect(savedProject.messages?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} messages contain compatibility bytes`);
  assertOwnershipOptionLabels(savedProject.optionLabels, `Rust-saved project ${stage}`);
  expect(savedProject.optionLabels?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} option labels contain compatibility bytes`);
  assertOwnershipSimpleEncounter(savedProject.simpleEncounters, `Rust-saved project ${stage}`);
  expect(savedProject.simpleEncounters?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} simple encounters contain compatibility bytes`);
  assertOwnershipComplexEncounter(savedProject.complexEncounters, `Rust-saved project ${stage}`);
  expect(savedProject.complexEncounters?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} complex encounters contain compatibility bytes`);
  assertOwnershipThiefEncounter(savedProject.thiefEncounters, `Rust-saved project ${stage}`);
  expect(savedProject.thiefEncounters?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} thief encounters contain compatibility bytes`);
  assertOwnershipTimedEncounter(savedProject.timedEncounters, `Rust-saved project ${stage}`);
  expect(savedProject.timedEncounters?.every((record) => (record.rawBytes?.length ?? 0) === 0 && (record.reservedWords?.length ?? 0) === 0), `Rust-saved project ${stage} timed encounters contain compatibility bytes`);
  assertOwnershipBattle(savedProject.battles, `Rust-saved project ${stage}`);
  expect(savedProject.battles?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} battles contain compatibility bytes`);
  assertOwnershipMonster(savedProject.monsters, savedProject.monsterDescriptions, `Rust-saved project ${stage}`);
  expect(savedProject.monsters?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} monsters contain compatibility bytes`);
  expect(savedProject.monsterDescriptions?.every((record) => (record.rawBytes?.length ?? 0) === 0), `Rust-saved project ${stage} monster descriptions contain compatibility bytes`);
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
    ["Data CI", 4608],
    ["Global", 60],
    ["Data LD", 90 * 90 * 2],
    ["Data RD", 644],
    ["Data DD", 100 * 40],
    ["Data SD2", 2 * 256],
    ["Data OD", 50],
    ["Data ED", 426],
    ["Data ED2", 520],
    ["Data TD2", 2 * 118],
    ["Data TD3", 40],
    ["Data ED3", 3 * 40],
    ["Data BD", 346],
    ["Data MD", 2 * 210],
    ["Data DES", 2 * 256],
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
  for (const name of ["Data DDD", "Data DL", "Data RDD"]) {
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
  const contact = files.get("Data CI");
  const scenarioNameBytes = Buffer.from(scenarioName);
  expect(contact[0] === scenarioNameBytes.length, `${label} Data CI has the wrong scenario-name length`);
  expect(Buffer.from(contact.slice(1, 1 + scenarioNameBytes.length)).equals(scenarioNameBytes), `${label} Data CI has the wrong scenario name`);
  expect(contact.slice(1 + scenarioNameBytes.length, 256).every((byte) => byte === 0), `${label} Data CI scenario-name padding is not deterministic zero`);
  const globalHooks = files.get("Global");
  expect(readI16(globalHooks, 0) === 2, `${label} Global has the wrong authored start hook`);
  expect(globalHooks.slice(2).every((byte) => byte === 0), `${label} Global reserved and inactive hooks are not deterministic zero`);
  expect(Buffer.from(files.get("Data SD2")).includes(Buffer.from("Providence owns this scenario.")), `${label} Data SD2 is missing the authored message`);
  expect(Buffer.from(files.get("Data SD2")).includes(Buffer.from("Providence owns this rogue encounter.")), `${label} Data SD2 is missing the authored rogue message`);
  expect(files.get("Data DD").some((byte) => byte !== 0), `${label} Data DD does not contain the authored Action Point`);
  expect(files.get("Data NI").some((byte) => byte !== 0), `${label} Data NI does not contain the authored scenario item`);
  expect(files.get("Data TD").some((byte) => byte !== 0), `${label} Data TD does not contain the authored treasure`);
  expect(files.get("Data SD").some((byte) => byte !== 0), `${label} Data SD does not contain the authored shop`);
  const battle = files.get("Data BD");
  expect(battle[84 * 2] === 0 && battle[84 * 2 + 1] === 1, `${label} Data BD does not contain the authored monster placement`);
  expect(battle[338] === 3, `${label} Data BD has the wrong authored distance`);
  expect(battle[339] === 0, `${label} Data BD alignment padding is not deterministic zero`);
  const monster = files.get("Data MD");
  expect(monster.slice(0, 210).every((byte) => byte === 0), `${label} Data MD unused record 0 is not deterministic zero`);
  const authoredMonster = monster.slice(210);
  expect(Buffer.from(authoredMonster.slice(0, 10)).equals(Buffer.from([9, 200, 201, 1, 202, 252, 0, 0, 0, 1])), `${label} Data MD has the wrong authored scalar bytes`);
  expect(Buffer.from(authoredMonster.slice(10, 18)).equals(Buffer.from([1, 255, 2, 254, 3, 253, 4, 252])), `${label} Data MD has the wrong authored trait flags`);
  expect(Buffer.from(authoredMonster.slice(20, 24)).equals(Buffer.from([1, 8, 0, 0])), `${label} Data MD has the wrong authored attack row`);
  expect(Buffer.from(authoredMonster.slice(170, 189)).equals(Buffer.from("Providence Sentinel")), `${label} Data MD has the wrong authored display name`);
  expect(authoredMonster.slice(189).every((byte) => byte === 0), `${label} Data MD name padding is not deterministic zero`);
  const monsterDescription = files.get("Data DES");
  const expectedMonsterDescription = Buffer.from("Compiled entirely from canonical Providence monster data.");
  expect(monsterDescription.slice(0, 256).every((byte) => byte === 0), `${label} Data DES unused record 0 is not deterministic zero`);
  const authoredMonsterDescription = monsterDescription.slice(256);
  expect(authoredMonsterDescription[0] === expectedMonsterDescription.length, `${label} Data DES has the wrong authored Pascal length`);
  expect(Buffer.from(authoredMonsterDescription.slice(1, 1 + expectedMonsterDescription.length)).equals(expectedMonsterDescription), `${label} Data DES has the wrong authored description`);
  expect(authoredMonsterDescription.slice(1 + expectedMonsterDescription.length).every((byte) => byte === 0), `${label} Data DES padding is not deterministic zero`);
  const spell = files.get("Data Spell");
  const authoredSpell = spell.slice(16 * 30, 17 * 30);
  expect(spell.slice(0, 16 * 30).every((byte) => byte === 0), `${label} Data Spell unused records before slot 16 are not deterministic zero`);
  expect(authoredSpell[10] === 4 && authoredSpell[15] === 3 && authoredSpell[23] === 1 && authoredSpell[27] === 4, `${label} Data Spell has the wrong authored semantic fields`);
  expect(authoredSpell[28] === 1 && authoredSpell[29] === 0, `${label} Data Spell has the wrong authored availability flags`);
  const race = files.get("Data Race").slice(19 * 408, 20 * 408);
  expect(readI16(race, 192) === 120 && readI16(race, 196) === 11 && readI16(race, 198) === 7 && race[333] === 1, `${label} Data Race has the wrong authored semantic fields`);
  expect(race.slice(96, 112).every((byte) => byte === 0) && race.slice(346).every((byte) => byte === 0), `${label} Data Race compatibility words are not deterministic zero`);
  const caste = files.get("Data Caste").slice(20 * 576, 21 * 576);
  expect(readI16(caste, 248) === 2 && readI16(caste, 252) === 1 && readI16(caste, 254) === 5 && readI16(caste, 384) === 25, `${label} Data Caste has the wrong authored semantic fields`);
  expect(caste.slice(240, 248).every((byte) => byte === 0) && caste.slice(450).every((byte) => byte === 0), `${label} Data Caste compatibility words are not deterministic zero`);
  const simpleEncounter = files.get("Data ED");
  expect(simpleEncounter[0] === 1, `${label} Data ED does not contain the authored message action`);
  expect(readI16(simpleEncounter, 32) === 0, `${label} Data ED message action has the wrong authored ID`);
  expect(simpleEncounter[96] === 1, `${label} Data ED has the wrong first choice result`);
  expect(simpleEncounter[100] === 1 && simpleEncounter[101] === 1 && simpleEncounter[102] === 0, `${label} Data ED has the wrong authored encounter controls`);
  expect(simpleEncounter[103] === 0, `${label} Data ED alignment padding is not deterministic zero`);
  expect(readI16(simpleEncounter, 104) === 0, `${label} Data ED has the wrong prompt message ID`);
  expect(Buffer.from(simpleEncounter.slice(106, 115)).equals(Buffer.from([8, 67, 111, 110, 116, 105, 110, 117, 101])), `${label} Data ED has the wrong authored option text`);
  const complexEncounter = files.get("Data ED2");
  expect(complexEncounter[0] === 1 && complexEncounter[8] === 1 && complexEncounter[16] === 1 && complexEncounter[24] === 1, `${label} Data ED2 does not contain all four authored result scripts`);
  expect(readI16(complexEncounter, 32) === 0 && readI16(complexEncounter, 48) === 0 && readI16(complexEncounter, 64) === 0 && readI16(complexEncounter, 80) === 0, `${label} Data ED2 result scripts have the wrong authored message ID`);
  expect(complexEncounter[96] === 1 && complexEncounter[97] === 2, `${label} Data ED2 has the wrong physical or word result`);
  expect(complexEncounter[98] === 1 && complexEncounter.slice(99, 106).every((byte) => byte === 0), `${label} Data ED2 has the wrong required-action flags`);
  expect(readI16(complexEncounter, 106) === 16 && readI16(complexEncounter, 108) === 1100 && complexEncounter[126] === 3, `${label} Data ED2 has the wrong authored spell response`);
  expect(readI16(complexEncounter, 136) === 901 && complexEncounter[146] === 4, `${label} Data ED2 has the wrong authored item response`);
  expect(complexEncounter[151] === 1 && complexEncounter[152] === 1 && complexEncounter[153] === 1 && complexEncounter[154] === 0 && complexEncounter[155] === 1, `${label} Data ED2 has the wrong authored encounter controls`);
  expect(complexEncounter[157] === 0, `${label} Data ED2 alignment padding is not deterministic zero`);
  expect(readI16(complexEncounter, 158) === 0, `${label} Data ED2 has the wrong prompt message ID`);
  expect(Buffer.from(complexEncounter.slice(160, 168)).equals(Buffer.from([7, 73, 110, 115, 112, 101, 99, 116])), `${label} Data ED2 has the wrong authored action text`);
  expect(Buffer.from(complexEncounter.slice(480, 491)).equals(Buffer.from([10, 112, 114, 111, 118, 105, 100, 101, 110, 99, 101])), `${label} Data ED2 has the wrong authored typed reply`);
  const thiefEncounter = files.get("Data TD2").slice(118);
  expect(thiefEncounter.slice(0, 10).every((byte) => byte === 1), `${label} Data TD2 has the wrong authored action and trap flags`);
  expect(Buffer.from(thiefEncounter.slice(10, 18)).equals(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])), `${label} Data TD2 has the wrong authored modifiers`);
  expect(Buffer.from(thiefEncounter.slice(18, 26)).equals(Buffer.from([1, 2, 3, 4, 1, 2, 3, 4])), `${label} Data TD2 has the wrong authored success results`);
  expect(Buffer.from(thiefEncounter.slice(26, 34)).equals(Buffer.from([4, 3, 2, 1, 4, 3, 2, 1])), `${label} Data TD2 has the wrong authored failure results`);
  for (let slot = 0; slot < 8; slot += 1) {
    expect(readI16(thiefEncounter, 34 + slot * 2) === 1 && readI16(thiefEncounter, 50 + slot * 2) === 1, `${label} Data TD2 has the wrong authored message routes in slot ${slot}`);
    expect(readI16(thiefEncounter, 66 + slot * 2) === 137 && readI16(thiefEncounter, 82 + slot * 2) === 137, `${label} Data TD2 has the wrong authored sound routes in slot ${slot}`);
  }
  expect(readI16(thiefEncounter, 98) === 17 && readI16(thiefEncounter, 100) === 3 && readI16(thiefEncounter, 102) === 9 && readI16(thiefEncounter, 104) === 5, `${label} Data TD2 has the wrong authored trap, damage, or lock fields`);
  expect(readI16(thiefEncounter, 106) === 1 && readI16(thiefEncounter, 108) === 137 && readI16(thiefEncounter, 110) === 5, `${label} Data TD2 has the wrong authored prompt support fields`);
  expect(readI16(thiefEncounter, 112) === 0 && readI16(thiefEncounter, 114) === 7 && readI16(thiefEncounter, 116) === 6, `${label} Data TD2 has the wrong authored sound and spell-chance fields`);
  const timedEncounter = files.get("Data TD3");
  expect([35, 5, 50, 2, 0, -1, 10, 12, 901, 1, 1].every((value, slot) => readI16(timedEncounter, slot * 2) === value), `${label} Data TD3 has the wrong authored schedule, target, gates, or location`);
  expect(timedEncounter.slice(22).every((byte) => byte === 0), `${label} Data TD3 fresh reserved words are not deterministic zero`);
  expect(!files.has("Data MENU"), `${label} output should not include the Realmz-owned runtime cache Data MENU`);
}

function assertOwnershipItemText(records, label) {
  const itemText = records?.find((record) => record.itemId === 901);
  expect(itemText, `${label} is missing item-text record 901`);
  expect(itemText.unidentifiedName === "Unknown Providence Token", `${label} has the wrong unidentified item name`);
  expect(itemText.identifiedName === "Providence Token", `${label} has the wrong identified item name`);
  expect(itemText.description === "This item text was compiled from canonical Providence data.", `${label} has the wrong item description`);
}

function assertOwnershipMessage(records, label) {
  const message = records?.find((record) => record.id === 0);
  const rogueMessage = records?.find((record) => record.id === 1);
  expect(message, `${label} is missing message 0`);
  expect(message.text === "Providence owns this scenario.", `${label} has the wrong canonical message text`);
  expect(rogueMessage?.text === "Providence owns this rogue encounter.", `${label} has the wrong canonical rogue message text`);
}

function assertOwnershipOptionLabels(records, label) {
  const proceed = records?.find((record) => record.id === 0);
  const withdraw = records?.find((record) => record.id === 1);
  expect(proceed?.text === "Proceed", `${label} has the wrong option label 0`);
  expect(withdraw?.text === "Withdraw", `${label} has the wrong option label 1`);
}

function assertOwnershipSimpleEncounter(records, label) {
  const encounter = records?.find((record) => record.id === 0);
  expect(encounter, `${label} is missing simple encounter 0`);
  expect(encounter.actions?.some((action) => action.slot === 0 && action.rawCode === 1 && action.id === 0), `${label} simple encounter has the wrong message action`);
  expect(encounter.choiceResults?.join(",") === "1,0,0,0", `${label} simple encounter has the wrong choice results`);
  expect(encounter.canBackOut === true && encounter.maxTimes === 1 && encounter.casteSuccess === 0, `${label} simple encounter has the wrong control fields`);
  expect(encounter.prompt === 0, `${label} simple encounter has the wrong prompt`);
  expect(encounter.texts?.join("\n") === "Continue\n\n\n", `${label} simple encounter has the wrong option text`);
}

function assertOwnershipComplexEncounter(records, label) {
  const encounter = records?.find((record) => record.id === 0);
  expect(encounter, `${label} is missing complex encounter 0`);
  expect(encounter.actions?.map((action) => `${action.slot}:${action.rawCode}:${action.id}`).join(",") === "0:1:0,8:1:0,16:1:0,24:1:0", `${label} complex encounter has the wrong result scripts`);
  expect(encounter.actionResult === 1 && encounter.wordResult === 2, `${label} complex encounter has the wrong physical or word result`);
  expect(encounter.groups?.join(",") === "1,0,0,0,0,0,0,0", `${label} complex encounter has the wrong required-action flags`);
  expect(encounter.spellIds?.length === 10 && encounter.spellIds[0] === 16 && encounter.spellIds[1] === 1100 && encounter.spellResults[0] === 3, `${label} complex encounter has the wrong spell response`);
  expect(encounter.itemIds?.length === 5 && encounter.itemIds[0] === 901 && encounter.itemResults[0] === 4, `${label} complex encounter has the wrong item response`);
  expect(encounter.canBackOut === true && encounter.thief === true && encounter.thiefSuccess === 1 && encounter.maxTimes === 1 && encounter.casteSuccess === 0, `${label} complex encounter has the wrong control fields`);
  expect(encounter.prompt === 0, `${label} complex encounter has the wrong prompt`);
  expect(encounter.texts?.length === 9 && encounter.texts[0] === "Inspect" && encounter.texts[8] === "providence", `${label} complex encounter has the wrong inline text`);
  expect(encounter.choiceResults === undefined && encounter.wordResults === undefined, `${label} complex encounter still carries obsolete result aliases`);
}

function assertOwnershipThiefEncounter(records, label) {
  const encounter = records?.find((record) => record.id === 1);
  expect(encounter, `${label} is missing thief encounter 1`);
  expect(encounter.typeFlags?.length === 10 && encounter.typeFlags.every(Boolean), `${label} thief encounter has the wrong action or trap flags`);
  expect(encounter.modifiers?.join(",") === "1,2,3,4,5,6,7,8", `${label} thief encounter has the wrong modifiers`);
  expect(encounter.successCodes?.join(",") === "1,2,3,4,1,2,3,4", `${label} thief encounter has the wrong success results`);
  expect(encounter.failureCodes?.join(",") === "4,3,2,1,4,3,2,1", `${label} thief encounter has the wrong failure results`);
  expect(encounter.successText?.every((value) => value === 1) && encounter.failureText?.every((value) => value === 1), `${label} thief encounter has the wrong message routes`);
  expect(encounter.successSounds?.every((value) => value === 137) && encounter.failureSounds?.every((value) => value === 137), `${label} thief encounter has the wrong sound routes`);
  expect(encounter.spell === 17 && encounter.lowDamage === 3 && encounter.highDamage === 9 && encounter.tumblers === 5, `${label} thief encounter has the wrong trap or lock fields`);
  expect(encounter.prompts?.join(",") === "1,137,5" && encounter.promptSounds?.join(",") === "0,7,6", `${label} thief encounter has the wrong prompt support fields`);
}

function assertOwnershipTimedEncounter(records, label) {
  const encounter = records?.find((record) => record.id === 0);
  expect(encounter, `${label} is missing timed encounter 0`);
  expect(encounter.day === 35 && encounter.increment === 5 && encounter.percent === 50, `${label} timed encounter has the wrong schedule`);
  expect(encounter.door === 2, `${label} timed encounter has the wrong Extra Action Point target`);
  expect(encounter.requiredLevel === 0 && encounter.requiredRandomRect === -1 && encounter.requiredX === 10 && encounter.requiredY === 12, `${label} timed encounter has the wrong location gates`);
  expect(encounter.requiredItem === 901 && encounter.requiredQuest === 1 && encounter.locationKind === "land", `${label} timed encounter has the wrong item, quest, or location kind`);
}

function assertOwnershipBattle(records, label) {
  const battle = records?.find((record) => record.id === 0);
  expect(battle, `${label} is missing battle 0`);
  expect(battle.grid?.length === 13 * 13, `${label} battle has the wrong grid-slot inventory`);
  expect(battle.grid[84] === 1, `${label} battle has the wrong authored monster placement`);
  expect(battle.dist === 3, `${label} battle has the wrong authored distance`);
  expect(battle.messageBefore === 0 && battle.messageAfter === 0 && battle.battleMacro === 0, `${label} battle has the wrong message or macro fields`);
}

function assertOwnershipMonster(records, descriptions, label) {
  const monster = records?.find((record) => record.id === 1);
  expect(monster, `${label} is missing monster 1`);
  expect(monster.hitDice === 9 && monster.staminaBonus === 200 && monster.agility === 201 && monster.movementMax === 202, `${label} monster has the wrong unsigned-byte fields`);
  expect(monster.armor === -4 && monster.typeFlags?.join(",") === "1,-1,2,-2,3,-3,4,-4", `${label} monster has the wrong signed-byte fields`);
  expect(monster.attacks?.length === 5 && monster.attacks[0]?.join(",") === "1,8,0,0", `${label} monster has the wrong fixed attack inventory`);
  expect(monster.displayName === "Providence Sentinel", `${label} monster has the wrong display name`);
  const description = descriptions?.find((record) => record.id === 1);
  expect(description?.text === "Compiled entirely from canonical Providence monster data.", `${label} has the wrong monster description`);
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

function assertOwnershipScenarioMetadata(project, label, requireNoCompatibilityBytes) {
  const contact = project.scenario?.contactInfo;
  expect(contact, `${label} is missing scenario contact info`);
  expect(contact.scenarioName === scenarioName, `${label} has the wrong scenario contact name`);
  expect(contact.author === "Providence", `${label} has the wrong scenario contact author`);
  if (requireNoCompatibilityBytes) {
    expect((contact.rawBytes?.length ?? 0) === 0, `${label} scenario contact contains compatibility bytes`);
    expect((project.scenario?.restrictions?.rawBytes?.length ?? 0) === 0, `${label} scenario restrictions contain compatibility bytes`);
  }
}

function assertOwnershipGlobalMacros(project, label, requireNoCompatibilityBytes) {
  const hooks = project.scenario?.globalMacroHooks;
  expect(hooks, `${label} is missing global macro hooks`);
  expect(hooks.slots.find((slot) => slot.slot === 0)?.door === 2, `${label} has the wrong global start macro`);
  if (requireNoCompatibilityBytes) {
    expect((hooks.rawBytes?.length ?? 0) === 0, `${label} global macros contain compatibility bytes`);
  }
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
  expect(project.spellOverrides?.every((record) => (record.rawBytes?.length ?? 0) === 0), `${label} spell overrides contain compatibility bytes`);
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

function readI16(bytes, offset) {
  const value = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  return value >= 0x8000 ? value - 0x10000 : value;
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
