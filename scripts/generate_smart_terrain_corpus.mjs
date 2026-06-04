import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const SCENARIO_ROOTS = [
  { id: "base", path: "F:/Realmz/base/Realmz/Scenarios", priority: 1 },
  { id: "out_win_clang", path: "F:/Realmz/out_win_clang/Scenarios", priority: 2 }
];
const EXCLUDED_NAMES = new Set(["New Scenario", "Test"]);
const STANDARD_LANDLOOKS = [0, 2, 3, 4, 5, 9, 10];
const CUSTOM_LANDLOOKS = [6, 7, 8];
const MAP_SIZE = 90;
const FIELD_BYTES = MAP_SIZE * MAP_SIZE * 2;
const RANDLEVEL_BYTES = 644;
const LANDLOOK_OFFSET = 520;
const MIN_MASK_SAMPLES = 8;
const MIN_ROLE_SAMPLES = 12;
const MAX_TILE_CANDIDATES = 8;
const MAX_ROLE_CANDIDATES = 10;
const MAX_REPORT_MASKS = 12;

const TERRAIN_PRESETS = {
  water: {
    label: "Water",
    family: [...range(1, 60), ...range(105, 112)],
    centerFallback: [60, 40, 35, 34, 33],
    candidatesFallback: [...range(1, 32), ...range(38, 51)].filter((tile) => tile !== 22),
    fallbackRoles: {
      center: 60,
      single: 60,
      north: 3,
      south: 31,
      east: 2,
      west: 42,
      northEast: 4,
      northWest: 1,
      southEast: 24,
      southWest: 21,
      lineHorizontal: 43,
      lineVertical: 42,
      capNorth: 4,
      capSouth: 3,
      capEast: 1,
      capWest: 2,
      notchNorthEast: 28,
      notchNorthWest: 27,
      notchSouthEast: 49,
      notchSouthWest: 48
    }
  },
  mountains: {
    label: "Mountains",
    family: [...range(61, 85), ...range(86, 93)],
    centerFallback: [61],
    candidatesFallback: [...range(61, 85), ...range(86, 93)],
    fallbackRoles: {
      center: 61,
      single: 61,
      north: 83,
      south: 63,
      east: 62,
      west: 80,
      northEast: 84,
      northWest: 81,
      southEast: 64,
      southWest: 72,
      lineHorizontal: 83,
      lineVertical: 62,
      notchNorthEast: 70,
      notchNorthWest: 69,
      notchSouthEast: 73,
      notchSouthWest: 72
    }
  },
  forest: {
    label: "Forest",
    family: range(121, 129),
    excludedDetail: range(150, 154),
    centerFallback: [121],
    candidatesFallback: range(121, 129),
    fallbackRoles: {
      center: 121,
      single: 121,
      north: 126,
      south: 127,
      east: 128,
      west: 129,
      northEast: 125,
      northWest: 124,
      southEast: 123,
      southWest: 122,
      lineHorizontal: 128,
      lineVertical: 126,
      capNorth: 126,
      capSouth: 127,
      capEast: 128,
      capWest: 129,
      notchNorthEast: 125,
      notchNorthWest: 124,
      notchSouthEast: 123,
      notchSouthWest: 122
    }
  }
};

const corpus = discoverScenarioCorpus();
const aggregate = analyzeCorpus(corpus.selected);
const generatedProfiles = buildGeneratedProfiles(aggregate);

writeJson(path.join(repoRoot, "docs/generated/smart-terrain-corpus.json"), {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scenarioRoots: SCENARIO_ROOTS.map((root) => root.path),
  exclusions: [...EXCLUDED_NAMES],
  selectedScenarios: corpus.selected.map((scenario) => ({
    name: scenario.name,
    sourceRoot: scenario.sourceRoot,
    sourcePath: normalizePath(scenario.path),
    duplicateCandidates: scenario.duplicates.map((duplicate) => ({
      sourceRoot: duplicate.sourceRoot,
      sourcePath: normalizePath(duplicate.path)
    }))
  })),
  skippedScenarios: corpus.skipped,
  summary: aggregate.summary,
  profiles: generatedProfiles
});
writeGeneratedProfiles(generatedProfiles);
writeReport(corpus, aggregate, generatedProfiles);

console.log(`Analyzed ${corpus.selected.length} authored scenario(s).`);
console.log(`Wrote ${path.relative(repoRoot, path.join(repoRoot, "src/editor/map/generatedSmartTerrainProfiles.ts"))}`);
console.log(`Wrote ${path.relative(repoRoot, path.join(repoRoot, "docs/generated/smart-terrain-corpus-report.md"))}`);

function discoverScenarioCorpus() {
  const byName = new Map();
  const skipped = [];
  for (const root of SCENARIO_ROOTS) {
    if (!fs.existsSync(root.path)) {
      skipped.push({ sourceRoot: root.id, sourcePath: normalizePath(root.path), reason: "scenario root missing" });
      continue;
    }
    for (const name of fs.readdirSync(root.path)) {
      const scenarioPath = path.join(root.path, name);
      if (!fs.statSync(scenarioPath).isDirectory()) continue;
      if (EXCLUDED_NAMES.has(name) || /\bbefore-|\d{4}-\d{2}-\d{2}T/i.test(name)) {
        skipped.push({ name, sourceRoot: root.id, sourcePath: normalizePath(scenarioPath), reason: "template or backup folder" });
        continue;
      }
      const dataLd = path.join(scenarioPath, "Data LD");
      const dataRd = path.join(scenarioPath, "Data RD");
      if (!fs.existsSync(dataLd) || !fs.existsSync(dataRd)) {
        skipped.push({ name, sourceRoot: root.id, sourcePath: normalizePath(scenarioPath), reason: "missing Data LD or Data RD" });
        continue;
      }
      const entry = { name, sourceRoot: root.id, rootPriority: root.priority, path: scenarioPath, duplicates: [] };
      const key = name.toLocaleLowerCase();
      const existing = byName.get(key);
      if (!existing || entry.rootPriority > existing.rootPriority) {
        if (existing) entry.duplicates.push(existing, ...existing.duplicates);
        byName.set(key, entry);
      } else {
        existing.duplicates.push(entry);
      }
    }
  }
  return {
    selected: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)),
    skipped
  };
}

function analyzeCorpus(scenarios) {
  const profileStats = new Map();
  const summary = {
    scenarios: scenarios.length,
    landMaps: 0,
    standardLandMaps: 0,
    customLandMaps: 0,
    landlooks: {},
    presets: {}
  };

  for (const scenario of scenarios) {
    const dataLd = fs.readFileSync(path.join(scenario.path, "Data LD"));
    const dataRd = fs.readFileSync(path.join(scenario.path, "Data RD"));
    const mapCount = Math.min(Math.floor(dataLd.length / FIELD_BYTES), Math.floor(dataRd.length / RANDLEVEL_BYTES));
    for (let mapIndex = 0; mapIndex < mapCount; mapIndex += 1) {
      const landlook = dataRd.readInt8(mapIndex * RANDLEVEL_BYTES + LANDLOOK_OFFSET);
      summary.landMaps += 1;
      if (STANDARD_LANDLOOKS.includes(landlook)) summary.standardLandMaps += 1;
      if (CUSTOM_LANDLOOKS.includes(landlook)) summary.customLandMaps += 1;
      summary.landlooks[landlook] = (summary.landlooks[landlook] ?? 0) + 1;

      const tiles = readLandMap(dataLd, mapIndex);
      for (const [presetId, preset] of Object.entries(TERRAIN_PRESETS)) {
        const family = new Set(preset.family);
        const detail = new Set(preset.excludedDetail ?? []);
        const profile = ensureProfileStats(profileStats, landlook, presetId);
        for (let y = 0; y < MAP_SIZE; y += 1) {
          for (let x = 0; x < MAP_SIZE; x += 1) {
            const rawTile = tiles[y * MAP_SIZE + x];
            const tile = normalizeMapTile(rawTile);
            if (detail.has(tile)) {
              profile.excludedDetail[tile] = (profile.excludedDetail[tile] ?? 0) + 1;
              continue;
            }
            if (!family.has(tile)) continue;
            const context = shapeContextForMap(tiles, x, y, family);
            const mask = maskFromContext(context);
            const role = roleFromContext(context);
            const interiorDistance = distanceToOutside(tiles, x, y, family);
            const edgeKind = interiorDistance >= 2 ? "deep-interior" : mask === 255 ? "near-interior" : "boundary";
            const mapRef = `${scenario.name}:land:${mapIndex}:${x},${y}`;
            increment(profile.tiles, tile);
            increment(profile.roles[role] ??= {}, tile);
            increment(profile.masks[mask] ??= {}, tile);
            profile.samples += 1;
            if (edgeKind === "deep-interior") increment(profile.deepInterior, tile);
            else if (edgeKind === "near-interior") increment(profile.nearInterior, tile);
            else increment(profile.boundary, tile);
            if (profile.examples.length < 60) profile.examples.push({ tile, mask, role, landlook, mapRef });
            summary.presets[presetId] = (summary.presets[presetId] ?? 0) + 1;
          }
        }
      }
    }
  }
  return {
    summary,
    profiles: profileStats
  };
}

function buildGeneratedProfiles(aggregate) {
  const profiles = [];
  for (const landlook of STANDARD_LANDLOOKS) {
    const presets = {};
    for (const [presetId, preset] of Object.entries(TERRAIN_PRESETS)) {
      const stats = aggregate.profiles.get(profileKey(landlook, presetId));
      const center = centerCandidatesFor(presetId, stats, preset);
      const maskCandidates = {};
      const roleCandidates = {};
      if (stats) {
        for (const [mask, counts] of Object.entries(stats.masks)) {
          const samples = countTotal(counts);
          if (samples < MIN_MASK_SAMPLES) continue;
          maskCandidates[mask] = {
            tiles: topTiles(counts, MAX_TILE_CANDIDATES, center, presetId),
            samples,
            confidence: confidenceFor(samples)
          };
        }
        for (const [role, counts] of Object.entries(stats.roles)) {
          const samples = countTotal(counts);
          if (samples < MIN_ROLE_SAMPLES) continue;
          roleCandidates[role] = topTiles(counts, MAX_ROLE_CANDIDATES, center, presetId);
        }
      }
      presets[presetId] = {
        family: preset.family,
        center,
        candidates: stats ? topTiles(stats.tiles, MAX_ROLE_CANDIDATES, center, presetId) : preset.candidatesFallback,
        sampleCount: stats?.samples ?? 0,
        confidence: confidenceFor(stats?.samples ?? 0),
        maskCandidates,
        roleCandidates,
        fallbackRoles: {
          ...preset.fallbackRoles,
          center: center[0] ?? preset.fallbackRoles.center
        }
      };
    }
    profiles.push({ landlook, presets });
  }
  return profiles;
}

function centerCandidatesFor(presetId, stats, preset) {
  const fallback = preset.centerFallback;
  if (!stats || stats.samples === 0) return fallback;
  if (presetId === "mountains") return [61];
  if (presetId === "forest") return [121];
  const source = countTotal(stats.deepInterior) >= 12 ? stats.deepInterior : stats.tiles;
  const learned = topTiles(source, 5, fallback, presetId).filter((tile) => preset.family.includes(tile));
  return unique([...learned.slice(0, 3), ...fallback]).slice(0, 5);
}

function topTiles(counts, limit, priority = [], presetId = null) {
  const prioritySet = new Map(priority.map((tile, index) => [tile, index]));
  return Object.entries(counts)
    .map(([tile, count]) => ({ tile: Number(tile), count }))
    .filter((entry) => presetId !== "forest" || (entry.tile >= 121 && entry.tile <= 129))
    .sort((a, b) => b.count - a.count || (prioritySet.get(a.tile) ?? 999) - (prioritySet.get(b.tile) ?? 999) || a.tile - b.tile)
    .slice(0, limit)
    .map((entry) => entry.tile);
}

function ensureProfileStats(profileStats, landlook, presetId) {
  const key = profileKey(landlook, presetId);
  let stats = profileStats.get(key);
  if (!stats) {
    stats = {
      landlook,
      presetId,
      samples: 0,
      tiles: {},
      masks: {},
      roles: {},
      deepInterior: {},
      nearInterior: {},
      boundary: {},
      excludedDetail: {},
      examples: []
    };
    profileStats.set(key, stats);
  }
  return stats;
}

function writeGeneratedProfiles(profiles) {
  const outputPath = path.join(repoRoot, "src/editor/map/generatedSmartTerrainProfiles.ts");
  const body = `import { SmartBrushProfile } from "../types";

// Generated by scripts/generate_smart_terrain_corpus.mjs.
// Do not edit by hand; rerun npm run archaeology:smart-terrain after corpus changes.
export const GENERATED_SMART_TERRAIN_PROFILES = ${JSON.stringify(profiles, null, 2)} as SmartBrushProfile[];
`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, body);
}

function writeReport(corpus, aggregate, profiles) {
  const lines = [];
  lines.push("# Smart Terrain Corpus Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Scenario Corpus");
  lines.push("");
  lines.push(`- Selected authored scenarios: ${corpus.selected.length}`);
  lines.push(`- Land maps analyzed: ${aggregate.summary.landMaps}`);
  lines.push(`- Standard land maps: ${aggregate.summary.standardLandMaps}`);
  lines.push(`- Custom land maps reported but not enabled: ${aggregate.summary.customLandMaps}`);
  lines.push(`- Skipped folders: ${corpus.skipped.length}`);
  lines.push("");
  lines.push("## Landlook Map Counts");
  lines.push("");
  for (const [landlook, count] of Object.entries(aggregate.summary.landlooks).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    lines.push(`- Landlook ${landlook}: ${count} map(s)`);
  }
  lines.push("");
  lines.push("## Generated Standard Profiles");
  lines.push("");
  for (const profile of profiles) {
    lines.push(`### Landlook ${profile.landlook}`);
    lines.push("");
    for (const [presetId, preset] of Object.entries(profile.presets)) {
      lines.push(`- ${TERRAIN_PRESETS[presetId].label}: ${preset.sampleCount} sample(s), ${preset.confidence} confidence`);
      lines.push(`  - Center candidates: ${preset.center.join(", ") || "none"}`);
      lines.push(`  - Top candidates: ${preset.candidates.slice(0, 8).join(", ") || "none"}`);
      const masks = Object.entries(preset.maskCandidates ?? {})
        .sort((a, b) => b[1].samples - a[1].samples)
        .slice(0, MAX_REPORT_MASKS);
      for (const [mask, evidence] of masks) {
        lines.push(`  - Mask ${mask}: ${evidence.samples} sample(s), ${evidence.confidence}, tiles ${evidence.tiles.join(", ")}`);
      }
    }
    lines.push("");
  }
  lines.push("## Semantic Notes");
  lines.push("");
  lines.push("- Mountains use `61-85` for mountain-to-land and `86-93` for mountain-to-water.");
  lines.push("- Forest smart-brush candidates are limited to `121-129`; `150-154` are reported as tree detail but excluded from generated profiles.");
  lines.push("- Custom landlooks `6-8` are analyzed for evidence but are not enabled because their atlases are scenario-specific.");
  lines.push("");
  const outputPath = path.join(repoRoot, "docs/generated/smart-terrain-corpus-report.md");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
}

function writeJson(outputPath, value) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(value, null, 2)}\n`);
}

function readLandMap(buffer, mapIndex) {
  const offset = mapIndex * FIELD_BYTES;
  const tiles = new Int16Array(MAP_SIZE * MAP_SIZE);
  for (let index = 0; index < tiles.length; index += 1) {
    tiles[index] = buffer.readInt16BE(offset + index * 2);
  }
  return tiles;
}

function shapeContextForMap(tiles, x, y, family) {
  return {
    n: hasFamily(tiles, x, y - 1, family),
    e: hasFamily(tiles, x + 1, y, family),
    s: hasFamily(tiles, x, y + 1, family),
    w: hasFamily(tiles, x - 1, y, family),
    ne: hasFamily(tiles, x + 1, y - 1, family),
    se: hasFamily(tiles, x + 1, y + 1, family),
    sw: hasFamily(tiles, x - 1, y + 1, family),
    nw: hasFamily(tiles, x - 1, y - 1, family)
  };
}

function hasFamily(tiles, x, y, family) {
  if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) return false;
  return family.has(normalizeMapTile(tiles[y * MAP_SIZE + x]));
}

function distanceToOutside(tiles, x, y, family) {
  for (let distance = 0; distance <= 4; distance += 1) {
    for (let yy = y - distance; yy <= y + distance; yy += 1) {
      for (let xx = x - distance; xx <= x + distance; xx += 1) {
        if (Math.max(Math.abs(xx - x), Math.abs(yy - y)) !== distance) continue;
        if (!hasFamily(tiles, xx, yy, family)) return distance;
      }
    }
  }
  return 5;
}

function maskFromContext(context) {
  return (context.n ? 1 : 0)
    | (context.e ? 2 : 0)
    | (context.s ? 4 : 0)
    | (context.w ? 8 : 0)
    | (context.ne ? 16 : 0)
    | (context.se ? 32 : 0)
    | (context.sw ? 64 : 0)
    | (context.nw ? 128 : 0);
}

function roleFromContext(context) {
  const outside = [
    !context.n ? "north" : null,
    !context.s ? "south" : null,
    !context.e ? "east" : null,
    !context.w ? "west" : null
  ].filter(Boolean);
  if (outside.length === 0) return "center";
  if (outside.length === 1) return outside[0];
  if (outside.length === 2) {
    if (!context.n && !context.s) return "lineHorizontal";
    if (!context.e && !context.w) return "lineVertical";
    if (!context.n && !context.e) return "northEast";
    if (!context.n && !context.w) return "northWest";
    if (!context.s && !context.e) return "southEast";
    if (!context.s && !context.w) return "southWest";
  }
  if (outside.length === 3) {
    if (context.n) return "capNorth";
    if (context.s) return "capSouth";
    if (context.e) return "capEast";
    if (context.w) return "capWest";
  }
  return "single";
}

function normalizeMapTile(value) {
  if (value < 0) return value;
  let tile = clearRealmzShortBit(value, 1);
  tile = clearRealmzShortBit(tile, 2);
  for (let attempt = 0; attempt < 3 && tile > 999; attempt += 1) tile -= 1000;
  return tile > 200 ? tile : Math.max(1, tile);
}

function clearRealmzShortBit(value, bit) {
  const unsigned = value & 0xffff;
  const cleared = unsigned & ~(1 << (15 - bit));
  return cleared >= 0x8000 ? cleared - 0x10000 : cleared;
}

function increment(counts, tile) {
  counts[tile] = (counts[tile] ?? 0) + 1;
}

function countTotal(counts) {
  return Object.values(counts ?? {}).reduce((sum, count) => sum + count, 0);
}

function confidenceFor(samples) {
  if (samples >= 1000) return "high";
  if (samples >= 100) return "medium";
  if (samples >= MIN_MASK_SAMPLES) return "low";
  return "fallback";
}

function unique(values) {
  return [...new Set(values)];
}

function profileKey(landlook, presetId) {
  return `${landlook}:${presetId}`;
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}
