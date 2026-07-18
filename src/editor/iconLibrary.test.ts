import { describe, expect, it } from "vitest";
import type { LibraryCatalog } from "./types";
import { createIconLibraryEntry, deleteIconLibraryEntry, iconLibraryEntryKind } from "./iconLibrary";

function emptyCatalog(): LibraryCatalog {
  return {
    schemaVersion: 1,
    importedAt: "2026-07-17T00:00:00.000Z",
    managedPath: "browser://library",
    sources: [],
    records: [],
    entities: [],
    assets: [],
    diagnostics: [],
    summary: { sourceCount: 0, recordCount: 0, entityCount: 0, assetCount: 0, diagnosticCount: 0 }
  };
}

describe("Providence Icon Library", () => {
  it("stores a reusable item icon outside Scenario Assets and supports deleting it", () => {
    const created = createIconLibraryEntry(emptyCatalog(), "browser://library", {
      kind: "item-icon",
      label: "Beacon Lens",
      origin: { kind: "vault-of-arcana", sourceId: "vault:30118", sourceLabel: "Vault Icon 30118" },
      resources: [{
        role: "item",
        resourceType: "cicn",
        resourceId: 30118,
        label: "Vault Icon 30118",
        resourceBase64: "AA=="
      }]
    });

    expect(created.entity).not.toBeNull();
    expect(created.entity && iconLibraryEntryKind(created.entity)).toBe("item-icon");
    expect(created.entity?.label).toBe("Beacon Lens");
    expect(created.catalog.assets).toHaveLength(1);
    expect(created.catalog.assets[0]).toMatchObject({
      label: "Vault Icon 30118",
      resourceType: "cicn",
      resourceId: 30118,
      source: "library-source:providence:icon-library"
    });

    const deleted = deleteIconLibraryEntry(created.catalog, created.entity!.id);
    expect(deleted.entities).toHaveLength(0);
    expect(deleted.assets).toHaveLength(0);
  });
});
