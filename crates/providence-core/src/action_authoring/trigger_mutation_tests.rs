use super::{
    ActionAuthoringInput, ActionFormContext, ActionFormDescribeQuery, ActionTargetKind,
    FormControl, describe_action_form,
};
use crate::model::{ProjectSnapshot, StableId};
use std::collections::BTreeMap;

#[test]
fn single_target_and_land_range_are_independent_named_choices() {
    let snapshot = ProjectSnapshot::new_authored(StableId("trigger-mutation-modes".into()));
    let description =
        describe_action_form(&snapshot, &query([0, 21, 100, 13, 18], Default::default())).unwrap();
    assert_eq!(control(&description, "singleTarget").value, 1);
    assert_eq!(control(&description, "landRange").value, 1);
    assert_eq!(control(&description, "activationState").value, 1);
    for key in ["singleTrigger", "rangeStartWithSign", "rangeEnd"] {
        let field = field(&description, key);
        assert_eq!(field.control, FormControl::Target);
        assert_eq!(
            field.target_kind,
            Some(ActionTargetKind::SameMapActionPoint)
        );
    }
}

#[test]
fn named_modes_write_exact_safe_source_values_and_keep_pending_selections() {
    let snapshot = ProjectSnapshot::new_authored(StableId("trigger-mutation-write".into()));
    let authoring = ActionAuthoringInput {
        modes: BTreeMap::from([
            ("singleTarget".into(), 0),
            ("landRange".into(), 1),
            ("activationState".into(), 0),
        ]),
        selections: BTreeMap::from([
            ("singleTrigger".into(), 22),
            ("rangeStartWithSign".into(), 13),
            ("rangeEnd".into(), 18),
            ("percent".into(), 75),
        ]),
    };
    let description =
        describe_action_form(&snapshot, &query([0, 21, 100, 0, 0], authoring)).unwrap();
    assert_eq!(description.authoring.resolved_values["singleTrigger"], 0);
    assert_eq!(
        description.authoring.resolved_values["rangeStartWithSign"],
        13
    );
    assert_eq!(description.authoring.resolved_values["rangeEnd"], 18);
    assert_eq!(description.authoring.resolved_values["percent"], -1);
}

#[test]
fn negative_dungeon_range_import_is_preserved_without_a_false_picker() {
    let snapshot = ProjectSnapshot::new_authored(StableId("trigger-mutation-import".into()));
    let description = describe_action_form(
        &snapshot,
        &query([3, 13, -100, -13, -18], Default::default()),
    )
    .unwrap();
    let range = control(&description, "landRange");
    assert_eq!(range.value, 2);
    assert!(range.display.contains("-13"));
    for key in ["rangeStartWithSign", "rangeEnd"] {
        let field = field(&description, key);
        assert_eq!(field.control, FormControl::Integer);
        assert_eq!(field.target_kind, None);
    }
    assert_eq!(
        description.authoring.resolved_values["rangeStartWithSign"],
        -13
    );
    assert_eq!(description.authoring.resolved_values["rangeEnd"], -18);
    assert_eq!(description.authoring.resolved_values["percent"], -100);
}

#[test]
fn explicit_authoring_rejects_out_of_table_targets_and_chance() {
    let snapshot = ProjectSnapshot::new_authored(StableId("trigger-mutation-errors".into()));
    let authoring = ActionAuthoringInput {
        modes: BTreeMap::from([
            ("singleTarget".into(), 1),
            ("landRange".into(), 1),
            ("activationState".into(), 1),
        ]),
        selections: BTreeMap::from([
            ("singleTrigger".into(), 0),
            ("rangeStartWithSign".into(), 20),
            ("rangeEnd".into(), 10),
            ("percent".into(), 101),
        ]),
    };
    let description = describe_action_form(&snapshot, &query([0; 5], authoring)).unwrap();
    assert_eq!(description.authoring.errors.len(), 3);
}

fn control<'a>(
    description: &'a super::ActionFormDescription,
    key: &str,
) -> &'a super::AuthoringModeControl {
    description
        .authoring
        .controls
        .iter()
        .find(|control| control.key == key)
        .unwrap()
}

fn field<'a>(
    description: &'a super::ActionFormDescription,
    key: &str,
) -> &'a super::DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == key)
        .unwrap()
}

fn query(words: [i16; 5], authoring: ActionAuthoringInput) -> ActionFormDescribeQuery {
    ActionFormDescribeQuery {
        action_identity: "realmz.action.13".into(),
        target_native_id: 0,
        values: BTreeMap::from([
            ("level".into(), words[0]),
            ("singleTrigger".into(), words[1]),
            ("percent".into(), words[2]),
            ("rangeStartWithSign".into(), words[3]),
            ("rangeEnd".into(), words[4]),
        ]),
        secondary_values: BTreeMap::new(),
        context: ActionFormContext {
            authoring,
            ..Default::default()
        },
    }
}
