import { describe, expect, it } from "vitest";
import type { EdcdRowUsage } from "../../edcdRows";
import type { Ed3ReachabilityRow, Project, TriggerRecord } from "../../types";
import {
  authorFacingExtraActionKind,
  actionSettingsTitleForShape,
  authorSettingsWarning,
  clampRealmzCoordinate,
  combatMacroActionNote,
  combatMacroActionOpcodes,
  combatMacroContextLabel,
  combatMacroContextFor,
  humanActionValueLabel,
  textEditorNavigationLabel,
  type CombatMacroContext
} from "./actionPointPresentation";

function context(kind: CombatMacroContext["kind"]): CombatMacroContext {
  return { kind, references: [], rootType: null };
}

describe("action point presentation policy", () => {
  it("classifies battle, monster, and mixed macro callers from project records", () => {
    const trigger = { source: "Data ED3", recordIndex: 12 } as TriggerRecord;
    const project = {
      battles: [{ id: 4, battleMacro: -12, grid: [0, 1, 2] }],
      monsters: [{ id: 9, displayName: "Drowned Captain", deathMacro: 12 }],
      monsterSets: []
    } as unknown as Project;

    const context = combatMacroContextFor(project, trigger, null);

    expect(context?.kind).toBe("mixed");
    expect(context?.references.map((reference) => reference.key)).toEqual(["battle:4", "monster:Data MD:9"]);
    expect(context?.references[0]).toMatchObject({ runnable: true, detail: "Runnable negative battle macro; 2 placed monster slot(s)." });
    expect(context?.references[1]?.detail).toContain("Drowned Captain defeat macro");
  });

  it("uses reachability when a combat macro has no direct project caller", () => {
    const trigger = { source: "Data ED3", recordIndex: 7 } as TriggerRecord;
    const project = { battles: [], monsters: [], monsterSets: [] } as unknown as Project;
    const reachability = { rootType: "monster-root" } as Ed3ReachabilityRow;

    expect(combatMacroContextFor(project, trigger, reachability)).toMatchObject({
      kind: "monster",
      references: [],
      rootType: "monster-root"
    });
    expect(combatMacroContextFor(project, { ...trigger, source: "Data DD" }, reachability)).toBeNull();
  });

  it("presents runtime context ahead of imported classification labels", () => {
    expect(authorFacingExtraActionKind("Likely Padding", context("battle"))).toBe("Battle Macro");
    expect(authorFacingExtraActionKind("Battle / Monster / Item Action")).toBe("Source-Linked Extra Action");
    expect(authorFacingExtraActionKind("Imported Runtime Mutation")).toBe("Runtime Residue");
    expect(authorFacingExtraActionKind("Unknown Classification")).toBe("Unlinked Extra Action");
  });

  it("keeps navigation labels and map coordinates author-facing and bounded", () => {
    expect(textEditorNavigationLabel("messages")).toBe("Strings");
    expect(textEditorNavigationLabel("option-labels")).toBe("Option Labels");
    expect(textEditorNavigationLabel("scrolling-text")).toBe("Scrolling Text");
    expect(textEditorNavigationLabel("unknown")).toBe("Text");
    expect(clampRealmzCoordinate(-4)).toBe(0);
    expect(clampRealmzCoordinate(41.9)).toBe(41);
    expect(clampRealmzCoordinate(120)).toBe(89);
    expect(clampRealmzCoordinate(Number.NaN)).toBe(0);
  });

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
