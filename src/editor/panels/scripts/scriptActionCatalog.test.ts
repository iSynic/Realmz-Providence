import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import { actionDefinitionsForCategory, scriptActionSummary } from "./scriptActionCatalog";

const project = {
  triggers: [{ source: "Data ED3", recordIndex: 12, actions: [] }],
  battles: [{ id: 4 }, { id: 8 }],
  messages: [{ id: 7, text: "The enemy has the advantage." }],
  extracodes: [],
  assets: [],
  assetCatalog: { tilesets: [], pictures: [], icons: [], sounds: [] }
} as unknown as Project;

describe("scriptActionSummary battle settings", () => {
  it("describes exact and ranged battles, surprise, feedback, and reward modes", () => {
    expect(scriptActionSummary(project, null, {
      rawCode: 2,
      id: 1,
      parameters: [-4, -8, 0, 7, 5]
    })).toBe('Battle: Surprise · Battle 4 through Battle 8 · Before: "The enemy has the advantage." · Victory points only');
  });

  it("describes the conditional revive-loss Extra Action Point instead of a sound", () => {
    expect(scriptActionSummary(project, null, {
      rawCode: 2,
      id: 1,
      parameters: [4, 0, 12, 0, 10]
    })).toBe("Battle: Battle 4 · Revive after loss, then Extra Action Point 12");
  });
});

describe("script action chooser contexts", () => {
  it("keeps context-only actions out of ordinary Action Point authoring", () => {
    const opcodes = actionDefinitionsForCategory("All").map((definition) => definition.opcode);
    expect(opcodes).not.toContain(34);
    expect(opcodes).not.toContain(122);
    expect(opcodes).not.toContain(126);
  });

  it("offers the matching combat-macro action families", () => {
    const battle = actionDefinitionsForCategory("All", "", ["battle-macro"]).map((definition) => definition.opcode);
    const monster = actionDefinitionsForCategory("All", "", ["monster-macro"]).map((definition) => definition.opcode);
    expect(battle).toContain(126);
    expect(battle).not.toContain(122);
    expect(monster).toContain(122);
    expect(monster).not.toContain(126);
    expect(battle).toContain(123);
    expect(monster).toContain(123);
  });
});
