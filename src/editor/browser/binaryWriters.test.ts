import { describe, expect, it } from "vitest";
import type { RandomLevel, RandomRect } from "../types";
import { writeRandomLevels } from "./binaryWriters";

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

function i16(bytes: Uint8Array, offset: number) {
  const value = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  return value >= 0x8000 ? value - 0x10000 : value;
}
