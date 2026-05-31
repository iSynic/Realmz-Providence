import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const roundtripLedgerPath = path.join(repoRoot, "docs/generated/scenario-byte-roundtrip-ledger.json");
const unknownBacklogPath = path.join(repoRoot, "docs/generated/unknown-data-backlog.json");
const runtimeCachePath = path.join(repoRoot, "docs/generated/runtime-cache-classification.json");
const resourceByteOwnershipPath = path.join(repoRoot, "docs/generated/resource-byte-ownership.json");
const dungeonByteOwnershipPath = path.join(repoRoot, "docs/generated/dungeon-byte-ownership.json");
const customLandlookCoveragePath = path.join(repoRoot, "docs/generated/custom-landlook-coverage.json");
const rulesCoveragePath = path.join(repoRoot, "docs/generated/rules-resource-coverage.json");
const targetCompatibilityPath = path.join(repoRoot, "docs/generated/scenario-target-compatibility.json");
const actionPointWriterGatePath = path.join(repoRoot, "docs/generated/action-point-writer-gate.json");
const realmzRsPath = path.join(repoRoot, "src-tauri/src/realmz.rs");

const fileInventoryPath = path.join(repoRoot, "docs/generated/scenario-file-inventory.json");
const byteOwnershipPath = path.join(repoRoot, "docs/generated/scenario-byte-ownership.json");
const unknownReportPath = path.join(repoRoot, "docs/generated/scenario-unknown-byte-report.json");
const completenessTruthPath = path.join(repoRoot, "docs/generated/scenario-completeness-truth.json");
const uiManifestPath = path.join(repoRoot, "src/editor/generated/scenarioCoverageManifest.json");

const NON_SCENARIO_IGNORES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

const RECORD_LAYOUTS = {
  "Data LD": { recordBytes: 16200, label: "Outdoor land tile fields", status: "decoded-writable" },
  "Data DL": { recordBytes: 16200, label: "Dungeon tile fields", status: "decoded-writable" },
  "Data DD": { recordBytes: 4000, label: "Land Action Point records", status: "decoded-writable" },
  "Data DDD": { recordBytes: 4000, label: "Dungeon Action Point records", status: "decoded-writable" },
  "Data RD": { recordBytes: 644, label: "Land random encounter settings", status: "decoded-writable" },
  "Data RDD": { recordBytes: 644, label: "Dungeon random encounter settings", status: "decoded-writable" },
  "Data ED": { recordBytes: 426, label: "Simple encounter records", status: "decoded-writable" },
  "Data ED2": { recordBytes: 520, label: "Complex encounter records", status: "decoded-writable" },
  "Data ED3": { recordBytes: 40, label: "Extra Action Point records", status: "decoded-writable" },
  "Data EDCD": { recordBytes: 10, label: "Action parameter rows", status: "decoded-writable" },
  "Data MD": { recordBytes: 210, label: "Monster records", status: "decoded-writable" },
  "Data MD1": { recordBytes: 210, label: "Monster set records", status: "decoded-writable" },
  "Data MD-1": { recordBytes: 210, label: "Monster set records", status: "decoded-writable" },
  "Data DES": { recordBytes: 256, label: "Monster description records", status: "decoded-writable" },
  "Data BD": { recordBytes: 346, label: "Battle records", status: "decoded-writable" },
  "Data SD": { recordBytes: 3002, label: "Shop records", status: "decoded-writable" },
  "Data SD2": { recordBytes: 256, label: "Strings/messages", status: "decoded-writable" },
  "Data OD": { recordBytes: 25, label: "Option labels", status: "decoded-writable" },
  "Data MD2": { recordBytes: 340, label: "Map records", status: "decoded-writable" },
  "Data TD": { recordBytes: 48, label: "Treasure records", status: "decoded-writable" },
  "Data TD2": { recordBytes: 118, label: "Thief encounter records", status: "decoded-writable" },
  "Data TD3": { recordBytes: 40, label: "Timed encounter records", status: "decoded-writable" },
  "Data CI": { recordBytes: 4608, label: "Contact information", status: "decoded-writable" },
  "Data RI": { recordBytes: 320, label: "Party restrictions", status: "decoded-writable" },
  "Data CS": { recordBytes: 316, label: "Scenario security backup", status: "preserved-known" },
  Global: { recordBytes: 60, label: "Global macro hooks", status: "decoded-writable" },
  "Data MENU": { recordBytes: 502, label: "Generated monster menu cache", status: "runtime-cache" },
  "Data Solids": { recordBytes: 1024, label: "Special tile solidity table", status: "decoded-readonly" },
  "Data NI": { recordBytes: 100, label: "Scenario item records", status: "decoded-writable" },
  "Data Spell": { recordBytes: 30, label: "Custom spell override records", status: "decoded-writable" },
  "Data Race": { recordBytes: 408, label: "Race override records", status: "decoded-writable" },
  "Data Caste": { recordBytes: 576, label: "Caste override records", status: "decoded-writable" },
  Layout: { recordBytes: 256, label: "Land layout grid", status: "decoded-writable" }
};

const PASS_THROUGH_POLICIES = {
  "Data Custom 1 BD": { status: "preserved-known", label: "Custom landlook mapstats" },
  "Data Custom 2 BD": { status: "preserved-known", label: "Custom landlook mapstats" },
  "Data Custom 3 BD": { status: "preserved-known", label: "Custom landlook mapstats" },
  "Custom 1": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 2": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 3": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 4": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 5": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 6": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 7": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 8": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 9": { status: "preserved-known", label: "Custom compatibility/media companion; not a landlook runtime metadata file" },
  "Custom 1 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 2 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 3 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 4 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 5 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 6 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 7 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 8 Music": { status: "custom-media-payload", label: "Custom music" },
  "Custom 9 Music": { status: "custom-media-payload", label: "Custom music" },
  Format: { status: "preserved-known", label: "Scenario compatibility marker" },
  "Icon_": { status: "preserved-known", label: "Classic Mac resource companion" },
  "Read Me (nice to know)": { status: "ignored-non-scenario", label: "Distribution documentation" }
};

const RESOURCE_TYPE_POLICIES = {
  PICT: { status: "preserved-known", role: "picture resource" },
  cicn: { status: "preserved-known", role: "icon resource" },
  "snd ": { status: "preserved-known", role: "sound resource" },
  "STR#": { status: "preserved-known", role: "string-list resource" },
  TEXT: { status: "preserved-known", role: "text resource" },
  styl: { status: "preserved-known", role: "text style resource" },
  RLMZ: { status: "preserved-known", role: "Realmz metadata resource" },
  vers: { status: "preserved-known", role: "version resource" }
};

const STATUS_LABELS = {
  "decoded-writable": "Editable",
  "decoded-readonly": "Read-only",
  "mixed-writable-preserved": "Partially Editable",
  "preserved-known": "Preserved",
  "preserved-unknown": "Preserved",
  "runtime-cache": "Runtime state",
  "ignored-non-scenario": "Ignored",
  "unknown-active-risk": "Needs format work",
  "understood-resource-container": "Understood resource container",
  "decoded-resource-payload": "Decoded resource payload",
  "preserved-standard-media-payload": "Preserved standard media payload",
  "custom-media-payload": "Custom media payload",
  "needs-codec-work": "Needs codec work",
  "understood-runtime-writer-gated": "Needs writer proof",
  "resource-packaging-needed": "Needs packaging work",
  "divinity-labels-needed": "Needs editor labels"
};

const FIXTURE_GATES = {
  "Data ED3": {
    gate: "extra-action-point-fixed-row-storage",
    fixturePaths: [
      "F:/Realmz/base/Realmz/Scenarios/Tutorial",
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "docs/generated/action-point-writer-gate.json",
      "src-tauri/src/realmz.rs:extra_action_point_writer_mutates_only_owned_slot_words"
    ]
  },
  "Data EDCD": {
    gate: "action-parameter-fixed-row-storage",
    fixturePaths: [
      "F:/Realmz/base/Realmz/Scenarios/Tutorial",
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "docs/generated/action-point-writer-gate.json",
      "src-tauri/src/realmz.rs:extracode_writer_mutates_only_owned_signed_short",
      "src-tauri/src/realmz.rs:opcode_92_secondary_extracode_row_is_independently_owned"
    ]
  },
  "Data Custom 1 BD": {
    gate: "custom-landlook-metadata-and-atlas",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Kalypso's Island"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:custom_landlook_metadata_writer_mutates_only_owned_fields",
      "src-tauri/tests/fixture_roundtrip.rs:custom_landlook_atlas_replacement_changes_only_target_pict_resource"
    ]
  },
  "Data Custom 2 BD": {
    gate: "custom-landlook-metadata",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Kalypso's Island"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:custom_landlook_metadata_writer_mutates_only_owned_fields"
    ]
  },
  "Data Custom 3 BD": {
    gate: "custom-landlook-metadata",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Kalypso's Island"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:custom_landlook_metadata_writer_mutates_only_owned_fields"
    ]
  },
  "Data Spell": {
    gate: "custom-spell-records-and-names",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Begining of the End",
      "F:/Realmz/base/Realmz/Scenarios/Tutorial"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:rules_spell_export_mutates_only_owned_record_byte_and_preserves_tail",
      "src-tauri/tests/fixture_roundtrip.rs:rules_custom_spell_name_export_updates_only_spell_str_resource"
    ]
  },
  "Data Race": {
    gate: "race-override-records",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:rules_race_export_mutates_only_owned_record_fields"
    ]
  },
  "Data Caste": {
    gate: "caste-override-records",
    fixturePaths: [
      "F:/Realmz/out_win_clang/Scenarios/Araman's Ring"
    ],
    evidence: [
      "src-tauri/tests/fixture_roundtrip.rs:rules_caste_export_mutates_only_owned_record_fields"
    ]
  },
  "Data DL": {
    gate: "dungeon-primitive-bitfields",
    fixturePaths: [],
    evidence: [
      "docs/generated/dungeon-primitive-writer-gate.json",
      "src-tauri/src/dungeon.rs"
    ],
    partialOnly: true
  }
};

const MAX_RESOURCE_TYPES = 512;
const MAX_RESOURCES_PER_TYPE = 20000;
const MAX_RESOURCE_FORK_BYTES_TO_SCAN = 50 * 1024 * 1024;
const APPLE_SINGLE_MAGIC = 0x00051600;
const APPLE_DOUBLE_MAGIC = 0x00051607;
const RESOURCE_FORK_ENTRY_ID = 2;

const roundtripLedger = readJson(roundtripLedgerPath);
const unknownBacklog = readJson(unknownBacklogPath);
const runtimeCaches = readJson(runtimeCachePath);
const resourceByteOwnership = readOptionalJson(resourceByteOwnershipPath);
const dungeonByteOwnership = readOptionalJson(dungeonByteOwnershipPath);
const customLandlookCoverage = readOptionalJson(customLandlookCoveragePath);
const rulesCoverage = readOptionalJson(rulesCoveragePath);
const targetCompatibility = readOptionalJson(targetCompatibilityPath);
const actionPointWriterGate = readOptionalJson(actionPointWriterGatePath);
const rustRegistry = parseRustRegistry(fs.readFileSync(realmzRsPath, "utf8"));
const parsedResourceForkNames = new Set(
  (resourceByteOwnership?.forks ?? [])
    .filter((fork) => fork.parseStatus === "parsed")
    .map((fork) => fork.fileName)
);

const scanned = scanScenarioRoots(roundtripLedger.scenarios ?? []);
const aggregate = aggregateFiles(roundtripLedger.scenarios ?? [], scanned);
const inventory = buildInventory(scanned, aggregate);
const ownership = buildOwnership(aggregate);
const unknownReport = buildUnknownReport(inventory, ownership, unknownBacklog);
const completenessTruth = buildCompletenessTruth(inventory, ownership, unknownReport);
const uiManifest = buildUiManifest(inventory, ownership, unknownReport, completenessTruth);
validateInventoryAndOwnership(inventory, ownership, completenessTruth);

const updatedRuntimeCaches = {
  ...runtimeCaches,
  generatedAt: new Date().toISOString(),
  updatedBy: "scripts/generate_scenario_byte_coverage.mjs",
  ignoredNonScenarioFiles: [...NON_SCENARIO_IGNORES].sort(),
  byteCoveragePolicy:
    "Runtime caches are classified separately from authored source. They may be inspected, but normal authoring writes the source files named by each entry."
};

writeJson(fileInventoryPath, inventory);
writeJson(byteOwnershipPath, ownership);
writeJson(unknownReportPath, unknownReport);
writeJson(completenessTruthPath, completenessTruth);
writeJson(runtimeCachePath, updatedRuntimeCaches);
writeJson(uiManifestPath, uiManifest);

console.log(`Wrote ${path.relative(repoRoot, fileInventoryPath)}`);
console.log(`Wrote ${path.relative(repoRoot, byteOwnershipPath)}`);
console.log(`Wrote ${path.relative(repoRoot, unknownReportPath)}`);
console.log(`Wrote ${path.relative(repoRoot, completenessTruthPath)}`);
console.log(`Wrote ${path.relative(repoRoot, runtimeCachePath)}`);
console.log(`Wrote ${path.relative(repoRoot, uiManifestPath)}`);
console.log(JSON.stringify(uiManifest.summary, null, 2));

function buildInventory(scanned, aggregate) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      roundtripLedger: "docs/generated/scenario-byte-roundtrip-ledger.json",
      rustRegistry: "src-tauri/src/realmz.rs",
        runtimeCaches: "docs/generated/runtime-cache-classification.json",
        resourceCoverage: "docs/generated/resource-byte-ownership.json",
        customLandlookCoverage: "docs/generated/custom-landlook-coverage.json",
        rulesCoverage: "docs/generated/rules-resource-coverage.json",
        dungeonCoverage: "docs/generated/dungeon-byte-ownership.json",
        dungeonHighBitAudit: "docs/generated/dungeon-high-bit-audit.json",
        completenessTruth: "docs/generated/scenario-completeness-truth.json"
    },
    policy: {
      ignoredNonScenarioFiles: [...NON_SCENARIO_IGNORES].sort(),
      note: "Finder/OS metadata is intentionally ignored. Meaningful Mac resource-fork payloads are classified as scenario resources."
    },
    summary: {
      scenarioRoots: scanned.length,
      fileFamilies: aggregate.files.length,
      ignoredNonScenarioFiles: scanned.reduce((sum, scenario) => sum + scenario.ignoredFiles.length, 0),
      resourceForkFiles: aggregate.files.filter((file) => file.roles.includes("resource-fork")).length,
      unknownFileFamilies: aggregate.files.filter((file) => file.coverageStatus === "unknown-active-risk").length
    },
    fileFamilies: aggregate.files,
    scenarios: scanned
  };
}

function buildOwnership(aggregate) {
  const containers = aggregate.files.map((file) => {
    const layout = RECORD_LAYOUTS[file.name];
    const byteRanges = byteRangesForFile(file, layout);
    const dungeonDetails = file.name === "Data DL" && dungeonByteOwnership
      ? {
          bitOwnership: dungeonByteOwnership.bitOwnership,
          dungeonSummary: dungeonByteOwnership.summary,
          dungeonCoverage: "docs/generated/dungeon-byte-ownership.json"
        }
      : {};
    return {
      container: file.name,
      authorFacingName: layout?.label ?? PASS_THROUGH_POLICIES[file.name]?.label ?? labelForFile(file),
      coverageStatus: file.coverageStatus,
      role: file.roles[0] ?? "unknown",
      observedScenarioCount: file.scenarioCount,
      observedByteSizes: file.observedByteSizes,
      recordBytes: layout?.recordBytes ?? null,
      byteRanges,
      resourceTypes: file.resourceTypes,
      evidence: evidenceForFile(file.name, file.coverageStatus),
      editorPolicy: editorPolicyFor(file.coverageStatus),
      ...dungeonDetails
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    classifications: [
      "decoded-writable",
      "decoded-readonly",
      "mixed-writable-preserved",
      "preserved-known",
      "preserved-unknown",
      "runtime-cache",
      "ignored-non-scenario",
      "unknown-active-risk",
      "understood-resource-container",
      "decoded-resource-payload",
      "preserved-standard-media-payload",
      "custom-media-payload",
      "needs-codec-work",
      "understood-runtime-writer-gated"
    ],
    sources: {
      fileInventory: "docs/generated/scenario-file-inventory.json",
      unknownBacklog: "docs/generated/unknown-data-backlog.json",
        runtimeCaches: "docs/generated/runtime-cache-classification.json",
        resourceCoverage: "docs/generated/resource-byte-ownership.json",
        customLandlookCoverage: "docs/generated/custom-landlook-coverage.json",
        rulesCoverage: "docs/generated/rules-resource-coverage.json",
        dungeonCoverage: "docs/generated/dungeon-byte-ownership.json",
        dungeonHighBitAudit: "docs/generated/dungeon-high-bit-audit.json",
        completenessTruth: "docs/generated/scenario-completeness-truth.json",
        ed3Reachability: "docs/generated/extra-ap-reachability-source-map.json",
        edcdCrosswalk: "docs/generated/opcode-edcd-crosswalk.json"
    },
    summary: summarizeOwnership(containers),
    containers
  };
}

function buildUnknownReport(inventory, ownership, backlog) {
  const activeRisks = ownership.containers.filter((container) => container.coverageStatus === "unknown-active-risk");
  const preserved = ownership.containers.filter((container) => container.coverageStatus === "preserved-known" || container.coverageStatus === "preserved-unknown");
  const backlogRisks = (backlog.targets ?? [])
    .filter((target) => target.classification === "unknown-active-risk" || target.classification === "understood-runtime-writer-gated" || target.classification === "resource-packaging-needed")
    .sort((a, b) => Number(a.priority ?? 999) - Number(b.priority ?? 999))
    .slice(0, 12)
    .map((target) => ({
      id: target.id,
      family: target.family,
      priority: target.priority,
      classification: target.classification,
      summary: target.why,
      followUp: target.followUp ?? [],
      evidenceCard: target.evidenceCard ?? null
    }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      unknownActiveRiskContainers: activeRisks.length,
      preservedContainers: preserved.length,
      backlogRisks: backlogRisks.length,
      ignoredNonScenarioFiles: inventory.summary.ignoredNonScenarioFiles,
      note: "This report separates active unknown containers from stricter writer/package risks. See docs/generated/scenario-completeness-truth.json for the strict score."
    },
    activeRisks: activeRisks.map((container) => ({
      container: container.container,
      status: container.coverageStatus,
      observedScenarioCount: container.observedScenarioCount,
      observedByteSizes: container.observedByteSizes,
      evidence: container.evidence
    })),
    preserved,
    backlogRisks
  };
}

function buildUiManifest(inventory, ownership, unknownReport, truth) {
  const topContainers = ownership.containers
    .filter((container) => container.observedScenarioCount > 0)
    .sort((a, b) => statusSort(a.coverageStatus) - statusSort(b.coverageStatus) || b.observedScenarioCount - a.observedScenarioCount || a.container.localeCompare(b.container))
    .slice(0, 30)
    .map((container) => ({
      container: container.container,
      label: container.authorFacingName,
      status: STATUS_LABELS[container.coverageStatus] ?? container.coverageStatus,
      coverageStatus: container.coverageStatus,
      truth: truth.containers.find((entry) => entry.container === container.container)?.truth ?? null,
      count: container.observedScenarioCount,
      sizes: container.observedByteSizes,
      policy: container.editorPolicy
    }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    summary: {
      scenarioRoots: inventory.summary.scenarioRoots,
      fileFamilies: inventory.summary.fileFamilies,
      ignoredNonScenarioFiles: inventory.summary.ignoredNonScenarioFiles,
      editableContainers: ownership.summary.statusCounts["decoded-writable"] ?? 0,
      preservedContainers:
        (ownership.summary.statusCounts["preserved-known"] ?? 0) +
        (ownership.summary.statusCounts["preserved-unknown"] ?? 0) +
        (ownership.summary.statusCounts["preserved-standard-media-payload"] ?? 0) +
        (ownership.summary.statusCounts["custom-media-payload"] ?? 0),
      understoodResourceContainers: ownership.summary.statusCounts["understood-resource-container"] ?? 0,
      resourceCoverage: resourceByteOwnership
        ? {
            resourceForkFiles: resourceByteOwnership.summary?.resourceForkFiles ?? 0,
            parsedResourceForks: resourceByteOwnership.summary?.parsedResourceForks ?? 0,
            resourceEntries: resourceByteOwnership.summary?.resourceEntries ?? 0,
            payloadBytesByStatus: resourceByteOwnership.summary?.statusObservedBytes ?? {}
          }
        : null,
      targetCompatibility: targetCompatibility
        ? {
            macClassicScenarios: targetCompatibility.summary?.targets?.["mac-classic-folder"]?.scenarios ?? 0,
            windowsRealmzScenarios: targetCompatibility.summary?.targets?.["windows-realmz-folder"]?.scenarios ?? 0,
            targetCompatibilityIssues: targetCompatibility.summary?.targetCompatibilityIssues ?? 0,
            warnings: targetCompatibility.summary?.warnings ?? 0,
            errors: targetCompatibility.summary?.errors ?? 0
          }
        : null,
      strictCompleteness: truth.summary,
      completeness: targetCompatibility?.summary?.completeness ?? splitCompletenessSummary(ownership),
      dungeon: dungeonSummary(),
      runtimeStateContainers: ownership.summary.statusCounts["runtime-cache"] ?? 0,
      needsFormatWork: ownership.summary.statusCounts["unknown-active-risk"] ?? 0,
      ed3: ed3Summary(),
      edcd: edcdSummary()
    },
    statusLabels: STATUS_LABELS,
    topRisks: unknownReport.backlogRisks.slice(0, 8).map((risk) => ({
      id: risk.id,
      family: risk.family,
      priority: risk.priority,
      status: STATUS_LABELS[risk.classification] ?? risk.classification,
      summary: risk.summary,
      evidenceCard: risk.evidenceCard
    })),
    containers: topContainers
  };
}

function buildCompletenessTruth(inventory, ownership, unknownReport) {
  const containers = ownership.containers.map((container) => {
    const effectiveStatuses = effectiveStatusesForContainer(container);
    const fixtureGate = fixtureGateForContainer(container.container);
    const evidence = [...new Set([...(container.evidence ?? []), ...(fixtureGate?.evidence ?? [])])];
    const truth = {
      semanticOwnership: semanticOwnershipFor(container, effectiveStatuses),
      writerReadiness: writerReadinessFor(container, effectiveStatuses, fixtureGate),
      evidenceQuality: evidenceQualityFor(container, evidence, fixtureGate),
      riskFlags: riskFlagsFor(container, effectiveStatuses, evidence, fixtureGate)
    };
    return {
      container: container.container,
      authorFacingName: container.authorFacingName,
      coverageStatus: container.coverageStatus,
      observedScenarioCount: container.observedScenarioCount,
      observedByteSizes: container.observedByteSizes,
      effectiveStatuses: [...effectiveStatuses].sort(),
      evidence,
      fixtureGate: fixtureGate
        ? {
            name: fixtureGate.gate,
            available: fixtureGate.available,
            partialOnly: Boolean(fixtureGate.partialOnly)
          }
        : null,
      truth
    };
  });
  const summary = summarizeCompletenessTruth(containers, unknownReport);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      byteOwnership: "docs/generated/scenario-byte-ownership.json",
      unknownReport: "docs/generated/scenario-unknown-byte-report.json",
      targetCompatibility: "docs/generated/scenario-target-compatibility.json",
      resourceCoverage: "docs/generated/resource-byte-ownership.json",
      dungeonCoverage: "docs/generated/dungeon-byte-ownership.json",
      customLandlookCoverage: "docs/generated/custom-landlook-coverage.json",
      rulesCoverage: "docs/generated/rules-resource-coverage.json",
      actionPointWriterGate: "docs/generated/action-point-writer-gate.json"
    },
    policy: {
      note: "Truth statuses are stricter than legacy coverageStatus. Semantic ownership, writer readiness, evidence quality, and package compatibility are intentionally separate.",
      scenarioSemanticsExcludeOptionalCodecs: true,
      writerReadinessRequiresFixtureOrExplicitGate: true,
      actionPointWriterGateStatus: actionPointWriterGate?.summary?.writerReadiness ?? null
    },
    summary,
    containers
  };
}

function validateInventoryAndOwnership(inventory, ownership, truth) {
  const leakedIgnored = inventory.fileFamilies.filter((file) => NON_SCENARIO_IGNORES.has(file.name));
  if (leakedIgnored.length > 0) {
    throw new Error(`Ignored non-scenario files leaked into inventory: ${leakedIgnored.map((file) => file.name).join(", ")}`);
  }
  for (const container of ownership.containers) {
    if (!container.coverageStatus) throw new Error(`${container.container} is missing a coverage status`);
    const finiteRanges = container.byteRanges
      .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.endExclusive))
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < finiteRanges.length; index += 1) {
      const previous = finiteRanges[index - 1];
      const current = finiteRanges[index];
      if (current.start < previous.endExclusive) {
        throw new Error(`${container.container} has overlapping byte ranges at ${previous.start}-${previous.endExclusive} and ${current.start}-${current.endExclusive}`);
      }
    }
    if (container.recordBytes !== null) {
      const maxObservedBytes = Math.max(container.recordBytes, ...(container.observedByteSizes ?? []));
      for (const range of finiteRanges) {
        if (range.start < 0 || range.endExclusive > maxObservedBytes) {
          throw new Error(`${container.container} byte range ${range.start}-${range.endExclusive} exceeds observed size ${maxObservedBytes}`);
        }
      }
    }
  }
  const truthByContainer = new Map((truth?.containers ?? []).map((container) => [container.container, container]));
  for (const container of ownership.containers) {
    const truthEntry = truthByContainer.get(container.container);
    if (!truthEntry) throw new Error(`${container.container} is missing from scenario completeness truth`);
    const hasDecodedWritable = effectiveStatusesForContainer(container).has("decoded-writable");
    if (container.coverageStatus === "decoded-writable" && !(container.evidence ?? []).length) {
      throw new Error(`${container.container} is decoded-writable but has no evidence source`);
    }
    if (
      hasDecodedWritable &&
      truthEntry.truth.writerReadiness === "fixture-proven" &&
      truthEntry.truth.evidenceQuality === "missing-evidence"
    ) {
      throw new Error(`${container.container} is fixture-proven without evidence`);
    }
    if (
      container.coverageStatus === "preserved-known" &&
      !(container.evidence ?? []).length &&
      container.container !== "Read Me (nice to know)"
    ) {
      throw new Error(`${container.container} is preserved-known but has no evidence source`);
    }
    if (
      effectiveStatusesForContainer(container).has("preserved-unknown") &&
      container.coverageStatus === "decoded-writable"
    ) {
      throw new Error(`${container.container} has preserved-unknown ranges but is still reported decoded-writable`);
    }
  }
  if ((truth.summary.packageCompatibility?.warnings ?? 0) > 0 && truth.summary.strictOutstanding?.targetWarnings === 0) {
    throw new Error("Target compatibility warnings are missing from the strict completion summary");
  }
}

function effectiveStatusesForContainer(container) {
  const statuses = new Set((container.byteRanges ?? []).map((range) => range.status).filter(Boolean));
  if (container.coverageStatus) statuses.add(container.coverageStatus);
  if (container.container === "Data DL") {
    for (const bit of container.bitOwnership ?? []) {
      if (bit.ownershipStatus) statuses.add(bit.ownershipStatus);
    }
  }
  statuses.delete("mixed-writable-preserved");
  if (!statuses.size && container.coverageStatus) statuses.add(container.coverageStatus);
  return statuses;
}

function fixtureGateForContainer(containerName) {
  const gate = FIXTURE_GATES[containerName];
  if (!gate) return null;
  const available = (gate.fixturePaths ?? []).every((fixturePath) => fs.existsSync(fixturePath));
  return { ...gate, available };
}

function semanticOwnershipFor(container, statuses) {
  if (statuses.has("ignored-non-scenario")) return "ignored";
  if (statuses.size === 1 && statuses.has("runtime-cache")) return "runtime-only";
  if (statuses.has("unknown-active-risk") || statuses.has("needs-codec-work")) return "needs-format-work";
  if (statuses.size === 1 && statuses.has("preserved-unknown")) return "needs-format-work";
  if (statuses.size > 1 || statuses.has("preserved-unknown")) return "mixed";
  return "complete";
}

function writerReadinessFor(container, statuses, fixtureGate) {
  if (statuses.has("ignored-non-scenario") || statuses.has("runtime-cache")) return "not-applicable";
  if (statuses.has("understood-resource-container")) return "not-applicable";
  if (statuses.has("decoded-readonly") && statuses.size === 1) return "read-only";
  if (statuses.has("custom-media-payload") || statuses.has("preserved-standard-media-payload")) return "preserve-only";
  if (statuses.has("unknown-active-risk") || statuses.has("needs-codec-work") || statuses.has("preserved-unknown")) {
    return statuses.has("decoded-writable") ? "partially-proven" : "writer-gated";
  }
  if (statuses.has("decoded-writable") && (statuses.has("preserved-known") || statuses.has("understood-runtime-writer-gated") || statuses.has("runtime-state"))) {
    return fixtureGate?.available || fixtureGate?.partialOnly ? "partially-proven" : "writer-gated";
  }
  if (statuses.has("decoded-writable")) {
    if (fixtureGate?.partialOnly) return "partially-proven";
    if (fixtureGate?.available) return "fixture-proven";
    return "writer-gated";
  }
  if (statuses.has("understood-runtime-writer-gated")) return "writer-gated";
  if (statuses.has("preserved-known") || statuses.has("preserved-unknown")) return "preserve-only";
  return "writer-gated";
}

function evidenceQualityFor(container, evidence, fixtureGate) {
  if (container.coverageStatus === "ignored-non-scenario") return "cited";
  if (fixtureGate && !fixtureGate.available && (fixtureGate.fixturePaths ?? []).length > 0) return "skipped-fixture";
  if (fixtureGate?.available) return "fixture-backed";
  if ((targetCompatibility?.summary?.warnings ?? 0) > 0 && container.role === "resource-fork") return "target-warning";
  if (!evidence.length) return "missing-evidence";
  return "cited";
}

function riskFlagsFor(container, statuses, evidence, fixtureGate) {
  const flags = [];
  if (!evidence.length && container.coverageStatus !== "ignored-non-scenario") flags.push("missing-evidence");
  if (fixtureGate && !fixtureGate.available && (fixtureGate.fixturePaths ?? []).length > 0) flags.push("skipped-fixture");
  if (statuses.has("preserved-unknown")) flags.push("preserved-unknown");
  if (statuses.has("understood-runtime-writer-gated")) flags.push("writer-gated");
  if (container.coverageStatus === "decoded-writable" && !fixtureGate?.available) flags.push("structural-writer-claim");
  if (container.container === "Data DL" && statuses.has("preserved-unknown")) flags.push("dungeon-high-bit-unresolved");
  if (container.role === "resource-fork" && (targetCompatibility?.summary?.warnings ?? 0) > 0) flags.push("target-package-warning");
  return [...new Set(flags)].sort();
}

function summarizeCompletenessTruth(containers, unknownReport) {
  const semanticOwnershipCounts = countBy(containers, (container) => container.truth.semanticOwnership);
  const writerReadinessCounts = countBy(containers, (container) => container.truth.writerReadiness);
  const evidenceQualityCounts = countBy(containers, (container) => container.truth.evidenceQuality);
  const riskFlagCounts = {};
  for (const container of containers) {
    for (const flag of container.truth.riskFlags) {
      riskFlagCounts[flag] = (riskFlagCounts[flag] ?? 0) + 1;
    }
  }
  const totalContainers = containers.length;
  const semanticComplete = semanticOwnershipCounts.complete ?? 0;
  const writerProven = (writerReadinessCounts["fixture-proven"] ?? 0) + (writerReadinessCounts["partially-proven"] ?? 0);
  const packageWarnings = targetCompatibility?.summary?.warnings ?? 0;
  const packageErrors = targetCompatibility?.summary?.errors ?? 0;
  const targetIssues = targetCompatibility?.summary?.targetCompatibilityIssues ?? 0;
  const codecSummary = targetCompatibility?.summary?.completeness?.mediaCodecInternals ?? splitCompletenessSummary({ summary: { statusObservedBytes: {} } }).mediaCodecInternals;
  const strictOutstanding = {
    writerGatedContainers: writerReadinessCounts["writer-gated"] ?? 0,
    missingEvidenceContainers: evidenceQualityCounts["missing-evidence"] ?? 0,
    skippedFixtureContainers: evidenceQualityCounts["skipped-fixture"] ?? 0,
    preservedUnknownContainers: riskFlagCounts["preserved-unknown"] ?? 0,
    targetWarnings: packageWarnings,
    backlogRisks: unknownReport.summary?.backlogRisks ?? 0
  };
  return {
    containerCount: totalContainers,
    semanticOwnershipCounts,
    writerReadinessCounts,
    evidenceQualityCounts,
    riskFlagCounts,
    scenarioSemantics: {
      label: "Scenario Semantics",
      status: strictOutstanding.preservedUnknownContainers > 0 || (semanticOwnershipCounts["needs-format-work"] ?? 0) > 0 ? "mixed" : "complete",
      completeContainers: semanticComplete,
      mixedContainers: semanticOwnershipCounts.mixed ?? 0,
      needsFormatWorkContainers: semanticOwnershipCounts["needs-format-work"] ?? 0,
      percentContainers: percentage(semanticComplete, totalContainers)
    },
    writerProvenData: {
      label: "Writer-Proven Data",
      status: strictOutstanding.writerGatedContainers > 0 || strictOutstanding.skippedFixtureContainers > 0 ? "incomplete" : "complete",
      fixtureProvenContainers: writerReadinessCounts["fixture-proven"] ?? 0,
      partiallyProvenContainers: writerReadinessCounts["partially-proven"] ?? 0,
      writerGatedContainers: writerReadinessCounts["writer-gated"] ?? 0,
      percentContainers: percentage(writerProven, totalContainers)
    },
    packageCompatibility: {
      label: "Package Compatibility",
      status: packageErrors > 0 ? "has-errors" : packageWarnings > 0 ? "has-warnings" : "clean",
      targetCompatibilityIssues: targetIssues,
      warnings: packageWarnings,
      errors: packageErrors
    },
    codecInternals: {
      label: "Codec Internals",
      status: "stage-two-optional",
      preservedOrCustomPayloadBytes: codecSummary.preservedOrCustomPayloadBytes ?? 0,
      decodedResourcePayloadBytes: codecSummary.decodedResourcePayloadBytes ?? 0
    },
    strictOutstanding
  };
}

function countBy(items, selector) {
  const counts = {};
  for (const item of items) {
    const key = selector(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function percentage(value, total) {
  if (!total) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

function splitCompletenessSummary(ownership) {
  const statusBytes = ownership.summary?.statusObservedBytes ?? {};
  const totalObservedBytes = Object.values(statusBytes).reduce((total, value) => total + Number(value || 0), 0);
  const activeRiskBytes =
    (statusBytes["unknown-active-risk"] ?? 0) +
    (statusBytes["needs-codec-work"] ?? 0) +
    (statusBytes["preserved-unknown"] ?? 0);
  const payloadBytes = resourceByteOwnership?.summary?.statusObservedBytes ?? {};
  return {
    scenarioSemanticOwnership: {
      status: activeRiskBytes === 0 ? "complete-at-scenario-boundary" : "has-active-risk",
      observedBytes: totalObservedBytes - activeRiskBytes,
      totalObservedBytes,
      activeRiskBytes,
      note: "Preserved standard media payloads count as scenario-owned media boundaries, not missing scenario semantics."
    },
    resourceContainerOwnership: {
      status:
        (resourceByteOwnership?.summary?.unparsedResourceForks ?? 0) === 0
          ? "complete-for-observed-resource-forks"
          : "has-unparsed-resource-forks",
      parsedResourceForks: resourceByteOwnership?.summary?.parsedResourceForks ?? 0,
      resourceForkFiles: resourceByteOwnership?.summary?.resourceForkFiles ?? 0,
      resourceEntries: resourceByteOwnership?.summary?.resourceEntries ?? 0
    },
    mediaCodecInternals: {
      status: "stage-two-optional",
      preservedOrCustomPayloadBytes:
        (payloadBytes["preserved-standard-media-payload"] ?? 0) +
        (statusBytes["custom-media-payload"] ?? 0),
      decodedResourcePayloadBytes: payloadBytes["decoded-resource-payload"] ?? 0,
      note: "Full PICT/cicn/snd/custom-music internals are not required for scenario semantic completion."
    }
  };
}

function scanScenarioRoots(scenarios) {
  return scenarios.map((scenario) => {
    const sourcePath = scenario.sourcePath;
    const files = [];
    const ignoredFiles = [];
    if (sourcePath && fs.existsSync(sourcePath)) {
      for (const name of fs.readdirSync(sourcePath).sort()) {
        const fullPath = path.join(sourcePath, name);
        const stat = fs.statSync(fullPath);
        if (!stat.isFile()) continue;
        if (NON_SCENARIO_IGNORES.has(name)) {
          ignoredFiles.push({ name, reason: "OS/Finder metadata" });
          continue;
        }
        const resourceTypes = resourceForkTypesFor(fullPath);
        files.push({
          name,
          bytes: stat.size,
          role: roleForScannedFile(name),
          resourceTypes
        });
      }
    } else {
      for (const file of scenario.files ?? []) {
        files.push({
          name: file.name,
          bytes: file.sourceBytes,
          role: file.role,
          resourceTypes: []
        });
      }
    }
    return {
      name: scenario.name,
      sourceRoot: scenario.sourceRoot,
      sourcePath,
      status: scenario.status,
      fileCount: files.length,
      ignoredFiles,
      files
    };
  });
}

function aggregateFiles(scenarios, scanned) {
  const byName = new Map();
  for (const scenario of scenarios) {
    for (const file of scenario.files ?? []) {
      if (NON_SCENARIO_IGNORES.has(file.name)) continue;
      addFileAggregate(byName, file.name, {
        bytes: file.sourceBytes,
        role: file.role,
        classification: file.classification,
        scenario: scenario.name
      });
    }
  }
  for (const scenario of scanned) {
    for (const file of scenario.files) {
      if (NON_SCENARIO_IGNORES.has(file.name)) continue;
      addFileAggregate(byName, file.name, {
        bytes: file.bytes,
        role: file.role,
        classification: "scanned",
        scenario: scenario.name,
        resourceTypes: file.resourceTypes
      });
    }
  }
  const files = [...byName.values()].map((file) => {
    const coverageStatus = coverageStatusForFile(file);
    return {
      name: file.name,
      scenarioCount: file.scenarios.size,
      roles: [...file.roles].sort(),
      classifications: [...file.classifications].sort(),
      observedByteSizes: [...file.byteSizes].sort((a, b) => a - b),
      resourceTypes: [...file.resourceTypes.values()].sort((a, b) => a.type.localeCompare(b.type)),
      coverageStatus,
      editable: coverageStatus === "decoded-writable"
    };
  }).sort((a, b) => b.scenarioCount - a.scenarioCount || a.name.localeCompare(b.name));
  return { files };
}

function addFileAggregate(byName, name, entry) {
  if (!byName.has(name)) {
    byName.set(name, {
      name,
      scenarios: new Set(),
      roles: new Set(),
      classifications: new Set(),
      byteSizes: new Set(),
      resourceTypes: new Map()
    });
  }
  const aggregate = byName.get(name);
  aggregate.scenarios.add(entry.scenario);
  aggregate.roles.add(entry.role);
  aggregate.classifications.add(entry.classification);
  aggregate.byteSizes.add(Number(entry.bytes ?? 0));
  for (const resource of entry.resourceTypes ?? []) {
    const key = resource.type;
    const existing = aggregate.resourceTypes.get(key) ?? { type: resource.type, count: 0, bytes: 0, status: resource.status, role: resource.role };
    existing.count += resource.count;
    existing.bytes += resource.bytes;
    aggregate.resourceTypes.set(key, existing);
  }
}

function coverageStatusForFile(file) {
  const { name, roles } = file;
  if (NON_SCENARIO_IGNORES.has(name)) return "ignored-non-scenario";
  if (runtimeCaches.entries?.some((entry) => entry.cache === name)) return "runtime-cache";
  if (name === "Data DL" && dungeonByteOwnership) return "mixed-writable-preserved";
  if (customLandlookCoverage && /^Data Custom [123] BD$/.test(name)) return "mixed-writable-preserved";
  if (rulesCoverage && (name === "Data Spell" || name === "Data Race" || name === "Data Caste")) return "mixed-writable-preserved";
  if (RECORD_LAYOUTS[name]) return RECORD_LAYOUTS[name].status;
  if (PASS_THROUGH_POLICIES[name]) return PASS_THROUGH_POLICIES[name].status;
  if (roles.has("supported-binary") && file.byteSizes.size > 0 && [...file.byteSizes].every((size) => size === 316 || size === 320)) return "decoded-writable";
  if (rustRegistry.supportedWriteFiles.has(name)) return "decoded-writable";
  if (roles.has("resource-fork") || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._") || name === "Scenario") {
    return parsedResourceForkNames.has(name) ? "understood-resource-container" : "preserved-known";
  }
  if (rustRegistry.trackedFiles.has(name)) return "preserved-known";
  return "unknown-active-risk";
}

function byteRangesForFile(file, layout) {
  if (file.name === "Data Spell" && rulesCoverage?.byteOwnership?.["Data Spell"]) {
    return rulesCoverage.byteOwnership["Data Spell"];
  }
  if (file.name === "Data Race" && rulesCoverage?.byteOwnership?.["Data Race"]) {
    return rulesCoverage.byteOwnership["Data Race"];
  }
  if (file.name === "Data Caste" && rulesCoverage?.byteOwnership?.["Data Caste"]) {
    return rulesCoverage.byteOwnership["Data Caste"];
  }
  if (/^Data Custom [123] BD$/.test(file.name) && customLandlookCoverage?.layout) {
    const layout = customLandlookCoverage.layout;
    return [
      {
        start: 0,
        length: layout.baseTileOffset,
        endExclusive: layout.baseTileOffset,
        status: "decoded-writable",
        field: "Custom land tile records",
        internal: "mapstats[201]"
      },
      {
        start: layout.baseTileOffset,
        length: 2,
        endExclusive: layout.baseTileOffset + 2,
        status: "decoded-writable",
        field: "Base tile",
        internal: "basetile"
      },
      {
        start: layout.baseScaleOffset,
        length: 2,
        endExclusive: layout.baseScaleOffset + 2,
        status: "decoded-writable",
        field: "Base scale",
        internal: "basescale"
      },
      {
        start: layout.rangeTailOffset,
        length: layout.expectedBytes - layout.rangeTailOffset,
        endExclusive: layout.expectedBytes,
        status: "understood-runtime-writer-gated",
        field: "Divinity tile range slots",
        internal: "range slots with reserved words preserved"
      }
    ];
  }
  if (file.name === "Data DL" && dungeonByteOwnership?.recordByteRanges?.length) {
    return [
      {
        start: 0,
        length: dungeonByteOwnership.recordLayout?.bytesPerLevel ?? layout?.recordBytes ?? 16200,
        endExclusive: dungeonByteOwnership.recordLayout?.bytesPerLevel ?? layout?.recordBytes ?? 16200,
        status: "decoded-writable",
        field: "Dungeon cell bitfields",
        internal: "field[90][90]",
        bitOwnership: "docs/generated/dungeon-byte-ownership.json",
        bitTaxonomy: "docs/generated/dungeon-cell-bit-taxonomy.json"
      }
    ];
  }
  if (file.name === "Data ED3") {
    return [
      { start: 0, length: 4, endExclusive: 4, status: "decoded-writable", field: "Extra Action Point ID", internal: "doorid", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 4, length: 1, endExclusive: 5, status: "decoded-writable", field: "Level", internal: "landid", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 5, length: 1, endExclusive: 6, status: "decoded-writable", field: "X", internal: "landx", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 6, length: 1, endExclusive: 7, status: "decoded-writable", field: "Y", internal: "landy", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 7, length: 1, endExclusive: 8, status: "decoded-writable", field: "Chance", internal: "percent", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 8, length: 16, endExclusive: 24, status: "decoded-writable", field: "Action codes", internal: "code[8]", writerGate: "docs/generated/action-point-writer-gate.json" },
      { start: 24, length: 16, endExclusive: 40, status: "decoded-writable", field: "Action IDs", internal: "id[8]", writerGate: "docs/generated/action-point-writer-gate.json" }
    ];
  }
  if (file.name === "Data EDCD") {
    return [0, 1, 2, 3, 4].map((index) => ({
      start: index * 2,
      length: 2,
      endExclusive: index * 2 + 2,
      status: "decoded-writable",
      field: `Parameter ${index + 1}`,
      internal: `extracode[${index}]`,
      writerGate: "docs/generated/action-point-writer-gate.json"
    }));
  }
  if (layout?.recordBytes) {
    return [
      {
        start: 0,
        length: layout.recordBytes,
        endExclusive: layout.recordBytes,
        status: layout.status,
        field: layout.label,
        internal: "fixed record"
      }
    ];
  }
  return [
    {
      start: 0,
      length: null,
      endExclusive: null,
      status: file.coverageStatus,
      field: labelForFile(file),
      internal: null
    }
  ];
}

function summarizeOwnership(containers) {
  const statusCounts = {};
  const statusObservedBytes = {};
  for (const container of containers) {
    statusCounts[container.coverageStatus] = (statusCounts[container.coverageStatus] ?? 0) + 1;
    statusObservedBytes[container.coverageStatus] =
      (statusObservedBytes[container.coverageStatus] ?? 0) +
      container.observedByteSizes.reduce((sum, size) => sum + size * container.observedScenarioCount, 0);
  }
  return {
    containerCount: containers.length,
    statusCounts,
    statusObservedBytes
  };
}

function evidenceForFile(name, status) {
  const evidence = [];
  if (name === "Data DL") {
    evidence.push("docs/generated/dungeon-byte-ownership.json");
    evidence.push("docs/generated/dungeon-cell-bit-taxonomy.json");
    evidence.push("docs/generated/dungeon-high-bit-audit.json");
    evidence.push("docs/format-evidence-cards/dungeon-runtime-anchors.md");
  } else if (name === "Data ED3") {
    evidence.push("docs/generated/action-point-writer-gate.json");
    evidence.push("docs/generated/extra-ap-reachability-source-map.json");
    evidence.push("docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md");
  } else if (name === "Data EDCD") {
    evidence.push("docs/generated/action-point-writer-gate.json");
    evidence.push("docs/generated/opcode-edcd-crosswalk.json");
    evidence.push("docs/format-evidence-cards/edcd-opcode-source-map.md");
  } else if (name === "Data OD" || name === "Data SD2") {
    evidence.push("docs/format-evidence-cards/strings-data-od-string-sound.md");
  } else if (/^Data Custom [123] BD$/.test(name)) {
    evidence.push("docs/generated/custom-landlook-coverage.json");
    evidence.push("docs/format-evidence-cards/custom-landlook-writers.md");
  } else if (name === "Data Spell" || name === "Data Race" || name === "Data Caste") {
    evidence.push("docs/generated/rules-resource-coverage.json");
    evidence.push("docs/generated/rules-name-resource-packaging.json");
    evidence.push("docs/format-evidence-cards/rules-spell-race-caste-runtime-anchors.md");
  } else if (name === "Data LD" || name === "Layout") {
    evidence.push("docs/generated/map-field-value-evidence.json");
    evidence.push("docs/format-evidence-cards/map-tile-runtime-anchors.md");
  } else if (name === "Data DD" || name === "Data DDD" || name === "Global") {
    evidence.push("docs/generated/extra-ap-reachability-source-map.json");
    evidence.push("docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md");
  } else if (name === "Data RD" || name === "Data RDD") {
    evidence.push("docs/generated/corpus-field-usage.json");
    evidence.push("docs/format-evidence-cards/encounter-record-runtime-anchors.md");
  } else if (name === "Data ED" || name === "Data ED2") {
    evidence.push("docs/generated/encounter-record-evidence.json");
    evidence.push("docs/format-evidence-cards/encounter-record-runtime-anchors.md");
  } else if (name === "Data MD" || name === "Data MD1" || name === "Data MD-1") {
    evidence.push("docs/generated/monster-record-evidence.json");
    evidence.push("docs/format-evidence-cards/monster-record-runtime-anchors.md");
  } else if (name === "Data DES") {
    evidence.push("docs/format-evidence-cards/monster-descriptions-and-sets-runtime-anchors.md");
  } else if (name === "Data BD") {
    evidence.push("docs/generated/battle-record-evidence.json");
    evidence.push("docs/format-evidence-cards/battle-record-runtime-anchors.md");
  } else if (name === "Data SD" || name === "Data TD" || name === "Data TD2" || name === "Data TD3") {
    evidence.push("docs/format-evidence-cards/item-treasure-shop-runtime-anchors.md");
    if (name === "Data TD2" || name === "Data TD3") evidence.push("docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md");
  } else if (name === "Data MD2") {
    evidence.push("docs/generated/map-record-evidence.json");
    evidence.push("docs/format-evidence-cards/map-record-runtime-anchors.md");
  } else if (name === "Data CI" || name === "Data RI") {
    evidence.push("docs/generated/scenario-party-restrictions-evidence.json");
    evidence.push("docs/format-evidence-cards/scenario-party-restrictions-runtime-anchors.md");
  } else if (name === "Data NI") {
    evidence.push("docs/generated/core-rules-record-evidence.json");
    evidence.push("docs/format-evidence-cards/core-rules-record-runtime-anchors.md");
  } else if (name === "Data Solids") {
    evidence.push("docs/format-evidence-cards/map-tile-intelligence.md");
  } else if (name === "Data CS") {
    evidence.push("docs/format-evidence-cards/scenario-shell-startup-release.md");
  } else if (name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._")) {
    evidence.push("docs/generated/resource-byte-ownership.json");
    evidence.push("docs/format-evidence-cards/resource-fork-taxonomy-authoring.md");
  } else if (name === "Format" || name === "Icon_" || /^Custom [1-9]( Music)?$/.test(name)) {
    evidence.push("docs/generated/scenario-target-compatibility.json");
    evidence.push("docs/format-evidence-cards/scenario-music-and-format-files.md");
  } else if (status === "decoded-writable") {
    evidence.push("docs/generated/corpus-field-usage.json");
    evidence.push("docs/format-evidence-cards/scenario-shell-startup-release.md");
  } else if (status === "runtime-cache") {
    evidence.push("docs/generated/runtime-cache-classification.json");
  } else if (status === "unknown-active-risk") {
    evidence.push("docs/generated/unknown-data-backlog.json");
  }
  return evidence;
}

function editorPolicyFor(status) {
  switch (status) {
    case "decoded-writable":
      return "Editable fields may be written when the record-specific writer owns the byte range.";
    case "decoded-readonly":
      return "Decoded for inspection and validation; editing is hidden until writer coverage exists.";
    case "mixed-writable-preserved":
      return "Some byte ranges are writer-proven or structurally decoded, while preserved/runtime ranges remain read-only.";
    case "preserved-known":
      return "Known scenario payload preserved byte-for-byte unless explicitly imported into a supported editor workflow.";
    case "preserved-unknown":
      return "Preserved byte-for-byte; format ownership is not yet proven.";
    case "runtime-cache":
      return "Runtime/generated state. Providence inspects it only when useful and writes the authored source file instead.";
    case "ignored-non-scenario":
      return "Ignored as non-scenario metadata or packaging documentation.";
    case "understood-resource-container":
      return "Resource fork container, map, type, reference, name, and data-entry bytes are inventoried. Payload codec ownership is tracked separately.";
    case "decoded-resource-payload":
      return "Resource payload bytes are decoded for reference or validation; normal editing still follows supported project-owned resource workflows.";
    case "preserved-standard-media-payload":
      return "Standard classic media payload preserved byte-for-byte until the specific resource is replaced through a supported import workflow.";
    case "custom-media-payload":
      return "Scenario-owned custom media payload preserved byte-for-byte until a dedicated codec writer owns the format.";
    case "needs-codec-work":
      return "Resource payload or container needs further codec archaeology before semantic ownership can be claimed.";
    case "understood-runtime-writer-gated":
      return "Runtime behavior and byte ownership are understood; normal editing remains gated to fixture-proven writer paths.";
    default:
      return "Needs format work before Providence can claim safe authoring behavior.";
  }
}

function roleForScannedFile(name) {
  if (rustRegistry.supportedWriteFiles.has(name)) return "supported-binary";
  if (name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._")) return "resource-fork";
  if (rustRegistry.trackedFiles.has(name)) return "pass-through";
  return "unknown";
}

function resourceForkTypesFor(filePath) {
  const name = path.basename(filePath);
  if (!(name === "Scenario" || name.endsWith(".rsrc") || name.endsWith(".rsf") || name.startsWith("._"))) return [];
  try {
    const size = fs.statSync(filePath).size;
    if (size > MAX_RESOURCE_FORK_BYTES_TO_SCAN) return [{ type: "large-resource-fork", count: 1, bytes: size, status: "preserved-known", role: "large resource fork" }];
    const buffer = fs.readFileSync(filePath);
    const groups = parseResourceForkEntries(buffer)
      .reduce((groups, entry) => {
        const policy = RESOURCE_TYPE_POLICIES[entry.type] ?? { status: "preserved-unknown", role: "resource" };
        const group = groups.get(entry.type) ?? { type: entry.type, count: 0, bytes: 0, status: policy.status, role: policy.role };
        group.count += 1;
        group.bytes += entry.length;
        groups.set(entry.type, group);
        return groups;
      }, new Map());
    return [...groups.values()];
  } catch {
    return [];
  }
}

function parseResourceForkEntries(buffer) {
  buffer = extractResourceForkBuffer(buffer);
  if (buffer.length < 16) return [];
  const dataOffset = u32At(buffer, 0);
  const mapOffset = u32At(buffer, 4);
  const dataLength = u32At(buffer, 8);
  const mapLength = u32At(buffer, 12);
  if ([dataOffset, mapOffset, dataLength, mapLength].some((value) => value === null)) return [];
  if (dataOffset + dataLength > buffer.length || mapOffset + mapLength > buffer.length) return [];
  const typeListRelativeOffset = u16At(buffer, mapOffset + 24);
  if (typeListRelativeOffset === null) return [];
  const typeListOffset = mapOffset + typeListRelativeOffset;
  const typeCountMinusOne = u16At(buffer, typeListOffset);
  if (typeCountMinusOne === null) return [];
  if (typeCountMinusOne + 1 > MAX_RESOURCE_TYPES) return [];
  const entries = [];
  for (let typeIndex = 0; typeIndex <= typeCountMinusOne; typeIndex += 1) {
    const typeOffset = typeListOffset + 2 + typeIndex * 8;
    if (typeOffset + 8 > buffer.length) break;
    const type = textAt(buffer, typeOffset, 4);
    const resourceCountMinusOne = u16At(buffer, typeOffset + 4);
    const refListOffset = u16At(buffer, typeOffset + 6);
    if (resourceCountMinusOne === null || refListOffset === null) continue;
    if (resourceCountMinusOne + 1 > MAX_RESOURCES_PER_TYPE) continue;
    for (let refIndex = 0; refIndex <= resourceCountMinusOne; refIndex += 1) {
      const refOffset = typeListOffset + refListOffset + refIndex * 12;
      if (refOffset + 12 > buffer.length) break;
      const id = i16At(buffer, refOffset);
      const dataRelative = u24At(buffer, refOffset + 5);
      if (id === null || dataRelative === null) continue;
      const dataEntryOffset = dataOffset + dataRelative;
      const length = u32At(buffer, dataEntryOffset);
      if (length === null || dataEntryOffset + 4 + length > buffer.length) continue;
      entries.push({ type, id, length });
    }
  }
  return entries;
}

function extractResourceForkBuffer(buffer) {
  if (buffer.length < 26) return buffer;
  const magic = u32At(buffer, 0);
  if (magic !== APPLE_SINGLE_MAGIC && magic !== APPLE_DOUBLE_MAGIC) return buffer;
  const entryCount = u16At(buffer, 24);
  if (entryCount === null) return buffer;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = 26 + index * 12;
    const entryId = u32At(buffer, entryOffset);
    const offset = u32At(buffer, entryOffset + 4);
    const length = u32At(buffer, entryOffset + 8);
    if (entryId === RESOURCE_FORK_ENTRY_ID && offset !== null && length !== null && offset + length <= buffer.length) {
      return buffer.subarray(offset, offset + length);
    }
  }
  return buffer;
}

function parseRustRegistry(source) {
  return {
    supportedWriteFiles: parseRustStringArray(source, "SUPPORTED_WRITE_FILES"),
    trackedFiles: parseRustStringArray(source, "TRACKED_FILES")
  };
}

function parseRustStringArray(source, name) {
  const match = source.match(new RegExp(`pub const ${name}: \\&\\[\\&str\\] = \\&\\[([\\s\\S]*?)\\];`));
  if (!match) return new Set();
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]));
}

function ed3Summary() {
  const pathToFile = path.join(repoRoot, "docs/generated/extra-ap-reachability-source-map.json");
  const data = readJson(pathToFile);
  const gate = actionPointWriterGate?.gates?.find((entry) => entry.container === "Data ED3");
  return {
    status: "Extra Action Point storage is fixed-row writer-proven; normal authoring remains reachability-gated.",
    recordBytes: data.storage?.recordBytes ?? 40,
    writerStatus: gate?.writerStatus ?? null,
    semanticExposure: gate?.semanticExposure ?? "reachability-gated",
    runtimeCallsites: data.loaddoor2CallsiteAudit?.totalRuntimeCallsites ?? null,
    evidence: [
      "docs/generated/action-point-writer-gate.json",
      "docs/generated/extra-ap-reachability-source-map.json"
    ]
  };
}

function edcdSummary() {
  const pathToFile = path.join(repoRoot, "docs/generated/opcode-edcd-crosswalk.json");
  const data = readJson(pathToFile);
  const gate = actionPointWriterGate?.gates?.find((entry) => entry.container === "Data EDCD");
  return {
    status: "Action parameter row storage is fixed-row writer-proven; field labels remain opcode-crosswalk-gated.",
    edcdBackedOpcodes: data.summary?.edcdBacked ?? null,
    fieldComparisonGaps: data.summary?.fieldComparisonGaps?.length ?? null,
    writerStatus: gate?.writerStatus ?? null,
    semanticExposure: gate?.semanticExposure ?? "opcode-crosswalk-gated",
    evidence: [
      "docs/generated/action-point-writer-gate.json",
      "docs/generated/opcode-edcd-crosswalk.json"
    ]
  };
}

function dungeonSummary() {
  if (!dungeonByteOwnership) {
    return {
      status: "Dungeon bit coverage has not been generated yet.",
      bits: null,
      writerSafeBits: null,
      runtimeStateBits: null,
      preservedUnknownBits: null,
      preservedKnownBits: null,
      evidence: "docs/generated/dungeon-byte-ownership.json"
    };
  }
  const bitStatuses = dungeonByteOwnership.summary?.bitStatuses ?? {};
  const writerStatuses = dungeonByteOwnership.summary?.writerStatuses ?? {};
  return {
    status: "Dungeon cells are classified as signed-short bitfields with per-bit ownership.",
    bits: dungeonByteOwnership.bitOwnership?.length ?? 16,
    writerSafeBits: writerStatuses["writer-safe-primitive"] ?? 0,
    routedWorkflowBits:
      (writerStatuses["route-through-note-workflow"] ?? 0) +
      (writerStatuses["route-through-action-point-workflow"] ?? 0),
    runtimeStateBits: bitStatuses["runtime-state"] ?? 0,
    preservedUnknownBits: bitStatuses["preserved-unknown"] ?? 0,
    preservedKnownBits: bitStatuses["preserved-known"] ?? 0,
    evidence: "docs/generated/dungeon-byte-ownership.json"
  };
}

function labelForFile(file) {
  if (file.roles.includes("supported-binary") && file.observedByteSizes?.every((size) => size === 316 || size === 320)) return "Scenario startup shell";
  if (file.resourceTypes?.length) return "Resource fork";
  if (file.roles.includes("resource-fork")) return "Resource fork";
  if (file.roles.includes("pass-through")) return "Preserved scenario file";
  return "Scenario file";
}

function statusSort(status) {
  return {
    "unknown-active-risk": 0,
    "preserved-unknown": 1,
    "needs-codec-work": 2,
    "decoded-readonly": 3,
    "runtime-cache": 4,
    "mixed-writable-preserved": 5,
    "preserved-known": 6,
    "custom-media-payload": 7,
    "preserved-standard-media-payload": 8,
    "understood-resource-container": 9,
    "decoded-resource-payload": 10,
    "decoded-writable": 11,
    "ignored-non-scenario": 12
  }[status] ?? 99;
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}
