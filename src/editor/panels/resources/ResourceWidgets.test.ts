import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../types";
import { defaultResourcePreviewScale, libraryAssetMatchesSection } from "./ResourceWidgets";

function referenceAsset(resourceType: string, resourceId: number): LibraryAsset {
  return {
    id: `asset:${resourceType}:${resourceId}`,
    type: resourceType === "PICT" ? "picture" : "icon",
    label: `${resourceType} ${resourceId}`,
    source: "Realmz Data",
    relativePath: `Realmz Data/${resourceType} ${resourceId}`,
    bytes: 128,
    sha256: "0".repeat(64),
    resourceType,
    resourceId
  };
}

describe("libraryAssetMatchesSection", () => {
  it.each([-302, 302])("hides PICT %i from author-facing Reference Assets", (resourceId) => {
    expect(libraryAssetMatchesSection(referenceAsset("PICT", resourceId), "realmz")).toBe(false);
  });

  it("keeps non-PICT Realmz assets in Reference Assets", () => {
    expect(libraryAssetMatchesSection(referenceAsset("cicn", 302), "realmz")).toBe(true);
  });
});

describe("defaultResourcePreviewScale", () => {
  it("uses native 1x scale when both image dimensions fit", () => {
    expect(defaultResourcePreviewScale(32, 32, 360, 216)).toBe(1);
    expect(defaultResourcePreviewScale(360, 216, 360, 216)).toBe(1);
  });

  it("uses fit when either image dimension exceeds the viewport", () => {
    expect(defaultResourcePreviewScale(361, 32, 360, 216)).toBe("fit");
    expect(defaultResourcePreviewScale(32, 217, 360, 216)).toBe("fit");
  });

  it("uses fit until the viewport has measurable dimensions", () => {
    expect(defaultResourcePreviewScale(32, 32, 0, 216)).toBe("fit");
  });
});
