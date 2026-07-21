import {
  AssetImportTarget,
  DitherMode,
  ImageFitMode,
  ImageMatte,
  ImageScaleMode,
  ManagedAsset,
  ManagedAssetConversion,
  ManagedAssetKind,
  ManagedAssetLibraryScope,
  PaletteMode
} from "./types";
import { inspectStandardMod } from "./standardMod";

export { inspectStandardMod } from "./standardMod";
export type { StandardModInfo } from "./standardMod";

const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 4096 * 4096;

export const SCENARIO_PICTURE_MIN_ID = 30000;
export const SCENARIO_PICTURE_MAX_ID = 30128;
export const SCENARIO_SPLASH_PICTURE_ID = 30128;
export const SCENARIO_DISPLAY_PICTURE_MAX_ID = SCENARIO_SPLASH_PICTURE_ID - 1;

export function isScenarioDisplayPictureId(resourceId: number) {
  return resourceId >= SCENARIO_PICTURE_MIN_ID && resourceId < SCENARIO_SPLASH_PICTURE_ID;
}
export const SCENARIO_SOUND_MIN_ID = 200;
export const SCENARIO_SOUND_MAX_ID = 500;
export const SCENARIO_MUSIC_MIN_SLOT = 1;
export const SCENARIO_MUSIC_MAX_SLOT = 3;

export type MediaAssetImportOptions = {
  target?: AssetImportTarget;
  resourceType?: string;
  fitMode?: ImageFitMode;
  scaleMode?: ImageScaleMode;
  matte?: ImageMatte;
  paletteMode?: PaletteMode;
  ditherMode?: DitherMode;
  linkedEntity?: string | null;
  scenarioMusicSlot?: number | null;
  libraryScope?: ManagedAssetLibraryScope;
};

export type MediaAssetSourceInfo = {
  kind: "image" | "sound" | "music" | "text" | "raw";
  width: number | null;
  height: number | null;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
};

export type MediaAssetImportRequest = {
  label: string;
  kind: ManagedAssetKind;
  resourceType: string;
  resourceId: number;
  scenarioMusicSlot: number | null;
  mimeType: string;
  originalBase64: string;
  previewBase64: string;
  image: { width: number; height: number; rgbaBase64: string } | null;
  audio: { sampleRate: number; channels: number; durationMs: number | null; pcm8Base64: string } | null;
  linkedEntity: string | null;
  target: AssetImportTarget;
  fitMode: ImageFitMode | null;
  scaleMode: ImageScaleMode | null;
  matte: ImageMatte | null;
  paletteMode: PaletteMode | null;
  ditherMode: DitherMode | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  sourceDurationMs: number | null;
  sourceSampleRate: number | null;
  sourceChannels: number | null;
  finalWidth: number | null;
  finalHeight: number | null;
  warnings: string[];
  libraryScope: ManagedAssetLibraryScope;
};

export async function inspectMediaAssetSource(file: File, kind: ManagedAssetKind): Promise<MediaAssetSourceInfo> {
  if (kind === "sound") {
    const decoded = await decodeAudioFile(file);
    return {
      kind: "sound",
      width: null,
      height: null,
      durationMs: decoded.durationMs,
      sampleRate: decoded.sampleRate,
      channels: decoded.sourceChannels
    };
  }
  if (kind === "music") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    inspectStandardMod(bytes);
    return {
      kind: "music",
      width: null,
      height: null,
      durationMs: null,
      sampleRate: null,
      channels: null
    };
  }
  if (kind === "text" || kind === "other") {
    return {
      kind: kind === "text" ? "text" : "raw",
      width: null,
      height: null,
      durationMs: null,
      sampleRate: null,
      channels: null
    };
  }
  const decoded = await decodeImageFile(file);
  return {
    kind: "image",
    width: decoded.width,
    height: decoded.height,
    durationMs: null,
    sampleRate: null,
    channels: null
  };
}

export async function fileToMediaAssetRequest(
  file: File,
  kind: ManagedAssetKind,
  resourceId: number,
  options: MediaAssetImportOptions = {}
): Promise<MediaAssetImportRequest> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB; asset imports are limited to 32 MB for now.`);
  }
  const original = new Uint8Array(await file.arrayBuffer());
  const label = stripExtension(file.name);
  const target = options.target ?? assetTargetForKind(kind);
  const warnings: string[] = [];
  if (kind === "music") {
    const scenarioOwned = options.libraryScope !== "custom-library";
    const slot = scenarioOwned ? options.scenarioMusicSlot ?? resourceId : null;
    if (scenarioOwned && (!Number.isInteger(slot) || (slot ?? 0) < SCENARIO_MUSIC_MIN_SLOT || (slot ?? 0) > SCENARIO_MUSIC_MAX_SLOT)) {
      throw new Error(`Scenario music must use one of the three Classic slots (${SCENARIO_MUSIC_MIN_SLOT}-${SCENARIO_MUSIC_MAX_SLOT}).`);
    }
    inspectStandardMod(original);
    return {
      label,
      kind,
      resourceType: "MOD ",
      resourceId: slot ?? resourceId,
      scenarioMusicSlot: slot,
      mimeType: "audio/x-mod",
      originalBase64: bytesToBase64(original),
      previewBase64: bytesToBase64(original),
      image: null,
      audio: null,
      linkedEntity: slot === null ? null : `scenario-music:${slot}`,
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
      warnings,
      libraryScope: options.libraryScope ?? "scenario"
    };
  }
  if (kind === "text" || kind === "other") {
    const resourceType = normalizeResourceType(options.resourceType ?? resourceTypeForFile(file, kind));
    if (!resourceType.trim()) warnings.push("Resource type is empty; choose a four-character Realmz resource type before export.");
    return {
      label,
      kind,
      resourceType,
      resourceId,
      scenarioMusicSlot: null,
      mimeType: kind === "text" ? file.type || "text/plain" : file.type || "application/octet-stream",
      originalBase64: bytesToBase64(original),
      previewBase64: bytesToBase64(original),
      image: null,
      audio: null,
      linkedEntity: options.linkedEntity ?? null,
      target,
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
      warnings,
      libraryScope: options.libraryScope ?? "scenario"
    };
  }
  if (kind === "sound") {
    const decoded = await decodeAudioFile(file);
    if (decoded.pcm8.length === 0) warnings.push("Audio contains no decoded samples.");
    if ((decoded.durationMs ?? 0) > 30_000) warnings.push("Long sounds may feel slow in Classic Realmz.");
    if (resourceId < SCENARIO_SOUND_MIN_ID || resourceId > SCENARIO_SOUND_MAX_ID) {
      warnings.push(`Custom scenario sounds normally use IDs ${SCENARIO_SOUND_MIN_ID}-${SCENARIO_SOUND_MAX_ID}.`);
    }
    return {
      label,
      kind,
      resourceType: "snd ",
      resourceId,
      scenarioMusicSlot: null,
      mimeType: file.type || "audio/mpeg",
      originalBase64: bytesToBase64(original),
      previewBase64: bytesToBase64(encodeWavU8(decoded.sampleRate, decoded.pcm8)),
      image: null,
      audio: {
        sampleRate: decoded.sampleRate,
        channels: 1,
        durationMs: decoded.durationMs,
        pcm8Base64: bytesToBase64(decoded.pcm8)
      },
      linkedEntity: options.linkedEntity ?? null,
      target,
      fitMode: null,
      scaleMode: null,
      matte: null,
      paletteMode: null,
      ditherMode: null,
      sourceWidth: null,
      sourceHeight: null,
      sourceDurationMs: decoded.durationMs,
      sourceSampleRate: decoded.sampleRate,
      sourceChannels: decoded.sourceChannels,
      finalWidth: null,
      finalHeight: null,
      warnings,
      libraryScope: options.libraryScope ?? "scenario"
    };
  }

  const decoded = await decodeImageFile(file);
  if (decoded.width * decoded.height > MAX_IMAGE_PIXELS) {
    throw new Error(`${file.name} is ${decoded.width} x ${decoded.height}; images over 16 megapixels are too large for this import path.`);
  }
  const imageProfile = normalizeImageOptions(kind, decoded, options);
  const prepared = prepareDecodedImage(decoded, kind, imageProfile);
  if (resourceId === 0) warnings.push("Resource ID 0 is unusual; choose a nonzero ID before export.");
  if (target === "custom-landlook-atlas") {
    if (resourceId < 306 || resourceId > 308) warnings.push("Custom landlook atlases use PICT IDs 306-308.");
  } else if (kind === "picture" && (resourceId < SCENARIO_PICTURE_MIN_ID || resourceId > SCENARIO_PICTURE_MAX_ID)) {
    warnings.push(`Scenario pictures normally use IDs ${SCENARIO_PICTURE_MIN_ID}-${SCENARIO_PICTURE_MAX_ID}.`);
  }
  if (kind === "special-land-tile" && resourceId >= 0) {
    warnings.push("Special Land Tiles should use negative cicn IDs such as -100.");
  }
  if ((kind === "icon" || kind === "special-land-tile") && (prepared.width !== 32 || prepared.height !== 32)) {
    warnings.push("Icon-style Realmz resources must be converted to 32 x 32 pixels.");
  }
  const preview = await canvasToPngBytes(prepared.canvas);
  return {
    label,
    kind,
    resourceType: kind === "icon" || kind === "special-land-tile" ? "cicn" : "PICT",
    resourceId,
    scenarioMusicSlot: null,
    mimeType: file.type || "image/png",
    originalBase64: bytesToBase64(original),
    previewBase64: bytesToBase64(preview),
    image: { width: prepared.width, height: prepared.height, rgbaBase64: bytesToBase64(prepared.rgba) },
    audio: null,
    linkedEntity: options.linkedEntity ?? (kind === "special-land-tile" ? `special-land-tile:${resourceId}` : null),
    target,
    fitMode: imageProfile.fitMode,
    scaleMode: imageProfile.scaleMode,
    matte: imageProfile.matte,
    paletteMode: imageProfile.paletteMode,
    ditherMode: imageProfile.ditherMode,
    sourceWidth: decoded.width,
    sourceHeight: decoded.height,
    sourceDurationMs: null,
    sourceSampleRate: null,
    sourceChannels: null,
    finalWidth: prepared.width,
    finalHeight: prepared.height,
    warnings,
    libraryScope: options.libraryScope ?? "scenario"
  };
}

export function requestToBrowserAsset(request: MediaAssetImportRequest): ManagedAsset {
  const id = `asset:browser:${stableToken(`${request.label}-${Date.now()}`)}`;
  const originalPath = `data:${request.mimeType};base64,${request.originalBase64}`;
  const previewPath = previewDataUrlForRequest(request);
  return {
    id,
    label: request.label,
    kind: request.kind,
    resourceType: request.resourceType,
    resourceId: request.resourceId,
    scenarioMusicSlot: request.scenarioMusicSlot ?? undefined,
    fileName: request.kind === "music" && request.scenarioMusicSlot ? `Custom ${request.scenarioMusicSlot} Music` : request.kind === "music" ? `${request.label}.mod` : request.label,
    originalPath,
    previewPath,
    resourcePath: request.kind === "music" ? originalPath : "",
    mimeType: request.mimeType,
    bytes: Math.floor(request.originalBase64.length * 0.75),
    sha256: "browser-preview",
    width: request.image?.width ?? null,
    height: request.image?.height ?? null,
    durationMs: request.audio?.durationMs ?? null,
    sampleRate: request.audio?.sampleRate ?? null,
    channels: request.audio?.channels ?? null,
    exportState: request.kind === "music" ? "ready" : "preview-only",
    libraryScope: request.libraryScope,
    provenance: "browser media import",
    linkedEntity: request.linkedEntity,
    conversion: requestToConversion(request)
  };
}

export function requestToBrowserReplacement(request: MediaAssetImportRequest, previous: ManagedAsset): ManagedAsset {
  return {
    ...requestToBrowserAsset(request),
    id: previous.id,
    resourceId: previous.resourceId,
    resourceType: previous.resourceType,
    linkedEntity: previous.linkedEntity,
    libraryScope: previous.libraryScope,
    provenance: `${previous.provenance}; replaced in browser preview`
  };
}

export function assetTargetForKind(kind: ManagedAssetKind): AssetImportTarget {
  if (kind === "special-land-tile") return "special-land-tile";
  if (kind === "icon") return "icon";
  if (kind === "sound") return "sound";
  if (kind === "music") return "music";
  if (kind === "text") return "text";
  if (kind === "other") return "raw-resource";
  return "scenario-picture";
}

export function nextResourceId(assets: Array<Pick<ManagedAsset, "kind" | "resourceType" | "resourceId">>, kind: ManagedAssetKind) {
  if (kind === "special-land-tile") {
    const used = new Set(
      assets
        .filter((asset) => asset.kind === "special-land-tile" || (asset.resourceType === "cicn" && asset.resourceId < 0))
        .map((asset) => asset.resourceId)
    );
    let id = -100;
    while (used.has(id)) id -= 1;
    return id;
  }
  if (kind === "picture") {
    const used = new Set(assets.filter((asset) => asset.kind === kind).map((asset) => asset.resourceId));
    for (let id = SCENARIO_PICTURE_MIN_ID; id <= SCENARIO_DISPLAY_PICTURE_MAX_ID; id += 1) {
      if (!used.has(id)) return id;
    }
    let provisionalId = SCENARIO_SPLASH_PICTURE_ID + 1;
    while (used.has(provisionalId)) provisionalId += 1;
    return provisionalId;
  }
  if (kind === "sound") {
    return nextIdInRange(assets, kind, SCENARIO_SOUND_MIN_ID, SCENARIO_SOUND_MAX_ID);
  }
  if (kind === "music") {
    return nextIdInRange(assets, kind, SCENARIO_MUSIC_MIN_SLOT, 32767);
  }
  if (kind === "text") {
    const used = new Set(assets.filter((asset) => asset.kind === "text").map((asset) => asset.resourceId));
    let id = -200;
    while (used.has(id)) id -= 1;
    return id;
  }
  const base = kind === "icon" ? 30126 : SCENARIO_PICTURE_MIN_ID;
  const used = new Set(assets.filter((asset) => asset.kind === kind).map((asset) => asset.resourceId));
  let id = base;
  while (used.has(id)) id += 1;
  return id;
}

export function nextScenarioResourceIdInRange(
  assets: Array<Pick<ManagedAsset, "kind" | "resourceType" | "resourceId">>,
  kind: ManagedAssetKind
) {
  if (kind === "picture") {
    return nextIdInRangeOrThrow(assets, kind, SCENARIO_PICTURE_MIN_ID, SCENARIO_DISPLAY_PICTURE_MAX_ID, "scenario picture");
  }
  if (kind === "sound") {
    return nextIdInRangeOrThrow(assets, kind, SCENARIO_SOUND_MIN_ID, SCENARIO_SOUND_MAX_ID, "scenario sound");
  }
  if (kind === "music") {
    return nextIdInRangeOrThrow(assets, kind, SCENARIO_MUSIC_MIN_SLOT, SCENARIO_MUSIC_MAX_SLOT, "scenario music");
  }
  return nextResourceId(assets, kind);
}

function nextIdInRange(assets: Array<Pick<ManagedAsset, "kind" | "resourceType" | "resourceId">>, kind: ManagedAssetKind, min: number, max: number) {
  const used = new Set(assets.filter((asset) => asset.kind === kind).map((asset) => asset.resourceId));
  for (let id = min; id <= max; id += 1) {
    if (!used.has(id)) return id;
  }
  let fallback = max + 1;
  while (used.has(fallback)) fallback += 1;
  return fallback;
}

function nextIdInRangeOrThrow(
  assets: Array<Pick<ManagedAsset, "kind" | "resourceType" | "resourceId">>,
  kind: ManagedAssetKind,
  min: number,
  max: number,
  label: string
) {
  const used = new Set(assets.filter((asset) => asset.kind === kind).map((asset) => asset.resourceId));
  for (let id = min; id <= max; id += 1) {
    if (!used.has(id)) return id;
  }
  throw new Error(`No unused ${label} resource ID remains in the valid ${min}-${max} range.`);
}

function requestToConversion(request: MediaAssetImportRequest): ManagedAssetConversion {
  return {
    target: request.target,
    fitMode: request.fitMode,
    scaleMode: request.scaleMode,
    matte: request.matte,
    paletteMode: request.paletteMode,
    ditherMode: request.ditherMode,
    sourceWidth: request.sourceWidth,
    sourceHeight: request.sourceHeight,
    sourceDurationMs: request.sourceDurationMs,
    sourceSampleRate: request.sourceSampleRate,
    sourceChannels: request.sourceChannels,
    finalWidth: request.finalWidth,
    finalHeight: request.finalHeight,
    warnings: request.warnings
  };
}

function previewDataUrlForRequest(request: MediaAssetImportRequest) {
  if (request.kind === "sound") return `data:audio/wav;base64,${request.previewBase64}`;
  if (request.kind === "music") return `data:audio/x-mod;base64,${request.previewBase64}`;
  if (request.kind === "text") return `data:text/plain;base64,${request.previewBase64}`;
  if (request.kind === "other") return `data:application/octet-stream;base64,${request.previewBase64}`;
  return `data:image/png;base64,${request.previewBase64}`;
}

function resourceTypeForFile(file: File, kind: ManagedAssetKind) {
  if (kind === "text") {
    if (/\.styl$/i.test(file.name)) return "styl";
    if (/\.str#?$/i.test(file.name)) return "STR#";
    return "TEXT";
  }
  const match = file.name.match(/\.([A-Za-z0-9 #]{1,4})$/);
  return match ? match[1] : "Rsrc";
}

function normalizeResourceType(value: string) {
  return value.slice(0, 4) || "Rsrc";
}

function normalizeImageOptions(
  kind: ManagedAssetKind,
  decoded: Awaited<ReturnType<typeof decodeImageFile>>,
  options: MediaAssetImportOptions
) {
  const fixedSize = kind === "icon" || kind === "special-land-tile" || options.target === "custom-landlook-atlas";
  const alreadySmall = decoded.width <= 64 && decoded.height <= 64;
  const scaleMode = options.scaleMode ?? (fixedSize && alreadySmall ? "crisp" : "smooth");
  return {
    target: options.target ?? assetTargetForKind(kind),
    fitMode: fixedSize ? options.fitMode ?? "fit" : null,
    scaleMode,
    matte: options.matte ?? (kind === "picture" ? "white" : "transparent"),
    paletteMode: "adaptive-256" as PaletteMode,
    ditherMode: options.ditherMode ?? (kind === "picture" ? "floyd-steinberg" : "none")
  };
}

function prepareDecodedImage(
  decoded: Awaited<ReturnType<typeof decodeImageFile>>,
  kind: ManagedAssetKind,
  profile: ReturnType<typeof normalizeImageOptions>
) {
  const atlasSize = profile.target === "custom-landlook-atlas";
  const fixedSize = kind === "icon" || kind === "special-land-tile" || atlasSize;
  const width = atlasSize ? 640 : fixedSize ? 32 : decoded.width;
  const height = atlasSize ? 320 : fixedSize ? 32 : decoded.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas conversion is unavailable.");
  context.imageSmoothingEnabled = profile.scaleMode === "smooth";
  context.imageSmoothingQuality = profile.scaleMode === "smooth" ? "high" : "low";
  if (profile.matte !== "transparent") {
    context.fillStyle = profile.matte;
    context.fillRect(0, 0, width, height);
  } else {
    context.clearRect(0, 0, width, height);
  }
  if (!fixedSize) {
    context.drawImage(decoded.canvas, 0, 0);
  } else if (profile.fitMode === "stretch") {
    context.drawImage(decoded.canvas, 0, 0, width, height);
  } else if (profile.fitMode === "crop") {
    const sourceRatio = decoded.width / decoded.height;
    const targetRatio = width / height;
    let sx = 0;
    let sy = 0;
    let sw = decoded.width;
    let sh = decoded.height;
    if (sourceRatio > targetRatio) {
      sw = decoded.height * targetRatio;
      sx = (decoded.width - sw) / 2;
    } else {
      sh = decoded.width / targetRatio;
      sy = (decoded.height - sh) / 2;
    }
    context.drawImage(decoded.canvas, sx, sy, sw, sh, 0, 0, width, height);
  } else {
    const scale = Math.min(width / decoded.width, height / decoded.height);
    const dw = Math.max(1, Math.round(decoded.width * scale));
    const dh = Math.max(1, Math.round(decoded.height * scale));
    const dx = Math.floor((width - dw) / 2);
    const dy = Math.floor((height - dh) / 2);
    context.drawImage(decoded.canvas, dx, dy, dw, dh);
  }
  const imageData = context.getImageData(0, 0, width, height);
  if (kind === "picture" && profile.matte !== "transparent") {
    for (let offset = 3; offset < imageData.data.length; offset += 4) imageData.data[offset] = 255;
  }
  return {
    width,
    height,
    rgba: new Uint8Array(imageData.data.buffer.slice(0)),
    canvas
  };
}

async function decodeImageFile(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`Unable to decode ${file.name}`));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas decoding is unavailable.");
    context.drawImage(image, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      width: canvas.width,
      height: canvas.height,
      rgba: new Uint8Array(imageData.data.buffer.slice(0)),
      canvas
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decodeAudioFile(file: File) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error("Browser audio decoding is unavailable.");
  const context = new AudioContextCtor();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const frames = buffer.length;
    const pcm8 = new Uint8Array(frames);
    for (let frame = 0; frame < frames; frame += 1) {
      let value = 0;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        value += buffer.getChannelData(channel)[frame] ?? 0;
      }
      value /= Math.max(1, buffer.numberOfChannels);
      pcm8[frame] = Math.max(0, Math.min(255, Math.round((value * 0.5 + 0.5) * 255)));
    }
    return {
      sampleRate: Math.round(buffer.sampleRate),
      sourceChannels: buffer.numberOfChannels,
      durationMs: Math.round(buffer.duration * 1000),
      pcm8
    };
  } finally {
    await context.close();
  }
}

async function canvasToPngBytes(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Unable to encode PNG preview.")), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function encodeWavU8(sampleRate: number, samples: Uint8Array) {
  const output = new Uint8Array(44 + samples.length);
  const view = new DataView(output.buffer);
  writeAscii(output, 0, "RIFF");
  view.setUint32(4, 36 + samples.length, true);
  writeAscii(output, 8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(output, 36, "data");
  view.setUint32(40, samples.length, true);
  output.set(samples, 44);
  return output;
}

function writeAscii(output: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    output[offset + index] = value.charCodeAt(index);
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, "") || name;
}

function stableToken(value: string) {
  return value.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "asset";
}
