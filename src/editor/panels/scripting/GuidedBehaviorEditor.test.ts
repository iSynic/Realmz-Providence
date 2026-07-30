import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  collectionQueryOperations,
  compatibleGuidedOperations,
  ExpressionField,
  guidedOperationKind,
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
    expect(operations.map((entry) => entry.id)).toContain("core.inventory.items");
    expect(operations.map((entry) => entry.id)).toContain("core.definitions.monster");
    expect(operations.map((entry) => entry.id)).toContain("core.definitions.encounter");
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

  it("creates typed definition and item-instance snapshot results", () => {
    expect(makeOperationStatement(
      compatibleGuidedOperations("action", "run")
        .find((entry) => entry.id === "core.inventory.items")!
    )).toMatchObject({
      result: "party_item_instances",
      declaredType: "item-instance-snapshot-array"
    });
    expect(makeOperationStatement(
      compatibleGuidedOperations("action", "run")
        .find((entry) => entry.id === "core.definitions.monster")!
    )).toMatchObject({
      result: "monster_definition",
      declaredType: "monster-definition-snapshot"
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

  it("renders collection queries without flattening them into fixed values", () => {
    const markup = renderToStaticMarkup(
      createElement(ExpressionField, {
        label: "Initial value",
        expectedType: "bool",
        expression: {
          kind: "collection",
          operation: "any",
          collection: { kind: "variable", scope: "local", name: "members" },
          itemName: "member",
          predicate: {
            kind: "member",
            object: { kind: "variable", scope: "local", name: "member" },
            member: "alive"
          }
        },
        stateDefinitions: [],
        onChange: () => undefined
      })
    );
    expect(markup).toContain(">Collection query</option>");
    expect(markup).toContain(">Any item matches</option>");
    expect(markup).toContain('value="members"');
    expect(markup).toContain('value="alive"');
    expect(markup).not.toContain(">False</option>");
  });

  it("limits collection query choices to the requested result type", () => {
    expect(collectionQueryOperations("bool")).toEqual(["any", "all"]);
    expect(collectionQueryOperations("int")).toEqual(["count"]);
    expect(collectionQueryOperations("character-snapshot-array")).toEqual(["filter"]);
    expect(collectionQueryOperations("character-snapshot")).toEqual(["find"]);
  });

  it("labels presentation yields as presentation rather than data queries", () => {
    expect(guidedOperationKind(operation())).toBe("Presentation");
    expect(guidedOperationKind(operation({
      id: "core.inventory.take-wealth",
      category: "Inventory and Economy",
      mutates: true
    }))).toBe("Command");
    expect(guidedOperationKind(operation({
      id: "core.inventory.wealth",
      category: "Inventory and Economy",
      mutates: false
    }))).toBe("Query");
  });
});
