import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const roundtripLedgerPath = path.join(repoRoot, "docs/generated/scenario-byte-roundtrip-ledger.json");
const scenarioByteOwnershipPath = path.join(repoRoot, "docs/generated/scenario-byte-ownership.json");
const resourceByteOwnershipPath = path.join(repoRoot, "docs/generated/resource-byte-ownership.json");
const resourceCodecBacklogPath = path.join(repoRoot, "docs/generated/resource-payload-codec-backlog.json");

const targetCompatibilityPath = path.join(repoRoot, "docs/generated/scenario-target-compatibility.json");
const mediaBoundaryPath = path.join(repoRoot, "docs/generated/media-codec-boundary.json");
const packageMatrixPath = path.join(repoRoot, "docs/generated/package-contract-matrix.json");

const NON_SCENARIO_IGNORES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const RUNTIME_CACHE_FILES = new Set(["CL", "CD", "CE", "CE2", "CS", "CT", "CTD3", "Data H1", "Data MENU"]);
const CUSTOM_MEDIA_RE = /^Custom [1-9](?: Music)?$/;
const RESOURCE_SIDECAR_RE = /\.(rsrc|rsf)$/i;
const APPLEDOUBLE_RE = /^._/;

const MEDIA_POLICIES = {
  PICT: {
    boundaryStatus: "preserved-previewable-writable-subset",
    role: "Picture resource",
    preservation: "Preserve untouched payload bytes. Writable only through Providence's normalized scenario-picture/tile-atlas import path.",
    preview: "Previewable when the current resource preview decoder supports the PICT variant.",
    writer: "Known-good replacement writer for project-owned PICT media only; no arbitrary PICT opcode editor."
  },
  cicn: {
    boundaryStatus: "preserved-previewable-writable-subset",
    role: "Color icon resource",
    preservation: "Preserve untouched payload bytes. Writable only through 32x32 icon and Special Land Tile conversion.",
    preview: "Previewable when the current resource preview decoder supports the cicn variant.",
    writer: "Known-good replacement writer for project-owned cicn media only; no arbitrary classic icon editor."
  },
  "snd ": {
    boundaryStatus: "preserved-playable-writable-subset",
    role: "Sound resource",
    preservation: "Preserve untouched payload bytes. Writable only through normalized sound-effect import.",
    preview: "Playable when the current resource preview decoder supports the snd variant.",
    writer: "Known-good replacement writer for project-owned snd effects only; no full Sound Manager command editor."
  },
  TEXT: {
    boundaryStatus: "decoded-reference",
    role: "Text resource",
    preservation: "Decoded for reference preview and preserved unless deliberately replaced as a managed resource.",
    preview: "Readable classic text.",
    writer: "Normal scenario string authoring uses Data SD2, not broad TEXT resource editing."
  },
  "STR#": {
    boundaryStatus: "decoded-reference",
    role: "String list resource",
    preservation: "Decoded for reference preview and preserved unless deliberately replaced as a managed resource.",
    preview: "Readable classic string-list records.",
    writer: "Broad STR# authoring remains outside normal scenario editing."
  },
  styl: {
    boundaryStatus: "decoded-reference",
    role: "Text style companion resource",
    preservation: "Decoded as text style companion metadata and preserved.",
    preview: "Metadata/readable companion where supported.",
    writer: "Style-resource editing remains outside normal scenario editing."
  },
  vers: {
    boundaryStatus: "decoded-reference",
    role: "Version resource",
    preservation: "Decoded as metadata and preserved.",
    preview: "Metadata.",
    writer: "Version-resource authoring is not a normal scenario workflow."
  },
  wrct: {
    boundaryStatus: "decoded-reference",
    role: "Classic window rectangle metadata",
    preservation: "Decoded as four 16-bit rectangle coordinates and preserved.",
    preview: "Metadata.",
    writer: "Not a normal authoring target."
  },
  RLMZ: {
    boundaryStatus: "preserved-known",
    role: "Realmz metadata resource",
    preservation: "Preserved as Realmz metadata until field ownership is proven.",
    preview: "Metadata-only.",
    writer: "Not writable outside fixture-proven scenario shell/resource work."
  },
  "ICN#": classicIconPolicy("Large black-and-white icon"),
  icl8: classicIconPolicy("Large 8-bit color icon"),
  icl4: classicIconPolicy("Large 4-bit color icon"),
  "ics#": classicIconPolicy("Small black-and-white icon"),
  ics8: classicIconPolicy("Small 8-bit color icon"),
  ics4: classicIconPolicy("Small 4-bit color icon"),
  icns: classicIconPolicy("Icon suite resource"),
  colm: {
    boundaryStatus: "preserved-known",
    role: "Classic color companion metadata",
    preservation: "Preserved as compatibility metadata; no Realmz gameplay consumer is proven.",
    preview: "Metadata-only.",
    writer: "Not writable."
  },
  "\u0000\u0000\u0000\u0000": {
    boundaryStatus: "preserved-known",
    role: "Malformed compatibility baggage resource",
    preservation: "Preserved byte-for-byte as malformed/compatibility baggage.",
    preview: "No normal preview.",
    writer: "Not writable."
  }
};

const TARGETS = {
  "mac-classic-folder": {
    label: "Mac Classic Folder",
    description: "Extracted Classic Mac scenario folder with authored files and resource-fork sidecars or raw resource-fork files.",
    exportStatus: "supported-conservative",
    required: ["scenario shell/marker file", "authored data files", "Scenario resource fork when scenario resources are referenced"],
    optional: ["Data Spell resource fork", "custom music files", "Icon_ resource companion", "README/distribution files"],
    ignored: [...NON_SCENARIO_IGNORES],
    blockerPolicy: "Missing scenario resource forks or unsupported sidecar wrappers are target-compatibility warnings before export."
  },
  "windows-realmz-folder": {
    label: "Windows Realmz Folder",
    description: "Windows/SDL-style scenario folder as observed in the local Windows corpus.",
    exportStatus: "observed-preserve-first",
    required: ["scenario shell/marker file", "authored data files", "resource sidecars when the scenario ships custom media"],
    optional: ["custom music files", "compatibility/readme files"],
    ignored: [...NON_SCENARIO_IGNORES],
    blockerPolicy: "Windows-specific runtime packaging is preserved from observed fixtures; new packaging promises require a Windows runtime fixture."
  },
  "providence-portable-folder": {
    label: "Portable Providence Folder",
    description: "Current conservative export: authored files plus preserved source sidecars and managed media merges.",
    exportStatus: "current-default",
    required: ["raw source snapshot", "supported authored files"],
    optional: ["all classified pass-through/resource files"],
    ignored: [...NON_SCENARIO_IGNORES],
    blockerPolicy: "Preserve everything classified as scenario-owned or compatibility baggage; exclude ignored OS metadata."
  }
};

const roundtripLedger = readJson(roundtripLedgerPath);
const scenarioByteOwnership = readJson(scenarioByteOwnershipPath);
const resourceByteOwnership = readJson(resourceByteOwnershipPath);
const codecBacklog = readJson(resourceCodecBacklogPath);

const compatibility = buildTargetCompatibility(roundtripLedger, resourceByteOwnership);
const mediaBoundary = buildMediaBoundary(resourceByteOwnership, codecBacklog);
const packageMatrix = buildPackageMatrix(compatibility, mediaBoundary);

validateCompatibility(compatibility, mediaBoundary, packageMatrix);

writeJson(targetCompatibilityPath, compatibility);
writeJson(mediaBoundaryPath, mediaBoundary);
writeJson(packageMatrixPath, packageMatrix);

console.log(`Wrote ${path.relative(repoRoot, targetCompatibilityPath)}`);
console.log(`Wrote ${path.relative(repoRoot, mediaBoundaryPath)}`);
console.log(`Wrote ${path.relative(repoRoot, packageMatrixPath)}`);
console.log(JSON.stringify(compatibility.summary, null, 2));

function buildTargetCompatibility(ledger, resourceCoverage) {
  const resourceForksByScenario = new Map();
  for (const fork of resourceCoverage.forks ?? []) {
    const key = scenarioKey(fork.sourceRoot, fork.scenario);
    const list = resourceForksByScenario.get(key) ?? [];
    list.push({
      fileName: fork.fileName,
      parseStatus: fork.parseStatus,
      wrapperKind: fork.wrapperKind,
      resourceCount: fork.resourceCount,
      fileBytes: fork.fileBytes,
      resourceTypes: [...new Set((fork.resources ?? []).map((resource) => resource.type))].sort()
    });
    resourceForksByScenario.set(key, list);
  }

  const scenarios = (ledger.scenarios ?? []).map((scenario) => {
    const target = inferScenarioTarget(scenario);
    const files = (scenario.files ?? [])
      .filter((file) => !NON_SCENARIO_IGNORES.has(file.name))
      .map((file) => classifyScenarioFile(file));
    const packageShape = summarizePackageShape(scenario, files, resourceForksByScenario.get(scenarioKey(scenario.sourceRoot, scenario.name)) ?? []);
    return {
      name: scenario.name,
      sourceRoot: scenario.sourceRoot,
      sourcePath: normalizePath(scenario.sourcePath),
      inferredTarget: target,
      roundtripStatus: scenario.status,
      packageShape,
      files,
      targetCompatibilityIssues: targetIssuesForScenario(target, packageShape, files)
    };
  });

  const byTarget = {};
  for (const target of Object.keys(TARGETS)) {
    const matching = scenarios.filter((scenario) => scenario.inferredTarget === target);
    byTarget[target] = {
      label: TARGETS[target].label,
      scenarios: matching.length,
      resourceForkFiles: matching.reduce((sum, scenario) => sum + scenario.packageShape.resourceForkFiles, 0),
      appleDoubleSidecars: matching.reduce((sum, scenario) => sum + scenario.packageShape.appleDoubleSidecars, 0),
      customMediaFiles: matching.reduce((sum, scenario) => sum + scenario.packageShape.customMediaFiles, 0),
      unsupportedPackagingIssues: matching.reduce((sum, scenario) => sum + scenario.targetCompatibilityIssues.filter((issue) => issue.severity !== "info").length, 0)
    };
  }

  const totalIssues = scenarios.flatMap((scenario) => scenario.targetCompatibilityIssues);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      roundtripLedger: "docs/generated/scenario-byte-roundtrip-ledger.json",
      scenarioByteOwnership: "docs/generated/scenario-byte-ownership.json",
      resourceCoverage: "docs/generated/resource-byte-ownership.json",
      importer: "src-tauri/src/importer.rs",
      exporter: "src-tauri/src/exporter.rs",
      externalFormats: [
        "RFC 1740 AppleSingle/AppleDouble",
        "Inside Macintosh Resource Manager",
        "Inside Macintosh Imaging With QuickDraw / PICT",
        "Inside Macintosh QuickDraw Color Icon resources",
        "Inside Macintosh Sound Manager / snd resources"
      ]
    },
    policy: {
      nonScenarioIgnores: [...NON_SCENARIO_IGNORES].sort(),
      runtimeCaches:
        "Runtime caches are not normal authoring/export sources unless a target runtime fixture proves they are required.",
      mediaBoundary:
        "Scenario completeness requires resource container ownership, reference semantics, preservation, preview/play where supported, and known-good replacement writers; it does not require full media codec opcode editing."
    },
    targets: TARGETS,
    summary: {
      scenarioRoots: scenarios.length,
      targets: byTarget,
      targetCompatibilityIssues: totalIssues.length,
      warnings: totalIssues.filter((issue) => issue.severity === "warning").length,
      errors: totalIssues.filter((issue) => issue.severity === "error").length,
      completeness: completenessSummary(scenarioByteOwnership, resourceCoverage)
    },
    scenarios
  };
}

function buildMediaBoundary(resourceCoverage, backlog) {
  const types = resourceCoverage.summary?.resourcePayloadBytesByType ?? {};
  const resourceTypes = Object.entries(types)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, summary]) => {
      const policy = MEDIA_POLICIES[type] ?? {
        boundaryStatus: "preserved-unknown-media",
        role: "Unknown resource payload",
        preservation: "Preserve byte-for-byte until a resource-specific policy exists.",
        preview: "No guaranteed preview.",
        writer: "Not writable."
      };
      return {
        type,
        role: policy.role,
        entries: summary.entries,
        bytes: summary.bytes,
        resourceCoverageStatus: summary.status,
        mediaPayloadStatus: policy.boundaryStatus,
        preserved: true,
        previewOrPlayback: policy.preview,
        writablePolicy: policy.writer,
        preservationPolicy: policy.preservation
      };
    });
  const customMediaBytes = scenarioByteOwnership.summary?.statusObservedBytes?.["custom-media-payload"] ?? 0;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      resourceCoverage: "docs/generated/resource-byte-ownership.json",
      codecBacklog: "docs/generated/resource-payload-codec-backlog.json",
      scenarioByteOwnership: "docs/generated/scenario-byte-ownership.json"
    },
    policy: {
      stageOne:
        "Resource payloads are owned at the scenario boundary: identified, preserved, referenced, previewed/played where supported, and replaced only through known-good encoders.",
      stageTwo:
        "Full PICT opcode, arbitrary cicn/icon-suite, snd command-variant, and custom music codec internals remain optional media-codec work."
    },
    summary: {
      resourceTypes: resourceTypes.length,
      resourceEntries: resourceCoverage.summary?.resourceEntries ?? 0,
      preservedStandardMediaPayloadBytes: resourceCoverage.summary?.statusObservedBytes?.["preserved-standard-media-payload"] ?? 0,
      decodedResourcePayloadBytes: resourceCoverage.summary?.statusObservedBytes?.["decoded-resource-payload"] ?? 0,
      customMediaPayloadBytes: customMediaBytes,
      needsCodecWork: backlog.summary?.needsCodecWork ?? 0,
      scenarioCompletenessRequiresCodecInternals: false
    },
    resourceTypes,
    customMedia: {
      filePattern: "Custom 1-9 Music and legacy Custom 1-9 pass-through media",
      mediaPayloadStatus: "custom-media-preserved",
      bytes: customMediaBytes,
      preservationPolicy:
        "Custom music/module payloads are scenario-owned media and preserved byte-for-byte until a dedicated music codec writer exists.",
      writablePolicy: "Not writable in this stage."
    }
  };
}

function buildPackageMatrix(compatibility, mediaBoundary) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      targetCompatibility: "docs/generated/scenario-target-compatibility.json",
      mediaBoundary: "docs/generated/media-codec-boundary.json"
    },
    targets: Object.entries(TARGETS).map(([target, config]) => ({
      target,
      label: config.label,
      exportStatus: config.exportStatus,
      requiredComponents: config.required,
      optionalComponents: config.optional,
      ignoredComponents: config.ignored,
      supportedResourcePayloads: mediaBoundary.resourceTypes
        .filter((resource) => ["PICT", "cicn", "snd ", "TEXT", "STR#", "styl", "vers", "wrct"].includes(resource.type))
        .map((resource) => ({
          type: resource.type,
          mediaPayloadStatus: resource.mediaPayloadStatus,
          writablePolicy: resource.writablePolicy
        })),
      validationPolicy: config.blockerPolicy
    })),
    componentRoles: [
      { role: "authored-scenario-data", policy: "Decoded/write-owned or preserved by record/file family." },
      { role: "resource-container", policy: "Resource fork container bytes, type/reference/name metadata, and payload boundaries are parsed and preserved." },
      { role: "standard-media-payload", policy: "Preserved and previewable/playable where supported; writable only through known-good import conversion." },
      { role: "custom-media-payload", policy: "Scenario-owned module/media bytes preserved until a codec writer exists." },
      { role: "runtime-cache", policy: "Inspect-only; not exported as authored data unless target evidence requires it." },
      { role: "ignored-non-scenario", policy: "OS metadata such as .DS_Store is ignored." }
    ],
    completenessSummary: compatibility.summary.completeness
  };
}

function classifyScenarioFile(file) {
  const name = file.name;
  const role = packagingRoleForName(name, file.role);
  return {
    name,
    sourceBytes: file.sourceBytes,
    roundtripClassification: file.classification,
    importerRole: file.role,
    packagingRole: role,
    targetDisposition: targetDispositionForRole(role),
    ignored: NON_SCENARIO_IGNORES.has(name)
  };
}

function packagingRoleForName(name, importerRole) {
  if (NON_SCENARIO_IGNORES.has(name)) return "ignored-non-scenario";
  if (RUNTIME_CACHE_FILES.has(name)) return "runtime-cache";
  if (CUSTOM_MEDIA_RE.test(name)) return "custom-media-payload";
  if (APPLEDOUBLE_RE.test(name)) return "resource-container";
  if (RESOURCE_SIDECAR_RE.test(name)) return "resource-container";
  if (name === "Scenario" || importerRole === "resource-fork") return "resource-container";
  if (name === "Icon_" || name === "Format") return "compatibility-baggage";
  if (importerRole === "supported-binary") return "authored-scenario-data";
  if (importerRole === "pass-through") return "preserved-known";
  return "unknown-active-risk";
}

function targetDispositionForRole(role) {
  switch (role) {
    case "authored-scenario-data":
      return "write-owned-or-preserved";
    case "resource-container":
      return "preserve-container-and-merge-managed-media";
    case "custom-media-payload":
      return "preserve-byte-for-byte";
    case "runtime-cache":
      return "inspect-only";
    case "ignored-non-scenario":
      return "ignore";
    case "compatibility-baggage":
      return "preserve-if-present";
    case "preserved-known":
      return "preserve-byte-for-byte";
    default:
      return "needs-format-work";
  }
}

function summarizePackageShape(scenario, files, resourceForks) {
  return {
    fileCount: scenario.sourceFiles ?? files.length,
    authoredDataFiles: files.filter((file) => file.packagingRole === "authored-scenario-data").length,
    resourceForkFiles: files.filter((file) => file.packagingRole === "resource-container").length,
    parsedResourceForkFiles: resourceForks.filter((fork) => fork.parseStatus === "parsed").length,
    appleDoubleSidecars: resourceForks.filter((fork) => fork.wrapperKind === "appledouble").length + files.filter((file) => APPLEDOUBLE_RE.test(file.name)).length,
    rawResourceForks: resourceForks.filter((fork) => fork.wrapperKind === "raw-resource-fork").length,
    appleSingleFiles: resourceForks.filter((fork) => fork.wrapperKind === "applesingle").length,
    customMediaFiles: files.filter((file) => file.packagingRole === "custom-media-payload").length,
    runtimeCaches: files.filter((file) => file.packagingRole === "runtime-cache").length,
    compatibilityBaggage: files.filter((file) => file.packagingRole === "compatibility-baggage").length,
    unknownFiles: files.filter((file) => file.packagingRole === "unknown-active-risk").length,
    resourceForks
  };
}

function targetIssuesForScenario(target, shape, files) {
  const issues = [];
  if (shape.unknownFiles > 0) {
    issues.push({
      severity: "warning",
      target,
      code: "unknown-package-file",
      message: `${shape.unknownFiles} file(s) are not yet assigned a target packaging role.`
    });
  }
  if (shape.resourceForkFiles > 0 && shape.parsedResourceForkFiles === 0) {
    issues.push({
      severity: "error",
      target,
      code: "unparsed-resource-fork",
      message: "Resource sidecars are present, but no resource fork parsed successfully."
    });
  }
  if (shape.runtimeCaches > 0) {
    issues.push({
      severity: "info",
      target,
      code: "runtime-cache-present",
      message: `${shape.runtimeCaches} runtime/cache file(s) are preserved for evidence but are not normal authoring sources.`
    });
  }
  if (target === "windows-realmz-folder" && shape.appleDoubleSidecars > 0) {
    issues.push({
      severity: "warning",
      target,
      code: "mac-sidecar-in-windows-shape",
      message: "AppleDouble/resource sidecars appear in a Windows-observed scenario; keep them preserved until a Windows runtime fixture proves they are unnecessary."
    });
  }
  if (target === "mac-classic-folder" && shape.resourceForkFiles === 0 && files.some((file) => file.name === "Scenario")) {
    issues.push({
      severity: "info",
      target,
      code: "raw-scenario-resource-file",
      message: "Scenario file is treated as the Classic resource fork/metadata file rather than a .rsrc sidecar."
    });
  }
  return issues;
}

function inferScenarioTarget(scenario) {
  const root = String(scenario.sourceRoot ?? "").replace(/\\/g, "/").toLowerCase();
  if (root.includes("out_win") || root.includes("windows")) return "windows-realmz-folder";
  if (root.includes("divinity cd") || root.includes("realmz 8.0.7 beta") || root.includes("/base/realmz/scenarios")) {
    return "mac-classic-folder";
  }
  return "providence-portable-folder";
}

function completenessSummary(scenarioOwnership, resourceCoverage) {
  const statusBytes = scenarioOwnership.summary?.statusObservedBytes ?? {};
  const totalScenarioBytes = sum(Object.values(statusBytes));
  const needsFormatWorkBytes =
    (statusBytes["unknown-active-risk"] ?? 0) +
    (statusBytes["needs-codec-work"] ?? 0) +
    (statusBytes["preserved-unknown"] ?? 0);
  const semanticOwnedBytes = totalScenarioBytes - needsFormatWorkBytes;
  const resourceSummary = resourceCoverage.summary ?? {};
  const resourcePayloadBytes = resourceSummary.statusObservedBytes ?? {};
  const mediaCodecBytes =
    (resourcePayloadBytes["preserved-standard-media-payload"] ?? 0) +
    (statusBytes["custom-media-payload"] ?? 0);
  return {
    scenarioSemanticOwnership: {
      status: needsFormatWorkBytes === 0 ? "complete-at-scenario-boundary" : "has-active-risk",
      observedBytes: semanticOwnedBytes,
      totalObservedBytes: totalScenarioBytes,
      activeRiskBytes: needsFormatWorkBytes,
      note: "Preserved standard media payloads count as scenario-owned media boundaries, not missing scenario semantics."
    },
    resourceContainerOwnership: {
      status: resourceSummary.unparsedResourceForks === 0 ? "complete-for-observed-resource-forks" : "has-unparsed-resource-forks",
      parsedResourceForks: resourceSummary.parsedResourceForks ?? 0,
      resourceForkFiles: resourceSummary.resourceForkFiles ?? 0,
      resourceEntries: resourceSummary.resourceEntries ?? 0
    },
    mediaCodecInternals: {
      status: "stage-two-optional",
      preservedOrCustomPayloadBytes: mediaCodecBytes,
      decodedResourcePayloadBytes: resourcePayloadBytes["decoded-resource-payload"] ?? 0,
      note: "Full PICT/cicn/snd/custom-music internals are not required for scenario semantic completion."
    }
  };
}

function validateCompatibility(compatibility, mediaBoundary, matrix) {
  if (!compatibility.scenarios.length) throw new Error("No scenarios were scanned for target compatibility");
  if (compatibility.scenarios.some((scenario) => !scenario.inferredTarget)) {
    throw new Error("Every scenario needs an inferred target");
  }
  const unclassified = compatibility.scenarios.flatMap((scenario) =>
    scenario.files.filter((file) => !file.packagingRole).map((file) => `${scenario.name}/${file.name}`)
  );
  if (unclassified.length) throw new Error(`Unclassified packaging files: ${unclassified.slice(0, 10).join(", ")}`);
  const dsStore = compatibility.scenarios.flatMap((scenario) => scenario.files.filter((file) => file.name === ".DS_Store"));
  if (dsStore.length) throw new Error(".DS_Store leaked into target compatibility file list");
  const resourceTypes = new Set(mediaBoundary.resourceTypes.map((resource) => resource.type));
  for (const fork of resourceByteOwnership.forks ?? []) {
    for (const resource of fork.resources ?? []) {
      if (!resourceTypes.has(resource.type)) throw new Error(`Missing media boundary policy for ${resource.type}`);
    }
  }
  if (!matrix.targets.length) throw new Error("Package contract matrix has no targets");
}

function classicIconPolicy(role) {
  return {
    boundaryStatus: "preserved-known",
    role,
    preservation: "Preserved as classic Mac file/icon compatibility media.",
    preview: "Advanced metadata/preview only.",
    writer: "Not writable as normal scenario media."
  };
}

function scenarioKey(sourceRoot, name) {
  return `${sourceRoot ?? ""}\u0000${name ?? ""}`;
}

function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
