use super::*;

#[test]
fn battle_actions_expose_single_or_range_through_actual_adapter_responses() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for opcode in [2, 48, 56, 107] {
        let single = describe(&mut session, opcode, 0, json!({}));
        let control = &single["authoring"]["controls"][0];
        assert_eq!(control["key"], "battleSelection");
        assert_eq!(control["value"], 0);
        assert_eq!(control["activeFields"], json!([]));

        let range = describe(
            &mut session,
            opcode,
            0,
            json!({"authoring": {
                "modes": {"battleSelection": 1},
                "selections": {"battleHigh": 15}
            }}),
        );
        assert_eq!(range["authoring"]["resolvedValues"]["battleHigh"], 15);
        assert_eq!(field(&range, "battleHigh")["control"], "target");
        assert_eq!(field(&range, "battleHigh")["targetKind"], "battle");
    }
    assert_eq!(session.snapshot(), &before);
}

fn describe(session: &mut EditorSession, opcode: i16, high: i16, context: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": format!("realmz.action.{opcode}"),
            "targetNativeId": 1,
            "values": {"battleLow": 12, "battleHigh": high},
            "context": context
        }}),
    )
    .expect("describe Battle selection through adapter")
}

fn field<'a>(description: &'a Value, key: &str) -> &'a Value {
    description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == key)
        .unwrap()
}
