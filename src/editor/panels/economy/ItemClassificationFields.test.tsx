import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { filterReferencePickerOptions } from "../../ui";
import {
  ItemCategoryReferenceField,
  ItemTypeReferenceField,
  itemCategoryPairForSingleSelection,
  itemCategoryReferenceOptions,
  itemTypeReferenceOptions,
  selectedItemCategoryIndexes
} from "./ItemClassificationFields";

describe("item classification reference fields", () => {
  it("searches the full item category and type tables", () => {
    expect(filterReferencePickerOptions(itemCategoryReferenceOptions(), "large bladed").map((option) => option.value)).toEqual([6, 7]);
    expect(filterReferencePickerOptions(itemTypeReferenceOptions(), "23 action point").map((option) => option.value)).toEqual([23]);
  });

  it("round-trips category indexes through the Realmz bit order", () => {
    const firstPair = itemCategoryPairForSingleSelection(0);
    const laterPair = itemCategoryPairForSingleSelection(40);

    expect(selectedItemCategoryIndexes(...firstPair)).toEqual([0]);
    expect(selectedItemCategoryIndexes(...laterPair)).toEqual([40]);
    expect(itemCategoryPairForSingleSelection(null)).toEqual([0, 0]);
  });

  it("renders the shared compact category picker", () => {
    const categoryPair = itemCategoryPairForSingleSelection(34);
    const html = renderToStaticMarkup(createElement(ItemCategoryReferenceField, {
      itemCat0: categoryPair[0],
      itemCat1: categoryPair[1],
      onChange: vi.fn()
    }));

    expect(html).toContain('aria-label="Search item category"');
    expect(html).toContain("34: Padded Armor");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("<select");
  });

  it("keeps imported multiple-category state explicit", () => {
    const first = itemCategoryPairForSingleSelection(0);
    const second = itemCategoryPairForSingleSelection(40);
    const html = renderToStaticMarkup(createElement(ItemCategoryReferenceField, {
      itemCat0: first[0] | second[0],
      itemCat1: first[1] | second[1],
      onChange: vi.fn()
    }));

    expect(html).toContain("2 categories");
    expect(html).toContain("is-unresolved");
  });

  it("preserves unknown imported item types", () => {
    const knownHtml = renderToStaticMarkup(createElement(ItemTypeReferenceField, { value: 23, onChange: vi.fn() }));
    const unknownHtml = renderToStaticMarkup(createElement(ItemTypeReferenceField, { value: 91, onChange: vi.fn() }));

    expect(knownHtml).toContain("23: Action Point Item (SP5 = AP ID)");
    expect(knownHtml).not.toContain("<select");
    expect(unknownHtml).toContain("91: Raw type 91");
    expect(unknownHtml).toContain("is-unresolved");
  });
});
