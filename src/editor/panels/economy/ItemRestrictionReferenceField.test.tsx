import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ItemRestrictionReferenceField,
  itemRestrictionRawOption,
  itemRestrictionReferenceOptions
} from "./ItemRestrictionReferenceField";

describe("ItemRestrictionReferenceField", () => {
  it("maps one-based item restriction values without changing the Rules record contract", () => {
    const races = itemRestrictionReferenceOptions("race");
    const castes = itemRestrictionReferenceOptions("caste");

    expect(races[0]).toMatchObject({ value: 0, label: "Any race" });
    expect(races[1]).toMatchObject({ value: 1, label: "1: Human" });
    expect(castes[1]).toMatchObject({ value: 1, label: "1: Fighter" });
  });

  it("renders shared compact pickers instead of long native selects", () => {
    const raceHtml = renderToStaticMarkup(createElement(ItemRestrictionReferenceField, {
      kind: "race",
      value: 1,
      onChange: vi.fn()
    }));
    const casteHtml = renderToStaticMarkup(createElement(ItemRestrictionReferenceField, {
      kind: "caste",
      value: 0,
      onChange: vi.fn()
    }));

    expect(raceHtml).toContain('aria-label="Search specific race restriction"');
    expect(raceHtml).toContain("1: Human");
    expect(casteHtml).toContain("Any caste");
    expect(raceHtml).not.toContain("<select");
    expect(casteHtml).not.toContain("<select");
  });

  it("keeps unusual imported values available as explicit raw restrictions", () => {
    const options = itemRestrictionReferenceOptions("race");
    expect(itemRestrictionRawOption("-3", "race", options)).toMatchObject({
      value: -3,
      label: "Race -3"
    });
    expect(itemRestrictionRawOption("1", "race", options)).toBeNull();

    const html = renderToStaticMarkup(createElement(ItemRestrictionReferenceField, {
      kind: "race",
      value: 88,
      onChange: vi.fn()
    }));
    expect(html).toContain("Race 88");
    expect(html).toContain("is-unresolved");
  });
});
