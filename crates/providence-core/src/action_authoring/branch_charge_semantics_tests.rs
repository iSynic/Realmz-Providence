use super::authoring_flow_tests::{named, word};
use super::*;
use crate::model::{NativeRecordId, ProjectSnapshot, ShopRecord, StableId};

fn describe(opcode: i16, words: [i16; 5], snapshot: &ProjectSnapshot) -> ActionFormDescription {
    let action = action_definition_for_opcode(opcode).unwrap();
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: action.identity,
            target_native_id: 806,
            values: decode_form_values(action.form_id.as_deref().unwrap(), words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
}

#[test]
fn item_charge_continue_sentinel_depends_on_success_and_encounter_mode() {
    // newland.c:2122-2173: only successful modes 1/2 guard id != -1.
    // loaddoor2 and the failure encounter paths still seek their signed argument.
    let snapshot = ProjectSnapshot::new_authored(StableId("charge-branches".into()));
    for (mode, target) in [
        (0, Some(ActionTargetKind::ExtraActionPoint)),
        (1, Some(ActionTargetKind::SimpleEncounter)),
        (2, Some(ActionTargetKind::ComplexEncounter)),
        (3, None),
        (-1, None),
    ] {
        for value in [-1, 0, 33] {
            let words = [851, mode, 12, value, value];
            let description = describe(67, words, &snapshot);
            let required_charges = named(&description, "minimumCharges");
            assert_eq!(required_charges.minimum, 0);
            assert_eq!(required_charges.maximum, i16::MAX);
            assert_eq!(required_charges.value, 12);
            assert!(required_charges.target_kind.is_none());
            assert!(required_charges.preview.is_none());
            for index in [3, 4] {
                let is_continue = index == 3 && value == -1 && matches!(mode, 1 | 2);
                let expected = if is_continue { None } else { target };
                let field = word(&description, index);
                assert_eq!(
                    field.target_kind, expected,
                    "mode {mode}, field {index}, value {value}"
                );
                assert_eq!(
                    super::target_rules::primary_references(67, index as u8, words, false),
                    expected.into_iter().collect::<Vec<_>>()
                );
                assert_eq!(
                    field.special_values.iter().any(|entry| entry.value == -1),
                    index == 3 && matches!(mode, 1 | 2)
                );
            }
        }
    }
}

#[test]
fn imported_negative_charge_requirement_is_retained_without_becoming_a_link() {
    let snapshot = ProjectSnapshot::new_authored(StableId("negative-charge-requirement".into()));
    let description = describe(67, [851, 0, -4, 33, 34], &snapshot);
    let required_charges = named(&description, "minimumCharges");
    assert_eq!(required_charges.value, -4);
    assert_eq!(required_charges.minimum, 0);
    assert!(required_charges.target_kind.is_none());
    assert!(required_charges.preview.is_none());
}

#[test]
fn negative_shop_one_remains_a_reference_despite_its_behavior_help() {
    // newland.c:2938 sets currentshop = abs(word0) before loadshop(0); negatives open it.
    let mut snapshot = ProjectSnapshot::new_authored(StableId("signed-shop".into()));
    snapshot.shops.push(ShopRecord {
        identity: StableId("shop:1".into()),
        native_id: NativeRecordId(1),
        item_ids: vec![0; 1000],
        quantities: vec![0; 1000],
        inflation: 100,
        authored: false,
    });
    let description = describe(73, [-1, 0, 0, 0, 0], &snapshot);
    let field = &description.fields[0];
    assert_eq!(field.value, -1);
    assert!(!field.special_values.is_empty());
    assert_eq!(field.preview.as_ref().unwrap().identity.0, "shop:1");
    assert_eq!(field.uses[0].preview.as_ref().unwrap().identity.0, "shop:1");
    assert_eq!(
        super::target_rules::primary_references(73, 0, [-1, 0, 0, 0, 0], false),
        vec![ActionTargetKind::Shop]
    );
}
