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
      depth: number;
      frameCount: number;
      matteBytes: number;
      clutId: number;
      palette: Uint8Array;
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
  const depth = readU16(data, descriptionStart + 82, opcodeOffset, opcode, "QuickTime image depth");
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
  let palette = (depth & 0x1f) === 8 ? quickTimeDefaultPalette256() : new Uint8Array();
  if (clutId === 0) {
    requireWithinRecord(data, cursor, 8, descriptionEnd, opcodeOffset, opcode, "QuickTime color-table header");
    const colorTableFlags = readU16(data, cursor + 4, opcodeOffset, opcode, "QuickTime color-table flags");
    const lastColorIndex = readU16(data, cursor + 6, opcodeOffset, opcode, "QuickTime color-table size");
    const colorCount = lastColorIndex === 0xffff ? 0 : lastColorIndex + 1;
    const colorTableEnd = requireWithinRecord(
      data,
      cursor,
      8 + colorCount * 8,
      descriptionEnd,
      opcodeOffset,
      opcode,
      "QuickTime color table"
    );
    if (colorCount > 0) {
      const depthBits = depth & 0x1f;
      const paletteLength = Math.max(colorCount, depthBits > 0 && depthBits <= 8 ? 1 << depthBits : colorCount);
      palette = new Uint8Array(paletteLength * 3);
      for (let colorOffset = 0; colorOffset < colorCount; colorOffset += 1) {
        const entry = cursor + 8 + colorOffset * 8;
        const colorIndex = readU16(data, entry, opcodeOffset, opcode, "QuickTime color-table index");
        const paletteIndex =
          (colorTableFlags & 0x8000) !== 0 || colorIndex >= paletteLength ? colorOffset : colorIndex;
        if (paletteIndex < paletteLength) {
          palette[paletteIndex * 3] = data[entry + 2] ?? 0;
          palette[paletteIndex * 3 + 1] = data[entry + 4] ?? 0;
          palette[paletteIndex * 3 + 2] = data[entry + 6] ?? 0;
        }
      }
    }
    cursor = colorTableEnd;
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
    depth,
    frameCount,
    matteBytes,
    clutId,
    palette,
    encoded: data.slice(cursor, encodedEnd)
  };
}

export function decodeQuickTimeImage(record: Extract<PictQuickTimeRecord, { kind: "compressed" }>) {
  if (record.codec === "rle ") return decodeQuickTimeRle8(record);
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

function decodeQuickTimeRle8(record: Extract<PictQuickTimeRecord, { kind: "compressed" }>) {
  if ((record.depth & 0x1f) !== 8) {
    throw unsupported(
      "pict.quicktime_rle_depth_unsupported",
      `PICT QuickTime Animation uses unsupported image depth ${record.depth}; Providence currently decodes 8-bit indexed frames.`,
      record.opcodeOffset,
      record.opcode,
      `${record.depth}-bit`,
      "The original PICT bytes remain preserved."
    );
  }
  if (record.palette.byteLength < 256 * 3) {
    throw malformed(
      "pict.quicktime_rle_invalid",
      `PICT QuickTime Animation 8-bit frame has only ${Math.floor(record.palette.byteLength / 3)} palette entries.`,
      record.opcodeOffset,
      record.opcode,
      "rle-8"
    );
  }
  const fail = (message: string) =>
    malformed("pict.quicktime_rle_invalid", message, record.opcodeOffset, record.opcode, "rle-8");
  const encoded = record.encoded;
  if (encoded.byteLength < 6) throw fail("PICT QuickTime Animation frame is shorter than its six-byte header.");
  const declaredSize = (u32At(encoded, 0) ?? 0) & 0x3fffffff;
  if (declaredSize < 6 || declaredSize > encoded.byteLength) {
    throw fail(
      `PICT QuickTime Animation frame declares ${declaredSize} bytes, but ${encoded.byteLength} are available.`
    );
  }
  const frame = encoded.subarray(0, declaredSize);
  const header = u16At(frame, 4) ?? 0;
  let cursor = 6;
  let startLine = 0;
  let linesToChange = record.height;
  if ((header & 0x0008) !== 0) {
    if (frame.byteLength < 14) throw fail("PICT QuickTime Animation line-range header is truncated.");
    startLine = u16At(frame, 6) ?? 0;
    linesToChange = u16At(frame, 10) ?? 0;
    cursor = 14;
  }
  if (startLine > record.height || linesToChange > record.height - startLine) {
    throw fail(
      `PICT QuickTime Animation line range ${startLine}..${startLine + linesToChange} exceeds image height ${record.height}.`
    );
  }

  const rgba = new Uint8ClampedArray(record.width * record.height * 4);
  const background = record.palette.slice(0, 3);
  for (let pixel = 0; pixel < record.width * record.height; pixel += 1) {
    const offset = pixel * 4;
    rgba[offset] = background[0] ?? 0;
    rgba[offset + 1] = background[1] ?? 0;
    rgba[offset + 2] = background[2] ?? 0;
    rgba[offset + 3] = 255;
  }
  const writePixel = (line: number, x: number, paletteIndex: number) => {
    const source = paletteIndex * 3;
    const target = (line * record.width + x) * 4;
    rgba[target] = record.palette[source] ?? 0;
    rgba[target + 1] = record.palette[source + 1] ?? 0;
    rgba[target + 2] = record.palette[source + 2] ?? 0;
    rgba[target + 3] = 255;
  };

  for (let line = startLine; line < startLine + linesToChange; line += 1) {
    const initialSkip = frame[cursor++];
    if (initialSkip === undefined) throw fail(`PICT QuickTime Animation line ${line} is missing its initial skip.`);
    if (initialSkip === 0) throw fail(`PICT QuickTime Animation line ${line} uses invalid initial skip 0.`);
    let x = 4 * (initialSkip - 1);
    if (x > record.width) {
      throw fail(`PICT QuickTime Animation line ${line} starts beyond image width ${record.width}.`);
    }
    for (;;) {
      const rawCode = frame[cursor++];
      if (rawCode === undefined) throw fail(`PICT QuickTime Animation line ${line} has no end marker.`);
      const code = rawCode > 127 ? rawCode - 256 : rawCode;
      if (code === -1) break;
      if (code === 0) {
        const skip = frame[cursor++];
        if (skip === undefined) throw fail(`PICT QuickTime Animation line ${line} has a truncated skip code.`);
        if (skip === 0) throw fail(`PICT QuickTime Animation line ${line} uses invalid skip 0.`);
        x += 4 * (skip - 1);
        if (x > record.width) {
          throw fail(`PICT QuickTime Animation line ${line} skips beyond image width ${record.width}.`);
        }
        continue;
      }
      const groups = Math.abs(code);
      const pixelCount = groups * 4;
      if (pixelCount > record.width - x) {
        throw fail(`PICT QuickTime Animation line ${line} writes past image width ${record.width}.`);
      }
      if (code < 0) {
        if (cursor + 4 > frame.byteLength) {
          throw fail(`PICT QuickTime Animation line ${line} has a truncated repeated group.`);
        }
        const group = frame.subarray(cursor, cursor + 4);
        cursor += 4;
        for (let repeat = 0; repeat < groups; repeat += 1) {
          for (const paletteIndex of group) writePixel(line, x++, paletteIndex);
        }
      } else {
        if (cursor + pixelCount > frame.byteLength) {
          throw fail(`PICT QuickTime Animation line ${line} has a truncated literal run.`);
        }
        for (let index = 0; index < pixelCount; index += 1) {
          writePixel(line, x++, frame[cursor + index] ?? 0);
        }
        cursor += pixelCount;
      }
    }
  }
  return { width: record.width, height: record.height, rgba };
}

function quickTimeDefaultPalette256() {
  const colors: number[] = [];
  const cube = [0xff, 0xcc, 0x99, 0x66, 0x33, 0x00];
  for (const red of cube) {
    for (const green of cube) {
      for (const blue of cube) {
        if (red !== 0 || green !== 0 || blue !== 0) colors.push(red, green, blue);
      }
    }
  }
  const ramp = [0xee, 0xdd, 0xbb, 0xaa, 0x88, 0x77, 0x55, 0x44, 0x22, 0x11];
  for (const value of ramp) colors.push(value, 0, 0);
  for (const value of ramp) colors.push(0, value, 0);
  for (const value of ramp) colors.push(0, 0, value);
  for (const value of [...ramp, 0]) colors.push(value, value, value);
  return Uint8Array.from(colors);
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
    case "rle ":
      return "video/quicktime-rle";
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
