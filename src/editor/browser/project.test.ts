import { describe, expect, it } from "vitest";
import { createBrowserProject, validateBrowserProject } from "./project";
import { expectedAuthoredScenarioManifestFiles } from "./scenarioPackage";

describe("browser project native manifest validation", () => {
  it("uses the authored compiler manifest instead of source inventory", () => {
    const project = createBrowserProject("Authored Validation");
    project.source.origin = "authored";
    project.source.files.push({
      name: "ANNEX POISON",
      relativePath: "ANNEX POISON",
      bytes: 1,
      sha256: "fixture",
      role: "pass-through",
      editable: false
    });

    const validation = validateBrowserProject(project);
    const expected = expectedAuthoredScenarioManifestFiles(project, "windows-realmz-folder");

    expect(validation.exportableFiles).toEqual(expected);
    expect(validation.passThroughFiles).toEqual([]);
    expect(validation.exportableFiles).toContain("Scenario");
    expect(validation.exportableFiles).toContain("Scenario.rsrc");
    expect(validation.exportableFiles).toContain("Data Solids");
    expect(validation.exportableFiles).not.toContain("ANNEX POISON");
    expect(validation.warnings).not.toContain("Data Solids is missing; special negative tile solidity will remain unknown.");
  });

  it("keeps imported compatibility validation source-driven", () => {
    const project = createBrowserProject("Imported Validation");
    project.source.origin = "imported";
    project.source.files = [
      {
        name: "Data SD2",
        relativePath: "Data SD2",
        bytes: 800,
        sha256: "fixture",
        role: "supported-binary",
        editable: true
      },
      {
        name: "Legacy Notes",
        relativePath: "Legacy Notes",
        bytes: 10,
        sha256: "fixture",
        role: "pass-through",
        editable: false
      }
    ];

    const validation = validateBrowserProject(project);

    expect(validation.exportableFiles).toEqual(["Data SD2"]);
    expect(validation.passThroughFiles).toEqual(["Legacy Notes"]);
    expect(validation.exportableFiles).not.toContain("Scenario.rsrc");
  });
});
