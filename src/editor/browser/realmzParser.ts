import {
  Action,
  Alignment,
  BattleRecord,
  ComplexEncounterRecord,
  Diagnostic,
  EncounterActionRow,
  ExtraCodeRow,
  LevelType,
  MapEntity,
  MapRecord,
  MessageRecord,
  RandomLevel,
  ShopRecord,
  SimpleEncounterRecord,
  TileAttributeProfile,
  TilesetAsset,
  TreasureRecord,
  TriggerRecord
} from "../types";
import { browserReferenceAtlasUrl, hasBrowserReferenceAtlas } from "./atlasPaths";
import { parseResourceFork, type ResourceEntry } from "./library";
import { inspectResourcePreview } from "./resourcePreview";
import { actionOptionFor, normalizeStepOpcode } from "../realmzActions";

export const MAP_SIZE = 90;
export const FIELD_BYTES = MAP_SIZE * MAP_SIZE * 2;
export const DOOR_BYTES = 40;
export const DOORS_PER_LEVEL = 100;
export const DOOR_LEVEL_BYTES = DOOR_BYTES * DOORS_PER_LEVEL;
export const RANDLEVEL_BYTES = 644;
export const EXTRACODE_BYTES = 10;
export const MAP_RECORD_BYTES = 340;

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
  "Data BD",
  "Data SD",
  "Data SD2",
  "Data MD2",
  "Data TD",
  "Data TD2",
  "Data TD3",
  "Data CI",
  "Data RI",
  "Data MENU",
  "Data Solids",
  "Data Custom 1 BD",
  "Data Custom 2 BD",
  "Data Custom 3 BD"
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
  "Data MD": 210,
  "Data BD": 346,
  "Data SD": 3002,
  "Data SD2": 256,
  "Data MD2": 340,
  "Data TD": 48,
  "Data TD2": 118,
  "Data TD3": 40,
  "Data CI": 4608,
  "Data RI": 320,
  "Global": 60,
  "Data MENU": 502,
  "Data Solids": 1024
};

export type ParsedBrowserScenario = {
  maps: MapEntity[];
  mapRecords: MapRecord[];
  tileAttributes: TileAttributeProfile[];
  triggers: TriggerRecord[];
  randomLevels: RandomLevel[];
  extracodes: ExtraCodeRow[];
  messages: MessageRecord[];
  battles: BattleRecord[];
  treasures: TreasureRecord[];
  shops: ShopRecord[];
  simpleEncounters: SimpleEncounterRecord[];
  complexEncounters: ComplexEncounterRecord[];
  assetCatalog: { tilesets: TilesetAsset[] };
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
  const mapRecords = parseMapRecords(buffers.get("Data MD2"));
  const tileAttributes = [
    ...parseTileAttributes(buffers.get("Data Solids")),
    ...parseLandlookMapstats(buffers.get("Data Custom 1 BD"), 6, "Data Custom 1 BD"),
    ...parseLandlookMapstats(buffers.get("Data Custom 2 BD"), 7, "Data Custom 2 BD"),
    ...parseLandlookMapstats(buffers.get("Data Custom 3 BD"), 8, "Data Custom 3 BD")
  ];

  const triggers = [
    ...parseDoorFile(buffers.get("Data DD"), "land", "Data DD"),
    ...parseDoorFile(buffers.get("Data DDD"), "dungeon", "Data DDD"),
    ...parseMacroFile(buffers.get("Data ED3"))
  ];
  const extracodes = parseExtracodes(buffers.get("Data EDCD"));
  const messages = parseMessages(buffers.get("Data SD2"));
  const battles = parseBattles(buffers.get("Data BD"));
  const treasures = parseTreasures(buffers.get("Data TD"));
  const shops = parseShops(buffers.get("Data SD"));
  const simpleEncounters = parseSimpleEncounters(buffers.get("Data ED"));
  const complexEncounters = parseComplexEncounters(buffers.get("Data ED2"));
  const assetCatalog = { tilesets: buildAssetCatalog(maps, randomLevels, buffers, diagnostics) };
  return { maps, mapRecords, tileAttributes, triggers, randomLevels, extracodes, messages, battles, treasures, shops, simpleEncounters, complexEncounters, assetCatalog, records, diagnostics };
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
    const flags: TileAttributeProfile["flags"] = [solid === 0 && needBoat === 0 && !flyFloat ? "walkable" : "solid"];
    if (shore) flags.push("shore");
    if (needBoat !== 0) flags.push("boat-required");
    if (isPath) flags.push("path");
    if (los) flags.push("blocks-los");
    if (flyFloat) flags.push("fly-float-required");
    return {
      tile,
      landlook,
      solidType: solid,
      movementSoundId: sound,
      movementCost: time,
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
      render: { tilesetId: "abstract-fallback", landlook: null, mode: "abstract-fallback" }
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
  const actions: Action[] = [];
  for (let slot = 0; slot < 8; slot += 1) {
    const rawCode = i16(buffer, 8 + slot * 2);
    const id = i16(buffer, 24 + slot * 2);
    if (rawCode !== 0 || id !== 0) actions.push(describeAction(slot, rawCode, id));
  }
  const active = source === "Data ED3"
    ? actions.length > 0
    : Boolean(coordinate && (buffer[7] !== 0 || actions.length > 0 || doorid !== 0));
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
    percent: buffer[7],
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
  return fixedRecords(buffer, 3002, "Data SD", (id, start, record) => ({
    id,
    itemIds: Array.from({ length: 1000 }, (_, slot) => i16(record, slot * 2)),
    quantities: Array.from(record.subarray(2000, 3000)),
    inflation: i16(record, 3000),
    rawBytes: Array.from(record),
    authored: false,
    provenance: provenance("Data SD", id, start, 3002, "source-backed")
  }));
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
    choiceResults: Array.from(record.subarray(96, 100)),
    wordResults: Array.from(record.subarray(100, 104)),
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
    const imagePath = customPreview?.imagePath ?? browserReferenceAtlasUrl(pictId);
    const hasAtlas = customPreview?.available ?? hasBrowserReferenceAtlas(pictId);
    return {
      id: `landlook-${landlook}`,
      landlook,
      name: landlookName(landlook),
      source: customPreview?.source ?? (imagePath
        ? "Browser import: Scenario Utility reference PICT PNG"
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
    const imagePath = browserReferenceAtlasUrl(302);
    tilesets.push({
      id: "dungeon-top-down-302",
      landlook: 2,
      name: "Dungeon Top Down",
      source: "Browser import: Scenario Utility reference PICT PNG",
      available: imagePath !== null,
      imagePath,
      pictId: 302,
      tileWidth: 16,
      tileHeight: 16,
      columns: 4,
      rows: 4,
      baseTile: null,
      custom: false
    });
  }
  return tilesets;
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
  return lower === "scenario" || lower === "scenario.rsrc" || lower === "scenario.rsf" || lower === "._scenario";
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
    6: "Custom 6",
    7: "Custom 7",
    8: "Custom 8",
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
  return customLandlookBaseTile(landlook, buffers);
}

function customLandlookBaseTile(landlook: number, buffers?: Map<string, Uint8Array>) {
  const metadataName = ({ 6: "Data Custom 1 BD", 7: "Data Custom 2 BD", 8: "Data Custom 3 BD" } as Record<number, string>)[landlook];
  const bytes = metadataName ? buffers?.get(metadataName) : undefined;
  if (!bytes || bytes.byteLength < 8042) return null;
  const baseTile = i16(bytes, 8040);
  return baseTile > 0 && baseTile <= 999 ? baseTile : null;
}

function provenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number, confidence: string) {
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

function signedByte(value: number) {
  return value > 127 ? value - 256 : value;
}

function title(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
