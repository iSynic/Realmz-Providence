import { describe, expect, it } from "vitest";
import { createBrowserProject } from "../browser/project";
import type { TriggerRecord } from "../types";
import type { ScenarioSeed } from "./contracts";
import { compileScenarioSeedProject } from "./projectCompiler";

function trigger(source: string, recordIndex: number): TriggerRecord {
  return {
    id: `${source}:${recordIndex}`,
    source,
    levelType: null,
    levelIndex: null,
    recordIndex,
    active: true,
    doorid: 0,
    percent: 100,
    coordinate: null,
    actions: []
  };
}

describe("scenario seed project compiler", () => {
  it("clones a base template and applies final scenario metadata without mutating the template", () => {
    const template = createBrowserProject("Template Source");
    template.source = {
      origin: "imported",
      sourcePath: "fixture://template",
      rawSourcesDir: "template-raw",
      immutable: true,
      files: [{ name: "Data BD", relativePath: "Data BD", bytes: 12, sha256: "fixture", role: "supported-binary", editable: true }]
    };
    template.messages = [{ id: 8, text: "Preserved", authored: true }];
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      baseTemplate: "fixture",
      scenario: {
        id: "scenario:compiled",
        name: "Compiled Scenario",
        start: { landLevel: 2, x: 7, y: 9 },
        author: "Providence",
        version: "1.0",
        description: "Compiler boundary"
      }
    };

    const result = compileScenarioSeedProject(seed, {
      baseTemplates: { fixture: template },
      appVersion: "test-compiler",
      now: "2026-07-13T00:00:00.000Z"
    }, ["parser warning"]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project).not.toBe(template);
    expect(result.project.appVersion).toBe("test-compiler");
    expect(result.project.scenario).toMatchObject({
      id: "scenario:compiled",
      name: "Compiled Scenario",
      projectPath: "seed://compiled-scenario.providence",
      importedAt: "2026-07-13T00:00:00.000Z"
    });
    expect(result.project.scenario.shell).toMatchObject({ landLevel: 2, lookX: 7, lookY: 9, sourceFile: "Compiled Scenario" });
    expect(result.project.scenario.contactInfo).toMatchObject({ scenarioName: "Compiled Scenario", author: "Providence", version: "1.0" });
    expect(result.project.source).toMatchObject({ origin: "imported", sourcePath: "seed://compiled-scenario", rawSourcesDir: "template-raw", immutable: false });
    expect(result.project.source.files).toEqual(template.source.files);
    expect(result.project.source.files).not.toBe(template.source.files);
    expect(result.project.messages).toEqual(template.messages);
    expect(template.scenario.name).toBe("Template Source");
    expect(template.source.immutable).toBe(true);
    expect(result.warnings).toContain("parser warning");
  });

  it("creates a schema-v5 authored project without a compatibility annex", () => {
    const result = compileScenarioSeedProject({
      schemaVersion: 1,
      scenario: { name: "Authored From Zero", globalMacros: { start: "opening" } },
      extraActionPoints: [{ key: "opening", id: 9, steps: [] }]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.schemaVersion).toBe(5);
    expect(result.project.source).toEqual({
      origin: "authored",
      sourcePath: "seed://authored-from-zero",
      rawSourcesDir: "",
      immutable: false,
      files: []
    });
    expect(result.project.scenario.globalMacroHooks).toMatchObject({ authored: true });
    expect(result.project.scenario.globalMacroHooks?.slots.find((slot) => slot.slot === 0)?.door).toBe(9);
    expect(result.project.scenario.globalMacroHooks?.rawBytes).toBeUndefined();
  });

  it("replaces only trigger domains explicitly supplied by the seed", () => {
    const template = createBrowserProject("Trigger Template");
    template.triggers = [trigger("Data DD", 3), trigger("Data ED3", 4)];
    const seed: ScenarioSeed = {
      schemaVersion: 1,
      baseTemplate: "fixture",
      scenario: { name: "Trigger Merge" },
      extraActionPoints: [{ id: 9, steps: [] }]
    };

    const result = compileScenarioSeedProject(seed, { baseTemplates: { fixture: template } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.project.triggers).toHaveLength(2);
    expect(result.project.triggers[0]).toMatchObject({ source: "Data DD", recordIndex: 3 });
    expect(result.project.triggers[1]).toMatchObject({ source: "Data ED3", recordIndex: 9 });
    expect(result.project.triggers.some((candidate) => candidate.source === "Data ED3" && candidate.recordIndex === 4)).toBe(false);
    expect(template.triggers.map((candidate) => candidate.recordIndex)).toEqual([3, 4]);
  });

  it("returns a structured diagnostic when the requested base template is unavailable", () => {
    const result = compileScenarioSeedProject({
      schemaVersion: 1,
      baseTemplate: "missing",
      scenario: { name: "Missing Template" }
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain('Base template "missing" was not provided by the caller.');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "unresolved-base-template",
      family: "base template",
      key: "missing"
    }));
  });
});
