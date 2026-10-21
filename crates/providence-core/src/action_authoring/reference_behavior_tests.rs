use super::*;
use crate::model::{ProjectSnapshot, StableId};

fn describe(opcode: i16, argument: i16, words: [i16; 5]) -> ActionFormDescription {
    let values = semantic_inventory::semantic_entry(opcode)
        .unwrap()
        .fields
        .iter()
        .map(|field| {
            (
                semantic_field_key(
                    semantic_inventory::semantic_entry(opcode)
                        .unwrap()
                        .form_id
                        .as_deref()
                        .unwrap_or(""),
                    &field.internal_name,
                    field.index,
                ),
                words[usize::from(field.index)],
            )
        })
        .collect();
    describe_action_form(
        &ProjectSnapshot::new_authored(StableId("signed-fields".into())),
        &ActionFormDescribeQuery {
            action_identity: format!("realmz.action.{opcode}"),
            target_native_id: argument,
            values,
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
}

fn field(description: &ActionFormDescription, index: u8) -> &DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.index == Some(index))
        .unwrap()
}

#[test]
fn direct_resource_choices_preserve_polarity_and_expose_the_native_alternative() {
    for opcode in [1, 6, 9, 29, 47] {
        for value in [-1101, 1101] {
            let form = describe(opcode, value, [0; 5]);
            let behavior = form.fields[0].reference_behavior.as_ref().unwrap();
            assert_eq!(behavior.checked, value < 0, "opcode {opcode}");
            assert_eq!(behavior.toggle_value, Some(-value));
            assert_eq!(
                behavior.selection_multiplier * 1102,
                if value < 0 { -1102 } else { 1102 }
            );
            assert_eq!(form.fields[0].value, value);
        }
    }
}

#[test]
fn every_raw_extra_code_sound_call_exposes_playback_without_rewriting_the_word() {
    // Classic newland.c raw sound(extracode[N]) sites; 74 is guarded by word3.
    for (opcode, index) in [
        (2, 2),
        (48, 2),
        (107, 2),
        (15, 3),
        (16, 3),
        (20, 3),
        (43, 3),
        (45, 3),
        (56, 3),
        (85, 3),
        (124, 3),
        (122, 1),
        (74, 1),
    ] {
        let mut words = [0; 5];
        words[index as usize] = -33;
        if opcode == 74 {
            words[3] = 1;
        }
        let form = describe(opcode, 0, words);
        let field = field(&form, index);
        let behavior = field.reference_behavior.as_ref().unwrap();
        assert_eq!(behavior.target_kind, ActionTargetKind::Sound, "{opcode}");
        assert!(behavior.checked, "{opcode}");
        assert_eq!(field.value, -33, "{opcode}");
    }
}

#[test]
fn raw_messages_and_restricted_shop_have_contextual_modes() {
    for (opcode, index) in [
        (2, 3),
        (48, 3),
        (107, 3),
        (20, 4),
        (45, 4),
        (56, 4),
        (74, 4),
        (85, 4),
        (19, 0),
        (19, 1),
        (122, 0),
        (21, 4),
        (87, 4),
        (55, 4),
        (73, 0),
    ] {
        let mut words = [0; 5];
        words[index as usize] = -33;
        if matches!(opcode, 21 | 87) {
            words[2] = 2;
        }
        if opcode == 55 {
            words[1] = 2;
        }
        let form = describe(opcode, 0, words);
        let behavior = field(&form, index).reference_behavior.as_ref().unwrap();
        assert_eq!(
            behavior.target_kind,
            if opcode == 73 {
                ActionTargetKind::Shop
            } else {
                ActionTargetKind::Message
            }
        );
        assert_eq!(behavior.toggle_value, Some(33), "{opcode}");
    }
}

#[test]
fn fixed_polarity_messages_literal_resources_and_nonmessage_branches_are_not_reinterpreted() {
    for opcode in [15, 16] {
        assert!(
            field(&describe(opcode, 0, [1, 0, 0, 0, -33]), 4)
                .reference_behavior
                .is_none()
        );
    }
    for opcode in [4, 5, 27, 39, 62, 89] {
        assert!(
            describe(opcode, -33, [0; 5]).fields[0]
                .reference_behavior
                .is_none()
        );
    }
    for (opcode, words) in [
        (55, [0, 1, 0, 0, 33]),
        (21, [0, 0, 0, 0, 33]),
        (87, [0, 0, 0, 0, 33]),
    ] {
        assert!(
            field(&describe(opcode, 0, words), 4)
                .reference_behavior
                .is_none()
        );
    }
    assert!(
        field(&describe(74, 0, [1, 33, 0, 0, 0]), 1)
            .reference_behavior
            .is_none()
    );
}

#[test]
fn zero_and_the_signed_limit_remain_exact_without_manufacturing_negative_zero() {
    for opcode in [1, 6, 9, 29, 47] {
        for value in [0, i16::MIN] {
            let form = describe(opcode, value, [0; 5]);
            let behavior = form.fields[0].reference_behavior.as_ref().unwrap();
            assert!(behavior.toggle_value.is_none());
            assert!(behavior.unavailable_reason.is_some());
            assert_eq!(form.fields[0].value, value);
            assert_eq!(behavior.checked, value < 0 || matches!(opcode, 9 | 47));
        }
    }
    for (opcode, words, index) in [(43, [0; 5], 3), (74, [1, 0, 1, 1, 0], 1)] {
        let form = describe(opcode, 0, words);
        let behavior = field(&form, index).reference_behavior.as_ref().unwrap();
        assert!(behavior.checked); // These call sound(0); optional sites skip zero.
        assert!(behavior.toggle_value.is_none());
    }
    assert!(
        !field(&describe(2, 0, [1, 0, 0, 0, 0]), 2)
            .reference_behavior
            .as_ref()
            .unwrap()
            .checked
    );
}

#[test]
fn dual_use_words_explain_the_coupling_and_respect_quantity_constraints() {
    let form = describe(2, 0, [1, 0, 33, 0, 10]);
    assert!(
        field(&form, 2)
            .reference_behavior
            .as_ref()
            .unwrap()
            .note
            .is_some()
    );
    assert_eq!(field(&form, 2).uses.len(), 2);
    assert!(
        field(&form, 2)
            .reference_behavior
            .as_ref()
            .unwrap()
            .toggle_value
            .is_none()
    );
    let form = describe(74, 0, [1, 33, 35, 1, 0]);
    let behavior = field(&form, 1).reference_behavior.as_ref().unwrap();
    assert!(behavior.note.is_some());
    assert!(behavior.toggle_value.is_none());
    assert!(
        behavior
            .unavailable_reason
            .as_ref()
            .unwrap()
            .contains("Minimum Spell Points")
    );
}

#[test]
fn existing_race_caste_scope_controls_preserve_the_unrepresentable_signed_limit() {
    let snapshot = ProjectSnapshot::new_authored(StableId("scope-preservation".into()));
    let mut query = ActionFormDescribeQuery {
        action_identity: "realmz.action.86".into(),
        target_native_id: 0,
        values: [
            ("testSelector".into(), 0),
            ("signedTestValue".into(), i16::MIN),
        ]
        .into(),
        secondary_values: Default::default(),
        context: Default::default(),
    };
    let description = describe_action_form(&snapshot, &query).unwrap();
    assert_eq!(
        description.authoring.resolved_values["signedTestValue"],
        i16::MIN
    );
    assert_eq!(field(&description, 1).value, i16::MIN);
    query
        .context
        .authoring
        .modes
        .insert("characterScope".into(), 0);
    let changed = describe_action_form(&snapshot, &query).unwrap();
    assert!(!changed.authoring.errors.is_empty());
    assert_eq!(
        changed.authoring.resolved_values["signedTestValue"],
        i16::MIN
    );
}
