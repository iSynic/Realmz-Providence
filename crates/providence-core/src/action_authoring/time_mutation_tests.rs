use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:3491-3511 skips -1 components only while setting
// absolute time. Offset mode adds every signed component, including -1.
#[test]
fn absolute_time_uses_named_keep_or_set_controls() {
    let snapshot = ProjectSnapshot::new_authored(StableId("time-absolute".into()));
    let description = describe(&snapshot, [1, -1, 17, -1, 91], Default::default());
    let controls = &description.authoring.controls;
    assert_eq!(controls[0].label, "Time Change");
    assert_eq!(controls[0].choices[0].label, "Set absolute time");
    assert_eq!(controls[1].label, "Day");
    assert_eq!(controls[1].choices[0].label, "Keep current");
    assert!(controls[1].active_fields.is_empty());
    assert_eq!(controls[2].label, "Hour");
    assert_eq!(controls[2].active_fields, ["hourOrDelta"]);
    assert_eq!(field(&description, "dayOrDelta").label, "Day");
    assert_eq!(field(&description, "hourOrDelta").label, "Hour");
    assert_eq!(field(&description, "minuteOrDelta").label, "Minute");
    assert_eq!(field(&description, "hourOrDelta").maximum, 23);
    assert_eq!(field(&description, "minuteOrDelta").maximum, 59);
    assert_eq!(
        roundtrip(&description, [1, -1, 17, -1, 91]),
        [1, -1, 17, -1, 91]
    );
}

#[test]
fn absolute_mode_restores_pending_values_after_keep_toggle() {
    let snapshot = ProjectSnapshot::new_authored(StableId("time-retention".into()));
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("dayOrDeltaBehavior".into(), 0);
    authoring.selections.insert("dayOrDelta".into(), 42);
    let kept = describe(&snapshot, [1, 7, 8, 9, -10], authoring.clone());
    assert_eq!(kept.authoring.resolved_values["dayOrDelta"], -1);

    authoring.modes.insert("dayOrDeltaBehavior".into(), 1);
    let restored = describe(&snapshot, [1, 7, 8, 9, -10], authoring);
    assert_eq!(restored.authoring.resolved_values["dayOrDelta"], 42);
    assert_eq!(roundtrip(&restored, [1, 7, 8, 9, -10]), [1, 42, 8, 9, -10]);
}

#[test]
fn offset_mode_keeps_signed_numeric_fields_and_unknown_imports() {
    let snapshot = ProjectSnapshot::new_authored(StableId("time-offset".into()));
    for words in [[2, -1, -2, -3, 99], [77, i16::MIN, 25, 61, -99]] {
        let description = describe(&snapshot, words, Default::default());
        assert_eq!(description.authoring.controls.len(), 1);
        for key in ["dayOrDelta", "hourOrDelta", "minuteOrDelta"] {
            let value = field(&description, key);
            assert!(value.editable);
            assert!(value.target_kind.is_none() && value.preview.is_none());
        }
        assert_eq!(roundtrip(&description, words), words);
        if words[0] == 2 {
            assert_eq!(field(&description, "dayOrDelta").label, "Day Offset");
            assert_eq!(field(&description, "minuteOrDelta").label, "Minute Offset");
            assert!(
                field(&description, "hourOrDelta")
                    .explanation
                    .contains("subtracts 24 once")
            );
        } else {
            assert_eq!(field(&description, "minuteOrDelta").label, "Minute");
        }
    }
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.63".into(),
            target_native_id: 63,
            values: decode_form_values("time-mutation", words).unwrap(),
            secondary_values: Default::default(),
            context: ActionFormContext {
                authoring,
                ..Default::default()
            },
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
    encode_form_values("time-mutation", &values, Some(base)).unwrap()
}
