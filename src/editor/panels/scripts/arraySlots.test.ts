import { describe, expect, it } from "vitest";
import { updateArraySlot } from "./arraySlots";

describe("encounter array slot updates", () => {
  it("extends numeric arrays with zeroes without mutating the source", () => {
    const source = [4];

    expect(updateArraySlot(source, 3, 9, 4)).toEqual([4, 0, 0, 9]);
    expect(source).toEqual([4]);
  });

  it("extends text arrays with empty strings", () => {
    expect(updateArraySlot(["first"], 2, "third", 3)).toEqual(["first", "", "third"]);
  });
});
