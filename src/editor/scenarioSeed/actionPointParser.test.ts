import { describe, expect, it } from "vitest";
import {
  parseActionPoint,
  parseExtraActionPoint,
  parseStep
} from "./actionPointParser";
import type { ParseContext } from "./parsePrimitives";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed Action Point parser", () => {
  it("normalizes a keyed map Action Point and semantic teleport step", () => {
    const ctx = context();

    expect(parseActionPoint({
      key: "tower-door",
      levelType: "land",
      levelIndex: 2,
      x: 30,
      y: 12,
      percent: 80,
      steps: [{
        kind: "teleport",
        map: "bell-depths",
        at: "entry",
        sound: "bell",
        message: "arrival",
        teleportOnly: true
      }]
    }, "$.actionPoints[0]", ctx)).toEqual({
      key: "tower-door",
      levelType: "land",
      levelIndex: 2,
      x: 30,
      y: 12,
      percent: 80,
      steps: [{
        kind: "teleport",
        map: "bell-depths",
        at: "entry",
        sound: "bell",
        message: "arrival",
        teleportOnly: true
      }]
    });
    expect(ctx.errors).toEqual([]);
  });

  it("keeps the eight-slot and map-location invariants at the parser boundary", () => {
    const ctx = context();

    parseActionPoint({
      levelType: "dungeon",
      levelIndex: 0,
      x: 90,
      steps: new Array(9).fill({ kind: "returnGosub" })
    }, "$.actionPoints[0]", ctx);

    expect(ctx.errors).toEqual([
      "$.actionPoints[0].steps can contain at most 8 Realmz action slots.",
      "$.actionPoints[0].x must be less than or equal to 89.",
      "$.actionPoints[0] must provide x/y or at."
    ]);
  });

  it("validates numeric patch targets without weakening keyed target support", () => {
    const numericContext = context();
    const keyedContext = context();

    expect(parseStep({
      kind: "patchActionPoint",
      target: 4,
      source: "replacement"
    }, "$.actionPoints[0].steps[0]", numericContext)).toEqual({
      kind: "patchActionPoint",
      target: 4,
      source: "replacement"
    });
    expect(numericContext.errors).toEqual([
      "$.actionPoints[0].steps[0].level is required when target is a numeric Action Point ID.",
      "$.actionPoints[0].steps[0].levelType is required when target is a numeric Action Point ID."
    ]);

    parseStep({
      kind: "patchActionPoint",
      target: "door",
      source: "replacement",
      level: 1,
      levelType: "land"
    }, "$.actionPoints[0].steps[0]", keyedContext);
    expect(keyedContext.errors).toEqual([
      "$.actionPoints[0].steps[0].level and levelType must be omitted when target is a keyed Action Point."
    ]);
  });

  it("parses extra Action Points through the same step contract", () => {
    const ctx = context();

    expect(parseExtraActionPoint({
      key: "failure-macro",
      id: 12,
      steps: [{ kind: "message", message: "locked" }]
    }, "$.extraActionPoints[0]", ctx)).toEqual({
      key: "failure-macro",
      id: 12,
      steps: [{ kind: "message", message: "locked" }]
    });
    expect(ctx.errors).toEqual([]);
  });
});
