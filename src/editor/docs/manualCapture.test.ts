import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../browser/project";
import { isManualCapturePresetId, manualCaptureActions } from "./manualCapture";

describe("manual capture presets", () => {
  it("accepts only supported deterministic presets", () => {
    expect(isManualCapturePresetId("maps")).toBe(true);
    expect(isManualCapturePresetId("encounters")).toBe(true);
    expect(isManualCapturePresetId("unknown")).toBe(false);
    expect(isManualCapturePresetId(null)).toBe(false);
  });

  it("opens the requested editor with tutorial overlays disabled", () => {
    const project = createBrowserProject("Manual Capture");
    const actions = manualCaptureActions(project, "assets");

    expect(actions).toContainEqual({ type: "setTutorialEnabled", enabled: false });
    expect(actions).toContainEqual({ type: "setActiveEditor", editor: "project-assets" });
    expect(actions).toContainEqual({ type: "setTab", tab: "assets" });
  });

  it("selects the first map for a map capture", () => {
    const project = createBrowserProject("Map Capture");
    const actions = manualCaptureActions(project, "maps");

    expect(actions).toContainEqual({ type: "setSelectedMap", id: project.maps[0].id });
    expect(actions).toContainEqual({ type: "setTool", tool: "select" });
  });
});
