import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "schemas", "providence-project.schema.json");
const typesPath = path.join(root, "src", "editor", "types.ts");
const projectOriginPath = path.join(root, "src", "editor", "projectOrigin.ts");
const rustProjectPath = path.join(root, "src-tauri", "src", "project.rs");
const rustImporterPath = path.join(root, "src-tauri", "src", "importer.rs");
const tsOutputPath = path.join(root, "src", "editor", "generated", "providenceProjectContract.ts");
const rustOutputPath = path.join(root, "src-tauri", "src", "generated", "project_contract.rs");
const checkOnly = process.argv.includes("--check");

const [schemaText, typesSource, projectOriginSource, rustProjectSource, rustImporterSource] = await Promise.all([
  fs.readFile(schemaPath, "utf8"),
  fs.readFile(typesPath, "utf8"),
  fs.readFile(projectOriginPath, "utf8"),
  fs.readFile(rustProjectPath, "utf8"),
  fs.readFile(rustImporterPath, "utf8")
]);
const schema = JSON.parse(schemaText);
const failures = [];

expect(schema.$schema === "https://json-schema.org/draft/2020-12/schema", "project schema must use JSON Schema draft 2020-12");
expect(schema.type === "object", "project schema root must be an object");
expect(schema.additionalProperties === false, "project schema root must reject unknown top-level fields");
expect(schema["x-providence-contract-scope"] === "persisted-project-top-level", "project schema must declare its bounded top-level scope");

const projectFields = Object.keys(schema.properties ?? {});
const requiredFields = schema.required ?? [];
const derivedFields = schema["x-providence-derived-fields"] ?? [];
const schemaVersion = schema.properties?.schemaVersion?.const;
const sourceSchema = schema.$defs?.source ?? {};
const sourceFileSchema = schema.$defs?.sourceFile ?? {};
const projectOriginSchema = schema.$defs?.projectOrigin ?? {};
const sourceFileRoleSchema = schema.$defs?.sourceFileRole ?? {};
const sourceFields = Object.keys(sourceSchema.properties ?? {});
const sourceFileFields = Object.keys(sourceFileSchema.properties ?? {});
const sourceRuntimeOptionalFields = sourceSchema["x-providence-runtime-optional"] ?? [];
const projectOriginValues = projectOriginSchema.enum ?? [];
const sourceFileRoleValues = sourceFileRoleSchema.enum ?? [];
const scenarioDefinitionNames = [
  "scenarioShell",
  "scenarioSupportFile",
  "scenarioContactInfo",
  "scenarioRestrictions",
  "globalMacroHook",
  "scenarioGlobalMacroHooks",
  "scenarioMeta"
];
const scenarioDefinitions = scenarioDefinitionNames.map((name) => schema.$defs?.[name] ?? {});
const scenarioMetaSchema = schema.$defs?.scenarioMeta ?? {};

expect(Number.isInteger(schemaVersion) && schemaVersion > 0, "schemaVersion must be a positive integer const");
expect(projectFields.length >= 35, "project schema field inventory is unexpectedly small");
expect(sameArray(projectFields, requiredFields), "all persisted top-level fields must be required and preserve canonical serializer order");
expect(sameArray(derivedFields, ["semanticSchema"]), "semanticSchema must be the sole declared derived field");
expect(!projectFields.includes("semanticSchema"), "semanticSchema is derived and must not be persisted");
expect(schema.properties?.source?.$ref === "#/$defs/source", "project source must reference the canonical source DTO");
expect(sourceSchema.additionalProperties === false, "source contract must reject unknown fields");
expect(sameArray(sourceFields, sourceSchema.required ?? []), "all persisted source fields must be required and preserve canonical order");
expect(sameArray(sourceRuntimeOptionalFields, ["origin"]), "origin must be the sole migration-optional runtime source field");
expect(sourceSchema.properties?.origin?.$ref === "#/$defs/projectOrigin", "source origin must reference the canonical origin enum");
expect(sameArray(projectOriginValues, ["authored", "imported"]), "source origin must distinguish authored projects from imported compatibility projects");
expect(sourceFileSchema.additionalProperties === false, "source-file contract must reject unknown fields");
expect(sameArray(sourceFileFields, sourceFileSchema.required ?? []), "all source-file fields must be required and preserve canonical order");
expect(sourceFileSchema.properties?.role?.$ref === "#/$defs/sourceFileRole", "source-file role must reference the canonical role enum");
expect(sameArray(sourceFileRoleValues, ["supported-binary", "pass-through", "resource-fork", "unknown"]), "source-file roles must match the importer compatibility vocabulary");
expect(schema.properties?.scenario?.$ref === "#/$defs/scenarioMeta", "project scenario must reference the canonical scenario DTO");
expect(sameArray(scenarioMetaSchema.required ?? [], ["name", "projectPath", "importedAt"]), "scenario identity must require name, projectPath, and importedAt");
for (const [index, definition] of scenarioDefinitions.entries()) {
  const definitionName = scenarioDefinitionNames[index];
  expect(definition.type === "object", `${definitionName} must be an object schema`);
  expect(definition.additionalProperties === false, `${definitionName} must reject unknown fields`);
  expect(typeof definition["x-providence-typescript-name"] === "string", `${definitionName} must declare its TypeScript name`);
  expect(typeof definition["x-providence-rust-name"] === "string", `${definitionName} must declare its Rust name`);
}
expect(Object.hasOwn(schema.$defs?.scenarioShell?.properties ?? {}, "rawBytes"), "scenarioShell must expose imported rawBytes as compatibility-only data");
const compatibilityScenarioFields = scenarioDefinitions.flatMap((definition) =>
  Object.entries(definition.properties ?? {})
    .filter(([, property]) => property["x-providence-compatibility-only"] === true)
    .map(([field]) => `${definition["x-providence-rust-name"]}.${field}`)
);
expectSameSet(compatibilityScenarioFields, [
  "ScenarioShell.trailingBytes",
  "ScenarioShell.rawBytes",
  "ScenarioSupportFile.rawBytes",
  "ScenarioContactInfo.rawBytes",
  "ScenarioRestrictions.rawBytes",
  "ScenarioGlobalMacroHooks.rawBytes"
], "Scenario compatibility-only field inventory");

const tsProjectFields = extractFields(typesSource, "export type Project =", /^  ([A-Za-z][A-Za-z0-9]*)(?:\?)?:/gm);
const rustProjectFields = extractFields(rustProjectSource, "pub struct ProvidenceProject", /^    pub ([a-z][a-z0-9_]*):/gm).map(snakeToCamel);
const rustProjectFileFields = extractFields(rustImporterSource, "struct ProjectFile<'a>", /^    ([a-z][a-z0-9_]*):/gm).map(snakeToCamel);
const canonicalModelFields = [...projectFields, ...derivedFields];

expectSameSet(tsProjectFields, canonicalModelFields, "TypeScript Project");
expectSameSet(rustProjectFields, canonicalModelFields, "Rust ProvidenceProject");
expectSameArray(rustProjectFileFields, projectFields, "Rust ProjectFile serializer");

for (const alias of [
  "export type ProjectOrigin = ProvidenceProjectOrigin;",
  "export type ProjectSource = ProvidenceProjectSource;",
  "export type SourceFile = ProvidenceSourceFile;",
  "export type SourceFileRole = ProvidenceSourceFileRole;",
  "export type ScenarioMeta = ProvidenceScenarioMeta;",
  "export type ScenarioShell = ProvidenceScenarioShell;",
  "export type ScenarioSupportFile = ProvidenceScenarioSupportFile;",
  "export type ScenarioContactInfo = ProvidenceScenarioContactInfo;",
  "export type ScenarioRestrictions = ProvidenceScenarioRestrictions;",
  "export type GlobalMacroHook = ProvidenceGlobalMacroHook;",
  "export type ScenarioGlobalMacroHooks = ProvidenceScenarioGlobalMacroHooks;"
]) {
  expect(typesSource.includes(alias), `types.ts must consume generated source contract alias: ${alias}`);
}
expect(typesSource.includes('from "./generated/providenceProjectContract";'), "types.ts must import the generated source DTOs");
expect(!typesSource.includes('export type ProjectOrigin = "authored"'), "types.ts must not handwrite ProjectOrigin");
expect(!typesSource.includes("export type ProjectSource = {"), "types.ts must not handwrite ProjectSource");
expect(!typesSource.includes("export type SourceFile = {"), "types.ts must not handwrite SourceFile");
for (const scenarioType of ["ScenarioMeta", "ScenarioShell", "ScenarioSupportFile", "ScenarioContactInfo", "ScenarioRestrictions", "GlobalMacroHook", "ScenarioGlobalMacroHooks"]) {
  expect(!typesSource.includes(`export type ${scenarioType} = {`), `types.ts must not handwrite ${scenarioType}`);
}

const rustGeneratedReExports = [...rustProjectSource.matchAll(/pub use crate::generated::project_contract::\{([\s\S]*?)\};/g)]
  .flatMap((match) => match[1].split(",").map((value) => value.trim()).filter(Boolean));
expect(rustGeneratedReExports.length > 0, "project.rs must re-export the generated project DTOs");
expectSameSet(rustGeneratedReExports, [
  "GlobalMacroHook",
  "ProjectOrigin",
  "ScenarioContactInfo",
  "ScenarioGlobalMacroHooks",
  "ScenarioMeta",
  "ScenarioRestrictions",
  "ScenarioShell",
  "ScenarioSupportFile",
  "SourceFile",
  "SourceFileRole",
  "SourceSnapshot"
], "Rust generated project re-export");
expect(!rustProjectSource.includes("pub struct SourceSnapshot {"), "project.rs must not handwrite SourceSnapshot");
expect(!rustProjectSource.includes("pub enum ProjectOrigin {"), "project.rs must not handwrite ProjectOrigin");
expect(!rustProjectSource.includes("pub struct SourceFile {"), "project.rs must not handwrite SourceFile");
expect(!rustProjectSource.includes("pub enum SourceFileRole {"), "project.rs must not handwrite SourceFileRole");
for (const scenarioType of ["ScenarioMeta", "ScenarioShell", "ScenarioSupportFile", "ScenarioContactInfo", "ScenarioRestrictions", "GlobalMacroHook", "ScenarioGlobalMacroHooks"]) {
  expect(!rustProjectSource.includes(`pub struct ${scenarioType} {`), `project.rs must not handwrite ${scenarioType}`);
}

const tsOutput = renderTypeScript(schemaVersion, projectFields, derivedFields, sourceSchema, sourceFileSchema, projectOriginSchema, sourceFileRoleSchema, scenarioDefinitions);
const rustOutput = renderRust(schemaVersion, projectFields, derivedFields, sourceSchema, sourceFileSchema, projectOriginSchema, sourceFileRoleSchema, scenarioDefinitions);
const tsImport = 'import { PROVIDENCE_PROJECT_SCHEMA_VERSION } from "./generated/providenceProjectContract";';
const tsAlias = "export const PROJECT_SCHEMA_VERSION = PROVIDENCE_PROJECT_SCHEMA_VERSION;";
expect(projectOriginSource.includes(tsImport), "projectOrigin.ts must consume the generated TypeScript schema version");
expect(projectOriginSource.includes(tsAlias), "projectOrigin.ts must re-export the generated TypeScript schema version");
expect(rustProjectSource.includes("pub const PROJECT_SCHEMA_VERSION: u32 ="), "project.rs must expose PROJECT_SCHEMA_VERSION");
expect(rustProjectSource.includes("crate::generated::project_contract::PROVIDENCE_PROJECT_SCHEMA_VERSION"), "project.rs must consume the generated Rust schema version");

if (checkOnly) {
  await expectGeneratedFile(tsOutputPath, tsOutput);
  await expectGeneratedFile(rustOutputPath, rustOutput);
} else if (failures.length === 0) {
  await Promise.all([
    writeGeneratedFile(tsOutputPath, tsOutput),
    writeGeneratedFile(rustOutputPath, rustOutput)
  ]);
}

if (failures.length > 0) {
  console.error("Providence project contract check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(checkOnly
  ? `Providence project contract is current (schema v${schemaVersion}, ${projectFields.length} persisted fields).`
  : `Generated Providence project contract (schema v${schemaVersion}, ${projectFields.length} persisted fields).`);

function extractFields(source, marker, fieldPattern) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    failures.push(`cannot find ${marker}`);
    return [];
  }
  const openIndex = source.indexOf("{", markerIndex);
  if (openIndex < 0) {
    failures.push(`cannot find opening brace for ${marker}`);
    return [];
  }
  let depth = 0;
  let closeIndex = -1;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        closeIndex = index;
        break;
      }
    }
  }
  if (closeIndex < 0) {
    failures.push(`cannot find closing brace for ${marker}`);
    return [];
  }
  return [...source.slice(openIndex + 1, closeIndex).matchAll(fieldPattern)].map((match) => match[1]);
}

function snakeToCamel(value) {
  return value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function expectSameSet(actual, expected, label) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((field) => !actualSet.has(field));
  const extra = actual.filter((field) => !expectedSet.has(field));
  expect(actual.length === actualSet.size, `${label} contains duplicate top-level fields`);
  expect(missing.length === 0, `${label} is missing canonical field(s): ${missing.join(", ")}`);
  expect(extra.length === 0, `${label} contains non-canonical field(s): ${extra.join(", ")}`);
}

function expectSameArray(actual, expected, label) {
  expect(sameArray(actual, expected), `${label} order differs from the canonical persisted field inventory\n  expected: ${expected.join(", ")}\n  actual:   ${actual.join(", ")}`);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function renderTypeScript(version, fields, derived, source, sourceFile, projectOrigin, sourceFileRole, scenarioTypes) {
  const runtimeSourceName = source["x-providence-typescript-name"];
  const persistedSourceName = source["x-providence-typescript-persisted-name"];
  const sourceFileName = sourceFile["x-providence-typescript-name"];
  const runtimeOptional = new Set(source["x-providence-runtime-optional"] ?? []);
  return `// Generated by scripts/generate_providence_project_contract.mjs; do not edit.\n` +
    `// Source: schemas/providence-project.schema.json\n\n` +
    `export const PROVIDENCE_PROJECT_SCHEMA_VERSION = ${version} as const;\n\n` +
    `export const PROVIDENCE_PROJECT_FIELDS = ${JSON.stringify(fields, null, 2)} as const;\n\n` +
    `export const PROVIDENCE_DERIVED_PROJECT_FIELDS = ${JSON.stringify(derived, null, 2)} as const;\n\n` +
    `export const PROVIDENCE_PROJECT_SOURCE_FIELDS = ${JSON.stringify(Object.keys(source.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SOURCE_FILE_FIELDS = ${JSON.stringify(Object.keys(sourceFile.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SCENARIO_FIELDS = ${JSON.stringify(Object.keys(scenarioMetaSchema.properties ?? {}), null, 2)} as const;\n\n` +
    renderTypeScriptEnum(projectOrigin) + `\n` +
    renderTypeScriptEnum(sourceFileRole) + `\n` +
    renderTypeScriptObject(sourceFileName, sourceFile, new Set()) + `\n` +
    renderTypeScriptObject(persistedSourceName, source, new Set()) + `\n` +
    `/** Migration-tolerant runtime form; persisted schema-v5 projects require origin. */\n` +
    renderTypeScriptObject(runtimeSourceName, source, runtimeOptional) + `\n` +
    scenarioTypes.map((definition) => renderTypeScriptObject(
      definition["x-providence-typescript-name"],
      definition,
      optionalFieldsFromSchema(definition)
    )).join("\n") + `\n` +
    `export type ProvidencePersistedProjectField = typeof PROVIDENCE_PROJECT_FIELDS[number];\n` +
    `export type ProvidenceDerivedProjectField = typeof PROVIDENCE_DERIVED_PROJECT_FIELDS[number];\n`;
}

function renderRust(version, fields, derived, source, sourceFile, projectOrigin, sourceFileRole, scenarioTypes) {
  const renderArray = (values) => values.map((value) => `    ${JSON.stringify(value)},`).join("\n");
  const renderCompactArray = (values) => values.map((value) => JSON.stringify(value)).join(", ");
  return `// Generated by scripts/generate_providence_project_contract.mjs; do not edit.\n` +
    `// Source: schemas/providence-project.schema.json\n\n` +
    `use serde::{Deserialize, Serialize};\n\n` +
    `pub const PROVIDENCE_PROJECT_SCHEMA_VERSION: u32 = ${version};\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_PROJECT_FIELDS: &[&str] = &[\n${renderArray(fields)}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_DERIVED_PROJECT_FIELDS: &[&str] = &[${renderCompactArray(derived)}];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_PROJECT_SOURCE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(source.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SOURCE_FILE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(sourceFile.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SCENARIO_FIELDS: &[&str] = &[\n${renderArray(Object.keys(scenarioMetaSchema.properties ?? {}))}\n];\n\n` +
    renderRustEnum(projectOrigin) + `\n` +
    renderRustEnum(sourceFileRole) + `\n` +
    renderRustStruct(sourceFile) + `\n` +
    renderRustStruct(source) + `\n` +
    scenarioTypes.map(renderRustStruct).join("\n");
}

function renderTypeScriptEnum(definition) {
  const name = definition["x-providence-typescript-name"];
  const values = definition.enum ?? [];
  return `export type ${name} = ${values.map((value) => JSON.stringify(value)).join(" | ")};\n`;
}

function renderTypeScriptObject(name, definition, optionalFields) {
  const lines = Object.entries(definition.properties ?? {}).map(([field, property]) =>
    `  ${field}${optionalFields.has(field) ? "?" : ""}: ${typeScriptType(property)};`
  );
  return `export type ${name} = {\n${lines.join("\n")}\n};\n`;
}

function typeScriptType(property) {
  if (Array.isArray(property.oneOf)) {
    return [...new Set(property.oneOf.map(typeScriptType))].join(" | ");
  }
  const refName = definitionName(property.$ref);
  if (refName) {
    const definition = schema.$defs?.[refName];
    return definition?.["x-providence-typescript-name"] ?? "unknown";
  }
  if (property.type === "string") return "string";
  if (property.type === "integer" || property.type === "number") return "number";
  if (property.type === "boolean") return "boolean";
  if (property.type === "null") return "null";
  if (property.type === "array") return `${typeScriptType(property.items ?? {})}[]`;
  return "unknown";
}

function renderRustEnum(definition) {
  const name = definition["x-providence-rust-name"];
  const derives = definition["x-providence-rust-derives"] ?? ["Debug", "Clone", "Serialize", "Deserialize"];
  const variants = (definition.enum ?? []).map((value) => `    ${kebabToPascal(value)},`).join("\n");
  return `#[derive(${derives.join(", ")})]\n#[serde(rename_all = "kebab-case")]\npub enum ${name} {\n${variants}\n}\n`;
}

function renderRustStruct(definition) {
  const name = definition["x-providence-rust-name"];
  const optionalFields = new Set([
    ...(definition["x-providence-runtime-optional"] ?? []),
    ...(definition["x-providence-rust-optional"] ?? [])
  ]);
  const defaultFields = new Set(definition["x-providence-rust-default"] ?? []);
  const skipNoneFields = new Set(definition["x-providence-rust-skip-none"] ?? []);
  const fields = Object.entries(definition.properties ?? {}).flatMap(([field, property]) => {
    const rustType = rustPropertyType(property);
    const lines = [];
    if (optionalFields.has(field)) {
      lines.push(skipNoneFields.has(field)
        ? '    #[serde(default, skip_serializing_if = "Option::is_none")]'
        : "    #[serde(default)]");
    } else if (defaultFields.has(field)) {
      lines.push("    #[serde(default)]");
    }
    lines.push(`    pub ${camelToSnake(field)}: ${optionalFields.has(field) ? `Option<${rustType}>` : rustType},`);
    return lines;
  });
  return `#[derive(Debug, Clone, Serialize, Deserialize)]\n#[serde(rename_all = "camelCase")]\npub struct ${name} {\n${fields.join("\n")}\n}\n`;
}

function rustPropertyType(property) {
  if (property["x-providence-rust-type"]) return property["x-providence-rust-type"];
  if (Array.isArray(property.oneOf)) {
    const nonNull = property.oneOf.filter((entry) => entry.type !== "null");
    return nonNull.length === 1 ? rustPropertyType(nonNull[0]) : "serde_json::Value";
  }
  const refName = definitionName(property.$ref);
  if (refName) {
    const definition = schema.$defs?.[refName];
    return definition?.["x-providence-rust-name"] ?? "serde_json::Value";
  }
  if (property.type === "string") return "String";
  if (property.type === "integer") return "i64";
  if (property.type === "number") return "f64";
  if (property.type === "boolean") return "bool";
  if (property.type === "array") return `Vec<${rustPropertyType(property.items ?? {})}>`;
  return "serde_json::Value";
}

function definitionName(reference) {
  return typeof reference === "string" && reference.startsWith("#/$defs/") ? reference.slice("#/$defs/".length) : null;
}

function kebabToPascal(value) {
  return value.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function camelToSnake(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

function optionalFieldsFromSchema(definition) {
  const required = new Set(definition.required ?? []);
  return new Set(Object.keys(definition.properties ?? {}).filter((field) => !required.has(field)));
}

async function writeGeneratedFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents);
}

async function expectGeneratedFile(filePath, expected) {
  let actual;
  try {
    actual = await fs.readFile(filePath, "utf8");
  } catch {
    failures.push(`${path.relative(root, filePath)} is missing; run npm run generate:providence-project-contract`);
    return;
  }
  if (actual !== expected) {
    failures.push(`${path.relative(root, filePath)} is stale; run npm run generate:providence-project-contract`);
  }
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}
