import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const catalogPath = path.join(root, "src/editor/panels/scripts/scriptActionCatalog.ts");
const panelPath = path.join(root, "src/editor/panels/ScriptsPanel.tsx");
const scriptsCssPath = path.join(root, "src/editor/styles/scripts.css");
const textScenarioCssPath = path.join(root, "src/editor/styles/text-scenario.css");
const assetsCssPath = path.join(root, "src/editor/styles/assets.css");
const combatPanelPath = path.join(root, "src/editor/panels/CombatPanel.tsx");
const textPanelPath = path.join(root, "src/editor/panels/TextPanel.tsx");
const styledTextPreviewPath = path.join(root, "src/editor/components/StyledTextPreview.tsx");
const classicTextPreviewPath = path.join(root, "src/editor/classicTextPreview.ts");
const textStyleAuthoringPath = path.join(root, "src/editor/textStyleAuthoring.ts");
const resourcesPanelPath = path.join(root, "src/editor/panels/ResourcesPanel.tsx");
const resourceWidgetsPath = path.join(root, "src/editor/panels/resources/ResourceWidgets.tsx");
const globalSearchPath = path.join(root, "src/editor/globalSearch.ts");
const edcdPath = path.join(root, "src/editor/components/EdcdRowEditor.tsx");
const edcdRowsPath = path.join(root, "src/editor/edcdRows.ts");
const edcdTargetsPath = path.join(root, "src/editor/edcdTargets.ts");
const appUtilsPath = path.join(root, "src/editor/app/appUtils.ts");
const appBootstrapPath = path.join(root, "src/editor/app/useAppBootstrapEffects.ts");
const draftChangeGuardPath = path.join(root, "src/editor/app/draftChangeGuard.tsx");
const appPath = path.join(root, "src/App.tsx");
const semanticPath = path.join(root, "src/editor/browser/semantic.ts");
const semanticGraphPath = path.join(root, "src/editor/semanticGraph.ts");
const editorStorePath = path.join(root, "src/editor/store.ts");
const mapContextSidebarPath = path.join(root, "src/editor/components/MapContextSidebar.tsx");
const mapFormControlsPath = path.join(root, "src/editor/components/maps/MapFormControls.tsx");
const browserProjectPath = path.join(root, "src/editor/browser/project.ts");
const browserLibraryPath = path.join(root, "src/editor/browser/library.ts");
const rustProjectPath = path.join(root, "src-tauri/src/project.rs");
const rustWorkspacePath = path.join(root, "src-tauri/src/workspace.rs");
const rustValidationPath = path.join(root, "src-tauri/src/validation.rs");
const rustSemanticResourcesPath = path.join(root, "src-tauri/src/semantic/resources.rs");
const fixtureRoundtripPath = path.join(root, "src-tauri/tests/fixture_roundtrip.rs");
const packagePath = path.join(root, "package.json");
const checkTextStyleAuthoringPath = path.join(root, "scripts/check_text_style_authoring.mjs");
const apOpcodeCoveragePath = path.join(root, "docs/generated/ap-opcode-coverage.json");
const tutorialScriptsFixturePath = path.join(root, "tmp/editor-smoke-runs/20260524-234335/Tutorial-ScriptsV2.providence/project.json");

const catalog = fs.readFileSync(catalogPath, "utf8");
const panel = fs.readFileSync(panelPath, "utf8");
const scriptsCss = fs.readFileSync(scriptsCssPath, "utf8");
const textScenarioCss = fs.readFileSync(textScenarioCssPath, "utf8");
const assetsCss = fs.readFileSync(assetsCssPath, "utf8");
const combatPanel = fs.readFileSync(combatPanelPath, "utf8");
const textPanel = fs.readFileSync(textPanelPath, "utf8");
const styledTextPreview = fs.readFileSync(styledTextPreviewPath, "utf8");
const classicTextPreview = fs.readFileSync(classicTextPreviewPath, "utf8");
const textStyleAuthoring = fs.readFileSync(textStyleAuthoringPath, "utf8");
const resourcesPanel = fs.readFileSync(resourcesPanelPath, "utf8");
const resourceWidgets = fs.readFileSync(resourceWidgetsPath, "utf8");
const globalSearch = fs.readFileSync(globalSearchPath, "utf8");
const edcd = fs.readFileSync(edcdPath, "utf8");
const edcdRows = fs.readFileSync(edcdRowsPath, "utf8");
const edcdTargets = fs.readFileSync(edcdTargetsPath, "utf8");
const appUtils = fs.readFileSync(appUtilsPath, "utf8");
const appBootstrap = fs.readFileSync(appBootstrapPath, "utf8");
const draftChangeGuard = fs.readFileSync(draftChangeGuardPath, "utf8");
const app = fs.readFileSync(appPath, "utf8");
const semantic = fs.readFileSync(semanticPath, "utf8");
const semanticGraph = fs.readFileSync(semanticGraphPath, "utf8");
const editorStore = fs.readFileSync(editorStorePath, "utf8");
const mapContextSidebar = fs.readFileSync(mapContextSidebarPath, "utf8");
const mapFormControls = fs.readFileSync(mapFormControlsPath, "utf8");
const browserProject = fs.readFileSync(browserProjectPath, "utf8");
const browserLibrary = fs.readFileSync(browserLibraryPath, "utf8");
const rustProject = fs.readFileSync(rustProjectPath, "utf8");
const rustWorkspace = fs.readFileSync(rustWorkspacePath, "utf8");
const rustValidation = fs.readFileSync(rustValidationPath, "utf8");
const rustSemanticResources = fs.readFileSync(rustSemanticResourcesPath, "utf8");
const fixtureRoundtrip = fs.readFileSync(fixtureRoundtripPath, "utf8");
const packageJson = fs.readFileSync(packagePath, "utf8");
const checkTextStyleAuthoring = fs.readFileSync(checkTextStyleAuthoringPath, "utf8");
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
const tutorialScriptsFixture = fs.existsSync(tutorialScriptsFixturePath)
  ? JSON.parse(fs.readFileSync(tutorialScriptsFixturePath, "utf8"))
  : null;

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

function hasAuthoringControl(entry, label, expectedControl, targetFamily = undefined) {
  return (entry?.authoringControls ?? []).some((control) => {
    if (control.fieldLabel !== label) return false;
    if (control.expectedControl !== expectedControl) return false;
    return targetFamily === undefined || control.targetFamily === targetFamily;
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

if (apOpcodeCoverage.schemaVersion !== 3) {
  failures.push("Opcode audit report must use schemaVersion 3.");
}
if (!manualNoneStepOnlyMatch) {
  failures.push("Action catalog must declare MANUAL_NONE_STEP_ONLY_ACTIONS.");
}
for (const opcode of expectedManualNoneStepOnlyCodes) {
  if (!manualNoneStepOnlyCodes.has(opcode)) {
    failures.push(`Manual no-option opcode ${opcode} should be in MANUAL_NONE_STEP_ONLY_ACTIONS.`);
  }
}
for (const key of ["crosswalk", "manualHelp", "catalog", "actions", "targetPicker"]) {
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
const totalAuthoringControls = coverageEntries.reduce((sum, entry) => sum + (Array.isArray(entry.authoringControls) ? entry.authoringControls.length : 0), 0);
for (const key of ["controlStatusCounts", "expectedControlCounts"]) {
  const total = Object.values(apOpcodeCoverage[key] ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (total !== totalAuthoringControls) {
    failures.push(`Opcode audit report ${key} total ${total} does not match authoring control count ${totalAuthoringControls}.`);
  }
}
for (const entry of coverageEntries) {
  for (const key of ["opcode", "title", "status", "gapStatus", "evidenceConfidence", "manual", "manualNoOptions", "manualNoneStepOnly", "relatedOpcodes", "providenceFields", "authoringControls"]) {
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
  if (!Array.isArray(entry.authoringControls) || entry.authoringControls.length === 0) {
    failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} must list authoring controls.`);
  }
  if (Array.isArray(entry.providenceFields) && Array.isArray(entry.authoringControls) && entry.providenceFields.length !== entry.authoringControls.length) {
    failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} must have one authoring control per Providence field.`);
  }
  for (const control of entry.authoringControls ?? []) {
    for (const key of ["fieldLabel", "internalName", "storage", "expectedControl", "implementedSurface", "status", "evidence"]) {
      if (!(key in control)) failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} authoring control is missing ${key}.`);
    }
    if (!["search-target", "compact-select", "toggle", "narrow-number", "step-only", "advanced-preserved"].includes(control.expectedControl)) {
      failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} has unknown expectedControl ${control.expectedControl}.`);
    }
    if (!["ok", "needs-ui-fix", "needs-copy-fix", "needs-evidence", "intentionally-preserved"].includes(control.status)) {
      failures.push(`Opcode audit report entry ${entry.opcode ?? "(unknown)"} has unknown control status ${control.status}.`);
    }
    if (entry.gapStatus === "covered-in-current-ui" && control.status !== "ok") {
      failures.push(`Covered opcode ${entry.opcode} has unresolved authoring control ${control.fieldLabel}: ${control.status}.`);
    }
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
if (!hasCoverageField(scrollingText62, "Scrolling Text", "text-resource")) {
  failures.push("Opcode 62 should report a Scrolling Text target field.");
}
if (!hasAuthoringControl(scrollingText62, "Scrolling Text", "search-target", "text-resource")) {
  failures.push("Opcode 62 should audit Scrolling Text as a search-target authoring control.");
}

const treasure10 = coverageEntry(10);
if (!hasAuthoringControl(treasure10, "Treasure ID", "search-target", "treasure")) {
  failures.push("Opcode 10 should audit Treasure ID as a treasure search-target control.");
}

const itemBranch21 = coverageEntry(21);
for (const [label, expectedControl, targetFamily] of [
  ["Item ID To Check For", "search-target", "item"],
  ["If Possessed, Branch To", "compact-select", undefined],
  ["Missing Behavior", "compact-select", undefined],
  ["X-AP/Encounter No. If Possessed", "search-target", "extra-action-point-or-encounter"],
  ["Missing Target", "search-target", "extra-action-point-or-encounter"]
]) {
  if (!hasAuthoringControl(itemBranch21, label, expectedControl, targetFamily)) {
    failures.push(`Opcode 21 should audit ${label} as ${expectedControl}${targetFamily ? ` for ${targetFamily}` : ""}.`);
  }
}

const inversePick = coverageEntry(-14);
if (inversePick?.gapStatus !== "covered-in-current-ui") {
  failures.push("Opcode -14 should be covered as the manual-backed signed Pick Characters variant.");
}
if (inversePick?.evidenceConfidence !== "manual-backed") {
  failures.push("Opcode -14 should inherit manual-backed confidence from opcode 14.");
}
if (!hasAuthoringControl(inversePick, "ID", "narrow-number", "direct-id")) {
  failures.push("Opcode -14 should retain a direct ID control audit.");
}
if (!(inversePick?.authoringControls ?? []).every((control) => control.status === "ok")) {
  failures.push("Opcode -14 controls should audit as ok.");
}

for (const opcode of [25, 26, 34, 82, 83, 91, 93, 94, 96, 97, 100, 101, 102]) {
  const entry = coverageEntry(opcode);
  if (entry?.gapStatus !== "step-only-no-options") {
    failures.push(`Manual no-option opcode ${opcode} should stay marked step-only-no-options.`);
  }
  if (!(entry?.authoringControls ?? []).every((control) => control.expectedControl === "step-only" && control.status === "ok")) {
    failures.push(`Manual no-option opcode ${opcode} should audit as an ok step-only control.`);
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
  "label: \"Scrolling Text\"",
  "targetFamily: \"text-resource\"",
  "Scenario TEXT resource ID to display"
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
  "if (label === \"Scrolling Text\") return `Scrolling Text ${value}`",
  "62: { label: \"Scrolling Text\"",
  "const id = code === 62 ? resolvedValue : Math.abs(resolvedValue)",
  "addTextResourceTargets(project, options, catalog)",
  "return textResourceOptionForId(project, id, catalog)",
  "62: [\"resource\"]",
  "const isSearchDrivenPicker = shouldShowSearch",
  "TargetMacroFlowPreview"
]) {
  if (!targetPicker.includes(snippet)) failures.push(`Target picker is missing signed message helper: ${snippet}`);
}
for (const snippet of [
  "type TextAuthoringTab = \"strings\" | \"option-labels\" | \"scrolling-text\"",
  "SCROLLING_TEXT_TAB_HELP",
  "scrollingTextAssetFromDraft",
  "selectedScrollingTextAssetFromEntity",
  "importedScrollingTextResourceRows",
  "Make Editable",
  "StyleCompanionEditor",
  "ClassicStyleRunDraft",
  "plainStyleAssetFromDraft",
  "styleAssetFromBytes",
  "CLASSIC_AUTHOR_FONT_OPTIONS",
  "textSelectionRangeFromTextArea",
  "applyAuthorStyleToSelection",
  "text-source-details",
  "text-style-format-toolbar",
  "onDisplaySelectionChange",
  "Custom Font ID",
  "Add Style Run",
  "Apply Style Bytes",
  "Remove Override",
  "Flatten To Plain Style",
  "applyViewportChanges",
  "onApplyChanges={applyViewportChanges}",
  "parseClassicStyleRuns",
  "styleRunDraftsFromRuns",
  "classicStyleRunsFromDrafts",
  "classicStyleBytesFromRuns",
  "parseHexBytes",
  "StyledScrollingTextPreview",
  "REALMZ_GAMEPLAY_TEXT_VIEW_WIDTH",
  "\"Gameplay viewport editor\"",
  "\"Gameplay viewport preview\"",
  "movieViewportWidth={REALMZ_GAMEPLAY_TEXT_VIEW_WIDTH}",
  "semanticResourceType(entity)",
  "semanticResourceId(entity)",
  "function bytesToDataUrl(bytes: Uint8Array, mimeType = \"text/plain\")",
  "bytesToDataUrl(bytes, \"application/octet-stream\")",
  "resourceType: \"TEXT\"",
  "resourceType: \"styl\"",
  ".filter((asset) => asset.resourceType.trim() === \"TEXT\")"
]) {
  if (!textPanel.includes(snippet)) failures.push(`Text panel is missing authored scrolling TEXT resource support: ${snippet}`);
}
for (const snippet of [
  "export function decodeClassicTextPreviewBytes",
  "rawToDisplay",
  "displayToRaw",
  "export function displayRangeToRawRange",
  "if (char === \"\\n\" || char === \"\\r\") return 13;"
]) {
  if (!classicTextPreview.includes(snippet)) failures.push(`Classic TEXT preview offset mapping is missing: ${snippet}`);
}
for (const snippet of [
  "export const CLASSIC_AUTHOR_FONT_OPTIONS",
  "export function textSelectionRangeFromTextArea",
  "export function applyAuthorStyleToSelection",
  "export function styleRunDraftAtOffset",
  "export function classicStyleRunsFromDrafts",
  "export function styleRunRangeSummary",
  "export function styleRunRangeTitle"
]) {
  if (!textStyleAuthoring.includes(snippet)) failures.push(`Text style authoring helpers are missing: ${snippet}`);
}
if (textPanel.includes("function applyAuthorStyleToSelection") || textPanel.includes("function classicStyleRunsFromDrafts")) {
  failures.push("TextPanel should import style authoring helpers instead of owning duplicate style-run math.");
}
for (const snippet of [
  "check:text-style-authoring",
  "node scripts/check_text_style_authoring.mjs",
  "npm run check:text-style-authoring"
]) {
  if (!packageJson.includes(snippet)) failures.push(`package.json is missing text style authoring check wiring: ${snippet}`);
}
for (const snippet of [
  "checkSelectedRanges",
  "checkSelectionStyleInsertion",
  "checkSelectionRestoresCoveredStyle",
  "classicStyleRunsFromDrafts",
  "Text style authoring checks passed."
]) {
  if (!checkTextStyleAuthoring.includes(snippet)) failures.push(`Text style authoring check script is missing: ${snippet}`);
}
for (const snippet of [
  "export const CLASSIC_TEXT_EDIT_VIEW_WIDTH = 320",
  "export const REALMZ_GAMEPLAY_TEXT_VIEW_WIDTH = 480",
  "export function StyledScrollingTextPreview",
  "export function styledTextPreviewSegments",
  "Offset-preserving Classic TEXT/styl preview. Windows Realmz testing currently ignores styl formatting.",
  "Apply Changes",
  "function styleRunPreviewTitle",
  "export function parseClassicStyleRuns",
  "export function classicStyleBytesFromRuns"
]) {
  if (!styledTextPreview.includes(snippet)) failures.push(`Shared styled TEXT preview is missing: ${snippet}`);
}
if (!textPanel.includes("confirmBeforeDraftDiscard(`select Scrolling Text ${resource.resourceId}`") || !textPanel.includes("setSelectedImportedResourceId(resource.entityId)")) {
  failures.push("Imported scrolling TEXT list rows must select locally through the shared draft guard.");
}
if (textPanel.includes("onSelectEntity(selectEntityFromId(resource.entityId));")) {
  failures.push("Imported scrolling TEXT list rows must not select generic resource entities because that routes to Assets.");
}
for (const snippet of [
  ".text-style-preview",
  ".text-style-preview-body",
  ".text-style-preview-run i",
  ".text-style-preview-diagnostics",
  ".text-style-format-toolbar",
  ".text-style-toggle-group",
  ".text-style-selection-summary",
  ".text-style-custom-font",
  ".text-style-run-technical-details"
]) {
  if (!textScenarioCss.includes(snippet)) failures.push(`Text CSS is missing styled scrolling TEXT preview styling: ${snippet}`);
}
if (textPanel.includes("open={Boolean(companion.managedAsset)")) {
  failures.push("Raw scrolling TEXT style bytes must remain collapsed unless the author opens technical details.");
}
if (tutorialScriptsFixture) {
  const resources = (tutorialScriptsFixture.semanticSchema?.entities ?? [])
    .filter((entity) => entity.type === "resource")
    .map((entity) => ({
      type: String(entity.summary?.type ?? entity.summary?.resourceType ?? ""),
      id: Number(entity.summary?.resourceId ?? entity.summary?.id ?? entity.summary?.index)
    }));
  const hasText = (id) => resources.some((resource) => resource.type === "TEXT" && resource.id === id);
  const hasStyle = (id) => resources.some((resource) => resource.type === "styl" && resource.id === id);
  for (const id of [-200, -201, -202, -203, -204, -205, -206]) {
    if (!hasText(id)) failures.push(`Tutorial Scripts V2 fixture should expose imported TEXT ${id} for scrolling text browser QA.`);
  }
  if (!hasStyle(-200)) failures.push("Tutorial Scripts V2 fixture should expose same-ID styl -200 for styled scrolling TEXT preview QA.");
}
for (const snippet of [
  "function scenarioResourceAssets",
  "resourceType !== \"TEXT\" && resourceType !== \"STR#\" && resourceType !== \"styl\"",
  "managedResourceKeys.has(`${resourceType}:${resourceId}`)",
  "textResourceSummaryFromSemanticEntity",
  "kind: managedKindForResource(resourceType)"
]) {
  if (!resourcesPanel.includes(snippet)) failures.push(`Assets panel is missing imported TEXT/styl scenario-resource listing support: ${snippet}`);
}
for (const snippet of [
  "StyledTextResourcePreview",
  "CLASSIC_TEXT_EDIT_VIEW_WIDTH",
  "useLibrarySameIdStyleBytes",
  "loadBrowserBundledLibraryResourceData",
  "projectSameIdStyleBytes",
  "sameSourceStyleAsset",
  "typeof summary.textOffsetBody === \"string\"",
  "Classic 320 movie preview",
  "isClassicAboutMovieTextAsset"
]) {
  if (!resourceWidgets.includes(snippet)) failures.push(`Assets resource preview must reuse the styled scrolling TEXT preview path: ${snippet}`);
}
if (!textScenarioCss.includes(".text-style-preview") || !assetsCss.includes(".resource-styled-text-preview") || !resourceWidgets.includes("resource-styled-text-preview")) {
  failures.push("Assets styled TEXT preview should retain shared text-style-preview styling and add a resource-styled-text-preview sizing hook.");
}
for (const snippet of [
  "if (activeEditor === \"text-resources\") return \"text\"",
  "{ id: \"project\", editor: \"project-assets\", label: \"Scenario Assets\" }"
]) {
  if (!resourceWidgets.includes(snippet)) failures.push(`Assets text-resource workbench mapping is missing: ${snippet}`);
}
for (const snippet of [
  "editor: \"text-resources\"",
  "assetSection: \"project\"",
  "assetKindFilter: \"text\""
]) {
  if (!globalSearch.includes(snippet)) failures.push(`Global search must deep-link imported TEXT/styl resources into Assets > Text Resources: ${snippet}`);
}
for (const snippet of [
  "textResourcePayloadSummary(resource)",
  "decodeClassicTextBody(resource.data)",
  "textResourceBase64",
  "styleRunCountCandidate",
  "styleResourceBase64",
  "styleRunTableStatus",
  "classicStyleRunSummary",
  "bytesToBase64(resource.data)",
  "resource.resourceType === \"TEXT\""
]) {
  if (!semantic.includes(snippet)) failures.push(`Browser semantic resources are missing TEXT/styl authoring summaries: ${snippet}`);
}
for (const snippet of [
  "textOffsetBody",
  "decodeClassicTextOffsetBody",
  "textResourceBase64",
  "styleResourceBase64",
  "bytesToBase64(resource.data)"
]) {
  if (!browserLibrary.includes(snippet)) failures.push(`Browser library catalog TEXT/styl summaries must preserve scrolling-text preview data: ${snippet}`);
}
for (const snippet of [
  "textResourceBase64",
  "styleResourceBase64",
  "STANDARD.encode(&resource.data)",
  "styleRunTableStatus",
  "classic_style_run_summary",
  "classic-style-run-table"
]) {
  if (!rustSemanticResources.includes(snippet)) failures.push(`Rust semantic resources are missing desktop TEXT/styl authoring summaries: ${snippet}`);
}
for (const snippet of [
  "textOffsetBody",
  "decode_classic_text_offset_body",
  "textResourceBase64",
  "styleResourceBase64",
  "BASE64_STANDARD.encode(data)"
]) {
  if (!rustWorkspace.includes(snippet)) failures.push(`Desktop workspace library catalog TEXT/styl summaries must preserve scrolling-text preview data: ${snippet}`);
}
for (const snippet of [
  "authored_scrolling_text_exports_same_id_text_and_style_resources",
  "imported_scrolling_text_edit_preserves_same_id_style_resource",
  "resource_type: \"TEXT\".to_string()",
  "resource_type: \"styl\".to_string()",
  "TEXT -200",
  "styl -200",
  "Mithril Vault should contain same-ID styl -204"
]) {
  if (!fixtureRoundtrip.includes(snippet)) failures.push(`Fixture roundtrip tests are missing styled scrolling TEXT export coverage: ${snippet}`);
}
for (const snippet of [
  "return scrollingTextResourceOptions(project);",
  "function scrollingTextResourceOptions",
  "function scrollingTextOptionFromSemanticEntity",
  "if (targetKind === \"scrollingText\") return scrollingTextResourceOptions(project).some"
]) {
  if (!edcdTargets.includes(snippet)) failures.push(`EDCD target resolution is missing TEXT resource support: ${snippet}`);
}
if (edcdTargets.includes("targetKind === \"scrollingText\") return (project.messages")) {
  failures.push("EDCD target resolution must not treat scrolling TEXT as ordinary Data SD2 messages.");
}
for (const source of [panel, combatPanel]) {
  if (!source.includes("target.targetKind === \"scrollingText\") return selectEntityFromId(`resource:TEXT:${target.value}`);")) {
    failures.push("Flow target opening must deep-link scrolling text to resource:TEXT:<id>.");
  }
  if (source.includes("target.targetKind === \"message\" || target.targetKind === \"scrollingText\"")) {
    failures.push("Flow target opening must not share the Data SD2 message path for scrolling TEXT.");
  }
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
if (!targetPicker.includes("29: { label: \"Player Map\", hint: \"Select the Maps/Notes entry to give or display.\", searchPlaceholder: \"Search map #, name, or note...\" }")) {
  failures.push("Code 29 should use the searchable Player Map picker.");
}
for (const snippet of [
  "function addPlayerMapTargets(project: Project, options: ScriptTargetOption[])",
  "options.push(playerMapTargetOption(project, record, used));",
  "record.note?.trim() || \"\""
]) {
  if (!targetPicker.includes(snippet)) failures.push(`Code 29 Player Map picker is missing map-record search support: ${snippet}`);
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

const semanticTriggersForMap = semanticGraph.match(/export function semanticTriggersForMap[\s\S]*?\n}\n/);
if (!semanticTriggersForMap) {
  failures.push("Semantic graph is missing semanticTriggersForMap.");
} else {
  for (const snippet of [
    "Action Point placement is mutable authoring state",
    "trigger.source !== \"Data ED3\"",
    "trigger.levelType === map.levelType",
    "trigger.levelIndex === map.index"
  ]) {
    if (!semanticTriggersForMap[0].includes(snippet)) failures.push(`Map Action Point overlay source-of-truth guard is missing: ${snippet}`);
  }
  if (semanticTriggersForMap[0].includes("incomingLinks(project, mapId, [\"located_on\"]")) {
    failures.push("Map Action Point overlays must use live trigger records instead of stale semantic located_on links.");
  }
}

for (const snippet of [
  "selectedCellAfterCommand(state.selectedCell, action.command, state.selectedMapId, state.project, nextProject)",
  "command.kind !== \"moveActionPoint\"",
  "selectedCell.x !== original.coordinate.x",
  "tileValueAt(targetMap, command.x, command.y)"
]) {
  if (!editorStore.includes(snippet)) failures.push(`Map Action Point move selection guard is missing: ${snippet}`);
}
for (const snippet of [
  "commitOnChange = false",
  "if (commitOnChange) commitValue(nextDraft, false)"
]) {
  if (!mapFormControls.includes(snippet)) failures.push(`Map number field live-commit support is missing: ${snippet}`);
}
for (const snippet of [
  "label=\"X\" value={trigger.coordinate.x} min={0} max={89} compact plain maxLength={2} commitOnChange",
  "label=\"Y\" value={trigger.coordinate.y} min={0} max={89} compact plain maxLength={2} commitOnChange"
]) {
  if (!mapContextSidebar.includes(snippet)) failures.push(`Map Action Point selection inspector live movement is missing: ${snippet}`);
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
  "useDraftChangeGuards",
  "registerDraftGuard",
  "confirmBeforeDraftDiscard",
  "scriptDraftGuardSummary",
  "id: `script-step:${selectedTrigger.id}:${selectedSlot}`",
  "requestDraftNavigation(`select step",
  "requestDraftNavigation(`select ${scriptLabel(project, trigger)}`",
  "surface: \"scripts\"",
  "Apply Step"
]) {
  if (!panel.includes(snippet)) failures.push(`Scripts panel is missing shared dirty selected-step navigation guard behavior: ${snippet}`);
}
for (const snippet of [
  "const previewEntity = useCallback",
  "const openTargetEntity = useCallback",
  "const previewMapCoordinate = useCallback",
  "const openTargetMapCoordinate = useCallback",
  "ScriptPreviewDialog",
  "onPreviewEntity={previewEntity}",
  "onInspect={onPreviewEntity}",
  "ScriptDestructiveActionDialog",
  "setPendingDestructiveAction",
  "const clearSelectedStep = () =>",
  "const selectedStepDirty = selectedDraftDirty || Boolean(selectedEdcdStepDraft?.dirty);",
  "disabled={!selectedAction && !selectedStepDirty}",
  "kind: \"applyRealmzScriptStep\"",
  "onClick={clearSelectedStep}",
  "onClick={clearSelectedScript}"
]) {
  if (!panel.includes(snippet)) failures.push(`Scripts panel is missing AP draft guard regression handling: ${snippet}`);
}
for (const snippet of [
  "const openPreviewEntity = useCallback",
  "onSelectEntity={openPreviewEntity}",
  "onOpenMapCoordinate={openPreviewMapCoordinate}",
  "requestDraftNavigation(\"open the selected target\"",
  "requestDraftNavigation(\"open the map location\"",
  "requestDraftNavigation(\"clear this step\"",
  "requestDraftNavigation(isMacro ? \"delete this Extra Action Point\""
]) {
  if (panel.includes(snippet)) failures.push(`Scripts panel still gates preview/destructive actions with the dirty-step navigation modal: ${snippet}`);
}

for (const snippet of [
  "export type DraftGuardEntry",
  "registerDraftGuard",
  "confirmBeforeDraftDiscard",
  "Apply and Continue",
  "Discard Changes",
  "groupDraftEntries",
  "draftSurfaceLabel"
]) {
  if (!draftChangeGuard.includes(snippet)) failures.push(`Shared draft-change guard is missing expected behavior: ${snippet}`);
}

for (const snippet of [
  "DraftChangeGuardProvider",
  "useDraftChangeGuardController",
  "confirmBeforeDraftDiscard(\"close the project\"",
  "confirmBeforeDraftDiscard(\"open another project\"",
  "confirmBeforeDraftDiscard(`open ${domain}`",
  "onOpenResult={(result) => confirmBeforeDraftDiscard"
]) {
  if (!app.includes(snippet)) failures.push(`App is missing shared draft-change guard navigation wiring: ${snippet}`);
}

for (const snippet of [
  "registerDraftGuard",
  "id: `message:${record.id}`",
  "id: `option-label:${record.id}`",
  "id: `scrolling-text:${resourceId}`",
  "selectTextTab",
  "confirmBeforeDraftDiscard(`select String ${id}`",
  "confirmBeforeDraftDiscard(`select Option Label ${id}`",
  "Apply Changes"
]) {
  if (!textPanel.includes(snippet)) failures.push(`Text panel is missing shared draft-change guard registration: ${snippet}`);
}

for (const snippet of [
  "className=\"script-step-storage\"",
  "`CODE ${current.rawCode}`",
  "`ID ${current.id}`",
  "<small>CODE</small>",
  "<small>ID</small>"
]) {
  if (!panel.includes(snippet)) failures.push(`Scripts panel is missing visible step CODE/ID storage behavior: ${snippet}`);
}
for (const snippet of [
  "return `${trigger.actions.length} step${trigger.actions.length === 1 ? \"\" : \"s\"}`;",
  "return `${mapLabel} | reusable slot`;",
  "return mapLabel;"
]) {
  if (!inventory.includes(snippet)) failures.push(`Script inventory list rows are missing deduplicated subtitle behavior: ${snippet}`);
}
for (const snippet of [
  "width: clamp(210px, 15vw, 280px);",
  "grid-template-columns: minmax(240px, 300px) minmax(520px, 1fr);",
  ".script-step-storage",
  "grid-template-columns: repeat(2, minmax(34px, 1fr));",
  ".script-step-storage strong"
]) {
  if (!scriptsCss.includes(snippet)) failures.push(`Scripts CSS is missing denser AP/XAP list and CODE/ID storage styling: ${snippet}`);
}
for (const snippet of [
  "function renderItemBranchResultSection",
  "const possessedMode = fieldByName(\"branchmode\")",
  "const possessedTarget = fieldByName(\"hastarget\")",
  "const missingMode = fieldByName(\"missingbehavior\")",
  "const missingTarget = fieldByName(\"missingtarget\")",
  "className=\"guided-edcd-section edcd-item-branch-result-section\""
]) {
  if (!edcd.includes(snippet)) failures.push(`EDCD editor is missing paired item-possession branch layout: ${snippet}`);
}
for (const snippet of [
  ".edcd-branch-result-grid",
  ".edcd-branch-result-row",
  "grid-template-columns: minmax(190px, 0.8fr) minmax(260px, 1.2fr);"
]) {
  if (!scriptsCss.includes(snippet)) failures.push(`Scripts CSS is missing paired item-possession branch layout styling: ${snippet}`);
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
  "if (IGNORED_ACTIONS.has(code)) return \"step-only\"",
  "definition.authoringLevel === \"ignored\") return false"
]) {
  if (!catalog.includes(snippet)) failures.push(`Action catalog is missing preserve-only chooser filtering support: ${snippet}`);
}

const emptyStep = coverageEntry(0);
if (!hasCoverageField(emptyStep, "Step only")) {
  failures.push("Opcode 0 Empty Step should report step-only Providence authoring, not a generic value field.");
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
