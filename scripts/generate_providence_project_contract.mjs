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

expect(Number.isInteger(schemaVersion) && schemaVersion > 0, "schemaVersion must be a positive integer const");
expect(projectFields.length >= 35, "project schema field inventory is unexpectedly small");
expect(sameArray(projectFields, requiredFields), "all persisted top-level fields must be required and preserve canonical serializer order");
expect(sameArray(derivedFields, ["semanticSchema"]), "semanticSchema must be the sole declared derived field");
expect(!projectFields.includes("semanticSchema"), "semanticSchema is derived and must not be persisted");
expect(schema.$defs?.source?.properties?.origin?.enum?.join(",") === "authored,imported", "source origin must distinguish authored projects from imported compatibility projects");
expect(schema.$defs?.source?.additionalProperties === false, "source contract must reject unknown fields");

const tsProjectFields = extractFields(typesSource, "export type Project =", /^  ([A-Za-z][A-Za-z0-9]*)(?:\?)?:/gm);
const rustProjectFields = extractFields(rustProjectSource, "pub struct ProvidenceProject", /^    pub ([a-z][a-z0-9_]*):/gm).map(snakeToCamel);
const rustProjectFileFields = extractFields(rustImporterSource, "struct ProjectFile<'a>", /^    ([a-z][a-z0-9_]*):/gm).map(snakeToCamel);
const canonicalModelFields = [...projectFields, ...derivedFields];

expectSameSet(tsProjectFields, canonicalModelFields, "TypeScript Project");
expectSameSet(rustProjectFields, canonicalModelFields, "Rust ProvidenceProject");
expectSameArray(rustProjectFileFields, projectFields, "Rust ProjectFile serializer");

const tsOutput = renderTypeScript(schemaVersion, projectFields, derivedFields);
const rustOutput = renderRust(schemaVersion, projectFields, derivedFields);
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

function renderTypeScript(version, fields, derived) {
  return `// Generated by scripts/generate_providence_project_contract.mjs; do not edit.\n` +
    `// Source: schemas/providence-project.schema.json\n\n` +
    `export const PROVIDENCE_PROJECT_SCHEMA_VERSION = ${version} as const;\n\n` +
    `export const PROVIDENCE_PROJECT_FIELDS = ${JSON.stringify(fields, null, 2)} as const;\n\n` +
    `export const PROVIDENCE_DERIVED_PROJECT_FIELDS = ${JSON.stringify(derived, null, 2)} as const;\n\n` +
    `export type ProvidencePersistedProjectField = typeof PROVIDENCE_PROJECT_FIELDS[number];\n` +
    `export type ProvidenceDerivedProjectField = typeof PROVIDENCE_DERIVED_PROJECT_FIELDS[number];\n`;
}

function renderRust(version, fields, derived) {
  const renderArray = (values) => values.map((value) => `    ${JSON.stringify(value)},`).join("\n");
  const renderCompactArray = (values) => values.map((value) => JSON.stringify(value)).join(", ");
  return `// Generated by scripts/generate_providence_project_contract.mjs; do not edit.\n` +
    `// Source: schemas/providence-project.schema.json\n\n` +
    `pub const PROVIDENCE_PROJECT_SCHEMA_VERSION: u32 = ${version};\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_PROJECT_FIELDS: &[&str] = &[\n${renderArray(fields)}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_DERIVED_PROJECT_FIELDS: &[&str] = &[${renderCompactArray(derived)}];\n`;
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
