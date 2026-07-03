import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const repoRoot = process.cwd();
const registryPath = path.join(repoRoot, "src", "editor", "scenarioContextRegistry.ts");
const questUsagePath = path.join(repoRoot, "src", "editor", "questUsage.ts");
const scriptsPanelPath = path.join(repoRoot, "src", "editor", "panels", "ScriptsPanel.tsx");
const source = fs.readFileSync(registryPath, "utf8");
const questUsage = fs.readFileSync(questUsagePath, "utf8");
const scriptsPanel = fs.readFileSync(scriptsPanelPath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true
  },
  fileName: registryPath
}).outputText;

const sandbox = {
  exports: {},
  module: { exports: {} },
  console
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(compiled, sandbox, { filename: registryPath });

const { RECOGNIZED_SCENARIO_CONTEXT_REGISTRY } = sandbox.module.exports;
const failures = [];

assert(Array.isArray(RECOGNIZED_SCENARIO_CONTEXT_REGISTRY), "recognized scenario registry is not an array");

const castle = RECOGNIZED_SCENARIO_CONTEXT_REGISTRY.find((entry) => entry.id === "castle-in-the-clouds");
assert(castle, "Castle in the Clouds registry entry is missing");

if (castle) {
  assert(castle.matchers?.some((matcher) => matcher.test("Castle in the Clouds")), "Castle matcher does not recognize the scenario name");
  assert(castle.aliases?.includes("Castle in the Clouds"), "Castle registry entry should keep data-driven aliases");
  assert((castle.coverageCriteria ?? []).length >= 4, "Castle registry entry should document curated beta coverage criteria");
  assert((castle.coverageCriteria ?? []).some((line) => /set\/test\/clear\/increment\/branch/i.test(line)), "Castle coverage criteria should require raw flag-flow visibility");
  assert((castle.source?.sections ?? []).some((section) => section.id === "coverage-criteria"), "Castle context source should expose coverage criteria as a curated section");
  assert(castle.source?.sections?.length >= 5, "Castle context source should keep the Keto evidence sections");
  assertThreads(castle.threads, [
    ["Keto Allegiances And Gates", [2]],
    ["Find The Real Ketos", [4, 5]],
    ["Ulmac, Ambersair, And Ketonia", [6, 7, 8]]
  ]);
}

assert(questUsage.includes("recognizedQuestContextSources(project)"), "Quest presentation should merge recognized bundled context sources");
assert(questUsage.includes("recognizedQuestThreads(project)"), "Quest presentation should merge recognized bundled context threads");
assert(scriptsPanel.includes("Bundled beta note | read-only"), "Story Flags UI should label bundled context as read-only beta notes");
assert(scriptsPanel.includes("userThreads.filter"), "Story Flags UI should keep bundled notes out of editable author-note actions");

if (failures.length > 0) {
  console.error("Scenario context registry check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Scenario context registry check passed (${RECOGNIZED_SCENARIO_CONTEXT_REGISTRY.length} recognized scenario${RECOGNIZED_SCENARIO_CONTEXT_REGISTRY.length === 1 ? "" : "s"}).`);

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function assertThreads(threads, expected) {
  assert(Array.isArray(threads), "Castle threads are not an array");
  for (const [name, questIds] of expected) {
    const thread = threads?.find((candidate) => candidate.name === name);
    assert(thread, `Castle thread missing: ${name}`);
    if (!thread) continue;
    const actual = JSON.stringify(thread.questIds ?? []);
    const wanted = JSON.stringify(questIds);
    assert(actual === wanted, `Castle thread ${name} should map quest flags ${wanted}, got ${actual}`);
    assert((thread.contextRefs ?? []).length > 0, `Castle thread ${name} should keep context refs`);
  }
}
