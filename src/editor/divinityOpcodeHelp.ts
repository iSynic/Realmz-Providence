import opcodeHelpData from "./generated/divinityOpcodeHelp.json";

export type DivinityOpcodeHelpEntry = {
  resourceId: number;
  codes: number[];
  primaryCode: number;
  title: string;
  idField: string;
  use: string;
  options: string;
  extraCodes: string;
  summary: string;
  fullText: string;
};

type DivinityOpcodeHelpData = {
  schemaVersion: number;
  source: string;
  sourceSha256: string;
  textResourceCount: number;
  opcodeEntryCount: number;
  byCode: Record<string, number[]>;
  entries: DivinityOpcodeHelpEntry[];
  examples: { resourceId: number; title: string; summary: string; fullText: string }[];
};

const helpData = opcodeHelpData as DivinityOpcodeHelpData;
const entriesByResourceId = new Map(helpData.entries.map((entry) => [entry.resourceId, entry]));

export const DIVINITY_OPCODE_HELP_SOURCE = {
  source: helpData.source,
  sourceSha256: helpData.sourceSha256,
  textResourceCount: helpData.textResourceCount,
  opcodeEntryCount: helpData.opcodeEntryCount
};

export function divinityHelpEntriesForOpcode(rawCode: number): DivinityOpcodeHelpEntry[] {
  const lookupCode = divinityHelpLookupCode(rawCode);
  const resourceIds = helpData.byCode[String(lookupCode)] ?? [];
  return resourceIds.map((resourceId) => entriesByResourceId.get(resourceId)).filter((entry): entry is DivinityOpcodeHelpEntry => Boolean(entry));
}

export function divinityHelpForOpcode(rawCode: number): DivinityOpcodeHelpEntry | undefined {
  return divinityHelpEntriesForOpcode(rawCode)[0];
}

export function divinityHelpSearchText(rawCode: number): string {
  return divinityHelpEntriesForOpcode(rawCode)
    .map((entry) => `${entry.title} ${entry.idField} ${entry.use} ${entry.options} ${entry.extraCodes}`)
    .join(" ");
}

function divinityHelpLookupCode(code: number) {
  if (code < 0 && code !== -14 && code !== -23) return -code;
  return code;
}
