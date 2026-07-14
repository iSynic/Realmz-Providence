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
});
