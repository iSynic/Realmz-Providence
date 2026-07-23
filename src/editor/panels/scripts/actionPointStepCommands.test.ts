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
const cleanDraft = { rawCode: 4, id: 8, mediaRequiredForProgression: false };

describe("action point step commands", () => {
  it("uses saved actions until a keyed draft exists", () => {
    expect(actionPointSlotDraft({}, "trigger", 2, action)).toEqual(cleanDraft);
    expect(actionPointSlotDraft({
      "trigger:2": { rawCode: 58, id: 3, mediaRequiredForProgression: false }
    }, "trigger", 2, action)).toEqual({
      rawCode: 58,
      id: 3,
      mediaRequiredForProgression: false
    });
    expect(actionPointStepDraftDirty(cleanDraft, action)).toBe(false);
    expect(actionPointStepDraftDirty({ ...cleanDraft, id: 9 }, action)).toBe(true);
  });

  it("swaps draft slots without mutating the source", () => {
    const drafts = {
      "trigger:1": { rawCode: 1, id: 10, mediaRequiredForProgression: false },
      "trigger:2": { rawCode: 2, id: 20, mediaRequiredForProgression: false }
    };
    const swapped = swapActionPointStepDrafts(drafts, "trigger", 1, 2);

    expect(swapped).toEqual({
      "trigger:1": { rawCode: 2, id: 20, mediaRequiredForProgression: false },
      "trigger:2": { rawCode: 1, id: 10, mediaRequiredForProgression: false }
    });
    expect(drafts["trigger:1"]).toEqual({
      rawCode: 1,
      id: 10,
      mediaRequiredForProgression: false
    });
  });

  it("removes only the selected direct and EDCD drafts", () => {
    const direct = {
      "trigger:1": { rawCode: 1, id: 10, mediaRequiredForProgression: false },
      "trigger:2": { rawCode: 2, id: 20, mediaRequiredForProgression: false }
    };
    expect(removeActionPointStepDraft(direct, "trigger:1")).toEqual({
      "trigger:2": { rawCode: 2, id: 20, mediaRequiredForProgression: false }
    });
    expect(removeActionPointEdcdDrafts({ "trigger:1:4": 1, "trigger:1:8": 2, "trigger:2:4": 3 }, "trigger:1:"))
      .toEqual({ "trigger:2:4": 3 });
  });

  it("constructs direct and EDCD-backed apply commands", () => {
    expect(actionPointStepApplyCommand({
      triggerId: "trigger",
      slot: 2,
      draft: { rawCode: 1, id: 8, mediaRequiredForProgression: false }
    })).toMatchObject({
      kind: "updateActionSlot",
      rawCode: 1,
      id: 8,
      mediaRequiredForProgression: false
    });
    expect(actionPointStepApplyCommand({
      triggerId: "trigger",
      slot: 2,
      draft: { rawCode: 4, id: 7, mediaRequiredForProgression: false },
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

  it("emits the progression marker only for Remake media actions", () => {
    expect(actionPointStepApplyCommand({
      triggerId: "trigger",
      slot: 2,
      draft: { rawCode: 27, id: 306, mediaRequiredForProgression: true }
    })).toMatchObject({
      kind: "updateActionSlot",
      rawCode: 27,
      mediaRequiredForProgression: true
    });
    expect(actionPointStepApplyCommand({
      triggerId: "trigger",
      slot: 2,
      draft: { rawCode: 1, id: 306, mediaRequiredForProgression: true }
    })).toMatchObject({
      kind: "updateActionSlot",
      rawCode: 1,
      mediaRequiredForProgression: false
    });
  });
});
