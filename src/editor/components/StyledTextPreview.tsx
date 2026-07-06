import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  decodeClassicTextPreviewBytes,
  decodeClassicTextPreviewString,
  rawOffsetToDisplayOffset,
  type ClassicTextPreviewDecode
} from "../classicTextPreview";

export const CLASSIC_STYLE_RUN_BYTES = 20;
export const CLASSIC_TEXT_EDIT_VIEW_WIDTH = 320;
// Modern Realmz compiles screensize=1, then sets lookrect.right to 320 + leftshift (160).
export const REALMZ_GAMEPLAY_TEXT_VIEW_WIDTH = 480;
export const CLASSIC_TEXT_EDIT_PREVIEW_SCALES = [1, 2, 3] as const;
export const CLASSIC_STYLE_FACE_BITS = {
  bold: 1,
  italic: 2,
  underline: 4,
  outline: 8,
  shadow: 16,
  condense: 32,
  extend: 64
} as const;
export const CLASSIC_STYLE_EDITABLE_FACE_MASK = CLASSIC_STYLE_FACE_BITS.bold
  | CLASSIC_STYLE_FACE_BITS.italic
  | CLASSIC_STYLE_FACE_BITS.underline;
export const CLASSIC_STYLE_EXTRA_FACE_MASK = CLASSIC_STYLE_FACE_BITS.outline
  | CLASSIC_STYLE_FACE_BITS.shadow
  | CLASSIC_STYLE_FACE_BITS.condense
  | CLASSIC_STYLE_FACE_BITS.extend;

export type ClassicTextColor = {
  red: number;
  green: number;
  blue: number;
};

export type ClassicTextStyleRun = {
  index: number;
  startChar: number;
  height: number;
  ascent: number;
  font: number;
  face: number;
  size: number;
  color: ClassicTextColor;
};

export type ClassicTextEditAlignment = "left" | "center" | "right";
type ClassicTextEditPreviewScale = typeof CLASSIC_TEXT_EDIT_PREVIEW_SCALES[number];

export const DEFAULT_CLASSIC_STYLE_RUN: ClassicTextStyleRun = {
  index: 0,
  startChar: 0,
  height: 12,
  ascent: 9,
  font: 0,
  face: 0,
  size: 12,
  color: { red: 0, green: 0, blue: 0 }
};

type StyledTextPreviewSegment = {
  displayStart: number;
  displayEnd: number;
  rawStart: number;
  rawEnd: number;
  text: string;
  run: ClassicTextStyleRun | null;
};

export type StyledTextDisplaySelection = {
  start: number;
  end: number;
};

export function StyledScrollingTextPreview({
  text,
  runs,
  parseError,
  draftDirty,
  title = "Styled Preview",
  description = "Offset-preserving Classic TEXT/styl preview. Windows Realmz testing currently ignores styl formatting.",
  className = "",
  textEditAlignment = "left",
  movieViewportWidth = CLASSIC_TEXT_EDIT_VIEW_WIDTH,
  defaultViewportScale = 1,
  textBytes = null,
  showRunStartBadges = false,
  editableText = false,
  onTextChange,
  onApplyChanges,
  applyChangesDisabled = true,
  onDisplaySelectionChange
}: {
  text: string;
  runs: ClassicTextStyleRun[];
  parseError: string | null;
  draftDirty: boolean;
  title?: string;
  description?: string;
  className?: string;
  textEditAlignment?: ClassicTextEditAlignment;
  movieViewportWidth?: number;
  defaultViewportScale?: number;
  textBytes?: Uint8Array | null;
  showRunStartBadges?: boolean;
  editableText?: boolean;
  onTextChange?: (text: string) => void;
  onApplyChanges?: () => void;
  applyChangesDisabled?: boolean;
  onDisplaySelectionChange?: (range: StyledTextDisplaySelection) => void;
}) {
  const decodedText = useMemo(
    () => textBytes ? decodeClassicTextPreviewBytes(textBytes) : decodeClassicTextPreviewString(text),
    [text, textBytes]
  );
  const preview = useMemo(() => styledTextPreviewSegments(decodedText, runs), [decodedText, runs]);
  const [viewportScale, setViewportScale] = useState<ClassicTextEditPreviewScale>(() => normalizePreviewScale(defaultViewportScale));
  const [canvasHeight, setCanvasHeight] = useState(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pendingSelectionRef = useRef<StyledTextDisplaySelection | null>(null);
  const normalizedViewportWidth = Math.max(1, Math.round(movieViewportWidth));
  const frameStyle = useMemo<CSSProperties>(() => ({
    width: `${normalizedViewportWidth * viewportScale}px`,
    height: canvasHeight > 0 ? `${canvasHeight * viewportScale}px` : undefined
  }), [canvasHeight, normalizedViewportWidth, viewportScale]);
  const sectionStyle = useMemo(() => ({
    "--text-style-preview-scaled-width": `${normalizedViewportWidth * viewportScale}px`
  }) as CSSProperties, [normalizedViewportWidth, viewportScale]);
  const canvasStyle = useMemo<CSSProperties>(() => ({
    width: `${normalizedViewportWidth}px`,
    textAlign: textEditAlignment,
    transform: viewportScale === 1 ? "none" : `scale(${viewportScale})`
  }), [normalizedViewportWidth, textEditAlignment, viewportScale]);
  useLayoutEffect(() => {
    const element = canvasRef.current;
    if (!element) return undefined;
    const measure = () => setCanvasHeight(element.scrollHeight);
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [normalizedViewportWidth, preview]);
  useLayoutEffect(() => {
    const element = canvasRef.current;
    const pending = pendingSelectionRef.current;
    if (!editableText || !element || !pending) return;
    pendingSelectionRef.current = null;
    setDomSelectionForDisplayRange(element, pending.start, pending.end);
  }, [editableText, text, preview]);
  const captureDisplaySelection = useCallback(() => {
    const element = canvasRef.current;
    if (!element || !onDisplaySelectionChange) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return;
    const start = displayOffsetForDomPoint(element, range.startContainer, range.startOffset);
    const end = displayOffsetForDomPoint(element, range.endContainer, range.endOffset);
    onDisplaySelectionChange({ start: Math.min(start, end), end: Math.max(start, end) });
  }, [onDisplaySelectionChange]);
  const captureEditableSelection = useCallback(() => {
    const element = canvasRef.current;
    if (!element) return null;
    const selection = displaySelectionForRoot(element);
    if (selection) onDisplaySelectionChange?.(selection);
    return selection;
  }, [onDisplaySelectionChange]);
  const updateEditableText = useCallback(() => {
    const element = canvasRef.current;
    if (!element || !editableText || !onTextChange) return;
    const selection = captureEditableSelection();
    pendingSelectionRef.current = selection;
    onTextChange(readEditableText(element));
  }, [captureEditableSelection, editableText, onTextChange]);
  const insertEditableText = useCallback((value: string) => {
    if (!editableText) return;
    document.execCommand("insertText", false, value);
  }, [editableText]);
  return (
    <section className={`text-style-preview${className ? ` ${className}` : ""}`} style={sectionStyle}>
      <header>
        <div>
          <span>{title}</span>
          <small>{description}</small>
        </div>
        <div className="text-style-preview-header-actions">
          {draftDirty && <b>Draft style runs</b>}
          {editableText && onApplyChanges && (
            <button type="button" className="btn btn-primary btn-xs" disabled={applyChangesDisabled} onClick={onApplyChanges}>
              Apply Changes
            </button>
          )}
          <div className="text-style-preview-scale-controls" aria-label="Classic TextEdit preview scale">
            {CLASSIC_TEXT_EDIT_PREVIEW_SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className={scale === viewportScale ? "active" : ""}
                onClick={() => setViewportScale(scale)}
                title={`${normalizedViewportWidth * scale}px Classic TextEdit viewport`}
              >
                {scale}x
              </button>
            ))}
          </div>
        </div>
      </header>
      <div className="text-style-preview-body">
        <div className="text-style-preview-frame" style={frameStyle}>
          <div
            ref={canvasRef}
            className="text-style-preview-canvas"
            style={canvasStyle}
            tabIndex={editableText || onDisplaySelectionChange ? 0 : undefined}
            contentEditable={editableText}
            suppressContentEditableWarning={editableText}
            spellCheck={editableText}
            data-placeholder={editableText ? "Enter scrolling text..." : undefined}
            onBeforeInput={(event) => {
              if (!editableText) return;
              const inputEvent = event.nativeEvent as InputEvent;
              if (inputEvent.inputType === "insertParagraph" || inputEvent.inputType === "insertLineBreak") {
                event.preventDefault();
                insertEditableText("\n");
              }
            }}
            onPaste={(event) => {
              if (!editableText) return;
              event.preventDefault();
              insertEditableText(event.clipboardData.getData("text/plain"));
            }}
            onInput={updateEditableText}
            onMouseUp={captureDisplaySelection}
            onKeyUp={captureEditableSelection}
            onBlur={captureDisplaySelection}
          >
            {preview.segments.length > 0 ? preview.segments.map((segment) => (
              <span
                key={`${segment.rawStart}:${segment.rawEnd}:${segment.text.slice(0, 12)}`}
                className={`text-style-preview-run ${segment.run ? "" : "plain"}`}
                style={segment.run ? classicStyleRunCss(segment.run) : undefined}
                title={segment.run ? styleRunPreviewTitle(segment.run, segment.rawStart, segment.rawEnd, segment.displayStart, segment.displayEnd) : `Plain text from displayed character ${segment.displayStart}`}
              >
                {segment.run && showRunStartBadges && <i>{segment.rawStart}</i>}
                {segment.text}
              </span>
            )) : editableText ? null : <span className="text-style-preview-empty">No scrolling TEXT body to preview.</span>}
          </div>
        </div>
      </div>
      {(parseError || preview.diagnostics.length > 0) && (
        <ul className="text-style-preview-diagnostics">
          {parseError && <li>{parseError}</li>}
          {preview.diagnostics.map((diagnostic) => <li key={diagnostic}>{diagnostic}</li>)}
        </ul>
      )}
    </section>
  );
}

function displayOffsetForDomPoint(root: HTMLElement, node: Node, offset: number) {
  if (!root.contains(node)) return 0;
  const range = document.createRange();
  range.setStart(root, 0);
  try {
    range.setEnd(node, offset);
  } catch {
    return root.textContent?.length ?? 0;
  }
  return range.toString().length;
}

function displaySelectionForRoot(root: HTMLElement): StyledTextDisplaySelection | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const start = displayOffsetForDomPoint(root, range.startContainer, range.startOffset);
  const end = displayOffsetForDomPoint(root, range.endContainer, range.endOffset);
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function setDomSelectionForDisplayRange(root: HTMLElement, start: number, end: number) {
  const startPoint = domPointForDisplayOffset(root, start);
  const endPoint = domPointForDisplayOffset(root, end);
  if (!startPoint || !endPoint) return;
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function domPointForDisplayOffset(root: HTMLElement, offset: number) {
  const target = Math.max(0, offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let cursor = 0;
  let lastText: Text | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    lastText = node;
    const next = cursor + node.data.length;
    if (target <= next) return { node, offset: Math.max(0, Math.min(node.data.length, target - cursor)) };
    cursor = next;
  }
  return lastText ? { node: lastText, offset: lastText.data.length } : { node: root, offset: 0 };
}

function readEditableText(root: HTMLElement) {
  return root.textContent ?? "";
}

function normalizePreviewScale(value: number): ClassicTextEditPreviewScale {
  if (value === 2 || value === 3) return value;
  return 1;
}

export function parseClassicStyleRuns(bytes: Uint8Array | null): { ok: true; runs: ClassicTextStyleRun[] } | { ok: false; error: string } {
  if (!bytes || bytes.byteLength === 0) return { ok: true, runs: [] };
  if (bytes.byteLength < 2) return { ok: false, error: "Style bytes are too short to contain a run count." };
  const runCount = u16FromBytes(bytes, 0);
  const expectedLength = 2 + runCount * CLASSIC_STYLE_RUN_BYTES;
  if (bytes.byteLength !== expectedLength) {
    return {
      ok: false,
      error: `Style table does not match the Classic ${CLASSIC_STYLE_RUN_BYTES}-byte run format (${bytes.byteLength} byte(s), expected ${expectedLength}).`
    };
  }
  const runs: ClassicTextStyleRun[] = [];
  for (let index = 0; index < runCount; index += 1) {
    const offset = 2 + index * CLASSIC_STYLE_RUN_BYTES;
    runs.push({
      index,
      startChar: i32FromBytes(bytes, offset),
      height: i16FromBytes(bytes, offset + 4),
      ascent: i16FromBytes(bytes, offset + 6),
      font: i16FromBytes(bytes, offset + 8),
      face: bytes[offset + 10] ?? 0,
      size: i16FromBytes(bytes, offset + 12),
      color: {
        red: u16FromBytes(bytes, offset + 14),
        green: u16FromBytes(bytes, offset + 16),
        blue: u16FromBytes(bytes, offset + 18)
      }
    });
  }
  return { ok: true, runs };
}

export function classicStyleBytesFromRuns(runs: ClassicTextStyleRun[]) {
  const bytes = new Uint8Array(2 + runs.length * CLASSIC_STYLE_RUN_BYTES);
  writeU16(bytes, 0, runs.length);
  runs.forEach((run, index) => {
    const offset = 2 + index * CLASSIC_STYLE_RUN_BYTES;
    writeI32(bytes, offset, run.startChar);
    writeI16(bytes, offset + 4, run.height);
    writeI16(bytes, offset + 6, run.ascent);
    writeI16(bytes, offset + 8, run.font);
    bytes[offset + 10] = run.face & 0xff;
    bytes[offset + 11] = 0;
    writeI16(bytes, offset + 12, run.size);
    writeU16(bytes, offset + 14, run.color.red);
    writeU16(bytes, offset + 16, run.color.green);
    writeU16(bytes, offset + 18, run.color.blue);
  });
  return bytes;
}

export function classicRgbToCssHex(color: ClassicTextColor) {
  const toByte = (value: number) => Math.max(0, Math.min(255, Math.round(value / 257)));
  return `#${[toByte(color.red), toByte(color.green), toByte(color.blue)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function cssHexToClassicRgb(value: string): ClassicTextColor {
  const normalized = value.replace(/^#/, "");
  const red = Number.parseInt(normalized.slice(0, 2), 16) * 257;
  const green = Number.parseInt(normalized.slice(2, 4), 16) * 257;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) * 257;
  return { red, green, blue };
}

export function u16FromBytes(bytes: Uint8Array, offset: number) {
  if (offset + 2 > bytes.byteLength) return 0;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

export function styledTextPreviewSegments(decoded: ClassicTextPreviewDecode, runs: ClassicTextStyleRun[]) {
  const diagnostics: string[] = [];
  const text = decoded.text;
  if (!text) return { segments: [] as StyledTextPreviewSegment[], diagnostics };
  const validRuns = runs
    .filter((run) => Number.isInteger(run.startChar) && run.startChar >= 0)
    .sort((left, right) => left.startChar - right.startChar || left.index - right.index);
  if (validRuns.length === 0) {
    return { segments: [{ displayStart: 0, displayEnd: text.length, rawStart: 0, rawEnd: decoded.rawByteLength, text, run: null }], diagnostics };
  }
  const segments: StyledTextPreviewSegment[] = [];
  let displayCursor = 0;
  let rawCursor = 0;
  validRuns.forEach((run, index) => {
    const rawStart = run.startChar;
    const nextRawStart = validRuns.slice(index + 1).find((candidate) => candidate.startChar > rawStart)?.startChar ?? decoded.rawByteLength;
    const displayStart = rawOffsetToDisplayOffset(decoded, rawStart);
    if (rawStart >= decoded.rawByteLength) {
      diagnostics.push(`Style run ${run.index + 1} starts at raw byte ${rawStart}, outside the ${decoded.rawByteLength}-byte TEXT body.`);
      return;
    }
    if (displayStart > displayCursor) {
      segments.push({
        displayStart: displayCursor,
        displayEnd: displayStart,
        rawStart: rawCursor,
        rawEnd: rawStart,
        text: text.slice(displayCursor, displayStart),
        run: null
      });
    }
    const rawEnd = Math.max(rawStart, Math.min(nextRawStart, decoded.rawByteLength));
    const displayEnd = Math.max(displayStart, rawOffsetToDisplayOffset(decoded, rawEnd));
    if (displayEnd <= displayStart) {
      diagnostics.push(`Style run ${run.index + 1} at raw byte ${rawStart} has no visible text span.`);
      return;
    }
    segments.push({ displayStart, displayEnd, rawStart, rawEnd, text: text.slice(displayStart, displayEnd), run });
    displayCursor = Math.max(displayCursor, displayEnd);
    rawCursor = Math.max(rawCursor, rawEnd);
  });
  if (displayCursor < text.length) {
    segments.push({
      displayStart: displayCursor,
      displayEnd: text.length,
      rawStart: rawCursor,
      rawEnd: decoded.rawByteLength,
      text: text.slice(displayCursor),
      run: null
    });
  }
  return { segments, diagnostics };
}

function classicStyleRunCss(run: ClassicTextStyleRun): CSSProperties {
  const clampedSize = Math.max(10, Math.min(32, run.size || 12));
  const decorations = [];
  if (run.face & CLASSIC_STYLE_FACE_BITS.underline) decorations.push("underline");
  if (run.face & CLASSIC_STYLE_FACE_BITS.outline) decorations.push("overline");
  return {
    color: classicRgbToCssHex(run.color),
    fontSize: `${clampedSize}px`,
    fontStyle: run.face & CLASSIC_STYLE_FACE_BITS.italic ? "italic" : "normal",
    fontWeight: run.face & CLASSIC_STYLE_FACE_BITS.bold ? 900 : 600,
    textDecorationLine: decorations.length ? decorations.join(" ") : "none",
    letterSpacing: run.face & CLASSIC_STYLE_FACE_BITS.extend ? "0.04em" : "0"
  };
}

function styleRunPreviewTitle(run: ClassicTextStyleRun, rawStart: number, rawEnd: number, displayStart: number, displayEnd: number) {
  return `Style run ${run.index + 1}: raw bytes ${rawStart}-${Math.max(rawStart, rawEnd - 1)}, display characters ${displayStart}-${Math.max(displayStart, displayEnd - 1)}, font ${run.font}, size ${run.size}, ${classicStyleFaceLabel(run.face)}.`;
}

function classicStyleFaceLabel(face: number) {
  const labels: string[] = [];
  if (face & CLASSIC_STYLE_FACE_BITS.bold) labels.push("Bold");
  if (face & CLASSIC_STYLE_FACE_BITS.italic) labels.push("Italic");
  if (face & CLASSIC_STYLE_FACE_BITS.underline) labels.push("Underline");
  if (face & CLASSIC_STYLE_FACE_BITS.outline) labels.push("Outline");
  if (face & CLASSIC_STYLE_FACE_BITS.shadow) labels.push("Shadow");
  if (face & CLASSIC_STYLE_FACE_BITS.condense) labels.push("Condense");
  if (face & CLASSIC_STYLE_FACE_BITS.extend) labels.push("Extend");
  return labels.length ? labels.join(", ") : "Plain";
}

function i16FromBytes(bytes: Uint8Array, offset: number) {
  if (offset + 2 > bytes.byteLength) return 0;
  const value = (bytes[offset] << 8) | bytes[offset + 1];
  return value & 0x8000 ? value - 0x10000 : value;
}

function i32FromBytes(bytes: Uint8Array, offset: number) {
  if (offset + 4 > bytes.byteLength) return 0;
  const value = ((bytes[offset] ?? 0) * 0x1000000) + (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

function writeU16(bytes: Uint8Array, offset: number, value: number) {
  const normalized = Math.max(0, Math.min(0xffff, Math.round(value)));
  bytes[offset] = (normalized >> 8) & 0xff;
  bytes[offset + 1] = normalized & 0xff;
}

function writeI16(bytes: Uint8Array, offset: number, value: number) {
  const normalized = Math.max(-0x8000, Math.min(0x7fff, Math.round(value)));
  writeU16(bytes, offset, normalized < 0 ? normalized + 0x10000 : normalized);
}

function writeI32(bytes: Uint8Array, offset: number, value: number) {
  const normalized = Math.max(-0x80000000, Math.min(0x7fffffff, Math.round(value)));
  const unsigned = normalized < 0 ? normalized + 0x100000000 : normalized;
  bytes[offset] = Math.floor(unsigned / 0x1000000) & 0xff;
  bytes[offset + 1] = (unsigned >> 16) & 0xff;
  bytes[offset + 2] = (unsigned >> 8) & 0xff;
  bytes[offset + 3] = unsigned & 0xff;
}
