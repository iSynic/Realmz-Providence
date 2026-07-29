import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

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
const OWNERSHIP_ROOTS = [
  {
    owner: "scripts-ui",
    roots: ["src/editor/panels/ScriptsPanel", "src/editor/panels/scripts"]
  },
  {
    owner: "combat-ui",
    roots: ["src/editor/panels/CombatPanel", "src/editor/panels/combat"]
  },
  {
    owner: "maps-ui",
    roots: [
      "src/editor/panels/MapsPanel",
      "src/editor/panels/maps",
      "src/editor/components/MapContextSidebar",
      "src/editor/components/maps"
    ]
  },
  {
    owner: "suite-ui",
    roots: [
      "src/editor/panels/SuiteDomainPanel",
      "src/editor/panels/suite",
      "src/editor/panels/economy"
    ]
  },
  {
    owner: "scenario-seed",
    roots: ["src/editor/scenarioSeed"]
  },
  {
    owner: "project-commands",
    roots: ["src/editor/projectCommands"]
  },
  {
    owner: "browser-runtime",
    roots: ["src/editor/browser"]
  }
];
const APPROVED_OWNERSHIP_EDGES = new Set([
  "combat-ui\0browser-runtime",
  "combat-ui\0scripts-ui",
  "scenario-seed\0browser-runtime",
  "scenario-seed\0project-commands",
  "suite-ui\0browser-runtime",
  "suite-ui\0scripts-ui"
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

function ownerForPath(filePath) {
  return OWNERSHIP_ROOTS.find(({ roots }) => roots.some((root) =>
    isWithin(filePath, root) || filePath === `${root}.ts` || filePath === `${root}.tsx`
  ))?.owner ?? null;
}

function evaluateOwnershipCycles(edges) {
  const adjacency = new Map();
  for (const [source, target] of edges) {
    if (source === target) continue;
    if (!adjacency.has(source)) adjacency.set(source, new Set());
    adjacency.get(source).add(target);
    if (!adjacency.has(target)) adjacency.set(target, new Set());
  }

  const indexByOwner = new Map();
  const lowLinkByOwner = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];
  let nextIndex = 0;

  function visit(owner) {
    indexByOwner.set(owner, nextIndex);
    lowLinkByOwner.set(owner, nextIndex);
    nextIndex += 1;
    stack.push(owner);
    onStack.add(owner);

    for (const target of adjacency.get(owner) ?? []) {
      if (!indexByOwner.has(target)) {
        visit(target);
        lowLinkByOwner.set(owner, Math.min(lowLinkByOwner.get(owner), lowLinkByOwner.get(target)));
      } else if (onStack.has(target)) {
        lowLinkByOwner.set(owner, Math.min(lowLinkByOwner.get(owner), indexByOwner.get(target)));
      }
    }

    if (lowLinkByOwner.get(owner) !== indexByOwner.get(owner)) return;
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== owner);
    if (component.length > 1) cycles.push(component.sort());
  }

  for (const owner of [...adjacency.keys()].sort()) {
    if (!indexByOwner.has(owner)) visit(owner);
  }
  return cycles.map((cycle) => `ownership dependency cycle: ${cycle.join(" <-> ")}`);
}

function evaluateOwnershipEdges(edges, approvedEdges = APPROVED_OWNERSHIP_EDGES) {
  return edges
    .filter((edge) => !approvedEdges.has(edge))
    .sort()
    .map((edge) => {
      const [source, target] = edge.split("\0");
      return `unapproved ownership dependency: ${source} -> ${target}`;
    });
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

function evaluateArtifactPolicy(artifactPaths, policy, packageScripts) {
  const failures = [];
  const claims = new Map();

  function claim(output, owner) {
    if (claims.has(output)) {
      failures.push(`${output} is claimed by both ${claims.get(output)} and ${owner}`);
      return;
    }
    claims.set(output, owner);
  }

  for (const family of policy.generatedFamilies ?? []) {
    if (!family.name || !family.command || !Array.isArray(family.outputs) || family.outputs.length === 0) {
      failures.push("Generated artifact family is missing name, command, or outputs");
      continue;
    }
    if (!packageScripts[family.command]) {
      failures.push(`${family.name} references missing package command npm run ${family.command}`);
    }
    for (const output of family.outputs) claim(output, `generated family ${family.name}`);
  }

  for (const output of policy.curatedEvidence ?? []) {
    if (!output.startsWith("docs/generated/")) {
      failures.push(`${output} is curated evidence outside docs/generated`);
    }
    claim(output, "curated evidence");
  }

  const artifacts = new Set(artifactPaths);
  for (const artifact of artifacts) {
    if (!claims.has(artifact)) failures.push(`${artifact} has no generated or curated artifact owner`);
  }
  for (const [output, owner] of claims) {
    if (!artifacts.has(output)) failures.push(`${output} is claimed by ${owner} but does not exist`);
  }
  return failures;
}

async function checkArtifactGeneratorReferences(policy, packageScripts) {
  const failures = [];
  for (const family of policy.generatedFamilies ?? []) {
    const commandSource = packageScripts[family.command];
    if (!commandSource) continue;
    let ownerSource = commandSource;
    const scriptPaths = commandSource.match(/scripts[\\/][^\s"']+\.(?:js|mjs|ts|ps1)/g) ?? [];
    for (const scriptPath of scriptPaths) {
      try {
        ownerSource += `\n${await readFile(path.join(ROOT, scriptPath), "utf8")}`;
      } catch (error) {
        failures.push(`${family.name} cannot read generator ${scriptPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const output of family.outputs ?? []) {
      const outputStem = path.basename(output).replace(/\.(?:json|md|ts)$/, "");
      if (!ownerSource.includes(outputStem)) {
        failures.push(`${family.name} command does not reference output ${output}`);
      }
    }
  }
  return failures;
}

async function checkGeneratedArtifactPolicy() {
  const packageJson = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const policy = JSON.parse(await readFile(path.join(ROOT, "docs/generated-artifact-policy.json"), "utf8"));
  const artifactPaths = execFileSync("git", [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    "docs/generated",
    "src/editor/generated",
    "src/editor/map/generatedSmartTerrainProfiles.ts"
  ], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean).sort();
  return [
    ...evaluateArtifactPolicy(artifactPaths, policy, packageJson.scripts ?? {}),
    ...await checkArtifactGeneratorReferences(policy, packageJson.scripts ?? {})
  ];
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
  failures.push(...await requireTokens("src/editor/components/MapContextSidebar.tsx", [
    "export { MapBrowserSidebar as MapContextSidebar }",
    "export { MapInspectorSidebar as MapSelectionSidebar }",
    "export { LandLayoutEditor }",
    "export { LandTileAtlasEditor }",
    "export { RandomAreasWorkbench }"
  ]));
  failures.push(...await requireTokens("src-tauri/src/realmz.rs", [
    "mod action_points;",
    "mod assembly;",
    "mod battles;",
    "mod combat;",
    "mod economy;",
    "mod encounters;",
    "mod landlooks;",
    "mod maps;",
    "mod messages;",
    "mod option_labels;",
    "mod rules;",
    "mod scenario;",
    "pub use action_points::",
    "pub use assembly::",
    "pub use battles::",
    "pub use combat::",
    "pub use economy::",
    "pub use encounters::",
    "pub use landlooks::",
    "pub use maps::",
    "pub use messages::",
    "pub use option_labels::",
    "pub use rules::",
    "pub use scenario::"
  ]));
  failures.push(...await requireTokens("src-tauri/src/commands.rs", [
    "export_project as export_project_impl",
    "pub fn export_project(",
    "export_project_impl("
  ]));
  failures.push(...await requireTokens("docs/codebase-stabilization-baseline.md", [
    "providence-architecture-contract",
    "Authoritative Architecture Contract",
    "`docs/generated-artifact-policy.json`",
    "`src/editor/scenarioSeed.ts`",
    "`src/editor/projectCommands.ts`",
    "`src-tauri/src/realmz.rs`",
    "`src-tauri/src/commands.rs` -> `src-tauri/src/exporter.rs`",
    "`npm run check:architecture`"
  ]));
  failures.push(...await requireTokens("README.md", [
    "docs/codebase-stabilization-baseline.md"
  ]));
  failures.push(...await requireTokens("docs/release-checklist.md", [
    "docs/codebase-stabilization-baseline.md"
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
  assert.deepEqual(evaluateArtifactPolicy(
    ["docs/generated/report.json", "docs/generated/evidence.json"],
    {
      generatedFamilies: [{ name: "Report", command: "archaeology:report", outputs: ["docs/generated/report.json"] }],
      curatedEvidence: ["docs/generated/evidence.json"]
    },
    { "archaeology:report": "node scripts/report.mjs" }
  ), []);
  assert.match(evaluateArtifactPolicy(
    ["docs/generated/unowned.json"],
    { generatedFamilies: [], curatedEvidence: [] },
    {}
  )[0] ?? "", /no generated or curated artifact owner/);
  assert.deepEqual(evaluateOwnershipCycles([
    ["scripts-ui", "project-commands"],
    ["project-commands", "browser-runtime"]
  ]), []);
  assert.match(evaluateOwnershipCycles([
    ["scripts-ui", "project-commands"],
    ["project-commands", "scripts-ui"]
  ])[0] ?? "", /ownership dependency cycle/);
  assert.deepEqual(evaluateOwnershipEdges(["scripts-ui\0project-commands"], new Set([
    "scripts-ui\0project-commands"
  ])), []);
  assert.match(evaluateOwnershipEdges([
    "maps-ui\0combat-ui"
  ], new Set())[0] ?? "", /unapproved ownership dependency/);
  console.log("Architecture boundary self-test passed (boundary, ownership-cycle, and artifact violations are rejected)." );
}

async function runArchitectureCheck() {
  const files = await collectProductionSources(path.join(ROOT, EDITOR_ROOT));
  const failures = [];
  const ownershipEdges = new Set();
  const ownershipEdgeSources = new Map();
  let relativeImports = 0;

  for (const sourcePath of files) {
    const source = await readFile(path.join(ROOT, sourcePath), "utf8");
    for (const target of importTargets(source)) {
      const targetPath = resolveImport(sourcePath, target);
      if (!targetPath) continue;
      relativeImports += 1;
      failures.push(...evaluateBoundary(sourcePath, targetPath));
      const sourceOwner = ownerForPath(sourcePath);
      const targetOwner = ownerForPath(targetPath);
      if (sourceOwner && targetOwner && sourceOwner !== targetOwner) {
        const edge = `${sourceOwner}\0${targetOwner}`;
        ownershipEdges.add(edge);
        if (!ownershipEdgeSources.has(edge)) ownershipEdgeSources.set(edge, new Set());
        ownershipEdgeSources.get(edge).add(`${sourcePath} -> ${targetPath}`);
      }
    }
  }

  failures.push(...evaluateOwnershipEdges([...ownershipEdges]));
  failures.push(...evaluateOwnershipCycles([...ownershipEdges].map((edge) => edge.split("\0"))));
  failures.push(...await checkStableFacades());
  failures.push(...await checkGeneratedArtifactPolicy());
  if (failures.length > 0) {
    process.stderr.write("Architecture boundary check failed:\n");
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`Architecture boundary check passed (${files.length} production modules, ${relativeImports} relative imports, ${ownershipEdges.size} ownership edges).`);
  if (process.argv.includes("--report")) {
    console.log("Ownership edges:");
    for (const edge of [...ownershipEdges].sort()) {
      const [source, target] = edge.split("\0");
      console.log(`- ${source} -> ${target}`);
      for (const sourceImport of [...(ownershipEdgeSources.get(edge) ?? [])].sort()) {
        console.log(`  ${sourceImport}`);
      }
    }
  }
}

if (process.argv.includes("--self-test")) runSelfTest();
else await runArchitectureCheck();
