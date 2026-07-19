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
  "src/editor/browser/shopRecords.ts",
  "src/editor/browser/scenarioCompilerBaseline.ts",
  "src/editor/browser/ruleCompiler.ts",
  "src/editor/browser/compatibilityAnnex.ts",
  "src/editor/browser/scenarioPackage.ts",
  "src/editor/generated/providenceProjectContract.ts",
  "src/editor/projectOrigin.ts"
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
await fs.mkdir(path.join(buildRoot, "src", "shared"), { recursive: true });
await fs.copyFile(
  path.join(repoRoot, "src", "shared", "rulesCompilerBaseline.json"),
  path.join(buildRoot, "src", "shared", "rulesCompilerBaseline.json")
);

const requireFromBuild = createRequire(path.join(buildRoot, "check.cjs"));
const { createBrowserScenarioPackageZip } = requireFromBuild("./src/editor/browser/scenarioPackage.js");
const { encodeStringListResource, parseResourceFork, parseStringListResource, writeResourceFork } = requireFromBuild("./src/editor/browser/resourceFork.js");
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
sourceMessages[200] = 0x91;
sourceMessages[256] = 1;
sourceMessages[257] = "X".charCodeAt(0);
sourceMessages[500] = 0x92;
const sourceOptionLabels = new Uint8Array(75);
sourceOptionLabels[0] = 1;
sourceOptionLabels[1] = "A".charCodeAt(0);
sourceOptionLabels[50] = 1;
sourceOptionLabels[51] = "Q".charCodeAt(0);
const sourceBattles = new Uint8Array(692);
sourceBattles[0] = 0xaa;
sourceBattles[1] = 0xbb;
sourceBattles[346] = 0xcc;
sourceBattles[347] = 0xdd;
const sourceMonsters = new Uint8Array(420);
sourceMonsters[0] = 0x11;
sourceMonsters[1] = 0x22;
sourceMonsters[210] = 0x33;
sourceMonsters[211] = 0x44;
const sourceMonsterDescriptions = new Uint8Array(512);
sourceMonsterDescriptions[0] = 0x12;
sourceMonsterDescriptions[1] = 0x34;
sourceMonsterDescriptions[256] = 0x56;
sourceMonsterDescriptions[257] = 0x78;
const sourceScenarioItems = new Uint8Array(200);
sourceScenarioItems[0] = 0x45;
sourceScenarioItems[1] = 0x46;
sourceScenarioItems[100] = 0x47;
sourceScenarioItems[101] = 0x48;
const sourceTreasures = new Uint8Array(96);
sourceTreasures[0] = 0x49;
sourceTreasures[1] = 0x4a;
sourceTreasures[48] = 0x4b;
sourceTreasures[49] = 0x4c;
const sourceShops = new Uint8Array(6004);
sourceShops[0] = 0x4d;
sourceShops[1] = 0x4e;
sourceShops[3002] = 0x4f;
sourceShops[3003] = 0x50;
const sourceSpells = new Uint8Array(76);
sourceSpells[0] = 0x51;
sourceSpells[1] = 0x52;
sourceSpells[30] = 0x53;
sourceSpells[31] = 0x54;
sourceSpells[60] = 0x55;
sourceSpells[75] = 0x56;
const sourceSpellNames = Array.from({ length: 15 }, (_, index) => `Custom Spell ${index}`);
const sourceSpellResourceFork = writeResourceFork([
  resource("STR#", 5000, "Spell Names", 0, encodeStringListResource(sourceSpellNames))
]);
const sourceRaces = new Uint8Array(816);
sourceRaces[0] = 0x57;
sourceRaces[1] = 0x58;
sourceRaces[408] = 0x59;
sourceRaces[409] = 0x5a;
sourceRaces[408 + 346] = 0xab;
const sourceCastes = new Uint8Array(1152);
sourceCastes[0] = 0x5b;
sourceCastes[1] = 0x5c;
sourceCastes[576] = 0x5d;
sourceCastes[577] = 0x5e;
sourceCastes[576 + 450] = 0xcd;
const sourceSimpleEncounters = new Uint8Array(852);
sourceSimpleEncounters[0] = 0x61;
sourceSimpleEncounters[1] = 0x62;
sourceSimpleEncounters[426] = 0x63;
sourceSimpleEncounters[427] = 0x64;
sourceSimpleEncounters[426 + 103] = 0xa5;
const sourceComplexEncounters = new Uint8Array(1040);
sourceComplexEncounters[0] = 0x65;
sourceComplexEncounters[1] = 0x66;
sourceComplexEncounters[520] = 0x67;
sourceComplexEncounters[521] = 0x68;
sourceComplexEncounters[520 + 157] = 0x5a;
const sourceThiefEncounters = new Uint8Array(236);
sourceThiefEncounters[0] = 0x69;
sourceThiefEncounters[1] = 0x6a;
sourceThiefEncounters[118] = 0x6b;
sourceThiefEncounters[119] = 0x6c;
const sourceTimedEncounters = new Uint8Array(80);
sourceTimedEncounters[0] = 0x6d;
sourceTimedEncounters[1] = 0x6e;
sourceTimedEncounters[40] = 0x6f;
sourceTimedEncounters[41] = 0x70;
const FIELD_BYTES = 90 * 90 * 2;
const MAP_RECORD_BYTES = 340;
const RANDOM_LEVEL_BYTES = 644;
const DOOR_BYTES = 40;
const DOOR_LEVEL_BYTES = 100 * DOOR_BYTES;
const LAND_LAYOUT_BYTES = 16 * 8 * 2;
const MAPSTATS_RECORD_BYTES = 40;
const MAPSTATS_RECORDS = 201;
const LANDLOOK_RANGE_TAIL_BYTES = 60;
const LANDLOOK_RANGE_SLOT_BYTES = 6;
const LANDLOOK_RANGE_SLOTS = LANDLOOK_RANGE_TAIL_BYTES / LANDLOOK_RANGE_SLOT_BYTES;
const CUSTOM_LANDLOOK_METADATA_BYTES = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES;
const sourceLandFields = new Uint8Array(FIELD_BYTES * 2);
setI16(sourceLandFields, 0, 11);
setI16(sourceLandFields, FIELD_BYTES + 2, -12);
const sourceDungeonFields = new Uint8Array(FIELD_BYTES);
setI16(sourceDungeonFields, 0, 21);
const sourceMapRecords = new Uint8Array(MAP_RECORD_BYTES * 2);
sourceMapRecords[0] = 0x71;
sourceMapRecords[1] = 0x72;
sourceMapRecords[MAP_RECORD_BYTES] = 0x73;
sourceMapRecords[MAP_RECORD_BYTES + 1] = 0x74;
sourceMapRecords[MAP_RECORD_BYTES + 74] = 0xbe;
sourceMapRecords[MAP_RECORD_BYTES + 75] = 0xef;
const sourceLandRandomLevels = new Uint8Array(RANDOM_LEVEL_BYTES * 2);
setI16(sourceLandRandomLevels, 0, 31);
setI16(sourceLandRandomLevels, RANDOM_LEVEL_BYTES, 32);
const sourceDungeonRandomLevels = new Uint8Array(RANDOM_LEVEL_BYTES);
setI16(sourceDungeonRandomLevels, 0, 33);
const sourceLandDoors = new Uint8Array(DOOR_LEVEL_BYTES * 2);
setDoor(sourceLandDoors.subarray(0, DOOR_BYTES), { doorid: 1, landid: 0, targetX: 2, targetY: 3, percent: 25, actions: [{ slot: 0, rawCode: 5, id: 6 }] });
const sourceDungeonDoors = new Uint8Array(DOOR_LEVEL_BYTES);
setDoor(sourceDungeonDoors.subarray(0, DOOR_BYTES), { doorid: 2, landid: 0, targetX: 4, targetY: 5, percent: 35, actions: [{ slot: 1, rawCode: -7, id: 8 }] });
const sourceMacros = new Uint8Array(DOOR_BYTES * 2);
setDoor(sourceMacros.subarray(0, DOOR_BYTES), { doorid: 0, landid: 0, targetX: 0, targetY: 0, percent: 100, actions: [{ slot: 0, rawCode: 9, id: 10 }] });
const sourceExtraCodes = new Uint8Array(30);
setI16(sourceExtraCodes, 0, 1);
setI16(sourceExtraCodes, 10, 2);
setI16(sourceExtraCodes, 20, 3);
const sourceGlobalHooks = new Uint8Array(60);
setI16(sourceGlobalHooks, 0, 1);
setI16(sourceGlobalHooks, 8, 4);
setI16(sourceGlobalHooks, 16, 777);
const sourceLayout = new Uint8Array(LAND_LAYOUT_BYTES + 4);
setI16(sourceLayout, 0, 1);
sourceLayout[LAND_LAYOUT_BYTES] = 0xde;
sourceLayout[LAND_LAYOUT_BYTES + 1] = 0xad;
sourceLayout[LAND_LAYOUT_BYTES + 2] = 0xbe;
sourceLayout[LAND_LAYOUT_BYTES + 3] = 0xef;
const sourceCustomLandlook = new Uint8Array(CUSTOM_LANDLOOK_METADATA_BYTES + 3);
setI16(sourceCustomLandlook, 1 * MAPSTATS_RECORD_BYTES, 91);
setI16(sourceCustomLandlook, 5 * MAPSTATS_RECORD_BYTES + 18, 1234);
setI16(sourceCustomLandlook, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS, 156);
setI16(sourceCustomLandlook, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 2, 1);
setI16(sourceCustomLandlook, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4, 62);
setI16(sourceCustomLandlook, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 6, 85);
setI16(sourceCustomLandlook, MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 8, 4321);
sourceCustomLandlook[CUSTOM_LANDLOOK_METADATA_BYTES] = 0xca;
sourceCustomLandlook[CUSTOM_LANDLOOK_METADATA_BYTES + 1] = 0xfe;
sourceCustomLandlook[CUSTOM_LANDLOOK_METADATA_BYTES + 2] = 0x01;
const sourceScenarioShell = new Uint8Array(320);
setI32(sourceScenarioShell, 0, 4);
setI32(sourceScenarioShell, 4, 20);
setI32(sourceScenarioShell, 8, 2);
setI32(sourceScenarioShell, 12, 33);
setI32(sourceScenarioShell, 16, 44);
sourceScenarioShell.set([1, 2, 3], 20);
sourceScenarioShell.set([4, 5, 6], 40);
setPascalText(sourceScenarioShell.subarray(60, 316), "Raw Creator");
sourceScenarioShell[316] = 0xde;
sourceScenarioShell[317] = 0xad;
sourceScenarioShell[318] = 0xbe;
sourceScenarioShell[319] = 0xef;
const sourceSupportFile = new Uint8Array(64);
sourceSupportFile[0] = 0xa1;
sourceSupportFile[23] = 11;
setI16(sourceSupportFile, 38, 222);
sourceSupportFile[63] = 0xa2;
const sourceSecurityBackup = new Uint8Array(318);
setI32(sourceSecurityBackup, 0, 1);
setI32(sourceSecurityBackup, 4, 999);
sourceSecurityBackup.set([9, 8, 7], 20);
sourceSecurityBackup.set([6, 5, 4], 40);
sourceSecurityBackup[316] = 0xba;
sourceSecurityBackup[317] = 0xdc;
const sourceContactInfo = new Uint8Array(4608);
setPascalText(sourceContactInfo.subarray(0, 256), "Raw Contact");
sourceContactInfo[519] = 56;
const sourceRestrictions = new Uint8Array(320);
setPascalText(sourceRestrictions.subarray(0, 256), "Raw Restrictions");
sourceRestrictions[319] = 77;
const rawFiles = [
  rawFile("Scenario", sourceResourceFork, "resource-fork"),
  rawFile("Fixture Scenario", sourceScenarioShell, "scenario-shell"),
  rawFile("Scenario Support", sourceSupportFile, "supported-binary"),
  rawFile("Data CS", sourceSecurityBackup, "supported-binary"),
  rawFile("Data SD2", sourceMessages, "supported-binary"),
  rawFile("Data OD", sourceOptionLabels, "supported-binary"),
  rawFile("Data BD", sourceBattles, "supported-binary"),
  rawFile("Data MD", sourceMonsters, "supported-binary"),
  rawFile("Data DES", sourceMonsterDescriptions, "supported-binary"),
  rawFile("Data NI", sourceScenarioItems, "supported-binary"),
  rawFile("Data TD", sourceTreasures, "supported-binary"),
  rawFile("Data SD", sourceShops, "supported-binary"),
  rawFile("Data Spell", sourceSpells, "supported-binary"),
  rawFile("Data Spell.rsrc", sourceSpellResourceFork, "resource-fork"),
  rawFile("Data Race", sourceRaces, "supported-binary"),
  rawFile("Data Caste", sourceCastes, "supported-binary"),
  rawFile("Data ED", sourceSimpleEncounters, "supported-binary"),
  rawFile("Data ED2", sourceComplexEncounters, "supported-binary"),
  rawFile("Data TD2", sourceThiefEncounters, "supported-binary"),
  rawFile("Data TD3", sourceTimedEncounters, "supported-binary"),
  rawFile("Global", sourceGlobalHooks, "supported-binary"),
  rawFile("Layout", sourceLayout, "supported-binary"),
  rawFile("Data Custom 1 BD", sourceCustomLandlook, "supported-binary"),
  rawFile("Data CI", sourceContactInfo, "supported-binary"),
  rawFile("Data RI", sourceRestrictions, "supported-binary"),
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

const ruleNameWarningProject = {
  ...project,
  ruleNames: {
    ...project.ruleNames,
    authored: true,
    raceNames: ["Browser Race"],
    casteNames: ["Browser Caste"]
  }
};
const ruleNameWarningUpdate = createBrowserScenarioPackageZip(ruleNameWarningProject, rawSources, "mac-classic-folder");
expect(ruleNameWarningUpdate.report.warnings.some((warning) => warning.includes("Race/caste rule name edits are project-only labels")), "Authored rule names should warn but not block scenario ZIP export");

const textUpdateProject = {
  ...project,
  messages: [
    { id: 0, text: "Z", rawBytes: new Array(256).fill(0x11), authored: false },
    { id: 1, text: "Go", rawBytes: new Array(256).fill(0x22), authored: true }
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
expect(bytesEqual(writtenMessages?.slice(0, 256), sourceMessages.slice(0, 256)), "Unauthored message row should preserve legacy bytes from the annex");
expect(bytesEqual(writtenMessages?.slice(256, 512), pascalRow(256, "Go")), "Authored message row should compile canonical Pascal text without embedded raw-byte identity");
expect(bytesEqual(writtenOptions?.slice(0, 25), sourceOptionLabels.slice(0, 25)), "Unauthored option label row should remain byte-identical");
expect(bytesEqual(writtenOptions?.slice(50, 75), pascalRow(25, "On")), "Authored option label row should encode Pascal text");

const battleGrid = new Array(13 * 13).fill(0);
battleGrid[0] = 7;
battleGrid[168] = -3;
const battleUpdateProject = {
  ...project,
  battles: [
    { id: 0, grid: new Array(13 * 13).fill(0), dist: 0, messageBefore: 0, messageAfter: 0, battleMacro: 0, rawBytes: Array.from(sourceBattles.slice(0, 346)), authored: false },
    { id: 1, grid: battleGrid, dist: -2, messageBefore: 12, messageAfter: 13, battleMacro: 14, rawBytes: Array.from(sourceBattles.slice(346, 692)), authored: true }
  ]
};
const battleUpdate = createBrowserScenarioPackageZip(battleUpdateProject, rawSources, "mac-classic-folder");
const battleUpdatedFiles = unzipScenarioPackage(battleUpdate.zip);
expect(battleUpdate.report.writtenFiles.includes("Data BD"), "Authored battles should write Data BD");
expect(!battleUpdate.report.passThroughFiles.includes("Data BD"), "Written Data BD should not be reported as pass-through");
const writtenBattles = battleUpdatedFiles.get("Data BD");
expect(writtenBattles?.byteLength === 692, "Written Data BD should retain source row count");
expect(bytesEqual(writtenBattles?.slice(0, 346), sourceBattles.slice(0, 346)), "Unauthored battle row should remain byte-identical");
expect(bytesEqual(writtenBattles?.slice(346, 692), battleRow({ grid: battleGrid, dist: -2, messageBefore: 12, messageAfter: 13, battleMacro: 14 })), "Authored battle row should encode combat fields");

const authoredMonster = monsterRecord(1, {
  hitDice: 9,
  staminaBonus: 8,
  agility: 7,
  nameId: 6,
  movementMax: 5,
  armor: -4,
  magicResistance: -3,
  distance: -2,
  traitor: -1,
  size: 4,
  typeFlags: [1, -1, 2, -2, 3, -3, 4, -4],
  attackCount: 2,
  magicAttackCount: 1,
  attacks: [[1, 2, 3, 4], [-1, -2, -3, -4], [5, 6, 7, 8], [0, 0, 0, 0], [9, 10, 11, 12]],
  damageBonus: -5,
  castPercent: 33,
  runPercent: 44,
  surrenderPercent: 55,
  missilePercent: 66,
  canSummon: -6,
  saves: [1, 2, 3, 4, 5, 6],
  spellImmunities: [-1, -2, -3, -4, -5, -6],
  money: [100, 200, 300],
  spells: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  items: [20, 21, 22, 23, 24, 25],
  weapon: 26,
  iconId: -27,
  spellPoints: 28,
  exp: 29,
  stamina: 30,
  staminaMax: 31,
  underneath: [32, 33, 34, 35],
  target: -7,
  guarding: -8,
  notOnMenu: true,
  beenAttacked: -9,
  movement: -10,
  magicToHit: -11,
  conditions: Array.from({ length: 40 }, (_, index) => index % 2 === 0 ? index : -index),
  lr: -12,
  up: -13,
  attackNum: -14,
  bonusAttack: -15,
  deathMacro: -16,
  maxSpellPoints: 37,
  displayName: "Browser Beast"
});
const monsterUpdateProject = {
  ...project,
  monsters: [
    monsterRecord(0, { rawBytes: Array.from(sourceMonsters.slice(0, 210)), authored: false }),
    { ...authoredMonster, rawBytes: Array.from(sourceMonsters.slice(210, 420)), authored: true }
  ]
};
const monsterUpdate = createBrowserScenarioPackageZip(monsterUpdateProject, rawSources, "mac-classic-folder");
const monsterUpdatedFiles = unzipScenarioPackage(monsterUpdate.zip);
expect(monsterUpdate.report.writtenFiles.includes("Data MD"), "Authored monsters should write Data MD");
expect(!monsterUpdate.report.passThroughFiles.includes("Data MD"), "Written Data MD should not be reported as pass-through");
const writtenMonsters = monsterUpdatedFiles.get("Data MD");
expect(writtenMonsters?.byteLength === 420, "Written Data MD should retain source row count");
expect(bytesEqual(writtenMonsters?.slice(0, 210), sourceMonsters.slice(0, 210)), "Unauthored monster row should remain byte-identical");
expect(bytesEqual(writtenMonsters?.slice(210, 420), monsterRow(authoredMonster)), "Authored monster row should encode monster fields");

const monsterDescriptionProject = {
  ...project,
  monsterDescriptions: [
    { id: 0, text: "Raw", rawBytes: Array.from(sourceMonsterDescriptions.slice(0, 256)), authored: false },
    { id: 1, text: "Browser description", rawBytes: Array.from(sourceMonsterDescriptions.slice(256, 512)), authored: true }
  ]
};
const monsterDescriptionUpdate = createBrowserScenarioPackageZip(monsterDescriptionProject, rawSources, "mac-classic-folder");
const monsterDescriptionFiles = unzipScenarioPackage(monsterDescriptionUpdate.zip);
expect(monsterDescriptionUpdate.report.writtenFiles.includes("Data DES"), "Authored monster descriptions should write Data DES");
expect(!monsterDescriptionUpdate.report.passThroughFiles.includes("Data DES"), "Written Data DES should not be reported as pass-through");
const writtenMonsterDescriptions = monsterDescriptionFiles.get("Data DES");
expect(writtenMonsterDescriptions?.byteLength === 512, "Written Data DES should retain source row count");
expect(bytesEqual(writtenMonsterDescriptions?.slice(0, 256), sourceMonsterDescriptions.slice(0, 256)), "Unauthored monster description row should remain byte-identical");
expect(bytesEqual(writtenMonsterDescriptions?.slice(256, 512), pascalRow(256, "Browser description")), "Authored monster description row should encode Pascal text");

const mapRawFiles = [
  ...rawFiles.filter((file) => !["Data LD"].includes(file.name)),
  rawFile("Data LD", sourceLandFields, "supported-binary"),
  rawFile("Data DL", sourceDungeonFields, "supported-binary"),
  rawFile("Data MD2", sourceMapRecords, "supported-binary"),
  rawFile("Data RD", sourceLandRandomLevels, "supported-binary"),
  rawFile("Data RDD", sourceDungeonRandomLevels, "supported-binary"),
  rawFile("Data DD", sourceLandDoors, "supported-binary"),
  rawFile("Data DDD", sourceDungeonDoors, "supported-binary"),
  rawFile("Data ED3", sourceMacros, "supported-binary"),
  rawFile("Data EDCD", sourceExtraCodes, "supported-binary")
];
const mapRawSources = {
  ...rawSources,
  totalBytes: mapRawFiles.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
  files: mapRawFiles
};
const authoredLandTiles = new Array(90 * 90).fill(0);
authoredLandTiles[0] = 41;
authoredLandTiles[8099] = -42;
const authoredDungeonTiles = new Array(90 * 90).fill(0);
authoredDungeonTiles[17] = 51;
const authoredMapRecord = mapRecord(1, {
  markers: [{ iconId: 400, x: 12, y: 13 }],
  startX: 14,
  startY: 15,
  level: 16,
  pictId: 17,
  iconSize: 18,
  show: 19,
  isDungeon: true,
  rect: { top: 1, left: 2, bottom: 3, right: 4 },
  note: "Map note"
});
const authoredLandRandomValues = new Array(RANDOM_LEVEL_BYTES / 2).fill(0);
authoredLandRandomValues[0] = 61;
authoredLandRandomValues[260] = 7;
authoredLandRandomValues[321] = -62;
const authoredDungeonRandomValues = new Array(RANDOM_LEVEL_BYTES / 2).fill(0);
authoredDungeonRandomValues[0] = 63;
authoredDungeonRandomValues[260] = -1;
const authoredLandTrigger = triggerRecord("Data DD", "land", 1, 2, {
  doorid: 10203,
  landid: 1,
  targetX: 2,
  targetY: 3,
  percent: -25,
  actions: [{ slot: 7, rawCode: -64, id: 65 }]
});
const authoredDungeonTrigger = triggerRecord("Data DDD", "dungeon", 0, 3, {
  doorid: 30405,
  landid: 0,
  targetX: 4,
  targetY: 5,
  percent: 75,
  actions: [{ slot: 2, rawCode: 66, id: -67 }]
});
const authoredMacro = triggerRecord("Data ED3", null, null, 1, {
  doorid: 0,
  percent: 100,
  actions: [{ slot: 3, rawCode: 68, id: 69 }]
});
const mapProject = {
  ...fixtureProject(mapRawFiles),
  maps: [
    mapEntity("land", 0, fieldTiles(sourceLandFields.slice(0, FIELD_BYTES))),
    mapEntity("land", 1, authoredLandTiles),
    mapEntity("dungeon", 0, authoredDungeonTiles)
  ],
  mapRecords: [
    mapRecord(0, { rawBytes: Array.from(sourceMapRecords.slice(0, MAP_RECORD_BYTES)), authored: false }),
    { ...authoredMapRecord, rawBytes: Array.from(sourceMapRecords.slice(MAP_RECORD_BYTES, MAP_RECORD_BYTES * 2)), authored: true }
  ],
  randomLevels: [
    randomLevel("land", 0, rawValues(sourceLandRandomLevels.slice(0, RANDOM_LEVEL_BYTES))),
    randomLevel("land", 1, authoredLandRandomValues),
    randomLevel("dungeon", 0, authoredDungeonRandomValues)
  ],
  triggers: [
    triggerRecord("Data DD", "land", 0, 0, { raw: sourceLandDoors.slice(0, DOOR_BYTES) }),
    authoredLandTrigger,
    triggerRecord("Data DDD", "dungeon", 0, 0, { raw: sourceDungeonDoors.slice(0, DOOR_BYTES) }),
    authoredDungeonTrigger,
    triggerRecord("Data ED3", null, null, 0, { raw: sourceMacros.slice(0, DOOR_BYTES) }),
    authoredMacro
  ],
  extracodes: [
    extraCodeRecord(0, sourceExtraCodes.slice(0, 10)),
    extraCodeRecord(1, sourceExtraCodes.slice(10, 20)),
    { id: 2, values: [70, -71, 72, -73, 74] }
  ]
};
const mapUpdate = createBrowserScenarioPackageZip(mapProject, mapRawSources, "mac-classic-folder");
const mapFiles = unzipScenarioPackage(mapUpdate.zip);
for (const fileName of ["Data LD", "Data DL", "Data MD2", "Data RD", "Data RDD", "Data DD", "Data DDD", "Data ED3", "Data EDCD"]) {
  expect(mapUpdate.report.writtenFiles.includes(fileName), `Authored map/script records should write ${fileName}`);
  expect(!mapUpdate.report.passThroughFiles.includes(fileName), `Written ${fileName} should not be reported as pass-through`);
}
expect(bytesEqual(mapFiles.get("Data LD")?.slice(0, FIELD_BYTES), sourceLandFields.slice(0, FIELD_BYTES)), "Unauthored land map field should remain byte-identical");
expect(bytesEqual(mapFiles.get("Data LD")?.slice(FIELD_BYTES, FIELD_BYTES * 2), fieldRow(authoredLandTiles)), "Authored land map field should encode tile stream");
expect(bytesEqual(mapFiles.get("Data DL")?.slice(0, FIELD_BYTES), fieldRow(authoredDungeonTiles)), "Authored dungeon map field should encode tile stream");
expect(bytesEqual(mapFiles.get("Data MD2")?.slice(0, MAP_RECORD_BYTES), sourceMapRecords.slice(0, MAP_RECORD_BYTES)), "Unauthored map record should remain byte-identical");
expect(bytesEqual(mapFiles.get("Data MD2")?.slice(MAP_RECORD_BYTES, MAP_RECORD_BYTES * 2), mapRecordRow(authoredMapRecord, sourceMapRecords.slice(MAP_RECORD_BYTES, MAP_RECORD_BYTES * 2))), "Authored map record should encode fields and preserve gaps");
expect(mapFiles.get("Data MD2")?.[MAP_RECORD_BYTES + 74] === 0xbe && mapFiles.get("Data MD2")?.[MAP_RECORD_BYTES + 75] === 0xef, "Authored map record should preserve raw map-record gap bytes");
expect(bytesEqual(mapFiles.get("Data RD")?.slice(0, RANDOM_LEVEL_BYTES), sourceLandRandomLevels.slice(0, RANDOM_LEVEL_BYTES)), "Unauthored land random level should remain byte-identical");
expect(bytesEqual(mapFiles.get("Data RD")?.slice(RANDOM_LEVEL_BYTES, RANDOM_LEVEL_BYTES * 2), randomLevelRow(authoredLandRandomValues)), "Authored land random level should compile semantic settings over compatible storage");
expect(bytesEqual(mapFiles.get("Data RDD")?.slice(0, RANDOM_LEVEL_BYTES), randomLevelRow(authoredDungeonRandomValues)), "Authored dungeon random level should compile semantic settings over compatible storage");
expect(bytesEqual(mapFiles.get("Data DD")?.slice(0, DOOR_BYTES), sourceLandDoors.slice(0, DOOR_BYTES)), "Unauthored land action point should remain byte-identical");
expect(bytesEqual(mapFiles.get("Data DD")?.slice(DOOR_LEVEL_BYTES + 2 * DOOR_BYTES, DOOR_LEVEL_BYTES + 3 * DOOR_BYTES), doorRow(authoredLandTrigger)), "Authored land action point should encode trigger row");
expect(bytesEqual(mapFiles.get("Data DDD")?.slice(0, DOOR_BYTES), sourceDungeonDoors.slice(0, DOOR_BYTES)), "Unauthored dungeon action point should remain byte-identical");
expect(bytesEqual(mapFiles.get("Data DDD")?.slice(3 * DOOR_BYTES, 4 * DOOR_BYTES), doorRow(authoredDungeonTrigger)), "Authored dungeon action point should encode trigger row");
expect(bytesEqual(mapFiles.get("Data ED3")?.slice(0, DOOR_BYTES), sourceMacros.slice(0, DOOR_BYTES)), "Unauthored extra action point should remain byte-identical");
expect(bytesEqual(mapFiles.get("Data ED3")?.slice(DOOR_BYTES, DOOR_BYTES * 2), doorRow(authoredMacro)), "Authored extra action point should encode trigger row");
expect(bytesEqual(mapFiles.get("Data EDCD")?.slice(0, 10), sourceExtraCodes.slice(0, 10)), "Unauthored EDCD row 0 should remain byte-identical");
expect(bytesEqual(mapFiles.get("Data EDCD")?.slice(10, 20), sourceExtraCodes.slice(10, 20)), "Unauthored EDCD row 1 should remain byte-identical");
expect(bytesEqual(mapFiles.get("Data EDCD")?.slice(20, 30), extraCodeRow([70, -71, 72, -73, 74])), "Authored EDCD row should encode parameter values");

const mapNameSourceResourceFork = writeResourceFork([
  resource("STR#", -102, "Map Names", 0, encodeStringListResource(["Old Primary 0", "Old Primary 1"])),
  resource("STR#", -101, "Map Names", 0, encodeStringListResource(["Old Secondary 0", "Old Secondary 1"]))
]);
const mapNameRawFiles = mapRawFiles.map((file) => file.name === "Scenario" ? rawFile("Scenario", mapNameSourceResourceFork, "resource-fork") : file);
const mapNameRawSources = {
  ...rawSources,
  totalBytes: mapNameRawFiles.reduce((sum, file) => sum + file.bytesData.byteLength, 0),
  files: mapNameRawFiles
};
const mapNameProject = {
  ...fixtureProject(mapNameRawFiles),
  mapRecords: [
    mapRecord(0, {
      name: "New Primary 0",
      primaryName: "New Primary 0",
      secondaryName: "New Secondary 0",
      mapNameAuthored: true,
      rawBytes: Array.from(sourceMapRecords.slice(0, MAP_RECORD_BYTES)),
      authored: false
    }),
    mapRecord(1, {
      name: "Old Primary 1",
      primaryName: "Old Primary 1",
      secondaryName: "Old Secondary 1",
      rawBytes: Array.from(sourceMapRecords.slice(MAP_RECORD_BYTES, MAP_RECORD_BYTES * 2)),
      authored: false
    })
  ]
};
const mapNameUpdate = createBrowserScenarioPackageZip(mapNameProject, mapNameRawSources, "mac-classic-folder");
const mapNameFiles = unzipScenarioPackage(mapNameUpdate.zip);
const mapNameResources = resourceMap(parseResourceFork(mapNameFiles.get("Scenario")));
const authoredPrimaryMapNames = parseStringListResource(mapNameResources.get("STR#:-102")?.data ?? new Uint8Array());
const authoredSecondaryMapNames = parseStringListResource(mapNameResources.get("STR#:-101")?.data ?? new Uint8Array());
expect(mapNameUpdate.report.writtenFiles.includes("Scenario"), "Authored map names should write Scenario resource fork");
expect(authoredPrimaryMapNames[0] === "New Primary 0", "Authored primary map name should replace STR# -102 slot");
expect(authoredPrimaryMapNames[1] === "Old Primary 1", "Unauthored primary map name should remain populated from project state");
expect(authoredSecondaryMapNames[0] === "New Secondary 0", "Authored secondary map name should replace STR# -101 slot");
expect(authoredSecondaryMapNames[1] === "Old Secondary 1", "Unauthored secondary map name should remain populated from project state");

const mapNameNoopProject = {
  ...fixtureProject(mapNameRawFiles),
  mapRecords: [
    mapRecord(0, {
      name: "Old Primary 0",
      primaryName: "Old Primary 0",
      secondaryName: "Old Secondary 0",
      mapNameAuthored: true,
      rawBytes: Array.from(sourceMapRecords.slice(0, MAP_RECORD_BYTES)),
      authored: false
    }),
    mapRecord(1, {
      name: "Old Primary 1",
      primaryName: "Old Primary 1",
      secondaryName: "Old Secondary 1",
      rawBytes: Array.from(sourceMapRecords.slice(MAP_RECORD_BYTES, MAP_RECORD_BYTES * 2)),
      authored: false
    })
  ]
};
const mapNameNoop = createBrowserScenarioPackageZip(mapNameNoopProject, mapNameRawSources, "mac-classic-folder");
const mapNameNoopFiles = unzipScenarioPackage(mapNameNoop.zip);
expect(!mapNameNoop.report.writtenFiles.includes("Scenario"), "Authored map names matching imported STR# bytes should not rewrite Scenario resource fork");
expect(bytesEqual(mapNameNoopFiles.get("Scenario"), mapNameSourceResourceFork), "Matching authored map names should preserve imported STR# Map Names bytes");

const globalHookProject = {
  ...project,
  scenario: {
    ...project.scenario,
    globalMacroHooks: globalMacroHooks({
      rawBytes: Array.from(sourceGlobalHooks),
      slots: [
        { slot: 0, door: 101 },
        { slot: 4, door: -102 },
        { slot: 6, door: 103 }
      ],
      authored: true
    })
  }
};
const globalHookUpdate = createBrowserScenarioPackageZip(globalHookProject, rawSources, "mac-classic-folder");
const globalHookFiles = unzipScenarioPackage(globalHookUpdate.zip);
expect(globalHookUpdate.report.writtenFiles.includes("Global"), "Authored global macro hooks should write Global");
expect(!globalHookUpdate.report.passThroughFiles.includes("Global"), "Written Global should not be reported as pass-through");
const writtenGlobalHooks = globalHookFiles.get("Global");
expect(writtenGlobalHooks?.byteLength === 60, "Written Global should remain 60 bytes");
expect(bytesEqual(writtenGlobalHooks, globalHookRow(globalHookProject.scenario.globalMacroHooks)), "Authored Global should encode hook slots and preserve raw unknown slots");
expect(readI16(writtenGlobalHooks ?? new Uint8Array(), 16) === 777, "Authored Global should preserve raw undocumented hook slot bytes");

const authoredLayoutCells = new Array(8 * 16).fill(0);
authoredLayoutCells[0] = 201;
authoredLayoutCells[127] = -202;
const layoutProject = {
  ...project,
  landLayout: {
    rows: 8,
    cols: 16,
    cells: authoredLayoutCells,
    trailingBytes: Array.from(sourceLayout.slice(LAND_LAYOUT_BYTES)),
    authored: true
  }
};
const layoutUpdate = createBrowserScenarioPackageZip(layoutProject, rawSources, "mac-classic-folder");
const layoutFiles = unzipScenarioPackage(layoutUpdate.zip);
expect(layoutUpdate.report.writtenFiles.includes("Layout"), "Authored land layout should write Layout");
expect(!layoutUpdate.report.passThroughFiles.includes("Layout"), "Written Layout should not be reported as pass-through");
expect(bytesEqual(layoutFiles.get("Layout"), landLayoutRow(layoutProject.landLayout)), "Authored Layout should encode cells and preserve trailing bytes");
expect(bytesEqual(layoutFiles.get("Layout")?.slice(LAND_LAYOUT_BYTES), sourceLayout.slice(LAND_LAYOUT_BYTES)), "Authored Layout should preserve compatibility tail bytes");

const authoredCustomLandlook = customLandlookMetadataFromRaw(6, "Data Custom 1 BD", sourceCustomLandlook);
authoredCustomLandlook.records[5] = {
  ...authoredCustomLandlook.records[5],
  sound: 321,
  time: 2,
  solid: 1,
  shore: 1,
  needBoat: 3,
  isPath: 1,
  los: 1,
  flyFloat: 1,
  forest: 2,
  combatBuild: [
    [10, 11, 12],
    [13, 14, 15],
    [16, 17, 18]
  ],
  clearLandId: 155
};
authoredCustomLandlook.baseTile = 200;
authoredCustomLandlook.baseScale = 3;
authoredCustomLandlook.rangeSlots[0] = {
  ...authoredCustomLandlook.rangeSlots[0],
  firstTile: 70,
  lastTile: 80
};
const customLandlookProject = {
  ...project,
  customLandlooks: [authoredCustomLandlook]
};
const customLandlookUpdate = createBrowserScenarioPackageZip(customLandlookProject, rawSources, "mac-classic-folder");
const customLandlookFiles = unzipScenarioPackage(customLandlookUpdate.zip);
expect(customLandlookUpdate.report.writtenFiles.includes("Data Custom 1 BD"), "Authored custom landlook metadata should write Data Custom 1 BD");
expect(!customLandlookUpdate.report.passThroughFiles.includes("Data Custom 1 BD"), "Written custom landlook metadata should not be reported as pass-through");
expect(bytesEqual(customLandlookFiles.get("Data Custom 1 BD"), customLandlookRow(authoredCustomLandlook)), "Authored custom landlook metadata should encode mapstats/base/ranges and preserve tail bytes");
expect(readI16(customLandlookFiles.get("Data Custom 1 BD") ?? new Uint8Array(), 5 * MAPSTATS_RECORD_BYTES + 18) === 1234, "Custom landlook writer should preserve spare mapstats words");
expect(readI16(customLandlookFiles.get("Data Custom 1 BD") ?? new Uint8Array(), MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 8) === 4321, "Custom landlook writer should preserve reserved range words");
expect(bytesEqual(customLandlookFiles.get("Data Custom 1 BD")?.slice(CUSTOM_LANDLOOK_METADATA_BYTES), sourceCustomLandlook.slice(CUSTOM_LANDLOOK_METADATA_BYTES)), "Custom landlook writer should preserve trailing bytes");

const scenarioRawMetadataProject = {
  ...project,
  scenario: {
    ...project.scenario,
    contactInfo: {
      scenarioName: "Raw Contact",
      version: "",
      date: "",
      author: "",
      email: "",
      web: "",
      fee: "",
      payInfo: ["", "", "", "", ""],
      titles: ["", "", "", "", ""],
      description: "",
      rawBytes: Array.from(sourceContactInfo),
      authored: false
    },
    restrictions: {
      description: "Raw Restrictions",
      maxPartyCharacters: 0,
      maxPartyLevel: 0,
      bannedRaces: [],
      bannedCastes: [30],
      rawBytes: Array.from(sourceRestrictions),
      authored: false
    }
  }
};
const scenarioRawMetadataUpdate = createBrowserScenarioPackageZip(scenarioRawMetadataProject, rawSources, "mac-classic-folder");
const scenarioRawMetadataFiles = unzipScenarioPackage(scenarioRawMetadataUpdate.zip);
expect(bytesEqual(scenarioRawMetadataFiles.get("Data CI"), sourceContactInfo), "Unauthored Data CI should preserve raw source bytes");
expect(bytesEqual(scenarioRawMetadataFiles.get("Data RI"), sourceRestrictions), "Unauthored Data RI should preserve raw source bytes");

const scenarioMetadataProject = {
  ...project,
  scenario: {
    ...project.scenario,
    contactInfo: {
      scenarioName: "Browser Scenario",
      version: "1.2",
      date: "2026-07-05",
      author: "Providence",
      email: "dev@example.test",
      web: "https://example.test",
      fee: "$0",
      payInfo: ["A", "B", "C", "D", "E"],
      titles: ["One", "Two", "Three", "Four", "Five"],
      description: "Browser-authored contact info",
      authored: true
    },
    restrictions: {
      description: "No giants",
      maxPartyCharacters: 4,
      maxPartyLevel: 20,
      bannedRaces: [1, 30, 31],
      bannedCastes: [2, 29, 0],
      authored: true
    }
  }
};
const scenarioMetadataUpdate = createBrowserScenarioPackageZip(scenarioMetadataProject, rawSources, "mac-classic-folder");
const scenarioMetadataFiles = unzipScenarioPackage(scenarioMetadataUpdate.zip);
for (const fileName of ["Data CI", "Data RI"]) {
  expect(scenarioMetadataUpdate.report.writtenFiles.includes(fileName), `Authored scenario metadata should write ${fileName}`);
  expect(!scenarioMetadataUpdate.report.passThroughFiles.includes(fileName), `Written ${fileName} should not be reported as pass-through`);
}
expect(bytesEqual(scenarioMetadataFiles.get("Data CI"), contactInfoRow(scenarioMetadataProject.scenario.contactInfo)), "Authored Data CI should encode contact info fields");
expect(bytesEqual(scenarioMetadataFiles.get("Data RI"), restrictionsRow(scenarioMetadataProject.scenario.restrictions)), "Authored Data RI should encode restriction fields");
expect(scenarioMetadataFiles.get("Data RI")?.[260] === 1 && scenarioMetadataFiles.get("Data RI")?.[289] === 1 && scenarioMetadataFiles.get("Data RI")?.[290] === 0, "Data RI should encode only in-range race restrictions");
expect(scenarioMetadataFiles.get("Data RI")?.[291] === 1 && scenarioMetadataFiles.get("Data RI")?.[318] === 1 && scenarioMetadataFiles.get("Data RI")?.[319] === 0, "Data RI should encode only in-range caste restrictions");

const scenarioShellProject = {
  ...project,
  scenario: {
    ...project.scenario,
    shell: {
      sourceFile: "Fixture Scenario",
      recLevel: 7,
      maxLevel: 40,
      landLevel: 3,
      lookX: -12,
      lookY: 91,
      creatorUser: "Browser Creator",
      codeseg1: [11, 12, 13, 14],
      codeseg2: [21, 22, 23],
      trailingBytes: Array.from(sourceScenarioShell.slice(316)),
      authored: true
    },
    supportFile: {
      sourceFile: "Scenario Support",
      divinityStringEditorSlot: 202,
      divinityStringSoundId: -303,
      rawBytes: Array.from(sourceSupportFile),
      authored: true
    },
    securityBackup: {
      sourceFile: "Data CS",
      recLevel: 8,
      maxLevel: 80,
      landLevel: 4,
      lookX: 18,
      lookY: -19,
      creatorUser: "Security Backup",
      codeseg1: [31, 32, 33],
      codeseg2: [41, 42, 43],
      trailingBytes: Array.from(sourceSecurityBackup.slice(316)),
      authored: true
    }
  }
};
const scenarioShellUpdate = createBrowserScenarioPackageZip(scenarioShellProject, rawSources, "mac-classic-folder");
const scenarioShellFiles = unzipScenarioPackage(scenarioShellUpdate.zip);
for (const fileName of ["Fixture Scenario", "Scenario Support", "Data CS"]) {
  expect(scenarioShellUpdate.report.writtenFiles.includes(fileName), `Authored scenario shell/support should write ${fileName}`);
  expect(!scenarioShellUpdate.report.passThroughFiles.includes(fileName), `Written ${fileName} should not be reported as pass-through`);
}
expect(bytesEqual(scenarioShellFiles.get("Fixture Scenario"), scenarioShellRow(scenarioShellProject.scenario.shell)), "Authored scenario shell should encode startup fields and preserve tail bytes");
expect(bytesEqual(scenarioShellFiles.get("Scenario Support"), scenarioSupportRow(scenarioShellProject.scenario.supportFile)), "Authored support file should preserve raw bytes and update Divinity string fields");
expect(bytesEqual(scenarioShellFiles.get("Data CS"), scenarioShellRow(scenarioShellProject.scenario.securityBackup)), "Authored Data CS should encode security backup as a scenario shell file");
expect(scenarioShellFiles.get("Scenario Support")?.[0] === 0xa1 && scenarioShellFiles.get("Scenario Support")?.[63] === 0xa2, "Scenario support writer should preserve unrelated raw bytes");

const authoredItem = scenarioItemRecord(1, {
  st: 1,
  itemId: 901,
  iconId: -302,
  type: 3,
  blunt: 4,
  hands: 5,
  lu: 6,
  movement: 7,
  ac: 8,
  magicResistance: 9,
  damage: 10,
  spellPoints: 11,
  sound: -12,
  weight: 13,
  cost: 14,
  charge: 15,
  cursedItemId: 16,
  magical: 17,
  itemCat0: 0x01020304,
  itemCat1: -2,
  raceRestrictions: 18,
  casteRestrictions: 19,
  specificRace: 20,
  specificCaste: 21,
  raceClassOnly: 22,
  casteClassOnly: 23,
  spare2: [24, 25, 26, 27, 28, 29, 30],
  vSmall: 31,
  vLarge: 32,
  heat: 33,
  cold: 34,
  electric: 35,
  vsUndead: 36,
  vsDemonDevil: 37,
  vsEvil: 38,
  special1: 39,
  special2: 40,
  special3: 41,
  special4: 42,
  special5: 43,
  weightPerCharge: 44,
  dropOnEmpty: 45
});
const itemEconomyProject = {
  ...project,
  scenarioItems: [
    scenarioItemRecordFromRaw(0, sourceScenarioItems.slice(0, 100)),
    { ...authoredItem, rawBytes: Array.from(sourceScenarioItems.slice(100, 200)), authored: true }
  ],
  treasures: [
    treasureRecordFromRaw(0, sourceTreasures.slice(0, 48)),
    { ...treasureRecord(1, { itemIds: [901, 902, -903, ...new Array(17).fill(0)], exp: 50, gold: 60, gems: 70, jewelry: 80 }), rawBytes: Array.from(sourceTreasures.slice(48, 96)), authored: true }
  ],
  shops: [
    shopRecordFromRaw(0, sourceShops.slice(0, 3002)),
    { ...shopRecord(1, { itemIds: [901, 902, -903, ...new Array(997).fill(0)], quantities: [1, 2, 255, ...new Array(997).fill(0)], inflation: -12 }), rawBytes: Array.from(sourceShops.slice(3002, 6004)), authored: true }
  ]
};
const itemEconomyUpdate = createBrowserScenarioPackageZip(itemEconomyProject, rawSources, "mac-classic-folder");
const itemEconomyFiles = unzipScenarioPackage(itemEconomyUpdate.zip);
for (const fileName of ["Data NI", "Data TD", "Data SD"]) {
  expect(itemEconomyUpdate.report.writtenFiles.includes(fileName), `Authored item/economy records should write ${fileName}`);
  expect(!itemEconomyUpdate.report.passThroughFiles.includes(fileName), `Written ${fileName} should not be reported as pass-through`);
}
const writtenScenarioItems = itemEconomyFiles.get("Data NI");
const writtenTreasures = itemEconomyFiles.get("Data TD");
const writtenShops = itemEconomyFiles.get("Data SD");
expect(writtenScenarioItems?.byteLength === 200, "Written Data NI should retain source row count");
expect(writtenTreasures?.byteLength === 96, "Written Data TD should retain source row count");
expect(writtenShops?.byteLength === 6004, "Written Data SD should retain source row count");
expect(bytesEqual(writtenScenarioItems?.slice(0, 100), sourceScenarioItems.slice(0, 100)), "Unauthored item row should remain byte-identical");
expect(bytesEqual(writtenScenarioItems?.slice(100, 200), scenarioItemRow(authoredItem)), "Authored item row should encode item fields");
expect(bytesEqual(writtenTreasures?.slice(0, 48), sourceTreasures.slice(0, 48)), "Unauthored treasure row should remain byte-identical");
expect(bytesEqual(writtenTreasures?.slice(48, 96), treasureRow({ itemIds: [901, 902, -903], exp: 50, gold: 60, gems: 70, jewelry: 80 })), "Authored treasure row should encode treasure fields");
expect(bytesEqual(writtenShops?.slice(0, 3002), sourceShops.slice(0, 3002)), "Imported shop row should semantically recompile byte-identically");
expect(bytesEqual(writtenShops?.slice(3002, 6004), shopRow({ itemIds: [901, 902, -903], quantities: [1, 2, 255], inflation: -12 })), "Authored shop row should encode shop fields");

const authoredSpell = spellRecord(1, {
  range1: 2,
  range2: 3,
  queueIcon: 4,
  toHitBonus: -5,
  saveBonus: -6,
  fixedTargetNum: 7,
  canRotate: 8,
  saveAdjust: -9,
  cannot: 10,
  resistAdjust: -11,
  cost: 12,
  damage1: 13,
  damage2: 14,
  powerDamage1: 15,
  powerDamage2: 16,
  duration1: 17,
  duration2: 18,
  powerDuration1: 19,
  powerDuration2: 20,
  spellLook1: 21,
  spellLook2: 22,
  sound1: 23,
  sound2: 24,
  targetType: 25,
  size: 26,
  special: 27,
  damageType: 28,
  spellClass: 29,
  inCombat: true,
  inCamp: false,
  displayName: "Browser Bolt"
});
const authoredRace = raceRecord(1, {
  plusMinusToHit: [1, -2, 3, -4, 5, -6, 7, -8],
  specialAbility: Array.from({ length: 14 }, (_, index) => index + 10),
  drvBonus: [20, 21, 22, 23, 24, 25, 26, 27],
  attBonus: [30, 31, 32, 33, 34, 35],
  minMax: Array.from({ length: 12 }, (_, index) => index + 40),
  conditions: Array.from({ length: 40 }, (_, index) => index % 2 === 0 ? index : -index),
  maxAge: 88,
  doesNotDie: 1,
  baseMove: 16,
  magRes: -17,
  twoHand: 18,
  missile: -19,
  numOfAttacks: [2, 3],
  canCaste: [1, 0, 1],
  ageRange: [[1, 10], [11, 20], [21, 30], [31, 40], [41, 50]],
  ageChange: Array.from({ length: 5 }, (_, band) => Array.from({ length: 15 }, (_, index) => band * 15 + index - 20)),
  canRegenerate: 1,
  defaultIconSet: -301,
  itemTypes: [0x01020304, -2],
  descriptors: 77
});
const authoredCaste = casteRecord(1, {
  specialAbility: [
    Array.from({ length: 14 }, (_, index) => index + 1),
    Array.from({ length: 14 }, (_, index) => -(index + 1))
  ],
  drvBonus: [1, 2, 3, 4, 5, 6, 7, 8],
  attBonus: [9, 10, 11, 12, 13, 14],
  spellcasters: [[1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]],
  minMax: Array.from({ length: 12 }, (_, index) => index + 20),
  conditions: Array.from({ length: 40 }, (_, index) => 100 - index),
  canUseMissile: 1,
  getsMissileBonus: 2,
  stamina: [3, 4],
  strength: [5, 6],
  dodge: [7, 8],
  toHit: [9, 10],
  missile: [11, 12],
  hand2Hand: [13, 14],
  casteClass: 15,
  minimumAgeGroup: 16,
  moveBonus: 17,
  magRes: 18,
  twoHand: 19,
  maxStaminaBonus: 20,
  bonusAttacks: 21,
  maxAttacks: 22,
  victory: Array.from({ length: 30 }, (_, index) => index === 2 ? 125000 : index * 1000),
  startMoney: 750,
  startItems: [42, 43, 44],
  attacks: [1, 2, 3, 4, 5],
  itemTypes: [0x05060708, -3],
  defaultIcon: -401,
  maxSpellsAttacks: 23,
  spellsSoFar: 24
});
const rulesProject = {
  ...project,
  spellOverrides: [
    spellRecord(0, { rawBytes: Array.from(sourceSpells.slice(0, 30)), authored: false }),
    { ...authoredSpell, rawBytes: Array.from(sourceSpells.slice(30, 60)), authored: true }
  ],
  raceOverrides: [
    raceRecord(0, { rawBytes: Array.from(sourceRaces.slice(0, 408)), authored: false }),
    { ...authoredRace, rawBytes: Array.from(sourceRaces.slice(408, 816)), authored: true }
  ],
  casteOverrides: [
    casteRecord(0, { rawBytes: Array.from(sourceCastes.slice(0, 576)), authored: false }),
    { ...authoredCaste, rawBytes: Array.from(sourceCastes.slice(576, 1152)), authored: true }
  ]
};
const rulesUpdate = createBrowserScenarioPackageZip(rulesProject, rawSources, "mac-classic-folder");
const rulesFiles = unzipScenarioPackage(rulesUpdate.zip);
for (const fileName of ["Data Spell", "Data Spell.rsrc", "Data Race", "Data Caste"]) {
  expect(rulesUpdate.report.writtenFiles.includes(fileName), `Authored rules records should write ${fileName}`);
  expect(!rulesUpdate.report.passThroughFiles.includes(fileName), `Written ${fileName} should not be reported as pass-through`);
}
const writtenSpells = rulesFiles.get("Data Spell");
const writtenSpellNames = rulesFiles.get("Data Spell.rsrc");
const writtenRaces = rulesFiles.get("Data Race");
const writtenCastes = rulesFiles.get("Data Caste");
expect(writtenSpells?.byteLength === 76, "Written Data Spell should preserve raw tail bytes");
expect(bytesEqual(writtenSpells?.slice(0, 30), sourceSpells.slice(0, 30)), "Unauthored spell row should remain byte-identical");
expect(bytesEqual(writtenSpells?.slice(30, 60), spellRow(authoredSpell)), "Authored spell row should encode spell fields");
expect(bytesEqual(writtenSpells?.slice(60, 76), sourceSpells.slice(60, 76)), "Data Spell raw tail should remain byte-identical");
const spellNames = parseStringListResource(resourceMap(parseResourceFork(writtenSpellNames)).get("STR#:5000")?.data ?? new Uint8Array());
expect(spellNames[1] === "Browser Bolt", "Custom spell display name should update Data Spell STR# resources");
expect(writtenRaces?.byteLength === 816, "Written Data Race should retain source row count");
expect(writtenCastes?.byteLength === 1152, "Written Data Caste should retain source row count");
expect(bytesEqual(writtenRaces?.slice(0, 408), sourceRaces.slice(0, 408)), "Unauthored race row should remain byte-identical");
expect(bytesEqual(writtenRaces?.slice(408, 816), raceRow(authoredRace, sourceRaces.slice(408, 816))), "Authored race row should encode race fields and preserve gaps");
expect(writtenRaces?.[408 + 346] === 0xab, "Authored race row should preserve raw bytes outside known fields");
expect(bytesEqual(writtenCastes?.slice(0, 576), sourceCastes.slice(0, 576)), "Unauthored caste row should remain byte-identical");
expect(bytesEqual(writtenCastes?.slice(576, 1152), casteRow(authoredCaste, sourceCastes.slice(576, 1152))), "Authored caste row should encode caste fields and preserve gaps");
expect(writtenCastes?.[576 + 450] === 0xcd, "Authored caste row should preserve raw bytes outside known fields");

const authoredSimpleEncounter = simpleEncounterRecord(1, {
  actions: [{ slot: 3, rawCode: -2, id: 0x0304 }],
  choiceResults: [1, 2, 7, 4],
  canBackOut: true,
  maxTimes: -3,
  casteSuccess: 4,
  prompt: 0x0506,
  texts: ["Go", "North", "", ""]
});
const authoredComplexEncounter = complexEncounterRecord(1, {
  actions: [{ slot: 4, rawCode: -2, id: 0x0304 }],
  actionResult: 6,
  wordResult: 7,
  groups: [1, 2, 3, 4, -8, 6, 7, 8],
  spellIds: [0x1112, 0x2223],
  spellResults: [1, -9],
  itemIds: [0x3132, 0, 0x1314],
  itemResults: [1, 2, 3, -10, 5],
  canBackOut: true,
  thief: true,
  maxTimes: -3,
  casteSuccess: 4,
  thiefSuccess: -5,
  thiefFail: 8,
  prompt: 0x0506,
  texts: ["Hi", "Word", "Spell", "Item", "", "", "", "", ""]
});
const authoredThiefEncounter = thiefEncounterRecord(1, {
  typeFlags: [true, false, true, true],
  modifiers: [0, 1, 2, 3, -8],
  successCodes: [0, 2, 3, 4, 5, 9],
  failureCodes: [0, -1, -2, -3, -4, -5, -7],
  successText: [101, 102, 0x0102],
  failureText: [201, 202, 203, 0x0304],
  successSounds: [301, 302, 303, 304, 0x0506],
  failureSounds: [401, 402, 403, 404, 405, 0x0708],
  spell: 0x090a,
  lowDamage: 0x0b0c,
  highDamage: 0x0d0e,
  tumblers: 0x0f10,
  prompts: [55, 0x1112, 6],
  promptSounds: [10136, 5, 0x1314]
});
const authoredTimedEncounter = timedEncounterRecord(1, {
  day: 35,
  increment: 5,
  percent: 50,
  door: 24,
  requiredLevel: 8,
  requiredRandomRect: 17,
  requiredX: -1,
  requiredY: -2,
  requiredItem: 901,
  requiredQuest: 7,
  locationKind: "dungeon",
  stuff: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
});
const encounterProject = {
  ...project,
  simpleEncounters: [
    simpleEncounterRecord(0, { rawBytes: Array.from(sourceSimpleEncounters.slice(0, 426)), authored: false }),
    { ...authoredSimpleEncounter, rawBytes: Array.from(sourceSimpleEncounters.slice(426, 852)), authored: true }
  ],
  complexEncounters: [
    complexEncounterRecord(0, { rawBytes: Array.from(sourceComplexEncounters.slice(0, 520)), authored: false }),
    { ...authoredComplexEncounter, rawBytes: Array.from(sourceComplexEncounters.slice(520, 1040)), authored: true }
  ],
  thiefEncounters: [
    thiefEncounterRecord(0, { rawBytes: Array.from(sourceThiefEncounters.slice(0, 118)), authored: false }),
    { ...authoredThiefEncounter, rawBytes: Array.from(sourceThiefEncounters.slice(118, 236)), authored: true }
  ],
  timedEncounters: [
    timedEncounterRecord(0, { rawBytes: Array.from(sourceTimedEncounters.slice(0, 40)), authored: false }),
    { ...authoredTimedEncounter, rawBytes: Array.from(sourceTimedEncounters.slice(40, 80)), authored: true }
  ]
};
const encounterUpdate = createBrowserScenarioPackageZip(encounterProject, rawSources, "mac-classic-folder");
const encounterFiles = unzipScenarioPackage(encounterUpdate.zip);
for (const fileName of ["Data ED", "Data ED2", "Data TD2", "Data TD3"]) {
  expect(encounterUpdate.report.writtenFiles.includes(fileName), `Authored encounter records should write ${fileName}`);
  expect(!encounterUpdate.report.passThroughFiles.includes(fileName), `Written ${fileName} should not be reported as pass-through`);
}
const writtenSimpleEncounters = encounterFiles.get("Data ED");
const writtenComplexEncounters = encounterFiles.get("Data ED2");
const writtenThiefEncounters = encounterFiles.get("Data TD2");
const writtenTimedEncounters = encounterFiles.get("Data TD3");
expect(writtenSimpleEncounters?.byteLength === 852, "Written Data ED should retain source row count");
expect(writtenComplexEncounters?.byteLength === 1040, "Written Data ED2 should retain source row count");
expect(writtenThiefEncounters?.byteLength === 236, "Written Data TD2 should retain source row count");
expect(writtenTimedEncounters?.byteLength === 80, "Written Data TD3 should retain source row count");
expect(bytesEqual(writtenSimpleEncounters?.slice(0, 426), sourceSimpleEncounters.slice(0, 426)), "Unauthored simple encounter row should remain byte-identical");
expect(bytesEqual(writtenSimpleEncounters?.slice(426, 852), simpleEncounterRow(authoredSimpleEncounter, sourceSimpleEncounters.slice(426, 852))), "Authored simple encounter row should encode fields and preserve gap");
expect(writtenSimpleEncounters?.[426 + 103] === 0xa5, "Authored simple encounter row should preserve gap byte 103");
expect(bytesEqual(writtenComplexEncounters?.slice(0, 520), sourceComplexEncounters.slice(0, 520)), "Unauthored complex encounter row should remain byte-identical");
expect(bytesEqual(writtenComplexEncounters?.slice(520, 1040), complexEncounterRow(authoredComplexEncounter, sourceComplexEncounters.slice(520, 1040))), "Authored complex encounter row should encode fields and preserve gaps");
expect(writtenComplexEncounters?.[520 + 157] === 0x5a, "Authored complex encounter row should preserve known gap byte");
expect(bytesEqual(writtenThiefEncounters?.slice(0, 118), sourceThiefEncounters.slice(0, 118)), "Unauthored thief encounter row should remain byte-identical");
expect(bytesEqual(writtenThiefEncounters?.slice(118, 236), thiefEncounterRow(authoredThiefEncounter)), "Authored thief encounter row should encode fields");
expect(bytesEqual(writtenTimedEncounters?.slice(0, 40), sourceTimedEncounters.slice(0, 40)), "Unauthored timed encounter row should remain byte-identical");
expect(bytesEqual(writtenTimedEncounters?.slice(40, 80), timedEncounterRow(authoredTimedEncounter)), "Authored timed encounter row should encode fields");

const noOpResourceAssetProject = {
  ...project,
  mapRecords: [],
  monsterIconOverrides: [],
  scenarioIconResources: [],
  assets: [
    managedAsset("asset-text-202-noop", "Text 202", "text", "TEXT", 202, "data:text/plain;base64,T2xk"),
    managedAsset("asset-styl-202-noop", "Style 202", "text", "styl", 202, "data:application/octet-stream;base64,CQkJ")
  ]
};
const noOpResourceExport = createBrowserScenarioPackageZip(noOpResourceAssetProject, rawSources, "mac-classic-folder");
expect(!noOpResourceExport.report.writtenFiles.includes("Scenario"), "Managed assets matching imported resource bytes should not rewrite Scenario");
expect(noOpResourceExport.report.passThroughFiles.includes("Scenario"), "Unchanged imported resource fork should stay pass-through");

const resourceUpdateProject = {
  ...project,
  assets: [
    managedAsset("asset-custom-landlook-atlas-6", "Custom 1 Landlook Atlas", "picture", "PICT", 306, "data:image/png;base64,AAECAw=="),
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
expect(bytesEqual(macResources.get("PICT:306")?.data, Uint8Array.from([0, 1, 2, 3])), "Mac resource export should write generated Custom 1 PICT 306 atlas data");
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
expect(bytesEqual(windowsSidecarResources.get("PICT:306")?.data, Uint8Array.from([0, 1, 2, 3])), "Windows Scenario.rsrc sidecar should contain generated Custom 1 PICT 306 atlas data");
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

function battleRow({ grid, dist, messageBefore, messageAfter, battleMacro }) {
  const output = new Uint8Array(346);
  for (let slot = 0; slot < 13 * 13; slot += 1) {
    setI16(output, slot * 2, grid[slot] ?? 0);
  }
  output[338] = dist & 0xff;
  setI16(output, 340, messageBefore);
  setI16(output, 342, messageAfter);
  setI16(output, 344, battleMacro);
  return output;
}

function monsterRecord(id, overrides = {}) {
  return {
    id,
    hitDice: 0,
    staminaBonus: 0,
    agility: 0,
    nameId: 0,
    movementMax: 0,
    armor: 0,
    magicResistance: 0,
    distance: 0,
    traitor: 0,
    size: 0,
    typeFlags: new Array(8).fill(0),
    attackCount: 0,
    magicAttackCount: 0,
    attacks: Array.from({ length: 5 }, () => new Array(4).fill(0)),
    damageBonus: 0,
    castPercent: 0,
    runPercent: 0,
    surrenderPercent: 0,
    missilePercent: 0,
    canSummon: 0,
    saves: new Array(6).fill(0),
    spellImmunities: new Array(6).fill(0),
    money: new Array(3).fill(0),
    spells: new Array(10).fill(0),
    items: new Array(6).fill(0),
    weapon: 0,
    iconId: 0,
    spellPoints: 0,
    exp: 0,
    stamina: 0,
    staminaMax: 0,
    underneath: new Array(4).fill(0),
    target: 0,
    guarding: 0,
    notOnMenu: false,
    beenAttacked: 0,
    movement: 0,
    magicToHit: 0,
    conditions: new Array(40).fill(0),
    lr: 0,
    up: 0,
    attackNum: 0,
    bonusAttack: 0,
    deathMacro: 0,
    maxSpellPoints: 0,
    displayName: "",
    rawBytes: new Array(210).fill(0),
    authored: true,
    ...overrides
  };
}

function monsterRow(record) {
  const output = new Uint8Array(210);
  output[0] = record.hitDice & 0xff;
  output[1] = record.staminaBonus & 0xff;
  output[2] = record.agility & 0xff;
  output[3] = record.nameId & 0xff;
  output[4] = record.movementMax & 0xff;
  output[5] = record.armor & 0xff;
  output[6] = record.magicResistance & 0xff;
  output[7] = record.distance & 0xff;
  output[8] = record.traitor & 0xff;
  output[9] = record.size & 0xff;
  setI8Array(output, 10, record.typeFlags, 8);
  output[18] = record.attackCount & 0xff;
  output[19] = record.magicAttackCount & 0xff;
  for (let row = 0; row < 5; row += 1) setI8Array(output, 20 + row * 4, record.attacks[row] ?? [], 4);
  output[40] = record.damageBonus & 0xff;
  output[41] = record.castPercent & 0xff;
  output[42] = record.runPercent & 0xff;
  output[43] = record.surrenderPercent & 0xff;
  output[44] = record.missilePercent & 0xff;
  output[45] = record.canSummon & 0xff;
  setI8Array(output, 46, record.saves, 6);
  setI8Array(output, 52, record.spellImmunities, 6);
  setI16Array(output, 58, record.money, 3);
  setI16Array(output, 64, record.spells, 10);
  setI16Array(output, 84, record.items, 6);
  setI16(output, 96, record.weapon);
  setI16(output, 98, record.iconId);
  setI16(output, 100, record.spellPoints);
  setI16(output, 102, record.exp);
  setI16(output, 104, record.stamina);
  setI16(output, 106, record.staminaMax);
  setI16Array(output, 108, record.underneath, 4);
  output[116] = record.target & 0xff;
  output[117] = record.guarding & 0xff;
  output[118] = record.notOnMenu ? 1 : 0;
  output[119] = record.beenAttacked & 0xff;
  output[120] = record.movement & 0xff;
  output[121] = record.magicToHit & 0xff;
  setI8Array(output, 122, record.conditions, 40);
  output[162] = record.lr & 0xff;
  output[163] = record.up & 0xff;
  output[164] = record.attackNum & 0xff;
  output[165] = record.bonusAttack & 0xff;
  setI16(output, 166, record.deathMacro);
  setI16(output, 168, record.maxSpellPoints);
  const name = new Uint8Array([...record.displayName].map((char) => char.charCodeAt(0)));
  output.set(name, 170);
  return output;
}

function mapEntity(levelType, index, tiles) {
  return {
    id: `${levelType}:${index}`,
    levelType,
    source: levelType === "land" ? "Data LD" : "Data DL",
    index,
    name: `${levelType} level ${index}`,
    width: 90,
    height: 90,
    tiles,
    render: { tilesetId: "abstract-fallback", landlook: null, mode: "abstract-fallback" }
  };
}

function fieldTiles(bytes) {
  return Array.from({ length: 90 * 90 }, (_, index) => readI16(bytes, index * 2));
}

function fieldRow(tiles) {
  const output = new Uint8Array(FIELD_BYTES);
  for (let index = 0; index < 90 * 90; index += 1) setI16(output, index * 2, tiles[index] ?? 0);
  return output;
}

function mapRecord(id, overrides = {}) {
  const record = {
    id,
    name: `Map ${id}`,
    primaryName: `Map ${id}`,
    secondaryName: "",
    startX: 0,
    startY: 0,
    level: 0,
    pictId: 0,
    iconSize: 0,
    show: 0,
    isDungeon: false,
    rect: { top: 0, left: 0, bottom: 0, right: 0 },
    note: "",
    authored: true,
    mapNameAuthored: false,
    provenance: { sourceFile: "Data MD2", recordIndex: id, byteOffset: id * MAP_RECORD_BYTES, byteLength: MAP_RECORD_BYTES, confidence: "fixture-backed" },
    ...overrides
  };
  return {
    ...record,
    markers: Array.from({ length: 10 }, (_, slot) => overrides.markers?.[slot] ?? mapMarkerFromRaw(overrides.rawBytes, slot))
  };
}

function mapRecordRow(record, rawBytes = new Uint8Array(MAP_RECORD_BYTES)) {
  const output = new Uint8Array(MAP_RECORD_BYTES);
  output.set(rawBytes.slice(0, MAP_RECORD_BYTES));
  for (let slot = 0; slot < 10; slot += 1) {
    const marker = record.markers[slot] ?? { iconId: 0, x: 0, y: 0 };
    const offset = slot * 6;
    setI16(output, offset, marker.iconId);
    setI16(output, offset + 2, marker.x);
    setI16(output, offset + 4, marker.y);
  }
  setI16(output, 60, record.startX);
  setI16(output, 62, record.startY);
  setI16(output, 64, record.level);
  setI16(output, 66, record.pictId);
  setI16(output, 68, record.iconSize);
  setI16(output, 70, record.show);
  setI16(output, 72, record.isDungeon ? 1 : 0);
  setI16(output, 76, record.rect.top);
  setI16(output, 78, record.rect.left);
  setI16(output, 80, record.rect.bottom);
  setI16(output, 82, record.rect.right);
  setPascalText(output.subarray(84, MAP_RECORD_BYTES), record.note);
  return output;
}

function mapMarkerFromRaw(rawBytes, slot) {
  const offset = slot * 6;
  if (!rawBytes || (rawBytes.length ?? rawBytes.byteLength) < offset + 6) return { iconId: 0, x: 0, y: 0 };
  return {
    iconId: readI16(rawBytes, offset),
    x: readI16(rawBytes, offset + 2),
    y: readI16(rawBytes, offset + 4)
  };
}

function randomLevel(levelType, levelIndex, rawValues) {
  const source = levelType === "land" ? "Data RD" : "Data RDD";
  const landlookDarkWord = (rawValues[260] ?? 0) & 0xffff;
  const losWord = (rawValues[261] ?? 0) & 0xffff;
  return {
    id: `${levelType}:${levelIndex}:randlevel`,
    source,
    levelType,
    levelIndex,
    landlook: signedByte((landlookDarkWord >>> 8) & 0xff),
    isDark: (landlookDarkWord & 0xff) !== 0,
    useLos: ((losWord >>> 8) & 0xff) !== 0,
    rects: [],
    rawValues,
    provenance: { sourceFile: source, recordIndex: levelIndex, byteOffset: levelIndex * RANDOM_LEVEL_BYTES, byteLength: RANDOM_LEVEL_BYTES, confidence: "fixture-backed" }
  };
}

function rawValues(bytes) {
  return Array.from({ length: RANDOM_LEVEL_BYTES / 2 }, (_, index) => readI16(bytes, index * 2));
}

function randomLevelRow(values) {
  const output = new Uint8Array(RANDOM_LEVEL_BYTES);
  setI16Array(output, 0, values, RANDOM_LEVEL_BYTES / 2);
  return output;
}

function triggerRecord(source, levelType, levelIndex, recordIndex, overrides = {}) {
  if (overrides.raw) {
    const raw = overrides.raw;
    const actions = [];
    for (let slot = 0; slot < 8; slot += 1) {
      const rawCode = readI16(raw, 8 + slot * 2);
      const id = readI16(raw, 24 + slot * 2);
      if (rawCode !== 0 || id !== 0) actions.push({ slot, rawCode, id });
    }
    return {
      id: `${source}:${levelIndex ?? "macro"}:${recordIndex}`,
      source,
      levelType,
      levelIndex,
      recordIndex,
      active: true,
      doorid: readI32(raw, 0),
      landid: raw[4] ?? 0,
      targetX: raw[5] ?? 0,
      targetY: raw[6] ?? 0,
      percent: signedByte(raw[7] ?? 0),
      coordinate: levelType ? { x: raw[5] ?? 0, y: raw[6] ?? 0 } : null,
      actions
    };
  }
  return {
    id: `${source}:${levelIndex ?? "macro"}:${recordIndex}`,
    source,
    levelType,
    levelIndex,
    recordIndex,
    active: true,
    doorid: 0,
    landid: 0,
    targetX: 0,
    targetY: 0,
    percent: 0,
    coordinate: levelType ? { x: 0, y: 0 } : null,
    actions: [],
    ...overrides
  };
}

function doorRow(trigger) {
  const output = new Uint8Array(DOOR_BYTES);
  setDoor(output, trigger);
  return output;
}

function setDoor(output, trigger) {
  setI32(output, 0, trigger.doorid ?? 0);
  output[4] = (trigger.landid ?? 0) & 0xff;
  output[5] = (trigger.targetX ?? 0) & 0xff;
  output[6] = (trigger.targetY ?? 0) & 0xff;
  output[7] = (trigger.percent ?? 0) & 0xff;
  for (const action of trigger.actions ?? []) {
    setI16(output, 8 + action.slot * 2, action.rawCode);
    setI16(output, 24 + action.slot * 2, action.id);
  }
}

function extraCodeRecord(id, bytes) {
  return {
    id,
    values: [readI16(bytes, 0), readI16(bytes, 2), readI16(bytes, 4), readI16(bytes, 6), readI16(bytes, 8)]
  };
}

function extraCodeRow(values) {
  const output = new Uint8Array(10);
  setI16Array(output, 0, values, 5);
  return output;
}

function globalMacroHooks({ rawBytes, slots, authored }) {
  return {
    rawBytes,
    authored,
    slots: slots.map((slot) => ({
      label: `Slot ${slot.slot}`,
      sourceBacked: true,
      runtimeConsumer: "fixture",
      ...slot
    }))
  };
}

function globalHookRow(hooks) {
  const output = hooks.rawBytes?.length === 60
    ? new Uint8Array(hooks.rawBytes.map((value) => value & 0xff))
    : new Uint8Array(60);
  for (const hook of hooks.slots) {
    if (hook.slot >= 0 && hook.slot < 30) setI16(output, hook.slot * 2, hook.door);
  }
  return output;
}

function landLayoutRow(layout) {
  const trailingBytes = layout.trailingBytes ?? [];
  const output = new Uint8Array(LAND_LAYOUT_BYTES + trailingBytes.length);
  setI16Array(output, 0, layout.cells, 8 * 16);
  output.set(trailingBytes.map((value) => value & 0xff), LAND_LAYOUT_BYTES);
  return output;
}

function customLandlookMetadataFromRaw(landlook, sourceFile, rawBytes) {
  const baseOffset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
  const rangeStart = baseOffset + 4;
  return {
    landlook,
    sourceFile,
    records: Array.from({ length: MAPSTATS_RECORDS }, (_, tile) => mapstatsRecordFromRaw(rawBytes, tile)),
    baseTile: rawBytes.byteLength >= baseOffset + 2 ? readI16(rawBytes, baseOffset) : 0,
    baseScale: rawBytes.byteLength >= baseOffset + 4 ? readI16(rawBytes, baseOffset + 2) : 0,
    rangeSlots: Array.from({ length: LANDLOOK_RANGE_SLOTS }, (_, slot) => {
      const start = rangeStart + slot * LANDLOOK_RANGE_SLOT_BYTES;
      return {
        slot,
        label: slot === 0 ? "Mountain range" : slot === 1 ? "Open range" : slot === 2 ? "Rubble range" : slot === 3 ? "House range" : "Reserved range",
        firstTile: rawBytes.byteLength >= start + 2 ? readI16(rawBytes, start) : 0,
        lastTile: rawBytes.byteLength >= start + 4 ? readI16(rawBytes, start + 2) : 0,
        reserved: rawBytes.byteLength >= start + 6 ? readI16(rawBytes, start + 4) : 0
      };
    }),
    trailingBytes: Array.from(rawBytes.slice(CUSTOM_LANDLOOK_METADATA_BYTES)),
    rawBytes: Array.from(rawBytes),
    writerGate: {
      metadataWriterStatus: "writer-safe-fixture-gated",
      atlasWriterStatus: "writable-by-generated-pict-replacement",
      writableFields: [],
      preserveOnlyFields: [],
      evidence: []
    },
    authored: true
  };
}

function mapstatsRecordFromRaw(rawBytes, tile) {
  const start = tile * MAPSTATS_RECORD_BYTES;
  if (rawBytes.byteLength < start + MAPSTATS_RECORD_BYTES) return emptyMapstatsRecord(tile);
  return {
    tile,
    sound: readI16(rawBytes, start),
    time: readI16(rawBytes, start + 2),
    solid: readI16(rawBytes, start + 4),
    shore: readI16(rawBytes, start + 6),
    needBoat: readI16(rawBytes, start + 8),
    isPath: readI16(rawBytes, start + 10),
    los: readI16(rawBytes, start + 12),
    flyFloat: readI16(rawBytes, start + 14),
    forest: readI16(rawBytes, start + 16),
    spare: readI16(rawBytes, start + 18),
    combatBuild: [
      [readI16(rawBytes, start + 20), readI16(rawBytes, start + 22), readI16(rawBytes, start + 24)],
      [readI16(rawBytes, start + 26), readI16(rawBytes, start + 28), readI16(rawBytes, start + 30)],
      [readI16(rawBytes, start + 32), readI16(rawBytes, start + 34), readI16(rawBytes, start + 36)]
    ],
    clearLandId: readI16(rawBytes, start + 38)
  };
}

function emptyMapstatsRecord(tile) {
  return {
    tile,
    sound: 0,
    time: 0,
    solid: 0,
    shore: 0,
    needBoat: 0,
    isPath: 0,
    los: 0,
    flyFloat: 0,
    forest: 0,
    spare: 0,
    combatBuild: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    clearLandId: 0
  };
}

function customLandlookRow(metadata) {
  let output = metadata.rawBytes?.length >= CUSTOM_LANDLOOK_METADATA_BYTES
    ? new Uint8Array(metadata.rawBytes.map((value) => value & 0xff))
    : new Uint8Array(CUSTOM_LANDLOOK_METADATA_BYTES);
  for (const [tile, record] of metadata.records.slice(0, MAPSTATS_RECORDS).entries()) {
    setMapstatsRecord(output, tile, record);
  }
  const baseOffset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
  setI16(output, baseOffset, metadata.baseTile);
  setI16(output, baseOffset + 2, metadata.baseScale);
  for (const slot of metadata.rangeSlots.slice(0, LANDLOOK_RANGE_SLOTS)) {
    if (slot.slot < 0 || slot.slot >= LANDLOOK_RANGE_SLOTS) continue;
    const start = baseOffset + 4 + slot.slot * LANDLOOK_RANGE_SLOT_BYTES;
    setI16(output, start, slot.firstTile);
    setI16(output, start + 2, slot.lastTile);
    setI16(output, start + 4, slot.reserved);
  }
  if ((metadata.rawBytes?.length ?? 0) <= CUSTOM_LANDLOOK_METADATA_BYTES && metadata.trailingBytes?.length > 0) {
    const extended = new Uint8Array(CUSTOM_LANDLOOK_METADATA_BYTES + metadata.trailingBytes.length);
    extended.set(output.subarray(0, CUSTOM_LANDLOOK_METADATA_BYTES));
    extended.set(metadata.trailingBytes.map((value) => value & 0xff), CUSTOM_LANDLOOK_METADATA_BYTES);
    output = extended;
  }
  return output;
}

function setMapstatsRecord(output, tile, record) {
  const start = tile * MAPSTATS_RECORD_BYTES;
  setI16(output, start, record.sound);
  setI16(output, start + 2, record.time);
  setI16(output, start + 4, record.solid);
  setI16(output, start + 6, record.shore);
  setI16(output, start + 8, record.needBoat);
  setI16(output, start + 10, record.isPath);
  setI16(output, start + 12, record.los);
  setI16(output, start + 14, record.flyFloat);
  setI16(output, start + 16, record.forest);
  setI16(output, start + 18, record.spare);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      setI16(output, start + 20 + (row * 3 + col) * 2, record.combatBuild?.[row]?.[col] ?? 0);
    }
  }
  setI16(output, start + 38, record.clearLandId);
}

function scenarioShellRow(shell) {
  const trailingBytes = shell.trailingBytes ?? [];
  const output = new Uint8Array(316 + trailingBytes.length);
  setI32(output, 0, shell.recLevel);
  setI32(output, 4, shell.maxLevel);
  setI32(output, 8, shell.landLevel);
  setI32(output, 12, shell.lookX);
  setI32(output, 16, shell.lookY);
  setFixedBytes(output, 20, 20, shell.codeseg1 ?? []);
  setFixedBytes(output, 40, 20, shell.codeseg2 ?? []);
  setPascalText(output.subarray(60, 316), shell.creatorUser ?? "");
  output.set(trailingBytes.map((value) => value & 0xff), 316);
  return output;
}

function scenarioSupportRow(support) {
  let output = support.rawBytes?.length > 0
    ? new Uint8Array(support.rawBytes.map((value) => value & 0xff))
    : new Uint8Array(600);
  if (output.byteLength < 40) {
    const resized = new Uint8Array(40);
    resized.set(output);
    output = resized;
  }
  if (support.divinityStringEditorSlot != null) output[23] = support.divinityStringEditorSlot & 0xff;
  if (support.divinityStringSoundId != null) setI16(output, 38, support.divinityStringSoundId);
  return output;
}

function contactInfoRow(contact) {
  const output = new Uint8Array(4608);
  const fields = [
    contact.scenarioName,
    contact.version,
    contact.date,
    contact.author,
    contact.email,
    contact.web,
    contact.fee
  ];
  for (const [slot, value] of fields.entries()) {
    setPascalText(output.subarray(slot * 256, slot * 256 + 256), value ?? "");
  }
  for (let index = 0; index < 5; index += 1) {
    setPascalText(output.subarray((7 + index) * 256, (8 + index) * 256), contact.payInfo[index] ?? "");
    setPascalText(output.subarray((12 + index) * 256, (13 + index) * 256), contact.titles[index] ?? "");
  }
  setPascalText(output.subarray(17 * 256, 18 * 256), contact.description ?? "");
  return output;
}

function restrictionsRow(restrictions) {
  const output = new Uint8Array(320);
  setPascalText(output.subarray(0, 256), restrictions.description ?? "");
  setI16(output, 256, restrictions.maxPartyCharacters);
  setI16(output, 258, restrictions.maxPartyLevel);
  for (const race of restrictions.bannedRaces) {
    if (race >= 1 && race <= 30) output[260 + race - 1] = 1;
  }
  for (const caste of restrictions.bannedCastes) {
    if (caste >= 1 && caste <= 30) output[290 + caste - 1] = 1;
  }
  return output;
}

function scenarioItemRecord(id, overrides = {}) {
  return {
    id,
    itemId: 800 + id,
    iconId: 0,
    type: 0,
    st: 0,
    blunt: 0,
    hands: 0,
    lu: 0,
    movement: 0,
    ac: 0,
    magicResistance: 0,
    damage: 0,
    spellPoints: 0,
    sound: 0,
    weight: 0,
    cost: 0,
    charge: 0,
    cursedItemId: 0,
    magical: 0,
    itemCat0: 0,
    itemCat1: 0,
    raceRestrictions: 0,
    casteRestrictions: 0,
    specificRace: 0,
    specificCaste: 0,
    raceClassOnly: 0,
    casteClassOnly: 0,
    spare2: new Array(7).fill(0),
    vSmall: 0,
    vLarge: 0,
    heat: 0,
    cold: 0,
    electric: 0,
    vsUndead: 0,
    vsDemonDevil: 0,
    vsEvil: 0,
    special1: 0,
    special2: 0,
    special3: 0,
    special4: 0,
    special5: 0,
    weightPerCharge: 0,
    dropOnEmpty: 0,
    authored: true,
    provenance: { sourceFile: "Data NI", recordIndex: id, byteOffset: id * 100, byteLength: 100, confidence: "fixture-backed" },
    ...overrides
  };
}

function scenarioItemRecordFromRaw(id, bytes) {
  const record = scenarioItemRecord(id, {
    rawBytes: Array.from(bytes),
    authored: false
  });
  const storedItemId = readI16(bytes, 2);
  record.itemId = storedItemId !== 0 ? storedItemId : 800 + id;
  for (const [field, offset] of [
    ["st", 0], ["iconId", 4], ["type", 6], ["blunt", 8], ["hands", 10], ["lu", 12],
    ["movement", 14], ["ac", 16], ["magicResistance", 18], ["damage", 20],
    ["spellPoints", 22], ["sound", 24], ["weight", 26], ["cost", 28], ["charge", 30],
    ["cursedItemId", 32], ["magical", 34], ["raceRestrictions", 44], ["casteRestrictions", 46],
    ["specificRace", 48], ["specificCaste", 50], ["raceClassOnly", 52], ["casteClassOnly", 54],
    ["vSmall", 70], ["vLarge", 72], ["heat", 74], ["cold", 76], ["electric", 78],
    ["vsUndead", 80], ["vsDemonDevil", 82], ["vsEvil", 84], ["special1", 86],
    ["special2", 88], ["special3", 90], ["special4", 92], ["special5", 94],
    ["weightPerCharge", 96], ["dropOnEmpty", 98]
  ]) record[field] = readI16(bytes, offset);
  record.itemCat0 = readI32(bytes, 36);
  record.itemCat1 = readI32(bytes, 40);
  record.spare2 = Array.from({ length: 7 }, (_, index) => readI16(bytes, 56 + index * 2));
  return record;
}

function scenarioItemRow(record) {
  const output = new Uint8Array(100);
  setI16(output, 0, record.st);
  setI16(output, 2, record.itemId);
  setI16(output, 4, record.iconId);
  setI16(output, 6, record.type);
  setI16(output, 8, record.blunt);
  setI16(output, 10, record.hands);
  setI16(output, 12, record.lu);
  setI16(output, 14, record.movement);
  setI16(output, 16, record.ac);
  setI16(output, 18, record.magicResistance);
  setI16(output, 20, record.damage);
  setI16(output, 22, record.spellPoints);
  setI16(output, 24, record.sound);
  setI16(output, 26, record.weight);
  setI16(output, 28, record.cost);
  setI16(output, 30, record.charge);
  setI16(output, 32, record.cursedItemId);
  setI16(output, 34, record.magical);
  setI32(output, 36, record.itemCat0);
  setI32(output, 40, record.itemCat1);
  setI16(output, 44, record.raceRestrictions);
  setI16(output, 46, record.casteRestrictions);
  setI16(output, 48, record.specificRace);
  setI16(output, 50, record.specificCaste);
  setI16(output, 52, record.raceClassOnly);
  setI16(output, 54, record.casteClassOnly);
  setI16Array(output, 56, record.spare2, 7);
  setI16(output, 70, record.vSmall);
  setI16(output, 72, record.vLarge);
  setI16(output, 74, record.heat);
  setI16(output, 76, record.cold);
  setI16(output, 78, record.electric);
  setI16(output, 80, record.vsUndead);
  setI16(output, 82, record.vsDemonDevil);
  setI16(output, 84, record.vsEvil);
  setI16(output, 86, record.special1);
  setI16(output, 88, record.special2);
  setI16(output, 90, record.special3);
  setI16(output, 92, record.special4);
  setI16(output, 94, record.special5);
  setI16(output, 96, record.weightPerCharge);
  setI16(output, 98, record.dropOnEmpty);
  return output;
}

function treasureRecord(id, overrides = {}) {
  return {
    id,
    itemIds: new Array(20).fill(0),
    exp: 0,
    gold: 0,
    gems: 0,
    jewelry: 0,
    authored: true,
    provenance: { sourceFile: "Data TD", recordIndex: id, byteOffset: id * 48, byteLength: 48, confidence: "fixture-backed" },
    ...overrides
  };
}

function treasureRecordFromRaw(id, bytes) {
  return treasureRecord(id, {
    itemIds: Array.from({ length: 20 }, (_, slot) => readI16(bytes, slot * 2)),
    exp: readI16(bytes, 40),
    gold: readI16(bytes, 42),
    gems: readI16(bytes, 44),
    jewelry: readI16(bytes, 46),
    rawBytes: Array.from(bytes),
    authored: false
  });
}

function treasureRow({ itemIds, exp, gold, gems, jewelry }) {
  const output = new Uint8Array(48);
  setI16Array(output, 0, itemIds, 20);
  setI16(output, 40, exp);
  setI16(output, 42, gold);
  setI16(output, 44, gems);
  setI16(output, 46, jewelry);
  return output;
}

function shopRecord(id, overrides = {}) {
  return {
    id,
    itemIds: new Array(1000).fill(0),
    quantities: new Array(1000).fill(0),
    inflation: 0,
    authored: true,
    provenance: { sourceFile: "Data SD", recordIndex: id, byteOffset: id * 3002, byteLength: 3002, confidence: "fixture-backed" },
    ...overrides
  };
}

function shopRecordFromRaw(id, bytes) {
  return shopRecord(id, {
    itemIds: Array.from({ length: 1000 }, (_, slot) => readI16(bytes, slot * 2)),
    quantities: Array.from(bytes.slice(2000, 3000)),
    inflation: readI16(bytes, 3000),
    rawBytes: Array.from(bytes),
    authored: false
  });
}

function shopRow({ itemIds, quantities, inflation }) {
  const output = new Uint8Array(3002);
  setI16Array(output, 0, itemIds, 1000);
  for (let slot = 0; slot < 1000; slot += 1) output[2000 + slot] = (quantities[slot] ?? 0) & 0xff;
  setI16(output, 3000, inflation);
  return output;
}

function spellRecord(id, overrides = {}) {
  return {
    id,
    range1: 0,
    range2: 0,
    queueIcon: 0,
    toHitBonus: 0,
    saveBonus: 0,
    fixedTargetNum: 0,
    canRotate: 0,
    saveAdjust: 0,
    cannot: 0,
    resistAdjust: 0,
    cost: 0,
    damage1: 0,
    damage2: 0,
    powerDamage1: 0,
    powerDamage2: 0,
    duration1: 0,
    duration2: 0,
    powerDuration1: 0,
    powerDuration2: 0,
    spellLook1: 0,
    spellLook2: 0,
    sound1: 0,
    sound2: 0,
    targetType: 0,
    size: 0,
    special: 0,
    damageType: 0,
    spellClass: 0,
    inCombat: false,
    inCamp: false,
    displayName: `Custom Spell ${id}`,
    rawBytes: new Array(30).fill(0),
    authored: true,
    ...overrides
  };
}

function spellRow(record) {
  const output = new Uint8Array(30);
  output[0] = record.range1 & 0xff;
  output[1] = record.range2 & 0xff;
  output[2] = record.queueIcon & 0xff;
  output[3] = record.toHitBonus & 0xff;
  output[4] = record.saveBonus & 0xff;
  output[5] = record.fixedTargetNum & 0xff;
  output[6] = record.canRotate & 0xff;
  output[7] = record.saveAdjust & 0xff;
  output[8] = record.cannot & 0xff;
  output[9] = record.resistAdjust & 0xff;
  output[10] = record.cost & 0xff;
  output[11] = record.damage1 & 0xff;
  output[12] = record.damage2 & 0xff;
  output[13] = record.powerDamage1 & 0xff;
  output[14] = record.powerDamage2 & 0xff;
  output[15] = record.duration1 & 0xff;
  output[16] = record.duration2 & 0xff;
  output[17] = record.powerDuration1 & 0xff;
  output[18] = record.powerDuration2 & 0xff;
  output[19] = record.spellLook1 & 0xff;
  output[20] = record.spellLook2 & 0xff;
  output[21] = record.sound1 & 0xff;
  output[22] = record.sound2 & 0xff;
  output[23] = record.targetType & 0xff;
  output[24] = record.size & 0xff;
  output[25] = record.special & 0xff;
  output[26] = record.damageType & 0xff;
  output[27] = record.spellClass & 0xff;
  output[28] = record.inCombat ? 1 : 0;
  output[29] = record.inCamp ? 1 : 0;
  return output;
}

function raceRecord(id, overrides = {}) {
  return {
    id,
    plusMinusToHit: new Array(8).fill(0),
    specialAbility: new Array(14).fill(0),
    drvBonus: new Array(8).fill(0),
    attBonus: new Array(6).fill(0),
    minMax: new Array(12).fill(0),
    conditions: new Array(40).fill(0),
    maxAge: 0,
    doesNotDie: 0,
    baseMove: 0,
    magRes: 0,
    twoHand: 0,
    missile: 0,
    numOfAttacks: new Array(2).fill(0),
    canCaste: new Array(30).fill(0),
    ageRange: Array.from({ length: 5 }, () => new Array(2).fill(0)),
    ageChange: Array.from({ length: 5 }, () => new Array(15).fill(0)),
    canRegenerate: 0,
    defaultIconSet: 0,
    itemTypes: new Array(2).fill(0),
    descriptors: 0,
    rawBytes: new Array(408).fill(0),
    authored: true,
    ...overrides
  };
}

function raceRow(record, rawBytes = new Uint8Array(408)) {
  const output = new Uint8Array(408);
  output.set(rawBytes.slice(0, 408));
  setI16Array(output, 0, record.plusMinusToHit, 8);
  setI16Array(output, 16, record.specialAbility, 14);
  setI16Array(output, 44, record.drvBonus, 8);
  setI16Array(output, 60, record.attBonus, 6);
  setI16Array(output, 72, record.minMax, 12);
  setI16Array(output, 112, record.conditions, 40);
  setI16(output, 192, record.maxAge);
  setI16(output, 194, record.doesNotDie);
  setI16(output, 196, record.baseMove);
  setI16(output, 198, record.magRes);
  setI16(output, 200, record.twoHand);
  setI16(output, 202, record.missile);
  setI16Array(output, 204, record.numOfAttacks, 2);
  setFixedBytes(output, 208, 30, record.canCaste);
  for (let band = 0; band < 5; band += 1) {
    setI16Array(output, 238 + band * 4, record.ageRange[band] ?? [], 2);
    setI8Array(output, 258 + band * 15, record.ageChange[band] ?? [], 15);
  }
  output[333] = record.canRegenerate & 0xff;
  setI16(output, 334, record.defaultIconSet);
  setI32(output, 336, record.itemTypes[0] ?? 0);
  setI32(output, 340, record.itemTypes[1] ?? 0);
  setI16(output, 344, record.descriptors);
  return output;
}

function casteRecord(id, overrides = {}) {
  return {
    id,
    specialAbility: Array.from({ length: 2 }, () => new Array(14).fill(0)),
    drvBonus: new Array(8).fill(0),
    attBonus: new Array(6).fill(0),
    spellcasters: Array.from({ length: 4 }, () => new Array(3).fill(0)),
    minMax: new Array(12).fill(0),
    conditions: new Array(40).fill(0),
    canUseMissile: 0,
    getsMissileBonus: 0,
    stamina: new Array(2).fill(0),
    strength: new Array(2).fill(0),
    dodge: new Array(2).fill(0),
    toHit: new Array(2).fill(0),
    missile: new Array(2).fill(0),
    hand2Hand: new Array(2).fill(0),
    casteClass: 0,
    minimumAgeGroup: 0,
    moveBonus: 0,
    magRes: 0,
    twoHand: 0,
    maxStaminaBonus: 0,
    bonusAttacks: 0,
    maxAttacks: 0,
    victory: new Array(30).fill(0),
    startMoney: 0,
    startItems: new Array(20).fill(0),
    attacks: new Array(10).fill(0),
    itemTypes: new Array(2).fill(0),
    defaultIcon: 0,
    maxSpellsAttacks: 0,
    spellsSoFar: 0,
    rawBytes: new Array(576).fill(0),
    authored: true,
    ...overrides
  };
}

function casteRow(record, rawBytes = new Uint8Array(576)) {
  const output = new Uint8Array(576);
  output.set(rawBytes.slice(0, 576));
  setI16Array(output, 0, record.specialAbility[0] ?? [], 14);
  setI16Array(output, 28, record.specialAbility[1] ?? [], 14);
  setI16Array(output, 56, record.drvBonus, 8);
  setI16Array(output, 72, record.attBonus, 6);
  for (let row = 0; row < 4; row += 1) setI16Array(output, 84 + row * 6, record.spellcasters[row] ?? [], 3);
  setI16Array(output, 108, record.minMax, 12);
  setI16Array(output, 132, record.conditions, 40);
  setI16(output, 212, record.canUseMissile);
  setI16(output, 214, record.getsMissileBonus);
  setI16Array(output, 216, record.stamina, 2);
  setI16Array(output, 220, record.strength, 2);
  setI16Array(output, 224, record.dodge, 2);
  setI16Array(output, 228, record.toHit, 2);
  setI16Array(output, 232, record.missile, 2);
  setI16Array(output, 236, record.hand2Hand, 2);
  setI16(output, 248, record.casteClass);
  setI16(output, 250, record.minimumAgeGroup);
  setI16(output, 252, record.moveBonus);
  setI16(output, 254, record.magRes);
  setI16(output, 256, record.twoHand);
  setI16(output, 258, record.maxStaminaBonus);
  setI16(output, 260, record.bonusAttacks);
  setI16(output, 262, record.maxAttacks);
  setI32Array(output, 264, record.victory, 30);
  setI16(output, 384, record.startMoney);
  setI16Array(output, 386, record.startItems, 20);
  setFixedBytes(output, 426, 10, record.attacks);
  setI32(output, 436, record.itemTypes[0] ?? 0);
  setI32(output, 440, record.itemTypes[1] ?? 0);
  setI16(output, 444, record.defaultIcon);
  setI16(output, 446, record.maxSpellsAttacks);
  setI16(output, 448, record.spellsSoFar);
  return output;
}

function simpleEncounterRecord(id, overrides = {}) {
  return {
    id,
    actions: [],
    choiceResults: new Array(4).fill(0),
    canBackOut: false,
    maxTimes: 0,
    casteSuccess: 0,
    prompt: 0,
    texts: new Array(4).fill(""),
    rawBytes: new Array(426).fill(0),
    authored: true,
    ...overrides
  };
}

function simpleEncounterRow(record, rawBytes = new Uint8Array(426)) {
  const output = new Uint8Array(426);
  output.set(rawBytes.slice(0, 426));
  setEncounterActions(output, record.actions);
  for (let slot = 0; slot < 4; slot += 1) {
    output[96 + slot] = (record.choiceResults[slot] ?? 0) & 0xff;
    setPascalText(output.subarray(106 + slot * 80, 106 + slot * 80 + 80), record.texts[slot] ?? "");
  }
  output[100] = record.canBackOut ? 1 : 0;
  output[101] = record.maxTimes & 0xff;
  output[102] = record.casteSuccess & 0xff;
  setI16(output, 104, record.prompt);
  return output;
}

function complexEncounterRecord(id, overrides = {}) {
  return {
    id,
    actions: [],
    actionResult: 0,
    wordResult: 0,
    groups: new Array(8).fill(0),
    spellIds: new Array(10).fill(0),
    spellResults: new Array(10).fill(0),
    itemIds: new Array(5).fill(0),
    itemResults: new Array(5).fill(0),
    choiceResults: new Array(4).fill(0),
    wordResults: new Array(4).fill(0),
    canBackOut: false,
    thief: false,
    maxTimes: 0,
    casteSuccess: 0,
    thiefSuccess: 0,
    thiefFail: 0,
    prompt: 0,
    texts: new Array(9).fill(""),
    rawBytes: new Array(520).fill(0),
    authored: true,
    ...overrides
  };
}

function complexEncounterRow(record, rawBytes = new Uint8Array(520)) {
  const output = new Uint8Array(520);
  output.set(rawBytes.slice(0, 520));
  setEncounterActions(output, record.actions);
  output[96] = fallbackI8(record.actionResult, record.choiceResults, 0) & 0xff;
  output[97] = fallbackI8(record.wordResult, record.wordResults, 0) & 0xff;
  setI8Array(output, 98, record.groups, 8);
  setI16Array(output, 106, record.spellIds, 10);
  setI8Array(output, 126, record.spellResults, 10);
  setI16Array(output, 136, record.itemIds, 5);
  setI8Array(output, 146, record.itemResults, 5);
  output[151] = record.canBackOut ? 1 : 0;
  output[152] = record.thief ? 1 : 0;
  output[153] = record.maxTimes & 0xff;
  output[154] = record.casteSuccess & 0xff;
  output[155] = record.thiefSuccess & 0xff;
  output[156] = record.thiefFail & 0xff;
  setI16(output, 158, record.prompt);
  for (let slot = 0; slot < 9; slot += 1) {
    setPascalText(output.subarray(160 + slot * 40, 160 + slot * 40 + 40), record.texts[slot] ?? "");
  }
  return output;
}

function thiefEncounterRecord(id, overrides = {}) {
  return {
    id,
    typeFlags: new Array(10).fill(false),
    modifiers: new Array(8).fill(0),
    successCodes: new Array(8).fill(0),
    failureCodes: new Array(8).fill(0),
    successText: new Array(8).fill(0),
    failureText: new Array(8).fill(0),
    successSounds: new Array(8).fill(0),
    failureSounds: new Array(8).fill(0),
    spell: 0,
    lowDamage: 0,
    highDamage: 0,
    tumblers: 0,
    prompts: new Array(3).fill(0),
    promptSounds: new Array(3).fill(0),
    rawBytes: new Array(118).fill(0),
    authored: true,
    ...overrides
  };
}

function thiefEncounterRow(record) {
  const output = new Uint8Array(118);
  for (let slot = 0; slot < 10; slot += 1) output[slot] = record.typeFlags[slot] ? 1 : 0;
  setI8Array(output, 10, record.modifiers, 8);
  setI8Array(output, 18, record.successCodes, 8);
  setI8Array(output, 26, record.failureCodes, 8);
  setI16Array(output, 34, record.successText, 8);
  setI16Array(output, 50, record.failureText, 8);
  setI16Array(output, 66, record.successSounds, 8);
  setI16Array(output, 82, record.failureSounds, 8);
  setI16(output, 98, record.spell);
  setI16(output, 100, record.lowDamage);
  setI16(output, 102, record.highDamage);
  setI16(output, 104, record.tumblers);
  setI16Array(output, 106, record.prompts, 3);
  setI16Array(output, 112, record.promptSounds, 3);
  return output;
}

function timedEncounterRecord(id, overrides = {}) {
  return {
    id,
    day: 0,
    increment: 0,
    percent: 0,
    door: 0,
    requiredLevel: 0,
    requiredRandomRect: 0,
    requiredX: 0,
    requiredY: 0,
    requiredItem: 0,
    requiredQuest: 0,
    locationKind: "any",
    stuff: new Array(10).fill(0),
    rawBytes: new Array(40).fill(0),
    authored: true,
    ...overrides
  };
}

function timedEncounterRow(record) {
  const output = new Uint8Array(40);
  setI16(output, 0, record.day);
  setI16(output, 2, record.increment);
  setI16(output, 4, record.percent);
  setI16(output, 6, record.door);
  setI16(output, 8, record.requiredLevel);
  setI16(output, 10, record.requiredRandomRect);
  setI16(output, 12, record.requiredX);
  setI16(output, 14, record.requiredY);
  setI16(output, 16, record.requiredItem);
  setI16(output, 18, record.requiredQuest);
  setI16Array(output, 20, record.stuff, 10);
  return output;
}

function setEncounterActions(output, actions) {
  output.fill(0, 0, 96);
  for (const action of actions) {
    output[action.slot] = action.rawCode & 0xff;
    setI16(output, 32 + action.slot * 2, action.id);
  }
}

function setPascalText(target, text) {
  target.fill(0);
  const bytes = new Uint8Array([...text].map((char) => char.charCodeAt(0)));
  target[0] = bytes.byteLength;
  target.set(bytes, 1);
}

function fallbackI8(value, values, index) {
  return value !== 0 ? value : values[index] ?? 0;
}

function setI8Array(output, offset, values, count) {
  for (let index = 0; index < count; index += 1) output[offset + index] = (values[index] ?? 0) & 0xff;
}

function setI16Array(output, offset, values, count) {
  for (let index = 0; index < count; index += 1) setI16(output, offset + index * 2, values[index] ?? 0);
}

function setI32Array(output, offset, values, count) {
  for (let index = 0; index < count; index += 1) setI32(output, offset + index * 4, values[index] ?? 0);
}

function setFixedBytes(output, offset, count, values) {
  output.fill(0, offset, offset + count);
  for (let index = 0; index < count; index += 1) output[offset + index] = (values[index] ?? 0) & 0xff;
}

function setI16(output, offset, value) {
  const normalized = value < 0 ? value + 0x10000 : value;
  output[offset] = (normalized >> 8) & 0xff;
  output[offset + 1] = normalized & 0xff;
}

function setI32(output, offset, value) {
  const normalized = value < 0 ? value + 0x100000000 : value;
  output[offset] = (normalized >>> 24) & 0xff;
  output[offset + 1] = (normalized >>> 16) & 0xff;
  output[offset + 2] = (normalized >>> 8) & 0xff;
  output[offset + 3] = normalized & 0xff;
}

function signedByte(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function readI16(bytes, offset) {
  const unsigned = ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function readI32(bytes, offset) {
  const unsigned = ((bytes[offset] & 0xff) << 24) | ((bytes[offset + 1] & 0xff) << 16) | ((bytes[offset + 2] & 0xff) << 8) | (bytes[offset + 3] & 0xff);
  return unsigned | 0;
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
    schemaVersion: 5,
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
      origin: "imported",
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
