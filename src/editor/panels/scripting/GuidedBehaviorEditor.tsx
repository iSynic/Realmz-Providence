import { useMemo, useState, type ReactNode } from "react";
import SCENARIO_API_CATALOG_JSON from "../../../../schemas/remake-scenario-capabilities.v2.json";
import type {
  Project,
  RemakeBehaviorDefinition,
  RemakeBehaviorRole,
  RemakeScriptValueType,
  RemakeStateDefinition
} from "../../types";
import { CollapsibleSection, FormField, FormGrid } from "../../ui";
import { CONDITION_LABELS } from "../../rulesCatalog";

type AstNode = Record<string, unknown>;

type CatalogRole = {
  id: RemakeBehaviorRole;
  hooks: string[];
  allowsYield: boolean;
  pureHooks?: string[];
};

export type GuidedCatalogOperation = {
  id: string;
  label: string;
  category: string;
  roles: RemakeBehaviorRole[];
  yields: boolean;
  mutates: boolean;
  parameters: Record<string, string>;
  result: string;
  summary: string;
};

type ScenarioApiCatalog = {
  roles: CatalogRole[];
  stateScopes: string[];
  operations: GuidedCatalogOperation[];
};

const CATALOG = SCENARIO_API_CATALOG_JSON as unknown as ScenarioApiCatalog;

const SCRIPT_TYPES: RemakeScriptValueType[] = [
  "bool",
  "int",
  "float",
  "string",
  "location-snapshot",
  "time-snapshot",
  "wealth-snapshot",
  "character-snapshot",
  "character-snapshot-array",
  "combat-snapshot",
  "bool-array",
  "int-array",
  "float-array",
  "string-array"
];

const OUTCOME_KINDS: Partial<Record<RemakeScriptValueType, string[]>> = {
  "action-outcome": ["continue", "halt", "call", "replace", "return"],
  "encounter-outcome": ["continue", "resolve", "repeat", "close", "branch"],
  "effect-outcome": ["applied", "no-effect", "invalid"],
  "item-outcome": ["used", "rejected", "no-effect", "modified"],
  "monster-decision": ["wait", "move", "attack", "cast", "use-item", "flee"]
};

export function compatibleGuidedOperations(
  role: RemakeBehaviorRole,
  hook: string
): GuidedCatalogOperation[] {
  const roleContract = CATALOG.roles.find((entry) => entry.id === role);
  const pure = Boolean(
    roleContract?.pureHooks?.includes("*")
    || roleContract?.pureHooks?.includes(hook)
  );
  return CATALOG.operations.filter((operation) =>
    operation.roles.includes(role)
    && (roleContract?.allowsYield || !operation.yields)
    && (!pure || (!operation.yields && !operation.mutates))
  );
}

export function makeOperationStatement(operation: GuidedCatalogOperation): AstNode {
  const arguments_: AstNode = {};
  for (const [name, type] of Object.entries(operation.parameters)) {
    if (!type.endsWith("?")) arguments_[name] = defaultExpression(type, name);
  }
  if (operation.id === "core.state.read") {
    arguments_.name = { kind: "literal", value: "story_state" };
  }
  if (operation.id === "core.state.write") {
    arguments_.name = { kind: "literal", value: "story_state" };
  }
  const resultType = scriptTypeForCatalog(operation.result);
  const statement: AstNode = {
    kind: "operation",
    capability: operation.id,
    arguments: arguments_
  };
  if (operation.result !== "void") {
    statement.result = portableName(operation.label);
    statement.declaredType = resultType ?? "string";
  }
  return statement;
}

export function makeFlowStatement(
  kind: string,
  returnType: RemakeScriptValueType,
  helpers: readonly RemakeBehaviorDefinition[],
  stateDefinitions: readonly RemakeStateDefinition[]
): AstNode {
  if (kind === "if") {
    return {
      kind: "if",
      condition: comparisonExpression(),
      then: [],
      else: []
    };
  }
  if (kind === "match") {
    return {
      kind: "match",
      value: { kind: "literal", value: 0 },
      cases: [{ pattern: { kind: "literal", value: 0 }, body: [] }],
      default: []
    };
  }
  if (kind === "for") {
    return {
      kind: "for",
      name: "item",
      collection: { kind: "variable", scope: "local", name: "items" },
      body: []
    };
  }
  if (kind === "declare") {
    return {
      kind: "declare",
      name: "value",
      valueType: "bool",
      value: { kind: "literal", value: false }
    };
  }
  if (kind === "assign") {
    const state = stateDefinitions[0];
    return {
      kind: "assign",
      scope: state ? "persistent" : "local",
      name: state?.name ?? "value",
      value: { kind: "literal", value: state?.defaultValue ?? false }
    };
  }
  if (kind === "call") {
    const helper = helpers[0];
    return {
      kind: "call",
      scriptId: helper?.id ?? "",
      arguments: Object.fromEntries(
        (helper?.parameters ?? []).map((parameter) => [
          parameter.name,
          defaultExpression(parameter.valueType, parameter.name)
        ])
      ),
      ...(helper && helper.returnType !== "void"
        ? {
          result: portableName(helper.name),
          declaredType: helper.returnType
        }
        : {})
    };
  }
  return {
    kind: "return",
    ...(returnType === "void"
      ? {}
      : { value: defaultOutcomeExpression(returnType) })
  };
}

export function GuidedBehaviorEditor({
  project,
  behavior,
  ast,
  onChange,
  onApplyCaptainRecipe
}: {
  project: Project;
  behavior: RemakeBehaviorDefinition;
  ast: AstNode;
  onChange: (ast: AstNode) => void;
  onApplyCaptainRecipe: (ast: AstNode) => void;
}) {
  const operations = useMemo(
    () => compatibleGuidedOperations(behavior.role, behavior.hook),
    [behavior.role, behavior.hook]
  );
  const helpers = project.remakeRuntime.behaviors.filter((entry) =>
    entry.kind === "helper" && entry.id !== behavior.id
  );
  const body = nodeArray(ast.body);

  return (
    <div className="behavior-outline">
      <div className="section-kicker">
        When this {friendlyName(behavior.role)} behavior runs
      </div>
      <StatementListEditor
        project={project}
        statements={body}
        operations={operations}
        helpers={helpers}
        stateDefinitions={project.remakeRuntime.stateDefinitions}
        returnType={behavior.returnType}
        root
        onChange={(next) => onChange({ ...ast, body: next })}
      />
      {behavior.role === "action" && (
        <div className="rules-toolbar">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onApplyCaptainRecipe({
              ...ast,
              body: captainRecipeBody(behavior.returnType)
            })}
          >
            Add Gold + Deadline + Healthy Party Recipe
          </button>
        </div>
      )}
      <p className="rules-help-callout">
        Every compatible Scenario API operation can be added below. Technical IDs stay behind
        friendly labels, typed fields, and project record pickers.
      </p>
    </div>
  );
}

function StatementListEditor({
  project,
  statements,
  operations,
  helpers,
  stateDefinitions,
  returnType,
  root = false,
  onChange
}: {
  project: Project;
  statements: AstNode[];
  operations: GuidedCatalogOperation[];
  helpers: RemakeBehaviorDefinition[];
  stateDefinitions: RemakeStateDefinition[];
  returnType: RemakeScriptValueType;
  root?: boolean;
  onChange: (statements: AstNode[]) => void;
}) {
  const replace = (index: number, statement: AstNode) => {
    onChange(statements.map((entry, entryIndex) => entryIndex === index ? statement : entry));
  };
  const insert = (statement: AstNode) => {
    const last = statements[statements.length - 1];
    const trailingReturn = root && last?.kind === "return"
      ? last
      : null;
    const prefix = trailingReturn ? statements.slice(0, -1) : statements;
    onChange([...prefix, statement, ...(trailingReturn ? [trailingReturn] : [])]);
  };

  return (
    <div className="guided-statement-list">
      {statements.length === 0 ? (
        <div className="rules-help-callout"><span>No steps yet.</span></div>
      ) : (
        <ol className="behavior-outline-list">
          {statements.map((statement, index) => (
            <li key={`${String(statement.kind)}:${index}`}>
              <StatementEditor
                project={project}
                statement={statement}
                operations={operations}
                helpers={helpers}
                stateDefinitions={stateDefinitions}
                returnType={returnType}
                onChange={(next) => replace(index, next)}
              />
              <div className="guided-step-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  disabled={index === 0}
                  onClick={() => onChange(move(statements, index, index - 1))}
                >
                  Move Up
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  disabled={index === statements.length - 1}
                  onClick={() => onChange(move(statements, index, index + 1))}
                >
                  Move Down
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-xs"
                  onClick={() => onChange(statements.filter((_, entryIndex) => entryIndex !== index))}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <StatementInsertToolbar
        operations={operations}
        helpers={helpers}
        stateDefinitions={stateDefinitions}
        returnType={returnType}
        onInsert={insert}
      />
    </div>
  );
}

export function StatementInsertToolbar({
  operations,
  helpers,
  stateDefinitions,
  returnType,
  onInsert
}: {
  operations: GuidedCatalogOperation[];
  helpers: RemakeBehaviorDefinition[];
  stateDefinitions: RemakeStateDefinition[];
  returnType: RemakeScriptValueType;
  onInsert: (statement: AstNode) => void;
}) {
  const [operationId, setOperationId] = useState(operations[0]?.id ?? "");
  const [flowKind, setFlowKind] = useState("if");
  const selected = operations.find((entry) => entry.id === operationId) ?? operations[0];
  const grouped = groupOperations(operations);

  return (
    <div className="guided-insert-toolbar">
      <FormGrid columns={2}>
        <FormField label="Add scenario action">
          <div className="guided-inline-control">
            <select
              value={selected?.id ?? ""}
              onChange={(event) => setOperationId(event.target.value)}
            >
              {[...grouped.entries()].map(([category, entries]) => (
                <optgroup key={category} label={category}>
                  {entries.map((operation) => (
                    <option key={operation.id} value={operation.id}>{operation.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!selected}
              onClick={() => selected && onInsert(makeOperationStatement(selected))}
            >
              Add Action
            </button>
          </div>
        </FormField>
        <FormField label="Add logic">
          <div className="guided-inline-control">
            <select value={flowKind} onChange={(event) => setFlowKind(event.target.value)}>
              <option value="if">If / Otherwise</option>
              <option value="match">Match a value</option>
              <option value="for">For Each</option>
              <option value="declare">Create local variable</option>
              <option value="assign">Set variable</option>
              <option value="call" disabled={helpers.length === 0}>Call helper</option>
              <option value="return">Finish behavior</option>
            </select>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={flowKind === "call" && helpers.length === 0}
              onClick={() => onInsert(makeFlowStatement(
                flowKind,
                returnType,
                helpers,
                stateDefinitions
              ))}
            >
              Add Logic
            </button>
          </div>
        </FormField>
      </FormGrid>
    </div>
  );
}

function StatementEditor({
  project,
  statement,
  operations,
  helpers,
  stateDefinitions,
  returnType,
  onChange
}: {
  project: Project;
  statement: AstNode;
  operations: GuidedCatalogOperation[];
  helpers: RemakeBehaviorDefinition[];
  stateDefinitions: RemakeStateDefinition[];
  returnType: RemakeScriptValueType;
  onChange: (statement: AstNode) => void;
}) {
  const kind = String(statement.kind);
  if (kind === "operation") {
    return (
      <OperationStatementEditor
        project={project}
        statement={statement}
        operations={operations}
        stateDefinitions={stateDefinitions}
        onChange={onChange}
      />
    );
  }
  if (kind === "if") {
    return (
      <CollapsibleSection title="If / Otherwise" eyebrow="Flow" defaultOpen>
        <ConditionEditor
          expression={asNode(statement.condition)}
          stateDefinitions={stateDefinitions}
          onChange={(condition) => onChange({ ...statement, condition })}
        />
        <NestedBlock
          label="Then"
          project={project}
          statements={nodeArray(statement.then)}
          operations={operations}
          helpers={helpers}
          stateDefinitions={stateDefinitions}
          returnType={returnType}
          onChange={(then) => onChange({ ...statement, then })}
        />
        <NestedBlock
          label="Otherwise"
          project={project}
          statements={nodeArray(statement.else)}
          operations={operations}
          helpers={helpers}
          stateDefinitions={stateDefinitions}
          returnType={returnType}
          onChange={(else_) => onChange({ ...statement, else: else_ })}
        />
      </CollapsibleSection>
    );
  }
  if (kind === "for") {
    return (
      <CollapsibleSection title="For Each" eyebrow="Bounded Loop" defaultOpen>
        <FormGrid columns={2}>
          <FormField label="Call each entry">
            <input
              value={String(statement.name ?? "item")}
              onChange={(event) => onChange({ ...statement, name: portableName(event.target.value) })}
            />
          </FormField>
          <ExpressionField
            label="Collection"
            expectedType="string-array"
            expression={asNode(statement.collection)}
            stateDefinitions={stateDefinitions}
            onChange={(collection) => onChange({ ...statement, collection })}
          />
        </FormGrid>
        <NestedBlock
          label="For every entry"
          project={project}
          statements={nodeArray(statement.body)}
          operations={operations}
          helpers={helpers}
          stateDefinitions={stateDefinitions}
          returnType={returnType}
          onChange={(body) => onChange({ ...statement, body })}
        />
      </CollapsibleSection>
    );
  }
  if (kind === "match") {
    const cases = nodeArray(statement.cases);
    return (
      <CollapsibleSection title="Match a Value" eyebrow="Flow" defaultOpen>
        <ExpressionField
          label="Value"
          expectedType="variant"
          expression={asNode(statement.value)}
          stateDefinitions={stateDefinitions}
          onChange={(value) => onChange({ ...statement, value })}
        />
        {cases.map((entry, index) => (
          <NestedBlock
            key={index}
            label={`When value is ${describeExpression(entry.pattern)}`}
            project={project}
            statements={nodeArray(entry.body)}
            operations={operations}
            helpers={helpers}
            stateDefinitions={stateDefinitions}
            returnType={returnType}
            header={(
              <ExpressionField
                label="Case value"
                expectedType="variant"
                expression={asNode(entry.pattern)}
                stateDefinitions={stateDefinitions}
                onChange={(pattern) => onChange({
                  ...statement,
                  cases: cases.map((caseEntry, caseIndex) =>
                    caseIndex === index ? { ...caseEntry, pattern } : caseEntry
                  )
                })}
              />
            )}
            onDelete={() => onChange({
              ...statement,
              cases: cases.filter((_, caseIndex) => caseIndex !== index)
            })}
            onChange={(body) => onChange({
              ...statement,
              cases: cases.map((caseEntry, caseIndex) =>
                caseIndex === index ? { ...caseEntry, body } : caseEntry
              )
            })}
          />
        ))}
        <button
          type="button"
          className="btn btn-secondary btn-xs"
          onClick={() => onChange({
            ...statement,
            cases: [
              ...cases,
              { pattern: { kind: "literal", value: cases.length }, body: [] }
            ]
          })}
        >
          Add Case
        </button>
        <NestedBlock
          label="Otherwise"
          project={project}
          statements={nodeArray(statement.default)}
          operations={operations}
          helpers={helpers}
          stateDefinitions={stateDefinitions}
          returnType={returnType}
          onChange={(default_) => onChange({ ...statement, default: default_ })}
        />
      </CollapsibleSection>
    );
  }
  if (kind === "declare") {
    const valueType = String(statement.valueType ?? "bool") as RemakeScriptValueType;
    return (
      <CollapsibleSection title="Create Local Variable" eyebrow="State" defaultOpen>
        <FormGrid columns={3}>
          <FormField label="Name">
            <input
              value={String(statement.name ?? "")}
              onChange={(event) => onChange({ ...statement, name: portableName(event.target.value) })}
            />
          </FormField>
          <FormField label="Type">
            <select
              value={valueType}
              onChange={(event) => {
                const nextType = event.target.value as RemakeScriptValueType;
                onChange({
                  ...statement,
                  valueType: nextType,
                  value: defaultExpression(nextType, String(statement.name ?? "value"))
                });
              }}
            >
              {SCRIPT_TYPES.map((type) => <option key={type} value={type}>{friendlyName(type)}</option>)}
            </select>
          </FormField>
          <ExpressionField
            label="Initial value"
            expectedType={valueType}
            expression={asNode(statement.value)}
            stateDefinitions={stateDefinitions}
            onChange={(value) => onChange({ ...statement, value })}
          />
        </FormGrid>
      </CollapsibleSection>
    );
  }
  if (kind === "assign") {
    const persistent = statement.scope === "persistent";
    return (
      <CollapsibleSection title="Set Variable" eyebrow="State" defaultOpen>
        <FormGrid columns={3}>
          <FormField label="Variable kind">
            <select
              value={persistent ? "persistent" : "local"}
              onChange={(event) => onChange({
                ...statement,
                scope: event.target.value,
                name: event.target.value === "persistent"
                  ? stateDefinitions[0]?.name ?? ""
                  : "value"
              })}
            >
              <option value="persistent">Story state</option>
              <option value="local">Local variable</option>
            </select>
          </FormField>
          <FormField label="Variable">
            {persistent && stateDefinitions.length > 0 ? (
              <select
                value={String(statement.name ?? "")}
                onChange={(event) => onChange({ ...statement, name: event.target.value })}
              >
                {stateDefinitions.map((definition) => (
                  <option key={`${definition.scope}:${definition.ownerId}:${definition.name}`} value={definition.name}>
                    {definition.displayName || friendlyName(definition.name)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={String(statement.name ?? "")}
                onChange={(event) => onChange({ ...statement, name: portableName(event.target.value) })}
              />
            )}
          </FormField>
          <ExpressionField
            label="New value"
            expectedType={persistent
              ? stateDefinitions.find((entry) => entry.name === statement.name)?.valueType ?? "variant"
              : "variant"}
            expression={asNode(statement.value)}
            stateDefinitions={stateDefinitions}
            onChange={(value) => onChange({ ...statement, value })}
          />
        </FormGrid>
      </CollapsibleSection>
    );
  }
  if (kind === "call") {
    return (
      <HelperCallEditor
        statement={statement}
        helpers={helpers}
        stateDefinitions={stateDefinitions}
        onChange={onChange}
      />
    );
  }
  if (kind === "return") {
    return (
      <OutcomeEditor
        returnType={returnType}
        expression={asNode(statement.value)}
        onChange={(value) => onChange({
          kind: "return",
          ...(returnType === "void" ? {} : { value })
        })}
      />
    );
  }
  return <div className="rules-help-callout">Unsupported guided step: {kind}</div>;
}

function OperationStatementEditor({
  project,
  statement,
  operations,
  stateDefinitions,
  onChange
}: {
  project: Project;
  statement: AstNode;
  operations: GuidedCatalogOperation[];
  stateDefinitions: RemakeStateDefinition[];
  onChange: (statement: AstNode) => void;
}) {
  const operation = operations.find((entry) => entry.id === statement.capability) ?? operations[0];
  if (!operation) return <div className="rules-help-callout">This behavior role has no compatible operations.</div>;
  const arguments_ = asNode(statement.arguments);
  const parameterEntries = guidedParameterEntries(operation, arguments_);
  return (
    <CollapsibleSection
      title={operation.label}
      eyebrow={`${operation.mutates ? "Command" : "Query"}${operation.yields ? " · waits for Remake" : ""}`}
      defaultOpen
    >
      <p>{operation.summary}</p>
      <FormField label="Scenario action">
        <select
          value={operation.id}
          onChange={(event) => {
            const next = operations.find((entry) => entry.id === event.target.value);
            if (next) onChange(makeOperationStatement(next));
          }}
        >
          {[...groupOperations(operations).entries()].map(([category, entries]) => (
            <optgroup key={category} label={category}>
              {entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            </optgroup>
          ))}
        </select>
      </FormField>
      <FormGrid columns={2}>
        {parameterEntries.map(([name, rawType], _index, parameters) => {
          const optional = rawType.endsWith("?");
          const enabled = arguments_[name] !== undefined;
          return (
            <div className="guided-argument" key={name}>
              {optional && (
                <label className="guided-optional-toggle">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => {
                      const next = { ...arguments_ };
                      const optionalEntries = parameters.filter(([, type]) => type.endsWith("?"));
                      const optionalIndex = optionalEntries.findIndex(([entryName]) => entryName === name);
                      if (event.target.checked) {
                        for (const [entryName, entryType] of optionalEntries.slice(0, optionalIndex + 1)) {
                          if (next[entryName] === undefined) {
                            next[entryName] = defaultExpression(entryType, entryName);
                          }
                        }
                      } else {
                        for (const [entryName] of optionalEntries.slice(optionalIndex)) delete next[entryName];
                      }
                      onChange({ ...statement, arguments: next });
                    }}
                  />
                  Set optional {friendlyName(name)}
                </label>
              )}
              {(!optional || enabled) && (
                <ExpressionField
                  label={friendlyName(name)}
                  expectedType={rawType}
                  expression={asNode(arguments_[name])}
                  stateDefinitions={stateDefinitions}
                  recordOptions={recordOptions(project, operation.id, name, arguments_)}
                  onChange={(value) => {
                    const nextArguments = { ...arguments_, [name]: value };
                    if (
                      name === "scope"
                      && ["core.state.read", "core.state.write"].includes(operation.id)
                      && value.kind === "literal"
                    ) {
                      if (value.value === "quest") {
                        delete nextArguments.name;
                        delete nextArguments.ownerId;
                        nextArguments.id ??= { kind: "literal", value: 0 };
                      } else {
                        delete nextArguments.id;
                        nextArguments.name ??= { kind: "literal", value: "story_state" };
                      }
                    }
                    onChange({ ...statement, arguments: nextArguments });
                  }}
                />
              )}
            </div>
          );
        })}
      </FormGrid>
      {operation.result !== "void" && (
        <FormGrid columns={2}>
          <FormField label="Save result as">
            <input
              value={String(statement.result ?? "")}
              placeholder="Leave blank to ignore"
              onChange={(event) => {
                const result = portableName(event.target.value);
                const next = { ...statement };
                if (result) next.result = result;
                else {
                  delete next.result;
                  delete next.declaredType;
                }
                onChange(next);
              }}
            />
          </FormField>
          {Boolean(statement.result) && (
            <FormField label="Result type">
              <select
                value={String(statement.declaredType ?? scriptTypeForCatalog(operation.result) ?? "string")}
                onChange={(event) => onChange({
                  ...statement,
                  declaredType: event.target.value
                })}
              >
                {SCRIPT_TYPES.map((type) => <option key={type} value={type}>{friendlyName(type)}</option>)}
              </select>
            </FormField>
          )}
        </FormGrid>
      )}
    </CollapsibleSection>
  );
}

function NestedBlock({
  label,
  project,
  statements,
  operations,
  helpers,
  stateDefinitions,
  returnType,
  header,
  onDelete,
  onChange
}: {
  label: string;
  project: Project;
  statements: AstNode[];
  operations: GuidedCatalogOperation[];
  helpers: RemakeBehaviorDefinition[];
  stateDefinitions: RemakeStateDefinition[];
  returnType: RemakeScriptValueType;
  header?: ReactNode;
  onDelete?: () => void;
  onChange: (statements: AstNode[]) => void;
}) {
  return (
    <div className="guided-nested-block">
      <div className="guided-nested-header">
        <strong>{label}</strong>
        {onDelete && <button type="button" className="btn btn-danger btn-xs" onClick={onDelete}>Remove Case</button>}
      </div>
      {header}
      <StatementListEditor
        project={project}
        statements={statements}
        operations={operations}
        helpers={helpers}
        stateDefinitions={stateDefinitions}
        returnType={returnType}
        onChange={onChange}
      />
    </div>
  );
}

function HelperCallEditor({
  statement,
  helpers,
  stateDefinitions,
  onChange
}: {
  statement: AstNode;
  helpers: RemakeBehaviorDefinition[];
  stateDefinitions: RemakeStateDefinition[];
  onChange: (statement: AstNode) => void;
}) {
  const helper = helpers.find((entry) => entry.id === statement.scriptId) ?? helpers[0];
  const arguments_ = asNode(statement.arguments);
  return (
    <CollapsibleSection title="Call Helper" eyebrow="Reusable Behavior" defaultOpen>
      <FormField label="Helper">
        <select
          value={helper?.id ?? ""}
          onChange={(event) => {
            const next = helpers.find((entry) => entry.id === event.target.value);
            if (next) onChange(makeFlowStatement("call", "void", [next], stateDefinitions));
          }}
        >
          {helpers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </FormField>
      {helper?.parameters.map((parameter) => (
        <ExpressionField
          key={parameter.name}
          label={friendlyName(parameter.name)}
          expectedType={parameter.valueType}
          expression={asNode(arguments_[parameter.name])}
          stateDefinitions={stateDefinitions}
          onChange={(value) => onChange({
            ...statement,
            arguments: { ...arguments_, [parameter.name]: value }
          })}
        />
      ))}
      {helper && helper.returnType !== "void" && (
        <FormField label="Save result as">
          <input
            value={String(statement.result ?? "")}
            onChange={(event) => onChange({
              ...statement,
              result: portableName(event.target.value),
              declaredType: helper.returnType
            })}
          />
        </FormField>
      )}
    </CollapsibleSection>
  );
}

function ConditionEditor({
  expression,
  stateDefinitions,
  onChange
}: {
  expression: AstNode;
  stateDefinitions: RemakeStateDefinition[];
  onChange: (expression: AstNode) => void;
}) {
  const operator = String(expression.operator ?? "");
  const mode = expression.kind === "binary" && ["and", "or"].includes(operator)
    ? operator
    : expression.kind === "binary"
      ? "comparison"
      : expression.kind === "unary"
        ? "not"
        : "value";
  return (
    <div className="guided-condition">
      <FormField label="Condition type">
        <select
          value={mode}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "and" || next === "or") {
              onChange({
                kind: "binary",
                operator: next,
                left: comparisonExpression(),
                right: comparisonExpression()
              });
            } else if (next === "comparison") onChange(comparisonExpression());
            else if (next === "not") {
              onChange({ kind: "unary", operator: "not", operand: { kind: "literal", value: false } });
            } else onChange({ kind: "literal", value: true });
          }}
        >
          <option value="comparison">Compare values</option>
          <option value="and">All conditions are true</option>
          <option value="or">Any condition is true</option>
          <option value="not">Condition is false</option>
          <option value="value">Boolean value</option>
        </select>
      </FormField>
      {mode === "and" || mode === "or" ? (
        <FormGrid columns={2}>
          <ConditionEditor
            expression={asNode(expression.left)}
            stateDefinitions={stateDefinitions}
            onChange={(left) => onChange({ ...expression, left })}
          />
          <ConditionEditor
            expression={asNode(expression.right)}
            stateDefinitions={stateDefinitions}
            onChange={(right) => onChange({ ...expression, right })}
          />
        </FormGrid>
      ) : mode === "comparison" ? (
        <FormGrid columns={3}>
          <ExpressionField
            label="Left value"
            expectedType="variant"
            expression={asNode(expression.left)}
            stateDefinitions={stateDefinitions}
            onChange={(left) => onChange({ ...expression, left })}
          />
          <FormField label="Comparison">
            <select
              value={operator || "=="}
              onChange={(event) => onChange({ ...expression, operator: event.target.value })}
            >
              <option value="==">Equals</option>
              <option value="!=">Does not equal</option>
              <option value=">">Is greater than</option>
              <option value=">=">Is at least</option>
              <option value="<">Is less than</option>
              <option value="<=">Is at most</option>
            </select>
          </FormField>
          <ExpressionField
            label="Right value"
            expectedType="variant"
            expression={asNode(expression.right)}
            stateDefinitions={stateDefinitions}
            onChange={(right) => onChange({ ...expression, right })}
          />
        </FormGrid>
      ) : mode === "not" ? (
        <ConditionEditor
          expression={asNode(expression.operand)}
          stateDefinitions={stateDefinitions}
          onChange={(operand) => onChange({ ...expression, operand })}
        />
      ) : (
        <ExpressionField
          label="Boolean value"
          expectedType="bool"
          expression={expression}
          stateDefinitions={stateDefinitions}
          onChange={onChange}
        />
      )}
    </div>
  );
}

function ExpressionField({
  label,
  expectedType,
  expression,
  stateDefinitions,
  recordOptions: options = [],
  onChange
}: {
  label: string;
  expectedType: string;
  expression: AstNode;
  stateDefinitions: RemakeStateDefinition[];
  recordOptions?: Array<{ value: number | string; label: string }>;
  onChange: (expression: AstNode) => void;
}) {
  const type = expectedType.replace(/\?$/, "");
  const mode = expression.kind === "variable"
    ? expression.scope === "persistent" ? "state" : "local"
    : expression.kind === "member"
      ? "field"
      : "constant";
  return (
    <FormField label={label}>
      <div className="guided-expression">
        <select
          aria-label={`${label} source`}
          value={mode}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "local") onChange({ kind: "variable", scope: "local", name: "value" });
            else if (next === "state") {
              onChange({
                kind: "variable",
                scope: "persistent",
                name: stateDefinitions[0]?.name ?? ""
              });
            } else if (next === "field") {
              onChange({
                kind: "member",
                object: { kind: "variable", scope: "local", name: "context" },
                member: "value"
              });
            } else onChange(defaultExpression(type, label));
          }}
        >
          <option value="constant">Fixed value</option>
          <option value="local">Local or parameter</option>
          <option value="state" disabled={stateDefinitions.length === 0}>Story state</option>
          <option value="field">Context or snapshot field</option>
        </select>
        {mode === "local" && (
          <input
            value={String(expression.name ?? "")}
            placeholder="variable_name"
            onChange={(event) => onChange({ ...expression, name: portableName(event.target.value) })}
          />
        )}
        {mode === "state" && (
          <select
            value={String(expression.name ?? "")}
            onChange={(event) => onChange({ ...expression, name: event.target.value })}
          >
            {stateDefinitions.map((definition) => (
              <option key={`${definition.scope}:${definition.ownerId}:${definition.name}`} value={definition.name}>
                {definition.displayName || friendlyName(definition.name)}
              </option>
            ))}
          </select>
        )}
        {mode === "field" && (
          <div className="guided-inline-control">
            <input
              value={String(asNode(expression.object).name ?? "context")}
              placeholder="context or snapshot"
              onChange={(event) => onChange({
                ...expression,
                object: {
                  kind: "variable",
                  scope: "local",
                  name: portableName(event.target.value)
                }
              })}
            />
            <input
              value={String(expression.member ?? "")}
              placeholder="field"
              onChange={(event) => onChange({
                ...expression,
                member: portableName(event.target.value)
              })}
            />
          </div>
        )}
        {mode === "constant" && (
          <LiteralEditor
            type={type}
            expression={expression}
            options={options}
            onChange={onChange}
          />
        )}
      </div>
    </FormField>
  );
}

function LiteralEditor({
  type,
  expression,
  options,
  onChange
}: {
  type: string;
  expression: AstNode;
  options: Array<{ value: number | string; label: string }>;
  onChange: (expression: AstNode) => void;
}) {
  const value = expression.kind === "literal" ? expression.value : null;
  if (type.endsWith("-array") || type === "string-array") {
    const values = expression.kind === "array"
      ? nodeArray(expression.values).map((entry) => entry.value)
      : [];
    return (
      <textarea
        rows={2}
        value={values.join(", ")}
        placeholder="Comma-separated values"
        onChange={(event) => onChange({
          kind: "array",
          values: event.target.value.split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map((entry) => ({
              kind: "literal",
              value: type === "string-array" ? entry : Number(entry)
            }))
        })}
      />
    );
  }
  if (type === "bool") {
    return (
      <select
        value={value ? "true" : "false"}
        onChange={(event) => onChange({ kind: "literal", value: event.target.value === "true" })}
      >
        <option value="false">False</option>
        <option value="true">True</option>
      </select>
    );
  }
  if (options.length > 0) {
    return (
      <select
        value={String(value ?? options[0]?.value ?? "")}
        onChange={(event) => {
          const selected = options.find((entry) => String(entry.value) === event.target.value);
          onChange({ kind: "literal", value: selected?.value ?? event.target.value });
        }}
      >
        {options.map((option) => (
          <option key={`${option.value}:${option.label}`} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    );
  }
  if (type === "int" || type === "float") {
    return (
      <input
        type="number"
        step={type === "int" ? 1 : "any"}
        value={Number(value ?? 0)}
        onChange={(event) => onChange({
          kind: "literal",
          value: type === "int" ? Number.parseInt(event.target.value || "0", 10) : Number(event.target.value || 0)
        })}
      />
    );
  }
  if (type === "variant") {
    const display = typeof value === "string" ? value : JSON.stringify(value ?? "");
    return (
      <input
        value={display}
        onChange={(event) => onChange({ kind: "literal", value: coerceVariant(event.target.value) })}
      />
    );
  }
  return (
    <input
      value={String(value ?? "")}
      onChange={(event) => onChange({ kind: "literal", value: event.target.value })}
    />
  );
}

function OutcomeEditor({
  returnType,
  expression,
  onChange
}: {
  returnType: RemakeScriptValueType;
  expression: AstNode;
  onChange: (expression: AstNode) => void;
}) {
  if (returnType === "void") {
    return <div className="rules-help-callout"><strong>Finish behavior</strong></div>;
  }
  const fields = asNode(expression.fields);
  if (returnType === "rule-modifier") {
    return (
      <CollapsibleSection title="Return Rule Modifier" eyebrow="Finish Behavior" defaultOpen>
        <FormGrid columns={2}>
          {["add", "multiply", "minimum", "maximum"].map((field) => (
            <FormField key={field} label={friendlyName(field)}>
              <input
                type="number"
                step="any"
                value={Number(asNode(fields[field]).value ?? (field === "multiply" ? 1 : 0))}
                onChange={(event) => onChange({
                  kind: "record",
                  fields: {
                    ...fields,
                    [field]: { kind: "literal", value: Number(event.target.value) }
                  }
                })}
              />
            </FormField>
          ))}
        </FormGrid>
      </CollapsibleSection>
    );
  }
  const kinds = OUTCOME_KINDS[returnType] ?? ["continue"];
  const kind = String(asNode(fields.kind).value ?? kinds[0]);
  return (
    <CollapsibleSection title="Finish Behavior" eyebrow={friendlyName(returnType)} defaultOpen>
      <FormField label="Outcome">
        <select
          value={kind}
          onChange={(event) => onChange(outcomeExpression(returnType, event.target.value))}
        >
          {kinds.map((entry) => <option key={entry} value={entry}>{friendlyName(entry)}</option>)}
        </select>
      </FormField>
      {(returnType === "action-outcome" && ["call", "replace"].includes(kind)) && (
        <FormGrid columns={2}>
          <OutcomeField field="triggerId" type="string" fields={fields} onChange={onChange} />
          <OutcomeField field="actionIndex" type="int" fields={fields} onChange={onChange} />
        </FormGrid>
      )}
      {(returnType === "encounter-outcome" && ["resolve", "branch"].includes(kind)) && (
        <OutcomeField field="outcome" type="int" fields={fields} onChange={onChange} />
      )}
      {returnType === "effect-outcome" && kind === "applied" && (
        <FormGrid columns={2}>
          <OutcomeField field="duration" type="int" fields={fields} onChange={onChange} />
          <FormField label="Tick Interval">
            <select
              value={String(asNode(fields.interval).value ?? "round")}
              onChange={(event) => onChange({
                kind: "record",
                fields: {
                  ...fields,
                  interval: { kind: "literal", value: event.target.value }
                }
              })}
            >
              {["round", "move", "minute", "hour", "day"].map((entry) => (
                <option key={entry} value={entry}>{friendlyName(entry)}</option>
              ))}
            </select>
          </FormField>
          <OutcomeField field="effectKey" type="string" fields={fields} onChange={onChange} />
          <FormField label="When Reapplied">
            <select
              value={String(asNode(fields.stacking).value ?? "refresh")}
              onChange={(event) => onChange({
                kind: "record",
                fields: {
                  ...fields,
                  stacking: { kind: "literal", value: event.target.value }
                }
              })}
            >
              {["refresh", "replace", "stack"].map((entry) => (
                <option key={entry} value={entry}>{friendlyName(entry)}</option>
              ))}
            </select>
          </FormField>
        </FormGrid>
      )}
      {returnType === "item-outcome" && kind === "modified" && (
        <FormGrid columns={2}>
          {["add", "multiply", "minimum", "maximum"].map((field) => (
            <OutcomeField
              key={field}
              field={field}
              type="float"
              fields={fields}
              onChange={onChange}
            />
          ))}
        </FormGrid>
      )}
      {returnType === "monster-decision" && kind === "move" && (
        <FormGrid columns={2}>
          <OutcomeField field="dx" type="int" fields={fields} onChange={onChange} />
          <OutcomeField field="dy" type="int" fields={fields} onChange={onChange} />
        </FormGrid>
      )}
      {returnType === "monster-decision" && ["attack", "cast", "use-item"].includes(kind) && (
        <FormGrid columns={3}>
          {kind === "cast" && <OutcomeField field="spellId" type="string" fields={fields} onChange={onChange} />}
          {kind === "cast" && <OutcomeField field="power" type="int" fields={fields} onChange={onChange} />}
          {kind === "use-item" && <OutcomeField field="itemInstanceId" type="string" fields={fields} onChange={onChange} />}
          <OutcomeField field="targetId" type="string" fields={fields} onChange={onChange} />
        </FormGrid>
      )}
    </CollapsibleSection>
  );
}

function OutcomeField({
  field,
  type,
  fields,
  onChange
}: {
  field: string;
  type: "string" | "int" | "float";
  fields: AstNode;
  onChange: (expression: AstNode) => void;
}) {
  return (
    <FormField label={friendlyName(field)}>
      <input
        type={type === "string" ? "text" : "number"}
        step={type === "float" ? "any" : undefined}
        value={String(asNode(fields[field]).value ?? (type === "string" ? "" : 0))}
        onChange={(event) => onChange({
          kind: "record",
          fields: {
            ...fields,
            [field]: {
              kind: "literal",
              value: type === "string" ? event.target.value : Number(event.target.value)
            }
          }
        })}
      />
    </FormField>
  );
}

function captainRecipeBody(returnType: RemakeScriptValueType): AstNode[] {
  return [
    makeOperationStatement(operation("core.inventory.wealth")),
    {
      ...makeOperationStatement(operation("core.map.time")),
      result: "time"
    },
    {
      ...makeOperationStatement(operation("core.character.party")),
      result: "members"
    },
    {
      kind: "declare",
      name: "healthy",
      valueType: "bool",
      value: {
        kind: "collection",
        operation: "any",
        collection: { kind: "variable", scope: "local", name: "members" },
        itemName: "member",
        predicate: {
          kind: "member",
          object: { kind: "variable", scope: "local", name: "member" },
          member: "alive"
        }
      }
    },
    {
      kind: "if",
      condition: {
        kind: "binary",
        operator: "and",
        left: {
          kind: "binary",
          operator: "and",
          left: {
            kind: "binary",
            operator: ">=",
            left: {
              kind: "member",
              object: { kind: "variable", scope: "local", name: "wealth" },
              member: "gold"
            },
            right: { kind: "literal", value: 500 }
          },
          right: {
            kind: "binary",
            operator: "<=",
            left: {
              kind: "member",
              object: { kind: "variable", scope: "local", name: "time" },
              member: "day"
            },
            right: { kind: "literal", value: 3 }
          }
        },
        right: { kind: "variable", scope: "local", name: "healthy" }
      },
      then: [
        {
          ...makeOperationStatement(operation("core.inventory.take-wealth")),
          arguments: { gold: { kind: "literal", value: 500 } },
          result: "paid"
        },
        {
          ...makeOperationStatement(operation("core.state.write")),
          arguments: {
            scope: { kind: "literal", value: "campaign" },
            name: { kind: "literal", value: "paid_the_captain" },
            value: { kind: "literal", value: true }
          }
        },
        {
          ...makeOperationStatement(operation("core.presentation.text")),
          arguments: { text: { kind: "literal", value: "The captain accepts your payment." } }
        }
      ],
      else: [{
        ...makeOperationStatement(operation("core.presentation.text")),
        arguments: { text: { kind: "literal", value: "You have returned too late or without the money." } }
      }]
    },
    makeFlowStatement("return", returnType, [], [])
  ];
}

function operation(id: string): GuidedCatalogOperation {
  const value = CATALOG.operations.find((entry) => entry.id === id);
  if (!value) throw new Error(`Scenario API operation '${id}' is unavailable.`);
  return value;
}

function defaultExpression(rawType: string, name: string): AstNode {
  const type = rawType.replace(/\?$/, "");
  if (type.endsWith("-array") || type === "string-array") return { kind: "array", values: [] };
  if (type === "bool") return { kind: "literal", value: false };
  if (type === "int" || type === "float") return { kind: "literal", value: 0 };
  if (name === "scope") return { kind: "literal", value: "campaign" };
  if (name === "levelType") return { kind: "literal", value: "land" };
  if (name === "encounterKind") return { kind: "literal", value: "simple" };
  return { kind: "literal", value: "" };
}

function guidedParameterEntries(
  operation: GuidedCatalogOperation,
  arguments_: AstNode
): Array<[string, string]> {
  const entries = Object.entries(operation.parameters);
  if (!["core.state.read", "core.state.write"].includes(operation.id)) return entries;
  const questScope = asNode(arguments_.scope).kind === "literal"
    && asNode(arguments_.scope).value === "quest";
  return entries
    .filter(([name]) => questScope
      ? !["name", "ownerId"].includes(name)
      : name !== "id")
    .map(([name, type]) => [
      name,
      ["id", "name"].includes(name) ? type.replace(/\?$/, "") : type
    ]);
}

function defaultOutcomeExpression(type: RemakeScriptValueType): AstNode {
  if (type === "rule-modifier") {
    return {
      kind: "record",
      fields: {
        add: { kind: "literal", value: 0 },
        multiply: { kind: "literal", value: 1 }
      }
    };
  }
  return outcomeExpression(type, OUTCOME_KINDS[type]?.[0] ?? "continue");
}

function outcomeExpression(type: RemakeScriptValueType, kind: string): AstNode {
  const fields: AstNode = { kind: { kind: "literal", value: kind } };
  if (type === "action-outcome" && ["call", "replace"].includes(kind)) {
    fields.triggerId = { kind: "literal", value: "" };
    fields.actionIndex = { kind: "literal", value: 0 };
  }
  if (type === "encounter-outcome" && ["resolve", "branch"].includes(kind)) {
    fields.outcome = { kind: "literal", value: 0 };
  }
  if (type === "effect-outcome" && kind === "applied") {
    fields.duration = { kind: "literal", value: 0 };
    fields.interval = { kind: "literal", value: "round" };
    fields.stacking = { kind: "literal", value: "refresh" };
  }
  if (type === "item-outcome" && kind === "modified") {
    fields.add = { kind: "literal", value: 0 };
    fields.multiply = { kind: "literal", value: 1 };
  }
  if (type === "monster-decision" && kind === "move") {
    fields.dx = { kind: "literal", value: 0 };
    fields.dy = { kind: "literal", value: 0 };
  }
  if (type === "monster-decision" && ["attack", "cast", "use-item"].includes(kind)) {
    fields.targetId = { kind: "literal", value: "" };
    if (kind === "cast") {
      fields.spellId = { kind: "literal", value: "" };
      fields.power = { kind: "literal", value: 1 };
    }
    if (kind === "use-item") fields.itemInstanceId = { kind: "literal", value: "" };
  }
  return { kind: "record", fields };
}

function comparisonExpression(): AstNode {
  return {
    kind: "binary",
    operator: "==",
    left: { kind: "literal", value: true },
    right: { kind: "literal", value: true }
  };
}

function scriptTypeForCatalog(type: string): RemakeScriptValueType | null {
  const types: Record<string, RemakeScriptValueType> = {
    bool: "bool",
    int: "int",
    float: "float",
    string: "string",
    LocationSnapshot: "location-snapshot",
    TimeSnapshot: "time-snapshot",
    WealthSnapshot: "wealth-snapshot",
    "CharacterSnapshot-array": "character-snapshot-array",
    CombatSnapshot: "combat-snapshot"
  };
  return types[type] ?? null;
}

function recordOptions(
  project: Project,
  operationId: string,
  parameter: string,
  arguments_: AstNode = {}
): Array<{ value: number | string; label: string }> {
  if (parameter === "battleId") {
    return project.battles.map((record) => ({
      value: record.id,
      label: `Battle ${record.id} · ${record.grid.filter(Boolean).length} monsters`
    }));
  }
  if (parameter === "treasureId") {
    return project.treasures.map((record) => ({
      value: record.id,
      label: `Treasure ${record.id} · ${record.gold} gold · ${record.itemIds.filter(Boolean).length} items`
    }));
  }
  if (parameter === "itemId") {
    return project.scenarioItems.map((record) => ({
      value: record.id,
      label: project.itemTexts.find((text) => text.itemId === record.id)?.identifiedName
        || `Scenario Item ${record.id}`
    }));
  }
  if (parameter === "replacementItemId") {
    return project.scenarioItems.map((record) => ({
      value: record.id,
      label: project.itemTexts.find((text) => text.itemId === record.id)?.identifiedName
        || `Scenario Item ${record.id}`
    }));
  }
  if (parameter === "monsterId") {
    return project.monsters.map((record) => ({
      value: record.id,
      label: `${record.displayName || `Monster ${record.id}`} · scenario monster ${record.id}`
    }));
  }
  if (parameter === "monsterNameId") {
    const names = new Map<number, string>();
    for (const record of project.monsters) {
      if (!names.has(record.nameId)) names.set(record.nameId, record.displayName || `Monster name ${record.nameId}`);
    }
    return [...names.entries()]
      .sort(([left], [right]) => left - right)
      .map(([value, label]) => ({ value, label: `${label} · name identity ${value}` }));
  }
  if (parameter === "iconId") {
    return project.scenarioIconResources.map((resource) => ({
      value: resource.resourceId,
      label: resource.label || `Scenario Icon ${resource.resourceId}`
    }));
  }
  if (parameter === "shopId") {
    return project.shops.map((record) => ({
      value: record.id,
      label: `Shop ${record.id} · ${record.itemIds.filter(Boolean).length} stocked items`
    }));
  }
  if (parameter === "spellId") {
    return project.spellOverrides.map((record) => ({
      value: record.id,
      label: `${record.displayName || `Custom Spell ${record.id}`} · spell ${record.id}`
    }));
  }
  if (parameter === "pictureId" || parameter === "soundId") {
    const kind = parameter === "pictureId" ? "picture" : "sound";
    const managed = project.assets
      .filter((asset) => asset.kind === kind && asset.libraryScope !== "custom-library")
      .map((asset) => ({ value: asset.resourceId, label: asset.label }));
    const catalog = parameter === "pictureId"
      ? project.assetCatalog.pictures ?? []
      : project.assetCatalog.sounds ?? [];
    return uniqueOptions([
      ...managed,
      ...catalog.map((asset) => ({
        value: asset.resourceId,
        label: asset.name || `${friendlyName(kind)} ${asset.resourceId}`
      }))
    ]);
  }
  if (parameter === "encounterId") {
    const kind = literalString(arguments_.encounterKind);
    return [
      ...(kind === "complex" ? [] : project.simpleEncounters.map((record) => ({
        value: record.id,
        label: `Simple Encounter ${record.id} · ${record.texts.find(Boolean)?.slice(0, 48) ?? ""}`
      }))),
      ...(kind === "simple" ? [] : project.complexEncounters.map((record) => ({
        value: record.id,
        label: `Complex Encounter ${record.id} · ${record.texts.find(Boolean)?.slice(0, 48) ?? ""}`
      })))
    ];
  }
  if (parameter === "levelIndex") {
    const levelType = literalString(arguments_.levelType);
    return project.maps
      .filter((map) => !levelType || map.levelType === levelType)
      .map((map) => ({
      value: map.index,
      label: `${friendlyName(map.levelType)} ${map.index + 1} · ${map.name || map.source}`
      }));
  }
  if (parameter === "mapId") {
    return project.mapRecords.map((record) => ({
      value: record.id,
      label: record.primaryName || record.name || record.note || `Player Map ${record.id}`
    }));
  }
  if (parameter === "resourceId" && operationId === "core.presentation.scrolling-text") {
    return uniqueOptions(project.assets
      .filter((asset) => asset.kind === "text" || asset.resourceType.trim() === "TEXT")
      .map((asset) => ({
        value: asset.resourceId,
        label: asset.label || `Scrolling Text ${asset.resourceId}`
      })));
  }
  if (operationId === "core.state.read" || operationId === "core.state.write") {
    if (parameter === "scope") {
      return [...CATALOG.stateScopes, "quest"].map((scope) => ({
        value: scope,
        label: friendlyName(scope)
      }));
    }
  }
  if (parameter === "levelType") {
    return [
      { value: "land", label: "Land" },
      { value: "dungeon", label: "Dungeon" }
    ];
  }
  if (parameter === "encounterKind") {
    return [
      { value: "simple", label: "Simple Encounter" },
      { value: "complex", label: "Complex Encounter" }
    ];
  }
  if (parameter === "conditionIndex") {
    return CONDITION_LABELS.map((label, value) => ({ value, label }));
  }
  if (parameter === "heading") {
    return ["North", "East", "South", "West"]
      .map((label, index) => ({ value: index + 1, label }));
  }
  if (parameter === "stat" && operationId === "core.character.change-stat") {
    return [
      "actions",
      "spell-actions",
      "movement",
      "damage-bonus",
      "maximum-spell-points",
      "hand-to-hand",
      "maximum-health",
      "defense",
      "melee-accuracy",
      "ranged-accuracy",
      "magic-resistance",
      "prestige"
    ].map((value) => ({ value, label: friendlyName(value) }));
  }
  if (parameter === "checkIndex") {
    if (literalString(arguments_.checkType) === "special") {
      return [
        [0, "Melee Critical Multiplier"],
        [3, "Melee Critical Chance"],
        [4, "Detect Secret"],
        [5, "Acrobatics"],
        [6, "Detect Trap"],
        [7, "Disable Trap"],
        [9, "Force Lock"],
        [11, "Pick Lock"],
        [13, "Turn Undead"]
      ].map(([value, label]) => ({ value, label })) as Array<{ value: number; label: string }>;
    }
    return ["Strength", "Intellect", "Wisdom", "Dexterity", "Vitality", "Quickness", "Luck"]
      .map((label, value) => ({ value, label }));
  }
  if (parameter === "currency") {
    return ["Gold", "Gems", "Jewelry"].map((label, value) => ({ value, label }));
  }
  if (parameter === "action" && operationId === "core.inventory.alter-item") {
    return [
      { value: "remove", label: "Remove matching items" },
      { value: "charges", label: "Change remaining charges" },
      { value: "replace", label: "Replace with another item" }
    ];
  }
  if (parameter === "targetMode") {
    const values = operationId === "core.character.cast-spell"
      ? ["party", "selected"]
      : ["party", "selected", "living"];
    return values.map((value) => ({ value, label: friendlyName(value) }));
  }
  if (parameter === "checkType") {
    return [
      { value: "attribute", label: "Attribute" },
      { value: "special", label: "Special Ability" }
    ];
  }
  if (parameter === "selector" && operationId === "core.character.party-misc") {
    return [
      "selected_count",
      "in_camp",
      "in_boat",
      "party_level_above",
      "selected_level_above",
      "race",
      "gender",
      "caste",
      "race_class",
      "caste_class"
    ].map((value) => ({ value, label: friendlyName(value) }));
  }
  if (parameter === "selector" && operationId === "core.character.select-identity") {
    return ["race", "gender", "caste", "race_class", "caste_class", "caste_group"]
      .map((value) => ({ value, label: friendlyName(value) }));
  }
  if (parameter === "selector" && operationId === "core.character.select-property") {
    return [
      "movement_below",
      "position_before",
      "has_item",
      "percent",
      "wearing_item",
      "attribute_save_failure",
      "spell_save_failure",
      "focused_character",
      "exact_position"
    ].map((value) => ({ value, label: friendlyName(value) }));
  }
  if (parameter === "value" && operationId === "core.character.select-identity") {
    const selector = literalString(arguments_.selector);
    if (selector === "race") {
      return project.ruleNames.raceNames.map((label, index) => ({ value: index + 1, label }));
    }
    if (selector === "caste" || selector === "caste_group") {
      return project.ruleNames.casteNames.map((label, index) => ({ value: index + 1, label }));
    }
    if (selector === "gender") {
      return [{ value: 1, label: "Male" }, { value: 2, label: "Female" }];
    }
  }
  if (parameter === "value" && operationId === "core.character.select-property") {
    const selector = literalString(arguments_.selector);
    if (selector === "has_item" || selector === "wearing_item") {
      return recordOptions(project, operationId, "itemId", arguments_);
    }
  }
  if (parameter === "candidateMode") {
    return ["party", "alive", "selected"]
      .map((value) => ({ value, label: friendlyName(value) }));
  }
  if (parameter === "musicType") {
    return [
      "Battle", "Camp", "Town", "Forest", "Snow", "Swamp", "Desert", "Cave",
      "Indoor", "Dungeon", "Shop", "Temple", "Items", "Treasure", "Create"
    ].map((value) => ({ value, label: value }));
  }
  if (parameter === "outcome" && operationId === "core.combat.end-battle") {
    return ["won", "lost", "escaped", "aborted"]
      .map((value) => ({ value, label: friendlyName(value) }));
  }
  if (parameter === "rewardMode") {
    return ["normal", "none"]
      .map((value) => ({ value, label: friendlyName(value) }));
  }
  if (parameter === "targetType" && operationId === "core.combat.change-monsters") {
    return [
      { value: "monster", label: "Enemy monster" },
      { value: "ally", label: "Summoned ally" }
    ];
  }
  return [];
}

function literalString(value: unknown): string {
  const node = asNode(value);
  return node.kind === "literal" ? String(node.value ?? "") : "";
}

function uniqueOptions(
  options: Array<{ value: number | string; label: string }>
): Array<{ value: number | string; label: string }> {
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = String(option.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupOperations(operations: GuidedCatalogOperation[]) {
  const grouped = new Map<string, GuidedCatalogOperation[]>();
  for (const operation of operations) {
    grouped.set(operation.category, [...(grouped.get(operation.category) ?? []), operation]);
  }
  return grouped;
}

function move<T>(values: T[], from: number, to: number): T[] {
  const next = [...values];
  const [value] = next.splice(from, 1);
  next.splice(to, 0, value);
  return next;
}

function nodeArray(value: unknown): AstNode[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is AstNode => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function asNode(value: unknown): AstNode {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AstNode
    : {};
}

function describeExpression(value: unknown): string {
  const expression = asNode(value);
  if (expression.kind === "literal") return JSON.stringify(expression.value);
  if (expression.kind === "variable") return friendlyName(String(expression.name ?? "value"));
  return friendlyName(String(expression.kind ?? "value"));
}

function coerceVariant(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number(value);
  return value;
}

function portableName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return /^[a-z_]/.test(normalized) ? normalized : `value_${normalized || "1"}`;
}

function friendlyName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
