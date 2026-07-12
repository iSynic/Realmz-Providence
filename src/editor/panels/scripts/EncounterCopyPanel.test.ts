import { describe, expect, it } from "vitest";
import type { ComplexEncounterRecord, SimpleEncounterRecord } from "../../types";
import { encounterCopyChanges } from "./EncounterCopyPanel";

describe("encounter copy changes", () => {
  it("clones simple encounter arrays and action rows", () => {
    const source = {
      id: 4,
      prompt: 12,
      texts: ["Ask", "Leave"],
      actions: [{ slot: 0, rawCode: 1, id: 42 }],
      choiceResults: [1, 0],
      canBackOut: true,
      maxTimes: 3,
      casteSuccess: 2
    } as SimpleEncounterRecord;

    const changes = encounterCopyChanges(source);

    expect(changes).toMatchObject({
      prompt: 12,
      texts: ["Ask", "Leave"],
      choiceResults: [1, 0],
      actions: [{ slot: 0, rawCode: 1, id: 42 }]
    });
    expect(changes.texts).not.toBe(source.texts);
    expect(changes.choiceResults).not.toBe(source.choiceResults);
    expect(changes.actions).not.toBe(source.actions);
    expect((changes.actions as SimpleEncounterRecord["actions"])[0]).not.toBe(source.actions[0]);
  });

  it("clones every complex encounter array without copying the record ID", () => {
    const source = {
      id: 8,
      prompt: 21,
      texts: ["Speak"],
      actions: [{ slot: 0, rawCode: 10, id: 3 }],
      actionResult: 1,
      wordResult: 2,
      groups: [1],
      spellIds: [1401],
      spellResults: [3],
      itemIds: [900],
      itemResults: [4],
      choiceResults: [1],
      wordResults: [2],
      canBackOut: false,
      thief: true,
      maxTimes: 1,
      casteSuccess: 0,
      thiefSuccess: 5,
      thiefFail: 6
    } as ComplexEncounterRecord;

    const changes = encounterCopyChanges(source);

    expect(changes.id).toBeUndefined();
    for (const key of ["texts", "actions", "groups", "spellIds", "spellResults", "itemIds", "itemResults", "choiceResults", "wordResults"] as const) {
      expect(changes[key]).toEqual(source[key]);
      expect(changes[key]).not.toBe(source[key]);
    }
    expect((changes.actions as ComplexEncounterRecord["actions"])[0]).not.toBe(source.actions[0]);
  });
});
