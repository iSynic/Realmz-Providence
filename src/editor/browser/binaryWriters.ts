import type {
  BattleRecord,
  ComplexEncounterRecord,
  CustomLandlookMetadata,
  EncounterActionRow,
  ExtraCodeRow,
  LandLayout,
  LevelType,
  MapEntity,
  MapMarker,
  MapRecord,
  MessageRecord,
  MonsterDescriptionRecord,
  MonsterRecord,
  OptionLabelRecord,
  RandomLevel,
  ScenarioCasteOverride,
  ScenarioContactInfo,
  ScenarioGlobalMacroHooks,
  ScenarioItemRecord,
  ScenarioRaceOverride,
  ScenarioRestrictions,
  ScenarioShell,
  ScenarioSpellOverride,
  ScenarioSupportFile,
  ShopRecord,
  SimpleEncounterRecord,
  ThiefEncounterRecord,
  TimedEncounterRecord,
  TileAttributeProfile,
  TriggerRecord,
  TreasureRecord
} from "../types";

export const MESSAGE_RECORD_BYTES = 256;
export const OPTION_LABEL_RECORD_BYTES = 25;
export const BATTLE_RECORD_BYTES = 346;
export const MONSTER_RECORD_BYTES = 210;
export const MONSTER_DESCRIPTION_RECORD_BYTES = 256;
export const ITEM_RECORD_BYTES = 100;
export const TREASURE_RECORD_BYTES = 48;
export const SHOP_RECORD_BYTES = 3002;
export const SPELL_RECORD_BYTES = 30;
export const RACE_RECORD_BYTES = 408;
export const CASTE_RECORD_BYTES = 576;
export const SIMPLE_ENCOUNTER_RECORD_BYTES = 426;
export const COMPLEX_ENCOUNTER_RECORD_BYTES = 520;
export const THIEF_ENCOUNTER_RECORD_BYTES = 118;
export const TIMED_ENCOUNTER_RECORD_BYTES = 40;
export const MAP_SIZE = 90;
export const FIELD_RECORD_BYTES = MAP_SIZE * MAP_SIZE * 2;
export const MAP_RECORD_BYTES = 340;
export const MAP_RECORD_MARKERS = 10;
export const MAP_RECORD_MARKER_BYTES = 6;
export const RANDOM_LEVEL_RECORD_BYTES = 644;
export const DOOR_RECORD_BYTES = 40;
export const DOORS_PER_LEVEL = 100;
export const DOOR_LEVEL_RECORD_BYTES = DOOR_RECORD_BYTES * DOORS_PER_LEVEL;
export const EXTRACODE_RECORD_BYTES = 10;
export const GLOBAL_MACRO_HOOK_BYTES = 60;
export const LAND_LAYOUT_ROWS = 8;
export const LAND_LAYOUT_COLUMNS = 16;
export const LAND_LAYOUT_RECORD_BYTES = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLUMNS * 2;
export const SCENARIO_SHELL_BYTES = 316;
export const SCENARIO_SUPPORT_FILE_BYTES = 600;
export const SCENARIO_CONTACT_INFO_BYTES = 4608;
export const SCENARIO_RESTRICTIONS_BYTES = 320;
export const TILE_SOLIDS_BYTES = 1024;
export const MAPSTATS_RECORD_BYTES = 40;
export const MAPSTATS_RECORDS = 201;
export const LANDLOOK_RANGE_TAIL_BYTES = 60;
export const LANDLOOK_RANGE_SLOT_BYTES = 6;
export const LANDLOOK_RANGE_SLOTS = LANDLOOK_RANGE_TAIL_BYTES / LANDLOOK_RANGE_SLOT_BYTES;
export const CUSTOM_LANDLOOK_METADATA_BYTES = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + LANDLOOK_RANGE_TAIL_BYTES;
const BATTLE_GRID_SLOTS = 13 * 13;
const BATTLE_RUNTIME_MONSTER_LIMIT = 100;

type PascalTextRecord = {
  id: number;
  text: string;
  rawBytes?: number[];
  authored?: boolean;
};

export function writeMessages(records: MessageRecord[]) {
  return writeFixedRecords(records, MESSAGE_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== MESSAGE_RECORD_BYTES) {
      throw new Error(`Message ${record.id} has invalid compatibility byte storage`);
    }
    encodePascalText(target, record.text);
  });
}

export function writeOptionLabels(records: OptionLabelRecord[]) {
  return writeFixedRecords(records, OPTION_LABEL_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== OPTION_LABEL_RECORD_BYTES) {
      throw new Error(`Option label ${record.id} has invalid compatibility byte storage`);
    }
    encodePascalText(target, record.text);
  });
}

export function writeTileSolids(attributes: TileAttributeProfile[]) {
  const output = new Uint8Array(TILE_SOLIDS_BYTES);
  const seen = new Set<number>();
  for (const attribute of attributes) {
    if (attribute.sourceKind !== "data-solids") continue;
    if (!Number.isInteger(attribute.tile) || attribute.tile < 0 || attribute.tile >= TILE_SOLIDS_BYTES) {
      throw new Error(`Data Solids tile ${attribute.tile} is outside the 0..${TILE_SOLIDS_BYTES - 1} table range.`);
    }
    if (seen.has(attribute.tile)) {
      throw new Error(`Data Solids tile ${attribute.tile} is defined more than once.`);
    }
    seen.add(attribute.tile);
    const value = attribute.solidType ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(`Data Solids tile ${attribute.tile} solidity ${value} is outside the unsigned-byte range 0..255.`);
    }
    output[attribute.tile] = value;
  }
  return output;
}

export function writeBattles(records: BattleRecord[]) {
  return writeFixedRecords(records, BATTLE_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== BATTLE_RECORD_BYTES) {
      throw new Error(`Battle ${record.id} has invalid compatibility byte storage`);
    }
    if (record.grid.length !== BATTLE_GRID_SLOTS) {
      throw new Error(`Battle ${record.id} must have a 13 x 13 monster grid`);
    }
    const placedMonsters = record.grid.filter((value) => value !== 0).length;
    if (record.authored && placedMonsters > BATTLE_RUNTIME_MONSTER_LIMIT) {
      throw new Error(`Battle ${record.id} places ${placedMonsters} monsters; Realmz runtime supports at most ${BATTLE_RUNTIME_MONSTER_LIMIT} loaded monsters`);
    }
    for (let slot = 0; slot < BATTLE_GRID_SLOTS; slot += 1) {
      writeI16(target, slot * 2, record.grid[slot] ?? 0);
    }
    target[338] = record.dist & 0xff;
    target[339] = 0;
    writeI16(target, 340, record.messageBefore);
    writeI16(target, 342, record.messageAfter);
    writeI16(target, 344, record.battleMacro);
  });
}

export function writeMonsters(records: MonsterRecord[]) {
  return writeFixedRecords(records, MONSTER_RECORD_BYTES, (record, target) => {
    validateMonsterStorage(record);
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

export function writeMonsterDescriptions(records: MonsterDescriptionRecord[]) {
  return writeFixedRecords(records, MONSTER_DESCRIPTION_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== MONSTER_DESCRIPTION_RECORD_BYTES) {
      throw new Error(`Monster description ${record.id} has invalid compatibility byte storage`);
    }
    encodePascalText(target, record.text);
  });
}

function validateMonsterStorage(record: MonsterRecord) {
  const rawBytes = record.rawBytes ?? [];
  if (rawBytes.length !== 0 && rawBytes.length !== MONSTER_RECORD_BYTES) {
    throw new Error(`Monster ${record.id} has invalid compatibility byte storage`);
  }
  for (const [name, values, expected] of [
    ["trait flags", record.typeFlags, 8],
    ["attack rows", record.attacks, 5],
    ["saves", record.saves, 6],
    ["spell immunities", record.spellImmunities, 6],
    ["money slots", record.money, 3],
    ["spell slots", record.spells, 10],
    ["item slots", record.items, 6],
    ["underneath slots", record.underneath, 4],
    ["condition fields", record.conditions, 40]
  ] as const) {
    if (values.length !== expected) throw new Error(`Monster ${record.id} must have exactly ${expected} ${name}`);
  }
  if (record.attacks.some((row) => row.length !== 4)) {
    throw new Error(`Monster ${record.id} attack rows must have exactly 4 fields`);
  }
}

export function writeMapFields(maps: MapEntity[], levelType: LevelType) {
  const selected = maps
    .filter((map) => map.levelType === levelType)
    .sort((left, right) => left.index - right.index);
  ensureDenseIndices(selected, `${levelType} map fields`);
  const output = new Uint8Array(selected.length * FIELD_RECORD_BYTES);
  for (const map of selected) {
    if (map.width !== MAP_SIZE || map.height !== MAP_SIZE || map.tiles.length !== MAP_SIZE * MAP_SIZE) {
      throw new Error(`${map.id} must be a 90 x 90 map with 8100 tiles`);
    }
    const start = map.index * FIELD_RECORD_BYTES;
    for (let index = 0; index < MAP_SIZE * MAP_SIZE; index += 1) {
      writeI16(output, start + index * 2, map.tiles[index] ?? 0);
    }
  }
  return output;
}

export function writeMapRecords(records: MapRecord[]) {
  return writeFixedRecords(records, MAP_RECORD_BYTES, (record, target) => {
    for (const [slot, marker] of normalizedMapRecordMarkers(record).entries()) {
      const offset = slot * MAP_RECORD_MARKER_BYTES;
      writeI16(target, offset, marker.iconId);
      writeI16(target, offset + 2, marker.x);
      writeI16(target, offset + 4, marker.y);
    }
    writeI16(target, 60, record.startX);
    writeI16(target, 62, record.startY);
    writeI16(target, 64, record.level);
    writeI16(target, 66, record.pictId);
    writeI16(target, 68, record.iconSize);
    writeI16(target, 70, record.show);
    writeI16(target, 72, record.isDungeon ? 1 : 0);
    writeI16(target, 76, record.rect.top);
    writeI16(target, 78, record.rect.left);
    writeI16(target, 80, record.rect.bottom);
    writeI16(target, 82, record.rect.right);
    encodePascalText(target.subarray(84, MAP_RECORD_BYTES), record.note);
  });
}

export function writeRandomLevels(levels: RandomLevel[], levelType: LevelType) {
  const selected = levels
    .filter((level) => level.levelType === levelType)
    .sort((left, right) => left.levelIndex - right.levelIndex);
  ensureDenseLevelIndices(selected, `${levelType} random levels`);
  const output = new Uint8Array(selected.length * RANDOM_LEVEL_RECORD_BYTES);
  for (const level of selected) {
    const start = level.levelIndex * RANDOM_LEVEL_RECORD_BYTES;
    output[start + 520] = level.landlook & 0xff;
    output[start + 521] = level.isDark ? 1 : 0;
    output[start + 522] = level.useLos ? 1 : 0;
    for (const rect of level.rects) {
      if (rect.rectIndex < 0 || rect.rectIndex >= 20) {
        throw new Error(`${level.id} random rect index ${rect.rectIndex} is out of range`);
      }
      const rectStart = start + rect.rectIndex * 8;
      writeI16(output, rectStart, rect.top);
      writeI16(output, rectStart + 2, rect.left);
      writeI16(output, rectStart + 4, rect.bottom);
      writeI16(output, rectStart + 6, rect.right);
      writeI16(output, start + 160 + rect.rectIndex * 2, rect.percent);
      writeI16(output, start + 200 + rect.rectIndex * 4, rect.battleRange[0] ?? 0);
      writeI16(output, start + 202 + rect.rectIndex * 4, rect.battleRange[1] ?? 0);
      for (let slot = 0; slot < 3; slot += 1) {
        writeI16(output, start + 280 + rect.rectIndex * 6 + slot * 2, rect.randomDoors[slot] ?? 0);
        writeI16(output, start + 400 + rect.rectIndex * 6 + slot * 2, rect.randomDoorPercent[slot] ?? 0);
      }
      output[start + 523 + rect.rectIndex] = rect.only ? 1 : 0;
      output[start + 543 + rect.rectIndex] = rect.option & 0xff;
      writeI16(output, start + 563 + rect.rectIndex * 2, rect.sound);
      writeI16(output, start + 603 + rect.rectIndex * 2, rect.text);
    }
  }
  return output;
}

export function writeDoorFile(triggers: TriggerRecord[], levelType: LevelType, minimumLevelCount = 0) {
  const selected = triggers.filter((trigger) => trigger.levelType === levelType);
  const levelCount = selected.reduce(
    (max, trigger) => Math.max(max, (trigger.levelIndex ?? -1) + 1),
    minimumLevelCount
  );
  const output = new Uint8Array(levelCount * DOOR_LEVEL_RECORD_BYTES);
  for (const trigger of selected) {
    if (trigger.levelIndex == null) {
      throw new Error(`${trigger.id} is missing a level index`);
    }
    if (trigger.recordIndex < 0 || trigger.recordIndex >= DOORS_PER_LEVEL) {
      throw new Error(`${trigger.id} door record index is out of range`);
    }
    const start = trigger.levelIndex * DOOR_LEVEL_RECORD_BYTES + trigger.recordIndex * DOOR_RECORD_BYTES;
    writeDoor(output.subarray(start, start + DOOR_RECORD_BYTES), trigger);
  }
  return output;
}

export function writeMacroFile(triggers: TriggerRecord[]) {
  const selected = triggers
    .filter((trigger) => trigger.source === "Data ED3")
    .sort((left, right) => left.recordIndex - right.recordIndex);
  const count = selected.length > 0 ? selected[selected.length - 1].recordIndex + 1 : 0;
  const output = new Uint8Array(count * DOOR_RECORD_BYTES);
  for (const trigger of selected) {
    if (trigger.recordIndex < 0) {
      throw new Error(`${trigger.id} macro record index is out of range`);
    }
    const start = trigger.recordIndex * DOOR_RECORD_BYTES;
    writeDoor(output.subarray(start, start + DOOR_RECORD_BYTES), trigger);
  }
  return output;
}

export function writeExtraCodes(rows: ExtraCodeRow[]) {
  return writeFixedRecords(rows, EXTRACODE_RECORD_BYTES, (row, target) => {
    for (let slot = 0; slot < 5; slot += 1) {
      writeI16(target, slot * 2, row.values[slot] ?? 0);
    }
  });
}

export function writeGlobalMacroHooks(hooks: ScenarioGlobalMacroHooks) {
  const rawBytes = hooks.rawBytes ?? [];
  if (rawBytes.length !== 0 && rawBytes.length !== GLOBAL_MACRO_HOOK_BYTES) {
    throw new Error("Global macro hooks have invalid compatibility byte storage");
  }
  const output = new Uint8Array(GLOBAL_MACRO_HOOK_BYTES);
  for (const hook of hooks.slots) {
    if (![0, 1, 2, 4, 5].includes(hook.slot)) continue;
    writeI16(output, hook.slot * 2, hook.door);
  }
  return output;
}

export function writeLandLayout(layout: LandLayout) {
  if (layout.rows !== LAND_LAYOUT_ROWS || layout.cols !== LAND_LAYOUT_COLUMNS) {
    throw new Error(`Layout must be ${LAND_LAYOUT_ROWS} rows by ${LAND_LAYOUT_COLUMNS} columns`);
  }
  const expectedCells = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLUMNS;
  if (layout.cells.length !== expectedCells) {
    throw new Error(`Layout must contain exactly ${expectedCells} cells; found ${layout.cells.length}`);
  }
  const output = new Uint8Array(LAND_LAYOUT_RECORD_BYTES);
  for (let index = 0; index < LAND_LAYOUT_ROWS * LAND_LAYOUT_COLUMNS; index += 1) {
    writeI16(output, index * 2, layout.cells[index]);
  }
  return output;
}

export function writeCustomLandlookMetadata(metadata: CustomLandlookMetadata) {
  const output = new Uint8Array(CUSTOM_LANDLOOK_METADATA_BYTES);
  for (const [tile, record] of metadata.records.slice(0, MAPSTATS_RECORDS).entries()) {
    writeMapstatsRecord(output, tile, record);
  }
  const baseOffset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
  writeI16(output, baseOffset, metadata.baseTile);
  writeI16(output, baseOffset + 2, metadata.baseScale);
  for (const slot of metadata.rangeSlots.slice(0, LANDLOOK_RANGE_SLOTS)) {
    if (slot.slot < 0 || slot.slot >= LANDLOOK_RANGE_SLOTS) continue;
    const start = baseOffset + 4 + slot.slot * LANDLOOK_RANGE_SLOT_BYTES;
    writeI16(output, start, slot.firstTile);
    writeI16(output, start + 2, slot.lastTile);
  }
  return output;
}

export function writeScenarioShell(shell: ScenarioShell) {
  const output = new Uint8Array(SCENARIO_SHELL_BYTES);
  writeI32(output, 0, shell.recLevel);
  writeI32(output, 4, shell.maxLevel);
  writeI32(output, 8, shell.landLevel);
  writeI32(output, 12, shell.lookX);
  writeI32(output, 16, shell.lookY);
  copyFixedBytes(output.subarray(20, 40), shell.codeseg1 ?? []);
  copyFixedBytes(output.subarray(40, 60), shell.codeseg2 ?? []);
  encodePascalText(output.subarray(60, SCENARIO_SHELL_BYTES), shell.creatorUser ?? "");
  return output;
}

export function writeScenarioSupportFile(support: ScenarioSupportFile) {
  const output = new Uint8Array(SCENARIO_SUPPORT_FILE_BYTES);

  if (support.divinityStringEditorSlot != null) {
    const slot = support.divinityStringEditorSlot;
    if (!Number.isInteger(slot) || slot < 0 || slot > 255) {
      throw new Error(`Divinity string editor slot ${slot} is outside the 0..255 byte range`);
    }
    output[23] = slot & 0xff;
  }
  if (support.divinityStringSoundId != null) {
    const soundId = support.divinityStringSoundId;
    if (!Number.isInteger(soundId) || soundId < -0x8000 || soundId > 0x7fff) {
      throw new Error(`Divinity string sound id ${soundId} is outside the signed 16-bit range`);
    }
    writeI16(output, 38, soundId);
  }
  return output;
}

export function writeScenarioContactInfo(contact: ScenarioContactInfo) {
  validateCompatibilityStorage("Scenario contact info", 0, contact.rawBytes, SCENARIO_CONTACT_INFO_BYTES);
  const output = new Uint8Array(SCENARIO_CONTACT_INFO_BYTES);
  const fields = [
    contact.scenarioName,
    contact.version,
    contact.date,
    contact.author,
    contact.email,
    contact.web,
    contact.fee
  ];
  for (const [slot, value] of fields.entries()) {
    encodePascalText(output.subarray(slot * MESSAGE_RECORD_BYTES, slot * MESSAGE_RECORD_BYTES + MESSAGE_RECORD_BYTES), value ?? "");
  }
  for (let index = 0; index < 5; index += 1) {
    encodePascalText(output.subarray((7 + index) * MESSAGE_RECORD_BYTES, (8 + index) * MESSAGE_RECORD_BYTES), contact.payInfo[index] ?? "");
    encodePascalText(output.subarray((12 + index) * MESSAGE_RECORD_BYTES, (13 + index) * MESSAGE_RECORD_BYTES), contact.titles[index] ?? "");
  }
  encodePascalText(output.subarray(17 * MESSAGE_RECORD_BYTES, 18 * MESSAGE_RECORD_BYTES), contact.description ?? "");
  return output;
}

export function writeScenarioRestrictions(restrictions: ScenarioRestrictions) {
  validateCompatibilityStorage("Scenario restrictions", 0, restrictions.rawBytes, SCENARIO_RESTRICTIONS_BYTES);
  const output = new Uint8Array(SCENARIO_RESTRICTIONS_BYTES);
  encodePascalText(output.subarray(0, MESSAGE_RECORD_BYTES), restrictions.description ?? "");
  writeI16(output, 256, restrictions.maxPartyCharacters);
  writeI16(output, 258, restrictions.maxPartyLevel);
  output.fill(0, 260, 320);
  for (const race of restrictions.bannedRaces) {
    if (race >= 1 && race <= 30) output[260 + race - 1] = 1;
  }
  for (const caste of restrictions.bannedCastes) {
    if (caste >= 1 && caste <= 30) output[290 + caste - 1] = 1;
  }
  return output;
}

export function writeScenarioItems(records: ScenarioItemRecord[]) {
  return writeFixedRecords(records, ITEM_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== ITEM_RECORD_BYTES) {
      throw new Error(`Scenario item ${record.id} has invalid compatibility byte storage`);
    }
    if (record.spare2.length !== 7) {
      throw new Error(`Scenario item ${record.id} must define 7 spare words`);
    }
    copyRaw(target, rawBytes);
    const preserveZeroItemId = rawBytes.length === ITEM_RECORD_BYTES && readI16(target, 2) === 0 && record.itemId === 800 + record.id;
    writeI16(target, 0, record.st);
    if (!preserveZeroItemId) writeI16(target, 2, record.itemId);
    writeI16(target, 4, record.iconId);
    writeI16(target, 6, record.type);
    writeI16(target, 8, record.blunt);
    writeI16(target, 10, record.hands);
    writeI16(target, 12, record.lu);
    writeI16(target, 14, record.movement);
    writeI16(target, 16, record.ac);
    writeI16(target, 18, record.magicResistance);
    writeI16(target, 20, record.damage);
    writeI16(target, 22, record.spellPoints);
    writeI16(target, 24, record.sound);
    writeI16(target, 26, record.weight);
    writeI16(target, 28, record.cost);
    writeI16(target, 30, record.charge);
    writeI16(target, 32, record.cursedItemId);
    writeI16(target, 34, record.magical);
    writeI32(target, 36, record.itemCat0);
    writeI32(target, 40, record.itemCat1);
    writeI16(target, 44, record.raceRestrictions);
    writeI16(target, 46, record.casteRestrictions);
    writeI16(target, 48, record.specificRace);
    writeI16(target, 50, record.specificCaste);
    writeI16(target, 52, record.raceClassOnly);
    writeI16(target, 54, record.casteClassOnly);
    writeI16Array(target, 56, record.spare2, 7);
    writeI16(target, 70, record.vSmall);
    writeI16(target, 72, record.vLarge);
    writeI16(target, 74, record.heat);
    writeI16(target, 76, record.cold);
    writeI16(target, 78, record.electric);
    writeI16(target, 80, record.vsUndead);
    writeI16(target, 82, record.vsDemonDevil);
    writeI16(target, 84, record.vsEvil);
    writeI16(target, 86, record.special1);
    writeI16(target, 88, record.special2);
    writeI16(target, 90, record.special3);
    writeI16(target, 92, record.special4);
    writeI16(target, 94, record.special5);
    writeI16(target, 96, record.weightPerCharge);
    writeI16(target, 98, record.dropOnEmpty);
  });
}

export function writeTreasures(records: TreasureRecord[]) {
  return writeFixedRecords(records, TREASURE_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== TREASURE_RECORD_BYTES) {
      throw new Error(`Treasure ${record.id} has invalid compatibility byte storage`);
    }
    if (record.itemIds.length !== 20) {
      throw new Error(`Treasure ${record.id} must define 20 item slots`);
    }
    writeI16Array(target, 0, record.itemIds, 20);
    writeI16(target, 40, record.exp);
    writeI16(target, 42, record.gold);
    writeI16(target, 44, record.gems);
    writeI16(target, 46, record.jewelry);
  });
}

export function writeShops(records: ShopRecord[]) {
  return writeFixedRecords(records, SHOP_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== SHOP_RECORD_BYTES) {
      throw new Error(`Shop ${record.id} has invalid compatibility byte storage`);
    }
    if (record.itemIds.length !== 1000 || record.quantities.length !== 1000) {
      throw new Error(`Shop ${record.id} must define 1000 item and quantity slots`);
    }
    for (let slot = 0; slot < 1000; slot += 1) {
      writeI16(target, slot * 2, record.itemIds[slot]);
      target[2000 + slot] = record.quantities[slot] & 0xff;
    }
    writeI16(target, 3000, record.inflation);
  });
}

export function writeSpellOverrides(records: ScenarioSpellOverride[]) {
  return writeFixedRecords(records, SPELL_RECORD_BYTES, (record, target) => {
    validateCompatibilityStorage("Custom spell", record.id, record.rawBytes, SPELL_RECORD_BYTES);
    target[0] = record.range1 & 0xff;
    target[1] = record.range2 & 0xff;
    target[2] = record.queueIcon & 0xff;
    target[3] = record.toHitBonus & 0xff;
    target[4] = record.saveBonus & 0xff;
    target[5] = record.fixedTargetNum & 0xff;
    target[6] = record.canRotate & 0xff;
    target[7] = record.saveAdjust & 0xff;
    target[8] = record.cannot & 0xff;
    target[9] = record.resistAdjust & 0xff;
    target[10] = record.cost & 0xff;
    target[11] = record.damage1 & 0xff;
    target[12] = record.damage2 & 0xff;
    target[13] = record.powerDamage1 & 0xff;
    target[14] = record.powerDamage2 & 0xff;
    target[15] = record.duration1 & 0xff;
    target[16] = record.duration2 & 0xff;
    target[17] = record.powerDuration1 & 0xff;
    target[18] = record.powerDuration2 & 0xff;
    target[19] = record.spellLook1 & 0xff;
    target[20] = record.spellLook2 & 0xff;
    target[21] = record.sound1 & 0xff;
    target[22] = record.sound2 & 0xff;
    target[23] = record.targetType & 0xff;
    target[24] = record.size & 0xff;
    target[25] = record.special & 0xff;
    target[26] = record.damageType & 0xff;
    target[27] = record.spellClass & 0xff;
    target[28] = record.inCombat ? 1 : 0;
    target[29] = record.inCamp ? 1 : 0;
  });
}

export function writeRaceOverrides(records: ScenarioRaceOverride[]) {
  return writeFixedRecords(records, RACE_RECORD_BYTES, (record, target) => {
    validateRaceStorage(record);
    writeI16Array(target, 0, record.plusMinusToHit, 8);
    writeI16Array(target, 16, record.specialAbility, 14);
    writeI16Array(target, 44, record.drvBonus, 8);
    writeI16Array(target, 60, record.attBonus, 6);
    writeI16Array(target, 72, record.minMax, 12);
    if (record.spare) writeI16Array(target, 96, record.spare, 8);
    writeI16Array(target, 112, record.conditions, 40);
    writeI16(target, 192, record.maxAge);
    writeI16(target, 194, record.doesNotDie);
    writeI16(target, 196, record.baseMove);
    writeI16(target, 198, record.magRes);
    writeI16(target, 200, record.twoHand);
    writeI16(target, 202, record.missile);
    writeI16Array(target, 204, record.numOfAttacks, 2);
    writeFixedBytes(target, 208, 30, record.canCaste);
    for (let band = 0; band < 5; band += 1) {
      writeI16Array(target, 238 + band * 4, record.ageRange[band] ?? [], 2);
      writeI8Array(target, 258 + band * 15, record.ageChange[band] ?? [], 15);
    }
    target[333] = record.canRegenerate & 0xff;
    writeI16(target, 334, record.defaultIconSet);
    writeI32(target, 336, record.itemTypes[0] ?? 0);
    writeI32(target, 340, record.itemTypes[1] ?? 0);
    writeI16(target, 344, record.descriptors);
    if (record.spacer) writeI16Array(target, 346, record.spacer, 31);
  });
}

export function writeCasteOverrides(records: ScenarioCasteOverride[]) {
  return writeFixedRecords(records, CASTE_RECORD_BYTES, (record, target) => {
    validateCasteStorage(record);
    writeI16Array(target, 0, record.specialAbility[0] ?? [], 14);
    writeI16Array(target, 28, record.specialAbility[1] ?? [], 14);
    writeI16Array(target, 56, record.drvBonus, 8);
    writeI16Array(target, 72, record.attBonus, 6);
    for (let row = 0; row < 4; row += 1) {
      writeI16Array(target, 84 + row * 6, record.spellcasters[row] ?? [], 3);
    }
    writeI16Array(target, 108, record.minMax, 12);
    writeI16Array(target, 132, record.conditions, 40);
    writeI16(target, 212, record.canUseMissile);
    writeI16(target, 214, record.getsMissileBonus);
    writeI16Array(target, 216, record.stamina, 2);
    writeI16Array(target, 220, record.strength, 2);
    writeI16Array(target, 224, record.dodge, 2);
    writeI16Array(target, 228, record.toHit, 2);
    writeI16Array(target, 232, record.missile, 2);
    writeI16Array(target, 236, record.hand2Hand, 2);
    if (record.spare1) writeI16Array(target, 240, record.spare1, 2);
    if (record.spare2) writeI16Array(target, 244, record.spare2, 2);
    writeI16(target, 248, record.casteClass);
    writeI16(target, 250, record.minimumAgeGroup);
    writeI16(target, 252, record.moveBonus);
    writeI16(target, 254, record.magRes);
    writeI16(target, 256, record.twoHand);
    writeI16(target, 258, record.maxStaminaBonus);
    writeI16(target, 260, record.bonusAttacks);
    writeI16(target, 262, record.maxAttacks);
    writeI32Array(target, 264, record.victory, 30);
    writeI16(target, 384, record.startMoney);
    writeI16Array(target, 386, record.startItems, 20);
    writeFixedBytes(target, 426, 10, record.attacks);
    writeI32(target, 436, record.itemTypes[0] ?? 0);
    writeI32(target, 440, record.itemTypes[1] ?? 0);
    writeI16(target, 444, record.defaultIcon);
    writeI16(target, 446, record.maxSpellsAttacks);
    writeI16(target, 448, record.spellsSoFar);
    if (record.spacer) writeI16Array(target, 450, record.spacer, 63);
  });
}

function validateCompatibilityStorage(label: string, id: number, rawBytes: number[] | undefined, recordBytes: number) {
  const length = rawBytes?.length ?? 0;
  if (length !== 0 && length !== recordBytes) {
    throw new Error(`${label} ${id} has invalid compatibility byte storage`);
  }
}

function validateExactLength(label: string, id: number, field: string, actual: number, expected: number) {
  if (actual !== expected) throw new Error(`${label} ${id} must have exactly ${expected} ${field}`);
}

function validateRaceStorage(record: ScenarioRaceOverride) {
  validateCompatibilityStorage("Race override", record.id, record.rawBytes, RACE_RECORD_BYTES);
  for (const [field, values, expected] of [
    ["to-hit adjustments", record.plusMinusToHit, 8],
    ["special abilities", record.specialAbility, 14],
    ["defense bonuses", record.drvBonus, 8],
    ["attack bonuses", record.attBonus, 6],
    ["attribute bounds", record.minMax, 12],
    ["conditions", record.conditions, 40],
    ["attack-count bounds", record.numOfAttacks, 2],
    ["caste permissions", record.canCaste, 30],
    ["age ranges", record.ageRange, 5],
    ["age changes", record.ageChange, 5],
    ["item-type words", record.itemTypes, 2]
  ] as const) {
    validateExactLength("Race override", record.id, field, values.length, expected);
  }
  if (record.ageRange.some((row) => row.length !== 2)) throw new Error(`Race override ${record.id} age ranges must have exactly 2 values`);
  if (record.ageChange.some((row) => row.length !== 15)) throw new Error(`Race override ${record.id} age changes must have exactly 15 values`);
  if (record.spare) validateExactLength("Race override", record.id, "spare words", record.spare.length, 8);
  if (record.spacer) validateExactLength("Race override", record.id, "spacer words", record.spacer.length, 31);
}

function validateCasteStorage(record: ScenarioCasteOverride) {
  validateCompatibilityStorage("Caste override", record.id, record.rawBytes, CASTE_RECORD_BYTES);
  for (const [field, values, expected] of [
    ["special-ability rows", record.specialAbility, 2],
    ["defense bonuses", record.drvBonus, 8],
    ["attack bonuses", record.attBonus, 6],
    ["spellcaster rows", record.spellcasters, 4],
    ["attribute bounds", record.minMax, 12],
    ["conditions", record.conditions, 40],
    ["stamina bounds", record.stamina, 2],
    ["strength bounds", record.strength, 2],
    ["dodge bounds", record.dodge, 2],
    ["to-hit bounds", record.toHit, 2],
    ["missile bounds", record.missile, 2],
    ["hand-to-hand bounds", record.hand2Hand, 2],
    ["victory values", record.victory, 30],
    ["starting items", record.startItems, 20],
    ["bonus attack rounds", record.attacks, 10],
    ["item-type words", record.itemTypes, 2]
  ] as const) {
    validateExactLength("Caste override", record.id, field, values.length, expected);
  }
  if (record.specialAbility.some((row) => row.length !== 14)) throw new Error(`Caste override ${record.id} special-ability rows must have exactly 14 values`);
  if (record.spellcasters.some((row) => row.length !== 3)) throw new Error(`Caste override ${record.id} spellcaster rows must have exactly 3 values`);
  if (record.spare1) validateExactLength("Caste override", record.id, "spare1 words", record.spare1.length, 2);
  if (record.spare2) validateExactLength("Caste override", record.id, "spare2 words", record.spare2.length, 2);
  if (record.spacer) validateExactLength("Caste override", record.id, "spacer words", record.spacer.length, 63);
}

export function writeSimpleEncounters(records: SimpleEncounterRecord[]) {
  return writeFixedRecords(records, SIMPLE_ENCOUNTER_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== SIMPLE_ENCOUNTER_RECORD_BYTES) {
      throw new Error(`Simple encounter ${record.id} has invalid compatibility byte storage`);
    }
    writeEncounterActions(target, record.actions);
    for (let slot = 0; slot < 4; slot += 1) {
      target[96 + slot] = (record.choiceResults[slot] ?? 0) & 0xff;
      encodePascalText(target.subarray(106 + slot * 80, 106 + slot * 80 + 80), record.texts[slot] ?? "");
    }
    target[100] = record.canBackOut ? 1 : 0;
    target[101] = record.maxTimes & 0xff;
    target[102] = record.casteSuccess & 0xff;
    target[103] = 0;
    writeI16(target, 104, record.prompt);
  });
}

export function writeComplexEncounters(records: ComplexEncounterRecord[]) {
  return writeFixedRecords(records, COMPLEX_ENCOUNTER_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== COMPLEX_ENCOUNTER_RECORD_BYTES) {
      throw new Error(`Complex encounter ${record.id} has invalid compatibility byte storage`);
    }
    writeEncounterActions(target, record.actions);
    target[96] = record.actionResult & 0xff;
    target[97] = record.wordResult & 0xff;
    writeI8Array(target, 98, record.groups, 8);
    writeI16Array(target, 106, record.spellIds, 10);
    writeI8Array(target, 126, record.spellResults, 10);
    writeI16Array(target, 136, record.itemIds, 5);
    writeI8Array(target, 146, record.itemResults, 5);
    target[151] = record.canBackOut ? 1 : 0;
    target[152] = record.thief ? 1 : 0;
    target[153] = record.maxTimes & 0xff;
    target[154] = record.casteSuccess & 0xff;
    target[155] = record.thiefSuccess & 0xff;
    target[156] = record.thiefFail & 0xff;
    target[157] = 0;
    writeI16(target, 158, record.prompt);
    for (let slot = 0; slot < 9; slot += 1) {
      encodePascalText(target.subarray(160 + slot * 40, 160 + slot * 40 + 40), record.texts[slot] ?? "");
    }
  });
}

export function writeThiefEncounters(records: ThiefEncounterRecord[]) {
  return writeFixedRecords(records, THIEF_ENCOUNTER_RECORD_BYTES, (record, target) => {
    const rawBytes = record.rawBytes ?? [];
    if (rawBytes.length !== 0 && rawBytes.length !== THIEF_ENCOUNTER_RECORD_BYTES) {
      throw new Error(`Rogue encounter ${record.id} has invalid compatibility byte storage`);
    }
    for (let slot = 0; slot < 10; slot += 1) target[slot] = record.typeFlags[slot] ? 1 : 0;
    writeI8Array(target, 10, record.modifiers, 8);
    writeI8Array(target, 18, record.successCodes, 8);
    writeI8Array(target, 26, record.failureCodes, 8);
    writeI16Array(target, 34, record.successText, 8);
    writeI16Array(target, 50, record.failureText, 8);
    writeI16Array(target, 66, record.successSounds, 8);
    writeI16Array(target, 82, record.failureSounds, 8);
    writeI16(target, 98, record.spell);
    writeI16(target, 100, record.lowDamage);
    writeI16(target, 102, record.highDamage);
    writeI16(target, 104, record.tumblers);
    writeI16Array(target, 106, record.prompts, 3);
    writeI16Array(target, 112, record.promptSounds, 3);
  });
}

export function writeTimedEncounters(records: TimedEncounterRecord[]) {
  return writeFixedRecords(records, TIMED_ENCOUNTER_RECORD_BYTES, (record, target) => {
    writeI16(target, 0, record.day);
    writeI16(target, 2, record.increment);
    writeI16(target, 4, record.percent);
    writeI16(target, 6, record.door);
    writeI16(target, 8, record.requiredLevel);
    writeI16(target, 10, record.requiredRandomRect);
    writeI16(target, 12, record.requiredX);
    writeI16(target, 14, record.requiredY);
    writeI16(target, 16, record.requiredItem);
    writeI16(target, 18, record.requiredQuest);
    writeI16(target, 20, timedLocationKindValue(record.locationKind));
  });
}

function timedLocationKindValue(locationKind: TimedEncounterRecord["locationKind"]) {
  if (locationKind === "land") return 1;
  if (locationKind === "dungeon") return 2;
  return -1;
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

function copyFixedBytes(target: Uint8Array, raw: number[]) {
  target.fill(0);
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

function writeI32Array(target: Uint8Array, offset: number, values: number[], count: number) {
  for (let index = 0; index < count; index += 1) {
    writeI32(target, offset + index * 4, values[index] ?? 0);
  }
}

function writeFixedBytes(target: Uint8Array, offset: number, count: number, values: number[]) {
  target.fill(0, offset, offset + count);
  for (let index = 0; index < count; index += 1) {
    target[offset + index] = (values[index] ?? 0) & 0xff;
  }
}

function normalizedMapRecordMarkers(record: MapRecord): MapMarker[] {
  return Array.from({ length: MAP_RECORD_MARKERS }, (_, slot) => record.markers[slot] ?? { iconId: 0, x: 0, y: 0 });
}

function writeEncounterActions(target: Uint8Array, actions: EncounterActionRow[]) {
  target.fill(0, 0, 96);
  for (const action of actions) {
    if (action.slot < 0 || action.slot >= 32) {
      throw new Error(`Encounter action slot ${action.slot} is out of range`);
    }
    if (action.rawCode < -128 || action.rawCode > 127) {
      throw new Error(`Encounter action slot ${action.slot} CODE ${action.rawCode} is outside byte range`);
    }
    target[action.slot] = action.rawCode & 0xff;
    writeI16(target, 32 + action.slot * 2, action.id);
  }
}

function writeMapstatsRecord(output: Uint8Array, tile: number, record: CustomLandlookMetadata["records"][number]) {
  const start = tile * MAPSTATS_RECORD_BYTES;
  writeI16(output, start, record.sound);
  writeI16(output, start + 2, record.time);
  writeI16(output, start + 4, record.solid);
  writeI16(output, start + 6, record.shore);
  writeI16(output, start + 8, record.needBoat);
  writeI16(output, start + 10, record.isPath);
  writeI16(output, start + 12, record.los);
  writeI16(output, start + 14, record.flyFloat);
  writeI16(output, start + 16, record.forest);
  // Preserve-only words are restored by the compatibility-annex overlay for
  // edited imports. Fresh compilation always emits a neutral value here.
  writeI16(output, start + 18, 0);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      writeI16(output, start + 20 + (row * 3 + col) * 2, record.combatBuild?.[row]?.[col] ?? 0);
    }
  }
  writeI16(output, start + 38, record.clearLandId);
}

function writeDoor(target: Uint8Array, trigger: TriggerRecord) {
  if (trigger.actions.length > 8) {
    throw new Error(`${trigger.id} has more than 8 actions`);
  }
  writeI32(target, 0, trigger.doorid);
  target[4] = (trigger.landid ?? 0) & 0xff;
  target[5] = (trigger.targetX ?? 0) & 0xff;
  target[6] = (trigger.targetY ?? 0) & 0xff;
  target[7] = trigger.percent & 0xff;
  for (const action of trigger.actions) {
    if (action.slot < 0 || action.slot >= 8) {
      throw new Error(`${trigger.id} action slot ${action.slot} is out of range`);
    }
    writeI16(target, 8 + action.slot * 2, action.rawCode);
    writeI16(target, 24 + action.slot * 2, action.id);
  }
}

function ensureDenseIndices(records: Array<{ id?: string; index: number }>, label: string) {
  records.forEach((record, expected) => {
    if (record.index !== expected) {
      throw new Error(`${label} must have dense indices; expected ${expected}, found ${record.index}`);
    }
  });
}

function ensureDenseLevelIndices(records: Array<{ id?: string; levelIndex: number }>, label: string) {
  records.forEach((record, expected) => {
    if (record.levelIndex !== expected) {
      throw new Error(`${label} must have dense indices; expected ${expected}, found ${record.levelIndex}`);
    }
  });
}

function readI16(bytes: ArrayLike<number>, offset: number) {
  const unsigned = ((bytes[offset] & 0xff) << 8) | (bytes[offset + 1] & 0xff);
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function writeI16(target: Uint8Array, offset: number, value: number) {
  const normalized = value < 0 ? value + 0x10000 : value;
  target[offset] = (normalized >> 8) & 0xff;
  target[offset + 1] = normalized & 0xff;
}

function writeI32(target: Uint8Array, offset: number, value: number) {
  const normalized = value < 0 ? value + 0x100000000 : value;
  target[offset] = (normalized >>> 24) & 0xff;
  target[offset + 1] = (normalized >>> 16) & 0xff;
  target[offset + 2] = (normalized >>> 8) & 0xff;
  target[offset + 3] = normalized & 0xff;
}
