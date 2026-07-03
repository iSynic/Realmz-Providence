import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, "fixtures", "divinity-write-fixtures");
const evidenceCardRoot = path.join(repoRoot, "docs", "evidence-cards");

const [command, id, ...rest] = process.argv.slice(2);
const options = parseOptions(rest);

main();

function main() {
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (!id) fail(`Missing fixture id for '${command}'.`);
  assertSafeId(id);
  switch (command) {
    case "prepare":
      prepareFixture(id, options);
      break;
    case "capture":
      captureFixture(id, options);
      break;
    case "diff":
      diffFixture(id, options);
      break;
    default:
      fail(`Unknown command '${command}'.`);
  }
}

function prepareFixture(fixtureId, opts) {
  const fixtureDir = fixturePath(fixtureId);
  const metadataPath = path.join(fixtureDir, "metadata.json");
  const baseline = opts.baseline ?? opts.source;
  const placeholder = Boolean(opts.placeholder);
  ensureDir(fixtureDir);
  if (!placeholder && !baseline) {
    fail("prepare requires --baseline <scenario-dir>, or --placeholder for a documentation-only fixture.");
  }
  if (baseline) {
    const beforeDir = path.join(fixtureDir, "before");
    copyScenarioDir(baseline, beforeDir, opts.force);
    runSnapshot(beforeDir, path.join(fixtureDir, "before.snapshot.json"), `${fixtureId}: before`);
  }
  const existing = readJsonIfExists(metadataPath) ?? {};
  const metadata = {
    fixtureVersion: 1,
    id: fixtureId,
    title: opts.title ?? existing.title ?? titleFromId(fixtureId),
    status: baseline ? "prepared" : "planned",
    behaviorToProve: opts.behavior ?? existing.behaviorToProve ?? "Name the exact behavior this fixture must prove.",
    scenarioOrTool: opts["scenario-tool"] ?? opts.scenarioTool ?? existing.scenarioOrTool ?? "Name the scenario, synthetic fixture, Divinity screen, or report used.",
    providenceDecision: opts.decision ?? existing.providenceDecision ?? "Name the Providence authoring, validation, export, UI, or preserve-only decision this unlocks.",
    divinityAction: opts.action ?? existing.divinityAction ?? "Describe the exact Divinity edit before capture.",
    source: {
      before: baseline ? "before/" : null,
      after: existing.source?.after ?? null
    },
    outputs: {
      beforeSnapshot: baseline ? "before.snapshot.json" : null,
      afterSnapshot: existing.outputs?.afterSnapshot ?? null,
      diffJson: existing.outputs?.diffJson ?? null,
      diffMarkdown: existing.outputs?.diffMarkdown ?? null,
      evidenceCard: existing.outputs?.evidenceCard ?? null
    },
    notes: existing.notes ?? []
  };
  writeJson(metadataPath, metadata);
  writeFixtureReadme(fixtureDir, metadata);
  console.log(`Prepared ${path.relative(repoRoot, fixtureDir)}`);
}

function captureFixture(fixtureId, opts) {
  const fixtureDir = fixturePath(fixtureId);
  const after = opts.after;
  if (!after) fail("capture requires --after <scenario-dir>.");
  if (!fs.existsSync(fixtureDir)) fail(`Fixture '${fixtureId}' does not exist. Run prepare first.`);
  const afterDir = path.join(fixtureDir, "after");
  copyScenarioDir(after, afterDir, opts.force);
  runSnapshot(afterDir, path.join(fixtureDir, "after.snapshot.json"), `${fixtureId}: after`);
  const metadataPath = path.join(fixtureDir, "metadata.json");
  const metadata = readJsonIfExists(metadataPath) ?? { fixtureVersion: 1, id: fixtureId, title: titleFromId(fixtureId) };
  metadata.status = "captured";
  metadata.source = { ...(metadata.source ?? {}), after: "after/" };
  metadata.outputs = { ...(metadata.outputs ?? {}), afterSnapshot: "after.snapshot.json" };
  writeJson(metadataPath, metadata);
  writeFixtureReadme(fixtureDir, metadata);
  console.log(`Captured after state for ${fixtureId}`);
}

function diffFixture(fixtureId, opts) {
  const fixtureDir = fixturePath(fixtureId);
  const beforeSnapshot = path.join(fixtureDir, "before.snapshot.json");
  const afterSnapshot = path.join(fixtureDir, "after.snapshot.json");
  if (!fs.existsSync(beforeSnapshot)) fail(`Missing ${path.relative(repoRoot, beforeSnapshot)}.`);
  if (!fs.existsSync(afterSnapshot)) fail(`Missing ${path.relative(repoRoot, afterSnapshot)}.`);
  const diffJson = path.join(fixtureDir, "diff.json");
  const diffMarkdown = path.join(fixtureDir, "diff.md");
  const evidenceCard = path.join(evidenceCardRoot, `${fixtureId}.md`);
  runDiff(beforeSnapshot, afterSnapshot, diffJson, diffMarkdown);
  const metadataPath = path.join(fixtureDir, "metadata.json");
  const metadata = readJsonIfExists(metadataPath) ?? { fixtureVersion: 1, id: fixtureId, title: titleFromId(fixtureId) };
  metadata.status = "observed";
  if (Array.isArray(metadata.notes)) {
    metadata.notes = metadata.notes.filter((note) => !String(note).toLowerCase().includes("placeholder only"));
  }
  metadata.outputs = {
    ...(metadata.outputs ?? {}),
    diffJson: "diff.json",
    diffMarkdown: "diff.md",
    evidenceCard: path.relative(fixtureDir, evidenceCard).replaceAll("\\", "/")
  };
  writeJson(metadataPath, metadata);
  ensureDir(evidenceCardRoot);
  writeEvidenceCard(fixtureId, fixtureDir, evidenceCard);
  writeFixtureReadme(fixtureDir, metadata);
  console.log(`Wrote ${path.relative(repoRoot, diffJson)} and ${path.relative(repoRoot, evidenceCard)}`);
}

function runSnapshot(sourceDir, output, label) {
  runCargoExample("canon_scenario_snapshot", [sourceDir, "--out", output, "--label", label]);
}

function runDiff(before, after, output, markdownOutput) {
  runCargoExample("diff_canon_scenarios", [
    "--before",
    before,
    "--after",
    after,
    "--out",
    output,
    "--markdown-out",
    markdownOutput
  ]);
}

function runCargoExample(example, args) {
  const cargoArgs = ["run", "--manifest-path", "src-tauri/Cargo.toml", "--example", example, "--", ...args];
  const cargo = findCargo();
  const result = spawnSync(cargo, cargoArgs, { cwd: repoRoot, stdio: "inherit" });
  if (result.error) {
    fail(`cargo example ${example} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`cargo example ${example} failed with exit code ${result.status}.`);
  }
}

function findCargo() {
  if (process.platform !== "win32") return "cargo";
  const located = spawnSync("where.exe", ["cargo"], { cwd: repoRoot, encoding: "utf8" });
  if (located.status === 0) {
    const first = located.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) return first;
  }
  return "cargo";
}

function copyScenarioDir(source, dest, force) {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
    fail(`Scenario source '${source}' is not a directory.`);
  }
  if (fs.existsSync(dest)) {
    if (!force) fail(`${path.relative(repoRoot, dest)} already exists. Pass --force to replace it.`);
    fs.rmSync(dest, { recursive: true, force: true });
  }
  fs.cpSync(source, dest, { recursive: true });
}

function writeFixtureReadme(fixtureDir, metadata) {
  const lines = [
    `# ${metadata.title}`,
    "",
    `Fixture id: \`${metadata.id}\``,
    "",
    `Status: \`${metadata.status}\``,
    "",
    "## Evidence Gate",
    "",
    `- Behavior to prove: ${metadata.behaviorToProve ?? "Name the exact behavior this fixture must prove."}`,
    `- Scenario/tool used: ${metadata.scenarioOrTool ?? "Name the scenario, synthetic fixture, Divinity screen, or report used."}`,
    `- Providence decision unlocked: ${metadata.providenceDecision ?? "Name the Providence decision this unlocks."}`,
    "",
    "## Divinity Action",
    "",
    metadata.divinityAction ?? "Describe the exact Divinity edit before capture.",
    "",
    "## Manual Workflow",
    "",
    "1. Open the `before/` scenario in Divinity.",
    "2. Perform only the action described above.",
    "3. Save/export the edited scenario outside this repository.",
    "4. Run `npm run archaeology:capture-divinity-fixture -- " +
      `${metadata.id} --after <edited-scenario-dir>` + "`.",
    "5. Run `npm run archaeology:diff-divinity-fixture -- " + `${metadata.id}` + "`.",
    "",
    "Do not commit proprietary scenario folders unless the fixture was intentionally made from synthetic data."
  ];
  fs.writeFileSync(path.join(fixtureDir, "README.md"), `${lines.join("\n")}\n`);
}

function writeEvidenceCard(fixtureId, fixtureDir, output) {
  const metadata = readJsonIfExists(path.join(fixtureDir, "metadata.json")) ?? {};
  const diff = readJsonIfExists(path.join(fixtureDir, "diff.json"));
  const summary = diff?.summary;
  const lines = [
    `# Evidence Card: ${metadata.title ?? titleFromId(fixtureId)}`,
    "",
    `Fixture: \`${fixtureId}\``,
    "",
    `Status: \`${metadata.status ?? "observed"}\``,
    "",
    "## Evidence Gate",
    "",
    `- Behavior to prove: ${metadata.behaviorToProve ?? "Not recorded."}`,
    `- Scenario/tool used: ${metadata.scenarioOrTool ?? "Not recorded."}`,
    `- Providence decision unlocked: ${metadata.providenceDecision ?? "Not recorded."}`,
    "",
    "## Divinity Action",
    "",
    metadata.divinityAction ?? "Not recorded.",
    "",
    "## Snapshot Diff Summary",
    "",
    summary
      ? [
          `- Added files: ${summary.addedFiles}`,
          `- Removed files: ${summary.removedFiles}`,
          `- Changed files: ${summary.changedFiles}`,
          `- Byte ranges: ${summary.byteRanges}`,
          `- Resource changes: +${summary.resourcesAdded} / -${summary.resourcesRemoved} / ~${summary.resourcesChanged}`,
          `- Unexplained changes: ${summary.unexplainedChanges}`
        ].join("\n")
      : "No diff has been captured yet.",
    "",
    ...(Array.isArray(diff?.filesChanged) && diff.filesChanged.length
      ? [
          "## Changed Files",
          "",
          ...diff.filesChanged.flatMap((file) => [
            `- \`${file.name}\`: ${file.byteRanges?.length ?? 0} byte range(s), ${file.decodedFamily ?? "unknown family"}, ${file.explanation}.`
          ]),
          ""
        ]
      : []),
    "## Evidence Files",
    "",
    `- Fixture metadata: \`${path.relative(repoRoot, path.join(fixtureDir, "metadata.json")).replaceAll("\\", "/")}\``,
    `- Snapshot diff JSON: \`${path.relative(repoRoot, path.join(fixtureDir, "diff.json")).replaceAll("\\", "/")}\``,
    `- Snapshot diff Markdown: \`${path.relative(repoRoot, path.join(fixtureDir, "diff.md")).replaceAll("\\", "/")}\``,
    "",
    "## Interpretation",
    "",
    "This card records what Divinity changed. It does not claim Providence can write the same change until a matching writer test exists."
  ];
  fs.writeFileSync(output, `${lines.join("\n")}\n`);
}

function parseOptions(args) {
  const opts = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key === "force" || key === "placeholder") {
      opts[key] = true;
    } else {
      opts[key] = args[index + 1];
      index += 1;
    }
  }
  return opts;
}

function assertSafeId(value) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(value)) {
    fail(`Fixture id '${value}' is not safe. Use letters, numbers, dashes, and underscores.`);
  }
}

function fixturePath(fixtureId) {
  return path.join(fixtureRoot, fixtureId);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function titleFromId(value) {
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printHelp() {
  console.log(`Usage:
  node scripts/divinity_fixture_workflow.mjs prepare <id> --baseline <scenario-dir> [--title "..."] [--action "..."] [--behavior "..."] [--scenario-tool "..."] [--decision "..."] [--force]
  node scripts/divinity_fixture_workflow.mjs prepare <id> --placeholder [--title "..."] [--action "..."] [--behavior "..."] [--scenario-tool "..."] [--decision "..."]
  node scripts/divinity_fixture_workflow.mjs capture <id> --after <scenario-dir> [--force]
  node scripts/divinity_fixture_workflow.mjs diff <id>`);
}
