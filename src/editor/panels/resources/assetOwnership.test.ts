import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../types";
import { canCopyLibraryAssetToScenario } from "../../resourceResolver";
import { assetSectionHelp, referenceAssetOwnershipGuidance, resourceScopeHelp } from "./assetOwnership";

function libraryAsset(overrides: Partial<LibraryAsset> = {}): LibraryAsset {
  return {
    id: "asset:test",
    type: "picture",
    label: "Test Picture",
    source: "Realmz Data",
    relativePath: "Realmz Data/PICT 100",
    bytes: 128,
    sha256: "0".repeat(64),
    resourceType: "PICT",
    resourceId: 100,
    ...overrides
  };
}

describe("asset ownership guidance", () => {
  it("explains that Realmz stock should be referenced instead of copied", () => {
    const asset = libraryAsset();
    expect(referenceAssetOwnershipGuidance(asset)).toContain("Use its existing stock ID");
    expect(referenceAssetOwnershipGuidance(asset)).toContain("PICT 100");
    expect(canCopyLibraryAssetToScenario(asset)).toBe(false);
  });

  it("explains that non-stock Divinity media receives a scenario-owned ID", () => {
    const asset = libraryAsset({ source: "Divinity Import", relativePath: "Divinity/PICT 100" });
    expect(referenceAssetOwnershipGuidance(asset)).toContain("scenario-owned asset");
    expect(referenceAssetOwnershipGuidance(asset)).toContain("valid scenario resource ID");
    expect(canCopyLibraryAssetToScenario(asset)).toBe(true);
  });

  it("treats the Custom Library as Providence-wide reusable storage", () => {
    expect(assetSectionHelp("custom")).toContain("every scenario");
    expect(resourceScopeHelp("custom-library")).toContain("Providence-wide Custom Library");
  });
});
