import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../browser/project";
import { isManualCapturePresetId, manualCaptureActions, uiAuditCaptureActions, uiAuditCaptureTarget } from "./manualCapture";

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

  it("opens capture-ready UI audit tools from the shared matrix", () => {
    const project = createBrowserProject("UI Audit Capture");
    const target = uiAuditCaptureTarget("scripts.macros");

    expect(target?.track).toBe("ISY-334");
    expect(target && uiAuditCaptureActions(project, target)).toEqual(expect.arrayContaining([
      { type: "setWorkbench", workbench: "project", tab: "scripts" },
      { type: "setActiveEditor", editor: "macros" },
      { type: "setTab", tab: "scripts" }
    ]));
  });

  it("loads deterministic interaction recipes from the shared matrix", () => {
    const target = uiAuditCaptureTarget("encounters.complex");

    expect(target?.capture.states).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "result-target-open" }),
      expect.objectContaining({ id: "result-target-filtered" })
    ]));
  });

  it("prefers a Complex Encounter with a previewable string result", () => {
    const project = createBrowserProject("Complex Encounter Capture");
    project.messages.push({ id: 42, text: "Previewable result" });
    project.complexEncounters = [
      { ...project.complexEncounters[0], id: 0, actions: [] },
      { ...project.complexEncounters[0], id: 1, actions: [{ slot: 0, rawCode: 1, id: 42 }] }
    ];

    expect(manualCaptureActions(project, "encounters")).toContainEqual({
      type: "selectEntity",
      entity: expect.objectContaining({ type: "encounter", id: "encounter:complex:1" })
    });
  });

  it("does not route tools that still require an interaction hook", () => {
    expect(uiAuditCaptureTarget("maps.layout")).toBeNull();
  });
});
