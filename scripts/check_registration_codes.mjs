import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const sourcePath = path.join(repoRoot, "src", "editor", "registrationCodes.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    strict: true
  },
  fileName: sourcePath
}).outputText;

const sandbox = {
  exports: {},
  module: { exports: {} },
  require,
  console
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(compiled, sandbox, { filename: sourcePath });

const {
  REGISTRATION_EVIDENCE_VECTORS,
  cStringToPascal,
  decodeSecuritySegments,
  encodeSecuritySegments,
  macBundledClassic,
  macCustomLegacy,
  matchingEvidenceVectors,
  pascalStringBytes,
  pcBundledV71,
  pcCustomV71,
  registrationVariantsFor,
  stringToNumMasked
} = sandbox.module.exports;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

assertEqual(JSON.stringify(pascalStringBytes("RZ")), JSON.stringify([2, 82, 90]), "Pascal string bytes");
assertEqual(JSON.stringify(cStringToPascal([82, 90, 0, 88])), JSON.stringify([2, 82, 90]), "C string to Pascal");
assertEqual(stringToNumMasked(pascalStringBytes("2:")), 30, "StringToNum masked digits");
assertEqual(stringToNumMasked(pascalStringBytes("RABREAUS")), 21225153, "StringToNum nonnumeric legacy behavior");

const encoded = encodeSecuritySegments("MacMade", "System 6.0.1", { codeseg1: new Array(20).fill(0), codeseg2: new Array(20).fill(0) });
const decoded = decodeSecuritySegments({ codeseg1: encoded.codeseg1, codeseg2: encoded.codeseg2 }, { codeseg1: encoded.backupCodeseg1, codeseg2: encoded.backupCodeseg2 });
assertEqual(decoded.segment1, "MacMade", "Segment demix segment 1");
assertEqual(decoded.segment2, "System 6.0.1", "Segment demix segment 2");

const realmzScenarioRoot = "F:\\Realmz\\base\\Realmz\\Scenarios";
const officialSlots = new Map([
  ["preludetopestilence", 11],
  ["assaultongiantmountain", 12],
  ["destroythenecronomicon", 13],
  ["castleintheclouds", 14],
  ["grilochsrevenge", 15],
  ["whitedragon", 16],
  ["mithrilvault", 17],
  ["twinsandsoftime", 18],
  ["troubleintheswordlands", 19],
  ["warintheswordlands", 20],
  ["halftruth", 21],
  ["wrathofthemindlords", 21]
]);
const canonicalScenarioFolders = new Map([
  ["preludetopestilence", "Prelude to Pestilence"],
  ["assaultongiantmountain", "Assault on Giant Mountain"],
  ["destroythenecronomicon", "Destroy the Necronomicon"],
  ["castleintheclouds", "Castle in the Clouds"],
  ["grilochsrevenge", "Grilochs Revenge"],
  ["whitedragon", "White Dragon"],
  ["mithrilvault", "Mithril Vault"],
  ["twinsandsoftime", "Twin Sands of Time"],
  ["troubleintheswordlands", "Trouble in the Sword Lands"],
  ["warintheswordlands", "War in the Sword Lands"],
  ["halftruth", "Half Truth"],
  ["wrathofthemindlords", "Wrath of the Mind Lords"]
]);
const bundledShellFieldFixtures = new Map([
  ["preludetopestilence", { recLevel: 30, maxLevel: 36 }],
  ["assaultongiantmountain", { recLevel: 36, maxLevel: 99 }],
  ["destroythenecronomicon", { recLevel: 72, maxLevel: 17 }],
  ["castleintheclouds", { recLevel: 42, maxLevel: 52 }],
  ["grilochsrevenge", { recLevel: 90, maxLevel: 37 }],
  ["whitedragon", { recLevel: 125, maxLevel: 44 }],
  ["mithrilvault", { recLevel: 170, maxLevel: 26 }],
  ["twinsandsoftime", { recLevel: 18, maxLevel: 36 }],
  ["troubleintheswordlands", { recLevel: 30, maxLevel: 74 }],
  ["warintheswordlands", { recLevel: 72, maxLevel: 84 }],
  ["halftruth", { recLevel: 54, maxLevel: 81 }],
  ["wrathofthemindlords", { recLevel: 108, maxLevel: 61 }]
]);

function normalizeScenarioName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function readScenarioShellFields(scenarioName) {
  const key = normalizeScenarioName(scenarioName);
  const folder = canonicalScenarioFolders.get(key);
  const slot = officialSlots.get(key);
  const fixture = bundledShellFieldFixtures.get(key);
  if (!folder || !slot) return fixture && slot ? { ...fixture, scenarioSlot: slot } : null;
  const shellPath = path.join(realmzScenarioRoot, folder, folder);
  if (!fs.existsSync(shellPath)) return fixture ? { ...fixture, scenarioSlot: slot } : null;
  const buffer = fs.readFileSync(shellPath);
  if (buffer.byteLength < 8) return fixture ? { ...fixture, scenarioSlot: slot } : null;
  const localShell = {
    recLevel: buffer.readInt32BE(0),
    maxLevel: buffer.readInt32BE(4),
    scenarioSlot: slot
  };
  if (fixture) {
    assertEqual(localShell.recLevel, fixture.recLevel, `${folder} local shell recLevel`);
    assertEqual(localShell.maxLevel, fixture.maxLevel, `${folder} local shell maxLevel`);
  }
  return localShell;
}

const assaultInput = {
  scenarioName: "Assault on Giant Mountain",
  segment1: "MacMade",
  segment2: "System 6.0.1",
  registrationName: "RABREAUS"
};
assertEqual(pcCustomV71(assaultInput, 9140886), 302536472, "PC custom v7.1 source formula");
assertEqual(macCustomLegacy(assaultInput, 9140886), 1794494882, "Mac classic legacy candidate formula");
assertEqual(
  pcBundledV71(assaultInput, 9140886, 12, 36, 99),
  1840485,
  "Windows bundled Assault source formula"
);
assertEqual(
  macBundledClassic(assaultInput, 9140886, 12, 36, 99),
  58371333,
  "Mac bundled Assault classic source formula"
);

const rabreauAssaultVariants = registrationVariantsFor({ ...assaultInput, serialNumber: "9140886", scenarioSlot: 12, recLevel: 36, maxLevel: 99 });
assert(
  rabreauAssaultVariants.some((variant) => variant.code === "58371333" && variant.confidence === "verified"),
  "RABREAUS Assault should include verified official Mac code"
);
assert(
  rabreauAssaultVariants.some((variant) => variant.code === "1840485" && variant.confidence === "verified"),
  "RABREAUS Assault should include verified official Windows code"
);
assert(
  registrationVariantsFor({
    scenarioName: "Grilochs Revenge",
    segment1: "Very Aggresive",
    segment2: "Stocks Rock",
    registrationName: "JONESC",
    serialNumber: "9515615"
  }).some((variant) => variant.code === "481007" && variant.confidence === "verified"),
  "Scenario title punctuation should not block official vector matching"
);
assert(
  registrationVariantsFor({
    scenarioName: "War in the Sword Lands",
    segment1: "",
    segment2: "",
    registrationName: "AMBERK",
    serialNumber: "13706024",
    scenarioSlot: 20,
    recLevel: 72,
    maxLevel: 84
  }).some((variant) => variant.algorithmId === "pcBundledV71" && variant.code === "933071" && variant.confidence === "verified"),
  "AMBERK War vector should verify the Windows bundled formula"
);

for (const vector of REGISTRATION_EVIDENCE_VECTORS) {
  const shell = readScenarioShellFields(vector.scenarioName);
  const variants = registrationVariantsFor({
    scenarioName: vector.scenarioName,
    segment1: vector.segment1 ?? "",
    segment2: vector.segment2 ?? "",
    registrationName: vector.registrationName,
    serialNumber: vector.serialNumber,
    scenarioSlot: shell?.scenarioSlot,
    recLevel: shell?.recLevel,
    maxLevel: shell?.maxLevel
  });
  const evidence = matchingEvidenceVectors({
    scenarioName: vector.scenarioName,
    segment1: vector.segment1 ?? "",
    segment2: vector.segment2 ?? "",
    registrationName: vector.registrationName,
    serialNumber: vector.serialNumber
  });
  assert(
    evidence.some((match) => match.expectedCode === vector.expectedCode && match.status === vector.status),
    `Evidence vector should match ${vector.scenarioName} ${vector.expectedCode}`
  );
  assert(
    variants.some((variant) => variant.code === vector.expectedCode && variant.confidence === "verified"),
    `Official Fantasoft Mac vector should be verified for ${vector.scenarioName}`
  );
}

const windowsExactMatches = [];
const macClassicExactMatches = [];
const unresolvedOfficialVectors = [];
for (const vector of REGISTRATION_EVIDENCE_VECTORS.filter((entry) => entry.status !== "reported")) {
  const shell = readScenarioShellFields(vector.scenarioName);
  if (!shell?.scenarioSlot || !shell.recLevel || !shell.maxLevel) continue;
  const input = {
    scenarioName: vector.scenarioName,
    segment1: vector.segment1 ?? "",
    segment2: vector.segment2 ?? "",
    registrationName: vector.registrationName
  };
  if (vector.status === "official-windows") {
    const actual = String(pcBundledV71(input, Number(vector.serialNumber), shell.scenarioSlot, shell.recLevel, shell.maxLevel));
    if (actual === vector.expectedCode) {
      windowsExactMatches.push(vector);
    } else {
      unresolvedOfficialVectors.push(`${vector.status} ${vector.scenarioName}: expected ${vector.expectedCode}, source formula produced ${actual}`);
    }
  }
  if (vector.status === "official-mac" && shell.scenarioSlot <= 14) {
    const actual = String(macBundledClassic(input, Number(vector.serialNumber), shell.scenarioSlot, shell.recLevel, shell.maxLevel));
    if (actual === vector.expectedCode) {
      macClassicExactMatches.push(vector);
    } else {
      throw new Error(`Mac classic bundled formula mismatch for ${vector.scenarioName}: expected ${vector.expectedCode}, got ${actual}`);
    }
  }
}

assert(windowsExactMatches.length >= 10, `Expected at least 10 exact Windows bundled matches, got ${windowsExactMatches.length}`);
assert(macClassicExactMatches.length >= 8, `Expected at least 8 exact Mac classic bundled matches, got ${macClassicExactMatches.length}`);

console.log(
  `Registration code checks passed (${REGISTRATION_EVIDENCE_VECTORS.length} evidence vector(s); `
  + `${windowsExactMatches.length} Windows bundled source match(es), `
  + `${macClassicExactMatches.length} Mac classic bundled source match(es), `
  + `${unresolvedOfficialVectors.length} documented unresolved bundled vector(s)).`
);
if (unresolvedOfficialVectors.length > 0) {
  console.log("Unresolved official vectors:");
  for (const vector of unresolvedOfficialVectors) console.log(`- ${vector}`);
}
