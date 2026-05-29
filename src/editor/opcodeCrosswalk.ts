import crosswalkData from "./generated/opcodeEdcdCrosswalk.json";
import { normalizeStepOpcode } from "./realmzActions";

export type OpcodeWriterStatus =
  | "writer-ready-data-edcd"
  | "writer-ready-data-ed3-direct"
  | "writer-ready-map-action-point-copy"
  | "writer-ready-direct-code-id"
  | "writer-gated-direct-target-family"
  | "writer-gated-missing-edcd-shape";

export type OpcodeParameterLabel = {
  index: number;
  label: string;
  help: string;
  internalName: string;
  preserved: boolean;
};

export type OpcodeCrosswalkEntry = {
  opcode: number;
  title: string;
  idMeaning: string;
  idHelp: string;
  use: string;
  options: string;
  extraCodes: string;
  writerStatus: OpcodeWriterStatus;
  writerNote: string;
  runtimeNote: string | null;
  sourceStatus: string;
  shape: string | null;
  edcdBacked: boolean;
  parameters: OpcodeParameterLabel[];
};

type OpcodeCrosswalkData = {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  entries: Record<string, OpcodeCrosswalkEntry>;
};

const data = crosswalkData as OpcodeCrosswalkData;

export function crosswalkForOpcode(rawCode: number): OpcodeCrosswalkEntry | undefined {
  const normalized = normalizeStepOpcode(rawCode);
  return data.entries[String(rawCode)] ?? data.entries[String(normalized)];
}

export function parameterLabelsForOpcode(rawCode: number): OpcodeParameterLabel[] {
  return crosswalkForOpcode(rawCode)?.parameters ?? [];
}

export function opcodeIdMeaning(rawCode: number) {
  return crosswalkForOpcode(rawCode)?.idMeaning ?? "ID";
}

export function opcodeWriterStatus(rawCode: number): OpcodeWriterStatus | undefined {
  return crosswalkForOpcode(rawCode)?.writerStatus;
}

export function opcodeWriterNote(rawCode: number) {
  return crosswalkForOpcode(rawCode)?.writerNote ?? "";
}

export function opcodeActionHelpTitle(rawCode: number) {
  return crosswalkForOpcode(rawCode)?.title ?? `Opcode ${rawCode}`;
}
