use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:2177-2197 assigns fixed fatigue for modes 1/2.
// Mode 3 evaluates fat * (word 2 / 100), using integer division.
#[test]
fn fatigue_modes_expose_only_the_runtime_control_they_use() {
    let snapshot = ProjectSnapshot::new_authored(StableId("fatigue-modes".into()));
    for (mode, label) in [
        (1, "Set fatigue to 100%"),
        (2, "Set fatigue to 0%"),
        (3, "Calculate from current fatigue"),
    ] {
        let description = describe(&snapshot, [mode, 71, 99, -72, 73]);
        let selector = field(&description, "mode");
        assert_eq!(selector.label, "Fatigue Change");
        assert_eq!(selector.control, FormControl::Choice);
        assert_eq!(selector.choices[(mode - 1) as usize].label, label);
        assert!(selector.target_kind.is_none() && selector.preview.is_none());

        let multiplier = field(&description, "percent");
        assert_eq!(multiplier.label, "Fatigue Multiplier");
        assert_eq!(multiplier.units.as_deref(), Some("percent"));
        assert_eq!(multiplier.editable, mode == 3);
        assert!(multiplier.target_kind.is_none() && multiplier.preview.is_none());
        if mode == 3 {
            assert!(multiplier.explanation.contains("divides"));
            assert!(multiplier.explanation.contains("1–99"));
        } else {
            assert!(multiplier.availability_reason.is_some());
        }
    }
}

#[test]
fn fatigue_multiplier_preserves_signed_and_inactive_imported_values() {
    let snapshot = ProjectSnapshot::new_authored(StableId("fatigue-roundtrip".into()));
    for words in [
        [1, 71, i16::MIN, -72, 73],
        [2, 71, i16::MAX, -72, 73],
        [3, 71, -99, -72, 73],
        [99, 71, 99, -72, 73],
    ] {
        let description = describe(&snapshot, words);
        let multiplier = field(&description, "percent");
        assert_eq!(multiplier.value, words[2]);
        assert!(multiplier.target_kind.is_none() && multiplier.preview.is_none());
        assert_eq!(roundtrip(&description, words), words);
    }
}

fn describe(snapshot: &ProjectSnapshot, words: [i16; 5]) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.68".into(),
            target_native_id: 68,
            values: decode_form_values("fatigue", words).unwrap(),
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

fn roundtrip(description: &ActionFormDescription, base: [i16; 5]) -> [i16; 5] {
    let mut values = description.authoring.resolved_values.clone();
    for field in description.fields.iter().filter(|field| field.preserved) {
        values.remove(&field.key);
    }
    encode_form_values("fatigue", &values, Some(base)).unwrap()
}
