import { describe, expect, it } from "vitest";
import type { ScenarioSeed } from "../scenarioSeed";
import type { ParseContext } from "./parsePrimitives";
import { validateMaxArrayLength, validateScenarioSeed } from "./validation";

function parseContext(): ParseContext {
  return { errors: [], warnings: [] };
}

describe("scenario seed cross-record validation", () => {
  it("reports duplicate records, item identities, maps, and unresolved starts in stable order", () => {
    const context = parseContext();
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      scenario: { name: "Invalid", start: { landLevel: 4, x: 1, y: 1 } },
      messages: [{ id: 2, key: "same", text: "One" }, { id: 2, key: "same", text: "Two" }],
      items: [{ key: "one", id: 1 }, { key: "two", itemId: 801 }],
      maps: [{ key: "same-map", index: 0 }, { key: "same-map", index: 0 }]
    };

    validateScenarioSeed(seed, context);

    expect(context.errors).toEqual([
      "$.messages contains duplicate id 2.",
      "$.messages contains duplicate key same.",
      "$.items contains duplicate scenario item row 1.",
      "$.items contains duplicate itemId 801.",
      "$.maps contains duplicate map land:0.",
      "$.maps contains duplicate key same-map.",
      "$.scenario.start.landLevel 4 does not resolve to a declared land map."
    ]);
  });

  it("keeps reusable array-limit validation in the parsing stage", () => {
    const context = parseContext();

    validateMaxArrayLength([1, 2, 3], "$.values", 2, context);

    expect(context.errors).toEqual(["$.values can contain at most 2 entries."]);
  });
});
