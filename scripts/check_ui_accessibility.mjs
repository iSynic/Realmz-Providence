import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDITOR_ROOT = path.join(ROOT, "src", "editor");
const ICON_ONLY_CLASSES = new Set(["icon-only", "btn-icon", "icon-btn"]);

export function evaluateUiAccessibilitySource(source, filePath = "component.tsx") {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const failures = [];

  visit(sourceFile, (node) => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const tagName = node.tagName.getText(sourceFile);
    if (tagName === "button" && isIconOnlyButton(node, sourceFile) && !hasAccessibleName(node, sourceFile)) {
      failures.push(formatFailure(sourceFile, node, "icon-only button requires aria-label or aria-labelledby"));
    }
    if (attributeText(node, "role", sourceFile) === "dialog" && !hasAccessibleName(node, sourceFile)) {
      failures.push(formatFailure(sourceFile, node, "dialog requires aria-label or aria-labelledby"));
    }
    if (tagName === "input" && attributeText(node, "type", sourceFile) === "search" && normalizePath(filePath) !== "src/editor/ui/SearchField.tsx") {
      failures.push(formatFailure(sourceFile, node, "search inputs must use the shared SearchField"));
    }
  });

  return failures;
}

function runSelfTest() {
  assert.deepEqual(evaluateUiAccessibilitySource('<button className="icon-only" aria-label="Close"><X /></button>'), []);
  assert.match(evaluateUiAccessibilitySource('<button className="icon-only" title="Close"><X /></button>')[0] ?? "", /requires aria-label/);
  assert.deepEqual(evaluateUiAccessibilitySource('<section role="dialog" aria-labelledby="title" />'), []);
  assert.match(evaluateUiAccessibilitySource('<section role="dialog" />')[0] ?? "", /dialog requires/);
  assert.deepEqual(evaluateUiAccessibilitySource('<input type="search" />', "src/editor/ui/SearchField.tsx"), []);
  assert.match(evaluateUiAccessibilitySource('<input type="search" />', "src/editor/panels/Panel.tsx")[0] ?? "", /shared SearchField/);
  console.log("UI accessibility self-test passed (icon controls, dialogs, and shared search violations are rejected)." );
}

function runCheck() {
  const failures = [];
  const files = collectFiles(EDITOR_ROOT, (file) => file.endsWith(".tsx") && !file.endsWith(".test.tsx"));
  for (const file of files) {
    const relativePath = normalizePath(path.relative(ROOT, file));
    const source = fs.readFileSync(file, "utf8");
    failures.push(...evaluateUiAccessibilitySource(source, relativePath));
  }
  if (failures.length > 0) {
    process.stderr.write("UI accessibility check failed:\n");
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`UI accessibility check passed (${files.length} production TSX modules).`);
}

function visit(node, callback) {
  callback(node);
  node.forEachChild((child) => visit(child, callback));
}

function isIconOnlyButton(node, sourceFile) {
  const classes = attributeText(node, "className", sourceFile)?.split(/\s+/) ?? [];
  return classes.some((className) => ICON_ONLY_CLASSES.has(className));
}

function hasAccessibleName(node, sourceFile) {
  return Boolean(attributeText(node, "aria-label", sourceFile) || attributeText(node, "aria-labelledby", sourceFile));
}

function attributeText(node, name, sourceFile) {
  const attribute = node.attributes.properties.find((candidate) => ts.isJsxAttribute(candidate) && candidate.name.text === name);
  if (!attribute || !ts.isJsxAttribute(attribute) || !attribute.initializer) return null;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text.trim();
  if (!ts.isJsxExpression(attribute.initializer) || !attribute.initializer.expression) return null;
  const expression = attribute.initializer.expression;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text.trim();
  return expression.getText(sourceFile).trim() || null;
}

function formatFailure(sourceFile, node, message) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${normalizePath(sourceFile.fileName)}:${position.line + 1} ${message}`;
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

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

if (process.argv.includes("--self-test")) runSelfTest();
else runCheck();
