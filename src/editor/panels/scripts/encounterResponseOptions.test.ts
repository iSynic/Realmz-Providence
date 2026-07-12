import { describe, expect, it } from "vitest";
import type { LibraryCatalog, Project, ScenarioSpellOverride } from "../../types";
import {
  deduplicatedItemResponseOptions,
  filterSpellResponseOptions,
  spellReferenceOptions
} from "./encounterResponseOptions";

function projectWithSpells(spellOverrides: ScenarioSpellOverride[] = []) {
  return {
    spellOverrides,
    scenarioItems: [],
    itemTexts: [],
    treasures: [],
    shops: []
  } as unknown as Project;
}

function spellOverride(id: number, displayName: string) {
  return { id, displayName } as ScenarioSpellOverride;
}

function catalogWithSpell(id: number, displayName: string) {
  return {
    records: [{
      id: `spell:${id}`,
      source: "Realmz reference",
      type: "spell",
      label: displayName,
      editState: "inspect-only",
      byteRange: null,
      confidence: "decoded",
      summary: {
        packedSpellId: id,
        displayName,
        spellLevel: 4,
        spellcasterClass: 1
      }
    }],
    entities: []
  } as unknown as LibraryCatalog;
}

describe("encounter spell response options", () => {
  it("always includes the six Realmz spell classes in numeric order", () => {
    const options = spellReferenceOptions(projectWithSpells());

    expect(options.slice(0, 6).map((option) => option.value)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(options[0].label).toContain("Heat/Fire");
  });

  it("prefers a scenario spell override when the library contains the same packed ID", () => {
    const project = projectWithSpells([spellOverride(1401, "Scenario Storm")]);
    const options = spellReferenceOptions(project, catalogWithSpell(1401, "Library Storm"));

    expect(options.filter((option) => option.value === 1401)).toHaveLength(1);
    expect(options.find((option) => option.value === 1401)).toMatchObject({
      key: "project-spell:1401",
      label: "Scenario Storm (1401)",
      detail: "Scenario custom spell override"
    });
  });

  it("retains decoded library spell metadata and searches IDs, labels, and details", () => {
    const options = spellReferenceOptions(projectWithSpells(), catalogWithSpell(2401, "Stormglass Ward"));
    const librarySpell = options.find((option) => option.value === 2401);

    expect(librarySpell?.detail).toBe("level 4 | class 2 | Realmz reference");
    expect(filterSpellResponseOptions(options, "2401")).toEqual([librarySpell]);
    expect(filterSpellResponseOptions(options, "stormglass")).toEqual([librarySpell]);
    expect(filterSpellResponseOptions(options, "realmz reference")).toEqual([librarySpell]);
    expect(filterSpellResponseOptions(options, "  ")).toBe(options);
  });
});

describe("encounter item response options", () => {
  it("keeps one option per item ID and retains all custom scenario slots", () => {
    const options = deduplicatedItemResponseOptions(projectWithSpells());

    expect(options).toHaveLength(100);
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
    expect(options[0].value).toBe(900);
    expect(options[options.length - 1]?.value).toBe(999);
  });
});
