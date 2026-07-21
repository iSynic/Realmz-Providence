import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "./types";
import { authoringLibraryCollection } from "./assetLibraryClassification";

function asset(overrides: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    id: "asset",
    type: "icon",
    label: "Asset",
    source: "library-source:realmz:family-jewels",
    relativePath: "The Family Jewels.rsrc#cicn:398",
    bytes: 128,
    sha256: "0".repeat(64),
    resourceType: "cicn",
    resourceId: 398,
    ...overrides
  };
}

describe("authoringLibraryCollection", () => {
  it("places Realmz stock icons and sounds in the Realmz Gallery", () => {
    expect(authoringLibraryCollection(asset())).toBe("realmz-gallery");
    expect(authoringLibraryCollection(asset({ type: "sound", resourceType: "snd ", resourceId: 619 }))).toBe("realmz-gallery");
  });

  it("places Divinity data icons in the protected built-in Custom Library", () => {
    expect(authoringLibraryCollection(asset({
      source: "library-source:divinity:monster-mash",
      relativePath: "Divinity Data\\Monster Mash.rsrc#cicn:398"
    }))).toBe("built-in-custom");
    expect(authoringLibraryCollection(asset({
      source: "library-source:divinity:vault-of-arcana",
      relativePath: "Divinity Data\\Vault of Arcana.rsrc#cicn:30118",
      resourceId: 30118
    }))).toBe("built-in-custom");
  });

  it("excludes Divinity UI icon ranges and application resources", () => {
    expect(authoringLibraryCollection(asset({
      source: "library-source:divinity:bag-of-holding",
      relativePath: "Divinity Data\\Bag of Holding.rsrc#cicn:10000",
      resourceId: 10000
    }))).toBe("excluded");
    expect(authoringLibraryCollection(asset({
      source: "library-source:divinity:divinity",
      relativePath: "Divinity.rsrc#cicn:128",
      resourceId: 128
    }))).toBe("excluded");
  });

  it("excludes pictures, text, and the Divinity editor click sound", () => {
    expect(authoringLibraryCollection(asset({ type: "picture", resourceType: "PICT" }))).toBe("excluded");
    expect(authoringLibraryCollection(asset({ type: "text", resourceType: "TEXT" }))).toBe("excluded");
    expect(authoringLibraryCollection(asset({
      type: "sound",
      resourceType: "snd ",
      source: "library-source:divinity:coder",
      relativePath: "Divinity Coder 7.0.9.rsrc#snd :141"
    }))).toBe("excluded");
  });

  it("keeps special land tiles in the Realmz Gallery", () => {
    expect(authoringLibraryCollection(asset({
      source: "library-source:divinity:land-archive",
      relativePath: "Divinity Data\\Land Archive\\Tiles.rsrc#cicn:200",
      type: "special-land-tile",
      resourceId: 200
    }))).toBe("realmz-gallery");
  });

  it("keeps Providence's bundled standard MOD in the built-in Custom Library", () => {
    expect(authoringLibraryCollection(asset({
      type: "music",
      source: "library-source:providence:outdoor-music-mod",
      relativePath: "Outdoor Music.mod",
      resourceType: "MOD ",
      resourceId: null
    }))).toBe("built-in-custom");
  });
});
