import { describe, expect, it } from "vitest";
import { createBrowserProject } from "./browser/project";
import {
  applyProjectCommand,
  projectCommandChangeCount,
  projectCommandLabel
} from "./projectCommands";
import type { ProjectCommand } from "./types";

describe("project command facade", () => {
  it("creates fresh messages from semantic text without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Message");

    const next = applyProjectCommand(project, {
      kind: "updateMessageRecord",
      label: "Create message",
      id: 4,
      changes: { text: "Providence owns this message." }
    });

    expect(next.messages).toHaveLength(1);
    expect(next.messages[0].text).toBe("Providence owns this message.");
    expect(next.messages[0].rawBytes).toBeUndefined();
  });

  it("creates fresh option labels from semantic text without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Option Label");

    const next = applyProjectCommand(project, {
      kind: "updateOptionLabel",
      label: "Create option label",
      id: 4,
      changes: { text: "Proceed" }
    });

    expect(next.optionLabels).toHaveLength(1);
    expect(next.optionLabels[0].text).toBe("Proceed");
    expect(next.optionLabels[0].rawBytes).toBeUndefined();
  });

  it("creates fresh battles from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Battle");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create battle",
      recordType: "battle",
      id: 4
    });

    expect(next.battles).toHaveLength(1);
    expect(next.battles[0].grid).toHaveLength(13 * 13);
    expect(next.battles[0].rawBytes).toBeUndefined();
  });

  it("creates fresh simple encounters from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Simple Encounter");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create simple encounter",
      recordType: "simpleEncounter",
      id: 4
    });

    expect(next.simpleEncounters).toHaveLength(1);
    expect(next.simpleEncounters[0].texts).toEqual(["", "", "", ""]);
    expect(next.simpleEncounters[0].rawBytes).toBeUndefined();
  });

  it("creates fresh complex encounters from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Complex Encounter");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create complex encounter",
      recordType: "complexEncounter",
      id: 4
    });

    expect(next.complexEncounters).toHaveLength(1);
    expect(next.complexEncounters[0].texts).toHaveLength(9);
    expect(next.complexEncounters[0].spellIds).toHaveLength(10);
    expect(next.complexEncounters[0].rawBytes).toBeUndefined();
    expect(next.complexEncounters[0].choiceResults).toBeUndefined();
    expect(next.complexEncounters[0].wordResults).toBeUndefined();
  });

  it("creates fresh thief encounters from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Thief Encounter");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create thief encounter",
      recordType: "thiefEncounter",
      id: 4
    });

    expect(next.thiefEncounters).toHaveLength(1);
    expect(next.thiefEncounters[0].typeFlags).toHaveLength(10);
    expect(next.thiefEncounters[0].successCodes).toHaveLength(8);
    expect(next.thiefEncounters[0].prompts).toHaveLength(3);
    expect(next.thiefEncounters[0].rawBytes).toBeUndefined();
  });

  it("creates fresh timed encounters from semantic fields without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Timed Encounter");

    const next = applyProjectCommand(project, {
      kind: "createTargetRecord",
      label: "Create timed encounter",
      recordType: "timedEncounter",
      id: 4
    });

    expect(next.timedEncounters).toHaveLength(1);
    expect(next.timedEncounters[0]).toMatchObject({ day: -1, increment: -1, percent: 100, locationKind: "any" });
    expect(next.timedEncounters[0].reservedWords).toBeUndefined();
    expect(next.timedEncounters[0].rawBytes).toBeUndefined();
  });

  it("creates fresh map records from semantic data without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Player Map");

    const next = applyProjectCommand(project, {
      kind: "createMapRecord",
      label: "Create player map",
      id: 3,
      template: { note: "Canonical map" }
    });

    expect(next.mapRecords).toHaveLength(1);
    expect(next.mapRecords[0].markers).toHaveLength(10);
    expect(next.mapRecords[0].note).toBe("Canonical map");
    expect(next.mapRecords[0].rawBytes).toBeUndefined();
  });

  it("creates fresh scenario items from semantic data without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Scenario Item");

    const next = applyProjectCommand(project, {
      kind: "updateScenarioItemRecord",
      label: "Create scenario item",
      id: 4,
      changes: { itemId: 904, cost: 25 }
    });

    expect(next.scenarioItems).toHaveLength(1);
    expect(next.scenarioItems[0].itemId).toBe(904);
    expect(next.scenarioItems[0].cost).toBe(25);
    expect(next.scenarioItems[0].spare2).toHaveLength(7);
    expect(next.scenarioItems[0].rawBytes).toBeUndefined();
  });

  it("creates fresh treasures from semantic data without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Treasure");

    const next = applyProjectCommand(project, {
      kind: "updateTreasureRecord",
      label: "Create treasure",
      id: 4,
      changes: { itemIds: [901, ...new Array(19).fill(0)], gold: 25 }
    });

    expect(next.treasures).toHaveLength(1);
    expect(next.treasures[0].gold).toBe(25);
    expect(next.treasures[0].itemIds).toHaveLength(20);
    expect(next.treasures[0].rawBytes).toBeUndefined();
  });

  it("creates fresh shops from semantic data without compatibility bytes", () => {
    const project = createBrowserProject("Semantic Shop");

    const next = applyProjectCommand(project, {
      kind: "updateShopRecord",
      label: "Create shop",
      id: 4,
      changes: {
        itemIds: [901, ...new Array(999).fill(0)],
        quantities: [3, ...new Array(999).fill(0)],
        inflation: 105
      }
    });

    expect(next.shops).toHaveLength(1);
    expect(next.shops[0].inflation).toBe(105);
    expect(next.shops[0].itemIds).toHaveLength(1000);
    expect(next.shops[0].quantities).toHaveLength(1000);
    expect(next.shops[0].rawBytes).toBeUndefined();
  });

  it("applies an immutable command and exposes history metadata", () => {
    const project = createBrowserProject("Command Facade");
    const originalTile = project.maps[0].tiles[0];
    const command: ProjectCommand = {
      kind: "paintTiles",
      label: "Paint selected tiles",
      mapId: project.maps[0].id,
      cells: [
        { x: 0, y: 0, index: 0, from: originalTile, to: originalTile + 1 },
        { x: 1, y: 0, index: 1, from: project.maps[0].tiles[1], to: originalTile + 1 }
      ]
    };

    const next = applyProjectCommand(project, command);

    expect(next).not.toBe(project);
    expect(project.maps[0].tiles[0]).toBe(originalTile);
    expect(next.maps[0].tiles.slice(0, 2)).toEqual([originalTile + 1, originalTile + 1]);
    expect(projectCommandLabel(command)).toBe("Paint 2 tiles");
    expect(projectCommandChangeCount(command)).toBe(2);
  });

  it("removes an imported scenario resource without deleting fallback or unrelated assets", () => {
    const project = createBrowserProject("Resource Removal");
    project.assetCatalog = {
      ...project.assetCatalog,
      pictures: [
        { id: "picture:scenario:170", resourceType: "PICT", resourceId: 170, name: "Scenario Override", source: "Scenario resource fork", previewPath: "override.png" },
        { id: "picture:realmz:302", resourceType: "PICT", resourceId: 302, name: "Dungeon Top Down", source: "Realmz reference resources", previewPath: "dungeon.png" },
        { id: "picture:scenario:30000", resourceType: "PICT", resourceId: 30000, name: "Scenario Scene", source: "Scenario resource fork", previewPath: "scene.png" }
      ]
    };
    project.semanticSchema.entities = [
      semanticResourceEntity("resource:scenario:170", "Scenario resource fork", 170),
      semanticResourceEntity("resource:realmz:170", "Realmz reference resources", 170),
      semanticResourceEntity("resource:scenario:30000", "Scenario resource fork", 30000)
    ];
    project.semanticSchema.links = [
      semanticResourceLink("link:scenario", "resource:scenario:170", "resource:scenario:30000"),
      semanticResourceLink("link:realmz", "resource:realmz:170", "resource:scenario:30000")
    ];

    const next = applyProjectCommand(project, {
      kind: "removeScenarioResource",
      label: "Remove PICT 170",
      resourceType: "PICT",
      resourceId: 170,
      source: "Scenario resource fork"
    });

    expect(next.assetCatalog.pictures?.map((asset) => `${asset.source}:${asset.resourceId}`)).toEqual([
      "Realmz reference resources:302",
      "Scenario resource fork:30000"
    ]);
    expect(next.semanticSchema.entities.map((entity) => entity.id)).toEqual([
      "resource:realmz:170",
      "resource:scenario:30000"
    ]);
    expect(next.semanticSchema.links.map((link) => link.id)).toEqual(["link:realmz"]);
    expect(next.semanticSchema.reverseLinks).toEqual({
      "resource:realmz:170": { incoming: [], outgoing: ["link:realmz"] },
      "resource:scenario:30000": { incoming: ["link:realmz"], outgoing: [] }
    });
    expect(next.editorMetadata.removedScenarioResources).toEqual([{ resourceType: "PICT", resourceId: 170 }]);
  });
});

function semanticResourceEntity(id: string, source: string, resourceId: number) {
  return {
    id,
    type: "resource",
    label: `PICT ${resourceId}`,
    editState: "inspect-only" as const,
    confidence: "fixture-proven",
    source,
    recordRef: null,
    byteRange: null,
    editable: false,
    summary: { resourceType: "PICT", resourceId }
  };
}

function semanticResourceLink(id: string, from: string, to: string) {
  return {
    id,
    from,
    to,
    kind: "references",
    confidence: "fixture-proven",
    evidence: [],
    metadata: {}
  };
}
