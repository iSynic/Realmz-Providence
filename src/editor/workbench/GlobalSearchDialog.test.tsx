import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlobalSearchDialog, globalSearchOptionId } from "./GlobalSearchDialog";

describe("GlobalSearchDialog", () => {
  it("exposes a navigation combobox and pressed search scopes", () => {
    const markup = renderToStaticMarkup(
      <GlobalSearchDialog
        project={null}
        catalog={null}
        onClose={() => undefined}
        onOpenResult={() => undefined}
      />
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-controls="global-search-results"');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Scenario");
    expect(markup).toContain("Diagnostics");
  });

  it("creates stable option IDs for punctuation-heavy result identifiers", () => {
    expect(globalSearchOptionId("scenario:string:STR# 5000/1"))
      .toBe("global-search-option-scenario%3Astring%3ASTR%23%205000%2F1");
  });
});
