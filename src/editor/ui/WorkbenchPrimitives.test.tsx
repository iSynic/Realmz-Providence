import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PanelHeader } from "./WorkbenchPrimitives";

describe("Workbench primitives", () => {
  it("keeps pane copy, metadata, and actions in stable regions", () => {
    const markup = renderToStaticMarkup(
      <PanelHeader
        eyebrow="Collection"
        title="Item Pool"
        description="Next open slot 4"
        meta="199 items"
        actions={<button type="button">Clear</button>}
      />
    );

    expect(markup).toContain("workbench-pane-header-copy");
    expect(markup).toContain("workbench-pane-header-meta");
    expect(markup).toContain("workbench-pane-header-aside");
    expect(markup).toContain("199 items");
  });
});
