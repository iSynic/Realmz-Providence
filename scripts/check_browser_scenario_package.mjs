import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(repoRoot, "tmp", "browser-scenario-package-check");
const sourceFiles = [
  "src/editor/browser/zip.ts",
  "src/editor/browser/binaryWriters.ts",
  "src/editor/browser/resourceFork.ts",
  "src/editor/browser/fsAccess.ts",
  "src/editor/browser/scenarioPackage.ts"
];

await fs.rm(buildRoot, { recursive: true, force: true });
await fs.mkdir(buildRoot, { recursive: true });
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

const sourceResourceFork = writeResourceFork([
  resource("PICT", 1, "Picture", 3, [1, 2, 3]),
  resource("cicn", 2, "Icon", 4, [4, 5, 6]),
  resource("snd ", 3, "Sound", 5, [7, 8, 9]),
  resource("STR#", -101, "Map Names", 6, [0, 1, 4, 77, 97, 112, 49]),
  resource("TEXT", 202, "Old text", 7, [79, 108, 100]),
  resource("styl", 202, "Old style", 8, [9, 9, 9])
]);
const sourceMessages = new Uint8Array(512);
sourceMessages[0] = 1;
sourceMessages[1] = "Z".charCodeAt(0);
sourceMessages[256] = 1;
sourceMessages[257] = "X".charCodeAt(0);
const sourceOptionLabels = new Uint8Array(75);
sourceOptionLabels[0] = 1;
sourceOptionLabels[1] = "A".charCodeAt(0);
sourceOptionLabels[50] = 1;
sourceOptionLabels[51] = "Q".charCodeAt(0);
const rawFiles = [
  rawFile("Scenario", sourceResourceFork, "resource-fork"),
  rawFile("Data SD2", sourceMessages, "supported-binary"),
  rawFile("Data OD", sourceOptionLabels, "supported-binary"),
  rawFile("Data LD", [1, 2, 3, 4], "supported-binary"),
  rawFile("Data MENU", [5, 6, 7], "unknown"),
  rawFile("Custom Names.rsrc", [8, 9], "resource-fork"),
  rawFile("Read Me.txt", [10, 11, 12], "unknown")
];
const rawSources = {
  schemaVersion: 1,
  sourceKind: "browser-scenario-import",
  capturedAt: "2026-07-04T00:00:00.000Z",
  rootName: "Fixture Scenario",
  targetPlatform: "mac-classic",
  totalBytes: rawFiles.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
  files: rawFiles
};
const project = fixtureProject(rawFiles);

for (const target of ["mac-classic-folder", "windows-realmz-folder"]) {
  const result = createBrowserScenarioPackageZip(project, rawSources, target);
  const actual = unzipScenarioPackage(result.zip);
  const expected = desktopPassThroughModel(project.scenario.name, rawFiles);
  compareFileMaps(actual, expected, target);
  expect(!actual.has("Data MENU"), `${target}: Data MENU should be skipped`);
  expect(!actual.has("Custom Names.rsrc"), `${target}: Custom Names resource should be skipped`);
  expect(bytesEqual(actual.get("Scenario"), rawFiles[0].bytesData), `${target}: Scenario pass-through bytes changed`);
  expect(result.report.passThroughFiles.includes("Scenario"), `${target}: Scenario should be reported as pass-through`);
}

const textUpdateProject = {
  ...project,
  messages: [
    { id: 0, text: "Z", rawBytes: Array.from(sourceMessages.slice(0, 256)), authored: false },
    { id: 1, text: "Go", rawBytes: Array.from(sourceMessages.slice(256, 512)), authored: true }
  ],
  optionLabels: [
    { id: 0, text: "A", rawBytes: Array.from(sourceOptionLabels.slice(0, 25)), authored: false },
    { id: 1, text: "", rawBytes: Array.from(sourceOptionLabels.slice(25, 50)), authored: false },
    { id: 2, text: "On", rawBytes: Array.from(sourceOptionLabels.slice(50, 75)), authored: true }
  ]
};
const textUpdate = createBrowserScenarioPackageZip(textUpdateProject, rawSources, "mac-classic-folder");
const textUpdatedFiles = unzipScenarioPackage(textUpdate.zip);
expect(textUpdate.report.writtenFiles.includes("Data SD2"), "Authored messages should write Data SD2");
expect(textUpdate.report.writtenFiles.includes("Data OD"), "Authored option labels should write Data OD");
expect(!textUpdate.report.passThroughFiles.includes("Data SD2"), "Written Data SD2 should not be reported as pass-through");
expect(!textUpdate.report.passThroughFiles.includes("Data OD"), "Written Data OD should not be reported as pass-through");
const writtenMessages = textUpdatedFiles.get("Data SD2");
const writtenOptions = textUpdatedFiles.get("Data OD");
expect(writtenMessages?.byteLength === 512, "Written Data SD2 should retain source row count");
expect(writtenOptions?.byteLength === 75, "Written Data OD should retain source row count");
expect(bytesEqual(writtenMessages?.slice(0, 256), sourceMessages.slice(0, 256)), "Unauthored message row should remain byte-identical");
expect(bytesEqual(writtenMessages?.slice(256, 512), pascalRow(256, "Go")), "Authored message row should encode Pascal text");
expect(bytesEqual(writtenOptions?.slice(0, 25), sourceOptionLabels.slice(0, 25)), "Unauthored option label row should remain byte-identical");
expect(bytesEqual(writtenOptions?.slice(50, 75), pascalRow(25, "On")), "Authored option label row should encode Pascal text");

const resourceUpdateProject = {
  ...project,
  assets: [
    managedAsset("asset-text-202", "Text 202", "text", "TEXT", 202, "data:text/plain;base64,SGVsbG8="),
    managedAsset("asset-styl-202", "Style 202", "text", "styl", 202, "data:application/octet-stream;base64,AQID")
  ]
};
const macWithResourceUpdate = createBrowserScenarioPackageZip(resourceUpdateProject, rawSources, "mac-classic-folder");
const macUpdatedFiles = unzipScenarioPackage(macWithResourceUpdate.zip);
expect(macUpdatedFiles.has("Scenario"), "Mac resource-update export should write the merged Scenario resource fork");
expect(!macWithResourceUpdate.report.passThroughFiles.includes("Scenario"), "Mac merged Scenario resource fork should not be reported as pass-through");
expect(macWithResourceUpdate.report.preservedResources === 6, "Mac resource export should count preserved source resources before updates");
expect(macWithResourceUpdate.report.resourceWarnings.some((warning) => warning.includes("Scrolling Text TEXT/styl export is runtime-suspect")), "TEXT/styl export should record the current runtime evidence boundary");
expect(macWithResourceUpdate.report.resourceWarnings.some((warning) => warning.includes("2 existing resource(s) were replaced")), "TEXT/styl replacement should be reported");
const macResources = resourceMap(parseResourceFork(macUpdatedFiles.get("Scenario")));
expect(bytesEqual(macResources.get("PICT:1")?.data, Uint8Array.from([1, 2, 3])), "Mac resource export should preserve PICT data");
expect(bytesEqual(macResources.get("cicn:2")?.data, Uint8Array.from([4, 5, 6])), "Mac resource export should preserve cicn data");
expect(bytesEqual(macResources.get("snd :3")?.data, Uint8Array.from([7, 8, 9])), "Mac resource export should preserve snd data");
expect(bytesEqual(macResources.get("STR#:-101")?.data, Uint8Array.from([0, 1, 4, 77, 97, 112, 49])), "Mac resource export should preserve STR# data");
expect(bytesEqual(macResources.get("TEXT:202")?.data, Uint8Array.from([72, 101, 108, 108, 111])), "Mac resource export should replace TEXT 202");
expect(bytesEqual(macResources.get("styl:202")?.data, Uint8Array.from([1, 2, 3])), "Mac resource export should replace styl 202");

const windowsWithResourceUpdate = createBrowserScenarioPackageZip(resourceUpdateProject, rawSources, "windows-realmz-folder");
const windowsUpdatedFiles = unzipScenarioPackage(windowsWithResourceUpdate.zip);
expect(windowsUpdatedFiles.has("Scenario"), "Windows resource-update export should preserve raw Scenario pass-through like desktop");
expect(windowsUpdatedFiles.has("Scenario.rsrc"), "Windows resource-update export should also write target resource sidecar");
expect(bytesEqual(windowsUpdatedFiles.get("Scenario"), sourceResourceFork), "Windows resource-update export should not mutate raw Scenario pass-through");
expect(windowsWithResourceUpdate.report.writtenFiles.includes("Scenario.rsrc"), "Windows resource sidecar should be reported as written");
const windowsSidecarResources = resourceMap(parseResourceFork(windowsUpdatedFiles.get("Scenario.rsrc")));
expect(!windowsSidecarResources.has("PICT:1"), "Windows Scenario.rsrc sidecar should not merge raw Scenario-only PICT resources");
expect(bytesEqual(windowsSidecarResources.get("TEXT:202")?.data, Uint8Array.from([72, 101, 108, 108, 111])), "Windows Scenario.rsrc sidecar should contain TEXT 202 update");
expect(bytesEqual(windowsSidecarResources.get("styl:202")?.data, Uint8Array.from([1, 2, 3])), "Windows Scenario.rsrc sidecar should contain styl 202 update");

try {
  createBrowserScenarioPackageZip(
    {
      ...project,
      source: {
        ...project.source,
        files: [...project.source.files, sourceFile("Data DD", [99], "supported-binary")]
      }
    },
    rawSources,
    "mac-classic-folder"
  );
  throw new Error("Expected missing raw source export to fail.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  expect(message.includes("missing captured raw source bytes"), "Missing raw source error should explain the snapshot problem");
  expect(message.includes("Data DD"), "Missing raw source error should name the missing file");
}

console.log("Browser scenario package comparison checks passed.");

function resource(resourceType, id, name, attributes, data) {
  return { resourceType, id, name, attributes, data: new Uint8Array(data) };
}

function managedAsset(id, label, kind, resourceType, resourceId, resourcePath) {
  return {
    id,
    label,
    kind,
    resourceType,
    resourceId,
    fileName: `${id}.bin`,
    resourcePath,
    originalPath: "",
    previewPath: "",
    exportState: "ready"
  };
}

function pascalRow(length, text) {
  const output = new Uint8Array(length);
  const bytes = new Uint8Array([...text].map((char) => char.charCodeAt(0)));
  output[0] = bytes.byteLength;
  output.set(bytes, 1);
  return output;
}

function rawFile(name, bytes, role) {
  return {
    ...sourceFile(name, bytes, role),
    bytesData: new Uint8Array(bytes),
    originalRelativePath: name,
    targetPlatform: "mac-classic",
    captureConfidence: "captured"
  };
}

function resourceMap(entries) {
  return new Map(entries.map((entry) => [`${entry.resourceType}:${entry.id}`, entry]));
}

function sourceFile(name, bytes, role) {
  return {
    name,
    relativePath: name,
    bytes: bytes.length,
    sha256: `fixture-${name}-${bytes.length}`,
    role,
    editable: role === "supported-binary"
  };
}

function fixtureProject(files) {
  return {
    schemaVersion: 4,
    appVersion: "browser-scenario-package-check",
    scenario: {
      name: "Fixture Scenario",
      projectPath: "browser://Fixture Scenario.providence",
      importedAt: "2026-07-04T00:00:00.000Z",
      shell: null,
      supportFile: null,
      contactInfo: null,
      restrictions: null,
      globalMacroHooks: null,
      securityBackup: null
    },
    source: {
      sourcePath: "browser://Fixture Scenario",
      rawSourcesDir: "browser-memory",
      immutable: true,
      files: files.map(({ bytesData, originalRelativePath, targetPlatform, captureConfidence, ...file }) => file)
    },
    maps: [],
    landLayout: null,
    customLandlooks: [],
    mapRecords: [],
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
    spellOverrides: [],
    raceOverrides: [],
    casteOverrides: [],
    ruleNames: { authored: false },
    assets: [],
    validation: {
      ok: true,
      warnings: [],
      targetCompatibilityIssues: []
    }
  };
}

function desktopPassThroughModel(rootName, files) {
  const output = new Map();
  for (const file of files) {
    if (file.name === "Data MENU") continue;
    if (file.name === "Custom Names.rsrc" || file.name === "Custom Names.rsf" || file.name === "._Custom Names") continue;
    output.set(file.name, file.bytesData);
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
    expect(bytesEqual(actual.get(name), expected.get(name)), `${label}: payload mismatch for ${name}`);
  }
}

function bytesEqual(left, right) {
  if (!left || !right || left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
