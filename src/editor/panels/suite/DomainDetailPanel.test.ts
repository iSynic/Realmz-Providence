import { describe, expect, it } from "vitest";
import { entitySubtitle } from "./DomainDetailPanel";

describe("DomainDetailPanel", () => {
  it("summarizes resource-backed entities for list navigation", () => {
    expect(entitySubtitle({
      type: "picture",
      editState: "reference",
      summary: { type: "PICT", resourceId: 300, bytes: 2048, family: "landlook" }
    })).toBe("PICT 300 | 2.0 KB | landlook");
  });

  it("summarizes indexed records and text previews", () => {
    expect(entitySubtitle({
      type: "item-reference",
      editState: "source-backed",
      summary: { index: 4, recordBytes: 100 }
    })).toBe("entry 4 | 100 bytes | source-backed");
    expect(entitySubtitle({
      type: "message",
      editState: "editable",
      summary: { textPreview: "The bell tolls." }
    })).toBe("The bell tolls. | editable");
  });
});
