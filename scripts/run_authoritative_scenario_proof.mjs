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
const manifestPolicyPath = path.join(repoRoot, "schemas", "realmz-native-manifest-policy.json");
const proofRoot = path.join(repoRoot, "tmp", "authoritative-scenario-proof");
const buildRoot = path.join(proofRoot, "compiler-build");
const projectDir = path.join(proofRoot, "Providence Ownership Proof.providence");
const windowsOutputA = path.join(proofRoot, "native-windows-a", "Providence Ownership Proof");
const windowsOutputB = path.join(proofRoot, "native-windows-b", "Providence Ownership Proof");
const classicOutputA = path.join(proofRoot, "native-classic-a", "Providence Ownership Proof");
const classicOutputB = path.join(proofRoot, "native-classic-b", "Providence Ownership Proof");
const remakeOutputA = path.join(proofRoot, "remake-classic-a");
const remakeOutputB = path.join(proofRoot, "remake-classic-b");
const browserWindowsOutput = path.join(proofRoot, "browser-native-windows", "Providence Ownership Proof");
const browserClassicOutput = path.join(proofRoot, "browser-native-classic", "Providence Ownership Proof");
const reimportDir = path.join(proofRoot, "reimported.providence");
const reimportSemanticSchemaPath = path.join(proofRoot, "reimported-semantic-schema.json");
const scenarioName = "Providence Ownership Proof";

await fs.rm(proofRoot, { recursive: true, force: true });
await fs.mkdir(buildRoot, { recursive: true });
await bundleScenarioCompiler();

const requireFromBuild = createRequire(path.join(buildRoot, "proof.cjs"));
const { createProjectFromScenarioSeed } = requireFromBuild("./scenarioSeed.cjs");
const { createBrowserScenarioPackageZip } = requireFromBuild("./scenarioPackage.cjs");
const { validateBrowserProject } = requireFromBuild("./browserProject.cjs");
const { MINIMUM_SCENARIO_RESOURCE_FORK_BYTES, parseResourceFork } = requireFromBuild("./resourceFork.cjs");
const { encodePictResource } = requireFromBuild("./pictWriter.cjs");
const { decodePictPreviewImageForTest } = requireFromBuild("./resourcePreview.cjs");
const { replaceCustomLandlookAtlas } = requireFromBuild("./assetCommands.cjs");
const { readStoredZip } = requireFromBuild("./zip.cjs");
const seed = JSON.parse(await fs.readFile(fixturePath, "utf8"));
const manifestPolicy = JSON.parse(await fs.readFile(manifestPolicyPath, "utf8"));
const result = createProjectFromScenarioSeed(seed, {
  now: "2026-07-18T00:00:00.000Z",
  appVersion: "authoritative-scenario-proof"
});

expect(result.ok, `Scenario JSON compilation failed: ${result.ok ? "" : result.errors.join("; ")}`);
const project = result.project;
project.maps[0].render = {
  ...project.maps[0].render,
  tilesetId: "landlook-6",
  landlook: 6
};
project.randomLevels[0].landlook = 6;
project.maps[0].tiles[project.maps[0].tiles.length - 1] = -100;
project.tileAttributes.push({
  tile: 190,
  landlook: null,
  solidType: 2,
  movementSoundId: null,
  movementCost: null,
  editableScope: "special-tile",
  flags: ["solid"],
  confidence: "source-backed",
  sourceKind: "data-solids",
  source: "Data Solids"
});
const landLayoutCells = new Array(8 * 16).fill(0);
landLayoutCells[0] = -1;
landLayoutCells[127] = 202;
project.landLayout = {
  rows: 8,
  cols: 16,
  cells: landLayoutCells,
  authored: true,
  provenance: null
};
project.mapRecords = [{
  id: 0,
  markers: [
    { iconId: -100, x: 11, y: 12 },
    ...Array.from({ length: 9 }, () => ({ iconId: 0, x: 0, y: 0 }))
  ],
  startX: 10,
  startY: 12,
  level: 0,
  pictId: 306,
  iconSize: 32,
  show: 1,
  isDungeon: false,
  rect: { top: 0, left: 0, bottom: 90, right: 90 },
  note: "Providence owns this map record.",
  name: "Providence Map",
  primaryName: "Providence Map",
  secondaryName: "Unknown Providence Map",
  mapNameAuthored: false,
  authored: true,
  provenance: {
    sourceFile: "Data MD2",
    recordIndex: 0,
    byteOffset: 0,
    byteLength: 340,
    confidence: "fixture-backed"
  }
}];
const customLandlookRecords = Array.from({ length: 201 }, (_, tile) => ({
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
  combatBuild: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  clearLandId: 0
}));
customLandlookRecords[5] = {
  ...customLandlookRecords[5],
  sound: 321,
  time: 2,
  isPath: 1,
  clearLandId: 156
};
project.customLandlooks = [{
  landlook: 6,
  sourceFile: "Data Custom 1 BD",
  records: customLandlookRecords,
  baseTile: 156,
  baseScale: 1,
  rangeSlots: Array.from({ length: 10 }, (_, slot) => ({
    slot,
    label: ["Mountain range", "Open range", "Rubble range", "House range"][slot] ?? "Reserved range",
    firstTile: slot === 0 ? 62 : 0,
    lastTile: slot === 0 ? 85 : 0
  })),
  writerGate: {
    metadataWriterStatus: "writer-safe-fixture-gated",
    atlasWriterStatus: "writable-by-generated-pict-replacement",
    writableFields: ["sound", "time", "solid", "shore", "needBoat", "isPath", "los", "flyFloat", "forest", "clearLandId", "combatBuild", "baseTile", "baseScale", "rangeSlot.firstTile", "rangeSlot.lastTile"],
    preserveOnlyFields: ["spare", "rangeSlot.reserved"],
    evidence: ["docs/format-evidence-cards/custom-landlook-writers.md", "docs/generated/custom-landlook-coverage.json"]
  },
  authored: true
}];
const customLandlookRgba = createCustomLandlookAtlasPixels();
const customLandlookPict = encodePictResource(customLandlookRgba, 640, 320);
const customLandlookBmp = encodeBmp(customLandlookRgba, 640, 320);
const customLandlookSourceDataUrl = `data:image/bmp;base64,${Buffer.from(customLandlookBmp).toString("base64")}`;
const customLandlookResourceDataUrl = `data:application/octet-stream;base64,${Buffer.from(customLandlookPict).toString("base64")}`;
const atlasProject = replaceCustomLandlookAtlas(project, {
  kind: "replaceCustomLandlookAtlas",
  label: "Author Custom 1 atlas",
  landlook: 6,
  asset: {
    id: "asset:custom-landlook-atlas:6:ownership-proof",
    label: "Custom 1 Landlook Atlas",
    kind: "picture",
    resourceType: "PICT",
    resourceId: 306,
    fileName: "custom-landlook-6-atlas.bmp",
    originalPath: customLandlookSourceDataUrl,
    previewPath: "",
    resourcePath: customLandlookResourceDataUrl,
    mimeType: "image/bmp",
    bytes: customLandlookBmp.byteLength,
    sha256: createHash("sha256").update(customLandlookBmp).digest("hex"),
    width: 640,
    height: 320,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    libraryScope: "scenario",
    provenance: "Providence ownership proof normalized atlas pixels",
    linkedEntity: "landlook:6",
    conversion: {
      target: "custom-landlook-atlas",
      fitMode: "stretch",
      scaleMode: "crisp",
      matte: "white",
      paletteMode: "adaptive-256",
      ditherMode: "none",
      sourceWidth: 640,
      sourceHeight: 320,
      finalWidth: 640,
      finalHeight: 320,
      warnings: []
    }
  }
});
project.assets = atlasProject.assets;
project.assetCatalog = atlasProject.assetCatalog;
const customIconCicn = encodeCicnResource();
const customSoundSnd = encodeSndResource();
const scrollingText = Buffer.from("Providence owns this scrolling TEXT resource.\r", "ascii");
const scrollingTextStyl = encodeStylResource();
project.assets.push(
  createManagedResourceAsset({
    id: "asset:special-land-tile:-100:ownership-proof",
    label: "Providence Special Land Tile",
    kind: "special-land-tile",
    resourceType: "cicn",
    resourceId: -100,
    fileName: "special-land-tile--100.cicn",
    resourceBytes: customIconCicn,
    mimeType: "image/cicn",
    width: 32,
    height: 32,
    linkedEntity: "resource:cicn:-100"
  }),
  createManagedResourceAsset({
    id: "asset:sound:321:ownership-proof",
    label: "Providence Movement Sound",
    kind: "sound",
    resourceType: "snd ",
    resourceId: 321,
    fileName: "movement-sound-321.snd",
    resourceBytes: customSoundSnd,
    mimeType: "audio/x-mac-snd",
    durationMs: 23,
    sampleRate: 11025,
    channels: 1,
    linkedEntity: "resource:snd:321"
  }),
  createManagedResourceAsset({
    id: "asset:text:-200:ownership-proof",
    label: "Providence Scrolling Text",
    kind: "text",
    resourceType: "TEXT",
    resourceId: -200,
    fileName: "scrolling-text--200.txt",
    resourceBytes: scrollingText,
    mimeType: "text/plain",
    linkedEntity: "resource:TEXT:-200"
  }),
  createManagedResourceAsset({
    id: "asset:styl:-200:ownership-proof",
    label: "Providence Scrolling Text Style",
    kind: "text",
    resourceType: "styl",
    resourceId: -200,
    fileName: "scrolling-text--200.styl",
    resourceBytes: scrollingTextStyl,
    mimeType: "application/octet-stream",
    linkedEntity: "resource:styl:-200"
  })
);
project.validation.exportableFiles = [...new Set([...project.validation.exportableFiles, "Layout", "Data Custom 1 BD"])];
project.validation = validateBrowserProject(project);
expect(project.validation.ok, `Canonical project validation failed: ${project.validation.errors.join("; ")}`);
assertManagedResourceValidation(project);
assertOwnershipScenarioMetadata(project, "Canonical project", true);
assertOwnershipGlobalMacros(project, "Canonical project", true);
assertOwnershipTileSolids(project, "Canonical project", false);
assertOwnershipLandLayout(project, "Canonical project");
assertOwnershipMapRecord(project.mapRecords, "Canonical project");
assertOwnershipCustomLandlook(project, "Canonical project", true);
assertOwnershipCustomLandlookAtlas(project, "Canonical project");
assertOwnershipManagedResources(project, "Canonical project");
assertOwnershipDungeon(project, "Canonical project");
expect(project.maps[0].render.landlook === 6 && project.maps[0].render.tilesetId === "landlook-6", "Canonical map must select Custom 1");
expect(project.randomLevels[0].landlook === 6, "Canonical random-level record must select Custom 1");
expect(project.maps.length === 2, `Expected one land map and one dungeon map, found ${project.maps.length}`);
expect(project.triggers.length === 3, `Expected two map Action Points and one Extra Action Point, found ${project.triggers.length}`);
expect(project.triggers.every((record) => !("rawBytes" in record)), "Fresh canonical Action Points must not carry compatibility bytes");
expect(project.extracodes.length === 1, `Expected one EDCD settings row, found ${project.extracodes.length}`);
expect(project.extracodes[0].id === 0 && project.extracodes[0].values.join(",") === "25,0,0,0,0", "Fresh canonical EDCD settings have the wrong semantic values");
expect(project.extracodes.every((record) => !("rawBytes" in record)), "Fresh canonical EDCD settings must not carry compatibility bytes");
expect(project.messages.length === 2, `Expected two messages, found ${project.messages.length}`);
assertOwnershipMessage(project.messages, "Canonical project");
assertOwnershipOptionLabels(project.optionLabels, "Canonical project");
assertOwnershipSimpleEncounter(project.simpleEncounters, "Canonical project");
assertOwnershipComplexEncounter(project.complexEncounters, "Canonical project");
assertOwnershipThiefEncounter(project.thiefEncounters, "Canonical project");
assertOwnershipTimedEncounter(project.timedEncounters, "Canonical project");
expect(project.timedEncounters.every((record) => !Object.hasOwn(record, "rawBytes") && !Object.hasOwn(record, "reservedWords")), "Fresh canonical timed encounters must not expose compatibility fields");
assertOwnershipBattle(project.battles, "Canonical project");
assertOwnershipMonster(project.monsters, project.monsterSets, project.monsterDescriptions, "Canonical project");
assertOwnershipScenarioItem(project.scenarioItems, "Canonical project");
assertOwnershipTreasure(project.treasures, "Canonical project");
assertOwnershipShop(project.shops, "Canonical project");
expect(project.itemTexts.length === 1, `Expected one item-text record, found ${project.itemTexts.length}`);
assertOwnershipItemText(project.itemTexts, "Canonical project");
expect(project.spellOverrides.length === 1, `Expected one custom spell, found ${project.spellOverrides.length}`);
assertOwnershipSpell(project.spellOverrides, "Canonical project");
expect(project.raceOverrides.length === 1, `Expected one race override, found ${project.raceOverrides.length}`);
expect(project.casteOverrides.length === 1, `Expected one caste override, found ${project.casteOverrides.length}`);
assertOwnershipRules(project, "Canonical project", true);
assertNoFreshRuleCompatibilityBytes(project, "Canonical project");
expect(project.schemaVersion === 6, `Canonical project must use schema v6, found v${project.schemaVersion}`);
expect(project.remakeRuntime.recommendedGameplayProfile === "core.classic", "Canonical project must recommend the Classic gameplay profile");
expect(project.remakeRuntime.requiredExtensions.length === 0, "Ordinary Classic projects must not require Remake extensions");
expect(project.remakeRuntime.semanticActions.length === 0, "Ordinary Classic projects must not gain semantic actions");
expect(project.source.origin === "authored", `Fresh canonical project must declare authored origin, found ${project.source.origin}`);
expect(project.source.files.length === 0, "Fresh canonical project must not inventory source files");
expect(project.source.immutable === false, "Fresh canonical project must not be immutable");
const questAction = project.triggers.flatMap((trigger) => trigger.actions).find((action) => action.rawCode === 47);
expect(questAction?.id === 1, `First authored quest flag must be runtime-valid ID 1, found ${questAction?.id}`);

project.scenario.projectPath = projectDir;
project.source.rawSourcesDir = "";
await fs.mkdir(path.join(projectDir, "assets"), { recursive: true });
const canonicalProjectJson = `${JSON.stringify(project, null, 2)}\n`;
await fs.writeFile(path.join(projectDir, "project.json"), canonicalProjectJson);
await assertNoRawSources("after canonical project creation");

await runCargoExample("export_project_fixture", [projectDir, windowsOutputA, "windows-realmz-folder"]);
await assertNoRawSources("after first Windows export");
const poisonedProject = JSON.parse(canonicalProjectJson);
poisonedProject.landLayout.trailingBytes = [0xde, 0xad, 0xbe, 0xef];
poisonedProject.messages[0].rawBytes = new Array(256).fill(0xa5);
poisonedProject.optionLabels[0].rawBytes = new Array(25).fill(0xa5);
poisonedProject.battles[0].rawBytes = new Array(346).fill(0xa5);
poisonedProject.monsters[0].rawBytes = new Array(210).fill(0xa5);
for (const set of poisonedProject.monsterSets) set.monsters[0].rawBytes = new Array(210).fill(0xa5);
poisonedProject.monsterDescriptions[0].rawBytes = new Array(256).fill(0xa5);
poisonedProject.simpleEncounters[0].rawBytes = new Array(426).fill(0xa5);
poisonedProject.complexEncounters[0].rawBytes = new Array(520).fill(0xa5);
poisonedProject.thiefEncounters[0].rawBytes = new Array(118).fill(0xa5);
poisonedProject.spellOverrides[0].rawBytes = new Array(30).fill(0xa5);
poisonedProject.raceOverrides[0].rawBytes = new Array(408).fill(0xa5);
poisonedProject.raceOverrides[0].spare = new Array(8).fill(0x1234);
poisonedProject.raceOverrides[0].spacer = new Array(31).fill(0x2345);
poisonedProject.casteOverrides[0].rawBytes = new Array(576).fill(0xa5);
poisonedProject.casteOverrides[0].spare1 = new Array(2).fill(0x3456);
poisonedProject.casteOverrides[0].spare2 = new Array(2).fill(0x4567);
poisonedProject.casteOverrides[0].spacer = new Array(63).fill(0x5678);
const poisonedTileAttribute = poisonedProject.tileAttributes.find((profile) => profile.tile === 190);
poisonedTileAttribute.rawByte = 0xa5;
poisonedTileAttribute.spare = 0x1234;
const poisonedLandlook = poisonedProject.customLandlooks[0];
poisonedLandlook.rawBytes = new Array(8107).fill(0xa5);
poisonedLandlook.trailingBytes = [0xca, 0xfe, 0x01];
poisonedLandlook.records[5].spare = 0x1234;
poisonedLandlook.rangeSlots[0].reserved = 0x2345;
poisonedProject.timedEncounters[0].rawBytes = new Array(40).fill(0xa5);
poisonedProject.timedEncounters[0].reservedWords = new Array(9).fill(0x3456);
poisonedProject.mapRecords[0].rawBytes = new Array(340).fill(0xa5);
poisonedProject.scenarioItems[0].rawBytes = new Array(100).fill(0xa5);
poisonedProject.treasures[0].rawBytes = new Array(48).fill(0xa5);
poisonedProject.shops[0].rawBytes = new Array(3002).fill(0xa5);
poisonedProject.scenario.shell.rawBytes = new Array(320).fill(0xd8);
poisonedProject.scenario.shell.trailingBytes = [0xde, 0xad, 0xbe, 0xef];
poisonedProject.scenario.supportFile = {
  sourceFile: "Scenario",
  divinityStringEditorSlot: null,
  divinityStringSoundId: null,
  rawBytes: new Array(600).fill(0xc8),
  authored: false
};
if (poisonedProject.scenario.securityBackup) {
  poisonedProject.scenario.securityBackup.rawBytes = new Array(318).fill(0xe9);
  poisonedProject.scenario.securityBackup.trailingBytes = [0xba, 0xdc];
}
poisonedProject.scenario.contactInfo.rawBytes = new Array(4608).fill(0xa5);
if (poisonedProject.scenario.restrictions) poisonedProject.scenario.restrictions.rawBytes = new Array(320).fill(0xa5);
poisonedProject.scenario.globalMacroHooks.rawBytes = new Array(60).fill(0xa5);
await fs.writeFile(path.join(projectDir, "project.json"), `${JSON.stringify(poisonedProject, null, 2)}\n`);
await runCargoExample("export_project_fixture", [projectDir, windowsOutputB, "windows-realmz-folder"]);
await fs.writeFile(path.join(projectDir, "project.json"), canonicalProjectJson);
await assertNoRawSources("after repeated Windows export");
await runCargoExample("export_project_fixture", [projectDir, classicOutputA, "mac-classic-folder"]);
await assertNoRawSources("after first Classic-Mac export");
await runCargoExample("export_project_fixture", [projectDir, classicOutputB, "mac-classic-folder"]);
await assertNoRawSources("after repeated Classic-Mac export");
await runCargoBinary("realmz-remake-converter", ["--project", projectDir, remakeOutputA]);
await runCargoBinary("realmz-remake-converter", ["--project", projectDir, remakeOutputB]);

const windowsFilesA = await readFlatDirectory(windowsOutputA);
const windowsFilesB = await readFlatDirectory(windowsOutputB);
const classicFilesA = await readFlatDirectory(classicOutputA);
const classicFilesB = await readFlatDirectory(classicOutputB);
const remakeFilesA = await readDirectoryTree(remakeOutputA);
const remakeFilesB = await readDirectoryTree(remakeOutputB);
const browserWindowsPackage = createBrowserScenarioPackageZip(project, null, "windows-realmz-folder");
const browserClassicPackage = createBrowserScenarioPackageZip(project, null, "mac-classic-folder");
const browserPoisonedProject = JSON.parse(JSON.stringify(project));
browserPoisonedProject.landLayout.trailingBytes = [0xde, 0xad, 0xbe, 0xef];
browserPoisonedProject.messages[0].rawBytes = new Array(256).fill(0xa5);
browserPoisonedProject.optionLabels[0].rawBytes = new Array(25).fill(0xa5);
browserPoisonedProject.battles[0].rawBytes = new Array(346).fill(0xa5);
browserPoisonedProject.monsters[0].rawBytes = new Array(210).fill(0xa5);
for (const set of browserPoisonedProject.monsterSets) set.monsters[0].rawBytes = new Array(210).fill(0xa5);
browserPoisonedProject.monsterDescriptions[0].rawBytes = new Array(256).fill(0xa5);
browserPoisonedProject.simpleEncounters[0].rawBytes = new Array(426).fill(0xa5);
browserPoisonedProject.complexEncounters[0].rawBytes = new Array(520).fill(0xa5);
browserPoisonedProject.thiefEncounters[0].rawBytes = new Array(118).fill(0xa5);
browserPoisonedProject.spellOverrides[0].rawBytes = new Array(30).fill(0xa5);
browserPoisonedProject.raceOverrides[0].rawBytes = new Array(408).fill(0xa5);
browserPoisonedProject.raceOverrides[0].spare = new Array(8).fill(0x1234);
browserPoisonedProject.raceOverrides[0].spacer = new Array(31).fill(0x2345);
browserPoisonedProject.casteOverrides[0].rawBytes = new Array(576).fill(0xa5);
browserPoisonedProject.casteOverrides[0].spare1 = new Array(2).fill(0x3456);
browserPoisonedProject.casteOverrides[0].spare2 = new Array(2).fill(0x4567);
browserPoisonedProject.casteOverrides[0].spacer = new Array(63).fill(0x5678);
const browserPoisonedTileAttribute = browserPoisonedProject.tileAttributes.find((profile) => profile.tile === 190);
browserPoisonedTileAttribute.rawByte = 0xa5;
browserPoisonedTileAttribute.spare = 0x1234;
const browserPoisonedLandlook = browserPoisonedProject.customLandlooks[0];
browserPoisonedLandlook.rawBytes = new Array(8107).fill(0xa5);
browserPoisonedLandlook.trailingBytes = [0xca, 0xfe, 0x01];
browserPoisonedLandlook.records[5].spare = 0x1234;
browserPoisonedLandlook.rangeSlots[0].reserved = 0x2345;
browserPoisonedProject.timedEncounters[0].rawBytes = new Array(40).fill(0xa5);
browserPoisonedProject.timedEncounters[0].reservedWords = new Array(9).fill(0x3456);
browserPoisonedProject.mapRecords[0].rawBytes = new Array(340).fill(0xa5);
browserPoisonedProject.scenarioItems[0].rawBytes = new Array(100).fill(0xa5);
browserPoisonedProject.treasures[0].rawBytes = new Array(48).fill(0xa5);
browserPoisonedProject.shops[0].rawBytes = new Array(3002).fill(0xa5);
browserPoisonedProject.scenario.shell.rawBytes = new Array(320).fill(0xd8);
browserPoisonedProject.scenario.shell.trailingBytes = [0xde, 0xad, 0xbe, 0xef];
browserPoisonedProject.scenario.supportFile = {
  sourceFile: "Scenario",
  divinityStringEditorSlot: null,
  divinityStringSoundId: null,
  rawBytes: new Array(600).fill(0xc8),
  authored: false
};
if (browserPoisonedProject.scenario.securityBackup) {
  browserPoisonedProject.scenario.securityBackup.rawBytes = new Array(318).fill(0xe9);
  browserPoisonedProject.scenario.securityBackup.trailingBytes = [0xba, 0xdc];
}
browserPoisonedProject.scenario.contactInfo.rawBytes = new Array(4608).fill(0xa5);
if (browserPoisonedProject.scenario.restrictions) browserPoisonedProject.scenario.restrictions.rawBytes = new Array(320).fill(0xa5);
browserPoisonedProject.scenario.globalMacroHooks.rawBytes = new Array(60).fill(0xa5);
const browserEmbeddedCompatibilityTrapPackage = createBrowserScenarioPackageZip(browserPoisonedProject, null, "windows-realmz-folder");
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
      name: "Data MD2",
      relativePath: "Data MD2",
      originalRelativePath: "Data MD2",
      bytes: 340,
      sha256: "must-not-be-read",
      role: "supported-binary",
      editable: true,
      targetPlatform: "windows-realmz",
      captureConfidence: "captured",
      bytesData: new Uint8Array(340).fill(0xA5)
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
const browserEmbeddedCompatibilityTrapFiles = browserPackageFiles(browserEmbeddedCompatibilityTrapPackage.zip, readStoredZip);
const browserAnnexTrapFiles = browserPackageFiles(browserAnnexTrapPackage.zip, readStoredZip);
assertCompleteNativeFolder(windowsFilesA, "Windows");
assertCompleteNativeFolder(classicFilesA, "Classic Mac");
assertCompleteNativeFolder(browserWindowsFiles, "browser Windows");
assertCompleteNativeFolder(browserClassicFiles, "browser Classic Mac");
assertSharedManifestPathPolicy(windowsFilesA, project, "Windows");
assertSharedManifestPathPolicy(classicFilesA, project, "Classic Mac");
assertSharedManifestPathPolicy(browserWindowsFiles, project, "browser Windows");
assertSharedManifestPathPolicy(browserClassicFiles, project, "browser Classic Mac");
assertCompiledTileSolids(windowsFilesA, "Windows");
assertCompiledTileSolids(classicFilesA, "Classic Mac");
assertCompiledTileSolids(browserWindowsFiles, "browser Windows");
assertCompiledTileSolids(browserClassicFiles, "browser Classic Mac");
assertCompiledLandLayout(windowsFilesA, "Windows");
assertCompiledLandLayout(classicFilesA, "Classic Mac");
assertCompiledLandLayout(browserWindowsFiles, "browser Windows");
assertCompiledLandLayout(browserClassicFiles, "browser Classic Mac");
assertCompiledScenarioRestrictions(windowsFilesA, "Windows");
assertCompiledScenarioRestrictions(classicFilesA, "Classic Mac");
assertCompiledScenarioRestrictions(browserWindowsFiles, "browser Windows");
assertCompiledScenarioRestrictions(browserClassicFiles, "browser Classic Mac");
assertCompiledCustomLandlook(windowsFilesA, "Windows");
assertCompiledCustomLandlook(classicFilesA, "Classic Mac");
assertCompiledCustomLandlook(browserWindowsFiles, "browser Windows");
assertCompiledCustomLandlook(browserClassicFiles, "browser Classic Mac");
assertCompiledCustomLandlookAtlas(windowsFilesA, "Windows");
assertCompiledCustomLandlookAtlas(classicFilesA, "Classic Mac");
assertCompiledCustomLandlookAtlas(browserWindowsFiles, "browser Windows");
assertCompiledCustomLandlookAtlas(browserClassicFiles, "browser Classic Mac");
assertCompiledManagedResources(windowsFilesA, "Windows");
assertCompiledManagedResources(classicFilesA, "Classic Mac");
assertCompiledManagedResources(browserWindowsFiles, "browser Windows");
assertCompiledManagedResources(browserClassicFiles, "browser Classic Mac");
assertManifestNamesEqual(project.validation.exportableFiles, browserWindowsFiles, "Browser validation manifest");
assertFileMapsEqual(windowsFilesA, windowsFilesB, "repeated Windows compile");
assertFileMapsEqual(classicFilesA, classicFilesB, "repeated Classic-Mac compile");
assertFileMapsEqual(remakeFilesA, remakeFilesB, "repeated Remake compatibility export");
assertRemakeCompatibilityBundle(remakeFilesA, project);
assertFileMapsEqual(windowsFilesA, browserWindowsFiles, "Rust/browser Windows compile");
assertFileMapsEqual(classicFilesA, browserClassicFiles, "Rust/browser Classic-Mac compile");
assertFileMapsEqual(browserWindowsFiles, browserEmbeddedCompatibilityTrapFiles, "authored browser embedded-compatibility access guard");
assertFileMapsEqual(browserWindowsFiles, browserAnnexTrapFiles, "authored browser annex access guard");
expect(browserWindowsPackage.report.passThroughFiles.length === 0, "Browser Windows authored compile must not pass through compatibility files");
expect(browserClassicPackage.report.passThroughFiles.length === 0, "Browser Classic-Mac authored compile must not pass through compatibility files");
expect(browserEmbeddedCompatibilityTrapPackage.report.passThroughFiles.length === 0, "Authored browser compile must ignore embedded custom-landlook compatibility bytes");
expect(browserAnnexTrapPackage.report.passThroughFiles.length === 0, "Authored browser compile must ignore a supplied compatibility snapshot");
await writeFlatDirectory(browserWindowsOutput, browserWindowsFiles);
await writeFlatDirectory(browserClassicOutput, browserClassicFiles);

await runCargoExample("import_scenario_project", [windowsOutputA, reimportDir, `${scenarioName} Reimported`]);
await runCargoExample("project_semantic_schema", [reimportDir, reimportSemanticSchemaPath]);
const reimported = JSON.parse(await fs.readFile(path.join(reimportDir, "project.json"), "utf8"));
const reimportedSemanticSchema = JSON.parse(await fs.readFile(reimportSemanticSchemaPath, "utf8"));
expect(reimported.source.immutable === true, "Reimported native output should be a preserved legacy snapshot");
expect(reimported.source.files.length > 0, "Reimported native output should inventory compatibility files");
expect(await isDirectory(path.join(reimportDir, "raw-sources")), "Reimport should create a bounded compatibility annex");
expect(!("reservedWords" in (reimportedSemanticSchema.entities?.find((entity) => entity.id === "time:0")?.summary ?? {})), "Reimport semantic summary must not expose timed compatibility words");
expect(reimported.maps.filter((map) => map.levelType === "land").length === 1, "Reimport should recover one land map");
expect(reimported.maps.filter((map) => map.levelType === "dungeon").length === 1, "Reimport should recover one dungeon map");
assertOwnershipDungeon(reimported, "Reimport");
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
assertOwnershipMonster(reimported.monsters, reimported.monsterSets, reimported.monsterDescriptions, "Reimport");
assertOwnershipScenarioItem(reimported.scenarioItems, "Reimport");
assertOwnershipItemText(reimported.itemTexts, "Reimport");
assertOwnershipTreasure(reimported.treasures, "Reimport");
assertOwnershipShop(reimported.shops, "Reimport");
assertOwnershipSpell(reimported.spellOverrides, "Reimport");
assertOwnershipRules(reimported, "Reimport", false);
assertOwnershipScenarioMetadata(reimported, "Reimport", false);
assertOwnershipGlobalMacros(reimported, "Reimport", false);
assertOwnershipTileSolids(reimported, "Reimport", true);
assertOwnershipLandLayout(reimported, "Reimport");
assertOwnershipMapRecord(reimported.mapRecords, "Reimport");
assertOwnershipCustomLandlook(reimported, "Reimport", false);
await assertReimportedCustomLandlookAtlas(reimported, "Reimport");
await assertReimportedManagedResources(reimported, reimportedSemanticSchema, "Reimport");

const summary = {
  proofVersion: 3,
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
    authoredSpecialTileSolidityRows: project.tileAttributes.filter((profile) => profile.sourceKind === "data-solids").length,
    authoredLandLayoutCells: project.landLayout?.cells.length ?? 0,
    authoredCustomLandlooks: project.customLandlooks?.length ?? 0,
    authoredCustomLandlookAtlases: project.assets.filter((asset) => asset.conversion?.target === "custom-landlook-atlas").length,
    authoredManagedResources: project.assets.length,
    globalMacroHooks: project.scenario.globalMacroHooks?.slots.filter((slot) => slot.door !== 0).length ?? 0,
    questFlags: project.questLabels.map((quest) => quest.id)
  },
  nativeOutputs: {
    deterministic: true,
    browserDesktopByteParity: true,
    scenarioResourceFork: {
      emptyBaselineBytes: MINIMUM_SCENARIO_RESOURCE_FORK_BYTES,
      resources: 5,
      customLandlookAtlas: { resourceType: "PICT", id: 306, width: 640, height: 320 },
      representativeManagedResources: ["cicn -100", "snd  321", "TEXT -200", "styl -200"],
      builtInRlmzResources: 0
    },
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
  remakeCompatibility: {
    path: relative(remakeOutputA),
    deterministic: true,
    formatVersion: 2,
    packagedManagedResources: project.assets.length,
    manifest: fileManifest(remakeFilesA)
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
    casteOverrideRecovered: true,
    specialTileSolidityRecovered: true,
    landLayoutRecovered: true,
    customLandlookMetadataRecovered: true,
    customLandlookAtlasRecovered: true,
    representativeManagedResourcesRecovered: true,
    dungeonMapRecovered: true,
    dungeonRandomLevelRecovered: true,
    dungeonActionPointRecovered: true
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
console.log(`- Deterministic Remake Classic bundle: ${relative(remakeOutputA)}`);
console.log(`- Proof summary: ${relative(summaryPath)}`);

async function bundleScenarioCompiler() {
  const requireFromRoot = createRequire(path.join(repoRoot, "package.json"));
  const { build } = requireFromRoot("esbuild");
  await build({
    entryPoints: {
      scenarioSeed: path.join(repoRoot, "src", "editor", "scenarioSeed.ts"),
      scenarioPackage: path.join(repoRoot, "src", "editor", "browser", "scenarioPackage.ts"),
      browserProject: path.join(repoRoot, "src", "editor", "browser", "project.ts"),
      resourceFork: path.join(repoRoot, "src", "editor", "browser", "resourceFork.ts"),
      pictWriter: path.join(repoRoot, "src", "editor", "pictWriter.ts"),
      resourcePreview: path.join(repoRoot, "src", "editor", "browser", "resourcePreview.ts"),
      assetCommands: path.join(repoRoot, "src", "editor", "projectCommands", "assetCommands.ts"),
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

async function runCargoBinary(binary, args) {
  const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";
  try {
    await execFileAsync(
      cargo,
      ["run", "--quiet", "--manifest-path", "src-tauri/Cargo.toml", "--bin", binary, "--", ...args],
      { cwd: repoRoot, maxBuffer: 1024 * 1024 * 16 }
    );
  } catch (error) {
    const stdout = error.stdout ? `\n${error.stdout}` : "";
    const stderr = error.stderr ? `\n${error.stderr}` : "";
    throw new Error(`Cargo binary ${binary} failed.${stdout}${stderr}`);
  }
}

async function assertNoRawSources(stage) {
  expect(!await pathExists(path.join(projectDir, "raw-sources")), `Fresh project created raw-sources ${stage}`);
  const savedProject = JSON.parse(await fs.readFile(path.join(projectDir, "project.json"), "utf8"));
  expect(savedProject.source.files.length === 0, `Fresh project gained a source inventory ${stage}`);
  assertOwnershipScenarioMetadata(savedProject, `Rust-saved project ${stage}`, true);
  assertOwnershipGlobalMacros(savedProject, `Rust-saved project ${stage}`, true);
  assertOwnershipTileSolids(savedProject, `Rust-saved project ${stage}`, false);
  assertOwnershipLandLayout(savedProject, `Rust-saved project ${stage}`);
  assertOwnershipMapRecord(savedProject.mapRecords, `Rust-saved project ${stage}`);
  assertOwnershipCustomLandlook(savedProject, `Rust-saved project ${stage}`, true);
  assertOwnershipCustomLandlookAtlas(savedProject, `Rust-saved project ${stage}`);
  assertOwnershipManagedResources(savedProject, `Rust-saved project ${stage}`);
  assertOwnershipDungeon(savedProject, `Rust-saved project ${stage}`);
  assertOwnershipMessage(savedProject.messages, `Rust-saved project ${stage}`);
  assertOwnershipOptionLabels(savedProject.optionLabels, `Rust-saved project ${stage}`);
  assertOwnershipSimpleEncounter(savedProject.simpleEncounters, `Rust-saved project ${stage}`);
  assertOwnershipComplexEncounter(savedProject.complexEncounters, `Rust-saved project ${stage}`);
  assertOwnershipThiefEncounter(savedProject.thiefEncounters, `Rust-saved project ${stage}`);
  assertOwnershipTimedEncounter(savedProject.timedEncounters, `Rust-saved project ${stage}`);
  expect(savedProject.timedEncounters?.every((record) => !Object.hasOwn(record, "rawBytes") && !Object.hasOwn(record, "reservedWords")), `Rust-saved project ${stage} timed encounters expose compatibility fields`);
  assertOwnershipBattle(savedProject.battles, `Rust-saved project ${stage}`);
  assertOwnershipMonster(savedProject.monsters, savedProject.monsterSets, savedProject.monsterDescriptions, `Rust-saved project ${stage}`);
  assertOwnershipScenarioItem(savedProject.scenarioItems, `Rust-saved project ${stage}`);
  assertOwnershipItemText(savedProject.itemTexts, `Rust-saved project ${stage}`);
  assertOwnershipTreasure(savedProject.treasures, `Rust-saved project ${stage}`);
  assertOwnershipShop(savedProject.shops, `Rust-saved project ${stage}`);
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
    ["Data RI", 320],
    ["Global", 60],
    ["Data LD", 90 * 90 * 2],
    ["Data DL", 90 * 90 * 2],
    ["Data RD", 644],
    ["Data RDD", 644],
    ["Data DD", 100 * 40],
    ["Data DDD", 100 * 40],
    ["Data SD2", 2 * 256],
    ["Data OD", 50],
    ["Data ED", 426],
    ["Data ED2", 520],
    ["Data TD2", 2 * 118],
    ["Data TD3", 40],
    ["Data ED3", 3 * 40],
    ["Data EDCD", 10],
    ["Data BD", 346],
    ["Data MD", 2 * 210],
    ["Data MD1", 2 * 210],
    ["Data MD-1", 2 * 210],
    ["Data DES", 2 * 256],
    ["Data NI", 200 * 100],
    ["Data TD", 48],
    ["Data SD", 3002],
    ["Data Spell", 105 * 30],
    ["Data Race", 30 * 408],
    ["Data Caste", 30 * 576],
    ["Data Solids", 1024],
    ["Layout", 256],
    ["Data MD2", 340],
    ["Data Custom 1 BD", 8104]
  ]);
  for (const [name, bytes] of exactSizes) {
    expect(files.has(name), `${label} output is missing ${name}`);
    expect(files.get(name).byteLength === bytes, `${label} ${name} should be ${bytes} bytes, found ${files.get(name).byteLength}`);
  }
  expect(files.has("Scenario.rsrc"), `${label} output is missing Scenario.rsrc`);
  const scenarioResourceFork = files.get("Scenario.rsrc");
  expect(scenarioResourceFork.byteLength > MINIMUM_SCENARIO_RESOURCE_FORK_BYTES, `${label} Scenario.rsrc should extend the canonical empty container with authored managed resources`);
  const scenarioResources = parseResourceFork(scenarioResourceFork);
  expect(scenarioResources.length === 5, `${label} Scenario.rsrc should contain the five authored representative resources`);
  expect(new Set(scenarioResources.map((resource) => `${resource.resourceType}:${resource.id}`)).size === 5, `${label} Scenario.rsrc contains duplicate resource keys`);
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
  const shell = files.get(scenarioName);
  expect(readI32(shell, 0) === 1, `${label} scenario shell has the wrong recommended level`);
  expect(readI32(shell, 4) === 999, `${label} scenario shell has the wrong maximum level`);
  expect(readI32(shell, 8) === 0 && readI32(shell, 12) === 10 && readI32(shell, 16) === 12, `${label} scenario shell has the wrong authored startup position`);
  expect(shell.slice(20).every((byte) => byte === 0), `${label} scenario shell security, creator, and padding bytes are not deterministic zero`);
  expect(Buffer.from(files.get("Data CS")).equals(Buffer.from(shell)), `${label} Data CS should be the deterministic fresh shell security backup`);
  expect(files.get("Scenario").every((byte) => byte === 0), `${label} Scenario support data should be the deterministic neutral 600-byte baseline`);
  const globalHooks = files.get("Global");
  expect(readI16(globalHooks, 0) === 2, `${label} Global has the wrong authored start hook`);
  expect(globalHooks.slice(2).every((byte) => byte === 0), `${label} Global reserved and inactive hooks are not deterministic zero`);
  expect(Buffer.from(files.get("Data SD2")).includes(Buffer.from("Providence owns this scenario.")), `${label} Data SD2 is missing the authored message`);
  expect(Buffer.from(files.get("Data SD2")).includes(Buffer.from("Providence owns this rogue encounter.")), `${label} Data SD2 is missing the authored rogue message`);
  expect(files.get("Data DD").some((byte) => byte !== 0), `${label} Data DD does not contain the authored Action Point`);
  const dungeonMap = files.get("Data DL");
  const dungeonTriggerCellOffset = (5 * 90 + 4) * 2;
  expect(readI16(dungeonMap, 0) === 1 && readI16(dungeonMap, dungeonMap.byteLength - 2) === 1, `${label} Data DL has the wrong deterministic baseline cells`);
  expect(readI16(dungeonMap, dungeonTriggerCellOffset) === 0x1501, `${label} Data DL did not preserve the north/south passage bits and add the Action Point marker`);
  const dungeonRandomLevel = files.get("Data RDD");
  expect(dungeonRandomLevel.slice(0, 521).every((byte) => byte === 0), `${label} Data RDD random-rectangle and landlook fields are not deterministic zero`);
  expect(dungeonRandomLevel[521] === 1 && dungeonRandomLevel[522] === 1, `${label} Data RDD has the wrong authored darkness or line-of-sight flags`);
  expect(dungeonRandomLevel.slice(523).every((byte) => byte === 0), `${label} Data RDD reserved rectangle fields are not deterministic zero`);
  const dungeonDoors = files.get("Data DDD");
  const dungeonDoorOffset = 40;
  expect(dungeonDoors.slice(0, dungeonDoorOffset).every((byte) => byte === 0), `${label} Data DDD unused record 0 is not deterministic zero`);
  expect(readI32(dungeonDoors, dungeonDoorOffset) === 504, `${label} Data DDD has the wrong authored packed coordinate`);
  expect(Buffer.from(dungeonDoors.slice(dungeonDoorOffset + 4, dungeonDoorOffset + 8)).equals(Buffer.from([0, 4, 5, 100])), `${label} Data DDD has the wrong authored level, target, or percent fields`);
  expect(readI16(dungeonDoors, dungeonDoorOffset + 8) === 1 && readI16(dungeonDoors, dungeonDoorOffset + 24) === 0, `${label} Data DDD has the wrong authored message action`);
  expect(dungeonDoors.slice(dungeonDoorOffset + 10, dungeonDoorOffset + 24).every((byte) => byte === 0) && dungeonDoors.slice(dungeonDoorOffset + 26).every((byte) => byte === 0), `${label} Data DDD unused action slots and records are not deterministic zero`);
  const mapRecord = files.get("Data MD2");
  expect(readI16(mapRecord, 0) === -100 && readI16(mapRecord, 2) === 11 && readI16(mapRecord, 4) === 12, `${label} Data MD2 has the wrong authored marker`);
  expect(readI16(mapRecord, 60) === 10 && readI16(mapRecord, 62) === 12 && readI16(mapRecord, 66) === 306, `${label} Data MD2 has the wrong authored display fields`);
  expect(mapRecord[74] === 0 && mapRecord[75] === 0, `${label} Data MD2 compatibility gap is not deterministic zero`);
  expect(Buffer.from(mapRecord).includes(Buffer.from("Providence owns this map record.")), `${label} Data MD2 is missing the authored note`);
  const extraActionPoints = files.get("Data ED3");
  expect(extraActionPoints.slice(0, 2 * 40).every((byte) => byte === 0), `${label} Data ED3 sparse rows are not deterministic zero`);
  expect(extraActionPoints[2 * 40 + 7] === 100 && readI16(extraActionPoints, 2 * 40 + 8) === 1 && readI16(extraActionPoints, 2 * 40 + 24) === 0, `${label} Data ED3 has the wrong authored Extra Action Point`);
  const extraCodes = files.get("Data EDCD");
  expect(readI16(extraCodes, 0) === 25 && extraCodes.slice(2).every((byte) => byte === 0), `${label} Data EDCD has the wrong authored five-word settings row`);
  const scenarioItems = files.get("Data NI");
  const scenarioItemOffset = 101 * 100;
  expect(readI16(scenarioItems, scenarioItemOffset + 2) === 901, `${label} Data NI has the wrong authored item identity`);
  expect(readI16(scenarioItems, scenarioItemOffset + 28) === 1, `${label} Data NI has the wrong authored item cost`);
  expect(scenarioItems.slice(scenarioItemOffset + 56, scenarioItemOffset + 70).every((byte) => byte === 0), `${label} Data NI has non-deterministic semantic spare words`);
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
  for (const sourceFile of ["Data MD1", "Data MD-1"]) {
    const variantFile = files.get(sourceFile);
    expect(variantFile.slice(0, 210).every((byte) => byte === 0), `${label} ${sourceFile} unused record 0 is not deterministic zero`);
    expect(Buffer.from(variantFile.slice(210)).equals(Buffer.from(authoredMonster)), `${label} ${sourceFile} does not match the authored semantic monster variant`);
  }
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

function assertOwnershipDungeon(project, label) {
  const map = project.maps?.find((candidate) => candidate.levelType === "dungeon" && candidate.index === 0);
  expect(map, `${label} is missing canonical dungeon map 0`);
  expect(map.source === "Data DL", `${label} dungeon map has the wrong native source`);
  expect(map.tiles.length === 90 * 90, `${label} dungeon map has the wrong dimensions`);
  expect(map.tiles[0] === 1 && map.tiles.at(-1) === 1, `${label} dungeon map has the wrong deterministic baseline cells`);
  expect(map.tiles[5 * 90 + 4] === 0x1501, `${label} dungeon map did not preserve the north/south passage bits and add the Action Point marker`);

  const randomLevel = project.randomLevels?.find((candidate) => candidate.levelType === "dungeon" && candidate.levelIndex === 0);
  expect(randomLevel, `${label} is missing canonical dungeon random-level metadata`);
  expect(randomLevel.source === "Data RDD", `${label} dungeon random-level metadata has the wrong native source`);
  expect(randomLevel.landlook === 0 && randomLevel.isDark && randomLevel.useLos, `${label} dungeon random-level metadata has the wrong authored flags`);
  expect(randomLevel.rects.length === 0, `${label} dungeon random-level metadata should not invent random rectangles`);

  const trigger = project.triggers?.find((candidate) =>
    candidate.active
    && candidate.levelType === "dungeon"
    && candidate.levelIndex === 0
    && candidate.recordIndex === 1
    && candidate.coordinate?.x === 4
    && candidate.coordinate?.y === 5
  );
  expect(trigger, `${label} is missing the canonical dungeon Action Point`);
  expect(trigger.source === "Data DDD" && trigger.doorid === 504, `${label} dungeon Action Point has the wrong native identity`);
  expect(trigger.percent === 100 && trigger.landid === 0 && trigger.targetX === 4 && trigger.targetY === 5, `${label} dungeon Action Point has the wrong authored target fields`);
  expect(trigger.actions.length === 1 && trigger.actions[0].rawCode === 1 && trigger.actions[0].id === 0, `${label} dungeon Action Point has the wrong authored message action`);
}

function assertOwnershipItemText(records, label) {
  const itemText = records?.find((record) => record.itemId === 901);
  expect(itemText, `${label} is missing item-text record 901`);
  expect(itemText.unidentifiedName === "Unknown Providence Token", `${label} has the wrong unidentified item name`);
  expect(itemText.identifiedName === "Providence Token", `${label} has the wrong identified item name`);
  expect(itemText.description === "This item text was compiled from canonical Providence data.", `${label} has the wrong item description`);
}

function assertOwnershipScenarioItem(records, label) {
  const item = records?.find((record) => record.id === 101 && record.itemId === 901);
  expect(item, `${label} is missing scenario-item record 101 for item 901`);
  expect(item.cost === 1, `${label} scenario item has the wrong canonical cost`);
  expect(item.spare2?.length === 7 && item.spare2.every((value) => value === 0), `${label} scenario item does not own all seven semantic spare words`);
  expect(!Object.hasOwn(item, "rawBytes"), `${label} scenario item exposes compatibility storage`);
}

function assertCompiledTileSolids(files, label) {
  const bytes = files.get("Data Solids");
  expect(bytes?.byteLength === 1024, `${label} Data Solids does not have the exact native table size`);
  expect(bytes[190] === 2, `${label} Data Solids has the wrong canonical solidity for special tile 190`);
  expect(bytes.filter((byte) => byte !== 0).length === 1, `${label} Data Solids has non-neutral unspecified rows`);
}

function assertCompiledLandLayout(files, label) {
  const bytes = files.get("Layout");
  expect(bytes?.byteLength === 256, `${label} Layout does not have the exact native grid size`);
  expect(readI16(bytes, 0) === -1, `${label} Layout has the wrong canonical first cell`);
  expect(readI16(bytes, 254) === 202, `${label} Layout has the wrong canonical final cell`);
  expect(bytes.slice(2, 254).every((byte) => byte === 0), `${label} Layout has non-neutral unspecified cells`);
}

function assertCompiledScenarioRestrictions(files, label) {
  const bytes = files.get("Data RI");
  const description = "Four seasoned adventurers only.";
  expect(bytes?.byteLength === 320, `${label} Data RI does not have the exact native record size`);
  expect(bytes[0] === description.length, `${label} Data RI has the wrong restriction-message length`);
  expect(Buffer.from(bytes.slice(1, 1 + description.length)).toString("ascii") === description, `${label} Data RI has the wrong restriction message`);
  expect(bytes.slice(1 + description.length, 256).every((byte) => byte === 0), `${label} Data RI has non-neutral message padding`);
  expect(readI16(bytes, 256) === 4 && readI16(bytes, 258) === 20, `${label} Data RI has the wrong party limits`);
  expect(bytes[260] === 1 && bytes[289] === 1, `${label} Data RI has the wrong banned-race flags`);
  expect(bytes[291] === 1 && bytes[318] === 1, `${label} Data RI has the wrong banned-caste flags`);
  expect(bytes.slice(260, 320).filter((byte) => byte !== 0).length === 4, `${label} Data RI has non-neutral restriction flags`);
}

function assertOwnershipMessage(records, label) {
  const message = records?.find((record) => record.id === 0);
  const rogueMessage = records?.find((record) => record.id === 1);
  expect(message, `${label} is missing message 0`);
  expect(message.text === "Providence owns this scenario.", `${label} has the wrong canonical message text`);
  expect(rogueMessage?.text === "Providence owns this rogue encounter.", `${label} has the wrong canonical rogue message text`);
  expect(records.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} messages expose compatibility storage`);
}

function assertOwnershipOptionLabels(records, label) {
  const proceed = records?.find((record) => record.id === 0);
  const withdraw = records?.find((record) => record.id === 1);
  expect(proceed?.text === "Proceed", `${label} has the wrong option label 0`);
  expect(withdraw?.text === "Withdraw", `${label} has the wrong option label 1`);
  expect(records.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} option labels expose compatibility storage`);
}

function assertOwnershipSimpleEncounter(records, label) {
  const encounter = records?.find((record) => record.id === 0);
  expect(encounter, `${label} is missing simple encounter 0`);
  expect(encounter.actions?.some((action) => action.slot === 0 && action.rawCode === 1 && action.id === 0), `${label} simple encounter has the wrong message action`);
  expect(encounter.choiceResults?.join(",") === "1,0,0,0", `${label} simple encounter has the wrong choice results`);
  expect(encounter.canBackOut === true && encounter.maxTimes === 1 && encounter.casteSuccess === 0, `${label} simple encounter has the wrong control fields`);
  expect(encounter.prompt === 0, `${label} simple encounter has the wrong prompt`);
  expect(encounter.texts?.join("\n") === "Continue\n\n\n", `${label} simple encounter has the wrong option text`);
  expect(records.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} simple encounters expose compatibility storage`);
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
  expect(records.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} complex encounters expose compatibility storage`);
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
  expect(records.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} thief encounters expose compatibility storage`);
}

function assertOwnershipTimedEncounter(records, label) {
  const encounter = records?.find((record) => record.id === 0);
  expect(encounter, `${label} is missing timed encounter 0`);
  expect(encounter.day === 35 && encounter.increment === 5 && encounter.percent === 50, `${label} timed encounter has the wrong schedule`);
  expect(encounter.door === 2, `${label} timed encounter has the wrong Extra Action Point target`);
  expect(encounter.requiredLevel === 0 && encounter.requiredRandomRect === -1 && encounter.requiredX === 10 && encounter.requiredY === 12, `${label} timed encounter has the wrong location gates`);
  expect(encounter.requiredItem === 901 && encounter.requiredQuest === 1 && encounter.locationKind === "land", `${label} timed encounter has the wrong item, quest, or location kind`);
  expect(!("rawBytes" in encounter) && !("reservedWords" in encounter), `${label} timed encounter exposes compatibility storage`);
}

function assertOwnershipBattle(records, label) {
  const battle = records?.find((record) => record.id === 0);
  expect(battle, `${label} is missing battle 0`);
  expect(records.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} battles expose compatibility storage`);
  expect(battle.grid?.length === 13 * 13, `${label} battle has the wrong grid-slot inventory`);
  expect(battle.grid[84] === 1, `${label} battle has the wrong authored monster placement`);
  expect(battle.dist === 3, `${label} battle has the wrong authored distance`);
  expect(battle.messageBefore === 0 && battle.messageAfter === 0 && battle.battleMacro === 0, `${label} battle has the wrong message or macro fields`);
}

function assertOwnershipMonster(records, monsterSets, descriptions, label) {
  const monster = records?.find((record) => record.id === 1);
  expect(monster, `${label} is missing monster 1`);
  expect(records.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} primary monsters expose compatibility storage`);
  expect(monster.hitDice === 9 && monster.staminaBonus === 200 && monster.agility === 201 && monster.movementMax === 202, `${label} monster has the wrong unsigned-byte fields`);
  expect(monster.armor === -4 && monster.typeFlags?.join(",") === "1,-1,2,-2,3,-3,4,-4", `${label} monster has the wrong signed-byte fields`);
  expect(monster.attacks?.length === 5 && monster.attacks[0]?.join(",") === "1,8,0,0", `${label} monster has the wrong fixed attack inventory`);
  expect(monster.displayName === "Providence Sentinel", `${label} monster has the wrong display name`);
  for (const [setId, sourceFile] of [[1, "Data MD1"], [-1, "Data MD-1"]]) {
    const set = monsterSets?.find((candidate) => candidate.setId === setId);
    expect(set?.sourceFile === sourceFile, `${label} is missing canonical monster set ${sourceFile}`);
    expect(set.monsters.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} ${sourceFile} monsters expose compatibility storage`);
    const variant = set.monsters.find((record) => record.id === 1);
    expect(variant?.hitDice === monster.hitDice && variant?.displayName === monster.displayName, `${label} ${sourceFile} has the wrong authored semantic variant`);
  }
  const description = descriptions?.find((record) => record.id === 1);
  expect(description?.text === "Compiled entirely from canonical Providence monster data.", `${label} has the wrong monster description`);
  expect(descriptions.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} monster descriptions expose compatibility storage`);
}

function assertOwnershipTreasure(records, label) {
  const treasure = records?.find((record) => record.id === 0);
  expect(treasure, `${label} is missing treasure 0`);
  expect(treasure.itemIds?.length === 20, `${label} treasure has the wrong item-slot inventory`);
  expect(treasure.itemIds[0] === 901 && treasure.gold === 1, `${label} treasure has the wrong semantic rewards`);
  expect(!Object.hasOwn(treasure, "rawBytes"), `${label} treasure exposes compatibility storage`);
}

function assertOwnershipShop(records, label) {
  const shop = records?.find((record) => record.id === 0);
  expect(shop, `${label} is missing shop 0`);
  expect(shop.itemIds?.length === 1000 && shop.quantities?.length === 1000, `${label} shop has the wrong stock-slot inventory`);
  expect(shop.itemIds[0] === 901 && shop.quantities[0] === 1 && shop.inflation === 105, `${label} shop has the wrong semantic stock`);
  expect(!Object.hasOwn(shop, "rawBytes"), `${label} shop exposes compatibility storage`);
}

function assertOwnershipScenarioMetadata(project, label, requireNoCompatibilityBytes) {
  const shell = project.scenario?.shell;
  expect(shell, `${label} is missing scenario shell metadata`);
  expect(shell.sourceFile === scenarioName, `${label} has the wrong scenario marker filename`);
  expect(shell.recLevel === 1 && shell.maxLevel === 999, `${label} has the wrong scenario level bounds`);
  expect(shell.landLevel === 0 && shell.lookX === 10 && shell.lookY === 12, `${label} has the wrong scenario startup position`);
  expect(shell.codeseg1?.length === 20 && shell.codeseg2?.length === 20, `${label} has malformed scenario security segments`);
  const contact = project.scenario?.contactInfo;
  expect(contact, `${label} is missing scenario contact info`);
  expect(contact.scenarioName === scenarioName, `${label} has the wrong scenario contact name`);
  expect(contact.author === "Providence", `${label} has the wrong scenario contact author`);
  const restrictions = project.scenario?.restrictions;
  expect(restrictions, `${label} is missing scenario party restrictions`);
  expect(restrictions.description === "Four seasoned adventurers only.", `${label} has the wrong scenario restriction message`);
  expect(restrictions.maxPartyCharacters === 4 && restrictions.maxPartyLevel === 20, `${label} has the wrong scenario party limits`);
  expect(restrictions.bannedRaces?.join(",") === "1,30", `${label} has the wrong banned scenario races`);
  expect(restrictions.bannedCastes?.join(",") === "2,29", `${label} has the wrong banned scenario castes`);
  if (requireNoCompatibilityBytes) {
    expect(!Object.hasOwn(shell, "rawBytes"), `${label} scenario shell exposes raw compatibility bytes`);
    expect(!Object.hasOwn(shell, "trailingBytes"), `${label} scenario shell exposes a compatibility tail`);
    expect(!Object.hasOwn(project.scenario?.securityBackup ?? {}, "rawBytes"), `${label} scenario security backup exposes raw compatibility bytes`);
    expect(!Object.hasOwn(project.scenario?.securityBackup ?? {}, "trailingBytes"), `${label} scenario security backup exposes a compatibility tail`);
    expect(!Object.hasOwn(project.scenario?.supportFile ?? {}, "rawBytes"), `${label} scenario support file exposes compatibility bytes`);
    expect(!Object.hasOwn(contact, "rawBytes"), `${label} scenario contact exposes compatibility bytes`);
    expect(!Object.hasOwn(restrictions, "rawBytes"), `${label} scenario restrictions expose compatibility bytes`);
  }
}

function assertOwnershipGlobalMacros(project, label, requireNoCompatibilityBytes) {
  const hooks = project.scenario?.globalMacroHooks;
  expect(hooks, `${label} is missing global macro hooks`);
  expect(hooks.slots.find((slot) => slot.slot === 0)?.door === 2, `${label} has the wrong global start macro`);
  if (requireNoCompatibilityBytes) {
    expect(!Object.hasOwn(hooks, "rawBytes"), `${label} global macros expose compatibility bytes`);
  }
}

function assertOwnershipTileSolids(project, label, expectImportedProfiles) {
  const profiles = project.tileAttributes?.filter((profile) => profile.sourceKind === "data-solids") ?? [];
  const profile = profiles.find((candidate) => candidate.tile === 190);
  expect(profile, `${label} is missing special-tile solidity row 190`);
  expect(profile.solidType === 2 && profile.flags?.includes("solid"), `${label} has the wrong canonical special-tile solidity`);
  expect(!Object.hasOwn(profile, "rawByte"), `${label} exposes obsolete Data Solids byte identity`);
  expect(!Object.hasOwn(profile, "spare"), `${label} exposes obsolete mapstats compatibility state`);
  if (!expectImportedProfiles) {
    expect(profiles.length === 1, `${label} fresh project should carry only explicitly authored Data Solids rows`);
  }
}

function assertOwnershipLandLayout(project, label) {
  const layout = project.landLayout;
  expect(layout, `${label} is missing the canonical land layout`);
  expect(layout.rows === 8 && layout.cols === 16, `${label} has the wrong land-layout dimensions`);
  expect(layout.cells?.length === 128, `${label} land layout does not own all 128 cells`);
  expect(layout.cells[0] === -1 && layout.cells[127] === 202, `${label} has the wrong canonical land-layout cells`);
  expect(!("trailingBytes" in layout), `${label} land layout exposes embedded compatibility-tail bytes`);
}

function assertOwnershipMapRecord(records, label) {
  const record = records?.find((candidate) => candidate.id === 0);
  expect(record, `${label} is missing canonical map record 0`);
  expect(record.markers?.length === 10, `${label} map record does not own all ten marker slots`);
  expect(record.markers[0].iconId === -100 && record.markers[0].x === 11 && record.markers[0].y === 12, `${label} map record has the wrong authored marker`);
  expect(record.startX === 10 && record.startY === 12 && record.level === 0, `${label} map record has the wrong preview position`);
  expect(record.pictId === 306 && record.iconSize === 32 && record.show === 1 && record.isDungeon === false, `${label} map record has the wrong display fields`);
  expect(record.rect?.top === 0 && record.rect?.left === 0 && record.rect?.bottom === 90 && record.rect?.right === 90, `${label} map record has the wrong clip rectangle`);
  expect(record.note === "Providence owns this map record.", `${label} map record has the wrong note`);
  expect(!("rawBytes" in record), `${label} map record exposes embedded compatibility bytes`);
}

function assertOwnershipCustomLandlook(project, label, requireNoCompatibilityBytes) {
  const landlook = project.customLandlooks?.find((candidate) => candidate.landlook === 6);
  expect(landlook, `${label} is missing Custom 1 metadata`);
  expect(landlook.sourceFile === "Data Custom 1 BD", `${label} has the wrong Custom 1 metadata file`);
  expect(landlook.records?.length === 201, `${label} custom landlook does not own all 201 mapstats rows`);
  expect(landlook.rangeSlots?.length === 10, `${label} custom landlook does not own all ten range slots`);
  expect(landlook.baseTile === 156 && landlook.baseScale === 1, `${label} has the wrong custom-landlook base metadata`);
  expect(landlook.records[5].sound === 321 && landlook.records[5].time === 2 && landlook.records[5].isPath === 1 && landlook.records[5].clearLandId === 156, `${label} has the wrong custom-landlook tile semantics`);
  expect(landlook.rangeSlots[0].firstTile === 62 && landlook.rangeSlots[0].lastTile === 85, `${label} has the wrong custom-landlook range semantics`);
  if (requireNoCompatibilityBytes) {
    expect(!Object.hasOwn(landlook, "rawBytes"), `${label} custom landlook exposes embedded raw bytes`);
    expect(!Object.hasOwn(landlook, "trailingBytes"), `${label} custom landlook exposes embedded trailing bytes`);
    expect(landlook.records.every((record) => !Object.hasOwn(record, "spare")), `${label} custom landlook contains imported spare words`);
    expect(landlook.rangeSlots.every((slot) => !Object.hasOwn(slot, "reserved")), `${label} custom landlook contains imported reserved range words`);
  }
}

function assertOwnershipCustomLandlookAtlas(project, label) {
  const asset = project.assets?.find((candidate) => candidate.resourceType === "PICT" && candidate.resourceId === 306);
  expect(asset, `${label} is missing canonical PICT 306 atlas art`);
  expect(asset.kind === "picture" && asset.exportState === "ready", `${label} custom atlas is not export-ready picture art`);
  expect(asset.linkedEntity === "landlook:6", `${label} custom atlas is not linked to Custom 1`);
  expect(asset.width === 640 && asset.height === 320, `${label} custom atlas does not own normalized 640 x 320 dimensions`);
  expect(asset.conversion?.target === "custom-landlook-atlas", `${label} custom atlas has the wrong conversion target`);
  expect(asset.resourcePath.startsWith("data:application/octet-stream;base64,"), `${label} custom atlas does not embed deterministic PICT resource bytes`);
  expect(!asset.resourcePath.toLowerCase().includes("raw-sources"), `${label} custom atlas depends on raw-sources`);
  const tileset = project.assetCatalog?.tilesets?.find((candidate) => candidate.landlook === 6);
  expect(tileset?.available && tileset.pictId === 306, `${label} custom atlas is not registered as the available Custom 1 tileset`);
}

function assertOwnershipManagedResources(project, label) {
  for (const [resourceType, resourceId, expectedBytes] of [
    ["cicn", -100, customIconCicn],
    ["snd ", 321, customSoundSnd],
    ["TEXT", -200, scrollingText],
    ["styl", -200, scrollingTextStyl]
  ]) {
    const asset = project.assets?.find((candidate) => candidate.resourceType === resourceType && candidate.resourceId === resourceId);
    expect(asset, `${label} is missing canonical ${resourceType} ${resourceId}`);
    expect(asset.exportState === "ready" && asset.libraryScope === "scenario", `${label} ${resourceType} ${resourceId} is not scenario-owned and export-ready`);
    expect(asset.resourcePath.startsWith("data:application/octet-stream;base64,"), `${label} ${resourceType} ${resourceId} does not embed deterministic resource bytes`);
    expect(Buffer.from(asset.resourcePath.split(",", 2)[1], "base64").equals(Buffer.from(expectedBytes)), `${label} ${resourceType} ${resourceId} differs from canonical bytes`);
    expect(!asset.resourcePath.toLowerCase().includes("raw-sources"), `${label} ${resourceType} ${resourceId} depends on raw-sources`);
  }
}

function assertManagedResourceValidation(project) {
  const missing = JSON.parse(JSON.stringify(project));
  missing.assets.find((asset) => asset.resourceType === "snd " && asset.resourceId === 321).resourcePath = "";
  const missingReport = validateBrowserProject(missing);
  expect(missingReport.errors.some((error) => error.includes("marked ready but has no converted resourcePath")), "Browser validation did not report missing managed resource bytes");

  const conflicting = JSON.parse(JSON.stringify(project));
  conflicting.assets.push({ ...conflicting.assets.find((asset) => asset.resourceType === "TEXT" && asset.resourceId === -200), id: "asset:text:-200:conflict", label: "Conflicting Scrolling Text" });
  const conflictReport = validateBrowserProject(conflicting);
  expect(conflictReport.errors.some((error) => error.includes("scenario-managed resource keys must be unique")), "Browser validation did not report conflicting managed resource ownership");
}

function assertCompiledCustomLandlook(files, label) {
  const bytes = files.get("Data Custom 1 BD");
  expect(bytes?.byteLength === 8104, `${label} custom-landlook metadata should be exactly 8104 bytes`);
  expect(readI16(bytes, 5 * 40) === 321, `${label} custom-landlook tile has the wrong movement sound`);
  expect(readI16(bytes, 5 * 40 + 2) === 2, `${label} custom-landlook tile has the wrong movement cost`);
  expect(readI16(bytes, 5 * 40 + 10) === 1, `${label} custom-landlook tile has the wrong path flag`);
  expect(readI16(bytes, 5 * 40 + 18) === 0, `${label} custom-landlook spare word is not deterministic zero`);
  expect(readI16(bytes, 5 * 40 + 38) === 156, `${label} custom-landlook tile has the wrong clear land ID`);
  expect(readI16(bytes, 201 * 40) === 156 && readI16(bytes, 201 * 40 + 2) === 1, `${label} custom-landlook base metadata is wrong`);
  expect(readI16(bytes, 201 * 40 + 4) === 62 && readI16(bytes, 201 * 40 + 6) === 85, `${label} custom-landlook first range is wrong`);
  expect(readI16(bytes, 201 * 40 + 8) === 0, `${label} custom-landlook reserved range word is not deterministic zero`);
}

function assertSharedManifestPathPolicy(files, project, label) {
  const baseline = manifestPolicy.authoredBaseline;
  for (const family of baseline.optionalSemanticFiles) {
    expect(optionalSemanticFamilyPresent(project, family), `${label} ownership fixture does not cover optional semantic family ${family.id}`);
    expect(files.has(family.path), `${label} ownership output is missing optional semantic family ${family.id} at ${family.path}`);
  }
  for (const family of baseline.projectPathSemanticFiles) {
    const collection = projectValueAtPointer(project, family.projectPath);
    expect(Array.isArray(collection), `${label} manifest policy ${family.id} does not resolve to a canonical collection`);
    const expectations = collection.map((entry) => ({
      path: entry?.[family.pathField],
      shouldExist:
        family.include.kind === "field-truthy"
          ? Boolean(entry?.[family.include.field])
          : Array.isArray(entry?.[family.include.field]) && entry[family.include.field].length > 0
    }));
    for (const expectation of expectations) {
      const shouldExist = expectations.some((candidate) => candidate.path === expectation.path && candidate.shouldExist);
      expect(files.has(expectation.path) === shouldExist, `${label} ${family.id} path ${expectation.path} disagrees with the shared project-path policy`);
    }
  }
  for (const sidecar of baseline.resourceSidecars) {
    expect(sidecar.emission === "semantic-updates", `${label} resource sidecar ${sidecar.id} has an unknown emission rule`);
    expect(files.has(sidecar.path), `${label} ownership proof is missing shared ${sidecar.id} resource sidecar ${sidecar.path}`);
  }
}

function optionalSemanticFamilyPresent(project, family) {
  const value = projectValueAtPointer(project, family.presence.projectPath);
  if (family.presence.kind === "present") return value != null;
  if (family.presence.kind === "collection-non-empty") return Array.isArray(value) && value.length > 0;
  if (family.presence.kind === "collection-match") {
    return Array.isArray(value) && value.some((entry) => entry?.[family.presence.field] === family.presence.equals);
  }
  throw new Error(`Unknown optional semantic presence kind ${family.presence.kind}`);
}

function projectValueAtPointer(project, pointer) {
  return pointer.slice(1).split("/").reduce((value, segment) => value?.[segment], project);
}

function assertCompiledCustomLandlookAtlas(files, label) {
  const fork = files.get("Scenario.rsrc");
  expect(fork, `${label} output is missing Scenario.rsrc`);
  const entry = parseResourceFork(fork).find((resource) => resource.resourceType === "PICT" && resource.id === 306);
  expect(entry, `${label} resource fork is missing PICT 306`);
  expect(entry.name === "Custom 1 Landlook Atlas", `${label} PICT 306 has the wrong resource name`);
  expect(Buffer.from(entry.data).equals(Buffer.from(customLandlookPict)), `${label} PICT 306 differs from canonical atlas bytes`);
  const decoded = decodePictPreviewImageForTest(entry.data);
  expect(decoded.width === 640 && decoded.height === 320, `${label} PICT 306 does not decode to 640 x 320`);
  expect(decoded.summary.frameBottom === "320" && decoded.summary.frameRight === "640", `${label} PICT 306 has an invalid picture frame`);
}

function assertCompiledManagedResources(files, label) {
  const entries = parseResourceFork(files.get("Scenario.rsrc"));
  for (const [resourceType, resourceId, expectedName, expectedBytes] of [
    ["cicn", -100, "Providence Special Land Tile", customIconCicn],
    ["snd ", 321, "Providence Movement Sound", customSoundSnd],
    ["TEXT", -200, "Providence Scrolling Text", scrollingText],
    ["styl", -200, "Providence Scrolling Text Style", scrollingTextStyl]
  ]) {
    const entry = entries.find((candidate) => candidate.resourceType === resourceType && candidate.id === resourceId);
    expect(entry, `${label} resource fork is missing ${resourceType} ${resourceId}`);
    expect(entry.name === expectedName, `${label} ${resourceType} ${resourceId} has the wrong resource name`);
    expect(Buffer.from(entry.data).equals(Buffer.from(expectedBytes)), `${label} ${resourceType} ${resourceId} differs from canonical bytes`);
  }
}

async function assertReimportedCustomLandlookAtlas(project, label) {
  const tileset = project.assetCatalog?.tilesets?.find((candidate) => candidate.landlook === 6);
  expect(tileset, `${label} is missing the Custom 1 tileset association`);
  expect(tileset.available === true && tileset.pictId === 306, `${label} did not recover available PICT 306 atlas art`);
  expect(typeof tileset.imagePath === "string" && tileset.imagePath.includes("assets/tile-atlases/"), `${label} did not recover a decoded custom-atlas preview`);
  expect(await pathExists(path.join(reimportDir, tileset.imagePath)), `${label} custom-atlas preview file is missing`);
}

async function assertReimportedManagedResources(project, semanticSchema, label) {
  const icon = project.assetCatalog?.icons?.find((candidate) => candidate.resourceType === "cicn" && candidate.resourceId === -100);
  expect(icon?.previewPath, `${label} did not recover a decoded cicn -100 preview`);
  expect(await pathExists(path.join(reimportDir, icon.previewPath)), `${label} cicn -100 preview file is missing`);
  const sound = project.assetCatalog?.sounds?.find((candidate) => candidate.resourceType === "snd " && candidate.resourceId === 321);
  expect(sound?.previewPath, `${label} did not recover a decoded snd 321 preview`);
  expect(await pathExists(path.join(reimportDir, sound.previewPath)), `${label} snd 321 preview file is missing`);
  const text = semanticSchema.entities?.find((entity) => entity.id === "resource:TEXT:-200");
  const style = semanticSchema.entities?.find((entity) => entity.id === "resource:styl:-200");
  expect(text?.summary?.text === scrollingText.toString("ascii").trim(), `${label} did not recover TEXT -200 semantics`);
  expect(style?.summary?.styleRunTableStatus === "classic-style-run-table", `${label} did not recover styl -200 semantics`);
  expect(style?.summary?.styleRunCountCandidate === 1, `${label} did not recover the styl -200 run count`);
  expect(semanticSchema.links?.some((link) => link.from === "resource:TEXT:-200" && link.to === "resource:styl:-200" && link.kind === "styled_by"), `${label} did not recover the TEXT/styl semantic relationship`);
}

function assertOwnershipSpell(records, label) {
  expect(records?.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} spell overrides expose compatibility storage`);
  const spell = records?.find((record) => record.id === 16);
  expect(spell, `${label} is missing custom spell 16`);
  expect(spell.displayName === "Providence Ward", `${label} has the wrong custom spell name`);
  expect(spell.cost === 4, `${label} has the wrong custom spell cost`);
  expect(spell.inCombat === true && spell.inCamp === false, `${label} has the wrong custom spell availability`);
}

function assertOwnershipRules(project, label, expectCanonicalNames) {
  expect(project.raceOverrides?.every((record) => !Object.hasOwn(record, "rawBytes") && !Object.hasOwn(record, "spare") && !Object.hasOwn(record, "spacer")), `${label} race overrides expose compatibility identity`);
  expect(project.casteOverrides?.every((record) => !Object.hasOwn(record, "rawBytes") && !Object.hasOwn(record, "spare1") && !Object.hasOwn(record, "spare2") && !Object.hasOwn(record, "spacer")), `${label} caste overrides expose compatibility identity`);
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
  expect(project.spellOverrides?.every((record) => !Object.hasOwn(record, "rawBytes")), `${label} spell overrides contain compatibility bytes`);
  expect(project.raceOverrides?.every((record) => !Object.hasOwn(record, "rawBytes") && !Object.hasOwn(record, "spare") && !Object.hasOwn(record, "spacer")), `${label} race overrides contain compatibility bytes`);
  expect(project.casteOverrides?.every((record) => !Object.hasOwn(record, "rawBytes") && !Object.hasOwn(record, "spare1") && !Object.hasOwn(record, "spare2") && !Object.hasOwn(record, "spacer")), `${label} caste overrides contain compatibility bytes`);
}

async function readFlatDirectory(root) {
  const files = new Map();
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    files.set(entry.name, new Uint8Array(await fs.readFile(path.join(root, entry.name))));
  }
  return new Map([...files].sort(([left], [right]) => left.localeCompare(right)));
}

async function readDirectoryTree(root, relativeRoot = "") {
  const files = new Map();
  const directory = path.join(root, relativeRoot);
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeRoot.replaceAll("\\", "/"), entry.name);
    if (entry.isDirectory()) {
      for (const [name, bytes] of await readDirectoryTree(root, relativePath)) files.set(name, bytes);
    } else if (entry.isFile()) {
      files.set(relativePath, new Uint8Array(await fs.readFile(path.join(root, relativePath))));
    }
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

function assertRemakeCompatibilityBundle(files, canonicalProject) {
  const requiredDocuments = [
    "campaign.json",
    "runtime.json",
    "classic/assets.json",
    "classic/content.json",
    "classic/encounters.json",
    "classic/evidence.json",
    "classic/maps.json",
    "classic/rules.json",
    "classic/scenario.json",
    "classic/scripts.json"
  ];
  for (const name of requiredDocuments) expect(files.has(name), `Remake export is missing ${name}`);

  const documents = new Map(requiredDocuments.map((name) => [name, JSON.parse(Buffer.from(files.get(name)).toString("utf8"))]));
  const manifest = documents.get("campaign.json");
  expect(manifest.format === "realmz-remake-scenario", "Remake export has the wrong format identity");
  expect(manifest.formatVersion === 2, `Remake export has unsupported format version ${manifest.formatVersion}`);
  expect(manifest.campaignKind === "classic-compiled" && manifest.compatibilityProfile === "realmz-7.1", "Remake export has the wrong compatibility profile");
  expect(manifest.producer.projectSchemaVersion === 6 && manifest.producer.projectOrigin === "authored", "Remake export lost its canonical producer identity");
  expect(manifest.files.runtime === "runtime.json", "Remake export lost the required runtime document path");
  expect(manifest.start.levelType === "land" && manifest.start.levelIndex === 0 && manifest.start.x === 10 && manifest.start.y === 12, "Remake export has the wrong canonical start");

  const scenario = documents.get("classic/scenario.json");
  expect(scenario.identity.id === manifest.id && scenario.identity.name === manifest.name, "Remake scenario identity differs from its manifest");
  const maps = documents.get("classic/maps.json");
  expect(maps.maps.some((map) => map.id === "land:0" && map.tiles.at(-1) === -100), "Remake export lost the canonical map identity or special tile");
  expect(maps.maps.some((map) => map.id === "dungeon:0" && map.levelType === "dungeon" && map.tiles[5 * 90 + 4] === 0x1501), "Remake export lost the canonical dungeon map or Action Point marker");
  const scripts = documents.get("classic/scripts.json");
  const trigger = scripts.triggers.find((candidate) => candidate.id === "land:0:ap:0");
  expect(trigger, "Remake export lost the stable Action Point identity");
  expect(trigger.actions.some((action) => action.kind === "classic" && action.rawCode === 1 && action.code === 1 && action.gosub === false), "Remake export lost the normalized message action");
  expect(trigger.actions.some((action) => action.kind === "classic" && action.rawCode === 47 && action.code === 47 && action.gosub === false), "Remake export lost the normalized quest action");
  const dungeonRandomLevel = scripts.randomLevels.find((candidate) => candidate.id === "dungeon:0:randlevel");
  expect(dungeonRandomLevel?.isDark && dungeonRandomLevel.useLos && dungeonRandomLevel.landlook === 0, "Remake export lost the canonical dungeon random-level flags");
  const dungeonTrigger = scripts.triggers.find((candidate) => candidate.id === "dungeon:0:ap:1");
  expect(dungeonTrigger?.source === "Data DDD" && dungeonTrigger.doorid === 504, "Remake export lost the stable dungeon Action Point identity");
  expect(dungeonTrigger.actions.length === 1 && dungeonTrigger.actions[0].rawCode === 1 && dungeonTrigger.actions[0].code === 1, "Remake export lost the normalized dungeon message action");
  const extraAction = scripts.triggers.find((candidate) => candidate.source === "Data ED3");
  expect(extraAction && typeof extraAction.callable === "boolean", "Remake export lost authoritative Data ED3 callability");
  const evidence = documents.get("classic/evidence.json");
  expect(evidence.semanticDecoding.ed3Reachability.some((row) => row.recordIndex === extraAction.recordIndex && row.reachable === extraAction.callable), "Remake export callability differs from its reachability evidence");
  const encounters = documents.get("classic/encounters.json");
  expect(encounters.simpleEncounters.some((record) => record.id === 0), "Remake export lost the stable simple-encounter identity");
  expect(encounters.complexEncounters.some((record) => record.id === 0), "Remake export lost the stable complex-encounter identity");
  const content = documents.get("classic/content.json");
  expect(content.monsters.some((record) => record.id === 1 && record.nameId === 1), "Remake export conflated monster record and name identities");
  expect(content.scenarioItems.some((record) => record.id === 101 && record.itemId === 901), "Remake export lost scenario-item record or item identity");
  const runtime = documents.get("runtime.json");
  expect(runtime.recommendedGameplayProfile === "core.classic", "Remake runtime lost the recommended gameplay profile");
  expect(runtime.requiredExtensions.length === 0, "Ordinary Classic proof unexpectedly requires a Remake extension");
  expect(runtime.targetSupport.realmzRemake === true && runtime.targetSupport.nativeRealmz === true, "Ordinary Classic proof must support both targets");
  expect(runtime.targetSupport.remakeOnlyReasons.length === 0, "Ordinary Classic proof must not have Remake-only reasons");

  const assets = documents.get("classic/assets.json");
  expect(assets.managedAssets.length === canonicalProject.assets.length, "Remake export did not package every scenario-managed asset");
  for (const exported of assets.managedAssets) {
    const source = canonicalProject.assets.find((asset) => asset.id === exported.id);
    expect(source, `Remake export added unknown managed asset ${exported.id}`);
    expect(exported.payloadEncoding === "classic-resource-data", `${exported.id} has an undefined payload encoding`);
    expect(typeof exported.payloadPath === "string" && exported.payloadPath.startsWith("assets/managed/"), `${exported.id} has a non-portable payload path`);
    expect(files.has(exported.payloadPath), `${exported.id} payload file is missing`);
    const expectedBytes = Buffer.from(source.resourcePath.split(",", 2)[1], "base64");
    expect(Buffer.from(files.get(exported.payloadPath)).equals(expectedBytes), `${exported.id} payload differs from canonical project bytes`);
    expect(exported.payloadBytes === expectedBytes.length, `${exported.id} payload byte count is wrong`);
    expect(exported.payloadSha256 === createHash("sha256").update(expectedBytes).digest("hex"), `${exported.id} payload hash is wrong`);
  }
  for (const [collection, resourceType, resourceId] of [
    ["pictures", "PICT", 306],
    ["specialLandTiles", "cicn", -100],
    ["sounds", "snd ", 321]
  ]) {
    const resource = assets.catalog[collection].find((entry) => entry.resourceType === resourceType && entry.resourceId === resourceId);
    expect(resource?.payloadPath && files.has(resource.payloadPath), `Remake ${collection} catalog lost ${resourceType} ${resourceId}`);
  }
  const picture = assets.catalog.pictures.find((entry) => entry.resourceType === "PICT" && entry.resourceId === 306);
  expect(picture?.runtimeMedia?.mediaType === "image/png", "Remake picture catalog lost decoded PNG runtime media");
  expect(typeof picture.runtimeMedia.path === "string" && picture.runtimeMedia.path.startsWith("media/pictures/pict-306-"), "Remake picture runtime media has a non-portable path");
  expect(files.has(picture.runtimeMedia.path), "Remake picture runtime media file is missing");
  const runtimePicture = Buffer.from(files.get(picture.runtimeMedia.path));
  expect(runtimePicture.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "Remake picture runtime media is not PNG");
  expect(picture.runtimeMedia.bytes === runtimePicture.length, "Remake picture runtime media byte count is wrong");
  expect(picture.runtimeMedia.sha256 === createHash("sha256").update(runtimePicture).digest("hex"), "Remake picture runtime media hash is wrong");
  const managedPicture = assets.managedAssets.find((asset) => asset.resourceType === "PICT" && asset.resourceId === 306);
  expect(JSON.stringify(managedPicture?.runtimeMedia) === JSON.stringify(picture.runtimeMedia), "Managed and catalog picture runtime media differ");

  const sound = assets.catalog.sounds.find((entry) => entry.resourceType === "snd " && entry.resourceId === 321);
  expect(sound?.runtimeMedia?.mediaType === "audio/wav", "Remake sound catalog lost decoded WAV runtime media");
  expect(typeof sound.runtimeMedia.path === "string" && sound.runtimeMedia.path.startsWith("media/sounds/snd-321-"), "Remake sound runtime media has a non-portable path");
  expect(files.has(sound.runtimeMedia.path), "Remake sound runtime media file is missing");
  const runtimeSound = Buffer.from(files.get(sound.runtimeMedia.path));
  expect(runtimeSound.subarray(0, 4).toString("ascii") === "RIFF", "Remake sound runtime media is not WAV");
  expect(sound.runtimeMedia.bytes === runtimeSound.length, "Remake sound runtime media byte count is wrong");
  expect(sound.runtimeMedia.sha256 === createHash("sha256").update(runtimeSound).digest("hex"), "Remake sound runtime media hash is wrong");
  const managedSound = assets.managedAssets.find((asset) => asset.resourceType === "snd " && asset.resourceId === 321);
  expect(JSON.stringify(managedSound?.runtimeMedia) === JSON.stringify(sound.runtimeMedia), "Managed and catalog sound runtime media differ");

  for (const [name, document] of documents) assertPortableRemakeDocument(document, name);
  const runtimeMediaFiles = canonicalProject.assets.filter((asset) => ["PICT", "cicn", "snd "].includes(asset.resourceType)).length;
  const expectedPayloadFiles = canonicalProject.assets.length + runtimeMediaFiles;
  expect(manifest.counts.packagedAssetPayloads === expectedPayloadFiles, "Remake export reported the wrong packaged payload count");
  expect([...files.keys()].filter((name) => !requiredDocuments.includes(name)).length === expectedPayloadFiles, "Remake export produced an unexpected payload file set");
}

function assertPortableRemakeDocument(value, context) {
  if (Array.isArray(value)) {
    for (const child of value) assertPortableRemakeDocument(child, context);
    return;
  }
  if (value && typeof value === "object") {
    for (const forbidden of [
      "rawBytes",
      "rawValues",
      "rawByte",
      "resourcePath",
      "previewPath",
      "originalPath",
      "projectPath",
      "rawSourcesDir",
      "editorMetadata",
      "sourceBaseResourceBase64",
      "sourcePairedResourceBase64",
      "resourceBase64"
    ]) {
      expect(!(forbidden in value), `${context} contains forbidden project field ${forbidden}`);
    }
    for (const child of Object.values(value)) assertPortableRemakeDocument(child, context);
    return;
  }
  if (typeof value === "string") {
    const normalized = value.replaceAll("\\", "/").toLowerCase();
    expect(!normalized.includes("data:"), `${context} contains an embedded data URI`);
    expect(!normalized.includes(relative(projectDir).toLowerCase()), `${context} contains the local project path`);
    expect(!normalized.includes("raw-sources"), `${context} names the compatibility annex`);
    expect(!/^[a-z]:\//i.test(normalized) && !normalized.startsWith("//") && !normalized.startsWith("/"), `${context} contains an absolute path`);
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

function readI32(bytes, offset) {
  return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) | 0;
}

function createCustomLandlookAtlasPixels() {
  const rgba = new Uint8Array(640 * 320 * 4);
  for (let y = 0; y < 320; y += 1) {
    for (let x = 0; x < 640; x += 1) {
      const tile = Math.floor(y / 32) * 20 + Math.floor(x / 32);
      const offset = (y * 640 + x) * 4;
      rgba[offset] = (tile * 40) & 0xf8;
      rgba[offset + 1] = (tile * 72) & 0xf8;
      rgba[offset + 2] = (tile * 104) & 0xf8;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

function createManagedResourceAsset({
  id,
  label,
  kind,
  resourceType,
  resourceId,
  fileName,
  resourceBytes,
  mimeType,
  width = null,
  height = null,
  durationMs = null,
  sampleRate = null,
  channels = null,
  linkedEntity
}) {
  return {
    id,
    label,
    kind,
    resourceType,
    resourceId,
    fileName,
    originalPath: "",
    previewPath: "",
    resourcePath: `data:application/octet-stream;base64,${Buffer.from(resourceBytes).toString("base64")}`,
    mimeType,
    bytes: resourceBytes.byteLength,
    sha256: createHash("sha256").update(resourceBytes).digest("hex"),
    width,
    height,
    durationMs,
    sampleRate,
    channels,
    exportState: "ready",
    libraryScope: "scenario",
    provenance: "Providence ownership proof canonical resource bytes",
    linkedEntity,
    conversion: null
  };
}

function encodeCicnResource() {
  const width = 32;
  const height = 32;
  const rowBytes = width;
  const maskRowBytes = width / 8;
  const maskOffset = 82;
  const bitmapOffset = maskOffset + maskRowBytes * height;
  const colorTableOffset = bitmapOffset + maskRowBytes * height;
  const pixelDataOffset = colorTableOffset + 8 + 2 * 8;
  const bytes = new Uint8Array(pixelDataOffset + rowBytes * height);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 0x8000 | rowBytes);
  writeRect(view, 6, height, width);
  view.setUint16(32, 8);
  view.setUint16(54, 0x8000 | maskRowBytes);
  writeRect(view, 56, height, width);
  view.setUint16(68, 0x8000 | maskRowBytes);
  writeRect(view, 70, height, width);
  bytes.fill(0xff, maskOffset, bitmapOffset);
  view.setUint16(colorTableOffset + 6, 1);
  for (const [index, red, green, blue] of [[0, 0x1818, 0x2020, 0x3838], [1, 0xe8e8, 0xa0a0, 0x3030]]) {
    const offset = colorTableOffset + 8 + index * 8;
    view.setUint16(offset, index);
    view.setUint16(offset + 2, red);
    view.setUint16(offset + 4, green);
    view.setUint16(offset + 6, blue);
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const border = x < 3 || x > 28 || y < 3 || y > 28;
      const diamond = Math.abs(x - 16) + Math.abs(y - 16) < 11;
      bytes[pixelDataOffset + y * rowBytes + x] = border || diamond ? 1 : 0;
    }
  }
  return bytes;
}

function encodeSndResource() {
  const samples = Uint8Array.from({ length: 256 }, (_, index) => 128 + Math.round(Math.sin(index * Math.PI / 8) * 48));
  const bytes = new Uint8Array(42 + samples.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 1);
  view.setUint16(2, 1);
  view.setUint16(4, 5);
  view.setUint32(6, 0x80);
  view.setUint16(10, 1);
  view.setUint16(12, 0x8051);
  view.setUint16(14, 0);
  view.setUint32(16, 20);
  view.setUint32(20, 0);
  view.setUint32(24, samples.length);
  view.setUint32(28, 11025 << 16);
  view.setUint32(32, 0);
  view.setUint32(36, samples.length);
  bytes[40] = 0;
  bytes[41] = 60;
  bytes.set(samples, 42);
  return bytes;
}

function encodeStylResource() {
  const bytes = new Uint8Array(22);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 1);
  view.setInt32(2, 0);
  view.setInt16(6, 12);
  view.setInt16(8, 9);
  view.setInt16(10, 0);
  bytes[12] = 1;
  bytes[13] = 0;
  view.setInt16(14, 12);
  view.setUint16(16, 0x1818);
  view.setUint16(18, 0x2020);
  view.setUint16(20, 0x3838);
  return bytes;
}

function writeRect(view, offset, bottom, right) {
  view.setInt16(offset, 0);
  view.setInt16(offset + 2, 0);
  view.setInt16(offset + 4, bottom);
  view.setInt16(offset + 6, right);
}

function encodeBmp(rgba, width, height) {
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const pixelBytes = rowBytes * height;
  const bmp = new Uint8Array(54 + pixelBytes);
  const view = new DataView(bmp.buffer);
  bmp[0] = 0x42;
  bmp[1] = 0x4d;
  view.setUint32(2, bmp.byteLength, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  for (let y = 0; y < height; y += 1) {
    const targetRow = 54 + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const target = targetRow + x * 3;
      bmp[target] = rgba[source + 2];
      bmp[target + 1] = rgba[source + 1];
      bmp[target + 2] = rgba[source];
    }
  }
  return bmp;
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
