import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = path.join(root, "schemas", "realmz-native-manifest-policy.json");
const projectSchemaPath = path.join(root, "schemas", "providence-project.schema.json");
const typescriptPath = path.join(root, "src", "editor", "generated", "realmzNativeManifestPolicy.ts");
const rustPath = path.join(root, "src-tauri", "src", "generated", "native_manifest_policy.rs");
const browserBaselinePath = path.join(root, "src", "editor", "browser", "scenarioCompilerBaseline.ts");
const browserScenarioPackagePath = path.join(root, "src", "editor", "browser", "scenarioPackage.ts");
const browserBinaryWritersPath = path.join(root, "src", "editor", "browser", "binaryWriters.ts");
const browserParserPath = path.join(root, "src", "editor", "browser", "realmzParser.ts");
const browserSemanticPath = path.join(root, "src", "editor", "browser", "semantic.ts");
const browserShopRecordsPath = path.join(root, "src", "editor", "browser", "shopRecords.ts");
const scenarioSeedMapCompilerPath = path.join(root, "src", "editor", "scenarioSeed", "mapCompiler.ts");
const scenarioSeedScriptCompilerPath = path.join(root, "src", "editor", "scenarioSeed", "scriptCompiler.ts");
const scenarioSeedCoreRecordCompilerPath = path.join(root, "src", "editor", "scenarioSeed", "coreRecordCompiler.ts");
const rustExporterPath = path.join(root, "src-tauri", "src", "exporter.rs");
const rustProjectPath = path.join(root, "src-tauri", "src", "project.rs");
const rustMapsPath = path.join(root, "src-tauri", "src", "realmz", "maps.rs");
const rustRandomLevelsPath = path.join(root, "src-tauri", "src", "realmz", "random_levels.rs");
const rustActionPointsPath = path.join(root, "src-tauri", "src", "realmz", "action_points.rs");
const rustEncountersPath = path.join(root, "src-tauri", "src", "realmz", "encounters.rs");
const rustBattlesPath = path.join(root, "src-tauri", "src", "realmz", "battles.rs");
const rustCombatPath = path.join(root, "src-tauri", "src", "realmz", "combat.rs");
const rustEconomyPath = path.join(root, "src-tauri", "src", "realmz", "economy.rs");
const rustShopsPath = path.join(root, "src-tauri", "src", "realmz", "shops.rs");
const rustScenarioItemsPath = path.join(root, "src-tauri", "src", "realmz", "scenario_items.rs");
const checkOnly = process.argv.includes("--check");

const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const projectSchema = JSON.parse(fs.readFileSync(projectSchemaPath, "utf8"));
const nativeLayout = policy.nativeLayout;
const baseline = policy.authoredBaseline;

expect(Number.isInteger(policy.contractVersion) && policy.contractVersion > 0, "contractVersion must be a positive integer");
expect(nativeLayout && typeof nativeLayout === "object" && !Array.isArray(nativeLayout), "nativeLayout must be an object");
validatePositiveInteger(nativeLayout.mapField?.dimension, "nativeLayout.mapField.dimension");
validatePositiveInteger(nativeLayout.mapField?.cellBytes, "nativeLayout.mapField.cellBytes");
validatePositiveInteger(nativeLayout.randomLevel?.recordBytes, "nativeLayout.randomLevel.recordBytes");
validatePositiveInteger(nativeLayout.actionPoint?.recordBytes, "nativeLayout.actionPoint.recordBytes");
validatePositiveInteger(nativeLayout.actionPoint?.recordsPerLevel, "nativeLayout.actionPoint.recordsPerLevel");
validatePositiveInteger(nativeLayout.extraCode?.recordBytes, "nativeLayout.extraCode.recordBytes");
validatePositiveInteger(nativeLayout.encounter?.simpleRecordBytes, "nativeLayout.encounter.simpleRecordBytes");
validatePositiveInteger(nativeLayout.encounter?.complexRecordBytes, "nativeLayout.encounter.complexRecordBytes");
validatePositiveInteger(nativeLayout.encounter?.thiefRecordBytes, "nativeLayout.encounter.thiefRecordBytes");
validatePositiveInteger(nativeLayout.encounter?.timedRecordBytes, "nativeLayout.encounter.timedRecordBytes");
validatePositiveInteger(nativeLayout.combat?.battleRecordBytes, "nativeLayout.combat.battleRecordBytes");
validatePositiveInteger(nativeLayout.combat?.monsterRecordBytes, "nativeLayout.combat.monsterRecordBytes");
validatePositiveInteger(nativeLayout.combat?.monsterDescriptionRecordBytes, "nativeLayout.combat.monsterDescriptionRecordBytes");
validatePositiveInteger(nativeLayout.economy?.scenarioItemRecordBytes, "nativeLayout.economy.scenarioItemRecordBytes");
validatePositiveInteger(nativeLayout.economy?.treasureRecordBytes, "nativeLayout.economy.treasureRecordBytes");
validatePositiveInteger(nativeLayout.economy?.shopRecordBytes, "nativeLayout.economy.shopRecordBytes");
const generatedNativeLayout = {
  mapSize: nativeLayout.mapField.dimension,
  mapFieldBytes: nativeLayout.mapField.dimension * nativeLayout.mapField.dimension * nativeLayout.mapField.cellBytes,
  randomLevelRecordBytes: nativeLayout.randomLevel.recordBytes,
  actionPointRecordBytes: nativeLayout.actionPoint.recordBytes,
  actionPointsPerLevel: nativeLayout.actionPoint.recordsPerLevel,
  actionPointLevelBytes: nativeLayout.actionPoint.recordBytes * nativeLayout.actionPoint.recordsPerLevel,
  extraCodeRecordBytes: nativeLayout.extraCode.recordBytes,
  simpleEncounterRecordBytes: nativeLayout.encounter.simpleRecordBytes,
  complexEncounterRecordBytes: nativeLayout.encounter.complexRecordBytes,
  thiefEncounterRecordBytes: nativeLayout.encounter.thiefRecordBytes,
  timedEncounterRecordBytes: nativeLayout.encounter.timedRecordBytes,
  battleRecordBytes: nativeLayout.combat.battleRecordBytes,
  monsterRecordBytes: nativeLayout.combat.monsterRecordBytes,
  monsterDescriptionRecordBytes: nativeLayout.combat.monsterDescriptionRecordBytes,
  scenarioItemRecordBytes: nativeLayout.economy.scenarioItemRecordBytes,
  treasureRecordBytes: nativeLayout.economy.treasureRecordBytes,
  shopRecordBytes: nativeLayout.economy.shopRecordBytes
};
expect(baseline && typeof baseline === "object" && !Array.isArray(baseline), "authoredBaseline must be an object");
expect(Number.isInteger(baseline.scenarioItemRecords) && baseline.scenarioItemRecords > 0, "scenarioItemRecords must be a positive integer");
const startupFiles = baseline.startupFiles;
expect(startupFiles && typeof startupFiles === "object" && !Array.isArray(startupFiles), "startupFiles must be an object");
for (const role of ["scenarioSupport", "securityBackup", "scenarioItems", "tileSolids"]) {
  validateTopLevelFileName(startupFiles[role], `startupFiles.${role}`);
}
expect(new Set([startupFiles.scenarioSupport, startupFiles.securityBackup, startupFiles.scenarioItems, startupFiles.tileSolids]).size === 4, "fixed startupFiles paths must be unique");
expect(startupFiles.resourceForkByTarget && typeof startupFiles.resourceForkByTarget === "object" && !Array.isArray(startupFiles.resourceForkByTarget), "startupFiles.resourceForkByTarget must be an object");
const scenarioTargets = ["windows-realmz-folder", "mac-classic-folder", "providence-portable-folder"];
expect(Object.keys(startupFiles.resourceForkByTarget).sort().join("\0") === [...scenarioTargets].sort().join("\0"), "startupFiles.resourceForkByTarget must define every ScenarioTarget exactly once");
for (const target of scenarioTargets) {
  validateTopLevelFileName(startupFiles.resourceForkByTarget[target], `startupFiles.resourceForkByTarget.${target}`);
}
expect(Array.isArray(baseline.triggerTables) && baseline.triggerTables.length > 0, "triggerTables must be a non-empty array");
for (const table of baseline.triggerTables) {
  expect(table && typeof table === "object" && !Array.isArray(table), "triggerTables entries must be objects");
  validateTopLevelFileName(table.path, "triggerTables path");
  expect(["land", "dungeon"].includes(table.levelType), `triggerTables levelType ${JSON.stringify(table.levelType)} must be land or dungeon`);
  expect(Number.isInteger(table.minimumLevels) && table.minimumLevels >= 0, `triggerTables minimumLevels for ${table.path} must be a non-negative integer`);
}
expect(new Set(baseline.triggerTables.map((table) => table.path)).size === baseline.triggerTables.length, "triggerTables paths must be unique");
expect(new Set(baseline.triggerTables.map((table) => table.levelType)).size === baseline.triggerTables.length, "triggerTables level types must be unique");
expect(baseline.triggerTables.some((table) => table.levelType === "land"), "triggerTables must define the land baseline");
expect(baseline.triggerTables.some((table) => table.levelType === "dungeon"), "triggerTables must define the dungeon baseline");
const optionalSemanticFiles = baseline.optionalSemanticFiles;
expect(Array.isArray(optionalSemanticFiles) && optionalSemanticFiles.length > 0, "optionalSemanticFiles must be a non-empty array");
expect(new Set(optionalSemanticFiles.map((file) => file.id)).size === optionalSemanticFiles.length, "optionalSemanticFiles ids must be unique");
expect(new Set(optionalSemanticFiles.map((file) => file.path)).size === optionalSemanticFiles.length, "optionalSemanticFiles paths must be unique");
for (const file of optionalSemanticFiles) {
  expect(file && typeof file === "object" && !Array.isArray(file), "optionalSemanticFiles entries must be objects");
  expect(typeof file.id === "string" && /^[a-z][A-Za-z0-9]*$/.test(file.id), `optionalSemanticFiles id ${JSON.stringify(file.id)} must be lower camel case`);
  validateTopLevelFileName(file.path, `optionalSemanticFiles.${file.id}.path`);
  validatePresence(file.presence, `optionalSemanticFiles.${file.id}.presence`);
}
const projectPathSemanticFiles = baseline.projectPathSemanticFiles;
expect(Array.isArray(projectPathSemanticFiles) && projectPathSemanticFiles.length > 0, "projectPathSemanticFiles must be a non-empty array");
expect(new Set(projectPathSemanticFiles.map((file) => file.id)).size === projectPathSemanticFiles.length, "projectPathSemanticFiles ids must be unique");
for (const file of projectPathSemanticFiles) {
  expect(file && typeof file === "object" && !Array.isArray(file), "projectPathSemanticFiles entries must be objects");
  expect(typeof file.id === "string" && /^[a-z][A-Za-z0-9]*$/.test(file.id), `projectPathSemanticFiles id ${JSON.stringify(file.id)} must be lower camel case`);
  const collectionSchema = projectSchemaNode(file.projectPath, `projectPathSemanticFiles.${file.id}.projectPath`);
  expect(collectionSchema.type === "array", `projectPathSemanticFiles.${file.id}.projectPath must identify an array in the canonical project schema`);
  const itemSchema = dereferenceSchemaNode(collectionSchema.items);
  const pathSchema = dereferenceSchemaNode(itemSchema?.properties?.[file.pathField]);
  expect(pathSchema?.type === "string", `projectPathSemanticFiles.${file.id}.pathField must identify a string on the canonical collection item`);
  validateProjectPathInclude(file.include, itemSchema, `projectPathSemanticFiles.${file.id}.include`);
}
const resourceSidecars = baseline.resourceSidecars;
expect(Array.isArray(resourceSidecars) && resourceSidecars.length > 0, "resourceSidecars must be a non-empty array");
expect(new Set(resourceSidecars.map((file) => file.id)).size === resourceSidecars.length, "resourceSidecars ids must be unique");
expect(new Set(resourceSidecars.map((file) => file.path)).size === resourceSidecars.length, "resourceSidecars paths must be unique");
for (const file of resourceSidecars) {
  expect(file && typeof file === "object" && !Array.isArray(file), "resourceSidecars entries must be objects");
  expect(typeof file.id === "string" && /^[a-z][A-Za-z0-9]*$/.test(file.id), `resourceSidecars id ${JSON.stringify(file.id)} must be lower camel case`);
  validateTopLevelFileName(file.path, `resourceSidecars.${file.id}.path`);
  expect(projectSchemaNode(file.projectPath, `resourceSidecars.${file.id}.projectPath`).type === "array", `resourceSidecars.${file.id}.projectPath must identify an array in the canonical project schema`);
  expect(file.emission === "semantic-updates", `resourceSidecars.${file.id}.emission must remain semantic-updates`);
}
const runtimeBaselineFiles = baseline.runtimeBaselineFiles;
expect(Array.isArray(runtimeBaselineFiles) && runtimeBaselineFiles.length > 0, "runtimeBaselineFiles must be a non-empty array");
expect(new Set(runtimeBaselineFiles.map((file) => file.id)).size === runtimeBaselineFiles.length, "runtimeBaselineFiles ids must be unique");
expect(new Set(runtimeBaselineFiles.map((file) => file.path)).size === runtimeBaselineFiles.length, "runtimeBaselineFiles paths must be unique");
for (const file of runtimeBaselineFiles) {
  expect(file && typeof file === "object" && !Array.isArray(file), "runtimeBaselineFiles entries must be objects");
  expect(typeof file.id === "string" && /^[a-z][A-Za-z0-9]*$/.test(file.id), `runtimeBaselineFiles id ${JSON.stringify(file.id)} must be lower camel case`);
  validateTopLevelFileName(file.path, `runtimeBaselineFiles.${file.id}.path`);
}
expect(!runtimeBaselineFiles.some((file) => baseline.triggerTables.some((table) => table.path === file.path)), "triggerTables paths must not also be classified as runtime baselines");
const fixedBaselinePaths = new Set([
  startupFiles.scenarioSupport,
  startupFiles.securityBackup,
  startupFiles.scenarioItems,
  startupFiles.tileSolids,
  ...Object.values(startupFiles.resourceForkByTarget),
  ...baseline.triggerTables.map((table) => table.path),
  ...runtimeBaselineFiles.map((file) => file.path)
]);
expect(!optionalSemanticFiles.some((file) => fixedBaselinePaths.has(file.path)), "optionalSemanticFiles paths must not also be fixed authored baseline paths");
expect(!resourceSidecars.some((file) => fixedBaselinePaths.has(file.path) || optionalSemanticFiles.some((semanticFile) => semanticFile.path === file.path)), "resourceSidecars paths must not overlap fixed or optional semantic paths");

const optionalSemanticFilePaths = Object.fromEntries(optionalSemanticFiles.map((file) => [file.id, file.path]));
const triggerTablePaths = Object.fromEntries(baseline.triggerTables.map((table) => [table.levelType, table.path]));
const typescriptOptionalPresence = optionalSemanticFiles.map((file) => [
  `  if (${typescriptPresenceExpression(file.presence)}) {`,
  `    paths.push(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.${file.id});`,
  "  }"
].join("\n")).join("\n");
const typescriptProjectPathExpectations = projectPathSemanticFiles.map((file) => {
  const access = typescriptProjectAccess(file.projectPath);
  return [
    `  for (const entry of (${access} ?? [])) {`,
    "    expectations.push({",
    `      familyId: ${JSON.stringify(file.id)},`,
    `      path: entry.${file.pathField},`,
    `      shouldExist: ${typescriptProjectPathIncludeExpression(file.include)}`,
    "    });",
    "  }"
  ].join("\n");
}).join("\n");
const resourceSidecarPaths = Object.fromEntries(resourceSidecars.map((file) => [file.id, file.path]));
const runtimeBaselineFilePaths = Object.fromEntries(runtimeBaselineFiles.map((file) => [file.id, file.path]));
const typescript = `// Generated by scripts/generate_realmz_native_manifest_policy.mjs; do not edit.\n\nimport type { Project } from "../types";\n\nexport const REALMZ_NATIVE_LAYOUT = ${JSON.stringify(generatedNativeLayout, null, 2)} as const;\n\nexport const AUTHORED_SCENARIO_ITEM_RECORDS = ${baseline.scenarioItemRecords} as const;\n\nexport const AUTHORED_STARTUP_FILES = ${JSON.stringify(startupFiles, null, 2)} as const;\n\nexport const AUTHORED_TRIGGER_TABLES = ${JSON.stringify(baseline.triggerTables, null, 2)} as const;\n\nexport const AUTHORED_TRIGGER_TABLE_PATHS = ${JSON.stringify(triggerTablePaths, null, 2)} as const;\n\nexport const AUTHORED_OPTIONAL_SEMANTIC_FILES = ${JSON.stringify(optionalSemanticFiles, null, 2)} as const;\n\nexport const AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS = ${JSON.stringify(optionalSemanticFilePaths, null, 2)} as const;\n\nexport function authoredOptionalSemanticFilePaths(project: Project): string[] {\n  const paths: string[] = [];\n${typescriptOptionalPresence}\n  return paths;\n}\n\nexport type AuthoredProjectPathSemanticFileExpectation = {\n  familyId: string;\n  path: string;\n  shouldExist: boolean;\n};\n\nexport function authoredProjectPathSemanticFileExpectations(project: Project): AuthoredProjectPathSemanticFileExpectation[] {\n  const expectations: AuthoredProjectPathSemanticFileExpectation[] = [];\n${typescriptProjectPathExpectations}\n  return expectations;\n}\n\nexport const AUTHORED_RESOURCE_SIDECAR_PATHS = ${JSON.stringify(resourceSidecarPaths, null, 2)} as const;\n\nexport const AUTHORED_RUNTIME_BASELINE_FILES = ${JSON.stringify(runtimeBaselineFiles, null, 2)} as const;\n\nexport const AUTHORED_RUNTIME_BASELINE_FILE_PATHS = ${JSON.stringify(runtimeBaselineFilePaths, null, 2)} as const;\n`;
const rustTriggerTables = baseline.triggerTables.map((table) => [
  "    AuthoredTriggerTablePolicy {",
  `        path: ${JSON.stringify(table.path)},`,
  `        level_type: ${JSON.stringify(table.levelType)},`,
  `        minimum_levels: ${table.minimumLevels},`,
  "    },"
].join("\n")).join("\n");
const rustRuntimeBaselineFiles = runtimeBaselineFiles.map((file) => `    ${JSON.stringify(file.path)},`).join("\n");
const rustOptionalSemanticFiles = optionalSemanticFiles.map((file) => [
  "    AuthoredOptionalSemanticFilePolicy {",
  `        id: ${JSON.stringify(file.id)},`,
  `        path: ${JSON.stringify(file.path)},`,
  `        project_path: ${JSON.stringify(file.presence.projectPath)},`,
  `        presence_kind: ${JSON.stringify(file.presence.kind)},`,
  `        match_field: ${rustOption(file.presence.field)},`,
  `        match_value: ${rustOption(file.presence.equals)},`,
  "    },"
].join("\n")).join("\n");
const rustOptionalPathFields = optionalSemanticFiles.map((file) => `    pub ${rustFieldName(file.id)}: &'static str,`).join("\n");
const rustOptionalPathValues = optionalSemanticFiles.map((file) => `        ${rustFieldName(file.id)}: ${JSON.stringify(file.path)},`).join("\n");
const rustOptionalPresence = optionalSemanticFiles.map((file) => {
  const expression = rustPresenceExpression(file.presence);
  return [
    expression.includes("\n") ? `    if ${expression}\n    {` : `    if ${expression} {`,
    `        paths.push(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.${rustFieldName(file.id)});`,
    "    }"
  ].join("\n");
}).join("\n");
const rustProjectPathExpectations = projectPathSemanticFiles.map((file) => {
  const access = rustProjectAccess(file.projectPath);
  return [
    `    for entry in &${access} {`,
    "        expectations.push(AuthoredProjectPathSemanticFileExpectation {",
    `            family_id: ${JSON.stringify(file.id)},`,
    `            path: entry.${rustFieldName(file.pathField)}.as_str(),`,
    `            should_exist: ${rustProjectPathIncludeExpression(file.include)},`,
    "        });",
    "    }"
  ].join("\n");
}).join("\n");
const rustResourceSidecarFields = resourceSidecars.map((file) => `    pub ${rustFieldName(file.id)}: &'static str,`).join("\n");
const rustResourceSidecarValues = resourceSidecars.map((file) => `        ${rustFieldName(file.id)}: ${JSON.stringify(file.path)},`).join("\n");
const rustRuntimeBaselineFields = runtimeBaselineFiles.map((file) => `    pub ${rustFieldName(file.id)}: &'static str,`).join("\n");
const rustRuntimeBaselineValues = runtimeBaselineFiles.map((file) => `        ${rustFieldName(file.id)}: ${JSON.stringify(file.path)},`).join("\n");
const rustNativeLayout = [
  "pub struct RealmzNativeLayout {",
  "    pub map_size: usize,",
  "    pub map_field_bytes: usize,",
  "    pub random_level_record_bytes: usize,",
  "    pub action_point_record_bytes: usize,",
  "    pub action_points_per_level: usize,",
  "    pub action_point_level_bytes: usize,",
  "    pub extra_code_record_bytes: usize,",
  "    pub simple_encounter_record_bytes: usize,",
  "    pub complex_encounter_record_bytes: usize,",
  "    pub thief_encounter_record_bytes: usize,",
  "    pub timed_encounter_record_bytes: usize,",
  "    pub battle_record_bytes: usize,",
  "    pub monster_record_bytes: usize,",
  "    pub monster_description_record_bytes: usize,",
  "    pub scenario_item_record_bytes: usize,",
  "    pub treasure_record_bytes: usize,",
  "    pub shop_record_bytes: usize,",
  "}",
  "",
  "pub const REALMZ_NATIVE_LAYOUT: RealmzNativeLayout = RealmzNativeLayout {",
  `    map_size: ${generatedNativeLayout.mapSize},`,
  `    map_field_bytes: ${generatedNativeLayout.mapFieldBytes},`,
  `    random_level_record_bytes: ${generatedNativeLayout.randomLevelRecordBytes},`,
  `    action_point_record_bytes: ${generatedNativeLayout.actionPointRecordBytes},`,
  `    action_points_per_level: ${generatedNativeLayout.actionPointsPerLevel},`,
  `    action_point_level_bytes: ${generatedNativeLayout.actionPointLevelBytes},`,
  `    extra_code_record_bytes: ${generatedNativeLayout.extraCodeRecordBytes},`,
  `    simple_encounter_record_bytes: ${generatedNativeLayout.simpleEncounterRecordBytes},`,
  `    complex_encounter_record_bytes: ${generatedNativeLayout.complexEncounterRecordBytes},`,
  `    thief_encounter_record_bytes: ${generatedNativeLayout.thiefEncounterRecordBytes},`,
  `    timed_encounter_record_bytes: ${generatedNativeLayout.timedEncounterRecordBytes},`,
  `    battle_record_bytes: ${generatedNativeLayout.battleRecordBytes},`,
  `    monster_record_bytes: ${generatedNativeLayout.monsterRecordBytes},`,
  `    monster_description_record_bytes: ${generatedNativeLayout.monsterDescriptionRecordBytes},`,
  `    scenario_item_record_bytes: ${generatedNativeLayout.scenarioItemRecordBytes},`,
  `    treasure_record_bytes: ${generatedNativeLayout.treasureRecordBytes},`,
  `    shop_record_bytes: ${generatedNativeLayout.shopRecordBytes},`,
  "};"
].join("\n");
const rust = `// Generated by scripts/generate_realmz_native_manifest_policy.mjs; do not edit.\n\npub const AUTHORED_SCENARIO_ITEM_RECORDS: usize = ${baseline.scenarioItemRecords};\n\npub struct AuthoredStartupFilePolicy {\n    pub scenario_support: &'static str,\n    pub security_backup: &'static str,\n    pub scenario_items: &'static str,\n    pub tile_solids: &'static str,\n    pub windows_resource_fork: &'static str,\n    pub mac_classic_resource_fork: &'static str,\n    pub providence_portable_resource_fork: &'static str,\n}\n\npub const AUTHORED_STARTUP_FILES: AuthoredStartupFilePolicy = AuthoredStartupFilePolicy {\n    scenario_support: ${JSON.stringify(startupFiles.scenarioSupport)},\n    security_backup: ${JSON.stringify(startupFiles.securityBackup)},\n    scenario_items: ${JSON.stringify(startupFiles.scenarioItems)},\n    tile_solids: ${JSON.stringify(startupFiles.tileSolids)},\n    windows_resource_fork: ${JSON.stringify(startupFiles.resourceForkByTarget["windows-realmz-folder"])},\n    mac_classic_resource_fork: ${JSON.stringify(startupFiles.resourceForkByTarget["mac-classic-folder"])},\n    providence_portable_resource_fork: ${JSON.stringify(startupFiles.resourceForkByTarget["providence-portable-folder"])},\n};\n\npub struct AuthoredTriggerTablePolicy {\n    pub path: &'static str,\n    pub level_type: &'static str,\n    pub minimum_levels: usize,\n}\n\n#[rustfmt::skip]\npub const AUTHORED_TRIGGER_TABLES: &[AuthoredTriggerTablePolicy] = &[\n${rustTriggerTables}\n];\n\npub struct AuthoredTriggerTablePaths {\n    pub land: &'static str,\n    pub dungeon: &'static str,\n}\n\npub const AUTHORED_TRIGGER_TABLE_PATHS: AuthoredTriggerTablePaths = AuthoredTriggerTablePaths {\n    land: ${JSON.stringify(triggerTablePaths.land)},\n    dungeon: ${JSON.stringify(triggerTablePaths.dungeon)},\n};\n\npub struct AuthoredOptionalSemanticFilePolicy {\n    pub id: &'static str,\n    pub path: &'static str,\n    pub project_path: &'static str,\n    pub presence_kind: &'static str,\n    pub match_field: Option<&'static str>,\n    pub match_value: Option<&'static str>,\n}\n\n#[rustfmt::skip]\npub const AUTHORED_OPTIONAL_SEMANTIC_FILES: &[AuthoredOptionalSemanticFilePolicy] = &[\n${rustOptionalSemanticFiles}\n];\n\npub struct AuthoredOptionalSemanticFilePaths {\n${rustOptionalPathFields}\n}\n\npub const AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS: AuthoredOptionalSemanticFilePaths =\n    AuthoredOptionalSemanticFilePaths {\n${rustOptionalPathValues}\n    };\n\npub fn authored_optional_semantic_file_paths(\n    project: &crate::project::ProvidenceProject,\n) -> Vec<&'static str> {\n    let mut paths = Vec::new();\n${rustOptionalPresence}\n    paths\n}\n\npub struct AuthoredProjectPathSemanticFileExpectation<'a> {\n    pub family_id: &'static str,\n    pub path: &'a str,\n    pub should_exist: bool,\n}\n\npub fn authored_project_path_semantic_file_expectations(\n    project: &crate::project::ProvidenceProject,\n) -> Vec<AuthoredProjectPathSemanticFileExpectation<'_>> {\n    let mut expectations = Vec::new();\n${rustProjectPathExpectations}\n    expectations\n}\n\npub struct AuthoredResourceSidecarPaths {\n${rustResourceSidecarFields}\n}\n\npub const AUTHORED_RESOURCE_SIDECAR_PATHS: AuthoredResourceSidecarPaths =\n    AuthoredResourceSidecarPaths {\n${rustResourceSidecarValues}\n    };\n\n#[rustfmt::skip]\npub const AUTHORED_RUNTIME_BASELINE_FILES: &[&str] = &[\n${rustRuntimeBaselineFiles}\n];\n\npub struct AuthoredRuntimeBaselineFilePaths {\n${rustRuntimeBaselineFields}\n}\n\npub const AUTHORED_RUNTIME_BASELINE_FILE_PATHS: AuthoredRuntimeBaselineFilePaths =\n    AuthoredRuntimeBaselineFilePaths {\n${rustRuntimeBaselineValues}\n    };\n`;

const rustWithNativeLayout = rust.replace(
  "pub const AUTHORED_SCENARIO_ITEM_RECORDS",
  `${rustNativeLayout}\n\npub const AUTHORED_SCENARIO_ITEM_RECORDS`
);
expect(rustWithNativeLayout !== rust, "Rust policy template is missing its native-layout insertion point");

writeOrCheck(typescriptPath, typescript);
writeOrCheck(rustPath, rustWithNativeLayout);

const browserBaselineSource = fs.readFileSync(browserBaselinePath, "utf8");
const browserScenarioPackageSource = fs.readFileSync(browserScenarioPackagePath, "utf8");
const rustExporterSource = fs.readFileSync(rustExporterPath, "utf8");
const nativeLayoutConsumers = [
  [browserBinaryWritersPath, ["REALMZ_NATIVE_LAYOUT"]],
  [browserParserPath, ["REALMZ_NATIVE_LAYOUT"]],
  [browserSemanticPath, ["SIMPLE_ENCOUNTER_BYTES", "COMPLEX_ENCOUNTER_BYTES", "THIEF_ENCOUNTER_BYTES", "TIMED_ENCOUNTER_BYTES", "BATTLE_BYTES", "MONSTER_BYTES", "MONSTER_DESCRIPTION_BYTES", "ITEM_BYTES", "TREASURE_BYTES", "SHOP_RECORD_BYTES"]],
  [browserShopRecordsPath, ["REALMZ_NATIVE_LAYOUT"]],
  [scenarioSeedMapCompilerPath, ["REALMZ_NATIVE_LAYOUT"]],
  [scenarioSeedScriptCompilerPath, ["REALMZ_NATIVE_LAYOUT"]],
  [scenarioSeedCoreRecordCompilerPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustProjectPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustMapsPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustRandomLevelsPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustActionPointsPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustEncountersPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustBattlesPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustCombatPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustEconomyPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustShopsPath, ["REALMZ_NATIVE_LAYOUT"]],
  [rustScenarioItemsPath, ["REALMZ_NATIVE_LAYOUT"]]
];
for (const [consumerPath, symbols] of nativeLayoutConsumers) {
  const source = fs.readFileSync(consumerPath, "utf8");
  for (const symbol of symbols) {
    expect(source.includes(symbol), `${path.relative(root, consumerPath)} must consume shared native layout through ${symbol}`);
  }
}
for (const symbol of ["AUTHORED_SCENARIO_ITEM_RECORDS", "AUTHORED_STARTUP_FILES", "AUTHORED_TRIGGER_TABLES", "AUTHORED_RUNTIME_BASELINE_FILES"]) {
  expect(browserBaselineSource.includes(symbol), `browser scenario baseline must consume ${symbol}`);
  expect(rustExporterSource.includes(symbol), `Rust scenario baseline must consume ${symbol}`);
}
expect(browserScenarioPackageSource.includes("AUTHORED_STARTUP_FILES"), "browser scenario package must consume AUTHORED_STARTUP_FILES for semantic overlays and target resource naming");
expect(browserScenarioPackageSource.includes("AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS"), "browser scenario package must consume AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS");
expect(rustExporterSource.includes("AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS"), "Rust scenario compiler must consume AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS");
expect(browserScenarioPackageSource.includes("authoredOptionalSemanticFilePaths"), "browser scenario package must enforce authored optional semantic presence predicates");
expect(rustExporterSource.includes("authored_optional_semantic_file_paths"), "Rust scenario compiler must enforce authored optional semantic presence predicates");
expect(browserScenarioPackageSource.includes("AUTHORED_TRIGGER_TABLE_PATHS"), "browser scenario package must consume authored trigger table paths for semantic overlays");
expect(rustExporterSource.includes("AUTHORED_TRIGGER_TABLE_PATHS"), "Rust scenario compiler must consume authored trigger table paths for semantic overlays");
expect(browserScenarioPackageSource.includes("authoredProjectPathSemanticFileExpectations"), "browser scenario package must enforce authored project-path semantic file predicates");
expect(rustExporterSource.includes("authored_project_path_semantic_file_expectations"), "Rust scenario compiler must enforce authored project-path semantic file predicates");
expect(browserScenarioPackageSource.includes("AUTHORED_RESOURCE_SIDECAR_PATHS"), "browser scenario package must consume authored resource sidecar paths");
expect(rustExporterSource.includes("AUTHORED_RESOURCE_SIDECAR_PATHS"), "Rust scenario compiler must consume authored resource sidecar paths");
expect(browserScenarioPackageSource.includes("AUTHORED_RUNTIME_BASELINE_FILE_PATHS"), "browser scenario package must consume authored runtime baseline paths for semantic overlays");
expect(rustExporterSource.includes("AUTHORED_RUNTIME_BASELINE_FILE_PATHS"), "Rust scenario compiler must consume authored runtime baseline paths for semantic overlays");
expect(!browserBaselineSource.includes("const EMPTY_RUNTIME_TABLES"), "browser scenario baseline must not redeclare empty runtime policy");
expect(!rustExporterSource.includes("const EMPTY_RUNTIME_TABLES"), "Rust scenario baseline must not redeclare empty runtime policy");

console.log(`${checkOnly ? "Realmz native manifest policy is current" : "Generated Realmz native manifest policy"} (contract v${policy.contractVersion}, shared native layout, 5 startup roles, ${baseline.triggerTables.length} trigger tables, ${optionalSemanticFiles.length} optional semantic files, ${projectPathSemanticFiles.length} project-path families, ${resourceSidecars.length} resource sidecars, ${runtimeBaselineFiles.length} runtime baseline files).`);

function writeOrCheck(filePath, content) {
  if (checkOnly) {
    const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
    expect(current === content, `${path.relative(root, filePath)} is stale; run npm run generate:realmz-native-manifest-policy`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function validateTopLevelFileName(fileName, label) {
  expect(typeof fileName === "string" && fileName.trim() === fileName && fileName.length > 0, `${label} must be a non-empty trimmed string`);
  expect(!fileName.includes("/") && !fileName.includes("\\"), `${label} ${JSON.stringify(fileName)} must be a top-level native filename`);
}

function validatePositiveInteger(value, label) {
  expect(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function validatePresence(presence, label) {
  expect(presence && typeof presence === "object" && !Array.isArray(presence), `${label} must be an object`);
  expect(["present", "collection-non-empty", "collection-match"].includes(presence.kind), `${label}.kind is unsupported`);
  const targetSchema = projectSchemaNode(presence.projectPath, `${label}.projectPath`);
  if (presence.kind === "present") {
    expect(presence.field === undefined && presence.equals === undefined, `${label} present predicates cannot define field or equals`);
    return;
  }
  expect(targetSchema.type === "array", `${label}.projectPath must identify an array in the canonical project schema`);
  if (presence.kind === "collection-non-empty") {
    expect(presence.field === undefined && presence.equals === undefined, `${label} collection-non-empty predicates cannot define field or equals`);
    return;
  }
  expect(typeof presence.field === "string" && presence.field.length > 0, `${label}.field must be a non-empty string`);
  expect(typeof presence.equals === "string" && presence.equals.length > 0, `${label}.equals must be a non-empty string`);
  const itemSchema = dereferenceSchemaNode(targetSchema.items);
  expect(itemSchema?.properties?.[presence.field], `${label}.field ${JSON.stringify(presence.field)} is not present on the canonical collection item`);
}

function validateProjectPathInclude(include, itemSchema, label) {
  expect(include && typeof include === "object" && !Array.isArray(include), `${label} must be an object`);
  expect(["field-truthy", "field-collection-non-empty"].includes(include.kind), `${label}.kind is unsupported`);
  expect(typeof include.field === "string" && include.field.length > 0, `${label}.field must be a non-empty string`);
  const fieldSchema = dereferenceSchemaNode(itemSchema?.properties?.[include.field]);
  expect(fieldSchema, `${label}.field ${JSON.stringify(include.field)} is not present on the canonical collection item`);
  if (include.kind === "field-truthy") {
    expect(fieldSchema.type === "boolean", `${label}.field must identify a boolean for field-truthy`);
  } else {
    expect(fieldSchema.type === "array", `${label}.field must identify an array for field-collection-non-empty`);
  }
}

function projectSchemaNode(projectPath, label) {
  expect(typeof projectPath === "string" && /^\/(?:[A-Za-z0-9]+)(?:\/[A-Za-z0-9]+)*$/.test(projectPath), `${label} must be a canonical JSON pointer`);
  let node = projectSchema;
  for (const segment of projectPath.slice(1).split("/")) {
    node = dereferenceSchemaNode(node);
    expect(node?.properties?.[segment], `${label} segment ${JSON.stringify(segment)} is not present in the canonical project schema`);
    node = node.properties[segment];
  }
  return dereferenceSchemaNode(node);
}

function dereferenceSchemaNode(node) {
  let current = node;
  const seen = new Set();
  while (current?.$ref) {
    expect(typeof current.$ref === "string" && current.$ref.startsWith("#/$defs/"), `unsupported canonical schema reference ${JSON.stringify(current.$ref)}`);
    expect(!seen.has(current.$ref), `cyclic canonical schema reference ${current.$ref}`);
    seen.add(current.$ref);
    current = projectSchema.$defs[current.$ref.slice("#/$defs/".length)];
    expect(current, `missing canonical schema definition ${node.$ref}`);
  }
  return current;
}

function rustFieldName(id) {
  return id.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function rustOption(value) {
  return value === undefined ? "None" : `Some(${JSON.stringify(value)})`;
}

function typescriptPresenceExpression(presence) {
  const access = typescriptProjectAccess(presence.projectPath);
  if (presence.kind === "present") return `${access} != null`;
  if (presence.kind === "collection-non-empty") return `${access}.length > 0`;
  return `${access}.some((entry) => entry.${presence.field} === ${JSON.stringify(presence.equals)})`;
}

function typescriptProjectAccess(projectPath) {
  return `project${projectPath.split("/").slice(1).map((segment) => `.${segment}`).join("")}`;
}

function typescriptProjectPathIncludeExpression(include) {
  const access = `entry.${include.field}`;
  return include.kind === "field-truthy" ? `Boolean(${access})` : `${access}.length > 0`;
}

function rustPresenceExpression(presence) {
  const segments = presence.projectPath.split("/").slice(1).map(rustFieldName);
  const access = `project${segments.map((segment) => `.${segment}`).join("")}`;
  if (presence.kind === "present") return `${access}.is_some()`;
  if (presence.kind === "collection-non-empty") return `!${access}.is_empty()`;
  const field = rustFieldName(presence.field);
  const value = presence.field === "levelType"
    ? `crate::project::LevelType::${presence.equals[0].toUpperCase()}${presence.equals.slice(1)}`
    : JSON.stringify(presence.equals);
  return `project\n        ${segments.map((segment) => `.${segment}`).join("\n        ")}\n        .iter()\n        .any(|entry| entry.${field} == ${value})`;
}

function rustProjectAccess(projectPath) {
  return `project${projectPath.split("/").slice(1).map((segment) => `.${rustFieldName(segment)}`).join("")}`;
}

function rustProjectPathIncludeExpression(include) {
  const access = `entry.${rustFieldName(include.field)}`;
  return include.kind === "field-truthy" ? access : `!${access}.is_empty()`;
}
