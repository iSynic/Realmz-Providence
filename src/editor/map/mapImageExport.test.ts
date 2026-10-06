import { describe, expect, it } from "vitest";
import {
  currentMapPixelSize,
  encodeMapCanvasJpeg,
  MAP_EXPORT_JPEG_QUALITY,
  mapExportDimensions,
  mapExportFileName,
  nativeMapPixelSize
} from "./mapImageExport";
import type { MapEntity, TilesetAsset } from "../types";

describe("map image export", () => {
  it("uses the authored tile size for native land and dungeon exports", () => {
    expect(nativeMapPixelSize(tileset(32))).toBe(2880);
    expect(nativeMapPixelSize(tileset(16))).toBe(1440);
  });

  it("uses the current editor zoom for scenario-wide exports", () => {
    expect(currentMapPixelSize(0.25)).toBe(225);
    expect(currentMapPixelSize(1)).toBe(900);
    expect(currentMapPixelSize(2.5)).toBe(2250);
  });

  it("adds one tile of coordinate gutter around the full map", () => {
    expect(mapExportDimensions(900, false)).toEqual({
      mapSize: 900,
      cell: 10,
      gutter: 0,
      width: 900,
      height: 900
    });
    expect(mapExportDimensions(2880, true)).toEqual({
      mapSize: 2880,
      cell: 32,
      gutter: 32,
      width: 2944,
      height: 2944
    });
  });

  it("produces stable map file names", () => {
    expect(mapExportFileName(map("land", 3, "The Dragon's Teeth / West"))).toBe("land-03-the-dragon-s-teeth-west.jpg");
  });

  it("encodes JPEGs at quality 7", async () => {
    const expected = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
    let requestedType = "";
    let requestedQuality = 0;
    const canvas = {
      toBlob(callback: BlobCallback, type?: string, quality?: number) {
        requestedType = type ?? "";
        requestedQuality = quality ?? 0;
        callback(expected);
      }
    } as HTMLCanvasElement;

    await expect(encodeMapCanvasJpeg(canvas)).resolves.toBe(expected);
    expect(requestedType).toBe("image/jpeg");
    expect(requestedQuality).toBe(MAP_EXPORT_JPEG_QUALITY);
    expect(MAP_EXPORT_JPEG_QUALITY).toBe(0.7);
  });
});

function tileset(tileWidth: number) {
  return { tileWidth } as TilesetAsset;
}

function map(levelType: MapEntity["levelType"], index: number, name: string) {
  return { levelType, index, name } as MapEntity;
}
