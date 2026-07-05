import type { BattleRecord, MessageRecord, MonsterRecord, OptionLabelRecord } from "../types";

export const MESSAGE_RECORD_BYTES = 256;
export const OPTION_LABEL_RECORD_BYTES = 25;
export const BATTLE_RECORD_BYTES = 346;
export const MONSTER_RECORD_BYTES = 210;
const BATTLE_GRID_SLOTS = 13 * 13;
const BATTLE_RUNTIME_MONSTER_LIMIT = 100;

type PascalTextRecord = {
  id: number;
  text: string;
  rawBytes?: number[];
  authored?: boolean;
};

export function writeMessages(records: MessageRecord[]) {
  return writePascalTextRecords(records, MESSAGE_RECORD_BYTES);
}

export function writeOptionLabels(records: OptionLabelRecord[]) {
  return writePascalTextRecords(records, OPTION_LABEL_RECORD_BYTES);
}

export function writeBattles(records: BattleRecord[]) {
  return writeFixedRecords(records, BATTLE_RECORD_BYTES, (record, target) => {
    copyRaw(target, record.rawBytes ?? []);
    if (!record.authored && record.rawBytes?.length === BATTLE_RECORD_BYTES) return;
    if (record.grid.length !== BATTLE_GRID_SLOTS) {
      throw new Error(`Battle ${record.id} must have a 13 x 13 monster grid`);
    }
    const placedMonsters = record.grid.filter((value) => value !== 0).length;
    if (placedMonsters > BATTLE_RUNTIME_MONSTER_LIMIT) {
      throw new Error(`Battle ${record.id} places ${placedMonsters} monsters; Realmz runtime supports at most ${BATTLE_RUNTIME_MONSTER_LIMIT} loaded monsters`);
    }
    for (let slot = 0; slot < BATTLE_GRID_SLOTS; slot += 1) {
      writeI16(target, slot * 2, record.grid[slot] ?? 0);
    }
    target[338] = record.dist & 0xff;
    writeI16(target, 340, record.messageBefore);
    writeI16(target, 342, record.messageAfter);
    writeI16(target, 344, record.battleMacro);
  });
}

export function writeMonsters(records: MonsterRecord[]) {
  return writeFixedRecords(records, MONSTER_RECORD_BYTES, (record, target) => {
    copyRaw(target, record.rawBytes ?? []);
    if (!record.authored && record.rawBytes?.length === MONSTER_RECORD_BYTES) return;
    target[0] = record.hitDice & 0xff;
    target[1] = record.staminaBonus & 0xff;
    target[2] = record.agility & 0xff;
    target[3] = record.nameId & 0xff;
    target[4] = record.movementMax & 0xff;
    target[5] = record.armor & 0xff;
    target[6] = record.magicResistance & 0xff;
    target[7] = record.distance & 0xff;
    target[8] = record.traitor & 0xff;
    target[9] = record.size & 0xff;
    writeI8Array(target, 10, record.typeFlags, 8);
    target[18] = record.attackCount & 0xff;
    target[19] = record.magicAttackCount & 0xff;
    for (let row = 0; row < 5; row += 1) {
      writeI8Array(target, 20 + row * 4, record.attacks[row] ?? [], 4);
    }
    target[40] = record.damageBonus & 0xff;
    target[41] = record.castPercent & 0xff;
    target[42] = record.runPercent & 0xff;
    target[43] = record.surrenderPercent & 0xff;
    target[44] = record.missilePercent & 0xff;
    target[45] = record.canSummon & 0xff;
    writeI8Array(target, 46, record.saves, 6);
    writeI8Array(target, 52, record.spellImmunities, 6);
    writeI16Array(target, 58, record.money, 3);
    writeI16Array(target, 64, record.spells, 10);
    writeI16Array(target, 84, record.items, 6);
    writeI16(target, 96, record.weapon);
    writeI16(target, 98, record.iconId);
    writeI16(target, 100, record.spellPoints);
    writeI16(target, 102, record.exp);
    writeI16(target, 104, record.stamina);
    writeI16(target, 106, record.staminaMax);
    writeI16Array(target, 108, record.underneath, 4);
    target[116] = record.target & 0xff;
    target[117] = record.guarding & 0xff;
    target[118] = record.notOnMenu ? 1 : 0;
    target[119] = record.beenAttacked & 0xff;
    target[120] = record.movement & 0xff;
    target[121] = record.magicToHit & 0xff;
    writeI8Array(target, 122, record.conditions, 40);
    target[162] = record.lr & 0xff;
    target[163] = record.up & 0xff;
    target[164] = record.attackNum & 0xff;
    target[165] = record.bonusAttack & 0xff;
    writeI16(target, 166, record.deathMacro);
    writeI16(target, 168, record.maxSpellPoints);
    encodeFixedText(target.subarray(170, 210), record.displayName);
  });
}

function writePascalTextRecords(records: PascalTextRecord[], recordBytes: number) {
  return writeFixedRecords(records, recordBytes, (record, target) => {
    copyRaw(target, record.rawBytes ?? []);
    if (!record.authored && record.rawBytes?.length === recordBytes) return;
    encodePascalText(target, record.text);
  });
}

function writeFixedRecords<T extends { id: number }>(
  records: T[],
  recordBytes: number,
  writeRecord: (record: T, target: Uint8Array) => void
) {
  const selected = records
    .filter((record) => Number.isInteger(record.id) && record.id >= 0)
    .sort((left, right) => left.id - right.id);
  const count = selected.length > 0 ? selected[selected.length - 1].id + 1 : 0;
  const output = new Uint8Array(count * recordBytes);
  for (const record of selected) {
    const start = record.id * recordBytes;
    const target = output.subarray(start, start + recordBytes);
    writeRecord(record, target);
  }
  return output;
}

function copyRaw(target: Uint8Array, raw: number[]) {
  const length = Math.min(target.byteLength, raw.length);
  for (let index = 0; index < length; index += 1) target[index] = raw[index] & 0xff;
}

function encodePascalText(target: Uint8Array, text: string) {
  if (target.byteLength === 0) return;
  const bytes = classicTextBytes(text);
  const maximum = Math.min(target.byteLength - 1, 255);
  if (bytes.byteLength > maximum) {
    throw new Error(`Classic Pascal text is ${bytes.byteLength} byte(s); maximum is ${maximum}`);
  }
  target.fill(0);
  target[0] = bytes.byteLength;
  target.set(bytes, 1);
}

function classicTextBytes(text: string) {
  return new Uint8Array([...text].map((char) => char.charCodeAt(0) <= 0x7f ? char.charCodeAt(0) : "?".charCodeAt(0)));
}

function encodeFixedText(target: Uint8Array, text: string) {
  const bytes = classicTextBytes(text);
  if (bytes.byteLength > target.byteLength) {
    throw new Error(`Classic fixed text is ${bytes.byteLength} byte(s); maximum is ${target.byteLength}`);
  }
  target.fill(0);
  target.set(bytes);
}

function writeI8Array(target: Uint8Array, offset: number, values: number[], count: number) {
  for (let index = 0; index < count; index += 1) {
    target[offset + index] = (values[index] ?? 0) & 0xff;
  }
}

function writeI16Array(target: Uint8Array, offset: number, values: number[], count: number) {
  for (let index = 0; index < count; index += 1) {
    writeI16(target, offset + index * 2, values[index] ?? 0);
  }
}

function writeI16(target: Uint8Array, offset: number, value: number) {
  const normalized = value < 0 ? value + 0x10000 : value;
  target[offset] = (normalized >> 8) & 0xff;
  target[offset + 1] = normalized & 0xff;
}
