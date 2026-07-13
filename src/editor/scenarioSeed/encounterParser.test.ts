import { describe, expect, it } from "vitest";
import {
  parseComplexEncounter,
  parseSimpleEncounter,
  parseThiefEncounter
} from "./encounterParser";
import type { ParseContext } from "./parsePrimitives";

function context(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed encounter parser", () => {
  it("normalizes semantic simple encounter options through the shared step parser", () => {
    const ctx = context();

    expect(parseSimpleEncounter({
      key: "harbor-warning",
      prompt: "keeper-warning",
      options: [{
        label: "Ask about the bell",
        steps: [{ kind: "message", message: "keeper-answer" }]
      }],
      canBackOut: true,
      maxTimes: 2,
      casteSuccess: -1
    }, "$.simpleEncounters[0]", ctx)).toEqual({
      key: "harbor-warning",
      prompt: "keeper-warning",
      options: [{
        label: "Ask about the bell",
        steps: [{ kind: "message", message: "keeper-answer" }]
      }],
      canBackOut: true,
      maxTimes: 2,
      casteSuccess: -1
    });
    expect(ctx.errors).toEqual([]);
  });

  it("parses Rogue actions, trap behavior, and lock behavior as one thief encounter", () => {
    const ctx = context();

    expect(parseThiefEncounter({
      id: 3,
      prompt: "sealed-door",
      actions: [{
        kind: "detectTrap",
        modifier: 5,
        success: { message: "trap-found" },
        failure: { result: 2 }
      }],
      trap: {
        armed: true,
        damage: { low: 1, high: 4 },
        disarmChancePerLevel: 10
      },
      lock: { tumblers: 4, openChancePerLevel: 5 }
    }, "$.thiefEncounters[0]", ctx)).toEqual({
      id: 3,
      prompt: "sealed-door",
      actions: [{
        kind: "detectTrap",
        modifier: 5,
        success: { message: "trap-found" },
        failure: { result: 2 }
      }],
      trap: {
        armed: true,
        damage: { low: 1, high: 4 },
        disarmChancePerLevel: 10
      },
      lock: { tumblers: 4, openChancePerLevel: 5 }
    });
    expect(ctx.errors).toEqual([]);
  });

  it("normalizes complex responses and semantic result scripts together", () => {
    const ctx = context();

    expect(parseComplexEncounter({
      key: "drowned-bell",
      prompt: "bell-prompt",
      physicalActions: ["Ring the bell"],
      requiredPhysicalActions: [1],
      physicalResult: 1,
      word: { text: "DROWNED", result: 2 },
      spells: [{ spell: 8, result: 3 }],
      items: [{ item: "beacon-lens", result: 4 }],
      thief: { encounter: "bell-lock" },
      results: [{
        result: 1,
        steps: [{ kind: "message", message: "bell-rings" }]
      }],
      canBackOut: true
    }, "$.complexEncounters[0]", ctx)).toEqual({
      key: "drowned-bell",
      prompt: "bell-prompt",
      physicalActions: ["Ring the bell"],
      requiredPhysicalActions: [1],
      physicalResult: 1,
      word: { text: "DROWNED", result: 2 },
      spells: [{ spell: 8, result: 3 }],
      items: [{ item: "beacon-lens", result: 4 }],
      thief: { encounter: "bell-lock" },
      results: [{
        result: 1,
        steps: [{ kind: "message", message: "bell-rings" }]
      }],
      canBackOut: true
    });
    expect(ctx.errors).toEqual([]);
  });

  it("preserves raw simple encounter slot and semantic-mode diagnostics", () => {
    const ctx = context();

    parseSimpleEncounter({
      options: [],
      texts: ["Leave"],
      actions: [
        { slot: 1, rawCode: 1, id: 10 },
        { slot: 1, rawCode: 2, id: 20 }
      ],
      choiceResults: [5]
    }, "$.simpleEncounters[0]", ctx);

    expect(ctx.errors).toEqual([
      "$.simpleEncounters[0].actions contains duplicate slot 1.",
      "$.simpleEncounters[0].choiceResults[0] must be less than or equal to 4.",
      "$.simpleEncounters[0].options must contain at least one option.",
      "$.simpleEncounters[0] cannot combine semantic options with raw texts, actions, or choiceResults."
    ]);
  });
});
