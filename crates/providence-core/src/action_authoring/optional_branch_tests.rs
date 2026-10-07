use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:164-197, 201-286 and 1201-1325 guards each
// destination with a nonzero value before dispatching by branch mode.
#[test]
fn zero_branch_destinations_are_named_continue_choices_not_raw_numbers() {
    let snapshot = ProjectSnapshot::new_authored(StableId("optional-branch".into()));
    for opcode in [77, 78, 86] {
        let description = describe(&snapshot, opcode, [0, 1, 0, 0, 0], Default::default());
        for (key, label) in [
            ("falseDestination", "False result"),
            ("trueDestination", "True result"),
        ] {
            let control = control(&description, key);
            assert_eq!(control.label, label);
            assert_eq!(control.value, 0);
            assert_eq!(control.choices[0].label, "Continue current script");
            assert_eq!(control.choices[1].label, "Branch");
            assert!(control.active_fields.is_empty());
        }
    }
}

#[test]
fn branch_destinations_use_the_selected_record_family() {
    use ActionTargetKind::{ComplexEncounter, ExtraActionPoint, SimpleEncounter};
    let snapshot = ProjectSnapshot::new_authored(StableId("optional-branch-kind".into()));
    for (branch_mode, kind) in [
        (0, ExtraActionPoint),
        (1, SimpleEncounter),
        (2, ComplexEncounter),
    ] {
        let description = describe(
            &snapshot,
            78,
            [1, 0, branch_mode, 31, 62],
            Default::default(),
        );
        assert_eq!(field(&description, "falseTarget").target_kind, Some(kind));
        assert_eq!(field(&description, "trueTarget").target_kind, Some(kind));
        assert_eq!(control(&description, "falseDestination").value, 1);
        assert_eq!(control(&description, "trueDestination").value, 1);
    }
}

#[test]
fn mode_changes_preserve_pending_targets_and_reject_incomplete_branches() {
    let snapshot = ProjectSnapshot::new_authored(StableId("optional-branch-mode".into()));
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("falseDestination".into(), 0);
    let no_branch = describe(&snapshot, 77, [1, 5, 0, 31, 62], authoring);
    assert_eq!(no_branch.authoring.resolved_values["falseTarget"], 0);
    assert_eq!(no_branch.authoring.resolved_values["trueTarget"], 62);

    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("falseDestination".into(), 1);
    let restored = describe(&snapshot, 77, [1, 5, 0, 31, 62], authoring);
    assert_eq!(restored.authoring.resolved_values["falseTarget"], 31);

    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("trueDestination".into(), 1);
    let incomplete = describe(&snapshot, 77, [1, 5, 0, 0, 0], authoring);
    assert_eq!(
        incomplete.authoring.errors,
        ["Select a positive True destination before applying."]
    );
}

#[test]
fn unsupported_imported_destination_is_preserved_without_an_invented_link() {
    let snapshot = ProjectSnapshot::new_authored(StableId("optional-branch-import".into()));
    let description = describe(&snapshot, 86, [3, 0, 7, -4, 9], Default::default());
    for key in ["falseDestination", "trueDestination"] {
        let control = control(&description, key);
        assert_eq!(control.value, 2);
        assert!(control.active_fields.is_empty());
        assert!(control.display.contains("retained unchanged"));
    }
    assert_eq!(description.authoring.resolved_values["trueTarget"], -4);
    assert_eq!(description.authoring.resolved_values["falseTarget"], 9);
}

#[test]
fn quest_test_value_uses_the_classic_quest_value_range() {
    let snapshot = ProjectSnapshot::new_authored(StableId("quest-test-range".into()));
    for value in [-128, -127, 0, 127, 128] {
        let description = describe(&snapshot, 77, [1, value, 0, 0, 0], Default::default());
        let test_value = field(&description, "testB");
        assert_eq!(test_value.value, value);
        assert_eq!(test_value.minimum, -127);
        assert_eq!(test_value.maximum, 127);
        assert!(test_value.target_kind.is_none());
        assert!(test_value.preview.is_none());
    }
}

fn describe(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    let form_id = action_definition_for_opcode(opcode)
        .unwrap()
        .form_id
        .unwrap();
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: format!("realmz.action.{opcode}"),
            target_native_id: 1,
            values: decode_form_values(&form_id, words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                ..Default::default()
            },
        },
    )
    .unwrap()
}

fn control<'a>(description: &'a ActionFormDescription, key: &str) -> &'a AuthoringModeControl {
    description
        .authoring
        .controls
        .iter()
        .find(|control| control.key == key)
        .unwrap()
}

fn field<'a>(description: &'a ActionFormDescription, key: &str) -> &'a DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == key)
        .unwrap()
}
