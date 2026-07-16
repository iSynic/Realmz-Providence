import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PopoverPanel, popoverPanelGeometry, popoverPanelShouldDismiss } from "./PopoverPanel";

describe("PopoverPanel", () => {
  it("renders a labelled trigger and stable popover regions", () => {
    const markup = renderToStaticMarkup(
      <PopoverPanel
        open
        onOpenChange={() => undefined}
        ariaLabel="Tile filters"
        trigger={<span>Filters</span>}
        title="Tile Filters"
        meta="Walkable"
        actions={<button type="button">Close</button>}
      >
        <label><input type="checkbox" />Walkable</label>
      </PopoverPanel>
    );

    expect(markup).toContain('class="workbench-popover"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-label="Tile filters"');
    expect(markup).toContain('class="workbench-popover-header"');
    expect(markup).toContain('class="workbench-popover-actions"');
  });

  it("only dismisses an open popover for Escape", () => {
    expect(popoverPanelShouldDismiss("Escape", true)).toBe(true);
    expect(popoverPanelShouldDismiss("Escape", false)).toBe(false);
    expect(popoverPanelShouldDismiss("Enter", true)).toBe(false);
  });

  it("places and constrains the panel within the roomiest side of the viewport", () => {
    expect(popoverPanelGeometry(355, 385, 720)).toEqual({ placement: "above", maxHeight: 347 });
    expect(popoverPanelGeometry(40, 70, 720)).toEqual({ placement: "below", maxHeight: 590 });
  });
});
