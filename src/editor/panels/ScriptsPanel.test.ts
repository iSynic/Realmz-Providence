import { describe, expect, it } from "vitest";
import { isAdvancedScriptStorageEditor, PRIMARY_SCRIPT_EDITOR_TABS } from "./ScriptsPanel";

describe("ScriptsPanel navigation", () => {
  it("keeps Data EDCD storage out of the primary authoring tabs", () => {
    expect(PRIMARY_SCRIPT_EDITOR_TABS.map((tab) => tab.value)).toEqual([
      "action-points",
      "macros",
      "global-macros",
      "quests"
    ]);
    expect(isAdvancedScriptStorageEditor("settings-rows")).toBe(true);
    expect(isAdvancedScriptStorageEditor("action-points")).toBe(false);
  });
});
