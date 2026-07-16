import { describe, expect, it } from "vitest";
import { settingsEditorModeForUsage } from "./ActionSettingsWorkbench";

describe("ActionSettingsWorkbench storage presentation", () => {
  it("uses caller-proven typed fields only for stored rows with one action shape", () => {
    expect(settingsEditorModeForUsage({ exists: true, status: "in-use", primaryShape: "teleport" })).toBe("typed");
    expect(settingsEditorModeForUsage({ exists: true, status: "shared", primaryShape: "teleport" })).toBe("typed");
  });

  it("does not assign a speculative action shape to unused or conflicting rows", () => {
    expect(settingsEditorModeForUsage({ exists: true, status: "unused", primaryShape: null })).toBe("raw");
    expect(settingsEditorModeForUsage({ exists: true, status: "conflict", primaryShape: "teleport" })).toBe("raw");
  });

  it("routes missing rows back to their calling steps for creation", () => {
    expect(settingsEditorModeForUsage({ exists: false, status: "missing", primaryShape: "battle" })).toBe("caller");
  });
});
