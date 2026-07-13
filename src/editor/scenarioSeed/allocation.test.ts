import { describe, expect, it } from "vitest";
import type { ScenarioSeed } from "../scenarioSeed";
import {
  addKey,
  allocateRecordIds,
  allocateScenarioSeed,
  nextOpenId,
  resolveRef
} from "./allocation";
import { createScenarioSeedCompilerContext } from "./compilerContext";

describe("scenario seed deterministic allocation", () => {
  it("preserves explicit IDs and fills the lowest open IDs in source order", () => {
    const context = createScenarioSeedCompilerContext();
    const records = [
      { key: "first" },
      { key: "explicit", id: 2 },
      { key: "second" }
    ];

    allocateRecordIds(records, "message", context.messages, context.allocations.messages, context);

    expect(records).toEqual([
      { key: "first", id: 0 },
      { key: "explicit", id: 2 },
      { key: "second", id: 1 }
    ]);
    expect(context.allocations.messages).toEqual([
      { key: "first", id: 0, explicit: false },
      { key: "explicit", id: 2, explicit: true },
      { key: "second", id: 1, explicit: false }
    ]);
  });

  it("honors minimum IDs and reports duplicate keys without replacing the first value", () => {
    const context = createScenarioSeedCompilerContext();
    const keys = new Map<string, number>();

    expect(nextOpenId(new Set([0, 1, 3]), 1)).toBe(2);
    addKey(keys, "door", 4, "message", context);
    addKey(keys, "door", 9, "message", context);

    expect(keys.get("door")).toBe(4);
    expect(context.diagnostics).toEqual([expect.objectContaining({
      severity: "error",
      code: "duplicate-key",
      family: "message",
      key: "door"
    })]);
  });

  it("resolves numeric and keyed references with stable unresolved diagnostics", () => {
    const context = createScenarioSeedCompilerContext();
    context.battles.set("gate", 7);

    expect(resolveRef(3, context.battles, "battle", context)).toBe(3);
    expect(resolveRef("gate", context.battles, "battle", context)).toBe(7);
    expect(resolveRef("missing", context.battles, "battle", context)).toBe(0);
    expect(context.diagnostics[0]).toMatchObject({
      severity: "error",
      code: "unresolved-reference",
      family: "battle",
      key: "missing"
    });
  });

  it("allocates item ranges and seed-wide map, region, and action point topology", () => {
    const context = createScenarioSeedCompilerContext();
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      scenario: { name: "Allocation test" },
      items: [
        { key: "lens" },
        { key: "key", itemId: 805 }
      ],
      maps: [{
        key: "depths",
        levelType: "dungeon",
        index: 3,
        regions: [{ key: "door", x: 4, y: 5 }],
        operations: [{ kind: "fill", tile: 40 }]
      }],
      actionPoints: [{
        key: "enter-depths",
        map: "depths",
        at: "stairs",
        steps: []
      }]
    };

    allocateScenarioSeed(seed, context, {
      operationRegions: () => [{ key: "stairs", x: 8, y: 9 }]
    });

    expect(seed.items).toEqual([
      { key: "lens", id: 0, itemId: 800 },
      { key: "key", id: 5, itemId: 805 }
    ]);
    expect(context.items).toEqual(new Map([["lens", 800], ["key", 805]]));
    expect(context.maps.get("depths")).toEqual({ levelType: "dungeon", index: 3 });
    expect(context.maps.get("dungeon:3")).toEqual({ levelType: "dungeon", index: 3 });
    expect(context.regions.get("door")).toEqual({ levelType: "dungeon", index: 3, x: 4, y: 5 });
    expect(context.regions.get("stairs")).toEqual({ levelType: "dungeon", index: 3, x: 8, y: 9 });
    expect(context.actionPoints.get("enter-depths")).toBe(0);
    expect(context.actionPointTargets.get("enter-depths")).toEqual({
      levelType: "dungeon",
      levelIndex: 3,
      recordIndex: 0
    });
    expect(context.allocations.maps).toEqual([{ key: "depths", levelType: "dungeon", index: 3, explicit: true }]);
    expect(context.allocations.regions.map(({ key, x, y }) => ({ key, x, y }))).toEqual([
      { key: "door", x: 4, y: 5 },
      { key: "stairs", x: 8, y: 9 }
    ]);
  });

  it("reports invalid scenario item ranges during allocation", () => {
    const context = createScenarioSeedCompilerContext();
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      scenario: { name: "Invalid item" },
      items: [{ key: "stock-item", itemId: 799 }]
    };

    allocateScenarioSeed(seed, context, { operationRegions: () => [] });

    expect(context.items.has("stock-item")).toBe(false);
    expect(context.diagnostics).toEqual([expect.objectContaining({
      severity: "error",
      code: "invalid-item-id",
      family: "item",
      key: "stock-item"
    })]);
  });
});
