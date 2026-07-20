import {
  Action,
  Alignment,
  BattleRecord,
  ComplexEncounterRecord,
  Confidence,
  CustomLandlookMetadata,
  Diagnostic,
  EncounterActionRow,
  ExtraCodeRow,
  LandLayout,
  LevelType,
  MapEntity,
  MapRecord,
  MessageRecord,
  MonsterDescriptionRecord,
  MonsterIconOverride,
  MonsterRecord,
  MonsterSet,
  MonsterSetId,
  OptionLabelRecord,
  Provenance,
  RandomLevel,
  ScenarioItemRecord,
  ScenarioCasteOverride,
  ScenarioRaceOverride,
  ScenarioSpellOverride,
  ShopRecord,
  SimpleEncounterRecord,
  ThiefEncounterRecord,
  TimedEncounterRecord,
  TileAttributeProfile,
  TilesetAsset,
  TreasureRecord,
  TriggerRecord,
  ResourceAsset
} from "../types";
import { browserReferenceAtlasUrl, hasBrowserReferenceAtlas } from "./atlasPaths";
import { parseResourceFork, parseStringListResource, type ResourceEntry } from "./library";
import { inspectResourcePreview } from "./resourcePreview";
import { actionOptionFor, normalizeStepOpcode } from "../realmzActions";
import { referencedMapIconIds } from "../map/renderValues";
import { SHOP_RECORD_BYTES, shopPrefixRecordCount } from "./shopRecords";

export const MAP_SIZE = 90;
export const FIELD_BYTES = MAP_SIZE * MAP_SIZE * 2;
export const DOOR_BYTES = 40;
export const DOORS_PER_LEVEL = 100;
export const DOOR_LEVEL_BYTES = DOOR_BYTES * DOORS_PER_LEVEL;
export const RANDLEVEL_BYTES = 644;
export const EXTRACODE_BYTES = 10;
export const MONSTER_BYTES = 210;
export const MONSTER_DESCRIPTION_BYTES = 256;
export const OPTION_LABEL_BYTES = 25;
export const LAND_LAYOUT_ROWS = 8;
export const LAND_LAYOUT_COLS = 16;
export const LAND_LAYOUT_BYTES = LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS * 2;
export const MAP_RECORD_BYTES = 340;
const MAP_RECORD_MARKERS = 10;
const MAP_RECORD_MARKER_BYTES = 6;
export const ITEM_BYTES = 100;
export const SPELL_BYTES = 30;
export const SPELL_OVERRIDE_RECORDS = 105;
export const RACE_BYTES = 408;
export const CASTE_BYTES = 576;
export const THIEF_ENCOUNTER_BYTES = 118;
export const TIMED_ENCOUNTER_BYTES = 40;
const BROWSER_EAGER_PICTURE_PREVIEW_MAX_BYTES = 128 * 1024;
const BROWSER_EAGER_PICTURE_PREVIEW_MAX_COUNT = 4;
const BROWSER_EAGER_ICON_PREVIEW_MAX_BYTES = 24 * 1024;
const BROWSER_EAGER_SOUND_PREVIEW_MAX_BYTES = 96 * 1024;
const BROWSER_EAGER_SOUND_PREVIEW_MAX_COUNT = 8;
const MONSTER_ICON_PAIR_OFFSET = 308;
const PRIMARY_MAP_NAMES_RESOURCE_ID = -102;
const SECONDARY_MAP_NAMES_RESOURCE_ID = -101;

export const TRACKED_FILES = [
  "Scenario",
  "Global",
  "Data LD",
  "Data DL",
  "Data DD",
  "Data DDD",
  "Data RD",
  "Data RDD",
  "Data ED",
  "Data ED2",
  "Data ED3",
  "Data EDCD",
  "Data MD",
  "Data MD1",
  "Data MD-1",
  "Data DES",
  "Data BD",
  "Data SD",
  "Data SD2",
  "Data OD",
  "Data MD2",
  "Data TD",
  "Data TD2",
  "Data TD3",
  "Data CI",
  "Data RI",
  "Data CS",
  "Data MENU",
  "Data Solids",
  "Data NI",
  "Data Custom 1 BD",
  "Data Custom 2 BD",
  "Data Custom 3 BD",
  "Data Spell",
  "Data Race",
  "Data Caste",
  "Layout"
] as const;

const RECORD_BYTES: Record<string, number> = {
  "Data LD": FIELD_BYTES,
  "Data DL": FIELD_BYTES,
  "Data DD": DOOR_LEVEL_BYTES,
  "Data DDD": DOOR_LEVEL_BYTES,
  "Data RD": RANDLEVEL_BYTES,
  "Data RDD": RANDLEVEL_BYTES,
  "Data ED": 426,
  "Data ED2": 520,
  "Data ED3": DOOR_BYTES,
  "Data EDCD": EXTRACODE_BYTES,
  "Data MD": MONSTER_BYTES,
  "Data MD1": MONSTER_BYTES,
  "Data MD-1": MONSTER_BYTES,
  "Data DES": MONSTER_DESCRIPTION_BYTES,
  "Data BD": 346,
  "Data SD": 3002,
  "Data SD2": 256,
  "Data OD": OPTION_LABEL_BYTES,
  "Data MD2": 340,
  "Data TD": 48,
  "Data TD2": 118,
  "Data TD3": 40,
  "Data CI": 4608,
  "Data RI": 320,
  "Data CS": 316,
  "Global": 60,
  "Data MENU": 502,
  "Data Solids": 1024,
  "Data NI": ITEM_BYTES,
  "Data Spell": SPELL_BYTES,
  "Data Race": RACE_BYTES,
  "Data Caste": CASTE_BYTES,
  "Layout": LAND_LAYOUT_BYTES
};

export type ParsedBrowserScenario = {
  maps: MapEntity[];
  landLayout: LandLayout | null;
  mapRecords: MapRecord[];
  tileAttributes: TileAttributeProfile[];
  customLandlooks: CustomLandlookMetadata[];
  triggers: TriggerRecord[];
  randomLevels: RandomLevel[];
  extracodes: ExtraCodeRow[];
  messages: MessageRecord[];
  optionLabels: OptionLabelRecord[];
  battles: BattleRecord[];
  monsters: MonsterRecord[];
  monsterSets: MonsterSet[];
  monsterDescriptions: MonsterDescriptionRecord[];
  monsterIconOverrides: MonsterIconOverride[];
  scenarioItems: ScenarioItemRecord[];
  treasures: TreasureRecord[];
  shops: ShopRecord[];
  simpleEncounters: SimpleEncounterRecord[];
  complexEncounters: ComplexEncounterRecord[];
  thiefEncounters: ThiefEncounterRecord[];
  timedEncounters: TimedEncounterRecord[];
  spellOverrides: ScenarioSpellOverride[];
  raceOverrides: ScenarioRaceOverride[];
  casteOverrides: ScenarioCasteOverride[];
  assetCatalog: { tilesets: TilesetAsset[]; icons: ResourceAsset[]; sounds: ResourceAsset[] };
  records: { counts: Record<string, number>; alignments: Alignment[] };
  diagnostics: Diagnostic[];
};

export function parseScenarioBuffers(buffers: Map<string, Uint8Array>): ParsedBrowserScenario {
  const records = { counts: {} as Record<string, number>, alignments: [] as Alignment[] };
  const diagnostics: Diagnostic[] = [];
  for (const [name, recordBytes] of Object.entries(RECORD_BYTES)) {
    const alignment = alignmentFor(name, buffers.get(name), recordBytes);
    records.counts[name] = alignment.count;
    records.alignments.push(alignment);
    if (alignment.status === "has-trailing-bytes") {
      diagnostics.push({
        severity: "warning",
        code: "trailing-bytes",
        message: `${name} has ${alignment.trailingBytes} trailing bytes after full records`,
        source: name
      });
    }
  }

  const maps = [
    ...parseFields(buffers.get("Data LD"), "land", "Data LD"),
    ...parseFields(buffers.get("Data DL"), "dungeon", "Data DL")
  ];
  const randomLevels = [
    ...parseRandomLevels(buffers.get("Data RD"), "land", "Data RD"),
    ...parseRandomLevels(buffers.get("Data RDD"), "dungeon", "Data RDD")
  ];
  attachRenderInfo(maps, randomLevels);
  const landLayout = parseLandLayout(buffers.get("Layout"));
  const mapRecords = parseMapRecords(buffers.get("Data MD2"));
  applyMapNameHints(maps, mapRecords, buffers);
  const tileAttributes = [
    ...parseTileAttributes(buffers.get("Data Solids")),
    ...parseLandlookMapstats(buffers.get("Data Custom 1 BD"), 6, "Data Custom 1 BD"),
    ...parseLandlookMapstats(buffers.get("Data Custom 2 BD"), 7, "Data Custom 2 BD"),
    ...parseLandlookMapstats(buffers.get("Data Custom 3 BD"), 8, "Data Custom 3 BD")
  ];
  const customLandlooks = [
    parseCustomLandlookMetadata(buffers.get("Data Custom 1 BD"), 6, "Data Custom 1 BD"),
    parseCustomLandlookMetadata(buffers.get("Data Custom 2 BD"), 7, "Data Custom 2 BD"),
    parseCustomLandlookMetadata(buffers.get("Data Custom 3 BD"), 8, "Data Custom 3 BD")
  ].filter((landlook): landlook is CustomLandlookMetadata => landlook != null);

  const triggers = [
    ...parseDoorFile(buffers.get("Data DD"), "land", "Data DD"),
    ...parseDoorFile(buffers.get("Data DDD"), "dungeon", "Data DDD"),
    ...parseMacroFile(buffers.get("Data ED3"))
  ];
  const extracodes = parseExtracodes(buffers.get("Data EDCD"));
  const messages = parseMessages(buffers.get("Data SD2"));
  const optionLabels = parseOptionLabels(buffers.get("Data OD"));
  const battles = parseBattles(buffers.get("Data BD"));
  const monsters = parseMonsters(buffers.get("Data MD"));
  const monsterSets = [
    parseMonsterSet(buffers.get("Data MD1"), "Data MD1", 1),
    parseMonsterSet(buffers.get("Data MD-1"), "Data MD-1", -1)
  ].filter((set): set is MonsterSet => set != null);
  const monsterDescriptions = parseMonsterDescriptions(buffers.get("Data DES"));
  const scenarioItems = parseScenarioItems(buffers.get("Data NI"));
  const treasures = parseTreasures(buffers.get("Data TD"));
  const shops = parseShops(buffers.get("Data SD"));
  const rawShopCount = Math.floor((buffers.get("Data SD")?.byteLength ?? 0) / SHOP_RECORD_BYTES);
  const preservedShopTailRecords = rawShopCount - shops.length;
  const shopAlignment = records.alignments.find((alignment) => alignment.source === "Data SD");
  if (shopAlignment && preservedShopTailRecords > 0) {
    shopAlignment.count = shops.length;
    records.counts["Data SD"] = shops.length;
    diagnostics.push({
      severity: "info",
      code: "non-shop-data-suffix",
      message: `Data SD has ${preservedShopTailRecords} trailing full record(s) that do not match shop structure; Providence preserves them as non-shop source data.`,
      source: "Data SD"
    });
  }
  const simpleEncounters = parseSimpleEncounters(buffers.get("Data ED"));
  const complexEncounters = parseComplexEncounters(buffers.get("Data ED2"));
  const thiefEncounters = parseThiefEncounters(buffers.get("Data TD2"));
  const timedEncounters = parseTimedEncounters(buffers.get("Data TD3"));
  const spellOverrides = parseSpellOverrides(buffers.get("Data Spell"));
  const raceOverrides = parseRaceOverrides(buffers.get("Data Race"));
  const casteOverrides = parseCasteOverrides(buffers.get("Data Caste"));
  const assetCatalog = buildAssetCatalog(maps, randomLevels, monsters, monsterSets, buffers, diagnostics);
  const monsterIconOverrides = parseScenarioMonsterIconOverrides(monsters, monsterSets, buffers, diagnostics);
  return { maps, landLayout, mapRecords, tileAttributes, customLandlooks, triggers, randomLevels, extracodes, messages, optionLabels, battles, monsters, monsterSets, monsterDescriptions, monsterIconOverrides, scenarioItems, treasures, shops, simpleEncounters, complexEncounters, thiefEncounters, timedEncounters, spellOverrides, raceOverrides, casteOverrides, assetCatalog, records, diagnostics };
}

function parseLandLayout(buffer: Uint8Array | undefined): LandLayout | null {
  if (!buffer || buffer.byteLength < LAND_LAYOUT_BYTES) return null;
  return {
    rows: LAND_LAYOUT_ROWS,
    cols: LAND_LAYOUT_COLS,
    cells: Array.from({ length: LAND_LAYOUT_ROWS * LAND_LAYOUT_COLS }, (_, index) => i16(buffer, index * 2)),
    trailingBytes: Array.from(buffer.slice(LAND_LAYOUT_BYTES)),
    authored: false,
    provenance: {
      sourceFile: "Layout",
      recordIndex: 0,
      byteOffset: 0,
      byteLength: LAND_LAYOUT_BYTES,
      confidence: "confirmed"
    }
  };
}

function parseTileAttributes(buffer: Uint8Array | undefined): TileAttributeProfile[] {
  if (!buffer) return [];
  const count = Math.min(1024, buffer.byteLength);
  return Array.from({ length: count }, (_, tile) => {
    const solidType = buffer[tile] ?? 0;
    return {
      tile,
      landlook: null,
      solidType,
      movementSoundId: null,
      movementCost: null,
      editableScope: "special-tile",
      flags: solidType === 0 ? ["walkable"] : ["solid"],
      confidence: "source-backed",
      sourceKind: "data-solids",
      source: "Data Solids",
      rawByte: solidType
    };
  });
}

const MAPSTATS_RECORD_BYTES = 40;
const MAPSTATS_RECORDS = 201;

export function parseLandlookMapstats(buffer: Uint8Array | undefined, landlook: number, source: string): TileAttributeProfile[] {
  if (!buffer) return [];
  const count = Math.min(MAPSTATS_RECORDS, Math.floor(buffer.byteLength / MAPSTATS_RECORD_BYTES));
  const baseOffset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
  const baseTile = buffer.byteLength >= baseOffset + 2 ? i16(buffer, baseOffset) : null;
  const baseScale = buffer.byteLength >= baseOffset + 4 ? i16(buffer, baseOffset + 2) : null;
  const editableScope = source.toLowerCase().includes("custom") ? "scenario-custom" : "built-in-reference";
  return Array.from({ length: count }, (_, tile) => {
    const start = tile * MAPSTATS_RECORD_BYTES;
    const sound = i16(buffer, start);
    const time = i16(buffer, start + 2);
    const solid = i16(buffer, start + 4);
    const shore = i16(buffer, start + 6) !== 0;
    const needBoat = i16(buffer, start + 8);
    const isPath = i16(buffer, start + 10) !== 0;
    const los = i16(buffer, start + 12) !== 0;
    const flyFloat = i16(buffer, start + 14) !== 0;
    const forest = i16(buffer, start + 16);
    const spare = i16(buffer, start + 18);
    const combatBuild = [
      [i16(buffer, start + 20), i16(buffer, start + 22), i16(buffer, start + 24)],
      [i16(buffer, start + 26), i16(buffer, start + 28), i16(buffer, start + 30)],
      [i16(buffer, start + 32), i16(buffer, start + 34), i16(buffer, start + 36)]
    ];
    const clearLandId = i16(buffer, start + 38);
    const flags: TileAttributeProfile["flags"] = [solid === 0 && needBoat === 0 && !flyFloat ? "walkable" : "solid"];
    if (shore) flags.push("shore");
    if (needBoat !== 0) flags.push("boat-required");
    if (isPath) flags.push("path");
    if (los) flags.push("blocks-los");
    if (flyFloat) flags.push("fly-float-required");
    if (forest !== 0) flags.push("forest");
    if (combatBuild.flat().some((value) => value !== 0)) flags.push("combat-build");
    return {
      tile,
      landlook,
      solidType: solid,
      movementSoundId: sound,
      movementCost: time,
      shore,
      boatRequirement: needBoat,
      pathFlag: isPath,
      blocksLos: los,
      flyFloatRequired: flyFloat,
      forestType: forest,
      spare,
      combatBuild,
      clearLandId,
      baseTile,
      baseScale,
      editableScope,
      flags,
      confidence: "source-backed",
      sourceKind: "mapstats",
      source,
      rawByte: null
    };
  });
}

function parseFields(buffer: Uint8Array | undefined, levelType: LevelType, source: string) {
  if (!buffer) return [];
  const count = Math.floor(buffer.byteLength / FIELD_BYTES);
  const maps: MapEntity[] = [];
  for (let levelIndex = 0; levelIndex < count; levelIndex += 1) {
    const start = levelIndex * FIELD_BYTES;
    const tiles = Array.from({ length: MAP_SIZE * MAP_SIZE }, (_, index) => i16(buffer, start + index * 2));
    maps.push({
      id: `${levelType}:${levelIndex}`,
      levelType,
      source,
      index: levelIndex,
      name: `${title(levelType)} level ${levelIndex}`,
      width: MAP_SIZE,
      height: MAP_SIZE,
      tiles,
      render: { tilesetId: "abstract-fallback", landlook: null, mode: "abstract-fallback" },
      provenance: provenance(source, levelIndex, start, FIELD_BYTES, "source-backed")
    });
  }
  return maps;
}

function parseRandomLevels(buffer: Uint8Array | undefined, levelType: LevelType, source: string) {
  if (!buffer) return [];
  const count = Math.floor(buffer.byteLength / RANDLEVEL_BYTES);
  const levels: RandomLevel[] = [];
  for (let levelIndex = 0; levelIndex < count; levelIndex += 1) {
    const start = levelIndex * RANDLEVEL_BYTES;
    const rects: RandomLevel["rects"] = [];
    for (let rectIndex = 0; rectIndex < 20; rectIndex += 1) {
      const rectStart = start + rectIndex * 8;
      const top = i16(buffer, rectStart);
      const left = i16(buffer, rectStart + 2);
      const bottom = i16(buffer, rectStart + 4);
      const right = i16(buffer, rectStart + 6);
      const percent = i16(buffer, start + 160 + rectIndex * 2);
      const randomDoors = [
        i16(buffer, start + 280 + rectIndex * 6),
        i16(buffer, start + 282 + rectIndex * 6),
        i16(buffer, start + 284 + rectIndex * 6)
      ];
      const active = percent !== 0 || top !== 0 || left !== 0 || bottom !== 0 || right !== 0 || randomDoors.some(Boolean);
      if (active) {
        rects.push({
          rectIndex,
          top,
          left,
          bottom,
          right,
          percent,
          battleRange: [i16(buffer, start + 200 + rectIndex * 4), i16(buffer, start + 202 + rectIndex * 4)],
          randomDoors,
          randomDoorPercent: [
            i16(buffer, start + 400 + rectIndex * 6),
            i16(buffer, start + 402 + rectIndex * 6),
            i16(buffer, start + 404 + rectIndex * 6)
          ],
          only: buffer[start + 523 + rectIndex] !== 0,
          option: signedByte(buffer[start + 543 + rectIndex]),
          sound: i16(buffer, start + 563 + rectIndex * 2),
          text: i16(buffer, start + 603 + rectIndex * 2)
        });
      }
    }
    levels.push({
      id: `${levelType}:${levelIndex}:randlevel`,
      source,
      levelType,
      levelIndex,
      landlook: signedByte(buffer[start + 520]),
      isDark: buffer[start + 521] !== 0,
      useLos: buffer[start + 522] !== 0,
      rects,
      rawValues: Array.from({ length: RANDLEVEL_BYTES / 2 }, (_, offset) => i16(buffer, start + offset * 2)),
      provenance: provenance(source, levelIndex, start, RANDLEVEL_BYTES, "source-backed")
    });
  }
  return levels;
}

function attachRenderInfo(maps: MapEntity[], randomLevels: RandomLevel[]) {
  const lookup = new Map(randomLevels.map((level) => [`${level.levelType}:${level.levelIndex}`, level]));
  for (const map of maps) {
    const level = lookup.get(`${map.levelType}:${map.index}`);
    if (map.levelType === "dungeon") {
      map.render = { tilesetId: "dungeon-top-down-302", landlook: level?.landlook ?? null, mode: "dungeon-top-down" };
    } else if (level) {
      map.render = { tilesetId: `landlook-${level.landlook}`, landlook: level.landlook, mode: "outdoor-landlook" };
    }
  }
}

function parseMapRecords(buffer: Uint8Array | undefined) {
  if (!buffer) return [];
  const count = Math.floor(buffer.byteLength / MAP_RECORD_BYTES);
  const records: MapRecord[] = [];
  for (let id = 0; id < count; id += 1) {
    const start = id * MAP_RECORD_BYTES;
    const rawBytes = Array.from(buffer.slice(start, start + MAP_RECORD_BYTES));
    records.push({
      id,
      markers: Array.from({ length: MAP_RECORD_MARKERS }, (_, slot) => {
        const offset = start + slot * MAP_RECORD_MARKER_BYTES;
        return {
          iconId: i16(buffer, offset),
          x: i16(buffer, offset + 2),
          y: i16(buffer, offset + 4)
        };
      }),
      startX: i16(buffer, start + 60),
      startY: i16(buffer, start + 62),
      level: i16(buffer, start + 64),
      pictId: i16(buffer, start + 66),
      iconSize: i16(buffer, start + 68),
      show: i16(buffer, start + 70),
      isDungeon: i16(buffer, start + 72) !== 0,
      rect: {
        top: i16(buffer, start + 76),
        left: i16(buffer, start + 78),
        bottom: i16(buffer, start + 80),
        right: i16(buffer, start + 82)
      },
      note: decodePascalText(buffer.slice(start + 84, start + MAP_RECORD_BYTES)),
      mapNameAuthored: false,
      rawBytes,
      provenance: provenance("Data MD2", id, start, MAP_RECORD_BYTES, "source-backed")
    });
  }
  return records;
}

function parseDoorFile(buffer: Uint8Array | undefined, levelType: LevelType, source: string) {
  if (!buffer) return [];
  const levels = Math.floor(buffer.byteLength / DOOR_LEVEL_BYTES);
  const triggers: TriggerRecord[] = [];
  for (let levelIndex = 0; levelIndex < levels; levelIndex += 1) {
    for (let recordIndex = 0; recordIndex < DOORS_PER_LEVEL; recordIndex += 1) {
      const start = levelIndex * DOOR_LEVEL_BYTES + recordIndex * DOOR_BYTES;
      triggers.push(parseDoor(buffer.subarray(start, start + DOOR_BYTES), source, levelType, levelIndex, recordIndex, start));
    }
  }
  return triggers;
}

function parseMacroFile(buffer: Uint8Array | undefined) {
  if (!buffer) return [];
  const count = Math.floor(buffer.byteLength / DOOR_BYTES);
  return Array.from({ length: count }, (_, recordIndex) => {
    const start = recordIndex * DOOR_BYTES;
    return parseDoor(buffer.subarray(start, start + DOOR_BYTES), "Data ED3", null, null, recordIndex, start);
  });
}

function parseDoor(
  buffer: Uint8Array,
  source: string,
  levelType: LevelType | null,
  levelIndex: number | null,
  recordIndex: number,
  byteOffset: number
) {
  const doorid = i32(buffer, 0);
  const coordinate = source === "Data ED3" ? null : decodeDoorCoordinate(doorid, levelIndex);
  const percent = signedByte(buffer[7]);
  const actions: Action[] = [];
  for (let slot = 0; slot < 8; slot += 1) {
    const rawCode = i16(buffer, 8 + slot * 2);
    const id = i16(buffer, 24 + slot * 2);
    if (rawCode !== 0 || id !== 0) actions.push(describeAction(slot, rawCode, id));
  }
  const active = source === "Data ED3"
    ? actions.length > 0
    : Boolean(coordinate && percent >= 1 && (actions.length > 0 || doorid !== 0));
  return {
    id: `${source}:${levelIndex ?? "macro"}:${recordIndex}`,
    source,
    levelType,
    levelIndex,
    recordIndex,
    active,
    doorid,
    landid: buffer[4],
    targetX: buffer[5],
    targetY: buffer[6],
    percent,
    coordinate,
    actions,
    provenance: provenance(source, recordIndex, byteOffset, DOOR_BYTES, "source-backed")
  };
}

function parseExtracodes(buffer: Uint8Array | undefined) {
  if (!buffer) return [];
  const count = Math.floor(buffer.byteLength / EXTRACODE_BYTES);
  return Array.from({ length: count }, (_, id) => {
    const start = id * EXTRACODE_BYTES;
    return {
      id,
      values: [i16(buffer, start), i16(buffer, start + 2), i16(buffer, start + 4), i16(buffer, start + 6), i16(buffer, start + 8)],
      provenance: provenance("Data EDCD", id, start, EXTRACODE_BYTES, "source-backed")
    };
  });
}

function parseMessages(buffer: Uint8Array | undefined): MessageRecord[] {
  return fixedRecords(buffer, 256, "Data SD2", (id, start, record) => ({
    id,
    text: decodePascalText(record),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data SD2", id, start, 256, "source-backed")
  }));
}

function parseOptionLabels(buffer: Uint8Array | undefined): OptionLabelRecord[] {
  return fixedRecords(buffer, OPTION_LABEL_BYTES, "Data OD", (id, start, record) => ({
    id,
    text: decodePascalText(record),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data OD", id, start, OPTION_LABEL_BYTES, "source-backed")
  }));
}

function parseBattles(buffer: Uint8Array | undefined): BattleRecord[] {
  return fixedRecords(buffer, 346, "Data BD", (id, start, record) => ({
    id,
    grid: Array.from({ length: 13 * 13 }, (_, slot) => i16(record, slot * 2)),
    dist: signedByte(record[338]),
    messageBefore: i16(record, 340),
    messageAfter: i16(record, 342),
    battleMacro: i16(record, 344),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data BD", id, start, 346, "source-backed")
  }));
}

function parseMonsterDescriptions(buffer: Uint8Array | undefined): MonsterDescriptionRecord[] {
  return fixedRecords(buffer, MONSTER_DESCRIPTION_BYTES, "Data DES", (id, start, record) => ({
    id,
    text: decodePascalText(record),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data DES", id, start, MONSTER_DESCRIPTION_BYTES, "source-backed")
  }));
}

function parseMonsterSet(buffer: Uint8Array | undefined, sourceFile: string, setId: MonsterSetId): MonsterSet | null {
  if (!buffer) return null;
  return { sourceFile, setId, monsters: parseMonsters(buffer, sourceFile) };
}

function parseMonsters(buffer: Uint8Array | undefined, source = "Data MD"): MonsterRecord[] {
  return fixedRecords(buffer, MONSTER_BYTES, source, (id, start, record) => ({
    id,
    hitDice: record[0] ?? 0,
    staminaBonus: record[1] ?? 0,
    agility: record[2] ?? 0,
    nameId: record[3] ?? 0,
    movementMax: record[4] ?? 0,
    armor: signedByte(record[5] ?? 0),
    magicResistance: signedByte(record[6] ?? 0),
    distance: signedByte(record[7] ?? 0),
    traitor: signedByte(record[8] ?? 0),
    size: signedByte(record[9] ?? 0),
    typeFlags: Array.from(record.slice(10, 18), signedByte),
    attackCount: signedByte(record[18] ?? 0),
    magicAttackCount: signedByte(record[19] ?? 0),
    attacks: Array.from({ length: 5 }, (_, row) => Array.from(record.slice(20 + row * 4, 24 + row * 4), signedByte)),
    damageBonus: signedByte(record[40] ?? 0),
    castPercent: signedByte(record[41] ?? 0),
    runPercent: signedByte(record[42] ?? 0),
    surrenderPercent: signedByte(record[43] ?? 0),
    missilePercent: signedByte(record[44] ?? 0),
    canSummon: signedByte(record[45] ?? 0),
    saves: Array.from(record.slice(46, 52), signedByte),
    spellImmunities: Array.from(record.slice(52, 58), signedByte),
    money: readI16s(record, 58, 3),
    spells: readI16s(record, 64, 10),
    items: readI16s(record, 84, 6),
    weapon: i16(record, 96),
    iconId: i16(record, 98),
    spellPoints: i16(record, 100),
    exp: i16(record, 102),
    stamina: i16(record, 104),
    staminaMax: i16(record, 106),
    underneath: readI16s(record, 108, 4),
    target: signedByte(record[116] ?? 0),
    guarding: signedByte(record[117] ?? 0),
    notOnMenu: (record[118] ?? 0) !== 0,
    beenAttacked: signedByte(record[119] ?? 0),
    movement: signedByte(record[120] ?? 0),
    magicToHit: signedByte(record[121] ?? 0),
    conditions: Array.from(record.slice(122, 162), signedByte),
    lr: signedByte(record[162] ?? 0),
    up: signedByte(record[163] ?? 0),
    attackNum: signedByte(record[164] ?? 0),
    bonusAttack: signedByte(record[165] ?? 0),
    deathMacro: i16(record, 166),
    maxSpellPoints: i16(record, 168),
    displayName: decodeFixedText(record.slice(170, 210)) || `Monster ${id}`,
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance(source, id, start, MONSTER_BYTES, "source-backed")
  }));
}

function parseTreasures(buffer: Uint8Array | undefined): TreasureRecord[] {
  return fixedRecords(buffer, 48, "Data TD", (id, start, record) => ({
    id,
    itemIds: Array.from({ length: 20 }, (_, slot) => i16(record, slot * 2)),
    exp: i16(record, 40),
    gold: i16(record, 42),
    gems: i16(record, 44),
    jewelry: i16(record, 46),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data TD", id, start, 48, "source-backed")
  }));
}

function parseShops(buffer: Uint8Array | undefined): ShopRecord[] {
  const prefixBytes = shopPrefixRecordCount(buffer) * SHOP_RECORD_BYTES;
  return fixedRecords(buffer?.subarray(0, prefixBytes), SHOP_RECORD_BYTES, "Data SD", (id, start, record) => ({
    id,
    itemIds: Array.from({ length: 1000 }, (_, slot) => i16(record, slot * 2)),
    quantities: Array.from(record.subarray(2000, 3000)),
    inflation: i16(record, 3000),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data SD", id, start, SHOP_RECORD_BYTES, "source-backed")
  }));
}

const CUSTOM_LANDLOOK_METADATA_BYTES = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4 + 60;
const LANDLOOK_RANGE_SLOTS = 10;
const LANDLOOK_RANGE_SLOT_BYTES = 6;

export function parseCustomLandlookMetadata(
  buffer: Uint8Array | undefined,
  landlook: number,
  sourceFile: string
): CustomLandlookMetadata | null {
  if (!buffer) return null;
  const records = Array.from({ length: MAPSTATS_RECORDS }, (_, tile) => {
    const start = tile * MAPSTATS_RECORD_BYTES;
    if (buffer.byteLength < start + MAPSTATS_RECORD_BYTES) return emptyMapstatsRecord(tile);
    return {
      tile,
      sound: i16(buffer, start),
      time: i16(buffer, start + 2),
      solid: i16(buffer, start + 4),
      shore: i16(buffer, start + 6),
      needBoat: i16(buffer, start + 8),
      isPath: i16(buffer, start + 10),
      los: i16(buffer, start + 12),
      flyFloat: i16(buffer, start + 14),
      forest: i16(buffer, start + 16),
      spare: i16(buffer, start + 18),
      combatBuild: [
        [i16(buffer, start + 20), i16(buffer, start + 22), i16(buffer, start + 24)],
        [i16(buffer, start + 26), i16(buffer, start + 28), i16(buffer, start + 30)],
        [i16(buffer, start + 32), i16(buffer, start + 34), i16(buffer, start + 36)]
      ],
      clearLandId: i16(buffer, start + 38)
    };
  });
  const baseOffset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
  const rangeOffset = baseOffset + 4;
  return {
    landlook,
    sourceFile,
    records,
    baseTile: buffer.byteLength >= baseOffset + 2 ? i16(buffer, baseOffset) : 0,
    baseScale: buffer.byteLength >= baseOffset + 4 ? i16(buffer, baseOffset + 2) : 0,
    rangeSlots: Array.from({ length: LANDLOOK_RANGE_SLOTS }, (_, slot) => {
      const start = rangeOffset + slot * LANDLOOK_RANGE_SLOT_BYTES;
      return {
        slot,
        label: landlookRangeLabel(slot),
        firstTile: buffer.byteLength >= start + 2 ? i16(buffer, start) : 0,
        lastTile: buffer.byteLength >= start + 4 ? i16(buffer, start + 2) : 0,
        ...(buffer.byteLength >= start + 6 ? { reserved: i16(buffer, start + 4) } : {})
      };
    }),
    trailingBytes: Array.from(buffer.slice(CUSTOM_LANDLOOK_METADATA_BYTES)),
    rawBytes: Array.from(buffer),
    writerGate: customLandlookWriterGate(),
    authored: false
  };
}

function emptyMapstatsRecord(tile: number): CustomLandlookMetadata["records"][number] {
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
    combatBuild: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
    clearLandId: 0
  };
}

function landlookRangeLabel(slot: number) {
  return ["Mountain range", "Open range", "Rubble range", "House range"][slot] ?? "Reserved range";
}

function customLandlookWriterGate(): CustomLandlookMetadata["writerGate"] {
  return {
    metadataWriterStatus: "writer-safe-fixture-gated",
    atlasWriterStatus: "writable-by-generated-pict-replacement",
    writableFields: ["sound", "time", "solid", "shore", "needBoat", "isPath", "los", "flyFloat", "forest", "clearLandId", "combatBuild", "baseTile", "baseScale", "rangeSlot.firstTile", "rangeSlot.lastTile"],
    preserveOnlyFields: ["spare", "rangeSlot.reserved"],
    evidence: ["docs/format-evidence-cards/custom-landlook-writers.md", "docs/generated/custom-landlook-coverage.json"]
  };
}

function parseScenarioItems(buffer: Uint8Array | undefined): ScenarioItemRecord[] {
  return fixedRecords(buffer, ITEM_BYTES, "Data NI", (id, start, record) => {
    const storedItemId = i16(record, 2);
    return {
      id,
      itemId: storedItemId !== 0 ? storedItemId : 800 + id,
      iconId: i16(record, 4),
      type: i16(record, 6),
      st: i16(record, 0),
      blunt: i16(record, 8),
      hands: i16(record, 10),
      lu: i16(record, 12),
      movement: i16(record, 14),
      ac: i16(record, 16),
      magicResistance: i16(record, 18),
      damage: i16(record, 20),
      spellPoints: i16(record, 22),
      sound: i16(record, 24),
      weight: i16(record, 26),
      cost: i16(record, 28),
      charge: i16(record, 30),
      cursedItemId: i16(record, 32),
      magical: i16(record, 34),
      itemCat0: i32(record, 36),
      itemCat1: i32(record, 40),
      raceRestrictions: i16(record, 44),
      casteRestrictions: i16(record, 46),
      specificRace: i16(record, 48),
      specificCaste: i16(record, 50),
      raceClassOnly: i16(record, 52),
      casteClassOnly: i16(record, 54),
      spare2: Array.from({ length: 7 }, (_, index) => i16(record, 56 + index * 2)),
      vSmall: i16(record, 70),
      vLarge: i16(record, 72),
      heat: i16(record, 74),
      cold: i16(record, 76),
      electric: i16(record, 78),
      vsUndead: i16(record, 80),
      vsDemonDevil: i16(record, 82),
      vsEvil: i16(record, 84),
      special1: i16(record, 86),
      special2: i16(record, 88),
      special3: i16(record, 90),
      special4: i16(record, 92),
      special5: i16(record, 94),
      weightPerCharge: i16(record, 96),
      dropOnEmpty: i16(record, 98),
      rawBytes: Array.from(record),
      authored: false,
      provenance: provenance("Data NI", id, start, ITEM_BYTES, "source-backed")
    };
  });
}

function parseSimpleEncounters(buffer: Uint8Array | undefined): SimpleEncounterRecord[] {
  return fixedRecords(buffer, 426, "Data ED", (id, start, record) => ({
    id,
    actions: parseEncounterActions(record),
    choiceResults: Array.from(record.subarray(96, 100)),
    canBackOut: record[100] !== 0,
    maxTimes: signedByte(record[101]),
    casteSuccess: signedByte(record[102]),
    prompt: i16(record, 104),
    texts: Array.from({ length: 4 }, (_, slot) => decodePascalText(record.subarray(106 + slot * 80, 106 + slot * 80 + 80))),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data ED", id, start, 426, "source-backed")
  }));
}

function parseComplexEncounters(buffer: Uint8Array | undefined): ComplexEncounterRecord[] {
  return fixedRecords(buffer, 520, "Data ED2", (id, start, record) => ({
    id,
    actions: parseEncounterActions(record),
    actionResult: signedByte(record[96]),
    wordResult: signedByte(record[97]),
    groups: Array.from(record.subarray(98, 106), signedByte),
    spellIds: readI16s(record, 106, 10),
    spellResults: Array.from(record.subarray(126, 136), signedByte),
    itemIds: readI16s(record, 136, 5),
    itemResults: Array.from(record.subarray(146, 151), signedByte),
    canBackOut: record[151] !== 0,
    thief: record[152] !== 0,
    maxTimes: signedByte(record[153]),
    casteSuccess: signedByte(record[154]),
    thiefSuccess: signedByte(record[155]),
    thiefFail: signedByte(record[156]),
    prompt: i16(record, 158),
    texts: Array.from({ length: 9 }, (_, slot) => decodePascalText(record.subarray(160 + slot * 40, 160 + slot * 40 + 40))),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data ED2", id, start, 520, "source-backed")
  }));
}

function parseTimedEncounters(buffer: Uint8Array | undefined): TimedEncounterRecord[] {
  return fixedRecords(buffer, TIMED_ENCOUNTER_BYTES, "Data TD3", (id, start, record) => {
    return {
      id,
      day: i16(record, 0),
      increment: i16(record, 2),
      percent: i16(record, 4),
      door: i16(record, 6),
      requiredLevel: i16(record, 8),
      requiredRandomRect: i16(record, 10),
      requiredX: i16(record, 12),
      requiredY: i16(record, 14),
      requiredItem: i16(record, 16),
      requiredQuest: i16(record, 18),
      locationKind: timedLocationKind(i16(record, 20)),
      authored: false,
      provenance: provenance("Data TD3", id, start, TIMED_ENCOUNTER_BYTES, "source-backed")
    };
  });
}

function parseThiefEncounters(buffer: Uint8Array | undefined): ThiefEncounterRecord[] {
  return fixedRecords(buffer, THIEF_ENCOUNTER_BYTES, "Data TD2", (id, start, record) => ({
    id,
    typeFlags: Array.from(record.slice(0, 10), (value) => value !== 0),
    modifiers: Array.from(record.slice(10, 18), signedByte),
    successCodes: Array.from(record.slice(18, 26), signedByte),
    failureCodes: Array.from(record.slice(26, 34), signedByte),
    successText: readI16s(record, 34, 8),
    failureText: readI16s(record, 50, 8),
    successSounds: readI16s(record, 66, 8),
    failureSounds: readI16s(record, 82, 8),
    spell: i16(record, 98),
    lowDamage: i16(record, 100),
    highDamage: i16(record, 102),
    tumblers: i16(record, 104),
    prompts: readI16s(record, 106, 3),
    promptSounds: readI16s(record, 112, 3),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data TD2", id, start, THIEF_ENCOUNTER_BYTES, "source-backed")
  }));
}

function timedLocationKind(value: number): TimedEncounterRecord["locationKind"] {
  if (value === 1) return "land";
  if (value === 2) return "dungeon";
  return "any";
}

function parseSpellOverrides(buffer: Uint8Array | undefined): ScenarioSpellOverride[] {
  if (!buffer) return [];
  const count = Math.min(Math.floor(buffer.byteLength / SPELL_BYTES), SPELL_OVERRIDE_RECORDS);
  return Array.from({ length: count }, (_, id) => {
    const start = id * SPELL_BYTES;
    const record = buffer.slice(start, start + SPELL_BYTES);
    return {
      id,
      range1: record[0],
      range2: record[1],
      queueIcon: record[2],
      toHitBonus: signedByte(record[3]),
      saveBonus: signedByte(record[4]),
      fixedTargetNum: record[5],
      canRotate: record[6],
      saveAdjust: signedByte(record[7]),
      cannot: record[8],
      resistAdjust: signedByte(record[9]),
      cost: record[10],
      damage1: record[11],
      damage2: record[12],
      powerDamage1: record[13],
      powerDamage2: record[14],
      duration1: record[15],
      duration2: record[16],
      powerDuration1: record[17],
      powerDuration2: record[18],
      spellLook1: record[19],
      spellLook2: record[20],
      sound1: record[21],
      sound2: record[22],
      targetType: record[23],
      size: record[24],
      special: record[25],
      damageType: record[26],
      spellClass: record[27],
      inCombat: record[28] !== 0,
      inCamp: record[29] !== 0,
      displayName: `Custom Spell ${id}`,
      description: "",
      rawBytes: Array.from(record),
      authored: false,
      provenance: provenance("Data Spell", id, start, SPELL_BYTES, "source-backed")
    };
  });
}

function parseRaceOverrides(buffer: Uint8Array | undefined): ScenarioRaceOverride[] {
  if (!buffer) return [];
  const count = Math.floor(buffer.byteLength / RACE_BYTES);
  return Array.from({ length: count }, (_, id) => {
    const start = id * RACE_BYTES;
    const record = buffer.slice(start, start + RACE_BYTES);
    return {
      id,
      displayName: `Race ${id}`,
      plusMinusToHit: readI16s(record, 0, 8),
      specialAbility: readI16s(record, 16, 14),
      drvBonus: readI16s(record, 44, 8),
      attBonus: readI16s(record, 60, 6),
      minMax: readI16s(record, 72, 12),
      spare: readI16s(record, 96, 8),
      conditions: readI16s(record, 112, 40),
      maxAge: i16(record, 192),
      doesNotDie: i16(record, 194),
      baseMove: i16(record, 196),
      magRes: i16(record, 198),
      twoHand: i16(record, 200),
      missile: i16(record, 202),
      numOfAttacks: readI16s(record, 204, 2),
      canCaste: Array.from(record.slice(208, 238)),
      ageRange: Array.from({ length: 5 }, (_, band) => readI16s(record, 238 + band * 4, 2)),
      ageChange: Array.from({ length: 5 }, (_, band) => Array.from(record.slice(258 + band * 15, 258 + (band + 1) * 15)).map(signedByte)),
      canRegenerate: record[333],
      defaultIconSet: i16(record, 334),
      itemTypes: [i32(record, 336), i32(record, 340)],
      descriptors: i16(record, 344),
      spacer: readI16s(record, 346, 31),
      rawBytes: Array.from(record),
      authored: false,
      provenance: provenance("Data Race", id, start, RACE_BYTES, "source-backed")
    };
  });
}

function parseCasteOverrides(buffer: Uint8Array | undefined): ScenarioCasteOverride[] {
  if (!buffer) return [];
  const count = Math.floor(buffer.byteLength / CASTE_BYTES);
  return Array.from({ length: count }, (_, id) => {
    const start = id * CASTE_BYTES;
    const record = buffer.slice(start, start + CASTE_BYTES);
    return {
      id,
      displayName: `Caste ${id}`,
      specialAbility: [readI16s(record, 0, 14), readI16s(record, 28, 14)],
      drvBonus: readI16s(record, 56, 8),
      attBonus: readI16s(record, 72, 6),
      spellcasters: Array.from({ length: 4 }, (_, row) => readI16s(record, 84 + row * 6, 3)),
      minMax: readI16s(record, 108, 12),
      conditions: readI16s(record, 132, 40),
      canUseMissile: i16(record, 212),
      getsMissileBonus: i16(record, 214),
      stamina: readI16s(record, 216, 2),
      strength: readI16s(record, 220, 2),
      dodge: readI16s(record, 224, 2),
      toHit: readI16s(record, 228, 2),
      missile: readI16s(record, 232, 2),
      hand2Hand: readI16s(record, 236, 2),
      spare1: readI16s(record, 240, 2),
      spare2: readI16s(record, 244, 2),
      casteClass: i16(record, 248),
      minimumAgeGroup: i16(record, 250),
      moveBonus: i16(record, 252),
      magRes: i16(record, 254),
      twoHand: i16(record, 256),
      maxStaminaBonus: i16(record, 258),
      bonusAttacks: i16(record, 260),
      maxAttacks: i16(record, 262),
      victory: readI32s(record, 264, 30),
      startMoney: i16(record, 384),
      startItems: readI16s(record, 386, 20),
      attacks: Array.from(record.slice(426, 436)),
      itemTypes: [i32(record, 436), i32(record, 440)],
      defaultIcon: i16(record, 444),
      maxSpellsAttacks: i16(record, 446),
      spellsSoFar: i16(record, 448),
      spacer: readI16s(record, 450, 63),
      rawBytes: Array.from(record),
      authored: false,
      provenance: provenance("Data Caste", id, start, CASTE_BYTES, "source-backed")
    };
  });
}

function fixedRecords<T>(
  buffer: Uint8Array | undefined,
  recordBytes: number,
  source: string,
  parser: (id: number, start: number, record: Uint8Array) => T
) {
  if (!buffer) return [];
  return Array.from({ length: Math.floor(buffer.byteLength / recordBytes) }, (_, id) => {
    const start = id * recordBytes;
    return parser(id, start, buffer.subarray(start, start + recordBytes));
  });
}

function parseEncounterActions(record: Uint8Array): EncounterActionRow[] {
  const rows: EncounterActionRow[] = [];
  for (let slot = 0; slot < 32; slot += 1) {
    const rawCode = signedByte(record[slot]);
    const id = i16(record, 32 + slot * 2);
    if (rawCode !== 0 || id !== 0) rows.push({ slot, rawCode, id });
  }
  return rows;
}

function decodePascalText(bytes: Uint8Array) {
  const length = Math.min(bytes[0] ?? 0, Math.max(0, bytes.length - 1));
  return decodeFixedText(bytes.subarray(1, 1 + length));
}

function decodeFixedText(bytes: Uint8Array) {
  const end = bytes.findIndex((byte) => byte === 0);
  return Array.from(bytes.subarray(0, end < 0 ? bytes.length : end))
    .map((byte) => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : " ")
    .join("")
    .trimEnd();
}

function buildAssetCatalog(
  maps: MapEntity[],
  randomLevels: RandomLevel[],
  monsters: MonsterRecord[],
  monsterSets: MonsterSet[],
  buffers: Map<string, Uint8Array>,
  diagnostics: Diagnostic[]
) {
  const landlooks = [...new Set(randomLevels.map((level) => level.landlook).filter((landlook) => landlook >= 0))].sort((a, b) => a - b);
  const scenarioResources = scenarioResourceEntries(buffers);
  const tilesets = landlooks.map((landlook): TilesetAsset => {
    const pictId = landlookPictId(landlook);
    const customPreview = landlook >= 6 && landlook <= 8 && pictId !== null
      ? customAtlasPreview(scenarioResources, pictId, landlook, diagnostics)
      : null;
    const referenceAvailable = hasBrowserReferenceAtlas(pictId);
    const imagePath = customPreview?.imagePath ?? null;
    const hasAtlas = customPreview?.available ?? referenceAvailable;
    return {
      id: `landlook-${landlook}`,
      landlook,
      name: landlookName(landlook),
      source: customPreview?.source ?? (referenceAvailable
        ? "Browser import: bundled Realmz reference PICT"
        : "Browser import: custom or missing reference atlas"),
      available: hasAtlas,
      imagePath,
      pictId,
      tileWidth: 32,
      tileHeight: 32,
      columns: 20,
      rows: 10,
      baseTile: landlookBaseTile(landlook, buffers),
      custom: landlook >= 6 && landlook <= 8
    };
  });
  if (maps.some((map) => map.levelType === "dungeon")) {
    tilesets.push({
      id: "dungeon-top-down-302",
      landlook: 2,
      name: "Dungeon Top Down",
      source: "Browser import: bundled Realmz reference PICT",
      available: hasBrowserReferenceAtlas(302),
      imagePath: null,
      pictId: 302,
      tileWidth: 16,
      tileHeight: 16,
      columns: 4,
      rows: 4,
      baseTile: null,
      custom: false
    });
  }
  return {
    tilesets,
    pictures: buildScenarioPictureCatalog(scenarioResources, diagnostics),
    icons: buildScenarioIconCatalog(maps, monsters, monsterSets, scenarioResources, diagnostics),
    sounds: buildScenarioSoundCatalog(scenarioResources, diagnostics)
  };
}

function buildScenarioPictureCatalog(
  resources: Array<{ source: string; resource: ResourceEntry }>,
  diagnostics: Diagnostic[]
): ResourceAsset[] {
  const seen = new Set<number>();
  const pictures: ResourceAsset[] = [];
  let previewCount = 0;
  for (const match of resources) {
    const { source, resource } = match;
    if (resource.resourceType !== "PICT" || seen.has(resource.id)) continue;
    let previewPath: string | null = null;
    if (resource.data.byteLength <= BROWSER_EAGER_PICTURE_PREVIEW_MAX_BYTES && previewCount < BROWSER_EAGER_PICTURE_PREVIEW_MAX_COUNT) {
      const preview = inspectResourcePreview("PICT", resource.data);
      if (preview.status !== "preview-ready" || !preview.dataUrl) {
        const detail = preview.diagnostics[0]?.message ?? `Preview status was ${preview.status}.`;
        diagnostics.push({
          severity: preview.status === "malformed" ? "error" : "warning",
          code: "unsupported-scenario-picture-preview",
          message: `Scenario PICT ${resource.id} in ${source} could not be decoded for preview: ${detail}`,
          source
        });
      }
      previewPath = preview.status === "preview-ready" ? preview.dataUrl : null;
      if (previewPath) previewCount += 1;
    }
    pictures.push({
      id: `scenario-pict-${resource.id}`,
      resourceType: "PICT",
      resourceId: resource.id,
      name: resource.name || null,
      source: `Browser import: ${source} PICT ${resource.id}`,
      previewPath
    });
    seen.add(resource.id);
  }
  return pictures.sort((a, b) => a.resourceId - b.resourceId);
}

function buildScenarioIconCatalog(
  maps: MapEntity[],
  monsters: MonsterRecord[],
  monsterSets: MonsterSet[],
  resources: Array<{ source: string; resource: ResourceEntry }>,
  diagnostics: Diagnostic[]
): ResourceAsset[] {
  const referenced = new Set([
    ...maps.flatMap((map) => referencedMapIconIds(map.tiles)),
    ...monsterIconIds(monsters),
    ...monsterSets.flatMap((set) => monsterIconIds(set.monsters))
  ]);
  if (referenced.size === 0) return [];
  const seen = new Set<number>();
  const icons: ResourceAsset[] = [];
  for (const match of resources) {
    const { source, resource } = match;
    if (resource.resourceType !== "cicn" || !referenced.has(resource.id) || seen.has(resource.id)) continue;
    let previewPath: string | null = null;
    if (resource.data.byteLength <= BROWSER_EAGER_ICON_PREVIEW_MAX_BYTES) {
      const preview = inspectResourcePreview("cicn", resource.data);
      if (preview.status !== "preview-ready" || !preview.dataUrl) {
        const detail = preview.diagnostics[0]?.message ?? `Preview status was ${preview.status}.`;
        diagnostics.push({
          severity: preview.status === "malformed" ? "error" : "warning",
          code: "unsupported-scenario-icon-preview",
          message: `Scenario cicn ${resource.id} in ${source} could not be decoded as an icon preview: ${detail}`,
          source
        });
      }
      previewPath = preview.status === "preview-ready" ? preview.dataUrl : null;
    }
    icons.push({
      id: `scenario-cicn-${resource.id}`,
      resourceType: "cicn",
      resourceId: resource.id,
      name: resource.name || null,
      source: `Browser import: ${source} cicn ${resource.id}`,
      previewPath
    });
    seen.add(resource.id);
  }
  return icons.sort((a, b) => a.resourceId - b.resourceId);
}

type BrowserMapNameHint = {
  id: number;
  name: string;
  primaryName: string;
  secondaryName: string;
  source: string;
};

function applyMapNameHints(maps: MapEntity[], mapRecords: MapRecord[], buffers: Map<string, Uint8Array>) {
  const names = resourceMapNames(buffers);
  if (names.size === 0) return;
  for (const record of mapRecords) {
    const hint = names.get(record.id);
    if (!hint || !hint.name) continue;
    record.name = hint.name;
    record.primaryName = hint.primaryName || undefined;
    record.secondaryName = hint.secondaryName || undefined;
    record.nameSource = hint.source;
  }
}

function resourceMapNames(buffers: Map<string, Uint8Array>) {
  const primary: string[] = [];
  const secondary: string[] = [];
  const sources = new Set<string>();
  for (const { source, resource } of scenarioResourceEntries(buffers)) {
    if (resource.resourceType !== "STR#" || resource.name !== "Map Names") continue;
    if (resource.id === PRIMARY_MAP_NAMES_RESOURCE_ID) {
      primary.splice(0, primary.length, ...parseStringListResource(resource.data));
      sources.add(`${source}:STR# ${resource.id}`);
    } else if (resource.id === SECONDARY_MAP_NAMES_RESOURCE_ID) {
      secondary.splice(0, secondary.length, ...parseStringListResource(resource.data));
      sources.add(`${source}:STR# ${resource.id}`);
    }
  }
  const names = new Map<number, BrowserMapNameHint>();
  const count = Math.max(primary.length, secondary.length);
  for (let id = 0; id < count; id += 1) {
    const primaryName = cleanResourceMapName(primary[id] ?? "");
    const secondaryName = cleanResourceMapName(secondary[id] ?? "");
    const name = primaryName || secondaryName;
    if (!name && !primaryName && !secondaryName) continue;
    names.set(id, {
      id,
      name,
      primaryName,
      secondaryName,
      source: Array.from(sources).join(", ")
    });
  }
  return names;
}

function cleanResourceMapName(value: string) {
  const trimmed = value.trim();
  return trimmed && Array.from(trimmed).every((ch) => ch === "-") ? "" : trimmed;
}

function parseScenarioMonsterIconOverrides(
  monsters: MonsterRecord[],
  monsterSets: MonsterSet[],
  buffers: Map<string, Uint8Array>,
  diagnostics: Diagnostic[]
): MonsterIconOverride[] {
  const referenced = [
    ...monsterIconIds(monsters).map(Math.abs),
    ...monsterSets.flatMap((set) => monsterIconIds(set.monsters).map(Math.abs))
  ];
  return scenarioMonsterIconOverridesFromResources(referenced, scenarioResourceEntries(buffers), diagnostics);
}

export function scenarioMonsterIconOverridesFromResources(
  referencedIconIds: number[],
  resources: Array<{ source: string; resource: Pick<ResourceEntry, "resourceType" | "id" | "data"> }>,
  diagnostics: Diagnostic[]
): MonsterIconOverride[] {
  const referenced = new Set(referencedIconIds.map((id) => Math.abs(id)).filter((id) => id > 0));
  if (referenced.size === 0) return [];
  const resourcesById = new Map<number, Pick<ResourceEntry, "resourceType" | "id" | "data">>();
  for (const match of resources) {
    const { resource } = match;
    if (resource.resourceType !== "cicn") continue;
    const id = Math.abs(resource.id);
    if (!resourcesById.has(id)) resourcesById.set(id, resource);
  }
  const overrides: MonsterIconOverride[] = [];
  for (const targetBaseIconId of [...referenced].sort((a, b) => a - b)) {
    const base = resourcesById.get(targetBaseIconId);
    const paired = resourcesById.get(targetBaseIconId + MONSTER_ICON_PAIR_OFFSET);
    if (!base && !paired) continue;
    if (!base || !paired) {
      diagnostics.push({
        severity: "warning",
        code: "incomplete-monster-icon-override",
        message: `Scenario contains only one facing resource for monster icon override ${targetBaseIconId}. Both cicn ${targetBaseIconId} and ${targetBaseIconId + MONSTER_ICON_PAIR_OFFSET} are needed for a preserved override.`,
        source: "Scenario resource fork"
      });
      continue;
    }
    overrides.push({
      targetBaseIconId,
      sourceBaseIconId: targetBaseIconId,
      sourceKind: "scenario-resource",
      sourceLabel: `Imported scenario override ${targetBaseIconId}`,
      sourceBaseResourceBase64: bytesToBase64(base.data),
      sourcePairedResourceBase64: bytesToBase64(paired.data),
      imported: true
    });
  }
  return overrides;
}

function monsterIconIds(monsters: MonsterRecord[]) {
  const ids = new Set<number>();
  for (const monster of monsters) {
    const iconId = monster.iconId;
    if (!Number.isInteger(iconId) || iconId === 0) continue;
    ids.add(iconId);
    ids.add(Math.abs(iconId));
  }
  return [...ids];
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function buildScenarioSoundCatalog(
  resources: Array<{ source: string; resource: ResourceEntry }>,
  diagnostics: Diagnostic[]
): ResourceAsset[] {
  const seen = new Set<number>();
  const sounds: ResourceAsset[] = [];
  let previewCount = 0;
  for (const match of resources) {
    const { source, resource } = match;
    if (resource.resourceType !== "snd " || seen.has(resource.id)) continue;
    let previewPath: string | null = null;
    if (resource.data.byteLength <= BROWSER_EAGER_SOUND_PREVIEW_MAX_BYTES && previewCount < BROWSER_EAGER_SOUND_PREVIEW_MAX_COUNT) {
      const preview = inspectResourcePreview("snd ", resource.data);
      if (preview.status !== "playable" || !preview.dataUrl) {
        const detail = preview.diagnostics[0]?.message ?? `Preview status was ${preview.status}.`;
        diagnostics.push({
          severity: preview.status === "malformed" ? "error" : "warning",
          code: "unsupported-scenario-sound-preview",
          message: `Scenario snd ${resource.id} in ${source} could not be decoded for preview: ${detail}`,
          source
        });
      }
      previewPath = preview.status === "playable" ? preview.dataUrl : null;
      if (previewPath) previewCount += 1;
    }
    sounds.push({
      id: `scenario-snd-${resource.id}`,
      resourceType: "snd ",
      resourceId: resource.id,
      name: resource.name || null,
      source: `Browser import: ${source} snd ${resource.id}`,
      previewPath
    });
    seen.add(resource.id);
  }
  return sounds.sort((a, b) => a.resourceId - b.resourceId);
}

function scenarioResourceEntries(buffers: Map<string, Uint8Array>) {
  const entries: Array<{ source: string; resource: ResourceEntry }> = [];
  for (const [name, bytes] of buffers) {
    if (!isScenarioResourceForkName(name)) continue;
    for (const resource of parseResourceFork(bytes)) {
      entries.push({ source: name, resource });
    }
  }
  return entries;
}

function customAtlasPreview(
  resources: Array<{ source: string; resource: ResourceEntry }>,
  pictId: number,
  landlook: number,
  diagnostics: Diagnostic[]
) {
  const match = resources.find((entry) => entry.resource.resourceType === "PICT" && entry.resource.id === pictId);
  if (!match) {
    diagnostics.push({
      severity: "warning",
      code: "missing-custom-tile-atlas",
      message: `Landlook ${landlook} expects scenario PICT ${pictId}, but it was not found in the Scenario resource fork.`,
      source: `landlook-${landlook}`
    });
    return null;
  }
  const preview = inspectResourcePreview("PICT", match.resource.data);
  if (preview.status !== "preview-ready" || !preview.dataUrl) {
    const detail = preview.diagnostics[0]?.message ?? `Preview status was ${preview.status}.`;
    diagnostics.push({
      severity: preview.status === "malformed" ? "error" : "warning",
      code: "unsupported-custom-tile-atlas",
      message: `Landlook ${landlook} PICT ${pictId} could not be decoded as a tile atlas: ${detail}`,
      source: match.source
    });
    return { imagePath: null, available: false, source: `Browser import: ${match.source} PICT ${pictId} unsupported` };
  }
  return {
    imagePath: preview.dataUrl,
    available: true,
    source: `Browser import: ${match.source} PICT ${pictId}`
  };
}

function isScenarioResourceForkName(name: string) {
  const lower = name.toLowerCase();
  const normalized = lower.replace(/\\/g, "/");
  const baseName = normalized.split("/").pop() ?? normalized;
  return baseName === "scenario" ||
    baseName === "scenario.rsrc" ||
    baseName === "scenario.rsf" ||
    baseName === "._scenario" ||
    normalized.endsWith("/.rsrc/scenario");
}

function alignmentFor(source: string, buffer: Uint8Array | undefined, recordBytes: number): Alignment {
  if (!buffer) return { source, recordBytes, count: 0, trailingBytes: 0, status: "missing" };
  const count = Math.floor(buffer.byteLength / recordBytes);
  const trailingBytes = buffer.byteLength % recordBytes;
  return { source, recordBytes, count, trailingBytes, status: trailingBytes === 0 ? "aligned" : "has-trailing-bytes" };
}

function describeAction(slot: number, rawCode: number, id: number): Action {
  const code = normalizeStepOpcode(rawCode);
  const option = actionOptionFor(rawCode);
  return { slot, rawCode, code, id, label: option.shortLabel, category: legacyCategory(option.category), gosub: rawCode < 0 && rawCode !== -14 && rawCode !== -23 };
}

function legacyCategory(category: string) {
  if (category === "Text" || category === "Media") return "ui_text";
  if (category === "Combat") return "combat";
  if (category === "Encounter") return "encounter";
  if (category === "Economy") return "item_shop";
  if (category === "Map") return "map";
  if (category === "Scenario") return "registration";
  if (category === "Quest" || category === "Branch") return "branch";
  if (category === "Characters" || category === "Rules" || category === "Advanced") return "state";
  return "unknown";
}

function decodeDoorCoordinate(doorid: number, levelIndex: number | null) {
  if (doorid <= 0) return null;
  const position = doorid % 10000;
  const x = position % 100;
  const y = Math.floor(position / 100);
  const packedLevel = Math.floor(doorid / 10000);
  if (levelIndex != null && packedLevel !== levelIndex) return null;
  if (x >= MAP_SIZE || y >= MAP_SIZE) return null;
  return { x, y };
}

export function landlookName(landlook: number) {
  const names: Record<number, string> = {
    0: "Plains",
    3: "Subterranean",
    4: "Castle",
    5: "Desert",
    6: "Custom 1",
    7: "Custom 2",
    8: "Custom 3",
    9: "Swamp",
    10: "Snow"
  };
  return names[landlook] ?? "Unknown landlook";
}

export function landlookPictId(landlook: number) {
  return ({ 0: 300, 2: 302, 3: 303, 4: 304, 5: 305, 6: 306, 7: 307, 8: 308, 9: 309, 10: 310 } as Record<number, number>)[landlook] ?? null;
}

export function landlookBaseTile(landlook: number, buffers?: Map<string, Uint8Array>) {
  const standard = ({ 0: 156, 3: 155, 4: 111, 5: 191, 9: 155, 10: 155 } as Record<number, number>)[landlook];
  if (standard != null) return standard;
  return customLandlookBaseTile(landlook, buffers) ?? customLandlookFallbackBaseTile(landlook);
}

function customLandlookBaseTile(landlook: number, buffers?: Map<string, Uint8Array>) {
  const metadataName = ({ 6: "Data Custom 1 BD", 7: "Data Custom 2 BD", 8: "Data Custom 3 BD" } as Record<number, string>)[landlook];
  const bytes = metadataName ? buffers?.get(metadataName) : undefined;
  if (!bytes || bytes.byteLength < 8042) return null;
  const baseTile = i16(bytes, 8040);
  return baseTile > 0 && baseTile <= 999 ? baseTile : null;
}

function customLandlookFallbackBaseTile(landlook: number) {
  return landlook >= 6 && landlook <= 8 ? 156 : null;
}

function provenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number, confidence: Confidence): Provenance {
  return { sourceFile, recordIndex, byteOffset, byteLength, confidence };
}

function i16(buffer: Uint8Array, offset: number) {
  const value = (buffer[offset] << 8) | buffer[offset + 1];
  return value & 0x8000 ? value - 0x10000 : value;
}

function i32(buffer: Uint8Array, offset: number) {
  return (
    (buffer[offset] << 24) |
    (buffer[offset + 1] << 16) |
    (buffer[offset + 2] << 8) |
    buffer[offset + 3]
  );
}

function readI16s(buffer: Uint8Array, offset: number, count: number) {
  return Array.from({ length: count }, (_, index) => i16(buffer, offset + index * 2));
}

function readI32s(buffer: Uint8Array, offset: number, count: number) {
  return Array.from({ length: count }, (_, index) => i32(buffer, offset + index * 4));
}

function signedByte(value: number) {
  return value > 127 ? value - 256 : value;
}

function title(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
