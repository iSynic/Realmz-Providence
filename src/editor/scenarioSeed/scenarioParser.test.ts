import { describe, expect, it } from "vitest";
import type { ParseContext } from "./parsePrimitives";
import { parseScenario, parseScenarioGlobalMacros, parseScenarioStart } from "./scenarioParser";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed metadata parser", () => {
  it("normalizes scenario identity, author metadata, and start location", () => {
    const ctx = context();

    expect(parseScenario({
      id: "drowned-bell",
      name: "The Drowned Bell",
      start: { landLevel: 0, x: 36, y: 47 },
      globalMacros: { start: "opening", death: 4 },
      author: "Providence",
      version: "1.0",
      date: "2026-07-13",
      email: "author@example.com",
      web: "https://example.com",
      description: "A haunted island scenario."
    }, "$.scenario", ctx)).toEqual({
      id: "drowned-bell",
      name: "The Drowned Bell",
      start: { landLevel: 0, x: 36, y: 47 },
      globalMacros: { start: "opening", death: 4 },
      author: "Providence",
      version: "1.0",
      date: "2026-07-13",
      email: "author@example.com",
      web: "https://example.com",
      description: "A haunted island scenario."
    });
    expect(ctx.errors).toEqual([]);
  });

  it("accepts only the five source-backed global macro hooks", () => {
    const ctx = context();

    expect(parseScenarioGlobalMacros({ start: "opening", temple: 7, reserved: 9 }, "$.scenario.globalMacros", ctx)).toEqual({
      start: "opening",
      temple: 7
    });
    expect(ctx.errors).toEqual(["$.scenario.globalMacros.reserved is not a supported scenario seed field."]);
  });

  it("preserves ordered start field and coordinate diagnostics", () => {
    const ctx = context();

    expect(parseScenarioStart({
      landLevel: -1,
      x: 90,
      y: -1,
      facing: "north"
    }, "$.scenario.start", ctx)).toEqual({ landLevel: -1, x: 90, y: -1 });
    expect(ctx.errors).toEqual([
      "$.scenario.start.facing is not a supported scenario seed field.",
      "$.scenario.start.landLevel must be greater than or equal to 0.",
      "$.scenario.start.x must be less than or equal to 89.",
      "$.scenario.start.y must be greater than or equal to 0."
    ]);
  });

  it("retains the fallback name while reporting missing required metadata", () => {
    const ctx = context();

    expect(parseScenario({}, "$.scenario", ctx)).toEqual({ name: "Untitled Scenario" });
    expect(ctx.errors).toEqual(["$.scenario.name must be a non-empty string."]);
  });
});
