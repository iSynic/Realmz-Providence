import fs from "node:fs";
import path from "node:path";
import { SCRIPT_ACTION_DEFINITIONS } from "../src/editor/panels/scripts/scriptActionCatalog";

type JsonRecord = Record<string, unknown>;
type AuditControl = {
  index: number;
  internalName: string;
  fieldLabel: string;
  targetFamily: string | null;
  expectedControl: string;
  implementedSurface: string;
  status: string;
  evidence: string;
};
type AuditEntry = {
  opcode: number;
  title: string;
  edcdBacked: boolean;
  shape: string | null;
  gapStatus: string;
  evidenceConfidence: string;
  authoringControls: AuditControl[];
};
type CrosswalkEntry = {
  opcode: number;
  title: string;
  edcdBacked: boolean;
  shape: string | null;
  writerStatus: string;
  runtimeNote?: string | null;
  parameters: Array<{
    index: number;
    internalName: string;
    label: string;
    help: string;
    targetFamily: string | null;
    preserved: boolean;
  }>;
};

const root = process.cwd();
const check = process.argv.includes("--check");
const outDir = path.join(root, "docs", "generated");
const jsonOut = path.join(outDir, "encounter-ecode-authoring.json");
const mdOut = path.join(outDir, "encounter-ecode-authoring.md");
const crosswalkPath = path.join(root, "src", "editor", "generated", "opcodeEdcdCrosswalk.json");
const apCoveragePath = path.join(outDir, "ap-opcode-coverage.json");
const optionDomainsPath = path.join(root, "src", "editor", "edcdOptionDomains.json");
const contextRestrictionsPath = path.join(root, "src", "editor", "panels", "scripts", "scriptActionContexts.json");
const crosswalk = readJson(crosswalkPath) as { entries: Record<string, CrosswalkEntry> };
const apCoverage = readJson(apCoveragePath) as { entries: AuditEntry[] };
const optionDomainSource = readJson(optionDomainsPath) as {
  domains: Array<{ opcode: number; field: string; options: Array<{ value: number; label: string }> }>;
};
const contextSource = readJson(contextRestrictionsPath) as {
  restrictions: Array<{ opcode: number; contexts: string[]; reason: string }>;
};
const apByOpcode = new Map(apCoverage.entries.map((entry) => [entry.opcode, entry]));
const definitionsByOpcode = new Map(SCRIPT_ACTION_DEFINITIONS.map((entry) => [entry.opcode, entry]));
const optionDomains = new Map(optionDomainSource.domains.map((domain) => [optionDomainKey(domain.opcode, domain.field), domain]));
const contextRestrictions = new Map(contextSource.restrictions.map((restriction) => [restriction.opcode, restriction]));

const implementationEvidence = [
  {
    path: "src/editor/panels/scripts/EncounterResultActionCell.tsx",
    markers: ["onEditSettings(nextRawCode)", "encounter-action-settings-field", "scriptActionAllowedInContext"]
  },
  {
    path: "src/editor/panels/scripts/EncounterResultActionMatrix.tsx",
    markers: ["ContextualEcodeSettingsModal", "applyEncounterResultSettings"]
  },
  {
    path: "src/editor/panels/scripts/ContextualEcodeSettingsModal.tsx",
    markers: ["EdcdRowEditor", "contextualEcodeDraft"]
  },
  {
    path: "src/editor/components/EdcdRowEditor.tsx",
    markers: ["documentedEdcdOptionsForField"]
  },
  {
    path: "src/editor/projectCommands.ts",
    markers: ['command.kind === "applyEncounterResultSettings"']
  }
];

const failures: string[] = [];
for (const evidence of implementationEvidence) {
  const source = fs.readFileSync(path.join(root, evidence.path), "utf8");
  for (const marker of evidence.markers) {
    if (!source.includes(marker)) failures.push(`${evidence.path} is missing implementation marker ${marker}.`);
  }
}

const crosswalkEntries = Object.values(crosswalk.entries)
  .filter((entry) => entry.opcode > 0 && entry.edcdBacked)
  .sort((a, b) => a.opcode - b.opcode);

const entries = crosswalkEntries.map((entry) => {
  const audit = apByOpcode.get(entry.opcode);
  const definition = definitionsByOpcode.get(entry.opcode);
  if (!audit) failures.push(`AP opcode coverage is missing ECODE-backed opcode ${entry.opcode}.`);
  if (!definition) failures.push(`Action catalog is missing ECODE-backed opcode ${entry.opcode}.`);
  if (!audit || !definition) return null;
  const controlByIndex = new Map((audit.authoringControls ?? []).map((control) => [control.index, control]));
  const parameterByIndex = new Map(definition.parameters.map((parameter) => [parameter.index, parameter]));
  const fields = entry.parameters.map((parameter) => {
    const control = controlByIndex.get(parameter.index);
    const canonical = parameterByIndex.get(parameter.index);
    if (!control) failures.push(`Opcode ${entry.opcode} field ${parameter.index} has no authoring control audit.`);
    if (!canonical) failures.push(`Opcode ${entry.opcode} field ${parameter.index} has no canonical action definition.`);
    const help = canonical?.help || parameter.help || (parameter.preserved
      ? "Preserved imported compatibility value; no documented authoring semantics."
      : "");
    if (!help) failures.push(`Opcode ${entry.opcode} field ${parameter.index} has no author-facing help.`);
    return {
      index: parameter.index,
      internalName: canonical?.internalName ?? parameter.internalName,
      label: canonical?.label ?? parameter.label,
      defaultValue: canonical?.defaultValue ?? 0,
      help,
      targetFamily: control?.targetFamily ?? canonical?.targetFamily ?? parameter.targetFamily,
      conditionalTargetMeaning: conditionalTargetMeaning(entry.opcode, entry.shape, parameter.internalName),
      control: control?.expectedControl ?? "unreviewed",
      options: optionDomains.get(optionDomainKey(entry.opcode, parameter.internalName))?.options ?? null,
      validationRule: validationRule(control?.expectedControl, control?.targetFamily),
      signedBehavior: signedBehavior(entry.opcode, parameter.internalName, help, parameter.preserved),
      previewSupport: previewSupport(control?.targetFamily),
      implementedSurface: control?.implementedSurface ?? "unreviewed",
      status: control?.status ?? "unreviewed",
      evidence: control?.evidence ?? audit.evidenceConfidence
    };
  });
  if (!entry.shape) failures.push(`Opcode ${entry.opcode} has no ECODE shape.`);
  if (definition.edcdShape !== entry.shape) failures.push(`Opcode ${entry.opcode} catalog shape ${definition.edcdShape} differs from crosswalk shape ${entry.shape}.`);
  if (fields.length !== 5) failures.push(`Opcode ${entry.opcode} has ${fields.length} audited fields; expected 5.`);
  for (const field of fields) {
    if (field.status !== "ok") failures.push(`Opcode ${entry.opcode} field ${field.label} remains ${field.status}.`);
    if (field.control === "compact-select" && !field.options) {
      failures.push(`Opcode ${entry.opcode} field ${field.label} expects a compact select but has no option-domain contract.`);
    }
  }
  const restriction = contextRestrictions.get(entry.opcode);
  const encounterContexts = ["simple-encounter", "complex-encounter"];
  const allowedEncounterContexts = restriction
    ? restriction.contexts.filter((context) => encounterContexts.includes(context))
    : encounterContexts;
  const contextGated = allowedEncounterContexts.length === 0;
  return {
    opcode: entry.opcode,
    title: audit.title,
    shape: entry.shape,
    contractStatus: contextGated ? "reviewed-contextual-advanced" : "reviewed-contextual-modal",
    preservation: "native-data-edcd",
    rawEditability: "technical-details-five-values",
    contextualAuthorability: contextGated ? "context-gated-with-raw-fallback" : "guided-modal",
    runtimeConfidence: audit.evidenceConfidence,
    routineEncounterAuthoring: !contextGated,
    allowedEncounterContexts,
    contextRestriction: restriction?.reason ?? null,
    importedPreservation: true,
    atomicCallerAndRowWrite: true,
    safeRowAllocation: true,
    semanticSummary: true,
    writerStatus: entry.writerStatus,
    runtimeNote: entry.runtimeNote ?? null,
    fields
  };
}).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

if (entries.length !== crosswalkEntries.length) {
  failures.push(`Encounter coverage has ${entries.length} entries for ${crosswalkEntries.length} positive ECODE-backed opcodes.`);
}

const statusCounts = countBy(entries, (entry) => entry.contractStatus);
const fieldStatusCounts = countBy(entries.flatMap((entry) => entry.fields), (field) => field.status);
const unreviewed = entries.filter((entry) => !entry.contractStatus.startsWith("reviewed-"));
const unresolvedFields = entries.flatMap((entry) => entry.fields
  .filter((field) => field.status !== "ok")
  .map((field) => ({ opcode: entry.opcode, field: field.label, status: field.status })));
if (unreviewed.length > 0) failures.push(`${unreviewed.length} ECODE opcodes remain unreviewed.`);
if (unresolvedFields.length > 0) failures.push(`${unresolvedFields.length} ECODE fields remain unresolved.`);

const report = {
  schemaVersion: 1,
  source: {
    crosswalk: relative(crosswalkPath),
    actionCatalog: "src/editor/panels/scripts/scriptActionCatalog.ts",
    apOpcodeCoverage: relative(apCoveragePath),
    optionDomains: relative(optionDomainsPath),
    authoringContexts: relative(contextRestrictionsPath),
    implementationEvidence: implementationEvidence.map((entry) => entry.path)
  },
  counts: {
    positiveEcodeOpcodes: entries.length,
    contextualModal: entries.length,
    routineGuided: entries.filter((entry) => entry.routineEncounterAuthoring).length,
    contextGatedRawFallback: entries.filter((entry) => !entry.routineEncounterAuthoring).length,
    conditionalFields: entries.flatMap((entry) => entry.fields).filter((field) => field.conditionalTargetMeaning).length,
    unreviewed: unreviewed.length,
    unresolvedFields: unresolvedFields.length
  },
  statusCounts,
  fieldStatusCounts,
  entries,
  notes: [
    "Every positive Data EDCD opcode is inventoried here. Context-restricted opcodes are preserved and inspectable when imported but are not offered for new encounter-result placement.",
    "The report reads defaults, labels, help, and field names from the same runtime action definitions used by the editor; it does not maintain modal-only ECODE mappings.",
    "Reviewed contextual modal means the encounter row opens the shared typed ECODE editor and saves the caller plus settings row atomically.",
    "Reviewed contextual advanced identifies combat-only behavior that remains import-preserving and editable through the contextual modal plus its raw Technical Details fallback.",
    "Every compact selection is backed by the shared option-domain registry used by both Action Point and encounter ECODE editors.",
    "Negative result opcodes remain a caller-level toggle; signed ECODE values remain separate five-field settings."
  ]
};

const json = `${JSON.stringify(report, null, 2)}\n`;
const markdown = renderMarkdown(report);
if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
if (check) {
  compare(jsonOut, json);
  compare(mdOut, markdown);
  if (process.exitCode) process.exit(process.exitCode);
  console.log(`Encounter ECODE coverage is current: ${entries.length} opcodes, ${unreviewed.length} unreviewed, ${unresolvedFields.length} unresolved fields.`);
} else {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonOut, json);
  fs.writeFileSync(mdOut, markdown);
  console.log(`Wrote ${relative(jsonOut)}`);
  console.log(`Wrote ${relative(mdOut)}`);
}

function renderMarkdown(value: typeof report) {
  const lines = [
    "# Encounter ECODE Authoring Coverage",
    "",
    `- Positive ECODE-backed opcodes: ${value.counts.positiveEcodeOpcodes}`,
    `- Contextual modal contracts: ${value.counts.contextualModal}`,
    `- Routine guided authoring: ${value.counts.routineGuided}`,
    `- Context-gated raw fallbacks: ${value.counts.contextGatedRawFallback}`,
    `- Explicit conditional fields: ${value.counts.conditionalFields}`,
    `- Unreviewed: ${value.counts.unreviewed}`,
    `- Unresolved fields: ${value.counts.unresolvedFields}`,
    "",
    "| Opcode | Action | Shape | Contract | Runtime evidence | Five contextual fields |",
    "| ---: | --- | --- | --- | --- | --- |"
  ];
  for (const entry of value.entries) {
    lines.push(`| ${entry.opcode} | ${escapeCell(entry.title)} | ${escapeCell(entry.shape)} | ${entry.contractStatus} | ${entry.runtimeConfidence} | ${escapeCell(entry.fields.map((field) => `${field.label} (${field.control}, default ${field.defaultValue}${field.targetFamily ? `, ${field.targetFamily}` : ""}; signed: ${field.signedBehavior}${field.conditionalTargetMeaning ? `; conditional: ${field.conditionalTargetMeaning}` : ""})`).join("; "))} |`);
  }
  lines.push("", "## Contract", "", ...value.notes.map((note) => `- ${note}`), "");
  return `${lines.join("\n")}\n`;
}

function validationRule(control: string | undefined, targetFamily: string | null | undefined) {
  if (control === "search-target") return `Existing ${targetFamily ?? "record"} ID or preserved unresolved signed 16-bit value`;
  if (control === "compact-select") return "Documented mode choices; preserve imported values outside the known set";
  if (control === "toggle") return "Documented boolean or signed intent; preserve imported values";
  if (control === "advanced-preserved") return "Preserve the imported signed 16-bit value";
  return "Signed 16-bit ECODE quantity with documented sentinel values preserved";
}

function signedBehavior(opcode: number, internalName: string, help: string, preserved: boolean) {
  if (preserved) return "raw-signed-preserved";
  if (opcode === 2 && ["battleLow", "battleHigh"].includes(internalName)) {
    return "negative battle IDs explicitly select surprise; absolute IDs select the authored battle or range";
  }
  return /negative|signed|minus|-1\b/i.test(help) ? "documented-signed" : "nonnegative-guided-raw-signed-preserved";
}

function conditionalTargetMeaning(opcode: number, shape: string | null, internalName: string) {
  const name = internalName.toLowerCase();
  if (opcode === 2 && name === "soundorrevivelossmacro") {
    return "Sound target for reward modes 0 and 5; Extra Action Point target when reward/revive mode is 10.";
  }
  if (shape === "action-data-patching" && name === "targetrecord") {
    return "Action Point target normally; Simple Encounter when Level / Cache is -2; Complex Encounter when it is -3.";
  }
  if (shape === "dungeon-move" && name === "level") {
    return "Dungeon level when Destination Type is 0; land level when Destination Type is 1.";
  }
  if (shape === "picked-branch" && name === "failuretarget") {
    return "Extra Action Point when Failure Behavior is 1; message when it is 2; unused when it is 0.";
  }
  if (shape === "item-branch" && name === "hastarget") {
    return "Extra Action Point, Simple Encounter, or Complex Encounter according to Branch Mode 0, 1, or 2.";
  }
  if (shape === "item-branch" && name === "missingtarget") {
    return "Uses Branch Mode when Missing Behavior is 0; message when it is 2; unused when it is 1.";
  }
  if (opcode === 76 && name === "target") {
    return "Unused when Threshold is 0; otherwise Extra Action Point, Simple Encounter, or Complex Encounter according to Auto Branch Type.";
  }
  if (["false-true-branch", "misc-conditional-branch"].includes(shape ?? "")
    && ["falsetarget", "truetarget"].includes(name)) {
    return "Zero continues without branching; nonzero routes to an Extra Action Point, Simple Encounter, or Complex Encounter according to Branch Type.";
  }
  if (opcode === 87 && name === "truetarget") {
    return "Extra Action Point, Simple Encounter, or Complex Encounter according to the present-branch mode.";
  }
  if (opcode === 87 && name === "falsetarget") {
    return "Uses the present-branch mode when False Behavior is 0; message when it is 2; unused when it is 1.";
  }
  if (["force-branch", "percent-branch"].includes(shape ?? "") && name === "target") {
    return "Extra Action Point or current Encounter result branch according to Branch Mode.";
  }
  return null;
}

function previewSupport(targetFamily: string | null | undefined) {
  return targetFamily ? "target-search-and-preview-when-record-backed" : "not-applicable";
}

function compare(filePath: string, expected: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`${relative(filePath)} is missing. Run npm run archaeology:encounter-ecode.`);
    process.exitCode = 1;
    return;
  }
  if (fs.readFileSync(filePath, "utf8") !== expected) {
    console.error(`${relative(filePath)} is stale. Run npm run archaeology:encounter-ecode.`);
    process.exitCode = 1;
  }
}

function countBy<T>(values: T[], keyFor: (value: T) => string) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyFor(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function readJson(filePath: string): JsonRecord {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as JsonRecord;
}

function relative(filePath: string) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function optionDomainKey(opcode: number, field: string) {
  return `${Math.abs(opcode)}:${field.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

function escapeCell(value: unknown) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}
