export type RgbaCanvas = {
  width: number;
  height: number;
  rgba: Uint8Array | Uint8ClampedArray;
};

export function encodeCicnResource(image: RgbaCanvas): Uint8Array {
  const width = positiveDimension(image.width, "width");
  const height = positiveDimension(image.height, "height");
  if (image.rgba.length !== width * height * 4) {
    throw new Error(`RGBA byte length ${image.rgba.length} does not match ${width}x${height}.`);
  }

  const { indices, palette } = indexedPixels(image.rgba, width, height);
  const rowBytes = width;
  const maskRowBytes = Math.ceil(width / 8);
  const bitmapRowBytes = maskRowBytes;
  const maskOffset = 82;
  const bitmapOffset = maskOffset + maskRowBytes * height;
  const colorTableOffset = bitmapOffset + bitmapRowBytes * height;
  const pixelDataOffset = colorTableOffset + 8 + palette.length * 8;
  const bytes = new Uint8Array(pixelDataOffset + rowBytes * height);

  writeU16(bytes, 4, 0x8000 | rowBytes);
  writeRect(bytes, 6, 0, 0, height, width);
  writeU16(bytes, 32, 8);
  writeU16(bytes, 54, 0x8000 | maskRowBytes);
  writeRect(bytes, 56, 0, 0, height, width);
  writeU16(bytes, 68, 0x8000 | bitmapRowBytes);
  writeRect(bytes, 70, 0, 0, height, width);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = image.rgba[(y * width + x) * 4 + 3];
      if (alpha > 16) bytes[maskOffset + y * maskRowBytes + Math.floor(x / 8)] |= 1 << (7 - (x % 8));
    }
  }

  writeU16(bytes, colorTableOffset + 6, Math.max(0, palette.length - 1));
  for (let index = 0; index < palette.length; index += 1) {
    const offset = colorTableOffset + 8 + index * 8;
    const color = palette[index];
    writeU16(bytes, offset, index);
    writeU16(bytes, offset + 2, color[0] * 257);
    writeU16(bytes, offset + 4, color[1] * 257);
    writeU16(bytes, offset + 6, color[2] * 257);
  }
  bytes.set(indices, pixelDataOffset);
  return bytes;
}

export function mirrorRgbaHorizontally(image: RgbaCanvas): Uint8ClampedArray {
  const width = positiveDimension(image.width, "width");
  const height = positiveDimension(image.height, "height");
  const mirrored = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = (y * width + (width - 1 - x)) * 4;
      mirrored[targetOffset] = image.rgba[sourceOffset];
      mirrored[targetOffset + 1] = image.rgba[sourceOffset + 1];
      mirrored[targetOffset + 2] = image.rgba[sourceOffset + 2];
      mirrored[targetOffset + 3] = image.rgba[sourceOffset + 3];
    }
  }
  return mirrored;
}

function indexedPixels(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  const palette: Array<[number, number, number]> = [[0, 0, 0]];
  const paletteIndexByKey = new Map<string, number>([["0,0,0", 0]]);
  const indices = new Uint8Array(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const offset = pixel * 4;
    const alpha = rgba[offset + 3];
    if (alpha <= 16) {
      indices[pixel] = 0;
      continue;
    }
    const color: [number, number, number] = [
      quantizeChannel(rgba[offset], 32),
      quantizeChannel(rgba[offset + 1], 32),
      quantizeChannel(rgba[offset + 2], 64)
    ];
    const key = color.join(",");
    let index = paletteIndexByKey.get(key);
    if (index == null) {
      index = palette.length;
      palette.push(color);
      paletteIndexByKey.set(key, index);
    }
    indices[pixel] = index;
  }
  return { indices, palette };
}

function quantizeChannel(value: number, step: number) {
  return Math.min(255, Math.max(0, Math.round(value / step) * step));
}

function positiveDimension(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0 || value > 512) throw new Error(`Invalid cicn ${label}: ${value}.`);
  if (value > 32767) throw new Error(`cicn ${label} is too large for a classic QuickDraw rect.`);
  return value;
}

function writeRect(bytes: Uint8Array, offset: number, top: number, left: number, bottom: number, right: number) {
  writeI16(bytes, offset, top);
  writeI16(bytes, offset + 2, left);
  writeI16(bytes, offset + 4, bottom);
  writeI16(bytes, offset + 6, right);
}

function writeI16(bytes: Uint8Array, offset: number, value: number) {
  const normalized = value < 0 ? 0x10000 + value : value;
  writeU16(bytes, offset, normalized);
}

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >> 8) & 0xff;
  bytes[offset + 1] = value & 0xff;
}
