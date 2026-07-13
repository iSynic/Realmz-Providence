import { describe, expect, it } from "vitest";
import {
  monsterRequiredWeaponDisplayCode,
  monsterRequiredWeaponStoredCode,
  updateArraySlot
} from "./monsterReferenceModel";

describe("monster required weapon encoding", () => {
  it("preserves sentinels and round-trips unsigned specific weapon codes", () => {
    expect(monsterRequiredWeaponDisplayCode(0)).toBe(0);
    expect(monsterRequiredWeaponDisplayCode(-1)).toBe(-1);
    expect(monsterRequiredWeaponDisplayCode(-2)).toBe(-2);
    expect(monsterRequiredWeaponDisplayCode(-109)).toBe(147);
    expect(monsterRequiredWeaponStoredCode(147)).toBe(-109);
    expect(monsterRequiredWeaponDisplayCode(monsterRequiredWeaponStoredCode(253))).toBe(253);
  });
});

describe("updateArraySlot", () => {
  it("pads and clips record arrays to their fixed storage length", () => {
    expect(updateArraySlot([1], 2, 7, 4)).toEqual([1, 0, 7, 0]);
    expect(updateArraySlot([1, 2, 3, 4], 1, 9, 3)).toEqual([1, 9, 3]);
  });
});
