import { describe, expect, it } from "vitest";
import { fixedRecordListWindow } from "./fixedRecordListWindow";

describe("fixedRecordListWindow", () => {
  it("limits the initial render before the viewport is measured", () => {
    expect(fixedRecordListWindow(190, 0, 0)).toEqual({
      startIndex: 0,
      endIndex: 28,
      topSpacer: 0,
      bottomSpacer: 9396
    });
  });

  it("windows fixed-height rows with overscan", () => {
    expect(fixedRecordListWindow(190, 580, 1160)).toEqual({
      startIndex: 16,
      endIndex: 34,
      topSpacer: 928,
      bottomSpacer: 9048
    });
  });
});
