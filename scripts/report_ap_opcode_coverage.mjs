import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "docs", "generated");
const jsonOut = path.join(outDir, "ap-opcode-coverage.json");
const mdOut = path.join(outDir, "ap-opcode-coverage.md");

const crosswalk = readJson(path.join(root, "src", "editor", "generated", "opcodeEdcdCrosswalk.json")).entries;
const catalogSource = fs.readFileSync(path.join(root, "src", "editor", "panels", "scripts", "scriptActionCatalog.ts"), "utf8");
const actionSource = fs.readFileSync(path.join(root, "src", "editor", "realmzActions.ts"), "utf8");

const firstClass = parseNumberSet(catalogSource, "FIRST_CLASS_ACTIONS");
const advanced = parseNumberSet(catalogSource, "ADVANCED_ACTIONS");
const ignored = parseNumberSet(catalogSource, "IGNORED_ACTIONS");
const overrideCodes = parseOverrideCodes(catalogSource, "ACTION_OVERRIDES");
const actionDetailCodes = parseOverrideCodes(actionSource, "ACTION_DETAILS");

const entries = Object.values(crosswalk)
  .sort((a, b) => a.opcode - b.opcode)
  .map((entry) => {
    const code = entry.opcode;
    const hasCatalogName = overrideCodes.has(code) || actionDetailCodes.has(code);
    const inFirstClass = firstClass.has(code);
    const inAdvanced = advanced.has(code);
    const inIgnored = ignored.has(code);
    const status = classify(entry, { inFirstClass, inAdvanced, inIgnored, hasCatalogName });
    return {
      opcode: code,
      title: entry.title,
      status,
      note: coverageNote(entry, status),
      edcdBacked: Boolean(entry.edcdBacked),
      shape: entry.shape,
      writerStatus: entry.writerStatus,
      namedInCatalog: hasCatalogName,
      firstClass: inFirstClass,
      advanced: inAdvanced,
      targetFamily: entry.targetFamily,
      idMeaning: entry.idMeaning
    };
  });

const groups = groupBy(entries, (entry) => entry.status);
const report = {
  schemaVersion: 1,
  source: {
    crosswalk: "src/editor/generated/opcodeEdcdCrosswalk.json",
    catalog: "src/editor/panels/scripts/scriptActionCatalog.ts",
    actions: "src/editor/realmzActions.ts"
  },
  counts: Object.fromEntries([...groups.entries()].map(([key, value]) => [key, value.length]).sort()),
  entries,
  notes: [
    "Wrath AP 32/33 screenshot parity should be checked against the actual imported trigger selection, because the supplied Divinity and Providence screenshots appear to show neighboring Action Points rather than a guaranteed same selected row.",
    "Authorable status means Providence can present the action by name and preserve normal CODE/ID or Data EDCD storage. It does not imply a runtime interpreter."
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
  if (entry.opcode === 84) return "manual-source-discrepancy";
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
    return "Divinity/manual labels this Not Used, but Realmz Revisited has a registration-check dispatcher case. Treat as a manual/source discrepancy until classic behavior and Divinity editability are verified.";
  }
  if (status === "not-used-no-dispatch") return "Documented not-used opcode with no normal authoring path; preserve imported values but do not present as meaningful authoring.";
  return "";
}

function renderMarkdown(report) {
  const lines = [
    "# Action Point Opcode Coverage",
    "",
    "Generated from Providence's action catalog and the Divinity/manual opcode crosswalk.",
    "",
    "## Summary",
    "",
    ...Object.entries(report.counts).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Coverage",
    "",
    "| Opcode | Status | Title | Storage | Shape | Notes |",
    "| ---: | --- | --- | --- | --- | --- |"
  ];
  for (const entry of report.entries) {
    lines.push(`| ${entry.opcode} | ${entry.status} | ${escapeCell(entry.title)} | ${entry.edcdBacked ? "Data EDCD" : entry.targetFamily ?? "direct"} | ${entry.shape ?? ""} | ${escapeCell(entry.note)} |`);
  }
  lines.push(
    "",
    "## Discrepancy Notes",
    "",
    "- Opcode 84: Divinity/manual says Not Used, while Realmz Revisited contains a registration-check case. Keep preserve-only until verified against classic behavior and Divinity editing.",
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
