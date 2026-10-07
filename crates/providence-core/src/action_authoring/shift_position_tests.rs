use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:3624-3671 adds signed X/Y values directly in
// exact mode, but calls randrange(1, value) for both axes in random mode.
#[test]
fn shift_bounds_follow_exact_or_random_distance_mode() {
    let snapshot = ProjectSnapshot::new_authored(StableId("shift-position".into()));
    let exact = describe(&snapshot, [0, -4, 6, 0, 0]);
    assert_eq!(field(&exact, "xShift").minimum, i16::MIN);
    assert_eq!(field(&exact, "yShift").minimum, i16::MIN);

    let random = describe(&snapshot, [0, 4, 6, 1, 0]);
    assert_eq!(field(&random, "xShift").minimum, 1);
    assert_eq!(field(&random, "yShift").minimum, 1);
    assert_eq!(field(&random, "xShift").target_kind, None);
    assert_eq!(field(&random, "yShift").target_kind, None);
}

#[test]
fn invalid_imported_random_maxima_remain_exact_until_edited() {
    let snapshot = ProjectSnapshot::new_authored(StableId("shift-import".into()));
    let base = [0, 0, -6, 1, 42];
    let imported = describe(&snapshot, base);
    assert_eq!(field(&imported, "xShift").value, 0);
    assert_eq!(field(&imported, "yShift").value, -6);
    assert_eq!(roundtrip(&imported, base), base);
}

#[test]
fn entering_random_mode_requires_positive_maxima_and_writes_canonical_marker() {
    let snapshot = ProjectSnapshot::new_authored(StableId("shift-mode".into()));
    let values = [0, -4, 6, 0, 42];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("shiftDistanceMode".into(), 1);
    let invalid = describe_with_authoring(&snapshot, values, authoring.clone());
    assert_eq!(invalid.authoring.resolved_values["randomize"], 1);
    assert!(
        invalid
            .authoring
            .errors
            .iter()
            .any(|error| error.contains("X"))
    );

    authoring.selections.insert("xShift".into(), 4);
    let valid = describe_with_authoring(&snapshot, values, authoring);
    assert!(valid.authoring.errors.is_empty());
    assert_eq!(valid.authoring.controls[0].key, "shiftDistanceMode");
    assert_eq!(valid.authoring.resolved_values["xShift"], 4);
    assert_eq!(roundtrip(&valid, values), [0, 4, 6, 1, 42]);
}

fn describe(snapshot: &ProjectSnapshot, words: [i16; 5]) -> ActionFormDescription {
    describe_with_authoring(snapshot, words, Default::default())
}

fn describe_with_authoring(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.61".into(),
            target_native_id: 61,
            values: decode_form_values("position-shift", words).unwrap(),
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
    encode_form_values("position-shift", &values, Some(base)).unwrap()
}
