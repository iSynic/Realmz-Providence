import { describe, expect, it } from "vitest";
import { parseSafeScript, printSafeScript } from "./safeScriptLanguage";
import type { RemakeBehaviorDefinition } from "./types";

const definition: RemakeBehaviorDefinition = {
  id: "scenario.example.offer",
  name: "Offer quest",
  description: "Quest vertical slice",
  kind: "entry",
  role: "action",
  hook: "run",
  tier: "safe",
  apiVersion: 2,
  behaviorVersion: 1,
  stateSchemaVersion: 1,
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

  it("authors the gold, deadline, and party-condition quest through typed queries", () => {
    const actionDefinition = {
      ...definition,
      returnType: "action-outcome" as const
    };
    const parsed = parseSafeScript(
      `func pay_captain() -> ActionOutcome:
    var wealth: WealthSnapshot = await party_wealth()
    var now: TimeSnapshot = await current_time()
    var party: Array[CharacterSnapshot] = await party_members()
    var healthy: bool = any(party, member, member.alive)
    if wealth.gold >= 500 and now.day <= 3 and healthy:
        var paid: bool = await take_wealth(500)
        write_variable("paid_captain", true)
        await show_text("The captain accepts your payment.")
    else:
        await show_text("You have returned too late or without the money.")
    return {"kind": "continue"}
`,
      actionDefinition
    );
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.requestedCapabilities).toEqual([
      "core.character.party",
      "core.inventory.take-wealth",
      "core.inventory.wealth",
      "core.map.time",
      "core.presentation.text",
      "core.state.write"
    ]);
  });

  it("rejects yielding operations in a non-yielding monster AI role", () => {
    const monsterAi = {
      ...definition,
      id: "scenario.example.monster-ai",
      role: "monster-ai" as const,
      hook: "decide",
      returnType: "void" as const
    };
    const parsed = parseSafeScript(
      `func decide() -> void:
    var combat: CombatSnapshot = await combat_snapshot()
    return
`,
      monsterAi
    );
    expect(parsed.program).toBeNull();
    expect(parsed.diagnostics.some((entry) => entry.message.includes("cannot use yielding operation"))).toBe(true);
  });

  it("round-trips role outcomes and dynamic typed records", () => {
    const actionDefinition = {
      ...definition,
      returnType: "action-outcome" as const
    };
    const parsed = parseSafeScript(
      `func finish_offer() -> ActionOutcome:
    var outcome: int = 2
    return {"kind": "branch", "outcome": outcome}
`,
      actionDefinition
    );
    expect(parsed.diagnostics).toEqual([]);
    const printed = printSafeScript(parsed.program!);
    const reparsed = parseSafeScript(printed, actionDefinition);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.program).toEqual(parsed.program);
  });

  it("round-trips optional operation arguments without dropping their names", () => {
    const parsed = parseSafeScript(
      `func optional_commands() -> void:
    await play_sound(101, true)
    var paid: bool = await take_wealth(500, 2, 1, false)
    return
`,
      definition
    );
    expect(parsed.diagnostics).toEqual([]);
    const printed = printSafeScript(parsed.program!);
    expect(printed).toContain("play_sound(101, true)");
    expect(printed).toContain("take_gold(500, 2, 1, false)");
    const reparsed = parseSafeScript(printed, definition);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.program).toEqual(parsed.program);
  });

  it("queries exact item instances and authored definitions with typed fields", () => {
    const actionDefinition = {
      ...definition,
      returnType: "action-outcome" as const
    };
    const parsed = parseSafeScript(
      `func inspect_inventory() -> ActionOutcome:
    var items: Array[ItemInstanceSnapshot] = await inventory_items()
    var charged: bool = any(items, item, item.charges > 0)
    var monster: MonsterDefinitionSnapshot = await definitions_monster(1)
    if charged and monster.maximumHealth > 0:
        await show_text(monster.name)
    return {"kind": "continue"}
`,
      actionDefinition
    );
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.requestedCapabilities).toEqual([
      "core.definitions.monster",
      "core.inventory.items",
      "core.presentation.text"
    ]);
    const printed = printSafeScript(parsed.program!);
    const reparsed = parseSafeScript(printed, actionDefinition);
    expect(reparsed.diagnostics).toEqual([]);
    expect(reparsed.program).toEqual(parsed.program);
  });
});
