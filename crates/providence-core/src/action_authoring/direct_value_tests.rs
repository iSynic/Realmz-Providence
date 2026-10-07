use super::*;
use crate::model::{ProjectSnapshot, StableId};

#[test]
fn give_victory_points_is_a_nonnegative_quantity_without_a_reference() {
    let snapshot = ProjectSnapshot::new_authored(StableId("direct-victory-points".into()));
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.11".into(),
            target_native_id: 120,
            values: Default::default(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap();
    let amount = &description.fields[0];
    assert_eq!(amount.key, "targetNativeId");
    assert_eq!(amount.minimum, 0);
    assert_eq!(amount.maximum, i16::MAX);
    assert_eq!(amount.units.as_deref(), Some("victory points"));
    assert!(amount.target_kind.is_none());
    assert!(amount.preview.is_none());
}

#[test]
fn imported_negative_victory_points_remain_visible_and_exact() {
    let snapshot = ProjectSnapshot::new_authored(StableId("direct-victory-import".into()));
    let description = describe_action_form(
        &snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.11".into(),
            target_native_id: -7,
            values: Default::default(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap();
    assert_eq!(description.fields[0].value, -7);
    assert_eq!(description.fields[0].minimum, 0);
}

#[test]
fn temple_inflation_uses_divinitys_documented_range_without_a_reference() {
    let snapshot = ProjectSnapshot::new_authored(StableId("direct-temple-inflation".into()));
    for value in [200, -7] {
        let description = describe_action_form(
            &snapshot,
            &ActionFormDescribeQuery {
                action_identity: "realmz.action.32".into(),
                target_native_id: value,
                values: Default::default(),
                secondary_values: Default::default(),
                context: Default::default(),
            },
        )
        .unwrap();
        let inflation = &description.fields[0];
        assert_eq!(inflation.value, value);
        assert_eq!(inflation.minimum, 0);
        assert_eq!(inflation.maximum, 32_000);
        assert_eq!(inflation.units.as_deref(), Some("percent of normal price"));
        assert!(inflation.target_kind.is_none());
        assert!(inflation.preview.is_none());
    }
}
