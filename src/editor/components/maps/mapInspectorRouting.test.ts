import { describe, expect, it } from "vitest";
import { compatibleMapTool, resolveMapInspectorRoute, transitionToMapInspector } from "./mapInspectorRouting";

describe("map inspector routing", () => {
  it("prioritizes paint, dungeon draw, selection, and setup on the canvas", () => {
    expect(resolveMapInspectorRoute({ workbenchMode: "canvas", activeTool: "paint", levelType: "land", hasSelection: true, hasSelectedRegion: false }).choice).toBe("paint");
    expect(resolveMapInspectorRoute({ workbenchMode: "canvas", activeTool: "bucket", levelType: "land", hasSelection: true, hasSelectedRegion: false }).choice).toBe("paint");
    expect(resolveMapInspectorRoute({ workbenchMode: "canvas", activeTool: "dungeon-draw", levelType: "dungeon", hasSelection: true, hasSelectedRegion: false }).choice).toBe("dungeon-draw");
    expect(resolveMapInspectorRoute({ workbenchMode: "canvas", activeTool: "select", levelType: "land", hasSelection: true, hasSelectedRegion: false }).choice).toBe("selection");
    expect(resolveMapInspectorRoute({ workbenchMode: "canvas", activeTool: "select", levelType: "land", hasSelection: false, hasSelectedRegion: false }).choice).toBe("setup");
  });

  it("uses the active non-canvas workbench as the inspector choice", () => {
    const route = resolveMapInspectorRoute({ workbenchMode: "land-tiles", activeTool: "select", levelType: "land", hasSelection: true, hasSelectedRegion: false });

    expect(route).toEqual({ choice: "land-tiles", showPaint: false, showDungeonDraw: false, showSelection: false });
  });

  it("normalizes tools that are invalid for the current map family", () => {
    expect(compatibleMapTool("dungeon", "paint")).toBe("select");
    expect(compatibleMapTool("dungeon", "bucket")).toBe("select");
    expect(compatibleMapTool("dungeon", "stamp")).toBe("select");
    expect(compatibleMapTool("land", "dungeon-draw")).toBe("select");
    expect(compatibleMapTool("land", "paint")).toBe("paint");
  });

  it("preserves inspector transition clearing semantics", () => {
    expect(transitionToMapInspector("setup", { isDungeon: false, hasSelection: true })).toEqual({
      workbenchMode: "canvas",
      tool: "select",
      clearRegion: true,
      clearSelection: true
    });
    expect(transitionToMapInspector("land-layout", { isDungeon: false, hasSelection: true })).toEqual({
      workbenchMode: "land-layout",
      clearRegion: true,
      clearSelection: false
    });
    expect(transitionToMapInspector("dungeon-draw", { isDungeon: false, hasSelection: false })).toBeNull();
    expect(transitionToMapInspector("selection", { isDungeon: false, hasSelection: false })).toBeNull();
  });
});
