import { describe, expect, it } from "vitest";
import {
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
});
