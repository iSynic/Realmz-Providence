import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true }
});

const failures = [];

try {
  const authoring = await server.ssrLoadModule("/src/editor/textStyleAuthoring.ts");

  checkCurrentLineRanges(authoring);
  checkSelectionStyleInsertion(authoring);
  checkSelectionRestoresCoveredStyle(authoring);
  checkValidation(authoring);

  if (failures.length > 0) {
    console.error("Text style authoring checks failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Text style authoring checks passed.");
  }
} finally {
  await server.close();
}

process.exit(process.exitCode ?? 0);

function checkCurrentLineRanges({ currentLineTextRange, selectedTextRange }) {
  const text = "Alpha\nBeta\nGamma";
  assertRange(currentLineTextRange({ start: 8, end: 8 }, text), 6, 10, "cursor inside Beta should select the Beta line");
  assertRange(currentLineTextRange({ start: 5, end: 5 }, text), 0, 5, "cursor on a newline should select the preceding line");
  assertRange(currentLineTextRange({ start: 99, end: 99 }, text), 11, 16, "cursor past the text should select the final line");
  assertRange(selectedTextRange({ start: 12, end: 3 }, text), 3, 12, "reversed selections should normalize");
  assertRange(selectedTextRange({ start: -20, end: 200 }, text), 0, text.length, "out-of-range selections should clamp to the text body");
}

function checkSelectionStyleInsertion({ applyAuthorStyleToSelection, classicStyleRunsFromDrafts, styleRunDraftsFromRuns }) {
  const text = "Alpha\nBeta\nGamma";
  const drafts = applyAuthorStyleToSelection(styleRunDraftsFromRuns([]), text, { start: 6, end: 10 }, authorStyle({ font: 20, bold: true, underline: true }));
  assertStarts(drafts, [0, 6, 10], "styling a middle range should add selected and restore boundaries");
  const result = classicStyleRunsFromDrafts(drafts);
  assert(result.ok, "middle range drafts should compile to Classic style runs");
  if (result.ok) {
    const styled = result.runs.find((run) => run.startChar === 6);
    const restored = result.runs.find((run) => run.startChar === 10);
    assert(styled?.font === 20, "selected range should use the chosen font");
    assert(styled?.size === 14, "selected range should use the chosen size");
    assert(styled?.face === 5, "selected range should combine bold and underline face bits");
    assert(restored?.font === 0 && restored.face === 0, "range end should restore the previous plain style");
  }

  const tailDrafts = applyAuthorStyleToSelection(styleRunDraftsFromRuns([]), text, { start: 11, end: text.length }, authorStyle({ font: 21, italic: true }));
  assertStarts(tailDrafts, [0, 11], "styling through the end should not add a redundant restore boundary");
}

function checkSelectionRestoresCoveredStyle({ applyAuthorStyleToSelection, classicStyleRunsFromDrafts, styleRunDraftsFromRuns }) {
  const text = "0123456789abcdef";
  const source = styleRunDraftsFromRuns([
    run({ index: 0, startChar: 0, font: 0, face: 0 }),
    run({ index: 1, startChar: 5, font: 21, face: 2 }),
    run({ index: 2, startChar: 10, font: 0, face: 0 })
  ]);
  const drafts = applyAuthorStyleToSelection(source, text, { start: 3, end: 8 }, authorStyle({ font: 20, bold: true }));
  assertStarts(drafts, [0, 3, 8, 10], "styling over an existing run should replace covered starts and restore the covered style at the end");
  const result = classicStyleRunsFromDrafts(drafts);
  assert(result.ok, "covered range drafts should compile to Classic style runs");
  if (result.ok) {
    const selected = result.runs.find((candidate) => candidate.startChar === 3);
    const restored = result.runs.find((candidate) => candidate.startChar === 8);
    assert(selected?.font === 20 && selected.face === 1, "selected covered range should use the requested style");
    assert(restored?.font === 21 && restored.face === 2, "selection end should restore the style that was active inside the covered range");
  }
}

function checkValidation({ classicStyleRunsFromDrafts, styleRunDraftsFromRuns }) {
  const drafts = styleRunDraftsFromRuns([]);
  const duplicate = classicStyleRunsFromDrafts([...drafts, { ...drafts[0], id: "duplicate", index: 1 }]);
  assert(!duplicate.ok, "duplicate style-run starts should be rejected");
  const invalidColor = classicStyleRunsFromDrafts([{ ...drafts[0], color: "red" }]);
  assert(!invalidColor.ok, "invalid color values should be rejected");
}

function run(overrides = {}) {
  return {
    index: overrides.index ?? 0,
    startChar: overrides.startChar ?? 0,
    height: overrides.height ?? 12,
    ascent: overrides.ascent ?? 9,
    font: overrides.font ?? 0,
    face: overrides.face ?? 0,
    size: overrides.size ?? 12,
    color: overrides.color ?? { red: 0, green: 0, blue: 0 }
  };
}

function authorStyle(overrides = {}) {
  return {
    font: overrides.font ?? 0,
    size: overrides.size ?? 14,
    color: overrides.color ?? "#123456",
    bold: overrides.bold ?? false,
    italic: overrides.italic ?? false,
    underline: overrides.underline ?? false
  };
}

function assertStarts(drafts, expected, message) {
  const actual = drafts.map((draft) => Number(draft.startChar));
  assert(actual.join(",") === expected.join(","), `${message}: expected ${expected.join(",")}, got ${actual.join(",")}`);
}

function assertRange(range, start, end, message) {
  assert(range.start === start && range.end === end, `${message}: expected ${start}-${end}, got ${range.start}-${range.end}`);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
