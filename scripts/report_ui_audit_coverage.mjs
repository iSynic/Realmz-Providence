import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATRIX_PATH = path.join(ROOT, "docs", "ui-audit-matrix.json");
const REGISTRY_PATH = path.join(ROOT, "src", "editor", "workbench", "registry.tsx");
const GALLERY_FILES = {
  scenario: "scenario-shell.png",
  maps: "land-dungeon-maps.png",
  "player-maps": "player-maps.png",
  scripts: "action-points.png",
  text: "strings-text.png",
  encounters: "complex-encounters.png",
  combat: "combat.png",
  economy: "economy-treasure.png",
  rules: "rules-castes.png",
  assets: "assets.png",
  export: "export.png"
};
const VALID_ROUTES = new Set(["ready", "interaction-hook"]);
const VALID_BASELINES = new Set(["covered", "planned"]);
const VALID_WORKBENCHES = new Set(["project", "library"]);
const VALID_STATE_ACTIONS = new Set(["click", "fill", "wait"]);

const args = parseArgs(process.argv.slice(2));
const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, "utf8"));
const registeredTools = parseRegisteredTools(fs.readFileSync(REGISTRY_PATH, "utf8"));
const problems = validateMatrix(matrix, registeredTools);
const report = buildReport(matrix, registeredTools, problems);

if (args.get("out")) {
  const outputPath = path.resolve(ROOT, args.get("out"));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

console.log(`UI audit coverage: ${report.tools.total} tools, ${report.tools.captureReady} capture-ready, ${report.tools.interactionHooks} interaction hook(s), ${report.tools.coveredBaselines} curated baseline(s), ${report.tools.interactionStates} interaction state(s).`);
for (const [track, count] of Object.entries(report.byTrack)) console.log(`  ${track}: ${count}`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`ERROR: ${problem}`);
  process.exitCode = 1;
} else if (args.has("check")) {
  console.log("UI audit matrix matches the registered tool catalog.");
}

function parseArgs(values) {
  const parsed = new Map();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const [key, inline] = value.slice(2).split("=", 2);
    if (inline != null) parsed.set(key, inline);
    else if (values[index + 1] && !values[index + 1].startsWith("--")) parsed.set(key, values[++index]);
    else parsed.set(key, "true");
  }
  return parsed;
}

function parseRegisteredTools(source) {
  const tools = [];
  const lines = source.split(/\r?\n/);
  let insideRegistry = false;
  let domain = null;
  for (const line of lines) {
    if (line.startsWith("export const DOMAIN_REGISTRY")) {
      insideRegistry = true;
      continue;
    }
    if (!insideRegistry) continue;
    if (line === "};") break;
    const domainMatch = line.match(/^  (?:(?:"([^"]+)")|([a-z-]+)): \{$/);
    if (domainMatch) {
      domain = domainMatch[1] ?? domainMatch[2];
      continue;
    }
    const toolMatch = line.match(/t\(\{ id: "([^"]+)", label: "([^"]+)".*workbench: "(project|library|both)"/);
    if (!toolMatch || !domain) continue;
    tools.push({
      key: `${domain}.${toolMatch[1]}`,
      domain,
      editor: toolMatch[1],
      label: toolMatch[2],
      workbenches: toolMatch[3] === "both" ? ["project", "library"] : [toolMatch[3]]
    });
  }
  return tools;
}

function validateMatrix(matrix, registeredTools) {
  const problems = [];
  if (matrix.schemaVersion !== 1) problems.push(`Unsupported schemaVersion ${matrix.schemaVersion}.`);
  if (!Array.isArray(matrix.viewports) || matrix.viewports.length < 2) problems.push("At least desktop and compact viewports are required.");
  if (!Array.isArray(matrix.tools)) return [...problems, "tools must be an array."];

  const matrixByKey = new Map();
  for (const tool of matrix.tools) {
    if (!tool?.key) {
      problems.push("Every matrix tool requires a key.");
      continue;
    }
    if (matrixByKey.has(tool.key)) problems.push(`Duplicate matrix key ${tool.key}.`);
    matrixByKey.set(tool.key, tool);
    if (tool.key !== `${tool.domain}.${tool.editor}`) problems.push(`${tool.key} must match ${tool.domain}.${tool.editor}.`);
    if (!/^ISY-\d+$/.test(tool.track ?? "")) problems.push(`${tool.key} has invalid track ${tool.track}.`);
    if (!Array.isArray(tool.workbenches) || tool.workbenches.length === 0 || tool.workbenches.some((value) => !VALID_WORKBENCHES.has(value))) {
      problems.push(`${tool.key} has invalid workbench coverage.`);
    }
    if (!VALID_ROUTES.has(tool.capture?.route)) problems.push(`${tool.key} has invalid capture route ${tool.capture?.route}.`);
    if (!VALID_BASELINES.has(tool.capture?.baseline)) problems.push(`${tool.key} has invalid baseline ${tool.capture?.baseline}.`);
    if (tool.capture?.captureWorkbench && !tool.workbenches.includes(tool.capture.captureWorkbench)) {
      problems.push(`${tool.key} captures ${tool.capture.captureWorkbench}, which is not a registered context.`);
    }
    validateCaptureStates(tool, problems);
    if (tool.capture?.baseline === "covered") {
      const galleryFile = GALLERY_FILES[tool.capture.galleryPreset];
      if (!galleryFile) problems.push(`${tool.key} has no recognized gallery preset.`);
      else if (!fs.existsSync(path.join(ROOT, "public", "manual", "gallery", galleryFile))) problems.push(`${tool.key} is missing ${galleryFile}.`);
    }
  }

  const registeredByKey = new Map(registeredTools.map((tool) => [tool.key, tool]));
  for (const registered of registeredTools) {
    const tool = matrixByKey.get(registered.key);
    if (!tool) {
      problems.push(`Registered tool ${registered.key} is missing from the audit matrix.`);
      continue;
    }
    if (tool.label !== registered.label) problems.push(`${registered.key} label is ${tool.label}; registry uses ${registered.label}.`);
    if (!sameValues(tool.workbenches, registered.workbenches)) {
      problems.push(`${registered.key} workbenches do not match the registry.`);
    }
  }
  for (const tool of matrix.tools) {
    if (!registeredByKey.has(tool.key)) problems.push(`Audit matrix tool ${tool.key} is not registered.`);
  }
  return problems;
}

function validateCaptureStates(tool, problems) {
  if (tool.capture?.states == null) return;
  if (!Array.isArray(tool.capture.states)) {
    problems.push(`${tool.key} capture states must be an array.`);
    return;
  }
  const stateIds = new Set();
  for (const state of tool.capture.states) {
    if (!state?.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(state.id)) {
      problems.push(`${tool.key} has an invalid capture state id ${state?.id}.`);
    } else if (state.id === "base") {
      problems.push(`${tool.key} must not declare the implicit base capture state.`);
    } else if (stateIds.has(state.id)) {
      problems.push(`${tool.key} has duplicate capture state ${state.id}.`);
    }
    stateIds.add(state?.id);
    if (!Array.isArray(state?.steps) || state.steps.length === 0) {
      problems.push(`${tool.key}:${state?.id ?? "unknown"} requires at least one interaction step.`);
      continue;
    }
    for (const step of state.steps) {
      if (!VALID_STATE_ACTIONS.has(step?.action)) problems.push(`${tool.key}:${state.id} has invalid action ${step?.action}.`);
      if (typeof step?.selector !== "string" || !step.selector.trim()) problems.push(`${tool.key}:${state.id} has a step without a selector.`);
      if (step?.action === "fill" && typeof step.value !== "string") problems.push(`${tool.key}:${state.id} fill steps require a string value.`);
    }
  }
}

function buildReport(matrix, registeredTools, problems) {
  const byTrack = {};
  const byDomain = {};
  for (const tool of matrix.tools ?? []) {
    byTrack[tool.track] = (byTrack[tool.track] ?? 0) + 1;
    byDomain[tool.domain] = (byDomain[tool.domain] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: matrix.schemaVersion,
    milestone: matrix.milestone,
    parentIssue: matrix.parentIssue,
    tools: {
      total: matrix.tools?.length ?? 0,
      registered: registeredTools.length,
      captureReady: matrix.tools?.filter((tool) => tool.capture.route === "ready").length ?? 0,
      interactionHooks: matrix.tools?.filter((tool) => tool.capture.route === "interaction-hook").length ?? 0,
      coveredBaselines: matrix.tools?.filter((tool) => tool.capture.baseline === "covered").length ?? 0,
      plannedBaselines: matrix.tools?.filter((tool) => tool.capture.baseline === "planned").length ?? 0,
      interactionStates: matrix.tools?.reduce((count, tool) => count + (tool.capture.states?.length ?? 0), 0) ?? 0
    },
    viewports: matrix.viewports,
    byTrack: sortObject(byTrack),
    byDomain: sortObject(byDomain),
    problems
  };
}

function sameValues(left, right) {
  return [...left].sort().join("\0") === [...right].sort().join("\0");
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}
