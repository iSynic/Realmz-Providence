import { Project, RuleNames } from "./types";
import { REALMZ_CASTES, REALMZ_RACES } from "./rulesCatalog";

export const RACE_NAME_LIMIT = 70;
export const CASTE_NAME_LIMIT = 30;
export const CUSTOM_NAMES_SOURCE_FILE = "Data Files/Custom Names.rsrc";

export function defaultRaceName(id: number) {
  return REALMZ_RACES[id] || `Race ${id}`;
}

export function defaultCasteName(id: number) {
  return REALMZ_CASTES[id] || `Caste ${id}`;
}

export function defaultRuleNames(seed?: Partial<RuleNames> | null): RuleNames {
  const raceNames = Array.from({ length: RACE_NAME_LIMIT }, (_, id) => seed?.raceNames?.[id]?.trim() || defaultRaceName(id));
  const casteNames = Array.from({ length: CASTE_NAME_LIMIT }, (_, id) => seed?.casteNames?.[id]?.trim() || defaultCasteName(id));
  return {
    sourceFile: seed?.sourceFile || CUSTOM_NAMES_SOURCE_FILE,
    raceNames,
    casteNames,
    authored: seed?.authored ?? false,
    ...(seed?.provenance ? { provenance: seed.provenance } : {})
  };
}

export function ruleRaceName(project: Pick<Project, "ruleNames"> | null | undefined, id: number, fallback?: string) {
  return project?.ruleNames?.raceNames?.[id]?.trim() || fallback?.trim() || defaultRaceName(id);
}

export function ruleCasteName(project: Pick<Project, "ruleNames"> | null | undefined, id: number, fallback?: string) {
  return project?.ruleNames?.casteNames?.[id]?.trim() || fallback?.trim() || defaultCasteName(id);
}

export function ruleRaceOptions(project: Pick<Project, "ruleNames"> | null | undefined) {
  return Array.from({ length: RACE_NAME_LIMIT }, (_, id) => ruleRaceName(project, id));
}

export function ruleCasteOptions(project: Pick<Project, "ruleNames"> | null | undefined) {
  return Array.from({ length: CASTE_NAME_LIMIT }, (_, id) => ruleCasteName(project, id));
}

export function classicTextByteLength(value: string) {
  return Array.from(value).length;
}
