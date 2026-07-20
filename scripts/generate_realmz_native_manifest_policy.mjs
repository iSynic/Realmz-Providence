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
const rustExporterPath = path.join(root, "src-tauri", "src", "exporter.rs");
const checkOnly = process.argv.includes("--check");

const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
const projectSchema = JSON.parse(fs.readFileSync(projectSchemaPath, "utf8"));
const baseline = policy.authoredBaseline;

expect(Number.isInteger(policy.contractVersion) && policy.contractVersion > 0, "contractVersion must be a positive integer");
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
expect(Array.isArray(baseline.emptyRuntimeFiles) && baseline.emptyRuntimeFiles.length > 0, "emptyRuntimeFiles must be a non-empty array");
expect(new Set(baseline.emptyRuntimeFiles).size === baseline.emptyRuntimeFiles.length, "emptyRuntimeFiles must not contain duplicates");
for (const fileName of baseline.emptyRuntimeFiles) {
  validateTopLevelFileName(fileName, "emptyRuntimeFiles entry");
}
expect(!baseline.emptyRuntimeFiles.some((fileName) => baseline.triggerTables.some((table) => table.path === fileName)), "triggerTables paths must not also be classified as always empty");
const fixedBaselinePaths = new Set([
  startupFiles.scenarioSupport,
  startupFiles.securityBackup,
  startupFiles.scenarioItems,
  startupFiles.tileSolids,
  ...Object.values(startupFiles.resourceForkByTarget),
  ...baseline.triggerTables.map((table) => table.path),
  ...baseline.emptyRuntimeFiles
]);
expect(!optionalSemanticFiles.some((file) => fixedBaselinePaths.has(file.path)), "optionalSemanticFiles paths must not also be fixed authored baseline paths");

const optionalSemanticFilePaths = Object.fromEntries(optionalSemanticFiles.map((file) => [file.id, file.path]));
const typescriptOptionalPresence = optionalSemanticFiles.map((file) => [
  `  if (${typescriptPresenceExpression(file.presence)}) {`,
  `    paths.push(AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS.${file.id});`,
  "  }"
].join("\n")).join("\n");
const typescript = `// Generated by scripts/generate_realmz_native_manifest_policy.mjs; do not edit.\n\nimport type { Project } from "../types";\n\nexport const AUTHORED_SCENARIO_ITEM_RECORDS = ${baseline.scenarioItemRecords} as const;\n\nexport const AUTHORED_STARTUP_FILES = ${JSON.stringify(startupFiles, null, 2)} as const;\n\nexport const AUTHORED_TRIGGER_TABLES = ${JSON.stringify(baseline.triggerTables, null, 2)} as const;\n\nexport const AUTHORED_OPTIONAL_SEMANTIC_FILES = ${JSON.stringify(optionalSemanticFiles, null, 2)} as const;\n\nexport const AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS = ${JSON.stringify(optionalSemanticFilePaths, null, 2)} as const;\n\nexport function authoredOptionalSemanticFilePaths(project: Project): string[] {\n  const paths: string[] = [];\n${typescriptOptionalPresence}\n  return paths;\n}\n\nexport const AUTHORED_EMPTY_RUNTIME_FILES = ${JSON.stringify(baseline.emptyRuntimeFiles, null, 2)} as const;\n`;
const rustTriggerTables = baseline.triggerTables.map((table) => [
  "    AuthoredTriggerTablePolicy {",
  `        path: ${JSON.stringify(table.path)},`,
  `        level_type: ${JSON.stringify(table.levelType)},`,
  `        minimum_levels: ${table.minimumLevels},`,
  "    },"
].join("\n")).join("\n");
const rustFiles = baseline.emptyRuntimeFiles.map((fileName) => `    ${JSON.stringify(fileName)},`).join("\n");
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
const rust = `// Generated by scripts/generate_realmz_native_manifest_policy.mjs; do not edit.\n\npub const AUTHORED_SCENARIO_ITEM_RECORDS: usize = ${baseline.scenarioItemRecords};\n\npub struct AuthoredStartupFilePolicy {\n    pub scenario_support: &'static str,\n    pub security_backup: &'static str,\n    pub scenario_items: &'static str,\n    pub tile_solids: &'static str,\n    pub windows_resource_fork: &'static str,\n    pub mac_classic_resource_fork: &'static str,\n    pub providence_portable_resource_fork: &'static str,\n}\n\npub const AUTHORED_STARTUP_FILES: AuthoredStartupFilePolicy = AuthoredStartupFilePolicy {\n    scenario_support: ${JSON.stringify(startupFiles.scenarioSupport)},\n    security_backup: ${JSON.stringify(startupFiles.securityBackup)},\n    scenario_items: ${JSON.stringify(startupFiles.scenarioItems)},\n    tile_solids: ${JSON.stringify(startupFiles.tileSolids)},\n    windows_resource_fork: ${JSON.stringify(startupFiles.resourceForkByTarget["windows-realmz-folder"])},\n    mac_classic_resource_fork: ${JSON.stringify(startupFiles.resourceForkByTarget["mac-classic-folder"])},\n    providence_portable_resource_fork: ${JSON.stringify(startupFiles.resourceForkByTarget["providence-portable-folder"])},\n};\n\npub struct AuthoredTriggerTablePolicy {\n    pub path: &'static str,\n    pub level_type: &'static str,\n    pub minimum_levels: usize,\n}\n\n#[rustfmt::skip]\npub const AUTHORED_TRIGGER_TABLES: &[AuthoredTriggerTablePolicy] = &[\n${rustTriggerTables}\n];\n\npub struct AuthoredOptionalSemanticFilePolicy {\n    pub id: &'static str,\n    pub path: &'static str,\n    pub project_path: &'static str,\n    pub presence_kind: &'static str,\n    pub match_field: Option<&'static str>,\n    pub match_value: Option<&'static str>,\n}\n\n#[rustfmt::skip]\npub const AUTHORED_OPTIONAL_SEMANTIC_FILES: &[AuthoredOptionalSemanticFilePolicy] = &[\n${rustOptionalSemanticFiles}\n];\n\npub struct AuthoredOptionalSemanticFilePaths {\n${rustOptionalPathFields}\n}\n\npub const AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS: AuthoredOptionalSemanticFilePaths =\n    AuthoredOptionalSemanticFilePaths {\n${rustOptionalPathValues}\n    };\n\npub fn authored_optional_semantic_file_paths(\n    project: &crate::project::ProvidenceProject,\n) -> Vec<&'static str> {\n    let mut paths = Vec::new();\n${rustOptionalPresence}\n    paths\n}\n\n#[rustfmt::skip]\npub const AUTHORED_EMPTY_RUNTIME_FILES: &[&str] = &[\n${rustFiles}\n];\n`;

writeOrCheck(typescriptPath, typescript);
writeOrCheck(rustPath, rust);

const browserBaselineSource = fs.readFileSync(browserBaselinePath, "utf8");
const browserScenarioPackageSource = fs.readFileSync(browserScenarioPackagePath, "utf8");
const rustExporterSource = fs.readFileSync(rustExporterPath, "utf8");
for (const symbol of ["AUTHORED_SCENARIO_ITEM_RECORDS", "AUTHORED_STARTUP_FILES", "AUTHORED_TRIGGER_TABLES", "AUTHORED_EMPTY_RUNTIME_FILES"]) {
  expect(browserBaselineSource.includes(symbol), `browser scenario baseline must consume ${symbol}`);
  expect(rustExporterSource.includes(symbol), `Rust scenario baseline must consume ${symbol}`);
}
expect(browserScenarioPackageSource.includes("AUTHORED_STARTUP_FILES"), "browser scenario package must consume AUTHORED_STARTUP_FILES for semantic overlays and target resource naming");
expect(browserScenarioPackageSource.includes("AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS"), "browser scenario package must consume AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS");
expect(rustExporterSource.includes("AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS"), "Rust scenario compiler must consume AUTHORED_OPTIONAL_SEMANTIC_FILE_PATHS");
expect(browserScenarioPackageSource.includes("authoredOptionalSemanticFilePaths"), "browser scenario package must enforce authored optional semantic presence predicates");
expect(rustExporterSource.includes("authored_optional_semantic_file_paths"), "Rust scenario compiler must enforce authored optional semantic presence predicates");
expect(!browserBaselineSource.includes("const EMPTY_RUNTIME_TABLES"), "browser scenario baseline must not redeclare empty runtime policy");
expect(!rustExporterSource.includes("const EMPTY_RUNTIME_TABLES"), "Rust scenario baseline must not redeclare empty runtime policy");

console.log(`${checkOnly ? "Realmz native manifest policy is current" : "Generated Realmz native manifest policy"} (contract v${policy.contractVersion}, 5 startup roles, ${baseline.triggerTables.length} trigger tables, ${optionalSemanticFiles.length} optional semantic files, ${baseline.emptyRuntimeFiles.length} empty runtime files).`);

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
  const access = `project${presence.projectPath.split("/").slice(1).map((segment) => `.${segment}`).join("")}`;
  if (presence.kind === "present") return `${access} != null`;
  if (presence.kind === "collection-non-empty") return `${access}.length > 0`;
  return `${access}.some((entry) => entry.${presence.field} === ${JSON.stringify(presence.equals)})`;
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
