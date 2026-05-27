import { DecodedResourcePreview, ResourcePreviewDiagnostic, ResourcePreviewStatus } from "../types";

type DecodedImage = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

export function previewResourceDataUrl(resourceType: string, data: Uint8Array): string | null {
  return inspectResourcePreview(resourceType, data).dataUrl;
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

function decodePictPackBits(pict: Uint8Array, summary: Record<string, string>): DecodedImage {
  const failures: PreviewFailure[] = [];
  for (const decode of [decodeIndexedPictPackBits, decodeDirectBitsPict, decodeOneBitPackBitsPict]) {
    try {
      return decode(pict, summary);
    } catch (error) {
      failures.push(error as PreviewFailure);
    }
  }
  throw failures.find((failure) => failure.diagnostic)
    ?? previewError("malformed", "pict.no_drawable_opcode", "PICT contains no supported PackBits, Bits, or DirectBits drawing opcode.", "pict");
}

function decodeIndexedPictPackBits(pict: Uint8Array, summary: Record<string, string>): DecodedImage {
  const rect = findPackBitsRect(pict);
  if (!rect) throw previewError("malformed", "pict.no_drawable_opcode", "PICT contains no supported PackBits, Bits, or DirectBits drawing opcode.", "pict");
  const palette: Array<[number, number, number]> = new Array(rect.colorCount).fill([0, 0, 0]);
  for (let index = 0; index < rect.colorCount; index += 1) {
    const offset = rect.colorTableOffset + 8 + index * 8;
    const colorIndex = u16At(pict, offset) ?? index;
    palette[colorIndex] = [
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
      return { opcode, rowBytes, colorTableOffset, colorCount, width, height, dataOffset, pixelSize };
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
    const row = decodePackBitsRow(pict, cursor, availableLength, rect.rowBytes);
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
    if (!(rowBytesRaw & 0x8000) || rowBytes <= 0 || rowBytes > 8192 || width <= 0 || height <= 0 || width > 2048 || height > 2048 || pixelType !== 16 || ![16, 32].includes(pixelSize) || ![3, 4].includes(componentCount) || ![5, 8].includes(componentSize)) continue;
    let dataOffset = pixMapOffset + 50 + 18;
    if (opcode === 0x009b) {
      const regionSize = u16At(pict, dataOffset) ?? 0;
      if (regionSize < 10 || dataOffset + regionSize >= pict.byteLength) continue;
      dataOffset += regionSize;
    }
    return { opcode, rowBytes, width, height, dataOffset, pixelSize };
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
  const palette: Array<[number, number, number]> = new Array(colorCount).fill([0, 0, 0]);
  for (let index = 0; index < colorCount; index += 1) {
    const offset = colorTableOffset + 8 + index * 8;
    const colorIndex = u16At(cicn, offset) ?? index;
    palette[colorIndex] = [
      (u16At(cicn, offset + 2) ?? 0) >> 8,
      (u16At(cicn, offset + 4) ?? 0) >> 8,
      (u16At(cicn, offset + 6) ?? 0) >> 8
    ];
  }
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
      const color = palette[colorIndex] ?? palette[0] ?? [0, 0, 0];
      const out = (y * width + x) * 4;
      rgba[out] = color[0];
      rgba[out + 1] = color[1];
      rgba[out + 2] = color[2];
      rgba[out + 3] = ((maskByte >> (7 - (x % 8))) & 1) === 1 ? 255 : 0;
    }
  }
  return { width, height, rgba };
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
