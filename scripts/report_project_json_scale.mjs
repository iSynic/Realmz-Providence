import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const projects = splitProjects(args.get("project"));
const top = Number(args.get("top") ?? 12);

if (projects.length === 0) {
  console.error("Usage: node scripts/report_project_json_scale.mjs --project <project.json>[,<project.json>] [--top 12]");
  process.exit(1);
}

for (const projectPath of projects) {
  reportProject(projectPath, top);
}

function reportProject(projectPath, topCount) {
  const fullPath = path.resolve(projectPath);
  const text = fs.readFileSync(fullPath, "utf8");
  const project = JSON.parse(text);
  const minified = JSON.stringify(project);
  const prettyBytes = Buffer.byteLength(text, "utf8");
  const minifiedBytes = Buffer.byteLength(minified, "utf8");
  console.log(`\n${fullPath}`);
  console.log(`pretty ${formatBytes(prettyBytes)} | minified ${formatBytes(minifiedBytes)} | formatting ${formatBytes(prettyBytes - minifiedBytes)}`);

  const topLevel = Object.entries(project)
    .map(([key, value]) => ({ key, bytes: byteSize(value) }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, topCount);
  console.log("Top-level owners:");
  for (const row of topLevel) {
    console.log(`  ${row.key.padEnd(24)} ${formatBytes(row.bytes)}`);
  }

  const aggregate = aggregateHotFields(project);
  console.log("Repeated hot fields:");
  for (const [key, row] of [...aggregate.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, topCount)) {
    console.log(`  ${formatBytes(row.bytes)} x${row.count} ${key}`);
  }
}

function aggregateHotFields(project) {
  const aggregate = new Map();
  const tracked = new Set([
    "provenance",
    "rawBytes",
    "grid",
    "tiles",
    "values",
    "underneath",
    "spare2",
    "previewPath",
    "imagePath",
    "resourceBase64",
    "sourceBaseResourceBase64",
    "sourcePairedResourceBase64",
    "semanticSchema",
    "assetCatalog",
    "validation"
  ]);
  visit(project);
  return aggregate;

  function visit(value) {
    if (value == null || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (tracked.has(key)) add(`field:${key}`, byteSize(child));
      if (key === "previewPath" && typeof child === "string" && child.startsWith("data:")) {
        add("field:data-url-preview", byteSize(child));
      }
      visit(child);
    }
  }

  function add(key, bytes) {
    const row = aggregate.get(key) ?? { bytes: 0, count: 0 };
    row.bytes += bytes;
    row.count += 1;
    aggregate.set(key, row);
  }
}

function byteSize(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function parseArgs(argv) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq >= 0) {
      result.set(arg.slice(2, eq), arg.slice(eq + 1));
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result.set(key, next);
      index += 1;
    } else {
      result.set(key, "true");
    }
  }
  return result;
}

function splitProjects(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
