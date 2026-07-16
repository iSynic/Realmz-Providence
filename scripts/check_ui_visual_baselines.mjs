import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATRIX_PATH = path.join(ROOT, "docs", "ui-audit-matrix.json");
const MANIFEST_PATH = path.join(ROOT, "docs", "ui-visual-baselines.json");
const DEFAULT_CAPTURE_DIR = path.join(ROOT, "tmp", "ui-audit", "captures");
const DEFAULT_KEYS = ["scenario.startup", "scripts.action-points", "encounters.complex", "text.messages"];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const args = parseArgs(process.argv.slice(2));

export function compareFingerprints(actual, expected) {
  assert.equal(actual.length, expected.length, "fingerprints must have equal lengths");
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference += Math.abs(actual[index] - expected[index]);
  return difference / actual.length;
}

export function validateManifest(manifest, matrix) {
  const problems = [];
  if (manifest.schemaVersion !== 1) problems.push(`Unsupported visual baseline schemaVersion ${manifest.schemaVersion}.`);
  if (!Number.isInteger(manifest.sampleWidth) || manifest.sampleWidth < 8) problems.push("sampleWidth must be an integer of at least 8.");
  if (!Number.isInteger(manifest.sampleHeight) || manifest.sampleHeight < 8) problems.push("sampleHeight must be an integer of at least 8.");
  if (typeof manifest.maxMeanAbsoluteError !== "number" || manifest.maxMeanAbsoluteError <= 0) problems.push("maxMeanAbsoluteError must be positive.");
  if (!Array.isArray(manifest.baselines) || manifest.baselines.length === 0) return [...problems, "baselines must be a non-empty array."];

  const tools = new Map(matrix.tools.map((tool) => [tool.key, tool]));
  const viewports = new Map(matrix.viewports.map((viewport) => [viewport.id, viewport]));
  const baselineIds = new Set();
  const coveredViewports = new Map();
  for (const baseline of manifest.baselines) {
    const id = `${baseline.key}:${baseline.viewport}:${baseline.state ?? "base"}`;
    if (baselineIds.has(id)) problems.push(`Duplicate visual baseline ${id}.`);
    baselineIds.add(id);
    const tool = tools.get(baseline.key);
    if (!tool) problems.push(`${id} references an unknown tool.`);
    else if (tool.capture.route !== "ready") problems.push(`${id} references a tool without a ready capture route.`);
    const viewport = viewports.get(baseline.viewport);
    if (!viewport) problems.push(`${id} references unknown viewport ${baseline.viewport}.`);
    else if (baseline.width !== viewport.width || baseline.height !== viewport.height) {
      problems.push(`${id} dimensions ${baseline.width}x${baseline.height} do not match ${viewport.width}x${viewport.height}.`);
    }
    if (typeof baseline.file !== "string" || !baseline.file.endsWith(".png")) problems.push(`${id} requires a PNG file name.`);
    if (typeof baseline.fingerprint !== "string" || baseline.fingerprint.length === 0) problems.push(`${id} requires a fingerprint.`);
    if (!coveredViewports.has(baseline.key)) coveredViewports.set(baseline.key, new Set());
    coveredViewports.get(baseline.key).add(baseline.viewport);
  }
  for (const [key, covered] of coveredViewports) {
    for (const viewport of viewports.keys()) {
      if (!covered.has(viewport)) problems.push(`${key} is missing the ${viewport} visual baseline.`);
    }
  }
  return problems;
}

function runSelfTest() {
  assert.equal(compareFingerprints(Buffer.from([0, 20, 40]), Buffer.from([0, 20, 40])), 0);
  assert.equal(compareFingerprints(Buffer.from([0, 20, 40]), Buffer.from([3, 23, 43])), 3);
  const matrix = {
    viewports: [{ id: "desktop", width: 100, height: 80 }, { id: "compact", width: 80, height: 60 }],
    tools: [{ key: "scenario.startup", capture: { route: "ready" } }]
  };
  const manifest = {
    schemaVersion: 1,
    sampleWidth: 8,
    sampleHeight: 8,
    maxMeanAbsoluteError: 6,
    baselines: [
      { key: "scenario.startup", viewport: "desktop", state: "base", file: "desktop.png", width: 100, height: 80, fingerprint: "AA==" },
      { key: "scenario.startup", viewport: "compact", state: "base", file: "compact.png", width: 80, height: 60, fingerprint: "AA==" }
    ]
  };
  assert.deepEqual(validateManifest(manifest, matrix), []);
  assert.match(validateManifest({ ...manifest, baselines: manifest.baselines.slice(0, 1) }, matrix)[0] ?? "", /missing the compact/);
  console.log("UI visual baseline self-test passed (dimensions, viewport coverage, and perceptual differences are enforced)." );
}

function runRecord() {
  const matrix = readJson(MATRIX_PATH);
  const captureDirectory = path.resolve(ROOT, args.get("capture-dir") ?? path.relative(ROOT, DEFAULT_CAPTURE_DIR));
  const keys = (args.get("capture") ?? DEFAULT_KEYS.join(",")).split(",").map((value) => value.trim()).filter(Boolean);
  const viewportIds = (args.get("viewports") ?? matrix.viewports.map((viewport) => viewport.id).join(",")).split(",").map((value) => value.trim()).filter(Boolean);
  const sampleWidth = 48;
  const sampleHeight = 30;
  const baselines = [];
  for (const key of keys) {
    for (const viewportId of viewportIds) {
      const file = `${safeFilePart(key)}-${safeFilePart(viewportId)}.png`;
      const image = decodePng(fs.readFileSync(path.join(captureDirectory, file)));
      baselines.push({
        key,
        viewport: viewportId,
        state: "base",
        file,
        width: image.width,
        height: image.height,
        fingerprint: imageFingerprint(image, sampleWidth, sampleHeight).toString("base64")
      });
    }
  }
  const manifest = { schemaVersion: 1, sampleWidth, sampleHeight, maxMeanAbsoluteError: 6, baselines };
  const problems = validateManifest(manifest, matrix);
  if (problems.length > 0) throw new Error(problems.join("\n"));
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Recorded ${baselines.length} UI visual baselines in ${relativePath(MANIFEST_PATH)}.`);
}

function runCheck() {
  const matrix = readJson(MATRIX_PATH);
  const manifest = readJson(MANIFEST_PATH);
  const problems = validateManifest(manifest, matrix);
  if (!args.has("manifest-only") && problems.length === 0) {
    const captureDirectory = path.resolve(ROOT, args.get("capture-dir") ?? path.relative(ROOT, DEFAULT_CAPTURE_DIR));
    for (const baseline of manifest.baselines) {
      const id = `${baseline.key}:${baseline.viewport}:${baseline.state ?? "base"}`;
      const capturePath = path.join(captureDirectory, baseline.file);
      if (!fs.existsSync(capturePath)) {
        problems.push(`${id} is missing capture ${relativePath(capturePath)}.`);
        continue;
      }
      const image = decodePng(fs.readFileSync(capturePath));
      if (image.width !== baseline.width || image.height !== baseline.height) {
        problems.push(`${id} captured ${image.width}x${image.height}; expected ${baseline.width}x${baseline.height}.`);
        continue;
      }
      const actual = imageFingerprint(image, manifest.sampleWidth, manifest.sampleHeight);
      const expected = Buffer.from(baseline.fingerprint, "base64");
      if (actual.length !== expected.length) {
        problems.push(`${id} fingerprint length changed from ${expected.length} to ${actual.length}.`);
        continue;
      }
      const difference = compareFingerprints(actual, expected);
      if (difference > manifest.maxMeanAbsoluteError) {
        problems.push(`${id} visual difference ${difference.toFixed(2)} exceeds ${manifest.maxMeanAbsoluteError}.`);
      }
    }
  }
  if (problems.length > 0) {
    process.stderr.write("UI visual baseline check failed:\n");
    for (const problem of problems) process.stderr.write(`- ${problem}\n`);
    process.exitCode = 1;
    return;
  }
  const mode = args.has("manifest-only") ? "catalog" : "captures";
  console.log(`UI visual baseline check passed (${manifest.baselines.length} ${mode}, ${manifest.sampleWidth}x${manifest.sampleHeight} perceptual samples).`);
}

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("Unsupported PNG signature.");
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const compressed = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") compressed.push(data);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType) || interlace !== 0) {
    throw new Error(`Only non-interlaced 8-bit RGB/RGBA PNGs are supported; received depth ${bitDepth}, color ${colorType}, interlace ${interlace}.`);
  }
  const channels = colorType === 2 ? 3 : 4;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset++];
    const rowOffset = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const raw = inflated[sourceOffset++];
      const left = column >= channels ? pixels[rowOffset + column - channels] : 0;
      const above = row > 0 ? pixels[rowOffset - stride + column] : 0;
      const upperLeft = row > 0 && column >= channels ? pixels[rowOffset - stride + column - channels] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else if (filter === 4) value = raw + paeth(left, above, upperLeft);
      else throw new Error(`Unsupported PNG row filter ${filter}.`);
      pixels[rowOffset + column] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function imageFingerprint(image, sampleWidth, sampleHeight) {
  const samples = Buffer.alloc(sampleWidth * sampleHeight);
  for (let sampleY = 0; sampleY < sampleHeight; sampleY += 1) {
    const startY = Math.floor((sampleY * image.height) / sampleHeight);
    const endY = Math.max(startY + 1, Math.floor(((sampleY + 1) * image.height) / sampleHeight));
    for (let sampleX = 0; sampleX < sampleWidth; sampleX += 1) {
      const startX = Math.floor((sampleX * image.width) / sampleWidth);
      const endX = Math.max(startX + 1, Math.floor(((sampleX + 1) * image.width) / sampleWidth));
      let luminance = 0;
      let count = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * image.width + x) * image.channels;
          luminance += (77 * image.pixels[offset] + 150 * image.pixels[offset + 1] + 29 * image.pixels[offset + 2]) >> 8;
          count += 1;
        }
      }
      samples[sampleY * sampleWidth + sampleX] = Math.round(luminance / count);
    }
  }
  return samples;
}

function paeth(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function parseArgs(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    if (inline != null) parsed.set(key, inline);
    else if (values[index + 1] && !values[index + 1].startsWith("--")) parsed.set(key, values[++index]);
    else parsed.set(key, "true");
  }
  return parsed;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function safeFilePart(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function relativePath(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

if (args.has("self-test")) runSelfTest();
else if (args.has("record")) runRecord();
else runCheck();
