import { describe, expect, it } from "vitest";
import { decodePictPreviewImageForTest } from "./resourcePreview";

describe("browser PICT previews", () => {
  it("decodes QuickDraw packType 3 as 16-bit words", () => {
    const pict = directBits16WordPackBitsFixture();
    const decoded = decodePictPreviewImageForTest(pict);

    expect(decoded.width).toBe(4);
    expect(decoded.height).toBe(1);
    expect(decoded.summary.format).toBe("directbits-16-packbits");
    for (let offset = 0; offset < decoded.rgba.length; offset += 4) {
      expect([...decoded.rgba.slice(offset, offset + 4)]).toEqual([255, 0, 0, 255]);
    }
  });
});

function directBits16WordPackBitsFixture() {
  const bytes: number[] = [];
  pushU16(bytes, 0);
  pushRect(bytes, 0, 0, 1, 4);
  pushU16(bytes, 0x009a);
  pushU32(bytes, 0);
  pushU16(bytes, 0x8008);
  pushRect(bytes, 0, 0, 1, 4);
  pushU16(bytes, 0);
  pushU16(bytes, 3);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushU16(bytes, 16);
  pushU16(bytes, 16);
  pushU16(bytes, 3);
  pushU16(bytes, 5);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushRect(bytes, 0, 0, 1, 4);
  pushRect(bytes, 0, 0, 1, 4);
  pushU16(bytes, 0);
  bytes.push(3, 0xfd);
  pushU16(bytes, 0x7c00);
  pushU16(bytes, 0x00ff);
  return new Uint8Array(bytes);
}

function pushRect(bytes: number[], top: number, left: number, bottom: number, right: number) {
  for (const value of [top, left, bottom, right]) pushU16(bytes, value);
}

function pushU16(bytes: number[], value: number) {
  bytes.push((value >>> 8) & 0xff, value & 0xff);
}

function pushU32(bytes: number[], value: number) {
  bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}
