import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(repoRoot, "tmp", "pict-directbits-preview-check");

await fsp.rm(buildRoot, { recursive: true, force: true });
await fsp.mkdir(buildRoot, { recursive: true });
await fsp.writeFile(path.join(buildRoot, "package.json"), "{\"type\":\"commonjs\"}\n");

const sourceFile = "src/editor/browser/resourcePreview.ts";
const source = await fsp.readFile(path.join(repoRoot, sourceFile), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
    isolatedModules: true
  },
  fileName: sourceFile
}).outputText;
const outputPath = path.join(buildRoot, sourceFile.replace(/\.ts$/, ".js"));
await fsp.mkdir(path.dirname(outputPath), { recursive: true });
await fsp.writeFile(outputPath, transpiled);

const requireFromBuild = createRequire(path.join(buildRoot, "check.cjs"));
const { decodePictPreviewImageForTest } = requireFromBuild("./src/editor/browser/resourcePreview.js");

const synthetic = decodePictPreviewImageForTest(directbits32PlanarRectFixture());
expect(synthetic.summary.format === "directbits-32-packbits", `synthetic format: ${synthetic.summary.format}`);
expect(synthetic.width === 2 && synthetic.height === 1, `synthetic dimensions: ${synthetic.width}x${synthetic.height}`);
expectPixel(synthetic.rgba, 0, [10, 30, 50, 255], "synthetic first pixel");
expectPixel(synthetic.rgba, 1, [20, 40, 60, 255], "synthetic second pixel");

const trialPath = "F:\\Realmz\\out_win_clang\\Scenarios\\Trial by Fire\\Scenario.rsrc";
if (fs.existsSync(trialPath)) {
  const fork = extractAppleDoubleResourceFork(fs.readFileSync(trialPath));
  const pict = resourceData(fork, "PICT", 32128);
  expect(pict !== null, "Trial by Fire PICT 32128 should exist");
  const decoded = decodePictPreviewImageForTest(pict);
  expect(decoded.summary.format === "directbits-32-packbits", `Trial by Fire format: ${decoded.summary.format}`);
  expect(decoded.summary.rowBytes === "1188", `Trial by Fire rowBytes: ${decoded.summary.rowBytes}`);
  expect(decoded.width === 297 && decoded.height === 406, `Trial by Fire dimensions: ${decoded.width}x${decoded.height}`);
  expectPixel(decoded.rgba, 0, [114, 128, 199, 255], "Trial by Fire first pixel");
} else {
  console.log("Skipping Trial by Fire local PICT fixture; F:\\Realmz\\out_win_clang is absent.");
}

console.log("PICT DirectBits preview check passed.");

function directbits32PlanarRectFixture() {
  const bytes = pictHeader(2, 1);
  pushU16(bytes, 0x009a);
  pushU32(bytes, 0);
  pushU16(bytes, 0x8008);
  pushRect(bytes, 0, 0, 1, 2);
  pushU16(bytes, 0);
  pushU16(bytes, 4);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushU16(bytes, 16);
  pushU16(bytes, 32);
  pushU16(bytes, 3);
  pushU16(bytes, 8);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushU32(bytes, 0);
  pushRect(bytes, 0, 0, 1, 2);
  pushRect(bytes, 0, 0, 1, 2);
  pushU16(bytes, 0);
  bytes.push(9);
  bytes.push(7);
  bytes.push(10, 20, 30, 40, 50, 60, 0, 0);
  pushU16(bytes, 0x00ff);
  return Uint8Array.from(bytes);
}

function pictHeader(width, height) {
  const bytes = [];
  pushU16(bytes, 0);
  pushRect(bytes, 0, 0, height, width);
  return bytes;
}

function pushRect(bytes, top, left, bottom, right) {
  pushU16(bytes, top);
  pushU16(bytes, left);
  pushU16(bytes, bottom);
  pushU16(bytes, right);
}

function pushU16(bytes, value) {
  bytes.push((value >> 8) & 0xff, value & 0xff);
}

function pushU32(bytes, value) {
  bytes.push((value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff);
}

function extractAppleDoubleResourceFork(data) {
  if (u32(data, 0) !== 0x00051600 && u32(data, 0) !== 0x00051607) return data;
  const entryCount = u16(data, 24);
  for (let index = 0; index < entryCount; index += 1) {
    const offset = 26 + index * 12;
    if (u32(data, offset) !== 2) continue;
    const entryOffset = u32(data, offset + 4);
    const length = u32(data, offset + 8);
    return data.subarray(entryOffset, entryOffset + length);
  }
  throw new Error("AppleDouble resource-fork entry is missing");
}

function resourceData(fork, resourceType, resourceId) {
  const dataOffset = u32(fork, 0);
  const mapOffset = u32(fork, 4);
  const typeListOffset = mapOffset + u16(fork, mapOffset + 24);
  const nameListOffset = mapOffset + u16(fork, mapOffset + 26);
  void nameListOffset;
  const typeCount = u16(fork, typeListOffset) + 1;
  for (let typeIndex = 0; typeIndex < typeCount; typeIndex += 1) {
    const typeOffset = typeListOffset + 2 + typeIndex * 8;
    const type = String.fromCharCode(...fork.subarray(typeOffset, typeOffset + 4));
    if (type !== resourceType) continue;
    const resourceCount = u16(fork, typeOffset + 4) + 1;
    const referenceListOffset = typeListOffset + u16(fork, typeOffset + 6);
    for (let resourceIndex = 0; resourceIndex < resourceCount; resourceIndex += 1) {
      const referenceOffset = referenceListOffset + resourceIndex * 12;
      if (i16(fork, referenceOffset) !== resourceId) continue;
      const resourceOffset = dataOffset + (u32(fork, referenceOffset + 4) & 0x00ff_ffff);
      const length = u32(fork, resourceOffset);
      return fork.subarray(resourceOffset + 4, resourceOffset + 4 + length);
    }
  }
  return null;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectPixel(rgba, pixelIndex, expected, label) {
  const actual = Array.from(rgba.subarray(pixelIndex * 4, pixelIndex * 4 + 4));
  expect(expected.every((value, index) => actual[index] === value), `${label}: expected ${expected.join(",")}, got ${actual.join(",")}`);
}

function u16(bytes, offset) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function i16(bytes, offset) {
  const value = u16(bytes, offset);
  return value >= 0x8000 ? value - 0x10000 : value;
}

function u32(bytes, offset) {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}
