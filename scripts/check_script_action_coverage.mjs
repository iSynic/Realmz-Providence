import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "src/editor/panels/scripts/scriptActionCatalog.ts");
const panelPath = path.join(root, "src/editor/panels/ScriptsPanel.tsx");
const edcdPath = path.join(root, "src/editor/components/EdcdRowEditor.tsx");
const edcdRowsPath = path.join(root, "src/editor/edcdRows.ts");
const edcdTargetsPath = path.join(root, "src/editor/edcdTargets.ts");
const appUtilsPath = path.join(root, "src/editor/app/appUtils.ts");
const appBootstrapPath = path.join(root, "src/editor/app/useAppBootstrapEffects.ts");
const semanticPath = path.join(root, "src/editor/browser/semantic.ts");
const browserProjectPath = path.join(root, "src/editor/browser/project.ts");
const rustProjectPath = path.join(root, "src-tauri/src/project.rs");
const rustValidationPath = path.join(root, "src-tauri/src/validation.rs");
const apOpcodeCoveragePath = path.join(root, "docs/generated/ap-opcode-coverage.json");

const catalog = fs.readFileSync(catalogPath, "utf8");
const panel = fs.readFileSync(panelPath, "utf8");
const edcd = fs.readFileSync(edcdPath, "utf8");
const edcdRows = fs.readFileSync(edcdRowsPath, "utf8");
const edcdTargets = fs.readFileSync(edcdTargetsPath, "utf8");
const appUtils = fs.readFileSync(appUtilsPath, "utf8");
const appBootstrap = fs.readFileSync(appBootstrapPath, "utf8");
const semantic = fs.readFileSync(semanticPath, "utf8");
const browserProject = fs.readFileSync(browserProjectPath, "utf8");
const rustProject = fs.readFileSync(rustProjectPath, "utf8");
const rustValidation = fs.readFileSync(rustValidationPath, "utf8");
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
const apOpcodeCoverage = JSON.parse(fs.readFileSync(apOpcodeCoveragePath, "utf8"));

const requiredCatalogExports = [
  "ScriptActionAuthoringLevel",
  "ScriptActionCoverageEntry",
  "ScriptStepFormDefinition",
  "ScriptTargetRoute",
  "ScriptFlowPreviewRoute",
  "SCRIPT_ACTION_CHOOSER_CONSOLIDATIONS",
  "SCRIPT_ACTION_COVERAGE",
  "SCRIPT_STEP_FORM_DEFINITIONS",
  "canonicalActionChooserOpcode",
  "isActionChooserAliasOpcode",
  "scriptStepFlowRoutes"
];

const failures = [];
const coverageEntries = Array.isArray(apOpcodeCoverage.entries) ? apOpcodeCoverage.entries : [];
const coverageByOpcode = new Map(coverageEntries.map((entry) => [entry.opcode, entry]));
const manualNoneStepOnlyMatch = catalog.match(/const MANUAL_NONE_STEP_ONLY_ACTIONS = new Set\(\[([\s\S]*?)\]\);/);
const manualNoneStepOnlyCodes = new Set((manualNoneStepOnlyMatch?.[1].match(/-?\d+/g) ?? []).map(Number));
const expectedManualNoneStepOnlyCodes = [25, 26, 34, 82, 83, 84, 91, 93, 94, 96, 97, 98, 99, 100, 101, 102];

function coverageEntry(opcode) {
  const entry = coverageByOpcode.get(opcode);
  if (!entry) failures.push(`Opcode audit report is missing opcode ${opcode}.`);
  return entry;
}

function hasCoverageField(entry, label, targetFamily = undefined) {
  return (entry?.providenceFields ?? []).some((field) => {
    if (field.label !== label) return false;
    return targetFamily === undefined || field.targetFamily === targetFamily;
  });
}

function assertCoveragePair(a, b) {
  const left = coverageEntry(a);
  const right = coverageEntry(b);
  if (left && !(left.relatedOpcodes ?? []).includes(b)) {
    failures.push(`Opcode audit report should link ${a} to related opcode ${b}.`);
  }
  if (right && !(right.relatedOpcodes ?? []).includes(a)) {
    failures.push(`Opcode audit report should link ${b} to related opcode ${a}.`);
  }
}

if (apOpcodeCoverage.schemaVersion !== 2) {
  failures.push("Opcode audit report must use schemaVersion 2.");
}
if (!manualNoneStepOnlyMatch) {
  failures.push("Action catalog must declare MANUAL_NONE_STEP_ONLY_ACTIONS.");
}
for (const opcode of expectedManualNoneStepOnlyCodes) {
  if (!manualNoneStepOnlyCodes.has(opcode)) {
    failures.push(`Manual no-option opcode ${opcode} should be in MANUAL_NONE_STEP_ONLY_ACTIONS.`);
  }
}
for (const key of ["crosswalk", "manualHelp", "catalog", "actions"]) {
  if (!apOpcodeCoverage.source?.[key]) failures.push(`Opcode audit report is missing source.${key}.`);
}
if (coverageEntries.length < 120) {
  failures.push(`Opcode audit report has too few entries: ${coverageEntries.length}.`);
}
for (const key of ["counts", "gapCounts", "confidenceCounts"]) {
  const total = Object.values(apOpcodeCoverage[key] ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (total !== coverageEntries.length) {
    failures.push(`Opcode audit report ${key} total ${total} does not match entry count ${coverageEntries.length}.`);
  }
}
for (const entry of coverageEntries) {
  for (const key of ["opcode", "title", "status", "gapStatus", "evidenceConfidence", "manual", "manualNoOptions", "manualNoneStepOnly", "relatedOpcodes", "providenceFields"]) {
    if (!(key in entry)) failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} is missing ${key}.`);
  }
  if (!Array.isArray(entry.manual?.resourceIds)) {
    failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} is missing manual.resourceIds.`);
  }
  if (!Array.isArray(entry.relatedOpcodes)) {
    failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} relatedOpcodes must be an array.`);
  }
  if (!Array.isArray(entry.providenceFields) || entry.providenceFields.length === 0) {
    failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} must list Providence fields.`);
  }
  if (entry.manualNoOptions && !entry.manualNoneStepOnly) {
    failures.push(`Manual no-option opcode ${entry.opcode} should be marked manualNoneStepOnly or explicitly audited as an exception.`);
  }
  if (entry.manualNoneStepOnly && !hasCoverageField(entry, "Step only")) {
    failures.push(`Manual no-option opcode ${entry.opcode} should report a step-only Providence field.`);
  }
}

assertCoveragePair(-23, 23);

const randomAreaCanonical = coverageEntry(23)?.chooserConsolidation;
const randomAreaAlias = coverageEntry(-23)?.chooserConsolidation;
if (randomAreaCanonical?.role !== "canonical" || !(randomAreaCanonical.aliasOpcodes ?? []).includes(-23)) {
  failures.push("Opcode 23 should be documented as the canonical Change Random Encounter Area chooser action for -23.");
}
if (randomAreaAlias?.role !== "alias" || randomAreaAlias.canonicalOpcode !== 23) {
  failures.push("Opcode -23 should be documented as a hidden chooser alias of opcode 23.");
}
if (!String(randomAreaCanonical?.writeRule ?? "").includes("selecting a dungeon map target writes -23")) {
  failures.push("Random encounter area chooser consolidation should document the deterministic land/dungeon write rule.");
}

for (const opcode of [84, 98, 99]) {
  const entry = coverageEntry(opcode);
  if (!entry) continue;
  if (entry.gapStatus !== "legacy-compatible") {
    failures.push(`Registration opcode ${opcode} should stay marked legacy-compatible.`);
  }
  const expectedConfidence = opcode === 84 ? "source-backed" : "manual-backed";
  if (entry.evidenceConfidence !== expectedConfidence) {
    failures.push(`Registration opcode ${opcode} should stay ${expectedConfidence}.`);
  }
  if (!hasCoverageField(entry, "Step only")) {
    failures.push(`Registration opcode ${opcode} should report a step-only Providence field.`);
  }
}

const macro121 = coverageEntry(121);
if (macro121?.gapStatus !== "combat-macro-only") {
  failures.push("Opcode 121 should stay marked combat-macro-only.");
}
if (macro121?.evidenceConfidence !== "source-backed") {
  failures.push("Opcode 121 should stay source-backed.");
}

const scrollingText62 = coverageEntry(62);
if (!hasCoverageField(scrollingText62, "TEXT Resource", "text-resource")) {
  failures.push("Opcode 62 should report a TEXT Resource target field.");
}

const noManualEvidence = coverageEntry(-14);
if (noManualEvidence?.gapStatus !== "needs-manual-evidence") {
  failures.push("Opcode -14 should stay marked needs-manual-evidence until a source/manual backing is found.");
}

for (const opcode of [25, 26, 34, 82, 83, 91, 93, 94, 96, 97, 100, 101, 102]) {
  const entry = coverageEntry(opcode);
  if (entry?.gapStatus !== "step-only-no-options") {
    failures.push(`Manual no-option opcode ${opcode} should stay marked step-only-no-options.`);
  }
}

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

for (const opcode of [84, 98, 99]) {
  const registrationPattern = new RegExp(`${opcode}:\\s*\\{\\s*storage:\\s*"direct-code-id",\\s*formKind:\\s*"step-only",\\s*defaultDraft:\\s*\\{\\s*rawCode:\\s*${opcode},\\s*id:\\s*0\\s*\\}\\s*\\}`);
  if (!registrationPattern.test(catalog)) {
    failures.push(`Registration action ${opcode} should be step-only with a zero ID default.`);
  }
}

for (const snippet of [
  "62: {",
  "label: \"TEXT Resource\"",
  "targetFamily: \"text-resource\"",
  "Classic TEXT resource ID to display"
]) {
  if (!catalog.includes(snippet)) failures.push(`Scrolling-text opcode 62 should be modeled as a TEXT resource target: ${snippet}`);
}

for (const snippet of [
  "const RANDOM_REGION_PARAMETERS",
  "label: \"Encounter Chance\"",
  "Providence edits positive values as percent",
  "aliasOpcode: -23",
  "canonicalOpcode: 23",
  "isActionChooserAliasOpcode(definition.opcode)"
]) {
  if (!catalog.includes(snippet)) failures.push(`Random encounter area authoring is missing unified chooser or percent-facing metadata: ${snippet}`);
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
  "signedTargetBehaviorLabel",
  "return id > 0 ? soundReferenceOption(id) : null",
  "if (label === \"TEXT Resource\") return `TEXT ${value}`",
  "62: { label: \"TEXT Resource\"",
  "const id = code === 62 ? resolvedValue : Math.abs(resolvedValue)",
  "addTextResourceTargets(project, options, catalog)",
  "return textResourceOptionForId(project, id, catalog)",
  "62: [\"resource\"]",
  "const isSearchDrivenPicker = shouldShowSearch",
  "TargetMacroFlowPreview"
]) {
  if (!targetPicker.includes(snippet)) failures.push(`Target picker is missing signed message helper: ${snippet}`);
}
const searchDrivenTargetBranch = targetPicker.match(/\{isSearchDrivenPicker \? \([\s\S]*?\)\s*:\s*\(/);
if (!searchDrivenTargetBranch) {
  failures.push("Target picker is missing the search-driven branch for searchable direct targets.");
} else if (searchDrivenTargetBranch[0].includes("<select")) {
  failures.push("Searchable direct target fields must not render both search and select controls.");
}
const fixedListTargetBranch = targetPicker.match(/\) : \(\s*<label className="target-picker-select-label"[\s\S]*?\)\}\s*\{showWaitControl/);
if (!fixedListTargetBranch) {
  failures.push("Target picker is missing the compact fixed-list branch.");
} else {
  for (const snippet of [
    "target-picker-select-row with-open-action",
    "className=\"btn btn-secondary btn-xs icon-only target-picker-open-button\""
  ]) {
    if (!fixedListTargetBranch[0].includes(snippet)) failures.push(`Fixed-list target picker is missing compact open behavior: ${snippet}`);
  }
  if (fixedListTargetBranch[0].includes(">Open Target<")) {
    failures.push("Fixed-list target picker should use a compact open icon, not a separate Open Target button.");
  }
}
for (const snippet of [
  "recordType: \"simpleEncounter\", searchable: false",
  "recordType: \"complexEncounter\", searchable: false"
]) {
  if (targetPicker.includes(snippet)) failures.push(`Encounter direct target picker must use search as the primary selector: ${snippet}`);
}
if (!targetPicker.includes("29: { label: \"Map Item\", hint: \"Select map item 0 through 19.\", searchable: false }")) {
  failures.push("Map Item should remain the fixed-list exception for the direct target picker.");
}
if (targetPicker.includes("if (resolvedValue === 0) return null;")) {
  failures.push("Target picker must not treat every 0 ID as unselected; encounter/map/quest record 0 can be real targets.");
}
if (targetPicker.includes("|| value === 0")) {
  failures.push("Target picker should not offer Create when a real zero-ID target is already selected.");
}
for (const snippet of [
  "const inlineDirectTargetPickerAvailable = Boolean(targetPickerConfig(selectedDraft.rawCode));",
  "&& !inlineDirectTargetPickerAvailable && !inlineDirectTargetEditorAvailable",
  "definitionForActionChooserUse",
  "canonicalActionChooserOpcode(definition.opcode)",
  "actionChooserDefinitionMatchesDraft",
  "onStepOpcodeChange"
]) {
  if (!panel.includes(snippet)) failures.push(`Selected step detail is missing inline target drawer suppression: ${snippet}`);
}
const itemIdField = panel.match(/function ItemIdField\([\s\S]*?\n}\r?\n\r?\nfunction RequiredWeaponField/);
if (!itemIdField) {
  failures.push("ItemIdField is missing.");
} else {
  for (const snippet of [
    "type=\"search\"",
    "placeholder=\"Search item # or name...\"",
    "chooseItem(firstOption)",
    "script-item-results",
    "script-item-selected-row",
    "itemCategoryBadge(option.category)"
  ]) {
    if (!itemIdField[0].includes(snippet)) failures.push(`ItemIdField is missing search-only item authoring behavior: ${snippet}`);
  }
  if (itemIdField[0].includes("<select")) failures.push("ItemIdField must not render both search and select controls.");
  if (itemIdField[0].includes("type=\"number\"")) failures.push("ItemIdField must not render a separate raw numeric sidecar.");
}
if (panel.includes("hideRaw")) {
  failures.push("ItemIdField raw-entry escape hatch should be removed; numeric item IDs are authored through search.");
}
if (panel.includes("TimedNumberRow label=\"Required Item ID\"")) {
  failures.push("Timed Encounter required item should use the shared item search field, not a raw number row.");
}
if (!panel.includes("label=\"Required Item\" value={record.requiredItem}")) {
  failures.push("Timed Encounter required item search field is missing.");
}
const edcdSearchTargetField = edcd.match(/function EdcdSearchTargetField\([\s\S]*?\n}\r?\n\r?\nfunction EdcdSelectTargetField/);
if (!edcdSearchTargetField) {
  failures.push("EDCD search target field is missing.");
} else {
  for (const snippet of [
    "onKeyDown={handleSearchKeyDown}",
    "chooseOption(firstOption)",
    "className=\"btn btn-secondary btn-xs icon-only\"",
    "className=\"btn btn-danger btn-xs icon-only\""
  ]) {
    if (!edcdSearchTargetField[0].includes(snippet)) failures.push(`EDCD search target field is missing compact search behavior: ${snippet}`);
  }
  if (edcdSearchTargetField[0].includes("Open {label}")) {
    failures.push("EDCD search target fields should use compact open icons, not an inline Open label button.");
  }
}
const edcdSelectTargetField = edcd.match(/function EdcdSelectTargetField\([\s\S]*?\n}\r?\n\r?\nfunction EdcdMacroFlowPreview/);
if (!edcdSelectTargetField) {
  failures.push("EDCD select target field is missing.");
} else {
  for (const snippet of [
    "const hasOpenTarget = Boolean(selected?.entity && onOpen)",
    "edcd-target-select-row with-open-action",
    "edcd-target-inline-detail",
    "EdcdMacroFlowPreview",
    "edcdTargetKindUsesSearch(targetKind)",
    "edcd-search-selected-target"
  ]) {
    if (!edcdSelectTargetField[0].includes(snippet)) failures.push(`EDCD select target field is missing compact target behavior: ${snippet}`);
  }
  if (edcdSelectTargetField[0].includes("edcd-selected-target-row")) {
    failures.push("EDCD select target fields must not render a second selected-target card under the picker.");
  }
}
for (const snippet of [
  "function edcdTargetKindUsesSearch",
  "\"battle\"",
  "\"treasure\"",
  "\"shop\"",
  "\"simpleEncounter\"",
  "\"complexEncounter\"",
  "\"macro\"",
  "\"monster\""
]) {
  if (!edcd.includes(snippet)) failures.push(`EDCD target normalization is missing search-backed target family: ${snippet}`);
}

for (const snippet of [
  "function RandomRegionLevelField",
  "function RandomRegionChanceField",
  "randomRegionLevelField(shapeId, internalName)",
  "randomRegionChanceField(shapeId, internalName)",
  "formatPercentFromTenThousand",
  "Invisible encounter (-1)"
]) {
  if (!edcd.includes(snippet)) failures.push(`Random encounter area EDCD editor is missing mixed level/chance controls: ${snippet}`);
}

for (const snippet of [
  "shape.toLowerCase() === \"random-region-mutation\" && field.toLowerCase() === \"level\"",
  "const levelType = opcode === -23 ? \"dungeon\" : \"land\""
]) {
  if (!edcdTargets.includes(snippet)) failures.push(`Random encounter area target validation is missing opcode-aware map level checks: ${snippet}`);
}

if (!validation.includes("resolveSignedMessageTarget(code, id)")) {
  failures.push("Script validation does not normalize signed message targets.");
}
if (rustValidation.includes("1 | 62 | 71")) {
  failures.push("Rust validation must not treat scrolling-text opcode 62 as a Data SD2 message target.");
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
if (!rustProject.includes("pub const SEMANTIC_SCHEMA_VERSION: u32 = 5;")) {
  failures.push("Rust semantic schema version must match browser semantic schema version 5.");
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
  "\"scripts\""
]) {
  if (!appBootstrap.includes(snippet)) failures.push(`App bootstrap is missing Scripts semantic mapping support: ${snippet}`);
}
if (!/buildBrowserSemanticSchemaForProject\(\s*project\b/.test(appBootstrap)) {
  failures.push("App bootstrap is missing Scripts semantic mapping support: buildBrowserSemanticSchemaForProject(project)");
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
  "type ScriptDraftNavigationGuard",
  "requestDraftNavigation(`select step",
  "requestDraftNavigation(`select ${scriptLabel(project, trigger)}`",
  "ScriptDraftNavigationDialog",
  "Apply Changes",
  "Discard Changes",
  "Cancel",
  "onRegisterDraftNavigationGuard"
]) {
  if (!panel.includes(snippet)) failures.push(`Scripts panel is missing dirty selected-step navigation guard behavior: ${snippet}`);
}

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

if (panel.includes("<small className=\"script-storage-chip\">CODE")) {
  failures.push("Selected-step authoring header must keep raw CODE/ID in collapsed Step Reference, not the primary card.");
}
if (catalog.includes("Settings #${draft.id}") || catalog.includes("choose settings")) {
  failures.push("Settings-backed step summaries should describe authoring fields, not raw settings row IDs.");
}
if (edcd.includes("Use next action settings row")) {
  failures.push("Random rectangle shape mode should use author-facing wording instead of action settings row wording.");
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
  "landLevel",
  "dungeonLevel",
  "dungeonMoveLevelTargetKind",
  "normalizedShape === \"dungeon-move\" && normalizedName === \"level\"",
  "record.levelType === \"land\" && record.index === value",
  "record.levelType === \"dungeon\" && record.index === value"
]) {
  if (!edcdTargets.includes(snippet)) failures.push(`Action Settings target validation is missing typed dungeon-move map handling: ${snippet}`);
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
