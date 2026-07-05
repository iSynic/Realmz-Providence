import type { MessageRecord, OptionLabelRecord } from "../types";

export const MESSAGE_RECORD_BYTES = 256;
export const OPTION_LABEL_RECORD_BYTES = 25;

type PascalTextRecord = {
  id: number;
  text: string;
  rawBytes?: number[];
  authored?: boolean;
};

export function writeMessages(records: MessageRecord[]) {
  return writePascalTextRecords(records, MESSAGE_RECORD_BYTES);
}

export function writeOptionLabels(records: OptionLabelRecord[]) {
  return writePascalTextRecords(records, OPTION_LABEL_RECORD_BYTES);
}

function writePascalTextRecords(records: PascalTextRecord[], recordBytes: number) {
  const selected = records
    .filter((record) => Number.isInteger(record.id) && record.id >= 0)
    .sort((left, right) => left.id - right.id);
  const count = selected.length > 0 ? selected[selected.length - 1].id + 1 : 0;
  const output = new Uint8Array(count * recordBytes);
  for (const record of selected) {
    const start = record.id * recordBytes;
    const target = output.subarray(start, start + recordBytes);
    copyRaw(target, record.rawBytes ?? []);
    if (!record.authored && record.rawBytes?.length === recordBytes) continue;
    encodePascalText(target, record.text);
  }
  return output;
}

function copyRaw(target: Uint8Array, raw: number[]) {
  const length = Math.min(target.byteLength, raw.length);
  for (let index = 0; index < length; index += 1) target[index] = raw[index] & 0xff;
}

function encodePascalText(target: Uint8Array, text: string) {
  if (target.byteLength === 0) return;
  const bytes = classicTextBytes(text);
  const maximum = Math.min(target.byteLength - 1, 255);
  if (bytes.byteLength > maximum) {
    throw new Error(`Classic Pascal text is ${bytes.byteLength} byte(s); maximum is ${maximum}`);
  }
  target.fill(0);
  target[0] = bytes.byteLength;
  target.set(bytes, 1);
}

function classicTextBytes(text: string) {
  return new Uint8Array([...text].map((char) => char.charCodeAt(0) <= 0x7f ? char.charCodeAt(0) : "?".charCodeAt(0)));
}
