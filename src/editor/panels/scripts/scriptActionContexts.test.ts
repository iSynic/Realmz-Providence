import { describe, expect, it } from "vitest";
import {
  restrictedScriptActionOpcodes,
  scriptActionAllowedInAnyContext,
  scriptActionAllowedInContext,
  scriptActionContextRestrictionReason
} from "./scriptActionContexts";

describe("script action authoring contexts", () => {
  it("keeps encounter-loop actions on the matching encounter surfaces", () => {
    expect(scriptActionAllowedInContext(34, "simple-encounter")).toBe(true);
    expect(scriptActionAllowedInContext(34, "action-point")).toBe(false);
    expect(scriptActionAllowedInContext(35, "simple-encounter")).toBe(true);
    expect(scriptActionAllowedInContext(35, "complex-encounter")).toBe(false);
    expect(scriptActionAllowedInContext(44, "complex-encounter")).toBe(true);
    expect(scriptActionAllowedInContext(44, "simple-encounter")).toBe(false);
  });

  it("separates battle and monster macro-only actions", () => {
    expect(scriptActionAllowedInContext(126, "battle-macro")).toBe(true);
    expect(scriptActionAllowedInContext(126, "monster-macro")).toBe(false);
    expect(scriptActionAllowedInContext(122, "monster-macro")).toBe(true);
    expect(scriptActionAllowedInContext(122, "battle-macro")).toBe(false);
    expect(scriptActionAllowedInContext(123, "battle-macro")).toBe(true);
    expect(scriptActionAllowedInContext(123, "monster-macro")).toBe(true);
  });

  it("allows unrestricted actions everywhere and mixed combat macros their union", () => {
    expect(scriptActionAllowedInContext(2, "action-point")).toBe(true);
    expect(scriptActionAllowedInContext(2, "simple-encounter")).toBe(true);
    expect(scriptActionAllowedInAnyContext(122, ["battle-macro", "monster-macro"])).toBe(true);
    expect(scriptActionAllowedInAnyContext(126, ["monster-macro"])).toBe(false);
  });

  it("keeps a reviewed ledger of every restricted opcode", () => {
    expect(restrictedScriptActionOpcodes()).toEqual([34, 35, 44, 100, 119, 120, 121, 122, 123, 124, 125, 126, 127]);
    expect(scriptActionContextRestrictionReason(121)).toContain("Monster and Battle Macros");
  });
});
