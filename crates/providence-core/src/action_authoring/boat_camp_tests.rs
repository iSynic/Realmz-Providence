use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:804-825 independently tests boat and camping
// requirements; zero skips each test. Word 2 optionally changes boat state.
#[test]
fn boat_and_camping_zero_values_are_named_no_op_choices() {
    let snapshot = ProjectSnapshot::new_authored(StableId("boat-camp-defaults".into()));
    let description = describe(&snapshot, [0, 0, 0, -303, 404]);
    let boat = field(&description, "mode");
    assert_eq!(boat.label, "Boat Requirement");
    assert_eq!(boat.choices[0].label, "Do not test boat status");
    let camp = field(&description, "statusValue");
    assert_eq!(camp.label, "Camping Requirement");
    assert_eq!(camp.choices[0].label, "Do not test camping status");
    let change = field(&description, "branchModeOrBehavior");
    assert_eq!(change.label, "Boat State After Check");
    assert_eq!(change.choices[0].label, "Keep boat state");
    for value in [boat, camp, change] {
        assert_eq!(value.control, FormControl::Choice);
        assert!(value.editable);
        assert!(value.target_kind.is_none() && value.preview.is_none());
    }
    assert!(!description.summary.contains("Imported value"));
}

#[test]
fn boat_camp_choices_and_preserved_words_roundtrip_exactly() {
    let snapshot = ProjectSnapshot::new_authored(StableId("boat-camp-roundtrip".into()));
    for words in [
        [1, 2, 1, i16::MIN, i16::MAX],
        [2, 1, 2, -17, 18],
        [99, -99, 0, 301, -302],
    ] {
        let description = describe(&snapshot, words);
        for key in ["mode", "statusValue", "branchModeOrBehavior"] {
            let value = field(&description, key);
            assert!(value.target_kind.is_none() && value.preview.is_none());
        }
        assert_eq!(roundtrip(&description, words), words);
    }
}

fn describe(snapshot: &ProjectSnapshot, words: [i16; 5]) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.103".into(),
            target_native_id: 103,
            values: decode_form_values("boat-camp-state", words).unwrap(),
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
    encode_form_values("boat-camp-state", &values, Some(base)).unwrap()
}
