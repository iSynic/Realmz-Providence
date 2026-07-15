import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ScenarioItemRecord } from "../../types";
import {
  ItemRestrictionSummary,
  ItemUseRestrictionEditor,
  itemRestrictionMaskBit,
  setItemRestrictionMaskBit
} from "./ItemUseRestrictionFields";

describe("ItemUseRestrictionFields", () => {
  it("preserves Realmz signed 16-bit restriction masks", () => {
    const highBit = setItemRestrictionMaskBit(0, 15, true);
    expect(highBit).toBe(-32768);
    expect(itemRestrictionMaskBit(highBit, 15)).toBe(true);
    expect(setItemRestrictionMaskBit(highBit, 15, false)).toBe(0);
  });

  it("renders decoded category, mask, race, and caste summaries", () => {
    const html = renderToStaticMarkup(createElement(ItemRestrictionSummary, {
      itemCat0: -2147483648,
      itemCat1: 0,
      raceRestrictions: 1,
      casteRestrictions: 1,
      specificRace: 1,
      specificCaste: 1,
      raceClassOnly: 0,
      casteClassOnly: 0
    }));

    expect(html).toContain("Small Blunt Weapons");
    expect(html).toContain("Short Race");
    expect(html).toContain("Warrior Castes");
    expect(html).toContain("1: Human");
    expect(html).toContain("1: Fighter");
  });

  it("keeps specific references searchable and mask choices as checkboxes", () => {
    const record = {
      specificRace: 0,
      specificCaste: 0,
      raceRestrictions: 0,
      casteRestrictions: 0,
      raceClassOnly: 0,
      casteClassOnly: 0
    } as ScenarioItemRecord;
    const html = renderToStaticMarkup(createElement(ItemUseRestrictionEditor, {
      record,
      onChange: vi.fn()
    }));

    expect(html).toContain('aria-label="Search specific race restriction"');
    expect(html).toContain('aria-label="Search specific caste restriction"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("Those That Can&#x27;t Use It");
    expect(html).toContain("Those That Can Use It");
  });
});
