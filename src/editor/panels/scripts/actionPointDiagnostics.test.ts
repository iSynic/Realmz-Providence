import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../../browser/project";
import type { TriggerRecord } from "../../types";
import { actionPointDiagnosticDependencyKey, validateActionPointTriggerCached } from "./actionPointDiagnostics";

function trigger(): TriggerRecord {
  return {
    id: "trigger:test",
    source: "Data DD",
    levelType: "land",
    levelIndex: 0,
    recordIndex: 0,
    active: true,
    doorid: 0,
    percent: 100,
    coordinate: { x: 10, y: 12 },
    actions: Array.from({ length: 8 }, (_, slot) => ({
      slot,
      rawCode: 0,
      code: 0,
      id: 0,
      label: "Empty",
      category: "Empty"
    }))
  };
}

describe("action point diagnostic cache", () => {
  it("reuses diagnostics only while the trigger and dependency key are stable", () => {
    const project = createBrowserProject("Diagnostic Cache");
    const selected = trigger();
    project.triggers = [selected];
    const key = actionPointDiagnosticDependencyKey(project, null);

    const first = validateActionPointTriggerCached(project, selected, null, key);
    const cached = validateActionPointTriggerCached(project, selected, null, key);
    const refreshed = validateActionPointTriggerCached(project, selected, null, `${key}|changed`);
    const clonedTrigger = validateActionPointTriggerCached(project, { ...selected }, null, key);

    expect(cached).toBe(first);
    expect(refreshed).not.toBe(first);
    expect(clonedTrigger).not.toBe(first);
  });

  it("invalidates the dependency key when referenced project collections change identity", () => {
    const project = createBrowserProject("Diagnostic Dependencies");
    const first = actionPointDiagnosticDependencyKey(project, null);
    project.messages = [...project.messages];

    expect(actionPointDiagnosticDependencyKey(project, null)).not.toBe(first);
  });
});
