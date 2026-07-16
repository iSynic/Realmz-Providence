import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SearchField } from "./SearchField";

describe("SearchField", () => {
  it("renders an accessible search, result count, and clear command", () => {
    const markup = renderToStaticMarkup(
      <SearchField
        value="bell"
        onChange={() => undefined}
        label="Search strings"
        resultCount={2}
        resultNoun="match"
        resultNounPlural="matches"
      />
    );

    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-label="Search strings"');
    expect(markup).toContain("2 matches");
    expect(markup).toContain('aria-label="Clear search strings"');
  });

  it("keeps the clear command out of an empty field", () => {
    const markup = renderToStaticMarkup(
      <SearchField value="" onChange={() => undefined} ariaLabel="Search items" />
    );

    expect(markup).not.toContain("Clear search items");
  });

  it("supports an editable combobox inside a modal", () => {
    const markup = renderToStaticMarkup(
      <SearchField
        value="bell"
        onChange={() => undefined}
        ariaLabel="Search Providence"
        modalInitialFocus
        combobox={{
          controls: "global-results",
          expanded: true,
          activeDescendant: "global-result-1"
        }}
      />
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-autocomplete="list"');
    expect(markup).toContain('aria-controls="global-results"');
    expect(markup).toContain('aria-activedescendant="global-result-1"');
    expect(markup).toContain('data-modal-initial-focus="true"');
  });
});
