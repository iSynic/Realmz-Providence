import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ItemReferenceOption } from "../../itemReferences";
import type { Project } from "../../types";
import { filterReferencePickerOptions } from "../../ui";
import {
  EconomyItemReferenceField,
  economyItemReferenceOptions,
  economyRawItemOption
} from "./EconomyItemReferenceField";

const project = { assets: [], assetCatalog: { icons: [] } } as unknown as Project;
const item: ItemReferenceOption = {
  key: "item:901",
  value: 901,
  label: "Beacon Lens (901)",
  category: "magic",
  detail: "1 treasure slot",
  summary: "A focused lens",
  sourceState: "Custom scenario item",
  iconId: 501
};

describe("Economy item reference field", () => {
  it("searches item identity, category, source, and details", () => {
    const options = economyItemReferenceOptions([item], project, null, {} as never);
    expect(filterReferencePickerOptions(options, "magic custom").map((option) => option.value)).toEqual([901]);
    expect(filterReferencePickerOptions(options, "treasure lens").map((option) => option.value)).toEqual([901]);
  });

  it("offers unresolved numeric IDs without duplicating decoded items", () => {
    const options = economyItemReferenceOptions([item], project, null, {} as never);
    expect(economyRawItemOption("7777", options)?.value).toBe(7777);
    expect(economyRawItemOption("901", options)).toBeNull();
    expect(economyRawItemOption("0", options)).toBeNull();
  });

  it("renders a compact shared picker instead of a number or native select", () => {
    const options = economyItemReferenceOptions([item], project, null, {} as never);
    const html = renderToStaticMarkup(createElement(EconomyItemReferenceField, {
      value: 901,
      option: item,
      options,
      ariaLabel: "Search treasure slot 0 item",
      panelTitle: "Treasure Slot 0 Item",
      storageKey: "economy.treasure.item.picker.position",
      project,
      previewContext: {} as never,
      onChange: vi.fn()
    }));
    expect(html).toContain('aria-label="Search treasure slot 0 item"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Beacon Lens (901)");
    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="number"');
  });

  it("supports domain-specific empty language", () => {
    const html = renderToStaticMarkup(createElement(EconomyItemReferenceField, {
      value: 0,
      options: economyItemReferenceOptions([item], project, null, {} as never),
      ariaLabel: "Search cursed form item",
      panelTitle: "Cursed Form Item",
      storageKey: "economy.item.cursed-form.picker.position",
      emptyLabel: "No cursed form",
      emptyDetail: "Realmz does not substitute another item when this item is cursed.",
      clearLabel: "Clear cursed form item",
      project,
      previewContext: {} as never,
      onChange: vi.fn()
    }));
    expect(html).toContain('aria-label="Search cursed form item"');
    expect(html).toContain("No cursed form");
    expect(html).toContain("Realmz does not substitute another item");
    expect(html).not.toContain("<select");
  });
});
