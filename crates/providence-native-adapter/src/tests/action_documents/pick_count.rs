use super::*;

#[test]
fn pick_count_is_authored_as_named_eligibility_and_positive_count() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let imported = describe(&mut session, -3, json!({}));
    let control = &imported["authoring"]["controls"][0];
    assert_eq!(control["key"], "pickEligibility");
    assert_eq!(control["value"], 1);
    assert_eq!(control["choices"][0]["label"], "Any party member");
    assert_eq!(control["choices"][1]["label"], "Conscious or animated only");
    assert_eq!(
        field(&imported, "targetNativeId")["label"],
        "Number To Pick"
    );

    let authored = describe(
        &mut session,
        3,
        json!({"authoring": {"modes": {"pickEligibility": 1}}}),
    );
    assert_eq!(
        authored["authoring"]["resolvedValues"]["targetNativeId"],
        -3
    );
    assert_eq!(session.snapshot(), &before);
}

fn describe(session: &mut EditorSession, target: i16, context: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.14",
            "targetNativeId": target,
            "values": {},
            "context": context
        }}),
    )
    .expect("describe Pick Characters through adapter")
}

fn field<'a>(description: &'a Value, key: &str) -> &'a Value {
    description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == key)
        .unwrap()
}
