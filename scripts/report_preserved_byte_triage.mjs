import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(stringArg(args, "out") || path.join(root, "docs", "generated"));
const divinityRoot = path.resolve(stringArg(args, "divinity-root") || process.env.DIVINITY_PORT_ROOT || path.join(root, "..", "Divinity - Codex", "divinity-port"));

const report = buildReport();
writeReport(report, outputDir);

console.log(JSON.stringify({
  ok: true,
  entryCount: report.summary.entryCount,
  targetCount: report.summary.targetCount,
  byClassification: report.summary.byClassification,
  byEvidenceLabel: report.summary.byEvidenceLabel,
  jsonPath: path.join(outputDir, "preserved-byte-triage.json"),
  mdPath: path.join(outputDir, "preserved-byte-triage.md")
}, null, 2));

function buildReport() {
  const sourceState = collectSourceState();
  const entries = buildEntries(sourceState);
  return {
    schemaVersion: 1,
    generatedAt: null,
    generatedBy: "scripts/report_preserved_byte_triage.mjs",
    purpose: "Preserved-byte triage for Divinity/Providence unknown and noisy scenario bytes.",
    scope: [
      "Scenario support-file editor-state bytes",
      "Scenario release/security/editability gates",
      "Data ED3/Data EDCD Extra AP and parameter rows",
      "Data LD/Data DL land and dungeon field fixtures",
      "Data TD3 timed encounter reserved fields"
    ],
    taxonomy: {
      classifications: [
        "authored game data",
        "Divinity editor UI state",
        "release/security/editability metadata",
        "runtime/cache/generated data",
        "preserved compatibility bytes",
        "still unknown"
      ],
      evidenceLabels: [
        "fixture-proven",
        "source/decompiler-supported",
        "correlated",
        "inferred",
        "unknown"
      ]
    },
    sourceState,
    summary: summarize(entries),
    promotionRules: [
      "Do not promote Scenario support-file offsets to authored game data when the same diff also contains editor view, selector, map, or tool state.",
      "A Divinity fixture proves only the isolated field it changes; nearby recurring Scenario bytes remain editor state unless a separate content fixture owns them.",
      "Source-backed runtime layouts can justify parsers and preservation policy, but Divinity label/write ownership still needs a fixture or a named editor/decompiler path.",
      "Generated runtime caches are relationship evidence, not export sources, unless a future workflow explicitly owns runtime-state editing."
    ],
    entries
  };
}

function collectSourceState() {
  const generated = path.join(root, "docs", "generated");
  const cards = path.join(divinityRoot, "docs", "evidence-cards");
  return {
    providence: {
      scenarioByteOwnership: stateForJson(path.join(generated, "scenario-byte-ownership.json"), (json) => ({
        containerCount: json.summary?.containerCount ?? null,
        statusCounts: json.summary?.statusCounts ?? {},
        sources: json.sources ?? {}
      })),
      scenarioStartupShellGate: stateForJson(path.join(generated, "scenario-startup-shell-gate.json"), (json) => ({
        writerReadiness: json.summary?.writerReadiness ?? json.gate?.writerStatus ?? null,
        observedByteSizes: json.summary?.observedByteSizes ?? [],
        ownedFields: json.gate?.ownedFields?.map((field) => `${field.offset}:${field.internal}`) ?? []
      })),
      opcodeEdcdCrosswalk: stateForJson(path.join(generated, "opcode-edcd-crosswalk.json"), (json) => ({
        totalOpcodes: json.summary?.totalOpcodes ?? null,
        edcdBacked: json.summary?.edcdBacked ?? null,
        directExtraActionPoint: json.summary?.directExtraActionPoint ?? null,
        missingProvidenceShape: json.summary?.missingProvidenceShape ?? [],
        fieldComparisonGaps: json.summary?.fieldComparisonGaps ?? []
      })),
      timedEncounterReservedFields: stateForJson(path.join(generated, "timed-encounter-reserved-fields.json"), (json) => ({
        recordCount: json.recordCount ?? null,
        findingCount: json.findingCount ?? null,
        reservedUsagePresent: json.summary?.reservedUsagePresent ?? null,
        commonPatterns: json.commonPatterns?.map((pattern) => ({ pattern: pattern.pattern, recordCount: pattern.recordCount })) ?? []
      })),
      dungeonByteOwnership: stateForJson(path.join(generated, "dungeon-byte-ownership.json"), (json) => ({
        cells: json.summary?.cells ?? null,
        bitStatuses: json.summary?.bitStatuses ?? {},
        writerStatuses: json.summary?.writerStatuses ?? {}
      }))
    },
    divinity: {
      root: divinityRoot,
      evidenceCards: {
        noOpControls: stateForJson(path.join(cards, "fixture-editor-no-op-control-set.json"), cardSummary),
        stringEdit: stateForJson(path.join(cards, "fixture-string-data-sd2-first-edit.json"), cardSummary),
        extraApCodeRow: stateForJson(path.join(cards, "fixture-extra-action-point-code-row-first-edit.json"), cardSummary),
        apIdRow: stateForJson(path.join(cards, "fixture-action-point-id-row-first-edit.json"), cardSummary),
        landOneTile: stateForJson(path.join(cards, "fixture-land-one-tile-first-edit.json"), cardSummary),
        landSecondCell: stateForJson(path.join(cards, "fixture-land-second-basic-cell-first-edit.json"), cardSummary),
        specialLandReference: stateForJson(path.join(cards, "fixture-special-land-tile-reference-first-edit.json"), cardSummary),
        dungeonWallClick: stateForJson(path.join(cards, "fixture-dungeon-wall-click-apply-first-edit.json"), cardSummary),
        dungeonWallBit: stateForJson(path.join(cards, "fixture-dungeon-wall-bit-first-edit.json"), cardSummary),
        dungeonHorizontalDoor: stateForJson(path.join(cards, "fixture-dungeon-horizontal-door-bit-first-edit.json"), cardSummary)
      },
      capstoneIndex: stateForJson(path.join(divinityRoot, "docs", "generated", "divinity.capstone-index.json"), (json) => ({
        stringCount: Array.isArray(json.strings) ? json.strings.length : Array.isArray(json) ? json.length : null,
        hasTimedEncounterAnchor: jsonTextIncludes(json, "Data TD3"),
        hasSecurityAnchor: jsonTextIncludes(json, "Data CS") || jsonTextIncludes(json, "security for this scenario")
      })),
      binaryFileWriteMap: stateForFile(path.join(divinityRoot, "docs", "binary-editor-file-write-map.md"))
    }
  };
}

function buildEntries(sourceState) {
  const entries = [];
  const add = (entry) => entries.push({
    id: entry.id,
    target: entry.target,
    container: entry.container,
    byteRange: entry.byteRange,
    classification: entry.classification,
    evidenceLabel: entry.evidenceLabel,
    conclusion: entry.conclusion,
    evidence: entry.evidence,
    notes: entry.notes ?? [],
    promotionPolicy: entry.promotionPolicy
  });

  add({
    id: "scenario-429-433-editor-state",
    target: "Scenario support-file editor-state bytes",
    container: "Scenario support file",
    byteRange: "offsets 429, 433",
    classification: "Divinity editor UI state",
    evidenceLabel: "fixture-proven",
    conclusion: "Recurring Divinity no-op and content fixtures change these bytes as view/map context, not scenario-authored content.",
    evidence: [
      "Divinity evidence card: fixture-editor-no-op-control-set",
      "Divinity evidence card: fixture-string-data-sd2-first-edit",
      "Divinity local fixture diffs summarized in preserved-byte triage"
    ],
    promotionPolicy: "Preserve byte-for-byte; exclude from authored game data even when they appear beside Data SD2, ED3, LD, or DL payload changes."
  });

  add({
    id: "scenario-437-441-string-go-fields",
    target: "Scenario support-file editor-state bytes",
    container: "Scenario support file",
    byteRange: "offsets 437, 441",
    classification: "Divinity editor UI state",
    evidenceLabel: "correlated",
    conclusion: "String-editor controls identify these as visible Go H/V field state; no current clean payload model needs them.",
    evidence: [
      "Divinity evidence card note: fixture-string-data-sd2-first-edit",
      "String editor selector/control matrix"
    ],
    notes: [
      "The committed string payload card proves Data SD2 content after normalizing selector/map state.",
      "Treat these offsets as editor state until a separate fixture proves authored semantics."
    ],
    promotionPolicy: "Do not promote 437 or 441 to authored string/map data from a diff that also contains Scenario editor context."
  });

  add({
    id: "scenario-nearby-editor-state",
    target: "Scenario support-file nearby string/map state",
    container: "Scenario support file",
    byteRange: "offsets 23, 30, 34, 35, 38..39, 445, 449, 455",
    classification: "Divinity editor UI state",
    evidenceLabel: "correlated",
    conclusion: "Nearby bytes recur as string selector, land/special selection, dungeon tool, and editor context state.",
    evidence: [
      "Divinity evidence card: fixture-editor-no-op-control-set",
      "Divinity land/special/dungeon fixture cards",
      "Local sanitized fixture-diff inventory"
    ],
    notes: [
      "Offsets 35, 445, and 449 are directly represented in no-op controls.",
      "Offsets 23, 30, 34, and 455 appear as sidecar state in focused string, land, and dungeon fixture campaigns.",
      "Offsets 23 and 38..39 are the existing bounded Providence string-editor slot/sound fields; they remain editor support state rather than Realmz gameplay semantics."
    ],
    promotionPolicy: "Compile only the bounded slot/sound fields for editor portability. Keep the other offsets preserve-only unless future controls isolate a content meaning."
  });

  add({
    id: "scenario-data-sd2-authored-string",
    target: "Scenario support-file nearby string/map state",
    container: "Data SD2",
    byteRange: "String 4 payload bytes in the controlled fixture",
    classification: "authored game data",
    evidenceLabel: "fixture-proven",
    conclusion: "The isolated String 4 edit mutated Data SD2 after editor selector and map state were normalized.",
    evidence: [
      "Divinity evidence card: fixture-string-data-sd2-first-edit"
    ],
    promotionPolicy: "Promote only the Data SD2 payload ranges, not the Scenario editor-state bytes observed during setup or navigation."
  });

  add({
    id: "scenario-startup-security-core",
    target: "Scenario publish/security/editability gate",
    container: "Scenario Startup Shell",
    byteRange: "core 0..316 plus optional tail 316..320",
    classification: "release/security/editability metadata",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "Providence compiles the complete 316-byte startup core from canonical level, position, security-segment, and creator semantics; only an imported optional tail remains compatibility data.",
    evidence: [
      "docs/generated/scenario-startup-shell-gate.json",
      "docs/format-evidence-cards/scenario-shell-startup-release.md",
      "src-tauri/src/realmz/scenario.rs startup shell tests"
    ],
    notes: [
      `Observed writer readiness: ${sourceState.providence.scenarioStartupShellGate.summary?.writerReadiness ?? "unavailable"}`
    ],
    promotionPolicy: "Compile the 316-byte core from canonical semantics. Recover untouched imported identity and any optional tail only from the compatibility annex."
  });

  add({
    id: "data-cs-security-backup",
    target: "Scenario publish/security/editability gate",
    container: "Data CS",
    byteRange: "316-byte security backup container",
    classification: "release/security/editability metadata",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "Providence compiles the complete 316-byte Data CS core with the scenario-shell codec; its exact Divinity publish/refusal behavior remains source/decompiler-supported rather than fixture-proven.",
    evidence: [
      "docs/generated/scenario-byte-ownership.json",
      "Divinity Capstone index security/Data CS strings",
      "Realmz source/security-shell evidence"
    ],
    promotionPolicy: "Expose the canonical shell fields needed to compile Data CS, while keeping untouched imported identity and any future non-core bytes in the compatibility annex. Do not claim exact publish/refusal behavior without a dedicated fixture."
  });

  add({
    id: "format-marker",
    target: "Scenario publish/security/editability gate",
    container: "Format",
    byteRange: "zero-byte marker file",
    classification: "preserved compatibility bytes",
    evidenceLabel: "correlated",
    conclusion: "Format is a compatibility marker observed in scenario inventory, not an authored payload.",
    evidence: [
      "docs/generated/scenario-byte-ownership.json",
      "Divinity Capstone string anchor near Realmz-format text"
    ],
    promotionPolicy: "Keep as preserve/emit compatibility metadata only."
  });

  add({
    id: "divinity-published-refusal-exact-delta",
    target: "Scenario publish/security/editability gate",
    container: "Scenario/Data CS/Format candidate area",
    byteRange: "exact publish/refusal byte deltas not isolated",
    classification: "still unknown",
    evidenceLabel: "unknown",
    conclusion: "Divinity has binary text for published/security/edit refusal, but this pass did not find a clean fixture showing exactly what bytes change when publishing or refusing edit.",
    evidence: [
      "Divinity Capstone strings: Data CS, security permanent, not allowed to edit/view scenario",
      "No accepted publish/refusal mutation fixture found in current evidence cards"
    ],
    notes: [
      "The gate category is release/security/editability metadata.",
      "The exact byte-level delta remains blocked on a targeted fixture."
    ],
    promotionPolicy: "Keep candidate bytes unknown or preserve-only until a publish/refusal fixture isolates the changed files and offsets."
  });

  add({
    id: "ed3-row-layout",
    target: "Data ED3/Data EDCD Extra AP rows",
    container: "Data ED3",
    byteRange: "40-byte rows: 0..4 ID, 4..8 level/x/y/chance, 8..24 code[8], 24..40 id[8]",
    classification: "authored game data",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "ED3 is the Extra AP authored script row store; Divinity fixture evidence separately proves at least the visible code-row mutation path.",
    evidence: [
      "docs/format-evidence-cards/action-point-extra-ap-storage-reachability.md",
      "docs/generated/extra-ap-reachability-source-map.json",
      "Divinity evidence card: fixture-extra-action-point-code-row-first-edit"
    ],
    notes: [
      "The Divinity fixture proves Data ED3 offset 9 for one code-row edit only; row stride and full layout come from source/decompiler evidence."
    ],
    promotionPolicy: "Treat ED3 as authored game data, but keep Divinity fixture claims scoped to the edited code byte."
  });

  add({
    id: "edcd-row-layout",
    target: "Data ED3/Data EDCD Extra AP rows",
    container: "Data EDCD",
    byteRange: "10-byte rows: extracode[0..4] as five signed big-endian shorts",
    classification: "authored game data",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "EDCD rows are authored action-parameter rows loaded by EDCD-backed opcodes.",
    evidence: [
      "docs/format-evidence-cards/edcd-opcode-source-map.md",
      "docs/generated/opcode-edcd-crosswalk.json",
      "src/editor/realmzEdcd.ts"
    ],
    notes: [
      `Crosswalk EDCD-backed opcode count: ${sourceState.providence.opcodeEdcdCrosswalk.summary?.edcdBacked ?? "unavailable"}`,
      `Crosswalk field comparison gaps: ${(sourceState.providence.opcodeEdcdCrosswalk.summary?.fieldComparisonGaps ?? []).length}`
    ],
    promotionPolicy: "Editable by opcode shape; unused imported rows remain preserved unless an explicit authoring operation owns replacement."
  });

  add({
    id: "edcd-allocation-reuse",
    target: "Data ED3/Data EDCD Extra AP rows",
    container: "Data EDCD",
    byteRange: "row allocation/reuse policy",
    classification: "authored game data",
    evidenceLabel: "correlated",
    conclusion: "Providence can reuse missing EDCD row IDs for new authoring, while existing imported unused rows are preserved; Divinity row allocation evidence remains noisy.",
    evidence: [
      "src/editor/edcdRows.ts nextUnusedEdcdRowId",
      "Divinity action-point ID-row fixture notes",
      "docs/generated/opcode-edcd-crosswalk.json"
    ],
    notes: [
      "The noisy Divinity ID-row path appended a zero EDCD row but also changed Scenario state and had ambiguous UI outcome.",
      "This is a policy conclusion for Providence preservation, not a clean Divinity allocation proof."
    ],
    promotionPolicy: "Do not compact or overwrite imported EDCD rows solely because they are currently unreferenced."
  });

  add({
    id: "edcd-common-action-mappings",
    target: "Data ED3/Data EDCD Extra AP rows",
    container: "Data EDCD and direct opcode IDs",
    byteRange: "opcode parameters",
    classification: "authored game data",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "Common mappings are covered by the opcode crosswalk: opcode 39 direct Extra AP, opcode 7 copy-source row, opcode 54 timed mutation, opcode 92 two EDCD rows, and opcode 122 fumble fields.",
    evidence: [
      "docs/generated/opcode-edcd-crosswalk.json",
      "docs/format-evidence-cards/edcd-opcode-source-map.md",
      "src/editor/generated/divinityOpcodeHelp.json"
    ],
    promotionPolicy: "Use shape-specific labels from the crosswalk; do not infer a generic EDCD field meaning across unrelated opcodes."
  });

  add({
    id: "data-ld-basic-tile",
    target: "Data LD/Data DL one-field fixtures",
    container: "Data LD",
    byteRange: "one-byte basic land tile changes at fixture-selected cells",
    classification: "authored game data",
    evidenceLabel: "fixture-proven",
    conclusion: "One-field Divinity land fixtures prove specific Data LD cell payload mutations.",
    evidence: [
      "Divinity evidence cards: fixture-land-one-tile-first-edit, fixture-land-second-basic-cell-first-edit",
      "docs/data-ld-dl-expansion-plan.md"
    ],
    notes: [
      "Associated Scenario offsets 30, 34, 429, 433, and 455 are editor state, not land payload."
    ],
    promotionPolicy: "Promote only the Data LD byte changed by the isolated land fixture."
  });

  add({
    id: "data-ld-special-reference",
    target: "Data LD/Data DL one-field fixtures",
    container: "Data LD",
    byteRange: "two-byte special land tile references at fixture-selected cells",
    classification: "authored game data",
    evidenceLabel: "fixture-proven",
    conclusion: "Special land placement fixtures prove authored Data LD special-reference storage at selected cells.",
    evidence: [
      "Divinity evidence card: fixture-special-land-tile-reference-first-edit",
      "Divinity evidence card: fixture-special-land-tile-reference-second-edit"
    ],
    promotionPolicy: "Keep Scenario selection bytes preserve-only; only the Data LD reference bytes are authored payload."
  });

  add({
    id: "data-dl-cell-fixtures",
    target: "Data LD/Data DL one-field fixtures",
    container: "Data DL",
    byteRange: "90x90 dungeon cell bitfields, two bytes per cell",
    classification: "authored game data",
    evidenceLabel: "fixture-proven",
    conclusion: "Dungeon one-cell fixtures prove Data DL as the authored dungeon cell store; source-backed bit taxonomy supplies broader passability/path/door/combat names.",
    evidence: [
      "Divinity dungeon wall/horizontal-door fixture cards",
      "docs/generated/dungeon-byte-ownership.json",
      "docs/generated/dungeon-cell-bit-taxonomy.json"
    ],
    notes: [
      "Fixture coverage proves selected cell writes, not every bit polarity.",
      "NoWallInBattle/combat expansion and movement/path bits are source-backed; visible/revealed runtime bits remain read-only preserve."
    ],
    promotionPolicy: "Promote bit meanings by source taxonomy and isolated fixture, not by noisy cell-click diffs that also update Scenario tool state."
  });

  add({
    id: "data-dl-runtime-bits",
    target: "Data LD/Data DL one-field fixtures",
    container: "Data DL",
    byteRange: "visibleArch/revealedSecret runtime-state bits",
    classification: "runtime/cache/generated data",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "Runtime visibility/reveal state is read-only preserve state, not an authoring target for the map editor.",
    evidence: [
      "docs/generated/dungeon-byte-ownership.json",
      "docs/generated/dungeon-cell-bit-taxonomy.json"
    ],
    promotionPolicy: "Do not author runtime reveal bits from the map editor workflow."
  });

  add({
    id: "data-dl-high-sign-bit",
    target: "Data LD/Data DL one-field fixtures",
    container: "Data DL",
    byteRange: "0x8000 high/sign compatibility bit",
    classification: "preserved compatibility bytes",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "The dungeon high/sign bit is preserved-known compatibility data and is not part of the primitive map authoring surface.",
    evidence: [
      "docs/generated/dungeon-byte-ownership.json",
      "docs/generated/dungeon-high-bit-audit.json"
    ],
    promotionPolicy: "Preserve imported high/sign bit values unless a future fixture/source path assigns an authoring meaning."
  });

  add({
    id: "td3-authored-core",
    target: "Data TD3 stuff[1..9]",
    container: "Data TD3",
    byteRange: "40-byte timed encounter rows; day..recquest plus stuff[0]",
    classification: "authored game data",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "Timed encounter schedule, gate fields, door/Extra AP target, and stuff[0] location kind are source-backed authored fields.",
    evidence: [
      "docs/generated/thief-timed-encounter-evidence.json",
      "docs/format-evidence-cards/thief-timed-encounter-runtime-anchors.md",
      "F:\\Realmz\\src\\realmz_orig\\textbox-time.c"
    ],
    promotionPolicy: "Author named TD3 core fields and preserve imported field values outside normal validation ranges unless the user edits them."
  });

  add({
    id: "td3-stuff-1-9",
    target: "Data TD3 stuff[1..9]",
    container: "Data TD3",
    byteRange: "stuff[1]..stuff[9], offsets 22..40 within each 40-byte row",
    classification: "preserved compatibility bytes",
    evidenceLabel: "correlated",
    conclusion: "The corpus shows repeatable nonzero values in active records, but source/runtime evidence only reads stuff[0] meaningfully; Providence should preserve and display these as compatibility data.",
    evidence: [
      "docs/generated/timed-encounter-reserved-fields.json",
      "docs/generated/timed-encounter-reserved-fields.md",
      "src/editor/panels/ScriptsPanel.tsx compatibility display"
    ],
    notes: [
      `Reserved-field findings: ${sourceState.providence.timedEncounterReservedFields.summary?.findingCount ?? "unavailable"} record(s) with nonzero values.`,
      "No Divinity label/write fixture for individual stuff[1..9] slots was found in this pass."
    ],
    promotionPolicy: "Do not label these slots as known authored fields until a source, decompiler, Divinity fixture, or runtime behavior names a slot."
  });

  add({
    id: "ctd3-runtime-cache",
    target: "Data TD3 stuff[1..9]",
    container: "CTD3",
    byteRange: "runtime copy of Data TD3",
    classification: "runtime/cache/generated data",
    evidenceLabel: "source/decompiler-supported",
    conclusion: "CTD3 is generated from Data TD3 at runtime/new game/load and mutated by gameplay actions.",
    evidence: [
      "docs/generated/thief-timed-encounter-evidence.json",
      "F:\\Realmz\\src\\realmz_orig\\setupnewgame.c",
      "F:\\Realmz\\src\\realmz_orig\\newland.c"
    ],
    promotionPolicy: "Use CTD3 only for relationship tracing and runtime archaeology; do not export it as authored source."
  });

  add({
    id: "remaining-scenario-support-bytes",
    target: "Still unknown preserved bytes",
    container: "Scenario support file",
    byteRange: "unlisted offsets outside current fixture/source ownership",
    classification: "still unknown",
    evidenceLabel: "unknown",
    conclusion: "Fresh compilation deterministically zero-fills unclaimed Scenario support bytes. Imported values remain unknown or preserve-only and are recovered only from the compatibility annex.",
    evidence: [
      "docs/generated/scenario-byte-ownership.json",
      "Divinity fixture-diff inventory"
    ],
    promotionPolicy: "Use the neutral zero baseline for fresh projects. Keep imported unclaimed offsets in the compatibility annex until isolated fixtures or source/decompiler anchors classify them."
  });

  return entries;
}

function summarize(entries) {
  const byClassification = countBy(entries, "classification");
  const byEvidenceLabel = countBy(entries, "evidenceLabel");
  const byTarget = countBy(entries, "target");
  return {
    entryCount: entries.length,
    targetCount: Object.keys(byTarget).length,
    byClassification,
    byEvidenceLabel,
    byTarget,
    stillUnknown: entries.filter((entry) => entry.classification === "still unknown").map((entry) => entry.id),
    promotionBlocked: entries
      .filter((entry) => entry.promotionPolicy?.toLowerCase().includes("do not") || entry.promotionPolicy?.toLowerCase().includes("preserve"))
      .map((entry) => entry.id)
  };
}

function writeReport(report, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  writeJson(path.join(targetDir, "preserved-byte-triage.json"), report);
  fs.writeFileSync(path.join(targetDir, "preserved-byte-triage.md"), renderMarkdown(report), "utf8");
}

function renderMarkdown(report) {
  const lines = [
    "# Preserved Byte Triage",
    "",
    "This report classifies noisy or unknown scenario bytes using Divinity fixtures, Providence evidence reports, source/decompiler-backed layouts, and existing generated tooling. It intentionally separates authored game data from Divinity editor UI state and preserve-only compatibility bytes.",
    "",
    "## Summary",
    "",
    `Entries: ${report.summary.entryCount}`,
    `Targets: ${report.summary.targetCount}`,
    "",
    "### Classifications",
    "",
    "| Classification | Entries |",
    "| --- | ---: |"
  ];
  for (const [classification, count] of Object.entries(report.summary.byClassification)) lines.push(`| ${classification} | ${count} |`);
  lines.push("", "### Evidence Labels", "", "| Evidence label | Entries |", "| --- | ---: |");
  for (const [label, count] of Object.entries(report.summary.byEvidenceLabel)) lines.push(`| ${label} | ${count} |`);

  lines.push("", "## Promotion Rules", "");
  for (const rule of report.promotionRules) lines.push(`- ${rule}`);

  lines.push("", "## Source Status", "");
  lines.push("| Source | Status | Summary |");
  lines.push("| --- | --- | --- |");
  for (const source of flattenSourceState(report.sourceState)) {
    lines.push(`| ${source.name} | ${source.exists ? "available" : "missing"} | ${source.summary} |`);
  }

  lines.push("", "## Triage Entries", "");
  lines.push("| Target | Container / bytes | Classification | Evidence | Conclusion |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const entry of report.entries) {
    lines.push(`| ${entry.target} | ${escapePipe(entry.container)}: ${escapePipe(entry.byteRange)} | ${entry.classification} | ${entry.evidenceLabel} | ${escapePipe(entry.conclusion)} |`);
  }

  lines.push("", "## Details", "");
  for (const entry of report.entries) {
    lines.push(`### ${entry.id}`, "");
    lines.push(`- target: ${entry.target}`);
    lines.push(`- container: ${entry.container}`);
    lines.push(`- byte range: ${entry.byteRange}`);
    lines.push(`- classification: ${entry.classification}`);
    lines.push(`- evidence label: ${entry.evidenceLabel}`);
    lines.push(`- conclusion: ${entry.conclusion}`);
    lines.push(`- promotion policy: ${entry.promotionPolicy}`);
    if (entry.notes.length) {
      lines.push("- notes:");
      for (const note of entry.notes) lines.push(`  - ${note}`);
    }
    lines.push("- evidence:");
    for (const evidence of entry.evidence) lines.push(`  - ${evidence}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function flattenSourceState(sourceState) {
  const rows = [];
  for (const [groupName, group] of Object.entries(sourceState.providence)) {
    rows.push({
      name: `providence.${groupName}`,
      exists: group.exists,
      summary: summarizeObject(group.summary)
    });
  }
  for (const [cardName, card] of Object.entries(sourceState.divinity.evidenceCards)) {
    rows.push({
      name: `divinity.${cardName}`,
      exists: card.exists,
      summary: summarizeObject(card.summary)
    });
  }
  rows.push({
    name: "divinity.capstoneIndex",
    exists: sourceState.divinity.capstoneIndex.exists,
    summary: summarizeObject(sourceState.divinity.capstoneIndex.summary)
  });
  rows.push({
    name: "divinity.binaryFileWriteMap",
    exists: sourceState.divinity.binaryFileWriteMap.exists,
    summary: sourceState.divinity.binaryFileWriteMap.exists ? sourceState.divinity.binaryFileWriteMap.path : "not found"
  });
  return rows;
}

function cardSummary(card) {
  return {
    id: card.id ?? null,
    confidence: card.confidence ?? null,
    followUpStatus: card.followUpStatus ?? null,
    byteOffsets: (card.byteOffsets ?? []).map((offset) => `${offset.file}:${offset.offset}+${offset.length}`)
  };
}

function stateForJson(file, summarize) {
  if (!fs.existsSync(file)) return { exists: false, path: file, summary: null };
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    return { exists: true, path: file, summary: summarize(json) };
  } catch (error) {
    return { exists: true, path: file, error: String(error), summary: null };
  }
}

function stateForFile(file) {
  return { exists: fs.existsSync(file), path: file };
}

function jsonTextIncludes(json, needle) {
  return JSON.stringify(json).includes(needle);
}

function countBy(entries, key) {
  const counts = {};
  for (const entry of entries) counts[entry[key]] = (counts[entry[key]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function summarizeObject(value) {
  if (!value) return "-";
  const parts = [];
  for (const [key, entry] of Object.entries(value)) {
    if (Array.isArray(entry)) {
      parts.push(`${key}=${entry.length ? entry.map((item) => typeof item === "object" ? JSON.stringify(item) : String(item)).join(", ") : "[]"}`);
    } else if (entry && typeof entry === "object") {
      parts.push(`${key}=${JSON.stringify(entry)}`);
    } else {
      parts.push(`${key}=${entry}`);
    }
  }
  return escapePipe(parts.join("; ") || "-");
}

function escapePipe(value) {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
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
      parsed.set(key, next);
    }
  }
  return parsed;
}

function stringArg(parsed, key) {
  const value = parsed.get(key);
  return typeof value === "string" ? value : "";
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
