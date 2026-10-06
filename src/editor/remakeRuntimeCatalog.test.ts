import { describe, expect, it } from "vitest";
import { createBrowserProject } from "./browser/project";
import { validateRemakeRuntime } from "./remakeRuntimeCatalog";

describe("Remake runtime catalog", () => {
  it("validates extension APIs and configuration schemas", () => {
    const project = createBrowserProject("Runtime catalog");
    project.remakeRuntime.requiredExtensions = [{
      id: "scenario.runtime-fixture",
      apiVersion: 1,
      configuration: { marker: "test" }
    }];
    expect(validateRemakeRuntime(project)).toEqual([]);

    project.remakeRuntime.requiredExtensions[0].configuration = { unknown: true };
    expect(validateRemakeRuntime(project)).toContain(
      "Remake extension 'scenario.runtime-fixture' configuration does not allow 'unknown'."
    );
  });

  it("rejects unavailable semantic operations before export", () => {
    const project = createBrowserProject("Missing operation");
    project.remakeRuntime.semanticActions = [{
      targetKind: "trigger",
      recordId: "missing",
      slot: 0,
      operation: "scenario.missing.operation",
      parameters: {}
    }];
    const errors = validateRemakeRuntime(project);
    expect(errors.some((error) => error.includes("unavailable record"))).toBe(true);
    expect(errors.some((error) => error.includes("unavailable semantic operation"))).toBe(true);
  });
});
