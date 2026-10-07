use super::*;

fn describe(session: &mut EditorSession, values: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.67",
            "targetNativeId": 33,
            "values": values,
            "context": {}
        }}),
    )
    .expect("describe Branch on Item Charges through the adapter")
}

fn assert_not_reference(field: &Value) {
    assert!(field["targetKind"].is_null(), "{field}");
    assert!(field["preview"].is_null(), "{field}");
}

#[test]
fn charge_branch_sentinel_is_not_applied_to_xap_failure() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for mode in [0, 1, 2] {
        let definition =
            providence_core::action_authoring::action_definition_for_opcode(67).unwrap();
        let values = providence_core::action_authoring::decode_form_values(
            definition.form_id.as_deref().unwrap(),
            [851, mode, 12, -1, -1],
        )
        .unwrap();
        let description = describe(&mut session, serde_json::to_value(values).unwrap());
        let fields = description["fields"].as_array().unwrap();
        let field = |key: &str| fields.iter().find(|field| field["key"] == key).unwrap();
        assert_eq!(field("minimumCharges")["key"], "minimumCharges");
        assert_eq!(field("minimumCharges")["minimum"], 0);
        assert_eq!(field("minimumCharges")["maximum"], i16::MAX);
        assert_not_reference(field("minimumCharges"));
        if mode == 0 {
            assert_eq!(field("successTarget")["targetKind"], "extra-action-point");
        } else {
            assert_not_reference(field("successTarget"));
        }
        assert_eq!(
            field("failureTarget")["targetKind"],
            [
                "extra-action-point",
                "simple-encounter",
                "complex-encounter"
            ][mode as usize]
        );
        assert!(
            field("failureTarget")["specialValues"]
                .as_array()
                .unwrap()
                .is_empty()
        );
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn imported_negative_charge_requirement_stays_exact_but_is_not_new_authoring() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    let description = describe(
        &mut session,
        json!({"item": 851, "branchMode": 0, "minimumCharges": -4,
            "successTarget": 33, "failureTarget": 34}),
    );
    let requirement = description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == "minimumCharges")
        .unwrap();
    assert_eq!(requirement["value"], -4);
    assert_eq!(requirement["minimum"], 0);
    assert_not_reference(requirement);
    assert_eq!(session.snapshot(), &before);
}
