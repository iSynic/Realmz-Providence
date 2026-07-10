import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const corpusPath = path.join(repoRoot, "docs/generated/smart-terrain-corpus.json");
const generatedPath = path.join(repoRoot, "src/editor/map/generatedSmartTerrainProfiles.ts");
const reviewPath = path.join(repoRoot, "docs/generated/smart-terrain-review.json");
const reviewReportPath = path.join(repoRoot, "docs/generated/smart-terrain-review.md");

const corpus = readJson(corpusPath);
const review = readJson(reviewPath);
const generatedText = fs.existsSync(generatedPath) ? fs.readFileSync(generatedPath, "utf8") : "";

const failures = [];
check(corpus.selectedScenarios?.length >= 20, "corpus includes authored scenario set");
check(!corpus.selectedScenarios?.some((scenario) => scenario.name === "New Scenario" || scenario.name === "Test"), "templates are excluded");
check(corpus.summary?.landMaps >= 200, "corpus parsed expected land map volume");
check(corpus.summary?.landlooks?.["0"] >= 1, "plains landlook maps are present");

const profiles = corpus.profiles ?? [];
const plains = profiles.find((profile) => profile.landlook === 0);
const subterranean = profiles.find((profile) => profile.landlook === 3);
check(Boolean(plains), "landlook 0 profile exists");
check(Boolean(subterranean), "landlook 3 profile exists");
check(plains?.presets?.mountains?.center?.[0] === 61, "plains mountains learn solid tile 61");
check(plains?.presets?.water?.center?.includes(60), "plains water centers include tile 60");
check([105, 106, 107, 108, 109, 110, 111, 112].every((tile) => plains?.presets?.water?.excluded?.includes(tile) && !plains?.presets?.water?.family?.includes(tile)), "reviewed cave transitions are excluded from generic Plains water");
check([36, 37, 52, 53, 54, 55, 56, 57, 58, 59].every((tile) => plains?.presets?.water?.excluded?.includes(tile) && !plains?.presets?.water?.family?.includes(tile)), "reviewed non-water and special tiles are excluded from generic Plains water");
check(plains?.presets?.water?.detail?.join(",") === "33,34,35" && plains?.presets?.water?.center?.join(",") === "60", "reviewed decorative water details and full-water center are preserved");
check(plains?.presets?.water?.curatedMasks?.["5"]?.[0] === 38 && plains?.presets?.water?.curatedMasks?.["10"]?.[0] === 39, "reviewed straight narrow-stream masks are preserved");
check(plains?.presets?.water?.curatedMasks?.["7"]?.[0] === 45 && plains?.presets?.water?.curatedMasks?.["14"]?.[0] === 46, "reviewed trifork narrow-stream masks are preserved");
check(plains?.presets?.water?.curatedMasks?.["6"]?.[0] === 48 && plains?.presets?.water?.curatedMasks?.["9"]?.[0] === 51, "reviewed narrow-stream bend masks are preserved");
check(plains?.presets?.water?.curatedRoles?.west?.[0] === 1 && plains?.presets?.water?.curatedRoles?.east?.[0] === 2, "reviewed west/east shoreline edges are preserved");
check(plains?.presets?.water?.curatedRoles?.north?.[0] === 3 && plains?.presets?.water?.curatedRoles?.south?.[0] === 4, "reviewed north/south shoreline edges are preserved");
check(plains?.presets?.water?.curatedRoles?.southWest?.join(",") === "5,6,19,20" && plains?.presets?.water?.curatedRoles?.northEast?.join(",") === "11,12,13,14", "reviewed diagonal shoreline variants are preserved");
check(plains?.presets?.water?.curatedMasks?.["149"]?.[0] === 21 && plains?.presets?.water?.curatedMasks?.["101"]?.[0] === 24, "reviewed broad-water to narrow-stream transitions are preserved");
check(plains?.presets?.water?.curatedMasks?.["38"]?.[0] === 25 && plains?.presets?.water?.curatedMasks?.["137"]?.[0] === 28, "reviewed quarter-water corners are preserved");
check(plains?.presets?.water?.curatedMasks?.["239"]?.[0] === 29 && plains?.presets?.water?.curatedMasks?.["191"]?.[0] === 32, "reviewed inward land corners are preserved");
check(plains?.presets?.forest?.center?.[0] === 121, "plains forest centers use tile 121");
check(plains?.presets?.forest?.curatedRoles?.north?.[0] === 127, "plains forest north edge uses the reviewed tile 127");
check(plains?.presets?.forest?.curatedRoles?.west?.[0] === 128 && plains?.presets?.forest?.curatedRoles?.east?.[0] === 129, "plains forest reviewed west/east edge decision is preserved");
check(plains?.presets?.mountains?.curatedRoles?.southEast?.join(",") === "62,63,64", "plains mountain southeast corner variants are preserved");
check(plains?.presets?.mountains?.curatedRoles?.northWest?.join(",") === "65,66,67", "plains mountain northwest corner variants are preserved");
check(plains?.presets?.mountains?.curatedRoles?.southWest?.join(",") === "68,69,70", "plains mountain southwest corner variants are preserved");
check(plains?.presets?.mountains?.curatedRoles?.northEast?.join(",") === "71,72,73", "plains mountain northeast corner variants are preserved");
check(plains?.presets?.mountains?.curatedRoles?.east?.join(",") === "74,75,76" && plains?.presets?.mountains?.curatedRoles?.west?.join(",") === "77,78,79", "plains mountain east/west edge variants are preserved");
check(plains?.presets?.mountains?.curatedRoles?.south?.join(",") === "80,81,82" && plains?.presets?.mountains?.curatedRoles?.north?.join(",") === "83,84,85", "plains mountain north/south edge variants are preserved");
check(plains?.presets?.mountains?.curatedWaterRoles?.northWest?.[0] === 86 && plains?.presets?.mountains?.curatedWaterRoles?.northEast?.[0] === 87, "plains mountain north water corners are preserved");
check(plains?.presets?.mountains?.curatedWaterRoles?.southWest?.[0] === 88 && plains?.presets?.mountains?.curatedWaterRoles?.southEast?.[0] === 89, "plains mountain south water corners are preserved");
check(plains?.presets?.mountains?.curatedWaterRoles?.west?.[0] === 90 && plains?.presets?.mountains?.curatedWaterRoles?.east?.[0] === 91, "plains mountain east/west water edges are preserved");
check(plains?.presets?.mountains?.curatedWaterRoles?.north?.[0] === 92 && plains?.presets?.mountains?.curatedWaterRoles?.south?.[0] === 93, "plains mountain north/south water edges are preserved");
check(subterranean?.presets?.forest?.curatedRoles?.west?.[0] === 128 && subterranean?.presets?.forest?.curatedRoles?.east?.[0] === 129, "Subterranean inherits reviewed forest topology");
check(subterranean?.presets?.mountains?.curatedRoles?.southEast?.join(",") === "62,63,64" && subterranean?.presets?.mountains?.curatedWaterRoles?.northWest?.[0] === 86, "Subterranean inherits reviewed wall-to-floor and wall-to-water topology");
check(subterranean?.presets?.water?.curatedMasks?.["5"]?.[0] === 38 && subterranean?.presets?.water?.curatedMasks?.["149"]?.[0] === 21, "Subterranean inherits reviewed water and narrow-stream topology");
check(!plains?.presets?.forest?.family?.some((tile) => tile >= 150 && tile <= 154), "forest family excludes tree detail 150-154");
check(Object.keys(plains?.presets?.water?.maskCandidates ?? {}).length > 0, "water mask candidates generated");
check(generatedText.includes("GENERATED_SMART_TERRAIN_PROFILES"), "generated TS profile file exists");
check(corpus.schemaVersion >= 2, "corpus schema includes review metadata");
check(review.schemaVersion === 1, "terrain review queue schema is current");
check(review.summary?.items >= 100, "terrain review queue includes per-tile decisions");
check(review.summary?.requiringReview >= 1, "terrain review queue identifies human decisions");
check(review.firstReviewBatch?.length === 48, "terrain review queue provides a bounded first curation batch");
check(review.firstReviewBatch?.every((item) => [0, 2, 3, 4, 5, 9, 10].includes(item.landlook)), "first curation batch is limited to standard landlooks");
check(!review.firstReviewBatch?.some((item) => item.landlook === 0 && item.terrain === "forest"), "human-reviewed Plains forest roles leave the pending review batch");
check(!review.firstReviewBatch?.some((item) => item.landlook === 0 && item.terrain === "mountains"), "human-reviewed Plains mountain roles leave the pending review batch");
check(!review.firstReviewBatch?.some((item) => item.landlook === 0 && item.terrain === "water" && item.tile >= 105 && item.tile <= 112), "reviewed cave transitions leave the pending water batch");
check(!review.firstReviewBatch?.some((item) => item.landlook === 0 && item.terrain === "water" && item.tile >= 33), "reviewed Plains water details, channels, props, and center leave the pending batch");
check(!review.firstReviewBatch?.some((item) => item.landlook === 0 && item.terrain === "water"), "fully reviewed Plains water leaves the pending batch");
check(!review.firstReviewBatch?.some((item) => item.landlook === 3), "fully inherited Subterranean topology leaves the pending batch");
check(fs.existsSync(reviewReportPath) && fs.readFileSync(reviewReportPath, "utf8").includes("Decision: pending"), "human-readable first curation batch exists");
check(review.items?.some((item) => item.landlook === 0 && item.terrain === "water" && item.tile === 60), "review queue includes plains water fill evidence");
check(review.items?.every((item) => item.neighbors?.north && item.neighbors?.east && item.neighbors?.south && item.neighbors?.west), "review items include directional neighbor evidence");
check(review.firstReviewBatch?.some((item) => item.examples?.some((example) => example.context?.length === 5 && example.context.every((row) => row.length === 5))), "first review batch includes representative 5x5 contexts");

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
