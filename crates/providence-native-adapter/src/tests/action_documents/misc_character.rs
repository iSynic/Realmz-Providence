use super::*;

fn describe(session: &mut EditorSession, selector: i16, value: i16) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.52",
            "targetNativeId": 52,
            "values": {"selector": selector, "value": value,
                "sourceSet": 0, "unused3": 0, "unused4": 0},
            "context": {}
        }}),
    )
    .expect("describe miscellaneous character check")
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
fn adapter_projects_mode_specific_character_check_controls() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let item = describe(&mut session, 2, 851);
    assert_eq!(field(&item, "value")["targetKind"], "item");
    assert_eq!(field(&item, "value")["label"], "Item To Possess");

    let attribute = describe(&mut session, 4, 6);
    assert_eq!(field(&attribute, "value")["control"], "choice");
    assert_eq!(field(&attribute, "value")["choices"][5]["label"], "Luck");

    let resistance = describe(&mut session, 5, 3);
    assert_eq!(
        field(&resistance, "value")["choices"][3]["label"],
        "Electrical"
    );
    let chance = describe(&mut session, 3, 33);
    assert_eq!(field(&chance, "value")["minimum"], 0);
    assert_eq!(field(&chance, "value")["maximum"], 100);
    assert!(field(&chance, "value")["targetKind"].is_null());
    let current = describe(&mut session, 6, 317);
    assert!(
        current["authoring"]["controls"][0]["activeFields"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(current["authoring"]["resolvedValues"]["value"], 317);
    assert_eq!(session.snapshot(), &before);
}
