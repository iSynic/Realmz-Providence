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
  const renderValues = await server.ssrLoadModule("/src/editor/map/renderValues.ts");
  const browserProject = await server.ssrLoadModule("/src/editor/browser/project.ts");
  const appUtilsModule = await server.ssrLoadModule("/src/editor/app/appUtils.ts");

  checkDefaultBrowserProject(browserProject, appUtilsModule);
  checkNewDungeonDefaultsToWall(commands);
  checkDungeonCellFlagCommand(commands);
  checkCustomMapstatsAttributeSync(commands, metadata, paintGroups);
  checkCustomCombatBuildSync(commands, metadata);
  checkCustomLandlookBaseSync(commands);
  checkCreateCustomLandlookFromSource(commands);
  checkBuiltInLandlookStaysReadOnly(commands);
  checkSpecialTileSolidity(commands, metadata);
  checkPositiveIconBackedTileValues(renderValues, metadata);
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

function checkNewDungeonDefaultsToWall({ createMap }) {
  const project = projectWithCustomLandlook({
    maps: [],
    randomLevels: [],
    assetCatalog: { tilesets: [] },
    tileAttributes: []
  });
  const next = createMap(project, { kind: "createMap", label: "Create dungeon map", levelType: "dungeon" });
  const dungeon = next.maps.find((map) => map.levelType === "dungeon" && map.index === 0);
  assert(Boolean(dungeon), "Creating a dungeon map should add dungeon level 0.");
  assert(dungeon?.render?.mode === "dungeon-top-down", "New dungeon map should use the dungeon top-down renderer.");
  assert(dungeon?.render?.landlook === -1, "New dungeon map should use dungeon landlook -1.");
  assert(dungeon?.tiles.length === 90 * 90, "New dungeon map should have 8100 cells.");
  assert(dungeon?.tiles.every((tile) => tile === 1), "New dungeon map should default to wall cell value 1, not open floor 0.");
  const random = next.randomLevels.find((level) => level.levelType === "dungeon" && level.levelIndex === 0);
  assert(Boolean(random), "Creating a dungeon map should add the matching dungeon random-level row.");
  assert(next.assetCatalog?.tilesets?.some((tileset) => tileset.id === "dungeon-top-down-302"), "Creating a dungeon map should register the dungeon top-down tileset.");
}

function checkDungeonCellFlagCommand({ updateDungeonCellFlags }) {
  const preserved = 0x1000 | 0x8000;
  const signedPreserved = preserved >= 0x8000 ? preserved - 0x10000 : preserved;
  const project = projectWithCustomLandlook({
    maps: [
      dungeonMap(0, [signedPreserved, 0, 0, 0]),
      landMap(0, 0)
    ],
    randomLevels: []
  });
  const next = updateDungeonCellFlags(project, {
    kind: "updateDungeonCellFlags",
    label: "Set dungeon flags",
    mapId: "dungeon:0",
    flags: {
      wall: true,
      horizontalDoor: true,
      verticalDoor: true,
      stairs: true,
      column: true,
      unmapped: true,
      allowMoveNorth: true,
      allowMoveEast: true,
      allowMoveSouth: true,
      allowMoveWest: true,
      archway: true,
      noWallInBattle: true
    },
    cells: [
      { x: 0, y: 0, index: 0, from: signedPreserved },
      { x: 1, y: 0, index: 1, from: 0 }
    ]
  });
  const dungeon = next.maps.find((map) => map.id === "dungeon:0");
  const firstMask = dungeon.tiles[0] & 0xffff;
  assert((firstMask & preserved) === preserved, "Dungeon flag edits should preserve AP/high bits.");
  for (const mask of [0x0001, 0x0002, 0x0004, 0x0008, 0x0010, 0x0080, 0x0100, 0x0200, 0x0400, 0x0800, 0x2000, 0x4000]) {
    assert((firstMask & mask) === mask, `Dungeon flag edit did not set writer-safe mask 0x${mask.toString(16)}.`);
  }
  const cleared = updateDungeonCellFlags(next, {
    kind: "updateDungeonCellFlags",
    label: "Clear dungeon flags",
    mapId: "dungeon:0",
    flags: { wall: false, unmapped: false, allowMoveNorth: false, archway: false, noWallInBattle: false },
    cells: [{ x: 0, y: 0, index: 0, from: dungeon.tiles[0] }]
  });
  const clearedMask = cleared.maps.find((map) => map.id === "dungeon:0").tiles[0] & 0xffff;
  assert((clearedMask & 0x0001) === 0, "Dungeon flag edit did not clear wall.");
  assert((clearedMask & 0x0080) === 0, "Dungeon flag edit did not clear unmapped.");
  assert((clearedMask & 0x0100) === 0, "Dungeon flag edit did not clear north movement.");
  assert((clearedMask & 0x2000) === 0, "Dungeon flag edit did not clear archway.");
  assert((clearedMask & 0x4000) === 0, "Dungeon flag edit did not clear no-wall-in-battle.");
  assert((clearedMask & preserved) === preserved, "Dungeon flag clears should preserve managed/high bits.");
  const rejected = updateDungeonCellFlags(project, {
    kind: "updateDungeonCellFlags",
    label: "Reject land",
    mapId: "land:0",
    flags: { wall: true },
    cells: [{ x: 0, y: 0, index: 0, from: 156 }]
  });
  assert(rejected === project, "Dungeon flag edit should reject land maps without mutation.");
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

function checkCreateCustomLandlookFromSource({ createCustomLandlookFromSource }) {
  const builtInProject = projectWithCustomLandlook({
    customLandlooks: [],
    tileAttributes: [
      mapstatsProfile(0, record(5, {
        solid: 1,
        spare: 77,
        combatBuild: [[5, 6, 7], [8, 9, 10], [11, 12, 13]]
      }), { sourceFile: "Data P BD", baseTile: 156, baseScale: 1 })
    ],
    assetCatalog: { tilesets: [standardTileset(0)] },
    maps: [landMap(0, 0)],
    randomLevels: [randomLevel(0, 0)]
  });
  const next = createCustomLandlookFromSource(builtInProject, {
    kind: "createCustomLandlookFromSource",
    label: "Create Custom 1",
    sourceLandlook: 0,
    targetLandlook: 6,
    assignMapId: "land:0"
  });
  const custom = next.customLandlooks.find((landlook) => landlook.landlook === 6);
  assert(custom?.sourceFile === "Data Custom 1 BD", "Custom 1 creation should target Data Custom 1 BD.");
  assert(custom?.authored === true, "Custom landlook creation should mark metadata authored.");
  assert(custom?.records?.[5]?.solid === 1, "Custom landlook creation did not copy built-in tile metadata.");
  assert(custom?.records?.[5]?.spare === 77, "Custom landlook creation should preserve mapped spare words from the source profile.");
  assert(custom?.records?.[5]?.combatBuild?.[2]?.[2] === 13, "Custom landlook creation did not copy built-in combat expansion metadata.");
  assert(findProfile(next, 6, 5)?.editableScope === "scenario-custom", "Custom landlook creation did not sync writable tileAttributes.");
  assert(findProfile(next, 6, 5)?.combatBuild?.[0]?.[1] === 6, "Custom landlook creation did not sync combat expansion into writable tileAttributes.");
  assert(next.assetCatalog.tilesets.some((tileset) => tileset.landlook === 6 && tileset.pictId === 306 && tileset.name === "Custom 1"), "Custom landlook creation did not register the Custom 1 atlas.");
  assert(next.maps[0]?.render?.landlook === 6 && next.maps[0]?.render?.tilesetId === "landlook-6", "Custom landlook creation did not switch the assigned map.");
  assert(next.randomLevels[0]?.landlook === 6, "Custom landlook creation did not switch the assigned random-level row.");

  const sourceCustom = projectWithCustomLandlook().customLandlooks[0];
  sourceCustom.records[8] = record(8, { spare: 222, solid: 1 });
  sourceCustom.rangeSlots = [{ slot: 0, label: "Reserved", firstTile: 10, lastTile: 20, reserved: 333 }];
  sourceCustom.trailingBytes = [4, 5, 6];
  sourceCustom.rawBytes = [7, 8, 9];
  const cloned = createCustomLandlookFromSource(projectWithCustomLandlook({
    customLandlooks: [sourceCustom],
    assetCatalog: { tilesets: [customTileset(6)] }
  }), {
    kind: "createCustomLandlookFromSource",
    label: "Create Custom 2",
    sourceLandlook: 6,
    targetLandlook: 7
  });
  const custom2 = cloned.customLandlooks.find((landlook) => landlook.landlook === 7);
  assert(custom2?.sourceFile === "Data Custom 2 BD", "Custom duplication should retarget Data Custom 2 BD.");
  assert(custom2?.records?.[8]?.spare === 222, "Custom duplication should preserve spare mapstats words.");
  assert(custom2?.rangeSlots?.[0]?.reserved === 333, "Custom duplication should preserve range reserved words.");
  assert(custom2?.trailingBytes?.join(",") === "4,5,6", "Custom duplication should preserve trailing bytes.");
  assert(custom2?.rawBytes?.join(",") === "7,8,9", "Custom duplication should preserve raw bytes.");
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

function checkPositiveIconBackedTileValues({ PAINTABLE_REFERENCE_ACTOR_ICON_VALUES, tileIconCandidates }, { classifyTileValue, resolveTileRender }) {
  for (const tile of [379, 692, 824]) {
    assert(tileIconCandidates(tile)[0] === tile, `positive actor-range tile ${tile} should resolve as a direct icon-backed map value`);
    const meaning = classifyTileValue(tile, customTileset(), [], {});
    assert(meaning.kind === "special-positive", `positive actor-range tile ${tile} should classify as a special positive icon`);
    assert(meaning.attributeFlags.includes("special-icon"), `positive actor-range tile ${tile} should be grouped as a special icon`);
    const render = resolveTileRender(tile, customTileset(), [], {});
    assert(render.iconCandidates[0] === tile, `positive actor-range tile ${tile} should render through icon candidates`);
  }
  assert(tileIconCandidates(1379)[0] === 379, "positive thousand-band actor tile 1379 should resolve to direct icon 379 after Realmz state normalization");
  assert(PAINTABLE_REFERENCE_ACTOR_ICON_VALUES.includes(379), "actor palette should expose positive runtime cicn IDs");
  assert(!PAINTABLE_REFERENCE_ACTOR_ICON_VALUES.includes(-379), "actor palette should not expose negative aliases for positive runtime cicn IDs");
  for (const tile of [-47, -1047, -2047]) {
    assert(tileIconCandidates(tile)[0] === -47, `negative special tile ${tile} should still resolve as special icon -47`);
  }
}

function checkMapsMenuRecordEvidence() {
  const browserParser = fs.readFileSync(path.join(root, "src/editor/browser/realmzParser.ts"), "utf8");
  const rustMapNames = fs.readFileSync(path.join(root, "src-tauri/src/semantic/map_names.rs"), "utf8");
  const appBootstrap = fs.readFileSync(path.join(root, "src/editor/app/useAppBootstrapEffects.ts"), "utf8");
  const appUtils = fs.readFileSync(path.join(root, "src/editor/app/appUtils.ts"), "utf8");
  const mapWorkbench = fs.readFileSync(path.join(root, "src/editor/components/maps/MapRecordsWorkbench.tsx"), "utf8");
  const mapsPanel = fs.readFileSync(path.join(root, "src/editor/panels/MapsPanel.tsx"), "utf8");
  const playerMapsPanel = fs.readFileSync(path.join(root, "src/editor/panels/PlayerMapsPanel.tsx"), "utf8");
  const registry = fs.readFileSync(path.join(root, "src/editor/workbench/registry.tsx"), "utf8");
  const evidence = fs.readFileSync(path.join(root, "docs/format-evidence-cards/map-record-runtime-anchors.md"), "utf8");
  for (const snippet of [
    "PRIMARY_MAP_NAMES_RESOURCE_ID = -102",
    "SECONDARY_MAP_NAMES_RESOURCE_ID = -101",
    "applyMapNameHints(maps, mapRecords, buffers)",
    "parseStringListResource(resource.data)",
    "record.primaryName = hint.primaryName || undefined",
    "record.nameSource = hint.source"
  ]) {
    assert(browserParser.includes(snippet), `Browser parser should apply Maps Menu STR# name hints: ${snippet}`);
  }
  assert(!browserParser.includes("map.name = hint.name"), "Maps Menu STR# names should not rename land/dungeon level records.");
  assert(rustMapNames.includes('STR# "Map Names" labels Data MD2 player-map records, not land/dungeon levels.'), "Rust semantic map-name path should document Player Map label ownership.");
  assert(!rustMapNames.includes("map.name = name.name.clone()"), "Rust Maps Menu STR# names should not rename land/dungeon level records.");
  for (const snippet of [
    "Player Map",
    "Maps/Notes",
    "Edit the map name, target view, note, markers",
    "The name shown for this entry in the Maps/Notes menu."
  ]) {
    assert(mapWorkbench.includes(snippet), `Player Maps workbench should use authoring-focused language: ${snippet}`);
  }
  assert(!mapsPanel.includes('label: "Maps Menu"'), "Land/Dungeon Maps panel should no longer bury Data MD2 records as a Maps Menu mode.");
  assert(playerMapsPanel.includes("Player Maps"), "Player Maps panel should expose Data MD2 records as a first-class authoring surface.");
  assert(playerMapsPanel.includes("Maps/Notes entries players can find in game"), "Player Maps panel should describe the player-facing Maps/Notes workflow.");
  assert(registry.includes('"player-maps"'), "Workbench registry should expose Player Maps as a top-level domain.");
  assert(registry.includes('label: "Land/Dungeon Maps"'), "Maps domain should be renamed Land/Dungeon Maps.");
  assert(appUtils.includes("playerMapMarkerIconIds"), "Player Map marker icon IDs should be collected from MapRecord data.");
  for (const snippet of [
    "playerMapIconIds",
    "state.project.mapRecords",
    "playerMapMarkerIconIds",
    "mapIconIdSet",
    "iconIdMatchesSet(playerMapIconIdSet, id)",
    "isRealmzReferenceIconLibraryAsset",
    "realmzReferenceIconAsset"
  ]) {
    assert(appBootstrap.includes(snippet), `Icon preload should include Player Map marker originals: ${snippet}`);
  }
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

function checkDefaultBrowserProject({ createBrowserProject }, { isProjectEmpty }) {
  const project = createBrowserProject("Starter");
  const land = project.maps.find((map) => map.levelType === "land" && map.index === 0);
  assert(Boolean(land), "Browser New Project should create land level 0 by default.");
  assert(project.validation?.ok === true, "Browser New Project should validate without requiring the author to create a map first.");
  assert(land?.tiles.length === 90 * 90, "Default browser land level should have 8100 tiles.");
  assert(land?.tiles.every((tile) => tile === 156), "Default browser land level should be filled with Plains base tile 156.");
  assert(land?.render?.landlook === 0 && land?.render?.tilesetId === "landlook-0", "Default browser land level should use Plains landlook 0.");
  assert(project.randomLevels.some((level) => level.levelType === "land" && level.levelIndex === 0 && level.landlook === 0), "Browser New Project should create the matching land random-level row.");
  assert(project.assetCatalog?.tilesets?.some((tileset) => tileset.id === "landlook-0" && tileset.baseTile === 156), "Browser New Project should include the Plains tileset metadata.");
  assert(isProjectEmpty(project), "Untouched browser starter project should still be import-safe.");
  const editedProject = { ...project, maps: [{ ...land, tiles: [1, ...land.tiles.slice(1)] }] };
  assert(!isProjectEmpty(editedProject), "Starter project should stop being import-safe after a map edit.");
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
    maps: overrides.maps ?? [],
    randomLevels: overrides.randomLevels ?? [],
    mapRecords: [],
    landLayout: null,
    tileAttributes: overrides.tileAttributes ?? customLandlooks.flatMap((landlook) => landlook.records.map((entry) => mapstatsProfile(landlook.landlook, entry, landlook))),
    customLandlooks,
    assetCatalog: overrides.assetCatalog ?? { tilesets: [customTileset()] }
  };
}

function customTileset(landlook = 6) {
  return {
    id: `landlook-${landlook}`,
    landlook,
    name: landlook === 6 ? "Custom 1" : landlook === 7 ? "Custom 2" : "Custom 3",
    source: "Scenario resource fork",
    available: true,
    imagePath: null,
    pictId: 300 + landlook,
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    custom: true,
    baseTile: 156
  };
}

function standardTileset(landlook) {
  return {
    id: `landlook-${landlook}`,
    landlook,
    name: landlook === 0 ? "Plains" : `Landlook ${landlook}`,
    source: "Realmz reference resources",
    available: true,
    imagePath: null,
    pictId: 300 + landlook,
    tileWidth: 32,
    tileHeight: 32,
    columns: 20,
    rows: 10,
    custom: false,
    baseTile: 156
  };
}

function landMap(index, landlook) {
  return {
    id: `land:${index}`,
    levelType: "land",
    index,
    name: `Land ${index}`,
    width: 90,
    height: 90,
    tiles: new Array(90 * 90).fill(156),
    render: { landlook, tilesetId: `landlook-${landlook}`, mode: "outdoor-landlook" }
  };
}

function dungeonMap(index, tiles = []) {
  return {
    id: `dungeon:${index}`,
    levelType: "dungeon",
    index,
    name: `Dungeon ${index}`,
    width: 2,
    height: 2,
    tiles: tiles.length ? tiles : new Array(4).fill(1),
    render: { landlook: -1, tilesetId: "dungeon-top-down-302", mode: "dungeon-top-down" }
  };
}

function randomLevel(index, landlook) {
  return {
    id: `land:${index}:randlevel`,
    source: "Data RD",
    levelType: "land",
    levelIndex: index,
    landlook,
    isDark: false,
    useLos: false,
    rects: [],
    rawValues: []
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
