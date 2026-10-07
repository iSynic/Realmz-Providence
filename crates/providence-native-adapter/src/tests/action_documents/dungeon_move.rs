use super::*;

fn describe(session: &mut EditorSession, values: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.37",
            "targetNativeId": 37,
            "values": values,
            "context": {}
        }}),
    )
    .expect("describe dungeon move through adapter")
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
fn adapter_exposes_named_dungeon_heading_and_inactive_land_return() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let entry = describe(
        &mut session,
        json!({"mode": 0, "level": 3, "x": 12, "y": 9, "signedHeading": -2}),
    );
    assert_eq!(field(&entry, "level")["label"], "Dungeon Level");
    assert_eq!(field(&entry, "signedHeading")["control"], "choice");
    assert_eq!(
        field(&entry, "signedHeading")["choices"][5]["label"],
        "East · 3D view only"
    );

    let returning = describe(
        &mut session,
        json!({"mode": 1, "level": 4, "x": 8, "y": 6, "signedHeading": -27}),
    );
    assert_eq!(field(&returning, "level")["label"], "Land Level");
    assert_eq!(field(&returning, "signedHeading")["value"], -27);
    assert_eq!(field(&returning, "signedHeading")["editable"], false);
    assert_eq!(session.snapshot(), &before);
}
