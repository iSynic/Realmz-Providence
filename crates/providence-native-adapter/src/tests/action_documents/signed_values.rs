use super::*;

fn describe(session: &mut EditorSession, opcode: i16, values: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {"actionIdentity": format!("realmz.action.{opcode}"),
            "targetNativeId": opcode, "values": values, "context": {}}}),
    )
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

#[test]
fn sound_switch_is_scalar_and_inactive_sound_value_is_preserved() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let mut values = json!({"signedRollCount": 1, "lowOrSound": 33,
        "high": 40, "playSound": 33, "message": 0});
    let enabled = describe(&mut session, 74, values.clone());
    assert!(field(&enabled, "playSound")["targetKind"].is_null());
    assert_eq!(field(&enabled, "lowOrSound")["control"], "integer");
    assert_eq!(field(&enabled, "lowOrSound")["uses"][0]["role"], "quantity");
    assert_eq!(
        field(&enabled, "lowOrSound")["uses"][1]["targetKind"],
        "sound"
    );
    values["playSound"] = json!(0);
    let disabled = describe(&mut session, 74, values);
    assert!(field(&disabled, "lowOrSound")["targetKind"].is_null());
    assert_eq!(field(&disabled, "lowOrSound")["value"], 33);
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn random_magnitude_ranges_reject_new_negative_input_without_rewriting_imports() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for (opcode, values, low_key) in [
        (
            15,
            json!({"multiplier": 2, "low": -3, "high": -8, "sound": 0, "message": 0}),
            "low",
        ),
        (
            16,
            json!({"multiplier": 2, "low": -3, "high": -8, "sound": 0, "message": 0}),
            "low",
        ),
        (
            74,
            json!({"signedRollCount": 2, "lowOrSound": -3, "high": -8,
                "playSound": 0, "message": 0}),
            "lowOrSound",
        ),
    ] {
        let description = describe(&mut session, opcode, values);
        assert_eq!(field(&description, low_key)["minimum"], 0);
        assert_eq!(field(&description, "high")["minimum"], 0);
        assert_eq!(field(&description, low_key)["value"], -3);
        assert_eq!(field(&description, "high")["value"], -8);
        assert!(field(&description, low_key)["targetKind"].is_null());
        assert!(field(&description, "high")["targetKind"].is_null());
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn spell_point_direction_is_a_named_author_choice_not_a_signed_number_task() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let imported = describe(
        &mut session,
        74,
        json!({"signedRollCount": -10,
        "lowOrSound": 1, "high": 6, "playSound": 0, "message": 91}),
    );
    let control = &imported["authoring"]["controls"][0];
    assert_eq!(control["key"], "spellPointDirection");
    assert_eq!(control["value"], 1);
    assert_eq!(control["choices"][0]["label"], "Give spell points");
    assert_eq!(control["choices"][1]["label"], "Take spell points");
    assert_eq!(field(&imported, "signedRollCount")["value"], 10);

    let changed = describe_with_authoring(
        &mut session,
        74,
        json!({"signedRollCount": -10, "lowOrSound": 1, "high": 6,
            "playSound": 0, "message": 91}),
        "spellPointDirection",
        0,
        "signedRollCount",
        8,
    );
    assert_eq!(changed["authoring"]["resolvedValues"]["signedRollCount"], 8);
    assert_eq!(changed["authoring"]["resolvedValues"]["message"], 91);
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn payment_currency_is_a_named_author_choice_not_a_signed_number_task() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let values = json!({"signedAmount": -250, "failureMarker": 0,
        "branchMode": 0, "target": 40, "slot": 0});
    let imported = describe(&mut session, 33, values.clone());
    assert_eq!(imported["title"], "Take Gold Or Gems");
    let control = &imported["authoring"]["controls"][0];
    assert_eq!(control["key"], "paymentCurrency");
    assert_eq!(control["value"], 1);
    assert_eq!(control["choices"][0]["label"], "Gold");
    assert_eq!(control["choices"][1]["label"], "Gems");
    assert_eq!(field(&imported, "signedAmount")["value"], 250);

    let changed = describe_with_authoring(
        &mut session,
        33,
        values,
        "paymentCurrency",
        0,
        "signedAmount",
        125,
    );
    assert_eq!(changed["authoring"]["resolvedValues"]["signedAmount"], 125);
    assert_eq!(changed["authoring"]["resolvedValues"]["target"], 40);
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn condition_duration_is_a_named_author_choice_not_a_signed_number_task() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let values = json!({"scope": 0, "condition": 5,
        "durationOrDelta": -6, "sound": 91, "unused": 44});
    let imported = describe(&mut session, 43, values.clone());
    let control = &imported["authoring"]["controls"][0];
    assert_eq!(control["key"], "conditionDuration");
    assert_eq!(control["value"], 1);
    assert_eq!(control["choices"][0]["label"], "Timed");
    assert_eq!(control["choices"][1]["label"], "Permanent");
    assert_eq!(field(&imported, "durationOrDelta")["value"], 6);

    let changed = describe_with_authoring(
        &mut session,
        43,
        values,
        "conditionDuration",
        0,
        "durationOrDelta",
        8,
    );
    assert_eq!(changed["authoring"]["resolvedValues"]["durationOrDelta"], 8);
    assert_eq!(changed["authoring"]["resolvedValues"]["sound"], 91);
    assert_eq!(session.snapshot(), &before);
}

fn describe_with_authoring(
    session: &mut EditorSession,
    opcode: i16,
    values: Value,
    mode_key: &str,
    mode: i16,
    selection_key: &str,
    selection: i16,
) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
        "actionIdentity": format!("realmz.action.{opcode}"), "targetNativeId": opcode,
        "values": values, "context": {"authoring": {"modes": {mode_key: mode},
            "selections": {selection_key: selection}}}}}),
    )
    .unwrap()
}
