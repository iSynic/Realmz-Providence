import { GifReader } from "omggif";
import type { ResourcePreviewStatus } from "../types";

export const COMPRESSED_QUICKTIME = 0x8200;
export const UNCOMPRESSED_QUICKTIME = 0x8201;

const COMPRESSED_HEADER_BYTES = 72;
const UNCOMPRESSED_HEADER_BYTES = 54;
const IMAGE_DESCRIPTION_BYTES = 86;
const MAX_EMBEDDED_IMAGE_SIDE = 2048;

export type PictQuickTimeRecord =
  | {
      kind: "compressed";
      opcode: number;
      opcodeOffset: number;
      recordEnd: number;
      codec: string;
      mediaType: string | null;
      width: number;
      height: number;
      frameCount: number;
      matteBytes: number;
      clutId: number;
      encoded: Uint8Array;
    }
  | {
      kind: "uncompressed";
      opcode: number;
      opcodeOffset: number;
      recordEnd: number;
      matteBytes: number;
      copyBitsOpcode: number;
      copyBitsOffset: number;
    };

export class PictQuickTimeError extends Error {
  readonly status: ResourcePreviewStatus;
  readonly code: string;
  readonly offset: number;
  readonly opcode: number;
  readonly variant?: string;
  readonly hint?: string;

  constructor(options: {
    status: ResourcePreviewStatus;
    code: string;
    message: string;
    offset: number;
    opcode: number;
    variant?: string;
    hint?: string;
  }) {
    super(options.message);
    this.name = "PictQuickTimeError";
    this.status = options.status;
    this.code = options.code;
    this.offset = options.offset;
    this.opcode = options.opcode;
    this.variant = options.variant;
    this.hint = options.hint;
  }
}

export function parsePictQuickTimeRecord(
  data: Uint8Array,
  opcodeOffset: number,
  opcode: number,
  opcodeBytes = 2
): PictQuickTimeRecord {
  if (opcode !== COMPRESSED_QUICKTIME && opcode !== UNCOMPRESSED_QUICKTIME) {
    throw malformed("pict.quicktime_opcode_invalid", "PICT QuickTime parser received a non-QuickTime opcode.", opcodeOffset, opcode);
  }
  const payload = opcodeOffset + opcodeBytes;
  const declaredBytes = readU32(data, payload, opcodeOffset, opcode, "QuickTime record length");
  const recordEnd = requireRange(data, payload, 4 + declaredBytes, opcodeOffset, opcode, "QuickTime record");
  const headerBytes = opcode === COMPRESSED_QUICKTIME ? COMPRESSED_HEADER_BYTES : UNCOMPRESSED_HEADER_BYTES;
  requireWithinRecord(data, payload, headerBytes, recordEnd, opcodeOffset, opcode, "QuickTime header");
  const matteBytes = readU32(data, payload + 42, opcodeOffset, opcode, "QuickTime matte length");
  let cursor = payload + headerBytes;
  if (matteBytes > 0) {
    cursor = align2(requireWithinRecord(data, cursor, matteBytes, recordEnd, opcodeOffset, opcode, "QuickTime matte data"));
    if (cursor > recordEnd) {
      throw malformed("pict.quicktime_matte_truncated", "PICT QuickTime matte padding extends beyond the record.", opcodeOffset, opcode);
    }
  }

  if (opcode === UNCOMPRESSED_QUICKTIME) {
    requireWithinRecord(data, cursor, 2, recordEnd, opcodeOffset, opcode, "QuickTime CopyBits opcode");
    const copyBitsOpcode = u16At(data, cursor);
    if (copyBitsOpcode === null || ![0x0098, 0x0099, 0x009a, 0x009b].includes(copyBitsOpcode)) {
      throw unsupported(
        "pict.quicktime_uncompressed_subopcode",
        "PICT uncompressed QuickTime data does not contain a supported CopyBits opcode.",
        opcodeOffset,
        opcode,
        copyBitsOpcode === null ? "missing-copybits" : formatOpcode(copyBitsOpcode)
      );
    }
    return {
      kind: "uncompressed",
      opcode,
      opcodeOffset,
      recordEnd,
      matteBytes,
      copyBitsOpcode,
      copyBitsOffset: cursor
    };
  }

  const maskRegionBytes = readU32(data, payload + 68, opcodeOffset, opcode, "QuickTime mask-region length");
  if (maskRegionBytes > 0) {
    throw unsupported(
      "pict.quicktime_mask_region",
      "PICT compressed QuickTime data includes a mask region that cannot yet be composited safely.",
      opcodeOffset,
      opcode,
      "mask-region"
    );
  }

  const descriptionStart = cursor;
  const descriptionBytes = readU32(data, descriptionStart, opcodeOffset, opcode, "QuickTime image-description length");
  if (descriptionBytes < IMAGE_DESCRIPTION_BYTES) {
    throw malformed(
      "pict.quicktime_description_size",
      `PICT QuickTime image description is only ${descriptionBytes} bytes.`,
      opcodeOffset,
      opcode
    );
  }
  const descriptionEnd = requireWithinRecord(
    data,
    descriptionStart,
    descriptionBytes,
    recordEnd,
    opcodeOffset,
    opcode,
    "QuickTime image description"
  );
  const codec = asciiAt(data, descriptionStart + 4, 4, opcodeOffset, opcode);
  const width = readU16(data, descriptionStart + 32, opcodeOffset, opcode, "QuickTime image width");
  const height = readU16(data, descriptionStart + 34, opcodeOffset, opcode, "QuickTime image height");
  const encodedBytes = readU32(data, descriptionStart + 44, opcodeOffset, opcode, "QuickTime encoded-image length");
  const frameCount = readU16(data, descriptionStart + 48, opcodeOffset, opcode, "QuickTime frame count");
  const clutId = readU16(data, descriptionStart + 84, opcodeOffset, opcode, "QuickTime color-table ID");
  if (width === 0 || height === 0 || width > MAX_EMBEDDED_IMAGE_SIDE || height > MAX_EMBEDDED_IMAGE_SIDE) {
    throw unsupported(
      "pict.quicktime_dimensions",
      `PICT QuickTime image declares unsupported dimensions ${width} x ${height}.`,
      opcodeOffset,
      opcode,
      `${width}x${height}`
    );
  }
  if (frameCount !== 1) {
    throw unsupported(
      "pict.quicktime_frame_count",
      `PICT QuickTime image declares ${frameCount} frames; Providence requires one still frame.`,
      opcodeOffset,
      opcode,
      `frames-${frameCount}`
    );
  }

  cursor = requireWithinRecord(
    data,
    descriptionStart,
    IMAGE_DESCRIPTION_BYTES,
    descriptionEnd,
    opcodeOffset,
    opcode,
    "QuickTime fixed image description"
  );
  if (clutId === 0) {
    requireWithinRecord(data, cursor, 8, descriptionEnd, opcodeOffset, opcode, "QuickTime color-table header");
    const lastColorIndex = readU16(data, cursor + 6, opcodeOffset, opcode, "QuickTime color-table size");
    const colorCount = lastColorIndex === 0xffff ? 0 : lastColorIndex + 1;
    cursor = requireWithinRecord(
      data,
      cursor,
      8 + colorCount * 8,
      descriptionEnd,
      opcodeOffset,
      opcode,
      "QuickTime color table"
    );
  }
  cursor = descriptionEnd;
  const encodedEnd = requireWithinRecord(data, cursor, encodedBytes, recordEnd, opcodeOffset, opcode, "QuickTime encoded image");
  return {
    kind: "compressed",
    opcode,
    opcodeOffset,
    recordEnd,
    codec,
    mediaType: mediaTypeForQuickTimeCodec(codec),
    width,
    height,
    frameCount,
    matteBytes,
    clutId,
    encoded: data.slice(cursor, encodedEnd)
  };
}

export function decodeQuickTimeGif(record: Extract<PictQuickTimeRecord, { kind: "compressed" }>) {
  if (record.codec !== "gif ") {
    throw unsupported(
      "pict.quicktime_codec_unsupported",
      `PICT QuickTime image uses unsupported codec '${printableCodec(record.codec)}'.`,
      record.opcodeOffset,
      record.opcode,
      printableCodec(record.codec),
      "The original PICT bytes remain preserved."
    );
  }
  try {
    const reader = new GifReader(record.encoded);
    if (reader.width <= 0 || reader.height <= 0 || reader.width > MAX_EMBEDDED_IMAGE_SIDE || reader.height > MAX_EMBEDDED_IMAGE_SIDE) {
      throw new Error(`GIF dimensions ${reader.width} x ${reader.height} are outside the preview limit.`);
    }
    if (reader.numFrames() < 1) throw new Error("GIF contains no image frame.");
    const rgba = new Uint8ClampedArray(reader.width * reader.height * 4);
    rgba.fill(255);
    reader.decodeAndBlitFrameRGBA(0, rgba);
    return { width: reader.width, height: reader.height, rgba };
  } catch (error) {
    if (error instanceof PictQuickTimeError) throw error;
    throw malformed(
      "pict.quicktime_embedded_image_invalid",
      `PICT QuickTime GIF could not be decoded: ${error instanceof Error ? error.message : "unknown GIF error"}`,
      record.opcodeOffset,
      record.opcode,
      "gif"
    );
  }
}

export function mediaTypeForQuickTimeCodec(codec: string) {
  switch (codec) {
    case "gif ":
      return "image/gif";
    case "jpeg":
      return "image/jpeg";
    case "png ":
      return "image/png";
    case "tiff":
      return "image/tiff";
    default:
      return null;
  }
}

function readU16(data: Uint8Array, offset: number, opcodeOffset: number, opcode: number, field: string) {
  const value = u16At(data, offset);
  if (value === null) throw malformed("pict.quicktime_truncated", `PICT ${field} is truncated.`, opcodeOffset, opcode);
  return value;
}

function readU32(data: Uint8Array, offset: number, opcodeOffset: number, opcode: number, field: string) {
  const value = u32At(data, offset);
  if (value === null) throw malformed("pict.quicktime_truncated", `PICT ${field} is truncated.`, opcodeOffset, opcode);
  return value;
}

function requireRange(data: Uint8Array, offset: number, length: number, opcodeOffset: number, opcode: number, field: string) {
  if (!Number.isSafeInteger(length) || length < 0 || offset < 0 || offset > data.byteLength || length > data.byteLength - offset) {
    throw malformed("pict.quicktime_truncated", `PICT ${field} extends beyond the resource.`, opcodeOffset, opcode);
  }
  return offset + length;
}

function requireWithinRecord(
  data: Uint8Array,
  offset: number,
  length: number,
  recordEnd: number,
  opcodeOffset: number,
  opcode: number,
  field: string
) {
  const end = requireRange(data, offset, length, opcodeOffset, opcode, field);
  if (end > recordEnd) throw malformed("pict.quicktime_truncated", `PICT ${field} extends beyond its QuickTime record.`, opcodeOffset, opcode);
  return end;
}

function u16At(data: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > data.byteLength) return null;
  return ((data[offset] ?? 0) << 8) | (data[offset + 1] ?? 0);
}

function u32At(data: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > data.byteLength) return null;
  return (
    (data[offset] ?? 0) * 0x1000000 +
    (data[offset + 1] ?? 0) * 0x10000 +
    (data[offset + 2] ?? 0) * 0x100 +
    (data[offset + 3] ?? 0)
  );
}

function asciiAt(data: Uint8Array, offset: number, length: number, opcodeOffset: number, opcode: number) {
  requireRange(data, offset, length, opcodeOffset, opcode, "QuickTime codec");
  return String.fromCharCode(...data.slice(offset, offset + length));
}

function align2(value: number) {
  return (value + 1) & ~1;
}

function printableCodec(codec: string) {
  return codec.replace(/\0/g, "\\0").trimEnd() || "unknown";
}

function formatOpcode(opcode: number) {
  return `0x${opcode.toString(16).padStart(4, "0").toUpperCase()}`;
}

function malformed(code: string, message: string, offset: number, opcode: number, variant?: string) {
  return new PictQuickTimeError({ status: "malformed", code, message, offset, opcode, variant });
}

function unsupported(code: string, message: string, offset: number, opcode: number, variant?: string, hint?: string) {
  return new PictQuickTimeError({ status: "unsupported-variant", code, message, offset, opcode, variant, hint });
}
