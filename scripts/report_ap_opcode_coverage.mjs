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
const manualEntriesByResource = new Map(manualHelp.entries.map((entry) => [entry.resourceId, entry]));

const firstClass = parseNumberSet(catalogSource, "FIRST_CLASS_ACTIONS");
const advanced = parseNumberSet(catalogSource, "ADVANCED_ACTIONS");
const ignored = parseNumberSet(catalogSource, "IGNORED_ACTIONS");
const manualNoneStepOnly = parseNumberSet(catalogSource, "MANUAL_NONE_STEP_ONLY_ACTIONS");
const overrideCodes = parseOverrideCodes(catalogSource, "ACTION_OVERRIDES");
const actionDetailCodes = parseOverrideCodes(actionSource, "ACTION_DETAILS");
const chooserConsolidations = parseChooserConsolidations(catalogSource);

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

const groups = groupBy(entries, (entry) => entry.status);
const gapGroups = groupBy(entries, (entry) => entry.gapStatus);
const confidenceGroups = groupBy(entries, (entry) => entry.evidenceConfidence);
const report = {
  schemaVersion: 2,
  source: {
    crosswalk: "src/editor/generated/opcodeEdcdCrosswalk.json",
    manualHelp: "docs/generated/divinity-opcode-help.json",
    catalog: "src/editor/panels/scripts/scriptActionCatalog.ts",
    actions: "src/editor/realmzActions.ts"
  },
  counts: Object.fromEntries([...groups.entries()].map(([key, value]) => [key, value.length]).sort()),
  gapCounts: Object.fromEntries([...gapGroups.entries()].map(([key, value]) => [key, value.length]).sort()),
  confidenceCounts: Object.fromEntries([...confidenceGroups.entries()].map(([key, value]) => [key, value.length]).sort()),
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
  if (entry.opcode === 121) return "macro-only-context-gated";
  if (entry.writerStatus === "writer-gated-not-used") return "not-used-no-dispatch";
  if (state.inAdvanced) return "preserved-but-known";
  if (entry.edcdBacked) return state.hasCatalogName ? "edcd-backed-guided" : "edcd-backed-needs-form";
  if (state.inFirstClass && state.hasCatalogName) return "authorable-now";
  if (state.hasCatalogName) return "preserved-but-known";
  return "truly-unknown";
}

function coverageNote(entry, status) {
  if (entry.opcode === 121) {
    return "Realmz source dispatches this only during combat and loads the ID as an Extra Code row; Providence keeps ordinary AP imports preserved and treats macro/combat surfaces as the intentional authoring path.";
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
    label: entry.idMeaning || "ID",
    internalName: "id",
    targetFamily: entry.targetFamily ?? null,
    preserved: false
  }];
}

function auditGapStatus(entry, state, status, manualEntries, isManualNoneStepOnly) {
  if (state.inIgnored || status === "not-used-no-dispatch") return "intentionally-preserved";
  if (entry.opcode === 121) return "combat-macro-only";
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
    "## Coverage",
    "",
    "| Opcode | Gap | Confidence | Title | Manual ID | Providence Fields | Storage | Related | Chooser | Notes |",
    "| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const entry of report.entries) {
    lines.push([
      `| ${entry.opcode}`,
      entry.gapStatus,
      entry.evidenceConfidence,
      escapeCell(entry.title),
      escapeCell(entry.manual.idField || entry.idMeaning || ""),
      escapeCell(formatProvidenceFields(entry.providenceFields)),
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
    "- Opcode 121: De-animate Lower Undead is useful, but source behavior is combat-gated. Ordinary Action Point imports are preserved; macro/combat authoring remains the intended surface.",
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

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}
