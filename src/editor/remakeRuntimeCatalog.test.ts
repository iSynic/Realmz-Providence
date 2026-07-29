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

  it("rejects behavior hooks that have no runtime boundary", () => {
    const project = createBrowserProject("Unavailable hook");
    project.remakeRuntime.behaviors = [{
      id: "scenario.unavailable.item-hook",
      name: "Inspect hook",
      description: "An intentionally unavailable hook.",
      kind: "entry",
      role: "item",
      hook: "inspect",
      tier: "safe",
      apiVersion: 2,
      behaviorVersion: 1,
      stateSchemaVersion: 1,
      parameters: [],
      returnType: "item-outcome",
      requestedCapabilities: [],
      stateSchema: {},
      sourceMap: {},
      ast: {
        kind: "function",
        name: "inspect_hook",
        parameters: [],
        returnType: "item-outcome",
        body: [{ kind: "return", value: { kind: "literal", value: { kind: "used" } } }]
      },
      source: null
    }];

    expect(validateRemakeRuntime(project)).toContain(
      "Scenario behavior 'scenario.unavailable.item-hook' hook 'inspect' is not connected "
      + "to a runtime boundary for role 'item'."
    );
  });

  it("validates behavior attachment signatures before export", () => {
    const project = createBrowserProject("Behavior attachment");
    project.triggers.push({
      id: "Data DD:0:1",
      recordIndex: 1,
      source: "Data DD",
      active: true,
      coordinate: { x: 1, y: 1 },
      targetX: 1,
      targetY: 1,
      landid: 0,
      doorid: 0,
      levelType: "land",
      levelIndex: 0,
      percent: 100,
      actions: []
    });
    project.remakeRuntime.behaviors = [{
      id: "scenario.valid.action",
      name: "Action",
      description: "A bound action.",
      kind: "entry",
      role: "action",
      hook: "run",
      tier: "safe",
      apiVersion: 2,
      behaviorVersion: 1,
      stateSchemaVersion: 1,
      parameters: [{ name: "message", valueType: "string", maxLength: null }],
      returnType: "action-outcome",
      requestedCapabilities: [],
      stateSchema: {},
      sourceMap: {},
      ast: {
        kind: "function",
        name: "action",
        parameters: [{ name: "message", valueType: "string", maxLength: null }],
        returnType: "action-outcome",
        body: [{ kind: "return", value: { kind: "literal", value: { kind: "continue" } } }]
      },
      source: null
    }];
    project.remakeRuntime.behaviorBindings = [{
      id: "binding.valid.action",
      targetKind: "trigger",
      recordId: "Data DD:0:1",
      slot: 0,
      role: "action",
      hook: "run",
      behaviorId: "scenario.valid.action",
      arguments: {},
      priority: 100
    }];

    expect(validateRemakeRuntime(project)).toContain(
      "Scenario behavior binding 'binding.valid.action' requires an argument binding for 'message'."
    );
  });
});
