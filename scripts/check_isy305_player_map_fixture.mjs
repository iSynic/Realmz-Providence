import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultFixtureRoot = "F:\\Divinity - Codex\\divinity-port\\fixtures\\isy-305-player-map-editor-divinity-authored";
const fixtureRoot = process.env.ISY305_PLAYER_MAP_FIXTURE_DIR || defaultFixtureRoot;
const buildRoot = path.join(repoRoot, "tmp", "isy305-player-map-fixture-check");
const sourceFiles = [
  "src/editor/browser/zip.ts",
  "src/editor/browser/binaryWriters.ts",
  "src/editor/browser/shopRecords.ts",
  "src/editor/browser/resourceFork.ts",
  "src/editor/browser/fsAccess.ts",
  "src/editor/browser/scenarioPackage.ts"
];

try {
  await fs.access(fixtureRoot);
} catch {
  console.warn(`ISY-305 Player Map fixture not found at ${fixtureRoot}; skipping local fixture check.`);
  process.exit(0);
}

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
await fs.mkdir(path.join(buildRoot, "src", "shared"), { recursive: true });
await fs.copyFile(
  path.join(repoRoot, "src", "shared", "rulesCompilerBaseline.json"),
  path.join(buildRoot, "src", "shared", "rulesCompilerBaseline.json")
);

const requireFromBuild = createRequire(path.join(buildRoot, "check.cjs"));
const { createBrowserScenarioPackageZip } = requireFromBuild("./src/editor/browser/scenarioPackage.js");
const { MAP_RECORD_BYTES } = requireFromBuild("./src/editor/browser/binaryWriters.js");
const { parseResourceFork, parseStringListResource } = requireFromBuild("./src/editor/browser/resourceFork.js");
const { readStoredZip } = requireFromBuild("./src/editor/browser/zip.js");

const tutorial = await loadFixture("tutorial-primary", 16);
const spires = await loadFixture("spires-of-steel-supplemental", 20);

expect(MAP_RECORD_BYTES === 340, "Providence map-record writer must use Divinity-proven 340-byte Data MD2 records.");

expect(tutorial.primaryNames[0] === "Default Starting Map", "Tutorial STR# -102 slot 0 should decode Default Starting Map.");
expect(tutorial.primaryNames[2] === "Scrolling Text Map", "Tutorial STR# -102 slot 2 should decode Scrolling Text Map.");
expect(tutorial.secondaryNames[0] === "Default Starting Map", "Tutorial STR# -101 slot 0 should decode Default Starting Map.");
expect(hasResource(tutorial.resources, "PICT", 32128), "Tutorial Scenario.rsrc should expose PICT 32128 through AppleDouble resource parsing.");

expectRecord(tutorial.records[2], {
  id: 2,
  startX: 0,
  startY: 0,
  level: 0,
  pictId: 0,
  iconSize: 32,
  show: -200,
  isDungeon: false,
  notePrefix: "Maps can also display scrolling text"
});
expectRecord(tutorial.records[3], {
  id: 3,
  pictId: 32128,
  iconSize: 32,
  show: 0,
  isDungeon: false,
  notePrefix: "Maps can also display pictures as maps"
});
expectMarker(tutorial.records[5], 0, { iconId: 137, x: 6, y: 7 });
expectMarker(tutorial.records[6], 0, { iconId: -18, x: 3, y: 7 });
expectMarker(tutorial.records[6], 1, { iconId: -17, x: 3, y: 6 });
expectMarker(tutorial.records[6], 2, { iconId: 137, x: 3, y: 7 });
expectRecord(tutorial.records[14], {
  id: 14,
  startX: 10,
  startY: 60,
  level: 1,
  iconSize: 16,
  show: 0,
  isDungeon: true,
  notePrefix: "A map showing a treasure"
});
expectMarker(tutorial.records[14], 1, { iconId: 137, x: 9, y: 12 });
expectMarker(tutorial.records[14], 2, { iconId: 137, x: 6, y: 12 });

expect(spires.primaryNames[1] === "Central City", "Spires STR# -102 slot 1 should decode Central City.");
expect(spires.primaryNames[5] === "Interesting Map", "Spires STR# -102 slot 5 should decode Interesting Map.");
expectRecord(spires.records[1], {
  id: 1,
  startX: 29,
  startY: 29,
  level: 1,
  iconSize: 15,
  show: 0,
  isDungeon: false,
  notePrefix: "Map of Central Square"
});
expectMarker(spires.records[1], 0, { iconId: 137, x: 15, y: 7 });
expectMarker(spires.records[1], 1, { iconId: 137, x: 12, y: 14 });
expectRecord(spires.records[5], {
  id: 5,
  startX: 31,
  startY: 23,
  level: 8,
  iconSize: 25,
  show: 0,
  isDungeon: false,
  notePrefix: "'Follow the X's"
});
for (const [slot, point] of [
  [0, { x: 4, y: 1 }],
  [1, { x: 6, y: 3 }],
  [2, { x: 5, y: 4 }],
  [3, { x: 8, y: 7 }],
  [4, { x: 7, y: 8 }],
  [5, { x: 9, y: 10 }]
]) {
  expectMarker(spires.records[5], slot, { iconId: 137, ...point });
}

for (const fixture of [tutorial, spires]) {
  const noEdit = createBrowserScenarioPackageZip(fixture.project, fixture.rawSources, "mac-classic-folder");
  const noEditFiles = unzipScenarioPackage(noEdit.zip);
  expect(bytesEqual(noEditFiles.get("Data MD2"), fixture.dataMd2), `${fixture.name}: no-edit export should preserve Data MD2 bytes exactly.`);
  expect(bytesEqual(noEditFiles.get("Scenario.rsrc"), fixture.scenarioRsrc), `${fixture.name}: no-edit export should preserve Scenario.rsrc bytes exactly.`);

  const editedProject = {
    ...fixture.project,
    mapRecords: fixture.project.mapRecords.map((record) => record.id === 5
      ? {
          ...record,
          name: "Fixture Edited Player Map",
          primaryName: "Fixture Edited Player Map",
          secondaryName: "Fixture Locked Player Map",
          mapNameAuthored: true
        }
      : record)
  };
  const edited = createBrowserScenarioPackageZip(editedProject, fixture.rawSources, "mac-classic-folder");
  const editedFiles = unzipScenarioPackage(edited.zip);
  expect(bytesEqual(editedFiles.get("Data MD2"), fixture.dataMd2), `${fixture.name}: map-name-only edit should not mutate Data MD2.`);
  const editedResources = parseResourceFork(editedFiles.get("Scenario.rsrc") ?? new Uint8Array());
  const editedPrimary = mapNames(editedResources, -102);
  const editedSecondary = mapNames(editedResources, -101);
  expect(editedPrimary[5] === "Fixture Edited Player Map", `${fixture.name}: authored primary Map Names slot should export.`);
  expect(editedSecondary[5] === "Fixture Locked Player Map", `${fixture.name}: authored secondary Map Names slot should export.`);
}

console.log("ISY-305 Player Map fixture checks passed.");

async function loadFixture(name, expectedCount) {
  const fixtureDir = path.join(fixtureRoot, name);
  const dataMd2 = new Uint8Array(await fs.readFile(path.join(fixtureDir, "Data MD2")));
  const scenario = new Uint8Array(await fs.readFile(path.join(fixtureDir, "Scenario")));
  const scenarioRsrc = new Uint8Array(await fs.readFile(path.join(fixtureDir, "Scenario.rsrc")));
  expect(dataMd2.byteLength === expectedCount * MAP_RECORD_BYTES, `${name}: Data MD2 should contain ${expectedCount} 340-byte records.`);
  const records = parseMapRecords(dataMd2);
  const resources = parseResourceFork(scenarioRsrc);
  const primaryNames = mapNames(resources, -102);
  const secondaryNames = mapNames(resources, -101);
  const rawFiles = [
    rawFile("Scenario", scenario, "scenario-shell"),
    rawFile("Scenario.rsrc", scenarioRsrc, "resource-fork"),
    rawFile("Data MD2", dataMd2, "supported-binary")
  ];
  const rawSources = {
    schemaVersion: 1,
    sourceKind: "browser-scenario-import",
    capturedAt: "2026-07-06T00:00:00.000Z",
    rootName: name,
    targetPlatform: "mac-classic",
    totalBytes: rawFiles.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
    files: rawFiles
  };
  return {
    name,
    dataMd2,
    scenarioRsrc,
    resources,
    records,
    primaryNames,
    secondaryNames,
    rawSources,
    project: fixtureProject(name, rawFiles, records, primaryNames, secondaryNames)
  };
}

function fixtureProject(name, rawFiles, records, primaryNames, secondaryNames) {
  return {
    schemaVersion: 5,
    appVersion: "isy305-player-map-fixture-check",
    scenario: {
      name,
      projectPath: `browser://${name}.providence`,
      importedAt: "2026-07-06T00:00:00.000Z",
      shell: null,
      supportFile: null,
      contactInfo: null,
      restrictions: null,
      globalMacroHooks: null,
      securityBackup: null
    },
    source: {
      origin: "imported",
      sourcePath: `browser://${name}`,
      rawSourcesDir: "browser-memory",
      immutable: true,
      files: rawFiles.map(({ bytesData, originalRelativePath, targetPlatform, captureConfidence, ...file }) => file)
    },
    maps: [],
    landLayout: null,
    customLandlooks: [],
    mapRecords: records.map((record) => ({
      ...record,
      name: primaryNames[record.id] || record.name,
      primaryName: primaryNames[record.id] || record.primaryName,
      secondaryName: secondaryNames[record.id] || record.secondaryName,
      mapNameAuthored: false
    })),
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

function parseMapRecords(bytes) {
  const records = [];
  for (let id = 0; id < Math.floor(bytes.byteLength / MAP_RECORD_BYTES); id += 1) {
    const start = id * MAP_RECORD_BYTES;
    const rawBytes = Array.from(bytes.slice(start, start + MAP_RECORD_BYTES));
    records.push({
      id,
      markers: Array.from({ length: 10 }, (_, slot) => {
        const offset = start + slot * 6;
        return {
          iconId: i16(bytes, offset),
          x: i16(bytes, offset + 2),
          y: i16(bytes, offset + 4)
        };
      }),
      startX: i16(bytes, start + 60),
      startY: i16(bytes, start + 62),
      level: i16(bytes, start + 64),
      pictId: i16(bytes, start + 66),
      iconSize: i16(bytes, start + 68),
      show: i16(bytes, start + 70),
      isDungeon: i16(bytes, start + 72) !== 0,
      rect: {
        top: i16(bytes, start + 76),
        left: i16(bytes, start + 78),
        bottom: i16(bytes, start + 80),
        right: i16(bytes, start + 82)
      },
      note: decodePascalText(bytes.slice(start + 84, start + MAP_RECORD_BYTES)),
      rawBytes,
      authored: false,
      mapNameAuthored: false,
      provenance: {
        sourceFile: "Data MD2",
        recordIndex: id,
        byteOffset: start,
        byteLength: MAP_RECORD_BYTES,
        confidence: "fixture-proven"
      }
    });
  }
  return records;
}

function mapNames(resources, id) {
  const resource = resources.find((entry) => entry.resourceType === "STR#" && entry.id === id && entry.name === "Map Names");
  expect(Boolean(resource), `Scenario.rsrc should contain STR# ${id} named Map Names.`);
  return parseStringListResource(resource.data);
}

function hasResource(resources, resourceType, id) {
  return resources.some((entry) => entry.resourceType === resourceType && entry.id === id);
}

function expectRecord(record, expected) {
  expect(record?.id === expected.id, `Expected Data MD2 record ${expected.id}.`);
  for (const field of ["startX", "startY", "level", "pictId", "iconSize", "show", "isDungeon"]) {
    if (!(field in expected)) continue;
    expect(record[field] === expected[field], `Record ${expected.id} ${field} expected ${expected[field]}, got ${record[field]}.`);
  }
  if (expected.notePrefix) {
    expect(record.note.startsWith(expected.notePrefix), `Record ${expected.id} note should start with '${expected.notePrefix}'.`);
  }
}

function expectMarker(record, slot, expected) {
  const marker = record?.markers?.[slot];
  expect(Boolean(marker), `Record ${record?.id} marker slot ${slot} should exist.`);
  for (const field of ["iconId", "x", "y"]) {
    expect(marker[field] === expected[field], `Record ${record.id} marker ${slot} ${field} expected ${expected[field]}, got ${marker[field]}.`);
  }
}

function rawFile(name, bytesData, role) {
  return {
    name,
    relativePath: name,
    bytes: bytesData.byteLength,
    sha256: `isy305-${name}-${bytesData.byteLength}`,
    role,
    editable: role === "supported-binary",
    bytesData
  };
}

function unzipScenarioPackage(zipBytes) {
  const entries = readStoredZip(zipBytes);
  const output = new Map();
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    expect(parts.length >= 2, `Scenario ZIP entry '${entry.path}' should live under a package root.`);
    output.set(parts.slice(1).join("/"), entry.bytes);
  }
  return output;
}

function decodePascalText(bytes) {
  if (bytes.byteLength === 0) return "";
  const length = bytes[0] ?? 0;
  const end = Math.min(1 + length, bytes.byteLength);
  return Array.from(bytes.slice(1, end)).map((byte) => {
    if (byte === 0) return " ";
    if (byte === 9) return "\t";
    if (byte === 10 || byte === 13) return "\n";
    if (byte >= 32 && byte <= 126) return String.fromCharCode(byte);
    return "?";
  }).join("");
}

function i16(bytes, offset) {
  const value = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  return value >= 0x8000 ? value - 0x10000 : value;
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
