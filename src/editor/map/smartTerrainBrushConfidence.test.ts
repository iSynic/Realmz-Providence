import { describe, expect, it } from "vitest";
import { smartTerrainCellConfidence } from "./smartTerrainBrush";

describe("smart terrain cell confidence", () => {
  it("separates reviewed, corpus-supported, low-confidence, and unresolved choices", () => {
    expect(smartTerrainCellConfidence("curated-mask", null)).toBe("reviewed");
    expect(smartTerrainCellConfidence("corpus-mask-prior", 4)).toBe("supported");
    expect(smartTerrainCellConfidence("corpus-role", null)).toBe("low");
    expect(smartTerrainCellConfidence("fallback", null)).toBe("unresolved");
  });
});
