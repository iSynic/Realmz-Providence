use super::*;
use crate::codecs::{
    RACE_RECORD_BYTES, decode_caste_rules, decode_race_rules, encode_caste_rules, encode_race_rules,
};

fn differences(before: &[u8], after: &[u8]) -> Vec<usize> {
    assert_eq!(before.len(), after.len());
    before
        .iter()
        .zip(after)
        .enumerate()
        .filter_map(|(offset, (left, right))| (left != right).then_some(offset))
        .collect()
}

#[test]
fn editing_caste_movement_preserves_truthy_flags_item_holes_and_unowned_bytes() {
    let mut source = vec![0; CASTE_RECORD_BYTES * 30 + 7];
    source[212..214].copy_from_slice(&2i16.to_be_bytes());
    source[214..216].copy_from_slice(&255i16.to_be_bytes());
    source[390..392].copy_from_slice(&37i16.to_be_bytes());
    source[424..426].copy_from_slice(&(-17i16).to_be_bytes());
    source[446..448].copy_from_slice(&3i16.to_be_bytes());
    source[448..576].fill(0xc3);
    source[576..].fill(0x5a);
    let mut rules = decode_caste_rules(&source, None).rules;
    rules[0].definition.movement_bonus = 4;
    let output = encode_caste_rules(&rules, Some(&source)).unwrap();
    assert_eq!(differences(&source, &output), [253]);
    assert_eq!(
        read_caste_native_fields(&output, 1).unwrap(),
        read_caste_native_fields(&source, 1).unwrap()
    );
}

#[test]
fn editing_race_movement_preserves_noncanonical_flags_and_exact_eligibility() {
    let mut source = vec![0; RACE_RECORD_BYTES * 30 + 9];
    source[194..196].copy_from_slice(&255i16.to_be_bytes());
    source[208] = 2;
    source[210] = 255;
    source[333] = 255;
    source[96..112].fill(0xa5);
    source[346..408].fill(0xc3);
    source[408..].fill(0x5a);
    let mut rules = decode_race_rules(&source, None).rules;
    rules[0].definition.base_movement = 4;
    let output = encode_race_rules(&rules, Some(&source)).unwrap();
    assert_eq!(differences(&source, &output), [197]);
}

#[test]
fn selecting_one_caste_item_changes_only_its_slot_and_preserves_source_tail() {
    let mut source = vec![0; CASTE_RECORD_BYTES * 30 + 7];
    source[390..392].copy_from_slice(&37i16.to_be_bytes());
    source[424..426].copy_from_slice(&(-17i16).to_be_bytes());
    source[448..].fill(0xc3);
    let mut fields = read_caste_native_fields(&source, 1).unwrap();
    fields.starting_items[5] = Some(StableId("classic.item.95".into()));
    let output = patch_caste_native_fields(&source, 1, &fields).unwrap();
    assert_eq!(differences(&source, &output), [397]);
    let read = read_caste_native_fields(&output, 1).unwrap();
    assert_eq!(read.starting_items[0], None);
    assert_eq!(
        read.starting_items[2],
        Some(StableId("classic.item.37".into()))
    );
    assert_eq!(
        read.starting_items[19],
        Some(StableId("classic.item.-17".into()))
    );
}

#[test]
fn maximum_spells_edits_the_real_native_field_without_inventing_missing_rows() {
    let source = vec![0xa5; CASTE_RECORD_BYTES * 30 + 5];
    let mut fields = read_caste_native_fields(&source, 21).unwrap();
    fields.maximum_spells_per_round = 3;
    let output = patch_caste_native_fields(&source, 21, &fields).unwrap();
    assert_eq!(
        differences(&source, &output),
        [20 * 576 + 446, 20 * 576 + 447]
    );
    assert_eq!(
        read_caste_native_fields(&output, 21)
            .unwrap()
            .maximum_spells_per_round,
        3
    );
    assert!(patch_caste_native_fields(&source[..20 * 576], 21, &fields).is_err());
    assert!(read_caste_native_fields(&source, 0).is_err());
    fields.maximum_spells_per_round = 32768;
    assert!(patch_caste_native_fields(&source, 21, &fields).is_err());
}

#[test]
fn native_item_slots_reject_noncanonical_and_zero_identities() {
    let source = vec![0; CASTE_RECORD_BYTES];
    let mut fields = read_caste_native_fields(&source, 1).unwrap();
    for identity in [
        "item.1",
        "classic.item.0",
        "classic.item.32768",
        "classic.item.01",
        "classic.item.+1",
    ] {
        fields.starting_items[0] = Some(StableId(identity.into()));
        assert!(patch_caste_native_fields(&source, 1, &fields).is_err());
    }
}
