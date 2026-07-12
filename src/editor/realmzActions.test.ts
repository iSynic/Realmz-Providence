import { describe, expect, it } from "vitest";
import { edcdFieldTargetKind } from "./edcdTargets";
import { actionOptionFor, hasNewlandDispatcherCase, isDispatcherNoopOpcode, normalizeStepOpcode } from "./realmzActions";
import { edcdFieldNamesForShape } from "./realmzEdcd";

describe("Realmz action catalog contracts", () => {
  it("normalizes signed dispatch codes while preserving documented negative opcodes", () => {
    expect(normalizeStepOpcode(-58)).toBe(58);
    expect(normalizeStepOpcode(-14)).toBe(-14);
    expect(normalizeStepOpcode(-23)).toBe(-23);
    expect(hasNewlandDispatcherCase(-58)).toBe(true);
  });

  it("keeps EDCD-backed action definitions stable for upcoming step extraction", () => {
    expect(actionOptionFor(20)).toMatchObject({ shortLabel: "Teleport", edcdShape: "teleport" });
    expect(actionOptionFor(54)).toMatchObject({ shortLabel: "Alter Time Encounter", edcdShape: "timed-encounter-mutation" });
    expect(actionOptionFor(58)).toMatchObject({ shortLabel: "Branch on Difficulty Level", aliasTitle: "Force Branch", edcdShape: "force-branch" });
  });

  it("distinguishes preserved inert codes from unknown dispatcher no-ops", () => {
    expect(actionOptionFor(79).shortLabel).toBe("Inert Imported Action");
    expect(isDispatcherNoopOpcode(79)).toBe(true);
    expect(actionOptionFor(200).shortLabel).toBe("Dispatcher No-op");
  });
});

describe("EDCD field contracts", () => {
  it("exposes authoring fields for teleport and settings-backed branch actions", () => {
    expect(edcdFieldNamesForShape("teleport")).toEqual(["levelOrKeep", "xOrKeep", "yOrKeep", "sound", "message"]);
    expect(edcdFieldNamesForShape("timed encounter mutation")).toEqual(["timedEncounter", "percentOrKeep", "incrementOrKeep", "resetDayFlag", "dayOffsetOrKeep"]);
    expect(edcdFieldNamesForShape("force-branch")).toEqual(["testA", "testB", "branchMode", "target", "slot"]);
  });

  it("classifies teleport media fields while leaving movement to its dedicated editor", () => {
    const fields = edcdFieldNamesForShape("teleport") ?? [];
    const values = [1, 20, 30, 200, 12];
    expect(edcdFieldTargetKind("teleport", "levelOrKeep", fields, values, 20)).toBeNull();
    expect(edcdFieldTargetKind("teleport", "sound", fields, values, 20)).toBe("sound");
    expect(edcdFieldTargetKind("teleport", "message", fields, values, 20)).toBe("message");
  });

  it("preserves opcode-specific battle target interpretation", () => {
    const fields = edcdFieldNamesForShape("battle") ?? [];
    expect(edcdFieldTargetKind("battle", "soundOrReviveLossMacro", fields, [1, 1, 200, 0, 0], 2)).toBe("sound");
    expect(edcdFieldTargetKind("battle", "soundOrReviveLossMacro", fields, [1, 1, 4, 0, 10], 2)).toBe("macro");
  });
});
