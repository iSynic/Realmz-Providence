import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "docs", "generated");
const jsonOut = path.join(outDir, "ap-opcode-coverage.json");
const mdOut = path.join(outDir, "ap-opcode-coverage.md");

const crosswalk = readJson(path.join(root, "src", "editor", "generated", "opcodeEdcdCrosswalk.json")).entries;
const manualHelp = readJson(path.join(root, "docs", "generated", "divinity-opcode-help.json"));
const catalogSource = fs.readFileSync(path.join(root, "src", "editor", "panels", "scripts", "scriptActionCatalog.ts"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "src", "editor", "realmzActions.ts"), "utf8");
const targetPickerSource = fs.readFileSync(path.join(root, "src", "editor", "components", "RealmzTargetPicker.tsx"), "utf8");
const optionDomainSource = readJson(path.join(root, "src", "editor", "edcdOptionDomains.json"));
const directActionOptionSource = readJson(path.join(root, "src", "editor", "directActionOptionDomains.json"));
const contextSource = readJson(path.join(root, "src", "editor", "panels", "scripts", "scriptActionContexts.json"));
const manualEntriesByResource = new Map(manualHelp.entries.map((entry) => [entry.resourceId, entry]));
const optionDomains = new Map(optionDomainSource.domains.map((domain) => [optionDomainKey(domain.opcode, domain.field), domain]));
const numericGuidance = new Map(optionDomainSource.numericGuidance.map((field) => [optionDomainKey(field.opcode, field.field), field]));
const directChoiceDomains = new Map(directActionOptionSource.domains.map((domain) => [domain.opcode, domain]));
const directNumericGuidance = new Map(directActionOptionSource.numericGuidance.map((domain) => [domain.opcode, domain]));
const directSignedModes = new Map(directActionOptionSource.signedModes.map((mode) => [mode.opcode, mode]));
const contextRestrictions = new Map(contextSource.restrictions.map((restriction) => [restriction.opcode, restriction]));

const firstClass = parseNumberSet(catalogSource, "FIRST_CLASS_ACTIONS");
const advanced = parseNumberSet(catalogSource, "ADVANCED_ACTIONS");
const ignored = parseNumberSet(catalogSource, "IGNORED_ACTIONS");
const manualNoneStepOnly = parseNumberSet(catalogSource, "MANUAL_NONE_STEP_ONLY_ACTIONS");
const overrideCodes = parseOverrideCodes(catalogSource, "ACTION_OVERRIDES");
const actionDetailCodes = parseOverrideCodes(actionSource, "ACTION_DETAILS");
const chooserConsolidations = parseChooserConsolidations(catalogSource);
const directTargetConfigs = parseTargetPickerConfigs(targetPickerSource);
const searchTargetFamilies = new Set([
  "message",
  "message-or-option-label",
  "option-label",
  "sound",
  "picture",
  "text-resource",
  "scrolling-text",
  "shop",
  "simple-encounter",
  "complex-encounter",
  "thief-encounter",
  "timed-encounter",
  "battle",
  "treasure",
  "item",
  "monster",
  "extra-action-point",
  "extra-action-point-or-encounter",
  "macro",
  "quest-label",
  "map-record",
  "random-encounter-rectangle"
]);
const edcdSearchBackedFamilies = new Set([
  "battle",
  "treasure",
  "shop",
  "simple-encounter",
  "complex-encounter",
  "thief-encounter",
  "timed-encounter",
  "extra-action-point",
  "extra-action-point-or-encounter",
  "macro",
  "monster"
]);

const entries = Object.values(crosswalk)
  .sort((a, b) => a.opcode - b.opcode)
  .map((entry) => {
    const code = entry.opcode;
    const manualEntries = manualHelpEntriesFor(code);
    const hasCatalogName = overrideCodes.has(code) || actionDetailCodes.has(code);
    const inFirstClass = firstClass.has(code);
    const inAdvanced = advanced.has(code);
    const inIgnored = ignored.has(code);
    const state = { inFirstClass, inAdvanced, inIgnored, hasCatalogName };
    const status = classify(entry, state);
    const manual = summarizeManualHelp(manualEntries);
    const manualNoOptions = manualEntriesHaveNoOptions(manualEntries);
    const isManualNoneStepOnly = manualNoneStepOnly.has(code);
    const providenceFields = providenceAuthoringFields(entry, state, isManualNoneStepOnly);
    const gapStatus = auditGapStatus(entry, state, status, manualEntries, isManualNoneStepOnly);
    const evidenceConfidence = auditEvidenceConfidence(entry, status, manualEntries);
    const chooserConsolidation = chooserConsolidationFor(code);
    const authoringControls = authoringControlsForEntry(entry, state, status, gapStatus, evidenceConfidence, providenceFields);
    return {
      opcode: code,
      title: coverageTitle(entry),
      status,
      gapStatus,
      evidenceConfidence,
      note: coverageNote(entry, status),
      manual,
      manualNoOptions,
      manualNoneStepOnly: isManualNoneStepOnly,
      relatedOpcodes: relatedManualOpcodes(manualEntries, code),
      ...(chooserConsolidation ? { chooserConsolidation } : {}),
      providenceFields,
      authoringControls,
      edcdBacked: Boolean(entry.edcdBacked),
      shape: entry.shape,
      writerStatus: entry.writerStatus,
      namedInCatalog: hasCatalogName,
      firstClass: inFirstClass,
      advanced: inAdvanced,
      targetFamily: entry.targetFamily,
      idMeaning: entry.idMeaning,
      sourceStatus: entry.sourceStatus ?? null,
      runtimeNote: entry.runtimeNote ?? null
    };
  });

validateOptionDomains();

const groups = groupBy(entries, (entry) => entry.status);
const gapGroups = groupBy(entries, (entry) => entry.gapStatus);
const confidenceGroups = groupBy(entries, (entry) => entry.evidenceConfidence);
const controlStatusGroups = groupBy(entries.flatMap((entry) => entry.authoringControls), (control) => control.status);
const expectedControlGroups = groupBy(entries.flatMap((entry) => entry.authoringControls), (control) => control.expectedControl);
const report = {
  schemaVersion: 3,
  source: {
    crosswalk: "src/editor/generated/opcodeEdcdCrosswalk.json",
    manualHelp: "docs/generated/divinity-opcode-help.json",
    catalog: "src/editor/panels/scripts/scriptActionCatalog.ts",
    actions: "src/editor/realmzActions.ts",
    targetPicker: "src/editor/components/RealmzTargetPicker.tsx",
    optionDomains: "src/editor/edcdOptionDomains.json",
    directActionDomains: "src/editor/directActionOptionDomains.json",
    authoringContexts: "src/editor/panels/scripts/scriptActionContexts.json"
  },
  counts: Object.fromEntries([...groups.entries()].map(([key, value]) => [key, value.length]).sort()),
  gapCounts: Object.fromEntries([...gapGroups.entries()].map(([key, value]) => [key, value.length]).sort()),
  confidenceCounts: Object.fromEntries([...confidenceGroups.entries()].map(([key, value]) => [key, value.length]).sort()),
  controlStatusCounts: Object.fromEntries([...controlStatusGroups.entries()].map(([key, value]) => [key, value.length]).sort()),
  expectedControlCounts: Object.fromEntries([...expectedControlGroups.entries()].map(([key, value]) => [key, value.length]).sort()),
  optionContractCounts: {
    finiteSelectDomains: optionDomains.size,
    numericSentinelDomains: numericGuidance.size,
    directFiniteChoiceDomains: directChoiceDomains.size,
    directGuidedNumericDomains: directNumericGuidance.size,
    directSignedBehaviorDomains: directSignedModes.size,
    documentedNumericOptionFields: documentedNumericOptionFields().length
  },
  entries,
  notes: [
    "Wrath AP 32/33 screenshot parity should be checked against the actual imported trigger selection, because the supplied Divinity and Providence screenshots appear to show neighboring Action Points rather than a guaranteed same selected row.",
    "Authorable status means Providence can present the action by name and preserve normal CODE/ID or Data EDCD storage. It does not imply a runtime interpreter.",
    "Gap status is an audit triage label. Covered in current UI means the opcode has a writable named surface; it does not mean every field layout or wording is final."
  ]
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(mdOut, renderMarkdown(report));
console.log(`Wrote ${path.relative(root, jsonOut)}`);
console.log(`Wrote ${path.relative(root, mdOut)}`);

function classify(entry, state) {
  if (state.inIgnored) return "ignored-empty";
  if (contextRestrictions.has(entry.opcode)) return "context-only-gated";
  if (entry.writerStatus === "writer-gated-not-used") return "not-used-no-dispatch";
  if (state.inAdvanced) return "preserved-but-known";
  if (entry.edcdBacked) return state.hasCatalogName ? "edcd-backed-guided" : "edcd-backed-needs-form";
  if (state.inFirstClass && state.hasCatalogName) return "authorable-now";
  if (state.hasCatalogName) return "preserved-but-known";
  return "truly-unknown";
}

function coverageNote(entry, status) {
  if (entry.opcode === -14) {
    return "Manual-backed signed pick variant. Providence preserves/writes the signed opcode and direct ID; Realmz applies the picked-character behavior at runtime.";
  }
  if (contextRestrictions.has(entry.opcode)) {
    const restriction = contextRestrictions.get(entry.opcode);
    return `${restriction.reason} Providence preserves imported uses outside that context while limiting new chooser placement to ${restriction.contexts.join(", ")}.`;
  }
  if (entry.opcode === 84) {
    return "Realmz source has a legacy registration-check dispatcher case. Classic Realmz could enforce scenario registration here; modern open-source builds keep the dispatcher but comment out enforcement.";
  }
  if (status === "not-used-no-dispatch") return "Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring.";
  return "";
}

function coverageTitle(entry) {
  if (entry.opcode === 84) return "Legacy Registration Check";
  return entry.title;
}

function manualHelpEntriesFor(code) {
  if (code === -14) return manualHelpEntriesFor(14);
  const resourceIds = manualHelp.byCode[String(code)] ?? [];
  return resourceIds.map((id) => manualEntriesByResource.get(id)).filter(Boolean);
}

function summarizeManualHelp(manualEntries) {
  if (manualEntries.length === 0) {
    return {
      resourceIds: [],
      title: "",
      idField: "",
      use: "",
      options: "",
      extraCodes: ""
    };
  }
  const primary = manualEntries[0];
  return {
    resourceIds: manualEntries.map((entry) => entry.resourceId),
    title: primary.title ?? "",
    idField: primary.idField ?? "",
    use: primary.use ?? "",
    options: primary.options ?? "",
    extraCodes: primary.extraCodes ?? ""
  };
}

function manualEntriesHaveNoOptions(manualEntries) {
  if (manualEntries.length === 0) return false;
  return manualEntries.every((entry) =>
    /^none$/i.test(String(entry.idField ?? "").trim()) &&
    /^none$/i.test(String(entry.options ?? "").trim()) &&
    /^none$/i.test(String(entry.extraCodes ?? "").trim())
  );
}

function relatedManualOpcodes(manualEntries, code) {
  return [...new Set(manualEntries.flatMap((entry) => entry.codes ?? []))]
    .filter((relatedCode) => relatedCode !== code)
    .sort((a, b) => a - b);
}

function providenceAuthoringFields(entry, state, isManualNoneStepOnly) {
  if (entry.parameters?.length > 0) {
    return entry.parameters.map((parameter) => ({
      index: parameter.index,
      label: parameter.label,
      internalName: parameter.internalName,
      targetFamily: parameter.targetFamily ?? null,
      preserved: Boolean(parameter.preserved)
    }));
  }
  if (state.inIgnored || isManualNoneStepOnly || entry.opcode === 84 || entry.opcode === 98 || entry.opcode === 99) {
    return [{
      index: null,
      label: "Step only",
      internalName: "stepOnly",
      targetFamily: null,
      preserved: false
    }];
  }
  if (entry.opcode === 62) {
    return [{
      index: null,
      label: "Scrolling Text",
      internalName: "textResourceId",
      targetFamily: "text-resource",
      preserved: false
    }];
  }
  return [{
    index: null,
    label: directChoiceDomains.get(entry.opcode)?.label ?? (entry.idMeaning || "ID"),
    internalName: "id",
    targetFamily: directChoiceDomains.has(entry.opcode) ? null : entry.targetFamily ?? null,
    preserved: false
  }];
}

function auditGapStatus(entry, state, status, manualEntries, isManualNoneStepOnly) {
  if (state.inIgnored || status === "not-used-no-dispatch") return "intentionally-preserved";
  if (contextRestrictions.has(entry.opcode)) return "context-restricted";
  if (entry.opcode === 84 || entry.opcode === 98 || entry.opcode === 99) return "legacy-compatible";
  if (isManualNoneStepOnly) return "step-only-no-options";
  if (status === "truly-unknown") return "needs-source-runtime-evidence";
  if (status === "edcd-backed-needs-form") return "needs-guided-authoring";
  if (manualEntries.length === 0) return "needs-manual-evidence";
  if (status === "preserved-but-known") return "preserved-known-behavior";
  return "covered-in-current-ui";
}

function auditEvidenceConfidence(entry, status, manualEntries) {
  if (entry.sourceStatus?.startsWith("source-audited") || entry.sourceStatus === "corrected-field-semantics") {
    return "source-backed";
  }
  if (entry.opcode === 84 || entry.opcode === 121) return "source-backed";
  if (status === "truly-unknown") return "unknown";
  if (entry.writerStatus === "writer-gated-not-used") return "manual-plus-preservation";
  if (manualEntries.length > 0) return "manual-backed";
  return "catalog-only";
}

function authoringControlsForEntry(entry, state, status, gapStatus, evidenceConfidence, fields) {
  return fields.map((field) => {
    const targetFamily = effectiveFieldTargetFamily(entry, field);
    const expectedControl = expectedControlForField(entry, field, targetFamily, gapStatus);
    return {
      fieldLabel: field.label,
      internalName: field.internalName,
      index: field.index,
      storage: storageForField(entry, field, expectedControl),
      targetFamily,
      expectedControl,
      implementedSurface: implementedSurfaceForField(entry, field, targetFamily, expectedControl),
      status: controlStatusForField(status, gapStatus, evidenceConfidence, expectedControl),
      evidence: evidenceConfidence
    };
  });
}

function effectiveFieldTargetFamily(entry, field) {
  if (field.preserved || field.internalName === "stepOnly") return null;
  if (!entry.edcdBacked && directChoiceDomains.has(entry.opcode)) return null;
  if (!entry.edcdBacked && field.internalName === "id") {
    return directTargetConfigs.get(entry.opcode)?.targetFamily ?? field.targetFamily ?? entry.targetFamily ?? null;
  }
  const shape = String(entry.shape ?? "").toLowerCase();
  const name = String(field.internalName ?? "").toLowerCase();
  if (shape === "force-branch" && entry.opcode === 38 && name === "testa") return "item";
  if (shape.includes("item") && (name.includes("item") || name === "required")) return "item";
  if (shape === "action-data-patching" && name === "macro") return "extra-action-point";
  if (name.includes("scrollingtext")) return "text-resource";
  if (name.includes("timedencounter") || name === "timeencounter") return "timed-encounter";
  if (name.includes("thief") || name.includes("rogue")) return "thief-encounter";
  if (name.includes("treasure")) return "treasure";
  if (name.includes("shop")) return "shop";
  if (field.targetFamily === "message-or-option-label") return "message-or-option-label";
  if (name.includes("sound")) return "sound";
  if (name.includes("message") || name.startsWith("prompt")) return "message";
  if (name.includes("monster")) return "monster";
  if (name.includes("macro")) return "extra-action-point";
  if (shape.includes("battle") && (name === "battlelow" || name === "battlehigh")) return "battle";
  if (field.targetFamily === "extra-action-point-or-encounter") {
    return branchDestinationField(name) ? "extra-action-point-or-encounter" : null;
  }
  return field.targetFamily ?? null;
}

function branchDestinationField(name) {
  return [
    "branchtarget",
    "target",
    "truetarget",
    "falsetarget",
    "successtarget",
    "failuretarget",
    "hastarget",
    "missingtarget",
    "successmacro",
    "failuremacro"
  ].includes(name);
}

function expectedControlForField(entry, field, targetFamily, gapStatus) {
  const name = String(field.internalName ?? "").toLowerCase();
  if (name === "steponly" || gapStatus === "step-only-no-options" || gapStatus === "legacy-compatible") return "step-only";
  if (field.preserved || gapStatus === "intentionally-preserved") return "advanced-preserved";
  if (!entry.edcdBacked && directChoiceDomains.has(entry.opcode)) return "compact-select";
  if (optionDomains.has(optionDomainKey(entry.opcode, field.internalName))) return "compact-select";
  if (searchTargetFamilies.has(targetFamily)) return "search-target";
  if (!entry.edcdBacked) return "contextual-number";
  return "narrow-number";
}

function implementedSurfaceForField(entry, field, targetFamily, expectedControl) {
  if (expectedControl === "advanced-preserved") return entry.edcdBacked ? "Collapsed Technical Details preserved value" : "Preserved CODE/ID value";
  if (expectedControl === "step-only") return "Action chooser step-only control";
  if (!entry.edcdBacked) {
    if (expectedControl === "search-target") return "Contextual direct-action modal with RealmzTargetPicker";
    if (expectedControl === "compact-select") return "Contextual direct-action modal with documented choices";
    return "Contextual direct-action modal with labeled numeric guidance";
  }
  if (expectedControl === "search-target") {
    if (targetFamily === "item") return "EdcdItemTargetField search/preview control";
    if (targetFamily === "message" || targetFamily === "sound") return "EdcdSearchTargetField";
    if (edcdSearchBackedFamilies.has(targetFamily)) return "EdcdSelectTargetField search-backed selected row";
    return "EdcdSelectTargetField target picker";
  }
  if (expectedControl === "compact-select") return "Guided EDCD compact select";
  if (expectedControl === "toggle") return "Guided EDCD boolean/signed intent control";
  return "Guided EDCD narrow numeric field";
}

function controlStatusForField(status, gapStatus, evidenceConfidence, expectedControl) {
  if (gapStatus === "needs-manual-evidence" || evidenceConfidence === "unknown") return "needs-evidence";
  if (status === "truly-unknown" || status === "edcd-backed-needs-form") return "needs-ui-fix";
  if (evidenceConfidence === "catalog-only" && gapStatus !== "intentionally-preserved" && expectedControl !== "step-only") return "needs-evidence";
  return "ok";
}

function storageForField(entry, field, expectedControl) {
  if (field.preserved) return "preserved-edcd-value";
  if (expectedControl === "step-only") return "step-only";
  return entry.edcdBacked ? "data-edcd-parameter-row" : "direct-code-id";
}

function renderMarkdown(report) {
  const lines = [
    "# Action Point Opcode Coverage",
    "",
    "Generated from Providence's action catalog, the Divinity/manual opcode crosswalk, and extracted Divinity opcode help.",
    "",
    "## Summary",
    "",
    ...Object.entries(report.counts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Audit Triage",
    "",
    ...Object.entries(report.gapCounts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Evidence Confidence",
    "",
    ...Object.entries(report.confidenceCounts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Authoring Control Audit",
    "",
    ...Object.entries(report.controlStatusCounts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Expected Controls",
    "",
    ...Object.entries(report.expectedControlCounts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Coverage",
    "",
    "| Opcode | Gap | Confidence | Title | Manual ID | Providence Fields | Authoring Controls | Storage | Related | Chooser | Notes |",
    "| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const entry of report.entries) {
    lines.push([
      `| ${entry.opcode}`,
      entry.gapStatus,
      entry.evidenceConfidence,
      escapeCell(entry.title),
      escapeCell(entry.manual.idField || entry.idMeaning || ""),
      escapeCell(formatProvidenceFields(entry.providenceFields)),
      escapeCell(formatAuthoringControls(entry.authoringControls)),
      entry.edcdBacked ? "Data EDCD" : entry.targetFamily ?? "direct",
      entry.relatedOpcodes.join(", "),
      escapeCell(formatChooserConsolidation(entry.chooserConsolidation)),
      escapeCell(entry.note || entry.runtimeNote || "")
    ].join(" | ") + " |");
  }
  lines.push(
    "",
    "## Special Opcode Notes",
    "",
    "- Opcode 84: Realmz source has a legacy registration-check dispatcher case. Providence supports authoring it for old-school Realmz compatibility; modern open-source builds keep the dispatcher but comment out enforcement.",
    "- Context-restricted actions remain visible when imported, but chooser placement is limited to the encounter, battle-macro, or monster-macro contexts documented by Divinity and Realmz runtime behavior.",
    "",
    "## Wrath Crosscheck Note",
    "",
    report.notes[0],
    "",
    "Use an Evidence Lab before/after fixture when a Divinity screenshot and imported Providence row disagree, so we can separate indexing drift from import/labeling bugs.",
    ""
  );
  return `${lines.join("\n")}\n`;
}

function formatAuthoringControls(controls) {
  return controls
    .map((control) => {
      const target = control.targetFamily ? ` -> ${control.targetFamily}` : "";
      const status = control.status === "ok" ? "" : ` [${control.status}]`;
      return `${control.fieldLabel}: ${control.expectedControl}${target}${status}`;
    })
    .join("; ");
}

function formatProvidenceFields(fields) {
  return fields
    .filter((field) => !field.preserved)
    .map((field) => {
      const target = field.targetFamily ? ` -> ${field.targetFamily}` : "";
      return `${field.label}${target}`;
    })
    .join("; ");
}

function formatChooserConsolidation(consolidation) {
  if (!consolidation) return "";
  if (consolidation.role === "canonical") {
    return `Canonical chooser action for ${consolidation.aliasOpcodes.join(", ")}; ${consolidation.writeRule}`;
  }
  return `Hidden chooser alias of ${consolidation.canonicalOpcode}; ${consolidation.writeRule}`;
}

function chooserConsolidationFor(code) {
  const alias = chooserConsolidations.find((entry) => entry.aliasOpcode === code);
  if (alias) {
    return {
      role: "alias",
      canonicalOpcode: alias.canonicalOpcode,
      aliasOpcodes: [],
      reason: alias.reason,
      writeRule: alias.writeRule
    };
  }
  const aliases = chooserConsolidations.filter((entry) => entry.canonicalOpcode === code);
  if (aliases.length === 0) return null;
  return {
    role: "canonical",
    canonicalOpcode: code,
    aliasOpcodes: aliases.map((entry) => entry.aliasOpcode).sort((a, b) => a - b),
    reason: aliases.map((entry) => entry.reason).join(" "),
    writeRule: aliases.map((entry) => entry.writeRule).join(" ")
  };
}

function parseNumberSet(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) return new Set();
  return new Set((match[1].match(/-?\d+/g) ?? []).map(Number));
}

function parseOverrideCodes(source, name) {
  const start = source.indexOf(`const ${name}`);
  if (start < 0) return new Set();
  const end = source.indexOf("\n};", start);
  const body = end > start ? source.slice(start, end) : source.slice(start);
  return new Set((body.match(/(?:^|\n)\s*(-?\d+|\[-?\d+\])\s*:/g) ?? []).map((match) => Number(match.replace(/[^-\d]/g, ""))));
}

function parseChooserConsolidations(source) {
  const start = source.indexOf("export const SCRIPT_ACTION_CHOOSER_CONSOLIDATIONS");
  if (start < 0) return [];
  const end = source.indexOf("] as const", start);
  const body = end > start ? source.slice(start, end) : source.slice(start);
  return [...body.matchAll(/\{\s*aliasOpcode:\s*(-?\d+),\s*canonicalOpcode:\s*(-?\d+),\s*reason:\s*"([^"]+)",\s*writeRule:\s*"([^"]+)"\s*\}/g)]
    .map((match) => ({
      aliasOpcode: Number(match[1]),
      canonicalOpcode: Number(match[2]),
      reason: match[3],
      writeRule: match[4]
    }));
}

function parseTargetPickerConfigs(source) {
  const start = source.indexOf("const configs:");
  if (start < 0) return new Map();
  const end = source.indexOf("\n  };", start);
  const body = end > start ? source.slice(start, end) : source.slice(start);
  const configs = new Map();
  for (const match of body.matchAll(/(?:^|\n)\s*(\d+):\s*\{([^}]+)\}/g)) {
    const opcode = Number(match[1]);
    const objectText = match[2];
    const label = stringProperty(objectText, "label") ?? "";
    const recordType = stringProperty(objectText, "recordType");
    const searchable = !/searchable:\s*false/.test(objectText);
    configs.set(opcode, {
      label,
      recordType,
      searchable,
      targetFamily: targetFamilyForDirectTargetConfig(label, recordType)
    });
  }
  return configs;
}

function stringProperty(objectText, name) {
  const match = objectText.match(new RegExp(`${name}:\\s*"([^"]+)"`));
  return match?.[1] ?? null;
}

function targetFamilyForDirectTargetConfig(label, recordType) {
  if (recordType) return camelRecordTypeToTargetFamily(recordType);
  const normalized = label.toLowerCase();
  if (normalized.includes("string")) return "message";
  if (normalized.includes("sound")) return "sound";
  if (normalized.includes("picture")) return "picture";
  if (normalized.includes("scrolling text")) return "text-resource";
  if (normalized.includes("extra action point")) return "extra-action-point";
  if (normalized.includes("map item")) return "map-item";
  if (normalized.includes("map record") || normalized.includes("player map")) return "map-record";
  return "direct-id";
}

function camelRecordTypeToTargetFamily(recordType) {
  return recordType
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

function groupBy(values, keyFor) {
  const result = new Map();
  for (const value of values) {
    const key = keyFor(value);
    const list = result.get(key) ?? [];
    list.push(value);
    result.set(key, list);
  }
  return result;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function optionDomainKey(opcode, field) {
  return `${Math.abs(Number(opcode))}:${String(field ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

function validateOptionDomains() {
  const failures = [];
  const seen = new Set();
  for (const domain of optionDomainSource.domains) {
    const key = optionDomainKey(domain.opcode, domain.field);
    if (seen.has(key)) failures.push(`Duplicate ECODE option domain ${key}.`);
    seen.add(key);
    const entry = crosswalk[String(domain.opcode)] ?? crosswalk[String(-Math.abs(domain.opcode))];
    if (!entry?.edcdBacked) {
      failures.push(`ECODE option domain ${key} does not identify an ECODE-backed opcode.`);
      continue;
    }
    const field = entry.parameters?.find((parameter) => optionDomainKey(domain.opcode, parameter.internalName) === key);
    if (!field) failures.push(`ECODE option domain ${key} does not match a canonical field.`);
    if (field?.preserved) failures.push(`ECODE option domain ${key} targets a preserved-only field.`);
    if (!Array.isArray(domain.options) || domain.options.length < 2) failures.push(`ECODE option domain ${key} needs at least two choices.`);
    const values = new Set((domain.options ?? []).map((option) => Number(option.value)));
    if (values.size !== (domain.options ?? []).length) failures.push(`ECODE option domain ${key} repeats a stored value.`);
  }
  for (const domain of directActionOptionSource.domains) {
    const key = `direct:${domain.opcode}`;
    if (seen.has(key)) failures.push(`Duplicate direct-action option domain ${key}.`);
    seen.add(key);
    if (!Array.isArray(domain.options) || domain.options.length < 2) {
      failures.push(`Direct-action option domain ${key} must contain at least two choices.`);
    }
  }
  for (const fieldContract of optionDomainSource.numericGuidance) {
    const key = optionDomainKey(fieldContract.opcode, fieldContract.field);
    if (seen.has(key)) failures.push(`ECODE field contract ${key} is classified as both finite-select and numeric-guided.`);
    seen.add(key);
    const entry = crosswalk[String(fieldContract.opcode)];
    const field = entry?.parameters?.find((parameter) => optionDomainKey(fieldContract.opcode, parameter.internalName) === key);
    if (!entry?.edcdBacked || !field) failures.push(`Numeric ECODE guidance ${key} does not match a canonical ECODE field.`);
    if (!String(fieldContract.reason ?? "").trim()) failures.push(`Numeric ECODE guidance ${key} needs an author-facing reason.`);
  }
  for (const candidate of documentedNumericOptionFields()) {
    const key = optionDomainKey(candidate.opcode, candidate.field);
    if (!optionDomains.has(key) && !numericGuidance.has(key)) {
      failures.push(`Documented numeric ECODE choices for ${key} are not classified as a finite select or numeric sentinel field.`);
    }
  }
  if (failures.length > 0) throw new Error(failures.join("\n"));
}

function documentedNumericOptionFields() {
  const fields = [];
  for (const entry of Object.values(crosswalk)) {
    if (entry.opcode <= 0 || !entry.edcdBacked) continue;
    for (const parameter of entry.parameters ?? []) {
      if (parameter.preserved) continue;
      if (/(?<!\d)-?\d+\s*=/.test(String(parameter.help ?? ""))) {
        fields.push({ opcode: entry.opcode, field: parameter.internalName });
      }
    }
  }
  return fields;
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}
