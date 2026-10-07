use super::*;
use crate::{
    codecs::{decode_caste_rules, decode_race_rules},
    model::StableId,
};

#[test]
fn rule_authoring_export_prefers_current_native_slots_and_spell_limit() {
    let mut original = vec![0; 576 * 30 + 3];
    original[30 * 576..].copy_from_slice(&[9, 8, 7]);
    let mut current = original.clone();
    let offset = 20 * 576;
    current[offset + 386 + 6..offset + 386 + 8].copy_from_slice(&(-12_i16).to_be_bytes());
    current[offset + 446..offset + 448].copy_from_slice(&3_i16.to_be_bytes());
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rule-compiler".into()));
    snapshot.caste_rules = decode_caste_rules(&current, None).rules;
    let mut manifest = NativeManifest::default();
    compile_rules(
        &snapshot,
        ClassicCompatibilitySources {
            data_caste: Some(&original),
            current_data_caste: Some(&current),
            ..Default::default()
        },
        &mut manifest,
    )
    .unwrap();
    assert_eq!(manifest.get("Data Caste").unwrap().bytes, current);
}

#[test]
fn rule_authoring_export_retains_race_gaps_tails_and_omits_unchanged_application_rules() {
    let mut application = vec![0; 408 * 30 + 11];
    application[96..112].fill(17);
    application[346..408].fill(27);
    application[408 * 30..].fill(99);
    let mut snapshot = ProjectSnapshot::new_authored(StableId("rule-compiler".into()));
    snapshot.race_rules = decode_race_rules(&application, None).rules;
    let mut manifest = NativeManifest::default();
    compile_rules(
        &snapshot,
        ClassicCompatibilitySources {
            application_data_race: Some(&application),
            ..Default::default()
        },
        &mut manifest,
    )
    .unwrap();
    assert!(manifest.get("Data Race").is_none());
    snapshot.race_rules[19].definition.base_movement = 15;
    compile_rules(
        &snapshot,
        ClassicCompatibilitySources {
            application_data_race: Some(&application),
            ..Default::default()
        },
        &mut manifest,
    )
    .unwrap();
    let bytes = &manifest.get("Data Race").unwrap().bytes;
    assert_eq!(&bytes[96..112], &application[96..112]);
    assert_eq!(&bytes[346..408], &application[346..408]);
    assert_eq!(&bytes[408 * 30..], &application[408 * 30..]);
    assert_eq!(
        &bytes[19 * 408 + 196..19 * 408 + 198],
        &15_i16.to_be_bytes()
    );
}
