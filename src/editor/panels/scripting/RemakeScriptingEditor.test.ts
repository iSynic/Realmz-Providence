import { describe, expect, it } from "vitest";
import {
  nextBehaviorIdentity,
  sandboxTemplate
} from "./RemakeScriptingEditor";

describe("Remake scripting tier transitions", () => {
  it("starts sandboxed copies with the reducer contract Remake executes", () => {
    const source = sandboxTemplate();
    expect(source).toContain(
      "func step(event: Dictionary, state: Dictionary, context) -> Dictionary:"
    );
    expect(source).toContain("\"kind\": \"continue\"");
  });

  it("chooses the first unused stable behavior identity", () => {
    expect(nextBehaviorIdentity("City of Bywater", [
      { id: "scenario.city-of-bywater.behavior-1" },
      { id: "scenario.city-of-bywater.behavior-3" }
    ])).toEqual({
      id: "scenario.city-of-bywater.behavior-2",
      sequence: 2
    });
  });
});
