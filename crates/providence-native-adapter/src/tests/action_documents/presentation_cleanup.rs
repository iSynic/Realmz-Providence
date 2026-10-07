use super::*;

#[test]
fn adapter_excludes_donor_help_fragments_from_author_labels() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();

    let time = describe(
        &mut session,
        63,
        json!({
            "mode": 0, "dayOrDelta": 0, "hourOrDelta": 0,
            "minuteOrDelta": 0, "unused": 0
        }),
    );
    assert_eq!(field(&time, "minuteOrDelta")["label"], "Minute");

    let shop = describe(
        &mut session,
        73,
        json!({
            "shop": 1, "range1Low": 2, "range1High": 3,
            "range2Low": 4, "range2High": 5
        }),
    );
    assert_eq!(field(&shop, "range1Low")["label"], "Range 1 Low Item");
    assert_eq!(field(&shop, "range1High")["label"], "Range 1 High Item");
    assert_eq!(field(&shop, "range2Low")["label"], "Range 2 Low Item");
    assert_eq!(field(&shop, "range2High")["label"], "Range 2 High Item");

    assert_eq!(session.snapshot(), &before);
}

#[test]
fn adapter_uses_compact_established_field_labels() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for (opcode, values, expected) in [
        (
            31,
            json!({"abilityOrAttribute": 1, "adjustment": 0, "attributeFlag": 0, "successMacro": 1, "failureMacro": 2}),
            vec![
                ("adjustment", "Check Modifier"),
                ("failureMacro", "On Failure"),
            ],
        ),
        (
            40,
            json!({"expectedState": 1, "branchMode": 1, "branchTarget": 3, "condition": 0, "unused": 0}),
            vec![("branchMode", "Branch Type")],
        ),
        (
            55,
            json!({"pickedSelector": 0, "failureBehavior": 1, "unused": 0, "successMacro": 3, "failureTarget": 4}),
            vec![
                ("pickedSelector", "Success Condition"),
                ("failureBehavior", "On Failure"),
                ("successMacro", "On Success"),
            ],
        ),
    ] {
        let description = describe(&mut session, opcode, values);
        for (key, label) in expected {
            assert_eq!(field(&description, key)["label"], label);
        }
        if opcode == 31 {
            let selector = field(&description, "abilityOrAttribute");
            assert_eq!(selector["label"], "Special Ability");
            assert_eq!(selector["control"], "choice");
            assert_eq!(selector["choices"][5]["label"], "Acrobatic Act");
            assert!(selector["targetKind"].is_null());
        }
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn adapter_uses_compact_quest_and_region_labels() {
    let mut session = EditorSession::new(demo_snapshot());
    let before = session.snapshot().clone();
    for (opcode, values, expected) in [
        (
            72,
            json!({"testA": 1, "testB": 2, "falseBehavior": 0, "branchMode": 0, "target": 3}),
            vec![
                ("testA", "Quest Range Start"),
                ("testB", "Quest Range End"),
                ("falseBehavior", "Preserved Value 3"),
                ("branchMode", "Branch Type"),
                ("target", "Destination"),
            ],
        ),
        (
            78,
            json!({"testA": 1, "testB": 2, "branchMode": 0, "falseTarget": 3, "trueTarget": 4}),
            vec![
                ("testA", "Tile Test"),
                ("testB", "Specific Tile"),
                ("branchMode", "Branch Type"),
            ],
        ),
        (
            92,
            json!({"level": 0, "rect": 0, "isDungeon": 0, "percentDelta": 0, "shapeMode": -1}),
            vec![
                ("isDungeon", "Map Type"),
                ("percentDelta", "Encounter Chance Adjustment"),
            ],
        ),
    ] {
        let description = describe(&mut session, opcode, values);
        for (key, label) in expected {
            assert_eq!(field(&description, key)["label"], label);
        }
    }
    assert_eq!(session.snapshot(), &before);
}

#[test]
fn action_patch_target_kind_is_named_and_source_encoded() {
    let mut session = EditorSession::new(demo_snapshot());
    let description = describe(
        &mut session,
        7,
        json!({"levelOrCache": -1, "targetRecord": 3, "macro": 4, "levelKind": 0, "resultSlot": 2}),
    );
    let control = &description["authoring"]["controls"][0];
    assert_eq!(control["label"], "Replace Codes In");
    assert_eq!(control["value"], 1);
    assert_eq!(control["choices"][0]["label"], "Action Point");
    assert_eq!(
        description["authoring"]["resolvedValues"]["levelOrCache"],
        -1
    );
}

#[test]
fn action_point_state_uses_named_independent_targets_and_safe_land_range() {
    let mut session = EditorSession::new(demo_snapshot());
    let description = dispatch_result(
        &mut session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.13",
            "targetNativeId": 13,
            "values": {
                "level": 0, "singleTrigger": 21, "percent": 100,
                "rangeStartWithSign": 0, "rangeEnd": 0
            },
            "secondaryValues": {},
            "context": {"authoring": {
                "modes": {"singleTarget": 0, "landRange": 1, "activationState": 0},
                "selections": {"rangeStartWithSign": 13, "rangeEnd": 18}
            }}
        }}),
    )
    .unwrap();
    let controls = description["authoring"]["controls"].as_array().unwrap();
    assert_eq!(controls[0]["label"], "Single Action Point");
    assert_eq!(controls[1]["label"], "Land Action Point Range");
    assert_eq!(controls[2]["label"], "New State");
    assert_eq!(
        description["authoring"]["resolvedValues"]["singleTrigger"],
        0
    );
    assert_eq!(
        description["authoring"]["resolvedValues"]["rangeStartWithSign"],
        13
    );
    assert_eq!(description["authoring"]["resolvedValues"]["rangeEnd"], 18);
    assert_eq!(description["authoring"]["resolvedValues"]["percent"], -1);
    assert_eq!(
        field(&description, "rangeStartWithSign")["control"],
        "target"
    );
    assert_eq!(
        field(&description, "rangeStartWithSign")["targetKind"],
        "same-map-action-point"
    );
}

fn describe(session: &mut EditorSession, opcode: i16, values: Value) -> Value {
    dispatch_result(
        session,
        "action-form.describe",
        json!({"query": {
            "actionIdentity": format!("realmz.action.{opcode}"),
            "targetNativeId": opcode,
            "values": values,
            "secondaryValues": {},
            "context": {}
        }}),
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
