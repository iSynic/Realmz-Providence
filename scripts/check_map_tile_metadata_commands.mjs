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
  const scriptCommands = await server.ssrLoadModule("/src/editor/projectCommands/scriptCommands.ts");
  const actionPointMarkers = await server.ssrLoadModule("/src/editor/map/actionPointMarkers.ts");
  const secretTiles = await server.ssrLoadModule("/src/editor/map/secrets.ts");
  const metadata = await server.ssrLoadModule("/src/editor/map/tileMetadata.ts");
  const paintGroups = await server.ssrLoadModule("/src/editor/map/paintGroups.ts");
  const superTileStamps = await server.ssrLoadModule("/src/editor/map/superTileStamps.ts");
  const renderValues = await server.ssrLoadModule("/src/editor/map/renderValues.ts");
  const visualSemantics = await server.ssrLoadModule("/src/editor/map/landlookTileSemantics.ts");
  const browserProject = await server.ssrLoadModule("/src/editor/browser/project.ts");
  const appUtilsModule = await server.ssrLoadModule("/src/editor/app/appUtils.ts");

  checkDefaultBrowserProject(browserProject, appUtilsModule);
  checkNewDungeonDefaultsToWall(commands);
  checkDungeonCellFlagCommand(commands);
  checkActionPointMarkerEncoding(actionPointMarkers);
  checkHiddenWalkableOverlay(secretTiles, metadata);
  checkCastleWallSemantics(visualSemantics);
  checkSwampSemantics(visualSemantics);
  checkSnowSemantics(visualSemantics);
  checkDesertSemantics(visualSemantics);
  checkLandlookPaintGroupsAndStamps(paintGroups, superTileStamps);
  checkPaintPaletteConsolidation();
  checkTileAdjacencyAudit();
  checkHiddenWalkablePaletteSource();
  checkLandActionPointCommands(commands, scriptCommands, actionPointMarkers);
  checkDungeonActionPointCommands(commands, scriptCommands, actionPointMarkers);
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

function checkActionPointMarkerEncoding(markers) {
  assert(markers.actionPointMarkerState(156, "land") === "none", "Plain land tile should not be an Action Point marker.");
  assert(markers.actionPointMarkerState(1156, "land") === "normal", "Land +1000 band should be a normal Action Point marker.");
  assert(markers.landCellSecretState(2156) === "revealed", "Land +2000 band should be a revealed Secret Area.");
  assert(markers.landCellSecretState(3156) === "hidden", "Land +3000 band should be a hidden Secret Area.");
  assert(markers.landCellSecretState(-3156) === "hidden", "Negative land +3000 band should retain Secret Area semantics.");
  assert(markers.setLandCellSecretState(-3156, "normal", false) === -156, "Normalizing a standalone negative Secret Area should preserve the signed base tile.");
  assert(markers.setLandCellSecretState(-3156, "normal", true) === -1156, "Normalizing an AP-backed negative Secret Area should preserve its Action Point band.");

  const noteAndPath = 0x6000 | 1156;
  const secretWithMetadata = markers.setLandCellSecretState(noteAndPath, "hidden", true);
  assert((secretWithMetadata & 0x6000) === 0x6000, "Secret Area conversion should preserve land note/path bits.");
  assert(markers.landCellSecretState(secretWithMetadata) === "hidden", "Land note/path bits should not hide Secret Area state.");

  assert(markers.actionPointMarkerState(0x1000, "dungeon") === "normal", "Dungeon 0x1000 should be a normal Action Point marker.");
  assert(markers.actionPointMarkerState(0x1100, "dungeon") === "secret", "Dungeon AP plus directional movement should be a Secret Action Point.");
  assert(markers.actionPointMarkerState(0x1140, "dungeon") === "revealed-secret", "Dungeon reveal bit should identify an already revealed Secret Action Point.");
}

function checkHiddenWalkableOverlay(secretTiles, metadata) {
  const map = landMap(0, 0);
  assert(secretTiles.isStockHiddenWalkableTile(169, 0), "Plains tile 169 should be the stock hidden-walkable tile.");
  assert(secretTiles.isConcealedWalkableTerrain(169, map), "Plains tile 169 should remain identified as concealed walk-through terrain.");
  assert(secretTiles.showsHiddenWalkableOverlay(169, map), "Plains tile 169 should receive the hidden-walkable overlay.");
  assert(metadata.classifyTileValue(169, standardTileset(0), [], {}).label.toLowerCase().includes("hidden walkable"), "Plains tile 169 should be labeled as hidden walkable.");
  for (const tile of [180, 181, 182, 183, 184, 185]) {
    assert(!secretTiles.isStockHiddenWalkableTile(tile, 0), `Plains tile ${tile} should not be mislabeled as hidden walkable.`);
    assert(secretTiles.isStockCombatClearingTile(tile, 0), `Plains tile ${tile} should be a combat-clearing structure.`);
    assert(secretTiles.showsCombatClearingOverlay(tile, map), `Plains tile ${tile} should receive the combat-clearing overlay.`);
    assert(!secretTiles.showsHiddenWalkableOverlay(tile, map), `Plains tile ${tile} should not receive the hidden-walkable overlay.`);
    assert(metadata.classifyTileValue(tile, standardTileset(0), [], {}).label.toLowerCase().includes("combat-clearing"), `Plains tile ${tile} should be labeled as combat-clearing.`);
  }
  assert(!secretTiles.isSecretWalkableTile(169, map), "Unbanded land tile 169 should not be mislabeled as an authored Secret Area.");
  assert(secretTiles.showsHiddenWalkableOverlay(3169, map), "A hidden Secret Area using tile 169 should receive the hidden-walkable overlay.");
  assert(secretTiles.showsCombatClearingOverlay(3181, map), "A marked Plains combat-clearing structure should retain its combat overlay.");
  assert(!secretTiles.showsHiddenWalkableOverlay(3181, map), "A marked Plains combat-clearing structure should not become hidden walkable.");
  assert(!secretTiles.showsHiddenWalkableOverlay(179, map), "Adjacent stock tile 179 should not receive the hidden-walkable overlay.");
  assert(!secretTiles.showsHiddenWalkableOverlay(186, map), "Adjacent stock tile 186 should not receive the hidden-walkable overlay.");
  const castle = landMap(0, 4);
  for (const tile of [169, 180, 181, 182, 183, 184, 185]) {
    assert(!secretTiles.isStockHiddenWalkableTile(tile, 4), `Castle tile ${tile} should not be part of the Plains hidden-walkable set.`);
    assert(!secretTiles.showsHiddenWalkableOverlay(tile, castle), `Castle tile ${tile} should not receive a hidden-walkable overlay.`);
    assert(!metadata.classifyTileValue(tile, standardTileset(4), [], {}).label.toLowerCase().includes("hidden walkable"), `Castle tile ${tile} should not be labeled as hidden walkable.`);
  }
  assert(!secretTiles.showsHiddenWalkableOverlay(3169, castle), "A Castle Secret Area should use its normal secret marker without the Plains hidden-walkable overlay.");
  assert(secretTiles.hasSecretMarkerTile(3169, castle), "A Castle Secret Area should retain its ordinary hidden-area marker.");
  assert(secretTiles.isStockHiddenWalkableTile(96, 4), "Castle tile 96 should be the stock hidden-walkable floor.");
  assert(secretTiles.showsHiddenWalkableOverlay(96, castle), "Castle tile 96 should receive the hidden-walkable overlay.");
  assert(metadata.classifyTileValue(96, standardTileset(4), [], {}).label.toLowerCase().includes("hidden walkable"), "Castle tile 96 should be labeled as hidden walkable.");
  for (const tile of [59, 60, 61, 62, 63, 64, 65]) {
    assert(!secretTiles.isStockHiddenWalkableTile(tile, 4), `Castle tile ${tile} should not be mislabeled as hidden walkable.`);
    assert(secretTiles.isStockCombatClearingTile(tile, 4), `Castle tile ${tile} should be a combat-clearing wall.`);
    assert(secretTiles.showsCombatClearingOverlay(tile, castle), `Castle tile ${tile} should receive the combat-clearing overlay.`);
    assert(!secretTiles.showsHiddenWalkableOverlay(tile, castle), `Castle tile ${tile} should not receive the hidden-walkable overlay.`);
    assert(metadata.classifyTileValue(tile, standardTileset(4), [], {}).label.toLowerCase().includes("combat-clearing"), `Castle tile ${tile} should be labeled as combat-clearing.`);
    assert(!secretTiles.isStockCombatClearingTile(tile, 0), `Castle combat-clearing tile ${tile} should not be applied to Plains.`);
  }
  assert(secretTiles.defaultStockHiddenWalkableTile(0) === 169, "Plains hidden-walkable authoring should default to tile 169.");
  assert(secretTiles.defaultStockHiddenWalkableTile(4) === 96, "Castle hidden-walkable authoring should default to tile 96.");
  assert(secretTiles.defaultStockCombatClearingTile(0) === 180, "Plains combat-clearing authoring should default to tile 180.");
  assert(secretTiles.defaultStockCombatClearingTile(4) === 59, "Castle combat-clearing authoring should default to tile 59.");
  assert(secretTiles.showsCombatClearingOverlay(3059, castle), "A marked Castle wall should retain its combat-clearing overlay.");
  for (const tile of [78, 79, 80]) {
    assert(!secretTiles.isStockHiddenWalkableTile(tile, 4), `Castle rug tile ${tile} should not be classified as hidden walkable.`);
    assert(!secretTiles.isStockCombatClearingTile(tile, 4), `Castle rug tile ${tile} should not be classified as combat clearing.`);
  }
  assert(secretTiles.hasSecretMarkerTile(3059, castle), "A marked Castle wall should independently retain its ordinary Secret Area marker.");

  const swamp = landMap(0, 9);
  assert(secretTiles.isStockHiddenWalkableTile(169, 9), "Swamp tile 169 should be the stock hidden-walkable bog path.");
  assert(secretTiles.showsHiddenWalkableOverlay(169, swamp), "Swamp tile 169 should receive the hidden-walkable overlay.");
  assert(secretTiles.defaultStockHiddenWalkableTile(9) === 169, "Swamp hidden-walkable authoring should default to tile 169.");
  for (const tile of [180, 181, 182, 183, 184, 185]) {
    assert(secretTiles.isStockCombatClearingTile(tile, 9), `Swamp tile ${tile} should be combat-clearing terrain.`);
    assert(secretTiles.showsCombatClearingOverlay(tile, swamp), `Swamp tile ${tile} should receive the combat-clearing overlay.`);
  }
  assert(secretTiles.defaultStockCombatClearingTile(9) === 180, "Swamp combat-clearing authoring should default to tile 180.");

  const snow = landMap(0, 10);
  assert(secretTiles.isStockHiddenWalkableTile(169, 10), "Snow tile 169 should be the stock hidden-walkable snowy ridge.");
  assert(secretTiles.showsHiddenWalkableOverlay(169, snow), "Snow tile 169 should receive the hidden-walkable overlay.");
  assert(secretTiles.defaultStockHiddenWalkableTile(10) === 169, "Snow hidden-walkable authoring should default to tile 169.");
  for (const tile of [180, 181, 182, 183, 184, 185]) {
    assert(secretTiles.isStockCombatClearingTile(tile, 10), `Snow tile ${tile} should be combat-clearing terrain.`);
    assert(secretTiles.showsCombatClearingOverlay(tile, snow), `Snow tile ${tile} should receive the combat-clearing overlay.`);
  }
  assert(secretTiles.defaultStockCombatClearingTile(10) === 180, "Snow combat-clearing authoring should default to tile 180.");

  const desert = landMap(0, 5);
  for (const tile of [169, 184]) {
    assert(secretTiles.isStockHiddenWalkableTile(tile, 5), `Desert tile ${tile} should be hidden-walkable terrain.`);
    assert(secretTiles.showsHiddenWalkableOverlay(tile, desert), `Desert tile ${tile} should receive the hidden-walkable overlay.`);
    assert(!secretTiles.isStockCombatClearingTile(tile, 5), `Walkable Desert tile ${tile} should not be mislabeled as combat-clearing.`);
  }
  assert(secretTiles.defaultStockHiddenWalkableTile(5) === 169, "Desert hidden-walkable authoring should default to tile 169.");
  for (const tile of [180, 181, 182, 183, 185]) {
    assert(secretTiles.isStockCombatClearingTile(tile, 5), `Desert tile ${tile} should be combat-clearing terrain.`);
    assert(secretTiles.showsCombatClearingOverlay(tile, desert), `Desert tile ${tile} should receive the combat-clearing overlay.`);
  }
  assert(secretTiles.defaultStockCombatClearingTile(5) === 180, "Desert combat-clearing authoring should default to tile 180.");
}

function checkLandlookPaintGroupsAndStamps(paintGroups, stamps) {
  const plainsGroups = paintGroups.landlookTileGroups(standardTileset(0));
  const castleGroups = paintGroups.landlookTileGroups(standardTileset(4));
  const desertGroups = paintGroups.landlookTileGroups(standardTileset(5));
  const swampGroups = paintGroups.landlookTileGroups(standardTileset(9));
  const snowGroups = paintGroups.landlookTileGroups(standardTileset(10));
  assert(plainsGroups.map((group) => group.id).join(",") === "all,terrain,barriers,routes,vegetation,structures,props", "Plains paint filters should use the broad outdoor authoring groups.");
  assert(castleGroups.map((group) => group.id).join(",") === "all,terrain,barriers,routes,structures,props,special", "Castle paint filters should replace outdoor vegetation with architectural and special groups.");
  assert(castleGroups.find((group) => group.id === "barriers")?.label === "Walls & Passages", "Castle barriers should be labeled as walls and passages rather than mountains.");
  assert(desertGroups.find((group) => group.id === "vegetation")?.label === "Palms & Vegetation", "Desert should expose a landlook-specific vegetation group.");
  assert(swampGroups.find((group) => group.id === "structures")?.label === "Huts & Settlements", "Swamp should expose a landlook-specific structure group.");
  assert(snowGroups.find((group) => group.id === "terrain")?.label === "Snow, Ice & Water", "Snow should expose a landlook-specific terrain group.");

  const plainsStamps = stamps.superTileStampsForMap(landMap(0, 0), standardTileset(0));
  const castleStamps = stamps.superTileStampsForMap(landMap(0, 4), standardTileset(4));
  const desertStamps = stamps.superTileStampsForMap(landMap(0, 5), standardTileset(5));
  const snowStamps = stamps.superTileStampsForMap(landMap(0, 10), standardTileset(10));
  assert(plainsStamps.some((stamp) => stamp.id === "tree-pair-151-152"), "Plains should offer its reviewed two-cell tree stamp.");
  assert(!castleStamps.some((stamp) => stamp.id === "tree-pair-151-152"), "Castle should not inherit the unrelated Plains tree stamp by tile number alone.");
  assert(castleStamps.some((stamp) => stamp.id === "castle-sarcophagus-153-154" && stamp.category === "furnishings"), "Castle should offer audited paired furnishings as landlook-specific stamps.");
  assert(castleStamps.some((stamp) => stamp.id === "castle-long-table-food-158-161-162" && stamp.cells.map((cell) => cell.tile).join(",") === "158,161,162"), "Castle should offer the audited long-table food variant.");
  assert(castleStamps.some((stamp) => stamp.id === "castle-open-door-north-wall-187-191" && stamp.cells.length === 4), "Castle should offer the audited four-cell north-wall open door stamp.");
  assert(!desertStamps.some((stamp) => stamp.category === "vegetation"), "Desert should not inherit unverified Plains tree-pair stamps.");
  assert(snowStamps.some((stamp) => stamp.id === "tree-pair-153-154"), "Snow should retain its functionally aligned tree-pair stamps.");
}

function checkPaintPaletteConsolidation() {
  const source = fs.readFileSync(path.join(root, "src/editor/components/TileSelectionBar.tsx"), "utf8");
  assert(source.includes('{ id: "all", label: "All" }'), "Paint palette should expose a deduplicated All mode.");
  assert(source.includes('{ id: "special", label: "Special / Advanced" }'), "Paint palette should merge special/icon and raw compatibility values.");
  assert(!source.includes('{ id: "raw", label: "Raw / Advanced" }'), "Paint palette should not retain a separate Raw / Advanced tab.");
  assert(source.includes("const values = new Set([...standardTiles, ...specialAdvancedTiles])"), "All Available should deduplicate landlook and special/advanced tile values.");
  assert(!source.includes("Object.keys(icons ?? {})"), "Loaded negative icon resources should not automatically become paintable map values.");
}

function checkTileAdjacencyAudit() {
  const auditPath = path.join(root, "docs/generated/map-tile-adjacency-audit.json");
  assert(fs.existsSync(auditPath), "All-tile directional adjacency audit should be generated.");
  if (!fs.existsSync(auditPath)) return;
  const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
  assert(audit.summary?.placements === audit.summary?.landMaps * 90 * 90, "Adjacency audit should count every authored land-map cell exactly once.");
  assert(audit.entries?.every((entry) => ["north", "east", "south", "west"].every((direction) => Array.isArray(entry.neighbors?.[direction]))), "Adjacency audit entries should retain independent directional neighbor rankings.");
  assert(!audit.entries?.some((entry) => entry.tile === -20132), "Unused Divinity resource -20132 should not appear as an authored paint identity.");
  const normalized132 = audit.entries?.find((entry) => entry.tile === -132 && entry.landlook === null);
  assert(normalized132?.rawValues?.some((entry) => entry.value === -23132), "Adjacency audit should preserve exact raw variants behind normalized special tile -132.");
}

function checkSwampSemantics({ landlookTileVisualSemantics }) {
  assert(landlookTileVisualSemantics(36, 9)?.label === "Open swamp ground", "Swamp tile 36 should not inherit the Plains blank-tile label.");
  assert(landlookTileVisualSemantics(52, 9)?.label === "Closed coffin with crucifix", "Swamp tile 52 should be the crucifix-marked closed coffin.");
  assert(landlookTileVisualSemantics(53, 9)?.label === "Open coffin", "Swamp tile 53 should be the open coffin.");
  assert(landlookTileVisualSemantics(54, 9)?.notes?.includes("closed chest"), "Swamp tile 54 should preserve its alternate closed-chest use.");
  assert(landlookTileVisualSemantics(55, 9)?.label === "Red bog patch", "Swamp tile 55 should not inherit the Plains cobblestone label.");
  assert(landlookTileVisualSemantics(60, 9)?.label === "Full swamp water", "Swamp tile 60 should identify the full swamp-water center.");
  assert(landlookTileVisualSemantics(105, 9)?.label === "Stream to cave, cave west", "Swamp tile 105 should retain the solved Plains transition identity.");
  assert(landlookTileVisualSemantics(112, 9)?.label === "Land to cave, cave north", "Swamp tile 112 should retain the solved Plains transition identity.");
  assert(landlookTileVisualSemantics(118, 9)?.label === "Lone swamp tree", "Swamp tile 118 should be the lone-tree variant.");
  assert(landlookTileVisualSemantics(119, 9)?.label === "Two swamp trees", "Swamp tile 119 should be the two-tree variant.");
  assert(landlookTileVisualSemantics(120, 9)?.label === "Three swamp trees", "Swamp tile 120 should be the three-tree variant.");
  assert(landlookTileVisualSemantics(149, 9)?.label === "Large dead swamp stump", "Swamp tile 149 should not inherit the Plains fallen-log label.");
  assert(landlookTileVisualSemantics(169, 9)?.label === "Hidden walkable bog path", "Swamp tile 169 should identify its hidden-walkable role.");
  assert(landlookTileVisualSemantics(180, 9)?.label === "Combat-clearing bog wall", "Swamp tile 180 should identify its combat-clearing role.");
  assert(landlookTileVisualSemantics(170, 9)?.label === "Swamp hut", "Swamp tile 170 should be the basic hut.");
  assert(landlookTileVisualSemantics(177, 9)?.label === "Sturdy tent with lantern post", "Swamp tile 177 should be the lantern-post tent.");
  assert(landlookTileVisualSemantics(179, 9)?.notes?.includes("canopy of trees"), "Swamp tile 179 should be the canopy-suspended hut.");
  assert(landlookTileVisualSemantics(187, 9)?.category === "graves", "Swamp tile 187 should retain its grave or tomb role.");
  assert(landlookTileVisualSemantics(190, 9)?.category === "buildings", "Swamp tile 190 should retain the aligned settlement-building role.");
}

function checkSnowSemantics({ landlookTileVisualSemantics }) {
  assert(landlookTileVisualSemantics(36, 10)?.label === "Open snow ground", "Snow tile 36 should not inherit the Plains blank-tile label.");
  assert(landlookTileVisualSemantics(52, 10)?.label === "Grave", "Snow tile 52 should retain the aligned Plains grave role.");
  assert(landlookTileVisualSemantics(105, 10)?.label === "Stream to cave, cave west", "Snow tile 105 should retain the solved Plains transition identity.");
  assert(landlookTileVisualSemantics(115, 10)?.category === "road", "Snow tile 115 should be a bridge rather than inherit the Plains fire/hazard range.");
  assert(landlookTileVisualSemantics(118, 10)?.label === "Lone snow tree", "Snow tile 118 should be the lone-tree variant.");
  assert(landlookTileVisualSemantics(119, 10)?.label === "Two snow trees", "Snow tile 119 should be the two-tree variant.");
  assert(landlookTileVisualSemantics(120, 10)?.label === "Three snow trees", "Snow tile 120 should be the three-tree variant.");
  assert(landlookTileVisualSemantics(149, 10)?.label === "Snow-covered boulder", "Snow tile 149 should not inherit the Plains fallen-log label.");
  assert(landlookTileVisualSemantics(155, 10)?.label === "Plain decorative snow ground", "Snow tile 155 should identify the decorative open-snow range.");
  assert(landlookTileVisualSemantics(159, 10)?.notes?.includes("Walkable decoration"), "Snow tile 159 should remain decorative walkable open ground.");
  assert(landlookTileVisualSemantics(160, 10)?.label === "Decorative icy snow with rocks", "Snow tile 160 should preserve its icy snow and rock decoration.");
  assert(landlookTileVisualSemantics(169, 10)?.label === "Hidden walkable snowy ridge", "Snow tile 169 should identify its hidden-walkable role.");
  assert(landlookTileVisualSemantics(175, 10)?.label === "Two connected tiny snow huts", "Snow tile 175 should retain the connected-hut grammar.");
  assert(landlookTileVisualSemantics(180, 10)?.label === "Combat-clearing snowy mountain-to-land fill", "Snow tile 180 should identify its mountain-to-land combat-clearing role.");
  assert(landlookTileVisualSemantics(184, 10)?.notes?.includes("line-of-sight blocking"), "Snow tile 184 should preserve its source-backed LOS blocking behavior.");
  assert(landlookTileVisualSemantics(185, 10)?.notes?.includes("does not block line of sight"), "Snow tile 185 should preserve its LOS exception.");
  assert(landlookTileVisualSemantics(187, 10)?.category === "graves", "Snow tile 187 should retain the aligned graveyard role.");
}

function checkDesertSemantics({ landlookTileVisualSemantics }) {
  assert(landlookTileVisualSemantics(36, 5)?.label === "Open desert sand", "Desert tile 36 should not inherit the Plains blank-tile label.");
  assert(landlookTileVisualSemantics(52, 5)?.category === "water-shore", "Desert tile 52 should be an oasis pool rather than a Plains grave.");
  assert(landlookTileVisualSemantics(94, 5)?.label === "North-south desert briar wall", "Desert tile 94 should identify the briar-wall family.");
  assert(landlookTileVisualSemantics(105, 5)?.label === "Stream to cave, cave west", "Desert tile 105 should retain the solved transition identity.");
  assert(landlookTileVisualSemantics(113, 5)?.notes?.includes("Walkable but line-of-sight blocking"), "Desert tile 113 should preserve its walkable LOS-blocking passage behavior.");
  assert(landlookTileVisualSemantics(118, 5)?.label === "Lone palm tree", "Desert tile 118 should be the lone-palm variant.");
  assert(landlookTileVisualSemantics(121, 5)?.label === "Solid palm grove", "Desert tile 121 should identify the palm-grove center.");
  assert(landlookTileVisualSemantics(148, 5)?.notes?.includes("Solid and line-of-sight blocking"), "Desert tile 148 should preserve its solid palm-cluster behavior.");
  assert(landlookTileVisualSemantics(168, 5)?.category === "buildings", "Desert tile 168 should be an arch rather than a Plains blank tile.");
  assert(landlookTileVisualSemantics(169, 5)?.label === "Hidden walkable desert ridge", "Desert tile 169 should identify its hidden-walkable role.");
  assert(landlookTileVisualSemantics(180, 5)?.label === "Combat-clearing desert mountain-to-land fill", "Desert tile 180 should identify its combat-clearing role.");
  assert(landlookTileVisualSemantics(184, 5)?.notes?.includes("already open during land exploration"), "Desert tile 184 should be hidden walkable rather than combat-clearing.");
  assert(landlookTileVisualSemantics(185, 5)?.label === "Combat-clearing east-west desert briar wall", "Desert tile 185 should identify its combat-clearing wall role.");
  assert(landlookTileVisualSemantics(187, 5)?.category === "tree-detail", "Desert tile 187 should be vegetation rather than a Plains grave.");
  assert(landlookTileVisualSemantics(191, 5)?.label === "Plain desert sand", "Desert tile 191 should identify the source-defined base sand.");
  assert(landlookTileVisualSemantics(193, 5)?.category === "water-shore", "Desert tile 193 should be an oasis pool rather than a Plains house.");
  assert(landlookTileVisualSemantics(195, 5)?.confidence === "uncertain", "Desert tile 195 should preserve uncertainty about the bright sand effect.");
}

function checkCastleWallSemantics({ landlookTileVisualSemantics }) {
  for (let tile = 1; tile <= 40; tile += 1) {
    const visual = landlookTileVisualSemantics(tile, 4);
    assert(visual?.confidence === "known", `Castle wall tile ${tile} should have reviewed exact semantics.`);
    assert(visual?.category === "buildings", `Castle wall tile ${tile} should be classified as castle architecture.`);
  }
  assert(landlookTileVisualSemantics(18, 4)?.notes?.includes("Land north"), "Castle tile 18 should record land north of its east-west-south wall junction.");
  assert(landlookTileVisualSemantics(20, 4)?.notes?.includes("expected southern neighbor is land"), "Castle tile 20 should distinguish logical termination from perspective artwork.");
  assert(landlookTileVisualSemantics(21, 4)?.label.includes("West end-cap"), "Castle tile 21 should be the west wall terminator.");
  assert(landlookTileVisualSemantics(23, 4)?.label.includes("East end-cap"), "Castle tile 23 should be the horizontal mirror of tile 21.");
  assert(landlookTileVisualSemantics(32, 4)?.notes?.includes("west, east, and north"), "Castle tile 32 should preserve its reviewed gray-wall continuity.");
  assert(landlookTileVisualSemantics(33, 4)?.notes?.includes("southwest and southeast corners"), "Castle tile 33 should preserve its south-facing projection exception.");
  assert(landlookTileVisualSemantics(36, 4)?.notes?.includes("southeast corner instead of floor"), "Castle tile 36 should preserve its projection exception.");
  assert(landlookTileVisualSemantics(37, 4)?.notes?.includes("southwest corner instead of floor"), "Castle tile 37 should preserve its mirrored projection exception.");
  assert(landlookTileVisualSemantics(41, 4)?.label === "East-facing torch on thick wall", "Castle tile 41 should be the east-facing thick-wall torch.");
  assert(landlookTileVisualSemantics(42, 4)?.label === "South-facing torch on thick wall", "Castle tile 42 should be the south-facing thick-wall torch.");
  assert(landlookTileVisualSemantics(43, 4)?.label === "Purple curtains on thick south wall", "Castle tile 43 should be the thick wall with purple curtains.");
  assert(landlookTileVisualSemantics(44, 4)?.label === "Purple curtains on gray south wall", "Castle tile 44 should have purple curtains.");
  assert(landlookTileVisualSemantics(45, 4)?.label === "Red curtains on gray south wall", "Castle tile 45 should have red curtains.");
  assert(landlookTileVisualSemantics(46, 4)?.label === "Green curtains on gray south wall", "Castle tile 46 should have green curtains.");
  assert(landlookTileVisualSemantics(47, 4)?.notes?.includes("pocket southwest"), "Castle tile 47 should preserve its southwest thick-wall pocket.");
  assert(landlookTileVisualSemantics(48, 4)?.notes?.includes("Horizontal mirror of Castle tile 47"), "Castle tile 48 should be the horizontal mirror of tile 47.");
  assert(landlookTileVisualSemantics(49, 4)?.notes === "Vertical mirror of Castle tile 48.", "Castle tile 49 should be the vertical mirror of tile 48.");
  assert(landlookTileVisualSemantics(50, 4)?.notes?.includes("tunnel enters from land to the south"), "Castle tile 50 should preserve its south tunnel entrance.");
  assert(landlookTileVisualSemantics(51, 4)?.label === "East-facing fountain wall", "Castle tile 51 should be the east-facing fountain wall.");
  assert(landlookTileVisualSemantics(52, 4)?.notes?.includes("Horizontal mirror of Castle tile 51"), "Castle tile 52 should mirror the fountain wall.");
  assert(landlookTileVisualSemantics(53, 4)?.label === "North-facing teal fountain wall", "Castle tile 53 should be the north-facing teal fountain.");
  assert(landlookTileVisualSemantics(54, 4)?.label === "South-facing lava skull wall", "Castle tile 54 should spew lava south.");
  assert(landlookTileVisualSemantics(55, 4)?.label === "East-facing lava skull wall", "Castle tile 55 should spew lava east.");
  assert(landlookTileVisualSemantics(56, 4)?.label === "West-facing lava skull wall", "Castle tile 56 should spew lava west.");
  assert(landlookTileVisualSemantics(57, 4)?.label === "North-facing lava skull wall", "Castle tile 57 should spew lava north.");
  assert(landlookTileVisualSemantics(58, 4)?.label === "East-ascending stone stairway", "Castle tile 58 should be the east-ascending stairway.");
  assert(landlookTileVisualSemantics(66, 4)?.notes?.includes("Horizontal mirror of Castle tile 49"), "Castle tile 66 should preserve its mirror relationship to tile 49.");
  assert(landlookTileVisualSemantics(67, 4)?.category === "blank", "Castle tile 67 should be identified as the likely non-authoring white tile.");
  assert(landlookTileVisualSemantics(68, 4)?.label === "Pit", "Castle tile 68 should be identified as a pit.");
  assert(landlookTileVisualSemantics(69, 4)?.label === "Stairway descending underground", "Castle tile 69 should be identified as the descending stairway.");
  assert(landlookTileVisualSemantics(70, 4)?.label === "Dark acid pit", "Castle tile 70 should be identified as the dark pit with acid at the bottom.");
  assert(landlookTileVisualSemantics(71, 4)?.label === "Lava", "Castle tile 71 should be identified as lava.");
  assert(landlookTileVisualSemantics(72, 4)?.confidence === "likely", "Castle tile 72 should preserve the tentative acid identification.");
  assert(landlookTileVisualSemantics(73, 4)?.label === "Shallow water", "Castle tile 73 should be identified as shallow water.");
  assert(landlookTileVisualSemantics(74, 4)?.notes?.includes("north-south with a portcullis"), "Castle tile 74 should be the north-south portcullis passage.");
  assert(landlookTileVisualSemantics(75, 4)?.notes?.includes("east-west with a portcullis"), "Castle tile 75 should be the east-west portcullis passage.");
  assert(landlookTileVisualSemantics(76, 4)?.notes?.includes("north-south with a wooden door"), "Castle tile 76 should be the north-south wooden-door passage.");
  assert(landlookTileVisualSemantics(77, 4)?.notes?.includes("east-west with a wooden door"), "Castle tile 77 should be the east-west wooden-door passage.");
  assert(landlookTileVisualSemantics(78, 4)?.label === "Red rug center", "Castle tile 78 should be the red rug center rather than hidden-wall terrain.");
  assert(landlookTileVisualSemantics(79, 4)?.notes?.includes("outside left and top edges"), "Castle tile 79 should preserve its outside northwest embroidery.");
  assert(landlookTileVisualSemantics(80, 4)?.notes?.includes("inside bottom and right corners"), "Castle tile 80 should preserve its inside-corner embroidery.");
  assert(landlookTileVisualSemantics(81, 4)?.label === "Red rug southwest outside corner", "Castle tile 81 should be the southwest outside rug corner.");
  assert(landlookTileVisualSemantics(82, 4)?.label === "Red rug southwest inside corner", "Castle tile 82 should be the southwest inside rug corner.");
  assert(landlookTileVisualSemantics(83, 4)?.label === "Red rug southeast outside corner", "Castle tile 83 should be the southeast outside rug corner.");
  assert(landlookTileVisualSemantics(84, 4)?.label === "Red rug southeast inside corner", "Castle tile 84 should be the southeast inside rug corner.");
  assert(landlookTileVisualSemantics(85, 4)?.label === "Red rug northeast outside corner", "Castle tile 85 should be the northeast outside rug corner.");
  assert(landlookTileVisualSemantics(86, 4)?.label === "Red rug northeast inside corner", "Castle tile 86 should be the northeast inside rug corner.");
  assert(landlookTileVisualSemantics(87, 4)?.label === "Red rug east edge", "Castle tile 87 should be the east rug edge.");
  assert(landlookTileVisualSemantics(88, 4)?.label === "Red rug north edge", "Castle tile 88 should be the north rug edge.");
  assert(landlookTileVisualSemantics(89, 4)?.label === "Red rug south edge", "Castle tile 89 should be the south rug edge.");
  assert(landlookTileVisualSemantics(90, 4)?.label === "Red rug west edge", "Castle tile 90 should be the west rug edge.");
  assert(landlookTileVisualSemantics(91, 4)?.notes?.includes("pit tile 68"), "Castle tile 91 should preserve its covered-pit combat expansion.");
  assert(landlookTileVisualSemantics(92, 4)?.label === "Double wooden door", "Castle tile 92 should be the double wooden door.");
  assert(landlookTileVisualSemantics(93, 4)?.label === "Horizontal wooden floor or bridge", "Castle tile 93 should preserve its horizontal orientation.");
  assert(landlookTileVisualSemantics(94, 4)?.label === "Vertical wooden floor or bridge", "Castle tile 94 should preserve its vertical orientation.");
  assert(landlookTileVisualSemantics(95, 4)?.label === "Gray marble floor", "Castle tile 95 should be gray marble floor.");
  assert(landlookTileVisualSemantics(96, 4)?.label === "Hidden walkable thick red-black wall", "Castle tile 96 should be identified as a hidden-walkable wall rather than floor.");
  assert(landlookTileVisualSemantics(97, 4)?.label === "Broken stone floor", "Castle tile 97 should be broken stone floor.");
  assert(landlookTileVisualSemantics(98, 4)?.label === "Stained stone floor", "Castle tile 98 should be stained stone floor.");
  for (const tile of [99, 100, 101, 102, 103, 104]) {
    assert(landlookTileVisualSemantics(tile, 4)?.confidence === "likely", `Castle white-feature tile ${tile} should remain tentative pending bench/inlay confirmation.`);
  }
  for (const tile of [105, 106, 107, 108, 109, 110]) {
    assert(landlookTileVisualSemantics(tile, 4)?.confidence === "likely", `Castle white-feature tile ${tile} should preserve the stool/inlay uncertainty.`);
  }
  assert(landlookTileVisualSemantics(111, 4)?.label === "Plain cobblestone floor", "Castle tile 111 should be plain cobblestone floor.");
  assert(landlookTileVisualSemantics(112, 4)?.label === "Cobblestone with single bloodstain", "Castle tile 112 should have one bloodstain.");
  assert(landlookTileVisualSemantics(113, 4)?.label === "Cobblestone with multiple bloodstains", "Castle tile 113 should have multiple bloodstains.");
  assert(landlookTileVisualSemantics(114, 4)?.notes?.includes("slime or acid"), "Castle tile 114 should preserve the green stain interpretation.");
  assert(landlookTileVisualSemantics(115, 4)?.label === "Cobblestone with single scroll", "Castle tile 115 should contain one scroll.");
  assert(landlookTileVisualSemantics(116, 4)?.label === "Cobblestone with single skull", "Castle tile 116 should contain one skull.");
  assert(landlookTileVisualSemantics(117, 4)?.notes?.includes("equipment, treasure"), "Castle tile 117 should preserve the equipment or treasure interpretation.");
  assert(landlookTileVisualSemantics(118, 4)?.label === "Large machine, lever up", "Castle tile 118 should be the machine with its lever up.");
  assert(landlookTileVisualSemantics(119, 4)?.label === "Large machine, lever down", "Castle tile 119 should be the machine with its lever down.");
  assert(landlookTileVisualSemantics(120, 4)?.notes?.includes("effect or stain"), "Castle tile 120 should preserve the blue magical effect or stain interpretation.");
  assert(landlookTileVisualSemantics(121, 4)?.label === "Cobblestone with lever down", "Castle tile 121 should have its lever down.");
  assert(landlookTileVisualSemantics(122, 4)?.label === "Cobblestone with lever up", "Castle tile 122 should have its lever up.");
  assert(landlookTileVisualSemantics(123, 4)?.label === "Cobblestone with skeleton remains", "Castle tile 123 should contain skeleton remains.");
  assert(landlookTileVisualSemantics(124, 4)?.label === "Cobblestone with one sack", "Castle tile 124 should contain one sack.");
  assert(landlookTileVisualSemantics(125, 4)?.label === "Cobblestone with three sacks", "Castle tile 125 should contain three sacks.");
  assert(landlookTileVisualSemantics(126, 4)?.label.includes("east-facing wooden chair"), "Castle tile 126 should contain the east-facing chair.");
  assert(landlookTileVisualSemantics(127, 4)?.label.includes("west-facing wooden chair"), "Castle tile 127 should contain the west-facing chair.");
  assert(landlookTileVisualSemantics(128, 4)?.label.includes("small wooden stool"), "Castle tile 128 should contain the wooden stool.");
  assert(landlookTileVisualSemantics(129, 4)?.label === "Empty weapon rack", "Castle tile 129 should be the empty weapon rack.");
  assert(landlookTileVisualSemantics(130, 4)?.label === "Weapon rack with swords", "Castle tile 130 should contain swords.");
  assert(landlookTileVisualSemantics(131, 4)?.label === "Weapon rack with spears", "Castle tile 131 should contain spears.");
  assert(landlookTileVisualSemantics(132, 4)?.label === "Weapon rack with javelins", "Castle tile 132 should contain javelins.");
  assert(landlookTileVisualSemantics(133, 4)?.label === "Weapon rack with long axes", "Castle tile 133 should contain long axes.");
  assert(landlookTileVisualSemantics(134, 4)?.label === "Floor ladder leading up", "Castle tile 134 should be the upward ladder.");
  assert(landlookTileVisualSemantics(135, 4)?.label === "Floor hole with ladder leading down", "Castle tile 135 should be the downward ladder.");
  assert(landlookTileVisualSemantics(136, 4)?.label === "Pile of sacks or supplies", "Castle tile 136 should be a supply pile.");
  assert(landlookTileVisualSemantics(137, 4)?.label === "Two wooden crates", "Castle tile 137 should contain two crates.");
  assert(landlookTileVisualSemantics(138, 4)?.label === "Two barrels", "Castle tile 138 should contain two barrels.");
  assert(landlookTileVisualSemantics(139, 4)?.notes?.includes("brown and gold jugs"), "Castle tile 139 should contain brown and gold jugs.");
  assert(landlookTileVisualSemantics(140, 4)?.notes?.includes("weapons, clothing, or banners"), "Castle tile 140 should preserve the colored rack interpretation.");
  assert(landlookTileVisualSemantics(141, 4)?.label === "Short round stone column", "Castle tile 141 should be the short round column.");
  assert(landlookTileVisualSemantics(142, 4)?.label === "Top half of stone column", "Castle tile 142 should be the column top.");
  assert(landlookTileVisualSemantics(143, 4)?.label === "Bottom half of stone column", "Castle tile 143 should be the column bottom.");
  assert(landlookTileVisualSemantics(144, 4)?.label === "Unoccupied ornate throne", "Castle tile 144 should be the unoccupied throne.");
  assert(landlookTileVisualSemantics(145, 4)?.label === "Wooden writing desk or workbench", "Castle tile 145 should be the writing desk or workbench.");
  assert(landlookTileVisualSemantics(146, 4)?.label === "Alchemy table with colored bottles", "Castle tile 146 should be the alchemy table.");
  assert(landlookTileVisualSemantics(147, 4)?.label === "Plain wooden desk facing north", "Castle tile 147 should face north.");
  assert(landlookTileVisualSemantics(148, 4)?.label === "Plain wooden desk facing south", "Castle tile 148 should face south.");
  assert(landlookTileVisualSemantics(149, 4)?.notes?.includes("strongbox facing south"), "Castle tile 149 should be the south-facing white strongbox.");
  assert(landlookTileVisualSemantics(150, 4)?.label === "Ornate closed chest facing south", "Castle tile 150 should be the south-facing ornate chest.");
  assert(landlookTileVisualSemantics(151, 4)?.notes?.includes("facing west"), "Castle tile 151 should be the west-facing side-profile chest.");
  assert(landlookTileVisualSemantics(152, 4)?.label === "Standing torch", "Castle tile 152 should be the standing torch.");
  assert(landlookTileVisualSemantics(153, 4)?.label === "Left half of sarcophagus", "Castle tile 153 should be the sarcophagus left half.");
  assert(landlookTileVisualSemantics(154, 4)?.label === "Right half of sarcophagus", "Castle tile 154 should be the sarcophagus right half.");
  assert(landlookTileVisualSemantics(155, 4)?.label === "Plain cobblestone floor", "Castle tile 155 should be plain cobblestone floor.");
  assert(landlookTileVisualSemantics(156, 4)?.label === "Left half of bed", "Castle tile 156 should be the bed left half.");
  assert(landlookTileVisualSemantics(157, 4)?.label === "Right half of bed", "Castle tile 157 should be the bed right half.");
  assert(landlookTileVisualSemantics(158, 4)?.label === "Left end of long wooden table", "Castle tile 158 should be the long-table left end.");
  assert(landlookTileVisualSemantics(159, 4)?.label === "Center of long wooden table", "Castle tile 159 should be the long-table center.");
  assert(landlookTileVisualSemantics(160, 4)?.label === "Long wooden table center with bottles", "Castle tile 160 should be the bottle-covered table center.");
  assert(landlookTileVisualSemantics(161, 4)?.notes?.includes("food or place settings"), "Castle tile 161 should be the food-covered table center.");
  assert(landlookTileVisualSemantics(162, 4)?.label === "Right end of long wooden table", "Castle tile 162 should be the long-table right end.");
  assert(landlookTileVisualSemantics(163, 4)?.label === "Left side of torture rack", "Castle tile 163 should be the torture-rack left side.");
  assert(landlookTileVisualSemantics(164, 4)?.label === "Right side of torture rack", "Castle tile 164 should be the torture-rack right side.");
  assert(landlookTileVisualSemantics(165, 4)?.label === "Left half of yellow bed", "Castle tile 165 should be the yellow-bed left half.");
  assert(landlookTileVisualSemantics(166, 4)?.label === "Right half of yellow bed", "Castle tile 166 should be the yellow-bed right half.");
  assert(landlookTileVisualSemantics(167, 4)?.label === "Standing floor mirror", "Castle tile 167 should be the standing mirror.");
  assert(landlookTileVisualSemantics(168, 4)?.category === "blank", "Castle tile 168 should be the likely-unused white tile.");
  assert(landlookTileVisualSemantics(169, 4)?.label === "Short bookcase", "Castle tile 169 should be the short bookcase.");
  assert(landlookTileVisualSemantics(170, 4)?.label === "Tall bookcase with skull", "Castle tile 170 should be the tall bookcase with skull.");
  assert(landlookTileVisualSemantics(171, 4)?.label === "Wooden dresser", "Castle tile 171 should be the wooden dresser.");
  assert(landlookTileVisualSemantics(172, 4)?.notes?.includes("books on top"), "Castle tile 172 should be the dresser with books.");
  assert(landlookTileVisualSemantics(173, 4)?.label === "Green standing person statue", "Castle tile 173 should be the green person statue.");
  assert(landlookTileVisualSemantics(174, 4)?.label === "Blue standing person statue", "Castle tile 174 should be the blue person statue.");
  assert(landlookTileVisualSemantics(175, 4)?.label === "White standing person statue", "Castle tile 175 should be the white person statue.");
  assert(landlookTileVisualSemantics(176, 4)?.label === "Brazier or fire bowl", "Castle tile 176 should be the brazier.");
  assert(landlookTileVisualSemantics(177, 4)?.label === "Top half of tall purple throne", "Castle tile 177 should be the throne top.");
  assert(landlookTileVisualSemantics(178, 4)?.label === "Bottom half of tall purple throne", "Castle tile 178 should be the throne bottom.");
  assert(landlookTileVisualSemantics(179, 4)?.label === "Top of west-facing stone gargoyle", "Castle tile 179 should be the gargoyle top.");
  assert(landlookTileVisualSemantics(180, 4)?.label === "Bottom of west-facing stone gargoyle", "Castle tile 180 should be the gargoyle bottom.");
  assert(landlookTileVisualSemantics(181, 4)?.label === "Stone platform surrounded by water", "Castle tile 181 should be the water-surrounded stone platform.");
  assert(landlookTileVisualSemantics(182, 4)?.label === "Stone platform surrounded by acid", "Castle tile 182 should be the acid-surrounded stone platform.");
  assert(landlookTileVisualSemantics(183, 4)?.label === "Black stone platform surrounded by lava", "Castle tile 183 should be the lava-surrounded black platform.");
  assert(landlookTileVisualSemantics(184, 4)?.notes?.includes("blocking line of sight"), "Castle tile 184 should preserve the runed bubble LOS behavior.");
  assert(landlookTileVisualSemantics(185, 4)?.label === "Left half of coffin", "Castle tile 185 should be the coffin left half.");
  assert(landlookTileVisualSemantics(186, 4)?.label === "Right half of coffin", "Castle tile 186 should be the coffin right half.");
  assert(landlookTileVisualSemantics(187, 4)?.label === "North-wall open door, upper left component", "Castle tile 187 should be the upper-left north-wall door component.");
  assert(landlookTileVisualSemantics(188, 4)?.label === "North-wall open door, upper right component", "Castle tile 188 should be the upper-right north-wall door component.");
  assert(landlookTileVisualSemantics(189, 4)?.label === "North-wall east end cap", "Castle tile 189 should be the north-wall east end cap.");
  assert(landlookTileVisualSemantics(190, 4)?.notes?.includes("Vertical counterpart of tile 187"), "Castle tile 190 should be the lower counterpart of tile 187.");
  assert(landlookTileVisualSemantics(191, 4)?.notes?.includes("Vertical counterpart of tile 188"), "Castle tile 191 should be the lower counterpart of tile 188.");
  assert(landlookTileVisualSemantics(192, 4)?.notes?.includes("Vertical counterpart of tile 189"), "Castle tile 192 should be the counterpart of the north-wall end cap.");
  assert(landlookTileVisualSemantics(193, 4)?.label === "West-wall open door, upper component", "Castle tile 193 should be the upper west-wall door component.");
  assert(landlookTileVisualSemantics(194, 4)?.label === "East-wall open door, upper component", "Castle tile 194 should be the upper east-wall door component.");
  assert(landlookTileVisualSemantics(195, 4)?.label === "West-wall open door, lower component", "Castle tile 195 should be the lower west-wall door component.");
  assert(landlookTileVisualSemantics(196, 4)?.label === "East-wall open door, lower component", "Castle tile 196 should be the lower east-wall door component.");
  assert(landlookTileVisualSemantics(197, 4)?.label === "Cobblestone to east black wall", "Castle tile 197 should transition from cobblestone to an east wall.");
  assert(landlookTileVisualSemantics(198, 4)?.label === "Cobblestone to west black wall", "Castle tile 198 should mirror the tile 197 wall transition.");
  assert(landlookTileVisualSemantics(199, 4)?.confidence === "likely", "Castle tile 199 should preserve uncertainty about the purple object's exact purpose.");
  assert(landlookTileVisualSemantics(200, 4)?.notes?.includes("paired with tile 199"), "Castle tile 200 should be paired with tile 199.");
  assert(landlookTileVisualSemantics(1, 0)?.category === "water-shore", "Castle wall semantics should not replace Plains shoreline semantics.");
}

function checkHiddenWalkablePaletteSource() {
  const swatchSource = fs.readFileSync(path.join(root, "src/editor/components/TileSwatch.tsx"), "utf8");
  for (const snippet of ["isStockHiddenWalkableTile(tile, tileset?.landlook)", "isStockCombatClearingTile(tile, tileset?.landlook)", "tile-swatch--combat-clearing", "drawWhiteKeyedOverlayImage", "/divinity-manual/assets/pict2007.png"]) {
    assert(swatchSource.includes(snippet), `Tile palette hidden-walkable marker is missing: ${snippet}`);
  }
  const keyedSource = fs.readFileSync(path.join(root, "src/editor/map/whiteKeyedOverlay.ts"), "utf8");
  assert(keyedSource.includes("data[index + 3] = 0"), "Tile palette hidden-walkable marker should key the PICT's white pixels to transparency.");
  const filterSource = fs.readFileSync(path.join(root, "src/editor/components/MapViewFilters.tsx"), "utf8");
  assert(filterSource.includes('flag: "showCombatClearingOverlays"'), "Map Overlays should expose a dedicated combat-clearing toggle.");
  assert(filterSource.includes('label: "Combat Clearing"'), "The combat-clearing toggle should have an author-facing label.");
  const canvasSource = fs.readFileSync(path.join(root, "src/editor/components/MapCanvas.tsx"), "utf8");
  assert(canvasSource.includes("viewOptions.showCombatClearingOverlays) drawCombatClearingOverlay"), "Map rendering should gate the combat-clearing wash independently.");
}

function checkLandActionPointCommands(mapCommands, commands, markers) {
  const project = actionPointProject(landMap(0, 0));
  const hiddenWithoutActionPoint = mapCommands.setLandCellSecretState(project, {
    kind: "setLandCellSecretState",
    label: "Hide standalone cell",
    mapId: "land:0",
    x: 0,
    y: 0,
    state: "hidden"
  });
  assert(hiddenWithoutActionPoint.maps[0].tiles[0] === 3156, "A land cell should be authorable as hidden without an Action Point.");
  const revealedWithoutActionPoint = mapCommands.setLandCellSecretState(hiddenWithoutActionPoint, {
    kind: "setLandCellSecretState",
    label: "Reveal standalone cell",
    mapId: "land:0",
    x: 0,
    y: 0,
    state: "revealed"
  });
  assert(revealedWithoutActionPoint.maps[0].tiles[0] === 2156, "A standalone hidden land cell should be authorable as already revealed.");
  const normalizedWithoutActionPoint = mapCommands.setLandCellSecretState(revealedWithoutActionPoint, {
    kind: "setLandCellSecretState",
    label: "Normalize standalone cell",
    mapId: "land:0",
    x: 0,
    y: 0,
    state: "normal"
  });
  assert(normalizedWithoutActionPoint.maps[0].tiles[0] === 156, "Normalizing a standalone Secret Area should clear its marker band.");

  const created = commands.createActionPoint(normalizedWithoutActionPoint, {
    kind: "createActionPoint",
    label: "Create land AP",
    levelType: "land",
    levelIndex: 0,
    x: 0,
    y: 0
  });
  const trigger = created.triggers.find((candidate) => candidate.active);
  assert(Boolean(trigger), "Creating a land Action Point should allocate a trigger record.");
  assert(created.maps[0].tiles[0] === 1156, "Creating a land Action Point should add the +1000 runtime marker.");

  const secret = mapCommands.setLandCellSecretState(created, {
    kind: "setLandCellSecretState",
    label: "Hide AP cell",
    mapId: "land:0",
    x: 0,
    y: 0,
    state: "hidden"
  });
  assert(secret.maps[0].tiles[0] === 3156, "Hiding a land cell beneath an Action Point should write the hidden +3000 band.");
  assert(markers.actionPointMarkerStateForTrigger(secret, trigger) === "secret", "An Action Point should derive Secret status from its land cell.");

  const normalWithActionPoint = mapCommands.setLandCellSecretState(secret, {
    kind: "setLandCellSecretState",
    label: "Normalize AP cell",
    mapId: "land:0",
    x: 0,
    y: 0,
    state: "normal"
  });
  assert(normalWithActionPoint.maps[0].tiles[0] === 1156, "Normalizing an AP-backed land cell should retain the +1000 Action Point marker.");
  const hiddenAgain = mapCommands.setLandCellSecretState(normalWithActionPoint, {
    kind: "setLandCellSecretState",
    label: "Hide AP cell again",
    mapId: "land:0",
    x: 0,
    y: 0,
    state: "hidden"
  });

  const repainted = mapCommands.paintTiles(hiddenAgain, "land:0", [{ x: 0, y: 0, index: 0, from: 3156, to: 157 }]);
  assert(repainted.maps[0].tiles[0] === 3157, "Painting terrain under a hidden land cell should preserve its Secret Area band.");

  const moved = commands.moveActionPoint(repainted, {
    kind: "moveActionPoint",
    label: "Move AP off hidden cell",
    triggerId: trigger.id,
    levelType: "land",
    levelIndex: 0,
    x: 1,
    y: 0
  });
  const movedTrigger = moved.triggers.find((candidate) => candidate.active);
  assert(moved.maps[0].tiles[0] === 3157, "Moving a land Action Point should preserve the independently authored hidden state of its old cell.");
  assert(moved.maps[0].tiles[90] === 1156, "Moving a land Action Point should add only the normal AP marker at a normal destination.");

  const cleared = commands.deleteTrigger(moved, movedTrigger.id);
  assert(cleared.maps[0].tiles[90] === 156, "Deleting the last land Action Point on a cell should clear its marker.");
  assert(cleared.maps[0].tiles[0] === 3157, "Deleting or moving a land Action Point should not clear standalone Secret Area state.");

  const createdOnHidden = commands.createActionPoint(cleared, {
    kind: "createActionPoint",
    label: "Create AP on hidden cell",
    levelType: "land",
    levelIndex: 0,
    x: 0,
    y: 0
  });
  assert(createdOnHidden.maps[0].tiles[0] === 3157, "Creating an Action Point on a hidden land cell should preserve its Secret Area state.");
  const createdOnHiddenTrigger = createdOnHidden.triggers.find((candidate) => candidate.active);
  const deletedFromHidden = commands.deleteTrigger(createdOnHidden, createdOnHiddenTrigger.id);
  assert(deletedFromHidden.maps[0].tiles[0] === 3157, "Deleting an Action Point from a hidden cell should leave the standalone Secret Area intact.");
  const repaintedStandalone = mapCommands.paintTiles(deletedFromHidden, "land:0", [{ x: 0, y: 0, index: 0, from: 3157, to: 169 }]);
  assert(repaintedStandalone.maps[0].tiles[0] === 3169, "Painting a standalone Secret Area should preserve its hidden state without requiring an Action Point.");
}

function checkDungeonActionPointCommands(mapCommands, commands, markers) {
  const project = actionPointProject(dungeonMap(0, [1, 1, 1, 1]));
  const created = commands.createActionPoint(project, {
    kind: "createActionPoint",
    label: "Create dungeon AP",
    levelType: "dungeon",
    levelIndex: 0,
    x: 0,
    y: 0
  });
  const trigger = created.triggers.find((candidate) => candidate.active);
  assert((created.maps[0].tiles[0] & 0x1000) !== 0, "Creating a dungeon Action Point should set the runtime 0x1000 marker.");

  const secret = mapCommands.updateDungeonCellFlags(created, {
    kind: "updateDungeonCellFlags",
    label: "Paint dungeon secret directions",
    mapId: "dungeon:0",
    flags: { allowMoveNorth: true, allowMoveSouth: true },
    cells: [{ x: 0, y: 0, index: 0, from: created.maps[0].tiles[0] }]
  });
  const secretMask = secret.maps[0].tiles[0] & 0xffff;
  assert((secretMask & 0x1500) === 0x1500, "Dungeon Secret Action Point should retain AP, north, and south bits.");
  assert((secretMask & 0x0a00) === 0, "Dungeon Secret Action Point should not set unselected approach directions.");
  assert(markers.actionPointMarkerStateForTrigger(secret, trigger) === "secret", "Dungeon Secret Action Point status should derive from painted Allow Move flags.");

  const moved = commands.moveActionPoint(secret, {
    kind: "moveActionPoint",
    label: "Move dungeon secret AP",
    triggerId: trigger.id,
    levelType: "dungeon",
    levelIndex: 0,
    x: 1,
    y: 0
  });
  const movedTrigger = moved.triggers.find((candidate) => candidate.active);
  assert((moved.maps[0].tiles[0] & 0x1000) === 0, "Moving a dungeon Action Point should clear its old AP marker.");
  assert((moved.maps[0].tiles[0] & 0x0500) === 0x0500, "Moving a dungeon Action Point should preserve the old cell's painted secret-passage directions.");
  assert((moved.maps[0].tiles[1] & 0x1000) === 0x1000, "Moving a dungeon Action Point should set the AP marker at its destination.");
  assert((moved.maps[0].tiles[1] & 0x0f00) === 0, "Moving a dungeon Action Point should not copy secret-passage geometry to its destination.");

  const cleared = commands.deleteTrigger(moved, movedTrigger.id);
  assert((cleared.maps[0].tiles[1] & 0x1000) === 0, "Deleting the last dungeon Action Point on a cell should clear the runtime marker.");
  assert((cleared.maps[0].tiles[0] & 0x0500) === 0x0500, "Deleting or moving a dungeon AP should preserve independently authored secret-passage directions.");

  const existingPassage = actionPointProject(dungeonMap(0, [0x0501, 1, 1, 1]));
  const createdOnPassage = commands.createActionPoint(existingPassage, {
    kind: "createActionPoint",
    label: "Create AP on secret passage",
    levelType: "dungeon",
    levelIndex: 0,
    x: 0,
    y: 0
  });
  assert((createdOnPassage.maps[0].tiles[0] & 0x1500) === 0x1500, "Creating a dungeon AP on an existing secret passage should preserve its directions and add the AP marker.");
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
  assert(landlookGroupTiles(customTileset(), "routes", next.tileAttributes, {}).includes(147), "route palette group does not include source-backed/custom boat tile 147");
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
  const generatedBaselineProject = {
    ...project,
    source: {
      ...project.source,
      sourcePath: "generated://starter",
      rawSourcesDir: "generated-runtime",
      files: [{ name: "Scenario", relativePath: "Scenario", bytes: 600, sha256: "generated", role: "pass-through", editable: false }]
    }
  };
  assert(isProjectEmpty(generatedBaselineProject), "Generated runtime baseline files should not prevent importing into an untouched starter project.");
  const importedSourceProject = {
    ...project,
    source: {
      ...project.source,
      sourcePath: "F:/Realmz/Scenarios/Tutorial",
      files: [{ name: "Data LD", relativePath: "Data LD", bytes: 16200, sha256: "imported", role: "supported-binary", editable: true }]
    }
  };
  assert(!isProjectEmpty(importedSourceProject), "Captured files from an imported Realmz scenario should keep replacement import disabled.");
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

function actionPointProject(map) {
  return {
    maps: [map],
    triggers: [],
    editorMetadata: { displayNames: {} },
    scenario: {}
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
