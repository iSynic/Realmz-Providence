import { describe, expect, it } from "vitest";
import { emptyBattle, emptyMessage, emptyOptionLabel, emptyScenarioItem, emptyShop, emptyTreasure } from "../projectCommands/targetRecordCommands";
import type { MapRecord, RandomLevel, RandomRect } from "../types";
import { writeBattles, writeMapRecords, writeMessages, writeOptionLabels, writeRandomLevels, writeScenarioItems, writeShops, writeTreasures } from "./binaryWriters";
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

describe("browser treasure writer", () => {
  it("compiles a fresh record entirely from semantic fields", () => {
    const record = {
      ...emptyTreasure(0),
      itemIds: Array.from({ length: 20 }, (_, slot) => 900 + slot),
      exp: -10,
      gold: 20,
      gems: 30,
      jewelry: 40
    };

    expect(record.rawBytes).toBeUndefined();
    const output = writeTreasures([record]);

    expect(output).toHaveLength(48);
    expect(i16(output, 0)).toBe(900);
    expect(i16(output, 38)).toBe(919);
    expect(i16(output, 40)).toBe(-10);
    expect(i16(output, 46)).toBe(40);
  });

  it("recompiles imported rows without record byte identity", () => {
    const input = Uint8Array.from({ length: 48 }, (_, offset) => offset * 5);
    const imported = parseScenarioBuffers(new Map([["Data TD", input]])).treasures[0];

    expect(writeTreasures([{ ...imported, rawBytes: new Array(48).fill(0xa5) }])).toEqual(input);
  });

  it("rejects malformed compatibility bytes and item-slot inventories", () => {
    expect(() => writeTreasures([{ ...emptyTreasure(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
    expect(() => writeTreasures([{ ...emptyTreasure(0), itemIds: [] }]))
      .toThrow("must define 20 item slots");
  });
});

describe("browser message writer", () => {
  it("compiles a fresh record entirely from semantic text", () => {
    const record = { ...emptyMessage(0), text: "Providence" };

    expect(record.rawBytes).toBeUndefined();
    const output = writeMessages([record]);

    expect(output).toHaveLength(256);
    expect(Array.from(output.slice(0, 11))).toEqual(Array.from(new TextEncoder().encode("\nProvidence")));
    expect(Array.from(output.slice(11))).toEqual(new Array(245).fill(0));
  });

  it("recompiles imported text without record byte identity", () => {
    const input = new Uint8Array(256).fill(0xa5);
    input.set([2, "G".charCodeAt(0), "o".charCodeAt(0)]);
    const imported = parseScenarioBuffers(new Map([["Data SD2", input]])).messages[0];

    const output = writeMessages([{ ...imported, rawBytes: new Array(256).fill(0x5a) }]);

    expect(Array.from(output.slice(0, 3))).toEqual([2, 71, 111]);
    expect(Array.from(output.slice(3))).toEqual(new Array(253).fill(0));
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeMessages([{ ...emptyMessage(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
  });
});

describe("browser option-label writer", () => {
  it("compiles a fresh record entirely from semantic text", () => {
    const record = { ...emptyOptionLabel(0), text: "Proceed" };

    expect(record.rawBytes).toBeUndefined();
    const output = writeOptionLabels([record]);

    expect(output).toHaveLength(25);
    expect(Array.from(output.slice(0, 8))).toEqual(Array.from(new TextEncoder().encode("\x07Proceed")));
    expect(Array.from(output.slice(8))).toEqual(new Array(17).fill(0));
  });

  it("recompiles imported text without record byte identity", () => {
    const input = new Uint8Array(25).fill(0x20);
    input.set([2, "G".charCodeAt(0), "o".charCodeAt(0)]);
    const imported = parseScenarioBuffers(new Map([["Data OD", input]])).optionLabels[0];

    const output = writeOptionLabels([{ ...imported, rawBytes: new Array(25).fill(0x5a) }]);

    expect(Array.from(output.slice(0, 3))).toEqual([2, 71, 111]);
    expect(Array.from(output.slice(3))).toEqual(new Array(22).fill(0));
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeOptionLabels([{ ...emptyOptionLabel(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
  });
});

describe("browser battle writer", () => {
  it("compiles a fresh record entirely from semantic fields", () => {
    const record = {
      ...emptyBattle(0),
      grid: Array.from({ length: 13 * 13 }, (_, slot) => slot === 84 ? -7 : 0),
      dist: 3,
      messageBefore: 4,
      messageAfter: 5,
      battleMacro: -6
    };

    expect(record.rawBytes).toBeUndefined();
    const output = writeBattles([record]);

    expect(output).toHaveLength(346);
    expect(i16(output, 84 * 2)).toBe(-7);
    expect(output[338]).toBe(3);
    expect(output[339]).toBe(0);
    expect(i16(output, 340)).toBe(4);
    expect(i16(output, 342)).toBe(5);
    expect(i16(output, 344)).toBe(-6);
  });

  it("recompiles imported semantics without record byte identity", () => {
    const input = new Uint8Array(346);
    setI16(input, 12 * 2, 9);
    input[338] = 2;
    input[339] = 0xa5;
    setI16(input, 340, 10);
    setI16(input, 342, 11);
    setI16(input, 344, -12);
    const imported = parseScenarioBuffers(new Map([["Data BD", input]])).battles[0];

    const output = writeBattles([{ ...imported, rawBytes: new Array(346).fill(0x5a) }]);

    expect(i16(output, 12 * 2)).toBe(9);
    expect(output[338]).toBe(2);
    expect(output[339]).toBe(0);
    expect(i16(output, 340)).toBe(10);
    expect(i16(output, 342)).toBe(11);
    expect(i16(output, 344)).toBe(-12);
    expect(output).not.toEqual(input);
  });

  it("allows imported over-cap rows to compile before compatibility-annex overlay", () => {
    const input = new Uint8Array(346);
    for (let slot = 0; slot < 101; slot += 1) setI16(input, slot * 2, 1);
    const imported = parseScenarioBuffers(new Map([["Data BD", input]])).battles[0];

    expect(writeBattles([imported])).toEqual(input);
    expect(() => writeBattles([{ ...imported, authored: true }]))
      .toThrow("at most 100 loaded monsters");
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeBattles([{ ...emptyBattle(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
  });
});

describe("browser shop writer", () => {
  it("compiles a fresh record entirely from semantic fields", () => {
    const record = {
      ...emptyShop(0),
      itemIds: Array.from({ length: 1000 }, (_, slot) => (slot % 1999) - 999),
      quantities: Array.from({ length: 1000 }, (_, slot) => slot & 0xff),
      inflation: -12
    };

    expect(record.rawBytes).toBeUndefined();
    const output = writeShops([record]);

    expect(output).toHaveLength(3002);
    expect(i16(output, 0)).toBe(-999);
    expect(i16(output, 1998)).toBe(0);
    expect(output[2000]).toBe(0);
    expect(output[2999]).toBe(231);
    expect(i16(output, 3000)).toBe(-12);
  });

  it("recompiles imported rows without record byte identity", () => {
    const input = new Uint8Array(3002);
    for (let slot = 0; slot < 1000; slot += 1) {
      setI16(input, slot * 2, (slot % 1999) - 999);
      input[2000 + slot] = slot & 0xff;
    }
    setI16(input, 3000, -12);
    const imported = parseScenarioBuffers(new Map([["Data SD", input]])).shops[0];

    expect(writeShops([{ ...imported, rawBytes: new Array(3002).fill(0xa5) }])).toEqual(input);
  });

  it("rejects malformed compatibility bytes and slot inventories", () => {
    expect(() => writeShops([{ ...emptyShop(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
    expect(() => writeShops([{ ...emptyShop(0), itemIds: [] }]))
      .toThrow("must define 1000 item and quantity slots");
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

function setI16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function i32(bytes: Uint8Array, offset: number) {
  return (((bytes[offset] ?? 0) << 24) | ((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)) | 0;
}
