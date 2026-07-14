import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_COMMIT = "a450bed";
const OWNER_AREAS = [
  {
    name: "Scripts, Action Points, and Encounters",
    entrypoint: "src/editor/panels/ScriptsPanel.tsx",
    roots: ["src/editor/panels/ScriptsPanel.tsx", "src/editor/panels/scripts"]
  },
  {
    name: "Combat",
    entrypoint: "src/editor/panels/CombatPanel.tsx",
    roots: ["src/editor/panels/CombatPanel.tsx", "src/editor/panels/combat"]
  },
  {
    name: "Scenario generation",
    entrypoint: "src/editor/scenarioSeed.ts",
    roots: ["src/editor/scenarioSeed.ts", "src/editor/scenarioSeed"]
  },
  {
    name: "Realmz codecs",
    entrypoint: "src-tauri/src/realmz.rs",
    roots: ["src-tauri/src/realmz.rs", "src-tauri/src/realmz"]
  }
];

function runGit(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

function lineCount(source) {
  if (!source) return 0;
  const normalized = source.replaceAll("\r\n", "\n");
  return normalized.split("\n").length - (normalized.endsWith("\n") ? 1 : 0);
}

function isProductionSource(filePath) {
  return /\.(?:ts|tsx|rs)$/.test(filePath) && !/\.test\.(?:ts|tsx)$/.test(filePath);
}

function filesAt(ref, roots) {
  const args = ref === "WORKTREE"
    ? ["ls-files", "--", ...roots]
    : ["ls-tree", "-r", "--name-only", ref, "--", ...roots];
  return [...new Set(runGit(args).split(/\r?\n/).filter(Boolean))].filter(isProductionSource).sort();
}

function sourceAt(ref, filePath) {
  if (ref === "WORKTREE") return fs.readFileSync(path.join(ROOT, filePath), "utf8");
  return execFileSync("git", ["show", `${ref}:${filePath}`], { cwd: ROOT, encoding: "utf8" });
}

function measureOwner(ref, area) {
  const files = filesAt(ref, area.roots);
  const measurements = files.map((filePath) => ({
    path: filePath,
    lines: lineCount(sourceAt(ref, filePath))
  }));
  const totalLines = measurements.reduce((total, file) => total + file.lines, 0);
  const entrypointLines = measurements.find((file) => file.path === area.entrypoint)?.lines ?? 0;
  return {
    fileCount: measurements.length,
    totalLines,
    entrypointLines,
    entrypointShare: totalLines === 0 ? 0 : Number((entrypointLines / totalLines).toFixed(4))
  };
}

function testFilesAt(ref) {
  const args = ref === "WORKTREE"
    ? ["ls-files", "--", "src"]
    : ["ls-tree", "-r", "--name-only", ref, "--", "src"];
  return runGit(args).split(/\r?\n/).filter((filePath) => /\.test\.(?:ts|tsx)$/.test(filePath));
}

function collisionPoints() {
  const output = runGit([
    "log",
    "--format=format:__COMMIT__",
    "--name-only",
    `${BASELINE_COMMIT}..HEAD`,
    "--",
    "src/editor",
    "src-tauri/src",
    "scripts",
    "docs",
    "package.json"
  ]);
  const touches = new Map();
  let commitFiles = new Set();
  function recordCommit() {
    for (const filePath of commitFiles) touches.set(filePath, (touches.get(filePath) ?? 0) + 1);
    commitFiles = new Set();
  }
  for (const line of output.split(/\r?\n/)) {
    if (line === "__COMMIT__") {
      recordCommit();
    } else if (line) {
      commitFiles.add(line);
    }
  }
  recordCommit();
  return [...touches.entries()]
    .map(([filePath, commits]) => ({ path: filePath, commits }))
    .sort((left, right) => right.commits - left.commits || left.path.localeCompare(right.path))
    .slice(0, 15);
}

function architectureSummary() {
  const output = execFileSync("node", ["scripts/check_architecture_boundaries.mjs", "--report"], {
    cwd: ROOT,
    encoding: "utf8"
  });
  const summary = output.match(/\((\d+) production modules, (\d+) relative imports, (\d+) ownership edges\)/);
  const edges = [...output.matchAll(/^- ([^\r\n]+ -> [^\r\n]+)$/gm)].map((match) => match[1]);
  return {
    productionModules: Number(summary?.[1] ?? 0),
    relativeImports: Number(summary?.[2] ?? 0),
    ownershipEdges: Number(summary?.[3] ?? edges.length),
    cycles: 0,
    edges
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const report = {
  schemaVersion: 1,
  baseline: {
    commit: BASELINE_COMMIT,
    description: "ISY-314 refactor guardrails and characterization baseline"
  },
  current: {
    commit: runGit(["rev-parse", "HEAD"]),
    worktreeDirty: Boolean(runGit(["status", "--porcelain"]))
  },
  sourceConcentration: OWNER_AREAS.map((area) => ({
    name: area.name,
    entrypoint: area.entrypoint,
    baseline: measureOwner(BASELINE_COMMIT, area),
    current: measureOwner("WORKTREE", area)
  })),
  frontendTests: {
    baselineFiles: testFilesAt(BASELINE_COMMIT).length,
    currentFiles: testFilesAt("WORKTREE").length
  },
  architecture: architectureSummary(),
  recentChangeCollisionPoints: collisionPoints()
};

const outputPath = argument("--out");
if (outputPath) {
  const absolute = path.resolve(ROOT, outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`M19 closure audit written to ${path.relative(ROOT, absolute)}.`);
}

for (const area of report.sourceConcentration) {
  console.log(`${area.name}: entrypoint ${area.baseline.entrypointLines} -> ${area.current.entrypointLines} lines; owner files ${area.baseline.fileCount} -> ${area.current.fileCount}.`);
}
console.log(`Frontend tests: ${report.frontendTests.baselineFiles} -> ${report.frontendTests.currentFiles} files.`);
console.log(`Architecture: ${report.architecture.ownershipEdges} approved ownership edges, ${report.architecture.cycles} cycles.`);
