import type { Provenance } from "../types";

export function authoredProvenance(sourceFile: string, recordIndex: number, byteOffset: number, byteLength: number): Provenance {
  return { sourceFile, recordIndex, byteOffset, byteLength, confidence: "inferred" };
}

export function padArray(values: number[], length: number, fill: number) {
  return [...values.slice(0, length), ...new Array(Math.max(0, length - values.length)).fill(fill)];
}

export function padStringArray(values: string[], length: number, fill: string) {
  return [...values.slice(0, length), ...new Array(Math.max(0, length - values.length)).fill(fill)];
}

export function padNestedNumberArrays(values: number[][], length: number, rowLength: number, fill: number) {
  const rows = values.slice(0, length).map((row) => padArray(row, rowLength, fill));
  while (rows.length < length) rows.push(new Array(rowLength).fill(fill));
  return rows;
}
