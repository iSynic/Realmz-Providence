import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const roundtripLedgerPath = path.join(repoRoot, "docs/generated/scenario-byte-roundtrip-ledger.json");
const resourceForkInventoryPath = path.join(repoRoot, "docs/generated/resource-fork-inventory.json");
const resourceByteOwnershipPath = path.join(repoRoot, "docs/generated/resource-byte-ownership.json");
const resourcePayloadCodecBacklogPath = path.join(repoRoot, "docs/generated/resource-payload-codec-backlog.json");

const APPLE_SINGLE_MAGIC = 0x00051600;
const APPLE_DOUBLE_MAGIC = 0x00051607;
const RESOURCE_FORK_ENTRY_ID = 2;
const MAX_RESOURCE_TYPES = 512;
const MAX_RESOURCES_PER_TYPE = 20000;
const MAX_RESOURCE_FORK_BYTES_TO_SCAN = 80 * 1024 * 1024;

const NON_SCENARIO_IGNORES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

const CLASSIC_MAC_ICON_POLICY = {
  role: "Classic Mac file/icon resource",
  payloadStatus: "preserved-standard-media-payload",
  codecStatus: "classic-icon-family-preserved",
  codecBacklog:
    "Classic Mac file/icon-family resource preserved for Finder/interface compatibility; detailed bitplane decoding is stage-two media work, not scenario authoring data."
};

const RESOURCE_TYPE_POLICIES = {
  PICT: {
    role: "Picture resource",
    payloadStatus: "preserved-standard-media-payload",
    codecStatus: "standard-media-preserved",
    codecBacklog: "PICT container entries are located and preserved; opcode-level PICT decode/write remains a stage-two media codec task."
  },
  cicn: {
    role: "Color icon resource",
    payloadStatus: "preserved-standard-media-payload",
    codecStatus: "standard-media-preserved",
    codecBacklog: "cicn entries are located and previewable by Providence; full internal bitplane/mask ownership remains a stage-two codec task."
  },
  "snd ": {
    role: "Sound resource",
    payloadStatus: "preserved-standard-media-payload",
    codecStatus: "standard-media-preserved",
    codecBacklog: "snd resources are located and playable where supported; every classic snd command variant still needs deeper codec ownership."
  },
  TEXT: {
    role: "Text resource",
    payloadStatus: "decoded-resource-payload",
    codecStatus: "decoded-text-payload",
    codecBacklog: "Classic text bytes are decoded for reference viewing; writing remains scoped to project-owned text assets."
  },
  "STR#": {
    role: "String list resource",
    payloadStatus: "decoded-resource-payload",
    codecStatus: "decoded-text-payload",
    codecBacklog: "String-list structure is decoded for reference viewing; broad STR# authoring is still outside normal scenario editing."
  },
  styl: {
    role: "Text style resource",
    payloadStatus: "decoded-resource-payload",
    codecStatus: "decoded-style-payload",
    codecBacklog: "Style payloads are classified as text companion metadata; full style-run authoring remains deferred."
  },
  RLMZ: {
    role: "Realmz metadata resource",
    payloadStatus: "preserved-standard-media-payload",
    codecStatus: "standard-metadata-preserved",
    codecBacklog: "Realmz metadata resources are preserved and inventoried; semantic fields still need focused evidence."
  },
  vers: {
    role: "Version resource",
    payloadStatus: "decoded-resource-payload",
    codecStatus: "decoded-metadata-payload",
    codecBacklog: "Version resource bytes are small metadata payloads; Providence treats them as decoded reference metadata."
  },
  "ICN#": CLASSIC_MAC_ICON_POLICY,
  icl8: CLASSIC_MAC_ICON_POLICY,
  icl4: CLASSIC_MAC_ICON_POLICY,
  "ics#": CLASSIC_MAC_ICON_POLICY,
  ics8: CLASSIC_MAC_ICON_POLICY,
  ics4: CLASSIC_MAC_ICON_POLICY,
  icns: CLASSIC_MAC_ICON_POLICY,
  wrct: {
    role: "Window rectangle metadata",
    payloadStatus: "decoded-resource-payload",
    codecStatus: "decoded-window-rectangle",
    codecBacklog: "wrct payloads are decoded as four 16-bit rectangle coordinates and preserved as classic UI companion metadata."
  },
  colm: {
    role: "Classic Mac color companion metadata",
    payloadStatus: "preserved-standard-media-payload",
    codecStatus: "classic-color-metadata-preserved",
    codecBacklog: "colm resources are inventoried and preserved as classic color companion metadata; no Realmz gameplay consumer is proven."
  },
  "\u0000\u0000\u0000\u0000": {
    role: "Malformed compatibility baggage resource",
    payloadStatus: "preserved-standard-media-payload",
    codecStatus: "malformed-compatibility-resource-preserved",
    codecBacklog: "Zero-type resources are preserved as malformed Scenario.rsf compatibility baggage and are not treated as authoring data."
  }
};

const roundtripLedger = readJson(roundtripLedgerPath);
const scanned = scanResourceForks(roundtripLedger.scenarios ?? []);
const inventory = buildInventory(scanned);
const ownership = buildOwnership(scanned);
const backlog = buildCodecBacklog(scanned);

validateResourceCoverage(inventory, ownership);

writeJson(resourceForkInventoryPath, inventory);
writeJson(resourceByteOwnershipPath, ownership);
writeJson(resourcePayloadCodecBacklogPath, backlog);

console.log(`Wrote ${path.relative(repoRoot, resourceForkInventoryPath)}`);
console.log(`Wrote ${path.relative(repoRoot, resourceByteOwnershipPath)}`);
console.log(`Wrote ${path.relative(repoRoot, resourcePayloadCodecBacklogPath)}`);
console.log(JSON.stringify(ownership.summary, null, 2));

function scanResourceForks(scenarios) {
  const forks = [];
  const ignored = [];
  for (const scenario of scenarios) {
    const sourcePath = scenario.sourcePath;
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    for (const name of fs.readdirSync(sourcePath).sort()) {
      if (NON_SCENARIO_IGNORES.has(name)) {
        ignored.push({
          scenario: scenario.name,
          sourceRoot: scenario.sourceRoot,
          fileName: name,
          reason: "OS/Finder metadata"
        });
        continue;
      }
      if (!looksLikeResourceForkName(name)) continue;
      const fullPath = path.join(sourcePath, name);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      const parsed = parseResourceForkFile(fullPath);
      forks.push({
        scenario: scenario.name,
        sourceRoot: scenario.sourceRoot,
        sourcePath,
        relativePath: name,
        fileName: name,
        fullPath: normalizePath(fullPath),
        fileBytes: stat.size,
        ...parsed
      });
    }
  }
  return { forks, ignored };
}

function buildInventory(scanned) {
  const typeSummary = summarizeTypes(scanned.forks);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      roundtripLedger: "docs/generated/scenario-byte-roundtrip-ledger.json"
    },
    policy: {
      ignoredNonScenarioFiles: [...NON_SCENARIO_IGNORES].sort(),
      note:
        "This is scenario-level resource ownership. Standard media payload internals may remain preserved until a later codec-focused pass."
    },
    summary: {
      scenariosWithResourceForks: new Set(scanned.forks.map((fork) => `${fork.sourceRoot}/${fork.scenario}`)).size,
      resourceForkFiles: scanned.forks.length,
      parsedResourceForks: scanned.forks.filter((fork) => fork.parseStatus === "parsed").length,
      unparsedResourceForks: scanned.forks.filter((fork) => fork.parseStatus !== "parsed").length,
      resourceEntries: scanned.forks.reduce((sum, fork) => sum + (fork.resources?.length ?? 0), 0),
      resourceTypes: typeSummary.length,
      ignoredNonScenarioFiles: scanned.ignored.length
    },
    resourceTypes: typeSummary,
    forks: scanned.forks.map((fork) => forkInventoryEntry(fork)),
    ignoredFiles: scanned.ignored
  };
}

function buildOwnership(scanned) {
  const forks = scanned.forks.map((fork) => ({
    scenario: fork.scenario,
    sourceRoot: fork.sourceRoot,
    fileName: fork.fileName,
    relativePath: fork.relativePath,
    fullPath: fork.fullPath,
    fileBytes: fork.fileBytes,
    parseStatus: fork.parseStatus,
    parseMessage: fork.parseMessage ?? null,
    wrapperKind: fork.wrapperKind,
    resourceForkOffset: fork.resourceForkOffset,
    resourceForkBytes: fork.resourceForkBytes,
    resourceCount: fork.resources?.length ?? 0,
    byteRanges: fork.byteRanges ?? fallbackUnparsedRanges(fork),
    resources: (fork.resources ?? []).map((resource) => ({
      type: resource.type,
      id: resource.id,
      name: resource.name,
      attributes: resource.attributes,
      dataLength: resource.dataLength,
      payloadOffset: resource.payloadOffset,
      payloadEnd: resource.payloadEnd,
      payloadStatus: resource.payloadStatus,
      role: resource.role,
      origin: resource.origin,
      codecStatus: resource.codecStatus,
      decoded: resource.decoded
    }))
  }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    classifications: [
      "understood-resource-container",
      "decoded-resource-payload",
      "preserved-standard-media-payload",
      "custom-media-payload",
      "needs-codec-work",
      "resource-container-padding"
    ],
    sources: {
      resourceForkInventory: "docs/generated/resource-fork-inventory.json",
      roundtripLedger: "docs/generated/scenario-byte-roundtrip-ledger.json"
    },
    summary: summarizeOwnership(forks),
    forks
  };
}

function buildCodecBacklog(scanned) {
  const families = summarizeTypes(scanned.forks).map((type) => {
    const policy = RESOURCE_TYPE_POLICIES[type.type] ?? unknownResourcePolicy(type.type);
    return {
      type: type.type,
      role: policy.role,
      payloadStatus: policy.payloadStatus,
      codecStatus: policy.codecStatus,
      entries: type.entries,
      bytes: type.bytes,
      scenarioCount: type.scenarioCount,
      resourceForkCount: type.resourceForkCount,
      examples: type.examples,
      nextCodecWork: policy.codecBacklog
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      payloadFamilies: families.length,
      needsCodecWork: families.filter((family) => family.payloadStatus === "needs-codec-work").length,
      preservedStandardMediaFamilies: families.filter((family) => family.payloadStatus === "preserved-standard-media-payload").length,
      decodedPayloadFamilies: families.filter((family) => family.payloadStatus === "decoded-resource-payload").length
    },
    families
  };
}

function forkInventoryEntry(fork) {
  return {
    scenario: fork.scenario,
    sourceRoot: fork.sourceRoot,
    fileName: fork.fileName,
    relativePath: fork.relativePath,
    fullPath: fork.fullPath,
    fileBytes: fork.fileBytes,
    parseStatus: fork.parseStatus,
    parseMessage: fork.parseMessage ?? null,
    wrapperKind: fork.wrapperKind,
    resourceForkOffset: fork.resourceForkOffset,
    resourceForkBytes: fork.resourceForkBytes,
    dataOffset: fork.dataOffset ?? null,
    mapOffset: fork.mapOffset ?? null,
    dataLength: fork.dataLength ?? null,
    mapLength: fork.mapLength ?? null,
    typeListOffset: fork.typeListOffset ?? null,
    nameListOffset: fork.nameListOffset ?? null,
    typeCount: fork.types?.length ?? 0,
    resourceCount: fork.resources?.length ?? 0,
    types: fork.types ?? [],
    resources: (fork.resources ?? []).map((resource) => ({
      type: resource.type,
      id: resource.id,
      name: resource.name,
      attributes: resource.attributes,
      dataLength: resource.dataLength,
      dataOffset: resource.dataOffset,
      payloadOffset: resource.payloadOffset,
      payloadEnd: resource.payloadEnd,
      refOffset: resource.refOffset,
      nameOffset: resource.nameOffset,
      payloadStatus: resource.payloadStatus,
      role: resource.role,
      origin: resource.origin,
      codecStatus: resource.codecStatus,
      decoded: resource.decoded
    }))
  };
}

function parseResourceForkFile(fullPath) {
  const stat = fs.statSync(fullPath);
  if (stat.size === 0) {
    return {
      parseStatus: "unparsed-empty",
      parseMessage: "Empty resource-fork companion file",
      wrapperKind: "none",
      resourceForkOffset: 0,
      resourceForkBytes: 0,
      resources: [],
      types: [],
      byteRanges: []
    };
  }
  if (stat.size > MAX_RESOURCE_FORK_BYTES_TO_SCAN) {
    return {
      parseStatus: "unparsed-large",
      parseMessage: `Resource fork exceeds ${MAX_RESOURCE_FORK_BYTES_TO_SCAN} byte scan limit`,
      wrapperKind: "none",
      resourceForkOffset: 0,
      resourceForkBytes: stat.size,
      resources: [],
      types: [],
      byteRanges: [{ start: 0, endExclusive: stat.size, length: stat.size, status: "needs-codec-work", component: "large-resource-fork" }]
    };
  }
  const original = fs.readFileSync(fullPath);
  const extracted = extractResourceFork(original);
  const buffer = extracted.buffer;
  if (buffer.length < 16) {
    return {
      parseStatus: "unparsed-too-small",
      parseMessage: "Resource fork header is shorter than 16 bytes",
      wrapperKind: extracted.wrapperKind,
      resourceForkOffset: extracted.offset,
      resourceForkBytes: buffer.length,
      resources: [],
      types: [],
      byteRanges: [{ start: 0, endExclusive: buffer.length, length: buffer.length, status: "needs-codec-work", component: "short-resource-fork" }]
    };
  }

  const dataOffset = u32At(buffer, 0);
  const mapOffset = u32At(buffer, 4);
  const dataLength = u32At(buffer, 8);
  const mapLength = u32At(buffer, 12);
  if ([dataOffset, mapOffset, dataLength, mapLength].some((value) => value === null)) {
    return unparsedFork(extracted, "Resource fork header is incomplete");
  }
  if (dataOffset + dataLength > buffer.length || mapOffset + mapLength > buffer.length) {
    return unparsedFork(extracted, "Resource fork data/map offsets exceed file length");
  }
  if (mapOffset + 28 > buffer.length) {
    return unparsedFork(extracted, "Resource map header is incomplete");
  }

  const typeListRelativeOffset = u16At(buffer, mapOffset + 24);
  const nameListRelativeOffset = u16At(buffer, mapOffset + 26);
  if (typeListRelativeOffset === null || nameListRelativeOffset === null) {
    return unparsedFork(extracted, "Resource map type/name list offsets are incomplete");
  }

  const typeListOffset = mapOffset + typeListRelativeOffset;
  const nameListOffset = mapOffset + nameListRelativeOffset;
  if (typeListOffset + 2 > buffer.length || nameListOffset > buffer.length) {
    return unparsedFork(extracted, "Resource type/name list offsets exceed file length");
  }

  const typeCountMinusOne = u16At(buffer, typeListOffset);
  if (typeCountMinusOne === null) {
    return unparsedFork(extracted, "Resource type count is missing");
  }
  const typeCount = typeCountMinusOne === 0xffff ? 0 : typeCountMinusOne + 1;
  if (typeCount > MAX_RESOURCE_TYPES) {
    return unparsedFork(extracted, "Resource type count is missing or implausibly large");
  }

  const ranges = [
    containerRange(0, 16, "resource-fork-header"),
    containerRange(mapOffset, mapOffset + 28, "resource-map-header"),
    containerRange(typeListOffset, typeListOffset + 2, "resource-type-count")
  ];
  const types = [];
  const resources = [];

  for (let typeIndex = 0; typeIndex < typeCount; typeIndex += 1) {
    const typeOffset = typeListOffset + 2 + typeIndex * 8;
    if (typeOffset + 8 > buffer.length) return unparsedFork(extracted, "Resource type record exceeds file length");
    const type = textAt(buffer, typeOffset, 4);
    const resourceCountMinusOne = u16At(buffer, typeOffset + 4);
    const refListRelativeOffset = u16At(buffer, typeOffset + 6);
    if (resourceCountMinusOne === null || refListRelativeOffset === null) continue;
    if (resourceCountMinusOne + 1 > MAX_RESOURCES_PER_TYPE) continue;
    ranges.push(containerRange(typeOffset, typeOffset + 8, "resource-type-record", { type }));
    types.push({
      type,
      count: resourceCountMinusOne + 1,
      typeOffset,
      refListOffset: typeListOffset + refListRelativeOffset
    });
    for (let refIndex = 0; refIndex <= resourceCountMinusOne; refIndex += 1) {
      const refOffset = typeListOffset + refListRelativeOffset + refIndex * 12;
      if (refOffset + 12 > buffer.length) return unparsedFork(extracted, "Resource reference record exceeds file length");
      const id = i16At(buffer, refOffset);
      const rawNameOffset = i16At(buffer, refOffset + 2);
      const attributes = buffer[refOffset + 4];
      const dataRelativeOffset = u24At(buffer, refOffset + 5);
      if (id === null || rawNameOffset === null || dataRelativeOffset === null) continue;
      const dataEntryOffset = dataOffset + dataRelativeOffset;
      const dataLengthValue = u32At(buffer, dataEntryOffset);
      if (dataLengthValue === null || dataEntryOffset + 4 + dataLengthValue > buffer.length) {
        return unparsedFork(extracted, "Resource data entry exceeds file length");
      }

      const nameInfo = decodeResourceName(buffer, nameListOffset, rawNameOffset);
      if (nameInfo.range) ranges.push(containerRange(nameInfo.range.start, nameInfo.range.endExclusive, "resource-name", { type, id }));
      ranges.push(containerRange(refOffset, refOffset + 12, "resource-reference-record", { type, id }));
      ranges.push(containerRange(dataEntryOffset, dataEntryOffset + 4, "resource-data-length", { type, id }));

      const policy = RESOURCE_TYPE_POLICIES[type] ?? unknownResourcePolicy(type);
      const payloadOffset = dataEntryOffset + 4;
      const payloadEnd = payloadOffset + dataLengthValue;
      ranges.push({
        start: payloadOffset,
        endExclusive: payloadEnd,
        length: dataLengthValue,
        status: policy.payloadStatus,
        component: "resource-payload",
        type,
        id,
        role: policy.role,
        codecStatus: policy.codecStatus
      });

      resources.push({
        type,
        id,
        name: nameInfo.name,
        attributes,
        dataLength: dataLengthValue,
        dataOffset: dataEntryOffset,
        payloadOffset,
        payloadEnd,
        refOffset,
        nameOffset: rawNameOffset >= 0 ? nameListOffset + rawNameOffset : null,
        payloadStatus: policy.payloadStatus,
        role: policy.role,
        origin: "scenario",
        codecStatus: policy.codecStatus,
        decoded: decodeResourcePayload(type, buffer, payloadOffset, dataLengthValue)
      });
    }
  }

  const byteRanges = fillRangeGaps(normalizeRanges(ranges), buffer.length);
  return {
    parseStatus: "parsed",
    parseMessage: null,
    wrapperKind: extracted.wrapperKind,
    resourceForkOffset: extracted.offset,
    resourceForkBytes: buffer.length,
    dataOffset,
    mapOffset,
    dataLength,
    mapLength,
    typeListOffset,
    nameListOffset,
    types,
    resources,
    byteRanges
  };
}

function unparsedFork(extracted, message) {
  return {
    parseStatus: "unparsed-malformed",
    parseMessage: message,
    wrapperKind: extracted.wrapperKind,
    resourceForkOffset: extracted.offset,
    resourceForkBytes: extracted.buffer.length,
    resources: [],
    types: [],
    byteRanges: [
      {
        start: 0,
        endExclusive: extracted.buffer.length,
        length: extracted.buffer.length,
        status: "needs-codec-work",
        component: "unparsed-resource-fork"
      }
    ]
  };
}

function extractResourceFork(buffer) {
  if (buffer.length < 26) return { buffer, offset: 0, length: buffer.length, wrapperKind: "none" };
  const magic = u32At(buffer, 0);
  if (magic !== APPLE_SINGLE_MAGIC && magic !== APPLE_DOUBLE_MAGIC) {
    return { buffer, offset: 0, length: buffer.length, wrapperKind: "none" };
  }
  const entryCount = u16At(buffer, 24);
  if (entryCount === null) return { buffer, offset: 0, length: buffer.length, wrapperKind: "apple-wrapper-unreadable" };
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = 26 + index * 12;
    const entryId = u32At(buffer, entryOffset);
    const offset = u32At(buffer, entryOffset + 4);
    const length = u32At(buffer, entryOffset + 8);
    if (entryId === RESOURCE_FORK_ENTRY_ID && offset !== null && length !== null && offset + length <= buffer.length) {
      return {
        buffer: buffer.subarray(offset, offset + length),
        offset,
        length,
        wrapperKind: magic === APPLE_DOUBLE_MAGIC ? "appledouble" : "applesingle"
      };
    }
  }
  return { buffer, offset: 0, length: buffer.length, wrapperKind: magic === APPLE_DOUBLE_MAGIC ? "appledouble-no-resource-entry" : "applesingle-no-resource-entry" };
}

function decodeResourceName(buffer, nameListOffset, rawNameOffset) {
  if (rawNameOffset < 0) return { name: "", range: null };
  const offset = nameListOffset + rawNameOffset;
  if (offset < 0 || offset >= buffer.length) return { name: "", range: null };
  const length = buffer[offset];
  const endExclusive = Math.min(offset + 1 + length, buffer.length);
  return {
    name: buffer.subarray(offset + 1, endExclusive).toString("latin1"),
    range: { start: offset, endExclusive }
  };
}

function decodeResourcePayload(type, buffer, payloadOffset, dataLength) {
  if (type !== "wrct" || dataLength !== 8) return null;
  return {
    kind: "window-rectangle",
    top: i16At(buffer, payloadOffset),
    left: i16At(buffer, payloadOffset + 2),
    bottom: i16At(buffer, payloadOffset + 4),
    right: i16At(buffer, payloadOffset + 6)
  };
}

function normalizeRanges(ranges) {
  const sorted = ranges
    .filter((range) => range.endExclusive > range.start)
    .map((range) => ({ ...range, length: range.endExclusive - range.start }))
    .sort((a, b) => a.start - b.start || a.endExclusive - b.endExclusive);
  const normalized = [];
  for (const range of sorted) {
    const previous = normalized[normalized.length - 1];
    if (!previous || range.start >= previous.endExclusive) {
      normalized.push(range);
      continue;
    }
    if (
      range.start === previous.start &&
      range.endExclusive === previous.endExclusive &&
      range.status === previous.status &&
      range.component === previous.component
    ) {
      continue;
    }
    throw new Error(`Overlapping resource byte ranges ${previous.start}-${previous.endExclusive} and ${range.start}-${range.endExclusive}`);
  }
  return normalized;
}

function fillRangeGaps(ranges, totalLength) {
  const filled = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      filled.push({
        start: cursor,
        endExclusive: range.start,
        length: range.start - cursor,
        status: "resource-container-padding",
        component: "resource-container-gap"
      });
    }
    filled.push(range);
    cursor = range.endExclusive;
  }
  if (cursor < totalLength) {
    filled.push({
      start: cursor,
      endExclusive: totalLength,
      length: totalLength - cursor,
      status: "resource-container-padding",
      component: "resource-container-gap"
    });
  }
  return filled;
}

function summarizeTypes(forks) {
  const byType = new Map();
  for (const fork of forks) {
    const forkKey = `${fork.sourceRoot}/${fork.scenario}/${fork.fileName}`;
    const scenarioKey = `${fork.sourceRoot}/${fork.scenario}`;
    for (const resource of fork.resources ?? []) {
      const existing = byType.get(resource.type) ?? {
        type: resource.type,
        entries: 0,
        bytes: 0,
        scenarios: new Set(),
        forks: new Set(),
        examples: []
      };
      existing.entries += 1;
      existing.bytes += resource.dataLength;
      existing.scenarios.add(scenarioKey);
      existing.forks.add(forkKey);
      if (existing.examples.length < 8) {
        existing.examples.push({
          scenario: fork.scenario,
          fileName: fork.fileName,
          id: resource.id,
          name: resource.name,
          bytes: resource.dataLength
        });
      }
      byType.set(resource.type, existing);
    }
  }
  return [...byType.values()]
    .map((entry) => {
      const policy = RESOURCE_TYPE_POLICIES[entry.type] ?? unknownResourcePolicy(entry.type);
      return {
        type: entry.type,
        role: policy.role,
        payloadStatus: policy.payloadStatus,
        codecStatus: policy.codecStatus,
        entries: entry.entries,
        bytes: entry.bytes,
        scenarioCount: entry.scenarios.size,
        resourceForkCount: entry.forks.size,
        examples: entry.examples
      };
    })
    .sort((a, b) => b.bytes - a.bytes || a.type.localeCompare(b.type));
}

function summarizeOwnership(forks) {
  const statusObservedBytes = {};
  const resourcePayloadBytesByType = {};
  let resourceEntries = 0;
  for (const fork of forks) {
    for (const range of fork.byteRanges ?? []) {
      statusObservedBytes[range.status] = (statusObservedBytes[range.status] ?? 0) + range.length;
    }
    for (const resource of fork.resources ?? []) {
      resourceEntries += 1;
      const key = resource.type;
      const existing = resourcePayloadBytesByType[key] ?? { bytes: 0, entries: 0, status: resource.payloadStatus };
      existing.bytes += resource.dataLength;
      existing.entries += 1;
      resourcePayloadBytesByType[key] = existing;
    }
  }
  return {
    resourceForkFiles: forks.length,
    parsedResourceForks: forks.filter((fork) => fork.parseStatus === "parsed").length,
    unparsedResourceForks: forks.filter((fork) => fork.parseStatus !== "parsed").length,
    resourceEntries,
    statusObservedBytes,
    resourcePayloadBytesByType
  };
}

function fallbackUnparsedRanges(fork) {
  if (fork.byteRanges?.length) return fork.byteRanges;
  return [
    {
      start: 0,
      endExclusive: fork.resourceForkBytes ?? fork.fileBytes,
      length: fork.resourceForkBytes ?? fork.fileBytes,
      status: "needs-codec-work",
      component: "unparsed-resource-fork"
    }
  ];
}

function validateResourceCoverage(inventory, ownership) {
  const inventoryForks = new Set(inventory.forks.map((fork) => fork.fullPath));
  for (const fork of ownership.forks) {
    if (!inventoryForks.has(fork.fullPath)) {
      throw new Error(`Ownership references resource fork not in inventory: ${fork.fullPath}`);
    }
    let cursor = 0;
    for (const range of fork.byteRanges) {
      if (range.start !== cursor) {
        throw new Error(`${fork.fullPath} has a byte coverage gap before ${range.start}`);
      }
      if (range.endExclusive < range.start) {
        throw new Error(`${fork.fullPath} has an invalid range ${range.start}-${range.endExclusive}`);
      }
      cursor = range.endExclusive;
    }
    if (cursor !== fork.resourceForkBytes) {
      throw new Error(`${fork.fullPath} byte coverage ends at ${cursor}, expected ${fork.resourceForkBytes}`);
    }
  }
}

function looksLikeResourceForkName(name) {
  return name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._");
}

function containerRange(start, endExclusive, component, extra = {}) {
  return {
    start,
    endExclusive,
    length: endExclusive - start,
    status: "understood-resource-container",
    component,
    ...extra
  };
}

function unknownResourcePolicy(type) {
  return {
    role: `Unknown ${type} resource`,
    payloadStatus: "needs-codec-work",
    codecStatus: "unknown-resource-payload",
    codecBacklog: "Unknown resource type found in scenario resource forks; needs source/manual/binary evidence before semantic ownership can be claimed."
  };
}

function u16At(buffer, offset) {
  if (offset < 0 || offset + 2 > buffer.length) return null;
  return buffer.readUInt16BE(offset);
}

function i16At(buffer, offset) {
  if (offset < 0 || offset + 2 > buffer.length) return null;
  return buffer.readInt16BE(offset);
}

function u24At(buffer, offset) {
  if (offset < 0 || offset + 3 > buffer.length) return null;
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

function u32At(buffer, offset) {
  if (offset < 0 || offset + 4 > buffer.length) return null;
  return buffer.readUInt32BE(offset);
}

function textAt(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString("latin1");
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
