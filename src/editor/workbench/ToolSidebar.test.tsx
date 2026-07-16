import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolSidebar } from "./ToolSidebar";

describe("ToolSidebar", () => {
  it("presents library tools as one vertically navigable current-page set", () => {
    const markup = renderToStaticMarkup(
      <ToolSidebar
        activeDomain="economy"
        activeEditor="items"
        activeWorkbench="library"
        project={null}
        catalog={null}
        onSelectEditor={() => undefined}
      />
    );

    expect(markup).toContain('role="navigation" aria-label="Economy tools"');
    expect(markup).toMatch(/aria-current="page" tabindex="0"[^>]*><span class="tool-sidebar-glyph">I/);
    expect(markup.match(/<button[^>]*tabindex="0"/g)).toHaveLength(1);
    expect(markup).not.toMatch(/class="tutorial-tip[^>]*tabindex/);
  });
});
