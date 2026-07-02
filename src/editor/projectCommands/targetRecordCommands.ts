import {
  BattleRecord,
  ComplexEncounterRecord,
  MessageRecord,
  MonsterDescriptionRecord,
  MonsterRecord,
  MonsterSetId,
  OptionLabelRecord,
  Project,
  Provenance,
  RealmzTargetRecordKind,
  ScenarioItemRecord,
  ShopRecord,
  SimpleEncounterRecord,
  ThiefEncounterRecord,
  TimedEncounterRecord,
  TreasureRecord
} from "../types";

const ITEM_BYTES = 100;
const MONSTER_BYTES = 210;
const MONSTER_DESCRIPTION_BYTES = 256;
const THIEF_ENCOUNTER_BYTES = 118;
const TIMED_ENCOUNTER_BYTES = 40;
const OPTION_LABEL_BYTES = 25;
const MONSTER_SET_SOURCE_FILES: Record<Exclude<MonsterSetId, 0>, string> = {
  1: "Data MD1",
  [-1]: "Data MD-1"
};

export function createTargetRecord(project: Project, recordType: RealmzTargetRecordKind, requestedId?: number): Project {
  const id = requestedId ?? nextTargetId(project, recordType);
  if (id < 0 || !Number.isInteger(id)) return project;
  switch (recordType) {
    case "message":
      return upsertRecord(project, "messages", emptyMessage(id));
    case "battle":
      return upsertRecord(project, "battles", emptyBattle(id));
    case "monster":
      return upsertRecord(project, "monsters", emptyMonster(id));
    case "treasure":
      return upsertRecord(project, "treasures", emptyTreasure(id));
    case "shop":
      return upsertRecord(project, "shops", emptyShop(id));
    case "simpleEncounter":
      return upsertRecord(project, "simpleEncounters", emptySimpleEncounter(id));
    case "complexEncounter":
      return upsertRecord(project, "complexEncounters", emptyComplexEncounter(id));
    case "thiefEncounter":
      return upsertRecord(project, "thiefEncounters", emptyThiefEncounter(id));
    case "timedEncounter":
      return upsertRecord(project, "timedEncounters", emptyTimedEncounter(id));
    case "questLabel":
      return upsertQuestLabel(project, { id, label: `Quest ${id}` });
  }
}

export function deleteTargetRecord(project: Project, recordType: RealmzTargetRecordKind, id: number): Project {
  switch (recordType) {
    case "message":
      return upsertRecord(project, "messages", emptyMessage(id));
    case "battle":
      return upsertRecord(project, "battles", emptyBattle(id));
    case "monster":
      return upsertRecord(project, "monsters", emptyMonster(id));
    case "treasure":
      return upsertRecord(project, "treasures", emptyTreasure(id));
    case "shop":
      return upsertRecord(project, "shops", emptyShop(id));
    case "simpleEncounter":
      return upsertRecord(project, "simpleEncounters", emptySimpleEncounter(id));
    case "complexEncounter":
      return upsertRecord(project, "complexEncounters", emptyComplexEncounter(id));
    case "thiefEncounter":
      return upsertRecord(project, "thiefEncounters", emptyThiefEncounter(id));
    case "timedEncounter":
      return upsertRecord(project, "timedEncounters", emptyTimedEncounter(id));
    case "questLabel":
      return { ...project, questLabels: (project.questLabels ?? []).filter((quest) => quest.id !== id) };
  }
}

export function duplicateMessageRecord(project: Project, fromId: number, requestedId?: number): Project {
  const source = project.messages.find((record) => record.id === fromId);
  if (!source) return project;
  const id = requestedId ?? nextTargetId(project, "message");
  if (!Number.isInteger(id) || id < 0) return project;
  return upsertRecord(project, "messages", {
    ...emptyMessage(id),
    text: source.text,
    authored: true
  });
}

export function bulkUpdateMessageRecords(project: Project, updates: Array<{ id: number; text: string }>): Project {
  if (updates.length === 0) return project;
  const messages = [...(project.messages ?? [])];
  for (const update of updates) {
    if (!Number.isInteger(update.id) || update.id < 0) continue;
    const existingIndex = messages.findIndex((record) => record.id === update.id);
    const base = existingIndex >= 0 ? messages[existingIndex] : emptyMessage(update.id);
    const next = { ...base, text: update.text, authored: true };
    if (existingIndex >= 0) messages[existingIndex] = next;
    else messages.push(next);
  }
  messages.sort((a, b) => a.id - b.id);
  return { ...project, messages };
}

export function updateStringSound(project: Project, messageId: number, soundId: number): Project {
  if (!Number.isInteger(messageId) || messageId < 0 || !Number.isFinite(soundId)) return project;
  const supportFile = project.scenario.supportFile ?? { sourceFile: "Scenario" };
  return {
    ...project,
    scenario: {
      ...project.scenario,
      supportFile: {
        ...supportFile,
        sourceFile: supportFile.sourceFile || "Scenario",
        authored: true,
        divinityStringEditorSlot: messageId,
        divinityStringSoundId: Math.trunc(soundId)
      }
    }
  };
}

export function createMonsterFromTemplate(project: Project, id: number, template: MonsterRecord, description?: string, setId: MonsterSetId = 0): Project {
  if (!Number.isInteger(id) || id < 0) return project;
  const withMonster = upsertMonsterRecord(project, monsterForSet(id, template, setId), setId);
  return description !== undefined ? upsertMonsterDescription(withMonster, id, description) : withMonster;
}

export function updateMonsterRecord(project: Project, id: number, changes: Partial<MonsterRecord>, setId: MonsterSetId = 0): Project {
  if (!Number.isInteger(id) || id < 0) return project;
  const existing = monsterRecordForSet(project, id, setId);
  const base = existing ?? emptyMonsterForSet(id, setId);
  return upsertMonsterRecord(project, monsterForSet(id, { ...base, ...changes }, setId), setId);
}

export function createMonsterVariantFromNormal(project: Project, id: number, setId: Exclude<MonsterSetId, 0>): Project {
  const source = monsterRecordForSet(project, id, 0);
  if (!source) return project;
  return upsertMonsterRecord(project, monsterForSet(id, source, setId), setId);
}

export function copyCurrentMonsterToAllSets(project: Project, id: number, sourceSetId: MonsterSetId): Project {
  const source = monsterRecordForSet(project, id, sourceSetId);
  if (!source) return project;
  return ([0, 1, -1] as MonsterSetId[]).reduce((nextProject, setId) => upsertMonsterRecord(nextProject, monsterForSet(id, source, setId), setId), project);
}

export function switchMonsterRecords(project: Project, setId: MonsterSetId, fromId: number, toId: number): Project {
  if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId < 0 || toId < 0 || fromId === toId) return project;
  const from = monsterRecordForSet(project, fromId, setId);
  const to = monsterRecordForSet(project, toId, setId);
  if (!from || !to) return project;
  let next = upsertMonsterRecord(project, monsterForSet(fromId, to, setId), setId);
  next = upsertMonsterRecord(next, monsterForSet(toId, from, setId), setId);
  return switchMonsterDescriptions(next, fromId, toId);
}

export function generateMonsterVariants(project: Project, id: number): Project {
  const source = monsterRecordForSet(project, id, 0);
  if (!source) return project;
  let next = upsertMonsterRecord(project, generateMonsterVariant(source, 1), 1);
  next = upsertMonsterRecord(next, generateMonsterVariant(source, -1), -1);
  return next;
}

export function upsertMonsterDescription(project: Project, id: number, text: string): Project {
  if (!Number.isInteger(id) || id < 0) return project;
  const current = [...(project.monsterDescriptions ?? [])];
  const index = current.findIndex((record) => record.id === id);
  const base = index >= 0 ? current[index] : emptyMonsterDescription(id);
  const next: MonsterDescriptionRecord = {
    ...base,
    id,
    text,
    authored: true,
    provenance: authoredProvenance("Data DES", id, id * MONSTER_DESCRIPTION_BYTES, MONSTER_DESCRIPTION_BYTES)
  };
  if (index >= 0) current[index] = next;
  else current.push(next);
  current.sort((a, b) => a.id - b.id);
  return { ...project, monsterDescriptions: current };
}

function monsterRecordForSet(project: Project, id: number, setId: MonsterSetId) {
  if (setId === 0) return (project.monsters ?? []).find((record) => record.id === id) ?? null;
  return (project.monsterSets ?? []).find((set) => set.setId === setId)?.monsters.find((record) => record.id === id) ?? null;
}

function upsertMonsterRecord(project: Project, record: MonsterRecord, setId: MonsterSetId): Project {
  if (setId === 0) return upsertRecord(project, "monsters", record);
  const sourceFile = monsterSetSourceFile(setId);
  const monsterSets = [...(project.monsterSets ?? [])];
  const setIndex = monsterSets.findIndex((set) => set.setId === setId);
  const baseSet = setIndex >= 0 ? monsterSets[setIndex] : { sourceFile, setId, monsters: [] };
  const monsters = [...baseSet.monsters];
  const index = monsters.findIndex((candidate) => candidate.id === record.id);
  if (index >= 0) monsters[index] = { ...monsters[index], ...record };
  else monsters.push(record);
  monsters.sort((a, b) => a.id - b.id);
  const nextSet = { ...baseSet, sourceFile, setId, monsters };
  if (setIndex >= 0) monsterSets[setIndex] = nextSet;
  else monsterSets.push(nextSet);
  monsterSets.sort((a, b) => a.setId - b.setId);
  return { ...project, monsterSets };
}

function monsterForSet(id: number, template: Partial<MonsterRecord>, setId: MonsterSetId): MonsterRecord {
  const base = emptyMonsterForSet(id, setId);
  const sourceFile = monsterSetSourceFile(setId);
  return {
    ...base,
    ...template,
    id,
    typeFlags: fixedArray(template.typeFlags, 8),
    attacks: Array.from({ length: 5 }, (_, row) => fixedArray(template.attacks?.[row] ?? [], 4)),
    saves: fixedArray(template.saves, 6),
    spellImmunities: fixedArray(template.spellImmunities, 6),
    money: fixedArray(template.money, 3),
    spells: fixedArray(template.spells, 10),
    items: fixedArray(template.items, 6),
    underneath: fixedArray(template.underneath, 4),
    conditions: fixedArray(template.conditions, 40),
    rawBytes: fixedArray(template.rawBytes ?? [], MONSTER_BYTES),
    authored: true,
    provenance: authoredProvenance(sourceFile, id, id * MONSTER_BYTES, MONSTER_BYTES)
  };
}

function emptyMonsterForSet(id: number, setId: MonsterSetId): MonsterRecord {
  return {
    ...emptyMonster(id),
    provenance: authoredProvenance(monsterSetSourceFile(setId), id, id * MONSTER_BYTES, MONSTER_BYTES)
  };
}

function monsterSetSourceFile(setId: MonsterSetId) {
  return setId === 0 ? "Data MD" : MONSTER_SET_SOURCE_FILES[setId];
}

function switchMonsterDescriptions(project: Project, fromId: number, toId: number): Project {
  const descriptions = [...(project.monsterDescriptions ?? [])];
  const from = descriptions.find((description) => description.id === fromId) ?? emptyMonsterDescription(fromId);
  const to = descriptions.find((description) => description.id === toId) ?? emptyMonsterDescription(toId);
  const next = descriptions.filter((description) => description.id !== fromId && description.id !== toId);
  next.push({
    ...to,
    id: fromId,
    authored: true,
    provenance: authoredProvenance("Data DES", fromId, fromId * MONSTER_DESCRIPTION_BYTES, MONSTER_DESCRIPTION_BYTES)
  });
  next.push({
    ...from,
    id: toId,
    authored: true,
    provenance: authoredProvenance("Data DES", toId, toId * MONSTER_DESCRIPTION_BYTES, MONSTER_DESCRIPTION_BYTES)
  });
  next.sort((a, b) => a.id - b.id);
  return { ...project, monsterDescriptions: next };
}

function generateMonsterVariant(source: MonsterRecord, setId: Exclude<MonsterSetId, 0>) {
  const scale = setId === 1
    ? { hitDice: 6, staminaBonus: 6, agility: 1, movementMax: 2, armor: 10, magicResistance: 10, damageBonus: 2, saves: 10, spellPointsNumerator: 133, spellPointsDenominator: 100, expNumerator: 5, expDenominator: 4 }
    : { hitDice: 15, staminaBonus: 15, agility: 3, movementMax: 4, armor: 30, magicResistance: 25, damageBonus: 5, saves: 25, spellPointsNumerator: 2, spellPointsDenominator: 1, expNumerator: 25, expDenominator: 16 };
  const scaledSpellPoints = clampInteger(Math.floor(source.spellPoints * scale.spellPointsNumerator / scale.spellPointsDenominator), 0, 999);
  return monsterForSet(source.id, {
    ...source,
    hitDice: clampInteger(source.hitDice + scale.hitDice, 0, 255),
    staminaBonus: clampInteger(source.staminaBonus + scale.staminaBonus, -128, 127),
    agility: clampInteger(source.agility + scale.agility, -128, 127),
    movementMax: clampInteger(source.movementMax + scale.movementMax, -128, 127),
    armor: clampInteger(source.armor + scale.armor, -128, 127),
    magicResistance: clampInteger(source.magicResistance + scale.magicResistance, -128, 127),
    damageBonus: clampInteger(source.damageBonus + scale.damageBonus, -128, 127),
    saves: source.saves.map((value) => clampInteger(value + scale.saves, -128, 127)),
    spellPoints: scaledSpellPoints,
    maxSpellPoints: clampInteger(Math.max(source.maxSpellPoints, scaledSpellPoints), 0, 999),
    exp: clampInteger(Math.floor(source.exp * scale.expNumerator / scale.expDenominator), 0, 32767)
  }, setId);
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function createOptionLabel(project: Project, requestedId?: number): Project {
  const id = requestedId ?? nextOptionLabelId(project);
  if (!Number.isInteger(id) || id < 0) return project;
  return upsertOptionLabel(project, emptyOptionLabel(id));
}

export function clearOptionLabel(project: Project, id: number): Project {
  if (!Number.isInteger(id) || id < 0) return project;
  return upsertOptionLabel(project, emptyOptionLabel(id));
}

export function duplicateOptionLabel(project: Project, fromId: number, requestedId?: number): Project {
  const source = (project.optionLabels ?? []).find((record) => record.id === fromId);
  if (!source) return project;
  const id = requestedId ?? nextOptionLabelId(project);
  if (!Number.isInteger(id) || id < 0) return project;
  return upsertOptionLabel(project, {
    ...emptyOptionLabel(id),
    text: source.text,
    authored: true
  });
}

export function updateOptionLabel(project: Project, id: number, changes: Partial<Pick<OptionLabelRecord, "text">>): Project {
  if (!Number.isInteger(id) || id < 0) return project;
  const existing = (project.optionLabels ?? []).find((record) => record.id === id);
  const base = existing ?? emptyOptionLabel(id);
  return upsertOptionLabel(project, { ...base, ...changes, authored: true });
}

type TargetCollectionName = "messages" | "battles" | "monsters" | "scenarioItems" | "treasures" | "shops" | "simpleEncounters" | "complexEncounters" | "thiefEncounters" | "timedEncounters";
type TargetRecord =
  | MessageRecord
  | BattleRecord
  | MonsterRecord
  | ScenarioItemRecord
  | TreasureRecord
  | ShopRecord
  | SimpleEncounterRecord
  | ComplexEncounterRecord
  | ThiefEncounterRecord
  | TimedEncounterRecord;

const MAGIC_RESPONSE_BLANK_SPELL_ID = 1100;

export function updateRecord<K extends TargetCollectionName>(project: Project, collection: K, id: number, changes: Partial<Project[K][number]>) {
  const existing = (project[collection] as TargetRecord[]).find((record) => record.id === id);
  const base = existing ?? defaultRecordForCollection(collection, id);
  return upsertRecord(project, collection, { ...base, ...changes, authored: true } as Project[K][number]);
}

function upsertRecord<K extends TargetCollectionName>(project: Project, collection: K, record: Project[K][number]) {
  const current = [...((project[collection] ?? []) as Project[K][number][])];
  const index = current.findIndex((candidate) => candidate.id === record.id);
  if (index >= 0) current[index] = { ...current[index], ...record };
  else current.push(record);
  current.sort((a, b) => a.id - b.id);
  return { ...project, [collection]: current };
}

function defaultRecordForCollection(collection: TargetCollectionName, id: number): TargetRecord {
  if (collection === "messages") return emptyMessage(id);
  if (collection === "battles") return emptyBattle(id);
  if (collection === "monsters") return emptyMonster(id);
  if (collection === "scenarioItems") return emptyScenarioItem(id);
  if (collection === "treasures") return emptyTreasure(id);
  if (collection === "shops") return emptyShop(id);
  if (collection === "simpleEncounters") return emptySimpleEncounter(id);
  if (collection === "complexEncounters") return emptyComplexEncounter(id);
  if (collection === "thiefEncounters") return emptyThiefEncounter(id);
  return emptyTimedEncounter(id);
}

function nextTargetId(project: Project, recordType: RealmzTargetRecordKind) {
  const ids = targetIds(project, recordType);
  for (let id = 0; id < 10000; id += 1) {
    if (!ids.has(id)) return id;
  }
  return ids.size;
}

function nextOptionLabelId(project: Project) {
  const used = new Set((project.optionLabels ?? []).map((record) => record.id));
  for (let id = 0; id < 10000; id += 1) {
    if (!used.has(id)) return id;
  }
  return used.size;
}

function upsertOptionLabel(project: Project, record: OptionLabelRecord) {
  const current = [...(project.optionLabels ?? [])];
  const index = current.findIndex((candidate) => candidate.id === record.id);
  if (index >= 0) current[index] = { ...current[index], ...record };
  else current.push(record);
  current.sort((a, b) => a.id - b.id);
  return { ...project, optionLabels: current };
}

function fixedArray(values: number[] | undefined, length: number, fill = 0) {
  return Array.from({ length }, (_, index) => Number(values?.[index] ?? fill));
}

function targetIds(project: Project, recordType: RealmzTargetRecordKind) {
  const values =
    recordType === "message" ? project.messages :
    recordType === "battle" ? project.battles :
    recordType === "monster" ? project.monsters :
    recordType === "treasure" ? project.treasures :
    recordType === "shop" ? project.shops :
    recordType === "simpleEncounter" ? project.simpleEncounters :
    recordType === "complexEncounter" ? project.complexEncounters :
    recordType === "thiefEncounter" ? project.thiefEncounters :
    recordType === "timedEncounter" ? project.timedEncounters :
    project.questLabels;
  return new Set((values ?? []).map((record) => record.id));
}

export function upsertQuestLabel(project: Project, quest: { id: number; label: string; note?: string }) {
  const quests = [...(project.questLabels ?? [])];
  const index = quests.findIndex((candidate) => candidate.id === quest.id);
  if (index >= 0) quests[index] = { ...quests[index], ...quest };
  else quests.push(quest);
  quests.sort((a, b) => a.id - b.id);
  return { ...project, questLabels: quests };
}

function emptyMessage(id: number): MessageRecord {
  return { id, text: "", rawBytes: new Array(256).fill(0), authored: true, provenance: authoredProvenance("Data SD2", id, id * 256, 256) };
}

function emptyOptionLabel(id: number): OptionLabelRecord {
  return { id, text: "", rawBytes: new Array(OPTION_LABEL_BYTES).fill(0), authored: true, provenance: authoredProvenance("Data OD", id, id * OPTION_LABEL_BYTES, OPTION_LABEL_BYTES) };
}

function emptyBattle(id: number): BattleRecord {
  return { id, grid: new Array(13 * 13).fill(0), dist: 0, messageBefore: 0, messageAfter: 0, battleMacro: 0, rawBytes: new Array(346).fill(0), authored: true, provenance: authoredProvenance("Data BD", id, id * 346, 346) };
}

function emptyMonster(id: number): MonsterRecord {
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
    size: 1,
    typeFlags: new Array(8).fill(0),
    attackCount: 1,
    magicAttackCount: 0,
    attacks: Array.from({ length: 5 }, () => [0, 0, 0, 0]),
    damageBonus: 0,
    castPercent: 0,
    runPercent: 0,
    surrenderPercent: 0,
    missilePercent: 0,
    canSummon: 0,
    saves: new Array(6).fill(0),
    spellImmunities: new Array(6).fill(0),
    money: [0, 0, 0],
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
    displayName: `Monster ${id}`,
    rawBytes: new Array(MONSTER_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data MD", id, id * MONSTER_BYTES, MONSTER_BYTES)
  };
}

function emptyMonsterDescription(id: number): MonsterDescriptionRecord {
  return {
    id,
    text: "",
    rawBytes: new Array(MONSTER_DESCRIPTION_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data DES", id, id * MONSTER_DESCRIPTION_BYTES, MONSTER_DESCRIPTION_BYTES)
  };
}

function emptyTreasure(id: number): TreasureRecord {
  return { id, itemIds: new Array(20).fill(0), exp: 0, gold: 0, gems: 0, jewelry: 0, rawBytes: new Array(48).fill(0), authored: true, provenance: authoredProvenance("Data TD", id, id * 48, 48) };
}

export function emptyScenarioItem(id: number): ScenarioItemRecord {
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
    rawBytes: new Array(ITEM_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data NI", id, id * ITEM_BYTES, ITEM_BYTES)
  };
}

function emptyShop(id: number): ShopRecord {
  return { id, itemIds: new Array(1000).fill(0), quantities: new Array(1000).fill(0), inflation: 0, rawBytes: new Array(3002).fill(0), authored: true, provenance: authoredProvenance("Data SD", id, id * 3002, 3002) };
}

function emptySimpleEncounter(id: number): SimpleEncounterRecord {
  return { id, actions: [], choiceResults: [0, 0, 0, 0], canBackOut: false, maxTimes: 0, casteSuccess: 0, prompt: 0, texts: ["", "", "", ""], rawBytes: new Array(426).fill(0), authored: true, provenance: authoredProvenance("Data ED", id, id * 426, 426) };
}

function emptyComplexEncounter(id: number): ComplexEncounterRecord {
  return {
    id,
    actions: [],
    actionResult: 0,
    wordResult: 0,
    groups: new Array(8).fill(0),
    spellIds: new Array(10).fill(MAGIC_RESPONSE_BLANK_SPELL_ID),
    spellResults: new Array(10).fill(0),
    itemIds: new Array(5).fill(0),
    itemResults: new Array(5).fill(0),
    choiceResults: [0, 0, 0, 0],
    wordResults: [0, 0, 0, 0],
    canBackOut: false,
    thief: false,
    maxTimes: 0,
    casteSuccess: 0,
    thiefSuccess: 0,
    thiefFail: 0,
    prompt: 0,
    texts: ["", "", "", "", "", "", "", "", ""],
    rawBytes: new Array(520).fill(0),
    authored: true,
    provenance: authoredProvenance("Data ED2", id, id * 520, 520)
  };
}

function emptyThiefEncounter(id: number): ThiefEncounterRecord {
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
    rawBytes: new Array(THIEF_ENCOUNTER_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data TD2", id, id * THIEF_ENCOUNTER_BYTES, THIEF_ENCOUNTER_BYTES)
  };
}

function emptyTimedEncounter(id: number): TimedEncounterRecord {
  return {
    id,
    day: -1,
    increment: -1,
    percent: 100,
    door: 0,
    requiredLevel: -1,
    requiredRandomRect: -1,
    requiredX: -1,
    requiredY: -1,
    requiredItem: -1,
    requiredQuest: -1,
    locationKind: "any",
    stuff: [-1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    rawBytes: new Array(TIMED_ENCOUNTER_BYTES).fill(0),
    authored: true,
    provenance: authoredProvenance("Data TD3", id, id * TIMED_ENCOUNTER_BYTES, TIMED_ENCOUNTER_BYTES)
  };
}

function authoredProvenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number): Provenance {
  return {
    sourceFile,
    recordIndex,
    byteOffset,
    byteLength,
    confidence: "inferred"
  };
}
