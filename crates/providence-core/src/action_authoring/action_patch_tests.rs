use super::{
    ActionAuthoringInput, ActionFormDescribeQuery, ActionTargetKind, FormControl,
    describe_action_form,
};
use crate::model::{ProjectSnapshot, StableId};
use std::collections::BTreeMap;

#[test]
fn patch_target_kind_uses_classic_source_encodings() {
    let snapshot = ProjectSnapshot::new_authored(StableId("patch-kind".into()));
    for (stored, expected_mode, expected_kind) in [
        (7, 0, Some(ActionTargetKind::Map)),
        (-1, 1, None),
        (-2, 2, None),
    ] {
        let description =
            describe_action_form(&snapshot, &query(stored, Default::default())).unwrap();
        let control = description
            .authoring
            .controls
            .iter()
            .find(|control| control.key == "patchTargetKind")
            .unwrap();
        assert_eq!(control.value, expected_mode);
        assert_eq!(control.choices[0].label, "Action Point");
        let level = description
            .fields
            .iter()
            .find(|field| field.key == "levelOrCache")
            .unwrap();
        assert_eq!(level.target_kind, expected_kind);
        assert_eq!(
            description.authoring.resolved_values["levelOrCache"],
            stored
        );
    }
}

#[test]
fn named_patch_modes_preserve_pending_level_and_write_exact_sentinels() {
    let snapshot = ProjectSnapshot::new_authored(StableId("patch-change".into()));
    for (mode, expected) in [(0, 12), (1, -1), (2, -2)] {
        let mut authoring = ActionAuthoringInput::default();
        authoring.modes.insert("patchTargetKind".into(), mode);
        authoring.selections.insert("levelOrCache".into(), 12);
        let description = describe_action_form(&snapshot, &query(5, authoring)).unwrap();
        assert_eq!(
            description.authoring.resolved_values["levelOrCache"],
            expected
        );
    }
}

#[test]
fn unsupported_negative_patch_kind_remains_visible_and_exact() {
    let snapshot = ProjectSnapshot::new_authored(StableId("patch-import".into()));
    let description = describe_action_form(&snapshot, &query(-3, Default::default())).unwrap();
    let control = &description.authoring.controls[0];
    assert_eq!(control.value, 3);
    assert!(control.display.contains("-3"));
    let field = description
        .fields
        .iter()
        .find(|field| field.key == "levelOrCache")
        .unwrap();
    assert_eq!(field.control, FormControl::Integer);
    assert_eq!(description.authoring.resolved_values["levelOrCache"], -3);
}

fn query(level_or_cache: i16, authoring: ActionAuthoringInput) -> ActionFormDescribeQuery {
    ActionFormDescribeQuery {
        action_identity: "realmz.action.7".into(),
        target_native_id: 0,
        values: BTreeMap::from([
            ("levelOrCache".into(), level_or_cache),
            ("targetRecord".into(), 33),
            ("macro".into(), 41),
            ("levelKind".into(), 1),
            ("resultSlot".into(), 2),
        ]),
        secondary_values: BTreeMap::new(),
        context: super::ActionFormContext {
            authoring,
            ..Default::default()
        },
    }
}
