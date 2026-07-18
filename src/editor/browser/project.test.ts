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
    const importedMessage = new Uint8Array(256);
    importedMessage[0] = 8;
    importedMessage.set(new TextEncoder().encode("Imported"), 1);
    const importedOptionLabel = new Uint8Array(25);
    importedOptionLabel[0] = 15;
    importedOptionLabel.set(new TextEncoder().encode("Imported option"), 1);
    const importedMonsterDescription = new Uint8Array(256);
    importedMonsterDescription[0] = 16;
    importedMonsterDescription.set(new TextEncoder().encode("Imported monster"), 1);
    const importedShop = new Uint8Array(3002);
    importedShop.set([0x03, 0x85], 0);
    importedShop[2000] = 3;
    importedShop.set([0x00, 0x78], 3000);
    const importedSimpleEncounter = new Uint8Array(426);
    importedSimpleEncounter[100] = 1;
    importedSimpleEncounter.set([0x00, 0x0c], 104);
    const importedComplexEncounter = new Uint8Array(520);
    importedComplexEncounter[152] = 1;
    importedComplexEncounter[155] = 2;
    importedComplexEncounter.set([0x00, 0x12], 158);
    const importedBuffers = new Map([
      ["Data TD", importedTreasure],
      ["Data SD2", importedMessage],
      ["Data OD", importedOptionLabel],
      ["Data DES", importedMonsterDescription],
      ["Data SD", importedShop],
      ["Data ED", importedSimpleEncounter],
      ["Data ED2", importedComplexEncounter]
    ]);
    project.source.files = Array.from(importedBuffers, ([name, bytes]) => ({
      name,
      relativePath: name,
      bytes: bytes.byteLength,
      sha256: "imported",
      role: "supported-binary" as const,
      editable: true
    }));
    registerBrowserSourceSnapshot(project, {
      capturedAt: "2026-07-18T00:00:00.000Z",
      rootName: "Imported Semantic Boundary",
      totalBytes: Array.from(importedBuffers.values()).reduce((total, bytes) => total + bytes.byteLength, 0),
      files: project.source.files.map((file) => ({
        ...file,
        bytesData: importedBuffers.get(file.name)!
      }))
    });

    const { semanticSchema } = await buildBrowserSemanticSchemaForProject(project);

    expect(semanticSchema.entities.find((entity) => entity.id === "treasure:0")).toMatchObject({
      editState: "inspect-only",
      confidence: "source-backed",
      editable: false,
      summary: { gold: 77 }
    });
    for (const entityId of [
      "message:0",
      "option-label:0",
      "monster-description:0",
      "shop:0",
      "encounter:simple:0",
      "encounter:complex:0"
    ]) {
      expect(semanticSchema.entities.find((entity) => entity.id === entityId)).toMatchObject({
        editState: "inspect-only",
        confidence: "source-backed",
        editable: false
      });
      expect(semanticSchema.entities.find((entity) => entity.id === entityId)?.summary.canonical).toBeUndefined();
    }
    expect(semanticSchema.sources.some((source) => source.name === "Data TD")).toBe(true);
  });

  it("indexes canonical supporting records without exposing sparse compiler slots", async () => {
    const project = createBrowserProject("Canonical Supporting Records");
    const parsed = parseScenarioBuffers(new Map([
      ["Data NI", new Uint8Array(100)],
      ["Data TD", new Uint8Array(48)],
      ["Data TD2", new Uint8Array(118)],
      ["Data TD3", new Uint8Array(40)],
      ["Data SD2", new Uint8Array(256)],
      ["Data OD", new Uint8Array(25)],
      ["Data DES", new Uint8Array(256)],
      ["Data SD", new Uint8Array(3002)],
      ["Data ED", new Uint8Array(426)],
      ["Data ED2", new Uint8Array(520)]
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
    project.messages = [{
      ...parsed.messages[0],
      id: 5,
      text: "Canonical message",
      authored: false,
      rawBytes: new Array(256).fill(0xa5)
    }];
    project.optionLabels = [{
      ...parsed.optionLabels[0],
      id: 6,
      text: "Canonical option",
      authored: false,
      rawBytes: new Array(25).fill(0xa5)
    }];
    project.monsterDescriptions = [{
      ...parsed.monsterDescriptions[0],
      id: 7,
      text: "Canonical monster description",
      authored: false,
      rawBytes: new Array(256).fill(0xa5)
    }];
    project.shops = [{
      ...parsed.shops[0],
      id: 2,
      itemIds: [901],
      quantities: [3],
      inflation: 120,
      authored: false,
      rawBytes: new Array(3002).fill(0xa5)
    }];
    project.simpleEncounters = [{
      ...parsed.simpleEncounters[0],
      id: 2,
      canBackOut: true,
      prompt: 12,
      texts: ["Canonical simple encounter", "", "", ""],
      authored: false,
      rawBytes: new Array(426).fill(0xa5)
    }];
    project.complexEncounters = [{
      ...parsed.complexEncounters[0],
      id: 4,
      thief: true,
      thiefSuccess: 2,
      prompt: 18,
      texts: ["Canonical complex encounter", "", "", "", "", "", "", "", ""],
      authored: false,
      rawBytes: new Array(520).fill(0xa5)
    }];

    const { semanticSchema } = await buildBrowserSemanticSchemaForProject(project);

    for (const entityId of [
      "item:901",
      "treasure:3",
      "thief:2",
      "time:3",
      "message:5",
      "option-label:6",
      "monster-description:7",
      "shop:2",
      "encounter:simple:2",
      "encounter:complex:4"
    ]) {
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
    for (const entityId of [
      "item:800",
      "treasure:0",
      "thief:0",
      "time:0",
      "message:0",
      "option-label:0",
      "monster-description:0",
      "shop:0",
      "encounter:simple:0",
      "encounter:complex:0"
    ]) {
      expect(semanticSchema.entities.some((entity) => entity.id === entityId)).toBe(false);
    }
    expect(semanticSchema.entities.find((entity) => entity.id === "treasure:3")?.summary.gold).toBe(77);
    expect(semanticSchema.entities.find((entity) => entity.id === "message:5")?.summary.text).toBe("Canonical message");
    expect(semanticSchema.entities.find((entity) => entity.id === "option-label:6")?.summary.text).toBe("Canonical option");
    expect(semanticSchema.entities.find((entity) => entity.id === "option-label:6")?.summary.shortcut).toBe("c");
    expect(semanticSchema.entities.find((entity) => entity.id === "monster-description:7")?.summary.text).toBe("Canonical monster description");
    expect(semanticSchema.entities.find((entity) => entity.id === "shop:2")?.summary.inflation).toBe(120);
    expect(semanticSchema.entities.find((entity) => entity.id === "encounter:simple:2")?.summary.prompt).toBe(12);
    expect(semanticSchema.links).toContainEqual(expect.objectContaining({
      from: "encounter:complex:4",
      to: "thief:2",
      kind: "uses_thief_encounter"
    }));
    for (const [name, path] of [
      ["Data NI", "project.json#scenarioItems"],
      ["Data TD", "project.json#treasures"],
      ["Data TD2", "project.json#thiefEncounters"],
      ["Data TD3", "project.json#timedEncounters"],
      ["Data SD2", "project.json#messages"],
      ["Data OD", "project.json#optionLabels"],
      ["Data DES", "project.json#monsterDescriptions"],
      ["Data SD", "project.json#shops"],
      ["Data ED", "project.json#simpleEncounters"],
      ["Data ED2", "project.json#complexEncounters"]
    ]) {
      expect(semanticSchema.sources.find((source) => source.name === name)).toMatchObject({
        path,
        origin: "authored-source",
        confidence: "confirmed"
      });
    }
  });
});
