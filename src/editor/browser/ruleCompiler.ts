import rulesCompilerBaseline from "../../shared/rulesCompilerBaseline.json";
import { REALMZ_NATIVE_LAYOUT } from "../generated/realmzNativeManifestPolicy";
import type { ScenarioCasteOverride, ScenarioRaceOverride, ScenarioSpellOverride } from "../types";
import {
  CASTE_RECORD_BYTES,
  RACE_RECORD_BYTES,
  SPELL_RECORD_BYTES,
  writeCasteOverrides,
  writeRaceOverrides,
  writeSpellOverrides
} from "./binaryWriters";

export const CUSTOM_SPELL_RECORDS = REALMZ_NATIVE_LAYOUT.spellOverrideRecords;
export const RACE_OVERRIDE_RECORDS = REALMZ_NATIVE_LAYOUT.raceOverrideRecords;
export const CASTE_OVERRIDE_RECORDS = REALMZ_NATIVE_LAYOUT.casteOverrideRecords;

export function writeFreshSpellOverrides(records: ScenarioSpellOverride[]) {
  const invalid = records.find((record) => !Number.isInteger(record.id) || record.id < 0 || record.id >= CUSTOM_SPELL_RECORDS);
  if (invalid) throw new Error(`Custom spell ${invalid.id} is outside Data Spell's 0..${CUSTOM_SPELL_RECORDS - 1} custom slot range.`);
  if (records.length === 0) return new Uint8Array();
  const overlay = writeSpellOverrides(records);
  const output = new Uint8Array(CUSTOM_SPELL_RECORDS * SPELL_RECORD_BYTES);
  output.set(overlay);
  return output;
}

export function writeFreshRaceOverrides(records: ScenarioRaceOverride[]) {
  return writeFreshRuleOverrides("Data Race", "race", records, RACE_RECORD_BYTES, RACE_OVERRIDE_RECORDS, writeRaceOverrides);
}

export function writeFreshCasteOverrides(records: ScenarioCasteOverride[]) {
  return writeFreshRuleOverrides("Data Caste", "caste", records, CASTE_RECORD_BYTES, CASTE_OVERRIDE_RECORDS, writeCasteOverrides);
}

function writeFreshRuleOverrides<T extends { id: number; rawBytes?: number[] }>(
  fileName: "Data Race" | "Data Caste",
  family: "race" | "caste",
  records: T[],
  recordBytes: number,
  recordCapacity: number,
  writer: (records: T[]) => Uint8Array
) {
  const invalid = records.find((record) => !Number.isInteger(record.id) || record.id < 0 || record.id >= recordCapacity);
  if (invalid) throw new Error(`${fileName} record ${invalid.id} is outside the fresh 0..${recordCapacity - 1} scenario slot range.`);
  if (records.length === 0) return new Uint8Array();
  const encoded = writer(records);
  const output = ruleCompilerBaselineBytes(family, recordBytes, recordCapacity);
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
