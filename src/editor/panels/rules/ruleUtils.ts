import { LibraryCatalog, Project, ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride } from "../../types";
import { REALMZ_CASTES, REALMZ_RACES, SPELL_CASTER_CLASSES } from "../../rulesCatalog";
import { ruleCasteName, ruleRaceName } from "../../ruleNames";
import { CasteRuleEntry, RaceRuleEntry, RulesFamily, SpellRuleEntry } from "./ruleTypes";

const spellEntryCache = new Map<string, SpellRuleEntry[]>();
const raceEntryCache = new Map<string, RaceRuleEntry[]>();
const casteEntryCache = new Map<string, CasteRuleEntry[]>();
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
const MAX_RULE_ENTRY_CACHE_ENTRIES = 48;

export function buildSpellEntries(project: Project, catalog: LibraryCatalog | null): SpellRuleEntry[] {
  const cacheKey = `spell:${objectCacheKey(project.spellOverrides)}:${objectCacheKey(catalog?.entities)}`;
  const cached = spellEntryCache.get(cacheKey);
  if (cached) return cached;
  const scenario = new Map((project.spellOverrides ?? []).map((record) => [record.id, record]));
  const library = new Map<number, ScenarioSpellOverride>();
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "spell") continue;
    const packedId = num(entity.summary.packedSpellId);
    const spellcasterClass = num(entity.summary.spellcasterClass);
    const levelIndex = num(entity.summary.spellLevel) - 1;
    const slotIndex = num(entity.summary.spellSlot);
    if (!Number.isInteger(packedId) || slotIndex < 0 || slotIndex >= 12) continue;
    library.set(packedId, spellFromSummary(entity.summary, spellCustomId(levelIndex, slotIndex)));
  }
  const entries: SpellRuleEntry[] = [];
  for (let spellcasterClass = 0; spellcasterClass < SPELL_CASTER_CLASSES.length; spellcasterClass += 1) {
    for (let levelIndex = 0; levelIndex < 7; levelIndex += 1) {
      for (let slotIndex = 0; slotIndex < 12; slotIndex += 1) {
        const packedId = spellPackedId(spellcasterClass, levelIndex, slotIndex);
        const customId = spellCustomId(levelIndex, slotIndex);
        const scenarioSource = spellcasterClass === 4 ? scenario.get(customId) ?? null : null;
        const scenarioRecord = scenarioSource && !isBlankCustomSpellRecord(scenarioSource) ? scenarioSource : null;
        const record = scenarioRecord ?? library.get(packedId) ?? emptySpellView(customId, packedId, spellcasterClass, levelIndex, slotIndex);
        entries.push({
          packedId,
          customId,
          spellcasterClass,
          levelIndex,
          slotIndex,
          label: record.displayName || `Level ${levelIndex + 1} Spell ${slotIndex + 1}`,
          record,
          hasScenarioVersion: Boolean(scenarioRecord)
        });
      }
    }
  }
  writeRuleEntryCache(spellEntryCache, cacheKey, entries);
  return entries;
}

export function spellFromSummary(summary: Record<string, unknown>, id: number): ScenarioSpellOverride {
  return {
    id,
    range1: num(summary.range1),
    range2: num(summary.range2),
    queueIcon: num(summary.queueIcon),
    toHitBonus: num(summary.toHitBonus),
    saveBonus: num(summary.saveBonus),
    fixedTargetNum: num(summary.fixedTargetNum),
    canRotate: num(summary.canRotate),
    saveAdjust: num(summary.saveAdjust),
    cannot: num(summary.cannot),
    resistAdjust: num(summary.resistAdjust),
    cost: num(summary.cost),
    damage1: num(summary.damage1),
    damage2: num(summary.damage2),
    powerDamage1: num(summary.powerDamage1),
    powerDamage2: num(summary.powerDamage2),
    duration1: num(summary.duration1),
    duration2: num(summary.duration2),
    powerDuration1: num(summary.powerDuration1),
    powerDuration2: num(summary.powerDuration2),
    spellLook1: num(summary.spellLook1),
    spellLook2: num(summary.spellLook2),
    sound1: num(summary.sound1),
    sound2: num(summary.sound2),
    targetType: num(summary.targetType),
    size: num(summary.size),
    special: num(summary.special),
    damageType: num(summary.damageType),
    spellClass: num(summary.spellClass),
    inCombat: Boolean(summary.inCombat),
    inCamp: Boolean(summary.inCamp),
    displayName: str(summary.displayName),
    description: "",
    authored: false,
    provenance: undefined
  };
}

export function emptySpellView(id: number, packedId: number, spellcasterClass: number, levelIndex: number, slotIndex: number): ScenarioSpellOverride {
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
    displayName: spellcasterClass === 4 ? `Level ${levelIndex + 1} Spell ${slotIndex + 1}` : `Spell ${packedId}`,
    description: "",
    authored: false,
    provenance: undefined
  };
}

export function spellPackedId(spellcasterClass: number, levelIndex: number, slotIndex: number) {
  return (spellcasterClass + 1) * 1000 + (levelIndex + 1) * 100 + slotIndex + 1;
}

export function isBlankCustomSpellRecord(record: ScenarioSpellOverride | null | undefined) {
  if (!record || record.authored) return false;
  const name = record.displayName?.trim() ?? "";
  const genericName = !name || name === `Custom Spell ${record.id}` || /^Level \d+ Spell \d+$/.test(name);
  if (!genericName) return false;
  return (
    record.range1 === 0 &&
    record.range2 === 0 &&
    record.queueIcon === 0 &&
    record.toHitBonus === 0 &&
    record.saveBonus === 0 &&
    record.fixedTargetNum === 0 &&
    record.canRotate === 0 &&
    record.saveAdjust === 0 &&
    record.cannot === 0 &&
    record.resistAdjust === 0 &&
    record.cost === 0 &&
    record.damage1 === 0 &&
    record.damage2 === 0 &&
    record.powerDamage1 === 0 &&
    record.powerDamage2 === 0 &&
    record.duration1 === 0 &&
    record.duration2 === 0 &&
    record.powerDuration1 === 0 &&
    record.powerDuration2 === 0 &&
    record.spellLook1 === 0 &&
    record.spellLook2 === 0 &&
    record.sound1 === 0 &&
    record.sound2 === 0 &&
    record.targetType === 0 &&
    record.size === 0 &&
    record.special === 0 &&
    record.damageType === 0 &&
    (record.spellClass === 0 || record.spellClass === 4) &&
    !record.inCombat &&
    !record.inCamp
  );
}

export function spellCustomId(levelIndex: number, slotIndex: number) {
  return levelIndex * 15 + slotIndex;
}

export function previousSpellPackedId(entry: SpellRuleEntry) {
  const flat = entry.levelIndex * 12 + entry.slotIndex;
  const next = flat <= 0 ? 83 : flat - 1;
  return spellPackedId(entry.spellcasterClass, Math.floor(next / 12), next % 12);
}

export function nextSpellPackedId(entry: SpellRuleEntry) {
  const flat = entry.levelIndex * 12 + entry.slotIndex;
  const next = flat >= 83 ? 0 : flat + 1;
  return spellPackedId(entry.spellcasterClass, Math.floor(next / 12), next % 12);
}

export const RACE_RECORD_LIMIT = 30;
export const STANDARD_RACE_COUNT = REALMZ_RACES.length;
export const CASTE_RECORD_LIMIT = 30;
export const STANDARD_CASTE_COUNT = REALMZ_CASTES.length;

export function buildRaceEntries(project: Project, catalog: LibraryCatalog | null): RaceRuleEntry[] {
  const cacheKey = `race:${objectCacheKey(project.raceOverrides)}:${objectCacheKey(project.ruleNames)}:${objectCacheKey(catalog?.entities)}`;
  const cached = raceEntryCache.get(cacheKey);
  if (cached) return cached;
  const scenario = new Map((project.raceOverrides ?? []).map((record) => [record.id, record]));
  const library = new Map<number, ScenarioRaceOverride>();
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "race") continue;
    const id = num(entity.summary.index);
    if (!Number.isInteger(id) || id < 0 || id >= RACE_RECORD_LIMIT) continue;
    library.set(id, raceFromSummary(entity.summary, id));
  }
  const entries = Array.from({ length: RACE_RECORD_LIMIT }, (_, id) => {
    const scenarioRecord = id >= STANDARD_RACE_COUNT ? scenario.get(id) ?? null : null;
    const record = scenarioRecord ?? library.get(id) ?? emptyRaceView(id);
    return {
      id,
      record: { ...record, displayName: ruleRaceName(project, id, record.displayName) },
      hasScenarioVersion: Boolean(scenarioRecord)
    };
  });
  writeRuleEntryCache(raceEntryCache, cacheKey, entries);
  return entries;
}

export function buildCasteEntries(project: Project, catalog: LibraryCatalog | null): CasteRuleEntry[] {
  const cacheKey = `caste:${objectCacheKey(project.casteOverrides)}:${objectCacheKey(project.ruleNames)}:${objectCacheKey(catalog?.entities)}`;
  const cached = casteEntryCache.get(cacheKey);
  if (cached) return cached;
  const scenario = new Map((project.casteOverrides ?? []).map((record) => [record.id, record]));
  const library = new Map<number, ScenarioCasteOverride>();
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "caste") continue;
    const id = num(entity.summary.index);
    if (!Number.isInteger(id) || id < 0 || id >= CASTE_RECORD_LIMIT) continue;
    library.set(id, casteFromSummary(entity.summary, id));
  }
  const entries = Array.from({ length: CASTE_RECORD_LIMIT }, (_, id) => {
    const scenarioSource = scenario.get(id) ?? null;
    const scenarioRecord = scenarioSource && !isBlankImportedCasteRecord(scenarioSource) ? scenarioSource : null;
    const record = scenarioRecord ?? library.get(id) ?? emptyCasteView(id);
    return {
      id,
      record: { ...record, displayName: ruleCasteName(project, id, record.displayName) },
      hasScenarioVersion: Boolean(scenarioRecord)
    };
  });
  writeRuleEntryCache(casteEntryCache, cacheKey, entries);
  return entries;
}

function objectCacheKey(value: object | null | undefined) {
  if (!value) return "none";
  const existing = objectIds.get(value);
  if (existing) return existing;
  const next = nextObjectId++;
  objectIds.set(value, next);
  return next;
}

function writeRuleEntryCache<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value);
  if (cache.size > MAX_RULE_ENTRY_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function raceFromSummary(summary: Record<string, unknown>, id: number): ScenarioRaceOverride {
  return {
    id,
    displayName: str(summary.displayName) || REALMZ_RACES[id] || `Race ${id}`,
    plusMinusToHit: numArray(summary.plusMinusToHit, 8),
    specialAbility: numArray(summary.specialAbility, 14),
    drvBonus: numArray(summary.drvBonus, 8),
    attBonus: numArray(summary.attBonus, 6),
    minMax: numArray(summary.minMax, 12, 0),
    spare: numArray(summary.spare, 8),
    conditions: numArray(summary.conditions, 40),
    maxAge: num(summary.maxAge),
    doesNotDie: num(summary.doesNotDie),
    baseMove: num(summary.baseMove),
    magRes: num(summary.magRes),
    twoHand: num(summary.twoHand),
    missile: num(summary.missile),
    numOfAttacks: numArray(summary.numOfAttacks, 2),
    canCaste: numArray(summary.canCaste, 30),
    ageRange: numMatrix(summary.ageRange, 5, 2),
    ageChange: numMatrix(summary.ageChange, 5, 15),
    canRegenerate: num(summary.canRegenerate),
    defaultIconSet: num(summary.defaultIconSet),
    itemTypes: numArray(summary.itemTypes, 2),
    descriptors: num(summary.descriptors),
    spacer: numArray(summary.spacer, 31),
    authored: false,
    provenance: undefined
  };
}

export function casteFromSummary(summary: Record<string, unknown>, id: number): ScenarioCasteOverride {
  return {
    id,
    displayName: str(summary.displayName) || REALMZ_CASTES[id] || `Caste ${id}`,
    specialAbility: numMatrix(summary.specialAbility, 2, 14),
    drvBonus: numArray(summary.drvBonus, 8),
    attBonus: numArray(summary.attBonus, 6),
    spellcasters: numMatrix(summary.spellcasters, 4, 3),
    minMax: numArray(summary.minMax, 12, 0),
    conditions: numArray(summary.conditions, 40),
    canUseMissile: num(summary.canUseMissile),
    getsMissileBonus: num(summary.getsMissileBonus),
    stamina: numArray(summary.stamina, 2),
    strength: numArray(summary.strength, 2),
    dodge: numArray(summary.dodge, 2),
    toHit: numArray(summary.toHit, 2),
    missile: numArray(summary.missile, 2),
    hand2Hand: numArray(summary.hand2Hand, 2),
    spare1: numArray(summary.spare1, 2),
    spare2: numArray(summary.spare2, 2),
    casteClass: num(summary.casteClass),
    minimumAgeGroup: num(summary.minimumAgeGroup),
    moveBonus: num(summary.moveBonus),
    magRes: num(summary.magRes),
    twoHand: num(summary.twoHand),
    maxStaminaBonus: num(summary.maxStaminaBonus),
    bonusAttacks: num(summary.bonusAttacks),
    maxAttacks: num(summary.maxAttacks),
    victory: numArray(summary.victory, 30),
    startMoney: num(summary.startMoney),
    startItems: numArray(summary.startItems, 20),
    attacks: numArray(summary.attacks, 10),
    itemTypes: numArray(summary.itemTypes, 2),
    defaultIcon: num(summary.defaultIcon),
    maxSpellsAttacks: num(summary.maxSpellsAttacks),
    spellsSoFar: num(summary.spellsSoFar),
    spacer: numArray(summary.spacer, 63),
    authored: false,
    provenance: undefined
  };
}

export function isBlankImportedCasteRecord(record: ScenarioCasteOverride | null | undefined) {
  if (!record || record.authored) return false;
  const name = record.displayName?.trim() ?? "";
  const genericName = !name || name === `Caste ${record.id}` || name === `Caste ${record.id + 1}` || REALMZ_CASTES[record.id] === name;
  if (!genericName) return false;
  return (
    allZeroMatrix(record.specialAbility) &&
    allZero(record.drvBonus) &&
    allZero(record.attBonus) &&
    allZeroMatrix(record.spellcasters) &&
    allZero(record.minMax) &&
    allZero(record.conditions) &&
    record.canUseMissile === 0 &&
    record.getsMissileBonus === 0 &&
    allZero(record.stamina) &&
    allZero(record.strength) &&
    allZero(record.dodge) &&
    allZero(record.toHit) &&
    allZero(record.missile) &&
    allZero(record.hand2Hand) &&
    allZero(record.spare1 ?? []) &&
    allZero(record.spare2 ?? []) &&
    record.casteClass === 0 &&
    record.minimumAgeGroup === 0 &&
    record.moveBonus === 0 &&
    record.magRes === 0 &&
    record.twoHand === 0 &&
    record.maxStaminaBonus === 0 &&
    record.bonusAttacks === 0 &&
    record.maxAttacks === 0 &&
    allZero(record.victory) &&
    record.startMoney === 0 &&
    allZero(record.startItems) &&
    allZero(record.attacks) &&
    allZero(record.itemTypes) &&
    record.defaultIcon === 0 &&
    record.maxSpellsAttacks === 0 &&
    record.spellsSoFar === 0 &&
    allZero(record.spacer ?? [])
  );
}

export function emptyRaceView(id: number): ScenarioRaceOverride {
  return {
    id,
    displayName: REALMZ_RACES[id] || `Race ${id}`,
    plusMinusToHit: new Array(8).fill(0),
    specialAbility: new Array(14).fill(0),
    drvBonus: new Array(8).fill(0),
    attBonus: new Array(6).fill(0),
    minMax: [3, 25, 3, 25, 3, 25, 3, 25, 3, 25, 3, 25],
    spare: new Array(8).fill(0),
    conditions: new Array(40).fill(0),
    maxAge: 70,
    doesNotDie: 0,
    baseMove: 12,
    magRes: 0,
    twoHand: 0,
    missile: 0,
    numOfAttacks: [2, 4],
    canCaste: new Array(30).fill(0),
    ageRange: [[14, 17], [18, 21], [22, 35], [36, 49], [50, 70]],
    ageChange: Array.from({ length: 5 }, () => new Array(15).fill(0)),
    canRegenerate: 0,
    defaultIconSet: 0,
    itemTypes: [0, 0],
    descriptors: 0,
    spacer: new Array(31).fill(0),
    authored: false,
    provenance: undefined
  };
}

export function emptyCasteView(id: number): ScenarioCasteOverride {
  return {
    id,
    displayName: REALMZ_CASTES[id] || `Caste ${id}`,
    specialAbility: [new Array(14).fill(0), new Array(14).fill(0)],
    drvBonus: new Array(8).fill(0),
    attBonus: new Array(6).fill(0),
    spellcasters: Array.from({ length: 4 }, () => new Array(3).fill(0)),
    minMax: [3, 25, 3, 25, 3, 25, 3, 25, 3, 25, 3, 25],
    conditions: new Array(40).fill(0),
    canUseMissile: 0,
    getsMissileBonus: 0,
    stamina: [0, 0],
    strength: [0, 0],
    dodge: [0, 0],
    toHit: [0, 0],
    missile: [0, 0],
    hand2Hand: [0, 0],
    spare1: [0, 0],
    spare2: [0, 0],
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
    itemTypes: [0, 0],
    defaultIcon: 0,
    maxSpellsAttacks: 0,
    spellsSoFar: 0,
    spacer: new Array(63).fill(0),
    authored: false,
    provenance: undefined
  };
}

export function selectedIdFor(entityId: string | undefined, prefix: string) {
  if (!entityId?.startsWith(`${prefix}:`)) return null;
  const value = Number(entityId.slice(prefix.length + 1));
  return Number.isInteger(value) ? value : null;
}

export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function normalizeFamily(activeEditor: string): RulesFamily {
  if (activeEditor === "races") return "races";
  if (activeEditor === "castes") return "castes";
  return "spells";
}

export function familyLabel(family: RulesFamily) {
  if (family === "spells") return "Spell Editor";
  if (family === "races") return "Race Editor";
  return "Caste Editor";
}

export function victoryPointLabels() {
  return Array.from({ length: 30 }, (_, index) => index === 29 ? "++" : `Level ${index + 2}`);
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function overrideCount(project: Project, family: RulesFamily) {
  if (family === "spells") return project.spellOverrides?.length ?? 0;
  if (family === "races") return project.raceOverrides?.length ?? 0;
  return project.casteOverrides?.filter((record) => !isBlankImportedCasteRecord(record)).length ?? 0;
}

export function num(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function numArray(value: unknown, length: number, fallback = 0) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length }, (_, index) => num(source[index]) || fallback);
}

export function numMatrix(value: unknown, rows: number, columns: number) {
  const source = Array.isArray(value) ? value : [];
  return Array.from({ length: rows }, (_, row) => {
    const rowValue = source[row];
    const cells = Array.isArray(rowValue) ? rowValue : [];
    return Array.from({ length: columns }, (_, column) => num(cells[column]));
  });
}

function allZero(values: readonly number[] | null | undefined) {
  return (values ?? []).every((value) => value === 0);
}

function allZeroMatrix(values: readonly (readonly number[])[] | null | undefined) {
  return (values ?? []).every((row) => allZero(row));
}
