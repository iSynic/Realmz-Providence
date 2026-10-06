import { describe, expect, it } from "vitest";
import {
  COMPRESSED_QUICKTIME,
  decodeQuickTimeImage,
  parsePictQuickTimeRecord,
  type PictQuickTimeRecord
} from "./pictQuickTime";

describe("QuickTime Animation PICT decoding", () => {
  it("decodes an 8-bit literal group with the default Macintosh palette", () => {
    const record = {
      kind: "compressed",
      opcode: COMPRESSED_QUICKTIME,
      opcodeOffset: 10,
      recordEnd: 23,
      codec: "rle ",
      mediaType: "video/quicktime-rle",
      width: 4,
      height: 1,
      depth: 8,
      frameCount: 1,
      matteBytes: 0,
      clutId: 8,
      palette: defaultPaletteFromParsedRecord(),
      encoded: Uint8Array.from([
        0, 0, 0, 13,
        0, 0,
        1,
        1, 0, 1, 2, 255,
        255
      ])
    } satisfies Extract<PictQuickTimeRecord, { kind: "compressed" }>;

    const image = decodeQuickTimeImage(record);

    expect(image.width).toBe(4);
    expect(image.height).toBe(1);
    expect([...image.rgba]).toEqual([
      255, 255, 255, 255,
      255, 255, 204, 255,
      255, 255, 153, 255,
      0, 0, 0, 255
    ]);
  });
});

function defaultPaletteFromParsedRecord() {
  const descriptionStart = 2 + 72;
  const description = new Uint8Array(86);
  writeU32(description, 0, 86);
  description.set(new TextEncoder().encode("rle "), 4);
  writeU16(description, 32, 4);
  writeU16(description, 34, 1);
  writeU32(description, 44, 13);
  writeU16(description, 48, 1);
  writeU16(description, 82, 8);
  writeU16(description, 84, 8);
  const declaredBytes = 68 + description.byteLength + 13;
  const data = new Uint8Array(2 + 4 + declaredBytes);
  writeU32(data, 2, declaredBytes);
  data.set(description, descriptionStart);
  const parsed = parsePictQuickTimeRecord(data, 0, COMPRESSED_QUICKTIME, 2);
  if (parsed.kind !== "compressed") throw new Error("expected compressed QuickTime record");
  return parsed.palette;
}

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
