import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  economyTargetIdFromSelection,
  economyTargetRecordSummary,
  economyTargetRecords,
  includeSelectedEconomyRecord,
  itemOptionName,
  nextEconomyTargetRecordId
} from "./economyRecordModel";

const project = {
  treasures: [
    { id: 4, itemIds: [1, 0, 2], gold: 30, exp: 12 },
    { id: 2, itemIds: [], gold: 0, exp: 0 }
  ],
  shops: [
    { id: 3, itemIds: [1, 2, 0], inflation: 15 }
  ]
} as Project;

describe("economyRecordModel", () => {
  it("orders records and allocates the first available positive ID", () => {
    expect(economyTargetRecords(project, "treasure").map((record) => record.id)).toEqual([2, 4]);
    expect(nextEconomyTargetRecordId(project, "treasure")).toBe(1);
    expect(nextEconomyTargetRecordId(project, "shop")).toBe(1);
  });

  it("keeps an out-of-window selection visible", () => {
    const records = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(includeSelectedEconomyRecord(records, 3, 2).map((record) => record.id)).toEqual([3, 1, 2]);
  });

  it("parses only the selected economy record family", () => {
    expect(economyTargetIdFromSelection("treasure:4", "treasure")).toBe(4);
    expect(economyTargetIdFromSelection("shop:4", "treasure")).toBeNull();
    expect(economyTargetIdFromSelection("treasure:not-a-number", "treasure")).toBeNull();
  });

  it("summarizes economy records and strips IDs from option labels", () => {
    expect(economyTargetRecordSummary(project, "treasure", 4)).toBe("2 item(s), 30 gold, 12 exp");
    expect(economyTargetRecordSummary(project, "shop", 3)).toBe("2 stocked slot(s), 15% inflation");
    expect(itemOptionName({ label: "Beacon Lens (912)" } as never)).toBe("Beacon Lens");
  });
});
