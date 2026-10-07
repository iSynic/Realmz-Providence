use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:3142-3180 tests stamina after clearing track;
// newland.c:3595-3608 tests existing track marks without checking stamina.
#[test]
fn character_eligibility_choices_distinguish_living_from_picked() {
    let snapshot = ProjectSnapshot::new_authored(StableId("eligibility".into()));
    for (opcode, index, label, selected) in [
        (50, 4, "Characters To Check", "Living characters"),
        (60, 1, "Remove Money From", "Picked characters"),
    ] {
        for value in [0, 1, 2, 33, -1, i16::MIN, i16::MAX] {
            let description = describe_eligibility(&snapshot, opcode, index, value);
            let field = &description.fields[index];
            assert_eq!(field.label, label);
            assert_eq!(field.control, FormControl::Choice);
            assert_eq!(field.choices.len(), 2);
            assert_eq!(field.choices[0].label, "Everyone");
            assert_eq!(field.choices[0].value, 0);
            assert_eq!(field.choices[1].label, selected);
            assert_eq!(field.choices[1].value, if value == 0 { 1 } else { value });
            assert_eq!(field.value, value);
            assert_eq!(field.uses[0].role, ActionFieldRole::Choice);
            assert!(field.target_kind.is_none() && field.preview.is_none());
            assert!(
                description
                    .summary
                    .contains(if value == 0 { "Everyone" } else { selected })
            );
        }
    }
}

#[test]
fn named_eligibility_preserves_noncanonical_words_and_changes_only_its_word() {
    let snapshot = ProjectSnapshot::new_authored(StableId("eligibility".into()));
    for (opcode, index) in [(50, 4), (60, 1)] {
        for value in [33, -1, i16::MIN] {
            let description = describe_eligibility(&snapshot, opcode, index, value);
            let form = description.action.form_id.as_deref().unwrap();
            let mut words = [2, 2, 33, -317, 33];
            words[index] = value;
            let mut values = description.authoring.resolved_values;
            for field in description.fields.iter().filter(|field| field.preserved) {
                values.remove(&field.key);
            }
            assert_eq!(
                encode_form_values(form, &values, Some(words)).unwrap(),
                words
            );
            let field = &description.fields[index];
            values.insert(field.key.clone(), field.choices[0].value);
            let mut expected = words;
            expected[index] = 0;
            assert_eq!(
                encode_form_values(form, &values, Some(words)).unwrap(),
                expected
            );
        }
    }
}

fn describe_eligibility(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    index: usize,
    value: i16,
) -> ActionFormDescription {
    let action = action_definition_for_opcode(opcode).unwrap();
    let mut words = [2, 2, 33, -317, 33];
    words[index] = value;
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: action.identity,
            target_native_id: 33,
            values: decode_form_values(action.form_id.as_deref().unwrap(), words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
}
