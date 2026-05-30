import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const roundtripLedgerPath = path.join(repoRoot, "docs/generated/scenario-byte-roundtrip-ledger.json");
const resourceForkInventoryPath = path.join(repoRoot, "docs/generated/resource-fork-inventory.json");
const outputPath = path.join(repoRoot, "docs/generated/custom-landlook-coverage.json");

const MAPSTATS_RECORD_BYTES = 40;
const MAPSTATS_RECORDS = 201;
const BASE_TILE_OFFSET = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS;
const BASE_SCALE_OFFSET = BASE_TILE_OFFSET + 2;
const RANGE_TAIL_OFFSET = BASE_TILE_OFFSET + 4;
const RANGE_SLOT_BYTES = 6;
const RANGE_SLOTS = 10;
const EXPECTED_BYTES = RANGE_TAIL_OFFSET + RANGE_SLOT_BYTES * RANGE_SLOTS;

const CUSTOM_METADATA = [
  { landlook: 6, metadataFile: "Data Custom 1 BD", customFile: "Custom 1", pictId: 306 },
  { landlook: 7, metadataFile: "Data Custom 2 BD", customFile: "Custom 2", pictId: 307 },
  { landlook: 8, metadataFile: "Data Custom 3 BD", customFile: "Custom 3", pictId: 308 }
];

const roundtripLedger = readJson(roundtripLedgerPath);
const resourceInventory = readOptionalJson(resourceForkInventoryPath);
const resourceIndex = indexResources(resourceInventory);
const scenarios = [];
const aggregate = {
  metadataFiles: {},
  customFiles: {},
  pictResources: {},
  byteLengths: {},
  rangeTailPatterns: new Map(),
  malformedMetadataFiles: 0,
  writerGate: {
    metadata: "writer-safe-fixture-gated",
    atlas: "preserve-or-import-replacement-only",
    customFiles: "preserved-known-until-runtime-role-proven"
  }
};

for (const scenario of roundtripLedger.scenarios ?? []) {
  const sourcePath = scenario.sourcePath;
  if (!sourcePath || !fs.existsSync(sourcePath)) continue;
  const entry = {
    name: scenario.name,
    sourceRoot: scenario.sourceRoot,
    sourcePath: normalizePath(sourcePath),
    landlooks: []
  };
  for (const config of CUSTOM_METADATA) {
    const metadataPath = path.join(sourcePath, config.metadataFile);
    const customPath = path.join(sourcePath, config.customFile);
    const metadata = fs.existsSync(metadataPath)
      ? decodeMetadata(fs.readFileSync(metadataPath), config)
      : null;
    const customFile = fs.existsSync(customPath)
      ? {
          fileName: config.customFile,
          bytes: fs.statSync(customPath).size,
          role: "preserved-known-custom-landlook-companion",
          writerStatus: "preserve-only-until-runtime-role-proven"
        }
      : null;
    const pict = resourceIndex.get(`${scenario.sourceRoot}\u0000${scenario.name}\u0000${config.pictId}`) ?? null;
    if (metadata || customFile || pict) {
      entry.landlooks.push({
        landlook: config.landlook,
        metadata,
        customFile,
        linkedPict: pict
          ? {
              id: config.pictId,
              resourceFile: pict.fileName,
              bytes: pict.dataLength,
              role: "scenario-custom-landlook-atlas",
              writerStatus: "preserved-or-replace-through-known-good-pict-import"
            }
          : null,
        artifactStatus: artifactStatus(metadata, customFile, pict)
      });
    }
    aggregateSeen(config, metadata, customFile, pict);
  }
  if (entry.landlooks.length > 0) scenarios.push(entry);
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources: {
    roundtripLedger: "docs/generated/scenario-byte-roundtrip-ledger.json",
    resourceForkInventory: resourceInventory ? "docs/generated/resource-fork-inventory.json" : null,
    evidenceCard: "docs/format-evidence-cards/custom-landlook-writers.md"
  },
  layout: {
    metadataFiles: CUSTOM_METADATA.map((config) => config.metadataFile),
    landlookToPict: Object.fromEntries(CUSTOM_METADATA.map((config) => [config.landlook, config.pictId])),
    mapstatsRecords: MAPSTATS_RECORDS,
    mapstatsRecordBytes: MAPSTATS_RECORD_BYTES,
    baseTileOffset: BASE_TILE_OFFSET,
    baseScaleOffset: BASE_SCALE_OFFSET,
    rangeTailOffset: RANGE_TAIL_OFFSET,
    rangeSlots: RANGE_SLOTS,
    rangeSlotBytes: RANGE_SLOT_BYTES,
    expectedBytes: EXPECTED_BYTES
  },
  ownership: {
    recordBytes: { start: 0, endExclusive: BASE_TILE_OFFSET, status: "decoded-writable", field: "mapstats records" },
    baseTile: { start: BASE_TILE_OFFSET, endExclusive: BASE_TILE_OFFSET + 2, status: "decoded-writable" },
    baseScale: { start: BASE_SCALE_OFFSET, endExclusive: BASE_SCALE_OFFSET + 2, status: "decoded-writable" },
    rangeTail: { start: RANGE_TAIL_OFFSET, endExclusive: EXPECTED_BYTES, status: "mixed-writable-preserved", preservedFields: ["reserved"] },
    trailingBytes: { start: EXPECTED_BYTES, status: "preserved-known-if-present" }
  },
  writerGate: aggregate.writerGate,
  summary: {
    scenariosWithCustomLandlooks: scenarios.length,
    metadataFileCounts: aggregate.metadataFiles,
    customFileCounts: aggregate.customFiles,
    pictResourceCounts: aggregate.pictResources,
    observedMetadataByteLengths: aggregate.byteLengths,
    malformedMetadataFiles: aggregate.malformedMetadataFiles,
    rangeTailPatterns: [...aggregate.rangeTailPatterns.values()].sort((a, b) => b.count - a.count)
  },
  scenarios
};

validate(output);
writeJson(outputPath, output);

console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
console.log(JSON.stringify(output.summary, null, 2));

function decodeMetadata(buffer, config) {
  const byteLength = buffer.length;
  const recordCount = Math.min(Math.floor(byteLength / MAPSTATS_RECORD_BYTES), MAPSTATS_RECORDS);
  const baseTile = byteLength >= BASE_TILE_OFFSET + 2 ? i16be(buffer, BASE_TILE_OFFSET) : null;
  const baseScale = byteLength >= BASE_SCALE_OFFSET + 2 ? i16be(buffer, BASE_SCALE_OFFSET) : null;
  const rangeSlots = [];
  if (byteLength >= RANGE_TAIL_OFFSET + RANGE_SLOT_BYTES) {
    const count = Math.min(Math.floor((byteLength - RANGE_TAIL_OFFSET) / RANGE_SLOT_BYTES), RANGE_SLOTS);
    for (let slot = 0; slot < count; slot += 1) {
      const start = RANGE_TAIL_OFFSET + slot * RANGE_SLOT_BYTES;
      rangeSlots.push({
        slot,
        label: rangeLabel(slot),
        firstTile: i16be(buffer, start),
        lastTile: i16be(buffer, start + 2),
        reserved: i16be(buffer, start + 4),
        firstTileStatus: slot < 4 ? "decoded-writable" : "preserved-known",
        lastTileStatus: slot < 4 ? "decoded-writable" : "preserved-known",
        reservedStatus: "preserved-known"
      });
    }
  }
  const nonZeroRanges = rangeSlots.filter((slot) => slot.firstTile !== 0 || slot.lastTile !== 0 || slot.reserved !== 0);
  const status = byteLength === EXPECTED_BYTES
    ? "decoded-writer-gated"
    : byteLength > EXPECTED_BYTES
      ? "decoded-with-preserved-trailing-bytes"
      : "malformed-preserve-only";
  return {
    fileName: config.metadataFile,
    bytes: byteLength,
    expectedBytes: EXPECTED_BYTES,
    status,
    recordCount,
    baseTile,
    baseScale,
    rangeSlots,
    nonZeroRanges,
    trailingBytes: Math.max(0, byteLength - EXPECTED_BYTES),
    writerStatus: status.startsWith("decoded") ? "metadata-writer-safe-after-fixture-proof" : "preserve-only"
  };
}

function aggregateSeen(config, metadata, customFile, pict) {
  if (metadata) {
    aggregate.metadataFiles[config.metadataFile] = (aggregate.metadataFiles[config.metadataFile] ?? 0) + 1;
    aggregate.byteLengths[metadata.bytes] = (aggregate.byteLengths[metadata.bytes] ?? 0) + 1;
    if (metadata.status === "malformed-preserve-only") aggregate.malformedMetadataFiles += 1;
    const patternKey = JSON.stringify(metadata.nonZeroRanges.map(({ slot, firstTile, lastTile, reserved }) => ({ slot, firstTile, lastTile, reserved })));
    const existing = aggregate.rangeTailPatterns.get(patternKey) ?? { count: 0, ranges: metadata.nonZeroRanges, examples: [] };
    existing.count += 1;
    if (existing.examples.length < 3) existing.examples.push(`${config.metadataFile}`);
    aggregate.rangeTailPatterns.set(patternKey, existing);
  }
  if (customFile) aggregate.customFiles[config.customFile] = (aggregate.customFiles[config.customFile] ?? 0) + 1;
  if (pict) aggregate.pictResources[`PICT ${config.pictId}`] = (aggregate.pictResources[`PICT ${config.pictId}`] ?? 0) + 1;
}

function artifactStatus(metadata, customFile, pict) {
  if (!metadata && !pict && !customFile) return "absent";
  if (metadata?.status === "malformed-preserve-only") return "preserve-only-malformed-metadata";
  if (metadata && pict) return "metadata-and-atlas-present";
  if (metadata && !pict) return "metadata-present-atlas-missing";
  if (!metadata && pict) return "atlas-present-metadata-missing";
  return "compatibility-companion-only";
}

function indexResources(resourceInventory) {
  const out = new Map();
  for (const fork of resourceInventory?.forks ?? []) {
    for (const resource of fork.resources ?? []) {
      if (resource.type === "PICT" && resource.id >= 306 && resource.id <= 308) {
        out.set(`${fork.sourceRoot}\u0000${fork.scenario}\u0000${resource.id}`, {
          fileName: fork.fileName,
          dataLength: resource.dataLength,
          name: resource.name ?? ""
        });
      }
    }
  }
  return out;
}

function validate(output) {
  for (const scenario of output.scenarios) {
    for (const landlook of scenario.landlooks) {
      if (landlook.metadata && landlook.metadata.rangeSlots.length > RANGE_SLOTS) {
        throw new Error(`${scenario.name} landlook ${landlook.landlook} has too many range slots`);
      }
    }
  }
}

function rangeLabel(slot) {
  return ["Mountain range", "Open range", "Rubble range", "House range"][slot] ?? "Reserved range";
}

function i16be(buffer, offset) {
  const unsigned = (buffer[offset] << 8) | buffer[offset + 1];
  return unsigned >= 0x8000 ? unsigned - 0x10000 : unsigned;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}
