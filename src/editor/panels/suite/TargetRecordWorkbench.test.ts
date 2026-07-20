import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { Project, RealmzTargetRecordKind } from "../../types";
import {
  TargetRecordWorkbench,
  selectedTargetRecordTypeFromEntity,
  targetRecordTypeFromEditor,
  targetRecordTypesForEditor
} from "./TargetRecordWorkbench";

describe("TargetRecordWorkbench routing", () => {
  it("maps focused editors to writable record families", () => {
    expect(targetRecordTypesForEditor("text", "messages")).toEqual(["message"]);
    expect(targetRecordTypesForEditor("combat", "domain")).toEqual(["battle", "monster"]);
    expect(targetRecordTypesForEditor("encounters", "domain")).toEqual([
      "simpleEncounter",
      "complexEncounter",
      "thiefEncounter",
      "timedEncounter"
    ]);
    expect(targetRecordTypesForEditor("rules", "domain")).toEqual([]);
  });

  it("maps encounter editor IDs without affecting other domains", () => {
    expect(targetRecordTypeFromEditor("encounters", "complex")).toBe("complexEncounter");
    expect(targetRecordTypeFromEditor("encounters", "timed")).toBe("timedEncounter");
    expect(targetRecordTypeFromEditor("text", "complex")).toBeNull();
  });

  it("recognizes semantic encounter selection IDs", () => {
    const recordTypes = ["simpleEncounter", "complexEncounter", "thiefEncounter", "timedEncounter"] as const;
    expect(selectedTargetRecordTypeFromEntity("encounter:simple:3", [...recordTypes])).toBe("simpleEncounter");
    expect(selectedTargetRecordTypeFromEntity("thief:5", [...recordTypes])).toBe("thiefEncounter");
    expect(selectedTargetRecordTypeFromEntity("time:7", [...recordTypes])).toBe("timedEncounter");
    expect(selectedTargetRecordTypeFromEntity("item:7", [...recordTypes])).toBeNull();
  });

  it("renders every encounter editor synchronously without a loading teardown", () => {
    const project = encounterProject();
    const cases: Array<{ recordType: RealmzTargetRecordKind; entityId: string; label: string }> = [
      { recordType: "simpleEncounter", entityId: "encounter:simple:1", label: "Simple Encounter 1" },
      { recordType: "complexEncounter", entityId: "encounter:complex:2", label: "Complex Encounter 2" },
      { recordType: "thiefEncounter", entityId: "thief:3", label: "Rogue Encounter 3" },
      { recordType: "timedEncounter", entityId: "time:4", label: "Time Encounter 4" }
    ];

    for (const entry of cases) {
      const markup = renderToStaticMarkup(createElement(TargetRecordWorkbench, {
        project,
        catalog: null,
        recordType: entry.recordType,
        selectedEntity: { type: "encounter", id: entry.entityId },
        previewContext: { desktopRuntime: false, projectDir: "", workspaceDir: "" },
        onSelectEntity: () => undefined
      }));

      expect(markup).toContain(entry.label);
      expect(markup).toContain("encounter-record-picker-row");
      expect(markup).not.toContain("domain-target-editor-placeholder");
      expect(markup).not.toContain("Loading selected");
    }
  });
});

function encounterProject(): Project {
  const project = createBrowserProject("Persistent encounter workbench");
  project.simpleEncounters = [{
    id: 1,
    actions: [],
    choiceResults: [0, 0, 0, 0],
    canBackOut: false,
    maxTimes: 0,
    casteSuccess: 0,
    prompt: 0,
    texts: ["", "", "", ""],
    provenance: {
      sourceFile: "Data ED",
      recordIndex: 1,
      byteOffset: 426,
      byteLength: 426,
      confidence: "fixture-backed"
    }
  }];
  project.complexEncounters = [{
    id: 2,
    actions: [],
    actionResult: 0,
    wordResult: 0,
    groups: [],
    spellIds: [],
    spellResults: [],
    itemIds: [],
    itemResults: [],
    canBackOut: false,
    thief: false,
    maxTimes: 0,
    casteSuccess: 0,
    thiefSuccess: 0,
    thiefFail: 0,
    prompt: 0,
    texts: [],
    provenance: {
      sourceFile: "Data ED2",
      recordIndex: 2,
      byteOffset: 1040,
      byteLength: 520,
      confidence: "fixture-backed"
    }
  }];
  project.thiefEncounters = [{
    id: 3,
    typeFlags: new Array(10).fill(false),
    modifiers: new Array(8).fill(0),
    successCodes: new Array(8).fill(0),
    failureCodes: new Array(8).fill(0),
    successText: new Array(8).fill(0),
    failureText: new Array(8).fill(0),
    successSounds: new Array(8).fill(0),
    failureSounds: new Array(8).fill(0),
    spell: 0,
    lowDamage: 0,
    highDamage: 0,
    tumblers: 0,
    prompts: [0, 0, 0],
    promptSounds: [0, 0, 0],
    provenance: {
      sourceFile: "Data TD2",
      recordIndex: 3,
      byteOffset: 354,
      byteLength: 118,
      confidence: "fixture-backed"
    }
  }];
  project.timedEncounters = [{
    id: 4,
    day: -1,
    increment: -1,
    percent: 100,
    door: 0,
    requiredLevel: 0,
    requiredRandomRect: 0,
    requiredX: 0,
    requiredY: 0,
    requiredItem: 0,
    requiredQuest: 0,
    locationKind: "any",
    provenance: {
      sourceFile: "Data TD3",
      recordIndex: 4,
      byteOffset: 160,
      byteLength: 40,
      confidence: "fixture-backed"
    }
  }];
  return project;
}
