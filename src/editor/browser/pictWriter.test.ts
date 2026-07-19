import { describe, expect, it } from "vitest";
import { decodePictPreviewImageForTest } from "./resourcePreview";
import { encodePictResource, isNormalizedLandlookAtlasPict } from "../pictWriter";

describe("normalized PICT writer", () => {
  it("encodes a deterministic 640 x 320 custom-landlook atlas", () => {
    const rgba = customAtlasPixels();

    const first = encodePictResource(rgba, 640, 320);
    const second = encodePictResource(rgba, 640, 320);
    const decoded = decodePictPreviewImageForTest(first);

    expect(first).toEqual(second);
    expect(isNormalizedLandlookAtlasPict(first)).toBe(true);
    expect(first.slice(2, 10)).toEqual(Uint8Array.from([0, 0, 0, 0, 1, 64, 2, 128]));
    expect(first.slice(10, 12)).toEqual(Uint8Array.from([0, 0x98]));
    expect(decoded.width).toBe(640);
    expect(decoded.height).toBe(320);
    expect(decoded.summary).toMatchObject({
      frameTop: "0",
      frameLeft: "0",
      frameBottom: "320",
      frameRight: "640",
      format: "packbits-indexed-8"
    });
    expect([...decoded.rgba.slice(0, 3)]).toEqual([0, 0, 0]);
    const tile200Pixel = ((9 * 32) * 640 + 19 * 32) * 4;
    expect([...decoded.rgba.slice(tile200Pixel, tile200Pixel + 3)]).not.toEqual([0, 0, 0]);
  });

  it("rejects mismatched pixel storage", () => {
    expect(() => encodePictResource(new Uint8Array(4), 2, 2)).toThrow(/expected 16/);
    expect(isNormalizedLandlookAtlasPict(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
  });
});

function customAtlasPixels() {
  const rgba = new Uint8Array(640 * 320 * 4);
  for (let y = 0; y < 320; y += 1) {
    for (let x = 0; x < 640; x += 1) {
      const tile = Math.floor(y / 32) * 20 + Math.floor(x / 32);
      const offset = (y * 640 + x) * 4;
      rgba[offset] = (tile * 40) & 0xf8;
      rgba[offset + 1] = (tile * 72) & 0xf8;
      rgba[offset + 2] = (tile * 104) & 0xf8;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}
