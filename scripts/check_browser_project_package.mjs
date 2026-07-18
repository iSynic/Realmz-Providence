import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildRoot = path.join(repoRoot, "tmp", "browser-project-package-check");
const sourceFiles = [
  "src/editor/browser/zip.ts",
  "src/editor/browser/fsAccess.ts",
  "src/editor/projectOrigin.ts",
  "src/editor/browser/projectPackage.ts"
];

await fs.rm(buildRoot, { recursive: true, force: true });
await fs.mkdir(buildRoot, { recursive: true });
await fs.writeFile(path.join(buildRoot, "package.json"), "{\"type\":\"commonjs\"}\n");

for (const sourceFile of sourceFiles) {
  const inputPath = path.join(repoRoot, sourceFile);
  const outputPath = path.join(buildRoot, sourceFile.replace(/\.ts$/, ".js"));
  const source = await fs.readFile(inputPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      isolatedModules: true
    },
    fileName: sourceFile
  }).outputText;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, transpiled);
}

const requireFromBuild = createRequire(path.join(buildRoot, "check.cjs"));
const { createBrowserProjectPackageZip } = requireFromBuild("./src/editor/browser/projectPackage.js");
const { readProjectPackage } = requireFromBuild("./src/editor/browser/fsAccess.js");
const { readStoredZip } = requireFromBuild("./src/editor/browser/zip.js");

const rawBytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
const rawSha256 = sha256Hex(rawBytes);
const project = {
  schemaVersion: 5,
  appVersion: "browser-package-check",
  scenario: {
    name: "Fixture Scenario",
    projectPath: "browser://Fixture Scenario.providence",
    importedAt: "2026-07-04T00:00:00.000Z"
  },
  source: {
    origin: "imported",
    sourcePath: "browser://Fixture Scenario",
    rawSourcesDir: "browser-memory",
    immutable: true,
    files: [{
      name: "Data LD",
      relativePath: "Data LD",
      bytes: rawBytes.byteLength,
      sha256: rawSha256,
      role: "supported-binary",
      editable: true
    }]
  },
  assets: [{
    id: "asset-text-101",
    label: "Text 101",
    kind: "text",
    resourceType: "TEXT",
    resourceId: 101,
    fileName: "text-101.bin",
    resourcePath: "data:text/plain;base64,SGVsbG8=",
    originalPath: "",
    previewPath: "",
    exportState: "ready"
  }]
};
const rawSources = {
  schemaVersion: 1,
  sourceKind: "browser-scenario-import",
  capturedAt: "2026-07-04T00:00:00.000Z",
  rootName: "Fixture Scenario",
  targetPlatform: "windows-realmz",
  totalBytes: rawBytes.byteLength,
  files: [{
    ...project.source.files[0],
    originalRelativePath: "Original/Data LD",
    targetPlatform: "windows-realmz",
    captureConfidence: "captured",
    bytesData: rawBytes
  }]
};

const rootName = "Fixture Scenario.providence";
const zipBytes = createBrowserProjectPackageZip(project, rawSources);
const entries = readStoredZip(zipBytes);
const entryMap = new Map(entries.map((entry) => [entry.path, entry.bytes]));

expect(entryMap.has(`${rootName}/project.json`), "project.json missing from Providence project ZIP");
expect(entryMap.has(`${rootName}/package-manifest.json`), "package-manifest.json missing from Providence project ZIP");
expect(entryMap.has(`${rootName}/raw-sources-manifest.json`), "raw-sources-manifest.json missing from Providence project ZIP");
expect(entryMap.has(`${rootName}/raw-sources/Data LD`), "raw source payload missing from Providence project ZIP");
expect(entryMap.has(`${rootName}/assets/managed/asset-text-101/resourcePath/text-101.bin`), "managed asset payload missing from Providence project ZIP");

const packageManifest = jsonEntry(entryMap, `${rootName}/package-manifest.json`);
expect(packageManifest.artifact === "providence-project-package", "package manifest artifact marker changed");
expect(packageManifest.contents.rawSourceFiles === 1, "package manifest raw source count is wrong");
expect(packageManifest.contents.managedAssetFiles === 1, "package manifest managed asset count is wrong");

const rawManifest = jsonEntry(entryMap, `${rootName}/raw-sources-manifest.json`);
expect(rawManifest.sourceKind === "browser-scenario-import", "raw source manifest sourceKind missing");
expect(rawManifest.targetPlatform === "windows-realmz", "raw source manifest targetPlatform missing");
expect(rawManifest.files[0].originalRelativePath === "Original/Data LD", "raw source manifest original path missing");
expect(rawManifest.files[0].captureConfidence === "captured", "raw source manifest capture confidence missing");

const reopened = await readProjectPackage({
  kind: "project-zip-file",
  name: "Fixture Scenario.providence.zip",
  file: {
    async arrayBuffer() {
      return zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength);
    }
  }
});
const reopenedProject = JSON.parse(reopened.projectJson);
expect(reopenedProject.source.rawSourcesDir === "raw-sources", "reopened project.json did not point at packaged raw-sources");
expect(reopenedProject.source.origin === "imported", "reopened imported project lost its explicit origin");
expect(reopened.rawSources?.files?.length === 1, "reopened package did not rebuild one raw source");
expect(reopened.rawSources.files[0].sha256 === rawSha256, "reopened raw source SHA-256 changed");
expect(bytesEqual(reopened.rawSources.files[0].bytesData, rawBytes), "reopened raw source payload changed");
expect(reopened.rawSources.files[0].targetPlatform === "windows-realmz", "reopened raw source target platform changed");
expect(reopened.rawSources.files[0].captureConfidence === "captured", "reopened raw source capture confidence changed");

const authoredProject = {
  ...project,
  scenario: {
    ...project.scenario,
    name: "Authored Scenario",
    projectPath: "browser://Authored Scenario.providence"
  },
  source: {
    origin: "authored",
    sourcePath: "generated://authored-scenario",
    rawSourcesDir: "",
    immutable: false,
    files: []
  },
  assets: []
};
const authoredZip = createBrowserProjectPackageZip(authoredProject);
const authoredRoot = "Authored Scenario.providence";
const authoredEntries = readStoredZip(authoredZip);
const authoredEntryMap = new Map(authoredEntries.map((entry) => [entry.path, entry.bytes]));
expect(!authoredEntryMap.has(`${authoredRoot}/raw-sources-manifest.json`), "authored project ZIP should not contain a compatibility-annex manifest");
expect(!authoredEntries.some((entry) => entry.path.startsWith(`${authoredRoot}/raw-sources/`)), "authored project ZIP should not contain raw source payloads");
const authoredManifest = jsonEntry(authoredEntryMap, `${authoredRoot}/package-manifest.json`);
expect(authoredManifest.source.origin === "authored", "authored package manifest lost its explicit origin");
expect(authoredManifest.contents.rawSourcesManifest === null, "authored package manifest should not reference a compatibility annex");
const reopenedAuthored = await readProjectPackage({
  kind: "project-zip-file",
  name: "Authored Scenario.providence.zip",
  file: {
    async arrayBuffer() {
      return authoredZip.buffer.slice(authoredZip.byteOffset, authoredZip.byteOffset + authoredZip.byteLength);
    }
  }
});
const reopenedAuthoredProject = JSON.parse(reopenedAuthored.projectJson);
expect(reopenedAuthoredProject.source.origin === "authored", "reopened authored project lost its explicit origin");
expect(reopenedAuthoredProject.source.rawSourcesDir === "", "reopened authored project should not point at raw-sources");
expect(reopenedAuthored.rawSources === null, "reopened authored project should not rebuild a raw source snapshot");

console.log("Browser project package ZIP checks passed.");

function jsonEntry(entryMap, pathName) {
  const bytes = entryMap.get(pathName);
  expect(bytes, `${pathName} missing`);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}
