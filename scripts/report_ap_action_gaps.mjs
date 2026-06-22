import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(stringArg(args, "out") || path.join(root, "docs", "generated"));
const crosswalk = readJson(path.join(root, "src", "editor", "generated", "opcodeEdcdCrosswalk.json")).entries ?? {};
const NOT_USED_OPCODES = new Set([79, 80, 109, 110, 113, 114, 115, 116, 117, 118]);
const NON_BACKLOG_KINDS = new Set(["needs-runtime-trace", "macro-only-imported", "inert-imported-action"]);
const projectFiles = discoverProjectFiles(args);
const projects = dedupeProjects(projectFiles).map((file) => buildProjectReport(file));
const grouped = groupFindings(projects.flatMap((project) => project.findings.map((finding) => ({ ...finding, scenario: project.scenario, projectPath: project.projectPath }))));

const report = {
  schemaVersion: 1,
  generatedAt: null,
  scanScope: scanScope(args),
  scanRoots: projectFiles.length ? [...new Set(projectFiles.map((file) => path.dirname(file)))].sort() : [],
  projectCount: projects.length,
  projectsScanned: projects.map((project) => ({ scenario: project.scenario, projectPath: project.projectPath, findingCount: project.findings.length })),
  summary: summarize(grouped),
  authoringRelevantCount: grouped.filter((group) => !NON_BACKLOG_KINDS.has(group.kind)).reduce((sum, group) => sum + group.count, 0),
  groups: grouped,
  projects
};

fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "ap-action-gaps.json");
const mdPath = path.join(outputDir, "ap-action-gaps.md");
writeJson(jsonPath, report);
fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");

console.log(JSON.stringify({ ok: true, projectCount: report.projectCount, findingCount: report.projects.reduce((sum, project) => sum + project.findings.length, 0), jsonPath, mdPath }, null, 2));

if (args.get("fail-on-authoring-gaps") && report.authoringRelevantCount > 0) {
  console.error(`AP action gap gate failed: ${report.authoringRelevantCount} authoring-relevant finding(s). See ${mdPath}`);
  process.exit(1);
}

function discoverProjectFiles(parsed) {
  const explicit = parsed.get("project") ?? [];
  if (explicit.length) return explicit.map((file) => path.resolve(file));
  const roots = parsed.get("root")?.map((entry) => path.resolve(entry)) ?? defaultRoots(Boolean(parsed.get("include-scratch")));
  const files = [];
  for (const searchRoot of roots) collectProjectFiles(searchRoot, files);
  return files;
}

function scanScope(parsed) {
  if (parsed.get("project")) return "explicit-projects";
  if (parsed.get("root")) return "explicit-roots";
  return parsed.get("include-scratch") ? "benchmark-and-scratch" : "benchmark";
}

function defaultRoots(includeScratch = false) {
  const roots = [
    path.join(root, "tmp", "desktop-ui-harness"),
    path.join(root, "fixtures")
  ];
  if (includeScratch) {
    roots.push(
      path.join(root, "tmp", "asset-triage"),
      path.join(root, "tmp", "editor-script-workflow-20260521-222621")
    );
  }
  return roots.filter((candidate) => fs.existsSync(candidate));
}

function collectProjectFiles(searchRoot, out) {
  if (!fs.existsSync(searchRoot)) return;
  const stat = fs.statSync(searchRoot);
  if (stat.isFile() && path.basename(searchRoot).toLowerCase() === "project.json") {
    out.push(searchRoot);
    return;
  }
  if (!stat.isDirectory()) return;
  const base = path.basename(searchRoot).toLowerCase();
  if (["node_modules", ".git", "target"].includes(base)) return;
  if (searchRoot.includes(`${path.sep}oracle-runs${path.sep}`) || searchRoot.includes(`${path.sep}editor-smoke-runs${path.sep}`)) return;
  for (const entry of fs.readdirSync(searchRoot, { withFileTypes: true })) {
    collectProjectFiles(path.join(searchRoot, entry.name), out);
  }
}

function dedupeProjects(files) {
  const byScenario = new Map();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const project = readJson(file);
      const scenario = scenarioName(project, file).toLowerCase();
      const current = byScenario.get(scenario);
      const rank = projectRank(file);
      if (!current || rank > current.rank) byScenario.set(scenario, { file, rank });
    } catch {
      // Ignore malformed scratch files; the report is about imported Providence projects.
    }
  }
  return [...byScenario.values()].sort((a, b) => a.file.localeCompare(b.file)).map((entry) => entry.file);
}

function projectRank(file) {
  let rank = fs.statSync(file).mtimeMs;
  if (file.includes(`${path.sep}desktop-ui-harness${path.sep}`)) rank += 1_000_000_000;
  if (file.includes(`${path.sep}asset-triage${path.sep}`)) rank += 500_000_000;
  if (file.includes(`${path.sep}oracle-runs${path.sep}`) || file.includes(`${path.sep}editor-smoke-runs${path.sep}`)) rank -= 5_000_000_000;
  return rank;
}

function buildProjectReport(file) {
  const project = readJson(file);
  const scenario = scenarioName(project, file);
  const ed3ByIndex = new Map((project.semanticSchema?.decoding?.ed3Reachability ?? []).map((row) => [Number(row.recordIndex), row]));
  const findings = [];
  for (const trigger of project.triggers ?? []) {
    const recordKind = recordKindFor(trigger);
    const ed3 = trigger.source === "Data ED3" ? ed3ByIndex.get(Number(trigger.recordIndex)) ?? null : null;
    for (const action of trigger.actions ?? []) {
      const rawCode = numberValue(action.rawCode ?? action.code);
      const code = normalizeOpcode(rawCode);
      if (code === 0) continue;
      const finding = classifyAction(project, trigger, action, code, rawCode, recordKind, ed3);
      if (finding) findings.push(finding);
    }
  }
  findings.sort((a, b) => a.opcode - b.opcode || a.recordKind.localeCompare(b.recordKind) || a.row - b.row || a.slot - b.slot);
  return { scenario, projectPath: file, findings };
}

function classifyAction(project, trigger, action, code, rawCode, recordKind, ed3) {
  const entry = crosswalk[String(code)] ?? null;
  const ed3Classification = ed3?.reachable ? "source-backed" : ed3?.classification ?? (trigger.source === "Data ED3" ? "unknown" : null);
  const rootType = ed3?.rootType ?? null;
  const macroContext = isCombatMacroContext(recordKind, rootType);
  if (code === 121) {
    return {
      kind: macroContext ? "macro-only-authorable" : "macro-only-imported",
      severity: "info",
      label: macroContext ? "De-animate Lower Undead" : "Macro-only imported action",
      detail: macroContext
        ? "Combat macro action. New authored rows should store ID 0 unless a known macro settings row is intentionally used."
        : "Realmz only performs this action during combat. Providence preserves this ordinary AP/ED3 import, but it is not routine Action Point authoring backlog.",
      opcode: code,
      rawCode,
      id: numberValue(action.id),
      settingsRow: numberValue(action.id),
      recordKind,
      row: numberValue(trigger.recordIndex),
      slot: numberValue(action.slot),
      triggerId: trigger.id ?? "",
      ed3Classification,
      rootType,
      crosswalkStatus: "macro-only-context-gated",
      sourceDisposition: "source-dispatched-combat-gated"
    };
  }
  if (code === 84) {
    return {
      kind: "manual-source-discrepancy",
      severity: "warning",
      label: "Registration-check discrepancy",
      detail: "Divinity/manual material calls opcode 84 Not Used, but Realmz Revisited contains a registration-check case. Preserve imports until classic behavior and Divinity editability are verified.",
      opcode: code,
      rawCode,
      id: numberValue(action.id),
      settingsRow: null,
      recordKind,
      row: numberValue(trigger.recordIndex),
      slot: numberValue(action.slot),
      triggerId: trigger.id ?? "",
      ed3Classification,
      rootType,
      crosswalkStatus: "manual-source-discrepancy",
      sourceDisposition: "manual-source-disagreement"
    };
  }
  if (NOT_USED_OPCODES.has(code)) {
    return {
      kind: "inert-imported-action",
      severity: "info",
      label: "Inert imported action",
      detail: "Documented Not Used opcode. Keep the stored value for compatibility, but do not count it as authoring support that Providence needs to expose.",
      opcode: code,
      rawCode,
      id: numberValue(action.id),
      settingsRow: null,
      recordKind,
      row: numberValue(trigger.recordIndex),
      slot: numberValue(action.slot),
      triggerId: trigger.id ?? "",
      ed3Classification,
      rootType,
      crosswalkStatus: "not-used-no-dispatch",
      sourceDisposition: "not-used-preserve-only"
    };
  }
  if (!entry) {
    const residue = trigger.source === "Data ED3" && ["runtime-mutation-candidate", "needs-runtime-trace", "probable-editor-padding", "unknown"].includes(ed3Classification ?? "");
    return {
      kind: residue ? "needs-runtime-trace" : "unknown-opcode",
      severity: residue ? "info" : "warning",
      label: residue ? "Needs runtime trace" : "Unknown opcode",
      detail: residue
        ? "Unknown/out-of-range code appears in unlinked or runtime-residue ED3 data; keep collapsed behind diagnostics unless runtime evidence proves it callable."
        : "No opcode crosswalk entry exists for this action. Investigate before treating it as authorable.",
      opcode: code,
      rawCode,
      id: numberValue(action.id),
      settingsRow: null,
      recordKind,
      row: numberValue(trigger.recordIndex),
      slot: numberValue(action.slot),
      triggerId: trigger.id ?? "",
      ed3Classification,
      rootType,
      crosswalkStatus: "truly-unknown",
      sourceDisposition: residue ? "residue-not-authoring-backlog" : "unknown"
    };
  }
  return null;
}

function groupFindings(findings) {
  const map = new Map();
  for (const finding of findings) {
    const key = `${finding.kind}:${finding.opcode}`;
    const group = map.get(key) ?? {
      kind: finding.kind,
      severity: finding.severity,
      opcode: finding.opcode,
      label: finding.label,
      detail: finding.detail,
      crosswalkStatus: finding.crosswalkStatus,
      sourceDisposition: finding.sourceDisposition,
      count: 0,
      scenarios: new Set(),
      examples: []
    };
    group.count += 1;
    group.scenarios.add(finding.scenario);
    if (group.examples.length < 20) group.examples.push(finding);
    map.set(key, group);
  }
  return [...map.values()]
    .map((group) => ({ ...group, scenarios: [...group.scenarios].sort() }))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.opcode - b.opcode || a.kind.localeCompare(b.kind));
}

function summarize(groups) {
  const counts = {};
  for (const group of groups) counts[group.kind] = (counts[group.kind] ?? 0) + group.count;
  return counts;
}

function renderMarkdown(report) {
  const lines = [
    "# AP Action Gaps",
    "",
    "Generated from deduped Providence project imports. This report separates true authoring backlog from inert imported rows, macro-only imports, and runtime-residue noise.",
    "",
    `Scan scope: ${report.scanScope}`,
    `Projects scanned: ${report.projectCount}`,
    `Authoring-relevant findings: ${report.authoringRelevantCount}`,
    "",
    "## Summary",
    ""
  ];
  for (const [kind, count] of Object.entries(report.summary).sort()) lines.push(`- ${kind}: ${count}`);
  if (!Object.keys(report.summary).length) lines.push("- no non-authorable action gaps found");
  const detailedGroups = report.groups.filter((group) => !NON_BACKLOG_KINDS.has(group.kind));
  const nonBacklogGroups = report.groups.filter((group) => NON_BACKLOG_KINDS.has(group.kind) && group.kind !== "needs-runtime-trace");
  const traceGroups = report.groups.filter((group) => group.kind === "needs-runtime-trace");
  lines.push("", "## Authoring-Relevant Groups", "");
  if (!detailedGroups.length) lines.push("- none", "");
  for (const group of detailedGroups) {
    lines.push(`### Opcode ${group.opcode}: ${group.label}`, "");
    lines.push(`- kind: ${group.kind}`);
    lines.push(`- severity: ${group.severity}`);
    lines.push(`- occurrences: ${group.count}`);
    lines.push(`- scenarios: ${group.scenarios.join(", ") || "none"}`);
    lines.push(`- disposition: ${group.sourceDisposition}`);
    lines.push(`- detail: ${group.detail}`);
    lines.push("", "| Scenario | Record | Row | Slot | ID / Settings | ED3 classification | Trigger |");
    lines.push("| --- | --- | ---: | ---: | --- | --- | --- |");
    for (const example of group.examples) {
      lines.push(`| ${escapeCell(example.scenario)} | ${escapeCell(example.recordKind)} | ${example.row} | ${example.slot} | ${example.id}${example.settingsRow != null ? ` / ${example.settingsRow}` : ""} | ${example.ed3Classification ?? ""} | ${escapeCell(example.triggerId)} |`);
    }
    lines.push("");
  }
  if (nonBacklogGroups.length) {
    lines.push("## Preserved But Not Authoring Backlog", "");
    for (const group of nonBacklogGroups) {
      lines.push(`- Opcode ${group.opcode}: ${group.label} (${group.count} occurrence(s), ${group.scenarios.join(", ") || "no scenario"})`);
      lines.push(`  ${group.detail}`);
    }
    lines.push("");
  }
  if (traceGroups.length) {
    const total = traceGroups.reduce((sum, group) => sum + group.count, 0);
    lines.push("## Collapsed Runtime-Trace Residue", "");
    lines.push(`${total} unknown/out-of-range ED3 occurrence(s) are preserved as runtime-trace diagnostics rather than authoring backlog. Full examples remain in the JSON report.`, "");
    lines.push("| Opcode | Occurrences | Scenarios |");
    lines.push("| ---: | ---: | --- |");
    for (const group of traceGroups.slice(0, 80)) {
      lines.push(`| ${group.opcode} | ${group.count} | ${escapeCell(group.scenarios.join(", "))} |`);
    }
    if (traceGroups.length > 80) lines.push(`| ... | ${traceGroups.slice(80).reduce((sum, group) => sum + group.count, 0)} | ${traceGroups.length - 80} additional opcode group(s); see JSON |`);
    lines.push("");
  }
  lines.push("## Projects", "");
  for (const project of report.projectsScanned) lines.push(`- ${project.scenario}: ${project.findingCount} finding(s) (${project.projectPath})`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function recordKindFor(trigger) {
  if (trigger.source === "Data ED3") return "Extra Action Point";
  if (trigger.source === "Data DD") return "Land Action Point";
  if (trigger.source === "Data DDD") return "Dungeon Action Point";
  return trigger.source ?? "Action Point";
}

function isCombatMacroContext(recordKind, rootType) {
  const text = `${recordKind} ${rootType ?? ""}`.toLowerCase();
  return text.includes("battle") || text.includes("monster");
}

function scenarioName(project, file) {
  return project.scenario?.name || path.basename(path.dirname(file));
}

function normalizeOpcode(value) {
  const code = Math.trunc(Math.abs(numberValue(value)));
  if (value < 0 && value !== -14 && value !== -23) return code;
  return numberValue(value);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function severityRank(severity) {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  if (severity === "info") return 1;
  return 0;
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(key, true);
    } else {
      index += 1;
      parsed.set(key, ["project", "root"].includes(key) ? next.split(",").filter(Boolean) : next);
    }
  }
  return parsed;
}

function stringArg(parsed, key) {
  const value = parsed.get(key);
  if (Array.isArray(value)) return value[0];
  if (typeof value === "string") return value;
  return "";
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}
