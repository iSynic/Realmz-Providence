import { describe, expect, it } from "vitest";
import {
  resolveSignedTargetValue,
  signedSoundValueForSelection,
  signedSoundWaitsForCompletion,
  signedTargetBehaviorLabel,
  signedTargetValueForSelection,
  supportsSignedSoundReference,
  targetPickerConfig,
  type ScriptTargetOption
} from "./RealmzTargetPicker";
import { filterTargetOptions } from "./realmzTargetPickerSearch";

describe("Realmz target semantics", () => {
  it("preserves signed direct-target behavior when replacing a selection", () => {
    expect(resolveSignedTargetValue(1, -808)).toBe(808);
    expect(signedTargetValueForSelection(1, -808, 12)).toBe(-12);
    expect(signedTargetBehaviorLabel(1, -12)).toBe("no wait");
  });

  it("encodes sound wait behavior without changing the selected resource ID", () => {
    expect(supportsSignedSoundReference(9)).toBe(true);
    expect(signedSoundValueForSelection(200, true)).toBe(-200);
    expect(signedSoundWaitsForCompletion(-200)).toBe(true);
    expect(signedSoundValueForSelection(200, false)).toBe(200);
  });

  it("keeps target picker coverage tied to normalized Realmz opcodes", () => {
    expect(targetPickerConfig(5)?.recordType).toBe("complexEncounter");
    expect(targetPickerConfig(-5)?.recordType).toBe("complexEncounter");
    expect(targetPickerConfig(58)).toBeNull();
  });
});

describe("target option filtering", () => {
  const options: ScriptTargetOption[] = [
    { key: "message:12", value: 12, label: "String 12", detail: "The bell tolls below.", sourceState: "Scenario authored" },
    { key: "message:28", value: 28, label: "String 28", detail: "A salt-crusted key rests here.", compatibility: "Realmz resource" }
  ];

  it("matches numeric IDs and author-facing text", () => {
    expect(filterTargetOptions(options, "28").map((option) => option.value)).toEqual([28]);
    expect(filterTargetOptions(options, "bell").map((option) => option.value)).toEqual([12]);
    expect(filterTargetOptions(options, "scenario authored").map((option) => option.value)).toEqual([12]);
  });
});
