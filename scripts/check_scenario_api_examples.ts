import catalog from "../schemas/remake-scenario-capabilities.v2.json";
import {
  parseSafeScript,
  printSafeScript,
  type SafeScriptParseResult
} from "../src/editor/safeScriptLanguage";
import type {
  RemakeBehaviorDefinition,
  RemakeBehaviorRole,
  RemakeScriptValueType
} from "../src/editor/types";

type CatalogRole = {
  id: RemakeBehaviorRole;
  hooks: string[];
  runtimeHooks: string[];
  resultType: string;
  example: string;
};

type CatalogOperation = {
  id: string;
  roles: RemakeBehaviorRole[];
  example: string;
};

const failures: string[] = [];

for (const role of catalog.roles as CatalogRole[]) {
  const header = parseHeader(role.example);
  const definition = behaviorDefinition(
    `role.${role.id}`,
    role.id,
    role.id === "helper" ? "" : role.runtimeHooks[0] ?? role.hooks[0] ?? "",
    header.returnType,
    header.parameters
  );
  verifyExample(`Role ${role.id}`, role.example, definition);
}

for (const operation of catalog.operations as CatalogOperation[]) {
  const role = operation.roles.includes("helper")
    ? "helper"
    : operation.roles.includes("lifecycle")
      ? "lifecycle"
      : operation.roles[0];
  const hook = role === "helper"
    ? ""
    : (catalog.roles as CatalogRole[])
      .find((entry) => entry.id === role)?.runtimeHooks[0] ?? "";
  verifyExample(
    `Operation ${operation.id}`,
    operation.example,
    behaviorDefinition(
      `operation.${operation.id}`,
      role,
      hook,
      parseHeader(operation.example).returnType,
      []
    )
  );
}

if (failures.length) {
  throw new Error(
    `Scenario API examples do not compile:\n- ${failures.join("\n- ")}`
  );
}

console.log(
  `Scenario API examples compile (${catalog.roles.length} roles, `
  + `${catalog.operations.length} operations).`
);

function verifyExample(
  label: string,
  source: string,
  definition: RemakeBehaviorDefinition
) {
  const parsed = parseSafeScript(`${source.trim()}\n`, definition);
  if (parsed.diagnostics.length > 0 || parsed.program == null) {
    failures.push(`${label}: ${diagnostics(parsed)}`);
    return;
  }
  const printed = printSafeScript(parsed.program);
  const reparsed = parseSafeScript(printed, definition);
  if (reparsed.diagnostics.length > 0 || reparsed.program == null) {
    failures.push(`${label} does not reparse: ${diagnostics(reparsed)}`);
  }
}

function diagnostics(result: SafeScriptParseResult) {
  return result.diagnostics
    .map((entry) => `line ${entry.line}: ${entry.message}`)
    .join("; ") || "no canonical program";
}

function behaviorDefinition(
  id: string,
  role: RemakeBehaviorRole,
  hook: string,
  returnType: RemakeScriptValueType,
  parameters: RemakeBehaviorDefinition["parameters"]
): RemakeBehaviorDefinition {
  return {
    id,
    name: id,
    description: "Generated Scenario API example.",
    kind: role === "helper" ? "helper" : "entry",
    role,
    hook,
    tier: "safe",
    apiVersion: 2,
    behaviorVersion: 1,
    stateSchemaVersion: 1,
    parameters,
    returnType,
    requestedCapabilities: [],
    stateSchema: {},
    sourceMap: {},
    ast: null,
    source: null
  };
}

function parseHeader(source: string): {
  parameters: RemakeBehaviorDefinition["parameters"];
  returnType: RemakeScriptValueType;
} {
  const match = /^func\s+[a-z_][a-z0-9_]*\(([^)]*)\)\s*->\s*([^:]+):/m.exec(source);
  if (!match) throw new Error(`Scenario API example has no typed function header:\n${source}`);
  const parameters = match[1].trim()
    ? match[1].split(",").map((parameter) => {
      const parts = parameter.trim().split(/\s*:\s*/, 2);
      return {
        name: parts[0],
        valueType: scriptType(parts[1])
      };
    })
    : [];
  return {
    parameters,
    returnType: scriptType(match[2].trim())
  };
}

function scriptType(value: string): RemakeScriptValueType {
  const aliases: Record<string, RemakeScriptValueType> = {
    void: "void",
    bool: "bool",
    int: "int",
    float: "float",
    String: "string",
    LocationSnapshot: "location-snapshot",
    TimeSnapshot: "time-snapshot",
    WealthSnapshot: "wealth-snapshot",
    CharacterSnapshot: "character-snapshot",
    "Array[CharacterSnapshot]": "character-snapshot-array",
    CombatSnapshot: "combat-snapshot",
    ExplorationSnapshot: "exploration-snapshot",
    ItemInstanceSnapshot: "item-instance-snapshot",
    "Array[ItemInstanceSnapshot]": "item-instance-snapshot-array",
    MapDefinitionSnapshot: "map-definition-snapshot",
    MonsterDefinitionSnapshot: "monster-definition-snapshot",
    ItemDefinitionSnapshot: "item-definition-snapshot",
    SpellDefinitionSnapshot: "spell-definition-snapshot",
    BattleDefinitionSnapshot: "battle-definition-snapshot",
    EncounterDefinitionSnapshot: "encounter-definition-snapshot",
    MediaDefinitionSnapshot: "media-definition-snapshot",
    ActionOutcome: "action-outcome",
    EncounterOutcome: "encounter-outcome",
    EffectOutcome: "effect-outcome",
    ItemOutcome: "item-outcome",
    MonsterDecision: "monster-decision",
    RuleModifier: "rule-modifier",
    "Array[bool]": "bool-array",
    "Array[int]": "int-array",
    "Array[float]": "float-array",
    "Array[String]": "string-array"
  };
  const resolved = aliases[value];
  if (!resolved) throw new Error(`Unsupported Safe example type ${value}`);
  return resolved;
}
