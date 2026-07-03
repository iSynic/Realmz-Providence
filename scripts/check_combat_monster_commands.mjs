import { createServer } from "vite";
import fs from "node:fs";

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
  const combatPanel = await server.ssrLoadModule("/src/editor/panels/CombatPanel.tsx");
  const battleReferences = await server.ssrLoadModule("/src/editor/battleReferences.ts");
  const realmzParser = await server.ssrLoadModule("/src/editor/browser/realmzParser.ts");

  checkUpdateMonsterRecord(commands);
  checkCreateMonsterVariantFromNormal(commands);
  checkCopyCurrentMonsterToAllSets(commands);
  checkClearMonsterRecord(commands);
  checkCreateMonstersFromTemplates(commands);
  checkSwitchMonsterRecords(commands);
  checkGenerateMonsterVariants(commands);
  checkGenerateMonsterVariantsForAll(commands);
  checkBattleReferenceCommands(commands, battleReferences);
  checkPaintBattleGridCells(commands);
  checkBattleRuntimeMonsterLimit(battleReferences);
  checkMonsterIconOverrideCommands(commands);
  checkMonsterIconTargetOverrideResolution(commands, combatPanel);
  checkScenarioIconResourceCommands(commands);
  checkScenarioMonsterIconOverrideImport(realmzParser, combatPanel);
  checkIconLibraryMonsterPairMetadata(iconLibrary);
  checkCicnEncoder(cicnEncoder);
  checkScenarioMonsterIconTargetAllocation(combatPanel);
  checkMonsterRequiredWeaponEncoding(combatPanel);
  await checkScenarioMonsterIconTargetFiltering(combatPanel);
  await checkMonsterIconPickerOptions(combatPanel);
  await checkMonsterLibraryIconOverrideMaterialization(combatPanel, commands);

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

function checkClearMonsterRecord({ clearMonsterRecord }) {
  const project = projectWith({
    monsters: [monster(3, { displayName: "Normal Three" }), monster(4, { displayName: "Normal Four" })],
    monsterSets: [
      monsterSet(1, [monster(3, { displayName: "Monster Three" }), monster(5, { displayName: "Monster Five" })]),
      monsterSet(-1, [monster(3, { displayName: "Mega Three" })])
    ],
    monsterDescriptions: [
      { id: 3, text: "Three description", authored: true },
      { id: 5, text: "Five description", authored: true }
    ]
  });
  let next = clearMonsterRecord(project, 3, 1);
  assert(isBlankMonster(findSet(next, 1, 3)), "clearMonsterRecord did not blank the selected Monster-set slot");
  assert(findNormal(next, 3)?.displayName === "Normal Three", "clearMonsterRecord changed Normal while clearing Monster set");
  assert(findSet(next, -1, 3)?.displayName === "Mega Three", "clearMonsterRecord changed Mega while clearing Monster set");
  assert(description(next, 3) === "Three description", "clearMonsterRecord removed shared description while other set records remain active");

  next = clearMonsterRecord(next, 3, 0);
  assert(isBlankMonster(findNormal(next, 3)), "clearMonsterRecord did not blank the Normal slot");
  assert(findNormal(next, 4)?.displayName === "Normal Four", "clearMonsterRecord shifted or changed an unrelated Normal monster");
  assert(findSet(next, -1, 3)?.displayName === "Mega Three", "clearMonsterRecord changed Mega while clearing Normal");
  assert(description(next, 3) === "Three description", "clearMonsterRecord removed description before the last active set record was cleared");

  next = clearMonsterRecord(next, 3, -1);
  assert(isBlankMonster(findSet(next, -1, 3)), "clearMonsterRecord did not blank the selected Mega-set slot");
  assert(description(next, 3) === undefined, "clearMonsterRecord left orphan Data DES text after clearing the last active set record");

  next = clearMonsterRecord(next, 5, 1);
  assert(isBlankMonster(findSet(next, 1, 5)), "clearMonsterRecord did not keep the alternate-set blank slot");
  assert(next.monsterSets.some((set) => set.setId === 1), "clearMonsterRecord removed the alternate monster set instead of keeping blank slots");
  assert(description(next, 5) === undefined, "clearMonsterRecord left orphan alternate-set description");
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
  assert(findNormal(next, 2).nameId === 2, "createMonstersFromTemplates did not normalize hidden monster nameId to the scenario slot");
  assert(findNormal(next, 5).armor === 55, "createMonstersFromTemplates did not create the second copied monster");
  assert(findNormal(next, 5).nameId === 5, "createMonstersFromTemplates did not normalize copied monster nameId to the scenario slot");
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

function checkGenerateMonsterVariantsForAll({ generateMonsterVariantsForAll }) {
  const blank = blankMonster(2);
  const project = projectWith({
    monsters: [
      monster(1, { displayName: "Normal One", hitDice: 5, armor: 10, spellPoints: 30, exp: 100 }),
      blank,
      monster(3, { displayName: "Normal Three", hitDice: 8, armor: 30, spellPoints: 60, exp: 200 })
    ],
    monsterSets: [
      monsterSet(1, [
        monster(1, { displayName: "Old Monster One", armor: 1 }),
        monster(2, { displayName: "Keep Blank Source Variant", armor: 55 })
      ]),
      monsterSet(-1, [monster(3, { displayName: "Old Mega Three", armor: 3 })])
    ]
  });
  const next = generateMonsterVariantsForAll(project, [3, 2, 1, 3, 999]);
  assert(findNormal(next, 1).armor === 10 && findNormal(next, 3).armor === 30, "generateMonsterVariantsForAll changed Normal records");
  assert(findSet(next, 1, 1).armor === 20, "generateMonsterVariantsForAll did not generate Monster variant for the first active Normal record");
  assert(findSet(next, -1, 1).armor === 40, "generateMonsterVariantsForAll did not generate Mega variant for the first active Normal record");
  assert(findSet(next, 1, 3).armor === 40, "generateMonsterVariantsForAll did not generate Monster variant for the later active Normal record");
  assert(findSet(next, -1, 3).armor === 60, "generateMonsterVariantsForAll did not overwrite Mega variant for the later active Normal record");
  assert(findSet(next, 1, 2).displayName === "Keep Blank Source Variant", "generateMonsterVariantsForAll generated variants from a blank Normal slot");
}

function checkBattleReferenceCommands({ rewriteBattleMonsterReferences }, { battleReferencesForMonster }) {
  const project = projectWith({
    battles: [
      battle(1, [7, -7, 8, -8, 9, -9]),
      battle(2, [0, 7])
    ]
  });
  const references = battleReferencesForMonster(project, 7);
  assert(references.length === 3, "battleReferencesForMonster did not index every matching battle cell");
  assert(references.some((reference) => reference.rawValue === -7 && reference.forcedFriendly), "battleReferencesForMonster did not preserve Force Friends sign state");

  const replaced = rewriteBattleMonsterReferences(project, { mode: "replace", fromId: 7, toId: 12 });
  assert(replaced.battles[0].grid[0] === 12 && replaced.battles[0].grid[1] === -12 && replaced.battles[1].grid[1] === 12, "rewriteBattleMonsterReferences replace did not preserve signed references");

  const cleared = rewriteBattleMonsterReferences(replaced, { mode: "clear", monsterId: 12 });
  assert(cleared.battles[0].grid[0] === 0 && cleared.battles[0].grid[1] === 0 && cleared.battles[1].grid[1] === 0, "rewriteBattleMonsterReferences clear did not erase all matching cells");

  const swapped = rewriteBattleMonsterReferences(project, { mode: "swap", fromId: 8, toId: 9 });
  assert(swapped.battles[0].grid[2] === 9 && swapped.battles[0].grid[3] === -9, "rewriteBattleMonsterReferences swap did not move source IDs with sign preserved");
  assert(swapped.battles[0].grid[4] === 8 && swapped.battles[0].grid[5] === -8, "rewriteBattleMonsterReferences swap did not move target IDs with sign preserved");
}

function checkPaintBattleGridCells({ paintBattleGridCells }) {
  const project = projectWith({
    battles: [battle(1, [7, -7, 0, 8])]
  });
  const next = paintBattleGridCells(project, 1, [
    { index: 0, from: 7, to: 12 },
    { index: 1, from: -7, to: -12 },
    { index: 2, from: 0, to: -9 },
    { index: 200, from: 0, to: 99 }
  ]);
  assert(next !== project, "paintBattleGridCells did not update a changed battle grid");
  assert(next.battles[0].grid.length === 169, "paintBattleGridCells did not normalize Data BD grid length");
  assert(next.battles[0].grid[0] === 12, "paintBattleGridCells did not replace a positive monster placement");
  assert(next.battles[0].grid[1] === -12, "paintBattleGridCells did not preserve negative Force Friends placement values");
  assert(next.battles[0].grid[2] === -9, "paintBattleGridCells did not apply a new signed monster placement");
  assert(next.battles[0].grid[3] === 8, "paintBattleGridCells changed an untouched battle cell");
  const unchanged = paintBattleGridCells(next, 1, [{ index: 3, from: 8, to: 8 }]);
  assert(unchanged === next, "paintBattleGridCells returned a new project for unchanged cells");
}

function checkBattleRuntimeMonsterLimit({ BATTLE_RUNTIME_MONSTER_LIMIT, countBattleRuntimeMonsterSlots }) {
  const atLimitGrid = Array.from({ length: 13 * 13 }, (_, index) => index < BATTLE_RUNTIME_MONSTER_LIMIT ? 1 : 0);
  const overLimitGrid = Array.from({ length: 13 * 13 }, (_, index) => index <= BATTLE_RUNTIME_MONSTER_LIMIT ? 1 : 0);
  assert(countBattleRuntimeMonsterSlots(atLimitGrid) === BATTLE_RUNTIME_MONSTER_LIMIT, "countBattleRuntimeMonsterSlots did not count the exact Realmz runtime cap");
  assert(countBattleRuntimeMonsterSlots(overLimitGrid) === BATTLE_RUNTIME_MONSTER_LIMIT + 1, "countBattleRuntimeMonsterSlots did not count over-cap battle placements");
  const validationSource = fs.readFileSync("src/editor/targetValidation.ts", "utf8");
  assert(validationSource.includes("countBattleRuntimeMonsterSlots(record.grid)"), "battle validation does not use the shared runtime monster slot counter");
  assert(validationSource.includes('recordIssue("error", recordType, recordId, "battle-monster-cap"'), "battle validation does not hard-error above the 100 placed monster cap");
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

function checkMonsterIconTargetOverrideResolution({ upsertMonsterIconOverride, deleteMonsterIconOverride }, { monsterIconTargetPairs }) {
  const actorAssets = new Map([
    [473, libraryIconAsset(473)],
    [781, libraryIconAsset(781)]
  ]);
  const lookupsFor = (project) => ({
    iconAssetsByAbsId: new Map(),
    realmzActorIconAssetsByAbsId: actorAssets,
    monsterMashAssetsByAbsId: new Map([
      [481, monsterMashIconAsset(481)],
      [789, monsterMashIconAsset(789)]
    ]),
    monsterIconOverridesByTarget: new Map((project.monsterIconOverrides ?? []).map((override) => [override.targetBaseIconId, override]))
  });
  let project = projectWith({ monsters: [monster(2, { iconId: 473 }), monster(6, { iconId: 481 })] });
  let targets = monsterIconTargetPairs(project, lookupsFor(project));
  assert(targets.some((target) => target.baseId === 473 && !target.override), "default target art was not visible without a scenario override");
  assert(project.monsterIconOverrides.length === 0, "default target art was counted as scenario-owned override data");
  assert(!targets.some((target) => target.baseId === 481), "Monster Mash-only source art appeared as target art before materialization");

  project = upsertMonsterIconOverride(project, {
    targetBaseIconId: 473,
    sourceBaseIconId: 409,
    sourceKind: "monster-mash",
    sourceLabel: "Monster Mash 409",
    sourceBaseResourceBase64: "AQID",
    sourcePairedResourceBase64: "BAUG"
  });
  targets = monsterIconTargetPairs(project, lookupsFor(project));
  assert(project.monsterIconOverrides.length === 1, "replacing a default target did not create exactly one scenario override");
  assert(targets.find((target) => target.baseId === 473)?.override?.sourceBaseIconId === 409, "replacement override did not shadow default target art");

  project = upsertMonsterIconOverride(project, {
    ...project.monsterIconOverrides[0],
    sourceBaseIconId: 410,
    sourceLabel: "Monster Mash 410"
  });
  assert(project.monsterIconOverrides.length === 1, "replacing an existing target override duplicated scenario override data");
  assert(project.monsterIconOverrides[0].sourceBaseIconId === 410, "replacing an existing target override did not update the source art");

  project = deleteMonsterIconOverride(project, 473);
  targets = monsterIconTargetPairs(project, lookupsFor(project));
  assert(project.monsterIconOverrides.length === 0, "deleting a target override left scenario-owned override data behind");
  assert(targets.some((target) => target.baseId === 473 && !target.override), "deleting an override did not restore visible default target art");
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

function checkScenarioMonsterIconOverrideImport({ scenarioMonsterIconOverridesFromResources }, { monsterIconTargetPairs }) {
  const diagnostics = [];
  const overrides = scenarioMonsterIconOverridesFromResources(
    [500, 501, 502],
    [
      scenarioCicnResource(500, [1, 2, 3]),
      scenarioCicnResource(808, [4, 5, 6]),
      scenarioCicnResource(501, [7, 8, 9])
    ],
    diagnostics
  );
  assert(overrides.length === 1, "scenarioMonsterIconOverridesFromResources created overrides for incomplete or unreferenced pairs");
  assert(overrides[0].targetBaseIconId === 500, "scenarioMonsterIconOverridesFromResources used the wrong target base icon id");
  assert(overrides[0].sourceKind === "scenario-resource", "scenarioMonsterIconOverridesFromResources did not mark imported overrides as scenario-resource");
  assert(overrides[0].sourceBaseResourceBase64 === "AQID", "scenarioMonsterIconOverridesFromResources did not preserve base cicn bytes");
  assert(overrides[0].sourcePairedResourceBase64 === "BAUG", "scenarioMonsterIconOverridesFromResources did not preserve paired cicn bytes");
  assert(diagnostics.some((diagnostic) => diagnostic.code === "incomplete-monster-icon-override"), "scenarioMonsterIconOverridesFromResources did not report incomplete pairs");

  const project = projectWith({
    monsters: [monster(1, { iconId: 500 }), monster(2, { iconId: 501 })],
    monsterIconOverrides: overrides
  });
  const targets = monsterIconTargetPairs(project, {
    iconAssetsByAbsId: new Map(),
    realmzActorIconAssetsByAbsId: new Map(),
    monsterMashAssetsByAbsId: new Map(),
    monsterIconOverridesByTarget: new Map(overrides.map((override) => [override.targetBaseIconId, override]))
  });
  const ids = targets.map((target) => target.baseId);
  assert(ids.includes(500), "imported complete scenario-owned icon override did not become a visible target pair");
  assert(!ids.includes(501), "incomplete scenario-owned icon pair created a blank target row");
}

function checkScenarioMonsterIconTargetAllocation({ nextScenarioMonsterIconTargetBaseId }) {
  const overrideAt = (baseId) => ({ baseId, override: { targetBaseIconId: baseId } });
  assert(nextScenarioMonsterIconTargetBaseId(409, []) === 409, "source-side scenario icon copy did not prefer the selected source id");
  assert(
    nextScenarioMonsterIconTargetBaseId(409, [overrideAt(409)]) === 410,
    "source-side scenario icon copy reused an existing override target"
  );
  assert(
    nextScenarioMonsterIconTargetBaseId(409, [overrideAt(101)]) === 410,
    "source-side scenario icon copy reused an existing override's paired resource id"
  );
}

function checkMonsterRequiredWeaponEncoding({ monsterRequiredWeaponDisplayCode, monsterRequiredWeaponStoredCode }) {
  assert(monsterRequiredWeaponDisplayCode(0) === 0, "required weapon all sentinel did not display as 0");
  assert(monsterRequiredWeaponDisplayCode(-1) === -1, "required weapon blunt sentinel did not display as -1");
  assert(monsterRequiredWeaponDisplayCode(-2) === -2, "required weapon sharp sentinel did not display as -2");
  assert(monsterRequiredWeaponDisplayCode(-109) === 147, "required weapon imported byte 147 displayed as signed -109");
  assert(monsterRequiredWeaponStoredCode(147) === -109, "required weapon code 147 did not store as byte-compatible signed value");
  assert(monsterRequiredWeaponStoredCode(-1) === -1, "required weapon blunt sentinel did not preserve -1");
  assert(monsterRequiredWeaponStoredCode(-2) === -2, "required weapon sharp sentinel did not preserve -2");
  assert(monsterRequiredWeaponDisplayCode(monsterRequiredWeaponStoredCode(253)) === 253, "required weapon max specific code did not round-trip");
}

async function checkScenarioMonsterIconTargetFiltering({ monsterIconTargetPairs, monsterIconSetTabCount }) {
  const project = projectWith({
    monsters: [
      monster(1, { iconId: 471 }),
      monster(2, { iconId: 473 }),
      monster(3, { iconId: 475 }),
      monster(4, { iconId: 477 }),
      monster(5, { iconId: 479 }),
      monster(6, { iconId: 481 })
    ],
    scenarioIconResources: [
      scenarioIconResource(477, "Scenario base 477", "AQID"),
      scenarioIconResource(785, "Scenario paired 785", "BAUG")
    ],
    assetCatalog: {
      icons: [
        projectIconAsset(479),
        projectIconAsset(787)
      ]
    },
    monsterIconOverrides: [{
      targetBaseIconId: 475,
      sourceBaseIconId: 409,
      sourceKind: "scenario-resource",
      sourceBaseResourceBase64: "AQID",
      sourcePairedResourceBase64: "BAUG"
    }]
  });
  const actorAssets = new Map([
    [473, libraryIconAsset(473)],
    [781, libraryIconAsset(781)]
  ]);
  const projectAssets = new Map([
    [479, projectIconAsset(479)],
    [787, projectIconAsset(787)]
  ]);
  const monsterMashAssets = new Map([
    [481, monsterMashIconAsset(481)],
    [789, monsterMashIconAsset(789)]
  ]);
  const overridesByTarget = new Map(project.monsterIconOverrides.map((override) => [override.targetBaseIconId, override]));
  const targets = monsterIconTargetPairs(project, {
    iconAssetsByAbsId: projectAssets,
    realmzActorIconAssetsByAbsId: actorAssets,
    monsterMashAssetsByAbsId: monsterMashAssets,
    monsterIconOverridesByTarget: overridesByTarget
  });
  const ids = targets.map((target) => target.baseId);
  assert(!ids.includes(471), "monsterIconTargetPairs included an unresolved referenced icon target");
  assert(ids.includes(473), "monsterIconTargetPairs omitted a displayable default icon pair");
  assert(ids.includes(475), "monsterIconTargetPairs omitted an authored override with no default icon pair");
  assert(ids.includes(477), "monsterIconTargetPairs omitted a scenario resource icon pair");
  assert(ids.includes(479), "monsterIconTargetPairs omitted a project assetCatalog icon pair");
  assert(!ids.includes(481), "monsterIconTargetPairs treated Monster Mash-only source art as scenario target art");
  assert(targets.find((target) => target.baseId === 475)?.resourceBase64 === "AQID", "override target row did not keep scenario-resource bytes");
  assert(targets.find((target) => target.baseId === 477)?.pairedResourceBase64 === "BAUG", "scenario-resource target row did not keep paired bytes");
  assert(monsterIconSetTabCount(project, {
    iconAssetsByAbsId: projectAssets,
    realmzActorIconAssetsByAbsId: actorAssets,
    monsterIconOverridesByTarget: overridesByTarget
  }) === targets.length, "Icon Set tab count did not match visible target pairs");
}

async function checkMonsterIconPickerOptions({ monsterIconPickerOptions, monsterIconSourceStatusLabel }) {
  const project = projectWith({
    monsters: [
      monster(1, { iconId: 471 }),
      monster(2, { iconId: 473 }),
      monster(3, { iconId: 475 }),
      monster(4, { iconId: 477 }),
      monster(5, { iconId: 479 }),
      monster(6, { iconId: 481 })
    ],
    scenarioIconResources: [
      scenarioIconResource(477, "Scenario base 477", "AQID"),
      scenarioIconResource(785, "Scenario paired 785", "BAUG")
    ],
    assetCatalog: {
      icons: [
        projectIconAsset(479),
        projectIconAsset(787)
      ]
    },
    monsterIconOverrides: [{
      targetBaseIconId: 475,
      sourceBaseIconId: 409,
      sourceKind: "scenario-resource",
      sourceBaseResourceBase64: "AQID",
      sourcePairedResourceBase64: "BAUG"
    }]
  });
  const actorAssets = new Map([
    [473, libraryIconAsset(473)],
    [781, libraryIconAsset(781)]
  ]);
  const projectAssets = new Map([
    [479, projectIconAsset(479)],
    [787, projectIconAsset(787)]
  ]);
  const monsterMashAssets = new Map([
    [481, monsterMashIconAsset(481)],
    [789, monsterMashIconAsset(789)]
  ]);
  const overridesByTarget = new Map(project.monsterIconOverrides.map((override) => [override.targetBaseIconId, override]));
  const options = monsterIconPickerOptions(project, {
    iconAssetsByAbsId: projectAssets,
    realmzActorIconAssetsByAbsId: actorAssets,
    monsterMashAssetsByAbsId: monsterMashAssets,
    monsterIconOverridesByTarget: overridesByTarget
  });
  const ids = options.map((option) => option.baseId);
  assert(!ids.includes(471), "monster icon picker included an unresolved referenced target");
  assert(ids.includes(473), "monster icon picker omitted Family Jewels/default target art");
  assert(ids.includes(475), "monster icon picker omitted scenario override target art");
  assert(ids.includes(477), "monster icon picker omitted scenario-resource target art");
  assert(ids.includes(479), "monster icon picker omitted assetCatalog target art");
  assert(!ids.includes(481), "monster icon picker included Monster Mash-only source art");
  assert(monsterIconSourceStatusLabel(options.find((option) => option.baseId === 475)?.sourceStatus) === "Scenario override", "monster icon picker mislabeled scenario override art");
  assert(monsterIconSourceStatusLabel(options.find((option) => option.baseId === 477)?.sourceStatus) === "Scenario resource", "monster icon picker mislabeled scenario resource art");
  assert(monsterIconSourceStatusLabel(options.find((option) => option.baseId === 473)?.sourceStatus) === "Default art", "monster icon picker mislabeled default art");

  const onlyRecordsProject = projectWith({
    monsters: [monster(12, { iconId: 481 })]
  });
  const sourceOnlyOptions = monsterIconPickerOptions(onlyRecordsProject, {
    iconAssetsByAbsId: new Map(),
    realmzActorIconAssetsByAbsId: new Map(),
    monsterMashAssetsByAbsId: monsterMashAssets,
    monsterIconOverridesByTarget: new Map()
  });
  assert(!sourceOnlyOptions.some((option) => option.baseId === 481), "monster icon picker showed source-side Monster Mash art without materialized target art");

  const materializedProject = projectWith({
    monsters: [monster(12, { iconId: 481 })],
    monsterIconOverrides: [{
      targetBaseIconId: 481,
      sourceBaseIconId: 481,
      sourceKind: "monster-mash",
      sourceBaseResourceBase64: "AQID",
      sourcePairedResourceBase64: "BAUG"
    }]
  });
  const materializedOptions = monsterIconPickerOptions(materializedProject, {
    iconAssetsByAbsId: new Map(),
    realmzActorIconAssetsByAbsId: new Map(),
    monsterMashAssetsByAbsId: monsterMashAssets,
    monsterIconOverridesByTarget: new Map(materializedProject.monsterIconOverrides.map((override) => [override.targetBaseIconId, override]))
  });
  assert(materializedOptions.some((option) => option.baseId === 481), "monster icon picker omitted materialized Monster Mash target override art");
}

async function checkMonsterLibraryIconOverrideMaterialization(
  { materializeMonsterLibraryIconOverrides, monsterIconTargetPairs },
  { createMonstersFromTemplates, upsertMonsterIconOverride }
) {
  const entry = monsterLibraryEntry("library-monster:481", "Providence Beast", 481);
  const copyEntry = { entry, id: 12, template: monster(12, { displayName: "Providence Beast", iconId: 481 }), description: "copied" };
  const catalog = iconLibraryCatalog(481, 789);
  const lookups = {
    iconAssetsByAbsId: new Map(),
    realmzActorIconAssetsByAbsId: new Map(),
    monsterMashAssetsByAbsId: new Map(),
    monsterIconOverridesByTarget: new Map()
  };
  const emitted = [];
  const overrides = await materializeMonsterLibraryIconOverrides(
    [copyEntry, copyEntry],
    projectWith(),
    catalog,
    lookups,
    {},
    { desktopRuntime: false },
    (command) => emitted.push(command)
  );
  assert(overrides.length === 1 && emitted.length === 1, "bulk library copy did not dedupe materialized icon overrides");
  assert(emitted[0].kind === "upsertMonsterIconOverride", "bulk library copy did not emit an icon override command");
  assert(emitted[0].override.targetBaseIconId === 481, "materialized icon override used the wrong target icon id");
  assert(emitted[0].override.sourceKind === "providence-library", "materialized icon override did not preserve Providence library source kind");
  assert(emitted[0].override.sourceBaseResourceBase64 === "AQID", "materialized icon override did not carry base cicn bytes");

  let project = createMonstersFromTemplates(projectWith(), [copyEntry]);
  project = upsertMonsterIconOverride(project, emitted[0].override);
  assert(findNormal(project, 12).iconId === 481, "bulk library copy test did not create the monster record");
  assert(project.monsterIconOverrides.some((override) => override.targetBaseIconId === 481), "bulk library copy test did not persist the matching icon override");
  const targets = monsterIconTargetPairs(project, {
    iconAssetsByAbsId: new Map(),
    realmzActorIconAssetsByAbsId: new Map(),
    monsterMashAssetsByAbsId: new Map(),
    monsterIconOverridesByTarget: new Map(project.monsterIconOverrides.map((override) => [override.targetBaseIconId, override]))
  });
  assert(targets.some((target) => target.baseId === 481), "materialized override did not make Monster Mash/library art visible as scenario target art");
}

function libraryIconAsset(resourceId) {
  return {
    id: `asset:${resourceId}`,
    type: "monster-icon",
    label: `Icon ${resourceId}`,
    source: "library-source:realmz-reference",
    relativePath: `The Family Jewels.rsrc/cicn/${resourceId}`,
    resourceType: "cicn",
    resourceId,
    previewPath: `data:image/png;base64,${resourceId}`
  };
}

function projectIconAsset(resourceId) {
  return {
    id: `project-icon:${resourceId}`,
    type: "scenario-monster-icon",
    label: `Scenario Icon ${resourceId}`,
    source: "scenario",
    relativePath: `Scenario/cicn/${resourceId}.png`,
    bytes: 10,
    sha256: `project:${resourceId}`,
    resourceType: "cicn",
    resourceId,
    previewPath: `data:image/png;base64,project${resourceId}`,
    mimeType: "image/png"
  };
}

function monsterMashIconAsset(resourceId) {
  return {
    id: `monster-mash:${resourceId}`,
    type: "monster-icon",
    label: `Monster Mash ${resourceId}`,
    source: "library-source:monster-mash",
    relativePath: `Monster Mash.rsrc/cicn/${resourceId}`,
    bytes: 10,
    sha256: `mash:${resourceId}`,
    resourceType: "cicn",
    resourceId,
    previewPath: `data:image/png;base64,mash${resourceId}`,
    mimeType: "image/png"
  };
}

function scenarioIconResource(resourceId, label, resourceBase64) {
  return {
    resourceId,
    label,
    sourceKind: "scenario-resource",
    resourceBase64,
    previewPath: `data:image/png;base64,scenario${resourceId}`
  };
}

function scenarioCicnResource(resourceId, bytes) {
  return {
    source: "Scenario",
    resource: {
      resourceType: "cicn",
      id: resourceId,
      data: new Uint8Array(bytes)
    }
  };
}

function monsterLibraryEntry(id, label, iconId) {
  return {
    id,
    type: "monster-scrapbook-entry",
    label,
    source: "library-source:providence:monster-library",
    recordRef: null,
    editState: "editable",
    confidence: "confirmed",
    summary: {
      index: iconId,
      displayName: label,
      iconId
    }
  };
}

function iconLibraryCatalog(baseId, pairedId) {
  const source = "library-source:providence:icon-library";
  const resources = [
    { role: "base", resourceType: "cicn", resourceId: baseId, label: `Providence Icon ${baseId}`, resourceBase64: "AQID", previewPath: "data:image/png;base64,AAA=" },
    { role: "paired", resourceType: "cicn", resourceId: pairedId, label: `Providence Icon ${pairedId}`, resourceBase64: "BAUG", previewPath: "data:image/png;base64,BBB=" }
  ];
  return {
    schemaVersion: 1,
    importedAt: "2026-07-02T00:00:00.000Z",
    managedPath: "browser://workspace/library",
    sources: [],
    records: [],
    entities: [{
      id: "library-entity:providence:icon-library:1",
      type: "monster-icon-pair",
      label: "Providence Monster Icon",
      source,
      recordRef: null,
      editState: "editable",
      confidence: "confirmed",
      summary: {
        providenceIconLibraryEntry: true,
        iconLibraryKind: "monster-pair",
        libraryNumber: 1,
        resources
      }
    }],
    assets: [
      iconLibraryAsset(1, "base", baseId, resources[0].label),
      iconLibraryAsset(1, "paired", pairedId, resources[1].label)
    ],
    diagnostics: [],
    summary: { sourceCount: 0, recordCount: 0, entityCount: 1, assetCount: 2, diagnosticCount: 0 }
  };
}

function iconLibraryAsset(number, role, resourceId, label) {
  return {
    id: `library-asset:providence:icon-library:${number}:${role}`,
    type: "monster-icon-pair",
    label,
    source: "library-source:providence:icon-library",
    relativePath: `providence-library://icon-library/${number}/${role}`,
    bytes: 10,
    sha256: `icon-library:${number}:${role}`,
    resourceType: "cicn",
    resourceId,
    previewPath: `data:image/png;base64,iconLibrary${resourceId}`,
    mimeType: "image/png"
  };
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
    battles: [],
    monsters: [],
    monsterSets: [],
    monsterDescriptions: [],
    monsterIconOverrides: [],
    scenarioIconResources: [],
    assetCatalog: { icons: [] },
    ...overrides
  };
}

function battle(id, gridValues = [], overrides = {}) {
  const grid = Array(13 * 13).fill(0);
  for (const [index, value] of gridValues.entries()) grid[index] = value;
  return {
    id,
    grid,
    dist: 1,
    messageBefore: 0,
    messageAfter: 0,
    battleMacro: 0,
    rawBytes: Array(346).fill(0),
    authored: true,
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

function blankMonster(id) {
  return monster(id, {
    hitDice: 0,
    staminaBonus: 0,
    agility: 0,
    movementMax: 0,
    armor: 0,
    magicResistance: 0,
    attackCount: 0,
    attacks: Array.from({ length: 5 }, () => [0, 0, 0, 0]),
    spellPoints: 0,
    maxSpellPoints: 0,
    exp: 0,
    displayName: "",
    rawBytes: Array(210).fill(0)
  });
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

function isBlankMonster(record) {
  if (!record) return false;
  return record.hitDice === 0
    && record.agility === 0
    && record.movementMax === 0
    && record.size === 0
    && record.attackCount === 0
    && record.displayName === ""
    && Array.isArray(record.rawBytes)
    && record.rawBytes.length === 210
    && record.rawBytes.every((value) => value === 0);
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
