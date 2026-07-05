import {
  CLASSIC_STYLE_EDITABLE_FACE_MASK,
  CLASSIC_STYLE_EXTRA_FACE_MASK,
  CLASSIC_STYLE_FACE_BITS,
  DEFAULT_CLASSIC_STYLE_RUN,
  classicRgbToCssHex,
  cssHexToClassicRgb,
  type ClassicTextStyleRun
} from "./components/StyledTextPreview";

export const CLASSIC_AUTHOR_FONT_OPTIONS = [
  { id: 0, label: "Default" },
  { id: 1, label: "Application / Geneva" },
  { id: 3, label: "Geneva" },
  { id: 4, label: "Monaco" },
  { id: 16, label: "Palatino" },
  { id: 20, label: "Times" },
  { id: 21, label: "Helvetica" },
  { id: 22, label: "Courier" },
  { id: 23, label: "Symbol" },
  { id: 1602, label: "Black Chancery" },
  { id: 2004, label: "Sand" }
] as const;

export type ClassicStyleRunDraft = {
  id: string;
  index: number;
  startChar: string;
  height: number;
  ascent: number;
  font: string;
  faceExtra: number;
  size: string;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type TextSelectionRange = {
  start: number;
  end: number;
};

export type AuthorStyleDraft = {
  font: number;
  size: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export function styleRunDraftsFromRuns(runs: ClassicTextStyleRun[]) {
  const source = runs.length ? runs : [DEFAULT_CLASSIC_STYLE_RUN];
  return source.map((run, index): ClassicStyleRunDraft => ({
    id: `${index}:${run.startChar}:${run.font}:${run.size}:${run.face}`,
    index,
    startChar: String(run.startChar),
    height: run.height,
    ascent: run.ascent,
    font: String(run.font),
    faceExtra: run.face & ~CLASSIC_STYLE_EDITABLE_FACE_MASK,
    size: String(run.size > 0 ? run.size : 12),
    color: classicRgbToCssHex(run.color),
    bold: (run.face & CLASSIC_STYLE_FACE_BITS.bold) !== 0,
    italic: (run.face & CLASSIC_STYLE_FACE_BITS.italic) !== 0,
    underline: (run.face & CLASSIC_STYLE_FACE_BITS.underline) !== 0
  }));
}

export function updateStyleRunDraft(drafts: ClassicStyleRunDraft[], id: string, update: Partial<ClassicStyleRunDraft>) {
  return drafts.map((draft) => draft.id === id ? { ...draft, ...update } : draft);
}

export function textSelectionRangeFromTextArea(element: Pick<HTMLTextAreaElement, "selectionStart" | "selectionEnd">): TextSelectionRange {
  return {
    start: Math.min(element.selectionStart, element.selectionEnd),
    end: Math.max(element.selectionStart, element.selectionEnd)
  };
}

export function selectedTextRange(range: TextSelectionRange, text: string): TextSelectionRange {
  const start = Math.max(0, Math.min(text.length, Math.min(range.start, range.end)));
  const end = Math.max(start, Math.min(text.length, Math.max(range.start, range.end)));
  return { start, end };
}

export function currentLineTextRange(range: TextSelectionRange, text: string): TextSelectionRange {
  if (!text) return { start: 0, end: 0 };
  const cursor = Math.max(0, Math.min(text.length, Math.min(range.start, range.end)));
  const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const nextBreak = text.indexOf("\n", cursor);
  const lineEnd = nextBreak >= 0 ? nextBreak : text.length;
  return { start: lineStart, end: lineEnd };
}

export function textSelectionSummary(text: string, range: TextSelectionRange) {
  const excerpt = text.slice(range.start, Math.min(range.end, range.start + 72)).replace(/\s+/g, " ").trim() || "(blank text)";
  const suffix = range.end - range.start > 72 ? "..." : "";
  return `${(range.end - range.start).toLocaleString()} char${range.end - range.start === 1 ? "" : "s"}: ${excerpt}${suffix}`;
}

export function textSelectionTitle(text: string, range: TextSelectionRange) {
  const excerpt = text.slice(range.start, range.end).replace(/\s+/g, " ").trim() || "(blank text)";
  return `Selected characters ${range.start}-${Math.max(range.start, range.end - 1)}: ${excerpt}`;
}

export function addStyleRunDraft(drafts: ClassicStyleRunDraft[]) {
  const template = drafts[drafts.length - 1] ?? styleRunDraftsFromRuns([])[0];
  const start = Number(template.startChar);
  const nextStart = Number.isFinite(start) ? start + 1 : drafts.length;
  return [
    ...drafts,
    {
      ...template,
      id: `new:${Date.now()}:${drafts.length}`,
      index: drafts.length,
      startChar: String(nextStart)
    }
  ];
}

export function removeStyleRunDraft(drafts: ClassicStyleRunDraft[], id: string) {
  return drafts.filter((draft) => draft.id !== id).map((draft, index) => ({ ...draft, index }));
}

export function applyAuthorStyleToSelection(drafts: ClassicStyleRunDraft[], text: string, range: TextSelectionRange, style: AuthorStyleDraft) {
  const selected = selectedTextRange(range, text);
  if (selected.end <= selected.start) return drafts;
  const source = drafts.length ? drafts : styleRunDraftsFromRuns([]);
  const activeAtStart = styleRunDraftAtOffset(source, selected.start);
  const activeAtEnd = styleRunDraftAtOffset(source, selected.end);
  const hasEndBoundary = selected.end < text.length && source.some((draft) => styleRunStart(draft.startChar) === selected.end);
  const nextDrafts = source.filter((draft) => {
    const start = styleRunStart(draft.startChar);
    return start == null || start < selected.start || start >= selected.end;
  });
  nextDrafts.push(styleRunDraftFromAuthorStyle(activeAtStart, selected.start, style, `selection:${selected.start}:${selected.end}:${Date.now()}`));
  if (selected.end < text.length && !hasEndBoundary) {
    nextDrafts.push(styleRunDraftFromTemplate(activeAtEnd, selected.end, `restore:${selected.end}:${Date.now()}`));
  }
  return reindexStyleRunDrafts(nextDrafts);
}

export function styleRunDraftAtOffset(drafts: ClassicStyleRunDraft[], offset: number) {
  return drafts
    .filter((draft) => {
      const start = styleRunStart(draft.startChar);
      return start != null && start <= offset;
    })
    .sort((left, right) => Number(right.startChar) - Number(left.startChar))[0]
    ?? styleRunDraftsFromRuns([])[0];
}

export function classicStyleRunsFromDrafts(drafts: ClassicStyleRunDraft[]): { ok: true; runs: ClassicTextStyleRun[] } | { ok: false; error: string } {
  const usedStartChars = new Set<number>();
  const runs: ClassicTextStyleRun[] = [];
  for (const [index, draft] of drafts.entries()) {
    const startChar = Number(draft.startChar);
    const font = Number(draft.font);
    const size = Number(draft.size);
    if (!Number.isInteger(startChar) || startChar < 0) return { ok: false, error: `Style run ${index + 1} needs a non-negative start character.` };
    if (!Number.isInteger(font) || font < 0 || font > 32767) return { ok: false, error: `Style run ${index + 1} needs a font ID from 0 to 32767.` };
    if (!Number.isInteger(size) || size < 1 || size > 255) return { ok: false, error: `Style run ${index + 1} needs a size from 1 to 255.` };
    if (!/^#[0-9a-fA-F]{6}$/.test(draft.color)) return { ok: false, error: `Style run ${index + 1} needs a #RRGGBB color.` };
    if (usedStartChars.has(startChar)) return { ok: false, error: `Style run start ${startChar} is duplicated.` };
    usedStartChars.add(startChar);
    const face = (draft.faceExtra & CLASSIC_STYLE_EXTRA_FACE_MASK)
      | (draft.bold ? CLASSIC_STYLE_FACE_BITS.bold : 0)
      | (draft.italic ? CLASSIC_STYLE_FACE_BITS.italic : 0)
      | (draft.underline ? CLASSIC_STYLE_FACE_BITS.underline : 0);
    runs.push({
      index,
      startChar,
      height: Math.max(size, draft.height || size),
      ascent: Math.max(0, Math.min(draft.ascent || Math.max(size - 3, 0), size)),
      font,
      face,
      size,
      color: cssHexToClassicRgb(draft.color)
    });
  }
  runs.sort((left, right) => left.startChar - right.startChar);
  return { ok: true, runs: runs.map((run, index) => ({ ...run, index })) };
}

export function isCssHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function styleRunRangeSummary(run: ClassicStyleRunDraft, drafts: ClassicStyleRunDraft[], text: string) {
  const range = styleRunRange(run, drafts, text);
  if (!range) return "Invalid start";
  if (text.length === 0) return "Empty TEXT body";
  if (range.beyondText) return `Starts after current text (${range.start})`;
  const excerpt = text.slice(range.start, Math.min(range.endExclusive, range.start + 54)).replace(/\s+/g, " ").trim() || "(blank text)";
  const suffix = range.endExclusive - range.start > 54 ? "..." : "";
  return `${range.start}-${Math.max(range.start, range.endExclusive - 1)}: ${excerpt}${suffix}`;
}

export function styleRunRangeTitle(run: ClassicStyleRunDraft, drafts: ClassicStyleRunDraft[], text: string) {
  const range = styleRunRange(run, drafts, text);
  if (!range) return "This row needs a non-negative start character.";
  if (text.length === 0) return "This TEXT resource has no body text yet.";
  if (range.beyondText) return `This style starts at character ${range.start}, which is beyond the current ${text.length}-character TEXT body.`;
  const excerpt = text.slice(range.start, range.endExclusive).replace(/\s+/g, " ").trim() || "(blank text)";
  return `Applies from character ${range.start} through ${Math.max(range.start, range.endExclusive - 1)}: ${excerpt}`;
}

function styleRunDraftFromAuthorStyle(template: ClassicStyleRunDraft, startChar: number, style: AuthorStyleDraft, id: string): ClassicStyleRunDraft {
  return {
    ...template,
    id,
    startChar: String(startChar),
    height: Math.max(template.height, style.size),
    ascent: Math.max(0, Math.min(template.ascent || Math.max(style.size - 3, 0), style.size)),
    font: String(style.font),
    faceExtra: template.faceExtra & CLASSIC_STYLE_EXTRA_FACE_MASK,
    size: String(style.size),
    color: style.color,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline
  };
}

function styleRunDraftFromTemplate(template: ClassicStyleRunDraft, startChar: number, id: string): ClassicStyleRunDraft {
  return {
    ...template,
    id,
    startChar: String(startChar)
  };
}

function reindexStyleRunDrafts(drafts: ClassicStyleRunDraft[]) {
  return [...drafts]
    .sort((left, right) => {
      const leftStart = styleRunStart(left.startChar) ?? Number.MAX_SAFE_INTEGER;
      const rightStart = styleRunStart(right.startChar) ?? Number.MAX_SAFE_INTEGER;
      return leftStart - rightStart || left.index - right.index;
    })
    .map((draft, index) => ({ ...draft, index }));
}

function styleRunStart(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function styleRunRange(run: ClassicStyleRunDraft, drafts: ClassicStyleRunDraft[], text: string) {
  const start = styleRunStart(run.startChar);
  if (start == null) return null;
  const nextStart = drafts
    .map((draft) => styleRunStart(draft.startChar))
    .filter((candidate): candidate is number => candidate != null && candidate > start)
    .sort((left, right) => left - right)[0] ?? text.length;
  return {
    start,
    endExclusive: Math.max(start, Math.min(nextStart, text.length)),
    beyondText: start >= text.length
  };
}
