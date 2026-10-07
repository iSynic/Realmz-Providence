use super::*;
use crate::model::{ProjectSnapshot, StableId};

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.86".into(),
            target_native_id: 1,
            values: decode_form_values("misc-conditional-branch", words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                ..Default::default()
            },
        },
    )
    .unwrap()
}

#[test]
fn signed_character_tests_expose_scope_and_typed_operand() {
    let snapshot = ProjectSnapshot::new_authored(StableId("misc-condition".into()));
    let description = describe(&snapshot, [0, -3, 0, 0, 0], Default::default());
    assert_eq!(description.authoring.controls[0].value, 1);
    let caste = description
        .fields
        .iter()
        .find(|field| field.index == Some(1))
        .unwrap();
    assert_eq!(caste.label, "Caste");
    assert_eq!(caste.control, FormControl::Target);
    assert_eq!(caste.value, 3);
    assert_eq!(caste.target_kind, Some(ActionTargetKind::Caste));

    let gender = describe(&snapshot, [2, -2, 0, 0, 0], Default::default());
    let field = gender
        .fields
        .iter()
        .find(|field| field.index == Some(1))
        .unwrap();
    assert_eq!(field.control, FormControl::Choice);
    assert_eq!(field.value, 2);
    assert_eq!(field.choices[1].label, "Female");
}

#[test]
fn scope_changes_only_the_sign_and_boat_tests_hide_the_unused_word() {
    let snapshot = ProjectSnapshot::new_authored(StableId("misc-condition".into()));
    let scoped = describe(
        &snapshot,
        [2, 2, 0, 0, 0],
        ActionAuthoringInput {
            modes: [("characterScope".into(), 1)].into(),
            selections: [("signedTestValue".into(), 1)].into(),
        },
    );
    assert_eq!(scoped.authoring.resolved_values["signedTestValue"], -1);
    let boat = describe(&snapshot, [3, 77, 0, 0, 0], Default::default());
    assert_eq!(boat.authoring.controls.len(), 2);
    assert!(
        boat.authoring
            .controls
            .iter()
            .all(|control| control.key.ends_with("Destination"))
    );
    let field = boat
        .fields
        .iter()
        .find(|field| field.index == Some(1))
        .unwrap();
    assert!(!field.visible);
    assert!(!field.editable);
    assert_eq!(field.value, 77);

    let pending = describe(
        &snapshot,
        [3, 77, 0, 0, 0],
        ActionAuthoringInput {
            modes: [("characterScope".into(), 1)].into(),
            selections: [("signedTestValue".into(), 1)].into(),
        },
    );
    assert!(
        pending
            .authoring
            .controls
            .iter()
            .all(|control| control.key != "characterScope")
    );
    assert_eq!(pending.authoring.resolved_values["signedTestValue"], 77);
}
