import { describe, expect, it } from "vitest";
import {
  nextResourceId,
  nextScenarioResourceIdInRange,
  SCENARIO_DISPLAY_PICTURE_MAX_ID,
  SCENARIO_PICTURE_MIN_ID,
  SCENARIO_SPLASH_PICTURE_ID
} from "./mediaAssets";

describe("scenario asset resource allocation", () => {
  it("never allocates the reserved title picture ID to an ordinary scenario picture", () => {
    const occupied = Array.from(
      { length: SCENARIO_DISPLAY_PICTURE_MAX_ID - SCENARIO_PICTURE_MIN_ID + 1 },
      (_, index) => ({ kind: "picture" as const, resourceType: "PICT", resourceId: SCENARIO_PICTURE_MIN_ID + index })
    );

    expect(nextResourceId(occupied, "picture")).toBe(SCENARIO_SPLASH_PICTURE_ID + 1);
    expect(() => nextScenarioResourceIdInRange(occupied, "picture")).toThrow("No unused scenario picture resource ID remains");
  });
});
