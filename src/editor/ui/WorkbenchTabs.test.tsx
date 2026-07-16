import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchTabs, workbenchTabKeyboardTarget } from "./WorkbenchTabs";

describe("WorkbenchTabs", () => {
  it("exposes one selected tab and count metadata", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchTabs
        ariaLabel="Economy sections"
        value="items"
        options={[
          { value: "treasure", label: "Treasure", meta: 20 },
          { value: "items", label: "Items", meta: 199 }
        ]}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('aria-label="Economy sections"');
    expect(markup).toContain('aria-orientation="horizontal"');
    expect(markup).toContain('aria-selected="true" tabindex="0" class="is-selected"');
    expect(markup).toContain("Items");
    expect(markup).toContain("199");
  });

  it("supports arrow, Home, and End navigation while skipping disabled tabs", () => {
    const options = [
      { value: "simple", label: "Simple" },
      { value: "complex", label: "Complex", disabled: true },
      { value: "rogue", label: "Rogue" }
    ] as const;

    expect(workbenchTabKeyboardTarget(options, "simple", "ArrowRight")).toBe("rogue");
    expect(workbenchTabKeyboardTarget(options, "simple", "ArrowLeft")).toBe("rogue");
    expect(workbenchTabKeyboardTarget(options, "rogue", "Home")).toBe("simple");
    expect(workbenchTabKeyboardTarget(options, "simple", "End")).toBe("rogue");
    expect(workbenchTabKeyboardTarget(options, "simple", "Escape")).toBeNull();
  });

  it("supports vertical roving focus for rail-style tabs", () => {
    const options = [
      { value: "maps", label: "Maps" },
      { value: "scripts", label: "Scripts" },
      { value: "linter", label: "Linter" }
    ] as const;

    expect(workbenchTabKeyboardTarget(options, "maps", "ArrowDown", "vertical")).toBe("scripts");
    expect(workbenchTabKeyboardTarget(options, "maps", "ArrowUp", "vertical")).toBe("linter");
    expect(workbenchTabKeyboardTarget(options, "scripts", "ArrowRight", "vertical")).toBeNull();
  });
});
