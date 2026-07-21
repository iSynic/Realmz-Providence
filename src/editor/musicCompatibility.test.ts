import { describe, expect, it } from "vitest";
import {
  LEGACY_OUTDOOR_MUSIC_BYTES,
  LEGACY_OUTDOOR_MUSIC_SHA256,
  legacyOutdoorMusicManagedAsset,
  legacyOutdoorMusicSlot
} from "./musicCompatibility";

describe("legacy Outdoor Music compatibility", () => {
  it("recognizes only the exact known fingerprint in a Classic custom-music slot", () => {
    expect(legacyOutdoorMusicSlot("Custom 2 Music", LEGACY_OUTDOOR_MUSIC_BYTES, LEGACY_OUTDOOR_MUSIC_SHA256)).toBe(2);
    expect(legacyOutdoorMusicSlot("Custom 2 Music", LEGACY_OUTDOOR_MUSIC_BYTES - 1, LEGACY_OUTDOOR_MUSIC_SHA256)).toBeNull();
    expect(legacyOutdoorMusicSlot("Outdoor Music", LEGACY_OUTDOOR_MUSIC_BYTES, LEGACY_OUTDOOR_MUSIC_SHA256)).toBeNull();
  });

  it("projects the replacement as canonical standard MOD scenario music", () => {
    const replacement = new Uint8Array([1, 2, 3, 4]);
    const asset = legacyOutdoorMusicManagedAsset(3, replacement);
    expect(asset.kind).toBe("music");
    expect(asset.resourceType).toBe("MOD ");
    expect(asset.scenarioMusicSlot).toBe(3);
    expect(asset.fileName).toBe("Custom 3 Music");
    expect(asset.originalPath).toBe("data:audio/x-mod;base64,AQIDBA==");
    expect(asset.conversion?.target).toBe("music");
  });
});
