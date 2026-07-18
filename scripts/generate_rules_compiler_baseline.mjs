import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(repoRoot, "src", "shared", "rulesCompilerBaseline.json");
const checkOnly = process.argv.includes("--check");

const families = {
  race: {
    source: "public/bundled-libraries/realmz-reference/Data Race",
    recordBytes: 408,
    records: 30
  },
  caste: {
    source: "public/bundled-libraries/realmz-reference/Data Caste",
    recordBytes: 576,
    records: 30
  }
};

const output = { schemaVersion: 1 };
for (const [name, family] of Object.entries(families)) {
  const sourcePath = path.join(repoRoot, ...family.source.split("/"));
  const source = fs.readFileSync(sourcePath);
  const requiredBytes = family.recordBytes * family.records;
  if (source.byteLength < requiredBytes) {
    throw new Error(`${family.source} has ${source.byteLength} bytes; ${requiredBytes} are required`);
  }
  const bytes = source.subarray(0, requiredBytes);
  output[name] = {
    source: family.source,
    sourceSha256: crypto.createHash("sha256").update(source).digest("hex"),
    recordBytes: family.recordBytes,
    records: family.records,
    bytesSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    bytesBase64: bytes.toString("base64")
  };
}

const text = `${JSON.stringify(output, null, 2)}\n`;
if (checkOnly) {
  const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (existing !== text) throw new Error("Rules compiler baseline is stale; run npm run generate:rules-compiler-baseline.");
  console.log("Rules compiler baseline check passed (30 race records, 30 caste records).");
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, text);
  console.log(`Wrote ${path.relative(repoRoot, outputPath)}.`);
}
