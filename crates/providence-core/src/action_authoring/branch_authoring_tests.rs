use super::target_rules::{FieldMeaning, primary_meaning};
use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad: newland.c:2569/2701/2705; takegold.c:5 and
// checkrange-checkforitem.c:35 return nonzero for payment/item success.
#[test]
fn possession_and_payment_choices_name_the_branch_not_its_opposite() {
    let snapshot = ProjectSnapshot::new_authored(StableId("branch-choices".into()));
    for (opcode, expected) in branch_choice_expectations() {
        let form = action_definition_for_opcode(opcode)
            .unwrap()
            .form_id
            .unwrap();
        for (mode, label) in expected.clone() {
            let words = [33, mode, 0, 33, 7];
            let values = decode_form_values(&form, words).unwrap();
            let description = describe_action_form(
                &snapshot,
                &ActionFormDescribeQuery {
                    action_identity: format!("realmz.action.{opcode}"),
                    target_native_id: 0,
                    values: values.clone(),
                    secondary_values: Default::default(),
                    context: Default::default(),
                },
            )
            .unwrap();
            let behavior = &description.fields[1];
            assert_eq!(behavior.label, "Branch When");
            assert_eq!(behavior.control, FormControl::Choice);
            assert_eq!(
                behavior
                    .choices
                    .iter()
                    .map(|c| (c.value, c.label.as_str()))
                    .collect::<Vec<_>>(),
                expected
            );
            assert!(description.summary.contains(label));
            assert!(behavior.target_kind.is_none() && behavior.preview.is_none());
            assert_eq!(
                encode_form_values(&form, &values, Some(words)).unwrap(),
                words
            );
            let destination = settings_target_fields(opcode, words, false);
            assert_eq!(destination.iter().any(|f| f.index == 3), mode != -1);
        }
    }
}

fn branch_choice_expectations() -> [(i16, Vec<(i16, &'static str)>); 2] {
    [
        (
            33,
            vec![
                (0, "Payment fails"),
                (1, "Payment succeeds"),
                (2, "Always"),
                (-1, "Skip to final step on failure"),
            ],
        ),
        (
            38,
            vec![
                (0, "Party does not have item"),
                (1, "Party has item"),
                (2, "Always"),
            ],
        ),
    ]
}

// The source distinguishes record loading (type1new/type2new) from the
// forcebranch path which copies an already loaded encounter's result program.
#[test]
fn named_record_branch_modes_keep_zero_destinations_inactive() {
    use ActionTargetKind::{ComplexEncounter, ExtraActionPoint, SimpleEncounter};
    use FieldMeaning::{Record, Value};
    let record_modes = [
        (0, Record(ExtraActionPoint)),
        (1, Record(SimpleEncounter)),
        (2, Record(ComplexEncounter)),
        (3, Value),
        (-1, Value),
    ];
    // newland.c:164/201/1201: zero destinations continue instead of loading record 0.
    for opcode in [77, 78, 86] {
        for (mode, expected) in record_modes {
            for value in [-1, 0, 33] {
                let words = [0, 33, mode, value, value];
                for index in [3, 4] {
                    assert_eq!(
                        primary_meaning(opcode, index, words, false),
                        if value == 0 { Value } else { expected },
                        "{opcode}/{mode}/{index}"
                    );
                }
            }
        }
    }
}

#[test]
fn auto_branch_threshold_and_one_based_record_modes_are_independent() {
    use ActionTargetKind::{ComplexEncounter, ExtraActionPoint, SimpleEncounter};
    use FieldMeaning::{Record, Value};
    // newland.c:123: threshold 0 disables auto-branch; modes are one-based.
    for mode in [-1, 0, 1, 2, 3, 4] {
        for threshold in [-1, 0, 33] {
            let expected = match (mode, threshold) {
                (_, 0) => Value,
                (1, _) => Record(ExtraActionPoint),
                (2, _) => Record(SimpleEncounter),
                (3, _) => Record(ComplexEncounter),
                _ => Value,
            };
            assert_eq!(
                primary_meaning(76, 4, [33, 1, mode, threshold, 33], false),
                expected
            );
        }
    }
}

#[test]
fn forcebranch_context_and_code_positions_follow_the_behavior() {
    use ActionTargetKind::ExtraActionPoint;
    use FieldMeaning::{CodePosition, ComplexResult, Record, SimpleResult, Value};
    // newland.c:2711 and its callers: only encounter-local modes consume word 4.
    for opcode in [33, 38, 42, 46, 58, 59] {
        for behavior in [-2, -1, 0, 1, 2, 3] {
            let branches = if matches!(opcode, 42 | 58 | 59) {
                behavior == 1
            } else {
                matches!(behavior, 0..=2)
            };
            for (mode, target) in [
                (0, Record(ExtraActionPoint)),
                (1, SimpleResult),
                (2, ComplexResult),
                (-1, Value),
                (3, Value),
            ] {
                let words = [33, behavior, mode, 33, 7];
                assert_eq!(
                    primary_meaning(opcode, 3, words, false),
                    if branches { target } else { Value }
                );
                assert_eq!(
                    primary_meaning(opcode, 4, words, false),
                    if branches && matches!(mode, 1 | 2) {
                        CodePosition
                    } else {
                        Value
                    }
                );
            }
        }
    }
}

#[test]
fn branch_forms_hide_destinations_that_the_selected_mode_does_not_read() {
    let snapshot = ProjectSnapshot::new_authored(StableId("branch-controls".into()));
    for (opcode, words, inactive) in [
        (21, [33, 0, 1, 55, 55], vec![4]),
        (33, [33, 1, 3, 55, 7], vec![3, 4]),
        (38, [33, 1, 0, 55, 7], vec![4]),
        (40, [1, 0, 55, 8, 0], vec![2]),
        (42, [33, 2, 0, 55, 7], vec![3, 4]),
        (46, [33, 1, -1, 55, 7], vec![3, 4]),
        (58, [3, -2, 0, 55, 7], vec![3, 4]),
        (59, [33, 1, 1, 55, 7], vec![]),
        (76, [33, 1, 0, 0, 55], vec![4]),
        (78, [3, 0, 0, 55, 55], vec![1]),
        (87, [17, 2, 1, 55, 55], vec![4]),
    ] {
        let action = action_definition_for_opcode(opcode).unwrap();
        let form_id = action.form_id.unwrap();
        let description = describe_action_form(
            &snapshot,
            &ActionFormDescribeQuery {
                action_identity: action.identity,
                target_native_id: 1,
                values: decode_form_values(&form_id, words).unwrap(),
                secondary_values: Default::default(),
                context: Default::default(),
            },
        )
        .unwrap();
        for index in [1_u8, 2, 3, 4] {
            let Some(field) = description
                .fields
                .iter()
                .find(|field| field.index == Some(index))
            else {
                continue;
            };
            if inactive.contains(&index) {
                assert!(!field.editable, "opcode {opcode}, word {index}");
                assert!(field.availability_reason.is_some());
            }
        }
    }
}

// Classic 491816ad: newland.c:3016–3038 compares the selected characters'
// current spell points against word 1. A negative imported threshold is kept
// exact, but the documented minimum is authored as a nonnegative quantity.
#[test]
fn spell_point_branch_uses_a_nonnegative_required_points_control() {
    let snapshot = ProjectSnapshot::new_authored(StableId("spell-point-branch".into()));
    let form_id = action_definition_for_opcode(75).unwrap().form_id.unwrap();
    for (required, expected_value) in [(12, 12), (-7, -7)] {
        let words = [2, required, 1, 0, 436];
        let values = decode_form_values(&form_id, words).unwrap();
        let description = describe_action_form(
            &snapshot,
            &ActionFormDescribeQuery {
                action_identity: "realmz.action.75".into(),
                target_native_id: 1,
                values: values.clone(),
                secondary_values: Default::default(),
                context: Default::default(),
            },
        )
        .unwrap();
        let field = description
            .fields
            .iter()
            .find(|field| field.key == "testB")
            .unwrap();
        assert_eq!(field.minimum, 0);
        assert_eq!(field.maximum, i16::MAX);
        assert_eq!(field.value, expected_value);
        assert!(field.target_kind.is_none() && field.preview.is_none());
        assert_eq!(
            encode_form_values(&form_id, &values, Some(words)).unwrap(),
            words
        );
    }
}
