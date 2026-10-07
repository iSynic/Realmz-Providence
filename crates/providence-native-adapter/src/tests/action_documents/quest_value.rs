use super::*;

#[test]
fn quest_auto_branch_is_named_bounded_and_typed_in_adapter_responses() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let disabled = describe(&mut session, json!({}));
    assert_eq!(control(&disabled)["key"], "autoBranch");
    assert_eq!(control(&disabled)["value"], 0);
    assert_eq!(control(&disabled)["activeFields"], json!([]));
    assert_eq!(field(&disabled, "delta")["minimum"], -127);
    assert_eq!(field(&disabled, "delta")["maximum"], 127);

    let enabled = describe(
        &mut session,
        json!({"authoring": {
            "modes": {"autoBranch": 1},
            "selections": {"branchMode": 1, "threshold": 50, "target": 0}
        }}),
    );
    assert_eq!(enabled["authoring"]["resolvedValues"]["threshold"], 50);
    assert_eq!(
        field(&enabled, "target")["targetKind"],
        "extra-action-point"
    );
    assert_eq!(field(&enabled, "target")["minimum"], 0);
    assert_eq!(session.snapshot(), &before);
}

fn describe(session: &mut EditorSession, context: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.76",
            "targetNativeId": 1,
            "values": {"quest": 4, "delta": 8, "branchMode": 3,
                "threshold": 0, "target": 91},
            "context": context
        }}),
    )
    .expect("describe quest value through adapter")
}

fn control(description: &Value) -> &Value {
    &description["authoring"]["controls"][0]
}

fn field<'a>(description: &'a Value, key: &str) -> &'a Value {
    description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == key)
        .unwrap()
}
