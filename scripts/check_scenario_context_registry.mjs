import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const questUsagePath = path.join(repoRoot, "src", "editor", "questUsage.ts");
const scriptsPanelPath = path.join(repoRoot, "src", "editor", "panels", "ScriptsPanel.tsx");
const storyFlagsWorkbenchPath = path.join(repoRoot, "src", "editor", "panels", "scripts", "StoryFlagsWorkbench.tsx");
const questUsage = fs.readFileSync(questUsagePath, "utf8");
const scriptsPanel = [scriptsPanelPath, storyFlagsWorkbenchPath]
  .map((filePath) => fs.readFileSync(filePath, "utf8"))
  .join("\n");
const failures = [];

for (const forbidden of [
  "recognizedQuestContextSources(project)",
  "recognizedQuestThreads(project)",
  "recognizedScenarioContextForProject",
  "Bundled beta note | read-only",
  "recognized-scenario-context"
]) {
  if (questUsage.includes(forbidden) || scriptsPanel.includes(forbidden)) {
    failures.push(`Story Flags still references retired bundled scenario context: ${forbidden}`);
  }
}

for (const required of [
  "project.editorMetadata?.questContextSources ?? []",
  "project.editorMetadata?.questThreads ?? []",
  "Context Notes",
  "Author Note"
]) {
  if (!questUsage.includes(required) && !scriptsPanel.includes(required)) {
    failures.push(`Story Flags author-note path is missing expected source: ${required}`);
  }
}

if (failures.length > 0) {
  console.error("Scenario context retirement check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Scenario context retirement check passed.");
