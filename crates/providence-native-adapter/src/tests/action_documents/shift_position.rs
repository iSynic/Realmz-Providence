use super::*;

fn describe(session: &mut EditorSession, values: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.61",
            "targetNativeId": 61,
            "values": values,
            "context": {}
        }}),
    )
    .expect("describe Shift Position through the adapter")
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
fn random_shift_uses_positive_maxima_while_exact_shift_remains_signed() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();

    let exact = describe(
        &mut session,
        json!({"legacyLevel": 0, "xShift": -4, "yShift": 6,
            "randomize": 0, "unused": 0}),
    );
    assert_eq!(field(&exact, "xShift")["minimum"], i16::MIN);
    assert_eq!(field(&exact, "yShift")["minimum"], i16::MIN);

    let random = describe(
        &mut session,
        json!({"legacyLevel": 0, "xShift": 4, "yShift": 6,
            "randomize": 1, "unused": 0}),
    );
    assert_eq!(field(&random, "xShift")["minimum"], 1);
    assert_eq!(field(&random, "yShift")["minimum"], 1);
    assert!(field(&random, "xShift")["targetKind"].is_null());
    assert!(field(&random, "yShift")["targetKind"].is_null());
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn invalid_imported_random_maxima_are_reported_without_snapshot_mutation() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let imported = describe(
        &mut session,
        json!({"legacyLevel": 0, "xShift": 0, "yShift": -6,
            "randomize": 1, "unused": 42}),
    );
    assert_eq!(field(&imported, "xShift")["value"], 0);
    assert_eq!(field(&imported, "yShift")["value"], -6);
    assert_eq!(field(&imported, "xShift")["minimum"], 1);
    assert_eq!(field(&imported, "yShift")["minimum"], 1);
    assert_eq!(session.snapshot(), &before);
}
