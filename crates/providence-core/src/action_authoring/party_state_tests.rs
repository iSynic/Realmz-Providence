use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:1030-1051 dispatches word 1 as 0 each,
// 1 picked, and 2 spread. The shipped mode-1 loop has a separate runtime
// index defect; the authored encoding and its named choices remain unambiguous.
#[test]
fn party_state_distribution_is_a_named_non_reference_choice() {
    let snapshot = ProjectSnapshot::new_authored(StableId("party-state-scope".into()));
    for (mode, label) in [
        (0, "Each character"),
        (1, "Picked characters"),
        (2, "Spread across party"),
    ] {
        let words = [120, mode, -7, 8, 9];
        let description = describe(&snapshot, words);
        let amount = field(&description, "amount");
        assert_eq!(amount.minimum, 0);
        assert_eq!(amount.maximum, i16::MAX);
        assert_eq!(amount.units.as_deref(), Some("victory points"));
        assert!(amount.target_kind.is_none());
        assert!(amount.preview.is_none());
        let distribution = field(&description, "scope");
        assert_eq!(distribution.label, "Distribution");
        assert_eq!(distribution.control, FormControl::Choice);
        assert_eq!(distribution.value, mode);
        assert_eq!(distribution.choices[mode as usize].label, label);
        assert!(distribution.target_kind.is_none());
        assert!(distribution.preview.is_none());
        assert!(description.summary.contains(label));
        assert_eq!(roundtrip(&description, words), words);
    }
}

#[test]
fn unknown_distribution_and_preserved_words_roundtrip_exactly() {
    let snapshot = ProjectSnapshot::new_authored(StableId("party-state-import".into()));
    let words = [-120, 77, i16::MIN, 492, i16::MAX];
    let description = describe(&snapshot, words);
    let amount = field(&description, "amount");
    assert_eq!(amount.value, -120);
    assert_eq!(amount.minimum, 0);
    let distribution = field(&description, "scope");
    assert_eq!(distribution.value, 77);
    assert!(distribution.choices.iter().all(|choice| choice.value != 77));
    assert!(distribution.target_kind.is_none());
    assert!(distribution.preview.is_none());
    assert_eq!(roundtrip(&description, words), words);
}

fn describe(snapshot: &ProjectSnapshot, words: [i16; 5]) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.90".into(),
            target_native_id: 90,
            values: decode_form_values("party-state", words).unwrap(),
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
    encode_form_values("party-state", &values, Some(base)).unwrap()
}
