import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ItemSpecialAttributeField,
  ItemSpecialEffectCodeField,
  defaultItemSpecialAttributeValue,
  itemSpecialAttributeReferenceOptions,
  itemSpecialEffectReferenceOptions
} from "./ItemSpecialBehaviorFields";

describe("ItemSpecialBehaviorFields", () => {
  it("exposes decoded effect detail options with searchable stored codes", () => {
    const addConditions = itemSpecialEffectReferenceOptions("addCondition");
    const hitBonuses = itemSpecialEffectReferenceOptions("hitBonus");

    expect(addConditions).toHaveLength(40);
    expect(addConditions[0]).toMatchObject({ value: 20 });
    expect(addConditions[0]?.label).toMatch(/^20: /);
    expect(hitBonuses.map((option) => option.value)).toEqual([120, 121, 122]);
  });

  it("keeps the short behavior mode native and uses a compact picker for effect details", () => {
    const html = renderToStaticMarkup(createElement(ItemSpecialEffectCodeField, {
      value: 20,
      onChange: vi.fn()
    }));

    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Search Special 1 condition"');
    expect(html).toContain("20:");
    expect(html).toContain("workbench-reference-compact-trigger");
  });

  it("keeps unknown effect values editable as raw codes", () => {
    const html = renderToStaticMarkup(createElement(ItemSpecialEffectCodeField, {
      value: 777,
      onChange: vi.fn()
    }));

    expect(html).toContain("Raw Code");
    expect(html).toContain('type="number"');
    expect(html).toContain('value="777"');
    expect(html).not.toContain("Search Special 1");
  });

  it("provides complete ability, monster-type, and party-condition option families", () => {
    expect(itemSpecialAttributeReferenceOptions("ability")).toHaveLength(15);
    expect(itemSpecialAttributeReferenceOptions("monsterType")).toHaveLength(20);
    expect(itemSpecialAttributeReferenceOptions("partyCondition")).toHaveLength(11);
    expect(defaultItemSpecialAttributeValue("monsterType", 12)).toBe(-1);
  });

  it("uses the shared picker for decoded Special 3 and Special 4 attributes", () => {
    const html = renderToStaticMarkup(createElement(ItemSpecialAttributeField, {
      label: "Special 3",
      value: -3,
      onChange: vi.fn()
    }));

    expect(html.match(/<select/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Search Special 3 monster type"');
    expect(html).toContain("-3: Monster type 3");
  });
});
