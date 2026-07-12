import { itemReferenceOptions } from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";

export type SpellResponseOption = {
  key: string;
  value: number;
  label: string;
  detail: string;
};

export function spellReferenceOptions(
  project: Project,
  catalog?: LibraryCatalog | null
): SpellResponseOption[] {
  const options = new Map<number, SpellResponseOption>();
  const add = (option: SpellResponseOption) => {
    if (option.value === 0) return;
    if (!options.has(option.value)) options.set(option.value, option);
  };
  [
    ["spell-class:1", 1, "Heat/Fire spell class (1)", "Matches spells whose runtime spell class is Heat."],
    ["spell-class:2", 2, "Cold spell class (2)", "Matches spells whose runtime spell class is Cold."],
    ["spell-class:3", 3, "Electrical spell class (3)", "Matches spells whose runtime spell class is Electrical."],
    ["spell-class:4", 4, "Chemical spell class (4)", "Matches spells whose runtime spell class is Chemical."],
    ["spell-class:5", 5, "Mental spell class (5)", "Matches spells whose runtime spell class is Mental."],
    ["spell-class:6", 6, "Magical spell class (6)", "Matches spells whose runtime spell class is Magical."]
  ].forEach(([key, value, label, detail]) => add({
    key: String(key),
    value: Number(value),
    label: String(label),
    detail: String(detail)
  }));
  for (const spell of project.spellOverrides ?? []) {
    const name = spell.displayName?.trim() || `Custom Spell ${spell.id}`;
    add({
      key: `project-spell:${spell.id}`,
      value: spell.id,
      label: `${name} (${spell.id})`,
      detail: "Scenario custom spell override"
    });
  }
  for (const entry of catalog?.records ?? []) {
    if (entry.type !== "spell") continue;
    const id = typeof entry.summary.packedSpellId === "number" ? entry.summary.packedSpellId : null;
    if (id == null) continue;
    const displayName = typeof entry.summary.displayName === "string" ? entry.summary.displayName.trim() : "";
    add({
      key: entry.id,
      value: id,
      label: `${displayName || entry.label || "Spell"} (${id})`,
      detail: [
        typeof entry.summary.spellLevel === "number" ? `level ${entry.summary.spellLevel}` : "",
        typeof entry.summary.spellcasterClass === "number" ? `class ${entry.summary.spellcasterClass + 1}` : "",
        entry.source
      ].filter(Boolean).join(" | ")
    });
  }
  return [...options.values()].sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
}

export function filterSpellResponseOptions(options: SpellResponseOption[], query: string) {
  const normalized = query.trim();
  if (!normalized) return options;
  const needle = normalized.toLowerCase();
  const numericQuery = /^-?\d+$/.test(normalized) ? Number(normalized) : null;
  return options.filter((option) =>
    option.value === numericQuery
    || option.label.toLowerCase().includes(needle)
    || option.detail.toLowerCase().includes(needle)
  );
}

export function deduplicatedItemResponseOptions(project: Project, catalog?: LibraryCatalog | null) {
  const seen = new Set<number>();
  return itemReferenceOptions(project, catalog).filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}
