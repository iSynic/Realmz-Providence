import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probePath = path.join(root, "scripts", "realmz_native_abi_probe.c");
const reportPath = path.join(root, "docs", "generated", "realmz-native-abi-audit.json");
const policyPath = path.join(root, "schemas", "realmz-native-manifest-policy.json");
const ownershipPath = path.join(root, "docs", "generated", "scenario-byte-ownership.json");
const writeReport = process.argv.includes("--write");
const checkOnly = process.argv.includes("--check");
const realmzRoot = argumentValue("--realmz-root") ?? process.env.REALMZ_SOURCE_ROOT ?? null;
const compiler = process.env.CC ?? "gcc";

const structMetadata = {
  restrictinfo: { containers: ["Data RI"], recordBytes: 320, policyPath: "nativeLayout.scenario.restrictionsRecordBytes" },
  contactdata: { containers: ["Data CI"], recordBytes: 4608, policyPath: "nativeLayout.scenario.contactInfoRecordBytes" },
  door: { containers: ["Data DD", "Data DDD"], recordBytes: 40, policyPath: "nativeLayout.actionPoint.recordBytes" },
  race: { containers: ["Data Race"], recordBytes: 408, policyPath: "nativeLayout.rules.raceRecordBytes" },
  mapstats: { containers: ["Data Custom 1 BD", "Data Custom 2 BD", "Data Custom 3 BD"], recordBytes: 40, policyPath: "nativeLayout.customLandlook.mapstatsRecordBytes" },
  caste: { containers: ["Data Caste"], recordBytes: 576, policyPath: "nativeLayout.rules.casteRecordBytes" },
  battle: { containers: ["Data BD"], recordBytes: 346, policyPath: "nativeLayout.combat.battleRecordBytes" },
  timeencounter: { containers: ["Data TD3"], recordBytes: 40, policyPath: "nativeLayout.encounter.timedRecordBytes" },
  monster: { containers: ["Data MD", "Data MD1", "Data MD-1"], recordBytes: 210, policyPath: "nativeLayout.combat.monsterRecordBytes" },
  maps: { containers: ["Data MD2"], recordBytes: 340, policyPath: "nativeLayout.mapRecord.recordBytes" },
  thief: { containers: ["Data TD2"], recordBytes: 118, policyPath: "nativeLayout.encounter.thiefRecordBytes" },
  randlevel: { containers: ["Data RD", "Data RDD"], recordBytes: 644, policyPath: "nativeLayout.randomLevel.recordBytes" },
  treasure: { containers: ["Data TD"], recordBytes: 48, policyPath: "nativeLayout.economy.treasureRecordBytes" },
  encount2: {
    containers: ["Data ED2"],
    recordBytes: 160,
    compositeRecordBytes: 520,
    fixedTextTailBytes: 360,
    policyPath: "nativeLayout.encounter.complexRecordBytes"
  },
  encount: {
    containers: ["Data ED"],
    recordBytes: 106,
    compositeRecordBytes: 426,
    fixedTextTailBytes: 320,
    policyPath: "nativeLayout.encounter.simpleRecordBytes"
  },
  spell: { containers: ["Data Spell"], recordBytes: 30, policyPath: "nativeLayout.rules.spellRecordBytes" },
  itemattr: { containers: ["Data NI"], recordBytes: 100, policyPath: "nativeLayout.economy.scenarioItemRecordBytes" },
  shop: { containers: ["Data SD"], recordBytes: 3002, policyPath: "nativeLayout.economy.shopRecordBytes" }
};

const nonStructClassifications = {
  "Data DES": "fixed-text-record",
  "Data DL": "uniform-i16-map-grid",
  "Data ED3": "uniform-i16-action-row",
  "Data EDCD": "uniform-i16-extra-code-row",
  "Data LD": "uniform-i16-map-grid",
  "Data SD2": "fixed-text-record",
  "Data Solids": "uniform-byte-table",
  Global: "uniform-i16-table",
  Scenario: "sequential-file-format",
  "Scenario Startup Shell": "sequential-file-format",
  "Data CS": "sequential-file-format",
  Layout: "uniform-i16-grid-with-preserved-tail",
  "Data OD": "fixed-text-record"
};

const consumerChecks = [
  ["browser battle parser", "src/editor/browser/realmzParser.ts", "messageBefore: i16(record, 340)"],
  ["browser battle writer padding", "src/editor/browser/binaryWriters.ts", "target[339] = 0;"],
  ["browser battle writer", "src/editor/browser/binaryWriters.ts", "writeI16(target, 340, record.messageBefore);"],
  ["Rust battle parser", "src-tauri/src/realmz/battles.rs", "message_before: i16_be(record, 340)"],
  ["Rust battle writer padding", "src-tauri/src/realmz/battles.rs", "buffer[339] = 0;"],
  ["Rust battle writer", "src-tauri/src/realmz/battles.rs", "write_i16_be(buffer, 340, record.message_before);"],
  ["browser simple encounter parser", "src/editor/browser/realmzParser.ts", "prompt: i16(record, 104)"],
  ["browser simple encounter writer padding", "src/editor/browser/binaryWriters.ts", "target[103] = 0;"],
  ["browser simple encounter writer", "src/editor/browser/binaryWriters.ts", "writeI16(target, 104, record.prompt);"],
  ["Rust simple encounter parser", "src-tauri/src/realmz/encounters.rs", "prompt: i16_be(record, 104)"],
  ["Rust simple encounter writer padding", "src-tauri/src/realmz/encounters.rs", "buffer[103] = 0;"],
  ["Rust simple encounter writer", "src-tauri/src/realmz/encounters.rs", "write_i16_be(buffer, 104, record.prompt);"],
  ["browser complex encounter parser", "src/editor/browser/realmzParser.ts", "prompt: i16(record, 158)"],
  ["browser complex encounter writer padding", "src/editor/browser/binaryWriters.ts", "target[157] = 0;"],
  ["browser complex encounter writer", "src/editor/browser/binaryWriters.ts", "writeI16(target, 158, record.prompt);"],
  ["Rust complex encounter parser", "src-tauri/src/realmz/encounters.rs", "prompt: i16_be(record, 158)"],
  ["Rust complex encounter writer padding", "src-tauri/src/realmz/encounters.rs", "buffer[157] = 0;"],
  ["Rust complex encounter writer", "src-tauri/src/realmz/encounters.rs", "write_i16_be(buffer, 158, record.prompt);"],
  ["browser random-level padding constant", "src/editor/browser/randomLevelLayout.ts", "RANDOM_LEVEL_PADDING_OFFSET = 563"],
  ["browser random-level sound constant", "src/editor/browser/randomLevelLayout.ts", "RANDOM_LEVEL_SOUND_OFFSET = 564"],
  ["browser random-level text constant", "src/editor/browser/randomLevelLayout.ts", "RANDOM_LEVEL_TEXT_OFFSET = 604"],
  ["Rust random-level padding constant", "src-tauri/src/realmz/random_levels.rs", "RANDLEVEL_PADDING_OFFSET: usize = 563"],
  ["Rust random-level sound constant", "src-tauri/src/realmz/random_levels.rs", "RANDLEVEL_SOUND_OFFSET: usize = 564"],
  ["Rust random-level text constant", "src-tauri/src/realmz/random_levels.rs", "RANDLEVEL_TEXT_OFFSET: usize = 604"],
  ["browser random-level raw padding preservation", "src/editor/browser/scenarioPackage.ts", "output[start + RANDOM_LEVEL_PADDING_OFFSET] = raw[start + RANDOM_LEVEL_PADDING_OFFSET];"],
  ["door byte-to-short parser", "src/editor/browser/realmzParser.ts", "const rawCode = i16(buffer, 8 + slot * 2);"],
  ["door byte-to-short writer", "src/editor/browser/binaryWriters.ts", "writeI16(target, 8 + action.slot * 2, action.rawCode);"],
  ["Rust door byte-to-short parser", "src-tauri/src/realmz/action_points.rs", "let raw_code = i16_be(buffer, 8 + slot * 2);"],
  ["Rust door byte-to-short writer", "src-tauri/src/realmz/action_points.rs", "write_i16_be(buffer, 8 + action.slot * 2, action.raw_code);"],
  ["browser monster byte-to-short parser", "src/editor/browser/realmzParser.ts", "money: readI16s(record, 58, 3)"],
  ["browser monster byte-to-short writer", "src/editor/browser/binaryWriters.ts", "writeI16Array(target, 58, record.money, 3);"],
  ["browser monster byte-to-short tail parser", "src/editor/browser/realmzParser.ts", "deathMacro: i16(record, 166)"],
  ["browser monster byte-to-short tail writer", "src/editor/browser/binaryWriters.ts", "writeI16(target, 166, record.deathMacro);"],
  ["Rust monster byte-to-short parser", "src-tauri/src/realmz/combat.rs", "money: read_i16_array(record, 58, 3)"],
  ["Rust monster byte-to-short writer", "src-tauri/src/realmz/combat.rs", "write_i16_array(buffer, 58, &record.money, 3);"],
  ["Rust monster byte-to-short tail parser", "src-tauri/src/realmz/combat.rs", "death_macro: i16_be(record, 166)"],
  ["Rust monster byte-to-short tail writer", "src-tauri/src/realmz/combat.rs", "write_i16_be(buffer, 166, record.death_macro);"],
  ["browser race byte-to-short parser", "src/editor/browser/realmzParser.ts", "defaultIconSet: i16(record, 334)"],
  ["browser race byte-to-short writer", "src/editor/browser/binaryWriters.ts", "writeI16(target, 334, record.defaultIconSet);"],
  ["browser race short-to-long parser", "src/editor/browser/realmzParser.ts", "itemTypes: [i32(record, 336), i32(record, 340)]"],
  ["browser race short-to-long writer", "src/editor/browser/binaryWriters.ts", "writeI32(target, 336, record.itemTypes[0] ?? 0);"],
  ["Rust race byte-to-short parser", "src-tauri/src/realmz/rules.rs", "default_icon_set: i16_be(record, 334)"],
  ["Rust race byte-to-short writer", "src-tauri/src/realmz/rules.rs", "write_i16_be(target, 334, record.default_icon_set);"],
  ["Rust race short-to-long parser", "src-tauri/src/realmz/rules.rs", "item_types: vec![i32_be(record, 336), i32_be(record, 340)]"],
  ["Rust race short-to-long writer", "src-tauri/src/realmz/rules.rs", "write_i32_be(target, 336, *record.item_types.first().unwrap_or(&0));"],
  ["browser caste byte-to-long parser", "src/editor/browser/realmzParser.ts", "itemTypes: [i32(record, 436), i32(record, 440)]"],
  ["browser caste byte-to-long writer", "src/editor/browser/binaryWriters.ts", "writeI32(target, 436, record.itemTypes[0] ?? 0);"],
  ["Rust caste byte-to-long parser", "src-tauri/src/realmz/rules.rs", "item_types: vec![i32_be(record, 436), i32_be(record, 440)]"],
  ["Rust caste byte-to-long writer", "src-tauri/src/realmz/rules.rs", "write_i32_be(target, 436, *record.item_types.first().unwrap_or(&0));"],
  ["browser item short-to-long parser", "src/editor/browser/realmzParser.ts", "itemCat0: i32(record, 36)"],
  ["browser item short-to-long writer", "src/editor/browser/binaryWriters.ts", "writeI32(target, 36, record.itemCat0);"],
  ["Rust item short-to-long parser", "src-tauri/src/realmz/scenario_items.rs", "item_cat0: i32_be(record, 36)"],
  ["Rust item short-to-long writer", "src-tauri/src/realmz/scenario_items.rs", "write_i32_be(buffer, 36, record.item_cat0);"],
  ["browser thief byte-to-short parser", "src/editor/browser/realmzParser.ts", "successText: readI16s(record, 34, 8)"],
  ["browser thief byte-to-short writer", "src/editor/browser/binaryWriters.ts", "writeI16Array(target, 34, record.successText, 8);"],
  ["Rust thief byte-to-short parser", "src-tauri/src/realmz/encounters.rs", "success_text: read_i16_array(record, 34, 8)"],
  ["Rust thief byte-to-short writer", "src-tauri/src/realmz/encounters.rs", "write_i16_array(buffer, 34, &record.success_text, 8);"],
  ["browser shop byte-to-short parser", "src/editor/browser/realmzParser.ts", "inflation: i16(record, 3000)"],
  ["browser shop byte-to-short writer", "src/editor/browser/binaryWriters.ts", "writeI16(target, 3000, record.inflation);"],
  ["Rust shop byte-to-short parser", "src-tauri/src/realmz/shops.rs", "inflation: i16_be(record, 3000)"],
  ["Rust shop byte-to-short writer", "src-tauri/src/realmz/shops.rs", "write_i16_be(buffer, 3000, record.inflation);"],
  ["browser restrictions text-to-short parser", "src/editor/browser/project.ts", "maxPartyCharacters: i16At(buffer, 256)"],
  ["browser restrictions text-to-short writer", "src/editor/browser/binaryWriters.ts", "writeI16(output, 256, restrictions.maxPartyCharacters);"],
  ["Rust restrictions text-to-short parser", "src-tauri/src/realmz/scenario.rs", "max_party_characters: i16_be(buffer, 256)"],
  ["Rust restrictions text-to-short writer", "src-tauri/src/realmz/scenario.rs", "write_i16_be(&mut output, 256, restrictions.max_party_characters);"]
];

const sentinelChecks = [
  ["browser battle padding sentinel", "src/editor/browser/binaryWriters.test.ts", "input[339] = 0xa5;"],
  ["browser simple encounter padding sentinel", "src/editor/browser/binaryWriters.test.ts", "input[103] = 0xb6;"],
  ["browser complex encounter padding sentinel", "src/editor/browser/binaryWriters.test.ts", "input[157] = 0x5a;"],
  ["browser random-level splice sentinel", "src/editor/browser/realmzParser.test.ts", "uses native sound/text alignment for ${fileName}"],
  ["Rust battle padding sentinel", "src-tauri/src/realmz/battles.rs", "fn imported_battle_compiles_without_record_byte_identity()"],
  ["Rust simple encounter padding sentinel", "src-tauri/src/realmz/encounters.rs", "fn imported_simple_encounter_compiles_without_record_byte_identity()"],
  ["Rust complex encounter padding sentinel", "src-tauri/src/realmz/encounters.rs", "fn imported_complex_encounter_compiles_without_record_byte_identity()"],
  ["Rust random-level splice sentinel", "src-tauri/src/realmz/random_levels.rs", "fn native_sound_text_offsets_do_not_splice_adjacent_bytes()"]
];

const policy = readJson(policyPath);
const ownership = readJson(ownershipPath);
let report;

if (writeReport && !realmzRoot) {
  fail("--write requires --realmz-root <path> or REALMZ_SOURCE_ROOT");
}

if (realmzRoot) {
  report = probeRealmz(path.resolve(realmzRoot));
  if (checkOnly) {
    const current = readJson(reportPath);
    expect(
      JSON.stringify(current) === JSON.stringify(report),
      "Committed Realmz native ABI audit does not match the authoritative probe; rerun with --write"
    );
  }
} else {
  report = readJson(reportPath);
}

validateReport(report);
validatePolicy(report);
validateOwnershipCoverage(report);
validateConsumers();
validateSentinels();

if (writeReport) {
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(
  `Realmz native ABI audit ${writeReport ? "generated" : "passed"}: ` +
  `${report.summary.structs} structs, ${report.summary.fields} fields, ` +
  `${report.summary.paddingBytes} native padding bytes, ${report.summary.writableContainers} writable containers, ` +
  `${consumerChecks.length} browser/Rust boundary checks, ${sentinelChecks.length} executable padding sentinels.`
);

function probeRealmz(sourceRoot) {
  const structsPath = path.join(sourceRoot, "src", "realmz_orig", "structs.h");
  const typesPath = path.join(sourceRoot, "src", "Types.h");
  expect(fs.existsSync(structsPath), `Missing authoritative header ${structsPath}`);
  expect(fs.existsSync(typesPath), `Missing authoritative type header ${typesPath}`);
  expect(
    git(sourceRoot, ["diff", "--quiet", "HEAD", "--", "src/realmz_orig/structs.h", "src/Types.h"]).status === 0,
    "Authoritative Realmz ABI input headers have uncommitted changes"
  );

  const standard = compileAndRun(sourceRoot, []);
  const packed = compileAndRun(sourceRoot, ["-fpack-struct=2"]);
  expect(standard === packed, "Default and 2-byte-packed native ABI probes disagree");
  const records = parseProbe(standard);
  const sourceGitCommit = git(sourceRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const writable = ownership.containers.filter((entry) =>
    entry.coverageStatus === "decoded-writable" || entry.coverageStatus === "mixed-writable-preserved"
  );

  return {
    version: 1,
    authority: {
      sourceGitCommit,
      structsHeader: {
        path: "src/realmz_orig/structs.h",
        sha256: sha256(structsPath)
      },
      typesHeader: {
        path: "src/Types.h",
        sha256: sha256(typesPath)
      },
      probe: "scripts/realmz_native_abi_probe.c",
      modes: ["compiler-default", "fpack-struct=2"],
      modesIdentical: true
    },
    summary: {
      structs: records.length,
      fields: records.reduce((sum, record) => sum + record.fields.length, 0),
      paddingRanges: records.reduce((sum, record) => sum + record.padding.length, 0),
      paddingBytes: records.reduce((sum, record) =>
        sum + record.padding.reduce((recordSum, range) => recordSum + range.bytes, 0), 0),
      writableContainers: writable.length,
      structBackedContainers: writable.filter((entry) => structForContainer(entry.container)).length,
      nonStructContainers: writable.filter((entry) => !structForContainer(entry.container)).length,
      boundaryConsumerChecks: consumerChecks.length,
      paddingSentinelTests: sentinelChecks.length,
      mismatches: 0
    },
    records,
    containerCoverage: writable.map((entry) => {
      const structName = structForContainer(entry.container);
      return {
        container: entry.container,
        ownershipStatus: entry.coverageStatus,
        classification: structName
          ? (structName === "encount" || structName === "encount2" ? "native-struct-plus-fixed-text" :
            structName === "mapstats" ? "native-struct-table-plus-sequential-tail" : "native-struct")
          : nonStructClassifications[entry.container],
        nativeStruct: structName ?? null
      };
    })
  };
}

function compileAndRun(sourceRoot, extraFlags) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "providence-native-abi-"));
  const executable = path.join(temp, process.platform === "win32" ? "probe.exe" : "probe");
  try {
    const compile = spawnSync(compiler, [
      "-x", "c",
      "-std=c11",
      "-Wall",
      "-Wextra",
      "-Werror",
      ...extraFlags,
      "-I", path.join(sourceRoot, "src"),
      "-o", executable,
      probePath
    ], { encoding: "utf8" });
    expect(compile.status === 0, `${compiler} failed compiling native ABI probe:\n${compile.stderr || compile.stdout}`);
    const run = spawnSync(executable, [], { encoding: "utf8" });
    expect(run.status === 0, `Native ABI probe failed:\n${run.stderr || run.stdout}`);
    return run.stdout.replace(/\r\n/g, "\n");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function parseProbe(output) {
  const records = [];
  const byName = new Map();
  for (const line of output.trim().split("\n")) {
    const parts = line.split("\t");
    if (parts[0] === "struct") {
      expect(parts.length === 3, `Malformed struct probe row: ${line}`);
      const metadata = structMetadata[parts[1]];
      expect(metadata, `Unexpected native struct ${parts[1]}`);
      const record = {
        name: parts[1],
        size: integer(parts[2], line),
        containers: metadata.containers,
        fields: [],
        padding: []
      };
      records.push(record);
      byName.set(record.name, record);
    } else if (parts[0] === "field") {
      expect(parts.length === 5, `Malformed field probe row: ${line}`);
      const record = byName.get(parts[1]);
      expect(record, `Field appeared before struct row: ${line}`);
      record.fields.push({
        name: parts[2],
        offset: integer(parts[3], line),
        bytes: integer(parts[4], line)
      });
    } else {
      fail(`Unexpected native probe row: ${line}`);
    }
  }
  expect(records.length === Object.keys(structMetadata).length, "Native probe did not cover every declared ABI struct");
  for (const record of records) {
    const metadata = structMetadata[record.name];
    expect(record.size === metadata.recordBytes, `${record.name} size ${record.size} != expected ${metadata.recordBytes}`);
    let end = 0;
    for (const field of record.fields) {
      expect(field.offset >= end, `${record.name}.${field.name} overlaps a prior field`);
      if (field.offset > end) record.padding.push({ offset: end, bytes: field.offset - end });
      end = field.offset + field.bytes;
    }
    if (record.size > end) record.padding.push({ offset: end, bytes: record.size - end });
    if (metadata.compositeRecordBytes) {
      record.composite = {
        fixedTextTailOffset: record.size,
        fixedTextTailBytes: metadata.fixedTextTailBytes,
        recordBytes: metadata.compositeRecordBytes
      };
    }
  }
  return records;
}

function validateReport(value) {
  expect(value?.version === 1, "Realmz native ABI audit must be version 1");
  expect(value?.authority?.modesIdentical === true, "Native ABI default and pack-2 probes must agree");
  expect(value?.summary?.structs === 18, "Native ABI audit must cover 18 writable structs");
  expect(value?.summary?.fields === 290, "Native ABI audit must cover all 290 top-level fields");
  expect(value?.summary?.paddingRanges === 4, "Native ABI audit must identify four padding ranges");
  expect(value?.summary?.paddingBytes === 4, "Native ABI audit must identify four padding bytes");
  expect(value?.summary?.boundaryConsumerChecks === consumerChecks.length, "Native ABI boundary-consumer count is stale");
  expect(value?.summary?.paddingSentinelTests === sentinelChecks.length, "Native ABI padding-sentinel count is stale");
  expect(value?.summary?.mismatches === 0, "Native ABI audit contains unresolved mismatches");
  const actualPadding = value.records.flatMap((record) =>
    record.padding.map((range) => `${record.name}:${range.offset}:${range.bytes}`)
  );
  expect(
    JSON.stringify(actualPadding) === JSON.stringify([
      "battle:339:1",
      "randlevel:563:1",
      "encount2:157:1",
      "encount:103:1"
    ]),
    `Unexpected native padding inventory: ${actualPadding.join(", ")}`
  );
  for (const record of value.records) {
    const metadata = structMetadata[record.name];
    expect(metadata, `Report contains unknown struct ${record.name}`);
    expect(record.size === metadata.recordBytes, `${record.name} report size is stale`);
    for (const field of record.fields) {
      expect(field.offset >= 0 && field.bytes > 0 && field.offset + field.bytes <= record.size,
        `${record.name}.${field.name} is outside its native record`);
    }
  }
}

function validatePolicy(reportValue) {
  for (const record of reportValue.records) {
    const metadata = structMetadata[record.name];
    const expected = metadata.compositeRecordBytes ?? record.size;
    const actual = property(policy, metadata.policyPath);
    expect(actual === expected, `${metadata.policyPath}=${actual} does not match probed ${record.name} bytes ${expected}`);
  }
}

function validateOwnershipCoverage(reportValue) {
  const writable = ownership.containers.filter((entry) =>
    entry.coverageStatus === "decoded-writable" || entry.coverageStatus === "mixed-writable-preserved"
  );
  expect(reportValue.containerCoverage.length === writable.length, "Writable container coverage count is stale");
  const reportContainers = new Set(reportValue.containerCoverage.map((entry) => entry.container));
  for (const entry of writable) {
    expect(reportContainers.has(entry.container), `Writable container ${entry.container} is missing from ABI coverage`);
    expect(
      structForContainer(entry.container) || nonStructClassifications[entry.container],
      `Writable container ${entry.container} lacks an ABI or non-struct classification`
    );
  }
}

function validateConsumers() {
  for (const [label, relativePath, snippet] of consumerChecks) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    expect(source.includes(snippet), `${label} no longer matches the probed native ABI (${relativePath})`);
  }
}

function validateSentinels() {
  for (const [label, relativePath, snippet] of sentinelChecks) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    expect(source.includes(snippet), `${label} is missing (${relativePath})`);
  }
}

function structForContainer(container) {
  return Object.entries(structMetadata).find(([, metadata]) => metadata.containers.includes(container))?.[0] ?? null;
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  expect(index + 1 < process.argv.length, `${name} requires a value`);
  return process.argv[index + 1];
}

function property(object, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => value?.[key], object);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex").toUpperCase();
}

function git(cwd, args) {
  return spawnSync("git", args, { cwd, encoding: "utf8" });
}

function integer(value, context) {
  const parsed = Number(value);
  expect(Number.isSafeInteger(parsed) && parsed >= 0, `Expected non-negative integer in ${context}`);
  return parsed;
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function fail(message) {
  throw new Error(message);
}
