import domainSource from "./edcdOptionDomains.json";

export type EdcdFieldOption = {
  value: number;
  label: string;
};

export type EdcdOptionDomain = {
  opcode: number;
  field: string;
  options: EdcdFieldOption[];
};

export const EDCD_OPTION_DOMAINS = domainSource.domains as EdcdOptionDomain[];

const domainsByKey = new Map(
  EDCD_OPTION_DOMAINS.map((domain) => [domainKey(domain.opcode, domain.field), domain])
);

export function documentedEdcdOptionDomain(opcode: number | undefined, field: string) {
  if (opcode == null) return null;
  return domainsByKey.get(domainKey(opcode, field)) ?? null;
}

export function documentedEdcdOptionsForField(opcode: number | undefined, field: string) {
  return documentedEdcdOptionDomain(opcode, field)?.options ?? null;
}

function domainKey(opcode: number, field: string) {
  return `${Math.abs(opcode)}:${field.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}
