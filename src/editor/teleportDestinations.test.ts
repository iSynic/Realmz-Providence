import { describe, expect, it } from "vitest";
import { missingEdcdTargetReferences } from "./edcdTargets";
import { scriptActionDefinitionFor, scriptActionSummary, scriptStepFlowRoutes } from "./panels/scripts/scriptActionCatalog";
import { teleportDestinationLevelType, teleportLevelLabel, teleportLevelOptions, teleportMapCoordinateTarget } from "./teleportDestinations";
import type { Project } from "./types";

const project = {
  maps: [
    { id: "map:land:0", levelType: "land", index: 0, name: "Island" },
    { id: "map:land:1", levelType: "land", index: 1, name: "Clifftop" },
    { id: "map:dungeon:0", levelType: "dungeon", index: 0, name: "Bell Depths" },
    { id: "map:dungeon:2", levelType: "dungeon", index: 2, name: "Flooded Crypt" }
  ],
  extracodes: []
} as unknown as Project;

describe("teleport destination families", () => {
  it("keeps Teleport in the owning Action Point's map family", () => {
    expect(teleportDestinationLevelType("teleport", [2, 7, 8, 0, 0], "dungeon")).toBe("dungeon");
    expect(teleportMapCoordinateTarget("teleport", [2, 7, 8, 0, 0], "dungeon")).toEqual({
      levelType: "dungeon",
      levelIndex: 2,
      x: 7,
      y: 8
    });
    expect(teleportMapCoordinateTarget("teleport", [2, 7, 8, 0, 0], null)).toBeNull();
  });

  it("uses opcode 37 mode to select land or dungeon storage without changing field positions", () => {
    expect(teleportDestinationLevelType("dungeon-move", [0, 2, 11, 12, -4])).toBe("dungeon");
    expect(teleportMapCoordinateTarget("dungeon-move", [0, 2, 11, 12, -4])).toEqual({
      levelType: "dungeon",
      levelIndex: 2,
      x: 11,
      y: 12
    });
    expect(teleportMapCoordinateTarget("dungeon-move", [1, 1, 4, 5, 3])).toEqual({
      levelType: "land",
      levelIndex: 1,
      x: 4,
      y: 5
    });
  });

  it("shows ambiguous reusable levels as runtime-family indices", () => {
    expect(teleportLevelOptions(project, null).map((option) => option.label)).toEqual([
      "Level index 0 (land and dungeon)",
      "Level index 1 (land)",
      "Level index 2 (dungeon)"
    ]);
    expect(teleportLevelLabel(project, 0, null)).toBe("runtime-family level 0 (land and dungeon exist)");
  });

  it("validates a map-owned Teleport against only its owning family", () => {
    const fields = ["levelOrKeep", "xOrKeep", "yOrKeep", "sound", "message"];
    const landIssues = missingEdcdTargetReferences(project, "teleport", fields, [2, 7, 8, 0, 0], 20, undefined, null, "land");
    const dungeonIssues = missingEdcdTargetReferences(project, "teleport", fields, [2, 7, 8, 0, 0], 20, undefined, null, "dungeon");
    const ambiguousIssues = missingEdcdTargetReferences(project, "teleport", fields, [2, 7, 8, 0, 0], 20, undefined, null, null);

    expect(landIssues).toMatchObject([{ targetKind: "landLevel", value: 2 }]);
    expect(dungeonIssues).toEqual([]);
    expect(ambiguousIssues).toEqual([]);
  });
});

describe("teleport action presentation", () => {
  it("presents opcode 37 as the explicit family switch and preserves its five raw fields", () => {
    const definition = scriptActionDefinitionFor(37);
    expect(definition.label).toMatch(/^Enter . Exit Dungeon$/);
    expect(definition.shortLabel).toBe(definition.label);
    expect(definition).toMatchObject({
      edcdShape: "dungeon-move",
      defaultDraft: { rawCode: 37, parameters: [0, 0, 0, 0, 1] }
    });
    expect(definition.parameters.map((parameter) => parameter.internalName)).toEqual(["mode", "level", "x", "y", "signedHeading"]);
  });

  it("makes land, dungeon, and reusable Teleport summaries family-aware", () => {
    const draft = { rawCode: 20, id: 0, parameters: [0, 4, 5, 0, 0] as [number, number, number, number, number] };
    expect(scriptActionSummary(project, null, draft, "", "land")).toContain("Island");
    expect(scriptActionSummary(project, null, draft, "", "dungeon")).toContain("Bell Depths");
    expect(scriptActionSummary(project, null, draft, "", null)).toContain("runtime-family level 0 (land and dungeon exist)");
  });

  it("marks opcode 37 as a script-ending cross-family transfer", () => {
    const draft = { rawCode: 37, id: 0, parameters: [0, 2, 11, 12, -4] as [number, number, number, number, number] };
    expect(scriptActionSummary(project, null, draft)).toContain("Flooded Crypt, 11, 12, facing west, 3D view only; stops script");
    expect(scriptStepFlowRoutes(project, null, draft)).toMatchObject([
      { kind: "stops", label: scriptActionDefinitionFor(37).shortLabel }
    ]);
  });
});
