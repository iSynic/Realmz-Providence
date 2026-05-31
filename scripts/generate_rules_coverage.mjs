import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const roundtripLedgerPath = path.join(repoRoot, "docs/generated/scenario-byte-roundtrip-ledger.json");
const resourceForkInventoryPath = path.join(repoRoot, "docs/generated/resource-fork-inventory.json");
const outputPath = path.join(repoRoot, "docs/generated/rules-resource-coverage.json");
const namePackagingOutputPath = path.join(repoRoot, "docs/generated/rules-name-resource-packaging.json");

const SPELL_BYTES = 30;
const SPELL_RECORDS = 105;
const SPELL_RECORD_BYTES = SPELL_BYTES * SPELL_RECORDS;
const RACE_BYTES = 408;
const RACE_RECORDS = 30;
const CASTE_BYTES = 576;
const CASTE_RECORDS = 30;
const SPELL_RESOURCE_IDS = [5000, 5001, 5002, 5003, 5004, 5005, 5006];

const RULE_FILES = {
  "Data Spell": {
    family: "spell",
    recordBytes: SPELL_BYTES,
    expectedRecords: SPELL_RECORDS,
    expectedBytes: SPELL_RECORD_BYTES,
    status: "decoded-writable-with-preserved-tail",
    label: "Custom spell override records"
  },
  "Data Race": {
    family: "race",
    recordBytes: RACE_BYTES,
    expectedRecords: RACE_RECORDS,
    expectedBytes: RACE_BYTES * RACE_RECORDS,
    status: "decoded-writable",
    label: "Race override table"
  },
  "Data Caste": {
    family: "caste",
    recordBytes: CASTE_BYTES,
    expectedRecords: CASTE_RECORDS,
    expectedBytes: CASTE_BYTES * CASTE_RECORDS,
    status: "decoded-writable",
    label: "Caste override table"
  }
};

const FIELD_OWNERSHIP = {
  "Data Spell": [
    { offset: 0, size: 1, name: "Fixed range", internal: "range1", status: "decoded-writable" },
    { offset: 1, size: 1, name: "Power range", internal: "range2", status: "decoded-writable" },
    { offset: 2, size: 1, name: "Queue icon", internal: "queueicon", status: "decoded-writable" },
    { offset: 19, size: 2, name: "Cast and resolution icons", internal: "spelllook[2]", status: "decoded-writable" },
    { offset: 21, size: 2, name: "Casting and resolution sounds", internal: "sound[2]", status: "decoded-writable" },
    { offset: 23, size: 3, name: "Targeting and effect", internal: "target/size/special", status: "decoded-writable" },
    { offset: 26, size: 4, name: "Damage class and availability", internal: "damagetype/spellclass/incombat/incamp", status: "decoded-writable" }
  ],
  "Data Race": [
    { offset: 0, size: 96, name: "Combat, abilities, attributes", internal: "plusminustohit/specialability/drvbonus/attbonus/minmax", status: "decoded-writable" },
    { offset: 96, size: 16, name: "Reserved race words", internal: "spare[8]", status: "preserved-known" },
    { offset: 112, size: 222, name: "Conditions, movement, caste compatibility, age, item, and portrait fields", internal: "conditions..canregenerate", status: "decoded-writable" },
    { offset: 334, size: 12, name: "Default portrait set, item masks, descriptors", internal: "defaulticonset/itemtypes/descriptors", status: "decoded-writable" },
    { offset: 346, size: 62, name: "Reserved race tail", internal: "spacer[31]", status: "preserved-known" }
  ],
  "Data Caste": [
    { offset: 0, size: 240, name: "Abilities, spellcasting, attributes, conditions, and level-up values", internal: "specialability..hand2hand", status: "decoded-writable" },
    { offset: 240, size: 8, name: "Reserved caste words", internal: "spare1/spare2", status: "preserved-known" },
    { offset: 248, size: 202, name: "Class, movement, victory points, starting items, attacks, items, icon, spell caps", internal: "casteclass..spellssofar", status: "decoded-writable" },
    { offset: 450, size: 126, name: "Reserved caste tail", internal: "spacer[63]", status: "preserved-known" }
  ]
};

const roundtripLedger = readJson(roundtripLedgerPath);
const resourceInventory = readOptionalJson(resourceForkInventoryPath);
const resourcesByScenario = indexRulesResources(resourceInventory);

const scenarios = [];
const aggregate = {
  fileCounts: {},
  observedByteLengths: {},
  malformedFiles: {},
  dataSpellTailBytes: {},
  resourceForks: {},
  resourceEntries: {},
  spellStringLists: {}
};

for (const scenario of roundtripLedger.scenarios ?? []) {
  const sourcePath = scenario.sourcePath;
  if (!sourcePath || !fs.existsSync(sourcePath)) continue;
  const entry = {
    name: scenario.name,
    sourceRoot: scenario.sourceRoot,
    sourcePath: normalizePath(sourcePath),
    files: [],
    resources: []
  };
  for (const [fileName, config] of Object.entries(RULE_FILES)) {
    const filePath = path.join(sourcePath, fileName);
    if (!fs.existsSync(filePath)) continue;
    const bytes = fs.statSync(filePath).size;
    entry.files.push(classifyRuleFile(fileName, config, bytes));
    aggregate.fileCounts[fileName] = (aggregate.fileCounts[fileName] ?? 0) + 1;
    aggregate.observedByteLengths[fileName] ??= {};
    aggregate.observedByteLengths[fileName][bytes] = (aggregate.observedByteLengths[fileName][bytes] ?? 0) + 1;
    if (fileName === "Data Spell") {
      const tail = Math.max(0, bytes - SPELL_RECORD_BYTES);
      aggregate.dataSpellTailBytes[tail] = (aggregate.dataSpellTailBytes[tail] ?? 0) + 1;
    }
    if (bytes !== config.expectedBytes && fileName !== "Data Spell") {
      aggregate.malformedFiles[fileName] = (aggregate.malformedFiles[fileName] ?? 0) + 1;
    }
    if (fileName === "Data Spell" && bytes < config.expectedBytes) {
      aggregate.malformedFiles[fileName] = (aggregate.malformedFiles[fileName] ?? 0) + 1;
    }
  }
  const resources = resourcesByScenario.get(`${scenario.sourceRoot}\u0000${scenario.name}`) ?? [];
  if (resources.length > 0) {
    entry.resources = resources.map(classifyRuleResource);
    for (const resourceFile of new Set(entry.resources.map((resource) => resource.resourceFile))) {
      aggregate.resourceForks[resourceFile] = (aggregate.resourceForks[resourceFile] ?? 0) + 1;
    }
    for (const resource of entry.resources) {
      const key = `${resource.type} ${resource.id}`;
      aggregate.resourceEntries[key] = (aggregate.resourceEntries[key] ?? 0) + 1;
      if (resource.type === "STR#") {
        aggregate.spellStringLists[key] ??= { count: 0, decodedStringCounts: {} };
        aggregate.spellStringLists[key].count += 1;
        aggregate.spellStringLists[key].decodedStringCounts[resource.decodedStringCount ?? "unknown"] =
          (aggregate.spellStringLists[key].decodedStringCounts[resource.decodedStringCount ?? "unknown"] ?? 0) + 1;
      }
    }
  }
  if (entry.files.length > 0 || entry.resources.length > 0) scenarios.push(entry);
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources: {
    roundtripLedger: "docs/generated/scenario-byte-roundtrip-ledger.json",
    resourceForkInventory: resourceInventory ? "docs/generated/resource-fork-inventory.json" : null,
    evidenceCard: "docs/format-evidence-cards/rules-spell-race-caste-runtime-anchors.md"
  },
  layout: {
    spell: {
      file: "Data Spell",
      recordBytes: SPELL_BYTES,
      customRecords: SPELL_RECORDS,
      customRecordBytes: SPELL_RECORD_BYTES,
      packedIdRange: "5101..5715",
      tailPolicy: "preserved-known until Divinity resource/name packaging is mapped"
    },
    race: { file: "Data Race", recordBytes: RACE_BYTES, records: RACE_RECORDS, expectedBytes: RACE_BYTES * RACE_RECORDS },
    caste: { file: "Data Caste", recordBytes: CASTE_BYTES, records: CASTE_RECORDS, expectedBytes: CASTE_BYTES * CASTE_RECORDS }
  },
  byteOwnership: {
    "Data Spell": [
      { start: 0, endExclusive: SPELL_RECORD_BYTES, status: "decoded-writable", field: "105 custom spell records", packedIds: "5101..5715" },
      { start: SPELL_RECORD_BYTES, endExclusive: null, status: "preserved-known", field: "Data Spell packaging tail", reason: "Runtime reads only 105 records before opening resource evidence." }
    ],
    "Data Race": [
      { start: 0, endExclusive: RACE_BYTES * RACE_RECORDS, status: "decoded-writable", field: "30 race override records" }
    ],
    "Data Caste": [
      { start: 0, endExclusive: CASTE_BYTES * CASTE_RECORDS, status: "decoded-writable", field: "30 caste override records" }
    ]
  },
  fieldOwnership: FIELD_OWNERSHIP,
  resourcePackaging: {
    spellNames: {
      resourceType: "STR#",
      ids: SPELL_RESOURCE_IDS,
      status: "decoded-writable",
      writerStatus: "writer-safe-existing-resource",
      likelyLinkage: "STR# 5000..5006 store custom spell name lists for custom spell levels 1..7. Runtime lookup is GetIndString(1000 * class + level), so class 5/custom maps to these resource IDs."
    },
    spellDescriptions: {
      status: "preserved-unknown",
      writerStatus: "hidden",
      note: "No distinct Data Spell TEXT description resources are observed in scenario Data Spell resource forks."
    },
    raceNames: {
      status: "preserved-unknown",
      writerStatus: "hidden",
      note: "Scenario Data Race contains no decoded race name field and no Data Race resource forks are observed."
    },
    raceDefaultPortraitSet: {
      status: "decoded-writable",
      writerStatus: "record-field",
      field: "Data Race offset 334"
    },
    casteNames: {
      status: "preserved-unknown",
      writerStatus: "hidden",
      note: "Scenario Data Caste contains no decoded caste name field and no Data Caste resource forks are observed."
    },
    casteDefaultIcon: {
      status: "decoded-writable",
      writerStatus: "record-field",
      field: "Data Caste offset 444"
    },
    spellIconsAndSounds: {
      status: "decoded-writable",
      writerStatus: "record-fields",
      fields: ["Data Spell offsets 19..22", "queue icon offset 2"]
    }
  },
  writerGates: {
    spellRecords: "writer-safe-fields-fixture-proven",
    spellTail: "preserve-only",
    spellResources: "spell-name-str-writer-safe-existing-resource",
    raceRecords: "writer-safe-fields-fixture-proven",
    casteRecords: "writer-safe-fields-fixture-proven",
    raceCasteNames: "unresolved-hidden"
  },
  summary: {
    scenariosWithRulesData: scenarios.length,
    fileCounts: aggregate.fileCounts,
    observedByteLengths: aggregate.observedByteLengths,
    dataSpellTailBytes: aggregate.dataSpellTailBytes,
    malformedFiles: aggregate.malformedFiles,
    resourceForkCounts: aggregate.resourceForks,
    resourceEntryCounts: aggregate.resourceEntries,
    spellStringLists: aggregate.spellStringLists
  },
  scenarios
};

validate(output);
writeJson(outputPath, output);
writeJson(namePackagingOutputPath, buildNamePackagingOutput(output, resourcesByScenario));

console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);
console.log(`Wrote ${path.relative(repoRoot, namePackagingOutputPath)}`);
console.log(JSON.stringify(output.summary, null, 2));

function classifyRuleFile(fileName, config, bytes) {
  const records = Math.floor(Math.min(bytes, config.expectedBytes) / config.recordBytes);
  const trailingBytes = Math.max(0, bytes - config.expectedBytes);
  const malformed = fileName === "Data Spell" ? bytes < config.expectedBytes : bytes !== config.expectedBytes;
  return {
    fileName,
    family: config.family,
    bytes,
    expectedBytes: config.expectedBytes,
    recordBytes: config.recordBytes,
    expectedRecords: config.expectedRecords,
    records,
    trailingBytes,
    status: malformed ? "malformed-preserve-only" : config.status,
    writerStatus: malformed ? "preserve-only" : "writer-safe-fields-fixture-proven"
  };
}

function classifyRuleResource(resource) {
  let semanticRole = "rules-resource";
  let ownership = resource.payloadStatus ?? "preserved-known";
  let likelyLinkage = null;
  let writerStatus = "preserve-only";
  if (resource.type === "STR#" && SPELL_RESOURCE_IDS.includes(resource.id)) {
    semanticRole = "custom-spell-name-list";
    ownership = "decoded-writable";
    writerStatus = "writer-safe-existing-resource";
    likelyLinkage = `Custom spell level ${resource.id - 4999} names`;
  }
  return {
    resourceFile: resource.fileName,
    type: resource.type,
    id: resource.id,
    name: resource.name,
    dataLength: resource.dataLength,
    payloadStatus: resource.payloadStatus,
    role: semanticRole,
    ownership,
    writerStatus,
    previewStatus: resource.payloadStatus === "decoded-resource-payload" ? "readable" : "reference-only",
    likelyLinkage,
    decodedStringCount: resource.decodedStringCount ?? null
  };
}

function indexRulesResources(resourceInventory) {
  const index = new Map();
  if (!resourceInventory?.forks) return index;
  for (const fork of resourceInventory.forks) {
    if (!["Data Spell.rsrc", "Data Spell.rsf", "Data Spell"].includes(fork.fileName)) continue;
    const key = `${fork.sourceRoot}\u0000${fork.scenario}`;
    const resources = index.get(key) ?? [];
    for (const resource of fork.resources ?? []) {
      resources.push({
        fileName: fork.fileName,
        type: resource.type,
        id: resource.id,
        name: resource.name,
        dataLength: resource.dataLength,
        payloadStatus: resource.payloadStatus,
        ...decodeStringListDetails(fork.fullPath, resource.type, resource.id)
      });
    }
    index.set(key, resources);
  }
  return index;
}

function decodeStringListDetails(resourcePath, resourceType, id) {
  if (resourceType !== "STR#" || !resourcePath || !fs.existsSync(resourcePath)) {
    return { decodedStringCount: null, decodedStrings: null };
  }
  const data = resourceData(fs.readFileSync(resourcePath), resourceType, id);
  if (!data || data.length < 2) return { decodedStringCount: null, decodedStrings: null };
  const strings = decodeStringList(data);
  if (!strings) return { decodedStringCount: null, decodedStrings: null };
  return { decodedStringCount: strings.length, decodedStrings: strings };
}

function decodeStringList(data) {
  const count = u16be(data, 0);
  if (count === null || count > 200) return null;
  let offset = 2;
  const strings = [];
  for (let index = 0; index < count; index += 1) {
    if (offset >= data.length) return null;
    const length = data[offset];
    offset += 1;
    if (offset + length > data.length) return null;
    strings.push(decodeClassicText(data.subarray(offset, offset + length)));
    offset += length;
    if (offset > data.length) return null;
  }
  return strings;
}

function buildNamePackagingOutput(rulesCoverage, rulesResourcesByScenario) {
  const resources = [];
  for (const scenario of rulesCoverage.scenarios) {
    const key = `${scenario.sourceRoot}\u0000${scenario.name}`;
    for (const resource of rulesResourcesByScenario.get(key) ?? []) {
      if (resource.type !== "STR#" || !SPELL_RESOURCE_IDS.includes(resource.id)) continue;
      const levelIndex = resource.id - 5000;
      const strings = resource.decodedStrings ?? [];
      resources.push({
        scenario: scenario.name,
        sourceRoot: scenario.sourceRoot,
        sourcePath: scenario.sourcePath,
        resourceFile: resource.resourceFile,
        type: resource.type,
        id: resource.id,
        name: resource.name || null,
        byteLength: resource.dataLength,
        stringCount: strings.length,
        writerStatus: resource.writerStatus,
        slots: strings.map((name, slotIndex) => ({
          resourceId: resource.id,
          levelIndex,
          slotIndex,
          customId: levelIndex * 15 + slotIndex,
          packedSpellId: 5101 + levelIndex * 100 + slotIndex,
          name,
          byteLength: classicTextByteLength(name)
        }))
      });
    }
  }
  return {
    schemaVersion: 1,
    generatedAt: rulesCoverage.generatedAt,
    sources: {
      rulesCoverage: "docs/generated/rules-resource-coverage.json",
      realmzSource: [
        "F:/Realmz/src/realmz_orig/spellselect.c GetIndString(1000 * spellcastertype + spelllevel, slot + 1)",
        "F:/Realmz/src/realmz_orig/combat.c GetIndString(1000 * (castcaste + 1) + castlevel, castnum + 1)",
        "F:/Realmz/src/realmz_orig/age.c STR# 129 race labels",
        "F:/Realmz/src/realmz_orig/class.c STR# 131 caste labels"
      ],
      divinityManual: [
        "F:/DocMaker/out/divinity-manual.txt:5052 Spell Editor",
        "F:/DocMaker/out/divinity-manual.txt:5062 copy Data Spell into scenario folder",
        "F:/DocMaker/out/divinity-manual.txt:5100 custom spell IDs 5101..5715",
        "F:/DocMaker/out/divinity-manual.txt:5102 custom spell data is kept in the scenario folder"
      ]
    },
    verdicts: {
      customSpellNames: {
        status: "decoded-writable",
        writerStatus: "writer-safe-existing-resource",
        storage: "Data Spell resource fork STR# 5000..5006",
        mapping: "STR# 5000 + levelIndex, string slot 0..14 => custom spell record id levelIndex * 15 + slotIndex; packed ID 5101 + levelIndex * 100 + slotIndex"
      },
      spellDescriptions: {
        status: "not-scenario-data",
        writerStatus: "hidden",
        reason: "No distinct scenario-local custom spell description resources are observed; Providence preserves existing record/resource bytes and keeps description text as editor metadata only."
      },
      raceNames: {
        status: "not-scenario-data",
        writerStatus: "hidden",
        reason: "Realmz runtime race labels are read from shared STR# 129; no scenario-local Data Race name resource path is proven."
      },
      casteNames: {
        status: "not-scenario-data",
        writerStatus: "hidden",
        reason: "Realmz runtime caste labels are read from shared STR# 131; no scenario-local Data Caste name resource path is proven."
      }
    },
    summary: {
      resourceCount: resources.length,
      scenariosWithCustomSpellNameResources: new Set(resources.map((resource) => `${resource.sourceRoot}\u0000${resource.scenario}`)).size,
      resourceIds: Object.fromEntries(SPELL_RESOURCE_IDS.map((id) => [
        id,
        resources.filter((resource) => resource.id === id).length
      ]))
    },
    resources
  };
}

function validate(output) {
  const dataSpell = output.summary.observedByteLengths["Data Spell"] ?? {};
  for (const length of Object.keys(dataSpell)) {
    if (Number(length) < SPELL_RECORD_BYTES) {
      throw new Error(`Data Spell length ${length} is too short for 105 custom records`);
    }
  }
  for (const [fileName, config] of Object.entries(RULE_FILES)) {
    if (fileName === "Data Spell") continue;
    for (const length of Object.keys(output.summary.observedByteLengths[fileName] ?? {})) {
      if (Number(length) !== config.expectedBytes) {
        throw new Error(`${fileName} length ${length} does not match ${config.expectedBytes}`);
      }
    }
  }
  for (const scenario of output.scenarios) {
    for (const resource of scenario.resources) {
      if (!resource.ownership) throw new Error(`${scenario.name} ${resource.type} ${resource.id} lacks ownership`);
      if (resource.type === "STR#" && SPELL_RESOURCE_IDS.includes(resource.id) && resource.decodedStringCount !== 15) {
        throw new Error(`${scenario.name} ${resource.resourceFile} STR# ${resource.id} decoded ${resource.decodedStringCount} strings instead of 15 custom spell slots`);
      }
    }
  }
}

function resourceData(buffer, resourceType, id) {
  buffer = extractResourceForkBuffer(buffer);
  if (buffer.length < 16) return null;
  const dataOffset = u32be(buffer, 0);
  const mapOffset = u32be(buffer, 4);
  const dataLength = u32be(buffer, 8);
  const mapLength = u32be(buffer, 12);
  if ([dataOffset, mapOffset, dataLength, mapLength].some((value) => value === null)) return null;
  if (dataOffset + dataLength > buffer.length || mapOffset + mapLength > buffer.length) return null;
  const typeListRelativeOffset = u16be(buffer, mapOffset + 24);
  if (typeListRelativeOffset === null) return null;
  const typeListOffset = mapOffset + typeListRelativeOffset;
  const typeCountMinusOne = u16be(buffer, typeListOffset);
  if (typeCountMinusOne === null || typeCountMinusOne > 512) return null;
  for (let typeIndex = 0; typeIndex <= typeCountMinusOne; typeIndex += 1) {
    const typeOffset = typeListOffset + 2 + typeIndex * 8;
    if (typeOffset + 8 > buffer.length) return null;
    const type = textAt(buffer, typeOffset, 4);
    const resourceCountMinusOne = u16be(buffer, typeOffset + 4);
    const refListOffset = u16be(buffer, typeOffset + 6);
    if (type !== resourceType || resourceCountMinusOne === null || refListOffset === null) continue;
    for (let refIndex = 0; refIndex <= resourceCountMinusOne; refIndex += 1) {
      const refOffset = typeListOffset + refListOffset + refIndex * 12;
      if (refOffset + 12 > buffer.length) return null;
      const resourceId = i16be(buffer, refOffset);
      if (resourceId !== id) continue;
      const dataRelative = u24be(buffer, refOffset + 5);
      if (dataRelative === null) return null;
      const dataEntryOffset = dataOffset + dataRelative;
      const length = u32be(buffer, dataEntryOffset);
      if (length === null || dataEntryOffset + 4 + length > buffer.length) return null;
      return buffer.subarray(dataEntryOffset + 4, dataEntryOffset + 4 + length);
    }
  }
  return null;
}

function extractResourceForkBuffer(buffer) {
  if (buffer.length < 26) return buffer;
  const magic = u32be(buffer, 0);
  if (magic !== 0x00051600 && magic !== 0x00051607) return buffer;
  const entryCount = u16be(buffer, 24);
  if (entryCount === null || entryCount > 256) return buffer;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = 26 + index * 12;
    if (entryOffset + 12 > buffer.length) return buffer;
    const id = u32be(buffer, entryOffset);
    const offset = u32be(buffer, entryOffset + 4);
    const length = u32be(buffer, entryOffset + 8);
    if (id === 2 && offset !== null && length !== null && offset + length <= buffer.length) {
      return buffer.subarray(offset, offset + length);
    }
  }
  return buffer;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath) {
  return fs.existsSync(filePath) ? readJson(filePath) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function textAt(buffer, offset, length) {
  return Buffer.from(buffer.subarray(offset, offset + length)).toString("latin1");
}

function decodeClassicText(buffer) {
  return Array.from(buffer)
    .map((byte) => {
      if (byte === 0) return " ";
      if (byte === 9) return "\t";
      if (byte === 10 || byte === 13) return "\n";
      if (byte >= 32 && byte <= 126) return String.fromCharCode(byte);
      return "?";
    })
    .join("")
    .trim();
}

function classicTextByteLength(value) {
  return Buffer.from(value, "ascii").length;
}

function u16be(buffer, offset) {
  if (offset + 2 > buffer.length) return null;
  return buffer.readUInt16BE(offset);
}

function i16be(buffer, offset) {
  if (offset + 2 > buffer.length) return null;
  return buffer.readInt16BE(offset);
}

function u24be(buffer, offset) {
  if (offset + 3 > buffer.length) return null;
  return (buffer[offset] << 16) | (buffer[offset + 1] << 8) | buffer[offset + 2];
}

function u32be(buffer, offset) {
  if (offset + 4 > buffer.length) return null;
  return buffer.readUInt32BE(offset);
}
