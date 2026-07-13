import { describe, expect, it } from "vitest";
import { addKey, allocateRecordIds, nextOpenId, resolveRef } from "./allocation";
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
});
