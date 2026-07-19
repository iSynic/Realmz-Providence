import { describe, expect, it } from "vitest";
import type { ScenarioSeed } from "./contracts";
import { createScenarioSeedCompilerContext } from "./compilerContext";
import { compileScenarioSeedScripts } from "./scriptCompiler";

function seed(overrides: Partial<ScenarioSeed>): ScenarioSeed {
  return {
    schemaVersion: 1,
    scenario: { name: "Compiler Test" },
    ...overrides
  };
}

describe("scenario seed script compiler", () => {
  it("compiles semantic encounter and Action Point steps through one stage", () => {
    const context = createScenarioSeedCompilerContext();
    context.messages.set("warning", 7);

    const result = compileScenarioSeedScripts(seed({
      simpleEncounters: [{
        id: 2,
        options: [{
          label: "Listen",
          steps: [{ kind: "message", message: "warning" }]
        }]
      }],
      actionPoints: [{
        recordIndex: 3,
        levelType: "land",
        levelIndex: 0,
        x: 4,
        y: 5,
        steps: [{ kind: "message", message: "warning" }]
      }],
      extraActionPoints: [{
        id: 9,
        steps: [{ kind: "message", message: "warning" }]
      }]
    }), context);

    expect(result.simpleEncounters[0].actions).toEqual([
      { slot: 0, rawCode: 1, id: 7 }
    ]);
    expect(result.simpleEncounters[0].rawBytes).toBeUndefined();
    expect(result.triggers).toHaveLength(2);
    expect(result.triggers[0]).toMatchObject({
      source: "Data DD",
      recordIndex: 3,
      coordinate: { x: 4, y: 5 },
      actions: [{ slot: 0, rawCode: 1, code: 1, id: 7 }]
    });
    expect(result.triggers[1]).toMatchObject({
      source: "Data ED3",
      recordIndex: 9,
      actions: [{ slot: 0, rawCode: 1, code: 1, id: 7 }]
    });
    expect(result.extracodes).toEqual([]);
  });

  it("preserves deterministic EDCD allocation across encounters and triggers", () => {
    const context = createScenarioSeedCompilerContext();

    const result = compileScenarioSeedScripts(seed({
      simpleEncounters: [{
        id: 0,
        options: [{
          label: "Enter",
          steps: [{ kind: "teleport", landLevel: 1, x: 2, y: 3 }]
        }]
      }],
      complexEncounters: [{
        id: 0,
        results: [{
          result: 1,
          steps: [{ kind: "alterGameTime", mode: "offset", days: 1 }]
        }]
      }],
      actionPoints: [{
        recordIndex: 0,
        x: 0,
        y: 0,
        steps: [{ kind: "randomMessage", low: 10, high: 11 }]
      }]
    }), context);

    expect(result.extracodes.map(({ id, values }) => ({ id, values }))).toEqual([
      { id: 0, values: [1, 2, 3, 0, 0] },
      { id: 1, values: [2, 1, 0, 0, 0] },
      { id: 2, values: [10, 11, 0, 0, 0] }
    ]);
    expect(result.complexEncounters[0].rawBytes).toBeUndefined();
    expect(result.complexEncounters[0].choiceResults).toBeUndefined();
    expect(result.complexEncounters[0].wordResults).toBeUndefined();
  });

  it("resolves semantic map regions into trigger location and identity", () => {
    const context = createScenarioSeedCompilerContext();
    context.maps.set("island", { levelType: "land", index: 2 });
    context.regions.set("tower-door", { levelType: "land", index: 2, x: 8, y: 9 });

    const result = compileScenarioSeedScripts(seed({
      actionPoints: [{
        key: "tower-entry",
        map: "island",
        at: "tower-door",
        steps: []
      }]
    }), context);

    expect(result.triggers[0]).toMatchObject({
      id: "land:2:ap:0",
      levelType: "land",
      levelIndex: 2,
      recordIndex: 0,
      doorid: 20908,
      coordinate: { x: 8, y: 9 },
      targetX: 8,
      targetY: 9
    });
    expect(context.errors).toEqual([]);
  });

  it("retains context diagnostics for Extra Action Point-only operations", () => {
    const context = createScenarioSeedCompilerContext();
    context.monsters.set("ghost", 3);

    const result = compileScenarioSeedScripts(seed({
      actionPoints: [{
        recordIndex: 1,
        x: 1,
        y: 1,
        steps: [{ kind: "causeRout", monsters: ["ghost"] }]
      }]
    }), context);

    expect(result.triggers[0].actions[0]).toMatchObject({ rawCode: 123, id: 0 });
    expect(context.errors).toEqual([
      "causeRout can only be authored inside a battle or monster Extra Action Point macro."
    ]);
    expect(context.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "invalid-action-point-context",
      family: "action point"
    });
  });
});
