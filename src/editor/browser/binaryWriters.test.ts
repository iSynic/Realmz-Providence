import { describe, expect, it } from "vitest";
import { emptyBattle, emptyComplexEncounter, emptyMessage, emptyOptionLabel, emptyScenarioItem, emptyShop, emptySimpleEncounter, emptyThiefEncounter, emptyTimedEncounter, emptyTreasure } from "../projectCommands/targetRecordCommands";
import { emptyCasteOverride, emptyRaceOverride, emptySpellOverride } from "../projectCommands/scenarioRulesCommands";
import type { MapRecord, RandomLevel, RandomRect } from "../types";
import { writeBattles, writeCasteOverrides, writeComplexEncounters, writeMapRecords, writeMessages, writeMonsterDescriptions, writeMonsters, writeOptionLabels, writeRaceOverrides, writeRandomLevels, writeScenarioContactInfo, writeScenarioItems, writeScenarioRestrictions, writeShops, writeSimpleEncounters, writeSpellOverrides, writeThiefEncounters, writeTimedEncounters, writeTreasures } from "./binaryWriters";
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

describe("browser rule-override writers", () => {
  it("compile semantic records without embedded raw identity", () => {
    const spell = {
      ...emptySpellOverride(0),
      range1: 200,
      toHitBonus: -7,
      inCombat: true,
      rawBytes: new Array(30).fill(0xa5)
    };
    const race = {
      ...emptyRaceOverride(0),
      baseMove: 13,
      spare: undefined,
      spacer: undefined,
      rawBytes: new Array(408).fill(0xa5)
    };
    const caste = {
      ...emptyCasteOverride(0),
      startMoney: 222,
      spare1: undefined,
      spare2: undefined,
      spacer: undefined,
      rawBytes: new Array(576).fill(0xa5)
    };

    const spellBytes = writeSpellOverrides([spell]);
    const raceBytes = writeRaceOverrides([race]);
    const casteBytes = writeCasteOverrides([caste]);

    expect(Array.from(spellBytes.slice(0, 5))).toEqual([200, 0, 0, 249, 0]);
    expect(spellBytes[28]).toBe(1);
    expect(i16(raceBytes, 196)).toBe(13);
    expect(raceBytes[96]).toBe(0);
    expect(raceBytes[346]).toBe(0);
    expect(i16(casteBytes, 384)).toBe(222);
    expect(casteBytes[240]).toBe(0);
    expect(casteBytes[450]).toBe(0);
  });

  it("reject malformed compatibility storage and fixed arrays", () => {
    expect(() => writeSpellOverrides([{ ...emptySpellOverride(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
    expect(() => writeRaceOverrides([{ ...emptyRaceOverride(0), plusMinusToHit: [1] }]))
      .toThrow("exactly 8 to-hit adjustments");
    expect(() => writeCasteOverrides([{ ...emptyCasteOverride(0), spellcasters: [[1, 2, 3]] }]))
      .toThrow("exactly 4 spellcaster rows");
  });
});

describe("browser scenario metadata writers", () => {
  it("compile contact and restriction semantics without embedded raw identity", () => {
    const contact = {
      scenarioName: "Canonical contact",
      version: "1.0",
      date: "2026-07-19",
      author: "Providence",
      email: "author@example.test",
      web: "https://example.test",
      fee: "Free",
      payInfo: ["A", "B", "C", "D", "E"],
      titles: ["One", "Two", "Three", "Four", "Five"],
      description: "Canonical description",
      authored: false
    };
    const restrictions = {
      description: "No giants",
      maxPartyCharacters: 4,
      maxPartyLevel: 20,
      bannedRaces: [1, 30],
      bannedCastes: [2, 29],
      authored: false
    };

    expect(writeScenarioContactInfo({ ...contact, rawBytes: new Array(4608).fill(0xa5) }))
      .toEqual(writeScenarioContactInfo(contact));
    expect(writeScenarioRestrictions({ ...restrictions, rawBytes: new Array(320).fill(0xa5) }))
      .toEqual(writeScenarioRestrictions(restrictions));
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeScenarioContactInfo({
      scenarioName: "",
      version: "",
      date: "",
      author: "",
      email: "",
      web: "",
      fee: "",
      payInfo: [],
      titles: [],
      description: "",
      rawBytes: [1]
    })).toThrow("invalid compatibility byte storage");
    expect(() => writeScenarioRestrictions({
      description: "",
      maxPartyCharacters: 0,
      maxPartyLevel: 0,
      bannedRaces: [],
      bannedCastes: [],
      rawBytes: [1]
    })).toThrow("invalid compatibility byte storage");
  });
});

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

describe("browser simple-encounter writer", () => {
  it("compiles a fresh record entirely from semantic fields", () => {
    const record = {
      ...emptySimpleEncounter(0),
      actions: [{ slot: 3, rawCode: -7, id: 321 }],
      choiceResults: [1, 2, 3, 4],
      canBackOut: true,
      maxTimes: -2,
      casteSuccess: 5,
      prompt: 17,
      texts: ["Continue", "Search", "Leave", "Wait"]
    };

    expect(record.rawBytes).toBeUndefined();
    const output = writeSimpleEncounters([record]);

    expect(output).toHaveLength(426);
    expect(output[3]).toBe(0xf9);
    expect(i16(output, 32 + 3 * 2)).toBe(321);
    expect(Array.from(output.slice(96, 103))).toEqual([1, 2, 3, 4, 1, 0xfe, 5]);
    expect(output[103]).toBe(0);
    expect(i16(output, 104)).toBe(17);
    expect(Array.from(output.slice(106, 115))).toEqual([8, 67, 111, 110, 116, 105, 110, 117, 101]);
    expect(Array.from(output.slice(115, 186))).toEqual(new Array(71).fill(0));
  });

  it("recompiles imported semantics without record byte identity", () => {
    const input = new Uint8Array(426).fill(0xa5);
    input[0] = 9;
    setI16(input, 32, -12);
    input.set([4, 3, 2, 1, 1, 7, 8], 96);
    input[103] = 0xb6;
    setI16(input, 104, 19);
    input.fill(0, 106, 426);
    input.set([2, 79, 107], 106);
    const imported = parseScenarioBuffers(new Map([["Data ED", input]])).simpleEncounters[0];

    const output = writeSimpleEncounters([{ ...imported, rawBytes: new Array(426).fill(0x5a) }]);

    expect(output[0]).toBe(9);
    expect(i16(output, 32)).toBe(-12);
    expect(Array.from(output.slice(96, 103))).toEqual([4, 3, 2, 1, 1, 7, 8]);
    expect(output[103]).toBe(0);
    expect(i16(output, 104)).toBe(19);
    expect(Array.from(output.slice(106, 109))).toEqual([2, 79, 107]);
    expect(Array.from(output.slice(109, 186))).toEqual(new Array(77).fill(0));
    expect(output).not.toEqual(input);
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeSimpleEncounters([{ ...emptySimpleEncounter(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
  });
});

describe("browser complex-encounter writer", () => {
  it("compiles a fresh record entirely from semantic fields", () => {
    const record = {
      ...emptyComplexEncounter(0),
      actions: [{ slot: 4, rawCode: -2, id: 0x0304 }],
      actionResult: 6,
      wordResult: 7,
      groups: [0, 0, 0, 0, -8, 0, 0, 0],
      spellIds: [0x1112, ...new Array(9).fill(1100)],
      spellResults: [0, -9, ...new Array(8).fill(0)],
      itemIds: [0, 0, 0x1314, 0, 0],
      itemResults: [0, 0, 0, -10, 0],
      canBackOut: true,
      thief: true,
      maxTimes: -3,
      casteSuccess: 4,
      thiefSuccess: -5,
      thiefFail: 8,
      prompt: 0x0506,
      texts: ["Hi", "", "", "", "", "", "", "", ""]
    };

    expect(record.rawBytes).toBeUndefined();
    const output = writeComplexEncounters([record]);

    expect(output).toHaveLength(520);
    expect(output[4]).toBe(0xfe);
    expect(i16(output, 40)).toBe(0x0304);
    expect(Array.from(output.slice(96, 106))).toEqual([6, 7, 0, 0, 0, 0, 0xf8, 0, 0, 0]);
    expect(i16(output, 106)).toBe(0x1112);
    expect(output[127]).toBe(0xf7);
    expect(i16(output, 140)).toBe(0x1314);
    expect(output[149]).toBe(0xf6);
    expect(Array.from(output.slice(151, 158))).toEqual([1, 1, 0xfd, 4, 0xfb, 8, 0]);
    expect(i16(output, 158)).toBe(0x0506);
    expect(Array.from(output.slice(160, 163))).toEqual([2, 72, 105]);
  });

  it("recompiles imported semantics without record byte identity", () => {
    const input = new Uint8Array(520);
    input[96] = 6;
    input[157] = 0x5a;
    input.set([2, 72, 105, 0xcc], 160);
    const imported = parseScenarioBuffers(new Map([["Data ED2", input]])).complexEncounters[0];

    const output = writeComplexEncounters([{ ...imported, rawBytes: new Array(520).fill(0xa5) }]);

    expect(output).not.toEqual(input);
    expect(output[96]).toBe(6);
    expect(output[157]).toBe(0);
    expect(Array.from(output.slice(160, 164))).toEqual([2, 72, 105, 0]);
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeComplexEncounters([{ ...emptyComplexEncounter(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
  });
});

describe("browser thief-encounter writer", () => {
  it("compiles a fresh record entirely from semantic fields", () => {
    const record = {
      ...emptyThiefEncounter(0),
      typeFlags: [true, false, true, false, true, false, true, false, true, true],
      modifiers: [-1, 2, -3, 4, -5, 6, -7, 8],
      successCodes: [1, 2, 3, 4, -1, -2, -3, -4],
      failureCodes: [4, 3, 2, 1, -4, -3, -2, -1],
      successText: [0x0101, 0x0102, 0x0103, 0x0104, 0x0105, 0x0106, 0x0107, 0x0108],
      failureText: [0x0201, 0x0202, 0x0203, 0x0204, 0x0205, 0x0206, 0x0207, 0x0208],
      successSounds: [0x0301, 0x0302, 0x0303, 0x0304, 0x0305, 0x0306, 0x0307, 0x0308],
      failureSounds: [0x0401, 0x0402, 0x0403, 0x0404, 0x0405, 0x0406, 0x0407, 0x0408],
      spell: 0x0501,
      lowDamage: 0x0502,
      highDamage: 0x0503,
      tumblers: 0x0504,
      prompts: [0x0601, 0x0602, 0x0603],
      promptSounds: [0x0701, 0x0702, 0x0703]
    };

    expect(record.rawBytes).toBeUndefined();
    const output = writeThiefEncounters([record]);

    expect(output).toHaveLength(118);
    expect(Array.from(output.slice(0, 10))).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 1, 1]);
    expect(Array.from(output.slice(10, 18))).toEqual([0xff, 2, 0xfd, 4, 0xfb, 6, 0xf9, 8]);
    expect(Array.from(output.slice(18, 26))).toEqual([1, 2, 3, 4, 0xff, 0xfe, 0xfd, 0xfc]);
    expect(Array.from(output.slice(26, 34))).toEqual([4, 3, 2, 1, 0xfc, 0xfd, 0xfe, 0xff]);
    expect(i16(output, 34)).toBe(0x0101);
    expect(i16(output, 64)).toBe(0x0208);
    expect(i16(output, 66)).toBe(0x0301);
    expect(i16(output, 96)).toBe(0x0408);
    expect(Array.from(output.slice(98, 106))).toEqual([5, 1, 5, 2, 5, 3, 5, 4]);
    expect(Array.from(output.slice(106, 118))).toEqual([6, 1, 6, 2, 6, 3, 7, 1, 7, 2, 7, 3]);
  });

  it("recompiles imported semantics without record byte identity", () => {
    const input = new Uint8Array(118);
    input[0] = 0x48;
    input[10] = 0xff;
    input.set([1, 2], 34);
    const imported = parseScenarioBuffers(new Map([["Data TD2", input]])).thiefEncounters[0];

    const output = writeThiefEncounters([{ ...imported, rawBytes: new Array(118).fill(0xa5) }]);

    expect(output).not.toEqual(input);
    expect(output[0]).toBe(1);
    expect(output[10]).toBe(0xff);
    expect(i16(output, 34)).toBe(0x0102);
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeThiefEncounters([{ ...emptyThiefEncounter(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
  });
});

describe("browser timed-encounter writer", () => {
  it("compiles semantic fields and zeroes fresh reserved words", () => {
    const record = {
      ...emptyTimedEncounter(0),
      day: 35,
      increment: 5,
      percent: 50,
      door: 24,
      requiredLevel: 8,
      requiredRandomRect: 17,
      requiredX: 10,
      requiredY: 11,
      requiredItem: 901,
      requiredQuest: 7,
      locationKind: "dungeon" as const,
      reservedWords: new Array(9).fill(0x1234)
    };

    expect(record.rawBytes).toBeUndefined();
    const output = writeTimedEncounters([record]);

    expect(output).toHaveLength(40);
    expect(Array.from({ length: 11 }, (_, slot) => i16(output, slot * 2))).toEqual([35, 5, 50, 24, 8, 17, 10, 11, 901, 7, 2]);
    expect(Array.from(output.slice(22))).toEqual(new Array(18).fill(0));
  });

  it("recompiles imported semantics without record byte identity", () => {
    const input = new Uint8Array(40);
    setI16(input, 0, 12);
    setI16(input, 20, 1);
    setI16(input, 22, 0x1234);
    const imported = parseScenarioBuffers(new Map([["Data TD3", input]])).timedEncounters[0];

    const output = writeTimedEncounters([{ ...imported, rawBytes: new Array(40).fill(0xa5) }]);

    expect(output).not.toEqual(input);
    expect(i16(output, 0)).toBe(12);
    expect(i16(output, 20)).toBe(1);
    expect(i16(output, 22)).toBe(0);
  });

  it("rejects malformed compatibility storage", () => {
    expect(() => writeTimedEncounters([{ ...emptyTimedEncounter(0), rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
  });
});

describe("browser monster writers", () => {
  it("compiles every monster field from semantics without raw identity", () => {
    const parsed = parseScenarioBuffers(new Map([["Data MD", new Uint8Array(210)]])).monsters[0];
    const record = {
      ...parsed,
      rawBytes: undefined,
      authored: true,
      hitDice: 9,
      staminaBonus: 200,
      agility: 201,
      nameId: 6,
      movementMax: 202,
      armor: -4,
      typeFlags: [1, -1, 2, -2, 3, -3, 4, -4],
      attacks: [[1, 2, 3, 4], [-1, -2, -3, -4], [5, 6, 7, 8], [0, 0, 0, 0], [9, 10, 11, 12]],
      money: [100, 200, 300],
      spells: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
      items: [20, 21, 22, 23, 24, 25],
      iconId: -27,
      underneath: [32, 33, 34, 35],
      notOnMenu: true,
      deathMacro: -16,
      maxSpellPoints: 37,
      displayName: "Semantic Beast"
    };

    const expected = writeMonsters([record]);
    const output = writeMonsters([{ ...record, rawBytes: new Array(210).fill(0xa5) }]);

    expect(output).toEqual(expected);
    expect(Array.from(output.slice(0, 10))).toEqual([9, 200, 201, 6, 202, 252, 0, 0, 0, 0]);
    expect(Array.from(output.slice(10, 18))).toEqual([1, 255, 2, 254, 3, 253, 4, 252]);
    expect(i16(output, 58)).toBe(100);
    expect(i16(output, 62)).toBe(300);
    expect(i16(output, 98)).toBe(-27);
    expect(i16(output, 108)).toBe(32);
    expect(output[118]).toBe(1);
    expect(i16(output, 166)).toBe(-16);
    expect(i16(output, 168)).toBe(37);
    expect(new TextDecoder().decode(output.slice(170, 184))).toBe("Semantic Beast");
    expect(Array.from(output.slice(184))).toEqual(new Array(26).fill(0));
  });

  it("compiles description Pascal text and deterministic padding", () => {
    const output = writeMonsterDescriptions([{
      id: 0,
      text: "Canonical description",
      rawBytes: new Array(256).fill(0xa5),
      authored: true
    }]);

    expect(output[0]).toBe(21);
    expect(new TextDecoder().decode(output.slice(1, 22))).toBe("Canonical description");
    expect(Array.from(output.slice(22))).toEqual(new Array(234).fill(0));
  });

  it("rejects malformed compatibility storage and fixed arrays", () => {
    const parsed = parseScenarioBuffers(new Map([["Data MD", new Uint8Array(210)]])).monsters[0];
    expect(() => writeMonsters([{ ...parsed, rawBytes: [1] }]))
      .toThrow("invalid compatibility byte storage");
    expect(() => writeMonsters([{ ...parsed, attacks: [[0, 0, 0]] }]))
      .toThrow("exactly 5 attack rows");
    expect(() => writeMonsterDescriptions([{ id: 0, text: "", rawBytes: [1], authored: true }]))
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
