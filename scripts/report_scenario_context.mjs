import fs from "node:fs";
import path from "node:path";

const DEFAULT_PROJECT = path.join("tmp", "castle-clouds-analysis", "Castle.providence", "project.json");
const DEFAULT_OUT = path.join("docs", "generated", "scenario-context", "castle-in-the-clouds", "context-report");
const args = process.argv.slice(2);
const projectPath = argValue("--project") ?? DEFAULT_PROJECT;
const outBase = argValue("--out") ?? DEFAULT_OUT;

if (!fs.existsSync(projectPath)) {
  console.error(`Scenario context report needs an imported project JSON. Missing: ${projectPath}`);
  process.exit(1);
}

const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
const report = buildCastleReport(project, projectPath);
fs.mkdirSync(path.dirname(outBase), { recursive: true });
fs.writeFileSync(`${outBase}.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${outBase}.md`, markdownReport(report));
console.log(`Scenario context report: ${report.scenario.name}`);
console.log(`Message evidence: ${report.evidence.messages.length}; thread candidates: ${report.threadCandidates.length}`);
console.log(`Wrote ${outBase}.json and ${outBase}.md`);

function buildCastleReport(project, projectPath) {
  const messages = project.messages ?? [];
  const messageEvidence = findMessageEvidence(messages);
  return {
    reportVersion: 1,
    scenario: {
      name: project.scenario?.name ?? "Unknown scenario",
      sourcePath: project.source?.sourcePath ?? "",
      projectPath
    },
    counts: {
      messages: messages.length,
      actionPoints: (project.triggers ?? []).filter((trigger) => trigger.source !== "Data ED3").length,
      extraActionPoints: (project.triggers ?? []).filter((trigger) => trigger.source === "Data ED3").length,
      simpleEncounters: project.simpleEncounters?.length ?? 0,
      complexEncounters: project.complexEncounters?.length ?? 0,
      rogueEncounters: project.thiefEncounters?.length ?? 0,
      timedEncounters: project.timedEncounters?.length ?? 0,
      questLabels: project.questLabels?.length ?? 0
    },
    threadCandidates: [
      {
        name: "Keto Allegiances And Gates",
        disposition: "story context",
        rationale: "Early strings repeatedly ask the player to pledge allegiance to Lord or Lady Keto and gate passage/shop access by that allegiance.",
        messageIds: idsForTerms(messageEvidence, ["lord keto", "lady keto", "alliance", "gate"]).slice(0, 16)
      },
      {
        name: "Find The Real Ketos",
        disposition: "likely main quest chain",
        rationale: "The decoded strings distinguish impostors from the real Lord and Lady Keto; the user-reported progression issue likely belongs in this chain.",
        messageIds: [174, 175, 319, 320, 322, 325, 327, 328, 470, 881, 933, 935, 939].filter((id) => messageById(messages, id))
      },
      {
        name: "Ulmac, Ambersair, And Ketonia",
        disposition: "likely main resolution gate",
        rationale: "Several messages say Ulmac and Ambersair controlled Ketonia or must be destroyed before the royal reunion/restoration can resolve.",
        messageIds: idsForTerms(messageEvidence, ["ulmac", "ambersair", "ketonia"]).slice(0, 18)
      }
    ],
    evidence: {
      messages: messageEvidence,
      guideCandidates: [
        "F:/Divinity CD/Divinity CD/Install Options/World of Realmz/Hint Guides/Castle Tip Sheet.rsrc"
      ]
    },
    notes: [
      "This report is a context aid, not a proof of runtime behavior.",
      "Quest flags are not named in this imported project; follow-up work should correlate these story beats with AP/EDCD reads and writes.",
      "Bundled UI context should remain humble: show likely continuity and nearby evidence, then let authors curate exact threads."
    ]
  };
}

function findMessageEvidence(messages) {
  const terms = ["lord keto", "lady keto", "ulmac", "ambersair", "impostor", "lothshor", "ketonia", "dead", "revive", "alliance", "gate"];
  return messages.flatMap((message) => {
    const text = String(message.text ?? "").replace(/\s+/g, " ").trim();
    const lower = text.toLowerCase();
    const matchedTerms = terms.filter((term) => lower.includes(term));
    if (matchedTerms.length === 0) return [];
    return [{
      id: message.id,
      matchedTerms,
      text: text.slice(0, 360)
    }];
  });
}

function idsForTerms(evidence, terms) {
  return evidence
    .filter((entry) => terms.some((term) => entry.matchedTerms.includes(term)))
    .map((entry) => entry.id);
}

function messageById(messages, id) {
  return messages.find((message) => message.id === id);
}

function markdownReport(report) {
  const lines = [
    "# Scenario Context Report: Castle in the Clouds",
    "",
    `Project: ${report.scenario.projectPath}`,
    `Source: ${report.scenario.sourcePath || "unknown"}`,
    "",
    "## Counts",
    "",
    ...Object.entries(report.counts).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Thread Candidates",
    ""
  ];
  for (const thread of report.threadCandidates) {
    lines.push(`### ${thread.name}`, "", `Disposition: ${thread.disposition}`, "", thread.rationale, "", `Messages: ${thread.messageIds.join(", ") || "none"}`, "");
  }
  lines.push("## Message Evidence", "");
  for (const message of report.evidence.messages.slice(0, 120)) {
    lines.push(`- **${message.id}** [${message.matchedTerms.join(", ")}] ${message.text}`);
  }
  lines.push("", "## Notes", "", ...report.notes.map((note) => `- ${note}`), "");
  return lines.join("\n");
}

function argValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}
