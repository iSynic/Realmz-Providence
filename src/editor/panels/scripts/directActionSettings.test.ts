import { describe, expect, it } from "vitest";
import type { Project } from "../../types";
import {
  defaultDirectActionValue,
  directActionSettingsFor,
  directActionStoredValue,
  directActionSummary
} from "./directActionSettings";

const project = {
  messages: [{ id: 15, text: "The tide answers." }],
  triggers: [],
  assetCatalog: { tilesets: [], pictures: [], icons: [], sounds: [] }
} as unknown as Project;

describe("directActionSettings", () => {
  it("uses documented choice domains for finite direct values", () => {
    const settings = directActionSettingsFor(35);

    expect(settings.kind).toBe("choice");
    if (settings.kind !== "choice") throw new Error("expected choice settings");
    expect(settings.options.map((option) => option.value)).toEqual([1, 2, 3, 4]);
    expect(defaultDirectActionValue(35)).toBe(1);
    expect(directActionSummary(project, null, 35, 3)).toBe("Choice 3");
  });

  it("reports ignored ID fields as step-only actions", () => {
    expect(directActionSettingsFor(49)).toMatchObject({
      kind: "none",
      label: "No settings"
    });
    expect(directActionSummary(project, null, 49, 28)).toBe("No settings · preserved ID 28");
  });

  it("resolves target labels and signed runtime modes", () => {
    expect(directActionSummary(project, null, 1, -15)).toBe(
      "String 15 · Continue without waiting"
    );
  });

  it("keeps sign behavior separate from numeric magnitude", () => {
    expect(directActionStoredValue(4, false)).toBe(4);
    expect(directActionStoredValue(4, true)).toBe(-4);
    expect(directActionStoredValue(-4, false)).toBe(4);
    expect(directActionStoredValue(0, true)).toBe(0);
  });
});
