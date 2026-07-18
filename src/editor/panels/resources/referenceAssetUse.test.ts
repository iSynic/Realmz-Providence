import { describe, expect, it } from "vitest";
import type { LibraryAsset, LibraryCatalog } from "../../types";
import {
  findReferenceMonsterIconPair,
  referenceAssetCopyLabel,
  referenceAssetNeedsUseChoice,
  referenceIconUseDescription,
  referenceIconUseScenarioKind
} from "./referenceAssetUse";

function asset(resourceId: number, source = "library-source:divinity:Monster Mash"): LibraryAsset {
  return {
    id: `asset:${resourceId}`,
    type: "monster-mash-icon",
    label: `Icon ${resourceId}`,
    source,
    relativePath: `Monster Mash#cicn:${resourceId}`,
    bytes: 1,
    sha256: String(resourceId),
    resourceType: "cicn",
    resourceId,
    previewPath: null,
    mimeType: "image/cicn"
  };
}

function catalog(assets: LibraryAsset[]): LibraryCatalog {
  return {
    schemaVersion: 1,
    importedAt: "2026-07-17T00:00:00.000Z",
    managedPath: "browser://library",
    sources: [],
    records: [],
    entities: [],
    assets,
    diagnostics: [],
    summary: { sourceCount: 0, recordCount: 0, entityCount: 0, assetCount: assets.length, diagnosticCount: 0 }
  };
}

describe("reference asset use", () => {
  it("requires an intended use for cicn resources", () => {
    expect(referenceAssetNeedsUseChoice(asset(300))).toBe(true);
    expect(referenceAssetCopyLabel(asset(300))).toBe("Choose Use...");
  });

  it("resolves either facing of a Monster Mash pair", () => {
    const base = asset(300);
    const paired = asset(608);
    const library = catalog([base, paired]);
    expect(findReferenceMonsterIconPair(library, base)).toEqual({ base, paired });
    expect(findReferenceMonsterIconPair(library, paired)).toEqual({ base, paired });
  });

  it("does not treat a single item icon as a monster pair", () => {
    const vault = asset(30118, "library-source:divinity:Vault of Arcana");
    expect(findReferenceMonsterIconPair(catalog([vault]), vault)).toBeNull();
  });

  it.each([
    ["scenario-item-icon", "icon"],
    ["item-icon-library", null],
    ["scenario-monster-icon", null],
    ["special-land-tile", "special-land-tile"],
    ["scenario-icon", "icon"]
  ] as const)("routes %s to its expected storage workflow", (use, expectedKind) => {
    expect(referenceIconUseScenarioKind(use)).toBe(expectedKind);
  });

  it.each([
    "scenario-item-icon",
    "scenario-monster-icon",
    "special-land-tile",
    "scenario-icon"
  ] as const)("describes %s as scenario-owned", (use) => {
    expect(referenceIconUseDescription(use)).toContain("Scenario Assets");
  });

  it("keeps the reusable item icon choice outside the scenario", () => {
    expect(referenceIconUseDescription("item-icon-library")).toContain("without changing the current scenario");
  });
});
