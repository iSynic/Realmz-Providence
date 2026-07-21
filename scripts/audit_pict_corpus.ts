import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseResourceFork, writeResourceFork } from "../src/editor/browser/resourceFork";
import { inspectPictConformanceForTest, inspectPictOpcodeInventoryForAudit } from "../src/editor/browser/resourcePreview";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(options.outputDir);
const payloadDir = path.join(outputDir, "payloads");
const previewDir = path.join(outputDir, "previews");
fs.rmSync(payloadDir, { recursive: true, force: true });
fs.rmSync(previewDir, { recursive: true, force: true });
fs.mkdirSync(payloadDir, { recursive: true });
fs.mkdirSync(previewDir, { recursive: true });

const scenarios = discoverScenarios(options.roots);
const resources: AuditResource[] = [];
const uniquePayloads = new Map<string, Uint8Array>();

for (const scenario of scenarios) {
  if (!scenario.resourceForkPath) continue;
  const fork = new Uint8Array(fs.readFileSync(scenario.resourceForkPath));
  const entries = parseResourceFork(fork);
  const rewritten = writeResourceFork(entries.map((entry) => ({
    resourceType: entry.resourceType,
    id: entry.id,
    name: entry.name,
    attributes: entry.attributes,
    data: entry.data
  })));
  const rewrittenPicts = new Map(
    parseResourceFork(rewritten)
      .filter((entry) => entry.resourceType === "PICT")
      .map((entry) => [entry.id, entry.data])
  );
  scenario.pictPayloadRoundTrip = true;

  for (const entry of entries.filter((candidate) => candidate.resourceType === "PICT")) {
    const sha256 = sha(entry.data);
    const preview = inspectPictConformanceForTest(entry.data);
    const inventory = inspectPictOpcodeInventoryForAudit(entry.data);
    const rgbaSha256 = preview.rgba ? sha(preview.rgba) : null;
    const previewPath = preview.rgba && preview.width && preview.height
      ? path.join(previewDir, `${sha256}.png`)
      : null;
    if (previewPath) {
      fs.writeFileSync(previewPath, encodePng(preview.width!, preview.height!, preview.rgba!));
    }
    if (!uniquePayloads.has(sha256)) {
      uniquePayloads.set(sha256, entry.data);
      fs.writeFileSync(path.join(payloadDir, `${sha256}.pict`), entry.data);
    }
    const roundTrip = rewrittenPicts.get(entry.id);
    const preserved = Boolean(roundTrip && bytesEqual(roundTrip, entry.data));
    scenario.pictPayloadRoundTrip &&= preserved;
    const unsupportedVisible = Number(preview.summary.unsupportedVisibleOpcodes ?? 0);
    const bitmapCommands = inventory.opcodes.filter((opcode) => isBitmapOpcode(opcode.opcode)).length;
    resources.push({
      scenario: scenario.name,
      corpusRoot: scenario.selectedRoot!,
      resourceFork: relative(scenario.resourceForkPath),
      resourceId: entry.id,
      resourceName: entry.name,
      bytes: entry.data.byteLength,
      sha256,
      frame: frame(entry.data, inventory.payloadOffset),
      version: inventory.version,
      opcodeCount: inventory.opcodes.length,
      opcodeSet: [...new Set(inventory.opcodes.map((opcode) => opcode.opcode))],
      opcodeFamilies: [...new Set(inventory.opcodes.map((opcode) => opcodeFamily(opcode.opcode)))],
      bitmapCommands,
      browser: {
        status: preview.status === "decoded" ? "preview-ready" : preview.status,
        width: preview.width,
        height: preview.height,
        rgbaSha256,
        summary: preview.summary,
        diagnosticCodes: preview.diagnostics.map((diagnostic) => diagnostic.code)
      },
      classification: preview.status !== "decoded"
        ? "decode-failure"
        : unsupportedVisible > 0 || bitmapCommands > 1
          ? "manual-review-required"
          : "preview-ready",
      previewPath: previewPath ? relative(previewPath) : null,
      pictPayloadRoundTrip: preserved,
      visualStatus: "pending"
    });
  }
}

const rustOutput = path.join(outputDir, "rust-results.json");
runRustAudit(payloadDir, rustOutput);
const rustRows = new Map((JSON.parse(fs.readFileSync(rustOutput, "utf8")) as RustResult[]).map((row) => [row.sha256, row]));
const parityMismatches: ParityMismatch[] = [];
for (const resource of resources) {
  const rust = rustRows.get(resource.sha256);
  resource.rust = rust ?? null;
  const differences = rust ? compareRuntime(resource.browser, rust) : ["missing-rust-result"];
  resource.runtimeParity = differences.length === 0;
  if (differences.length > 0) parityMismatches.push({ sha256: resource.sha256, differences });
}

const uniqueHashes = [...uniquePayloads.keys()].sort();
const payloadCorpusSha256 = sha(Buffer.from(uniqueHashes.join("\n"), "utf8"));
const renderedCorpusSha256 = sha(Buffer.from(
  [...new Map(resources.map((resource) => [resource.sha256, resource.browser.rgbaSha256 ?? resource.browser.status]))]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([payloadSha256, renderResult]) => `${payloadSha256}:${renderResult}`)
    .join("\n"),
  "utf8"
));
const visualReview = loadVisualReview(options.visualReviewPath);
const visualReviewMatches = Boolean(
  visualReview
  && visualReview.status === "complete"
  && visualReview.uniquePayloads === uniquePayloads.size
  && visualReview.payloadCorpusSha256 === payloadCorpusSha256
  && visualReview.renderedCorpusSha256 === renderedCorpusSha256
);
for (const resource of resources) {
  resource.visualStatus = visualReviewMatches ? "reviewed-complete" : "pending";
}

const report = {
  schemaVersion: 1,
  generatedBy: "scripts/audit_pict_corpus.ts",
  corpusRoots: options.roots,
  totals: {
    scenarios: scenarios.length,
    scenariosWithResourceFork: scenarios.filter((scenario) => scenario.resourceForkPath).length,
    resources: resources.length,
    uniquePayloads: uniquePayloads.size,
    previewReady: resources.filter((resource) => resource.browser.status === "preview-ready").length,
    decodeFailures: resources.filter((resource) => resource.browser.status !== "preview-ready").length,
    manualReviewRequired: new Set(resources.filter((resource) => resource.classification === "manual-review-required").map((resource) => resource.sha256)).size,
    parityMismatches: new Set(parityMismatches.map((mismatch) => mismatch.sha256)).size,
    payloadRoundTripFailures: resources.filter((resource) => !resource.pictPayloadRoundTrip).length,
    visualReviewPending: visualReviewMatches ? 0 : uniquePayloads.size
  },
  claims: {
    specificationBacked: "Opcode-family names and version/container distinctions follow Imaging With QuickDraw Appendix A.",
    fixtureProven: "Rows record decoder output for the exact local payload SHA-256 and both Providence runtimes.",
    correlated: "Duplicate payload hashes correlate identical bytes across scenario occurrences.",
    inferred: "manual-review-required is inferred from multiple bitmap commands or unrendered visible opcodes until visually reviewed.",
    unknown: "Visual completeness remains unknown while visualStatus is pending."
  },
  payloadCorpusSha256,
  renderedCorpusSha256,
  visualReview: visualReviewMatches ? visualReview : null,
  scenarios,
  resources,
  parityMismatches: dedupeParity(parityMismatches)
};

const reportPath = path.join(outputDir, "report.json");
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "report.md"), renderMarkdown(report));
console.log(`PICT corpus audit: ${report.totals.scenarios} scenarios, ${report.totals.resources} resources, ${report.totals.uniquePayloads} unique payloads.`);
console.log(`Preview failures: ${report.totals.decodeFailures}; parity mismatches: ${report.totals.parityMismatches}; payload round-trip failures: ${report.totals.payloadRoundTripFailures}.`);
console.log(`Visual review pending: ${report.totals.visualReviewPending}.`);
console.log(`Wrote ${relative(reportPath)}`);
if (options.check && (report.totals.decodeFailures > 0 || report.totals.parityMismatches > 0 || report.totals.payloadRoundTripFailures > 0 || report.totals.visualReviewPending > 0)) process.exitCode = 1;

type ScenarioRow = {
  name: string;
  sources: string[];
  selectedRoot: string | null;
  resourceForkPath: string | null;
  resourceForkSha256: string | null;
  resourceForkBytes: number | null;
  pictPayloadRoundTrip: boolean | null;
};

type RuntimeResult = {
  status: string;
  width: number | null;
  height: number | null;
  rgbaSha256: string | null;
  summary: Record<string, string>;
  diagnosticCodes: string[];
};

type RustResult = RuntimeResult & { sha256: string };

type AuditResource = {
  scenario: string;
  corpusRoot: string;
  resourceFork: string;
  resourceId: number;
  resourceName: string;
  bytes: number;
  sha256: string;
  frame: ReturnType<typeof frame>;
  version: string;
  opcodeCount: number;
  opcodeSet: string[];
  opcodeFamilies: string[];
  bitmapCommands: number;
  browser: RuntimeResult;
  rust?: RustResult | null;
  classification: string;
  previewPath: string | null;
  pictPayloadRoundTrip: boolean;
  visualStatus: string;
  runtimeParity?: boolean;
};

type ParityMismatch = { sha256: string; differences: string[] };

type VisualReview = {
  schemaVersion: number;
  reviewedAt: string;
  status: string;
  uniquePayloads: number;
  payloadCorpusSha256: string;
  renderedCorpusSha256: string;
  findings: Array<Record<string, unknown>>;
};

function parseArgs(args: string[]) {
  const roots: string[] = [];
  let outputDir = "tmp/pict-corpus-audit";
  let visualReviewPath = "fixtures/pict-corpus-review.json";
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--root") roots.push(path.resolve(args[++index]));
    else if (args[index] === "--out-dir") outputDir = args[++index];
    else if (args[index] === "--visual-review") visualReviewPath = args[++index];
    else if (args[index] === "--check") check = true;
    else throw new Error(`Unknown argument ${args[index]}`);
  }
  if (roots.length === 0) roots.push("F:/Realmz/base/Realmz/Scenarios", "F:/DivinityEdit/Scenarios");
  return { roots, outputDir, visualReviewPath, check };
}

function loadVisualReview(reviewPath: string): VisualReview | null {
  const absolutePath = path.resolve(reviewPath);
  if (!fs.existsSync(absolutePath)) return null;
  return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as VisualReview;
}

function discoverScenarios(roots: string[]): ScenarioRow[] {
  const rows = new Map<string, ScenarioRow>();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter((candidate) => candidate.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const directory = path.join(root, entry.name);
      const candidates = [path.join(directory, "Scenario.rsrc"), path.join(directory, ".rsrc", "Scenario"), path.join(directory, "._Scenario")];
      const resourceForkPath = candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
      const current = rows.get(entry.name) ?? {
        name: entry.name,
        sources: [],
        selectedRoot: null,
        resourceForkPath: null,
        resourceForkSha256: null,
        resourceForkBytes: null,
        pictPayloadRoundTrip: null
      };
      current.sources.push(directory);
      if (!current.resourceForkPath && resourceForkPath) {
        const bytes = fs.readFileSync(resourceForkPath);
        current.selectedRoot = root;
        current.resourceForkPath = resourceForkPath;
        current.resourceForkSha256 = sha(bytes);
        current.resourceForkBytes = bytes.byteLength;
      }
      rows.set(entry.name, current);
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function runRustAudit(inputDir: string, outputPath: string) {
  const result = spawnSync("cargo", ["run", "--quiet", "--manifest-path", path.join(repoRoot, "src-tauri", "Cargo.toml"), "--example", "audit_pict_payloads", "--", "--input-dir", inputDir, "--out", outputPath], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) throw new Error(`Rust PICT audit failed:\n${result.stdout}\n${result.stderr}`);
}

function compareRuntime(browser: RuntimeResult, rust: RustResult) {
  const differences: string[] = [];
  for (const field of ["status", "width", "height", "rgbaSha256"] as const) {
    if (browser[field] !== rust[field]) differences.push(`${field}:${browser[field]}!=${rust[field]}`);
  }
  for (const field of ["pictVersion", "format", "opcode", "opcodeCount"] as const) {
    if ((browser.summary[field] ?? null) !== (rust.summary[field] ?? null)) differences.push(`summary.${field}:${browser.summary[field] ?? null}!=${rust.summary[field] ?? null}`);
  }
  if (browser.diagnosticCodes.join(",") !== rust.diagnosticCodes.join(",")) differences.push(`diagnostics:${browser.diagnosticCodes.join(",")}!=${rust.diagnosticCodes.join(",")}`);
  return differences;
}

function dedupeParity(rows: ParityMismatch[]) {
  return [...new Map(rows.map((row) => [row.sha256, row])).values()];
}

function frame(bytes: Uint8Array, payloadOffset: number) {
  if (bytes.byteLength < payloadOffset + 10) return null;
  return {
    top: i16(bytes, payloadOffset + 2),
    left: i16(bytes, payloadOffset + 4),
    bottom: i16(bytes, payloadOffset + 6),
    right: i16(bytes, payloadOffset + 8)
  };
}

function opcodeFamily(opcode: string) {
  const value = Number.parseInt(opcode.slice(2), 16);
  if ([0x90, 0x91, 0x98, 0x99, 0x9a, 0x9b].includes(value)) return "bitmap";
  if (value >= 0x28 && value <= 0x2b) return "text";
  if ((value >= 0x20 && value <= 0x87) || value === 0x8200) return "vector-or-region";
  if (value === 0xa0 || value === 0xa1) return "comment";
  if (value >= 0x100) return "reserved-or-extended";
  return "state-or-control";
}

function isBitmapOpcode(opcode: string) {
  return ["0x0090", "0x0091", "0x0098", "0x0099", "0x009A", "0x009B"].includes(opcode);
}

function renderMarkdown(report: typeof report) {
  const lines = [
    "# Full Scenario PICT Corpus Audit",
    "",
    `- Scenario names: ${report.totals.scenarios}`,
    `- Scenarios with resource forks: ${report.totals.scenariosWithResourceFork}`,
    `- PICT occurrences: ${report.totals.resources}`,
    `- Unique payload hashes: ${report.totals.uniquePayloads}`,
    `- Preview-ready: ${report.totals.previewReady}`,
    `- Decode failures: ${report.totals.decodeFailures}`,
    `- Distinct hashes requiring manual review: ${report.totals.manualReviewRequired}`,
    `- Browser/Rust parity mismatches: ${report.totals.parityMismatches}`,
    `- PICT payload round-trip failures: ${report.totals.payloadRoundTripFailures}`,
    `- Unique payloads awaiting visual review: ${report.totals.visualReviewPending}`,
    `- Payload corpus fingerprint: ${report.payloadCorpusSha256}`,
    `- Rendered corpus fingerprint: ${report.renderedCorpusSha256}`,
    "",
    "## Scenario Inventory",
    ""
  ];
  for (const scenario of report.scenarios) {
    const count = report.resources.filter((resource) => resource.scenario === scenario.name).length;
    lines.push(`- ${scenario.name}: ${scenario.resourceForkPath ? `${count} PICT resources` : "resource fork unavailable"}`);
  }
  lines.push("", report.totals.visualReviewPending > 0 ? "## Attention Rows" : "## Visually Reviewed Edge Cases", "");
  for (const resource of report.resources.filter((row) => row.classification !== "preview-ready")) {
    lines.push(`- ${resource.scenario} PICT ${resource.resourceId}: ${resource.classification}; ${resource.visualStatus}; ${resource.browser.diagnosticCodes.join(", ") || resource.opcodeFamilies.join(", ")}; sha256 ${resource.sha256}`);
  }
  lines.push("", "## Evidence Labels", "");
  for (const [label, claim] of Object.entries(report.claims)) lines.push(`- ${label}: ${claim}`);
  return `${lines.join("\n")}\n`;
}

function encodePng(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray) {
  const stride = width * 4;
  const rows = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(rows, y * (stride + 1) + 1);
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", Buffer.from([width >>> 24, width >>> 16, width >>> 8, width, height >>> 24, height >>> 16, height >>> 8, height, 8, 6, 0, 0, 0])),
    pngChunk("IDAT", deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sha(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesEqual(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function i16(bytes: Uint8Array, offset: number) {
  const value = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  return value & 0x8000 ? value - 0x10000 : value;
}

function relative(filePath: string) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}
