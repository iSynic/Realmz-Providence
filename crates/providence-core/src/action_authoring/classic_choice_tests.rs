use super::*;
use crate::model::{ProjectSnapshot, StableId};

fn describe(snapshot: &ProjectSnapshot, opcode: i16, words: [i16; 5]) -> ActionFormDescription {
    let action = catalog()
        .actions
        .into_iter()
        .find(|action| action.opcode == opcode)
        .unwrap();
    let form_id = action.form_id.clone().unwrap();
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: action.identity,
            target_native_id: 1,
            values: decode_form_values(&form_id, words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
}

#[test]
fn fixed_classic_enums_are_author_choices_not_raw_numbers() {
    let cases = [
        (40, 3, 8, "Charm resistance"),
        (43, 1, 26, "Turned to stone"),
        (55, 0, -3, "At least 3 characters are picked"),
        (58, 0, 3, "Normal"),
        (81, 0, 39, "Silenced"),
        (87, 1, 2, "Complex Encounter"),
    ];
    for (opcode, index, value, expected_label) in cases {
        let action = catalog()
            .actions
            .into_iter()
            .find(|action| action.opcode == opcode)
            .unwrap();
        let form_id = action.form_id.unwrap();
        let mut words = [0; 5];
        words[index] = value;
        let description = describe_action_form(
            &ProjectSnapshot::new_authored(StableId("classic-choice".into())),
            &ActionFormDescribeQuery {
                action_identity: action.identity,
                target_native_id: 1,
                values: decode_form_values(&form_id, words).unwrap(),
                secondary_values: Default::default(),
                context: Default::default(),
            },
        )
        .unwrap();
        let field = description
            .fields
            .iter()
            .find(|field| field.index == Some(index as u8))
            .unwrap();
        assert_eq!(field.control, FormControl::Choice, "opcode {opcode}");
        assert_eq!(
            field
                .choices
                .iter()
                .find(|choice| choice.value == value)
                .map(|choice| choice.label.as_str()),
            Some(expected_label),
            "opcode {opcode}"
        );
        assert_eq!(field.value, value);
    }
}

#[test]
fn character_condition_subjects_name_the_documented_one_based_positions() {
    let snapshot = ProjectSnapshot::new_authored(StableId("condition-subjects".into()));
    let description = describe(&snapshot, 81, [39, -1, 0, 0, 0]);
    let field = description
        .fields
        .iter()
        .find(|field| field.index == Some(1))
        .unwrap();
    assert_eq!(field.control, FormControl::Choice);
    assert_eq!(field.choices.len(), 8);
    assert_eq!(field.choices[0].label, "Whole party");
    assert_eq!(field.choices[1].label, "Currently picked characters");
    assert_eq!(field.choices[2].value, 1);
    assert_eq!(field.choices[7].label, "Party position 6 (bottom)");
}

#[test]
fn imported_unknown_enum_values_remain_exact_without_an_invented_label() {
    for (opcode, index) in [(40, 3), (43, 1), (55, 0), (58, 0), (81, 0), (87, 1)] {
        let choices = super::form_presentation::field_choices(opcode, index, 99);
        assert!(!choices.iter().any(|choice| choice.value == 99));
    }
}

#[test]
fn picked_branch_names_every_documented_selector() {
    let choices = super::form_presentation::field_choices(55, 0, 0);
    assert_eq!(choices.len(), 13);
    assert_eq!(choices.first().unwrap().label, "Any character is picked");
    assert_eq!(
        choices
            .iter()
            .find(|choice| choice.value == 6)
            .unwrap()
            .label,
        "Party position 6 (bottom) is picked"
    );
    assert_eq!(
        choices
            .iter()
            .find(|choice| choice.value == -6)
            .unwrap()
            .label,
        "All 6 characters are picked"
    );
}
