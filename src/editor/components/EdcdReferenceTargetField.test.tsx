import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EdcdReferenceTargetField, numericReferenceQuery } from "./EdcdReferenceTargetField";

describe("EdcdReferenceTargetField", () => {
  it("uses the shared reference picker without opening the full list until searched", () => {
    const html = renderToStaticMarkup(
      <EdcdReferenceTargetField
        ariaLabel="Search item"
        placeholder="Search item # or name..."
        options={[{ key: "item:1", value: 1, label: "Dagger (1)", searchText: "1 dagger weapon" }]}
        value={1}
        current={{ label: "Dagger (1)", state: "resolved" }}
        emptyBody="Try another item."
        openLabel="Open Dagger"
        clearLabel="Clear item"
        onChange={() => undefined}
      />
    );

    expect(html).toContain("workbench-reference-picker");
    expect(html).toContain("Current Selection");
    expect(html).not.toContain("workbench-reference-results");
  });

  it("parses only complete signed integer queries", () => {
    expect(numericReferenceQuery(" -42 ")).toBe(-42);
    expect(numericReferenceQuery("42x")).toBeNull();
    expect(numericReferenceQuery("")).toBeNull();
  });
});
