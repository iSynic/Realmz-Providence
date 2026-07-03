import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "src/editor/panels/scripts/scriptActionCatalog.ts");
const panelPath = path.join(root, "src/editor/panels/ScriptsPanel.tsx");
const edcdPath = path.join(root, "src/editor/components/EdcdRowEditor.tsx");
const edcdRowsPath = path.join(root, "src/editor/edcdRows.ts");
const appUtilsPath = path.join(root, "src/editor/app/appUtils.ts");
const appBootstrapPath = path.join(root, "src/editor/app/useAppBootstrapEffects.ts");

const catalog = fs.readFileSync(catalogPath, "utf8");
const panel = fs.readFileSync(panelPath, "utf8");
const edcd = fs.readFileSync(edcdPath, "utf8");
const edcdRows = fs.readFileSync(edcdRowsPath, "utf8");
const appUtils = fs.readFileSync(appUtilsPath, "utf8");
const appBootstrap = fs.readFileSync(appBootstrapPath, "utf8");
const targetPickerPath = path.join(root, "src/editor/components/RealmzTargetPicker.tsx");
const inventoryPath = path.join(root, "src/editor/panels/scripts/scriptInventory.tsx");
const validationPath = path.join(root, "src/editor/scriptValidation.ts");
const targetPicker = fs.readFileSync(targetPickerPath, "utf8");
const inventory = fs.readFileSync(inventoryPath, "utf8");
const validation = fs.readFileSync(validationPath, "utf8");

const requiredCatalogExports = [
  "ScriptActionAuthoringLevel",
  "ScriptActionCoverageEntry",
  "ScriptStepFormDefinition",
  "ScriptTargetRoute",
  "ScriptFlowPreviewRoute",
  "SCRIPT_ACTION_COVERAGE",
  "SCRIPT_STEP_FORM_DEFINITIONS",
  "scriptStepFlowRoutes"
];

const failures = [];
for (const name of requiredCatalogExports) {
  if (!catalog.includes(name)) failures.push(`Missing AP catalog coverage export/type: ${name}`);
}

const firstClassMatch = catalog.match(/const FIRST_CLASS_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
if (!firstClassMatch) {
  failures.push("Missing FIRST_CLASS_ACTIONS set.");
} else {
  const firstClass = new Set((firstClassMatch[1].match(/-?\d+/g) ?? []).map(Number));
  for (const opcode of [1, 2, 3, 8, 11, 14, 19, 20, 24, 25, 26, 29, 39, 45, 48, 56, 82, 83, 84, 98, 99, 101, 112, 119, 122, 127]) {
    if (!firstClass.has(opcode)) failures.push(`Common action ${opcode} is not marked first-class.`);
  }
}

const advancedMatch = catalog.match(/const ADVANCED_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
if (!advancedMatch) {
  failures.push("Missing ADVANCED_ACTIONS set.");
} else {
  const advanced = new Set((advancedMatch[1].match(/-?\d+/g) ?? []).map(Number));
  for (const opcode of [7, 84, 98, 99, 101, 112]) {
    if (advanced.has(opcode)) failures.push(`Known authorable action ${opcode} is still forced into the preserved/advanced bucket.`);
  }
}

for (const snippet of [
  "authoringLevel:",
  "validationPosture:",
  "formKind:"
]) {
  if (!catalog.includes(snippet)) failures.push(`ScriptActionDefinition is not populated with ${snippet}`);
}

for (const snippet of [
  "resolveSignedMessageTarget",
  "signedTargetValueForSelection",
  "signedTargetBehaviorLabel"
]) {
  if (!targetPicker.includes(snippet)) failures.push(`Target picker is missing signed message helper: ${snippet}`);
}

if (!validation.includes("resolveSignedMessageTarget(code, id)")) {
  failures.push("Script validation does not normalize signed message targets.");
}

for (const snippet of [
  "extraActionTabClassification",
  "scriptTabKind",
  "global-events",
  "advanced-imports",
  "isCallableMacro(project, trigger)",
  "return extraActionTabClassification(project, trigger) === \"reusable-actions\"",
  "Random Encounter Action",
  "Timed Encounter Action",
  "Source-Linked Extra Action"
]) {
  if (!inventory.includes(snippet)) failures.push(`Script inventory is missing tab classification support: ${snippet}`);
}

for (const snippet of [
  "project.triggers.filter((trigger) => trigger.source === \"Data ED3\"",
  "project.semanticSchema?.decoding?.ed3Reachability",
  "return (project.semanticSchema?.decoding?.ed3Reachability ?? []).length < activeExtraActions"
]) {
  if (!appUtils.includes(snippet)) failures.push(`Semantic mapping stale check is missing ED3 reachability coverage: ${snippet}`);
}

for (const snippet of [
  "isSemanticMappingPending(state.project)",
  "\"scripts\"",
  "buildBrowserSemanticSchemaForProject(project)"
]) {
  if (!appBootstrap.includes(snippet)) failures.push(`App bootstrap is missing Scripts semantic mapping support: ${snippet}`);
}

for (const snippet of [
  "QuestUsageTimeline",
  "Story Flags",
  "Decoded Story Flags",
  "recognizedScenarioContextForProject",
  "Bundled beta note | read-only"
]) {
  if (!panel.includes(snippet)) failures.push(`Scripts panel is missing story flag usage UI: ${snippet}`);
}
if (!panel.includes("moveSelectedStep")) failures.push("Scripts panel does not preserve selected step during move.");

for (const snippet of [
  "combatMacroContextFor",
  "Battle Macro",
  "Monster Macro",
  "Combat Macro Actions",
  "Positive battle macro imports are preserved",
  "definition.opcode === 121 && combatMacroContext",
  "combatMacroContext?.kind === \"battle\") return \"Battle Macro\"",
  "Battle / Monster / Item Action\") return \"Source-Linked Extra Action\""
]) {
  if (!panel.includes(snippet)) failures.push(`Scripts panel is missing context-aware combat macro authoring support: ${snippet}`);
}

for (const snippet of [
  "NOT_USED_ACTION_CODES",
  "const IGNORED_ACTIONS = new Set([0, ...NOT_USED_ACTION_CODES])",
  "definition.authoringLevel === \"ignored\") return false"
]) {
  if (!catalog.includes(snippet)) failures.push(`Action catalog is missing preserve-only chooser filtering support: ${snippet}`);
}

const normalUiSources = [
  ["ScriptsPanel.tsx", panel],
  ["EdcdRowEditor.tsx", edcd]
];
for (const [label, source] of normalUiSources) {
  for (const forbidden of ["Provenance", "writer-gated", "preserved bytes"]) {
    if (source.includes(forbidden)) failures.push(`${label} exposes forbidden normal AP wording: ${forbidden}`);
  }
}

if (/label:\s*["']Opcode\s+\d+/i.test(catalog)) {
  failures.push("Action catalog contains a visible Opcode label.");
}

if (catalog.includes("Preserved Action")) {
  failures.push("Action catalog should not expose generic Preserved Action wording.");
}

for (const snippet of [
  "project.simpleEncounters",
  "project.complexEncounters",
  "contextKind: \"simpleEncounter\"",
  "contextKind: \"complexEncounter\""
]) {
  if (!edcdRows.includes(snippet)) failures.push(`Action Settings usage is missing encounter caller coverage: ${snippet}`);
}

for (const snippet of [
  "Simple Encounter ${caller.triggerRecordIndex}",
  "Complex Encounter ${caller.triggerRecordIndex}"
]) {
  if (!panel.includes(snippet)) failures.push(`Action Settings caller labels do not cover encounter scripts: ${snippet}`);
}

for (const snippet of [
  "Back Up Party",
  "Change Action Point Codes",
  "Get Click",
  "Offer Temple",
  "Continue If Monster Present",
  "Revive NPC After Combat"
]) {
  if (!catalog.includes(snippet)) failures.push(`Action catalog is missing promoted opcode label: ${snippet}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("AP action coverage checks passed.");
