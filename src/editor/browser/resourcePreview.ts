import type { DecodedResourcePreview, ResourcePreviewDiagnostic, ResourcePreviewStatus } from "../types";

type DecodedImage = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

const END_PICTURE = 0x00ff;
const HEADER_OP = 0x0c00;
const BITS_RECT = 0x0090;
const BITS_RGN = 0x0091;
const PACK_BITS_RECT = 0x0098;
const PACK_BITS_RGN = 0x0099;
const DIRECT_BITS_RECT = 0x009a;
const DIRECT_BITS_RGN = 0x009b;
const MAX_PICT_SIDE = 2048;

export function previewResourceDataUrl(resourceType: string, data: Uint8Array): string | null {
  return inspectResourcePreview(resourceType, data).dataUrl;
}

export function decodePictPreviewImageForTest(data: Uint8Array): { width: number; height: number; rgba: Uint8ClampedArray; summary: Record<string, string> } {
  const summary: Record<string, string> = {
    resourceType: "PICT",
    bytes: String(data.byteLength)
  };
  return { ...decodePictPackBits(data, summary), summary };
}

export function inspectPictConformanceForTest(data: Uint8Array) {
  const summary: Record<string, string> = {
    resourceType: "PICT",
    bytes: String(data.byteLength)
  };
  try {
    const image = decodePictPackBits(data, summary);
    return {
      status: "decoded" as const,
      width: image.width,
      height: image.height,
      rgba: image.rgba,
      summary,
      diagnostics: [] as ResourcePreviewDiagnostic[]
    };
  } catch (error) {
    const failure = normalizePreviewError(error, "PICT");
    return {
      status: failure.status,
      width: null,
      height: null,
      rgba: null,
      summary,
      diagnostics: [failure.diagnostic]
    };
  }
}

export async function inspectResourcePreviewAsync(resourceType: string, data: Uint8Array): Promise<DecodedResourcePreview> {
  const summary: Record<string, string> = {
    resourceType: resourceType.trim(),
    bytes: String(data.byteLength)
  };
  try {
    if (resourceType === "PICT") {
      const image = decodePictPackBits(data, summary);
      return previewReady("image/png", await imageToObjectUrl(image), summary);
    }
    if (resourceType === "cicn") {
      const image = decodeCicn(data);
      return previewReady("image/png", await imageToObjectUrl(image), summary);
    }
    return inspectResourcePreview(resourceType, data);
  } catch (error) {
    const failure = normalizePreviewError(error, resourceType);
    return metadata(failure.status, fallbackMime(resourceType), summary, failure.diagnostic);
  }
}

export function inspectResourcePreview(resourceType: string, data: Uint8Array): DecodedResourcePreview {
  const summary: Record<string, string> = {
    resourceType: resourceType.trim(),
    bytes: String(data.byteLength)
  };
  try {
    if (resourceType === "PICT") {
      const image = decodePictPackBits(data, summary);
      return previewReady("image/png", imageToDataUrl(image), summary);
    }
    if (resourceType === "cicn") {
      const image = decodeCicn(data);
      return previewReady("image/png", imageToDataUrl(image), summary);
    }
    if (resourceType === "snd ") return playable(bytesToDataUrl("audio/wav", decodeSndToWav(data, summary)), summary);
    if (resourceType === "TEXT") return textReady(decodeClassicText(data), { ...summary, characters: String(decodeClassicText(data).length) });
    if (resourceType === "STR#") {
      const strings = decodeStringList(data);
      return textReady(strings.join("\n"), { ...summary, strings: String(strings.length) });
    }
    if (resourceType === "styl") return metadata("metadata-only", "application/octet-stream", summary, diagnostic("info", "styl.metadata_only", describeStyl(data), "styl", "style-run-table"));
    if (resourceType === "vers" || resourceType === "RLMZ") {
      return metadata("metadata-only", "application/octet-stream", summary, diagnostic("info", `${resourceType.trim().toLowerCase()}.metadata`, describeMetadata(resourceType, data), resourceType.trim().toLowerCase(), resourceType.trim()));
    }
    return metadata("metadata-only", "application/octet-stream", summary, diagnostic("info", "resource.no_decoder", `No preview decoder is registered for resource type ${resourceType}.`, "resource-preview", resourceType.trim()));
  } catch (error) {
    const failure = normalizePreviewError(error, resourceType);
    return metadata(failure.status, fallbackMime(resourceType), summary, failure.diagnostic);
  }
}

export function resourcePreviewDataUrlFromBase64(resourceType: string, resourceBase64: string) {
  try {
    const binary = atob(resourceBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return inspectResourcePreview(resourceType, bytes).dataUrl;
  } catch {
    return null;
  }
}

function imageToDataUrl(image: DecodedImage) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const data = new Uint8ClampedArray(image.rgba.length);
  data.set(image.rgba);
  context.putImageData(new ImageData(data as ImageDataArray, image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
}

function imageToObjectUrl(image: DecodedImage) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(null);
  const data = new Uint8ClampedArray(image.rgba.length);
  data.set(image.rgba);
  context.putImageData(new ImageData(data as ImageDataArray, image.width, image.height), 0, 0);
  return new Promise<string | null>((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : null);
    }, "image/png");
  });
}

function decodePictPackBits(pict: Uint8Array, summary: Record<string, string>): DecodedImage {
  if (pict.byteLength >= 10) {
    const frame = parseRect(pict, 2);
    summary.pictSizeWord = String(i16At(pict, 0));
    if (frame) {
      summary.frameTop = String(frame.top);
      summary.frameLeft = String(frame.left);
      summary.frameBottom = String(frame.bottom);
      summary.frameRight = String(frame.right);
    }
  }

  const stream = parsePictOpcodeStream(pict);
  if (stream.failure) throw stream.failure;
  const failures: PreviewFailure[] = [];
  let best: { command: BitmapDrawCommand; bitmap: DecodedBitmap } | null = null;

  for (const opcode of stream.opcodes) {
    if (![BITS_RECT, BITS_RGN, PACK_BITS_RECT, PACK_BITS_RGN, DIRECT_BITS_RECT, DIRECT_BITS_RGN].includes(opcode.opcode)) continue;
    let command: BitmapDrawCommand;
    try {
      command = parseBitmapCommand(pict, opcode.offset, opcode.opcode, opcode.opcodeBytes);
    } catch (error) {
      if (opcode.opcodeBytes === 1) failures.push(error as PreviewFailure);
      continue;
    }
    try {
      const bitmap = decodeBitmapCommand(pict, command);
      const area = bitmap.image.width * bitmap.image.height;
      const currentArea = best ? best.bitmap.image.width * best.bitmap.image.height : 0;
      if (area >= currentArea) best = { command, bitmap };
    } catch (error) {
      failures.push(error as PreviewFailure);
    }
  }

  if (stream.version.startsWith("v1") && !stream.endPictureFound) {
    const failure = previewError("malformed", "pict.v1_missing_end_picture", "PICT v1 stream ends without the required 0xFF EndPicture opcode.", "pict");
    if (best) throw failure;
    failures.push(failure);
  }

  if (best) {
    const frame = parseRect(pict, 2);
    const composited = frame ? drawBitmapToPictFrame(frame, best.bitmap, best.command.srcRect, best.command.dstRect) : { image: best.bitmap.image, drew: false };
    summary.pictVersion = stream.version;
    summary.format = best.command.format;
    summary.pixelSize = String(best.command.pixelSize);
    summary.rowBytes = String(best.command.rowBytes);
    summary.opcode = formatOpcode(best.command.opcode);
    summary.opcodeCount = String(stream.opcodes.length);
    if (stream.unsupportedVisibleOpcodes > 0) summary.unsupportedVisibleOpcodes = String(stream.unsupportedVisibleOpcodes);
    return composited.drew ? composited.image : best.bitmap.image;
  }

  for (const decode of [decodeIndexedPictPackBits, decodeDirectBitsPict, decodeOneBitPackBitsPict]) {
    try {
      const image = decode(pict, summary);
      if (stream.version !== "unknown") summary.pictVersion = stream.version;
      if (stream.opcodes.length > 0) summary.opcodeCount = String(stream.opcodes.length);
      if (stream.unsupportedVisibleOpcodes > 0) summary.unsupportedVisibleOpcodes = String(stream.unsupportedVisibleOpcodes);
      return image;
    } catch (error) {
      failures.push(error as PreviewFailure);
    }
  }
  throw failures.find((failure) => failure.diagnostic)
    ?? previewError("malformed", "pict.no_drawable_opcode", "PICT contains no supported PackBits, Bits, or DirectBits drawing opcode.", "pict");
}

type Rect = {
  top: number;
  left: number;
  bottom: number;
  right: number;
};

type PictOpcode = {
  offset: number;
  opcode: number;
  opcodeBytes: 1 | 2;
};

type PictOpcodeStream = {
  version: string;
  opcodes: PictOpcode[];
  unsupportedVisibleOpcodes: number;
  endPictureFound: boolean;
  failure: PreviewFailure | null;
};

type BitmapDrawCommand = {
  opcode: number;
  nextOffset: number;
  rowBytes: number;
  pixelSize: number;
  packType: number;
  componentCount: number;
  bounds: Rect;
  srcRect: Rect;
  dstRect: Rect;
  format: string;
  dataOffset: number;
  colorTableOffset: number | null;
  colorTableFlags: number;
  colorCount: number;
  direct: boolean;
  packed: boolean;
};

type DecodedBitmap = {
  image: DecodedImage;
  bounds: Rect;
};

function parsePictOpcodeStream(data: Uint8Array): PictOpcodeStream {
  const byteOpcodes = data[10] === 0x11;
  const opcodeBytes: 1 | 2 = byteOpcodes ? 1 : 2;
  let cursor = 10;
  const opcodes: PictOpcode[] = [];
  let unsupportedVisibleOpcodes = 0;
  let version = "unknown";
  let endPictureFound = false;
  let failure: PreviewFailure | null = null;

  while (cursor + opcodeBytes <= data.byteLength) {
    if (!byteOpcodes && cursor % 2 !== 0) {
      try {
        cursor = requirePictRange(data, cursor, 1, cursor, 0, "word-alignment padding");
      } catch (error) {
        failure = error as PreviewFailure;
        break;
      }
    }
    const offset = cursor;
    const opcode = byteOpcodes ? (data[offset] ?? null) : u16At(data, offset);
    if (opcode === null) break;
    opcodes.push({ offset, opcode, opcodeBytes });
    cursor += opcodeBytes;

    if (opcode === END_PICTURE) {
      endPictureFound = true;
      break;
    }
    if (opcode === 0x0011) {
      version = cursor < data.byteLength ? `v1/${data[cursor] ?? 0}` : "v1";
    } else if (opcode === HEADER_OP) {
      version = "v2";
    }

    try {
      cursor = advancePictOpcode(data, cursor, offset, opcode, opcodeBytes);
    } catch (error) {
      failure = error as PreviewFailure;
      if (isProbablyVisiblePictOpcode(opcode)) unsupportedVisibleOpcodes += 1;
      break;
    }
    if (isProbablyVisiblePictOpcode(opcode) && ![BITS_RECT, BITS_RGN, PACK_BITS_RECT, PACK_BITS_RGN, DIRECT_BITS_RECT, DIRECT_BITS_RGN].includes(opcode)) {
      unsupportedVisibleOpcodes += 1;
    }

    if (!byteOpcodes && cursor % 2 !== 0) {
      try {
        cursor = requirePictRange(data, cursor, 1, offset, opcode, "word-alignment padding");
      } catch (error) {
        failure = error as PreviewFailure;
        break;
      }
    }
  }

  if (!failure && !endPictureFound && version === "v2") {
    failure = previewError("malformed", "pict.v2_missing_end_picture", "PICT v2 stream ends without the required 0x00FF EndPicture opcode.", "pict");
  }
  return { version, opcodes, unsupportedVisibleOpcodes, endPictureFound, failure };
}

function advancePictOpcode(data: Uint8Array, cursor: number, offset: number, opcode: number, opcodeBytes: 1 | 2) {
  if ([BITS_RECT, BITS_RGN, PACK_BITS_RECT, PACK_BITS_RGN, DIRECT_BITS_RECT, DIRECT_BITS_RGN].includes(opcode)) {
    return parseBitmapCommand(data, offset, opcode, opcodeBytes).nextOffset;
  }
  if ([0x0012, 0x0013, 0x0014].includes(opcode)) return skipPixelPattern(data, cursor, offset, opcode);
  if (opcode === 0x0001 || (opcode >= 0x0070 && opcode <= 0x0077) || (opcode >= 0x0080 && opcode <= 0x0087)) {
    return skipSizedPictRecord(data, cursor, offset, opcode, 10);
  }
  if (opcode === 0x0028) {
    requirePictRange(data, cursor, 5, offset, opcode, "LongText header");
    return requirePictRange(data, cursor, 5 + (data[cursor + 4] ?? 0), offset, opcode, "LongText data");
  }
  if (opcode === 0x0029 || opcode === 0x002a) {
    requirePictRange(data, cursor, 2, offset, opcode, "text header");
    return requirePictRange(data, cursor, 2 + (data[cursor + 1] ?? 0), offset, opcode, "text data");
  }
  if (opcode === 0x002b) {
    requirePictRange(data, cursor, 3, offset, opcode, "DHDVText header");
    return requirePictRange(data, cursor, 3 + (data[cursor + 2] ?? 0), offset, opcode, "DHDVText data");
  }
  if ([0x0024, 0x0025, 0x0026, 0x0027, 0x002c, 0x002f].includes(opcode)
    || (opcode >= 0x0092 && opcode <= 0x0097)
    || (opcode >= 0x009c && opcode <= 0x009f)
    || (opcode >= 0x00a2 && opcode <= 0x00af)) {
    return skipLengthPrefixedPictData(data, cursor, offset, opcode, 2);
  }
  if (opcode === 0x00a1) {
    requirePictRange(data, cursor, 4, offset, opcode, "LongComment header");
    return requirePictRange(data, cursor, 4 + (u16At(data, cursor + 2) ?? 0), offset, opcode, "LongComment data");
  }
  if (opcodeBytes === 2 && opcode >= 0x00d0 && opcode <= 0x00fe) return skipLengthPrefixedPictData(data, cursor, offset, opcode, 4);
  if (opcodeBytes === 2 && opcode >= 0x0100 && opcode <= 0x7fff) return requirePictRange(data, cursor, (opcode >>> 8) * 2, offset, opcode, "reserved fixed-length data");
  if (opcodeBytes === 2 && opcode >= 0x8000 && opcode <= 0x80ff) return cursor;
  if (opcodeBytes === 2 && opcode >= 0x8100) return skipLengthPrefixedPictData(data, cursor, offset, opcode, 4);

  const fixedBytes = fixedPictOpcodePayloadBytes(opcode);
  if (fixedBytes !== null) return requirePictRange(data, cursor, fixedBytes, offset, opcode, "opcode data");
  throw previewError("unsupported-variant", "pict.opcode_length_unknown", `PICT opcode ${formatOpcode(opcode)} has no bounded payload rule.`, "pict", offset, formatOpcode(opcode));
}

function fixedPictOpcodePayloadBytes(opcode: number): number | null {
  if ([0x0000, 0x001c, 0x001e].includes(opcode) || (opcode >= 0x0038 && opcode <= 0x003f) || (opcode >= 0x0048 && opcode <= 0x004f) || (opcode >= 0x0058 && opcode <= 0x005f) || (opcode >= 0x0078 && opcode <= 0x007f) || (opcode >= 0x0088 && opcode <= 0x008f) || (opcode >= 0x00b0 && opcode <= 0x00cf)) return 0;
  if (opcode === 0x0004 || opcode === 0x0011) return 1;
  if ([0x0003, 0x0005, 0x0008, 0x000d, 0x0015, 0x0016, 0x0023, 0x00a0].includes(opcode)) return 2;
  if ([0x0006, 0x0007, 0x000b, 0x000c, 0x000e, 0x000f, 0x0021].includes(opcode) || (opcode >= 0x0068 && opcode <= 0x006f)) return 4;
  if ([0x001a, 0x001b, 0x001d, 0x001f, 0x0022].includes(opcode)) return 6;
  if ([0x0002, 0x0009, 0x000a, 0x0010, 0x0020, 0x002e].includes(opcode) || (opcode >= 0x0030 && opcode <= 0x0037) || (opcode >= 0x0040 && opcode <= 0x0047) || (opcode >= 0x0050 && opcode <= 0x0057)) return 8;
  if (opcode === 0x002d) return 10;
  if (opcode >= 0x0060 && opcode <= 0x0067) return 12;
  return null;
}

function skipLengthPrefixedPictData(data: Uint8Array, cursor: number, offset: number, opcode: number, lengthBytes: 2 | 4) {
  requirePictRange(data, cursor, lengthBytes, offset, opcode, "length prefix");
  const length = lengthBytes === 2 ? (u16At(data, cursor) ?? 0) : (u32At(data, cursor) ?? 0);
  return requirePictRange(data, cursor, lengthBytes + length, offset, opcode, "length-prefixed data");
}

function skipSizedPictRecord(data: Uint8Array, cursor: number, offset: number, opcode: number, minimumSize: number) {
  requirePictRange(data, cursor, 2, offset, opcode, "sized record header");
  const size = u16At(data, cursor) ?? 0;
  if (size < minimumSize) throw previewError("malformed", "pict.invalid_record_size", `PICT opcode ${formatOpcode(opcode)} declares an invalid ${size}-byte record.`, "pict", cursor, formatOpcode(opcode));
  return requirePictRange(data, cursor, size, offset, opcode, "sized record data");
}

function requirePictRange(data: Uint8Array, cursor: number, length: number, offset: number, opcode: number, variant: string) {
  if (!Number.isSafeInteger(length) || length < 0 || cursor < 0 || cursor > data.byteLength || length > data.byteLength - cursor) {
    throw previewError("malformed", "pict.opcode_truncated", `PICT ${variant} for opcode ${formatOpcode(opcode)} extends beyond the resource.`, "pict", offset, formatOpcode(opcode), variant);
  }
  return cursor + length;
}

function skipPixelPattern(data: Uint8Array, cursor: number, offset: number, opcode: number) {
  requirePictRange(data, cursor, 10, offset, opcode, "pixel-pattern header");
  const patternType = u16At(data, cursor) ?? 0;
  if (patternType === 2) return requirePictRange(data, cursor, 16, offset, opcode, "dither pixel pattern");
  if (patternType !== 1) throw previewError("unsupported-variant", "pict.pixel_pattern_type_unknown", `PICT pixel pattern uses unsupported pattern type ${patternType}.`, "pict", cursor, formatOpcode(opcode));
  const pixmap = cursor + 10;
  requirePictRange(data, pixmap, 46, offset, opcode, "pixel-pattern PixMap");
  const rowBytes = (u16At(data, pixmap) ?? 0) & 0x3fff;
  const bounds = parseRect(data, pixmap + 2);
  if (!bounds || rowBytes === 0) throw previewError("malformed", "pict.pixel_pattern_pixmap_invalid", "PICT pixel pattern contains an invalid PixMap.", "pict", pixmap, formatOpcode(opcode));
  const colorTable = pixmap + 46;
  requirePictRange(data, colorTable, 8, offset, opcode, "pixel-pattern color table");
  const colorCount = (u16At(data, colorTable + 6) ?? 0) + 1;
  const pixelData = requirePictRange(data, colorTable, 8 + colorCount * 8, offset, opcode, "pixel-pattern color table");
  return skipPictPixelRows(data, pixelData, rowBytes, rectHeight(bounds), u16At(data, pixmap + 12) ?? 0, offset, opcode);
}

function isProbablyVisiblePictOpcode(opcode: number) {
  return (opcode >= 0x0020 && opcode <= 0x007f) || (opcode >= 0x0090 && opcode <= 0x009f) || opcode === 0x8200;
}

function parseBitmapCommand(data: Uint8Array, offset: number, opcode: number, opcodeBytes = 2): BitmapDrawCommand {
  if (opcode === BITS_RECT || opcode === BITS_RGN) return parseBitsCommand(data, offset, opcode, opcodeBytes);
  if (opcode === PACK_BITS_RECT || opcode === PACK_BITS_RGN) return parsePackBitsCommand(data, offset, opcode, opcodeBytes);
  if (opcode === DIRECT_BITS_RECT || opcode === DIRECT_BITS_RGN) return parseDirectBitsCommand(data, offset, opcode, opcodeBytes);
  throw previewError("unsupported-variant", "pict.not_bitmap_opcode", "PICT opcode is not a bitmap drawing command.", "pict", offset, formatOpcode(opcode));
}

function parseBitsCommand(data: Uint8Array, offset: number, opcode: number, opcodeBytes: number): BitmapDrawCommand {
  const bitmap = offset + opcodeBytes;
  if (bitmap + 28 > data.byteLength) {
    throw previewError("malformed", "pict.bits_truncated", "PICT BitsRect/BitsRgn bitmap header is truncated.", "pict", offset, formatOpcode(opcode));
  }
  const rowBytesRaw = u16At(data, bitmap) ?? 0;
  if ((rowBytesRaw & 0x8000) !== 0) {
    return parseBitsPixmapCommand(data, offset, opcode, bitmap, rowBytesRaw);
  }
  const rowBytes = rowBytesRaw & 0x3fff;
  const bounds = parseRect(data, bitmap + 2);
  if (!bounds) throw previewError("malformed", "pict.bits_bounds_missing", "PICT BitsRect/BitsRgn bitmap bounds are missing.", "pict", bitmap, formatOpcode(opcode));
  const srcRect = parseRect(data, bitmap + 10) ?? bounds;
  const dstRect = parseRect(data, bitmap + 18) ?? srcRect;
  let dataOffset = bitmap + 28;
  if (opcode === BITS_RGN) {
    const regionSize = u16At(data, dataOffset) ?? 0;
    if (regionSize < 10 || dataOffset + regionSize > data.byteLength) {
      throw previewError("malformed", "pict.region_truncated", "PICT BitsRgn has a missing or truncated region before pixel data.", "pict", dataOffset, formatOpcode(opcode));
    }
    dataOffset += regionSize;
  }
  if (rowBytes === 0 || rowBytes > 4096 || rectWidth(bounds) === 0 || rectHeight(bounds) === 0) {
    throw previewError("unsupported-variant", "pict.bits_unsupported_shape", `PICT BitsRect/BitsRgn has unsupported geometry: rowBytes=${rowBytes}, width=${rectWidth(bounds)}, height=${rectHeight(bounds)}.`, "pict", offset, formatOpcode(opcode), "bits-1");
  }
  return {
    opcode,
    nextOffset: requirePictRange(data, dataOffset, rowBytes * rectHeight(bounds), offset, opcode, "bitmap pixel data"),
    rowBytes,
    pixelSize: 1,
    packType: 0,
    componentCount: 1,
    bounds,
    srcRect,
    dstRect,
    format: "bits-bitmap-1",
    dataOffset,
    colorTableOffset: null,
    colorTableFlags: 0,
    colorCount: 2,
    direct: false,
    packed: false
  };
}

function parseBitsPixmapCommand(data: Uint8Array, offset: number, opcode: number, pixmap: number, rowBytesRaw: number): BitmapDrawCommand {
  if (pixmap + 46 > data.byteLength) {
    throw previewError("malformed", "pict.pixmap_truncated", "PICT BitsRect/BitsRgn pixmap header is truncated.", "pict", offset, formatOpcode(opcode));
  }
  const rowBytes = rowBytesRaw & 0x3fff;
  const bounds = parseRect(data, pixmap + 2) ?? { top: 0, left: 0, bottom: 0, right: 0 };
  const pixelType = u16At(data, pixmap + 26) ?? -1;
  const pixelSize = u16At(data, pixmap + 28) ?? -1;
  const componentCount = u16At(data, pixmap + 30) ?? -1;
  const componentSize = u16At(data, pixmap + 32) ?? -1;
  if (
    rowBytes === 0 ||
    rowBytes > 4096 ||
    rectWidth(bounds) === 0 ||
    rectHeight(bounds) === 0 ||
    pixelType !== 0 ||
    ![1, 2, 4, 8].includes(pixelSize) ||
    componentCount !== 1 ||
    componentSize !== pixelSize
  ) {
    throw previewError("unsupported-variant", "pict.bits_pixmap_unsupported_shape", `PICT uses Bits opcode ${formatOpcode(opcode)}, but this pixmap shape is unsupported. Found pixelType=${pixelType}, pixelSize=${pixelSize}, componentCount=${componentCount}, componentSize=${componentSize}, rowBytes=${rowBytes}.`, "pict", offset, formatOpcode(opcode), `pixel-size-${pixelSize}`);
  }
  const colorTableOffset = pixmap + 46;
  if (colorTableOffset + 8 > data.byteLength) {
    throw previewError("malformed", "pict.color_table_missing", "PICT Bits pixmap points beyond the resource before the color table.", "pict", colorTableOffset, formatOpcode(opcode));
  }
  const colorTableFlags = u16At(data, colorTableOffset + 4) ?? 0;
  const colorCount = (u16At(data, colorTableOffset + 6) ?? 0) + 1;
  const afterColorTable = colorTableOffset + 8 + colorCount * 8;
  if (afterColorTable + 18 > data.byteLength) {
    throw previewError("malformed", "pict.truncated_color_table", "PICT color table or source/destination rectangles are truncated.", "pict", colorTableOffset, formatOpcode(opcode));
  }
  const srcRect = parseRect(data, afterColorTable) ?? bounds;
  const dstRect = parseRect(data, afterColorTable + 8) ?? srcRect;
  let dataOffset = afterColorTable + 18;
  if (opcode === BITS_RGN) {
    const regionSize = u16At(data, dataOffset) ?? 0;
    if (regionSize < 10 || dataOffset + regionSize > data.byteLength) {
      throw previewError("malformed", "pict.region_truncated", "PICT BitsRgn has a missing or truncated region before pixel data.", "pict", dataOffset, formatOpcode(opcode));
    }
    dataOffset += regionSize;
  }
  return {
    opcode,
    nextOffset: requirePictRange(data, dataOffset, rowBytes * rectHeight(bounds), offset, opcode, "unpacked pixmap data"),
    rowBytes,
    pixelSize,
    packType: 0,
    componentCount,
    bounds,
    srcRect,
    dstRect,
    format: `bits-indexed-${pixelSize}`,
    dataOffset,
    colorTableOffset,
    colorTableFlags,
    colorCount,
    direct: false,
    packed: false
  };
}

function parsePackBitsCommand(data: Uint8Array, offset: number, opcode: number, opcodeBytes: number): BitmapDrawCommand {
  const pixmap = offset + opcodeBytes;
  const rowBytesRaw = u16At(data, pixmap) ?? 0;
  if ((rowBytesRaw & 0x8000) === 0) return parsePackedBitmapCommand(data, offset, opcode, pixmap, rowBytesRaw);
  if (pixmap + 46 > data.byteLength) {
    throw previewError("malformed", "pict.pixmap_truncated", "PICT PackBits pixmap header is truncated.", "pict", offset, formatOpcode(opcode));
  }
  const rowBytes = rowBytesRaw & 0x3fff;
  const bounds = parseRect(data, pixmap + 2) ?? { top: 0, left: 0, bottom: 0, right: 0 };
  const pixelType = u16At(data, pixmap + 26) ?? -1;
  const pixelSize = u16At(data, pixmap + 28) ?? -1;
  const componentCount = u16At(data, pixmap + 30) ?? -1;
  const componentSize = u16At(data, pixmap + 32) ?? -1;
  if (
    (rowBytesRaw & 0x8000) === 0 ||
    rowBytes === 0 ||
    rowBytes > 4096 ||
    pixelType !== 0 ||
    ![1, 2, 4, 8].includes(pixelSize) ||
    componentCount !== 1 ||
    componentSize !== pixelSize
  ) {
    throw previewError("unsupported-variant", "pict.packbits_unsupported_shape", `PICT uses PackBits opcode ${formatOpcode(opcode)}, but this pixmap shape is unsupported. Found pixelType=${pixelType}, pixelSize=${pixelSize}, componentCount=${componentCount}, componentSize=${componentSize}, rowBytes=${rowBytes}.`, "pict", offset, formatOpcode(opcode), `pixel-size-${pixelSize}`);
  }
  const colorTableOffset = pixmap + 46;
  if (colorTableOffset + 8 > data.byteLength) {
    throw previewError("malformed", "pict.color_table_missing", "PICT PackBits pixmap points beyond the resource before the color table.", "pict", colorTableOffset, formatOpcode(opcode));
  }
  const colorTableFlags = u16At(data, colorTableOffset + 4) ?? 0;
  const colorCount = (u16At(data, colorTableOffset + 6) ?? 0) + 1;
  const afterColorTable = colorTableOffset + 8 + colorCount * 8;
  if (afterColorTable + 18 > data.byteLength) {
    throw previewError("malformed", "pict.truncated_color_table", "PICT color table or source/destination rectangles are truncated.", "pict", colorTableOffset, formatOpcode(opcode));
  }
  const srcRect = parseRect(data, afterColorTable) ?? bounds;
  const dstRect = parseRect(data, afterColorTable + 8) ?? srcRect;
  let dataOffset = afterColorTable + 18;
  if (opcode === PACK_BITS_RGN) {
    const regionSize = u16At(data, dataOffset) ?? 0;
    if (regionSize < 10 || dataOffset + regionSize > data.byteLength) {
      throw previewError("malformed", "pict.region_truncated", "PICT PackBitsRgn has a missing or truncated region before pixel data.", "pict", dataOffset, formatOpcode(opcode));
    }
    dataOffset += regionSize;
  }
  const nextOffset = rowBytes < 8
    ? requirePictRange(data, dataOffset, rowBytes * rectHeight(bounds), offset, opcode, "unpacked pixmap data")
    : skipPackedRows(data, dataOffset, rowBytes, rectHeight(bounds), offset, opcode);
  return {
    opcode,
    nextOffset,
    rowBytes,
    pixelSize,
    packType: 0,
    componentCount,
    bounds,
    srcRect,
    dstRect,
    format: `packbits-indexed-${pixelSize}`,
    dataOffset,
    colorTableOffset,
    colorTableFlags,
    colorCount,
    direct: false,
    packed: rowBytes >= 8
  };
}

function parsePackedBitmapCommand(data: Uint8Array, offset: number, opcode: number, bitmap: number, rowBytes: number): BitmapDrawCommand {
  if (bitmap + 28 > data.byteLength) {
    throw previewError("malformed", "pict.packbits_bitmap_truncated", "PICT PackBitsRect/PackBitsRgn bitmap header is truncated.", "pict", offset, formatOpcode(opcode));
  }
  const bounds = parseRect(data, bitmap + 2);
  if (!bounds) throw previewError("malformed", "pict.packbits_bounds_missing", "PICT PackBitsRect/PackBitsRgn bitmap bounds are missing.", "pict", bitmap, formatOpcode(opcode));
  const srcRect = parseRect(data, bitmap + 10) ?? bounds;
  const dstRect = parseRect(data, bitmap + 18) ?? srcRect;
  let dataOffset = bitmap + 28;
  if (opcode === PACK_BITS_RGN) {
    const regionSize = u16At(data, dataOffset) ?? 0;
    if (regionSize < 10 || dataOffset + regionSize > data.byteLength) {
      throw previewError("malformed", "pict.region_truncated", "PICT PackBitsRgn has a missing or truncated region before pixel data.", "pict", dataOffset, formatOpcode(opcode));
    }
    dataOffset += regionSize;
  }
  if (rowBytes === 0 || rowBytes > 512 || rectWidth(bounds) === 0 || rectHeight(bounds) === 0 || rowBytes < Math.ceil(rectWidth(bounds) / 8)) {
    throw previewError("unsupported-variant", "pict.packbits_bitmap_unsupported_shape", `PICT PackBitsRect/PackBitsRgn has unsupported bitmap geometry: rowBytes=${rowBytes}, width=${rectWidth(bounds)}, height=${rectHeight(bounds)}.`, "pict", offset, formatOpcode(opcode), "packbits-bitmap-1");
  }
  return {
    opcode,
    nextOffset: skipPackedRows(data, dataOffset, rowBytes, rectHeight(bounds), offset, opcode),
    rowBytes,
    pixelSize: 1,
    packType: 0,
    componentCount: 1,
    bounds,
    srcRect,
    dstRect,
    format: "packbits-bitmap-1",
    dataOffset,
    colorTableOffset: null,
    colorTableFlags: 0,
    colorCount: 2,
    direct: false,
    packed: true
  };
}

function parseDirectBitsCommand(data: Uint8Array, offset: number, opcode: number, opcodeBytes: number): BitmapDrawCommand {
  const pixmap = offset + opcodeBytes;
  if (pixmap + 68 > data.byteLength) {
    throw previewError("malformed", "pict.directbits_truncated", "PICT DirectBits pixmap header is truncated.", "pict", offset, formatOpcode(opcode));
  }
  const rowBytesRaw = u16At(data, pixmap + 4) ?? 0;
  const rowBytes = rowBytesRaw & 0x3fff;
  const bounds = parseRect(data, pixmap + 6) ?? { top: 0, left: 0, bottom: 0, right: 0 };
  const pixelType = u16At(data, pixmap + 30) ?? -1;
  const pixelSize = u16At(data, pixmap + 32) ?? -1;
  const componentCount = u16At(data, pixmap + 34) ?? -1;
  const componentSize = u16At(data, pixmap + 36) ?? -1;
  const packType = u16At(data, pixmap + 16) ?? 0;
  if (
    (rowBytesRaw & 0x8000) === 0 ||
    rowBytes === 0 ||
    rowBytes > 8192 ||
    rectWidth(bounds) === 0 ||
    rectHeight(bounds) === 0 ||
    rectWidth(bounds) > MAX_PICT_SIDE ||
    rectHeight(bounds) > MAX_PICT_SIDE ||
    pixelType !== 16 ||
    ![16, 32].includes(pixelSize) ||
    ![3, 4].includes(componentCount) ||
    ![5, 8].includes(componentSize)
  ) {
    throw previewError("unsupported-variant", "pict.directbits_unsupported_shape", "PICT DirectBits resource is not a supported 16-bit or 32-bit RGB pixmap.", "pict", offset, formatOpcode(opcode), "direct-bits");
  }
  const srcRect = parseRect(data, pixmap + 50) ?? bounds;
  const dstRect = parseRect(data, pixmap + 58) ?? srcRect;
  let dataOffset = pixmap + 68;
  if (opcode === DIRECT_BITS_RGN) {
    const regionSize = u16At(data, dataOffset) ?? 0;
    if (regionSize < 10 || dataOffset + regionSize > data.byteLength) {
      throw previewError("malformed", "pict.region_truncated", "PICT DirectBitsRgn has a missing or truncated region before pixel data.", "pict", dataOffset, formatOpcode(opcode));
    }
    dataOffset += regionSize;
  }
  const nextOffset = skipDirectPictRows(data, dataOffset, rowBytes, rectHeight(bounds), packType, offset, opcode);
  return {
    opcode,
    nextOffset,
    rowBytes,
    pixelSize,
    packType,
    componentCount,
    bounds,
    srcRect,
    dstRect,
    format: `directbits-${pixelSize}-packbits`,
    dataOffset,
    colorTableOffset: null,
    colorTableFlags: 0,
    colorCount: 0,
    direct: true,
    packed: true
  };
}

function skipPictPixelRows(data: Uint8Array, initialCursor: number, rowBytes: number, height: number, packType: number, offset: number, opcode: number) {
  if (packType === 1 || rowBytes < 8) return requirePictRange(data, initialCursor, rowBytes * height, offset, opcode, "unpacked pixel data");
  if (packType === 2) return requirePictRange(data, initialCursor, Math.floor(rowBytes * 3 / 4) * height, offset, opcode, "drop-pad pixel data");
  return skipPackedRows(data, initialCursor, rowBytes, height, offset, opcode);
}

function skipDirectPictRows(data: Uint8Array, initialCursor: number, rowBytes: number, height: number, packType: number, offset: number, opcode: number) {
  if (packType === 1) return requirePictRange(data, initialCursor, rowBytes * height, offset, opcode, "unpacked direct pixel data");
  if (packType === 2) return requirePictRange(data, initialCursor, Math.floor(rowBytes * 3 / 4) * height, offset, opcode, "drop-pad direct pixel data");
  return skipPackedRows(data, initialCursor, rowBytes, height, offset, opcode);
}

function skipPackedRows(data: Uint8Array, initialCursor: number, rowBytes: number, height: number, offset: number, opcode: number) {
  let cursor = initialCursor;
  for (let row = 0; row < height; row += 1) {
    const prefixBytes = rowBytes > 250 ? 2 : 1;
    requirePictRange(data, cursor, prefixBytes, offset, opcode, "packed row length");
    const packedLength = rowBytes > 250 ? (u16At(data, cursor) ?? 0) : (data[cursor] ?? 0);
    cursor += prefixBytes;
    cursor = requirePictRange(data, cursor, packedLength, offset, opcode, "packed row data");
  }
  return cursor;
}

function decodeBitmapCommand(data: Uint8Array, command: BitmapDrawCommand): DecodedBitmap {
  const image = command.direct
    ? decodeDirectBitmapCommand(data, command)
    : command.colorTableOffset !== null
      ? decodeIndexedBitmapCommand(data, command)
      : decodeMonoBitmapCommand(data, command);
  return { image, bounds: command.bounds };
}

function decodeIndexedBitmapCommand(data: Uint8Array, command: BitmapDrawCommand): DecodedImage {
  const colorTableOffset = command.colorTableOffset ?? 0;
  const palette: Array<[number, number, number]> = new Array(Math.max(1, command.colorCount)).fill([0, 0, 0]);
  for (let index = 0; index < command.colorCount; index += 1) {
    const offset = colorTableOffset + 8 + index * 8;
    if (offset + 8 > data.byteLength) break;
    const colorIndex = colorTablePaletteIndex(command.colorTableFlags, index, u16At(data, offset) ?? index, palette.length);
    if (colorIndex < palette.length) {
      palette[colorIndex] = [
        (u16At(data, offset + 2) ?? 0) >> 8,
        (u16At(data, offset + 4) ?? 0) >> 8,
        (u16At(data, offset + 6) ?? 0) >> 8
      ];
    }
  }
  const width = Math.min(rectWidth(command.bounds), MAX_PICT_SIDE);
  const height = Math.min(rectHeight(command.bounds), MAX_PICT_SIDE);
  const rgba = new Uint8ClampedArray(width * height * 4);
  let y = 0;
  for (const row of bitmapRows(data, command)) {
    if (y < height) {
      for (let x = 0; x < width; x += 1) {
        const color = palette[indexedPixel(row, x, command.pixelSize)] ?? [0, 0, 0];
        const out = (y * width + x) * 4;
        rgba[out] = color[0];
        rgba[out + 1] = color[1];
        rgba[out + 2] = color[2];
        rgba[out + 3] = 255;
      }
    }
    y += 1;
  }
  return { width, height, rgba };
}

function decodeMonoBitmapCommand(data: Uint8Array, command: BitmapDrawCommand): DecodedImage {
  const width = Math.min(rectWidth(command.bounds), MAX_PICT_SIDE);
  const height = Math.min(rectHeight(command.bounds), MAX_PICT_SIDE);
  const rgba = new Uint8ClampedArray(width * height * 4);
  let y = 0;
  for (const row of bitmapRows(data, command)) {
    if (y < height) {
      for (let x = 0; x < width; x += 1) {
        const value = indexedPixel(row, x, 1) === 1 ? 0 : 255;
        const out = (y * width + x) * 4;
        rgba[out] = value;
        rgba[out + 1] = value;
        rgba[out + 2] = value;
        rgba[out + 3] = 255;
      }
    }
    y += 1;
  }
  return { width, height, rgba };
}

function decodeDirectBitmapCommand(data: Uint8Array, command: BitmapDrawCommand): DecodedImage {
  const width = Math.min(rectWidth(command.bounds), MAX_PICT_SIDE);
  const height = Math.min(rectHeight(command.bounds), MAX_PICT_SIDE);
  const rgba = new Uint8ClampedArray(width * height * 4);
  let y = 0;
  for (const row of bitmapRows(data, command)) {
    if (y < height) {
      for (let x = 0; x < width; x += 1) {
        const out = (y * width + x) * 4;
        if (command.pixelSize === 16) {
          const source = x * 2;
          const pixel = ((row[source] ?? 0) << 8) | (row[source + 1] ?? 0);
          rgba[out] = fiveBitToU8((pixel >> 10) & 0x1f);
          rgba[out + 1] = fiveBitToU8((pixel >> 5) & 0x1f);
          rgba[out + 2] = fiveBitToU8(pixel & 0x1f);
        } else if (command.packType === 4 && command.componentCount === 3) {
          rgba[out] = row[x] ?? 0;
          rgba[out + 1] = row[x + width] ?? 0;
          rgba[out + 2] = row[x + width * 2] ?? 0;
        } else {
          const source = x * 4;
          rgba[out] = row[source + 1] ?? 0;
          rgba[out + 1] = row[source + 2] ?? 0;
          rgba[out + 2] = row[source + 3] ?? 0;
        }
        rgba[out + 3] = 255;
      }
    }
    y += 1;
  }
  return { width, height, rgba };
}

function* bitmapRows(data: Uint8Array, command: BitmapDrawCommand): Generator<number[]> {
  let cursor = command.dataOffset;
  for (let row = 0; row < rectHeight(command.bounds) && cursor < data.byteLength; row += 1) {
    if (command.packed) {
      const packedLength = command.rowBytes > 250 ? (u16At(data, cursor) ?? 0) : (data[cursor] ?? 0);
      cursor += command.rowBytes > 250 ? 2 : 1;
      const availableLength = Math.min(packedLength, Math.max(0, data.byteLength - cursor));
      const decoded = decodePictPackBitsRow(data, cursor, availableLength, command.rowBytes, command.packType);
      cursor += availableLength;
      yield decoded;
    } else {
      const end = Math.min(cursor + command.rowBytes, data.byteLength);
      const decoded = Array.from(data.slice(cursor, end));
      cursor = end;
      while (decoded.length < command.rowBytes) decoded.push(0);
      yield decoded.slice(0, command.rowBytes);
    }
  }
}

function indexedPixel(row: number[], x: number, pixelSize: number) {
  if (pixelSize === 8) return row[x] ?? 0;
  if (pixelSize === 4) {
    const byte = row[Math.floor(x / 2)] ?? 0;
    return x % 2 === 0 ? byte >> 4 : byte & 0x0f;
  }
  if (pixelSize === 2) {
    const byte = row[Math.floor(x / 4)] ?? 0;
    return (byte >> (6 - (x % 4) * 2)) & 0x03;
  }
  const byte = row[Math.floor(x / 8)] ?? 0;
  return (byte >> (7 - (x % 8))) & 0x01;
}

function drawBitmapToPictFrame(frame: Rect, bitmap: DecodedBitmap, srcRect: Rect, dstRect: Rect) {
  const width = Math.min((rectWidth(frame) || bitmap.image.width), MAX_PICT_SIDE);
  const height = Math.min((rectHeight(frame) || bitmap.image.height), MAX_PICT_SIDE);
  const rgba = new Uint8ClampedArray(width * height * 4);
  rgba.fill(255);

  const dstLeft = Math.max(0, dstRect.left - frame.left);
  const dstTop = Math.max(0, dstRect.top - frame.top);
  const dstRight = Math.min(width, Math.max(0, dstRect.right - frame.left));
  const dstBottom = Math.min(height, Math.max(0, dstRect.bottom - frame.top));
  const dstWidth = Math.max(0, dstRight - dstLeft);
  const dstHeight = Math.max(0, dstBottom - dstTop);
  const srcWidth = Math.max(1, rectWidth(srcRect));
  const srcHeight = Math.max(1, rectHeight(srcRect));
  let drew = false;

  if (dstWidth === 0 || dstHeight === 0) return { image: { width, height, rgba }, drew };

  for (let y = 0; y < dstHeight; y += 1) {
    const sourceY = srcRect.top + Math.floor((y * srcHeight) / dstHeight) - bitmap.bounds.top;
    if (sourceY < 0 || sourceY >= bitmap.image.height) continue;
    for (let x = 0; x < dstWidth; x += 1) {
      const sourceX = srcRect.left + Math.floor((x * srcWidth) / dstWidth) - bitmap.bounds.left;
      if (sourceX < 0 || sourceX >= bitmap.image.width) continue;
      const source = (sourceY * bitmap.image.width + sourceX) * 4;
      const target = ((dstTop + y) * width + dstLeft + x) * 4;
      rgba[target] = bitmap.image.rgba[source] ?? 0;
      rgba[target + 1] = bitmap.image.rgba[source + 1] ?? 0;
      rgba[target + 2] = bitmap.image.rgba[source + 2] ?? 0;
      rgba[target + 3] = bitmap.image.rgba[source + 3] ?? 255;
      drew = true;
    }
  }

  return { image: { width, height, rgba }, drew };
}

function parseRect(data: Uint8Array, offset: number): Rect | null {
  if (offset < 0 || offset + 8 > data.byteLength) return null;
  return {
    top: i16At(data, offset),
    left: i16At(data, offset + 2),
    bottom: i16At(data, offset + 4),
    right: i16At(data, offset + 6)
  };
}

function rectWidth(rect: Rect) {
  return Math.max(0, rect.right - rect.left);
}

function rectHeight(rect: Rect) {
  return Math.max(0, rect.bottom - rect.top);
}

function formatOpcode(opcode: number) {
  return `0x${opcode.toString(16).padStart(4, "0").toUpperCase()}`;
}

function decodeIndexedPictPackBits(pict: Uint8Array, summary: Record<string, string>): DecodedImage {
  const rect = findPackBitsRect(pict);
  if (!rect) throw previewError("malformed", "pict.no_drawable_opcode", "PICT contains no supported PackBits, Bits, or DirectBits drawing opcode.", "pict");
  const palette: Array<[number, number, number]> = new Array(rect.colorCount).fill([0, 0, 0]);
  for (let index = 0; index < rect.colorCount; index += 1) {
    const offset = rect.colorTableOffset + 8 + index * 8;
    const colorIndex = u16At(pict, offset) ?? index;
    palette[colorTablePaletteIndex(rect.colorTableFlags, index, colorIndex, palette.length)] = [
      (u16At(pict, offset + 2) ?? 0) >> 8,
      (u16At(pict, offset + 4) ?? 0) >> 8,
      (u16At(pict, offset + 6) ?? 0) >> 8
    ];
  }
  const width = Math.min(rect.width, 2048);
  const height = Math.min(rect.height, 2048);
  summary.format = rect.pixelSize === 4 ? "packbits-indexed-4" : "packbits-indexed-8";
  summary.pixelSize = String(rect.pixelSize);
  summary.rowBytes = String(rect.rowBytes);
  summary.opcode = `0x${rect.opcode.toString(16).padStart(4, "0").toUpperCase()}`;
  const rgba = new Uint8ClampedArray(width * height * 4);
  let cursor = rect.dataOffset;
  for (let y = 0; y < rect.height; y += 1) {
    if (cursor >= pict.byteLength) throw previewError("malformed", "pict.pixel_data_truncated", "PICT PackBits pixel data ended before all rows were decoded.", "pict", rect.dataOffset, summary.opcode, summary.format);
    const packedLength = rect.rowBytes > 250 ? (u16At(pict, cursor) ?? 0) : (pict[cursor] ?? 0);
    cursor += rect.rowBytes > 250 ? 2 : 1;
    const availableLength = Math.min(packedLength, Math.max(0, pict.byteLength - cursor));
    const row = decodePackBitsRow(pict, cursor, availableLength, rect.rowBytes);
    cursor += availableLength;
    if (y >= height) continue;
    for (let x = 0; x < width; x += 1) {
      const paletteIndex = rect.pixelSize === 8
        ? row[x] ?? 0
        : x % 2 === 0
          ? (row[Math.floor(x / 2)] ?? 0) >> 4
          : (row[Math.floor(x / 2)] ?? 0) & 0x0f;
      const color = palette[paletteIndex] ?? [0, 0, 0];
      const out = (y * width + x) * 4;
      rgba[out] = color[0];
      rgba[out + 1] = color[1];
      rgba[out + 2] = color[2];
      rgba[out + 3] = 255;
    }
  }
  return { width, height, rgba };
}

function findPackBitsRect(pict: Uint8Array) {
  let firstKnown: { offset: number; opcode: number } | null = null;
  let firstUnsupported: PreviewFailure | null = null;
  for (let offset = 10; offset + 80 < pict.byteLength; offset += 2) {
    const opcode = u16At(pict, offset);
    if ([0x0090, 0x0091, 0x0098, 0x0099, 0x009a, 0x009b].includes(opcode ?? -1) && !firstKnown) firstKnown = { offset, opcode: opcode ?? 0 };
    if (opcode !== 0x0098 && opcode !== 0x0099) continue;
    const pixMapOffset = offset + 2;
    const rowBytesRaw = u16At(pict, pixMapOffset) ?? 0;
    const rowBytes = rowBytesRaw & 0x3fff;
    const pixelType = u16At(pict, pixMapOffset + 26) ?? -1;
    const pixelSize = u16At(pict, pixMapOffset + 28) ?? -1;
    const componentCount = u16At(pict, pixMapOffset + 30) ?? -1;
    const componentSize = u16At(pict, pixMapOffset + 32) ?? -1;
    if (!(rowBytesRaw & 0x8000) || rowBytes < 1 || rowBytes > 4096 || pixelType !== 0 || ![4, 8].includes(pixelSize) || componentCount !== 1 || componentSize !== pixelSize) {
      firstUnsupported ??= previewError("unsupported-variant", "pict.packbits_unsupported_shape", `PICT PackBits shape is not supported: pixelType=${pixelType}, pixelSize=${pixelSize}, componentCount=${componentCount}, componentSize=${componentSize}, rowBytes=${rowBytes}.`, "pict", offset, `0x${opcode.toString(16).padStart(4, "0").toUpperCase()}`, `pixel-size-${pixelSize}`);
      continue;
    }
    const colorTableOffset = pixMapOffset + 46;
    const colorTableFlags = u16At(pict, colorTableOffset + 4) ?? 0;
    const colorCount = (u16At(pict, colorTableOffset + 6) ?? -1) + 1;
    const afterColorTable = colorTableOffset + 8 + colorCount * 8;
    if (colorCount < 2 || afterColorTable + 18 >= pict.byteLength) continue;
    const width = i16At(pict, afterColorTable + 6) - i16At(pict, afterColorTable + 2);
    const height = i16At(pict, afterColorTable + 4) - i16At(pict, afterColorTable);
    let dataOffset = afterColorTable + 18;
    if (opcode === 0x0099) {
      const regionSize = u16At(pict, dataOffset) ?? 0;
      if (regionSize < 10 || dataOffset + regionSize >= pict.byteLength) continue;
      dataOffset += regionSize;
    }
    if (width > 0 && width <= 2048 && height > 0 && height <= 2048) {
      return { opcode, rowBytes, colorTableOffset, colorTableFlags, colorCount, width, height, dataOffset, pixelSize };
    }
  }
  if (firstUnsupported) throw firstUnsupported;
  if (firstKnown) {
    throw previewError("unsupported-variant", "pict.unsupported_opcode", "PICT uses a QuickDraw bitmap opcode that is not yet decoded for preview.", "pict", firstKnown.offset, `0x${firstKnown.opcode.toString(16).padStart(4, "0").toUpperCase()}`, [0x009a, 0x009b].includes(firstKnown.opcode) ? "direct-bits" : "bits");
  }
  return null;
}

function decodeDirectBitsPict(pict: Uint8Array, summary: Record<string, string>): DecodedImage {
  const rect = findDirectBitsRect(pict);
  const width = Math.min(rect.width, 2048);
  const height = Math.min(rect.height, 2048);
  const rgba = new Uint8ClampedArray(width * height * 4);
  let cursor = rect.dataOffset;
  summary.format = `directbits-${rect.pixelSize}-packbits`;
  summary.pixelSize = String(rect.pixelSize);
  summary.rowBytes = String(rect.rowBytes);
  summary.opcode = `0x${rect.opcode.toString(16).padStart(4, "0").toUpperCase()}`;
  for (let y = 0; y < rect.height; y += 1) {
    if (cursor >= pict.byteLength) throw previewError("malformed", "pict.pixel_data_truncated", "PICT DirectBits pixel data ended before all rows were decoded.", "pict", cursor, summary.opcode, summary.format);
    const packedLength = rect.rowBytes > 250 ? (u16At(pict, cursor) ?? 0) : (pict[cursor] ?? 0);
    cursor += rect.rowBytes > 250 ? 2 : 1;
    const availableLength = Math.min(packedLength, Math.max(0, pict.byteLength - cursor));
    const row = decodePictPackBitsRow(pict, cursor, availableLength, rect.rowBytes, rect.packType);
    cursor += availableLength;
    if (y >= height) continue;
    for (let x = 0; x < width; x += 1) {
      const out = (y * width + x) * 4;
      if (rect.pixelSize === 16) {
        const source = x * 2;
        const pixel = ((row[source] ?? 0) << 8) | (row[source + 1] ?? 0);
        rgba[out] = fiveBitToU8((pixel >> 10) & 0x1f);
        rgba[out + 1] = fiveBitToU8((pixel >> 5) & 0x1f);
        rgba[out + 2] = fiveBitToU8(pixel & 0x1f);
      } else if (rect.packType === 4 && rect.componentCount === 3) {
        rgba[out] = row[x] ?? 0;
        rgba[out + 1] = row[x + width] ?? 0;
        rgba[out + 2] = row[x + width * 2] ?? 0;
      } else {
        const source = x * 4;
        rgba[out] = row[source + 1] ?? 0;
        rgba[out + 1] = row[source + 2] ?? 0;
        rgba[out + 2] = row[source + 3] ?? 0;
      }
      rgba[out + 3] = 255;
    }
  }
  return { width, height, rgba };
}

function findDirectBitsRect(pict: Uint8Array) {
  let firstDirect: { offset: number; opcode: number } | null = null;
  for (let offset = 10; offset + 130 < pict.byteLength; offset += 2) {
    const opcode = u16At(pict, offset);
    if (opcode !== 0x009a && opcode !== 0x009b) continue;
    firstDirect ??= { offset, opcode };
    const pixMapOffset = offset + 2;
    const rowBytesRaw = u16At(pict, pixMapOffset + 4) ?? 0;
    const rowBytes = rowBytesRaw & 0x3fff;
    const width = i16At(pict, pixMapOffset + 12) - i16At(pict, pixMapOffset + 8);
    const height = i16At(pict, pixMapOffset + 10) - i16At(pict, pixMapOffset + 6);
    const pixelType = u16At(pict, pixMapOffset + 30) ?? -1;
    const pixelSize = u16At(pict, pixMapOffset + 32) ?? -1;
    const componentCount = u16At(pict, pixMapOffset + 34) ?? -1;
    const componentSize = u16At(pict, pixMapOffset + 36) ?? -1;
    const packType = u16At(pict, pixMapOffset + 16) ?? 0;
    if (!(rowBytesRaw & 0x8000) || rowBytes <= 0 || rowBytes > 8192 || width <= 0 || height <= 0 || width > 2048 || height > 2048 || pixelType !== 16 || ![16, 32].includes(pixelSize) || ![3, 4].includes(componentCount) || ![5, 8].includes(componentSize)) continue;
    let dataOffset = pixMapOffset + 50 + 18;
    if (opcode === 0x009b) {
      const regionSize = u16At(pict, dataOffset) ?? 0;
      if (regionSize < 10 || dataOffset + regionSize >= pict.byteLength) continue;
      dataOffset += regionSize;
    }
    return { opcode, rowBytes, width, height, dataOffset, pixelSize, packType, componentCount };
  }
  if (firstDirect) throw previewError("unsupported-variant", "pict.directbits_unsupported_shape", "PICT DirectBits resource is not a 32-bit PackBits RGB pixmap.", "pict", firstDirect.offset, `0x${firstDirect.opcode.toString(16).padStart(4, "0").toUpperCase()}`, "direct-bits");
  throw previewError("malformed", "pict.no_directbits_opcode", "PICT contains no DirectBits opcode.", "pict");
}

function fiveBitToU8(value: number) {
  return Math.round((value * 255) / 31);
}

function decodeOneBitPackBitsPict(pict: Uint8Array, summary: Record<string, string>): DecodedImage {
  const rect = findOneBitPackBitsRect(pict);
  const width = Math.min(rect.width, 2048);
  const height = Math.min(rect.height, 2048);
  const rgba = new Uint8ClampedArray(width * height * 4);
  let cursor = rect.dataOffset;
  summary.format = "packbits-bitmap-1";
  summary.pixelSize = "1";
  summary.rowBytes = String(rect.rowBytes);
  summary.opcode = "0x0098";
  for (let y = 0; y < rect.height; y += 1) {
    if (cursor >= pict.byteLength) throw previewError("malformed", "pict.pixel_data_truncated", "PICT 1-bit PackBits pixel data ended before all rows were decoded.", "pict", cursor, summary.opcode, summary.format);
    const packedLength = rect.rowBytes > 250 ? (u16At(pict, cursor) ?? 0) : (pict[cursor] ?? 0);
    cursor += rect.rowBytes > 250 ? 2 : 1;
    const availableLength = Math.min(packedLength, Math.max(0, pict.byteLength - cursor));
    const row = decodePackBitsRow(pict, cursor, availableLength, rect.rowBytes);
    cursor += availableLength;
    if (y >= height) continue;
    for (let x = 0; x < width; x += 1) {
      const byte = row[Math.floor(x / 8)] ?? 0;
      const bit = (byte >> (7 - (x % 8))) & 1;
      const value = bit === 1 ? 0 : 255;
      const out = (y * width + x) * 4;
      rgba[out] = value;
      rgba[out + 1] = value;
      rgba[out + 2] = value;
      rgba[out + 3] = 255;
    }
  }
  return { width, height, rgba };
}

function findOneBitPackBitsRect(pict: Uint8Array) {
  for (let offset = 10; offset + 40 < pict.byteLength; offset += 1) {
    if (pict[offset] !== 0x98) continue;
    const rowBytes = u16At(pict, offset + 1) ?? 0;
    const width = i16At(pict, offset + 9) - i16At(pict, offset + 5);
    const height = i16At(pict, offset + 7) - i16At(pict, offset + 3);
    if (rowBytes <= 0 || rowBytes > 512 || width <= 0 || height <= 0 || width > 2048 || height > 2048 || rowBytes < Math.ceil(width / 8)) continue;
    return { opcode: 0x98, rowBytes, width, height, dataOffset: offset + 29 };
  }
  throw previewError("malformed", "pict.no_one_bit_packbits", "PICT contains no old-style 1-bit PackBits bitmap opcode.", "pict");
}

function decodePackBitsRow(buffer: Uint8Array, offset: number, packedLength: number, expectedLength: number) {
  const end = Math.min(offset + packedLength, buffer.byteLength);
  const output: number[] = [];
  let cursor = offset;
  while (cursor < end && output.length < expectedLength) {
    const unsigned = buffer[cursor] ?? 0;
    const control = unsigned >= 128 ? unsigned - 256 : unsigned;
    cursor += 1;
    if (control >= 0 && control <= 127) {
      const count = control + 1;
      for (let index = 0; index < count && cursor < end; index += 1) output.push(buffer[cursor++] ?? 0);
    } else if (control >= -127 && control <= -1) {
      const count = 1 - control;
      const value = buffer[cursor++] ?? 0;
      for (let index = 0; index < count; index += 1) output.push(value);
    }
  }
  while (output.length < expectedLength) output.push(0);
  return output.slice(0, expectedLength);
}

function decodePictPackBitsRow(
  buffer: Uint8Array,
  offset: number,
  packedLength: number,
  expectedLength: number,
  packType: number
) {
  if (packType !== 3) return decodePackBitsRow(buffer, offset, packedLength, expectedLength);

  const end = Math.min(offset + packedLength, buffer.byteLength);
  const output: number[] = [];
  let cursor = offset;
  while (cursor < end && output.length < expectedLength) {
    const unsigned = buffer[cursor] ?? 0;
    const control = unsigned >= 128 ? unsigned - 256 : unsigned;
    cursor += 1;
    if (control >= 0 && control <= 127) {
      const byteCount = (control + 1) * 2;
      for (let index = 0; index < byteCount && cursor < end; index += 1) output.push(buffer[cursor++] ?? 0);
    } else if (control >= -127 && control <= -1 && cursor + 1 < end) {
      const count = 1 - control;
      const high = buffer[cursor++] ?? 0;
      const low = buffer[cursor++] ?? 0;
      for (let index = 0; index < count; index += 1) output.push(high, low);
    }
  }
  while (output.length < expectedLength) output.push(0);
  return output.slice(0, expectedLength);
}

function decodeCicn(cicn: Uint8Array): DecodedImage {
  if (cicn.byteLength < 82) throw new Error("cicn too short");
  const rowBytes = (u16At(cicn, 4) ?? 0) & 0x3fff;
  const width = Math.max(0, i16At(cicn, 12) - i16At(cicn, 8));
  const height = Math.max(0, i16At(cicn, 10) - i16At(cicn, 6));
  const pixelSize = u16At(cicn, 32) ?? 0;
  const maskRowBytes = (u16At(cicn, 54) ?? 0) & 0x3fff;
  const maskTop = i16At(cicn, 56);
  const maskBottom = i16At(cicn, 60);
  const maskHeight = maskBottom > maskTop ? maskBottom - maskTop : height;
  const bitmapRowBytes = (u16At(cicn, 68) ?? 0) & 0x3fff;
  const bitmapTop = i16At(cicn, 70);
  const bitmapBottom = i16At(cicn, 74);
  const bitmapHeight = bitmapBottom > bitmapTop ? bitmapBottom - bitmapTop : 0;
  if (width <= 0 || height <= 0 || width > 512 || height > 512 || ![1, 2, 4, 8].includes(pixelSize)) {
    throw new Error("Unsupported cicn geometry");
  }
  const maskOffset = 82;
  const bitmapOffset = maskOffset + maskRowBytes * maskHeight;
  const colorTableOffset = bitmapOffset + bitmapRowBytes * bitmapHeight;
  const colorCount = (u16At(cicn, colorTableOffset + 6) ?? -1) + 1;
  const pixelDataOffset = colorTableOffset + 8 + colorCount * 8;
  if (colorCount < 1 || pixelDataOffset + rowBytes * height > cicn.byteLength) throw new Error("cicn truncated");
  const colorTableFlags = u16At(cicn, colorTableOffset + 4) ?? 0;
  const colorEntries: Array<{ colorNum: number; rgb: [number, number, number] }> = [];
  for (let index = 0; index < colorCount; index += 1) {
    const offset = colorTableOffset + 8 + index * 8;
    colorEntries.push({
      colorNum: u16At(cicn, offset) ?? index,
      rgb: [
        colorComponent8(u16At(cicn, offset + 2) ?? 0),
        colorComponent8(u16At(cicn, offset + 4) ?? 0),
        colorComponent8(u16At(cicn, offset + 6) ?? 0)
      ]
    });
  }
  const maxPixelValue = (1 << pixelSize) - 1;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let colorIndex = 0;
      if (pixelSize === 8) colorIndex = cicn[pixelDataOffset + y * rowBytes + x] ?? 0;
      else if (pixelSize === 4) {
        const byte = cicn[pixelDataOffset + y * rowBytes + Math.floor(x / 2)] ?? 0;
        colorIndex = x % 2 === 0 ? byte >> 4 : byte & 0x0f;
      } else if (pixelSize === 2) {
        const byte = cicn[pixelDataOffset + y * rowBytes + Math.floor(x / 4)] ?? 0;
        colorIndex = (byte >> (6 - (x % 4) * 2)) & 0x03;
      } else {
        const byte = cicn[pixelDataOffset + y * rowBytes + Math.floor(x / 8)] ?? 0;
        colorIndex = (byte >> (7 - (x % 8))) & 0x01;
      }
      const maskByte = cicn[maskOffset + y * maskRowBytes + Math.floor(x / 8)] ?? 0;
      const color = lookupColorTableEntry(colorEntries, colorTableFlags, colorIndex)
        ?? (colorIndex === maxPixelValue ? [0, 0, 0] : [0, 0, 0]);
      const out = (y * width + x) * 4;
      rgba[out] = color[0];
      rgba[out + 1] = color[1];
      rgba[out + 2] = color[2];
      rgba[out + 3] = ((maskByte >> (7 - (x % 8))) & 1) === 1 ? 255 : 0;
    }
  }
  return { width, height, rgba };
}

function lookupColorTableEntry(
  entries: Array<{ colorNum: number; rgb: [number, number, number] }>,
  flags: number,
  colorId: number
) {
  if ((flags & 0x8000) !== 0) return entries[colorId]?.rgb ?? null;
  return entries.find((entry) => entry.colorNum === colorId)?.rgb ?? null;
}

function colorComponent8(component: number) {
  return Math.floor(component / 0x0101);
}

function colorTablePaletteIndex(flags: number, entryIndex: number, colorIndex: number, paletteLength: number) {
  if ((flags & 0x8000) !== 0) return entryIndex;
  return colorIndex >= 0 && colorIndex < paletteLength ? colorIndex : entryIndex;
}

function decodeSndToWav(data: Uint8Array, summary: Record<string, string>) {
  const format = i16At(data, 0);
  summary.format = String(format ?? "missing");
  if (format === 2) return decodeFormatTwoSndToWav(data, summary);
  if (data.byteLength < 44 || format !== 1) throw previewError("unsupported-variant", "snd.unsupported_format", `snd resource format ${format ?? "missing"} is not a sampled-sound variant Providence can play yet.`, "snd", undefined, undefined, `format-${format ?? "missing"}`);
  const commandCountOffset = 10;
  const commandCount = u16At(data, commandCountOffset) ?? 0;
  let headerOffset: number | null = null;
  let cursor = commandCountOffset + 2;
  const commands: string[] = [];
  for (let index = 0; index < commandCount; index += 1) {
    if (cursor + 8 > data.byteLength) break;
    const command = u16At(data, cursor) ?? 0;
    const offset = u32At(data, cursor + 4) ?? 0;
    commands.push(`0x${command.toString(16).padStart(4, "0").toUpperCase()}@${offset}`);
    if ((command & 0x7fff) === 0x0051 && (command & 0x8000) !== 0) {
      headerOffset = offset;
      break;
    }
    cursor += 8;
  }
  if (headerOffset === null) throw previewError("unsupported-variant", "snd.no_buffer_command", `format-1 snd has no bufferCmd sound header. Commands: ${commands.join(", ")}`, "snd", undefined, undefined, "format-1");
  if (headerOffset + 22 > data.byteLength) throw previewError("malformed", "snd.header_out_of_range", "format-1 sound header points outside the resource.", "snd", headerOffset, undefined, "format-1");
  const length = u32At(data, headerOffset + 4) ?? 0;
  const sampleRateFixed = u32At(data, headerOffset + 8) ?? (22254 << 16);
  const sampleRate = Math.max(1, sampleRateFixed >>> 16);
  const sampleStart = headerOffset + 22;
  if (sampleStart + length > data.byteLength) throw previewError("malformed", "snd.sample_truncated", `format-1 declares ${length} sample bytes, but the resource ends early.`, "snd", sampleStart, undefined, "format-1");
  const samples = data.slice(sampleStart, sampleStart + length);
  const playable = browserPlayablePcm(sampleRate, samples);
  summary.sampleRate = String(sampleRate);
  if (playable.sampleRate !== sampleRate) summary.playbackSampleRate = String(playable.sampleRate);
  summary.samples = String(length);
  summary.variant = "format-1";
  return encodeWavU8(playable.sampleRate, playable.samples);
}

function decodeFormatTwoSndToWav(data: Uint8Array, summary: Record<string, string>) {
  if (data.byteLength < 36) throw previewError("malformed", "snd.format2_truncated", "format-2 sampled snd resource is truncated before its sound header.", "snd", undefined, undefined, "format-2");
  const commandCount = u16At(data, 4) ?? 0;
  const command = u16At(data, 6) ?? 0;
  const commandParam = u32At(data, 10) ?? 0;
  if (commandCount === 0 || (command & 0x7fff) !== 0x0051) {
    throw previewError("unsupported-variant", "snd.format2_no_buffer_command", `format-2 snd expected a bufferCmd at offset 6; found commandCount=${commandCount}, command=0x${command.toString(16).padStart(4, "0").toUpperCase()}.`, "snd", 6, `0x${command.toString(16).padStart(4, "0").toUpperCase()}`, "format-2");
  }
  const headerOffset = 14;
  const length = u32At(data, headerOffset + 4) ?? 0;
  const sampleRateFixed = u32At(data, headerOffset + 8) ?? (22254 << 16);
  const sampleRate = Math.max(1, sampleRateFixed >>> 16);
  const sampleStart = headerOffset + 22;
  if (sampleStart + length > data.byteLength) throw previewError("malformed", "snd.sample_truncated", `format-2 declares ${length} sample bytes, but the resource ends early.`, "snd", sampleStart, undefined, "format-2");
  const samples = data.slice(sampleStart, sampleStart + length);
  const playable = browserPlayablePcm(sampleRate, samples);
  summary.sampleRate = String(sampleRate);
  if (playable.sampleRate !== sampleRate) summary.playbackSampleRate = String(playable.sampleRate);
  summary.samples = String(length);
  summary.variant = `format-2 commandParam=${commandParam}`;
  return encodeWavU8(playable.sampleRate, playable.samples);
}

function browserPlayablePcm(sampleRate: number, samples: Uint8Array) {
  if (sampleRate >= 8000) return { sampleRate, samples };
  const targetRate = 8000;
  const length = Math.max(1, Math.round(samples.byteLength * targetRate / Math.max(1, sampleRate)));
  const output = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    output[index] = samples[Math.min(samples.byteLength - 1, Math.floor(index * sampleRate / targetRate))] ?? 128;
  }
  return { sampleRate: targetRate, samples: output };
}

function encodeWavU8(sampleRate: number, samples: Uint8Array) {
  const wav = new Uint8Array(44 + samples.byteLength);
  writeAscii(wav, 0, "RIFF");
  writeU32Le(wav, 4, 36 + samples.byteLength);
  writeAscii(wav, 8, "WAVEfmt ");
  writeU32Le(wav, 16, 16);
  writeU16Le(wav, 20, 1);
  writeU16Le(wav, 22, 1);
  writeU32Le(wav, 24, sampleRate);
  writeU32Le(wav, 28, sampleRate);
  writeU16Le(wav, 32, 1);
  writeU16Le(wav, 34, 8);
  writeAscii(wav, 36, "data");
  writeU32Le(wav, 40, samples.byteLength);
  wav.set(samples, 44);
  return wav;
}

function decodeClassicText(bytes: Uint8Array) {
  let output = "";
  let lastSpace = false;
  for (const byte of bytes) {
    if (byte === 0) break;
    const ch = byte <= 31 ? " " : String.fromCharCode(byte);
    if (/\s/.test(ch)) {
      if (!lastSpace) output += " ";
      lastSpace = true;
    } else {
      output += ch;
      lastSpace = false;
    }
  }
  return output.trim();
}

function decodeStringList(bytes: Uint8Array) {
  const count = u16At(bytes, 0) ?? 0;
  const strings: string[] = [];
  let cursor = 2;
  for (let index = 0; index < count && cursor < bytes.byteLength; index += 1) {
    const length = bytes[cursor] ?? 0;
    cursor += 1;
    const end = Math.min(cursor + length, bytes.byteLength);
    strings.push(decodeClassicText(bytes.slice(cursor, end)));
    cursor = end;
  }
  return strings;
}

function describeStyl(bytes: Uint8Array) {
  return [
    "Style resource",
    `Run count candidate: ${u16At(bytes, 0) ?? 0}`,
    `Bytes: ${bytes.byteLength}`,
    "Providence pairs styl resources with TEXT content for inspection; visual style rendering is metadata-only in this pass."
  ].join("\n");
}

function describeMetadata(resourceType: string, bytes: Uint8Array) {
  return [
    `${resourceType.trim()} metadata resource`,
    `Bytes: ${bytes.byteLength}`,
    decodeClassicText(bytes.slice(0, Math.min(240, bytes.byteLength)))
  ].filter(Boolean).join("\n");
}

function bytesToDataUrl(mimeType: string, bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.slice(offset, offset + 0x8000));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function u16At(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function i16At(bytes: Uint8Array, offset: number) {
  const value = u16At(bytes, offset);
  if (value === null) return 0;
  return value >= 0x8000 ? value - 0x10000 : value;
}

function u32At(bytes: Uint8Array, offset: number) {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

function writeU16Le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
}

function writeU32Le(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
  bytes[offset + 2] = (value >> 16) & 0xff;
  bytes[offset + 3] = (value >> 24) & 0xff;
}

type PreviewFailure = Error & {
  previewStatus?: ResourcePreviewStatus;
  diagnostic?: ResourcePreviewDiagnostic;
};

function previewReady(mimeType: string, dataUrl: string | null, summary: Record<string, string>): DecodedResourcePreview {
  return { status: "preview-ready", mimeType, dataUrl, summary, diagnostics: [] };
}

function playable(dataUrl: string | null, summary: Record<string, string>): DecodedResourcePreview {
  return { status: "playable", mimeType: "audio/wav", dataUrl, summary, diagnostics: [] };
}

function textReady(text: string, summary: Record<string, string>): DecodedResourcePreview {
  return {
    status: "text-ready",
    mimeType: "text/plain",
    dataUrl: `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`,
    summary,
    diagnostics: []
  };
}

function metadata(status: ResourcePreviewStatus, mimeType: string, summary: Record<string, string>, diagnosticValue: ResourcePreviewDiagnostic): DecodedResourcePreview {
  return { status, mimeType, dataUrl: null, summary, diagnostics: [diagnosticValue] };
}

function diagnostic(severity: string, code: string, message: string, decoder: string, variant?: string): ResourcePreviewDiagnostic {
  return { severity, code, message, decoder, variant };
}

function previewError(
  status: ResourcePreviewStatus,
  code: string,
  message: string,
  decoder: string,
  offset?: number,
  opcode?: string,
  variant?: string,
  hint?: string
) {
  const error = new Error(message) as PreviewFailure;
  error.previewStatus = status;
  error.diagnostic = { severity: status === "malformed" ? "error" : "warning", code, message, decoder, offset, opcode, variant, hint };
  return error;
}

function normalizePreviewError(error: unknown, resourceType: string) {
  const failure = error as PreviewFailure;
  if (failure?.diagnostic && failure.previewStatus) {
    return { status: failure.previewStatus, diagnostic: failure.diagnostic };
  }
  return {
    status: "unsupported-variant" as ResourcePreviewStatus,
    diagnostic: diagnostic(
      "warning",
      "resource.preview_failed",
      error instanceof Error ? error.message : `Preview failed for ${resourceType}.`,
      resourceType.trim() || "resource-preview",
      resourceType.trim()
    )
  };
}

function fallbackMime(resourceType: string) {
  if (resourceType === "PICT") return "image/pict";
  if (resourceType === "cicn") return "image/cicn";
  if (resourceType === "snd ") return "audio/x-mac-snd";
  if (resourceType === "TEXT" || resourceType === "STR#") return "text/plain";
  return "application/octet-stream";
}
