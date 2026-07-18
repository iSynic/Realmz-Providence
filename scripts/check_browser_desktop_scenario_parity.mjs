import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ts from "typescript";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(repoRoot, "tmp", "browser-desktop-scenario-parity-build");
const workRoot = path.join(repoRoot, "tmp", "browser-desktop-scenario-parity");
const sourceFiles = [
  "src/editor/browser/zip.ts",
  "src/editor/browser/binaryWriters.ts",
  "src/editor/browser/shopRecords.ts",
  "src/editor/browser/resourceFork.ts",
  "src/editor/browser/fsAccess.ts",
  "src/editor/browser/scenarioPackage.ts"
];

await fs.rm(buildRoot, { recursive: true, force: true });
await fs.rm(workRoot, { recursive: true, force: true });
await fs.mkdir(buildRoot, { recursive: true });
await fs.mkdir(workRoot, { recursive: true });
await fs.writeFile(path.join(buildRoot, "package.json"), "{\"type\":\"commonjs\"}\n");

for (const sourceFile of sourceFiles) {
  const inputPath = path.join(repoRoot, sourceFile);
  const outputPath = path.join(buildRoot, sourceFile.replace(/\.ts$/, ".js"));
  const source = await fs.readFile(inputPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true
    },
    fileName: sourceFile
  }).outputText;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, transpiled);
}

const requireFromBuild = createRequire(path.join(buildRoot, "check.cjs"));
const { createBrowserScenarioPackageZip } = requireFromBuild("./src/editor/browser/scenarioPackage.js");
const { parseResourceFork, writeResourceFork } = requireFromBuild("./src/editor/browser/resourceFork.js");
const { readStoredZip } = requireFromBuild("./src/editor/browser/zip.js");

const defaultScenarioCorpusRoot = process.platform === "win32" ? "F:\\Realmz\\out_win_clang\\Scenarios" : "";
const scenarioCorpusRoot = process.env.REALMZ_SCENARIO_CORPUS || defaultScenarioCorpusRoot;
const scenarioCorpusCases = process.env.REALMZ_SCENARIO_PARITY_CASES || "City of Bywater";

const scenarioName = "Browser Desktop Parity";
const sourceDir = path.join(workRoot, scenarioName);
const projectDir = path.join(workRoot, "project");
await fs.mkdir(sourceDir, { recursive: true });

const rawFiles = [
  rawFile(scenarioName, scenarioShellBytes(), "unknown"),
  rawFile("Scenario", writeResourceFork([
    resource("PICT", 1, "Picture", 0, [1, 2, 3]),
    resource("cicn", 2, "Icon", 0, [4, 5, 6]),
    resource("snd ", 3, "Sound", 0, [7, 8, 9]),
    resource("STR#", -101, "Map Names", 0, [0, 1, 4, 77, 97, 112, 49]),
    resource("TEXT", 202, "Text", 0, [79, 108, 100]),
    resource("styl", 202, "Style", 0, [9, 9, 9])
  ]), "resource-fork"),
  rawFile("Data SD2", pascalRecords(["A", "B"], 256), "supported-binary"),
  rawFile("Data OD", pascalRecords(["Yes", "No"], 25), "supported-binary"),
  rawFile("Data BD", fixedBytes(346, [0xaa, 0xbb]), "supported-binary"),
  rawFile("Data MENU", [5, 6, 7], "unknown"),
  rawFile("Custom Names.rsrc", [8, 9], "resource-fork"),
  rawFile("Read Me.txt", [10, 11, 12], "unknown")
];

for (const file of rawFiles) {
  await fs.writeFile(path.join(sourceDir, file.name), file.bytesData);
}

await runCargoExample("import_scenario_project", [sourceDir, projectDir, scenarioName]);

const rawSources = {
  schemaVersion: 1,
  sourceKind: "browser-scenario-import",
  capturedAt: "2026-07-05T00:00:00.000Z",
  rootName: scenarioName,
  targetPlatform: "mac-classic",
  totalBytes: rawFiles.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
  files: rawFiles
};
const browserProject = fixtureProject(rawFiles);

await compareScenarioCase("synthetic-fixture", projectDir, browserProject, rawSources, {
  expectedMissingFiles: ["Data MENU", "Custom Names.rsrc"]
});
await compareOptionalCorpusScenarios();

console.log("Browser/desktop scenario parity checks passed.");

async function compareOptionalCorpusScenarios() {
  if (!scenarioCorpusRoot) {
    console.warn("Skipping corpus parity cases; set REALMZ_SCENARIO_CORPUS to enable them.");
    return;
  }
  if (!await directoryExists(scenarioCorpusRoot)) {
    console.warn(`Skipping corpus parity cases; ${scenarioCorpusRoot} was not found.`);
    return;
  }
  const scenarioNames = await selectedCorpusScenarioNames();
  for (const projectName of scenarioNames) {
    await compareOptionalCorpusScenario(projectName, safeCaseId(projectName), corpusExpectations(projectName));
  }
}

async function selectedCorpusScenarioNames() {
  if (scenarioCorpusCases.trim().toLowerCase() === "all") {
    const entries = await fs.readdir(scenarioCorpusRoot, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((left, right) => left.localeCompare(right));
  }
  return scenarioCorpusCases
    .split(/[;,]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function corpusExpectations(projectName) {
  if (projectName === "City of Bywater") {
    return {
      requiredFiles: ["City of Bywater", "Data Custom 1 BD", "Data SD2", "Data EDCD", "Scenario.rsrc"],
      expectedMissingFiles: ["Data MENU", "Custom Names.rsrc"],
      passThroughFiles: ["Data Custom 1 BD"],
      requiresTextStylResources: true,
      expectedProjectCounts: { shops: 16 },
      preserveSourceFiles: ["Data SD"],
      preservedSourceSuffixes: [{ name: "Data SD", offset: 16 * 3002 }],
      edited: {
        mutate: mutateCityOfBywaterForEditedParity,
        preservedSourceSuffixes: [{ name: "Data SD", sourceOffset: 16 * 3002, outputOffset: 17 * 3002 }],
        requiredWrittenFiles: [
          "Data LD",
          "Data DD",
          "Data ED3",
          "Data EDCD",
          "Data SD2",
          "Data OD",
          "Data BD",
          "Data MD",
          "Data DES",
          "Data NI",
          "Data SD",
          "Data ED",
          "Data ED2",
          "Data TD2",
          "Data TD3",
          "Data Race",
          "Data Caste",
          "Data CI",
          "Data RI",
          "Data MD2"
        ]
      }
    };
  }
  return {
    expectedMissingFiles: ["Data MENU", "Custom Names.rsrc"]
  };
}

function safeCaseId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "scenario";
}

async function compareOptionalCorpusScenario(projectName, caseId, expectations) {
  const scenarioDir = path.join(scenarioCorpusRoot, projectName);
  if (!await directoryExists(scenarioDir)) {
    console.warn(`Skipping ${projectName} corpus parity case; ${scenarioDir} was not found.`);
    return;
  }
  const importedProjectDir = path.join(workRoot, `${caseId}-project`);
  await runCargoExample("import_scenario_project", [scenarioDir, importedProjectDir, projectName]);
  const project = JSON.parse(await fs.readFile(path.join(importedProjectDir, "project.json"), "utf8"));
  for (const [collection, expectedCount] of Object.entries(expectations.expectedProjectCounts ?? {})) {
    expect(project[collection]?.length === expectedCount, `${projectName}: expected ${expectedCount} ${collection}, found ${project[collection]?.length ?? 0}`);
  }
  const importedRawSources = await rawSourcesFromImportedProject(importedProjectDir, project, projectName, "windows-realmz");
  await compareScenarioCase(caseId, importedProjectDir, project, importedRawSources, expectations);
  if (expectations.edited) {
    const editedProject = expectations.edited.mutate(project);
    const editedProjectDir = await clonedProjectDir(importedProjectDir, `${caseId}-edited-project`);
    await fs.writeFile(path.join(editedProjectDir, "project.json"), `${JSON.stringify(editedProject, null, 2)}\n`);
    await compareScenarioCase(`${caseId}-edited`, editedProjectDir, editedProject, importedRawSources, {
      expectedMissingFiles: expectations.expectedMissingFiles,
      requiredFiles: expectations.requiredFiles,
      passThroughFiles: expectations.passThroughFiles,
      requiresTextStylResources: expectations.requiresTextStylResources,
      preservedSourceSuffixes: expectations.edited.preservedSourceSuffixes ?? expectations.preservedSourceSuffixes,
      requiredWrittenFiles: expectations.edited.requiredWrittenFiles
    });
  }
}

async function compareScenarioCase(caseId, importedProjectDir, project, sourceSnapshot, expectations = {}) {
  for (const target of ["mac-classic-folder", "windows-realmz-folder"]) {
    const label = `${caseId} ${target}`;
    const desktopDir = path.join(workRoot, `desktop-${caseId}-${target}`);
    await runCargoExample("export_project_fixture", [importedProjectDir, desktopDir, target]);
    const desktopFiles = await readFlatDirectory(desktopDir);
    const browserResult = createBrowserScenarioPackageZip(project, sourceSnapshot, target);
    const browserFiles = unzipScenarioPackage(browserResult.zip);
    compareFileMaps(browserFiles, desktopFiles, label);
    for (const name of expectations.expectedMissingFiles ?? []) {
      expect(!browserFiles.has(name), `${label}: browser output should skip ${name}`);
      expect(!desktopFiles.has(name), `${label}: desktop output should skip ${name}`);
    }
    for (const name of expectations.requiredFiles ?? []) {
      expect(browserFiles.has(name), `${label}: browser output should include ${name}`);
      expect(desktopFiles.has(name), `${label}: desktop output should include ${name}`);
    }
    for (const name of expectations.passThroughFiles ?? []) {
      expect(browserResult.report.passThroughFiles.includes(name), `${label}: ${name} should be reported as pass-through`);
    }
    for (const name of expectations.requiredWrittenFiles ?? []) {
      expect(browserResult.report.writtenFiles.includes(name), `${label}: browser report should include written file ${name}`);
    }
    for (const name of expectations.preserveSourceFiles ?? []) {
      const source = sourceSnapshot.files.find((file) => file.name === name)?.bytesData;
      expect(source && bytesEqual(browserFiles.get(name), source), `${label}: browser output should preserve ${name} exactly`);
      expect(source && bytesEqual(desktopFiles.get(name), source), `${label}: desktop output should preserve ${name} exactly`);
    }
    for (const { name, offset, sourceOffset = offset, outputOffset = offset } of expectations.preservedSourceSuffixes ?? []) {
      const source = sourceSnapshot.files.find((file) => file.name === name)?.bytesData;
      expect(source && bytesEqual(browserFiles.get(name)?.slice(outputOffset), source.slice(sourceOffset)), `${label}: browser output should preserve ${name} suffix from source byte ${sourceOffset}`);
      expect(source && bytesEqual(desktopFiles.get(name)?.slice(outputOffset), source.slice(sourceOffset)), `${label}: desktop output should preserve ${name} suffix from source byte ${sourceOffset}`);
    }
    if (expectations.requiresTextStylResources) {
      expectTextStylResources(browserFiles, label);
    }
  }
}

async function clonedProjectDir(sourceDir, caseId) {
  const outputDir = path.join(workRoot, caseId);
  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.cp(sourceDir, outputDir, { recursive: true });
  return outputDir;
}

async function directoryExists(dir) {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function rawSourcesFromImportedProject(projectDir, project, rootName, targetPlatform) {
  const rawDir = path.join(projectDir, project.source?.rawSourcesDir || "raw-sources");
  const files = [];
  for (const source of project.source?.files ?? []) {
    const relativePath = source.relativePath || source.name;
    const bytesData = new Uint8Array(await fs.readFile(path.join(rawDir, relativePath)));
    files.push({
      ...source,
      bytesData,
      originalRelativePath: relativePath,
      targetPlatform,
      captureConfidence: "captured"
    });
  }
  return {
    schemaVersion: 1,
    sourceKind: "browser-scenario-import",
    capturedAt: "2026-07-05T00:00:00.000Z",
    rootName,
    targetPlatform,
    totalBytes: files.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
    files
  };
}

function mutateCityOfBywaterForEditedParity(project) {
  const edited = JSON.parse(JSON.stringify(project));
  edited.appVersion = `${edited.appVersion || "browser-desktop-scenario-parity-check"} edited-parity`;
  edited.validation ??= { ok: true, errors: [], warnings: [], exportableFiles: [], passThroughFiles: [], targetCompatibilityIssues: [] };

  const land = edited.maps?.find((map) => map.levelType === "land" && Array.isArray(map.tiles));
  if (land) {
    land.tiles[0] = land.tiles[0] === 73 ? 74 : 73;
  }

  const mapRecord = edited.mapRecords?.[0];
  if (mapRecord) {
    mapRecord.authored = true;
    mapRecord.startX = 7;
    mapRecord.startY = 8;
    mapRecord.note = "Browser/desktop edited map note";
    mapRecord.markers ??= [];
    mapRecord.markers[0] = { iconId: 123, x: 4, y: 5 };
  }

  const trigger = edited.triggers?.find((candidate) => candidate.levelType === "land" && candidate.source === "Data DD");
  if (trigger) {
    trigger.percent = 77;
    trigger.actions ??= [];
    trigger.actions[0] = actionRecord(trigger.actions[0], 0, 1, 77);
  }

  const macro = edited.triggers?.find((candidate) => candidate.source === "Data ED3");
  if (macro) {
    macro.actions ??= [];
    macro.actions[0] = actionRecord(macro.actions[0], 0, 1, 78);
  }

  const extraCode = edited.extracodes?.[0];
  if (extraCode) {
    extraCode.values = [101, 102, 103, 104, 105];
  }

  markTextRecord(edited.messages?.[1], "Browser/desktop edited message");
  markTextRecord(edited.optionLabels?.[1], "Edited option");
  markTextRecord(edited.monsterDescriptions?.[0], "Browser/desktop edited monster description.");

  const battle = edited.battles?.[0];
  if (battle) {
    battle.authored = true;
    battle.grid ??= new Array(13 * 13).fill(0);
    battle.grid[0] = 1;
    battle.dist = 3;
    battle.messageBefore = 1;
    battle.messageAfter = 2;
    battle.battleMacro = 3;
  }

  const monster = edited.monsters?.[0];
  if (monster) {
    monster.authored = true;
    monster.hitDice = 7;
    monster.agility = 12;
    monster.money = [11, 12, 13];
    monster.displayName = "Edited Frog";
  }

  const item = edited.scenarioItems?.[0];
  if (item) {
    item.authored = true;
    item.cost = 4321;
    item.weight = 22;
    item.sound = 88;
  }

  const shopTemplate = edited.shops?.[15];
  if (shopTemplate) {
    edited.shops.push({
      ...JSON.parse(JSON.stringify(shopTemplate)),
      id: 16,
      authored: true,
      inflation: 51
    });
  }

  const simple = edited.simpleEncounters?.[0];
  if (simple) {
    simple.authored = true;
    simple.prompt = 88;
    simple.maxTimes = 2;
    simple.texts ??= ["", "", "", ""];
    simple.texts[0] = "Browser/desktop edited simple encounter";
    simple.actions ??= [];
    simple.actions[0] = { slot: 0, rawCode: 1, id: 88 };
  }

  const complex = edited.complexEncounters?.[0];
  if (complex) {
    complex.authored = true;
    complex.prompt = 89;
    complex.actionResult = 2;
    complex.wordResult = 3;
    complex.texts ??= ["", "", "", "", "", "", "", "", ""];
    complex.texts[0] = "Edited complex encounter";
    complex.actions ??= [];
    complex.actions[0] = { slot: 0, rawCode: 1, id: 89 };
  }

  const thief = edited.thiefEncounters?.[0];
  if (thief) {
    thief.authored = true;
    thief.tumblers = 4;
    thief.successText ??= new Array(8).fill(0);
    thief.successText[0] = 90;
    thief.failureText ??= new Array(8).fill(0);
    thief.failureText[0] = 91;
  }

  const timed = edited.timedEncounters?.[0];
  if (timed) {
    timed.authored = true;
    timed.day = 12;
    timed.percent = 34;
    timed.door = 92;
    timed.stuff ??= new Array(10).fill(0);
    timed.stuff[0] = 93;
  }

  const race = edited.raceOverrides?.[0];
  if (race) {
    race.authored = true;
    race.baseMove = 2;
    race.magRes = 3;
    race.numOfAttacks ??= [0, 0];
    race.numOfAttacks[0] = 4;
  }

  const caste = edited.casteOverrides?.[0];
  if (caste) {
    caste.authored = true;
    caste.moveBonus = 5;
    caste.bonusAttacks = 1;
    caste.startMoney = 42;
  }

  if (edited.scenario?.contactInfo) {
    edited.scenario.contactInfo.authored = true;
    edited.scenario.contactInfo.author = "Edited Providence";
    edited.scenario.contactInfo.version = "9.9";
  }
  if (edited.scenario) {
    edited.scenario.restrictions ??= {
      description: "Edited restrictions",
      maxPartyCharacters: 0,
      maxPartyLevel: 0,
      bannedRaces: [],
      bannedCastes: []
    };
    edited.scenario.restrictions.authored = true;
    edited.scenario.restrictions.description = "Edited restrictions";
    edited.scenario.restrictions.maxPartyCharacters = 4;
    edited.scenario.restrictions.maxPartyLevel = 20;
    edited.scenario.restrictions.bannedRaces = [1, 30];
    edited.scenario.restrictions.bannedCastes = [2, 29];
  }

  return edited;
}

function markTextRecord(record, text) {
  if (!record) return;
  record.authored = true;
  record.text = text;
}

function actionRecord(existing, slot, rawCode, id) {
  return {
    ...(existing ?? {}),
    slot,
    rawCode,
    code: rawCode < 0 && rawCode !== -14 && rawCode !== -23 ? -rawCode : rawCode,
    id,
    label: rawCode === 1 ? "Text" : existing?.label ?? "Unknown opcode",
    category: rawCode === 1 ? "ui_text" : existing?.category ?? "unknown",
    gosub: rawCode < 0 && rawCode !== -14 && rawCode !== -23
  };
}

function expectTextStylResources(files, label) {
  const resourceBytes = files.get("Scenario.rsrc") ?? files.get("Scenario");
  expect(resourceBytes, `${label}: expected a scenario resource fork`);
  const entries = parseResourceFork(resourceBytes);
  expect(entries.some((entry) => entry.resourceType === "TEXT"), `${label}: expected preserved TEXT resources`);
  expect(entries.some((entry) => entry.resourceType === "styl"), `${label}: expected preserved styl resources`);
}

async function runCargoExample(example, args) {
  const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
  try {
    await execFileAsync(cargo, ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--example", example, "--", ...args], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 16
    });
  } catch (error) {
    const stderr = error.stderr ? `\n${error.stderr}` : "";
    const stdout = error.stdout ? `\n${error.stdout}` : "";
    throw new Error(`Cargo example ${example} failed.${stdout}${stderr}`);
  }
}

async function readFlatDirectory(root) {
  const output = new Map();
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    output.set(entry.name, new Uint8Array(await fs.readFile(path.join(root, entry.name))));
  }
  return output;
}

function unzipScenarioPackage(zipBytes) {
  const entries = readStoredZip(zipBytes);
  const output = new Map();
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    expect(parts.length >= 2, `Scenario ZIP entry '${entry.path}' should live under a package root`);
    output.set(parts.slice(1).join("/"), entry.bytes);
  }
  return output;
}

function compareFileMaps(actual, expected, label) {
  const actualNames = [...actual.keys()].sort();
  const expectedNames = [...expected.keys()].sort();
  expect(JSON.stringify(actualNames) === JSON.stringify(expectedNames), `${label}: file list mismatch\nactual: ${actualNames.join(", ")}\nexpected: ${expectedNames.join(", ")}`);
  for (const name of expectedNames) {
    const actualBytes = actual.get(name);
    const expectedBytes = expected.get(name);
    if (!bytesEqual(actualBytes, expectedBytes)) {
      throw new Error(`${label}: ${name} bytes differ${describeFileDifference(name, actualBytes, expectedBytes)}`);
    }
  }
}

function describeFileDifference(name, actualBytes, expectedBytes) {
  if (!actualBytes || !expectedBytes) return "";
  const actualResources = parseResourceFork(actualBytes);
  const expectedResources = parseResourceFork(expectedBytes);
  if (actualResources.length > 0 || expectedResources.length > 0 || isResourceFileName(name)) {
    return describeResourceForkDifference(actualResources, expectedResources, actualBytes, expectedBytes);
  }
  return `\nfirst byte diff: ${firstByteDifference(actualBytes, expectedBytes)}`;
}

function describeResourceForkDifference(actualResources, expectedResources, actualBytes, expectedBytes) {
  const actualSummary = actualResources.map(resourceSummary);
  const expectedSummary = expectedResources.map(resourceSummary);
  const actualSet = new Set(actualSummary);
  const expectedSet = new Set(expectedSummary);
  const browserOnly = actualSummary.filter((entry) => !expectedSet.has(entry)).slice(0, 10);
  const desktopOnly = expectedSummary.filter((entry) => !actualSet.has(entry)).slice(0, 10);
  if (browserOnly.length === 0 && desktopOnly.length === 0) {
    return [
      "",
      `parsed resource entries match (${actualSummary.length}); serialized fork differs`,
      `first byte diff: ${firstByteDifference(actualBytes, expectedBytes)}`
    ].join("\n");
  }
  return [
    "",
    `parsed resource counts: browser=${actualSummary.length}, desktop=${expectedSummary.length}`,
    browserOnly.length > 0 ? `browser-only resources:\n${browserOnly.join("\n")}` : "",
    desktopOnly.length > 0 ? `desktop-only resources:\n${desktopOnly.join("\n")}` : "",
    `first byte diff: ${firstByteDifference(actualBytes, expectedBytes)}`
  ].filter(Boolean).join("\n");
}

function resourceSummary(entry) {
  return `${entry.resourceType}:${entry.id}:${entry.name}:${entry.attributes}:${entry.data.byteLength}:${byteHash(entry.data)}`;
}

function isResourceFileName(name) {
  return name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._");
}

function firstByteDifference(left, right) {
  const length = Math.min(left.byteLength, right.byteLength);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return `${index} (browser=${left[index]}, desktop=${right[index]})`;
  }
  if (left.byteLength !== right.byteLength) return `length browser=${left.byteLength}, desktop=${right.byteLength}`;
  return "none";
}

function fixtureProject(files) {
  return {
    schemaVersion: 5,
    appVersion: "browser-desktop-scenario-parity-check",
    scenario: {
      name: scenarioName,
      projectPath: `browser://${scenarioName}.providence`,
      importedAt: "2026-07-05T00:00:00.000Z",
      shell: null,
      supportFile: null,
      contactInfo: null,
      restrictions: null,
      globalMacroHooks: null,
      securityBackup: null
    },
    source: {
      origin: "imported",
      sourcePath: `browser://${scenarioName}`,
      rawSourcesDir: "browser-memory",
      immutable: true,
      files: files.map(({ bytesData, originalRelativePath, targetPlatform, captureConfidence, ...file }) => file)
    },
    maps: [],
    landLayout: null,
    customLandlooks: [],
    mapRecords: [],
    tileAttributes: [],
    triggers: [],
    randomLevels: [],
    extracodes: [],
    messages: [],
    optionLabels: [],
    battles: [],
    monsters: [],
    monsterSets: [],
    monsterDescriptions: [],
    monsterIconOverrides: [],
    scenarioIconResources: [],
    scenarioItems: [],
    treasures: [],
    shops: [],
    simpleEncounters: [],
    complexEncounters: [],
    thiefEncounters: [],
    timedEncounters: [],
    questLabels: [],
    spellOverrides: [],
    raceOverrides: [],
    casteOverrides: [],
    ruleNames: { authored: false },
    assets: [],
    assetCatalog: { tilesets: [], pictures: [], icons: [], sounds: [] },
    editorMetadata: { displayNames: {}, tilePalettes: [], mapStamps: [], questThreads: [], questContextSources: [] },
    records: { counts: {}, alignments: [] },
    diagnostics: [],
    validation: {
      ok: true,
      errors: [],
      warnings: [],
      exportableFiles: [],
      passThroughFiles: [],
      targetCompatibilityIssues: []
    }
  };
}

function rawFile(name, bytes, role) {
  const bytesData = new Uint8Array(bytes);
  return {
    name,
    relativePath: name,
    bytes: bytesData.byteLength,
    sha256: `fixture-${name}-${bytesData.byteLength}`,
    role,
    editable: role === "supported-binary",
    bytesData,
    originalRelativePath: name,
    targetPlatform: "mac-classic",
    captureConfidence: "captured"
  };
}

function resource(resourceType, id, name, attributes, data) {
  return {
    resourceType,
    id,
    name,
    attributes,
    data: new Uint8Array(data)
  };
}

function scenarioShellBytes() {
  const output = new Uint8Array(316);
  setI32(output, 0, 1);
  setI32(output, 4, 20);
  setI32(output, 8, 0);
  setI32(output, 12, 3);
  setI32(output, 16, 4);
  setPascalText(output.subarray(60, 316), "Parity Creator");
  return output;
}

function pascalRecords(values, recordBytes) {
  const output = new Uint8Array(values.length * recordBytes);
  for (const [index, value] of values.entries()) {
    setPascalText(output.subarray(index * recordBytes, (index + 1) * recordBytes), value);
  }
  return output;
}

function fixedBytes(length, prefix) {
  const output = new Uint8Array(length);
  output.set(prefix);
  return output;
}

function setPascalText(target, text) {
  target.fill(0);
  const bytes = new Uint8Array([...text].map((char) => char.charCodeAt(0)));
  target[0] = bytes.byteLength;
  target.set(bytes, 1);
}

function setI32(output, offset, value) {
  const normalized = value < 0 ? value + 0x100000000 : value;
  output[offset] = (normalized >>> 24) & 0xff;
  output[offset + 1] = (normalized >>> 16) & 0xff;
  output[offset + 2] = (normalized >>> 8) & 0xff;
  output[offset + 3] = normalized & 0xff;
}

function bytesEqual(left, right) {
  if (!left || !right || left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function byteHash(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
