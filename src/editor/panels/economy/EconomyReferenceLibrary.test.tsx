import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LibraryCatalog, LibraryEntity } from "../../types";
import { economyDomainMode } from "./EconomyDomainContent";
import { EconomyReferenceLibrary, filterEconomyReferenceEntries } from "./EconomyReferenceLibrary";
import { economySectionFromEditor } from "./EconomySectionSwitcher";

function referenceEntity(type: "bag-item" | "vault-icon", index: number): LibraryEntity {
  return {
    id: `${type}:${index}`,
    type,
    label: `${type === "bag-item" ? "Bag Item" : "Vault Icon"} ${index}`,
    source: `${type}-source`,
    recordRef: `${type}-record:${index}`,
    editState: "inspect-only",
    confidence: "source-backed",
    summary: { type: "cicn", resourceId: index, bytes: 512 + index, family: "color-icon" }
  };
}

function catalogWithOverflow(): LibraryCatalog {
  const entities = [
    ...Array.from({ length: 121 }, (_, index) => referenceEntity("bag-item", index)),
    referenceEntity("vault-icon", 400)
  ];
  return {
    schemaVersion: 1,
    importedAt: "2026-07-16T00:00:00.000Z",
    managedPath: "F:/fixtures/library",
    sources: [],
    records: [],
    entities,
    assets: [],
    diagnostics: [],
    summary: {
      sourceCount: 0,
      recordCount: 0,
      entityCount: entities.length,
      assetCount: 0,
      diagnosticCount: 0
    }
  };
}

describe("EconomyReferenceLibrary", () => {
  it("keeps protected library routes out of the project Economy sections", () => {
    expect(economySectionFromEditor("bag")).toBeNull();
    expect(economySectionFromEditor("vault")).toBeNull();
    expect(economyDomainMode("project", "economy", "bag")).toBe("project");
    expect(economyDomainMode("library", "economy", "bag")).toBe("bag");
    expect(economyDomainMode("library", "economy", "vault")).toBe("vault");
    expect(economyDomainMode("library", "economy", "items")).toBeNull();
  });

  it("filters one protected library without mixing the other library into results", () => {
    const catalog = catalogWithOverflow();
    expect(filterEconomyReferenceEntries(catalog.entities, "bag-item", 'resourceId":12,').map((entry) => entry.id)).toEqual([
      "bag-item:12"
    ]);
    expect(filterEconomyReferenceEntries(catalog.entities, "vault-icon", "400").map((entry) => entry.id)).toEqual([
      "vault-icon:400"
    ]);
  });

  it("uses shared searchable rows and explicit incremental disclosure", () => {
    const markup = renderToStaticMarkup(
      <EconomyReferenceLibrary
        kind="bag"
        catalog={catalogWithOverflow()}
        selectedEntity={null}
        onSelectEntity={() => undefined}
      />
    );

    expect(markup).toContain('aria-label="Search Bag of Holding"');
    expect(markup).toContain("Bag Item 119");
    expect(markup).not.toContain("Bag Item 120");
    expect(markup).toContain("120 of 121 bag entries shown");
    expect(markup).toContain("Show 1 More");
    expect(markup).not.toContain("Vault Icon 400");
  });
});
