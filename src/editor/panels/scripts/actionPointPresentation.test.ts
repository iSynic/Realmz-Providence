import { describe, expect, it } from "vitest";
import type { EdcdRowUsage } from "../../edcdRows";
import type { ScriptActionDefinition } from "./scriptActionCatalog";
import {
  actionSettingsTitleForShape,
  authorSettingsWarning,
  combatMacroActionNote,
  combatMacroActionOpcodes,
  combatMacroContextLabel,
  humanActionValueLabel,
  type CombatMacroContext
} from "./actionPointPresentation";

function context(kind: CombatMacroContext["kind"]): CombatMacroContext {
  return { kind, references: [], rootType: null };
}

describe("action point presentation policy", () => {
  it("keeps combat macro action sets specific to their runtime context", () => {
    expect(combatMacroActionOpcodes(context("battle"))).toContain(126);
    expect(combatMacroActionOpcodes(context("battle"))).not.toContain(119);
    expect(combatMacroActionOpcodes(context("monster"))).toContain(119);
    expect(combatMacroActionNote(-17, context("monster"))).toContain("destroyed monster's position");
    expect(combatMacroActionNote(-17, context("battle"))).toBeNull();
  });

  it("summarizes macro references without inventing callers", () => {
    const mixed: CombatMacroContext = {
      kind: "mixed",
      rootType: null,
      references: [
        { kind: "battle", key: "battle:1", label: "Battle 1", detail: "" },
        { kind: "monster", key: "monster:1", label: "Monster 1", detail: "" }
      ]
    };

    expect(combatMacroContextLabel(mixed)).toBe("1 battle / 1 monster reference(s)");
    expect(combatMacroContextLabel({ ...context("battle"), rootType: "battle-root" })).toBe("Reachability: battle-root");
  });

  it("uses author-facing settings labels for missing and shared rows", () => {
    const usage = {
      status: "missing",
      callers: [],
      possibleShapes: []
    } as unknown as EdcdRowUsage;

    expect(authorSettingsWarning(usage, "Movement", "raw warning")).toBe(
      "This step references movement settings that do not exist yet. Applying the fields below will create them."
    );
    expect(authorSettingsWarning({ ...usage, status: "shared", callers: [{}, {}] } as EdcdRowUsage, "Choice Dialog", "raw warning"))
      .toBe("These choice dialog settings are shared by 2 steps. Editing them changes every caller.");
  });

  it("normalizes technical labels without losing meaningful qualifiers", () => {
    expect(humanActionValueLabel("Monster ID Number")).toBe("Monster Value Value");
    expect(humanActionValueLabel("ID")).toBe("Value");
    expect(actionSettingsTitleForShape("teleport")).toBe("Movement");
    expect(actionSettingsTitleForShape("unknown", "Custom")).toBe("Custom");
  });
});
