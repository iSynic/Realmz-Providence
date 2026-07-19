import { describe, expect, it } from "vitest";
import { emptyScenarioItem } from "../projectCommands/targetRecordCommands";
import type { MapRecord, RandomLevel, RandomRect } from "../types";
import { writeMapRecords, writeRandomLevels, writeScenarioItems } from "./binaryWriters";
import { parseScenarioBuffers } from "./realmzParser";

const rect: RandomRect = {
  rectIndex: 2,
  top: 3,
  left: 4,
  bottom: 8,
  right: 9,
  percent: 75,
  battleRange: [10, 12],
  randomDoors: [1, 2, 3],
  randomDoorPercent: [25, 50, 75],
  only: true,
  option: -2,
  sound: 17,
  text: 23
};

describe("browser random-level writer", () => {
  it("compiles a fresh level entirely from semantic fields", () => {
    const output = writeRandomLevels([randomLevel({
      levelType: "dungeon",
      landlook: -1,
      isDark: true,
      useLos: true,
      rects: [rect]
    })], "dungeon");

    expect(output).toHaveLength(644);
    expect(output[520]).toBe(0xff);
    expect(output[521]).toBe(1);
    expect(output[522]).toBe(1);
    expect(i16(output, 16)).toBe(3);
    expect(i16(output, 18)).toBe(4);
    expect(i16(output, 20)).toBe(8);
    expect(i16(output, 22)).toBe(9);
    expect(i16(output, 164)).toBe(75);
    expect(i16(output, 208)).toBe(10);
    expect(i16(output, 210)).toBe(12);
    expect(i16(output, 292)).toBe(1);
    expect(i16(output, 412)).toBe(25);
    expect(output[525]).toBe(1);
    expect(output[545]).toBe(0xfe);
    expect(i16(output, 567)).toBe(17);
    expect(i16(output, 607)).toBe(23);
    expect(output[643]).toBe(0);
  });

  it("overlays authored semantics on an imported compatibility base", () => {
    const rawValues = new Array(322).fill(0);
    rawValues[260] = 0x01a5;
    rawValues[261] = -23296;
    rawValues[321] = 0x1234;

    const output = writeRandomLevels([randomLevel({
      landlook: 4,
      isDark: true,
      useLos: true,
      rawValues
    })], "land");

    expect(output[520]).toBe(4);
    expect(output[521]).toBe(0xa5);
    expect(output[522]).toBe(0xa5);
    expect(output[642]).toBe(0x12);
    expect(output[643]).toBe(0x34);

    const changed = writeRandomLevels([randomLevel({
      landlook: 4,
      isDark: false,
      useLos: true,
      rawValues
    })], "land");
    expect(changed[521]).toBe(0);
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeRandomLevels([randomLevel({ rawValues: [1] })], "land"))
      .toThrow("invalid random-level raw value count");
  });
});

describe("browser map-record writer", () => {
  it("compiles a fresh record entirely from semantic fields", () => {
    const record = mapRecord({
      markers: [
        { iconId: 400, x: 12, y: 13 },
        ...Array.from({ length: 9 }, () => ({ iconId: 0, x: 0, y: 0 }))
      ],
      startX: 4,
      startY: 5,
      level: 2,
      pictId: 30128,
      iconSize: 32,
      show: -808,
      isDungeon: true,
      rect: { top: 1, left: 2, bottom: 20, right: 30 },
      note: "Go"
    });

    const output = writeMapRecords([record]);

    expect(output).toHaveLength(340);
    expect(i16(output, 0)).toBe(400);
    expect(i16(output, 2)).toBe(12);
    expect(i16(output, 4)).toBe(13);
    expect(i16(output, 60)).toBe(4);
    expect(i16(output, 64)).toBe(2);
    expect(i16(output, 66)).toBe(30128);
    expect(i16(output, 70)).toBe(-808);
    expect(i16(output, 72)).toBe(1);
    expect(output.slice(74, 76)).toEqual(new Uint8Array([0, 0]));
    expect(i16(output, 76)).toBe(1);
    expect(Array.from(output.slice(84, 87))).toEqual([2, 71, 111]);
  });

  it("preserves only compatible encodings until semantics change", () => {
    const rawBytes = new Array(340).fill(0xa5);
    rawBytes[84] = 2;
    rawBytes[85] = 71;
    rawBytes[86] = 111;
    const imported = mapRecord({
      markers: Array.from({ length: 10 }, () => ({ iconId: -23131, x: -23131, y: -23131 })),
      startX: -23131,
      startY: -23131,
      level: -23131,
      pictId: -23131,
      iconSize: -23131,
      show: -23131,
      isDungeon: true,
      rect: { top: -23131, left: -23131, bottom: -23131, right: -23131 },
      note: "Go",
      rawBytes,
      authored: false
    });

    expect(writeMapRecords([imported])).toEqual(new Uint8Array(rawBytes));

    const changed = writeMapRecords([{ ...imported, startX: 0x1234, isDungeon: false }]);
    expect(i16(changed, 60)).toBe(0x1234);
    expect(i16(changed, 72)).toBe(0);
    expect(Array.from(changed.slice(74, 76))).toEqual([0xa5, 0xa5]);
    expect(Array.from(changed.slice(84, 87))).toEqual([2, 71, 111]);
    expect(changed[339]).toBe(0xa5);
  });

  it("rejects malformed map-record compatibility storage", () => {
    expect(() => writeMapRecords([mapRecord({ rawBytes: [1] })]))
      .toThrow("invalid compatibility byte storage");
  });
});

describe("browser scenario-item writer", () => {
  it("compiles a fresh record entirely from semantic fields", () => {
    const record = {
      ...emptyScenarioItem(0),
      itemId: 901,
      iconId: 321,
      itemCat0: 0x01020304,
      spare2: [1, 2, 3, 4, 5, 6, 7],
      special5: -123
    };

    expect(record.rawBytes).toBeUndefined();
    const output = writeScenarioItems([record]);

    expect(output).toHaveLength(100);
    expect(i16(output, 2)).toBe(901);
    expect(i16(output, 4)).toBe(321);
    expect(i32(output, 36)).toBe(0x01020304);
    expect(i16(output, 56)).toBe(1);
    expect(i16(output, 68)).toBe(7);
    expect(i16(output, 94)).toBe(-123);
  });

  it("preserves an imported zero item-id alias until semantics change", () => {
    const rawBytes = new Uint8Array(100).fill(0xa5);
    rawBytes[2] = 0;
    rawBytes[3] = 0;
    const imported = parseScenarioBuffers(new Map([["Data NI", rawBytes]])).scenarioItems[0];

    expect(imported.itemId).toBe(800);
    expect(writeScenarioItems([imported])).toEqual(rawBytes);

    const changed = writeScenarioItems([{ ...imported, itemId: 901 }]);
    expect(i16(changed, 2)).toBe(901);
    expect(Array.from(changed.slice(56, 70))).toEqual(Array.from(rawBytes.slice(56, 70)));
  });

  it("rejects malformed compatibility bytes and spare-word inventories", () => {
    expect(() => writeScenarioItems([{ ...emptyScenarioItem(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
    expect(() => writeScenarioItems([{ ...emptyScenarioItem(0), spare2: [] }]))
      .toThrow("must define 7 spare words");
  });
});

function randomLevel(overrides: Partial<RandomLevel> = {}): RandomLevel {
  const levelType = overrides.levelType ?? "land";
  const source = levelType === "land" ? "Data RD" : "Data RDD";
  return {
    id: `${levelType}:0:randlevel`,
    source,
    levelType,
    levelIndex: 0,
    landlook: 0,
    isDark: false,
    useLos: false,
    rects: [],
    provenance: {
      sourceFile: source,
      recordIndex: 0,
      byteOffset: 0,
      byteLength: 644,
      confidence: "fixture-backed"
    },
    ...overrides
  };
}

function mapRecord(overrides: Partial<MapRecord> = {}): MapRecord {
  return {
    id: 0,
    markers: Array.from({ length: 10 }, () => ({ iconId: 0, x: 0, y: 0 })),
    startX: 0,
    startY: 0,
    level: 0,
    pictId: 0,
    iconSize: 16,
    show: 1,
    isDungeon: false,
    rect: { top: 0, left: 0, bottom: 0, right: 0 },
    note: "",
    provenance: {
      sourceFile: "Data MD2",
      recordIndex: 0,
      byteOffset: 0,
      byteLength: 340,
      confidence: "fixture-backed"
    },
    ...overrides
  };
}

function i16(bytes: Uint8Array, offset: number) {
  const value = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  return value >= 0x8000 ? value - 0x10000 : value;
}

function i32(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) | 0;
}
