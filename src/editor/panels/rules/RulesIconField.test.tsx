import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { LibraryAsset } from "../../types";
import {
  RulesIconField,
  rulesIconRawOption,
  rulesIconReferenceOptions,
  rulesIconReferences,
  rulesIconValueForQuery
} from "./RulesIconField";

const PORTRAIT_251: LibraryAsset = {
  id: "portrait-251",
  type: "icon",
  label: "Human Portrait 1",
  source: "Realmz",
  relativePath: "Portraits.rsrc/cicn_251.png",
  bytes: 32,
  sha256: "portrait-251",
  resourceType: "cicn",
  resourceId: 251,
  previewPath: "data:image/png;base64,iVBORw0KGgo="
};

const PORTRAIT_257: LibraryAsset = {
  ...PORTRAIT_251,
  id: "portrait-257",
  label: "Elf Portrait 1",
  resourceId: 257,
  sha256: "portrait-257"
};

describe("Rules icon field", () => {
  it("builds portrait-set references only from each six-icon set boundary", () => {
    const references = rulesIconReferences([
      PORTRAIT_251,
      { ...PORTRAIT_251, id: "portrait-252", resourceId: 252 },
      PORTRAIT_257,
      { ...PORTRAIT_257, id: "non-portrait", relativePath: "Tacticals.rsrc/cicn_257.png" }
    ], "portrait-set");
    const options = rulesIconReferenceOptions(references, "portrait-set");

    expect(references.map((reference) => [reference.value, reference.resourceId])).toEqual([[0, 251], [1, 257]]);
    expect(options[1]).toMatchObject({ value: 1, label: "Portrait Set 1" });
    expect(options[1].detail).toContain("first cicn 257");
  });

  it("deduplicates direct portrait IDs and omits non-portrait cicn resources", () => {
    const references = rulesIconReferences([
      { ...PORTRAIT_251, id: "tactical", label: "Tactical Icon", relativePath: "Tacticals.rsrc/cicn_251.png" },
      PORTRAIT_251,
      { ...PORTRAIT_257, id: "tactical-999", relativePath: "Tacticals.rsrc/cicn_999.png", resourceId: 999 }
    ], "direct");

    expect(references).toHaveLength(1);
    expect(references[0]?.asset.id).toBe("portrait-251");
  });

  it("accepts stored portrait-set values or first cicn IDs in numeric searches", () => {
    expect(rulesIconValueForQuery("4", "portrait-set")).toBe(4);
    expect(rulesIconValueForQuery("275", "portrait-set")).toBe(4);
    expect(rulesIconValueForQuery("275", "direct")).toBe(275);
    expect(rulesIconValueForQuery("Human", "portrait-set")).toBeNull();
  });

  it("offers unresolved raw values without duplicating known icons", () => {
    const options = rulesIconReferenceOptions(rulesIconReferences([PORTRAIT_251], "direct"), "direct");

    expect(rulesIconRawOption("251", "direct", options)).toBeNull();
    expect(rulesIconRawOption("999", "direct", options)).toMatchObject({ value: 999, label: "Icon 999" });
  });

  it("renders the shared compact picker and selected image preview", () => {
    const html = renderToStaticMarkup(
      <RulesIconField
        label="Default Icon"
        value={251}
        assets={[PORTRAIT_251]}
        mode="direct"
        onCommit={vi.fn()}
      />
    );

    expect(html).toContain("workbench-reference-compact-trigger");
    expect(html).toContain('aria-label="Search default icon"');
    expect(html).toContain("rules-icon-reference-thumbnail is-resolved");
    expect(html).toContain("Human Portrait 1");
  });
});
