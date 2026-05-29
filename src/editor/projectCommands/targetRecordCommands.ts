import {
  BattleRecord,
  ComplexEncounterRecord,
  MessageRecord,
  MonsterRecord,
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
const THIEF_ENCOUNTER_BYTES = 118;
const TIMED_ENCOUNTER_BYTES = 40;
const OPTION_LABEL_BYTES = 25;

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
  return { id, actions: [], choiceResults: [0, 0, 0, 0], wordResults: [0, 0, 0, 0], canBackOut: false, thief: false, maxTimes: 0, casteSuccess: 0, thiefSuccess: 0, thiefFail: 0, prompt: 0, texts: ["", "", "", "", "", "", "", "", ""], rawBytes: new Array(520).fill(0), authored: true, provenance: authoredProvenance("Data ED2", id, id * 520, 520) };
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
