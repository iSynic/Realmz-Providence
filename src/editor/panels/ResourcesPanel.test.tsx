import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LibraryCatalog } from "../types";
import { AssetGalleryControls, ResourcesPanel } from "./ResourcesPanel";

describe("ResourcesPanel controls", () => {
  it("uses the shared search field without showing inert preview filters for scenario assets", () => {
    const markup = renderToStaticMarkup(
      <ResourcesPanel
        project={null}
        selectedEntity={null}
        activeEditor="project-assets"
        onSelectEntity={() => undefined}
      />
    );

    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-label="Search scenario assets"');
    expect(markup).toContain("0 scenario assets");
    expect(markup).not.toContain('aria-label="Resource preview filters"');
  });

  it("offers shared preview-status filters for reference assets", () => {
    const markup = renderToStaticMarkup(
      <ResourcesPanel
        project={null}
        catalog={{ assets: [] } as unknown as LibraryCatalog}
        selectedEntity={null}
        activeEditor="library-assets"
        onSelectEntity={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Search reference assets"');
    expect(markup).toContain('aria-label="Resource preview filters"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("presents preview size as a stable mode control", () => {
    const markup = renderToStaticMarkup(
      <AssetGalleryControls
        pageSize={100}
        previewSize="medium"
        onPageSizeChange={() => undefined}
        onPreviewSizeChange={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Asset preview size"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(">Medium<");
    expect(markup).toContain('aria-label="Assets per page"');
  });
});
