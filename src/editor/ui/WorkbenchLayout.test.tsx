import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkbenchActionBar, WorkbenchCluster, WorkbenchStack } from "./WorkbenchLayout";

describe("Workbench layout primitives", () => {
  it("renders stable gap and alignment contracts", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchStack gap="loose">
        <WorkbenchCluster align="end" justify="between" nowrap>Controls</WorkbenchCluster>
      </WorkbenchStack>
    );
    expect(markup).toContain("workbench-stack gap-loose");
    expect(markup).toContain("align-end justify-between is-nowrap");
  });

  it("labels action bars as toolbars and keeps metadata separate", () => {
    const markup = renderToStaticMarkup(
      <WorkbenchActionBar ariaLabel="Collection controls" meta="42 of 199 shown">
        <button type="button">Show More</button>
      </WorkbenchActionBar>
    );
    expect(markup).toContain('role="toolbar"');
    expect(markup).toContain('aria-label="Collection controls"');
    expect(markup).toContain("workbench-action-bar-meta");
  });
});
