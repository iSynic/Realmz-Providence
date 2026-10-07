use super::*;

fn describe(opcode: i16, values: Value) -> Value {
    dispatch_result(
        &mut EditorSession::new(demo_snapshot()),
        "action-form.describe",
        json!({"query": {
            "actionIdentity": format!("realmz.action.{opcode}"),
            "targetNativeId": 33,
            "values": values,
            "context": {}
        }}),
    )
    .unwrap()
}

fn choice_label(description: &Value, key: &str, value: i16) -> String {
    description["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == key)
        .unwrap()["choices"]
        .as_array()
        .unwrap()
        .iter()
        .find(|choice| choice["value"] == value)
        .unwrap()["label"]
        .as_str()
        .unwrap()
        .into()
}

fn mode_choice_label(description: &Value, key: &str, value: i16) -> String {
    description["authoring"]["controls"]
        .as_array()
        .unwrap()
        .iter()
        .find(|control| control["key"] == key)
        .unwrap()["choices"]
        .as_array()
        .unwrap()
        .iter()
        .find(|choice| choice["value"] == value)
        .unwrap()["label"]
        .as_str()
        .unwrap()
        .into()
}

#[test]
fn adapter_delivers_named_classic_conditions_and_difficulty() {
    let party = describe(
        40,
        json!({"expectedState": 1, "branchMode": 0, "branchTarget": 0,
            "condition": 8, "unused": 0}),
    );
    assert_eq!(choice_label(&party, "condition", 8), "Charm resistance");
    let destination = party["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == "branchTarget")
        .unwrap();
    assert_eq!(destination["editable"], false);
    assert_eq!(
        destination["availabilityReason"],
        "No branch does not use a destination."
    );

    let mutation = describe(
        43,
        json!({"scope": 0, "condition": 26, "durationOrDelta": 1,
            "sound": 0, "unused": 0}),
    );
    assert_eq!(choice_label(&mutation, "condition", 26), "Turned to stone");

    let difficulty = describe(
        58,
        json!({"testA": 3, "successBehavior": 2, "branchMode": 0,
            "target": 0, "slot": 0}),
    );
    assert_eq!(choice_label(&difficulty, "testA", 3), "Normal");

    assert_named_character_condition_choices();
}

fn assert_named_character_condition_choices() {
    let picked = describe(
        55,
        json!({"pickedSelector": -3, "failureBehavior": 0, "unused": 0,
            "successMacro": 0, "failureTarget": 0}),
    );
    assert_eq!(
        choice_label(&picked, "pickedSelector", -3),
        "At least 3 characters are picked"
    );
    assert_eq!(
        picked["fields"]
            .as_array()
            .unwrap()
            .iter()
            .find(|field| field["key"] == "pickedSelector")
            .unwrap()["control"],
        "choice"
    );

    let character = describe(
        81,
        json!({"condition": 39, "characterSelector": -1, "unused": 0,
            "trueMacro": 0, "falseMacro": 0}),
    );
    assert_eq!(choice_label(&character, "condition", 39), "Silenced");
    assert_eq!(
        choice_label(&character, "characterSelector", -1),
        "Currently picked characters"
    );
}

#[test]
fn adapter_delivers_named_branch_modes_and_signed_party_state() {
    let ally = describe(
        87,
        json!({"testSelector": 17, "branchModeOrValue": 2, "falseBehavior": 1,
            "trueTarget": 3, "falseTarget": 4}),
    );
    assert_eq!(
        choice_label(&ally, "branchModeOrValue", 2),
        "Complex Encounter"
    );
    let false_target = ally["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == "falseTarget")
        .unwrap();
    assert_eq!(false_target["editable"], false);
    assert_eq!(
        false_target["availabilityReason"],
        "Continue current script does not use a missing-character destination."
    );

    let scoped = dispatch_result(
        &mut EditorSession::new(demo_snapshot()),
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.86", "targetNativeId": 33,
            "values": {"testSelector": 2, "signedTestValue": 2, "branchMode": 0,
                "trueTarget": 0, "falseTarget": 0},
            "context": {"authoring": {
                "modes": {"characterScope": 1},
                "selections": {"signedTestValue": 1}
            }}
        }}),
    )
    .unwrap();
    assert_eq!(scoped["authoring"]["resolvedValues"]["signedTestValue"], -1);
    assert_eq!(choice_label(&scoped, "signedTestValue", 1), "Male");

    let boat = describe(
        86,
        json!({"testSelector": 3, "signedTestValue": 77, "branchMode": 0,
            "trueTarget": 0, "falseTarget": 0}),
    );
    let inactive = boat["fields"]
        .as_array()
        .unwrap()
        .iter()
        .find(|field| field["key"] == "signedTestValue")
        .unwrap();
    assert_eq!(inactive["visible"], false);
    assert_eq!(inactive["value"], 77);
}

#[test]
fn adapter_delivers_named_keep_or_set_move_destinations() {
    let moved = dispatch_result(
        &mut EditorSession::new(demo_snapshot()),
        "action-form.describe",
        json!({"query": {
            "actionIdentity": "realmz.action.45", "targetNativeId": 33,
            "values": {"levelOrKeep": 8, "xOrKeep": 7, "yOrKeep": 6,
                "sound": 44, "message": 55},
            "context": {"authoring": {
                "modes": {"levelOrKeepBehavior": 0, "xOrKeepBehavior": 1,
                    "yOrKeepBehavior": 1},
                "selections": {"xOrKeep": 12, "yOrKeep": 9}
            }}
        }}),
    )
    .unwrap();
    assert_eq!(
        mode_choice_label(&moved, "levelOrKeepBehavior", 0),
        "Keep current"
    );
    assert_eq!(
        mode_choice_label(&moved, "xOrKeepBehavior", 1),
        "Set destination"
    );
    assert_eq!(moved["authoring"]["resolvedValues"]["levelOrKeep"], -1);
    assert_eq!(moved["authoring"]["resolvedValues"]["xOrKeep"], 12);
    assert_eq!(moved["authoring"]["resolvedValues"]["yOrKeep"], 9);
    assert_eq!(moved["authoring"]["resolvedValues"]["sound"], 44);
    assert_eq!(moved["authoring"]["resolvedValues"]["message"], 55);
}
