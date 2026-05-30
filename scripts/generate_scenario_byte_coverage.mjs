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
const targetCompatibilityPath = path.join(repoRoot, "docs/generated/scenario-target-compatibility.json");
const realmzRsPath = path.join(repoRoot, "src-tauri/src/realmz.rs");

const fileInventoryPath = path.join(repoRoot, "docs/generated/scenario-file-inventory.json");
const byteOwnershipPath = path.join(repoRoot, "docs/generated/scenario-byte-ownership.json");
const unknownReportPath = path.join(repoRoot, "docs/generated/scenario-unknown-byte-report.json");
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
  "Custom 1": { status: "preserved-known", label: "Custom scenario media or landlook data" },
  "Custom 2": { status: "preserved-known", label: "Custom scenario media or landlook data" },
  "Custom 3": { status: "preserved-known", label: "Custom scenario media or landlook data" },
  "Custom 4": { status: "preserved-known", label: "Custom scenario media or landlook data" },
  "Custom 5": { status: "preserved-known", label: "Custom scenario media or landlook data" },
  "Custom 6": { status: "preserved-known", label: "Custom scenario media or landlook data" },
  "Custom 7": { status: "preserved-known", label: "Custom scenario media or landlook data" },
  "Custom 8": { status: "preserved-known", label: "Custom scenario media or landlook data" },
  "Custom 9": { status: "preserved-known", label: "Custom scenario media or landlook data" },
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
const targetCompatibility = readOptionalJson(targetCompatibilityPath);
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
const uiManifest = buildUiManifest(inventory, ownership, unknownReport);
validateInventoryAndOwnership(inventory, ownership);

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
writeJson(runtimeCachePath, updatedRuntimeCaches);
writeJson(uiManifestPath, uiManifest);

console.log(`Wrote ${path.relative(repoRoot, fileInventoryPath)}`);
console.log(`Wrote ${path.relative(repoRoot, byteOwnershipPath)}`);
console.log(`Wrote ${path.relative(repoRoot, unknownReportPath)}`);
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
        dungeonCoverage: "docs/generated/dungeon-byte-ownership.json",
        dungeonHighBitAudit: "docs/generated/dungeon-high-bit-audit.json"
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
      "preserved-known",
      "preserved-unknown",
      "runtime-cache",
      "ignored-non-scenario",
      "unknown-active-risk",
      "understood-resource-container",
      "decoded-resource-payload",
      "preserved-standard-media-payload",
      "custom-media-payload",
      "needs-codec-work"
    ],
    sources: {
      fileInventory: "docs/generated/scenario-file-inventory.json",
      unknownBacklog: "docs/generated/unknown-data-backlog.json",
        runtimeCaches: "docs/generated/runtime-cache-classification.json",
        resourceCoverage: "docs/generated/resource-byte-ownership.json",
        dungeonCoverage: "docs/generated/dungeon-byte-ownership.json",
        dungeonHighBitAudit: "docs/generated/dungeon-high-bit-audit.json",
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
      ignoredNonScenarioFiles: inventory.summary.ignoredNonScenarioFiles
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

function buildUiManifest(inventory, ownership, unknownReport) {
  const statusLabels = {
    "decoded-writable": "Editable",
    "decoded-readonly": "Read-only",
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
  const topContainers = ownership.containers
    .filter((container) => container.observedScenarioCount > 0)
    .sort((a, b) => statusSort(a.coverageStatus) - statusSort(b.coverageStatus) || b.observedScenarioCount - a.observedScenarioCount || a.container.localeCompare(b.container))
    .slice(0, 30)
    .map((container) => ({
      container: container.container,
      label: container.authorFacingName,
      status: statusLabels[container.coverageStatus] ?? container.coverageStatus,
      coverageStatus: container.coverageStatus,
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
      completeness: targetCompatibility?.summary?.completeness ?? splitCompletenessSummary(ownership),
      dungeon: dungeonSummary(),
      runtimeStateContainers: ownership.summary.statusCounts["runtime-cache"] ?? 0,
      needsFormatWork: ownership.summary.statusCounts["unknown-active-risk"] ?? 0,
      ed3: ed3Summary(),
      edcd: edcdSummary()
    },
    statusLabels,
    topRisks: unknownReport.backlogRisks.slice(0, 8).map((risk) => ({
      id: risk.id,
      family: risk.family,
      priority: risk.priority,
      status: statusLabels[risk.classification] ?? risk.classification,
      summary: risk.summary,
      evidenceCard: risk.evidenceCard
    })),
    containers: topContainers
  };
}

function validateInventoryAndOwnership(inventory, ownership) {
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
      for (const range of finiteRanges) {
        if (range.start < 0 || range.endExclusive > container.recordBytes) {
          throw new Error(`${container.container} byte range ${range.start}-${range.endExclusive} exceeds record size ${container.recordBytes}`);
        }
      }
    }
  }
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
      { start: 0, length: 4, endExclusive: 4, status: "decoded-writable", field: "Extra Action Point ID", internal: "doorid" },
      { start: 4, length: 1, endExclusive: 5, status: "decoded-writable", field: "Level", internal: "landid" },
      { start: 5, length: 1, endExclusive: 6, status: "decoded-writable", field: "X", internal: "landx" },
      { start: 6, length: 1, endExclusive: 7, status: "decoded-writable", field: "Y", internal: "landy" },
      { start: 7, length: 1, endExclusive: 8, status: "decoded-writable", field: "Chance", internal: "percent" },
      { start: 8, length: 16, endExclusive: 24, status: "decoded-writable", field: "Action codes", internal: "code[8]" },
      { start: 24, length: 16, endExclusive: 40, status: "decoded-writable", field: "Action IDs", internal: "id[8]" }
    ];
  }
  if (file.name === "Data EDCD") {
    return [0, 1, 2, 3, 4].map((index) => ({
      start: index * 2,
      length: 2,
      endExclusive: index * 2 + 2,
      status: "decoded-writable",
      field: `Parameter ${index + 1}`,
      internal: `extracode[${index}]`
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
    evidence.push("docs/generated/extra-ap-reachability-source-map.json");
    evidence.push("docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md");
  } else if (name === "Data EDCD") {
    evidence.push("docs/generated/opcode-edcd-crosswalk.json");
    evidence.push("docs/format-evidence-cards/edcd-opcode-source-map.md");
  } else if (name === "Data OD" || name === "Data SD2") {
    evidence.push("docs/format-evidence-cards/strings-data-od-string-sound.md");
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
  return {
    status: "Extra Action Point bytes structurally decoded; reachability is source-audited.",
    recordBytes: data.storage?.recordBytes ?? 40,
    runtimeCallsites: data.loaddoor2CallsiteAudit?.totalRuntimeCallsites ?? null,
    evidence: "docs/generated/extra-ap-reachability-source-map.json"
  };
}

function edcdSummary() {
  const pathToFile = path.join(repoRoot, "docs/generated/opcode-edcd-crosswalk.json");
  const data = readJson(pathToFile);
  return {
    status: "Action parameter rows structurally decoded; opcode-specific labels come from the crosswalk.",
    edcdBackedOpcodes: data.summary?.edcdBacked ?? null,
    fieldComparisonGaps: data.summary?.fieldComparisonGaps?.length ?? null,
    evidence: "docs/generated/opcode-edcd-crosswalk.json"
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
    "preserved-known": 5,
    "custom-media-payload": 6,
    "preserved-standard-media-payload": 7,
    "understood-resource-container": 8,
    "decoded-resource-payload": 9,
    "decoded-writable": 10,
    "ignored-non-scenario": 11
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
