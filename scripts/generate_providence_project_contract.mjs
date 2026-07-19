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
const confidenceSchema = schema.$defs?.confidence ?? {};
const provenanceSchema = schema.$defs?.provenance ?? {};
const mapDefinitionNames = ["levelType", "renderMode", "mapRender", "mapEntity", "landLayout", "mapMarker", "mapRecordRect", "mapRecord", "randomRect", "randomLevel"];
const mapDefinitions = mapDefinitionNames.map((name) => schema.$defs?.[name] ?? {});
const levelTypeSchema = schema.$defs?.levelType ?? {};
const renderModeSchema = schema.$defs?.renderMode ?? {};
const mapRenderSchema = schema.$defs?.mapRender ?? {};
const mapEntitySchema = schema.$defs?.mapEntity ?? {};
const landLayoutSchema = schema.$defs?.landLayout ?? {};
const mapMarkerSchema = schema.$defs?.mapMarker ?? {};
const mapRecordRectSchema = schema.$defs?.mapRecordRect ?? {};
const mapRecordSchema = schema.$defs?.mapRecord ?? {};
const randomRectSchema = schema.$defs?.randomRect ?? {};
const randomLevelSchema = schema.$defs?.randomLevel ?? {};
const recordDefinitionNames = ["scenarioItemRecord", "treasureRecord", "shopRecord"];
const recordDefinitions = recordDefinitionNames.map((name) => schema.$defs?.[name] ?? {});
const scenarioItemRecordSchema = schema.$defs?.scenarioItemRecord ?? {};
const treasureRecordSchema = schema.$defs?.treasureRecord ?? {};
const shopRecordSchema = schema.$defs?.shopRecord ?? {};

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
expectSameArray(confidenceSchema.enum ?? [], ["confirmed", "source-backed", "fixture-backed", "inferred", "unknown"], "Provenance confidence vocabulary");
expect(provenanceSchema.type === "object", "provenance must be an object schema");
expect(provenanceSchema.additionalProperties === false, "provenance must reject unknown fields");
expectSameArray(Object.keys(provenanceSchema.properties ?? {}), ["sourceFile", "recordIndex", "byteOffset", "byteLength", "confidence"], "Provenance field inventory");
expectSameArray(provenanceSchema.required ?? [], Object.keys(provenanceSchema.properties ?? {}), "Provenance required field inventory");
expect(provenanceSchema.properties?.confidence?.$ref === "#/$defs/confidence", "provenance confidence must reference the canonical confidence enum");
expect(schema.properties?.maps?.items?.$ref === "#/$defs/mapEntity", "project maps must contain canonical map DTOs");
expect(schema.properties?.landLayout?.oneOf?.[0]?.$ref === "#/$defs/landLayout", "project landLayout must reference the canonical layout DTO");
expect(schema.properties?.mapRecords?.items?.$ref === "#/$defs/mapRecord", "project mapRecords must contain canonical map-record DTOs");
expect(schema.properties?.randomLevels?.items?.$ref === "#/$defs/randomLevel", "project randomLevels must contain canonical random-level DTOs");
expect(schema.properties?.scenarioItems?.items?.$ref === "#/$defs/scenarioItemRecord", "project scenarioItems must contain canonical scenario-item DTOs");
expect(schema.properties?.treasures?.items?.$ref === "#/$defs/treasureRecord", "project treasures must contain canonical treasure DTOs");
expect(schema.properties?.shops?.items?.$ref === "#/$defs/shopRecord", "project shops must contain canonical shop DTOs");
expectSameArray(levelTypeSchema.enum ?? [], ["land", "dungeon"], "Map level-type vocabulary");
expectSameArray(renderModeSchema.enum ?? [], ["outdoor-landlook", "dungeon-top-down", "abstract-fallback"], "Map render-mode vocabulary");
for (const [index, definition] of mapDefinitions.entries()) {
  const definitionName = mapDefinitionNames[index];
  expect(definition.type === "object" || definition.type === "string", `${definitionName} must be an object or string enum schema`);
  if (definition.type === "object") expect(definition.additionalProperties === false, `${definitionName} must reject unknown fields`);
  expect(typeof definition["x-providence-typescript-name"] === "string", `${definitionName} must declare its TypeScript name`);
  expect(typeof definition["x-providence-rust-name"] === "string", `${definitionName} must declare its Rust name`);
}
expectSameArray(Object.keys(mapEntitySchema.properties ?? {}), ["id", "levelType", "source", "index", "name", "width", "height", "tiles", "render", "provenance"], "Map identity field inventory");
expectSameArray(mapEntitySchema.required ?? [], Object.keys(mapEntitySchema.properties ?? {}), "Map required field inventory");
expect(mapEntitySchema.properties?.levelType?.$ref === "#/$defs/levelType", "map levelType must reference the canonical level enum");
expect(mapEntitySchema.properties?.render?.$ref === "#/$defs/mapRender", "map render must reference canonical render metadata");
expect(mapEntitySchema.properties?.provenance?.$ref === "#/$defs/provenance", "map provenance must reference canonical provenance");
expect(mapRenderSchema.properties?.mode?.$ref === "#/$defs/renderMode", "map render mode must reference the canonical mode enum");
expectSameArray(Object.keys(mapMarkerSchema.properties ?? {}), ["iconId", "x", "y"], "Map marker field inventory");
expectSameArray(mapMarkerSchema.required ?? [], Object.keys(mapMarkerSchema.properties ?? {}), "Map marker required field inventory");
expectSameArray(Object.keys(mapRecordRectSchema.properties ?? {}), ["top", "left", "bottom", "right"], "Map-record rectangle field inventory");
expectSameArray(mapRecordRectSchema.required ?? [], Object.keys(mapRecordRectSchema.properties ?? {}), "Map-record rectangle required field inventory");
expectSameArray(Object.keys(mapRecordSchema.properties ?? {}), ["id", "markers", "startX", "startY", "level", "pictId", "iconSize", "show", "isDungeon", "rect", "note", "name", "primaryName", "secondaryName", "nameSource", "mapNameAuthored", "rawBytes", "authored", "provenance"], "Map-record field inventory");
expectSameArray(mapRecordSchema.required ?? [], ["id", "markers", "startX", "startY", "level", "pictId", "iconSize", "show", "isDungeon", "rect", "note", "provenance"], "Map-record authored field inventory");
expect(mapRecordSchema.properties?.markers?.items?.$ref === "#/$defs/mapMarker", "map-record markers must contain canonical marker DTOs");
expect(mapRecordSchema.properties?.markers?.minItems === 10 && mapRecordSchema.properties?.markers?.maxItems === 10, "map-record markers must retain ten Realmz slots");
expect(mapRecordSchema.properties?.rect?.$ref === "#/$defs/mapRecordRect", "map-record rect must reference the canonical rectangle DTO");
expect(mapRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "map-record provenance must reference canonical provenance");
expectSameArray(mapRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Map-record omitted empty compatibility inventory");
expectSameArray(Object.keys(randomRectSchema.properties ?? {}), ["rectIndex", "top", "left", "bottom", "right", "percent", "battleRange", "randomDoors", "randomDoorPercent", "only", "option", "sound", "text"], "Random rectangle field inventory");
expectSameArray(randomRectSchema.required ?? [], Object.keys(randomRectSchema.properties ?? {}), "Random rectangle required field inventory");
expectSameArray(Object.keys(randomLevelSchema.properties ?? {}), ["id", "source", "levelType", "levelIndex", "landlook", "isDark", "useLos", "rects", "rawValues", "provenance"], "Random-level field inventory");
expectSameArray(randomLevelSchema.required ?? [], ["id", "source", "levelType", "levelIndex", "landlook", "isDark", "useLos", "rects", "provenance"], "Random-level authored field inventory");
expectSameArray(randomLevelSchema["x-providence-rust-skip-empty"] ?? [], ["rawValues"], "Random-level omitted empty compatibility inventory");
expect(randomLevelSchema.properties?.levelType?.$ref === "#/$defs/levelType", "random-level levelType must reference the canonical level enum");
expect(randomLevelSchema.properties?.rects?.items?.$ref === "#/$defs/randomRect", "random-level rects must contain canonical rectangle DTOs");
expect(randomLevelSchema.properties?.provenance?.$ref === "#/$defs/provenance", "random-level provenance must reference canonical provenance");
for (const [field, length] of [["battleRange", 2], ["randomDoors", 3], ["randomDoorPercent", 3]]) {
  expect(randomRectSchema.properties?.[field]?.minItems === length && randomRectSchema.properties?.[field]?.maxItems === length, `${field} must retain its fixed Realmz slot count`);
}
const mapCompatibilityFields = mapDefinitions.flatMap((definition) =>
  Object.entries(definition.properties ?? {})
    .filter(([, property]) => property["x-providence-compatibility-only"] === true)
    .map(([field]) => `${definition["x-providence-rust-name"]}.${field}`)
);
expectSameSet(mapCompatibilityFields, ["LandLayout.trailingBytes", "MapRecord.rawBytes", "RandomLevel.rawValues"], "Map compatibility-only field inventory");
for (const [index, definition] of recordDefinitions.entries()) {
  const definitionName = recordDefinitionNames[index];
  expect(definition.type === "object", `${definitionName} must be an object schema`);
  expect(definition.additionalProperties === false, `${definitionName} must reject unknown fields`);
  expect(typeof definition["x-providence-typescript-name"] === "string", `${definitionName} must declare its TypeScript name`);
  expect(typeof definition["x-providence-rust-name"] === "string", `${definitionName} must declare its Rust name`);
}
const scenarioItemFields = ["id", "itemId", "iconId", "type", "st", "blunt", "hands", "lu", "movement", "ac", "magicResistance", "damage", "spellPoints", "sound", "weight", "cost", "charge", "cursedItemId", "magical", "itemCat0", "itemCat1", "raceRestrictions", "casteRestrictions", "specificRace", "specificCaste", "raceClassOnly", "casteClassOnly", "spare2", "vSmall", "vLarge", "heat", "cold", "electric", "vsUndead", "vsDemonDevil", "vsEvil", "special1", "special2", "special3", "special4", "special5", "weightPerCharge", "dropOnEmpty", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(scenarioItemRecordSchema.properties ?? {}), scenarioItemFields, "Scenario-item field inventory");
expectSameArray(scenarioItemRecordSchema.required ?? [], scenarioItemFields.filter((field) => !["rawBytes", "authored"].includes(field)), "Scenario-item authored field inventory");
expect(scenarioItemRecordSchema.properties?.spare2?.minItems === 7 && scenarioItemRecordSchema.properties?.spare2?.maxItems === 7, "scenario-item spare2 must retain seven Realmz words");
expect(scenarioItemRecordSchema.properties?.type?.["x-providence-rust-field-name"] === "item_type", "scenario-item type must use the non-keyword Rust field name item_type");
expect(scenarioItemRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "scenario-item provenance must reference canonical provenance");
expectSameArray(scenarioItemRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Scenario-item omitted empty compatibility inventory");
const treasureFields = ["id", "itemIds", "exp", "gold", "gems", "jewelry", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(treasureRecordSchema.properties ?? {}), treasureFields, "Treasure field inventory");
expectSameArray(treasureRecordSchema.required ?? [], treasureFields.filter((field) => !["rawBytes", "authored"].includes(field)), "Treasure authored field inventory");
expect(treasureRecordSchema.properties?.itemIds?.minItems === 20 && treasureRecordSchema.properties?.itemIds?.maxItems === 20, "treasure itemIds must retain twenty Realmz slots");
expect(treasureRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "treasure provenance must reference canonical provenance");
expectSameArray(treasureRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Treasure omitted empty compatibility inventory");
const shopFields = ["id", "itemIds", "quantities", "inflation", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(shopRecordSchema.properties ?? {}), shopFields, "Shop field inventory");
expectSameArray(shopRecordSchema.required ?? [], shopFields.filter((field) => !["rawBytes", "authored"].includes(field)), "Shop authored field inventory");
expect(shopRecordSchema.properties?.itemIds?.minItems === 1000 && shopRecordSchema.properties?.itemIds?.maxItems === 1000, "shop itemIds must retain one thousand Realmz slots");
expect(shopRecordSchema.properties?.quantities?.minItems === 1000 && shopRecordSchema.properties?.quantities?.maxItems === 1000, "shop quantities must retain one thousand Realmz slots");
expect(shopRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "shop provenance must reference canonical provenance");
expectSameArray(shopRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Shop omitted empty compatibility inventory");
const recordCompatibilityFields = recordDefinitions.flatMap((definition) =>
  Object.entries(definition.properties ?? {})
    .filter(([, property]) => property["x-providence-compatibility-only"] === true)
    .map(([field]) => `${definition["x-providence-rust-name"]}.${field}`)
);
expectSameSet(recordCompatibilityFields, ["ScenarioItemRecord.rawBytes", "TreasureRecord.rawBytes", "ShopRecord.rawBytes"], "Record compatibility-only field inventory");
for (const [index, definition] of scenarioDefinitions.entries()) {
  const definitionName = scenarioDefinitionNames[index];
  expect(definition.type === "object", `${definitionName} must be an object schema`);
  expect(definition.additionalProperties === false, `${definitionName} must reject unknown fields`);
  expect(typeof definition["x-providence-typescript-name"] === "string", `${definitionName} must declare its TypeScript name`);
  expect(typeof definition["x-providence-rust-name"] === "string", `${definitionName} must declare its Rust name`);
}
const scenarioProvenanceOwners = scenarioDefinitions
  .filter((definition) => Object.hasOwn(definition.properties ?? {}, "provenance"));
expect(scenarioProvenanceOwners.length === 5, "five scenario startup DTOs must carry provenance");
for (const definition of scenarioProvenanceOwners) {
  expect(definition.properties.provenance?.oneOf?.[0]?.$ref === "#/$defs/provenance", `${definition["x-providence-rust-name"]} must reference canonical provenance`);
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
  "export type Confidence = ProvidenceConfidence;",
  "export type Provenance = ProvidenceProvenance;",
  "export type LevelType = ProvidenceLevelType;",
  "export type RenderMode = ProvidenceRenderMode;",
  "export type MapRender = ProvidenceMapRender;",
  "export type MapEntity = ProvidenceMapEntity;",
  "export type LandLayout = ProvidenceLandLayout;",
  "export type MapMarker = ProvidenceMapMarker;",
  "export type MapRecordRect = ProvidenceMapRecordRect;",
  "export type MapRecord = ProvidenceMapRecord;",
  "export type RandomRect = ProvidenceRandomRect;",
  "export type RandomLevel = ProvidenceRandomLevel;",
  "export type ScenarioItemRecord = ProvidenceScenarioItemRecord;",
  "export type TreasureRecord = ProvidenceTreasureRecord;",
  "export type ShopRecord = ProvidenceShopRecord;",
  "export type ScenarioMeta = ProvidenceScenarioMeta;",
  "export type ScenarioShell = ProvidenceScenarioShell;",
  "export type ScenarioSupportFile = ProvidenceScenarioSupportFile;",
  "export type ScenarioContactInfo = ProvidenceScenarioContactInfo;",
  "export type ScenarioRestrictions = ProvidenceScenarioRestrictions;",
  "export type GlobalMacroHook = ProvidenceGlobalMacroHook;",
  "export type ScenarioGlobalMacroHooks = ProvidenceScenarioGlobalMacroHooks;"
]) {
  expect(typesSource.includes(alias), `types.ts must consume generated project contract alias: ${alias}`);
}
expect(typesSource.includes('from "./generated/providenceProjectContract";'), "types.ts must import the generated source DTOs");
expect(!typesSource.includes('export type ProjectOrigin = "authored"'), "types.ts must not handwrite ProjectOrigin");
expect(!typesSource.includes("export type ProjectSource = {"), "types.ts must not handwrite ProjectSource");
expect(!typesSource.includes("export type SourceFile = {"), "types.ts must not handwrite SourceFile");
expect(!typesSource.includes("export type Provenance = {"), "types.ts must not handwrite Provenance");
for (const mapType of ["MapRender", "MapEntity", "LandLayout", "MapMarker", "MapRecordRect", "MapRecord", "RandomRect", "RandomLevel"]) {
  expect(!typesSource.includes(`export type ${mapType} = {`), `types.ts must not handwrite ${mapType}`);
}
expect(!typesSource.includes("export type ScenarioItemRecord = {"), "types.ts must not handwrite ScenarioItemRecord");
expect(!typesSource.includes("export type TreasureRecord = {"), "types.ts must not handwrite TreasureRecord");
expect(!typesSource.includes("export type ShopRecord = {"), "types.ts must not handwrite ShopRecord");
for (const scenarioType of ["ScenarioMeta", "ScenarioShell", "ScenarioSupportFile", "ScenarioContactInfo", "ScenarioRestrictions", "GlobalMacroHook", "ScenarioGlobalMacroHooks"]) {
  expect(!typesSource.includes(`export type ${scenarioType} = {`), `types.ts must not handwrite ${scenarioType}`);
}

const rustGeneratedReExports = [...rustProjectSource.matchAll(/pub use crate::generated::project_contract::\{([\s\S]*?)\};/g)]
  .flatMap((match) => match[1].split(",").map((value) => value.trim()).filter(Boolean));
expect(rustGeneratedReExports.length > 0, "project.rs must re-export the generated project DTOs");
expectSameSet(rustGeneratedReExports, [
  "Confidence",
  "GlobalMacroHook",
  "LandLayout",
  "LevelType",
  "MapEntity",
  "MapMarker",
  "MapRecord",
  "MapRecordRect",
  "MapRender",
  "ProjectOrigin",
  "Provenance",
  "RandomLevel",
  "RandomRect",
  "RenderMode",
  "ScenarioContactInfo",
  "ScenarioGlobalMacroHooks",
  "ScenarioMeta",
  "ScenarioItemRecord",
  "ScenarioRestrictions",
  "ScenarioShell",
  "ScenarioSupportFile",
  "ShopRecord",
  "TreasureRecord",
  "SourceFile",
  "SourceFileRole",
  "SourceSnapshot"
], "Rust generated project re-export");
expect(!rustProjectSource.includes("pub struct SourceSnapshot {"), "project.rs must not handwrite SourceSnapshot");
expect(!rustProjectSource.includes("pub enum ProjectOrigin {"), "project.rs must not handwrite ProjectOrigin");
expect(!rustProjectSource.includes("pub struct SourceFile {"), "project.rs must not handwrite SourceFile");
expect(!rustProjectSource.includes("pub enum SourceFileRole {"), "project.rs must not handwrite SourceFileRole");
expect(!rustProjectSource.includes("pub struct Provenance {"), "project.rs must not handwrite Provenance");
expect(!rustProjectSource.includes("pub enum Confidence {"), "project.rs must not handwrite Confidence");
expect(!rustProjectSource.includes("pub struct MapEntity {"), "project.rs must not handwrite MapEntity");
expect(!rustProjectSource.includes("pub struct MapRender {"), "project.rs must not handwrite MapRender");
expect(!rustProjectSource.includes("pub struct LandLayout {"), "project.rs must not handwrite LandLayout");
expect(!rustProjectSource.includes("pub struct MapMarker {"), "project.rs must not handwrite MapMarker");
expect(!rustProjectSource.includes("pub struct MapRecordRect {"), "project.rs must not handwrite MapRecordRect");
expect(!rustProjectSource.includes("pub struct MapRecord {"), "project.rs must not handwrite MapRecord");
expect(!rustProjectSource.includes("pub struct RandomRect {"), "project.rs must not handwrite RandomRect");
expect(!rustProjectSource.includes("pub struct RandomLevel {"), "project.rs must not handwrite RandomLevel");
expect(!rustProjectSource.includes("pub struct ScenarioItemRecord {"), "project.rs must not handwrite ScenarioItemRecord");
expect(!rustProjectSource.includes("pub struct TreasureRecord {"), "project.rs must not handwrite TreasureRecord");
expect(!rustProjectSource.includes("pub struct ShopRecord {"), "project.rs must not handwrite ShopRecord");
expect(!rustProjectSource.includes("pub enum LevelType {"), "project.rs must not handwrite LevelType");
expect(!rustProjectSource.includes("pub enum RenderMode {"), "project.rs must not handwrite RenderMode");
expect(rustProjectSource.includes("impl LevelType {"), "project.rs must retain handwritten LevelType behavior methods");
for (const scenarioType of ["ScenarioMeta", "ScenarioShell", "ScenarioSupportFile", "ScenarioContactInfo", "ScenarioRestrictions", "GlobalMacroHook", "ScenarioGlobalMacroHooks"]) {
  expect(!rustProjectSource.includes(`pub struct ${scenarioType} {`), `project.rs must not handwrite ${scenarioType}`);
}

const tsOutput = renderTypeScript(schemaVersion, projectFields, derivedFields, sourceSchema, sourceFileSchema, projectOriginSchema, sourceFileRoleSchema, confidenceSchema, provenanceSchema, scenarioDefinitions);
const rustOutput = renderRust(schemaVersion, projectFields, derivedFields, sourceSchema, sourceFileSchema, projectOriginSchema, sourceFileRoleSchema, confidenceSchema, provenanceSchema, scenarioDefinitions);
expect(!tsOutput.includes('import("../types")'), "generated TypeScript contract must not depend on handwritten project types");
expect(!rustOutput.includes("crate::project::Provenance"), "generated Rust contract must not depend on handwritten provenance");
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

function renderTypeScript(version, fields, derived, source, sourceFile, projectOrigin, sourceFileRole, confidence, provenance, scenarioTypes) {
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
    `export const PROVIDENCE_MAP_FIELDS = ${JSON.stringify(Object.keys(mapEntitySchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_LAND_LAYOUT_FIELDS = ${JSON.stringify(Object.keys(landLayoutSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_MAP_RECORD_FIELDS = ${JSON.stringify(Object.keys(mapRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_RANDOM_LEVEL_FIELDS = ${JSON.stringify(Object.keys(randomLevelSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SCENARIO_ITEM_FIELDS = ${JSON.stringify(Object.keys(scenarioItemRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_TREASURE_FIELDS = ${JSON.stringify(Object.keys(treasureRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SHOP_FIELDS = ${JSON.stringify(Object.keys(shopRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    renderTypeScriptEnum(projectOrigin) + `\n` +
    renderTypeScriptEnum(sourceFileRole) + `\n` +
    renderTypeScriptEnum(confidence) + `\n` +
    renderTypeScriptObject(provenance["x-providence-typescript-name"], provenance, new Set()) + `\n` +
    mapDefinitions.map(renderTypeScriptDefinition).join("\n") + `\n` +
    recordDefinitions.map(renderTypeScriptDefinition).join("\n") + `\n` +
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

function renderRust(version, fields, derived, source, sourceFile, projectOrigin, sourceFileRole, confidence, provenance, scenarioTypes) {
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
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_MAP_FIELDS: &[&str] = &[\n${renderArray(Object.keys(mapEntitySchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_LAND_LAYOUT_FIELDS: &[&str] = &[\n${renderArray(Object.keys(landLayoutSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_MAP_RECORD_FIELDS: &[&str] = &[\n${renderArray(Object.keys(mapRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_RANDOM_LEVEL_FIELDS: &[&str] = &[\n${renderArray(Object.keys(randomLevelSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SCENARIO_ITEM_FIELDS: &[&str] = &[\n${renderArray(Object.keys(scenarioItemRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_TREASURE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(treasureRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SHOP_FIELDS: &[&str] = &[\n${renderArray(Object.keys(shopRecordSchema.properties ?? {}))}\n];\n\n` +
    renderRustEnum(projectOrigin) + `\n` +
    renderRustEnum(sourceFileRole) + `\n` +
    renderRustEnum(confidence) + `\n` +
    renderRustStruct(provenance) + `\n` +
    mapDefinitions.map(renderRustDefinition).join("\n") + `\n` +
    recordDefinitions.map(renderRustDefinition).join("\n") + `\n` +
    renderRustStruct(sourceFile) + `\n` +
    renderRustStruct(source) + `\n` +
    scenarioTypes.map(renderRustStruct).join("\n");
}

function renderTypeScriptEnum(definition) {
  const name = definition["x-providence-typescript-name"];
  const values = definition.enum ?? [];
  return `export type ${name} = ${values.map((value) => JSON.stringify(value)).join(" | ")};\n`;
}

function renderTypeScriptDefinition(definition) {
  return Array.isArray(definition.enum)
    ? renderTypeScriptEnum(definition)
    : renderTypeScriptObject(definition["x-providence-typescript-name"], definition, optionalFieldsFromSchema(definition));
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

function renderRustDefinition(definition) {
  return Array.isArray(definition.enum) ? renderRustEnum(definition) : renderRustStruct(definition);
}

function renderRustStruct(definition) {
  const name = definition["x-providence-rust-name"];
  const optionalFields = new Set([
    ...(definition["x-providence-runtime-optional"] ?? []),
    ...(definition["x-providence-rust-optional"] ?? [])
  ]);
  const defaultFields = new Set(definition["x-providence-rust-default"] ?? []);
  const skipNoneFields = new Set(definition["x-providence-rust-skip-none"] ?? []);
  const skipEmptyFields = new Set(definition["x-providence-rust-skip-empty"] ?? []);
  const fields = Object.entries(definition.properties ?? {}).flatMap(([field, property]) => {
    const rustType = rustPropertyType(property);
    const rustFieldName = property["x-providence-rust-field-name"] ?? camelToSnake(field);
    const lines = [];
    if (optionalFields.has(field)) {
      lines.push(skipNoneFields.has(field)
        ? '    #[serde(default, skip_serializing_if = "Option::is_none")]'
        : "    #[serde(default)]");
    } else if (defaultFields.has(field)) {
      lines.push(skipEmptyFields.has(field)
        ? '    #[serde(default, skip_serializing_if = "Vec::is_empty")]'
        : "    #[serde(default)]");
    }
    if (rustFieldName !== camelToSnake(field)) lines.push(`    #[serde(rename = ${JSON.stringify(field)})]`);
    lines.push(`    pub ${rustFieldName}: ${optionalFields.has(field) ? `Option<${rustType}>` : rustType},`);
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
