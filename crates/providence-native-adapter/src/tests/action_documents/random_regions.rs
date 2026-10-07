use super::*;

#[test]
fn random_region_frequency_is_a_named_author_task_in_adapter_responses() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let values = json!({"level": 0, "randomRegion": 1, "percent": 250,
        "battleLowOrKeep": -1, "battleHighOrKeep": -1});
    let imported = describe(&mut session, 23, values.clone(), json!({}));
    let control = &imported["authoring"]["controls"][0];
    assert_eq!(control["key"], "encounterFrequency");
    assert_eq!(control["value"], 0);
    assert_eq!(control["choices"][0]["label"], "Use encounter chance");
    assert_eq!(control["choices"][1]["label"], "Disable encounters");
    assert_eq!(control["choices"][2]["label"], "Invisible encounter");
    assert_eq!(field(&imported, "percent")["label"], "Encounter Chance");

    let authored = describe(
        &mut session,
        23,
        values,
        json!({"authoring": {"modes": {"encounterFrequency": 2}}}),
    );
    assert_eq!(authored["authoring"]["resolvedValues"]["percent"], -1);
    assert_eq!(authored["authoring"]["resolvedValues"]["level"], 0);
    assert_eq!(authored["authoring"]["resolvedValues"]["randomRegion"], 1);
    assert_eq!(session.snapshot(), &before);
}

fn describe(session: &mut EditorSession, opcode: i16, values: Value, context: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": format!("realmz.action.{opcode}"),
            "targetNativeId": 23,
            "values": values,
            "context": context
        }}),
    )
    .expect("describe random-region action through adapter")
}

fn field<'a>(description: &'a Value, key: &str) -> &'a Value {
    description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == key)
        .unwrap()
}
