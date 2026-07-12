import { describe, expect, it } from "vitest";
import type { TriggerRecord } from "../../types";
import { actionSlotIndexFromSelection, actionSlotSelectionId, includeSelectedTrigger } from "./actionPointSelection";

function trigger(id: string, recordIndex: number, source = "Data DD"): TriggerRecord {
  return {
    id,
    source,
    levelType: "land",
    levelIndex: 2,
    recordIndex,
    active: true,
    doorid: 0,
    percent: 100,
    coordinate: { x: recordIndex, y: recordIndex },
    actions: []
  };
}

describe("action point selection", () => {
  it("keeps a selected record visible beyond the inventory cap", () => {
    const records = [trigger("first", 0), trigger("second", 1), trigger("selected", 2)];

    expect(includeSelectedTrigger(records, records[2], 2).map((record) => record.id)).toEqual([
      "selected",
      "first",
      "second"
    ]);
  });

  it("does not insert selections outside the available records", () => {
    const records = [trigger("first", 0), trigger("second", 1)];

    expect(includeSelectedTrigger(records, trigger("missing", 8), 1)).toEqual([records[0]]);
    expect(includeSelectedTrigger(records, null, -1)).toEqual([]);
  });

  it("round-trips semantic action slot selection IDs", () => {
    const selectionId = actionSlotSelectionId(trigger("macro", 9, "Data ED3"), 4);

    expect(selectionId).toBe("action-slot:macro:9:4");
    expect(actionSlotIndexFromSelection(selectionId)).toBe(4);
  });

  it("rejects unrelated and malformed selection IDs", () => {
    expect(actionSlotIndexFromSelection("trigger:land:2:9")).toBeNull();
    expect(actionSlotIndexFromSelection("action-slot:trigger:land:2:9:not-a-slot")).toBeNull();
    expect(actionSlotIndexFromSelection(null)).toBeNull();
  });
});
