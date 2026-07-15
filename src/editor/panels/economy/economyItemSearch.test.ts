import { describe, expect, it } from "vitest";
import type { ItemReferenceOption } from "../../itemReferences";
import { filterEconomyItemOptions } from "./economyItemSearch";

const options: ItemReferenceOption[] = [
  { key: "sword", value: 17, label: "Iron Sword", category: "weapon", detail: "Melee weapon", summary: "Plain steel blade", sourceState: "Built-in", iconId: 17 },
  { key: "lens", value: 912, label: "Beacon Lens", category: "supply", detail: "Quest item", summary: "Focuses moonlight", sourceState: "Scenario-authored", iconId: 912 }
];

describe("filterEconomyItemOptions", () => {
  it("combines the shared item matcher with the active Economy category", () => {
    expect(filterEconomyItemOptions(options, "weapon", "iron").map((option) => option.value)).toEqual([17]);
    expect(filterEconomyItemOptions(options, "weapon", "lens")).toEqual([]);
  });

  it("matches IDs, summaries, and source state when all categories are visible", () => {
    expect(filterEconomyItemOptions(options, "all", "912").map((option) => option.value)).toEqual([912]);
    expect(filterEconomyItemOptions(options, "all", "moonlight").map((option) => option.value)).toEqual([912]);
    expect(filterEconomyItemOptions(options, "all", "scenario-authored").map((option) => option.value)).toEqual([912]);
  });
});
