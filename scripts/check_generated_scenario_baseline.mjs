import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const { buildSync } = requireFromRoot("esbuild");
const manifestPolicy = JSON.parse(fs.readFileSync(path.join(root, "schemas", "realmz-native-manifest-policy.json"), "utf8"));
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "providence-generated-baseline-"));

try {
  buildSync({
    entryPoints: {
      seed: path.join(root, "src", "editor", "scenarioSeed.ts"),
      baseline: path.join(root, "src", "editor", "browser", "scenarioCompilerBaseline.ts"),
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
  const { AUTHORED_SCENARIO_BASELINE_SIZES } = requireFromFixture("./baseline.js");
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
    rects: [],
    provenance: { ...firstRandomLevel.provenance, recordIndex: 1, byteOffset: firstRandomLevel.provenance.byteLength }
  });
  compiled.project.tileAttributes.push({
    tile: 190,
    landlook: null,
    solidType: 2,
    movementSoundId: null,
    movementCost: null,
    editableScope: "special-tile",
    flags: ["solid"],
    confidence: "source-backed",
    sourceKind: "data-solids",
    source: "Data Solids",
    rawByte: null
  });
  const landLayoutCells = new Array(8 * 16).fill(0);
  landLayoutCells[0] = -1;
  landLayoutCells[127] = 202;
  compiled.project.landLayout = {
    rows: 8,
    cols: 16,
    cells: landLayoutCells,
    authored: true,
    provenance: null
  };

  const sourceBeforeExport = JSON.stringify(compiled.project.source);
  const result = createBrowserScenarioPackageZip(compiled.project, null, "windows-realmz-folder");
  const files = new Map(readStoredZip(result.zip).map((entry) => [entry.path.split("/").slice(1).join("/"), entry.bytes]));
  const macResult = createBrowserScenarioPackageZip(compiled.project, null, "mac-classic-folder");
  const macFiles = new Map(readStoredZip(macResult.zip).map((entry) => [entry.path.split("/").slice(1).join("/"), entry.bytes]));
  const dungeonProject = structuredClone(compiled.project);
  const firstDungeonMap = dungeonProject.maps[0];
  dungeonProject.maps = [{
    ...firstDungeonMap,
    id: "dungeon:0",
    levelType: "dungeon",
    source: "Data DL",
    index: 0,
    name: "Dungeon Level 1",
    render: { ...firstDungeonMap.render, landlook: null, mode: "dungeon-top-down" },
    provenance: { ...firstDungeonMap.provenance, sourceFile: "Data DL", recordIndex: 0, byteOffset: 0 }
  }];
  const firstDungeonRandomLevel = dungeonProject.randomLevels[0];
  dungeonProject.randomLevels = [{
    ...firstDungeonRandomLevel,
    id: "dungeon:0:randlevel",
    source: "Data RDD",
    levelType: "dungeon",
    levelIndex: 0,
    provenance: { ...firstDungeonRandomLevel.provenance, sourceFile: "Data RDD", recordIndex: 0, byteOffset: 0 }
  }];
  dungeonProject.triggers = [];
  dungeonProject.landLayout = null;
  const dungeonResult = createBrowserScenarioPackageZip(dungeonProject, null, "windows-realmz-folder");
  const dungeonFiles = new Map(readStoredZip(dungeonResult.zip).map((entry) => [entry.path.split("/").slice(1).join("/"), entry.bytes]));
  const startupFiles = manifestPolicy.authoredBaseline.startupFiles;
  const windowsResourceForkPath = startupFiles.resourceForkByTarget["windows-realmz-folder"];
  const macResourceForkPath = startupFiles.resourceForkByTarget["mac-classic-folder"];

  expect(compiled.project.source.origin === "authored", "generated scenario should remain explicitly authored");
  expect(compiled.project.source.files.length === 0, "generated scenario should not acquire a source-file inventory");
  expect(JSON.stringify(compiled.project.source) === sourceBeforeExport, "native compilation should not mutate canonical source metadata");

  for (const name of [
    "Generated Baseline",
    startupFiles.scenarioSupport,
    windowsResourceForkPath,
    startupFiles.securityBackup,
    "Data CI",
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
    startupFiles.scenarioItems,
    "Layout",
    startupFiles.tileSolids
  ]) {
    expect(files.has(name), `generated scenario ZIP should contain ${name}`);
  }
  for (const table of manifestPolicy.authoredBaseline.triggerTables) {
    const levelCount = compiled.project.maps.filter((map) => map.levelType === table.levelType).length;
    const expectedBytes = Math.max(table.minimumLevels, levelCount) * AUTHORED_SCENARIO_BASELINE_SIZES.doorLevel;
    expect(files.get(table.path)?.byteLength === expectedBytes, `${table.path} should follow the shared ${table.levelType} trigger-table policy`);
    const dungeonLevelCount = dungeonProject.maps.filter((map) => map.levelType === table.levelType).length;
    const expectedDungeonBytes = Math.max(table.minimumLevels, dungeonLevelCount) * AUTHORED_SCENARIO_BASELINE_SIZES.doorLevel;
    expect(dungeonFiles.get(table.path)?.byteLength === expectedDungeonBytes, `dungeon-only ${table.path} should follow the shared ${table.levelType} trigger-table policy`);
    expect(dungeonFiles.get(table.path)?.every((byte) => byte === 0), `dungeon-only ${table.path} baseline should remain neutral without Action Points`);
    expect(dungeonResult.report.writtenFiles.includes(table.path), `dungeon-only export should report ${table.path} as authored output`);
  }
  for (const family of manifestPolicy.authoredBaseline.optionalSemanticFiles) {
    const expected = optionalSemanticFileExpected(compiled.project, family.presence);
    const dungeonExpected = optionalSemanticFileExpected(dungeonProject, family.presence);
    expect(files.has(family.path) === expected, `${family.path} should follow canonical presence predicate ${family.presence.kind} ${family.presence.projectPath}`);
    expect(dungeonFiles.has(family.path) === dungeonExpected, `dungeon-only ${family.path} should follow canonical presence predicate ${family.presence.kind} ${family.presence.projectPath}`);
  }
  for (const name of manifestPolicy.authoredBaseline.emptyRuntimeFiles) {
    expect(files.get(name)?.byteLength === 0, `${name} should follow the shared authored empty-runtime policy`);
  }
  expect(AUTHORED_SCENARIO_BASELINE_SIZES.scenarioItems === manifestPolicy.authoredBaseline.scenarioItemRecords * 100, "browser item-table size should follow the shared authored capacity policy");
  const supportFile = files.get(startupFiles.scenarioSupport);
  expect(supportFile?.byteLength === AUTHORED_SCENARIO_BASELINE_SIZES.scenarioSupport, "scenario support role should use the exact neutral compiler size");
  expect(supportFile?.every((byte) => byte === 0), "scenario support role should remain neutral without authored editor fields");
  expect(Buffer.from(files.get(startupFiles.securityBackup) ?? []).equals(Buffer.from(files.get("Generated Baseline") ?? [])), "security-backup role should seed from the canonical scenario shell");
  expect(files.get(startupFiles.scenarioItems)?.byteLength === AUTHORED_SCENARIO_BASELINE_SIZES.scenarioItems, "authored items should overlay Realmz's fixed 200-item table without truncating it");
  const tileSolids = files.get(startupFiles.tileSolids);
  expect(tileSolids?.byteLength === AUTHORED_SCENARIO_BASELINE_SIZES.tileSolids, "Data Solids should contain the exact 1024-byte compiler table");
  expect(tileSolids?.[190] === 2, "Data Solids should compile canonical special-tile solidity");
  expect(tileSolids?.filter((byte) => byte !== 0).length === 1, "Data Solids should keep unspecified special-tile rows neutral");
  const layout = files.get("Layout");
  expect(layout?.byteLength === 256, "Layout should contain the exact 8 x 16 signed-short compiler grid");
  expect(readI16(layout, 0) === -1 && readI16(layout, 254) === 202, "Layout should compile canonical cells");
  expect(layout?.slice(2, 254).every((byte) => byte === 0), "Layout should keep unspecified cells neutral");
  const minimumResourceFork = files.get(windowsResourceForkPath);
  expect(minimumResourceFork?.byteLength === AUTHORED_SCENARIO_BASELINE_SIZES.scenarioResourceFork, `${windowsResourceForkPath} should be the exact canonical empty resource container`);
  expect(readU32(minimumResourceFork, 0) === 16 && readU32(minimumResourceFork, 4) === 16, `${windowsResourceForkPath} should use the canonical empty data/map offsets`);
  expect(readU32(minimumResourceFork, 8) === 0 && readU32(minimumResourceFork, 12) === 30, `${windowsResourceForkPath} should contain an empty data section and 30-byte resource map`);
  expect(readU16(minimumResourceFork, 44) === 0xffff, `${windowsResourceForkPath} should contain the standard empty type-list marker`);
  expect(macFiles.has(macResourceForkPath), `Mac authored output should follow resource-fork target path ${macResourceForkPath}`);
  expect(result.report.writtenFiles.includes("Data DD"), "browser export should report the generated door table as authored output");
  expect(result.report.passThroughFiles.length === 0, "authored browser export should not report compatibility pass-through files");
  expect(macResult.report.passThroughFiles.length === 0, "authored Mac browser export should not report compatibility pass-through files");
  expectFileMapsEqual(files, macFiles, "authored Mac and Windows compiler outputs");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("Generated scenario runtime baseline check passed.");

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function optionalSemanticFileExpected(project, presence) {
  const value = presence.projectPath
    .slice(1)
    .split("/")
    .reduce((current, segment) => current?.[segment], project);
  if (presence.kind === "present") return value != null;
  if (presence.kind === "collection-non-empty") return Array.isArray(value) && value.length > 0;
  if (presence.kind === "collection-match") {
    return Array.isArray(value) && value.some((entry) => entry?.[presence.field] === presence.equals);
  }
  throw new Error(`Unsupported optional semantic presence predicate ${presence.kind}.`);
}

function readU16(bytes, offset) {
  return ((bytes?.[offset] ?? 0) << 8) | (bytes?.[offset + 1] ?? 0);
}

function readI16(bytes, offset) {
  const value = readU16(bytes, offset);
  return value >= 0x8000 ? value - 0x10000 : value;
}

function readU32(bytes, offset) {
  return (
    ((bytes?.[offset] ?? 0) * 0x1000000) +
    ((bytes?.[offset + 1] ?? 0) << 16) +
    ((bytes?.[offset + 2] ?? 0) << 8) +
    (bytes?.[offset + 3] ?? 0)
  ) >>> 0;
}

function expectFileMapsEqual(left, right, label) {
  expect(left.size === right.size, `${label} should contain the same number of files`);
  for (const [name, bytes] of left) {
    const other = right.get(name);
    expect(other != null, `${label} should both contain ${name}`);
    expect(Buffer.from(bytes).equals(Buffer.from(other)), `${label} should encode identical ${name} bytes`);
  }
}
