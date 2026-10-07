use super::*;
use crate::model::{ProjectSnapshot, StableId};

fn description(mode: i16) -> ActionFormDescription {
    let words = [17, 4, mode, -3, 22];
    describe_action_form(
        &ProjectSnapshot::new_authored(StableId("item-mutation".into())),
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.22".into(),
            target_native_id: 1,
            values: decode_form_values("item-mutation", words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
}

#[test]
fn item_mutation_shows_only_the_selected_operation_control() {
    for (mode, charge_active, replacement_active) in
        [(1, false, false), (2, true, false), (3, false, true)]
    {
        let description = description(mode);
        let charge = description
            .fields
            .iter()
            .find(|field| field.key == "chargeDelta")
            .unwrap();
        let replacement = description
            .fields
            .iter()
            .find(|field| field.key == "replacementItem")
            .unwrap();
        assert_eq!(charge.editable, charge_active);
        assert_eq!(replacement.editable, replacement_active);
        assert_eq!(charge.value, -3);
        assert_eq!(replacement.value, 22);
        let max_matches = description
            .fields
            .iter()
            .find(|field| field.key == "maxMatches")
            .unwrap();
        assert_eq!((max_matches.minimum, max_matches.maximum), (1, 180));
        if replacement_active {
            assert_eq!(replacement.target_kind, Some(ActionTargetKind::Item));
        } else {
            assert!(replacement.target_kind.is_none());
        }
    }
}

#[test]
fn imported_item_match_count_is_retained_outside_new_authoring_bounds() {
    let words = [17, 300, 1, 0, 0];
    let description = describe_action_form(
        &ProjectSnapshot::new_authored(StableId("item-count-import".into())),
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.22".into(),
            target_native_id: 1,
            values: decode_form_values("item-mutation", words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap();
    let count = description
        .fields
        .iter()
        .find(|field| field.key == "maxMatches")
        .unwrap();
    assert_eq!(count.value, 300);
    assert_eq!((count.minimum, count.maximum), (1, 180));
    assert_eq!(
        encode_form_values(
            "item-mutation",
            &description.authoring.resolved_values,
            Some(words)
        )
        .unwrap(),
        words
    );
}
