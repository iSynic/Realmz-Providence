use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:624-706 switches on word 0 for all twelve
// statistics. Modes 1-11 add word 1; mode 12 subtracts it from prestige penalty.
#[test]
fn selected_character_statistic_choices_and_signed_effects_are_explicit() {
    let snapshot = ProjectSnapshot::new_authored(StableId("selected-character-state".into()));
    let expected = [
        (1, "Melee attacks"),
        (2, "Spell attacks"),
        (3, "Movement"),
        (4, "Damage"),
        (5, "Spell points"),
        (6, "Hand-to-hand"),
        (7, "Stamina"),
        (8, "Armor rating"),
        (9, "To-hit"),
        (10, "Projectile to-hit"),
        (11, "Magic resistance"),
        (12, "Prestige"),
    ];
    for (mode, label) in expected {
        let description = describe(&snapshot, [mode, -7, 301, -302, 303]);
        let selector = &description.fields[0];
        assert_eq!(selector.label, "Statistic To Change");
        assert_eq!(selector.control, FormControl::Choice);
        assert_eq!(selector.choices.len(), 12);
        assert_eq!(selector.choices[(mode - 1) as usize].label, label);
        assert!(selector.target_kind.is_none() && selector.preview.is_none());

        let amount = &description.fields[1];
        assert_eq!(amount.value, -7);
        assert_eq!(amount.control, FormControl::Integer);
        assert!(amount.target_kind.is_none() && amount.preview.is_none());
        if mode == 12 {
            assert_eq!(amount.label, "Prestige Improvement");
            assert!(
                amount
                    .explanation
                    .contains("positive values improve prestige")
            );
        } else {
            assert_eq!(amount.label, "Change Amount");
            assert!(amount.explanation.contains("positive values increase"));
        }
        assert!(description.summary.contains(label));
    }
}

#[test]
fn selected_character_roundtrip_preserves_signed_amount_and_unread_words() {
    let snapshot = ProjectSnapshot::new_authored(StableId("selected-character-roundtrip".into()));
    for mode in 1..=12 {
        for amount in [i16::MIN, -1, 0, 1, i16::MAX] {
            let words = [mode, amount, 301, -302, 303];
            let description = describe(&snapshot, words);
            let mut values = description.authoring.resolved_values;
            for field in description.fields.iter().filter(|field| field.preserved) {
                values.remove(&field.key);
            }
            assert_eq!(
                encode_form_values("selected-character-state", &values, Some(words)).unwrap(),
                words
            );
        }
    }
}

fn describe(snapshot: &ProjectSnapshot, words: [i16; 5]) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.108".into(),
            target_native_id: 108,
            values: decode_form_values("selected-character-state", words).unwrap(),
            secondary_values: Default::default(),
            context: Default::default(),
        },
    )
    .unwrap()
}
