import { spellAnimationFrameIds } from "../../resourceIds";
import { itemReferenceOptions } from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";
import { REQUIRED_WEAPON_MAX_SPECIFIC_CODE } from "./monsterReferenceModel";

export type CombatSelectOption = {
  key: string;
  value: number;
  label: string;
  detail?: string;
};

export function combatSpellOptions(project: Project, catalog: LibraryCatalog | null): CombatSelectOption[] {
  const options = new Map<number, CombatSelectOption>();
  const add = (option: CombatSelectOption) => {
    if (!option.value || options.has(option.value)) return;
    options.set(option.value, option);
  };
  for (const spell of project.spellOverrides ?? []) {
    const name = spell.displayName?.trim() || `Custom Spell ${spell.id}`;
    add({ key: `project-spell:${spell.id}`, value: spell.id, label: `${name} (${spell.id})`, detail: "Scenario custom spell override" });
  }
  for (const entry of catalog?.records ?? []) {
    if (entry.type !== "spell") continue;
    const id = recordSummaryNumber(entry, "packedSpellId");
    if (id == null) continue;
    const displayName = recordSummaryString(entry, "displayName");
    const level = recordSummaryNumber(entry, "spellLevel");
    const spellClass = recordSummaryNumber(entry, "spellcasterClass");
    add({
      key: entry.id,
      value: id,
      label: `${displayName || entry.label || "Spell"} (${id})`,
      detail: [
        level != null ? `level ${level}` : "",
        spellClass != null ? `class ${spellClass + 1}` : "",
        entry.source
      ].filter(Boolean).join(" | ")
    });
  }
  return [...options.values()].sort((a, b) => a.value - b.value || a.label.localeCompare(b.label));
}

export function monsterRequiredWeaponOptions(project: Project, catalog: LibraryCatalog | null): CombatSelectOption[] {
  const weaponOptions = new Map(
    itemReferenceOptions(project, catalog)
      .filter((item) => item.category === "weapon" && item.value > 0 && item.value <= REQUIRED_WEAPON_MAX_SPECIFIC_CODE)
      .map((item) => [item.value, item])
  );
  return [
    { key: "required-weapon:blunt", value: -1, label: "Blunt only", detail: "Stored as -1." },
    { key: "required-weapon:sharp", value: -2, label: "Sharp only", detail: "Stored as -2." },
    ...Array.from({ length: REQUIRED_WEAPON_MAX_SPECIFIC_CODE }, (_, index) => {
      const code = index + 1;
      const item = weaponOptions.get(code);
      return {
        key: `required-weapon:${code}`,
        value: code,
        label: item?.label ?? `Weapon ${code}`,
        detail: item ? [item.detail, item.sourceState].filter(Boolean).join(" | ") : `Specific weapon code ${code}.`
      };
    })
  ];
}

export function spellPreviewIconIdMap(project: Project, catalog: LibraryCatalog | null) {
  const icons = new Map<number, number>();
  const add = (id: number | null, summary: Record<string, unknown>) => {
    if (!id || icons.has(id)) return;
    const iconId = spellPreviewIconId(summary);
    if (iconId) icons.set(id, iconId);
  };
  for (const spell of project.spellOverrides ?? []) {
    add(spell.id, { spellLook1: spell.spellLook1, spellLook2: spell.spellLook2 });
  }
  for (const record of catalog?.records ?? []) {
    if (record.type !== "spell") continue;
    add(recordSummaryNumber(record, "packedSpellId"), record.summary);
  }
  for (const entity of catalog?.entities ?? []) {
    if (entity.type !== "spell") continue;
    add(summaryFieldNumber(entity.summary, "packedSpellId"), entity.summary);
  }
  return icons;
}

function spellPreviewIconId(summary: Record<string, unknown>) {
  const castLook = summaryFieldNumber(summary, "spellLook1");
  if (castLook != null) {
    const frame = spellAnimationFrameIds(castLook, "blank-cast")[0];
    if (frame) return frame;
  }
  const resolutionLook = summaryFieldNumber(summary, "spellLook2");
  if (resolutionLook != null) {
    return spellAnimationFrameIds(resolutionLook, "default-resolution")[0] ?? null;
  }
  return null;
}

function summaryFieldNumber(summary: Record<string, unknown>, key: string) {
  const value = summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordSummaryNumber(record: LibraryCatalog["records"][number], key: string) {
  const value = record.summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordSummaryString(record: LibraryCatalog["records"][number], key: string) {
  const value = record.summary[key];
  return typeof value === "string" ? value.trim() : "";
}
