import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDITOR_ROOT = "src/editor";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const PANEL_DOMAINS = [
  "src/editor/panels/scripts",
  "src/editor/panels/combat",
  "src/editor/panels/maps"
];
const PANEL_DOMAIN_IMPORT_ALLOWLIST = new Map([
  [
    "src/editor/panels/combat/BattleWorkbench.tsx",
    new Set(["src/editor/panels/scripts/scriptActionCatalog"])
  ]
]);
const SCENARIO_SEED_BROWSER_IMPORT_ALLOWLIST = new Map([
  [
    "src/editor/scenarioSeed/mapCompiler.ts",
    new Set([
      "src/editor/browser/atlasPaths",
      "src/editor/browser/realmzParser"
    ])
  ],
  [
    "src/editor/scenarioSeed/projectCompiler.ts",
    new Set(["src/editor/browser/project"])
  ],
  [
    "src/editor/scenarioSeed/terrainPainter.ts",
    new Set(["src/editor/browser/realmzParser"])
  ]
]);
const PROJECT_COMMAND_DEEP_IMPORT_ALLOWLIST = new Map([
  [
    "src/editor/scenarioSeed/coreRecordCompiler.ts",
    new Set([
      "src/editor/projectCommands/targetRecordCommands",
      "src/editor/projectCommands/scenarioRulesCommands"
    ])
  ]
]);

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function isWithin(value, root) {
  return value === root || value.startsWith(`${root}/`);
}

function importTargets(source) {
  const targets = [];
  const staticPattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^"'\n]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicPattern = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  for (const pattern of [staticPattern, dynamicPattern]) {
    for (const match of source.matchAll(pattern)) targets.push(match[1]);
  }
  return targets;
}

function resolveImport(sourcePath, target) {
  if (!target.startsWith(".")) return null;
  const absolute = path.resolve(ROOT, path.dirname(sourcePath), target);
  return normalizePath(path.relative(ROOT, absolute));
}

function evaluateBoundary(sourcePath, targetPath) {
  const failures = [];
  const sourceDomain = PANEL_DOMAINS.find((domain) => isWithin(sourcePath, domain));
  const targetDomain = PANEL_DOMAINS.find((domain) => isWithin(targetPath, domain));
  if (
    sourceDomain
    && targetDomain
    && sourceDomain !== targetDomain
    && !PANEL_DOMAIN_IMPORT_ALLOWLIST.get(sourcePath)?.has(targetPath)
  ) {
    failures.push(`${sourcePath} crosses feature domains by importing ${targetPath}`);
  }

  const scenarioSeedRoot = "src/editor/scenarioSeed";
  if (isWithin(sourcePath, scenarioSeedRoot)) {
    const forbiddenRoots = [
      "src/editor/app",
      "src/editor/browser",
      "src/editor/components",
      "src/editor/panels",
      "src/editor/styles",
      "src/editor/workbench"
    ];
    const forbidden = forbiddenRoots.find((root) => isWithin(targetPath, root));
    if (
      forbidden
      && !SCENARIO_SEED_BROWSER_IMPORT_ALLOWLIST.get(sourcePath)?.has(targetPath)
    ) failures.push(`${sourcePath} imports UI/storage owner ${targetPath}`);
  }

  if (
    targetPath.startsWith(`${scenarioSeedRoot}/`)
    && !isWithin(sourcePath, scenarioSeedRoot)
    && sourcePath !== "src/editor/scenarioSeed.ts"
  ) {
    failures.push(`${sourcePath} bypasses the scenarioSeed.ts facade with ${targetPath}`);
  }

  const projectCommandsRoot = "src/editor/projectCommands";
  if (isWithin(sourcePath, projectCommandsRoot) || sourcePath === "src/editor/projectCommands.ts") {
    const forbiddenRoots = [
      "src/editor/app",
      "src/editor/browser",
      "src/editor/components",
      "src/editor/panels",
      "src/editor/scenarioSeed",
      "src/editor/workbench"
    ];
    const forbidden = forbiddenRoots.find((root) => isWithin(targetPath, root));
    if (forbidden) failures.push(`${sourcePath} imports higher-level owner ${targetPath}`);
  }

  if (
    targetPath.startsWith(`${projectCommandsRoot}/`)
    && !isWithin(sourcePath, projectCommandsRoot)
    && sourcePath !== "src/editor/projectCommands.ts"
    && !PROJECT_COMMAND_DEEP_IMPORT_ALLOWLIST.get(sourcePath)?.has(targetPath)
  ) {
    failures.push(`${sourcePath} bypasses the projectCommands.ts facade with ${targetPath}`);
  }

  const browserRoot = "src/editor/browser";
  if (isWithin(sourcePath, browserRoot)) {
    const forbiddenRoots = [
      "src/editor/app",
      "src/editor/components",
      "src/editor/panels",
      "src/editor/projectCommands",
      "src/editor/scenarioSeed",
      "src/editor/workbench"
    ];
    const forbidden = forbiddenRoots.find((root) => isWithin(targetPath, root));
    if (forbidden) failures.push(`${sourcePath} imports editor workflow owner ${targetPath}`);
  }

  return failures;
}

async function collectProductionSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectProductionSources(absolute));
      continue;
    }
    const extension = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extension) || entry.name.includes(".test.")) continue;
    files.push(normalizePath(path.relative(ROOT, absolute)));
  }
  return files;
}

async function requireTokens(filePath, tokens) {
  const source = await readFile(path.join(ROOT, filePath), "utf8");
  return tokens
    .filter((token) => !source.includes(token))
    .map((token) => `${filePath} no longer exposes required contract: ${token}`);
}

async function checkStableFacades() {
  const failures = [];
  failures.push(...await requireTokens("src/editor/scenarioSeed.ts", [
    "export * from \"./scenarioSeed/contracts\"",
    "export { parseScenarioSeed }",
    "export function createProjectFromScenarioSeed"
  ]));
  failures.push(...await requireTokens("src/editor/projectCommands.ts", [
    "export function applyProjectCommand",
    "export function projectCommandLabel",
    "export function projectCommandChangeCount"
  ]));
  failures.push(...await requireTokens("src-tauri/src/realmz.rs", [
    "mod action_points;",
    "mod assembly;",
    "mod combat;",
    "mod economy;",
    "mod encounters;",
    "mod landlooks;",
    "mod maps;",
    "mod rules;",
    "mod scenario;",
    "mod text_records;",
    "pub use action_points::",
    "pub use assembly::",
    "pub use combat::",
    "pub use economy::",
    "pub use encounters::",
    "pub use landlooks::",
    "pub use maps::",
    "pub use rules::",
    "pub use scenario::",
    "pub use text_records::"
  ]));
  failures.push(...await requireTokens("src-tauri/src/commands.rs", [
    "export_project as export_project_impl",
    "pub fn export_project(",
    "export_project_impl("
  ]));
  failures.push(...await requireTokens("docs/codebase-stabilization-baseline.md", [
    "Authoritative Architecture Contract",
    "`src/editor/scenarioSeed.ts`",
    "`src/editor/projectCommands.ts`",
    "`src-tauri/src/realmz.rs`",
    "`src-tauri/src/commands.rs` -> `src-tauri/src/exporter.rs`",
    "`npm run check:architecture`"
  ]));
  return failures;
}

function runSelfTest() {
  assert.equal(evaluateBoundary(
    "src/editor/panels/scripts/example.ts",
    "src/editor/panels/combat/example"
  ).length, 1);
  assert.deepEqual(evaluateBoundary(
    "src/editor/panels/combat/BattleWorkbench.tsx",
    "src/editor/panels/scripts/scriptActionCatalog"
  ), []);
  assert.equal(evaluateBoundary(
    "src/editor/app/example.ts",
    "src/editor/scenarioSeed/parser"
  ).length, 1);
  assert.equal(evaluateBoundary(
    "src/editor/app/example.ts",
    "src/editor/projectCommands/mapCommands"
  ).length, 1);
  assert.deepEqual(evaluateBoundary(
    "src/editor/scenarioSeed/coreRecordCompiler.ts",
    "src/editor/projectCommands/targetRecordCommands"
  ), []);
  assert.equal(evaluateBoundary(
    "src/editor/browser/project.ts",
    "src/editor/panels/MapsPanel"
  ).length, 1);
  assert.deepEqual(evaluateBoundary(
    "src/editor/scenarioSeed/projectCompiler.ts",
    "src/editor/browser/project"
  ), []);
  assert.deepEqual(evaluateBoundary(
    "src/editor/panels/scripts/example.ts",
    "src/editor/types"
  ), []);
  assert.deepEqual(importTargets('import type { Project } from "./types"; export { x } from "./x";'), [
    "./types",
    "./x"
  ]);
  console.log("Architecture boundary self-test passed (forbidden imports are rejected)." );
}

async function runArchitectureCheck() {
  const files = await collectProductionSources(path.join(ROOT, EDITOR_ROOT));
  const failures = [];
  let relativeImports = 0;

  for (const sourcePath of files) {
    const source = await readFile(path.join(ROOT, sourcePath), "utf8");
    for (const target of importTargets(source)) {
      const targetPath = resolveImport(sourcePath, target);
      if (!targetPath) continue;
      relativeImports += 1;
      failures.push(...evaluateBoundary(sourcePath, targetPath));
    }
  }

  failures.push(...await checkStableFacades());
  if (failures.length > 0) {
    process.stderr.write("Architecture boundary check failed:\n");
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`Architecture boundary check passed (${files.length} production modules, ${relativeImports} relative imports).`);
}

if (process.argv.includes("--self-test")) runSelfTest();
else await runArchitectureCheck();
