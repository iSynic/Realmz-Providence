import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReferenceField, numericReferenceQuery } from "./ReferenceField";

describe("ReferenceField", () => {
  it("renders the shared selected state and clear command without an idle result list", () => {
    const html = renderToStaticMarkup(
      <ReferenceField
        ariaLabel="Search items"
        placeholder="Search item # or name..."
        options={[{ key: "item:12", value: 12, label: "Dagger (12)", searchText: "12 dagger weapon" }]}
        value={12}
        current={{ label: "Dagger (12)", detail: "Weapon", state: "resolved" }}
        clearLabel="Clear item"
        emptyBody="Try another item."
        onChange={() => undefined}
      />
    );

    expect(html).toContain("workbench-reference-field");
    expect(html).toContain("Current Selection");
    expect(html).toContain('aria-label="Clear item"');
    expect(html).not.toContain("workbench-reference-results");
  });

  it("parses only complete signed integer queries", () => {
    expect(numericReferenceQuery(" -42 ")).toBe(-42);
    expect(numericReferenceQuery("42x")).toBeNull();
    expect(numericReferenceQuery("")).toBeNull();
  });
});
