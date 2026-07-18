import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LibraryAsset, LibraryCatalog, Project } from "../types";
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

  it("offers shared preview-status filters for the Realmz Gallery", () => {
    const markup = renderToStaticMarkup(
      <ResourcesPanel
        project={null}
        catalog={{ assets: [] } as unknown as LibraryCatalog}
        selectedEntity={null}
        activeEditor="library-assets"
        onSelectEntity={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Search Realmz Gallery"');
    expect(markup).toContain('aria-label="Resource preview filters"');
    expect(markup).toContain('aria-pressed="true"');
  });

  it("shows distributed custom icons as protected Custom Library assets", () => {
    const builtInCustomAsset: LibraryAsset = {
      id: "library-asset:divinity:monster-mash:398",
      type: "icon",
      label: "Monster Mash Icon 398",
      source: "library-source:divinity:monster-mash",
      relativePath: "Divinity Data\\Monster Mash.rsrc#cicn:398",
      bytes: 128,
      sha256: "0".repeat(64),
      resourceType: "cicn",
      resourceId: 398
    };
    const project = {
      assets: [],
      assetCatalog: { pictures: [], icons: [], sounds: [], tilesets: [] }
    } as unknown as Project;
    const markup = renderToStaticMarkup(
      <ResourcesPanel
        project={project}
        catalog={{ assets: [builtInCustomAsset] } as unknown as LibraryCatalog}
        selectedEntity={null}
        activeEditor="custom-library-assets"
        onSelectEntity={() => undefined}
        onCopyReferenceAssetToScenario={async () => ({ kind: "icon", label: "Monster Mash Icon 398", resourceId: 30126 })}
      />
    );

    expect(markup).toContain("Monster Mash Icon 398");
    expect(markup).toContain("Built-in");
    expect(markup).toContain("Choose Use");
    expect(markup).not.toContain("Delete Custom Asset");
  });

  it("shows both resources from a scenario monster icon override in Scenario Assets", () => {
    const project = {
      assets: [],
      assetCatalog: { pictures: [], icons: [], sounds: [], tilesets: [] },
      monsterIconOverrides: [{
        targetBaseIconId: 380,
        sourceBaseIconId: 380,
        sourceKind: "monster-mash",
        sourceLabel: "Drowned Wight",
        sourceBaseResourceBase64: "AA==",
        sourcePairedResourceBase64: "AQ=="
      }]
    } as unknown as Project;
    const markup = renderToStaticMarkup(
      <ResourcesPanel
        project={project}
        selectedEntity={null}
        activeEditor="project-assets"
        onSelectEntity={() => undefined}
        onApplyCommand={() => undefined}
      />
    );

    expect(markup).toContain("2 scenario assets");
    expect(markup).toContain("Drowned Wight - Base");
    expect(markup).toContain("Drowned Wight - Alternate");
    expect(markup).toContain("cicn 380");
    expect(markup).toContain("cicn 688");
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
