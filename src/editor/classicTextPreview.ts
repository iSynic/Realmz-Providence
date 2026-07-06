export type ClassicTextPreviewDecode = {
  text: string;
  rawByteLength: number;
  displayLength: number;
  rawToDisplay: number[];
  displayToRaw: number[];
};

export type ClassicTextSelectionRange = {
  start: number;
  end: number;
};

export function decodeClassicTextPreviewBytes(bytes: Uint8Array | null | undefined): ClassicTextPreviewDecode {
  const source = bytes ?? new Uint8Array();
  const nul = source.indexOf(0);
  const visibleLength = nul >= 0 ? nul : source.byteLength;
  const rawToDisplay = new Array<number>(source.byteLength + 1);
  const displayToRaw: number[] = [0];
  let text = "";
  for (let rawOffset = 0; rawOffset < visibleLength; rawOffset += 1) {
    rawToDisplay[rawOffset] = text.length;
    const decoded = decodeClassicTextPreviewByte(source[rawOffset] ?? 0);
    for (let index = 1; index < decoded.length; index += 1) {
      displayToRaw[text.length + index] = rawOffset;
    }
    text += decoded;
    rawToDisplay[rawOffset + 1] = text.length;
    displayToRaw[text.length] = rawOffset + 1;
  }
  for (let rawOffset = visibleLength; rawOffset <= source.byteLength; rawOffset += 1) {
    rawToDisplay[rawOffset] = text.length;
  }
  displayToRaw[text.length] = visibleLength;
  return {
    text,
    rawByteLength: visibleLength,
    displayLength: text.length,
    rawToDisplay,
    displayToRaw
  };
}

export function decodeClassicTextPreviewString(text: string): ClassicTextPreviewDecode {
  return decodeClassicTextPreviewBytes(classicTextBytesFromDisplayString(text));
}

export function classicTextBytesFromDisplayString(text: string) {
  return new Uint8Array(Array.from(text ?? "").map((char) => {
    if (char === "\n" || char === "\r") return 13;
    const code = char.charCodeAt(0);
    return code <= 0x7f ? code : 0x3f;
  }));
}

export function rawOffsetToDisplayOffset(decoded: ClassicTextPreviewDecode, rawOffset: number) {
  const clamped = Math.max(0, Math.min(decoded.rawToDisplay.length - 1, Math.round(rawOffset)));
  return decoded.rawToDisplay[clamped] ?? decoded.displayLength;
}

export function displayOffsetToRawOffset(decoded: ClassicTextPreviewDecode, displayOffset: number) {
  const clamped = Math.max(0, Math.min(decoded.displayToRaw.length - 1, Math.round(displayOffset)));
  return decoded.displayToRaw[clamped] ?? decoded.rawByteLength;
}

export function displayRangeToRawRange(decoded: ClassicTextPreviewDecode, range: ClassicTextSelectionRange): ClassicTextSelectionRange {
  const start = displayOffsetToRawOffset(decoded, Math.min(range.start, range.end));
  const end = displayOffsetToRawOffset(decoded, Math.max(range.start, range.end));
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

export function rawRangeToDisplayRange(decoded: ClassicTextPreviewDecode, range: ClassicTextSelectionRange): ClassicTextSelectionRange {
  const start = rawOffsetToDisplayOffset(decoded, Math.min(range.start, range.end));
  const end = rawOffsetToDisplayOffset(decoded, Math.max(range.start, range.end));
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

function decodeClassicTextPreviewByte(byte: number) {
  if (byte === 13 || byte === 10) return "\n";
  if (byte === 9) return "\t";
  if (byte >= 32) return String.fromCharCode(byte);
  return " ";
}
