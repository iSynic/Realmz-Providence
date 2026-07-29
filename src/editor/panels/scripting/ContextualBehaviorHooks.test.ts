import { describe, expect, it } from "vitest";
import SCENARIO_API_CATALOG from "../../../../schemas/remake-scenario-capabilities.v2.json";
import { SCENARIO_LIFECYCLE_HOOKS } from "../ScenarioPanel";
import { ITEM_BEHAVIOR_HOOKS } from "../economy/ItemCatalogWorkbench";
import { SPELL_BEHAVIOR_HOOKS } from "../rules/SpellRulesEditor";

describe("contextual scenario behavior hooks", () => {
  it("offers every runtime-connected lifecycle hook from the Scenario tool", () => {
    expect(SCENARIO_LIFECYCLE_HOOKS.map((hook) => hook.id)).toEqual([
      "campaign-start",
      "campaign-resume",
      "campaign-complete",
      "map-enter",
      "map-leave",
      "party-moved",
      "rest-start",
      "rest-complete",
      "time-advanced",
      "battle-start",
      "battle-complete",
      "character-defeated",
      "party-defeated"
    ]);
  });

  it("offers only runtime-connected spell and item hooks in their domain editors", () => {
    expect(SPELL_BEHAVIOR_HOOKS.map((hook) => hook.id)).toEqual([
      "validate",
      "cast",
      "effect",
      "tick",
      "expire"
    ]);
    expect(ITEM_BEHAVIOR_HOOKS.map((hook) => hook.id)).toEqual([
      "use-field",
      "use-combat",
      "equip",
      "unequip",
      "attack",
      "defense",
      "passive"
    ]);
    const roles = Object.fromEntries(
      SCENARIO_API_CATALOG.roles.map((role) => [role.id, role.runtimeHooks])
    );
    expect(roles.lifecycle).toEqual(
      SCENARIO_LIFECYCLE_HOOKS.map((hook) => hook.id)
    );
    expect(roles.spell).toEqual(SPELL_BEHAVIOR_HOOKS.map((hook) => hook.id));
    expect(roles.item).toEqual(ITEM_BEHAVIOR_HOOKS.map((hook) => hook.id));
  });
});
