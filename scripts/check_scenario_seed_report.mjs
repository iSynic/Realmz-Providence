import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const { buildSync } = requireFromRoot("esbuild");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "providence-seed-report-"));

try {
  const modulePath = path.join(tmpDir, "scenarioSeedReport.cjs");
  buildSync({
    entryPoints: [path.join(root, "src", "editor", "scenarioSeedReport.ts")],
    outfile: modulePath,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "silent"
  });
  const requireFromFixture = createRequire(path.join(tmpDir, "fixture.cjs"));
  const { createScenarioSeedPreflightOutcome } = requireFromFixture(modulePath);
  const allocations = blankAllocations();
  allocations.messages.push({ key: "hello", id: 0, explicit: false });
  allocations.maps.push({ key: "start", levelType: "land", index: 0, explicit: true });
  allocations.actionPoints.push({ key: "welcome", id: 0, explicit: false });

  const valid = createScenarioSeedPreflightOutcome({
    errors: [],
    warnings: ["Fixture warning"],
    diagnostics: [],
    allocations
  });
  expect(valid.ok, "valid report should be ready");
  expect(valid.allocationSummary?.total === 3, "valid report should count allocations");
  expect(valid.allocationSummary?.families.map((family) => family.key).join(",") === "maps,messages,actionPoints", "allocation families should use stable display order");
  const validJson = JSON.parse(valid.reportJson);
  expect(validJson.reportVersion === 1, "report version should be 1");
  expect(validJson.scenarioSeedSchemaVersion === 1, "report should identify the seed schema version");
  expect(validJson.allocations.messages[0].key === "hello", "report JSON should preserve allocation entries");

  const invalid = createScenarioSeedPreflightOutcome({
    errors: ["$.scenario.name is required."],
    warnings: [],
    diagnostics: [{ severity: "error", code: "parse-error", message: "$.scenario.name is required." }]
  });
  expect(!invalid.ok, "invalid report should need repair");
  expect(invalid.allocationSummary === null, "invalid parse report should not invent allocations");
  expect(!Object.hasOwn(JSON.parse(invalid.reportJson), "allocations"), "invalid parse report JSON should omit allocations");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("Scenario seed report check passed.");

function blankAllocations() {
  return {
    baseTemplate: "blank",
    messages: [],
    quests: [],
    battles: [],
    monsters: [],
    treasures: [],
    shops: [],
    items: [],
    assets: [],
    simpleEncounters: [],
    complexEncounters: [],
    thiefEncounters: [],
    timedEncounters: [],
    spells: [],
    races: [],
    castes: [],
    actionPoints: [],
    extraActionPoints: [],
    maps: [],
    regions: []
  };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
