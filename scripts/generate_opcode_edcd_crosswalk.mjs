import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const divinityHelpPath = path.join(repoRoot, "docs/generated/divinity-opcode-help.json");
const edcdSourceMapPath = path.join(repoRoot, "docs/generated/edcd-opcode-source-map.json");
const realmzActionsPath = path.join(repoRoot, "src/editor/realmzActions.ts");
const realmzEdcdPath = path.join(repoRoot, "src/editor/realmzEdcd.ts");
const newlandPath = "F:\\Realmz\\src\\realmz_orig\\newland.c";
const outputJsonPath = path.join(repoRoot, "docs/generated/opcode-edcd-crosswalk.json");
const outputMarkdownPath = path.join(repoRoot, "docs/format-evidence-cards/opcode-edcd-crosswalk.md");
const uiOutputPath = path.join(repoRoot, "src/editor/generated/opcodeEdcdCrosswalk.json");

const divinityHelp = readJson(divinityHelpPath);
const edcdSourceMap = readJson(edcdSourceMapPath);
const actionDetails = parseActionDetails(fs.readFileSync(realmzActionsPath, "utf8"));
const fieldsByShape = parseEdcdFields(fs.readFileSync(realmzEdcdPath, "utf8"));
const sourceAnchors = fs.existsSync(newlandPath) ? parseNewlandDispatcher(fs.readFileSync(newlandPath, "utf8"), newlandPath) : new Map();
const correctionsByOpcode = new Map((edcdSourceMap.corrections ?? []).map((entry) => [Number(entry.opcode), entry]));
const divinityEntriesByCode = groupDivinityEntries(divinityHelp.entries ?? []);

const allCodes = new Set();
for (const key of Object.keys(divinityHelp.byCode ?? {})) allCodes.add(Number(key));
for (const code of actionDetails.keys()) allCodes.add(code);
for (const code of edcdSourceMap.edcdBackedOpcodes ?? []) allCodes.add(Number(code));
for (const code of edcdSourceMap.directNonEdcdOpcodes ?? []) allCodes.add(Number(code));
for (const code of edcdSourceMap.directExtraActionPointOpcodes ?? []) allCodes.add(Number(code));
allCodes.add(0);

const rows = [...allCodes]
  .sort((a, b) => a - b)
  .map((code) => buildCrosswalkRow(code));

const summary = {
  totalOpcodes: rows.length,
  withDivinityHelp: rows.filter((row) => row.divinity.resourceIds.length > 0).length,
  edcdBacked: rows.filter((row) => row.providence.edcdBacked).length,
  directExtraActionPoint: rows.filter((row) => row.providence.directExtraActionPoint).length,
  missingProvidenceShape: rows.filter((row) => row.providence.edcdBacked && !row.providence.shape).map((row) => row.opcode),
  missingDivinityHelp: rows.filter((row) => row.opcode !== 0 && row.divinity.resourceIds.length === 0).map((row) => row.opcode),
  missingRealmzSourceAnchor: rows
    .filter((row) => row.opcode !== 0 && !row.realmzSource.caseAnchor && !row.realmzSource.edcdLoadAnchor && !row.realmzSource.auditAnchor)
    .map((row) => row.opcode),
  sourceAnchoredRows: rows.filter((row) => row.realmzSource.caseAnchor || row.realmzSource.edcdLoadAnchor || row.realmzSource.auditAnchor).length,
  fieldComparisonGaps: rows
    .filter((row) => row.providence.edcdBacked && row.providence.fieldComparison.some((field) => !field.divinity || !field.providence))
    .map((row) => row.opcode)
};

const artifact = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources: {
    divinityOpcodeHelp: "docs/generated/divinity-opcode-help.json",
    edcdSourceMap: "docs/generated/edcd-opcode-source-map.json",
    providenceActionTable: "src/editor/realmzActions.ts",
    providenceEdcdFields: "src/editor/realmzEdcd.ts",
    realmzRuntime: newlandPath
  },
  summary,
  rows
};

writeJson(outputJsonPath, artifact);
writeJson(uiOutputPath, buildUiCrosswalk(artifact));
fs.mkdirSync(path.dirname(outputMarkdownPath), { recursive: true });
fs.writeFileSync(outputMarkdownPath, renderMarkdown(artifact));

console.log(`Wrote ${path.relative(repoRoot, outputJsonPath)}`);
console.log(`Wrote ${path.relative(repoRoot, outputMarkdownPath)}`);
console.log(`Wrote ${path.relative(repoRoot, uiOutputPath)}`);
console.log(JSON.stringify(summary, null, 2));

function buildCrosswalkRow(code) {
  const action = actionDetails.get(code);
  const divinityEntries = divinityEntriesByCode.get(code) ?? [];
  const primaryDivinity = divinityEntries[0];
  const source = sourceAnchors.get(code);
  const correction = correctionsByOpcode.get(code);
  const edcdBacked = (edcdSourceMap.edcdBackedOpcodes ?? []).map(Number).includes(code);
  const directExtraActionPoint = (edcdSourceMap.directExtraActionPointOpcodes ?? []).map(Number).includes(code);
  const directNonEdcd = (edcdSourceMap.directNonEdcdOpcodes ?? []).map(Number).includes(code);
  const sameMapActionPointCopy = (edcdSourceMap.sameMapActionPointCopyOpcodes ?? []).map(Number).includes(code);
  const shape = action?.edcdShape ?? correction?.shape ?? null;
  const fields = shape ? fieldsByShape.get(shape) ?? correction?.fields ?? [] : [];
  const extraCodeItems = primaryDivinity ? parseExtraCodeItems(primaryDivinity.extraCodes) : [];
  return {
    opcode: code,
    divinity: {
      resourceIds: divinityEntries.map((entry) => entry.resourceId),
      title: primaryDivinity?.title ?? action?.shortLabel ?? `Opcode ${code}`,
      idField: primaryDivinity?.idField ?? "",
      use: primaryDivinity?.use ?? "",
      options: primaryDivinity?.options ?? "",
      extraCodes: primaryDivinity?.extraCodes ?? "",
      extraCodeItems,
      variants: divinityEntries.slice(1).map((entry) => ({
        resourceId: entry.resourceId,
        title: entry.title,
        use: entry.use,
        extraCodes: entry.extraCodes,
        extraCodeItems: parseExtraCodeItems(entry.extraCodes)
      }))
    },
    providence: {
      label: action?.shortLabel ?? null,
      category: action?.category ?? null,
      description: action?.description ?? null,
      edcdBacked,
      shape,
      fields,
      directNonEdcd,
      directExtraActionPoint,
      sameMapActionPointCopy,
      fieldComparison: compareFields(extraCodeItems, fields)
    },
    realmzSource: {
      caseAnchor: source?.caseLine ? `${newlandPath}:${source.caseLine}` : null,
      edcdLoadAnchor: source?.loadextracodeLine ? `${newlandPath}:${source.loadextracodeLine}` : null,
      auditAnchor: correction?.realmzAnchor ?? null,
      consumerStatus: correction?.status ?? (edcdBacked ? "source-audited-edcd-consumer" : directExtraActionPoint ? "direct-extra-action-point-consumer" : directNonEdcd ? "direct-code-id-consumer" : "manual-or-direct-consumer"),
      runtimeNote: correction?.runtimeNote ?? null
    },
    writerStatus: writerStatusFor({ edcdBacked, shape, directExtraActionPoint, sameMapActionPointCopy, directNonEdcd })
  };
}

function writerStatusFor({ edcdBacked, shape, directExtraActionPoint, sameMapActionPointCopy, directNonEdcd }) {
  if (edcdBacked && shape) {
    return {
      status: "writer-ready-data-edcd",
      note: "Data EDCD row is five signed shorts and roundtrip/writer-backed; Providence has a typed shape for this opcode. Target-family validation still follows the shape-specific fields."
    };
  }
  if (edcdBacked) {
    return {
      status: "writer-gated-missing-edcd-shape",
      note: "Realmz loads Data EDCD for this opcode, but Providence has no typed shape in the current table."
    };
  }
  if (directExtraActionPoint) {
    return {
      status: "writer-ready-data-ed3-direct",
      note: "No EDCD row. ID directly selects an Extra Action Point row in Data ED3, which is fixed-row writer-backed."
    };
  }
  if (sameMapActionPointCopy) {
    return {
      status: "writer-ready-map-action-point-copy",
      note: "No EDCD row. ID selects an Action Point on the current loaded map and copies its slots."
    };
  }
  if (directNonEdcd) {
    return {
      status: "writer-ready-direct-code-id",
      note: "No EDCD row. ID is direct CODE-specific data."
    };
  }
  return {
    status: "writer-gated-direct-target-family",
    note: "No EDCD shape. Writer readiness depends on the direct target family for this opcode."
  };
}

function compareFields(extraCodeItems, fields) {
  const max = Math.max(extraCodeItems.length, fields.length);
  const comparison = [];
  for (let index = 0; index < max; index += 1) {
    comparison.push({
      index,
      divinity: extraCodeItems[index]?.text ?? "",
      providence: fields[index] ?? ""
    });
  }
  return comparison;
}

function buildUiCrosswalk(artifact) {
  const entries = {};
  for (const row of artifact.rows) {
    const parameters = row.providence.fields.map((fieldName, index) => {
      const comparison = row.providence.fieldComparison.find((field) => field.index === index);
      const divinity = cleanParameterHelp(comparison?.divinity ?? "");
      const preserved = isPreservedField(fieldName, divinity);
      return {
        index,
        label: preserved ? `Preserved Value ${index + 1}` : parameterLabel(divinity, fieldName, index),
        help: divinity,
        internalName: fieldName,
        preserved
      };
    });
    entries[String(row.opcode)] = {
      opcode: row.opcode,
      title: row.divinity.title,
      idMeaning: idMeaningForRow(row),
      idHelp: idHelpForRow(row),
      use: row.divinity.use,
      options: row.divinity.options,
      extraCodes: row.divinity.extraCodes,
      writerStatus: row.writerStatus.status,
      writerNote: uiWriterNote(row.writerStatus.status),
      runtimeNote: row.realmzSource.runtimeNote,
      sourceStatus: row.realmzSource.consumerStatus,
      shape: row.providence.shape,
      edcdBacked: row.providence.edcdBacked,
      parameters
    };
  }
  return {
    schemaVersion: 1,
    generatedAt: artifact.generatedAt,
    source: "docs/generated/opcode-edcd-crosswalk.json",
    entries
  };
}

function idMeaningForRow(row) {
  if (row.writerStatus.status === "writer-ready-data-edcd") return "Parameter Row";
  if (row.writerStatus.status === "writer-ready-data-ed3-direct") return "Extra Action Point";
  if (row.writerStatus.status === "writer-ready-map-action-point-copy") return "Same-map Action Point";
  const idField = cleanParameterHelp(row.divinity.idField ?? "");
  if (!idField || idField.toLowerCase() === "none" || idField.toLowerCase() === "not used") return "ID";
  return parameterLabel(idField, "id", 0);
}

function uiWriterNote(status) {
  if (status === "writer-ready-data-edcd") return "This action stores extra settings in a parameter row.";
  if (status === "writer-ready-data-ed3-direct") return "This action's ID runs an Extra Action Point.";
  if (status === "writer-ready-map-action-point-copy") return "This action's ID copies another Action Point on the current map.";
  if (status === "writer-ready-direct-code-id") return "This action stores its target directly in the ID field.";
  if (status === "writer-gated-missing-edcd-shape") return "This action is preserved, but its parameter layout still needs archaeology before editing.";
  return "This action uses direct ID behavior; target editing depends on the selected record family.";
}

function idHelpForRow(row) {
  if (row.writerStatus.status === "writer-ready-data-edcd") {
    return "This action's ID selects the parameter row used for its extra settings.";
  }
  if (row.writerStatus.status === "writer-ready-data-ed3-direct") {
    return "This action's ID selects an Extra Action Point to run.";
  }
  if (row.writerStatus.status === "writer-ready-map-action-point-copy") {
    return "This action's ID selects another Action Point on the current map and copies its action slots.";
  }
  return cleanParameterHelp(row.divinity.idField ?? "");
}

function cleanParameterHelp(text) {
  return String(text ?? "")
    .replace(/\s+Code\s+-?\d+\s+.+$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parameterLabel(divinityText, fallbackName, index) {
  const clean = cleanParameterHelp(divinityText);
  const colonPrefix = clean.split(":")[0]?.trim() ?? "";
  const parenPrefix = clean.split("(")[0]?.trim() ?? "";
  for (const candidate of [colonPrefix, parenPrefix, clean]) {
    if (candidate.length >= 3 && candidate.length <= 34 && !/^-?\d+\s*=/.test(candidate)) {
      return titleCaseParameter(candidate);
    }
  }
  const humanized = humanizeFieldName(fallbackName);
  return humanized || `Parameter ${index + 1}`;
}

function humanizeFieldName(name) {
  const spaced = String(name ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\bOr\b/g, " / ")
    .replace(/\bAnd\b/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
  return titleCaseParameter(spaced);
}

function titleCaseParameter(text) {
  return String(text ?? "")
    .replace(/[.:;]+$/g, "")
    .split(/\s+/)
    .map((word) => (/^[A-Z]{2,}$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ")
    .replace(/\bId\b/g, "ID")
    .replace(/\bAp\b/g, "AP")
    .replace(/\bXp\b/g, "XP")
    .replace(/\bDrv\b/g, "DRV");
}

function isPreservedField(fieldName, divinityText) {
  const normalized = String(fieldName ?? "").toLowerCase();
  const divinity = String(divinityText ?? "").toLowerCase();
  return normalized.includes("unused") || divinity === "not used" || divinity === "unused" || divinity.startsWith("----------------");
}

function parseActionDetails(source) {
  const details = new Map();
  for (const line of source.split(/\r?\n/)) {
    const match = /^ \s*(?:\[(-?\d+)\]|(-?\d+))\s*:\s*\{(.+)\},?\s*$/.exec(line);
    if (!match) continue;
    const code = Number(match[1] ?? match[2]);
    const body = match[3];
    details.set(code, {
      shortLabel: matchStringField(body, "shortLabel"),
      category: matchStringField(body, "category"),
      description: matchStringField(body, "description"),
      edcdShape: matchStringField(body, "edcdShape")
    });
  }
  return details;
}

function matchStringField(body, field) {
  return new RegExp(`${field}:\\s*"([^"]+)"`).exec(body)?.[1] ?? null;
}

function parseEdcdFields(source) {
  const fieldsByShape = new Map();
  const regex = /(?:"([^"]+)"|([A-Za-z0-9_-]+)):\s*\[([^\]]+)\]/g;
  for (const match of source.matchAll(regex)) {
    const shape = match[1] ?? match[2];
    const fields = [...match[3].matchAll(/"([^"]+)"/g)].map((fieldMatch) => fieldMatch[1]);
    fieldsByShape.set(shape, fields);
  }
  return fieldsByShape;
}

function parseNewlandDispatcher(source, sourcePath) {
  const lines = source.split(/\r?\n/);
  const switchIndex = lines.findIndex((line) => line.includes("switch (code)"));
  const anchors = new Map();
  if (switchIndex < 0) return anchors;
  let depth = braceDelta(lines[switchIndex]);
  let currentCode = null;
  for (let index = switchIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (depth === 1) {
      const caseMatch = /^\s*case\s+(-?\d+)\s*:/.exec(line);
      if (caseMatch) {
        currentCode = Number(caseMatch[1]);
        anchors.set(currentCode, {
          caseLine: index + 1,
          caseLabel: line.replace(/^\s*case\s+-?\d+\s*:\s*/, "").trim(),
          loadextracodeLine: null,
          sourcePath
        });
      }
    }
    if (currentCode !== null && line.includes("loadextracode") && !anchors.get(currentCode)?.loadextracodeLine) {
      anchors.get(currentCode).loadextracodeLine = index + 1;
    }
    depth += braceDelta(line);
    if (depth <= 0) break;
  }
  return anchors;
}

function braceDelta(line) {
  const withoutLineComment = line.replace(/\/\/.*$/, "");
  return (withoutLineComment.match(/\{/g) ?? []).length - (withoutLineComment.match(/\}/g) ?? []).length;
}

function groupDivinityEntries(entries) {
  const byCode = new Map();
  for (const entry of entries) {
    for (const code of entry.codes ?? []) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(entry);
    }
  }
  for (const group of byCode.values()) {
    group.sort((a, b) => a.resourceId - b.resourceId);
  }
  return byCode;
}

function parseExtraCodeItems(text) {
  if (!text || text.toLowerCase() === "none") return [];
  const compact = text.replace(/\s+/g, " ").trim();
  const items = [];
  const regex = /(?:^|\s)(\d+)\)\s+(.+?)(?=\s+\d+\)\s+|$)/g;
  for (const match of compact.matchAll(regex)) {
    const index = Number(match[1]) - 1;
    if (index >= 0 && index < 12 && !items.some((item) => item.index === index)) {
      items.push({ index, text: match[2].trim() });
    }
  }
  return items.sort((a, b) => a.index - b.index).slice(0, 5);
}

function renderMarkdown(artifact) {
  const lines = [];
  lines.push("# Evidence Card: Opcode / EDCD Crosswalk");
  lines.push("");
  lines.push("## User-Facing Unlock");
  lines.push("");
  lines.push("Providence can now compare Divinity's author-facing Action Point help against the current EDCD shape table and the Realmz runtime dispatcher. This is the working ledger for deciding whether an opcode's `ID` is a direct target, an Extra Action Point, or a `Data EDCD` parameter row.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total opcodes in crosswalk: ${artifact.summary.totalOpcodes}`);
  lines.push(`- Opcodes with Divinity help: ${artifact.summary.withDivinityHelp}`);
  lines.push(`- EDCD-backed opcodes: ${artifact.summary.edcdBacked}`);
  lines.push(`- Direct Extra Action Point opcodes: ${artifact.summary.directExtraActionPoint}`);
  lines.push(`- Missing Providence EDCD shapes: ${artifact.summary.missingProvidenceShape.length ? artifact.summary.missingProvidenceShape.join(", ") : "none"}`);
  lines.push(`- Missing Divinity help entries: ${artifact.summary.missingDivinityHelp.length ? artifact.summary.missingDivinityHelp.join(", ") : "none"}`);
  lines.push(`- Missing Realmz source anchors: ${artifact.summary.missingRealmzSourceAnchor.length ? artifact.summary.missingRealmzSourceAnchor.join(", ") : "none"}`);
  lines.push(`- EDCD field-comparison gaps: ${artifact.summary.fieldComparisonGaps.length ? artifact.summary.fieldComparisonGaps.join(", ") : "none"}`);
  lines.push("");
  lines.push("## Crosswalk");
  lines.push("");
  lines.push("| Opcode | Divinity Help | Divinity E-Codes | Providence Shape | Providence Fields | Realmz Source | Writer Status |");
  lines.push("| ---: | --- | --- | --- | --- | --- | --- |");
  for (const row of artifact.rows) {
    const source = row.realmzSource.auditAnchor ?? row.realmzSource.edcdLoadAnchor ?? row.realmzSource.caseAnchor ?? "";
    lines.push(`| ${row.opcode} | ${escapeTable(row.divinity.title)} | ${escapeTable(shorten(row.divinity.extraCodes || "None", 180))} | ${escapeTable(row.providence.shape ?? "none")} | ${escapeTable(row.providence.fields.join(", ") || "none")} | ${escapeTable(source)} | ${escapeTable(row.writerStatus.status)} |`);
  }
  lines.push("");
  lines.push("## Gaps To Chase");
  lines.push("");
  if (
    artifact.summary.missingProvidenceShape.length === 0 &&
    artifact.summary.missingDivinityHelp.length === 0 &&
    artifact.summary.missingRealmzSourceAnchor.length === 0 &&
    artifact.summary.fieldComparisonGaps.length === 0
  ) {
    lines.push("No generated gaps.");
  } else {
    lines.push(`- Missing Providence EDCD shape: ${artifact.summary.missingProvidenceShape.length ? artifact.summary.missingProvidenceShape.join(", ") : "none"}.`);
    lines.push(`- Missing Divinity help: ${artifact.summary.missingDivinityHelp.length ? artifact.summary.missingDivinityHelp.join(", ") : "none"}.`);
    lines.push(`- Missing Realmz source anchor: ${artifact.summary.missingRealmzSourceAnchor.length ? artifact.summary.missingRealmzSourceAnchor.join(", ") : "none"}.`);
    lines.push(`- EDCD field-comparison gaps: ${artifact.summary.fieldComparisonGaps.length ? artifact.summary.fieldComparisonGaps.join(", ") : "none"}.`);
  }
  lines.push("");
  lines.push("## Writer Status Legend");
  lines.push("");
  lines.push("- `writer-ready-data-edcd`: opcode uses a typed five-short `Data EDCD` row.");
  lines.push("- `writer-ready-data-ed3-direct`: opcode ID directly selects an Extra Action Point row.");
  lines.push("- `writer-ready-map-action-point-copy`: opcode ID copies another Action Point on the current map.");
  lines.push("- `writer-ready-direct-code-id`: opcode has direct CODE/ID behavior without EDCD.");
  lines.push("- `writer-gated-direct-target-family`: no EDCD row; writer readiness belongs to the referenced record family.");
  lines.push("- `writer-gated-missing-edcd-shape`: Realmz consumes EDCD but Providence has no typed shape yet.");
  lines.push("");
  lines.push("## Follow-Up Use");
  lines.push("");
  lines.push("- Review rows where Divinity E-Code wording and Providence field names disagree.");
  lines.push("- Use the `fieldComparison` arrays in `docs/generated/opcode-edcd-crosswalk.json` for targeted EDCD label fixes.");
  lines.push("- Treat rows without a typed EDCD shape as direct CODE/ID workflows unless Realmz source proves `loadextracode(id)`.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function shorten(text, max) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trim()}...`;
}

function escapeTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
