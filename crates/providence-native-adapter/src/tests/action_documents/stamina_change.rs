use super::*;

#[test]
fn stamina_scope_and_direction_are_named_in_actual_adapter_responses() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for (opcode, title) in [(15, "Change Picked Stamina"), (16, "Change Party Stamina")] {
        let imported = describe(&mut session, opcode, -2, json!({}));
        assert_eq!(imported["action"]["label"], title);
        assert_eq!(control(&imported)["key"], "staminaDirection");
        assert_eq!(control(&imported)["value"], 1);
        assert_eq!(field(&imported)["value"], 2);

        let heal = describe(
            &mut session,
            opcode,
            -2,
            json!({"authoring": {
                "modes": {"staminaDirection": 0},
                "selections": {"multiplier": 6}
            }}),
        );
        assert_eq!(heal["authoring"]["resolvedValues"]["multiplier"], 6);
        assert_eq!(field(&heal)["value"], 6);
    }
    assert_eq!(session.snapshot(), &before);
}

fn describe(session: &mut EditorSession, opcode: i16, multiplier: i16, context: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": format!("realmz.action.{opcode}"),
            "targetNativeId": 1,
            "values": {
                "multiplier": multiplier,
                "low": 3,
                "high": 8,
                "sound": 91,
                "message": 44
            },
            "context": context
        }}),
    )
    .expect("describe stamina change through adapter")
}

fn control(description: &Value) -> &Value {
    &description["authoring"]["controls"][0]
}

fn field(description: &Value) -> &Value {
    description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == "multiplier")
        .unwrap()
}
