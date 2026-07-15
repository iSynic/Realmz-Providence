import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ItemReferenceOption } from "../../itemReferences";
import type { LibraryCatalog, Project } from "../../types";
import { filterReferencePickerOptions } from "../../ui";
import {
  ItemIconField,
  itemIconRawOption,
  itemIconReferenceOptions,
  itemIconReferences
} from "./ItemIconField";

const project = {
  assets: [{
    kind: "icon",
    resourceType: "cicn",
    resourceId: 501,
    label: "Project Beacon"
  }],
  assetCatalog: {
    icons: [{ resourceId: 502, name: "Scenario Compass", source: "Scenario resources" }]
  }
} as Project;

const catalog = {
  assets: [{
    type: "icon",
    resourceType: "cicn",
    resourceId: 501,
    label: "Library Beacon",
    source: "Providence Icon Library"
  }]
} as LibraryCatalog;

const itemOptions: ItemReferenceOption[] = [{
  key: "item:901",
  value: 901,
  label: "Beacon Lens (901)",
  category: "magic",
  detail: "Scenario item",
  summary: "A focused lens.",
  sourceState: "scenario",
  iconId: 501
}];

describe("Economy item icon field", () => {
  it("merges item, project, and library aliases without duplicating cicn IDs", () => {
    const references = itemIconReferences(project, catalog, itemOptions);
    expect(references.map((reference) => reference.id)).toEqual([501, 502]);
    expect(references[0]?.detail).toContain("item 901");
    expect(references[0]?.detail).toContain("project icon");
    expect(references[0]?.detail).toContain("Providence Icon Library");
    expect(references[0]?.searchText).toContain("Project Beacon");
    expect(references[0]?.searchText).toContain("Library Beacon");
  });

  it("uses shared term matching and preserves arbitrary numeric icon IDs", () => {
    const references = itemIconReferences(project, catalog, itemOptions);
    const options = itemIconReferenceOptions(references, project, catalog, {} as never);
    expect(filterReferencePickerOptions(options, "project beacon").map((option) => option.value)).toEqual([501]);
    expect(itemIconRawOption("-777", options, project, catalog, {} as never)?.value).toBe(-777);
    expect(itemIconRawOption("501", options, project, catalog, {} as never)).toBeNull();
  });

  it("renders the compact shared reference trigger instead of a bespoke number input", () => {
    const html = renderToStaticMarkup(createElement(ItemIconField, {
      value: 501,
      project,
      catalog,
      previewContext: {} as never,
      itemOptions,
      onChange: vi.fn()
    }));
    expect(html).toContain('aria-label="Search item icon"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("cicn 501: Beacon Lens");
    expect(html).not.toContain('type="number"');
    expect(html).not.toContain("item-icon-picker-backdrop");
  });
});
