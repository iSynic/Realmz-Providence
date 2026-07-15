import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { TriggerRecord } from "../../types";
import { filterReferencePickerOptions } from "../../ui";
import {
  ItemSlotGrid,
  MacroReferenceField,
  RequiredWeaponField,
  SpellSlotGrid,
  SummonEligibleField,
  WeaponIdField,
  monsterRawReferenceOption,
  monsterReferencePickerOptions
} from "./MonsterReferenceFields";

function fixture() {
  const project = createBrowserProject("Monster references");
  project.triggers = [{
    source: "Data ED3",
    recordIndex: 7,
    actions: [{ slot: 0, rawCode: 1, id: 12 }]
  }] as TriggerRecord[];
  project.spellOverrides = [{
    id: 44,
    displayName: "Drowned Grasp"
  } as NonNullable<typeof project.spellOverrides>[number]];
  return project;
}

describe("Monster reference fields", () => {
  it("builds searchable options and preserves raw imported IDs", () => {
    const options = monsterReferencePickerOptions([
      { key: "spell:44", value: 44, label: "Drowned Grasp (44)", detail: "level 3 | sorcerer" }
    ], "monster spell");

    expect(filterReferencePickerOptions(options, "drowned sorcerer").map((option) => option.value)).toEqual([44]);
    expect(monsterRawReferenceOption("771", options, "Spell")?.value).toBe(771);
    expect(monsterRawReferenceOption("44", options, "Spell")).toBeNull();
    expect(monsterRawReferenceOption("0", options, "Spell")).toBeNull();
  });

  it("renders shared compact pickers for large Monster reference sets", () => {
    const project = fixture();
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(MacroReferenceField, { project, value: 7, onCommit: vi.fn() }),
      createElement(WeaponIdField, { project, catalog: null, value: -2, onCommit: vi.fn() }),
      createElement(RequiredWeaponField, { project, catalog: null, value: -1, onCommit: vi.fn() }),
      createElement(SpellSlotGrid, { project, catalog: null, values: [44], onCommit: vi.fn() }),
      createElement(ItemSlotGrid, { project, catalog: null, values: [900], onCommit: vi.fn() })
    ));

    expect(html).toContain('aria-label="Search monster macro"');
    expect(html).toContain('aria-label="Search weapon used"');
    expect(html).toContain('aria-label="Search required weapon"');
    expect(html).toContain('aria-label="Search spell 1"');
    expect(html).toContain('aria-label="Search item 1"');
    expect(html).toContain("Extra Action Point 7");
    expect(html).toContain("Drowned Grasp (44)");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("<select");
  });

  it("keeps unresolved values visible and the small summon enum native", () => {
    const project = fixture();
    const references = renderToStaticMarkup(createElement("div", null,
      createElement(MacroReferenceField, { project, value: 91, onCommit: vi.fn() }),
      createElement(SpellSlotGrid, { project, catalog: null, values: [771], onCommit: vi.fn() }),
      createElement(ItemSlotGrid, { project, catalog: null, values: [777], onCommit: vi.fn() })
    ));
    const summon = renderToStaticMarkup(createElement(SummonEligibleField, { value: 1, onCommit: vi.fn() }));

    expect(references).toContain("Extra Action Point 91");
    expect(references).toContain("Spell 771");
    expect(references).toContain("Item 777");
    expect(summon).toContain("<select");
    expect(summon).toContain("1 = Yes");
  });
});
