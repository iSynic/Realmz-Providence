import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { duplicateActionPointSettings } from "./ActionPointSettingsEditor";

describe("action point settings duplication", () => {
  it("allocates a new EDCD row and retargets an applied step", () => {
    const result = duplicateActionPointSettings({
      project: { extracodes: [{ id: 0 }, { id: 2 }] } as Project,
      rowUsage: { values: [4, 3, 2, 1, 0] } as never,
      settingsLabel: "Movement Settings",
      selectedDraft: { rawCode: 4, id: 2 },
      selectedSlotApplied: true,
      selectedTriggerId: "trigger-7",
      selectedSlot: 3
    });

    expect(result.nextDraft).toEqual({ rawCode: 4, id: 1 });
    expect(result.commands).toEqual([
      { kind: "updateEdcdRow", label: "Duplicate Movement Settings", rowId: 1, values: [4, 3, 2, 1, 0] },
      { kind: "updateActionSlot", label: "Use Movement Settings", triggerId: "trigger-7", slot: 3, rawCode: 4, id: 1 }
    ]);
  });

  it("does not retarget a step that has not been applied", () => {
    const result = duplicateActionPointSettings({
      project: { extracodes: [] } as unknown as Project,
      defaultValues: [1, 2, 3, 4, 5],
      settingsLabel: "Choice Dialog Settings",
      selectedDraft: { rawCode: 3, id: 0 },
      selectedSlotApplied: false,
      selectedTriggerId: "trigger-1",
      selectedSlot: 0
    });

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]).toMatchObject({ kind: "updateEdcdRow", rowId: 0, values: [1, 2, 3, 4, 5] });
  });
});
