import fs from "node:fs";
import path from "node:path";

const DEFAULT_OUT = path.join("docs", "generated", "quest-context-coverage");
const SCENARIO_ROOTS = [
  "F:/Realmz/base/Realmz/Scenarios",
  "F:/Realmz/out_win_clang/Scenarios"
];
const HINT_ROOTS = [
  "F:/Divinity CD/Divinity CD/Install Options/World of Realmz/Hint Guides",
  "F:/Divinity CD/Divinity CD/Install Options/World of Realmz/Hint Guides (HTML)",
  "F:/Realmz/base/Realmz/Hint Guides",
  "F:/Realmz/out_win_clang/Hint Guides"
];
const WEB_SOURCES = [
  { title: "GameFAQs Realmz FAQ", url: "https://gamefaqs.gamespot.com/mac/564322-realmz/faqs/77703" },
  { title: "Realmz Wiki", url: "https://realmz.fandom.com/wiki/Realmz_Wiki" }
];

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outBase = outIndex >= 0 ? args[outIndex + 1] : DEFAULT_OUT;

const scenarios = discoverScenarios();
const hints = discoverHints();
const records = scenarios.map((scenario) => {
  const matches = hints.filter((hint) => fuzzyMatch(scenario.slug, hint.slug) || fuzzyMatch(hint.slug, scenario.slug));
  return {
    scenario: scenario.name,
    path: scenario.path,
    localHintGuides: matches,
    webSources: WEB_SOURCES,
    status: matches.length > 0 ? "local guide candidate" : "web/manual context needed"
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  scenarioRoots: SCENARIO_ROOTS.filter((root) => fs.existsSync(root)),
  hintRoots: HINT_ROOTS.filter((root) => fs.existsSync(root)),
  webSources: WEB_SOURCES,
  scenarioCount: records.length,
  localGuideCandidateCount: records.filter((record) => record.localHintGuides.length > 0).length,
  records
};

fs.mkdirSync(path.dirname(outBase), { recursive: true });
fs.writeFileSync(`${outBase}.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${outBase}.md`, markdownReport(report));
console.log(`Quest context coverage: ${report.localGuideCandidateCount}/${report.scenarioCount} scenarios have local guide candidates.`);
console.log(`Wrote ${outBase}.json and ${outBase}.md`);

function discoverScenarios() {
  const seen = new Map();
  for (const root of SCENARIO_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (/^(new scenario|test|backup)/i.test(entry.name)) continue;
      const scenarioPath = path.join(root, entry.name);
      const slug = slugify(entry.name);
      if (!seen.has(slug) || root.includes("out_win_clang")) {
        seen.set(slug, { name: entry.name, slug, path: scenarioPath });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function discoverHints() {
  const hints = [];
  for (const root of HINT_ROOTS) {
    if (!fs.existsSync(root)) continue;
    walk(root, (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (![".txt", ".md", ".html", ".htm", ".rsrc"].includes(ext)) return;
      const name = path.basename(filePath).replace(/\.[^.]+$/, "");
      if (/^icon_?$/i.test(name) || /spell list/i.test(filePath)) return;
      hints.push({ title: name, slug: slugify(name.replace(/\b(tips?|sheet|guide|html|rsrc)\b/gi, "")), path: filePath });
    });
  }
  return hints.sort((a, b) => a.title.localeCompare(b.title));
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else visit(full);
  }
}

function fuzzyMatch(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function markdownReport(data) {
  const lines = [
    "# Quest Context Coverage",
    "",
    `Scenarios scanned: ${data.scenarioCount}`,
    `Local guide candidates: ${data.localGuideCandidateCount}`,
    "",
    "## Web Sources",
    "",
    ...data.webSources.map((source) => `- [${source.title}](${source.url})`),
    "",
    "## Scenario Coverage",
    "",
    "| Scenario | Status | Local guide candidates |",
    "| --- | --- | --- |"
  ];
  for (const record of data.records) {
    lines.push(`| ${escapeCell(record.scenario)} | ${record.status} | ${record.localHintGuides.map((hint) => escapeCell(hint.title)).join("<br>") || "none"} |`);
  }
  return `${lines.join("\n")}\n`;
}

function escapeCell(value) {
  return String(value).replace(/\|/g, "\\|");
}
