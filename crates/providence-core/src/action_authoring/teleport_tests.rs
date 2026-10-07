use super::*;
use crate::model::{ProjectSnapshot, StableId};

fn describe(words: [i16; 5], authoring: ActionAuthoringInput) -> ActionFormDescription {
    describe_action_form(
        &ProjectSnapshot::new_authored(StableId("move-party".into())),
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.45".into(),
            target_native_id: 1,
            values: decode_form_values("teleport", words).unwrap(),
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
fn imported_negative_keep_values_remain_exact_and_named() {
    let description = describe([-2, -1, 4, 0, 0], Default::default());
    assert_eq!(description.authoring.controls[0].value, 0);
    assert_eq!(description.authoring.controls[1].value, 0);
    assert_eq!(description.authoring.controls[2].value, 1);
    assert_eq!(description.authoring.resolved_values["levelOrKeep"], -2);
    assert_eq!(description.authoring.resolved_values["xOrKeep"], -1);
    assert_eq!(description.authoring.resolved_values["yOrKeep"], 4);
}

#[test]
fn named_move_choices_encode_only_the_selected_destination_words() {
    let description = describe(
        [8, 7, 6, 44, 55],
        ActionAuthoringInput {
            modes: [
                ("levelOrKeepBehavior".into(), 0),
                ("xOrKeepBehavior".into(), 1),
                ("yOrKeepBehavior".into(), 1),
            ]
            .into(),
            selections: [("xOrKeep".into(), 12), ("yOrKeep".into(), 9)].into(),
        },
    );
    assert_eq!(description.authoring.resolved_values["levelOrKeep"], -1);
    assert_eq!(description.authoring.resolved_values["xOrKeep"], 12);
    assert_eq!(description.authoring.resolved_values["yOrKeep"], 9);
    assert_eq!(description.authoring.resolved_values["sound"], 44);
    assert_eq!(description.authoring.resolved_values["message"], 55);
    let level = description
        .fields
        .iter()
        .find(|field| field.key == "levelOrKeep")
        .unwrap();
    assert_eq!(level.minimum, 0);
    assert!(level.special_values.is_empty());
}
