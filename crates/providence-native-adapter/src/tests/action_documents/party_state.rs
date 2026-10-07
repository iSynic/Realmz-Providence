use super::*;

#[test]
fn distribution_is_named_and_never_inferred_as_a_link() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for (mode, label) in [
        (0, "Each character"),
        (1, "Picked characters"),
        (2, "Spread across party"),
        (77, "77"),
    ] {
        let description = dispatch_result(
            &mut session,
            "action-form.describe",
            json!({"query": {
                "actionIdentity": "realmz.action.90", "targetNativeId": 33,
                "values": {"amount": 120, "scope": mode, "unused": -7,
                    "unused__word4": 8, "unused__word5": 9},
                "context": {}
            }}),
        )
        .expect("describe party-state action through the adapter");
        let amount = description["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|field| field["key"] == "amount")
            .unwrap();
        assert_eq!(amount["minimum"], 0);
        assert_eq!(amount["maximum"], i16::MAX);
        assert_eq!(amount["units"], "victory points");
        assert!(amount["targetKind"].is_null());
        assert!(amount["preview"].is_null());
        let distribution = description["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|field| field["key"] == "scope")
            .unwrap();
        assert_eq!(distribution["label"], "Distribution");
        assert_eq!(distribution["control"], "choice");
        assert_eq!(distribution["value"], mode);
        assert!(distribution["targetKind"].is_null());
        assert!(distribution["preview"].is_null());
        assert!(description["summary"].as_str().unwrap().contains(label));
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn imported_negative_amount_remains_exact_while_new_authoring_is_nonnegative() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let description = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.90", "targetNativeId": 33,
            "values": {"amount": -120, "scope": 0},
            "context": {}
        }}),
    )
    .expect("describe imported party-state amount through the adapter");
    let amount = description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == "amount")
        .unwrap();
    assert_eq!(amount["value"], -120);
    assert_eq!(amount["minimum"], 0);
    assert_eq!(session.snapshot(), &before);
}
