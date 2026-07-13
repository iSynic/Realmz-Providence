import { describe, expect, it } from "vitest";
import { parseScenarioSeed } from "./parser";

describe("scenario seed parser stage", () => {
  it("preserves every supported top-level collection", () => {
    const collections = {
      maps: [],
      messages: [],
      quests: [],
      battles: [],
      monsters: [],
      treasures: [],
      shops: [],
      items: [],
      assets: [],
      simpleEncounters: [],
      complexEncounters: [],
      thiefEncounters: [],
      timedEncounters: [],
      spells: [],
      races: [],
      castes: [],
      actionPoints: [],
      extraActionPoints: []
    };

    const result = parseScenarioSeed({
      schemaVersion: 1,
      baseTemplate: "blank",
      scenario: { name: "Parser Boundary" },
      ...collections
    });

    expect(result).toEqual({
      ok: true,
      seed: {
        schemaVersion: 1,
        baseTemplate: "blank",
        scenario: { name: "Parser Boundary" },
        ...collections
      },
      warnings: []
    });
  });

  it("rejects unsupported schema versions before compilation", () => {
    const result = parseScenarioSeed({
      schemaVersion: 2,
      scenario: { name: "Future Seed" }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("$.schemaVersion must be 1.");
  });
});
