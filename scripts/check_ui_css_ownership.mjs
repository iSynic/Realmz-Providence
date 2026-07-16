import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = path.join(ROOT, "src");
const RETIREMENT_PATH = path.join(ROOT, "docs", "ui-css-retirement.json");
const ALLOWED_SHARED_OWNERS = new Map([
  [
    "src/editor/panels/rules/RulesPresentationFields.css",
    [
      "src/editor/panels/rules/RulesQueueIconField.tsx",
      "src/editor/panels/rules/RulesSpellAnimationField.tsx"
    ]
  ]
]);

export function parseStyleImports(source, sourcePath) {
  const specifiers = [];
  if (sourcePath.endsWith(".css")) {
    for (const match of source.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+\.css)["']\s*\)?\s*;/g)) {
      specifiers.push(match[1]);
    }
  } else {
    for (const match of source.matchAll(/^\s*import\s+["']([^"']+\.css)["']\s*;?/gm)) {
      specifiers.push(match[1]);
    }
  }
  return specifiers;
}

export function validateStylesheetOwners(stylesheets, owners, allowedSharedOwners = new Map()) {
  const problems = [];
  for (const stylesheet of stylesheets) {
    const actualOwners = [...(owners.get(stylesheet) ?? [])].sort();
    const allowedOwners = [...(allowedSharedOwners.get(stylesheet) ?? [])].sort();
    if (actualOwners.length === 0) {
      problems.push(`${stylesheet} has no production owner.`);
      continue;
    }
    if (actualOwners.length === 1 && allowedOwners.length === 0) continue;
    if (actualOwners.join("\0") !== allowedOwners.join("\0")) {
      problems.push(`${stylesheet} has unexpected owners: ${actualOwners.join(", ")}.`);
    }
  }
  for (const [stylesheet, allowedOwners] of allowedSharedOwners) {
    if (!stylesheets.includes(stylesheet)) {
      problems.push(`Shared stylesheet allowance references missing ${stylesheet}.`);
    } else if (allowedOwners.length < 2) {
      problems.push(`Shared stylesheet allowance for ${stylesheet} must name at least two owners.`);
    }
  }
  return problems;
}

export function findRetiredSelectorViolations(sources, selectors) {
  const problems = [];
  for (const [sourcePath, source] of sources) {
    for (const selector of selectors) {
      const className = selector.startsWith(".") ? selector.slice(1) : selector;
      const expression = new RegExp(`(^|[^A-Za-z0-9_-])${escapeRegExp(className)}([^A-Za-z0-9_-]|$)`, "m");
      if (expression.test(source)) problems.push(`${sourcePath} still references retired selector ${selector}.`);
    }
  }
  return problems;
}

function runSelfTest() {
  assert.deepEqual(parseStyleImports('@import "./base.css";\n@import url("./nested.css");', "styles.css"), ["./base.css", "./nested.css"]);
  assert.deepEqual(parseStyleImports('import "./Panel.css";\nimport value from "./data.js";', "Panel.tsx"), ["./Panel.css"]);

  const owners = new Map([
    ["src/owned.css", new Set(["src/Panel.tsx"])],
    ["src/shared.css", new Set(["src/Left.tsx", "src/Right.tsx"])]
  ]);
  assert.deepEqual(
    validateStylesheetOwners(
      ["src/owned.css", "src/shared.css"],
      owners,
      new Map([["src/shared.css", ["src/Left.tsx", "src/Right.tsx"]]])
    ),
    []
  );
  assert.match(validateStylesheetOwners(["src/orphan.css"], new Map())[0] ?? "", /no production owner/);
  assert.match(validateStylesheetOwners(["src/shared.css"], owners)[0] ?? "", /unexpected owners/);
  assert.deepEqual(findRetiredSelectorViolations(new Map([["src/Panel.tsx", '<div className="current" />']]), [".retired"]), []);
  assert.match(
    findRetiredSelectorViolations(new Map([["src/Panel.css", ".retired { display: none; }"]]), [".retired"])[0] ?? "",
    /still references retired selector/
  );
  console.log("UI CSS ownership self-test passed (orphans, shared owners, and retired selectors are enforced)." );
}

function runCheck() {
  const sourceFiles = collectFiles(SOURCE_ROOT, isProductionSource);
  const stylesheetPaths = sourceFiles.filter((file) => file.endsWith(".css")).map(relativePath).sort();
  const owners = new Map(stylesheetPaths.map((stylesheet) => [stylesheet, new Set()]));
  const problems = [];

  for (const sourceFile of sourceFiles) {
    const sourcePath = relativePath(sourceFile);
    const source = fs.readFileSync(sourceFile, "utf8");
    for (const specifier of parseStyleImports(source, sourcePath)) {
      if (!specifier.startsWith(".")) continue;
      const importedFile = path.resolve(path.dirname(sourceFile), specifier);
      const importedPath = relativePath(importedFile);
      if (!fs.existsSync(importedFile)) {
        problems.push(`${sourcePath} imports missing stylesheet ${importedPath}.`);
        continue;
      }
      if (!owners.has(importedPath)) owners.set(importedPath, new Set());
      owners.get(importedPath).add(sourcePath);
    }
  }

  problems.push(...validateStylesheetOwners(stylesheetPaths, owners, ALLOWED_SHARED_OWNERS));

  const retirement = JSON.parse(fs.readFileSync(RETIREMENT_PATH, "utf8"));
  if (retirement.schemaVersion !== 1 || !Array.isArray(retirement.selectors)) {
    problems.push("docs/ui-css-retirement.json must use schemaVersion 1 and provide a selectors array.");
  } else {
    const productionSources = new Map(
      sourceFiles
        .filter((file) => /\.(?:css|ts|tsx)$/.test(file))
        .map((file) => [relativePath(file), fs.readFileSync(file, "utf8")])
    );
    problems.push(...findRetiredSelectorViolations(productionSources, retirement.selectors));
  }

  if (problems.length > 0) {
    process.stderr.write("UI CSS ownership check failed:\n");
    for (const problem of problems) process.stderr.write(`- ${problem}\n`);
    process.exitCode = 1;
    return;
  }
  const sharedCount = [...owners.values()].filter((value) => value.size > 1).length;
  console.log(`UI CSS ownership check passed (${stylesheetPaths.length} stylesheets, ${sharedCount} approved shared owner).`);
}

function isProductionSource(file) {
  if (!/\.(?:css|ts|tsx)$/.test(file)) return false;
  return !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file);
}

function collectFiles(directory, predicate) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(file, predicate));
    else if (predicate(file)) files.push(file);
  }
  return files;
}

function relativePath(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv.includes("--self-test")) runSelfTest();
else runCheck();
