use super::*;
use crate::scenario_read::ScenarioArchiveInstruction;

fn safe_scenario() -> Value {
    json!({
        "kind": "realmz2.scenario", "schemaVersion": 3,
        "applicationHooks": {"startGame": "xap:1", "partyDeath": null,
            "endAdventure": null, "shop": null, "temple": null},
        "programs": [{"id": "xap:1", "ownerId": "extra-ap:1",
            "ownerKind": "extra-action-point", "instructions": [
                {"kind": "classicAction", "slot": 0, "rawOpcode": 1,
                    "opcode": 1, "id": 2, "gosub": false, "extraCode": null},
                {"kind": "callScenarioAction", "actionId": "action:1",
                    "arguments": {"amount": {"kind": "literal", "value": 7}}, "result": null}
            ]}],
        "scenarioActions": [{"id": "action:1", "name": "Reward", "description": "",
            "visibility": "public", "category": null, "abiVersion": 1,
            "implementationVersion": 1, "stateSchemaVersion": 1, "parameters": [],
            "returnType": null, "allowedContexts": ["exploration"],
            "requiredCapabilities": [], "persistentState": {}, "backend": "safe",
            "program": {"format": "realmz.safe-bytecode.v1", "instructions": [
                {"kind": "operation", "capability": "party.gold",
                    "arguments": {"amount": {"kind": "literal", "value": 7}}, "result": null},
                {"kind": "return", "value": null}
            ]}}],
        "stateDefinitions": [{"scope": "scenario", "name": "rewarded"}],
        "migrations": [{"from": 1, "to": 2}]
    })
}

fn inspect_scenario(scenario: &Value) -> Result<RebuiltV3ArchiveInspection, RebuiltV3ArchiveError> {
    let mut documents = reimportable_documents();
    documents
        .iter_mut()
        .find(|(path, _)| path == "scenario.json")
        .unwrap()
        .1 = serde_json::to_vec(scenario).unwrap();
    let files = borrowed_files(&documents);
    let manifest = fixture_manifest(&files);
    let archive = write_rebuilt_v3_archive(Cursor::new(Vec::new()), &manifest, &files)
        .unwrap()
        .into_inner();
    inspect_rebuilt_v3_archive(Cursor::new(archive))
}

#[test]
fn inspection_retains_safe_actions_without_enabling_classic_compiler_authoring() {
    let scenario = safe_scenario();
    let inspected = inspect_scenario(&scenario).unwrap();
    assert!(matches!(
        inspected.scenario.programs[0].instructions[1],
        ScenarioArchiveInstruction::CallScenarioAction { .. }
    ));
    assert_eq!(serde_json::to_value(inspected.scenario).unwrap(), scenario);
    assert!(
        serde_json::from_value::<providence_core::rebuilt::RebuiltV3ScenarioDocument>(scenario)
            .is_err()
    );
}

#[test]
fn inspection_rejects_invalid_safe_structure_and_preserves_hook_guard() {
    let mutations = [
        ("/programs/0/instructions/1/kind", json!("unknown")),
        (
            "/programs/0/instructions/1/arguments/amount/kind",
            json!("unknown"),
        ),
        ("/programs/0/instructions/1/arguments", json!([])),
        ("/scenarioActions/0/backend", json!("native")),
        ("/scenarioActions/0/abiVersion", json!(0)),
        ("/scenarioActions/0/program/format", json!("other")),
        (
            "/scenarioActions/0/program/instructions/0/kind",
            json!("unknown"),
        ),
        (
            "/scenarioActions/0/program/instructions/0",
            json!({"kind": "jump", "target": 4097}),
        ),
        (
            "/scenarioActions/0/program/instructions/0",
            json!({"kind": "operation", "capability": "party.gold", "arguments": {},
                "result": null, "unexpected": true}),
        ),
        ("/applicationHooks/startGame", json!("xap:missing")),
    ];
    for (path, replacement) in mutations {
        let mut scenario = safe_scenario();
        *scenario.pointer_mut(path).unwrap() = replacement;
        assert!(inspect_scenario(&scenario).is_err(), "accepted {path}");
    }
    for path in [
        "/programs/0/instructions/1",
        "/scenarioActions/0/program/instructions/0",
    ] {
        let mut scenario = safe_scenario();
        scenario
            .pointer_mut(path)
            .unwrap()
            .as_object_mut()
            .unwrap()
            .remove("result");
        assert!(
            inspect_scenario(&scenario).is_err(),
            "accepted absent result at {path}"
        );
    }
}

fn expressions() -> Vec<Value> {
    let literal = json!({"kind": "literal", "value": null});
    vec![
        literal.clone(),
        json!({"kind": "variable", "scope": "parameter", "stateScope": null, "ownerId": null, "name": "n"}),
        json!({"kind": "array", "values": [literal]}),
        json!({"kind": "record", "fields": {"n": literal}}),
        json!({"kind": "unary", "operator": "-", "operand": literal}),
        json!({"kind": "binary", "operator": "+", "left": literal, "right": literal}),
        json!({"kind": "member", "object": literal, "member": "n"}),
        json!({"kind": "collection", "operation": "any", "collection": literal,
            "itemName": "n", "predicate": literal}),
    ]
}

#[test]
fn inspection_retains_each_expression_and_safe_instruction_form() {
    let mut scenario = safe_scenario();
    let arguments: serde_json::Map<String, Value> = expressions()
        .into_iter()
        .enumerate()
        .map(|(n, value)| (format!("argument{n}"), value))
        .collect();
    scenario["programs"][0]["instructions"][1]["arguments"] = Value::Object(arguments);
    let literal = json!({"kind": "literal", "value": true});
    scenario["scenarioActions"][0]["program"]["instructions"] = json!([
        {"kind": "operation", "capability": "party.gold", "arguments": {}, "result": "gold"},
        {"kind": "callScenarioAction", "actionId": "action:1", "arguments": {}, "result": null},
        {"kind": "setValue", "scope": "local", "stateScope": null, "ownerId": null, "name": "n", "value": literal},
        {"kind": "jumpIfFalse", "condition": literal, "target": 5},
        {"kind": "jump", "target": 5},
        {"kind": "beginForEach", "itemName": "n", "collection": literal, "endTarget": 7},
        {"kind": "nextForEach", "beginTarget": 5},
        {"kind": "return", "value": literal},
        {"kind": "halt", "outcome": {"kind": "finished"}}
    ]);
    let inspected = inspect_scenario(&scenario).unwrap();
    assert_eq!(serde_json::to_value(inspected.scenario).unwrap(), scenario);
}

#[test]
fn inspection_keeps_program_and_expression_array_limits() {
    let mut scenario = safe_scenario();
    let instruction = scenario["programs"][0]["instructions"][0].clone();
    scenario["programs"][0]["instructions"] = json!(vec![instruction; 4097]);
    assert!(inspect_scenario(&scenario).is_err());
    let mut scenario = safe_scenario();
    scenario["programs"][0]["instructions"][1]["arguments"]["amount"] =
        json!({"kind": "array", "values": vec![json!({"kind": "literal", "value": 1}); 257]});
    assert!(inspect_scenario(&scenario).is_err());
}
