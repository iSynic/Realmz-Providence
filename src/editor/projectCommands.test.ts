import { describe, expect, it } from "vitest";
import { createBrowserProject } from "./browser/project";
import {
  applyProjectCommand,
  projectCommandChangeCount,
  projectCommandLabel
} from "./projectCommands";
import type { ProjectCommand } from "./types";

describe("project command facade", () => {
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
