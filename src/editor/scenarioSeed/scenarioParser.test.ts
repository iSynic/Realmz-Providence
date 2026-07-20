import { describe, expect, it } from "vitest";
import type { ParseContext } from "./parsePrimitives";
import { parseScenario, parseScenarioGlobalMacros, parseScenarioRestrictions, parseScenarioStart } from "./scenarioParser";

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
      restrictions: {
        description: "Experienced parties only.",
        maxPartyCharacters: 4,
        maxPartyLevel: 20,
        bannedRaces: [1, 30],
        bannedCastes: [2, 29]
      },
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
      restrictions: {
        description: "Experienced parties only.",
        maxPartyCharacters: 4,
        maxPartyLevel: 20,
        bannedRaces: [1, 30],
        bannedCastes: [2, 29]
      },
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

  it("rejects restrictions that cannot fit the native Data RI record", () => {
    const ctx = context();

    expect(parseScenarioRestrictions({
      description: "x".repeat(256),
      maxPartyCharacters: 7,
      maxPartyLevel: -1,
      bannedRaces: [0, 1, 1, 31],
      bannedCastes: [2, 2],
      unknown: true
    }, "$.scenario.restrictions", ctx)).toEqual({
      description: "x".repeat(256),
      maxPartyCharacters: 7,
      maxPartyLevel: -1,
      bannedRaces: [0, 1, 1, 31],
      bannedCastes: [2, 2]
    });
    expect(ctx.errors).toEqual([
      "$.scenario.restrictions.unknown is not a supported scenario seed field.",
      "$.scenario.restrictions.description must contain at most 255 Classic text characters.",
      "$.scenario.restrictions.maxPartyCharacters must be less than or equal to 6.",
      "$.scenario.restrictions.maxPartyLevel must be greater than or equal to 0.",
      "$.scenario.restrictions.bannedRaces[0] must be greater than or equal to 1.",
      "$.scenario.restrictions.bannedRaces contains duplicate ID 1.",
      "$.scenario.restrictions.bannedRaces[3] must be less than or equal to 30.",
      "$.scenario.restrictions.bannedCastes contains duplicate ID 2."
    ]);
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
