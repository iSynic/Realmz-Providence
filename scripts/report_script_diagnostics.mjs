import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.get("out") || path.join(root, "docs", "generated"));
const projectFiles = args.get("self-test") != null ? [writeSyntheticProject()] : args.get("project") ?? [];

if (!projectFiles.length) {
  fail("Usage: npm run archaeology:script-diagnostics -- --project <project.json>[,<project.json>] [--out docs/generated]");
}

const crosswalk = readJson(path.join(root, "src", "editor", "generated", "opcodeEdcdCrosswalk.json"));
const reports = projectFiles.map((file) => buildProjectReport(path.resolve(file), crosswalk));
const report = {
  schemaVersion: 1,
  generatedAt: null,
  projectCount: reports.length,
  projects: reports
};

fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "script-diagnostics-report.json");
const mdPath = path.join(outputDir, "script-diagnostics-report.md");
writeJson(jsonPath, report);
fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");

if (args.get("self-test") != null) runSelfTest(report);

console.log(JSON.stringify({
  ok: true,
  projectCount: report.projectCount,
  jsonPath,
  mdPath
}, null, 2));

function buildProjectReport(file, crosswalk) {
  const project = readJson(file);
  const rows = (project.triggers ?? [])
    .filter((trigger) => trigger.source === "Data ED3")
    .map((trigger) => ed3ReportRow(project, trigger));
  const counts = {};
  for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  const riskyRows = rows.filter((row) => row.linterSeverity === "warning");
  return {
    projectName: project.scenario?.name ?? path.basename(path.dirname(file)),
    projectPath: file,
    counts,
    riskyRows,
    rows,
    suspiciousEdcdReferences: suspiciousEdcdReferences(project, crosswalk)
  };
}

function ed3ReportRow(project, trigger) {
  const row = (project.semanticSchema?.decoding?.ed3Reachability ?? []).find((candidate) => candidate.recordIndex === trigger.recordIndex);
  const actionCount = row?.actionCount ?? (trigger.actions ?? []).filter((action) => action.rawCode !== 0 || action.id !== 0).length;
  const rawSignature = row?.rawSignature ?? (trigger.actions ?? [])
    .filter((action) => action.rawCode !== 0 || action.id !== 0)
    .flatMap((action) => [action.rawCode, action.id])
    .slice(0, 16);
  const classification = row?.reachable ? "source-backed" : row?.classification ?? "unknown";
  const meta = classificationMetadata(classification, row?.rootType);
  return {
    recordIndex: trigger.recordIndex,
    label: meta.label,
    classification,
    reachable: Boolean(row?.reachable),
    rootType: row?.rootType ?? null,
    incomingRefs: row?.incomingRefs ?? 0,
    actionCount,
    rawSignature,
    evidence: row?.evidence ?? [],
    promotionRule: row?.promotionRule ?? "No ED3 reachability row was generated for this record.",
    detail: meta.detail(actionCount),
    linterSeverity: meta.linterSeverity
  };
}

function suspiciousEdcdReferences(project, crosswalk) {
  const rows = new Map((project.extracodes ?? []).map((row) => [row.id, row]));
  const out = [];
  for (const trigger of project.triggers ?? []) {
    for (const action of trigger.actions ?? []) {
      const opcode = Math.abs(Number(action.rawCode ?? 0));
      const entry = crosswalk.entries?.[String(opcode)];
      if (!entry?.edcdBacked) continue;
      const rowId = Math.max(0, Number(action.id ?? 0));
      const row = rows.get(rowId);
      if (!row || !Array.isArray(row.values) || row.values.length !== 5) {
        out.push({
          triggerId: trigger.id,
          source: trigger.source,
          recordIndex: trigger.recordIndex,
          slot: action.slot,
          opcode,
          rowId,
          issue: row ? "malformed-edcd-row" : "missing-edcd-row"
        });
      }
    }
  }
  return out;
}

function classificationMetadata(classification, rootType) {
  if (classification === "source-backed") {
    return {
      label: rootTypeLabel(rootType),
      linterSeverity: null,
      detail: (count) => `Source-backed call path found; ${count} occupied step${count === 1 ? "" : "s"}.`
    };
  }
  if (classification === "probable-editor-padding") {
    return {
      label: "Likely empty padding",
      linterSeverity: null,
      detail: () => "No occupied steps and no source-backed caller."
    };
  }
  if (classification === "runtime-mutation-candidate") {
    return {
      label: "Runtime Residue",
      linterSeverity: "warning",
      detail: () => "Contains action-state mutation opcodes but no source-backed caller."
    };
  }
  if (classification === "orphan-authored-content") {
    return {
      label: "Orphan Extra Action",
      linterSeverity: "warning",
      detail: () => "Has authored-looking content but no known caller."
    };
  }
  if (classification === "needs-runtime-trace") {
    return {
      label: "Needs Runtime Trace",
      linterSeverity: "warning",
      detail: () => "Multiple occupied steps but no source-backed caller."
    };
  }
  return {
    label: "Unclassified Extra Action",
    linterSeverity: "warning",
    detail: () => "No ED3 classification was available."
  };
}

function rootTypeLabel(rootType) {
  const value = rootType ?? "";
  if (value.includes("global")) return "Source-backed global event";
  if (value.includes("random")) return "Source-backed random encounter action";
  if (value.includes("time")) return "Source-backed timed encounter action";
  if (value.includes("battle")) return "Source-backed battle action";
  if (value.includes("monster")) return "Source-backed monster action";
  if (value.includes("item")) return "Source-backed item action";
  if (value.includes("recursive")) return "Source-backed recursive macro";
  return "Source-backed Extra Action Point";
}

function renderMarkdown(report) {
  const lines = ["# Script Diagnostics Report", "", `Projects: ${report.projectCount}`, ""];
  for (const project of report.projects) {
    lines.push(`## ${project.projectName}`, "", `Path: \`${project.projectPath}\``, "");
    lines.push("### ED3 Counts", "");
    for (const [classification, count] of Object.entries(project.counts).sort()) {
      lines.push(`- ${classification}: ${count}`);
    }
    lines.push("", "### Risky ED3 Rows", "");
    if (project.riskyRows.length === 0) {
      lines.push("- none");
    } else {
      for (const row of project.riskyRows) {
        lines.push(`- row ${row.recordIndex}: ${row.label}; ${row.actionCount} occupied step(s); refs ${row.incomingRefs}; signature ${row.rawSignature.join(", ") || "empty"}`);
      }
    }
    lines.push("", "### Suspicious EDCD References", "");
    if (project.suspiciousEdcdReferences.length === 0) {
      lines.push("- none");
    } else {
      for (const row of project.suspiciousEdcdReferences) {
        lines.push(`- ${row.triggerId} slot ${row.slot}: opcode ${row.opcode}, EDCD row ${row.rowId}, ${row.issue}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function writeSyntheticProject() {
  const dir = path.join(root, "tmp", "script-diagnostics-self-test");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "project.json");
  const project = {
    scenario: { name: "Script Diagnostics Self Test" },
    triggers: [
      ed3Trigger(0, []),
      ed3Trigger(1, [{ slot: 0, rawCode: 1, id: 2 }]),
      ed3Trigger(2, [{ slot: 0, rawCode: 1, id: 5 }]),
      ed3Trigger(3, [{ slot: 0, rawCode: 1, id: 5 }, { slot: 1, rawCode: 1, id: 7 }]),
      ed3Trigger(4, [{ slot: 0, rawCode: 1, id: 5 }]),
      { id: "trigger:land:0:0", source: "Data DD", recordIndex: 0, actions: [{ slot: 0, rawCode: 40, id: 99 }] }
    ],
    extracodes: [{ id: 1, values: [0, 0, 0, 0, 0] }],
    semanticSchema: {
      decoding: {
        ed3Reachability: [
          row(0, "probable-editor-padding", false, 0, []),
          row(1, "runtime-mutation-candidate", false, 1, [13, 2]),
          row(2, "orphan-authored-content", false, 1, [1, 5]),
          row(3, "needs-runtime-trace", false, 2, [1, 5, 2, 7]),
          { ...row(4, "source-backed", true, 1, [1, 5]), rootType: "global-hook", incomingRefs: 1 }
        ]
      }
    }
  };
  writeJson(file, project);
  return file;
}

function ed3Trigger(recordIndex, actions) {
  return { id: `Data ED3:macro:${recordIndex}`, source: "Data ED3", recordIndex, actions };
}

function row(recordIndex, classification, reachable, actionCount, rawSignature) {
  return {
    recordIndex,
    entityId: `macro:${recordIndex}`,
    classification,
    reachable,
    pathStatus: reachable ? "source-backed" : "not-source-reachable",
    rootType: null,
    incomingRefs: 0,
    actionCount,
    rawSignature,
    evidence: [],
    promotionRule: reachable ? "Promoted from Data ED3 because a source-backed root reaches this record." : "Preserved as Data ED3 evidence until source-backed reachability or explicit authoring exists."
  };
}

function runSelfTest(report) {
  const project = report.projects[0];
  const expected = {
    "probable-editor-padding": 1,
    "runtime-mutation-candidate": 1,
    "orphan-authored-content": 1,
    "needs-runtime-trace": 1,
    "source-backed": 1
  };
  for (const [key, value] of Object.entries(expected)) {
    if (project.counts[key] !== value) fail(`self-test expected ${key} count ${value}, got ${project.counts[key]}`);
  }
  if (project.riskyRows.length !== 3) fail(`self-test expected 3 risky rows, got ${project.riskyRows.length}`);
  if (project.suspiciousEdcdReferences.length !== 1) fail(`self-test expected 1 suspicious EDCD reference, got ${project.suspiciousEdcdReferences.length}`);
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const [key, inline] = arg.slice(2).split("=", 2);
    const value = inline ?? (argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "");
    parsed.set(key, value);
  }
  if (parsed.has("project")) {
    parsed.set("project", String(parsed.get("project")).split(/[;,]/).map((entry) => entry.trim()).filter(Boolean));
  }
  return parsed;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
