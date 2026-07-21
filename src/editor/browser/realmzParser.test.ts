import { describe, expect, it } from "vitest";
import {
  CUSTOM_LANDLOOK_METADATA_BYTES,
  MAPSTATS_RECORD_BYTES,
  MAPSTATS_RECORDS,
  writeCustomLandlookMetadata
} from "./binaryWriters";
import { parseCustomLandlookMetadata } from "./realmzParser";

function writeI16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}

function readI16(bytes: Uint8Array, offset: number) {
  const value = (bytes[offset] << 8) | bytes[offset + 1];
  return value >= 0x8000 ? value - 0x10000 : value;
}

describe("custom landlook browser import", () => {
  it("recovers semantic metadata without embedding source identity", () => {
    const source = new Uint8Array(CUSTOM_LANDLOOK_METADATA_BYTES + 3);
    const tileOffset = 5 * MAPSTATS_RECORD_BYTES;
    writeI16(source, tileOffset, 321);
    writeI16(source, tileOffset + 2, 2);
    writeI16(source, tileOffset + 18, 0x1234);
    const baseOffset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
    writeI16(source, baseOffset, 156);
    writeI16(source, baseOffset + 2, 1);
    writeI16(source, baseOffset + 4, 62);
    writeI16(source, baseOffset + 6, 85);
    writeI16(source, baseOffset + 8, 0x2345);
    source.set([0xca, 0xfe, 0x01], CUSTOM_LANDLOOK_METADATA_BYTES);

    const metadata = parseCustomLandlookMetadata(source, 6, "Data Custom 1 BD");

    expect(metadata).not.toBeNull();
    expect(metadata?.records).toHaveLength(201);
    expect(metadata?.rangeSlots).toHaveLength(10);
    expect(metadata?.records[5]).toMatchObject({ sound: 321, time: 2 });
    expect("spare" in metadata!.records[5]).toBe(false);
    expect(metadata?.rangeSlots[0]).toMatchObject({ firstTile: 62, lastTile: 85 });
    expect("reserved" in metadata!.rangeSlots[0]).toBe(false);
    expect("trailingBytes" in metadata!).toBe(false);
    expect("rawBytes" in metadata!).toBe(false);

    const output = writeCustomLandlookMetadata(metadata!);

    expect(output).toHaveLength(CUSTOM_LANDLOOK_METADATA_BYTES);
    expect(readI16(output, tileOffset)).toBe(321);
    expect(readI16(output, tileOffset + 2)).toBe(2);
    expect(readI16(output, tileOffset + 18)).toBe(0);
    expect(readI16(output, baseOffset + 8)).toBe(0);
  });
});
