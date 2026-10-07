use super::tests::{dungeon_map, land_map};
use super::*;

#[test]
fn lexical_snapshot_order_keeps_native_slots_and_raw_flags_in_both_families() {
    for kind in [LevelType::Land, LevelType::Dungeon] {
        let mut raw = vec![0xa5; RANDOM_LEVEL_RECORD_BYTES];
        raw.extend_from_slice(&[0xde, 0xad, 0xbe]);
        let mut runtime = decode_random_levels(&raw, kind, "source")
            .records
            .remove(0)
            .runtime;
        runtime
            .random_rectangles
            .sort_by_key(|r| r.identity.clone());
        let map = match kind {
            LevelType::Land => land_map(runtime),
            LevelType::Dungeon => dungeon_map(runtime),
        };
        assert_eq!(encode_random_levels(&[map], kind, Some(&raw)).unwrap(), raw);
    }
}

#[test]
fn unrelated_landlook_edit_preserves_every_other_byte() {
    let raw = vec![0xa5; RANDOM_LEVEL_RECORD_BYTES];
    let mut runtime = decode_land_random_levels(&raw).records.remove(0).runtime;
    runtime.landlook = Some(7);
    let output = encode_land_random_levels(&[land_map(runtime)], Some(&raw)).unwrap();
    let mut expected = raw;
    expected[RANDOM_LEVEL_LANDLOOK_OFFSET] = 7;
    assert_eq!(output, expected);
}

#[test]
fn duplicate_slot_is_rejected_even_when_imported_values_are_unchanged() {
    let raw = vec![0xa5; RANDOM_LEVEL_RECORD_BYTES];
    let mut runtime = decode_land_random_levels(&raw).records.remove(0).runtime;
    runtime
        .random_rectangles
        .push(runtime.random_rectangles[0].clone());
    assert!(matches!(
        encode_land_random_levels(&[land_map(runtime)], Some(&raw)),
        Err(RandomLevelCodecError::DuplicateRectangleSlot { .. })
    ));
}
