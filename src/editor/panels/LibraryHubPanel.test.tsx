import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LibraryCatalog } from "../types";
import { LibraryHubPanel, libraryDiagnosticTone } from "./LibraryHubPanel";

function catalogWithOverflow(): LibraryCatalog {
  const sources = Array.from({ length: 81 }, (_, index) => ({
    id: `source-${index}`,
    name: `Source ${index}`,
    relativePath: `Source ${index}.rsrc`,
    originalPath: `C:/fixtures/Source ${index}.rsrc`,
    sourceKind: "realmz-reference" as const,
    role: "library-file",
    bytes: 1000 + index,
    sha256: `${index}`.padStart(64, "0"),
    copiedTo: `managed/Source ${index}.rsrc`,
    confidence: "verified"
  }));
  const diagnostics = Array.from({ length: 7 }, (_, index) => ({
    id: `diagnostic-${index}`,
    type: "library-source",
    severity: index === 0 ? "error" : "warning",
    message: `Diagnostic ${index}`,
    source: `Source ${index}.rsrc`,
    data: {}
  }));
  return {
    schemaVersion: 1,
    importedAt: "2026-07-16T00:00:00.000Z",
    managedPath: "F:/fixtures/library",
    sources,
    records: [],
    entities: [],
    assets: [],
    diagnostics,
    summary: {
      sourceCount: sources.length,
      recordCount: 0,
      entityCount: 0,
      assetCount: 0,
      diagnosticCount: diagnostics.length
    }
  };
}

describe("LibraryHubPanel", () => {
  it("uses explicit incremental disclosure instead of silently truncating catalog lists", () => {
    const markup = renderToStaticMarkup(<LibraryHubPanel workspace={null} catalog={catalogWithOverflow()} />);

    expect(markup).toContain('aria-label="Search managed catalog sources"');
    expect(markup).toContain("81 sources");
    expect(markup).toContain("Source 79.rsrc");
    expect(markup).not.toContain("Source 80.rsrc");
    expect(markup).toContain("80 of 81 sources shown");
    expect(markup).toContain("Show 1 More");
    expect(markup).toContain("6 of 7 diagnostics shown");
  });

  it("normalizes library diagnostic severities to shared tones", () => {
    expect(libraryDiagnosticTone("fatal")).toBe("danger");
    expect(libraryDiagnosticTone("warn")).toBe("warning");
    expect(libraryDiagnosticTone("success")).toBe("success");
    expect(libraryDiagnosticTone("note")).toBe("info");
  });
});
