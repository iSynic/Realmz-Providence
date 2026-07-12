import { describe, expect, it } from "vitest";
import type { Action } from "../../types";
import {
  actionPointSlotDraft,
  actionPointStepApplyCommand,
  actionPointStepDraftDirty,
  removeActionPointEdcdDrafts,
  removeActionPointStepDraft,
  swapActionPointStepDrafts
} from "./actionPointStepCommands";

const action = { slot: 2, rawCode: 4, code: 4, id: 8, label: "Teleport", category: "Travel" } as Action;

describe("action point step commands", () => {
  it("uses saved actions until a keyed draft exists", () => {
    expect(actionPointSlotDraft({}, "trigger", 2, action)).toEqual({ rawCode: 4, id: 8 });
    expect(actionPointSlotDraft({ "trigger:2": { rawCode: 58, id: 3 } }, "trigger", 2, action)).toEqual({ rawCode: 58, id: 3 });
    expect(actionPointStepDraftDirty({ rawCode: 4, id: 8 }, action)).toBe(false);
    expect(actionPointStepDraftDirty({ rawCode: 4, id: 9 }, action)).toBe(true);
  });

  it("swaps draft slots without mutating the source", () => {
    const drafts = { "trigger:1": { rawCode: 1, id: 10 }, "trigger:2": { rawCode: 2, id: 20 } };
    const swapped = swapActionPointStepDrafts(drafts, "trigger", 1, 2);

    expect(swapped).toEqual({ "trigger:1": { rawCode: 2, id: 20 }, "trigger:2": { rawCode: 1, id: 10 } });
    expect(drafts["trigger:1"]).toEqual({ rawCode: 1, id: 10 });
  });

  it("removes only the selected direct and EDCD drafts", () => {
    const direct = { "trigger:1": { rawCode: 1, id: 10 }, "trigger:2": { rawCode: 2, id: 20 } };
    expect(removeActionPointStepDraft(direct, "trigger:1")).toEqual({ "trigger:2": { rawCode: 2, id: 20 } });
    expect(removeActionPointEdcdDrafts({ "trigger:1:4": 1, "trigger:1:8": 2, "trigger:2:4": 3 }, "trigger:1:"))
      .toEqual({ "trigger:2:4": 3 });
  });

  it("constructs direct and EDCD-backed apply commands", () => {
    expect(actionPointStepApplyCommand({ triggerId: "trigger", slot: 2, draft: { rawCode: 1, id: 8 } })).toMatchObject({
      kind: "updateActionSlot",
      rawCode: 1,
      id: 8
    });
    expect(actionPointStepApplyCommand({
      triggerId: "trigger",
      slot: 2,
      draft: { rawCode: 4, id: 7 },
      edcdShape: "teleport",
      edcdValues: [1, 2, 3, 4, 5],
      secondaryEdcdValues: [6, 7, 8, 9, 10]
    })).toEqual({
      kind: "applyRealmzScriptStep",
      label: "Update slot 2",
      triggerId: "trigger",
      slot: 2,
      opcode: 4,
      id: 7,
      edcdValues: [1, 2, 3, 4, 5],
      secondaryEdcdValues: [6, 7, 8, 9, 10]
    });
  });
});
