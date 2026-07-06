import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  logLevel: "silent",
  server: { middlewareMode: true }
});

const failures = [];

try {
  const authoring = await server.ssrLoadModule("/src/editor/textStyleAuthoring.ts");
  const classicText = await server.ssrLoadModule("/src/editor/classicTextPreview.ts");
  const styledPreview = await server.ssrLoadModule("/src/editor/components/StyledTextPreview.tsx");

  checkSelectedRanges(authoring);
  checkSelectionStyleInsertion(authoring);
  checkSelectionRestoresCoveredStyle(authoring);
  checkValidation(authoring);
  checkClassicTextOffsetMaps(classicText);
  checkStyledPreviewUsesRawOffsets(classicText, styledPreview);
  checkRawOffsetAuthoring(classicText, authoring);
  checkStyleBytesPreserveUnchanged(authoring, styledPreview);

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

function checkSelectedRanges({ selectedTextRange }) {
  const text = "Alpha\nBeta\nGamma";
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

function checkClassicTextOffsetMaps({ decodeClassicTextPreviewBytes, displayOffsetToRawOffset, rawOffsetToDisplayOffset }) {
  const bytes = new Uint8Array([13, 9, 65, 0x80, 31, 66, 0, 67]);
  const decoded = decodeClassicTextPreviewBytes(bytes);
  assert(decoded.text === "\n\tA\u0080 B", `Classic preview text should preserve offset-significant bytes, got ${JSON.stringify(decoded.text)}`);
  assert(decoded.rawByteLength === 6, `NUL should end visible raw TEXT at byte 6, got ${decoded.rawByteLength}`);
  for (const offset of [0, 1, 2, 3, 4, 5, 6]) {
    assert(rawOffsetToDisplayOffset(decoded, offset) === offset, `raw offset ${offset} should map to display offset ${offset}`);
    assert(displayOffsetToRawOffset(decoded, offset) === offset, `display offset ${offset} should map to raw offset ${offset}`);
  }
  assert(rawOffsetToDisplayOffset(decoded, 7) === 6, "raw offsets after NUL should clamp to the visible display end");
}

function checkStyledPreviewUsesRawOffsets({ decodeClassicTextPreviewBytes }, { styledTextPreviewSegments }) {
  const decoded = decodeClassicTextPreviewBytes(new Uint8Array([13, 9, 65, 0x80, 31, 66]));
  const preview = styledTextPreviewSegments(decoded, [
    run({ index: 0, startChar: 0, font: 1 }),
    run({ index: 1, startChar: 2, font: 3 }),
    run({ index: 2, startChar: 5, font: 4 })
  ]);
  assert(preview.diagnostics.length === 0, `raw-offset preview fixture should not emit diagnostics: ${preview.diagnostics.join("; ")}`);
  const segments = preview.segments.map((segment) => `${segment.rawStart}-${segment.rawEnd}:${JSON.stringify(segment.text)}`);
  const expected = `0-2:${JSON.stringify("\n\t")}|2-5:${JSON.stringify(`A${String.fromCharCode(0x80)} `)}|5-6:${JSON.stringify("B")}`;
  assert(segments.join("|") === expected, `preview segments should slice display text through raw offsets, got ${segments.join("|")}`);
}

function checkRawOffsetAuthoring({ decodeClassicTextPreviewBytes, displayRangeToRawRange }, { applyAuthorStyleToSelection, classicStyleRunsFromDrafts, styleRunDraftsFromRuns }) {
  const decoded = decodeClassicTextPreviewBytes(new Uint8Array([13, 9, 65, 0x80, 31, 66]));
  const rawRange = displayRangeToRawRange(decoded, { start: 2, end: 5 });
  assert(rawRange.start === 2 && rawRange.end === 5, `display selection should map to raw bytes 2-5, got ${rawRange.start}-${rawRange.end}`);
  const drafts = applyAuthorStyleToSelection(styleRunDraftsFromRuns([]), decoded.text, rawRange, authorStyle({ font: 20, bold: true }), decoded.rawByteLength);
  const result = classicStyleRunsFromDrafts(drafts);
  assert(result.ok, "raw-offset selection drafts should compile to Classic style runs");
  if (result.ok) {
    assertStarts(result.runs, [0, 2, 5], "authoring a display selection should write raw Classic startChar offsets");
  }
}

function checkStyleBytesPreserveUnchanged({ classicStyleRunsFromDrafts, styleRunDraftsFromRuns }, { classicStyleBytesFromRuns, parseClassicStyleRuns }) {
  const originalBytes = classicStyleBytesFromRuns([
    run({ index: 0, startChar: 0, font: 1, size: 12 }),
    run({ index: 1, startChar: 3, height: 18, ascent: 14, font: 1602, face: 1, size: 18 })
  ]);
  const parsed = parseClassicStyleRuns(originalBytes);
  assert(parsed.ok, "fixture styl bytes should parse");
  if (!parsed.ok) return;
  const result = classicStyleRunsFromDrafts(styleRunDraftsFromRuns(parsed.runs));
  assert(result.ok, "unchanged style drafts should compile");
  if (!result.ok) return;
  const roundTripped = classicStyleBytesFromRuns(result.runs);
  assert(bytesEqual(originalBytes, roundTripped), "unchanged styl bytes should round-trip exactly through draft conversion");
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

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function assertRange(range, start, end, message) {
  assert(range.start === start && range.end === end, `${message}: expected ${start}-${end}, got ${range.start}-${range.end}`);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
