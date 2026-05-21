type DecodedImage = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

export function previewResourceDataUrl(resourceType: string, data: Uint8Array): string | null {
  try {
    if (resourceType === "PICT") return imageToDataUrl(decodePictPackBits8(data));
    if (resourceType === "cicn") return imageToDataUrl(decodeCicn(data));
    if (resourceType === "snd ") return bytesToDataUrl("audio/wav", decodeSndToWav(data));
    if (resourceType === "TEXT") return `data:text/plain;charset=utf-8,${encodeURIComponent(decodeClassicText(data))}`;
    if (resourceType === "STR#") return `data:text/plain;charset=utf-8,${encodeURIComponent(decodeStringList(data).join("\n"))}`;
    if (resourceType === "styl") return `data:text/plain;charset=utf-8,${encodeURIComponent(describeStyl(data))}`;
    if (resourceType === "vers" || resourceType === "RLMZ") return `data:text/plain;charset=utf-8,${encodeURIComponent(describeMetadata(resourceType, data))}`;
  } catch {
    return null;
  }
  return null;
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

function decodePictPackBits8(pict: Uint8Array): DecodedImage {
  const rect = findPackBitsRect(pict);
  if (!rect) throw new Error("No 8-bit PackBitsRect");
  const palette: Array<[number, number, number]> = [];
  for (let index = 0; index < rect.colorCount; index += 1) {
    const offset = rect.colorTableOffset + 8 + index * 8;
    palette.push([
      (u16At(pict, offset + 2) ?? 0) >> 8,
      (u16At(pict, offset + 4) ?? 0) >> 8,
      (u16At(pict, offset + 6) ?? 0) >> 8
    ]);
  }
  const width = Math.min(rect.width, 2048);
  const height = Math.min(rect.height, 2048);
  const rgba = new Uint8ClampedArray(width * height * 4);
  let cursor = rect.dataOffset;
  for (let y = 0; y < rect.height; y += 1) {
    if (cursor >= pict.byteLength) break;
    const packedLength = rect.rowBytes > 250 ? (u16At(pict, cursor) ?? 0) : (pict[cursor] ?? 0);
    cursor += rect.rowBytes > 250 ? 2 : 1;
    const availableLength = Math.min(packedLength, Math.max(0, pict.byteLength - cursor));
    const row = decodePackBitsRow(pict, cursor, availableLength, rect.rowBytes);
    cursor += availableLength;
    if (y >= height) continue;
    for (let x = 0; x < width; x += 1) {
      const color = palette[row[x] ?? 0] ?? [0, 0, 0];
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
  for (let offset = 10; offset + 80 < pict.byteLength; offset += 2) {
    const opcode = u16At(pict, offset);
    if (opcode !== 0x0098 && opcode !== 0x0099) continue;
    const pixMapOffset = offset + 2;
    const rowBytesRaw = u16At(pict, pixMapOffset) ?? 0;
    const rowBytes = rowBytesRaw & 0x3fff;
    const pixelType = u16At(pict, pixMapOffset + 26) ?? -1;
    const pixelSize = u16At(pict, pixMapOffset + 28) ?? -1;
    const componentCount = u16At(pict, pixMapOffset + 30) ?? -1;
    const componentSize = u16At(pict, pixMapOffset + 32) ?? -1;
    if (!(rowBytesRaw & 0x8000) || rowBytes < 1 || rowBytes > 4096 || pixelType !== 0 || pixelSize !== 8 || componentCount !== 1 || componentSize !== 8) {
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
      return { rowBytes, colorTableOffset, colorCount, width, height, dataOffset };
    }
  }
  return null;
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

function decodeSndToWav(data: Uint8Array) {
  if (data.byteLength < 44 || i16At(data, 0) !== 1) throw new Error("Unsupported snd");
  const commandCountOffset = 10;
  const commandCount = u16At(data, commandCountOffset) ?? 0;
  let headerOffset: number | null = null;
  let cursor = commandCountOffset + 2;
  for (let index = 0; index < commandCount; index += 1) {
    if (cursor + 8 > data.byteLength) break;
    const command = u16At(data, cursor) ?? 0;
    const offset = u32At(data, cursor + 4) ?? 0;
    if ((command & 0x7fff) === 0x0051 && (command & 0x8000) !== 0) {
      headerOffset = offset;
      break;
    }
    cursor += 8;
  }
  if (headerOffset === null || headerOffset + 22 > data.byteLength) throw new Error("snd header missing");
  const length = u32At(data, headerOffset + 4) ?? 0;
  const sampleRateFixed = u32At(data, headerOffset + 8) ?? (22254 << 16);
  const sampleRate = Math.max(1, sampleRateFixed >>> 16);
  const sampleStart = headerOffset + 22;
  if (sampleStart + length > data.byteLength) throw new Error("snd sample truncated");
  return encodeWavU8(sampleRate, data.slice(sampleStart, sampleStart + length));
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
