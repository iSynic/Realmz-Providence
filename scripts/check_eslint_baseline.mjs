import assert from "node:assert/strict";
import { ESLint } from "eslint";

const WARNING_MAXIMUMS = new Map([
  ["react-hooks/exhaustive-deps", 79],
  ["react-hooks/rules-of-hooks", 18]
]);

function evaluateLintBaseline(errorCount, warningCounts, warningMaximums = WARNING_MAXIMUMS) {
  const failures = [];
  if (errorCount > 0) failures.push(`${errorCount} ESLint error(s)`);

  for (const [ruleId, count] of warningCounts) {
    const maximum = warningMaximums.get(ruleId);
    if (maximum === undefined) failures.push(`${count} unexpected warning(s) for ${ruleId}`);
    else if (count > maximum) failures.push(`${ruleId} increased from ${maximum} to ${count} warning(s)`);
  }
  return failures;
}

function runSelfTest() {
  const withinBaseline = new Map([
    ["react-hooks/exhaustive-deps", 79],
    ["react-hooks/rules-of-hooks", 18]
  ]);
  assert.deepEqual(evaluateLintBaseline(0, withinBaseline), []);
  assert.match(evaluateLintBaseline(1, withinBaseline)[0] ?? "", /1 ESLint error/);
  assert.match(evaluateLintBaseline(0, new Map([["new-rule", 1]]))[0] ?? "", /unexpected warning/);
  assert.match(evaluateLintBaseline(0, new Map([["react-hooks/rules-of-hooks", 19]]))[0] ?? "", /increased from 18 to 19/);
  console.log("ESLint baseline self-test passed (errors, new rules, and warning growth are rejected).");
}

async function runLintCheck() {
  const eslint = new ESLint();
  const results = await eslint.lintFiles(["src/**/*.{ts,tsx}"]);
  const errorCount = results.reduce((total, result) => total + result.errorCount, 0);
  const warningCounts = new Map();

  for (const result of results) {
    for (const message of result.messages) {
      if (message.severity !== 1) continue;
      const ruleId = message.ruleId ?? "unclassified";
      warningCounts.set(ruleId, (warningCounts.get(ruleId) ?? 0) + 1);
    }
  }

  const failures = evaluateLintBaseline(errorCount, warningCounts);
  if (failures.length > 0) {
    const formatter = await eslint.loadFormatter("stylish");
    const formatted = formatter.format(results);
    if (formatted) process.stderr.write(`${formatted}\n`);
    for (const failure of failures) process.stderr.write(`- ${failure}\n`);
    process.exitCode = 1;
    return;
  }

  const warningSummary = [...WARNING_MAXIMUMS]
    .map(([ruleId, maximum]) => `${ruleId}: ${warningCounts.get(ruleId) ?? 0}/${maximum}`)
    .join(", ");
  console.log(`ESLint baseline passed (${errorCount} errors; ${warningSummary}).`);
}

if (process.argv.includes("--self-test")) runSelfTest();
else await runLintCheck();
