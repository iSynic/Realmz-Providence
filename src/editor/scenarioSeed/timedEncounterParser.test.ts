import { describe, expect, it } from "vitest";
import type { ParseContext } from "./parsePrimitives";
import { parseTimedEncounter, parseTimedLocation } from "./timedEncounterParser";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed timed encounter parser", () => {
  it("normalizes keyed references and a bounded land location", () => {
    const ctx = context();

    expect(parseTimedEncounter({
      key: "bell-tolls",
      day: 3,
      increment: 2,
      percent: 75,
      macro: "ring-bell",
      requiredItem: "beacon-lens",
      requiredQuest: 4,
      location: { kind: "land", level: 1, randomRectangle: 2, x: 44, y: 45 }
    }, "$.timedEncounters[0]", ctx)).toEqual({
      key: "bell-tolls",
      day: 3,
      increment: 2,
      percent: 75,
      macro: "ring-bell",
      requiredItem: "beacon-lens",
      requiredQuest: 4,
      location: { kind: "land", level: 1, randomRectangle: 2, x: 44, y: 45 }
    });
    expect(ctx.errors).toEqual([]);
  });

  it("preserves ordered range and coordinate-pair diagnostics", () => {
    const ctx = context();

    expect(parseTimedLocation({
      kind: "dungeon",
      level: -1,
      randomRectangle: 20,
      x: 90
    }, "$.timedEncounters[0].location", ctx)).toEqual({
      kind: "dungeon",
      level: -1,
      randomRectangle: 20,
      x: 90
    });
    expect(ctx.errors).toEqual([
      "$.timedEncounters[0].location.level must be greater than or equal to 0.",
      "$.timedEncounters[0].location.randomRectangle must be less than or equal to 19.",
      "$.timedEncounters[0].location.x must be less than or equal to 89.",
      "$.timedEncounters[0].location.x and $.timedEncounters[0].location.y must be provided together."
    ]);
  });

  it("falls back to any while reporting an unsupported location kind", () => {
    const ctx = context();

    expect(parseTimedLocation({ kind: "sea" }, "$.location", ctx)).toEqual({ kind: "any" });
    expect(ctx.errors).toEqual(["$.location.kind must be any, land, or dungeon."]);
  });
});
