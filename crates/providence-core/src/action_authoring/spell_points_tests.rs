use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:2978-2995 takes abs(word 0) and uses its sign to
// select whether the calculated spell-point change is added or removed.
#[test]
fn signed_multiplier_exposes_give_or_take_as_an_author_choice() {
    let snapshot = ProjectSnapshot::new_authored(StableId("spell-points".into()));
    let take = describe(&snapshot, [-10, 1, 6, 0, 91], Default::default());
    let control = &take.authoring.controls[0];
    assert_eq!(control.label, "Spell Point Change");
    assert_eq!(control.value, 1);
    assert_eq!(control.choices[0].label, "Give spell points");
    assert_eq!(control.choices[1].label, "Take spell points");
    let multiplier = field(&take, "signedRollCount");
    assert_eq!(multiplier.label, "Multiplier");
    assert_eq!(multiplier.value, 10);
    assert_eq!(multiplier.minimum, 1);
    assert_eq!(roundtrip(&take, [-10, 1, 6, 0, 91]), [-10, 1, 6, 0, 91]);
}

#[test]
fn direction_toggle_reuses_magnitude_and_preserves_sound_and_message_words() {
    let snapshot = ProjectSnapshot::new_authored(StableId("spell-points-toggle".into()));
    let base = [5, 601, 6, 1, 91];
    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("spellPointDirection".into(), 1);
    authoring.selections.insert("signedRollCount".into(), 8);
    let take = describe(&snapshot, base, authoring.clone());
    assert_eq!(take.authoring.resolved_values["signedRollCount"], -8);
    assert_eq!(roundtrip(&take, base), [-8, 601, 6, 1, 91]);

    authoring.modes.insert("spellPointDirection".into(), 0);
    let give = describe(&snapshot, base, authoring);
    assert_eq!(give.authoring.resolved_values["signedRollCount"], 8);
    assert_eq!(roundtrip(&give, base), [8, 601, 6, 1, 91]);
}

#[test]
fn minimum_signed_import_is_retained_until_replaced_explicitly() {
    let snapshot = ProjectSnapshot::new_authored(StableId("spell-points-min".into()));
    let base = [i16::MIN, 1, 6, 0, 91];
    let imported = describe(&snapshot, base, Default::default());
    assert!(imported.authoring.controls[0].active_fields.is_empty());
    assert!(imported.authoring.controls[0].display.contains("retained"));
    assert_eq!(roundtrip(&imported, base), base);

    let mut authoring = ActionAuthoringInput::default();
    authoring.modes.insert("spellPointDirection".into(), 1);
    let unresolved = describe(&snapshot, base, authoring);
    assert!(!unresolved.authoring.errors.is_empty());
}

#[test]
fn random_magnitude_endpoints_are_nonnegative_without_rewriting_imports() {
    let snapshot = ProjectSnapshot::new_authored(StableId("spell-points-range".into()));
    let ordinary = describe(&snapshot, [10, 1, 6, 0, 91], Default::default());
    assert_eq!(field(&ordinary, "lowOrSound").minimum, 0);
    assert_eq!(field(&ordinary, "high").minimum, 0);

    let base = [10, -1, -6, 0, 91];
    let imported = describe(&snapshot, base, Default::default());
    assert_eq!(field(&imported, "lowOrSound").value, -1);
    assert_eq!(field(&imported, "high").value, -6);
    assert_eq!(roundtrip(&imported, base), base);
}

fn describe(
    snapshot: &ProjectSnapshot,
    words: [i16; 5],
    authoring: ActionAuthoringInput,
) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.74".into(),
            target_native_id: 74,
            values: decode_form_values("spell-points", words).unwrap(),
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
    encode_form_values("spell-points", &values, Some(base)).unwrap()
}
