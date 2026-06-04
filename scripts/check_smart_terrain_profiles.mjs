import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const corpusPath = path.join(repoRoot, "docs/generated/smart-terrain-corpus.json");
const generatedPath = path.join(repoRoot, "src/editor/map/generatedSmartTerrainProfiles.ts");

const corpus = readJson(corpusPath);
const generatedText = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, "utf8") : "";

const failures = [];
check(corpus.selectedScenarios?.length >= 20, "corpus includes authored scenario set");
check(!corpus.selectedScenarios?.some((scenario) => scenario.name === "New Scenario" || scenario.name === "Test"), "templates are excluded");
check(corpus.summary?.landMaps >= 200, "corpus parsed expected land map volume");
check(corpus.summary?.landlooks?.["0"] >= 1, "plains landlook maps are present");

const profiles = corpus.profiles ?? [];
const plains = profiles.find((profile) => profile.landlook === 0);
check(Boolean(plains), "landlook 0 profile exists");
check(plains?.presets?.mountains?.center?.[0] === 61, "plains mountains learn solid tile 61");
check(plains?.presets?.water?.center?.includes(60), "plains water centers include tile 60");
check(plains?.presets?.forest?.center?.[0] === 121, "plains forest centers use tile 121");
check(!plains?.presets?.forest?.family?.some((tile) => tile >= 150 && tile <= 154), "forest family excludes tree detail 150-154");
check(Object.keys(plains?.presets?.water?.maskCandidates ?? {}).length > 0, "water mask candidates generated");
check(generatedText.includes("GENERATED_SMART_TERRAIN_PROFILES"), "generated TS profile file exists");

if (failures.length > 0) {
  console.error("Smart terrain profile checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Smart terrain profile checks passed.");

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Missing ${path.relative(repoRoot, filePath)}. Run npm run archaeology:smart-terrain first.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
