import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IncrementalListFooter } from "./IncrementalListFooter";

describe("IncrementalListFooter", () => {
  it("reports complete collection coverage and the next reveal count", () => {
    const html = renderToStaticMarkup(
      <IncrementalListFooter
        visibleCount={42}
        totalCount={100}
        step={42}
        noun="item"
        onShowMore={() => undefined}
      />
    );

    expect(html).toContain("42 of 100 items shown");
    expect(html).toContain("Show 42 More");
  });

  it("does not render after the complete collection is visible", () => {
    const html = renderToStaticMarkup(
      <IncrementalListFooter
        visibleCount={20}
        totalCount={20}
        noun="slot"
        onShowMore={() => undefined}
      />
    );

    expect(html).toBe("");
  });
});
