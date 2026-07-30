const API_VERSION = 2;
let operationSequence = 0;
let returnSequence = 0;

export function createRemakeScriptingAcceptanceProject(sourceProject) {
  operationSequence = 0;
  returnSequence = 0;
  const project = structuredClone(sourceProject);
  project.authoringTarget = "remake-enhanced";
  project.appVersion = "remake-scripting-acceptance";
  project.scenario.name = "Providence Scripting Acceptance";
  project.scenario.contactInfo.scenarioName = project.scenario.name;
  project.scenario.contactInfo.description =
    "A deterministic Remake-enhanced scenario proving Providence behavior export and runtime consumption.";

  const actionBehavior = behavior({
    id: "scenario.providence.accept-captain-quest",
    name: "Accept Captain Quest",
    description: "Combines party gold, campaign day, and living-party state before accepting payment.",
    role: "action",
    hook: "run",
    returnType: "action-outcome",
    capabilities: [
      "core.character.party",
      "core.inventory.take-wealth",
      "core.inventory.wealth",
      "core.map.time",
      "core.map.teleport",
      "core.encounter.start-battle",
      "core.presentation.choice",
      "core.presentation.text",
      "core.state.write"
    ],
    body: captainQuestBody()
  });
  const encounterBehavior = behavior({
    id: "scenario.providence.encounter-result",
    name: "Record Encounter Result",
    description: "Records that the scripted encounter result ran.",
    role: "encounter",
    hook: "result",
    returnType: "encounter-outcome",
    capabilities: ["core.state.write"],
    body: [
      operation("core.state.write", {
        scope: literal("campaign"),
        name: literal("quest_stage"),
        value: literal(2)
      }),
      returnOutcome("continue")
    ]
  });
  const spellBehavior = behavior({
    id: "scenario.providence.spell-effect",
    name: "Acceptance Spell Effect",
    description: "Provides a serializable duration result for the acceptance spell.",
    role: "spell",
    hook: "effect",
    returnType: "effect-outcome",
    body: [{
      kind: "return",
      value: {
        kind: "record",
        fields: {
          kind: literal("applied"),
          duration: literal(2),
          interval: literal("round"),
          effectKey: literal("scenario.providence.acceptance"),
          stacking: literal("refresh")
        }
      },
      sourceNode: "spell-effect-return"
    }]
  });
  const itemBehavior = behavior({
    id: "scenario.providence.item-use",
    name: "Acceptance Item Use",
    description: "Records field use against the exact item instance.",
    role: "item",
    hook: "use-field",
    returnType: "item-outcome",
    capabilities: ["core.state.write"],
    body: [
      operation("core.state.write", {
        scope: literal("item-instance"),
        ownerId: literal("101"),
        name: literal("uses"),
        value: literal(1)
      }),
      returnOutcome("used")
    ]
  });
  const monsterBehavior = behavior({
    id: "scenario.providence.monster-ai",
    name: "Acceptance Monster AI",
    description: "Returns one deterministic validated combat decision.",
    role: "monster-ai",
    hook: "decide",
    returnType: "monster-decision",
    body: [returnOutcome("wait")]
  });
  const lifecycleBehavior = behavior({
    id: "scenario.providence.campaign-start",
    name: "Initialize Acceptance Campaign",
    description: "Initializes typed campaign state at the campaign-start boundary.",
    role: "lifecycle",
    hook: "campaign-start",
    returnType: "void",
    capabilities: ["core.state.write"],
    body: [
      operation("core.state.write", {
        scope: literal("campaign"),
        name: literal("quest_stage"),
        value: literal(0)
      }),
      { kind: "return", sourceNode: "campaign-start-return" }
    ]
  });
  const modifierBehavior = behavior({
    id: "scenario.providence.attack-chance",
    name: "Acceptance Attack Modifier",
    description: "Adds five points to attack chance through the bounded modifier contract.",
    role: "rule-modifier",
    hook: "attack-chance",
    returnType: "rule-modifier",
    body: [{
      kind: "return",
      value: {
        kind: "record",
        fields: {
          add: literal(5),
          multiply: literal(1),
          minimum: literal(0),
          maximum: literal(100)
        }
      },
      sourceNode: "attack-modifier-return"
    }]
  });
  const helperBehavior = behavior({
    id: "scenario.providence.payment-amount",
    name: "Captain Payment Amount",
    description: "Returns the reusable captain payment threshold.",
    kind: "helper",
    role: "helper",
    hook: "",
    returnType: "int",
    body: [{
      kind: "return",
      value: literal(500),
      sourceNode: "payment-helper-return"
    }]
  });
  const migrationBehavior = behavior({
    id: "scenario.providence.migrate-0-1",
    name: "Migrate Acceptance State to 0.1",
    description: "Migrates the acceptance campaign state without yielding.",
    kind: "helper",
    role: "helper",
    hook: "",
    returnType: "void",
    capabilities: ["core.state.write"],
    body: [
      operation("core.state.write", {
        scope: literal("campaign"),
        name: literal("quest_stage"),
        value: literal(1)
      }),
      { kind: "return", sourceNode: "migration-return" }
    ]
  });

  project.remakeRuntime = {
    recommendedGameplayProfile: "core.classic",
    requiredExtensions: [],
    semanticActions: [],
    behaviors: [
      actionBehavior,
      encounterBehavior,
      spellBehavior,
      itemBehavior,
      monsterBehavior,
      lifecycleBehavior,
      modifierBehavior,
      helperBehavior,
      migrationBehavior
    ],
    behaviorBindings: [
      binding("acceptance.action", "trigger", "land:0:ap:0", 0, actionBehavior),
      binding("acceptance.encounter", "simpleEncounter", "0", 0, encounterBehavior),
      binding("acceptance.spell", "spell", "16", null, spellBehavior),
      binding("acceptance.item", "item", "101", null, itemBehavior),
      binding("acceptance.monster", "monster", "1", null, monsterBehavior),
      binding("acceptance.lifecycle", "lifecycle", "campaign", null, lifecycleBehavior),
      binding("acceptance.rule", "rule", "attack-chance", null, modifierBehavior)
    ],
    stateDefinitions: [
      state("paid_the_captain", "Paid the Captain", "campaign", "", "bool", false),
      state("quest_stage", "Quest Stage", "campaign", "", "int", 0),
      state("uses", "Item Uses", "item-instance", "101", "int", 0)
    ],
    migrations: [{
      id: "scenario.providence.migration-0-1",
      fromContentVersion: "0.0",
      toContentVersion: "0.1",
      behaviorId: migrationBehavior.id
    }],
    requiredPlugins: [],
    bindings: {
      spells: {},
      items: {},
      encounters: {},
      monsterAi: {},
      lifecycle: {},
      ruleModifiers: {}
    }
  };
  return project;
}

function behavior({
  id,
  name,
  description,
  kind = "entry",
  role,
  hook,
  returnType,
  capabilities = [],
  body
}) {
  return {
    id,
    name,
    description,
    kind,
    role,
    hook,
    tier: "safe",
    apiVersion: API_VERSION,
    behaviorVersion: 1,
    stateSchemaVersion: 1,
    parameters: [],
    returnType,
    requestedCapabilities: [...capabilities].sort(),
    stateSchema: {},
    sourceMap: {
      schemaVersion: 1,
      nodes: collectSourceNodes(body)
    },
    ast: {
      kind: "function",
      name: id.split(".").at(-1).replaceAll("-", "_"),
      parameters: [],
      returnType,
      body
    },
    source: null
  };
}

function binding(id, targetKind, recordId, slot, definition) {
  return {
    id: `binding.providence.${id}`,
    targetKind,
    recordId,
    slot,
    role: definition.role,
    hook: definition.hook,
    behaviorId: definition.id,
    arguments: {},
    priority: 0
  };
}

function state(name, displayName, scope, ownerId, valueType, defaultValue) {
  return {
    name,
    displayName,
    documentation: `${displayName} state for the Providence scripting acceptance scenario.`,
    scope,
    ownerId,
    schemaVersion: 1,
    valueType,
    maxLength: null,
    defaultValue
  };
}

function captainQuestBody() {
  return [
    operation("core.inventory.wealth", {}, "wealth", "wealth-snapshot"),
    operation("core.map.time", {}, "time", "time-snapshot"),
    operation("core.character.party", {}, "members", "character-snapshot-array"),
    {
      kind: "declare",
      name: "healthy",
      valueType: "bool",
      value: {
        kind: "collection",
        operation: "any",
        collection: variable("members"),
        itemName: "member",
        predicate: member(variable("member"), "alive")
      },
      sourceNode: "healthy-party"
    },
    {
      kind: "if",
      condition: binary(
        "and",
        binary(
          "and",
          binary(">=", member(variable("wealth"), "gold"), literal(500)),
          binary("<=", member(variable("time"), "day"), literal(3))
        ),
        variable("healthy")
      ),
      then: [
        operation(
          "core.inventory.take-wealth",
          { gold: literal(500) },
          "paid",
          "bool"
        ),
        operation("core.state.write", {
          scope: literal("campaign"),
          name: literal("paid_the_captain"),
          value: literal(true)
        }),
        operation("core.presentation.text", {
          text: literal("The captain accepts your payment.")
        }),
        operation(
          "core.presentation.choice",
          {
            prompt: literal("Will you take the captain's contract?"),
            options: literal(["Accept", "Decline"])
          },
          "contract_choice",
          "int"
        ),
        {
          kind: "if",
          condition: binary("==", variable("contract_choice"), literal(0)),
          then: [
            operation("core.state.write", {
              scope: literal("campaign"),
              name: literal("quest_stage"),
              value: literal(1)
            }),
            operation("core.map.teleport", {
              levelType: literal("land"),
              levelIndex: literal(0),
              x: literal(11),
              y: literal(12)
            }),
            operation("core.encounter.start-battle", {
              battleId: literal(0)
            }),
            operation("core.state.write", {
              scope: literal("campaign"),
              name: literal("quest_stage"),
              value: literal(2)
            }),
            operation("core.presentation.text", {
              text: literal("The contract is complete. The captain records your success.")
            })
          ],
          else: [
            operation("core.presentation.text", {
              text: literal("The captain leaves the contract open for your return.")
            })
          ],
          sourceNode: "captain-contract-choice"
        },
        returnOutcome("continue")
      ],
      else: [
        operation("core.presentation.text", {
          text: literal("You have returned too late or without the money.")
        }),
        returnOutcome("continue")
      ],
      sourceNode: "captain-conditions"
    }
  ];
}

function operation(capability, arguments_ = {}, result = "", declaredType = "") {
  operationSequence += 1;
  const node = {
    kind: "operation",
    capability,
    arguments: arguments_,
    sourceNode: `${capability.replaceAll(".", "-")}-${operationSequence}`
  };
  if (result) {
    node.result = result;
    node.declaredType = declaredType;
  }
  return node;
}

function returnOutcome(kind) {
  returnSequence += 1;
  return {
    kind: "return",
    value: {
      kind: "record",
      fields: { kind: literal(kind) }
    },
    sourceNode: `return-${kind}-${returnSequence}`
  };
}

function literal(value) {
  return { kind: "literal", value };
}

function variable(name) {
  return { kind: "variable", scope: "local", name };
}

function member(object, name) {
  return { kind: "member", object, member: name };
}

function binary(operator, left, right) {
  return { kind: "binary", operator, left, right };
}

function collectSourceNodes(value) {
  const nodes = {};
  let line = 1;
  const visit = (candidate) => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== "object") return;
    if (typeof candidate.sourceNode === "string" && !(candidate.sourceNode in nodes)) {
      nodes[candidate.sourceNode] = { line, column: 1 };
      line += 1;
    }
    Object.values(candidate).forEach(visit);
  };
  visit(value);
  return nodes;
}
