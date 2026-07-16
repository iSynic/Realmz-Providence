import { describe, expect, it } from "vitest";
import type { Project, TriggerRecord } from "../../types";
import { renameEditorEntity } from "../../projectCommands/scenarioRulesCommands";
import { scriptDescriptor, scriptIdentity, scriptLabel, scriptMatchesQuery } from "./scriptInventory";

const trigger: TriggerRecord = {
  id: "Data DD:0:1",
  source: "Data DD",
  levelType: "land",
  levelIndex: 0,
  recordIndex: 1,
  active: true,
  doorid: 0,
  percent: 100,
  coordinate: { x: 60, y: 67 },
  actions: []
};

function projectWithDescriptor(descriptor = "Bell tower entrance") {
  return {
    maps: [{
      id: "land:0",
      name: "Land level 0",
      levelType: "land",
      index: 0,
      width: 90,
      height: 90,
      tiles: new Array(90 * 90).fill(0)
    }],
    editorMetadata: {
      displayNames: descriptor ? {
        [trigger.id]: { label: descriptor, source: "user", updatedAt: "2026-07-16T00:00:00.000Z" }
      } : {},
      tilePalettes: [],
      mapStamps: [],
      questThreads: [],
      questContextSources: []
    }
  } as unknown as Project;
}

describe("Action Point project descriptors", () => {
  it("keeps the Realmz record identity separate from project-only metadata", () => {
    const project = projectWithDescriptor();

    expect(scriptIdentity(trigger)).toBe("Action Point 1 (60, 67)");
    expect(scriptDescriptor(project, trigger)).toBe("Bell tower entrance");
    expect(scriptLabel(project, trigger)).toBe("Action Point 1 (60, 67) - Bell tower entrance");
  });

  it("searches both canonical coordinates and the optional descriptor", () => {
    const project = projectWithDescriptor();

    expect(scriptMatchesQuery(project, trigger, "Action Point 1")).toBe(true);
    expect(scriptMatchesQuery(project, trigger, "60, 67")).toBe(true);
    expect(scriptMatchesQuery(project, trigger, "bell tower")).toBe(true);
  });

  it("removes a project descriptor when the field is cleared", () => {
    const project = projectWithDescriptor();
    const updated = renameEditorEntity(project, trigger.id, "  ");

    expect(scriptDescriptor(updated, trigger)).toBe("");
    expect(scriptLabel(updated, trigger)).toBe("Action Point 1 (60, 67)");
  });
});
