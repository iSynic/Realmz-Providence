import { describe, expect, it } from "vitest";
import { MINIMUM_SCENARIO_RESOURCE_FORK_BYTES, mergeResourceEntries, parseResourceFork, writeMinimumScenarioResourceFork, writeResourceFork } from "./resourceFork";

describe("browser resource fork merging", () => {
  it("builds the canonical empty scenario resource container", () => {
    const output = writeMinimumScenarioResourceFork();
    const view = new DataView(output.buffer, output.byteOffset, output.byteLength);

    expect(output).toHaveLength(MINIMUM_SCENARIO_RESOURCE_FORK_BYTES);
    expect(parseResourceFork(output)).toEqual([]);
    expect(view.getUint32(0, false)).toBe(16);
    expect(view.getUint32(4, false)).toBe(16);
    expect(view.getUint32(8, false)).toBe(0);
    expect(view.getUint32(12, false)).toBe(30);
    expect(view.getUint16(44, false)).toBe(0xffff);
  });

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
