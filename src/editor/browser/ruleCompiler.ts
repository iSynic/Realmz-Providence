import rulesCompilerBaseline from "../../shared/rulesCompilerBaseline.json";
import type { ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride } from "../types";
import {
  CASTE_RECORD_BYTES,
  RACE_RECORD_BYTES,
  SPELL_RECORD_BYTES,
  writeCasteOverrides,
  writeRaceOverrides,
  writeSpellOverrides
} from "./binaryWriters";

export const CUSTOM_SPELL_RECORDS = 105;
export const RULE_OVERRIDE_RECORDS = 30;

export function writeFreshSpellOverrides(records: ScenarioSpellOverride[]) {
  const invalid = records.find((record) => !Number.isInteger(record.id) || record.id < 0 || record.id >= CUSTOM_SPELL_RECORDS);
  if (invalid) throw new Error(`Custom spell ${invalid.id} is outside Data Spell's 0..104 custom slot range.`);
  if (records.length === 0) return new Uint8Array();
  const overlay = writeSpellOverrides(records.map((record) => ({ ...record, rawBytes: [] })));
  const output = new Uint8Array(CUSTOM_SPELL_RECORDS * SPELL_RECORD_BYTES);
  output.set(overlay);
  return output;
}

export function writeFreshRaceOverrides(records: ScenarioRaceOverride[]) {
  return writeFreshRuleOverrides("Data Race", "race", records, RACE_RECORD_BYTES, writeRaceOverrides);
}

export function writeFreshCasteOverrides(records: ScenarioCasteOverride[]) {
  return writeFreshRuleOverrides("Data Caste", "caste", records, CASTE_RECORD_BYTES, writeCasteOverrides);
}

function writeFreshRuleOverrides<T extends { id: number; rawBytes?: number[] }>(
  fileName: "Data Race" | "Data Caste",
  family: "race" | "caste",
  records: T[],
  recordBytes: number,
  writer: (records: T[]) => Uint8Array
) {
  const invalid = records.find((record) => !Number.isInteger(record.id) || record.id < 0 || record.id >= RULE_OVERRIDE_RECORDS);
  if (invalid) throw new Error(`${fileName} record ${invalid.id} is outside the fresh 0..29 scenario slot range.`);
  if (records.length === 0) return new Uint8Array();
  const encoded = writer(records.map((record) => ({ ...record, rawBytes: [] })));
  const output = ruleCompilerBaselineBytes(family, recordBytes, RULE_OVERRIDE_RECORDS);
  for (const record of records) {
    const start = record.id * recordBytes;
    output.set(encoded.slice(start, start + recordBytes), start);
  }
  return output;
}

function ruleCompilerBaselineBytes(family: "race" | "caste", recordBytes: number, records: number) {
  const entry = rulesCompilerBaseline[family];
  if (rulesCompilerBaseline.schemaVersion !== 1 || entry.recordBytes !== recordBytes || entry.records !== records) {
    throw new Error(`Rules compiler baseline metadata for ${family} is invalid.`);
  }
  let binary: string;
  try {
    binary = atob(entry.bytesBase64);
  } catch {
    throw new Error(`Rules compiler baseline bytes for ${family} are invalid.`);
  }
  const bytes = Uint8Array.from(binary, (value) => value.charCodeAt(0));
  if (bytes.byteLength !== recordBytes * records) throw new Error(`Rules compiler baseline bytes for ${family} are invalid.`);
  return bytes;
}
