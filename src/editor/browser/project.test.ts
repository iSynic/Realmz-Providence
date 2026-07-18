import { describe, expect, it } from "vitest";
import {
  buildBrowserSemanticSchemaForProject,
  createBrowserProject,
  registerBrowserSourceSnapshot,
  validateBrowserProject
} from "./project";
import { expectedAuthoredScenarioManifestFiles } from "./scenarioPackage";

describe("browser project native manifest validation", () => {
  it("uses the authored compiler manifest instead of source inventory", () => {
    const project = createBrowserProject("Authored Validation");
    project.source.origin = "authored";
    project.source.files.push({
      name: "ANNEX POISON",
      relativePath: "ANNEX POISON",
      bytes: 1,
      sha256: "fixture",
      role: "pass-through",
      editable: false
    });

    const validation = validateBrowserProject(project);
    const expected = expectedAuthoredScenarioManifestFiles(project, "windows-realmz-folder");

    expect(validation.exportableFiles).toEqual(expected);
    expect(validation.passThroughFiles).toEqual([]);
    expect(validation.exportableFiles).toContain("Scenario");
    expect(validation.exportableFiles).toContain("Scenario.rsrc");
    expect(validation.exportableFiles).toContain("Data Solids");
    expect(validation.exportableFiles).not.toContain("ANNEX POISON");
    expect(validation.warnings).not.toContain("Data Solids is missing; special negative tile solidity will remain unknown.");
  });

  it("keeps imported compatibility validation source-driven", () => {
    const project = createBrowserProject("Imported Validation");
    project.source.origin = "imported";
    project.source.files = [
      {
        name: "Data SD2",
        relativePath: "Data SD2",
        bytes: 800,
        sha256: "fixture",
        role: "supported-binary",
        editable: true
      },
      {
        name: "Legacy Notes",
        relativePath: "Legacy Notes",
        bytes: 10,
        sha256: "fixture",
        role: "pass-through",
        editable: false
      }
    ];

    const validation = validateBrowserProject(project);

    expect(validation.exportableFiles).toEqual(["Data SD2"]);
    expect(validation.passThroughFiles).toEqual(["Legacy Notes"]);
    expect(validation.exportableFiles).not.toContain("Scenario.rsrc");
  });

  it("ignores authored raw snapshots while indexing canonical maps and managed resources", async () => {
    const project = createBrowserProject("Authored Semantic Boundary");
    project.assets.push({
      id: "managed:TEXT:-200:authored",
      label: "Authored Scrolling Text",
      kind: "text",
      resourceType: "TEXT",
      resourceId: -200,
      fileName: "scrolling-text--200.txt",
      originalPath: "",
      previewPath: "",
      resourcePath: "data:text/plain;base64,Y2Fub25pY2FsIHRleHQ=",
      mimeType: "text/plain",
      bytes: 14,
      sha256: "canonical",
      width: null,
      height: null,
      durationMs: null,
      sampleRate: null,
      channels: null,
      exportState: "ready",
      libraryScope: "scenario",
      provenance: "authored test",
      linkedEntity: "resource:TEXT:-200"
    });
    const poisonTreasure = new Uint8Array(48);
    poisonTreasure[1] = 42;
    poisonTreasure[43] = 99;
    registerBrowserSourceSnapshot(project, {
      capturedAt: "2026-07-18T00:00:00.000Z",
      rootName: "ANNEX POISON",
      totalBytes: poisonTreasure.byteLength,
      files: [{
        name: "Data TD",
        relativePath: "Data TD",
        bytes: poisonTreasure.byteLength,
        sha256: "poison",
        role: "supported-binary",
        editable: true,
        bytesData: poisonTreasure
      }]
    });

    const { semanticSchema } = await buildBrowserSemanticSchemaForProject(project);

    expect(semanticSchema.entities.some((entity) => entity.id === "map:land:0")).toBe(true);
    expect(semanticSchema.entities.find((entity) => entity.id === "resource:TEXT:-200")).toMatchObject({
      editable: true,
      summary: { managed: true, managedAssetId: "managed:TEXT:-200:authored" }
    });
    expect(semanticSchema.entities.some((entity) => entity.id === "treasure:0")).toBe(false);
    expect(semanticSchema.sources.some((source) => source.name === "Data TD")).toBe(false);
  });

  it("retains raw-buffer semantic enrichment for imported projects", async () => {
    const project = createBrowserProject("Imported Semantic Boundary");
    project.source.origin = "imported";
    const importedTreasure = new Uint8Array(48);
    importedTreasure[1] = 42;
    importedTreasure[43] = 77;
    project.source.files = [{
      name: "Data TD",
      relativePath: "Data TD",
      bytes: importedTreasure.byteLength,
      sha256: "imported",
      role: "supported-binary",
      editable: true
    }];
    registerBrowserSourceSnapshot(project, {
      capturedAt: "2026-07-18T00:00:00.000Z",
      rootName: "Imported Semantic Boundary",
      totalBytes: importedTreasure.byteLength,
      files: [{ ...project.source.files[0], bytesData: importedTreasure }]
    });

    const { semanticSchema } = await buildBrowserSemanticSchemaForProject(project);

    expect(semanticSchema.entities.find((entity) => entity.id === "treasure:0")?.summary.gold).toBe(77);
    expect(semanticSchema.sources.some((source) => source.name === "Data TD")).toBe(true);
  });
});
