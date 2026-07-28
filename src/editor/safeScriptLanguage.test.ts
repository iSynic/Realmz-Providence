import { describe, expect, it } from "vitest";
import { parseSafeScript, printSafeScript } from "./safeScriptLanguage";
import type { RemakeScript } from "./types";

const definition: RemakeScript = {
  id: "scenario.example.offer",
  name: "Offer quest",
  documentation: "Quest vertical slice",
  tier: "safe",
  apiVersion: 1,
  parameters: [],
  returnType: "void",
  requestedCapabilities: [],
  stateSchema: {},
  sourceMap: {},
  ast: null,
  source: null
};

describe("safe GDScript subset", () => {
  it("parses, prints, and reparses the quest vertical slice", () => {
    const source = `func offer_quest() -> void:
    var accepted: int = await choose("Help the town?", ["Yes", "No"])
    if accepted == 0:
        write_quest(42, 1)
        await show_text("The quest has begun.")
        await teleport("land", 2, 10, 6)
        await start_battle(7)
    return
`;
    const parsed = parseSafeScript(source, definition);
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.requestedCapabilities).toEqual([
      "core.encounter.start-battle",
      "core.map.teleport",
      "core.presentation.choice",
      "core.presentation.text",
      "core.state.write"
    ]);
    const printed = printSafeScript(parsed.program!);
    const reparsed = parseSafeScript(printed, definition);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.program).toEqual(parsed.program);
  });

  it("keeps forbidden syntax as an actionable draft", () => {
    const parsed = parseSafeScript(
      "func unsafe() -> void:\n    while true:\n        return\n",
      definition
    );
    expect(parsed.program).toBeNull();
    expect(parsed.diagnostics.some((entry) => entry.message.includes("not available"))).toBe(true);
  });

  it("rejects arrays beyond the hard bound", () => {
    const values = Array.from({ length: 257 }, (_, index) => index).join(", ");
    const parsed = parseSafeScript(
      `func too_many() -> void:\n    var values: Array[int] = [${values}]\n`,
      definition
    );
    expect(parsed.program).toBeNull();
    expect(parsed.diagnostics.some((entry) => entry.message.includes("at most 256"))).toBe(true);
  });
});
