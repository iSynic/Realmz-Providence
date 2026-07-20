import type {
  BattleRecord,
  ItemTextRecord,
  ManagedAsset,
  ManagedAssetKind,
  MonsterDescriptionRecord,
  MonsterRecord,
  Project,
  QuestLabel,
  ShopRecord,
  ScenarioItemRecord,
  TreasureRecord
} from "../types";
import { nextScenarioResourceIdInRange } from "../mediaAssets";
import { monsterLibraryEntryDescription, monsterLibraryEntryTemplate } from "../monsterLibrary";
import { copyCurrentMonsterToAllSets, generateMonsterVariants } from "../projectCommands/targetRecordCommands";
import { createCasteOverride, createRaceOverride, createSpellOverride } from "../projectCommands/scenarioRulesCommands";
import { resolveRef, SCENARIO_ITEM_ID_BASE } from "./allocation";
import { addScenarioSeedDiagnostic as addDiagnostic, type ScenarioSeedCompilerContext } from "./compilerContext";
import type {
  ScenarioSeed,
  ScenarioSeedAsset,
  ScenarioSeedBattle,
  ScenarioSeedItem,
  ScenarioSeedMonster,
  ScenarioSeedShop,
  ScenarioSeedTreasure
} from "./contracts";
import { SCENARIO_ITEM_TYPE_CODES } from "./recordContracts";
import { authoredProvenance, padArray, padNestedNumberArrays } from "./recordEncoding";
import { resolveItemRef, resolveMonsterRef, resolveSeedAssetRef } from "./referenceResolver";
import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";

const MESSAGE_BYTES = 256;
const OPTION_LABEL_BYTES = 25;
const BATTLE_BYTES = REALMZ_NATIVE_LAYOUT.battleRecordBytes;
const MONSTER_BYTES = REALMZ_NATIVE_LAYOUT.monsterRecordBytes;
const MONSTER_DESCRIPTION_BYTES = REALMZ_NATIVE_LAYOUT.monsterDescriptionRecordBytes;
const TREASURE_BYTES = REALMZ_NATIVE_LAYOUT.treasureRecordBytes;
const SHOP_BYTES = REALMZ_NATIVE_LAYOUT.shopRecordBytes;
const ITEM_BYTES = REALMZ_NATIVE_LAYOUT.scenarioItemRecordBytes;

export function compileScenarioSeedAssets(
  seedAssets: ScenarioSeedAsset[] | undefined,
  customAssets: ManagedAsset[],
  context: ScenarioSeedCompilerContext
): ManagedAsset[] | undefined {
  if (seedAssets === undefined) return undefined;
  const projectAssets: ManagedAsset[] = [];
  for (const seedAsset of seedAssets) {
    if (seedAsset.source === "stock") {
      const resolved = {
        kind: seedAsset.kind ?? managedAssetKindForResourceType(seedAsset.resourceType),
        resourceType: seedAsset.resourceType,
        resourceId: seedAsset.resourceId,
        bundled: false
      };
      context.assets.set(seedAsset.key, resolved);
      context.allocations.assets.push({ key: seedAsset.key, source: seedAsset.source, resourceType: resolved.resourceType, resourceId: resolved.resourceId, bundled: false });
      continue;
    }

    const source = customAssets.find((asset) => asset.id === seedAsset.assetId);
    if (!source) {
      addDiagnostic(context, "error", "unresolved-asset-reference", `Custom Library asset "${seedAsset.assetId}" was not provided to the scenario seed compiler.`, "asset", seedAsset.key);
      continue;
    }
    if (source.libraryScope !== "custom-library") {
      addDiagnostic(context, "error", "invalid-asset-source", `Asset "${seedAsset.assetId}" is not a Custom Library asset.`, "asset", seedAsset.key);
      continue;
    }
    const resourceId = seedAsset.resourceId ?? nextScenarioResourceIdInRange(projectAssets, source.kind);
    validateScenarioAssetResourceId(source.kind, resourceId, seedAsset.key, context);
    if (projectAssets.some((asset) => asset.resourceType === source.resourceType && asset.resourceId === resourceId)) {
      addDiagnostic(context, "error", "duplicate-asset-resource", `Asset "${seedAsset.key}" duplicates ${source.resourceType} resource ID ${resourceId}.`, "asset", seedAsset.key);
      continue;
    }
    const managed: ManagedAsset = {
      ...source,
      id: `asset:seed:${slugify(seedAsset.key)}`,
      resourceId,
      libraryScope: "scenario",
      linkedEntity: source.kind === "special-land-tile" ? `special-land-tile:${resourceId}` : source.linkedEntity,
      provenance: `${source.provenance}; copied from Providence Custom Library by scenario seed`
    };
    projectAssets.push(managed);
    context.assets.set(seedAsset.key, { kind: managed.kind, resourceType: managed.resourceType, resourceId, bundled: true });
    context.allocations.assets.push({ key: seedAsset.key, source: seedAsset.source, resourceType: managed.resourceType, resourceId, bundled: true });
  }
  return projectAssets;
}

export function compileScenarioSeedCoreRecords(
  project: Project,
  seed: ScenarioSeed,
  context: ScenarioSeedCompilerContext
): Project {
  let compiled = project;

  if (seed.messages !== undefined) {
    compiled = {
      ...compiled,
      messages: seed.messages.map((message) => ({
        id: message.id ?? 0,
        text: message.text,
        authored: true,
        provenance: authoredProvenance("Data SD2", message.id ?? 0, (message.id ?? 0) * MESSAGE_BYTES, MESSAGE_BYTES)
      }))
    };
  }
  if (seed.optionLabels !== undefined) {
    compiled = {
      ...compiled,
      optionLabels: seed.optionLabels.map((option) => ({
        id: option.id,
        text: option.text,
        authored: true,
        provenance: authoredProvenance("Data OD", option.id, option.id * OPTION_LABEL_BYTES, OPTION_LABEL_BYTES)
      }))
    };
  }
  if (seed.quests !== undefined) {
    compiled = {
      ...compiled,
      questLabels: seed.quests
        .map((quest): QuestLabel => ({ id: quest.id ?? 0, label: quest.label, ...(quest.note !== undefined ? { note: quest.note } : {}) }))
        .sort((a, b) => a.id - b.id)
    };
  }
  if (seed.monsters !== undefined) {
    const builtMonsters = seed.monsters.map((monster) => {
      const library = resolveMonsterLibraryEntry(monster, context);
      return {
        record: buildMonster(monster, context, library?.record),
        description: buildMonsterDescription(monster, library?.description)
      };
    });
    compiled = {
      ...compiled,
      monsters: builtMonsters.map((built) => built.record),
      monsterDescriptions: builtMonsters.map((built) => built.description).filter((record): record is MonsterDescriptionRecord => record !== null)
    };
    let variantProject = compiled;
    for (const monster of seed.monsters) {
      const id = monster.id ?? 0;
      if (monster.variants === "copyAll") variantProject = copyCurrentMonsterToAllSets(variantProject, id, 0);
      if (monster.variants === "generated") variantProject = generateMonsterVariants(variantProject, id);
    }
    compiled = { ...compiled, monsterSets: variantProject.monsterSets };
  }
  if (seed.battles !== undefined) compiled = { ...compiled, battles: seed.battles.map((battle) => buildBattle(battle, context)) };
  if (seed.items !== undefined) {
    compiled = {
      ...compiled,
      scenarioItems: seed.items.map((item) => buildItem(item, context)),
      itemTexts: seed.items.map(buildItemText).filter((record): record is ItemTextRecord => record !== null)
    };
  }
  if (seed.treasures !== undefined) compiled = { ...compiled, treasures: seed.treasures.map((treasure) => buildTreasure(treasure, context)) };
  if (seed.shops !== undefined) compiled = { ...compiled, shops: seed.shops.map((shop) => buildShop(shop, context)) };

  if (seed.spells !== undefined) {
    let rulesProject: Project = { ...compiled, spellOverrides: [] };
    for (const { key: _key, id, ...template } of seed.spells) rulesProject = createSpellOverride(rulesProject, id, template);
    compiled = { ...compiled, spellOverrides: rulesProject.spellOverrides };
  }
  if (seed.races !== undefined) {
    let rulesProject: Project = { ...compiled, raceOverrides: [] };
    for (const { key: _key, id, ...template } of seed.races) rulesProject = createRaceOverride(rulesProject, id, template);
    compiled = { ...compiled, raceOverrides: rulesProject.raceOverrides, ruleNames: rulesProject.ruleNames };
  }
  if (seed.castes !== undefined) {
    let rulesProject: Project = { ...compiled, casteOverrides: [] };
    for (const { key: _key, id, ...caste } of seed.castes) {
      const { startItems, ...casteTemplate } = caste;
      const template = startItems
        ? { ...casteTemplate, startItems: startItems.map((item) => resolveItemRef(item, context)) }
        : casteTemplate;
      rulesProject = createCasteOverride(rulesProject, id, template);
    }
    compiled = { ...compiled, casteOverrides: rulesProject.casteOverrides, ruleNames: rulesProject.ruleNames };
  }

  return compiled;
}

function managedAssetKindForResourceType(resourceType: string): ManagedAssetKind {
  const normalized = resourceType.trim().toLowerCase();
  if (normalized === "pict") return "picture";
  if (normalized === "cicn") return "icon";
  if (normalized === "snd") return "sound";
  if (normalized === "text" || normalized === "str#" || normalized === "styl") return "text";
  return "other";
}

function validateScenarioAssetResourceId(kind: ManagedAssetKind, resourceId: number, key: string, context: ScenarioSeedCompilerContext) {
  const valid = kind === "picture"
    ? resourceId >= 30000 && resourceId <= 30128
    : kind === "sound"
      ? resourceId >= 200 && resourceId <= 500
      : kind === "special-land-tile"
        ? resourceId < 0
        : true;
  if (!valid) addDiagnostic(context, "error", "invalid-scenario-asset-id", `Asset "${key}" uses resource ID ${resourceId}, which is outside the scenario range for ${kind} assets.`, "asset", key);
}

function buildBattle(seed: ScenarioSeedBattle, context: ScenarioSeedCompilerContext): BattleRecord {
  const id = seed.id ?? 0;
  const grid = padArray(seed.grid ?? [], 13 * 13, 0);
  for (const placement of seed.placements ?? []) {
    const monsterId = resolveMonsterRef(placement.monster, context);
    grid[placement.y * 13 + placement.x] = placement.friendly ? -monsterId : monsterId;
  }
  return {
    id,
    grid,
    dist: seed.dist ?? 0,
    messageBefore: seed.messageBefore ?? 0,
    messageAfter: seed.messageAfter ?? 0,
    battleMacro: seed.battleMacro ?? 0,
    authored: true,
    provenance: authoredProvenance("Data BD", id, id * BATTLE_BYTES, BATTLE_BYTES)
  };
}

function resolveMonsterLibraryEntry(seed: ScenarioSeedMonster, context: ScenarioSeedCompilerContext): { record: MonsterRecord; description: string } | null {
  if (seed.libraryEntry === undefined) return null;
  const entry = context.libraryCatalog?.entities.find((candidate) => candidate.id === seed.libraryEntry);
  if (!entry) {
    addDiagnostic(context, "error", "unresolved-monster-library-entry", `Monster Library entry "${seed.libraryEntry}" was not provided to the scenario seed compiler.`, "monster", seed.key ?? seed.libraryEntry);
    return null;
  }
  const record = monsterLibraryEntryTemplate(entry);
  if (!record) {
    addDiagnostic(context, "error", "invalid-monster-library-entry", `Monster Library entry "${seed.libraryEntry}" does not contain a reusable monster record.`, "monster", seed.key ?? seed.libraryEntry);
    return null;
  }
  return { record, description: monsterLibraryEntryDescription(entry) };
}

function buildMonster(seed: ScenarioSeedMonster, context: ScenarioSeedCompilerContext, template: MonsterRecord | undefined): MonsterRecord {
  const id = seed.id ?? 0;
  return {
    id,
    hitDice: seed.hitDice ?? template?.hitDice ?? 1,
    staminaBonus: seed.staminaBonus ?? template?.staminaBonus ?? 0,
    agility: seed.agility ?? template?.agility ?? 10,
    nameId: seed.nameId ?? (id & 0xff),
    movementMax: seed.movementMax ?? template?.movementMax ?? 10,
    armor: seed.armor ?? template?.armor ?? 0,
    magicResistance: seed.magicResistance ?? template?.magicResistance ?? 0,
    distance: seed.distance ?? template?.distance ?? 0,
    traitor: seed.traitor ?? template?.traitor ?? 0,
    size: seed.size ?? template?.size ?? 1,
    typeFlags: padArray(seed.typeFlags ?? template?.typeFlags ?? [], 8, 0),
    attackCount: seed.attackCount ?? (seed.attacks ? Math.max(1, Math.min(5, seed.attacks.length)) : template?.attackCount ?? 1),
    magicAttackCount: seed.magicAttackCount ?? template?.magicAttackCount ?? 0,
    attacks: padNestedNumberArrays(seed.attacks ?? template?.attacks ?? [[0, 0, 0, 0]], 5, 4, 0),
    damageBonus: seed.damageBonus ?? template?.damageBonus ?? 0,
    castPercent: seed.castPercent ?? template?.castPercent ?? 0,
    runPercent: seed.runPercent ?? template?.runPercent ?? 0,
    surrenderPercent: seed.surrenderPercent ?? template?.surrenderPercent ?? 0,
    missilePercent: seed.missilePercent ?? template?.missilePercent ?? 0,
    canSummon: seed.canSummon ?? template?.canSummon ?? 0,
    saves: padArray(seed.saves ?? template?.saves ?? [], 6, 0),
    spellImmunities: padArray(seed.spellImmunities ?? template?.spellImmunities ?? [], 6, 0),
    money: padArray(seed.money ?? template?.money ?? [], 3, 0),
    spells: padArray(seed.spells ?? template?.spells ?? [], 10, 0),
    items: seed.items === undefined ? padArray(template?.items ?? [], 6, 0) : padArray(seed.items.map((item) => resolveItemRef(item, context)), 6, 0),
    weapon: seed.weapon === undefined ? template?.weapon ?? 0 : resolveItemRef(seed.weapon, context),
    iconId: seed.iconId ?? (seed.icon === undefined ? template?.iconId ?? 0 : resolveSeedAssetRef(seed.icon, "icon", "monster icon", context)),
    spellPoints: seed.spellPoints ?? template?.spellPoints ?? 0,
    exp: seed.exp ?? template?.exp ?? 0,
    stamina: seed.stamina ?? template?.stamina ?? 0,
    staminaMax: seed.staminaMax ?? template?.staminaMax ?? 0,
    underneath: padArray(seed.underneath ?? template?.underneath ?? [], 4, 0),
    target: seed.target ?? template?.target ?? 0,
    guarding: seed.guarding ?? template?.guarding ?? 0,
    notOnMenu: seed.notOnMenu ?? template?.notOnMenu ?? false,
    beenAttacked: seed.beenAttacked ?? template?.beenAttacked ?? 0,
    movement: seed.movement ?? template?.movement ?? 0,
    magicToHit: seed.magicToHit ?? template?.magicToHit ?? 0,
    conditions: padArray(seed.conditions ?? template?.conditions ?? [], 40, 0),
    lr: seed.lr ?? template?.lr ?? 0,
    up: seed.up ?? template?.up ?? 0,
    attackNum: seed.attackNum ?? template?.attackNum ?? 0,
    bonusAttack: seed.bonusAttack ?? template?.bonusAttack ?? 0,
    deathMacro: seed.deathMacro === undefined ? template?.deathMacro ?? 0 : resolveRef(seed.deathMacro, context.actionPoints, "action point", context),
    maxSpellPoints: seed.maxSpellPoints ?? template?.maxSpellPoints ?? 0,
    displayName: seed.displayName ?? seed.name ?? template?.displayName ?? `Monster ${id}`,
    authored: true,
    provenance: authoredProvenance("Data MD", id, id * MONSTER_BYTES, MONSTER_BYTES)
  };
}

function buildMonsterDescription(seed: ScenarioSeedMonster, templateDescription?: string): MonsterDescriptionRecord | null {
  const description = seed.description ?? templateDescription;
  if (description === undefined || description.length === 0) return null;
  const id = seed.id ?? 0;
  return {
    id,
    text: description,
    authored: true,
    provenance: authoredProvenance("Data DES", id, id * MONSTER_DESCRIPTION_BYTES, MONSTER_DESCRIPTION_BYTES)
  };
}

function buildTreasure(seed: ScenarioSeedTreasure, context: ScenarioSeedCompilerContext): TreasureRecord {
  const id = seed.id ?? 0;
  return {
    id,
    itemIds: padArray((seed.itemIds ?? []).map((itemId) => resolveItemRef(itemId, context)), 20, 0),
    exp: seed.exp ?? 0,
    gold: seed.gold ?? 0,
    gems: seed.gems ?? 0,
    jewelry: seed.jewelry ?? 0,
    authored: true,
    provenance: authoredProvenance("Data TD", id, id * TREASURE_BYTES, TREASURE_BYTES)
  };
}

function buildShop(seed: ScenarioSeedShop, context: ScenarioSeedCompilerContext): ShopRecord {
  const id = seed.id ?? 0;
  const itemIds = new Array(1000).fill(0);
  const quantities = new Array(1000).fill(0);
  for (const [index, stock] of (seed.stock ?? []).entries()) {
    itemIds[index] = resolveItemRef(stock.itemId, context);
    quantities[index] = stock.quantity ?? 1;
  }
  return {
    id,
    itemIds,
    quantities,
    inflation: seed.inflation ?? 0,
    authored: true,
    provenance: authoredProvenance("Data SD", id, id * SHOP_BYTES, SHOP_BYTES)
  };
}

function buildItem(seed: ScenarioSeedItem, context: ScenarioSeedCompilerContext): ScenarioItemRecord {
  const id = seed.id ?? 0;
  return {
    id,
    itemId: seed.itemId ?? SCENARIO_ITEM_ID_BASE + id,
    iconId: seed.iconId ?? (seed.icon === undefined ? 0 : resolveSeedAssetRef(seed.icon, "icon", "item icon", context)),
    type: seed.type ?? (seed.typeName === undefined ? 0 : SCENARIO_ITEM_TYPE_CODES[seed.typeName]),
    st: seed.st ?? 0,
    blunt: seed.blunt ?? 0,
    hands: seed.hands ?? 0,
    lu: seed.lu ?? 0,
    movement: seed.movement ?? 0,
    ac: seed.ac ?? 0,
    magicResistance: seed.magicResistance ?? 0,
    damage: seed.damage ?? 0,
    spellPoints: seed.spellPoints ?? 0,
    sound: seed.sound ?? 0,
    weight: seed.weight ?? 0,
    cost: seed.cost ?? 0,
    charge: seed.charge ?? 0,
    cursedItemId: seed.cursedItemId ?? 0,
    magical: seed.magical ?? 0,
    itemCat0: seed.itemCat0 ?? 0,
    itemCat1: seed.itemCat1 ?? 0,
    raceRestrictions: seed.raceRestrictions ?? 0,
    casteRestrictions: seed.casteRestrictions ?? 0,
    specificRace: seed.specificRace ?? 0,
    specificCaste: seed.specificCaste ?? 0,
    raceClassOnly: seed.raceClassOnly ?? 0,
    casteClassOnly: seed.casteClassOnly ?? 0,
    spare2: new Array(7).fill(0),
    vSmall: seed.vSmall ?? 0,
    vLarge: seed.vLarge ?? 0,
    heat: seed.heat ?? 0,
    cold: seed.cold ?? 0,
    electric: seed.electric ?? 0,
    vsUndead: seed.vsUndead ?? 0,
    vsDemonDevil: seed.vsDemonDevil ?? 0,
    vsEvil: seed.vsEvil ?? 0,
    special1: seed.special1 ?? 0,
    special2: seed.special2 ?? 0,
    special3: seed.special3 ?? 0,
    special4: seed.special4 ?? 0,
    special5: seed.special5 ?? 0,
    weightPerCharge: seed.weightPerCharge ?? 0,
    dropOnEmpty: seed.dropOnEmpty ?? 0,
    authored: true,
    provenance: authoredProvenance("Data NI", id, id * ITEM_BYTES, ITEM_BYTES)
  };
}

function buildItemText(seed: ScenarioSeedItem): ItemTextRecord | null {
  if (seed.unidentifiedName === undefined && seed.identifiedName === undefined && seed.description === undefined) return null;
  const id = seed.itemId ?? SCENARIO_ITEM_ID_BASE + (seed.id ?? 0);
  return {
    id,
    itemId: id,
    unidentifiedName: seed.unidentifiedName ?? seed.identifiedName ?? "",
    identifiedName: seed.identifiedName ?? seed.unidentifiedName ?? "",
    description: seed.description ?? "",
    authored: true,
    provenance: authoredProvenance("Data ID.rsrc", id, 0, 0)
  };
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "untitled-scenario";
}
