import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true }
});

const failures = [];

try {
  const commands = await server.ssrLoadModule("/src/editor/projectCommands/targetRecordCommands.ts");
  const iconLibrary = await server.ssrLoadModule("/src/editor/iconLibrary.ts");
  const cicnEncoder = await server.ssrLoadModule("/src/editor/cicnEncoder.ts");

  checkUpdateMonsterRecord(commands);
  checkCreateMonsterVariantFromNormal(commands);
  checkCopyCurrentMonsterToAllSets(commands);
  checkCreateMonstersFromTemplates(commands);
  checkSwitchMonsterRecords(commands);
  checkGenerateMonsterVariants(commands);
  checkMonsterIconOverrideCommands(commands);
  checkScenarioIconResourceCommands(commands);
  checkIconLibraryMonsterPairMetadata(iconLibrary);
  checkCicnEncoder(cicnEncoder);

  if (failures.length > 0) {
    console.error("Combat monster command checks failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Combat monster command checks passed.");
  }
} finally {
  await server.close();
}

function checkUpdateMonsterRecord({ updateMonsterRecord }) {
  const project = projectWith({
    monsters: [monster(4, { displayName: "Normal", armor: 10 })],
    monsterSets: [
      monsterSet(1, [monster(4, { displayName: "Monster", armor: 20 })]),
      monsterSet(-1, [monster(4, { displayName: "Mega", armor: 30 })])
    ]
  });
  const next = updateMonsterRecord(project, 4, { armor: 77, displayName: "Changed Monster" }, 1);
  assert(findNormal(next, 4).armor === 10, "updateMonsterRecord changed Normal while editing Monster set");
  assert(findSet(next, 1, 4).armor === 77, "updateMonsterRecord did not update Monster set");
  assert(findSet(next, 1, 4).displayName === "Changed Monster", "updateMonsterRecord did not update Monster set name");
  assert(findSet(next, -1, 4).armor === 30, "updateMonsterRecord changed Mega while editing Monster set");
}

function checkCreateMonsterVariantFromNormal({ createMonsterVariantFromNormal }) {
  const source = monster(7, { displayName: "Normal Seven", armor: 42, spells: [1104, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  const project = projectWith({ monsters: [source], monsterSets: [] });
  const next = createMonsterVariantFromNormal(project, 7, -1);
  assert(monsterSemanticEqual(findSet(next, -1, 7), source), "createMonsterVariantFromNormal did not copy Normal data into Mega");
  assert(findNormal(next, 7).armor === 42, "createMonsterVariantFromNormal changed Normal");
}

function checkCopyCurrentMonsterToAllSets({ copyCurrentMonsterToAllSets }) {
  const source = monster(3, { displayName: "Source Monster Set", armor: 88, hitDice: 12, money: [5, 2, 1] });
  const project = projectWith({
    monsters: [monster(3, { displayName: "Normal", armor: 10 })],
    monsterSets: [monsterSet(1, [source]), monsterSet(-1, [monster(3, { displayName: "Mega", armor: 30 })])]
  });
  const next = copyCurrentMonsterToAllSets(project, 3, 1);
  assert(monsterSemanticEqual(findNormal(next, 3), source), "copyCurrentMonsterToAllSets did not copy source into Normal");
  assert(monsterSemanticEqual(findSet(next, 1, 3), source), "copyCurrentMonsterToAllSets changed source set data");
  assert(monsterSemanticEqual(findSet(next, -1, 3), source), "copyCurrentMonsterToAllSets did not copy source into Mega");
}

function checkCreateMonstersFromTemplates({ createMonstersFromTemplates }) {
  const project = projectWith({
    monsters: [
      monster(1, { displayName: "Existing One", armor: 11 }),
      monster(9, { displayName: "Existing Nine", armor: 99 })
    ],
    monsterDescriptions: [{ id: 1, text: "Existing description", authored: true }]
  });
  const next = createMonstersFromTemplates(project, [
    { id: 2, template: monster(2, { displayName: "Copied Two", armor: 22 }), description: "Two description" },
    { id: 5, template: monster(5, { displayName: "Copied Five", armor: 55 }) }
  ]);

  assert(findNormal(next, 1).displayName === "Existing One", "createMonstersFromTemplates changed an unrelated existing monster");
  assert(findNormal(next, 2).displayName === "Copied Two", "createMonstersFromTemplates did not create the first copied monster");
  assert(findNormal(next, 5).armor === 55, "createMonstersFromTemplates did not create the second copied monster");
  assert(findNormal(next, 9).armor === 99, "createMonstersFromTemplates changed an unrelated later monster");
  assert(description(next, 1) === "Existing description", "createMonstersFromTemplates changed an unrelated description");
  assert(description(next, 2) === "Two description", "createMonstersFromTemplates did not write copied description");
}

function checkSwitchMonsterRecords({ switchMonsterRecords }) {
  const project = projectWith({
    monsters: [monster(1, { displayName: "Normal One", armor: 11 }), monster(2, { displayName: "Normal Two", armor: 22 })],
    monsterSets: [monsterSet(1, [monster(1, { displayName: "Monster One", armor: 101 }), monster(2, { displayName: "Monster Two", armor: 202 })])],
    monsterDescriptions: [
      { id: 1, text: "One description", authored: true },
      { id: 2, text: "Two description", authored: true }
    ]
  });
  const next = switchMonsterRecords(project, 1, 1, 2);
  assert(findNormal(next, 1).displayName === "Normal One", "switchMonsterRecords changed Normal set");
  assert(findSet(next, 1, 1).displayName === "Monster Two", "switchMonsterRecords did not move target into source id");
  assert(findSet(next, 1, 2).displayName === "Monster One", "switchMonsterRecords did not move source into target id");
  assert(findSet(next, 1, 1).id === 1 && findSet(next, 1, 2).id === 2, "switchMonsterRecords did not preserve destination ids");
  assert(description(next, 1) === "Two description", "switchMonsterRecords did not swap description into source id");
  assert(description(next, 2) === "One description", "switchMonsterRecords did not swap description into target id");
}

function checkGenerateMonsterVariants({ generateMonsterVariants }) {
  const source = monster(9, {
    displayName: "Clamped Source",
    hitDice: 250,
    staminaBonus: 120,
    agility: 126,
    movementMax: 126,
    armor: 120,
    magicResistance: 120,
    damageBonus: 126,
    saves: [120, 121, 122, 123, 124, 125],
    spellPoints: 800,
    maxSpellPoints: 100,
    exp: 30000,
    attacks: [[1, 6, 32, 4], [2, 12, 33, 5], [0, 0, 31, 0], [0, 0, 31, 0], [0, 0, 31, 0]],
    spells: [1104, 2208, 0, 0, 0, 0, 0, 0, 0, 0],
    items: [92, 223, 0, 0, 0, 0],
    money: [100, 3, 1],
    iconId: 430,
    weapon: 12,
    deathMacro: 77,
    conditions: Array.from({ length: 40 }, (_, index) => index % 5)
  });
  const project = projectWith({
    monsters: [source],
    monsterSets: [monsterSet(1, [monster(9, { displayName: "Old Monster", armor: 1 })])]
  });
  const next = generateMonsterVariants(project, 9);
  const monsterVariant = findSet(next, 1, 9);
  const megaVariant = findSet(next, -1, 9);

  assert(findNormal(next, 9).armor === 120, "generateMonsterVariants changed Normal set");
  assert(monsterVariant.hitDice === 255 && megaVariant.hitDice === 255, "generateMonsterVariants did not clamp hit dice");
  assert(monsterVariant.staminaBonus === 126 && megaVariant.staminaBonus === 127, "generateMonsterVariants did not clamp stamina bonus");
  assert(monsterVariant.spellPoints === 999 && megaVariant.spellPoints === 999, "generateMonsterVariants did not clamp spell points");
  assert(monsterVariant.maxSpellPoints === 999 && megaVariant.maxSpellPoints === 999, "generateMonsterVariants did not clamp max spell points");
  assert(monsterVariant.exp === 32767 && megaVariant.exp === 32767, "generateMonsterVariants did not clamp experience");
  assert(JSON.stringify(monsterVariant.attacks) === JSON.stringify(source.attacks), "generateMonsterVariants changed attack rows");
  assert(JSON.stringify(megaVariant.spells) === JSON.stringify(source.spells), "generateMonsterVariants changed spell ids");
  assert(JSON.stringify(megaVariant.items) === JSON.stringify(source.items), "generateMonsterVariants changed item ids");
  assert(JSON.stringify(megaVariant.money) === JSON.stringify(source.money), "generateMonsterVariants changed money rewards");
  assert(megaVariant.iconId === source.iconId && megaVariant.weapon === source.weapon && megaVariant.deathMacro === source.deathMacro, "generateMonsterVariants changed semantic references");
}

function checkMonsterIconOverrideCommands({ upsertMonsterIconOverride, deleteMonsterIconOverride }) {
  const project = projectWith();
  const override = {
    targetBaseIconId: -387,
    sourceBaseIconId: 409,
    sourceKind: "monster-mash",
    sourceLabel: "Monster Mash 409",
    sourceBaseResourceBase64: "AQID",
    sourcePairedResourceBase64: "BAUG"
  };
  const added = upsertMonsterIconOverride(project, override);
  assert(added.monsterIconOverrides.length === 1, "upsertMonsterIconOverride did not add an override");
  assert(added.monsterIconOverrides[0].targetBaseIconId === 387, "upsertMonsterIconOverride did not normalize target id");
  assert(added.monsterIconOverrides[0].sourceBaseIconId === 409, "upsertMonsterIconOverride did not preserve source id");

  const replaced = upsertMonsterIconOverride(added, { ...override, sourceBaseIconId: 410, sourceLabel: "Monster Mash 410" });
  assert(replaced.monsterIconOverrides.length === 1, "upsertMonsterIconOverride duplicated a target override instead of replacing it");
  assert(replaced.monsterIconOverrides[0].sourceBaseIconId === 410, "upsertMonsterIconOverride did not replace the target override");

  const invalid = upsertMonsterIconOverride(replaced, { ...override, targetBaseIconId: 0 });
  assert(invalid.monsterIconOverrides.length === 1, "upsertMonsterIconOverride accepted an invalid target override");

  const deleted = deleteMonsterIconOverride(replaced, 387);
  assert(deleted.monsterIconOverrides.length === 0, "deleteMonsterIconOverride did not remove the target override");
}

function checkScenarioIconResourceCommands({ upsertScenarioIconResource, deleteScenarioIconResource }) {
  const project = projectWith();
  const resource = {
    resourceId: -30126,
    label: "Custom Gem",
    sourceKind: "providence-library",
    resourceBase64: "AQID",
    previewPath: "data:image/png;base64,AAA="
  };
  const added = upsertScenarioIconResource(project, resource);
  assert(added.scenarioIconResources.length === 1, "upsertScenarioIconResource did not add a resource");
  assert(added.scenarioIconResources[0].resourceId === 30126, "upsertScenarioIconResource did not normalize resource id");
  assert((added.assetCatalog.icons ?? []).some((asset) => asset.id === "scenario-icon-resource-30126"), "upsertScenarioIconResource did not add an icon catalog entry");

  const replaced = upsertScenarioIconResource(added, { ...resource, label: "Custom Gem Updated", resourceBase64: "BAUG" });
  assert(replaced.scenarioIconResources.length === 1, "upsertScenarioIconResource duplicated a resource instead of replacing it");
  assert(replaced.scenarioIconResources[0].label === "Custom Gem Updated", "upsertScenarioIconResource did not replace the resource");

  const invalid = upsertScenarioIconResource(replaced, { ...resource, resourceId: 0 });
  assert(invalid.scenarioIconResources.length === 1, "upsertScenarioIconResource accepted an invalid resource id");

  const deleted = deleteScenarioIconResource(replaced, 30126);
  assert(deleted.scenarioIconResources.length === 0, "deleteScenarioIconResource did not remove the resource");
  assert(!(deleted.assetCatalog.icons ?? []).some((asset) => asset.id === "scenario-icon-resource-30126"), "deleteScenarioIconResource did not remove the icon catalog entry");
}

function checkIconLibraryMonsterPairMetadata({
  createIconLibraryEntry,
  duplicateIconLibraryEntry,
  iconLibraryMonsterPairMetadata,
  iconLibraryEntryResources
}) {
  const baseResource = {
    role: "base",
    resourceId: 700,
    resourceType: "cicn",
    label: "Imported base",
    resourceBase64: "AQID",
    previewPath: "data:image/png;base64,AAA=",
    width: 64,
    height: 32
  };
  const pairedResource = {
    role: "paired",
    resourceId: 1008,
    resourceType: "cicn",
    label: "Imported paired",
    resourceBase64: "BAUG",
    previewPath: "data:image/png;base64,BBB=",
    width: 64,
    height: 32
  };
  const created = createIconLibraryEntry(null, "browser://test", {
    kind: "monster-pair",
    label: "Mirrored Monster Icon",
    facingMode: "mirrored",
    canvas: { width: 64, height: 32 },
    resources: [baseResource, pairedResource]
  });
  assert(created.entity, "createIconLibraryEntry did not create a valid monster-pair icon entry");
  const metadata = iconLibraryMonsterPairMetadata(created.entity);
  assert(metadata.facingMode === "mirrored", "iconLibraryMonsterPairMetadata did not preserve mirrored facing mode");
  assert(metadata.canvas?.width === 64 && metadata.canvas?.height === 32, "iconLibraryMonsterPairMetadata did not preserve canvas dimensions");
  const resources = iconLibraryEntryResources(created.entity);
  assert(resources[0].width === 64 && resources[0].height === 32, "iconLibraryEntryResources did not preserve resource dimensions");

  const duplicated = duplicateIconLibraryEntry(created.catalog, created.entity.id);
  assert(duplicated.entity, "duplicateIconLibraryEntry did not duplicate monster-pair icon entry");
  const duplicateMetadata = iconLibraryMonsterPairMetadata(duplicated.entity);
  assert(duplicateMetadata.facingMode === "mirrored", "duplicateIconLibraryEntry did not preserve facing metadata");
  assert(duplicateMetadata.canvas?.width === 64 && duplicateMetadata.canvas?.height === 32, "duplicateIconLibraryEntry did not preserve canvas metadata");

  const invalid = createIconLibraryEntry(created.catalog, "browser://test", {
    kind: "monster-pair",
    label: "Broken Pair",
    resources: [{ ...baseResource, resourceId: 701 }, { ...pairedResource, resourceId: 702 }]
  });
  assert(!invalid.entity, "createIconLibraryEntry accepted a monster-pair without base/base+308 ids");
}

function checkCicnEncoder({ encodeCicnResource, mirrorRgbaHorizontally }) {
  for (const [width, height] of [[32, 32], [32, 64], [64, 32], [64, 64]]) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) {
      rgba[pixel * 4] = (pixel * 7) & 0xff;
      rgba[pixel * 4 + 1] = (pixel * 11) & 0xff;
      rgba[pixel * 4 + 2] = (pixel * 13) & 0xff;
      rgba[pixel * 4 + 3] = 255;
    }
    const encoded = encodeCicnResource({ width, height, rgba });
    assert(encoded.length > 82, `encodeCicnResource emitted a too-short ${width}x${height} resource`);
    assert(readI16(encoded, 12) - readI16(encoded, 8) === width, `encodeCicnResource did not write ${width}px width`);
    assert(readI16(encoded, 10) - readI16(encoded, 6) === height, `encodeCicnResource did not write ${height}px height`);
    const mirrored = mirrorRgbaHorizontally({ width, height, rgba });
    assert(mirrored.length === rgba.length, "mirrorRgbaHorizontally changed byte length");
  }
}

function projectWith(overrides = {}) {
  return {
    monsters: [],
    monsterSets: [],
    monsterDescriptions: [],
    monsterIconOverrides: [],
    scenarioIconResources: [],
    assetCatalog: { icons: [] },
    ...overrides
  };
}

function monsterSet(setId, monsters) {
  return {
    setId,
    sourceFile: setId === 1 ? "Data MD1" : "Data MD-1",
    monsters
  };
}

function monster(id, overrides = {}) {
  return {
    id,
    hitDice: 1,
    staminaBonus: 0,
    agility: 10,
    nameId: 0,
    movementMax: 10,
    armor: 0,
    magicResistance: 0,
    distance: 0,
    traitor: 0,
    size: 0,
    typeFlags: Array(8).fill(0),
    attackCount: 1,
    magicAttackCount: 0,
    attacks: [[1, 2, 31, 0], [0, 0, 31, 0], [0, 0, 31, 0], [0, 0, 31, 0], [0, 0, 31, 0]],
    damageBonus: 0,
    castPercent: 0,
    runPercent: 0,
    surrenderPercent: 0,
    missilePercent: 0,
    canSummon: 0,
    saves: Array(6).fill(0),
    spellImmunities: Array(6).fill(0),
    money: [0, 0, 0],
    spells: Array(10).fill(0),
    items: Array(6).fill(0),
    weapon: 0,
    iconId: 0,
    spellPoints: 0,
    exp: 0,
    stamina: 0,
    staminaMax: 0,
    underneath: Array(4).fill(0),
    target: 0,
    guarding: 0,
    notOnMenu: false,
    beenAttacked: 0,
    movement: 0,
    magicToHit: 0,
    conditions: Array(40).fill(0),
    lr: 0,
    up: 0,
    attackNum: 0,
    bonusAttack: 0,
    deathMacro: 0,
    maxSpellPoints: 0,
    displayName: `Monster ${id}`,
    rawBytes: Array(210).fill(0),
    authored: true,
    ...overrides
  };
}

function findNormal(project, id) {
  return project.monsters.find((record) => record.id === id);
}

function findSet(project, setId, id) {
  return project.monsterSets.find((set) => set.setId === setId)?.monsters.find((record) => record.id === id);
}

function description(project, id) {
  return project.monsterDescriptions.find((record) => record.id === id)?.text;
}

function monsterSemanticEqual(actual, expected) {
  const normalizedActual = normalizeMonster(actual);
  const normalizedExpected = normalizeMonster(expected);
  return JSON.stringify(normalizedActual) === JSON.stringify(normalizedExpected);
}

function normalizeMonster(record) {
  if (!record) return null;
  const {
    id: _id,
    authored: _authored,
    provenance: _provenance,
    rawBytes: _rawBytes,
    ...rest
  } = record;
  return rest;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readI16(bytes, offset) {
  const value = (bytes[offset] << 8) | bytes[offset + 1];
  return value & 0x8000 ? value - 0x10000 : value;
}
