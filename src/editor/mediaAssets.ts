import { ManagedAsset, ManagedAssetKind } from "./types";

const MAX_IMPORT_BYTES = 32 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 4096 * 4096;

export type MediaAssetImportRequest = {
  label: string;
  kind: ManagedAssetKind;
  resourceType: string;
  resourceId: number;
  mimeType: string;
  originalBase64: string;
  previewBase64: string;
  image: { width: number; height: number; rgbaBase64: string } | null;
  audio: { sampleRate: number; channels: number; durationMs: number | null; pcm8Base64: string } | null;
  linkedEntity: string | null;
};

export async function fileToMediaAssetRequest(file: File, kind: ManagedAssetKind, resourceId: number): Promise<MediaAssetImportRequest> {
  if (file.size > MAX_IMPORT_BYTES) {
    throw new Error(`${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB; asset imports are limited to 32 MB for now.`);
  }
  const original = new Uint8Array(await file.arrayBuffer());
  const label = stripExtension(file.name);
  if (kind === "sound") {
    const decoded = await decodeAudioFile(file);
    return {
      label,
      kind,
      resourceType: "snd ",
      resourceId,
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
      linkedEntity: null
    };
  }

  const decoded = await decodeImageFile(file);
  if (decoded.width * decoded.height > MAX_IMAGE_PIXELS) {
    throw new Error(`${file.name} is ${decoded.width} x ${decoded.height}; images over 16 megapixels are too large for this import path.`);
  }
  const prepared = kind === "special-land-tile" ? resizeDecodedImage(decoded, 32, 32) : decoded;
  const preview = await canvasToPngBytes(prepared.canvas);
  return {
    label,
    kind,
    resourceType: kind === "icon" || kind === "special-land-tile" ? "cicn" : "PICT",
    resourceId,
    mimeType: file.type || "image/png",
    originalBase64: bytesToBase64(original),
    previewBase64: bytesToBase64(preview),
    image: { width: prepared.width, height: prepared.height, rgbaBase64: bytesToBase64(prepared.rgba) },
    audio: null,
    linkedEntity: kind === "special-land-tile" ? `special-land-tile:${resourceId}` : null
  };
}

export function requestToBrowserAsset(request: MediaAssetImportRequest): ManagedAsset {
  const id = `asset:browser:${stableToken(`${request.label}-${Date.now()}`)}`;
  const originalPath = `data:${request.mimeType};base64,${request.originalBase64}`;
  const previewPath = request.kind === "sound"
    ? `data:audio/wav;base64,${request.previewBase64}`
    : `data:image/png;base64,${request.previewBase64}`;
  return {
    id,
    label: request.label,
    kind: request.kind,
    resourceType: request.resourceType,
    resourceId: request.resourceId,
    fileName: request.label,
    originalPath,
    previewPath,
    resourcePath: "",
    mimeType: request.mimeType,
    bytes: Math.floor(request.originalBase64.length * 0.75),
    sha256: "browser-preview",
    width: request.image?.width ?? null,
    height: request.image?.height ?? null,
    durationMs: request.audio?.durationMs ?? null,
    sampleRate: request.audio?.sampleRate ?? null,
    channels: request.audio?.channels ?? null,
    exportState: "preview-only",
    provenance: "browser media import",
    linkedEntity: request.linkedEntity
  };
}

export function requestToBrowserReplacement(request: MediaAssetImportRequest, previous: ManagedAsset): ManagedAsset {
  return {
    ...requestToBrowserAsset(request),
    id: previous.id,
    resourceId: previous.resourceId,
    resourceType: previous.resourceType,
    linkedEntity: previous.linkedEntity,
    provenance: `${previous.provenance}; replaced in browser preview`
  };
}

export function nextResourceId(assets: ManagedAsset[], kind: ManagedAssetKind) {
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
  const base = kind === "sound" ? 200 : kind === "icon" ? 30126 : 32000;
  const used = new Set(assets.filter((asset) => asset.kind === kind).map((asset) => asset.resourceId));
  let id = base;
  while (used.has(id)) id += 1;
  return id;
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

function resizeDecodedImage(decoded: Awaited<ReturnType<typeof decodeImageFile>>, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas resizing is unavailable.");
  context.imageSmoothingEnabled = false;
  context.drawImage(decoded.canvas, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return {
    width,
    height,
    rgba: new Uint8Array(imageData.data.buffer.slice(0)),
    canvas
  };
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
