import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "fixtures", "scenario-seeds");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const { buildSync } = requireFromRoot("esbuild");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "providence-generation-smoke-"));
const failures = [];
const summaries = [];
const fixedOptions = { now: "2026-07-11T00:00:00.000Z", appVersion: "generation-smoke" };

try {
  buildSync({
    entryPoints: {
      seed: path.join(root, "src", "editor", "scenarioSeed.ts"),
      report: path.join(root, "src", "editor", "scenarioSeedReport.ts"),
      scenarioPackage: path.join(root, "src", "editor", "browser", "scenarioPackage.ts"),
      zip: path.join(root, "src", "editor", "browser", "zip.ts")
    },
    outdir: tmpDir,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node20",
    logLevel: "silent"
  });
  const requireFromSmoke = createRequire(path.join(tmpDir, "smoke.cjs"));
  const { createProjectFromScenarioSeed } = requireFromSmoke("./seed.js");
  const { createScenarioSeedPreflightOutcome } = requireFromSmoke("./report.js");
  const { createBrowserScenarioPackageZip } = requireFromSmoke("./scenarioPackage.js");
  const { readStoredZip } = requireFromSmoke("./zip.js");

  const starterResult = createProjectFromScenarioSeed({
    schemaVersion: 1,
    scenario: { name: "Generation Smoke Starter" },
    messages: [{ id: 77, text: "Inherited template message." }],
    actionPoints: [{ recordIndex: 8, x: 1, y: 1, steps: [{ kind: "message", message: 77 }] }],
    extraActionPoints: [{ id: 9, steps: [{ kind: "takeGold", amount: 2 }] }]
  }, fixedOptions);
  expect(starterResult.ok, "template setup: starter project should compile");
  const starter = starterResult.ok ? starterResult.project : null;
  if (starter) {
    starter.maps[0].tiles[0] = 222;
    starter.scenario.shell.recLevel = 7;
  }

  const lanes = [
    {
      name: "core-keyed",
      fixture: "minimal-keyed.seed.json",
      expectedWrites: ["Data SD2", "Data LD", "Data RD", "Data DD"],
      inspect: (result) => expect(result.project.triggers.length === 1, "core-keyed: expected one generated Action Point")
    },
    {
      name: "semantic-maps",
      fixture: "map-operations.seed.json",
      expectedWrites: ["Data LD", "Data DL", "Data RD", "Data RDD", "Data DD", "Data DDD"],
      inspect: (result) => {
        expect(result.project.maps.filter((map) => map.levelType === "land").length === 7, "semantic-maps: expected seven land maps");
        expect(result.project.maps.filter((map) => map.levelType === "dungeon").length === 1, "semantic-maps: expected one dungeon map");
      }
    },
    {
      name: "organic-maps",
      fixture: "organic-map.seed.json",
      expectedWrites: ["Data LD", "Data RD", "Data EDCD", "Data DD"],
      inspect: (result) => {
        expect(result.project.maps.length === 2, "organic-maps: expected island and Castle interior maps");
        expect(result.project.triggers.length === 2, "organic-maps: expected linked entry and exit Action Points");
        expect(!result.diagnostics.some((diagnostic) => diagnostic.code === "teleport-destination-action-point"), "organic-maps: expected distinct teleport arrival and exit cells");
      }
    },
    {
      name: "encounters",
      fixture: "complex-encounters.seed.json",
      expectedWrites: ["Data SD2", "Data NI", "Data BD", "Data ED2", "Data TD2", "Data EDCD", "Data DD"],
      inspect: (result) => {
        expect(result.project.complexEncounters.length === 2, "encounters: expected semantic and raw Complex Encounters");
        expect(result.project.thiefEncounters.length === 1, "encounters: expected one Rogue encounter");
      }
    },
    {
      name: "timed-runtime",
      fixture: "timed-encounters.seed.json",
      expectedWrites: ["Data NI", "Data TD3", "Data ED3", "Data EDCD", "Data DD"],
      inspect: (result) => expect(result.project.timedEncounters.length === 1, "timed-runtime: expected one timed encounter")
    },
    {
      name: "rules",
      fixture: "rules-overrides.seed.json",
      expectedWrites: ["Data NI", "Data Race", "Data Caste", "Data DD"],
      inspect: (result) => {
        expect(result.project.raceOverrides.length === 1, "rules: expected one race override");
        expect(result.project.casteOverrides.length === 1, "rules: expected one caste override");
        expect(result.project.spellOverrides.every((record) => record.rawBytes === undefined), "rules: fresh spell overrides should not contain compatibility bytes");
        expect(result.project.raceOverrides[0]?.rawBytes === undefined, "rules: fresh race override should not contain compatibility bytes");
        expect(result.project.casteOverrides[0]?.rawBytes === undefined, "rules: fresh caste override should not contain compatibility bytes");
      },
      inspectPackage: (_packageResult, files) => {
        expect(files.get("Data Race")?.byteLength === 30 * 408, "rules: expected fixed 30-row Data Race output");
        expect(files.get("Data Caste")?.byteLength === 30 * 576, "rules: expected fixed 30-row Data Caste output");
      }
    },
    {
      name: "custom-spells",
      fixture: "spells.seed.json",
      expectedWrites: ["Data Spell", "Data Spell.rsrc"],
      inspect: (result) => {
        expect(result.project.spellOverrides.length === 2, "custom-spells: expected two canonical spell overrides");
      },
      inspectPackage: (_packageResult, files) => {
        expect(files.get("Data Spell")?.byteLength === 105 * 30, "custom-spells: expected fixed 105-row Data Spell output");
        expect((files.get("Data Spell.rsrc")?.byteLength ?? 0) >= 46, "custom-spells: expected a structurally plausible fresh name resource fork");
      }
    },
    {
      name: "monster-library",
      fixture: "monsters.seed.json",
      options: { libraryCatalog: mockMonsterLibraryCatalog() },
      expectedWrites: ["Data SD2", "Data NI", "Data MD", "Data DES", "Data BD", "Data EDCD", "Data DD"],
      inspect: (result) => {
        expect(result.project.monsters.length === 2, "monster-library: expected two scenario monsters");
        expect(result.project.monsterSets.some((set) => set.monsters.length > 0), "monster-library: expected generated monster variants");
      }
    },
    {
      name: "custom-assets",
      fixture: "assets.seed.json",
      options: {
        customAssets: [
          mockCustomAsset("asset:workspace:bell", "picture", "PICT", 42),
          mockCustomAsset("asset:workspace:wight-icon", "icon", "cicn", 42)
        ]
      },
      expectedWrites: ["Data NI", "Data MD", "Data DD"],
      inspect: (result) => expect(result.project.assets.length === 2, "custom-assets: expected two copied Scenario Assets"),
      inspectPackage: (result) => {
        expect(result.report.writtenResources.some((resource) => resource.startsWith("PICT 30000:")), "custom-assets: expected copied PICT 30000 in the scenario resource fork");
        expect(result.report.writtenResources.some((resource) => resource.startsWith("cicn 30126:")), "custom-assets: expected copied cicn 30126 in the scenario resource fork");
      }
    },
    {
      name: "base-template",
      fixture: "base-template.seed.json",
      options: starter ? { baseTemplates: { starter } } : {},
      expectedWrites: ["Data SD2", "Data ED3", "Data EDCD", "Data LD", "Data DD"],
      inspect: (result) => {
        expect(result.allocations.baseTemplate === "starter", "base-template: expected starter allocation provenance");
        expect(result.project.scenario.shell.recLevel === 7, "base-template: expected inherited shell fields");
        expect(result.project.maps[0].tiles[0] === 222, "base-template: expected inherited map content");
      }
    }
  ];

  for (const lane of lanes) {
    try {
      await runLane({
        lane,
        createProjectFromScenarioSeed,
        createScenarioSeedPreflightOutcome,
        createBrowserScenarioPackageZip,
        readStoredZip
      });
    } catch (error) {
      failures.push(`${lane.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error("Scenario generation smoke failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Scenario generation smoke passed (${summaries.length} lanes, ${summaries.reduce((sum, lane) => sum + lane.exports, 0)} package exports).`);
for (const summary of summaries) console.log(`- ${summary.name}: ${summary.maps} map(s), ${summary.actionPoints} Action Point(s), ${summary.exports} export(s)`);

async function runLane({
  lane,
  createProjectFromScenarioSeed,
  createScenarioSeedPreflightOutcome,
  createBrowserScenarioPackageZip,
  readStoredZip
}) {
  const seed = JSON.parse(fs.readFileSync(path.join(fixturesDir, lane.fixture), "utf8"));
  const result = createProjectFromScenarioSeed(seed, { ...fixedOptions, ...(lane.options ?? {}) });
  expect(result.ok, `${lane.name}: Scenario JSON should compile${result.ok ? "" : ` (${result.errors.join("; ")})`}`);
  if (!result.ok) return;

  expect(result.project.validation.ok, `${lane.name}: compiled project validation should pass (${result.project.validation.errors.join("; ")})`);
  lane.inspect?.(result);

  const preflight = createScenarioSeedPreflightOutcome({
    errors: [],
    warnings: result.warnings,
    diagnostics: result.diagnostics,
    allocations: result.allocations
  });
  expect(preflight.ok, `${lane.name}: preflight report should be ready`);
  expect(JSON.parse(preflight.reportJson).reportVersion === 1, `${lane.name}: preflight report should retain its versioned contract`);

  expect(result.project.source.origin === "authored", `${lane.name}: generated project should be explicitly authored`);
  expect(result.project.source.files.length === 0, `${lane.name}: generated project should not need a source-file inventory`);

  let exportCount = 0;
  for (const target of ["windows-realmz-folder", "mac-classic-folder"]) {
    const packageResult = createBrowserScenarioPackageZip(result.project, null, target);
    const files = new Map(readStoredZip(packageResult.zip).map((entry) => [entry.path.split("/").slice(1).join("/"), entry.bytes]));
    expect(packageResult.zip.byteLength > 0, `${lane.name}/${target}: package ZIP should not be empty`);
    expect(packageResult.report.blockedAssets.length === 0, `${lane.name}/${target}: package should not contain blocked assets`);
    for (const name of [result.project.scenario.name, "Scenario", "Scenario.rsrc", "Data CS", "Data LD", "Data DD", "Data NI", "Data Solids"]) {
      expect(files.has(name), `${lane.name}/${target}: package should contain ${name}`);
    }
    expect(packageResult.report.passThroughFiles.length === 0, `${lane.name}/${target}: authored package should not contain compatibility pass-through files`);
    for (const name of lane.expectedWrites) {
      expect(packageResult.report.writtenFiles.includes(name), `${lane.name}/${target}: export report should include authored ${name}`);
      expect((files.get(name)?.byteLength ?? 0) > 0, `${lane.name}/${target}: authored ${name} should not be empty`);
    }
    lane.inspectPackage?.(packageResult, files, target);
    exportCount += 1;
  }

  summaries.push({
    name: lane.name,
    maps: result.project.maps.length,
    actionPoints: result.project.triggers.length,
    exports: exportCount
  });
}

function mockCustomAsset(id, kind, resourceType, resourceId) {
  return {
    id,
    label: "Generation Smoke Asset",
    kind,
    resourceType,
    resourceId,
    fileName: "generation-smoke.bin",
    originalPath: "data:application/octet-stream;base64,AA==",
    previewPath: "data:application/octet-stream;base64,AA==",
    resourcePath: "data:application/octet-stream;base64,AA==",
    mimeType: "application/octet-stream",
    bytes: 1,
    sha256: "generation-smoke",
    width: null,
    height: null,
    durationMs: null,
    sampleRate: null,
    channels: null,
    exportState: "ready",
    libraryScope: "custom-library",
    provenance: "generation smoke fixture",
    linkedEntity: null,
    conversion: null
  };
}

function mockMonsterLibraryCatalog() {
  return {
    schemaVersion: 4,
    importedAt: fixedOptions.now,
    managedPath: "browser://workspace/library",
    sources: [],
    records: [],
    assets: [],
    diagnostics: [],
    summary: { sourceCount: 0, recordCount: 0, entityCount: 1, assetCount: 0, diagnosticCount: 0 },
    entities: [{
      id: "library-entity:fixture:guardian",
      type: "monster-scrapbook-entry",
      label: "Stone Guardian",
      source: "library-source:generation-smoke",
      recordRef: null,
      editState: "editable",
      confidence: "confirmed",
      summary: {
        description: "A reusable stone guardian.",
        monsterRecord: {
          id: 44,
          displayName: "Stone Guardian",
          hitDice: 6,
          agility: 8,
          movementMax: 6,
          armor: 7,
          size: 2,
          attackCount: 1,
          attacks: [[2, 6, 0, 0]],
          iconId: 130,
          stamina: 24,
          staminaMax: 24,
          exp: 350
        }
      }
    }]
  };
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}
