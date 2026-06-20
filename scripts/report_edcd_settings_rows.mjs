import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.get("out") || path.join(root, "docs", "generated"));
const projectFiles = args.get("self-test") != null ? [writeSyntheticProject()] : args.get("project") ?? [];

if (!projectFiles.length) {
  fail("Usage: npm run archaeology:edcd-settings -- --project <project.json>[,<project.json>] [--out docs/generated]");
}

const crosswalk = readJson(path.join(root, "src", "editor", "generated", "opcodeEdcdCrosswalk.json"));
const report = {
  schemaVersion: 1,
  generatedAt: null,
  projectCount: projectFiles.length,
  projects: projectFiles.map((file) => buildProjectReport(path.resolve(file), crosswalk))
};

fs.mkdirSync(outputDir, { recursive: true });
const jsonPath = path.join(outputDir, "edcd-settings-rows-report.json");
const mdPath = path.join(outputDir, "edcd-settings-rows-report.md");
writeJson(jsonPath, report);
fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");

if (args.get("self-test") != null) runSelfTest(report);

console.log(JSON.stringify({ ok: true, projectCount: report.projectCount, jsonPath, mdPath }, null, 2));

function buildProjectReport(file, crosswalk) {
  const project = readJson(file);
  const rowMap = new Map((project.extracodes ?? []).map((row) => [numberValue(row.id), row]));
  const usages = buildRowUsages(project, crosswalk, rowMap);
  const counts = {};
  for (const usage of usages) counts[usage.status] = (counts[usage.status] ?? 0) + 1;
  return {
    projectName: project.scenario?.name ?? path.basename(path.dirname(file)),
    projectPath: file,
    counts,
    rows: usages,
    riskyRows: usages.filter((usage) => ["missing", "shared", "conflict"].includes(usage.status))
  };
}

function buildRowUsages(project, crosswalk, rowMap) {
  const callersByRow = new Map();
  for (const trigger of project.triggers ?? []) {
    for (const action of trigger.actions ?? []) {
      const opcode = Math.abs(numberValue(action.rawCode ?? action.code));
      const entry = crosswalk.entries?.[String(opcode)];
      if (!entry?.edcdBacked) continue;
      const rowId = Math.max(0, numberValue(action.id));
      if (!callersByRow.has(rowId)) callersByRow.set(rowId, []);
      callersByRow.get(rowId).push({
        triggerId: trigger.id ?? `${trigger.source}:${trigger.recordIndex}`,
        triggerSource: trigger.source ?? "unknown",
        triggerIndex: numberValue(trigger.recordIndex),
        slot: numberValue(action.slot),
        opcode,
        action: entry.title ?? entry.shortLabel ?? `Opcode ${opcode}`,
        shape: entry.shape ?? entry.edcdShape ?? "settings-row"
      });
    }
  }

  const ids = new Set([...rowMap.keys(), ...callersByRow.keys()]);
  return [...ids].sort((a, b) => a - b).map((rowId) => {
    const row = rowMap.get(rowId) ?? null;
    const callers = callersByRow.get(rowId) ?? [];
    const shapes = [...new Set(callers.map((caller) => caller.shape).filter(Boolean))].sort();
    const status = rowStatus(row, callers, shapes);
    return {
      rowId,
      status,
      summary: rowSummary(rowId, row, callers, shapes),
      values: normalizeValues(row?.values),
      exists: Boolean(row),
      callerCount: callers.length,
      callers,
      primaryShape: shapes[0] ?? null,
      possibleShapes: shapes,
      warnings: rowWarnings(rowId, row, callers, shapes, status)
    };
  });
}

function rowStatus(row, callers, shapes) {
  if (!row && callers.length > 0) return "missing";
  if (shapes.length > 1) return "conflict";
  if (callers.length > 1) return "shared";
  if (callers.length === 0) return "unused";
  return "in-use";
}

function rowSummary(rowId, row, callers, shapes) {
  if (!row) return `Settings row ${rowId} is referenced by ${callers.length} step(s), but no row exists.`;
  if (!callers.length) return `Imported settings row ${rowId} is not currently referenced by any script step.`;
  const first = callers[0];
  const shape = shapes.length ? ` (${shapes.join(", ")})` : "";
  if (callers.length === 1) return `${first.action}${shape}, used by ${first.triggerId} slot ${first.slot}.`;
  return `${first.action}${shape}, shared by ${callers.length} script steps.`;
}

function rowWarnings(rowId, row, callers, shapes, status) {
  const warnings = [];
  if (status === "missing") warnings.push(`Create settings row ${rowId} before relying on this behavior.`);
  if (status === "shared") warnings.push("Multiple script steps use this row; duplicate it before making step-specific edits.");
  if (status === "conflict") warnings.push(`Different action shapes use this row: ${shapes.join(", ")}.`);
  if (status === "unused") warnings.push("This row is preserved imported data but is not currently used by a known caller.");
  if (row && normalizeValues(row.values).length !== 5) warnings.push("This row does not contain exactly five settings values.");
  return warnings;
}

function renderMarkdown(report) {
  const lines = ["# EDCD Settings Rows Report", "", `Projects: ${report.projectCount}`, ""];
  for (const project of report.projects) {
    lines.push(`## ${project.projectName}`, "", `Path: \`${project.projectPath}\``, "");
    lines.push("### Summary", "");
    for (const [status, count] of Object.entries(project.counts).sort()) {
      lines.push(`- ${status}: ${count}`);
    }
    lines.push("", "### Rows Needing Attention", "");
    if (!project.riskyRows.length) {
      lines.push("- none");
    } else {
      for (const row of project.riskyRows) {
        lines.push(`- row ${row.rowId}: ${row.status}; ${row.summary}`);
        for (const warning of row.warnings) lines.push(`  - ${warning}`);
      }
    }
    lines.push("", "### All Rows", "");
    for (const row of project.rows) {
      lines.push(`- row ${row.rowId}: ${row.status}; callers ${row.callerCount}; values ${row.values.join(", ")}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function writeSyntheticProject() {
  const dir = path.join(root, "tmp", "edcd-settings-self-test");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "project.json");
  writeJson(file, {
    scenario: { name: "EDCD Settings Self Test" },
    triggers: [
      trigger("trigger:ap:0", "Data DD", 0, [{ slot: 0, rawCode: 40, id: 10 }]),
      trigger("trigger:ap:1", "Data DD", 1, [{ slot: 0, rawCode: 40, id: 11 }]),
      trigger("trigger:ap:2", "Data DD", 2, [{ slot: 0, rawCode: 40, id: 11 }]),
      trigger("trigger:ap:3", "Data DD", 3, [{ slot: 0, rawCode: 40, id: 12 }])
    ],
    extracodes: [
      { id: 10, values: [1, 2, 3, 4, 5] },
      { id: 11, values: [5, 4, 3, 2, 1] },
      { id: 20, values: [0, 0, 0, 0, 0] }
    ]
  });
  return file;
}

function trigger(id, source, recordIndex, actions) {
  return { id, source, recordIndex, actions };
}

function runSelfTest(report) {
  const counts = report.projects[0].counts;
  if (counts["in-use"] !== 1) fail(`expected one in-use row, got ${counts["in-use"] ?? 0}`);
  if (counts.shared !== 1) fail(`expected one shared row, got ${counts.shared ?? 0}`);
  if (counts.missing !== 1) fail(`expected one missing row, got ${counts.missing ?? 0}`);
  if (counts.unused !== 1) fail(`expected one unused row, got ${counts.unused ?? 0}`);
}

function normalizeValues(values) {
  const out = Array.isArray(values) ? values.slice(0, 5).map(numberValue) : [];
  while (out.length < 5) out.push(0);
  return out;
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        parsed.set(key, true);
      } else {
        index += 1;
        parsed.set(key, key === "project" ? next.split(",").filter(Boolean) : next);
      }
    }
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
