import { describe, expect, it } from "vitest";
import type { QuestFlagModel } from "../../questUsage";
import { filterQuestFlags } from "./StoryFlagsWorkbench";

function quest(id: number, label: string, detail = ""): QuestFlagModel {
  return {
    id,
    label,
    note: "",
    authored: false,
    uses: detail ? [{
      key: `quest:${id}`,
      questId: id,
      category: "tested",
      label: "Test flag",
      detail,
      sourceLabel: `Action Point ${id}`,
      sourceKind: "Data DD",
      entityId: null,
      sortKey: `quest:${id}`
    }] : [],
    counts: { set: 0, cleared: 0, tested: detail ? 1 : 0, incremented: 0, required: 0, branches: 0, unknown: 0 },
    warnings: [],
    contextRefs: []
  };
}

describe("filterQuestFlags", () => {
  const quests = [
    quest(4, "Bell Awakened", "Tests the drowned bell state."),
    quest(17, "Keeper Released", "Set by Extra Action Point 9."),
    quest(28, "Salt Gate Open")
  ];

  it("matches labels, numeric IDs, and decoded usage metadata", () => {
    expect(filterQuestFlags(quests, "bell state").map((entry) => entry.id)).toEqual([4]);
    expect(filterQuestFlags(quests, "17").map((entry) => entry.id)).toEqual([17]);
    expect(filterQuestFlags(quests, "extra action").map((entry) => entry.id)).toEqual([17]);
  });

  it("returns every matching flag without the former eighteen-row cap", () => {
    const many = Array.from({ length: 30 }, (_, index) => quest(index, `Flag ${index}`));
    expect(filterQuestFlags(many, "flag")).toHaveLength(30);
  });
});
