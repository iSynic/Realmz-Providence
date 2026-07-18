import { describe, expect, it } from "vitest";
import type { LibraryAsset } from "../../types";
import { canCopyLibraryAssetToScenario, canReferenceLibraryAssetByStockId } from "../../resourceResolver";
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
    expect(canReferenceLibraryAssetByStockId(asset)).toBe(true);
  });

  it("explains that built-in custom media remains reusable until copied", () => {
    const asset = libraryAsset({
      type: "icon",
      source: "library-source:divinity:vault-of-arcana",
      relativePath: "Divinity Data\\Vault of Arcana.rsrc#cicn:30118",
      resourceType: "cicn",
      resourceId: 30118
    });
    expect(referenceAssetOwnershipGuidance(asset)).toContain("protected built-in Custom Library asset");
    expect(referenceAssetOwnershipGuidance(asset)).toContain("Copy it into Scenario Assets");
    expect(canCopyLibraryAssetToScenario(asset)).toBe(true);
    expect(canReferenceLibraryAssetByStockId(asset)).toBe(false);
  });

  it("treats the Custom Library as Providence-wide reusable storage", () => {
    expect(assetSectionHelp("custom")).toContain("protected built-in custom assets");
    expect(resourceScopeHelp("custom-library")).toContain("Providence-wide Custom Library");
  });
});
