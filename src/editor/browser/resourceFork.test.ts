import { describe, expect, it } from "vitest";
import { mergeResourceEntries, parseResourceFork, writeResourceFork } from "./resourceFork";

describe("browser resource fork merging", () => {
  it("removes excluded scenario resources while preserving unrelated entries", () => {
    const original = writeResourceFork([
      { resourceType: "PICT", id: 170, name: "Interface override", attributes: 0, data: new Uint8Array([1, 2]) },
      { resourceType: "TEXT", id: 7, name: "Message", attributes: 0, data: new Uint8Array([3, 4]) }
    ]);

    const merged = mergeResourceEntries(original, [], [{ resourceType: "PICT", resourceId: 170 }]);
    const entries = parseResourceFork(merged.bytes);

    expect(entries.some((entry) => entry.resourceType === "PICT" && entry.id === 170)).toBe(false);
    expect(entries.some((entry) => entry.resourceType === "TEXT" && entry.id === 7)).toBe(true);
  });
});
