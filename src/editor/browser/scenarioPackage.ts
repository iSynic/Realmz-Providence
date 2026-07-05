import { BATTLE_RECORD_BYTES, MESSAGE_RECORD_BYTES, MONSTER_RECORD_BYTES, OPTION_LABEL_RECORD_BYTES, writeBattles, writeMessages, writeMonsters, writeOptionLabels } from "./binaryWriters";
import { BrowserRawSourceFile, BrowserRawSourceSnapshot } from "./fsAccess";
import { encodeStringListResource, mergeResourceEntries, parseResourceFork, type ResourceForkUpdate } from "./resourceFork";
import { createStoredZip } from "./zip";
import type { ExportReport, ManagedAsset, MapRecord, Project, ScenarioIconResource, ScenarioItemRecord, ScenarioTarget } from "../types";

type ZipEntry = {
  path: string;
  bytes: Uint8Array;
  modifiedAt?: Date;
};

type ResourceExportResult = {
  resourceFileWritten: boolean;
  resourceFileName: string;
  resourceFilePath: string;
  writtenResources: string[];
  preservedResources: number;
  resourceWarnings: string[];
  blockedAssets: string[];
};

type BinaryWriteResult = {
  path: string;
  bytes: Uint8Array;
};

export type BrowserScenarioPackageResult = {
  fileName: string;
  zip: Uint8Array;
  report: ExportReport;
};

const SUPPORTED_MANAGED_RESOURCE_TYPES = new Set(["PICT", "cicn", "snd ", "TEXT", "styl"]);

export function browserScenarioPackageFileName(project: Project, target: ScenarioTarget) {
  const suffix = target === "windows-realmz-folder" ? "windows-realmz-scenario" : "mac-classic-scenario";
  return `${safePackageName(project.scenario.name || "Untitled Scenario")}.${suffix}.zip`;
}

export function createBrowserScenarioPackageZip(
  project: Project,
  rawSources: BrowserRawSourceSnapshot | null | undefined,
  target: ScenarioTarget
): BrowserScenarioPackageResult {
  if (target === "providence-portable-folder") {
    throw new Error("Browser scenario ZIP export expects a Mac Classic or Windows Realmz target.");
  }
  if (!rawSources || rawSources.files.length === 0) {
    throw new Error("Missing browser raw source snapshot. Reimport the scenario in this browser, or open a Providence project ZIP that includes raw-sources.");
  }
  const missingRawSources = missingProjectSourceSnapshotFiles(project, rawSources);
  if (missingRawSources.length > 0) {
    throw new Error([
      "Browser scenario ZIP export is missing captured raw source bytes required by the project source inventory.",
      ...missingRawSources.slice(0, 10).map((source) => `- ${source.relativePath || source.name}`),
      missingRawSources.length > 10 ? `- ${missingRawSources.length - 10} more missing source file(s)` : "",
      "Reimport the scenario in this browser, or open a Providence project ZIP that includes raw-sources."
    ].filter(Boolean).join("\n"));
  }

  const unsupportedAuthoredState = unsupportedAuthoredBinaryState(project);
  if (unsupportedAuthoredState.length > 0) {
    throw new Error([
      "Browser scenario ZIP export is available for unchanged imported source snapshots and resource-only mutations.",
      "This project has authored binary record changes that still need the browser writer port:",
      ...unsupportedAuthoredState.slice(0, 10).map((label) => `- ${label}`),
      unsupportedAuthoredState.length > 10 ? `- ${unsupportedAuthoredState.length - 10} more authored change group(s)` : ""
    ].filter(Boolean).join("\n"));
  }

  const generatedAt = new Date();
  const rootName = safePackageName(project.scenario.name || rawSources.rootName || "Untitled Scenario");
  const outputFiles = new Map<string, Uint8Array>();
  const passThroughFiles: string[] = [];

  for (const source of rawSources.files) {
    if (isCustomNamesSupportFile(source.name) || isGeneratedRuntimeCacheFile(source.name)) {
      continue;
    }
    const outputPath = outputPathForRawSource(source);
    outputFiles.set(outputPath, source.bytesData);
    passThroughFiles.push(outputPath);
  }

  const binaryWrites = writeSupportedBinaryRecords(project, rawSources.files);
  for (const write of binaryWrites) {
    outputFiles.set(write.path, write.bytes);
  }

  const resourceResult = writeManagedResources(project, rawSources.files, target);
  if (resourceResult.resourceFileWritten) {
    outputFiles.set(resourceResult.resourceFilePath, resourceResult.resourceBytes);
  }

  const writtenFiles = [
    ...binaryWrites.map((write) => write.path),
    ...(resourceResult.resourceFileWritten ? [resourceResult.resourceFilePath] : [])
  ];
  const written = new Set(writtenFiles);
  const filteredPassThrough = passThroughFiles.filter((path) => !written.has(path));
  const entries: ZipEntry[] = [...outputFiles.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, bytes]) => ({
      path: `${rootName}/${path}`,
      bytes,
      modifiedAt: generatedAt
    }));
  const fileName = browserScenarioPackageFileName(project, target);
  const targetCompatibilityIssues = (project.validation.targetCompatibilityIssues ?? []).filter((issue) => (
    issue.target === target || issue.target === "providence-portable-folder"
  ));
  return {
    fileName,
    zip: createStoredZip(entries),
    report: {
      outputPath: `browser-download://${fileName}`,
      target,
      writtenFiles,
      passThroughFiles: filteredPassThrough,
      writtenResources: resourceResult.writtenResources,
      preservedResources: resourceResult.preservedResources,
      resourceWarnings: resourceResult.resourceWarnings,
      blockedAssets: resourceResult.blockedAssets,
      warnings: project.validation.ok ? [] : project.validation.warnings,
      targetCompatibilityIssues,
      targetCompatibility: bucketTargetCompatibility(targetCompatibilityIssues)
    }
  };
}

function writeManagedResources(
  project: Project,
  rawFiles: BrowserRawSourceFile[],
  target: ScenarioTarget
): ResourceExportResult & { resourceBytes: Uint8Array } {
  const selected = sourceResourceFile(project, rawFiles, target);
  const resourceFileName = resourceFileNameForProject(project, rawFiles, target);
  const resourceFilePath = target === "windows-realmz-folder" && resourceFileName === "Scenario"
    ? "Scenario.rsrc"
    : resourceFileName;
  const original = selected?.bytesData ?? new Uint8Array();
  const result: ResourceExportResult = {
    resourceFileWritten: false,
    resourceFileName,
    resourceFilePath,
    writtenResources: [],
    preservedResources: parseResourceFork(original).length,
    resourceWarnings: [],
    blockedAssets: []
  };
  if (!selected && hasResourceUpdates(project)) {
    result.resourceWarnings.push(`No source resource fork named ${resourceFileName} was found; creating one for export resources.`);
  }

  const updates: ResourceForkUpdate[] = [
    ...mapNameResourceUpdates(project, original),
    ...monsterIconOverrideUpdates(project, original, result),
    ...scenarioIconResourceUpdates(project.scenarioItems, project.scenarioIconResources, result),
    ...managedAssetResourceUpdates(project.assets ?? [], result)
  ];
  if (updates.length === 0) {
    return { ...result, resourceBytes: original };
  }
  const merged = mergeResourceEntries(original, updates);
  if (merged.replaced > 0) {
    result.resourceWarnings.push(`${merged.replaced} existing resource(s) were replaced by browser resource updates.`);
  }
  result.resourceFileWritten = true;
  return { ...result, resourceBytes: merged.bytes };
}

function hasResourceUpdates(project: Project) {
  return (
    (project.assets ?? []).length > 0 ||
    (project.monsterIconOverrides ?? []).length > 0 ||
    (project.scenarioIconResources ?? []).length > 0 ||
    (project.mapRecords ?? []).length > 0
  );
}

function writeSupportedBinaryRecords(project: Project, rawFiles: BrowserRawSourceFile[]) {
  const writes: BinaryWriteResult[] = [];
  if (project.messages.length > 0) {
    writes.push({
      path: "Data SD2",
      bytes: preserveMalformedRawTail("Data SD2", writeMessages(project.messages), MESSAGE_RECORD_BYTES, rawFiles)
    });
  }
  if (project.optionLabels.length > 0) {
    writes.push({
      path: "Data OD",
      bytes: preserveMalformedRawTail("Data OD", writeOptionLabels(project.optionLabels), OPTION_LABEL_RECORD_BYTES, rawFiles)
    });
  }
  if (project.battles.length > 0) {
    writes.push({
      path: "Data BD",
      bytes: preserveMalformedRawTail("Data BD", writeBattles(project.battles), BATTLE_RECORD_BYTES, rawFiles)
    });
  }
  if (project.monsters.length > 0) {
    writes.push({
      path: "Data MD",
      bytes: preserveMalformedRawTail("Data MD", writeMonsters(project.monsters), MONSTER_RECORD_BYTES, rawFiles)
    });
  }
  for (const monsterSet of project.monsterSets) {
    if (monsterSet.monsters.length === 0) continue;
    writes.push({
      path: monsterSet.sourceFile,
      bytes: preserveMalformedRawTail(monsterSet.sourceFile, writeMonsters(monsterSet.monsters), MONSTER_RECORD_BYTES, rawFiles)
    });
  }
  return writes.filter((write) => write.bytes.byteLength > 0);
}

function managedAssetResourceUpdates(assets: ManagedAsset[], result: ResourceExportResult) {
  const updates: ResourceForkUpdate[] = [];
  let scrollingTextWarningEmitted = false;
  for (const asset of assets) {
    if (asset.exportState !== "ready") {
      result.blockedAssets.push(asset.label);
      continue;
    }
    if (!SUPPORTED_MANAGED_RESOURCE_TYPES.has(asset.resourceType)) {
      result.blockedAssets.push(`${asset.label} uses unsupported resource type ${asset.resourceType}`);
      continue;
    }
    const data = managedAssetResourceBytes(asset);
    if (!data) {
      result.blockedAssets.push(`${asset.label} is missing browser-embedded converted resource bytes.`);
      continue;
    }
    if (!scrollingTextWarningEmitted && asset.kind === "text" && (asset.resourceType === "TEXT" || asset.resourceType.trim() === "styl")) {
      result.resourceWarnings.push("Scrolling Text TEXT/styl export is runtime-suspect: recent Windows Realmz testing ignored styl formatting, and Mac Realmz 7.1.2 crashed after a Providence-authored Scrolling Text action step.");
      scrollingTextWarningEmitted = true;
    }
    updates.push({
      resourceType: asset.resourceType,
      id: asset.resourceId,
      name: asset.label,
      attributes: 0,
      data
    });
    result.writtenResources.push(`${asset.resourceType} ${asset.resourceId}: ${asset.label}`);
  }
  return updates;
}

function monsterIconOverrideUpdates(project: Project, original: Uint8Array, result: ResourceExportResult) {
  const updates: ResourceForkUpdate[] = [];
  const originalEntries = parseResourceFork(original);
  for (const override of project.monsterIconOverrides ?? []) {
    const target = override.targetBaseIconId;
    if (target <= 0 || target > 32767 - 308) {
      result.resourceWarnings.push(`Monster icon override target ${target} is outside the exportable cicn ID range.`);
      continue;
    }
    const baseData = base64Bytes(override.sourceBaseResourceBase64);
    const pairedData = base64Bytes(override.sourcePairedResourceBase64);
    if (!baseData || !pairedData) {
      result.resourceWarnings.push(`Monster icon override ${override.sourceBaseIconId} -> ${target} has invalid cicn data.`);
      continue;
    }
    const label = override.sourceLabel || `Monster Mash ${override.sourceBaseIconId}`;
    const preserveExistingMetadata = override.sourceKind === "scenario-resource";
    const existingBase = preserveExistingMetadata ? originalEntries.find((entry) => entry.resourceType === "cicn" && entry.id === target) : null;
    const existingPaired = preserveExistingMetadata ? originalEntries.find((entry) => entry.resourceType === "cicn" && entry.id === target + 308) : null;
    updates.push({
      resourceType: "cicn",
      id: target,
      name: existingBase?.name ?? (preserveExistingMetadata ? "" : `Monster icon override from ${label}`),
      attributes: existingBase?.attributes ?? 0,
      data: baseData
    });
    updates.push({
      resourceType: "cicn",
      id: target + 308,
      name: existingPaired?.name ?? (preserveExistingMetadata ? "" : `Monster icon override from ${label} facing`),
      attributes: existingPaired?.attributes ?? 0,
      data: pairedData
    });
    result.writtenResources.push(`cicn ${target} and ${target + 308}: monster icon override from ${label}`);
  }
  if ((project.monsterIconOverrides ?? []).length > 120) {
    result.resourceWarnings.push(`${project.monsterIconOverrides.length} monster icon override(s) are authored; classic Realmz scenarios were documented around 127 monster icon sets.`);
  }
  return updates;
}

function scenarioIconResourceUpdates(
  scenarioItems: ScenarioItemRecord[],
  scenarioIconResources: ScenarioIconResource[],
  result: ResourceExportResult
) {
  const referencedItemIcons = new Set(scenarioItems.filter((item) => item.iconId !== 0).map((item) => Math.abs(item.iconId)));
  const updates: ResourceForkUpdate[] = [];
  if (referencedItemIcons.size === 0) return updates;
  for (const resource of scenarioIconResources ?? []) {
    const resourceId = Math.abs(resource.resourceId);
    if (!referencedItemIcons.has(resourceId)) continue;
    if (resourceId <= 0 || resourceId > 32767) {
      result.resourceWarnings.push(`Scenario icon resource ${resource.resourceId} is outside the exportable cicn ID range.`);
      continue;
    }
    const data = base64Bytes(resource.resourceBase64);
    if (!data) {
      result.resourceWarnings.push(`Scenario icon resource ${resource.resourceId} has invalid cicn data.`);
      continue;
    }
    updates.push({
      resourceType: "cicn",
      id: resourceId,
      name: resource.label,
      attributes: 0,
      data
    });
    result.writtenResources.push(`cicn ${resourceId}: custom item icon ${resource.label}`);
  }
  return updates;
}

function mapNameResourceUpdates(project: Project, originalResourceFork: Uint8Array) {
  if ((project.mapRecords ?? []).length === 0) return [];
  const existing = parseResourceFork(originalResourceFork);
  if (
    existing.some((entry) => entry.resourceType === "STR#" && entry.id === -102) &&
    existing.some((entry) => entry.resourceType === "STR#" && entry.id === -101)
  ) {
    return [];
  }
  return [
    {
      resourceType: "STR#",
      id: -102,
      name: "Map Names",
      attributes: 0,
      data: encodeStringListResource(project.mapRecords.map((record) => mapRecordPrimaryName(project, record)))
    },
    {
      resourceType: "STR#",
      id: -101,
      name: "Map Names",
      attributes: 0,
      data: encodeStringListResource(project.mapRecords.map((record) => record.secondaryName?.trim() || "--------------------"))
    }
  ];
}

function mapRecordPrimaryName(project: Project, record: MapRecord) {
  for (const candidate of [record.name, record.primaryName, mapNameForRecordTarget(project, record)]) {
    const name = candidate?.trim();
    if (name) return name;
  }
  return `Map ${record.id + 1}`;
}

function mapNameForRecordTarget(project: Project, record: MapRecord) {
  const levelType = record.isDungeon ? "dungeon" : "land";
  const map = project.maps.find((candidate) => candidate.levelType === levelType && candidate.index === record.level);
  const defaultName = `${levelType === "dungeon" ? "Dungeon" : "Land"} level ${record.level}`;
  return map && map.name !== defaultName ? map.name : null;
}

function sourceResourceFile(project: Project, rawFiles: BrowserRawSourceFile[], target: ScenarioTarget) {
  const resourceFileName = resourceFileNameForProject(project, rawFiles, target);
  const exact = rawFiles.find((file) => (
    file.role === "resource-fork" &&
    !isWindowsRawScenarioResourceFork(file, target) &&
    parseResourceFork(file.bytesData).length > 0 &&
    (file.name.toLowerCase() === resourceFileName.toLowerCase() || outputPathForRawSource(file).toLowerCase() === resourceFileName.toLowerCase())
  ));
  if (exact) return exact;
  return rawFiles.find((file) => (
    file.role === "resource-fork" &&
    !isWindowsRawScenarioResourceFork(file, target) &&
    parseResourceFork(file.bytesData).length > 0
  )) ?? null;
}

function resourceFileNameForProject(project: Project, rawFiles: BrowserRawSourceFile[], target: ScenarioTarget) {
  const shellName = scenarioShellFileName(project);
  const preferred = uniqueStrings(["Scenario.rsrc", "Scenario.rsf", `${shellName}.rsrc`, `${shellName}.rsf`, "Scenario"]);
  for (const candidate of preferred) {
    const file = rawFiles.find((source) => source.role === "resource-fork" && source.name.toLowerCase() === candidate.toLowerCase());
    if (!file) continue;
    if (isWindowsRawScenarioResourceFork(file, target)) {
      return "Scenario.rsrc";
    }
    return file.name;
  }
  const resourceFile = rawFiles.find((source) => source.role === "resource-fork");
  if (resourceFile) {
    if (isWindowsRawScenarioResourceFork(resourceFile, target)) return "Scenario.rsrc";
    return resourceFile.name;
  }
  return target === "windows-realmz-folder" ? "Scenario.rsrc" : "Scenario";
}

function scenarioShellFileName(project: Project) {
  return project.scenario.shell?.sourceFile?.trim() || project.scenario.name;
}

function outputPathForRawSource(source: BrowserRawSourceFile) {
  return normalizePackagePath(source.relativePath || source.name);
}

function isWindowsRawScenarioResourceFork(source: BrowserRawSourceFile, target: ScenarioTarget) {
  return target === "windows-realmz-folder" && source.name === "Scenario";
}

function preserveMalformedRawTail(fileName: string, bytes: Uint8Array, recordBytes: number, rawFiles: BrowserRawSourceFile[]) {
  const raw = rawSourceBytes(fileName, rawFiles);
  if (!raw || raw.byteLength <= bytes.byteLength || raw.byteLength % recordBytes === 0) {
    return bytes;
  }
  const output = new Uint8Array(raw.byteLength);
  output.set(bytes);
  output.set(raw.slice(bytes.byteLength), bytes.byteLength);
  return output;
}

function rawSourceBytes(fileName: string, rawFiles: BrowserRawSourceFile[]) {
  const normalizedName = normalizePackagePath(fileName).toLowerCase();
  return rawFiles.find((source) => (
    normalizePackagePath(source.name).toLowerCase() === normalizedName ||
    normalizePackagePath(source.relativePath || "").toLowerCase() === normalizedName
  ))?.bytesData ?? null;
}

function missingProjectSourceSnapshotFiles(project: Project, rawSources: BrowserRawSourceSnapshot) {
  const captured = new Set<string>();
  for (const source of rawSources.files) {
    for (const path of [source.relativePath, source.originalRelativePath, source.name]) {
      const key = normalizePackagePath(path || "");
      if (key) captured.add(key.toLowerCase());
    }
  }
  return project.source.files.filter((source) => {
    if (isGeneratedRuntimeCacheFile(source.name)) return false;
    for (const path of [source.relativePath, source.name]) {
      const key = normalizePackagePath(path || "");
      if (key && captured.has(key.toLowerCase())) return false;
    }
    return true;
  });
}

function unsupportedAuthoredBinaryState(project: Project) {
  const labels: string[] = [];
  if (project.scenario.shell?.authored) labels.push(`Scenario shell ${project.scenario.shell.sourceFile}`);
  if (project.scenario.supportFile?.authored) labels.push(`Scenario support file ${project.scenario.supportFile.sourceFile}`);
  if (project.scenario.contactInfo?.authored) labels.push("Data CI contact info");
  if (project.scenario.restrictions?.authored) labels.push("Data RI restrictions");
  if (project.scenario.globalMacroHooks?.authored) labels.push("Global macro hooks");
  if (project.scenario.securityBackup?.authored) labels.push("Data CS security backup");
  if (project.landLayout?.authored) labels.push("Layout");
  if ((project.customLandlooks ?? []).some((record) => record.authored)) labels.push("Custom landlook metadata");
  if (project.maps.some((record) => record.provenance?.confidence === "inferred")) labels.push("Map field data");
  if (project.triggers.some((record) => record.provenance?.confidence === "inferred")) labels.push("Action point / macro records");
  if (project.randomLevels.some((record) => record.provenance?.confidence === "inferred")) labels.push("Random encounter levels");
  if (project.extracodes.some((record) => record.provenance?.confidence === "inferred")) labels.push("EDCD parameter rows");
  for (const [label, records] of [
    ["Map records", project.mapRecords],
    ["Monster descriptions", project.monsterDescriptions],
    ["Scenario items", project.scenarioItems],
    ["Treasures", project.treasures],
    ["Shops", project.shops],
    ["Simple encounters", project.simpleEncounters],
    ["Complex encounters", project.complexEncounters],
    ["Thief encounters", project.thiefEncounters],
    ["Timed encounters", project.timedEncounters],
    ["Spell overrides", project.spellOverrides],
    ["Race overrides", project.raceOverrides],
    ["Caste overrides", project.casteOverrides]
  ] as const) {
    if (records.some((record) => record.authored || record.provenance?.confidence === "inferred")) labels.push(label);
  }
  if (project.ruleNames.authored) labels.push("Rule name resources");
  return [...new Set(labels)];
}

function managedAssetResourceBytes(asset: ManagedAsset) {
  for (const value of [asset.resourcePath, asset.previewPath, asset.originalPath]) {
    const bytes = bytesFromDataUrl(value);
    if (bytes) return bytes;
  }
  return null;
}

function bytesFromDataUrl(value: string) {
  if (!value.startsWith("data:")) return null;
  const separator = value.indexOf(",");
  if (separator < 0) return null;
  const metadata = value.slice(5, separator).toLowerCase();
  const payload = value.slice(separator + 1);
  if (metadata.includes(";base64")) return base64Bytes(payload);
  return percentDecodedBytes(payload);
}

function base64Bytes(value: string) {
  try {
    return binaryStringToBytes(atob(value));
  } catch {
    return null;
  }
}

function binaryStringToBytes(value: string) {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function percentDecodedBytes(value: string) {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "%") {
      const hex = value.slice(index + 1, index + 3);
      if (hex.length !== 2 || !/^[0-9a-fA-F]{2}$/.test(hex)) return null;
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(char.charCodeAt(0) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function bucketTargetCompatibility(issues: ExportReport["targetCompatibilityIssues"]) {
  return {
    blockers: issues.filter((issue) => issue.severity === "error"),
    warnings: issues.filter((issue) => issue.severity === "warning"),
    notes: issues.filter((issue) => issue.severity !== "error" && issue.severity !== "warning")
  };
}

function normalizePackagePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "unnamed-source";
}

function safePackageName(name: string) {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || "Untitled Scenario";
}

function uniqueStrings(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function isCustomNamesSupportFile(name: string) {
  return name === "Custom Names.rsrc" || name === "Custom Names.rsf" || name === "._Custom Names";
}

function isGeneratedRuntimeCacheFile(name: string) {
  return name === "Data MENU";
}
