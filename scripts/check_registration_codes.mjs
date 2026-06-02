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
  macCustomLegacy,
  matchingEvidenceVectors,
  pascalStringBytes,
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

const assaultInput = {
  scenarioName: "Assault on Giant Mountain",
  segment1: "MacMade",
  segment2: "System 6.0.1",
  registrationName: "RABREAUS"
};
assertEqual(pcCustomV71(assaultInput, 9140886), 303388440, "PC custom v7.1 source formula");
assertEqual(macCustomLegacy(assaultInput, 9140886), 1794494882, "Mac classic legacy candidate formula");

const rabreauAssaultVariants = registrationVariantsFor({ ...assaultInput, serialNumber: "9140886" });
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

for (const vector of REGISTRATION_EVIDENCE_VECTORS) {
  const variants = registrationVariantsFor({
    scenarioName: vector.scenarioName,
    segment1: vector.segment1 ?? "",
    segment2: vector.segment2 ?? "",
    registrationName: vector.registrationName,
    serialNumber: vector.serialNumber
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

console.log(`Registration code checks passed (${REGISTRATION_EVIDENCE_VECTORS.length} official/evidence vector(s)).`);
