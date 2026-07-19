import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const RECORD_BYTES = 40;
const RESERVED_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const args = parseArgs(process.argv.slice(2));

if (args.get("self-test")) {
  runSelfTest();
} else {
  const outputDir = path.resolve(stringArg(args, "out") || path.join(root, "docs", "generated"));
  const { report, jsonPath, mdPath } = writeReport(buildReport(args), outputDir);
  console.log(JSON.stringify({
    ok: true,
    scanScope: report.scanScope,
    projectCount: report.projectCount,
    rawScenarioCount: report.rawScenarioCount,
    recordCount: report.recordCount,
    findingCount: report.findingCount,
    warningCount: report.warnings.length,
    jsonPath,
    mdPath
  }, null, 2));
}

function buildReport(parsed) {
  const projectFiles = dedupeProjectFiles(discoverProjectFiles(parsed));
  const rawScenarioFiles = discoverRawTimedEncounterFiles(parsed);
  const projectReports = projectFiles.map((file) => buildProjectReport(file));
  const rawReports = rawScenarioFiles.map((entry) => buildRawScenarioReport(entry));
  const sources = [...projectReports, ...rawReports].sort((a, b) => a.scenario.localeCompare(b.scenario) || a.sourcePath.localeCompare(b.sourcePath));
  const findings = sources.flatMap((source) => source.findings.map((finding) => ({ ...finding, scenario: source.scenario, sourceKind: source.sourceKind, sourcePath: source.sourcePath })));
  const warnings = sources.flatMap((source) => source.warnings.map((warning) => ({ ...warning, scenario: source.scenario, sourceKind: source.sourceKind, sourcePath: source.sourcePath })))
    .sort((a, b) => a.scenario.localeCompare(b.scenario) || a.message.localeCompare(b.message));
  return {
    schemaVersion: 1,
    generatedAt: null,
    scanScope: scanScope(parsed),
    scanRoots: scanRoots(projectFiles, rawScenarioFiles),
    projectCount: projectReports.length,
    rawScenarioCount: rawReports.length,
    sourceCount: sources.length,
    recordCount: sources.reduce((sum, source) => sum + source.recordCount, 0),
    findingCount: findings.length,
    summary: summarizeFindings(findings, sources),
    developerNote: "stuff[1..9] are preserved compatibility fields. The current corpus shows repeated nonzero patterns, but Realmz runtime evidence only names stuff[0] as the location-kind field. Do not promote these slots into authoring UI until source, Divinity fixture, or runtime behavior gives a slot a confirmed meaning.",
    activitySummary: summarizeActivity(findings),
    slotSummary: summarizeSlots(findings),
    commonPatterns: summarizePatterns(findings),
    coOccurrence: summarizeCoOccurrence(findings),
    warnings,
    sources: sources.map((source) => ({
      scenario: source.scenario,
      sourceKind: source.sourceKind,
      sourcePath: source.sourcePath,
      recordCount: source.recordCount,
      findingCount: source.findings.length,
      warnings: source.warnings,
      findings: source.findings
    }))
  };
}

function writeReport(report, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "timed-encounter-reserved-fields.json");
  const mdPath = path.join(outputDir, "timed-encounter-reserved-fields.md");
  writeJson(jsonPath, report);
  fs.writeFileSync(mdPath, renderMarkdown(report), "utf8");
  return { report, jsonPath, mdPath };
}

function buildProjectReport(file) {
  const project = readJson(file);
  const scenario = scenarioName(project, file);
  const records = (project.timedEncounters ?? []).map((record) => normalizeTimedRecord(record, "project"));
  return sourceReport({
    scenario,
    sourceKind: "project",
    sourcePath: file,
    records,
    warnings: []
  });
}

function buildRawScenarioReport(entry) {
  const { records, warnings } = parseRawTimedEncounterFile(entry.file);
  return sourceReport({
    scenario: entry.scenario,
    sourceKind: "raw-scenario",
    sourcePath: entry.file,
    records,
    warnings
  });
}

function sourceReport({ scenario, sourceKind, sourcePath, records, warnings }) {
  const findings = [];
  for (const record of records) {
    const nonzeroReservedSlots = reservedValues(record)
      .filter((slot) => slot.value !== 0)
      .map((slot) => slot.slot);
    if (!nonzeroReservedSlots.length) continue;
    findings.push({
      recordId: record.id,
      day: record.day,
      increment: record.increment,
      percent: record.percent,
      extraActionPoint: record.door,
      requiredLevel: record.requiredLevel,
      requiredRandomRect: record.requiredRandomRect,
      requiredX: record.requiredX,
      requiredY: record.requiredY,
      requiredItem: record.requiredItem,
      requiredQuest: record.requiredQuest,
      locationKind: record.locationKind,
      locationKindValue: record.stuff[0] ?? 0,
      reservedValues: reservedValues(record),
      nonzeroReservedSlots,
      gates: gateSummary(record),
      activity: activitySummary(record),
      pattern: reservedPattern(record)
    });
  }
  findings.sort((a, b) => a.recordId - b.recordId);
  return {
    scenario,
    sourceKind,
    sourcePath,
    recordCount: records.length,
    findings,
    warnings: warnings.sort((a, b) => a.message.localeCompare(b.message))
  };
}

function normalizeTimedRecord(record, sourceKind) {
  const legacyStuff = Array.isArray(record.stuff) ? record.stuff.slice(0, 10).map(numberValue) : [];
  while (legacyStuff.length < 10) legacyStuff.push(0);
  const reservedWords = Array.isArray(record.reservedWords)
    ? record.reservedWords.slice(0, 9).map(numberValue)
    : legacyStuff.slice(1);
  while (reservedWords.length < 9) reservedWords.push(0);
  const locationKind = record.locationKind ?? locationKindFromValue(legacyStuff[0]);
  const stuff = [locationKind === "land" ? 1 : locationKind === "dungeon" ? 2 : -1, ...reservedWords];
  return {
    id: numberValue(record.id),
    day: numberValue(record.day),
    increment: numberValue(record.increment),
    percent: numberValue(record.percent),
    door: numberValue(record.door),
    requiredLevel: numberValue(record.requiredLevel),
    requiredRandomRect: numberValue(record.requiredRandomRect),
    requiredX: numberValue(record.requiredX),
    requiredY: numberValue(record.requiredY),
    requiredItem: numberValue(record.requiredItem),
    requiredQuest: numberValue(record.requiredQuest),
    locationKind,
    stuff,
    sourceKind
  };
}

function parseRawTimedEncounterFile(file) {
  const buffer = fs.readFileSync(file);
  const warnings = [];
  if (buffer.length % RECORD_BYTES !== 0) {
    warnings.push({
      kind: "malformed-length",
      message: `Data TD3 length ${buffer.length} is not divisible by ${RECORD_BYTES}; trailing ${buffer.length % RECORD_BYTES} byte(s) ignored.`
    });
  }
  const recordCount = Math.floor(buffer.length / RECORD_BYTES);
  const records = [];
  for (let id = 0; id < recordCount; id += 1) {
    const offset = id * RECORD_BYTES;
    const stuff = Array.from({ length: 10 }, (_, slot) => i16be(buffer, offset + 20 + slot * 2));
    records.push({
      id,
      day: i16be(buffer, offset),
      increment: i16be(buffer, offset + 2),
      percent: i16be(buffer, offset + 4),
      door: i16be(buffer, offset + 6),
      requiredLevel: i16be(buffer, offset + 8),
      requiredRandomRect: i16be(buffer, offset + 10),
      requiredX: i16be(buffer, offset + 12),
      requiredY: i16be(buffer, offset + 14),
      requiredItem: i16be(buffer, offset + 16),
      requiredQuest: i16be(buffer, offset + 18),
      locationKind: locationKindFromValue(stuff[0]),
      stuff,
      sourceKind: "raw-scenario"
    });
  }
  return { records, warnings };
}

function discoverProjectFiles(parsed) {
  const explicit = parsed.get("project") ?? [];
  if (explicit.length) return explicit.map((file) => path.resolve(file));
  const roots = parsed.get("root")?.map((entry) => path.resolve(entry)) ?? defaultProjectRoots(Boolean(parsed.get("include-scratch")));
  const files = [];
  for (const searchRoot of roots) collectProjectFiles(searchRoot, files);
  return files;
}

function discoverRawTimedEncounterFiles(parsed) {
  const roots = rawScenarioRoots(parsed);
  const files = [];
  for (const searchRoot of roots) collectRawTimedEncounterFiles(path.resolve(searchRoot), files);
  const seen = new Set();
  return files
    .filter((entry) => {
      const key = entry.file.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.scenario.localeCompare(b.scenario) || a.file.localeCompare(b.file));
}

function rawScenarioRoots(parsed) {
  const explicit = parsed.get("scenario-root") ?? [];
  const envRoots = splitPathList(process.env.REALMZ_SCENARIO_ROOTS ?? "");
  return [...explicit, ...envRoots].filter(Boolean);
}

function splitPathList(value) {
  return value.split(path.delimiter).map((entry) => entry.trim()).filter(Boolean);
}

function defaultProjectRoots(includeScratch = false) {
  const roots = [
    path.join(root, "tmp", "desktop-ui-harness"),
    path.join(root, "fixtures")
  ];
  if (includeScratch) {
    roots.push(
      path.join(root, "tmp", "asset-triage"),
      path.join(root, "tmp", "castle-clouds-analysis"),
      path.join(root, "tmp", "editor-script-workflow-20260521-222621")
    );
  }
  return roots.filter((candidate) => fs.existsSync(candidate));
}

function collectProjectFiles(searchRoot, out) {
  if (!fs.existsSync(searchRoot)) return;
  const stat = fs.statSync(searchRoot);
  if (stat.isFile() && path.basename(searchRoot).toLowerCase() === "project.json") {
    out.push(searchRoot);
    return;
  }
  if (!stat.isDirectory()) return;
  const base = path.basename(searchRoot).toLowerCase();
  if (["node_modules", ".git", "target"].includes(base)) return;
  if (searchRoot.includes(`${path.sep}oracle-runs${path.sep}`) || searchRoot.includes(`${path.sep}editor-smoke-runs${path.sep}`)) return;
  for (const entry of fs.readdirSync(searchRoot, { withFileTypes: true })) {
    collectProjectFiles(path.join(searchRoot, entry.name), out);
  }
}

function collectRawTimedEncounterFiles(searchRoot, out) {
  if (!fs.existsSync(searchRoot)) return;
  const stat = fs.statSync(searchRoot);
  if (stat.isFile() && path.basename(searchRoot).toLowerCase() === "data td3") {
    out.push({ file: searchRoot, scenario: path.basename(path.dirname(searchRoot)) });
    return;
  }
  if (!stat.isDirectory()) return;
  const direct = findChildFileCaseInsensitive(searchRoot, "Data TD3");
  if (direct) {
    out.push({ file: direct, scenario: path.basename(searchRoot) });
    return;
  }
  const base = path.basename(searchRoot).toLowerCase();
  if (["node_modules", ".git", "target", "build"].includes(base)) return;
  for (const entry of fs.readdirSync(searchRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    collectRawTimedEncounterFiles(path.join(searchRoot, entry.name), out);
  }
}

function findChildFileCaseInsensitive(directory, targetName) {
  const target = targetName.toLowerCase();
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase() === target) return path.join(directory, entry.name);
  }
  return null;
}

function dedupeProjectFiles(files) {
  const byScenario = new Map();
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const project = readJson(file);
      const scenario = scenarioName(project, file).toLowerCase();
      const current = byScenario.get(scenario);
      const rank = projectRank(file);
      if (!current || rank > current.rank) byScenario.set(scenario, { file, rank });
    } catch {
      // Ignore malformed scratch files.
    }
  }
  return [...byScenario.values()].sort((a, b) => a.file.localeCompare(b.file)).map((entry) => entry.file);
}

function projectRank(file) {
  let rank = fs.statSync(file).mtimeMs;
  if (file.includes(`${path.sep}desktop-ui-harness${path.sep}`)) rank += 1_000_000_000;
  if (file.includes(`${path.sep}asset-triage${path.sep}`)) rank += 500_000_000;
  if (file.includes(`${path.sep}oracle-runs${path.sep}`) || file.includes(`${path.sep}editor-smoke-runs${path.sep}`)) rank -= 5_000_000_000;
  return rank;
}

function scanScope(parsed) {
  const parts = [];
  if (parsed.get("project")) parts.push("explicit-projects");
  else if (parsed.get("root")) parts.push("explicit-project-roots");
  else parts.push(parsed.get("include-scratch") ? "benchmark-and-scratch-projects" : "benchmark-projects");
  if (rawScenarioRoots(parsed).length) parts.push("raw-scenario-roots");
  return parts.join("+");
}

function scanRoots(projectFiles, rawScenarioFiles) {
  return [...new Set([
    ...projectFiles.map((file) => path.dirname(file)),
    ...rawScenarioFiles.map((entry) => path.dirname(entry.file))
  ])].sort();
}

function summarizeFindings(findings, sources) {
  return {
    sourcesWithRecords: sources.filter((source) => source.recordCount > 0).length,
    sourcesWithFindings: sources.filter((source) => source.findings.length > 0).length,
    recordsWithReservedValues: findings.length,
    reservedUsagePresent: findings.length > 0
  };
}

function summarizeActivity(findings) {
  const summary = {
    totalRecordsWithReservedValues: findings.length,
    activeSchedule: 0,
    runnableDoor: 0,
    plausibleRunnable: 0,
    inactiveTemplateLike: 0
  };
  for (const finding of findings) {
    if (finding.activity.activeSchedule) summary.activeSchedule += 1;
    if (finding.activity.runnableDoor) summary.runnableDoor += 1;
    if (finding.activity.plausibleRunnable) summary.plausibleRunnable += 1;
    if (finding.activity.inactiveTemplateLike) summary.inactiveTemplateLike += 1;
  }
  return summary;
}

function summarizeSlots(findings) {
  return RESERVED_SLOTS.map((slot) => {
    const values = new Map();
    const scenarios = new Set();
    let recordCount = 0;
    for (const finding of findings) {
      const value = finding.reservedValues.find((entry) => entry.slot === slot)?.value ?? 0;
      if (value === 0) continue;
      recordCount += 1;
      scenarios.add(finding.scenario);
      values.set(value, (values.get(value) ?? 0) + 1);
    }
    return {
      slot,
      field: `stuff[${slot}]`,
      recordCount,
      scenarioCount: scenarios.size,
      uniqueValues: [...values.keys()].sort((a, b) => a - b),
      commonValues: [...values.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value - b.value)
        .slice(0, 20)
    };
  });
}

function summarizePatterns(findings) {
  const patterns = new Map();
  for (const finding of findings) {
    const current = patterns.get(finding.pattern) ?? { pattern: finding.pattern, recordCount: 0, scenarios: new Set(), examples: [] };
    current.recordCount += 1;
    current.scenarios.add(finding.scenario);
    if (current.examples.length < 10) current.examples.push({
      scenario: finding.scenario,
      sourceKind: finding.sourceKind,
      recordId: finding.recordId,
      nonzeroReservedSlots: finding.nonzeroReservedSlots
    });
    patterns.set(finding.pattern, current);
  }
  return [...patterns.values()]
    .map((pattern) => ({ ...pattern, scenarioCount: pattern.scenarios.size, scenarios: [...pattern.scenarios].sort() }))
    .sort((a, b) => b.recordCount - a.recordCount || a.pattern.localeCompare(b.pattern))
    .slice(0, 50);
}

function summarizeCoOccurrence(findings) {
  const summary = {
    totalRecordsWithReservedValues: findings.length,
    withItemGate: 0,
    withQuestGate: 0,
    withLocationGate: 0,
    withRandomRectGate: 0,
    withCoordinateGate: 0,
    withExtraActionPoint: 0
  };
  for (const finding of findings) {
    if (finding.gates.item) summary.withItemGate += 1;
    if (finding.gates.quest) summary.withQuestGate += 1;
    if (finding.gates.location) summary.withLocationGate += 1;
    if (finding.gates.randomRect) summary.withRandomRectGate += 1;
    if (finding.gates.coordinate) summary.withCoordinateGate += 1;
    if (finding.extraActionPoint !== 0) summary.withExtraActionPoint += 1;
  }
  return summary;
}

function reservedValues(record) {
  return RESERVED_SLOTS.map((slot) => ({ slot, field: `stuff[${slot}]`, value: numberValue(record.stuff[slot]) }));
}

function reservedPattern(record) {
  return RESERVED_SLOTS.map((slot) => numberValue(record.stuff[slot])).join(",");
}

function gateSummary(record) {
  return {
    item: record.requiredItem > 0,
    quest: record.requiredQuest >= 0,
    location: record.locationKind !== "any" || record.requiredLevel >= 0,
    randomRect: record.requiredRandomRect >= 0,
    coordinate: record.requiredX >= 0 || record.requiredY >= 0
  };
}

function activitySummary(record) {
  const activeSchedule = record.day !== 0;
  const runnableDoor = record.door !== 0;
  const validPercent = record.percent >= 0 && record.percent <= 100;
  return {
    activeSchedule,
    runnableDoor,
    validPercent,
    plausibleRunnable: activeSchedule && runnableDoor && validPercent,
    inactiveTemplateLike: record.day === -1 && record.increment === 0 && record.percent === 0 && record.door === 0
  };
}

function locationKindFromValue(value) {
  if (value === 1) return "land";
  if (value === 2) return "dungeon";
  return "any";
}

function renderMarkdown(report) {
  const lines = [
    "# Timed Encounter Reserved Fields",
    "",
    "This report scans `Data TD3` timed encounter records for nonzero values in `stuff[1..9]`, the nine currently reserved compatibility slots after the known location-kind field.",
    "",
    `Scan scope: ${report.scanScope}`,
    `Project sources: ${report.projectCount}`,
    `Raw scenario sources: ${report.rawScenarioCount}`,
    `Timed encounter records scanned: ${report.recordCount}`,
    `Records with nonzero reserved slots: ${report.findingCount}`,
    ""
  ];
  lines.push("## Summary", "");
  if (report.findingCount === 0) {
    lines.push("No nonzero `stuff[1..9]` values were found in the scanned corpus.", "");
  } else {
    lines.push(`Reserved slot usage is present in ${report.summary.sourcesWithFindings} source(s). Treat these slots as compatibility fields until follow-up archaeology names their runtime meaning.`, "");
  }
  if (report.developerNote) {
    lines.push("Developer note:", "", report.developerNote, "");
  }
  lines.push("## Slot Usage", "", "| Slot | Records | Scenarios | Values |");
  lines.push("| ---: | ---: | ---: | --- |");
  for (const slot of report.slotSummary) {
    lines.push(`| ${slot.slot} | ${slot.recordCount} | ${slot.scenarioCount} | ${slot.uniqueValues.join(", ") || "-"} |`);
  }
  lines.push("", "## Co-Occurrence", "");
  lines.push(`- active/nonzero day: ${report.activitySummary.activeSchedule}`);
  lines.push(`- has Extra AP target: ${report.activitySummary.runnableDoor}`);
  lines.push(`- plausible runnable schedule: ${report.activitySummary.plausibleRunnable}`);
  lines.push(`- inactive/template-like: ${report.activitySummary.inactiveTemplateLike}`);
  lines.push(`- with Extra AP target: ${report.coOccurrence.withExtraActionPoint}`);
  lines.push(`- with item gate: ${report.coOccurrence.withItemGate}`);
  lines.push(`- with quest gate: ${report.coOccurrence.withQuestGate}`);
  lines.push(`- with location gate: ${report.coOccurrence.withLocationGate}`);
  lines.push(`- with random rectangle gate: ${report.coOccurrence.withRandomRectGate}`);
  lines.push(`- with coordinate gate: ${report.coOccurrence.withCoordinateGate}`);
  lines.push("", "## Common Patterns", "");
  if (!report.commonPatterns.length) {
    lines.push("- none");
  } else {
    for (const pattern of report.commonPatterns.slice(0, 20)) {
      lines.push(`- \`${pattern.pattern}\`: ${pattern.recordCount} record(s), ${pattern.scenarioCount} scenario(s)`);
    }
  }
  lines.push("", "## Findings", "");
  const sourcesWithFindings = report.sources.filter((source) => source.findingCount > 0);
  if (!sourcesWithFindings.length) {
    lines.push("- none");
  } else {
    for (const source of sourcesWithFindings) {
      lines.push(`### ${source.scenario}`, "", `Source: ${source.sourceKind} (${source.sourcePath})`, "");
      lines.push("| Record | Extra AP | Schedule | Gates | Nonzero reserved slots | Reserved pattern |");
      lines.push("| ---: | ---: | --- | --- | --- | --- |");
      for (const finding of source.findings) {
        const gates = Object.entries(finding.gates).filter(([, value]) => value).map(([key]) => key).join(", ") || "-";
        const slots = finding.reservedValues.filter((entry) => entry.value !== 0).map((entry) => `${entry.field}=${entry.value}`).join(", ");
        lines.push(`| ${finding.recordId} | ${finding.extraActionPoint} | day ${finding.day}, inc ${finding.increment}, ${finding.percent}% | ${gates} | ${slots} | \`${finding.pattern}\` |`);
      }
      lines.push("");
    }
  }
  if (report.warnings.length) {
    lines.push("## Warnings", "");
    for (const warning of report.warnings) lines.push(`- ${warning.scenario}: ${warning.message}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function runSelfTest() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "providence-td3-reserved-"));
  try {
    const projectRoot = path.join(tempRoot, "projects");
    const rawRoot = path.join(tempRoot, "raw");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(rawRoot, { recursive: true });

    writeProject(path.join(projectRoot, "Zero.providence", "project.json"), "Zero Reserved", [
      timedRecord(0, { stuff: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] })
    ]);
    writeProject(path.join(projectRoot, "Nonzero.providence", "project.json"), "Nonzero Reserved", [
      timedRecord(0, { door: 10, requiredItem: 5, stuff: [1, 7, 0, 0, 0, 0, 0, 0, 0, 0] }),
      timedRecord(1, { door: 11, requiredQuest: 3, requiredRandomRect: 2, stuff: [2, 7, -2, 0, 0, 0, 0, 0, 0, 0] })
    ]);

    const rawScenario = path.join(rawRoot, "Raw Scenario");
    fs.mkdirSync(rawScenario, { recursive: true });
    fs.writeFileSync(path.join(rawScenario, "Data TD3"), Buffer.concat([
      rawTimedRecord({ id: 0, stuff: [0, 0, 0, 9, 0, 0, 0, 0, 0, 0] }),
      Buffer.from([1, 2, 3])
    ]));

    const report = buildReport(new Map([
      ["root", [projectRoot]],
      ["scenario-root", [rawRoot]]
    ]));

    assertEqual(report.projectCount, 2, "project count");
    assertEqual(report.rawScenarioCount, 1, "raw scenario count");
    assertEqual(report.recordCount, 4, "record count ignores malformed trailer");
    assertEqual(report.findingCount, 3, "finding count");
    assertEqual(report.slotSummary.find((slot) => slot.slot === 1)?.recordCount, 2, "slot 1 count");
    assertEqual(report.slotSummary.find((slot) => slot.slot === 2)?.uniqueValues[0], -2, "slot 2 value");
    assertEqual(report.slotSummary.find((slot) => slot.slot === 3)?.recordCount, 1, "slot 3 count");
    assertEqual(report.coOccurrence.withItemGate, 1, "item gate count");
    assertEqual(report.coOccurrence.withQuestGate, 1, "quest gate count");
    assertEqual(report.warnings.length, 1, "malformed raw warning");

    const outputDir = path.join(tempRoot, "out");
    writeReport(report, outputDir);
    if (!fs.existsSync(path.join(outputDir, "timed-encounter-reserved-fields.json"))) throw new Error("self-test report json missing");
    if (!fs.existsSync(path.join(outputDir, "timed-encounter-reserved-fields.md"))) throw new Error("self-test report markdown missing");

    console.log(JSON.stringify({ ok: true, selfTestCases: 4 }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeProject(file, name, timedEncounters) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, { scenario: { name }, timedEncounters });
}

function timedRecord(id, overrides = {}) {
  return {
    id,
    day: overrides.day ?? 1,
    increment: overrides.increment ?? 1,
    percent: overrides.percent ?? 100,
    door: overrides.door ?? 0,
    requiredLevel: overrides.requiredLevel ?? -1,
    requiredRandomRect: overrides.requiredRandomRect ?? -1,
    requiredX: overrides.requiredX ?? -1,
    requiredY: overrides.requiredY ?? -1,
    requiredItem: overrides.requiredItem ?? -1,
    requiredQuest: overrides.requiredQuest ?? -1,
    locationKind: locationKindFromValue((overrides.stuff ?? [0])[0] ?? 0),
    stuff: overrides.stuff ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  };
}

function rawTimedRecord(record) {
  const buffer = Buffer.alloc(RECORD_BYTES);
  const normalized = timedRecord(record.id ?? 0, record);
  writeI16be(buffer, 0, normalized.day);
  writeI16be(buffer, 2, normalized.increment);
  writeI16be(buffer, 4, normalized.percent);
  writeI16be(buffer, 6, normalized.door);
  writeI16be(buffer, 8, normalized.requiredLevel);
  writeI16be(buffer, 10, normalized.requiredRandomRect);
  writeI16be(buffer, 12, normalized.requiredX);
  writeI16be(buffer, 14, normalized.requiredY);
  writeI16be(buffer, 16, normalized.requiredItem);
  writeI16be(buffer, 18, normalized.requiredQuest);
  for (let slot = 0; slot < 10; slot += 1) writeI16be(buffer, 20 + slot * 2, normalized.stuff[slot] ?? 0);
  return buffer;
}

function i16be(buffer, offset) {
  return buffer.readInt16BE(offset);
}

function writeI16be(buffer, offset, value) {
  buffer.writeInt16BE(numberValue(value), offset);
}

function scenarioName(project, file) {
  return project.scenario?.name || project.metadata?.title || project.name || path.basename(path.dirname(file));
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function parseArgs(argv) {
  const parsed = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed.set(key, true);
    } else {
      index += 1;
      parsed.set(key, ["project", "root", "scenario-root"].includes(key) ? next.split(",").filter(Boolean) : next);
    }
  }
  return parsed;
}

function stringArg(parsed, key) {
  const value = parsed.get(key);
  if (Array.isArray(value)) return value[0];
  if (typeof value === "string") return value;
  return "";
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
