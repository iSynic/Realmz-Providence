import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "src/editor/panels/scripts/scriptActionCatalog.ts");
const panelPath = path.join(root, "src/editor/panels/ScriptsPanel.tsx");
const edcdPath = path.join(root, "src/editor/components/EdcdRowEditor.tsx");
const edcdRowsPath = path.join(root, "src/editor/edcdRows.ts");
const appUtilsPath = path.join(root, "src/editor/app/appUtils.ts");
const appBootstrapPath = path.join(root, "src/editor/app/useAppBootstrapEffects.ts");
const semanticPath = path.join(root, "src/editor/browser/semantic.ts");
const browserProjectPath = path.join(root, "src/editor/browser/project.ts");

const catalog = fs.readFileSync(catalogPath, "utf8");
const panel = fs.readFileSync(panelPath, "utf8");
const edcd = fs.readFileSync(edcdPath, "utf8");
const edcdRows = fs.readFileSync(edcdRowsPath, "utf8");
const appUtils = fs.readFileSync(appUtilsPath, "utf8");
const appBootstrap = fs.readFileSync(appBootstrapPath, "utf8");
const semantic = fs.readFileSync(semanticPath, "utf8");
const browserProject = fs.readFileSync(browserProjectPath, "utf8");
const targetPickerPath = path.join(root, "src/editor/components/RealmzTargetPicker.tsx");
const inventoryPath = path.join(root, "src/editor/panels/scripts/scriptInventory.tsx");
const validationPath = path.join(root, "src/editor/scriptValidation.ts");
const scriptDiagnosticsPath = path.join(root, "src/editor/scriptDiagnostics.ts");
const reportScriptDiagnosticsPath = path.join(root, "scripts/report_script_diagnostics.mjs");
const targetPicker = fs.readFileSync(targetPickerPath, "utf8");
const inventory = fs.readFileSync(inventoryPath, "utf8");
const validation = fs.readFileSync(validationPath, "utf8");
const scriptDiagnostics = fs.readFileSync(scriptDiagnosticsPath, "utf8");
const reportScriptDiagnostics = fs.readFileSync(reportScriptDiagnosticsPath, "utf8");

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
  "const ed3Summary = trigger.source === \"Data ED3\" ? ed3DiagnosticForTrigger(project, trigger) : null",
  "ed3Summary?.linterSeverity",
  "`ed3-${ed3Summary.classification}`",
  "ed3Summary.searchTitle"
]) {
  if (!validation.includes(snippet)) failures.push(`Script validation is missing selected ED3 reachability warning support: ${snippet}`);
}

for (const snippet of [
  "extraActionTabClassification",
  "scriptTabKind",
  "global-events",
  "EXTRA_ACTION_INVENTORY_FILTERS",
  "ed3-unlinked",
  "ed3-battle",
  "ed3-monster",
  "isCallableMacro(project, trigger)",
  "return trigger.source === \"Data ED3\"",
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
  "schemaVersion: 5",
  "addBattles(schema, projectParts.battles)",
  "addMonsters(schema, projectParts.monsters, projectParts.monsterSets)",
  "\"calls_battle_macro\"",
  "rawValue: battle.battleMacro",
  "runnable: battle.battleMacro < 0",
  "field: \"deathMacro\"",
  "root.kind === \"calls_battle_macro\" ? \"negative-battle-macro\"",
  "isNegativeBattleMacroLink(link)"
]) {
  if (!semantic.includes(snippet)) failures.push(`Browser semantic schema is missing combat macro reachability support: ${snippet}`);
}
if (
  semantic.indexOf("addBattles(schema, projectParts.battles)") > semantic.indexOf("classifyEd3Reachability(schema, projectParts.triggers)") ||
  semantic.indexOf("addMonsters(schema, projectParts.monsters, projectParts.monsterSets)") > semantic.indexOf("classifyEd3Reachability(schema, projectParts.triggers)")
) {
  failures.push("Browser semantic combat macro links must be built before ED3 reachability classification.");
}

for (const snippet of [
  "function rebuildEd3ReachabilityRows(project: Project)",
  "const rows = rebuildEd3ReachabilityRows(project)",
  "!link.from.startsWith(\"action-slot:macro:\")",
  "for (const battle of project.battles ?? [])",
  "battle:${battle.id}:battleMacro",
  "const addMonsterRoots = (records: Project[\"monsters\"], sourceFile: string)",
  "monster:${sourceFile}:${monster.id}",
  "isNegativeBattleMacroLink(link)",
  "effective-ed3-reachability"
]) {
  if (!scriptDiagnostics.includes(snippet)) failures.push(`Script diagnostics are missing stale ED3 reachability fallback support: ${snippet}`);
}

for (const snippet of [
  "function effectiveEd3ReachabilityRows(project)",
  "function rebuildEd3ReachabilityRows(project)",
  "return rebuildEd3ReachabilityRows(project)",
  "for (const battle of project.battles ?? [])",
  "battle:${battle.id}:battleMacro",
  "const addMonsterRoots = (records, sourceFile)",
  "monster:${sourceFile}:${monster.id}",
  "effective-ed3-reachability"
]) {
  if (!reportScriptDiagnostics.includes(snippet)) failures.push(`Script diagnostics report is missing stale ED3 reachability fallback support: ${snippet}`);
}

for (const snippet of [
  "battles: project.battles",
  "monsters: project.monsters",
  "monsterSets: project.monsterSets",
  "function emptySemanticSchema(schemaVersion = 5)"
]) {
  if (!browserProject.includes(snippet)) failures.push(`Browser semantic project request is missing combat macro input/version support: ${snippet}`);
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
  "Context Notes",
  "Author Note"
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
