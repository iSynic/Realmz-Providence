import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outPath = outIndex >= 0 ? path.resolve(args[outIndex + 1] ?? "") : null;
const projectArg = args.find((arg, index) => !arg.startsWith("--") && index !== outIndex + 1);
const projectPath = projectArg ? path.resolve(projectArg) : null;

const rows = [];

if (projectPath) {
  const project = readJson(projectPath);
  collectProjectPictures(project, projectPath, rows);
}

collectDivinityManualPicts(rows);

const grouped = groupRows(rows);
const report = {
  generatedBy: "scripts/report_pict_preview_gaps.mjs",
  project: projectPath ? path.relative(repoRoot, projectPath).replaceAll("\\", "/") : null,
  totals: {
    resources: rows.length,
    groups: grouped.length,
    attention: rows.filter((row) => row.status !== "preview-ready").length
  },
  groups: grouped
};

const output = outPath?.toLowerCase().endsWith(".md") ? renderMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`;

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output);
  console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
} else {
  process.stdout.write(output);
}

function collectProjectPictures(project, sourcePath, outputRows) {
  const projectLabel = project?.metadata?.title ?? project?.name ?? path.basename(path.dirname(sourcePath));
  const catalogRows = [];
  for (const picture of project?.assetCatalog?.pictures ?? []) {
    if (!isPictRecord(picture)) continue;
    catalogRows.push(rowFromCatalogEntry({
      scope: "scenario",
      source: picture.source ?? projectLabel,
      resourceType: picture.resourceType ?? "PICT",
      resourceId: picture.resourceId,
      label: picture.name ?? picture.label ?? `PICT ${picture.resourceId}`,
      previewPath: picture.previewPath ?? picture.imagePath ?? null,
      diagnostics: picture.diagnostics ?? picture.previewDiagnostics ?? []
    }));
  }
  for (const tileset of project?.assetCatalog?.tilesets ?? []) {
    if (tileset.pictId == null) continue;
    catalogRows.push(rowFromCatalogEntry({
      scope: "scenario-tileset",
      source: tileset.source ?? projectLabel,
      resourceType: "PICT",
      resourceId: tileset.pictId,
      label: tileset.name ?? `PICT ${tileset.pictId}`,
      previewPath: tileset.imagePath ?? tileset.previewPath ?? null,
      diagnostics: tileset.diagnostics ?? tileset.previewDiagnostics ?? [],
      status: tileset.available === false ? "missing-fallback" : undefined
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
    if (readyCatalogIds.has(`PICT:${resourceId}`)) continue;
    outputRows.push(rowFromCatalogEntry({
      scope: "semantic-resource",
      source: entity.source ?? projectLabel,
      resourceType: "PICT",
      resourceId,
      label: entity.label ?? `PICT ${resourceId}`.trim(),
      previewPath: summary.previewPath ?? summary.previewDataUrl ?? null,
      diagnostics: summary.previewDiagnostics ?? summary.diagnostics ?? [],
      status: normalizeSummaryStatus(summary)
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
    outputRows.push({
      scope: "divinity-manual",
      source: "public/divinity-manual/assets",
      resourceType: "PICT",
      resourceId: idMatch ? Number(idMatch[1]) : null,
      label: base,
      status: hasPreview ? "preview-ready" : "missing-fallback",
      diagnostic: hasPreview ? "manual-preview-present" : "manual-preview-missing",
      previewPath: hasPreview
        ? path.relative(repoRoot, fs.existsSync(pngPath) ? pngPath : svgPath).replaceAll("\\", "/")
        : null
    });
  }
}

function rowFromCatalogEntry(entry) {
  const diagnostics = Array.isArray(entry.diagnostics) ? entry.diagnostics : [];
  const firstDiagnostic = diagnostics[0];
  const status = entry.status ?? (entry.previewPath || hasBuiltInReferencePict(entry.resourceId) ? "preview-ready" : diagnosticStatus(firstDiagnostic));
  return {
    scope: entry.scope,
    source: entry.source,
    resourceType: entry.resourceType,
    resourceId: Number.isFinite(Number(entry.resourceId)) ? Number(entry.resourceId) : null,
    label: entry.label,
    status,
    diagnostic: diagnosticKey(firstDiagnostic, status),
    previewPath: entry.previewPath ?? builtInReferencePictPreviewPath(entry.resourceId)
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
  return undefined;
}

function diagnosticStatus(diagnostic) {
  if (!diagnostic) return "missing-fallback";
  const text = typeof diagnostic === "string" ? diagnostic : `${diagnostic.code ?? ""} ${diagnostic.message ?? ""}`.toLowerCase();
  if (text.includes("malformed")) return "malformed";
  if (text.includes("unsupported")) return "unsupported-variant";
  return "missing-fallback";
}

function diagnosticKey(diagnostic, status) {
  if (!diagnostic) return status;
  if (typeof diagnostic === "string") return diagnostic;
  return [diagnostic.code, diagnostic.opcode, diagnostic.variant, diagnostic.message].filter(Boolean).join(" | ") || status;
}

function groupRows(inputRows) {
  const groups = new Map();
  for (const row of inputRows) {
    const key = `${row.status}\n${row.diagnostic}\n${row.scope}`;
    if (!groups.has(key)) {
      groups.set(key, {
        status: row.status,
        diagnostic: row.diagnostic,
        scope: row.scope,
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
        .sort((a, b) => (a.resourceId ?? Number.MAX_SAFE_INTEGER) - (b.resourceId ?? Number.MAX_SAFE_INTEGER) || a.label.localeCompare(b.label))
        .slice(0, 40)
    }))
    .sort((a, b) => a.status.localeCompare(b.status) || b.count - a.count || a.scope.localeCompare(b.scope));
}

function renderMarkdown(report) {
  const lines = [
    "# PICT Codec Corpus Report",
    "",
    `- Project: ${report.project ?? "none supplied"}`,
    `- Resources scanned: ${report.totals.resources}`,
    `- Attention needed: ${report.totals.attention}`,
    ""
  ];
  for (const group of report.groups) {
    lines.push(`## ${group.status} - ${group.scope} (${group.count})`, "");
    lines.push(`Diagnostic: \`${group.diagnostic}\``, "");
    for (const row of group.resources) {
      lines.push(`- ${row.resourceType} ${row.resourceId ?? "?"}: ${row.label} (${row.source})${row.previewPath ? ` - ${row.previewPath}` : ""}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
