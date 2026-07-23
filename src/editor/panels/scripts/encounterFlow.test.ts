import { describe, expect, it } from "vitest";
import {
  buildEncounterDecisionSources,
  encounterActionAt,
  encounterActionIsPlayerObservable,
  encounterResultColumnRows,
  encounterResultColumnSummary,
  encounterResultStatus,
  resultActionBaseCode,
  resultActionOptionsFor,
  resultStatusCounts,
  signedResultActionCode,
  updateEncounterActionRow
} from "./encounterFlow";
import type { EncounterActionRow } from "../../types";

describe("encounter result flow", () => {
  const actions: EncounterActionRow[] = [
    { slot: 0, rawCode: 1, id: 12 },
    { slot: 8, rawCode: 24, id: 0 },
    { slot: 16, rawCode: 200, id: 7 },
    { slot: 24, rawCode: 9, id: 200 }
  ];

  it("classifies visible, empty, missing, and out-of-range result paths", () => {
    expect(encounterResultStatus(actions, 1)).toBe("visible");
    expect(encounterResultStatus(actions, 2)).toBe("empty");
    expect(encounterResultStatus(actions, 3)).toBe("empty");
    expect(encounterResultStatus(actions, 0)).toBe("missing");
    expect(encounterResultStatus(actions, 5)).toBe("out-of-range");
    expect(resultStatusCounts(actions)).toEqual({ visible: 2, empty: 2, missing: 0, "out-of-range": 0 });
  });

  it("treats keep-codes and dispatcher no-ops as non-observable", () => {
    expect(encounterActionIsPlayerObservable(actions[1])).toBe(false);
    expect(encounterActionIsPlayerObservable(actions[2])).toBe(false);
    expect(encounterActionIsPlayerObservable(actions[0])).toBe(true);
  });

  it("builds fixed eight-row result columns and incoming summaries", () => {
    const rows = encounterResultColumnRows(actions, 1);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ slot: 8, rawCode: 24, id: 0 });
    expect(rows[7]).toEqual({ slot: 15, rawCode: 0, id: 0 });
    expect(encounterResultColumnSummary(actions, 0, [{
      key: "choice-0",
      label: "Choice 0",
      detail: "",
      result: 1,
      resultIndex: 0,
      status: "visible"
    }])).toMatchObject({ status: "visible", firstAction: "Display String", incoming: 1 });
  });
});

describe("encounter decision sources", () => {
  it("maps simple choices to their fixed result columns", () => {
    const sources = buildEncounterDecisionSources({
      recordKind: "simple",
      texts: ["Open the door", "Leave"],
      actionResult: 0,
      wordResult: 0,
      groups: [],
      spellIds: [],
      spellResults: [],
      itemIds: [],
      itemResults: [],
      choiceResults: [1, 0, 4, 5],
      thief: false,
      rogueId: 0,
      actions: [{ slot: 0, rawCode: 1, id: 10 }, { slot: 24, rawCode: 9, id: 200 }]
    });

    expect(sources.map((source) => [source.key, source.resultIndex, source.status])).toEqual([
      ["choice-0", 0, "visible"],
      ["choice-1", null, "missing"],
      ["choice-2", 3, "visible"],
      ["choice-3", null, "out-of-range"]
    ]);
  });

  it("keeps complex response families routed to authored result numbers", () => {
    const sources = buildEncounterDecisionSources({
      recordKind: "complex",
      texts: ["Turn the wheel", "", "", "", "", "", "", "", "awaken"],
      actionResult: 1,
      wordResult: 2,
      groups: [1],
      spellIds: [17],
      spellResults: [3],
      itemIds: [901],
      itemResults: [4],
      choiceResults: [],
      thief: false,
      rogueId: 0,
      actions: [
        { slot: 0, rawCode: 1, id: 1 },
        { slot: 8, rawCode: 1, id: 2 },
        { slot: 16, rawCode: 17, id: 3 },
        { slot: 24, rawCode: 10, id: 4 }
      ]
    });

    expect(sources.map((source) => [source.key, source.result])).toEqual([
      ["action-picker", 1],
      ["word-phrase", 2],
      ["spell-0", 3],
      ["item-0", 4]
    ]);
    expect(sources.every((source) => source.status === "visible")).toBe(true);
  });
});

describe("encounter action row updates", () => {
  it("creates, sorts, updates, and removes sparse action rows immutably", () => {
    const original = [{ slot: 8, rawCode: 1, id: 2 }];
    const inserted = updateEncounterActionRow(original, 0, { rawCode: 9, id: 200 });
    expect(inserted.map((row) => row.slot)).toEqual([0, 8]);
    expect(original).toEqual([{ slot: 8, rawCode: 1, id: 2 }]);
    expect(encounterActionAt(inserted, 0)).toEqual({ slot: 0, rawCode: 9, id: 200 });
    expect(updateEncounterActionRow(inserted, 0, { rawCode: 0, id: 0 })).toEqual([{ slot: 8, rawCode: 1, id: 2 }]);
  });

  it("retains progression requirements only on Remake media actions", () => {
    const sound = updateEncounterActionRow([], 0, {
      rawCode: 9,
      id: 321,
      mediaRequiredForProgression: true
    });
    expect(sound[0].mediaRequiredForProgression).toBe(true);

    const picture = updateEncounterActionRow(sound, 0, { rawCode: -27 });
    expect(picture[0].mediaRequiredForProgression).toBe(true);

    const message = updateEncounterActionRow(picture, 0, { rawCode: 1 });
    expect(message[0]).not.toHaveProperty("mediaRequiredForProgression");

    const unmarkedSound = updateEncounterActionRow(message, 0, { rawCode: 9 });
    expect(unmarkedSound[0]).not.toHaveProperty("mediaRequiredForProgression");
  });
});

describe("encounter result action opcodes", () => {
  it("normalizes signed and invalid opcode values", () => {
    expect(resultActionBaseCode(-24)).toBe(24);
    expect(resultActionBaseCode(Number.NaN)).toBe(0);
    expect(signedResultActionCode(24, true)).toBe(-24);
    expect(signedResultActionCode(-24, false)).toBe(24);
    expect(signedResultActionCode(0, true)).toBe(0);
  });

  it("preserves imported unknown opcodes as the first selectable option", () => {
    const options = resultActionOptionsFor(999);

    expect(options[0].code).toBe(999);
    expect(options.some((option) => option.code === 0)).toBe(true);
    expect(resultActionOptionsFor(24)[0].code).toBe(0);
  });
});
