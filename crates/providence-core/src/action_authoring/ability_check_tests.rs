use super::*;
use crate::model::{ProjectSnapshot, StableId};

#[test]
fn positive_ability_and_attribute_selectors_are_named_choices() {
    let snapshot = ProjectSnapshot::new_authored(StableId("ability-checks".into()));
    for (opcode, form, selector_key) in [
        (30, "ability-check-pick", "signedAbilityOrAttribute"),
        (31, "ability-check-branch", "abilityOrAttribute"),
    ] {
        let special = describe(
            &snapshot,
            opcode,
            form,
            if opcode == 30 {
                [5, -4, 0, 0, 2]
            } else {
                [5, -4, 0, 1, 2]
            },
        );
        let selector = field(&special, selector_key);
        assert_eq!(selector.label, "Special Ability");
        assert_eq!(selector.control, FormControl::Choice);
        assert_eq!(selector.choices[5].label, "Acrobatic Act");
        assert!(selector.target_kind.is_none() && selector.preview.is_none());

        let attribute = describe(
            &snapshot,
            opcode,
            form,
            if opcode == 30 {
                [3, -4, 0, 1, 2]
            } else {
                [3, -4, 1, 1, 2]
            },
        );
        let selector = field(&attribute, selector_key);
        assert_eq!(selector.label, "Attribute");
        assert_eq!(selector.control, FormControl::Choice);
        assert_eq!(selector.choices[3].label, "Agility");
    }
}

#[test]
fn negative_imported_selectors_remain_numeric_and_roundtrip_exactly() {
    let snapshot = ProjectSnapshot::new_authored(StableId("negative-ability-check".into()));
    for (opcode, form, selector_key, words) in [
        (
            30,
            "ability-check-pick",
            "signedAbilityOrAttribute",
            [-5, 7, 2, 0, 99],
        ),
        (
            31,
            "ability-check-branch",
            "abilityOrAttribute",
            [-6, -3, 1, 41, 42],
        ),
    ] {
        let description = describe(&snapshot, opcode, form, words);
        let selector = field(&description, selector_key);
        assert_eq!(selector.control, FormControl::Integer);
        assert!(selector.choices.is_empty());
        assert!(selector.explanation.contains("retained exactly"));

        let mut values = description.authoring.resolved_values.clone();
        for preserved in description.fields.iter().filter(|field| field.preserved) {
            values.remove(&preserved.key);
        }
        assert_eq!(
            encode_form_values(form, &values, Some(words)).unwrap(),
            words
        );
    }
}

#[test]
fn unknown_positive_imports_stay_visible_as_imported_choice_values() {
    let snapshot = ProjectSnapshot::new_authored(StableId("unknown-ability-check".into()));
    let description = describe(&snapshot, 31, "ability-check-branch", [14, 0, 0, 1, 2]);
    let selector = field(&description, "abilityOrAttribute");
    assert_eq!(selector.control, FormControl::Choice);
    assert_eq!(selector.value, 14);
    assert!(!selector.choices.iter().any(|choice| choice.value == 14));
}

fn describe(
    snapshot: &ProjectSnapshot,
    opcode: i16,
    form: &str,
    words: [i16; 5],
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: format!("realmz.action.{opcode}"),
            target_native_id: opcode,
            values: decode_form_values(form, words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
}

fn field<'a>(description: &'a ActionFormDescription, key: &str) -> &'a DescribedActionField {
    description
        .fields
        .iter()
        .find(|field| field.key == key)
        .unwrap()
}
