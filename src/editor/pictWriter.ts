type QuantizedColor = {
  color: [number, number, number];
  count: number;
};

/** Encode normalized RGBA pixels as the indexed PackBits PICT form used by Providence. */
export function encodePictResource(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 0x7fff || height > 0x7fff) {
    throw new Error(`Invalid PICT dimensions ${width} x ${height}.`);
  }
  if (rgba.byteLength !== width * height * 4) {
    throw new Error(`PICT RGBA payload has ${rgba.byteLength} bytes; expected ${width * height * 4}.`);
  }

  const palette = adaptivePalette(rgba);
  const indices = quantizeNearest(rgba, palette);
  const pict = new Array<number>(10).fill(0);
  writeRect(pict, 2, 0, 0, height, width);
  pushU16(pict, 0x0098);
  pushU16(pict, 0x8000 | width);
  pushRect(pict, 0, 0, height, width);
  pushU16(pict, 0);
  pushU16(pict, 0);
  pushU32(pict, 0);
  pushU32(pict, 0);
  pushU32(pict, 0);
  pushU16(pict, 0);
  pushU16(pict, 8);
  pushU16(pict, 1);
  pushU16(pict, 8);
  pushU32(pict, 0);
  pushU32(pict, 0);
  pushU32(pict, 0);
  pushU32(pict, 0);
  pushU16(pict, 0);
  pushU16(pict, Math.max(0, palette.length - 1));
  for (const [index, color] of palette.entries()) {
    pushU16(pict, index);
    pushU16(pict, color[0] * 257);
    pushU16(pict, color[1] * 257);
    pushU16(pict, color[2] * 257);
  }
  pushRect(pict, 0, 0, height, width);
  pushRect(pict, 0, 0, height, width);
  pushU16(pict, 0);
  for (let y = 0; y < height; y += 1) {
    const packed = packBits(indices.subarray(y * width, (y + 1) * width));
    if (width > 250) pushU16(pict, packed.length);
    else pict.push(Math.min(255, packed.length));
    pict.push(...packed);
  }
  pushU16(pict, 0x00ff);
  writeU16(pict, 0, Math.min(0x7fff, pict.length));
  return Uint8Array.from(pict);
}

export function binaryDataUrl(bytes: Uint8Array) {
  let binary = "";
  const chunkBytes = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkBytes) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkBytes));
  }
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}

/** Identify the normalized 640 x 320 indexed PackBits PICT form emitted for Custom 1-3. */
export function isNormalizedLandlookAtlasPict(bytes: Uint8Array) {
  return bytes.byteLength >= 14
    && readU16(bytes, 2) === 0
    && readU16(bytes, 4) === 0
    && readU16(bytes, 6) === 320
    && readU16(bytes, 8) === 640
    && readU16(bytes, 10) === 0x0098
    && readU16(bytes, 12) === (0x8000 | 640);
}

function adaptivePalette(rgba: Uint8Array | Uint8ClampedArray) {
  const histogram = new Map<number, number>();
  for (let offset = 0; offset < rgba.byteLength; offset += 4) {
    const key = ((rgba[offset] & 0xf8) << 16) | ((rgba[offset + 1] & 0xf8) << 8) | (rgba[offset + 2] & 0xf8);
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  if (histogram.size === 0) return [[0, 0, 0] as [number, number, number]];
  const colors = [...histogram.entries()]
    .sort(([left], [right]) => left - right)
    .map(([key, count]): QuantizedColor => ({
      color: [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff],
      count
    }));
  if (colors.length <= 256) return colors.map((entry) => entry.color);

  const buckets: QuantizedColor[][] = [colors];
  while (buckets.length < 256) {
    let selected = -1;
    let selectedScore = -1;
    for (const [index, bucket] of buckets.entries()) {
      if (bucket.length <= 1) continue;
      const score = bucketScore(bucket);
      if (score >= selectedScore) {
        selected = index;
        selectedScore = score;
      }
    }
    if (selected < 0) break;
    const bucket = buckets[selected];
    const last = buckets.pop()!;
    if (selected < buckets.length) buckets[selected] = last;
    const [left, right] = splitColorBucket(bucket);
    if (left.length === 0 || right.length === 0) {
      buckets.push([...left, ...right]);
      break;
    }
    buckets.push(left, right);
  }
  return buckets.map(weightedAverageColor).sort(compareColor).slice(0, 256);
}

function bucketScore(bucket: QuantizedColor[]) {
  const [minimum, maximum] = bucketBounds(bucket);
  const range = Math.max(...minimum.map((value, channel) => maximum[channel] - value));
  return range * bucket.reduce((total, entry) => total + entry.count, 0);
}

function splitColorBucket(bucket: QuantizedColor[]): [QuantizedColor[], QuantizedColor[]] {
  const [minimum, maximum] = bucketBounds(bucket);
  let channel = 0;
  let channelRange = -1;
  for (let candidate = 0; candidate < 3; candidate += 1) {
    const range = maximum[candidate] - minimum[candidate];
    if (range >= channelRange) {
      channel = candidate;
      channelRange = range;
    }
  }
  bucket.sort((left, right) => left.color[channel] - right.color[channel]);
  const half = Math.floor(bucket.reduce((total, entry) => total + entry.count, 0) / 2);
  let running = 0;
  let split = 1;
  for (const [index, entry] of bucket.entries()) {
    running += entry.count;
    if (running >= half) {
      split = Math.max(1, Math.min(bucket.length - 1, index + 1));
      break;
    }
  }
  return [bucket.slice(0, split), bucket.slice(split)];
}

function bucketBounds(bucket: QuantizedColor[]): [[number, number, number], [number, number, number]] {
  const minimum: [number, number, number] = [255, 255, 255];
  const maximum: [number, number, number] = [0, 0, 0];
  for (const entry of bucket) {
    for (let channel = 0; channel < 3; channel += 1) {
      minimum[channel] = Math.min(minimum[channel], entry.color[channel]);
      maximum[channel] = Math.max(maximum[channel], entry.color[channel]);
    }
  }
  return [minimum, maximum];
}

function weightedAverageColor(bucket: QuantizedColor[]): [number, number, number] {
  const total = Math.max(1, bucket.reduce((sum, entry) => sum + entry.count, 0));
  return [0, 1, 2].map((channel) => Math.floor(bucket.reduce((sum, entry) => sum + entry.color[channel] * entry.count, 0) / total)) as [number, number, number];
}

function compareColor(left: [number, number, number], right: [number, number, number]) {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function quantizeNearest(rgba: Uint8Array | Uint8ClampedArray, palette: Array<[number, number, number]>) {
  const indices = new Uint8Array(rgba.byteLength / 4);
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const offset = pixel * 4;
    let closest = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const [index, color] of palette.entries()) {
      const red = rgba[offset] - color[0];
      const green = rgba[offset + 1] - color[1];
      const blue = rgba[offset + 2] - color[2];
      const distance = red * red + green * green + blue * blue;
      if (distance < closestDistance) {
        closest = index;
        closestDistance = distance;
      }
    }
    indices[pixel] = closest;
  }
  return indices;
}

function packBits(row: Uint8Array) {
  const output: number[] = [];
  let cursor = 0;
  while (cursor < row.length) {
    let run = 1;
    while (cursor + run < row.length && row[cursor + run] === row[cursor] && run < 128) run += 1;
    if (run >= 3) {
      output.push(257 - run, row[cursor]);
      cursor += run;
      continue;
    }
    const literalStart = cursor;
    cursor += run;
    while (cursor < row.length) {
      let nextRun = 1;
      while (cursor + nextRun < row.length && row[cursor + nextRun] === row[cursor] && nextRun < 128) nextRun += 1;
      if (nextRun >= 3 || cursor - literalStart >= 128) break;
      cursor += nextRun;
    }
    output.push(cursor - literalStart - 1, ...row.subarray(literalStart, cursor));
  }
  return output;
}

function pushRect(output: number[], top: number, left: number, bottom: number, right: number) {
  pushU16(output, top);
  pushU16(output, left);
  pushU16(output, bottom);
  pushU16(output, right);
}

function pushU16(output: number[], value: number) {
  output.push((value >>> 8) & 0xff, value & 0xff);
}

function pushU32(output: number[], value: number) {
  output.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function writeRect(output: number[], offset: number, top: number, left: number, bottom: number, right: number) {
  writeU16(output, offset, top);
  writeU16(output, offset + 2, left);
  writeU16(output, offset + 4, bottom);
  writeU16(output, offset + 6, right);
}

function writeU16(output: number[], offset: number, value: number) {
  output[offset] = (value >>> 8) & 0xff;
  output[offset + 1] = value & 0xff;
}

function readU16(bytes: Uint8Array, offset: number) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}
