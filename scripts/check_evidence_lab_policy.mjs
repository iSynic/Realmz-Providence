import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const evidenceLab = fs.readFileSync(path.join(root, "docs", "evidence-lab.md"), "utf8");
const fixtureReadme = fs.readFileSync(path.join(root, "fixtures", "divinity-write-fixtures", "README.md"), "utf8");
const fixtureWorkflow = fs.readFileSync(path.join(root, "scripts", "divinity_fixture_workflow.mjs"), "utf8");

const failures = [];

for (const snippet of [
  "## Eligibility Gate",
  "Behavior to prove",
  "Scenario or tool used",
  "Providence decision unlocked",
  "Evidence confidence target",
  "Opcode 84 legacy registration compatibility",
  "Opcode 7 action-code replacement",
  "Timed Encounter `Data TD3` reserved fields",
  "Recognized scenario continuity facts",
  "Evidence Lab output is developer-facing",
  "Do not commit proprietary scenario folders",
  "raw `before/`, `after/`, `*.snapshot.json`, and `diff.json` files"
]) {
  assert(evidenceLab.includes(snippet), `docs/evidence-lab.md is missing policy text: ${snippet}`);
}

for (const snippet of [
  "exact behavior to prove",
  "scenario/tool used",
  "Providence decision it unlocks",
  "--behavior",
  "--scenario-tool",
  "--decision"
]) {
  assert(fixtureReadme.includes(snippet), `fixtures README is missing fixture gate text: ${snippet}`);
}

for (const snippet of [
  "behaviorToProve",
  "scenarioOrTool",
  "providenceDecision",
  "## Evidence Gate",
  "--behavior",
  "--scenario-tool",
  "--decision"
]) {
  assert(fixtureWorkflow.includes(snippet), `fixture workflow is missing evidence gate support: ${snippet}`);
}

if (failures.length > 0) {
  console.error("Evidence Lab policy check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Evidence Lab policy check passed.");

function assert(condition, message) {
  if (!condition) failures.push(message);
}
