import {
  BATTLE_RECORD_BYTES,
  CASTE_RECORD_BYTES,
  COMPLEX_ENCOUNTER_RECORD_BYTES,
  CUSTOM_LANDLOOK_METADATA_BYTES,
  DOOR_LEVEL_RECORD_BYTES,
  DOOR_RECORD_BYTES,
  EXTRACODE_RECORD_BYTES,
  FIELD_RECORD_BYTES,
  GLOBAL_MACRO_HOOK_BYTES,
  LAND_LAYOUT_RECORD_BYTES,
  ITEM_RECORD_BYTES,
  LANDLOOK_RANGE_SLOT_BYTES,
  LANDLOOK_RANGE_SLOTS,
  MAPSTATS_RECORD_BYTES,
  MAPSTATS_RECORDS,
  MAP_RECORD_BYTES,
  MESSAGE_RECORD_BYTES,
  MONSTER_DESCRIPTION_RECORD_BYTES,
  MONSTER_RECORD_BYTES,
  OPTION_LABEL_RECORD_BYTES,
  RACE_RECORD_BYTES,
  RANDOM_LEVEL_RECORD_BYTES,
  SCENARIO_CONTACT_INFO_BYTES,
  SCENARIO_RESTRICTIONS_BYTES,
  SCENARIO_SHELL_BYTES,
  SCENARIO_SUPPORT_FILE_BYTES,
  SHOP_RECORD_BYTES,
  SIMPLE_ENCOUNTER_RECORD_BYTES,
  SPELL_RECORD_BYTES,
  TREASURE_RECORD_BYTES,
  THIEF_ENCOUNTER_RECORD_BYTES,
  TIMED_ENCOUNTER_RECORD_BYTES,
  TILE_SOLIDS_BYTES,
  writeBattles,
  writeCasteOverrides,
  writeComplexEncounters,
  writeCustomLandlookMetadata,
  writeDoorFile,
  writeExtraCodes,
  writeGlobalMacroHooks,
  writeLandLayout,
  writeMacroFile,
  writeMapFields,
  writeMapRecords,
  writeMessages,
  writeMonsterDescriptions,
  writeMonsters,
  writeOptionLabels,
  writeRaceOverrides,
  writeRandomLevels,
  writeScenarioItems,
  writeScenarioContactInfo,
  writeScenarioRestrictions,
  writeScenarioShell,
  writeScenarioSupportFile,
  writeShops,
  writeSimpleEncounters,
  writeSpellOverrides,
  writeThiefEncounters,
  writeTimedEncounters,
  writeTileSolids,
  writeTreasures
} from "./binaryWriters";
import { BrowserRawSourceFile, BrowserRawSourceSnapshot } from "./fsAccess";
import { BrowserCompatibilityAnnex } from "./compatibilityAnnex";
import { encodeStringListResource, mergeResourceEntries, parseResourceFork, parseStringListResource, writeMinimumScenarioResourceFork, type ResourceForkUpdate } from "./resourceFork";
import { createStoredZip } from "./zip";
import type { ExportReport, ManagedAsset, MapRecord, Project, ScenarioIconResource, ScenarioItemRecord, ScenarioSpellOverride, ScenarioTarget } from "../types";
import { appendPreservedShopSourceSuffix } from "./shopRecords";
import { requiresCompatibilityAnnex } from "../projectOrigin";
import { createAuthoredScenarioCompilerBaseline } from "./scenarioCompilerBaseline";
import { CUSTOM_SPELL_RECORDS, writeFreshCasteOverrides, writeFreshRaceOverrides, writeFreshSpellOverrides } from "./ruleCompiler";
import { isNormalizedLandlookAtlasPict } from "../pictWriter";

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

type BrowserScenarioCompilation = {
  outputFiles: Map<string, Uint8Array>;
  writtenFiles: string[];
  passThroughFiles: string[];
  resourceResult: ResourceExportResult;
};

export type BrowserScenarioPackageResult = {
  fileName: string;
  zip: Uint8Array;
  report: ExportReport;
};

const SUPPORTED_MANAGED_RESOURCE_TYPES = new Set(["PICT", "cicn", "snd ", "TEXT", "styl"]);
const CUSTOM_SPELL_LEVELS = 7;
const CUSTOM_SPELLS_PER_LEVEL = 15;

export function browserScenarioPackageFileName(project: Project, target: ScenarioTarget) {
  const suffix = target === "windows-realmz-folder" ? "windows-realmz-scenario" : "mac-classic-scenario";
  return `${safePackageName(project.scenario.name || "Untitled Scenario")}.${suffix}.zip`;
}

export function expectedAuthoredScenarioManifestFiles(project: Project, target: ScenarioTarget) {
  if (requiresCompatibilityAnnex(project)) {
    throw new Error("Expected authored scenario manifest files are only available for authored projects.");
  }
  return [...compileBrowserScenarioManifest(project, null, target).outputFiles.keys()]
    .sort((left, right) => left.localeCompare(right));
}

export function createBrowserScenarioPackageZip(
  project: Project,
  rawSources: BrowserRawSourceSnapshot | null | undefined,
  target: ScenarioTarget
): BrowserScenarioPackageResult {
  if (target === "providence-portable-folder") {
    throw new Error("Browser scenario ZIP export expects a Mac Classic or Windows Realmz target.");
  }
  const importedProject = requiresCompatibilityAnnex(project);
  const compatibilityAnnex = importedProject && rawSources ? new BrowserCompatibilityAnnex(rawSources) : null;
  if (importedProject && (!compatibilityAnnex || compatibilityAnnex.files().length === 0)) {
    throw new Error("Missing browser raw source snapshot. Reimport the scenario in this browser, or open a Providence project ZIP that includes raw-sources.");
  }
  const missingRawSources = compatibilityAnnex ? missingProjectSourceSnapshotFiles(project, compatibilityAnnex) : [];
  if (missingRawSources.length > 0) {
    throw new Error([
      "Browser scenario ZIP export is missing captured raw source bytes required by the project source inventory.",
      ...missingRawSources.slice(0, 10).map((source) => `- ${source.relativePath || source.name}`),
      missingRawSources.length > 10 ? `- ${missingRawSources.length - 10} more missing source file(s)` : "",
      "Reimport the scenario in this browser, or open a Providence project ZIP that includes raw-sources."
    ].filter(Boolean).join("\n"));
  }

  const generatedAt = new Date();
  const importedRootName = compatibilityAnnex?.rootName ?? "";
  const rootName = safePackageName(project.scenario.name || importedRootName || "Untitled Scenario");
  const compilation = compileBrowserScenarioManifest(project, compatibilityAnnex, target);
  const entries: ZipEntry[] = [...compilation.outputFiles.entries()]
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
  const warnings = [
    ...(project.validation.ok ? [] : project.validation.warnings),
    ...projectOnlyScenarioExportWarnings(project),
    ...itemTextExportWarnings(project, compatibilityAnnex)
  ];
  return {
    fileName,
    zip: createStoredZip(entries),
    report: {
      outputPath: `browser-download://${fileName}`,
      target,
      writtenFiles: compilation.writtenFiles,
      passThroughFiles: compilation.passThroughFiles,
      writtenResources: compilation.resourceResult.writtenResources,
      preservedResources: compilation.resourceResult.preservedResources,
      resourceWarnings: compilation.resourceResult.resourceWarnings,
      blockedAssets: compilation.resourceResult.blockedAssets,
      warnings,
      targetCompatibilityIssues,
      targetCompatibility: bucketTargetCompatibility(targetCompatibilityIssues)
    }
  };
}

function compileBrowserScenarioManifest(
  project: Project,
  compatibilityAnnex: BrowserCompatibilityAnnex | null,
  target: ScenarioTarget
): BrowserScenarioCompilation {
  const outputFiles = new Map<string, Uint8Array>();
  const passThroughFiles: string[] = [];
  const compilerBaseline = requiresCompatibilityAnnex(project) ? [] : createAuthoredScenarioCompilerBaseline(project);
  const compilerBaselineByPath = new Map(compilerBaseline.map((file) => [file.path, file.bytes]));

  for (const file of compilerBaseline) {
    outputFiles.set(file.path, file.bytes);
  }
  for (const source of compatibilityAnnex?.files() ?? []) {
    if (isCustomNamesSupportFile(source.name) || isGeneratedRuntimeCacheFile(source.name)) continue;
    const outputPath = outputPathForRawSource(source);
    outputFiles.set(outputPath, source.bytesData);
    passThroughFiles.push(outputPath);
  }

  const binaryWrites = writeSupportedBinaryRecords(project, compatibilityAnnex);
  for (const write of binaryWrites) {
    outputFiles.set(write.path, overlayCompilerBaseline(write.bytes, compilerBaselineByPath.get(write.path)));
  }
  const resourceResult = writeManagedResources(project, compatibilityAnnex, target);
  if (resourceResult.resourceFileWritten) {
    outputFiles.set(resourceResult.resourceFilePath, resourceResult.resourceBytes);
  }

  const writtenFiles = uniqueStrings([
    ...compilerBaseline.map((file) => file.path),
    ...binaryWrites.map((write) => write.path),
    ...(resourceResult.resourceFileWritten ? [resourceResult.resourceFilePath] : [])
  ]);
  const written = new Set(writtenFiles);
  return {
    outputFiles,
    writtenFiles,
    passThroughFiles: passThroughFiles.filter((path) => !written.has(path)),
    resourceResult
  };
}

function writeManagedResources(
  project: Project,
  annex: BrowserCompatibilityAnnex | null,
  target: ScenarioTarget
): ResourceExportResult & { resourceBytes: Uint8Array } {
  const selected = sourceResourceFile(project, annex, target);
  const resourceFileName = resourceFileNameForProject(project, annex, target);
  const resourceFilePath = target === "windows-realmz-folder" && resourceFileName === "Scenario"
    ? "Scenario.rsrc"
    : resourceFileName;
  const original = selected?.bytesData ?? writeMinimumScenarioResourceFork();
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
    ...managedAssetResourceUpdates(project.assets ?? [], original, result)
  ];
  const removals = project.editorMetadata?.removedScenarioResources ?? [];
  if (updates.length === 0 && removals.length === 0) {
    return { ...result, resourceBytes: original };
  }
  const merged = mergeResourceEntries(original, updates, removals);
  if (merged.replaced > 0) {
    result.resourceWarnings.push(`${merged.replaced} existing resource(s) were replaced by browser resource updates.`);
  }
  result.resourceFileWritten = true;
  return { ...result, resourceBytes: merged.bytes };
}

function hasResourceUpdates(project: Project) {
  return (
    (project.assets ?? []).some((asset) => asset.libraryScope !== "custom-library") ||
    (project.monsterIconOverrides ?? []).length > 0 ||
    (project.scenarioIconResources ?? []).length > 0 ||
    (project.mapRecords ?? []).length > 0 ||
    (project.editorMetadata?.removedScenarioResources ?? []).length > 0
  );
}

function writeSupportedBinaryRecords(project: Project, annex: BrowserCompatibilityAnnex | null) {
  const writes: BinaryWriteResult[] = [];
  if (project.scenario.shell?.authored) {
    writes.push({
      path: scenarioShellFileName(project),
      bytes: preserveMalformedRawTail(scenarioShellFileName(project), writeScenarioShell(project.scenario.shell), SCENARIO_SHELL_BYTES, annex)
    });
  }
  if (project.scenario.supportFile?.authored) {
    const supportFileName = project.scenario.supportFile.sourceFile?.trim() || "Scenario";
    writes.push({
      path: supportFileName,
      bytes: preserveImportedScenarioSupportFile(supportFileName, writeScenarioSupportFile(project.scenario.supportFile), annex)
    });
  }
  if (project.scenario.securityBackup?.authored) {
    writes.push({
      path: "Data CS",
      bytes: preserveMalformedRawTail("Data CS", writeScenarioShell(project.scenario.securityBackup), SCENARIO_SHELL_BYTES, annex)
    });
  }
  if (project.messages.length > 0) {
    writes.push({
      path: "Data SD2",
      bytes: writeMessagesForExport(project.messages, annex)
    });
  }
  if (project.optionLabels.length > 0) {
    writes.push({
      path: "Data OD",
      bytes: writeOptionLabelsForExport(project.optionLabels, annex)
    });
  }
  if (project.battles.length > 0) {
    writes.push({
      path: "Data BD",
      bytes: writeBattlesForExport(project.battles, annex)
    });
  }
  if (project.monsters.length > 0) {
    writes.push({
      path: "Data MD",
      bytes: writeMonstersForExport("Data MD", project.monsters, annex)
    });
  }
  for (const monsterSet of project.monsterSets) {
    if (monsterSet.monsters.length === 0) continue;
    writes.push({
      path: monsterSet.sourceFile,
      bytes: writeMonstersForExport(monsterSet.sourceFile, monsterSet.monsters, annex)
    });
  }
  if (project.monsterDescriptions.length > 0) {
    writes.push({
      path: "Data DES",
      bytes: writeMonsterDescriptionsForExport(project.monsterDescriptions, annex)
    });
  }
  if (project.maps.some((map) => map.levelType === "land")) {
    writes.push({
      path: "Data LD",
      bytes: preserveMalformedRawTail("Data LD", writeMapFields(project.maps, "land"), FIELD_RECORD_BYTES, annex)
    });
  }
  if (project.maps.some((map) => map.levelType === "dungeon")) {
    writes.push({
      path: "Data DL",
      bytes: preserveMalformedRawTail("Data DL", writeMapFields(project.maps, "dungeon"), FIELD_RECORD_BYTES, annex)
    });
  }
  if (project.mapRecords.length > 0) {
    writes.push({
      path: "Data MD2",
      bytes: preserveMalformedRawTail("Data MD2", writeMapRecords(project.mapRecords), MAP_RECORD_BYTES, annex)
    });
  }
  if (project.randomLevels.some((level) => level.levelType === "land")) {
    writes.push({
      path: "Data RD",
      bytes: preserveMalformedRawTail("Data RD", writeRandomLevels(project.randomLevels, "land"), RANDOM_LEVEL_RECORD_BYTES, annex)
    });
  }
  if (project.randomLevels.some((level) => level.levelType === "dungeon")) {
    writes.push({
      path: "Data RDD",
      bytes: preserveMalformedRawTail("Data RDD", writeRandomLevels(project.randomLevels, "dungeon"), RANDOM_LEVEL_RECORD_BYTES, annex)
    });
  }
  if (project.maps.some((map) => map.levelType === "land") || project.triggers.some((trigger) => trigger.levelType === "land")) {
    writes.push({
      path: "Data DD",
      bytes: preserveMalformedRawTail(
        "Data DD",
        writeDoorFile(project.triggers, "land", project.maps.filter((map) => map.levelType === "land").length),
        DOOR_LEVEL_RECORD_BYTES,
        annex
      )
    });
  }
  if (project.maps.some((map) => map.levelType === "dungeon") || project.triggers.some((trigger) => trigger.levelType === "dungeon")) {
    writes.push({
      path: "Data DDD",
      bytes: preserveMalformedRawTail(
        "Data DDD",
        writeDoorFile(project.triggers, "dungeon", project.maps.filter((map) => map.levelType === "dungeon").length),
        DOOR_LEVEL_RECORD_BYTES,
        annex
      )
    });
  }
  if (project.triggers.some((trigger) => trigger.source === "Data ED3") || rawSourceBytes("Data ED3", annex)) {
    writes.push({
      path: "Data ED3",
      bytes: compileFixedRowsWithCompatibilityAnnex("Data ED3", writeMacroFile(project.triggers), DOOR_RECORD_BYTES, annex)
    });
  }
  if (project.extracodes.length > 0 || rawSourceBytes("Data EDCD", annex)) {
    writes.push({
      path: "Data EDCD",
      bytes: compileFixedRowsWithCompatibilityAnnex("Data EDCD", writeExtraCodes(project.extracodes), EXTRACODE_RECORD_BYTES, annex)
    });
  }
  if (project.scenario.globalMacroHooks) {
    writes.push({
      path: "Global",
      bytes: preserveImportedGlobalMacroHooks(
        writeGlobalMacroHooks(project.scenario.globalMacroHooks),
        project.scenario.globalMacroHooks.authored,
        annex
      )
    });
  }
  if (project.landLayout) {
    writes.push({
      path: "Layout",
      bytes: preserveImportedLandLayoutTail(writeLandLayout(project.landLayout), annex)
    });
  }
  writes.push({
    path: "Data Solids",
    bytes: preserveImportedDataSolidsTail(writeTileSolids(project.tileAttributes), annex)
  });
  for (const landlook of project.customLandlooks ?? []) {
    if (!landlook.authored) continue;
    writes.push({
      path: landlook.sourceFile,
      bytes: preserveImportedCustomLandlookCompatibility(
        writeCustomLandlookMetadata(landlook),
        landlook.sourceFile,
        annex
      )
    });
  }
  if (project.scenario.contactInfo) {
    writes.push({
      path: "Data CI",
      bytes: preserveImportedSingleton("Data CI", writeScenarioContactInfo(project.scenario.contactInfo), SCENARIO_CONTACT_INFO_BYTES, project.scenario.contactInfo.authored, annex)
    });
  }
  if (project.scenario.restrictions) {
    writes.push({
      path: "Data RI",
      bytes: preserveImportedSingleton("Data RI", writeScenarioRestrictions(project.scenario.restrictions), SCENARIO_RESTRICTIONS_BYTES, project.scenario.restrictions.authored, annex)
    });
  }
  if (project.scenarioItems.length > 0) {
    writes.push({
      path: "Data NI",
      bytes: preserveZeroFilledRawCapacity("Data NI", writeScenarioItems(project.scenarioItems), ITEM_RECORD_BYTES, annex)
    });
  }
  if (project.treasures.length > 0) {
    writes.push({
      path: "Data TD",
      bytes: preserveMalformedRawTail("Data TD", writeTreasures(project.treasures), TREASURE_RECORD_BYTES, annex)
    });
  }
  if (project.shops.length > 0) {
    writes.push({
      path: "Data SD",
      bytes: appendPreservedShopSourceSuffix(writeShops(project.shops), rawSourceBytes("Data SD", annex))
    });
  }
  if (project.spellOverrides.length > 0) {
    writes.push({
      path: "Data Spell",
      bytes: writeSpellOverridesForExport(project.spellOverrides, annex)
    });
    const spellNameResourceWrite = writeCustomSpellNameResources(project, annex);
    if (spellNameResourceWrite) writes.push(spellNameResourceWrite);
  }
  const itemTextResourceWrite = writeItemTextResources(project, annex);
  if (itemTextResourceWrite) writes.push(itemTextResourceWrite);
  if (project.raceOverrides.length > 0) {
    writes.push({
      path: "Data Race",
      bytes: writeRuleOverridesForExport("Data Race", project.raceOverrides, RACE_RECORD_BYTES, annex, writeRaceOverrides, writeFreshRaceOverrides)
    });
  }
  if (project.casteOverrides.length > 0) {
    writes.push({
      path: "Data Caste",
      bytes: writeRuleOverridesForExport("Data Caste", project.casteOverrides, CASTE_RECORD_BYTES, annex, writeCasteOverrides, writeFreshCasteOverrides)
    });
  }
  if (project.simpleEncounters.length > 0) {
    writes.push({
      path: "Data ED",
      bytes: writeSimpleEncountersForExport(project.simpleEncounters, annex)
    });
  }
  if (project.complexEncounters.length > 0) {
    writes.push({
      path: "Data ED2",
      bytes: writeComplexEncountersForExport(project.complexEncounters, annex)
    });
  }
  if (project.thiefEncounters.length > 0) {
    writes.push({
      path: "Data TD2",
      bytes: writeThiefEncountersForExport(project.thiefEncounters, annex)
    });
  }
  if (project.timedEncounters.length > 0) {
    writes.push({
      path: "Data TD3",
      bytes: writeTimedEncountersForExport(project.timedEncounters, annex)
    });
  }
  return writes.filter((write) => write.bytes.byteLength > 0);
}

function writeCustomSpellNameResources(project: Project, annex: BrowserCompatibilityAnnex | null): BinaryWriteResult | null {
  const source = dataSpellResourceFork(annex);
  const candidates = project.spellOverrides.filter((record) => (
    record.id >= 0
    && record.id < CUSTOM_SPELL_RECORDS
    && (source != null || record.authored)
  ));
  if (candidates.length === 0) return null;
  const original = source?.bytesData ?? new Uint8Array();
  const entries = parseResourceFork(original);
  const updates: ResourceForkUpdate[] = [];
  for (let levelIndex = 0; levelIndex < CUSTOM_SPELL_LEVELS; levelIndex += 1) {
    const resourceId = 5000 + levelIndex;
    const entry = entries.find((candidate) => candidate.resourceType === "STR#" && candidate.id === resourceId);
    const names = entry ? parseStringListResource(entry.data) : [];
    while (names.length < CUSTOM_SPELLS_PER_LEVEL) names.push("");
    let changed = false;
    for (let slotIndex = 0; slotIndex < CUSTOM_SPELLS_PER_LEVEL; slotIndex += 1) {
      const customId = levelIndex * CUSTOM_SPELLS_PER_LEVEL + slotIndex;
      const record = candidates.find((candidate) => candidate.id === customId);
      if (!record) continue;
      const displayName = record.displayName?.trim() || defaultCustomSpellName(customId);
      if (source && !record.authored && displayName === defaultCustomSpellName(customId)) continue;
      if (displayName === names[slotIndex]) continue;
      names[slotIndex] = displayName;
      changed = true;
    }
    if (changed) {
      updates.push({
        resourceType: entry?.resourceType ?? "STR#",
        id: entry?.id ?? resourceId,
        name: entry?.name ?? customSpellResourceName(levelIndex),
        attributes: entry?.attributes ?? 32,
        data: encodeStringListResource(names)
      });
    }
  }
  if (updates.length === 0) return null;
  return {
    path: source ? outputPathForRawSource(source) : "Data Spell.rsrc",
    bytes: mergeResourceEntries(original, updates).bytes
  };
}

function writeSpellOverridesForExport(records: ScenarioSpellOverride[], annex: BrowserCompatibilityAnnex | null) {
  const invalid = records.find((record) => !Number.isInteger(record.id) || record.id < 0 || record.id >= CUSTOM_SPELL_RECORDS);
  if (invalid) throw new Error(`Custom spell ${invalid.id} is outside Data Spell's 0..104 custom slot range.`);
  return writeRuleOverridesForExport("Data Spell", records, SPELL_RECORD_BYTES, annex, writeSpellOverrides, writeFreshSpellOverrides);
}

function writeRuleOverridesForExport<T extends { id: number; authored?: boolean }>(
  fileName: "Data Spell" | "Data Race" | "Data Caste",
  records: T[],
  recordBytes: number,
  annex: BrowserCompatibilityAnnex | null,
  writer: (records: T[]) => Uint8Array,
  freshWriter: (records: T[]) => Uint8Array
) {
  const raw = rawSourceBytes(fileName, annex);
  const structurallyInvalid = records.find((record) => !Number.isInteger(record.id) || record.id < 0);
  if (structurallyInvalid) throw new Error(`${fileName} record ${structurallyInvalid.id} must use a non-negative integer slot.`);
  if (!raw) return freshWriter(records);

  const encoded = writer(records);
  const sourceBodyBytes = Math.floor(raw.byteLength / recordBytes) * recordBytes;
  const requiredBodyBytes = records.reduce((maximum, record) => Math.max(maximum, (record.id + 1) * recordBytes), sourceBodyBytes);
  const body = new Uint8Array(requiredBodyBytes);
  body.set(raw.slice(0, sourceBodyBytes));
  for (const record of records) {
    if (!record.authored) continue;
    const start = record.id * recordBytes;
    body.set(encoded.slice(start, start + recordBytes), start);
  }
  const tail = raw.slice(sourceBodyBytes);
  if (tail.byteLength === 0) return body;
  const output = new Uint8Array(body.byteLength + tail.byteLength);
  output.set(body);
  output.set(tail, body.byteLength);
  return output;
}

function writeItemTextResources(project: Project, annex: BrowserCompatibilityAnnex | null): BinaryWriteResult | null {
  const authored = (project.itemTexts ?? []).filter((record) => record.authored && record.itemId > 0 && record.itemId < 1000);
  if (authored.length === 0) return null;
  const source = dataIdResourceFork(annex);
  const original = source?.bytesData ?? new Uint8Array();
  const entries = parseResourceFork(original);
  const updates: ResourceForkUpdate[] = [];
  const families = new Set(authored.map((record) => Math.floor(record.itemId / 200) * 200));
  for (const base of [...families].sort((a, b) => a - b)) {
    for (const offset of [0, 1, 2]) {
      const resourceId = base + offset;
      const entry = entries.find((candidate) => candidate.resourceType === "STR#" && candidate.id === resourceId);
      const strings = entry ? parseStringListResource(entry.data) : [];
      while (strings.length < 200) strings.push("");
      let changed = false;
      for (const record of authored) {
        if (Math.floor(record.itemId / 200) * 200 !== base) continue;
        const index = record.itemId - base;
        if (index < 0 || index >= 200) continue;
        const next =
          offset === 0 ? record.unidentifiedName :
          offset === 1 ? record.identifiedName :
          record.description;
        if (strings[index] === next) continue;
        strings[index] = next ?? "";
        changed = true;
      }
      if (changed) {
        updates.push({
          resourceType: entry?.resourceType ?? "STR#",
          id: entry?.id ?? resourceId,
          name: entry?.name ?? itemTextResourceName(offset),
          attributes: entry?.attributes ?? 0,
          data: encodeStringListResource(strings)
        });
      }
    }
  }
  if (updates.length === 0) return null;
  return {
    path: source ? outputPathForRawSource(source) : "Data ID.rsrc",
    bytes: mergeResourceEntries(original, updates).bytes
  };
}

function dataIdResourceFork(annex: BrowserCompatibilityAnnex | null) {
  for (const source of annex?.files() ?? []) {
    const outputPath = outputPathForRawSource(source).toLowerCase();
    const name = source.name.toLowerCase();
    if (!["data id", "data id.rsrc", "data id.rsf", "._data id"].includes(name) && !outputPath.endsWith("/data id") && !outputPath.endsWith("/data id.rsrc") && !outputPath.endsWith("/data id.rsf") && !outputPath.endsWith("/._data id")) {
      continue;
    }
    if (parseResourceFork(source.bytesData).some((entry) => entry.resourceType === "STR#" && itemTextResourceBase(entry.id) != null)) {
      return source;
    }
  }
  return null;
}

function itemTextResourceBase(resourceId: number) {
  const offset = ((resourceId % 200) + 200) % 200;
  if (offset !== 0 && offset !== 1 && offset !== 2) return null;
  const base = resourceId - offset;
  return base >= 0 && base < 1000 ? base : null;
}

function itemTextResourceName(offset: number) {
  if (offset === 0) return "Item Unidentified Names";
  if (offset === 1) return "Item Names";
  return "Item Descriptions";
}

function dataSpellResourceFork(annex: BrowserCompatibilityAnnex | null) {
  for (const name of ["Data Spell.rsrc", "Data Spell.rsf", "._Data Spell"]) {
    const source = annex?.find((file) => file.name === name || outputPathForRawSource(file) === name);
    if (!source) continue;
    if (parseResourceFork(source.bytesData).some((entry) => entry.resourceType === "STR#" && entry.id >= 5000 && entry.id <= 5006)) {
      return source;
    }
  }
  return null;
}

function defaultCustomSpellName(customId: number) {
  return `Custom Spell ${customId}`;
}

function customSpellResourceName(levelIndex: number) {
  return `Custom ${["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"][levelIndex]}`;
}

function managedAssetResourceUpdates(assets: ManagedAsset[], originalResourceFork: Uint8Array, result: ResourceExportResult) {
  const updates: ResourceForkUpdate[] = [];
  const originalEntries = parseResourceFork(originalResourceFork);
  let scrollingTextWarningEmitted = false;
  for (const asset of assets) {
    if (asset.libraryScope === "custom-library") {
      continue;
    }
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
    if (asset.conversion?.target === "custom-landlook-atlas" && !isNormalizedLandlookAtlasPict(data)) {
      result.blockedAssets.push(`${asset.label} is not a normalized 640 x 320 indexed PICT atlas.`);
      continue;
    }
    if (originalEntries.some((entry) => entry.resourceType === asset.resourceType && entry.id === asset.resourceId && bytesEqual(entry.data, data))) {
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
    const existingBase = preserveExistingMetadata ? originalEntries.find((entry) => entry.resourceType === "cicn" && Math.abs(entry.id) === target) : null;
    const existingPaired = preserveExistingMetadata ? originalEntries.find((entry) => entry.resourceType === "cicn" && Math.abs(entry.id) === target + 308) : null;
    if (preserveExistingMetadata && existingBase && existingPaired && bytesEqual(existingBase.data, baseData) && bytesEqual(existingPaired.data, pairedData)) {
      continue;
    }
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
  const hasAuthoredNames = project.mapRecords.some((record) => record.mapNameAuthored);
  if (!hasAuthoredNames) {
    return [];
  }
  const primaryData = encodeStringListResource(project.mapRecords.map(mapRecordPrimaryName));
  const secondaryData = encodeStringListResource(project.mapRecords.map((record) => record.secondaryName?.trim() || "--------------------"));
  const existingPrimary = existing.find((entry) => entry.resourceType === "STR#" && entry.id === -102);
  const existingSecondary = existing.find((entry) => entry.resourceType === "STR#" && entry.id === -101);
  if (
    existingPrimary &&
    existingSecondary &&
    bytesEqual(existingPrimary.data, primaryData) &&
    bytesEqual(existingSecondary.data, secondaryData)
  ) {
    return [];
  }
  return [
    {
      resourceType: "STR#",
      id: -102,
      name: "Map Names",
      attributes: 0,
      data: primaryData
    },
    {
      resourceType: "STR#",
      id: -101,
      name: "Map Names",
      attributes: 0,
      data: secondaryData
    }
  ];
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

function mapRecordPrimaryName(record: MapRecord) {
  for (const candidate of [record.name, record.primaryName]) {
    const name = candidate?.trim();
    if (name) return name;
  }
  return `Map ${record.id + 1}`;
}

function sourceResourceFile(project: Project, annex: BrowserCompatibilityAnnex | null, target: ScenarioTarget) {
  const resourceFileName = resourceFileNameForProject(project, annex, target);
  const exact = annex?.find((file) => (
    file.role === "resource-fork" &&
    !isWindowsRawScenarioResourceFork(file, target) &&
    parseResourceFork(file.bytesData).length > 0 &&
    (file.name.toLowerCase() === resourceFileName.toLowerCase() || outputPathForRawSource(file).toLowerCase() === resourceFileName.toLowerCase())
  ));
  if (exact) return exact;
  return annex?.find((file) => (
    file.role === "resource-fork" &&
    !isWindowsRawScenarioResourceFork(file, target) &&
    parseResourceFork(file.bytesData).length > 0
  )) ?? null;
}

function resourceFileNameForProject(project: Project, annex: BrowserCompatibilityAnnex | null, target: ScenarioTarget) {
  const shellName = scenarioShellFileName(project);
  const preferred = uniqueStrings(["Scenario.rsrc", "Scenario.rsf", `${shellName}.rsrc`, `${shellName}.rsf`, "Scenario"]);
  for (const candidate of preferred) {
    const file = annex?.find((source) => source.role === "resource-fork" && source.name.toLowerCase() === candidate.toLowerCase());
    if (!file) continue;
    if (isWindowsRawScenarioResourceFork(file, target)) {
      return "Scenario.rsrc";
    }
    return file.name;
  }
  const resourceFile = annex?.find((source) => source.role === "resource-fork");
  if (resourceFile) {
    if (isWindowsRawScenarioResourceFork(resourceFile, target)) return "Scenario.rsrc";
    return resourceFile.name;
  }
  if (!requiresCompatibilityAnnex(project)) return "Scenario.rsrc";
  return target === "windows-realmz-folder" ? "Scenario.rsrc" : "Scenario";
}

function overlayCompilerBaseline(bytes: Uint8Array, baseline: Uint8Array | undefined) {
  if (!baseline || baseline.byteLength <= bytes.byteLength) return bytes;
  const output = new Uint8Array(baseline);
  output.set(bytes);
  return output;
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

function preserveMalformedRawTail(fileName: string, bytes: Uint8Array, recordBytes: number, annex: BrowserCompatibilityAnnex | null) {
  const raw = rawSourceBytes(fileName, annex);
  if (!raw || raw.byteLength <= bytes.byteLength || raw.byteLength % recordBytes === 0) {
    return bytes;
  }
  const output = new Uint8Array(raw.byteLength);
  output.set(bytes);
  output.set(raw.slice(bytes.byteLength), bytes.byteLength);
  return output;
}

function compileFixedRowsWithCompatibilityAnnex(
  fileName: string,
  bytes: Uint8Array,
  recordBytes: number,
  annex: BrowserCompatibilityAnnex | null
) {
  const raw = rawSourceBytes(fileName, annex);
  if (!raw) return bytes;
  const completeSourceBytes = Math.floor(raw.byteLength / recordBytes) * recordBytes;
  const outputCoreBytes = Math.max(bytes.byteLength, completeSourceBytes);
  const tail = raw.slice(completeSourceBytes);
  const output = new Uint8Array(outputCoreBytes + tail.byteLength);
  output.set(bytes);
  output.set(tail, outputCoreBytes);
  return output;
}

function preserveImportedDataSolidsTail(bytes: Uint8Array, annex: BrowserCompatibilityAnnex | null) {
  const raw = rawSourceBytes("Data Solids", annex);
  if (!raw || raw.byteLength <= TILE_SOLIDS_BYTES) return bytes;
  const output = new Uint8Array(raw.byteLength);
  output.set(bytes);
  output.set(raw.slice(TILE_SOLIDS_BYTES), TILE_SOLIDS_BYTES);
  return output;
}

function preserveImportedLandLayoutTail(bytes: Uint8Array, annex: BrowserCompatibilityAnnex | null) {
  const raw = rawSourceBytes("Layout", annex);
  if (!raw || raw.byteLength <= LAND_LAYOUT_RECORD_BYTES) return bytes;
  const output = new Uint8Array(raw.byteLength);
  output.set(bytes);
  output.set(raw.slice(LAND_LAYOUT_RECORD_BYTES), LAND_LAYOUT_RECORD_BYTES);
  return output;
}

function preserveImportedCustomLandlookCompatibility(
  bytes: Uint8Array,
  sourceFile: string,
  annex: BrowserCompatibilityAnnex | null
) {
  const raw = rawSourceBytes(sourceFile, annex);
  if (!raw) return bytes;
  const output = new Uint8Array(CUSTOM_LANDLOOK_METADATA_BYTES + Math.max(0, raw.byteLength - CUSTOM_LANDLOOK_METADATA_BYTES));
  output.set(bytes);
  for (let tile = 0; tile < MAPSTATS_RECORDS; tile += 1) {
    const offset = tile * MAPSTATS_RECORD_BYTES + 18;
    if (raw.byteLength >= offset + 2) output.set(raw.slice(offset, offset + 2), offset);
  }
  const rangeOffset = MAPSTATS_RECORD_BYTES * MAPSTATS_RECORDS + 4;
  for (let slot = 0; slot < LANDLOOK_RANGE_SLOTS; slot += 1) {
    const offset = rangeOffset + slot * LANDLOOK_RANGE_SLOT_BYTES + 4;
    if (raw.byteLength >= offset + 2) output.set(raw.slice(offset, offset + 2), offset);
  }
  if (raw.byteLength > CUSTOM_LANDLOOK_METADATA_BYTES) {
    output.set(raw.slice(CUSTOM_LANDLOOK_METADATA_BYTES), CUSTOM_LANDLOOK_METADATA_BYTES);
  }
  return output;
}

function preserveImportedSingleton(
  fileName: string,
  bytes: Uint8Array,
  recordBytes: number,
  authored: boolean | undefined,
  annex: BrowserCompatibilityAnnex | null
) {
  const raw = rawSourceBytes(fileName, annex);
  if (!raw) return bytes;
  if (!authored && raw.byteLength >= recordBytes) return raw;
  return preserveMalformedRawTail(fileName, bytes, recordBytes, annex);
}

function preserveImportedGlobalMacroHooks(
  bytes: Uint8Array,
  authored: boolean | undefined,
  annex: BrowserCompatibilityAnnex | null
) {
  const raw = rawSourceBytes("Global", annex);
  if (!raw) return bytes;
  if (!authored) return raw;
  const output = preserveMalformedRawTail("Global", bytes, GLOBAL_MACRO_HOOK_BYTES, annex);
  if (raw.byteLength >= GLOBAL_MACRO_HOOK_BYTES) {
    output.set(raw.slice(6, 8), 6);
    output.set(raw.slice(12, GLOBAL_MACRO_HOOK_BYTES), 12);
  }
  return output;
}

function writeMessagesForExport(messages: Project["messages"], annex: BrowserCompatibilityAnnex | null) {
  return preserveImportedFixedRows("Data SD2", writeMessages(messages), messages, MESSAGE_RECORD_BYTES, annex);
}

function writeOptionLabelsForExport(options: Project["optionLabels"], annex: BrowserCompatibilityAnnex | null) {
  return preserveImportedFixedRows("Data OD", writeOptionLabels(options), options, OPTION_LABEL_RECORD_BYTES, annex);
}

function writeBattlesForExport(battles: Project["battles"], annex: BrowserCompatibilityAnnex | null) {
  return preserveImportedFixedRows("Data BD", writeBattles(battles), battles, BATTLE_RECORD_BYTES, annex);
}

function writeMonstersForExport(fileName: string, monsters: Project["monsters"], annex: BrowserCompatibilityAnnex | null) {
  return preserveImportedFixedRows(fileName, writeMonsters(monsters), monsters, MONSTER_RECORD_BYTES, annex);
}

function writeMonsterDescriptionsForExport(descriptions: Project["monsterDescriptions"], annex: BrowserCompatibilityAnnex | null) {
  return preserveImportedFixedRows("Data DES", writeMonsterDescriptions(descriptions), descriptions, MONSTER_DESCRIPTION_RECORD_BYTES, annex);
}

function writeSimpleEncountersForExport(encounters: Project["simpleEncounters"], annex: BrowserCompatibilityAnnex | null) {
  return preserveImportedFixedRows("Data ED", writeSimpleEncounters(encounters), encounters, SIMPLE_ENCOUNTER_RECORD_BYTES, annex);
}

function writeComplexEncountersForExport(encounters: Project["complexEncounters"], annex: BrowserCompatibilityAnnex | null) {
  return preserveImportedFixedRows("Data ED2", writeComplexEncounters(encounters), encounters, COMPLEX_ENCOUNTER_RECORD_BYTES, annex);
}

function writeThiefEncountersForExport(encounters: Project["thiefEncounters"], annex: BrowserCompatibilityAnnex | null) {
  return preserveImportedFixedRows("Data TD2", writeThiefEncounters(encounters), encounters, THIEF_ENCOUNTER_RECORD_BYTES, annex);
}

function writeTimedEncountersForExport(encounters: Project["timedEncounters"], annex: BrowserCompatibilityAnnex | null) {
  const bytes = preserveImportedFixedRows("Data TD3", writeTimedEncounters(encounters), encounters, TIMED_ENCOUNTER_RECORD_BYTES, annex);
  const raw = rawSourceBytes("Data TD3", annex);
  if (!raw) return bytes;
  const completeSourceBytes = Math.floor(raw.byteLength / TIMED_ENCOUNTER_RECORD_BYTES) * TIMED_ENCOUNTER_RECORD_BYTES;
  for (const record of encounters) {
    if (!record.authored) continue;
    const start = record.id * TIMED_ENCOUNTER_RECORD_BYTES + 22;
    const end = (record.id + 1) * TIMED_ENCOUNTER_RECORD_BYTES;
    if (end <= bytes.byteLength && end <= completeSourceBytes) {
      bytes.set(raw.slice(start, end), start);
    }
  }
  return bytes;
}

function preserveImportedFixedRows(
  fileName: string,
  bytes: Uint8Array,
  records: Array<{ id: number; authored?: boolean }>,
  recordBytes: number,
  annex: BrowserCompatibilityAnnex | null
) {
  const raw = rawSourceBytes(fileName, annex);
  if (!raw || bytes.byteLength === 0) return bytes;
  const completeSourceBytes = Math.floor(raw.byteLength / recordBytes) * recordBytes;
  const tail = raw.slice(completeSourceBytes);
  const output = new Uint8Array(bytes.byteLength + tail.byteLength);
  output.set(bytes);
  for (const record of records) {
    if (record.authored) continue;
    const start = record.id * recordBytes;
    const end = start + recordBytes;
    if (end <= bytes.byteLength && end <= completeSourceBytes) {
      output.set(raw.slice(start, end), start);
    }
  }
  output.set(tail, bytes.byteLength);
  return output;
}

function preserveZeroFilledRawCapacity(fileName: string, bytes: Uint8Array, recordBytes: number, annex: BrowserCompatibilityAnnex | null) {
  const raw = rawSourceBytes(fileName, annex);
  if (!raw || raw.byteLength <= bytes.byteLength || raw.some((byte) => byte !== 0)) {
    return preserveMalformedRawTail(fileName, bytes, recordBytes, annex);
  }
  const output = new Uint8Array(raw);
  output.set(bytes);
  return output;
}

function preserveImportedScenarioSupportFile(fileName: string, bytes: Uint8Array, annex: BrowserCompatibilityAnnex | null) {
  const raw = rawSourceBytes(fileName, annex);
  if (!raw || raw.byteLength < 40 || bytes.byteLength !== SCENARIO_SUPPORT_FILE_BYTES) return bytes;
  const output = new Uint8Array(Math.max(raw.byteLength, bytes.byteLength));
  output.set(raw);
  output[23] = bytes[23];
  output.set(bytes.slice(38, 40), 38);
  return output;
}

function rawSourceBytes(fileName: string, annex: BrowserCompatibilityAnnex | null) {
  const normalizedName = normalizePackagePath(fileName).toLowerCase();
  return annex?.find((source) => (
    normalizePackagePath(source.name).toLowerCase() === normalizedName ||
    normalizePackagePath(source.relativePath || "").toLowerCase() === normalizedName
  ))?.bytesData ?? null;
}

function missingProjectSourceSnapshotFiles(project: Project, annex: BrowserCompatibilityAnnex) {
  const captured = new Set<string>();
  for (const source of annex.files()) {
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

function projectOnlyScenarioExportWarnings(project: Project) {
  if (!project.ruleNames.authored) return [];
  return [
    "Race/caste rule name edits are project-only labels. Realmz stores those names in the global Data Files/Custom Names.rsrc support resource, which is not part of scenario ZIP export; Data Race/Data Caste behavior records still export normally."
  ];
}

function itemTextExportWarnings(project: Project, annex: BrowserCompatibilityAnnex | null) {
  const authored = (project.itemTexts ?? []).some((record) => record.authored);
  if (!authored || dataIdResourceFork(annex) || canCreateCustomItemTextResource(project)) return [];
  return [
    "Custom item name/description edits need a captured Data ID resource fork for scenario ZIP export. They remain preserved in the Providence project package."
  ];
}

function canCreateCustomItemTextResource(project: Project) {
  return (project.itemTexts ?? []).some((record) => record.authored && record.itemId >= 800 && record.itemId < 1000);
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
