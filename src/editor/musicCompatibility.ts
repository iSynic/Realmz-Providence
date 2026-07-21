import type { ManagedAsset } from "./types";

export const LEGACY_OUTDOOR_MUSIC_BYTES = 60_224;
export const LEGACY_OUTDOOR_MUSIC_MD5 = "1A2E7CC637BCF082D21204E2DA1028B2";
export const LEGACY_OUTDOOR_MUSIC_SHA256 = "0ba9022f65d5cee0b57103c64264fc64f8fb0f84d63cf70445f2747ead9f2471";
export const OUTDOOR_MUSIC_REPLACEMENT_SHA256 = "f34da5b612972af0d6da8c000a1edc494a87b0c7aee627494a8d87f12132143f";
export const OUTDOOR_MUSIC_REPLACEMENT_BYTES = 62_054;
export const OUTDOOR_MUSIC_REPLACEMENT_PATH = "/bundled-libraries/providence/Outdoor%20Music.mod";

export function legacyOutdoorMusicSlot(name: string, bytes: number, sha256: string) {
  const match = /^Custom ([1-3]) Music$/i.exec(name.trim());
  if (!match || bytes !== LEGACY_OUTDOOR_MUSIC_BYTES || sha256.toLowerCase() !== LEGACY_OUTDOOR_MUSIC_SHA256) return null;
  return Number(match[1]);
}

export async function loadOutdoorMusicReplacement() {
  const response = await fetch(OUTDOOR_MUSIC_REPLACEMENT_PATH);
  if (!response.ok) throw new Error(`Bundled Outdoor Music replacement was not found (${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== OUTDOOR_MUSIC_REPLACEMENT_BYTES) {
    throw new Error(`Bundled Outdoor Music replacement has ${bytes.byteLength} bytes; expected ${OUTDOOR_MUSIC_REPLACEMENT_BYTES}.`);
  }
  if (!await isOutdoorMusicReplacement(bytes)) {
    throw new Error("Bundled Outdoor Music replacement failed its immutable SHA-256 check.");
  }
  return bytes;
}

export async function isOutdoorMusicReplacement(bytes: Uint8Array) {
  if (bytes.byteLength !== OUTDOOR_MUSIC_REPLACEMENT_BYTES) return false;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("") === OUTDOOR_MUSIC_REPLACEMENT_SHA256;
}

export function legacyOutdoorMusicManagedAsset(slot: number, replacement: Uint8Array): ManagedAsset {
  const payload = `data:audio/x-mod;base64,${bytesToBase64(replacement)}`;
  return {
    id: `asset:legacy-outdoor-music:${slot}`,
    label: "Outdoor Music",
    kind: "music",
    resourceType: "MOD ",
    resourceId: slot,
    scenarioMusicSlot: slot,
    fileName: `Custom ${slot} Music`,
    originalPath: payload,
    previewPath: payload,
    resourcePath: payload,
    mimeType: "audio/x-mod",
    bytes: replacement.byteLength,
    sha256: OUTDOOR_MUSIC_REPLACEMENT_SHA256,
    width: null,
    height: null,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    libraryScope: "scenario",
    provenance: `legacy Outdoor Music compatibility alias (source ${LEGACY_OUTDOOR_MUSIC_BYTES} bytes, MD5 ${LEGACY_OUTDOOR_MUSIC_MD5})`,
    linkedEntity: `scenario-music:${slot}`,
    conversion: {
      target: "music",
      fitMode: null,
      scaleMode: null,
      matte: null,
      paletteMode: null,
      ditherMode: null,
      sourceWidth: null,
      sourceHeight: null,
      sourceDurationMs: null,
      sourceSampleRate: null,
      sourceChannels: null,
      finalWidth: null,
      finalHeight: null,
      warnings: ["The imported legacy MADG payload matched Realmz's known Outdoor Music fingerprint and was replaced with the bundled standard MOD compatibility version."]
    }
  };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
