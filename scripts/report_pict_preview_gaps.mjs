import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PICT_30121_FAMILY_IDS = new Set(
  Array.from({ length: 17 }, (_, index) => 30120 + index)
);

const DEFAULT_CORPUS = [
  {
    label: "Wrath of the Mind Lords",
    focusIds: [30121],
    candidates: [
      "tmp/pict-corpus/Wrath of the Mind Lords.providence/project.json",
      "tmp/desktop-ui-harness/wrath-assets-release-011/WrathAssets.providence/project.json",
      "tmp/oracle-runs/corpus-matrix-20260521-123640-full/Wrath-of-the-Mind-Lords/project/Wrath of the Mind Lords.providence/project.json"
    ]
  },
  {
    label: "City of Bywater",
    focusIds: [32128],
    candidates: [
      "tmp/pict-corpus/City of Bywater.providence/project.json",
      "tmp/oracle-runs/corpus-matrix-20260521-123640-full/City-of-Bywater/project/City of Bywater.providence/project.json",
      "tmp/asset-triage/BywaterBase.providence/project.json"
    ]
  }
];

const options = parseArgs(process.argv.slice(2));
const projectInputs = options.projectPaths.length > 0
  ? options.projectPaths.map((projectPath) => ({
      label: null,
      path: path.resolve(projectPath),
      configuredCandidates: [projectPath],
      focusIds: []
    }))
  : discoverDefaultCorpusProjects();

const rows = [];
const projectSummaries = [];

for (const input of projectInputs) {
  if (!input.path || !fs.existsSync(input.path)) {
    projectSummaries.push({
      label: input.label ?? "Missing project",
      configuredCandidates: input.configuredCandidates ?? [],
      project: input.path ? relativePath(input.path) : null,
      available: false,
      reason: "No local imported Providence project was found for this corpus scenario."
    });
    continue;
  }

  const project = readJson(input.path);
  const before = rows.length;
  const label = input.label ?? projectLabel(project, input.path);
  collectProjectPictures(project, input.path, rows, label);
  projectSummaries.push(
    summarizeProject({
      label,
      project,
      projectPath: input.path,
      rows: rows.slice(before),
      focusIds: input.focusIds ?? []
    })
  );
}

collectDivinityManualPicts(rows);

const grouped = groupRows(rows);
const report = {
  generatedBy: "scripts/report_pict_preview_gaps.mjs",
  projects: projectInputs.map((input) => input.path ? relativePath(input.path) : null).filter(Boolean),
  totals: {
    resources: rows.length,
    groups: grouped.length,
    attention: rows.filter((row) => row.status !== "preview-ready").length
  },
  projectSummaries,
  groups: grouped
};

if (options.check) {
  validateReport(report);
  if (!options.outPath) {
    console.log("PICT codec corpus check passed.");
    process.exit(0);
  }
}

const output = options.outPath?.toLowerCase().endsWith(".md")
  ? renderMarkdown(report)
  : `${JSON.stringify(report, null, 2)}\n`;

if (options.outPath) {
  fs.mkdirSync(path.dirname(options.outPath), { recursive: true });
  fs.writeFileSync(options.outPath, output);
  console.log(`Wrote ${relativePath(options.outPath)}`);
} else {
  process.stdout.write(output);
}

function parseArgs(args) {
  const parsed = {
    outPath: null,
    check: false,
    projectPaths: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--out") {
      const value = args[index + 1];
      if (!value) throw new Error("--out requires a file path");
      parsed.outPath = path.resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--check") {
      parsed.check = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    parsed.projectPaths.push(arg);
  }

  return parsed;
}

function discoverDefaultCorpusProjects() {
  return DEFAULT_CORPUS.map((entry) => {
    const candidates = entry.candidates.map((candidate) => path.resolve(repoRoot, candidate));
    const projectPath = candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0] ?? null;
    return {
      label: entry.label,
      path: projectPath,
      configuredCandidates: entry.candidates,
      focusIds: entry.focusIds
    };
  });
}

function collectProjectPictures(project, sourcePath, outputRows, label) {
  const projectRoot = path.dirname(sourcePath);
  const catalogRows = [];
  for (const picture of project?.assetCatalog?.pictures ?? []) {
    if (!isPictRecord(picture)) continue;
    catalogRows.push(rowFromCatalogEntry({
      scope: "scenario",
      scenario: label,
      source: picture.source ?? label,
      resourceType: picture.resourceType ?? "PICT",
      resourceId: picture.resourceId,
      label: picture.name ?? picture.label ?? `PICT ${picture.resourceId}`,
      previewPath: picture.previewPath ?? picture.imagePath ?? null,
      diagnostics: picture.diagnostics ?? picture.previewDiagnostics ?? [],
      projectRoot
    }));
  }
  for (const tileset of project?.assetCatalog?.tilesets ?? []) {
    if (tileset.pictId == null) continue;
    catalogRows.push(rowFromCatalogEntry({
      scope: "scenario-tileset",
      scenario: label,
      source: tileset.source ?? label,
      resourceType: "PICT",
      resourceId: tileset.pictId,
      label: tileset.name ?? `PICT ${tileset.pictId}`,
      previewPath: tileset.imagePath ?? tileset.previewPath ?? null,
      diagnostics: tileset.diagnostics ?? tileset.previewDiagnostics ?? [],
      status: tileset.available === false ? "missing-fallback" : undefined,
      projectRoot
    }));
  }
  outputRows.push(...catalogRows);
  const readyCatalogIds = new Set(
    catalogRows
      .filter((row) => row.status === "preview-ready" && row.resourceId != null)
      .map((row) => `${row.resourceType}:${row.resourceId}`)
  );
  for (const entity of project?.semanticSchema?.entities ?? []) {
    const summary = entity?.summary ?? {};
    const resourceType = summary.resourceType ?? summary.type;
    if (String(resourceType ?? "").trim() !== "PICT") continue;
    const resourceId = summary.resourceId ?? summary.id;
    if (resourceId == null) continue;
    if (readyCatalogIds.has(`PICT:${Number(resourceId)}`)) continue;
    outputRows.push(rowFromCatalogEntry({
      scope: "semantic-resource",
      scenario: label,
      source: entity.source ?? label,
      resourceType: "PICT",
      resourceId,
      label: entity.label ?? `PICT ${resourceId}`.trim(),
      previewPath: summary.previewPath ?? summary.previewDataUrl ?? null,
      diagnostics: summary.previewDiagnostics ?? summary.diagnostics ?? [],
      status: normalizeSummaryStatus(summary),
      projectRoot,
      rawBytes: Number.isFinite(Number(summary.bytes)) ? Number(summary.bytes) : null,
      sha256: typeof summary.sha256 === "string" ? summary.sha256 : null
    }));
  }
}

function collectDivinityManualPicts(outputRows) {
  const assetsDir = path.join(repoRoot, "public", "divinity-manual", "assets");
  if (!fs.existsSync(assetsDir)) return;
  for (const entry of fs.readdirSync(assetsDir).filter((name) => name.toLowerCase().endsWith(".pict")).sort()) {
    const base = entry.slice(0, -".pict".length);
    const pngPath = path.join(assetsDir, `${base}.png`);
    const svgPath = path.join(assetsDir, `${base}.svg`);
    const idMatch = base.match(/(\d+)/);
    const hasPreview = fs.existsSync(pngPath) || fs.existsSync(svgPath);
    const previewPath = hasPreview
      ? relativePath(fs.existsSync(pngPath) ? pngPath : svgPath)
      : null;
    outputRows.push({
      scope: "divinity-manual",
      scenario: "Divinity manual",
      source: "public/divinity-manual/assets",
      sourceFamily: "divinity-manual",
      resourceType: "PICT",
      resourceId: idMatch ? Number(idMatch[1]) : null,
      label: base,
      status: hasPreview ? "preview-ready" : "missing-fallback",
      diagnostic: hasPreview ? "manual-preview-present" : "manual-preview-missing",
      opcodeFamily: "not-applicable",
      previewPath,
      dimensions: previewPath?.toLowerCase().endsWith(".png") ? pngDimensions(path.join(repoRoot, previewPath)) : null,
      classification: hasPreview ? "manual reference preview present" : "manual reference preview missing"
    });
  }
}

function rowFromCatalogEntry(entry) {
  const diagnostics = Array.isArray(entry.diagnostics) ? entry.diagnostics : [];
  const firstDiagnostic = diagnostics[0];
  const previewPath = entry.previewPath ?? builtInReferencePictPreviewPath(entry.resourceId);
  const previewReady = previewPath ? previewExists(entry.projectRoot, previewPath) : false;
  const status = entry.status
    ?? (previewReady || hasBuiltInReferencePict(entry.resourceId)
      ? "preview-ready"
      : normalizeRawInventoryStatus(entry, firstDiagnostic));
  const diagnostic = diagnosticKey(firstDiagnostic, status);
  const row = {
    scope: entry.scope,
    scenario: entry.scenario,
    source: entry.source,
    sourceFamily: sourceFamily(entry.source, entry.scope),
    resourceType: entry.resourceType,
    resourceId: Number.isFinite(Number(entry.resourceId)) ? Number(entry.resourceId) : null,
    label: entry.label,
    status,
    diagnostic,
    opcodeFamily: opcodeFamily(diagnostic),
    previewPath,
    dimensions: previewReady ? previewDimensions(entry.projectRoot, previewPath) : null,
    rawBytes: entry.rawBytes ?? null,
    sha256: entry.sha256 ?? null
  };
  return {
    ...row,
    classification: classifyPicture(row)
  };
}

function summarizeProject({ label, project, projectPath, rows: projectRows, focusIds }) {
  const pictureRows = projectRows.filter((row) => row.scope !== "scenario-tileset");
  const sourceSnapshot = (project.source?.files ?? []).find((file) =>
    file.name === "Scenario.rsrc" || file.relativePath === "Scenario.rsrc"
  );
  const focusSet = new Set(focusIds);
  const focusRows = pictureRows.filter((row) =>
    focusSet.has(row.resourceId) || (label.includes("Wrath") && PICT_30121_FAMILY_IDS.has(row.resourceId))
  );
  const statusCounts = countBy(projectRows, (row) => row.status);
  return {
    label,
    project: relativePath(projectPath),
    available: true,
    pictureRows: pictureRows.length,
    tilesetRows: projectRows.length - pictureRows.length,
    previewReady: projectRows.filter((row) => row.status === "preview-ready").length,
    attention: projectRows.filter((row) => row.status !== "preview-ready").length,
    statusCounts,
    pictureIds: pictureRows.map((row) => row.resourceId).filter((id) => id != null).sort((a, b) => a - b),
    focusRows: focusRows.map((row) => ({
      resourceId: row.resourceId,
      status: row.status,
      diagnostic: row.diagnostic,
      dimensions: row.dimensions,
      classification: row.classification,
      previewPath: row.previewPath
    })),
    sourceSnapshot: sourceSnapshot ? {
      relativePath: sourceSnapshot.relativePath ?? sourceSnapshot.name,
      bytes: sourceSnapshot.bytes ?? null,
      sha256: sourceSnapshot.sha256 ?? null,
      editable: sourceSnapshot.editable ?? null,
      role: sourceSnapshot.role ?? null
    } : null
  };
}

function hasBuiltInReferencePict(resourceId) {
  return builtInReferencePictPreviewPath(resourceId) !== null;
}

function builtInReferencePictPreviewPath(resourceId) {
  const id = Number(resourceId);
  if (!Number.isFinite(id)) return null;
  const atlasPaths = {
    300: "reference://realmz/pict/300",
    302: "reference://realmz/pict/302",
    303: "reference://realmz/pict/303",
    304: "reference://realmz/pict/304",
    305: "reference://realmz/pict/305",
    309: "reference://realmz/pict/309",
    310: "reference://realmz/pict/310"
  };
  return atlasPaths[id] ?? null;
}

function isPictRecord(entry) {
  return String(entry?.resourceType ?? entry?.type ?? "").trim() === "PICT";
}

function normalizeSummaryStatus(summary) {
  const raw = String(summary.previewStatus ?? summary.status ?? "").toLowerCase();
  if (raw === "ready") return "preview-ready";
  if (raw === "missing") return "missing-fallback";
  if (raw === "malformed") return "malformed";
  if (raw === "unsupported" || raw === "unsupported-variant") return "unsupported-variant";
  if (summary.sha256 || summary.bytes) return "inventory-only";
  return undefined;
}

function normalizeRawInventoryStatus(entry, diagnostic) {
  if (entry.sha256 || entry.rawBytes) return "inventory-only";
  return diagnosticStatus(diagnostic);
}

function diagnosticStatus(diagnostic) {
  if (!diagnostic) return "missing-fallback";
  const text = typeof diagnostic === "string" ? diagnostic : `${diagnostic.code ?? ""} ${diagnostic.message ?? ""}`.toLowerCase();
  if (text.includes("malformed")) return "malformed";
  if (text.includes("unsupported")) return "unsupported-variant";
  return "missing-fallback";
}

function diagnosticKey(diagnostic, status) {
  if (!diagnostic) return status === "inventory-only" ? "raw-resource-inventory-without-materialized-preview" : status;
  if (typeof diagnostic === "string") return diagnostic;
  return [diagnostic.code, diagnostic.opcode, diagnostic.variant, diagnostic.message].filter(Boolean).join(" | ") || status;
}

function sourceFamily(source, scope) {
  const text = `${source ?? ""} ${scope ?? ""}`.toLowerCase();
  if (text.includes("scenario resource fork") || text.includes("scenario.rsrc")) return "scenario-resource-fork";
  if (text.includes("realmz reference") || text.includes("shared resources")) return "realmz-reference-resource";
  if (text.includes("divinity-manual")) return "divinity-manual";
  if (scope === "scenario-tileset") return "tileset-asset";
  if (scope === "semantic-resource") return "semantic-inventory";
  return "project-catalog";
}

function opcodeFamily(diagnostic) {
  const text = String(diagnostic ?? "");
  const hex = text.match(/0x([0-9a-f]{2,4})/i);
  if (hex) return `opcode 0x${hex[1].toUpperCase().padStart(4, "0")}`;
  if (/directbits/i.test(text)) return "DirectBits";
  if (/packbits/i.test(text)) return "PackBits";
  if (/bitsrect|bitsrgn/i.test(text)) return "BitsRect/BitsRgn";
  if (/bitmap drawing command|drawing opcode/i.test(text)) return "non-bitmap QuickDraw opcode";
  if (/manual-preview|preview-ready|inventory-only|missing-fallback/i.test(text)) return "not-applicable";
  return "unknown";
}

function classifyPicture(row) {
  if (row.status === "preview-ready") {
    if (row.resourceId === 30121 || PICT_30121_FAMILY_IDS.has(row.resourceId)) {
      return "preview-ready; no decoder failure reproduced in the current corpus. If the image content still looks questionable, current evidence points to source/authored image content rather than a Providence opcode bug.";
    }
    return "preview-ready";
  }
  if (row.status === "inventory-only") {
    return "raw resource inventoried and preserved, but this imported project did not materialize a preview path; re-import with the current desktop importer before treating it as a codec failure.";
  }
  if (row.status === "unsupported-variant") {
    return "diagnostic-only unsupported QuickDraw variant unless it blocks known scenario content.";
  }
  if (row.status === "malformed") {
    return "malformed/source-corrupt candidate; compare against original PICT bytes before changing the decoder.";
  }
  return "preview missing or unresolved";
}

function previewExists(projectRoot, previewPath) {
  if (!previewPath) return false;
  if (previewPath.startsWith("reference://") || previewPath.startsWith("data:")) return true;
  return fs.existsSync(path.resolve(projectRoot ?? repoRoot, previewPath));
}

function previewDimensions(projectRoot, previewPath) {
  if (!previewPath || previewPath.startsWith("reference://") || previewPath.startsWith("data:")) return null;
  return pngDimensions(path.resolve(projectRoot ?? repoRoot, previewPath));
}

function pngDimensions(filePath) {
  if (!filePath?.toLowerCase().endsWith(".png") || !fs.existsSync(filePath)) return null;
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 24) return null;
  const signature = bytes.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

function groupRows(inputRows) {
  const groups = new Map();
  for (const row of inputRows) {
    const key = `${row.status}\n${row.sourceFamily}\n${row.opcodeFamily}\n${row.diagnostic}`;
    if (!groups.has(key)) {
      groups.set(key, {
        status: row.status,
        sourceFamily: row.sourceFamily,
        opcodeFamily: row.opcodeFamily,
        diagnostic: row.diagnostic,
        count: 0,
        resources: []
      });
    }
    const group = groups.get(key);
    group.count += 1;
    group.resources.push(row);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      resources: group.resources
        .sort((a, b) =>
          String(a.scenario).localeCompare(String(b.scenario))
          || (a.resourceId ?? Number.MAX_SAFE_INTEGER) - (b.resourceId ?? Number.MAX_SAFE_INTEGER)
          || a.label.localeCompare(b.label)
        )
        .slice(0, 40)
    }))
    .sort((a, b) =>
      a.status.localeCompare(b.status)
      || a.sourceFamily.localeCompare(b.sourceFamily)
      || a.opcodeFamily.localeCompare(b.opcodeFamily)
      || b.count - a.count
    );
}

function renderMarkdown(report) {
  const lines = [
    "# PICT Codec Corpus Report",
    "",
    `- Projects scanned: ${report.projects.length > 0 ? report.projects.join(", ") : "none supplied/found"}`,
    `- Resources scanned: ${report.totals.resources}`,
    `- Attention needed: ${report.totals.attention}`,
    "",
    "## Corpus Scenario Status",
    ""
  ];

  for (const summary of report.projectSummaries) {
    if (!summary.available) {
      lines.push(`### ${summary.label}`, "");
      lines.push(`- Status: missing local imported Providence project`);
      lines.push(`- Candidates: ${summary.configuredCandidates?.join(", ") ?? "none"}`);
      lines.push("");
      continue;
    }
    lines.push(`### ${summary.label}`, "");
    lines.push(`- Project: ${summary.project}`);
    lines.push(`- Scenario PICT rows: ${summary.pictureRows}`);
    lines.push(`- Tileset PICT rows: ${summary.tilesetRows}`);
    lines.push(`- Preview-ready rows: ${summary.previewReady}`);
    lines.push(`- Attention rows: ${summary.attention}`);
    lines.push(`- Status counts: ${formatCounts(summary.statusCounts)}`);
    if (summary.pictureIds.length > 0) {
      lines.push(`- Scenario PICT IDs: ${summary.pictureIds.join(", ")}`);
    }
    if (summary.sourceSnapshot) {
      lines.push(`- Source snapshot: ${summary.sourceSnapshot.relativePath}, ${summary.sourceSnapshot.bytes} bytes, sha256 ${summary.sourceSnapshot.sha256}`);
    }
    for (const focus of summary.focusRows) {
      const dimensions = focus.dimensions ? `, ${focus.dimensions.width} x ${focus.dimensions.height}` : "";
      lines.push(`- Focus PICT ${focus.resourceId}: ${focus.status}${dimensions}; ${focus.classification}`);
    }
    lines.push("");
  }

  lines.push(
    "## Codec Policy",
    "",
    "- Unsupported rare vector/text QuickDraw drawing remains diagnostic-only unless it blocks known scenario content.",
    "- Preview generation does not rewrite original PICT resources. Imported scenario resource forks are kept in the project source snapshot and export preservation is covered by the Rust round-trip resource tests.",
    "- PICT 30121-style rows are treated as decoder bugs only when the current importer reports malformed or unsupported bitmap data. A preview-ready row means the decoder path is not the current blocker.",
    "",
    "## Diagnostic Groups",
    ""
  );

  for (const group of report.groups) {
    lines.push(`### ${group.status} - ${group.sourceFamily} - ${group.opcodeFamily} (${group.count})`, "");
    lines.push(`Diagnostic: \`${group.diagnostic}\``, "");
    for (const row of group.resources) {
      const details = [
        row.previewPath,
        row.dimensions ? `${row.dimensions.width} x ${row.dimensions.height}` : null,
        row.classification
      ].filter(Boolean).join("; ");
      lines.push(`- ${row.scenario}: ${row.resourceType} ${row.resourceId ?? "?"}: ${row.label} (${row.source})${details ? ` - ${details}` : ""}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function validateReport(report) {
  const summariesByLabel = new Map(report.projectSummaries.map((summary) => [summary.label, summary]));
  for (const required of ["Wrath of the Mind Lords", "City of Bywater"]) {
    const summary = summariesByLabel.get(required);
    if (!summary?.available) {
      throw new Error(`PICT corpus check requires a local imported project for ${required}`);
    }
    if (summary.previewReady === 0) {
      throw new Error(`${required} has no preview-ready PICT rows`);
    }
    if (!summary.sourceSnapshot?.sha256) {
      throw new Error(`${required} does not report a preserved Scenario.rsrc source snapshot`);
    }
  }
  const wrath = summariesByLabel.get("Wrath of the Mind Lords");
  const pict30121 = wrath?.focusRows.find((row) => row.resourceId === 30121);
  if (!pict30121) throw new Error("Wrath PICT 30121 classification is missing");
  if (pict30121.status !== "preview-ready") {
    throw new Error(`Wrath PICT 30121 should be preview-ready in the current corpus, got ${pict30121.status}`);
  }
  if (!report.groups.every((group) => group.sourceFamily && group.opcodeFamily && group.diagnostic)) {
    throw new Error("Every diagnostic group must include source family, opcode family, and diagnostic");
  }
}

function countBy(items, selector) {
  return items.reduce((counts, item) => {
    const key = selector(item) ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function formatCounts(counts) {
  const entries = Object.entries(counts ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return entries.length > 0 ? entries.map(([key, value]) => `${key} ${value}`).join(", ") : "none";
}

function projectLabel(project, sourcePath) {
  return project?.scenario?.name ?? project?.metadata?.title ?? project?.name ?? path.basename(path.dirname(sourcePath));
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
