import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const roundtripLedgerPath = path.join(repoRoot, "docs/generated/scenario-byte-roundtrip-ledger.json");
const byteOwnershipPath = path.join(repoRoot, "docs/generated/dungeon-byte-ownership.json");
const bitTaxonomyPath = path.join(repoRoot, "docs/generated/dungeon-cell-bit-taxonomy.json");
const primitiveGatePath = path.join(repoRoot, "docs/generated/dungeon-primitive-writer-gate.json");
const highBitAuditPath = path.join(repoRoot, "docs/generated/dungeon-high-bit-audit.json");

const MAP_SIZE = 90;
const CELL_COUNT = MAP_SIZE * MAP_SIZE;
const CELL_BYTES = 2;
const FIELD_BYTES = CELL_COUNT * CELL_BYTES;
const HIGH_BIT_MASK = 0xc000;
const UNRESOLVED_HIGH_SIGN_MASK = 0x8000;
const NO_WALL_IN_BATTLE_MASK = 0x4000;

const BIT_TAXONOMY = [
  {
    realmzBit: 0,
    mask: 0x8000,
    key: "unresolvedHighSignBit",
    authorLabel: "Unresolved high/sign bit",
    runtimeMeaning:
      "No source-backed Realmz runtime or Divinity editor consumer identified. Corpus examples include both plausible legacy dungeon combinations and malformed/ASCII-like imported runs, so Providence preserves this bit.",
    ownershipStatus: "preserved-unknown",
    writerStatus: "preserve-only",
    editorSurface: "Advanced Details",
    confidence: "unknown-active-risk"
  },
  {
    realmzBit: 1,
    mask: 0x4000,
    key: "noWallInBattle",
    authorLabel: "No Wall in Battle",
    runtimeMeaning:
      "Divinity labels this as No Wall in Battle. Realmz dungeon combat map conversion includes 0x4000 in mask 0x4F0E, making matching dungeon cells clear floor during outdoor-style combat expansion.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 2,
    mask: 0x2000,
    key: "visibleArch",
    authorLabel: "Revealed passage / arch",
    runtimeMeaning: "Realmz sets this when a directional secret is discovered; perspective view draws the revealed archway.",
    ownershipStatus: "runtime-state",
    writerStatus: "read-only-preserve",
    editorSurface: "Dungeon state preview",
    confidence: "source-backed-runtime-mutated"
  },
  {
    realmzBit: 3,
    mask: 0x1000,
    key: "actionPointMarker",
    authorLabel: "Action Point marker",
    runtimeMeaning: "Dungeon movement calls the Action Point dispatcher after moving onto cells with this marker.",
    ownershipStatus: "decoded-writable",
    writerStatus: "route-through-action-point-workflow",
    editorSurface: "Action Point placement",
    confidence: "source-backed"
  },
  {
    realmzBit: 4,
    mask: 0x0800,
    key: "allowMoveWest",
    authorLabel: "Allow Move Left",
    runtimeMeaning: "Directional secret/pass-through bit used by dungeon movement and secret discovery.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 5,
    mask: 0x0400,
    key: "allowMoveSouth",
    authorLabel: "Allow Move Down",
    runtimeMeaning: "Directional secret/pass-through bit used by dungeon movement and secret discovery.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 6,
    mask: 0x0200,
    key: "allowMoveEast",
    authorLabel: "Allow Move Right",
    runtimeMeaning: "Directional secret/pass-through bit used by dungeon movement and secret discovery.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 7,
    mask: 0x0100,
    key: "allowMoveNorth",
    authorLabel: "Allow Move Up",
    runtimeMeaning: "Directional secret/pass-through bit used by dungeon movement and secret discovery.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 8,
    mask: 0x0080,
    key: "unmapped",
    authorLabel: "Unmapped",
    runtimeMeaning: "Top-down dungeon view suppresses unmapped cells until runtime exploration reveals them.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed-runtime-mutated"
  },
  {
    realmzBit: 9,
    mask: 0x0040,
    key: "revealedSecret",
    authorLabel: "Secret discovered",
    runtimeMeaning: "Secret-search runtime sets this discovered marker.",
    ownershipStatus: "runtime-state",
    writerStatus: "read-only-preserve",
    editorSurface: "Dungeon state preview",
    confidence: "source-backed-runtime-mutated"
  },
  {
    realmzBit: 10,
    mask: 0x0020,
    key: "noteMarker",
    authorLabel: "Note marker",
    runtimeMeaning: "Dungeon note save/clear workflow sets this marker on cells with notes.",
    ownershipStatus: "decoded-writable",
    writerStatus: "route-through-note-workflow",
    editorSurface: "Notes workflow",
    confidence: "source-backed"
  },
  {
    realmzBit: 11,
    mask: 0x0010,
    key: "column",
    authorLabel: "Column",
    runtimeMeaning: "Perspective renderer draws columns; columns can combine with walls.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 12,
    mask: 0x0008,
    key: "stairs",
    authorLabel: "Stairs",
    runtimeMeaning: "Dungeon renderer draws stairs; movement requires an Action Point if stairs should change level/location.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 13,
    mask: 0x0004,
    key: "verticalDoor",
    authorLabel: "Vertical Door",
    runtimeMeaning: "Door orientation bit; Divinity describes vertical doors as visible while looking east or west.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 14,
    mask: 0x0002,
    key: "horizontalDoor",
    authorLabel: "Horizontal Door",
    runtimeMeaning: "Door orientation bit; Divinity describes horizontal doors as visible while looking north or south.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  },
  {
    realmzBit: 15,
    mask: 0x0001,
    key: "wall",
    authorLabel: "Wall",
    runtimeMeaning: "Solid dungeon wall for rendering and normal movement collision.",
    ownershipStatus: "decoded-writable",
    writerStatus: "writer-safe-primitive",
    editorSurface: "Dungeon primitive",
    confidence: "source-backed-manual-backed"
  }
];

const SOURCE_ANCHORS = [
  {
    source: "F:/Realmz/src/realmz_orig/threed.c",
    topics: ["movement", "top-down render", "Action Point marker"],
    note: "Movement/rendering consume Data DL field bits; bit index 3 dispatches Action Points."
  },
  {
    source: "F:/Realmz/src/realmz_orig/checkforsecret.c",
    topics: ["secret discovery", "directional pass-through"],
    note: "Search checks 0x0F00 directional bits and sets discovered/visible-arch markers."
  },
  {
    source: "F:/Realmz/src/realmz_orig/handlemenuchoice.c",
    topics: ["dungeon notes"],
    note: "Dungeon note save/clear owns the note marker bit."
  },
  {
    source: "F:/Realmz/src/realmz_orig/MacrocosmMain.c",
    topics: ["3D dungeon perspective"],
    note: "Perspective view derives walls, doors, arches, stairs, and columns from Data DL bits."
  },
  {
    source: "F:/Realmz/src/realmz_orig/combatmap.c",
    topics: ["dungeon combat map conversion"],
    note: "Dungeon combat terrain uses the 0x4F0E runtime mask after clearing the visible-arch marker; the mask includes 0x4000 No Wall in Battle."
  },
  {
    source: "F:/DocMaker/out/divinity-manual.txt:4087-4166",
    topics: ["Divinity Dungeon Editor labels"],
    note: "Manual labels wall, horizontal door, vertical door, stairs, column, unmapped, and Allow Move directions."
  },
  {
    source: "F:/DocMaker/out/divinity-manual.txt:4169-4173",
    topics: ["Divinity Dungeon Editor high-bit label"],
    note: "Manual labels No Wall in Battle and explains that such dungeon walls become clear floor tiles on combat maps."
  }
];

const PRIMITIVES = [
  primitive("wall", "Wall", ["wall"], "writer-safe-primitive"),
  primitive("horizontalDoor", "Horizontal Door", ["horizontalDoor"], "writer-safe-primitive"),
  primitive("verticalDoor", "Vertical Door", ["verticalDoor"], "writer-safe-primitive"),
  primitive("stairs", "Stairs", ["stairs"], "writer-safe-primitive"),
  primitive("column", "Column", ["column"], "writer-safe-primitive"),
  primitive("unmapped", "Unmapped", ["unmapped"], "writer-safe-primitive"),
  primitive("allowMoveNorth", "Allow Move Up", ["allowMoveNorth"], "writer-safe-primitive"),
  primitive("allowMoveEast", "Allow Move Right", ["allowMoveEast"], "writer-safe-primitive"),
  primitive("allowMoveSouth", "Allow Move Down", ["allowMoveSouth"], "writer-safe-primitive"),
  primitive("allowMoveWest", "Allow Move Left", ["allowMoveWest"], "writer-safe-primitive"),
  primitive("noteMarker", "Note marker", ["noteMarker"], "route-through-note-workflow"),
  primitive("actionPointMarker", "Action Point marker", ["actionPointMarker"], "route-through-action-point-workflow"),
  primitive("revealedSecret", "Secret discovered", ["revealedSecret"], "read-only-preserve"),
  primitive("visibleArch", "Revealed passage / arch", ["visibleArch"], "read-only-preserve"),
  primitive("noWallInBattle", "No Wall in Battle", ["noWallInBattle"], "writer-safe-primitive"),
  primitive("unresolvedHighSignBit", "Unresolved high/sign bit", ["unresolvedHighSignBit"], "preserve-only")
];

const roundtripLedger = readJson(roundtripLedgerPath);
const scan = scanDungeonFiles(roundtripLedger.scenarios ?? []);
const taxonomy = buildTaxonomy(scan);
const ownership = buildOwnership(scan, taxonomy);
const gate = buildPrimitiveGate(scan, taxonomy);
const highBitAudit = buildHighBitAudit(scan, taxonomy);

validateTaxonomy(taxonomy);
validateOwnership(ownership);
validatePrimitiveGate(gate);
validateHighBitAudit(highBitAudit, scan);

writeJson(bitTaxonomyPath, taxonomy);
writeJson(byteOwnershipPath, ownership);
writeJson(primitiveGatePath, gate);
writeCompactJson(highBitAuditPath, highBitAudit);

console.log(`Wrote ${path.relative(repoRoot, bitTaxonomyPath)}`);
console.log(`Wrote ${path.relative(repoRoot, byteOwnershipPath)}`);
console.log(`Wrote ${path.relative(repoRoot, primitiveGatePath)}`);
console.log(`Wrote ${path.relative(repoRoot, highBitAuditPath)}`);
console.log(JSON.stringify(ownership.summary, null, 2));

function primitive(id, label, bitKeys, writerStatus) {
  return {
    id,
    label,
    bitKeys,
    writerStatus,
    normalEditorPolicy:
      writerStatus === "writer-safe-primitive"
        ? "May be edited by named dungeon primitive commands after fixture proof; raw bit editing stays Advanced-only."
        : writerStatus === "route-through-note-workflow"
          ? "Do not edit directly from geometry tools; set through the dungeon note workflow."
          : writerStatus === "route-through-action-point-workflow"
            ? "Do not edit directly from geometry tools; set through Action Point placement."
            : "Preserve and display only until runtime/editor ownership is proven."
  };
}

function scanDungeonFiles(scenarios) {
  const files = [];
  const histogram = new Map();
  const bitCounts = new Map(BIT_TAXONOMY.map((bit) => [bit.key, 0]));
  const scenarioNames = new Set();
  let totalCells = 0;
  let totalBytes = 0;
  let totalLevels = 0;
  let nonzeroCells = 0;
  let unknownBitCells = 0;
  let highBitCells = 0;
  let noWallInBattleCells = 0;
  let bothHighBitCells = 0;
  let asciiLikeHighBitCells = 0;
  const highBitCellDetails = [];
  const alignmentIssues = [];

  for (const scenario of scenarios) {
    const sourcePath = scenario.sourcePath;
    if (!sourcePath || !fs.existsSync(sourcePath)) continue;
    const dataPath = path.join(sourcePath, "Data DL");
    if (!fs.existsSync(dataPath)) continue;
    const buffer = fs.readFileSync(dataPath);
    const levels = Math.floor(buffer.length / FIELD_BYTES);
    const trailingBytes = buffer.length % FIELD_BYTES;
    scenarioNames.add(`${scenario.sourceRoot}/${scenario.name}`);
    totalBytes += buffer.length;
    totalLevels += levels;
    if (trailingBytes !== 0) {
      alignmentIssues.push({
        scenario: scenario.name,
        sourceRoot: scenario.sourceRoot,
        bytes: buffer.length,
        trailingBytes
      });
    }
    const fileSummary = {
      scenario: scenario.name,
      sourceRoot: scenario.sourceRoot,
      sourcePath: normalizePath(sourcePath),
      bytes: buffer.length,
      levels,
      trailingBytes,
      cells: levels * CELL_COUNT,
      nonzeroCells: 0,
      highBitCells: 0,
      unresolvedHighSignBitCells: 0,
      noWallInBattleCells: 0,
      bothHighBitCells: 0,
      asciiLikeHighBitCells: 0
    };
    for (let offset = 0; offset + 1 < levels * FIELD_BYTES; offset += 2) {
      const value = buffer.readUInt16BE(offset);
      const level = Math.floor(offset / FIELD_BYTES);
      const cellOffset = offset % FIELD_BYTES;
      const cellIndex = Math.floor(cellOffset / CELL_BYTES);
      const x = cellIndex % MAP_SIZE;
      const y = Math.floor(cellIndex / MAP_SIZE);
      totalCells += 1;
      if (value !== 0) {
        nonzeroCells += 1;
        fileSummary.nonzeroCells += 1;
      }
      if ((value & UNRESOLVED_HIGH_SIGN_MASK) !== 0) {
        unknownBitCells += 1;
        fileSummary.unresolvedHighSignBitCells += 1;
      }
      if ((value & NO_WALL_IN_BATTLE_MASK) !== 0) {
        noWallInBattleCells += 1;
        fileSummary.noWallInBattleCells += 1;
      }
      if ((value & HIGH_BIT_MASK) !== 0) {
        highBitCells += 1;
        fileSummary.highBitCells += 1;
        if ((value & HIGH_BIT_MASK) === HIGH_BIT_MASK) {
          bothHighBitCells += 1;
          fileSummary.bothHighBitCells += 1;
        }
        const asciiPair = asciiPairForValue(value);
        const asciiLike = Boolean(asciiPair);
        if (asciiLike) {
          asciiLikeHighBitCells += 1;
          fileSummary.asciiLikeHighBitCells += 1;
        }
        highBitCellDetails.push({
          scenario: scenario.name,
          sourceRoot: scenario.sourceRoot,
          level,
          x,
          y,
          cellIndex,
          offset,
          rawValue: value,
          signedValue: value > 0x7fff ? value - 0x10000 : value,
          rawHex: hex16(value),
          knownMask: value & ~UNRESOLVED_HIGH_SIGN_MASK,
          highBits: {
            unresolvedHighSignBit: (value & UNRESOLVED_HIGH_SIGN_MASK) !== 0,
            noWallInBattle: (value & NO_WALL_IN_BATTLE_MASK) !== 0
          },
          knownBits: labelsForValue(value).filter((label) => label !== "Unresolved high/sign bit"),
          asciiPair,
          asciiLike,
          neighbors: neighborContext(buffer, levels, level, x, y)
        });
      }
      histogram.set(value, (histogram.get(value) ?? 0) + 1);
      for (const bit of BIT_TAXONOMY) {
        if ((value & bit.mask) !== 0) {
          bitCounts.set(bit.key, (bitCounts.get(bit.key) ?? 0) + 1);
        }
      }
    }
    files.push(fileSummary);
  }

  const observedPatterns = [...histogram.entries()]
    .map(([value, count]) => ({
      value,
      signedValue: value > 0x7fff ? value - 0x10000 : value,
      hex: hex16(value),
      count,
      percent: percent(count, totalCells),
      labels: labelsForValue(value)
    }))
    .sort((a, b) => b.count - a.count || a.value - b.value);

  const rarePatterns = observedPatterns
    .filter((entry) => entry.count <= 3 && entry.value !== 0)
    .slice(0, 60);

  const unknownPatterns = observedPatterns
    .filter((entry) => (entry.value & UNRESOLVED_HIGH_SIGN_MASK) !== 0)
    .slice(0, 40);
  const highBitPatterns = observedPatterns
    .filter((entry) => (entry.value & HIGH_BIT_MASK) !== 0)
    .slice(0, 80);

  return {
    files,
    scenarioCount: scenarioNames.size,
    dataDlFiles: files.length,
    totalBytes,
    totalLevels,
    totalCells,
    nonzeroCells,
    unknownBitCells,
    highBitCells,
    noWallInBattleCells,
    bothHighBitCells,
    asciiLikeHighBitCells,
    highBitCellDetails,
    bitCounts,
    observedPatterns,
    rarePatterns,
    unknownPatterns,
    highBitPatterns,
    alignmentIssues
  };
}

function buildTaxonomy(scan) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      realmzRuntime: "F:/Realmz/src/realmz_orig",
      divinityManual: "F:/DocMaker/out/divinity-manual.txt",
      priorEvidence: [
        "docs/generated/dungeon-bitfield-evidence.json",
        "docs/generated/dungeon-high-bit-audit.json",
        "docs/format-evidence-cards/dungeon-runtime-anchors.md",
        "docs/format-evidence-cards/dungeon-editor-writer-safety.md"
      ]
    },
    convention: {
      cellBytes: CELL_BYTES,
      cellType: "signed big-endian 16-bit field",
      realmzBitIndex: "MyrBitTstShort(&value, b) maps source bit index b to mask 1 << (15 - b).",
      mapSize: `${MAP_SIZE} x ${MAP_SIZE}`,
      cellsPerLevel: CELL_COUNT,
      bytesPerLevel: FIELD_BYTES
    },
    sourceAnchors: SOURCE_ANCHORS,
    bits: BIT_TAXONOMY.map((bit) => ({
      ...bit,
      maskHex: hex16(bit.mask),
      observedCells: scan.bitCounts.get(bit.key) ?? 0,
      observedPercent: percent(scan.bitCounts.get(bit.key) ?? 0, scan.totalCells)
    })),
    masks: {
      knownMask: hex16(BIT_TAXONOMY.filter((bit) => bit.ownershipStatus !== "preserved-unknown").reduce((mask, bit) => mask | bit.mask, 0)),
      highBitMask: hex16(HIGH_BIT_MASK),
      unknownMask: hex16(UNRESOLVED_HIGH_SIGN_MASK),
      noWallInBattleMask: hex16(NO_WALL_IN_BATTLE_MASK),
      directionalAllowMoveMask: "0x0F00",
      doorOrientationMask: "0x0006",
      dungeonCombatHoleMask: "0x4F0E"
    },
    observedPatterns: scan.observedPatterns.slice(0, 120),
    rarePatterns: scan.rarePatterns,
    highBitPatterns: scan.highBitPatterns,
    unknownBitPatterns: scan.unknownPatterns
  };
}

function buildOwnership(scan, taxonomy) {
  const recordByteRanges = [];
  for (let cellIndex = 0; cellIndex < CELL_COUNT; cellIndex += 1) {
    const start = cellIndex * CELL_BYTES;
    recordByteRanges.push({
      start,
      length: CELL_BYTES,
      endExclusive: start + CELL_BYTES,
      status: "decoded-writable",
      field: `Dungeon cell ${cellIndexToCoord(cellIndex)}`,
      internal: `field[${cellIndex}]`,
      bitTaxonomy: "docs/generated/dungeon-cell-bit-taxonomy.json"
    });
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    container: "Data DL",
    authorFacingName: "Dungeon cell bitfields",
    sources: {
      bitTaxonomy: "docs/generated/dungeon-cell-bit-taxonomy.json",
      primitiveGate: "docs/generated/dungeon-primitive-writer-gate.json",
      highBitAudit: "docs/generated/dungeon-high-bit-audit.json",
      priorEvidence: "docs/generated/dungeon-bitfield-evidence.json"
    },
    summary: {
      scenarioCount: scan.scenarioCount,
      dataDlFiles: scan.dataDlFiles,
      levels: scan.totalLevels,
      bytes: scan.totalBytes,
      cells: scan.totalCells,
      nonzeroCells: scan.nonzeroCells,
      highBitCells: scan.highBitCells,
      unresolvedHighSignBitCells: scan.unknownBitCells,
      noWallInBattleCells: scan.noWallInBattleCells,
      bothHighBitCells: scan.bothHighBitCells,
      asciiLikeHighBitCells: scan.asciiLikeHighBitCells,
      bytesPerLevel: FIELD_BYTES,
      cellsPerLevel: CELL_COUNT,
      bitStatuses: countBy(taxonomy.bits, "ownershipStatus"),
      writerStatuses: countBy(taxonomy.bits, "writerStatus"),
      alignmentIssues: scan.alignmentIssues.length
    },
    recordLayout: {
      bytesPerLevel: FIELD_BYTES,
      width: MAP_SIZE,
      height: MAP_SIZE,
      cellBytes: CELL_BYTES,
      cellCount: CELL_COUNT,
      endian: "big-endian",
      signed: true
    },
    recordByteRanges,
    bitOwnership: taxonomy.bits.map((bit) => ({
      realmzBit: bit.realmzBit,
      key: bit.key,
      mask: bit.maskHex,
      label: bit.authorLabel,
      ownershipStatus: bit.ownershipStatus,
      writerStatus: bit.writerStatus,
      observedCells: bit.observedCells,
      observedPercent: bit.observedPercent
    })),
    fileSummaries: scan.files,
    alignmentIssues: scan.alignmentIssues,
    validation: {
      allBytesMappedByCellTemplate: recordByteRanges.length === CELL_COUNT,
      bitCoverageComplete: taxonomy.bits.length === 16,
      unknownBitsPreserved: taxonomy.bits
        .filter((bit) => bit.ownershipStatus === "preserved-unknown")
        .every((bit) => bit.writerStatus === "preserve-only"),
      byteRangesDoNotOverlap: true
    }
  };
}

function buildPrimitiveGate(scan, taxonomy) {
  const bitByKey = new Map(taxonomy.bits.map((bit) => [bit.key, bit]));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    container: "Data DL",
    policy: {
      normalEditor:
        "Expose named primitives only. Do not expose a normal raw dungeon bit editor; raw masks stay under Advanced Details.",
      writerRule:
        "A primitive may be writable only when its bits have source-backed runtime meaning, Divinity/editor labels, fixture roundtrip coverage, and read-modify-write behavior that preserves unrelated bits.",
      routedWorkflowRule:
        "Note and Action Point marker bits are source-backed but should be changed through their owning workflows, not generic geometry painting.",
      runtimeStateRule:
        "Secret-discovered and visible-arch state is runtime-mutated and remains read-only/preserved until Divinity writer evidence proves authored defaults."
    },
    primitives: PRIMITIVES.map((entry) => {
      const bits = entry.bitKeys.map((key) => bitByKey.get(key)).filter(Boolean);
      return {
        ...entry,
        bits: bits.map((bit) => ({
          key: bit.key,
          mask: bit.maskHex,
          realmzBit: bit.realmzBit,
          ownershipStatus: bit.ownershipStatus,
          observedCells: bit.observedCells
        })),
        observedCells: bits.reduce((sum, bit) => sum + (bit.observedCells ?? 0), 0),
        testStatus:
          entry.writerStatus === "writer-safe-primitive"
            ? "covered-by-dungeon-cell-helper-tests"
            : "preserve-or-route-only"
      };
    }),
    corpus: {
      dataDlFiles: scan.dataDlFiles,
      levels: scan.totalLevels,
      cells: scan.totalCells,
      rarePatterns: scan.rarePatterns.slice(0, 20),
      highBitPatterns: scan.highBitPatterns.slice(0, 20),
      unknownBitPatterns: scan.unknownPatterns.slice(0, 20)
    }
  };
}

function buildHighBitAudit(scan, taxonomy) {
  const scenarioSummaries = scan.files
    .filter((file) => file.highBitCells > 0)
    .map((file) => ({
      scenario: file.scenario,
      sourceRoot: file.sourceRoot,
      sourcePath: file.sourcePath,
      levels: file.levels,
      highBitCells: file.highBitCells,
      unresolvedHighSignBitCells: file.unresolvedHighSignBitCells,
      noWallInBattleCells: file.noWallInBattleCells,
      bothHighBitCells: file.bothHighBitCells,
      asciiLikeHighBitCells: file.asciiLikeHighBitCells
    }))
    .sort((a, b) => b.highBitCells - a.highBitCells || a.scenario.localeCompare(b.scenario));
  const cellsByScenario = groupHighBitCells(scan.highBitCellDetails);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    container: "Data DL",
    purpose:
      "Focused audit for dungeon field high bits 0x8000 and 0x4000. This separates the proven No Wall in Battle primitive from the unresolved high/sign bit.",
    verdicts: {
      "0x4000": {
        key: "noWallInBattle",
        verdict: "decoded-writable",
        authorLabel: "No Wall in Battle",
        preservationReason:
          "Realmz consumes this bit in dungeon combat-map conversion and Divinity exposes the matching editor label.",
        evidence: [
          "F:/Realmz/src/realmz_orig/combatmap.c:64-68",
          "F:/DocMaker/out/divinity-manual.txt:4169-4173"
        ]
      },
      "0x8000": {
        key: "unresolvedHighSignBit",
        verdict: "preserved-unknown",
        authorLabel: "Unresolved high/sign bit",
        preservationReason:
          "No Realmz runtime consumer or Divinity editor label has been identified. Corpus includes plausible legacy bit combinations and malformed/ASCII-like runs, so the safest scenario-semantic model is preserve-only.",
        evidence: [
          "docs/generated/dungeon-high-bit-audit.json",
          "docs/format-evidence-cards/dungeon-runtime-anchors.md"
        ]
      }
    },
    sourceAnchors: SOURCE_ANCHORS.filter((anchor) =>
      anchor.topics.some((topic) => topic.toLowerCase().includes("combat") || topic.toLowerCase().includes("high-bit"))
    ),
    summary: {
      scenarioCount: scan.scenarioCount,
      dataDlFiles: scan.dataDlFiles,
      highBitCells: scan.highBitCells,
      unresolvedHighSignBitCells: scan.unknownBitCells,
      noWallInBattleCells: scan.noWallInBattleCells,
      bothHighBitCells: scan.bothHighBitCells,
      asciiLikeHighBitCells: scan.asciiLikeHighBitCells,
      scenariosWithHighBits: scenarioSummaries.length
    },
    patterns: {
      highBitPatterns: scan.highBitPatterns,
      unresolvedHighSignBitPatterns: scan.unknownPatterns,
      topObservedPatterns: scan.observedPatterns.slice(0, 60)
    },
    scenarioSummaries,
    cellColumns: [
      "level",
      "x",
      "y",
      "rawValue",
      "signedValue",
      "highMask",
      "knownMask",
      "asciiPair",
      "north",
      "east",
      "south",
      "west"
    ],
    cellsByScenario,
    taxonomy: taxonomy.bits
      .filter((bit) => (bit.mask & HIGH_BIT_MASK) !== 0)
      .map((bit) => ({
        key: bit.key,
        label: bit.authorLabel,
        mask: bit.maskHex,
        ownershipStatus: bit.ownershipStatus,
        writerStatus: bit.writerStatus,
        observedCells: bit.observedCells,
        observedPercent: bit.observedPercent
      })),
    validation: {
      allHighBitCellsAccountedFor: countGroupedCells(cellsByScenario) === scan.highBitCells,
      noWallInBattleSourceBacked: true,
      unresolvedHighSignBitPreserved: true
    }
  };
}

function groupHighBitCells(cells) {
  const grouped = new Map();
  for (const cell of cells) {
    const key = `${cell.sourceRoot}/${cell.scenario}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        scenario: cell.scenario,
        sourceRoot: cell.sourceRoot,
        cells: []
      });
    }
    grouped.get(key).cells.push([
      cell.level,
      cell.x,
      cell.y,
      cell.rawValue,
      cell.signedValue,
      (cell.highBits.unresolvedHighSignBit ? UNRESOLVED_HIGH_SIGN_MASK : 0) |
        (cell.highBits.noWallInBattle ? NO_WALL_IN_BATTLE_MASK : 0),
      cell.knownMask,
      cell.asciiPair ?? "",
      cell.neighbors.north?.rawValue ?? null,
      cell.neighbors.east?.rawValue ?? null,
      cell.neighbors.south?.rawValue ?? null,
      cell.neighbors.west?.rawValue ?? null
    ]);
  }
  return [...grouped.values()].sort((a, b) =>
    b.cells.length - a.cells.length || `${a.sourceRoot}/${a.scenario}`.localeCompare(`${b.sourceRoot}/${b.scenario}`)
  );
}

function countGroupedCells(groups) {
  return groups.reduce((sum, group) => sum + group.cells.length, 0);
}

function validateTaxonomy(taxonomy) {
  if (taxonomy.bits.length !== 16) throw new Error(`Expected 16 dungeon bits, found ${taxonomy.bits.length}`);
  const masks = new Set();
  const realmzBits = new Set();
  for (const bit of taxonomy.bits) {
    if (!bit.ownershipStatus) throw new Error(`${bit.key} is missing ownershipStatus`);
    if (!bit.writerStatus) throw new Error(`${bit.key} is missing writerStatus`);
    if (masks.has(bit.mask)) throw new Error(`Duplicate dungeon bit mask ${bit.maskHex}`);
    masks.add(bit.mask);
    if (realmzBits.has(bit.realmzBit)) throw new Error(`Duplicate Realmz bit index ${bit.realmzBit}`);
    realmzBits.add(bit.realmzBit);
  }
  const maskUnion = taxonomy.bits.reduce((mask, bit) => mask | bit.mask, 0);
  if (maskUnion !== 0xffff) throw new Error(`Dungeon bit taxonomy does not cover all 16 bits: ${hex16(maskUnion)}`);
}

function validateHighBitAudit(audit, scan) {
  if (!audit.validation.allHighBitCellsAccountedFor) {
    throw new Error(`High-bit audit has ${countGroupedCells(audit.cellsByScenario)} cells, expected ${scan.highBitCells}`);
  }
  if (audit.verdicts["0x4000"].verdict !== "decoded-writable") {
    throw new Error("No Wall in Battle is not marked decoded-writable");
  }
  if (audit.verdicts["0x8000"].verdict !== "preserved-unknown") {
    throw new Error("Unresolved high/sign bit is not marked preserved-unknown");
  }
}

function validateOwnership(ownership) {
  if (ownership.recordByteRanges.length !== CELL_COUNT) {
    throw new Error(`Expected ${CELL_COUNT} cell byte ranges, found ${ownership.recordByteRanges.length}`);
  }
  let previousEnd = 0;
  for (const range of ownership.recordByteRanges) {
    if (range.start !== previousEnd) throw new Error(`Dungeon cell byte gap or overlap at ${previousEnd}-${range.start}`);
    if (range.length !== CELL_BYTES || range.endExclusive !== range.start + CELL_BYTES) {
      throw new Error(`Invalid dungeon cell byte range at ${range.start}`);
    }
    previousEnd = range.endExclusive;
  }
  if (previousEnd !== FIELD_BYTES) throw new Error(`Dungeon cell byte ranges end at ${previousEnd}, expected ${FIELD_BYTES}`);
  if (!ownership.validation.unknownBitsPreserved) throw new Error("Unknown dungeon bits are not preserve-only");
  if (ownership.alignmentIssues.length > 0) {
    throw new Error(`Data DL alignment issue(s): ${ownership.alignmentIssues.map((issue) => `${issue.scenario}:${issue.trailingBytes}`).join(", ")}`);
  }
}

function validatePrimitiveGate(gate) {
  const missing = gate.primitives.filter((primitive) => primitive.bits.length !== primitive.bitKeys.length);
  if (missing.length > 0) {
    throw new Error(`Primitive bit references missing from taxonomy: ${missing.map((primitive) => primitive.id).join(", ")}`);
  }
  const unsafeWritable = gate.primitives.filter((primitive) =>
    primitive.writerStatus === "writer-safe-primitive" &&
    primitive.bits.some((bit) => bit.ownershipStatus !== "decoded-writable")
  );
  if (unsafeWritable.length > 0) {
    throw new Error(`Writer-safe primitive includes non-writable bit(s): ${unsafeWritable.map((primitive) => primitive.id).join(", ")}`);
  }
}

function labelsForValue(value) {
  return BIT_TAXONOMY
    .filter((bit) => (value & bit.mask) !== 0)
    .map((bit) => bit.authorLabel);
}

function neighborContext(buffer, levels, level, x, y) {
  return {
    north: compactCellAt(buffer, levels, level, x, y - 1),
    east: compactCellAt(buffer, levels, level, x + 1, y),
    south: compactCellAt(buffer, levels, level, x, y + 1),
    west: compactCellAt(buffer, levels, level, x - 1, y)
  };
}

function compactCellAt(buffer, levels, level, x, y) {
  if (level < 0 || level >= levels || x < 0 || x >= MAP_SIZE || y < 0 || y >= MAP_SIZE) {
    return null;
  }
  const offset = level * FIELD_BYTES + (y * MAP_SIZE + x) * CELL_BYTES;
  const value = buffer.readUInt16BE(offset);
  return {
    rawValue: value,
    signedValue: value > 0x7fff ? value - 0x10000 : value
  };
}

function asciiPairForValue(value) {
  const high = (value >> 8) & 0xff;
  const low = value & 0xff;
  if (isLikelyTextByte(high) && isLikelyTextByte(low)) {
    return String.fromCharCode(high, low);
  }
  return null;
}

function isLikelyTextByte(value) {
  return value === 0x09 || value === 0x0a || value === 0x0d || (value >= 0x20 && value <= 0x7e);
}

function cellIndexToCoord(cellIndex) {
  const x = cellIndex % MAP_SIZE;
  const y = Math.floor(cellIndex / MAP_SIZE);
  return `${x},${y}`;
}

function countBy(values, key) {
  return values.reduce((counts, value) => {
    const status = value[key];
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

function percent(count, total) {
  if (!total) return 0;
  return Number(((count / total) * 100).toFixed(4));
}

function hex16(value) {
  return `0x${(value & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function writeCompactJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data)}\n`);
}
