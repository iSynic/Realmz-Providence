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
const landlookDefinitionNames = ["tileAttributeConfidence", "tileAttributeSourceKind", "tileAttributeFlag", "tileEditableScope", "tileAttributeProfile", "mapstatsRecord", "landlookRangeSlot", "landlookWriterGate", "customLandlookMetadata"];
const landlookDefinitions = landlookDefinitionNames.map((name) => schema.$defs?.[name] ?? {});
const tileAttributeProfileSchema = schema.$defs?.tileAttributeProfile ?? {};
const mapstatsRecordSchema = schema.$defs?.mapstatsRecord ?? {};
const landlookRangeSlotSchema = schema.$defs?.landlookRangeSlot ?? {};
const landlookWriterGateSchema = schema.$defs?.landlookWriterGate ?? {};
const customLandlookMetadataSchema = schema.$defs?.customLandlookMetadata ?? {};
const assetDefinitionNames = ["monsterIconOverrideSource", "monsterIconOverride", "scenarioIconResourceSource", "scenarioIconResource", "assetImportTarget", "managedAssetLibraryScope", "imageFitMode", "imageScaleMode", "imageMatte", "paletteMode", "ditherMode", "managedAssetKind", "managedAssetExportState", "managedAssetConversion", "managedAsset", "tilesetAsset", "resourceAsset", "assetCatalog"];
const assetDefinitions = assetDefinitionNames.map((name) => schema.$defs?.[name] ?? {});
const monsterIconOverrideSourceSchema = schema.$defs?.monsterIconOverrideSource ?? {};
const monsterIconOverrideSchema = schema.$defs?.monsterIconOverride ?? {};
const scenarioIconResourceSourceSchema = schema.$defs?.scenarioIconResourceSource ?? {};
const scenarioIconResourceSchema = schema.$defs?.scenarioIconResource ?? {};
const assetImportTargetSchema = schema.$defs?.assetImportTarget ?? {};
const managedAssetLibraryScopeSchema = schema.$defs?.managedAssetLibraryScope ?? {};
const paletteModeSchema = schema.$defs?.paletteMode ?? {};
const managedAssetKindSchema = schema.$defs?.managedAssetKind ?? {};
const managedAssetExportStateSchema = schema.$defs?.managedAssetExportState ?? {};
const managedAssetConversionSchema = schema.$defs?.managedAssetConversion ?? {};
const managedAssetSchema = schema.$defs?.managedAsset ?? {};
const tilesetAssetSchema = schema.$defs?.tilesetAsset ?? {};
const resourceAssetSchema = schema.$defs?.resourceAsset ?? {};
const assetCatalogSchema = schema.$defs?.assetCatalog ?? {};
const recordDefinitionNames = ["actionCategory", "mapCoordinate", "action", "triggerRecord", "extraCodeRow", "scenarioItemRecord", "treasureRecord", "shopRecord", "messageRecord", "optionLabelRecord", "battleRecord", "monsterRecord", "monsterDescriptionRecord", "monsterSet", "itemTextRecord", "scenarioSpellOverride", "scenarioRaceOverride", "scenarioCasteOverride", "encounterActionRow", "simpleEncounterRecord", "complexEncounterRecord", "thiefEncounterRecord", "timedEncounterRecord"];
const recordDefinitions = recordDefinitionNames.map((name) => schema.$defs?.[name] ?? {});
const actionCategorySchema = schema.$defs?.actionCategory ?? {};
const mapCoordinateSchema = schema.$defs?.mapCoordinate ?? {};
const actionSchema = schema.$defs?.action ?? {};
const triggerRecordSchema = schema.$defs?.triggerRecord ?? {};
const extraCodeRowSchema = schema.$defs?.extraCodeRow ?? {};
const scenarioItemRecordSchema = schema.$defs?.scenarioItemRecord ?? {};
const treasureRecordSchema = schema.$defs?.treasureRecord ?? {};
const shopRecordSchema = schema.$defs?.shopRecord ?? {};
const messageRecordSchema = schema.$defs?.messageRecord ?? {};
const optionLabelRecordSchema = schema.$defs?.optionLabelRecord ?? {};
const battleRecordSchema = schema.$defs?.battleRecord ?? {};
const monsterRecordSchema = schema.$defs?.monsterRecord ?? {};
const monsterDescriptionRecordSchema = schema.$defs?.monsterDescriptionRecord ?? {};
const monsterSetIdSchema = schema.$defs?.monsterSetId ?? {};
const monsterSetSchema = schema.$defs?.monsterSet ?? {};
const itemTextRecordSchema = schema.$defs?.itemTextRecord ?? {};
const scenarioSpellOverrideSchema = schema.$defs?.scenarioSpellOverride ?? {};
const scenarioRaceOverrideSchema = schema.$defs?.scenarioRaceOverride ?? {};
const scenarioCasteOverrideSchema = schema.$defs?.scenarioCasteOverride ?? {};
const encounterActionRowSchema = schema.$defs?.encounterActionRow ?? {};
const simpleEncounterRecordSchema = schema.$defs?.simpleEncounterRecord ?? {};
const complexEncounterRecordSchema = schema.$defs?.complexEncounterRecord ?? {};
const thiefEncounterRecordSchema = schema.$defs?.thiefEncounterRecord ?? {};
const timedEncounterLocationKindSchema = schema.$defs?.timedEncounterLocationKind ?? {};
const timedEncounterRecordSchema = schema.$defs?.timedEncounterRecord ?? {};

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
expect(schema.properties?.tileAttributes?.items?.$ref === "#/$defs/tileAttributeProfile", "project tileAttributes must contain canonical tile-attribute DTOs");
expect(schema.properties?.customLandlooks?.items?.$ref === "#/$defs/customLandlookMetadata", "project customLandlooks must contain canonical custom-landlook DTOs");
expect(schema.properties?.randomLevels?.items?.$ref === "#/$defs/randomLevel", "project randomLevels must contain canonical random-level DTOs");
expect(schema.properties?.triggers?.items?.$ref === "#/$defs/triggerRecord", "project triggers must contain canonical trigger DTOs");
expect(schema.properties?.extracodes?.items?.$ref === "#/$defs/extraCodeRow", "project extracodes must contain canonical EDCD DTOs");
expect(schema.properties?.monsterIconOverrides?.items?.$ref === "#/$defs/monsterIconOverride", "project monsterIconOverrides must contain canonical resource override DTOs");
expect(schema.properties?.scenarioIconResources?.items?.$ref === "#/$defs/scenarioIconResource", "project scenarioIconResources must contain canonical resource DTOs");
expect(schema.properties?.assets?.items?.$ref === "#/$defs/managedAsset", "project assets must contain canonical managed-asset DTOs");
expect(schema.properties?.assetCatalog?.$ref === "#/$defs/assetCatalog", "project assetCatalog must reference canonical catalog metadata");
expect(schema.properties?.scenarioItems?.items?.$ref === "#/$defs/scenarioItemRecord", "project scenarioItems must contain canonical scenario-item DTOs");
expect(schema.properties?.treasures?.items?.$ref === "#/$defs/treasureRecord", "project treasures must contain canonical treasure DTOs");
expect(schema.properties?.shops?.items?.$ref === "#/$defs/shopRecord", "project shops must contain canonical shop DTOs");
expect(schema.properties?.messages?.items?.$ref === "#/$defs/messageRecord", "project messages must contain canonical message DTOs");
expect(schema.properties?.optionLabels?.items?.$ref === "#/$defs/optionLabelRecord", "project optionLabels must contain canonical option-label DTOs");
expect(schema.properties?.battles?.items?.$ref === "#/$defs/battleRecord", "project battles must contain canonical battle DTOs");
expect(schema.properties?.monsters?.items?.$ref === "#/$defs/monsterRecord", "project monsters must contain canonical monster DTOs");
expect(schema.properties?.monsterSets?.items?.$ref === "#/$defs/monsterSet", "project monsterSets must contain canonical monster-set DTOs");
expect(schema.properties?.monsterDescriptions?.items?.$ref === "#/$defs/monsterDescriptionRecord", "project monsterDescriptions must contain canonical monster-description DTOs");
expect(schema.properties?.itemTexts?.items?.$ref === "#/$defs/itemTextRecord", "project itemTexts must contain canonical item-text DTOs");
expect(schema.properties?.spellOverrides?.items?.$ref === "#/$defs/scenarioSpellOverride", "project spellOverrides must contain canonical spell-override DTOs");
expect(schema.properties?.raceOverrides?.items?.$ref === "#/$defs/scenarioRaceOverride", "project raceOverrides must contain canonical race-override DTOs");
expect(schema.properties?.casteOverrides?.items?.$ref === "#/$defs/scenarioCasteOverride", "project casteOverrides must contain canonical caste-override DTOs");
expect(schema.properties?.simpleEncounters?.items?.$ref === "#/$defs/simpleEncounterRecord", "project simpleEncounters must contain canonical simple-encounter DTOs");
expect(schema.properties?.timedEncounters?.items?.$ref === "#/$defs/timedEncounterRecord", "project timedEncounters must contain canonical timed-encounter DTOs");
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
expectSameArray(Object.keys(landLayoutSchema.properties ?? {}), ["rows", "cols", "cells", "authored", "provenance"], "Land-layout field inventory");
expectSameArray(landLayoutSchema.required ?? [], ["rows", "cols", "cells"], "Land-layout authored field inventory");
expectSameArray(landLayoutSchema["x-providence-rust-default"] ?? [], ["authored", "provenance"], "Land-layout defaulted field inventory");
expect(landLayoutSchema.properties?.cells?.minItems === 128 && landLayoutSchema.properties?.cells?.maxItems === 128, "land layout must retain the complete 8 x 16 cell grid");
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
expectSameArray(Object.keys(randomLevelSchema.properties ?? {}), ["id", "source", "levelType", "levelIndex", "landlook", "isDark", "useLos", "rects", "provenance"], "Random-level field inventory");
expectSameArray(randomLevelSchema.required ?? [], ["id", "source", "levelType", "levelIndex", "landlook", "isDark", "useLos", "rects", "provenance"], "Random-level authored field inventory");
expectSameArray(randomLevelSchema["x-providence-rust-skip-empty"] ?? [], [], "Random-level omitted empty compatibility inventory");
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
expectSameSet(mapCompatibilityFields, ["MapRecord.rawBytes"], "Map compatibility-only field inventory");
for (const [index, definition] of landlookDefinitions.entries()) {
  const definitionName = landlookDefinitionNames[index];
  expect(definition.type === "object" || definition.type === "string", `${definitionName} must be an object or string enum schema`);
  if (definition.type === "object") expect(definition.additionalProperties === false, `${definitionName} must reject unknown fields`);
  expect(typeof definition["x-providence-typescript-name"] === "string", `${definitionName} must declare its TypeScript name`);
  expect(typeof definition["x-providence-rust-name"] === "string", `${definitionName} must declare its Rust name`);
}
expectSameArray(Object.keys(tileAttributeProfileSchema.properties ?? {}), ["tile", "landlook", "solidType", "movementSoundId", "movementCost", "shore", "boatRequirement", "pathFlag", "blocksLos", "flyFloatRequired", "forestType", "spare", "combatBuild", "clearLandId", "baseTile", "baseScale", "editableScope", "flags", "confidence", "sourceKind", "source", "rawByte"], "Tile-attribute field inventory");
expectSameArray(tileAttributeProfileSchema.required ?? [], ["tile", "landlook", "solidType", "movementSoundId", "movementCost", "flags", "confidence", "source", "rawByte"], "Tile-attribute authored field inventory");
expect(tileAttributeProfileSchema.properties?.combatBuild?.minItems === 3 && tileAttributeProfileSchema.properties?.combatBuild?.maxItems === 3, "tile-attribute combatBuild must retain three rows");
expect(tileAttributeProfileSchema.properties?.combatBuild?.items?.minItems === 3 && tileAttributeProfileSchema.properties?.combatBuild?.items?.maxItems === 3, "tile-attribute combatBuild rows must retain three columns");
expectSameArray(Object.keys(mapstatsRecordSchema.properties ?? {}), ["tile", "sound", "time", "solid", "shore", "needBoat", "isPath", "los", "flyFloat", "forest", "spare", "combatBuild", "clearLandId"], "Mapstats field inventory");
expectSameArray(mapstatsRecordSchema.required ?? [], ["tile", "sound", "time", "solid", "shore", "needBoat", "isPath", "los", "flyFloat", "forest", "combatBuild", "clearLandId"], "Mapstats authored field inventory");
expect(mapstatsRecordSchema.properties?.combatBuild?.minItems === 3 && mapstatsRecordSchema.properties?.combatBuild?.maxItems === 3, "mapstats combatBuild must retain three rows");
expect(mapstatsRecordSchema.properties?.combatBuild?.items?.minItems === 3 && mapstatsRecordSchema.properties?.combatBuild?.items?.maxItems === 3, "mapstats combatBuild rows must retain three columns");
expectSameArray(Object.keys(landlookRangeSlotSchema.properties ?? {}), ["slot", "label", "firstTile", "lastTile", "reserved"], "Landlook range-slot field inventory");
expectSameArray(landlookRangeSlotSchema.required ?? [], ["slot", "label", "firstTile", "lastTile"], "Landlook range-slot authored field inventory");
expectSameArray(Object.keys(landlookWriterGateSchema.properties ?? {}), ["metadataWriterStatus", "atlasWriterStatus", "writableFields", "preserveOnlyFields", "evidence"], "Landlook writer-gate field inventory");
expectSameArray(landlookWriterGateSchema.required ?? [], Object.keys(landlookWriterGateSchema.properties ?? {}), "Landlook writer-gate required field inventory");
expectSameArray(Object.keys(customLandlookMetadataSchema.properties ?? {}), ["landlook", "sourceFile", "records", "baseTile", "baseScale", "rangeSlots", "trailingBytes", "rawBytes", "writerGate", "authored"], "Custom-landlook field inventory");
expectSameArray(customLandlookMetadataSchema.required ?? [], ["landlook", "sourceFile", "records", "baseTile", "baseScale", "rangeSlots", "writerGate"], "Custom-landlook authored field inventory");
expect(customLandlookMetadataSchema.properties?.records?.minItems === 201 && customLandlookMetadataSchema.properties?.records?.maxItems === 201, "custom landlooks must retain 201 mapstats rows");
expect(customLandlookMetadataSchema.properties?.rangeSlots?.minItems === 10 && customLandlookMetadataSchema.properties?.rangeSlots?.maxItems === 10, "custom landlooks must retain ten range slots");
expect(customLandlookMetadataSchema.properties?.records?.items?.$ref === "#/$defs/mapstatsRecord", "custom landlooks must contain canonical mapstats DTOs");
expect(customLandlookMetadataSchema.properties?.rangeSlots?.items?.$ref === "#/$defs/landlookRangeSlot", "custom landlooks must contain canonical range-slot DTOs");
expect(customLandlookMetadataSchema.properties?.writerGate?.$ref === "#/$defs/landlookWriterGate", "custom landlooks must reference the canonical writer gate");
expectSameArray(customLandlookMetadataSchema["x-providence-rust-skip-empty"] ?? [], ["trailingBytes", "rawBytes"], "Custom-landlook omitted compatibility inventory");
const landlookCompatibilityFields = landlookDefinitions.flatMap((definition) =>
  Object.entries(definition.properties ?? {})
    .filter(([, property]) => property["x-providence-compatibility-only"] === true)
    .map(([field]) => `${definition["x-providence-rust-name"]}.${field}`)
);
expectSameSet(landlookCompatibilityFields, ["TileAttributeProfile.spare", "TileAttributeProfile.rawByte", "MapstatsRecord.spare", "LandlookRangeSlot.reserved", "CustomLandlookMetadata.trailingBytes", "CustomLandlookMetadata.rawBytes"], "Landlook compatibility-only field inventory");
for (const [index, definition] of assetDefinitions.entries()) {
  const definitionName = assetDefinitionNames[index];
  expect(definition.type === "object" || definition.type === "string", `${definitionName} must be an object or string enum schema`);
  if (definition.type === "object") expect(definition.additionalProperties === false, `${definitionName} must reject unknown fields`);
  expect(typeof definition["x-providence-typescript-name"] === "string", `${definitionName} must declare its TypeScript name`);
  expect(typeof definition["x-providence-rust-name"] === "string", `${definitionName} must declare its Rust name`);
}
expectSameArray(monsterIconOverrideSourceSchema.enum ?? [], ["monster-mash", "scenario-resource", "providence-library"], "Monster-icon override source vocabulary");
const monsterIconOverrideFields = ["targetBaseIconId", "sourceBaseIconId", "sourceLabel", "sourceKind", "sourceBaseResourceBase64", "sourcePairedResourceBase64", "imported"];
expectSameArray(Object.keys(monsterIconOverrideSchema.properties ?? {}), monsterIconOverrideFields, "Monster-icon override field inventory");
expectSameArray(monsterIconOverrideSchema.required ?? [], monsterIconOverrideFields.filter((field) => !["sourceLabel", "imported"].includes(field)), "Monster-icon override authored field inventory");
expect(monsterIconOverrideSchema.properties?.sourceKind?.$ref === "#/$defs/monsterIconOverrideSource", "monster-icon overrides must reference their canonical source vocabulary");
expectSameArray(monsterIconOverrideSchema["x-providence-rust-optional"] ?? [], ["sourceLabel"], "Monster-icon optional Rust inventory");
expectSameArray(monsterIconOverrideSchema["x-providence-rust-default"] ?? [], ["imported"], "Monster-icon defaulted Rust inventory");
expectSameArray(scenarioIconResourceSourceSchema.enum ?? [], ["vault-of-arcana", "providence-library", "scenario-resource"], "Scenario-icon source vocabulary");
const scenarioIconResourceFields = ["resourceId", "label", "sourceKind", "resourceBase64", "previewPath", "imported"];
expectSameArray(Object.keys(scenarioIconResourceSchema.properties ?? {}), scenarioIconResourceFields, "Scenario-icon resource field inventory");
expectSameArray(scenarioIconResourceSchema.required ?? [], scenarioIconResourceFields.filter((field) => !["previewPath", "imported"].includes(field)), "Scenario-icon resource authored field inventory");
expect(scenarioIconResourceSchema.properties?.sourceKind?.$ref === "#/$defs/scenarioIconResourceSource", "scenario-icon resources must reference their canonical source vocabulary");
expectSameArray(scenarioIconResourceSchema["x-providence-rust-optional"] ?? [], ["previewPath"], "Scenario-icon optional Rust inventory");
expectSameArray(scenarioIconResourceSchema["x-providence-rust-default"] ?? [], ["imported"], "Scenario-icon defaulted Rust inventory");
expectSameArray(assetImportTargetSchema.enum ?? [], ["scenario-picture", "custom-landlook-atlas", "icon", "special-land-tile", "sound", "text", "raw-resource"], "Asset import-target vocabulary");
expectSameArray(managedAssetLibraryScopeSchema.enum ?? [], ["scenario", "custom-library"], "Managed-asset library-scope vocabulary");
expectSameArray(managedAssetKindSchema.enum ?? [], ["picture", "icon", "special-land-tile", "sound", "text", "other"], "Managed-asset kind vocabulary");
expectSameArray(managedAssetExportStateSchema.enum ?? [], ["ready", "blocked", "preview-only"], "Managed-asset export-state vocabulary");
expectSameArray(paletteModeSchema.enum ?? [], ["adaptive-256"], "Managed-asset palette vocabulary");
expect(paletteModeSchema["x-providence-rust-renames"]?.["adaptive-256"] === "adaptive-256", "adaptive palette mode must retain its explicit Rust wire spelling");
expectSameArray(paletteModeSchema["x-providence-rust-aliases"]?.["adaptive-256"] ?? [], ["adaptive256"], "Adaptive palette legacy aliases");
const managedAssetConversionFields = ["target", "fitMode", "scaleMode", "matte", "paletteMode", "ditherMode", "sourceWidth", "sourceHeight", "sourceDurationMs", "sourceSampleRate", "sourceChannels", "finalWidth", "finalHeight", "warnings"];
expectSameArray(Object.keys(managedAssetConversionSchema.properties ?? {}), managedAssetConversionFields, "Managed-asset conversion field inventory");
expectSameArray(managedAssetConversionSchema.required ?? [], managedAssetConversionFields.filter((field) => !field.startsWith("source")), "Managed-asset conversion required field inventory");
expect(managedAssetConversionSchema.properties?.target?.$ref === "#/$defs/assetImportTarget", "managed-asset conversion must reference the canonical import target");
expectSameArray(managedAssetConversionSchema["x-providence-rust-default"] ?? [], ["sourceWidth", "sourceHeight", "sourceDurationMs", "sourceSampleRate", "sourceChannels", "warnings"], "Managed-asset conversion defaulted Rust inventory");
const managedAssetFields = ["id", "label", "kind", "resourceType", "resourceId", "fileName", "originalPath", "previewPath", "resourcePath", "mimeType", "bytes", "sha256", "width", "height", "durationMs", "sampleRate", "channels", "exportState", "libraryScope", "provenance", "linkedEntity", "conversion"];
expectSameArray(Object.keys(managedAssetSchema.properties ?? {}), managedAssetFields, "Managed-asset field inventory");
expectSameArray(managedAssetSchema.required ?? [], managedAssetFields.filter((field) => !["libraryScope", "conversion"].includes(field)), "Managed-asset required field inventory");
expect(managedAssetSchema.properties?.kind?.$ref === "#/$defs/managedAssetKind", "managed assets must reference the canonical kind vocabulary");
expect(managedAssetSchema.properties?.exportState?.$ref === "#/$defs/managedAssetExportState", "managed assets must reference the canonical export-state vocabulary");
expect(managedAssetSchema.properties?.libraryScope?.["x-providence-typescript-type"] === "ProvidenceManagedAssetLibraryScope", "managed-asset library scope must retain its non-null optional TypeScript shape");
expectSameArray(managedAssetSchema["x-providence-rust-default"] ?? [], ["libraryScope", "conversion"], "Managed-asset defaulted Rust inventory");
const tilesetAssetFields = ["id", "landlook", "name", "source", "available", "imagePath", "pictId", "tileWidth", "tileHeight", "columns", "rows", "custom", "baseTile"];
expectSameArray(Object.keys(tilesetAssetSchema.properties ?? {}), tilesetAssetFields, "Tileset-asset field inventory");
expectSameArray(tilesetAssetSchema.required ?? [], tilesetAssetFields.filter((field) => field !== "baseTile"), "Tileset-asset required field inventory");
expectSameArray(tilesetAssetSchema["x-providence-rust-default"] ?? [], ["baseTile"], "Tileset-asset defaulted Rust inventory");
const resourceAssetFields = ["id", "resourceType", "resourceId", "name", "source", "previewPath"];
expectSameArray(Object.keys(resourceAssetSchema.properties ?? {}), resourceAssetFields, "Resource-asset field inventory");
expectSameArray(resourceAssetSchema.required ?? [], ["id", "resourceType", "resourceId", "source"], "Resource-asset required field inventory");
expectSameArray(resourceAssetSchema["x-providence-rust-skip-none"] ?? [], ["previewPath"], "Resource-asset omitted preview inventory");
const assetCatalogFields = ["tilesets", "pictures", "icons", "sounds"];
expectSameArray(Object.keys(assetCatalogSchema.properties ?? {}), assetCatalogFields, "Asset-catalog field inventory");
expectSameArray(assetCatalogSchema.required ?? [], ["tilesets"], "Asset-catalog browser-compatible field inventory");
expectSameArray(assetCatalogSchema["x-providence-rust-default"] ?? [], assetCatalogFields, "Asset-catalog defaulted Rust inventory");
expect(assetCatalogSchema.properties?.tilesets?.items?.$ref === "#/$defs/tilesetAsset", "asset catalog tilesets must contain canonical tileset DTOs");
for (const field of ["pictures", "icons", "sounds"]) {
  expect(assetCatalogSchema.properties?.[field]?.items?.$ref === "#/$defs/resourceAsset", `asset catalog ${field} must contain canonical resource metadata`);
}
for (const [index, definition] of recordDefinitions.entries()) {
  const definitionName = recordDefinitionNames[index];
  expect(definition.type === "object" || definition.type === "string", `${definitionName} must be an object or string enum schema`);
  if (definition.type === "object") expect(definition.additionalProperties === false, `${definitionName} must reject unknown fields`);
  expect(typeof definition["x-providence-typescript-name"] === "string", `${definitionName} must declare its TypeScript name`);
  expect(typeof definition["x-providence-rust-name"] === "string", `${definitionName} must declare its Rust name`);
}
const actionCategoryValues = ["branch", "combat", "encounter", "item_shop", "map", "registration", "state", "time", "ui_text", "unknown"];
expectSameArray(actionCategorySchema.enum ?? [], actionCategoryValues, "Action category vocabulary");
expect(actionCategorySchema["x-providence-rust-rename-all"] === "snake_case", "Action categories must retain their snake_case Rust wire names");
const actionCategoryAliases = {
  branch: ["Branch", "Quest"],
  combat: ["Combat"],
  encounter: ["Encounter"],
  item_shop: ["Economy", "ItemShop"],
  map: ["Map"],
  registration: ["Registration", "Scenario"],
  state: ["Advanced", "Characters", "Rules", "State"],
  time: ["Time"],
  ui_text: ["Media", "Text", "UiText"],
  unknown: ["Unknown"]
};
expectSameArray(Object.keys(actionCategorySchema["x-providence-rust-aliases"] ?? {}), actionCategoryValues, "Action category legacy-alias inventory");
for (const [category, aliases] of Object.entries(actionCategoryAliases)) {
  expectSameArray(actionCategorySchema["x-providence-rust-aliases"]?.[category] ?? [], aliases, `Action category ${category} legacy aliases`);
}
expectSameArray(Object.keys(mapCoordinateSchema.properties ?? {}), ["x", "y"], "Action Point coordinate field inventory");
expectSameArray(mapCoordinateSchema.required ?? [], ["x", "y"], "Action Point coordinate required field inventory");
const actionFields = ["slot", "rawCode", "code", "id", "label", "category", "gosub"];
expectSameArray(Object.keys(actionSchema.properties ?? {}), actionFields, "Action Point step field inventory");
expectSameArray(actionSchema.required ?? [], actionFields.filter((field) => field !== "gosub"), "Action Point step browser-compatible field inventory");
expect(actionSchema.properties?.category?.type === "string", "Action Point steps must retain the editor's open author-facing category labels");
expect(actionSchema.properties?.category?.["x-providence-rust-type"] === "ActionCategory", "Action Point steps must retain the normalized Rust boundary category type");
const triggerFields = ["id", "source", "levelType", "levelIndex", "recordIndex", "active", "doorid", "landid", "targetX", "targetY", "percent", "coordinate", "actions", "provenance"];
expectSameArray(Object.keys(triggerRecordSchema.properties ?? {}), triggerFields, "Action Point trigger field inventory");
expectSameArray(triggerRecordSchema.required ?? [], triggerFields.filter((field) => !["landid", "targetX", "targetY", "provenance"].includes(field)), "Action Point trigger browser-compatible field inventory");
expect(triggerRecordSchema.properties?.actions?.items?.$ref === "#/$defs/action", "Action Point triggers must contain canonical action steps");
expect(triggerRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "Action Point provenance must reference canonical provenance");
expect(triggerRecordSchema.properties?.levelType?.["x-providence-rust-type"] === "Option<LevelType>", "Action Point nullable levelType must preserve the Rust option wire shape");
expect(triggerRecordSchema.properties?.coordinate?.["x-providence-rust-type"] === "Option<MapCoordinate>", "Action Point nullable coordinate must preserve the Rust option wire shape");
const extraCodeFields = ["id", "values", "provenance"];
expectSameArray(Object.keys(extraCodeRowSchema.properties ?? {}), extraCodeFields, "EDCD row field inventory");
expectSameArray(extraCodeRowSchema.required ?? [], ["id", "values"], "EDCD browser-compatible field inventory");
expect(extraCodeRowSchema.properties?.values?.minItems === 5 && extraCodeRowSchema.properties?.values?.maxItems === 5, "EDCD rows must retain exactly five signed-short values");
expect(extraCodeRowSchema.properties?.values?.["x-providence-rust-type"] === "[i16; 5]", "EDCD rows must preserve the fixed Rust array wire shape");
expect(extraCodeRowSchema.properties?.provenance?.$ref === "#/$defs/provenance", "EDCD provenance must reference canonical provenance");
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
const messageFields = ["id", "text", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(messageRecordSchema.properties ?? {}), messageFields, "Message field inventory");
expectSameArray(messageRecordSchema.required ?? [], ["id", "text"], "Message authored field inventory");
expect(messageRecordSchema.properties?.rawBytes?.minItems === 256 && messageRecordSchema.properties?.rawBytes?.maxItems === 256, "message rawBytes must retain one complete Realmz Str255 slot when compatibility bytes are present");
expect(messageRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "message provenance must reference canonical provenance");
expectSameArray(messageRecordSchema["x-providence-rust-optional"] ?? [], ["provenance"], "Message migration-optional Rust inventory");
expectSameArray(messageRecordSchema["x-providence-rust-skip-none"] ?? [], ["provenance"], "Message omitted empty provenance inventory");
expectSameArray(messageRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Message omitted empty compatibility inventory");
const optionLabelFields = ["id", "text", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(optionLabelRecordSchema.properties ?? {}), optionLabelFields, "Option-label field inventory");
expectSameArray(optionLabelRecordSchema.required ?? [], ["id", "text"], "Option-label authored field inventory");
expect(optionLabelRecordSchema.properties?.rawBytes?.minItems === 25 && optionLabelRecordSchema.properties?.rawBytes?.maxItems === 25, "option-label rawBytes must retain one complete Realmz Str24 slot when compatibility bytes are present");
expect(optionLabelRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "option-label provenance must reference canonical provenance");
expectSameArray(optionLabelRecordSchema["x-providence-rust-optional"] ?? [], ["provenance"], "Option-label migration-optional Rust inventory");
expectSameArray(optionLabelRecordSchema["x-providence-rust-skip-none"] ?? [], ["provenance"], "Option-label omitted empty provenance inventory");
expectSameArray(optionLabelRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Option-label omitted empty compatibility inventory");
const battleFields = ["id", "grid", "dist", "messageBefore", "messageAfter", "battleMacro", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(battleRecordSchema.properties ?? {}), battleFields, "Battle field inventory");
expectSameArray(battleRecordSchema.required ?? [], battleFields.filter((field) => !["rawBytes", "authored"].includes(field)), "Battle authored field inventory");
expect(battleRecordSchema.properties?.grid?.minItems === 169 && battleRecordSchema.properties?.grid?.maxItems === 169, "battle grid must retain 169 Realmz slots");
expect(battleRecordSchema.properties?.rawBytes?.minItems === 346 && battleRecordSchema.properties?.rawBytes?.maxItems === 346, "battle rawBytes must retain one complete Realmz battle row when compatibility bytes are present");
expect(battleRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "battle provenance must reference canonical provenance");
expectSameArray(battleRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Battle omitted empty compatibility inventory");
const monsterFields = ["id", "hitDice", "staminaBonus", "agility", "nameId", "movementMax", "armor", "magicResistance", "distance", "traitor", "size", "typeFlags", "attackCount", "magicAttackCount", "attacks", "damageBonus", "castPercent", "runPercent", "surrenderPercent", "missilePercent", "canSummon", "saves", "spellImmunities", "money", "spells", "items", "weapon", "iconId", "spellPoints", "exp", "stamina", "staminaMax", "underneath", "target", "guarding", "notOnMenu", "beenAttacked", "movement", "magicToHit", "conditions", "lr", "up", "attackNum", "bonusAttack", "deathMacro", "maxSpellPoints", "displayName", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(monsterRecordSchema.properties ?? {}), monsterFields, "Monster field inventory");
expectSameArray(monsterRecordSchema.required ?? [], monsterFields.filter((field) => !["rawBytes", "authored", "provenance"].includes(field)), "Monster authored field inventory");
for (const [field, length] of [["typeFlags", 8], ["attacks", 5], ["saves", 6], ["spellImmunities", 6], ["money", 3], ["spells", 10], ["items", 6], ["underneath", 4], ["conditions", 40]]) {
  expect(monsterRecordSchema.properties?.[field]?.minItems === length && monsterRecordSchema.properties?.[field]?.maxItems === length, `monster records must retain ${length} ${field} slots`);
}
expect(monsterRecordSchema.properties?.attacks?.items?.minItems === 4 && monsterRecordSchema.properties?.attacks?.items?.maxItems === 4, "monster attack rows must retain four signed-byte slots");
expect(monsterRecordSchema.properties?.rawBytes?.minItems === 210 && monsterRecordSchema.properties?.rawBytes?.maxItems === 210, "monster rawBytes must retain one complete Realmz row when compatibility bytes are present");
expectSameArray(monsterRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Monster omitted empty compatibility inventory");
const monsterDescriptionFields = ["id", "text", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(monsterDescriptionRecordSchema.properties ?? {}), monsterDescriptionFields, "Monster-description field inventory");
expectSameArray(monsterDescriptionRecordSchema.required ?? [], ["id", "text"], "Monster-description authored field inventory");
expect(monsterDescriptionRecordSchema.properties?.rawBytes?.minItems === 256 && monsterDescriptionRecordSchema.properties?.rawBytes?.maxItems === 256, "monster-description rawBytes must retain one complete Realmz Str255 row when compatibility bytes are present");
expectSameArray(monsterDescriptionRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Monster-description omitted empty compatibility inventory");
expectSameArray(monsterSetIdSchema.enum ?? [], [-1, 0, 1], "Monster-set identity vocabulary");
const monsterSetFields = ["sourceFile", "setId", "monsters"];
expectSameArray(Object.keys(monsterSetSchema.properties ?? {}), monsterSetFields, "Monster-set field inventory");
expectSameArray(monsterSetSchema.required ?? [], monsterSetFields, "Monster-set required field inventory");
expect(monsterSetSchema.properties?.setId?.$ref === "#/$defs/monsterSetId", "monster sets must reference the canonical set identity");
expect(monsterSetSchema.properties?.monsters?.items?.$ref === "#/$defs/monsterRecord", "monster sets must contain canonical monster records");
const itemTextFields = ["id", "itemId", "unidentifiedName", "identifiedName", "description", "authored", "provenance"];
expectSameArray(Object.keys(itemTextRecordSchema.properties ?? {}), itemTextFields, "Item-text field inventory");
expectSameArray(itemTextRecordSchema.required ?? [], itemTextFields.filter((field) => !["authored", "provenance"].includes(field)), "Item-text authored field inventory");
expect(itemTextRecordSchema.properties?.provenance?.$ref === "#/$defs/provenance", "item text provenance must reference canonical provenance");
expectSameArray(itemTextRecordSchema["x-providence-rust-optional"] ?? [], ["provenance"], "Item-text migration-optional Rust inventory");
expectSameArray(itemTextRecordSchema["x-providence-rust-skip-none"] ?? [], ["provenance"], "Item-text omitted empty provenance inventory");
const spellOverrideFields = ["id", "range1", "range2", "queueIcon", "toHitBonus", "saveBonus", "fixedTargetNum", "canRotate", "saveAdjust", "cannot", "resistAdjust", "cost", "damage1", "damage2", "powerDamage1", "powerDamage2", "duration1", "duration2", "powerDuration1", "powerDuration2", "spellLook1", "spellLook2", "sound1", "sound2", "targetType", "size", "special", "damageType", "spellClass", "inCombat", "inCamp", "displayName", "description", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(scenarioSpellOverrideSchema.properties ?? {}), spellOverrideFields, "Spell-override field inventory");
expectSameArray(scenarioSpellOverrideSchema.required ?? [], spellOverrideFields.filter((field) => !["displayName", "description", "rawBytes", "authored", "provenance"].includes(field)), "Spell-override authored field inventory");
expect(scenarioSpellOverrideSchema.properties?.rawBytes?.minItems === 30 && scenarioSpellOverrideSchema.properties?.rawBytes?.maxItems === 30, "spell-override rawBytes must retain one complete Data Spell row when compatibility bytes are present");
expectSameArray(scenarioSpellOverrideSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Spell-override omitted empty compatibility inventory");
const raceOverrideFields = ["id", "displayName", "plusMinusToHit", "specialAbility", "drvBonus", "attBonus", "minMax", "spare", "conditions", "maxAge", "doesNotDie", "baseMove", "magRes", "twoHand", "missile", "numOfAttacks", "canCaste", "ageRange", "ageChange", "canRegenerate", "defaultIconSet", "itemTypes", "descriptors", "spacer", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(scenarioRaceOverrideSchema.properties ?? {}), raceOverrideFields, "Race-override field inventory");
expectSameArray(scenarioRaceOverrideSchema.required ?? [], raceOverrideFields.filter((field) => !["displayName", "spare", "spacer", "rawBytes", "authored", "provenance"].includes(field)), "Race-override authored field inventory");
for (const [field, length] of [["plusMinusToHit", 8], ["specialAbility", 14], ["drvBonus", 8], ["attBonus", 6], ["minMax", 12], ["spare", 8], ["conditions", 40], ["numOfAttacks", 2], ["canCaste", 30], ["ageRange", 5], ["ageChange", 5], ["itemTypes", 2], ["spacer", 31]]) {
  expect(scenarioRaceOverrideSchema.properties?.[field]?.minItems === length && scenarioRaceOverrideSchema.properties?.[field]?.maxItems === length, `race overrides must retain ${length} ${field} slots`);
}
expect(scenarioRaceOverrideSchema.properties?.ageRange?.items?.minItems === 2 && scenarioRaceOverrideSchema.properties?.ageRange?.items?.maxItems === 2, "race age ranges must retain two bounds per band");
expect(scenarioRaceOverrideSchema.properties?.ageChange?.items?.minItems === 15 && scenarioRaceOverrideSchema.properties?.ageChange?.items?.maxItems === 15, "race age changes must retain fifteen values per band");
expect(scenarioRaceOverrideSchema.properties?.rawBytes?.minItems === 408 && scenarioRaceOverrideSchema.properties?.rawBytes?.maxItems === 408, "race-override rawBytes must retain one complete Data Race row when compatibility bytes are present");
expectSameArray(scenarioRaceOverrideSchema["x-providence-rust-optional"] ?? [], ["spare", "spacer"], "Race-override optional compatibility inventory");
expectSameArray(scenarioRaceOverrideSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Race-override omitted empty compatibility inventory");
const casteOverrideFields = ["id", "displayName", "specialAbility", "drvBonus", "attBonus", "spellcasters", "minMax", "conditions", "canUseMissile", "getsMissileBonus", "stamina", "strength", "dodge", "toHit", "missile", "hand2Hand", "spare1", "spare2", "casteClass", "minimumAgeGroup", "moveBonus", "magRes", "twoHand", "maxStaminaBonus", "bonusAttacks", "maxAttacks", "victory", "startMoney", "startItems", "attacks", "itemTypes", "defaultIcon", "maxSpellsAttacks", "spellsSoFar", "spacer", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(scenarioCasteOverrideSchema.properties ?? {}), casteOverrideFields, "Caste-override field inventory");
expectSameArray(scenarioCasteOverrideSchema.required ?? [], casteOverrideFields.filter((field) => !["displayName", "spare1", "spare2", "spacer", "rawBytes", "authored", "provenance"].includes(field)), "Caste-override authored field inventory");
for (const [field, length] of [["specialAbility", 2], ["drvBonus", 8], ["attBonus", 6], ["spellcasters", 4], ["minMax", 12], ["conditions", 40], ["stamina", 2], ["strength", 2], ["dodge", 2], ["toHit", 2], ["missile", 2], ["hand2Hand", 2], ["spare1", 2], ["spare2", 2], ["victory", 30], ["startItems", 20], ["attacks", 10], ["itemTypes", 2], ["spacer", 63]]) {
  expect(scenarioCasteOverrideSchema.properties?.[field]?.minItems === length && scenarioCasteOverrideSchema.properties?.[field]?.maxItems === length, `caste overrides must retain ${length} ${field} slots`);
}
expect(scenarioCasteOverrideSchema.properties?.specialAbility?.items?.minItems === 14 && scenarioCasteOverrideSchema.properties?.specialAbility?.items?.maxItems === 14, "caste special-ability rows must retain fourteen values");
expect(scenarioCasteOverrideSchema.properties?.spellcasters?.items?.minItems === 3 && scenarioCasteOverrideSchema.properties?.spellcasters?.items?.maxItems === 3, "caste spellcaster rows must retain three values");
expect(scenarioCasteOverrideSchema.properties?.rawBytes?.minItems === 576 && scenarioCasteOverrideSchema.properties?.rawBytes?.maxItems === 576, "caste-override rawBytes must retain one complete Data Caste row when compatibility bytes are present");
expectSameArray(scenarioCasteOverrideSchema["x-providence-rust-optional"] ?? [], ["spare1", "spare2", "spacer"], "Caste-override optional compatibility inventory");
expectSameArray(scenarioCasteOverrideSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Caste-override omitted empty compatibility inventory");
const encounterActionFields = ["slot", "rawCode", "id"];
expectSameArray(Object.keys(encounterActionRowSchema.properties ?? {}), encounterActionFields, "Encounter action field inventory");
expectSameArray(encounterActionRowSchema.required ?? [], encounterActionFields, "Encounter action required field inventory");
expect(encounterActionRowSchema.properties?.slot?.minimum === 0 && encounterActionRowSchema.properties?.slot?.maximum === 31, "encounter action slots must match Realmz's 32 action rows");
expect(encounterActionRowSchema.properties?.rawCode?.minimum === -128 && encounterActionRowSchema.properties?.rawCode?.maximum === 127, "encounter action CODE must retain the signed byte domain");
const simpleEncounterFields = ["id", "actions", "choiceResults", "canBackOut", "maxTimes", "casteSuccess", "prompt", "texts", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(simpleEncounterRecordSchema.properties ?? {}), simpleEncounterFields, "Simple-encounter field inventory");
expectSameArray(simpleEncounterRecordSchema.required ?? [], simpleEncounterFields.filter((field) => !["rawBytes", "authored"].includes(field)), "Simple-encounter authored field inventory");
expect(simpleEncounterRecordSchema.properties?.actions?.items?.$ref === "#/$defs/encounterActionRow", "simple encounters must contain canonical encounter action rows");
expect(simpleEncounterRecordSchema.properties?.choiceResults?.minItems === 4 && simpleEncounterRecordSchema.properties?.choiceResults?.maxItems === 4, "simple encounters must retain four choice-result slots");
expect(simpleEncounterRecordSchema.properties?.texts?.minItems === 4 && simpleEncounterRecordSchema.properties?.texts?.maxItems === 4, "simple encounters must retain four inline text slots");
expect(simpleEncounterRecordSchema.properties?.rawBytes?.minItems === 426 && simpleEncounterRecordSchema.properties?.rawBytes?.maxItems === 426, "simple-encounter rawBytes must retain one complete Realmz row when compatibility bytes are present");
expectSameArray(simpleEncounterRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Simple-encounter omitted empty compatibility inventory");
const complexEncounterFields = ["id", "actions", "actionResult", "wordResult", "groups", "spellIds", "spellResults", "itemIds", "itemResults", "choiceResults", "wordResults", "canBackOut", "thief", "maxTimes", "casteSuccess", "thiefSuccess", "thiefFail", "prompt", "texts", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(complexEncounterRecordSchema.properties ?? {}), complexEncounterFields, "Complex-encounter field inventory");
expectSameArray(complexEncounterRecordSchema.required ?? [], complexEncounterFields.filter((field) => !["choiceResults", "wordResults", "rawBytes", "authored"].includes(field)), "Complex-encounter authored field inventory");
expect(complexEncounterRecordSchema.properties?.actions?.items?.$ref === "#/$defs/encounterActionRow", "complex encounters must contain canonical encounter action rows");
for (const [field, length] of [["groups", 8], ["spellIds", 10], ["spellResults", 10], ["itemIds", 5], ["itemResults", 5], ["texts", 9]]) {
  expect(complexEncounterRecordSchema.properties?.[field]?.minItems === length && complexEncounterRecordSchema.properties?.[field]?.maxItems === length, `complex encounters must retain ${length} ${field} slots`);
}
expect(complexEncounterRecordSchema.properties?.choiceResults?.["x-providence-migration-only"] === true && complexEncounterRecordSchema.properties?.wordResults?.["x-providence-migration-only"] === true, "complex encounter aliases must remain migration-only");
expect(complexEncounterRecordSchema.properties?.rawBytes?.minItems === 520 && complexEncounterRecordSchema.properties?.rawBytes?.maxItems === 520, "complex-encounter rawBytes must retain one complete Realmz row when compatibility bytes are present");
expectSameArray(complexEncounterRecordSchema["x-providence-rust-skip-empty"] ?? [], ["choiceResults", "wordResults", "rawBytes"], "Complex-encounter omitted migration and compatibility inventory");
const thiefEncounterFields = ["id", "typeFlags", "modifiers", "successCodes", "failureCodes", "successText", "failureText", "successSounds", "failureSounds", "spell", "lowDamage", "highDamage", "tumblers", "prompts", "promptSounds", "rawBytes", "authored", "provenance"];
expectSameArray(Object.keys(thiefEncounterRecordSchema.properties ?? {}), thiefEncounterFields, "Thief-encounter field inventory");
expectSameArray(thiefEncounterRecordSchema.required ?? [], thiefEncounterFields.filter((field) => !["rawBytes", "authored"].includes(field)), "Thief-encounter authored field inventory");
for (const [field, length] of [["typeFlags", 10], ["modifiers", 8], ["successCodes", 8], ["failureCodes", 8], ["successText", 8], ["failureText", 8], ["successSounds", 8], ["failureSounds", 8], ["prompts", 3], ["promptSounds", 3]]) {
  expect(thiefEncounterRecordSchema.properties?.[field]?.minItems === length && thiefEncounterRecordSchema.properties?.[field]?.maxItems === length, `thief encounters must retain ${length} ${field} slots`);
}
expect(thiefEncounterRecordSchema.properties?.rawBytes?.minItems === 118 && thiefEncounterRecordSchema.properties?.rawBytes?.maxItems === 118, "thief-encounter rawBytes must retain one complete Realmz row when compatibility bytes are present");
expectSameArray(thiefEncounterRecordSchema["x-providence-rust-skip-empty"] ?? [], ["rawBytes"], "Thief-encounter omitted compatibility inventory");
const timedEncounterFields = ["id", "day", "increment", "percent", "door", "requiredLevel", "requiredRandomRect", "requiredX", "requiredY", "requiredItem", "requiredQuest", "locationKind", "authored", "provenance"];
expectSameArray(Object.keys(timedEncounterRecordSchema.properties ?? {}), timedEncounterFields, "Timed-encounter field inventory");
expectSameArray(timedEncounterRecordSchema.required ?? [], timedEncounterFields.filter((field) => field !== "authored"), "Timed-encounter authored field inventory");
expectSameArray(timedEncounterLocationKindSchema.enum ?? [], ["any", "land", "dungeon"], "Timed-encounter location-kind vocabulary");
expect(timedEncounterRecordSchema.properties?.locationKind?.$ref === "#/$defs/timedEncounterLocationKind", "timed encounters must reference the canonical location-kind enum");
expect(!Object.hasOwn(timedEncounterRecordSchema, "x-providence-rust-skip-empty"), "timed encounters must not retain record-local compatibility storage");
const recordCompatibilityFields = recordDefinitions.flatMap((definition) =>
  Object.entries(definition.properties ?? {})
    .filter(([, property]) => property["x-providence-compatibility-only"] === true)
    .map(([field]) => `${definition["x-providence-rust-name"]}.${field}`)
);
expectSameSet(recordCompatibilityFields, ["ScenarioItemRecord.rawBytes", "TreasureRecord.rawBytes", "ShopRecord.rawBytes", "MessageRecord.rawBytes", "OptionLabelRecord.rawBytes", "BattleRecord.rawBytes", "MonsterRecord.rawBytes", "MonsterDescriptionRecord.rawBytes", "ScenarioSpellOverride.rawBytes", "ScenarioRaceOverride.spare", "ScenarioRaceOverride.spacer", "ScenarioRaceOverride.rawBytes", "ScenarioCasteOverride.spare1", "ScenarioCasteOverride.spare2", "ScenarioCasteOverride.spacer", "ScenarioCasteOverride.rawBytes", "SimpleEncounterRecord.rawBytes", "ComplexEncounterRecord.rawBytes", "ThiefEncounterRecord.rawBytes"], "Record compatibility-only field inventory");
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
  "export type TileAttributeConfidence = ProvidenceTileAttributeConfidence;",
  "export type TileAttributeSourceKind = ProvidenceTileAttributeSourceKind;",
  "export type TileAttributeFlag = ProvidenceTileAttributeFlag;",
  "export type TileEditableScope = ProvidenceTileEditableScope;",
  "export type TileAttributeProfile = ProvidenceTileAttributeProfile;",
  "export type MapstatsRecord = ProvidenceMapstatsRecord;",
  "export type LandlookRangeSlot = ProvidenceLandlookRangeSlot;",
  "export type LandlookWriterGate = ProvidenceLandlookWriterGate;",
  "export type CustomLandlookMetadata = ProvidenceCustomLandlookMetadata;",
  "export type TriggerRecord = ProvidenceTriggerRecord;",
  "export type Action = ProvidenceAction;",
  "export type ExtraCodeRow = ProvidenceExtraCodeRow;",
  "export type MonsterIconOverride = ProvidenceMonsterIconOverride;",
  "export type ScenarioIconResource = ProvidenceScenarioIconResource;",
  "export type AssetImportTarget = ProvidenceAssetImportTarget;",
  "export type ManagedAssetLibraryScope = ProvidenceManagedAssetLibraryScope;",
  "export type ImageFitMode = ProvidenceImageFitMode;",
  "export type ImageScaleMode = ProvidenceImageScaleMode;",
  "export type ImageMatte = ProvidenceImageMatte;",
  "export type PaletteMode = ProvidencePaletteMode;",
  "export type DitherMode = ProvidenceDitherMode;",
  "export type ManagedAssetKind = ProvidenceManagedAssetKind;",
  "export type ManagedAssetExportState = ProvidenceManagedAssetExportState;",
  "export type ManagedAssetConversion = ProvidenceManagedAssetConversion;",
  "export type ManagedAsset = ProvidenceManagedAsset;",
  "export type TilesetAsset = ProvidenceTilesetAsset;",
  "export type ResourceAsset = ProvidenceResourceAsset;",
  "export type AssetCatalog = ProvidenceAssetCatalog;",
  "export type ScenarioItemRecord = ProvidenceScenarioItemRecord;",
  "export type TreasureRecord = ProvidenceTreasureRecord;",
  "export type ShopRecord = ProvidenceShopRecord;",
  "export type MessageRecord = ProvidenceMessageRecord;",
  "export type OptionLabelRecord = ProvidenceOptionLabelRecord;",
  "export type BattleRecord = ProvidenceBattleRecord;",
  "export type MonsterRecord = ProvidenceMonsterRecord;",
  "export type MonsterDescriptionRecord = ProvidenceMonsterDescriptionRecord;",
  "export type MonsterSetId = ProvidenceMonsterSetId;",
  "export type MonsterSet = ProvidenceMonsterSet;",
  "export type ItemTextRecord = ProvidenceItemTextRecord;",
  "export type ScenarioSpellOverride = ProvidenceScenarioSpellOverride;",
  "export type ScenarioRaceOverride = ProvidenceScenarioRaceOverride;",
  "export type ScenarioCasteOverride = ProvidenceScenarioCasteOverride;",
  "export type EncounterActionRow = ProvidenceEncounterActionRow;",
  "export type SimpleEncounterRecord = ProvidenceSimpleEncounterRecord;",
  "export type ComplexEncounterRecord = ProvidenceComplexEncounterRecord;",
  "export type ThiefEncounterRecord = ProvidenceThiefEncounterRecord;",
  "export type TimedEncounterLocationKind = ProvidenceTimedEncounterLocationKind;",
  "export type TimedEncounterRecord = ProvidenceTimedEncounterRecord;",
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
expect(typesSource.includes("assetCatalog: AssetCatalog;"), "Project must consume the generated AssetCatalog alias");
expect(!typesSource.includes('export type ProjectOrigin = "authored"'), "types.ts must not handwrite ProjectOrigin");
expect(!typesSource.includes("export type ProjectSource = {"), "types.ts must not handwrite ProjectSource");
expect(!typesSource.includes("export type SourceFile = {"), "types.ts must not handwrite SourceFile");
expect(!typesSource.includes("export type Provenance = {"), "types.ts must not handwrite Provenance");
for (const mapType of ["MapRender", "MapEntity", "LandLayout", "MapMarker", "MapRecordRect", "MapRecord", "RandomRect", "RandomLevel"]) {
  expect(!typesSource.includes(`export type ${mapType} = {`), `types.ts must not handwrite ${mapType}`);
}
for (const landlookType of ["TileAttributeProfile", "MapstatsRecord", "LandlookRangeSlot", "LandlookWriterGate", "CustomLandlookMetadata"]) {
  expect(!typesSource.includes(`export type ${landlookType} = {`), `types.ts must not handwrite ${landlookType}`);
}
expect(!typesSource.includes("export type TriggerRecord = {"), "types.ts must not handwrite TriggerRecord");
expect(!typesSource.includes("export type Action = {"), "types.ts must not handwrite Action");
expect(!typesSource.includes("export type ExtraCodeRow = {"), "types.ts must not handwrite ExtraCodeRow");
for (const assetType of ["MonsterIconOverride", "ScenarioIconResource", "ManagedAssetConversion", "ManagedAsset", "TilesetAsset", "ResourceAsset"]) {
  expect(!typesSource.includes(`export type ${assetType} = {`), `types.ts must not handwrite ${assetType}`);
}
for (const assetEnum of ["ManagedAssetKind", "ManagedAssetExportState", "ManagedAssetLibraryScope", "AssetImportTarget", "ImageFitMode", "ImageScaleMode", "ImageMatte", "PaletteMode", "DitherMode"]) {
  expect(!typesSource.includes(`export type ${assetEnum} = \"`), `types.ts must not handwrite ${assetEnum}`);
}
expect(!typesSource.includes("export type ScenarioItemRecord = {"), "types.ts must not handwrite ScenarioItemRecord");
expect(!typesSource.includes("export type TreasureRecord = {"), "types.ts must not handwrite TreasureRecord");
expect(!typesSource.includes("export type ShopRecord = {"), "types.ts must not handwrite ShopRecord");
expect(!typesSource.includes("export type MessageRecord = {"), "types.ts must not handwrite MessageRecord");
expect(!typesSource.includes("export type OptionLabelRecord = {"), "types.ts must not handwrite OptionLabelRecord");
expect(!typesSource.includes("export type BattleRecord = {"), "types.ts must not handwrite BattleRecord");
expect(!typesSource.includes("export type MonsterRecord = {"), "types.ts must not handwrite MonsterRecord");
expect(!typesSource.includes("export type MonsterDescriptionRecord = {"), "types.ts must not handwrite MonsterDescriptionRecord");
expect(!typesSource.includes("export type MonsterSet = {"), "types.ts must not handwrite MonsterSet");
expect(!typesSource.includes("export type ItemTextRecord = {"), "types.ts must not handwrite ItemTextRecord");
expect(!typesSource.includes("export type ScenarioSpellOverride = {"), "types.ts must not handwrite ScenarioSpellOverride");
expect(!typesSource.includes("export type ScenarioRaceOverride = {"), "types.ts must not handwrite ScenarioRaceOverride");
expect(!typesSource.includes("export type ScenarioCasteOverride = {"), "types.ts must not handwrite ScenarioCasteOverride");
expect(!typesSource.includes("export type EncounterActionRow = {"), "types.ts must not handwrite EncounterActionRow");
expect(!typesSource.includes("export type SimpleEncounterRecord = {"), "types.ts must not handwrite SimpleEncounterRecord");
expect(!typesSource.includes("export type ComplexEncounterRecord = {"), "types.ts must not handwrite ComplexEncounterRecord");
expect(!typesSource.includes("export type ThiefEncounterRecord = {"), "types.ts must not handwrite ThiefEncounterRecord");
expect(!typesSource.includes("export type TimedEncounterRecord = {"), "types.ts must not handwrite TimedEncounterRecord");
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
  "TileAttributeConfidence",
  "TileAttributeSourceKind",
  "TileAttributeFlag",
  "TileEditableScope",
  "TileAttributeProfile",
  "MapstatsRecord",
  "LandlookRangeSlot",
  "LandlookWriterGate",
  "CustomLandlookMetadata",
  "ActionCategory",
  "MapCoordinate",
  "Action",
  "TriggerRecord",
  "ExtraCodeRow",
  "MonsterIconOverrideSource",
  "MonsterIconOverride",
  "ScenarioIconResourceSource",
  "ScenarioIconResource",
  "AssetImportTarget",
  "ManagedAssetLibraryScope",
  "ImageFitMode",
  "ImageScaleMode",
  "ImageMatte",
  "PaletteMode",
  "DitherMode",
  "ManagedAssetKind",
  "ManagedAssetExportState",
  "ManagedAssetConversion",
  "ManagedAsset",
  "TilesetAsset",
  "ResourceAsset",
  "AssetCatalog",
  "ScenarioContactInfo",
  "ScenarioGlobalMacroHooks",
  "ScenarioMeta",
  "ScenarioItemRecord",
  "ScenarioRestrictions",
  "ScenarioShell",
  "ScenarioSupportFile",
  "ShopRecord",
  "MessageRecord",
  "OptionLabelRecord",
  "BattleRecord",
  "MonsterRecord",
  "MonsterDescriptionRecord",
  "MonsterSet",
  "ItemTextRecord",
  "ScenarioSpellOverride",
  "ScenarioRaceOverride",
  "ScenarioCasteOverride",
  "EncounterActionRow",
  "SimpleEncounterRecord",
  "ComplexEncounterRecord",
  "ThiefEncounterRecord",
  "TimedEncounterLocationKind",
  "TimedEncounterRecord",
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
expect(!rustProjectSource.includes("pub struct TileAttributeProfile {"), "project.rs must not handwrite TileAttributeProfile");
expect(!rustProjectSource.includes("pub struct MapstatsRecord {"), "project.rs must not handwrite MapstatsRecord");
expect(!rustProjectSource.includes("pub struct LandlookRangeSlot {"), "project.rs must not handwrite LandlookRangeSlot");
expect(!rustProjectSource.includes("pub struct LandlookWriterGate {"), "project.rs must not handwrite LandlookWriterGate");
expect(!rustProjectSource.includes("pub struct CustomLandlookMetadata {"), "project.rs must not handwrite CustomLandlookMetadata");
expect(!rustProjectSource.includes("pub enum TileAttributeConfidence {"), "project.rs must not handwrite TileAttributeConfidence");
expect(!rustProjectSource.includes("pub enum TileAttributeSourceKind {"), "project.rs must not handwrite TileAttributeSourceKind");
expect(!rustProjectSource.includes("pub enum TileAttributeFlag {"), "project.rs must not handwrite TileAttributeFlag");
expect(!rustProjectSource.includes("pub enum ActionCategory {"), "project.rs must not handwrite ActionCategory");
expect(!rustProjectSource.includes("pub struct MapCoordinate {"), "project.rs must not handwrite MapCoordinate");
expect(!rustProjectSource.includes("pub struct Action {"), "project.rs must not handwrite Action");
expect(!rustProjectSource.includes("pub struct TriggerRecord {"), "project.rs must not handwrite TriggerRecord");
expect(!rustProjectSource.includes("pub struct ExtraCodeRow {"), "project.rs must not handwrite ExtraCodeRow");
for (const assetStruct of ["MonsterIconOverride", "ScenarioIconResource", "ManagedAssetConversion", "ManagedAsset", "TilesetAsset", "ResourceAsset", "AssetCatalog"]) {
  expect(!rustProjectSource.includes(`pub struct ${assetStruct} {`), `project.rs must not handwrite ${assetStruct}`);
}
for (const assetEnum of ["MonsterIconOverrideSource", "ScenarioIconResourceSource", "AssetImportTarget", "ManagedAssetLibraryScope", "ImageFitMode", "ImageScaleMode", "ImageMatte", "PaletteMode", "DitherMode", "ManagedAssetKind", "ManagedAssetExportState"]) {
  expect(!rustProjectSource.includes(`pub enum ${assetEnum} {`), `project.rs must not handwrite ${assetEnum}`);
}
expect(!rustProjectSource.includes("pub struct ScenarioItemRecord {"), "project.rs must not handwrite ScenarioItemRecord");
expect(!rustProjectSource.includes("pub struct TreasureRecord {"), "project.rs must not handwrite TreasureRecord");
expect(!rustProjectSource.includes("pub struct ShopRecord {"), "project.rs must not handwrite ShopRecord");
expect(!rustProjectSource.includes("pub struct MessageRecord {"), "project.rs must not handwrite MessageRecord");
expect(!rustProjectSource.includes("pub struct OptionLabelRecord {"), "project.rs must not handwrite OptionLabelRecord");
expect(!rustProjectSource.includes("pub struct BattleRecord {"), "project.rs must not handwrite BattleRecord");
expect(!rustProjectSource.includes("pub struct MonsterRecord {"), "project.rs must not handwrite MonsterRecord");
expect(!rustProjectSource.includes("pub struct MonsterDescriptionRecord {"), "project.rs must not handwrite MonsterDescriptionRecord");
expect(!rustProjectSource.includes("pub struct MonsterSet {"), "project.rs must not handwrite MonsterSet");
expect(!rustProjectSource.includes("pub struct ItemTextRecord {"), "project.rs must not handwrite ItemTextRecord");
expect(!rustProjectSource.includes("pub struct ScenarioSpellOverride {"), "project.rs must not handwrite ScenarioSpellOverride");
expect(!rustProjectSource.includes("pub struct ScenarioRaceOverride {"), "project.rs must not handwrite ScenarioRaceOverride");
expect(!rustProjectSource.includes("pub struct ScenarioCasteOverride {"), "project.rs must not handwrite ScenarioCasteOverride");
expect(!rustProjectSource.includes("pub struct EncounterActionRow {"), "project.rs must not handwrite EncounterActionRow");
expect(!rustProjectSource.includes("pub struct SimpleEncounterRecord {"), "project.rs must not handwrite SimpleEncounterRecord");
expect(!rustProjectSource.includes("pub struct ComplexEncounterRecord {"), "project.rs must not handwrite ComplexEncounterRecord");
expect(!rustProjectSource.includes("pub struct ThiefEncounterRecord {"), "project.rs must not handwrite ThiefEncounterRecord");
expect(!rustProjectSource.includes("pub struct TimedEncounterRecord {"), "project.rs must not handwrite TimedEncounterRecord");
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
    `export const PROVIDENCE_TILE_ATTRIBUTE_FIELDS = ${JSON.stringify(Object.keys(tileAttributeProfileSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_CUSTOM_LANDLOOK_FIELDS = ${JSON.stringify(Object.keys(customLandlookMetadataSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_TRIGGER_FIELDS = ${JSON.stringify(Object.keys(triggerRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_ACTION_FIELDS = ${JSON.stringify(Object.keys(actionSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_EXTRA_CODE_FIELDS = ${JSON.stringify(Object.keys(extraCodeRowSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_MONSTER_ICON_OVERRIDE_FIELDS = ${JSON.stringify(Object.keys(monsterIconOverrideSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SCENARIO_ICON_RESOURCE_FIELDS = ${JSON.stringify(Object.keys(scenarioIconResourceSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_MANAGED_ASSET_FIELDS = ${JSON.stringify(Object.keys(managedAssetSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_ASSET_CATALOG_FIELDS = ${JSON.stringify(Object.keys(assetCatalogSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SCENARIO_ITEM_FIELDS = ${JSON.stringify(Object.keys(scenarioItemRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_TREASURE_FIELDS = ${JSON.stringify(Object.keys(treasureRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SHOP_FIELDS = ${JSON.stringify(Object.keys(shopRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_MESSAGE_FIELDS = ${JSON.stringify(Object.keys(messageRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_OPTION_LABEL_FIELDS = ${JSON.stringify(Object.keys(optionLabelRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_BATTLE_FIELDS = ${JSON.stringify(Object.keys(battleRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_MONSTER_FIELDS = ${JSON.stringify(Object.keys(monsterRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_MONSTER_DESCRIPTION_FIELDS = ${JSON.stringify(Object.keys(monsterDescriptionRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_MONSTER_SET_FIELDS = ${JSON.stringify(Object.keys(monsterSetSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_ITEM_TEXT_FIELDS = ${JSON.stringify(Object.keys(itemTextRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SPELL_OVERRIDE_FIELDS = ${JSON.stringify(Object.keys(scenarioSpellOverrideSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_RACE_OVERRIDE_FIELDS = ${JSON.stringify(Object.keys(scenarioRaceOverrideSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_CASTE_OVERRIDE_FIELDS = ${JSON.stringify(Object.keys(scenarioCasteOverrideSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_SIMPLE_ENCOUNTER_FIELDS = ${JSON.stringify(Object.keys(simpleEncounterRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_COMPLEX_ENCOUNTER_FIELDS = ${JSON.stringify(Object.keys(complexEncounterRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_THIEF_ENCOUNTER_FIELDS = ${JSON.stringify(Object.keys(thiefEncounterRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    `export const PROVIDENCE_TIMED_ENCOUNTER_FIELDS = ${JSON.stringify(Object.keys(timedEncounterRecordSchema.properties ?? {}), null, 2)} as const;\n\n` +
    renderTypeScriptEnum(projectOrigin) + `\n` +
    renderTypeScriptEnum(sourceFileRole) + `\n` +
    renderTypeScriptEnum(confidence) + `\n` +
    renderTypeScriptObject(provenance["x-providence-typescript-name"], provenance, new Set()) + `\n` +
    mapDefinitions.map(renderTypeScriptDefinition).join("\n") + `\n` +
    landlookDefinitions.map(renderTypeScriptDefinition).join("\n") + `\n` +
    assetDefinitions.map(renderTypeScriptDefinition).join("\n") + `\n` +
    renderTypeScriptEnum(timedEncounterLocationKindSchema) + `\n` +
    renderTypeScriptEnum(monsterSetIdSchema) + `\n` +
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
    `pub const PROVIDENCE_TILE_ATTRIBUTE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(tileAttributeProfileSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_CUSTOM_LANDLOOK_FIELDS: &[&str] = &[\n${renderArray(Object.keys(customLandlookMetadataSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_TRIGGER_FIELDS: &[&str] = &[\n${renderArray(Object.keys(triggerRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_ACTION_FIELDS: &[&str] = &[\n${renderArray(Object.keys(actionSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_EXTRA_CODE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(extraCodeRowSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_MONSTER_ICON_OVERRIDE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(monsterIconOverrideSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SCENARIO_ICON_RESOURCE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(scenarioIconResourceSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_MANAGED_ASSET_FIELDS: &[&str] = &[\n${renderArray(Object.keys(managedAssetSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_ASSET_CATALOG_FIELDS: &[&str] = &[\n${renderArray(Object.keys(assetCatalogSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SCENARIO_ITEM_FIELDS: &[&str] = &[\n${renderArray(Object.keys(scenarioItemRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_TREASURE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(treasureRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SHOP_FIELDS: &[&str] = &[\n${renderArray(Object.keys(shopRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_MESSAGE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(messageRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_OPTION_LABEL_FIELDS: &[&str] = &[\n${renderArray(Object.keys(optionLabelRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_BATTLE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(battleRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_MONSTER_FIELDS: &[&str] = &[\n${renderArray(Object.keys(monsterRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_MONSTER_DESCRIPTION_FIELDS: &[&str] = &[\n${renderArray(Object.keys(monsterDescriptionRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_MONSTER_SET_FIELDS: &[&str] = &[\n${renderArray(Object.keys(monsterSetSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_ITEM_TEXT_FIELDS: &[&str] = &[\n${renderArray(Object.keys(itemTextRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SPELL_OVERRIDE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(scenarioSpellOverrideSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_RACE_OVERRIDE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(scenarioRaceOverrideSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_CASTE_OVERRIDE_FIELDS: &[&str] = &[\n${renderArray(Object.keys(scenarioCasteOverrideSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_SIMPLE_ENCOUNTER_FIELDS: &[&str] = &[\n${renderArray(Object.keys(simpleEncounterRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_COMPLEX_ENCOUNTER_FIELDS: &[&str] = &[\n${renderArray(Object.keys(complexEncounterRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_THIEF_ENCOUNTER_FIELDS: &[&str] = &[\n${renderArray(Object.keys(thiefEncounterRecordSchema.properties ?? {}))}\n];\n\n` +
    `#[allow(dead_code)]\n` +
    `pub const PROVIDENCE_TIMED_ENCOUNTER_FIELDS: &[&str] = &[\n${renderArray(Object.keys(timedEncounterRecordSchema.properties ?? {}))}\n];\n\n` +
    renderRustEnum(projectOrigin) + `\n` +
    renderRustEnum(sourceFileRole) + `\n` +
    renderRustEnum(confidence) + `\n` +
    renderRustStruct(provenance) + `\n` +
    mapDefinitions.map(renderRustDefinition).join("\n") + `\n` +
    landlookDefinitions.map(renderRustDefinition).join("\n") + `\n` +
    assetDefinitions.map(renderRustDefinition).join("\n") + `\n` +
    renderRustEnum(timedEncounterLocationKindSchema) + `\n` +
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
  if (property["x-providence-typescript-type"]) return property["x-providence-typescript-type"];
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
  const defaultVariant = definition["x-providence-rust-default-variant"];
  const renameAll = definition["x-providence-rust-rename-all"] ?? "kebab-case";
  const aliases = definition["x-providence-rust-aliases"] ?? {};
  const renames = definition["x-providence-rust-renames"] ?? {};
  const variants = (definition.enum ?? []).map((value) => {
    const attributes = [];
    if (value === defaultVariant) attributes.push("    #[default]");
    const legacyAliases = aliases[value] ?? [];
    const serdeNames = [];
    if (renames[value]) serdeNames.push(`rename = ${JSON.stringify(renames[value])}`);
    serdeNames.push(...legacyAliases.map((alias) => `alias = ${JSON.stringify(alias)}`));
    if (serdeNames.length > 0) {
      attributes.push(`    #[serde(${serdeNames.join(", ")})]`);
    }
    attributes.push(`    ${kebabToPascal(value)},`);
    return attributes.join("\n");
  }).join("\n");
  return `#[derive(${derives.join(", ")})]\n#[serde(rename_all = ${JSON.stringify(renameAll)})]\npub enum ${name} {\n${variants}\n}\n`;
}

function renderRustDefinition(definition) {
  return Array.isArray(definition.enum) ? renderRustEnum(definition) : renderRustStruct(definition);
}

function renderRustStruct(definition) {
  const name = definition["x-providence-rust-name"];
  const derives = definition["x-providence-rust-derives"] ?? ["Debug", "Clone", "Serialize", "Deserialize"];
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
      if (skipNoneFields.has(field)) lines.push('    #[serde(default, skip_serializing_if = "Option::is_none")]');
      else if (skipEmptyFields.has(field)) lines.push('    #[serde(default, skip_serializing_if = "Vec::is_empty")]');
      else lines.push("    #[serde(default)]");
    }
    if (rustFieldName !== camelToSnake(field)) lines.push(`    #[serde(rename = ${JSON.stringify(field)})]`);
    lines.push(`    pub ${rustFieldName}: ${optionalFields.has(field) ? `Option<${rustType}>` : rustType},`);
    return lines;
  });
  return `#[derive(${derives.join(", ")})]\n#[serde(rename_all = "camelCase")]\npub struct ${name} {\n${fields.join("\n")}\n}\n`;
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
  return value.split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
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
