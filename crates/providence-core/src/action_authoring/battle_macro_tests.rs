use super::*;
use crate::model::{ProjectSnapshot, StableId};

// Classic 491816ad newland.c:584-608 owns the runtime conditions and branches.
// Divinity resource 253 names the three activation and script-selection modes.
#[test]
fn battle_macro_modes_expose_named_author_choices_and_exact_targets() {
    let snapshot = ProjectSnapshot::new_authored(StableId("battle-macro-modes".into()));
    let cases = [
        (0, "Battle Round", Some("battle round")),
        (1, "Chance Per Round", Some("percent")),
        (2, "Activation Threshold", None),
    ];

    for (mode, threshold_label, units) in cases {
        let description = describe(&snapshot, [mode, 33, 0, 41, 97]);
        let activation = field(&description, "mode");
        assert_eq!(activation.label, "Activate When");
        assert_eq!(activation.control, FormControl::Choice);
        assert_eq!(activation.choices.len(), 3);
        assert!(activation.target_kind.is_none() && activation.preview.is_none());

        let threshold = field(&description, "roundOrPercent");
        assert_eq!(threshold.label, threshold_label);
        assert_eq!(threshold.units.as_deref(), units);
        assert_eq!(threshold.editable, mode != 2);
        assert!(threshold.target_kind.is_none() && threshold.preview.is_none());
        assert_eq!(threshold.minimum, 0);
        assert_eq!(threshold.maximum, if mode == 1 { 100 } else { i16::MAX });

        let destination = field(&description, "macroLow");
        assert_eq!(destination.label, "Extra Action Point");
        assert_eq!(
            destination.target_kind,
            Some(ActionTargetKind::ExtraActionPoint)
        );
        assert!(field(&description, "macroHigh").target_kind.is_none());
    }
}

#[test]
fn random_script_mode_uses_a_bounded_xap_range_and_preserves_fixed_high_word() {
    let snapshot = ProjectSnapshot::new_authored(StableId("battle-macro-range".into()));
    let random = describe(&snapshot, [1, 25, 2, 41, 97]);
    let run_script = field(&random, "repeatMode");
    assert_eq!(run_script.label, "Run Script");
    assert_eq!(run_script.control, FormControl::Choice);
    assert_eq!(run_script.choices[0].label, "One Extra Action Point once");
    assert_eq!(
        run_script.choices[1].label,
        "One Extra Action Point each matching round"
    );
    assert_eq!(
        run_script.choices[2].label,
        "One random Extra Action Point once"
    );
    assert_eq!(field(&random, "macroLow").label, "Random Range Low");
    let high = field(&random, "macroHigh");
    assert_eq!(high.label, "Random Range High");
    assert!(high.editable);
    assert_eq!(high.target_kind, Some(ActionTargetKind::ExtraActionPoint));

    let fixed_words = [0, 4, 0, 41, -123];
    let fixed = describe(&snapshot, fixed_words);
    let inactive_high = field(&fixed, "macroHigh");
    assert!(!inactive_high.editable);
    assert_eq!(inactive_high.value, -123);
    assert!(inactive_high.target_kind.is_none() && inactive_high.preview.is_none());
    assert!(inactive_high.availability_reason.is_some());
    assert_eq!(roundtrip(&fixed, fixed_words), fixed_words);
}

#[test]
fn inactive_and_unknown_imported_words_roundtrip_without_false_links_or_clamping() {
    let snapshot = ProjectSnapshot::new_authored(StableId("battle-macro-imports".into()));
    for words in [[2, i16::MIN, 0, -7, i16::MAX], [99, -33, 99, 41, -97]] {
        let description = describe(&snapshot, words);
        let threshold = field(&description, "roundOrPercent");
        assert!(threshold.target_kind.is_none() && threshold.preview.is_none());
        assert_eq!(threshold.value, words[1]);
        let high = field(&description, "macroHigh");
        assert!(high.target_kind.is_none() && high.preview.is_none());
        assert_eq!(roundtrip(&description, words), words);
    }
}

fn describe(snapshot: &ProjectSnapshot, words: [i16; 5]) -> ActionFormDescription {
    describe_action_form(
        snapshot,
        &ActionFormDescribeQuery {
            action_identity: "realmz.action.126".into(),
            target_native_id: 126,
            values: decode_form_values("battle-macro", words).unwrap(),
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
    encode_form_values("battle-macro", &values, Some(base)).unwrap()
}
