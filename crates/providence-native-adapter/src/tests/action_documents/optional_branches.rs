use super::*;

#[test]
fn optional_branch_destinations_are_named_and_typed_in_adapter_responses() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for opcode in [77, 78, 86] {
        let none = describe(&mut session, opcode, 0, 0, json!({}));
        assert_eq!(control(&none, "falseDestination")["value"], 0);
        assert_eq!(control(&none, "trueDestination")["value"], 0);
        assert_eq!(
            control(&none, "falseDestination")["activeFields"],
            json!([])
        );

        let branch = describe(
            &mut session,
            opcode,
            0,
            0,
            json!({"authoring": {
                "modes": {"falseDestination": 1, "trueDestination": 1},
                "selections": {"falseTarget": 3, "trueTarget": 4}
            }}),
        );
        assert_eq!(branch["authoring"]["resolvedValues"]["falseTarget"], 3);
        assert_eq!(branch["authoring"]["resolvedValues"]["trueTarget"], 4);
        assert_eq!(
            field(&branch, "falseTarget")["targetKind"],
            "extra-action-point"
        );
        assert_eq!(field(&branch, "trueTarget")["control"], "target");
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn quest_test_value_is_bounded_without_becoming_a_reference() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for value in [-128, 5, 128] {
        let description = dispatch_result(
            &mut session,
            "action-form.describe",
            json!({"query": {
                "actionIdentity": "realmz.action.77", "targetNativeId": 77,
                "values": {"quest": 1, "testB": value, "branchMode": 0,
                    "falseTarget": 0, "trueTarget": 0},
                "context": {}
            }}),
        )
        .unwrap();
        let test_value = field(&description, "testB");
        assert_eq!(test_value["value"], value);
        assert_eq!(test_value["minimum"], -127);
        assert_eq!(test_value["maximum"], 127);
        assert!(test_value["targetKind"].is_null());
        assert!(test_value["preview"].is_null());
    }
    assert_eq!(session.snapshot(), &before);
}

fn describe(
    session: &mut EditorSession,
    opcode: i16,
    false_target: i16,
    true_target: i16,
    context: Value,
) -> Value {
    let values = match opcode {
        77 => json!({"quest": 1, "testB": 5, "branchMode": 0,
            "falseTarget": false_target, "trueTarget": true_target}),
        78 => json!({"testA": 1, "testB": 0, "branchMode": 0,
            "falseTarget": false_target, "trueTarget": true_target}),
        86 => json!({"testSelector": 3, "signedTestValue": 0, "branchMode": 0,
            "trueTarget": true_target, "falseTarget": false_target}),
        _ => unreachable!(),
    };
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": format!("realmz.action.{opcode}"),
            "targetNativeId": 1,
            "values": values,
            "context": context
        }}),
    )
    .expect("describe optional branch through adapter")
}

fn control<'a>(description: &'a Value, key: &str) -> &'a Value {
    description["authoring"]["controls"]
        .as_array()
        .unwrap()
        .iter()
        .find(|control| control["key"] == key)
        .unwrap()
}

fn field<'a>(description: &'a Value, key: &str) -> &'a Value {
    description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == key)
        .unwrap()
}
