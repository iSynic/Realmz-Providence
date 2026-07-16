import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { globalSearchKeyboardAction, globalSearchOptionId, globalSearchStatus } from "./globalSearchDialogModel";

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
    expect(markup).toContain('role="group" aria-label="Search scopes"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('data-modal-initial-focus="true"');
    expect(markup).toContain('aria-live="polite">Type to search');
    expect(markup).toContain("Scenario");
    expect(markup).toContain("Diagnostics");
  });

  it("creates stable option IDs for punctuation-heavy result identifiers", () => {
    expect(globalSearchOptionId("scenario:string:STR# 5000/1"))
      .toBe("global-search-option-scenario%3Astring%3ASTR%23%205000%2F1");
  });

  it("reports pending and settled result states", () => {
    expect(globalSearchStatus("bell", 0, true)).toBe("Searching...");
    expect(globalSearchStatus("", 0, false)).toBe("Type to search");
    expect(globalSearchStatus("bell", 1, false)).toBe("1 match");
    expect(globalSearchStatus("bell", 24, false)).toBe("24 matches");
  });

  it("keeps result navigation within the combobox keyboard contract", () => {
    expect(globalSearchKeyboardAction(0, 3, "ArrowDown")).toEqual({ kind: "move", index: 1 });
    expect(globalSearchKeyboardAction(2, 3, "ArrowDown")).toEqual({ kind: "move", index: 2 });
    expect(globalSearchKeyboardAction(1, 3, "Home")).toEqual({ kind: "move", index: 0 });
    expect(globalSearchKeyboardAction(1, 3, "End")).toEqual({ kind: "move", index: 2 });
    expect(globalSearchKeyboardAction(1, 3, "Enter")).toEqual({ kind: "open", index: 1 });
    expect(globalSearchKeyboardAction(0, 0, "Enter")).toBeNull();
    expect(globalSearchKeyboardAction(0, 3, " ")).toBeNull();
  });
});
