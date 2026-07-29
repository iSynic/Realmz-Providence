import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  compatibleGuidedOperations,
  makeFlowStatement,
  makeOperationStatement,
  StatementInsertToolbar,
  type GuidedCatalogOperation
} from "./GuidedBehaviorEditor";

const operation = (changes: Partial<GuidedCatalogOperation> = {}): GuidedCatalogOperation => ({
  id: "core.presentation.text",
  label: "Show Text",
  category: "Presentation",
  roles: ["action"],
  yields: true,
  mutates: false,
  parameters: { text: "string", wait: "bool?" },
  result: "void",
  summary: "Shows text.",
  ...changes
});

describe("guided behavior authoring", () => {
  it("offers every catalog operation compatible with an action behavior", () => {
    const operations = compatibleGuidedOperations("action", "run");
    expect(operations.length).toBeGreaterThan(15);
    expect(operations.map((entry) => entry.id)).toContain("core.map.teleport");
    expect(operations.map((entry) => entry.id)).toContain("core.encounter.start-battle");
    expect(operations.map((entry) => entry.id)).toContain("core.inventory.change-shop");
    expect(operations.map((entry) => entry.id)).not.toContain("core.combat.snapshot");
  });

  it("offers the extended combat surface to compatible spell behaviors", () => {
    const operations = compatibleGuidedOperations("spell", "effect");
    expect(operations.map((entry) => entry.id)).toContain("core.combat.fumble");
    expect(operations.map((entry) => entry.id)).toContain("core.combat.change-monsters");
    expect(operations.map((entry) => entry.id)).toContain("core.combat.spawn-monsters");
  });

  it("keeps pure rule hooks free of yielding and mutating operations", () => {
    const operations = compatibleGuidedOperations("rule-modifier", "modify");
    expect(operations.every((entry) => !entry.yields && !entry.mutates)).toBe(true);
    expect(operations.map((entry) => entry.id)).toEqual(["core.state.read"]);
  });

  it("creates required typed arguments without silently enabling optional arguments", () => {
    expect(makeOperationStatement(operation())).toEqual({
      kind: "operation",
      capability: "core.presentation.text",
      arguments: {
        text: { kind: "literal", value: "" }
      }
    });
  });

  it("creates a named result for query operations", () => {
    expect(makeOperationStatement(operation({
      id: "core.inventory.wealth",
      label: "Party Wealth",
      parameters: {},
      result: "WealthSnapshot"
    }))).toMatchObject({
      result: "party_wealth",
      declaredType: "wealth-snapshot"
    });
  });

  it("creates each structural block as canonical Safe AST", () => {
    expect(makeFlowStatement("if", "action-outcome", [], [])).toMatchObject({
      kind: "if",
      then: [],
      else: []
    });
    expect(makeFlowStatement("match", "action-outcome", [], [])).toMatchObject({
      kind: "match",
      cases: [{ body: [] }],
      default: []
    });
    expect(makeFlowStatement("for", "action-outcome", [], [])).toMatchObject({
      kind: "for",
      name: "item",
      body: []
    });
    expect(makeFlowStatement("return", "action-outcome", [], [])).toEqual({
      kind: "return",
      value: {
        kind: "record",
        fields: {
          kind: { kind: "literal", value: "continue" }
        }
      }
    });
  });

  it("renders separate accessible insertion controls for actions and logic", () => {
    const markup = renderToStaticMarkup(
      createElement(StatementInsertToolbar, {
        operations: [operation()],
        helpers: [],
        stateDefinitions: [],
        returnType: "action-outcome",
        onInsert: () => undefined
      })
    );
    expect(markup).toContain(">Add Action</button>");
    expect(markup).toContain(">Add Logic</button>");
  });
});
