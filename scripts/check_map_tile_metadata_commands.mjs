import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true }
});

const failures = [];

try {
  const commands = await server.ssrLoadModule("/src/editor/projectCommands/mapCommands.ts");
  const metadata = await server.ssrLoadModule("/src/editor/map/tileMetadata.ts");
  const paintGroups = await server.ssrLoadModule("/src/editor/map/paintGroups.ts");

  checkCustomMapstatsAttributeSync(commands, metadata, paintGroups);
  checkCustomCombatBuildSync(commands, metadata);
  checkCustomLandlookBaseSync(commands);
  checkBuiltInLandlookStaysReadOnly(commands);
  checkSpecialTileSolidity(commands, metadata);
  checkMapsMenuRecordEvidence();

  if (failures.length > 0) {
    console.error("Map tile metadata command checks failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Map tile metadata command checks passed.");
  }
} finally {
  await server.close();
}

function checkCustomMapstatsAttributeSync({ updateCustomLandTileAttributes }, { classifyTileValue, tileAttributeGroup }, { landlookGroupTiles }) {
  const project = projectWithCustomLandlook({ tileAttributes: [] });
  const next = updateCustomLandTileAttributes(project, {
    kind: "updateCustomLandTileAttributes",
    label: "Update land tile behavior",
    landlook: 6,
    tile: 147,
    changes: { needBoat: 1, isPath: 1, los: 1, forest: 2, clearLandId: 155 }
  });
  const profile = findProfile(next, 6, 147);
  assert(profile, "custom mapstats attribute edit did not create/update the visible tileAttributes profile");
  assert(profile.boatRequirement === 1, "custom mapstats edit did not sync boat requirement to tileAttributes");
  assert(profile.pathFlag === true, "custom mapstats edit did not sync path flag to tileAttributes");
  assert(profile.blocksLos === true, "custom mapstats edit did not sync LOS flag to tileAttributes");
  assert(profile.forestType === 2, "custom mapstats edit did not sync forest type to tileAttributes");
  assert(profile.flags.includes("boat-required"), "custom mapstats profile is missing boat-required flag");
  assert(profile.flags.includes("path"), "custom mapstats profile is missing path flag");
  assert(profile.flags.includes("blocks-los"), "custom mapstats profile is missing blocks-los flag");
  assert(profile.flags.includes("forest"), "custom mapstats profile is missing forest flag");
  const meaning = classifyTileValue(147, customTileset(), next.tileAttributes, {});
  assert(meaning.visual?.category === "watercraft", "tile 147 no longer classifies as watercraft");
  assert(tileAttributeGroup(meaning.attributes, 147, customTileset()).includes("boat-required"), "tile 147 behavior grouping does not include boat-required");
  assert(landlookGroupTiles(customTileset(), "boats", next.tileAttributes, {}).includes(147), "boat palette group does not include source-backed/custom tile 147");
}

function checkCustomCombatBuildSync({ updateCustomLandTileCombatBuild }, { classifyTileValue }) {
  const project = projectWithCustomLandlook({ tileAttributes: [] });
  const next = updateCustomLandTileCombatBuild(project, {
    kind: "updateCustomLandTileCombatBuild",
    label: "Update combat tile expansion",
    landlook: 6,
    tile: 12,
    row: 1,
    col: 2,
    value: 88
  });
  const profile = findProfile(next, 6, 12);
  assert(profile?.combatBuild?.[1]?.[2] === 88, "custom combat build edit did not sync into tileAttributes");
  assert(profile.flags.includes("combat-build"), "custom combat build edit did not set combat-build flag");
  const meaning = classifyTileValue(12, customTileset(), next.tileAttributes, {});
  assert(meaning.attributes?.combatBuild?.[1]?.[2] === 88, "classifier did not pick up the edited custom combat expansion");
}

function checkCustomLandlookBaseSync({ updateCustomLandlookBase }) {
  const project = projectWithCustomLandlook({ tileAttributes: [mapstatsProfile(6, record(4), { baseTile: 156, baseScale: 1 })] });
  const next = updateCustomLandlookBase(project, {
    kind: "updateCustomLandlookBase",
    label: "Update custom landlook base",
    landlook: 6,
    baseTile: 111,
    baseScale: 2
  });
  const profile = findProfile(next, 6, 4);
  assert(profile?.baseTile === 111, "custom landlook base tile edit did not refresh tileAttributes");
  assert(profile?.baseScale === 2, "custom landlook base scale edit did not refresh tileAttributes");
}

function checkBuiltInLandlookStaysReadOnly({ updateCustomLandTileAttributes }) {
  const project = projectWithCustomLandlook({ customLandlooks: [], tileAttributes: [mapstatsProfile(2, record(10, { solid: 0 }))] });
  const next = updateCustomLandTileAttributes(project, {
    kind: "updateCustomLandTileAttributes",
    label: "Update land tile behavior",
    landlook: 2,
    tile: 10,
    changes: { solid: 1 }
  });
  assert(next === project, "built-in landlook command mutated a project without scenario-custom metadata");
  assert(findProfile(next, 2, 10)?.solidType === 0, "built-in landlook metadata was changed by a custom-only command");
}

function checkSpecialTileSolidity({ updateSpecialTileSolidity }, { classifyTileValue }) {
  const project = projectWithCustomLandlook({
    tileAttributes: [specialProfile(384, false), mapstatsProfile(6, record(12, { solid: 0 }))]
  });
  const next = updateSpecialTileSolidity(project, {
    kind: "updateSpecialTileSolidity",
    label: "Make special tile solid",
    tile: 384,
    solid: true
  });
  const special = next.tileAttributes.find((profile) => profile.sourceKind === "data-solids" && profile.tile === 384);
  assert(special?.editableScope === "special-tile", "Data Solids edit lost special-tile editable scope");
  assert(special?.flags.includes("solid"), "Data Solids edit did not set solid flag");
  assert(findProfile(next, 6, 12)?.solidType === 0, "Data Solids edit changed unrelated mapstats metadata");
  const meaning = classifyTileValue(-384, customTileset(), next.tileAttributes, {});
  assert(meaning.attributeFlags.includes("special-icon"), "negative special tile did not keep special-icon grouping");
  assert(meaning.attributeFlags.includes("solid"), "negative special tile did not pick up Data Solids solidity");
}

function checkMapsMenuRecordEvidence() {
  const browserParser = fs.readFileSync(path.join(root, "src/editor/browser/realmzParser.ts"), "utf8");
  const mapWorkbench = fs.readFileSync(path.join(root, "src/editor/components/maps/MapRecordsWorkbench.tsx"), "utf8");
  const mapsPanel = fs.readFileSync(path.join(root, "src/editor/panels/MapsPanel.tsx"), "utf8");
  const evidence = fs.readFileSync(path.join(root, "docs/format-evidence-cards/map-record-runtime-anchors.md"), "utf8");
  for (const snippet of [
    "PRIMARY_MAP_NAMES_RESOURCE_ID = -102",
    "SECONDARY_MAP_NAMES_RESOURCE_ID = -101",
    "applyMapNameHints(maps, mapRecords, buffers)",
    "parseStringListResource(resource.data)",
    "record.primaryName = hint.primaryName || undefined",
    "map.name = hint.name"
  ]) {
    assert(browserParser.includes(snippet), `Browser parser should apply Maps Menu STR# name hints: ${snippet}`);
  }
  for (const snippet of [
    "Maps Menu",
    "Realmz Data MD2 records",
    "STR# -102/-101 Map Names resources",
    "Menu names come from the scenario Map Names STR# resources"
  ]) {
    assert(mapWorkbench.includes(snippet), `Maps Menu workbench should use runtime-backed authoring language: ${snippet}`);
  }
  assert(mapsPanel.includes('label: "Maps Menu"'), "Maps panel should expose Data MD2 records as Maps Menu entries.");
  for (const snippet of [
    "map[20]",
    "STR# -102",
    "STR# -101",
    "showmap(theItem - 4)",
    "opcode 29"
  ]) {
    assert(evidence.includes(snippet), `Map record evidence should document the runtime Maps menu model: ${snippet}`);
  }
}

function projectWithCustomLandlook(overrides = {}) {
  const customLandlooks = overrides.customLandlooks ?? [{
    landlook: 6,
    sourceFile: "Data Custom 1 BD",
    records: Array.from({ length: 201 }, (_, tile) => record(tile)),
    baseTile: 156,
    baseScale: 1,
    rangeSlots: [],
    trailingBytes: [],
    rawBytes: [],
    writerGate: { metadataWriterStatus: "decoded-writable", atlasWriterStatus: "preserved", writableFields: [], preserveOnlyFields: [], evidence: [] },
    authored: false
  }];
  return {
    maps: [],
    randomLevels: [],
    mapRecords: [],
    landLayout: null,
    tileAttributes: overrides.tileAttributes ?? customLandlooks.flatMap((landlook) => landlook.records.map((entry) => mapstatsProfile(landlook.landlook, entry, landlook))),
    customLandlooks,
    assetCatalog: { tilesets: [customTileset()] }
  };
}

function customTileset() {
  return {
    id: "landlook-6",
    landlook: 6,
    name: "Custom 6",
    source: "Scenario resource fork",
    available: true,
    imagePath: null,
    pictId: 306,
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    custom: true,
    baseTile: 156
  };
}

function record(tile, overrides = {}) {
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
    clearLandId: 0,
    ...overrides
  };
}

function mapstatsProfile(landlook, entry, metadata = {}) {
  const solid = entry.solid;
  const needBoat = entry.needBoat;
  const flyFloat = entry.flyFloat;
  const flags = [solid === 0 && needBoat === 0 && flyFloat === 0 ? "walkable" : "solid"];
  if (entry.shore !== 0) flags.push("shore");
  if (needBoat !== 0) flags.push("boat-required");
  if (entry.isPath !== 0) flags.push("path");
  if (entry.los !== 0) flags.push("blocks-los");
  if (flyFloat !== 0) flags.push("fly-float-required");
  if (entry.forest !== 0) flags.push("forest");
  if ((entry.combatBuild ?? []).flat().some((value) => value !== 0)) flags.push("combat-build");
  return {
    tile: entry.tile,
    landlook,
    solidType: solid,
    movementSoundId: entry.sound,
    movementCost: entry.time,
    shore: entry.shore !== 0,
    boatRequirement: needBoat,
    pathFlag: entry.isPath !== 0,
    blocksLos: entry.los !== 0,
    flyFloatRequired: flyFloat !== 0,
    forestType: entry.forest,
    spare: entry.spare,
    combatBuild: (entry.combatBuild ?? []).map((row) => [...row]),
    clearLandId: entry.clearLandId,
    baseTile: metadata.baseTile ?? 156,
    baseScale: metadata.baseScale ?? 1,
    editableScope: "scenario-custom",
    flags,
    confidence: "source-backed",
    sourceKind: "mapstats",
    source: metadata.sourceFile ?? "Data Custom 1 BD",
    rawByte: null
  };
}

function specialProfile(tile, solid) {
  return {
    tile,
    landlook: null,
    solidType: solid ? 1 : 0,
    movementSoundId: null,
    movementCost: null,
    editableScope: "special-tile",
    flags: [solid ? "solid" : "walkable"],
    confidence: "source-backed",
    sourceKind: "data-solids",
    source: "Data Solids",
    rawByte: solid ? 1 : 0
  };
}

function findProfile(project, landlook, tile) {
  return project.tileAttributes.find((profile) => profile.sourceKind === "mapstats" && profile.landlook === landlook && profile.tile === tile);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
