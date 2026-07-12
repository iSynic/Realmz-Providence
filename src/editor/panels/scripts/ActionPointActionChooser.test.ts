import { describe, expect, it } from "vitest";
import { actionChooserDefinitionMatchesOpcode } from "./ActionPointActionChooser";
import { scriptActionDefinitionFor } from "./scriptActionCatalog";

describe("action point action chooser", () => {
  it("matches signed variants through their canonical chooser opcode", () => {
    expect(actionChooserDefinitionMatchesOpcode(scriptActionDefinitionFor(23), -23)).toBe(true);
    expect(actionChooserDefinitionMatchesOpcode(scriptActionDefinitionFor(58), -23)).toBe(false);
  });
});
