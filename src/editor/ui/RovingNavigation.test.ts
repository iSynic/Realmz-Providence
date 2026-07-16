import { describe, expect, it } from "vitest";
import { rovingNavigationKeyboardTarget } from "./RovingNavigation";

describe("rovingNavigationKeyboardTarget", () => {
  const options = [
    { value: "first" },
    { value: "disabled", disabled: true },
    { value: "last" }
  ] as const;

  it("wraps enabled horizontal options and skips disabled values", () => {
    expect(rovingNavigationKeyboardTarget(options, "first", "ArrowRight")).toBe("last");
    expect(rovingNavigationKeyboardTarget(options, "last", "ArrowRight")).toBe("first");
    expect(rovingNavigationKeyboardTarget(options, "first", "ArrowLeft")).toBe("last");
  });

  it("uses vertical arrows without consuming horizontal arrows", () => {
    expect(rovingNavigationKeyboardTarget(options, "first", "ArrowDown", "vertical")).toBe("last");
    expect(rovingNavigationKeyboardTarget(options, "first", "ArrowUp", "vertical")).toBe("last");
    expect(rovingNavigationKeyboardTarget(options, "first", "ArrowRight", "vertical")).toBeNull();
  });

  it("supports boundaries and ignores unrelated or empty navigation", () => {
    expect(rovingNavigationKeyboardTarget(options, "last", "Home")).toBe("first");
    expect(rovingNavigationKeyboardTarget(options, "first", "End")).toBe("last");
    expect(rovingNavigationKeyboardTarget(options, "first", "Enter")).toBeNull();
    expect(rovingNavigationKeyboardTarget([], "first", "ArrowRight")).toBeNull();
  });
});
