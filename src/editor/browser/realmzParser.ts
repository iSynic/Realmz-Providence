import {
  Action,
  Alignment,
  Diagnostic,
  ExtraCodeRow,
  LevelType,
  MapEntity,
  RandomLevel,
  TilesetAsset,
  TriggerRecord
} from "../types";
import { browserReferenceAtlasUrl, hasBrowserReferenceAtlas } from "./atlasPaths";

export const MAP_SIZE = 90;
export const FIELD_BYTES = MAP_SIZE * MAP_SIZE * 2;
export const DOOR_BYTES = 40;
export const DOORS_PER_LEVEL = 100;
export const DOOR_LEVEL_BYTES = DOOR_BYTES * DOORS_PER_LEVEL;
export const RANDLEVEL_BYTES = 644;
export const EXTRACODE_BYTES = 10;

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
  "Data MENU",
  "Data Solids"
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
  "Data MENU": 502,
  "Data Solids": 1024
};

export type ParsedBrowserScenario = {
  maps: MapEntity[];
  triggers: TriggerRecord[];
  randomLevels: RandomLevel[];
  extracodes: ExtraCodeRow[];
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

  const triggers = [
    ...parseDoorFile(buffers.get("Data DD"), "land", "Data DD"),
    ...parseDoorFile(buffers.get("Data DDD"), "dungeon", "Data DDD"),
    ...parseMacroFile(buffers.get("Data ED3"))
  ];
  const extracodes = parseExtracodes(buffers.get("Data EDCD"));
  const assetCatalog = { tilesets: buildAssetCatalog(maps, randomLevels) };
  return { maps, triggers, randomLevels, extracodes, assetCatalog, records, diagnostics };
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

function buildAssetCatalog(maps: MapEntity[], randomLevels: RandomLevel[]) {
  const landlooks = [...new Set(randomLevels.map((level) => level.landlook).filter((landlook) => landlook >= 0))].sort((a, b) => a - b);
  const tilesets = landlooks.map((landlook): TilesetAsset => {
    const pictId = landlookPictId(landlook);
    const imagePath = browserReferenceAtlasUrl(pictId);
    return {
      id: `landlook-${landlook}`,
      landlook,
      name: landlookName(landlook),
      source: imagePath
        ? "Browser import: Scenario Utility reference PICT PNG"
        : "Browser import: custom or missing reference atlas",
      available: hasBrowserReferenceAtlas(pictId),
      imagePath,
      pictId,
      tileWidth: 32,
      tileHeight: 32,
      columns: 20,
      rows: 10,
      baseTile: landlookBaseTile(landlook),
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

function alignmentFor(source: string, buffer: Uint8Array | undefined, recordBytes: number): Alignment {
  if (!buffer) return { source, recordBytes, count: 0, trailingBytes: 0, status: "missing" };
  const count = Math.floor(buffer.byteLength / recordBytes);
  const trailingBytes = buffer.byteLength % recordBytes;
  return { source, recordBytes, count, trailingBytes, status: trailingBytes === 0 ? "aligned" : "has-trailing-bytes" };
}

function describeAction(slot: number, rawCode: number, id: number): Action {
  const code = normalizeOpcode(rawCode);
  const [label, category] = opcodeInfo(code);
  return { slot, rawCode, code, id, label, category, gosub: rawCode < 0 && rawCode !== -14 && rawCode !== -23 };
}

function normalizeOpcode(code: number) {
  return code < 0 && code !== -14 && code !== -23 ? -code : code;
}

function opcodeInfo(code: number): [string, string] {
  if (code === 1) return ["Text", "ui_text"];
  if (code === 2) return ["Battle", "combat"];
  if (code === 3) return ["Choice", "branch"];
  if (code === 4) return ["Simple encounter", "encounter"];
  if (code === 5) return ["Complex encounter", "encounter"];
  if (code === 6) return ["Load shop", "item_shop"];
  if (code === 7) return ["Action data mutation", "map"];
  if (code === 8) return ["Same as other door", "branch"];
  if (code === 9) return ["Play sound", "ui_text"];
  if (code === 10) return ["Give treasure", "item_shop"];
  if (code === 11) return ["Give experience", "combat"];
  if (code === 12 || code === 13 || [20, 37, 45, 57, 59, 61, 70, 78, 92, 106].includes(code)) return ["Map action", "map"];
  if ([21, 22, 33, 38, 49, 51, 52, 65, 67, 73].includes(code)) return ["Item or shop action", "item_shop"];
  if ([23, -23, 54, 63, 64, 66].includes(code)) return ["Time or encounter state", "time"];
  if ([24, 31, 40, 42, 46, 55, 56, 58, 72, 75, 76, 77, 81, 85, 86, 87, 111, 112].includes(code)) return ["Branch", "branch"];
  if ([27, 29, 62, 71, 74, 107, 122].includes(code)) return ["UI or text action", "ui_text"];
  if ([47, 60, 68, 69, 83, 84, 88, 89, 90, 91, 97, 100, 101, 102, 103, 104, 105, 108, 119, 123].includes(code)) return ["State action", "state"];
  if (code === 98 || code === 99) return ["Registration check", "registration"];
  if (code === 0) return ["Empty", "unknown"];
  return ["Unknown opcode", "unknown"];
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

function landlookName(landlook: number) {
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

function landlookPictId(landlook: number) {
  return ({ 0: 300, 2: 302, 3: 303, 4: 304, 5: 305, 6: 306, 7: 307, 8: 308, 9: 309, 10: 310 } as Record<number, number>)[landlook] ?? null;
}

export function landlookBaseTile(landlook: number) {
  return ({ 0: 156, 3: 155, 4: 111, 5: 191, 9: 155, 10: 155 } as Record<number, number>)[landlook] ?? null;
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
