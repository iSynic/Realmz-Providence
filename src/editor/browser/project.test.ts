import { describe, expect, it } from "vitest";
import {
  buildBrowserSemanticSchemaForProject,
  createBrowserProject,
  registerBrowserSourceSnapshot,
  validateBrowserProject
} from "./project";
import { expectedAuthoredScenarioManifestFiles } from "./scenarioPackage";
import { parseScenarioBuffers } from "./realmzParser";

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

    expect(semanticSchema.entities.find((entity) => entity.id === "treasure:0")).toMatchObject({
      editState: "inspect-only",
      confidence: "source-backed",
      editable: false,
      summary: { gold: 77 }
    });
    expect(semanticSchema.sources.some((source) => source.name === "Data TD")).toBe(true);
  });

  it("indexes canonical supporting records without exposing sparse compiler slots", async () => {
    const project = createBrowserProject("Canonical Supporting Records");
    const parsed = parseScenarioBuffers(new Map([
      ["Data NI", new Uint8Array(100)],
      ["Data TD", new Uint8Array(48)],
      ["Data TD2", new Uint8Array(118)],
      ["Data TD3", new Uint8Array(40)]
    ]));
    project.scenarioItems = [{
      ...parsed.scenarioItems[0],
      id: 4,
      itemId: 901,
      iconId: 321,
      cost: 45,
      authored: false,
      rawBytes: new Array(100).fill(0xa5)
    }];
    project.treasures = [{
      ...parsed.treasures[0],
      id: 3,
      itemIds: [901],
      gold: 77,
      authored: false,
      rawBytes: new Array(48).fill(0xa5)
    }];
    project.thiefEncounters = [{
      ...parsed.thiefEncounters[0],
      id: 2,
      typeFlags: [true, ...parsed.thiefEncounters[0].typeFlags.slice(1)],
      prompts: [17, 0, 0],
      authored: false,
      rawBytes: new Array(118).fill(0xa5)
    }];
    project.timedEncounters = [{
      ...parsed.timedEncounters[0],
      id: 3,
      day: 5,
      requiredItem: 901,
      requiredQuest: 6,
      locationKind: "land",
      stuff: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      authored: false,
      rawBytes: new Array(40).fill(0xa5)
    }];

    const { semanticSchema } = await buildBrowserSemanticSchemaForProject(project);

    for (const entityId of ["item:901", "treasure:3", "thief:2", "time:3"]) {
      const entity = semanticSchema.entities.find((candidate) => candidate.id === entityId);
      expect(entity).toMatchObject({
        editState: "editable",
        confidence: "confirmed",
        editable: true,
        summary: { canonical: true }
      });
      expect(semanticSchema.records.find((record) => record.id === entity?.recordRef)).toMatchObject({
        editState: "editable",
        confidence: "confirmed",
        summary: { canonical: true }
      });
    }
    for (const entityId of ["item:800", "treasure:0", "thief:0", "time:0"]) {
      expect(semanticSchema.entities.some((entity) => entity.id === entityId)).toBe(false);
    }
    expect(semanticSchema.entities.find((entity) => entity.id === "treasure:3")?.summary.gold).toBe(77);
    for (const [name, path] of [
      ["Data NI", "project.json#scenarioItems"],
      ["Data TD", "project.json#treasures"],
      ["Data TD2", "project.json#thiefEncounters"],
      ["Data TD3", "project.json#timedEncounters"]
    ]) {
      expect(semanticSchema.sources.find((source) => source.name === name)).toMatchObject({
        path,
        origin: "authored-source",
        confidence: "confirmed"
      });
    }
  });
});
