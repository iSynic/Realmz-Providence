use crate::capabilities::{by_method, validate};
use serde_json::{Value, json};

fn check(method: &str, query: Value) -> Result<(), String> {
    let schema = by_method(method).unwrap().input_schema;
    validate(
        &schema,
        &json!({"projectId":"scenario","sessionGeneration":"generation","expectedRevision":7,"query":query}),
    )
}

#[test]
fn forms_accept_signed_words_and_complete_native_context() {
    let query = json!({"actionIdentity":"realmz.action.2","targetNativeId":-32768,
        "values":{"sound":-1101},"secondaryValues":{"message":32767},
        "context":{"targetContext":{"mapIdentity":"land:0","levelType":"land"},
            "scriptKind":"simple-encounter","encounterIdentity":"simple:1",
            "encounterResultIndex":3,"encounterStepIndex":7,
            "authoring":{"modes":{"battleSelection":1},"selections":{"battleHigh":4}}}});
    assert!(check("action-form.describe", query.clone()).is_ok());
    assert!(
        check(
            "action-form.describe",
            json!({"actionIdentity":"realmz.action.9"})
        )
        .is_ok()
    );
    for (pointer, value) in [
        ("/targetNativeId", json!(-32769)),
        ("/values/sound", json!(32768)),
        ("/secondaryValues/message", json!("1")),
        ("/context/targetContext/levelType", json!("combat")),
        ("/context/targetContext/mapIdentity", json!("")),
        ("/context/scriptKind", json!("unknown")),
        ("/context/encounterResultIndex", json!(4)),
        ("/context/encounterStepIndex", json!(8)),
        ("/context/authoring/modes/battleSelection", json!(32768)),
    ] {
        let mut rejected = query.clone();
        *rejected.pointer_mut(pointer).unwrap() = value;
        assert!(
            check("action-form.describe", rejected).is_err(),
            "{pointer}"
        );
    }
    let mut rejected = query.clone();
    rejected["context"]["authoring"]["sourceBytes"] = json!([0]);
    assert!(check("action-form.describe", rejected).is_err());
    let mut rejected = query;
    rejected["values"] = json!(
        (0..65)
            .map(|i| (i.to_string(), json!(0)))
            .collect::<serde_json::Map<_, _>>()
    );
    assert!(check("action-form.describe", rejected).is_err());
    assert!(check("action-form.describe", json!("serialized query")).is_err());
}

#[test]
fn targets_require_typed_kind_and_bounded_pagination() {
    let schema = by_method("action-target.list").unwrap().input_schema;
    assert!(
        schema["required"]
            .as_array()
            .unwrap()
            .contains(&json!("query"))
    );
    let kinds = schema["properties"]["query"]["properties"]["kind"]["enum"]
        .as_array()
        .unwrap();
    assert_eq!(kinds.len(), 26);
    for kind in kinds {
        assert!(
            check(
                "action-target.list",
                json!({"kind":kind,"limit":128,
            "cursor":null,"context":{"mapIdentity":null,"levelType":"dungeon"}})
            )
            .is_ok()
        );
    }
    for query in [
        json!({"limit":1}),
        json!({"kind":"missing","limit":1}),
        json!({"kind":"sound","limit":0}),
        json!({"kind":"sound","limit":129}),
        json!({"kind":"sound","limit":1,"cursor":0}),
        json!({"kind":"sound","limit":1,"context":{"reachable":true}}),
        json!({"kind":"sound","limit":1,"search":"a".repeat(4097)}),
    ] {
        assert!(check("action-target.list", query).is_err());
    }
}

#[test]
fn shared_impact_reuses_closed_native_record_steps() {
    let mut query = json!({"expectedRevision":7,"source":"extra-action-point:1",
        "steps":[{"slot":0,"actionIdentity":"realmz.action.2","targetNativeId":1,
            "settings":{"values":{"sound":-1101}}}],"limit":128});
    assert!(check("action-form.shared-impact", query.clone()).is_ok());
    query["steps"][0]["settings"]["values"]["sound"] = json!(-32769);
    assert!(check("action-form.shared-impact", query.clone()).is_err());
    query["steps"] = json!([]);
    query["limit"] = json!(129);
    assert!(check("action-form.shared-impact", query).is_err());
}
